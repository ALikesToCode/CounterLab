import {
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapResultV1Schema,
  HostedExperimentLineageV5Schema,
  HostedPatchAuthorityRefV5Schema,
  HostedResultAuthorityRefV5Schema,
  PatchPlanV1Schema,
  ReasoningDiffV2Schema,
  type ArtifactManifest,
  type BoundaryMapResultV1,
  type EvidenceEvent,
  type PublicCompilerEvent,
  type ReasoningDiffV2,
} from "@counterlab/contracts";
import { ExperimentIRV5Schema } from "@counterlab/experiment-ir";
import {
  ProofCapsuleVerifierReportSetV2Schema,
  createProofCapsuleV2,
  validateProofCapsulePayloadAuthorityV2,
  type CreatedProofCapsuleV2,
} from "@counterlab/proof-capsule";
import {
  hashCanonical,
  resolveSessionEvidenceAuthority,
  type CounterLabSession,
} from "@counterlab/session-core";

import scientificEngineSnapshot from "../../../scientific-engines/snapshot.json";
import scientificEngineSnapshotAuthority from "../../../scientific-engines/snapshot-hash.json";

const REQUIRED_REASONING_EVENT_KINDS = [
  "belief_spec.confirmed",
  "prediction.committed",
  "lab.verified",
  "experiment.evidence_verified",
  "boundary_map.verified",
  "revision.recorded",
  "transfer.passed",
  "patch.verified",
] as const;

export type NativeProofArtifactsV5 = {
  experimentSelection: unknown;
  discriminationContract: unknown;
  selectedExperimentIr: unknown;
  candidateVerification: unknown;
  technicalVerification: unknown;
  epistemicVerification: unknown;
  evidenceVerdict: unknown;
  boundaryMap: unknown;
  boundaryVerification: unknown;
  patchPlan: unknown;
  patchPlanVerification: unknown;
  patchedNotebook?: string;
};

function requiredEvent(events: EvidenceEvent[], kind: string): EvidenceEvent {
  const found = events.find((event) => event.kind === kind);
  if (found === undefined) {
    throw new Error(`Native proof evidence event is missing: ${kind}`);
  }
  return found;
}

function observedEvidence(session: CounterLabSession): string {
  const result = session.verifiedResult;
  if (result?.schemaVersion !== "2") {
    throw new Error("Native proof requires a hosted v2 result");
  }
  if (result.concept === "entity_leakage") {
    const random = result.runs.find(
      (run) => run.operation === "leakage.random_row_split",
    );
    const group = result.runs.find(
      (run) => run.operation === "leakage.group_holdout",
    );
    if (random === undefined || group === undefined) {
      throw new Error("Native leakage proof is missing its decisive runs");
    }
    return `Random-row accuracy ${random.metrics.accuracy.toFixed(3)} included ${random.entityOverlap.count} shared entities; whole-entity accuracy ${group.metrics.accuracy.toFixed(3)} had ${group.entityOverlap.count} shared entities.`;
  }
  const majority = result.runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const threshold = result.runs.find(
    (run) => run.operation === "imbalance.threshold_sweep",
  );
  if (majority === undefined || threshold === undefined) {
    throw new Error("Native imbalance proof is missing its decisive runs");
  }
  return `The majority baseline reached ${majority.metrics.accuracy.toFixed(3)} accuracy with ${majority.metrics.recall.toFixed(3)} minority recall; the verified threshold run reached ${threshold.metrics.recall.toFixed(3)} recall and ${threshold.metrics.prAuc.toFixed(3)} PR-AUC.`;
}

function boundaryEvidence(
  boundary: BoundaryMapResultV1,
  integrityMode: "integrity-hashed" | "hmac-signed",
): string {
  const classes = new Map<string, number>();
  for (const cell of boundary.cells) {
    classes.set(
      cell.classificationId,
      (classes.get(cell.classificationId) ?? 0) + 1,
    );
  }
  const distribution = [...classes.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([classification, count]) => `${count} ${classification}`)
    .join(", ");
  const integrityLabel =
    integrityMode === "hmac-signed" ? "HMAC-signed" : "integrity-hashed";
  return `${boundary.cells.length} ${integrityLabel} conditions across ${boundary.axes[0].label} and ${boundary.axes[1].label} show ${distribution}.`;
}

function codeBefore(concept: "entity_leakage" | "class_imbalance"): string {
  return concept === "entity_leakage"
    ? "Row-wise splitting allowed the same customer identity on both sides of evaluation."
    : "Accuracy-only evaluation hid minority-class errors and the majority baseline.";
}

function codeAfter(
  operations: readonly { id: string; reason: string }[],
): string {
  const fixedDescriptions: Readonly<Record<string, string>> = {
    replace_row_split_with_group_holdout:
      "Replace row-wise evaluation with a whole-entity holdout.",
    exclude_entity_feature:
      "Exclude the entity identifier from model features.",
    stratify_classification_holdout: "Use a stratified classification holdout.",
    add_majority_baseline: "Add a computed majority-class baseline.",
    replace_accuracy_only_evaluation:
      "Replace accuracy-only reporting with class-specific metrics and PR-AUC.",
  };
  return operations
    .map((operation) => fixedDescriptions[operation.id])
    .filter((description): description is string => description !== undefined)
    .join(" ");
}

function transferBefore(concept: "entity_leakage" | "class_imbalance"): string {
  return concept === "entity_leakage"
    ? "The deployment-boundary rule had not been applied to future forecasting."
    : "The metric rule had not been applied to rarer defects with asymmetric miss cost.";
}

function requiredNativeSession(session: CounterLabSession) {
  if (
    session.mode.kind !== "live_notebook" ||
    session.beliefSpec === undefined ||
    session.prediction === undefined ||
    session.verifiedResult?.schemaVersion !== "2" ||
    session.evidenceVerdict?.kind !== "SUPPORTS" ||
    session.epistemicReportHash === undefined ||
    session.boundaryMapAuthority === undefined ||
    session.revision === undefined ||
    session.transferResult?.outcome !== "PASSED" ||
    session.patchResult?.status !== "VERIFIED" ||
    session.resultAuthority === undefined ||
    session.patchAuthority === undefined
  ) {
    throw new Error(
      "Native proof requires supporting v5 evidence, verified Boundary, passed transfer, and verified patch authority",
    );
  }
  return {
    beliefSpec: session.beliefSpec,
    prediction: session.prediction,
    result: session.verifiedResult,
    verdict: session.evidenceVerdict,
    boundaryAuthority: BoundaryMapAuthorityRefV1Schema.parse(
      session.boundaryMapAuthority,
    ),
    revision: session.revision,
    transfer: session.transferResult,
    patch: session.patchResult,
    lineage: HostedExperimentLineageV5Schema.parse(session.labVerification),
    resultAuthority: HostedResultAuthorityRefV5Schema.parse(
      session.resultAuthority,
    ),
    patchAuthority: HostedPatchAuthorityRefV5Schema.parse(
      session.patchAuthority,
    ),
  };
}

export async function createNativeReasoningDiffV2(input: {
  session: CounterLabSession;
  events: EvidenceEvent[];
  boundaryMap: unknown;
  patchPlan: unknown;
}): Promise<ReasoningDiffV2> {
  const evidence = requiredNativeSession(input.session);
  const boundaryMap = BoundaryMapResultV1Schema.parse(input.boundaryMap);
  const patchPlan = PatchPlanV1Schema.parse(input.patchPlan);
  const authority = await resolveSessionEvidenceAuthority(input.session);
  if (authority.protocol !== "v5" || authority.verdict !== "SUPPORTS") {
    throw new Error("Native proof requires supporting v5 session authority");
  }
  const evidenceEvents = REQUIRED_REASONING_EVENT_KINDS.map((kind) =>
    requiredEvent(input.events, kind),
  );
  const patchEvent = evidenceEvents.at(-1)!;
  const predictionRange = evidence.prediction.numericRange;
  const predictionText = `${evidence.prediction.choice} at ${evidence.prediction.confidence}% confidence${
    predictionRange === undefined
      ? ""
      : ` (${predictionRange.min}–${predictionRange.max})`
  }.`;
  const diff = ReasoningDiffV2Schema.parse({
    schemaVersion: "2",
    id: `reasoning_v2_${input.session.id}`,
    sessionId: input.session.id,
    concept: evidence.result.concept,
    dimensions: {
      belief: {
        before: evidence.beliefSpec.claim,
        after: evidence.revision,
      },
      prediction: {
        before: predictionText,
        after: observedEvidence(input.session),
      },
      evidence: {
        before: `${evidence.beliefSpec.evidenceRefs.length} notebook references supported the original Question, but no deployment-matched countertest had run.`,
        after: observedEvidence(input.session),
      },
      boundary: {
        before:
          "The original claim did not state where the observed pattern would stop applying.",
        after: boundaryEvidence(
          boundaryMap,
          evidence.boundaryAuthority.receipt.integrity.mode,
        ),
      },
      behavior: {
        before: transferBefore(evidence.result.concept),
        after: `The deterministic transfer passed with “${evidence.transfer.selectedStrategy}” and ${evidence.transfer.checks.length} fixed checks.`,
      },
      code: {
        before: codeBefore(evidence.result.concept),
        after: codeAfter(patchPlan.operations),
      },
    },
    authority: {
      artifactManifestHash: evidence.lineage.artifactManifestHash,
      beliefSpecHash: evidence.lineage.beliefSpecHash,
      predictionHash: evidence.lineage.predictionHash,
      experimentIrHash: evidence.lineage.selectedExperimentIrHash,
      selectionHash: evidence.lineage.selectionHash,
      authoritativeResultHash: evidence.result.resultHash,
      evidenceVerdictHash: await hashCanonical(evidence.verdict),
      epistemicReportHash: evidence.resultAuthority.epistemicReportHash,
      boundaryMapHash: evidence.boundaryAuthority.resultHash,
      boundaryReceiptHash: evidence.boundaryAuthority.receipt.receiptHash,
      transferResultHash: evidence.transfer.resultHash,
      patchPlanHash: evidence.patchAuthority.patchPlanHash,
      patchResultHash: evidence.patch.resultHash,
      patchedArtifactHash: evidence.patch.patchedArtifactHash,
    },
    evidenceEventHashes: evidenceEvents.map((event) => event.eventHash),
    limitations: [
      "This verifies one bounded experiment and transfer task, not global mastery.",
      "The result applies only to the released Subject Pack operations and this artifact evidence.",
      "The uploaded source notebook is excluded from the Proof Capsule by default.",
    ],
    issuedAt: patchEvent.timestamp,
  });
  return diff;
}

export async function createNativeProofCapsuleV2(input: {
  session: CounterLabSession;
  manifest: ArtifactManifest;
  events: EvidenceEvent[];
  compilerEvents: PublicCompilerEvent[];
  artifacts: NativeProofArtifactsV5;
  signing?: { keyId: string; signingKey: string };
}): Promise<CreatedProofCapsuleV2> {
  const evidence = requiredNativeSession(input.session);
  const reasoningDiff = ReasoningDiffV2Schema.parse(
    input.session.reasoningDiffV2,
  );
  const experimentIr = ExperimentIRV5Schema.parse(
    input.artifacts.selectedExperimentIr,
  );
  const boundaryMap = BoundaryMapResultV1Schema.parse(
    input.artifacts.boundaryMap,
  );
  const revisionEvent = requiredEvent(input.events, "revision.recorded");
  const eventChainHead = input.events.at(-1)?.eventHash;
  if (
    eventChainHead === undefined ||
    input.events.at(-1)?.kind !== "reasoning_diff_v2.issued"
  ) {
    throw new Error(
      "Native Proof Capsule requires the persisted Reasoning Diff event-chain head",
    );
  }
  const engineSnapshotHash = scientificEngineSnapshotAuthority.authorityHash;
  const verifierReports = ProofCapsuleVerifierReportSetV2Schema.parse({
    schemaVersion: "2",
    candidateVerification: input.artifacts.candidateVerification,
    technicalVerification: input.artifacts.technicalVerification,
    epistemicVerification: input.artifacts.epistemicVerification,
    boundaryVerification: input.artifacts.boundaryVerification,
    patchPlanVerification: input.artifacts.patchPlanVerification,
  });
  const capsule = createProofCapsuleV2({
    capsuleId: `capsule_${input.session.id}`,
    sessionId: input.session.id,
    concept: evidence.result.concept,
    createdAt: reasoningDiff.issuedAt,
    authority: {
      lineage: evidence.lineage,
      result: evidence.resultAuthority,
      boundary: evidence.boundaryAuthority,
      patch: evidence.patchAuthority,
      reasoningDiffHash: await hashCanonical(reasoningDiff),
      scientificEngineSnapshotHash: engineSnapshotHash,
      eventChainHead,
    },
    limitations: reasoningDiff.limitations,
    reproductionCommands: [
      `pnpm exec tsx scripts/proof-capsule.ts validate counterlab-${input.session.id}.counterlab`,
    ],
    entries: [
      {
        path: "artifact-manifest.json",
        kind: "json",
        value: input.manifest,
      },
      { path: "belief-spec.json", kind: "json", value: evidence.beliefSpec },
      { path: "prediction.json", kind: "json", value: evidence.prediction },
      {
        path: "experiment-selection.json",
        kind: "json",
        value: input.artifacts.experimentSelection,
      },
      {
        path: "discrimination-contract.json",
        kind: "json",
        value: input.artifacts.discriminationContract,
      },
      { path: "experiment-ir.json", kind: "json", value: experimentIr },
      {
        path: "compiler-events.jsonl",
        kind: "jsonl",
        value: input.compilerEvents,
      },
      { path: "signed-result.json", kind: "json", value: evidence.result },
      {
        path: "evidence-verdict.json",
        kind: "json",
        value: input.artifacts.evidenceVerdict,
      },
      {
        path: "verifier-report.json",
        kind: "json",
        value: verifierReports,
      },
      { path: "boundary-map.json", kind: "json", value: boundaryMap },
      {
        path: "boundary-map-receipt.json",
        kind: "json",
        value: evidence.boundaryAuthority.receipt,
      },
      {
        path: "revision.json",
        kind: "json",
        value: {
          schemaVersion: "1",
          sessionId: input.session.id,
          statement: evidence.revision,
          recordedAt: revisionEvent.timestamp,
        },
      },
      { path: "transfer-result.json", kind: "json", value: evidence.transfer },
      {
        path: "patch-plan.json",
        kind: "json",
        value: input.artifacts.patchPlan,
      },
      { path: "patch-result.json", kind: "json", value: evidence.patch },
      { path: "reasoning-diff.json", kind: "json", value: reasoningDiff },
      {
        path: "scientific-engine-snapshot.json",
        kind: "json",
        value: scientificEngineSnapshot,
      },
      { path: "event-chain.jsonl", kind: "jsonl", value: input.events },
      ...(input.artifacts.patchedNotebook === undefined
        ? []
        : [
            {
              path: "artifacts/patched-notebook.ipynb" as const,
              kind: "text" as const,
              value: input.artifacts.patchedNotebook,
            },
          ]),
    ],
    ...(input.signing === undefined ? {} : { signing: input.signing }),
  });
  const boundarySigningKeys =
    evidence.boundaryAuthority.receipt.integrity.mode === "hmac-signed" &&
    input.signing !== undefined
      ? {
          [evidence.boundaryAuthority.receipt.integrity.keyId]:
            input.signing.signingKey,
        }
      : undefined;
  await validateProofCapsulePayloadAuthorityV2(capsule, {
    ...(boundarySigningKeys === undefined ? {} : { boundarySigningKeys }),
  });
  return capsule;
}
