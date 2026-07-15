import { describe, expect, it } from "vitest";

import { analyzePilot, createBalancedRandomization } from "./src/pilot.js";

describe("learner pilot support", () => {
  it("creates a deterministic balanced concept-order schedule", () => {
    const first = createBalancedRandomization({ slots: 24, seed: 1729 });
    const second = createBalancedRandomization({ slots: 24, seed: 1729 });

    expect(first).toEqual(second);
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

  it("returns an explicit no-data result instead of invented study outcomes", () => {
    expect(analyzePilot([], "2026-07-15T00:00:00.000Z")).toEqual({
      schemaVersion: "1",
      status: "NO_DATA",
      analyzedAt: "2026-07-15T00:00:00.000Z",
      participantCount: 0,
      completedSessionCount: 0,
      metrics: null,
      limitations: [
        "No consented learner-pilot session records were supplied; no learner outcome is claimed.",
      ],
    });
  });

  it("aggregates deterministic outcomes without retaining raw learner prose", () => {
    const result = analyzePilot(
      [
        {
          schemaVersion: "1",
          participantId: "participant_001",
          assignmentSlotId: "slot_001",
          consentVersion: "1",
          consentedAt: "2026-07-15T01:00:00.000Z",
          startedAt: "2026-07-15T01:01:00.000Z",
          completedAt: "2026-07-15T01:13:00.000Z",
          completed: true,
          tasks: [
            {
              concept: "entity_leakage",
              transferPassed: true,
              predictionChanged: true,
              durationSeconds: 360,
            },
            {
              concept: "class_imbalance",
              transferPassed: false,
              predictionChanged: true,
              durationSeconds: 360,
            },
          ],
        },
        {
          schemaVersion: "1",
          participantId: "participant_002",
          assignmentSlotId: "slot_002",
          consentVersion: "1",
          consentedAt: "2026-07-15T02:00:00.000Z",
          startedAt: "2026-07-15T02:01:00.000Z",
          completedAt: null,
          completed: false,
          tasks: [],
        },
      ],
      "2026-07-15T03:00:00.000Z",
    );

    expect(result.status).toBe("DESCRIPTIVE_ONLY");
    expect(result.participantCount).toBe(2);
    expect(result.completedSessionCount).toBe(1);
    expect(result.metrics).toEqual({
      completionRate: 0.5,
      taskCount: 2,
      transferPassRate: 0.5,
      predictionChangeRate: 1,
      medianTaskDurationSeconds: 360,
      byConcept: {
        entity_leakage: { tasks: 1, transferPassed: 1 },
        class_imbalance: { tasks: 1, transferPassed: 0 },
      },
    });
    expect(JSON.stringify(result)).not.toContain("learner prose");
  });

  it("rejects a session that starts before recorded consent", () => {
    expect(() =>
      analyzePilot(
        [
          {
            schemaVersion: "1",
            participantId: "participant_invalid",
            assignmentSlotId: "slot_003",
            consentVersion: "1",
            consentedAt: "2026-07-15T02:00:00.000Z",
            startedAt: "2026-07-15T01:59:00.000Z",
            completedAt: null,
            completed: false,
            tasks: [],
          },
        ],
        "2026-07-15T03:00:00.000Z",
      ),
    ).toThrow(/consent must precede/i);
  });
});
