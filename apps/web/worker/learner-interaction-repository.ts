import {
  LearnerInteractionRecordSchema,
  type LearnerInteractionRecord,
} from "@counterlab/contracts";

export interface LearnerInteractionRepository {
  append(record: LearnerInteractionRecord): Promise<{ duplicate: boolean }>;
}

export class LearnerInteractionConflictError extends Error {
  constructor(eventId: string) {
    super(`Learner interaction ID was reused with different data: ${eventId}`);
    this.name = "LearnerInteractionConflictError";
  }
}

export class D1LearnerInteractionRepository implements LearnerInteractionRepository {
  constructor(private readonly database: D1Database) {}

  async append(
    record: LearnerInteractionRecord,
  ): Promise<{ duplicate: boolean }> {
    const validatedRecord = LearnerInteractionRecordSchema.parse(record);
    const serialized = JSON.stringify(validatedRecord);
    const inserted = await this.database
      .prepare(
        `INSERT INTO learner_interactions
          (event_id, session_id, event_kind, stage, mode, concept, event_json, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(event_id) DO NOTHING`,
      )
      .bind(
        validatedRecord.eventId,
        validatedRecord.sessionId,
        validatedRecord.interaction.kind,
        validatedRecord.interaction.stage,
        validatedRecord.mode,
        validatedRecord.concept,
        serialized,
        validatedRecord.timestamp,
      )
      .run();
    if (inserted.meta.changes === 1) return { duplicate: false };

    const existing = await this.database
      .prepare("SELECT event_json FROM learner_interactions WHERE event_id = ?")
      .bind(validatedRecord.eventId)
      .first<{ event_json: string }>();
    if (existing !== null) {
      const previous = LearnerInteractionRecordSchema.parse(
        JSON.parse(existing.event_json),
      );
      if (
        previous.sessionId === validatedRecord.sessionId &&
        JSON.stringify(previous.interaction) ===
          JSON.stringify(validatedRecord.interaction)
      ) {
        return { duplicate: true };
      }
    }
    throw new LearnerInteractionConflictError(validatedRecord.eventId);
  }
}
