// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  D1OwnerCapabilityRepository,
  OwnerCapabilityConflictError,
  createOwnerCapability,
  deriveRestartOwnerCapability,
  deriveUploadOwnerCapability,
  ensureArtifactOwnerCapability,
  ensureSessionOwnerCapability,
  hashOwnerCapability,
  ownerCapabilityIdentifies,
  ownerCapabilityMatches,
} from "./access-control";

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

function migratedDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );
  for (const file of [
    "0001_evidence_store.sql",
    "0002_runner_jobs.sql",
    "0007_owner_capabilities.sql",
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
      "artifact_private_1",
      "private.ipynb",
      "a".repeat(64),
      "{}",
      "2026-07-18T10:00:00.000Z",
    );
  database
    .prepare(
      `INSERT INTO sessions
        (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "session_private_1",
      "artifact_private_1",
      "INGESTED",
      1,
      "{}",
      "2026-07-18T10:00:00.000Z",
      "2026-07-18T10:00:00.000Z",
    );
  return database;
}

function legacyUpgradeDatabase(): DatabaseSync {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  const migrationDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../migrations",
  );
  database.exec(
    readFileSync(
      resolve(migrationDirectory, "0001_evidence_store.sql"),
      "utf8",
    ),
  );
  database.exec(
    readFileSync(resolve(migrationDirectory, "0002_runner_jobs.sql"), "utf8"),
  );
  database
    .prepare(
      `INSERT INTO artifacts
        (id, file_name, file_sha256, manifest_json, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      "artifact_legacy_private",
      "legacy-private.ipynb",
      "b".repeat(64),
      "{}",
      "2026-07-17T10:00:00.000Z",
    );
  database
    .prepare(
      `INSERT INTO sessions
        (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "session_legacy_private",
      "artifact_legacy_private",
      "INGESTED",
      1,
      "{}",
      "2026-07-17T10:00:00.000Z",
      "2026-07-17T10:00:00.000Z",
    );
  database.exec(
    readFileSync(
      resolve(migrationDirectory, "0007_owner_capabilities.sql"),
      "utf8",
    ),
  );
  return database;
}

describe("owner capability access plane", () => {
  it("derives and reconciles one capability for an upload operation", async () => {
    const serverSecret =
      "contained-upload-owner-test-secret-with-at-least-32-characters";
    const uploadKey = `upload_123e4567-e89b-42d3-a456-426614174000_${"a".repeat(64)}`;
    const artifactId = "artifact_private_1";
    const fileSha256 = "b".repeat(64);
    const derived = await deriveUploadOwnerCapability(
      serverSecret,
      uploadKey,
      artifactId,
      fileSha256,
    );
    await expect(
      deriveUploadOwnerCapability(
        serverSecret,
        uploadKey,
        artifactId,
        fileSha256,
      ),
    ).resolves.toBe(derived);
    await expect(
      deriveUploadOwnerCapability(
        serverSecret,
        `upload_123e4567-e89b-42d3-a456-426614174001_${"a".repeat(64)}`,
        artifactId,
        fileSha256,
      ),
    ).resolves.not.toBe(derived);
    await expect(
      deriveUploadOwnerCapability(
        serverSecret,
        uploadKey,
        "artifact_private_2",
        fileSha256,
      ),
    ).resolves.not.toBe(derived);
    await expect(
      deriveUploadOwnerCapability(
        serverSecret,
        uploadKey,
        artifactId,
        "c".repeat(64),
      ),
    ).resolves.not.toBe(derived);
    await expect(
      deriveUploadOwnerCapability(
        serverSecret,
        "upload_not-bound",
        artifactId,
        fileSha256,
      ),
    ).rejects.toThrow(/hash-bound/u);
    expect(derived).toMatch(/^cl_owner_[A-Za-z0-9_-]{43}$/u);

    const database = migratedDatabase();
    const repository = new D1OwnerCapabilityRepository({
      prepare: (sql: string) =>
        new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
    } as D1Database);
    const record = {
      resourceId: artifactId,
      tokenHash: await hashOwnerCapability(derived),
      createdAt: "2026-07-18T10:00:00.000Z",
    };
    await expect(
      ensureArtifactOwnerCapability(repository, record),
    ).resolves.toBe("created");
    await expect(
      ensureArtifactOwnerCapability(repository, record),
    ).resolves.toBe("existing");
    const persisted = database
      .prepare(
        "SELECT owner_token_hash, revoked_at FROM artifact_capabilities WHERE artifact_id = ?",
      )
      .get(artifactId) as {
      owner_token_hash: string;
      revoked_at: string | null;
    };
    expect(persisted.owner_token_hash).toBe(record.tokenHash);
    expect(JSON.stringify(persisted)).not.toContain(uploadKey);
    expect(JSON.stringify(persisted)).not.toContain(derived);

    database
      .prepare(
        "UPDATE artifact_capabilities SET revoked_at = ? WHERE artifact_id = ? AND owner_token_hash = ?",
      )
      .run("2026-07-18T10:01:00.000Z", artifactId, record.tokenHash);
    await expect(
      ensureArtifactOwnerCapability(repository, record),
    ).rejects.toBeInstanceOf(OwnerCapabilityConflictError);
  });

  it("derives and reconciles a least-privilege restart capability", async () => {
    const source = `cl_owner_${"a".repeat(43)}`;
    const childId = `session_restart_${"b".repeat(64)}`;
    const derived = await deriveRestartOwnerCapability(source, childId);
    await expect(deriveRestartOwnerCapability(source, childId)).resolves.toBe(
      derived,
    );
    await expect(
      deriveRestartOwnerCapability(`cl_owner_${"c".repeat(43)}`, childId),
    ).resolves.not.toBe(derived);
    expect(derived).toMatch(/^cl_owner_[A-Za-z0-9_-]{43}$/u);
    expect(derived).not.toBe(source);

    const database = migratedDatabase();
    database
      .prepare(
        `INSERT INTO sessions
          (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        childId,
        "artifact_private_1",
        "INGESTED",
        1,
        "{}",
        "2026-07-18T10:05:00.000Z",
        "2026-07-18T10:05:00.000Z",
      );
    const repository = new D1OwnerCapabilityRepository({
      prepare: (sql: string) =>
        new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
    } as D1Database);
    const record = {
      resourceId: childId,
      tokenHash: await hashOwnerCapability(derived),
      createdAt: "2026-07-18T10:05:00.000Z",
    };
    await expect(
      ensureSessionOwnerCapability(repository, record),
    ).resolves.toBe("created");
    await expect(
      ensureSessionOwnerCapability(repository, record),
    ).resolves.toBe("existing");
    await expect(
      ensureSessionOwnerCapability(repository, {
        ...record,
        tokenHash: "d".repeat(64),
      }),
    ).rejects.toBeInstanceOf(OwnerCapabilityConflictError);
    await repository.revokeSession(childId, "2026-07-18T10:06:00.000Z");
    await expect(
      ensureSessionOwnerCapability(repository, record),
    ).rejects.toBeInstanceOf(OwnerCapabilityConflictError);
  });

  it("stores only hashes, supports repeated artifact uploads, and revokes a session", async () => {
    const database = migratedDatabase();
    const repository = new D1OwnerCapabilityRepository({
      prepare: (sql: string) =>
        new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
    } as D1Database);
    const firstArtifactToken = createOwnerCapability();
    const secondArtifactToken = createOwnerCapability();
    const sessionToken = createOwnerCapability();
    const createdAt = "2026-07-18T10:00:00.000Z";
    const firstArtifactHash = await hashOwnerCapability(firstArtifactToken);
    const secondArtifactHash = await hashOwnerCapability(secondArtifactToken);
    const sessionHash = await hashOwnerCapability(sessionToken);

    await repository.createArtifact({
      resourceId: "artifact_private_1",
      tokenHash: firstArtifactHash,
      createdAt,
    });
    await repository.createArtifact({
      resourceId: "artifact_private_1",
      tokenHash: secondArtifactHash,
      createdAt,
    });
    await repository.createSession({
      resourceId: "session_private_1",
      tokenHash: sessionHash,
      createdAt,
    });

    const artifactRecord = await repository.findArtifact(
      "artifact_private_1",
      secondArtifactHash,
    );
    const sessionRecord = await repository.findSession("session_private_1");
    expect(artifactRecord?.tokenHash).toBe(secondArtifactHash);
    expect(sessionRecord?.tokenHash).toBe(sessionHash);
    expect(JSON.stringify([artifactRecord, sessionRecord])).not.toContain(
      "cl_owner_",
    );
    await expect(
      ownerCapabilityMatches(sessionRecord, sessionToken),
    ).resolves.toBe(true);
    await expect(
      ownerCapabilityMatches(sessionRecord, createOwnerCapability()),
    ).resolves.toBe(false);

    await expect(
      repository.revokeSession("session_private_1", "2026-07-18T11:00:00.000Z"),
    ).resolves.toBe(true);
    await expect(
      repository.revokeSession("session_private_1", "2026-07-18T11:01:00.000Z"),
    ).resolves.toBe(false);
    await expect(
      ownerCapabilityMatches(
        await repository.findSession("session_private_1"),
        sessionToken,
      ),
    ).resolves.toBe(false);
    await expect(
      ownerCapabilityIdentifies(
        await repository.findSession("session_private_1"),
        sessionToken,
      ),
    ).resolves.toBe(true);
  });

  it("generates 256-bit URL-safe owner keys and rejects orphan capability rows", async () => {
    const token = createOwnerCapability();
    expect(token).toMatch(/^cl_owner_[A-Za-z0-9_-]{43}$/u);
    await expect(hashOwnerCapability(token)).resolves.toMatch(
      /^[a-f0-9]{64}$/u,
    );

    const database = migratedDatabase();
    const repository = new D1OwnerCapabilityRepository({
      prepare: (sql: string) =>
        new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
    } as D1Database);
    await expect(
      repository.createSession({
        resourceId: "session_missing",
        tokenHash: await hashOwnerCapability(createOwnerCapability()),
        createdAt: "2026-07-18T10:00:00.000Z",
      }),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/u);
  });

  it("atomically refuses revocation while a runner job is active", async () => {
    const database = migratedDatabase();
    const repository = new D1OwnerCapabilityRepository({
      prepare: (sql: string) =>
        new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
    } as D1Database);
    await repository.createSession({
      resourceId: "session_private_1",
      tokenHash: await hashOwnerCapability(createOwnerCapability()),
      createdAt: "2026-07-18T10:00:00.000Z",
    });
    database
      .prepare(
        `INSERT INTO runner_jobs (
          id, session_id, kind, status, artifact_id, artifact_manifest_hash,
          concept_pack_id, concept_pack_version, state_version, version,
          event_cursor, job_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "job_active_revocation_guard",
        "session_private_1",
        "LAB_RUN",
        "QUEUED",
        "artifact_private_1",
        "c".repeat(64),
        "entity_leakage",
        "2.1.0",
        1,
        1,
        0,
        "{}",
        "2026-07-18T10:10:00.000Z",
        "2026-07-18T10:10:00.000Z",
      );

    await expect(
      repository.revokeSession("session_private_1", "2026-07-18T11:00:00.000Z"),
    ).resolves.toBe(false);
    expect(
      (await repository.findSession("session_private_1"))?.revokedAt,
    ).toBeUndefined();

    database
      .prepare("UPDATE runner_jobs SET status = 'FAILED' WHERE id = ?")
      .run("job_active_revocation_guard");
    await expect(
      repository.revokeSession("session_private_1", "2026-07-18T11:01:00.000Z"),
    ).resolves.toBe(true);
  });

  it("explicitly retires pre-capability private sessions during upgrade", async () => {
    const database = legacyUpgradeDatabase();
    const retirement = database
      .prepare(
        `SELECT session_id, retired_at, reason
         FROM legacy_session_retirements
         WHERE session_id = ?`,
      )
      .get("session_legacy_private") as
      | {
          session_id: string;
          retired_at: string;
          reason: string;
        }
      | undefined;
    expect(retirement).toMatchObject({
      session_id: "session_legacy_private",
      reason: "missing_owner_capability_at_v1_migration",
    });
    expect(retirement?.retired_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u,
    );

    const repository = new D1OwnerCapabilityRepository({
      prepare: (sql: string) =>
        new SqliteD1Statement(database, sql) as unknown as D1PreparedStatement,
    } as D1Database);
    await expect(
      repository.createSession({
        resourceId: "session_legacy_private",
        tokenHash: await hashOwnerCapability(createOwnerCapability()),
        createdAt: "2026-07-19T00:00:00.000Z",
      }),
    ).rejects.toThrow(/legacy private session is retired/u);
    await expect(
      repository.findSession("session_legacy_private"),
    ).resolves.toBeUndefined();
  });
});
