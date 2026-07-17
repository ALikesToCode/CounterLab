import {
  AllowedMetricSchema,
  AllowedVisualizationSchema,
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  BoundaryObservableIdSchema,
  EvidenceVerdictSchema,
  ExperimentPlanV2Schema,
  FixedOperationIdSchema,
  HostedExperimentLineageV5Schema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  PatchOperationIdSchema,
  PredictionContractSchema,
  RunnerJobInputBundleSchema,
  TransferResultSchema,
  type ArtifactManifest,
  type EvidenceRef,
  type ExperimentPlanV2,
} from "@counterlab/contracts";
import { z } from "zod";

import { projectExperimentIRV5ToPlanV2 } from "./migrate.js";
import { ExperimentIRV5Schema, TransferContractSchema } from "./schema.js";

const NonEmptyString = z.string().trim().min(1);
const Sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "expected a lowercase SHA-256 digest");
const TokenId = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9._:-]{0,95}$/u,
    "expected a bounded lowercase contract token",
  );
const ReasonCode = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,95}$/u, "expected an uppercase reason code");

export const RunnerBoundarySweepRequestV5Schema = z
  .object({
    sweepId: TokenId,
    axisIds: z.tuple([TokenId, TokenId]).readonly(),
    gridPresetId: TokenId,
    observableId: BoundaryObservableIdSchema,
    maxCells: z.number().int().positive().max(2_500),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.axisIds[0] === request.axisIds[1]) {
      context.addIssue({
        code: "custom",
        message: "Boundary Map axes must be unique",
        path: ["axisIds", 1],
      });
    }
  });

export const RunnerTransferTaskV5Schema = z
  .object({
    id: TokenId,
    evaluatorTaskId: TokenId,
    title: NonEmptyString.max(240),
    experimentIrContract: TransferContractSchema,
  })
  .strict()
  .superRefine((task, context) => {
    if (task.id !== task.experimentIrContract.taskId) {
      context.addIssue({
        code: "custom",
        message: "transfer task ID must match its Experiment IR contract",
        path: ["experimentIrContract", "taskId"],
      });
    }
  });

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function evidenceResolvesStructurally(
  evidence: EvidenceRef,
  manifest: ArtifactManifest,
): boolean {
  if (evidence.kind === "schema" || evidence.kind === "learner_claim") {
    return true;
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

export const RunnerLabCompileBundleV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    kind: z.literal("LAB_COMPILE"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    artifactManifestHash: Sha256,
    approvedBeliefSpec: BeliefSpecV2Schema,
    beliefSpecHash: Sha256,
    prediction: PredictionContractSchema,
    artifactManifest: ArtifactManifestSchema,
    conceptPack: z
      .object({
        id: z.enum(["entity_leakage", "class_imbalance"]),
        version: NonEmptyString,
        title: NonEmptyString,
        allowedOperations: z.array(FixedOperationIdSchema).min(1).max(16),
        allowedMetrics: z.array(AllowedMetricSchema).min(1).max(16),
        allowedVisualizations: z
          .array(AllowedVisualizationSchema)
          .min(1)
          .max(16),
        verifierInvariants: z.array(NonEmptyString).min(1).max(24),
        candidateExperimentIds: z.array(NonEmptyString).min(1).max(8),
        boundarySweep: RunnerBoundarySweepRequestV5Schema.optional(),
        // Optional only so stored pre-authority v5 bundles remain parseable.
        // New live jobs always include this and the verifier rejects omission.
        transferTask: RunnerTransferTaskV5Schema.optional(),
        planRequirements: z.array(NonEmptyString).min(1).max(16),
      })
      .strict(),
    schemas: z
      .object({
        discriminationContract: z.record(z.string(), z.json()),
        experimentIr: z.record(z.string(), z.json()),
        labScene: z.record(z.string(), z.json()),
      })
      .strict(),
    provenance: z
      .object({
        generatorId: NonEmptyString.max(96),
        promptHash: Sha256,
        inputHashes: z.array(Sha256).min(3).max(20),
      })
      .strict(),
    resourceLimits: z
      .object({
        wallSeconds: z.number().int().positive().max(120),
        memoryMb: z.number().int().min(128).max(2_048),
        maxRuns: z.number().int().positive().max(8),
      })
      .strict(),
    permittedOutputs: z
      .tuple([
        z.literal("discrimination-contract.json"),
        z.literal("experiment-ir.json"),
        z.literal("lab-scene.json"),
        z.literal("public-rationale.md"),
      ])
      .readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      bundle.approvedBeliefSpec.learnerDecision !== "CONFIRMED" ||
      bundle.approvedBeliefSpec.supportState !== "SUPPORTED"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "v5 compilation requires a learner-approved Belief Spec with evidence",
        path: ["approvedBeliefSpec", "learnerDecision"],
      });
    }

    const provenanceHashes = new Set(bundle.provenance.inputHashes);
    for (const [label, requiredHash] of [
      ["artifact manifest", bundle.artifactManifestHash],
      ["Belief Spec", bundle.beliefSpecHash],
      ["prediction", bundle.prediction.immutableHash],
    ] as const) {
      if (!provenanceHashes.has(requiredHash)) {
        context.addIssue({
          code: "custom",
          message: `compiler provenance is missing the ${label} hash`,
          path: ["provenance", "inputHashes"],
        });
      }
    }
    if (
      bundle.sessionId !== bundle.prediction.sessionId ||
      bundle.approvedBeliefSpec.id !== bundle.prediction.beliefTestId ||
      bundle.approvedBeliefSpec.concept !== bundle.conceptPack.id ||
      bundle.artifactManifest.support.status === "UNSUPPORTED"
    ) {
      context.addIssue({
        code: "custom",
        message: "v5 runner bundle lineage does not resolve",
        path: ["approvedBeliefSpec"],
      });
    }

    for (const [
      index,
      evidence,
    ] of bundle.approvedBeliefSpec.evidenceRefs.entries()) {
      if (!evidenceResolvesStructurally(evidence, bundle.artifactManifest)) {
        context.addIssue({
          code: "custom",
          message:
            "Belief Spec evidence does not resolve to the Artifact Manifest",
          path: ["approvedBeliefSpec", "evidenceRefs", index],
        });
      }
    }

    const candidates = new Set(bundle.conceptPack.candidateExperimentIds);
    for (const [
      hypothesisIndex,
      hypothesis,
    ] of bundle.approvedBeliefSpec.hypotheses.entries()) {
      for (const [
        candidateIndex,
        candidateId,
      ] of hypothesis.supportedCandidateExperimentIds.entries()) {
        if (!candidates.has(candidateId)) {
          context.addIssue({
            code: "custom",
            message:
              "Belief Spec candidate does not resolve to the Subject Pack",
            path: [
              "approvedBeliefSpec",
              "hypotheses",
              hypothesisIndex,
              "supportedCandidateExperimentIds",
              candidateIndex,
            ],
          });
        }
      }
    }
  });

export type RunnerLabCompileBundleV5 = z.infer<
  typeof RunnerLabCompileBundleV5Schema
>;

export const RunnerScientificCandidateV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    attempt: z.number().int().positive().max(3),
    artifactHashes: z
      .object({
        "discrimination-contract.json": Sha256,
        "experiment-ir.json": Sha256,
        "lab-scene.json": Sha256,
        "public-rationale.md": Sha256,
      })
      .strict(),
  })
  .strict();

export type RunnerScientificCandidateV5 = z.infer<
  typeof RunnerScientificCandidateV5Schema
>;

const FixedExperimentSelectionV1Schema = z
  .object({
    eligibleCandidateIds: z.array(TokenId).min(1).max(8),
    rejectedCandidates: z
      .array(
        z
          .object({
            candidateId: TokenId,
            reasonCodes: z.array(ReasonCode).min(1).max(12),
          })
          .strict(),
      )
      .max(8),
    selectedCandidateId: TokenId,
    minimumSeparation: z.number().finite().min(0).max(1),
    requiredSeparation: z.number().finite().min(0).max(1),
    complexityCost: z.number().finite().min(0).max(100),
    normalizedScore: z.number().finite().min(0).max(1),
    scorerVersion: TokenId,
  })
  .strict()
  .superRefine((selection, context) => {
    if (selection.minimumSeparation < selection.requiredSeparation) {
      context.addIssue({
        code: "custom",
        message: "selected experiment must satisfy required separation",
        path: ["minimumSeparation"],
      });
    }
    if (
      !selection.eligibleCandidateIds.includes(selection.selectedCandidateId)
    ) {
      context.addIssue({
        code: "custom",
        message: "selected candidate must be eligible",
        path: ["selectedCandidateId"],
      });
    }

    const seen = new Set<string>();
    for (const [
      index,
      candidateId,
    ] of selection.eligibleCandidateIds.entries()) {
      if (seen.has(candidateId)) {
        context.addIssue({
          code: "custom",
          message: "eligible candidate IDs must be unique",
          path: ["eligibleCandidateIds", index],
        });
      }
      seen.add(candidateId);
    }
    for (const [index, rejected] of selection.rejectedCandidates.entries()) {
      if (seen.has(rejected.candidateId)) {
        context.addIssue({
          code: "custom",
          message: "a candidate cannot be both eligible and rejected",
          path: ["rejectedCandidates", index, "candidateId"],
        });
      }
      seen.add(rejected.candidateId);
    }
  });

const RunnerLabRunExpectedHashesV5Schema = z
  .object({
    artifactManifest: Sha256,
    beliefSpec: Sha256,
    prediction: Sha256,
    fixtureDescriptor: Sha256,
    compileInputBundle: Sha256,
    rawExperimentIrFile: Sha256,
    rawExperimentIrCanonical: Sha256,
    candidateVerificationReport: Sha256,
    experimentSelection: Sha256,
    selectedExperimentIr: Sha256,
    projectedPlan: Sha256,
  })
  .strict();

export const RunnerLabRunBundleV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    kind: z.literal("LAB_RUN"),
    purpose: z.literal("AUTHORITATIVE"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    artifactManifestHash: Sha256,
    approvedBeliefSpec: BeliefSpecV2Schema,
    beliefSpecHash: Sha256,
    prediction: PredictionContractSchema,
    artifactManifest: ArtifactManifestSchema,
    fixture: z
      .object({
        id: z.enum(["public-leakage-v1", "public-imbalance-v1"]),
        version: TokenId,
        contentSha256: Sha256,
      })
      .strict(),
    selectedExperimentIr: ExperimentIRV5Schema,
    selectedExperimentIrHash: Sha256,
    fixedSelection: FixedExperimentSelectionV1Schema,
    projectedPlan: ExperimentPlanV2Schema,
    expectedHashes: RunnerLabRunExpectedHashesV5Schema,
    provenance: z
      .object({
        compileJobId: NonEmptyString,
        compileInputBundleHash: Sha256,
        compilerOutputFileHashes: z
          .object({
            "discrimination-contract.json": Sha256,
            "experiment-ir.json": Sha256,
            "lab-scene.json": Sha256,
            "public-rationale.md": Sha256,
          })
          .strict(),
        rawExperimentIrCanonicalHash: Sha256,
        scientificVerifierVersion: z.enum([
          "scientific-candidate-verifier-v1",
          "scientific-candidate-verifier-v2",
        ]),
        candidateVerificationReportHash: Sha256,
        scorerVersion: TokenId,
        projectionAdapterVersion: z.literal("experiment-ir-v5-to-plan-v2-v1"),
      })
      .strict(),
    resultOutput: z
      .object({
        path: z.literal("verified-result.json"),
        schemaVersion: z.literal("2"),
        authoritativeInputHashes: RunnerLabRunExpectedHashesV5Schema,
      })
      .strict(),
    permittedOutputs: z.tuple([z.literal("verified-result.json")]).readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const addLineageIssue = (message: string, path: PropertyKey[]) => {
      context.addIssue({ code: "custom", message, path });
    };

    if (
      bundle.approvedBeliefSpec.learnerDecision !== "CONFIRMED" ||
      bundle.approvedBeliefSpec.supportState !== "SUPPORTED"
    ) {
      addLineageIssue(
        "authoritative LAB_RUN requires a confirmed, supported Belief Spec",
        ["approvedBeliefSpec", "learnerDecision"],
      );
    }
    if (bundle.artifactManifest.support.status !== "SUPPORTED") {
      addLineageIssue(
        "authoritative LAB_RUN requires a supported Artifact Manifest",
        ["artifactManifest", "support", "status"],
      );
    }

    const expectedFixtureId =
      bundle.approvedBeliefSpec.concept === "entity_leakage"
        ? "public-leakage-v1"
        : "public-imbalance-v1";
    if (bundle.fixture.id !== expectedFixtureId) {
      addLineageIssue(
        "fixed fixture does not match the selected Subject Pack",
        ["fixture", "id"],
      );
    }

    const ir = bundle.selectedExperimentIr;
    const selection = bundle.fixedSelection;
    const plan = bundle.projectedPlan;
    if (
      bundle.sessionId !== bundle.prediction.sessionId ||
      bundle.sessionId !== ir.sessionId ||
      bundle.sessionId !== plan.sessionId
    ) {
      addLineageIssue("LAB_RUN session lineage does not match", ["sessionId"]);
    }
    if (
      bundle.approvedBeliefSpec.id !== bundle.prediction.beliefTestId ||
      bundle.approvedBeliefSpec.id !== ir.beliefSpecId ||
      bundle.approvedBeliefSpec.id !== plan.beliefTestId
    ) {
      addLineageIssue("Belief Spec identity lineage does not match", [
        "approvedBeliefSpec",
        "id",
      ]);
    }
    if (
      bundle.beliefSpecHash !== ir.beliefSpecHash ||
      bundle.beliefSpecHash !== bundle.expectedHashes.beliefSpec
    ) {
      addLineageIssue("Belief Spec hash lineage does not match", [
        "beliefSpecHash",
      ]);
    }
    if (
      bundle.approvedBeliefSpec.concept !== ir.concept ||
      ir.concept !== plan.concept
    ) {
      addLineageIssue("Subject Pack concept lineage does not match", [
        "selectedExperimentIr",
        "concept",
      ]);
    }
    if (ir.conceptPackVersion !== plan.conceptPackVersion) {
      addLineageIssue("Subject Pack version lineage does not match", [
        "selectedExperimentIr",
        "conceptPackVersion",
      ]);
    }
    if (
      bundle.artifactManifestHash !== ir.artifactManifestHash ||
      bundle.artifactManifestHash !== plan.artifactManifestHash ||
      bundle.artifactManifestHash !== bundle.expectedHashes.artifactManifest
    ) {
      addLineageIssue("Artifact Manifest hash lineage does not match", [
        "artifactManifestHash",
      ]);
    }
    if (bundle.prediction.immutableHash !== bundle.expectedHashes.prediction) {
      addLineageIssue("Prediction hash lineage does not match", [
        "prediction",
        "immutableHash",
      ]);
    }
    if (
      bundle.selectedExperimentIrHash !==
      bundle.expectedHashes.selectedExperimentIr
    ) {
      addLineageIssue("selected Experiment IR hash lineage does not match", [
        "selectedExperimentIrHash",
      ]);
    }
    if (
      bundle.expectedHashes.rawExperimentIrCanonical ===
      bundle.expectedHashes.selectedExperimentIr
    ) {
      addLineageIssue(
        "raw and fixed selected Experiment IR hashes must be distinct",
        ["expectedHashes", "selectedExperimentIr"],
      );
    }

    for (const [index, evidence] of ir.evidenceRefs.entries()) {
      if (!evidenceResolvesStructurally(evidence, bundle.artifactManifest)) {
        addLineageIssue(
          "Experiment IR evidence does not resolve to the Artifact Manifest",
          ["selectedExperimentIr", "evidenceRefs", index],
        );
      }
    }
    if (!sameJson(ir.evidenceRefs, bundle.approvedBeliefSpec.evidenceRefs)) {
      addLineageIssue("Experiment IR evidence lineage does not match", [
        "selectedExperimentIr",
        "evidenceRefs",
      ]);
    }
    const beliefHypotheses = bundle.approvedBeliefSpec.hypotheses.map(
      ({ id, statement, conditions, nonClaims }) => ({
        id,
        statement,
        conditions,
        nonClaims,
      }),
    );
    const irHypotheses = ir.hypotheses.map(
      ({ id, statement, conditions, nonClaims }) => ({
        id,
        statement,
        conditions,
        nonClaims,
      }),
    );
    if (!sameJson(irHypotheses, beliefHypotheses)) {
      addLineageIssue("Experiment IR hypothesis lineage does not match", [
        "selectedExperimentIr",
        "hypotheses",
      ]);
    }

    if (ir.selection.status !== "SELECTED") {
      addLineageIssue(
        "authoritative LAB_RUN requires a fixed selected experiment",
        ["selectedExperimentIr", "selection"],
      );
    } else {
      const embeddedSelection = {
        eligibleCandidateIds: ir.selection.eligibleCandidateIds,
        rejectedCandidates: ir.selection.rejectedCandidates,
        selectedCandidateId: ir.selection.candidateId,
        minimumSeparation: ir.selection.minimumSeparation,
        requiredSeparation: ir.selection.requiredSeparation,
        complexityCost: ir.selection.complexityCost,
        normalizedScore: ir.selection.normalizedScore,
        scorerVersion: ir.selection.scorerVersion,
      };
      if (!sameJson(selection, embeddedSelection)) {
        addLineageIssue("fixed Experiment Selection lineage does not match", [
          "fixedSelection",
        ]);
      }
      if (
        !ir.candidateExperiments.some(
          (candidate) => candidate.id === selection.selectedCandidateId,
        )
      ) {
        addLineageIssue("selected experiment does not resolve", [
          "fixedSelection",
          "selectedCandidateId",
        ]);
      }
    }

    if (bundle.provenance.scorerVersion !== selection.scorerVersion) {
      addLineageIssue("scorer provenance does not match", [
        "provenance",
        "scorerVersion",
      ]);
    }
    if (
      bundle.provenance.compileInputBundleHash !==
      bundle.expectedHashes.compileInputBundle
    ) {
      addLineageIssue("compile input bundle hash lineage does not match", [
        "provenance",
        "compileInputBundleHash",
      ]);
    }
    if (
      bundle.provenance.compilerOutputFileHashes["experiment-ir.json"] !==
      bundle.expectedHashes.rawExperimentIrFile
    ) {
      addLineageIssue(
        "raw compiled Experiment IR hash lineage does not match",
        ["provenance", "compilerOutputFileHashes", "experiment-ir.json"],
      );
    }
    if (
      bundle.provenance.rawExperimentIrCanonicalHash !==
      bundle.expectedHashes.rawExperimentIrCanonical
    ) {
      addLineageIssue(
        "canonical raw Experiment IR hash lineage does not match",
        ["provenance", "rawExperimentIrCanonicalHash"],
      );
    }
    if (
      bundle.provenance.candidateVerificationReportHash !==
      bundle.expectedHashes.candidateVerificationReport
    ) {
      addLineageIssue("scientific verification hash lineage does not match", [
        "provenance",
        "candidateVerificationReportHash",
      ]);
    }

    if (ir.selection.status === "SELECTED") {
      try {
        const expectedPlan = projectExperimentIRV5ToPlanV2(ir);
        if (!sameJson(plan, expectedPlan)) {
          addLineageIssue(
            "projected Experiment Plan does not match the selected Experiment IR",
            ["projectedPlan"],
          );
        }
      } catch {
        addLineageIssue("selected Experiment IR cannot be projected", [
          "selectedExperimentIr",
          "selection",
        ]);
      }
    }

    if (
      !sameJson(
        bundle.resultOutput.authoritativeInputHashes,
        bundle.expectedHashes,
      )
    ) {
      addLineageIssue(
        "result output lineage does not match authoritative inputs",
        ["resultOutput", "authoritativeInputHashes"],
      );
    }
  });

export type RunnerLabRunBundleV5 = z.infer<typeof RunnerLabRunBundleV5Schema>;

export const InteractiveRunConfigurationV5Schema = z.union([
  InteractiveLeakageRunRequestSchema,
  InteractiveImbalanceRunRequestSchema,
]);

export type InteractiveRunConfigurationV5 = z.infer<
  typeof InteractiveRunConfigurationV5Schema
>;

export const InteractivePlanDerivationVersionSchema = z.enum([
  "interactive-plan-v5-derivation-v1",
  "interactive-plan-v5-derivation-v2",
]);

export type InteractivePlanDerivationVersion = z.infer<
  typeof InteractivePlanDerivationVersionSchema
>;

export function deriveInteractivePlanV5(
  basePlanCandidate: unknown,
  configurationCandidate: unknown,
  configurationHashCandidate: unknown,
  derivationVersionCandidate: unknown = "interactive-plan-v5-derivation-v2",
): { interactivePlan: ExperimentPlanV2; selectedRunId: string } {
  const basePlan = ExperimentPlanV2Schema.parse(basePlanCandidate);
  const configuration = InteractiveRunConfigurationV5Schema.parse(
    configurationCandidate,
  );
  const configurationHash = Sha256.parse(configurationHashCandidate);
  const derivationVersion = InteractivePlanDerivationVersionSchema.parse(
    derivationVersionCandidate,
  );
  const selectedRunId = `interactive-${configurationHash.slice(0, 16)}`;
  const planId = `interactive-plan-${configurationHash.slice(0, 16)}`;

  if ("concept" in configuration) {
    if (basePlan.concept !== "class_imbalance") {
      throw new TypeError(
        "class-imbalance controls require a class-imbalance base Plan",
      );
    }
    if (derivationVersion === "interactive-plan-v5-derivation-v1") {
      const targetOperation =
        configuration.prevalenceScenario === "observed"
          ? "imbalance.threshold_sweep"
          : "imbalance.prevalence_sweep";
      let selected = false;
      const interventions = basePlan.interventions.map((run) => {
        if (run.operation !== targetOperation) return run;
        selected = true;
        return {
          ...run,
          runId: selectedRunId,
          threshold: configuration.threshold,
          prevalenceScenario: configuration.prevalenceScenario,
        };
      });
      if (!selected) {
        throw new TypeError(
          "base Plan is missing the registered class-imbalance control",
        );
      }
      return {
        selectedRunId,
        interactivePlan: ExperimentPlanV2Schema.parse({
          ...basePlan,
          planId,
          interventions,
        }),
      };
    }
    const selectsThreshold = configuration.prevalenceScenario === "observed";
    let thresholdAligned = false;
    let prevalenceAligned = false;
    const interventions = basePlan.interventions.map((run) => {
      if (run.operation === "imbalance.threshold_sweep") {
        thresholdAligned = true;
        return {
          ...run,
          runId: selectsThreshold ? selectedRunId : run.runId,
          threshold: configuration.threshold,
          prevalenceScenario: "observed" as const,
        };
      }
      if (run.operation === "imbalance.prevalence_sweep") {
        prevalenceAligned = true;
        return {
          ...run,
          runId: selectsThreshold ? run.runId : selectedRunId,
          threshold: configuration.threshold,
          prevalenceScenario: selectsThreshold
            ? run.prevalenceScenario
            : configuration.prevalenceScenario,
        };
      }
      return run;
    });
    if (!thresholdAligned || !prevalenceAligned) {
      throw new TypeError(
        "base Plan is missing a registered class-imbalance comparison control",
      );
    }
    return {
      selectedRunId,
      interactivePlan: ExperimentPlanV2Schema.parse({
        ...basePlan,
        planId,
        interventions,
      }),
    };
  }

  if (basePlan.concept !== "entity_leakage") {
    throw new TypeError("leakage controls require an entity-leakage base Plan");
  }
  const targetOperation =
    configuration.splitStrategy === "group"
      ? "leakage.group_holdout"
      : configuration.identityAblation
        ? "leakage.identity_ablation"
        : "leakage.random_row_split";
  let selected = false;
  const configureRun = <T extends ExperimentPlanV2["baseline"]>(run: T): T => {
    if (run.operation !== targetOperation) return run;
    selected = true;
    return {
      ...run,
      runId: selectedRunId,
      entityField: configuration.entityField,
      dropIdentity: configuration.identityAblation,
      testFraction: configuration.testFraction,
    } as T;
  };
  const baseline = configureRun(basePlan.baseline);
  const interventions = basePlan.interventions.map(configureRun);
  if (!selected) {
    throw new TypeError("base Plan is missing the registered leakage control");
  }
  return {
    selectedRunId,
    interactivePlan: ExperimentPlanV2Schema.parse({
      ...basePlan,
      planId,
      baseline,
      interventions,
    }),
  };
}

export const RunnerLabInteractiveRunBundleV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    kind: z.literal("LAB_RUN"),
    purpose: z.literal("INTERACTIVE"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    artifactManifestHash: Sha256,
    artifactManifest: ArtifactManifestSchema,
    approvedBeliefSpec: BeliefSpecV2Schema,
    beliefSpecHash: Sha256,
    prediction: PredictionContractSchema,
    fixture: z
      .object({
        id: z.enum(["public-leakage-v1", "public-imbalance-v1"]),
        version: TokenId,
        contentSha256: Sha256,
      })
      .strict(),
    compileAuthority: HostedExperimentLineageV5Schema,
    selectedExperimentIr: ExperimentIRV5Schema,
    fixedSelection: FixedExperimentSelectionV1Schema,
    basePlan: ExperimentPlanV2Schema,
    releaseAuthority: z
      .object({
        authoritativeResultHash: Sha256,
        evidenceVerdict: EvidenceVerdictSchema,
        evidenceVerdictHash: Sha256,
        epistemicReportHash: Sha256,
      })
      .strict(),
    configuration: InteractiveRunConfigurationV5Schema,
    configurationHash: Sha256,
    derivationVersion: InteractivePlanDerivationVersionSchema,
    selectedRunId: z
      .string()
      .regex(/^interactive-[a-f0-9]{16}$/u, "invalid interactive run ID"),
    interactivePlan: ExperimentPlanV2Schema,
    interactivePlanHash: Sha256,
    resultOutput: z
      .object({
        path: z.literal("verified-result.json"),
        schemaVersion: z.literal("2"),
        authorityHash: Sha256,
      })
      .strict(),
    permittedOutputs: z.tuple([z.literal("verified-result.json")]).readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const issue = (message: string, path: PropertyKey[]) =>
      context.addIssue({ code: "custom", message, path });
    const ir = bundle.selectedExperimentIr;
    const plan = bundle.basePlan;
    const compile = bundle.compileAuthority;
    const verdict = bundle.releaseAuthority.evidenceVerdict;

    if (
      bundle.approvedBeliefSpec.learnerDecision !== "CONFIRMED" ||
      bundle.approvedBeliefSpec.supportState !== "SUPPORTED" ||
      bundle.artifactManifest.support.status !== "SUPPORTED"
    ) {
      issue("interactive v5 execution requires approved supported authority", [
        "approvedBeliefSpec",
      ]);
    }
    if (
      bundle.sessionId !== bundle.prediction.sessionId ||
      bundle.sessionId !== ir.sessionId ||
      bundle.sessionId !== plan.sessionId
    ) {
      issue("interactive session lineage does not match", ["sessionId"]);
    }
    if (
      bundle.approvedBeliefSpec.id !== bundle.prediction.beliefTestId ||
      bundle.approvedBeliefSpec.id !== ir.beliefSpecId ||
      bundle.approvedBeliefSpec.id !== plan.beliefTestId
    ) {
      issue("interactive Belief Spec lineage does not match", [
        "approvedBeliefSpec",
        "id",
      ]);
    }
    if (
      bundle.approvedBeliefSpec.concept !== ir.concept ||
      ir.concept !== plan.concept ||
      ("concept" in bundle.configuration
        ? bundle.configuration.concept !== ir.concept
        : ir.concept !== "entity_leakage")
    ) {
      issue("interactive Subject Pack lineage does not match", [
        "configuration",
      ]);
    }
    if (
      bundle.artifactManifestHash !== compile.artifactManifestHash ||
      bundle.artifactManifestHash !== ir.artifactManifestHash ||
      bundle.artifactManifestHash !== plan.artifactManifestHash
    ) {
      issue("interactive Artifact Manifest lineage does not match", [
        "artifactManifestHash",
      ]);
    }
    if (
      bundle.beliefSpecHash !== compile.beliefSpecHash ||
      bundle.beliefSpecHash !== ir.beliefSpecHash ||
      bundle.prediction.immutableHash !== compile.predictionHash
    ) {
      issue("interactive belief or prediction hash lineage does not match", [
        "compileAuthority",
      ]);
    }
    if (
      compile.selectedExperimentIrHash !== verdict.irHash ||
      compile.scorerVersion !== bundle.fixedSelection.scorerVersion
    ) {
      issue("interactive compile authority does not match released evidence", [
        "compileAuthority",
      ]);
    }
    if (verdict.kind === "REJECTED") {
      issue("interactive exploration requires one released result", [
        "releaseAuthority",
      ]);
    } else if (
      verdict.resultHash !== bundle.releaseAuthority.authoritativeResultHash
    ) {
      issue("interactive result authority does not match its verdict", [
        "releaseAuthority",
        "authoritativeResultHash",
      ]);
    }

    if (ir.selection.status !== "SELECTED") {
      issue("interactive exploration requires a selected Experiment IR", [
        "selectedExperimentIr",
        "selection",
      ]);
    } else {
      const embeddedSelection = {
        eligibleCandidateIds: ir.selection.eligibleCandidateIds,
        rejectedCandidates: ir.selection.rejectedCandidates,
        selectedCandidateId: ir.selection.candidateId,
        minimumSeparation: ir.selection.minimumSeparation,
        requiredSeparation: ir.selection.requiredSeparation,
        complexityCost: ir.selection.complexityCost,
        normalizedScore: ir.selection.normalizedScore,
        scorerVersion: ir.selection.scorerVersion,
      };
      if (!sameJson(embeddedSelection, bundle.fixedSelection)) {
        issue("interactive fixed selection lineage does not match", [
          "fixedSelection",
        ]);
      }
    }

    try {
      if (!sameJson(projectExperimentIRV5ToPlanV2(ir), plan)) {
        issue(
          "interactive base Plan does not match the selected Experiment IR",
          ["basePlan"],
        );
      }
      const derived = deriveInteractivePlanV5(
        plan,
        bundle.configuration,
        bundle.configurationHash,
        bundle.derivationVersion,
      );
      if (
        derived.selectedRunId !== bundle.selectedRunId ||
        !sameJson(derived.interactivePlan, bundle.interactivePlan)
      ) {
        issue("interactive Plan is not the fixed configuration derivation", [
          "interactivePlan",
        ]);
      }
    } catch {
      issue("interactive Plan cannot be derived from registered controls", [
        "configuration",
      ]);
    }

    const expectedFixtureId =
      ir.concept === "entity_leakage"
        ? "public-leakage-v1"
        : "public-imbalance-v1";
    if (bundle.fixture.id !== expectedFixtureId) {
      issue("interactive fixture does not match the Subject Pack", [
        "fixture",
        "id",
      ]);
    }
    if (
      !("concept" in bundle.configuration) &&
      !bundle.artifactManifest.schemaSummary.entityCandidates.includes(
        bundle.configuration.entityField,
      )
    ) {
      issue("interactive entity field does not resolve to the manifest", [
        "configuration",
        "entityField",
      ]);
    }
    if (bundle.resultOutput.authorityHash !== bundle.configurationHash) {
      issue("interactive output authority does not match its configuration", [
        "resultOutput",
        "authorityHash",
      ]);
    }
  });

export type RunnerLabInteractiveRunBundleV5 = z.infer<
  typeof RunnerLabInteractiveRunBundleV5Schema
>;

export const RunnerBoundaryMapBundleV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    kind: z.literal("LAB_RUN"),
    purpose: z.literal("BOUNDARY"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    artifactManifestHash: Sha256,
    fixture: z
      .object({
        id: z.enum(["public-leakage-v1", "public-imbalance-v1"]),
        version: TokenId,
        contentSha256: Sha256,
      })
      .strict(),
    conceptPackVersion: NonEmptyString,
    selectedExperimentIr: ExperimentIRV5Schema,
    selectedExperimentIrHash: Sha256,
    releaseAuthority: z
      .object({
        authoritativeResultHash: Sha256,
        evidenceVerdict: EvidenceVerdictSchema,
        evidenceVerdictHash: Sha256,
        epistemicReportHash: Sha256,
      })
      .strict(),
    boundaryRequest: RunnerBoundarySweepRequestV5Schema,
    seed: z.number().int().nonnegative(),
    resultOutput: z
      .object({
        path: z.literal("boundary-map.json"),
        schemaVersion: z.literal("1"),
        lineage: z
          .object({
            artifactManifestHash: Sha256,
            experimentIrHash: Sha256,
            authoritativeResultHash: Sha256,
            evidenceVerdictHash: Sha256,
          })
          .strict(),
      })
      .strict(),
    permittedOutputs: z.tuple([z.literal("boundary-map.json")]).readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const issue = (message: string, path: PropertyKey[]) =>
      context.addIssue({ code: "custom", message, path });
    const ir = bundle.selectedExperimentIr;
    const verdict = bundle.releaseAuthority.evidenceVerdict;

    if (
      bundle.sessionId !== ir.sessionId ||
      bundle.artifactManifestHash !== ir.artifactManifestHash
    ) {
      issue(
        "Boundary Map session or Artifact Manifest lineage does not match",
        ["selectedExperimentIr"],
      );
    }
    if (bundle.conceptPackVersion !== ir.conceptPackVersion) {
      issue("Boundary Map Subject Pack version lineage does not match", [
        "conceptPackVersion",
      ]);
    }

    const expectedFixtureId =
      ir.concept === "entity_leakage"
        ? "public-leakage-v1"
        : "public-imbalance-v1";
    if (bundle.fixture.id !== expectedFixtureId) {
      issue("Boundary Map fixture does not match the Subject Pack", [
        "fixture",
        "id",
      ]);
    }

    if (
      ir.boundarySweep === undefined ||
      !sameJson(ir.boundarySweep, bundle.boundaryRequest)
    ) {
      issue(
        "Boundary Map request must equal the selected Experiment IR sweep",
        ["boundaryRequest"],
      );
    }

    const boundarySelection = ir.selection;
    if (boundarySelection.status !== "SELECTED") {
      issue("Boundary Map execution requires a selected Experiment IR", [
        "selectedExperimentIr",
        "selection",
      ]);
    } else {
      const selectedCandidate = ir.candidateExperiments.find(
        (candidate) => candidate.id === boundarySelection.candidateId,
      );
      if (selectedCandidate === undefined) {
        issue("Boundary Map selected experiment does not resolve", [
          "selectedExperimentIr",
          "selection",
        ]);
      }
    }

    const registeredBoundarySeed =
      ir.concept === "entity_leakage" ? 1729 : 2603;
    if (bundle.seed !== registeredBoundarySeed) {
      issue("Boundary Map seed must match the registered fixed sweep", [
        "seed",
      ]);
    }

    if (verdict.kind === "REJECTED") {
      issue("A rejected experiment cannot authorize a Boundary Map", [
        "releaseAuthority",
        "evidenceVerdict",
      ]);
    } else {
      if (
        verdict.resultHash !== bundle.releaseAuthority.authoritativeResultHash
      ) {
        issue("Boundary Map result authority does not match its verdict", [
          "releaseAuthority",
          "authoritativeResultHash",
        ]);
      }
      if (verdict.irHash !== bundle.selectedExperimentIrHash) {
        issue(
          "Boundary Map Experiment IR authority does not match its verdict",
          ["selectedExperimentIrHash"],
        );
      }
    }

    const expectedLineage = {
      artifactManifestHash: bundle.artifactManifestHash,
      experimentIrHash: bundle.selectedExperimentIrHash,
      authoritativeResultHash: bundle.releaseAuthority.authoritativeResultHash,
      evidenceVerdictHash: bundle.releaseAuthority.evidenceVerdictHash,
    };
    if (!sameJson(bundle.resultOutput.lineage, expectedLineage)) {
      issue("Boundary Map output lineage does not match its frozen authority", [
        "resultOutput",
        "lineage",
      ]);
    }
  });

export type RunnerBoundaryMapBundleV5 = z.infer<
  typeof RunnerBoundaryMapBundleV5Schema
>;

export const RunnerPatchCompileBundleV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    kind: z.literal("PATCH_COMPILE"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    requestedAt: z.iso.datetime({ offset: true }),
    artifactManifestHash: Sha256,
    conceptPackVersion: NonEmptyString,
    artifactManifest: ArtifactManifestSchema,
    approvedBeliefSpec: BeliefSpecV2Schema,
    beliefSpecHash: Sha256,
    prediction: PredictionContractSchema,
    compileAuthority: HostedExperimentLineageV5Schema,
    selectedExperimentIr: ExperimentIRV5Schema,
    fixedSelection: FixedExperimentSelectionV1Schema,
    basePlan: ExperimentPlanV2Schema,
    releaseAuthority: z
      .object({
        authoritativeResultHash: Sha256,
        evidenceVerdict: EvidenceVerdictSchema,
        evidenceVerdictHash: Sha256,
        epistemicReportHash: Sha256,
      })
      .strict(),
    verifiedResultSummary: z
      .object({
        schemaVersion: z.literal("2"),
        concept: z.enum(["entity_leakage", "class_imbalance"]),
        resultHash: Sha256,
        planId: NonEmptyString,
        runIds: z.array(NonEmptyString).min(1).max(8),
      })
      .strict(),
    transferContractId: NonEmptyString,
    transferResult: TransferResultSchema,
    patchContract: z
      .object({
        id: NonEmptyString,
        allowedTransformations: z
          .array(PatchOperationIdSchema)
          .min(2)
          .max(3)
          .readonly(),
      })
      .strict(),
    allowedCellIndices: z.array(z.number().int().nonnegative()).min(1).max(4),
    patchPlanSchema: z.record(z.string(), z.json()),
    permittedOutputs: z
      .tuple([z.literal("patch-plan.json"), z.literal("public-rationale.md")])
      .readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const issue = (message: string, path: PropertyKey[]) =>
      context.addIssue({ code: "custom", message, path });
    const belief = bundle.approvedBeliefSpec;
    const ir = bundle.selectedExperimentIr;
    const plan = bundle.basePlan;
    const compile = bundle.compileAuthority;
    const verdict = bundle.releaseAuthority.evidenceVerdict;
    const summary = bundle.verifiedResultSummary;

    if (
      belief.learnerDecision !== "CONFIRMED" ||
      belief.supportState !== "SUPPORTED" ||
      bundle.artifactManifest.support.status !== "SUPPORTED"
    ) {
      issue("v5 patching requires approved supported evidence authority", [
        "approvedBeliefSpec",
      ]);
    }
    if (
      bundle.sessionId !== bundle.prediction.sessionId ||
      bundle.sessionId !== ir.sessionId ||
      bundle.sessionId !== plan.sessionId ||
      bundle.sessionId !== bundle.transferResult.sessionId
    ) {
      issue("v5 patch session lineage does not match", ["sessionId"]);
    }
    if (
      belief.id !== bundle.prediction.beliefTestId ||
      belief.id !== ir.beliefSpecId ||
      belief.id !== plan.beliefTestId
    ) {
      issue("v5 patch Belief Spec lineage does not match", [
        "approvedBeliefSpec",
        "id",
      ]);
    }
    if (
      belief.concept !== ir.concept ||
      ir.concept !== plan.concept ||
      plan.concept !== summary.concept
    ) {
      issue("v5 patch Subject Pack lineage does not match", [
        "verifiedResultSummary",
        "concept",
      ]);
    }
    if (
      bundle.conceptPackVersion !== ir.conceptPackVersion ||
      bundle.conceptPackVersion !== plan.conceptPackVersion
    ) {
      issue("v5 patch Subject Pack version lineage does not match", [
        "conceptPackVersion",
      ]);
    }
    if (
      bundle.artifactManifestHash !== compile.artifactManifestHash ||
      bundle.artifactManifestHash !== ir.artifactManifestHash ||
      bundle.artifactManifestHash !== plan.artifactManifestHash
    ) {
      issue("v5 patch Artifact Manifest lineage does not match", [
        "artifactManifestHash",
      ]);
    }
    if (
      bundle.beliefSpecHash !== compile.beliefSpecHash ||
      bundle.beliefSpecHash !== ir.beliefSpecHash ||
      bundle.prediction.immutableHash !== compile.predictionHash
    ) {
      issue("v5 patch belief or prediction hash lineage does not match", [
        "compileAuthority",
      ]);
    }
    if (
      compile.selectedExperimentIrHash !== verdict.irHash ||
      compile.scorerVersion !== bundle.fixedSelection.scorerVersion
    ) {
      issue("v5 patch compile authority does not match released evidence", [
        "compileAuthority",
      ]);
    }
    if (verdict.kind !== "SUPPORTS") {
      issue("repair unlocks only after a supporting evidence verdict", [
        "releaseAuthority",
        "evidenceVerdict",
      ]);
    } else if (
      verdict.resultHash !== bundle.releaseAuthority.authoritativeResultHash
    ) {
      issue("v5 patch released result does not match its verdict", [
        "releaseAuthority",
        "authoritativeResultHash",
      ]);
    }
    if (
      summary.resultHash !== bundle.releaseAuthority.authoritativeResultHash ||
      summary.planId !== plan.planId
    ) {
      issue("v5 patch result summary does not match released evidence", [
        "verifiedResultSummary",
      ]);
    }
    const expectedRunIds = [plan.baseline, ...plan.interventions].map(
      (run) => run.runId,
    );
    if (
      new Set(summary.runIds).size !== summary.runIds.length ||
      summary.runIds.length !== expectedRunIds.length ||
      expectedRunIds.some((runId) => !summary.runIds.includes(runId))
    ) {
      issue("v5 patch result runs do not match the authoritative Plan", [
        "verifiedResultSummary",
        "runIds",
      ]);
    }
    if (
      bundle.transferResult.outcome !== "PASSED" ||
      bundle.transferContractId !== ir.transfer.taskId
    ) {
      issue("v5 patch requires the selected experiment's passed transfer", [
        "transferResult",
      ]);
    }

    if (ir.selection.status !== "SELECTED") {
      issue("v5 patch requires a fixed selected Experiment IR", [
        "selectedExperimentIr",
        "selection",
      ]);
    } else {
      const embeddedSelection = {
        eligibleCandidateIds: ir.selection.eligibleCandidateIds,
        rejectedCandidates: ir.selection.rejectedCandidates,
        selectedCandidateId: ir.selection.candidateId,
        minimumSeparation: ir.selection.minimumSeparation,
        requiredSeparation: ir.selection.requiredSeparation,
        complexityCost: ir.selection.complexityCost,
        normalizedScore: ir.selection.normalizedScore,
        scorerVersion: ir.selection.scorerVersion,
      };
      if (!sameJson(embeddedSelection, bundle.fixedSelection)) {
        issue("v5 patch fixed selection lineage does not match", [
          "fixedSelection",
        ]);
      }
    }
    try {
      if (!sameJson(projectExperimentIRV5ToPlanV2(ir), plan)) {
        issue("v5 patch Plan does not match the selected Experiment IR", [
          "basePlan",
        ]);
      }
    } catch {
      issue("v5 patch Experiment IR cannot be projected", [
        "selectedExperimentIr",
      ]);
    }
    if (!sameJson(ir.evidenceRefs, belief.evidenceRefs)) {
      issue("v5 patch evidence lineage does not match", [
        "selectedExperimentIr",
        "evidenceRefs",
      ]);
    }
    for (const [index, evidence] of belief.evidenceRefs.entries()) {
      if (!evidenceResolvesStructurally(evidence, bundle.artifactManifest)) {
        issue("v5 patch evidence does not resolve to the Artifact Manifest", [
          "approvedBeliefSpec",
          "evidenceRefs",
          index,
        ]);
      }
    }

    const expectedTransformations =
      belief.concept === "entity_leakage"
        ? new Set([
            "replace_row_split_with_group_holdout",
            "exclude_entity_feature",
          ])
        : new Set([
            "stratify_classification_holdout",
            "add_majority_baseline",
            "replace_accuracy_only_evaluation",
          ]);
    const transformations = new Set(
      bundle.patchContract.allowedTransformations,
    );
    if (
      transformations.size !== expectedTransformations.size ||
      [...transformations].some(
        (operation) => !expectedTransformations.has(operation),
      )
    ) {
      issue("v5 patch transformations do not match the Subject Pack", [
        "patchContract",
        "allowedTransformations",
      ]);
    }
    if (
      new Set(bundle.allowedCellIndices).size !==
        bundle.allowedCellIndices.length ||
      !bundle.allowedCellIndices.every((index) =>
        bundle.artifactManifest.cells.some(
          (cell) => cell.index === index && cell.type === "code",
        ),
      )
    ) {
      issue("v5 patch cell allowlist does not resolve to code cells", [
        "allowedCellIndices",
      ]);
    }
  });

export type RunnerPatchCompileBundleV5 = z.infer<
  typeof RunnerPatchCompileBundleV5Schema
>;

export const RunnerJobInputBundleV5Schema = z.union([
  RunnerLabCompileBundleV5Schema,
  RunnerLabRunBundleV5Schema,
  RunnerLabInteractiveRunBundleV5Schema,
  RunnerBoundaryMapBundleV5Schema,
  RunnerPatchCompileBundleV5Schema,
]);

export type RunnerJobInputBundleV5 = z.infer<
  typeof RunnerJobInputBundleV5Schema
>;

export const VersionedRunnerJobInputBundleSchema = z.union([
  RunnerJobInputBundleSchema,
  RunnerLabCompileBundleV5Schema,
  RunnerLabRunBundleV5Schema,
  RunnerLabInteractiveRunBundleV5Schema,
  RunnerBoundaryMapBundleV5Schema,
  RunnerPatchCompileBundleV5Schema,
]);

export type VersionedRunnerJobInputBundle = z.infer<
  typeof VersionedRunnerJobInputBundleSchema
>;
