import {
  ExperimentPlanV2Schema,
  type ArtifactManifest,
  type BeliefTest,
  type EvidenceRef,
  type ExperimentPlanV2,
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
