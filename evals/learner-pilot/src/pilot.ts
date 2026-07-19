import { z } from "zod";

const ConceptSchema = z.enum(["entity_leakage", "class_imbalance"]);

const ParticipantIdSchema = z
  .string()
  .regex(/^participant_[A-Za-z0-9_-]{16,128}$/);

const QualifiedReleaseReceiptSha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

const CONFUSION_CATEGORIES = [
  "navigation",
  "prediction_meaning",
  "test_rationale",
  "boundary_interpretation",
  "transfer_choice",
  "repair_scope",
  "proof_interpretation",
  "other_no_detail",
] as const;

const ConfusionCategorySchema = z.enum(CONFUSION_CATEGORIES);

const PilotLimitationSchema = z.enum([
  "No consented learner-pilot session records were supplied; no learner outcome is claimed.",
  "Results are descriptive pilot observations, not causal estimates or proof of mastery.",
  "No untreated control arm is included; concept order is randomized only to reduce order effects.",
  "Small convenience samples must not be generalized beyond the recruited participants.",
  "Transfer pass rate uses only the first unassisted attempt recorded for each task.",
  "The planned range of at least 12 completed participants was not reached.",
]);

const ReactionSchema = z
  .object({
    clarity: z.enum(["clearer", "unchanged", "less_clear", "declined"]),
    usefulness: z.enum(["useful", "neutral", "not_useful", "declined"]),
  })
  .strict();

const AbandonmentReasonSchema = z.enum([
  "participant_withdrew",
  "accessibility_barrier",
  "technical_failure",
  "time_limit",
  "facilitator_stopped",
  "other_no_detail",
]);

export const PilotTaskSchema = z
  .object({
    concept: ConceptSchema,
    firstUnassistedTransferPassed: z.boolean(),
    predictionDifferedFromResult: z.boolean(),
    durationSeconds: z.number().int().nonnegative().max(7_200),
    confusionCategories: z.array(ConfusionCategorySchema).max(8),
    reaction: ReactionSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      new Set(value.confusionCategories).size !==
      value.confusionCategories.length
    ) {
      context.addIssue({
        code: "custom",
        message: "confusion categories must be unique",
      });
    }
  });

export const PilotConsentReferenceSchema = z
  .object({
    schemaVersion: z.literal("1"),
    consentReferenceId: z.string().regex(/^consent_ref_[A-Za-z0-9_-]{16,128}$/),
    participantId: ParticipantIdSchema,
    consentVersion: z.literal("1"),
    recordedAt: z.string().datetime(),
  })
  .strict();

export const PilotSessionSchema = z
  .object({
    schemaVersion: z.literal("2"),
    participantId: ParticipantIdSchema,
    assignmentSlotId: z.string().regex(/^slot_\d{3}$/),
    consentReferenceId: z.string().regex(/^consent_ref_[A-Za-z0-9_-]{16,128}$/),
    qualifiedReleaseReceiptSha256: QualifiedReleaseReceiptSha256Schema,
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    completed: z.boolean(),
    abandonmentReason: AbandonmentReasonSchema.nullable(),
    tasks: z.array(PilotTaskSchema).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.completedAt !== null &&
      Date.parse(value.completedAt) < Date.parse(value.startedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "completion must not precede the session start",
      });
    }
    if (value.completed !== (value.completedAt !== null)) {
      context.addIssue({
        code: "custom",
        message: "completed and completedAt must agree",
      });
    }
    if (value.completed && value.tasks.length !== 2) {
      context.addIssue({
        code: "custom",
        message: "a completed session must contain exactly two concept tasks",
      });
    }
    if (value.completed && value.abandonmentReason !== null) {
      context.addIssue({
        code: "custom",
        message: "a completed session cannot have an abandonment reason",
      });
    }
    if (!value.completed && value.abandonmentReason === null) {
      context.addIssue({
        code: "custom",
        message:
          "an incomplete session must record a bounded abandonment reason",
      });
    }
    if (
      new Set(value.tasks.map((task) => task.concept)).size !==
      value.tasks.length
    ) {
      context.addIssue({
        code: "custom",
        message: "concept tasks must be unique",
      });
    }
  });

const AssignmentSchema = z
  .object({
    slotId: z.string().regex(/^slot_\d{3}$/),
    sequence: z.enum(["leakage_first", "imbalance_first"]),
  })
  .strict();

export const RandomizationSchema = z
  .object({
    schemaVersion: z.literal("1"),
    method: z.literal("permuted_balanced_concept_order"),
    seed: z.number().int(),
    slots: z.number().int().positive().max(200),
    assignments: z.array(AssignmentSchema),
    limitations: z.array(z.string()),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.assignments.length !== value.slots) {
      context.addIssue({
        code: "custom",
        message: "assignment count must equal the declared slot count",
      });
    }
    if (
      new Set(value.assignments.map((assignment) => assignment.slotId)).size !==
      value.assignments.length
    ) {
      context.addIssue({
        code: "custom",
        message: "randomization slot IDs must be unique",
      });
    }
    const leakageFirst = value.assignments.filter(
      (assignment) => assignment.sequence === "leakage_first",
    ).length;
    const imbalanceFirst = value.assignments.length - leakageFirst;
    if (leakageFirst !== imbalanceFirst) {
      context.addIssue({
        code: "custom",
        message: "randomization must remain balanced between concept orders",
      });
    }
  });

const ConceptMetricsSchema = z
  .object({
    tasks: z.number().int().nonnegative(),
    firstUnassistedTransferPassed: z.number().int().nonnegative(),
    predictionDifferedFromResult: z.number().int().nonnegative(),
    confusionObserved: z.number().int().nonnegative(),
  })
  .strict();

const ConfusionCategoryCountsSchema = z
  .object({
    navigation: z.number().int().nonnegative(),
    prediction_meaning: z.number().int().nonnegative(),
    test_rationale: z.number().int().nonnegative(),
    boundary_interpretation: z.number().int().nonnegative(),
    transfer_choice: z.number().int().nonnegative(),
    repair_scope: z.number().int().nonnegative(),
    proof_interpretation: z.number().int().nonnegative(),
    other_no_detail: z.number().int().nonnegative(),
  })
  .strict();

const ReactionCountsSchema = z
  .object({
    clarity: z
      .object({
        clearer: z.number().int().nonnegative(),
        unchanged: z.number().int().nonnegative(),
        less_clear: z.number().int().nonnegative(),
        declined: z.number().int().nonnegative(),
      })
      .strict(),
    usefulness: z
      .object({
        useful: z.number().int().nonnegative(),
        neutral: z.number().int().nonnegative(),
        not_useful: z.number().int().nonnegative(),
        declined: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict();

const AbandonmentCountsSchema = z
  .object({
    participant_withdrew: z.number().int().nonnegative(),
    accessibility_barrier: z.number().int().nonnegative(),
    technical_failure: z.number().int().nonnegative(),
    time_limit: z.number().int().nonnegative(),
    facilitator_stopped: z.number().int().nonnegative(),
    other_no_detail: z.number().int().nonnegative(),
  })
  .strict();

export const PilotAnalysisSchema = z
  .object({
    schemaVersion: z.literal("2"),
    status: z.enum(["NO_DATA", "DESCRIPTIVE_ONLY"]),
    analyzedAt: z.string().datetime(),
    qualifiedReleaseReceiptSha256:
      QualifiedReleaseReceiptSha256Schema.nullable(),
    participantCount: z.number().int().nonnegative(),
    completedSessionCount: z.number().int().nonnegative(),
    metrics: z
      .object({
        completionRate: z.number().min(0).max(1),
        taskCount: z.number().int().nonnegative(),
        firstUnassistedTransferPassRate: z.number().min(0).max(1),
        predictionDifferenceRate: z.number().min(0).max(1),
        confusionObservedRate: z.number().min(0).max(1),
        confusionCategoryCounts: ConfusionCategoryCountsSchema,
        abandonmentRate: z.number().min(0).max(1),
        medianTaskDurationSeconds: z.number().nonnegative().nullable(),
        reactions: ReactionCountsSchema,
        abandonmentReasons: AbandonmentCountsSchema,
        byConcept: z
          .object({
            entity_leakage: ConceptMetricsSchema,
            class_imbalance: ConceptMetricsSchema,
          })
          .strict(),
      })
      .strict()
      .nullable(),
    limitations: z.array(PilotLimitationSchema).max(5),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.completedSessionCount > value.participantCount) {
      context.addIssue({
        code: "custom",
        message: "completed session count cannot exceed participant count",
      });
    }
    if (
      value.status === "NO_DATA" &&
      (value.participantCount !== 0 ||
        value.completedSessionCount !== 0 ||
        value.qualifiedReleaseReceiptSha256 !== null ||
        value.metrics !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "NO_DATA analysis must contain zero counts and null metrics",
      });
    }
    if (
      value.status === "DESCRIPTIVE_ONLY" &&
      (value.participantCount === 0 ||
        value.qualifiedReleaseReceiptSha256 === null ||
        value.metrics === null)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "DESCRIPTIVE_ONLY analysis requires participants and aggregate metrics",
      });
    }
    if (value.metrics === null) return;

    const conceptTaskCount =
      value.metrics.byConcept.entity_leakage.tasks +
      value.metrics.byConcept.class_imbalance.tasks;
    if (conceptTaskCount !== value.metrics.taskCount) {
      context.addIssue({
        code: "custom",
        message: "concept task counts must equal the aggregate task count",
      });
    }
    for (const concept of Object.values(value.metrics.byConcept)) {
      if (
        concept.firstUnassistedTransferPassed > concept.tasks ||
        concept.predictionDifferedFromResult > concept.tasks ||
        concept.confusionObserved > concept.tasks
      ) {
        context.addIssue({
          code: "custom",
          message: "concept outcomes cannot exceed concept task counts",
        });
      }
    }
    const clarityCount = Object.values(value.metrics.reactions.clarity).reduce(
      (sum, count) => sum + count,
      0,
    );
    const usefulnessCount = Object.values(
      value.metrics.reactions.usefulness,
    ).reduce((sum, count) => sum + count, 0);
    if (
      clarityCount !== value.metrics.taskCount ||
      usefulnessCount !== value.metrics.taskCount
    ) {
      context.addIssue({
        code: "custom",
        message: "reaction counts must equal the aggregate task count",
      });
    }

    const firstTransferPassCount = Object.values(
      value.metrics.byConcept,
    ).reduce((sum, concept) => sum + concept.firstUnassistedTransferPassed, 0);
    const predictionDifferenceCount = Object.values(
      value.metrics.byConcept,
    ).reduce((sum, concept) => sum + concept.predictionDifferedFromResult, 0);
    const confusionObservedTaskCount = Object.values(
      value.metrics.byConcept,
    ).reduce((sum, concept) => sum + concept.confusionObserved, 0);
    const abandonmentCount = Object.values(
      value.metrics.abandonmentReasons,
    ).reduce((sum, count) => sum + count, 0);
    const confusionCategoryCount = Object.values(
      value.metrics.confusionCategoryCounts,
    ).reduce((sum, count) => sum + count, 0);

    if (
      value.metrics.completionRate !==
        roundedRate(value.completedSessionCount, value.participantCount) ||
      value.metrics.firstUnassistedTransferPassRate !==
        roundedRate(firstTransferPassCount, value.metrics.taskCount) ||
      value.metrics.predictionDifferenceRate !==
        roundedRate(predictionDifferenceCount, value.metrics.taskCount) ||
      value.metrics.confusionObservedRate !==
        roundedRate(confusionObservedTaskCount, value.metrics.taskCount) ||
      value.metrics.abandonmentRate !==
        roundedRate(abandonmentCount, value.participantCount)
    ) {
      context.addIssue({
        code: "custom",
        message: "aggregate rates must reconcile with their bounded counts",
      });
    }
    if (
      abandonmentCount !==
      value.participantCount - value.completedSessionCount
    ) {
      context.addIssue({
        code: "custom",
        message:
          "abandonment counts must equal the number of incomplete sessions",
      });
    }
    if (
      Object.values(value.metrics.confusionCategoryCounts).some(
        (count) => count > value.metrics!.taskCount,
      ) ||
      confusionCategoryCount < confusionObservedTaskCount ||
      confusionCategoryCount >
        confusionObservedTaskCount * CONFUSION_CATEGORIES.length
    ) {
      context.addIssue({
        code: "custom",
        message:
          "confusion category counts must reconcile with confused-task counts",
      });
    }
  });

export type PilotSession = z.input<typeof PilotSessionSchema>;
export type PilotAnalysis = z.infer<typeof PilotAnalysisSchema>;
export type PilotConsentReference = z.input<typeof PilotConsentReferenceSchema>;
export type PilotValidationContext = {
  randomization: z.input<typeof RandomizationSchema>;
  consentReferences: PilotConsentReference[];
  qualifiedReleaseReceiptSha256: string;
};

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

export function createBalancedRandomization(options: {
  slots: number;
  seed: number;
}) {
  if (
    !Number.isInteger(options.slots) ||
    options.slots < 2 ||
    options.slots % 2 !== 0
  ) {
    throw new Error("slots must be a positive even integer of at least 2");
  }
  const sequences = [
    ...Array.from(
      { length: options.slots / 2 },
      () => "leakage_first" as const,
    ),
    ...Array.from(
      { length: options.slots / 2 },
      () => "imbalance_first" as const,
    ),
  ];
  const next = random(options.seed);
  for (let index = sequences.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    [sequences[index], sequences[swap]] = [sequences[swap]!, sequences[index]!];
  }
  return RandomizationSchema.parse({
    schemaVersion: "1",
    method: "permuted_balanced_concept_order",
    seed: options.seed,
    slots: options.slots,
    assignments: sequences.map((sequence, index) => ({
      slotId: `slot_${String(index + 1).padStart(3, "0")}`,
      sequence,
    })),
    limitations: [
      "Randomization balances task order only; this pilot has no untreated control arm.",
      "Slots are assigned to pseudonymous participant IDs after consent without storing direct identifiers.",
    ],
  });
}

function roundedRate(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Number((numerator / denominator).toFixed(6));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function expectedConceptOrder(sequence: "leakage_first" | "imbalance_first") {
  return sequence === "leakage_first"
    ? (["entity_leakage", "class_imbalance"] as const)
    : (["class_imbalance", "entity_leakage"] as const);
}

export function validatePilotSessions(
  rawSessions: PilotSession[],
  rawContext: PilotValidationContext,
) {
  const randomization = RandomizationSchema.parse(rawContext.randomization);
  const qualifiedReleaseReceiptSha256 =
    QualifiedReleaseReceiptSha256Schema.parse(
      rawContext.qualifiedReleaseReceiptSha256,
    );
  const sessions = rawSessions.map((session) =>
    PilotSessionSchema.parse(session),
  );
  const consentReferences = rawContext.consentReferences.map((reference) =>
    PilotConsentReferenceSchema.parse(reference),
  );

  if (
    new Set(sessions.map((session) => session.participantId)).size !==
    sessions.length
  ) {
    throw new Error("participantId values must be unique");
  }
  if (
    new Set(sessions.map((session) => session.assignmentSlotId)).size !==
    sessions.length
  ) {
    throw new Error("assignmentSlotId values must be unique");
  }
  if (
    new Set(sessions.map((session) => session.consentReferenceId)).size !==
    sessions.length
  ) {
    throw new Error("consentReferenceId values must be unique");
  }
  if (
    new Set(sessions.map((session) => session.qualifiedReleaseReceiptSha256))
      .size > 1
  ) {
    throw new Error(
      "all pilot sessions must bind to one qualified release receipt",
    );
  }
  if (
    new Set(consentReferences.map((reference) => reference.consentReferenceId))
      .size !== consentReferences.length
  ) {
    throw new Error("consent reference IDs must be unique");
  }
  if (
    new Set(consentReferences.map((reference) => reference.participantId))
      .size !== consentReferences.length
  ) {
    throw new Error("consent reference participant IDs must be unique");
  }

  const assignments = new Map(
    randomization.assignments.map((assignment) => [
      assignment.slotId,
      assignment,
    ]),
  );
  const consentById = new Map(
    consentReferences.map((reference) => [
      reference.consentReferenceId,
      reference,
    ]),
  );

  for (const session of sessions) {
    if (
      session.qualifiedReleaseReceiptSha256 !== qualifiedReleaseReceiptSha256
    ) {
      throw new Error(
        "session qualified release receipt does not match the frozen analysis release",
      );
    }
    const assignment = assignments.get(session.assignmentSlotId);
    if (assignment === undefined) {
      throw new Error(
        `assignment slot is not in the fixed randomization: ${session.assignmentSlotId}`,
      );
    }
    const expectedOrder = expectedConceptOrder(assignment.sequence);
    for (const [index, task] of session.tasks.entries()) {
      if (task.concept !== expectedOrder[index]) {
        throw new Error(
          `task order does not match assignment ${session.assignmentSlotId}`,
        );
      }
    }

    const consentReference = consentById.get(session.consentReferenceId);
    if (consentReference === undefined) {
      throw new Error(
        `consent reference is missing: ${session.consentReferenceId}`,
      );
    }
    if (consentReference.participantId !== session.participantId) {
      throw new Error(
        `consent reference participant does not match ${session.participantId}`,
      );
    }
    if (
      Date.parse(consentReference.recordedAt) >= Date.parse(session.startedAt)
    ) {
      throw new Error("recorded consent must precede the session start");
    }
  }

  return sessions;
}

export function analyzePilot(
  rawSessions: PilotSession[],
  analyzedAt = new Date().toISOString(),
  validationContext?: PilotValidationContext,
): PilotAnalysis {
  if (rawSessions.length === 0) {
    return PilotAnalysisSchema.parse({
      schemaVersion: "2",
      status: "NO_DATA",
      analyzedAt,
      qualifiedReleaseReceiptSha256: null,
      participantCount: 0,
      completedSessionCount: 0,
      metrics: null,
      limitations: [
        "No consented learner-pilot session records were supplied; no learner outcome is claimed.",
      ],
    });
  }
  if (validationContext === undefined) {
    throw new Error(
      "non-empty pilot analysis requires randomization and consent-reference validation",
    );
  }
  const sessions = validatePilotSessions(rawSessions, validationContext);

  const completed = sessions.filter((session) => session.completed);
  const tasks = sessions.flatMap((session) => session.tasks);
  const conceptCounts = {
    entity_leakage: {
      tasks: 0,
      firstUnassistedTransferPassed: 0,
      predictionDifferedFromResult: 0,
      confusionObserved: 0,
    },
    class_imbalance: {
      tasks: 0,
      firstUnassistedTransferPassed: 0,
      predictionDifferedFromResult: 0,
      confusionObserved: 0,
    },
  };
  const confusionCategoryCounts: Record<
    z.infer<typeof ConfusionCategorySchema>,
    number
  > = {
    navigation: 0,
    prediction_meaning: 0,
    test_rationale: 0,
    boundary_interpretation: 0,
    transfer_choice: 0,
    repair_scope: 0,
    proof_interpretation: 0,
    other_no_detail: 0,
  };
  const reactions = {
    clarity: { clearer: 0, unchanged: 0, less_clear: 0, declined: 0 },
    usefulness: { useful: 0, neutral: 0, not_useful: 0, declined: 0 },
  };
  const abandonmentReasons = {
    participant_withdrew: 0,
    accessibility_barrier: 0,
    technical_failure: 0,
    time_limit: 0,
    facilitator_stopped: 0,
    other_no_detail: 0,
  };
  for (const task of tasks) {
    const counts = conceptCounts[task.concept];
    counts.tasks += 1;
    if (task.firstUnassistedTransferPassed) {
      counts.firstUnassistedTransferPassed += 1;
    }
    if (task.predictionDifferedFromResult) {
      counts.predictionDifferedFromResult += 1;
    }
    if (task.confusionCategories.length > 0) counts.confusionObserved += 1;
    for (const category of task.confusionCategories) {
      confusionCategoryCounts[category] += 1;
    }
    reactions.clarity[task.reaction.clarity] += 1;
    reactions.usefulness[task.reaction.usefulness] += 1;
  }
  for (const session of sessions) {
    if (session.abandonmentReason !== null) {
      abandonmentReasons[session.abandonmentReason] += 1;
    }
  }

  const limitations = [
    "Results are descriptive pilot observations, not causal estimates or proof of mastery.",
    "No untreated control arm is included; concept order is randomized only to reduce order effects.",
    "Small convenience samples must not be generalized beyond the recruited participants.",
    "Transfer pass rate uses only the first unassisted attempt recorded for each task.",
  ];
  if (completed.length < 12) {
    limitations.push(
      "The planned range of at least 12 completed participants was not reached.",
    );
  }

  return PilotAnalysisSchema.parse({
    schemaVersion: "2",
    status: "DESCRIPTIVE_ONLY",
    analyzedAt,
    qualifiedReleaseReceiptSha256: sessions[0]!.qualifiedReleaseReceiptSha256,
    participantCount: sessions.length,
    completedSessionCount: completed.length,
    metrics: {
      completionRate: roundedRate(completed.length, sessions.length),
      taskCount: tasks.length,
      firstUnassistedTransferPassRate: roundedRate(
        tasks.filter((task) => task.firstUnassistedTransferPassed).length,
        tasks.length,
      ),
      predictionDifferenceRate: roundedRate(
        tasks.filter((task) => task.predictionDifferedFromResult).length,
        tasks.length,
      ),
      confusionObservedRate: roundedRate(
        tasks.filter((task) => task.confusionCategories.length > 0).length,
        tasks.length,
      ),
      confusionCategoryCounts,
      abandonmentRate: roundedRate(
        sessions.filter((session) => session.abandonmentReason !== null).length,
        sessions.length,
      ),
      medianTaskDurationSeconds: median(
        tasks.map((task) => task.durationSeconds),
      ),
      reactions,
      abandonmentReasons,
      byConcept: conceptCounts,
    },
    limitations,
  });
}
