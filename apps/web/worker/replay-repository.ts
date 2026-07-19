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
  projectionObjectKey: string;
  projectionHash: string;
  projectionBytesHash: string;
  recordedAt: string;
  metadata: ProofCapsuleReplayReceiptV2;
};

export interface ProofCapsuleReplayRepository {
  createOrReuse(
    record: ProofCapsuleReplayRecordV2,
  ): Promise<{ record: ProofCapsuleReplayRecordV2; reused: boolean }>;
  find(replayId: string): Promise<ProofCapsuleReplayRecordV2 | undefined>;
  statusBySourceSession(sourceSessionId: string): Promise<
    | {
        record: ProofCapsuleReplayRecordV2;
        status: "active" | "revoked";
      }
    | undefined
  >;
  revokeBySourceSession(
    sourceSessionId: string,
    eventId: string,
    revokedAt: string,
  ): Promise<{ replayId: string; revoked: boolean } | undefined>;
}

export class ReplayPublicationConflictError extends Error {
  constructor(sourceSessionId: string) {
    super(`A different replay is already published for ${sourceSessionId}`);
    this.name = "ReplayPublicationConflictError";
  }
}

export class ReplayPublicationRevokedError extends Error {
  constructor(sourceSessionId: string) {
    super(`The public replay for ${sourceSessionId} has been revoked`);
    this.name = "ReplayPublicationRevokedError";
  }
}

type ReplayRow = {
  replay_id: string;
  source_session_id: string;
  metadata_json: string;
  event_chain_head: string;
  object_key: string;
  projection_object_key: string;
  projection_hash: string;
  projection_bytes_hash: string;
  recorded_at: string;
};

type ReplayStatusRow = ReplayRow & { revoked_at: string | null };

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
    projectionObjectKey: row.projection_object_key,
    projectionHash: row.projection_hash,
    projectionBytesHash: row.projection_bytes_hash,
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
    left.projectionObjectKey === right.projectionObjectKey &&
    left.projectionHash === right.projectionHash &&
    left.projectionBytesHash === right.projectionBytesHash &&
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
      if (await this.isRevoked(existing.replayId)) {
        throw new ReplayPublicationRevokedError(record.sourceSessionId);
      }
      if (!samePublication(existing, record)) {
        throw new ReplayPublicationConflictError(record.sourceSessionId);
      }
      return { record: existing, reused: true };
    }
    try {
      await this.database.batch([
        this.database
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
          ),
        this.database
          .prepare(
            `INSERT INTO public_replay_projections
            (replay_id, projection_hash, bytes_hash, object_key, created_at)
           VALUES (?, ?, ?, ?, ?)`,
          )
          .bind(
            record.replayId,
            record.projectionHash,
            record.projectionBytesHash,
            record.projectionObjectKey,
            record.recordedAt,
          ),
      ]);
      return { record, reused: false };
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !/UNIQUE constraint failed: (?:replays\.(?:replay_id|source_session_id|object_key)|public_replay_projections\.(?:replay_id|object_key))/u.test(
          error.message,
        )
      ) {
        throw error;
      }
      const raced = await this.findBySourceSession(record.sourceSessionId);
      if (raced !== undefined && (await this.isRevoked(raced.replayId))) {
        throw new ReplayPublicationRevokedError(record.sourceSessionId);
      }
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
        `SELECT replays.replay_id, replays.source_session_id,
                replays.metadata_json, replays.event_chain_head,
                replays.object_key, replays.recorded_at,
                public_replay_projections.object_key AS projection_object_key,
                public_replay_projections.projection_hash,
                public_replay_projections.bytes_hash AS projection_bytes_hash
         FROM replays
         INNER JOIN public_replay_projections
           ON public_replay_projections.replay_id = replays.replay_id
         WHERE replays.replay_id = ?
           AND NOT EXISTS (
             SELECT 1 FROM replay_revocations
             WHERE replay_revocations.replay_id = replays.replay_id
           )`,
      )
      .bind(replayId)
      .first<ReplayRow>();
    return row === null ? undefined : recordFromRow(row);
  }

  async revokeBySourceSession(
    sourceSessionId: string,
    eventId: string,
    revokedAt: string,
  ): Promise<{ replayId: string; revoked: boolean } | undefined> {
    const row = await this.database
      .prepare(
        `SELECT replay_id
         FROM replays
         WHERE source_session_id = ?`,
      )
      .bind(sourceSessionId)
      .first<{ replay_id: string }>();
    if (row === null) return undefined;
    const result = await this.database
      .prepare(
        `INSERT INTO replay_revocations (event_id, replay_id, revoked_at, reason)
         VALUES (?, ?, ?, 'owner_requested')
         ON CONFLICT(replay_id) DO NOTHING`,
      )
      .bind(eventId, row.replay_id, revokedAt)
      .run();
    return {
      replayId: row.replay_id,
      revoked: (result.meta.changes ?? 0) > 0,
    };
  }

  async statusBySourceSession(sourceSessionId: string): Promise<
    | {
        record: ProofCapsuleReplayRecordV2;
        status: "active" | "revoked";
      }
    | undefined
  > {
    const row = await this.database
      .prepare(
        `SELECT replays.replay_id, replays.source_session_id,
                replays.metadata_json, replays.event_chain_head,
                replays.object_key, replays.recorded_at,
                public_replay_projections.object_key AS projection_object_key,
                public_replay_projections.projection_hash,
                public_replay_projections.bytes_hash AS projection_bytes_hash,
                replay_revocations.revoked_at
         FROM replays
         INNER JOIN public_replay_projections
           ON public_replay_projections.replay_id = replays.replay_id
         LEFT JOIN replay_revocations
           ON replay_revocations.replay_id = replays.replay_id
         WHERE replays.source_session_id = ?`,
      )
      .bind(sourceSessionId)
      .first<ReplayStatusRow>();
    if (row === null) return undefined;
    return {
      record: recordFromRow(row),
      status: row.revoked_at === null ? "active" : "revoked",
    };
  }

  private async findBySourceSession(
    sourceSessionId: string,
  ): Promise<ProofCapsuleReplayRecordV2 | undefined> {
    const row = await this.database
      .prepare(
        `SELECT replays.replay_id, replays.source_session_id,
                replays.metadata_json, replays.event_chain_head,
                replays.object_key, replays.recorded_at,
                public_replay_projections.object_key AS projection_object_key,
                public_replay_projections.projection_hash,
                public_replay_projections.bytes_hash AS projection_bytes_hash
         FROM replays
         INNER JOIN public_replay_projections
           ON public_replay_projections.replay_id = replays.replay_id
         WHERE replays.source_session_id = ?`,
      )
      .bind(sourceSessionId)
      .first<ReplayRow>();
    return row === null ? undefined : recordFromRow(row);
  }

  private async isRevoked(replayId: string): Promise<boolean> {
    return (
      (await this.database
        .prepare(
          `SELECT replay_id
           FROM replay_revocations
           WHERE replay_id = ?`,
        )
        .bind(replayId)
        .first<{ replay_id: string }>()) !== null
    );
  }
}
