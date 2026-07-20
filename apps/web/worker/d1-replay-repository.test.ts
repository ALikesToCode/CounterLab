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
  ReplayPublicationExpiredError,
  ReplayPublicationRevokedError,
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

  async batch(statements: SqliteD1Statement[]) {
    this.sqlite.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec("COMMIT");
      return results;
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  migrateBase(): void {
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

  migrateReplayRevocations(): void {
    const migrationDirectory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../migrations",
    );
    this.sqlite.exec("BEGIN");
    try {
      this.sqlite.exec(
        readFileSync(
          resolve(migrationDirectory, "0008_replay_revocations.sql"),
          "utf8",
        ),
      );
      this.sqlite.exec("COMMIT");
    } catch (error) {
      this.sqlite.exec("ROLLBACK");
      throw error;
    }
  }

  migrateReplayExpiry(): void {
    const migrationDirectory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../migrations",
    );
    this.sqlite.exec(
      readFileSync(
        resolve(migrationDirectory, "0009_public_replay_expiry.sql"),
        "utf8",
      ),
    );
  }

  migrate(): void {
    this.migrateBase();
    this.migrateReplayRevocations();
    this.migrateReplayExpiry();
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
    projectionObjectKey: `public-replays/${replayId}/${"e".repeat(64)}.json`,
    projectionHash: "e".repeat(64),
    projectionBytesHash: "f".repeat(64),
    recordedAt,
    publishedAt: recordedAt,
    expiresAt: "2026-08-15T00:00:00.000Z",
    metadata,
  };
}

describe("D1ProofCapsuleReplayRepository", () => {
  it("fails the projection migration closed when a legacy replay exists", () => {
    const database = new SqliteD1Database();
    database.migrateBase();
    const legacy = replayRecord();
    database.sqlite
      .prepare(
        `INSERT INTO replays
          (replay_id, source_session_id, metadata_json, event_chain_head, object_key, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        legacy.replayId,
        legacy.sourceSessionId,
        JSON.stringify(legacy.metadata),
        legacy.metadata.eventChainHead,
        legacy.objectKey,
        legacy.recordedAt,
      );

    expect(() => database.migrateReplayRevocations()).toThrow(
      /CHECK constraint failed/u,
    );
    expect(
      database.sqlite
        .prepare("SELECT replay_id FROM replays WHERE replay_id = ?")
        .get(legacy.replayId),
    ).toEqual({ replay_id: legacy.replayId });
    expect(
      database.sqlite
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'public_replay_projections'",
        )
        .get(),
    ).toBeUndefined();
  });

  it("gives existing projections a 30-day migration grace window", async () => {
    const database = new SqliteD1Database();
    database.migrateBase();
    database.migrateReplayRevocations();
    const privateReplay = replayRecord(
      "replay_private_before_expiry",
      "session_live_2",
    );
    database.sqlite
      .prepare(
        `INSERT INTO replays
          (replay_id, source_session_id, metadata_json, event_chain_head, object_key, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        privateReplay.replayId,
        privateReplay.sourceSessionId,
        JSON.stringify(privateReplay.metadata),
        privateReplay.metadata.eventChainHead,
        privateReplay.objectKey,
        privateReplay.recordedAt,
      );
    const existing = replayRecord(
      "replay_existing_before_expiry",
      "session_live_1",
    );
    database.sqlite
      .prepare(
        `INSERT INTO replays
          (replay_id, source_session_id, metadata_json, event_chain_head, object_key, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        existing.replayId,
        existing.sourceSessionId,
        JSON.stringify(existing.metadata),
        existing.metadata.eventChainHead,
        existing.objectKey,
        existing.recordedAt,
      );
    database.sqlite
      .prepare(
        `INSERT INTO public_replay_projections
          (replay_id, projection_hash, bytes_hash, object_key, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        existing.replayId,
        existing.projectionHash,
        existing.projectionBytesHash,
        existing.projectionObjectKey,
        existing.recordedAt,
      );
    database.sqlite
      .prepare(
        `INSERT INTO replay_revocations (event_id, replay_id, revoked_at, reason)
         VALUES (?, ?, ?, 'owner_requested')`,
      )
      .run(
        "replay_revocation_before_expiry",
        existing.replayId,
        "2026-07-17T00:00:00.000Z",
      );

    database.migrateReplayExpiry();
    const lifecycle = database.sqlite
      .prepare(
        `SELECT published_at, expires_at, policy_version
         FROM public_replay_lifecycles WHERE replay_id = ?`,
      )
      .get(existing.replayId) as {
      published_at: string;
      expires_at: string;
      policy_version: string;
    };
    expect(lifecycle.policy_version).toBe("public-replay-expiry-v1");
    expect(
      Date.parse(lifecycle.expires_at) - Date.parse(lifecycle.published_at),
    ).toBe(30 * 24 * 60 * 60 * 1_000);
    expect(
      database.sqlite
        .prepare(
          "SELECT replay_id FROM public_replay_lifecycles WHERE replay_id = ?",
        )
        .get(privateReplay.replayId),
    ).toBeUndefined();

    const repository = new D1ProofCapsuleReplayRepository(
      database as unknown as D1Database,
    );
    await expect(
      repository.statusBySourceSession(
        existing.sourceSessionId,
        lifecycle.published_at,
      ),
    ).resolves.toMatchObject({ status: "revoked" });
  });

  it("persists one immutable replay and reuses an identical publication", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1ProofCapsuleReplayRepository(
      database as unknown as D1Database,
    );
    const first = replayRecord();

    await expect(
      repository.createOrReuse(first, first.publishedAt),
    ).resolves.toEqual({
      record: first,
      reused: false,
    });
    await expect(
      repository.createOrReuse(
        {
          ...first,
          replayId: "replay_duplicate_request",
          metadata: {
            ...first.metadata,
            replayId: "replay_duplicate_request",
          },
        },
        first.publishedAt,
      ),
    ).resolves.toEqual({ record: first, reused: true });
    await expect(
      repository.find(first.replayId, first.publishedAt),
    ).resolves.toEqual(first);
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
    await repository.createOrReuse(replayRecord(), "2026-07-16T00:00:00.000Z");

    await expect(
      repository.createOrReuse(
        replayRecord("replay_2", "session_live_1", "e".repeat(64)),
        "2026-07-16T00:00:00.000Z",
      ),
    ).rejects.toBeInstanceOf(ReplayPublicationConflictError);
    const reusedObjectKey = replayRecord("replay_3", "session_live_2");
    reusedObjectKey.objectKey = replayRecord().objectKey;
    await expect(
      repository.createOrReuse(reusedObjectKey, "2026-07-16T00:00:00.000Z"),
    ).rejects.toBeInstanceOf(ReplayPublicationConflictError);

    const reusedProjectionObjectKey = replayRecord(
      "replay_4",
      "session_live_2",
      "f".repeat(64),
    );
    reusedProjectionObjectKey.projectionObjectKey =
      replayRecord().projectionObjectKey;
    await expect(
      repository.createOrReuse(
        reusedProjectionObjectKey,
        "2026-07-16T00:00:00.000Z",
      ),
    ).rejects.toBeInstanceOf(ReplayPublicationConflictError);
    expect(
      database.sqlite
        .prepare("SELECT replay_id FROM replays WHERE replay_id = ?")
        .get(reusedProjectionObjectKey.replayId),
    ).toBeUndefined();
  });

  it("revokes playback append-only and prevents replay resurrection", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1ProofCapsuleReplayRepository(
      database as unknown as D1Database,
    );
    const record = replayRecord();
    await repository.createOrReuse(record, record.publishedAt);
    await expect(
      repository.statusBySourceSession(
        record.sourceSessionId,
        record.publishedAt,
      ),
    ).resolves.toEqual({ record, status: "active" });

    await expect(
      repository.revokeBySourceSession(
        record.sourceSessionId,
        "replay_revocation_1",
        "2026-07-16T01:00:00.000Z",
      ),
    ).resolves.toEqual({ replayId: record.replayId, revoked: true });
    await expect(
      repository.find(record.replayId, record.publishedAt),
    ).resolves.toBeUndefined();
    await expect(
      repository.statusBySourceSession(
        record.sourceSessionId,
        record.publishedAt,
      ),
    ).resolves.toEqual({ record, status: "revoked" });
    await expect(
      repository.revokeBySourceSession(
        record.sourceSessionId,
        "replay_revocation_2",
        "2026-07-16T01:01:00.000Z",
      ),
    ).resolves.toEqual({ replayId: record.replayId, revoked: false });
    await expect(
      repository.createOrReuse(record, record.publishedAt),
    ).rejects.toBeInstanceOf(ReplayPublicationRevokedError);

    expect(() =>
      database.sqlite
        .prepare(
          "UPDATE replay_revocations SET revoked_at = ? WHERE replay_id = ?",
        )
        .run("2026-07-16T02:00:00.000Z", record.replayId),
    ).toThrow(/replay revocations are append-only/u);
    expect(() =>
      database.sqlite
        .prepare("DELETE FROM replay_revocations WHERE replay_id = ?")
        .run(record.replayId),
    ).toThrow(/replay revocations are append-only/u);
  });

  it("stops public playback exactly at the server-owned expiry boundary", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1ProofCapsuleReplayRepository(
      database as unknown as D1Database,
    );
    const record = {
      ...replayRecord("replay_expiring"),
      publishedAt: "2026-07-16T00:00:00.000Z",
      expiresAt: "2026-08-15T00:00:00.000Z",
    };
    await repository.createOrReuse(record, record.publishedAt);

    await expect(
      repository.find(record.replayId, "2026-08-14T23:59:59.999Z"),
    ).resolves.toBeDefined();
    await expect(
      repository.find(record.replayId, "2026-08-15T00:00:00.000Z"),
    ).resolves.toBeUndefined();
    await expect(
      repository.statusBySourceSession(
        record.sourceSessionId,
        "2026-08-15T00:00:00.000Z",
      ),
    ).resolves.toMatchObject({ status: "expired" });
    await expect(
      repository.createOrReuse(record, "2026-08-15T00:00:00.000Z"),
    ).rejects.toBeInstanceOf(ReplayPublicationExpiredError);
  });
});
