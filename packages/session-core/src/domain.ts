import {
  assertTransition,
  type EvidenceVerdict,
  EvidenceVerdictSchema,
  EvidenceEventSchema,
  HostedExperimentLineageV5Schema,
  HostedVerifiedResultSetV2Schema,
  type BeliefSpecV2,
  type BeliefTest,
  type EvidenceEvent as ContractEvidenceEvent,
  type HostedLabLineage,
  type HostedVerifiedResultSetV2,
  type PatchResult,
  type PredictionContract,
  type ProofBundle,
  type ReasoningDiff,
  type SessionState,
  SessionModeSchema,
  type SessionMode as ContractSessionMode,
  type TransferResult,
  type VerifiedResultSet,
} from "@counterlab/contracts";

export type SessionMode = ContractSessionMode;

export function normalizeSessionMode(value: unknown): SessionMode {
  if (value === "instant") {
    return { kind: "sample_lesson", sampleId: "leakage-01" };
  }
  if (value === "live") return { kind: "live_notebook" };
  if (value === "replay") {
    return { kind: "verified_replay", replayId: "leakage-01" };
  }
  return SessionModeSchema.parse(value);
}

export function normalizeSessionAggregate(
  value: Omit<CounterLabSession, "mode"> & { mode: unknown },
): CounterLabSession {
  return { ...value, mode: normalizeSessionMode(value.mode) };
}

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
  beliefSpec?: BeliefSpecV2;
  prediction?: PredictionContract;
  labVerification?: unknown;
  verifiedResult?: VerifiedResultSet;
  evidenceVerdict?: EvidenceVerdict;
  epistemicReportHash?: string;
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

export type SessionBeliefAuthority = BeliefTest | BeliefSpecV2;

type ReleasableEvidenceVerdict = Exclude<EvidenceVerdict, { kind: "REJECTED" }>;
type RejectedEvidenceVerdict = Extract<EvidenceVerdict, { kind: "REJECTED" }>;
type ScientificLineageV5 = Extract<
  HostedLabLineage,
  { source: "hosted-experiment-ir-v5" }
>;

export type SessionEvidenceAuthority =
  | {
      protocol: "legacy";
      verdict: "LEGACY_VERIFIED";
      concept: BeliefTest["concept"];
      beliefTest: BeliefTest;
      result: VerifiedResultSet;
    }
  | {
      protocol: "v5";
      verdict: "SUPPORTS" | "INCONCLUSIVE";
      concept: BeliefSpecV2["concept"];
      beliefSpec: BeliefSpecV2;
      prediction: PredictionContract;
      result: HostedVerifiedResultSetV2;
      evidenceVerdict: ReleasableEvidenceVerdict;
      epistemicReportHash: string;
      lineage: ScientificLineageV5;
    }
  | {
      protocol: "v5";
      verdict: "REJECTED";
      concept: BeliefSpecV2["concept"];
      beliefSpec: BeliefSpecV2;
      prediction: PredictionContract;
      evidenceVerdict: RejectedEvidenceVerdict;
      epistemicReportHash: string;
      lineage: ScientificLineageV5;
    };

export function getSessionBeliefAuthority(
  session: CounterLabSession,
): SessionBeliefAuthority | undefined {
  if (session.beliefTest !== undefined && session.beliefSpec !== undefined) {
    throw new SessionInputError(
      "A session cannot contain both a v1 Belief Test and a v2 Belief Spec",
    );
  }
  return session.beliefSpec ?? session.beliefTest;
}

/**
 * Resolves the evidence that is allowed to drive revision, transfer, and
 * repair. Persisted aggregates are treated as untrusted: every v5 hash and
 * authority boundary is checked again before a downstream transition.
 */
export async function resolveSessionEvidenceAuthority(
  session: CounterLabSession,
): Promise<SessionEvidenceAuthority> {
  if (session.beliefTest !== undefined && session.beliefSpec !== undefined) {
    throw new SessionInputError(
      "Evidence authority mismatch: a session cannot mix Belief Test v1 and Belief Spec v2",
    );
  }

  if (session.beliefSpec === undefined) {
    if (
      session.evidenceVerdict !== undefined ||
      session.epistemicReportHash !== undefined ||
      HostedExperimentLineageV5Schema.safeParse(session.labVerification).success
    ) {
      throw new SessionInputError(
        "Evidence authority mismatch: scientific v5 evidence requires Belief Spec v2",
      );
    }
    if (
      session.beliefTest === undefined ||
      session.verifiedResult === undefined
    ) {
      throw new SessionInputError(
        "Evidence authority required before this learning step",
      );
    }
    if (session.verifiedResult.concept !== session.beliefTest.concept) {
      throw new SessionInputError(
        "Evidence authority mismatch: legacy result concept does not match Belief Test v1",
      );
    }
    return {
      protocol: "legacy",
      verdict: "LEGACY_VERIFIED",
      concept: session.beliefTest.concept,
      beliefTest: session.beliefTest,
      result: session.verifiedResult,
    };
  }

  const beliefSpec = session.beliefSpec;
  if (
    beliefSpec.learnerDecision !== "CONFIRMED" &&
    beliefSpec.learnerDecision !== "ALTERNATIVE_SELECTED"
  ) {
    throw new SessionInputError(
      "Evidence authority mismatch: Belief Spec v2 must be learner-confirmed",
    );
  }
  if (session.prediction === undefined) {
    throw new SessionInputError(
      "Evidence authority mismatch: v5 evidence requires an immutable prediction",
    );
  }
  const prediction = session.prediction;
  if (
    prediction.sessionId !== session.id ||
    prediction.beliefTestId !== beliefSpec.id
  ) {
    throw new SessionInputError(
      "Evidence authority mismatch: prediction does not resolve to this Belief Spec v2 session",
    );
  }

  const lineage = HostedExperimentLineageV5Schema.safeParse(
    session.labVerification,
  );
  if (!lineage.success) {
    throw new SessionInputError(
      "Evidence authority mismatch: verified Experiment IR v5 lineage is required",
    );
  }
  if (lineage.data.beliefSpecHash !== (await hashCanonical(beliefSpec))) {
    throw new SessionInputError(
      "Evidence authority mismatch: Belief Spec v2 hash does not match compile lineage",
    );
  }
  if (lineage.data.predictionHash !== prediction.immutableHash) {
    throw new SessionInputError(
      "Evidence authority mismatch: Prediction Contract hash does not match compile lineage",
    );
  }

  const verdict = EvidenceVerdictSchema.safeParse(session.evidenceVerdict);
  if (!verdict.success) {
    throw new SessionInputError(
      "Evidence authority mismatch: a schema-valid Evidence Verdict is required",
    );
  }
  const epistemicReportHash = requireSha256(
    session.epistemicReportHash,
    "epistemicReportHash",
  );
  if (verdict.data.irHash !== lineage.data.selectedExperimentIrHash) {
    throw new SessionInputError(
      "Evidence authority mismatch: Evidence Verdict IR hash does not match the selected experiment",
    );
  }

  if (verdict.data.kind === "REJECTED") {
    if (session.verifiedResult !== undefined) {
      throw new SessionInputError(
        "Evidence authority mismatch: rejected evidence cannot release a result",
      );
    }
    return {
      protocol: "v5",
      verdict: "REJECTED",
      concept: beliefSpec.concept,
      beliefSpec,
      prediction,
      evidenceVerdict: verdict.data,
      epistemicReportHash,
      lineage: lineage.data,
    };
  }

  const result = HostedVerifiedResultSetV2Schema.safeParse(
    session.verifiedResult,
  );
  if (!result.success) {
    throw new SessionInputError(
      "Evidence authority mismatch: a hosted fixed-kernel result is required",
    );
  }
  if (result.data.sessionId !== session.id) {
    throw new SessionInputError(
      "Evidence authority mismatch: result session does not match",
    );
  }
  if (result.data.concept !== beliefSpec.concept) {
    throw new SessionInputError(
      "Evidence authority mismatch: result concept does not match Belief Spec v2",
    );
  }
  if (result.data.artifactManifestHash !== lineage.data.artifactManifestHash) {
    throw new SessionInputError(
      "Evidence authority mismatch: result artifact manifest does not match compile lineage",
    );
  }
  if (verdict.data.resultHash !== result.data.resultHash) {
    throw new SessionInputError(
      "Evidence authority mismatch: Evidence Verdict result hash does not match the fixed result",
    );
  }

  return {
    protocol: "v5",
    verdict: verdict.data.kind,
    concept: beliefSpec.concept,
    beliefSpec,
    prediction,
    result: result.data,
    evidenceVerdict: verdict.data,
    epistemicReportHash,
    lineage: lineage.data,
  };
}

export async function sessionEvidenceInputHashes(
  authority: SessionEvidenceAuthority,
): Promise<string[]> {
  if (authority.protocol === "legacy") {
    return [
      authority.result.resultHash,
      await hashCanonical(authority.beliefTest),
      await hashCanonical(authority.result),
    ];
  }
  return [
    ...new Set([
      authority.lineage.beliefSpecHash,
      authority.lineage.predictionHash,
      authority.lineage.selectedExperimentIrHash,
      authority.evidenceVerdict.technicalReportHash,
      authority.epistemicReportHash,
      ...(authority.verdict === "REJECTED"
        ? []
        : [authority.result.resultHash]),
      await hashCanonical(authority.evidenceVerdict),
      await hashCanonical(authority.lineage),
    ]),
  ];
}

function requireSha256(value: unknown, field: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new SessionInputError(
      `Evidence authority mismatch: ${field} must be a lowercase SHA-256 digest`,
    );
  }
  return value;
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
    mode: SessionModeSchema.parse(input.mode),
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
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new WeakSet<object>()));
}

type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function canonicalValue(
  value: unknown,
  ancestors: WeakSet<object>,
): CanonicalValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON does not support non-finite numbers");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new TypeError("canonical JSON does not support cyclic values");
    }
    ancestors.add(value);
    const normalized: CanonicalValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new TypeError("canonical JSON does not support sparse arrays");
      }
      normalized.push(canonicalValue(value[index], ancestors));
    }
    ancestors.delete(value);
    return normalized;
  }
  if (typeof value === "object") {
    const object = value as object;
    const prototype = Object.getPrototypeOf(object);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("canonical JSON supports only plain objects");
    }
    if (ancestors.has(object)) {
      throw new TypeError("canonical JSON does not support cyclic values");
    }
    ancestors.add(object);
    const normalized = Object.create(null) as Record<string, CanonicalValue>;
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = canonicalValue(
        (value as Record<string, unknown>)[key],
        ancestors,
      );
    }
    ancestors.delete(object);
    return normalized;
  }
  throw new TypeError(`canonical JSON does not support ${typeof value} values`);
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
