import {
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerJobSchema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJob,
} from "@counterlab/contracts";
import {
  ConcurrentRunnerJobUpdateError,
  type RunnerJobRepository,
} from "@counterlab/session-core";

type D1Changes = { meta?: { changes?: number } };

export class D1RunnerJobRepository implements RunnerJobRepository {
  constructor(private readonly database: D1Database) {}

  async create(job: RunnerJob): Promise<void> {
    const parsed = RunnerJobSchema.parse(job);
    await this.database
      .prepare(
        `INSERT INTO runner_jobs
          (id, session_id, kind, status, artifact_id, artifact_manifest_hash,
           concept_pack_id, concept_pack_version, state_version, version,
           event_cursor, job_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        parsed.jobId,
        parsed.sessionId,
        parsed.kind,
        parsed.status,
        parsed.artifactId,
        parsed.artifactManifestHash,
        parsed.conceptPack.id,
        parsed.conceptPack.version,
        parsed.stateVersion,
        parsed.jobVersion,
        parsed.eventCursor,
        JSON.stringify(parsed),
        parsed.createdAt,
        parsed.updatedAt,
      )
      .run();
  }

  async find(jobId: string): Promise<RunnerJob | undefined> {
    const row = await this.database
      .prepare("SELECT job_json FROM runner_jobs WHERE id = ?")
      .bind(jobId)
      .first<{ job_json: string }>();
    return row === null
      ? undefined
      : RunnerJobSchema.parse(JSON.parse(row.job_json));
  }

  async save(job: RunnerJob, expectedVersion: number): Promise<void> {
    const parsed = RunnerJobSchema.parse(job);
    const result = (await this.database
      .prepare(
        `UPDATE runner_jobs
         SET status = ?, version = ?, event_cursor = ?, job_json = ?, updated_at = ?
         WHERE id = ? AND version = ?`,
      )
      .bind(
        parsed.status,
        parsed.jobVersion,
        parsed.eventCursor,
        JSON.stringify(parsed),
        parsed.updatedAt,
        parsed.jobId,
        expectedVersion,
      )
      .run()) as D1Changes;
    if (result.meta?.changes !== 1) {
      throw new ConcurrentRunnerJobUpdateError(parsed.jobId);
    }
  }

  async appendEvent(
    job: RunnerJob,
    expectedVersion: number,
    event: PublicCompilerEvent,
  ): Promise<void> {
    const parsedJob = RunnerJobSchema.parse(job);
    const parsedEvent = PublicCompilerEventSchema.parse(event);
    const eventInsert = this.database
      .prepare(
        `INSERT INTO runner_public_events
          (event_id, job_id, cursor, kind, event_json, occurred_at)
         SELECT ?, ?, ?, ?, ?, ?
         FROM runner_jobs
         WHERE id = ? AND version = ?`,
      )
      .bind(
        parsedEvent.eventId,
        parsedEvent.jobId,
        parsedEvent.cursor,
        parsedEvent.kind,
        JSON.stringify(parsedEvent),
        parsedEvent.at,
        parsedJob.jobId,
        expectedVersion,
      );
    const jobUpdate = this.database
      .prepare(
        `UPDATE runner_jobs
         SET status = ?, version = ?, event_cursor = ?, job_json = ?, updated_at = ?
         WHERE id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM runner_public_events
             WHERE event_id = ? AND job_id = ?
           )`,
      )
      .bind(
        parsedJob.status,
        parsedJob.jobVersion,
        parsedJob.eventCursor,
        JSON.stringify(parsedJob),
        parsedJob.updatedAt,
        parsedJob.jobId,
        expectedVersion,
        parsedEvent.eventId,
        parsedJob.jobId,
      );
    const results = (await this.database.batch([
      eventInsert,
      jobUpdate,
    ])) as D1Changes[];
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      throw new ConcurrentRunnerJobUpdateError(parsedJob.jobId);
    }
  }

  async listEvents(
    jobId: string,
    afterCursor: number,
  ): Promise<PublicCompilerEvent[]> {
    const rows = await this.database
      .prepare(
        `SELECT event_json FROM runner_public_events
         WHERE job_id = ? AND cursor > ? ORDER BY cursor ASC`,
      )
      .bind(jobId, afterCursor)
      .all<{ event_json: string }>();
    return rows.results.map((row) =>
      PublicCompilerEventSchema.parse(JSON.parse(row.event_json)),
    );
  }

  async findCallback(
    idempotencyKey: string,
  ): Promise<RunnerCallback | undefined> {
    const row = await this.database
      .prepare(
        "SELECT callback_json FROM runner_callback_receipts WHERE idempotency_key = ?",
      )
      .bind(idempotencyKey)
      .first<{ callback_json: string }>();
    return row === null
      ? undefined
      : RunnerCallbackSchema.parse(JSON.parse(row.callback_json));
  }

  async complete(
    job: RunnerJob,
    expectedVersion: number,
    callback: RunnerCallback,
  ): Promise<void> {
    const parsedJob = RunnerJobSchema.parse(job);
    const parsedCallback = RunnerCallbackSchema.parse(callback);
    const receiptInsert = this.database
      .prepare(
        `INSERT INTO runner_callback_receipts
          (idempotency_key, callback_id, job_id, callback_json, received_at)
         SELECT ?, ?, ?, ?, ?
         FROM runner_jobs
         WHERE id = ? AND version = ?`,
      )
      .bind(
        parsedCallback.idempotencyKey,
        parsedCallback.callbackId,
        parsedCallback.jobId,
        JSON.stringify(parsedCallback),
        parsedCallback.occurredAt,
        parsedJob.jobId,
        expectedVersion,
      );
    const jobUpdate = this.database
      .prepare(
        `UPDATE runner_jobs
         SET status = ?, version = ?, event_cursor = ?, job_json = ?, updated_at = ?
         WHERE id = ? AND version = ?
           AND EXISTS (
             SELECT 1 FROM runner_callback_receipts
             WHERE idempotency_key = ? AND job_id = ?
           )`,
      )
      .bind(
        parsedJob.status,
        parsedJob.jobVersion,
        parsedJob.eventCursor,
        JSON.stringify(parsedJob),
        parsedJob.updatedAt,
        parsedJob.jobId,
        expectedVersion,
        parsedCallback.idempotencyKey,
        parsedJob.jobId,
      );
    const results = (await this.database.batch([
      receiptInsert,
      jobUpdate,
    ])) as D1Changes[];
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) {
      throw new ConcurrentRunnerJobUpdateError(parsedJob.jobId);
    }
  }
}
