// @vitest-environment node

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { RunnerJobService } from "@counterlab/session-core";

import { D1RunnerJobRepository } from "./d1-runner-job-repository";

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

  async all<T>(): Promise<{ results: T[]; success: true }> {
    return {
      results: this.database
        .prepare(this.sql)
        .all(...(this.values as SQLInputValue[])) as T[],
      success: true,
    };
  }
}

class SqliteD1Database {
  readonly sqlite = new DatabaseSync(":memory:");

  prepare(sql: string): SqliteD1Statement {
    return new SqliteD1Statement(this.sqlite, sql);
  }

  async batch(statements: SqliteD1Statement[]) {
    this.sqlite.exec("BEGIN IMMEDIATE");
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

  migrate(): void {
    this.sqlite.exec("PRAGMA foreign_keys = ON");
    const migrationDirectory = resolve(
      dirname(fileURLToPath(import.meta.url)),
      "../migrations",
    );
    for (const file of [
      "0001_evidence_store.sql",
      "0002_runner_jobs.sql",
      "0003_runner_request_identity.sql",
    ]) {
      this.sqlite.exec(readFileSync(resolve(migrationDirectory, file), "utf8"));
    }
    this.sqlite
      .prepare(
        `INSERT INTO artifacts
          (id, file_name, file_sha256, manifest_json, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        "artifact_live_1",
        "uploaded.ipynb",
        "a".repeat(64),
        "{}",
        "2026-07-15T00:00:00.000Z",
      );
    this.sqlite
      .prepare(
        `INSERT INTO sessions
          (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "session_live_1",
        "artifact_live_1",
        "PREDICTION_COMMITTED",
        4,
        "{}",
        "2026-07-15T00:00:00.000Z",
        "2026-07-15T00:00:00.000Z",
      );
  }
}

describe("D1RunnerJobRepository", () => {
  it("collapses identical active request fingerprints and separates configurations", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1RunnerJobRepository(
      database as unknown as D1Database,
    );
    const service = new RunnerJobService(repository, {
      now: () => new Date("2026-07-15T00:00:00.000Z"),
    });
    const requestIdentity = {
      schemaVersion: "1" as const,
      sessionId: "session_live_1",
      mode: "live_notebook" as const,
      purpose: "LAB_RUN_INTERACTIVE" as const,
      artifactId: "artifact_live_1",
      artifactManifestHash: "a".repeat(64),
      conceptPack: { id: "entity_leakage" as const, version: "2.0.0" },
      authorityProfileHash: "b".repeat(64),
      authorityInputHashes: { plan: "c".repeat(64) },
      configurationHash: "d".repeat(64),
    };
    const common = {
      kind: "LAB_RUN" as const,
      sessionId: "session_live_1",
      artifactId: "artifact_live_1",
      artifactManifestHash: "a".repeat(64),
      conceptPack: { id: "entity_leakage" as const, version: "2.0.0" },
      inputHashes: ["c".repeat(64)],
      stateVersion: 4,
      maxAttempts: 1,
      timeoutSeconds: 90,
      requestIdentity,
    };

    const first = await service.createOrReuseJob({
      ...common,
      jobId: "job_request_1",
    });
    const duplicate = await service.createOrReuseJob({
      ...common,
      jobId: "job_request_2",
    });
    const distinct = await service.createOrReuseJob({
      ...common,
      jobId: "job_request_3",
      requestIdentity: {
        ...requestIdentity,
        configurationHash: "e".repeat(64),
      },
    });

    expect(first.reused).toBe(false);
    expect(duplicate).toMatchObject({
      reused: true,
      job: { jobId: "job_request_1" },
    });
    expect(distinct).toMatchObject({
      reused: false,
      job: { jobId: "job_request_3" },
    });
  });

  it("persists optimistic jobs, cursor reconnect, and idempotent callbacks", async () => {
    const database = new SqliteD1Database();
    database.migrate();
    const repository = new D1RunnerJobRepository(
      database as unknown as D1Database,
    );
    let tick = 0;
    const service = new RunnerJobService(repository, {
      now: () =>
        new Date(`2026-07-15T00:00:${String(tick++).padStart(2, "0")}.000Z`),
    });
    const queued = await service.createJob({
      jobId: "job_live_1",
      kind: "LAB_COMPILE",
      sessionId: "session_live_1",
      artifactId: "artifact_live_1",
      artifactManifestHash: "a".repeat(64),
      conceptPack: { id: "entity_leakage", version: "2.0.0" },
      inputHashes: ["b".repeat(64)],
      stateVersion: 4,
      maxAttempts: 3,
      timeoutSeconds: 90,
    });
    const starting = await service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-test" },
    );
    const running = await service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const streamed = await service.appendEvent(
      running.jobId,
      running.jobVersion,
      {
        schemaVersion: "1",
        eventId: "public_event_1",
        jobId: running.jobId,
        cursor: 1,
        kind: "job.started",
        at: "2026-07-15T00:00:03.000Z",
      },
    );
    await expect(service.listEvents(streamed.jobId, 0)).resolves.toEqual([
      expect.objectContaining({ cursor: 1, kind: "job.started" }),
    ]);
    await expect(
      service.findForState({
        sessionId: streamed.sessionId,
        kind: streamed.kind,
        artifactManifestHash: streamed.artifactManifestHash,
        stateVersion: streamed.stateVersion,
      }),
    ).resolves.toMatchObject({ jobId: streamed.jobId, status: "RUNNING" });

    const callback = {
      schemaVersion: "1" as const,
      callbackId: "callback_1",
      idempotencyKey: "job_live_1:verified:1",
      jobId: streamed.jobId,
      stateVersion: 4,
      status: "VERIFIED" as const,
      outputHashes: ["c".repeat(64)],
      finalEventCursor: 1,
      occurredAt: "2026-07-15T00:00:04.000Z",
    };
    await expect(service.recordCallback(callback)).resolves.toMatchObject({
      duplicate: false,
      job: { status: "VERIFIED", jobVersion: 5 },
    });
    await expect(service.recordCallback(callback)).resolves.toMatchObject({
      duplicate: true,
      job: { status: "VERIFIED" },
    });
    await expect(
      service.transition(streamed.jobId, streamed.jobVersion, "REPAIRING"),
    ).rejects.toThrow(/changed during update|terminal/i);
    database.sqlite.close();
  });
});
