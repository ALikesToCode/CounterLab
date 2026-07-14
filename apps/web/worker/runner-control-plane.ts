import type { RunnerJob } from "@counterlab/contracts";

export type RunnerDispatchRequest = {
  job: RunnerJob;
  token: string;
  controlPlaneUrl: string;
};

export interface RunnerDispatcher {
  readonly identity: string;
  dispatch(request: RunnerDispatchRequest): Promise<void>;
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
    });
    if (!response.ok) {
      throw new Error(`Runner dispatch failed with status ${response.status}`);
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
