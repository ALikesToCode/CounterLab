import { describe, expect, it, vi } from "vitest";

import type { PublicCompilerEvent, SessionView } from "../api";
import {
  monitorRunnerJob,
  monitorStandaloneRunnerJob,
} from "./useRunnerEvents";

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

  it("reconciles a verified job before the session projection catches up", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 4,
        terminal: true,
        jobStatus: "VERIFIED" as const,
      }),
      getSession: vi
        .fn()
        .mockResolvedValueOnce(liveSession)
        .mockResolvedValueOnce({
          ...liveSession,
          state: "LAB_VERIFIED",
          version: 5,
        }),
    };

    await expect(
      monitorRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_1",
        terminalStates: ["LAB_VERIFIED"],
        pollIntervalMs: 0,
        api,
      }),
    ).resolves.toMatchObject({ state: "LAB_VERIFIED", version: 5 });
    expect(api.getSession).toHaveBeenCalledTimes(2);
  });

  it("fails closed when a verified job never reaches the session projection", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 4,
        terminal: true,
        jobStatus: "VERIFIED" as const,
      }),
      getSession: vi.fn().mockResolvedValue(liveSession),
    };

    await expect(
      monitorRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_1",
        terminalStates: ["LAB_VERIFIED"],
        pollIntervalMs: 0,
        terminalProjectionGracePolls: 1,
        api,
      }),
    ).rejects.toMatchObject({
      code: "RUNNER_SESSION_PROJECTION_TIMEOUT",
      retryable: true,
      status: 409,
    });
    expect(api.getSession).toHaveBeenCalledTimes(2);
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

  it("surfaces the persisted control-plane failure for a timed-out session job", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 0,
        terminal: true,
        jobStatus: "TIMED_OUT" as const,
        jobError: {
          code: "RUNNER_JOB_TIMED_OUT",
          message: "Runner job exceeded its deadline",
          retryable: true,
        },
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
    ).rejects.toMatchObject({
      code: "RUNNER_JOB_TIMED_OUT",
      status: 504,
    });
  });

  it("surfaces the job failure after the session projects LAB_REJECTED", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 1,
        terminal: true,
        jobStatus: "FAILED" as const,
        jobError: {
          code: "CODEX_PROCESS_EXITED",
          message: "Codex App Server could not complete the bounded Plan job.",
          retryable: true,
        },
      }),
      getSession: vi.fn().mockResolvedValue({
        ...liveSession,
        state: "LAB_REJECTED" as const,
        version: 5,
      }),
    };

    await expect(
      monitorRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_1",
        terminalStates: ["LAB_VERIFIED", "LAB_REJECTED"],
        api,
      }),
    ).rejects.toMatchObject({
      code: "CODEX_PROCESS_EXITED",
      retryable: true,
      status: 409,
    });
  });
});

describe("monitorStandaloneRunnerJob", () => {
  it("surfaces a typed terminal job error even when no final public event was appended", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 0,
        terminal: true,
        jobStatus: "TIMED_OUT" as const,
        jobError: {
          code: "RUNNER_JOB_TIMED_OUT",
          message: "Runner job exceeded its deadline",
          retryable: true,
        },
      }),
    };

    await expect(
      monitorStandaloneRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_interactive_1",
        api,
      }),
    ).rejects.toMatchObject({
      code: "RUNNER_JOB_TIMED_OUT",
      message: "Runner job exceeded its deadline",
      status: 504,
    });
  });

  it("finishes from the job event terminal flag without waiting for a session transition", async () => {
    const api = {
      listRunnerEvents: vi
        .fn()
        .mockResolvedValueOnce({
          events: [started],
          nextCursor: 1,
          terminal: false,
        })
        .mockResolvedValueOnce({ events: [], nextCursor: 1, terminal: true }),
    };
    const seen: PublicCompilerEvent[] = [];

    await expect(
      monitorStandaloneRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_interactive_1",
        pollIntervalMs: 0,
        api,
        onEvents: (events) => seen.push(...events),
      }),
    ).resolves.toBe(1);
    expect(seen).toEqual([started]);
    expect(api.listRunnerEvents).toHaveBeenNthCalledWith(
      2,
      liveSession.sessionId,
      "job_interactive_1",
      1,
    );
  });
});
