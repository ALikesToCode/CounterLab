import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ApiErrorSchema,
  ArtifactManifestSchema,
  BeliefTestSchema,
  ConceptIdSchema,
  ConceptRoutingDecisionSchema,
  EvidenceEventSchema,
  ExperimentPlanSchema,
  ExperimentPlanV2Schema,
  HostedVerifiedResultSetV2Schema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  PatchResultSchema,
  PatchPlanV1Schema,
  PredictionContractSchema,
  ProofBundleSchema,
  ReasoningDiffSchema,
  SessionModeSchema,
  SessionStateSchema,
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerLabRunBundleSchema,
  RunnerJobSchema,
  RunnerJobTokenClaimsSchema,
  TransferResultSchema,
  VerifiedResultSetSchema,
  apiResponseSchema,
  apiSuccessSchema,
  assertTransition,
  assertRunnerJobTransition,
} from "./index.js";

describe("ArtifactManifestSchema", () => {
  it("accepts a supported manifest with exact evidence metadata", () => {
    const manifest = ArtifactManifestSchema.parse({
      artifactId: "artifact_abc",
      fileName: "customer-churn.ipynb",
      fileSha256: "a".repeat(64),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [
        {
          index: 3,
          type: "code",
          sourceSha256: "b".repeat(64),
          sourceExcerpt: "print(accuracy)",
          executionCount: 4,
          outputHashes: ["c".repeat(64)],
          symbols: ["accuracy"],
          metricCandidates: [
            { name: "accuracy", value: 0.991, outputIndex: 0 },
          ],
        },
      ],
      schemaSummary: {
        fields: [
          {
            name: "customer_id",
            inferredType: "categorical",
            privacyClass: "entity_identifier",
          },
        ],
        rowCount: 2400,
        entityCandidates: ["customer_id"],
        targetCandidates: ["churned"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-14T00:00:00.000Z",
    });

    expect(manifest.support.status).toBe("SUPPORTED");
  });

  it("rejects malformed hashes", () => {
    expect(() =>
      ArtifactManifestSchema.parse({
        artifactId: "artifact_abc",
        fileName: "x.ipynb",
        fileSha256: "not-a-hash",
        nbformat: 4,
        support: { status: "SUPPORTED", reasons: [] },
        cells: [],
        schemaSummary: {
          fields: [],
          entityCandidates: [],
          targetCandidates: [],
        },
        packageHints: [],
        createdAt: "2026-07-14T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects unknown fields and inconsistent support metadata", () => {
    const base = {
      artifactId: "artifact_abc",
      fileName: "x.ipynb",
      fileSha256: "a".repeat(64),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [],
      schemaSummary: { fields: [], entityCandidates: [], targetCandidates: [] },
      packageHints: [],
      createdAt: "2026-07-14T00:00:00.000Z",
    } as const;

    expect(() =>
      ArtifactManifestSchema.parse({ ...base, unexpected: true }),
    ).toThrow();
    expect(() =>
      ArtifactManifestSchema.parse({
        ...base,
        support: {
          status: "SUPPORTED",
          reasons: [{ code: "SHOULD_NOT_EXIST", message: "inconsistent" }],
        },
      }),
    ).toThrow();
    expect(() =>
      ArtifactManifestSchema.parse({
        ...base,
        support: { status: "PARTIAL", reasons: [] },
      }),
    ).toThrow();
  });
});

describe("ExperimentPlanSchema", () => {
  it("requires observably different hypothesis outcomes", () => {
    const base = {
      schemaVersion: "1",
      concept: "entity_leakage",
      datasetAdapter: "customer_churn_v1",
      competingHypotheses: [
        "row split generalizes",
        "identity leakage inflates the result",
      ],
      expectedDiscrimination: [
        {
          runId: "group_split",
          expectedUnderCurrent: "accuracy remains high",
          expectedUnderCompeting: "accuracy falls materially",
        },
      ],
      runs: [
        {
          id: "group_split",
          split: "group",
          groupBy: "customer_id",
          model: "logistic_regression",
          seed: 1729,
        },
      ],
      metrics: ["accuracy", "roc_auc"],
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

    expect(ExperimentPlanSchema.parse(base).runs[0]?.split).toBe("group");
    expect(() =>
      ExperimentPlanSchema.parse({
        ...base,
        expectedDiscrimination: [
          {
            runId: "group_split",
            expectedUnderCurrent: "same",
            expectedUnderCompeting: "same",
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      ExperimentPlanSchema.parse({
        ...base,
        runs: [
          {
            id: "group_split",
            split: "group",
            model: "logistic_regression",
            seed: 1729,
          },
        ],
      }),
    ).toThrow(/groupBy/i);

    expect(() =>
      ExperimentPlanSchema.parse({
        ...base,
        expectedDiscrimination: [
          {
            runId: "missing_run",
            expectedUnderCurrent: "accuracy remains high",
            expectedUnderCompeting: "accuracy falls materially",
          },
        ],
      }),
    ).toThrow(/run/i);
  });
});

describe("concept routing contracts", () => {
  it("accepts an evidence-linked class-imbalance selection", () => {
    const decision = ConceptRoutingDecisionSchema.parse({
      kind: "selected",
      concept: "class_imbalance",
      conceptPackVersion: "1.0.0",
      confidence: 0.92,
      evidence: [
        {
          cellIndex: 2,
          outputIndex: 0,
          kind: "metric",
          hash: "a".repeat(64),
          excerpt: "positive_rate: 0.03",
          relevance: "The positive class is rare in the displayed evidence.",
        },
      ],
      limitations: ["Displayed prevalence may not match deployment."],
    });

    expect(decision.kind).toBe("selected");
    if (decision.kind !== "selected") throw new Error("expected selection");
    expect(ConceptIdSchema.parse(decision.concept)).toBe("class_imbalance");
  });

  it("requires multiple candidates for a choice and reasons for unsupported evidence", () => {
    const candidate = {
      concept: "class_imbalance",
      conceptPackVersion: "1.0.0",
      confidence: 0.91,
      evidence: [],
    } as const;

    expect(() =>
      ConceptRoutingDecisionSchema.parse({
        kind: "choice_required",
        candidates: [candidate],
      }),
    ).toThrow();
    expect(() =>
      ConceptRoutingDecisionSchema.parse({
        kind: "unsupported_artifact",
        reasons: [],
      }),
    ).toThrow();
  });
});

describe("hosted runner contracts", () => {
  const evidenceRef = {
    cellIndex: 3,
    outputIndex: 0,
    kind: "metric" as const,
    hash: "b".repeat(64),
    excerpt: "Test accuracy: 0.9847",
    relevance: "This is the result interpreted by the learner.",
  };

  const plan = {
    schemaVersion: "2",
    planId: "plan_live_1",
    sessionId: "session_live_1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: "a".repeat(64),
    beliefTestId: "belief_live_1",
    evidenceRefs: [evidenceRef],
    baseline: {
      concept: "entity_leakage",
      runId: "random_rows",
      operation: "leakage.random_row_split",
      seed: 1729,
      testFraction: 0.25,
      entityField: "customer_id",
      dropIdentity: false,
      model: "logistic_regression",
    },
    interventions: [
      {
        concept: "entity_leakage",
        runId: "new_customers",
        operation: "leakage.group_holdout",
        seed: 1729,
        testFraction: 0.25,
        entityField: "customer_id",
        dropIdentity: false,
        model: "logistic_regression",
      },
    ],
    controlledVariables: ["fixture", "model", "seed"],
    changedVariables: ["split boundary", "identity feature"],
    metrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
    visualizations: ["metric_comparison", "entity_overlap"],
    discriminatesBecause:
      "Only the shortcut hypothesis predicts a material drop for new customers.",
    expectedPatterns: [
      {
        hypothesisId: "current",
        qualitativeOutcome: "Accuracy remains close to the row split.",
      },
      {
        hypothesisId: "competing",
        qualitativeOutcome: "Accuracy falls when customer overlap is zero.",
      },
    ],
    nonClaims: ["This result does not prove performance on every population."],
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
  } as const;

  it("accepts fixed-operation plan v2 and rejects executable or cross-concept fields", () => {
    expect(ExperimentPlanV2Schema.parse(plan).schemaVersion).toBe("2");
    expect(() =>
      ExperimentPlanV2Schema.parse({ ...plan, shell: "python adapter.py" }),
    ).toThrow();
    expect(() =>
      ExperimentPlanV2Schema.parse({
        ...plan,
        interventions: [
          {
            concept: "class_imbalance",
            runId: "threshold",
            operation: "imbalance.threshold_sweep",
            seed: 1729,
            threshold: 0.5,
            prevalenceScenario: "observed",
            model: "logistic_regression",
          },
        ],
      }),
    ).toThrow(/concept/i);
    expect(() =>
      ExperimentPlanV2Schema.parse({ ...plan, literalResults: [0.98, 0.59] }),
    ).toThrow();
  });

  it("validates optimistic runner jobs and terminal transitions", () => {
    const job = RunnerJobSchema.parse({
      schemaVersion: "1",
      jobId: "job_live_1",
      kind: "LAB_COMPILE",
      status: "QUEUED",
      sessionId: "session_live_1",
      artifactId: "artifact_live_1",
      artifactManifestHash: "a".repeat(64),
      conceptPack: { id: "entity_leakage", version: "2.0.0" },
      inputHashes: ["b".repeat(64)],
      stateVersion: 4,
      jobVersion: 1,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
      attempt: 0,
      maxAttempts: 3,
      runnerIdentity: null,
      timeoutSeconds: 90,
      outputHashes: [],
      eventCursor: 0,
    });
    expect(job.status).toBe("QUEUED");
    expect(assertRunnerJobTransition("QUEUED", "STARTING")).toBe("STARTING");
    expect(assertRunnerJobTransition("RUNNING", "REPAIRING")).toBe("REPAIRING");
    expect(() => assertRunnerJobTransition("VERIFIED", "RUNNING")).toThrow(
      /terminal/i,
    );
  });

  it("keeps browser events allow-listed and runner callbacks hash-bound", () => {
    const event = PublicCompilerEventSchema.parse({
      schemaVersion: "1",
      eventId: "public_event_1",
      jobId: "job_live_1",
      cursor: 1,
      kind: "verifier.rejected",
      invariant: "zero_group_overlap",
      observed: 12,
      expected: 0,
      counterexample: "customer_004 appears in train and test",
      at: "2026-07-15T00:00:01.000Z",
    });
    expect(event.kind).toBe("verifier.rejected");
    expect(() =>
      PublicCompilerEventSchema.parse({ ...event, environment: { KEY: "x" } }),
    ).toThrow();

    expect(
      RunnerCallbackSchema.parse({
        schemaVersion: "1",
        callbackId: "callback_1",
        idempotencyKey: "job_live_1:verified:1",
        jobId: "job_live_1",
        stateVersion: 4,
        status: "VERIFIED",
        outputHashes: ["c".repeat(64)],
        finalEventCursor: 8,
        occurredAt: "2026-07-15T00:00:08.000Z",
      }).status,
    ).toBe("VERIFIED");
  });

  it("binds a short-lived token to one job, bundle, output prefix, and callback", () => {
    const claims = RunnerJobTokenClaimsSchema.parse({
      schemaVersion: "1",
      audience: "counterlab-runner",
      tokenId: "token_job_live_1",
      jobId: "job_live_1",
      sessionId: "session_live_1",
      artifactManifestHash: "a".repeat(64),
      inputBundleKey: "runner-input/job_live_1.json",
      outputPrefix: "runner-output/job_live_1/",
      callbackPath: "/api/runner/jobs/job_live_1/callback",
      stateVersion: 4,
      issuedAt: 1_784_070_000,
      expiresAt: 1_784_070_300,
    });
    expect(claims.expiresAt - claims.issuedAt).toBe(300);
    expect(() =>
      RunnerJobTokenClaimsSchema.parse({
        ...claims,
        expiresAt: claims.issuedAt + 3601,
      }),
    ).toThrow(/expiration/i);
  });

  it("accepts only artifact-bound fixed-kernel LAB_RUN bundles", () => {
    const artifact = ArtifactManifestSchema.parse({
      artifactId: "artifact_live_1",
      fileName: "uploaded.ipynb",
      fileSha256: "f".repeat(64),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [],
      schemaSummary: {
        fields: [],
        rowCount: 2880,
        entityCandidates: ["customer_id"],
        targetCandidates: ["churned"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    const runBundle = RunnerLabRunBundleSchema.parse({
      schemaVersion: "1",
      kind: "LAB_RUN",
      purpose: "AUTHORITATIVE",
      jobId: "job_run_1",
      sessionId: plan.sessionId,
      stateVersion: 6,
      artifactManifestHash: plan.artifactManifestHash,
      artifactManifest: artifact,
      learnerClaim: "The high score proves generalization.",
      experimentPlan: plan,
      experimentPlanHash: "9".repeat(64),
      fixture: { id: "public-leakage-v1" },
      permittedOutputs: ["verified-result.json"],
    });

    expect(runBundle.kind).toBe("LAB_RUN");
    expect(runBundle.purpose).toBe("AUTHORITATIVE");
    expect(() =>
      RunnerLabRunBundleSchema.parse({
        ...runBundle,
        sessionId: "session_crossed",
      }),
    ).toThrow(/lineage/i);
  });

  it("bounds interactive leakage controls before a runner job is created", () => {
    expect(
      InteractiveLeakageRunRequestSchema.parse({
        schemaVersion: "1",
        splitStrategy: "group",
        entityField: "account_key",
        identityAblation: true,
        testFraction: 0.25,
      }),
    ).toMatchObject({ splitStrategy: "group", testFraction: 0.25 });
    expect(() =>
      InteractiveLeakageRunRequestSchema.parse({
        schemaVersion: "1",
        splitStrategy: "random",
        entityField: "account_key",
        identityAblation: false,
        testFraction: 0.9,
      }),
    ).toThrow();
  });

  it("bounds interactive class-imbalance controls before a runner job is created", () => {
    expect(
      InteractiveImbalanceRunRequestSchema.parse({
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.25,
        prevalenceScenario: "more_common",
        metricFocus: "recall",
      }),
    ).toMatchObject({
      threshold: 0.25,
      prevalenceScenario: "more_common",
      metricFocus: "recall",
    });
    expect(() =>
      InteractiveImbalanceRunRequestSchema.parse({
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.5,
        prevalenceScenario: "rarer",
        metricFocus: "accuracy",
      }),
    ).toThrow();
  });

  it("accepts a source-free hosted patch plan and rejects executable fields", () => {
    const patchPlan = PatchPlanV1Schema.parse({
      schemaVersion: "1",
      planId: "patch_plan_1",
      sessionId: plan.sessionId,
      concept: "entity_leakage",
      conceptPackVersion: "2.0.0",
      artifactManifestHash: plan.artifactManifestHash,
      sourceArtifactHash: "f".repeat(64),
      transferResultHash: "e".repeat(64),
      verifiedResultHash: "d".repeat(64),
      evidenceRefs: plan.evidenceRefs,
      targetCells: [3],
      entityField: "customer_id",
      targetField: "churned",
      operations: [
        {
          id: "replace_row_split_with_group_holdout",
          cellIndex: 3,
          reason: "Deployment requires performance on unseen customers.",
        },
        {
          id: "exclude_entity_feature",
          cellIndex: 3,
          reason: "Customer identity is not a transferable feature.",
        },
      ],
      preserveUnrelatedCells: true,
      nonClaims: ["This patch does not prove production performance."],
    });

    expect(patchPlan.operations).toHaveLength(2);
    expect(() =>
      PatchPlanV1Schema.parse({
        ...patchPlan,
        source: "open('notebook.ipynb')",
      }),
    ).toThrow();
  });

  it("accepts only the three registered source-free imbalance patch operations", () => {
    const imbalancePatch = {
      schemaVersion: "1",
      planId: "patch_plan_imbalance_1",
      sessionId: plan.sessionId,
      concept: "class_imbalance",
      conceptPackVersion: "1.0.0",
      artifactManifestHash: plan.artifactManifestHash,
      sourceArtifactHash: "f".repeat(64),
      transferResultHash: "e".repeat(64),
      verifiedResultHash: "d".repeat(64),
      evidenceRefs: plan.evidenceRefs,
      targetCells: [3],
      targetField: "fraud",
      operations: [
        {
          id: "stratify_classification_holdout",
          cellIndex: 3,
          reason: "Preserve the rare-class rate across train and test.",
        },
        {
          id: "add_majority_baseline",
          cellIndex: 3,
          reason: "Measure whether accuracy beats the trivial classifier.",
        },
        {
          id: "replace_accuracy_only_evaluation",
          cellIndex: 3,
          reason:
            "Report confusion counts and minority metrics at a documented threshold.",
        },
      ],
      preserveUnrelatedCells: true,
      nonClaims: ["This patch does not choose a production threshold."],
    };

    expect(PatchPlanV1Schema.parse(imbalancePatch)).toMatchObject({
      concept: "class_imbalance",
      targetField: "fraud",
      operations: expect.arrayContaining([
        expect.objectContaining({ id: "add_majority_baseline" }),
      ]),
    });
    expect(() =>
      PatchPlanV1Schema.parse({
        ...imbalancePatch,
        operations: imbalancePatch.operations.slice(0, 2),
      }),
    ).toThrow();
  });
});

describe("session transitions", () => {
  it("keeps sample, live notebook, and verified replay modes structurally separate", () => {
    expect(
      SessionModeSchema.parse({
        kind: "sample_lesson",
        sampleId: "leakage-01",
      }),
    ).toEqual({ kind: "sample_lesson", sampleId: "leakage-01" });
    expect(SessionModeSchema.parse({ kind: "live_notebook" })).toEqual({
      kind: "live_notebook",
    });
    expect(
      SessionModeSchema.parse({
        kind: "verified_replay",
        replayId: "leakage-01",
      }),
    ).toEqual({ kind: "verified_replay", replayId: "leakage-01" });

    expect(() =>
      SessionModeSchema.parse({
        kind: "sample_lesson",
        sampleId: "leakage-01",
        replayId: "leakage-01",
      }),
    ).toThrow();
    expect(() =>
      SessionModeSchema.parse({
        kind: "live_notebook",
        sampleId: "leakage-01",
      }),
    ).toThrow();
    expect(() =>
      SessionModeSchema.parse({ kind: "verified_replay" }),
    ).toThrow();
  });

  it("allows only canonical next states", () => {
    expect(assertTransition("INGESTED", "BELIEF_TEST_PROPOSED")).toBe(
      "BELIEF_TEST_PROPOSED",
    );
    expect(() => assertTransition("INGESTED", "LAB_VERIFIED")).toThrow(
      /invalid transition/i,
    );
    expect(SessionStateSchema.parse("TRANSFER_PASSED")).toBe("TRANSFER_PASSED");
  });

  it("supports verifier and learner retry branches without skipping gates", () => {
    expect(assertTransition("LAB_REJECTED", "LAB_COMPILING")).toBe(
      "LAB_COMPILING",
    );
    expect(assertTransition("TRANSFER_FAILED", "TRANSFER_IN_PROGRESS")).toBe(
      "TRANSFER_IN_PROGRESS",
    );
    expect(assertTransition("PATCH_REJECTED", "PATCH_COMPILING")).toBe(
      "PATCH_COMPILING",
    );
    expect(() =>
      assertTransition("TRANSFER_FAILED", "PATCH_COMPILING"),
    ).toThrow(/invalid transition/i);
  });
});

const hash = (character: string) => character.repeat(64);

describe("learning-loop contracts", () => {
  it("accepts the exact Belief Test shape and attaches schema version 1", () => {
    const beliefTest = BeliefTestSchema.parse({
      id: "belief_1",
      concept: "entity_leakage",
      learnerClaim:
        "The 99% result proves this model generalizes to new customers.",
      currentHypothesis: {
        statement: "Random rows measure new-customer performance.",
        predictedOutcome: "Accuracy stays near the notebook result.",
      },
      competingHypothesis: {
        statement: "Customer identity leaks across the row split.",
        predictedOutcome:
          "A customer-group split causes a material accuracy drop.",
      },
      evidenceRefs: [
        {
          cellIndex: 3,
          outputIndex: 0,
          kind: "metric",
          hash: hash("a"),
          excerpt: "Test accuracy: 0.9847",
          relevance: "This is the result the learner interpreted.",
        },
      ],
      alternatives: [
        {
          label: "Distribution shift",
          rationale: "The test period may differ from training.",
        },
      ],
      decisiveIntervention: {
        id: "group-split",
        description: "Hold customers out as groups.",
        controlledVariables: ["fixture", "model", "seed"],
        changedVariables: ["split strategy"],
        discriminatesBecause:
          "Only the leakage hypothesis predicts a large drop.",
      },
      uncertainty: {
        confidence: 0.86,
        limitations: ["Synthetic fixture"],
        insufficientEvidence: false,
      },
      requiresLearnerConfirmation: true,
    });

    expect(beliefTest.schemaVersion).toBe("1");
    expect(() =>
      BeliefTestSchema.parse({ ...beliefTest, unexpected: true }),
    ).toThrow();
    const unresolvedMetric = {
      kind: "metric" as const,
      hash: hash("a"),
      excerpt: "Test accuracy: 0.9847",
      relevance: "Missing its exact output location.",
    };
    expect(() =>
      BeliefTestSchema.parse({
        ...beliefTest,
        evidenceRefs: [unresolvedMetric],
      }),
    ).toThrow(/cellIndex|outputIndex/i);
  });

  it("validates immutable prediction metadata and ordered numeric ranges", () => {
    const prediction = PredictionContractSchema.parse({
      id: "prediction_1",
      sessionId: "session_1",
      beliefTestId: "belief_1",
      choice: "Accuracy stays above 90%",
      numericRange: { min: 0.9, max: 1 },
      confidence: 78,
      committedAt: "2026-07-14T10:00:00.000Z",
      immutableHash: hash("b"),
    });

    expect(prediction.schemaVersion).toBe("1");
    expect(() =>
      PredictionContractSchema.parse({
        ...prediction,
        numericRange: { min: 1, max: 0.9 },
      }),
    ).toThrow(/range/i);
  });

  it("validates canonical kernel output without loosening nested fields", () => {
    const result = VerifiedResultSetSchema.parse({
      schemaVersion: "1",
      concept: "entity_leakage",
      fixture: {
        customers: 480,
        rows: 2880,
        sha256: hash("c"),
        targetRate: 0.49,
      },
      kernelVersion: "0.1.0",
      seed: 1729,
      runs: [
        {
          id: "customer_group_split",
          splitStrategy: "group",
          groupBy: "customer_id",
          dropFeatures: [],
          model: "logistic_regression",
          seed: 1729,
          inputFingerprint: hash("c"),
          featureSetFingerprint: hash("d"),
          metrics: { accuracy: 0.59, rocAuc: 0.64 },
          sampleSizes: { train: 2160, test: 720 },
          entityCounts: { train: 360, test: 120 },
          entityOverlap: { count: 0, rate: 0 },
        },
      ],
      chartData: [
        {
          runId: "customer_group_split",
          splitStrategy: "group",
          accuracy: 0.59,
          rocAuc: 0.64,
          sampleSize: 720,
          seed: 1729,
        },
      ],
      resultHash: hash("e"),
    });

    if (result.concept !== "entity_leakage") {
      throw new Error("expected an entity-leakage result");
    }
    expect(result.runs[0]?.entityOverlap.count).toBe(0);
    expect(() =>
      VerifiedResultSetSchema.parse({
        ...result,
        runs: [{ ...result.runs[0], inventedMetric: true }],
      }),
    ).toThrow();
  });

  it("binds hosted kernel output to its verified plan and artifact", () => {
    const hosted = HostedVerifiedResultSetV2Schema.parse({
      schemaVersion: "2",
      concept: "entity_leakage",
      planId: "plan_live_1",
      sessionId: "session_live_1",
      artifactManifestHash: hash("a"),
      conceptPackVersion: "2.0.0",
      kernelVersion: "0.1.0",
      seed: 1729,
      fixture: {
        customers: 480,
        rows: 2880,
        sha256: hash("c"),
        targetRate: 0.49,
      },
      runs: [
        {
          id: "new_customers",
          operation: "leakage.group_holdout",
          splitStrategy: "group",
          groupBy: "account_id",
          dropFeatures: [],
          model: "logistic_regression",
          seed: 1729,
          inputFingerprint: hash("c"),
          featureSetFingerprint: hash("d"),
          metrics: { accuracy: 0.59, rocAuc: 0.64 },
          sampleSizes: { train: 2160, test: 720 },
          entityCounts: { train: 360, test: 120 },
          entityOverlap: { count: 0, rate: 0 },
        },
      ],
      chartData: [
        {
          runId: "new_customers",
          splitStrategy: "group",
          accuracy: 0.59,
          rocAuc: 0.64,
          sampleSize: 720,
          seed: 1729,
        },
      ],
      resultHash: hash("e"),
    });

    expect(hosted.artifactManifestHash).toBe(hash("a"));
    expect(VerifiedResultSetSchema.parse(hosted).schemaVersion).toBe("2");
  });

  it("validates a hosted class-imbalance result without leakage-only fields", () => {
    const hosted = HostedVerifiedResultSetV2Schema.parse({
      schemaVersion: "2",
      concept: "class_imbalance",
      planId: "plan_imbalance_1",
      sessionId: "session_imbalance_1",
      artifactManifestHash: hash("a"),
      conceptPackVersion: "1.0.0",
      kernelVersion: "0.1.0",
      seed: 2603,
      fixture: {
        sha256: hash("b"),
        rows: 6000,
        positives: 214,
        prevalence: 0.035666666667,
      },
      runs: [
        {
          id: "majority_baseline",
          operation: "imbalance.majority_baseline",
          model: "majority_baseline",
          seed: 2603,
          threshold: 0.5,
          prevalenceScenario: "observed",
          metrics: {
            accuracy: 0.964,
            precision: 0,
            recall: 0,
            f1: 0,
            prAuc: 0.036,
            rocAuc: 0.5,
          },
          confusionMatrix: { tn: 1446, fp: 0, fn: 54, tp: 0 },
          sampleSizes: { train: 4500, test: 1500 },
          classCounts: {
            train: { negative: 4339, positive: 161 },
            test: { negative: 1446, positive: 54 },
          },
          prevalence: 0.036,
          predictedPositiveRate: 0,
          featureSetFingerprint: hash("c"),
          inputFingerprint: hash("b"),
        },
      ],
      chartData: [
        {
          runId: "majority_baseline",
          operation: "imbalance.majority_baseline",
          accuracy: 0.964,
          precision: 0,
          recall: 0,
          f1: 0,
          prAuc: 0.036,
          rocAuc: 0.5,
          prevalence: 0.036,
          predictedPositiveRate: 0,
          sampleSize: 1500,
          threshold: 0.5,
          prevalenceScenario: "observed",
          seed: 2603,
        },
      ],
      resultHash: hash("d"),
    });

    expect(hosted.concept).toBe("class_imbalance");
    if (hosted.concept === "class_imbalance") {
      expect(hosted.runs[0]?.confusionMatrix.fn).toBe(54);
    }
  });

  it("requires explicit schema versions for transfer, patch, reasoning diff, and events", () => {
    const transfer = TransferResultSchema.parse({
      schemaVersion: "1",
      id: "transfer_1",
      sessionId: "session_1",
      taskId: "forecast-future-leakage-v1",
      outcome: "PASSED",
      selectedStrategy: "time_ordered_holdout",
      identifiedRisks: ["future_feature"],
      evidenceChoices: ["feature created after prediction time"],
      checks: [
        {
          invariant: "time_ordered_split",
          passed: true,
          evidence: "train < test",
        },
      ],
      evaluatorVersion: "1.0.0",
      evaluatedAt: "2026-07-14T10:05:00.000Z",
      resultHash: hash("f"),
    });
    const patch = PatchResultSchema.parse({
      schemaVersion: "1",
      id: "patch_1",
      sessionId: "session_1",
      status: "VERIFIED",
      sourceArtifactHash: hash("1"),
      patchedArtifactHash: hash("2"),
      patchHash: hash("3"),
      modifiedCells: [3],
      diff: "@@ cell 3 @@",
      verification: {
        passed: true,
        invariants: ["zero_group_overlap", "unrelated_cells_unchanged"],
        unchangedCellHashes: [hash("4")],
      },
      generatedAt: "2026-07-14T10:06:00.000Z",
      resultHash: hash("5"),
    });
    const reasoningDiff = ReasoningDiffSchema.parse({
      schemaVersion: "1",
      id: "diff_1",
      sessionId: "session_1",
      dimensions: {
        belief: {
          before: "Rows generalize",
          after: "Entities must be held out",
        },
        prediction: {
          before: "Accuracy remains high",
          after: "Accuracy fell materially",
        },
        code: {
          before: "Random row split",
          after: "Group split without identity",
        },
        transfer: {
          before: "Random forecasting split",
          after: "Time-ordered holdout",
        },
      },
      evidenceEventHashes: [hash("6")],
      issuedAt: "2026-07-14T10:07:00.000Z",
    });
    const event = EvidenceEventSchema.parse({
      schemaVersion: "1",
      eventId: "event_1",
      sessionId: "session_1",
      sequence: 1,
      timestamp: "2026-07-14T10:00:00.000Z",
      actor: "learner",
      kind: "claim.recorded",
      inputHashes: [],
      outputHashes: [hash("6")],
      payload: { claim: "Rows generalize" },
      eventHash: hash("7"),
    });

    expect([
      transfer.schemaVersion,
      patch.schemaVersion,
      reasoningDiff.schemaVersion,
      event.schemaVersion,
    ]).toEqual(["1", "1", "1", "1"]);
    expect(() =>
      PatchResultSchema.parse({
        ...patch,
        status: "VERIFIED",
        verification: { ...patch.verification, passed: false },
      }),
    ).toThrow();
  });

  it("accepts a standard 40-character Git commit identifier in evidence provenance", () => {
    const event = EvidenceEventSchema.parse({
      schemaVersion: "1",
      eventId: "event_git",
      sessionId: "session_1",
      sequence: 1,
      timestamp: "2026-07-14T10:00:00.000Z",
      actor: "codex",
      kind: "lab.generated",
      inputHashes: [],
      outputHashes: [],
      payload: {},
      commitHash: "a".repeat(40),
      eventHash: hash("b"),
    });

    expect(event.commitHash).toHaveLength(40);
  });
});

describe("typed API envelopes", () => {
  it("accepts strict success and error responses and rejects mixed envelopes", () => {
    const Success = apiSuccessSchema(
      z.object({ sessionId: z.string() }).strict(),
    );
    const Response = apiResponseSchema(
      z.object({ sessionId: z.string() }).strict(),
    );

    expect(
      Success.parse({ ok: true, data: { sessionId: "session_1" } }).ok,
    ).toBe(true);
    expect(
      ApiErrorSchema.parse({
        ok: false,
        error: {
          code: "INVALID_TRANSITION",
          message: "Prediction required",
          retryable: false,
        },
      }).error.code,
    ).toBe("INVALID_TRANSITION");
    expect(() =>
      Response.parse({
        ok: true,
        data: { sessionId: "session_1" },
        error: { code: "NOPE", message: "mixed", retryable: false },
      }),
    ).toThrow();
  });
});

describe("ProofBundleSchema", () => {
  it("rejects a signed label without a signature", () => {
    const invalid = {
      schemaVersion: "1",
      bundleId: "bundle_1",
      sessionId: "session_1",
      replayId: "leakage-01",
      createdAt: "2026-07-14T10:10:00.000Z",
      events: [],
      integrity: {
        mode: "hmac-signed",
        algorithm: "hmac-sha256",
        contentHash: hash("a"),
        eventChainHead: hash("b"),
      },
    };

    expect(() => ProofBundleSchema.parse(invalid)).toThrow(/signature/i);
  });
});
