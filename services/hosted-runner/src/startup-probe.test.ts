import { describe, expect, it, vi } from "vitest";

import {
  createGenerationIsolationProbePayload,
  hashGenerationIsolationProbe,
  runHostedRunnerStartupProbe,
} from "./startup-probe.js";

const PROCESS_IDENTITY_OUTPUT = {
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
  maximumLaunches: 3,
} as const;

describe("hosted runner startup probe", () => {
  it("binds the real broker process-identity probe without credentials", async () => {
    const access = vi.fn(async (_path: string, _mode?: number) => undefined);
    const mkdir = vi.fn(
      async (_path: string, _options: { recursive: true; mode: number }) =>
        undefined,
    );
    const stat = vi.fn(async (path: string) => ({
      uid: 0,
      gid: 10_001,
      mode: path === "/runtime/app" ? 0o550 : 0o440,
      isDirectory: () => path === "/runtime/app",
      isFile: () => path === "/runtime/runner.mjs",
    }));
    const isolationProbe = vi.fn(async () => PROCESS_IDENTITY_OUTPUT);

    const result = await runHostedRunnerStartupProbe({
      environment: {
        COUNTERLAB_RUNNER_WORK_ROOT: "/runtime/jobs",
        COUNTERLAB_CODEX_EXECUTABLE: "/runtime/codex/bin/codex",
        COUNTERLAB_SETPRIV_EXECUTABLE: "/runtime/setpriv",
        COUNTERLAB_PYTHON_EXECUTABLE: "/runtime/python",
      },
      nodeExecutable: "/runtime/node",
      bundlePath: "/runtime/runner.mjs",
      clientBundlePath: "/runtime/privsep-client.mjs",
      appRoot: "/runtime/app",
      access: access as unknown as typeof import("node:fs/promises").access,
      mkdir: mkdir as unknown as typeof import("node:fs/promises").mkdir,
      stat: stat as unknown as typeof import("node:fs/promises").stat,
      getUid: () => 10_001,
      getGid: () => 10_001,
      isolationProbe,
    });

    expect(result).toEqual({
      status: "ready",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: [
        "entrypoint",
        "non-root-user",
        "immutable-paths",
        "python",
        "setpriv",
        "privsep-broker",
        "posix-dac-process-identity",
        "writable-roots",
      ],
      generationFilesystemReadIsolation: "OS_ENFORCED",
      generationIsolationProbe: {
        schemaVersion: "3",
        probeVersion: "counterlab-generation-isolation-v3",
        service: "counterlab-hosted-runner",
        probe: "non-root-startup",
        checks: [
          "entrypoint",
          "non-root-user",
          "immutable-paths",
          "python",
          "setpriv",
          "privsep-broker",
          "posix-dac-process-identity",
          "writable-roots",
        ],
        generationFilesystemReadIsolation: "OS_ENFORCED",
        mechanism: "posix-dac-process-identity",
        brokerIdentity: "0:0",
        runnerIdentity: "10001:10001",
        generatorIdentity: "10002:10002",
        policyVersion: "counterlab-posix-dac-process-policy-v1",
        processIdentity: PROCESS_IDENTITY_OUTPUT,
      },
      generationIsolationProbeSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(result.generationIsolationProbeSha256).toBe(
      hashGenerationIsolationProbe(result.generationIsolationProbe),
    );
    expect(access.mock.calls.map(([path]) => path)).toEqual([
      "/runtime/node",
      "/runtime/runner.mjs",
      "/runtime/privsep-client.mjs",
      "/runtime/setpriv",
      "/runtime/python",
    ]);
    expect(mkdir).toHaveBeenCalledWith("/runtime/jobs", {
      recursive: true,
      mode: 0o710,
    });
    expect(isolationProbe).toHaveBeenCalledOnce();
  });

  it("fails closed when immutable path ownership or modes drift", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        bundlePath: "/app/runner.mjs",
        clientBundlePath: "/app/privsep-client.mjs",
        stat: (async (
          path: Parameters<typeof import("node:fs/promises").stat>[0],
        ) => ({
          uid: 0,
          gid: 0,
          mode: 0o555,
          isDirectory: () => path === "/app",
          isFile: () => path === "/app/runner.mjs",
        })) as unknown as typeof import("node:fs/promises").stat,
        getUid: () => 10_001,
        getGid: () => 10_001,
      }),
    ).rejects.toMatchObject({
      reason: "IMMUTABLE_PATHS_INVALID",
      cause: expect.objectContaining({
        message: expect.stringContaining("root-owned runner-group policy"),
      }),
    });
  });

  it.each([
    ["retained capabilities", { generatorCapabilitiesEmpty: false }],
    ["missing no-new-privileges", { generatorNoNewPrivileges: false }],
    [
      "generator membership in the runner group",
      { generatorSupplementaryGroupsCleared: false },
    ],
    ["readable fixed paths", { protectedPathsUnreadable: false }],
    ["writable outside path", { outsideWorkspaceWritesDenied: false }],
  ])("rejects %s", async (_label, mutation) => {
    expect(() =>
      createGenerationIsolationProbePayload({
        ...PROCESS_IDENTITY_OUTPUT,
        ...mutation,
      }),
    ).toThrow();
  });

  it("fails closed when the broker probe fails", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        bundlePath: "/app/runner.mjs",
        clientBundlePath: "/app/privsep-client.mjs",
        access: async () => undefined,
        mkdir: async () => undefined as never,
        stat: (async (
          path: Parameters<typeof import("node:fs/promises").stat>[0],
        ) => ({
          uid: 0,
          gid: 10_001,
          mode: path === "/app" ? 0o550 : 0o440,
          isDirectory: () => path === "/app",
          isFile: () => path === "/app/runner.mjs",
        })) as unknown as typeof import("node:fs/promises").stat,
        getUid: () => 10_001,
        getGid: () => 10_001,
        isolationProbe: async () => {
          throw new Error("broker rejected probe");
        },
      }),
    ).rejects.toMatchObject({
      reason: "PRIVSEP_PROBE_FAILED",
      cause: expect.objectContaining({ message: "broker rejected probe" }),
    });
  });

  it("fails closed when the runner is not the declared non-root identity", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        getUid: () => 0,
        getGid: () => 0,
      }),
    ).rejects.toMatchObject({
      reason: "PROCESS_IDENTITY_INVALID",
      cause: expect.objectContaining({
        message:
          "Hosted runner startup probe requires uid/gid 10001:10001; observed 0:0",
      }),
    });
  });
});
