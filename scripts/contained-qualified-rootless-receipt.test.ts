import { describe, expect, it } from "vitest";

import {
  QUALIFIED_AGGREGATE_LIMIT_MODE,
  canonicalCgroupJson,
  createContainedCgroupIdentity,
  sha256CgroupBytes,
} from "./contained-cgroup-evidence.mjs";
import {
  UNQUALIFIED_AGGREGATE_LIMIT_MODE,
  createQualifiedContainedRootlessReceipt,
} from "./contained-qualified-rootless-receipt.mjs";

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

function aggregateEvidence() {
  const memberPids = [100, 101];
  return hashed({
    schemaVersion: "2",
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
    finalizationPayloadSha256: "f".repeat(64),
    sanitizedSpecSha256,
    runtimeAttestationSha256: observerBindings.runtimeAttestationSha256,
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
    cleanup: { cgroupAbsentAfterTimeout: true },
    observer: {
      runtimeSessionId: observerBindings.runtimeSessionId,
      driverCliSha256: observerBindings.driverCliSha256,
      driverModuleSha256: observerBindings.driverModuleSha256,
    },
    observedAt: "2026-07-20T12:00:00.000Z",
  });
}

describe("qualified contained rootless receipt", () => {
  it("derives a new qualified receipt without mutating the conservative base", () => {
    const base = baseReceipt();
    const qualified = createQualifiedContainedRootlessReceipt({
      aggregateLimitEvidence: aggregateEvidence(),
      baseReceipt: base,
      observerBindings,
    });

    expect(base.limitMode).toBe(UNQUALIFIED_AGGREGATE_LIMIT_MODE);
    expect(base.aggregateLimitIntentEnforced).toBe(false);
    expect(base.aggregateLimitEvidence).toBeNull();
    expect(qualified.limitMode).toBe(QUALIFIED_AGGREGATE_LIMIT_MODE);
    expect(qualified.aggregateLimitIntentEnforced).toBe(true);
    expect(qualified.aggregateLimitEvidence).toEqual(aggregateEvidence());
    const { receiptPayloadSha256, ...payload } = qualified;
    expect(receiptPayloadSha256).toBe(
      sha256CgroupBytes(canonicalCgroupJson(payload)),
    );
  });

  it("rejects stale, already asserted, malformed, or unknown base receipts", () => {
    const mutations: Array<(value: ReturnType<typeof baseReceipt>) => void> = [
      (value) => {
        value.aggregateLimitIntentEnforced = true;
      },
      (value) => {
        (value as { limitMode: string }).limitMode =
          QUALIFIED_AGGREGATE_LIMIT_MODE;
      },
      (value) => {
        value.invocationId = "f".repeat(64);
      },
      (value) => {
        value.receiptPayloadSha256 = "0".repeat(64);
      },
    ];
    for (const mutate of mutations) {
      const changed = structuredClone(baseReceipt());
      mutate(changed);
      expect(() =>
        createQualifiedContainedRootlessReceipt({
          aggregateLimitEvidence: aggregateEvidence(),
          baseReceipt: changed,
          observerBindings,
        }),
      ).toThrow(/rootless receipt/u);
    }
    expect(() =>
      createQualifiedContainedRootlessReceipt({
        aggregateLimitEvidence: aggregateEvidence(),
        baseReceipt: { ...baseReceipt(), unknown: true },
        observerBindings,
      }),
    ).toThrow(/shape/u);
  });
});
