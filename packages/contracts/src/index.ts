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
  });

export type BeliefTest = z.infer<typeof BeliefTestSchema>;

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

export const VerifiedResultSetSchema = z
  .object({
    schemaVersion: VersionOneSchema,
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    fixture: z
      .object({
        customers: z.number().int().positive(),
        rows: z.number().int().positive(),
        sha256: Sha256Schema,
        targetRate: ProportionSchema,
      })
      .strict(),
    kernelVersion: NonEmptyString,
    seed: z.number().int().nonnegative(),
    runs: z.array(VerifiedRunSchema).min(1),
    chartData: z
      .array(
        z
          .object({
            runId: NonEmptyString,
            splitStrategy: z.enum(["random", "group", "time"]),
            accuracy: ProportionSchema,
            rocAuc: ProportionSchema.nullable(),
            sampleSize: z.number().int().positive(),
            seed: z.number().int().nonnegative(),
          })
          .strict(),
      )
      .min(1),
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
  });

export type VerifiedResultSet = z.infer<typeof VerifiedResultSetSchema>;

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

export const ProofBundleDraftSchema = z
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

export type ProofBundleDraft = z.infer<typeof ProofBundleDraftSchema>;

export const ProofBundleSchema = ProofBundleDraftSchema.extend({
  integrity: ProofIntegritySchema,
}).strict();

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
