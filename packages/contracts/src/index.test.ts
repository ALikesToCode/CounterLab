import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  ExperimentPlanSchema,
  SessionStateSchema,
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
          metricCandidates: [{ name: "accuracy", value: 0.991, outputIndex: 0 }],
        },
      ],
      schemaSummary: {
        fields: [
          { name: "customer_id", inferredType: "categorical", privacyClass: "entity_identifier" },
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
        schemaSummary: { fields: [], entityCandidates: [], targetCandidates: [] },
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

    expect(() => ArtifactManifestSchema.parse({ ...base, unexpected: true })).toThrow();
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
      ArtifactManifestSchema.parse({ ...base, support: { status: "PARTIAL", reasons: [] } }),
    ).toThrow();
  });
});

describe("ExperimentPlanSchema", () => {
  it("requires observably different hypothesis outcomes", () => {
    const base = {
      schemaVersion: "1",
      concept: "entity_leakage",
      datasetAdapter: "customer_churn_v1",
      competingHypotheses: ["row split generalizes", "identity leakage inflates the result"],
      expectedDiscrimination: [
        {
          runId: "group_split",
          expectedUnderCurrent: "accuracy remains high",
          expectedUnderCompeting: "accuracy falls materially",
        },
      ],
      runs: [
        { id: "group_split", split: "group", groupBy: "customer_id", model: "logistic_regression", seed: 1729 },
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
        runs: [{ id: "group_split", split: "group", model: "logistic_regression", seed: 1729 }],
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
    expect(assertTransition("INGESTED", "BELIEF_TEST_PROPOSED")).toBe("BELIEF_TEST_PROPOSED");
    expect(() => assertTransition("INGESTED", "LAB_VERIFIED")).toThrow(/invalid transition/i);
    expect(SessionStateSchema.parse("TRANSFER_PASSED")).toBe("TRANSFER_PASSED");
  });

  it("supports verifier and learner retry branches without skipping gates", () => {
    expect(assertTransition("LAB_REJECTED", "LAB_COMPILING")).toBe("LAB_COMPILING");
    expect(assertTransition("TRANSFER_FAILED", "TRANSFER_IN_PROGRESS")).toBe(
      "TRANSFER_IN_PROGRESS",
    );
    expect(assertTransition("PATCH_REJECTED", "PATCH_COMPILING")).toBe("PATCH_COMPILING");
    expect(() => assertTransition("TRANSFER_FAILED", "PATCH_COMPILING")).toThrow(
      /invalid transition/i,
    );
  });
});
