import {
  RunnerJobInputBundleSchema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJobInputBundle,
} from "@counterlab/contracts";
import { z } from "zod";

import type { CandidateDecision, RunnerControlPlane } from "./job-processor.js";

const CandidateDecisionSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    canRepair: z.boolean(),
    nextCursor: z.number().int().nonnegative(),
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

  constructor(private readonly options: HttpRunnerControlPlaneOptions) {
    this.baseUrl = new URL(options.controlPlaneUrl);
    if (
      this.baseUrl.protocol !== "https:" &&
      !(
        process.env.NODE_ENV === "test" &&
        ["127.0.0.1", "localhost"].includes(this.baseUrl.hostname)
      )
    ) {
      throw new Error("Runner control plane must use HTTPS");
    }
    this.fetcher = options.fetch ?? fetch;
  }

  async getInput(): Promise<RunnerJobInputBundle> {
    const response = await this.request(
      `/api/runner/jobs/${this.jobId()}/input`,
      { method: "GET" },
      false,
    );
    return RunnerJobInputBundleSchema.parse(await response.json());
  }

  async start(): Promise<void> {
    await this.jsonRequest(`/api/runner/jobs/${this.jobId()}/start`, {
      method: "POST",
    });
  }

  async resume(): Promise<void> {
    await this.jsonRequest(`/api/runner/jobs/${this.jobId()}/resume`, {
      method: "POST",
    });
  }

  async appendEvent(event: PublicCompilerEvent): Promise<void> {
    await this.jsonRequest(`/api/runner/jobs/${this.jobId()}/events`, {
      method: "POST",
      body: JSON.stringify(event),
    });
  }

  async upload(path: string, body: string): Promise<{ sha256: string }> {
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
    );
    return UploadResponseSchema.parse(data);
  }

  async candidate(input: {
    attempt: number;
    planSha256: string;
  }): Promise<CandidateDecision> {
    const data = await this.jsonRequest(
      `/api/runner/jobs/${this.jobId()}/candidate`,
      { method: "POST", body: JSON.stringify(input) },
    );
    return CandidateDecisionSchema.parse(data);
  }

  async callback(callback: RunnerCallback): Promise<void> {
    await this.jsonRequest(`/api/runner/jobs/${this.jobId()}/callback`, {
      method: "POST",
      body: JSON.stringify(callback),
    });
  }

  private jobId(): string {
    return encodeURIComponent(this.options.jobId);
  }

  private async jsonRequest(path: string, init: RequestInit): Promise<unknown> {
    const response = await this.request(path, init, true);
    const envelope = EnvelopeSchema.parse(await response.json());
    return envelope.data;
  }

  private async request(
    path: string,
    init: RequestInit,
    expectJsonEnvelope: boolean,
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
      signal: AbortSignal.timeout(30_000),
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
