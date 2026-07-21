import { describe, expect, it } from "vitest";

import {
  canonicalCgroupJson,
  sha256CgroupBytes,
  validateContainedCgroupEvidence,
} from "./contained-cgroup-evidence.mjs";
import {
  createContainedCgroupObserverDraft,
  createContainedCgroupObserverFailure,
  createContainedCgroupObserverReady,
  observeContainedCgroup,
  parseContainedCgroupKeyValues,
  parseContainedCgroupMembers,
  parseContainedProcessStat,
  selectContainedCgroupMembership,
  validateContainedCgroupObserverDraft,
  validateContainedCgroupObserverFailure,
  validateContainedCgroupObserverReady,
} from "./contained-cgroup-observer.mjs";
import {
  createContainedCgroupObserverFinalization,
  createContainedCgroupObserverManifest,
} from "./contained-cgroup-observer-protocol.mjs";

const runtimeSessionId = "rt-v61-test1";
const invocationId = "1".repeat(64);
const finalContainerId = "2".repeat(64);
const sanitizedSpecSha256 = "3".repeat(64);
const now = new Date("2026-07-20T01:02:03.000Z");
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

function manifest() {
  return createContainedCgroupObserverManifest({
    baseReceiptFileSha256: "4".repeat(64),
    baseReceiptPayloadSha256: "5".repeat(64),
    finalContainerId,
    intendedAggregateLimits: {
      cpuCount: 1,
      maxProcesses: 16,
      memoryBytes: 512 * 1024 * 1024,
    },
    invocationId,
    observerBindings: {
      runtimeSessionId,
      runtimeAttestationSha256: "6".repeat(64),
      driverCliSha256: "7".repeat(64),
      driverModuleSha256: "8".repeat(64),
    },
    requestedAt: now,
    sanitizedSpecSha256,
  });
}

function processStat(pid: number, parentPid: number, startTime: number) {
  const fields = [
    "S",
    String(parentPid),
    ...Array.from({ length: 17 }, () => "0"),
    String(startTime),
  ];
  return `${pid} (counterlab worker) ${fields.join(" ")}\n`;
}

function latestDraftHash(drafts: Array<Record<string, unknown>>) {
  const value = drafts.at(-1)?.receiptPayloadSha256;
  if (typeof value !== "string") {
    throw new Error("test observer draft hash is unavailable");
  }
  return value;
}

function adapter(overrides: Record<string, unknown> = {}) {
  const counters = {
    cpu: { nr_throttled: 0, throttled_usec: 0 },
    processes: { max: 0 },
    memory: { oom_kill: 0 },
  };
  const controls: Array<Record<string, unknown>> = [];
  const drafts: Array<Record<string, unknown>> = [];
  return {
    controls,
    drafts,
    now: () => now,
    waitForCgroup: async () => undefined,
    readCgroupFile(name: string) {
      const values: Record<string, string> = {
        "memory.max": String(512 * 1024 * 1024),
        "memory.swap.max": "0",
        "pids.max": "16",
        "cpu.max": "100000 100000",
        "cgroup.procs": "100\n101\n",
        "cpu.stat": `usage_usec 10\nnr_throttled ${counters.cpu.nr_throttled}\nthrottled_usec ${counters.cpu.throttled_usec}\n`,
        "pids.events": `max ${counters.processes.max}\n`,
        "memory.events": `low 0\noom_kill ${counters.memory.oom_kill}\n`,
      };
      const value = values[name];
      if (value === undefined)
        throw new Error(`unexpected cgroup file: ${name}`);
      return value;
    },
    readProcessStat(pid: number) {
      return pid === 100
        ? processStat(100, 1, 12345)
        : processStat(101, 100, 12346);
    },
    async runControl(control: Record<string, unknown>) {
      controls.push(control);
      if (control.mode === "cpu") {
        counters.cpu.nr_throttled += 1;
        counters.cpu.throttled_usec += 100;
      } else if (control.mode === "processes") {
        counters.processes.max += 1;
      } else if (control.mode === "memory") {
        counters.memory.oom_kill += 1;
      }
    },
    async publishDraft(draft: Record<string, unknown>) {
      drafts.push(draft);
    },
    waitForFinalization: async () =>
      createContainedCgroupObserverFinalization(manifest(), {
        cleanup: verifiedCleanup,
        cleanupVerified: true,
        decisionAt: now,
        observerDraftPayloadSha256: latestDraftHash(drafts),
        resultReleased: false,
        status: "FINALIZE",
        timeoutObserved: true,
      }),
    waitForCgroupAbsent: async () => undefined,
    ...overrides,
  };
}

describe("contained cgroup observer", () => {
  it("parses counters, candidate-only ancestry, and process identity", () => {
    expect(parseContainedCgroupKeyValues("max 0\noom_kill 2\n")).toEqual({
      max: 0,
      oom_kill: 2,
    });
    expect(parseContainedCgroupMembers("101\n100\n")).toEqual([100, 101]);
    expect(
      parseContainedProcessStat(processStat(101, 100, 12346), 101),
    ).toEqual({ pid: 101, parentPid: 100, startTimeTicks: "12346" });
    expect(
      selectContainedCgroupMembership(
        [100, 101],
        new Map([
          [100, { pid: 100, parentPid: 1, startTimeTicks: "12345" }],
          [101, { pid: 101, parentPid: 100, startTimeTicks: "12346" }],
        ]),
      ),
    ).toMatchObject({ leaderPid: 100, descendantsObserved: true });
  });

  it("runs fixed controls in order and emits only complete evidence after cleanup", async () => {
    const input = manifest();
    const fake = adapter();
    const evidence = await observeContainedCgroup(input, fake);

    expect(fake.controls).toEqual([
      { mode: "cpu", busyWindowMs: 500, workers: 4 },
      { mode: "processes", attemptedProcesses: 17 },
      { mode: "memory", requestedBytes: 576 * 1024 * 1024 },
    ]);
    expect(fake.drafts).toHaveLength(1);
    expect(() =>
      validateContainedCgroupObserverDraft(fake.drafts[0], input),
    ).not.toThrow();
    expect(() =>
      validateContainedCgroupEvidence(evidence, {
        invocationId,
        finalContainerId,
        sanitizedSpecSha256,
        intendedAggregateLimits: input.intendedAggregateLimits,
        runtimeAttestationSha256: input.runtimeAttestationSha256,
        runtimeSessionId,
        driverCliSha256: input.driverCliSha256,
        driverModuleSha256: input.driverModuleSha256,
      }),
    ).not.toThrow();
  });

  it("rejects missing counter enforcement, ambiguous ancestry, and PID reuse", async () => {
    const noCpu = adapter({
      runControl: async (control: Record<string, unknown>) => {
        if (control.mode !== "cpu") return;
      },
    });
    await expect(observeContainedCgroup(manifest(), noCpu)).rejects.toThrow(
      /evidence binding/u,
    );

    const ambiguous = adapter({
      readProcessStat: (pid: number) => processStat(pid, 1, 12000 + pid),
    });
    await expect(observeContainedCgroup(manifest(), ambiguous)).rejects.toThrow(
      /ancestry/u,
    );

    let reads = 0;
    const reused = adapter({
      readProcessStat(pid: number) {
        reads += 1;
        return processStat(pid, pid === 100 ? 1 : 100, 12345 + pid + reads);
      },
    });
    await expect(observeContainedCgroup(manifest(), reused)).rejects.toThrow(
      /reused/u,
    );
  });

  it("rejects aborts, unstable membership and limits, and ambiguous OOM kills", async () => {
    const aborted = adapter({
      waitForFinalization: async () =>
        createContainedCgroupObserverFinalization(manifest(), {
          abortCode: "TIMEOUT_NOT_OBSERVED",
          cleanupVerified: false,
          cleanup: { ...verifiedCleanup, taskAbsent: false },
          decisionAt: now,
          observerDraftPayloadSha256: latestDraftHash(aborted.drafts),
          resultReleased: false,
          status: "ABORT",
          timeoutObserved: false,
        }),
    });
    await expect(observeContainedCgroup(manifest(), aborted)).rejects.toThrow(
      /aborted/u,
    );

    const wrongDraft = adapter({
      waitForFinalization: async () =>
        createContainedCgroupObserverFinalization(manifest(), {
          cleanup: verifiedCleanup,
          cleanupVerified: true,
          decisionAt: now,
          observerDraftPayloadSha256: "f".repeat(64),
          resultReleased: false,
          status: "FINALIZE",
          timeoutObserved: true,
        }),
    });
    await expect(
      observeContainedCgroup(manifest(), wrongDraft),
    ).rejects.toThrow(/draft changed/u);

    let membershipReads = 0;
    const unstableMembership = adapter({
      readCgroupFile(name: string) {
        if (name === "cgroup.procs") {
          membershipReads += 1;
          return membershipReads === 1 ? "100\n101\n" : "100\n101\n102\n";
        }
        return adapter().readCgroupFile(name);
      },
      readProcessStat(pid: number) {
        if (pid === 100) return processStat(100, 1, 12345);
        if (pid === 101) return processStat(101, 100, 12346);
        return processStat(102, 100, 12347);
      },
    });
    await expect(
      observeContainedCgroup(manifest(), unstableMembership),
    ).rejects.toThrow(/stabilize/u);

    const stable = adapter();
    let memoryLimitReads = 0;
    const changedLimits = {
      ...stable,
      readCgroupFile(name: string) {
        if (name === "memory.max") {
          memoryLimitReads += 1;
          return String(
            memoryLimitReads === 1 ? 512 * 1024 * 1024 : 512 * 1024 * 1024 + 1,
          );
        }
        return stable.readCgroupFile(name);
      },
    };
    await expect(
      observeContainedCgroup(manifest(), changedLimits),
    ).rejects.toThrow(/limits changed/u);

    const ambiguousOomBase = adapter();
    const ambiguousOom = {
      ...ambiguousOomBase,
      async runControl(control: Record<string, unknown>) {
        await ambiguousOomBase.runControl(control);
        if (control.mode === "memory") {
          await ambiguousOomBase.runControl(control);
        }
      },
    };
    await expect(
      observeContainedCgroup(manifest(), ambiguousOom),
    ).rejects.toThrow(/evidence binding/u);
  });

  it("binds ready and draft receipts and rejects mutation", () => {
    const input = manifest();
    const ready = createContainedCgroupObserverReady(input, {
      armedAt: now,
      observerPid: 123,
    });
    expect(validateContainedCgroupObserverReady(ready, input)).toEqual(ready);
    expect(() =>
      validateContainedCgroupObserverReady(
        { ...ready, observerPid: 124 },
        input,
      ),
    ).toThrow(/ready binding/u);

    const failure = createContainedCgroupObserverFailure(input, {
      failedAt: now,
    });
    expect(validateContainedCgroupObserverFailure(failure, input)).toEqual(
      failure,
    );
    expect(() =>
      validateContainedCgroupObserverFailure(
        { ...failure, code: "PRIVATE_ERROR" },
        input,
      ),
    ).toThrow(/failure binding/u);

    const observation = {
      observedLimits: {
        memoryMaxBytes: 512 * 1024 * 1024,
        memorySwapMaxBytes: 0,
        pidsMax: 16,
        cpuQuotaMicros: 100_000,
        cpuPeriodMicros: 100_000,
      },
      membership: {
        leaderPid: 100,
        leaderStartTimeTicks: "12345",
        memberPids: [100, 101],
        memberSetSha256: sha256CgroupBytes(canonicalCgroupJson([100, 101])),
        descendantsObserved: true,
      },
      negativeControls: {
        memory: {
          requestedBytes: 576 * 1024 * 1024,
          oomKillBefore: 0,
          oomKillAfter: 1,
          enforced: true,
        },
        processes: {
          attemptedProcesses: 17,
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
      observedAt: now.toISOString(),
    };
    const draft = createContainedCgroupObserverDraft(input, observation);
    expect(validateContainedCgroupObserverDraft(draft, input)).toEqual(draft);
    expect(() =>
      validateContainedCgroupObserverDraft(
        { ...draft, candidateLeaderPresentAfterControls: false },
        input,
      ),
    ).toThrow(/draft binding/u);
  });
});
