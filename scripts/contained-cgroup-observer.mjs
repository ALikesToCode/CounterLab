#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  statfsSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalCgroupJson,
  sha256CgroupBytes,
  validateContainedCgroupEvidence,
} from "./contained-cgroup-evidence.mjs";
import { resolveContainedCgroupObserverBindings } from "./contained-cgroup-observer-bindings.mjs";
import {
  containedCgroupQualificationPaths,
  validateContainedCgroupObserverFinalization,
  validateContainedCgroupObserverManifest,
} from "./contained-cgroup-observer-protocol.mjs";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const cgroupFilesystemRoot = "/sys/fs/cgroup";
const cgroup2Magic = 0x63677270;
const maximumArtifactBytes = 1_048_576;
export const cgroupStartupTimeoutMs = 30_000;
const membershipQuiescenceSamples = 3;
const membershipQuiescenceMaximumAttempts = 40;
const membershipQuiescenceIntervalMs = 50;
const allowedCgroupFiles = new Set([
  "cgroup.procs",
  "cpu.max",
  "cpu.stat",
  "memory.events",
  "memory.max",
  "memory.oom.group",
  "memory.swap.max",
  "pids.events",
  "pids.max",
]);
export const containedCgroupObserverFailurePhases = Object.freeze([
  "VALIDATE_BINDINGS",
  "WAIT_CGROUP",
  "READ_LIMITS",
  "READ_MEMBERSHIP",
  "CPU_COUNTERS_BEFORE",
  "CPU_HELPER_READY",
  "CPU_HELPER_MOVE",
  "CPU_CONTROL",
  "CPU_COUNTERS_AFTER",
  "PROCESS_COUNTERS_BEFORE",
  "PROCESS_HELPER_READY",
  "PROCESS_HELPER_MOVE",
  "PROCESS_CONTROL",
  "PROCESS_COUNTERS_AFTER",
  "MEMORY_COUNTERS_BEFORE",
  "MEMORY_HELPER_READY",
  "MEMORY_HELPER_MOVE",
  "MEMORY_CONTROL",
  "MEMORY_COUNTERS_AFTER",
  "CANDIDATE_RECHECK",
  "LIMITS_RECHECK",
  "PUBLISH_DRAFT",
  "WAIT_FINALIZATION",
  "WAIT_CLEANUP",
]);
const containedCgroupObserverFailurePhaseSet = new Set(
  containedCgroupObserverFailurePhases,
);

function validateObserverFailurePhase(value) {
  if (!containedCgroupObserverFailurePhaseSet.has(value)) {
    throw new Error("contained cgroup observer failure phase is invalid");
  }
  return value;
}

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`contained cgroup observer ${label} shape is invalid`);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`contained cgroup observer ${label} shape is invalid`);
  }
}

function hashedArtifact(payload) {
  return {
    ...payload,
    receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
  };
}

function validTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

export function createContainedCgroupObserverReady(
  manifest,
  { armedAt = new Date(), observerPid = process.pid } = {},
) {
  if (
    !(armedAt instanceof Date) ||
    !Number.isFinite(armedAt.getTime()) ||
    !Number.isSafeInteger(observerPid) ||
    observerPid < 1
  ) {
    throw new Error("contained cgroup observer ready input is invalid");
  }
  const payload = {
    schemaVersion: "1",
    status: "ARMED",
    manifestPayloadSha256: manifest.receiptPayloadSha256,
    invocationId: manifest.invocationId,
    finalContainerId: manifest.finalContainerId,
    observerPid,
    armedAt: armedAt.toISOString(),
  };
  return validateContainedCgroupObserverReady(
    hashedArtifact(payload),
    manifest,
  );
}

export function validateContainedCgroupObserverReady(value, manifest) {
  const ready = object(value, "ready receipt");
  exactKeys(
    ready,
    [
      "armedAt",
      "finalContainerId",
      "invocationId",
      "manifestPayloadSha256",
      "observerPid",
      "receiptPayloadSha256",
      "schemaVersion",
      "status",
    ],
    "ready receipt",
  );
  const { receiptPayloadSha256, ...payload } = ready;
  if (
    ready.schemaVersion !== "1" ||
    ready.status !== "ARMED" ||
    ready.manifestPayloadSha256 !== manifest.receiptPayloadSha256 ||
    ready.invocationId !== manifest.invocationId ||
    ready.finalContainerId !== manifest.finalContainerId ||
    !Number.isSafeInteger(ready.observerPid) ||
    ready.observerPid < 1 ||
    !validTimestamp(ready.armedAt) ||
    !/^[a-f0-9]{64}$/u.test(receiptPayloadSha256 ?? "") ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("contained cgroup observer ready binding is invalid");
  }
  return ready;
}

export function createContainedCgroupObserverFailure(
  manifest,
  { failedAt = new Date(), phase = "VALIDATE_BINDINGS" } = {},
) {
  if (!(failedAt instanceof Date) || !Number.isFinite(failedAt.getTime())) {
    throw new Error("contained cgroup observer failure input is invalid");
  }
  const payload = {
    schemaVersion: "2",
    status: "FAILED",
    code: "OBSERVATION_FAILED",
    phase: validateObserverFailurePhase(phase),
    manifestPayloadSha256: manifest.receiptPayloadSha256,
    invocationId: manifest.invocationId,
    finalContainerId: manifest.finalContainerId,
    failedAt: failedAt.toISOString(),
  };
  return validateContainedCgroupObserverFailure(
    hashedArtifact(payload),
    manifest,
  );
}

export function validateContainedCgroupObserverFailure(value, manifest) {
  const failure = object(value, "failure receipt");
  const legacy = failure.schemaVersion === "1";
  exactKeys(
    failure,
    [
      "code",
      "failedAt",
      "finalContainerId",
      "invocationId",
      "manifestPayloadSha256",
      ...(legacy ? [] : ["phase"]),
      "receiptPayloadSha256",
      "schemaVersion",
      "status",
    ],
    "failure receipt",
  );
  const { receiptPayloadSha256, ...payload } = failure;
  if (
    !["1", "2"].includes(failure.schemaVersion) ||
    failure.status !== "FAILED" ||
    failure.code !== "OBSERVATION_FAILED" ||
    (!legacy && !containedCgroupObserverFailurePhaseSet.has(failure.phase)) ||
    failure.manifestPayloadSha256 !== manifest.receiptPayloadSha256 ||
    failure.invocationId !== manifest.invocationId ||
    failure.finalContainerId !== manifest.finalContainerId ||
    !validTimestamp(failure.failedAt) ||
    !/^[a-f0-9]{64}$/u.test(receiptPayloadSha256 ?? "") ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("contained cgroup observer failure binding is invalid");
  }
  return failure;
}

function expectedEvidence(manifest) {
  return {
    cgroupParentPath: manifest.cgroupParentPath,
    invocationId: manifest.invocationId,
    finalContainerId: manifest.finalContainerId,
    sanitizedSpecSha256: manifest.sanitizedSpecSha256,
    intendedAggregateLimits: manifest.intendedAggregateLimits,
    runtimeAttestationSha256: manifest.runtimeAttestationSha256,
    runtimeSessionId: manifest.runtimeSessionId,
    driverCliSha256: manifest.driverCliSha256,
    driverModuleSha256: manifest.driverModuleSha256,
  };
}

function evidencePayload(manifest, observation, finalization) {
  return {
    schemaVersion: "2",
    status: "OBSERVED",
    authority: "linux-cgroup-v2",
    cgroupVersion: 2,
    cgroupId: manifest.cgroupId,
    cgroupPath: manifest.cgroupPath,
    cgroupIdentity: manifest.cgroupIdentity,
    invocationId: manifest.invocationId,
    finalContainerId: manifest.finalContainerId,
    finalizationPayloadSha256:
      finalization?.receiptPayloadSha256 ?? "0".repeat(64),
    sanitizedSpecSha256: manifest.sanitizedSpecSha256,
    runtimeAttestationSha256: manifest.runtimeAttestationSha256,
    observedLimits: observation.observedLimits,
    membership: observation.membership,
    negativeControls: observation.negativeControls,
    cleanup: { cgroupAbsentAfterTimeout: true },
    observer: {
      runtimeSessionId: manifest.runtimeSessionId,
      driverCliSha256: manifest.driverCliSha256,
      driverModuleSha256: manifest.driverModuleSha256,
    },
    observedAt: observation.observedAt,
  };
}

export function createContainedCgroupObserverDraft(manifest, observation) {
  const finalEvidence = validateContainedCgroupEvidence(
    hashedArtifact(evidencePayload(manifest, observation)),
    expectedEvidence(manifest),
  );
  const payload = {
    schemaVersion: "1",
    status: "OBSERVED_ACTIVE",
    manifestPayloadSha256: manifest.receiptPayloadSha256,
    invocationId: manifest.invocationId,
    finalContainerId: manifest.finalContainerId,
    candidateLeaderPresentAfterControls: true,
    observedLimits: finalEvidence.observedLimits,
    membership: finalEvidence.membership,
    negativeControls: finalEvidence.negativeControls,
    observedAt: finalEvidence.observedAt,
  };
  return validateContainedCgroupObserverDraft(
    hashedArtifact(payload),
    manifest,
  );
}

export function validateContainedCgroupObserverDraft(value, manifest) {
  const draft = object(value, "draft receipt");
  exactKeys(
    draft,
    [
      "candidateLeaderPresentAfterControls",
      "finalContainerId",
      "invocationId",
      "manifestPayloadSha256",
      "membership",
      "negativeControls",
      "observedAt",
      "observedLimits",
      "receiptPayloadSha256",
      "schemaVersion",
      "status",
    ],
    "draft receipt",
  );
  const { receiptPayloadSha256, ...payload } = draft;
  if (
    draft.schemaVersion !== "1" ||
    draft.status !== "OBSERVED_ACTIVE" ||
    draft.manifestPayloadSha256 !== manifest.receiptPayloadSha256 ||
    draft.invocationId !== manifest.invocationId ||
    draft.finalContainerId !== manifest.finalContainerId ||
    draft.candidateLeaderPresentAfterControls !== true ||
    !validTimestamp(draft.observedAt) ||
    !/^[a-f0-9]{64}$/u.test(receiptPayloadSha256 ?? "") ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("contained cgroup observer draft binding is invalid");
  }
  validateContainedCgroupEvidence(
    hashedArtifact(evidencePayload(manifest, draft)),
    expectedEvidence(manifest),
  );
  return draft;
}

function positiveInteger(value, label) {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
  return parsed;
}

function nonnegativeInteger(value, label) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
  return parsed;
}

export function parseContainedCgroupKeyValues(source) {
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 8_192
  ) {
    throw new Error("contained cgroup observer counter source is invalid");
  }
  const values = {};
  for (const line of source.trim().split("\n")) {
    const match = line.match(/^([a-z_]+(?:\.[a-z_]+)*) ([0-9]+)$/u);
    if (match === null || Object.hasOwn(values, match[1])) {
      throw new Error("contained cgroup observer counter source is invalid");
    }
    values[match[1]] = nonnegativeInteger(match[2], "counter value");
  }
  return values;
}

export function parseContainedCgroupMembers(source) {
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 8_192
  ) {
    throw new Error("contained cgroup observer membership source is invalid");
  }
  const members = source
    .trim()
    .split("\n")
    .map((entry) => positiveInteger(entry, "member PID"))
    .sort((left, right) => left - right);
  if (
    members.length < 2 ||
    members.length > 64 ||
    new Set(members).size !== members.length
  ) {
    throw new Error("contained cgroup observer membership is invalid");
  }
  return members;
}

export function parseContainedProcessStat(source, expectedPid) {
  if (
    typeof source !== "string" ||
    source.length === 0 ||
    source.length > 8_192
  ) {
    throw new Error("contained cgroup observer process stat is invalid");
  }
  const separator = source.lastIndexOf(") ");
  const opening = source.indexOf(" (");
  if (opening < 1 || separator <= opening) {
    throw new Error("contained cgroup observer process stat is invalid");
  }
  const pid = positiveInteger(source.slice(0, opening), "process PID");
  const fields = source
    .slice(separator + 2)
    .trim()
    .split(/\s+/u);
  if (
    pid !== expectedPid ||
    fields.length < 20 ||
    !/^[A-Z]$/u.test(fields[0])
  ) {
    throw new Error("contained cgroup observer process stat is invalid");
  }
  return {
    pid,
    parentPid: nonnegativeInteger(fields[1], "parent PID"),
    startTimeTicks: String(positiveInteger(fields[19], "process start time")),
  };
}

export function selectContainedCgroupMembership(memberPids, processStats) {
  const members = new Set(memberPids);
  if (
    !(processStats instanceof Map) ||
    processStats.size !== members.size ||
    [...members].some((pid) => processStats.get(pid)?.pid !== pid)
  ) {
    throw new Error("contained cgroup observer process membership is invalid");
  }
  const roots = memberPids.filter(
    (pid) => !members.has(processStats.get(pid).parentPid),
  );
  if (roots.length !== 1) {
    throw new Error("contained cgroup observer ancestry is ambiguous");
  }
  const leaderPid = roots[0];
  const descendantsObserved = memberPids.some((pid) => {
    if (pid === leaderPid) return false;
    const visited = new Set();
    let current = pid;
    while (members.has(current) && !visited.has(current)) {
      if (current === leaderPid) return true;
      visited.add(current);
      current = processStats.get(current).parentPid;
    }
    return false;
  });
  if (!descendantsObserved) {
    throw new Error("contained cgroup observer found no candidate descendant");
  }
  return {
    leaderPid,
    leaderStartTimeTicks: processStats.get(leaderPid).startTimeTicks,
    memberPids,
    memberSetSha256: sha256CgroupBytes(canonicalCgroupJson(memberPids)),
    descendantsObserved: true,
  };
}

function scalar(source, label) {
  return positiveInteger(String(source).trim(), label);
}

function swapScalar(source) {
  const value = String(source).trim();
  return value === "0" ? 0 : positiveInteger(value, "memory swap limit");
}

function cpuLimit(source) {
  const match = String(source)
    .trim()
    .match(/^([1-9][0-9]*) ([1-9][0-9]*)$/u);
  if (match === null) {
    throw new Error("contained cgroup observer CPU limit is invalid");
  }
  return {
    cpuQuotaMicros: positiveInteger(match[1], "CPU quota"),
    cpuPeriodMicros: positiveInteger(match[2], "CPU period"),
  };
}

async function observedAggregateLimits(adapter) {
  return {
    memoryMaxBytes: scalar(
      await adapter.readCgroupFile("memory.max"),
      "memory limit",
    ),
    memorySwapMaxBytes: swapScalar(
      await adapter.readCgroupFile("memory.swap.max"),
    ),
    pidsMax: scalar(await adapter.readCgroupFile("pids.max"), "PID limit"),
    ...cpuLimit(await adapter.readCgroupFile("cpu.max")),
  };
}

async function assertProcessScopedMemoryOom(adapter) {
  if (String(await adapter.readCgroupFile("memory.oom.group")).trim() !== "0") {
    throw new Error(
      "contained cgroup observer memory OOM grouping is not process-scoped",
    );
  }
}

async function stableMembership(adapter) {
  let stableSamples = 0;
  let previousFingerprint;
  let previousPids;
  for (
    let attempt = 0;
    attempt < membershipQuiescenceMaximumAttempts;
    attempt += 1
  ) {
    const memberPids = parseContainedCgroupMembers(
      await adapter.readCgroupFile("cgroup.procs"),
    );
    const processStats = new Map();
    for (const pid of memberPids) {
      processStats.set(
        pid,
        parseContainedProcessStat(await adapter.readProcessStat(pid), pid),
      );
    }
    const confirmedMemberPids = parseContainedCgroupMembers(
      await adapter.readCgroupFile("cgroup.procs"),
    );
    if (
      canonicalCgroupJson(confirmedMemberPids) !==
      canonicalCgroupJson(memberPids)
    ) {
      stableSamples = 0;
      previousFingerprint = undefined;
      previousPids = undefined;
      await adapter.waitForMembershipSample();
      continue;
    }
    const fingerprint = canonicalCgroupJson(
      memberPids.map((pid) => processStats.get(pid)),
    );
    const pidFingerprint = canonicalCgroupJson(memberPids);
    if (
      previousPids === pidFingerprint &&
      previousFingerprint !== undefined &&
      previousFingerprint !== fingerprint
    ) {
      throw new Error(
        "contained cgroup observer process identity changed or PID was reused during stabilization",
      );
    }
    if (previousFingerprint === fingerprint) {
      stableSamples += 1;
    } else {
      stableSamples = 1;
      previousFingerprint = fingerprint;
      previousPids = pidFingerprint;
    }
    if (stableSamples >= membershipQuiescenceSamples) {
      const membership = selectContainedCgroupMembership(
        memberPids,
        processStats,
      );
      return { memberPids, membership, processStats };
    }
    await adapter.waitForMembershipSample();
  }
  throw new Error("contained cgroup observer membership did not stabilize");
}

async function assertCandidateSurvived(adapter, initial) {
  const current = parseContainedCgroupMembers(
    await adapter.readCgroupFile("cgroup.procs"),
  );
  if (
    canonicalCgroupJson(current) !== canonicalCgroupJson(initial.memberPids)
  ) {
    throw new Error("contained cgroup observer candidate membership changed");
  }
  for (const pid of initial.memberPids) {
    const observed = parseContainedProcessStat(
      await adapter.readProcessStat(pid),
      pid,
    );
    if (
      observed.startTimeTicks !== initial.processStats.get(pid).startTimeTicks
    ) {
      throw new Error("contained cgroup observer candidate PID was reused");
    }
  }
  const confirmed = parseContainedCgroupMembers(
    await adapter.readCgroupFile("cgroup.procs"),
  );
  if (
    canonicalCgroupJson(confirmed) !== canonicalCgroupJson(initial.memberPids)
  ) {
    throw new Error("contained cgroup observer membership did not stabilize");
  }
}

export async function observeContainedCgroup(
  manifest,
  adapter,
  { onPhase = () => undefined } = {},
) {
  const reportPhase = (phase) => {
    onPhase(validateObserverFailurePhase(phase));
  };
  reportPhase("WAIT_CGROUP");
  await adapter.waitForCgroup();
  reportPhase("READ_LIMITS");
  await assertProcessScopedMemoryOom(adapter);
  const observedLimits = await observedAggregateLimits(adapter);
  reportPhase("READ_MEMBERSHIP");
  const initial = await stableMembership(adapter);

  reportPhase("CPU_COUNTERS_BEFORE");
  const cpuBefore = parseContainedCgroupKeyValues(
    await adapter.readCgroupFile("cpu.stat"),
  );
  reportPhase("CPU_CONTROL");
  await adapter.runControl(
    { mode: "cpu", busyWindowMs: 500, workers: 1 },
    initial.memberPids,
  );
  reportPhase("CPU_COUNTERS_AFTER");
  const cpuAfter = parseContainedCgroupKeyValues(
    await adapter.readCgroupFile("cpu.stat"),
  );

  reportPhase("PROCESS_COUNTERS_BEFORE");
  const processesBefore = parseContainedCgroupKeyValues(
    await adapter.readCgroupFile("pids.events"),
  );
  const attemptedProcesses = observedLimits.pidsMax + 1;
  reportPhase("PROCESS_CONTROL");
  await adapter.runControl(
    { mode: "processes", attemptedProcesses },
    initial.memberPids,
  );
  reportPhase("PROCESS_COUNTERS_AFTER");
  const processesAfter = parseContainedCgroupKeyValues(
    await adapter.readCgroupFile("pids.events"),
  );

  reportPhase("MEMORY_COUNTERS_BEFORE");
  const memoryBefore = parseContainedCgroupKeyValues(
    await adapter.readCgroupFile("memory.events"),
  );
  const requestedBytes = observedLimits.memoryMaxBytes + 64 * 1024 * 1024;
  reportPhase("MEMORY_CONTROL");
  await adapter.runControl(
    { mode: "memory", requestedBytes },
    initial.memberPids,
  );
  reportPhase("MEMORY_COUNTERS_AFTER");
  const memoryAfter = parseContainedCgroupKeyValues(
    await adapter.readCgroupFile("memory.events"),
  );

  reportPhase("CANDIDATE_RECHECK");
  await assertCandidateSurvived(adapter, initial);
  reportPhase("LIMITS_RECHECK");
  await assertProcessScopedMemoryOom(adapter);
  const confirmedLimits = await observedAggregateLimits(adapter);
  if (
    canonicalCgroupJson(confirmedLimits) !== canonicalCgroupJson(observedLimits)
  ) {
    throw new Error("contained cgroup observer aggregate limits changed");
  }
  const observedAt = adapter.now().toISOString();
  const observation = {
    observedLimits,
    membership: initial.membership,
    negativeControls: {
      memory: {
        requestedBytes,
        oomKillBefore: memoryBefore.oom_kill,
        oomKillAfter: memoryAfter.oom_kill,
        enforced: memoryAfter.oom_kill === memoryBefore.oom_kill + 1,
      },
      processes: {
        attemptedProcesses,
        maxEventsBefore: processesBefore.max,
        maxEventsAfter: processesAfter.max,
        enforced: processesAfter.max > processesBefore.max,
      },
      cpu: {
        busyWindowMs: 500,
        nrThrottledBefore: cpuBefore.nr_throttled,
        nrThrottledAfter: cpuAfter.nr_throttled,
        throttledUsecBefore: cpuBefore.throttled_usec,
        throttledUsecAfter: cpuAfter.throttled_usec,
        enforced:
          cpuAfter.nr_throttled > cpuBefore.nr_throttled &&
          cpuAfter.throttled_usec > cpuBefore.throttled_usec,
      },
    },
    observedAt,
  };
  const draft = createContainedCgroupObserverDraft(manifest, observation);
  reportPhase("PUBLISH_DRAFT");
  await adapter.publishDraft(draft);
  reportPhase("WAIT_FINALIZATION");
  const finalization = validateContainedCgroupObserverFinalization(
    await adapter.waitForFinalization(),
    manifest,
    { observedAtMs: adapter.now().getTime() },
  );
  if (finalization.status !== "FINALIZE") {
    throw new Error("contained cgroup observer qualification was aborted");
  }
  if (finalization.observerDraftPayloadSha256 !== draft.receiptPayloadSha256) {
    throw new Error("contained cgroup observer finalization draft changed");
  }
  reportPhase("WAIT_CLEANUP");
  await adapter.waitForCgroupAbsent();
  const completedObservation = {
    ...observation,
    observedAt: adapter.now().toISOString(),
  };
  return validateContainedCgroupEvidence(
    hashedArtifact(
      evidencePayload(manifest, completedObservation, finalization),
    ),
    expectedEvidence(manifest),
  );
}

function privateDirectory(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o777) !== 0o700
  ) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
}

function privateFile(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o600) !== 0o600 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumArtifactBytes
  ) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
}

function writeArtifact(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  privateFile(path, "artifact");
}

function sleep(milliseconds) {
  return new Promise((accept) => setTimeout(accept, milliseconds));
}

function lstatOrAbsent(path, options) {
  try {
    return lstatSync(path, options);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function artifactExists(path) {
  return lstatOrAbsent(path) !== null;
}

export function validateContainedCgroupControlHelper(path) {
  const fromRoot = relative(repositoryRoot, path);
  const metadata = lstatSync(path);
  if (
    fromRoot === "" ||
    fromRoot.startsWith("..") ||
    isAbsolute(fromRoot) ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o022) !== 0 ||
    realpathSync(path) !== path
  ) {
    throw new Error("contained cgroup observer control helper is invalid");
  }
  return path;
}

export function containedCgroupHelperResultAccepted(
  mode,
  result,
  outputInvalid,
) {
  if (
    !["cpu", "memory", "processes"].includes(mode) ||
    result === null ||
    typeof result !== "object" ||
    Array.isArray(result) ||
    typeof outputInvalid !== "boolean"
  ) {
    throw new Error("contained cgroup observer helper result input is invalid");
  }
  if (result.error !== undefined || outputInvalid) return false;
  if (mode === "memory") {
    // memory.events is the authority for the canary. Depending on the kernel,
    // Python may report the failed charge as a non-zero exit or as SIGKILL.
    // A clean exit means the helper escaped the limit and is never accepted.
    return result.code !== 0 || result.signal !== null;
  }
  return result.code === 0 && result.signal === null;
}

async function waitUntil(predicate, label, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (predicate()) return;
    await sleep(10);
  }
  throw new Error(`contained cgroup observer ${label} timed out`);
}

function actualCgroupAdapter(manifest, paths, reportPhase) {
  const cgroupRoot = resolve(cgroupFilesystemRoot, manifest.cgroupPath);
  const cgroupParentRoot = resolve(
    cgroupFilesystemRoot,
    manifest.cgroupParentPath,
  );
  if (
    resolve(
      cgroupFilesystemRoot,
      relative(cgroupFilesystemRoot, cgroupRoot),
    ) !== cgroupRoot ||
    resolve(cgroupParentRoot, manifest.cgroupId) !== cgroupRoot ||
    statfsSync(cgroupFilesystemRoot).type !== cgroup2Magic
  ) {
    throw new Error("contained cgroup observer cgroup v2 root is invalid");
  }
  const helperPath = resolve(
    repositoryRoot,
    "scripts/contained-cgroup-control-helper.py",
  );
  validateContainedCgroupControlHelper(helperPath);
  const helperInterpreter = "/usr/bin/python3.14";
  let expectedCgroupIdentity;
  let expectedParentIdentity;
  let terminationSignal;
  const activeHelpers = new Set();

  function handleTermination(signal) {
    terminationSignal ??= signal;
    for (const helper of activeHelpers) {
      if (helper.exitCode === null && helper.signalCode === null) {
        helper.kill("SIGTERM");
      }
    }
  }

  const signalHandlers = new Map(
    ["SIGINT", "SIGTERM"].map((signal) => {
      const handler = () => handleTermination(signal);
      process.on(signal, handler);
      return [signal, handler];
    }),
  );

  function assertNotTerminated() {
    if (terminationSignal !== undefined) {
      throw new Error(
        `contained cgroup observer interrupted by ${terminationSignal}`,
      );
    }
  }

  function directoryIdentity(path, label) {
    const metadata = lstatOrAbsent(path, { bigint: true });
    if (metadata === null) return null;
    if (
      metadata.isSymbolicLink() ||
      !metadata.isDirectory() ||
      realpathSync(path) !== path ||
      statfsSync(path).type !== cgroup2Magic
    ) {
      throw new Error(`contained cgroup observer ${label} is invalid`);
    }
    return `${metadata.dev}:${metadata.ino}`;
  }

  function assertCgroupParent({ allowAbsent = false } = {}) {
    const identity = directoryIdentity(cgroupParentRoot, "cgroup parent");
    if (identity === null) {
      if (allowAbsent && expectedParentIdentity === undefined) return false;
      throw new Error("contained cgroup observer cgroup parent is absent");
    }
    if (
      expectedParentIdentity !== undefined &&
      identity !== expectedParentIdentity
    ) {
      throw new Error("contained cgroup observer cgroup parent changed");
    }
    expectedParentIdentity ??= identity;
    return true;
  }

  function currentCgroupIdentity({ allowParentAbsent = false } = {}) {
    if (!assertCgroupParent({ allowAbsent: allowParentAbsent })) return null;
    const identity = directoryIdentity(cgroupRoot, "cgroup path");
    if (
      identity !== null &&
      expectedCgroupIdentity !== undefined &&
      identity !== expectedCgroupIdentity
    ) {
      throw new Error("contained cgroup observer cgroup identity changed");
    }
    return identity;
  }

  function cgroupFile(name) {
    if (!allowedCgroupFiles.has(name)) {
      throw new Error("contained cgroup observer file is not allowlisted");
    }
    const path = resolve(cgroupRoot, name);
    if (resolve(cgroupRoot, name) !== path) {
      throw new Error("contained cgroup observer file path is invalid");
    }
    if (currentCgroupIdentity() !== expectedCgroupIdentity) {
      throw new Error("contained cgroup observer cgroup identity changed");
    }
    const metadata = lstatSync(path);
    if (
      metadata.isSymbolicLink() ||
      !metadata.isFile() ||
      realpathSync(path) !== path
    ) {
      throw new Error("contained cgroup observer file is invalid");
    }
    return path;
  }

  async function runControl(control, baselineMemberPids) {
    assertNotTerminated();
    const args =
      control.mode === "memory"
        ? [
            "--mode",
            "memory",
            "--requested-bytes",
            String(control.requestedBytes),
          ]
        : control.mode === "processes"
          ? [
              "--mode",
              "processes",
              "--attempted-processes",
              String(control.attemptedProcesses),
            ]
          : [
              "--mode",
              "cpu",
              "--busy-window-ms",
              String(control.busyWindowMs),
              "--workers",
              String(control.workers),
            ];
    const child = spawn(helperInterpreter, ["-I", "-u", helperPath, ...args], {
      cwd: repositoryRoot,
      env: { LANG: "C", LC_ALL: "C", TZ: "UTC" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    activeHelpers.add(child);
    let stdout = "";
    let stderr = "";
    let outputInvalid = false;
    const completion = new Promise((accept) => {
      child.once("error", (error) =>
        accept({ code: null, signal: null, error }),
      );
      child.once("close", (code, signal) => accept({ code, signal }));
    });
    const ready = new Promise((accept, reject) => {
      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        if (stdout.length > 8_192) {
          outputInvalid = true;
          reject(new Error("helper output exceeded bound"));
        }
        if (stdout.startsWith("READY\n")) accept();
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
        if (stderr.length > 8_192) {
          outputInvalid = true;
          reject(new Error("helper error exceeded bound"));
        }
      });
      child.once("close", () =>
        reject(new Error("helper exited before ready")),
      );
      child.once("error", reject);
    });
    const bounded = async (promise, timeoutMs, label) => {
      let timer;
      try {
        return await Promise.race([
          promise,
          new Promise((_, reject) => {
            timer = setTimeout(
              () =>
                reject(
                  new Error(`contained cgroup observer ${label} timed out`),
                ),
              timeoutMs,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    };
    try {
      const phasePrefix =
        control.mode === "cpu"
          ? "CPU"
          : control.mode === "processes"
            ? "PROCESS"
            : "MEMORY";
      reportPhase(`${phasePrefix}_HELPER_READY`);
      await bounded(ready, 5_000, "helper readiness");
      if (!Number.isSafeInteger(child.pid) || child.pid < 1 || outputInvalid) {
        throw new Error("contained cgroup observer helper PID is invalid");
      }
      const helperIdentity = parseContainedProcessStat(
        readFileSync(`/proc/${child.pid}/stat`, "utf8"),
        child.pid,
      );
      reportPhase(`${phasePrefix}_HELPER_MOVE`);
      writeFileSync(cgroupFile("cgroup.procs"), `${child.pid}\n`, "utf8");
      const membersAfterMove = parseContainedCgroupMembers(
        readFileSync(cgroupFile("cgroup.procs"), "utf8"),
      );
      const movedIdentity = parseContainedProcessStat(
        readFileSync(`/proc/${child.pid}/stat`, "utf8"),
        child.pid,
      );
      if (
        !membersAfterMove.includes(child.pid) ||
        movedIdentity.startTimeTicks !== helperIdentity.startTimeTicks
      ) {
        throw new Error("contained cgroup observer helper identity changed");
      }
      reportPhase(`${phasePrefix}_CONTROL`);
      child.stdin.end("GO\n");
      const result = await bounded(completion, 15_000, "helper completion");
      if (
        !containedCgroupHelperResultAccepted(
          control.mode,
          result,
          outputInvalid,
        )
      ) {
        throw new Error("contained cgroup observer helper result is invalid");
      }
      if (control.mode === "processes") {
        const lines = stdout.trim().split("\n");
        let report;
        try {
          report = JSON.parse(lines.at(-1));
        } catch (error) {
          throw new Error(
            "contained cgroup observer process report is invalid",
            {
              cause: error,
            },
          );
        }
        if (
          report?.attemptedProcesses !== control.attemptedProcesses ||
          report?.denied !== true
        ) {
          throw new Error(
            "contained cgroup observer process report is invalid",
          );
        }
      }
      await waitUntil(
        () =>
          !parseContainedCgroupMembers(
            readFileSync(cgroupFile("cgroup.procs"), "utf8"),
          ).includes(child.pid),
        "helper membership cleanup",
        2_000,
      );
      const remainingMembers = parseContainedCgroupMembers(
        readFileSync(cgroupFile("cgroup.procs"), "utf8"),
      );
      if (
        canonicalCgroupJson(remainingMembers) !==
        canonicalCgroupJson(baselineMemberPids)
      ) {
        throw new Error("contained cgroup observer helper descendants remain");
      }
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGTERM");
      }
      child.stdin.destroy();
      try {
        await bounded(completion, 2_000, "helper reap");
      } catch {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGKILL");
        }
        await bounded(completion, 2_000, "forced helper reap");
      }
      activeHelpers.delete(child);
      assertNotTerminated();
    }
  }

  return {
    dispose() {
      for (const [signal, handler] of signalHandlers) {
        process.off(signal, handler);
      }
    },
    now: () => new Date(),
    async waitForCgroup() {
      await waitUntil(
        () => {
          assertNotTerminated();
          return currentCgroupIdentity({ allowParentAbsent: true }) !== null;
        },
        "cgroup creation",
        cgroupStartupTimeoutMs,
      );
      expectedCgroupIdentity = currentCgroupIdentity();
      if (expectedCgroupIdentity === null) {
        throw new Error("contained cgroup observer cgroup path disappeared");
      }
      await waitUntil(
        () => {
          try {
            return (
              parseContainedCgroupMembers(
                readFileSync(cgroupFile("cgroup.procs"), "utf8"),
              ).length >= 2
            );
          } catch {
            return false;
          }
        },
        "candidate membership",
        cgroupStartupTimeoutMs,
      );
    },
    readCgroupFile(name) {
      assertNotTerminated();
      const path = cgroupFile(name);
      const source = readFileSync(path, "utf8");
      if (source.length === 0 || source.length > 8_192) {
        throw new Error("contained cgroup observer cgroup file is invalid");
      }
      return source;
    },
    readProcessStat(pid) {
      assertNotTerminated();
      return readFileSync(`/proc/${pid}/stat`, "utf8");
    },
    waitForMembershipSample() {
      assertNotTerminated();
      return new Promise((accept) =>
        setTimeout(accept, membershipQuiescenceIntervalMs),
      );
    },
    runControl,
    publishDraft(draft) {
      writeArtifact(paths.observerDraftPath, draft);
    },
    async waitForFinalization() {
      await waitUntil(
        () => {
          assertNotTerminated();
          return artifactExists(paths.finalizationPath);
        },
        "runtime finalization",
        30_000,
      );
      privateFile(paths.finalizationPath, "finalization");
      return validateContainedCgroupObserverFinalization(
        JSON.parse(readFileSync(paths.finalizationPath, "utf8")),
        manifest,
      );
    },
    async waitForCgroupAbsent() {
      await waitUntil(
        () => {
          assertNotTerminated();
          return currentCgroupIdentity() === null;
        },
        "cgroup cleanup",
        30_000,
      );
      assertCgroupParent();
      await sleep(20);
      if (currentCgroupIdentity() !== null) {
        throw new Error("contained cgroup observer cgroup path reappeared");
      }
    },
  };
}

function parseMainArguments(args) {
  if (
    args.length !== 4 ||
    args[0] !== "--session-id" ||
    args[2] !== "--manifest" ||
    !/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(args[1] ?? "") ||
    !isAbsolute(args[3] ?? "")
  ) {
    throw new Error("contained cgroup observer arguments are invalid");
  }
  return { runtimeSessionId: args[1], manifestPath: args[3] };
}

async function main() {
  const args = parseMainArguments(process.argv.slice(2));
  privateDirectory(resolve(repositoryRoot, ".rt"), "runtime root");
  const sessionRoot = resolve(repositoryRoot, ".rt", args.runtimeSessionId);
  const manifestRelative = relative(repositoryRoot, args.manifestPath);
  const manifestMatch = manifestRelative.match(
    new RegExp(
      `^\\.rt/${args.runtimeSessionId}/run/cgroup-qualification/([a-f0-9]{64})/manifest\\.json$`,
      "u",
    ),
  );
  if (manifestMatch === null || isAbsolute(manifestRelative)) {
    throw new Error("contained cgroup observer manifest path is not exact");
  }
  const paths = containedCgroupQualificationPaths({
    repositoryRoot,
    runtimeSessionId: args.runtimeSessionId,
    invocationId: manifestMatch[1],
  });
  if (args.manifestPath !== paths.manifestPath) {
    throw new Error("contained cgroup observer manifest path is not exact");
  }
  const observerBindings = resolveContainedCgroupObserverBindings({
    sessionRoot,
  });
  let failurePhase = "VALIDATE_BINDINGS";
  const reportPhase = (phase) => {
    failurePhase = validateObserverFailurePhase(phase);
  };
  privateFile(args.manifestPath, "manifest");
  const manifest = validateContainedCgroupObserverManifest(
    JSON.parse(readFileSync(args.manifestPath, "utf8")),
  );
  try {
    if (
      manifest.invocationId !== manifestMatch[1] ||
      manifest.runtimeSessionId !== args.runtimeSessionId ||
      Object.entries(observerBindings).some(
        ([name, value]) => manifest[name] !== value,
      )
    ) {
      throw new Error("contained cgroup observer live binding changed");
    }
    privateDirectory(paths.qualificationRoot, "qualification root");
    privateDirectory(paths.invocationRoot, "invocation root");
    const baseReceiptPath = resolve(repositoryRoot, manifest.baseReceiptPath);
    privateFile(baseReceiptPath, "base receipt");
    const baseReceiptSource = readFileSync(baseReceiptPath);
    const baseReceipt = JSON.parse(baseReceiptSource.toString("utf8"));
    const {
      receiptPayloadSha256: baseReceiptPayloadSha256,
      ...baseReceiptPayload
    } = baseReceipt;
    if (
      sha256CgroupBytes(baseReceiptSource) !== manifest.baseReceiptFileSha256 ||
      baseReceiptPayloadSha256 !== manifest.baseReceiptPayloadSha256 ||
      sha256CgroupBytes(canonicalCgroupJson(baseReceiptPayload)) !==
        baseReceiptPayloadSha256 ||
      baseReceipt?.schemaVersion !== "5" ||
      baseReceipt?.status !== "VALIDATED" ||
      baseReceipt?.limitMode !==
        "process-address-space-rlimit-with-unenforced-cgroup-intent" ||
      baseReceipt?.aggregateLimitIntentEnforced !== false ||
      baseReceipt?.aggregateLimitEvidence !== null ||
      baseReceipt?.finalContainerId !== manifest.finalContainerId ||
      baseReceipt?.invocationId !== manifest.invocationId ||
      baseReceipt?.sanitizedSpecSha256 !== manifest.sanitizedSpecSha256 ||
      canonicalCgroupJson(baseReceipt?.intendedAggregateLimits) !==
        canonicalCgroupJson(manifest.intendedAggregateLimits)
    ) {
      throw new Error("contained cgroup observer base receipt changed");
    }
    const adapter = actualCgroupAdapter(manifest, paths, reportPhase);
    try {
      writeArtifact(
        paths.observerReadyPath,
        createContainedCgroupObserverReady(manifest),
      );
      const evidence = await observeContainedCgroup(manifest, adapter, {
        onPhase: reportPhase,
      });
      if (artifactExists(paths.failurePath)) {
        throw new Error("contained cgroup observer outcome already failed");
      }
      writeArtifact(paths.evidencePath, evidence);
    } finally {
      adapter.dispose();
    }
  } catch (error) {
    if (
      !artifactExists(paths.evidencePath) &&
      !artifactExists(paths.failurePath)
    ) {
      try {
        writeArtifact(
          paths.failurePath,
          createContainedCgroupObserverFailure(manifest, {
            phase: failurePhase,
          }),
        );
      } catch {
        // Preserve the original fail-closed observation error.
      }
    }
    throw error;
  }
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : "contained cgroup observer failed"}\n`,
    );
    process.exitCode = 70;
  });
}
