// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );
  for (const file of [
    "0001_evidence_store.sql",
    "0006_learner_interactions.sql",
  ]) {
    database.exec(readFileSync(resolve(migrationDirectory, file), "utf8"));
  }
  database
    .prepare(
      `INSERT INTO artifacts
        (id, file_name, file_sha256, manifest_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "artifact_1",
      "lesson.ipynb",
      "a".repeat(64),
      "{}",
      "2026-07-18T08:00:00.000Z",
    );
  database
    .prepare(
      `INSERT INTO sessions
        (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "session_1",
      "artifact_1",
      "BELIEF_TEST_CONFIRMED",
      3,
      "{}",
      "2026-07-18T08:00:00.000Z",
      "2026-07-18T08:00:00.000Z",
    );
  return database;
}

describe("learner interaction migration", () => {
  it("enforces append-only rows and closed categorical columns", () => {
    const database = migratedDatabase();
    const eventId = "interaction_00000000000000000000000000000001";
    database
      .prepare(
        `INSERT INTO learner_interactions
          (event_id, session_id, event_kind, stage, mode, concept, event_json, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        eventId,
        "session_1",
        "prediction.recorded",
        "prediction",
        "sample_lesson",
        "entity_leakage",
        JSON.stringify({ eventId, choice: "alternative_explanation" }),
        "2026-07-18T08:01:00.000Z",
      );

    expect(() =>
      database
        .prepare("UPDATE learner_interactions SET stage = ? WHERE event_id = ?")
        .run("repair", eventId),
    ).toThrow(/append-only/u);
    expect(() =>
      database
        .prepare("DELETE FROM learner_interactions WHERE event_id = ?")
        .run(eventId),
    ).toThrow(/append-only/u);
    expect(() =>
      database
        .prepare(
          `INSERT INTO learner_interactions
            (event_id, session_id, event_kind, stage, mode, concept, event_json, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "interaction_00000000000000000000000000000002",
          "session_1",
          "learner.free_text",
          "apply",
          "sample_lesson",
          "entity_leakage",
          "{}",
          "2026-07-18T08:02:00.000Z",
        ),
    ).toThrow(/CHECK constraint failed/u);
    expect(() =>
      database
        .prepare(
          `INSERT INTO learner_interactions
            (event_id, session_id, event_kind, stage, mode, concept, event_json, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "interaction_00000000000000000000000000000003",
          "session_1",
          "stage.entered",
          "question",
          "sample_lesson",
          "raw learner concept",
          "{}",
          "2026-07-18T08:03:00.000Z",
        ),
    ).toThrow(/CHECK constraint failed/u);
  });
});
