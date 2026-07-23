import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  containedCgroupQualificationPaths,
  createContainedCgroupObserverFinalization,
  createContainedCgroupObserverManifest,
  validateContainedCgroupObserverFinalization,
  validateContainedCgroupObserverManifest,
} from "./contained-cgroup-observer-protocol.mjs";

const root = process.cwd();
const runtimeSessionId = "rt-v61-test1";
const invocationId = "1".repeat(64);
const finalContainerId = "2".repeat(64);
const sanitizedSpecSha256 = "3".repeat(64);
const requestedAt = new Date("2026-07-20T01:02:03.000Z");
const verifiedCleanup = {
  taskAbsent: true,
  containerAbsent: true,
  snapshotAbsent: true,
  invocationAliasAbsent: true,
  imageRootfsAbsent: true,
  persistedAuthorityVerified: true,
  readOnlyMountsUnchanged: true,
  imageRootfsUnchanged: true,
};

function manifest(
  cgroupParentPath: "" | "containerd" = "containerd",
  memoryBytes = 512 * 1024 * 1024,
) {
  return createContainedCgroupObserverManifest({
    baseReceiptFileSha256: "4".repeat(64),
    baseReceiptPayloadSha256: "5".repeat(64),
    finalContainerId,
    intendedAggregateLimits: {
      cpuCount: 1,
      maxProcesses: 16,
      memoryBytes,
    },
    invocationId,
    observerBindings: {
      cgroupParentPath,
      runtimeSessionId,
      runtimeAttestationSha256: "6".repeat(64),
      driverCliSha256: "7".repeat(64),
      driverModuleSha256: "8".repeat(64),
    },
    requestedAt,
    sanitizedSpecSha256,
  });
}

describe("contained cgroup observer protocol", () => {
  it("creates a source-, session-, base-receipt-, and cgroup-bound request", () => {
    const value = manifest();

    expect(
      validateContainedCgroupObserverManifest(value, {
        observedAtMs: requestedAt.getTime(),
      }),
    ).toEqual(value);
    expect(value.baseReceiptPath).toBe(
      `.rt/${runtimeSessionId}/run/rootless-specs/${finalContainerId}.receipt.json`,
    );
    expect(value.cgroupPath).toBe(`containerd/counterlab-v6.1-${invocationId}`);
    expect(manifest("").cgroupPath).toBe(`counterlab-v6.1-${invocationId}`);
    expect(value.receiptPayloadSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("accepts the hosted 4 GiB aggregate and rejects any larger request", () => {
    expect(() =>
      validateContainedCgroupObserverManifest(
        manifest("containerd", 4 * 1024 * 1024 * 1024),
        { observedAtMs: requestedAt.getTime() },
      ),
    ).not.toThrow();
    expect(() => manifest("containerd", 4 * 1024 * 1024 * 1024 + 1)).toThrow(
      /aggregate intent/u,
    );
  });

  it("rejects unknown, stale, and drifted requests", () => {
    const mutations: Array<(value: ReturnType<typeof manifest>) => void> = [
      (value) => {
        value.finalContainerId = "9".repeat(64);
      },
      (value) => {
        value.baseReceiptPath = ".rt/escaped/receipt.json";
      },
      (value) => {
        value.cgroupPath = `counterlab-v6.1-${invocationId}`;
      },
      (value) => {
        value.intendedAggregateLimits.memoryBytes += 1;
      },
      (value) => {
        value.driverCliSha256 = "a".repeat(64);
      },
      (value) => {
        value.receiptPayloadSha256 = "b".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(manifest());
      mutate(changed);
      expect(() =>
        validateContainedCgroupObserverManifest(changed, {
          observedAtMs: requestedAt.getTime(),
        }),
      ).toThrow(/observer manifest/u);
    }
    expect(() =>
      validateContainedCgroupObserverManifest(
        { ...manifest(), unknown: true },
        { observedAtMs: requestedAt.getTime() },
      ),
    ).toThrow(/shape/u);
    expect(() =>
      validateContainedCgroupObserverManifest(manifest(), {
        observedAtMs: requestedAt.getTime() + 5 * 60_000 + 1,
      }),
    ).toThrow(/binding/u);
  });

  it("accepts only self-bound runtime finalization or an explicit abort", () => {
    const input = manifest();
    const finalizedAt = new Date(requestedAt.getTime() + 30_000);
    const finalized = createContainedCgroupObserverFinalization(input, {
      cleanup: verifiedCleanup,
      cleanupVerified: true,
      decisionAt: finalizedAt,
      observerDraftPayloadSha256: "a".repeat(64),
      resultReleased: false,
      status: "FINALIZE",
      timeoutObserved: true,
    });
    expect(
      validateContainedCgroupObserverFinalization(finalized, input, {
        observedAtMs: finalizedAt.getTime(),
      }),
    ).toEqual(finalized);

    const aborted = createContainedCgroupObserverFinalization(input, {
      abortCode: "TIMEOUT_NOT_OBSERVED",
      cleanup: { ...verifiedCleanup, taskAbsent: false },
      cleanupVerified: false,
      decisionAt: finalizedAt,
      observerDraftPayloadSha256: "a".repeat(64),
      resultReleased: false,
      status: "ABORT",
      timeoutObserved: false,
    });
    expect(
      validateContainedCgroupObserverFinalization(aborted, input, {
        observedAtMs: finalizedAt.getTime(),
      }),
    ).toEqual(aborted);

    const failClosedAbort = createContainedCgroupObserverFinalization(input, {
      abortCode: "RUNTIME_FAILED",
      cleanup: verifiedCleanup,
      cleanupVerified: true,
      decisionAt: finalizedAt,
      observerDraftPayloadSha256: "a".repeat(64),
      resultReleased: false,
      status: "ABORT",
      timeoutObserved: true,
    });
    expect(
      validateContainedCgroupObserverFinalization(failClosedAbort, input, {
        observedAtMs: finalizedAt.getTime(),
      }),
    ).toEqual(failClosedAbort);

    const preDraftAbort = createContainedCgroupObserverFinalization(input, {
      abortCode: "OBSERVER_FAILED",
      cleanup: verifiedCleanup,
      cleanupVerified: true,
      decisionAt: finalizedAt,
      observerDraftPayloadSha256: null,
      resultReleased: false,
      status: "ABORT",
      timeoutObserved: false,
    });
    expect(
      validateContainedCgroupObserverFinalization(preDraftAbort, input, {
        observedAtMs: finalizedAt.getTime(),
      }),
    ).toEqual(preDraftAbort);

    const mutations = [
      { ...finalized, resultReleased: true },
      { ...finalized, cleanupVerified: false },
      { ...finalized, timeoutObserved: false },
      {
        ...finalized,
        cleanup: { ...finalized.cleanup, snapshotAbsent: false },
      },
      { ...finalized, receiptPayloadSha256: "0".repeat(64) },
      { ...finalized, observerDraftPayloadSha256: "0" },
      { ...finalized, observerDraftPayloadSha256: null },
      { ...aborted, observerDraftPayloadSha256: "0" },
      { ...aborted, status: "FINALIZE" },
      { ...aborted, abortCode: "UNKNOWN" },
    ];
    for (const changed of mutations) {
      expect(() =>
        validateContainedCgroupObserverFinalization(changed, input, {
          observedAtMs: finalizedAt.getTime(),
        }),
      ).toThrow(/finalization binding/u);
    }
    expect(() =>
      validateContainedCgroupObserverFinalization(
        finalized,
        { ...input, invocationId: "9".repeat(64) },
        { observedAtMs: finalizedAt.getTime() },
      ),
    ).toThrow(/finalization binding/u);
  });

  it("derives only exact repository-contained handshake paths", () => {
    expect(
      containedCgroupQualificationPaths({
        repositoryRoot: root,
        runtimeSessionId,
        invocationId,
      }),
    ).toEqual({
      sessionRoot: resolve(root, ".rt", runtimeSessionId),
      qualificationRoot: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
      ),
      invocationRoot: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
      ),
      manifestPath: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
        "manifest.json",
      ),
      observerReadyPath: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
        "observer-ready.json",
      ),
      observerDraftPath: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
        "observer-draft.json",
      ),
      finalizationPath: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
        "finalization.json",
      ),
      evidencePath: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
        "aggregate-evidence.json",
      ),
      failurePath: resolve(
        root,
        ".rt",
        runtimeSessionId,
        "run/cgroup-qualification",
        invocationId,
        "failure.json",
      ),
    });
    expect(() =>
      containedCgroupQualificationPaths({
        repositoryRoot: resolve(root, ".rt", ".."),
        runtimeSessionId: "bad",
        invocationId,
      }),
    ).toThrow(/path input/u);
  });
});
