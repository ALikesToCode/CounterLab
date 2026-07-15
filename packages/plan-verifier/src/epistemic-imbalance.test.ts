import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  ExperimentPlanV2Schema,
  HostedVerifiedResultSetV2Schema,
  type HostedVerifiedResultSetV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  migrateExperimentPlanV2ToIRV5,
  projectExperimentIRV5ToPlanV2,
} from "@counterlab/experiment-ir";
import {
  applyExperimentSelection,
  scoreExperiments,
} from "@counterlab/experiment-scorer";
import { hashCanonical } from "@counterlab/session-core";

import { verifyEpistemicEvidence, verifyHostedResultSet } from "./index.js";

const digest = (character: string) => character.repeat(64);
const manifest = ArtifactManifestSchema.parse(
  JSON.parse(
    readFileSync(
      new URL(
        "../../../fixtures/held-out/imbalance_epistemic_manifest.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
);
const evidence = {
  cellIndex: 4,
  outputIndex: 0,
  kind: "metric" as const,
  hash: digest("a"),
  excerpt: "Accuracy: 0.99",
  relevance: "The notebook interprets accuracy as rare-event usefulness.",
};

const beliefSpec = BeliefSpecV2Schema.parse({
  schemaVersion: "2",
  id: "belief-imbalance-1",
  concept: "class_imbalance",
  claim: "The high accuracy proves the model catches rare fraud.",
  evidenceRefs: [evidence],
  hypotheses: [
    {
      id: "current",
      statement: "High accuracy reflects useful minority detection.",
      conditions: ["The rare class is detected at the documented threshold."],
      nonClaims: ["No threshold is claimed optimal for every deployment."],
      evidence: [evidence],
      supportedCandidateExperimentIds: [
        "threshold-and-majority-baseline",
        "prevalence-and-threshold-sweep",
      ],
    },
    {
      id: "competing",
      statement:
        "Class rarity lets a weak majority prediction appear accurate.",
      conditions: ["The positive class is rare in the evaluation set."],
      nonClaims: ["Accuracy is not useless for every balanced task."],
      evidence: [evidence],
      supportedCandidateExperimentIds: [
        "threshold-and-majority-baseline",
        "prevalence-and-threshold-sweep",
      ],
    },
  ],
  alternatives: [],
  uncertainty: 0.82,
  supportState: "SUPPORTED",
  learnerDecision: "CONFIRMED",
});

const presentation = {
  scope: "rare-event detection in the documented fixture",
  learnerFacingClaims: [
    "The fixed majority baseline and confusion-matrix totals were verified for this run.",
  ],
};

function runSpec(
  runId: string,
  operation:
    | "imbalance.majority_baseline"
    | "imbalance.stratified_holdout"
    | "imbalance.threshold_sweep"
    | "imbalance.prevalence_sweep",
  model: "majority_baseline" | "logistic_regression",
  threshold: number,
  prevalenceScenario: "observed" | "rarer",
) {
  return {
    concept: "class_imbalance" as const,
    runId,
    operation,
    seed: 2603,
    threshold,
    prevalenceScenario,
    model,
  };
}

async function selectedIr(stratifiedThreshold = 0.5) {
  const beliefSpecHash = await hashCanonical(beliefSpec);
  const manifestHash = await hashCanonical(manifest);
  const plan = ExperimentPlanV2Schema.parse({
    schemaVersion: "2",
    planId: "plan-imbalance-1",
    sessionId: "session-imbalance-1",
    concept: "class_imbalance",
    conceptPackVersion: "1.0.0",
    artifactManifestHash: manifestHash,
    beliefTestId: beliefSpec.id,
    evidenceRefs: [evidence],
    baseline: runSpec(
      "majority",
      "imbalance.majority_baseline",
      "majority_baseline",
      0.5,
      "observed",
    ),
    interventions: [
      runSpec(
        "stratified",
        "imbalance.stratified_holdout",
        "logistic_regression",
        stratifiedThreshold,
        "observed",
      ),
      runSpec(
        "threshold",
        "imbalance.threshold_sweep",
        "logistic_regression",
        0.25,
        "observed",
      ),
      runSpec(
        "prevalence",
        "imbalance.prevalence_sweep",
        "logistic_regression",
        0.25,
        "rarer",
      ),
    ],
    controlledVariables: ["model_scores", "seed", "evaluation_set"],
    changedVariables: ["decision_threshold", "class_prevalence"],
    metrics: ["recall", "confusion_matrix", "prevalence"],
    visualizations: ["confusion_matrix", "threshold_curve"],
    discriminatesBecause:
      "The majority baseline and threshold response expose minority detection.",
    expectedPatterns: [
      {
        hypothesisId: "current",
        qualitativeOutcome: "Minority recall and F1 remain useful.",
      },
      {
        hypothesisId: "competing",
        qualitativeOutcome: "Accuracy stays high while minority recall fails.",
      },
    ],
    nonClaims: ["This does not choose a universal production threshold."],
    resourceLimits: { wallSeconds: 45, memoryMb: 512, maxRuns: 4 },
  });
  const migrated = migrateExperimentPlanV2ToIRV5(plan, {
    beliefSpecHash,
    sourcePlanHash: digest("d"),
    transfer: {
      taskId: "manufacturing-rare-defect-v1",
      changedSurface: "Rare manufacturing defects with asymmetric cost.",
      requiredActionIds: ["choose_minority_sensitive_metric"],
      nonClaims: ["Transfer does not certify mastery."],
    },
  });
  const source = migrated.candidateExperiments[0]!;
  const primary = {
    ...source,
    id: "threshold-and-majority-baseline",
    operationIds: [
      "imbalance.majority_baseline" as const,
      "imbalance.stratified_holdout" as const,
      "imbalance.confusion_matrix" as const,
      "imbalance.threshold_sweep" as const,
      "imbalance.prevalence_sweep" as const,
    ],
    heldConstantIds: ["model_scores", "seed", "evaluation_set"],
    changedVariableIds: ["decision_threshold", "class_prevalence"],
    observableIds: ["recall", "confusion_matrix", "prevalence"] as const,
    hypothesisPatterns: [
      {
        hypothesisId: "current" as const,
        patternId: "imbalance.useful-minority-detection",
      },
      {
        hypothesisId: "competing" as const,
        patternId: "imbalance.majority-dominance",
      },
    ] as const,
    inconclusiveConditionIds: ["minority-utility-uncertain"],
    complexityCost: 4,
  };
  const followup = {
    ...primary,
    id: "prevalence-and-threshold-sweep",
    complexityCost: 6,
  };
  const draft = ExperimentIRV5Schema.parse({
    ...migrated,
    hypotheses: [
      {
        id: "current",
        statement: beliefSpec.hypotheses[0].statement,
        conditions: beliefSpec.hypotheses[0].conditions,
        nonClaims: beliefSpec.hypotheses[0].nonClaims,
        predictedPattern: {
          patternId: "imbalance.useful-minority-detection",
          description: "Minority recall and F1 remain useful.",
        },
      },
      {
        id: "competing",
        statement: beliefSpec.hypotheses[1].statement,
        conditions: beliefSpec.hypotheses[1].conditions,
        nonClaims: beliefSpec.hypotheses[1].nonClaims,
        predictedPattern: {
          patternId: "imbalance.majority-dominance",
          description: "Accuracy stays high while minority recall fails.",
        },
      },
    ],
    candidateExperiments: [followup, primary],
    selection: { status: "UNSELECTED" },
    inconclusiveConditions: [
      {
        id: "minority-utility-uncertain",
        description: "Minority utility falls between decisive thresholds.",
        nextExperimentId: "prevalence-and-threshold-sweep",
      },
    ],
    provenance: {
      kind: "fixed",
      generatorId: "epistemic-imbalance-test-fixture-v1",
      inputHashes: [manifestHash, beliefSpecHash],
    },
    limitations: ["Test fixture only."],
  });
  return applyExperimentSelection(
    draft,
    scoreExperiments({
      beliefSpec,
      beliefSpecHash,
      ir: draft,
      policy: getConceptPack("class_imbalance").scientificMethod.scoringPolicy,
    }),
  );
}

type GoldenRegion = "competing" | "inconclusive";

function readGolden(region: GoldenRegion): HostedVerifiedResultSetV2 {
  const url = new URL(
    `../../../fixtures/held-out/imbalance_epistemic_${region}_v2.json`,
    import.meta.url,
  );
  return HostedVerifiedResultSetV2Schema.parse(
    JSON.parse(readFileSync(url, "utf8")),
  );
}

async function resultFor(
  ir: Awaited<ReturnType<typeof selectedIr>>,
  region: GoldenRegion = "competing",
): Promise<HostedVerifiedResultSetV2> {
  const plan = projectExperimentIRV5ToPlanV2(ir);
  const result = readGolden(region);
  if (
    plan.concept !== "class_imbalance" ||
    result.concept !== "class_imbalance"
  ) {
    throw new Error("epistemic imbalance fixture resolved to another concept");
  }
  if (
    result.planId !== plan.planId ||
    result.sessionId !== plan.sessionId ||
    result.artifactManifestHash !== plan.artifactManifestHash ||
    result.conceptPackVersion !== plan.conceptPackVersion
  ) {
    throw new Error(
      "fixed-kernel golden does not resolve to the projected plan",
    );
  }
  const expectedSpecs = [plan.baseline, ...plan.interventions];
  const actualSpecs = result.runs.map((run) => ({
    runId: run.id,
    operation: run.operation,
    model: run.model,
    seed: run.seed,
    threshold: run.threshold,
    prevalenceScenario: run.prevalenceScenario,
  }));
  const projectedSpecs = expectedSpecs.map((spec) => {
    if (spec.concept !== "class_imbalance") {
      throw new Error("projected plan contains a mixed-concept run");
    }
    return {
      runId: spec.runId,
      operation: spec.operation,
      model: spec.model,
      seed: spec.seed,
      threshold: spec.threshold,
      prevalenceScenario: spec.prevalenceScenario,
    };
  });
  if (JSON.stringify(actualSpecs) !== JSON.stringify(projectedSpecs)) {
    throw new Error(
      "fixed-kernel golden run specs differ from the projected plan",
    );
  }
  return result;
}

async function rehash(
  result: HostedVerifiedResultSetV2,
): Promise<HostedVerifiedResultSetV2> {
  const { resultHash: _resultHash, ...withoutHash } = result;
  return HostedVerifiedResultSetV2Schema.parse({
    ...withoutHash,
    resultHash: await hashCanonical(withoutHash),
  });
}

async function verify(region: GoldenRegion = "competing") {
  const ir = await selectedIr(region === "inconclusive" ? 0.45 : 0.5);
  const result = await resultFor(ir, region);
  return verifyEpistemicEvidence({
    artifactManifest: manifest,
    sessionId: "session-imbalance-1",
    beliefSpec,
    ir,
    result,
    presentation,
  });
}

describe("class-imbalance epistemic authority", () => {
  it("releases a scoped competing-hypothesis verdict with bound controls", async () => {
    const report = await verify();

    expect(report).toMatchObject({
      status: "VERIFIED",
      verdict: { kind: "SUPPORTS", hypothesisId: "competing" },
    });
    expect(report.observation?.controlBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ controlId: "model_scores" }),
        expect.objectContaining({ controlId: "evaluation_set" }),
        expect.objectContaining({ controlId: "seed" }),
      ]),
    );
    expect(
      report.observation?.controlBindings.every(
        (binding) => binding.beforeHash === binding.afterHash,
      ),
    ).toBe(true);
    expect(report.observation?.observableBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observableId: "recall",
          resultPath: "/runs/1/metrics/recall",
        }),
        expect.objectContaining({
          observableId: "confusion_matrix",
          resultPath: "/runs/1/confusionMatrix",
        }),
        expect.objectContaining({
          observableId: "prevalence",
          resultPath: "/runs/3/prevalence",
        }),
      ]),
    );
  });

  it("releases an explicit inconclusive verdict in the fixed middle region", async () => {
    const ir = await selectedIr(0.45);
    const result = await resultFor(ir, "inconclusive");
    await expect(
      verifyHostedResultSet(result, projectExperimentIRV5ToPlanV2(ir)),
    ).rejects.toMatchObject({
      report: {
        status: "REJECTED",
        invariants: expect.arrayContaining([
          expect.objectContaining({
            name: "discriminating_outcomes",
            passed: false,
          }),
        ]),
      },
    });

    const report = await verify("inconclusive");

    expect(report).toMatchObject({
      status: "VERIFIED",
      verdict: {
        kind: "INCONCLUSIVE",
        reasonCode: "MINORITY_UTILITY_UNCERTAIN",
        nextExperimentId: "prevalence-and-threshold-sweep",
      },
    });
  });

  it("blocks a confusion-metric mutation before epistemic result release", async () => {
    const ir = await selectedIr();
    const result = await resultFor(ir);
    if (result.concept !== "class_imbalance") throw new Error("wrong concept");
    const runs = result.runs.map((run) =>
      run.operation === "imbalance.stratified_holdout"
        ? { ...run, metrics: { ...run.metrics, recall: 0.9 } }
        : run,
    );
    const chartData = result.chartData.map((row) =>
      row.operation === "imbalance.stratified_holdout"
        ? { ...row, recall: 0.9 }
        : row,
    );
    const tampered = await rehash({ ...result, runs, chartData });
    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-imbalance-1",
      beliefSpec,
      ir,
      result: tampered,
      presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toEqual([
      "TECHNICAL_VERIFICATION_FAILED",
    ]);
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
    expect("resultHash" in report).toBe(false);
    expect("observation" in report).toBe(false);
  });

  it("rejects a changed threshold score fingerprint as a confound", async () => {
    const ir = await selectedIr();
    const result = await resultFor(ir);
    if (result.concept !== "class_imbalance") throw new Error("wrong concept");
    const runs = result.runs.map((run) =>
      run.operation === "imbalance.threshold_sweep"
        ? { ...run, scoreFingerprint: digest("0") }
        : run,
    );
    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-imbalance-1",
      beliefSpec,
      ir,
      result: await rehash({ ...result, runs }),
      presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toEqual([
      "TECHNICAL_VERIFICATION_FAILED",
    ]);
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
  });

  it("returns a typed no-release verdict when an authoritative run is missing", async () => {
    const ir = await selectedIr();
    const result = await resultFor(ir);
    if (result.concept !== "class_imbalance") throw new Error("wrong concept");
    const runs = result.runs.filter(
      (run) => run.operation !== "imbalance.stratified_holdout",
    );
    const chartData = result.chartData.filter(
      (row) => row.operation !== "imbalance.stratified_holdout",
    );
    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-imbalance-1",
      beliefSpec,
      ir,
      result: await rehash({ ...result, runs, chartData }),
      presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toEqual([
      "TECHNICAL_VERIFICATION_FAILED",
    ]);
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
    expect("resultHash" in report).toBe(false);
  });
});
