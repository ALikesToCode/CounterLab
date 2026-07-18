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

    const result = await runHostedRunnerStartupProbe({
      environment: {
        PATH: "/runtime/bin",
        CODEX_AUTH_JSON: "must-not-propagate",
        OPENAI_API_KEY: "must-not-propagate",
        COUNTERLAB_RUNNER_WORK_ROOT: "/runtime/jobs",
        COUNTERLAB_CODEX_HOME_ROOT: "/runtime/codex",
        COUNTERLAB_CODEX_EXECUTABLE: "/runtime/codex-bin",
        COUNTERLAB_SETPRIV_EXECUTABLE: "/runtime/setpriv",
        COUNTERLAB_PYTHON_EXECUTABLE: "/runtime/python",
      },
      nodeExecutable: "/runtime/node",
      bundlePath: "/runtime/runner.mjs",
      access: access as unknown as typeof import("node:fs/promises").access,
      mkdir: mkdir as unknown as typeof import("node:fs/promises").mkdir,
      execute,
    });

    expect(result).toEqual({
      status: "ready",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: ["entrypoint", "codex", "python", "setpriv", "writable-roots"],
    });
    expect(access.mock.calls.map(([path]) => path)).toEqual([
      "/runtime/node",
      "/runtime/runner.mjs",
      "/runtime/codex-bin",
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
    expect(execute).toHaveBeenCalledTimes(3);
    for (const [, , options] of execute.mock.calls) {
      expect(options.env).not.toHaveProperty("CODEX_AUTH_JSON");
      expect(options.env).not.toHaveProperty("OPENAI_API_KEY");
    }
  });

  it("fails closed when a runtime executable cannot be launched", async () => {
    await expect(
      runHostedRunnerStartupProbe({
        access: async () => undefined,
        mkdir: async () => undefined as never,
        execute: async () => {
          throw new Error("not executable");
        },
      }),
    ).rejects.toThrow("not executable");
  });
});
