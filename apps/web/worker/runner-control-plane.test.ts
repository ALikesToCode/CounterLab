// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { RunnerJob } from "@counterlab/contracts";

import {
  CloudflareContainerRunnerDispatcher,
  HttpRunnerDispatcher,
} from "./runner-control-plane";

const job: RunnerJob = {
  schemaVersion: "1",
  jobId: "runner_job_1",
  kind: "LAB_COMPILE",
  status: "STARTING",
  sessionId: "session_1",
  artifactId: "artifact_1",
  artifactManifestHash: "a".repeat(64),
  conceptPack: { id: "entity_leakage", version: "2.0.0" },
  inputHashes: ["b".repeat(64)],
  stateVersion: 4,
  jobVersion: 2,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:01.000Z",
  attempt: 0,
  maxAttempts: 2,
  runnerIdentity: "counterlab-process-runner-v1",
  timeoutSeconds: 180,
  outputHashes: [],
  eventCursor: 0,
};
const runnerImageDigest = `sha256:${"c".repeat(64)}`;
const runnerSourceCommit = "b".repeat(40);
const runnerReleaseIdentity = { runnerSourceCommit, runnerImageDigest };

describe("HttpRunnerDispatcher", () => {
  it("starts and probes the digest-bound Container readiness instance", async () => {
    const startAndWaitForPorts = vi.fn(async () => undefined);
    const readyResponse = new Response(
      JSON.stringify({
        status: "ready",
        service: "counterlab-hosted-runner",
        generationFilesystemReadIsolation: "OS_ENFORCED",
        runnerSourceCommit,
        runnerImageDigest,
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
    const fetch = vi.fn(async () => readyResponse);
    const getByName = vi.fn(() => ({ startAndWaitForPorts, fetch }));
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      { getByName },
      {},
      runnerReleaseIdentity,
    );

    await expect(dispatcher.ready()).resolves.toBe(true);
    expect(getByName).toHaveBeenCalledWith(
      `counterlab-readiness-${"c".repeat(64)}`,
    );
    expect(startAndWaitForPorts).toHaveBeenCalledWith({
      ports: [8080],
      cancellationOptions: {
        instanceGetTimeoutMS: 10_000,
        portReadyTimeoutMS: 30_000,
      },
      startOptions: {
        envVars: {},
        entrypoint: ["/usr/local/bin/node", "/app/runner.mjs"],
      },
    });
    expect(fetch).toHaveBeenCalledWith("http://runner.internal/ready", {
      method: "GET",
      headers: { accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(readyResponse.bodyUsed).toBe(true);
  });

  it.each([
    ["startup failure", "startup"],
    ["unhealthy status", "status"],
    ["invalid response", "schema"],
    ["stale source identity", "source"],
    ["stale image identity", "image"],
    ["partial filesystem isolation", "isolation"],
  ])("fails Container readiness closed on %s", async (_label, failure) => {
    const startAndWaitForPorts = vi.fn(async () => {
      if (failure === "startup") throw new Error("image did not start");
    });
    const fetch = vi.fn(async () => {
      if (failure === "status") {
        return new Response(JSON.stringify({ status: "not-ready" }), {
          status: 503,
        });
      }
      const payload = {
        status: "ready",
        service:
          failure === "schema" ? "wrong-runner" : "counterlab-hosted-runner",
        generationFilesystemReadIsolation:
          failure === "isolation" ? "PARTIAL" : "OS_ENFORCED",
        runnerSourceCommit:
          failure === "source" ? "d".repeat(40) : runnerSourceCommit,
        runnerImageDigest:
          failure === "image" ? `sha256:${"e".repeat(64)}` : runnerImageDigest,
      };
      return new Response(JSON.stringify(payload), { status: 200 });
    });
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      { getByName: () => ({ startAndWaitForPorts, fetch }) },
      {},
      runnerReleaseIdentity,
    );

    await expect(dispatcher.ready()).resolves.toBe(false);
  });

  it.each([
    [
      "invalid source commit",
      { runnerSourceCommit: "main", runnerImageDigest },
    ],
    [
      "invalid image digest",
      { runnerSourceCommit, runnerImageDigest: "counterlab-runner:latest" },
    ],
  ])("rejects %s before acquiring a Container", (_label, identity) => {
    const getByName = vi.fn();

    expect(
      () =>
        new CloudflareContainerRunnerDispatcher({ getByName }, {}, identity),
    ).toThrow(/must be exact for readiness/u);
    expect(getByName).not.toHaveBeenCalled();
  });

  it("dispatches one scoped job to a loopback process runner", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    );
    const dispatcher = new HttpRunnerDispatcher({
      baseURL: "http://127.0.0.1:8788/",
      releaseIdentity: runnerReleaseIdentity,
      fetch: fetcher,
    });

    await dispatcher.dispatch({
      job,
      token: "scoped-job-token",
      controlPlaneUrl: "http://127.0.0.1:5173",
    });

    expect(dispatcher.identity).toBe("counterlab-process-runner-v1");
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:8788/jobs",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer scoped-job-token",
          "content-type": "application/json",
        }),
        body: JSON.stringify({
          schemaVersion: "1",
          jobId: job.jobId,
          controlPlaneUrl: "http://127.0.0.1:5173",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("redelivers a Container job when the first dispatch acknowledgement is lost", async () => {
    const fetch = vi
      .fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>()
      .mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ accepted: true, reused: true }), {
          status: 202,
        }),
      );
    const startAndWaitForPorts = vi.fn(async () => undefined);
    const getByName = vi.fn(() => ({ fetch, startAndWaitForPorts }));
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      { getByName },
      {},
      runnerReleaseIdentity,
    );

    await expect(
      dispatcher.dispatch({
        job,
        token: "scoped-job-token",
        controlPlaneUrl: "https://studio.example.test",
      }),
    ).resolves.toBeUndefined();

    expect(getByName).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("retries Container startup when instance acquisition fails transiently", async () => {
    const startAndWaitForPorts = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(
        new DOMException("instance unavailable", "TimeoutError"),
      )
      .mockResolvedValueOnce(undefined);
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    );
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      { getByName: () => ({ startAndWaitForPorts, fetch }) },
      {},
      runnerReleaseIdentity,
    );

    await expect(
      dispatcher.dispatch({
        job,
        token: "scoped-job-token",
        controlPlaneUrl: "https://studio.example.test",
      }),
    ).resolves.toBeUndefined();

    expect(startAndWaitForPorts).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("starts a job Container with the bounded secret environment before dispatch", async () => {
    const startAndWaitForPorts = vi.fn(async () => undefined);
    const accepted = new Response(JSON.stringify({ accepted: true }), {
      status: 202,
    });
    const fetch = vi.fn(async () => accepted);
    const environment = {
      CODEX_AUTH_JSON: '{"auth_mode":"chatgpt"}',
      COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY: "runner-public-key",
      PORT: "8080",
    };
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      { getByName: () => ({ startAndWaitForPorts, fetch }) },
      environment,
      runnerReleaseIdentity,
    );

    await dispatcher.dispatch({
      job,
      token: "scoped-job-token",
      controlPlaneUrl: "https://studio.example.test",
    });

    expect(startAndWaitForPorts).toHaveBeenCalledOnce();
    expect(startAndWaitForPorts).toHaveBeenCalledWith({
      ports: [8080],
      cancellationOptions: {
        instanceGetTimeoutMS: 10_000,
        portReadyTimeoutMS: 30_000,
      },
      startOptions: {
        envVars: environment,
        entrypoint: ["/usr/local/bin/node", "/app/runner.mjs"],
      },
    });
    expect(startAndWaitForPorts.mock.invocationCallOrder[0]).toBeLessThan(
      fetch.mock.invocationCallOrder[0] ?? 0,
    );
    expect(accepted.bodyUsed).toBe(true);
  });

  it("releases the Container response after cancelling a scoped job", async () => {
    const cancelled = new Response(JSON.stringify({ cancelled: true }), {
      status: 202,
    });
    const fetch = vi.fn(async () => cancelled);
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      {
        getByName: () => ({
          startAndWaitForPorts: vi.fn(async () => undefined),
          fetch,
        }),
      },
      {},
      runnerReleaseIdentity,
    );

    await dispatcher.cancel({
      job,
      token: "scoped-job-token",
      controlPlaneUrl: "https://studio.example.test",
    });

    expect(cancelled.bodyUsed).toBe(true);
  });

  it("does not redeliver a definitively rejected Container job", async () => {
    const startAndWaitForPorts = vi.fn(async () => undefined);
    const fetch = vi.fn(async () => new Response(null, { status: 403 }));
    const dispatcher = new CloudflareContainerRunnerDispatcher(
      {
        getByName: () => ({ fetch, startAndWaitForPorts }),
      },
      {},
      runnerReleaseIdentity,
    );

    await expect(
      dispatcher.dispatch({
        job,
        token: "invalid-job-token",
        controlPlaneUrl: "https://studio.example.test",
      }),
    ).rejects.toThrow(/status 403/i);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("probes readiness and cancels only the scoped job", async () => {
    const fetcher = vi.fn<typeof fetch>(async (_input, init) =>
      init?.method === "DELETE"
        ? new Response(JSON.stringify({ cancelled: true }), { status: 202 })
        : new Response(
            JSON.stringify({
              status: "ready",
              service: "counterlab-hosted-runner",
              generationFilesystemReadIsolation: "OS_ENFORCED",
              runnerSourceCommit,
              runnerImageDigest,
            }),
            { status: 200 },
          ),
    );
    const dispatcher = new HttpRunnerDispatcher({
      baseURL: "https://runner.example.test",
      releaseIdentity: runnerReleaseIdentity,
      fetch: fetcher,
    });
    const request = {
      job,
      token: "scoped-job-token",
      controlPlaneUrl: "https://studio.example.test",
    };

    await expect(dispatcher.ready()).resolves.toBe(true);
    await dispatcher.cancel(request);

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "https://runner.example.test/ready",
      expect.objectContaining({ method: "GET" }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      `https://runner.example.test/jobs/${job.jobId}`,
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          authorization: "Bearer scoped-job-token",
        }),
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("rejects insecure non-loopback runners and credential-bearing URLs", () => {
    expect(
      () =>
        new HttpRunnerDispatcher({
          baseURL: "http://runner.example.test",
          releaseIdentity: runnerReleaseIdentity,
        }),
    ).toThrow(/HTTPS/i);
    expect(
      () =>
        new HttpRunnerDispatcher({
          baseURL: "https://user:pass@runner.example.test",
          releaseIdentity: runnerReleaseIdentity,
        }),
    ).toThrow(/credentials/i);
  });

  it("fails dispatch when the process service does not accept the job", async () => {
    const dispatcher = new HttpRunnerDispatcher({
      baseURL: "https://runner.example.test",
      releaseIdentity: runnerReleaseIdentity,
      fetch: vi.fn<typeof fetch>(
        async () => new Response(null, { status: 503 }),
      ),
    });

    await expect(
      dispatcher.dispatch({
        job,
        token: "scoped-job-token",
        controlPlaneUrl: "https://studio.example.test",
      }),
    ).rejects.toThrow(/status 503/i);
  });

  it.each([
    ["stale source", "d".repeat(40), runnerImageDigest],
    ["stale image", runnerSourceCommit, `sha256:${"e".repeat(64)}`],
  ])("fails HTTP readiness closed for %s", async (_label, source, image) => {
    const dispatcher = new HttpRunnerDispatcher({
      baseURL: "https://runner.example.test",
      releaseIdentity: runnerReleaseIdentity,
      fetch: vi.fn<typeof fetch>(
        async () =>
          new Response(
            JSON.stringify({
              status: "ready",
              service: "counterlab-hosted-runner",
              generationFilesystemReadIsolation: "OS_ENFORCED",
              runnerSourceCommit: source,
              runnerImageDigest: image,
            }),
            { status: 200 },
          ),
      ),
    });

    await expect(dispatcher.ready()).resolves.toBe(false);
  });

  it("requires an exact expected identity for an HTTP runner", () => {
    expect(
      () =>
        new HttpRunnerDispatcher({
          baseURL: "https://runner.example.test",
          releaseIdentity: {
            runnerSourceCommit: "main",
            runnerImageDigest,
          },
        }),
    ).toThrow(/source commit must be exact/i);
  });
});
