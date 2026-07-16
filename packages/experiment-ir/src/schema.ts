import { z } from "zod";

import {
  AllowedMetricSchema,
  AllowedVisualizationSchema,
  BoundaryObservableIdSchema,
  ConceptIdSchema,
  EvidenceRefSchema,
  FixedOperationIdSchema,
  FixedRunSpecSchema,
} from "@counterlab/contracts";

const NonEmptyString = z.string().trim().min(1);
const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");
const TokenIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9._:-]{0,95}$/,
    "expected a bounded lowercase operation or contract token",
  );
const ReasonCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,95}$/, "expected an uppercase reason code");

const HypothesisPatternSchema = z
  .object({
    patternId: TokenIdSchema,
    description: NonEmptyString,
  })
  .strict();

export const ExperimentIRHypothesisSchema = z
  .object({
    id: z.enum(["current", "competing"]),
    statement: NonEmptyString,
    conditions: z.array(NonEmptyString).min(1).max(12),
    nonClaims: z.array(NonEmptyString).min(1).max(12),
    predictedPattern: HypothesisPatternSchema,
  })
  .strict();

const CandidateHypothesisPatternSchema = z
  .object({
    hypothesisId: z.enum(["current", "competing"]),
    patternId: TokenIdSchema,
  })
  .strict();

export const CandidateExperimentSchema = z
  .object({
    id: TokenIdSchema,
    title: NonEmptyString,
    operationIds: z.array(FixedOperationIdSchema).min(1).max(8),
    baseline: FixedRunSpecSchema,
    interventions: z.array(FixedRunSpecSchema).min(1).max(7),
    heldConstantIds: z.array(TokenIdSchema).min(1).max(20),
    changedVariableIds: z.array(TokenIdSchema).min(1).max(4),
    observableIds: z.array(AllowedMetricSchema).min(1).max(12),
    hypothesisPatterns: z.tuple([
      CandidateHypothesisPatternSchema,
      CandidateHypothesisPatternSchema,
    ]),
    inconclusiveConditionIds: z.array(TokenIdSchema).min(1).max(8),
    complexityCost: z.number().finite().min(0).max(100),
    discriminatesBecause: NonEmptyString,
  })
  .strict()
  .superRefine((candidate, context) => {
    const operationIds = new Set(candidate.operationIds);
    if (operationIds.size !== candidate.operationIds.length) {
      context.addIssue({
        code: "custom",
        message: "candidate operation IDs must be unique",
        path: ["operationIds"],
      });
    }
    const runs = [candidate.baseline, ...candidate.interventions];
    const runIds = new Set<string>();
    for (const [index, run] of runs.entries()) {
      if (!operationIds.has(run.operation)) {
        context.addIssue({
          code: "custom",
          message: `run operation ${run.operation} is missing from operationIds`,
          path:
            index === 0
              ? ["baseline", "operation"]
              : ["interventions", index - 1, "operation"],
        });
      }
      if (runIds.has(run.runId)) {
        context.addIssue({
          code: "custom",
          message: `duplicate run ID: ${run.runId}`,
          path:
            index === 0
              ? ["baseline", "runId"]
              : ["interventions", index - 1, "runId"],
        });
      }
      runIds.add(run.runId);
    }
    if (
      candidate.hypothesisPatterns[0].hypothesisId !== "current" ||
      candidate.hypothesisPatterns[1].hypothesisId !== "competing"
    ) {
      context.addIssue({
        code: "custom",
        message:
          "candidate hypothesis patterns must be ordered current then competing",
        path: ["hypothesisPatterns"],
      });
    }
    if (
      candidate.hypothesisPatterns[0].patternId ===
      candidate.hypothesisPatterns[1].patternId
    ) {
      context.addIssue({
        code: "custom",
        message: "candidate hypothesis patterns must differ",
        path: ["hypothesisPatterns"],
      });
    }
    const held = new Set(candidate.heldConstantIds);
    for (const [index, changed] of candidate.changedVariableIds.entries()) {
      if (held.has(changed)) {
        context.addIssue({
          code: "custom",
          message: `${changed} cannot be both held constant and changed`,
          path: ["changedVariableIds", index],
        });
      }
    }
  });

const RejectedCandidateSchema = z
  .object({
    candidateId: TokenIdSchema,
    reasonCodes: z.array(ReasonCodeSchema).min(1).max(12),
  })
  .strict();

const FixedSelectionSchema = z
  .object({
    status: z.literal("SELECTED"),
    candidateId: TokenIdSchema,
    eligibleCandidateIds: z.array(TokenIdSchema).min(1).max(8),
    rejectedCandidates: z.array(RejectedCandidateSchema).max(8),
    minimumSeparation: z.number().finite().min(0).max(1),
    requiredSeparation: z.number().finite().min(0).max(1),
    complexityCost: z.number().finite().min(0).max(100),
    normalizedScore: z.number().finite().min(0).max(1),
    scorerVersion: TokenIdSchema,
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
    if (!selection.eligibleCandidateIds.includes(selection.candidateId)) {
      context.addIssue({
        code: "custom",
        message: "selected candidate must be eligible",
        path: ["candidateId"],
      });
    }
  });

const LegacySelectionSchema = z
  .object({
    status: z.literal("LEGACY_SELECTED"),
    candidateId: TokenIdSchema,
    adapterVersion: TokenIdSchema,
    notRescored: z.literal(true),
  })
  .strict();

export const ExperimentSelectionStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("UNSELECTED") }).strict(),
  FixedSelectionSchema,
  LegacySelectionSchema,
]);

const InconclusiveConditionSchema = z
  .object({
    id: TokenIdSchema,
    description: NonEmptyString,
    nextExperimentId: TokenIdSchema.optional(),
  })
  .strict();

const BoundarySweepRequestSchema = z
  .object({
    sweepId: TokenIdSchema,
    axisIds: z.array(TokenIdSchema).min(1).max(2),
    gridPresetId: TokenIdSchema,
    observableId: BoundaryObservableIdSchema,
    maxCells: z.number().int().positive().max(2_500),
  })
  .strict()
  .superRefine((sweep, context) => {
    if (new Set(sweep.axisIds).size !== sweep.axisIds.length) {
      context.addIssue({
        code: "custom",
        message: "boundary sweep axes must be unique",
        path: ["axisIds"],
      });
    }
  });

const TransferContractSchema = z
  .object({
    taskId: TokenIdSchema,
    changedSurface: NonEmptyString,
    requiredActionIds: z.array(TokenIdSchema).min(1).max(8),
    nonClaims: z.array(NonEmptyString).min(1).max(8),
  })
  .strict();

const ProvenanceSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("codex"),
      generatorId: TokenIdSchema,
      promptHash: Sha256Schema,
      inputHashes: z.array(Sha256Schema).min(1).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("fixed"),
      generatorId: TokenIdSchema,
      inputHashes: z.array(Sha256Schema).min(1).max(20),
    })
    .strict(),
  z
    .object({
      kind: z.literal("legacy_plan_v2"),
      generatorId: TokenIdSchema,
      sourcePlanHash: Sha256Schema,
      inputHashes: z.array(Sha256Schema).min(1).max(20),
    })
    .strict(),
]);

const ResourceLimitsSchema = z
  .object({
    wallSeconds: z.number().int().positive().max(120),
    memoryMb: z.number().int().min(128).max(2_048),
    maxRuns: z.number().int().positive().max(8),
  })
  .strict();

export const ExperimentIRV5Schema = z
  .object({
    schemaVersion: z.literal("5"),
    irId: TokenIdSchema,
    executionPlanId: NonEmptyString,
    sessionId: NonEmptyString,
    concept: ConceptIdSchema,
    conceptPackVersion: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    beliefSpecId: NonEmptyString,
    beliefSpecHash: Sha256Schema,
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(6),
    hypotheses: z.tuple([
      ExperimentIRHypothesisSchema,
      ExperimentIRHypothesisSchema,
    ]),
    candidateExperiments: z.array(CandidateExperimentSchema).min(1).max(8),
    selection: ExperimentSelectionStateSchema,
    visualizations: z.array(AllowedVisualizationSchema).min(1).max(8),
    inconclusiveConditions: z.array(InconclusiveConditionSchema).min(1).max(12),
    boundarySweep: BoundarySweepRequestSchema.optional(),
    transfer: TransferContractSchema,
    nonClaims: z.array(NonEmptyString).min(1).max(12),
    provenance: ProvenanceSchema,
    limitations: z.array(NonEmptyString).min(1).max(12),
    resourceLimits: ResourceLimitsSchema,
  })
  .strict()
  .superRefine((ir, context) => {
    if (
      ir.hypotheses[0].id !== "current" ||
      ir.hypotheses[1].id !== "competing"
    ) {
      context.addIssue({
        code: "custom",
        message: "hypotheses must be ordered current then competing",
        path: ["hypotheses"],
      });
    }
    if (
      ir.hypotheses[0].statement.toLowerCase() ===
      ir.hypotheses[1].statement.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "primary hypotheses must differ",
        path: ["hypotheses", 1, "statement"],
      });
    }

    const candidates = new Map<
      string,
      (typeof ir.candidateExperiments)[number]
    >();
    for (const [index, candidate] of ir.candidateExperiments.entries()) {
      if (candidates.has(candidate.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate candidate experiment ID: ${candidate.id}`,
          path: ["candidateExperiments", index, "id"],
        });
      }
      candidates.set(candidate.id, candidate);
      const runs = [candidate.baseline, ...candidate.interventions];
      for (const [runIndex, run] of runs.entries()) {
        if (run.concept !== ir.concept) {
          context.addIssue({
            code: "custom",
            message: `candidate run concept ${run.concept} does not match ${ir.concept}`,
            path:
              runIndex === 0
                ? ["candidateExperiments", index, "baseline", "concept"]
                : [
                    "candidateExperiments",
                    index,
                    "interventions",
                    runIndex - 1,
                    "concept",
                  ],
          });
        }
      }
      if (runs.length > ir.resourceLimits.maxRuns) {
        context.addIssue({
          code: "custom",
          message: "candidate exceeds resourceLimits.maxRuns",
          path: ["candidateExperiments", index],
        });
      }
    }

    const inconclusiveIds = new Set<string>();
    for (const [index, condition] of ir.inconclusiveConditions.entries()) {
      if (inconclusiveIds.has(condition.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate inconclusive condition ID: ${condition.id}`,
          path: ["inconclusiveConditions", index, "id"],
        });
      }
      inconclusiveIds.add(condition.id);
      if (
        condition.nextExperimentId !== undefined &&
        !candidates.has(condition.nextExperimentId)
      ) {
        context.addIssue({
          code: "custom",
          message: "next experiment does not resolve",
          path: ["inconclusiveConditions", index, "nextExperimentId"],
        });
      }
    }
    for (const [
      candidateIndex,
      candidate,
    ] of ir.candidateExperiments.entries()) {
      for (const [
        conditionIndex,
        conditionId,
      ] of candidate.inconclusiveConditionIds.entries()) {
        if (!inconclusiveIds.has(conditionId)) {
          context.addIssue({
            code: "custom",
            message: `inconclusive condition does not resolve: ${conditionId}`,
            path: [
              "candidateExperiments",
              candidateIndex,
              "inconclusiveConditionIds",
              conditionIndex,
            ],
          });
        }
      }
    }

    if (ir.selection.status !== "UNSELECTED") {
      if (!candidates.has(ir.selection.candidateId)) {
        context.addIssue({
          code: "custom",
          message: "selected candidate does not resolve",
          path: ["selection", "candidateId"],
        });
      }
      if (ir.selection.status === "SELECTED") {
        const seen = new Set<string>();
        for (const [
          index,
          candidateId,
        ] of ir.selection.eligibleCandidateIds.entries()) {
          if (!candidates.has(candidateId)) {
            context.addIssue({
              code: "custom",
              message: "eligible candidate does not resolve",
              path: ["selection", "eligibleCandidateIds", index],
            });
          }
          if (seen.has(candidateId)) {
            context.addIssue({
              code: "custom",
              message: "eligible candidate IDs must be unique",
              path: ["selection", "eligibleCandidateIds", index],
            });
          }
          seen.add(candidateId);
        }
        for (const [
          index,
          rejected,
        ] of ir.selection.rejectedCandidates.entries()) {
          if (!candidates.has(rejected.candidateId)) {
            context.addIssue({
              code: "custom",
              message: "rejected candidate does not resolve",
              path: ["selection", "rejectedCandidates", index, "candidateId"],
            });
          }
          if (seen.has(rejected.candidateId)) {
            context.addIssue({
              code: "custom",
              message: "a candidate cannot be both eligible and rejected",
              path: ["selection", "rejectedCandidates", index, "candidateId"],
            });
          }
          seen.add(rejected.candidateId);
        }
      }
    }
  });

export type ExperimentIRV5 = z.infer<typeof ExperimentIRV5Schema>;
export type CandidateExperiment = z.infer<typeof CandidateExperimentSchema>;
export type ExperimentSelectionState = z.infer<
  typeof ExperimentSelectionStateSchema
>;
