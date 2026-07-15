import { describe, expect, it } from "vitest";

import {
  BeliefSpecV2Schema,
  ExperimentPlanV2Schema,
} from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  migrateExperimentPlanV2ToIRV5,
} from "@counterlab/experiment-ir";

import {
  ExperimentScoringError,
  applyExperimentSelection,
  scoreExperiments,
} from "../src/index.js";

const digest = (character: string) => character.repeat(64);

const evidence = {
  cellIndex: 2,
  kind: "code" as const,
  hash: digest("a"),
  excerpt: "train_test_split(X, y)",
  relevance: "The split is row-wise.",
};

function beliefSpec() {
  return BeliefSpecV2Schema.parse({
    schemaVersion: "2",
    id: "belief-1",
    concept: "entity_leakage",
    claim: "The row split proves new-customer generalization.",
    evidenceRefs: [evidence],
    hypotheses: [
      {
        id: "current",
        statement: "Random rows measure new-customer performance.",
        conditions: ["Evaluation units match deployment units."],
        nonClaims: ["No claim is made about distribution shift."],
        evidence: [evidence],
        supportedCandidateExperimentIds: [
          "group-holdout",
          "group-holdout-plus-ablation",
        ],
      },
      {
        id: "competing",
        statement: "Repeated identity inflates random-row performance.",
        conditions: ["Customers repeat across rows."],
        nonClaims: ["Leakage is not claimed for every notebook."],
        evidence: [evidence],
        supportedCandidateExperimentIds: [
          "group-holdout",
          "group-holdout-plus-ablation",
        ],
      },
    ],
    alternatives: [],
    uncertainty: 0.84,
    supportState: "SUPPORTED",
    learnerDecision: "CONFIRMED",
  });
}

function plan() {
  return ExperimentPlanV2Schema.parse({
    schemaVersion: "2",
    planId: "plan-1",
    sessionId: "session-1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: digest("b"),
    beliefTestId: "belief-1",
    evidenceRefs: [evidence],
    baseline: {
      concept: "entity_leakage",
      runId: "random",
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
        runId: "group",
        operation: "leakage.group_holdout",
        seed: 1729,
        testFraction: 0.25,
        entityField: "customer_id",
        dropIdentity: false,
        model: "logistic_regression",
      },
    ],
    controlledVariables: ["model", "seed", "test_fraction"],
    changedVariables: ["split_strategy"],
    metrics: ["accuracy", "entity_overlap_rate"],
    visualizations: ["metric_comparison", "entity_overlap"],
    discriminatesBecause:
      "Whole-customer holdout changes only the evaluation unit.",
    expectedPatterns: [
      {
        hypothesisId: "current",
        qualitativeOutcome: "The optimism gap stays small.",
      },
      {
        hypothesisId: "competing",
        qualitativeOutcome: "The optimism gap becomes material.",
      },
    ],
    nonClaims: ["This does not prove all future performance."],
    resourceLimits: { wallSeconds: 45, memoryMb: 512, maxRuns: 4 },
  });
}

function ir() {
  const migrated = migrateExperimentPlanV2ToIRV5(plan(), {
    beliefSpecHash: digest("c"),
    sourcePlanHash: digest("d"),
    transfer: {
      taskId: "forecast-future-leakage-v1",
      changedSurface: "Time-ordered forecasting.",
      requiredActionIds: ["time_ordered_holdout"],
      nonClaims: ["Transfer does not certify mastery."],
    },
  });
  const base = migrated.candidateExperiments[0]!;
  const cheaper = {
    ...base,
    id: "group-holdout",
    heldConstantIds: ["model", "seed", "test_fraction"],
    changedVariableIds: ["split_strategy"],
    hypothesisPatterns: [
      {
        hypothesisId: "current" as const,
        patternId: "leakage.small-gap",
      },
      {
        hypothesisId: "competing" as const,
        patternId: "leakage.material-gap",
      },
    ] as const,
    complexityCost: 2,
  };
  const expensive = {
    ...cheaper,
    id: "group-holdout-plus-ablation",
    operationIds: [
      ...cheaper.operationIds,
      "leakage.identity_ablation" as const,
    ],
    interventions: [
      ...cheaper.interventions,
      {
        ...cheaper.interventions[0]!,
        runId: "ablation",
        operation: "leakage.identity_ablation" as const,
        dropIdentity: true,
      },
    ],
    complexityCost: 5,
  };

  return ExperimentIRV5Schema.parse({
    ...migrated,
    hypotheses: [
      {
        ...migrated.hypotheses[0],
        predictedPattern: {
          patternId: "leakage.small-gap",
          description: "The optimism gap stays small.",
        },
      },
      {
        ...migrated.hypotheses[1],
        predictedPattern: {
          patternId: "leakage.material-gap",
          description: "The optimism gap becomes material.",
        },
      },
    ],
    candidateExperiments: [expensive, cheaper],
    selection: { status: "UNSELECTED" },
    provenance: {
      kind: "fixed",
      generatorId: "test-fixture-v1",
      inputHashes: [digest("b"), digest("c")],
    },
    limitations: ["Test fixture only."],
  });
}

const policy = {
  schemaVersion: "1" as const,
  policyVersion: "leakage-selection-v1",
  concept: "entity_leakage" as const,
  allowedOperationIds: [
    "leakage.random_row_split" as const,
    "leakage.group_holdout" as const,
    "leakage.identity_ablation" as const,
    "leakage.entity_overlap" as const,
  ],
  requiredOperationIds: ["leakage.group_holdout" as const],
  requiredControlIds: ["model", "seed", "test_fraction"],
  allowedChangedVariableIds: ["split_strategy", "identity_feature"],
  requiredObservableIds: ["accuracy" as const, "entity_overlap_rate" as const],
  allowedObservableIds: [
    "accuracy" as const,
    "roc_auc" as const,
    "entity_overlap_rate" as const,
  ],
  patternSeparations: [
    {
      currentPatternId: "leakage.small-gap",
      competingPatternId: "leakage.material-gap",
      separation: 0.82,
    },
  ],
  minimumSeparation: 0.4,
  maximumComplexityCost: 10,
  complexityWeight: 0.15,
  scorerVersion: "experiment-scorer-v1",
};

describe("fixed experiment scorer", () => {
  it("selects the least costly decisive candidate independently of input order", () => {
    const source = ir();
    const selected = scoreExperiments({
      beliefSpec: beliefSpec(),
      beliefSpecHash: digest("c"),
      ir: source,
      policy,
    });
    const reversed = scoreExperiments({
      beliefSpec: beliefSpec(),
      beliefSpecHash: digest("c"),
      ir: {
        ...source,
        candidateExperiments: [...source.candidateExperiments].reverse(),
      },
      policy,
    });

    expect(selected).toMatchObject({
      eligibleCandidateIds: ["group-holdout", "group-holdout-plus-ablation"],
      selectedCandidateId: "group-holdout",
      minimumSeparation: 0.82,
      requiredSeparation: 0.4,
      complexityCost: 2,
      scorerVersion: "experiment-scorer-v1",
    });
    expect(reversed).toEqual(selected);
    expect(applyExperimentSelection(source, selected).selection).toMatchObject({
      status: "SELECTED",
      candidateId: "group-holdout",
    });
  });

  it("rejects missing controls and uncontrolled changes with public reason codes", () => {
    const source = ir();
    const broken = {
      ...source,
      candidateExperiments: source.candidateExperiments.map((candidate) => ({
        ...candidate,
        heldConstantIds: ["model", "seed"],
        changedVariableIds: ["preprocessing"],
      })),
    };

    const result = scoreExperiments({
      beliefSpec: beliefSpec(),
      beliefSpecHash: digest("c"),
      ir: broken,
      policy,
    });

    expect(result.selectedCandidateId).toBeNull();
    expect(result.rejectedCandidates).toEqual([
      {
        candidateId: "group-holdout",
        reasonCodes: [
          "MISSING_REQUIRED_CONTROL",
          "UNCONTROLLED_VARIABLE_CHANGE",
        ],
      },
      {
        candidateId: "group-holdout-plus-ablation",
        reasonCodes: [
          "MISSING_REQUIRED_CONTROL",
          "UNCONTROLLED_VARIABLE_CHANGE",
        ],
      },
    ]);
  });

  it("rejects missing required operations and observables plus unapproved operations", () => {
    const source = ir();
    const candidate = source.candidateExperiments[0]!;
    const identityRun = {
      ...candidate.interventions[0]!,
      operation: "leakage.identity_ablation" as const,
      dropIdentity: true,
    };
    const broken = {
      ...source,
      candidateExperiments: [
        {
          ...candidate,
          id: "group-holdout",
          operationIds: [
            "leakage.random_row_split" as const,
            "leakage.identity_ablation" as const,
            "leakage.controlled_comparison" as const,
          ],
          interventions: [identityRun],
          observableIds: ["accuracy" as const],
        },
      ],
    };

    expect(
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("c"),
        ir: broken,
        policy,
      }).rejectedCandidates,
    ).toEqual([
      {
        candidateId: "group-holdout",
        reasonCodes: [
          "UNKNOWN_OPERATION",
          "MISSING_REQUIRED_OPERATION",
          "MISSING_REQUIRED_OBSERVABLE",
        ],
      },
    ]);
  });

  it("uses deterministic ID tie-breaking after complexity", () => {
    const source = ir();
    const tied = {
      ...source,
      candidateExperiments: source.candidateExperiments.map((candidate) => ({
        ...candidate,
        complexityCost: 2,
      })),
    };
    const retuned = {
      ...source,
      candidateExperiments: source.candidateExperiments.map((candidate) => ({
        ...candidate,
        complexityCost: candidate.id === "group-holdout-plus-ablation" ? 3 : 7,
      })),
    };

    expect(
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("c"),
        ir: tied,
        policy,
      }).selectedCandidateId,
    ).toBe("group-holdout");
    expect(
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("c"),
        ir: retuned,
        policy,
      }).selectedCandidateId,
    ).toBe("group-holdout-plus-ablation");
  });

  it("rejects swapped or insufficiently separated hypothesis patterns", () => {
    const source = ir();
    const swapped = {
      ...source,
      candidateExperiments: source.candidateExperiments.map((candidate) => ({
        ...candidate,
        hypothesisPatterns: [
          {
            ...candidate.hypothesisPatterns[0],
            patternId: candidate.hypothesisPatterns[1].patternId,
          },
          {
            ...candidate.hypothesisPatterns[1],
            patternId: candidate.hypothesisPatterns[0].patternId,
          },
        ],
      })),
    };
    const weakPolicy = {
      ...policy,
      patternSeparations: [
        {
          currentPatternId: "leakage.small-gap",
          competingPatternId: "leakage.material-gap",
          separation: 0.2,
        },
      ],
    };

    expect(
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("c"),
        ir: swapped,
        policy,
      }).rejectedCandidates.every(({ reasonCodes }) =>
        reasonCodes.includes("UNRECOGNIZED_PATTERN_PAIR"),
      ),
    ).toBe(true);
    expect(
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("c"),
        ir: source,
        policy: weakPolicy,
      }).rejectedCandidates.every(({ reasonCodes }) =>
        reasonCodes.includes("INSUFFICIENT_PATTERN_SEPARATION"),
      ),
    ).toBe(true);
  });

  it("refuses unapproved beliefs, mismatched hashes, and duplicate candidates", () => {
    const source = ir();
    expect(() =>
      scoreExperiments({
        beliefSpec: {
          ...beliefSpec(),
          learnerDecision: "UNDECIDED",
        },
        beliefSpecHash: digest("c"),
        ir: source,
        policy,
      }),
    ).toThrowError(ExperimentScoringError);
    expect(() =>
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("f"),
        ir: source,
        policy,
      }),
    ).toThrow(/hash/i);
    expect(() =>
      scoreExperiments({
        beliefSpec: beliefSpec(),
        beliefSpecHash: digest("c"),
        ir: {
          ...source,
          candidateExperiments: [
            source.candidateExperiments[0],
            source.candidateExperiments[0],
          ],
        },
        policy,
      }),
    ).toThrow(/duplicate candidate/i);
  });
});
