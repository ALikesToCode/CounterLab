import { createServer, type RequestListener } from "node:http";

import {
  PrivsepProbeFailureError,
  type PrivsepProbeFailure,
} from "./privsep-protocol.js";

export const HOSTED_RUNNER_STARTUP_FAILURE_REASONS = [
  "STARTING",
  "STARTUP_PROBE_FAILED",
  "PROCESS_IDENTITY_INVALID",
  "IMMUTABLE_PATHS_INVALID",
  "RUNTIME_PATHS_INVALID",
  "WRITABLE_ROOTS_INVALID",
  "CODEX_UNAVAILABLE",
  "PYTHON_UNAVAILABLE",
  "SETPRIV_UNAVAILABLE",
  "LANDLOCK_ABI_UNAVAILABLE",
  "LANDLOCK_PROBE_FAILED",
  "PRIVSEP_PROBE_FAILED",
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

export function hostedRunnerStartupProbeFailure(
  error: unknown,
): PrivsepProbeFailure | undefined {
  return error instanceof HostedRunnerStartupError &&
    error.reason === "PRIVSEP_PROBE_FAILED" &&
    error.cause instanceof PrivsepProbeFailureError
    ? error.cause.probeFailure
    : undefined;
}

const SAFE_CAUSE_NAMES = new Set([
  "CompilerSetupError",
  "Error",
  "SyntaxError",
  "ZodError",
]);
const SAFE_CAUSE_CODES = new Set([
  "CODEX_ISOLATION_UNAVAILABLE",
  "EACCES",
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOENT",
]);

export function hostedRunnerStartupFailureDiagnostic(error: unknown): {
  causeName: string;
  causeCode?: string;
} {
  const cause =
    error instanceof Error && error.cause instanceof Error
      ? error.cause
      : undefined;
  const causeName =
    cause !== undefined && SAFE_CAUSE_NAMES.has(cause.name)
      ? cause.name
      : "UnknownError";
  const causeCode =
    cause !== undefined &&
    "code" in cause &&
    typeof cause.code === "string" &&
    SAFE_CAUSE_CODES.has(cause.code)
      ? cause.code
      : undefined;
  return {
    causeName,
    ...(causeCode === undefined ? {} : { causeCode }),
  };
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
  fail(
    reason: HostedRunnerStartupFailureReason,
    probeFailure?: PrivsepProbeFailure,
  ): void;
} {
  let reason: HostedRunnerStartupFailureReason = "STARTING";
  let probeFailure: PrivsepProbeFailure | undefined;
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
      ...(reason === "PRIVSEP_PROBE_FAILED" && probeFailure !== undefined
        ? { probeFailure }
        : {}),
    });
  });
  return {
    server,
    activate(listener) {
      activeListener = listener;
      probeFailure = undefined;
    },
    fail(nextReason, nextProbeFailure) {
      reason = nextReason;
      probeFailure =
        nextReason === "PRIVSEP_PROBE_FAILED" ? nextProbeFailure : undefined;
      activeListener = undefined;
    },
  };
}
