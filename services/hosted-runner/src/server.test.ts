import { once } from "node:events";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  CODEX_ATTEMPT_TIMEOUT_MS,
  createHostedRunnerServer,
  verifiedHostedRunnerReleaseIdentity,
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
  onJobSettled?: HostedRunnerServerOptions["onJobSettled"],
  releaseIdentity?: HostedRunnerServerOptions["releaseIdentity"],
) {
  const server = createHostedRunnerServer({
    generationFilesystemReadIsolation: "OS_ENFORCED",
    authorizeToken,
    processJob,
    ...(onJobSettled === undefined ? {} : { onJobSettled }),
    ...(releaseIdentity === undefined ? {} : { releaseIdentity }),
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
  it("keeps the Codex process deadline within the signed attempt budget", () => {
    expect(CODEX_ATTEMPT_TIMEOUT_MS).toBe(120_000);
  });

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
    const runnerSourceCommit = "b".repeat(40);
    const runnerImageDigest = `sha256:${"c".repeat(64)}`;
    const generationIsolationEvidenceSha256 = "d".repeat(64);
    const generationIsolationProbeSha256 = "e".repeat(64);
    const baseUrl = await start(processJob, undefined, undefined, {
      runnerSourceCommit,
      runnerImageDigest,
      generationIsolationEvidenceSha256,
      generationIsolationProbeSha256,
    });

    const ready = await fetch(`${baseUrl}/ready`);
    const live = await fetch(`${baseUrl}/live`);
    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({
      status: "live",
      service: "counterlab-hosted-runner",
    });
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({
      status: "ready",
      service: "counterlab-hosted-runner",
      generationFilesystemReadIsolation: "OS_ENFORCED",
      runnerSourceCommit,
      runnerImageDigest,
      generationIsolationEvidenceSha256,
      generationIsolationProbeSha256,
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

  it("fails release identity closed on partial or stale isolation evidence", () => {
    const exact = {
      runnerSourceCommit: "b".repeat(40),
      runnerImageDigest: `sha256:${"c".repeat(64)}`,
      generationIsolationEvidenceSha256: "d".repeat(64),
      generationIsolationProbeSha256: "e".repeat(64),
    };
    expect(verifiedHostedRunnerReleaseIdentity(exact, "e".repeat(64))).toEqual(
      exact,
    );
    expect(
      verifiedHostedRunnerReleaseIdentity(
        {
          runnerSourceCommit: "",
          runnerImageDigest: "",
          generationIsolationEvidenceSha256: "",
          generationIsolationProbeSha256: "",
        },
        "e".repeat(64),
      ),
    ).toBeUndefined();
    expect(() =>
      verifiedHostedRunnerReleaseIdentity(
        { ...exact, generationIsolationEvidenceSha256: "" },
        "e".repeat(64),
      ),
    ).toThrow(/exact source commit/u);
    expect(() =>
      verifiedHostedRunnerReleaseIdentity(exact, "f".repeat(64)),
    ).toThrow(/startup probe/u);
  });

  it("signals one-shot lifecycle cleanup only after the accepted job settles", async () => {
    let finishJob: (() => void) | undefined;
    const processJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishJob = resolve;
        }),
    );
    const onJobSettled = vi.fn(async () => undefined);
    const baseUrl = await start(
      processJob,
      (token) => Promise.resolve(token === "scoped-token"),
      onJobSettled,
    );

    const accepted = await fetch(`${baseUrl}/jobs`, {
      method: "POST",
      headers: {
        authorization: "Bearer scoped-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        schemaVersion: "1",
        jobId: "runner_job_one_shot",
        controlPlaneUrl: "https://counterlab.example.test",
      }),
    });
    expect(accepted.status).toBe(202);
    expect(onJobSettled).not.toHaveBeenCalled();

    finishJob?.();
    await vi.waitFor(() =>
      expect(onJobSettled).toHaveBeenCalledExactlyOnceWith({
        jobId: "runner_job_one_shot",
      }),
    );
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
