import {
  type ArtifactManifest,
  type EvidenceEvent,
  type ExperimentPlanV2,
  type PatchPlanV1,
  type ProofBundle,
  type PublicCompilerEvent,
  type ReasoningDiff,
} from "@counterlab/contracts";
import { createProofBundle } from "@counterlab/proof-bundle";
import type {
  PatchPlanVerificationReport,
  PlanVerificationReport,
} from "@counterlab/plan-verifier";
import type { CounterLabSession } from "@counterlab/session-core";

import scientificEngineSnapshotValue from "../../../scientific-engines/snapshot-hash.json";

const SHA256 = /^[a-f0-9]{64}$/;

function scientificEngineSnapshotHash(): string {
  const hash = scientificEngineSnapshotValue.authorityHash;
  if (!SHA256.test(hash)) {
    throw new Error("Scientific engine snapshot authority hash is invalid");
  }
  return hash;
}

function requiredLiveEvidence(session: CounterLabSession) {
  if (
    session.mode.kind !== "live_notebook" ||
    session.beliefTest === undefined ||
    session.prediction === undefined ||
    session.verifiedResult?.schemaVersion !== "2" ||
    session.revision === undefined ||
    session.transferResult?.outcome !== "PASSED" ||
    session.patchResult?.status !== "VERIFIED"
  ) {
    throw new Error("Live verified session evidence is incomplete");
  }
  return {
    beliefTest: session.beliefTest,
    prediction: session.prediction,
    result: session.verifiedResult,
    revision: session.revision,
    transfer: session.transferResult,
    patch: session.patchResult,
  };
}

export function createLiveReasoningProof(input: {
  session: CounterLabSession;
  manifest: ArtifactManifest;
  events: EvidenceEvent[];
  experimentPlan: ExperimentPlanV2;
  planVerification: PlanVerificationReport;
  compilerEvents: PublicCompilerEvent[];
  patchPlan: PatchPlanV1;
  patchPlanVerification: PatchPlanVerificationReport;
  issuedAt: string;
  signingKey?: string;
}): { reasoningDiff: ReasoningDiff; proofBundle: ProofBundle } {
  const evidence = requiredLiveEvidence(input.session);
  const event = (kind: string) => {
    const found = input.events.find((candidate) => candidate.kind === kind);
    if (found === undefined)
      throw new Error(`Evidence event ${kind} is missing`);
    return found;
  };
  const changedCells = evidence.patch.modifiedCells.join(", ");
  let observedResult: string;
  let codeBefore: string;
  let codeAfter: string;
  let transferBefore: string;
  let transferAfter: string;
  let conceptLimitation: string;
  let mutationCommand: string;
  if (evidence.result.concept === "entity_leakage") {
    const groupRun = evidence.result.runs.find(
      (run) => run.operation === "leakage.group_holdout",
    );
    if (groupRun === undefined) {
      throw new Error("Live group-holdout result is missing");
    }
    observedResult = `Group-holdout accuracy ${groupRun.metrics.accuracy.toFixed(3)} with ${groupRun.entityOverlap.count} shared entities`;
    codeBefore =
      "Row-wise evaluation allowed repeated entities across the boundary";
    codeAfter = `Verified cells ${changedCells} use group-aware evaluation and exclude the identity feature`;
    transferBefore =
      "The evaluation-boundary rule had not been applied to forecasting";
    transferAfter =
      "The fixed evaluator accepted a time-ordered holdout and identified future-looking evidence";
    conceptLimitation =
      "Verification covers this artifact and the released entity-leakage operations.";
    mutationCommand = "./scripts/run-mutations.sh leakage";
  } else {
    const thresholdRun = evidence.result.runs.find(
      (run) => run.operation === "imbalance.threshold_sweep",
    );
    const majorityRun = evidence.result.runs.find(
      (run) => run.operation === "imbalance.majority_baseline",
    );
    if (thresholdRun === undefined || majorityRun === undefined) {
      throw new Error("Live class-imbalance comparison is missing");
    }
    observedResult = `At threshold ${thresholdRun.threshold.toFixed(2)}, recall is ${(thresholdRun.metrics.recall * 100).toFixed(1)}%; the majority baseline reaches ${(majorityRun.metrics.accuracy * 100).toFixed(1)}% accuracy while detecting no positive cases`;
    codeBefore = "Accuracy-only evaluation hid the minority-class failure mode";
    codeAfter = `Verified cells ${changedCells} use a stratified holdout, computed majority baseline, confusion counts, and minority metrics`;
    transferBefore =
      "The metric-choice rule had not been applied under asymmetric defect costs";
    transferAfter =
      "The fixed evaluator accepted a cost-aware threshold and evidence that exposes missed defects";
    conceptLimitation =
      "Verification covers this artifact and the released class-imbalance operations; it does not choose a production threshold.";
    mutationCommand = "./scripts/run-mutations.sh imbalance";
  }
  const reasoningDiff: ReasoningDiff = {
    schemaVersion: "1",
    id: `reasoning_${crypto.randomUUID()}`,
    sessionId: input.session.id,
    dimensions: {
      belief: {
        before: evidence.beliefTest.learnerClaim,
        after: evidence.revision,
      },
      prediction: {
        before: `${evidence.prediction.choice} at ${evidence.prediction.confidence}% confidence`,
        after: observedResult,
      },
      code: {
        before: codeBefore,
        after: codeAfter,
      },
      transfer: {
        before: transferBefore,
        after: transferAfter,
      },
    },
    evidenceEventHashes: [
      event("prediction.committed").eventHash,
      event("experiment.completed").eventHash,
      event("transfer.passed").eventHash,
      event("patch.verified").eventHash,
    ],
    issuedAt: input.issuedAt,
  };
  const revisionEvent = event("revision.recorded");
  const modelEvent = event("belief_test.proposed");
  const engineSnapshotHash = scientificEngineSnapshotHash();
  const proofBundle = createProofBundle(
    {
      schemaVersion: "2",
      bundleId: `proof_${crypto.randomUUID()}`,
      sessionId: input.session.id,
      replayId: null,
      sessionMode: "live_notebook",
      scientificEngineSnapshotHash: engineSnapshotHash,
      createdAt: input.issuedAt,
      events: input.events,
      artifactManifest: input.manifest,
      beliefTest: evidence.beliefTest,
      predictionContract: evidence.prediction,
      experimentPlan: input.experimentPlan,
      planVerification: input.planVerification,
      publicCompilerEvents: input.compilerEvents,
      verifiedResultSet: evidence.result,
      learnerRevision: {
        text: evidence.revision,
        recordedAt: revisionEvent.timestamp,
        eventHash: revisionEvent.eventHash,
      },
      transferResult: evidence.transfer,
      patchPlan: input.patchPlan,
      patchPlanVerification: input.patchPlanVerification,
      patchResult: evidence.patch,
      reasoningDiff,
      versions: {
        environment:
          "Cloudflare Worker control plane and authenticated process runner",
        dependencies: "pnpm-lock.yaml and pyproject.toml",
        fixture: evidence.result.fixture.sha256,
        kernel: evidence.result.kernelVersion,
        verifier: `${input.planVerification.verifierVersion}; ${input.patchPlanVerification.verifierVersion}`,
        prompt: modelEvent.promptHash ?? "live-analyst-prompt-not-recorded",
        model: modelEvent.modelId ?? "configured-live-responses-model",
        conceptPack: evidence.result.conceptPackVersion,
      },
      limitations: [
        conceptLimitation,
        "The hosted Codex launch has a credential-and-privilege boundary; filesystem generation read isolation is PARTIAL, not a formal sandbox proof.",
        "Passing this fixed transfer verifies one task outcome; it does not establish global mastery.",
      ],
      reproductionCommands: ["./scripts/test-all.sh", mutationCommand],
    },
    {
      scientificEngineSnapshotHash: engineSnapshotHash,
      ...(input.signingKey === undefined
        ? {}
        : { signingKey: input.signingKey }),
    },
  );
  return { reasoningDiff, proofBundle };
}
