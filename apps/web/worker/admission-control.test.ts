import { describe, expect, it } from "vitest";

import {
  ADMISSION_POLICIES,
  ADMISSION_POLICY_VERSION,
  emptyAdmissionSnapshot,
  evaluateAdmissionRelease,
  evaluateAdmissionRequest,
  hmacAdmissionKey,
  trustedAdmissionCaller,
  type AdmissionKind,
  type AdmissionRequest,
  type AdmissionSnapshot,
} from "./admission-control";

function opaque(index: number, prefix = ""): string {
  return `${prefix}${index.toString(16)}`.padStart(64, "0").slice(-64);
}

function request(
  kind: AdmissionKind,
  index: number,
  overrides: Partial<AdmissionRequest> = {},
): AdmissionRequest {
  return {
    policyVersion: ADMISSION_POLICY_VERSION,
    kind,
    operationKey: opaque(index),
    callerKey: opaque(index + 10_000),
    ...(kind === "upload" ? {} : { sessionKey: opaque(index + 20_000) }),
    ...overrides,
  };
}

function admit(
  snapshot: AdmissionSnapshot,
  input: AdmissionRequest,
  now = 1_000_000,
) {
  return evaluateAdmissionRequest(snapshot, input, now);
}

describe("CounterLab admission policy", () => {
  it("deduplicates an active operation without granting a second dispatch lease", () => {
    const input = request("runner", 1);
    const first = admit(emptyAdmissionSnapshot(), input);
    expect(first.decision).toMatchObject({
      admitted: true,
      reused: false,
      leaseStatus: "acquired",
    });

    const duplicate = admit(first.snapshot, input, 1_000_001);
    expect(duplicate.decision).toMatchObject({
      admitted: true,
      reused: true,
      leaseStatus: "already-active",
    });
    expect(duplicate.snapshot.metrics.runner).toMatchObject({
      accepted: 1,
      reused: 1,
    });
  });

  it("enforces the upload caller burst budget with a recovery window", () => {
    const callerKey = opaque(999);
    let snapshot = emptyAdmissionSnapshot();
    for (
      let index = 0;
      index < ADMISSION_POLICIES.upload.callerLimit;
      index += 1
    ) {
      const result = admit(
        snapshot,
        request("upload", index + 1, { callerKey }),
      );
      expect(result.decision.admitted).toBe(true);
      snapshot = result.snapshot;
    }

    const denied = admit(snapshot, request("upload", 100, { callerKey }));
    expect(denied.decision).toEqual({
      admitted: false,
      reason: "CALLER_BUDGET",
      retryAfterSeconds: 600,
    });

    const recovered = admit(
      denied.snapshot,
      request("upload", 101, { callerKey }),
      1_000_000 + ADMISSION_POLICIES.upload.windowMs,
    );
    expect(recovered.decision.admitted).toBe(true);
  });

  it("enforces a per-session analyst budget across different callers", () => {
    const sessionKey = opaque(777);
    let snapshot = emptyAdmissionSnapshot();
    for (
      let index = 0;
      index < (ADMISSION_POLICIES.analyst.sessionLimit ?? 0);
      index += 1
    ) {
      const result = admit(
        snapshot,
        request("analyst", index + 1, {
          callerKey: opaque(index + 2_000),
          sessionKey,
        }),
      );
      snapshot = evaluateAdmissionRelease(
        result.snapshot,
        {
          policyVersion: ADMISSION_POLICY_VERSION,
          kind: "analyst",
          operationKey: request("analyst", index + 1).operationKey,
        },
        1_000_001,
      );
    }

    const denied = admit(
      snapshot,
      request("analyst", 100, { callerKey: opaque(9_999), sessionKey }),
    );
    expect(denied.decision).toMatchObject({
      admitted: false,
      reason: "SESSION_BUDGET",
    });
  });

  it("enforces the global upload budget across distinct callers", () => {
    let snapshot = emptyAdmissionSnapshot();
    for (
      let index = 0;
      index < ADMISSION_POLICIES.upload.globalLimit;
      index += 1
    ) {
      const result = admit(snapshot, request("upload", index + 1));
      expect(result.decision.admitted).toBe(true);
      snapshot = result.snapshot;
    }

    const denied = admit(snapshot, request("upload", 10_000));
    expect(denied.decision).toEqual({
      admitted: false,
      reason: "GLOBAL_BUDGET",
      retryAfterSeconds: 600,
    });
  });

  it("caps active runner leases below the Container instance ceiling", () => {
    expect(ADMISSION_POLICIES.runner.activeLimit).toBe(8);
    let snapshot = emptyAdmissionSnapshot();
    for (
      let index = 0;
      index < (ADMISSION_POLICIES.runner.activeLimit ?? 0);
      index += 1
    ) {
      const result = admit(snapshot, request("runner", index + 1));
      expect(result.decision.admitted).toBe(true);
      snapshot = result.snapshot;
    }

    const denied = admit(snapshot, request("runner", 100));
    expect(denied.decision).toMatchObject({
      admitted: false,
      reason: "GLOBAL_BUSY",
      retryAfterSeconds: 900,
    });
  });

  it("releases and reacquires an idempotent lease without charging twice", () => {
    const input = request("runner", 1);
    const first = admit(emptyAdmissionSnapshot(), input);
    const released = evaluateAdmissionRelease(
      first.snapshot,
      {
        policyVersion: ADMISSION_POLICY_VERSION,
        kind: "runner",
        operationKey: input.operationKey,
      },
      1_000_010,
    );
    const reacquired = admit(released, input, 1_000_020);
    expect(reacquired.decision).toMatchObject({
      admitted: true,
      reused: true,
      leaseStatus: "reacquired",
    });
    expect(reacquired.snapshot.metrics.runner).toMatchObject({
      accepted: 1,
      released: 1,
      reused: 1,
    });
  });

  it("fences reacquired upload leases from stale and generation-less releases", () => {
    const input = request("upload", 1);
    const first = admit(emptyAdmissionSnapshot(), input);
    expect(first.decision).toMatchObject({
      admitted: true,
      reused: false,
      leaseStatus: "acquired",
      leaseGeneration: 1,
    });
    const firstGeneration = first.decision.admitted
      ? first.decision.leaseGeneration
      : undefined;
    if (firstGeneration === undefined) {
      throw new Error("upload admission did not issue a fenced lease");
    }

    const released = evaluateAdmissionRelease(
      first.snapshot,
      {
        policyVersion: ADMISSION_POLICY_VERSION,
        kind: "upload",
        operationKey: input.operationKey,
        leaseGeneration: firstGeneration,
      },
      1_000_010,
    );
    const reacquired = admit(released, input, 1_000_020);
    expect(reacquired.decision).toMatchObject({
      admitted: true,
      reused: true,
      leaseStatus: "reacquired",
      leaseGeneration: 2,
    });

    const staleRelease = evaluateAdmissionRelease(
      reacquired.snapshot,
      {
        policyVersion: ADMISSION_POLICY_VERSION,
        kind: "upload",
        operationKey: input.operationKey,
        leaseGeneration: firstGeneration,
      },
      1_000_030,
    );
    const stillActive = admit(staleRelease, input, 1_000_040);
    expect(stillActive.decision).toMatchObject({
      admitted: true,
      reused: true,
      leaseStatus: "already-active",
      leaseGeneration: 2,
    });
    expect(staleRelease.metrics.upload.released).toBe(1);

    const generationlessRelease = evaluateAdmissionRelease(
      staleRelease,
      {
        policyVersion: ADMISSION_POLICY_VERSION,
        kind: "upload",
        operationKey: input.operationKey,
      },
      1_000_050,
    );
    expect(
      admit(generationlessRelease, input, 1_000_060).decision,
    ).toMatchObject({
      admitted: true,
      reused: true,
      leaseStatus: "already-active",
      leaseGeneration: 2,
    });
    expect(generationlessRelease.metrics.upload.released).toBe(1);

    const currentRelease = evaluateAdmissionRelease(
      generationlessRelease,
      {
        policyVersion: ADMISSION_POLICY_VERSION,
        kind: "upload",
        operationKey: input.operationKey,
        leaseGeneration: 2,
      },
      1_000_070,
    );
    expect(currentRelease.operations[input.operationKey]).not.toHaveProperty(
      "leaseExpiresAt",
    );
    expect(currentRelease.metrics.upload.released).toBe(2);
  });

  it("reclaims expired leases even if an alarm was delayed", () => {
    const input = request("analyst", 1);
    const first = admit(emptyAdmissionSnapshot(), input);
    const afterExpiry =
      1_000_000 + (ADMISSION_POLICIES.analyst.leaseTtlMs ?? 0) + 1;
    const reacquired = admit(first.snapshot, input, afterExpiry);
    expect(reacquired.decision).toMatchObject({
      admitted: true,
      reused: true,
      leaseStatus: "reacquired",
    });
  });

  it("fails closed on an operation-key collision", () => {
    const firstInput = request("runner", 1);
    const first = admit(emptyAdmissionSnapshot(), firstInput);
    const collision = admit(first.snapshot, {
      ...firstInput,
      callerKey: opaque(123_456),
    });
    expect(collision.decision).toEqual({
      admitted: false,
      reason: "OPERATION_COLLISION",
      retryAfterSeconds: 60,
    });
  });
});

describe("admission identity protection", () => {
  it("creates deterministic, scope-separated HMAC identities", async () => {
    const secret = "a-contained-test-secret-with-at-least-32-characters";
    const caller = await hmacAdmissionKey(secret, "caller", "203.0.113.8");
    expect(caller).toMatch(/^[a-f0-9]{64}$/u);
    expect(caller).not.toContain("203.0.113.8");
    await expect(
      hmacAdmissionKey(secret, "caller", "203.0.113.8"),
    ).resolves.toBe(caller);
    await expect(
      hmacAdmissionKey(secret, "session", "203.0.113.8"),
    ).resolves.not.toBe(caller);
    await expect(
      hmacAdmissionKey("too-short", "caller", "203.0.113.8"),
    ).rejects.toThrow("at least 32 characters");
  });

  it("ignores a spoofable address header outside the Cloudflare edge", () => {
    const untrusted = new Request("https://counterlab.test", {
      headers: { "cf-connecting-ip": "203.0.113.8" },
    });
    expect(trustedAdmissionCaller(untrusted)).toBe("anonymous-untrusted-edge");

    const trusted = new Request("https://counterlab.test", {
      headers: { "cf-connecting-ip": "203.0.113.8" },
    }) as Request & { cf?: unknown };
    trusted.cf = { colo: "TEST" };
    expect(trustedAdmissionCaller(trusted)).toBe("203.0.113.8");
  });
});
