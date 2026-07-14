import {
  SessionAlreadyExistsError,
  type CounterLabSession,
  type EvidenceEvent,
  type SessionRepository,
} from "@counterlab/session-core";

type D1Changes = { meta?: { changes?: number } };

export class ConcurrentD1SessionUpdateError extends Error {
  constructor(sessionId: string) {
    super(`Session changed during D1 update: ${sessionId}`);
    this.name = "ConcurrentD1SessionUpdateError";
  }
}

export class D1SessionRepository implements SessionRepository {
  constructor(private readonly database: D1Database) {}

  async create(
    session: CounterLabSession,
    firstEvent: EvidenceEvent,
  ): Promise<void> {
    try {
      await this.database.batch([
        this.database
          .prepare(
            `INSERT INTO sessions
              (id, artifact_id, state, version, aggregate_json, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            session.id,
            session.artifactId,
            session.state,
            session.version,
            JSON.stringify(session),
            session.createdAt,
            session.updatedAt,
          ),
        this.eventInsert(firstEvent),
      ]);
    } catch (error) {
      if (
        error instanceof Error &&
        /UNIQUE constraint failed: sessions\.id/.test(error.message)
      ) {
        throw new SessionAlreadyExistsError(session.id);
      }
      throw error;
    }
  }

  async find(sessionId: string): Promise<CounterLabSession | undefined> {
    const row = await this.database
      .prepare("SELECT aggregate_json FROM sessions WHERE id = ?")
      .bind(sessionId)
      .first<{ aggregate_json: string }>();
    return row === null
      ? undefined
      : (JSON.parse(row.aggregate_json) as CounterLabSession);
  }

  async save(
    session: CounterLabSession,
    expectedVersion: number,
    event: EvidenceEvent,
  ): Promise<void> {
    const eventInsert = this.database
      .prepare(
        `INSERT INTO evidence_events
          (event_id, session_id, sequence, event_hash, event_json, timestamp)
         SELECT ?, ?, ?, ?, ?, ?
         FROM sessions
         WHERE id = ? AND version = ?`,
      )
      .bind(
        event.eventId,
        event.sessionId,
        event.sequence,
        event.eventHash,
        JSON.stringify(event),
        event.timestamp,
        session.id,
        expectedVersion,
      );
    const sessionUpdate = this.database
      .prepare(
        `UPDATE sessions
         SET state = ?, version = ?, aggregate_json = ?, updated_at = ?
         WHERE id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM evidence_events WHERE event_id = ? AND session_id = ?
           )`,
      )
      .bind(
        session.state,
        session.version,
        JSON.stringify(session),
        session.updatedAt,
        session.id,
        expectedVersion,
        event.eventId,
        session.id,
      );

    const results = (await this.database.batch([
      eventInsert,
      sessionUpdate,
    ])) as D1Changes[];
    if (
      results[0]?.meta?.changes !== 1 ||
      results[1]?.meta?.changes !== 1
    ) {
      throw new ConcurrentD1SessionUpdateError(session.id);
    }
  }

  async listEvents(sessionId: string): Promise<EvidenceEvent[]> {
    const result = await this.database
      .prepare(
        "SELECT event_json FROM evidence_events WHERE session_id = ? ORDER BY sequence ASC",
      )
      .bind(sessionId)
      .all<{ event_json: string }>();
    return result.results.map(
      (row) => JSON.parse(row.event_json) as EvidenceEvent,
    );
  }

  async lastEvent(sessionId: string): Promise<EvidenceEvent | undefined> {
    const row = await this.database
      .prepare(
        `SELECT event_json FROM evidence_events
         WHERE session_id = ? ORDER BY sequence DESC LIMIT 1`,
      )
      .bind(sessionId)
      .first<{ event_json: string }>();
    return row === null
      ? undefined
      : (JSON.parse(row.event_json) as EvidenceEvent);
  }

  close(): void {
    // D1 bindings are request-scoped and do not expose a close operation.
  }

  private eventInsert(event: EvidenceEvent): D1PreparedStatement {
    return this.database
      .prepare(
        `INSERT INTO evidence_events
          (event_id, session_id, sequence, event_hash, event_json, timestamp)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        event.eventId,
        event.sessionId,
        event.sequence,
        event.eventHash,
        JSON.stringify(event),
        event.timestamp,
      );
  }
}
