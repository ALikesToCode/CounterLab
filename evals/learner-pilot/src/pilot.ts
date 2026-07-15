import { z } from "zod";

const ConceptSchema = z.enum(["entity_leakage", "class_imbalance"]);

export const PilotTaskSchema = z
  .object({
    concept: ConceptSchema,
    transferPassed: z.boolean(),
    predictionChanged: z.boolean(),
    durationSeconds: z.number().int().nonnegative().max(7_200),
  })
  .strict();

export const PilotSessionSchema = z
  .object({
    schemaVersion: z.literal("1"),
    participantId: z.string().regex(/^participant_[A-Za-z0-9_-]+$/),
    assignmentSlotId: z.string().regex(/^slot_\d{3}$/),
    consentVersion: z.literal("1"),
    consentedAt: z.string().datetime(),
    startedAt: z.string().datetime(),
    completedAt: z.string().datetime().nullable(),
    completed: z.boolean(),
    tasks: z.array(PilotTaskSchema).max(2),
  })
  .strict()
  .superRefine((value, context) => {
    if (Date.parse(value.consentedAt) > Date.parse(value.startedAt)) {
      context.addIssue({
        code: "custom",
        message: "recorded consent must precede the session start",
      });
    }
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
  .strict();

const ConceptMetricsSchema = z
  .object({
    tasks: z.number().int().nonnegative(),
    transferPassed: z.number().int().nonnegative(),
  })
  .strict();

export const PilotAnalysisSchema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.enum(["NO_DATA", "DESCRIPTIVE_ONLY"]),
    analyzedAt: z.string().datetime(),
    participantCount: z.number().int().nonnegative(),
    completedSessionCount: z.number().int().nonnegative(),
    metrics: z
      .object({
        completionRate: z.number().min(0).max(1),
        taskCount: z.number().int().nonnegative(),
        transferPassRate: z.number().min(0).max(1),
        predictionChangeRate: z.number().min(0).max(1),
        medianTaskDurationSeconds: z.number().nonnegative().nullable(),
        byConcept: z
          .object({
            entity_leakage: ConceptMetricsSchema,
            class_imbalance: ConceptMetricsSchema,
          })
          .strict(),
      })
      .strict()
      .nullable(),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export type PilotSession = z.input<typeof PilotSessionSchema>;
export type PilotAnalysis = z.infer<typeof PilotAnalysisSchema>;

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

export function analyzePilot(
  rawSessions: PilotSession[],
  analyzedAt = new Date().toISOString(),
): PilotAnalysis {
  const sessions = rawSessions.map((session) =>
    PilotSessionSchema.parse(session),
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
  if (sessions.length === 0) {
    return PilotAnalysisSchema.parse({
      schemaVersion: "1",
      status: "NO_DATA",
      analyzedAt,
      participantCount: 0,
      completedSessionCount: 0,
      metrics: null,
      limitations: [
        "No consented learner-pilot session records were supplied; no learner outcome is claimed.",
      ],
    });
  }

  const completed = sessions.filter((session) => session.completed);
  const tasks = sessions.flatMap((session) => session.tasks);
  const conceptCounts = {
    entity_leakage: { tasks: 0, transferPassed: 0 },
    class_imbalance: { tasks: 0, transferPassed: 0 },
  };
  for (const task of tasks) {
    const counts = conceptCounts[task.concept];
    counts.tasks += 1;
    if (task.transferPassed) counts.transferPassed += 1;
  }

  return PilotAnalysisSchema.parse({
    schemaVersion: "1",
    status: "DESCRIPTIVE_ONLY",
    analyzedAt,
    participantCount: sessions.length,
    completedSessionCount: completed.length,
    metrics: {
      completionRate: roundedRate(completed.length, sessions.length),
      taskCount: tasks.length,
      transferPassRate: roundedRate(
        tasks.filter((task) => task.transferPassed).length,
        tasks.length,
      ),
      predictionChangeRate: roundedRate(
        tasks.filter((task) => task.predictionChanged).length,
        tasks.length,
      ),
      medianTaskDurationSeconds: median(
        tasks.map((task) => task.durationSeconds),
      ),
      byConcept: conceptCounts,
    },
    limitations: [
      "Results are descriptive pilot observations, not causal estimates or proof of mastery.",
      "No untreated control arm is included; concept order is randomized only to reduce order effects.",
      "Small convenience samples must not be generalized beyond the recruited participants.",
    ],
  });
}
