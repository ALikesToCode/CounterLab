import { useCallback, useEffect, useRef, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type PublicCompilerEvent,
  type SessionState,
  type SessionView,
} from "../api";

type RunnerEventsApi = Pick<
  typeof counterLabApi,
  "getSession" | "listRunnerEvents"
>;
type StandaloneRunnerEventsApi = Pick<typeof counterLabApi, "listRunnerEvents">;

export type MonitorRunnerJobInput = {
  sessionId: string;
  jobId: string;
  terminalStates: readonly SessionState[];
  after?: number;
  signal?: AbortSignal;
  pollIntervalMs?: number;
  maxPolls?: number;
  api?: RunnerEventsApi;
  onEvents?: (events: readonly PublicCompilerEvent[], cursor: number) => void;
  onSession?: (session: SessionView) => void;
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
  api = counterLabApi,
  onEvents,
  onSession,
}: MonitorRunnerJobInput): Promise<SessionView> {
  let cursor = after;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (signal?.aborted) throw signal.reason;
    const page = await api.listRunnerEvents(sessionId, jobId, cursor);
    cursor = page.nextCursor;
    if (page.events.length > 0) onEvents?.(page.events, cursor);

    const session = await api.getSession(sessionId);
    onSession?.(session);
    if (terminalStates.includes(session.state)) return session;

    if (page.terminal) {
      const failure = [...page.events]
        .reverse()
        .find((event) => event.kind === "job.failed");
      if (page.jobError !== undefined) {
        throw new ApiClientError({
          code: page.jobError.code,
          message: page.jobError.message,
          status: page.jobStatus === "TIMED_OUT" ? 504 : 409,
          retryable: page.jobError.retryable,
        });
      }
      throw new ApiClientError({
        code: failure?.code ?? "RUNNER_TERMINATED",
        message:
          failure?.message ??
          `Runner job ended before the session reached ${terminalStates.join(" or ")}.`,
        status: 409,
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
}: MonitorStandaloneRunnerJobInput): Promise<number> {
  let cursor = after;
  for (let poll = 0; poll < maxPolls; poll += 1) {
    if (signal?.aborted) throw signal.reason;
    const page = await api.listRunnerEvents(sessionId, jobId, cursor);
    cursor = page.nextCursor;
    if (page.events.length > 0) onEvents?.(page.events, cursor);
    if (page.terminal) {
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

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  const clear = useCallback(() => {
    cancel();
    setEvents([]);
    setCursor(0);
  }, [cancel]);

  const waitForJob = useCallback(
    async (
      input: Omit<MonitorRunnerJobInput, "after" | "signal" | "onEvents">,
    ) => {
      cancel();
      const nextController = new AbortController();
      controller.current = nextController;
      try {
        return await monitorRunnerJob({
          ...input,
          after: 0,
          signal: nextController.signal,
          onEvents: (nextEvents, nextCursor) => {
            setEvents((current) => {
              const seen = new Set(current.map((event) => event.eventId));
              return [
                ...current,
                ...nextEvents.filter((event) => !seen.has(event.eventId)),
              ];
            });
            setCursor(nextCursor);
          },
        });
      } finally {
        if (controller.current === nextController) controller.current = null;
      }
    },
    [cancel],
  );

  const waitForStandaloneJob = useCallback(
    async (
      input: Omit<
        MonitorStandaloneRunnerJobInput,
        "after" | "signal" | "onEvents"
      >,
    ) => {
      cancel();
      const nextController = new AbortController();
      controller.current = nextController;
      try {
        return await monitorStandaloneRunnerJob({
          ...input,
          after: 0,
          signal: nextController.signal,
          onEvents: (nextEvents, nextCursor) => {
            setEvents((current) => {
              const seen = new Set(current.map((event) => event.eventId));
              return [
                ...current,
                ...nextEvents.filter((event) => !seen.has(event.eventId)),
              ];
            });
            setCursor(nextCursor);
          },
        });
      } finally {
        if (controller.current === nextController) controller.current = null;
      }
    },
    [cancel],
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
