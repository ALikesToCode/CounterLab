import type { LearnerInteractionRecord } from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import {
  D1LearnerInteractionRepository,
  LearnerInteractionConflictError,
} from "./learner-interaction-repository";

class InteractionDatabase {
  readonly rows = new Map<string, string>();

  prepare(query: string): D1PreparedStatement {
    return new InteractionStatement(
      this,
      query,
    ) as unknown as D1PreparedStatement;
  }
}

class InteractionStatement {
  private values: unknown[] = [];

  constructor(
    private readonly database: InteractionDatabase,
    private readonly query: string,
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    this.values = values;
    return this as unknown as D1PreparedStatement;
  }

  run(): Promise<D1Result> {
    if (!this.query.includes("INSERT INTO learner_interactions")) {
      throw new Error("unexpected learner interaction write query");
    }
    const [eventId, , , , , , eventJson] = this.values as string[];
    if (eventId === undefined || eventJson === undefined) {
      throw new Error("missing learner interaction binding");
    }
    const changed = this.database.rows.has(eventId) ? 0 : 1;
    if (changed === 1) this.database.rows.set(eventId, eventJson);
    return Promise.resolve({
      success: true,
      meta: { changes: changed },
      results: [],
    } as unknown as D1Result);
  }

  first<T>(): Promise<T | null> {
    if (!this.query.includes("SELECT event_json")) {
      throw new Error("unexpected learner interaction read query");
    }
    const eventId = this.values[0];
    const eventJson =
      typeof eventId === "string" ? this.database.rows.get(eventId) : undefined;
    return Promise.resolve(
      (eventJson === undefined ? null : { event_json: eventJson }) as T | null,
    );
  }
}

function record(timestamp: string, confidence = 72): LearnerInteractionRecord {
  const eventId = "interaction_00000000000000000000000000000001";
  return {
    schemaVersion: "1",
    eventId,
    sessionId: "session_1",
    actor: "learner",
    mode: "sample_lesson",
    concept: "entity_leakage",
    timestamp,
    interaction: {
      schemaVersion: "1",
      eventId,
      kind: "prediction.recorded",
      stage: "prediction",
      choice: "alternative_explanation",
      confidence,
    },
  };
}

describe("D1LearnerInteractionRepository", () => {
  it("keeps the first server timestamp while accepting an exact retry", async () => {
    const database = new InteractionDatabase();
    const repository = new D1LearnerInteractionRepository(
      database as unknown as D1Database,
    );

    await expect(
      repository.append(record("2026-07-18T08:00:00.000Z")),
    ).resolves.toEqual({ duplicate: false });
    await expect(
      repository.append(record("2026-07-18T08:01:00.000Z")),
    ).resolves.toEqual({ duplicate: true });

    const stored = JSON.parse(
      database.rows.get("interaction_00000000000000000000000000000001") ??
        "null",
    ) as LearnerInteractionRecord | null;
    expect(stored?.timestamp).toBe("2026-07-18T08:00:00.000Z");
  });

  it("rejects an opaque ID reused for different categorical data", async () => {
    const database = new InteractionDatabase();
    const repository = new D1LearnerInteractionRepository(
      database as unknown as D1Database,
    );
    await repository.append(record("2026-07-18T08:00:00.000Z"));

    await expect(
      repository.append(record("2026-07-18T08:01:00.000Z", 73)),
    ).rejects.toBeInstanceOf(LearnerInteractionConflictError);
  });
});
