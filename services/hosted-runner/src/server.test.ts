import { once } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createHostedRunnerServer,
  type HostedRunnerServerOptions,
} from "./server.js";

const servers: Array<ReturnType<typeof createHostedRunnerServer>> = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function start(
  processJob: (input: {
    jobId: string;
    token: string;
    controlPlaneUrl: string;
    signal: AbortSignal;
  }) => Promise<void>,
  authorizeToken: HostedRunnerServerOptions["authorizeToken"] = (token) =>
    Promise.resolve(token === "scoped-token"),
) {
  const server = createHostedRunnerServer({
    authorizeToken,
    processJob,
  });
  servers.push(server);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("test server did not bind a TCP port");
  }
  return `http://127.0.0.1:${address.port}`;
}

describe("hosted runner HTTP service", () => {
  it("separates dispatch and cancellation token purposes and binds dispatch origin", async () => {
    let release: (() => void) | undefined;
    const authorizeToken = vi.fn<HostedRunnerServerOptions["authorizeToken"]>(
      async () => true,
    );
    const baseUrl = await start(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      authorizeToken,
    );
    const accepted = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        authorization: "Bearer scoped-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: "1",
        jobId: "runner_job_scoped",
        controlPlaneUrl: "https://counterlab.example.test/path-is-normalized",
      }),
    });
    expect(accepted.status).toBe(202);
    expect(authorizeToken).toHaveBeenNthCalledWith(
      1,
      "scoped-token",
      "runner_job_scoped",
      "RUN_JOB",
      "https://counterlab.example.test",
    );

    const cancelled = await fetch(`${baseUrl}/jobs/runner_job_scoped`, {
      method: "DELETE",
      headers: { authorization: "Bearer scoped-token" },
    });
    expect(cancelled.status).toBe(202);
    expect(authorizeToken).toHaveBeenNthCalledWith(
      2,
      "scoped-token",
      "runner_job_scoped",
      "CANCEL_JOB",
    );
    release?.();
  });

  it("accepts one authenticated job and reports readiness without exposing inputs", async () => {
    const processJob = vi.fn(async () => undefined);
    const baseUrl = await start(processJob);

    const ready = await fetch(`${baseUrl}/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      status: "ready",
      service: "counterlab-hosted-runner",
    });

    const accepted = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        authorization: "Bearer scoped-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: "1",
        jobId: "runner_job_1",
        controlPlaneUrl: "https://counterlab.example.test",
      }),
    });
    expect(accepted.status).toBe(202);
    await expect(accepted.json()).resolves.toEqual({
      accepted: true,
      jobId: "runner_job_1",
    });
    await vi.waitFor(() => expect(processJob).toHaveBeenCalledOnce());
    expect(processJob).toHaveBeenCalledWith({
      jobId: "runner_job_1",
      token: "scoped-token",
      controlPlaneUrl: "https://counterlab.example.test",
      signal: expect.any(AbortSignal),
    });
  });

  it("rejects missing authentication and oversized JSON while idempotently accepting duplicate active jobs", async () => {
    let release: (() => void) | undefined;
    const processJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const baseUrl = await start(processJob);
    const body = JSON.stringify({
      schemaVersion: "1",
      jobId: "runner_job_1",
      controlPlaneUrl: "https://counterlab.example.test",
    });

    expect(
      (
        await fetch(`${baseUrl}/jobs`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`${baseUrl}/jobs`, {
          method: "POST",
          headers: {
            authorization: "Bearer scoped-token",
            "content-type": "application/json",
          },
          body,
        })
      ).status,
    ).toBe(202);
    const duplicate = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        authorization: "Bearer scoped-token",
        "content-type": "application/json",
      },
      body,
    });
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toEqual({
      accepted: true,
      reused: true,
      jobId: "runner_job_1",
    });
    expect(processJob).toHaveBeenCalledOnce();
    expect(
      (
        await fetch(`${baseUrl}/jobs`, {
          method: "POST",
          headers: {
            authorization: "Bearer scoped-token",
            "content-type": "application/json",
          },
          body: JSON.stringify({ data: "x".repeat(20_000) }),
        })
      ).status,
    ).toBe(413);
    release?.();
  });

  it("aborts exactly the authenticated active job and makes cancellation idempotent", async () => {
    let observedSignal: AbortSignal | undefined;
    const processJob = vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<void>((resolve) => {
          observedSignal = signal;
          signal.addEventListener("abort", () => resolve(), { once: true });
        }),
    );
    const baseUrl = await start(processJob);
    const body = JSON.stringify({
      schemaVersion: "1",
      jobId: "runner_job_cancel",
      controlPlaneUrl: "https://counterlab.example.test",
    });
    expect(
      (
        await fetch(`${baseUrl}/jobs`, {
          method: "POST",
          headers: {
            authorization: "Bearer scoped-token",
            "content-type": "application/json",
          },
          body,
        })
      ).status,
    ).toBe(202);
    await vi.waitFor(() => expect(observedSignal).toBeDefined());

    const missingAuth = await fetch(`${baseUrl}/jobs/runner_job_cancel`, {
      method: "DELETE",
    });
    expect(missingAuth.status).toBe(401);
    const cancelled = await fetch(`${baseUrl}/jobs/runner_job_cancel`, {
      method: "DELETE",
      headers: { authorization: "Bearer scoped-token" },
    });
    expect(cancelled.status).toBe(202);
    expect(observedSignal?.aborted).toBe(true);
    const duplicate = await fetch(`${baseUrl}/jobs/runner_job_cancel`, {
      method: "DELETE",
      headers: { authorization: "Bearer scoped-token" },
    });
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      cancelled: true,
      reused: true,
    });
  });
});
