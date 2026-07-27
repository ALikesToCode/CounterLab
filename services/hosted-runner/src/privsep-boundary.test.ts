import { EventEmitter } from "node:events";
import type { Socket } from "node:net";

import { describe, expect, it } from "vitest";

import { PrivsepCodexLaunchBoundary } from "./privsep-boundary.js";
import {
  PRIVSEP_MAX_GENERATION_LAUNCHES,
  PRIVSEP_PROTOCOL_VERSION,
} from "./privsep-protocol.js";

class DelayedBrokerSocket extends EventEmitter {
  ended = false;

  write(requestLine: string): boolean {
    const request = JSON.parse(requestLine.trim()) as {
      requestId: string;
      operation: string;
    };
    queueMicrotask(() => {
      this.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({
            protocolVersion: PRIVSEP_PROTOCOL_VERSION,
            requestId: request.requestId,
            status: "ok",
            operation: "probe",
            payload: {
              brokerUid: 0,
              brokerGid: 0,
              runnerUid: 10_001,
              runnerGid: 10_001,
              generatorUid: 10_002,
              generatorGid: 10_002,
              generatorSupplementaryGroupsCleared: true,
              generatorCapabilitiesEmpty: true,
              generatorNoNewPrivileges: true,
              protectedPathsUnreadable: true,
              protectedPathsUnwritable: true,
              parentEnvironmentUnreadable: true,
              brokerEnvironmentUnreadable: true,
              workspaceVisible: true,
              workspaceWritable: true,
              outsideWorkspaceWritesDenied: true,
              fixedKernelUnavailable: true,
              credentialReadOnlyDuringInitialization: true,
              credentialRevocationSupported: true,
              boundedLaunchesEnforced: true,
              maximumLaunches: PRIVSEP_MAX_GENERATION_LAUNCHES,
            },
          })}\n`,
        ),
      );
      this.emit("close");
    });
    return true;
  }

  end(): this {
    this.ended = true;
    queueMicrotask(() => this.emit("close"));
    return this;
  }

  destroy(): this {
    return this;
  }
}

class RejectedProbeSocket extends EventEmitter {
  write(requestLine: string): boolean {
    const request = JSON.parse(requestLine.trim()) as {
      requestId: string;
    };
    queueMicrotask(() => {
      this.emit(
        "data",
        Buffer.from(
          `${JSON.stringify({
            protocolVersion: PRIVSEP_PROTOCOL_VERSION,
            requestId: request.requestId,
            status: "error",
            code: "BROKER_FAILURE",
            probeFailure: "no-new-privs",
          })}\n`,
        ),
      );
      this.emit("close");
    });
    return true;
  }

  destroy(): this {
    return this;
  }
}

describe("PrivsepCodexLaunchBoundary", () => {
  it("keeps the control socket open while an asynchronous probe responds", async () => {
    const socket = new DelayedBrokerSocket();
    const boundary = new PrivsepCodexLaunchBoundary({
      workspaceRoot: "/work/jobs",
      codexExecutable: "/opt/codex/bin/codex",
      runnerNodeExecutable: "/usr/local/bin/node",
      clientBundle: "/app/privsep-client.mjs",
      connect: (() => {
        queueMicrotask(() => socket.emit("connect"));
        return socket as unknown as Socket;
      }) as typeof import("node:net").connect,
    });

    await expect(boundary.probe()).resolves.toMatchObject({
      brokerUid: 0,
      runnerUid: 10_001,
      generatorUid: 10_002,
      maximumLaunches: PRIVSEP_MAX_GENERATION_LAUNCHES,
    });
    expect(socket.ended).toBe(false);
  });

  it("propagates only an allowlisted probe failure code", async () => {
    const socket = new RejectedProbeSocket();
    const boundary = new PrivsepCodexLaunchBoundary({
      workspaceRoot: "/work/jobs",
      codexExecutable: "/opt/codex/bin/codex",
      runnerNodeExecutable: "/usr/local/bin/node",
      clientBundle: "/app/privsep-client.mjs",
      connect: (() => {
        queueMicrotask(() => socket.emit("connect"));
        return socket as unknown as Socket;
      }) as typeof import("node:net").connect,
    });

    await expect(boundary.probe()).rejects.toMatchObject({
      name: "PrivsepProbeFailureError",
      message: "Privilege broker isolation probe was rejected.",
      probeFailure: "no-new-privs",
    });
  });
});
