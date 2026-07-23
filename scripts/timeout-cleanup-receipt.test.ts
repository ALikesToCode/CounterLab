import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "../packages/session-core/src/index.js";

import {
  TIMEOUT_PROCESS_ADDRESS_SPACE_BYTES,
  QUALIFIED_AGGREGATE_LIMIT_MODE,
  TIMEOUT_ROOTLESS_RLIMIT_TYPES,
  assertQualifiedAggregateRuntimeLimits,
  assertRootlessRlimitBindings,
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
    schemaVersion: "3" as const,
    status: "OBSERVED" as const,
    authority: "linux-cgroup-v2" as const,
    cgroupVersion: 2 as const,
    cgroupId: `counterlab-v6.1-${invocationId}`,
    cgroupPath: `containerd/counterlab-v6.1-${invocationId}`,
    cgroupIdentity: sha256(
      `counterlab-cgroup-v2\0${invocationId}\0${finalContainerId}\0${sanitizedSpecSha256}`,
    ),
    invocationId,
    finalContainerId,
    finalizationPayloadSha256: "f".repeat(64),
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
        maxEventsBefore: 0,
        maxEventsAfter: 1,
        oomKillBefore: 0,
        oomKillAfter: 0,
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
  it("matches the four container-scoped rlimits emitted by the contained runtime", () => {
    expect(TIMEOUT_ROOTLESS_RLIMIT_TYPES).toEqual([
      "RLIMIT_AS",
      "RLIMIT_CPU",
      "RLIMIT_FSIZE",
      "RLIMIT_NOFILE",
    ]);
    expect(TIMEOUT_ROOTLESS_RLIMIT_TYPES).not.toContain("RLIMIT_NPROC");
    expect(TIMEOUT_ROOTLESS_RLIMIT_TYPES).not.toContain("RLIMIT_CORE");
  });

  it("cross-binds process rlimits to aggregate memory intent", () => {
    const enforcedRlimits = [
      {
        type: "RLIMIT_AS" as const,
        soft: TIMEOUT_PROCESS_ADDRESS_SPACE_BYTES,
        hard: TIMEOUT_PROCESS_ADDRESS_SPACE_BYTES,
      },
      { type: "RLIMIT_CPU" as const, soft: 20, hard: 20 },
      { type: "RLIMIT_FSIZE" as const, soft: 262_144, hard: 262_144 },
      { type: "RLIMIT_NOFILE" as const, soft: 64, hard: 64 },
    ];
    expect(() =>
      assertRootlessRlimitBindings({
        intendedAggregateLimits,
        enforcedRlimits,
      }),
    ).not.toThrow();

    for (const mutate of [
      (limits: typeof enforcedRlimits) => {
        const limit = limits.find((entry) => entry.type === "RLIMIT_AS");
        if (limit === undefined) throw new Error("missing test rlimit");
        limit.soft -= 1;
        limit.hard -= 1;
      },
    ]) {
      const changed = structuredClone(enforcedRlimits);
      mutate(changed);
      expect(() =>
        assertRootlessRlimitBindings({
          intendedAggregateLimits,
          enforcedRlimits: changed,
        }),
      ).toThrow(/bind aggregate intent/u);
    }
  });

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

    const direct = aggregateLimitEvidence();
    direct.cgroupPath = `counterlab-v6.1-${invocationId}`;
    const { receiptPayloadSha256: _nestedHash, ...directPayload } = direct;
    direct.receiptPayloadSha256 = sha256(canonicalJson(directPayload));
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: direct,
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
    evidence.negativeControls.memory.maxEventsAfter = 0;
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: evidence,
        aggregateLimitIntentEnforced: true,
        limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
      }),
    ).toThrow();

    const nestedPath = aggregateLimitEvidence();
    nestedPath.cgroupPath = `other/counterlab-v6.1-${invocationId}`;
    const { receiptPayloadSha256: _nestedHash, ...nestedPayload } = nestedPath;
    nestedPath.receiptPayloadSha256 = sha256(canonicalJson(nestedPayload));
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: nestedPath,
        aggregateLimitIntentEnforced: true,
        limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
      }),
    ).toThrow();

    const unexpectedOom = aggregateLimitEvidence();
    unexpectedOom.negativeControls.memory.oomKillAfter = 1;
    const { receiptPayloadSha256: _ignored, ...payload } = unexpectedOom;
    unexpectedOom.receiptPayloadSha256 = sha256(canonicalJson(payload));
    expect(() =>
      assertQualifiedAggregateRuntimeLimits({
        ...aggregateInput(),
        aggregateLimitEvidence: unexpectedOom,
        aggregateLimitIntentEnforced: true,
        limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
      }),
    ).toThrow(/negative-control/u);
  });
});
