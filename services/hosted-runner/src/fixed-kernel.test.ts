import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunnerLabRunBundle } from "@counterlab/contracts";
import type { RunnerBoundaryMapBundleV5 } from "@counterlab/experiment-ir";
import { afterEach, describe, expect, it } from "vitest";

import { PythonFixedKernelExecutor } from "./fixed-kernel.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("PythonFixedKernelExecutor", () => {
  it("uses one fixed module command and a bounded environment", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "counterlab-kernel-job-"));
    workspaces.push(workspace);
    const calls: Array<{
      command: string;
      args: string[];
      options: { cwd: string; timeout: number; env: NodeJS.ProcessEnv };
    }> = [];
    const executor = new PythonFixedKernelExecutor({
      pythonExecutable: "/fixed/python",
      runProcess: async (command, args, options) => {
        calls.push({ command, args, options });
        const outputIndex = args.indexOf("--output") + 1;
        await writeFile(args[outputIndex]!, '{"result":"fixed"}\n', "utf8");
      },
    });

    const result = await executor.run(
      {
        experimentPlan: { resourceLimits: { wallSeconds: 17 } },
      } as RunnerLabRunBundle,
      workspace,
    );

    expect(result.body).toBe('{"result":"fixed"}\n');
    expect(calls).toEqual([
      expect.objectContaining({
        command: "/fixed/python",
        args: [
          "-m",
          "counterlab_kernel.hosted_run",
          "--bundle",
          join(workspace, "lab-run-bundle.json"),
          "--output",
          join(workspace, "verified-result.json"),
        ],
        options: expect.objectContaining({
          cwd: workspace,
          timeout: 17_000,
          env: {
            LANG: "C.UTF-8",
            PATH: "/opt/counterlab-venv/bin:/usr/local/bin:/usr/bin:/bin",
            PYTHONHASHSEED: "0",
          },
        }),
      }),
    ]);
  });

  it("routes a v5 Boundary Map bundle to its only permitted output", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "counterlab-boundary-job-"));
    workspaces.push(workspace);
    const calls: Array<{
      args: string[];
      options: { timeout: number };
    }> = [];
    const executor = new PythonFixedKernelExecutor({
      pythonExecutable: "/fixed/python",
      runProcess: async (_command, args, options) => {
        calls.push({ args, options });
        const outputIndex = args.indexOf("--output") + 1;
        await writeFile(args[outputIndex]!, '{"schemaVersion":"1"}\n', "utf8");
      },
    });

    const result = await executor.run(
      {
        schemaVersion: "5",
        purpose: "BOUNDARY",
        selectedExperimentIr: {
          resourceLimits: { wallSeconds: 23 },
        },
      } as RunnerBoundaryMapBundleV5,
      workspace,
    );

    expect(result.body).toBe('{"schemaVersion":"1"}\n');
    expect(calls).toEqual([
      expect.objectContaining({
        args: expect.arrayContaining([
          "--output",
          join(workspace, "boundary-map.json"),
        ]),
        options: expect.objectContaining({ timeout: 23_000 }),
      }),
    ]);
  });
});
