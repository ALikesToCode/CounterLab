import { once } from "node:events";

import { afterEach, describe, expect, it } from "vitest";

import {
  createHostedRunnerBootstrapServer,
  hostedRunnerStartupFailureDiagnostic,
  hostedRunnerStartupFailureReason,
  hostedRunnerStartupProbeFailure,
  HostedRunnerStartupError,
  runHostedRunnerStartupStage,
} from "./startup-failure.js";
import { PrivsepProbeFailureError } from "./privsep-protocol.js";

const servers: Array<
  ReturnType<typeof createHostedRunnerBootstrapServer>["server"]
> = [];

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

describe("hosted runner startup failure boundary", () => {
  it("binds liveness while startup and failure remain fail-closed", async () => {
    const bootstrap = createHostedRunnerBootstrapServer();
    servers.push(bootstrap.server);
    bootstrap.server.listen(0, "127.0.0.1");
    await once(bootstrap.server, "listening");
    const address = bootstrap.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("startup bootstrap server did not bind a TCP port");
    }

    const live = await fetch(`http://127.0.0.1:${address.port}/live`);
    const starting = await fetch(`http://127.0.0.1:${address.port}/ready`);

    expect(live.status).toBe(200);
    await expect(live.json()).resolves.toEqual({
      status: "live",
      service: "counterlab-hosted-runner",
    });
    expect(starting.status).toBe(503);
    await expect(starting.json()).resolves.toEqual({
      status: "not-ready",
      service: "counterlab-hosted-runner",
      reason: "STARTING",
    });

    bootstrap.fail("STARTUP_PROBE_FAILED");
    const failed = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(failed.status).toBe(503);
    expect(failed.headers.get("cache-control")).toBe("no-store");
    await expect(failed.json()).resolves.toEqual({
      status: "not-ready",
      service: "counterlab-hosted-runner",
      reason: "STARTUP_PROBE_FAILED",
    });

    const rejectedJob = await fetch(`http://127.0.0.1:${address.port}/jobs`, {
      method: "POST",
    });
    expect(rejectedJob.status).toBe(503);
  });

  it("activates the verified handler on the same listener", async () => {
    const bootstrap = createHostedRunnerBootstrapServer();
    servers.push(bootstrap.server);
    bootstrap.server.listen(0, "127.0.0.1");
    await once(bootstrap.server, "listening");
    const address = bootstrap.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("startup bootstrap server did not bind a TCP port");
    }
    bootstrap.activate((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ready" }));
    });

    const ready = await fetch(`http://127.0.0.1:${address.port}/ready`);
    expect(ready.status).toBe(200);
    await expect(ready.json()).resolves.toEqual({ status: "ready" });
  });

  it("maps a failed stage to a fixed reason without exposing its cause", async () => {
    const cause = new Error(
      'Bearer private-token access_token="private-token-value"',
    );

    await expect(
      runHostedRunnerStartupStage("ISOLATION_BOUNDARY_FAILED", async () => {
        throw cause;
      }),
    ).rejects.toMatchObject({
      name: "HostedRunnerStartupError",
      message: "Hosted runner startup failed",
      reason: "ISOLATION_BOUNDARY_FAILED",
      cause,
    });
  });

  it("preserves a specific startup reason and classifies unknown errors", async () => {
    const specific = new HostedRunnerStartupError("CODEX_AUTH_MISSING");

    await expect(
      runHostedRunnerStartupStage("STARTUP_PROBE_FAILED", async () => {
        throw specific;
      }),
    ).rejects.toBe(specific);
    expect(hostedRunnerStartupFailureReason(specific)).toBe(
      "CODEX_AUTH_MISSING",
    );
    expect(hostedRunnerStartupFailureReason(new Error("unknown"))).toBe(
      "RUNNER_STARTUP_FAILED",
    );
  });

  it("reports only allowlisted startup cause classifications", () => {
    const socketError = Object.assign(new Error("private socket path"), {
      code: "EACCES",
    });
    expect(
      hostedRunnerStartupFailureDiagnostic(
        new HostedRunnerStartupError("PRIVSEP_PROBE_FAILED", {
          cause: socketError,
        }),
      ),
    ).toEqual({ causeName: "Error", causeCode: "EACCES" });

    const privateCause = Object.assign(new Error("private-token-value"), {
      name: "PrivateProviderError",
      code: "PRIVATE_TOKEN_VALUE",
    });
    expect(
      hostedRunnerStartupFailureDiagnostic(
        new HostedRunnerStartupError("STARTUP_PROBE_FAILED", {
          cause: privateCause,
        }),
      ),
    ).toEqual({ causeName: "UnknownError" });
  });

  it("exposes only a fixed probe failure code on fail-closed readiness", async () => {
    const bootstrap = createHostedRunnerBootstrapServer();
    servers.push(bootstrap.server);
    bootstrap.server.listen(0, "127.0.0.1");
    await once(bootstrap.server, "listening");
    const address = bootstrap.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("startup bootstrap server did not bind a TCP port");
    }
    const failure = new HostedRunnerStartupError("PRIVSEP_PROBE_FAILED", {
      cause: new PrivsepProbeFailureError("no-new-privs"),
    });

    bootstrap.fail(
      hostedRunnerStartupFailureReason(failure),
      hostedRunnerStartupProbeFailure(failure),
    );
    const response = await fetch(`http://127.0.0.1:${address.port}/ready`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: "not-ready",
      service: "counterlab-hosted-runner",
      reason: "PRIVSEP_PROBE_FAILED",
      probeFailure: "no-new-privs",
    });
  });
});
