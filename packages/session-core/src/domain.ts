import {
  assertTransition,
  EvidenceEventSchema,
  type BeliefTest,
  type EvidenceEvent as ContractEvidenceEvent,
  type PatchResult,
  type PredictionContract,
  type ProofBundle,
  type ReasoningDiff,
  type SessionState,
  type TransferResult,
  type VerifiedResultSet,
} from "@counterlab/contracts";

export type SessionMode = "instant" | "live" | "replay";

export type JsonRecord = Record<string, unknown>;

export interface CounterLabSession {
  id: string;
  artifactId: string;
  mode: SessionMode;
  state: SessionState;
  version: number;
  createdAt: string;
  updatedAt: string;
  beliefTest?: BeliefTest;
  prediction?: PredictionContract;
  labVerification?: unknown;
  verifiedResult?: VerifiedResultSet;
  revision?: string;
  transferResult?: TransferResult;
  patchResult?: PatchResult;
  reasoningDiff?: ReasoningDiff;
  proofBundle?: ProofBundle;
}

export type EvidenceActor =
  "learner" | "gpt-5.6" | "codex" | "verifier" | "kernel" | "system";

export type EvidenceEvent = ContractEvidenceEvent;

export interface EventDraft {
  actor: EvidenceActor;
  kind: string;
  payload: JsonRecord;
  inputHashes?: string[];
  outputHashes?: string[];
  modelId?: string;
  promptHash?: string;
  commitHash?: string;
  durationMs?: number;
  exitCode?: number;
}

export interface IdAndClock {
  id(prefix: string): string;
  now(): Date;
}

export class InvalidSessionTransitionError extends Error {
  readonly from: SessionState;
  readonly to: SessionState;

  constructor(from: SessionState, to: SessionState) {
    super(`Invalid transition from ${from} to ${to}`);
    this.name = "InvalidSessionTransitionError";
    this.from = from;
    this.to = to;
  }
}

export class PredictionAlreadyCommittedError extends Error {
  constructor(sessionId: string) {
    super(`Prediction is already committed for session ${sessionId}`);
    this.name = "PredictionAlreadyCommittedError";
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`);
    this.name = "SessionNotFoundError";
  }
}

export class SessionAlreadyExistsError extends Error {
  constructor(sessionId: string) {
    super(`Session already exists: ${sessionId}`);
    this.name = "SessionAlreadyExistsError";
  }
}

export class SessionInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionInputError";
  }
}

export function createSessionAggregate(input: {
  id: string;
  artifactId: string;
  mode: SessionMode;
  timestamp: string;
}): CounterLabSession {
  return {
    id: input.id,
    artifactId: input.artifactId,
    mode: input.mode,
    state: "INGESTED",
    version: 1,
    createdAt: input.timestamp,
    updatedAt: input.timestamp,
  };
}

export function evolveSession(
  current: CounterLabSession,
  to: SessionState,
  timestamp: string,
  patch: Partial<CounterLabSession> = {},
): CounterLabSession {
  try {
    assertTransition(current.state, to);
  } catch {
    throw new InvalidSessionTransitionError(current.state, to);
  }

  return {
    ...current,
    ...patch,
    id: current.id,
    artifactId: current.artifactId,
    mode: current.mode,
    state: to,
    version: current.version + 1,
    createdAt: current.createdAt,
    updatedAt: timestamp,
  };
}

export function reviseSession(
  current: CounterLabSession,
  timestamp: string,
  patch: Partial<CounterLabSession>,
): CounterLabSession {
  return {
    ...current,
    ...patch,
    id: current.id,
    artifactId: current.artifactId,
    mode: current.mode,
    state: current.state,
    version: current.version + 1,
    createdAt: current.createdAt,
    updatedAt: timestamp,
  };
}

export async function createEvidenceEvent(input: {
  sessionId: string;
  sequence: number;
  timestamp: string;
  eventId: string;
  previousEventHash?: string;
  draft: EventDraft;
}): Promise<EvidenceEvent> {
  const eventWithoutHash = {
    schemaVersion: "1" as const,
    eventId: input.eventId,
    sessionId: input.sessionId,
    sequence: input.sequence,
    timestamp: input.timestamp,
    actor: input.draft.actor,
    kind: input.draft.kind,
    inputHashes: input.draft.inputHashes ?? [],
    outputHashes: input.draft.outputHashes ?? [],
    payload: input.draft.payload,
    ...(input.draft.modelId === undefined
      ? {}
      : { modelId: input.draft.modelId }),
    ...(input.draft.promptHash === undefined
      ? {}
      : { promptHash: input.draft.promptHash }),
    ...(input.draft.commitHash === undefined
      ? {}
      : { commitHash: input.draft.commitHash }),
    ...(input.draft.durationMs === undefined
      ? {}
      : { durationMs: input.draft.durationMs }),
    ...(input.draft.exitCode === undefined
      ? {}
      : { exitCode: input.draft.exitCode }),
    ...(input.previousEventHash === undefined
      ? {}
      : { previousEventHash: input.previousEventHash }),
  };

  return EvidenceEventSchema.parse({
    ...eventWithoutHash,
    eventHash: await hashCanonical(eventWithoutHash),
  });
}

export async function hashCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalValue(item));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function asJsonRecord(value: unknown, label: string): JsonRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new SessionInputError(`${label} must be an object`);
  }
  return value as JsonRecord;
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new SessionInputError(`${field} must be a non-empty string`);
  }
  return value;
}
