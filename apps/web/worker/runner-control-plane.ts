import type { RunnerJob } from "@counterlab/contracts";

export type RunnerDispatchRequest = {
  job: RunnerJob;
  token: string;
  controlPlaneUrl: string;
};

export interface RunnerDispatcher {
  readonly identity: string;
  ready(): Promise<boolean>;
  dispatch(request: RunnerDispatchRequest): Promise<void>;
  cancel(request: RunnerDispatchRequest): Promise<void>;
}

export interface RunnerObjectStore {
  put(key: string, body: string, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: string; contentType: string } | undefined>;
}

type RunnerInstance = {
  startAndWaitForPorts(options: {
    ports: number[];
    cancellationOptions: {
      instanceGetTimeoutMS: number;
      portReadyTimeoutMS: number;
    };
    startOptions: {
      envVars: Record<string, string>;
      entrypoint?: string[];
    };
  }): Promise<void>;
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type RunnerContainerBinding = {
  getByName(name: string): RunnerInstance;
};

export type RunnerReleaseIdentity = {
  runnerSourceCommit: string;
  runnerImageDigest: string;
  generationIsolationEvidenceSha256: string;
  generationIsolationProbeSha256: string;
};

export type HttpRunnerDispatcherOptions = {
  baseURL: string;
  releaseIdentity: RunnerReleaseIdentity;
  fetch?: typeof globalThis.fetch;
};

type RunnerReadinessFailurePhase =
  "container-start" | "container-fetch" | "container-response";

function sanitizedReadinessError(error: unknown): {
  message: string;
  name: string;
} {
  const name = error instanceof Error ? error.name : "UnknownError";
  const source =
    error instanceof Error ? error.message : "Unknown runner readiness error";
  const message = source
    .replace(/Bearer\s+\S+/giu, "Bearer [REDACTED]")
    .replace(
      /((?:access_token|refresh_token|id_token|api_key|authorization)["']?\s*[:=]\s*["']?)[^"',;\s}]+/giu,
      "$1[REDACTED]",
    )
    .replace(/[A-Za-z0-9_-]{80,}/gu, "[REDACTED]")
    .slice(0, 512);
  return { message, name };
}

function reportContainerReadinessFailure(
  phase: RunnerReadinessFailurePhase,
  error: unknown,
): void {
  console.error("CounterLab Container runner readiness failed", {
    phase,
    ...sanitizedReadinessError(error),
  });
}

async function releaseRunnerResponse(response: Response): Promise<void> {
  if (response.body !== null && !response.bodyUsed) {
    await response.body.cancel();
  }
}

function normalizeRunnerBaseURL(configured: string): string {
  let url: URL;
  try {
    url = new URL(configured);
  } catch {
    throw new Error("Runner base URL must be an absolute URL");
  }
  const loopback = new Set(["localhost", "127.0.0.1", "[::1]"]).has(
    url.hostname,
  );
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error(
      "Runner base URL must use HTTPS outside loopback development",
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new Error("Runner base URL must not contain credentials");
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new Error("Runner base URL must not contain a query or fragment");
  }
  if (url.pathname !== "/" && url.pathname !== "") {
    throw new Error("Runner base URL must not contain a path");
  }
  return url.origin;
}

function assertExactRunnerReleaseIdentity(
  releaseIdentity: RunnerReleaseIdentity,
): void {
  if (!/^[a-f0-9]{40}$/u.test(releaseIdentity.runnerSourceCommit)) {
    throw new Error("Runner source commit must be exact for readiness");
  }
  if (!/^sha256:[a-f0-9]{64}$/u.test(releaseIdentity.runnerImageDigest)) {
    throw new Error("Runner image digest must be exact for readiness");
  }
  if (!/^[a-f0-9]{64}$/u.test(releaseIdentity.generationIsolationProbeSha256)) {
    throw new Error(
      "Generation-isolation probe hash must be exact for readiness",
    );
  }
  if (
    !/^[a-f0-9]{64}$/u.test(releaseIdentity.generationIsolationEvidenceSha256)
  ) {
    throw new Error(
      "Generation-isolation evidence hash must be exact for readiness",
    );
  }
}

type RunnerReadinessAssessment =
  { ready: true } | { ready: false; reason: string };

const RUNNER_STARTUP_FAILURE_REASONS = new Set([
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
]);
const RUNNER_PRIVSEP_PROBE_FAILURES = new Set([
  "uid",
  "gid",
  "groups",
  "capabilities",
  "no-new-privs",
  "workspace-read",
  "workspace-write",
  "credential-read",
  "credential-write-denied",
  "pid1-env-denied",
  "runner-env-denied",
  "app-read-denied",
  "repo-read-denied",
  "venv-read-denied",
  "wheelhouse-read-denied",
  "fixed-kernel-denied",
  "app-write-denied",
  "repo-write-denied",
  "tmp-write-denied",
  "probe-execution-failed",
]);

async function assessRunnerReadiness(
  response: Response,
  releaseIdentity: RunnerReleaseIdentity,
): Promise<RunnerReadinessAssessment> {
  const source = await response.text();
  if (source.length > 1_024) {
    return { ready: false, reason: "response-too-large" };
  }
  if (response.status !== 200) {
    let startupReason: string | undefined;
    try {
      const payload = JSON.parse(source) as unknown;
      if (
        typeof payload === "object" &&
        payload !== null &&
        !Array.isArray(payload)
      ) {
        const record = payload as Record<string, unknown>;
        const keys = Object.keys(record).sort();
        const hasBaseKeys =
          JSON.stringify(keys) ===
          JSON.stringify(["reason", "service", "status"]);
        const hasProbeFailureKeys =
          JSON.stringify(keys) ===
          JSON.stringify(["probeFailure", "reason", "service", "status"]);
        if (
          response.status === 503 &&
          (hasBaseKeys || hasProbeFailureKeys) &&
          record.status === "not-ready" &&
          record.service === "counterlab-hosted-runner" &&
          typeof record.reason === "string" &&
          RUNNER_STARTUP_FAILURE_REASONS.has(record.reason) &&
          (hasBaseKeys ||
            (record.reason === "PRIVSEP_PROBE_FAILED" &&
              typeof record.probeFailure === "string" &&
              RUNNER_PRIVSEP_PROBE_FAILURES.has(record.probeFailure)))
        ) {
          startupReason = `${record.reason}${
            hasProbeFailureKeys ? `:${String(record.probeFailure)}` : ""
          }`;
        }
      }
    } catch {
      startupReason = undefined;
    }
    return {
      ready: false,
      reason: `http-status-${response.status}${
        startupReason === undefined ? "" : `:${startupReason}`
      }`,
    };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(source);
  } catch {
    return { ready: false, reason: "invalid-json" };
  }
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return { ready: false, reason: "invalid-payload-shape" };
  }
  const record = payload as Record<string, unknown>;
  if (
    JSON.stringify(Object.keys(record).sort()) !==
    JSON.stringify(
      [
        "generationFilesystemReadIsolation",
        "generationIsolationEvidenceSha256",
        "generationIsolationProbeSha256",
        "runnerImageDigest",
        "runnerSourceCommit",
        "service",
        "status",
      ].sort(),
    )
  ) {
    return { ready: false, reason: "unexpected-payload-keys" };
  }
  for (const [field, expected] of [
    ["status", "ready"],
    ["service", "counterlab-hosted-runner"],
    ["generationFilesystemReadIsolation", "OS_ENFORCED"],
    [
      "generationIsolationEvidenceSha256",
      releaseIdentity.generationIsolationEvidenceSha256,
    ],
    [
      "generationIsolationProbeSha256",
      releaseIdentity.generationIsolationProbeSha256,
    ],
    ["runnerSourceCommit", releaseIdentity.runnerSourceCommit],
    ["runnerImageDigest", releaseIdentity.runnerImageDigest],
  ] as const) {
    if (!(field in record) || record[field] !== expected) {
      return { ready: false, reason: `mismatched-${field}` };
    }
  }
  return { ready: true };
}

async function runnerReadinessMatches(
  response: Response,
  releaseIdentity: RunnerReleaseIdentity,
): Promise<boolean> {
  return (await assessRunnerReadiness(response, releaseIdentity)).ready;
}

export class HttpRunnerDispatcher implements RunnerDispatcher {
  readonly identity = "counterlab-process-runner-v1";
  private readonly baseURL: string;
  private readonly fetcher: typeof globalThis.fetch;
  private readonly releaseIdentity: RunnerReleaseIdentity;

  constructor(options: HttpRunnerDispatcherOptions) {
    this.baseURL = normalizeRunnerBaseURL(options.baseURL);
    assertExactRunnerReleaseIdentity(options.releaseIdentity);
    this.releaseIdentity = options.releaseIdentity;
    this.fetcher =
      options.fetch ?? ((input, init) => globalThis.fetch(input, init));
  }

  async ready(): Promise<boolean> {
    try {
      const response = await this.fetcher(`${this.baseURL}/ready`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      return runnerReadinessMatches(response, this.releaseIdentity);
    } catch {
      return false;
    }
  }

  async dispatch(request: RunnerDispatchRequest): Promise<void> {
    const response = await this.fetcher(`${this.baseURL}/jobs`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${request.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: "1",
        jobId: request.job.jobId,
        controlPlaneUrl: request.controlPlaneUrl,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`Runner dispatch failed with status ${response.status}`);
    }
  }

  async cancel(request: RunnerDispatchRequest): Promise<void> {
    const response = await this.fetcher(
      `${this.baseURL}/jobs/${encodeURIComponent(request.job.jobId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${request.token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Runner cancellation failed with status ${response.status}`,
      );
    }
  }
}

export function isRunnerContainerBinding(
  value: unknown,
): value is RunnerContainerBinding {
  return (
    typeof value === "object" &&
    value !== null &&
    "getByName" in value &&
    typeof value.getByName === "function"
  );
}

export class CloudflareContainerRunnerDispatcher implements RunnerDispatcher {
  readonly identity = "cloudflare-container-runner-v1";
  private readonly readinessInstanceName: string;

  constructor(
    private readonly binding: RunnerContainerBinding,
    private readonly containerEnvironment: Record<string, string>,
    private readonly releaseIdentity: RunnerReleaseIdentity,
  ) {
    assertExactRunnerReleaseIdentity(releaseIdentity);
    this.readinessInstanceName = `counterlab-readiness-${releaseIdentity.generationIsolationEvidenceSha256}`;
  }

  async ready(): Promise<boolean> {
    let instance: RunnerInstance;
    try {
      instance = this.binding.getByName(this.readinessInstanceName);
      await instance.startAndWaitForPorts({
        ports: [8080],
        cancellationOptions: {
          instanceGetTimeoutMS: 10_000,
          portReadyTimeoutMS: 30_000,
        },
        startOptions: {
          envVars: this.containerEnvironment,
          entrypoint: ["/usr/local/bin/node", "/app/privsep.mjs"],
        },
      });
    } catch (error) {
      reportContainerReadinessFailure("container-start", error);
      return false;
    }
    let response: Response;
    try {
      response = await instance.fetch("http://runner.internal/ready", {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      reportContainerReadinessFailure("container-fetch", error);
      return false;
    }
    try {
      const assessment = await assessRunnerReadiness(
        response,
        this.releaseIdentity,
      );
      if (!assessment.ready) {
        reportContainerReadinessFailure(
          "container-response",
          new Error(`Runner readiness response failed: ${assessment.reason}`),
        );
      }
      return assessment.ready;
    } catch (error) {
      reportContainerReadinessFailure("container-response", error);
      return false;
    }
  }

  async dispatch(request: RunnerDispatchRequest): Promise<void> {
    const instance = this.binding.getByName(request.job.jobId);
    let lastFailure: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await instance.startAndWaitForPorts({
          ports: [8080],
          cancellationOptions: {
            instanceGetTimeoutMS: 10_000,
            portReadyTimeoutMS: 30_000,
          },
          startOptions: {
            envVars: this.containerEnvironment,
            entrypoint: ["/usr/local/bin/node", "/app/privsep.mjs"],
          },
        });
      } catch (error) {
        lastFailure = error;
        continue;
      }
      let response: Response;
      try {
        response = await instance.fetch("http://runner.internal/jobs", {
          method: "POST",
          headers: {
            authorization: `Bearer ${request.token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            schemaVersion: "1",
            jobId: request.job.jobId,
            controlPlaneUrl: request.controlPlaneUrl,
          }),
          signal: AbortSignal.timeout(30_000),
        });
        await releaseRunnerResponse(response);
      } catch (error) {
        lastFailure = error;
        continue;
      }
      if (response.ok) return;
      lastFailure = new Error(
        `Runner dispatch failed with status ${response.status}`,
      );
      if (response.status < 500) throw lastFailure;
    }
    throw lastFailure instanceof Error
      ? lastFailure
      : new Error("Runner dispatch failed without an acknowledgement");
  }

  async cancel(request: RunnerDispatchRequest): Promise<void> {
    const instance = this.binding.getByName(request.job.jobId);
    const response = await instance.fetch(
      `http://runner.internal/jobs/${encodeURIComponent(request.job.jobId)}`,
      {
        method: "DELETE",
        headers: { authorization: `Bearer ${request.token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    await releaseRunnerResponse(response);
    if (!response.ok) {
      throw new Error(
        `Runner cancellation failed with status ${response.status}`,
      );
    }
  }
}

export class R2RunnerObjectStore implements RunnerObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, body: string, contentType: string): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async get(
    key: string,
  ): Promise<{ body: string; contentType: string } | undefined> {
    const object = await this.bucket.get(key);
    if (object === null) return undefined;
    return {
      body: await object.text(),
      contentType:
        object.httpMetadata?.contentType ?? "application/octet-stream",
    };
  }
}
