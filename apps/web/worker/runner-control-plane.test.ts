// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import type { RunnerJob } from "@counterlab/contracts";

import { HttpRunnerDispatcher } from "./runner-control-plane";

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

describe("HttpRunnerDispatcher", () => {
  it("dispatches one scoped job to a loopback process runner", async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ accepted: true }), { status: 202 }),
    );
    const dispatcher = new HttpRunnerDispatcher({
      baseURL: "http://127.0.0.1:8788/",
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
      }),
    );
  });

  it("rejects insecure non-loopback runners and credential-bearing URLs", () => {
    expect(
      () => new HttpRunnerDispatcher({ baseURL: "http://runner.example.test" }),
    ).toThrow(/HTTPS/i);
    expect(
      () =>
        new HttpRunnerDispatcher({
          baseURL: "https://user:pass@runner.example.test",
        }),
    ).toThrow(/credentials/i);
  });

  it("fails dispatch when the process service does not accept the job", async () => {
    const dispatcher = new HttpRunnerDispatcher({
      baseURL: "https://runner.example.test",
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
});
