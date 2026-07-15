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
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export type RunnerContainerBinding = {
  getByName(name: string): RunnerInstance;
};

export type HttpRunnerDispatcherOptions = {
  baseURL: string;
  fetch?: typeof globalThis.fetch;
};

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

export class HttpRunnerDispatcher implements RunnerDispatcher {
  readonly identity = "counterlab-process-runner-v1";
  private readonly baseURL: string;
  private readonly fetcher: typeof globalThis.fetch;

  constructor(options: HttpRunnerDispatcherOptions) {
    this.baseURL = normalizeRunnerBaseURL(options.baseURL);
    this.fetcher = options.fetch ?? globalThis.fetch;
  }

  async ready(): Promise<boolean> {
    try {
      const response = await this.fetcher(`${this.baseURL}/ready`, {
        method: "GET",
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });
      return response.ok;
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

  constructor(private readonly binding: RunnerContainerBinding) {}

  async ready(): Promise<boolean> {
    return Promise.resolve(true);
  }

  async dispatch(request: RunnerDispatchRequest): Promise<void> {
    const instance = this.binding.getByName(request.job.jobId);
    const response = await instance.fetch("http://runner.internal/jobs", {
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
    if (!response.ok) {
      throw new Error(`Runner dispatch failed with status ${response.status}`);
    }
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
