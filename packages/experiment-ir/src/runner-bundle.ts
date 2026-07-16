import {
  AllowedMetricSchema,
  AllowedVisualizationSchema,
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  FixedOperationIdSchema,
  PredictionContractSchema,
  RunnerJobInputBundleSchema,
  type ArtifactManifest,
  type EvidenceRef,
} from "@counterlab/contracts";
import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const Sha256 = z
  .string()
  .regex(/^[a-f0-9]{64}$/u, "expected a lowercase SHA-256 digest");

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

export const VersionedRunnerJobInputBundleSchema = z.union([
  RunnerJobInputBundleSchema,
  RunnerLabCompileBundleV5Schema,
]);

export type VersionedRunnerJobInputBundle = z.infer<
  typeof VersionedRunnerJobInputBundleSchema
>;
