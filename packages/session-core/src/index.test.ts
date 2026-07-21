import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";
import {
  migrateBeliefTestV1ToV2,
  type LearningDirectorSessionState,
} from "@counterlab/contracts";
import { verifyEvidenceChain } from "../../proof-bundle/src/index.js";

import {
  hashCanonical,
  InvalidSessionTransitionError,
  normalizeSessionMode,
  PredictionAlreadyCommittedError,
  SessionInputError,
  SessionService,
} from "./index.js";
import { SqliteSessionRepository } from "./sqlite-repository.js";

const HASH = "a".repeat(64);

const beliefTest = {
  schemaVersion: "1",
  id: "belief-1",
  concept: "entity_leakage",
  learnerClaim:
    "The 99% accuracy proves this model generalizes to new customers.",
  currentHypothesis: {
    statement: "Random row accuracy measures new-customer generalization.",
    predictedOutcome: "Group-split accuracy stays near random-split accuracy.",
  },
  competingHypothesis: {
    statement: "Customer identity leaks across the row split.",
    predictedOutcome: "Group-split accuracy falls and overlap becomes zero.",
  },
  evidenceRefs: [
    {
      cellIndex: 3,
      outputIndex: 0,
      kind: "metric",
      hash: HASH,
      excerpt: "accuracy=0.99",
      relevance: "The displayed result uses a row split.",
    },
  ],
  alternatives: [],
  decisiveIntervention: {
    id: "group-split",
    description: "Hold out complete customers.",
    controlledVariables: ["model", "seed"],
    changedVariables: ["split strategy"],
    discriminatesBecause:
      "Only the competing hypothesis predicts a material fall.",
  },
  uncertainty: {
    confidence: 0.9,
    limitations: [],
    insufficientEvidence: false,
  },
  requiresLearnerConfirmation: true,
} as const;

const prediction = {
  schemaVersion: "1",
  id: "prediction-1",
  sessionId: "session-1",
  beliefTestId: "belief-1",
  choice: "accuracy remains above 0.9",
  confidence: 80,
  committedAt: "2026-07-14T04:00:03.000Z",
  immutableHash: "b".repeat(64),
};

const resultSet = {
  schemaVersion: "1",
  concept: "entity_leakage",
  fixture: {
    customers: 300,
    rows: 1200,
    sha256: "c".repeat(64),
    targetRate: 0.45,
  },
  kernelVersion: "1.0.0",
  seed: 1729,
  runs: [
    {
      id: "group_split",
      splitStrategy: "group",
      groupBy: "customer_id",
      dropFeatures: ["customer_id"],
      model: "logistic_regression",
      seed: 1729,
      inputFingerprint: "d".repeat(64),
      featureSetFingerprint: "e".repeat(64),
      metrics: { accuracy: 0.68, rocAuc: 0.7 },
      sampleSizes: { train: 900, test: 300 },
      entityCounts: { train: 225, test: 75 },
      entityOverlap: { count: 0, rate: 0 },
    },
  ],
  chartData: [
    {
      runId: "group_split",
      splitStrategy: "group",
      accuracy: 0.68,
      rocAuc: 0.7,
      sampleSize: 300,
      seed: 1729,
    },
  ],
  resultHash: "c".repeat(64),
};

const hostedResultSet = {
  ...resultSet,
  schemaVersion: "2",
  planId: "plan-v5-1",
  sessionId: "session-1",
  artifactManifestHash: "1".repeat(64),
  conceptPackVersion: "2.0.0",
  runs: resultSet.runs.map((run) => ({
    ...run,
    operation: "leakage.group_holdout",
    pipelineFingerprint: "f".repeat(64),
  })),
  resultHash: "6".repeat(64),
} as const;

const supportsVerdict = {
  schemaVersion: "1",
  kind: "SUPPORTS",
  hypothesisId: "competing",
  scope: "unseen customers in the documented fixture",
  resultHash: hostedResultSet.resultHash,
  irHash: "7".repeat(64),
  technicalReportHash: "8".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
} as const;

const inconclusiveVerdict = {
  schemaVersion: "1",
  kind: "INCONCLUSIVE",
  reasonCode: "GAP_WITHIN_TOLERANCE",
  scope: "unseen customers in the documented fixture",
  resultHash: hostedResultSet.resultHash,
  irHash: "7".repeat(64),
  technicalReportHash: "8".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
} as const;

const rejectedVerdict = {
  schemaVersion: "1",
  kind: "REJECTED",
  findingIds: ["finding_001"],
  resultReleased: false,
  irHash: "7".repeat(64),
  technicalReportHash: "8".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
} as const;

const EPISTEMIC_REPORT_HASH = "9".repeat(64);

async function boundaryMapAuthority(
  overrides: {
    sessionId?: string;
    experimentIrHash?: string;
    authoritativeResultHash?: string;
    evidenceVerdictHash?: string;
    contentHash?: string;
    receiptHash?: string;
  } = {},
) {
  const receiptContent = {
    schemaVersion: "1" as const,
    canonicalProfile: "counterlab-canonical-json-v1" as const,
    sessionId: overrides.sessionId ?? "session-1",
    resultHash: "0".repeat(64),
    verificationReportHash: "1".repeat(64),
    experimentIrHash: overrides.experimentIrHash ?? supportsVerdict.irHash,
    authoritativeResultHash:
      overrides.authoritativeResultHash ?? hostedResultSet.resultHash,
    evidenceVerdictHash:
      overrides.evidenceVerdictHash ?? (await hashCanonical(supportsVerdict)),
    issuedAt: "2026-07-14T04:00:09.000Z",
  };
  const integrity = {
    mode: "integrity-hashed" as const,
    algorithm: "sha256" as const,
    contentHash: overrides.contentHash ?? (await hashCanonical(receiptContent)),
  };
  const unsignedReceipt = { ...receiptContent, integrity };
  return {
    jobId: "job-v5-boundary-1",
    sweepId: "leakage-recurrence-sweep",
    resultHash: receiptContent.resultHash,
    verificationReportHash: receiptContent.verificationReportHash,
    receipt: {
      ...unsignedReceipt,
      receiptHash:
        overrides.receiptHash ?? (await hashCanonical(unsignedReceipt)),
    },
    cellCount: 25,
  };
}

async function scientificLineage(beliefSpec: unknown) {
  return {
    schemaVersion: "5" as const,
    status: "VERIFIED" as const,
    source: "hosted-experiment-ir-v5" as const,
    jobId: "job-v5-compile-1",
    inputBundleHash: "2".repeat(64),
    artifactManifestHash: hostedResultSet.artifactManifestHash,
    beliefSpecHash: await hashCanonical(beliefSpec),
    predictionHash: prediction.immutableHash,
    compilerOutputFileHashes: {
      "discrimination-contract.json": "3".repeat(64),
      "experiment-ir.json": "4".repeat(64),
      "lab-scene.json": "5".repeat(64),
      "public-rationale.md": "6".repeat(64),
    },
    discriminationContractHash: "a".repeat(64),
    rawExperimentIrCanonicalHash: "b".repeat(64),
    labSceneHash: "c".repeat(64),
    candidateVerificationReportHash: "d".repeat(64),
    scientificVerifierVersion: "scientific-candidate-verifier-v1" as const,
    selectionHash: "e".repeat(64),
    selectedExperimentIrHash: supportsVerdict.irHash,
    projectedPlanHash: "f".repeat(64),
    scorerVersion: "experiment-scorer-v1",
    projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1" as const,
  };
}

const passingTransfer = {
  schemaVersion: "1",
  id: "transfer-1",
  sessionId: "session-1",
  taskId: "future-leakage-forecasting",
  outcome: "PASSED",
  selectedStrategy: "time_split",
  identifiedRisks: ["future_information"],
  evidenceChoices: ["timestamp ordering"],
  checks: [
    {
      invariant: "time_split_selected",
      passed: true,
      evidence: "Training rows precede evaluation rows.",
    },
  ],
  evaluatorVersion: "1.0.0",
  evaluatedAt: "2026-07-14T04:00:11.000Z",
  resultHash: "d".repeat(64),
};

const failingTransfer = {
  ...passingTransfer,
  outcome: "FAILED",
  selectedStrategy: "random_split",
  checks: [
    {
      invariant: "time_split_selected",
      passed: false,
      evidence: "Random rows mix future observations into training.",
    },
  ],
  resultHash: "e".repeat(64),
};

const artifactManifest = {
  artifactId: "artifact-1",
  fileName: "customer-churn.ipynb",
  fileSha256: "1".repeat(64),
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    rowCount: 1200,
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-07-14T04:00:00.000Z",
} as const;

const experimentPlan = {
  schemaVersion: "1",
  concept: "entity_leakage",
  datasetAdapter: "customer_churn_v1",
  competingHypotheses: ["Rows generalize", "Customer identity leaks"],
  expectedDiscrimination: [
    {
      runId: "group_split",
      expectedUnderCurrent: "Accuracy stays high",
      expectedUnderCompeting: "Accuracy falls materially",
    },
  ],
  runs: [
    {
      id: "group_split",
      split: "group",
      groupBy: "customer_id",
      dropFeatures: ["customer_id"],
      model: "logistic_regression",
      seed: 1729,
    },
  ],
  metrics: ["accuracy"],
  views: ["metric_comparison"],
  invariants: ["zero_group_overlap"],
  resourceLimits: {
    wallSeconds: 30,
    memoryMb: 512,
    maxProcesses: 4,
    maxFiles: 16,
    maxOutputBytes: 1048576,
  },
} as const;

class DeterministicIds {
  private next = 0;

  id = (prefix: string) => `${prefix}-${++this.next}`;
  now = () =>
    new Date(`2026-07-14T04:00:${String(this.next).padStart(2, "0")}.000Z`);
}

function memoryService() {
  const ids = new DeterministicIds();
  const repository = new SqliteSessionRepository(":memory:");
  return {
    repository,
    service: new SessionService(repository, { id: ids.id, now: ids.now }),
  };
}

async function throughExperiment(service: SessionService) {
  await service.createSession({
    id: "session-1",
    artifactId: "artifact-1",
    mode: { kind: "sample_lesson", sampleId: "leakage-01" },
  });
  await service.proposeBeliefTest("session-1", beliefTest);
  await service.confirmBeliefTest("session-1");
  await service.commitPrediction("session-1", prediction);
  await service.startLabCompilation("session-1");
  await service.verifyLab("session-1", { verifierRunId: "verify-1" });
  await service.recordExperimentResult("session-1", resultSet);
}

async function throughVerifiedLab(service: SessionService) {
  await service.createSession({
    id: "session-1",
    artifactId: "artifact-1",
    mode: { kind: "live_notebook" },
  });
  await service.proposeBeliefSpecV2(
    "session-1",
    migrateBeliefTestV1ToV2(beliefTest),
  );
  await service.confirmBeliefTest("session-1");
  await service.commitPrediction("session-1", prediction);
  await service.startLabCompilation("session-1");
  const beliefSpec = (await service.getSession("session-1")).beliefSpec;
  await service.verifyLab("session-1", await scientificLineage(beliefSpec));
}

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

describe("SessionService state machine", () => {
  it("rejects unsafe v1 proposal and edit prose before Prediction", async () => {
    const { service } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    const unsafe = {
      ...beliefTest,
      competingHypothesis: {
        ...beliefTest.competingHypothesis,
        predictedOutcome:
          "The verified result is 59.4%; the fix is to remove customer_id.",
      },
    };

    await expect(
      service.proposeBeliefTest("session-1", unsafe),
    ).rejects.toThrow(/pre-Prediction narrative rejected/u);
    expect((await service.getSession("session-1")).state).toBe("INGESTED");
    expect(
      (await service.listEvents("session-1")).map(({ kind }) => kind),
    ).toEqual(["session.created"]);

    await service.proposeBeliefTest("session-1", beliefTest);
    await expect(service.editBeliefTest("session-1", unsafe)).rejects.toThrow(
      /pre-Prediction narrative rejected/u,
    );
    expect((await service.getSession("session-1")).beliefTest).toEqual(
      beliefTest,
    );
    expect(
      (await service.listEvents("session-1")).map(({ kind }) => kind),
    ).toEqual(["session.created", "belief_test.proposed"]);
  });

  it("does not advance or append an event for unsafe generated pre-Prediction prose", async () => {
    const { service } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const base = migrateBeliefTestV1ToV2(beliefTest);

    await expect(
      service.proposeBeliefSpecV2("session-1", {
        ...base,
        hypotheses: [
          base.hypotheses[0],
          {
            ...base.hypotheses[1],
            statement:
              "The verified result supports this hypothesis at 59.4%; the fix is to remove customer_id.",
          },
        ],
      }),
    ).rejects.toThrow(/pre-Prediction narrative rejected/u);

    expect((await service.getSession("session-1")).state).toBe("INGESTED");
    expect(
      (await service.listEvents("session-1")).map(({ kind }) => kind),
    ).toEqual(["session.created"]);
  });

  it("persists v2 as the single belief authority and records learner decisions", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = {
      ...migrateBeliefTestV1ToV2(beliefTest),
      alternatives: [
        {
          id: "distribution-shift",
          label: "Distribution shift",
          statement: "Deployment data differs from the notebook split.",
          rationale: "A shifted period could also change the score.",
          conditions: ["Training and deployment periods differ."],
          nonClaims: ["This alternative is not yet a verified explanation."],
          evidence: beliefTest.evidenceRefs,
          supportedCandidateExperimentIds: [],
        },
      ],
    } as const;

    await service.proposeBeliefSpecV2("session-1", beliefSpec);
    let current = await service.getSession("session-1");
    expect(current.beliefTest).toBeUndefined();
    expect(current.beliefSpec).toMatchObject({
      id: "belief-1",
      learnerDecision: "UNDECIDED",
    });

    await service.selectBeliefAlternative("session-1", "distribution-shift");
    current = await service.getSession("session-1");
    expect(current.beliefSpec).toMatchObject({
      learnerDecision: "ALTERNATIVE_SELECTED",
      selectedAlternativeId: "distribution-shift",
    });

    await service.confirmBeliefTest("session-1");
    current = await service.getSession("session-1");
    expect(current.state).toBe("BELIEF_TEST_CONFIRMED");
    expect(current.beliefSpec).toMatchObject({
      learnerDecision: "ALTERNATIVE_SELECTED",
      selectedAlternativeId: "distribution-shift",
    });

    await service.commitPrediction("session-1", prediction);
    expect((await service.getSession("session-1")).prediction).toEqual(
      prediction,
    );

    const events = await service.listEvents("session-1");
    expect(events.map(({ kind }) => kind)).toEqual([
      "session.created",
      "belief_spec.proposed",
      "belief_spec.alternative_selected",
      "belief_spec.confirmed",
      "prediction.committed",
    ]);
    expect(
      events.find(({ kind }) => kind === "belief_spec.confirmed")?.payload,
    ).toEqual({ beliefSpecId: beliefSpec.id });
    repository.close();
  });

  it("persists one presentation-only Learning Director clarification before confirmation", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    await service.proposeBeliefSpecV2("session-1", beliefSpec);
    const binding = {
      beliefSpecHash: await hashCanonical(beliefSpec),
      approvedPacketHash: "e".repeat(64),
      subjectPackVersion: "2.1.0",
    };
    const provenance = {
      modelId: "gpt-5.6",
      promptHash: "a".repeat(64),
      turns: 2,
      toolTrace: [
        {
          toolName: "get_subject_pack_capabilities" as const,
          argsHash: "b".repeat(64),
          outputHash: "c".repeat(64),
          durationMs: 1,
        },
      ],
    };
    await service.recordLearningDirector("session-1", {
      schemaVersion: "1",
      ...binding,
      clarificationUsed: true,
      decision: {
        status: "CLARIFICATION_REQUIRED",
        questionId: "learning-emphasis",
        choices: ["controls-first", "boundary-first"],
      },
      provenance,
    });

    await expect(
      service.recordLearningDirector("session-1", {
        schemaVersion: "1",
        ...binding,
        subjectPackVersion: "2.2.0",
        clarificationUsed: true,
        decision: {
          status: "READY",
          plan: {
            concept: "entity_leakage",
            introductionStages: ["Prediction", "Test", "Boundary", "Apply"],
            primaryEmphasis: "Boundary",
            scaffoldIds: ["compare-splits"],
            candidateExperimentIds: ["group-holdout"],
            sceneRecipeId: "entity-overlap-stage",
            boundaryViewId: "test-fraction-by-repeat-rate",
            evidenceHashes: [],
            nonClaims: ["bounded-claim-only"],
          },
        },
        provenance,
      }),
    ).rejects.toThrow(/Subject Pack version/u);

    await expect(
      service.recordLearningDirector("session-1", {
        schemaVersion: "1",
        ...binding,
        clarificationUsed: true,
        decision: {
          status: "CLARIFICATION_REQUIRED",
          questionId: "learning-emphasis",
          choices: ["comparison-first", "apply-first"],
        },
        provenance,
      }),
    ).rejects.toThrow(/second clarification/u);

    const readyAfterClarification: LearningDirectorSessionState = {
      schemaVersion: "1",
      ...binding,
      clarificationUsed: true,
      decision: {
        status: "READY",
        plan: {
          concept: "entity_leakage",
          introductionStages: [
            "Question",
            "Prediction",
            "Test",
            "Boundary",
            "Apply",
          ],
          primaryEmphasis: "Boundary",
          scaffoldIds: ["compare-splits"],
          candidateExperimentIds: ["group-holdout"],
          sceneRecipeId: "entity-overlap-stage",
          boundaryViewId: "test-fraction-by-repeat-rate",
          evidenceHashes: [],
          nonClaims: ["bounded-claim-only", "no-mastery-claim"],
        },
      },
      provenance,
    };
    await expect(
      service.recordLearningDirector("session-1", readyAfterClarification),
    ).rejects.toThrow(/answer is required/u);
    await expect(
      service.recordLearningDirector("session-1", readyAfterClarification, {
        clarificationAnswerHash: await hashCanonical("apply-first"),
      }),
    ).rejects.toThrow(/offered choice/u);

    await service.recordLearningDirector("session-1", readyAfterClarification, {
      clarificationAnswerHash: await hashCanonical("boundary-first"),
    });
    await service.confirmBeliefTest("session-1");

    expect(
      (await service.getSession("session-1")).learningDirector,
    ).toMatchObject({
      clarificationUsed: true,
      decision: { status: "READY" },
    });
    expect(
      (await service.listEvents("session-1")).map(({ kind }) => kind),
    ).toEqual([
      "session.created",
      "belief_spec.proposed",
      "learning_director.clarification_requested",
      "learning_director.ready",
      "belief_spec.confirmed",
    ]);
    repository.close();
  });

  it("rejects Learning Director state outside a live notebook session", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "sample-session",
      artifactId: "sample-artifact",
      mode: { kind: "sample_lesson", sampleId: "leakage" },
    });
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    await service.proposeBeliefSpecV2("sample-session", beliefSpec);

    await expect(
      service.recordLearningDirector("sample-session", {
        schemaVersion: "1",
        beliefSpecHash: await hashCanonical(beliefSpec),
        approvedPacketHash: "e".repeat(64),
        subjectPackVersion: "2.1.0",
        clarificationUsed: false,
        decision: {
          status: "READY",
          plan: {
            concept: "entity_leakage",
            introductionStages: ["Prediction", "Test", "Boundary", "Apply"],
            primaryEmphasis: "Boundary",
            scaffoldIds: ["compare-splits"],
            candidateExperimentIds: ["group-holdout"],
            sceneRecipeId: "entity-overlap-stage",
            boundaryViewId: "test-fraction-by-repeat-rate",
            evidenceHashes: [],
            nonClaims: ["bounded-claim-only"],
          },
        },
        provenance: {
          modelId: "gpt-5.6",
          promptHash: "a".repeat(64),
          turns: 1,
          toolTrace: [
            {
              toolName: "get_subject_pack_capabilities",
              argsHash: "b".repeat(64),
              outputHash: "c".repeat(64),
              durationMs: 1,
            },
          ],
        },
      }),
    ).rejects.toThrow(/proposed live Belief Spec/u);
    expect(
      (await service.getSession("sample-session")).learningDirector,
    ).toBeUndefined();
    repository.close();
  });

  it("keeps Belief Spec confirmation learner-owned while clarification is pending", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    await service.proposeBeliefSpecV2("session-1", beliefSpec);
    await service.recordLearningDirector("session-1", {
      schemaVersion: "1",
      beliefSpecHash: await hashCanonical(beliefSpec),
      approvedPacketHash: "e".repeat(64),
      subjectPackVersion: "2.1.0",
      clarificationUsed: true,
      decision: {
        status: "CLARIFICATION_REQUIRED",
        questionId: "learning-emphasis",
        choices: ["controls-first", "boundary-first"],
      },
      provenance: {
        modelId: "gpt-5.6",
        promptHash: "a".repeat(64),
        turns: 1,
        toolTrace: [
          {
            toolName: "get_subject_pack_capabilities",
            argsHash: "b".repeat(64),
            outputHash: "c".repeat(64),
            durationMs: 1,
          },
        ],
      },
    });

    await expect(service.confirmBeliefTest("session-1")).resolves.toMatchObject(
      { state: "BELIEF_TEST_CONFIRMED", learningDirector: undefined },
    );
    expect(
      (await service.getSession("session-1")).learningDirector,
    ).toBeUndefined();
    const confirmation = (await service.listEvents("session-1")).at(-1);
    expect(confirmation).toMatchObject({
      kind: "belief_spec.confirmed",
      payload: { learningDirectorDisposition: "SKIPPED" },
      inputHashes: [
        await hashCanonical(beliefSpec),
        expect.stringMatching(/^[a-f0-9]{64}$/u),
      ],
    });
    repository.close();
  });

  it("rejects an initial ready Director plan that invents clarification use", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    await service.proposeBeliefSpecV2("session-1", beliefSpec);

    await expect(
      service.recordLearningDirector("session-1", {
        schemaVersion: "1",
        beliefSpecHash: await hashCanonical(beliefSpec),
        approvedPacketHash: "e".repeat(64),
        subjectPackVersion: "2.1.0",
        clarificationUsed: true,
        decision: {
          status: "READY",
          plan: {
            concept: "entity_leakage",
            introductionStages: ["Prediction", "Test", "Boundary", "Apply"],
            primaryEmphasis: "Boundary",
            scaffoldIds: ["compare-splits"],
            candidateExperimentIds: ["group-holdout"],
            sceneRecipeId: "entity-overlap-stage",
            boundaryViewId: "test-fraction-by-repeat-rate",
            evidenceHashes: [],
            nonClaims: ["bounded-claim-only"],
          },
        },
        provenance: {
          modelId: "gpt-5.6",
          promptHash: "a".repeat(64),
          turns: 1,
          toolTrace: [
            {
              toolName: "get_subject_pack_capabilities",
              argsHash: "b".repeat(64),
              outputHash: "c".repeat(64),
              durationMs: 1,
            },
          ],
        },
      }),
    ).rejects.toThrow(/cannot claim a clarification/u);
    repository.close();
  });

  it("does not let a v2 edit change belief identity or concept", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    await service.proposeBeliefSpecV2("session-1", beliefSpec);
    await service.recordLearningDirector("session-1", {
      schemaVersion: "1",
      beliefSpecHash: await hashCanonical(beliefSpec),
      approvedPacketHash: "e".repeat(64),
      subjectPackVersion: "2.1.0",
      clarificationUsed: false,
      decision: {
        status: "READY",
        plan: {
          concept: "entity_leakage",
          introductionStages: ["Prediction", "Test", "Boundary", "Apply"],
          primaryEmphasis: "Boundary",
          scaffoldIds: ["compare-splits"],
          candidateExperimentIds: ["group-holdout"],
          sceneRecipeId: "entity-overlap-stage",
          boundaryViewId: "test-fraction-by-repeat-rate",
          evidenceHashes: [],
          nonClaims: ["bounded-claim-only"],
        },
      },
      provenance: {
        modelId: "gpt-5.6",
        promptHash: "a".repeat(64),
        turns: 1,
        toolTrace: [
          {
            toolName: "get_subject_pack_capabilities",
            argsHash: "b".repeat(64),
            outputHash: "c".repeat(64),
            durationMs: 1,
          },
        ],
      },
    });

    await expect(
      service.editBeliefSpecV2("session-1", {
        ...beliefSpec,
        id: "replacement-id",
        claim: "Edited claim",
      }),
    ).rejects.toThrow(/id/i);
    await expect(
      service.editBeliefSpecV2("session-1", {
        ...beliefSpec,
        concept: "class_imbalance",
      }),
    ).rejects.toThrow(/concept/i);

    expect((await service.getSession("session-1")).beliefSpec).toEqual(
      beliefSpec,
    );
    await service.editBeliefSpecV2("session-1", {
      ...beliefSpec,
      claim: "Edited claim with the same scientific scope.",
    });
    expect((await service.getSession("session-1")).beliefSpec).toMatchObject({
      claim: "Edited claim with the same scientific scope.",
      learnerDecision: "EDITED",
    });
    expect(
      (await service.getSession("session-1")).learningDirector,
    ).toBeUndefined();
    await service.confirmBeliefTest("session-1");
    expect((await service.getSession("session-1")).beliefSpec).toMatchObject({
      learnerDecision: "CONFIRMED",
    });
    repository.close();
  });

  it("normalizes legacy persisted modes but rejects them for new sessions", async () => {
    expect(normalizeSessionMode("instant")).toEqual({
      kind: "sample_lesson",
      sampleId: "leakage-01",
    });
    expect(normalizeSessionMode("live")).toEqual({ kind: "live_notebook" });
    expect(normalizeSessionMode("replay")).toEqual({
      kind: "verified_replay",
      replayId: "leakage-01",
    });

    const { service, repository } = memoryService();
    await expect(
      service.createSession({
        id: "legacy-mode-session",
        artifactId: "artifact-1",
        mode: "instant" as never,
      }),
    ).rejects.toThrow();
    repository.close();
  });

  it("rejects illegal transitions and never publishes a result before prediction", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });

    await expect(
      service.startLabCompilation("session-1"),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);
    await expect(
      service.recordExperimentResult("session-1", resultSet),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);
    expect(
      (await service.getSession("session-1")).verifiedResult,
    ).toBeUndefined();
    repository.close();
  });

  it("records compiler dispatch as requested until verifier-bound artifacts exist", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    await service.proposeBeliefSpecV2(
      "session-1",
      migrateBeliefTestV1ToV2(beliefTest),
    );
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);
    await service.startLabCompilation("session-1", {
      actor: "system",
      authority: "runtime-codex-requested",
    });

    let events = await service.listEvents("session-1");
    expect(events.at(-1)).toMatchObject({
      actor: "system",
      kind: "lab.compilation_started",
      payload: { authority: "runtime-codex-requested" },
    });
    expect(events.some((event) => event.actor === "codex")).toBe(false);

    const beliefSpec = (await service.getSession("session-1")).beliefSpec;
    const lineage = await scientificLineage(beliefSpec);
    await service.verifyLab("session-1", lineage);
    events = await service.listEvents("session-1");
    expect(events.at(-1)).toMatchObject({
      actor: "verifier",
      kind: "lab.verified",
      payload: {
        status: "VERIFIED",
        source: "hosted-experiment-ir-v5",
        jobId: lineage.jobId,
        compilerOutputFileHashes: lineage.compilerOutputFileHashes,
      },
    });
    expect(events.some((event) => event.actor === "codex")).toBe(false);
    repository.close();
  });

  it("atomically persists a supported epistemic result, verdict, and report authority", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    const completed = await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    expect(completed).toMatchObject({
      state: "EXPERIMENT_COMPLETED",
      verifiedResult: hostedResultSet,
      evidenceVerdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    const event = (await service.listEvents("session-1")).at(-1);
    expect(event).toMatchObject({
      actor: "verifier",
      kind: "experiment.evidence_verified",
      payload: {
        verdict: "SUPPORTS",
        resultHash: hostedResultSet.resultHash,
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      },
    });
    expect(verifyEvidenceChain(await service.listEvents("session-1"))).toEqual(
      expect.objectContaining({ valid: true }),
    );
    repository.close();
  });

  it("persists an inconclusive result as educational evidence", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    const completed = await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: inconclusiveVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    expect(completed.state).toBe("EXPERIMENT_COMPLETED");
    expect(completed.evidenceVerdict).toEqual(inconclusiveVerdict);
    expect(completed.verifiedResult).toEqual(hostedResultSet);
    repository.close();
  });

  it("projects an independently verified Boundary Map authority into the session", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);
    await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    const authority = await boundaryMapAuthority();

    const bounded = await service.recordBoundaryMapAuthority(
      "session-1",
      authority,
    );

    expect(bounded).toMatchObject({
      state: "BOUNDARY_VERIFIED",
      boundaryMapAuthority: authority,
    });
    expect((await service.listEvents("session-1")).at(-1)).toMatchObject({
      actor: "verifier",
      kind: "boundary_map.verified",
      payload: {
        jobId: authority.jobId,
        sweepId: authority.sweepId,
        resultHash: authority.resultHash,
        cellCount: authority.cellCount,
      },
    });
    expect(verifyEvidenceChain(await service.listEvents("session-1"))).toEqual(
      expect.objectContaining({ valid: true }),
    );
    repository.close();
  });

  it("requires verified Boundary Map authority before a v5 learner revision", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);
    await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    await expect(
      service.recordRevision(
        "session-1",
        "The deployment unit should determine the evaluation boundary.",
      ),
    ).rejects.toThrow(/Boundary Map/i);
    expect((await service.getSession("session-1")).state).toBe(
      "EXPERIMENT_COMPLETED",
    );

    await service.recordBoundaryMapAuthority(
      "session-1",
      await boundaryMapAuthority(),
    );
    const revised = await service.recordRevision(
      "session-1",
      "The deployment unit should determine the evaluation boundary.",
    );
    expect(revised.state).toBe("REVISION_RECORDED");
    repository.close();
  });

  it("rejects mismatched or corrupted Boundary Map authority without changing state", async () => {
    const cases = [
      { sessionId: "another-session" },
      { experimentIrHash: "2".repeat(64) },
      { authoritativeResultHash: "3".repeat(64) },
      { evidenceVerdictHash: "4".repeat(64) },
      { contentHash: "5".repeat(64) },
      { receiptHash: "6".repeat(64) },
    ] as const;

    for (const overrides of cases) {
      const { service, repository } = memoryService();
      await throughVerifiedLab(service);
      await service.recordEpistemicResult("session-1", {
        result: hostedResultSet,
        verdict: supportsVerdict,
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      });

      await expect(
        service.recordBoundaryMapAuthority(
          "session-1",
          await boundaryMapAuthority(overrides),
        ),
      ).rejects.toBeInstanceOf(SessionInputError);
      const unchanged = await service.getSession("session-1");
      expect(unchanged.state).toBe("EXPERIMENT_COMPLETED");
      expect(unchanged.boundaryMapAuthority).toBeUndefined();
      repository.close();
    }
  });

  it("rejects mismatched epistemic release authority without changing state", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    await expect(
      service.recordEpistemicResult("session-1", {
        result: hostedResultSet,
        verdict: { ...supportsVerdict, resultHash: "0".repeat(64) },
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      }),
    ).rejects.toThrow(/result hash/i);
    expect(await service.getSession("session-1")).toMatchObject({
      state: "LAB_VERIFIED",
    });
    expect(
      (await service.getSession("session-1")).verifiedResult,
    ).toBeUndefined();
    repository.close();
  });

  it("requires Belief Spec v2 and its exact compile lineage for epistemic release", async () => {
    const legacy = memoryService();
    await legacy.service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "live_notebook" },
    });
    await legacy.service.proposeBeliefTest("session-1", beliefTest);
    await legacy.service.confirmBeliefTest("session-1");
    await legacy.service.commitPrediction("session-1", prediction);
    await legacy.service.startLabCompilation("session-1");
    await legacy.service.verifyLab(
      "session-1",
      await scientificLineage(migrateBeliefTestV1ToV2(beliefTest)),
    );

    await expect(
      legacy.service.recordEpistemicResult("session-1", {
        result: hostedResultSet,
        verdict: supportsVerdict,
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      }),
    ).rejects.toThrow(/Belief Spec v2/i);
    expect((await legacy.service.getSession("session-1")).state).toBe(
      "LAB_VERIFIED",
    );
    legacy.repository.close();

    const mismatched = memoryService();
    await throughVerifiedLab(mismatched.service);
    await expect(
      mismatched.service.recordEpistemicResult("session-1", {
        result: {
          ...hostedResultSet,
          artifactManifestHash: "0".repeat(64),
        },
        verdict: supportsVerdict,
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      }),
    ).rejects.toThrow(/artifact manifest/i);
    expect((await mismatched.service.getSession("session-1")).state).toBe(
      "LAB_VERIFIED",
    );
    mismatched.repository.close();
  });

  it("does not let the legacy result method bypass v5 epistemic authority", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    await expect(
      service.recordExperimentResult("session-1", resultSet),
    ).rejects.toThrow(/epistemic/i);
    expect((await service.getSession("session-1")).state).toBe("LAB_VERIFIED");
    repository.close();
  });

  it("locks repair when a valid experiment remains inconclusive", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);
    await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: inconclusiveVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    await service.recordBoundaryMapAuthority(
      "session-1",
      await boundaryMapAuthority({
        evidenceVerdictHash: await hashCanonical(inconclusiveVerdict),
      }),
    );
    await service.recordRevision(
      "session-1",
      "This result does not yet distinguish the two explanations.",
    );
    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", passingTransfer);

    await expect(
      service.startPatchCompilation("session-1"),
    ).rejects.toBeInstanceOf(SessionInputError);
    await expect(service.startPatchCompilation("session-1")).rejects.toThrow(
      /INCONCLUSIVE/i,
    );
    expect((await service.getSession("session-1")).state).toBe(
      "TRANSFER_PASSED",
    );
    repository.close();
  });

  it("records epistemic rejection without releasing a result", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);

    const rejected = await service.recordEpistemicRejection("session-1", {
      verdict: rejectedVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });

    expect(rejected).toMatchObject({
      state: "LAB_VERIFIED",
      evidenceVerdict: rejectedVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    expect(rejected.verifiedResult).toBeUndefined();
    expect((await service.listEvents("session-1")).at(-1)).toMatchObject({
      actor: "verifier",
      kind: "experiment.evidence_rejected",
      payload: {
        verdict: "REJECTED",
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
      },
    });
    repository.close();
  });

  it("supports edit, confirm, reject, and insufficient-evidence belief responses", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);

    const edited = { ...beliefTest, learnerClaim: "Edited claim" };
    await service.editBeliefTest("session-1", edited);
    expect((await service.getSession("session-1")).state).toBe(
      "BELIEF_TEST_PROPOSED",
    );
    expect((await service.getSession("session-1")).beliefTest).toEqual(edited);
    await service.confirmBeliefTest("session-1");
    expect((await service.getSession("session-1")).state).toBe(
      "BELIEF_TEST_CONFIRMED",
    );

    await service.createSession({
      id: "session-2",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-2", {
      ...beliefTest,
      id: "belief-2",
    });
    await service.rejectBeliefTest(
      "session-2",
      "Evidence does not match my claim",
    );
    expect((await service.getSession("session-2")).state).toBe(
      "REJECTED_BY_LEARNER",
    );
    const rejectedEvent = (await service.listEvents("session-2")).at(-1);
    expect(rejectedEvent?.inputHashes).toHaveLength(1);
    expect(rejectedEvent?.outputHashes).toHaveLength(1);

    await service.createSession({
      id: "session-3",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-3", {
      ...beliefTest,
      id: "belief-3",
      uncertainty: { ...beliefTest.uncertainty, insufficientEvidence: true },
    });
    await service.markInsufficientEvidence(
      "session-3",
      "No split code is visible",
    );
    expect((await service.getSession("session-3")).state).toBe(
      "INSUFFICIENT_EVIDENCE",
    );
    const insufficientEvent = (await service.listEvents("session-3")).at(-1);
    expect(insufficientEvent?.inputHashes).toHaveLength(1);
    expect(insufficientEvent?.outputHashes).toHaveLength(1);

    const sourceEventHash = insufficientEvent?.eventHash;
    const restarted = await service.createSession({
      id: "session-4",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
      sourceSessionId: "session-3",
    });
    expect(restarted.state).toBe("INGESTED");
    const restartEvent = (await service.listEvents("session-4"))[0];
    expect(restartEvent).toMatchObject({
      kind: "session.created",
      payload: {
        sourceSessionId: "session-3",
        sourceState: "INSUFFICIENT_EVIDENCE",
        sourceEventHash,
      },
    });
    expect(restartEvent?.inputHashes).toContain(sourceEventHash);
    expect(restartEvent?.inputHashes).toHaveLength(2);
    expect(restartEvent?.outputHashes).toHaveLength(1);
    repository.close();
  });

  it("does not treat an edit as an initial Belief Test proposal", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });

    await expect(
      service.editBeliefTest("session-1", beliefTest),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);
    expect((await service.getSession("session-1")).state).toBe("INGESTED");
    repository.close();
  });

  it("rejects schema-invalid domain payloads without advancing state", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });

    await expect(
      service.proposeBeliefTest("session-1", {
        ...beliefTest,
        evidenceRefs: [],
      }),
    ).rejects.toThrow();
    expect((await service.getSession("session-1")).state).toBe("INGESTED");
    expect(await service.listEvents("session-1")).toHaveLength(1);
    repository.close();
  });

  it("rejects every second prediction write", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);

    await expect(
      service.commitPrediction("session-1", prediction),
    ).rejects.toBeInstanceOf(PredictionAlreadyCommittedError);
    expect((await service.getSession("session-1")).prediction).toEqual(
      prediction,
    );
    repository.close();
  });

  it("links authoritative contract hashes from evidence-event outputs", async () => {
    const { service, repository } = memoryService();
    await throughExperiment(service);

    const events = await service.listEvents("session-1");
    expect(
      events.find((event) => event.kind === "prediction.committed")
        ?.outputHashes,
    ).toContain(prediction.immutableHash);
    expect(
      events.find((event) => event.kind === "experiment.completed")
        ?.outputHashes,
    ).toContain(resultSet.resultHash);
    repository.close();
  });

  it("links verified compiler evidence without trusting malformed hashes", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);
    await service.startLabCompilation("session-1");

    const adapterHash = "a".repeat(64);
    const verifierHash = "b".repeat(64);
    const operationSummary = {
      schemaVersion: "1",
      authority: "fixed-approved-sample",
      authorityHash: adapterHash,
      selectionRef: "stored-approved-leakage-v1",
      operationIds: ["leakage.random_row_split", "leakage.group_holdout"],
    } as const;
    await service.verifyLab(
      "session-1",
      { status: "VERIFIED" },
      [adapterHash, verifierHash, adapterHash],
      operationSummary,
    );
    const verifiedEvent = (await service.listEvents("session-1")).at(-1);
    expect(verifiedEvent?.outputHashes).toEqual(
      expect.arrayContaining([adapterHash, verifierHash]),
    );
    expect(verifiedEvent?.payload).toMatchObject({
      verifiedOperationSummary: operationSummary,
    });

    const second = memoryService();
    await second.service.createSession({
      id: "session-2",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await second.service.proposeBeliefTest("session-2", {
      ...beliefTest,
      id: "belief-2",
    });
    await second.service.confirmBeliefTest("session-2");
    await second.service.commitPrediction("session-2", {
      ...prediction,
      id: "prediction-2",
      sessionId: "session-2",
      beliefTestId: "belief-2",
    });
    await second.service.startLabCompilation("session-2");
    await expect(
      second.service.verifyLab("session-2", { status: "VERIFIED" }, [
        "not-a-hash",
      ]),
    ).rejects.toThrow(/SHA-256/);
    await expect(
      second.service.verifyLab(
        "session-2",
        { status: "VERIFIED" },
        [adapterHash],
        { ...operationSummary, operationIds: ["model.authored_formula"] },
      ),
    ).rejects.toThrow();
    repository.close();
    second.repository.close();
  });

  it("prevents a rejected lab from producing results until it is compiled and verified again", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.confirmBeliefTest("session-1");
    await service.commitPrediction("session-1", prediction);
    await service.startLabCompilation("session-1");
    await service.rejectLab("session-1", {
      invariant: "zero_group_overlap",
      observed: 12,
    });

    await expect(
      service.recordExperimentResult("session-1", resultSet),
    ).rejects.toThrow(/LAB_REJECTED/);
    await service.startLabCompilation("session-1");
    await service.verifyLab("session-1", { verifierRunId: "verify-2" });
    await service.recordExperimentResult("session-1", resultSet);
    expect((await service.getSession("session-1")).state).toBe(
      "EXPERIMENT_COMPLETED",
    );
    repository.close();
  });

  it("requires revision and a passing transfer before patch compilation", async () => {
    const { service, repository } = memoryService();
    await throughExperiment(service);

    await expect(service.startTransfer("session-1")).rejects.toBeInstanceOf(
      InvalidSessionTransitionError,
    );
    await service.recordRevision(
      "session-1",
      "Evaluation must keep each entity entirely inside one split.",
    );
    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", failingTransfer);
    await expect(
      service.startPatchCompilation("session-1"),
    ).rejects.toBeInstanceOf(InvalidSessionTransitionError);

    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", passingTransfer);
    expect(
      (await service.listEvents("session-1")).find(
        (event) => event.kind === "transfer.passed",
      )?.outputHashes,
    ).toContain(passingTransfer.resultHash);
    await service.startPatchCompilation("session-1");
    expect((await service.getSession("session-1")).state).toBe(
      "PATCH_COMPILING",
    );
    repository.close();
  });

  it("supports patch rejection, retry, verification, and Reasoning Diff issuance", async () => {
    const { service, repository } = memoryService();
    await throughExperiment(service);
    await service.recordRevision(
      "session-1",
      "Evaluation must keep each entity entirely inside one split.",
    );
    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", passingTransfer);
    await service.startPatchCompilation("session-1");
    await service.rejectPatch("session-1", {
      invariant: "unrelated_cells_unchanged",
    });
    await service.startPatchCompilation("session-1");

    const patchResult = {
      schemaVersion: "1",
      id: "patch-1",
      sessionId: "session-1",
      status: "VERIFIED",
      sourceArtifactHash: "2".repeat(64),
      patchedArtifactHash: "3".repeat(64),
      patchHash: "f".repeat(64),
      modifiedCells: [3],
      diff: "- train_test_split\n+ GroupShuffleSplit",
      verification: {
        passed: true,
        invariants: ["zero_group_overlap", "unrelated_cells_unchanged"],
        unchangedCellHashes: ["4".repeat(64)],
      },
      generatedAt: "2026-07-14T04:00:14.000Z",
      resultHash: "5".repeat(64),
    };
    await service.verifyPatch("session-1", patchResult);
    const eventsBeforeDiff = await service.listEvents("session-1");
    expect(
      eventsBeforeDiff.find((event) => event.kind === "patch.verified")
        ?.outputHashes,
    ).toEqual(
      expect.arrayContaining([
        patchResult.resultHash,
        patchResult.patchHash,
        patchResult.patchedArtifactHash,
      ]),
    );
    const reasoningDiff = {
      schemaVersion: "1",
      id: "reasoning-1",
      sessionId: "session-1",
      dimensions: {
        belief: {
          before: "Rows prove generalization",
          after: "Entities must be held out",
        },
        prediction: { before: "Accuracy stays high", after: "Accuracy fell" },
        code: { before: "Random row split", after: "Customer group split" },
        transfer: {
          before: "Random forecast split",
          after: "Time-aware split",
        },
      },
      evidenceEventHashes: eventsBeforeDiff.map((event) => event.eventHash),
      issuedAt: "2026-07-14T04:00:15.000Z",
    };
    const proofBundle = {
      schemaVersion: "1",
      bundleId: "bundle-1",
      sessionId: "session-1",
      replayId: "leakage-01",
      createdAt: "2026-07-14T04:00:15.000Z",
      events: eventsBeforeDiff,
      artifactManifest,
      beliefTest,
      predictionContract: prediction,
      experimentPlan,
      generatedAdapter: {
        sha256: "6".repeat(64),
        commitHash: "7".repeat(64),
      },
      publicTests: {
        passed: 3,
        failed: 0,
        command: "pytest public_tests.py",
        reportHash: "8".repeat(64),
      },
      externalVerifier: {
        status: "VERIFIED",
        verifiedInvariants: ["zero_group_overlap"],
        mutations: ["stale_metric_literal"],
        reportHash: "9".repeat(64),
      },
      verifiedResultSet: resultSet,
      learnerRevision: {
        text: "Evaluation must keep each entity entirely inside one split.",
        recordedAt: "2026-07-14T04:00:09.000Z",
        eventHash:
          eventsBeforeDiff.find((event) => event.kind === "revision.recorded")
            ?.eventHash ?? HASH,
      },
      transferResult: passingTransfer,
      patchResult,
      reasoningDiff,
      versions: {
        environment: "test",
        dependencies: "locked",
        fixture: "1.0.0",
        kernel: "1.0.0",
        verifier: "1.0.0",
        prompt: "1.0.0",
        model: "replay",
        template: "1.0.0",
      },
      limitations: ["Supports the documented notebook subset only."],
      reproductionCommands: ["./scripts/reproduce-session.sh leakage-01"],
      integrity: {
        mode: "integrity-hashed",
        algorithm: "sha256",
        contentHash: "a".repeat(64),
        eventChainHead: eventsBeforeDiff.at(-1)?.eventHash ?? HASH,
      },
    };
    await service.issueReasoningDiff("session-1", reasoningDiff, proofBundle);

    const completed = await service.getSession("session-1");
    expect(completed.state).toBe("REASONING_DIFF_ISSUED");
    expect(completed.patchResult).toEqual(patchResult);
    expect(completed.reasoningDiff).toEqual(reasoningDiff);
    expect(completed.proofBundle).toEqual(proofBundle);
    repository.close();
  });

  it("issues a native v5 Reasoning Diff and content-addressed Proof Capsule reference", async () => {
    const { service, repository } = memoryService();
    await throughVerifiedLab(service);
    await service.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
      resultAuthority: {
        schemaVersion: "5",
        jobId: "job-v5-run-1",
        inputBundleHash: "f".repeat(64),
        resultHash: hostedResultSet.resultHash,
        resultFileHash: "0".repeat(64),
        technicalReportHash: supportsVerdict.technicalReportHash,
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
        evidenceVerdictHash: await hashCanonical(supportsVerdict),
      },
    });
    const boundary = await boundaryMapAuthority();
    await service.recordBoundaryMapAuthority("session-1", boundary);
    await service.recordRevision(
      "session-1",
      "Evaluation units must match deployment units.",
    );
    await service.startTransfer("session-1");
    await service.recordTransferResult("session-1", passingTransfer);
    await service.startPatchCompilation("session-1");
    const patchResult = {
      schemaVersion: "1",
      id: "patch-v5-1",
      sessionId: "session-1",
      status: "VERIFIED",
      sourceArtifactHash: artifactManifest.fileSha256,
      patchedArtifactHash: "3".repeat(64),
      patchHash: "4".repeat(64),
      modifiedCells: [3],
      diff: "- train_test_split\n+ GroupShuffleSplit",
      verification: {
        passed: true,
        invariants: ["zero_group_overlap", "unrelated_cells_unchanged"],
        unchangedCellHashes: ["5".repeat(64)],
      },
      generatedAt: "2026-07-16T10:00:00.000Z",
      resultHash: "6".repeat(64),
    } as const;
    await service.verifyPatch("session-1", patchResult, {
      schemaVersion: "5",
      jobId: "job-v5-patch-1",
      inputBundleHash: "f".repeat(64),
      patchPlanHash: "7".repeat(64),
      patchPlanFileHash: "8".repeat(64),
      rationaleFileHash: "9".repeat(64),
      patchPlanVerificationHash: "a".repeat(64),
      patchResultHash: patchResult.resultHash,
      patchResultFileHash: "b".repeat(64),
      patchedArtifactHash: patchResult.patchedArtifactHash,
    });
    const eventsBeforeDiff = await service.listEvents("session-1");
    const reasoningDiff = {
      schemaVersion: "2",
      id: "reasoning-v5-1",
      sessionId: "session-1",
      concept: "entity_leakage",
      dimensions: {
        belief: {
          before: beliefTest.learnerClaim,
          after: "Evaluation units must match deployment units.",
        },
        prediction: {
          before: "Accuracy remains above 0.9 at 80% confidence.",
          after: "Whole-customer holdout produced the verified result.",
        },
        evidence: {
          before: "Random rows repeated customers across partitions.",
          after: "Whole-customer holdout has zero entity overlap.",
        },
        boundary: {
          before: "The claim had no stated recurrence boundary.",
          after: "The signed sweep exposes where optimism changes.",
        },
        behavior: {
          before: "Used a random forecasting split.",
          after: "Selected time-aware evaluation without future leakage.",
        },
        code: {
          before: "train_test_split(rows)",
          after: "group-aware split; identity excluded",
        },
      },
      authority: {
        artifactManifestHash: hostedResultSet.artifactManifestHash,
        beliefSpecHash: (
          await scientificLineage(
            (await service.getSession("session-1")).beliefSpec,
          )
        ).beliefSpecHash,
        predictionHash: prediction.immutableHash,
        experimentIrHash: supportsVerdict.irHash,
        selectionHash: "e".repeat(64),
        authoritativeResultHash: hostedResultSet.resultHash,
        evidenceVerdictHash: await hashCanonical(supportsVerdict),
        epistemicReportHash: EPISTEMIC_REPORT_HASH,
        boundaryMapHash: boundary.resultHash,
        boundaryReceiptHash: boundary.receipt.receiptHash,
        transferResultHash: passingTransfer.resultHash,
        patchPlanHash: "7".repeat(64),
        patchResultHash: patchResult.resultHash,
        patchedArtifactHash: patchResult.patchedArtifactHash,
      },
      evidenceEventHashes: eventsBeforeDiff.map((event) => event.eventHash),
      limitations: ["This verifies one bounded experiment, not mastery."],
      issuedAt: "2026-07-16T10:00:01.000Z",
    } as const;

    await expect(
      service.issueReasoningDiffV2("session-1", {
        ...reasoningDiff,
        authority: {
          ...reasoningDiff.authority,
          patchPlanHash: "0".repeat(64),
        },
      }),
    ).rejects.toThrow(/patchPlanHash/i);
    expect((await service.getSession("session-1")).state).toBe(
      "PATCH_VERIFIED",
    );

    const diffIssued = await service.issueReasoningDiffV2(
      "session-1",
      reasoningDiff,
    );
    expect(diffIssued).toMatchObject({
      state: "REASONING_DIFF_ISSUED",
      reasoningDiffV2: reasoningDiff,
    });
    expect(diffIssued.reasoningDiff).toBeUndefined();
    expect(diffIssued.proofBundle).toBeUndefined();

    const eventsBeforeCapsule = await service.listEvents("session-1");
    const rootHash = "8".repeat(64);
    const capsuleRef = {
      schemaVersion: "2",
      capsuleId: "capsule-session-1",
      sessionId: "session-1",
      mode: "live_notebook",
      replayId: null,
      objectKey: `proof-capsules/session-1/${"9".repeat(64)}.counterlab`,
      mediaType: "application/vnd.counterlab.capsule+json",
      canonicalProfile: "counterlab-canonical-json-v1",
      rootHash,
      bytesHash: "9".repeat(64),
      byteLength: 4096,
      reasoningDiffHash: await hashCanonical(reasoningDiff),
      eventChainHead: eventsBeforeCapsule.at(-1)?.eventHash,
      createdAt: "2026-07-16T10:00:02.000Z",
      integrity: {
        mode: "hmac-signed",
        algorithm: "hmac-sha256",
        keyId: "counterlab-capsule-v2",
        signature: "a".repeat(64),
      },
    } as const;
    await expect(
      service.issueProofCapsuleV2("session-1", {
        ...capsuleRef,
        eventChainHead: "0".repeat(64),
      }),
    ).rejects.toThrow(/event-chain head/i);
    const completed = await service.issueProofCapsuleV2(
      "session-1",
      capsuleRef,
    );

    expect(completed).toMatchObject({
      state: "PROOF_CAPSULE_ISSUED",
      proofCapsule: capsuleRef,
    });
    expect((await service.listEvents("session-1")).at(-1)).toMatchObject({
      actor: "system",
      kind: "proof_capsule.issued",
      payload: {
        capsuleId: capsuleRef.capsuleId,
        rootHash: capsuleRef.rootHash,
      },
    });
    expect(verifyEvidenceChain(await service.listEvents("session-1"))).toEqual(
      expect.objectContaining({ valid: true }),
    );
    repository.close();
  });
});

describe("SqliteSessionRepository", () => {
  it("persists the aggregate across repository restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "counterlab-session-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "counterlab.sqlite");
    const ids = new DeterministicIds();
    const firstRepository = new SqliteSessionRepository(databasePath);
    const firstService = new SessionService(firstRepository, {
      id: ids.id,
      now: ids.now,
    });
    await throughExperiment(firstService);
    firstRepository.close();

    const secondRepository = new SqliteSessionRepository(databasePath);
    const secondService = new SessionService(secondRepository, {
      id: ids.id,
      now: ids.now,
    });
    const restored = await secondService.getSession("session-1");

    expect(restored.state).toBe("EXPERIMENT_COMPLETED");
    expect(restored.prediction).toEqual(prediction);
    expect(restored.verifiedResult).toEqual(resultSet);
    secondRepository.close();
  });

  it("persists epistemic result authority across repository restarts", async () => {
    const directory = mkdtempSync(join(tmpdir(), "counterlab-epistemic-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "counterlab.sqlite");
    const ids = new DeterministicIds();
    const firstRepository = new SqliteSessionRepository(databasePath);
    const firstService = new SessionService(firstRepository, {
      id: ids.id,
      now: ids.now,
    });
    await throughVerifiedLab(firstService);
    await firstService.recordEpistemicResult("session-1", {
      result: hostedResultSet,
      verdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    firstRepository.close();

    const secondRepository = new SqliteSessionRepository(databasePath);
    const restored = await new SessionService(secondRepository, {
      id: ids.id,
      now: ids.now,
    }).getSession("session-1");

    expect(restored).toMatchObject({
      state: "EXPERIMENT_COMPLETED",
      verifiedResult: hostedResultSet,
      evidenceVerdict: supportsVerdict,
      epistemicReportHash: EPISTEMIC_REPORT_HASH,
    });
    secondRepository.close();
  });

  it("stores append-only, ordered, hash-chained evidence events", async () => {
    const { service, repository } = memoryService();
    await service.createSession({
      id: "session-1",
      artifactId: "artifact-1",
      mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    });
    await service.proposeBeliefTest("session-1", beliefTest);
    await service.editBeliefTest("session-1", {
      ...beliefTest,
      learnerClaim: "Edited claim",
    });
    await service.confirmBeliefTest("session-1");

    const events = await service.listEvents("session-1");
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(events.map((event) => event.kind)).toEqual([
      "session.created",
      "belief_test.proposed",
      "belief_test.edited",
      "belief_test.confirmed",
    ]);
    expect(events[0]?.previousEventHash).toBeUndefined();
    expect(events[1]?.previousEventHash).toBe(events[0]?.eventHash);
    expect(events[2]?.previousEventHash).toBe(events[1]?.eventHash);
    expect(events[3]?.previousEventHash).toBe(events[2]?.eventHash);
    expect(new Set(events.map((event) => event.eventHash)).size).toBe(4);
    expect(verifyEvidenceChain(events).headHash).toBe(events[3]?.eventHash);
    repository.close();
  });
});
