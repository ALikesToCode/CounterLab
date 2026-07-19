export const OWNER_CAPABILITY_POLICY_VERSION = "owner-capability-v1";

export type OwnerCapabilityRecord = Readonly<{
  resourceId: string;
  tokenHash: string;
  createdAt: string;
  revokedAt?: string;
}>;

export interface OwnerCapabilityRepository {
  createArtifact(record: OwnerCapabilityRecord): Promise<void>;
  findArtifact(
    artifactId: string,
    tokenHash: string,
  ): Promise<OwnerCapabilityRecord | undefined>;
  createSession(record: OwnerCapabilityRecord): Promise<void>;
  findSession(sessionId: string): Promise<OwnerCapabilityRecord | undefined>;
  revokeSession(sessionId: string, revokedAt: string): Promise<boolean>;
}

type CapabilityRow = {
  resource_id: string;
  token_hash: string;
  created_at: string;
  revoked_at: string | null;
};

function fromRow(row: CapabilityRow | null): OwnerCapabilityRecord | undefined {
  if (row === null) return undefined;
  return {
    resourceId: row.resource_id,
    tokenHash: row.token_hash,
    createdAt: row.created_at,
    ...(row.revoked_at === null ? {} : { revokedAt: row.revoked_at }),
  };
}

export class D1OwnerCapabilityRepository implements OwnerCapabilityRepository {
  constructor(private readonly database: D1Database) {}

  async createArtifact(record: OwnerCapabilityRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO artifact_capabilities (
          artifact_id, owner_token_hash, policy_version, created_at, revoked_at
        ) VALUES (?, ?, ?, ?, NULL)`,
      )
      .bind(
        record.resourceId,
        record.tokenHash,
        OWNER_CAPABILITY_POLICY_VERSION,
        record.createdAt,
      )
      .run();
  }

  async findArtifact(
    artifactId: string,
    tokenHash: string,
  ): Promise<OwnerCapabilityRecord | undefined> {
    return fromRow(
      await this.database
        .prepare(
          `SELECT artifact_id AS resource_id, owner_token_hash AS token_hash,
                  created_at, revoked_at
           FROM artifact_capabilities
           WHERE artifact_id = ? AND owner_token_hash = ?`,
        )
        .bind(artifactId, tokenHash)
        .first<CapabilityRow>(),
    );
  }

  async createSession(record: OwnerCapabilityRecord): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO session_capabilities (
          session_id, owner_token_hash, policy_version, created_at, revoked_at
        ) VALUES (?, ?, ?, ?, NULL)`,
      )
      .bind(
        record.resourceId,
        record.tokenHash,
        OWNER_CAPABILITY_POLICY_VERSION,
        record.createdAt,
      )
      .run();
  }

  async findSession(
    sessionId: string,
  ): Promise<OwnerCapabilityRecord | undefined> {
    return fromRow(
      await this.database
        .prepare(
          `SELECT session_id AS resource_id, owner_token_hash AS token_hash,
                  created_at, revoked_at
           FROM session_capabilities
           WHERE session_id = ?`,
        )
        .bind(sessionId)
        .first<CapabilityRow>(),
    );
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<boolean> {
    const result = await this.database
      .prepare(
        `UPDATE session_capabilities
         SET revoked_at = ?
         WHERE session_id = ? AND revoked_at IS NULL
           AND NOT EXISTS (
             SELECT 1 FROM runner_jobs
             WHERE runner_jobs.session_id = session_capabilities.session_id
               AND runner_jobs.status IN (
                 'QUEUED', 'STARTING', 'RUNNING', 'AWAITING_APPROVAL',
                 'REPAIRING'
               )
           )`,
      )
      .bind(revokedAt, sessionId)
      .run();
    return (result.meta.changes ?? 0) > 0;
  }
}

export function createOwnerCapability(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
  return `cl_owner_${encoded}`;
}

export async function hashOwnerCapability(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export async function ownerCapabilityMatches(
  record: OwnerCapabilityRecord | undefined,
  token: string | undefined,
): Promise<boolean> {
  return (
    record?.revokedAt === undefined &&
    (await ownerCapabilityIdentifies(record, token))
  );
}

export async function ownerCapabilityIdentifies(
  record: OwnerCapabilityRecord | undefined,
  token: string | undefined,
): Promise<boolean> {
  if (
    record === undefined ||
    token === undefined ||
    !/^cl_owner_[A-Za-z0-9_-]{43}$/u.test(token)
  )
    return false;
  return constantTimeEqual(record.tokenHash, await hashOwnerCapability(token));
}
