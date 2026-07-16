import {
  AllowedMetricSchema,
  AllowedVisualizationSchema,
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  ExperimentPlanV2Schema,
  FixedOperationIdSchema,
  PredictionContractSchema,
  RunnerJobInputBundleSchema,
  type ArtifactManifest,
  type EvidenceRef,
} from "@counterlab/contracts";
import { z } from "zod";

import { projectExperimentIRV5ToPlanV2 } from "./migrate.js";
import { ExperimentIRV5Schema } from "./schema.js";

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
        scientificVerifierVersion: z.literal(
          "scientific-candidate-verifier-v1",
        ),
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

export const RunnerJobInputBundleV5Schema = z.union([
  RunnerLabCompileBundleV5Schema,
  RunnerLabRunBundleV5Schema,
]);

export type RunnerJobInputBundleV5 = z.infer<
  typeof RunnerJobInputBundleV5Schema
>;

export const VersionedRunnerJobInputBundleSchema = z.union([
  RunnerJobInputBundleSchema,
  RunnerLabCompileBundleV5Schema,
  RunnerLabRunBundleV5Schema,
]);

export type VersionedRunnerJobInputBundle = z.infer<
  typeof VersionedRunnerJobInputBundleSchema
>;
