import {
  ExperimentPlanV2Schema,
  HostedVerifiedResultSetV2Schema,
  type ArtifactManifest,
  type BeliefTest,
  type EvidenceRef,
  type ExperimentPlanV2,
  type HostedVerifiedResultSetV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import { hashCanonical } from "@counterlab/session-core";

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
    observed,
    expected,
    ...(counterexample === undefined ? {} : { counterexample }),
  };
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
  plan: ExperimentPlanV2,
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

export async function verifyExperimentPlan(
  input: unknown,
  context: { manifest: ArtifactManifest; beliefTest: BeliefTest },
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

export async function verifyHostedResultSet(
  input: unknown,
  plan: ExperimentPlanV2,
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
  const result: HostedVerifiedResultSetV2 = parsed.data;
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
    return (
      run.operation === spec.operation &&
      run.seed === spec.seed &&
      run.model === spec.model &&
      run.splitStrategy === expectedStrategy &&
      run.groupBy ===
        (spec.operation === "leakage.group_holdout" ? spec.entityField : null)
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
        run: HostedVerifiedResultSetV2["runs"][number];
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
      "discriminating_outcomes",
      discriminates,
      result.runs.map((run) => ({
        id: run.id,
        accuracy: run.metrics.accuracy,
      })),
      "baseline accuracy exceeds group holdout and ablation by more than 0.1",
    ),
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
