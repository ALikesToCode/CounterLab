import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  COMPAT_STOP_TARGET,
  createHistoricalRecoveryReceipt,
  createLegacyRuntimeRequest,
  executeCompatRecoveryProtocol,
  validateCompatTarget,
  validateLegacyRuntimeResponse,
} from "./stop-contained-runtime-v3-compat.mjs";
import {
  canonicalSupervisorJson,
  sha256SupervisorBytes,
  validateRuntimeDrainReceipt,
} from "./contained-runtime-supervisor-protocol.mjs";

const root = process.cwd();

function repositoryScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return repositoryScriptFiles(path);
    return /\.(?:json|mjs|py|sh|ts)$/u.test(entry.name) ? [path] : [];
  });
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function hashed<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    receiptPayloadSha256: sha256SupervisorBytes(
      canonicalSupervisorJson(payload),
    ),
  };
}

function attestation() {
  return {
    sessionId: COMPAT_STOP_TARGET.sessionId,
    pids: {
      supervisor: 101,
      containerdRootlesskit: 102,
      buildkitRootlesskit: 103,
    },
  };
}

function emptyInventory() {
  return {
    count: 0,
    entriesSha256: sha256SupervisorBytes(""),
    empty: true,
  };
}

function drainReceipt(attestationSha256: string) {
  const empty = emptyInventory();
  return hashed({
    schemaVersion: "2",
    status: "DRAINED",
    sessionId: COMPAT_STOP_TARGET.sessionId,
    namespace: "counterlab-v6.1",
    attestationSha256,
    tasks: empty,
    containers: empty,
    snapshots: {
      count: 2,
      entriesSha256: "b".repeat(64),
      ownedTransientEmpty: true,
    },
    invocationAliases: empty,
    runcState: empty,
    clientFifos: empty,
    persistedSpecs: {
      count: 2,
      entriesSha256: "c".repeat(64),
      verified: true,
    },
    drainedAt: "2026-07-21T00:00:00.000Z",
  });
}

function supervisorTransition(
  status: "DRAINING" | "STOPPED",
  attestationSha256: string,
  receipt?: ReturnType<typeof drainReceipt>,
) {
  const base = {
    schemaVersion: "1",
    status,
    sessionId: COMPAT_STOP_TARGET.sessionId,
    namespace: "counterlab-v6.1",
    state: status,
    supervisorPid: 101,
    childPids: {
      containerdRootlesskit: 102,
      buildkitRootlesskit: 103,
    },
    childHandlesOwned: true,
    buildkitAdmissionOpen: false,
    activeBuildkitConnections: 0,
    attestationSha256,
  };
  if (status === "DRAINING") return base;
  return {
    ...base,
    childExits: {
      containerdRootlesskit: { code: 0, signal: null },
      buildkitRootlesskit: { code: null, signal: "SIGTERM" },
    },
    drainReceiptSha256: sha256SupervisorBytes(canonicalSupervisorJson(receipt)),
  };
}

function protocolHarness(options?: {
  mutateReceipt?: (value: ReturnType<typeof drainReceipt>) => unknown;
  postDrainExitCode?: number;
  postDrainMessage?: string;
  shutdownAttestationSha256?: string;
  beginSupervisorPid?: number;
  closureResult?: boolean;
  readAttestationBytes?: Buffer;
  invalidChildExit?: boolean;
}) {
  const attestationBytes = Buffer.from("pinned-attestation");
  const attestationSha256 = sha256(attestationBytes);
  const receipt = drainReceipt(attestationSha256);
  const calls: string[] = [];
  const requestSupervisor = vi.fn(async ({ request }) => {
    calls.push(`supervisor:${request.action}`);
    if (request.action === "begin-drain") {
      return {
        ...supervisorTransition("DRAINING", attestationSha256),
        supervisorPid: options?.beginSupervisorPid ?? 101,
      };
    }
    const response = supervisorTransition(
      "STOPPED",
      options?.shutdownAttestationSha256 ?? attestationSha256,
      receipt,
    );
    if (options?.invalidChildExit) {
      return {
        ...response,
        childExits: {
          containerdRootlesskit: { code: null, signal: null },
          buildkitRootlesskit: { code: 0, signal: null },
        },
      };
    }
    return response;
  });
  const requestRuntime = vi.fn(async ({ args }) => {
    calls.push(`runtime:${args[0]}`);
    if (args[0] === "counterlab-drain") {
      return {
        exitCode: 0,
        stdout: Buffer.from(
          JSON.stringify(options?.mutateReceipt?.(receipt) ?? receipt),
        ),
        stderr: Buffer.alloc(0),
      };
    }
    return {
      exitCode: options?.postDrainExitCode ?? 1,
      stdout: Buffer.alloc(0),
      stderr: Buffer.from(
        options?.postDrainMessage ?? "contained runtime is drained",
      ),
    };
  });
  const waitForClosure = vi.fn(async () => {
    calls.push("closure");
    return options?.closureResult ?? true;
  });
  const resolved = {
    runtimeSupervisorSocket: "supervisor.sock",
    runtimeCommandSocket: "runtime.sock",
    buildkitSocket: "buildkit.sock",
  };
  return {
    attestationBytes,
    attestationSha256,
    calls,
    receipt,
    readAttestationBytes: options?.readAttestationBytes,
    requestRuntime,
    requestSupervisor,
    resolved,
    waitForClosure,
  };
}

describe("target-locked historical runtime recovery", () => {
  it("pins the exact preserved runtime identity without a CI runtime fixture", () => {
    expect(COMPAT_STOP_TARGET).toMatchObject({
      sessionId: "rt-release721",
      attestationSha256:
        "2f12fe8f9db649f0564238a4569da9e98f5b8e31f085daec14f93538ba9d4569",
      historicalBundleCommit: "85c5652afc75230a28209883153814ca6cb64c36",
      supervisorReadySha256:
        "7446f013639a75c85d59ecb0a39ffa0983fa3d70b9d0623d570e87284462d2c0",
    });
  });

  it("rejects every session or attestation other than the pinned target", () => {
    expect(() =>
      validateCompatTarget(
        COMPAT_STOP_TARGET.sessionId,
        COMPAT_STOP_TARGET.attestationSha256,
      ),
    ).not.toThrow();
    expect(() =>
      validateCompatTarget("rt-other123", COMPAT_STOP_TARGET.attestationSha256),
    ).toThrow(/not allowlisted/u);
    expect(() =>
      validateCompatTarget(COMPAT_STOP_TARGET.sessionId, "a".repeat(64)),
    ).toThrow(/not allowlisted/u);
  });

  it("sends only the historical v1 envelope", () => {
    const request = createLegacyRuntimeRequest([
      "counterlab-drain",
      COMPAT_STOP_TARGET.attestationSha256,
    ]);
    expect(JSON.parse(request)).toEqual({
      schemaVersion: "1",
      args: ["counterlab-drain", COMPAT_STOP_TARGET.attestationSha256],
      stdinBase64: "",
    });
    expect(request).not.toContain("qualificationMode");
  });

  it("rejects malformed and non-canonical legacy responses", () => {
    expect(() =>
      validateLegacyRuntimeResponse({
        schemaVersion: "1",
        exitCode: 0,
        stdoutBase64: "not base64",
        stderrBase64: "",
      }),
    ).toThrow(/base64/u);
    expect(() =>
      validateLegacyRuntimeResponse({
        schemaVersion: "1",
        exitCode: 0,
        stdoutBase64: "YQ===",
        stderrBase64: "",
      }),
    ).toThrow(/base64/u);
  });

  it("executes drain, admission rejection, shutdown, and closure in order", async () => {
    const harness = protocolHarness();
    const result = await executeCompatRecoveryProtocol({
      attestation: attestation(),
      attestationPath: "attestation.json",
      attestationSha256: harness.attestationSha256,
      resolved: harness.resolved,
      requestSupervisor: harness.requestSupervisor,
      requestRuntime: harness.requestRuntime,
      waitForClosure: harness.waitForClosure,
      readAttestation: () => harness.attestationBytes,
      validateDrainReceipt: validateRuntimeDrainReceipt,
    });
    expect(result.drainReceipt).toEqual(harness.receipt);
    expect(harness.calls).toEqual([
      "supervisor:begin-drain",
      "runtime:counterlab-drain",
      "runtime:version",
      "supervisor:shutdown",
      "closure",
    ]);
    expect(harness.waitForClosure).toHaveBeenCalledWith([
      "runtime.sock",
      "buildkit.sock",
      "supervisor.sock",
    ]);
  });

  it("blocks shutdown when drain evidence is nonempty or tampered", async () => {
    const harness = protocolHarness({
      mutateReceipt: (value) => ({
        ...value,
        tasks: {
          count: 1,
          entriesSha256: "d".repeat(64),
          empty: false,
        },
      }),
    });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: harness.attestationSha256,
        resolved: harness.resolved,
        requestSupervisor: harness.requestSupervisor,
        requestRuntime: harness.requestRuntime,
        waitForClosure: harness.waitForClosure,
        readAttestation: () => harness.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/task inventory|hash/u);
    expect(harness.calls).not.toContain("supervisor:shutdown");
  });

  it("blocks shutdown if commands remain admitted after drain", async () => {
    const harness = protocolHarness({ postDrainExitCode: 0 });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: harness.attestationSha256,
        resolved: harness.resolved,
        requestSupervisor: harness.requestSupervisor,
        requestRuntime: harness.requestRuntime,
        waitForClosure: harness.waitForClosure,
        readAttestation: () => harness.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/admitted a command/u);
    expect(harness.calls).not.toContain("supervisor:shutdown");
  });

  it("blocks shutdown when the supervisor identity is mismatched", async () => {
    const harness = protocolHarness({ beginSupervisorPid: 999 });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: harness.attestationSha256,
        resolved: harness.resolved,
        requestSupervisor: harness.requestSupervisor,
        requestRuntime: harness.requestRuntime,
        waitForClosure: harness.waitForClosure,
        readAttestation: () => harness.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/transition/u);
    expect(harness.calls).toEqual(["supervisor:begin-drain"]);
  });

  it("blocks shutdown when the drain rejection text is not exact", async () => {
    const harness = protocolHarness({ postDrainMessage: "generic failure" });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: harness.attestationSha256,
        resolved: harness.resolved,
        requestSupervisor: harness.requestSupervisor,
        requestRuntime: harness.requestRuntime,
        waitForClosure: harness.waitForClosure,
        readAttestation: () => harness.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/admitted a command/u);
    expect(harness.calls).not.toContain("supervisor:shutdown");
  });

  it("blocks shutdown when the attestation changes after drain", async () => {
    const harness = protocolHarness({
      readAttestationBytes: Buffer.from("changed-attestation"),
    });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: harness.attestationSha256,
        resolved: harness.resolved,
        requestSupervisor: harness.requestSupervisor,
        requestRuntime: harness.requestRuntime,
        waitForClosure: harness.waitForClosure,
        readAttestation: () =>
          harness.readAttestationBytes ?? harness.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/attestation changed/u);
    expect(harness.calls).not.toContain("supervisor:shutdown");
  });

  it("writes no success path after a mismatched shutdown response", async () => {
    const harness = protocolHarness({
      shutdownAttestationSha256: "f".repeat(64),
    });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: harness.attestationSha256,
        resolved: harness.resolved,
        requestSupervisor: harness.requestSupervisor,
        requestRuntime: harness.requestRuntime,
        waitForClosure: harness.waitForClosure,
        readAttestation: () => harness.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/shutdown binding/u);
    expect(harness.waitForClosure).not.toHaveBeenCalled();
  });

  it("rejects malformed child exits and endpoints that remain reachable", async () => {
    const invalidExit = protocolHarness({ invalidChildExit: true });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: invalidExit.attestationSha256,
        resolved: invalidExit.resolved,
        requestSupervisor: invalidExit.requestSupervisor,
        requestRuntime: invalidExit.requestRuntime,
        waitForClosure: invalidExit.waitForClosure,
        readAttestation: () => invalidExit.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/child exit/u);
    expect(invalidExit.waitForClosure).not.toHaveBeenCalled();

    const openEndpoint = protocolHarness({ closureResult: false });
    await expect(
      executeCompatRecoveryProtocol({
        attestation: attestation(),
        attestationPath: "attestation.json",
        attestationSha256: openEndpoint.attestationSha256,
        resolved: openEndpoint.resolved,
        requestSupervisor: openEndpoint.requestSupervisor,
        requestRuntime: openEndpoint.requestRuntime,
        waitForClosure: openEndpoint.waitForClosure,
        readAttestation: () => openEndpoint.attestationBytes,
        validateDrainReceipt: validateRuntimeDrainReceipt,
      }),
    ).rejects.toThrow(/endpoint remained reachable/u);
  });

  it("is non-destructive and cannot create release qualification evidence", () => {
    const source = readFileSync(
      resolve(root, "scripts/stop-contained-runtime-v3-compat.mjs"),
      "utf8",
    );
    expect(source).not.toMatch(
      /(?:\/proc(?:\/|\b)|\/sys(?:\/|\b)|process\.kill|SIGKILL|unlink|rmdir|rmSync|shutil\.rmtree)/u,
    );
    expect(source).not.toContain("safe-stop-receipt.json");
    expect(source).toContain('"historical-recovery-receipt.json"');
    expect(source).toContain("qualificationEligible: false");
    expect(source).toContain("releaseQualification: false");
    expect(source).toContain('status: "RECOVERY_STOPPED"');
    expect(source).toContain('"/usr/bin/flock"');
    expect(source).toContain("validateCurrentStopPrimitives(attestation)");
    expect(source).toContain(
      'await import("./contained-runtime-supervisor-protocol.mjs")',
    );
    expect(
      source.indexOf("validateCurrentStopPrimitives(attestation)"),
    ).toBeLessThan(
      source.indexOf(
        'await import("./contained-runtime-supervisor-protocol.mjs")',
      ),
    );
    expect(source).toContain(
      "await validateInstalledToolchain(resolved.installRoot, historicalLock)",
    );
    const processExecutables = [
      ...source.matchAll(/(?:execFileSync|spawnSync)\(\s*"([^"]+)"/gu),
    ].map((match) => match[1]);
    expect(new Set(processExecutables)).toEqual(
      new Set(["/usr/bin/git", "/usr/bin/flock"]),
    );
    expect(source).not.toMatch(/(?:\/bin\/rm|\/usr\/bin\/find|find -delete)/u);
    expect(
      source.lastIndexOf("validatePreLockIdentity(process.argv.slice(2))"),
    ).toBeLessThan(source.lastIndexOf("runWithRepositoryLock();"));
    expect(source).toContain("assertRepositoryLockHeld()");

    const recoveryConsumers = repositoryScriptFiles(
      resolve(root, "scripts"),
    ).filter(
      (path) =>
        !path.includes("stop-contained-runtime-v3-compat") &&
        !path.endsWith("contained-runtime-stop-compat.test.ts") &&
        readFileSync(path, "utf8").includes("historical-recovery-receipt.json"),
    );
    expect(recoveryConsumers).toEqual([]);
  });

  it("constructs a recovery receipt that is semantically ineligible", () => {
    const harness = protocolHarness();
    const value = attestation();
    const shutdown = supervisorTransition(
      "STOPPED",
      harness.attestationSha256,
      harness.receipt,
    );
    const receipt = createHistoricalRecoveryReceipt({
      attestation: {
        ...value,
        runtimeToolchainSha256: "e".repeat(64),
      },
      attestationSha256: harness.attestationSha256,
      compatStopHelperSha256: "f".repeat(64),
      drainReceipt: harness.receipt,
      shutdown,
      sessionDirectoryPreserved: true,
      stoppedAt: "2026-07-21T00:00:00.000Z",
    });
    expect(receipt).toMatchObject({
      status: "RECOVERY_STOPPED",
      purpose: "historical-runtime-recovery",
      qualificationEligible: false,
      releaseQualification: false,
    });
    const qualificationView: {
      status: string;
      releaseQualification: boolean;
    } = receipt;
    expect(
      qualificationView.status === "STOPPED" &&
        qualificationView.releaseQualification,
    ).toBe(false);
  });
});
