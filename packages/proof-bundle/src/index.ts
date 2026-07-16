import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  EvidenceEventSchema,
  EvidenceEventUnsignedSchema,
  ProofBundleDraftSchema,
  ProofBundleSchema,
  type EvidenceEvent,
  type EvidenceEventUnsigned,
  type ProofBundle,
  type ProofBundleDraft,
} from "@counterlab/contracts";

export type {
  EvidenceEvent,
  ProofBundle,
  ProofBundleDraft,
} from "@counterlab/contracts";

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeCanonical(
  value: unknown,
  ancestors: WeakSet<object>,
): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("canonical JSON does not support cyclic values");
    }
    ancestors.add(value);
    const normalized: CanonicalValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new TypeError("canonical JSON does not support sparse arrays");
      }
      normalized.push(normalizeCanonical(value[index], ancestors));
    }
    ancestors.delete(value);
    return normalized;
  }
  if (typeof value === "object") {
    const object = value as object;
    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON supports only plain objects");
    }
    if (ancestors.has(object)) {
      throw new TypeError("canonical JSON does not support cyclic values");
    }
    ancestors.add(object);
    const normalized: Record<string, CanonicalValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeCanonical(
        (value as Record<string, unknown>)[key],
        ancestors,
      );
    }
    ancestors.delete(object);
    return normalized;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value} values`);
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeCanonical(value, new WeakSet<object>()));
}

export function hashCanonicalJson(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

export type EvidenceEventInput = Omit<
  EvidenceEventUnsigned,
  "schemaVersion"
> & {
  schemaVersion?: "1";
};

export function createEvidenceEvent(input: EvidenceEventInput): EvidenceEvent {
  const unsigned = EvidenceEventUnsignedSchema.parse(input);
  return EvidenceEventSchema.parse({
    ...unsigned,
    eventHash: hashCanonicalJson(unsigned),
  });
}

export class EvidenceChainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EvidenceChainError";
  }
}

export type EvidenceChainVerification = {
  valid: true;
  sessionId: string;
  length: number;
  headHash: string;
  events: EvidenceEvent[];
};

export function verifyEvidenceChain(
  input: readonly unknown[],
): EvidenceChainVerification {
  if (input.length === 0) {
    throw new EvidenceChainError(
      "Evidence chain must contain at least one event",
    );
  }

  const events = input.map((event) => EvidenceEventSchema.parse(event));
  const first = events[0]!;
  if (first.sequence !== 1) {
    throw new EvidenceChainError(
      `Evidence sequence must start at 1; observed ${first.sequence}`,
    );
  }
  if (first.previousEventHash !== undefined) {
    throw new EvidenceChainError(
      "First evidence event cannot have a previous event hash",
    );
  }

  for (const [index, event] of events.entries()) {
    const { eventHash, ...unsigned } = event;
    const expectedHash = hashCanonicalJson(unsigned);
    if (eventHash !== expectedHash) {
      throw new EvidenceChainError(
        `Evidence event ${event.sequence} hash does not match its content`,
      );
    }
    if (event.sessionId !== first.sessionId) {
      throw new EvidenceChainError(
        `Evidence event ${event.sequence} belongs to a different session`,
      );
    }
    if (index === 0) {
      continue;
    }

    const previous = events[index - 1]!;
    if (event.sequence !== previous.sequence + 1) {
      throw new EvidenceChainError(
        `Evidence sequence must be contiguous; expected ${previous.sequence + 1}, observed ${event.sequence}`,
      );
    }
    if (event.previousEventHash !== previous.eventHash) {
      throw new EvidenceChainError(
        `Evidence event ${event.sequence} has an invalid previous event hash`,
      );
    }
  }

  return {
    valid: true,
    sessionId: first.sessionId,
    length: events.length,
    headHash: events[events.length - 1]!.eventHash,
    events,
  };
}

export type ReplaySnapshot = {
  schemaVersion: "1";
  sessionId: string;
  eventChainHead: string;
  timeline: Array<{
    sequence: number;
    timestamp: string;
    actor: EvidenceEvent["actor"];
    kind: string;
    payload: EvidenceEvent["payload"];
    eventHash: string;
  }>;
  payloads: EvidenceEvent["payload"][];
  latestPayloadByKind: Record<string, EvidenceEvent["payload"]>;
};

export function reconstructReplay(input: readonly unknown[]): ReplaySnapshot {
  const verified = verifyEvidenceChain(input);
  const latestPayloadByKind = Object.create(null) as Record<
    string,
    EvidenceEvent["payload"]
  >;
  for (const event of verified.events) {
    latestPayloadByKind[event.kind] = event.payload;
  }

  return {
    schemaVersion: "1",
    sessionId: verified.sessionId,
    eventChainHead: verified.headHash,
    timeline: verified.events.map((event) => ({
      sequence: event.sequence,
      timestamp: event.timestamp,
      actor: event.actor,
      kind: event.kind,
      payload: event.payload,
      eventHash: event.eventHash,
    })),
    payloads: verified.events.map((event) => event.payload),
    latestPayloadByKind,
  };
}

export type ProofBundleOptions = {
  signingKey?: string;
  scientificEngineSnapshotHash?: string;
};

function assertScientificEngineSnapshot(
  draft: ProofBundleDraft,
  expectedHash: string | undefined,
): void {
  if (
    draft.schemaVersion === "2" &&
    expectedHash !== undefined &&
    draft.scientificEngineSnapshotHash !== expectedHash
  ) {
    throw new Error(
      "Proof Bundle scientific engine snapshot hash does not match the expected authority",
    );
  }
}

function hmac(contentHash: string, signingKey: string): string {
  return createHmac("sha256", signingKey)
    .update(contentHash, "utf8")
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

function assertProofReferences(
  draft: ProofBundleDraft,
  chain: EvidenceChainVerification,
): void {
  const sessionIds = [
    draft.sessionId,
    draft.predictionContract.sessionId,
    draft.transferResult.sessionId,
    draft.patchResult.sessionId,
    draft.reasoningDiff.sessionId,
    chain.sessionId,
  ];
  if (new Set(sessionIds).size !== 1) {
    throw new Error("Proof Bundle contains mismatched session identifiers");
  }
  if (draft.predictionContract.beliefTestId !== draft.beliefTest.id) {
    throw new Error(
      "Prediction Contract does not reference the approved Belief Test",
    );
  }
  const concepts = [
    draft.beliefTest.concept,
    draft.experimentPlan.concept,
    draft.verifiedResultSet.concept,
  ];
  if (new Set(concepts).size !== 1) {
    throw new Error("Proof Bundle contains mismatched concept lineage");
  }
  if (
    draft.patchResult.sourceArtifactHash !== draft.artifactManifest.fileSha256
  ) {
    throw new Error(
      "Patch source artifact does not match the Proof Bundle Artifact Manifest",
    );
  }
  if (draft.schemaVersion === "2") {
    const manifestHash = hashCanonicalJson(draft.artifactManifest);
    if (
      draft.sessionMode !== "live_notebook" ||
      draft.replayId !== null ||
      draft.experimentPlan.sessionId !== draft.sessionId ||
      draft.experimentPlan.beliefTestId !== draft.beliefTest.id ||
      draft.experimentPlan.artifactManifestHash !== manifestHash ||
      draft.verifiedResultSet.planId !== draft.experimentPlan.planId ||
      draft.verifiedResultSet.artifactManifestHash !== manifestHash ||
      draft.patchPlan.sessionId !== draft.sessionId ||
      draft.patchPlan.artifactManifestHash !== manifestHash ||
      draft.patchPlan.verifiedResultHash !==
        draft.verifiedResultSet.resultHash ||
      draft.patchPlan.transferResultHash !== draft.transferResult.resultHash
    ) {
      throw new Error("Live Proof Bundle lineage does not resolve");
    }
  }

  for (const evidence of draft.beliefTest.evidenceRefs) {
    let expectedHash: string | undefined;
    if (evidence.kind === "learner_claim") {
      expectedHash = hashCanonicalJson(draft.beliefTest.learnerClaim);
    } else if (evidence.kind === "schema") {
      expectedHash = hashCanonicalJson(draft.artifactManifest.schemaSummary);
    } else {
      const cell =
        evidence.cellIndex === undefined
          ? undefined
          : draft.artifactManifest.cells.find(
              (candidate) => candidate.index === evidence.cellIndex,
            );
      if (evidence.kind === "code") {
        expectedHash = cell?.sourceSha256;
      } else if (evidence.outputIndex !== undefined) {
        expectedHash = cell?.outputHashes[evidence.outputIndex];
      }
    }
    if (expectedHash === undefined || evidence.hash !== expectedHash) {
      throw new Error(
        `Belief Test evidence does not resolve to the Artifact Manifest: ${evidence.kind}`,
      );
    }
  }

  const eventHashes = new Set(chain.events.map((event) => event.eventHash));
  if (!eventHashes.has(draft.learnerRevision.eventHash)) {
    throw new Error(
      "Learner revision references an event outside the evidence chain",
    );
  }
  for (const hash of draft.reasoningDiff.evidenceEventHashes) {
    if (!eventHashes.has(hash)) {
      throw new Error(
        "Reasoning Diff references an event outside the evidence chain",
      );
    }
  }

  const eventOutputHashes = new Set(
    chain.events.flatMap((event) => event.outputHashes),
  );
  const requiredOutputHashes = [
    draft.predictionContract.immutableHash,
    ...(draft.schemaVersion === "1"
      ? [
          draft.generatedAdapter.sha256,
          draft.publicTests.reportHash,
          draft.externalVerifier.reportHash,
        ]
      : []),
    draft.verifiedResultSet.resultHash,
    draft.transferResult.resultHash,
    draft.patchResult.resultHash,
  ];
  for (const hash of requiredOutputHashes) {
    if (!eventOutputHashes.has(hash)) {
      throw new Error(
        `Proof Bundle output hash is not linked from the evidence event chain: ${hash}`,
      );
    }
  }
}

export function createProofBundle(
  input: ProofBundleDraft,
  options: ProofBundleOptions = {},
): ProofBundle {
  const draft = ProofBundleDraftSchema.parse(input);
  const chain = verifyEvidenceChain(draft.events);
  assertProofReferences(draft, chain);
  assertScientificEngineSnapshot(draft, options.scientificEngineSnapshotHash);
  const contentHash = hashCanonicalJson(draft);
  const signingKey = options.signingKey;
  const integrity =
    signingKey === undefined || signingKey.length === 0
      ? {
          mode: "integrity-hashed" as const,
          algorithm: "sha256" as const,
          contentHash,
          eventChainHead: chain.headHash,
        }
      : {
          mode: "hmac-signed" as const,
          algorithm: "hmac-sha256" as const,
          contentHash,
          eventChainHead: chain.headHash,
          signature: hmac(contentHash, signingKey),
        };

  return ProofBundleSchema.parse({ ...draft, integrity });
}

export function validateProofBundle(
  input: unknown,
  options: ProofBundleOptions = {},
): ProofBundle {
  const bundle = ProofBundleSchema.parse(input);
  const { integrity, ...draftValue } = bundle;
  const draft = ProofBundleDraftSchema.parse(draftValue);
  const chain = verifyEvidenceChain(draft.events);
  assertProofReferences(draft, chain);
  assertScientificEngineSnapshot(draft, options.scientificEngineSnapshotHash);

  if (integrity.eventChainHead !== chain.headHash) {
    throw new Error(
      "Proof Bundle event chain head does not match its evidence events",
    );
  }
  const expectedContentHash = hashCanonicalJson(draft);
  if (integrity.contentHash !== expectedContentHash) {
    throw new Error("Proof Bundle content hash does not match its content");
  }

  const signingKey = options.signingKey;
  if (
    signingKey !== undefined &&
    signingKey.length > 0 &&
    integrity.mode !== "hmac-signed"
  ) {
    throw new Error(
      "A signing key was supplied, but the Proof Bundle is not HMAC-signed",
    );
  }
  if (integrity.mode === "hmac-signed") {
    if (signingKey === undefined || signingKey.length === 0) {
      throw new Error(
        "A signing key is required to validate this HMAC-signed Proof Bundle",
      );
    }
    const expectedSignature = hmac(integrity.contentHash, signingKey);
    if (
      integrity.signature === undefined ||
      !signaturesMatch(integrity.signature, expectedSignature)
    ) {
      throw new Error("Proof Bundle HMAC signature is invalid");
    }
  }

  return bundle;
}

export function exportProofBundle(
  input: unknown,
  options: ProofBundleOptions = {},
): string {
  return `${canonicalJson(validateProofBundle(input, options))}\n`;
}
