import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "../packages/session-core/src/index.js";

import {
  QUALIFIED_AGGREGATE_LIMIT_MODE,
  assertQualifiedAggregateRuntimeLimits,
} from "./timeout-cleanup-receipt.js";

const invocationId = "1".repeat(64);
const finalContainerId = "2".repeat(64);
const intendedAggregateLimits = {
  cpuCount: 1,
  maxProcesses: 16,
  memoryBytes: 512 * 1024 * 1024,
} as const;

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function aggregateLimitEvidence() {
  const sanitizedSpecSha256 = "5".repeat(64);
  const memberPids = [100, 101];
  const payload = {
    schemaVersion: "1" as const,
    status: "OBSERVED" as const,
    authority: "linux-cgroup-v2" as const,
    cgroupVersion: 2 as const,
    cgroupId: `counterlab-v6.1-${invocationId}`,
    cgroupPath: `counterlab-v6.1/${invocationId}`,
    cgroupIdentity: sha256(
      `counterlab-cgroup-v2\0${invocationId}\0${finalContainerId}\0${sanitizedSpecSha256}`,
    ),
    invocationId,
    finalContainerId,
    sanitizedSpecSha256,
    runtimeAttestationSha256: "6".repeat(64),
    observedLimits: {
      memoryMaxBytes: intendedAggregateLimits.memoryBytes,
      memorySwapMaxBytes: 0,
      pidsMax: intendedAggregateLimits.maxProcesses,
      cpuQuotaMicros: 100_000,
      cpuPeriodMicros: 100_000,
    },
    membership: {
      leaderPid: 100,
      leaderStartTimeTicks: "12345",
      memberPids,
      memberSetSha256: sha256(canonicalJson(memberPids)),
      descendantsObserved: true as const,
    },
    negativeControls: {
      memory: {
        requestedBytes: intendedAggregateLimits.memoryBytes + 1,
        oomKillBefore: 0,
        oomKillAfter: 1,
        enforced: true as const,
      },
      processes: {
        attemptedProcesses: intendedAggregateLimits.maxProcesses + 1,
        maxEventsBefore: 0,
        maxEventsAfter: 1,
        enforced: true as const,
      },
      cpu: {
        busyWindowMs: 250,
        nrThrottledBefore: 0,
        nrThrottledAfter: 1,
        throttledUsecBefore: 0,
        throttledUsecAfter: 1,
        enforced: true as const,
      },
    },
    cleanup: { cgroupAbsentAfterTimeout: true as const },
    observer: {
      runtimeSessionId: "rt-v61-test1",
      driverCliSha256: "3".repeat(64),
      driverModuleSha256: "4".repeat(64),
    },
    observedAt: "2026-07-20T12:00:00.000Z",
  };
  return {
    ...payload,
    receiptPayloadSha256: sha256(canonicalJson(payload)),
  };
}

function aggregateInput() {
  return {
    invocationId,
    finalContainerId,
    intendedAggregateLimits,
    aggregateLimitEvidence: aggregateLimitEvidence(),
  };
}

describe("timeout cleanup aggregate resource authority", () => {
  it("rejects process-only or merely declared aggregate limits", () => {
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: null,
        aggregateLimitIntentEnforced: false,
        limitMode: "process-address-space-rlimit-with-unenforced-cgroup-intent",
      }),
    ).toThrow(/aggregate runtime limits were not enforced/u);

    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitIntentEnforced: true,
        limitMode: "declared-but-unverified",
      }),
    ).toThrow(/limit mode is not qualified/u);
  });

  it("accepts only the explicit aggregate container limit mode", () => {
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitIntentEnforced: true,
        limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
      }),
    ).not.toThrow();
  });

  it("rejects asserted aggregate limits without bound observations", () => {
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: null,
        aggregateLimitIntentEnforced: true,
        limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
      }),
    ).toThrow();

    const evidence = aggregateLimitEvidence();
    evidence.negativeControls.memory.oomKillAfter = 0;
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: evidence,
        aggregateLimitIntentEnforced: true,
        limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
      }),
    ).toThrow();
  });
});
