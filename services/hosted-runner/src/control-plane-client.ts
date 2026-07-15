import {
  RunnerJobInputBundleSchema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJobInputBundle,
} from "@counterlab/contracts";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";

import type { CandidateDecision, RunnerControlPlane } from "./job-processor.js";

const CandidateDecisionSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    canRepair: z.boolean(),
    nextCursor: z.number().int().nonnegative(),
    verifierDurationMs: z.number().int().nonnegative(),
    counterexamples: z.array(
      z
        .object({
          invariant: z.string().min(1),
          observed: z.unknown(),
          expected: z.unknown(),
          counterexample: z.string().min(1),
        })
        .strict(),
    ),
  })
  .passthrough();

const UploadResponseSchema = z
  .object({ sha256: z.string().regex(/^[a-f0-9]{64}$/u) })
  .passthrough();

const EnvelopeSchema = z
  .object({ ok: z.literal(true), data: z.unknown() })
  .passthrough();

export type HttpRunnerControlPlaneOptions = {
  controlPlaneUrl: string;
  jobId: string;
  token: string;
  fetch?: typeof fetch;
  callbackRetryDelayMs?: number;
};

class ControlPlaneRequestError extends Error {
  constructor(readonly status: number) {
    super(`CounterLab control plane request failed with status ${status}`);
    this.name = "ControlPlaneRequestError";
  }
}

export class HttpRunnerControlPlane implements RunnerControlPlane {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly callbackRetryDelayMs: number;

  constructor(private readonly options: HttpRunnerControlPlaneOptions) {
    this.baseUrl = new URL(options.controlPlaneUrl);
    if (
      this.baseUrl.protocol !== "https:" &&
      !["127.0.0.1", "localhost", "::1"].includes(this.baseUrl.hostname)
    ) {
      throw new Error("Runner control plane must use HTTPS");
    }
    this.fetcher = options.fetch ?? fetch;
    this.callbackRetryDelayMs = options.callbackRetryDelayMs ?? 250;
    if (
      !Number.isInteger(this.callbackRetryDelayMs) ||
      this.callbackRetryDelayMs < 0 ||
      this.callbackRetryDelayMs > 5_000
    ) {
      throw new Error("Callback retry delay must be between 0 and 5000 ms");
    }
  }

  async getInput(signal?: AbortSignal): Promise<RunnerJobInputBundle> {
    const response = await this.request(
      `/api/runner/jobs/${this.jobId()}/input`,
      { method: "GET" },
      false,
      signal,
    );
    return RunnerJobInputBundleSchema.parse(await response.json());
  }

  async getSource(signal?: AbortSignal): Promise<string> {
    const response = await this.request(
      `/api/runner/jobs/${this.jobId()}/source`,
      { method: "GET" },
      false,
      signal,
    );
    return response.text();
  }

  async start(signal?: AbortSignal): Promise<void> {
    await this.jsonRequest(
      `/api/runner/jobs/${this.jobId()}/start`,
      {
        method: "POST",
      },
      signal,
    );
  }

  async resume(signal?: AbortSignal): Promise<void> {
    await this.jsonRequest(
      `/api/runner/jobs/${this.jobId()}/resume`,
      {
        method: "POST",
      },
      signal,
    );
  }

  async appendEvent(
    event: PublicCompilerEvent,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.jsonRequest(
      `/api/runner/jobs/${this.jobId()}/events`,
      {
        method: "POST",
        body: JSON.stringify(event),
      },
      signal,
    );
  }

  async upload(
    path: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<{ sha256: string }> {
    const data = await this.jsonRequest(
      `/api/runner/jobs/${this.jobId()}/outputs/${encodeURIComponent(path)}`,
      {
        method: "PUT",
        headers: {
          "content-type": path.endsWith(".json")
            ? "application/json"
            : "text/markdown; charset=utf-8",
        },
        body,
      },
      signal,
    );
    return UploadResponseSchema.parse(data);
  }

  async candidate(
    input: {
      attempt: number;
      planSha256: string;
    },
    signal?: AbortSignal,
  ): Promise<CandidateDecision> {
    const data = await this.jsonRequest(
      `/api/runner/jobs/${this.jobId()}/candidate`,
      { method: "POST", body: JSON.stringify(input) },
      signal,
    );
    return CandidateDecisionSchema.parse(data);
  }

  async callback(
    callback: RunnerCallback,
    signal?: AbortSignal,
  ): Promise<void> {
    const body = JSON.stringify(callback);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.jsonRequest(
          `/api/runner/jobs/${this.jobId()}/callback`,
          { method: "POST", body },
          signal,
        );
        return;
      } catch (error) {
        const retryable =
          error instanceof ControlPlaneRequestError &&
          (error.status === 409 || error.status === 429 || error.status >= 500);
        if (!retryable || attempt === 3) throw error;
        await delay(this.callbackRetryDelayMs * attempt, undefined, {
          ...(signal === undefined ? {} : { signal }),
        });
      }
    }
  }

  private jobId(): string {
    return encodeURIComponent(this.options.jobId);
  }

  private async jsonRequest(
    path: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<unknown> {
    const response = await this.request(path, init, true, signal);
    const envelope = EnvelopeSchema.parse(await response.json());
    return envelope.data;
  }

  private async request(
    path: string,
    init: RequestInit,
    expectJsonEnvelope: boolean,
    signal?: AbortSignal,
  ): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${this.options.token}`);
    headers.set("accept", "application/json");
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    const response = await this.fetcher(new URL(path, this.baseUrl), {
      ...init,
      headers,
      redirect: "error",
      signal:
        signal === undefined
          ? AbortSignal.timeout(30_000)
          : AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    });
    if (!response.ok) throw new ControlPlaneRequestError(response.status);
    if (
      expectJsonEnvelope &&
      !(response.headers.get("content-type") ?? "").includes("application/json")
    ) {
      throw new ControlPlaneRequestError(502);
    }
    return response;
  }
}
