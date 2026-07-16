import { describe, expect, it } from "vitest";

import {
  ExperimentPlanV2Schema,
  type ExperimentPlanV2,
} from "@counterlab/contracts";

import {
  ExperimentIRPolicyError,
  ExperimentIRV5Schema,
  canonicalizeExperimentIR,
  hashExperimentIR,
  migrateExperimentPlanV2ToIRV5,
  projectExperimentIRV5ToPlanV2,
  validateExperimentIRPolicy,
} from "../src/index.js";

const hash = (character: string) => character.repeat(64);

function leakagePlan(): ExperimentPlanV2 {
  return ExperimentPlanV2Schema.parse({
    schemaVersion: "2",
    planId: "plan-live-1",
    sessionId: "session-live-1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: hash("a"),
    beliefTestId: "belief-live-1",
    evidenceRefs: [
      {
        cellIndex: 3,
        kind: "code",
        hash: hash("b"),
        excerpt: "train_test_split(X, y)",
        relevance: "The evaluation split is row-wise.",
      },
    ],
    baseline: {
      concept: "entity_leakage",
      runId: "random-row",
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
        runId: "group-holdout",
        operation: "leakage.group_holdout",
        seed: 1729,
        testFraction: 0.25,
        entityField: "customer_id",
        dropIdentity: false,
        model: "logistic_regression",
      },
      {
        concept: "entity_leakage",
        runId: "identity-ablation",
        operation: "leakage.identity_ablation",
        seed: 1729,
        testFraction: 0.25,
        entityField: "customer_id",
        dropIdentity: true,
        model: "logistic_regression",
      },
    ],
    controlledVariables: ["model", "seed", "test_fraction"],
    changedVariables: ["split_strategy", "identity_feature"],
    metrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
    visualizations: ["metric_comparison", "entity_overlap"],
    discriminatesBecause:
      "Whole-customer holdout removes repeated-identity overlap while keeping the estimator fixed.",
    expectedPatterns: [
      {
        hypothesisId: "current",
        qualitativeOutcome: "Group and row accuracy remain similar.",
      },
      {
        hypothesisId: "competing",
        qualitativeOutcome:
          "Group accuracy falls while entity overlap becomes zero.",
      },
    ],
    nonClaims: ["This does not prove performance for every future customer."],
    resourceLimits: { wallSeconds: 45, memoryMb: 512, maxRuns: 4 },
  });
}

function nativeIR() {
  const plan = leakagePlan();
  return {
    schemaVersion: "5" as const,
    irId: "ir-live-1",
    executionPlanId: "plan-live-1",
    sessionId: plan.sessionId,
    concept: plan.concept,
    conceptPackVersion: plan.conceptPackVersion,
    artifactManifestHash: plan.artifactManifestHash,
    beliefSpecId: plan.beliefTestId,
    beliefSpecHash: hash("c"),
    evidenceRefs: plan.evidenceRefs,
    hypotheses: [
      {
        id: "current" as const,
        statement: "Random-row performance generalizes to new customers.",
        conditions: ["Evaluation units match deployment units."],
        nonClaims: ["No claim is made about future distribution shift."],
        predictedPattern: {
          patternId: "leakage.small_optimism_gap",
          description: "Group and row accuracy remain similar.",
        },
      },
      {
        id: "competing" as const,
        statement: "Repeated identity inflates random-row performance.",
        conditions: ["Customers repeat across observations."],
        nonClaims: ["Identity leakage is not claimed for every notebook."],
        predictedPattern: {
          patternId: "leakage.material_optimism_gap",
          description: "Group accuracy falls with zero entity overlap.",
        },
      },
    ],
    candidateExperiments: [
      {
        id: "whole-entity-holdout",
        title: "Hold out whole customers",
        operationIds: [
          "leakage.random_row_split" as const,
          "leakage.group_holdout" as const,
          "leakage.entity_overlap" as const,
        ],
        baseline: plan.baseline,
        interventions: [plan.interventions[0]!],
        heldConstantIds: ["model", "seed", "test_fraction"],
        changedVariableIds: ["split_strategy"],
        observableIds: ["accuracy" as const, "entity_overlap_rate" as const],
        hypothesisPatterns: [
          {
            hypothesisId: "current" as const,
            patternId: "leakage.small_optimism_gap",
          },
          {
            hypothesisId: "competing" as const,
            patternId: "leakage.material_optimism_gap",
          },
        ],
        inconclusiveConditionIds: ["leakage.gap_within_tolerance"],
        complexityCost: 2,
        discriminatesBecause:
          "Only the deployment-unit boundary changes while entity overlap is measured.",
      },
    ],
    selection: { status: "UNSELECTED" as const },
    visualizations: ["metric_comparison" as const, "entity_overlap" as const],
    inconclusiveConditions: [
      {
        id: "leakage.gap_within_tolerance",
        description:
          "The measured gap is too small to separate the hypotheses.",
      },
    ],
    boundarySweep: {
      sweepId: "leakage.recurrence_identity_grid",
      axisIds: ["entity_recurrence", "identity_signal_strength"] as const,
      gridPresetId: "leakage.boundary.small-v1",
      observableId: "accuracy",
      maxCells: 225,
    },
    transfer: {
      taskId: "forecast-future-leakage-v1",
      changedSurface: "Time-ordered forecasting with future-looking features.",
      requiredActionIds: ["time_ordered_holdout", "remove_future_feature"],
      nonClaims: ["Transfer does not certify global mastery."],
    },
    nonClaims: plan.nonClaims,
    provenance: {
      kind: "codex" as const,
      generatorId: "codex-app-server",
      promptHash: hash("d"),
      inputHashes: [hash("a"), hash("c")],
    },
    limitations: ["The result is scoped to the registered fixture family."],
    resourceLimits: plan.resourceLimits,
  };
}

describe("Experiment IR v5", () => {
  it("accepts only strict operation-based candidates", () => {
    const parsed = ExperimentIRV5Schema.parse(nativeIR());
    expect(parsed.schemaVersion).toBe("5");
    expect(parsed.selection.status).toBe("UNSELECTED");
    expect(() =>
      ExperimentIRV5Schema.parse({ ...nativeIR(), result: 0.99 }),
    ).toThrow();
    expect(
      ExperimentIRV5Schema.parse({
        ...nativeIR(),
        boundarySweep: {
          ...nativeIR().boundarySweep,
          observableId: "optimism_gap",
        },
      }).boundarySweep?.observableId,
    ).toBe("optimism_gap");
    expect(() =>
      ExperimentIRV5Schema.parse({
        ...nativeIR(),
        candidateExperiments: [
          {
            ...nativeIR().candidateExperiments[0],
            operationIds: ["leakage.execute_python"],
          },
        ],
      }),
    ).toThrow(/operation/i);
  });

  it("rejects duplicate candidates and unresolved fixed selections", () => {
    const source = nativeIR();
    expect(() =>
      ExperimentIRV5Schema.parse({
        ...source,
        candidateExperiments: [
          source.candidateExperiments[0],
          source.candidateExperiments[0],
        ],
      }),
    ).toThrow(/duplicate candidate/i);
    expect(() =>
      ExperimentIRV5Schema.parse({
        ...source,
        selection: {
          status: "SELECTED",
          candidateId: "missing-candidate",
          eligibleCandidateIds: ["missing-candidate"],
          rejectedCandidates: [],
          minimumSeparation: 0.7,
          requiredSeparation: 0.4,
          complexityCost: 2,
          normalizedScore: 0.8,
          scorerVersion: "experiment-scorer-v1",
        },
      }),
    ).toThrow(/candidate/i);
  });

  it("rejects executable source, commands, SQL, URLs, and raw paths", () => {
    for (const forbidden of [
      "import os; os.system('id')",
      "curl https://example.invalid/result",
      "SELECT secret FROM hidden_results",
      "Read /etc/passwd before deciding",
      "eval(user_expression)",
      "outcome = (x * 2) + y",
    ]) {
      const candidate = {
        ...nativeIR(),
        limitations: [forbidden],
      };
      const findings = validateExperimentIRPolicy(candidate);
      expect(findings, forbidden).not.toHaveLength(0);
      expect(() => ExperimentIRV5Schema.parse(candidate)).not.toThrow();
      expect(() => canonicalizeExperimentIR(candidate)).toThrowError(
        ExperimentIRPolicyError,
      );
    }
  });

  it("allows hash-bound notebook code evidence without treating it as IR authority", () => {
    const source = nativeIR();
    const evidenceOnlyCode = {
      ...source,
      evidenceRefs: [
        {
          ...source.evidenceRefs[0],
          excerpt: "accuracy = accuracy_score(y_test, prediction)",
        },
      ],
    };

    expect(validateExperimentIRPolicy(evidenceOnlyCode)).toEqual([]);
  });

  it("canonicalizes key order and produces a stable SHA-256", async () => {
    const left = nativeIR();
    const right = JSON.parse(JSON.stringify(left)) as Record<string, unknown>;
    const reordered = Object.fromEntries(Object.entries(right).reverse());

    expect(canonicalizeExperimentIR(left)).toBe(
      canonicalizeExperimentIR(reordered),
    );
    expect(await hashExperimentIR(left)).toMatch(/^[a-f0-9]{64}$/);
    expect(await hashExperimentIR(left)).toBe(
      await hashExperimentIR(reordered),
    );
  });

  it("preserves Unicode normalization so Python and Worker hash the same IR", () => {
    const decomposed = "e\u0301";
    const ir = {
      ...nativeIR(),
      limitations: [decomposed],
    };

    expect(canonicalizeExperimentIR(ir)).toContain(JSON.stringify(decomposed));
    expect(canonicalizeExperimentIR(ir)).not.toContain(JSON.stringify("é"));
  });

  it("adapts legacy Plan v2 without changing execution semantics", async () => {
    const plan = leakagePlan();
    const sourcePlanHash = hash("e");
    const ir = migrateExperimentPlanV2ToIRV5(plan, {
      beliefSpecHash: hash("c"),
      sourcePlanHash,
      transfer: {
        taskId: "forecast-future-leakage-v1",
        changedSurface: "Time-ordered forecasting.",
        requiredActionIds: ["time_ordered_holdout"],
        nonClaims: ["Legacy migration does not add new evidence authority."],
      },
    });

    expect(ir.selection).toMatchObject({
      status: "LEGACY_SELECTED",
      notRescored: true,
    });
    expect(ir.provenance).toMatchObject({
      kind: "legacy_plan_v2",
      sourcePlanHash,
    });
    expect(projectExperimentIRV5ToPlanV2(ir)).toEqual(plan);
    expect(await hashExperimentIR(ir)).toBe(await hashExperimentIR(ir));
  });
});
