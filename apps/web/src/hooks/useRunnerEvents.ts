import { useCallback, useEffect, useRef, useState } from "react";
import {
  PublicCompilerEventSchema,
  type RunnerJobKind,
} from "@counterlab/contracts";
import { z } from "zod";

import {
  ApiClientError,
  counterLabApi,
  type PublicCompilerEvent,
  type SessionState,
  type SessionView,
} from "../api";
import {
  markActiveRunnerJobTerminal,
  registerActiveRunnerJob,
} from "../features/learner/activeRunnerRegistry";

type RunnerEventsApi = Pick<
  typeof counterLabApi,
  "getSession" | "listRunnerEvents"
>;
type StandaloneRunnerEventsApi = Pick<typeof counterLabApi, "listRunnerEvents">;

const MAX_SNAPSHOT_EVENTS = 256;
const MAX_SNAPSHOT_BYTES = 512 * 1024;
const RunnerEventSnapshotSchema = z
  .object({
    schemaVersion: z.literal("1"),
    sessionId: z.string().trim().min(1),
    jobId: z.string().trim().min(1),
    cursor: z.number().int().nonnegative(),
    events: z.array(PublicCompilerEventSchema).max(MAX_SNAPSHOT_EVENTS),
  })
  .strict()
  .superRefine((snapshot, context) => {
    let previousCursor = 0;
    for (const [index, event] of snapshot.events.entries()) {
      if (event.jobId !== snapshot.jobId) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "jobId"],
          message: "event belongs to another runner job",
        });
      }
      if (event.cursor <= previousCursor || event.cursor > snapshot.cursor) {
        context.addIssue({
          code: "custom",
          path: ["events", index, "cursor"],
          message: "event cursors must increase within the snapshot cursor",
        });
      }
      previousCursor = event.cursor;
    }
  });

export type RunnerEventSnapshot = z.infer<typeof RunnerEventSnapshotSchema>;

export function runnerEventSnapshotKey(
  sessionId: string,
  jobId: string,
): string {
  return `counterlab.runnerEvents.${encodeURIComponent(sessionId)}.${encodeURIComponent(jobId)}`;
}

function removeSnapshot(
  sessionId: string,
  jobId: string,
  storage: Storage,
): void {
  try {
    storage.removeItem(runnerEventSnapshotKey(sessionId, jobId));
  } catch {
    // Storage can be unavailable in privacy modes. The authoritative stream
    // remains in D1 and the browser will safely reconstruct from cursor zero.
  }
}

export function readRunnerEventSnapshot(
  sessionId: string,
  jobId: string,
  storage: Storage,
): RunnerEventSnapshot | null {
  const key = runnerEventSnapshotKey(sessionId, jobId);
  try {
    const serialized = storage.getItem(key);
    if (serialized === null) return null;
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      removeSnapshot(sessionId, jobId, storage);
      return null;
    }
    const parsed = RunnerEventSnapshotSchema.safeParse(JSON.parse(serialized));
    if (
      !parsed.success ||
      parsed.data.sessionId !== sessionId ||
      parsed.data.jobId !== jobId
    ) {
      removeSnapshot(sessionId, jobId, storage);
      return null;
    }
    return parsed.data;
  } catch {
    removeSnapshot(sessionId, jobId, storage);
    return null;
  }
}

export function writeRunnerEventSnapshot(
  sessionId: string,
  jobId: string,
  events: readonly PublicCompilerEvent[],
  cursor: number,
  storage: Storage,
): boolean {
  const parsed = RunnerEventSnapshotSchema.safeParse({
    schemaVersion: "1",
    sessionId,
    jobId,
    cursor,
    events,
  });
  if (!parsed.success) {
    removeSnapshot(sessionId, jobId, storage);
    return false;
  }
  try {
    const serialized = JSON.stringify(parsed.data);
    if (new TextEncoder().encode(serialized).byteLength > MAX_SNAPSHOT_BYTES) {
      removeSnapshot(sessionId, jobId, storage);
      return false;
    }
    storage.setItem(runnerEventSnapshotKey(sessionId, jobId), serialized);
    return true;
  } catch {
    removeSnapshot(sessionId, jobId, storage);
    return false;
  }
}

function availableLocalStorage(): Storage | undefined {
  try {
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export type MonitorRunnerJobInput = {
  sessionId: string;
  jobId: string;
  terminalStates: readonly SessionState[];
  after?: number;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxPolls?: number;
  terminalProjectionGracePolls?: number;
  api?: RunnerEventsApi;
  onEvents?: (events: readonly PublicCompilerEvent[], cursor: number) => void;
  onSession?: (session: SessionView) => void;
  onTerminal?: () => void;
};

export type MonitorStandaloneRunnerJobInput = Omit<
  MonitorRunnerJobInput,
  "terminalStates" | "onSession" | "api"
> & {
  api?: StandaloneRunnerEventsApi;
};

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

export async function monitorRunnerJob({
  sessionId,
  jobId,
  terminalStates,
  after = 0,
  signal,
  pollIntervalMs = 750,
  maxPolls = 320,
  terminalProjectionGracePolls = 12,
  api = counterLabApi,
  onEvents,
  onSession,
  onTerminal,
}: MonitorRunnerJobInput): Promise<SessionView> {
  let cursor = after;
  let verifiedTerminalPolls = 0;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (signal?.aborted) throw signal.reason;
    const page = await api.listRunnerEvents(sessionId, jobId, cursor);
    const previousCursor = cursor;
    if (page.nextCursor < cursor) {
      throw new ApiClientError({
        code: "RUNNER_EVENT_CURSOR_REGRESSION",
        message: "The runner event stream moved backwards and was rejected.",
        status: 409,
        retryable: true,
      });
    }
    cursor = page.nextCursor;
    if (page.events.length > 0 || cursor !== previousCursor) {
      onEvents?.(page.events, cursor);
    }

    const session = await api.getSession(sessionId);
    onSession?.(session);
    const failure = page.terminal
      ? [...page.events].reverse().find((event) => event.kind === "job.failed")
      : undefined;
    if (page.terminal) {
      onTerminal?.();
      if (page.jobError !== undefined) {
        throw new ApiClientError({
          code: page.jobError.code,
          message: page.jobError.message,
          status: page.jobStatus === "TIMED_OUT" ? 504 : 409,
          retryable: page.jobError.retryable,
        });
      }
    }
    if (failure !== undefined) {
      throw new ApiClientError({
        code: failure.code,
        message: failure.message,
        status: 409,
      });
    }
    if (terminalStates.includes(session.state)) return session;

    if (page.terminal) {
      if (
        page.jobStatus === "VERIFIED" &&
        verifiedTerminalPolls < terminalProjectionGracePolls
      ) {
        verifiedTerminalPolls += 1;
        await wait(pollIntervalMs, signal);
        continue;
      }
      throw new ApiClientError({
        code:
          page.jobStatus === "VERIFIED"
            ? "RUNNER_SESSION_PROJECTION_TIMEOUT"
            : "RUNNER_TERMINATED",
        message:
          page.jobStatus === "VERIFIED"
            ? `The verified runner job did not reconcile to ${terminalStates.join(" or ")} within the bounded wait window.`
            : `Runner job ended before the session reached ${terminalStates.join(" or ")}.`,
        status: 409,
        retryable: page.jobStatus === "VERIFIED",
      });
    }
    await wait(pollIntervalMs, signal);
  }
  throw new ApiClientError({
    code: "RUNNER_POLL_TIMEOUT",
    message: "The runner did not finish within the browser wait window.",
    status: 504,
    retryable: true,
  });
}

export async function monitorStandaloneRunnerJob({
  sessionId,
  jobId,
  after = 0,
  signal,
  pollIntervalMs = 750,
  maxPolls = 320,
  api = counterLabApi,
  onEvents,
  onTerminal,
}: MonitorStandaloneRunnerJobInput): Promise<number> {
  let cursor = after;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (signal?.aborted) throw signal.reason;
    const page = await api.listRunnerEvents(sessionId, jobId, cursor);
    const previousCursor = cursor;
    if (page.nextCursor < cursor) {
      throw new ApiClientError({
        code: "RUNNER_EVENT_CURSOR_REGRESSION",
        message: "The runner event stream moved backwards and was rejected.",
        status: 409,
        retryable: true,
      });
    }
    cursor = page.nextCursor;
    if (page.events.length > 0 || cursor !== previousCursor) {
      onEvents?.(page.events, cursor);
    }
    if (page.terminal) {
      onTerminal?.();
      const failure = [...page.events]
        .reverse()
        .find((event) => event.kind === "job.failed");
      const terminalError = page.jobError;
      if (terminalError !== undefined) {
        throw new ApiClientError({
          code: terminalError.code,
          message: terminalError.message,
          status: page.jobStatus === "TIMED_OUT" ? 504 : 409,
          retryable: terminalError.retryable,
        });
      }
      if (failure !== undefined) {
        throw new ApiClientError({
          code: failure.code,
          message: failure.message,
          status: 409,
        });
      }
      if (page.jobStatus !== undefined && page.jobStatus !== "VERIFIED") {
        throw new ApiClientError({
          code: "RUNNER_TERMINATED",
          message: `Runner job ended with status ${page.jobStatus}.`,
          status: page.jobStatus === "TIMED_OUT" ? 504 : 409,
        });
      }
      return cursor;
    }
    await wait(pollIntervalMs, signal);
  }
  throw new ApiClientError({
    code: "RUNNER_POLL_TIMEOUT",
    message: "The runner did not finish within the browser wait window.",
    status: 504,
    retryable: true,
  });
}

export function useRunnerEvents() {
  const [events, setEvents] = useState<PublicCompilerEvent[]>([]);
  const [cursor, setCursor] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const activeJob = useRef<{ sessionId: string; jobId: string } | null>(null);
  const eventsRef = useRef<PublicCompilerEvent[]>([]);
  const cursorRef = useRef(0);

  const registryStorage = useCallback((): Storage | undefined => {
    try {
      return window.sessionStorage ?? undefined;
    } catch {
      return undefined;
    }
  }, []);

  const registerJob = useCallback(
    (sessionId: string, jobId: string, kind: RunnerJobKind | undefined) => {
      const storage = registryStorage();
      if (storage === undefined || kind === undefined) return;
      registerActiveRunnerJob(
        {
          sessionId,
          jobId,
          kind,
          registeredAt: new Date().toISOString(),
        },
        storage,
      );
    },
    [registryStorage],
  );

  const markTerminal = useCallback(
    (sessionId: string, jobId: string) => {
      const storage = registryStorage();
      if (storage === undefined) return;
      markActiveRunnerJobTerminal(sessionId, jobId, storage);
    },
    [registryStorage],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const clear = useCallback(() => {
    cancel();
    const active = activeJob.current;
    const storage = availableLocalStorage();
    if (active !== null && storage !== undefined) {
      removeSnapshot(active.sessionId, active.jobId, storage);
    }
    activeJob.current = null;
    eventsRef.current = [];
    cursorRef.current = 0;
    setEvents([]);
    setCursor(0);
  }, [cancel]);

  const prepareReconnect = useCallback((sessionId: string, jobId: string) => {
    const storage = availableLocalStorage();
    const persisted =
      storage === undefined
        ? null
        : readRunnerEventSnapshot(sessionId, jobId, storage);
    const sameJob =
      activeJob.current?.sessionId === sessionId &&
      activeJob.current.jobId === jobId;
    const nextEvents = persisted?.events ?? (sameJob ? eventsRef.current : []);
    const nextCursor = persisted?.cursor ?? (sameJob ? cursorRef.current : 0);
    activeJob.current = { sessionId, jobId };
    eventsRef.current = [...nextEvents];
    cursorRef.current = nextCursor;
    setEvents([...nextEvents]);
    setCursor(nextCursor);
    return nextCursor;
  }, []);

  const rememberEvents = useCallback(
    (
      sessionId: string,
      jobId: string,
      nextEvents: readonly PublicCompilerEvent[],
      nextCursor: number,
    ) => {
      const seen = new Set(eventsRef.current.map((event) => event.eventId));
      const merged = [
        ...eventsRef.current,
        ...nextEvents.filter((event) => !seen.has(event.eventId)),
      ];
      activeJob.current = { sessionId, jobId };
      eventsRef.current = merged;
      cursorRef.current = nextCursor;
      const storage = availableLocalStorage();
      if (storage !== undefined) {
        writeRunnerEventSnapshot(sessionId, jobId, merged, nextCursor, storage);
      }
      // The public cursor is persisted synchronously before React can paint the
      // corresponding event update.
      setCursor(nextCursor);
      setEvents(merged);
    },
    [],
  );

  const waitForJob = useCallback(
    async (
      input: Omit<
        MonitorRunnerJobInput,
        "after" | "signal" | "onEvents" | "onTerminal"
      > & { jobKind?: RunnerJobKind },
    ) => {
      cancel();
      const nextController = new AbortController();
      controller.current = nextController;
      const after = prepareReconnect(input.sessionId, input.jobId);
      registerJob(input.sessionId, input.jobId, input.jobKind);
      try {
        const { jobKind: _jobKind, ...monitorInput } = input;
        const completed = await monitorRunnerJob({
          ...monitorInput,
          after,
          signal: nextController.signal,
          onTerminal: () => markTerminal(input.sessionId, input.jobId),
          onEvents: (nextEvents, nextCursor) => {
            rememberEvents(
              input.sessionId,
              input.jobId,
              nextEvents,
              nextCursor,
            );
          },
        });
        markTerminal(input.sessionId, input.jobId);
        return completed;
      } finally {
        if (controller.current === nextController) controller.current = null;
      }
    },
    [cancel, markTerminal, prepareReconnect, registerJob, rememberEvents],
  );

  const waitForStandaloneJob = useCallback(
    async (
      input: Omit<
        MonitorStandaloneRunnerJobInput,
        "after" | "signal" | "onEvents" | "onTerminal"
      > & { jobKind?: RunnerJobKind },
    ) => {
      cancel();
      const nextController = new AbortController();
      controller.current = nextController;
      const after = prepareReconnect(input.sessionId, input.jobId);
      registerJob(input.sessionId, input.jobId, input.jobKind);
      try {
        const { jobKind: _jobKind, ...monitorInput } = input;
        const completed = await monitorStandaloneRunnerJob({
          ...monitorInput,
          after,
          signal: nextController.signal,
          onTerminal: () => markTerminal(input.sessionId, input.jobId),
          onEvents: (nextEvents, nextCursor) => {
            rememberEvents(
              input.sessionId,
              input.jobId,
              nextEvents,
              nextCursor,
            );
          },
        });
        markTerminal(input.sessionId, input.jobId);
        return completed;
      } finally {
        if (controller.current === nextController) controller.current = null;
      }
    },
    [cancel, markTerminal, prepareReconnect, registerJob, rememberEvents],
  );

  return {
    events,
    cursor,
    clear,
    cancel,
    waitForJob,
    waitForStandaloneJob,
  } as const;
}
