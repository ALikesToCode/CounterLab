import { render, screen } from "@testing-library/react";
import type { EvidenceEvent, PublicCompilerEvent } from "@counterlab/contracts";
import { describe, expect, it, vi } from "vitest";

import { ProofConsole } from "./ProofConsole";
import type { StudioContext } from "./types";

const compilerStarted: PublicCompilerEvent = {
  schemaVersion: "1",
  eventId: "compiler_event_1",
  jobId: "job_compile_1",
  cursor: 1,
  at: "2026-07-19T10:00:00.000Z",
  kind: "job.started",
};

const digest = (character: string): string => character.repeat(64);

function evidenceEvent(
  sequence: number,
  kind: string,
  overrides: Partial<EvidenceEvent> = {},
): EvidenceEvent {
  return {
    schemaVersion: "1",
    eventId: `evidence_event_${sequence}`,
    sessionId: "session_1",
    sequence,
    timestamp: `2026-07-19T10:01:0${sequence}.000Z`,
    actor: "system",
    kind,
    inputHashes: [],
    outputHashes: [digest(sequence.toString(16))],
    payload: {},
    ...(sequence === 1
      ? {}
      : { previousEventHash: digest((sequence - 1).toString(16)) }),
    eventHash: digest(sequence.toString(16)),
    ...overrides,
  };
}

function context(overrides: Partial<StudioContext> = {}): StudioContext {
  return {
    mode: "live",
    stage: "live-compile",
    artifact: null,
    session: null,
    events: [compilerStarted],
    ...overrides,
  };
}

describe("ProofConsole", () => {
  it("derives mode, session, and proof chips from authoritative state", () => {
    render(
      <ProofConsole
        context={context({
          mode: "instant",
          session: {
            sessionId: "session_sample_1",
            artifactId: "artifact_sample_1",
            mode: { kind: "sample_lesson", sampleId: "leakage-01" },
            state: "PREDICTION_COMMITTED",
            version: 1,
            createdAt: "2026-07-21T10:00:00.000Z",
            updatedAt: "2026-07-21T10:00:00.000Z",
          },
          proofEventStatus: "ready",
        })}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    const state = screen.getByLabelText("Proof state");
    expect(state).toHaveTextContent("Verified sample");
    expect(state).toHaveTextContent("Prediction sealed");
    expect(state).toHaveTextContent("Stored chain loaded");
  });

  it("withholds proof surfaces when route and stored modes disagree", () => {
    render(
      <ProofConsole
        context={context({
          mode: "live",
          session: {
            sessionId: "session_sample_1",
            artifactId: "artifact_sample_1",
            mode: { kind: "sample_lesson", sampleId: "leakage-01" },
            state: "PREDICTION_COMMITTED",
            version: 1,
            createdAt: "2026-07-21T10:00:00.000Z",
            updatedAt: "2026-07-21T10:00:00.000Z",
          },
          evidenceEvents: [evidenceEvent(1, "session.created")],
          proofEventStatus: "ready",
        })}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(screen.getByLabelText("Proof state")).toHaveTextContent(
      "Mode mismatch",
    );
    expect(screen.getByText("Evidence withheld")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("1 chain event");
    expect(screen.getByRole("alert")).toHaveTextContent(
      /proof context does not match this learner mode/i,
    );
    expect(document.body).not.toHaveTextContent("session.created");
  });

  it("characterizes the existing browser-safe compiler activity view", () => {
    render(
      <ProofConsole
        context={context()}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/0 chain events · 1 runner event/),
    ).toBeInTheDocument();
    expect(screen.getByText("job.started")).toBeInTheDocument();
    expect(
      screen.getByText("Protected runner accepted the job"),
    ).toBeInTheDocument();
  });

  it("renders the canonical session chain separately from runner activity", () => {
    render(
      <ProofConsole
        context={context({
          evidenceEvents: [
            evidenceEvent(1, "session.created"),
            evidenceEvent(2, "prediction.committed", {
              actor: "learner",
              payload: { privateNote: "payload is not primary proof copy" },
            }),
          ],
          proofEventStatus: "ready",
          proofEventIssues: [],
        })}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(screen.getByText(/2 chain events/)).toBeInTheDocument();
    expect(screen.getByText(/1 runner event/)).toBeInTheDocument();
    const chain = screen.getByRole("region", {
      name: "Session event chain",
    });
    expect(chain).toHaveTextContent(
      /session\.created[\s\S]*prediction\.committed/,
    );
    expect(chain).toHaveTextContent("Sequence 2 · learner");
    expect(
      screen.getByRole("region", { name: "Runner activity" }),
    ).toHaveTextContent("job.started");
    expect(document.body).not.toHaveTextContent(
      "payload is not primary proof copy",
    );
  });

  it("shows honest loading and failed stored-chain states", () => {
    const view = render(
      <ProofConsole
        context={context({
          events: [],
          evidenceEvents: [],
          proofEventStatus: "loading",
          proofEventIssues: [],
        })}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      /loading the stored session event chain/i,
    );
    expect(document.body).not.toHaveTextContent(/will appear here/i);

    view.rerender(
      <ProofConsole
        context={context({
          events: [],
          evidenceEvents: [],
          proofEventStatus: "failed",
          proofEventIssues: [],
        })}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /stored session event chain is unavailable/i,
    );
    expect(document.body).not.toHaveTextContent(/0 events/i);
  });

  it("announces merge conflicts while retaining only validated records", () => {
    render(
      <ProofConsole
        context={context({
          evidenceEvents: [evidenceEvent(1, "session.created")],
          proofEventStatus: "ready",
          proofEventIssues: [
            {
              code: "EVIDENCE_SEQUENCE_CONFLICT",
              source: "stored-evidence",
              index: 1,
              cursor: "session_1:1",
              message: "A stored evidence sequence resolved to another event.",
            },
          ],
        })}
        open
        activeTab="Activity"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /conflicting proof activity was excluded/i,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "EVIDENCE_SEQUENCE_CONFLICT",
    );
    expect(screen.getByText("session.created")).toBeInTheDocument();
  });

  it("keeps session lifecycle and compiler detail separate on relevant tabs", () => {
    const command: PublicCompilerEvent = {
      ...compilerStarted,
      eventId: "compiler_event_2",
      cursor: 2,
      kind: "command.completed",
      label: "Run public checks",
      exitCode: 0,
      durationMs: 84,
      excerpt: "1 public check passed",
    };
    render(
      <ProofConsole
        context={context({
          events: [compilerStarted, command],
          evidenceEvents: [
            evidenceEvent(1, "session.created"),
            evidenceEvent(2, "experiment.completed", { actor: "kernel" }),
            evidenceEvent(3, "transfer.passed", { actor: "verifier" }),
          ],
          proofEventStatus: "ready",
          proofEventIssues: [],
        })}
        open
        activeTab="Tests"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Session event chain" }),
    ).toHaveTextContent(/experiment\.completed[\s\S]*transfer\.passed/);
    expect(
      screen.getByRole("region", { name: "Runner activity" }),
    ).toHaveTextContent("Run public checks · exit 0 · 84 ms");
    expect(document.body).not.toHaveTextContent("session.created");
  });

  it("does not imply that missing compiler detail will later be manufactured", () => {
    render(
      <ProofConsole
        context={context({
          events: [],
          evidenceEvents: [evidenceEvent(1, "session.created")],
          proofEventStatus: "ready",
          proofEventIssues: [],
        })}
        open
        activeTab="Plan"
        onToggle={vi.fn()}
        onTab={vi.fn()}
      />,
    );

    expect(screen.getByText(/no recorded plan evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing was inferred/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/will appear here/i);
  });
});
