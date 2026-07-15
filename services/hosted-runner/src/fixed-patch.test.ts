import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { RunnerPatchCompileBundle } from "@counterlab/contracts";
import { afterEach, describe, expect, it } from "vitest";

import { PythonFixedPatchExecutor } from "./fixed-patch.js";

const workspaces: string[] = [];

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("PythonFixedPatchExecutor", () => {
  it("uses one fixed module command with bounded source and environment", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "counterlab-patch-job-"));
    workspaces.push(workspace);
    const calls: Array<{
      command: string;
      args: string[];
      options: { cwd: string; timeout: number; env: NodeJS.ProcessEnv };
    }> = [];
    const executor = new PythonFixedPatchExecutor({
      pythonExecutable: "/fixed/python",
      leakageFixturePath: "/fixed/leakage.csv",
      imbalanceFixturePath: "/fixed/imbalance.csv",
      runProcess: async (command, args, options) => {
        calls.push({ command, args, options });
        const notebookOutput = args[args.indexOf("--output-notebook") + 1]!;
        const resultOutput = args[args.indexOf("--output-result") + 1]!;
        await writeFile(notebookOutput, '{"cells":[]}\n', "utf8");
        await writeFile(
          resultOutput,
          JSON.stringify({
            schemaVersion: "1",
            id: "patch_job_1",
            sessionId: "session_1",
            status: "VERIFIED",
            sourceArtifactHash: "a".repeat(64),
            patchedArtifactHash: "b".repeat(64),
            patchHash: "c".repeat(64),
            modifiedCells: [3],
            diff: "diff",
            verification: {
              passed: true,
              invariants: ["VALID_NBFORMAT"],
              unchangedCellHashes: ["d".repeat(64)],
            },
            generatedAt: "2026-07-15T00:00:00.000Z",
            resultHash: "e".repeat(64),
          }),
          "utf8",
        );
      },
    });

    const result = await executor.run(
      {
        approvedBeliefTest: { concept: "entity_leakage" },
      } as RunnerPatchCompileBundle,
      '{"cells":[]}',
      '{"schemaVersion":"1"}',
      workspace,
    );

    expect(result.patchResultHash).toBe("e".repeat(64));
    expect(calls).toEqual([
      expect.objectContaining({
        command: "/fixed/python",
        args: [
          "-m",
          "counterlab_kernel.hosted_patch",
          "--bundle",
          join(workspace, "patch-bundle.json"),
          "--plan",
          join(workspace, "verified-patch-plan.json"),
          "--source",
          join(workspace, "source-notebook.ipynb"),
          "--fixture",
          "/fixed/leakage.csv",
          "--output-notebook",
          join(workspace, "patched-notebook.ipynb"),
          "--output-result",
          join(workspace, "patch-result.json"),
        ],
        options: {
          cwd: workspace,
          timeout: 45_000,
          env: {
            LANG: "C.UTF-8",
            PATH: "/opt/counterlab-venv/bin:/usr/local/bin:/usr/bin:/bin",
            PYTHONHASHSEED: "0",
          },
        },
      }),
    ]);
  });

  it("selects the fixed class-imbalance fixture from the bound concept", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "counterlab-patch-job-"));
    workspaces.push(workspace);
    let selectedFixture = "";
    const executor = new PythonFixedPatchExecutor({
      leakageFixturePath: "/fixed/leakage.csv",
      imbalanceFixturePath: "/fixed/imbalance.csv",
      runProcess: async (_command, args) => {
        selectedFixture = args[args.indexOf("--fixture") + 1]!;
        await writeFile(
          args[args.indexOf("--output-notebook") + 1]!,
          '{"cells":[]}\n',
          "utf8",
        );
        await writeFile(
          args[args.indexOf("--output-result") + 1]!,
          JSON.stringify({
            schemaVersion: "1",
            id: "patch_job_2",
            sessionId: "session_2",
            status: "VERIFIED",
            sourceArtifactHash: "a".repeat(64),
            patchedArtifactHash: "b".repeat(64),
            patchHash: "c".repeat(64),
            modifiedCells: [3],
            diff: "diff",
            verification: {
              passed: true,
              invariants: ["MINORITY_METRICS_RECOMPUTED"],
              unchangedCellHashes: ["d".repeat(64)],
            },
            generatedAt: "2026-07-15T00:00:00.000Z",
            resultHash: "e".repeat(64),
          }),
          "utf8",
        );
      },
    });

    await executor.run(
      {
        approvedBeliefTest: { concept: "class_imbalance" },
      } as RunnerPatchCompileBundle,
      '{"cells":[]}',
      '{"schemaVersion":"1"}',
      workspace,
    );

    expect(selectedFixture).toBe("/fixed/imbalance.csv");
  });
});
