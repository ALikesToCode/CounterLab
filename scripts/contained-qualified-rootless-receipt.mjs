import {
  QUALIFIED_AGGREGATE_LIMIT_MODE,
  canonicalCgroupJson,
  sha256CgroupBytes,
  validateContainedCgroupEvidence,
} from "./contained-cgroup-evidence.mjs";

export const UNQUALIFIED_AGGREGATE_LIMIT_MODE =
  "process-address-space-rlimit-with-unenforced-cgroup-intent";

const rootlessReceiptKeys = [
  "aggregateLimitEvidence",
  "aggregateLimitIntentEnforced",
  "baseSpecSha256",
  "commandSha256",
  "configFileSha256",
  "enforcedRlimits",
  "finalContainerId",
  "imageAuthority",
  "imageRootfs",
  "intendedAggregateLimits",
  "internalMountManifest",
  "internalMountManifestSha256",
  "invocationId",
  "limitMode",
  "metadataSha256",
  "normalizedFields",
  "originalSpecSha256",
  "readOnlyMountManifest",
  "readOnlyMountManifestSha256",
  "receiptPayloadSha256",
  "removedFields",
  "removedMounts",
  "sanitizedSpecSha256",
  "schemaVersion",
  "stagingContainerId",
  "status",
];

const observerBindingKeys = [
  "cgroupParentPath",
  "driverCliSha256",
  "driverModuleSha256",
  "runtimeAttestationSha256",
  "runtimeSessionId",
];

function object(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`qualified rootless receipt ${label} shape is invalid`);
  }
  return value;
}

function exactKeys(value, keys, label) {
  if (
    JSON.stringify(Object.keys(value).sort()) !==
    JSON.stringify([...keys].sort())
  ) {
    throw new Error(`qualified rootless receipt ${label} shape is invalid`);
  }
}

export function createQualifiedContainedRootlessReceipt({
  aggregateLimitEvidence,
  baseReceipt: baseValue,
  observerBindings: observerValue,
}) {
  const baseReceipt = object(baseValue, "base");
  const observerBindings = object(observerValue, "observer binding");
  exactKeys(baseReceipt, rootlessReceiptKeys, "base");
  exactKeys(observerBindings, observerBindingKeys, "observer binding");
  const { receiptPayloadSha256, ...basePayload } = baseReceipt;
  if (
    baseReceipt.schemaVersion !== "5" ||
    baseReceipt.status !== "VALIDATED" ||
    baseReceipt.limitMode !== UNQUALIFIED_AGGREGATE_LIMIT_MODE ||
    baseReceipt.aggregateLimitIntentEnforced !== false ||
    baseReceipt.aggregateLimitEvidence !== null ||
    typeof receiptPayloadSha256 !== "string" ||
    !/^[a-f0-9]{64}$/u.test(receiptPayloadSha256) ||
    sha256CgroupBytes(canonicalCgroupJson(basePayload)) !== receiptPayloadSha256
  ) {
    throw new Error("qualified rootless receipt base binding is invalid");
  }
  const evidence = validateContainedCgroupEvidence(aggregateLimitEvidence, {
    invocationId: baseReceipt.invocationId,
    finalContainerId: baseReceipt.finalContainerId,
    sanitizedSpecSha256: baseReceipt.sanitizedSpecSha256,
    intendedAggregateLimits: baseReceipt.intendedAggregateLimits,
    ...observerBindings,
  });
  const payload = {
    ...basePayload,
    limitMode: QUALIFIED_AGGREGATE_LIMIT_MODE,
    aggregateLimitIntentEnforced: true,
    aggregateLimitEvidence: evidence,
  };
  return {
    ...payload,
    receiptPayloadSha256: sha256CgroupBytes(canonicalCgroupJson(payload)),
  };
}
