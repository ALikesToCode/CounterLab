import { describe, expect, it, vi } from "vitest";

import { HttpRunnerControlPlane } from "./control-plane-client.js";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpRunnerControlPlane", () => {
  it("uses only the scoped job routes and keeps the token in authorization headers", async () => {
    const token = "scoped-runner-token";
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : input);
      const authorization = new Headers(init?.headers).get("authorization");
      expect(authorization).toBe(`Bearer ${token}`);
      expect(url.pathname).toMatch(/^\/api\/runner\/jobs\/job_1\//u);
      if (url.pathname.endsWith("/candidate")) {
        return json({
          status: "VERIFIED",
          canRepair: false,
          nextCursor: 4,
          verifierDurationMs: 9,
          counterexamples: [],
        });
      }
      if (url.pathname.includes("/outputs/")) {
        return json({ sha256: "a".repeat(64) }, 201);
      }
      return json({});
    });
    const client = new HttpRunnerControlPlane({
      controlPlaneUrl: "http://127.0.0.1:8787",
      jobId: "job_1",
      token,
      fetch: fetcher,
    });

    await client.start();
    await client.resume();
    await client.appendEvent({
      schemaVersion: "1",
      eventId: "event_1",
      jobId: "job_1",
      cursor: 1,
      at: "2026-07-14T10:00:00.000Z",
      kind: "job.started",
    });
    await expect(client.upload("experiment-plan.json", "{}")).resolves.toEqual({
      sha256: "a".repeat(64),
    });
    await expect(
      client.candidate({ attempt: 1, planSha256: "a".repeat(64) }),
    ).resolves.toMatchObject({ status: "VERIFIED" });
    expect(fetcher).toHaveBeenCalledTimes(5);
  });

  it("rejects non-HTTPS remote control planes and never includes the token in errors", async () => {
    expect(
      () =>
        new HttpRunnerControlPlane({
          controlPlaneUrl: "http://counterlab.example.test",
          jobId: "job_1",
          token: "top-secret-token",
        }),
    ).toThrow(/https/i);

    const client = new HttpRunnerControlPlane({
      controlPlaneUrl: "http://127.0.0.1:8787",
      jobId: "job_1",
      token: "top-secret-token",
      fetch: vi.fn<typeof fetch>(
        async () => new Response("no", { status: 401 }),
      ),
    });
    const error = await client.start().catch((caught) => caught);
    expect(String(error)).not.toContain("top-secret-token");
    expect(error).toMatchObject({ status: 401 });
  });

  it("permits a loopback control plane in production local-runner mode", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(
      () =>
        new HttpRunnerControlPlane({
          controlPlaneUrl: "http://localhost:8787",
          jobId: "job_local",
          token: "scoped-local-token",
        }),
    ).not.toThrow();
    vi.unstubAllEnvs();
  });

  it("retries the same terminal callback after a projection conflict", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: false }), {
          status: 409,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(json({ duplicate: true }));
    const client = new HttpRunnerControlPlane({
      controlPlaneUrl: "http://127.0.0.1:8787",
      jobId: "job_1",
      token: "scoped-runner-token",
      fetch: fetcher,
      callbackRetryDelayMs: 0,
    });

    await client.callback({
      schemaVersion: "1",
      callbackId: "callback_1",
      idempotencyKey: "job_1:verified:hash",
      jobId: "job_1",
      stateVersion: 4,
      status: "VERIFIED",
      outputHashes: ["a".repeat(64)],
      finalEventCursor: 0,
      occurredAt: "2026-07-15T00:00:00.000Z",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]?.[1]?.body).toBe(
      fetcher.mock.calls[1]?.[1]?.body,
    );
  });
});
