import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalCgroupJson,
  createContainedCgroupIdentity,
  sha256CgroupBytes,
} from "./contained-cgroup-evidence.mjs";
import {
  createContainedCgroupObserverDraft,
  createContainedCgroupObserverFailure,
  createContainedCgroupObserverReady,
} from "./contained-cgroup-observer.mjs";
import { createContainedCgroupQualificationCoordinator } from "./contained-cgroup-qualification-coordinator.mjs";
import type { ContainedCgroupObserverManifest } from "./contained-cgroup-observer-protocol.mjs";
import { UNQUALIFIED_AGGREGATE_LIMIT_MODE } from "./contained-qualified-rootless-receipt.mjs";

const root = process.cwd();
const invocationId = "1".repeat(64);
const finalContainerId = "2".repeat(64);
const sanitizedSpecSha256 = "3".repeat(64);
const intendedAggregateLimits = {
  cpuCount: 1,
  maxProcesses: 16,
  memoryBytes: 512 * 1024 * 1024,
};
const clean = {
  containerAbsent: true,
  imageRootfsAbsent: true,
  imageRootfsUnchanged: true,
  invocationAliasAbsent: true,
  persistedAuthorityVerified: true,
  readOnlyMountsUnchanged: true,
  snapshotAbsent: true,
  taskAbsent: true,
};
type QualificationPaths = {
  evidencePath: string;
  failurePath: string;
  finalizationPath: string;
  invocationRoot: string;
  manifestPath: string;
  observerDraftPath: string;
  observerReadyPath: string;
  qualificationRoot: string;
  sessionRoot: string;
};

function hashed<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
  };
}

function baseReceipt() {
  return hashed({
    schemaVersion: "5",
    status: "VALIDATED",
    limitMode: UNQUALIFIED_AGGREGATE_LIMIT_MODE,
    aggregateLimitIntentEnforced: false,
    invocationId,
    stagingContainerId: "4".repeat(64),
    finalContainerId,
    metadataSha256: "5".repeat(64),
    originalSpecSha256: "6".repeat(64),
    baseSpecSha256: "7".repeat(64),
    sanitizedSpecSha256,
    configFileSha256: "8".repeat(64),
    internalMountManifest: [],
    internalMountManifestSha256: "9".repeat(64),
    readOnlyMountManifest: [],
    readOnlyMountManifestSha256: "a".repeat(64),
    commandSha256: "b".repeat(64),
    imageAuthority: {},
    imageRootfs: {},
    removedFields: [],
    normalizedFields: [],
    removedMounts: [],
    intendedAggregateLimits,
    enforcedRlimits: [],
    aggregateLimitEvidence: null,
  });
}

function observation(observedAt = "2026-07-20T12:00:10.000Z") {
  const memberPids = [100, 101];
  return {
    observedLimits: {
      cpuPeriodMicros: 100_000,
      cpuQuotaMicros: 100_000,
      memoryMaxBytes: intendedAggregateLimits.memoryBytes,
      memorySwapMaxBytes: intendedAggregateLimits.memoryBytes,
      pidsMax: intendedAggregateLimits.maxProcesses,
    },
    membership: {
      descendantsObserved: true,
      leaderPid: 100,
      leaderStartTimeTicks: "12345",
      memberPids,
      memberSetSha256: sha256CgroupBytes(canonicalCgroupJson(memberPids)),
    },
    negativeControls: {
      cpu: {
        busyWindowMs: 500,
        enforced: true,
        nrThrottledAfter: 1,
        nrThrottledBefore: 0,
        throttledUsecAfter: 1,
        throttledUsecBefore: 0,
      },
      memory: {
        enforced: true,
        maxEventsAfter: 1,
        maxEventsBefore: 0,
        oomKillAfter: 0,
        oomKillBefore: 0,
        requestedBytes: intendedAggregateLimits.memoryBytes + 1,
      },
      processes: {
        attemptedProcesses: intendedAggregateLimits.maxProcesses + 1,
        enforced: true,
        maxEventsAfter: 1,
        maxEventsBefore: 0,
      },
    },
    observedAt,
  };
}

function aggregateEvidence(
  observerBindings: ReturnType<typeof fixture>["observerBindings"],
  finalizationPayloadSha256: string,
) {
  return hashed({
    schemaVersion: "3",
    status: "OBSERVED",
    authority: "linux-cgroup-v2",
    cgroupVersion: 2,
    cgroupId: `counterlab-v6.1-${invocationId}`,
    cgroupPath: `containerd/counterlab-v6.1-${invocationId}`,
    cgroupIdentity: createContainedCgroupIdentity({
      invocationId,
      finalContainerId,
      sanitizedSpecSha256,
    }),
    invocationId,
    finalContainerId,
    finalizationPayloadSha256,
    sanitizedSpecSha256,
    runtimeAttestationSha256: observerBindings.runtimeAttestationSha256,
    ...observation("2026-07-20T12:00:30.000Z"),
    cleanup: { cgroupAbsentAfterTimeout: true },
    observer: {
      driverCliSha256: observerBindings.driverCliSha256,
      driverModuleSha256: observerBindings.driverModuleSha256,
      runtimeSessionId: observerBindings.runtimeSessionId,
    },
  });
}

function writeArtifact(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
}

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  let rejectPromise!: (reason?: unknown) => void;
  let settled = false;
  const promise = new Promise<T>((accept, reject) => {
    resolvePromise = accept;
    rejectPromise = reject;
  });
  return {
    get settled() {
      return settled;
    },
    promise,
    reject(reason?: unknown) {
      settled = true;
      rejectPromise(reason);
    },
    resolve(value: T) {
      settled = true;
      resolvePromise(value);
    },
  };
}

function fixture() {
  const runtimeSessionId = `rt-coord-${randomBytes(4).toString("hex")}`;
  const sessionRoot = resolve(root, ".rt", runtimeSessionId);
  const specRoot = resolve(sessionRoot, "run/rootless-specs");
  mkdirSync(specRoot, { recursive: true, mode: 0o700 });
  const receipt = baseReceipt();
  const source = `${JSON.stringify(receipt, null, 2)}\n`;
  const baseReceiptPath = resolve(specRoot, `${finalContainerId}.receipt.json`);
  writeFileSync(baseReceiptPath, source, { flag: "wx", mode: 0o600 });
  return {
    input: {
      baseReceiptFileSha256: sha256CgroupBytes(source),
      baseReceiptPath,
      baseReceiptPayloadSha256: receipt.receiptPayloadSha256,
      finalContainerId,
      intendedAggregateLimits,
      invocationId,
      sanitizedSpecSha256,
      sessionRoot,
    },
    observerBindings: {
      cgroupParentPath: "containerd",
      driverCliSha256: "c".repeat(64),
      driverModuleSha256: "d".repeat(64),
      runtimeAttestationSha256: "e".repeat(64),
      runtimeSessionId,
    },
  };
}

function harness({
  keepRunningAfterCompletion = false,
  processPid = 321,
  readyPid = 321,
} = {}) {
  const value = fixture();
  const processCompletion = deferred<{
    code: number | null;
    error?: Error;
    outputExceeded: boolean;
    signal: NodeJS.Signals | null;
  }>();
  let captured:
    | {
        manifest: ContainedCgroupObserverManifest;
        paths: QualificationPaths;
      }
    | undefined;
  const terminations: NodeJS.Signals[] = [];
  let forcedStopped = false;
  const persisted: Array<Record<string, unknown>> = [];
  const verified: Array<Record<string, unknown>> = [];
  const times = [
    new Date("2026-07-20T12:00:00.000Z"),
    new Date("2026-07-20T12:00:20.000Z"),
  ];
  const qualified = {
    qualificationArtifacts: {},
    qualifiedReceipt: {},
    qualifiedReceiptFileSha256: "f".repeat(64),
    qualifiedReceiptPath: resolve(
      value.input.sessionRoot,
      `run/rootless-specs/${finalContainerId}.qualified-receipt.json`,
    ),
    qualifiedReceiptPayloadSha256: "0".repeat(64),
  };
  const coordinator = createContainedCgroupQualificationCoordinator({
    now: () => times.shift() ?? new Date("2026-07-20T12:00:20.000Z"),
    persistQualifiedReceipt: (input) => {
      persisted.push(input);
      return qualified;
    },
    resolveObserverBindings: () => value.observerBindings,
    sleep: async () => undefined,
    startObserver: ({ manifest, paths }) => {
      captured = { manifest, paths };
      writeArtifact(
        paths.observerReadyPath,
        createContainedCgroupObserverReady(manifest, {
          armedAt: new Date("2026-07-20T12:00:05.000Z"),
          observerPid: readyPid,
        }),
      );
      return {
        completion: processCompletion.promise,
        isRunning: () =>
          !forcedStopped &&
          (!processCompletion.settled || keepRunningAfterCompletion),
        pid: processPid,
        terminate: (signal: NodeJS.Signals) => {
          terminations.push(signal);
          forcedStopped = true;
          processCompletion.resolve({
            code: null,
            outputExceeded: false,
            signal,
          });
          return true;
        },
      };
    },
    verifyQualifiedReceipt: (input) => {
      verified.push(input);
      return {};
    },
  });
  return {
    coordinator,
    get captured() {
      if (captured === undefined) throw new Error("observer was not started");
      return captured;
    },
    persisted,
    processCompletion,
    qualified,
    terminations,
    value,
    verified,
  };
}

async function preparedHarness() {
  const value = harness();
  const handle = await value.coordinator.begin(value.value.input);
  const draft = createContainedCgroupObserverDraft(
    value.captured.manifest,
    observation(),
  );
  writeArtifact(value.captured.paths.observerDraftPath, draft);
  await value.coordinator.waitForDraft(handle);
  return { ...value, draft, handle };
}

describe("contained cgroup qualification coordinator", () => {
  it("orders readiness, draft, finalization, process exit, and persistence", async () => {
    const value = await preparedHarness();
    const completing = value.coordinator.complete(value.handle, {
      cleanup: clean,
      resultReleased: false,
      runtimeFailed: false,
      timeoutObserved: true,
    });
    const finalization = JSON.parse(
      readFileSync(value.captured.paths.finalizationPath, "utf8"),
    );
    expect(finalization.status).toBe("FINALIZE");
    expect(finalization.observerDraftPayloadSha256).toBe(
      value.draft.receiptPayloadSha256,
    );
    writeArtifact(
      value.captured.paths.evidencePath,
      aggregateEvidence(
        value.value.observerBindings,
        finalization.receiptPayloadSha256,
      ),
    );
    value.processCompletion.resolve({
      code: 0,
      outputExceeded: false,
      signal: null,
    });

    await expect(completing).resolves.toEqual(value.qualified);
    expect(value.persisted).toEqual([
      {
        baseReceiptFileSha256: value.value.input.baseReceiptFileSha256,
        baseReceiptPath: value.value.input.baseReceiptPath,
        finalContainerId,
        sessionRoot: value.value.input.sessionRoot,
      },
    ]);
    expect(value.verified).toHaveLength(1);
    expect(value.terminations).toEqual([]);
  });

  it("rejects a ready receipt from a different process", async () => {
    const value = harness({ readyPid: 322 });
    await expect(value.coordinator.begin(value.value.input)).rejects.toThrow(
      /readiness binding changed/u,
    );
    expect(value.terminations).toEqual(["SIGTERM"]);
    expect(value.persisted).toEqual([]);
  });

  it("terminates a partially invalid observer handle", async () => {
    const value = harness({ processPid: 0 });
    await expect(value.coordinator.begin(value.value.input)).rejects.toThrow(
      /observer start failed/u,
    );
    expect(value.terminations).toEqual(["SIGTERM"]);
    expect(value.persisted).toEqual([]);
  });

  it("rejects an observer that exits or rejects before readiness", async () => {
    const exited = harness();
    exited.processCompletion.resolve({
      code: 0,
      outputExceeded: false,
      signal: null,
    });
    await expect(exited.coordinator.begin(exited.value.input)).rejects.toThrow(
      /readiness|exited/u,
    );
    expect(exited.persisted).toEqual([]);

    const rejected = harness();
    rejected.processCompletion.reject(new Error("observer spawn failed"));
    await expect(
      rejected.coordinator.begin(rejected.value.input),
    ).rejects.toThrow(/readiness|exited/u);
    expect(rejected.persisted).toEqual([]);

    const rejectedButRunning = harness({
      keepRunningAfterCompletion: true,
    });
    rejectedButRunning.processCompletion.reject(
      new Error("observer completion channel failed"),
    );
    await expect(
      rejectedButRunning.coordinator.begin(rejectedButRunning.value.input),
    ).rejects.toThrow(/readiness|exited/u);
    expect(rejectedButRunning.terminations).toEqual(["SIGTERM"]);
  });

  it("terminates the observer when draft validation fails", async () => {
    const value = harness();
    const handle = await value.coordinator.begin(value.value.input);
    writeArtifact(value.captured.paths.observerDraftPath, {});
    await expect(value.coordinator.waitForDraft(handle)).rejects.toThrow(
      /draft/u,
    );
    expect(value.terminations).toEqual(["SIGTERM"]);
    expect(value.persisted).toEqual([]);
  });

  it("records an honest pre-draft abort after observer failure", async () => {
    const value = harness();
    const handle = await value.coordinator.begin(value.value.input);
    writeArtifact(
      value.captured.paths.failurePath,
      createContainedCgroupObserverFailure(value.captured.manifest, {
        failedAt: new Date("2026-07-20T12:00:10.000Z"),
      }),
    );
    value.processCompletion.resolve({
      code: 70,
      outputExceeded: false,
      signal: null,
    });
    await expect(value.coordinator.waitForDraft(handle)).rejects.toThrow(
      /observer failed/u,
    );
    await expect(
      value.coordinator.complete(handle, {
        cleanup: clean,
        resultReleased: false,
        runtimeFailed: true,
        timeoutObserved: false,
      }),
    ).rejects.toThrow(/OBSERVER_FAILED/u);
    const finalization = JSON.parse(
      readFileSync(value.captured.paths.finalizationPath, "utf8"),
    );
    expect(finalization).toMatchObject({
      abortCode: "OBSERVER_FAILED",
      observerDraftPayloadSha256: null,
      status: "ABORT",
    });
    expect(value.persisted).toEqual([]);
  });

  it.each([
    {
      expected: "TIMEOUT_NOT_OBSERVED",
      outcome: {
        cleanup: clean,
        resultReleased: false,
        runtimeFailed: false,
        timeoutObserved: false,
      },
    },
    {
      expected: "RESULT_RELEASED",
      outcome: {
        cleanup: clean,
        resultReleased: true,
        runtimeFailed: false,
        timeoutObserved: true,
      },
    },
    {
      expected: "CLEANUP_UNVERIFIED",
      outcome: {
        cleanup: { ...clean, snapshotAbsent: false },
        resultReleased: false,
        runtimeFailed: false,
        timeoutObserved: true,
      },
    },
  ])("fails closed with $expected", async ({ expected, outcome }) => {
    const value = await preparedHarness();
    await expect(
      value.coordinator.complete(value.handle, outcome),
    ).rejects.toThrow(expected);
    const finalization = JSON.parse(
      readFileSync(value.captured.paths.finalizationPath, "utf8"),
    );
    expect(finalization.abortCode).toBe(expected);
    expect(finalization.observerDraftPayloadSha256).toBe(
      value.draft.receiptPayloadSha256,
    );
    expect(value.persisted).toEqual([]);
  });

  it("rejects conflicting evidence and failure after observer exit", async () => {
    const value = await preparedHarness();
    const completing = value.coordinator.complete(value.handle, {
      cleanup: clean,
      resultReleased: false,
      runtimeFailed: false,
      timeoutObserved: true,
    });
    const finalization = JSON.parse(
      readFileSync(value.captured.paths.finalizationPath, "utf8"),
    );
    writeArtifact(
      value.captured.paths.evidencePath,
      aggregateEvidence(
        value.value.observerBindings,
        finalization.receiptPayloadSha256,
      ),
    );
    writeArtifact(
      value.captured.paths.failurePath,
      createContainedCgroupObserverFailure(value.captured.manifest, {
        failedAt: new Date("2026-07-20T12:00:30.000Z"),
      }),
    );
    value.processCompletion.resolve({
      code: 0,
      outputExceeded: false,
      signal: null,
    });

    await expect(completing).rejects.toThrow(/terminal outcome/u);
    expect(value.persisted).toEqual([]);
  });

  it("rejects missing evidence and a nonzero terminal exit", async () => {
    const missing = await preparedHarness();
    const missingCompletion = missing.coordinator.complete(missing.handle, {
      cleanup: clean,
      resultReleased: false,
      runtimeFailed: false,
      timeoutObserved: true,
    });
    missing.processCompletion.resolve({
      code: 0,
      outputExceeded: false,
      signal: null,
    });
    await expect(missingCompletion).rejects.toThrow(/terminal outcome/u);
    expect(missing.persisted).toEqual([]);

    const failed = await preparedHarness();
    const failedCompletion = failed.coordinator.complete(failed.handle, {
      cleanup: clean,
      resultReleased: false,
      runtimeFailed: false,
      timeoutObserved: true,
    });
    const finalization = JSON.parse(
      readFileSync(failed.captured.paths.finalizationPath, "utf8"),
    );
    writeArtifact(
      failed.captured.paths.evidencePath,
      aggregateEvidence(
        failed.value.observerBindings,
        finalization.receiptPayloadSha256,
      ),
    );
    failed.processCompletion.resolve({
      code: 70,
      outputExceeded: false,
      signal: null,
    });
    await expect(failedCompletion).rejects.toThrow(/observer failed/u);
    expect(failed.persisted).toEqual([]);
  });
});
