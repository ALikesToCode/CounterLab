import {
  ArtifactManifestSchema,
  CANONICAL_JSON_PROFILE,
  VerifiedResultSetSchema,
  canonicalJsonV1,
} from "@counterlab/contracts";
import { hashExperimentIR } from "@counterlab/experiment-ir";
import {
  ScientificEngineSnapshotSchema,
  hashScientificEngineSnapshot,
} from "@counterlab/scientific-engine-registry/browser";
import { z } from "zod";

import {
  FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1,
  verifyFixedLeakageSampleBoundaryFixture,
} from "./sample-boundary-authority.js";

const SAMPLE_CAPSULE_FORMAT = "counterlab-sample-proof-capsule" as const;
const SAMPLE_CAPSULE_MEDIA_TYPE =
  "application/vnd.counterlab.sample-capsule+json" as const;
const SAMPLE_CAPSULE_ROOT_DOMAIN = "counterlab-sample-proof-capsule-root-v1\0";
const MAX_CAPSULE_BYTES = 16_777_216;
const MAX_ENTRY_BYTES = 10_485_760;

const NonEmptyString = z.string().trim().min(1);
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "expected a lowercase SHA-256 digest");
const GitCommitSchema = z
  .string()
  .regex(/^[a-f0-9]{40}$/u, "expected a full lowercase Git commit");
const ImageDigestSchema = z
  .string()
  .regex(/^sha256:[a-f0-9]{64}$/u, "expected a sha256 image digest");
const EnvironmentKindSchema = z.enum([
  "local_candidate",
  "cloudflare_production",
]);

export const SAMPLE_PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS = [
  "artifact-manifest.json",
  "primary-result.json",
  "sample-boundary-fixture.json",
  "scientific-engine-snapshot.json",
  "scientific-engine-snapshot-ref.json",
  "sbom-manifest.json",
] as const;

const GENERATED_PATHS = ["manifest.json", "README.txt"] as const;
const ALL_PATHS = [
  ...SAMPLE_PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
  ...GENERATED_PATHS,
] as const;
const ALL_PATH_SET = new Set<string>(ALL_PATHS);
const REQUIRED_PAYLOAD_PATH_SET = new Set<string>(
  SAMPLE_PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
);

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  "artifact-manifest.json": "application/json",
  "primary-result.json": "application/json",
  "sample-boundary-fixture.json": "application/json",
  "scientific-engine-snapshot.json": "application/json",
  "scientific-engine-snapshot-ref.json": "application/json",
  "sbom-manifest.json": "application/json",
  "manifest.json": "application/json",
  "README.txt": "text/plain;charset=utf-8",
};

const EntryDescriptorSchema = z
  .object({
    path: NonEmptyString,
    mediaType: NonEmptyString,
    byteLength: z.number().int().nonnegative().max(MAX_ENTRY_BYTES),
    sha256: Sha256Schema,
  })
  .strict();

const EntrySchema = EntryDescriptorSchema.extend({
  contentEncoding: z.literal("utf-8"),
  content: z.string(),
}).strict();

export const SampleProofCapsuleAuthorityV1Schema = z
  .object({
    sourceArtifactFileSha256: Sha256Schema,
    artifactManifestFileSha256: Sha256Schema,
    primaryResultCanonicalHash: Sha256Schema,
    primaryResultFileSha256: Sha256Schema,
    experimentIrHash: Sha256Schema,
    technicalReportHash: Sha256Schema,
    evidenceVerdictHash: Sha256Schema,
    boundaryResultHash: Sha256Schema,
    boundaryVerificationReportHash: Sha256Schema,
    boundaryReceiptHash: Sha256Schema,
    fixtureIntegrityHash: Sha256Schema,
    scientificEngineSnapshotAuthorityHash: Sha256Schema,
    scientificEngineSnapshotFileSha256: Sha256Schema,
    sbomManifestSha256: Sha256Schema,
    fixedKernelEvidence: z
      .object({
        role: z.literal("build-time-fixed-kernel-fixture"),
        kernelVersion: NonEmptyString,
        technicalVerification: z.literal("VERIFIED"),
        releaseRegenerationCheck: z.literal("required"),
      })
      .strict(),
    reproductionCandidate: z
      .object({
        role: z.literal("reproduction-candidate"),
        generatedAt: z.iso.datetime({ offset: true }),
        sourceCommit: GitCommitSchema,
        imageDigest: ImageDigestSchema,
        environmentId: NonEmptyString,
        environmentKind: EnvironmentKindSchema,
        executionReceiptIncluded: z.literal(false),
        embeddedEngineEvidenceFiles: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type SampleProofCapsuleAuthorityV1 = z.infer<
  typeof SampleProofCapsuleAuthorityV1Schema
>;

const CallsSchema = z
  .object({
    gpt56: z.literal("not-called"),
    runtimeCodex: z.literal("not-called"),
    runner: z.literal("not-called"),
  })
  .strict();

const LearnerEpisodeSchema = z
  .object({
    predictionIncluded: z.literal(false),
    revisionIncluded: z.literal(false),
    eventChainIncluded: z.literal(false),
  })
  .strict();

const SampleModeSchema = z
  .object({
    kind: z.literal("sample_lesson"),
    sampleId: z.literal("leakage-01"),
  })
  .strict();

export const SampleProofCapsuleManifestV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    format: z.literal(SAMPLE_CAPSULE_FORMAT),
    capsuleId: z.literal("sample-proof-leakage-01-v1"),
    mode: SampleModeSchema,
    concept: z.literal("entity_leakage"),
    supportLabel: z.literal("Verified sample evidence"),
    canonicalProfile: z.literal(CANONICAL_JSON_PROFILE),
    evidenceAsOf: z.iso.datetime({ offset: true }),
    fixtureGeneratedAt: z.iso.datetime({ offset: true }),
    authority: SampleProofCapsuleAuthorityV1Schema,
    calls: CallsSchema,
    learnerEpisode: LearnerEpisodeSchema,
    fixtureAuthorApprovalMeaning: z.literal(
      "fixed-fixture-author-approval-not-observed-learner-action",
    ),
    liveProofCapsuleV2: z.literal(false),
    rawSourceArtifactIncluded: z.literal(false),
    limitations: z.array(NonEmptyString).min(1).max(32),
    nonClaims: z.array(NonEmptyString).min(1).max(32),
    entries: z.array(EntryDescriptorSchema).min(1).max(16),
  })
  .strict();

export type SampleProofCapsuleManifestV1 = z.infer<
  typeof SampleProofCapsuleManifestV1Schema
>;

export const SampleProofCapsuleEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    format: z.literal(SAMPLE_CAPSULE_FORMAT),
    capsuleId: z.literal("sample-proof-leakage-01-v1"),
    mode: SampleModeSchema,
    canonicalProfile: z.literal(CANONICAL_JSON_PROFILE),
    evidenceAsOf: z.iso.datetime({ offset: true }),
    entries: z.array(EntrySchema).min(1).max(16),
    integrity: z
      .object({
        mode: z.literal("integrity-hashed"),
        algorithm: z.literal("sha256"),
        rootHash: Sha256Schema,
      })
      .strict(),
  })
  .strict();

export type SampleProofCapsuleEnvelopeV1 = z.infer<
  typeof SampleProofCapsuleEnvelopeV1Schema
>;

export const SampleProofCapsuleReferenceV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    capsuleId: z.literal("sample-proof-leakage-01-v1"),
    assetFile: z.literal("leakage_sample_proof_capsule_v1.counterlab"),
    mediaType: z.literal(SAMPLE_CAPSULE_MEDIA_TYPE),
    byteLength: z.number().int().positive().max(MAX_CAPSULE_BYTES),
    bytesSha256: Sha256Schema,
    rootHash: Sha256Schema,
    fixtureIntegrityHash: Sha256Schema,
    sourceArtifactFileSha256: Sha256Schema,
    artifactManifestFileSha256: Sha256Schema,
    primaryResultCanonicalHash: Sha256Schema,
    boundaryResultHash: Sha256Schema,
    scientificEngineSnapshotAuthorityHash: Sha256Schema,
  })
  .strict();

export type SampleProofCapsuleReferenceV1 = z.infer<
  typeof SampleProofCapsuleReferenceV1Schema
>;

export type SampleProofCapsulePayloadEntryInput = Readonly<{
  path: (typeof SAMPLE_PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS)[number];
  content: string;
}>;

export type CreateSampleProofCapsuleV1Input = Readonly<{
  evidenceAsOf: string;
  fixtureGeneratedAt: string;
  authority: SampleProofCapsuleAuthorityV1;
  limitations: readonly string[];
  nonClaims: readonly string[];
  entries: readonly SampleProofCapsulePayloadEntryInput[];
}>;

export type ValidatedSampleProofCapsuleV1 = Readonly<{
  envelope: SampleProofCapsuleEnvelopeV1;
  manifest: SampleProofCapsuleManifestV1;
  bytes: Uint8Array;
  reference: SampleProofCapsuleReferenceV1;
}>;

const ScientificSnapshotRefSchema = z
  .object({
    schemaVersion: z.literal("1"),
    environmentId: NonEmptyString,
    environmentKind: EnvironmentKindSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    authorityHash: Sha256Schema,
    snapshotFileSha256: Sha256Schema,
    registryHash: Sha256Schema,
    bindingsHash: Sha256Schema,
  })
  .strict();

const SbomBindingSchema = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: z.iso.datetime({ offset: true }),
    environmentId: NonEmptyString,
    environmentKind: EnvironmentKindSchema,
    sourceCommit: GitCommitSchema,
    imageDigest: ImageDigestSchema,
    registryHash: Sha256Schema,
    bindingsHash: Sha256Schema,
  })
  .passthrough();

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Sample Proof Capsule hashing is unavailable");
  }
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return bytesToHex(
    new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", buffer)),
  );
}

async function sha256Text(value: string): Promise<string> {
  return sha256Bytes(new TextEncoder().encode(value));
}

function expectedMediaType(path: string): string {
  const mediaType = MEDIA_TYPES[path];
  if (mediaType === undefined) {
    throw new Error(`Sample Proof Capsule path is not allowed: ${path}`);
  }
  return mediaType;
}

function descriptor(entry: z.infer<typeof EntrySchema>) {
  return {
    path: entry.path,
    mediaType: entry.mediaType,
    byteLength: entry.byteLength,
    sha256: entry.sha256,
  };
}

async function entryFromContent(path: string, content: string) {
  const bytes = new TextEncoder().encode(content);
  if (bytes.byteLength > MAX_ENTRY_BYTES) {
    throw new Error(`Sample Proof Capsule entry is too large: ${path}`);
  }
  return EntrySchema.parse({
    path,
    mediaType: expectedMediaType(path),
    contentEncoding: "utf-8",
    content,
    byteLength: bytes.byteLength,
    sha256: await sha256Bytes(bytes),
  });
}

function parseJson(content: string, path: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Sample Proof Capsule JSON entry is invalid: ${path}`);
  }
}

function readme(): string {
  return [
    "CounterLab Sample Proof Capsule v1",
    "",
    "Mode: fixed sample lesson (leakage-01)",
    "Support: Verified sample evidence",
    "Integrity: SHA-256 hashed, not signed",
    "",
    "GPT-5.6, Runtime Codex, and the hosted runner were not called.",
    "No learner Prediction, revision, or learner event chain is represented.",
    "The confirmed Belief Spec records fixed-fixture author approval, not an observed learner action.",
    "The scientific-engine snapshot is reproduction-candidate metadata, not execution or deployment proof.",
    "Live notebook Proof Capsule v2 remains a separate authority format.",
    "",
  ].join("\n");
}

function assertPayloadPaths(
  entries: readonly SampleProofCapsulePayloadEntryInput[],
): void {
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Sample Proof Capsule contains duplicate payload paths");
  }
  const missing = [...REQUIRED_PAYLOAD_PATH_SET].filter(
    (path) => !paths.includes(path as (typeof paths)[number]),
  );
  if (missing.length > 0) {
    throw new Error(
      `Sample Proof Capsule is missing required payload paths: ${missing.join(", ")}`,
    );
  }
}

function assertEntrySet(
  entries: readonly SampleProofCapsuleEnvelopeV1["entries"][number][],
): void {
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Sample Proof Capsule contains duplicate entry paths");
  }
  const ordered = [...paths].sort(comparePaths);
  if (canonicalJsonV1(paths) !== canonicalJsonV1(ordered)) {
    throw new Error("Sample Proof Capsule entries are not canonically ordered");
  }
  for (const path of paths) {
    if (!ALL_PATH_SET.has(path)) {
      throw new Error(`Sample Proof Capsule path is not allowed: ${path}`);
    }
  }
  for (const path of ALL_PATHS) {
    if (!paths.includes(path)) {
      throw new Error(
        `Sample Proof Capsule is missing required entry: ${path}`,
      );
    }
  }
}

function rootDescriptor(
  envelope: Omit<SampleProofCapsuleEnvelopeV1, "integrity">,
) {
  return {
    ...envelope,
    entries: envelope.entries.map(descriptor),
  };
}

async function rootHashFor(
  envelope: Omit<SampleProofCapsuleEnvelopeV1, "integrity">,
): Promise<string> {
  return sha256Text(
    `${SAMPLE_CAPSULE_ROOT_DOMAIN}${canonicalJsonV1(rootDescriptor(envelope))}`,
  );
}

function entryByPath(envelope: SampleProofCapsuleEnvelopeV1, path: string) {
  const entry = envelope.entries.find((candidate) => candidate.path === path);
  if (entry === undefined) {
    throw new Error(`Sample Proof Capsule entry is missing: ${path}`);
  }
  return entry;
}

async function assertAuthorityBindings(
  envelope: SampleProofCapsuleEnvelopeV1,
  manifest: SampleProofCapsuleManifestV1,
): Promise<void> {
  const authority = manifest.authority;
  const artifactEntry = entryByPath(envelope, "artifact-manifest.json");
  const artifact = ArtifactManifestSchema.parse(
    parseJson(artifactEntry.content, artifactEntry.path),
  );
  const resultEntry = entryByPath(envelope, "primary-result.json");
  const result = VerifiedResultSetSchema.parse(
    parseJson(resultEntry.content, resultEntry.path),
  );
  const fixture = await verifyFixedLeakageSampleBoundaryFixture(
    parseJson(
      entryByPath(envelope, "sample-boundary-fixture.json").content,
      "sample-boundary-fixture.json",
    ),
  );
  const snapshotEntry = entryByPath(
    envelope,
    "scientific-engine-snapshot.json",
  );
  const snapshot = ScientificEngineSnapshotSchema.parse(
    parseJson(snapshotEntry.content, snapshotEntry.path),
  );
  const snapshotRef = ScientificSnapshotRefSchema.parse(
    parseJson(
      entryByPath(envelope, "scientific-engine-snapshot-ref.json").content,
      "scientific-engine-snapshot-ref.json",
    ),
  );
  const sbomEntry = entryByPath(envelope, "sbom-manifest.json");
  const sbom = SbomBindingSchema.parse(
    parseJson(sbomEntry.content, sbomEntry.path),
  );

  const [
    experimentIrHash,
    technicalReportHash,
    evidenceVerdictHash,
    snapshotAuthorityHash,
  ] = await Promise.all([
    hashExperimentIR(fixture.experimentIr),
    sha256Text(canonicalJsonV1(fixture.technicalReport)),
    sha256Text(canonicalJsonV1(fixture.evidenceVerdict)),
    hashScientificEngineSnapshot(snapshot),
  ]);
  const fixed = FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1;
  const reproduction = authority.reproductionCandidate;

  const bindingsResolve =
    artifact.support.status === "SUPPORTED" &&
    artifact.fileSha256 === authority.sourceArtifactFileSha256 &&
    artifact.fileSha256 === fixed.sourceArtifactFileSha256 &&
    artifactEntry.sha256 === authority.artifactManifestFileSha256 &&
    fixture.source.artifactManifestHash ===
      authority.sourceArtifactFileSha256 &&
    result.concept === "entity_leakage" &&
    result.resultHash === authority.primaryResultCanonicalHash &&
    result.resultHash === fixed.primaryResultCanonicalHash &&
    fixture.source.primaryResultHash === authority.primaryResultCanonicalHash &&
    resultEntry.sha256 === authority.primaryResultFileSha256 &&
    resultEntry.sha256 === fixed.primaryResultFileSha256 &&
    fixture.source.primaryResultFileHash ===
      authority.primaryResultFileSha256 &&
    experimentIrHash === authority.experimentIrHash &&
    fixture.boundary.result.experimentIrHash === authority.experimentIrHash &&
    technicalReportHash === authority.technicalReportHash &&
    fixture.evidenceVerdict.technicalReportHash ===
      authority.technicalReportHash &&
    evidenceVerdictHash === authority.evidenceVerdictHash &&
    fixture.boundary.result.evidenceVerdictHash ===
      authority.evidenceVerdictHash &&
    fixture.boundary.result.resultHash === authority.boundaryResultHash &&
    fixture.boundary.report.reportHash ===
      authority.boundaryVerificationReportHash &&
    fixture.boundary.receipt.receiptHash === authority.boundaryReceiptHash &&
    fixture.fixtureIntegrityHash === authority.fixtureIntegrityHash &&
    fixture.fixtureIntegrityHash === fixed.fixtureIntegrityHash &&
    fixture.generatedAt === manifest.fixtureGeneratedAt &&
    fixture.beliefSpec.learnerDecision === "CONFIRMED" &&
    authority.fixedKernelEvidence.kernelVersion === result.kernelVersion &&
    authority.fixedKernelEvidence.kernelVersion === fixed.kernelVersion &&
    snapshotAuthorityHash === authority.scientificEngineSnapshotAuthorityHash &&
    snapshotRef.authorityHash ===
      authority.scientificEngineSnapshotAuthorityHash &&
    snapshotEntry.sha256 === authority.scientificEngineSnapshotFileSha256 &&
    snapshotRef.snapshotFileSha256 ===
      authority.scientificEngineSnapshotFileSha256 &&
    sbomEntry.sha256 === authority.sbomManifestSha256 &&
    snapshot.runtimeManifest.sbomManifestHash ===
      authority.sbomManifestSha256 &&
    snapshot.runtimeManifest.generatedAt === manifest.evidenceAsOf &&
    snapshotRef.generatedAt === manifest.evidenceAsOf &&
    sbom.generatedAt === manifest.evidenceAsOf &&
    reproduction.generatedAt === manifest.evidenceAsOf &&
    Date.parse(manifest.evidenceAsOf) >= Date.parse(fixture.generatedAt) &&
    snapshot.runtimeManifest.sourceCommit === reproduction.sourceCommit &&
    sbom.sourceCommit === reproduction.sourceCommit &&
    snapshot.runtimeManifest.container.imageDigest ===
      reproduction.imageDigest &&
    sbom.imageDigest === reproduction.imageDigest &&
    snapshot.runtimeManifest.environmentId === reproduction.environmentId &&
    snapshotRef.environmentId === reproduction.environmentId &&
    sbom.environmentId === reproduction.environmentId &&
    snapshot.runtimeManifest.environmentKind === reproduction.environmentKind &&
    snapshotRef.environmentKind === reproduction.environmentKind &&
    sbom.environmentKind === reproduction.environmentKind &&
    snapshotRef.registryHash === sbom.registryHash &&
    snapshotRef.bindingsHash === sbom.bindingsHash;

  if (!bindingsResolve) {
    throw new Error("Sample Proof Capsule authority bindings do not resolve");
  }
}

function referenceFor(
  envelope: SampleProofCapsuleEnvelopeV1,
  manifest: SampleProofCapsuleManifestV1,
  bytes: Uint8Array,
  bytesSha256: string,
): SampleProofCapsuleReferenceV1 {
  return SampleProofCapsuleReferenceV1Schema.parse({
    schemaVersion: "1",
    capsuleId: envelope.capsuleId,
    assetFile: "leakage_sample_proof_capsule_v1.counterlab",
    mediaType: SAMPLE_CAPSULE_MEDIA_TYPE,
    byteLength: bytes.byteLength,
    bytesSha256,
    rootHash: envelope.integrity.rootHash,
    fixtureIntegrityHash: manifest.authority.fixtureIntegrityHash,
    sourceArtifactFileSha256: manifest.authority.sourceArtifactFileSha256,
    artifactManifestFileSha256: manifest.authority.artifactManifestFileSha256,
    primaryResultCanonicalHash: manifest.authority.primaryResultCanonicalHash,
    boundaryResultHash: manifest.authority.boundaryResultHash,
    scientificEngineSnapshotAuthorityHash:
      manifest.authority.scientificEngineSnapshotAuthorityHash,
  });
}

export async function createSampleProofCapsuleV1(
  rawInput: CreateSampleProofCapsuleV1Input,
): Promise<ValidatedSampleProofCapsuleV1> {
  const authority = SampleProofCapsuleAuthorityV1Schema.parse(
    rawInput.authority,
  );
  const evidenceAsOf = z.iso
    .datetime({ offset: true })
    .parse(rawInput.evidenceAsOf);
  const fixtureGeneratedAt = z.iso
    .datetime({ offset: true })
    .parse(rawInput.fixtureGeneratedAt);
  const limitations = z
    .array(NonEmptyString)
    .min(1)
    .max(32)
    .parse(rawInput.limitations);
  const nonClaims = z
    .array(NonEmptyString)
    .min(1)
    .max(32)
    .parse(rawInput.nonClaims);
  assertPayloadPaths(rawInput.entries);

  const payloadEntries = await Promise.all(
    rawInput.entries.map(async (entry) => {
      parseJson(entry.content, entry.path);
      return entryFromContent(entry.path, entry.content);
    }),
  );
  payloadEntries.push(await entryFromContent("README.txt", readme()));
  payloadEntries.sort((left, right) => comparePaths(left.path, right.path));

  const manifest = SampleProofCapsuleManifestV1Schema.parse({
    schemaVersion: "1",
    format: SAMPLE_CAPSULE_FORMAT,
    capsuleId: "sample-proof-leakage-01-v1",
    mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    concept: "entity_leakage",
    supportLabel: "Verified sample evidence",
    canonicalProfile: CANONICAL_JSON_PROFILE,
    evidenceAsOf,
    fixtureGeneratedAt,
    authority,
    calls: {
      gpt56: "not-called",
      runtimeCodex: "not-called",
      runner: "not-called",
    },
    learnerEpisode: {
      predictionIncluded: false,
      revisionIncluded: false,
      eventChainIncluded: false,
    },
    fixtureAuthorApprovalMeaning:
      "fixed-fixture-author-approval-not-observed-learner-action",
    liveProofCapsuleV2: false,
    rawSourceArtifactIncluded: false,
    limitations,
    nonClaims,
    entries: payloadEntries.map(descriptor),
  });
  const entries = [
    ...payloadEntries,
    await entryFromContent("manifest.json", canonicalJsonV1(manifest)),
  ].sort((left, right) => comparePaths(left.path, right.path));
  const unsignedEnvelope = {
    schemaVersion: "1" as const,
    format: SAMPLE_CAPSULE_FORMAT,
    capsuleId: "sample-proof-leakage-01-v1" as const,
    mode: { kind: "sample_lesson" as const, sampleId: "leakage-01" as const },
    canonicalProfile: CANONICAL_JSON_PROFILE,
    evidenceAsOf,
    entries,
  };
  const envelope = SampleProofCapsuleEnvelopeV1Schema.parse({
    ...unsignedEnvelope,
    integrity: {
      mode: "integrity-hashed",
      algorithm: "sha256",
      rootHash: await rootHashFor(unsignedEnvelope),
    },
  });
  const bytes = new TextEncoder().encode(`${canonicalJsonV1(envelope)}\n`);
  if (bytes.byteLength > MAX_CAPSULE_BYTES) {
    throw new Error("Sample Proof Capsule exceeds the 16 MiB release limit");
  }
  return validateSampleProofCapsuleV1(bytes);
}

export async function validateSampleProofCapsuleV1(
  rawBytes: Uint8Array,
  rawReference?: unknown,
): Promise<ValidatedSampleProofCapsuleV1> {
  const bytes = new Uint8Array(rawBytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CAPSULE_BYTES) {
    throw new Error("Sample Proof Capsule byte length is outside the limit");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(
      bytes,
    );
  } catch {
    throw new Error("Sample Proof Capsule must be valid UTF-8");
  }
  const parsed = parseJson(text, "envelope");
  const envelope = SampleProofCapsuleEnvelopeV1Schema.parse(parsed);
  if (`${canonicalJsonV1(envelope)}\n` !== text) {
    throw new Error("Sample Proof Capsule bytes are not canonical");
  }
  assertEntrySet(envelope.entries);

  for (const entry of envelope.entries) {
    if (
      entry.mediaType !== expectedMediaType(entry.path) ||
      entry.byteLength !== new TextEncoder().encode(entry.content).byteLength ||
      entry.sha256 !== (await sha256Text(entry.content))
    ) {
      throw new Error(
        `Sample Proof Capsule entry hash or metadata is invalid: ${entry.path}`,
      );
    }
    if (entry.path.endsWith(".json")) {
      parseJson(entry.content, entry.path);
    }
  }

  const manifestEntry = entryByPath(envelope, "manifest.json");
  const manifest = SampleProofCapsuleManifestV1Schema.parse(
    parseJson(manifestEntry.content, manifestEntry.path),
  );
  if (
    manifest.capsuleId !== envelope.capsuleId ||
    canonicalJsonV1(manifest.mode) !== canonicalJsonV1(envelope.mode) ||
    manifest.canonicalProfile !== envelope.canonicalProfile ||
    manifest.evidenceAsOf !== envelope.evidenceAsOf
  ) {
    throw new Error(
      "Sample Proof Capsule manifest provenance does not match its envelope",
    );
  }
  const payloadDescriptors = envelope.entries
    .filter((entry) => entry.path !== "manifest.json")
    .map(descriptor);
  if (
    canonicalJsonV1(manifest.entries) !== canonicalJsonV1(payloadDescriptors)
  ) {
    throw new Error(
      "Sample Proof Capsule manifest index does not match its envelope",
    );
  }

  const { integrity: _integrity, ...unsignedEnvelope } = envelope;
  const expectedRootHash = await rootHashFor(unsignedEnvelope);
  if (expectedRootHash !== envelope.integrity.rootHash) {
    throw new Error("Sample Proof Capsule root hash does not resolve");
  }
  await assertAuthorityBindings(envelope, manifest);

  const bytesSha256 = await sha256Bytes(bytes);
  const reference = referenceFor(envelope, manifest, bytes, bytesSha256);
  if (rawReference !== undefined) {
    const expectedReference =
      SampleProofCapsuleReferenceV1Schema.parse(rawReference);
    if (canonicalJsonV1(reference) !== canonicalJsonV1(expectedReference)) {
      throw new Error(
        "Sample Proof Capsule reference does not match its bytes",
      );
    }
  }
  return { envelope, manifest, bytes, reference };
}
