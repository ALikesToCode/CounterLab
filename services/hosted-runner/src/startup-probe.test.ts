import { describe, expect, it, vi } from "vitest";

import { runHostedRunnerStartupProbe } from "./startup-probe.js";

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
      ) => undefined,
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
    });
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
    expect(execute).toHaveBeenCalledTimes(4);
    for (const [, , options] of execute.mock.calls) {
      expect(options.env).not.toHaveProperty("CODEX_AUTH_JSON");
      expect(options.env).not.toHaveProperty("OPENAI_API_KEY");
    }
    const [probeExecutable, probeArgs, probeOptions] =
      execute.mock.calls[3] ?? [];
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
