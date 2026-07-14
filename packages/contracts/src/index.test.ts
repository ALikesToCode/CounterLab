import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  ApiErrorSchema,
  ArtifactManifestSchema,
  BeliefTestSchema,
  EvidenceEventSchema,
  ExperimentPlanSchema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  ReasoningDiffSchema,
  SessionStateSchema,
  TransferResultSchema,
  VerifiedResultSetSchema,
  apiResponseSchema,
  apiSuccessSchema,
  assertTransition,
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

describe("session transitions", () => {
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

    expect(result.runs[0]?.entityOverlap.count).toBe(0);
    expect(() =>
      VerifiedResultSetSchema.parse({
        ...result,
        runs: [{ ...result.runs[0], inventedMetric: true }],
      }),
    ).toThrow();
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
