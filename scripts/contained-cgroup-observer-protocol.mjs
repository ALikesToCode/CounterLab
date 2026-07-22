import { isAbsolute, relative, resolve } from "node:path";

import { AGGREGATE_TIMEOUT_QUALIFICATION_MODE } from "./contained-runtime-request.mjs";
import {
  canonicalCgroupJson,
  createContainedCgroupIdentity,
  createContainedCgroupPath,
  sha256CgroupBytes,
} from "./contained-cgroup-evidence.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/u;
const sessionPattern = /^rt-[a-z0-9][a-z0-9-]{7,13}$/u;
const maximumAgeMs = 5 * 60_000;
const finalizationReasonByStatus = Object.freeze({
  ABORT: "QUALIFICATION_ABORTED",
  FINALIZE: "AGGREGATE_TIMEOUT_CONFIRMED",
});
const allowedAbortCodes = new Set([
  "CLEANUP_UNVERIFIED",
  "OBSERVER_FAILED",
  "RESULT_RELEASED",
  "RUNTIME_FAILED",
  "TIMEOUT_NOT_OBSERVED",
]);
const cleanupKeys = [
  "containerAbsent",
  "imageRootfsAbsent",
  "imageRootfsUnchanged",
  "invocationAliasAbsent",
  "persistedAuthorityVerified",
  "readOnlyMountsUnchanged",
  "snapshotAbsent",
  "taskAbsent",
];

const manifestKeys = [
  "baseReceiptFileSha256",
  "baseReceiptPath",
  "baseReceiptPayloadSha256",
  "cgroupId",
  "cgroupIdentity",
  "cgroupParentPath",
  "cgroupPath",
  "driverCliSha256",
  "driverModuleSha256",
  "finalContainerId",
  "intendedAggregateLimits",
  "invocationId",
  "qualificationMode",
  "receiptPayloadSha256",
  "requestedAt",
  "runtimeAttestationSha256",
  "runtimeSessionId",
  "sanitizedSpecSha256",
  "schemaVersion",
  "status",
];

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

function validTimestamp(value, observedAtMs) {
  if (typeof value !== "string") return false;
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) &&
    new Date(parsed).toISOString() === value &&
    Math.abs(observedAtMs - parsed) <= maximumAgeMs
  );
}

function validIntent(value) {
  const intent = object(value, "aggregate intent");
  exactKeys(
    intent,
    ["cpuCount", "maxProcesses", "memoryBytes"],
    "aggregate intent",
  );
  if (
    typeof intent.cpuCount !== "number" ||
    !Number.isFinite(intent.cpuCount) ||
    intent.cpuCount < 0.25 ||
    intent.cpuCount > 2 ||
    !Number.isSafeInteger(intent.maxProcesses) ||
    intent.maxProcesses < 1 ||
    intent.maxProcesses > 32 ||
    !Number.isSafeInteger(intent.memoryBytes) ||
    intent.memoryBytes < 64 * 1024 * 1024 ||
    intent.memoryBytes > 1024 * 1024 * 1024
  ) {
    throw new Error("contained cgroup observer aggregate intent is invalid");
  }
  return intent;
}

export function validateContainedCgroupObserverManifest(
  value,
  { observedAtMs = Date.now() } = {},
) {
  const manifest = object(value, "manifest");
  exactKeys(manifest, manifestKeys, "manifest");
  const intent = validIntent(manifest.intendedAggregateLimits);
  const expectedReceiptPath = `.rt/${manifest.runtimeSessionId}/run/rootless-specs/${manifest.finalContainerId}.receipt.json`;
  const { receiptPayloadSha256, ...payload } = manifest;
  if (
    manifest.schemaVersion !== "2" ||
    manifest.status !== "REQUESTED" ||
    manifest.qualificationMode !== AGGREGATE_TIMEOUT_QUALIFICATION_MODE ||
    !sessionPattern.test(manifest.runtimeSessionId ?? "") ||
    !sha256Pattern.test(manifest.invocationId ?? "") ||
    !sha256Pattern.test(manifest.finalContainerId ?? "") ||
    !sha256Pattern.test(manifest.sanitizedSpecSha256 ?? "") ||
    !sha256Pattern.test(manifest.baseReceiptFileSha256 ?? "") ||
    !sha256Pattern.test(manifest.baseReceiptPayloadSha256 ?? "") ||
    !sha256Pattern.test(manifest.runtimeAttestationSha256 ?? "") ||
    !sha256Pattern.test(manifest.driverCliSha256 ?? "") ||
    !sha256Pattern.test(manifest.driverModuleSha256 ?? "") ||
    manifest.baseReceiptPath !== expectedReceiptPath ||
    manifest.cgroupId !== `counterlab-v6.1-${manifest.invocationId}` ||
    !["", "containerd"].includes(manifest.cgroupParentPath) ||
    manifest.cgroupPath !==
      createContainedCgroupPath(
        manifest.invocationId,
        manifest.cgroupParentPath,
      ) ||
    manifest.cgroupIdentity !== createContainedCgroupIdentity(manifest) ||
    !validTimestamp(manifest.requestedAt, observedAtMs) ||
    !sha256Pattern.test(receiptPayloadSha256 ?? "") ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error("contained cgroup observer manifest binding is invalid");
  }
  return manifest;
}

export function createContainedCgroupObserverManifest({
  baseReceiptFileSha256,
  baseReceiptPayloadSha256,
  finalContainerId,
  intendedAggregateLimits,
  invocationId,
  observerBindings,
  requestedAt = new Date(),
  sanitizedSpecSha256,
}) {
  if (
    !(requestedAt instanceof Date) ||
    !Number.isFinite(requestedAt.getTime())
  ) {
    throw new Error("contained cgroup observer request time is invalid");
  }
  const payload = {
    schemaVersion: "2",
    status: "REQUESTED",
    qualificationMode: AGGREGATE_TIMEOUT_QUALIFICATION_MODE,
    runtimeSessionId: observerBindings?.runtimeSessionId,
    invocationId,
    finalContainerId,
    cgroupId: `counterlab-v6.1-${invocationId}`,
    cgroupParentPath: observerBindings?.cgroupParentPath,
    cgroupPath: createContainedCgroupPath(
      invocationId,
      observerBindings?.cgroupParentPath,
    ),
    cgroupIdentity: createContainedCgroupIdentity({
      invocationId,
      finalContainerId,
      sanitizedSpecSha256,
    }),
    sanitizedSpecSha256,
    intendedAggregateLimits,
    baseReceiptPath: `.rt/${observerBindings?.runtimeSessionId}/run/rootless-specs/${finalContainerId}.receipt.json`,
    baseReceiptFileSha256,
    baseReceiptPayloadSha256,
    runtimeAttestationSha256: observerBindings?.runtimeAttestationSha256,
    driverCliSha256: observerBindings?.driverCliSha256,
    driverModuleSha256: observerBindings?.driverModuleSha256,
    requestedAt: requestedAt.toISOString(),
  };
  return validateContainedCgroupObserverManifest(
    {
      ...payload,
      receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
    },
    { observedAtMs: requestedAt.getTime() },
  );
}

export function validateContainedCgroupObserverFinalization(
  value,
  manifest,
  { observedAtMs = Date.now() } = {},
) {
  const finalization = object(value, "finalization");
  exactKeys(
    finalization,
    [
      "abortCode",
      "cleanup",
      "cleanupVerified",
      "decisionAt",
      "finalContainerId",
      "invocationId",
      "manifestPayloadSha256",
      "observerDraftPayloadSha256",
      "reason",
      "receiptPayloadSha256",
      "resultReleased",
      "schemaVersion",
      "status",
      "timeoutObserved",
    ],
    "finalization",
  );
  const { receiptPayloadSha256, ...payload } = finalization;
  const requestedAtMs = Date.parse(manifest?.requestedAt);
  const decisionAtMs = Date.parse(finalization.decisionAt);
  const cleanup = object(finalization.cleanup, "finalization cleanup");
  exactKeys(cleanup, cleanupKeys, "finalization cleanup");
  const cleanupValuesAreBoolean = cleanupKeys.every(
    (key) => typeof cleanup[key] === "boolean",
  );
  const everyCleanupCheckPassed = cleanupKeys.every(
    (key) => cleanup[key] === true,
  );
  const finalizesQualification =
    finalization.status === "FINALIZE" &&
    finalization.timeoutObserved === true &&
    finalization.resultReleased === false &&
    finalization.cleanupVerified === true &&
    everyCleanupCheckPassed;
  const abortsQualification = finalization.status === "ABORT";
  const draftBindingIsValid = finalizesQualification
    ? sha256Pattern.test(finalization.observerDraftPayloadSha256 ?? "")
    : finalization.observerDraftPayloadSha256 === null ||
      sha256Pattern.test(finalization.observerDraftPayloadSha256 ?? "");
  if (
    finalization.schemaVersion !== "1" ||
    (!finalizesQualification && !abortsQualification) ||
    finalization.reason !== finalizationReasonByStatus[finalization.status] ||
    (finalizesQualification
      ? finalization.abortCode !== null
      : !allowedAbortCodes.has(finalization.abortCode)) ||
    finalization.manifestPayloadSha256 !== manifest?.receiptPayloadSha256 ||
    !draftBindingIsValid ||
    finalization.invocationId !== manifest?.invocationId ||
    finalization.finalContainerId !== manifest?.finalContainerId ||
    typeof finalization.timeoutObserved !== "boolean" ||
    typeof finalization.resultReleased !== "boolean" ||
    typeof finalization.cleanupVerified !== "boolean" ||
    !cleanupValuesAreBoolean ||
    !validTimestamp(finalization.decisionAt, observedAtMs) ||
    !Number.isFinite(requestedAtMs) ||
    !Number.isFinite(decisionAtMs) ||
    decisionAtMs < requestedAtMs ||
    decisionAtMs - requestedAtMs > maximumAgeMs ||
    !sha256Pattern.test(receiptPayloadSha256 ?? "") ||
    sha256CgroupBytes(canonicalCgroupJson(payload)) !== receiptPayloadSha256
  ) {
    throw new Error(
      "contained cgroup observer finalization binding is invalid",
    );
  }
  return finalization;
}

export function createContainedCgroupObserverFinalization(
  manifest,
  {
    abortCode = null,
    cleanup,
    cleanupVerified,
    decisionAt = new Date(),
    observerDraftPayloadSha256,
    resultReleased,
    status,
    timeoutObserved,
  },
) {
  if (!(decisionAt instanceof Date) || !Number.isFinite(decisionAt.getTime())) {
    throw new Error("contained cgroup observer decision time is invalid");
  }
  const payload = {
    schemaVersion: "1",
    status,
    reason: finalizationReasonByStatus[status],
    abortCode,
    cleanup,
    manifestPayloadSha256: manifest?.receiptPayloadSha256,
    observerDraftPayloadSha256,
    invocationId: manifest?.invocationId,
    finalContainerId: manifest?.finalContainerId,
    timeoutObserved,
    resultReleased,
    cleanupVerified,
    decisionAt: decisionAt.toISOString(),
  };
  return validateContainedCgroupObserverFinalization(
    {
      ...payload,
      receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
    },
    manifest,
    { observedAtMs: decisionAt.getTime() },
  );
}

export function containedCgroupQualificationPaths({
  repositoryRoot,
  runtimeSessionId,
  invocationId,
}) {
  if (
    !isAbsolute(repositoryRoot) ||
    !sessionPattern.test(runtimeSessionId ?? "") ||
    !sha256Pattern.test(invocationId ?? "")
  ) {
    throw new Error("contained cgroup observer path input is invalid");
  }
  const sessionRoot = resolve(repositoryRoot, ".rt", runtimeSessionId);
  const qualificationRoot = resolve(sessionRoot, "run/cgroup-qualification");
  const invocationRoot = resolve(qualificationRoot, invocationId);
  for (const candidate of [sessionRoot, qualificationRoot, invocationRoot]) {
    const fromRoot = relative(repositoryRoot, candidate);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new Error("contained cgroup observer path escaped the repository");
    }
  }
  return Object.freeze({
    evidencePath: resolve(invocationRoot, "aggregate-evidence.json"),
    failurePath: resolve(invocationRoot, "failure.json"),
    finalizationPath: resolve(invocationRoot, "finalization.json"),
    invocationRoot,
    manifestPath: resolve(invocationRoot, "manifest.json"),
    observerDraftPath: resolve(invocationRoot, "observer-draft.json"),
    observerReadyPath: resolve(invocationRoot, "observer-ready.json"),
    qualificationRoot,
    sessionRoot,
  });
}
