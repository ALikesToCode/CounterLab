import { describe, expect, it } from "vitest";

import {
  QUALIFIED_AGGREGATE_LIMIT_MODE,
  canonicalCgroupJson,
  createContainedCgroupIdentity,
  sha256CgroupBytes,
  validateContainedCgroupEvidence,
} from "./contained-cgroup-evidence.mjs";

const invocationId = "1".repeat(64);
const finalContainerId = "2".repeat(64);
const sanitizedSpecSha256 = "3".repeat(64);
const intendedAggregateLimits = {
  cpuCount: 1,
  maxProcesses: 16,
  memoryBytes: 512 * 1024 * 1024,
};

function evidence() {
  const memberPids = [100, 101];
  const payload = {
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
    finalizationPayloadSha256: "f".repeat(64),
    sanitizedSpecSha256,
    runtimeAttestationSha256: "4".repeat(64),
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
        requestedBytes: intendedAggregateLimits.memoryBytes + 64 * 1024 * 1024,
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
      runtimeSessionId: "rt-v61-test1",
      driverCliSha256: "5".repeat(64),
      driverModuleSha256: "6".repeat(64),
    },
    observedAt: "2026-07-20T12:00:00.000Z",
  };
  return {
    ...payload,
    receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
  };
}

function expected() {
  return {
    invocationId,
    finalContainerId,
    sanitizedSpecSha256,
    intendedAggregateLimits,
    runtimeAttestationSha256: "4".repeat(64),
    runtimeSessionId: "rt-v61-test1",
    driverCliSha256: "5".repeat(64),
    driverModuleSha256: "6".repeat(64),
  };
}

describe("contained cgroup evidence", () => {
  it("accepts only the qualified aggregate limit mode and complete evidence", () => {
    expect(QUALIFIED_AGGREGATE_LIMIT_MODE).toBe(
      "container-cgroup-and-process-rlimit",
    );
    expect(validateContainedCgroupEvidence(evidence(), expected())).toEqual(
      evidence(),
    );
  });

  it("rejects identity, limit, membership, counter, cleanup, and hash drift", () => {
    const mutations: Array<(value: ReturnType<typeof evidence>) => void> = [
      (value) => {
        value.cgroupPath = "counterlab-v6.1-escaped";
      },
      (value) => {
        value.cgroupPath = `counterlab-v6.1/${invocationId}`;
      },
      (value) => {
        value.observedLimits.memoryMaxBytes += 1;
      },
      (value) => {
        value.membership.memberPids = [100, 100];
      },
      (value) => {
        value.negativeControls.memory.oomKillAfter = 0;
      },
      (value) => {
        value.negativeControls.processes.maxEventsAfter = 0;
      },
      (value) => {
        value.negativeControls.cpu.throttledUsecAfter = 0;
      },
      (value) => {
        value.cleanup.cgroupAbsentAfterTimeout = false;
      },
      (value) => {
        value.observer.driverCliSha256 = "7".repeat(64);
      },
      (value) => {
        value.receiptPayloadSha256 = "8".repeat(64);
      },
    ];

    for (const mutate of mutations) {
      const changed = structuredClone(evidence());
      mutate(changed);
      expect(() =>
        validateContainedCgroupEvidence(changed, expected()),
      ).toThrow(/aggregate cgroup evidence/u);
    }
  });

  it("rejects unknown fields and stale bindings", () => {
    expect(() =>
      validateContainedCgroupEvidence(
        { ...evidence(), unknown: true },
        expected(),
      ),
    ).toThrow(/shape/u);
    expect(() =>
      validateContainedCgroupEvidence(evidence(), {
        ...expected(),
        invocationId: "9".repeat(64),
      }),
    ).toThrow(/binding/u);
  });

  it("rejects a self-consistent receipt with an ambiguous OOM delta", () => {
    const changed = evidence();
    changed.negativeControls.memory.oomKillAfter = 2;
    const { receiptPayloadSha256: _ignored, ...payload } = changed;
    changed.receiptPayloadSha256 = sha256CgroupBytes(
      canonicalCgroupJson(payload),
    );
    expect(() => validateContainedCgroupEvidence(changed, expected())).toThrow(
      /binding/u,
    );
  });
});
