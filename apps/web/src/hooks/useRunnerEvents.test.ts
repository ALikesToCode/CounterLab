import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { PublicCompilerEvent, SessionView } from "../api";
import {
  monitorRunnerJob,
  monitorStandaloneRunnerJob,
  readRunnerEventSnapshot,
  runnerEventSnapshotKey,
  useRunnerEvents,
  writeRunnerEventSnapshot,
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

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => {
      values.delete(key);
    },
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe("monitorRunnerJob", () => {
  it("reconnects from the event cursor and returns only after session state advances", async () => {
    const resumed = { ...started, eventId: "event_8", cursor: 8 };
    const api = {
      listRunnerEvents: vi
        .fn()
        .mockResolvedValueOnce({
          events: [resumed],
          nextCursor: 8,
          terminal: false,
        })
        .mockResolvedValueOnce({ events: [], nextCursor: 8, terminal: true }),
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
      after: 7,
      pollIntervalMs: 0,
      api,
      onEvents: (events) => seen.push(...events),
    });

    expect(completed.state).toBe("LAB_VERIFIED");
    expect(seen).toEqual([resumed]);
    expect(api.listRunnerEvents).toHaveBeenNthCalledWith(
      1,
      liveSession.sessionId,
      "job_1",
      7,
    );
    expect(api.listRunnerEvents).toHaveBeenNthCalledWith(
      2,
      liveSession.sessionId,
      "job_1",
      8,
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

  it("fails closed when a reconnect response moves the public cursor backwards", async () => {
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [],
        nextCursor: 3,
        terminal: false,
      }),
      getSession: vi.fn(),
    };

    await expect(
      monitorRunnerJob({
        sessionId: liveSession.sessionId,
        jobId: "job_1",
        terminalStates: ["LAB_VERIFIED"],
        after: 4,
        api,
      }),
    ).rejects.toMatchObject({
      code: "RUNNER_EVENT_CURSOR_REGRESSION",
      status: 409,
      retryable: true,
    });
    expect(api.getSession).not.toHaveBeenCalled();
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

describe("runner event reconnect snapshots", () => {
  it("round-trips a schema-valid public event cursor", () => {
    const storage = memoryStorage();

    expect(
      writeRunnerEventSnapshot(
        liveSession.sessionId,
        "job_1",
        [started],
        1,
        storage,
      ),
    ).toBe(true);
    expect(
      readRunnerEventSnapshot(liveSession.sessionId, "job_1", storage),
    ).toEqual({
      schemaVersion: "1",
      sessionId: liveSession.sessionId,
      jobId: "job_1",
      cursor: 1,
      events: [started],
    });
  });

  it("fails closed and removes a corrupted or cross-job snapshot", () => {
    const storage = memoryStorage();
    storage.setItem(
      runnerEventSnapshotKey(liveSession.sessionId, "job_1"),
      JSON.stringify({
        schemaVersion: "1",
        sessionId: liveSession.sessionId,
        jobId: "job_2",
        cursor: 99,
        events: [{ ...started, privateReasoning: "must never persist" }],
      }),
    );

    expect(
      readRunnerEventSnapshot(liveSession.sessionId, "job_1", storage),
    ).toBeNull();
    expect(
      storage.getItem(runnerEventSnapshotKey(liveSession.sessionId, "job_1")),
    ).toBeNull();
  });

  it("refuses an oversized snapshot instead of risking storage churn", () => {
    const storage = memoryStorage();
    const oversized = Array.from({ length: 257 }, (_, index) => ({
      ...started,
      eventId: `event_${index}`,
      cursor: index + 1,
    }));

    expect(
      writeRunnerEventSnapshot(
        liveSession.sessionId,
        "job_1",
        oversized,
        257,
        storage,
      ),
    ).toBe(false);
    expect(
      readRunnerEventSnapshot(liveSession.sessionId, "job_1", storage),
    ).toBeNull();
  });

  it("hydrates public events and makes the first refreshed request from the persisted cursor", async () => {
    const storage = memoryStorage();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: storage,
    });
    writeRunnerEventSnapshot(
      liveSession.sessionId,
      "job_1",
      [started],
      1,
      storage,
    );
    const completed = {
      ...started,
      eventId: "event_2",
      cursor: 2,
      kind: "verifier.verified" as const,
      invariantCount: 8,
      mutationCount: 12,
    };
    const api = {
      listRunnerEvents: vi.fn().mockResolvedValue({
        events: [completed],
        nextCursor: 2,
        terminal: true,
        jobStatus: "VERIFIED" as const,
      }),
      getSession: vi.fn().mockResolvedValue({
        ...liveSession,
        state: "LAB_VERIFIED" as const,
        version: 5,
      }),
    };
    const { result } = renderHook(() => useRunnerEvents());

    await act(async () => {
      await result.current.waitForJob({
        sessionId: liveSession.sessionId,
        jobId: "job_1",
        terminalStates: ["LAB_VERIFIED"],
        pollIntervalMs: 0,
        api,
      });
    });

    expect(api.listRunnerEvents).toHaveBeenCalledWith(
      liveSession.sessionId,
      "job_1",
      1,
    );
    expect(result.current.events).toEqual([started, completed]);
    expect(result.current.cursor).toBe(2);
    expect(
      readRunnerEventSnapshot(liveSession.sessionId, "job_1", storage),
    ).toMatchObject({ cursor: 2, events: [started, completed] });
    storage.clear();
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
