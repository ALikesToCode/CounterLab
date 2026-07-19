import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  PilotAnalysisSchema,
  PilotConsentReferenceSchema,
  PilotSessionSchema,
  RandomizationSchema,
  analyzePilot,
  createBalancedRandomization,
  validatePilotSessions,
  type PilotConsentReference,
  type PilotSession,
  type PilotValidationContext,
} from "./src/pilot.js";

type PilotTask = PilotSession["tasks"][number];

const QUALIFIED_RELEASE_RECEIPT_SHA256 = "a".repeat(64);
const OTHER_QUALIFIED_RELEASE_RECEIPT_SHA256 = "b".repeat(64);

const randomization: PilotValidationContext["randomization"] = {
  schemaVersion: "1",
  method: "permuted_balanced_concept_order",
  seed: 1729,
  slots: 2,
  assignments: [
    { slotId: "slot_001", sequence: "leakage_first" },
    { slotId: "slot_002", sequence: "imbalance_first" },
  ],
  limitations: ["Concept order only; no untreated control arm."],
};

const consentReferences: PilotConsentReference[] = [
  {
    schemaVersion: "1",
    consentReferenceId: "consent_ref_0000000000000001",
    participantId: "participant_0000000000000001",
    consentVersion: "1",
    recordedAt: "2026-07-15T01:00:00.000Z",
  },
  {
    schemaVersion: "1",
    consentReferenceId: "consent_ref_0000000000000002",
    participantId: "participant_0000000000000002",
    consentVersion: "1",
    recordedAt: "2026-07-15T02:00:00.000Z",
  },
];

const validationContext: PilotValidationContext = {
  randomization,
  consentReferences,
  qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
};

function task(
  concept: PilotTask["concept"],
  overrides: Partial<PilotTask> = {},
): PilotTask {
  return {
    concept,
    firstUnassistedTransferPassed: true,
    predictionDifferedFromResult: true,
    durationSeconds: 300,
    confusionCategories: [],
    reaction: { clarity: "clearer", usefulness: "useful" },
    ...overrides,
  };
}

function completedSession(overrides: Partial<PilotSession> = {}): PilotSession {
  return {
    schemaVersion: "2",
    participantId: "participant_0000000000000001",
    assignmentSlotId: "slot_001",
    consentReferenceId: "consent_ref_0000000000000001",
    qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
    startedAt: "2026-07-15T01:01:00.000Z",
    completedAt: "2026-07-15T01:13:00.000Z",
    completed: true,
    abandonmentReason: null,
    tasks: [task("entity_leakage"), task("class_imbalance")],
    ...overrides,
  };
}

describe("learner pilot support", () => {
  it("ships parseable v2 JSON Schemas with only bounded study fields", () => {
    const sessionSchema = JSON.parse(
      readFileSync(
        new URL("./schemas/session-result-v2.schema.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const consentSchema = JSON.parse(
      readFileSync(
        new URL("./schemas/consent-reference-v1.schema.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const analysisSchema = JSON.parse(
      readFileSync(
        new URL("./schemas/analysis-result-v2.schema.json", import.meta.url),
        "utf8",
      ),
    ) as Record<string, unknown>;

    expect(sessionSchema.$id).toContain("session-result-v2");
    expect(consentSchema.$id).toContain("consent-reference-v1");
    expect(analysisSchema.$id).toContain("analysis-result-v2");
    expect(JSON.stringify(sessionSchema)).not.toMatch(
      /learnerQuote|rawReaction|emailAddress|notebookContent|consentAffirmations|predictionChanged/u,
    );
    expect(JSON.stringify(sessionSchema)).toContain(
      "predictionDifferedFromResult",
    );
    expect(JSON.stringify(sessionSchema)).toContain(
      "qualifiedReleaseReceiptSha256",
    );
    expect(
      Object.keys((consentSchema.properties ?? {}) as Record<string, unknown>),
    ).toEqual([
      "schemaVersion",
      "consentReferenceId",
      "participantId",
      "consentVersion",
      "recordedAt",
    ]);
  });

  it("creates a deterministic balanced concept-order schedule", () => {
    const first = createBalancedRandomization({ slots: 24, seed: 1729 });
    const second = createBalancedRandomization({ slots: 24, seed: 1729 });
    const shipped = RandomizationSchema.parse(
      JSON.parse(
        readFileSync(new URL("./randomization.json", import.meta.url), "utf8"),
      ) as unknown,
    );

    expect(first).toEqual(second);
    expect(shipped).toEqual(first);
    expect(first.assignments).toHaveLength(24);
    expect(
      first.assignments.filter(
        (assignment) => assignment.sequence === "leakage_first",
      ),
    ).toHaveLength(12);
    expect(
      first.assignments.filter(
        (assignment) => assignment.sequence === "imbalance_first",
      ),
    ).toHaveLength(12);
    expect(
      new Set(first.assignments.map((assignment) => assignment.slotId)).size,
    ).toBe(24);
  });

  it("rejects malformed or unbalanced randomization registries", () => {
    expect(() =>
      RandomizationSchema.parse({
        ...randomization,
        assignments: [
          { slotId: "slot_001", sequence: "leakage_first" },
          { slotId: "slot_001", sequence: "leakage_first" },
        ],
      }),
    ).toThrow(/unique|balanced/u);
  });

  it("returns explicit NO_DATA without requiring consent references", () => {
    expect(analyzePilot([], "2026-07-15T00:00:00.000Z")).toEqual({
      schemaVersion: "2",
      status: "NO_DATA",
      analyzedAt: "2026-07-15T00:00:00.000Z",
      qualifiedReleaseReceiptSha256: null,
      participantCount: 0,
      completedSessionCount: 0,
      metrics: null,
      limitations: [
        "No consented learner-pilot session records were supplied; no learner outcome is claimed.",
      ],
    });
  });

  it("rejects internally inconsistent aggregate status and counts", () => {
    const noData = analyzePilot([], "2026-07-15T00:00:00.000Z");

    expect(() =>
      PilotAnalysisSchema.parse({ ...noData, participantCount: 1 }),
    ).toThrow(/NO_DATA analysis/u);
    expect(() =>
      PilotAnalysisSchema.parse({
        ...noData,
        status: "DESCRIPTIVE_ONLY",
        participantCount: 1,
      }),
    ).toThrow(/aggregate metrics/u);
    expect(() =>
      PilotAnalysisSchema.parse({
        ...noData,
        participantCount: 1,
        completedSessionCount: 2,
      }),
    ).toThrow(/completed session count/u);
  });

  it("fails closed when non-empty analysis lacks validation context", () => {
    expect(() =>
      analyzePilot([completedSession()], "2026-07-15T03:00:00.000Z"),
    ).toThrow(/requires randomization and consent-reference validation/u);
  });

  it("aggregates first attempts, confusion, abandonment, and closed reactions", () => {
    const result = analyzePilot(
      [
        completedSession({
          tasks: [
            task("entity_leakage", {
              confusionCategories: ["prediction_meaning"],
            }),
            task("class_imbalance", {
              firstUnassistedTransferPassed: false,
              predictionDifferedFromResult: false,
              durationSeconds: 500,
              reaction: { clarity: "unchanged", usefulness: "neutral" },
            }),
          ],
        }),
        {
          schemaVersion: "2",
          participantId: "participant_0000000000000002",
          assignmentSlotId: "slot_002",
          consentReferenceId: "consent_ref_0000000000000002",
          qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
          startedAt: "2026-07-15T02:01:00.000Z",
          completedAt: null,
          completed: false,
          abandonmentReason: "technical_failure",
          tasks: [
            task("class_imbalance", {
              durationSeconds: 200,
              confusionCategories: ["navigation"],
              reaction: {
                clarity: "less_clear",
                usefulness: "not_useful",
              },
            }),
          ],
        },
      ],
      "2026-07-15T03:00:00.000Z",
      validationContext,
    );

    expect(result.status).toBe("DESCRIPTIVE_ONLY");
    expect(result.qualifiedReleaseReceiptSha256).toBe(
      QUALIFIED_RELEASE_RECEIPT_SHA256,
    );
    expect(result.participantCount).toBe(2);
    expect(result.completedSessionCount).toBe(1);
    expect(Object.keys(result)).toEqual([
      "schemaVersion",
      "status",
      "analyzedAt",
      "qualifiedReleaseReceiptSha256",
      "participantCount",
      "completedSessionCount",
      "metrics",
      "limitations",
    ]);
    expect(result.metrics).toEqual({
      completionRate: 0.5,
      taskCount: 3,
      firstUnassistedTransferPassRate: 0.666667,
      predictionDifferenceRate: 0.666667,
      confusionObservedRate: 0.666667,
      confusionCategoryCounts: {
        navigation: 1,
        prediction_meaning: 1,
        test_rationale: 0,
        boundary_interpretation: 0,
        transfer_choice: 0,
        repair_scope: 0,
        proof_interpretation: 0,
        other_no_detail: 0,
      },
      abandonmentRate: 0.5,
      medianTaskDurationSeconds: 300,
      reactions: {
        clarity: { clearer: 1, unchanged: 1, less_clear: 1, declined: 0 },
        usefulness: { useful: 1, neutral: 1, not_useful: 1, declined: 0 },
      },
      abandonmentReasons: {
        participant_withdrew: 0,
        accessibility_barrier: 0,
        technical_failure: 1,
        time_limit: 0,
        facilitator_stopped: 0,
        other_no_detail: 0,
      },
      byConcept: {
        entity_leakage: {
          tasks: 1,
          firstUnassistedTransferPassed: 1,
          predictionDifferedFromResult: 1,
          confusionObserved: 1,
        },
        class_imbalance: {
          tasks: 2,
          firstUnassistedTransferPassed: 1,
          predictionDifferedFromResult: 1,
          confusionObserved: 1,
        },
      },
    });
    expect(result.limitations).toContain(
      "The planned range of at least 12 completed participants was not reached.",
    );
    const serializedResult = JSON.stringify(result);
    expect(serializedResult).not.toMatch(
      /"(?:participantId|consentReferenceId|assignmentSlotId|startedAt|completedAt)"\s*:/u,
    );
    expect(serializedResult).not.toMatch(/"tasks"\s*:\s*\[/u);
    expect(serializedResult).not.toContain("participant_0000000000000001");
    expect(serializedResult).not.toContain("consent_ref_0000000000000001");

    expect(() =>
      PilotAnalysisSchema.parse({
        ...result,
        metrics: {
          ...result.metrics!,
          confusionCategoryCounts: {
            ...result.metrics!.confusionCategoryCounts,
            navigation: 4,
          },
        },
      }),
    ).toThrow(/confusion category counts must reconcile/u);
    expect(() =>
      PilotAnalysisSchema.parse({
        ...result,
        metrics: {
          ...result.metrics!,
          confusionObservedRate: 0,
        },
      }),
    ).toThrow(/aggregate rates must reconcile/u);
  });

  it("binds every session and aggregate to one exact qualified release receipt", () => {
    expect(() =>
      PilotSessionSchema.parse({
        ...completedSession(),
        qualifiedReleaseReceiptSha256: "not-a-sha256",
      }),
    ).toThrow();
    expect(() =>
      validatePilotSessions(
        [
          completedSession({
            qualifiedReleaseReceiptSha256:
              OTHER_QUALIFIED_RELEASE_RECEIPT_SHA256,
          }),
        ],
        validationContext,
      ),
    ).toThrow(/does not match the frozen analysis release/u);
    expect(() =>
      validatePilotSessions(
        [
          completedSession(),
          {
            schemaVersion: "2",
            participantId: "participant_0000000000000002",
            assignmentSlotId: "slot_002",
            consentReferenceId: "consent_ref_0000000000000002",
            qualifiedReleaseReceiptSha256:
              OTHER_QUALIFIED_RELEASE_RECEIPT_SHA256,
            startedAt: "2026-07-15T02:01:00.000Z",
            completedAt: null,
            completed: false,
            abandonmentReason: "technical_failure",
            tasks: [task("class_imbalance")],
          },
        ],
        validationContext,
      ),
    ).toThrow(/one qualified release receipt/u);
  });

  it("requires every slot to be in the fixed randomization", () => {
    expect(() =>
      validatePilotSessions(
        [completedSession({ assignmentSlotId: "slot_003" })],
        validationContext,
      ),
    ).toThrow(/not in the fixed randomization/u);
  });

  it("requires task order to match the assigned sequence", () => {
    expect(() =>
      validatePilotSessions(
        [
          completedSession({
            tasks: [task("class_imbalance"), task("entity_leakage")],
          }),
        ],
        validationContext,
      ),
    ).toThrow(/task order does not match assignment/u);
  });

  it("requires a matching opaque consent reference recorded before start", () => {
    expect(() =>
      validatePilotSessions(
        [
          completedSession({
            consentReferenceId: "consent_ref_9999999999999999",
          }),
        ],
        validationContext,
      ),
    ).toThrow(/consent reference is missing/u);

    expect(() =>
      validatePilotSessions([completedSession()], {
        randomization,
        consentReferences: [
          {
            ...consentReferences[0]!,
            participantId: "participant_0000000000000099",
          },
        ],
        qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
      }),
    ).toThrow(/participant does not match/u);

    expect(() =>
      validatePilotSessions([completedSession()], {
        randomization,
        consentReferences: [
          {
            ...consentReferences[0]!,
            recordedAt: "2026-07-15T01:02:00.000Z",
          },
        ],
        qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
      }),
    ).toThrow(/consent must precede/u);

    expect(() =>
      validatePilotSessions([completedSession()], {
        randomization,
        consentReferences: [
          {
            ...consentReferences[0]!,
            recordedAt: "2026-07-15T01:01:00.000Z",
          },
        ],
        qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
      }),
    ).toThrow(/consent must precede/u);
  });

  it("rejects duplicate participant, slot, and consent linkage records", () => {
    expect(() =>
      validatePilotSessions(
        [completedSession(), completedSession()],
        validationContext,
      ),
    ).toThrow(/participantId values must be unique/u);
    expect(() =>
      validatePilotSessions([completedSession()], {
        randomization,
        consentReferences: [consentReferences[0]!, consentReferences[0]!],
        qualifiedReleaseReceiptSha256: QUALIFIED_RELEASE_RECEIPT_SHA256,
      }),
    ).toThrow(/consent reference IDs must be unique/u);
  });

  it("keeps the exported session and consent-reference shapes free of PII and prose", () => {
    expect(() =>
      PilotSessionSchema.parse({
        ...completedSession(),
        participantName: "Not allowed",
      }),
    ).toThrow();
    expect(() =>
      PilotSessionSchema.parse({
        ...completedSession(),
        tasks: [
          {
            ...task("entity_leakage"),
            rawReaction: "A verbatim learner quote",
          },
          task("class_imbalance"),
        ],
      }),
    ).toThrow();
    expect(() =>
      PilotConsentReferenceSchema.parse({
        ...consentReferences[0],
        affirmations: { adult: true },
        email: "not-allowed@example.com",
      }),
    ).toThrow();
    const result = analyzePilot(
      [completedSession()],
      "2026-07-15T03:00:00.000Z",
      validationContext,
    );
    expect(() =>
      PilotAnalysisSchema.parse({
        ...result,
        limitations: ["A learner-authored free-text observation"],
      }),
    ).toThrow();
  });

  it("enforces bounded abandonment and confusion data", () => {
    expect(() =>
      PilotSessionSchema.parse({
        ...completedSession(),
        completed: false,
        completedAt: null,
        abandonmentReason: null,
        tasks: [],
      }),
    ).toThrow(/abandonment reason/u);
    expect(() =>
      PilotSessionSchema.parse({
        ...completedSession(),
        abandonmentReason: "technical_failure",
      }),
    ).toThrow(/cannot have an abandonment reason/u);
    expect(() =>
      PilotSessionSchema.parse({
        ...completedSession(),
        tasks: [
          task("entity_leakage", {
            confusionCategories: ["navigation", "navigation"],
          }),
          task("class_imbalance"),
        ],
      }),
    ).toThrow(/confusion categories must be unique/u);
  });
});
