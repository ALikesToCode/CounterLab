import { DatabaseSync } from "node:sqlite";

import {
  type CounterLabSession,
  type EvidenceEvent,
  normalizeSessionAggregate,
  SessionAlreadyExistsError,
} from "./domain.js";
import type { SessionRepository } from "./repository.js";

const MIGRATIONS = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL,
        state TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version > 0),
        aggregate_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS evidence_events (
        event_id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE RESTRICT,
        sequence INTEGER NOT NULL CHECK (sequence > 0),
        event_hash TEXT NOT NULL UNIQUE,
        event_json TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        UNIQUE (session_id, sequence)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS evidence_events_session_order
        ON evidence_events(session_id, sequence);

      CREATE TRIGGER IF NOT EXISTS evidence_events_no_update
      BEFORE UPDATE ON evidence_events
      BEGIN
        SELECT RAISE(ABORT, 'evidence events are append-only');
      END;

      CREATE TRIGGER IF NOT EXISTS evidence_events_no_delete
      BEFORE DELETE ON evidence_events
      BEGIN
        SELECT RAISE(ABORT, 'evidence events are append-only');
      END;
    `,
  },
] as const;

export class ConcurrentSessionUpdateError extends Error {
  constructor(sessionId: string) {
    super(`Session changed during update: ${sessionId}`);
    this.name = "ConcurrentSessionUpdateError";
  }
}

export class SqliteSessionRepository implements SessionRepository {
  private readonly database: DatabaseSync;
  private closed = false;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec("PRAGMA foreign_keys = ON;");
    this.database.exec("PRAGMA busy_timeout = 5000;");
    if (path !== ":memory:") {
      this.database.exec("PRAGMA journal_mode = WAL;");
      this.database.exec("PRAGMA synchronous = FULL;");
    }
    this.migrate();
  }

  async create(
    session: CounterLabSession,
    firstEvent: EvidenceEvent,
  ): Promise<void> {
    this.transaction(() => {
      try {
        this.database
          .prepare(
            `INSERT INTO sessions
              (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            session.id,
            session.artifactId,
            session.state,
            session.version,
            JSON.stringify(session),
            session.createdAt,
            session.updatedAt,
          );
      } catch (error) {
        if (
          error instanceof Error &&
          /UNIQUE constraint failed: sessions\.id/.test(error.message)
        ) {
          throw new SessionAlreadyExistsError(session.id);
        }
        throw error;
      }
      this.insertEvent(firstEvent);
    });
  }

  async find(sessionId: string): Promise<CounterLabSession | undefined> {
    const row = this.database
      .prepare("SELECT aggregate_json FROM sessions WHERE id = ?")
      .get(sessionId) as { aggregate_json: string } | undefined;
    return row === undefined
      ? undefined
      : normalizeSessionAggregate(
          JSON.parse(row.aggregate_json) as Omit<CounterLabSession, "mode"> & {
            mode: unknown;
          },
        );
  }

  async save(
    session: CounterLabSession,
    expectedVersion: number,
    event: EvidenceEvent,
  ): Promise<void> {
    this.transaction(() => {
      const result = this.database
        .prepare(
          `UPDATE sessions
           SET state = ?, version = ?, aggregate_json = ?, updated_at = ?
           WHERE id = ? AND version = ?`,
        )
        .run(
          session.state,
          session.version,
          JSON.stringify(session),
          session.updatedAt,
          session.id,
          expectedVersion,
        );
      if (result.changes !== 1) {
        throw new ConcurrentSessionUpdateError(session.id);
      }
      this.insertEvent(event);
    });
  }

  async listEvents(sessionId: string): Promise<EvidenceEvent[]> {
    const rows = this.database
      .prepare(
        "SELECT event_json FROM evidence_events WHERE session_id = ? ORDER BY sequence ASC",
      )
      .all(sessionId) as Array<{ event_json: string }>;
    return rows.map((row) => JSON.parse(row.event_json) as EvidenceEvent);
  }

  async lastEvent(sessionId: string): Promise<EvidenceEvent | undefined> {
    const row = this.database
      .prepare(
        `SELECT event_json FROM evidence_events
         WHERE session_id = ? ORDER BY sequence DESC LIMIT 1`,
      )
      .get(sessionId) as { event_json: string } | undefined;
    return row === undefined
      ? undefined
      : (JSON.parse(row.event_json) as EvidenceEvent);
  }

  close(): void {
    if (!this.closed) {
      this.database.close();
      this.closed = true;
    }
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;
    `);
    const appliedRows = this.database
      .prepare("SELECT version FROM schema_migrations")
      .all() as Array<{ version: number }>;
    const applied = new Set(appliedRows.map((row) => row.version));
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      this.transaction(() => {
        this.database.exec(migration.sql);
        this.database
          .prepare(
            "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
          )
          .run(migration.version, new Date().toISOString());
      });
    }
  }

  private insertEvent(event: EvidenceEvent): void {
    this.database
      .prepare(
        `INSERT INTO evidence_events
          (event_id, session_id, sequence, event_hash, event_json, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        event.eventId,
        event.sessionId,
        event.sequence,
        event.eventHash,
        JSON.stringify(event),
        event.timestamp,
      );
  }

  private transaction<T>(operation: () => T): T {
    this.database.exec("BEGIN IMMEDIATE;");
    try {
      const result = operation();
      this.database.exec("COMMIT;");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK;");
      throw error;
    }
  }
}
