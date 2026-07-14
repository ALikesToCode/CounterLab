import { describe, expect, it, vi } from "vitest";

import type { PublicCompilerEvent, SessionView } from "../api";
import { monitorRunnerJob } from "./useRunnerEvents";

const started: PublicCompilerEvent = {
  schemaVersion: "1",
  eventId: "event_1",
  jobId: "job_1",
  cursor: 1,
  at: "2026-07-15T00:00:00.000Z",
  kind: "job.started",
};

const liveSession = {
  sessionId: "session_1",
  artifactId: "artifact_1",
  mode: { kind: "live_notebook" },
  state: "LAB_COMPILING",
  version: 4,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:01.000Z",
} satisfies SessionView;

describe("monitorRunnerJob", () => {
  it("reconnects from the event cursor and returns only after session state advances", async () => {
    const api = {
      listRunnerEvents: vi
        .fn()
        .mockResolvedValueOnce({
          events: [started],
          nextCursor: 1,
          terminal: false,
        })
        .mockResolvedValueOnce({ events: [], nextCursor: 1, terminal: true }),
      getSession: vi
        .fn()
        .mockResolvedValueOnce(liveSession)
        .mockResolvedValueOnce({
          ...liveSession,
          state: "LAB_VERIFIED",
          version: 5,
        }),
    };
    const seen: PublicCompilerEvent[] = [];

    const completed = await monitorRunnerJob({
      sessionId: liveSession.sessionId,
      jobId: "job_1",
      terminalStates: ["LAB_VERIFIED", "LAB_REJECTED"],
      pollIntervalMs: 0,
      api,
      onEvents: (events) => seen.push(...events),
    });

    expect(completed.state).toBe("LAB_VERIFIED");
    expect(seen).toEqual([started]);
    expect(api.listRunnerEvents).toHaveBeenNthCalledWith(
      2,
      liveSession.sessionId,
      "job_1",
      1,
    );
  });

  it("fails closed when a terminal job has not authorized a requested state", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 0,
        terminal: true,
      }),
      getSession: vi.fn().mockResolvedValue(liveSession),
    };

    await expect(
      monitorRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_1",
        terminalStates: ["LAB_VERIFIED"],
        api,
      }),
    ).rejects.toMatchObject({ code: "RUNNER_TERMINATED", status: 409 });
  });
});
