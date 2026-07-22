import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  canonicalSupervisorJson,
  parseSupervisorRequest,
  sha256SupervisorBytes,
  validateRuntimeDrainReceipt,
  validateSupervisorReadyReceipt,
} from "./contained-runtime-supervisor-protocol.mjs";

const sessionId = "rt-super123";
const attestationSha256 = "a".repeat(64);

function hashed<T extends Record<string, unknown>>(payload: T) {
  return {
    ...payload,
    receiptPayloadSha256: sha256SupervisorBytes(
      canonicalSupervisorJson(payload),
    ),
  };
}

function drainReceipt() {
  const empty = {
    count: 0,
    entriesSha256: sha256SupervisorBytes(""),
    empty: true,
  };
  return hashed({
    schemaVersion: "2",
    status: "DRAINED",
    sessionId,
    namespace: "counterlab-v6.1",
    attestationSha256,
    tasks: empty,
    containers: empty,
    snapshots: {
      count: 4,
      entriesSha256: "b".repeat(64),
      ownedTransientEmpty: true,
    },
    invocationAliases: empty,
    runcState: empty,
    clientFifos: empty,
    persistedSpecs: {
      count: 2,
      entriesSha256: "c".repeat(64),
      verified: true,
    },
    drainedAt: "2026-07-20T00:00:00.000Z",
  });
}

describe("contained runtime supervisor protocol", () => {
  it("keeps the response side open after a client finishes its request", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/contained-runtime-supervisor.mjs"),
      "utf8",
    );

    expect(source).toContain(
      "const controlServer = createServer({ allowHalfOpen: true }, (socket) => {",
    );
  });

  it("keeps a failed owned-child shutdown retryable", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/contained-runtime-supervisor.mjs"),
      "utf8",
    );
    const shutdownBranch = source.slice(
      source.indexOf('if (request.action === "shutdown")'),
      source.indexOf('throw new Error("runtime supervisor action is invalid")'),
    );

    expect(
      shutdownBranch.indexOf("await shutdownOwnedChildren()"),
    ).toBeGreaterThan(-1);
    expect(shutdownBranch.indexOf('state = "DRAINED"')).toBeGreaterThan(
      shutdownBranch.indexOf("await shutdownOwnedChildren()"),
    );
  });

  it("keeps observer PIDs aligned while isolating every candidate PID namespace", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/contained-runtime-supervisor.mjs"),
      "utf8",
    );
    const rootlessSpecSource = readFileSync(
      resolve(process.cwd(), "scripts/contained-rootless-spec.mjs"),
      "utf8",
    );
    const launch = source.slice(
      source.indexOf("const containerdRootlesskit = spawn("),
      source.indexOf("closeSync(containerdLog)"),
    );

    expect(launch).not.toContain('"--pidns"');
    expect(launch).toContain('"--cgroupns"');
    expect(launch).toContain('"--evacuate-cgroup2=containerd"');
    expect(rootlessSpecSource).toContain(
      'for (const required of ["ipc", "mount", "network", "pid", "uts"])',
    );
    expect(launch).toContain("`--copy-up=${snapshotterRoot}`");
    expect(launch).toContain("`--copy-up=${rootlessSpecRoot}`");
    expect(launch.indexOf("`--copy-up=${snapshotterRoot}`")).toBeLessThan(
      launch.indexOf("scripts/contained-runtime-server.mjs"),
    );
    expect(launch.indexOf("`--copy-up=${rootlessSpecRoot}`")).toBeLessThan(
      launch.indexOf("scripts/contained-runtime-server.mjs"),
    );
    expect(launch.indexOf('"--cgroupns"')).toBeLessThan(
      launch.indexOf("scripts/contained-runtime-server.mjs"),
    );
    expect(launch.indexOf('"--evacuate-cgroup2=containerd"')).toBeLessThan(
      launch.indexOf("scripts/contained-runtime-server.mjs"),
    );
  });

  it("starts BuildKit before the final delegated-cgroup evacuation", () => {
    const source = readFileSync(
      resolve(process.cwd(), "scripts/contained-runtime-supervisor.mjs"),
      "utf8",
    );
    const buildkitLaunch = source.indexOf("const buildkitRootlesskit = spawn(");
    const buildkitReady = source.indexOf(
      "await waitForInitialSocket(",
      buildkitLaunch,
    );
    const containerdLaunch = source.indexOf(
      "const containerdRootlesskit = spawn(",
    );

    expect(buildkitLaunch).toBeGreaterThan(0);
    expect(buildkitReady).toBeGreaterThan(buildkitLaunch);
    expect(containerdLaunch).toBeGreaterThan(buildkitReady);
    expect(
      source.slice(
        containerdLaunch,
        source.indexOf("closeSync(containerdLog)"),
      ),
    ).toContain('"--evacuate-cgroup2=containerd"');
    expect(
      source.slice(
        containerdLaunch,
        source.indexOf("closeSync(containerdLog)"),
      ),
    ).toContain("`--copy-up=${runcStateRoot}`");
  });

  it("accepts only exact hash-bound status, drain, and shutdown requests", () => {
    expect(
      parseSupervisorRequest(
        {
          schemaVersion: "1",
          action: "begin-drain",
          sessionId,
          attestationSha256,
        },
        sessionId,
      ),
    ).toMatchObject({ action: "begin-drain" });
    expect(
      parseSupervisorRequest(
        {
          schemaVersion: "1",
          action: "shutdown",
          sessionId,
          attestationSha256,
          drainReceipt: drainReceipt(),
        },
        sessionId,
      ),
    ).toMatchObject({ action: "shutdown" });
    expect(() =>
      parseSupervisorRequest(
        {
          schemaVersion: "1",
          action: "kill",
          sessionId,
          attestationSha256,
        },
        sessionId,
      ),
    ).toThrow(/action/u);
    expect(() =>
      parseSupervisorRequest(
        {
          schemaVersion: "1",
          action: "status",
          sessionId,
          attestationSha256,
          pid: 42,
        },
        sessionId,
      ),
    ).toThrow(/unknown fields/u);
  });

  it("requires a complete empty transient-resource inventory", () => {
    expect(
      validateRuntimeDrainReceipt(drainReceipt(), {
        sessionId,
        attestationSha256,
      }),
    ).toMatchObject({ status: "DRAINED" });

    const activeTask = drainReceipt();
    activeTask.tasks = {
      count: 1,
      entriesSha256: "d".repeat(64),
      empty: false,
    };
    const { receiptPayloadSha256: _ignored, ...payload } = activeTask;
    expect(() =>
      validateRuntimeDrainReceipt(hashed(payload), {
        sessionId,
        attestationSha256,
      }),
    ).toThrow(/task inventory/u);

    const tampered = drainReceipt();
    tampered.persistedSpecs.count = 3;
    expect(() =>
      validateRuntimeDrainReceipt(tampered, {
        sessionId,
        attestationSha256,
      }),
    ).toThrow(/hash/u);
  });

  it("binds readiness to the exact supervisor and owned child handles", () => {
    const ready = hashed({
      schemaVersion: "1",
      status: "READY",
      sessionId,
      namespace: "counterlab-v6.1",
      supervisorPid: 100,
      childPids: {
        containerdRootlesskit: 101,
        buildkitRootlesskit: 102,
      },
      childHandlesOwned: true,
      supervisorSocket: `.rt/${sessionId}/run/runtime-supervisor.sock`,
      buildkitProxySocket: `.rt/${sessionId}/run/buildkitd.sock`,
      buildkitInnerSocket: `.rt/${sessionId}/run/inner/buildkitd.sock`,
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    const expected = {
      sessionId,
      supervisorSocket: `.rt/${sessionId}/run/runtime-supervisor.sock`,
      buildkitProxySocket: `.rt/${sessionId}/run/buildkitd.sock`,
      buildkitInnerSocket: `.rt/${sessionId}/run/inner/buildkitd.sock`,
    };
    expect(validateSupervisorReadyReceipt(ready, expected)).toMatchObject({
      childHandlesOwned: true,
      supervisorPid: 100,
    });
    expect(() =>
      validateSupervisorReadyReceipt(
        { ...ready, childHandlesOwned: false },
        expected,
      ),
    ).toThrow(/invalid/u);
  });
});
