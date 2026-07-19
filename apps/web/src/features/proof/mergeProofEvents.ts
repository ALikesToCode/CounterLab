import {
  EvidenceEventSchema,
  PublicCompilerEventSchema,
  canonicalJsonV1,
  type EvidenceEvent,
  type PublicCompilerEvent,
} from "@counterlab/contracts";

export type ProofEventSource =
  "stored-evidence" | "recorded-compiler" | "streamed-compiler";

export type ProofEventMergeIssueCode =
  | "INVALID_EVIDENCE_EVENT"
  | "INVALID_COMPILER_EVENT"
  | "EVIDENCE_IDENTITY_CONFLICT"
  | "EVIDENCE_SEQUENCE_CONFLICT"
  | "EVIDENCE_HASH_CONFLICT"
  | "EVIDENCE_SESSION_CONFLICT"
  | "EVIDENCE_SEQUENCE_REGRESSION"
  | "COMPILER_IDENTITY_CONFLICT"
  | "COMPILER_CURSOR_CONFLICT"
  | "COMPILER_CURSOR_REGRESSION";

export type ProofEventMergeIssue = Readonly<{
  code: ProofEventMergeIssueCode;
  source: ProofEventSource;
  index: number;
  message: string;
  identity?: string;
  cursor?: string;
}>;

export type MergeProofEventSourcesInput = Readonly<{
  /** Session identity selected by the private route. */
  expectedSessionId?: string;
  /** Schema-validated, hash-bearing session events returned by GET /events. */
  storedEvidenceEvents?: readonly unknown[];
  /** Compiler events already recorded in a proof or replay payload. */
  recordedCompilerEvents?: readonly unknown[];
  /** Browser-safe compiler events received by the active runner monitor. */
  streamedCompilerEvents?: readonly unknown[];
}>;

export type MergeProofEventSourcesResult = Readonly<{
  ok: boolean;
  evidenceEvents: readonly EvidenceEvent[];
  compilerEvents: readonly PublicCompilerEvent[];
  issues: readonly ProofEventMergeIssue[];
  duplicatesRemoved: number;
}>;

type CanonicalEvent<T> = Readonly<{
  canonical: string;
  event: T;
}>;

export function evidenceEventIdentity(event: EvidenceEvent): string {
  return `${event.sessionId}:${event.eventId}`;
}

export function evidenceEventSequenceCursor(event: EvidenceEvent): string {
  return `${event.sessionId}:${event.sequence}`;
}

export function compilerEventIdentity(event: PublicCompilerEvent): string {
  return event.eventId;
}

export function compilerEventCursor(event: PublicCompilerEvent): string {
  return `${event.jobId}:${event.cursor}`;
}

function issue(
  issues: ProofEventMergeIssue[],
  value: ProofEventMergeIssue,
): void {
  issues.push(value);
}

function normalizeEvidenceEvents(
  candidates: readonly unknown[],
  issues: ProofEventMergeIssue[],
  expectedSessionId?: string,
): { events: EvidenceEvent[]; duplicatesRemoved: number } {
  const events: EvidenceEvent[] = [];
  const byIdentity = new Map<string, CanonicalEvent<EvidenceEvent>>();
  const bySequence = new Map<string, CanonicalEvent<EvidenceEvent>>();
  const byHash = new Map<string, CanonicalEvent<EvidenceEvent>>();
  let sessionId: string | undefined;
  let lastSequence: number | undefined;
  let duplicatesRemoved = 0;

  for (const [index, candidate] of candidates.entries()) {
    const parsed = EvidenceEventSchema.safeParse(candidate);
    if (!parsed.success) {
      issue(issues, {
        code: "INVALID_EVIDENCE_EVENT",
        source: "stored-evidence",
        index,
        message:
          "Stored session evidence did not match the public event schema.",
      });
      continue;
    }

    const event = parsed.data;
    const canonical = canonicalJsonV1(event);
    const identity = evidenceEventIdentity(event);
    const cursor = evidenceEventSequenceCursor(event);
    if (
      expectedSessionId !== undefined &&
      event.sessionId !== expectedSessionId
    ) {
      issue(issues, {
        code: "EVIDENCE_SESSION_CONFLICT",
        source: "stored-evidence",
        index,
        identity,
        cursor,
        message:
          "Stored session evidence did not belong to the active session.",
      });
      continue;
    }
    const identityMatch = byIdentity.get(identity);
    if (identityMatch !== undefined) {
      if (identityMatch.canonical === canonical) {
        duplicatesRemoved += 1;
      } else {
        issue(issues, {
          code: "EVIDENCE_IDENTITY_CONFLICT",
          source: "stored-evidence",
          index,
          identity,
          cursor,
          message: "A stored evidence identity resolved to different content.",
        });
      }
      continue;
    }

    const sequenceMatch = bySequence.get(cursor);
    if (sequenceMatch !== undefined) {
      issue(issues, {
        code: "EVIDENCE_SEQUENCE_CONFLICT",
        source: "stored-evidence",
        index,
        identity,
        cursor,
        message: "A stored evidence sequence resolved to another event.",
      });
      continue;
    }

    const hashMatch = byHash.get(event.eventHash);
    if (hashMatch !== undefined) {
      issue(issues, {
        code: "EVIDENCE_HASH_CONFLICT",
        source: "stored-evidence",
        index,
        identity,
        cursor,
        message: "A stored evidence hash resolved to another event.",
      });
      continue;
    }

    if (sessionId !== undefined && event.sessionId !== sessionId) {
      issue(issues, {
        code: "EVIDENCE_SESSION_CONFLICT",
        source: "stored-evidence",
        index,
        identity,
        cursor,
        message:
          "Stored session evidence contained an event from another session.",
      });
      continue;
    }

    if (lastSequence !== undefined && event.sequence <= lastSequence) {
      issue(issues, {
        code: "EVIDENCE_SEQUENCE_REGRESSION",
        source: "stored-evidence",
        index,
        identity,
        cursor,
        message:
          "Stored session evidence moved backwards and was not reordered.",
      });
      continue;
    }

    sessionId ??= event.sessionId;
    lastSequence = event.sequence;
    const normalized = { canonical, event };
    byIdentity.set(identity, normalized);
    bySequence.set(cursor, normalized);
    byHash.set(event.eventHash, normalized);
    events.push(event);
  }

  return { events, duplicatesRemoved };
}

function appendCompilerEvents(
  candidates: readonly unknown[],
  source: "recorded-compiler" | "streamed-compiler",
  events: PublicCompilerEvent[],
  byIdentity: Map<string, CanonicalEvent<PublicCompilerEvent>>,
  byCursor: Map<string, CanonicalEvent<PublicCompilerEvent>>,
  lastCursorByJob: Map<string, number>,
  issues: ProofEventMergeIssue[],
): number {
  let duplicatesRemoved = 0;

  for (const [index, candidate] of candidates.entries()) {
    const parsed = PublicCompilerEventSchema.safeParse(candidate);
    if (!parsed.success) {
      issue(issues, {
        code: "INVALID_COMPILER_EVENT",
        source,
        index,
        message:
          "Compiler activity did not match the browser-safe event schema.",
      });
      continue;
    }

    const event = parsed.data;
    const canonical = canonicalJsonV1(event);
    const identity = compilerEventIdentity(event);
    const cursor = compilerEventCursor(event);
    const identityMatch = byIdentity.get(identity);
    if (identityMatch !== undefined) {
      if (identityMatch.canonical === canonical) {
        duplicatesRemoved += 1;
      } else {
        issue(issues, {
          code: "COMPILER_IDENTITY_CONFLICT",
          source,
          index,
          identity,
          cursor,
          message: "A compiler event identity resolved to different content.",
        });
      }
      continue;
    }

    if (byCursor.has(cursor)) {
      issue(issues, {
        code: "COMPILER_CURSOR_CONFLICT",
        source,
        index,
        identity,
        cursor,
        message: "A compiler job cursor resolved to another event.",
      });
      continue;
    }

    const lastCursor = lastCursorByJob.get(event.jobId);
    if (lastCursor !== undefined && event.cursor <= lastCursor) {
      issue(issues, {
        code: "COMPILER_CURSOR_REGRESSION",
        source,
        index,
        identity,
        cursor,
        message:
          "A compiler event cursor moved backwards and was not reordered.",
      });
      continue;
    }

    const normalized = { canonical, event };
    byIdentity.set(identity, normalized);
    byCursor.set(cursor, normalized);
    lastCursorByJob.set(event.jobId, event.cursor);
    events.push(event);
  }

  return duplicatesRemoved;
}

/**
 * Keeps stored session evidence separate from the compiler activity stream.
 * Recorded compiler events retain server/proof order; only valid new streamed
 * events are appended. Conflicting or invalid candidates are reported and are
 * never copied into the result.
 */
export function mergeProofEventSources(
  input: MergeProofEventSourcesInput,
): MergeProofEventSourcesResult {
  const issues: ProofEventMergeIssue[] = [];
  const normalizedEvidence = normalizeEvidenceEvents(
    input.storedEvidenceEvents ?? [],
    issues,
    input.expectedSessionId,
  );
  const compilerEvents: PublicCompilerEvent[] = [];
  const byIdentity = new Map<string, CanonicalEvent<PublicCompilerEvent>>();
  const byCursor = new Map<string, CanonicalEvent<PublicCompilerEvent>>();
  const lastCursorByJob = new Map<string, number>();
  let duplicatesRemoved = normalizedEvidence.duplicatesRemoved;

  duplicatesRemoved += appendCompilerEvents(
    input.recordedCompilerEvents ?? [],
    "recorded-compiler",
    compilerEvents,
    byIdentity,
    byCursor,
    lastCursorByJob,
    issues,
  );
  duplicatesRemoved += appendCompilerEvents(
    input.streamedCompilerEvents ?? [],
    "streamed-compiler",
    compilerEvents,
    byIdentity,
    byCursor,
    lastCursorByJob,
    issues,
  );

  return {
    ok: issues.length === 0,
    evidenceEvents: normalizedEvidence.events,
    compilerEvents,
    issues,
    duplicatesRemoved,
  };
}
