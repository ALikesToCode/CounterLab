import type { EvidenceEvent, PublicCompilerEvent } from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import { mergeProofEventSources } from "./mergeProofEvents";

const digest = (character: string): string => character.repeat(64);

function evidenceEvent(
  sequence: number,
  overrides: Partial<EvidenceEvent> = {},
): EvidenceEvent {
  const eventHash = digest(sequence.toString(16));
  return {
    schemaVersion: "1",
    eventId: `evidence_${sequence}`,
    sessionId: "session_1",
    sequence,
    timestamp: `2026-07-19T10:00:0${sequence}.000Z`,
    actor: "system",
    kind: `session.event_${sequence}`,
    inputHashes: [],
    outputHashes: [eventHash],
    payload: { sequence },
    ...(sequence === 1
      ? {}
      : { previousEventHash: digest((sequence - 1).toString(16)) }),
    eventHash,
    ...overrides,
  };
}

function compilerEvent(
  jobId: string,
  cursor: number,
  overrides: Partial<PublicCompilerEvent> = {},
): PublicCompilerEvent {
  return {
    schemaVersion: "1",
    eventId: `${jobId}_event_${cursor}`,
    jobId,
    cursor,
    at: `2026-07-19T10:01:0${cursor}.000Z`,
    kind: "job.started",
    ...overrides,
  } as PublicCompilerEvent;
}

describe("mergeProofEventSources", () => {
  it("preserves the stored session chain and appends genuine stream events after recorded compiler events", () => {
    const storedEvidenceEvents = [evidenceEvent(1), evidenceEvent(2)];
    const recordedCompilerEvents = [
      compilerEvent("job_compile", 1),
      compilerEvent("job_compile", 2, {
        kind: "plan.summary",
        title: "Bounded plan",
        steps: ["Read approved evidence", "Emit typed plan"],
      }),
    ];
    const streamedCompilerEvents = [
      compilerEvent("job_compile", 3, {
        kind: "verifier.verified",
        invariantCount: 12,
        mutationCount: 8,
      }),
    ];

    const result = mergeProofEventSources({
      storedEvidenceEvents,
      recordedCompilerEvents,
      streamedCompilerEvents,
    });

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.evidenceEvents.map((event) => event.eventId)).toEqual([
      "evidence_1",
      "evidence_2",
    ]);
    expect(result.compilerEvents.map((event) => event.eventId)).toEqual([
      "job_compile_event_1",
      "job_compile_event_2",
      "job_compile_event_3",
    ]);
    expect(storedEvidenceEvents.map((event) => event.eventId)).toEqual([
      "evidence_1",
      "evidence_2",
    ]);
    expect(recordedCompilerEvents).toHaveLength(2);
  });

  it("deduplicates canonical compiler identities without changing recorded order", () => {
    const rejected = compilerEvent("job_compile", 2, {
      kind: "verifier.rejected",
      invariant: "one_variable_changed",
      observed: { model: "same", split: "rows" },
      expected: { split: "entities", model: "same" },
      counterexample: "The split did not match the deployment claim.",
    });
    const canonicalDuplicate = {
      schemaVersion: "1",
      eventId: rejected.eventId,
      jobId: rejected.jobId,
      cursor: rejected.cursor,
      at: rejected.at,
      kind: "verifier.rejected",
      invariant: "one_variable_changed",
      observed: { split: "rows", model: "same" },
      expected: { model: "same", split: "entities" },
      counterexample: "The split did not match the deployment claim.",
    };

    const result = mergeProofEventSources({
      recordedCompilerEvents: [compilerEvent("job_compile", 1), rejected],
      streamedCompilerEvents: [canonicalDuplicate],
    });

    expect(result.ok).toBe(true);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.compilerEvents.map((event) => event.eventId)).toEqual([
      "job_compile_event_1",
      "job_compile_event_2",
    ]);
  });

  it("allows independent job cursors and preserves their server arrival order", () => {
    const result = mergeProofEventSources({
      recordedCompilerEvents: [
        compilerEvent("job_compile", 4),
        compilerEvent("job_boundary", 1),
      ],
      streamedCompilerEvents: [
        compilerEvent("job_compile", 5),
        compilerEvent("job_patch", 1),
      ],
    });

    expect(result.ok).toBe(true);
    expect(
      result.compilerEvents.map((event) => `${event.jobId}:${event.cursor}`),
    ).toEqual([
      "job_compile:4",
      "job_boundary:1",
      "job_compile:5",
      "job_patch:1",
    ]);
  });

  it("treats compiler event IDs as globally unique across runner jobs", () => {
    const recorded = compilerEvent("job_compile", 1);
    const reusedId = compilerEvent("job_patch", 1, {
      eventId: recorded.eventId,
    });

    const result = mergeProofEventSources({
      recordedCompilerEvents: [recorded, reusedId],
    });

    expect(result.ok).toBe(false);
    expect(result.compilerEvents).toEqual([recorded]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "COMPILER_IDENTITY_CONFLICT",
        identity: recorded.eventId,
      }),
    ]);
  });

  it("flags and excludes an event-id collision with different content", () => {
    const recorded = compilerEvent("job_compile", 1);
    const conflict = compilerEvent("job_compile", 2, {
      eventId: recorded.eventId,
    });

    const result = mergeProofEventSources({
      recordedCompilerEvents: [recorded],
      streamedCompilerEvents: [conflict],
    });

    expect(result.ok).toBe(false);
    expect(result.compilerEvents).toEqual([recorded]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "COMPILER_IDENTITY_CONFLICT",
        source: "streamed-compiler",
        index: 0,
        identity: recorded.eventId,
      }),
    ]);
  });

  it("flags and excludes a cursor collision even when the event id differs", () => {
    const recorded = compilerEvent("job_compile", 1);
    const conflict = compilerEvent("job_compile", 1, {
      eventId: "another_event",
    });

    const result = mergeProofEventSources({
      recordedCompilerEvents: [recorded],
      streamedCompilerEvents: [conflict],
    });

    expect(result.ok).toBe(false);
    expect(result.compilerEvents).toEqual([recorded]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "COMPILER_CURSOR_CONFLICT",
        cursor: "job_compile:1",
      }),
    ]);
  });

  it("rejects a new compiler event that moves a job cursor backwards", () => {
    const result = mergeProofEventSources({
      recordedCompilerEvents: [compilerEvent("job_compile", 3)],
      streamedCompilerEvents: [compilerEvent("job_compile", 2)],
    });

    expect(result.ok).toBe(false);
    expect(result.compilerEvents).toHaveLength(1);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "COMPILER_CURSOR_REGRESSION",
        source: "streamed-compiler",
        cursor: "job_compile:2",
      }),
    ]);
  });

  it("deduplicates the stored evidence identity and sequence canonically", () => {
    const first = evidenceEvent(1, {
      payload: { nested: { alpha: 1, beta: 2 } },
    });
    const duplicate = {
      ...first,
      payload: { nested: { beta: 2, alpha: 1 } },
    };

    const result = mergeProofEventSources({
      storedEvidenceEvents: [first, duplicate],
    });

    expect(result.ok).toBe(true);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.evidenceEvents).toHaveLength(1);
    expect(result.evidenceEvents[0]?.eventId).toBe(first.eventId);
  });

  it("flags conflicting evidence identities and sequence cursors", () => {
    const first = evidenceEvent(1);
    const identityConflict = evidenceEvent(2, {
      eventId: first.eventId,
    });
    const sequenceConflict = evidenceEvent(1, {
      eventId: "different_event",
      eventHash: digest("e"),
      outputHashes: [digest("e")],
    });

    const result = mergeProofEventSources({
      storedEvidenceEvents: [first, identityConflict, sequenceConflict],
    });

    expect(result.ok).toBe(false);
    expect(result.evidenceEvents).toEqual([first]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "EVIDENCE_IDENTITY_CONFLICT",
      "EVIDENCE_SEQUENCE_CONFLICT",
    ]);
  });

  it("flags invalid browser event shapes without copying unvalidated payloads", () => {
    const invalidEvidence = {
      ...evidenceEvent(1),
      actor: "private-reasoning",
      payload: { secret: "must not be returned" },
    };
    const invalidCompiler = {
      ...compilerEvent("job_compile", 1),
      kind: "private.reasoning",
      transcript: "must not be returned",
    };

    const result = mergeProofEventSources({
      storedEvidenceEvents: [invalidEvidence],
      streamedCompilerEvents: [invalidCompiler],
    });

    expect(result.ok).toBe(false);
    expect(result.evidenceEvents).toEqual([]);
    expect(result.compilerEvents).toEqual([]);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "INVALID_EVIDENCE_EVENT",
      "INVALID_COMPILER_EVENT",
    ]);
    expect(JSON.stringify(result)).not.toContain("must not be returned");
  });

  it("flags out-of-order stored evidence instead of sorting the server chain", () => {
    const third = evidenceEvent(3, {
      previousEventHash: digest("1"),
    });
    const result = mergeProofEventSources({
      storedEvidenceEvents: [evidenceEvent(1), third, evidenceEvent(2)],
    });

    expect(result.ok).toBe(false);
    expect(result.evidenceEvents.map((event) => event.sequence)).toEqual([
      1, 3,
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "EVIDENCE_SEQUENCE_REGRESSION",
        source: "stored-evidence",
        index: 2,
      }),
    ]);
  });

  it("rejects a well-formed chain that belongs to another route session", () => {
    const result = mergeProofEventSources({
      expectedSessionId: "session_expected",
      storedEvidenceEvents: [evidenceEvent(1, { sessionId: "session_other" })],
    });

    expect(result.ok).toBe(false);
    expect(result.evidenceEvents).toEqual([]);
    expect(result.issues).toEqual([
      expect.objectContaining({
        code: "EVIDENCE_SESSION_CONFLICT",
        identity: "session_other:evidence_1",
      }),
    ]);
  });
});
