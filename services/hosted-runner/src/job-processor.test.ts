import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CodexCompiler,
  CompileHostedExperimentPlanInput,
  CompileHostedPatchPlanInput,
  CompileHostedScientificMethodInput,
  CompileLabInput,
  CompilePatchInput,
  CompilerEvent,
  CompilerHealth,
  RepairHostedExperimentPlanInput,
  RepairHostedPatchPlanInput,
  RepairHostedScientificMethodInput,
  RepairLabInput,
  ScientificMethodCompiler,
} from "@counterlab/codex-client";
import {
  DiscriminationContractV1Schema,
  RunnerLabCompileBundleSchema,
  RunnerLabRunBundleSchema,
  RunnerPatchCompileBundleSchema,
  migrateBeliefTestV1ToV2,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerLabCompileBundle,
  type RunnerLabRunBundle,
  type RunnerPatchCompileBundle,
} from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  RunnerLabCompileBundleV5Schema,
  RunnerLabRunBundleV5Schema,
  RunnerPatchCompileBundleV5Schema,
  hashExperimentIR,
  migrateExperimentPlanV2ToIRV5,
  projectExperimentIRV5ToPlanV2,
  type RunnerLabRunBundleV5,
  type RunnerScientificCandidateV5,
  type RunnerLabCompileBundleV5,
  type RunnerPatchCompileBundleV5,
  type VersionedRunnerJobInputBundle,
} from "@counterlab/experiment-ir";
import { LabSceneV2Schema } from "@counterlab/generative-ui-contracts";
import { hashCanonical } from "@counterlab/session-core";
import { afterEach, describe, expect, it } from "vitest";

import {
  HostedRunnerJobProcessor,
  type CandidateDecision,
  type FixedKernelExecutor,
  type FixedPatchExecutor,
  type RunnerControlPlane,
} from "./job-processor.js";

const workspaces: string[] = [];

function bundle(jobId = "runner_job_1"): RunnerLabCompileBundle {
  const sourceHash = "a".repeat(64);
  const outputHash = "b".repeat(64);
  const beliefId = "belief_1";
  return RunnerLabCompileBundleSchema.parse({
    schemaVersion: "1",
    kind: "LAB_COMPILE",
    jobId,
    sessionId: "session_1",
    stateVersion: 5,
    artifactManifestHash: "c".repeat(64),
    approvedBeliefTest: {
      schemaVersion: "1",
      id: beliefId,
      concept: "entity_leakage",
      learnerClaim: "The row split proves performance for unseen accounts.",
      currentHypothesis: {
        statement: "Row accuracy generalizes to unseen accounts.",
        predictedOutcome: "The group score stays similarly high.",
      },
      competingHypothesis: {
        statement: "Repeated account identity inflates the row split.",
        predictedOutcome: "The group score falls when overlap reaches zero.",
      },
      evidenceRefs: [
        {
          cellIndex: 1,
          kind: "code",
          hash: sourceHash,
          excerpt: "train_test_split(X, y)",
          relevance: "This cell defines the row-wise evaluation split.",
        },
        {
          cellIndex: 1,
          outputIndex: 0,
          kind: "metric",
          hash: outputHash,
          excerpt: "accuracy: 0.98",
          relevance: "This is the displayed result behind the claim.",
        },
      ],
      alternatives: [],
      decisiveIntervention: {
        id: "group_holdout",
        description: "Hold out complete accounts.",
        controlledVariables: ["model", "seed"],
        changedVariables: ["split strategy"],
        discriminatesBecause: "Only identity availability changes.",
      },
      uncertainty: {
        confidence: 0.9,
        limitations: ["This evaluates the documented fixture only."],
        insufficientEvidence: false,
      },
      requiresLearnerConfirmation: true,
    },
    prediction: {
      schemaVersion: "1",
      id: "prediction_1",
      sessionId: "session_1",
      beliefTestId: beliefId,
      choice: "The group score remains high.",
      confidence: 75,
      committedAt: "2026-07-14T10:00:00.000Z",
      immutableHash: "d".repeat(64),
    },
    artifactManifest: {
      artifactId: "artifact_1",
      fileName: "accounts.ipynb",
      fileSha256: "e".repeat(64),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [
        {
          index: 1,
          type: "code",
          sourceSha256: sourceHash,
          sourceExcerpt: "train_test_split(X, y)",
          executionCount: 2,
          outputHashes: [outputHash],
          symbols: ["train_test_split"],
          metricCandidates: [{ name: "accuracy", value: 0.98, outputIndex: 0 }],
        },
      ],
      schemaSummary: {
        fields: [
          {
            name: "account_id",
            inferredType: "string",
            privacyClass: "identifier",
          },
          {
            name: "cancelled",
            inferredType: "boolean",
            privacyClass: "target",
          },
        ],
        rowCount: 800,
        entityCandidates: ["account_id"],
        targetCandidates: ["cancelled"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-14T10:00:00.000Z",
    },
    conceptPack: {
      id: "entity_leakage",
      version: "2.0.0",
      title: "Entity leakage",
      allowedOperations: [
        "leakage.random_row_split",
        "leakage.group_holdout",
        "leakage.identity_ablation",
      ],
      allowedMetrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
      allowedVisualizations: ["metric_comparison", "entity_overlap"],
      verifierInvariants: ["zero_group_overlap"],
      planRequirements: [
        "Use exactly one group holdout with identity retained.",
        "Use exactly one identity ablation with identity removed.",
      ],
    },
    experimentPlanSchema: { type: "object" },
    resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    permittedOutputs: ["experiment-plan.json", "public-rationale.md"],
  });
}

function scientificBundleV5(
  jobId = "runner_job_scientific_1",
): RunnerLabCompileBundleV5 {
  const legacy = bundle(jobId);
  const migrated = migrateBeliefTestV1ToV2(legacy.approvedBeliefTest);
  return RunnerLabCompileBundleV5Schema.parse({
    schemaVersion: "5",
    kind: "LAB_COMPILE",
    jobId,
    sessionId: legacy.sessionId,
    stateVersion: legacy.stateVersion,
    artifactManifestHash: legacy.artifactManifestHash,
    approvedBeliefSpec: {
      ...migrated,
      supportState: "SUPPORTED",
      learnerDecision: "CONFIRMED",
    },
    beliefSpecHash: "5".repeat(64),
    prediction: legacy.prediction,
    artifactManifest: legacy.artifactManifest,
    conceptPack: {
      ...legacy.conceptPack,
      candidateExperimentIds: [
        legacy.approvedBeliefTest.decisiveIntervention.id,
      ],
    },
    schemas: {
      discriminationContract: { type: "object" },
      experimentIr: { type: "object" },
      labScene: { type: "object" },
    },
    provenance: {
      generatorId: "codex-app-server-stdio-v1",
      promptHash: "6".repeat(64),
      inputHashes: [
        legacy.artifactManifestHash,
        "5".repeat(64),
        legacy.prediction.immutableHash,
      ],
    },
    resourceLimits: legacy.resourceLimits,
    permittedOutputs: [
      "discrimination-contract.json",
      "experiment-ir.json",
      "lab-scene.json",
      "public-rationale.md",
    ],
  });
}

async function runBundle(
  jobId = "runner_job_run_1",
): Promise<RunnerLabRunBundle> {
  const compileBundle = bundle("compile_job_1");
  const artifactManifestHash = "c".repeat(64);
  const experimentPlan = {
    schemaVersion: "2" as const,
    planId: "plan_1",
    sessionId: compileBundle.sessionId,
    concept: "entity_leakage" as const,
    conceptPackVersion: "2.0.0",
    artifactManifestHash,
    beliefTestId: compileBundle.approvedBeliefTest.id,
    evidenceRefs: compileBundle.approvedBeliefTest.evidenceRefs,
    baseline: {
      concept: "entity_leakage" as const,
      runId: "random_rows",
      operation: "leakage.random_row_split" as const,
      seed: 1729,
      testFraction: 0.25,
      entityField: "account_id",
      dropIdentity: false,
      model: "logistic_regression" as const,
    },
    interventions: [
      {
        concept: "entity_leakage" as const,
        runId: "new_accounts",
        operation: "leakage.group_holdout" as const,
        seed: 1729,
        testFraction: 0.25,
        entityField: "account_id",
        dropIdentity: false,
        model: "logistic_regression" as const,
      },
      {
        concept: "entity_leakage" as const,
        runId: "without_identity",
        operation: "leakage.identity_ablation" as const,
        seed: 1729,
        testFraction: 0.25,
        entityField: "account_id",
        dropIdentity: true,
        model: "logistic_regression" as const,
      },
    ],
    controlledVariables: ["model", "seed", "test fraction"],
    changedVariables: ["split boundary", "identity feature"],
    metrics: ["accuracy", "roc_auc", "entity_overlap_rate"] as const,
    visualizations: ["metric_comparison", "entity_overlap"] as const,
    discriminatesBecause: "The fair split removes cross-partition identity.",
    expectedPatterns: [
      {
        hypothesisId: "current" as const,
        qualitativeOutcome: "Score stays high.",
      },
      {
        hypothesisId: "competing" as const,
        qualitativeOutcome: "Score falls.",
      },
    ],
    nonClaims: ["This does not establish future production performance."],
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
  };
  return RunnerLabRunBundleSchema.parse({
    schemaVersion: "1",
    kind: "LAB_RUN",
    purpose: "AUTHORITATIVE",
    jobId,
    sessionId: compileBundle.sessionId,
    stateVersion: 7,
    artifactManifestHash,
    artifactManifest: compileBundle.artifactManifest,
    learnerClaim: compileBundle.approvedBeliefTest.learnerClaim,
    experimentPlan,
    experimentPlanHash: "9".repeat(64),
    fixture: { id: "public-leakage-v1" },
    permittedOutputs: ["verified-result.json"],
  });
}

function patchBundle(jobId = "runner_job_patch_1"): RunnerPatchCompileBundle {
  const compileBundle = bundle("compile_job_patch");
  return RunnerPatchCompileBundleSchema.parse({
    schemaVersion: "1",
    kind: "PATCH_COMPILE",
    jobId,
    sessionId: compileBundle.sessionId,
    stateVersion: 11,
    requestedAt: "2026-07-14T10:00:00.000Z",
    artifactManifestHash: "c".repeat(64),
    conceptPackVersion: "2.0.0",
    artifactManifest: compileBundle.artifactManifest,
    approvedBeliefTest: compileBundle.approvedBeliefTest,
    verifiedResultSummary: {
      schemaVersion: "2",
      resultHash: "4".repeat(64),
      planId: "plan_1",
      runIds: ["random_rows", "new_accounts", "without_identity"],
    },
    transferSummary: {
      outcome: "PASSED",
      resultHash: "5".repeat(64),
      selectedStrategy: "time_ordered_holdout",
      identifiedRisks: ["centered_window_reads_future"],
    },
    patchContract: {
      id: "leakage-notebook-patch-v2",
      allowedTransformations: [
        "replace_row_split_with_group_holdout",
        "exclude_entity_feature",
      ],
    },
    allowedCellIndices: [1],
    patchPlanSchema: { type: "object" },
    permittedOutputs: ["patch-plan.json", "public-rationale.md"],
  });
}

async function scientificArtifacts() {
  const bundleV5 = scientificBundleV5();
  const execution = await runBundle("scientific_projection");
  const migrated = migrateExperimentPlanV2ToIRV5(execution.experimentPlan, {
    beliefSpecHash: bundleV5.beliefSpecHash,
    sourcePlanHash: "7".repeat(64),
    transfer: {
      taskId: "forecast-future-leakage-v1",
      changedSurface: "Time-ordered forecasting",
      requiredActionIds: ["time_ordered_holdout"],
      nonClaims: ["This transfer does not certify mastery."],
    },
  });
  const candidateId = bundleV5.conceptPack.candidateExperimentIds[0]!;
  const candidate = migrated.candidateExperiments[0]!;
  const experimentIr = ExperimentIRV5Schema.parse({
    ...migrated,
    sessionId: bundleV5.sessionId,
    artifactManifestHash: bundleV5.artifactManifestHash,
    beliefSpecId: bundleV5.approvedBeliefSpec.id,
    beliefSpecHash: bundleV5.beliefSpecHash,
    hypotheses: migrated.hypotheses.map((hypothesis, index) => ({
      ...hypothesis,
      statement: bundleV5.approvedBeliefSpec.hypotheses[index]!.statement,
    })),
    candidateExperiments: [{ ...candidate, id: candidateId }],
    selection: { status: "UNSELECTED" },
    provenance: { kind: "codex", ...bundleV5.provenance },
    limitations: ["This test is scoped to the supplied notebook evidence."],
  });
  const discriminationContract = DiscriminationContractV1Schema.parse({
    schemaVersion: "1",
    contractId: "discrimination_scientific_1",
    sessionId: bundleV5.sessionId,
    concept: bundleV5.approvedBeliefSpec.concept,
    conceptPackVersion: bundleV5.conceptPack.version,
    artifactManifestHash: bundleV5.artifactManifestHash,
    beliefSpecId: bundleV5.approvedBeliefSpec.id,
    beliefSpecHash: bundleV5.beliefSpecHash,
    hypotheses: bundleV5.approvedBeliefSpec.hypotheses.map(
      (hypothesis, index) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        decisivePatternId: `leakage.pattern-${index + 1}`,
      }),
    ),
    candidateExperimentIds: [candidateId],
    changedVariableIds: ["split_strategy"],
    controlledVariableIds: ["model", "seed", "preprocessing"],
    observableIds: ["accuracy", "entity_overlap_rate"],
    inconclusiveConditionIds: ["legacy.unmapped-outcome"],
    whyThisTest:
      "Holding model settings fixed while separating complete entities tests the deployment boundary.",
    nonClaims: ["This does not establish performance for every deployment."],
    evidenceRefs: bundleV5.approvedBeliefSpec.evidenceRefs,
  });
  const labScene = LabSceneV2Schema.parse({
    schemaVersion: "2",
    sceneId: "scene_scientific_1",
    sessionId: bundleV5.sessionId,
    concept: bundleV5.approvedBeliefSpec.concept,
    supportLabel: "GUIDED_VISUAL",
    title: "Does the score survive a whole-customer holdout?",
    blocks: [
      {
        id: "hypotheses",
        type: "Hypothesis",
        current: bundleV5.approvedBeliefSpec.hypotheses[0].statement,
        competing: bundleV5.approvedBeliefSpec.hypotheses[1].statement,
      },
      {
        id: "why",
        type: "WhyThisTest",
        text: discriminationContract.whyThisTest,
      },
    ],
    assumptions: ["The fixed kernel executes only registered operations."],
    limitations: ["No result is shown before external verification."],
    provenance: {
      discriminationContractHash: await hashCanonical(discriminationContract),
      experimentIrHash: await hashExperimentIR(experimentIr),
    },
  });
  return { discriminationContract, experimentIr, labScene };
}

async function scientificRunBundleV5(
  jobId = "runner_job_run_scientific_1",
): Promise<RunnerLabRunBundleV5> {
  const compile = scientificBundleV5("compile_job_scientific_1");
  const rawIr = (await scientificArtifacts()).experimentIr;
  const candidate = rawIr.candidateExperiments[0]!;
  const fixedSelection = {
    eligibleCandidateIds: [candidate.id],
    rejectedCandidates: [],
    selectedCandidateId: candidate.id,
    minimumSeparation: 0.82,
    requiredSeparation: 0.4,
    complexityCost: candidate.complexityCost,
    normalizedScore: 0.8,
    scorerVersion: "experiment-scorer-v1",
  };
  const selectedExperimentIr = ExperimentIRV5Schema.parse({
    ...rawIr,
    hypotheses: rawIr.hypotheses.map((hypothesis, index) => ({
      ...hypothesis,
      statement: compile.approvedBeliefSpec.hypotheses[index]!.statement,
      conditions: compile.approvedBeliefSpec.hypotheses[index]!.conditions,
      nonClaims: compile.approvedBeliefSpec.hypotheses[index]!.nonClaims,
    })),
    selection: {
      status: "SELECTED",
      candidateId: fixedSelection.selectedCandidateId,
      eligibleCandidateIds: fixedSelection.eligibleCandidateIds,
      rejectedCandidates: fixedSelection.rejectedCandidates,
      minimumSeparation: fixedSelection.minimumSeparation,
      requiredSeparation: fixedSelection.requiredSeparation,
      complexityCost: fixedSelection.complexityCost,
      normalizedScore: fixedSelection.normalizedScore,
      scorerVersion: fixedSelection.scorerVersion,
    },
  });
  const projectedPlan = projectExperimentIRV5ToPlanV2(selectedExperimentIr);
  const fixture = {
    id: "public-leakage-v1" as const,
    version: "leakage-fixture-v1",
    contentSha256:
      "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70",
  };
  const expectedHashes = {
    artifactManifest: compile.artifactManifestHash,
    beliefSpec: compile.beliefSpecHash,
    prediction: compile.prediction.immutableHash,
    fixtureDescriptor: await hashCanonical(fixture),
    compileInputBundle: "8".repeat(64),
    rawExperimentIrFile: "9".repeat(64),
    rawExperimentIrCanonical: await hashExperimentIR(rawIr),
    candidateVerificationReport: "a".repeat(64),
    experimentSelection: await hashCanonical(fixedSelection),
    selectedExperimentIr: await hashExperimentIR(selectedExperimentIr),
    projectedPlan: await hashCanonical(projectedPlan),
  };
  return RunnerLabRunBundleV5Schema.parse({
    schemaVersion: "5",
    kind: "LAB_RUN",
    purpose: "AUTHORITATIVE",
    jobId,
    sessionId: compile.sessionId,
    stateVersion: 8,
    artifactManifestHash: compile.artifactManifestHash,
    approvedBeliefSpec: compile.approvedBeliefSpec,
    beliefSpecHash: compile.beliefSpecHash,
    prediction: compile.prediction,
    artifactManifest: compile.artifactManifest,
    fixture,
    selectedExperimentIr,
    selectedExperimentIrHash: expectedHashes.selectedExperimentIr,
    fixedSelection,
    projectedPlan,
    expectedHashes,
    provenance: {
      compileJobId: compile.jobId,
      compileInputBundleHash: expectedHashes.compileInputBundle,
      compilerOutputFileHashes: {
        "discrimination-contract.json": "b".repeat(64),
        "experiment-ir.json": expectedHashes.rawExperimentIrFile,
        "lab-scene.json": "c".repeat(64),
        "public-rationale.md": "d".repeat(64),
      },
      rawExperimentIrCanonicalHash: expectedHashes.rawExperimentIrCanonical,
      scientificVerifierVersion: "scientific-candidate-verifier-v1",
      candidateVerificationReportHash:
        expectedHashes.candidateVerificationReport,
      scorerVersion: fixedSelection.scorerVersion,
      projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1",
    },
    resultOutput: {
      path: "verified-result.json",
      schemaVersion: "2",
      authoritativeInputHashes: expectedHashes,
    },
    permittedOutputs: ["verified-result.json"],
  });
}

async function patchBundleV5(
  jobId = "runner_job_patch_scientific_1",
): Promise<RunnerPatchCompileBundleV5> {
  const run = await scientificRunBundleV5("runner_job_run_for_patch_1");
  const authoritativeResultHash = "4".repeat(64);
  return RunnerPatchCompileBundleV5Schema.parse({
    schemaVersion: "5",
    kind: "PATCH_COMPILE",
    jobId,
    sessionId: run.sessionId,
    stateVersion: 11,
    requestedAt: "2026-07-14T10:00:00.000Z",
    artifactManifestHash: run.artifactManifestHash,
    conceptPackVersion: run.selectedExperimentIr.conceptPackVersion,
    artifactManifest: run.artifactManifest,
    approvedBeliefSpec: run.approvedBeliefSpec,
    beliefSpecHash: run.beliefSpecHash,
    prediction: run.prediction,
    compileAuthority: {
      schemaVersion: "5",
      status: "VERIFIED",
      source: "hosted-experiment-ir-v5",
      jobId: run.provenance.compileJobId,
      inputBundleHash: run.provenance.compileInputBundleHash,
      artifactManifestHash: run.artifactManifestHash,
      beliefSpecHash: run.beliefSpecHash,
      predictionHash: run.prediction.immutableHash,
      compilerOutputFileHashes: run.provenance.compilerOutputFileHashes,
      discriminationContractHash: "b".repeat(64),
      rawExperimentIrCanonicalHash: run.provenance.rawExperimentIrCanonicalHash,
      labSceneHash: "c".repeat(64),
      candidateVerificationReportHash:
        run.provenance.candidateVerificationReportHash,
      scientificVerifierVersion: "scientific-candidate-verifier-v1",
      selectionHash: run.expectedHashes.experimentSelection,
      selectedExperimentIrHash: run.selectedExperimentIrHash,
      projectedPlanHash: run.expectedHashes.projectedPlan,
      scorerVersion: run.fixedSelection.scorerVersion,
      projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1",
    },
    selectedExperimentIr: run.selectedExperimentIr,
    fixedSelection: run.fixedSelection,
    basePlan: run.projectedPlan,
    releaseAuthority: {
      authoritativeResultHash,
      evidenceVerdict: {
        schemaVersion: "1",
        kind: "SUPPORTS",
        hypothesisId: "competing",
        scope: "This supported notebook and declared deployment unit.",
        resultHash: authoritativeResultHash,
        irHash: run.selectedExperimentIrHash,
        technicalReportHash: "2".repeat(64),
        verifierVersion: "epistemic-verifier-v1",
      },
      evidenceVerdictHash: "3".repeat(64),
      epistemicReportHash: "6".repeat(64),
    },
    verifiedResultSummary: {
      schemaVersion: "2",
      concept: run.selectedExperimentIr.concept,
      resultHash: authoritativeResultHash,
      planId: run.projectedPlan.planId,
      runIds: [
        run.projectedPlan.baseline,
        ...run.projectedPlan.interventions,
      ].map((candidate) => candidate.runId),
    },
    transferResult: {
      schemaVersion: "1",
      id: "transfer_scientific_1",
      sessionId: run.sessionId,
      taskId: run.selectedExperimentIr.transfer.taskId,
      outcome: "PASSED",
      selectedStrategy: "time_ordered_holdout",
      identifiedRisks: ["centered_window_reads_future"],
      evidenceChoices: ["random_split_mixes_dates"],
      checks: [
        {
          invariant: "time_ordered_evaluation",
          passed: true,
          evidence: "Future rows remain outside training.",
        },
      ],
      evaluatorVersion: "forecast-transfer-v1",
      evaluatedAt: "2026-07-14T09:59:00.000Z",
      resultHash: "5".repeat(64),
    },
    patchContract: {
      id: "leakage-notebook-patch-v2",
      allowedTransformations: [
        "replace_row_split_with_group_holdout",
        "exclude_entity_feature",
      ],
    },
    allowedCellIndices: [1],
    patchPlanSchema: { type: "object" },
    permittedOutputs: ["patch-plan.json", "public-rationale.md"],
  });
}

class FakeCompiler implements CodexCompiler {
  compileCalls = 0;
  patchCompileCalls = 0;
  repairCalls: RepairHostedExperimentPlanInput[] = [];
  patchRepairCalls: RepairHostedPatchPlanInput[] = [];

  constructor(
    private readonly plan: Record<string, unknown>,
    private readonly forbiddenFile = false,
  ) {}

  health(): Promise<CompilerHealth> {
    return Promise.resolve({ mode: "live", available: true, version: "test" });
  }

  async *compileExperimentPlan(
    input: CompileHostedExperimentPlanInput,
  ): AsyncIterable<CompilerEvent> {
    this.compileCalls += 1;
    await this.writeCandidate(input.generationDirectory);
    yield { type: "plan_summary", summary: "Build the fair comparison." };
    yield {
      type: "usage",
      inputTokens: 120,
      cachedInputTokens: 80,
      outputTokens: 35,
      reasoningOutputTokens: 12,
      totalTokens: 155,
      modelContextWindow: 200_000,
    };
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_1",
      turnId: "turn_1",
      durationMs: 87,
    };
  }

  async *repairExperimentPlan(
    input: RepairHostedExperimentPlanInput,
  ): AsyncIterable<CompilerEvent> {
    this.repairCalls.push(input);
    await this.writeCandidate(input.generationDirectory);
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_2",
      turnId: "turn_2",
    };
  }

  async *compileHostedPatchPlan(
    input: CompileHostedPatchPlanInput,
  ): AsyncIterable<CompilerEvent> {
    this.patchCompileCalls += 1;
    await this.writePatchCandidate(input.generationDirectory);
    yield {
      type: "plan_summary",
      summary: "Plan the minimal notebook repair.",
    };
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_patch_1",
      turnId: "turn_patch_1",
    };
  }

  async *repairHostedPatchPlan(
    input: RepairHostedPatchPlanInput,
  ): AsyncIterable<CompilerEvent> {
    this.patchRepairCalls.push(input);
    await this.writePatchCandidate(input.generationDirectory);
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_patch_2",
      turnId: "turn_patch_2",
    };
  }

  private async writePatchCandidate(directory: string): Promise<void> {
    await writeFile(
      join(directory, "patch-plan.json"),
      JSON.stringify(this.plan),
      "utf8",
    );
    await writeFile(
      join(directory, "public-rationale.md"),
      "Hold out complete accounts and remove identity.",
      "utf8",
    );
  }

  async writeCandidate(directory: string): Promise<void> {
    await writeFile(
      join(directory, "experiment-plan.json"),
      JSON.stringify(this.plan),
      "utf8",
    );
    await writeFile(
      join(directory, "public-rationale.md"),
      "A group holdout tests unseen accounts.",
      "utf8",
    );
    if (this.forbiddenFile) {
      await writeFile(join(directory, "artifact-adapter.py"), "bad", "utf8");
    }
  }

  compileLab(_input: CompileLabInput): AsyncIterable<CompilerEvent> {
    throw new Error("not used");
  }
  repairLab(_input: RepairLabInput): AsyncIterable<CompilerEvent> {
    throw new Error("not used");
  }
  compilePatch(_input: CompilePatchInput): AsyncIterable<CompilerEvent> {
    throw new Error("not used");
  }
}

class FakeScientificCompiler implements ScientificMethodCompiler {
  compileCalls: CompileHostedScientificMethodInput[] = [];
  repairCalls: RepairHostedScientificMethodInput[] = [];

  constructor(
    private readonly artifacts: Awaited<ReturnType<typeof scientificArtifacts>>,
  ) {}

  async *compileScientificMethod(
    input: CompileHostedScientificMethodInput,
  ): AsyncIterable<CompilerEvent> {
    this.compileCalls.push(structuredClone(input));
    await this.writeCandidate(input.generationDirectory);
    yield { type: "plan_summary", summary: "Compile the decisive test." };
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_scientific_1",
      turnId: "turn_scientific_1",
      durationMs: 91,
    };
  }

  async *repairScientificMethod(
    input: RepairHostedScientificMethodInput,
  ): AsyncIterable<CompilerEvent> {
    this.repairCalls.push(structuredClone(input));
    await this.writeCandidate(input.generationDirectory);
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_scientific_repair",
      turnId: "turn_scientific_repair",
      durationMs: 33,
    };
  }

  private async writeCandidate(directory: string): Promise<void> {
    await Promise.all([
      writeFile(
        join(directory, "discrimination-contract.json"),
        JSON.stringify(this.artifacts.discriminationContract),
        "utf8",
      ),
      writeFile(
        join(directory, "experiment-ir.json"),
        JSON.stringify(this.artifacts.experimentIr),
        "utf8",
      ),
      writeFile(
        join(directory, "lab-scene.json"),
        JSON.stringify(this.artifacts.labScene),
        "utf8",
      ),
      writeFile(
        join(directory, "public-rationale.md"),
        "A whole-entity holdout changes the evaluation boundary while fixed code holds model settings constant.",
        "utf8",
      ),
    ]);
  }
}

class FakeControlPlane implements RunnerControlPlane {
  readonly events: PublicCompilerEvent[] = [];
  readonly uploads = new Map<string, string>();
  readonly callbacks: RunnerCallback[] = [];
  starts = 0;
  resumes = 0;
  candidateCalls = 0;
  readonly candidateInputs: Array<
    { attempt: number; planSha256: string } | RunnerScientificCandidateV5
  > = [];
  source = '{"nbformat":4,"cells":[]}';

  constructor(
    private readonly input: VersionedRunnerJobInputBundle,
    private readonly decisions: CandidateDecision[],
  ) {}

  getInput(): Promise<VersionedRunnerJobInputBundle> {
    return Promise.resolve(this.input);
  }
  start(): Promise<void> {
    this.starts += 1;
    return Promise.resolve();
  }
  getSource(): Promise<string> {
    return Promise.resolve(this.source);
  }
  resume(): Promise<void> {
    this.resumes += 1;
    return Promise.resolve();
  }
  appendEvent(event: PublicCompilerEvent): Promise<void> {
    this.events.push(structuredClone(event));
    return Promise.resolve();
  }
  upload(path: string, body: string): Promise<{ sha256: string }> {
    this.uploads.set(path, body);
    return Promise.resolve({
      sha256: path.startsWith("experiment") ? "f".repeat(64) : "1".repeat(64),
    });
  }
  candidate(
    input:
      { attempt: number; planSha256: string } | RunnerScientificCandidateV5,
  ): Promise<CandidateDecision> {
    this.candidateInputs.push(structuredClone(input));
    const decision = this.decisions[this.candidateCalls];
    this.candidateCalls += 1;
    if (decision === undefined) throw new Error("missing candidate decision");
    return Promise.resolve(structuredClone(decision));
  }
  callback(callback: RunnerCallback): Promise<void> {
    this.callbacks.push(structuredClone(callback));
    return Promise.resolve();
  }
}

class FakeFixedPatch implements FixedPatchExecutor {
  calls: Array<{ source: string; plan: string }> = [];

  run(
    _bundle: RunnerPatchCompileBundle,
    sourceNotebook: string,
    patchPlan: string,
  ): Promise<{
    notebookBody: string;
    patchResultBody: string;
    patchResultHash: string;
    durationMs: number;
  }> {
    this.calls.push({ source: sourceNotebook, plan: patchPlan });
    return Promise.resolve({
      notebookBody: '{"nbformat":4,"cells":[{"source":"fixed"}]}',
      patchResultBody: JSON.stringify({
        schemaVersion: "1",
        id: "patch_1",
        sessionId: "session_1",
        status: "VERIFIED",
        sourceArtifactHash: "e".repeat(64),
        patchedArtifactHash: "6".repeat(64),
        patchHash: "7".repeat(64),
        modifiedCells: [1],
        diff: "- row split\n+ group holdout",
        verification: {
          passed: true,
          invariants: ["allowed_cell_scope", "zero_group_overlap"],
          unchangedCellHashes: ["8".repeat(64)],
        },
        generatedAt: "2026-07-14T10:00:00.000Z",
        resultHash: "9".repeat(64),
      }),
      patchResultHash: "9".repeat(64),
      durationMs: 53,
    });
  }
}

class FakeFixedKernel implements FixedKernelExecutor {
  calls: Array<RunnerLabRunBundle | RunnerLabRunBundleV5> = [];

  async run(input: RunnerLabRunBundle | RunnerLabRunBundleV5): Promise<{
    body: string;
    durationMs: number;
  }> {
    this.calls.push(structuredClone(input));
    const plan =
      input.schemaVersion === "5" ? input.projectedPlan : input.experimentPlan;
    const spec = plan.baseline;
    return {
      durationMs: 41,
      body: JSON.stringify({
        schemaVersion: "2",
        concept: "entity_leakage",
        planId: plan.planId,
        sessionId: input.sessionId,
        artifactManifestHash: input.artifactManifestHash,
        conceptPackVersion: plan.conceptPackVersion,
        fixture: {
          customers: 480,
          rows: 2880,
          sha256: "2".repeat(64),
          targetRate: 0.49,
        },
        kernelVersion: "0.1.0",
        seed: spec.seed,
        runs: [
          {
            id: spec.runId,
            operation: spec.operation,
            splitStrategy: "random",
            groupBy: null,
            dropFeatures: [],
            model: spec.model,
            seed: spec.seed,
            inputFingerprint: "2".repeat(64),
            featureSetFingerprint: "3".repeat(64),
            pipelineFingerprint: "5".repeat(64),
            metrics: { accuracy: 0.98, rocAuc: 0.99 },
            sampleSizes: { train: 2160, test: 720 },
            entityCounts: { train: 360, test: 120 },
            entityOverlap: { count: 120, rate: 1 },
          },
        ],
        chartData: [
          {
            runId: spec.runId,
            splitStrategy: "random",
            accuracy: 0.98,
            rocAuc: 0.99,
            sampleSize: 720,
            seed: spec.seed,
          },
        ],
        resultHash: "4".repeat(64),
      }),
    };
  }
}

const verifiedDecision: CandidateDecision = {
  status: "VERIFIED",
  canRepair: false,
  nextCursor: 4,
  counterexamples: [],
  verifierDurationMs: 8,
};

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "counterlab-hosted-runner-"));
  workspaces.push(directory);
  return directory;
}

describe("HostedRunnerJobProcessor", () => {
  it("recognizes a v5 job but fails closed until scientific authority is enabled", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const controlPlane = new FakeControlPlane(scientificBundleV5(), []);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_v5`,
    });

    await processor.run("runner_job_scientific_1");

    expect(controlPlane.starts).toBe(1);
    expect(controlPlane.candidateCalls).toBe(0);
    expect(controlPlane.uploads.size).toBe(0);
    expect(compiler.compileCalls).toBe(0);
    expect(controlPlane.callbacks).toEqual([
      expect.objectContaining({
        status: "FAILED",
        outputHashes: [],
        error: expect.objectContaining({
          code: "RUNNER_V5_NOT_ENABLED",
          retryable: false,
        }),
      }),
    ]);
  });

  it("compiles and submits all four bounded v5 artifacts as one candidate", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const scientificCompiler = new FakeScientificCompiler(
      await scientificArtifacts(),
    );
    const controlPlane = new FakeControlPlane(scientificBundleV5(), [
      verifiedDecision,
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      scientificCompiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_v5_enabled`,
    });

    await processor.run("runner_job_scientific_1");

    expect(scientificCompiler.compileCalls).toHaveLength(1);
    expect(compiler.compileCalls).toBe(0);
    expect([...controlPlane.uploads.keys()].sort()).toEqual([
      "discrimination-contract.json",
      "experiment-ir.json",
      "lab-scene.json",
      "public-rationale.md",
    ]);
    expect(controlPlane.candidateInputs).toEqual([
      {
        schemaVersion: "5",
        attempt: 1,
        artifactHashes: {
          "discrimination-contract.json": "1".repeat(64),
          "experiment-ir.json": "f".repeat(64),
          "lab-scene.json": "1".repeat(64),
          "public-rationale.md": "1".repeat(64),
        },
      },
    ]);
    expect(controlPlane.callbacks).toEqual([
      expect.objectContaining({
        status: "VERIFIED",
        outputHashes: expect.arrayContaining(["f".repeat(64), "1".repeat(64)]),
      }),
    ]);
  });

  it("repairs a rejected v5 candidate using only structured counterexamples", async () => {
    const scientificCompiler = new FakeScientificCompiler(
      await scientificArtifacts(),
    );
    const rejected: CandidateDecision = {
      status: "REJECTED",
      canRepair: true,
      nextCursor: 7,
      verifierDurationMs: 6,
      counterexamples: [
        {
          invariant: "MISSING_REQUIRED_CONTROL",
          observed: ["model", "seed"],
          expected: ["model", "seed", "preprocessing"],
          counterexample: "preprocessing is not held constant",
        },
      ],
    };
    const controlPlane = new FakeControlPlane(scientificBundleV5(), [
      rejected,
      verifiedDecision,
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler: new FakeCompiler({ schemaVersion: "2" }),
      scientificCompiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_v5_repair`,
    });

    await processor.run("runner_job_scientific_1");

    expect(scientificCompiler.repairCalls).toHaveLength(1);
    expect(scientificCompiler.repairCalls[0]).toMatchObject({
      repairAttempt: 1,
      verifierCounterexamples: rejected.counterexamples,
    });
    expect(controlPlane.resumes).toBe(1);
    expect(controlPlane.candidateInputs).toHaveLength(2);
    expect(controlPlane.callbacks.at(-1)).toMatchObject({
      status: "VERIFIED",
      operationalMetrics: { repairAttempts: 1 },
    });
  });

  it("publishes only allow-listed files and completes a verified plan job", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const controlPlane = new FakeControlPlane(bundle(), [verifiedDecision]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_1`,
    });

    await processor.run("runner_job_1");

    expect(compiler.compileCalls).toBe(1);
    expect(controlPlane.starts).toBe(1);
    expect([...controlPlane.uploads.keys()].sort()).toEqual([
      "experiment-plan.json",
      "public-rationale.md",
    ]);
    expect(controlPlane.events.map((event) => event.kind)).toContain(
      "plan.summary",
    );
    expect(controlPlane.callbacks).toHaveLength(1);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 4,
      operationalMetrics: {
        compilerDurationMs: 87,
        verifierDurationMs: 8,
        repairAttempts: 0,
        planTokenUsage: {
          inputTokens: 120,
          cachedInputTokens: 80,
          outputTokens: 35,
          reasoningOutputTokens: 12,
          totalTokens: 155,
        },
      },
    });
  });

  it("repairs from structured counterexamples and never receives verifier source", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const rejected: CandidateDecision = {
      status: "REJECTED",
      canRepair: true,
      nextCursor: 3,
      verifierDurationMs: 11,
      counterexamples: [
        {
          invariant: "zero_group_overlap",
          observed: { overlap: 2 },
          expected: { overlap: 0 },
          counterexample: "Two account IDs appear in both partitions.",
        },
      ],
    };
    const controlPlane = new FakeControlPlane(bundle(), [
      rejected,
      { ...verifiedDecision, nextCursor: 7 },
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_2`,
    });

    await processor.run("runner_job_1");

    expect(controlPlane.resumes).toBe(1);
    expect(compiler.repairCalls).toHaveLength(1);
    expect(compiler.repairCalls[0]?.verifierCounterexamples).toEqual(
      rejected.counterexamples,
    );
    expect(compiler.repairCalls[0]).toMatchObject({
      sessionId: "session_1",
      artifactManifestHash: "c".repeat(64),
      previousCandidatePlan: { schemaVersion: "2" },
    });
    expect(JSON.stringify(compiler.repairCalls[0])).not.toContain(
      "verifier source",
    );
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 7,
      operationalMetrics: {
        repairAttempts: 1,
        verifierDurationMs: 19,
      },
    });
  });

  it("fails closed when Codex creates a file outside the hosted allowlist", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" }, true);
    const controlPlane = new FakeControlPlane(bundle(), [verifiedDecision]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_3`,
    });

    await processor.run("runner_job_1");

    expect(controlPlane.candidateCalls).toBe(0);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "FAILED",
      error: { code: "RUNNER_OUTPUT_POLICY", retryable: false },
    });
  });

  it("executes LAB_RUN through the fixed kernel without a new Codex turn", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const kernel = new FakeFixedKernel();
    const controlPlane = new FakeControlPlane(await runBundle(), []);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      fixedKernel: kernel,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_4`,
    });

    await processor.run("runner_job_run_1");

    expect(compiler.compileCalls).toBe(0);
    expect(kernel.calls).toHaveLength(1);
    expect(controlPlane.candidateCalls).toBe(0);
    expect([...controlPlane.uploads.keys()]).toEqual(["verified-result.json"]);
    expect(controlPlane.events.map((event) => event.kind)).toEqual([
      "job.started",
      "command.completed",
      "result.ready",
    ]);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 3,
      operationalMetrics: { kernelDurationMs: 41 },
    });
  });

  it("executes v5 LAB_RUN through the fixed kernel without Codex or an early result event", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const scientificCompiler = new FakeScientificCompiler(
      await scientificArtifacts(),
    );
    const kernel = new FakeFixedKernel();
    const controlPlane = new FakeControlPlane(
      await scientificRunBundleV5(),
      [],
    );
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      scientificCompiler,
      fixedKernel: kernel,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_run_v5`,
    });

    await processor.run("runner_job_run_scientific_1");

    expect(compiler.compileCalls).toBe(0);
    expect(scientificCompiler.compileCalls).toHaveLength(0);
    expect(kernel.calls).toHaveLength(1);
    expect(kernel.calls[0]).toMatchObject({
      schemaVersion: "5",
      kind: "LAB_RUN",
      projectedPlan: { schemaVersion: "2" },
    });
    expect(controlPlane.candidateCalls).toBe(0);
    expect([...controlPlane.uploads.keys()]).toEqual(["verified-result.json"]);
    expect(controlPlane.events.map((event) => event.kind)).toEqual([
      "job.started",
      "command.completed",
    ]);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 2,
      operationalMetrics: { kernelDurationMs: 41 },
    });
  });

  it("releases no result or terminal callback when cancellation wins during upload", async () => {
    const controller = new AbortController();
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const kernel = new FakeFixedKernel();
    const controlPlane = new FakeControlPlane(await runBundle(), []);
    const originalUpload = controlPlane.upload.bind(controlPlane);
    controlPlane.upload = async (path, body) => {
      const uploaded = await originalUpload(path, body);
      controller.abort();
      return uploaded;
    };
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      fixedKernel: kernel,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_cancel`,
    });

    await processor.run("runner_job_run_1", controller.signal);

    expect([...controlPlane.uploads.keys()]).toEqual(["verified-result.json"]);
    expect(controlPlane.events.map((event) => event.kind)).toEqual([
      "job.started",
    ]);
    expect(controlPlane.callbacks).toHaveLength(0);
  });

  it("compiles a verified Patch Plan before the fixed patch process sees source bytes", async () => {
    const patchPlan = { schemaVersion: "1", operations: [] };
    const compiler = new FakeCompiler(patchPlan);
    const fixedPatch = new FakeFixedPatch();
    const controlPlane = new FakeControlPlane(patchBundle(), [
      { ...verifiedDecision, nextCursor: 4 },
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      fixedPatch,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_5`,
    });

    await processor.run("runner_job_patch_1");

    expect(compiler.patchCompileCalls).toBe(1);
    expect(compiler.compileCalls).toBe(0);
    expect(fixedPatch.calls).toEqual([
      { source: controlPlane.source, plan: JSON.stringify(patchPlan) },
    ]);
    expect([...controlPlane.uploads.keys()].sort()).toEqual([
      "patch-plan.json",
      "patch-result.json",
      "patched-notebook.ipynb",
      "public-rationale.md",
    ]);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 6,
      operationalMetrics: { patchDurationMs: 53 },
    });
  });

  it("routes a v5 repair through the bounded Patch Plan compiler and fixed patch process", async () => {
    const patchPlan = { schemaVersion: "1", operations: [] };
    const compiler = new FakeCompiler(patchPlan);
    const fixedPatch = new FakeFixedPatch();
    const controlPlane = new FakeControlPlane(await patchBundleV5(), [
      { ...verifiedDecision, nextCursor: 4 },
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      fixedPatch,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_v5_patch`,
    });

    await processor.run("runner_job_patch_scientific_1");

    expect(compiler.patchCompileCalls).toBe(1);
    expect(compiler.compileCalls).toBe(0);
    expect(fixedPatch.calls).toEqual([
      { source: controlPlane.source, plan: JSON.stringify(patchPlan) },
    ]);
    expect(controlPlane.callbacks[0]).toMatchObject({ status: "VERIFIED" });
  });

  it("repairs a Patch Plan from its previous candidate and exact lineage", async () => {
    const patchPlan = { schemaVersion: "1", planId: "patch_previous" };
    const compiler = new FakeCompiler(patchPlan);
    const fixedPatch = new FakeFixedPatch();
    const rejected: CandidateDecision = {
      status: "REJECTED",
      canRepair: true,
      nextCursor: 4,
      verifierDurationMs: 5,
      counterexamples: [
        {
          invariant: "allowed_cell_scope",
          observed: [3],
          expected: [1],
          counterexample: "Cell 3 is outside the approved patch scope.",
        },
      ],
    };
    const controlPlane = new FakeControlPlane(patchBundle(), [
      rejected,
      { ...verifiedDecision, nextCursor: 8 },
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      fixedPatch,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_6`,
    });

    await processor.run("runner_job_patch_1");

    expect(compiler.patchRepairCalls[0]).toMatchObject({
      sessionId: "session_1",
      artifactManifestHash: "c".repeat(64),
      sourceArtifactHash: "e".repeat(64),
      conceptPackVersion: "2.0.0",
      previousCandidatePlan: patchPlan,
    });
  });
});
