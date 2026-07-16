import {
  ProofCapsuleReplayReceiptV2Schema,
  canonicalJsonV1,
  type ProofCapsuleReplayReceiptV2,
} from "@counterlab/contracts";

export type ProofCapsuleReplayRecordV2 = {
  schemaVersion: "2";
  replayId: string;
  sourceSessionId: string;
  capsuleId: string;
  objectKey: string;
  recordedAt: string;
  metadata: ProofCapsuleReplayReceiptV2;
};

export interface ProofCapsuleReplayRepository {
  createOrReuse(
    record: ProofCapsuleReplayRecordV2,
  ): Promise<{ record: ProofCapsuleReplayRecordV2; reused: boolean }>;
  find(replayId: string): Promise<ProofCapsuleReplayRecordV2 | undefined>;
}

export class ReplayPublicationConflictError extends Error {
  constructor(sourceSessionId: string) {
    super(`A different replay is already published for ${sourceSessionId}`);
    this.name = "ReplayPublicationConflictError";
  }
}

type ReplayRow = {
  replay_id: string;
  source_session_id: string;
  metadata_json: string;
  event_chain_head: string;
  object_key: string;
  recorded_at: string;
};

function recordFromRow(row: ReplayRow): ProofCapsuleReplayRecordV2 {
  const metadata = ProofCapsuleReplayReceiptV2Schema.parse(
    JSON.parse(row.metadata_json),
  );
  if (
    metadata.replayId !== row.replay_id ||
    metadata.sourceSessionId !== row.source_session_id ||
    metadata.eventChainHead !== row.event_chain_head ||
    metadata.recordedAt !== row.recorded_at
  ) {
    throw new Error(
      "Persisted replay metadata does not match its D1 authority",
    );
  }
  return {
    schemaVersion: "2",
    replayId: row.replay_id,
    sourceSessionId: row.source_session_id,
    capsuleId: metadata.capsuleId,
    objectKey: row.object_key,
    recordedAt: row.recorded_at,
    metadata,
  };
}

function samePublication(
  left: ProofCapsuleReplayRecordV2,
  right: ProofCapsuleReplayRecordV2,
): boolean {
  return (
    left.sourceSessionId === right.sourceSessionId &&
    left.capsuleId === right.capsuleId &&
    left.objectKey === right.objectKey &&
    left.metadata.bytesHash === right.metadata.bytesHash &&
    left.metadata.rootHash === right.metadata.rootHash
  );
}

export class D1ProofCapsuleReplayRepository implements ProofCapsuleReplayRepository {
  constructor(private readonly database: D1Database) {}

  async createOrReuse(
    record: ProofCapsuleReplayRecordV2,
  ): Promise<{ record: ProofCapsuleReplayRecordV2; reused: boolean }> {
    const existing = await this.findBySourceSession(record.sourceSessionId);
    if (existing !== undefined) {
      if (!samePublication(existing, record)) {
        throw new ReplayPublicationConflictError(record.sourceSessionId);
      }
      return { record: existing, reused: true };
    }
    try {
      await this.database
        .prepare(
          `INSERT INTO replays
            (replay_id, source_session_id, metadata_json, event_chain_head, object_key, recorded_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          record.replayId,
          record.sourceSessionId,
          canonicalJsonV1(record.metadata),
          record.metadata.eventChainHead,
          record.objectKey,
          record.recordedAt,
        )
        .run();
      return { record, reused: false };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/UNIQUE constraint failed: replays\.(?:replay_id|source_session_id|object_key)/u.test(
          error.message,
        )
      ) {
        throw error;
      }
      const raced = await this.findBySourceSession(record.sourceSessionId);
      if (raced !== undefined && samePublication(raced, record)) {
        return { record: raced, reused: true };
      }
      throw new ReplayPublicationConflictError(record.sourceSessionId);
    }
  }

  async find(
    replayId: string,
  ): Promise<ProofCapsuleReplayRecordV2 | undefined> {
    const row = await this.database
      .prepare(
        `SELECT replay_id, source_session_id, metadata_json, event_chain_head,
                object_key, recorded_at
         FROM replays WHERE replay_id = ?`,
      )
      .bind(replayId)
      .first<ReplayRow>();
    return row === null ? undefined : recordFromRow(row);
  }

  private async findBySourceSession(
    sourceSessionId: string,
  ): Promise<ProofCapsuleReplayRecordV2 | undefined> {
    const row = await this.database
      .prepare(
        `SELECT replay_id, source_session_id, metadata_json, event_chain_head,
                object_key, recorded_at
         FROM replays WHERE source_session_id = ?`,
      )
      .bind(sourceSessionId)
      .first<ReplayRow>();
    return row === null ? undefined : recordFromRow(row);
  }
}
