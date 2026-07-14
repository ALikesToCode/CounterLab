import type {
  AllowedMetric,
  AllowedVisualization,
  ArtifactManifest,
  EvidenceRef,
  FixedOperationId,
  SupportReason,
} from "@counterlab/contracts";

export type ConceptId = "entity_leakage" | "class_imbalance";

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
    allowedTransformations: readonly string[];
  };
  approvedClaims: readonly string[];
  forbiddenClaims: readonly string[];
}

export type ConceptRoutingDecision =
  | {
      kind: "selected";
      concept: ConceptId;
      conceptPackVersion: string;
      confidence: number;
      evidence: EvidenceRef[];
      limitations: string[];
    }
  | {
      kind: "choice_required";
      candidates: Array<{
        concept: ConceptId;
        conceptPackVersion: string;
        confidence: number;
        evidence: EvidenceRef[];
      }>;
    }
  | {
      kind: "insufficient_evidence";
      candidates: ConceptId[];
      limitations: string[];
    }
  | {
      kind: "unsupported_artifact";
      reasons: SupportReason[];
    };

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

const registry = new Map<ConceptId, ConceptPackDefinition>([
  [leakagePack.id, leakagePack],
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
