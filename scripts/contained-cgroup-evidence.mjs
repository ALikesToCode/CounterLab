import { createHash } from "node:crypto";

export const QUALIFIED_AGGREGATE_LIMIT_MODE =
  "container-cgroup-and-process-rlimit";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const invocationPattern = /^[a-f0-9]{64}$/u;
const sessionPattern = /^rt-[a-z0-9][a-z0-9-]{7,13}$/u;
const isoTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/u;

const topLevelKeys = [
  "authority",
  "cgroupId",
  "cgroupIdentity",
  "cgroupPath",
  "cgroupVersion",
  "cleanup",
  "finalContainerId",
  "invocationId",
  "membership",
  "negativeControls",
  "observedAt",
  "observedLimits",
  "observer",
  "receiptPayloadSha256",
  "runtimeAttestationSha256",
  "sanitizedSpecSha256",
  "schemaVersion",
  "status",
];

export function canonicalCgroupJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalCgroupJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalCgroupJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256CgroupBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`aggregate cgroup evidence ${label} shape is invalid`);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`aggregate cgroup evidence ${label} shape is invalid`);
  }
}

function safeInteger(value, { positive = false } = {}) {
  return Number.isSafeInteger(value) && value >= (positive ? 1 : 0);
}

function sha256(value) {
  return typeof value === "string" && sha256Pattern.test(value);
}

function validateExpected(value) {
  const expected = object(value, "expected binding");
  exactKeys(
    expected,
    [
      "driverCliSha256",
      "driverModuleSha256",
      "finalContainerId",
      "intendedAggregateLimits",
      "invocationId",
      "runtimeAttestationSha256",
      "runtimeSessionId",
      "sanitizedSpecSha256",
    ],
    "expected binding",
  );
  const intended = object(expected.intendedAggregateLimits, "intended limits");
  exactKeys(
    intended,
    ["cpuCount", "maxProcesses", "memoryBytes"],
    "intended limits",
  );
  if (
    !invocationPattern.test(expected.invocationId ?? "") ||
    !invocationPattern.test(expected.finalContainerId ?? "") ||
    !sha256(expected.sanitizedSpecSha256) ||
    !sha256(expected.runtimeAttestationSha256) ||
    !sessionPattern.test(expected.runtimeSessionId ?? "") ||
    !sha256(expected.driverCliSha256) ||
    !sha256(expected.driverModuleSha256) ||
    typeof intended.cpuCount !== "number" ||
    !Number.isFinite(intended.cpuCount) ||
    intended.cpuCount < 0.25 ||
    intended.cpuCount > 2 ||
    !safeInteger(intended.maxProcesses, { positive: true }) ||
    intended.maxProcesses > 32 ||
    !safeInteger(intended.memoryBytes, { positive: true }) ||
    intended.memoryBytes < 64 * 1024 * 1024 ||
    intended.memoryBytes > 1024 * 1024 * 1024
  ) {
    throw new Error("aggregate cgroup evidence expected binding is invalid");
  }
  return { expected, intended };
}

export function createContainedCgroupIdentity({
  invocationId,
  finalContainerId,
  sanitizedSpecSha256,
}) {
  if (
    !invocationPattern.test(invocationId ?? "") ||
    !invocationPattern.test(finalContainerId ?? "") ||
    !sha256(sanitizedSpecSha256)
  ) {
    throw new Error("aggregate cgroup evidence identity input is invalid");
  }
  return sha256CgroupBytes(
    `counterlab-cgroup-v2\0${invocationId}\0${finalContainerId}\0${sanitizedSpecSha256}`,
  );
}

export function validateContainedCgroupEvidence(value, expectedValue) {
  const evidence = object(value, "top-level");
  exactKeys(evidence, topLevelKeys, "top-level");
  const { expected, intended } = validateExpected(expectedValue);
  const observed = object(evidence.observedLimits, "observed limits");
  const membership = object(evidence.membership, "membership");
  const controls = object(evidence.negativeControls, "negative controls");
  const memoryControl = object(controls.memory, "memory control");
  const processControl = object(controls.processes, "process control");
  const cpuControl = object(controls.cpu, "CPU control");
  const cleanup = object(evidence.cleanup, "cleanup");
  const observer = object(evidence.observer, "observer");
  exactKeys(
    observed,
    [
      "cpuPeriodMicros",
      "cpuQuotaMicros",
      "memoryMaxBytes",
      "memorySwapMaxBytes",
      "pidsMax",
    ],
    "observed limits",
  );
  exactKeys(
    membership,
    [
      "descendantsObserved",
      "leaderPid",
      "leaderStartTimeTicks",
      "memberPids",
      "memberSetSha256",
    ],
    "membership",
  );
  exactKeys(controls, ["cpu", "memory", "processes"], "negative controls");
  exactKeys(
    memoryControl,
    ["enforced", "oomKillAfter", "oomKillBefore", "requestedBytes"],
    "memory control",
  );
  exactKeys(
    processControl,
    ["attemptedProcesses", "enforced", "maxEventsAfter", "maxEventsBefore"],
    "process control",
  );
  exactKeys(
    cpuControl,
    [
      "busyWindowMs",
      "enforced",
      "nrThrottledAfter",
      "nrThrottledBefore",
      "throttledUsecAfter",
      "throttledUsecBefore",
    ],
    "CPU control",
  );
  exactKeys(cleanup, ["cgroupAbsentAfterTimeout"], "cleanup");
  exactKeys(
    observer,
    ["driverCliSha256", "driverModuleSha256", "runtimeSessionId"],
    "observer",
  );

  const memberPids = membership.memberPids;
  const uniqueMembers = Array.isArray(memberPids)
    ? new Set(memberPids)
    : new Set();
  const { receiptPayloadSha256, ...payload } = evidence;
  if (
    evidence.schemaVersion !== "1" ||
    evidence.status !== "OBSERVED" ||
    evidence.authority !== "linux-cgroup-v2" ||
    evidence.cgroupVersion !== 2 ||
    evidence.invocationId !== expected.invocationId ||
    evidence.finalContainerId !== expected.finalContainerId ||
    evidence.sanitizedSpecSha256 !== expected.sanitizedSpecSha256 ||
    evidence.runtimeAttestationSha256 !== expected.runtimeAttestationSha256 ||
    evidence.cgroupId !== `counterlab-v6.1-${expected.invocationId}` ||
    evidence.cgroupPath !== `counterlab-v6.1/${expected.invocationId}` ||
    evidence.cgroupIdentity !== createContainedCgroupIdentity(expected) ||
    observed.memoryMaxBytes !== intended.memoryBytes ||
    ![0, intended.memoryBytes].includes(observed.memorySwapMaxBytes) ||
    observed.pidsMax !== intended.maxProcesses ||
    !safeInteger(observed.cpuQuotaMicros, { positive: true }) ||
    !safeInteger(observed.cpuPeriodMicros, { positive: true }) ||
    observed.cpuQuotaMicros / observed.cpuPeriodMicros !== intended.cpuCount ||
    !safeInteger(membership.leaderPid, { positive: true }) ||
    typeof membership.leaderStartTimeTicks !== "string" ||
    !/^[1-9][0-9]*$/u.test(membership.leaderStartTimeTicks) ||
    !Array.isArray(memberPids) ||
    memberPids.length < 2 ||
    memberPids.length > 64 ||
    memberPids.some((pid) => !safeInteger(pid, { positive: true })) ||
    uniqueMembers.size !== memberPids.length ||
    !uniqueMembers.has(membership.leaderPid) ||
    membership.memberSetSha256 !==
      sha256CgroupBytes(
        canonicalCgroupJson(
          [...memberPids].sort((left, right) => left - right),
        ),
      ) ||
    membership.descendantsObserved !== true ||
    !safeInteger(memoryControl.requestedBytes, { positive: true }) ||
    memoryControl.requestedBytes <= intended.memoryBytes ||
    !safeInteger(memoryControl.oomKillBefore) ||
    !safeInteger(memoryControl.oomKillAfter, { positive: true }) ||
    memoryControl.oomKillAfter <= memoryControl.oomKillBefore ||
    memoryControl.enforced !== true ||
    !safeInteger(processControl.attemptedProcesses, { positive: true }) ||
    processControl.attemptedProcesses <= intended.maxProcesses ||
    !safeInteger(processControl.maxEventsBefore) ||
    !safeInteger(processControl.maxEventsAfter, { positive: true }) ||
    processControl.maxEventsAfter <= processControl.maxEventsBefore ||
    processControl.enforced !== true ||
    !safeInteger(cpuControl.busyWindowMs, { positive: true }) ||
    !safeInteger(cpuControl.nrThrottledBefore) ||
    !safeInteger(cpuControl.nrThrottledAfter, { positive: true }) ||
    cpuControl.nrThrottledAfter <= cpuControl.nrThrottledBefore ||
    !safeInteger(cpuControl.throttledUsecBefore) ||
    !safeInteger(cpuControl.throttledUsecAfter, { positive: true }) ||
    cpuControl.throttledUsecAfter <= cpuControl.throttledUsecBefore ||
    cpuControl.enforced !== true ||
    cleanup.cgroupAbsentAfterTimeout !== true ||
    observer.runtimeSessionId !== expected.runtimeSessionId ||
    observer.driverCliSha256 !== expected.driverCliSha256 ||
    observer.driverModuleSha256 !== expected.driverModuleSha256 ||
    typeof evidence.observedAt !== "string" ||
    !isoTimestampPattern.test(evidence.observedAt) ||
    !Number.isFinite(Date.parse(evidence.observedAt)) ||
    !sha256(receiptPayloadSha256) ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("aggregate cgroup evidence binding is invalid");
  }
  return evidence;
}
