import { describe, expect, it } from "vitest";

import type {
  ArtifactManifest,
  BeliefTest,
  ExperimentPlanV2,
  HostedVerifiedResultSetV2,
} from "@counterlab/contracts";
import { hashCanonical } from "@counterlab/session-core";

import {
  PlanVerificationError,
  PatchPlanVerificationError,
  ResultVerificationError,
  verifyExperimentPlan,
  verifyPatchPlan,
  verifyHostedResultSet,
  verifyInteractiveResultSet,
} from "./index.js";

const OUTPUT_HASH = "d".repeat(64);
type LeakageRunSpec = Extract<
  ExperimentPlanV2["baseline"],
  { concept: "entity_leakage" }
>;
type LeakageExperimentPlan = Omit<
  ExperimentPlanV2,
  "concept" | "baseline" | "interventions"
> & {
  concept: "entity_leakage";
  baseline: LeakageRunSpec;
  interventions: LeakageRunSpec[];
};

function manifest(): ArtifactManifest {
  return {
    artifactId: "artifact_live_1",
    fileName: "uploaded.ipynb",
    fileSha256: "a".repeat(64),
    nbformat: 4,
    support: { status: "SUPPORTED", reasons: [] },
    cells: [
      {
        index: 2,
        type: "code",
        sourceSha256: "b".repeat(64),
        sourceExcerpt: "train_test_split(X, y, random_state=1729)",
        executionCount: 2,
        outputHashes: [],
        symbols: ["train_test_split"],
        metricCandidates: [],
      },
      {
        index: 4,
        type: "code",
        sourceSha256: "c".repeat(64),
        sourceExcerpt: "print(accuracy)",
        executionCount: 4,
        outputHashes: [OUTPUT_HASH],
        symbols: ["accuracy_score"],
        metricCandidates: [{ name: "accuracy", value: 0.985, outputIndex: 0 }],
      },
    ],
    schemaSummary: {
      fields: [
        {
          name: "account_key",
          inferredType: "categorical",
          privacyClass: "entity_identifier",
        },
      ],
      rowCount: 1800,
      entityCandidates: ["account_key"],
      targetCandidates: ["cancelled"],
    },
    packageHints: ["sklearn"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

function belief(): BeliefTest {
  return {
    schemaVersion: "1",
    id: "belief_live_1",
    concept: "entity_leakage",
    learnerClaim: "The high score proves the model works for new accounts.",
    currentHypothesis: {
      statement: "The model learned a reusable signal.",
      predictedOutcome: "Accuracy remains high for unseen accounts.",
    },
    competingHypothesis: {
      statement: "Account identity crosses the row split.",
      predictedOutcome: "Accuracy falls when complete accounts are held out.",
    },
    evidenceRefs: [
      {
        cellIndex: 4,
        outputIndex: 0,
        kind: "metric",
        hash: OUTPUT_HASH,
        excerpt: "accuracy 0.985",
        relevance: "This is the interpreted notebook result.",
      },
    ],
    alternatives: [],
    decisiveIntervention: {
      id: "hold-out-accounts",
      description: "Hold out complete accounts.",
      controlledVariables: ["model", "seed", "test fraction"],
      changedVariables: ["split boundary"],
      discriminatesBecause: "The hypotheses predict different accuracy.",
    },
    uncertainty: {
      confidence: 0.9,
      limitations: [],
      insufficientEvidence: false,
    },
    requiresLearnerConfirmation: true,
  };
}

async function plan(): Promise<LeakageExperimentPlan> {
  const artifact = manifest();
  return {
    schemaVersion: "2",
    planId: "plan_live_1",
    sessionId: "session_live_1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: await hashCanonical(artifact),
    beliefTestId: "belief_live_1",
    evidenceRefs: belief().evidenceRefs,
    baseline: {
      concept: "entity_leakage",
      runId: "random_rows",
      operation: "leakage.random_row_split",
      seed: 1729,
      testFraction: 0.25,
      entityField: "account_key",
      dropIdentity: false,
      model: "logistic_regression",
    },
    interventions: [
      {
        concept: "entity_leakage",
        runId: "new_accounts",
        operation: "leakage.group_holdout",
        seed: 1729,
        testFraction: 0.25,
        entityField: "account_key",
        dropIdentity: false,
        model: "logistic_regression",
      },
      {
        concept: "entity_leakage",
        runId: "without_identity",
        operation: "leakage.identity_ablation",
        seed: 1729,
        testFraction: 0.25,
        entityField: "account_key",
        dropIdentity: true,
        model: "logistic_regression",
      },
    ],
    controlledVariables: ["model", "seed", "test fraction"],
    changedVariables: ["split boundary", "identity feature"],
    metrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
    visualizations: ["metric_comparison", "entity_overlap"],
    discriminatesBecause:
      "Only the shortcut hypothesis predicts a drop for unseen accounts.",
    expectedPatterns: [
      { hypothesisId: "current", qualitativeOutcome: "Accuracy stays high." },
      {
        hypothesisId: "competing",
        qualitativeOutcome: "Accuracy falls at zero account overlap.",
      },
    ],
    nonClaims: ["This does not prove performance for every future account."],
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
  };
}

async function result(
  experimentPlan?: LeakageExperimentPlan,
): Promise<HostedVerifiedResultSetV2> {
  const resolvedPlan = experimentPlan ?? (await plan());
  const fixtureHash = "8".repeat(64);
  const runs = [resolvedPlan.baseline, ...resolvedPlan.interventions].map(
    (spec) => {
      const group = spec.operation === "leakage.group_holdout";
      const ablation = spec.dropIdentity;
      return {
        id: spec.runId,
        operation: spec.operation,
        splitStrategy: group ? ("group" as const) : ("random" as const),
        groupBy: group ? "account_key" : null,
        dropFeatures: ablation ? ["account_key"] : [],
        model: spec.model,
        seed: spec.seed,
        inputFingerprint: fixtureHash,
        featureSetFingerprint: ablation ? "6".repeat(64) : "7".repeat(64),
        metrics: {
          accuracy: group ? 0.59 : ablation ? 0.61 : 0.985,
          rocAuc: group ? 0.64 : ablation ? 0.66 : 0.99,
        },
        sampleSizes: { train: 1350, test: 450 },
        entityCounts: { train: 360, test: 120 },
        entityOverlap: group ? { count: 0, rate: 0 } : { count: 120, rate: 1 },
      };
    },
  );
  const withoutHash = {
    schemaVersion: "2" as const,
    concept: "entity_leakage" as const,
    planId: resolvedPlan.planId,
    sessionId: resolvedPlan.sessionId,
    artifactManifestHash: resolvedPlan.artifactManifestHash,
    conceptPackVersion: resolvedPlan.conceptPackVersion,
    fixture: {
      customers: 480,
      rows: 1800,
      sha256: fixtureHash,
      targetRate: 0.49,
    },
    kernelVersion: "0.1.0",
    seed: 1729,
    runs,
    chartData: runs.map((run) => ({
      runId: run.id,
      splitStrategy: run.splitStrategy,
      accuracy: run.metrics.accuracy,
      rocAuc: run.metrics.rocAuc,
      sampleSize: run.sampleSizes.test,
      seed: run.seed,
    })),
  };
  return { ...withoutHash, resultHash: await hashCanonical(withoutHash) };
}

describe("hosted Experiment Plan verifier", () => {
  it("verifies the fixed class-imbalance discrimination set", async () => {
    const artifact = manifest();
    artifact.schemaSummary.entityCandidates = [];
    artifact.schemaSummary.targetCandidates = ["fraud"];
    const imbalanceBelief: BeliefTest = {
      ...belief(),
      id: "belief_imbalance_1",
      concept: "class_imbalance",
      learnerClaim: "The high accuracy proves the model catches rare fraud.",
      currentHypothesis: {
        statement: "High accuracy means useful rare-event detection.",
        predictedOutcome: "Minority recall is also high.",
      },
      competingHypothesis: {
        statement: "The majority class hides missed rare events.",
        predictedOutcome: "A majority predictor is accurate with zero recall.",
      },
      decisiveIntervention: {
        id: "minority-metrics",
        description: "Compare a majority baseline and minority metrics.",
        controlledVariables: ["seed", "holdout"],
        changedVariables: ["threshold", "prevalence"],
        discriminatesBecause:
          "The hypotheses predict different rare-class recall.",
      },
    };
    const run = (
      runId: string,
      operation:
        | "imbalance.majority_baseline"
        | "imbalance.stratified_holdout"
        | "imbalance.threshold_sweep"
        | "imbalance.prevalence_sweep",
      model: "majority_baseline" | "logistic_regression",
      threshold: number,
      prevalenceScenario: "observed" | "rarer",
    ) => ({
      concept: "class_imbalance" as const,
      runId,
      operation,
      seed: 2603,
      threshold,
      prevalenceScenario,
      model,
    });
    const imbalancePlan = {
      schemaVersion: "2",
      planId: "plan_imbalance_1",
      sessionId: "session_imbalance_1",
      concept: "class_imbalance",
      conceptPackVersion: "1.0.0",
      artifactManifestHash: await hashCanonical(artifact),
      beliefTestId: imbalanceBelief.id,
      evidenceRefs: imbalanceBelief.evidenceRefs,
      baseline: run(
        "majority",
        "imbalance.majority_baseline",
        "majority_baseline",
        0.5,
        "observed",
      ),
      interventions: [
        run(
          "stratified",
          "imbalance.stratified_holdout",
          "logistic_regression",
          0.5,
          "observed",
        ),
        run(
          "threshold",
          "imbalance.threshold_sweep",
          "logistic_regression",
          0.25,
          "observed",
        ),
        run(
          "prevalence",
          "imbalance.prevalence_sweep",
          "logistic_regression",
          0.25,
          "rarer",
        ),
      ],
      controlledVariables: ["seed", "holdout"],
      changedVariables: ["threshold", "prevalence"],
      metrics: [
        "accuracy",
        "precision",
        "recall",
        "f1",
        "pr_auc",
        "roc_auc",
        "confusion_matrix",
        "prevalence",
      ],
      visualizations: [
        "metric_comparison",
        "confusion_matrix",
        "threshold_curve",
        "prevalence_sensitivity",
      ],
      discriminatesBecause:
        "A majority baseline can be accurate while missing every rare event.",
      expectedPatterns: [
        { hypothesisId: "current", qualitativeOutcome: "Recall remains high." },
        {
          hypothesisId: "competing",
          qualitativeOutcome: "Accuracy stays high while recall is low.",
        },
      ],
      nonClaims: ["This does not choose a production threshold."],
      resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
    };

    await expect(
      verifyExperimentPlan(imbalancePlan, {
        manifest: artifact,
        beliefTest: imbalanceBelief,
      }),
    ).resolves.toMatchObject({ status: "VERIFIED", invariantCount: 15 });

    const fixtureHash = "9".repeat(64);
    const resultRun = (
      spec: (typeof imbalancePlan.interventions)[number],
      matrix: { tn: number; fp: number; fn: number; tp: number },
      prAuc: number,
      rocAuc: number,
    ) => {
      const total = matrix.tn + matrix.fp + matrix.fn + matrix.tp;
      const precision =
        matrix.tp + matrix.fp === 0 ? 0 : matrix.tp / (matrix.tp + matrix.fp);
      const recall = matrix.tp / (matrix.tp + matrix.fn);
      const f1 =
        precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall);
      const rounded = (value: number) => Number(value.toFixed(12));
      return {
        id: spec.runId,
        operation: spec.operation,
        model: spec.model,
        seed: spec.seed,
        threshold: spec.threshold,
        prevalenceScenario: spec.prevalenceScenario,
        metrics: {
          accuracy: rounded((matrix.tn + matrix.tp) / total),
          precision: rounded(precision),
          recall: rounded(recall),
          f1: rounded(f1),
          prAuc,
          rocAuc,
        },
        confusionMatrix: matrix,
        sampleSizes: { train: 4500, test: total },
        classCounts: {
          train: { negative: 4339, positive: 161 },
          test: {
            negative: matrix.tn + matrix.fp,
            positive: matrix.fn + matrix.tp,
          },
        },
        prevalence: rounded((matrix.fn + matrix.tp) / total),
        predictedPositiveRate: rounded((matrix.fp + matrix.tp) / total),
        featureSetFingerprint: "8".repeat(64),
        inputFingerprint: fixtureHash,
      };
    };
    const allSpecs = [imbalancePlan.baseline, ...imbalancePlan.interventions];
    const runs = [
      resultRun(allSpecs[0]!, { tn: 1446, fp: 0, fn: 54, tp: 0 }, 0.036, 0.5),
      resultRun(allSpecs[1]!, { tn: 1420, fp: 26, fn: 35, tp: 19 }, 0.24, 0.81),
      resultRun(allSpecs[2]!, { tn: 1350, fp: 96, fn: 20, tp: 34 }, 0.24, 0.81),
      resultRun(allSpecs[3]!, { tn: 1420, fp: 26, fn: 17, tp: 10 }, 0.17, 0.81),
    ];
    const withoutHash = {
      schemaVersion: "2" as const,
      concept: "class_imbalance" as const,
      planId: imbalancePlan.planId,
      sessionId: imbalancePlan.sessionId,
      artifactManifestHash: imbalancePlan.artifactManifestHash,
      conceptPackVersion: imbalancePlan.conceptPackVersion,
      fixture: {
        sha256: fixtureHash,
        rows: 6000,
        positives: 215,
        prevalence: 0.035833333333,
      },
      kernelVersion: "0.1.0",
      seed: 2603,
      runs,
      chartData: runs.map((candidate) => ({
        runId: candidate.id,
        operation: candidate.operation,
        ...candidate.metrics,
        prevalence: candidate.prevalence,
        predictedPositiveRate: candidate.predictedPositiveRate,
        sampleSize: candidate.sampleSizes.test,
        threshold: candidate.threshold,
        prevalenceScenario: candidate.prevalenceScenario,
        seed: candidate.seed,
      })),
    };
    const imbalanceResult = {
      ...withoutHash,
      resultHash: await hashCanonical(withoutHash),
    };
    await expect(
      verifyHostedResultSet(imbalanceResult, imbalancePlan as ExperimentPlanV2),
    ).resolves.toMatchObject({ status: "VERIFIED", invariantCount: 8 });

    const staleImbalance = { ...imbalanceResult, resultHash: "0".repeat(64) };
    await expect(
      verifyHostedResultSet(staleImbalance, imbalancePlan as ExperimentPlanV2),
    ).rejects.toThrow(/canonical/i);

    const missingThreshold = {
      ...imbalancePlan,
      interventions: imbalancePlan.interventions.filter(
        (candidate) => candidate.operation !== "imbalance.threshold_sweep",
      ),
    };
    await expect(
      verifyExperimentPlan(missingThreshold, {
        manifest: artifact,
        beliefTest: imbalanceBelief,
      }),
    ).rejects.toThrow(
      /majority baseline, stratified holdout, threshold sweep/i,
    );
  });

  it("verifies resolved lineage and the complete leakage intervention set", async () => {
    const report = await verifyExperimentPlan(await plan(), {
      manifest: manifest(),
      beliefTest: belief(),
    });
    expect(report).toMatchObject({
      schemaVersion: "1",
      status: "VERIFIED",
      verifierVersion: "hosted-plan-verifier-v1",
    });
    expect(report.invariants.every((invariant) => invariant.passed)).toBe(true);
    expect(report.planHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects unresolved evidence, missing group holdout, and changed controls", async () => {
    const unresolved = {
      ...(await plan()),
      evidenceRefs: [{ ...belief().evidenceRefs[0]!, hash: "f".repeat(64) }],
    };
    await expect(
      verifyExperimentPlan(unresolved, {
        manifest: manifest(),
        beliefTest: belief(),
      }),
    ).rejects.toBeInstanceOf(PlanVerificationError);

    const missingGroup = {
      ...(await plan()),
      interventions: (await plan()).interventions.filter(
        (run) => run.operation !== "leakage.group_holdout",
      ),
    };
    await expect(
      verifyExperimentPlan(missingGroup, {
        manifest: manifest(),
        beliefTest: belief(),
      }),
    ).rejects.toThrow(/group holdout/i);

    const changedSeed = await plan();
    changedSeed.interventions[0] = {
      ...changedSeed.interventions[0]!,
      seed: 7,
    };
    await expect(
      verifyExperimentPlan(changedSeed, {
        manifest: manifest(),
        beliefTest: belief(),
      }),
    ).rejects.toThrow(/controlled/i);
  });
});

describe("hosted fixed-kernel result verifier", () => {
  it("verifies canonical output against every declared Plan run", async () => {
    const report = await verifyHostedResultSet(await result(), await plan());

    expect(report).toMatchObject({
      status: "VERIFIED",
      verifierVersion: "hosted-result-verifier-v1",
    });
    expect(report.invariants.every((check) => check.passed)).toBe(true);
  });

  it("rejects overlap, run, or canonical hash drift before releasing results", async () => {
    const overlap = await result();
    overlap.runs[1] = {
      ...overlap.runs[1]!,
      entityOverlap: { count: 1, rate: 1 / 120 },
    };

    await expect(
      verifyHostedResultSet(overlap, await plan()),
    ).rejects.toBeInstanceOf(ResultVerificationError);

    const staleHash = await result();
    staleHash.resultHash = "0".repeat(64);
    await expect(
      verifyHostedResultSet(staleHash, await plan()),
    ).rejects.toThrow(/canonical/i);
  });
});

describe("interactive fixed-kernel result verifier", () => {
  it("verifies the selected bounded configuration without requiring a teaching gap", async () => {
    const interactivePlan = await plan();
    interactivePlan.planId = "interactive_plan_1";
    interactivePlan.baseline = {
      ...interactivePlan.baseline,
      runId: "interactive_1",
      dropIdentity: true,
      testFraction: 0.25,
    };
    const interactiveResult = await result(interactivePlan);

    const report = await verifyInteractiveResultSet(
      interactiveResult,
      interactivePlan,
      interactivePlan.baseline.runId,
    );

    expect(report.status).toBe("VERIFIED");
    expect(report.invariants.every((check) => check.passed)).toBe(true);
  });

  it("rejects a selected run whose fixed operation binding was changed", async () => {
    const interactivePlan = await plan();
    interactivePlan.planId = "interactive_plan_2";
    interactivePlan.baseline = {
      ...interactivePlan.baseline,
      runId: "interactive_2",
      operation: "leakage.group_holdout",
    };
    const interactiveResult = await result(interactivePlan);
    interactiveResult.runs[0] = {
      ...interactiveResult.runs[0]!,
      splitStrategy: "random",
      groupBy: null,
      entityOverlap: { count: 120, rate: 1 },
    };
    const { resultHash: _resultHash, ...withoutHash } = interactiveResult;
    interactiveResult.resultHash = await hashCanonical(withoutHash);

    await expect(
      verifyInteractiveResultSet(
        interactiveResult,
        interactivePlan,
        interactivePlan.baseline.runId,
      ),
    ).rejects.toBeInstanceOf(ResultVerificationError);
  });
});

describe("hosted Patch Plan verifier", () => {
  it("binds the two registered transformations to the evidenced evaluation cell", async () => {
    const experimentPlan = await plan();
    const patchPlan = {
      schemaVersion: "1" as const,
      planId: "patch_plan_1",
      sessionId: experimentPlan.sessionId,
      concept: "entity_leakage" as const,
      conceptPackVersion: experimentPlan.conceptPackVersion,
      artifactManifestHash: experimentPlan.artifactManifestHash,
      sourceArtifactHash: manifest().fileSha256,
      transferResultHash: "e".repeat(64),
      verifiedResultHash: "d".repeat(64),
      evidenceRefs: belief().evidenceRefs,
      targetCells: [2],
      entityField: "account_key",
      targetField: "cancelled",
      operations: [
        {
          id: "replace_row_split_with_group_holdout" as const,
          cellIndex: 2,
          reason: "Evaluate complete accounts together.",
        },
        {
          id: "exclude_entity_feature" as const,
          cellIndex: 2,
          reason: "Remove the identity shortcut.",
        },
      ],
      preserveUnrelatedCells: true as const,
      nonClaims: ["This does not establish production performance."],
    };
    const context = {
      sessionId: experimentPlan.sessionId,
      manifest: manifest(),
      beliefTest: belief(),
      verifiedResultHash: "d".repeat(64),
      transferResultHash: "e".repeat(64),
      conceptPackVersion: "2.0.0",
      allowedTransformations: [
        "replace_row_split_with_group_holdout",
        "exclude_entity_feature",
      ] as const,
      allowedCellIndices: [2],
    };

    await expect(verifyPatchPlan(patchPlan, context)).resolves.toMatchObject({
      status: "VERIFIED",
      verifierVersion: "hosted-patch-plan-verifier-v1",
    });
    await expect(
      verifyPatchPlan(
        {
          ...patchPlan,
          targetCells: [4],
          operations: patchPlan.operations.map((operation) => ({
            ...operation,
            cellIndex: 4,
          })),
        },
        context,
      ),
    ).rejects.toBeInstanceOf(PatchPlanVerificationError);
  });

  it("binds the imbalance repair to the evidenced accuracy-only cell", async () => {
    const artifact = manifest();
    artifact.schemaSummary.entityCandidates = [];
    artifact.schemaSummary.targetCandidates = ["fraud"];
    const imbalanceBelief: BeliefTest = {
      ...belief(),
      id: "belief_imbalance_patch",
      concept: "class_imbalance",
      learnerClaim: "The high accuracy proves the model catches rare fraud.",
    };
    const patchPlan = {
      schemaVersion: "1" as const,
      planId: "patch_plan_imbalance_1",
      sessionId: "session_imbalance_patch",
      concept: "class_imbalance" as const,
      conceptPackVersion: "1.0.0",
      artifactManifestHash: await hashCanonical(artifact),
      sourceArtifactHash: artifact.fileSha256,
      transferResultHash: "e".repeat(64),
      verifiedResultHash: "d".repeat(64),
      evidenceRefs: imbalanceBelief.evidenceRefs,
      targetCells: [2],
      targetField: "fraud",
      operations: [
        {
          id: "stratify_classification_holdout" as const,
          cellIndex: 2,
          reason: "Keep the rare-event rate represented in both partitions.",
        },
        {
          id: "add_majority_baseline" as const,
          cellIndex: 2,
          reason: "Compare aggregate accuracy with the trivial classifier.",
        },
        {
          id: "replace_accuracy_only_evaluation" as const,
          cellIndex: 2,
          reason: "Report class-specific errors and threshold context.",
        },
      ],
      preserveUnrelatedCells: true as const,
      nonClaims: ["This does not select a production threshold."],
    };

    await expect(
      verifyPatchPlan(patchPlan, {
        sessionId: patchPlan.sessionId,
        manifest: artifact,
        beliefTest: imbalanceBelief,
        verifiedResultHash: "d".repeat(64),
        transferResultHash: "e".repeat(64),
        conceptPackVersion: "1.0.0",
        allowedTransformations: [
          "stratify_classification_holdout",
          "add_majority_baseline",
          "replace_accuracy_only_evaluation",
        ],
        allowedCellIndices: [2],
      }),
    ).resolves.toMatchObject({ status: "VERIFIED", invariantCount: 6 });
  });
});
