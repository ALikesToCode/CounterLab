import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  BoundaryMapAuthorityRefV1Schema,
  CANONICAL_JSON_PROFILE,
  ConceptIdSchema,
  HostedExperimentLineageV5Schema,
  HostedPatchAuthorityRefV5Schema,
  HostedResultAuthorityRefV5Schema,
  ProofCapsuleRefV2Schema,
  canonicalJsonV1,
  type ProofCapsuleRefV2,
} from "@counterlab/contracts";
import { z } from "zod";

const CAPSULE_FORMAT = "counterlab-proof-capsule" as const;
const CAPSULE_MEDIA_TYPE = "application/vnd.counterlab.capsule+json" as const;
const CAPSULE_ROOT_DOMAIN = "counterlab-proof-capsule-root-v2\0";
const CAPSULE_SIGNATURE_DOMAIN = "counterlab-proof-capsule-signature-v2\0";
const MAX_CAPSULE_BYTES = 16_777_216;
const MAX_ENTRY_BYTES = 10_485_760;

const NonEmptyString = z.string().trim().min(1);
const TokenIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9._:-]{1,128}$/u, "expected a bounded token identifier");
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "expected a lowercase SHA-256 digest");

export const PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS = [
  "artifact-manifest.json",
  "belief-spec.json",
  "prediction.json",
  "experiment-selection.json",
  "discrimination-contract.json",
  "experiment-ir.json",
  "compiler-events.jsonl",
  "signed-result.json",
  "evidence-verdict.json",
  "verifier-report.json",
  "boundary-map.json",
  "boundary-map-receipt.json",
  "revision.json",
  "transfer-result.json",
  "patch-plan.json",
  "patch-result.json",
  "reasoning-diff.json",
  "scientific-engine-snapshot.json",
  "event-chain.jsonl",
] as const;

export const PROOF_CAPSULE_OPTIONAL_PAYLOAD_PATHS = [
  "artifacts/patched-notebook.ipynb",
] as const;

const GENERATED_PATHS = ["manifest.json", "README.txt"] as const;
const ALL_ALLOWED_PATHS = new Set<string>([
  ...GENERATED_PATHS,
  ...PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
  ...PROOF_CAPSULE_OPTIONAL_PAYLOAD_PATHS,
]);
const REQUIRED_PAYLOAD_PATH_SET = new Set<string>(
  PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
);
const JSONL_PATH_SET = new Set<string>([
  "compiler-events.jsonl",
  "event-chain.jsonl",
]);

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  "manifest.json": "application/json",
  "artifact-manifest.json": "application/json",
  "belief-spec.json": "application/json",
  "prediction.json": "application/json",
  "experiment-selection.json": "application/json",
  "discrimination-contract.json": "application/json",
  "experiment-ir.json": "application/json",
  "compiler-events.jsonl": "application/x-ndjson",
  "signed-result.json": "application/json",
  "evidence-verdict.json": "application/json",
  "verifier-report.json": "application/json",
  "boundary-map.json": "application/json",
  "boundary-map-receipt.json": "application/json",
  "revision.json": "application/json",
  "transfer-result.json": "application/json",
  "patch-plan.json": "application/json",
  "patch-result.json": "application/json",
  "reasoning-diff.json": "application/json",
  "scientific-engine-snapshot.json": "application/json",
  "event-chain.jsonl": "application/x-ndjson",
  "README.txt": "text/plain;charset=utf-8",
  "artifacts/patched-notebook.ipynb": "application/x-ipynb+json",
};

export const ProofCapsuleAuthorityV2Schema = z
  .object({
    lineage: HostedExperimentLineageV5Schema,
    result: HostedResultAuthorityRefV5Schema,
    boundary: BoundaryMapAuthorityRefV1Schema,
    patch: HostedPatchAuthorityRefV5Schema,
    reasoningDiffHash: Sha256Schema,
    scientificEngineSnapshotHash: Sha256Schema,
    eventChainHead: Sha256Schema,
  })
  .strict();

export type ProofCapsuleAuthorityV2 = z.infer<
  typeof ProofCapsuleAuthorityV2Schema
>;

const ProofCapsuleEntryDescriptorV2Schema = z
  .object({
    path: NonEmptyString,
    mediaType: NonEmptyString,
    byteLength: z.number().int().nonnegative().max(MAX_ENTRY_BYTES),
    sha256: Sha256Schema,
  })
  .strict();

export const ProofCapsuleManifestV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    format: z.literal(CAPSULE_FORMAT),
    capsuleId: TokenIdSchema,
    sessionId: TokenIdSchema,
    mode: z.literal("live_notebook"),
    replayId: z.null(),
    concept: ConceptIdSchema,
    supportLabel: z.literal("Verified Test"),
    canonicalProfile: z.literal(CANONICAL_JSON_PROFILE),
    createdAt: z.iso.datetime({ offset: true }),
    authority: ProofCapsuleAuthorityV2Schema,
    limitations: z.array(NonEmptyString).min(1).max(32),
    reproductionCommands: z.array(NonEmptyString).min(1).max(16),
    rawSourceArtifactIncluded: z.literal(false),
    patchedArtifactIncluded: z.boolean(),
    entries: z.array(ProofCapsuleEntryDescriptorV2Schema).min(1).max(32),
  })
  .strict();

export type ProofCapsuleManifestV2 = z.infer<
  typeof ProofCapsuleManifestV2Schema
>;

const ProofCapsuleEntryV2Schema = ProofCapsuleEntryDescriptorV2Schema.extend({
  contentEncoding: z.literal("utf-8"),
  content: z.string(),
}).strict();

const IntegrityHashedSchema = z
  .object({
    mode: z.literal("integrity-hashed"),
    algorithm: z.literal("sha256"),
    rootHash: Sha256Schema,
  })
  .strict();

const HmacSignedSchema = z
  .object({
    mode: z.literal("hmac-signed"),
    algorithm: z.literal("hmac-sha256"),
    rootHash: Sha256Schema,
    keyId: TokenIdSchema,
    signature: Sha256Schema,
  })
  .strict();

const ProofCapsuleEnvelopeV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    format: z.literal(CAPSULE_FORMAT),
    capsuleId: TokenIdSchema,
    sessionId: TokenIdSchema,
    mode: z.literal("live_notebook"),
    replayId: z.null(),
    canonicalProfile: z.literal(CANONICAL_JSON_PROFILE),
    createdAt: z.iso.datetime({ offset: true }),
    entries: z.array(ProofCapsuleEntryV2Schema).min(1).max(32),
    integrity: z.discriminatedUnion("mode", [
      IntegrityHashedSchema,
      HmacSignedSchema,
    ]),
  })
  .strict();

export type ProofCapsuleEnvelopeV2 = z.infer<
  typeof ProofCapsuleEnvelopeV2Schema
>;

export type ProofCapsulePayloadEntryInput =
  | {
      path: string;
      kind: "json";
      value: unknown;
    }
  | {
      path: string;
      kind: "jsonl";
      value: readonly unknown[];
    }
  | {
      path: "artifacts/patched-notebook.ipynb";
      kind: "text";
      value: string;
    };

export type CreateProofCapsuleV2Input = {
  capsuleId: string;
  sessionId: string;
  concept: "entity_leakage" | "class_imbalance";
  createdAt: string;
  authority: ProofCapsuleAuthorityV2;
  limitations: string[];
  reproductionCommands: string[];
  entries: ProofCapsulePayloadEntryInput[];
  signing?: {
    keyId: string;
    signingKey: string;
  };
};

export type ValidateProofCapsuleV2Options = {
  signingKeys?: Readonly<Record<string, string>>;
  expectedIntegrityMode?: "integrity-hashed" | "hmac-signed";
};

export type ValidatedProofCapsuleV2 = {
  envelope: ProofCapsuleEnvelopeV2;
  manifest: ProofCapsuleManifestV2;
  bytes: Uint8Array;
  reference: ProofCapsuleRefV2;
};

export type CreatedProofCapsuleV2 = ValidatedProofCapsuleV2;

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacRoot(rootHash: string, signingKey: string): string {
  return createHmac("sha256", signingKey)
    .update(`${CAPSULE_SIGNATURE_DOMAIN}${rootHash}`, "utf8")
    .digest("hex");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function utf8Length(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

function comparePaths(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function descriptor(
  entry: Pick<
    ProofCapsuleEnvelopeV2["entries"][number],
    "path" | "mediaType" | "byteLength" | "sha256"
  >,
) {
  return {
    path: entry.path,
    mediaType: entry.mediaType,
    byteLength: entry.byteLength,
    sha256: entry.sha256,
  };
}

function rootDescriptor(
  envelope: Omit<ProofCapsuleEnvelopeV2, "integrity">,
): Omit<ProofCapsuleEnvelopeV2, "integrity" | "entries"> & {
  entries: ReturnType<typeof descriptor>[];
} {
  return {
    ...envelope,
    entries: envelope.entries.map(descriptor),
  };
}

function rootHashFor(
  envelope: Omit<ProofCapsuleEnvelopeV2, "integrity">,
): string {
  return sha256Text(
    `${CAPSULE_ROOT_DOMAIN}${canonicalJsonV1(rootDescriptor(envelope))}`,
  );
}

function expectedMediaType(path: string): string {
  const mediaType = MEDIA_TYPES[path];
  if (mediaType === undefined) {
    throw new Error(`Proof Capsule path is not allowed: ${path}`);
  }
  return mediaType;
}

function entryFromContent(
  path: string,
  content: string,
): ProofCapsuleEnvelopeV2["entries"][number] {
  const byteLength = utf8Length(content);
  if (byteLength > MAX_ENTRY_BYTES) {
    throw new Error(`Proof Capsule entry exceeds its byte limit: ${path}`);
  }
  return {
    path,
    mediaType: expectedMediaType(path),
    contentEncoding: "utf-8",
    content,
    byteLength,
    sha256: sha256Text(content),
  };
}

function canonicalEntry(input: ProofCapsulePayloadEntryInput) {
  if (!ALL_ALLOWED_PATHS.has(input.path)) {
    throw new Error(`Proof Capsule path is not allowed: ${input.path}`);
  }
  if ((GENERATED_PATHS as readonly string[]).includes(input.path)) {
    throw new Error(
      `Proof Capsule path is generated internally: ${input.path}`,
    );
  }
  if (JSONL_PATH_SET.has(input.path)) {
    if (input.kind !== "jsonl") {
      throw new Error(
        `Proof Capsule JSONL path requires jsonl input: ${input.path}`,
      );
    }
    if (input.value.length === 0) {
      throw new Error(
        `Proof Capsule JSONL entry must not be empty: ${input.path}`,
      );
    }
    return entryFromContent(
      input.path,
      `${input.value.map((value) => canonicalJsonV1(value)).join("\n")}\n`,
    );
  }
  if (input.path === "artifacts/patched-notebook.ipynb") {
    if (input.kind !== "text") {
      throw new Error("Patched notebook payload must preserve its UTF-8 bytes");
    }
    return entryFromContent(input.path, input.value);
  }
  if (input.kind !== "json") {
    throw new Error(
      `Proof Capsule JSON path requires json input: ${input.path}`,
    );
  }
  return entryFromContent(input.path, canonicalJsonV1(input.value));
}

function assertPayloadPaths(entries: readonly ProofCapsulePayloadEntryInput[]) {
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Proof Capsule contains duplicate payload paths");
  }
  for (const path of paths) {
    if (!ALL_ALLOWED_PATHS.has(path)) {
      throw new Error(`Proof Capsule path is not allowed: ${path}`);
    }
  }
  const missing = [...REQUIRED_PAYLOAD_PATH_SET].filter(
    (path) => !paths.includes(path),
  );
  if (missing.length > 0) {
    throw new Error(
      `Proof Capsule is missing required payload paths: ${missing.join(", ")}`,
    );
  }
}

function readme(input: CreateProofCapsuleV2Input): string {
  return [
    "CounterLab Proof Capsule v2",
    "",
    `Capsule: ${input.capsuleId}`,
    `Session: ${input.sessionId}`,
    `Concept: ${input.concept}`,
    "Mode: live_notebook",
    "Support: Verified Test",
    "",
    "This capsule contains bounded experiment evidence and does not certify global mastery.",
    "",
    "Reproduce:",
    ...input.reproductionCommands.map((command) => `- ${command}`),
    "",
  ].join("\n");
}

function parseCanonicalJson(content: string, path: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Proof Capsule JSON entry is invalid: ${path}`);
  }
  if (canonicalJsonV1(parsed) !== content) {
    throw new Error(`Proof Capsule JSON entry is not canonical: ${path}`);
  }
  return parsed;
}

function assertCanonicalJsonl(content: string, path: string): void {
  if (!content.endsWith("\n") || content.length === 1) {
    throw new Error(`Proof Capsule JSONL entry is not canonical: ${path}`);
  }
  const lines = content.slice(0, -1).split("\n");
  if (lines.some((line) => line.length === 0)) {
    throw new Error(
      `Proof Capsule JSONL entry contains an empty line: ${path}`,
    );
  }
  for (const line of lines) parseCanonicalJson(line, path);
}

function assertEntrySet(
  entries: readonly ProofCapsuleEnvelopeV2["entries"][number][],
): void {
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) {
    throw new Error("Proof Capsule contains duplicate entry paths");
  }
  const ordered = [...paths].sort(comparePaths);
  if (canonicalJsonV1(paths) !== canonicalJsonV1(ordered)) {
    throw new Error("Proof Capsule entries are not in canonical path order");
  }
  for (const path of paths) {
    if (!ALL_ALLOWED_PATHS.has(path)) {
      throw new Error(`Proof Capsule path is not allowed: ${path}`);
    }
  }
  for (const path of [
    ...GENERATED_PATHS,
    ...PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
  ]) {
    if (!paths.includes(path)) {
      throw new Error(`Proof Capsule is missing required entry: ${path}`);
    }
  }
}

function referenceFor(
  envelope: ProofCapsuleEnvelopeV2,
  manifest: ProofCapsuleManifestV2,
  bytes: Uint8Array,
): ProofCapsuleRefV2 {
  const bytesHash = createHash("sha256").update(bytes).digest("hex");
  return ProofCapsuleRefV2Schema.parse({
    schemaVersion: "2",
    capsuleId: envelope.capsuleId,
    sessionId: envelope.sessionId,
    mode: "live_notebook",
    replayId: null,
    objectKey: `proof-capsules/${envelope.sessionId}/${bytesHash}.counterlab`,
    mediaType: CAPSULE_MEDIA_TYPE,
    canonicalProfile: CANONICAL_JSON_PROFILE,
    rootHash: envelope.integrity.rootHash,
    bytesHash,
    byteLength: bytes.byteLength,
    reasoningDiffHash: manifest.authority.reasoningDiffHash,
    eventChainHead: manifest.authority.eventChainHead,
    createdAt: envelope.createdAt,
    integrity:
      envelope.integrity.mode === "integrity-hashed"
        ? { mode: "integrity-hashed", algorithm: "sha256" }
        : {
            mode: "hmac-signed",
            algorithm: "hmac-sha256",
            keyId: envelope.integrity.keyId,
            signature: envelope.integrity.signature,
          },
  });
}

export function createProofCapsuleV2(
  rawInput: CreateProofCapsuleV2Input,
): CreatedProofCapsuleV2 {
  const input = {
    ...rawInput,
    authority: ProofCapsuleAuthorityV2Schema.parse(rawInput.authority),
  };
  TokenIdSchema.parse(input.capsuleId);
  TokenIdSchema.parse(input.sessionId);
  ConceptIdSchema.parse(input.concept);
  z.iso.datetime({ offset: true }).parse(input.createdAt);
  z.array(NonEmptyString).min(1).max(32).parse(input.limitations);
  z.array(NonEmptyString).min(1).max(16).parse(input.reproductionCommands);
  if (input.signing !== undefined) {
    TokenIdSchema.parse(input.signing.keyId);
    if (input.signing.signingKey.length === 0) {
      throw new Error("Proof Capsule signing key must not be empty");
    }
  }

  assertPayloadPaths(input.entries);
  const payloadEntries = input.entries.map(canonicalEntry);
  payloadEntries.push(entryFromContent("README.txt", readme(input)));
  payloadEntries.sort((left, right) => comparePaths(left.path, right.path));

  const manifest = ProofCapsuleManifestV2Schema.parse({
    schemaVersion: "2",
    format: CAPSULE_FORMAT,
    capsuleId: input.capsuleId,
    sessionId: input.sessionId,
    mode: "live_notebook",
    replayId: null,
    concept: input.concept,
    supportLabel: "Verified Test",
    canonicalProfile: CANONICAL_JSON_PROFILE,
    createdAt: input.createdAt,
    authority: input.authority,
    limitations: input.limitations,
    reproductionCommands: input.reproductionCommands,
    rawSourceArtifactIncluded: false,
    patchedArtifactIncluded: payloadEntries.some(
      (entry) => entry.path === "artifacts/patched-notebook.ipynb",
    ),
    entries: payloadEntries.map(descriptor),
  });
  const entries = [
    ...payloadEntries,
    entryFromContent("manifest.json", canonicalJsonV1(manifest)),
  ].sort((left, right) => comparePaths(left.path, right.path));
  const unsignedEnvelope = {
    schemaVersion: "2" as const,
    format: CAPSULE_FORMAT,
    capsuleId: input.capsuleId,
    sessionId: input.sessionId,
    mode: "live_notebook" as const,
    replayId: null,
    canonicalProfile: CANONICAL_JSON_PROFILE,
    createdAt: input.createdAt,
    entries,
  };
  const rootHash = rootHashFor(unsignedEnvelope);
  const integrity =
    input.signing === undefined
      ? {
          mode: "integrity-hashed" as const,
          algorithm: "sha256" as const,
          rootHash,
        }
      : {
          mode: "hmac-signed" as const,
          algorithm: "hmac-sha256" as const,
          rootHash,
          keyId: input.signing.keyId,
          signature: hmacRoot(rootHash, input.signing.signingKey),
        };
  const envelope = ProofCapsuleEnvelopeV2Schema.parse({
    ...unsignedEnvelope,
    integrity,
  });
  const bytes = new TextEncoder().encode(`${canonicalJsonV1(envelope)}\n`);
  if (bytes.byteLength > MAX_CAPSULE_BYTES) {
    throw new Error("Proof Capsule exceeds the 16 MiB release limit");
  }
  return validateProofCapsuleV2(bytes, {
    ...(input.signing === undefined
      ? {}
      : {
          signingKeys: {
            [input.signing.keyId]: input.signing.signingKey,
          },
        }),
    expectedIntegrityMode: integrity.mode,
  });
}

export function validateProofCapsuleV2(
  rawBytes: Uint8Array,
  options: ValidateProofCapsuleV2Options = {},
): ValidatedProofCapsuleV2 {
  const bytes = new Uint8Array(rawBytes);
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_CAPSULE_BYTES) {
    throw new Error("Proof Capsule byte length is outside the release limit");
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Proof Capsule must be valid UTF-8");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Proof Capsule envelope is not valid JSON");
  }
  const envelope = ProofCapsuleEnvelopeV2Schema.parse(parsed);
  if (`${canonicalJsonV1(envelope)}\n` !== text) {
    throw new Error("Proof Capsule bytes are not in canonical envelope form");
  }
  assertEntrySet(envelope.entries);

  for (const entry of envelope.entries) {
    if (entry.mediaType !== expectedMediaType(entry.path)) {
      throw new Error(
        `Proof Capsule entry media type is invalid: ${entry.path}`,
      );
    }
    if (
      entry.byteLength !== utf8Length(entry.content) ||
      entry.sha256 !== sha256Text(entry.content)
    ) {
      throw new Error(
        `Proof Capsule entry hash or byte length is invalid: ${entry.path}`,
      );
    }
    if (entry.path.endsWith(".json")) {
      parseCanonicalJson(entry.content, entry.path);
    } else if (entry.path.endsWith(".jsonl")) {
      assertCanonicalJsonl(entry.content, entry.path);
    }
  }

  const manifestEntry = envelope.entries.find(
    (entry) => entry.path === "manifest.json",
  );
  if (manifestEntry === undefined) {
    throw new Error("Proof Capsule manifest is missing");
  }
  const manifest = ProofCapsuleManifestV2Schema.parse(
    parseCanonicalJson(manifestEntry.content, manifestEntry.path),
  );
  if (
    manifest.capsuleId !== envelope.capsuleId ||
    manifest.sessionId !== envelope.sessionId ||
    manifest.mode !== envelope.mode ||
    manifest.replayId !== envelope.replayId ||
    manifest.canonicalProfile !== envelope.canonicalProfile ||
    manifest.createdAt !== envelope.createdAt
  ) {
    throw new Error(
      "Proof Capsule manifest provenance does not match its envelope",
    );
  }
  const payloadDescriptors = envelope.entries
    .filter((entry) => entry.path !== "manifest.json")
    .map(descriptor);
  if (
    canonicalJsonV1(manifest.entries) !== canonicalJsonV1(payloadDescriptors)
  ) {
    throw new Error(
      "Proof Capsule manifest entry index does not match its envelope",
    );
  }
  const patchedArtifactIncluded = envelope.entries.some(
    (entry) => entry.path === "artifacts/patched-notebook.ipynb",
  );
  if (manifest.patchedArtifactIncluded !== patchedArtifactIncluded) {
    throw new Error("Proof Capsule patched-artifact declaration is invalid");
  }

  const { integrity: _integrity, ...unsignedEnvelope } = envelope;
  const expectedRootHash = rootHashFor(unsignedEnvelope);
  if (envelope.integrity.rootHash !== expectedRootHash) {
    throw new Error("Proof Capsule root hash does not match its entry index");
  }
  if (
    options.expectedIntegrityMode !== undefined &&
    options.expectedIntegrityMode !== envelope.integrity.mode
  ) {
    throw new Error(
      "Proof Capsule integrity mode does not match the expected policy",
    );
  }
  if (envelope.integrity.mode === "hmac-signed") {
    const signingKey = options.signingKeys?.[envelope.integrity.keyId];
    if (signingKey === undefined || signingKey.length === 0) {
      throw new Error(
        "A signing key is required to validate this HMAC-signed Proof Capsule",
      );
    }
    const expectedSignature = hmacRoot(expectedRootHash, signingKey);
    if (!signaturesMatch(envelope.integrity.signature, expectedSignature)) {
      throw new Error("Proof Capsule HMAC signature is invalid");
    }
  }

  const reference = referenceFor(envelope, manifest, bytes);
  return { envelope, manifest, bytes, reference };
}

export function inspectProofCapsuleV2(
  bytes: Uint8Array,
  options: ValidateProofCapsuleV2Options = {},
): ValidatedProofCapsuleV2 & {
  entries: ProofCapsuleEnvelopeV2["entries"];
} {
  const validated = validateProofCapsuleV2(bytes, options);
  return { ...validated, entries: validated.envelope.entries };
}
