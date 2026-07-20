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

export class OwnerCapabilityConflictError extends Error {
  constructor(resourceId: string) {
    super(`Owner capability conflict for resource ${resourceId}`);
    this.name = "OwnerCapabilityConflictError";
  }
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

function ownerCapabilityFromBytes(bytes: Uint8Array): string {
  const encoded = btoa(String.fromCharCode(...bytes))
    .replace(/\+/gu, "-")
    .replace(/\//gu, "_")
    .replace(/=+$/gu, "");
  return `cl_owner_${encoded}`;
}

export async function deriveRestartOwnerCapability(
  sourceCapability: string,
  restartedSessionId: string,
): Promise<string> {
  if (!/^cl_owner_[A-Za-z0-9_-]{43}$/u.test(sourceCapability)) {
    throw new Error("A valid source owner capability is required");
  }
  if (!/^session_restart_[a-f0-9]{64}$/u.test(restartedSessionId)) {
    throw new Error("A deterministic restarted session ID is required");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sourceCapability),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `counterlab.restart-owner-capability.v1\0${restartedSessionId}`,
    ),
  );
  return ownerCapabilityFromBytes(new Uint8Array(signature));
}

export async function deriveUploadOwnerCapability(
  serverSecret: string,
  uploadIdempotencyKey: string,
  artifactId: string,
  fileSha256: string,
): Promise<string> {
  if (serverSecret.trim().length < 32) {
    throw new Error(
      "Upload owner capability derivation requires a server secret",
    );
  }
  if (
    !/^upload_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_[a-f0-9]{64}$/u.test(
      uploadIdempotencyKey,
    )
  ) {
    throw new Error("A hash-bound upload idempotency key is required");
  }
  if (!/^artifact_[A-Za-z0-9_-]{8,96}$/u.test(artifactId)) {
    throw new Error("A valid artifact ID is required");
  }
  if (!/^[a-f0-9]{64}$/u.test(fileSha256)) {
    throw new Error("A full artifact SHA-256 is required");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(serverSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `counterlab.upload-owner-capability.v1\0${uploadIdempotencyKey}\0${artifactId}\0${fileSha256}`,
    ),
  );
  return ownerCapabilityFromBytes(new Uint8Array(signature));
}

function ownerCapabilityRecordsMatch(
  left: OwnerCapabilityRecord,
  right: OwnerCapabilityRecord,
): boolean {
  return (
    left.resourceId === right.resourceId &&
    left.tokenHash === right.tokenHash &&
    left.createdAt === right.createdAt &&
    left.revokedAt === undefined &&
    right.revokedAt === undefined
  );
}

export async function ensureArtifactOwnerCapability(
  repository: OwnerCapabilityRepository,
  record: OwnerCapabilityRecord,
): Promise<"created" | "existing"> {
  const existing = await repository.findArtifact(
    record.resourceId,
    record.tokenHash,
  );
  if (existing !== undefined) {
    if (!ownerCapabilityRecordsMatch(existing, record)) {
      throw new OwnerCapabilityConflictError(record.resourceId);
    }
    return "existing";
  }
  try {
    await repository.createArtifact(record);
    return "created";
  } catch (error) {
    const raced = await repository.findArtifact(
      record.resourceId,
      record.tokenHash,
    );
    if (raced === undefined) throw error;
    if (!ownerCapabilityRecordsMatch(raced, record)) {
      throw new OwnerCapabilityConflictError(record.resourceId);
    }
    return "existing";
  }
}

export async function ensureSessionOwnerCapability(
  repository: OwnerCapabilityRepository,
  record: OwnerCapabilityRecord,
): Promise<"created" | "existing"> {
  const existing = await repository.findSession(record.resourceId);
  if (existing !== undefined) {
    if (!ownerCapabilityRecordsMatch(existing, record)) {
      throw new OwnerCapabilityConflictError(record.resourceId);
    }
    return "existing";
  }
  try {
    await repository.createSession(record);
    return "created";
  } catch (error) {
    const raced = await repository.findSession(record.resourceId);
    if (raced === undefined) throw error;
    if (!ownerCapabilityRecordsMatch(raced, record)) {
      throw new OwnerCapabilityConflictError(record.resourceId);
    }
    return "existing";
  }
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
