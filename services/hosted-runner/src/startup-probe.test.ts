import { describe, expect, it, vi } from "vitest";

import {
  createGenerationIsolationProbePayload,
  hashGenerationIsolationProbe,
  runHostedRunnerStartupProbe,
} from "./startup-probe.js";

const BUBBLEWRAP_OUTPUT = {
  forbiddenHostPathsHidden: true,
  parentEnvironmentHidden: true,
  workspaceVisible: true,
  workspaceWritable: true,
} as const;

describe("hosted runner startup probe", () => {
  it("checks the real runtime chain without propagating credentials", async () => {
    const access = vi.fn(async (_path: string, _mode?: number) => undefined);
    const mkdir = vi.fn(
      async (_path: string, _options: { recursive: true; mode: number }) =>
        undefined,
    );
    const execute = vi.fn(
      async (
        _executable: string,
        _args: string[],
        _options: { env: NodeJS.ProcessEnv; timeout: number },
      ) =>
        _executable === "/runtime/bwrap" && _args[0] === "--version"
          ? { stdout: "bubblewrap 0.11.0\n" }
          : _executable === "/runtime/bwrap"
            ? { stdout: `${JSON.stringify(BUBBLEWRAP_OUTPUT)}\n` }
            : { stdout: "" },
    );
    const writeFile = vi.fn(async () => undefined);
    const stat = vi.fn(async (path: string) => ({
      uid: 0,
      gid: 0,
      mode: 0o555,
      isDirectory: () => path === "/runtime/app",
      isFile: () => path === "/runtime/runner.mjs",
    }));

    const result = await runHostedRunnerStartupProbe({
      environment: {
        PATH: "/runtime/bin",
        CODEX_AUTH_JSON: "must-not-propagate",
        OPENAI_API_KEY: "must-not-propagate",
        COUNTERLAB_RUNNER_WORK_ROOT: "/runtime/jobs",
        COUNTERLAB_CODEX_HOME_ROOT: "/runtime/codex",
        COUNTERLAB_CODEX_EXECUTABLE: "/runtime/codex-bin",
        COUNTERLAB_CODEX_ROOT: "/runtime/codex-package",
        COUNTERLAB_BWRAP_EXECUTABLE: "/runtime/bwrap",
        COUNTERLAB_SETPRIV_EXECUTABLE: "/runtime/setpriv",
        COUNTERLAB_PYTHON_EXECUTABLE: "/runtime/python",
      },
      nodeExecutable: "/runtime/node",
      bundlePath: "/runtime/runner.mjs",
      appRoot: "/runtime/app",
      access: access as unknown as typeof import("node:fs/promises").access,
      mkdir: mkdir as unknown as typeof import("node:fs/promises").mkdir,
      stat: stat as unknown as typeof import("node:fs/promises").stat,
      writeFile:
        writeFile as unknown as typeof import("node:fs/promises").writeFile,
      getUid: () => 10001,
      getGid: () => 10001,
      execute,
    });

    expect(result).toEqual({
      status: "ready",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: [
        "entrypoint",
        "non-root-user",
        "immutable-paths",
        "codex",
        "python",
        "bubblewrap",
        "bubblewrap-read-isolation",
        "setpriv",
        "writable-roots",
      ],
      generationFilesystemReadIsolation: "OS_ENFORCED",
      generationIsolationProbe: {
        schemaVersion: "1",
        probeVersion: "counterlab-generation-isolation-v1",
        service: "counterlab-hosted-runner",
        probe: "non-root-startup",
        checks: [
          "entrypoint",
          "non-root-user",
          "immutable-paths",
          "codex",
          "python",
          "bubblewrap",
          "bubblewrap-read-isolation",
          "setpriv",
          "writable-roots",
        ],
        generationFilesystemReadIsolation: "OS_ENFORCED",
        bubblewrapVersion: "0.11.0",
        bubblewrap: BUBBLEWRAP_OUTPUT,
      },
      generationIsolationProbeSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(result.generationIsolationProbeSha256).toBe(
      hashGenerationIsolationProbe(result.generationIsolationProbe),
    );
    expect(result.generationIsolationProbeSha256).toBe(
      "700cc58bedc163846e3854415170f49f55da9fd3ba316cc4967747d5268199dc",
    );
    expect(stat.mock.calls.map(([path]) => path)).toEqual([
      "/runtime/app",
      "/runtime/runner.mjs",
    ]);
    expect(access.mock.calls.map(([path]) => path)).toEqual([
      "/runtime/node",
      "/runtime/runner.mjs",
      "/runtime/codex-bin",
      "/runtime/codex-package",
      "/runtime/bwrap",
      "/runtime/setpriv",
      "/runtime/python",
    ]);
    expect(mkdir).toHaveBeenCalledWith("/runtime/jobs", {
      recursive: true,
      mode: 0o700,
    });
    expect(mkdir).toHaveBeenCalledWith("/runtime/codex", {
      recursive: true,
      mode: 0o700,
    });
    expect(mkdir).toHaveBeenCalledWith("/runtime/jobs/.isolation-probe", {
      recursive: true,
      mode: 0o700,
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/runtime/jobs/.isolation-probe/approved.txt",
      "approved\n",
      { encoding: "utf8", flag: "w", mode: 0o600 },
    );
    expect(execute).toHaveBeenCalledTimes(5);
    for (const [, , options] of execute.mock.calls) {
      expect(options.env).not.toHaveProperty("CODEX_AUTH_JSON");
      expect(options.env).not.toHaveProperty("OPENAI_API_KEY");
    }
    expect(execute.mock.calls[3]?.slice(0, 2)).toEqual([
      "/runtime/bwrap",
      ["--version"],
    ]);
    const [probeExecutable, probeArgs, probeOptions] =
      execute.mock.calls[4] ?? [];
    expect(probeExecutable).toBe("/runtime/bwrap");
    expect(probeArgs).toContain("--unshare-user");
    expect(probeArgs).toContain("--unshare-pid");
    expect(probeArgs).toContain("--clearenv");
    expect(probeArgs?.join(" ")).toContain("/usr/bin/setpriv");
    expect(probeArgs?.join(" ")).toContain("/opt/codex/bin/codex");
    expect(probeArgs).toContain("/runtime/jobs/.isolation-probe");
    expect(probeArgs).not.toContain("/runtime/jobs");
    expect(probeOptions?.env).toEqual({
      CODEX_HOME: "/home/counterlab",
      HOME: "/home/counterlab",
      LANG: "C.UTF-8",
      PATH: "/usr/bin",
      TMPDIR: "/tmp",
    });
  });

  it("fails closed when a runtime executable cannot be launched", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        bundlePath: "/app/runner.mjs",
        access: async () => undefined,
        mkdir: async () => undefined as never,
        writeFile: async () => undefined,
        stat: (async (
          path: Parameters<typeof import("node:fs/promises").stat>[0],
        ) => ({
          uid: 0,
          gid: 0,
          mode: 0o555,
          isDirectory: () => path === "/app",
          isFile: () => path === "/app/runner.mjs",
        })) as unknown as typeof import("node:fs/promises").stat,
        getUid: () => 10001,
        getGid: () => 10001,
        execute: async () => {
          throw new Error("not executable");
        },
      }),
    ).rejects.toThrow("not executable");
  });

  it("reports exact immutable-path evidence when namespace mapping changes it", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        bundlePath: "/app/runner.mjs",
        stat: (async (
          path: Parameters<typeof import("node:fs/promises").stat>[0],
        ) => ({
          uid: 65_534,
          gid: 65_534,
          mode: path === "/app" ? 0o755 : 0o555,
          isDirectory: () => path === "/app",
          isFile: () => path === "/app/runner.mjs",
        })) as unknown as typeof import("node:fs/promises").stat,
        getUid: () => 10_001,
        getGid: () => 10_001,
      }),
    ).rejects.toThrow(
      "root:root 0555 policy; app=directory 65534:65534 755; bundle=file 65534:65534 555",
    );
  });

  it.each([
    ["missing stdout", undefined],
    ["invalid JSON", { stdout: "not-json" }],
    [
      "a false isolation check",
      {
        stdout: JSON.stringify({
          ...BUBBLEWRAP_OUTPUT,
          parentEnvironmentHidden: false,
        }),
      },
    ],
    [
      "an unknown isolation field",
      {
        stdout: JSON.stringify({
          ...BUBBLEWRAP_OUTPUT,
          unverifiedClaim: true,
        }),
      },
    ],
  ])("fails closed when Bubblewrap returns %s", async (_label, probeResult) => {
    let invocation = 0;
    await expect(
      runHostedRunnerStartupProbe({
        bundlePath: "/app/runner.mjs",
        access: async () => undefined,
        mkdir: async () => undefined as never,
        writeFile: async () => undefined,
        stat: (async (
          path: Parameters<typeof import("node:fs/promises").stat>[0],
        ) => ({
          uid: 0,
          gid: 0,
          mode: 0o555,
          isDirectory: () => path === "/app",
          isFile: () => path === "/app/runner.mjs",
        })) as unknown as typeof import("node:fs/promises").stat,
        getUid: () => 10001,
        getGid: () => 10001,
        execute: async () => {
          invocation += 1;
          if (invocation === 4) return { stdout: "bubblewrap 0.11.0\n" };
          return invocation === 5 ? probeResult : { stdout: "" };
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects a Bubblewrap version that differs from the pinned image", () => {
    expect(() =>
      createGenerationIsolationProbePayload(
        BUBBLEWRAP_OUTPUT,
        "bubblewrap 0.11.1",
      ),
    ).toThrow("requires bubblewrap 0.11.0; observed bubblewrap 0.11.1");
  });

  it("fails closed when PID 1 is not the declared non-root identity", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        getUid: () => 0,
        getGid: () => 0,
      }),
    ).rejects.toThrow(
      "Hosted runner startup probe requires uid/gid 10001:10001; observed 0:0",
    );
  });
});
