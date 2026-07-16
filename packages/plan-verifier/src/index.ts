import {
  ArtifactManifestSchema,
  ExperimentPlanV2Schema,
  HostedVerifiedResultSetV2Schema,
  PatchPlanV1Schema,
  type ArtifactManifest,
  type BeliefTest,
  type EvidenceRef,
  type ExperimentPlanV2,
  type HostedImbalanceVerifiedResultSetV2,
  type HostedLeakageVerifiedResultSetV2,
  type HostedVerifiedResultSetV2,
  type PatchOperationId,
  type PatchPlanV1,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  projectExperimentIRV5ToPlanV2,
} from "@counterlab/experiment-ir";
import { hashCanonical } from "@counterlab/session-core";

import {
  EpistemicVerificationReportV1Schema,
  EpistemicPresentationV1Schema,
  evaluateVerifiedEpistemicEvidence,
  technicalFailureEpistemicReport,
  type EpistemicVerificationReport,
} from "./epistemic.js";

export * from "./scientific-candidate.js";

export { EpistemicPresentationV1Schema, EpistemicVerificationReportV1Schema };
export type {
  EpistemicFinding,
  EpistemicVerificationReport,
} from "./epistemic.js";

export type PlanInvariant = {
  name: string;
  passed: boolean;
  observed: unknown;
  expected: unknown;
  counterexample?: string;
};

export type PlanVerificationReport = {
  schemaVersion: "1";
  status: "VERIFIED" | "REJECTED";
  verifierVersion: "hosted-plan-verifier-v1";
  planHash: string;
  invariantCount: number;
  invariants: PlanInvariant[];
};

export class PlanVerificationError extends Error {
  constructor(
    message: string,
    readonly report: PlanVerificationReport,
  ) {
    super(message);
    this.name = "PlanVerificationError";
  }
}

export type ExperimentPlanVerificationContext = {
  sessionId: string;
  manifest: ArtifactManifest;
  beliefTest: BeliefTest;
};

export type ResultVerificationReport = {
  schemaVersion: "1";
  status: "VERIFIED" | "REJECTED";
  verifierVersion: "hosted-result-verifier-v1";
  resultHash: string;
  invariantCount: number;
  invariants: PlanInvariant[];
};

export class ResultVerificationError extends Error {
  constructor(
    message: string,
    readonly report: ResultVerificationReport,
  ) {
    super(message);
    this.name = "ResultVerificationError";
  }
}

function invariant(
  name: string,
  passed: boolean,
  observed: unknown,
  expected: unknown,
  counterexample?: string,
): PlanInvariant {
  return {
    name,
    passed,
    observed: canonicalDiagnosticValue(observed),
    expected: canonicalDiagnosticValue(expected),
    ...(counterexample === undefined ? {} : { counterexample }),
  };
}

function canonicalDiagnosticValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) return value.map(canonicalDiagnosticValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        canonicalDiagnosticValue(nested),
      ]),
    );
  }
  return String(value);
}

async function evidenceResolves(
  evidence: EvidenceRef,
  manifest: ArtifactManifest,
  learnerClaim: string,
): Promise<boolean> {
  if (evidence.kind === "schema") {
    return evidence.hash === (await hashCanonical(manifest.schemaSummary));
  }
  if (evidence.kind === "learner_claim") {
    return evidence.hash === (await hashCanonical(learnerClaim));
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

async function allEvidenceApproved(
  plan: Pick<ExperimentPlanV2, "evidenceRefs">,
  beliefTest: BeliefTest,
  manifest: ArtifactManifest,
): Promise<{ passed: boolean; counterexample?: string }> {
  const approvedHashes = new Set(
    await Promise.all(beliefTest.evidenceRefs.map(hashCanonical)),
  );
  for (const evidence of plan.evidenceRefs) {
    if (!approvedHashes.has(await hashCanonical(evidence))) {
      return {
        passed: false,
        counterexample: `Plan evidence ${evidence.hash.slice(0, 12)} is not in the approved Belief Test.`,
      };
    }
    if (
      !(await evidenceResolves(evidence, manifest, beliefTest.learnerClaim))
    ) {
      return {
        passed: false,
        counterexample: `Plan evidence ${evidence.hash.slice(0, 12)} does not resolve to the Artifact Manifest.`,
      };
    }
  }
  return { passed: true };
}

export type PatchPlanVerificationReport = {
  schemaVersion: "1";
  status: "VERIFIED" | "REJECTED";
  verifierVersion: "hosted-patch-plan-verifier-v1";
  planHash: string;
  invariantCount: number;
  invariants: PlanInvariant[];
};

export class PatchPlanVerificationError extends Error {
  constructor(
    message: string,
    readonly report: PatchPlanVerificationReport,
  ) {
    super(message);
    this.name = "PatchPlanVerificationError";
  }
}

export type PatchPlanVerificationContext = {
  sessionId: string;
  manifest: ArtifactManifest;
  beliefTest: BeliefTest;
  verifiedResultHash: string;
  transferResultHash: string;
  conceptPackVersion: string;
  allowedTransformations: readonly PatchOperationId[];
  allowedCellIndices: number[];
};

export async function verifyPatchPlan(
  input: unknown,
  context: PatchPlanVerificationContext,
): Promise<PatchPlanVerificationReport> {
  const parsed = PatchPlanV1Schema.safeParse(input);
  if (!parsed.success) {
    const report: PatchPlanVerificationReport = {
      schemaVersion: "1",
      status: "REJECTED",
      verifierVersion: "hosted-patch-plan-verifier-v1",
      planHash: await hashCanonical(input),
      invariantCount: 1,
      invariants: [
        invariant(
          "structural_schema",
          false,
          parsed.error.issues[0]?.message ?? "invalid patch plan",
          "Patch Plan v1",
        ),
      ],
    };
    throw new PatchPlanVerificationError(
      "Patch Plan schema was rejected",
      report,
    );
  }
  const plan: PatchPlanV1 = parsed.data;
  const manifestHash = await hashCanonical(context.manifest);
  const evidence = await allEvidenceApproved(
    plan,
    context.beliefTest,
    context.manifest,
  );
  const allowedCells = new Set(context.allowedCellIndices);
  const targetCells = new Set(plan.targetCells);
  const targetCellEvidence = context.manifest.cells.filter((cell) =>
    targetCells.has(cell.index),
  );
  const declaredOperations = new Set(plan.operations.map((item) => item.id));
  const allowedOperations = new Set(context.allowedTransformations);
  const invariants: PlanInvariant[] = [
    invariant(
      "patch_lineage",
      plan.sessionId === context.sessionId &&
        plan.artifactManifestHash === manifestHash &&
        plan.sourceArtifactHash === context.manifest.fileSha256 &&
        plan.verifiedResultHash === context.verifiedResultHash &&
        plan.transferResultHash === context.transferResultHash &&
        plan.conceptPackVersion === context.conceptPackVersion,
      {
        sessionId: plan.sessionId,
        artifactManifestHash: plan.artifactManifestHash,
        sourceArtifactHash: plan.sourceArtifactHash,
        verifiedResultHash: plan.verifiedResultHash,
        transferResultHash: plan.transferResultHash,
      },
      {
        sessionId: context.sessionId,
        artifactManifestHash: manifestHash,
        sourceArtifactHash: context.manifest.fileSha256,
        verifiedResultHash: context.verifiedResultHash,
        transferResultHash: context.transferResultHash,
      },
    ),
    invariant(
      "belief_and_evidence_lineage",
      plan.concept === context.beliefTest.concept &&
        !context.beliefTest.uncertainty.insufficientEvidence &&
        evidence.passed,
      plan.evidenceRefs.map((item) => item.hash),
      context.beliefTest.evidenceRefs.map((item) => item.hash),
      evidence.counterexample,
    ),
    invariant(
      "registered_transformations",
      declaredOperations.size === allowedOperations.size &&
        [...declaredOperations].every((item) => allowedOperations.has(item)),
      [...declaredOperations],
      [...allowedOperations],
    ),
    invariant(
      "allowed_cell_scope",
      targetCells.size === plan.targetCells.length &&
        [...targetCells].every((index) => allowedCells.has(index)) &&
        plan.operations.every((operation) =>
          targetCells.has(operation.cellIndex),
        ),
      plan.targetCells,
      context.allowedCellIndices,
    ),
    invariant(
      "evaluation_cell_resolved",
      targetCellEvidence.length === targetCells.size &&
        targetCellEvidence.some(
          (cell) =>
            cell.symbols.includes("train_test_split") ||
            cell.sourceExcerpt.includes("train_test_split"),
        ),
      targetCellEvidence.map((cell) => ({
        index: cell.index,
        symbols: cell.symbols,
      })),
      "one allowed target cell containing train_test_split",
    ),
    invariant(
      "schema_fields_resolved",
      context.manifest.schemaSummary.targetCandidates.includes(
        plan.targetField,
      ) &&
        (plan.concept === "class_imbalance" ||
          context.manifest.schemaSummary.entityCandidates.includes(
            plan.entityField,
          )),
      {
        ...(plan.concept === "entity_leakage"
          ? { entityField: plan.entityField }
          : {}),
        targetField: plan.targetField,
      },
      {
        entityCandidates: context.manifest.schemaSummary.entityCandidates,
        targetCandidates: context.manifest.schemaSummary.targetCandidates,
      },
    ),
  ];
  const report: PatchPlanVerificationReport = {
    schemaVersion: "1",
    status: invariants.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    verifierVersion: "hosted-patch-plan-verifier-v1",
    planHash: await hashCanonical(plan),
    invariantCount: invariants.length,
    invariants,
  };
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new PatchPlanVerificationError(
      failed?.counterexample ??
        `Patch Plan failed invariant ${failed?.name ?? "unknown"}`,
      report,
    );
  }
  return report;
}

async function verifyImbalanceExperimentPlan(
  plan: ExperimentPlanV2,
  context: ExperimentPlanVerificationContext,
): Promise<PlanVerificationReport> {
  const pack = getConceptPack("class_imbalance");
  const runs = [plan.baseline, ...plan.interventions];
  type ImbalanceRunSpec = Extract<
    ExperimentPlanV2["baseline"],
    { concept: "class_imbalance" }
  >;
  const imbalanceRuns = runs.filter(
    (run): run is ImbalanceRunSpec => run.concept === "class_imbalance",
  );
  const byOperation = new Map(imbalanceRuns.map((run) => [run.operation, run]));
  const expectedOperations = [
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
  ] as const;
  const requiredMetrics = new Set(pack.allowedMetrics);
  const requiredViews = new Set(pack.allowedVisualizations);
  const evidence = await allEvidenceApproved(
    plan,
    context.beliefTest,
    context.manifest,
  );
  const manifestHash = await hashCanonical(context.manifest);
  const majority = byOperation.get("imbalance.majority_baseline");
  const stratified = byOperation.get("imbalance.stratified_holdout");
  const threshold = byOperation.get("imbalance.threshold_sweep");
  const prevalence = byOperation.get("imbalance.prevalence_sweep");
  const operationCounts = new Map<string, number>();
  for (const run of imbalanceRuns) {
    operationCounts.set(
      run.operation,
      (operationCounts.get(run.operation) ?? 0) + 1,
    );
  }
  const invariants: PlanInvariant[] = [
    invariant(
      "session_lineage",
      plan.sessionId === context.sessionId,
      plan.sessionId,
      context.sessionId,
      plan.sessionId === context.sessionId
        ? undefined
        : "The plan session lineage does not match this runner job.",
    ),
    invariant(
      "artifact_manifest_lineage",
      plan.artifactManifestHash === manifestHash,
      plan.artifactManifestHash,
      manifestHash,
    ),
    invariant(
      "belief_test_lineage",
      plan.beliefTestId === context.beliefTest.id &&
        context.beliefTest.concept === "class_imbalance" &&
        !context.beliefTest.uncertainty.insufficientEvidence,
      { id: plan.beliefTestId, concept: plan.concept },
      { id: context.beliefTest.id, concept: context.beliefTest.concept },
    ),
    invariant(
      "resolved_approved_evidence",
      evidence.passed,
      plan.evidenceRefs.map((reference) => reference.hash),
      context.beliefTest.evidenceRefs.map((reference) => reference.hash),
      evidence.counterexample,
    ),
    invariant(
      "concept_pack_version",
      plan.conceptPackVersion === pack.version,
      plan.conceptPackVersion,
      pack.version,
    ),
    invariant(
      "concept_run_binding",
      imbalanceRuns.length === runs.length,
      runs.map((run) => run.concept),
      "every run bound to class_imbalance",
    ),
    invariant(
      "required_operations",
      expectedOperations.every(
        (operation) => operationCounts.get(operation) === 1,
      ) && imbalanceRuns.length === expectedOperations.length,
      imbalanceRuns.map((run) => run.operation),
      expectedOperations,
      "The plan must include one majority baseline, stratified holdout, threshold sweep, and prevalence sweep.",
    ),
    invariant(
      "majority_baseline",
      plan.baseline.concept === "class_imbalance" &&
        plan.baseline.operation === "imbalance.majority_baseline" &&
        plan.baseline.model === "majority_baseline" &&
        plan.baseline.prevalenceScenario === "observed",
      plan.baseline,
      "observed-prevalence majority baseline",
    ),
    invariant(
      "stratified_holdout",
      stratified?.model === "logistic_regression" &&
        stratified.prevalenceScenario === "observed",
      stratified ?? null,
      "logistic regression on the observed stratified holdout",
    ),
    invariant(
      "threshold_intervention",
      threshold?.model === "logistic_regression" &&
        threshold.prevalenceScenario === "observed" &&
        stratified !== undefined &&
        threshold.threshold !== stratified.threshold,
      threshold ?? null,
      "same observed holdout with a changed decision threshold",
    ),
    invariant(
      "prevalence_intervention",
      prevalence?.model === "logistic_regression" &&
        prevalence.prevalenceScenario !== "observed" &&
        threshold !== undefined &&
        prevalence.threshold === threshold.threshold,
      prevalence ?? null,
      "same threshold under a changed prevalence scenario",
    ),
    invariant(
      "controlled_seed",
      imbalanceRuns.length > 0 &&
        imbalanceRuns.every((run) => run.seed === imbalanceRuns[0]?.seed),
      imbalanceRuns.map((run) => run.seed),
      "one shared deterministic seed",
    ),
    invariant(
      "required_metrics",
      plan.metrics.length === requiredMetrics.size &&
        plan.metrics.every((metric) => requiredMetrics.has(metric)),
      plan.metrics,
      pack.allowedMetrics,
    ),
    invariant(
      "required_visualizations",
      plan.visualizations.length === requiredViews.size &&
        plan.visualizations.every((view) => requiredViews.has(view)),
      plan.visualizations,
      pack.allowedVisualizations,
    ),
    invariant(
      "target_resolved",
      context.manifest.schemaSummary.targetCandidates.length > 0,
      context.manifest.schemaSummary.targetCandidates,
      "at least one target field",
    ),
    invariant(
      "resource_run_limit",
      plan.resourceLimits.maxRuns >= runs.length,
      plan.resourceLimits.maxRuns,
      runs.length,
    ),
  ];
  const report: PlanVerificationReport = {
    schemaVersion: "1",
    status: invariants.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    verifierVersion: "hosted-plan-verifier-v1",
    planHash: await hashCanonical(plan),
    invariantCount: invariants.length,
    invariants,
  };
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new PlanVerificationError(
      failed?.counterexample ??
        `Experiment Plan failed invariant ${failed?.name ?? "unknown"}`,
      report,
    );
  }
  return report;
}

export async function verifyExperimentPlan(
  input: unknown,
  context: ExperimentPlanVerificationContext,
): Promise<PlanVerificationReport> {
  const parsed = ExperimentPlanV2Schema.safeParse(input);
  if (!parsed.success) {
    const report: PlanVerificationReport = {
      schemaVersion: "1",
      status: "REJECTED",
      verifierVersion: "hosted-plan-verifier-v1",
      planHash: await hashCanonical(input),
      invariantCount: 1,
      invariants: [
        invariant(
          "structural_schema",
          false,
          parsed.error.issues[0]?.message ?? "invalid plan",
          "Experiment Plan v2",
        ),
      ],
    };
    throw new PlanVerificationError(
      "Experiment Plan schema was rejected",
      report,
    );
  }
  const plan = parsed.data;
  if (plan.concept === "class_imbalance") {
    return verifyImbalanceExperimentPlan(plan, context);
  }
  const pack = getConceptPack(plan.concept);
  const runs = [plan.baseline, ...plan.interventions];
  const groupRuns = runs.filter(
    (run) => run.operation === "leakage.group_holdout",
  );
  const ablationRuns = runs.filter(
    (run) => run.operation === "leakage.identity_ablation",
  );
  const evidence = await allEvidenceApproved(
    plan,
    context.beliefTest,
    context.manifest,
  );
  const baseline = plan.baseline;
  const controlledRuns = runs.filter(
    (run) =>
      run.seed !== baseline.seed ||
      run.model !== baseline.model ||
      (run.concept === "entity_leakage" &&
        baseline.concept === "entity_leakage" &&
        (run.testFraction !== baseline.testFraction ||
          run.entityField !== baseline.entityField)),
  );
  const groupChangesIdentity = groupRuns.some(
    (run) =>
      run.concept === "entity_leakage" &&
      baseline.concept === "entity_leakage" &&
      run.dropIdentity !== baseline.dropIdentity,
  );
  const operations = new Set(pack.allowedOperations);
  const metrics = new Set(pack.allowedMetrics);
  const visualizations = new Set(pack.allowedVisualizations);
  const manifestHash = await hashCanonical(context.manifest);
  const invariants: PlanInvariant[] = [
    invariant(
      "session_lineage",
      plan.sessionId === context.sessionId,
      plan.sessionId,
      context.sessionId,
      plan.sessionId === context.sessionId
        ? undefined
        : "The plan session lineage does not match this runner job.",
    ),
    invariant(
      "artifact_manifest_lineage",
      plan.artifactManifestHash === manifestHash,
      plan.artifactManifestHash,
      manifestHash,
    ),
    invariant(
      "belief_test_lineage",
      plan.beliefTestId === context.beliefTest.id &&
        plan.concept === context.beliefTest.concept &&
        !context.beliefTest.uncertainty.insufficientEvidence,
      { id: plan.beliefTestId, concept: plan.concept },
      { id: context.beliefTest.id, concept: context.beliefTest.concept },
    ),
    invariant(
      "resolved_approved_evidence",
      evidence.passed,
      plan.evidenceRefs.map((reference) => reference.hash),
      context.beliefTest.evidenceRefs.map((reference) => reference.hash),
      evidence.counterexample,
    ),
    invariant(
      "concept_pack_version",
      plan.conceptPackVersion === pack.version,
      plan.conceptPackVersion,
      pack.version,
    ),
    invariant(
      "registered_operations",
      runs.every((run) => operations.has(run.operation)),
      runs.map((run) => run.operation),
      pack.allowedOperations,
    ),
    invariant(
      "registered_metrics",
      plan.metrics.every((metric) => metrics.has(metric)),
      plan.metrics,
      pack.allowedMetrics,
    ),
    invariant(
      "registered_visualizations",
      plan.visualizations.every((view) => visualizations.has(view)),
      plan.visualizations,
      pack.allowedVisualizations,
    ),
    invariant(
      "random_row_baseline",
      baseline.operation === "leakage.random_row_split" &&
        baseline.concept === "entity_leakage" &&
        !baseline.dropIdentity,
      baseline.operation,
      "leakage.random_row_split with identity retained",
    ),
    invariant(
      "group_holdout_present",
      groupRuns.length === 1,
      groupRuns.length,
      1,
      groupRuns.length === 0
        ? "No customer-group holdout can discriminate new-entity performance."
        : undefined,
    ),
    invariant(
      "identity_ablation_present",
      ablationRuns.length === 1 &&
        ablationRuns[0]?.concept === "entity_leakage" &&
        ablationRuns[0].dropIdentity,
      ablationRuns.length,
      1,
    ),
    invariant(
      "controlled_comparison",
      controlledRuns.length === 0 && !groupChangesIdentity,
      {
        changedControlRuns: controlledRuns.map((run) => run.runId),
        groupChangesIdentity,
      },
      { changedControlRuns: [], groupChangesIdentity: false },
      controlledRuns.length > 0
        ? `${controlledRuns[0]?.runId ?? "A run"} changes a controlled seed, model, entity field, or test fraction.`
        : groupChangesIdentity
          ? "The group holdout also removes identity, so the split effect is not isolated."
          : undefined,
    ),
    invariant(
      "entity_field_resolved",
      runs.every(
        (run) =>
          run.concept !== "entity_leakage" ||
          context.manifest.schemaSummary.entityCandidates.includes(
            run.entityField,
          ),
      ),
      runs
        .filter((run) => run.concept === "entity_leakage")
        .map((run) => run.entityField),
      context.manifest.schemaSummary.entityCandidates,
    ),
  ];
  const report: PlanVerificationReport = {
    schemaVersion: "1",
    status: invariants.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    verifierVersion: "hosted-plan-verifier-v1",
    planHash: await hashCanonical(plan),
    invariantCount: invariants.length,
    invariants,
  };
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new PlanVerificationError(
      failed?.counterexample ??
        `Experiment Plan failed invariant ${failed?.name ?? "unknown"}`,
      report,
    );
  }
  return report;
}

function resultReport(
  resultHash: string,
  invariants: PlanInvariant[],
): ResultVerificationReport {
  return {
    schemaVersion: "1",
    status: invariants.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    verifierVersion: "hosted-result-verifier-v1",
    resultHash,
    invariantCount: invariants.length,
    invariants,
  };
}

async function verifyImbalanceHostedResult(
  result: HostedImbalanceVerifiedResultSetV2,
  plan: ExperimentPlanV2,
  requireDecisiveOutcome: boolean,
): Promise<ResultVerificationReport> {
  type ImbalanceRunSpec = Extract<
    ExperimentPlanV2["baseline"],
    { concept: "class_imbalance" }
  >;
  const planRuns = [plan.baseline, ...plan.interventions];
  const imbalanceSpecs = planRuns.filter(
    (run): run is ImbalanceRunSpec => run.concept === "class_imbalance",
  );
  const resultById = new Map(result.runs.map((run) => [run.id, run]));
  const byOperation = new Map(result.runs.map((run) => [run.operation, run]));
  const runBindings = imbalanceSpecs.map((spec) => {
    const run = resultById.get(spec.runId);
    return (
      run !== undefined &&
      run.operation === spec.operation &&
      run.model === spec.model &&
      run.seed === spec.seed &&
      run.threshold === spec.threshold &&
      run.prevalenceScenario === spec.prevalenceScenario
    );
  });
  const tolerance = 2e-10;
  const close = (left: number, right: number) =>
    Math.abs(left - right) <= tolerance;
  const confusionConsistent = result.runs.every((run) => {
    const { tn, fp, fn, tp } = run.confusionMatrix;
    const total = tn + fp + fn + tp;
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
    return (
      total === run.sampleSizes.test &&
      tn + fp === run.classCounts.test.negative &&
      fn + tp === run.classCounts.test.positive &&
      run.classCounts.train.negative + run.classCounts.train.positive ===
        run.sampleSizes.train &&
      close(run.metrics.accuracy, (tn + tp) / total) &&
      close(run.metrics.precision, precision) &&
      close(run.metrics.recall, recall) &&
      close(run.metrics.f1, f1) &&
      close(run.prevalence, (fn + tp) / total) &&
      close(run.predictedPositiveRate, (fp + tp) / total)
    );
  });
  const majority = byOperation.get("imbalance.majority_baseline");
  const stratified = byOperation.get("imbalance.stratified_holdout");
  const threshold = byOperation.get("imbalance.threshold_sweep");
  const prevalence = byOperation.get("imbalance.prevalence_sweep");
  const majorityValid =
    majority !== undefined &&
    majority.model === "majority_baseline" &&
    majority.confusionMatrix.tp === 0 &&
    majority.confusionMatrix.fp === 0 &&
    majority.metrics.recall === 0 &&
    majority.predictedPositiveRate === 0;
  const thresholdResponds =
    stratified !== undefined &&
    threshold !== undefined &&
    threshold.threshold !== stratified.threshold &&
    (threshold.predictedPositiveRate !== stratified.predictedPositiveRate ||
      threshold.metrics.recall !== stratified.metrics.recall ||
      threshold.metrics.precision !== stratified.metrics.precision);
  const prevalenceResponds =
    threshold !== undefined &&
    prevalence !== undefined &&
    prevalence.prevalenceScenario !== threshold.prevalenceScenario &&
    prevalence.prevalence !== threshold.prevalence &&
    prevalence.inputFingerprint === threshold.inputFingerprint;
  const fixedControlFingerprints =
    majority !== undefined &&
    stratified !== undefined &&
    threshold !== undefined &&
    prevalence !== undefined &&
    majority.evaluationSetFingerprint === stratified.evaluationSetFingerprint &&
    stratified.evaluationSetFingerprint ===
      threshold.evaluationSetFingerprint &&
    prevalence.evaluationSetFingerprint !==
      threshold.evaluationSetFingerprint &&
    stratified.scoreFingerprint === threshold.scoreFingerprint &&
    stratified.pipelineFingerprint === threshold.pipelineFingerprint &&
    threshold.pipelineFingerprint === prevalence.pipelineFingerprint;
  const legacyOutcome =
    getConceptPack(
      "class_imbalance",
    ).scientificMethod.epistemic.classifyOutcome(result);
  const { resultHash: _declaredHash, ...canonicalPayload } = result;
  const canonicalHash = await hashCanonical(canonicalPayload);
  const invariants: PlanInvariant[] = [
    invariant(
      "plan_result_lineage",
      result.planId === plan.planId &&
        result.sessionId === plan.sessionId &&
        result.artifactManifestHash === plan.artifactManifestHash &&
        plan.concept === "class_imbalance" &&
        result.conceptPackVersion === plan.conceptPackVersion,
      {
        planId: result.planId,
        sessionId: result.sessionId,
        artifactManifestHash: result.artifactManifestHash,
      },
      {
        planId: plan.planId,
        sessionId: plan.sessionId,
        artifactManifestHash: plan.artifactManifestHash,
      },
    ),
    invariant(
      "declared_runs_only",
      imbalanceSpecs.length === planRuns.length &&
        result.runs.length === planRuns.length &&
        resultById.size === planRuns.length &&
        runBindings.every(Boolean),
      result.runs.map((run) => ({ id: run.id, operation: run.operation })),
      planRuns.map((run) => ({ id: run.runId, operation: run.operation })),
    ),
    invariant(
      "fixture_fingerprints",
      result.runs.every(
        (run) => run.inputFingerprint === result.fixture.sha256,
      ),
      result.runs.map((run) => run.inputFingerprint),
      result.fixture.sha256,
    ),
    invariant(
      "confusion_metric_consistency",
      confusionConsistent,
      result.runs.map((run) => ({
        id: run.id,
        matrix: run.confusionMatrix,
        metrics: run.metrics,
      })),
      "confusion totals and derived metrics agree",
    ),
    invariant(
      "majority_baseline_behavior",
      majorityValid,
      majority ?? null,
      "computed majority baseline with zero positive predictions",
    ),
    invariant(
      "threshold_response",
      thresholdResponds,
      {
        stratified: stratified?.metrics,
        threshold: threshold?.metrics,
      },
      "changing threshold changes predictions or minority metrics",
    ),
    invariant(
      "prevalence_response",
      prevalenceResponds,
      {
        observed: threshold?.prevalence,
        scenario: prevalence?.prevalence,
      },
      "changed deployment prevalence on the same fixture",
    ),
    invariant(
      "fixed_control_fingerprints",
      fixedControlFingerprints,
      {
        evaluationSets: result.runs.map((run) => ({
          id: run.id,
          fingerprint: run.evaluationSetFingerprint,
        })),
        scores: {
          stratified: stratified?.scoreFingerprint,
          threshold: threshold?.scoreFingerprint,
        },
        pipelines: result.runs.map((run) => ({
          id: run.id,
          fingerprint: run.pipelineFingerprint,
        })),
      },
      "same evaluation set and score vector for threshold comparison; same logistic pipeline across model runs",
    ),
    ...(requireDecisiveOutcome
      ? [
          invariant(
            "discriminating_outcomes",
            legacyOutcome.kind === "HYPOTHESIS_PATTERN",
            legacyOutcome,
            "a fixed Subject Pack hypothesis pattern",
          ),
        ]
      : []),
    invariant(
      "canonical_result_hash",
      result.resultHash === canonicalHash,
      result.resultHash,
      canonicalHash,
      result.resultHash === canonicalHash
        ? undefined
        : "The result bytes do not match the canonical result hash.",
    ),
  ];
  const report = resultReport(result.resultHash, invariants);
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new ResultVerificationError(
      failed?.counterexample ??
        `Hosted imbalance result failed invariant ${failed?.name ?? "unknown"}`,
      report,
    );
  }
  return report;
}

async function verifyHostedResultSetInternal(
  input: unknown,
  plan: ExperimentPlanV2,
  requireDecisiveOutcome: boolean,
): Promise<ResultVerificationReport> {
  const parsed = HostedVerifiedResultSetV2Schema.safeParse(input);
  if (!parsed.success) {
    const report = resultReport(await hashCanonical(input), [
      invariant(
        "structural_schema",
        false,
        parsed.error.issues[0]?.message ?? "invalid result",
        "Hosted Verified Result Set v2",
      ),
    ]);
    throw new ResultVerificationError(
      "Hosted result schema was rejected",
      report,
    );
  }
  const parsedResult: HostedVerifiedResultSetV2 = parsed.data;
  if (parsedResult.concept === "class_imbalance") {
    return verifyImbalanceHostedResult(
      parsedResult as HostedImbalanceVerifiedResultSetV2,
      plan,
      requireDecisiveOutcome,
    );
  }
  const result = parsedResult as HostedLeakageVerifiedResultSetV2;
  const planRuns = [plan.baseline, ...plan.interventions];
  type LeakageRunSpec = Extract<
    (typeof planRuns)[number],
    { concept: "entity_leakage" }
  >;
  const leakageRuns = planRuns.filter(
    (run): run is LeakageRunSpec => run.concept === "entity_leakage",
  );
  const resultById = new Map(result.runs.map((run) => [run.id, run]));
  const baseline = resultById.get(plan.baseline.runId);
  const groupSpecs = leakageRuns.filter(
    (run) => run.operation === "leakage.group_holdout",
  );
  const ablationSpecs = leakageRuns.filter(
    (run) => run.operation === "leakage.identity_ablation",
  );
  const runBindings = planRuns.map((spec) => {
    if (spec.concept !== "entity_leakage") return false;
    const run = resultById.get(spec.runId);
    if (run === undefined) return false;
    const expectedStrategy =
      spec.operation === "leakage.group_holdout" ? "group" : "random";
    const expectedDropFeatures = spec.dropIdentity ? [spec.entityField] : [];
    return (
      run.operation === spec.operation &&
      run.seed === spec.seed &&
      run.model === spec.model &&
      run.splitStrategy === expectedStrategy &&
      run.groupBy ===
        (spec.operation === "leakage.group_holdout"
          ? spec.entityField
          : null) &&
      run.dropFeatures.length === expectedDropFeatures.length &&
      run.dropFeatures.every((feature) =>
        expectedDropFeatures.includes(feature),
      ) &&
      (baseline === undefined ||
        run.pipelineFingerprint === baseline.pipelineFingerprint) &&
      (spec.dropIdentity ||
        baseline === undefined ||
        run.featureSetFingerprint === baseline.featureSetFingerprint)
    );
  });
  const groupRuns = groupSpecs
    .map((spec) => resultById.get(spec.runId))
    .filter((run) => run !== undefined);
  const ablationRuns = ablationSpecs
    .map((spec) => ({ spec, run: resultById.get(spec.runId) }))
    .filter(
      (
        entry,
      ): entry is {
        spec: (typeof ablationSpecs)[number];
        run: HostedLeakageVerifiedResultSetV2["runs"][number];
      } => entry.run !== undefined,
    );
  const fixtureFingerprintsMatch = result.runs.every(
    (run) => run.inputFingerprint === result.fixture.sha256,
  );
  const groupZeroOverlap = groupRuns.every(
    (run) => run.entityOverlap.count === 0 && run.entityOverlap.rate === 0,
  );
  const identityRemoved = ablationRuns.every(
    ({ spec, run }) =>
      run.dropFeatures.includes(spec.entityField) &&
      baseline !== undefined &&
      run.featureSetFingerprint !== baseline.featureSetFingerprint,
  );
  const discriminates =
    baseline !== undefined &&
    groupRuns.length > 0 &&
    [...groupRuns, ...ablationRuns.map(({ run }) => run)].every(
      (run) => baseline.metrics.accuracy > run.metrics.accuracy + 0.1,
    );
  const { resultHash: _declaredHash, ...canonicalPayload } = result;
  const canonicalHash = await hashCanonical(canonicalPayload);
  const invariants: PlanInvariant[] = [
    invariant(
      "plan_result_lineage",
      result.planId === plan.planId &&
        result.sessionId === plan.sessionId &&
        result.artifactManifestHash === plan.artifactManifestHash &&
        result.concept === plan.concept &&
        result.conceptPackVersion === plan.conceptPackVersion,
      {
        planId: result.planId,
        sessionId: result.sessionId,
        artifactManifestHash: result.artifactManifestHash,
      },
      {
        planId: plan.planId,
        sessionId: plan.sessionId,
        artifactManifestHash: plan.artifactManifestHash,
      },
    ),
    invariant(
      "declared_runs_only",
      result.runs.length === planRuns.length &&
        resultById.size === planRuns.length &&
        runBindings.every(Boolean),
      result.runs.map((run) => ({ id: run.id, operation: run.operation })),
      planRuns.map((run) => ({ id: run.runId, operation: run.operation })),
    ),
    invariant(
      "fixture_fingerprints",
      fixtureFingerprintsMatch,
      result.runs.map((run) => run.inputFingerprint),
      result.fixture.sha256,
    ),
    invariant(
      "zero_group_overlap",
      groupRuns.length === groupSpecs.length && groupZeroOverlap,
      groupRuns.map((run) => run.entityOverlap),
      { count: 0, rate: 0 },
      groupZeroOverlap
        ? undefined
        : "A group holdout shared an entity between train and test.",
    ),
    invariant(
      "baseline_overlap_exists",
      baseline !== undefined && baseline.entityOverlap.count > 0,
      baseline?.entityOverlap ?? null,
      "positive entity overlap in the row-split baseline",
    ),
    invariant(
      "identity_feature_removed",
      ablationRuns.length === ablationSpecs.length && identityRemoved,
      ablationRuns.map(({ run }) => ({
        dropFeatures: run.dropFeatures,
        featureSetFingerprint: run.featureSetFingerprint,
      })),
      "the selected entity field is removed and the fingerprint changes",
    ),
    invariant(
      "bounded_kernel_outcomes",
      result.runs.every(
        (run) =>
          Number.isFinite(run.metrics.accuracy) &&
          (run.metrics.rocAuc === null || Number.isFinite(run.metrics.rocAuc)),
      ),
      result.runs.map((run) => ({
        id: run.id,
        accuracy: run.metrics.accuracy,
      })),
      "finite bounded metrics emitted by the fixed kernel",
    ),
    ...(requireDecisiveOutcome
      ? [
          invariant(
            "discriminating_outcomes",
            discriminates,
            result.runs.map((run) => ({
              id: run.id,
              accuracy: run.metrics.accuracy,
            })),
            "baseline accuracy exceeds group holdout and ablation by more than 0.1",
          ),
        ]
      : []),
    invariant(
      "canonical_result_hash",
      result.resultHash === canonicalHash,
      result.resultHash,
      canonicalHash,
      result.resultHash === canonicalHash
        ? undefined
        : "The result bytes do not match the canonical result hash.",
    ),
  ];
  const report = resultReport(result.resultHash, invariants);
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new ResultVerificationError(
      failed?.counterexample ??
        `Hosted result failed invariant ${failed?.name ?? "unknown"}`,
      report,
    );
  }
  return report;
}

/**
 * Legacy hosted release seam. Until a live session carries Belief Spec v2 and
 * Experiment IR v5 end to end, direct Worker callbacks remain restricted to a
 * decisive Subject Pack outcome. The epistemic authority path below may
 * release a declared INCONCLUSIVE verdict after independently validating the
 * same bytes.
 */
export async function verifyHostedResultSet(
  input: unknown,
  plan: ExperimentPlanV2,
): Promise<ResultVerificationReport> {
  return verifyHostedResultSetInternal(input, plan, true);
}

export interface VerifyEpistemicEvidenceInput {
  artifactManifest: unknown;
  sessionId: unknown;
  beliefSpec: unknown;
  ir: unknown;
  result: unknown;
  presentation: unknown;
}

export async function verifyEpistemicEvidence(
  input: VerifyEpistemicEvidenceInput,
): Promise<EpistemicVerificationReport> {
  assertExactEpistemicInput(input);
  const artifactManifest = ArtifactManifestSchema.parse(input.artifactManifest);
  if (typeof input.sessionId !== "string" || input.sessionId.trim() === "") {
    throw new TypeError("epistemic verification sessionId must be non-empty");
  }
  const sessionId = input.sessionId.trim();
  const ir = ExperimentIRV5Schema.parse(input.ir);
  const presentation = EpistemicPresentationV1Schema.parse(input.presentation);
  const executionPlan = projectExperimentIRV5ToPlanV2(ir);
  let technicalReport: ResultVerificationReport;
  try {
    technicalReport = await verifyHostedResultSetInternal(
      input.result,
      executionPlan,
      false,
    );
  } catch (error) {
    if (error instanceof ResultVerificationError) {
      return technicalFailureEpistemicReport(ir, error.report);
    }
    throw error;
  }
  return evaluateVerifiedEpistemicEvidence({
    artifactManifest,
    sessionId,
    beliefSpec: input.beliefSpec,
    ir,
    result: input.result,
    technicalReport,
    presentation,
  });
}

function assertExactEpistemicInput(input: VerifyEpistemicEvidenceInput): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new TypeError("epistemic verification input must be an object");
  }
  const expected = new Set([
    "artifactManifest",
    "sessionId",
    "beliefSpec",
    "ir",
    "result",
    "presentation",
  ]);
  const keys = Object.keys(input as unknown as Record<string, unknown>);
  if (keys.length !== expected.size || keys.some((key) => !expected.has(key))) {
    throw new TypeError(
      "epistemic verification input contains missing or unknown fields",
    );
  }
}

export async function verifyInteractiveResultSet(
  candidate: unknown,
  planCandidate: unknown,
  selectedRunId: string,
): Promise<ResultVerificationReport> {
  const parsedPlan = ExperimentPlanV2Schema.safeParse(planCandidate);
  const parsedResult = HostedVerifiedResultSetV2Schema.safeParse(candidate);
  if (!parsedPlan.success || !parsedResult.success) {
    const issueMessage = !parsedPlan.success
      ? parsedPlan.error.issues[0]?.message
      : !parsedResult.success
        ? parsedResult.error.issues[0]?.message
        : "Unknown structural validation error";
    const report = resultReport("invalid-result", [
      invariant(
        "structural_schema",
        false,
        issueMessage,
        "Experiment Plan v2 and Hosted Verified Result Set v2",
      ),
    ]);
    throw new ResultVerificationError(
      "Interactive result schema was rejected",
      report,
    );
  }
  const plan = parsedPlan.data;
  const result = parsedResult.data;
  if (result.concept !== "entity_leakage") {
    const report = resultReport(result.resultHash, [
      invariant(
        "interactive_supported_concept",
        false,
        result.concept,
        "entity_leakage",
      ),
    ]);
    throw new ResultVerificationError(
      "Interactive result concept is not supported",
      report,
    );
  }
  const spec = [plan.baseline, ...plan.interventions].find(
    (run) => run.runId === selectedRunId,
  );
  const run = result.runs.find((item) => item.id === selectedRunId);
  const leakageSpec = spec?.concept === "entity_leakage" ? spec : undefined;
  const expectedStrategy =
    leakageSpec?.operation === "leakage.group_holdout" ? "group" : "random";
  const selectedBinding =
    leakageSpec !== undefined &&
    run !== undefined &&
    run.operation === leakageSpec.operation &&
    run.seed === leakageSpec.seed &&
    run.model === leakageSpec.model &&
    run.splitStrategy === expectedStrategy &&
    run.groupBy ===
      (expectedStrategy === "group" ? leakageSpec.entityField : null) &&
    run.dropFeatures.includes(leakageSpec.entityField) ===
      leakageSpec.dropIdentity;
  const overlapValid =
    run !== undefined &&
    (expectedStrategy === "group"
      ? run.entityOverlap.count === 0 && run.entityOverlap.rate === 0
      : run.entityOverlap.count > 0 && run.entityOverlap.rate > 0);
  const sampleTotal =
    run === undefined ? 0 : run.sampleSizes.train + run.sampleSizes.test;
  const observedFraction =
    run === undefined || sampleTotal === 0
      ? null
      : run.sampleSizes.test / sampleTotal;
  const sampleFractionValid =
    leakageSpec !== undefined &&
    observedFraction !== null &&
    Math.abs(observedFraction - leakageSpec.testFraction) <= 0.025;
  const { resultHash: _declaredHash, ...canonicalPayload } = result;
  const canonicalHash = await hashCanonical(canonicalPayload);
  const invariants = [
    invariant(
      "interactive_plan_result_lineage",
      result.planId === plan.planId &&
        result.sessionId === plan.sessionId &&
        result.artifactManifestHash === plan.artifactManifestHash &&
        result.conceptPackVersion === plan.conceptPackVersion,
      {
        planId: result.planId,
        sessionId: result.sessionId,
        artifactManifestHash: result.artifactManifestHash,
      },
      {
        planId: plan.planId,
        sessionId: plan.sessionId,
        artifactManifestHash: plan.artifactManifestHash,
      },
    ),
    invariant(
      "interactive_selected_run_binding",
      selectedBinding,
      run ?? null,
      leakageSpec ?? "resolved entity-leakage run",
    ),
    invariant(
      "interactive_overlap_policy",
      overlapValid,
      run?.entityOverlap ?? null,
      expectedStrategy === "group"
        ? { count: 0, rate: 0 }
        : "positive entity overlap for random rows",
    ),
    invariant(
      "interactive_test_fraction",
      sampleFractionValid,
      observedFraction,
      leakageSpec?.testFraction ?? null,
    ),
    invariant(
      "interactive_fixture_fingerprint",
      run?.inputFingerprint === result.fixture.sha256,
      run?.inputFingerprint ?? null,
      result.fixture.sha256,
    ),
    invariant(
      "canonical_result_hash",
      result.resultHash === canonicalHash,
      result.resultHash,
      canonicalHash,
    ),
  ];
  const report = resultReport(result.resultHash, invariants);
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new ResultVerificationError(
      `Interactive result failed invariant ${failed?.name ?? "unknown"}`,
      report,
    );
  }
  return report;
}

export type InteractiveLeakagePlanConfiguration = {
  splitStrategy: "random" | "group";
  entityField: string;
  identityAblation: boolean;
  testFraction: number;
};

/** Verify an exploratory leakage Plan against an already verified base Plan.
 *
 * Exploratory controls may combine group holdout and identity ablation, which
 * is intentionally invalid as the authoritative discriminating comparison.
 * This verifier therefore binds exactly one selected run to the UI controls
 * while requiring every other run and all authoritative lineage to remain
 * byte-for-byte equivalent to the verified base Plan.
 */
export async function verifyInteractiveLeakageExperimentPlan(
  candidateInput: unknown,
  baseInput: unknown,
  configuration: InteractiveLeakagePlanConfiguration,
  context: ExperimentPlanVerificationContext,
): Promise<PlanVerificationReport> {
  const baseReport = await verifyExperimentPlan(baseInput, context);
  const parsedBase = ExperimentPlanV2Schema.safeParse(baseInput);
  const parsedCandidate = ExperimentPlanV2Schema.safeParse(candidateInput);
  const planHash = await hashCanonical(candidateInput);
  if (
    !parsedBase.success ||
    !parsedCandidate.success ||
    parsedBase.data.concept !== "entity_leakage" ||
    parsedCandidate.data.concept !== "entity_leakage"
  ) {
    const report: PlanVerificationReport = {
      schemaVersion: "1",
      status: "REJECTED",
      verifierVersion: "hosted-plan-verifier-v1",
      planHash,
      invariantCount: 1,
      invariants: [
        invariant(
          "interactive_structural_schema",
          false,
          "invalid leakage Plan",
          "Experiment Plan v2 derived from a verified leakage Plan",
        ),
      ],
    };
    throw new PlanVerificationError(
      "Interactive leakage Plan schema was rejected",
      report,
    );
  }
  const base = parsedBase.data;
  const candidate = parsedCandidate.data;
  const targetOperation =
    configuration.splitStrategy === "group"
      ? "leakage.group_holdout"
      : configuration.identityAblation
        ? "leakage.identity_ablation"
        : "leakage.random_row_split";
  const baseRuns = [base.baseline, ...base.interventions];
  const candidateRuns = [candidate.baseline, ...candidate.interventions];
  const selected = candidateRuns.find((run) =>
    run.runId.startsWith("interactive_"),
  );
  const baseByOperation = new Map(
    baseRuns.map((run) => [run.operation, run] as const),
  );
  const changedRuns = candidateRuns.filter((run) => {
    const original = baseByOperation.get(run.operation);
    if (original === undefined) return true;
    const permitted =
      run.operation === targetOperation
        ? {
            ...original,
            runId: run.runId,
            testFraction: configuration.testFraction,
            dropIdentity: configuration.identityAblation,
            entityField: configuration.entityField,
          }
        : original;
    return JSON.stringify(run) !== JSON.stringify(permitted);
  });
  const envelopeKeys = Object.keys(base).filter(
    (key) =>
      ![
        "planId",
        "baseline",
        "interventions",
        "controlledVariables",
        "changedVariables",
      ].includes(key),
  ) as Array<keyof typeof base>;
  const envelopePreserved = envelopeKeys.every(
    (key) => JSON.stringify(candidate[key]) === JSON.stringify(base[key]),
  );
  const selectedBound =
    selected?.operation === targetOperation &&
    selected.entityField === configuration.entityField &&
    selected.testFraction === configuration.testFraction &&
    selected.dropIdentity === configuration.identityAblation;
  const invariants: PlanInvariant[] = [
    invariant(
      "verified_base_plan",
      baseReport.status === "VERIFIED",
      baseReport.planHash,
      await hashCanonical(base),
    ),
    invariant(
      "interactive_lineage_preserved",
      envelopePreserved,
      envelopeKeys.filter(
        (key) => JSON.stringify(candidate[key]) !== JSON.stringify(base[key]),
      ),
      [],
    ),
    invariant(
      "interactive_registered_run_set",
      candidateRuns.length === baseRuns.length &&
        new Set(candidateRuns.map((run) => run.operation)).size ===
          baseRuns.length,
      candidateRuns.map((run) => run.operation),
      baseRuns.map((run) => run.operation),
    ),
    invariant("interactive_selected_control_binding", selectedBound, selected, {
      operation: targetOperation,
      entityField: configuration.entityField,
      testFraction: configuration.testFraction,
      dropIdentity: configuration.identityAblation,
    }),
    invariant(
      "interactive_unselected_runs_unchanged",
      changedRuns.length === 0,
      changedRuns.map((run) => run.runId),
      [],
    ),
  ];
  const report: PlanVerificationReport = {
    schemaVersion: "1",
    status: invariants.every((check) => check.passed) ? "VERIFIED" : "REJECTED",
    verifierVersion: "hosted-plan-verifier-v1",
    planHash,
    invariantCount: invariants.length,
    invariants,
  };
  if (report.status === "REJECTED") {
    const failed = invariants.find((check) => !check.passed);
    throw new PlanVerificationError(
      failed?.counterexample ??
        `Interactive leakage Plan failed ${failed?.name ?? "verification"}`,
      report,
    );
  }
  return report;
}
