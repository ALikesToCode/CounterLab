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

async function runnerReadinessMatches(
  response: Response,
  releaseIdentity: RunnerReleaseIdentity,
): Promise<boolean> {
  const source = await response.text();
  if (response.status !== 200 || source.length > 1_024) return false;
  const payload: unknown = JSON.parse(source);
  return (
    typeof payload === "object" &&
    payload !== null &&
    !Array.isArray(payload) &&
    JSON.stringify(Object.keys(payload).sort()) ===
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
      ) &&
    "status" in payload &&
    payload.status === "ready" &&
    "service" in payload &&
    payload.service === "counterlab-hosted-runner" &&
    "generationFilesystemReadIsolation" in payload &&
    payload.generationFilesystemReadIsolation === "OS_ENFORCED" &&
    "generationIsolationEvidenceSha256" in payload &&
    payload.generationIsolationEvidenceSha256 ===
      releaseIdentity.generationIsolationEvidenceSha256 &&
    "generationIsolationProbeSha256" in payload &&
    payload.generationIsolationProbeSha256 ===
      releaseIdentity.generationIsolationProbeSha256 &&
    "runnerSourceCommit" in payload &&
    payload.runnerSourceCommit === releaseIdentity.runnerSourceCommit &&
    "runnerImageDigest" in payload &&
    payload.runnerImageDigest === releaseIdentity.runnerImageDigest
  );
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
    try {
      const instance = this.binding.getByName(this.readinessInstanceName);
      await instance.startAndWaitForPorts({
        ports: [8080],
        cancellationOptions: {
          instanceGetTimeoutMS: 10_000,
          portReadyTimeoutMS: 30_000,
        },
        startOptions: {
          envVars: this.containerEnvironment,
          entrypoint: ["/usr/local/bin/node", "/app/runner.mjs"],
        },
      });
      const response = await instance.fetch("http://runner.internal/ready", {
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
            entrypoint: ["/usr/local/bin/node", "/app/runner.mjs"],
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
