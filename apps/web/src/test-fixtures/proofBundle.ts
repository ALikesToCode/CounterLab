import {
  VerifiedResultSetSchema,
  type ArtifactManifest,
  type BeliefTest,
  type SessionMode,
} from "@counterlab/contracts";
import {
  createEvidenceEvent,
  createProofBundle,
} from "@counterlab/proof-bundle";

import rawSampleResult from "../../../../fixtures/public/leakage_verified_result.json";

const digest = (character: string) => character.repeat(64);

export function createProofBoundSessionFixture(input: {
  session: {
    sessionId: string;
    artifactId: string;
    mode: SessionMode;
    createdAt: string;
    updatedAt: string;
  };
  artifact: ArtifactManifest;
  beliefTest: BeliefTest;
}) {
  const { session, artifact, beliefTest } = input;
  const verifiedResult = VerifiedResultSetSchema.parse(rawSampleResult);
  const prediction = {
    schemaVersion: "1" as const,
    id: "prediction_1",
    sessionId: session.sessionId,
    beliefTestId: beliefTest.id,
    choice: "Accuracy remains high",
    confidence: 80,
    committedAt: "2026-07-14T10:02:00.000Z",
    immutableHash: digest("3"),
  };
  const transferResult = {
    schemaVersion: "1" as const,
    id: "transfer_1",
    sessionId: session.sessionId,
    taskId: "forecast-future-leakage-v1",
    outcome: "PASSED" as const,
    selectedStrategy: "time_ordered_holdout",
    identifiedRisks: ["future_feature"],
    evidenceChoices: ["feature created after prediction time"],
    checks: [
      {
        invariant: "time_ordered_split",
        passed: true,
        evidence: "training observations precede test observations",
      },
    ],
    evaluatorVersion: "1.0.0",
    evaluatedAt: "2026-07-14T10:07:00.000Z",
    resultHash: digest("b"),
  };
  const patchResult = {
    schemaVersion: "1" as const,
    id: "patch_1",
    sessionId: session.sessionId,
    status: "VERIFIED" as const,
    sourceArtifactHash: artifact.fileSha256,
    patchedArtifactHash: digest("c"),
    patchHash: digest("d"),
    modifiedCells: [3],
    diff: "--- cell-3-before.py\n+++ cell-3-after.py",
    verification: {
      passed: true,
      invariants: ["zero_group_overlap"],
      unchangedCellHashes: [digest("e")],
    },
    generatedAt: "2026-07-14T10:08:00.000Z",
    resultHash: digest("f"),
  };
  const event = createEvidenceEvent({
    eventId: "event_1",
    sessionId: session.sessionId,
    sequence: 1,
    timestamp: "2026-07-14T10:09:00.000Z",
    actor: "system",
    kind: "reasoning_diff.issued",
    inputHashes: [],
    outputHashes: [
      prediction.immutableHash,
      digest("4"),
      digest("6"),
      digest("7"),
      verifiedResult.resultHash,
      transferResult.resultHash,
      patchResult.resultHash,
    ],
    payload: { state: "REASONING_DIFF_ISSUED" },
  });
  const reasoningDiff = {
    schemaVersion: "1" as const,
    id: "diff_1",
    sessionId: session.sessionId,
    dimensions: {
      belief: { before: "Rows generalize", after: "Hold out entities" },
      prediction: { before: "Accuracy stays high", after: "Accuracy fell" },
      code: { before: "Random split", after: "Group split" },
      transfer: { before: "Random dates", after: "Time holdout" },
    },
    evidenceEventHashes: [event.eventHash],
    issuedAt: "2026-07-14T10:10:00.000Z",
  };
  const proofBundle = createProofBundle({
    schemaVersion: "1",
    bundleId: "bundle_1",
    sessionId: session.sessionId,
    replayId: "leakage-01",
    createdAt: "2026-07-14T10:10:00.000Z",
    events: [event],
    artifactManifest: artifact,
    beliefTest,
    predictionContract: prediction,
    experimentPlan: {
      schemaVersion: "1",
      concept: "entity_leakage",
      datasetAdapter: "customer_churn_v1",
      competingHypotheses: ["Rows generalize", "Identity leaks"],
      expectedDiscrimination: [
        {
          runId: "customer_group_split",
          expectedUnderCurrent: "Accuracy remains high",
          expectedUnderCompeting: "Accuracy falls",
        },
      ],
      runs: [
        {
          id: "customer_group_split",
          split: "group",
          groupBy: "customer_id",
          model: "logistic_regression",
          seed: 1729,
        },
      ],
      metrics: ["accuracy"],
      views: ["comparison"],
      invariants: ["zero_group_overlap"],
      resourceLimits: {
        wallSeconds: 30,
        memoryMb: 512,
        maxProcesses: 4,
        maxFiles: 16,
        maxOutputBytes: 1_048_576,
      },
    },
    generatedAdapter: { sha256: digest("4"), commitHash: digest("5") },
    publicTests: {
      passed: 3,
      failed: 0,
      command: "pytest public_tests.py",
      reportHash: digest("6"),
    },
    externalVerifier: {
      status: "VERIFIED",
      verifiedInvariants: ["zero_group_overlap"],
      mutations: ["group-overlap-leak"],
      reportHash: digest("7"),
    },
    verifiedResultSet: verifiedResult,
    learnerRevision: {
      text: "Evaluation must hold out the deployment entity.",
      recordedAt: "2026-07-14T10:09:00.000Z",
      eventHash: event.eventHash,
    },
    transferResult,
    patchResult,
    reasoningDiff,
    versions: {
      environment: "test",
      dependencies: "locked",
      fixture: "leakage-v1",
      kernel: "0.1.0",
      verifier: "0.1.0",
      prompt: "belief-v1",
      model: "stored-replay",
      template: "leakage-template-v1",
    },
    limitations: ["Synthetic fixture; no global mastery claim."],
    reproductionCommands: ["./scripts/reproduce-session.sh leakage-01"],
  });
  return {
    ...session,
    state: "REASONING_DIFF_ISSUED" as const,
    version: 12,
    beliefTest,
    prediction,
    verifiedResult,
    transferResult,
    patchResult,
    reasoningDiff,
    proofBundle,
  };
}

export function createDefaultProofBoundSessionFixture() {
  const artifact: ArtifactManifest = {
    artifactId: "artifact_1",
    fileName: "customer_churn_leakage.ipynb",
    fileSha256: digest("a"),
    nbformat: 4,
    support: { status: "SUPPORTED", reasons: [] },
    cells: [],
    schemaSummary: {
      fields: [],
      entityCandidates: ["customer_id"],
      targetCandidates: ["churned"],
    },
    packageHints: ["sklearn"],
    createdAt: "2026-07-14T10:00:00.000Z",
  };
  const beliefTest: BeliefTest = {
    schemaVersion: "1",
    id: "belief_1",
    concept: "entity_leakage",
    learnerClaim: "The score proves generalization.",
    currentHypothesis: {
      statement: "The model generalizes to unseen customers.",
      predictedOutcome: "Group-holdout accuracy remains high.",
    },
    competingHypothesis: {
      statement: "Repeated identities inflate the random split.",
      predictedOutcome: "Group-holdout accuracy falls.",
    },
    evidenceRefs: [],
    alternatives: [],
    decisiveIntervention: {
      id: "group-holdout",
      description: "Hold out complete customers.",
      controlledVariables: ["model", "seed"],
      changedVariables: ["split boundary"],
      discriminatesBecause: "The hypotheses predict different outcomes.",
    },
    uncertainty: {
      confidence: 0.25,
      limitations: ["The group result is not known yet."],
      insufficientEvidence: true,
    },
    requiresLearnerConfirmation: true,
  };
  return createProofBoundSessionFixture({
    session: {
      sessionId: "session_1",
      artifactId: artifact.artifactId,
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
      createdAt: "2026-07-14T10:01:00.000Z",
      updatedAt: "2026-07-14T10:10:00.000Z",
    },
    artifact,
    beliefTest,
  });
}
