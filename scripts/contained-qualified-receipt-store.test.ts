import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
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
import {
  containedCgroupQualificationPaths,
  createContainedCgroupObserverFinalization,
  createContainedCgroupObserverManifest,
} from "./contained-cgroup-observer-protocol.mjs";
import {
  persistQualifiedContainedRootlessReceipt,
  verifyQualifiedContainedRootlessReceipt,
} from "./contained-qualified-receipt-store.mjs";
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
const observerBindings = {
  runtimeAttestationSha256: "4".repeat(64),
  runtimeSessionId: "rt-v61-test1",
  driverCliSha256: "5".repeat(64),
  driverModuleSha256: "6".repeat(64),
};
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

function hashed<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
  };
}

function baseReceipt() {
  return hashed({
    schemaVersion: "4",
    status: "VALIDATED",
    limitMode: UNQUALIFIED_AGGREGATE_LIMIT_MODE,
    aggregateLimitIntentEnforced: false,
    invocationId,
    stagingContainerId: "7".repeat(64),
    finalContainerId,
    metadataSha256: "8".repeat(64),
    originalSpecSha256: "9".repeat(64),
    baseSpecSha256: "a".repeat(64),
    sanitizedSpecSha256,
    configFileSha256: "b".repeat(64),
    internalMountManifest: [],
    internalMountManifestSha256: "c".repeat(64),
    readOnlyMountManifest: [],
    readOnlyMountManifestSha256: "d".repeat(64),
    commandSha256: "e".repeat(64),
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

function aggregateObservation(observedAt = "2026-07-20T12:00:00.000Z") {
  const memberPids = [100, 101];
  return {
    observedLimits: {
      memoryMaxBytes: intendedAggregateLimits.memoryBytes,
      memorySwapMaxBytes: intendedAggregateLimits.memoryBytes,
      pidsMax: intendedAggregateLimits.maxProcesses,
      cpuQuotaMicros: 100_000,
      cpuPeriodMicros: 100_000,
    },
    membership: {
      leaderPid: 100,
      leaderStartTimeTicks: "12345",
      memberPids,
      memberSetSha256: sha256CgroupBytes(canonicalCgroupJson(memberPids)),
      descendantsObserved: true,
    },
    negativeControls: {
      memory: {
        requestedBytes: intendedAggregateLimits.memoryBytes + 1,
        oomKillBefore: 0,
        oomKillAfter: 1,
        enforced: true,
      },
      processes: {
        attemptedProcesses: intendedAggregateLimits.maxProcesses + 1,
        maxEventsBefore: 0,
        maxEventsAfter: 1,
        enforced: true,
      },
      cpu: {
        busyWindowMs: 500,
        nrThrottledBefore: 0,
        nrThrottledAfter: 1,
        throttledUsecBefore: 0,
        throttledUsecAfter: 1,
        enforced: true,
      },
    },
    observedAt,
  };
}

function aggregateEvidence(
  bindings: typeof observerBindings,
  finalizationPayloadSha256: string,
  observedAt = "2026-07-20T12:00:20.000Z",
) {
  return hashed({
    schemaVersion: "2",
    status: "OBSERVED",
    authority: "linux-cgroup-v2",
    cgroupVersion: 2,
    cgroupId: `counterlab-v6.1-${invocationId}`,
    cgroupPath: `counterlab-v6.1-${invocationId}`,
    cgroupIdentity: createContainedCgroupIdentity({
      invocationId,
      finalContainerId,
      sanitizedSpecSha256,
    }),
    invocationId,
    finalContainerId,
    finalizationPayloadSha256,
    sanitizedSpecSha256,
    runtimeAttestationSha256: bindings.runtimeAttestationSha256,
    ...aggregateObservation(observedAt),
    cleanup: { cgroupAbsentAfterTimeout: true },
    observer: {
      runtimeSessionId: bindings.runtimeSessionId,
      driverCliSha256: bindings.driverCliSha256,
      driverModuleSha256: bindings.driverModuleSha256,
    },
  });
}

function writeArtifact(path: string, value: unknown) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
}

function fixture({ writeEvidence = true, writeFailure = false } = {}) {
  const runtimeSessionId = `rt-store-${randomBytes(4).toString("hex")}`;
  const parent = resolve(root, ".rt");
  mkdirSync(parent, { recursive: true, mode: 0o700 });
  const sessionRoot = resolve(parent, runtimeSessionId);
  mkdirSync(sessionRoot, { mode: 0o700 });
  const runRoot = resolve(sessionRoot, "run");
  const specRoot = resolve(runRoot, "rootless-specs");
  mkdirSync(specRoot, { recursive: true, mode: 0o700 });
  const baseReceiptPath = resolve(specRoot, `${finalContainerId}.receipt.json`);
  const base = baseReceipt();
  const source = `${JSON.stringify(base, null, 2)}\n`;
  writeFileSync(baseReceiptPath, source, { mode: 0o600, flag: "wx" });
  const liveObserverBindings = { ...observerBindings, runtimeSessionId };
  const paths = containedCgroupQualificationPaths({
    repositoryRoot: root,
    runtimeSessionId,
    invocationId,
  });
  mkdirSync(paths.invocationRoot, { recursive: true, mode: 0o700 });
  const manifest = createContainedCgroupObserverManifest({
    baseReceiptFileSha256: sha256CgroupBytes(source),
    baseReceiptPayloadSha256: base.receiptPayloadSha256,
    finalContainerId,
    intendedAggregateLimits,
    invocationId,
    observerBindings: liveObserverBindings,
    requestedAt: new Date("2026-07-20T11:59:50.000Z"),
    sanitizedSpecSha256,
  });
  const ready = createContainedCgroupObserverReady(manifest, {
    armedAt: new Date("2026-07-20T11:59:55.000Z"),
    observerPid: 123,
  });
  const draft = createContainedCgroupObserverDraft(
    manifest,
    aggregateObservation(),
  );
  if (typeof draft.receiptPayloadSha256 !== "string") {
    throw new Error("observer draft fixture hash is invalid");
  }
  const finalization = createContainedCgroupObserverFinalization(manifest, {
    cleanup: verifiedCleanup,
    cleanupVerified: true,
    decisionAt: new Date("2026-07-20T12:00:10.000Z"),
    observerDraftPayloadSha256: draft.receiptPayloadSha256,
    resultReleased: false,
    status: "FINALIZE",
    timeoutObserved: true,
  });
  if (typeof finalization.receiptPayloadSha256 !== "string") {
    throw new Error("observer finalization fixture hash is invalid");
  }
  const evidence = aggregateEvidence(
    liveObserverBindings,
    finalization.receiptPayloadSha256,
  );
  writeArtifact(paths.manifestPath, manifest);
  writeArtifact(paths.observerReadyPath, ready);
  writeArtifact(paths.observerDraftPath, draft);
  writeArtifact(paths.finalizationPath, finalization);
  if (writeEvidence) writeArtifact(paths.evidencePath, evidence);
  if (writeFailure) {
    writeArtifact(
      paths.failurePath,
      createContainedCgroupObserverFailure(manifest, {
        failedAt: new Date("2026-07-20T12:00:21.000Z"),
      }),
    );
  }
  return {
    baseReceiptFileSha256: sha256CgroupBytes(source),
    baseReceiptPath,
    evidence,
    finalization,
    observerBindings: liveObserverBindings,
    paths,
    sessionRoot,
  };
}

function dependencies(input: ReturnType<typeof fixture>) {
  return {
    now: () => Date.parse("2026-07-20T12:01:00.000Z"),
    resolveObserverBindings: () => input.observerBindings,
  };
}

describe("qualified rootless receipt store", () => {
  it("creates and verifies one distinct qualified receipt", () => {
    const input = fixture();
    const persisted = persistQualifiedContainedRootlessReceipt(
      {
        baseReceiptFileSha256: input.baseReceiptFileSha256,
        baseReceiptPath: input.baseReceiptPath,
        sessionRoot: input.sessionRoot,
        finalContainerId,
      },
      dependencies(input),
    );

    expect(persisted.qualifiedReceiptPath).toBe(
      resolve(
        input.sessionRoot,
        `run/rootless-specs/${finalContainerId}.qualified-receipt.json`,
      ),
    );
    expect(persisted.qualificationArtifacts.evidencePath).toBe(
      input.paths.evidencePath,
    );
    expect(persisted.qualificationArtifacts.finalizationPayloadSha256).toBe(
      input.finalization.receiptPayloadSha256,
    );
    expect(readFileSync(input.baseReceiptPath, "utf8")).toBe(
      `${JSON.stringify(baseReceipt(), null, 2)}\n`,
    );
    expect(() =>
      verifyQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: input.baseReceiptFileSha256,
          baseReceiptPath: input.baseReceiptPath,
          sessionRoot: input.sessionRoot,
          finalContainerId,
          qualifiedReceiptFileSha256: persisted.qualifiedReceiptFileSha256,
          qualifiedReceiptPath: persisted.qualifiedReceiptPath,
        },
        dependencies(input),
      ),
    ).not.toThrow();
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: input.baseReceiptFileSha256,
          baseReceiptPath: input.baseReceiptPath,
          sessionRoot: input.sessionRoot,
          finalContainerId,
        },
        dependencies(input),
      ),
    ).toThrow(/already exists/u);
  });

  it("rejects path, hash, and symbolic-link drift", () => {
    const wrongHash = fixture();
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptPath: wrongHash.baseReceiptPath,
          sessionRoot: wrongHash.sessionRoot,
          baseReceiptFileSha256: "0".repeat(64),
          finalContainerId,
        },
        dependencies(wrongHash),
      ),
    ).toThrow(/base receipt/u);

    const linked = fixture();
    const linkedPath = resolve(
      linked.sessionRoot,
      "run/rootless-specs/link.json",
    );
    symlinkSync(linked.baseReceiptPath, linkedPath);
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: linked.baseReceiptFileSha256,
          sessionRoot: linked.sessionRoot,
          baseReceiptPath: linkedPath,
          finalContainerId,
        },
        dependencies(linked),
      ),
    ).toThrow(/path/u);
  });

  it("rejects stale evidence and a resolver bound to another session", () => {
    const stale = fixture();
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: stale.baseReceiptFileSha256,
          baseReceiptPath: stale.baseReceiptPath,
          sessionRoot: stale.sessionRoot,
          finalContainerId,
        },
        {
          ...dependencies(stale),
          now: () => Date.parse("2026-07-20T12:06:00.001Z"),
        },
      ),
    ).toThrow(/stale/u);

    const mismatched = fixture();
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: mismatched.baseReceiptFileSha256,
          baseReceiptPath: mismatched.baseReceiptPath,
          sessionRoot: mismatched.sessionRoot,
          finalContainerId,
        },
        {
          ...dependencies(mismatched),
          resolveObserverBindings: () => ({
            ...mismatched.observerBindings,
            runtimeSessionId: "rt-v61-other1",
          }),
        },
      ),
    ).toThrow(/path input/u);
  });

  it("rejects caller-supplied evidence and conflicting terminal artifacts", () => {
    const callerEvidence = fixture();
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: callerEvidence.baseReceiptFileSha256,
          baseReceiptPath: callerEvidence.baseReceiptPath,
          sessionRoot: callerEvidence.sessionRoot,
          finalContainerId,
          aggregateLimitEvidence: callerEvidence.evidence,
        } as unknown as Parameters<
          typeof persistQualifiedContainedRootlessReceipt
        >[0],
        dependencies(callerEvidence),
      ),
    ).toThrow(/caller evidence is forbidden/u);

    const conflict = fixture({ writeFailure: true });
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: conflict.baseReceiptFileSha256,
          baseReceiptPath: conflict.baseReceiptPath,
          sessionRoot: conflict.sessionRoot,
          finalContainerId,
        },
        dependencies(conflict),
      ),
    ).toThrow(/observation failed/u);
  });

  it("rejects missing evidence and evidence that diverges from the draft", () => {
    const missing = fixture({ writeEvidence: false });
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: missing.baseReceiptFileSha256,
          baseReceiptPath: missing.baseReceiptPath,
          sessionRoot: missing.sessionRoot,
          finalContainerId,
        },
        dependencies(missing),
      ),
    ).toThrow();

    const changed = fixture();
    const changedEvidence = aggregateEvidence(
      changed.observerBindings,
      changed.finalization.receiptPayloadSha256,
    );
    changedEvidence.membership.memberPids = [100, 102];
    changedEvidence.membership.memberSetSha256 = sha256CgroupBytes(
      canonicalCgroupJson(changedEvidence.membership.memberPids),
    );
    const { receiptPayloadSha256: ignored, ...payload } = changedEvidence;
    writeFileSync(
      changed.paths.evidencePath,
      `${JSON.stringify(hashed(payload), null, 2)}\n`,
      { mode: 0o600 },
    );
    expect(() =>
      persistQualifiedContainedRootlessReceipt(
        {
          baseReceiptFileSha256: changed.baseReceiptFileSha256,
          baseReceiptPath: changed.baseReceiptPath,
          sessionRoot: changed.sessionRoot,
          finalContainerId,
        },
        dependencies(changed),
      ),
    ).toThrow(/observation chain changed/u);
  });
});
