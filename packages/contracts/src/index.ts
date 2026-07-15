import { z } from "zod";

const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");
const GitObjectIdSchema = z
  .string()
  .regex(
    /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/,
    "expected a full Git object identifier",
  );
const NonEmptyString = z.string().trim().min(1);

export const ConceptIdSchema = z.enum(["entity_leakage", "class_imbalance"]);

export type ConceptId = z.infer<typeof ConceptIdSchema>;

export const SupportReasonSchema = z
  .object({
    code: NonEmptyString,
    message: NonEmptyString,
    cellIndex: z.number().int().nonnegative().optional(),
  })
  .strict();

export type SupportReason = z.infer<typeof SupportReasonSchema>;

export const ArtifactManifestSchema = z
  .object({
    artifactId: NonEmptyString,
    fileName: NonEmptyString,
    fileSha256: Sha256Schema,
    nbformat: z.number().int().positive(),
    support: z
      .object({
        status: z.enum(["SUPPORTED", "PARTIAL", "UNSUPPORTED"]),
        reasons: z.array(SupportReasonSchema),
      })
      .strict()
      .superRefine((support, context) => {
        if (support.status === "SUPPORTED" && support.reasons.length > 0) {
          context.addIssue({
            code: "custom",
            message: "SUPPORTED artifacts cannot include support reasons",
            path: ["reasons"],
          });
        }
        if (support.status !== "SUPPORTED" && support.reasons.length === 0) {
          context.addIssue({
            code: "custom",
            message: `${support.status} artifacts require at least one support reason`,
            path: ["reasons"],
          });
        }
      }),
    cells: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          type: z.enum(["code", "markdown", "raw"]),
          sourceSha256: Sha256Schema,
          sourceExcerpt: z.string(),
          executionCount: z.number().int().nonnegative().nullable().optional(),
          outputHashes: z.array(Sha256Schema),
          symbols: z.array(NonEmptyString),
          metricCandidates: z.array(
            z
              .object({
                name: NonEmptyString,
                value: z.number().finite(),
                outputIndex: z.number().int().nonnegative(),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
    schemaSummary: z
      .object({
        fields: z.array(
          z
            .object({
              name: NonEmptyString,
              inferredType: NonEmptyString,
              privacyClass: NonEmptyString,
            })
            .strict(),
        ),
        rowCount: z.number().int().nonnegative().optional(),
        entityCandidates: z.array(NonEmptyString),
        targetCandidates: z.array(NonEmptyString),
      })
      .strict(),
    packageHints: z.array(NonEmptyString),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;

export const ExperimentPlanSchema = z
  .object({
    schemaVersion: z.literal("1"),
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    datasetAdapter: NonEmptyString,
    competingHypotheses: z.tuple([NonEmptyString, NonEmptyString]),
    expectedDiscrimination: z
      .array(
        z
          .object({
            runId: NonEmptyString,
            expectedUnderCurrent: NonEmptyString,
            expectedUnderCompeting: NonEmptyString,
          })
          .strict(),
      )
      .min(1),
    runs: z
      .array(
        z
          .object({
            id: NonEmptyString,
            split: z.enum(["random", "group", "time"]),
            groupBy: NonEmptyString.optional(),
            dropFeatures: z.array(NonEmptyString).optional(),
            model: NonEmptyString,
            seed: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
    metrics: z.array(NonEmptyString).min(1),
    views: z.array(NonEmptyString).min(1),
    invariants: z.array(NonEmptyString).min(1),
    resourceLimits: z
      .object({
        wallSeconds: z.number().int().positive(),
        memoryMb: z.number().int().positive(),
        maxProcesses: z.number().int().positive(),
        maxFiles: z.number().int().positive(),
        maxOutputBytes: z.number().int().positive(),
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, context) => {
    if (
      plan.competingHypotheses[0].toLowerCase() ===
      plan.competingHypotheses[1].toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "competing hypotheses must differ",
        path: ["competingHypotheses"],
      });
    }

    const runIds = new Set<string>();
    for (const [index, run] of plan.runs.entries()) {
      if (runIds.has(run.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate run id: ${run.id}`,
          path: ["runs", index, "id"],
        });
      }
      runIds.add(run.id);

      if (run.split === "group" && run.groupBy === undefined) {
        context.addIssue({
          code: "custom",
          message: "groupBy is required for a group split",
          path: ["runs", index, "groupBy"],
        });
      }
    }

    for (const [index, expected] of plan.expectedDiscrimination.entries()) {
      if (!runIds.has(expected.runId)) {
        context.addIssue({
          code: "custom",
          message: `expected discrimination references unknown run: ${expected.runId}`,
          path: ["expectedDiscrimination", index, "runId"],
        });
      }
      if (
        expected.expectedUnderCurrent.toLowerCase() ===
        expected.expectedUnderCompeting.toLowerCase()
      ) {
        context.addIssue({
          code: "custom",
          message: "expected outcomes must be observably different",
          path: ["expectedDiscrimination", index],
        });
      }
    }
  });

export type ExperimentPlan = z.infer<typeof ExperimentPlanSchema>;

export const EvidenceRefSchema = z
  .object({
    cellIndex: z.number().int().nonnegative().optional(),
    outputIndex: z.number().int().nonnegative().optional(),
    kind: z.enum(["code", "metric", "schema", "output", "learner_claim"]),
    hash: Sha256Schema,
    excerpt: z.string().max(2_000),
    relevance: NonEmptyString,
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      (evidence.kind === "code" ||
        evidence.kind === "metric" ||
        evidence.kind === "output") &&
      evidence.cellIndex === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: `${evidence.kind} evidence requires a cellIndex`,
        path: ["cellIndex"],
      });
    }
    if (
      (evidence.kind === "metric" || evidence.kind === "output") &&
      evidence.outputIndex === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: `${evidence.kind} evidence requires an outputIndex`,
        path: ["outputIndex"],
      });
    }
  });

export type EvidenceRef = z.infer<typeof EvidenceRefSchema>;

const ConceptRouteCandidateSchema = z
  .object({
    concept: ConceptIdSchema,
    conceptPackVersion: NonEmptyString,
    confidence: z.number().finite().min(0).max(1),
    evidence: z.array(EvidenceRefSchema).min(1).max(3),
  })
  .strict();

export const ConceptRoutingDecisionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("selected"),
      concept: ConceptIdSchema,
      conceptPackVersion: NonEmptyString,
      confidence: z.number().finite().min(0).max(1),
      evidence: z.array(EvidenceRefSchema).min(1).max(3),
      limitations: z.array(NonEmptyString),
    })
    .strict(),
  z
    .object({
      kind: z.literal("choice_required"),
      candidates: z.array(ConceptRouteCandidateSchema).min(2),
    })
    .strict(),
  z
    .object({
      kind: z.literal("insufficient_evidence"),
      candidates: z.array(ConceptIdSchema).min(1),
      limitations: z.array(NonEmptyString).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("unsupported_artifact"),
      reasons: z.array(SupportReasonSchema).min(1),
    })
    .strict(),
]);

export type ConceptRoutingDecision = z.infer<
  typeof ConceptRoutingDecisionSchema
>;

export const FixedOperationIdSchema = z.enum([
  "leakage.random_row_split",
  "leakage.group_holdout",
  "leakage.identity_ablation",
  "leakage.entity_overlap",
  "leakage.controlled_comparison",
  "imbalance.majority_baseline",
  "imbalance.stratified_holdout",
  "imbalance.confusion_matrix",
  "imbalance.threshold_sweep",
  "imbalance.prevalence_sweep",
]);

export type FixedOperationId = z.infer<typeof FixedOperationIdSchema>;

export const AllowedMetricSchema = z.enum([
  "accuracy",
  "roc_auc",
  "entity_overlap_rate",
  "precision",
  "recall",
  "f1",
  "pr_auc",
  "confusion_matrix",
  "prevalence",
]);

export type AllowedMetric = z.infer<typeof AllowedMetricSchema>;

export const AllowedVisualizationSchema = z.enum([
  "metric_comparison",
  "entity_overlap",
  "confusion_matrix",
  "threshold_curve",
  "prevalence_sensitivity",
]);

export type AllowedVisualization = z.infer<typeof AllowedVisualizationSchema>;

const EpistemicTokenIdSchema = z
  .string()
  .trim()
  .regex(
    /^[a-z][a-z0-9._:-]{0,95}$/,
    "expected a bounded lowercase contract token",
  );
const EpistemicReasonCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,95}$/, "expected an uppercase reason code");
const SignedResultPathSchema = z
  .string()
  .max(256)
  .regex(
    /^\/(?:[A-Za-z0-9_-]+)(?:\/[A-Za-z0-9_-]+)*$/,
    "expected a bounded signed-result JSON pointer",
  );

const TechnicalVerificationBindingSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    reportHash: Sha256Schema,
  })
  .strict();

const ControlBindingSchema = z
  .object({
    controlId: EpistemicTokenIdSchema,
    beforeHash: Sha256Schema,
    afterHash: Sha256Schema,
  })
  .strict();

const ObservableBindingSchema = z
  .object({
    observableId: AllowedMetricSchema,
    resultPath: SignedResultPathSchema,
    resultHash: Sha256Schema,
  })
  .strict();

export const EpistemicOutcomeV1Schema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("HYPOTHESIS_PATTERN"),
      hypothesisId: z.enum(["current", "competing"]),
      patternId: EpistemicTokenIdSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("INCONCLUSIVE"),
      conditionId: EpistemicTokenIdSchema,
      nextExperimentId: EpistemicTokenIdSchema.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("UNRESOLVED") }).strict(),
]);

export const EpistemicObservationV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    irHash: Sha256Schema,
    resultHash: Sha256Schema,
    selectedCandidateId: EpistemicTokenIdSchema,
    technicalVerification: TechnicalVerificationBindingSchema,
    changedVariableIds: z.array(EpistemicTokenIdSchema).max(12),
    controlBindings: z.array(ControlBindingSchema).min(1).max(20),
    observableBindings: z.array(ObservableBindingSchema).min(1).max(20),
    outcome: EpistemicOutcomeV1Schema,
    boundaryBinding: z
      .object({
        sweepId: EpistemicTokenIdSchema,
        resultPath: SignedResultPathSchema,
        resultHash: Sha256Schema,
      })
      .strict()
      .optional(),
    scope: NonEmptyString.max(500),
    learnerFacingClaims: z.array(NonEmptyString.max(500)).max(8),
  })
  .strict()
  .superRefine((observation, context) => {
    const controlIds = new Set<string>();
    for (const [index, binding] of observation.controlBindings.entries()) {
      if (controlIds.has(binding.controlId)) {
        context.addIssue({
          code: "custom",
          message: `duplicate control binding: ${binding.controlId}`,
          path: ["controlBindings", index, "controlId"],
        });
      }
      controlIds.add(binding.controlId);
    }
    const observableIds = new Set<string>();
    for (const [index, binding] of observation.observableBindings.entries()) {
      if (observableIds.has(binding.observableId)) {
        context.addIssue({
          code: "custom",
          message: `duplicate observable binding: ${binding.observableId}`,
          path: ["observableBindings", index, "observableId"],
        });
      }
      observableIds.add(binding.observableId);
    }
  });

export type EpistemicObservationV1 = z.infer<
  typeof EpistemicObservationV1Schema
>;

export type EpistemicOutcomeV1 = z.infer<typeof EpistemicOutcomeV1Schema>;

const BoundarySweepPolicySchema = z
  .object({
    sweepId: EpistemicTokenIdSchema,
    axisIds: z.array(EpistemicTokenIdSchema).min(1).max(2),
    gridPresetId: EpistemicTokenIdSchema,
    observableId: AllowedMetricSchema,
    maxCells: z.number().int().positive().max(2_500),
    resultPathPrefix: SignedResultPathSchema,
  })
  .strict();

export const EpistemicVerifierPolicyV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    policyVersion: EpistemicTokenIdSchema,
    verifierVersion: EpistemicTokenIdSchema,
    classifierId: EpistemicTokenIdSchema,
    concept: ConceptIdSchema,
    allowedScopes: z.array(NonEmptyString.max(500)).min(1).max(12),
    observableResultPathPrefixes: z
      .array(
        z
          .object({
            observableId: AllowedMetricSchema,
            prefixes: z.array(SignedResultPathSchema).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    boundarySweeps: z.array(BoundarySweepPolicySchema).max(12),
    approvedClaims: z.array(NonEmptyString.max(500)).max(20),
    forbiddenClaims: z.array(NonEmptyString.max(500)).min(1).max(20),
  })
  .strict()
  .superRefine((policy, context) => {
    const observableIds = new Set<string>();
    for (const [
      index,
      binding,
    ] of policy.observableResultPathPrefixes.entries()) {
      if (observableIds.has(binding.observableId)) {
        context.addIssue({
          code: "custom",
          message: `duplicate observable policy: ${binding.observableId}`,
          path: ["observableResultPathPrefixes", index, "observableId"],
        });
      }
      observableIds.add(binding.observableId);
    }
    const sweepIds = new Set<string>();
    for (const [index, sweep] of policy.boundarySweeps.entries()) {
      if (sweepIds.has(sweep.sweepId)) {
        context.addIssue({
          code: "custom",
          message: `duplicate boundary sweep policy: ${sweep.sweepId}`,
          path: ["boundarySweeps", index, "sweepId"],
        });
      }
      sweepIds.add(sweep.sweepId);
    }
  });

export type EpistemicVerifierPolicyV1 = z.infer<
  typeof EpistemicVerifierPolicyV1Schema
>;

export const EpistemicFindingCodeSchema = z.enum([
  "NON_DISCRIMINATING_EXPERIMENT",
  "CONFOUNDED_INTERVENTION",
  "MISSING_DECISIVE_PATTERN",
  "UNRESOLVED_OUTCOME",
  "CLAIM_EXCEEDS_EVIDENCE",
  "INCONCLUSIVE_NOT_REPRESENTED",
  "BOUNDARY_SWEEP_UNAUTHORIZED",
  "RESULT_BINDING_MISMATCH",
  "TECHNICAL_VERIFICATION_FAILED",
]);

export type EpistemicFindingCode = z.infer<typeof EpistemicFindingCodeSchema>;

const EvidenceVerdictBaseSchema = z.object({
  schemaVersion: z.literal("1"),
  irHash: Sha256Schema,
  technicalReportHash: Sha256Schema,
  verifierVersion: EpistemicTokenIdSchema,
});

export const EvidenceVerdictSchema = z.discriminatedUnion("kind", [
  EvidenceVerdictBaseSchema.extend({
    kind: z.literal("SUPPORTS"),
    hypothesisId: z.enum(["current", "competing"]),
    scope: NonEmptyString.max(500),
    resultHash: Sha256Schema,
  }).strict(),
  EvidenceVerdictBaseSchema.extend({
    kind: z.literal("INCONCLUSIVE"),
    reasonCode: EpistemicReasonCodeSchema,
    nextExperimentId: EpistemicTokenIdSchema.optional(),
    scope: NonEmptyString.max(500),
    resultHash: Sha256Schema,
  }).strict(),
  EvidenceVerdictBaseSchema.extend({
    kind: z.literal("REJECTED"),
    findingIds: z.array(EpistemicTokenIdSchema).min(1).max(20),
    resultReleased: z.literal(false),
  }).strict(),
]);

export type EvidenceVerdict = z.infer<typeof EvidenceVerdictSchema>;

const LeakageFixedRunSpecSchema = z
  .object({
    concept: z.literal("entity_leakage"),
    runId: NonEmptyString,
    operation: z.enum([
      "leakage.random_row_split",
      "leakage.group_holdout",
      "leakage.identity_ablation",
    ]),
    seed: z.number().int().nonnegative(),
    testFraction: z.number().finite().min(0.1).max(0.5),
    entityField: NonEmptyString,
    dropIdentity: z.boolean(),
    model: z.literal("logistic_regression"),
  })
  .strict();

const ImbalanceFixedRunSpecSchema = z
  .object({
    concept: z.literal("class_imbalance"),
    runId: NonEmptyString,
    operation: z.enum([
      "imbalance.majority_baseline",
      "imbalance.stratified_holdout",
      "imbalance.threshold_sweep",
      "imbalance.prevalence_sweep",
    ]),
    seed: z.number().int().nonnegative(),
    threshold: z.number().finite().min(0.05).max(0.95),
    prevalenceScenario: z.enum(["observed", "rarer", "more_common"]),
    model: z.enum(["logistic_regression", "majority_baseline"]),
  })
  .strict();

export const FixedRunSpecSchema = z.discriminatedUnion("concept", [
  LeakageFixedRunSpecSchema,
  ImbalanceFixedRunSpecSchema,
]);

export type FixedRunSpec = z.infer<typeof FixedRunSpecSchema>;

export const ExperimentPlanV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    planId: NonEmptyString,
    sessionId: NonEmptyString,
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    conceptPackVersion: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    beliefTestId: NonEmptyString,
    evidenceRefs: z.array(EvidenceRefSchema).min(1).max(6),
    baseline: FixedRunSpecSchema,
    interventions: z.array(FixedRunSpecSchema).min(1).max(7),
    controlledVariables: z.array(NonEmptyString).min(1),
    changedVariables: z.array(NonEmptyString).min(1),
    metrics: z.array(AllowedMetricSchema).min(1),
    visualizations: z.array(AllowedVisualizationSchema).min(1),
    discriminatesBecause: NonEmptyString,
    expectedPatterns: z
      .array(
        z
          .object({
            hypothesisId: z.enum(["current", "competing"]),
            qualitativeOutcome: NonEmptyString,
          })
          .strict(),
      )
      .length(2),
    nonClaims: z.array(NonEmptyString).min(1),
    resourceLimits: z
      .object({
        wallSeconds: z.number().int().positive().max(120),
        memoryMb: z.number().int().min(128).max(2_048),
        maxRuns: z.number().int().positive().max(8),
      })
      .strict(),
  })
  .strict()
  .superRefine((plan, context) => {
    const runs = [plan.baseline, ...plan.interventions];
    const runIds = new Set<string>();
    for (const [index, run] of runs.entries()) {
      if (run.concept !== plan.concept) {
        context.addIssue({
          code: "custom",
          message: `run concept ${run.concept} does not match plan concept ${plan.concept}`,
          path:
            index === 0
              ? ["baseline", "concept"]
              : ["interventions", index - 1, "concept"],
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
    if (runs.length > plan.resourceLimits.maxRuns) {
      context.addIssue({
        code: "custom",
        message: "plan exceeds resourceLimits.maxRuns",
        path: ["resourceLimits", "maxRuns"],
      });
    }
    if (
      new Set(plan.expectedPatterns.map((pattern) => pattern.hypothesisId))
        .size !== 2
    ) {
      context.addIssue({
        code: "custom",
        message:
          "expected patterns must cover current and competing hypotheses",
        path: ["expectedPatterns"],
      });
    }
    if (
      plan.expectedPatterns[0]?.qualitativeOutcome.toLowerCase() ===
      plan.expectedPatterns[1]?.qualitativeOutcome.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "expected patterns must be observably different",
        path: ["expectedPatterns"],
      });
    }
  });

export type ExperimentPlanV2 = z.infer<typeof ExperimentPlanV2Schema>;

export const PatchOperationIdSchema = z.enum([
  "replace_row_split_with_group_holdout",
  "exclude_entity_feature",
  "stratify_classification_holdout",
  "add_majority_baseline",
  "replace_accuracy_only_evaluation",
]);

export type PatchOperationId = z.infer<typeof PatchOperationIdSchema>;

const PatchPlanBaseShape = {
  schemaVersion: z.literal("1"),
  planId: NonEmptyString,
  sessionId: NonEmptyString,
  conceptPackVersion: NonEmptyString,
  artifactManifestHash: Sha256Schema,
  sourceArtifactHash: Sha256Schema,
  transferResultHash: Sha256Schema,
  verifiedResultHash: Sha256Schema,
  evidenceRefs: z.array(EvidenceRefSchema).min(1).max(6),
  targetCells: z.array(z.number().int().nonnegative()).min(1).max(4),
  preserveUnrelatedCells: z.literal(true),
  nonClaims: z.array(NonEmptyString).min(1),
} as const;

const PatchOperationSchema = z
  .object({
    id: PatchOperationIdSchema,
    cellIndex: z.number().int().nonnegative(),
    reason: NonEmptyString,
  })
  .strict();

function validatePatchCellScope(
  plan: {
    targetCells: number[];
    operations: Array<{ cellIndex: number }>;
  },
  context: z.RefinementCtx,
) {
  const targetCells = new Set(plan.targetCells);
  for (const [index, operation] of plan.operations.entries()) {
    if (!targetCells.has(operation.cellIndex)) {
      context.addIssue({
        code: "custom",
        message: "patch operation cell must be declared in targetCells",
        path: ["operations", index, "cellIndex"],
      });
    }
  }
}

const LeakagePatchPlanV1Schema = z
  .object({
    ...PatchPlanBaseShape,
    concept: z.literal("entity_leakage"),
    entityField: NonEmptyString,
    targetField: NonEmptyString,
    operations: z.array(PatchOperationSchema).length(2),
  })
  .strict()
  .superRefine((plan, context) => {
    const operationIds = new Set(plan.operations.map((item) => item.id));
    const expected = new Set([
      "replace_row_split_with_group_holdout",
      "exclude_entity_feature",
    ]);
    if (
      operationIds.size !== expected.size ||
      [...operationIds].some((operation) => !expected.has(operation))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "patch plan must include each registered operation exactly once",
        path: ["operations"],
      });
    }
    validatePatchCellScope(plan, context);
  });

const ImbalancePatchPlanV1Schema = z
  .object({
    ...PatchPlanBaseShape,
    concept: z.literal("class_imbalance"),
    targetField: NonEmptyString,
    operations: z.array(PatchOperationSchema).length(3),
  })
  .strict()
  .superRefine((plan, context) => {
    const operationIds = new Set(plan.operations.map((item) => item.id));
    const expected = new Set([
      "stratify_classification_holdout",
      "add_majority_baseline",
      "replace_accuracy_only_evaluation",
    ]);
    if (
      operationIds.size !== expected.size ||
      [...operationIds].some((operation) => !expected.has(operation))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "imbalance patch plan must include each registered operation exactly once",
        path: ["operations"],
      });
    }
    validatePatchCellScope(plan, context);
  });

export const PatchPlanV1Schema = z.discriminatedUnion("concept", [
  LeakagePatchPlanV1Schema,
  ImbalancePatchPlanV1Schema,
]);

export type PatchPlanV1 = z.infer<typeof PatchPlanV1Schema>;

export const RunnerJobKindSchema = z.enum([
  "BELIEF_ANALYSIS",
  "LAB_COMPILE",
  "LAB_VERIFY",
  "LAB_RUN",
  "PATCH_COMPILE",
  "PATCH_VERIFY",
]);

export type RunnerJobKind = z.infer<typeof RunnerJobKindSchema>;

export const RunnerJobStatusSchema = z.enum([
  "QUEUED",
  "STARTING",
  "RUNNING",
  "AWAITING_APPROVAL",
  "REPAIRING",
  "VERIFIED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

export type RunnerJobStatus = z.infer<typeof RunnerJobStatusSchema>;

export const RunnerJobErrorSchema = z
  .object({
    code: NonEmptyString,
    message: NonEmptyString,
    retryable: z.boolean(),
    details: z.record(z.string(), z.json()).optional(),
  })
  .strict();

export type RunnerJobError = z.infer<typeof RunnerJobErrorSchema>;

export const RunnerRequestPurposeSchema = z.enum([
  "LAB_COMPILE",
  "LAB_RUN_AUTHORITATIVE",
  "LAB_RUN_INTERACTIVE",
  "PATCH_COMPILE",
]);

export type RunnerRequestPurpose = z.infer<typeof RunnerRequestPurposeSchema>;

export const RunnerRequestIdentityV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    sessionId: NonEmptyString,
    mode: z.literal("live_notebook"),
    purpose: RunnerRequestPurposeSchema,
    artifactId: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    conceptPack: z
      .object({
        id: z.enum(["entity_leakage", "class_imbalance"]),
        version: NonEmptyString,
      })
      .strict(),
    authorityProfileHash: Sha256Schema,
    authorityInputHashes: z
      .record(z.string().trim().min(1).max(80), Sha256Schema)
      .refine((value) => Object.keys(value).length > 0, {
        message: "authorityInputHashes must not be empty",
      }),
    configurationHash: Sha256Schema.optional(),
  })
  .strict()
  .superRefine((identity, context) => {
    if (
      identity.purpose === "LAB_RUN_INTERACTIVE" &&
      identity.configurationHash === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "interactive runner identity requires configurationHash",
        path: ["configurationHash"],
      });
    }
    if (
      identity.purpose !== "LAB_RUN_INTERACTIVE" &&
      identity.configurationHash !== undefined
    ) {
      context.addIssue({
        code: "custom",
        message:
          "configurationHash is permitted only for an interactive runner identity",
        path: ["configurationHash"],
      });
    }
  });

export type RunnerRequestIdentityV1 = z.infer<
  typeof RunnerRequestIdentityV1Schema
>;

const terminalRunnerStatuses = new Set<RunnerJobStatus>([
  "VERIFIED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);

export const RunnerJobSchema = z
  .object({
    schemaVersion: z.literal("1"),
    jobId: NonEmptyString,
    kind: RunnerJobKindSchema,
    status: RunnerJobStatusSchema,
    sessionId: NonEmptyString,
    artifactId: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    conceptPack: z
      .object({
        id: z.enum(["entity_leakage", "class_imbalance"]),
        version: NonEmptyString,
      })
      .strict(),
    inputHashes: z.array(Sha256Schema).min(1),
    requestFingerprint: Sha256Schema.optional(),
    requestIdentity: RunnerRequestIdentityV1Schema.optional(),
    stateVersion: z.number().int().positive(),
    jobVersion: z.number().int().positive(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
    startedAt: z.iso.datetime({ offset: true }).optional(),
    dispatchAcknowledgedAt: z.iso.datetime({ offset: true }).optional(),
    completedAt: z.iso.datetime({ offset: true }).optional(),
    attempt: z.number().int().nonnegative(),
    maxAttempts: z.number().int().positive().max(3),
    runnerIdentity: NonEmptyString.nullable(),
    timeoutSeconds: z.number().int().positive().max(600),
    outputHashes: z.array(Sha256Schema),
    error: RunnerJobErrorSchema.optional(),
    eventCursor: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((job, context) => {
    if (
      (job.requestFingerprint === undefined) !==
      (job.requestIdentity === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "requestFingerprint and requestIdentity must be present together",
        path: ["requestFingerprint"],
      });
    }
    if (job.attempt > job.maxAttempts) {
      context.addIssue({
        code: "custom",
        message: "attempt cannot exceed maxAttempts",
        path: ["attempt"],
      });
    }
    if (job.status !== "QUEUED" && job.runnerIdentity === null) {
      context.addIssue({
        code: "custom",
        message: "a started job requires runner identity",
        path: ["runnerIdentity"],
      });
    }
    if (
      terminalRunnerStatuses.has(job.status) &&
      job.completedAt === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "a terminal job requires completedAt",
        path: ["completedAt"],
      });
    }
    if (job.status === "VERIFIED" && job.outputHashes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "a verified job requires output hashes",
        path: ["outputHashes"],
      });
    }
  });

export type RunnerJob = z.infer<typeof RunnerJobSchema>;

const runnerTransitions: Readonly<
  Record<RunnerJobStatus, readonly RunnerJobStatus[]>
> = {
  QUEUED: ["STARTING", "FAILED", "CANCELLED", "TIMED_OUT"],
  STARTING: ["RUNNING", "FAILED", "CANCELLED", "TIMED_OUT"],
  RUNNING: [
    "AWAITING_APPROVAL",
    "REPAIRING",
    "VERIFIED",
    "REJECTED",
    "FAILED",
    "CANCELLED",
    "TIMED_OUT",
  ],
  AWAITING_APPROVAL: ["RUNNING", "FAILED", "CANCELLED", "TIMED_OUT"],
  REPAIRING: [
    "RUNNING",
    "VERIFIED",
    "REJECTED",
    "FAILED",
    "CANCELLED",
    "TIMED_OUT",
  ],
  VERIFIED: [],
  REJECTED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: [],
};

export function assertRunnerJobTransition(
  from: RunnerJobStatus,
  to: RunnerJobStatus,
): RunnerJobStatus {
  if (!runnerTransitions[from].includes(to)) {
    const suffix = terminalRunnerStatuses.has(from) ? " terminal state" : "";
    throw new Error(
      `Cannot transition runner job from${suffix} ${from} to ${to}`,
    );
  }
  return to;
}

export const AllowedGeneratedPathSchema = z.enum([
  "experiment-plan.json",
  "patch-plan.json",
  "public-rationale.md",
]);

export const RunnerOutputPathSchema = z.enum([
  ...AllowedGeneratedPathSchema.options,
  "verified-result.json",
  "patched-notebook.ipynb",
  "patch-result.json",
]);

export type RunnerOutputPath = z.infer<typeof RunnerOutputPathSchema>;

const PublicCompilerEventBase = {
  schemaVersion: z.literal("1"),
  eventId: NonEmptyString,
  jobId: NonEmptyString,
  cursor: z.number().int().positive(),
  at: z.iso.datetime({ offset: true }),
} as const;

export const PublicCompilerEventSchema = z.discriminatedUnion("kind", [
  z
    .object({ ...PublicCompilerEventBase, kind: z.literal("job.started") })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("plan.summary"),
      title: NonEmptyString,
      steps: z.array(NonEmptyString).min(1).max(12),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("artifact.read"),
      evidenceRefs: z.array(EvidenceRefSchema).min(1).max(6),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("file.created"),
      path: AllowedGeneratedPathSchema,
      sha256: Sha256Schema,
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("diff.updated"),
      path: AllowedGeneratedPathSchema,
      unifiedDiff: z.string().max(50_000),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("command.completed"),
      label: NonEmptyString,
      exitCode: z.number().int(),
      durationMs: z.number().int().nonnegative(),
      excerpt: z.string().max(4_000),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("verifier.rejected"),
      invariant: NonEmptyString,
      observed: z.json(),
      expected: z.json(),
      counterexample: z.string().max(2_000),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("repair.started"),
      attempt: z.number().int().positive().max(2),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("verifier.verified"),
      invariantCount: z.number().int().positive(),
      mutationCount: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("result.ready"),
      resultHash: Sha256Schema,
    })
    .strict(),
  z
    .object({
      ...PublicCompilerEventBase,
      kind: z.literal("job.failed"),
      code: NonEmptyString,
      message: NonEmptyString,
    })
    .strict(),
]);

export type PublicCompilerEvent = z.infer<typeof PublicCompilerEventSchema>;

export const RunnerOperationalMetricsSchema = z
  .object({
    compilerDurationMs: z.number().int().nonnegative(),
    verifierDurationMs: z.number().int().nonnegative(),
    kernelDurationMs: z.number().int().nonnegative(),
    patchDurationMs: z.number().int().nonnegative(),
    repairAttempts: z.number().int().nonnegative().max(2),
    planTokenUsage: z
      .object({
        inputTokens: z.number().int().nonnegative(),
        cachedInputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        reasoningOutputTokens: z.number().int().nonnegative(),
        totalTokens: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

export type RunnerOperationalMetrics = z.infer<
  typeof RunnerOperationalMetricsSchema
>;

export const RunnerCallbackSchema = z
  .object({
    schemaVersion: z.literal("1"),
    callbackId: NonEmptyString,
    idempotencyKey: NonEmptyString,
    jobId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    status: z.enum([
      "VERIFIED",
      "REJECTED",
      "FAILED",
      "CANCELLED",
      "TIMED_OUT",
    ]),
    outputHashes: z.array(Sha256Schema),
    finalEventCursor: z.number().int().nonnegative(),
    error: RunnerJobErrorSchema.optional(),
    operationalMetrics: RunnerOperationalMetricsSchema.optional(),
    occurredAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((callback, context) => {
    if (callback.status === "VERIFIED" && callback.outputHashes.length === 0) {
      context.addIssue({
        code: "custom",
        message: "a verified callback requires output hashes",
        path: ["outputHashes"],
      });
    }
    if (callback.status === "FAILED" && callback.error === undefined) {
      context.addIssue({
        code: "custom",
        message: "a failed callback requires a typed error",
        path: ["error"],
      });
    }
  });

export type RunnerCallback = z.infer<typeof RunnerCallbackSchema>;

export const RunnerJobTokenClaimsSchema = z
  .object({
    schemaVersion: z.literal("2"),
    issuer: z.literal("counterlab-control-plane"),
    audience: z.literal("counterlab-runner"),
    purpose: z.enum(["RUN_JOB", "CANCEL_JOB"]),
    controlPlaneOrigin: z
      .string()
      .url()
      .max(2_048)
      .refine((value) => new URL(value).origin === value, {
        message: "controlPlaneOrigin must be an exact URL origin",
      }),
    tokenId: NonEmptyString,
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    inputBundleKey: z.string().regex(/^runner-input\/[A-Za-z0-9_-]+\.json$/),
    outputPrefix: z.string().regex(/^runner-output\/[A-Za-z0-9_-]+\/$/),
    callbackPath: z
      .string()
      .regex(/^\/api\/runner\/jobs\/[A-Za-z0-9_-]+\/callback$/),
    stateVersion: z.number().int().positive(),
    issuedAt: z.number().int().positive(),
    expiresAt: z.number().int().positive(),
  })
  .strict()
  .superRefine((claims, context) => {
    const ttl = claims.expiresAt - claims.issuedAt;
    if (ttl <= 0 || ttl > 900) {
      context.addIssue({
        code: "custom",
        message: "token expiration must be within 15 minutes of issue time",
        path: ["expiresAt"],
      });
    }
    if (
      claims.inputBundleKey !== `runner-input/${claims.jobId}.json` ||
      claims.outputPrefix !== `runner-output/${claims.jobId}/` ||
      claims.callbackPath !== `/api/runner/jobs/${claims.jobId}/callback`
    ) {
      context.addIssue({
        code: "custom",
        message: "runner token paths must be bound to the authorized job",
        path: ["jobId"],
      });
    }
  });

export type RunnerJobTokenClaims = z.infer<typeof RunnerJobTokenClaimsSchema>;

const VersionOneSchema = z.literal("1");
const JsonObjectSchema = z.record(z.string(), z.json());
const ProportionSchema = z.number().finite().min(0).max(1);

export const BeliefTestSchema = z
  .object({
    schemaVersion: VersionOneSchema.default("1"),
    id: NonEmptyString,
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    learnerClaim: NonEmptyString,
    currentHypothesis: z
      .object({
        statement: NonEmptyString,
        predictedOutcome: NonEmptyString,
      })
      .strict(),
    competingHypothesis: z
      .object({
        statement: NonEmptyString,
        predictedOutcome: NonEmptyString,
      })
      .strict(),
    evidenceRefs: z
      .array(
        z
          .object({
            cellIndex: z.number().int().nonnegative().optional(),
            outputIndex: z.number().int().nonnegative().optional(),
            kind: z.enum([
              "code",
              "metric",
              "schema",
              "output",
              "learner_claim",
            ]),
            hash: Sha256Schema,
            excerpt: z.string(),
            relevance: NonEmptyString,
          })
          .strict(),
      )
      .max(3),
    alternatives: z.array(
      z
        .object({
          label: NonEmptyString,
          rationale: NonEmptyString,
        })
        .strict(),
    ),
    decisiveIntervention: z
      .object({
        id: NonEmptyString,
        description: NonEmptyString,
        controlledVariables: z.array(NonEmptyString),
        changedVariables: z.array(NonEmptyString).min(1),
        discriminatesBecause: NonEmptyString,
      })
      .strict(),
    uncertainty: z
      .object({
        confidence: ProportionSchema,
        limitations: z.array(NonEmptyString),
        insufficientEvidence: z.boolean(),
      })
      .strict(),
    requiresLearnerConfirmation: z.literal(true),
  })
  .strict()
  .superRefine((beliefTest, context) => {
    if (
      beliefTest.currentHypothesis.statement.toLowerCase() ===
      beliefTest.competingHypothesis.statement.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "current and competing hypotheses must differ",
        path: ["competingHypothesis", "statement"],
      });
    }
    if (
      !beliefTest.uncertainty.insufficientEvidence &&
      beliefTest.evidenceRefs.length === 0
    ) {
      context.addIssue({
        code: "custom",
        message:
          "a sufficient Belief Test requires at least one evidence reference",
        path: ["evidenceRefs"],
      });
    }
    for (const [index, evidence] of beliefTest.evidenceRefs.entries()) {
      if (
        (evidence.kind === "code" ||
          evidence.kind === "metric" ||
          evidence.kind === "output") &&
        evidence.cellIndex === undefined
      ) {
        context.addIssue({
          code: "custom",
          message: `${evidence.kind} evidence requires a cellIndex`,
          path: ["evidenceRefs", index, "cellIndex"],
        });
      }
      if (
        (evidence.kind === "metric" || evidence.kind === "output") &&
        evidence.outputIndex === undefined
      ) {
        context.addIssue({
          code: "custom",
          message: `${evidence.kind} evidence requires an outputIndex`,
          path: ["evidenceRefs", index, "outputIndex"],
        });
      }
    }
  });

export type BeliefTest = z.infer<typeof BeliefTestSchema>;

export const PrimaryHypothesisSchema = z
  .object({
    id: z.enum(["current", "competing"]),
    statement: NonEmptyString,
    conditions: z.array(NonEmptyString).min(1),
    nonClaims: z
      .array(NonEmptyString)
      .min(1, "at least one non-claim is required"),
    evidence: z.array(EvidenceRefSchema).max(6),
    supportedCandidateExperimentIds: z.array(NonEmptyString).max(12),
  })
  .strict();

export type PrimaryHypothesis = z.infer<typeof PrimaryHypothesisSchema>;

export const AlternativeHypothesisSchema = z
  .object({
    id: NonEmptyString,
    label: NonEmptyString,
    statement: NonEmptyString,
    rationale: NonEmptyString,
    conditions: z.array(NonEmptyString).min(1),
    nonClaims: z
      .array(NonEmptyString)
      .min(1, "at least one non-claim is required"),
    evidence: z.array(EvidenceRefSchema).max(6),
    supportedCandidateExperimentIds: z.array(NonEmptyString).max(12),
  })
  .strict();

export type AlternativeHypothesis = z.infer<typeof AlternativeHypothesisSchema>;

export const BeliefSpecV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    id: NonEmptyString,
    concept: ConceptIdSchema,
    claim: NonEmptyString,
    evidenceRefs: z.array(EvidenceRefSchema).max(6),
    hypotheses: z.tuple([PrimaryHypothesisSchema, PrimaryHypothesisSchema]),
    alternatives: z.array(AlternativeHypothesisSchema).max(8),
    uncertainty: ProportionSchema,
    supportState: z.enum(["SUPPORTED", "PARTIAL", "INSUFFICIENT_EVIDENCE"]),
    learnerDecision: z.enum([
      "UNDECIDED",
      "CONFIRMED",
      "EDITED",
      "ALTERNATIVE_SELECTED",
      "REJECTED",
    ]),
    selectedAlternativeId: NonEmptyString.optional(),
  })
  .strict()
  .superRefine((beliefSpec, context) => {
    if (
      beliefSpec.hypotheses[0].id !== "current" ||
      beliefSpec.hypotheses[1].id !== "competing"
    ) {
      context.addIssue({
        code: "custom",
        message: "hypotheses must be ordered as current followed by competing",
        path: ["hypotheses"],
      });
    }
    if (
      beliefSpec.hypotheses[0].statement.toLowerCase() ===
      beliefSpec.hypotheses[1].statement.toLowerCase()
    ) {
      context.addIssue({
        code: "custom",
        message: "current and competing hypotheses must differ",
        path: ["hypotheses", 1, "statement"],
      });
    }

    const evidenceKeys = new Set(
      beliefSpec.evidenceRefs.map(beliefEvidenceKey),
    );
    for (const [
      hypothesisIndex,
      hypothesis,
    ] of beliefSpec.hypotheses.entries()) {
      for (const [evidenceIndex, evidence] of hypothesis.evidence.entries()) {
        if (!evidenceKeys.has(beliefEvidenceKey(evidence))) {
          context.addIssue({
            code: "custom",
            message: "hypothesis evidence must resolve to evidenceRefs",
            path: ["hypotheses", hypothesisIndex, "evidence", evidenceIndex],
          });
        }
      }
    }
    for (const [
      alternativeIndex,
      alternative,
    ] of beliefSpec.alternatives.entries()) {
      for (const [evidenceIndex, evidence] of alternative.evidence.entries()) {
        if (!evidenceKeys.has(beliefEvidenceKey(evidence))) {
          context.addIssue({
            code: "custom",
            message: "alternative evidence must resolve to evidenceRefs",
            path: ["alternatives", alternativeIndex, "evidence", evidenceIndex],
          });
        }
      }
    }

    if (beliefSpec.supportState !== "INSUFFICIENT_EVIDENCE") {
      if (beliefSpec.evidenceRefs.length === 0) {
        context.addIssue({
          code: "custom",
          message: "SUPPORTED or PARTIAL Belief Specs require evidenceRefs",
          path: ["evidenceRefs"],
        });
      }
      for (const [index, hypothesis] of beliefSpec.hypotheses.entries()) {
        if (hypothesis.evidence.length === 0) {
          context.addIssue({
            code: "custom",
            message: "each primary hypothesis requires resolved evidence",
            path: ["hypotheses", index, "evidence"],
          });
        }
        if (hypothesis.supportedCandidateExperimentIds.length === 0) {
          context.addIssue({
            code: "custom",
            message:
              "each primary hypothesis requires a supported candidate experiment",
            path: ["hypotheses", index, "supportedCandidateExperimentIds"],
          });
        }
      }
    }

    const alternativeIds = new Set<string>();
    for (const [index, alternative] of beliefSpec.alternatives.entries()) {
      if (alternativeIds.has(alternative.id)) {
        context.addIssue({
          code: "custom",
          message: `duplicate alternative hypothesis id: ${alternative.id}`,
          path: ["alternatives", index, "id"],
        });
      }
      alternativeIds.add(alternative.id);
    }
    if (beliefSpec.learnerDecision === "ALTERNATIVE_SELECTED") {
      if (
        beliefSpec.selectedAlternativeId === undefined ||
        !alternativeIds.has(beliefSpec.selectedAlternativeId)
      ) {
        context.addIssue({
          code: "custom",
          message:
            "ALTERNATIVE_SELECTED requires a selectedAlternativeId that resolves",
          path: ["selectedAlternativeId"],
        });
      }
    } else if (beliefSpec.selectedAlternativeId !== undefined) {
      context.addIssue({
        code: "custom",
        message: "selectedAlternativeId is only valid for ALTERNATIVE_SELECTED",
        path: ["selectedAlternativeId"],
      });
    }
  });

export type BeliefSpecV2 = z.infer<typeof BeliefSpecV2Schema>;

export const BeliefSpecSchema = z.union([BeliefTestSchema, BeliefSpecV2Schema]);

export type BeliefSpec = z.infer<typeof BeliefSpecSchema>;

function beliefEvidenceKey(evidence: EvidenceRef): string {
  return [
    evidence.kind,
    evidence.hash,
    evidence.cellIndex ?? "",
    evidence.outputIndex ?? "",
  ].join(":");
}

function migratedAlternativeId(label: string, index: number): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `alternative-${index + 1}${slug.length === 0 ? "" : `-${slug}`}`;
}

/**
 * Creates an unsigned v2 compatibility view of a signed v1 Belief Test.
 * The source object is never changed. Because v1 did not encode complete
 * conditions or per-hypothesis non-claims, the migrated view is PARTIAL.
 */
export function migrateBeliefTestV1ToV2(input: unknown): BeliefSpecV2 {
  const beliefTest = BeliefTestSchema.parse(input);
  const limitations =
    beliefTest.uncertainty.limitations.length === 0
      ? [
          "This replay predates explicit hypothesis conditions and does not establish conclusions outside its recorded intervention.",
        ]
      : [...beliefTest.uncertainty.limitations];
  const conditions = [
    beliefTest.decisiveIntervention.description,
    ...beliefTest.decisiveIntervention.controlledVariables.map(
      (variable) => `${variable} remains controlled.`,
    ),
  ];
  const candidateExperimentIds = [beliefTest.decisiveIntervention.id];

  return BeliefSpecV2Schema.parse({
    schemaVersion: "2",
    id: beliefTest.id,
    concept: beliefTest.concept,
    claim: beliefTest.learnerClaim,
    evidenceRefs: structuredClone(beliefTest.evidenceRefs),
    hypotheses: [
      {
        id: "current",
        statement: beliefTest.currentHypothesis.statement,
        conditions,
        nonClaims: limitations,
        evidence: structuredClone(beliefTest.evidenceRefs),
        supportedCandidateExperimentIds: candidateExperimentIds,
      },
      {
        id: "competing",
        statement: beliefTest.competingHypothesis.statement,
        conditions,
        nonClaims: limitations,
        evidence: structuredClone(beliefTest.evidenceRefs),
        supportedCandidateExperimentIds: candidateExperimentIds,
      },
    ],
    alternatives: beliefTest.alternatives.map((alternative, index) => ({
      id: migratedAlternativeId(alternative.label, index),
      label: alternative.label,
      statement: alternative.label,
      rationale: alternative.rationale,
      conditions: [beliefTest.decisiveIntervention.description],
      nonClaims: limitations,
      evidence: structuredClone(beliefTest.evidenceRefs),
      supportedCandidateExperimentIds: [],
    })),
    uncertainty: beliefTest.uncertainty.confidence,
    supportState: beliefTest.uncertainty.insufficientEvidence
      ? "INSUFFICIENT_EVIDENCE"
      : "PARTIAL",
    learnerDecision: "UNDECIDED",
  });
}

export const PredictionContractSchema = z
  .object({
    schemaVersion: VersionOneSchema.default("1"),
    id: NonEmptyString,
    sessionId: NonEmptyString,
    beliefTestId: NonEmptyString,
    choice: NonEmptyString,
    numericRange: z
      .object({
        min: z.number().finite(),
        max: z.number().finite(),
      })
      .strict()
      .optional(),
    confidence: z.number().finite().min(0).max(100),
    committedAt: z.iso.datetime({ offset: true }),
    immutableHash: Sha256Schema,
  })
  .strict()
  .superRefine((prediction, context) => {
    if (
      prediction.numericRange !== undefined &&
      prediction.numericRange.min > prediction.numericRange.max
    ) {
      context.addIssue({
        code: "custom",
        message: "numeric range minimum cannot exceed maximum",
        path: ["numericRange"],
      });
    }
  });

export type PredictionContract = z.infer<typeof PredictionContractSchema>;

export const RunnerLabCompileBundleSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("LAB_COMPILE"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    artifactManifestHash: Sha256Schema,
    approvedBeliefTest: BeliefTestSchema,
    prediction: PredictionContractSchema,
    artifactManifest: ArtifactManifestSchema,
    conceptPack: z
      .object({
        id: z.enum(["entity_leakage", "class_imbalance"]),
        version: NonEmptyString,
        title: NonEmptyString,
        allowedOperations: z.array(FixedOperationIdSchema).min(1),
        allowedMetrics: z.array(AllowedMetricSchema).min(1),
        allowedVisualizations: z.array(AllowedVisualizationSchema).min(1),
        verifierInvariants: z.array(NonEmptyString).min(1),
        planRequirements: z.array(NonEmptyString).min(1).max(16),
      })
      .strict(),
    experimentPlanSchema: z.record(z.string(), z.json()),
    resourceLimits: z
      .object({
        wallSeconds: z.number().int().positive().max(120),
        memoryMb: z.number().int().min(128).max(2_048),
        maxRuns: z.number().int().positive().max(8),
      })
      .strict(),
    permittedOutputs: z
      .tuple([
        z.literal("experiment-plan.json"),
        z.literal("public-rationale.md"),
      ])
      .readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    if (
      bundle.jobId.length === 0 ||
      bundle.sessionId !== bundle.prediction.sessionId ||
      bundle.approvedBeliefTest.id !== bundle.prediction.beliefTestId ||
      bundle.approvedBeliefTest.concept !== bundle.conceptPack.id
    ) {
      context.addIssue({
        code: "custom",
        message: "runner bundle lineage does not resolve",
        path: ["prediction"],
      });
    }
  });

export type RunnerLabCompileBundle = z.infer<
  typeof RunnerLabCompileBundleSchema
>;

export const InteractiveLeakageRunRequestSchema = z
  .object({
    schemaVersion: z.literal("1"),
    splitStrategy: z.enum(["random", "group"]),
    entityField: NonEmptyString,
    identityAblation: z.boolean(),
    testFraction: z.number().finite().min(0.1).max(0.5),
  })
  .strict();

export type InteractiveLeakageRunRequest = z.infer<
  typeof InteractiveLeakageRunRequestSchema
>;

export const InteractiveImbalanceRunRequestSchema = z
  .object({
    schemaVersion: z.literal("1"),
    concept: z.literal("class_imbalance"),
    threshold: z.number().finite().min(0.05).max(0.45),
    prevalenceScenario: z.enum(["observed", "rarer", "more_common"]),
    metricFocus: z.enum(["precision", "recall", "f1", "pr_auc"]),
  })
  .strict();

export type InteractiveImbalanceRunRequest = z.infer<
  typeof InteractiveImbalanceRunRequestSchema
>;

export const RunnerLabRunBundleSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("LAB_RUN"),
    purpose: z.enum(["AUTHORITATIVE", "INTERACTIVE"]),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    artifactManifestHash: Sha256Schema,
    artifactManifest: ArtifactManifestSchema,
    learnerClaim: NonEmptyString,
    experimentPlan: ExperimentPlanV2Schema,
    experimentPlanHash: Sha256Schema,
    fixture: z
      .object({
        id: z.enum(["public-leakage-v1", "public-imbalance-v1"]),
      })
      .strict(),
    permittedOutputs: z.tuple([z.literal("verified-result.json")]).readonly(),
  })
  .strict()
  .superRefine((bundle, context) => {
    const plan = bundle.experimentPlan;
    if (
      bundle.sessionId !== plan.sessionId ||
      bundle.artifactManifestHash !== plan.artifactManifestHash ||
      (plan.concept === "entity_leakage" &&
        bundle.fixture.id !== "public-leakage-v1") ||
      (plan.concept === "class_imbalance" &&
        bundle.fixture.id !== "public-imbalance-v1")
    ) {
      context.addIssue({
        code: "custom",
        message: "runner LAB_RUN bundle lineage does not resolve",
        path: ["experimentPlan"],
      });
    }
  });

export type RunnerLabRunBundle = z.infer<typeof RunnerLabRunBundleSchema>;

export const RunnerPatchCompileBundleSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("PATCH_COMPILE"),
    jobId: NonEmptyString,
    sessionId: NonEmptyString,
    stateVersion: z.number().int().positive(),
    requestedAt: z.iso.datetime({ offset: true }),
    artifactManifestHash: Sha256Schema,
    conceptPackVersion: NonEmptyString,
    artifactManifest: ArtifactManifestSchema,
    approvedBeliefTest: BeliefTestSchema,
    verifiedResultSummary: z
      .object({
        schemaVersion: z.literal("2"),
        resultHash: Sha256Schema,
        planId: NonEmptyString,
        runIds: z.array(NonEmptyString).min(1).max(8),
      })
      .strict(),
    transferSummary: z
      .object({
        outcome: z.literal("PASSED"),
        resultHash: Sha256Schema,
        selectedStrategy: NonEmptyString,
        identifiedRisks: z.array(NonEmptyString).min(1),
      })
      .strict(),
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
    const expectedTransformations =
      bundle.approvedBeliefTest.concept === "entity_leakage"
        ? new Set<PatchOperationId>([
            "replace_row_split_with_group_holdout",
            "exclude_entity_feature",
          ])
        : new Set<PatchOperationId>([
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
      ) ||
      !bundle.allowedCellIndices.every((index) =>
        bundle.artifactManifest.cells.some((cell) => cell.index === index),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "runner PATCH_COMPILE bundle lineage does not resolve",
        path: ["allowedCellIndices"],
      });
    }
  });

export type RunnerPatchCompileBundle = z.infer<
  typeof RunnerPatchCompileBundleSchema
>;

export const RunnerJobInputBundleSchema = z.discriminatedUnion("kind", [
  RunnerLabCompileBundleSchema,
  RunnerLabRunBundleSchema,
  RunnerPatchCompileBundleSchema,
]);

export type RunnerJobInputBundle = z.infer<typeof RunnerJobInputBundleSchema>;

export const EvidenceEventUnsignedSchema = z
  .object({
    schemaVersion: VersionOneSchema.default("1"),
    eventId: NonEmptyString,
    sessionId: NonEmptyString,
    sequence: z.number().int().positive(),
    timestamp: z.iso.datetime({ offset: true }),
    actor: z.enum([
      "learner",
      "gpt-5.6",
      "codex",
      "verifier",
      "kernel",
      "system",
    ]),
    kind: NonEmptyString,
    inputHashes: z.array(Sha256Schema),
    outputHashes: z.array(Sha256Schema),
    payload: JsonObjectSchema,
    modelId: NonEmptyString.optional(),
    promptHash: Sha256Schema.optional(),
    commitHash: GitObjectIdSchema.optional(),
    durationMs: z.number().int().nonnegative().optional(),
    exitCode: z.number().int().optional(),
    previousEventHash: Sha256Schema.optional(),
  })
  .strict();

export type EvidenceEventUnsigned = z.infer<typeof EvidenceEventUnsignedSchema>;

export const EvidenceEventSchema = EvidenceEventUnsignedSchema.extend({
  eventHash: Sha256Schema,
}).strict();

export type EvidenceEvent = z.infer<typeof EvidenceEventSchema>;

const VerifiedRunSchema = z
  .object({
    id: NonEmptyString,
    splitStrategy: z.enum(["random", "group", "time"]),
    groupBy: NonEmptyString.nullable(),
    dropFeatures: z.array(NonEmptyString),
    model: NonEmptyString,
    seed: z.number().int().nonnegative(),
    inputFingerprint: Sha256Schema,
    featureSetFingerprint: Sha256Schema,
    metrics: z
      .object({
        accuracy: ProportionSchema,
        rocAuc: ProportionSchema.nullable(),
      })
      .strict(),
    sampleSizes: z
      .object({
        train: z.number().int().positive(),
        test: z.number().int().positive(),
      })
      .strict(),
    entityCounts: z
      .object({
        train: z.number().int().nonnegative(),
        test: z.number().int().nonnegative(),
      })
      .strict(),
    entityOverlap: z
      .object({
        count: z.number().int().nonnegative(),
        rate: ProportionSchema,
      })
      .strict(),
  })
  .strict();

const ResultFixtureSchema = z
  .object({
    customers: z.number().int().positive(),
    rows: z.number().int().positive(),
    sha256: Sha256Schema,
    targetRate: ProportionSchema,
  })
  .strict();

const ResultChartRowSchema = z
  .object({
    runId: NonEmptyString,
    splitStrategy: z.enum(["random", "group", "time"]),
    accuracy: ProportionSchema,
    rocAuc: ProportionSchema.nullable(),
    sampleSize: z.number().int().positive(),
    seed: z.number().int().nonnegative(),
  })
  .strict();

function validateResultCharts(
  result: {
    runs: Array<z.infer<typeof VerifiedRunSchema>>;
    chartData: Array<z.infer<typeof ResultChartRowSchema>>;
  },
  context: z.RefinementCtx,
): void {
  const runs = new Map(result.runs.map((run) => [run.id, run]));
  if (runs.size !== result.runs.length) {
    context.addIssue({
      code: "custom",
      message: "verified run IDs must be unique",
      path: ["runs"],
    });
  }
  for (const [index, chart] of result.chartData.entries()) {
    const run = runs.get(chart.runId);
    if (run === undefined) {
      context.addIssue({
        code: "custom",
        message: `chart references unknown run: ${chart.runId}`,
        path: ["chartData", index, "runId"],
      });
      continue;
    }
    if (
      chart.splitStrategy !== run.splitStrategy ||
      chart.sampleSize !== run.sampleSizes.test ||
      chart.seed !== run.seed ||
      chart.accuracy !== run.metrics.accuracy ||
      chart.rocAuc !== run.metrics.rocAuc
    ) {
      context.addIssue({
        code: "custom",
        message: `chart data does not match verified run: ${chart.runId}`,
        path: ["chartData", index],
      });
    }
  }
}

export const VerifiedResultSetV1Schema = z
  .object({
    schemaVersion: VersionOneSchema,
    concept: z.literal("entity_leakage"),
    fixture: ResultFixtureSchema,
    kernelVersion: NonEmptyString,
    seed: z.number().int().nonnegative(),
    runs: z.array(VerifiedRunSchema).min(1),
    chartData: z.array(ResultChartRowSchema).min(1),
    resultHash: Sha256Schema,
  })
  .strict()
  .superRefine(validateResultCharts);

const HostedLeakageVerifiedRunSchema = VerifiedRunSchema.extend({
  operation: FixedOperationIdSchema,
}).strict();

const HostedLeakageVerifiedResultSetV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    concept: z.literal("entity_leakage"),
    planId: NonEmptyString,
    sessionId: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    conceptPackVersion: NonEmptyString,
    fixture: ResultFixtureSchema,
    kernelVersion: NonEmptyString,
    seed: z.number().int().nonnegative(),
    runs: z.array(HostedLeakageVerifiedRunSchema).min(1),
    chartData: z.array(ResultChartRowSchema).min(1),
    resultHash: Sha256Schema,
  })
  .strict()
  .superRefine(validateResultCharts);

export type HostedLeakageVerifiedResultSetV2 = z.infer<
  typeof HostedLeakageVerifiedResultSetV2Schema
>;

const ImbalanceMetricsSchema = z
  .object({
    accuracy: ProportionSchema,
    precision: ProportionSchema,
    recall: ProportionSchema,
    f1: ProportionSchema,
    prAuc: ProportionSchema,
    rocAuc: ProportionSchema,
  })
  .strict();

const ClassCountsSchema = z
  .object({
    negative: z.number().int().nonnegative(),
    positive: z.number().int().nonnegative(),
  })
  .strict();

const HostedImbalanceVerifiedRunSchema = z
  .object({
    id: NonEmptyString,
    operation: z.enum([
      "imbalance.majority_baseline",
      "imbalance.stratified_holdout",
      "imbalance.threshold_sweep",
      "imbalance.prevalence_sweep",
    ]),
    model: z.enum(["majority_baseline", "logistic_regression"]),
    seed: z.number().int().nonnegative(),
    threshold: ProportionSchema,
    prevalenceScenario: z.enum(["observed", "rarer", "more_common"]),
    metrics: ImbalanceMetricsSchema,
    confusionMatrix: z
      .object({
        tn: z.number().int().nonnegative(),
        fp: z.number().int().nonnegative(),
        fn: z.number().int().nonnegative(),
        tp: z.number().int().nonnegative(),
      })
      .strict(),
    sampleSizes: z
      .object({
        train: z.number().int().positive(),
        test: z.number().int().positive(),
      })
      .strict(),
    classCounts: z
      .object({ train: ClassCountsSchema, test: ClassCountsSchema })
      .strict(),
    prevalence: ProportionSchema,
    predictedPositiveRate: ProportionSchema,
    featureSetFingerprint: Sha256Schema,
    inputFingerprint: Sha256Schema,
  })
  .strict();

const ImbalanceResultChartRowSchema = z
  .object({
    runId: NonEmptyString,
    operation: z.enum([
      "imbalance.majority_baseline",
      "imbalance.stratified_holdout",
      "imbalance.threshold_sweep",
      "imbalance.prevalence_sweep",
    ]),
    accuracy: ProportionSchema,
    precision: ProportionSchema,
    recall: ProportionSchema,
    f1: ProportionSchema,
    prAuc: ProportionSchema,
    rocAuc: ProportionSchema,
    prevalence: ProportionSchema,
    predictedPositiveRate: ProportionSchema,
    sampleSize: z.number().int().positive(),
    threshold: ProportionSchema,
    prevalenceScenario: z.enum(["observed", "rarer", "more_common"]),
    seed: z.number().int().nonnegative(),
  })
  .strict();

const HostedImbalanceVerifiedResultSetV2Schema = z
  .object({
    schemaVersion: z.literal("2"),
    concept: z.literal("class_imbalance"),
    planId: NonEmptyString,
    sessionId: NonEmptyString,
    artifactManifestHash: Sha256Schema,
    conceptPackVersion: NonEmptyString,
    fixture: z
      .object({
        sha256: Sha256Schema,
        rows: z.number().int().positive(),
        positives: z.number().int().positive(),
        prevalence: ProportionSchema,
      })
      .strict(),
    kernelVersion: NonEmptyString,
    seed: z.number().int().nonnegative(),
    runs: z.array(HostedImbalanceVerifiedRunSchema).min(1),
    chartData: z.array(ImbalanceResultChartRowSchema).min(1),
    resultHash: Sha256Schema,
  })
  .strict()
  .superRefine((result, context) => {
    const runs = new Map(result.runs.map((run) => [run.id, run]));
    if (runs.size !== result.runs.length) {
      context.addIssue({
        code: "custom",
        message: "verified run IDs must be unique",
        path: ["runs"],
      });
    }
    for (const [index, chart] of result.chartData.entries()) {
      const run = runs.get(chart.runId);
      if (
        run === undefined ||
        chart.operation !== run.operation ||
        chart.sampleSize !== run.sampleSizes.test ||
        chart.seed !== run.seed ||
        chart.threshold !== run.threshold ||
        chart.prevalenceScenario !== run.prevalenceScenario ||
        chart.accuracy !== run.metrics.accuracy ||
        chart.precision !== run.metrics.precision ||
        chart.recall !== run.metrics.recall ||
        chart.f1 !== run.metrics.f1 ||
        chart.prAuc !== run.metrics.prAuc ||
        chart.rocAuc !== run.metrics.rocAuc ||
        chart.prevalence !== run.prevalence ||
        chart.predictedPositiveRate !== run.predictedPositiveRate
      ) {
        context.addIssue({
          code: "custom",
          message: `chart data does not match verified run: ${chart.runId}`,
          path: ["chartData", index],
        });
      }
    }
  });

export type HostedImbalanceVerifiedResultSetV2 = z.infer<
  typeof HostedImbalanceVerifiedResultSetV2Schema
>;

export const HostedVerifiedResultSetV2Schema = z.union([
  HostedLeakageVerifiedResultSetV2Schema,
  HostedImbalanceVerifiedResultSetV2Schema,
]);

export type HostedVerifiedResultSetV2 = z.infer<
  typeof HostedVerifiedResultSetV2Schema
>;

export const VerifiedResultSetSchema = z.union([
  VerifiedResultSetV1Schema,
  HostedVerifiedResultSetV2Schema,
]);

export type VerifiedResultSet = z.infer<typeof VerifiedResultSetSchema>;
export type LeakageVerifiedResultSet =
  z.infer<typeof VerifiedResultSetV1Schema> | HostedLeakageVerifiedResultSetV2;
export type ImbalanceVerifiedResultSet = HostedImbalanceVerifiedResultSetV2;

export const TransferResultSchema = z
  .object({
    schemaVersion: VersionOneSchema,
    id: NonEmptyString,
    sessionId: NonEmptyString,
    taskId: NonEmptyString,
    outcome: z.enum(["PASSED", "FAILED"]),
    selectedStrategy: NonEmptyString,
    identifiedRisks: z.array(NonEmptyString),
    evidenceChoices: z.array(NonEmptyString),
    checks: z.array(
      z
        .object({
          invariant: NonEmptyString,
          passed: z.boolean(),
          evidence: NonEmptyString,
        })
        .strict(),
    ),
    evaluatorVersion: NonEmptyString,
    evaluatedAt: z.iso.datetime({ offset: true }),
    resultHash: Sha256Schema,
  })
  .strict()
  .superRefine((result, context) => {
    const allPassed =
      result.checks.length > 0 && result.checks.every((check) => check.passed);
    if ((result.outcome === "PASSED") !== allPassed) {
      context.addIssue({
        code: "custom",
        message: "transfer outcome must agree with deterministic checks",
        path: ["outcome"],
      });
    }
  });

export type TransferResult = z.infer<typeof TransferResultSchema>;

export const PatchResultSchema = z
  .object({
    schemaVersion: VersionOneSchema,
    id: NonEmptyString,
    sessionId: NonEmptyString,
    status: z.enum(["VERIFIED", "REJECTED", "UNVERIFIED"]),
    sourceArtifactHash: Sha256Schema,
    patchedArtifactHash: Sha256Schema,
    patchHash: Sha256Schema,
    modifiedCells: z.array(z.number().int().nonnegative()),
    diff: z.string(),
    verification: z
      .object({
        passed: z.boolean(),
        invariants: z.array(NonEmptyString),
        unchangedCellHashes: z.array(Sha256Schema),
      })
      .strict(),
    generatedAt: z.iso.datetime({ offset: true }),
    resultHash: Sha256Schema,
  })
  .strict()
  .superRefine((patch, context) => {
    if ((patch.status === "VERIFIED") !== patch.verification.passed) {
      context.addIssue({
        code: "custom",
        message: "VERIFIED patch status must agree with patch verification",
        path: ["verification", "passed"],
      });
    }
  });

export type PatchResult = z.infer<typeof PatchResultSchema>;

const BeforeAfterSchema = z
  .object({
    before: NonEmptyString,
    after: NonEmptyString,
  })
  .strict();

export const ReasoningDiffSchema = z
  .object({
    schemaVersion: VersionOneSchema,
    id: NonEmptyString,
    sessionId: NonEmptyString,
    dimensions: z
      .object({
        belief: BeforeAfterSchema,
        prediction: BeforeAfterSchema,
        code: BeforeAfterSchema,
        transfer: BeforeAfterSchema,
      })
      .strict(),
    evidenceEventHashes: z.array(Sha256Schema).min(1),
    issuedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type ReasoningDiff = z.infer<typeof ReasoningDiffSchema>;

export const ProofIntegritySchema = z
  .object({
    mode: z.enum(["integrity-hashed", "hmac-signed"]),
    algorithm: z.enum(["sha256", "hmac-sha256"]),
    contentHash: Sha256Schema,
    eventChainHead: Sha256Schema,
    signature: Sha256Schema.optional(),
  })
  .strict()
  .superRefine((integrity, context) => {
    if (integrity.mode === "integrity-hashed") {
      if (integrity.algorithm !== "sha256") {
        context.addIssue({
          code: "custom",
          message: "integrity-hashed bundles use sha256",
          path: ["algorithm"],
        });
      }
      if (integrity.signature !== undefined) {
        context.addIssue({
          code: "custom",
          message: "integrity-hashed bundles cannot contain a signature",
          path: ["signature"],
        });
      }
    } else {
      if (integrity.algorithm !== "hmac-sha256") {
        context.addIssue({
          code: "custom",
          message: "signed bundles use hmac-sha256",
          path: ["algorithm"],
        });
      }
      if (integrity.signature === undefined) {
        context.addIssue({
          code: "custom",
          message: "hmac-signed bundles require a signature",
          path: ["signature"],
        });
      }
    }
  });

export type ProofIntegrity = z.infer<typeof ProofIntegritySchema>;

const ExecutionSummarySchema = z
  .object({
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    command: NonEmptyString,
    reportHash: Sha256Schema,
  })
  .strict();

const VerifierSummarySchema = z
  .object({
    status: z.enum(["VERIFIED", "PARTIAL", "REJECTED", "UNVERIFIED"]),
    verifiedInvariants: z.array(NonEmptyString),
    mutations: z.array(NonEmptyString),
    reportHash: Sha256Schema,
  })
  .strict();

export const ProofBundleV1DraftSchema = z
  .object({
    schemaVersion: VersionOneSchema,
    bundleId: NonEmptyString,
    sessionId: NonEmptyString,
    replayId: NonEmptyString,
    createdAt: z.iso.datetime({ offset: true }),
    events: z.array(EvidenceEventSchema).min(1),
    artifactManifest: ArtifactManifestSchema,
    beliefTest: BeliefTestSchema,
    predictionContract: PredictionContractSchema,
    experimentPlan: ExperimentPlanSchema,
    generatedAdapter: z
      .object({
        sha256: Sha256Schema,
        commitHash: GitObjectIdSchema,
      })
      .strict(),
    publicTests: ExecutionSummarySchema,
    externalVerifier: VerifierSummarySchema,
    verifiedResultSet: VerifiedResultSetSchema,
    learnerRevision: z
      .object({
        text: NonEmptyString,
        recordedAt: z.iso.datetime({ offset: true }),
        eventHash: Sha256Schema,
      })
      .strict(),
    transferResult: TransferResultSchema,
    patchResult: PatchResultSchema,
    reasoningDiff: ReasoningDiffSchema,
    versions: z
      .object({
        environment: NonEmptyString,
        dependencies: NonEmptyString,
        fixture: NonEmptyString,
        kernel: NonEmptyString,
        verifier: NonEmptyString,
        prompt: NonEmptyString,
        model: NonEmptyString,
        template: NonEmptyString,
      })
      .strict(),
    limitations: z.array(NonEmptyString),
    reproductionCommands: z.array(NonEmptyString).min(1),
  })
  .strict();

export const ProofBundleV1Schema = ProofBundleV1DraftSchema.extend({
  integrity: ProofIntegritySchema,
}).strict();

const ProofVerificationReportSchema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.enum(["VERIFIED", "REJECTED"]),
    verifierVersion: NonEmptyString,
    invariantCount: z.number().int().nonnegative(),
    invariants: z.array(
      z
        .object({
          name: NonEmptyString,
          passed: z.boolean(),
          observed: z.unknown(),
          expected: z.unknown(),
          counterexample: z.string().optional(),
        })
        .strict(),
    ),
  })
  .passthrough();

export const ProofBundleV2DraftSchema = z
  .object({
    schemaVersion: z.literal("2"),
    bundleId: NonEmptyString,
    sessionId: NonEmptyString,
    replayId: z.null(),
    sessionMode: z.literal("live_notebook"),
    createdAt: z.iso.datetime({ offset: true }),
    events: z.array(EvidenceEventSchema).min(1),
    artifactManifest: ArtifactManifestSchema,
    beliefTest: BeliefTestSchema,
    predictionContract: PredictionContractSchema,
    experimentPlan: ExperimentPlanV2Schema,
    planVerification: ProofVerificationReportSchema.extend({
      planHash: Sha256Schema,
    }),
    publicCompilerEvents: z.array(PublicCompilerEventSchema),
    verifiedResultSet: HostedVerifiedResultSetV2Schema,
    learnerRevision: z
      .object({
        text: NonEmptyString,
        recordedAt: z.iso.datetime({ offset: true }),
        eventHash: Sha256Schema,
      })
      .strict(),
    transferResult: TransferResultSchema,
    patchPlan: PatchPlanV1Schema,
    patchPlanVerification: ProofVerificationReportSchema.extend({
      planHash: Sha256Schema,
    }),
    patchResult: PatchResultSchema,
    reasoningDiff: ReasoningDiffSchema,
    versions: z
      .object({
        environment: NonEmptyString,
        dependencies: NonEmptyString,
        fixture: NonEmptyString,
        kernel: NonEmptyString,
        verifier: NonEmptyString,
        prompt: NonEmptyString,
        model: NonEmptyString,
        conceptPack: NonEmptyString,
      })
      .strict(),
    limitations: z.array(NonEmptyString),
    reproductionCommands: z.array(NonEmptyString).min(1),
  })
  .strict();

export const ProofBundleV2Schema = ProofBundleV2DraftSchema.extend({
  integrity: ProofIntegritySchema,
}).strict();

export const ProofBundleDraftSchema = z.union([
  ProofBundleV1DraftSchema,
  ProofBundleV2DraftSchema,
]);

export type ProofBundleDraft = z.infer<typeof ProofBundleDraftSchema>;

export const ProofBundleSchema = z.union([
  ProofBundleV1Schema,
  ProofBundleV2Schema,
]);

export type ProofBundle = z.infer<typeof ProofBundleSchema>;

const ApiMetaSchema = z
  .object({
    requestId: NonEmptyString.optional(),
    timestamp: z.iso.datetime({ offset: true }).optional(),
  })
  .strict();

export function apiSuccessSchema<T extends z.ZodType>(dataSchema: T) {
  return z
    .object({
      ok: z.literal(true),
      data: dataSchema,
      meta: ApiMetaSchema.optional(),
    })
    .strict();
}

export const ApiErrorSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: NonEmptyString,
        message: NonEmptyString,
        details: JsonObjectSchema.optional(),
        retryable: z.boolean(),
      })
      .strict(),
    requestId: NonEmptyString.optional(),
  })
  .strict();

export function apiResponseSchema<T extends z.ZodType>(dataSchema: T) {
  return z.union([apiSuccessSchema(dataSchema), ApiErrorSchema]);
}

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: z.infer<typeof ApiMetaSchema>;
};

export type ApiError = z.infer<typeof ApiErrorSchema>;
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export const SessionModeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("sample_lesson"),
      sampleId: NonEmptyString,
    })
    .strict(),
  z.object({ kind: z.literal("live_notebook") }).strict(),
  z
    .object({
      kind: z.literal("verified_replay"),
      replayId: NonEmptyString,
    })
    .strict(),
]);

export type SessionMode = z.infer<typeof SessionModeSchema>;

export const SessionStateSchema = z.enum([
  "INGESTED",
  "BELIEF_TEST_PROPOSED",
  "BELIEF_TEST_CONFIRMED",
  "INSUFFICIENT_EVIDENCE",
  "REJECTED_BY_LEARNER",
  "PREDICTION_COMMITTED",
  "LAB_COMPILING",
  "LAB_REJECTED",
  "LAB_VERIFIED",
  "EXPERIMENT_COMPLETED",
  "REVISION_RECORDED",
  "TRANSFER_IN_PROGRESS",
  "TRANSFER_FAILED",
  "TRANSFER_PASSED",
  "PATCH_COMPILING",
  "PATCH_REJECTED",
  "PATCH_VERIFIED",
  "REASONING_DIFF_ISSUED",
]);

export type SessionState = z.infer<typeof SessionStateSchema>;

const SESSION_TRANSITIONS: Readonly<
  Record<SessionState, readonly SessionState[]>
> = {
  INGESTED: ["BELIEF_TEST_PROPOSED"],
  BELIEF_TEST_PROPOSED: [
    "BELIEF_TEST_CONFIRMED",
    "INSUFFICIENT_EVIDENCE",
    "REJECTED_BY_LEARNER",
  ],
  BELIEF_TEST_CONFIRMED: ["PREDICTION_COMMITTED"],
  INSUFFICIENT_EVIDENCE: [],
  REJECTED_BY_LEARNER: [],
  PREDICTION_COMMITTED: ["LAB_COMPILING"],
  LAB_COMPILING: ["LAB_REJECTED", "LAB_VERIFIED"],
  LAB_REJECTED: ["LAB_COMPILING"],
  LAB_VERIFIED: ["EXPERIMENT_COMPLETED"],
  EXPERIMENT_COMPLETED: ["REVISION_RECORDED"],
  REVISION_RECORDED: ["TRANSFER_IN_PROGRESS"],
  TRANSFER_IN_PROGRESS: ["TRANSFER_FAILED", "TRANSFER_PASSED"],
  TRANSFER_FAILED: ["TRANSFER_IN_PROGRESS"],
  TRANSFER_PASSED: ["PATCH_COMPILING"],
  PATCH_COMPILING: ["PATCH_REJECTED", "PATCH_VERIFIED"],
  PATCH_REJECTED: ["PATCH_COMPILING"],
  PATCH_VERIFIED: ["REASONING_DIFF_ISSUED"],
  REASONING_DIFF_ISSUED: [],
};

export function assertTransition(
  from: SessionState,
  to: SessionState,
): SessionState {
  if (!SESSION_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid transition from ${from} to ${to}`);
  }
  return to;
}

export function canTransition(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}
