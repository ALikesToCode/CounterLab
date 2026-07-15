import type {
  AllowedMetric,
  AllowedVisualization,
  ArtifactManifest,
  ConceptId,
  ConceptRoutingDecision,
  EvidenceRef,
  FixedOperationId,
  PatchOperationId,
} from "@counterlab/contracts";
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

export interface ConceptPackDefinition {
  id: ConceptId;
  version: string;
  releaseStatus: "released" | "development";
  title: string;
  learnerQuestion: string;
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
  };
  verifierContract: {
    id: string;
    invariants: readonly string[];
  };
  transferTask: {
    id: string;
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
  requiredOperationIds: ["leakage.group_holdout"],
  requiredControlIds: ["model", "seed", "test_fraction"],
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
    "imbalance.confusion_matrix",
    "imbalance.threshold_sweep",
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

const leakagePack = Object.freeze({
  id: "entity_leakage",
  version: "2.0.0",
  releaseStatus: "released",
  title: "Entity leakage",
  learnerQuestion:
    "Does this evaluation match the entities the model will face after deployment?",
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
    title: "Choose an evaluation boundary that cannot see the future",
  },
  patchContract: {
    id: "leakage-notebook-patch-v2",
    allowedTransformations: [
      "replace_row_split_with_group_holdout",
      "exclude_entity_feature",
    ],
  },
  approvedClaims: [
    "This verified run measures the documented public fixture under the selected entity boundary.",
    "Zero entity overlap was verified for the group holdout run.",
  ],
  forbiddenClaims: [
    "This proves performance for every future customer.",
    "This proves the learner has mastered leakage.",
  ],
} satisfies ConceptPackDefinition);

const imbalancePack = Object.freeze({
  id: "class_imbalance",
  version: "1.0.0",
  releaseStatus: "released",
  title: "Class imbalance and metric choice",
  learnerQuestion:
    "Does the reported metric show that the rare class is detected at a useful operating point?",
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
  approvedClaims: [
    "This verified run reports class-specific performance for the documented fixture, split, threshold, and prevalence.",
    "The fixed majority baseline and confusion-matrix totals were verified for this run.",
  ],
  forbiddenClaims: [
    "High accuracy alone proves the rare class is detected well.",
    "This threshold is optimal for every deployment prevalence or cost tradeoff.",
    "This proves the learner has mastered class imbalance.",
  ],
} satisfies ConceptPackDefinition);

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
