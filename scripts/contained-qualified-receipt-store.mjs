import { lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalCgroupJson,
  sha256CgroupBytes,
  validateContainedCgroupEvidence,
} from "./contained-cgroup-evidence.mjs";
import { resolveContainedCgroupObserverBindings } from "./contained-cgroup-observer-bindings.mjs";
import {
  validateContainedCgroupObserverDraft,
  validateContainedCgroupObserverReady,
} from "./contained-cgroup-observer.mjs";
import {
  containedCgroupQualificationPaths,
  validateContainedCgroupObserverFinalization,
  validateContainedCgroupObserverManifest,
} from "./contained-cgroup-observer-protocol.mjs";
import { createQualifiedContainedRootlessReceipt } from "./contained-qualified-rootless-receipt.mjs";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const containerIdPattern = /^[a-f0-9]{64}$/u;
const sha256Pattern = /^[a-f0-9]{64}$/u;
const maximumReceiptBytes = 1_048_576;
const maximumObservationAgeMs = 5 * 60_000;

function contained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
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
    throw new Error(`qualified rootless receipt ${label} is invalid`);
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
    metadata.size > maximumReceiptBytes
  ) {
    throw new Error(`qualified rootless receipt ${label} is invalid`);
  }
}

function lstatOrAbsent(path) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function readArtifact(path, label) {
  privateFile(path, label);
  const source = readFileSync(path);
  let value;
  try {
    value = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error(`qualified rootless receipt ${label} JSON is invalid`, {
      cause: error,
    });
  }
  return { source, value };
}

function receiptPaths({ sessionRoot, finalContainerId, runtimeSessionId }) {
  if (
    !isAbsolute(sessionRoot) ||
    !contained(repositoryRoot, sessionRoot) ||
    !containerIdPattern.test(finalContainerId ?? "") ||
    !/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(runtimeSessionId ?? "") ||
    sessionRoot !== resolve(repositoryRoot, ".rt", runtimeSessionId)
  ) {
    throw new Error("qualified rootless receipt path input is invalid");
  }
  privateDirectory(resolve(repositoryRoot, ".rt"), "runtime root");
  privateDirectory(sessionRoot, "session root");
  const runRoot = resolve(sessionRoot, "run");
  const specRoot = resolve(runRoot, "rootless-specs");
  if (
    !contained(sessionRoot, runRoot) ||
    !contained(runRoot, specRoot) ||
    !contained(repositoryRoot, specRoot)
  ) {
    throw new Error("qualified rootless receipt path escaped the repository");
  }
  privateDirectory(runRoot, "run root");
  privateDirectory(specRoot, "spec root");
  return {
    baseReceiptPath: resolve(specRoot, `${finalContainerId}.receipt.json`),
  };
}

function qualifiedReceiptPath({
  finalContainerId,
  invocationId,
  runtimeSessionId,
  sessionRoot,
}) {
  if (!sha256Pattern.test(invocationId ?? "")) {
    throw new Error("qualified rootless receipt invocation is invalid");
  }
  const paths = containedCgroupQualificationPaths({
    repositoryRoot,
    runtimeSessionId,
    invocationId,
  });
  if (paths.sessionRoot !== sessionRoot) {
    throw new Error("qualified rootless receipt session path changed");
  }
  privateDirectory(paths.qualificationRoot, "qualification root");
  privateDirectory(paths.invocationRoot, "qualification invocation root");
  return resolve(
    paths.invocationRoot,
    `${finalContainerId}.qualified-receipt.json`,
  );
}

function readBaseReceipt({
  baseReceiptFileSha256,
  baseReceiptPath,
  finalContainerId,
  observerBindings,
  sessionRoot,
}) {
  if (!sha256Pattern.test(baseReceiptFileSha256 ?? "")) {
    throw new Error("qualified rootless base receipt hash is invalid");
  }
  const expected = receiptPaths({
    sessionRoot,
    finalContainerId,
    runtimeSessionId: observerBindings.runtimeSessionId,
  });
  if (baseReceiptPath !== expected.baseReceiptPath) {
    throw new Error("qualified rootless receipt base path changed");
  }
  privateFile(baseReceiptPath, "base receipt");
  const source = readFileSync(baseReceiptPath);
  if (sha256CgroupBytes(source) !== baseReceiptFileSha256) {
    throw new Error("qualified rootless base receipt changed");
  }
  let receipt;
  try {
    receipt = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error("qualified rootless base receipt JSON is invalid", {
      cause: error,
    });
  }
  if (receipt?.finalContainerId !== finalContainerId) {
    throw new Error("qualified rootless base receipt identity changed");
  }
  return { expected, receipt, source };
}

function exactTimestamp(value, label) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    throw new Error(`qualified rootless receipt ${label} is invalid`);
  }
  return parsed;
}

function readObservationChain({
  baseReceipt,
  baseReceiptSource,
  currentTime,
  enforceFreshness,
  observerBindings,
  sessionRoot,
}) {
  const paths = containedCgroupQualificationPaths({
    repositoryRoot,
    runtimeSessionId: observerBindings.runtimeSessionId,
    invocationId: baseReceipt.invocationId,
  });
  privateDirectory(paths.qualificationRoot, "qualification root");
  privateDirectory(paths.invocationRoot, "qualification invocation root");
  if (lstatOrAbsent(paths.failurePath) !== null) {
    throw new Error("qualified rootless receipt observation failed");
  }

  const manifestArtifact = readArtifact(paths.manifestPath, "manifest");
  const manifestRequestedAt = exactTimestamp(
    manifestArtifact.value?.requestedAt,
    "manifest timestamp",
  );
  const manifest = validateContainedCgroupObserverManifest(
    manifestArtifact.value,
    { observedAtMs: manifestRequestedAt },
  );
  const expectedBaseReceiptPath = `.rt/${observerBindings.runtimeSessionId}/run/rootless-specs/${baseReceipt.finalContainerId}.receipt.json`;
  if (
    manifest.baseReceiptPath !== expectedBaseReceiptPath ||
    manifest.baseReceiptFileSha256 !== sha256CgroupBytes(baseReceiptSource) ||
    manifest.baseReceiptPayloadSha256 !== baseReceipt.receiptPayloadSha256 ||
    manifest.finalContainerId !== baseReceipt.finalContainerId ||
    manifest.invocationId !== baseReceipt.invocationId ||
    manifest.sanitizedSpecSha256 !== baseReceipt.sanitizedSpecSha256 ||
    canonicalCgroupJson(manifest.intendedAggregateLimits) !==
      canonicalCgroupJson(baseReceipt.intendedAggregateLimits) ||
    Object.entries(observerBindings).some(
      ([name, value]) => manifest[name] !== value,
    ) ||
    paths.sessionRoot !== sessionRoot
  ) {
    throw new Error("qualified rootless receipt manifest binding changed");
  }

  const readyArtifact = readArtifact(paths.observerReadyPath, "observer ready");
  const ready = validateContainedCgroupObserverReady(
    readyArtifact.value,
    manifest,
  );
  const draftArtifact = readArtifact(paths.observerDraftPath, "observer draft");
  const draft = validateContainedCgroupObserverDraft(
    draftArtifact.value,
    manifest,
  );
  const finalizationArtifact = readArtifact(
    paths.finalizationPath,
    "finalization",
  );
  const finalizationDecisionAt = exactTimestamp(
    finalizationArtifact.value?.decisionAt,
    "finalization timestamp",
  );
  const finalization = validateContainedCgroupObserverFinalization(
    finalizationArtifact.value,
    manifest,
    { observedAtMs: finalizationDecisionAt },
  );
  if (
    finalization.status !== "FINALIZE" ||
    finalization.observerDraftPayloadSha256 !== draft.receiptPayloadSha256
  ) {
    throw new Error("qualified rootless receipt finalization did not qualify");
  }

  const evidenceArtifact = readArtifact(
    paths.evidencePath,
    "aggregate evidence",
  );
  const evidence = validateContainedCgroupEvidence(evidenceArtifact.value, {
    invocationId: baseReceipt.invocationId,
    finalContainerId: baseReceipt.finalContainerId,
    sanitizedSpecSha256: baseReceipt.sanitizedSpecSha256,
    intendedAggregateLimits: baseReceipt.intendedAggregateLimits,
    ...observerBindings,
  });
  const armedAt = exactTimestamp(ready.armedAt, "observer ready timestamp");
  const draftObservedAt = exactTimestamp(
    draft.observedAt,
    "observer draft timestamp",
  );
  const evidenceObservedAt = exactTimestamp(
    evidence.observedAt,
    "aggregate evidence timestamp",
  );
  if (
    evidence.finalizationPayloadSha256 !== finalization.receiptPayloadSha256 ||
    canonicalCgroupJson(evidence.observedLimits) !==
      canonicalCgroupJson(draft.observedLimits) ||
    canonicalCgroupJson(evidence.membership) !==
      canonicalCgroupJson(draft.membership) ||
    canonicalCgroupJson(evidence.negativeControls) !==
      canonicalCgroupJson(draft.negativeControls) ||
    manifestRequestedAt > armedAt ||
    armedAt > draftObservedAt ||
    draftObservedAt > finalizationDecisionAt ||
    finalizationDecisionAt > evidenceObservedAt ||
    evidenceObservedAt - manifestRequestedAt > maximumObservationAgeMs
  ) {
    throw new Error("qualified rootless receipt observation chain changed");
  }
  if (
    enforceFreshness &&
    (!Number.isFinite(currentTime) ||
      evidenceObservedAt > currentTime ||
      currentTime - evidenceObservedAt > maximumObservationAgeMs)
  ) {
    throw new Error("qualified rootless receipt observation is stale");
  }
  if (lstatOrAbsent(paths.failurePath) !== null) {
    throw new Error("qualified rootless receipt terminal artifacts conflict");
  }
  return {
    evidence,
    evidenceFileSha256: sha256CgroupBytes(evidenceArtifact.source),
    evidencePath: paths.evidencePath,
    finalizationFileSha256: sha256CgroupBytes(finalizationArtifact.source),
    finalizationPath: paths.finalizationPath,
    finalizationPayloadSha256: finalization.receiptPayloadSha256,
    manifestFileSha256: sha256CgroupBytes(manifestArtifact.source),
    manifestPath: paths.manifestPath,
    observerDraftFileSha256: sha256CgroupBytes(draftArtifact.source),
    observerDraftPath: paths.observerDraftPath,
    observerReadyFileSha256: sha256CgroupBytes(readyArtifact.source),
    observerReadyPath: paths.observerReadyPath,
  };
}

function observationArtifactIdentity(observation) {
  return canonicalCgroupJson({
    evidenceFileSha256: observation.evidenceFileSha256,
    evidencePath: observation.evidencePath,
    finalizationFileSha256: observation.finalizationFileSha256,
    finalizationPath: observation.finalizationPath,
    finalizationPayloadSha256: observation.finalizationPayloadSha256,
    manifestFileSha256: observation.manifestFileSha256,
    manifestPath: observation.manifestPath,
    observerDraftFileSha256: observation.observerDraftFileSha256,
    observerDraftPath: observation.observerDraftPath,
    observerReadyFileSha256: observation.observerReadyFileSha256,
    observerReadyPath: observation.observerReadyPath,
  });
}

export function persistQualifiedContainedRootlessReceipt(
  input,
  {
    now = () => Date.now(),
    resolveObserverBindings = resolveContainedCgroupObserverBindings,
  } = {},
) {
  if (Object.hasOwn(input, "aggregateLimitEvidence")) {
    throw new Error("qualified rootless receipt caller evidence is forbidden");
  }
  const observerBindings = resolveObserverBindings({
    sessionRoot: input.sessionRoot,
  });
  const currentTime = now();
  const { receipt: baseReceipt, source: baseReceiptSource } = readBaseReceipt({
    ...input,
    observerBindings,
  });
  const initialObservation = readObservationChain({
    baseReceipt,
    baseReceiptSource,
    currentTime,
    enforceFreshness: true,
    observerBindings,
    sessionRoot: input.sessionRoot,
  });
  const observation = readObservationChain({
    baseReceipt,
    baseReceiptSource,
    currentTime: now(),
    enforceFreshness: true,
    observerBindings,
    sessionRoot: input.sessionRoot,
  });
  if (
    observationArtifactIdentity(initialObservation) !==
    observationArtifactIdentity(observation)
  ) {
    throw new Error("qualified rootless receipt terminal artifacts changed");
  }
  const qualifiedReceipt = createQualifiedContainedRootlessReceipt({
    aggregateLimitEvidence: observation.evidence,
    baseReceipt,
    observerBindings,
  });
  const source = `${JSON.stringify(qualifiedReceipt, null, 2)}\n`;
  const qualifiedPath = qualifiedReceiptPath({
    finalContainerId: baseReceipt.finalContainerId,
    invocationId: baseReceipt.invocationId,
    runtimeSessionId: observerBindings.runtimeSessionId,
    sessionRoot: input.sessionRoot,
  });
  try {
    writeFileSync(qualifiedPath, source, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      throw new Error("qualified rootless receipt already exists", {
        cause: error,
      });
    }
    throw error;
  }
  privateFile(qualifiedPath, "qualified receipt");
  return {
    qualifiedReceipt,
    qualifiedReceiptFileSha256: sha256CgroupBytes(source),
    qualifiedReceiptPath: qualifiedPath,
    qualifiedReceiptPayloadSha256: qualifiedReceipt.receiptPayloadSha256,
    qualificationArtifacts: observation,
  };
}

export function verifyQualifiedContainedRootlessReceipt(
  input,
  { resolveObserverBindings = resolveContainedCgroupObserverBindings } = {},
) {
  const observerBindings = resolveObserverBindings({
    sessionRoot: input.sessionRoot,
  });
  const { receipt: baseReceipt, source: baseReceiptSource } = readBaseReceipt({
    ...input,
    observerBindings,
  });
  const qualifiedPath = qualifiedReceiptPath({
    finalContainerId: baseReceipt.finalContainerId,
    invocationId: baseReceipt.invocationId,
    runtimeSessionId: observerBindings.runtimeSessionId,
    sessionRoot: input.sessionRoot,
  });
  if (
    input.qualifiedReceiptPath !== qualifiedPath ||
    !sha256Pattern.test(input.qualifiedReceiptFileSha256 ?? "")
  ) {
    throw new Error("qualified rootless receipt path or hash changed");
  }
  privateFile(input.qualifiedReceiptPath, "qualified receipt");
  const source = readFileSync(input.qualifiedReceiptPath);
  if (sha256CgroupBytes(source) !== input.qualifiedReceiptFileSha256) {
    throw new Error("qualified rootless receipt file changed");
  }
  let qualifiedReceipt;
  try {
    qualifiedReceipt = JSON.parse(source.toString("utf8"));
  } catch (error) {
    throw new Error("qualified rootless receipt JSON is invalid", {
      cause: error,
    });
  }
  const observation = readObservationChain({
    baseReceipt,
    baseReceiptSource,
    enforceFreshness: false,
    observerBindings,
    sessionRoot: input.sessionRoot,
  });
  const expectedReceipt = createQualifiedContainedRootlessReceipt({
    aggregateLimitEvidence: observation.evidence,
    baseReceipt,
    observerBindings,
  });
  const expectedSource = `${JSON.stringify(expectedReceipt, null, 2)}\n`;
  if (!source.equals(Buffer.from(expectedSource))) {
    throw new Error("qualified rootless receipt binding changed");
  }
  return qualifiedReceipt;
}
