import { z } from "zod";

import {
  DiscriminationContractV1Schema,
  type ArtifactManifest,
  type EvidenceRef,
  type ExperimentPlanV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  RunnerLabCompileBundleV5Schema,
  hashExperimentIR,
  projectExperimentIRV5ToPlanV2,
  type ExperimentIRV5,
  type RunnerLabCompileBundleV5,
} from "@counterlab/experiment-ir";
import {
  applyExperimentSelection,
  scoreExperiments,
  type ExperimentSelection,
} from "@counterlab/experiment-scorer";
import {
  LabSceneV2Schema,
  type LabSceneV2,
} from "@counterlab/generative-ui-contracts";
import { hashCanonical } from "@counterlab/session-core";

const PublicRationaleSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_192)
  .refine(
    (value) =>
      !/(?:<\/?(?:script|iframe|style)|javascript:|data:text\/html)/iu.test(
        value,
      ),
    "public rationale contains active presentation content",
  )
  .refine(
    (value) =>
      !/(?:\b\d+(?:\.\d+)?\s*%|\b(?:accuracy|recall|precision|f1|auc)\s*(?:is|=|:)?\s*0?\.\d+)/iu.test(
        value,
      ),
    "public rationale must not contain a generated result literal",
  );

export type ScientificCandidateArtifactsV5 = {
  discriminationContract: unknown;
  experimentIr: unknown;
  labScene: unknown;
  publicRationale: unknown;
};

export type ScientificCandidateInvariant = {
  name: string;
  passed: boolean;
  observed: unknown;
  expected: unknown;
  counterexample?: string;
};

export type ScientificCandidateReportV1 = {
  schemaVersion: "1";
  status: "VERIFIED" | "REJECTED";
  reasonCode:
    | "SELECTED"
    | "SCIENTIFIC_CANDIDATE_INVALID"
    | "INCONCLUSIVE_NO_DECISIVE_TEST";
  verifierVersion:
    | "scientific-candidate-verifier-v1"
    | "scientific-candidate-verifier-v2"
    | "scientific-candidate-verifier-v3"
    | "scientific-candidate-verifier-v4";
  discriminationContractHash: string;
  rawExperimentIrHash: string;
  labSceneHash: string;
  selectionHash?: string;
  selectedIrHash?: string;
  executionPlanHash?: string;
  invariantCount: number;
  invariants: ScientificCandidateInvariant[];
};

export type ScientificCandidateVerificationV1 =
  | {
      disposition: "VERIFIED";
      report: ScientificCandidateReportV1;
      selection: ExperimentSelection;
      selectedIr: ExperimentIRV5;
      selectedIrHash: string;
      executionPlan: ExperimentPlanV2;
      executionPlanHash: string;
    }
  | {
      disposition: "REPAIRABLE_REJECTION";
      report: ScientificCandidateReportV1;
      selection?: ExperimentSelection;
    }
  | {
      disposition: "INCONCLUSIVE_NO_DECISIVE_TEST";
      report: ScientificCandidateReportV1;
      selection: ExperimentSelection;
    };

export type VerifyScientificCandidateV5Input = {
  bundle: unknown;
  artifacts: ScientificCandidateArtifactsV5;
};

function diagnostic(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(diagnostic);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, diagnostic(nested)]),
    );
  }
  return String(value);
}

function invariant(
  name: string,
  passed: boolean,
  observed: unknown,
  expected: unknown,
  counterexample?: string,
): ScientificCandidateInvariant {
  return {
    name,
    passed,
    observed: diagnostic(observed),
    expected: diagnostic(expected),
    ...(counterexample === undefined ? {} : { counterexample }),
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function canonicalInconclusiveOutcomes(
  outcomes: readonly {
    conditionId: string;
    description: string;
    nextExperimentId?: string;
  }[],
): { conditionId: string; description: string; nextExperimentId?: string }[] {
  return [...outcomes].sort((left, right) =>
    left.conditionId.localeCompare(right.conditionId),
  );
}

function evidenceAuthorityKey(evidence: EvidenceRef): string {
  return [
    evidence.kind,
    evidence.cellIndex ?? "",
    evidence.outputIndex ?? "",
    evidence.hash,
  ].join(":");
}

async function evidenceResolves(
  evidence: EvidenceRef,
  manifest: ArtifactManifest,
  claim: string,
): Promise<boolean> {
  if (evidence.kind === "schema") {
    return evidence.hash === (await hashCanonical(manifest.schemaSummary));
  }
  if (evidence.kind === "learner_claim") {
    return evidence.hash === (await hashCanonical(claim));
  }
  const cell = manifest.cells.find(
    (candidate) => candidate.index === evidence.cellIndex,
  );
  if (cell === undefined) return false;
  if (evidence.kind === "code") return evidence.hash === cell.sourceSha256;
  if (evidence.outputIndex === undefined) return false;
  if (cell.outputHashes[evidence.outputIndex] !== evidence.hash) return false;
  return (
    evidence.kind !== "metric" ||
    cell.metricCandidates.some(
      (candidate) => candidate.outputIndex === evidence.outputIndex,
    )
  );
}

function fixedPackSnapshot(
  pack: ReturnType<typeof getConceptPack>,
  includeBoundarySweep: boolean,
  includeFixedExecutionContract: boolean,
  includeTransferTask: boolean,
) {
  const boundary = pack.scientificMethod.boundaryMap;
  return {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    allowedOperations: pack.allowedOperations,
    allowedMetrics: pack.allowedMetrics,
    allowedVisualizations: pack.allowedVisualizations,
    verifierInvariants: pack.verifierContract.invariants,
    candidateExperimentIds: pack.scientificMethod.candidateExperimentIds,
    ...(includeBoundarySweep
      ? {
          boundarySweep: {
            sweepId: boundary.sweepId,
            axisIds: [boundary.axes[0].id, boundary.axes[1].id],
            gridPresetId: boundary.gridPresetId,
            observableId: boundary.observableId,
            maxCells: boundary.maxCells,
          },
        }
      : {}),
    ...(includeFixedExecutionContract
      ? { fixedExecutionContract: pack.scientificMethod.fixedExecutionContract }
      : {}),
    ...(includeTransferTask ? { transferTask: pack.transferTask } : {}),
    planRequirements: pack.experimentPlanRules,
  };
}

const RESULT_METRIC_FIELDS = {
  entity_leakage: ["accuracy", "rocAuc"],
  class_imbalance: ["accuracy", "precision", "recall", "f1", "prAuc", "rocAuc"],
} as const;

const FIXED_SCENE_COPY = {
  entity_leakage: {
    title: "Does the score survive a whole-customer holdout?",
    assumptions: ["The fixed kernel executes only registered operations."],
    limitations: ["No result is shown before external verification."],
  },
  class_imbalance: {
    title: "Does accuracy hide missed rare cases?",
    assumptions: ["The fixed kernel computes every class-specific metric."],
    limitations: ["No result is shown before external verification."],
  },
} as const;

const FIXED_METRIC_NAMES: Readonly<Record<string, string>> = {
  accuracy: "accuracy",
  precision: "precision",
  recall: "recall",
  f1: "F1",
  prAuc: "PR AUC",
  rocAuc: "ROC AUC",
};

function fixedMetricLabel(operation: string, metric: string): string {
  if (operation === "imbalance.stratified_holdout" && metric === "recall") {
    return "Rare-class recall";
  }
  const prefix: Readonly<Record<string, string>> = {
    "leakage.random_row_split": "Familiar-row",
    "leakage.group_holdout": "Unseen-customer",
    "leakage.identity_ablation": "Identity-removed",
    "imbalance.majority_baseline": "Majority-baseline",
    "imbalance.stratified_holdout": "Stratified-model",
    "imbalance.threshold_sweep": "Threshold-sweep",
    "imbalance.prevalence_sweep": "Prevalence-sweep",
  };
  const fixedPrefix = prefix[operation];
  const fixedMetric = FIXED_METRIC_NAMES[metric];
  if (fixedPrefix === undefined || fixedMetric === undefined) {
    throw new TypeError("fixed Lab Scene metric presentation is unavailable");
  }
  return `${fixedPrefix} ${fixedMetric}`;
}

function sceneBindings(block: LabSceneV2["blocks"][number]): string[] {
  switch (block.type) {
    case "Prediction":
      return [block.immutableBinding];
    case "Metric":
    case "BarChart":
    case "LineChart":
    case "Scatter":
    case "ReasoningDiff":
      return [block.resultBinding];
    case "BoundaryMap":
      return [block.resultBinding, block.accessibleTableBinding];
    case "MotionCanvas":
      return [
        block.resultBinding,
        block.accessibleTableBinding,
        block.reducedMotionBinding,
      ];
    case "NotebookCell":
      return [block.evidenceBinding];
    case "NotebookDiff":
      return [block.diffBinding];
    case "ProofBadge":
      return [block.proofBinding];
    default:
      return [];
  }
}

function fixedSceneResultBindingManifest(
  scene: LabSceneV2,
  plan: ExperimentPlanV2,
): { passed: boolean; observed: unknown; expected: unknown } {
  const runs = [plan.baseline, ...plan.interventions];
  const runIds = runs.map((run) => run.runId);
  const metricFields = RESULT_METRIC_FIELDS[plan.concept];
  const allowedMetricPresentations = runs.flatMap((run) =>
    metricFields.map((field) => ({
      resultBinding: `/runs/byId/${run.runId}/metrics/${field}`,
      label: fixedMetricLabel(run.operation, field),
      unit: "proportion",
    })),
  );
  const allowedMetricBindings = allowedMetricPresentations.map(
    (presentation) => presentation.resultBinding,
  );
  const allowed = new Set(allowedMetricBindings);
  const metricPresentations = scene.blocks
    .filter((block) => block.type === "Metric")
    .map((block) => ({
      resultBinding: block.resultBinding,
      label: block.label,
      unit: block.unit,
    }));
  const metricBindings = metricPresentations.map(
    (presentation) => presentation.resultBinding,
  );
  const fixedPresentationByBinding = new Map(
    allowedMetricPresentations.map((presentation) => [
      presentation.resultBinding,
      presentation,
    ]),
  );
  const mismatchedMetricPresentations = metricPresentations.filter(
    (presentation) =>
      !sameJson(
        presentation,
        fixedPresentationByBinding.get(presentation.resultBinding),
      ),
  );
  const fixedCopy = FIXED_SCENE_COPY[plan.concept];
  const limitationBlockTexts = scene.blocks
    .filter((block) => block.type === "Limitation")
    .map((block) => block.text);
  const fixedCopyMatches =
    scene.title === fixedCopy.title &&
    sameJson(scene.assumptions, fixedCopy.assumptions) &&
    sameJson(scene.limitations, fixedCopy.limitations) &&
    limitationBlockTexts.every((text) =>
      fixedCopy.limitations.some((limitation) => limitation === text),
    );
  const unsupportedBoundBlocks = scene.blocks
    .filter(
      (block) => block.type !== "Metric" && sceneBindings(block).length > 0,
    )
    .map((block) => ({ type: block.type, bindings: sceneBindings(block) }));
  const runIdByBinding = new Map(
    allowedMetricBindings.map((binding) => [
      binding,
      runIds.find((runId) => binding.startsWith(`/runs/byId/${runId}/`)),
    ]),
  );
  const boundRunIds = new Set(
    metricBindings
      .map((binding) => runIdByBinding.get(binding))
      .filter((runId): runId is string => runId !== undefined),
  );
  const distinctMetricBindings = new Set(metricBindings);
  const passed =
    scene.supportLabel === "GUIDED_VISUAL" &&
    metricBindings.length >= 2 &&
    distinctMetricBindings.size === metricBindings.length &&
    boundRunIds.size >= 2 &&
    metricBindings.every((binding) => allowed.has(binding)) &&
    mismatchedMetricPresentations.length === 0 &&
    fixedCopyMatches &&
    unsupportedBoundBlocks.length === 0;

  return {
    passed,
    observed: {
      supportLabel: scene.supportLabel,
      metricBindings,
      metricPresentations,
      mismatchedMetricPresentations,
      distinctRunCount: boundRunIds.size,
      title: scene.title,
      assumptions: scene.assumptions,
      limitations: scene.limitations,
      limitationBlockTexts,
      unsupportedBoundBlocks,
    },
    expected: {
      schemaVersion: "1",
      bindingRoot: "authoritative-result-v2",
      supportLabel: "GUIDED_VISUAL",
      minimumMetricBindings: 2,
      minimumDistinctRunCount: 2,
      allowedMetricBindings,
      allowedMetricPresentations,
      title: fixedCopy.title,
      assumptions: fixedCopy.assumptions,
      limitations: fixedCopy.limitations,
      limitationBlockTexts: fixedCopy.limitations,
      unsupportedBoundBlocks: [],
    },
  };
}

function selectedExecutionSemantics(
  ir: ExperimentIRV5,
  plan: ExperimentPlanV2,
  enforceFixedExecutionContract: boolean,
): { passed: boolean; observed: unknown; expected: unknown } {
  if (ir.selection.status !== "SELECTED") {
    return {
      passed: false,
      observed: ir.selection.status,
      expected: "SELECTED",
    };
  }
  const selectedCandidateId = ir.selection.candidateId;
  const candidate = ir.candidateExperiments.find(
    (item) => item.id === selectedCandidateId,
  );
  if (candidate === undefined) {
    return {
      passed: false,
      observed: selectedCandidateId,
      expected: "a resolving candidate",
    };
  }
  const runs = [candidate.baseline, ...candidate.interventions];
  const operations = runs.map((run) => run.operation);
  const pack = getConceptPack(ir.concept);
  const runSeeds = runs.map((run) => run.seed);
  const fixedSeedMatches =
    !enforceFixedExecutionContract ||
    runSeeds.every(
      (seed) => seed === pack.scientificMethod.fixedExecutionContract.runSeed,
    );

  if (ir.concept === "entity_leakage") {
    const baseline = runs.find(
      (run) => run.operation === "leakage.random_row_split",
    );
    const group = runs.find((run) => run.operation === "leakage.group_holdout");
    const ablation = runs.find(
      (run) => run.operation === "leakage.identity_ablation",
    );
    const typed = [baseline, group, ablation].every(
      (run) => run?.concept === "entity_leakage",
    );
    const controlsMatch =
      typed &&
      baseline?.concept === "entity_leakage" &&
      group?.concept === "entity_leakage" &&
      ablation?.concept === "entity_leakage" &&
      baseline.model === group.model &&
      baseline.model === ablation.model &&
      baseline.seed === group.seed &&
      baseline.seed === ablation.seed &&
      baseline.testFraction === group.testFraction &&
      baseline.testFraction === ablation.testFraction &&
      baseline.entityField === group.entityField &&
      baseline.entityField === ablation.entityField &&
      baseline.dropIdentity === false &&
      group.dropIdentity === false &&
      ablation.dropIdentity === true;
    const expectedOperations = [
      "leakage.random_row_split",
      "leakage.group_holdout",
      "leakage.identity_ablation",
    ];
    return {
      passed:
        sameSet(operations, expectedOperations) &&
        controlsMatch &&
        fixedSeedMatches &&
        sameSet(candidate.changedVariableIds, [
          "split_strategy",
          "identity_feature",
        ]) &&
        plan.baseline.operation === "leakage.random_row_split",
      observed: {
        operations,
        changedVariableIds: candidate.changedVariableIds,
        controlsMatch,
        ...(enforceFixedExecutionContract ? { runSeeds } : {}),
      },
      expected: {
        operations: expectedOperations,
        changedVariableIds: ["split_strategy", "identity_feature"],
        controlsMatch: true,
        ...(enforceFixedExecutionContract
          ? { runSeed: pack.scientificMethod.fixedExecutionContract.runSeed }
          : {}),
      },
    };
  }

  const baseline = runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const stratified = runs.find(
    (run) => run.operation === "imbalance.stratified_holdout",
  );
  const threshold = runs.find(
    (run) => run.operation === "imbalance.threshold_sweep",
  );
  const prevalence = runs.find(
    (run) => run.operation === "imbalance.prevalence_sweep",
  );
  const expectedOperations = [
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
  ];
  const controlsMatch =
    baseline?.concept === "class_imbalance" &&
    stratified?.concept === "class_imbalance" &&
    threshold?.concept === "class_imbalance" &&
    prevalence?.concept === "class_imbalance" &&
    baseline.model === "majority_baseline" &&
    baseline.prevalenceScenario === "observed" &&
    stratified.model === "logistic_regression" &&
    threshold.model === "logistic_regression" &&
    prevalence.model === "logistic_regression" &&
    new Set(runs.map((run) => run.seed)).size === 1 &&
    threshold.threshold !== stratified.threshold &&
    prevalence.threshold === threshold.threshold &&
    prevalence.prevalenceScenario !== threshold.prevalenceScenario;
  return {
    passed:
      sameSet(operations, expectedOperations) &&
      controlsMatch &&
      fixedSeedMatches &&
      sameSet(candidate.changedVariableIds, [
        "decision_threshold",
        "class_prevalence",
      ]) &&
      sameSet(plan.metrics, pack.allowedMetrics) &&
      sameSet(plan.visualizations, pack.allowedVisualizations),
    observed: {
      operations,
      changedVariableIds: candidate.changedVariableIds,
      controlsMatch,
      ...(enforceFixedExecutionContract ? { runSeeds } : {}),
      metrics: plan.metrics,
      visualizations: plan.visualizations,
    },
    expected: {
      operations: expectedOperations,
      changedVariableIds: ["decision_threshold", "class_prevalence"],
      controlsMatch: true,
      ...(enforceFixedExecutionContract
        ? { runSeed: pack.scientificMethod.fixedExecutionContract.runSeed }
        : {}),
      metrics: pack.allowedMetrics,
      visualizations: pack.allowedVisualizations,
    },
  };
}

async function rejectionReport(
  artifacts: ScientificCandidateArtifactsV5,
  invariants: ScientificCandidateInvariant[],
  options: {
    reasonCode?: ScientificCandidateReportV1["reasonCode"];
    selection?: ExperimentSelection;
    verifierVersion?: ScientificCandidateReportV1["verifierVersion"];
  } = {},
): Promise<ScientificCandidateReportV1> {
  return {
    schemaVersion: "1",
    status: "REJECTED",
    reasonCode: options.reasonCode ?? "SCIENTIFIC_CANDIDATE_INVALID",
    verifierVersion:
      options.verifierVersion ?? "scientific-candidate-verifier-v1",
    discriminationContractHash: await hashCanonical(
      artifacts.discriminationContract,
    ),
    rawExperimentIrHash: await hashCanonical(artifacts.experimentIr),
    labSceneHash: await hashCanonical(artifacts.labScene),
    ...(options.selection === undefined
      ? {}
      : { selectionHash: await hashCanonical(options.selection) }),
    invariantCount: invariants.length,
    invariants,
  };
}

export async function verifyScientificCandidateV5(
  input: VerifyScientificCandidateV5Input,
): Promise<ScientificCandidateVerificationV1> {
  const bundleResult = RunnerLabCompileBundleV5Schema.safeParse(input.bundle);
  const contractResult = DiscriminationContractV1Schema.safeParse(
    input.artifacts.discriminationContract,
  );
  const irResult = ExperimentIRV5Schema.safeParse(input.artifacts.experimentIr);
  const sceneResult = LabSceneV2Schema.safeParse(input.artifacts.labScene);
  const rationaleResult = PublicRationaleSchema.safeParse(
    input.artifacts.publicRationale,
  );
  const verifierVersion: ScientificCandidateReportV1["verifierVersion"] =
    bundleResult.success &&
    bundleResult.data.conceptPack.fixedExecutionContract !== undefined
      ? "scientific-candidate-verifier-v4"
      : bundleResult.success &&
          bundleResult.data.conceptPack.transferTask !== undefined
        ? "scientific-candidate-verifier-v2"
        : "scientific-candidate-verifier-v1";
  if (
    !bundleResult.success ||
    !contractResult.success ||
    !irResult.success ||
    !sceneResult.success ||
    !rationaleResult.success
  ) {
    const issues = [
      ["bundle", bundleResult],
      ["discrimination-contract.json", contractResult],
      ["experiment-ir.json", irResult],
      ["lab-scene.json", sceneResult],
      ["public-rationale.md", rationaleResult],
    ]
      .filter((entry) => !(entry[1] as { success: boolean }).success)
      .map(([label, result]) => ({
        label,
        issue:
          (result as { error?: z.ZodError }).error?.issues[0]?.message ??
          "invalid structure",
      }));
    const checks = [
      invariant(
        "structural_contracts",
        false,
        issues,
        "Runner bundle v5 and four bounded scientific artifacts",
        "One or more scientific artifacts failed strict schema validation.",
      ),
    ];
    return {
      disposition: "REPAIRABLE_REJECTION",
      report: await rejectionReport(input.artifacts, checks, {
        verifierVersion,
      }),
    };
  }

  const bundle: RunnerLabCompileBundleV5 = bundleResult.data;
  const contract = contractResult.data;
  const rawIr = irResult.data;
  const scene = sceneResult.data;
  const pack = getConceptPack(bundle.conceptPack.id);
  const [
    manifestHash,
    beliefSpecHash,
    predictionHash,
    contractHash,
    rawIrHash,
  ] = await Promise.all([
    hashCanonical(bundle.artifactManifest),
    hashCanonical(bundle.approvedBeliefSpec),
    hashCanonical(
      Object.fromEntries(
        Object.entries(bundle.prediction).filter(
          ([key]) => key !== "immutableHash",
        ),
      ),
    ),
    hashCanonical(contract),
    hashExperimentIR(rawIr),
  ]);
  const support = pack.supportDetector(bundle.artifactManifest);
  const supportEvidence = new Set(support.evidence.map(evidenceAuthorityKey));
  const contractEvidence = contract.evidenceRefs.map(evidenceAuthorityKey);
  const irEvidence = rawIr.evidenceRefs.map(evidenceAuthorityKey);
  const contractMatchesApproved = sameJson(
    contract.evidenceRefs,
    bundle.approvedBeliefSpec.evidenceRefs,
  );
  const experimentIrMatchesApproved = sameJson(
    rawIr.evidenceRefs,
    bundle.approvedBeliefSpec.evidenceRefs,
  );
  const [approvedEvidenceHash, contractEvidenceHash, experimentIrEvidenceHash] =
    await Promise.all([
      hashCanonical(bundle.approvedBeliefSpec.evidenceRefs),
      hashCanonical(contract.evidenceRefs),
      hashCanonical(rawIr.evidenceRefs),
    ]);
  const allEvidenceResolves = (
    await Promise.all(
      [...contract.evidenceRefs, ...rawIr.evidenceRefs].map((evidence) =>
        evidenceResolves(
          evidence,
          bundle.artifactManifest,
          bundle.approvedBeliefSpec.claim,
        ),
      ),
    )
  ).every(Boolean);
  const hypothesisAuthority = bundle.approvedBeliefSpec.hypotheses.map(
    ({ id, statement, conditions, nonClaims }) => ({
      id,
      statement,
      conditions,
      nonClaims,
    }),
  );
  const irHypothesisAuthority = rawIr.hypotheses.map(
    ({ id, statement, conditions, nonClaims }) => ({
      id,
      statement,
      conditions,
      nonClaims,
    }),
  );
  const candidateIds = rawIr.candidateExperiments.map(
    (candidate) => candidate.id,
  );
  const candidateIdsMatch = sameSet(
    contract.candidateExperimentIds,
    candidateIds,
  );
  const [contractCandidateIdsHash, experimentIrCandidateIdsHash] =
    await Promise.all([
      hashCanonical(contract.candidateExperimentIds),
      hashCanonical(candidateIds),
    ]);
  const expectedTransferContract = pack.transferTask.experimentIrContract;
  const declaredTransferTask = bundle.conceptPack.transferTask;
  const [transferContractHash, expectedTransferContractHash] =
    await Promise.all([
      hashCanonical(rawIr.transfer),
      hashCanonical(expectedTransferContract),
    ]);
  const transferContractMatches = sameJson(
    rawIr.transfer,
    expectedTransferContract,
  );
  const bundleTransferContractMatches = sameJson(
    declaredTransferTask,
    pack.transferTask,
  );
  const sceneTransferEvaluatorIds = scene.blocks
    .filter((block) => block.type === "Transfer")
    .map((block) => block.evaluatorId);
  const sceneTransferEvaluatorHash = await hashCanonical(
    sceneTransferEvaluatorIds,
  );
  const sceneTransferBindingsMatch = sceneTransferEvaluatorIds.every(
    (evaluatorId) => evaluatorId === pack.transferTask.evaluatorTaskId,
  );
  const allowedCandidateIds = new Set(
    pack.scientificMethod.candidateExperimentIds,
  );
  const checks: ScientificCandidateInvariant[] = [
    invariant(
      "bundle_authority",
      manifestHash === bundle.artifactManifestHash &&
        beliefSpecHash === bundle.beliefSpecHash &&
        predictionHash === bundle.prediction.immutableHash &&
        sameJson(
          bundle.conceptPack,
          fixedPackSnapshot(
            pack,
            bundle.conceptPack.boundarySweep !== undefined,
            bundle.conceptPack.fixedExecutionContract !== undefined,
            bundle.conceptPack.transferTask !== undefined,
          ),
        ),
      {
        manifestHashMatches: manifestHash === bundle.artifactManifestHash,
        beliefSpecHashMatches: beliefSpecHash === bundle.beliefSpecHash,
        predictionHashMatches:
          predictionHash === bundle.prediction.immutableHash,
        packSnapshotMatches: sameJson(
          bundle.conceptPack,
          fixedPackSnapshot(
            pack,
            bundle.conceptPack.boundarySweep !== undefined,
            bundle.conceptPack.fixedExecutionContract !== undefined,
            bundle.conceptPack.transferTask !== undefined,
          ),
        ),
      },
      "canonical manifest, Belief Spec, Prediction, and frozen Subject Pack",
    ),
    invariant(
      "codex_provenance",
      rawIr.selection.status === "UNSELECTED" &&
        rawIr.provenance.kind === "codex" &&
        rawIr.provenance.generatorId === bundle.provenance.generatorId &&
        rawIr.provenance.promptHash === bundle.provenance.promptHash &&
        sameJson(rawIr.provenance.inputHashes, bundle.provenance.inputHashes) &&
        sameJson(rawIr.resourceLimits, bundle.resourceLimits),
      {
        selection: rawIr.selection.status,
        provenanceKind: rawIr.provenance.kind,
      },
      "UNSELECTED IR with exact compiler provenance and resource limits",
    ),
    invariant(
      "artifact_authority_lineage",
      contract.sessionId === bundle.sessionId &&
        rawIr.sessionId === bundle.sessionId &&
        contract.artifactManifestHash === manifestHash &&
        rawIr.artifactManifestHash === manifestHash &&
        contract.beliefSpecId === bundle.approvedBeliefSpec.id &&
        rawIr.beliefSpecId === bundle.approvedBeliefSpec.id &&
        contract.beliefSpecHash === beliefSpecHash &&
        rawIr.beliefSpecHash === beliefSpecHash &&
        contract.concept === pack.id &&
        rawIr.concept === pack.id &&
        contract.conceptPackVersion === pack.version &&
        rawIr.conceptPackVersion === pack.version,
      {
        contractSession: contract.sessionId,
        irSession: rawIr.sessionId,
        concept: rawIr.concept,
        packVersion: rawIr.conceptPackVersion,
      },
      {
        sessionId: bundle.sessionId,
        concept: pack.id,
        packVersion: pack.version,
      },
    ),
    invariant(
      "hypothesis_lineage",
      sameJson(irHypothesisAuthority, hypothesisAuthority) &&
        contract.hypotheses.every(
          (hypothesis, index) =>
            hypothesis.id === rawIr.hypotheses[index]?.id &&
            hypothesis.statement === rawIr.hypotheses[index]?.statement &&
            hypothesis.decisivePatternId ===
              rawIr.hypotheses[index]?.predictedPattern.patternId,
        ),
      rawIr.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        patternId: hypothesis.predictedPattern.patternId,
      })),
      "exact learner-approved hypotheses and decisive patterns",
    ),
    invariant(
      "evidence_lineage",
      allEvidenceResolves &&
        contractMatchesApproved &&
        experimentIrMatchesApproved &&
        irEvidence.some((key) => supportEvidence.has(key)),
      {
        allEvidenceResolves,
        contractCount: contractEvidence.length,
        irCount: irEvidence.length,
        contractMatchesApproved,
        experimentIrMatchesApproved,
        approvedEvidenceHash,
        contractEvidenceHash,
        experimentIrEvidenceHash,
        usesPackRoutingEvidence: irEvidence.some((key) =>
          supportEvidence.has(key),
        ),
      },
      {
        contractMatchesApproved: true,
        experimentIrMatchesApproved: true,
        approvedEvidenceHash,
        resolvingArtifactEvidence: true,
        includesSubjectPackRoutingEvidence: true,
      },
      "The Discrimination Contract and Experiment IR must copy the approved Belief Spec evidenceRefs exactly and in order.",
    ),
    invariant(
      "candidate_lineage",
      candidateIdsMatch &&
        candidateIds.every((candidateId) =>
          allowedCandidateIds.has(candidateId),
        ) &&
        rawIr.candidateExperiments.every(
          (candidate) =>
            candidate.operationIds.every((operation) =>
              pack.allowedOperations.includes(operation),
            ) &&
            candidate.observableIds.every((metric) =>
              pack.allowedMetrics.includes(metric),
            ),
        ) &&
        rawIr.visualizations.every((visualization) =>
          pack.allowedVisualizations.includes(visualization),
        ),
      {
        candidateIdsMatch,
        contractCandidateIdsHash,
        experimentIrCandidateIdsHash,
        candidates: rawIr.candidateExperiments.map((candidate) => ({
          id: candidate.id,
          operationIds: candidate.operationIds,
          observableIds: candidate.observableIds,
        })),
        visualizations: rawIr.visualizations,
        boundarySweepRequested: rawIr.boundarySweep !== undefined,
      },
      {
        candidateIdsMatch: true,
        allowedCandidateIds: pack.scientificMethod.candidateExperimentIds,
        allowedOperationIds: pack.allowedOperations,
        allowedObservableIds: pack.allowedMetrics,
        allowedVisualizations: pack.allowedVisualizations,
        boundarySweepHandledSeparately: true,
      },
    ),
    ...(bundle.conceptPack.transferTask === undefined
      ? []
      : [
          invariant(
            "transfer_contract",
            transferContractMatches &&
              bundleTransferContractMatches &&
              sceneTransferBindingsMatch,
            {
              taskId: rawIr.transfer.taskId,
              transferContractHash,
              transferContractMatches,
              bundleTransferContractMatches,
              sceneTransferBlockCount: sceneTransferEvaluatorIds.length,
              sceneTransferEvaluatorHash,
              sceneTransferBindingsMatch,
            },
            {
              taskId: expectedTransferContract.taskId,
              transferContractHash: expectedTransferContractHash,
              transferContractMatches: true,
              bundleTransferContractMatches: true,
              evaluatorTaskId: pack.transferTask.evaluatorTaskId,
              sceneTransferBindingsMatch: true,
            },
            "The Experiment IR must copy the complete frozen Subject Pack transfer contract, and any Transfer scene block must use the fixed evaluator.",
          ),
        ]),
    (() => {
      const request = rawIr.boundarySweep;
      const declared = bundle.conceptPack.boundarySweep;
      const contract =
        request === undefined
          ? undefined
          : pack.scientificMethod.epistemic.policy.boundarySweeps.find(
              (candidate) => candidate.sweepId === request.sweepId,
            );
      const matchesRegisteredContract =
        request !== undefined &&
        contract !== undefined &&
        sameJson(contract.axisIds, request.axisIds) &&
        contract.gridPresetId === request.gridPresetId &&
        contract.observableId === request.observableId &&
        contract.maxCells === request.maxCells;
      const authorized =
        declared === undefined
          ? request === undefined || matchesRegisteredContract
          : request !== undefined &&
            sameJson(declared, request) &&
            matchesRegisteredContract;
      return invariant(
        "boundary_sweep_contract",
        authorized,
        request ?? null,
        declared ?? contract ?? null,
        authorized
          ? undefined
          : "The Experiment IR must include the exact frozen Boundary Sweep declared by the compiler bundle and Subject Pack.",
      );
    })(),
    invariant(
      "lab_scene_provenance",
      scene.provenance.discriminationContractHash === contractHash &&
        scene.provenance.experimentIrHash === rawIrHash,
      {
        contractHashMatches:
          scene.provenance.discriminationContractHash === contractHash,
        rawIrHashMatches: scene.provenance.experimentIrHash === rawIrHash,
      },
      { contractHashMatches: true, rawIrHashMatches: true },
    ),
    invariant(
      "scene_draft_authority",
      scene.sessionId === bundle.sessionId &&
        scene.concept === pack.id &&
        scene.supportLabel !== "VERIFIED_TEST" &&
        !scene.blocks.some((block) => block.type === "ProofBadge") &&
        scene.blocks
          .filter((block) => block.type === "Hypothesis")
          .every(
            (block) =>
              block.current ===
                bundle.approvedBeliefSpec.hypotheses[0].statement &&
              block.competing ===
                bundle.approvedBeliefSpec.hypotheses[1].statement,
          ) &&
        scene.blocks
          .filter((block) => block.type === "WhyThisTest")
          .every((block) => block.text === contract.whyThisTest) &&
        scene.blocks.some((block) => block.type === "Hypothesis") &&
        scene.blocks.some((block) => block.type === "WhyThisTest"),
      {
        supportLabel: scene.supportLabel,
      },
      "an unverified scene bound to the raw IR, contract, hypotheses, and Why this test copy",
    ),
  ];

  if (checks.some((check) => !check.passed)) {
    return {
      disposition: "REPAIRABLE_REJECTION",
      report: await rejectionReport(input.artifacts, checks, {
        verifierVersion,
      }),
    };
  }

  const selection = scoreExperiments({
    beliefSpec: bundle.approvedBeliefSpec,
    beliefSpecHash,
    ir: rawIr,
    policy: pack.scientificMethod.scoringPolicy,
  });
  if (selection.selectedCandidateId === null) {
    const selectionCheck = invariant(
      "decisive_candidate_selection",
      false,
      selection.rejectedCandidates,
      `one candidate above separation ${selection.requiredSeparation}`,
      "INCONCLUSIVE_NO_DECISIVE_TEST: no proposed candidate passed the fixed scorer.",
    );
    const report = await rejectionReport(
      input.artifacts,
      [...checks, selectionCheck],
      {
        reasonCode: "INCONCLUSIVE_NO_DECISIVE_TEST",
        selection,
        verifierVersion,
      },
    );
    return {
      disposition: "INCONCLUSIVE_NO_DECISIVE_TEST",
      report,
      selection,
    };
  }

  const selectedIr = applyExperimentSelection(rawIr, selection);
  const executionPlan = projectExperimentIRV5ToPlanV2(selectedIr);
  const selectedCandidate = selectedIr.candidateExperiments.find(
    (candidate) => candidate.id === selection.selectedCandidateId,
  );
  if (selectedCandidate === undefined) {
    throw new TypeError("fixed scorer selected an unresolved candidate");
  }
  const selectedSemantics = selectedExecutionSemantics(
    selectedIr,
    executionPlan,
    bundle.conceptPack.fixedExecutionContract !== undefined,
  );
  const sceneResultBindings = fixedSceneResultBindingManifest(
    scene,
    executionPlan,
  );
  const nonClaimsMatch = sameSet(contract.nonClaims, selectedIr.nonClaims);
  const [contractNonClaimsHash, experimentIrNonClaimsHash] = await Promise.all([
    hashCanonical(contract.nonClaims),
    hashCanonical(selectedIr.nonClaims),
  ]);
  const declaredInconclusiveOutcomes = canonicalInconclusiveOutcomes(
    selectedIr.inconclusiveConditions.map((condition) => ({
      conditionId: condition.id,
      description: condition.description,
      ...(condition.nextExperimentId === undefined
        ? {}
        : { nextExperimentId: condition.nextExperimentId }),
    })),
  );
  const fixedInconclusiveOutcomes = canonicalInconclusiveOutcomes(
    pack.scientificMethod.fixedExecutionContract.inconclusiveOutcomes,
  );
  const fixedInconclusiveConditionIds = fixedInconclusiveOutcomes.map(
    (outcome) => outcome.conditionId,
  );
  const postSelectionChecks = [
    invariant(
      "discrimination_binding",
      contract.candidateExperimentIds.includes(selectedCandidate.id) &&
        sameSet(
          contract.changedVariableIds,
          selectedCandidate.changedVariableIds,
        ) &&
        sameSet(
          contract.controlledVariableIds,
          selectedCandidate.heldConstantIds,
        ) &&
        sameSet(contract.observableIds, selectedCandidate.observableIds) &&
        sameSet(
          contract.inconclusiveConditionIds,
          selectedCandidate.inconclusiveConditionIds,
        ) &&
        nonClaimsMatch,
      {
        candidateExperimentIds: contract.candidateExperimentIds,
        selectedCandidateId: selectedCandidate.id,
        changedVariableIds: contract.changedVariableIds,
        controlledVariableIds: contract.controlledVariableIds,
        observableIds: contract.observableIds,
        inconclusiveConditionIds: contract.inconclusiveConditionIds,
        nonClaimsMatch,
        contractNonClaimsHash,
        experimentIrNonClaimsHash,
      },
      {
        candidateExperimentIds: selectedIr.candidateExperiments.map(
          (candidate) => candidate.id,
        ),
        selectedCandidateId: selectedCandidate.id,
        changedVariableIds: selectedCandidate.changedVariableIds,
        controlledVariableIds: selectedCandidate.heldConstantIds,
        observableIds: selectedCandidate.observableIds,
        inconclusiveConditionIds: selectedCandidate.inconclusiveConditionIds,
        nonClaimsMatch: true,
      },
      "The Discrimination Contract must exactly bind the fixed-selected candidate and copy Experiment IR non-claims verbatim.",
    ),
    ...(bundle.conceptPack.fixedExecutionContract === undefined
      ? []
      : [
          invariant(
            "epistemic_outcome_coverage",
            sameSet(
              selectedCandidate.inconclusiveConditionIds,
              fixedInconclusiveConditionIds,
            ) &&
              sameJson(declaredInconclusiveOutcomes, fixedInconclusiveOutcomes),
            {
              selectedConditionIds: selectedCandidate.inconclusiveConditionIds,
              inconclusiveOutcomes: declaredInconclusiveOutcomes,
            },
            {
              selectedConditionIds: fixedInconclusiveConditionIds,
              inconclusiveOutcomes: fixedInconclusiveOutcomes,
            },
            "The selected experiment must represent every inconclusive outcome emitted by the fixed Subject Pack classifier, with the exact description and follow-up experiment binding.",
          ),
        ]),
    invariant(
      "selected_execution_semantics",
      selectedSemantics.passed,
      selectedSemantics.observed,
      selectedSemantics.expected,
      "The fixed-selected candidate does not compose the complete Subject Pack execution contract.",
    ),
    ...(bundle.conceptPack.fixedExecutionContract === undefined
      ? []
      : [
          invariant(
            "lab_scene_result_binding_manifest",
            sceneResultBindings.passed,
            sceneResultBindings.observed,
            sceneResultBindings.expected,
            "The generated Lab Scene must compare at least two selected runs through exact fixed-result metric bindings and may not bind unsupported result surfaces.",
          ),
        ]),
    invariant(
      "projected_plan_binding",
      executionPlan.sessionId === bundle.sessionId &&
        executionPlan.artifactManifestHash === manifestHash &&
        executionPlan.beliefTestId === bundle.approvedBeliefSpec.id &&
        executionPlan.concept === pack.id &&
        executionPlan.conceptPackVersion === pack.version &&
        sameJson(executionPlan.evidenceRefs, selectedIr.evidenceRefs) &&
        sameJson(executionPlan.resourceLimits, bundle.resourceLimits),
      {
        sessionId: executionPlan.sessionId,
        concept: executionPlan.concept,
        packVersion: executionPlan.conceptPackVersion,
      },
      {
        sessionId: bundle.sessionId,
        concept: pack.id,
        packVersion: pack.version,
      },
    ),
  ];
  const allChecks = [...checks, ...postSelectionChecks];
  if (postSelectionChecks.some((check) => !check.passed)) {
    return {
      disposition: "REPAIRABLE_REJECTION",
      selection,
      report: await rejectionReport(input.artifacts, allChecks, {
        selection,
        verifierVersion,
      }),
    };
  }

  const [selectionHash, selectedIrHash, executionPlanHash, labSceneHash] =
    await Promise.all([
      hashCanonical(selection),
      hashExperimentIR(selectedIr),
      hashCanonical(executionPlan),
      hashCanonical(scene),
    ]);
  const report: ScientificCandidateReportV1 = {
    schemaVersion: "1",
    status: "VERIFIED",
    reasonCode: "SELECTED",
    verifierVersion,
    discriminationContractHash: contractHash,
    rawExperimentIrHash: rawIrHash,
    labSceneHash,
    selectionHash,
    selectedIrHash,
    executionPlanHash,
    invariantCount: allChecks.length,
    invariants: allChecks,
  };
  return {
    disposition: "VERIFIED",
    report,
    selection,
    selectedIr,
    selectedIrHash,
    executionPlan,
    executionPlanHash,
  };
}
