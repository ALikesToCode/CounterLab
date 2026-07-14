import { once } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createHostedRunnerServer } from "./server.js";

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
  }) => Promise<void>,
) {
  const server = createHostedRunnerServer({ processJob });
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
    });
  });

  it("rejects missing authentication, oversized JSON, and duplicate active jobs", async () => {
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
    ).toBe(409);
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
});
