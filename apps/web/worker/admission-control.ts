import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

export const ADMISSION_POLICY_VERSION = "counterlab-admission-v1" as const;

export type AdmissionKind = "upload" | "analyst" | "runner";

export type AdmissionDenialReason =
  | "CALLER_BUDGET"
  | "SESSION_BUDGET"
  | "GLOBAL_BUDGET"
  | "GLOBAL_BUSY"
  | "OPERATION_COLLISION";

export type AdmissionLeaseStatus =
  "none" | "acquired" | "already-active" | "reacquired";

export type AdmissionDecision =
  | {
      admitted: true;
      reused: boolean;
      leaseStatus: AdmissionLeaseStatus;
      leaseExpiresAt?: number | undefined;
    }
  | {
      admitted: false;
      reason: AdmissionDenialReason;
      retryAfterSeconds: number;
    };

export interface AdmissionRequest {
  policyVersion: typeof ADMISSION_POLICY_VERSION;
  kind: AdmissionKind;
  operationKey: string;
  callerKey: string;
  sessionKey?: string | undefined;
}

export interface AdmissionRelease {
  policyVersion: typeof ADMISSION_POLICY_VERSION;
  kind: AdmissionKind;
  operationKey: string;
}

export interface AdmissionControl {
  admit(input: AdmissionRequest): Promise<AdmissionDecision>;
  release(input: AdmissionRelease): Promise<void>;
}

type AdmissionPolicy = {
  windowMs: number;
  callerLimit: number;
  sessionLimit?: number;
  globalLimit: number;
  activeLimit?: number;
  leaseTtlMs?: number;
};

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * These limits leave room for a complete live judge journey while bounding
 * anonymous cost and retaining two Container slots for control-plane recovery.
 */
export const ADMISSION_POLICIES: Readonly<
  Record<AdmissionKind, AdmissionPolicy>
> = {
  upload: {
    windowMs: 10 * MINUTE_MS,
    callerLimit: 6,
    globalLimit: 240,
  },
  analyst: {
    windowMs: HOUR_MS,
    callerLimit: 12,
    sessionLimit: 6,
    globalLimit: 300,
    activeLimit: 16,
    leaseTtlMs: 2 * MINUTE_MS,
  },
  runner: {
    windowMs: HOUR_MS,
    callerLimit: 40,
    sessionLimit: 24,
    globalLimit: 300,
    activeLimit: 8,
    leaseTtlMs: 15 * MINUTE_MS,
  },
};

const OpaqueKeySchema = z.string().regex(/^[a-f0-9]{64}$/u);
const AdmissionRequestSchema = z
  .object({
    policyVersion: z.literal(ADMISSION_POLICY_VERSION),
    kind: z.enum(["upload", "analyst", "runner"]),
    operationKey: OpaqueKeySchema,
    callerKey: OpaqueKeySchema,
    sessionKey: OpaqueKeySchema.optional(),
  })
  .strict();
const AdmissionReleaseSchema = AdmissionRequestSchema.pick({
  policyVersion: true,
  kind: true,
  operationKey: true,
}).strict();

const AdmissionOperationSchema = z
  .object({
    kind: z.enum(["upload", "analyst", "runner"]),
    callerKey: OpaqueKeySchema,
    sessionKey: OpaqueKeySchema.optional(),
    admittedAt: z.number().int().nonnegative(),
    leaseExpiresAt: z.number().int().positive().optional(),
  })
  .strict();

const AdmissionMetricSchema = z
  .object({
    accepted: z.number().int().nonnegative(),
    reused: z.number().int().nonnegative(),
    released: z.number().int().nonnegative(),
    denied: z.record(z.string(), z.number().int().nonnegative()),
  })
  .strict();

const AdmissionSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1"),
    operations: z.record(OpaqueKeySchema, AdmissionOperationSchema),
    metrics: z.record(
      z.enum(["upload", "analyst", "runner"]),
      AdmissionMetricSchema,
    ),
  })
  .strict();

export type AdmissionSnapshot = z.infer<typeof AdmissionSnapshotSchema>;

function emptyMetric(): z.infer<typeof AdmissionMetricSchema> {
  return { accepted: 0, reused: 0, released: 0, denied: {} };
}

export function emptyAdmissionSnapshot(): AdmissionSnapshot {
  return {
    schemaVersion: "1",
    operations: {},
    metrics: {
      upload: emptyMetric(),
      analyst: emptyMetric(),
      runner: emptyMetric(),
    },
  };
}

function withMetric(
  snapshot: AdmissionSnapshot,
  kind: AdmissionKind,
  metric: "accepted" | "reused" | "released",
): AdmissionSnapshot {
  const current = snapshot.metrics[kind];
  return {
    ...snapshot,
    metrics: {
      ...snapshot.metrics,
      [kind]: { ...current, [metric]: current[metric] + 1 },
    },
  };
}

function withDenialMetric(
  snapshot: AdmissionSnapshot,
  kind: AdmissionKind,
  reason: AdmissionDenialReason,
): AdmissionSnapshot {
  const current = snapshot.metrics[kind];
  return {
    ...snapshot,
    metrics: {
      ...snapshot.metrics,
      [kind]: {
        ...current,
        denied: {
          ...current.denied,
          [reason]: (current.denied[reason] ?? 0) + 1,
        },
      },
    },
  };
}

function withoutExpiredOperations(
  snapshot: AdmissionSnapshot,
  now: number,
): AdmissionSnapshot {
  const operations = Object.fromEntries(
    Object.entries(snapshot.operations)
      .filter(([, operation]) => {
        const policy = ADMISSION_POLICIES[operation.kind];
        return operation.admittedAt + policy.windowMs > now;
      })
      .map(([key, operation]) => {
        if (
          operation.leaseExpiresAt !== undefined &&
          operation.leaseExpiresAt <= now
        ) {
          const { leaseExpiresAt: _expired, ...released } = operation;
          return [key, released] as const;
        }
        return [key, operation] as const;
      }),
  );
  return { ...snapshot, operations };
}

function matchingOperations(
  snapshot: AdmissionSnapshot,
  kind: AdmissionKind,
): Array<AdmissionSnapshot["operations"][string]> {
  return Object.values(snapshot.operations).filter(
    (operation) => operation.kind === kind,
  );
}

function retryAfterWindowSeconds(
  operations: Array<AdmissionSnapshot["operations"][string]>,
  windowMs: number,
  now: number,
): number {
  const earliest = Math.min(
    ...operations.map((operation) => operation.admittedAt + windowMs),
  );
  return Math.max(1, Math.ceil((earliest - now) / 1_000));
}

function retryAfterLeaseSeconds(
  operations: Array<AdmissionSnapshot["operations"][string]>,
  now: number,
): number {
  const earliest = Math.min(
    ...operations.flatMap((operation) =>
      operation.leaseExpiresAt === undefined ? [] : [operation.leaseExpiresAt],
    ),
  );
  return Number.isFinite(earliest)
    ? Math.max(1, Math.ceil((earliest - now) / 1_000))
    : 1;
}

function denial(
  snapshot: AdmissionSnapshot,
  input: AdmissionRequest,
  reason: AdmissionDenialReason,
  retryAfterSeconds: number,
): { snapshot: AdmissionSnapshot; decision: AdmissionDecision } {
  return {
    snapshot: withDenialMetric(snapshot, input.kind, reason),
    decision: {
      admitted: false,
      reason,
      retryAfterSeconds: Math.max(1, retryAfterSeconds),
    },
  };
}

function activeOperations(
  operations: Array<AdmissionSnapshot["operations"][string]>,
  now: number,
): Array<AdmissionSnapshot["operations"][string]> {
  return operations.filter(
    (operation) =>
      operation.leaseExpiresAt !== undefined && operation.leaseExpiresAt > now,
  );
}

export function evaluateAdmissionRequest(
  rawSnapshot: AdmissionSnapshot,
  rawInput: AdmissionRequest,
  now: number,
): { snapshot: AdmissionSnapshot; decision: AdmissionDecision } {
  const input = AdmissionRequestSchema.parse(rawInput);
  let snapshot = withoutExpiredOperations(
    AdmissionSnapshotSchema.parse(rawSnapshot),
    now,
  );
  const policy = ADMISSION_POLICIES[input.kind];
  const existing = snapshot.operations[input.operationKey];

  if (existing !== undefined) {
    if (
      existing.kind !== input.kind ||
      existing.callerKey !== input.callerKey ||
      existing.sessionKey !== input.sessionKey
    ) {
      return denial(snapshot, input, "OPERATION_COLLISION", 60);
    }
    snapshot = withMetric(snapshot, input.kind, "reused");
    if (policy.leaseTtlMs === undefined) {
      return {
        snapshot,
        decision: { admitted: true, reused: true, leaseStatus: "none" },
      };
    }
    if (
      existing.leaseExpiresAt !== undefined &&
      existing.leaseExpiresAt > now
    ) {
      return {
        snapshot,
        decision: {
          admitted: true,
          reused: true,
          leaseStatus: "already-active",
          leaseExpiresAt: existing.leaseExpiresAt,
        },
      };
    }
    const active = activeOperations(
      matchingOperations(snapshot, input.kind),
      now,
    );
    if (
      policy.activeLimit !== undefined &&
      active.length >= policy.activeLimit
    ) {
      return denial(
        snapshot,
        input,
        "GLOBAL_BUSY",
        retryAfterLeaseSeconds(active, now),
      );
    }
    const leaseExpiresAt = now + policy.leaseTtlMs;
    snapshot = {
      ...snapshot,
      operations: {
        ...snapshot.operations,
        [input.operationKey]: { ...existing, leaseExpiresAt },
      },
    };
    return {
      snapshot,
      decision: {
        admitted: true,
        reused: true,
        leaseStatus: "reacquired",
        leaseExpiresAt,
      },
    };
  }

  const sameKind = matchingOperations(snapshot, input.kind);
  const callerOperations = sameKind.filter(
    (operation) => operation.callerKey === input.callerKey,
  );
  if (callerOperations.length >= policy.callerLimit) {
    return denial(
      snapshot,
      input,
      "CALLER_BUDGET",
      retryAfterWindowSeconds(callerOperations, policy.windowMs, now),
    );
  }

  if (policy.sessionLimit !== undefined && input.sessionKey !== undefined) {
    const sessionOperations = sameKind.filter(
      (operation) => operation.sessionKey === input.sessionKey,
    );
    if (sessionOperations.length >= policy.sessionLimit) {
      return denial(
        snapshot,
        input,
        "SESSION_BUDGET",
        retryAfterWindowSeconds(sessionOperations, policy.windowMs, now),
      );
    }
  }

  if (sameKind.length >= policy.globalLimit) {
    return denial(
      snapshot,
      input,
      "GLOBAL_BUDGET",
      retryAfterWindowSeconds(sameKind, policy.windowMs, now),
    );
  }

  const active = activeOperations(sameKind, now);
  if (policy.activeLimit !== undefined && active.length >= policy.activeLimit) {
    return denial(
      snapshot,
      input,
      "GLOBAL_BUSY",
      retryAfterLeaseSeconds(active, now),
    );
  }

  const leaseExpiresAt =
    policy.leaseTtlMs === undefined ? undefined : now + policy.leaseTtlMs;
  snapshot = {
    ...snapshot,
    operations: {
      ...snapshot.operations,
      [input.operationKey]: {
        kind: input.kind,
        callerKey: input.callerKey,
        ...(input.sessionKey === undefined
          ? {}
          : { sessionKey: input.sessionKey }),
        admittedAt: now,
        ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt }),
      },
    },
  };
  snapshot = withMetric(snapshot, input.kind, "accepted");
  return {
    snapshot,
    decision: {
      admitted: true,
      reused: false,
      leaseStatus: leaseExpiresAt === undefined ? "none" : "acquired",
      ...(leaseExpiresAt === undefined ? {} : { leaseExpiresAt }),
    },
  };
}

export function evaluateAdmissionRelease(
  rawSnapshot: AdmissionSnapshot,
  rawInput: AdmissionRelease,
  now: number,
): AdmissionSnapshot {
  const input = AdmissionReleaseSchema.parse(rawInput);
  let snapshot = withoutExpiredOperations(
    AdmissionSnapshotSchema.parse(rawSnapshot),
    now,
  );
  const existing = snapshot.operations[input.operationKey];
  if (
    existing === undefined ||
    existing.kind !== input.kind ||
    existing.leaseExpiresAt === undefined
  ) {
    return snapshot;
  }
  const { leaseExpiresAt: _released, ...operation } = existing;
  snapshot = {
    ...snapshot,
    operations: { ...snapshot.operations, [input.operationKey]: operation },
  };
  return withMetric(snapshot, input.kind, "released");
}

export function nextAdmissionAlarmAt(
  snapshot: AdmissionSnapshot,
): number | undefined {
  const leases = Object.values(snapshot.operations).flatMap((operation) =>
    operation.leaseExpiresAt === undefined ? [] : [operation.leaseExpiresAt],
  );
  return leases.length === 0 ? undefined : Math.min(...leases);
}

type AdmissionMutation =
  | { action: "admit"; input: AdmissionRequest }
  | { action: "release"; input: AdmissionRelease };

const AdmissionMutationSchema = z.discriminatedUnion("action", [
  z
    .object({ action: z.literal("admit"), input: AdmissionRequestSchema })
    .strict(),
  z
    .object({ action: z.literal("release"), input: AdmissionReleaseSchema })
    .strict(),
]);

const SNAPSHOT_KEY = "admission-ledger-v1";

export class CounterLabAdmission extends DurableObject<Env> {
  private async mutate(mutation: AdmissionMutation): Promise<{
    decision?: AdmissionDecision;
    snapshot: AdmissionSnapshot;
  }> {
    const now = Date.now();
    return this.ctx.storage.transaction(async (transaction) => {
      const stored =
        (await transaction.get<AdmissionSnapshot>(SNAPSHOT_KEY)) ??
        emptyAdmissionSnapshot();
      if (mutation.action === "admit") {
        const evaluated = evaluateAdmissionRequest(stored, mutation.input, now);
        await transaction.put(SNAPSHOT_KEY, evaluated.snapshot);
        return { decision: evaluated.decision, snapshot: evaluated.snapshot };
      }
      const snapshot = evaluateAdmissionRelease(stored, mutation.input, now);
      await transaction.put(SNAPSHOT_KEY, snapshot);
      return { snapshot };
    });
  }

  private async schedule(snapshot: AdmissionSnapshot): Promise<void> {
    const next = nextAdmissionAlarmAt(snapshot);
    if (next !== undefined) await this.ctx.storage.setAlarm(next);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST") {
      return Response.json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
    }
    let mutation: AdmissionMutation;
    try {
      mutation = AdmissionMutationSchema.parse(await request.json());
    } catch {
      return Response.json(
        { error: "INVALID_ADMISSION_REQUEST" },
        { status: 400 },
      );
    }
    const result = await this.mutate(mutation);
    await this.schedule(result.snapshot);
    return Response.json(
      mutation.action === "admit" ? result.decision : { released: true },
    );
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    const snapshot = await this.ctx.storage.transaction(async (transaction) => {
      const stored =
        (await transaction.get<AdmissionSnapshot>(SNAPSHOT_KEY)) ??
        emptyAdmissionSnapshot();
      const current = withoutExpiredOperations(
        AdmissionSnapshotSchema.parse(stored),
        now,
      );
      await transaction.put(SNAPSHOT_KEY, current);
      return current;
    });
    await this.schedule(snapshot);
  }
}

type AdmissionStub = { fetch(request: Request): Promise<Response> };
export type AdmissionNamespace = {
  getByName(name: string): AdmissionStub;
};

const AdmissionDecisionSchema = z.union([
  z
    .object({
      admitted: z.literal(true),
      reused: z.boolean(),
      leaseStatus: z.enum(["none", "acquired", "already-active", "reacquired"]),
      leaseExpiresAt: z.number().int().positive().optional(),
    })
    .strict(),
  z
    .object({
      admitted: z.literal(false),
      reason: z.enum([
        "CALLER_BUDGET",
        "SESSION_BUDGET",
        "GLOBAL_BUDGET",
        "GLOBAL_BUSY",
        "OPERATION_COLLISION",
      ]),
      retryAfterSeconds: z.number().int().positive(),
    })
    .strict(),
]);

export class DurableObjectAdmissionControl implements AdmissionControl {
  constructor(private readonly namespace: AdmissionNamespace) {}

  private stub(): AdmissionStub {
    return this.namespace.getByName("counterlab-global-admission-v1");
  }

  async admit(input: AdmissionRequest): Promise<AdmissionDecision> {
    const response = await this.stub().fetch(
      new Request("https://counterlab-admission.internal/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "admit", input }),
      }),
    );
    if (!response.ok)
      throw new Error("Admission coordinator rejected its control request");
    return AdmissionDecisionSchema.parse(await response.json());
  }

  async release(input: AdmissionRelease): Promise<void> {
    const response = await this.stub().fetch(
      new Request("https://counterlab-admission.internal/mutate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "release", input }),
      }),
    );
    if (!response.ok)
      throw new Error("Admission coordinator rejected its release request");
  }
}

export async function hmacAdmissionKey(
  secret: string,
  scope: "caller" | "session" | "operation",
  value: string,
): Promise<string> {
  if (secret.trim().length < 32) {
    throw new Error(
      "CounterLab admission HMAC key must contain at least 32 characters",
    );
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(
      `${ADMISSION_POLICY_VERSION}\u0000${scope}\u0000${value}`,
    ),
  );
  return Array.from(new Uint8Array(signature), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function trustedAdmissionCaller(request: Request): string {
  const cloudflareRequest = request as Request & { cf?: unknown };
  if (cloudflareRequest.cf === undefined) return "anonymous-untrusted-edge";
  const address = request.headers.get("cf-connecting-ip")?.trim();
  return address !== undefined && address.length > 0 && address.length <= 64
    ? address
    : "anonymous-cloudflare-edge";
}
