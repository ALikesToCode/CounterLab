import { describe, expect, it } from "vitest";

import {
  RunnerLabCompileBundleV5Schema,
  VersionedRunnerJobInputBundleSchema,
} from "../src/index.js";

const digest = (character: string) => character.repeat(64);

function runnerBundleV5() {
  const evidence = {
    cellIndex: 2,
    kind: "code" as const,
    hash: digest("c"),
    excerpt: "train_test_split(X, y)",
    relevance: "This cell defines the current evaluation boundary.",
  };
  return {
    schemaVersion: "5" as const,
    kind: "LAB_COMPILE" as const,
    jobId: "runner_job_scientific_1",
    sessionId: "session-live-1",
    stateVersion: 7,
    artifactManifestHash: digest("a"),
    approvedBeliefSpec: {
      schemaVersion: "2" as const,
      id: "belief-live-1",
      concept: "entity_leakage" as const,
      claim: "The random-row score proves performance for new customers.",
      evidenceRefs: [evidence],
      hypotheses: [
        {
          id: "current" as const,
          statement: "Behavioral signal generalizes to unseen customers.",
          conditions: ["The deployment unit is a customer."],
          nonClaims: ["This does not establish every deployment condition."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["group-holdout"],
        },
        {
          id: "competing" as const,
          statement: "Repeated customer identity inflates the row split.",
          conditions: ["Customers repeat across rows."],
          nonClaims: ["This does not prove the model has no useful signal."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["group-holdout"],
        },
      ],
      alternatives: [],
      uncertainty: 0.82,
      supportState: "SUPPORTED" as const,
      learnerDecision: "CONFIRMED" as const,
    },
    beliefSpecHash: digest("b"),
    prediction: {
      schemaVersion: "1" as const,
      id: "prediction-live-1",
      sessionId: "session-live-1",
      beliefTestId: "belief-live-1",
      choice: "The group-holdout score will remain close.",
      confidence: 76,
      committedAt: "2026-07-16T05:00:00.000Z",
      immutableHash: digest("d"),
    },
    artifactManifest: {
      artifactId: "artifact-live-1",
      fileName: "customer-analysis.ipynb",
      fileSha256: digest("e"),
      nbformat: 4,
      support: { status: "SUPPORTED" as const, reasons: [] },
      cells: [
        {
          index: 2,
          type: "code" as const,
          sourceSha256: digest("c"),
          sourceExcerpt: "train_test_split(X, y)",
          executionCount: 3,
          outputHashes: [],
          symbols: ["train_test_split"],
          metricCandidates: [],
        },
      ],
      schemaSummary: {
        fields: [
          {
            name: "customer_id",
            inferredType: "string",
            privacyClass: "identifier",
          },
        ],
        entityCandidates: ["customer_id"],
        targetCandidates: ["churned"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-16T04:59:00.000Z",
    },
    conceptPack: {
      id: "entity_leakage" as const,
      version: "2.0.0",
      title: "Entity leakage",
      allowedOperations: [
        "leakage.random_row_split" as const,
        "leakage.group_holdout" as const,
        "leakage.identity_ablation" as const,
      ],
      allowedMetrics: ["accuracy" as const, "entity_overlap_rate" as const],
      allowedVisualizations: [
        "metric_comparison" as const,
        "entity_overlap" as const,
      ],
      verifierInvariants: ["zero_group_overlap"],
      candidateExperimentIds: ["group-holdout"],
      planRequirements: ["Hold the estimator and preprocessing fixed."],
    },
    schemas: {
      discriminationContract: { type: "object" },
      experimentIr: { type: "object" },
      labScene: { type: "object" },
    },
    provenance: {
      generatorId: "codex-app-server-stdio-v1",
      promptHash: digest("f"),
      inputHashes: [digest("a"), digest("b"), digest("d")],
    },
    resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    permittedOutputs: [
      "discrimination-contract.json" as const,
      "experiment-ir.json" as const,
      "lab-scene.json" as const,
      "public-rationale.md" as const,
    ],
  };
}

describe("Runner LAB_COMPILE bundle v5", () => {
  it("parses as a versioned job without changing the stored v1 bundle", () => {
    const parsed = RunnerLabCompileBundleV5Schema.parse(runnerBundleV5());
    expect(parsed.approvedBeliefSpec.learnerDecision).toBe("CONFIRMED");
    expect(VersionedRunnerJobInputBundleSchema.parse(parsed)).toMatchObject({
      schemaVersion: "5",
      permittedOutputs: [
        "discrimination-contract.json",
        "experiment-ir.json",
        "lab-scene.json",
        "public-rationale.md",
      ],
    });
  });

  it("rejects unapproved or insufficient belief authority", () => {
    for (const update of [
      { learnerDecision: "UNDECIDED" },
      { learnerDecision: "REJECTED" },
      { learnerDecision: "ALTERNATIVE_SELECTED" },
      { supportState: "PARTIAL" },
      { supportState: "INSUFFICIENT_EVIDENCE" },
    ]) {
      expect(() =>
        RunnerLabCompileBundleV5Schema.parse({
          ...runnerBundleV5(),
          approvedBeliefSpec: {
            ...runnerBundleV5().approvedBeliefSpec,
            ...update,
          },
        }),
      ).toThrow(/learner-approved/i);
    }
  });

  it("rejects unresolved manifest evidence, mixed v1 fields, and extra outputs", () => {
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        approvedBeliefSpec: {
          ...runnerBundleV5().approvedBeliefSpec,
          evidenceRefs: [
            {
              ...runnerBundleV5().approvedBeliefSpec.evidenceRefs[0],
              hash: digest("f"),
            },
          ],
        },
      }),
    ).toThrow(/evidence/i);
    expect(() =>
      VersionedRunnerJobInputBundleSchema.parse({
        ...runnerBundleV5(),
        approvedBeliefTest: { id: "legacy" },
      }),
    ).toThrow();
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        permittedOutputs: [
          ...runnerBundleV5().permittedOutputs,
          "experiment-plan.json",
        ],
      }),
    ).toThrow();
  });

  it("requires compiler provenance to bind every authoritative input", () => {
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        provenance: {
          ...runnerBundleV5().provenance,
          inputHashes: [digest("a"), digest("b")],
        },
      }),
    ).toThrow(/provenance/i);
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        provenance: {
          ...runnerBundleV5().provenance,
          promptHash: "not-a-hash",
        },
      }),
    ).toThrow();
  });
});
