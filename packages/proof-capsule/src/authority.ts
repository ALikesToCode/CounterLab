import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  DiscriminationContractV1Schema,
  EvidenceEventSchema,
  EvidenceVerdictSchema,
  HostedVerifiedResultSetV2Schema,
  PatchPlanV1Schema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofCapsuleReplayReceiptV2Schema,
  ProofCapsuleReplayV2Schema,
  PublicCompilerEventSchema,
  ReasoningDiffV2Schema,
  TransferResultSchema,
  canonicalJsonV1,
  type EvidenceEvent,
  type ProofCapsuleReplayReceiptV2,
  type ProofCapsuleReplayV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  hashExperimentIR,
} from "@counterlab/experiment-ir";
import { ExperimentSelectionSchema } from "@counterlab/experiment-scorer";
import { EpistemicVerificationReportV1Schema } from "@counterlab/plan-verifier";
import {
  ScientificEngineSnapshotSchema,
  hashScientificEngineSnapshot,
} from "@counterlab/scientific-engine-registry";
import { z } from "zod";

import type { ValidatedProofCapsuleV2 } from "./index.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const JsonObjectSchema = z
  .record(z.string(), z.unknown())
  .refine((value) => Object.keys(value).length > 0, "expected a JSON object");

export const ProofCapsuleRevisionV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    sessionId: z.string().trim().min(1),
    statement: z.string().trim().min(1),
    recordedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export const ProofCapsuleVerifierReportSetV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    candidateVerification: JsonObjectSchema,
    technicalVerification: JsonObjectSchema,
    epistemicVerification: EpistemicVerificationReportV1Schema,
    boundaryVerification: BoundaryMapVerificationReportV1Schema,
    patchPlanVerification: JsonObjectSchema,
  })
  .strict();

export type ProofCapsuleVerifierReportSetV2 = z.infer<
  typeof ProofCapsuleVerifierReportSetV2Schema
>;

export type ProofCapsulePayloadAuthorityOptions = {
  boundarySigningKeys?: Readonly<Record<string, string>>;
};

export type ProofCapsulePayloadAuthorityVerification = {
  valid: true;
  sessionId: string;
  concept: "entity_leakage" | "class_imbalance";
  eventCount: number;
  compilerEventCount: number;
  eventChainHead: string;
  reasoningDiffHash: string;
  resultHash: string;
  patchResultHash: string;
};

function hashCanonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJsonV1(value), "utf8")
    .digest("hex");
}

function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function assertEqual(label: string, actual: unknown, expected: unknown): void {
  if (canonicalJsonV1(actual) !== canonicalJsonV1(expected)) {
    throw new Error(`Proof Capsule ${label} does not match frozen authority`);
  }
}

function assertHash(label: string, actual: string, expected: string): void {
  if (actual !== expected) {
    throw new Error(
      `Proof Capsule ${label} hash does not match frozen authority`,
    );
  }
}

function entry(capsule: ValidatedProofCapsuleV2, path: string) {
  const found = capsule.envelope.entries.find(
    (candidate) => candidate.path === path,
  );
  if (found === undefined) {
    throw new Error(`Proof Capsule authority entry is missing: ${path}`);
  }
  return found;
}

function parseJsonEntry<T>(
  capsule: ValidatedProofCapsuleV2,
  path: string,
  schema: z.ZodType<T>,
  label: string,
): T {
  try {
    return schema.parse(JSON.parse(entry(capsule, path).content));
  } catch (error) {
    throw new Error(`Proof Capsule ${label} is invalid`, { cause: error });
  }
}

function parseJsonlEntry<T>(
  capsule: ValidatedProofCapsuleV2,
  path: string,
  schema: z.ZodType<T>,
  label: string,
): T[] {
  const lines = entry(capsule, path).content.slice(0, -1).split("\n");
  try {
    return lines.map((line) => schema.parse(JSON.parse(line)));
  } catch (error) {
    throw new Error(`Proof Capsule ${label} is invalid`, { cause: error });
  }
}

function assertSelfHash<T extends Record<string, unknown>>(
  label: string,
  value: T,
  field: keyof T,
): void {
  const declared = value[field];
  if (
    typeof declared !== "string" ||
    !Sha256Schema.safeParse(declared).success
  ) {
    throw new Error(`Proof Capsule ${label} does not declare a valid hash`);
  }
  const unsigned = { ...value };
  delete unsigned[field];
  assertHash(label, declared, hashCanonical(unsigned));
}

function verifyEvidenceEvents(
  events: EvidenceEvent[],
  sessionId: string,
  expectedHead: string,
): void {
  if (events.length === 0 || events[0]?.sequence !== 1) {
    throw new Error("Proof Capsule evidence chain must start at sequence 1");
  }
  if (events[0]?.previousEventHash !== undefined) {
    throw new Error("Proof Capsule first evidence event has a predecessor");
  }
  for (const [index, event] of events.entries()) {
    const { eventHash, ...unsigned } = event;
    assertHash(
      `evidence event ${event.sequence}`,
      eventHash,
      hashCanonical(unsigned),
    );
    if (event.sessionId !== sessionId) {
      throw new Error(
        "Proof Capsule evidence event belongs to another session",
      );
    }
    if (index > 0) {
      const previous = events[index - 1]!;
      if (
        event.sequence !== previous.sequence + 1 ||
        event.previousEventHash !== previous.eventHash
      ) {
        throw new Error("Proof Capsule evidence chain is not contiguous");
      }
    }
  }
  const head = events.at(-1)!;
  assertHash("event-chain head", head.eventHash, expectedHead);
  if (head.kind !== "reasoning_diff_v2.issued") {
    throw new Error(
      "Proof Capsule evidence chain must end at native Reasoning Diff issuance",
    );
  }
}

function verifyCompilerEvents(
  events: ReturnType<typeof PublicCompilerEventSchema.parse>[],
  requiredJobIds: readonly string[],
): void {
  const seenEventIds = new Set<string>();
  const lastCursorByJob = new Map<string, number>();
  const jobs = new Set<string>();
  for (const event of events) {
    if (seenEventIds.has(event.eventId)) {
      throw new Error("Proof Capsule compiler events contain duplicate IDs");
    }
    seenEventIds.add(event.eventId);
    jobs.add(event.jobId);
    const previousCursor = lastCursorByJob.get(event.jobId);
    if (previousCursor !== undefined && event.cursor <= previousCursor) {
      throw new Error(
        "Proof Capsule compiler event cursors must increase within each job",
      );
    }
    lastCursorByJob.set(event.jobId, event.cursor);
  }
  const missing = requiredJobIds.filter((jobId) => !jobs.has(jobId));
  if (missing.length > 0) {
    throw new Error(
      `Proof Capsule compiler history is missing authority jobs: ${missing.join(", ")}`,
    );
  }
}

function verifyBoundaryReceipt(
  receipt: ReturnType<typeof BoundaryMapReceiptV1Schema.parse>,
  options: ProofCapsulePayloadAuthorityOptions,
): void {
  const { integrity, receiptHash, ...receiptContent } = receipt;
  const contentHash = hashCanonical(receiptContent);
  assertHash("Boundary receipt content", integrity.contentHash, contentHash);
  assertHash(
    "Boundary receipt",
    receiptHash,
    hashCanonical({ ...receiptContent, integrity }),
  );
  if (integrity.mode !== "hmac-signed") return;
  const signingKey = options.boundarySigningKeys?.[integrity.keyId];
  if (signingKey === undefined || signingKey.length === 0) {
    throw new Error(
      "A signing key is required to validate the HMAC-signed Boundary receipt",
    );
  }
  const expectedSignature = createHmac("sha256", signingKey)
    .update(contentHash, "utf8")
    .digest("hex");
  const actualBytes = Buffer.from(integrity.signature, "hex");
  const expectedBytes = Buffer.from(expectedSignature, "hex");
  if (
    actualBytes.length !== expectedBytes.length ||
    !timingSafeEqual(actualBytes, expectedBytes)
  ) {
    throw new Error("Proof Capsule Boundary receipt HMAC signature is invalid");
  }
}

export async function validateProofCapsulePayloadAuthorityV2(
  capsule: ValidatedProofCapsuleV2,
  options: ProofCapsulePayloadAuthorityOptions = {},
): Promise<ProofCapsulePayloadAuthorityVerification> {
  const { manifest } = capsule;
  const authority = manifest.authority;
  const sessionId = manifest.sessionId;
  const concept = manifest.concept;
  const subjectPack = getConceptPack(concept);

  const artifactManifest = parseJsonEntry(
    capsule,
    "artifact-manifest.json",
    ArtifactManifestSchema,
    "Artifact Manifest",
  );
  const beliefSpec = parseJsonEntry(
    capsule,
    "belief-spec.json",
    BeliefSpecV2Schema,
    "Belief Spec",
  );
  const prediction = parseJsonEntry(
    capsule,
    "prediction.json",
    PredictionContractSchema,
    "Prediction",
  );
  const selection = parseJsonEntry(
    capsule,
    "experiment-selection.json",
    ExperimentSelectionSchema,
    "Experiment Selection",
  );
  const discriminationContract = parseJsonEntry(
    capsule,
    "discrimination-contract.json",
    DiscriminationContractV1Schema,
    "Discrimination Contract",
  );
  const experimentIr = parseJsonEntry(
    capsule,
    "experiment-ir.json",
    ExperimentIRV5Schema,
    "Experiment IR",
  );
  const result = parseJsonEntry(
    capsule,
    "signed-result.json",
    HostedVerifiedResultSetV2Schema,
    "signed result",
  );
  const verdict = parseJsonEntry(
    capsule,
    "evidence-verdict.json",
    EvidenceVerdictSchema,
    "Evidence Verdict",
  );
  const reports = parseJsonEntry(
    capsule,
    "verifier-report.json",
    ProofCapsuleVerifierReportSetV2Schema,
    "verifier report set",
  );
  const boundaryMap = parseJsonEntry(
    capsule,
    "boundary-map.json",
    BoundaryMapResultV1Schema,
    "Boundary Map",
  );
  const boundaryReceipt = parseJsonEntry(
    capsule,
    "boundary-map-receipt.json",
    BoundaryMapReceiptV1Schema,
    "Boundary receipt",
  );
  const revision = parseJsonEntry(
    capsule,
    "revision.json",
    ProofCapsuleRevisionV1Schema,
    "learner revision",
  );
  const transfer = parseJsonEntry(
    capsule,
    "transfer-result.json",
    TransferResultSchema,
    "Transfer result",
  );
  const patchPlan = parseJsonEntry(
    capsule,
    "patch-plan.json",
    PatchPlanV1Schema,
    "Patch Plan",
  );
  const patchResult = parseJsonEntry(
    capsule,
    "patch-result.json",
    PatchResultSchema,
    "Patch Result",
  );
  const reasoningDiff = parseJsonEntry(
    capsule,
    "reasoning-diff.json",
    ReasoningDiffV2Schema,
    "Reasoning Diff",
  );
  const engineSnapshot = parseJsonEntry(
    capsule,
    "scientific-engine-snapshot.json",
    ScientificEngineSnapshotSchema,
    "scientific-engine snapshot",
  );
  const compilerEvents = parseJsonlEntry(
    capsule,
    "compiler-events.jsonl",
    PublicCompilerEventSchema,
    "compiler event stream",
  );
  const evidenceEvents = parseJsonlEntry(
    capsule,
    "event-chain.jsonl",
    EvidenceEventSchema,
    "evidence event chain",
  );

  assertHash(
    "Artifact Manifest",
    hashCanonical(artifactManifest),
    authority.lineage.artifactManifestHash,
  );
  assertHash(
    "Belief Spec",
    hashCanonical(beliefSpec),
    authority.lineage.beliefSpecHash,
  );
  const { immutableHash: _immutableHash, ...predictionBase } = prediction;
  assertHash(
    "Prediction immutable",
    hashCanonical(predictionBase),
    prediction.immutableHash,
  );
  assertHash(
    "Prediction",
    prediction.immutableHash,
    authority.lineage.predictionHash,
  );
  assertHash(
    "Experiment Selection",
    hashCanonical(selection),
    authority.lineage.selectionHash,
  );
  assertHash(
    "Discrimination Contract",
    hashCanonical(discriminationContract),
    authority.lineage.discriminationContractHash,
  );
  assertHash(
    "Experiment IR",
    await hashExperimentIR(experimentIr),
    authority.lineage.selectedExperimentIrHash,
  );
  assertSelfHash("signed result", result, "resultHash");
  assertHash("signed result", result.resultHash, authority.result.resultHash);
  assertHash(
    "Evidence Verdict",
    hashCanonical(verdict),
    authority.result.evidenceVerdictHash,
  );

  assertHash(
    "candidate verifier report",
    hashCanonical(reports.candidateVerification),
    authority.lineage.candidateVerificationReportHash,
  );
  assertHash(
    "technical verifier report",
    hashCanonical(reports.technicalVerification),
    authority.result.technicalReportHash,
  );
  assertEqual(
    "technical verifier report binding",
    reports.technicalVerification,
    reports.epistemicVerification.technicalReport,
  );
  assertHash(
    "epistemic verifier report",
    hashCanonical(reports.epistemicVerification),
    authority.result.epistemicReportHash,
  );
  assertHash(
    "patch verifier report",
    hashCanonical(reports.patchPlanVerification),
    authority.patch.patchPlanVerificationHash,
  );
  assertHash(
    "Boundary verifier report",
    reports.boundaryVerification.reportHash,
    authority.boundary.verificationReportHash,
  );
  assertSelfHash(
    "Boundary verifier report",
    reports.boundaryVerification,
    "reportHash",
  );

  assertSelfHash("Boundary Map", boundaryMap, "resultHash");
  assertHash(
    "Boundary Map",
    boundaryMap.resultHash,
    authority.boundary.resultHash,
  );
  assertEqual("Boundary receipt", boundaryReceipt, authority.boundary.receipt);
  verifyBoundaryReceipt(boundaryReceipt, options);
  if (
    authority.boundary.cellCount !== boundaryMap.cells.length ||
    authority.boundary.sweepId !== boundaryMap.sweepId
  ) {
    throw new Error(
      "Proof Capsule Boundary grid does not match frozen authority",
    );
  }

  assertSelfHash("Transfer result", transfer, "resultHash");
  assertHash(
    "Patch Plan",
    hashCanonical(patchPlan),
    authority.patch.patchPlanHash,
  );
  assertSelfHash("Patch Result", patchResult, "resultHash");
  assertHash(
    "Patch diff",
    hashCanonical(patchResult.diff),
    patchResult.patchHash,
  );
  assertHash(
    "Patch Result",
    patchResult.resultHash,
    authority.patch.patchResultHash,
  );
  assertHash(
    "patched artifact",
    patchResult.patchedArtifactHash,
    authority.patch.patchedArtifactHash,
  );
  assertHash(
    "Reasoning Diff",
    hashCanonical(reasoningDiff),
    authority.reasoningDiffHash,
  );
  assertHash(
    "scientific-engine snapshot",
    await hashScientificEngineSnapshot(engineSnapshot),
    authority.scientificEngineSnapshotHash,
  );

  const sessionValues = [
    prediction.sessionId,
    discriminationContract.sessionId,
    experimentIr.sessionId,
    result.sessionId,
    boundaryMap.sessionId,
    boundaryReceipt.sessionId,
    revision.sessionId,
    transfer.sessionId,
    patchPlan.sessionId,
    patchResult.sessionId,
    reasoningDiff.sessionId,
  ];
  if (sessionValues.some((value) => value !== sessionId)) {
    throw new Error(
      "Proof Capsule payload contains mismatched session authority",
    );
  }
  const conceptValues = [
    beliefSpec.concept,
    discriminationContract.concept,
    experimentIr.concept,
    result.concept,
    boundaryMap.concept,
    patchPlan.concept,
    reasoningDiff.concept,
  ];
  if (conceptValues.some((value) => value !== concept)) {
    throw new Error(
      "Proof Capsule payload contains mismatched Subject Pack authority",
    );
  }
  if (
    beliefSpec.id !== prediction.beliefTestId ||
    beliefSpec.id !== discriminationContract.beliefSpecId ||
    beliefSpec.id !== experimentIr.beliefSpecId ||
    discriminationContract.artifactManifestHash !==
      authority.lineage.artifactManifestHash ||
    discriminationContract.beliefSpecHash !==
      authority.lineage.beliefSpecHash ||
    experimentIr.artifactManifestHash !==
      authority.lineage.artifactManifestHash ||
    experimentIr.beliefSpecHash !== authority.lineage.beliefSpecHash
  ) {
    throw new Error(
      "Proof Capsule hypothesis and experiment lineage is unresolved",
    );
  }
  if (
    selection.selectedCandidateId === null ||
    experimentIr.selection.status !== "SELECTED" ||
    experimentIr.selection.candidateId !== selection.selectedCandidateId ||
    experimentIr.selection.scorerVersion !== selection.scorerVersion
  ) {
    throw new Error("Proof Capsule fixed experiment selection is unresolved");
  }
  if (
    verdict.kind !== "SUPPORTS" ||
    verdict.irHash !== authority.lineage.selectedExperimentIrHash ||
    verdict.resultHash !== result.resultHash ||
    verdict.technicalReportHash !== authority.result.technicalReportHash ||
    reports.epistemicVerification.verdict.kind !== "SUPPORTS" ||
    hashCanonical(reports.epistemicVerification.verdict) !==
      authority.result.evidenceVerdictHash
  ) {
    throw new Error(
      "Proof Capsule does not contain supporting evidence authority",
    );
  }
  if (
    reports.epistemicVerification.resultHash !== result.resultHash ||
    reports.epistemicVerification.irHash !==
      authority.lineage.selectedExperimentIrHash ||
    reports.epistemicVerification.technicalReportHash !==
      authority.result.technicalReportHash
  ) {
    throw new Error("Proof Capsule epistemic verifier lineage is unresolved");
  }
  if (
    boundaryMap.artifactManifestHash !==
      authority.lineage.artifactManifestHash ||
    boundaryMap.experimentIrHash !==
      authority.lineage.selectedExperimentIrHash ||
    boundaryMap.authoritativeResultHash !== result.resultHash ||
    boundaryMap.evidenceVerdictHash !== authority.result.evidenceVerdictHash ||
    boundaryReceipt.resultHash !== boundaryMap.resultHash ||
    boundaryReceipt.verificationReportHash !==
      reports.boundaryVerification.reportHash
  ) {
    throw new Error("Proof Capsule Boundary authority is unresolved");
  }
  if (
    transfer.outcome !== "PASSED" ||
    experimentIr.transfer.taskId !== subjectPack.transferTask.id ||
    transfer.taskId !== subjectPack.transferTask.evaluatorTaskId ||
    patchPlan.artifactManifestHash !== authority.lineage.artifactManifestHash ||
    patchPlan.sourceArtifactHash !== artifactManifest.fileSha256 ||
    patchPlan.verifiedResultHash !== result.resultHash ||
    patchPlan.transferResultHash !== transfer.resultHash ||
    patchResult.status !== "VERIFIED" ||
    patchResult.sourceArtifactHash !== artifactManifest.fileSha256
  ) {
    throw new Error("Proof Capsule transfer-gated patch lineage is unresolved");
  }

  const expectedReasoningAuthority = {
    artifactManifestHash: authority.lineage.artifactManifestHash,
    beliefSpecHash: authority.lineage.beliefSpecHash,
    predictionHash: authority.lineage.predictionHash,
    experimentIrHash: authority.lineage.selectedExperimentIrHash,
    selectionHash: authority.lineage.selectionHash,
    authoritativeResultHash: authority.result.resultHash,
    evidenceVerdictHash: authority.result.evidenceVerdictHash,
    epistemicReportHash: authority.result.epistemicReportHash,
    boundaryMapHash: authority.boundary.resultHash,
    boundaryReceiptHash: authority.boundary.receipt.receiptHash,
    transferResultHash: transfer.resultHash,
    patchPlanHash: authority.patch.patchPlanHash,
    patchResultHash: authority.patch.patchResultHash,
    patchedArtifactHash: authority.patch.patchedArtifactHash,
  };
  assertEqual(
    "Reasoning Diff authority",
    reasoningDiff.authority,
    expectedReasoningAuthority,
  );

  verifyEvidenceEvents(evidenceEvents, sessionId, authority.eventChainHead);
  const eventHashes = new Set(evidenceEvents.map((event) => event.eventHash));
  if (
    reasoningDiff.evidenceEventHashes.some(
      (eventHash) => !eventHashes.has(eventHash),
    )
  ) {
    throw new Error(
      "Proof Capsule Reasoning Diff evidence does not resolve to its chain",
    );
  }
  const reasoningIssued = evidenceEvents.at(-1)!;
  if (!reasoningIssued.outputHashes.includes(authority.reasoningDiffHash)) {
    throw new Error(
      "Proof Capsule event chain does not bind the Reasoning Diff",
    );
  }

  verifyCompilerEvents(compilerEvents, [
    authority.lineage.jobId,
    authority.result.jobId,
    authority.boundary.jobId,
    authority.patch.jobId,
  ]);

  const patchedNotebook = capsule.envelope.entries.find(
    (candidate) => candidate.path === "artifacts/patched-notebook.ipynb",
  );
  if (patchedNotebook !== undefined) {
    assertHash(
      "patched notebook bytes",
      hashText(patchedNotebook.content),
      authority.patch.patchedArtifactHash,
    );
  }

  return {
    valid: true,
    sessionId,
    concept,
    eventCount: evidenceEvents.length,
    compilerEventCount: compilerEvents.length,
    eventChainHead: authority.eventChainHead,
    reasoningDiffHash: authority.reasoningDiffHash,
    resultHash: authority.result.resultHash,
    patchResultHash: authority.patch.patchResultHash,
  };
}

export async function projectProofCapsuleReplayV2(
  capsule: ValidatedProofCapsuleV2,
  rawReceipt: ProofCapsuleReplayReceiptV2,
  options: ProofCapsulePayloadAuthorityOptions = {},
): Promise<ProofCapsuleReplayV2> {
  const receipt = ProofCapsuleReplayReceiptV2Schema.parse(rawReceipt);
  await validateProofCapsulePayloadAuthorityV2(capsule, options);
  const { objectKey: _objectKey, ...publicReference } = capsule.reference;
  assertEqual(
    "replay receipt Capsule reference",
    receipt.proofCapsule,
    publicReference,
  );

  const artifactManifest = parseJsonEntry(
    capsule,
    "artifact-manifest.json",
    ArtifactManifestSchema,
    "Artifact Manifest",
  );
  const beliefSpec = parseJsonEntry(
    capsule,
    "belief-spec.json",
    BeliefSpecV2Schema,
    "Belief Spec",
  );
  const prediction = parseJsonEntry(
    capsule,
    "prediction.json",
    PredictionContractSchema,
    "Prediction",
  );
  const verifiedResult = parseJsonEntry(
    capsule,
    "signed-result.json",
    HostedVerifiedResultSetV2Schema,
    "signed result",
  );
  const evidenceVerdict = parseJsonEntry(
    capsule,
    "evidence-verdict.json",
    EvidenceVerdictSchema,
    "Evidence Verdict",
  );
  const verifierReports = parseJsonEntry(
    capsule,
    "verifier-report.json",
    ProofCapsuleVerifierReportSetV2Schema,
    "verifier report set",
  );
  const boundaryResult = parseJsonEntry(
    capsule,
    "boundary-map.json",
    BoundaryMapResultV1Schema,
    "Boundary Map",
  );
  const boundaryReceipt = parseJsonEntry(
    capsule,
    "boundary-map-receipt.json",
    BoundaryMapReceiptV1Schema,
    "Boundary receipt",
  );
  const revision = parseJsonEntry(
    capsule,
    "revision.json",
    ProofCapsuleRevisionV1Schema,
    "learner revision",
  );
  const transferResult = parseJsonEntry(
    capsule,
    "transfer-result.json",
    TransferResultSchema,
    "Transfer result",
  );
  const patchResult = parseJsonEntry(
    capsule,
    "patch-result.json",
    PatchResultSchema,
    "Patch Result",
  );
  const reasoningDiff = parseJsonEntry(
    capsule,
    "reasoning-diff.json",
    ReasoningDiffV2Schema,
    "Reasoning Diff",
  );
  const compilerEvents = parseJsonlEntry(
    capsule,
    "compiler-events.jsonl",
    PublicCompilerEventSchema,
    "compiler event stream",
  );
  const evidenceEvents = parseJsonlEntry(
    capsule,
    "event-chain.jsonl",
    EvidenceEventSchema,
    "evidence event chain",
  );

  return ProofCapsuleReplayV2Schema.parse({
    ...receipt,
    artifactManifest,
    beliefSpec,
    prediction,
    verifiedResult,
    evidenceVerdict,
    boundary: {
      result: boundaryResult,
      report: verifierReports.boundaryVerification,
      receipt: boundaryReceipt,
    },
    revision: {
      statement: revision.statement,
      recordedAt: revision.recordedAt,
    },
    transferResult,
    patchResult,
    reasoningDiff,
    compilerEvents,
    timeline: evidenceEvents.map(
      ({ sequence, timestamp, actor, kind, eventHash }) => ({
        sequence,
        timestamp,
        actor,
        kind,
        eventHash,
      }),
    ),
    provenance: {
      conceptPackVersion: verifiedResult.conceptPackVersion,
      kernelVersion: verifiedResult.kernelVersion,
      verifierVersion: verifierReports.epistemicVerification.verifierVersion,
      boundaryVerifierVersion:
        verifierReports.boundaryVerification.verifierVersion,
      scientificVerifierVersion:
        capsule.manifest.authority.lineage.scientificVerifierVersion,
      scorerVersion: capsule.manifest.authority.lineage.scorerVersion,
      modelIds: [
        ...new Set(
          evidenceEvents.flatMap((event) =>
            event.modelId === undefined ? [] : [event.modelId],
          ),
        ),
      ].slice(0, 16),
      promptHashes: [
        ...new Set(
          evidenceEvents.flatMap((event) =>
            event.promptHash === undefined ? [] : [event.promptHash],
          ),
        ),
      ].slice(0, 32),
      commitHashes: [
        ...new Set(
          evidenceEvents.flatMap((event) =>
            event.commitHash === undefined ? [] : [event.commitHash],
          ),
        ),
      ].slice(0, 16),
    },
    limitations: capsule.manifest.limitations,
  });
}
