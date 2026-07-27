import { createServer, type RequestListener } from "node:http";

export const HOSTED_RUNNER_STARTUP_FAILURE_REASONS = [
  "STARTING",
  "STARTUP_PROBE_FAILED",
  "CODEX_AUTH_MISSING",
  "VERIFYING_KEY_MISSING",
  "RELEASE_IDENTITY_INVALID",
  "ISOLATION_BOUNDARY_FAILED",
  "RUNNER_STARTUP_FAILED",
] as const;

export type HostedRunnerStartupFailureReason =
  (typeof HOSTED_RUNNER_STARTUP_FAILURE_REASONS)[number];

export class HostedRunnerStartupError extends Error {
  readonly reason: HostedRunnerStartupFailureReason;

  constructor(
    reason: HostedRunnerStartupFailureReason,
    options: { cause?: unknown } = {},
  ) {
    super("Hosted runner startup failed", options);
    this.name = "HostedRunnerStartupError";
    this.reason = reason;
  }
}

export async function runHostedRunnerStartupStage<T>(
  reason: HostedRunnerStartupFailureReason,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof HostedRunnerStartupError) throw error;
    throw new HostedRunnerStartupError(reason, { cause: error });
  }
}

export function hostedRunnerStartupFailureReason(
  error: unknown,
): HostedRunnerStartupFailureReason {
  return error instanceof HostedRunnerStartupError
    ? error.reason
    : "RUNNER_STARTUP_FAILED";
}

function respondJson(
  response: Parameters<RequestListener>[1],
  status: number,
  body: Record<string, string>,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(body));
}

export function createHostedRunnerBootstrapServer(): {
  server: ReturnType<typeof createServer>;
  activate(listener: RequestListener): void;
  fail(reason: HostedRunnerStartupFailureReason): void;
} {
  let reason: HostedRunnerStartupFailureReason = "STARTING";
  let activeListener: RequestListener | undefined;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://runner.internal");
    if (request.method === "GET" && url.pathname === "/live") {
      respondJson(response, 200, {
        status: "live",
        service: "counterlab-hosted-runner",
      });
      return;
    }
    if (activeListener !== undefined) {
      activeListener(request, response);
      return;
    }
    respondJson(response, 503, {
      status: "not-ready",
      service: "counterlab-hosted-runner",
      reason,
    });
  });
  return {
    server,
    activate(listener) {
      activeListener = listener;
    },
    fail(nextReason) {
      reason = nextReason;
      activeListener = undefined;
    },
  };
}
