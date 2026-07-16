// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  CANONICAL_JSON_PROFILE,
  ProofCapsuleReplayReceiptV2Schema,
} from "@counterlab/contracts";

import {
  D1ProofCapsuleReplayRepository,
  ReplayPublicationConflictError,
  type ProofCapsuleReplayRecordV2,
} from "./replay-repository";

class SqliteD1Statement {
  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
    private readonly values: unknown[] = [],
  ) {}

  bind(...values: unknown[]): SqliteD1Statement {
    return new SqliteD1Statement(this.database, this.sql, values);
  }

  async run() {
    const result = this.database
      .prepare(this.sql)
      .run(...(this.values as SQLInputValue[]));
    return { success: true, meta: { changes: Number(result.changes) } };
  }

  async first<T>(): Promise<T | null> {
    return (
      (this.database
        .prepare(this.sql)
        .get(...(this.values as SQLInputValue[])) as T) ?? null
    );
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(":memory:");

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  migrate(): void {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    const migrationDirectory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../migrations",
    );
    for (const file of [
      "0001_evidence_store.sql",
      "0005_proof_capsule_replays.sql",
    ]) {
      this.sqlite.exec(readFileSync(resolve(migrationDirectory, file), "utf8"));
    }
    for (const suffix of ["1", "2"]) {
      this.sqlite
        .prepare(
          `INSERT INTO artifacts
            (id, file_name, file_sha256, manifest_json, created_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          `artifact_live_${suffix}`,
          `uploaded-${suffix}.ipynb`,
          suffix.repeat(64),
          "{}",
          "2026-07-16T00:00:00.000Z",
        );
      this.sqlite
        .prepare(
          `INSERT INTO sessions
            (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          `session_live_${suffix}`,
          `artifact_live_${suffix}`,
          "PROOF_CAPSULE_ISSUED",
          12,
          "{}",
          "2026-07-16T00:00:00.000Z",
          "2026-07-16T00:00:00.000Z",
        );
    }
  }
}

function replayRecord(
  replayId = "replay_1",
  sourceSessionId = "session_live_1",
  bytesHash = "b".repeat(64),
): ProofCapsuleReplayRecordV2 {
  const capsuleId = "capsule_1";
  const recordedAt = "2026-07-16T00:00:00.000Z";
  const rootHash = "a".repeat(64);
  const eventChainHead = "c".repeat(64);
  const proofCapsule = {
    schemaVersion: "2" as const,
    capsuleId,
    sessionId: sourceSessionId,
    mode: "live_notebook" as const,
    replayId: null,
    mediaType: "application/vnd.counterlab.capsule+json" as const,
    canonicalProfile: CANONICAL_JSON_PROFILE,
    rootHash,
    bytesHash,
    byteLength: 4096,
    reasoningDiffHash: "d".repeat(64),
    eventChainHead,
    createdAt: recordedAt,
    integrity: {
      mode: "integrity-hashed" as const,
      algorithm: "sha256" as const,
    },
  };
  const metadata = ProofCapsuleReplayReceiptV2Schema.parse({
    schemaVersion: "2",
    replayId,
    replay: true,
    label: "Verified replay",
    playbackMode: "verified_capsule_replay",
    sourceMode: "live_notebook",
    sourceSessionId,
    capsuleId,
    concept: "entity_leakage",
    recordedAt,
    rootHash,
    bytesHash,
    eventChainHead,
    proofCapsule,
  });
  return {
    schemaVersion: "2",
    replayId,
    sourceSessionId,
    capsuleId,
    objectKey: `proof-capsules/${sourceSessionId}/${bytesHash}.counterlab`,
    recordedAt,
    metadata,
  };
}

describe("D1ProofCapsuleReplayRepository", () => {
  it("persists one immutable replay and reuses an identical publication", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1ProofCapsuleReplayRepository(
      database as unknown as D1Database,
    );
    const first = replayRecord();

    await expect(repository.createOrReuse(first)).resolves.toEqual({
      record: first,
      reused: false,
    });
    await expect(
      repository.createOrReuse({
        ...first,
        replayId: "replay_duplicate_request",
        metadata: {
          ...first.metadata,
          replayId: "replay_duplicate_request",
        },
      }),
    ).resolves.toEqual({ record: first, reused: true });
    await expect(repository.find(first.replayId)).resolves.toEqual(first);
    expect(() =>
      database.sqlite
        .prepare("UPDATE replays SET recorded_at = ? WHERE replay_id = ?")
        .run("2026-07-17T00:00:00.000Z", first.replayId),
    ).toThrow(/replays are immutable/u);
    expect(() =>
      database.sqlite
        .prepare("DELETE FROM replays WHERE replay_id = ?")
        .run(first.replayId),
    ).toThrow(/replays are immutable/u);
  });

  it("rejects conflicting Capsule authority for the same source session", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1ProofCapsuleReplayRepository(
      database as unknown as D1Database,
    );
    await repository.createOrReuse(replayRecord());

    await expect(
      repository.createOrReuse(
        replayRecord("replay_2", "session_live_1", "e".repeat(64)),
      ),
    ).rejects.toBeInstanceOf(ReplayPublicationConflictError);
    const reusedObjectKey = replayRecord("replay_3", "session_live_2");
    reusedObjectKey.objectKey = replayRecord().objectKey;
    await expect(
      repository.createOrReuse(reusedObjectKey),
    ).rejects.toBeInstanceOf(ReplayPublicationConflictError);
  });
});
