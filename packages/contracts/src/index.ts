import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");
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
    if (plan.competingHypotheses[0].toLowerCase() === plan.competingHypotheses[1].toLowerCase()) {
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

const SESSION_TRANSITIONS: Readonly<Record<SessionState, readonly SessionState[]>> = {
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

export function assertTransition(from: SessionState, to: SessionState): SessionState {
  if (!SESSION_TRANSITIONS[from].includes(to)) {
    throw new Error(`Invalid transition from ${from} to ${to}`);
  }
  return to;
}

export function canTransition(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}
