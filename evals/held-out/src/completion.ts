import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  BeliefTestSchema,
  ExperimentPlanV2Schema,
  PatchPlanV1Schema,
  PatchResultSchema,
  type ArtifactManifest,
  type BeliefTest,
  type ConceptId,
  type EvidenceRef,
  type ExperimentPlanV2,
  type PatchPlanV1,
} from "../../../packages/contracts/src/index.js";
import { getConceptPack } from "../../../packages/concept-registry/src/index.js";
import {
  verifyExperimentPlan,
  verifyHostedResultSet,
  verifyPatchPlan,
} from "../../../packages/plan-verifier/src/index.js";
import { hashCanonical } from "../../../packages/session-core/src/index.js";

const execFileAsync = promisify(execFile);

export type HeldOutCompletion = {
  attempted: boolean;
  planSource: "deterministic_contract_probe";
  planVerified: boolean;
  resultVerified: boolean;
  transferPassed: boolean;
  patchVerified: boolean;
  unchangedCellCount: number;
  resultHash: string | null;
  patchHash: string | null;
  durationMs: number;
  failureCode: string | null;
};

type CompletionInput = {
  root: string;
  caseId: string;
  bytes: Uint8Array;
  manifest: ArtifactManifest;
  concept: ConceptId;
  evidence: EvidenceRef[];
};

function beliefFor(
  caseId: string,
  concept: ConceptId,
  evidence: EvidenceRef[],
): BeliefTest {
  const leakage = concept === "entity_leakage";
  return BeliefTestSchema.parse({
    schemaVersion: "1",
    id: `belief_${caseId}`,
    concept,
    learnerClaim: leakage
      ? "The random row score proves performance for unseen entities."
      : "The high accuracy proves the rare class is detected usefully.",
    currentHypothesis: {
      statement: leakage
        ? "The random row evaluation matches deployment."
        : "Aggregate accuracy is sufficient evidence.",
      predictedOutcome: leakage
        ? "A complete-entity holdout remains close to the notebook score."
        : "Minority recall is useful at the reported operating point.",
    },
    competingHypothesis: {
      statement: leakage
        ? "Repeated identities create a shortcut that will not transfer."
        : "Class rarity lets a weak majority prediction appear accurate.",
      predictedOutcome: leakage
        ? "A complete-entity holdout falls while overlap reaches zero."
        : "The majority baseline is strong while minority recall is weak.",
    },
    evidenceRefs: evidence.slice(0, 3),
    alternatives: [
      {
        label: "Evidence remains bounded",
        rationale:
          "The fixed test evaluates only the registered concept contract.",
      },
    ],
    decisiveIntervention: {
      id: leakage ? "group-and-ablate" : "baseline-and-minority-metrics",
      description: leakage
        ? "Hold out complete entities and separately remove the identity feature."
        : "Compare a majority baseline and recompute class-specific metrics.",
      controlledVariables: ["fixture", "seed", "model family"],
      changedVariables: leakage
        ? ["split boundary", "identity feature"]
        : ["decision threshold", "prevalence scenario"],
      discriminatesBecause: leakage
        ? "The hypotheses predict different performance with zero entity overlap."
        : "The hypotheses predict different rare-class behavior behind similar accuracy.",
    },
    uncertainty: {
      confidence: 0.86,
      limitations: [
        "This benchmark probe validates the fixed contract; it is not a learner outcome.",
      ],
      insufficientEvidence: false,
    },
    requiresLearnerConfirmation: true,
  });
}

async function planFor(
  caseId: string,
  concept: ConceptId,
  manifest: ArtifactManifest,
  belief: BeliefTest,
): Promise<ExperimentPlanV2> {
  const artifactManifestHash = await hashCanonical(manifest);
  const pack = getConceptPack(concept);
  const common = {
    schemaVersion: "2" as const,
    planId: `plan_${caseId}`,
    sessionId: `session_${caseId}`,
    concept,
    conceptPackVersion: pack.version,
    artifactManifestHash,
    beliefTestId: belief.id,
    evidenceRefs: belief.evidenceRefs,
    controlledVariables: ["fixture", "seed", "model family"],
    changedVariables:
      concept === "entity_leakage"
        ? ["split boundary", "identity feature"]
        : ["decision threshold", "prevalence scenario"],
    metrics: [...pack.allowedMetrics],
    visualizations: [...pack.allowedVisualizations],
    discriminatesBecause:
      concept === "entity_leakage"
        ? "A fair entity boundary removes the overlap shortcut."
        : "Minority metrics expose behavior hidden by aggregate accuracy.",
    expectedPatterns: [
      {
        hypothesisId: "current" as const,
        qualitativeOutcome: "The headline conclusion remains supported.",
      },
      {
        hypothesisId: "competing" as const,
        qualitativeOutcome:
          "The intervention reveals a material evaluation failure.",
      },
    ],
    nonClaims: [
      "This fixed benchmark does not prove arbitrary-notebook support.",
    ],
    resourceLimits: { wallSeconds: 60, memoryMb: 768, maxRuns: 4 },
  };
  if (concept === "entity_leakage") {
    const entityField = manifest.schemaSummary.entityCandidates[0];
    if (entityField === undefined) throw new Error("NO_ENTITY_FIELD");
    return ExperimentPlanV2Schema.parse({
      ...common,
      baseline: {
        concept,
        runId: "random_row_split",
        operation: "leakage.random_row_split",
        seed: 1729,
        testFraction: 0.25,
        entityField,
        dropIdentity: false,
        model: "logistic_regression",
      },
      interventions: [
        {
          concept,
          runId: "customer_group_split",
          operation: "leakage.group_holdout",
          seed: 1729,
          testFraction: 0.25,
          entityField,
          dropIdentity: false,
          model: "logistic_regression",
        },
        {
          concept,
          runId: "identity_ablation",
          operation: "leakage.identity_ablation",
          seed: 1729,
          testFraction: 0.25,
          entityField,
          dropIdentity: true,
          model: "logistic_regression",
        },
      ],
    });
  }
  return ExperimentPlanV2Schema.parse({
    ...common,
    baseline: {
      concept,
      runId: "majority_baseline",
      operation: "imbalance.majority_baseline",
      seed: 2603,
      threshold: 0.5,
      prevalenceScenario: "observed",
      model: "majority_baseline",
    },
    interventions: [
      {
        concept,
        runId: "stratified_holdout",
        operation: "imbalance.stratified_holdout",
        seed: 2603,
        threshold: 0.5,
        prevalenceScenario: "observed",
        model: "logistic_regression",
      },
      {
        concept,
        runId: "threshold_sweep",
        operation: "imbalance.threshold_sweep",
        seed: 2603,
        threshold: 0.25,
        prevalenceScenario: "observed",
        model: "logistic_regression",
      },
      {
        concept,
        runId: "prevalence_sweep",
        operation: "imbalance.prevalence_sweep",
        seed: 2603,
        threshold: 0.25,
        prevalenceScenario: "rarer",
        model: "logistic_regression",
      },
    ],
  });
}

function patchPlanFor(
  caseId: string,
  concept: ConceptId,
  manifest: ArtifactManifest,
  belief: BeliefTest,
  plan: ExperimentPlanV2,
  verifiedResultHash: string,
  transferResultHash: string,
): PatchPlanV1 {
  const targetCell = manifest.cells.find(
    (cell) =>
      cell.type === "code" &&
      (cell.symbols.includes("train_test_split") ||
        cell.sourceExcerpt.includes("train_test_split")),
  )?.index;
  const targetField = manifest.schemaSummary.targetCandidates[0];
  if (targetCell === undefined || targetField === undefined) {
    throw new Error("NO_PATCH_TARGET");
  }
  const base = {
    schemaVersion: "1" as const,
    planId: `patch_plan_${caseId}`,
    sessionId: plan.sessionId,
    concept,
    conceptPackVersion: plan.conceptPackVersion,
    artifactManifestHash: plan.artifactManifestHash,
    sourceArtifactHash: manifest.fileSha256,
    transferResultHash,
    verifiedResultHash,
    evidenceRefs: belief.evidenceRefs,
    targetCells: [targetCell],
    targetField,
    preserveUnrelatedCells: true as const,
    nonClaims: ["This patch does not choose a production policy."],
  };
  if (concept === "entity_leakage") {
    const entityField = manifest.schemaSummary.entityCandidates[0];
    if (entityField === undefined) throw new Error("NO_ENTITY_FIELD");
    return PatchPlanV1Schema.parse({
      ...base,
      entityField,
      operations: [
        {
          id: "replace_row_split_with_group_holdout",
          cellIndex: targetCell,
          reason: "Match the complete-entity deployment boundary.",
        },
        {
          id: "exclude_entity_feature",
          cellIndex: targetCell,
          reason: "Remove the identity shortcut from model features.",
        },
      ],
    });
  }
  return PatchPlanV1Schema.parse({
    ...base,
    operations: [
      {
        id: "stratify_classification_holdout",
        cellIndex: targetCell,
        reason: "Preserve the rare-class rate in the holdout.",
      },
      {
        id: "add_majority_baseline",
        cellIndex: targetCell,
        reason: "Compare the headline score with a trivial classifier.",
      },
      {
        id: "replace_accuracy_only_evaluation",
        cellIndex: targetCell,
        reason: "Report confusion counts and minority metrics.",
      },
    ],
  });
}

async function executePython(root: string, args: string[]): Promise<void> {
  const python = path.join(root, ".venv", "bin", "python");
  await execFileAsync(python, args, {
    cwd: root,
    env: {
      ...process.env,
      PYTHONPATH: path.join(root, "services", "kernel", "src"),
    },
    timeout: 120_000,
    maxBuffer: 2 * 1024 * 1024,
  });
}

function failureCode(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/logistic-regression evaluations only/u.test(message)) {
    return "PATCH_ESTIMATOR_OUTSIDE_CONTRACT";
  }
  if (/patch/u.test(message)) return "PATCH_NOT_VERIFIED";
  if (/transfer/u.test(message)) return "TRANSFER_NOT_VERIFIED";
  if (/result/u.test(message)) return "RESULT_NOT_VERIFIED";
  if (/plan/u.test(message)) return "PLAN_NOT_VERIFIED";
  return "COMPLETION_FAILED";
}

export async function runHeldOutCompletion(
  input: CompletionInput,
): Promise<HeldOutCompletion> {
  const startedAt = Date.now();
  const state: HeldOutCompletion = {
    attempted: true,
    planSource: "deterministic_contract_probe",
    planVerified: false,
    resultVerified: false,
    transferPassed: false,
    patchVerified: false,
    unchangedCellCount: 0,
    resultHash: null,
    patchHash: null,
    durationMs: 0,
    failureCode: null,
  };
  const work = await mkdtemp(path.join(tmpdir(), "counterlab-held-out-"));
  try {
    const belief = beliefFor(input.caseId, input.concept, input.evidence);
    const plan = await planFor(
      input.caseId,
      input.concept,
      input.manifest,
      belief,
    );
    await verifyExperimentPlan(plan, {
      sessionId: plan.sessionId,
      manifest: input.manifest,
      beliefTest: belief,
    });
    state.planVerified = true;

    const labBundle = {
      schemaVersion: "1",
      kind: "LAB_RUN",
      purpose: "AUTHORITATIVE",
      jobId: `job_lab_${input.caseId}`,
      sessionId: plan.sessionId,
      stateVersion: 1,
      artifactManifestHash: plan.artifactManifestHash,
      artifactManifest: input.manifest,
      learnerClaim: belief.learnerClaim,
      experimentPlan: plan,
      experimentPlanHash: await hashCanonical(plan),
      fixture: {
        id:
          input.concept === "entity_leakage"
            ? "public-leakage-v1"
            : "public-imbalance-v1",
        schemaVersion: "1",
      },
      permittedOutputs: ["verified-result.json"],
    };
    const labBundlePath = path.join(work, "lab-bundle.json");
    const resultPath = path.join(work, "verified-result.json");
    await writeFile(labBundlePath, `${JSON.stringify(labBundle)}\n`);
    await executePython(input.root, [
      "-m",
      "counterlab_kernel.hosted_run",
      "--bundle",
      labBundlePath,
      "--output",
      resultPath,
    ]);
    const result = JSON.parse(await readFile(resultPath, "utf8")) as {
      resultHash: string;
    };
    await verifyHostedResultSet(result, plan);
    state.resultVerified = true;
    state.resultHash = result.resultHash;

    const transferPath = path.join(work, "transfer.json");
    const transferArgs =
      input.concept === "entity_leakage"
        ? [
            "transfer",
            "--concept",
            "leakage",
            "--strategy",
            "time_ordered_holdout",
            "--risk",
            "centered_window_reads_future",
            "--evidence",
            "center_true_uses_later_targets",
            "--evidence",
            "random_split_mixes_dates",
          ]
        : [
            "transfer",
            "--concept",
            "imbalance",
            "--decision",
            "reject_accuracy_only",
            "--metric",
            "recall_and_pr_auc",
            "--evidence",
            "zero_true_positives",
            "--evidence",
            "rare_base_rate",
          ];
    await executePython(input.root, [
      "-m",
      "counterlab_kernel.cli",
      ...transferArgs,
      "--output",
      transferPath,
    ]);
    const transfer = JSON.parse(await readFile(transferPath, "utf8")) as {
      passed: boolean;
      resultHash: string;
    };
    if (!transfer.passed) throw new Error("TRANSFER_NOT_VERIFIED");
    state.transferPassed = true;

    const patchPlan = patchPlanFor(
      input.caseId,
      input.concept,
      input.manifest,
      belief,
      plan,
      result.resultHash,
      transfer.resultHash,
    );
    const targetCells = patchPlan.targetCells;
    const pack = getConceptPack(input.concept);
    await verifyPatchPlan(patchPlan, {
      sessionId: plan.sessionId,
      manifest: input.manifest,
      beliefTest: belief,
      verifiedResultHash: result.resultHash,
      transferResultHash: transfer.resultHash,
      conceptPackVersion: pack.version,
      allowedTransformations: pack.patchContract.allowedTransformations,
      allowedCellIndices: targetCells,
    });
    const patchBundle = {
      schemaVersion: "1",
      kind: "PATCH_COMPILE",
      jobId: `job_patch_${input.caseId}`,
      sessionId: plan.sessionId,
      stateVersion: 2,
      requestedAt: "2026-07-15T00:00:00.000Z",
      artifactManifestHash: plan.artifactManifestHash,
      artifactManifest: input.manifest,
      approvedBeliefTest: belief,
      verifiedResultSummary: {
        schemaVersion: "2",
        resultHash: result.resultHash,
        planId: plan.planId,
        runIds: [plan.baseline, ...plan.interventions].map((run) => run.runId),
      },
      transferSummary: {
        outcome: "PASSED",
        resultHash: transfer.resultHash,
        selectedStrategy:
          input.concept === "entity_leakage"
            ? "time_ordered_holdout"
            : "cost_aware_threshold",
        identifiedRisks:
          input.concept === "entity_leakage"
            ? ["centered_window_reads_future"]
            : ["minority_false_negative_cost"],
      },
      patchContract: pack.patchContract,
      allowedCellIndices: targetCells,
      patchPlanSchema: { type: "object" },
      permittedOutputs: ["patch-plan.json", "public-rationale.md"],
    };
    const sourcePath = path.join(work, "source.ipynb");
    const patchBundlePath = path.join(work, "patch-bundle.json");
    const patchPlanPath = path.join(work, "patch-plan.json");
    const patchedPath = path.join(work, "patched.ipynb");
    const patchResultPath = path.join(work, "patch-result.json");
    await Promise.all([
      writeFile(sourcePath, input.bytes),
      writeFile(patchBundlePath, `${JSON.stringify(patchBundle)}\n`),
      writeFile(patchPlanPath, `${JSON.stringify(patchPlan)}\n`),
    ]);
    const fixture =
      input.concept === "entity_leakage"
        ? path.join(input.root, "fixtures", "public", "customer_churn.csv")
        : path.join(input.root, "fixtures", "public", "fraud_rare_event.csv");
    await executePython(input.root, [
      "-m",
      "counterlab_kernel.hosted_patch",
      "--bundle",
      patchBundlePath,
      "--plan",
      patchPlanPath,
      "--source",
      sourcePath,
      "--fixture",
      fixture,
      "--output-notebook",
      patchedPath,
      "--output-result",
      patchResultPath,
    ]);
    const patchResult = PatchResultSchema.parse(
      JSON.parse(await readFile(patchResultPath, "utf8")),
    );
    if (patchResult.status !== "VERIFIED" || !patchResult.verification.passed) {
      throw new Error("PATCH_NOT_VERIFIED");
    }
    state.patchVerified = true;
    state.patchHash = patchResult.patchHash;
    state.unchangedCellCount =
      patchResult.verification.unchangedCellHashes.length;
  } catch (error) {
    if (process.env.COUNTERLAB_HELD_OUT_DEBUG === "1") {
      console.error(`[held-out:${input.caseId}]`, error);
    }
    state.failureCode = failureCode(error);
  } finally {
    state.durationMs = Date.now() - startedAt;
    await rm(work, { recursive: true, force: true });
  }
  return state;
}
