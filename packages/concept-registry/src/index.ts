import type {
  AllowedMetric,
  AllowedVisualization,
  ArtifactManifest,
  ConceptId,
  ConceptRoutingDecision,
  EpistemicOutcomeV1,
  EpistemicVerifierPolicyV1,
  EvidenceRef,
  FixedOperationId,
  HostedVerifiedResultSetV2,
  PatchOperationId,
} from "@counterlab/contracts";
import { EpistemicVerifierPolicyV1Schema } from "@counterlab/contracts";
import type { CandidateExperiment } from "@counterlab/experiment-ir";
import {
  ExperimentScoringPolicySchema,
  type ExperimentScoringPolicy,
} from "@counterlab/experiment-scorer";

export type { ConceptId, ConceptRoutingDecision } from "@counterlab/contracts";

export type SupportDetection = {
  supported: boolean;
  confidence: number;
  evidence: EvidenceRef[];
  limitations: string[];
};

export type SupportDetector = (manifest: ArtifactManifest) => SupportDetection;

export type EpistemicControlValues = {
  controlId: string;
  values: unknown[];
};

export interface SubjectPackEpistemicAdapter {
  policy: EpistemicVerifierPolicyV1;
  classifyOutcome(result: HostedVerifiedResultSetV2): EpistemicOutcomeV1;
  resolveControlValues(
    candidate: CandidateExperiment,
    result: HostedVerifiedResultSetV2,
  ): EpistemicControlValues[];
  resolveObservablePath(
    observableId: AllowedMetric,
    result: HostedVerifiedResultSetV2,
  ): string | undefined;
}

export type FixedResultAuthority =
  | {
      concept: "entity_leakage";
      kernelVersion: string;
      fixture: {
        sha256: string;
        rows: number;
        customers: number;
        targetRate: number;
      };
    }
  | {
      concept: "class_imbalance";
      kernelVersion: string;
      fixture: {
        sha256: string;
        rows: number;
        positives: number;
        prevalence: number;
      };
    };

export interface ConceptPackDefinition {
  id: ConceptId;
  version: string;
  releaseStatus: "released" | "development";
  title: string;
  learnerQuestion: string;
  fixedFixture: {
    id: "public-leakage-v1" | "public-imbalance-v1";
    version: string;
    contentSha256: string;
  };
  fixedResultAuthority: FixedResultAuthority;
  supportDetector: SupportDetector;
  analystRules: {
    stableInstructions: readonly string[];
    requiredEvidenceKinds: readonly EvidenceRef["kind"][];
  };
  allowedOperations: readonly FixedOperationId[];
  allowedMetrics: readonly AllowedMetric[];
  allowedVisualizations: readonly AllowedVisualization[];
  experimentPlanRules: readonly string[];
  scientificMethod: {
    candidateExperimentIds: readonly string[];
    scoringPolicy: ExperimentScoringPolicy;
    epistemic: SubjectPackEpistemicAdapter;
    defaultPresentation: {
      scope: string;
      learnerFacingClaims: readonly string[];
    };
  };
  verifierContract: {
    id: string;
    invariants: readonly string[];
  };
  transferTask: {
    id: string;
    evaluatorTaskId:
      | "forecasting-future-leakage-01"
      | "manufacturing-defect-transfer-01";
    title: string;
  };
  patchContract: {
    id: string;
    allowedTransformations: readonly PatchOperationId[];
  };
  approvedClaims: readonly string[];
  forbiddenClaims: readonly string[];
}

const leakageScoringPolicy = ExperimentScoringPolicySchema.parse({
  schemaVersion: "1",
  policyVersion: "leakage-selection-v1",
  concept: "entity_leakage",
  allowedOperationIds: [
    "leakage.random_row_split",
    "leakage.group_holdout",
    "leakage.identity_ablation",
    "leakage.entity_overlap",
    "leakage.controlled_comparison",
  ],
  requiredOperationIds: [
    "leakage.random_row_split",
    "leakage.group_holdout",
    "leakage.identity_ablation",
  ],
  requiredControlIds: [
    "model",
    "seed",
    "test_fraction",
    "entity_field",
    "primary_identity_setting",
    "preprocessing",
    "model_hyperparameters",
  ],
  allowedChangedVariableIds: ["split_strategy", "identity_feature"],
  requiredObservableIds: ["accuracy", "entity_overlap_rate"],
  allowedObservableIds: ["accuracy", "roc_auc", "entity_overlap_rate"],
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
});

const imbalanceScoringPolicy = ExperimentScoringPolicySchema.parse({
  schemaVersion: "1",
  policyVersion: "imbalance-selection-v1",
  concept: "class_imbalance",
  allowedOperationIds: [
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.confusion_matrix",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
  ],
  requiredOperationIds: [
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
  ],
  requiredControlIds: ["model_scores", "seed", "evaluation_set"],
  allowedChangedVariableIds: ["decision_threshold", "class_prevalence"],
  requiredObservableIds: ["recall", "confusion_matrix", "prevalence"],
  allowedObservableIds: [
    "accuracy",
    "precision",
    "recall",
    "f1",
    "pr_auc",
    "roc_auc",
    "confusion_matrix",
    "prevalence",
  ],
  patternSeparations: [
    {
      currentPatternId: "imbalance.useful-minority-detection",
      competingPatternId: "imbalance.majority-dominance",
      separation: 0.85,
    },
  ],
  minimumSeparation: 0.45,
  maximumComplexityCost: 12,
  complexityWeight: 0.15,
  scorerVersion: "experiment-scorer-v1",
});

const leakageApprovedClaims = [
  "This verified run measures the documented public fixture under the selected entity boundary.",
  "Zero entity overlap was verified for the group holdout run.",
] as const;
const leakageForbiddenClaims = [
  "This proves performance for every future customer.",
  "This proves the learner has mastered leakage.",
] as const;

const leakageEpistemicPolicy = EpistemicVerifierPolicyV1Schema.parse({
  schemaVersion: "1",
  policyVersion: "leakage-epistemic-policy-v1",
  verifierVersion: "epistemic-verifier-v1",
  classifierId: "leakage-outcome-classifier-v1",
  concept: "entity_leakage",
  allowedScopes: ["unseen customers in the documented fixture"],
  observableResultPathPrefixes: [
    { observableId: "accuracy", prefixes: ["/runs"] },
    { observableId: "roc_auc", prefixes: ["/runs"] },
    { observableId: "entity_overlap_rate", prefixes: ["/runs"] },
  ],
  boundarySweeps: [
    {
      sweepId: "leakage-recurrence-sweep",
      axisIds: ["entity_recurrence", "identity_signal_strength"],
      gridPresetId: "leakage-boundary-grid-v1",
      observableId: "accuracy",
      maxCells: 625,
      resultPathPrefix: "/boundaryMaps/leakage_recurrence",
    },
  ],
  approvedClaims: leakageApprovedClaims,
  forbiddenClaims: leakageForbiddenClaims,
});

const imbalanceApprovedClaims = [
  "This verified run reports class-specific performance for the documented fixture, split, threshold, and prevalence.",
  "The fixed majority baseline and confusion-matrix totals were verified for this run.",
] as const;
const imbalanceForbiddenClaims = [
  "High accuracy alone proves the rare class is detected well.",
  "This threshold is optimal for every deployment prevalence or cost tradeoff.",
  "This proves the learner has mastered class imbalance.",
] as const;

const imbalanceEpistemicPolicy = EpistemicVerifierPolicyV1Schema.parse({
  schemaVersion: "1",
  policyVersion: "imbalance-epistemic-policy-v1",
  verifierVersion: "epistemic-verifier-v1",
  classifierId: "imbalance-outcome-classifier-v1",
  concept: "class_imbalance",
  allowedScopes: ["rare-event detection in the documented fixture"],
  observableResultPathPrefixes: [
    { observableId: "accuracy", prefixes: ["/runs"] },
    { observableId: "precision", prefixes: ["/runs"] },
    { observableId: "recall", prefixes: ["/runs"] },
    { observableId: "f1", prefixes: ["/runs"] },
    { observableId: "pr_auc", prefixes: ["/runs"] },
    { observableId: "roc_auc", prefixes: ["/runs"] },
    { observableId: "confusion_matrix", prefixes: ["/runs"] },
    { observableId: "prevalence", prefixes: ["/runs"] },
  ],
  boundarySweeps: [
    {
      sweepId: "imbalance-threshold-prevalence-sweep",
      axisIds: ["class_prevalence", "decision_threshold"],
      gridPresetId: "imbalance-boundary-grid-v1",
      observableId: "recall",
      maxCells: 625,
      resultPathPrefix: "/boundaryMaps/threshold_prevalence",
    },
  ],
  approvedClaims: imbalanceApprovedClaims,
  forbiddenClaims: imbalanceForbiddenClaims,
});

function classifyLeakageOutcome(
  result: HostedVerifiedResultSetV2,
): EpistemicOutcomeV1 {
  if (result.concept !== "entity_leakage") return { kind: "UNRESOLVED" };
  const baseline = result.runs.find(
    (run) => run.operation === "leakage.random_row_split",
  );
  const group = result.runs.find(
    (run) => run.operation === "leakage.group_holdout",
  );
  if (
    baseline === undefined ||
    group === undefined ||
    group.entityOverlap.count !== 0 ||
    group.entityOverlap.rate !== 0
  ) {
    return { kind: "UNRESOLVED" };
  }
  const optimismGap = baseline.metrics.accuracy - group.metrics.accuracy;
  if (optimismGap < -0.02) return { kind: "UNRESOLVED" };
  if (optimismGap >= 0.1) {
    return {
      kind: "HYPOTHESIS_PATTERN",
      hypothesisId: "competing",
      patternId: "leakage.material-gap",
    };
  }
  if (optimismGap <= 0.03) {
    return {
      kind: "HYPOTHESIS_PATTERN",
      hypothesisId: "current",
      patternId: "leakage.small-gap",
    };
  }
  return {
    kind: "INCONCLUSIVE",
    conditionId: "gap-within-tolerance",
    nextExperimentId: "group-holdout-plus-ablation",
  };
}

function classifyImbalanceOutcome(
  result: HostedVerifiedResultSetV2,
): EpistemicOutcomeV1 {
  if (result.concept !== "class_imbalance") return { kind: "UNRESOLVED" };
  const majority = result.runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const evaluated = result.runs.find(
    (run) => run.operation === "imbalance.stratified_holdout",
  );
  if (majority === undefined || evaluated === undefined) {
    return { kind: "UNRESOLVED" };
  }
  if (evaluated.metrics.recall >= 0.5 && evaluated.metrics.f1 >= 0.35) {
    return {
      kind: "HYPOTHESIS_PATTERN",
      hypothesisId: "current",
      patternId: "imbalance.useful-minority-detection",
    };
  }
  if (evaluated.metrics.recall <= 0.2) {
    return {
      kind: "HYPOTHESIS_PATTERN",
      hypothesisId: "competing",
      patternId: "imbalance.majority-dominance",
    };
  }
  return {
    kind: "INCONCLUSIVE",
    conditionId: "minority-utility-uncertain",
    nextExperimentId: "prevalence-and-threshold-sweep",
  };
}

function leakageControlValues(
  candidate: CandidateExperiment,
  result: HostedVerifiedResultSetV2,
): EpistemicControlValues[] {
  const runs = [candidate.baseline, ...candidate.interventions];
  const primaryRuns = runs.filter(
    (run) => run.operation !== "leakage.identity_ablation",
  );
  const resultRuns =
    result.concept === "entity_leakage"
      ? new Map(result.runs.map((run) => [run.id, run]))
      : new Map();
  return candidate.heldConstantIds.map((controlId) => ({
    controlId,
    values: (controlId === "primary_identity_setting" ? primaryRuns : runs).map(
      (run) => {
        if (run.concept !== "entity_leakage") return undefined;
        if (controlId === "model") return run.model;
        if (controlId === "seed") return run.seed;
        if (controlId === "test_fraction") return run.testFraction;
        if (controlId === "entity_field") return run.entityField;
        if (controlId === "primary_identity_setting") return run.dropIdentity;
        if (
          controlId === "preprocessing" ||
          controlId === "model_hyperparameters"
        )
          return resultRuns.get(run.runId)?.pipelineFingerprint;
        return undefined;
      },
    ),
  }));
}

function imbalanceControlValues(
  candidate: CandidateExperiment,
  result: HostedVerifiedResultSetV2,
): EpistemicControlValues[] {
  const runs = [candidate.baseline, ...candidate.interventions];
  const thresholdComparisonRuns =
    result.concept === "class_imbalance"
      ? result.runs.filter((run) =>
          [
            "imbalance.stratified_holdout",
            "imbalance.threshold_sweep",
          ].includes(run.operation),
        )
      : [];
  return candidate.heldConstantIds.map((controlId) => ({
    controlId,
    values:
      controlId === "seed"
        ? runs.map((run) => run.seed)
        : result.concept !== "class_imbalance"
          ? []
          : thresholdComparisonRuns.map((run) => {
              if (controlId === "model_scores") return run.scoreFingerprint;
              if (controlId === "evaluation_set")
                return run.evaluationSetFingerprint;
              return undefined;
            }),
  }));
}

function leakageObservablePath(
  observableId: AllowedMetric,
  result: HostedVerifiedResultSetV2,
): string | undefined {
  if (result.concept !== "entity_leakage") return undefined;
  const runIndices = result.runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => run.operation === "leakage.group_holdout")
    .map(({ index }) => index);
  if (runIndices.length !== 1) return undefined;
  const runIndex = runIndices[0]!;
  if (observableId === "accuracy") {
    return `/runs/${runIndex}/metrics/accuracy`;
  }
  if (observableId === "roc_auc") {
    return `/runs/${runIndex}/metrics/rocAuc`;
  }
  if (observableId === "entity_overlap_rate") {
    return `/runs/${runIndex}/entityOverlap/rate`;
  }
  return undefined;
}

function imbalanceObservablePath(
  observableId: AllowedMetric,
  result: HostedVerifiedResultSetV2,
): string | undefined {
  if (result.concept !== "class_imbalance") return undefined;
  const operation =
    observableId === "prevalence"
      ? "imbalance.prevalence_sweep"
      : "imbalance.stratified_holdout";
  const runIndices = result.runs
    .map((run, index) => ({ run, index }))
    .filter(({ run }) => run.operation === operation)
    .map(({ index }) => index);
  if (runIndices.length !== 1) return undefined;
  const runIndex = runIndices[0]!;
  const metricFields: Partial<Record<AllowedMetric, string>> = {
    accuracy: "accuracy",
    precision: "precision",
    recall: "recall",
    f1: "f1",
    pr_auc: "prAuc",
    roc_auc: "rocAuc",
  };
  const field = metricFields[observableId];
  if (field !== undefined) return `/runs/${runIndex}/metrics/${field}`;
  if (observableId === "confusion_matrix") {
    return `/runs/${runIndex}/confusionMatrix`;
  }
  if (observableId === "prevalence") {
    return `/runs/${runIndex}/prevalence`;
  }
  return undefined;
}

function leakageSupport(manifest: ArtifactManifest): SupportDetection {
  const splitCell = manifest.cells.find(
    (cell) =>
      cell.symbols.some((symbol) =>
        ["train_test_split", "GroupShuffleSplit"].includes(symbol),
      ) || /train_test_split|GroupShuffleSplit/u.test(cell.sourceExcerpt),
  );
  const metricCell = manifest.cells.find(
    (cell) => cell.metricCandidates.length > 0 && cell.outputHashes.length > 0,
  );
  const hasEntity = manifest.schemaSummary.entityCandidates.length > 0;
  const hasTarget = manifest.schemaSummary.targetCandidates.length > 0;
  const evidence: EvidenceRef[] = [];
  if (splitCell !== undefined) {
    evidence.push({
      cellIndex: splitCell.index,
      kind: "code",
      hash: splitCell.sourceSha256,
      excerpt: splitCell.sourceExcerpt.slice(0, 240),
      relevance: "This cell defines the notebook's evaluation split.",
    });
  }
  if (metricCell !== undefined) {
    const metric = metricCell.metricCandidates[0];
    if (metric !== undefined) {
      const outputHash = metricCell.outputHashes[metric.outputIndex];
      if (outputHash !== undefined) {
        evidence.push({
          cellIndex: metricCell.index,
          outputIndex: metric.outputIndex,
          kind: "metric",
          hash: outputHash,
          excerpt: `${metric.name}: ${metric.value}`,
          relevance: "This is the displayed result interpreted by the learner.",
        });
      }
    }
  }
  const limitations = [
    ...(hasEntity ? [] : ["No entity boundary is identified in the schema."]),
    ...(hasTarget ? [] : ["No prediction target is identified in the schema."]),
    ...(splitCell === undefined
      ? ["No supported evaluation split is visible in notebook evidence."]
      : []),
    ...(metricCell === undefined
      ? ["No safe displayed metric is available as claim evidence."]
      : []),
  ];
  return {
    supported:
      hasEntity &&
      hasTarget &&
      splitCell !== undefined &&
      metricCell !== undefined,
    confidence:
      hasEntity &&
      hasTarget &&
      splitCell !== undefined &&
      metricCell !== undefined
        ? 0.94
        : hasEntity && hasTarget
          ? 0.55
          : 0,
    evidence: evidence.slice(0, 3),
    limitations,
  };
}

const RARE_EVENT_SIGNAL =
  /class[_\s-]?weight|class[_\s-]?imbalanc|rare[_\s-]?event|minority[_\s-]?class|DummyClassifier|most_frequent/iu;
const CLASS_SPECIFIC_SIGNAL =
  /average_precision|precision_recall|classification_report|confusion_matrix|value_counts|predict_proba/iu;
const PREVALENCE_METRIC =
  /prevalence|positive[_\s-]?rate|minority[_\s-]?rate|target[_\s-]?rate/iu;
const RARE_EVENT_LANGUAGE =
  /\brare\b|\buncommon\b|minority[_\s-]?(?:class|failures?)|positive class.{0,40}(?:rare|uncommon)/iu;

function metricEvidence(
  cell: ArtifactManifest["cells"][number],
  metric: ArtifactManifest["cells"][number]["metricCandidates"][number],
  relevance: string,
): EvidenceRef | undefined {
  const outputHash = cell.outputHashes[metric.outputIndex];
  if (outputHash === undefined) return undefined;
  return {
    cellIndex: cell.index,
    outputIndex: metric.outputIndex,
    kind: "metric",
    hash: outputHash,
    excerpt: `${metric.name}: ${metric.value}`,
    relevance,
  };
}

function imbalanceSupport(manifest: ArtifactManifest): SupportDetection {
  const splitCell = manifest.cells.find(
    (cell) =>
      cell.symbols.includes("train_test_split") ||
      /train_test_split/iu.test(cell.sourceExcerpt),
  );
  const signalText = (cell: ArtifactManifest["cells"][number]) =>
    `${cell.sourceExcerpt}\n${cell.symbols.join("\n")}`;
  const rareEventCell = manifest.cells.find((cell) =>
    RARE_EVENT_SIGNAL.test(signalText(cell)),
  );
  const signalCell =
    rareEventCell ??
    manifest.cells.find(
      (cell) =>
        cell.type === "code" && CLASS_SPECIFIC_SIGNAL.test(signalText(cell)),
    );
  const metricCells = manifest.cells.filter(
    (cell) => cell.metricCandidates.length > 0 && cell.outputHashes.length > 0,
  );
  const headline = metricCells
    .flatMap((cell) =>
      cell.metricCandidates.map((metric) => ({ cell, metric })),
    )
    .find(({ metric }) => /accuracy/iu.test(metric.name));
  const classSpecificMetric = metricCells
    .flatMap((cell) =>
      cell.metricCandidates.map((metric) => ({ cell, metric })),
    )
    .find(({ metric }) =>
      /^(?:precision|recall|f1(?:_score)?|pr[_\s-]?auc|average_precision)$/iu.test(
        metric.name,
      ),
    );
  const displayedMetric = headline ?? classSpecificMetric;
  const prevalence = metricCells
    .flatMap((cell) =>
      cell.metricCandidates.map((metric) => ({ cell, metric })),
    )
    .find(
      ({ metric }) =>
        PREVALENCE_METRIC.test(metric.name) &&
        metric.value > 0 &&
        metric.value < 1 &&
        Math.min(metric.value, 1 - metric.value) <= 0.2,
    );
  const hasTarget = manifest.schemaSummary.targetCandidates.length > 0;
  const hasExplicitRareLanguage = manifest.cells.some((cell) =>
    RARE_EVENT_LANGUAGE.test(cell.sourceExcerpt),
  );
  const hasRareEventEvidence =
    prevalence !== undefined ||
    rareEventCell !== undefined ||
    (hasExplicitRareLanguage && classSpecificMetric !== undefined);
  const evidence: EvidenceRef[] = [];

  if (signalCell !== undefined) {
    evidence.push({
      cellIndex: signalCell.index,
      kind: "code",
      hash: signalCell.sourceSha256,
      excerpt: signalCell.sourceExcerpt.slice(0, 240),
      relevance:
        "This cell contains class-specific or rare-event evaluation evidence.",
    });
  }
  if (prevalence !== undefined) {
    const reference = metricEvidence(
      prevalence.cell,
      prevalence.metric,
      "The displayed target prevalence establishes a rare class.",
    );
    if (reference !== undefined) evidence.push(reference);
  }
  if (displayedMetric !== undefined) {
    const reference = metricEvidence(
      displayedMetric.cell,
      displayedMetric.metric,
      headline === undefined
        ? "This is a displayed class-specific result relevant to the learner's claim."
        : "This is the aggregate result interpreted by the learner.",
    );
    if (
      reference !== undefined &&
      !evidence.some((candidate) => candidate.hash === reference.hash)
    ) {
      evidence.push(reference);
    }
  }

  const limitations = [
    ...(hasTarget ? [] : ["No prediction target is identified in the schema."]),
    ...(splitCell === undefined
      ? ["No supported evaluation split is visible in notebook evidence."]
      : []),
    ...(displayedMetric === undefined
      ? [
          "No displayed supported classification metric is available as claim evidence.",
        ]
      : []),
    ...(prevalence === undefined && hasRareEventEvidence
      ? [
          "No numeric prevalence candidate resolves; rarity is supported only by explicit notebook evaluation context.",
        ]
      : []),
    ...(hasRareEventEvidence
      ? []
      : [
          "Accuracy alone does not establish class imbalance; rare-event prevalence or class-specific evidence is required.",
        ]),
  ];
  const supported =
    hasTarget &&
    splitCell !== undefined &&
    displayedMetric !== undefined &&
    hasRareEventEvidence;
  return {
    supported,
    confidence: supported
      ? prevalence !== undefined && signalCell !== undefined
        ? 0.92
        : 0.86
      : hasTarget && splitCell !== undefined && displayedMetric !== undefined
        ? 0.56
        : hasTarget && hasRareEventEvidence
          ? 0.42
          : 0,
    evidence: evidence.slice(0, 3),
    limitations,
  };
}

const leakagePack = deepFreeze({
  id: "entity_leakage",
  version: "2.0.0",
  releaseStatus: "released",
  title: "Entity leakage",
  learnerQuestion:
    "Does this evaluation match the entities the model will face after deployment?",
  fixedFixture: {
    id: "public-leakage-v1",
    version: "leakage-fixture-v1",
    contentSha256:
      "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70",
  },
  fixedResultAuthority: {
    concept: "entity_leakage",
    kernelVersion: "0.1.0",
    fixture: {
      sha256:
        "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70",
      rows: 2880,
      customers: 480,
      targetRate: 0.497569444444,
    },
  },
  supportDetector: leakageSupport,
  analystRules: {
    stableInstructions: [
      "A row split does not establish generalization to unseen entities when identities repeat.",
      "A decisive test holds out complete entities and measures overlap explicitly.",
      "Identity ablation supports the diagnosis but does not replace group holdout.",
    ],
    requiredEvidenceKinds: ["code", "metric", "schema"],
  },
  allowedOperations: [
    "leakage.random_row_split",
    "leakage.group_holdout",
    "leakage.identity_ablation",
    "leakage.entity_overlap",
    "leakage.controlled_comparison",
  ],
  allowedMetrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
  allowedVisualizations: ["metric_comparison", "entity_overlap"],
  experimentPlanRules: [
    "Use leakage.random_row_split exactly once as the baseline with identity retained.",
    "Use leakage.group_holdout exactly once with the same seed, model, test fraction, entity field, and identity setting as the baseline.",
    "Use leakage.identity_ablation exactly once with the same seed, model, test fraction, and entity field as the baseline, changing only dropIdentity to true.",
    "The baseline and both interventions must use one entity field resolved from the Artifact Manifest.",
  ],
  scientificMethod: {
    candidateExperimentIds: ["group-holdout", "group-holdout-plus-ablation"],
    scoringPolicy: leakageScoringPolicy,
    epistemic: {
      policy: leakageEpistemicPolicy,
      classifyOutcome: classifyLeakageOutcome,
      resolveControlValues: leakageControlValues,
      resolveObservablePath: leakageObservablePath,
    },
    defaultPresentation: {
      scope: "unseen customers in the documented fixture",
      learnerFacingClaims: [leakageApprovedClaims[1]],
    },
  },
  verifierContract: {
    id: "leakage-plan-verifier-v2",
    invariants: [
      "resolved_evidence",
      "zero_group_overlap",
      "identity_ablation",
      "controlled_comparison",
      "deterministic_result",
    ],
  },
  transferTask: {
    id: "forecast-future-leakage-v1",
    evaluatorTaskId: "forecasting-future-leakage-01",
    title: "Choose an evaluation boundary that cannot see the future",
  },
  patchContract: {
    id: "leakage-notebook-patch-v2",
    allowedTransformations: [
      "replace_row_split_with_group_holdout",
      "exclude_entity_feature",
    ],
  },
  approvedClaims: leakageApprovedClaims,
  forbiddenClaims: leakageForbiddenClaims,
} satisfies ConceptPackDefinition);

const imbalancePack = deepFreeze({
  id: "class_imbalance",
  version: "1.0.0",
  releaseStatus: "released",
  title: "Class imbalance and metric choice",
  learnerQuestion:
    "Does the reported metric show that the rare class is detected at a useful operating point?",
  fixedFixture: {
    id: "public-imbalance-v1",
    version: "imbalance-fixture-v1",
    contentSha256:
      "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f",
  },
  fixedResultAuthority: {
    concept: "class_imbalance",
    kernelVersion: "0.1.0",
    fixture: {
      sha256:
        "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f",
      rows: 6000,
      positives: 65,
      prevalence: 0.010833333333,
    },
  },
  supportDetector: imbalanceSupport,
  analystRules: {
    stableInstructions: [
      "High accuracy on a rare-event target must be compared with a majority baseline before it is treated as useful evidence.",
      "A decisive evaluation uses a stratified holdout and reports the confusion matrix, precision, recall, F1, and PR-AUC with contextual ROC-AUC.",
      "Threshold and prevalence sweeps test whether the conclusion survives a changed operating point or deployment base rate.",
    ],
    requiredEvidenceKinds: ["code", "metric"],
  },
  allowedOperations: [
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.confusion_matrix",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
  ],
  allowedMetrics: [
    "accuracy",
    "precision",
    "recall",
    "f1",
    "pr_auc",
    "roc_auc",
    "confusion_matrix",
    "prevalence",
  ],
  allowedVisualizations: [
    "metric_comparison",
    "confusion_matrix",
    "threshold_curve",
    "prevalence_sensitivity",
  ],
  experimentPlanRules: [
    "Use imbalance.majority_baseline exactly once as the baseline with model majority_baseline and observed prevalence.",
    "Use exactly one imbalance.stratified_holdout, one imbalance.threshold_sweep, and one imbalance.prevalence_sweep intervention.",
    "Use logistic_regression for all non-baseline runs and one shared seed for every run.",
    "Change only threshold in the threshold sweep, then keep that threshold fixed while changing prevalence in the prevalence sweep.",
    "Include every registered imbalance metric and visualization exactly once.",
  ],
  scientificMethod: {
    candidateExperimentIds: [
      "threshold-and-majority-baseline",
      "prevalence-and-threshold-sweep",
    ],
    scoringPolicy: imbalanceScoringPolicy,
    epistemic: {
      policy: imbalanceEpistemicPolicy,
      classifyOutcome: classifyImbalanceOutcome,
      resolveControlValues: imbalanceControlValues,
      resolveObservablePath: imbalanceObservablePath,
    },
    defaultPresentation: {
      scope: "rare-event detection in the documented fixture",
      learnerFacingClaims: [imbalanceApprovedClaims[1]],
    },
  },
  verifierContract: {
    id: "imbalance-plan-verifier-v1",
    invariants: [
      "resolved_evidence",
      "minority_prevalence_measured",
      "stratified_holdout",
      "majority_baseline",
      "confusion_matrix_consistent",
      "threshold_sweep",
      "prevalence_sweep",
      "deterministic_result",
    ],
  },
  transferTask: {
    id: "manufacturing-rare-defect-v1",
    evaluatorTaskId: "manufacturing-defect-transfer-01",
    title: "Choose evidence for a rare manufacturing defect alert",
  },
  patchContract: {
    id: "imbalance-notebook-patch-v1",
    allowedTransformations: [
      "stratify_classification_holdout",
      "add_majority_baseline",
      "replace_accuracy_only_evaluation",
    ],
  },
  approvedClaims: imbalanceApprovedClaims,
  forbiddenClaims: imbalanceForbiddenClaims,
} satisfies ConceptPackDefinition);

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (
    (typeof value !== "object" || value === null) &&
    typeof value !== "function"
  ) {
    return value;
  }
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const key of Reflect.ownKeys(object)) {
    const nested = (object as Record<PropertyKey, unknown>)[key];
    deepFreeze(nested, seen);
  }
  return Object.freeze(value);
}

const registry = new Map<ConceptId, ConceptPackDefinition>([
  [leakagePack.id, leakagePack],
  [imbalancePack.id, imbalancePack],
]);

export function getConceptPack(id: ConceptId): ConceptPackDefinition {
  const pack = registry.get(id);
  if (pack === undefined)
    throw new Error(`Concept pack is not registered: ${id}`);
  return pack;
}

export function releasedConceptPacks(): ConceptPackDefinition[] {
  return [...registry.values()].filter(
    (pack) => pack.releaseStatus === "released",
  );
}

export function routeArtifactConcept(
  manifest: ArtifactManifest,
): ConceptRoutingDecision {
  if (manifest.support.status !== "SUPPORTED") {
    return {
      kind: "unsupported_artifact",
      reasons: manifest.support.reasons,
    };
  }
  const detections = releasedConceptPacks().map((pack) => ({
    pack,
    detection: pack.supportDetector(manifest),
  }));
  const supported = detections
    .filter(({ detection }) => detection.supported)
    .sort(
      (left, right) => right.detection.confidence - left.detection.confidence,
    );
  if (supported.length > 1) {
    return {
      kind: "choice_required",
      candidates: supported.map(({ pack, detection }) => ({
        concept: pack.id,
        conceptPackVersion: pack.version,
        confidence: detection.confidence,
        evidence: detection.evidence,
      })),
    };
  }
  const selected = supported[0];
  if (selected !== undefined) {
    return {
      kind: "selected",
      concept: selected.pack.id,
      conceptPackVersion: selected.pack.version,
      confidence: selected.detection.confidence,
      evidence: selected.detection.evidence,
      limitations: selected.detection.limitations,
    };
  }
  const plausible = detections.filter(
    ({ detection }) => detection.confidence > 0,
  );
  if (plausible.length > 0) {
    return {
      kind: "insufficient_evidence",
      candidates: plausible.map(({ pack }) => pack.id),
      limitations: plausible.flatMap(({ detection }) => detection.limitations),
    };
  }
  return {
    kind: "unsupported_artifact",
    reasons: [
      {
        code: "NO_RELEASED_CONCEPT_MATCH",
        message:
          "No released concept pack matches the sanitized notebook evidence.",
      },
    ],
  };
}
