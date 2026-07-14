import { execFile } from "node:child_process";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import {
  PatchResultSchema,
  type RunnerPatchCompileBundle,
} from "@counterlab/contracts";

import type { FixedPatchExecutor } from "./job-processor.js";

const MAX_NOTEBOOK_BYTES = 10 * 1024 * 1024;
const MAX_PLAN_BYTES = 512 * 1024;
const MAX_RESULT_BYTES = 1 * 1024 * 1024;

export type FixedPatchProcessOptions = {
  cwd: string;
  timeout: number;
  env: NodeJS.ProcessEnv;
};

export type FixedPatchProcessRunner = (
  command: string,
  args: string[],
  options: FixedPatchProcessOptions,
) => Promise<void>;

function runFixedProcess(
  command: string,
  args: string[],
  options: FixedPatchProcessOptions,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      command,
      args,
      {
        ...options,
        encoding: "utf8",
        maxBuffer: 65_536,
        windowsHide: true,
      },
      (error) => {
        if (error === null) resolvePromise();
        else reject(error);
      },
    );
  });
}

export type PythonFixedPatchExecutorOptions = {
  pythonExecutable?: string;
  fixturePath?: string;
  runProcess?: FixedPatchProcessRunner;
};

async function assertBoundedFile(
  path: string,
  maximum: number,
  code: string,
): Promise<void> {
  const metadata = await lstat(path);
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.size <= 0 ||
    metadata.size > maximum
  ) {
    throw Object.assign(new Error("Fixed-patch output failed policy"), {
      code,
    });
  }
}

export class PythonFixedPatchExecutor implements FixedPatchExecutor {
  private readonly pythonExecutable: string;
  private readonly fixturePath: string;
  private readonly runProcess: FixedPatchProcessRunner;

  constructor(options: PythonFixedPatchExecutorOptions = {}) {
    this.pythonExecutable =
      options.pythonExecutable ?? "/opt/counterlab-venv/bin/python";
    this.fixturePath =
      options.fixturePath ?? "/app/fixtures/public/customer_churn.csv";
    this.runProcess = options.runProcess ?? runFixedProcess;
  }

  async run(
    bundle: RunnerPatchCompileBundle,
    sourceNotebook: string,
    patchPlan: string,
    workspace: string,
  ): Promise<{
    notebookBody: string;
    patchResultBody: string;
    patchResultHash: string;
    durationMs: number;
  }> {
    const sourceSize = new TextEncoder().encode(sourceNotebook).byteLength;
    const planSize = new TextEncoder().encode(patchPlan).byteLength;
    if (
      sourceSize <= 0 ||
      sourceSize > MAX_NOTEBOOK_BYTES ||
      planSize <= 0 ||
      planSize > MAX_PLAN_BYTES
    ) {
      throw Object.assign(new Error("Fixed-patch input failed policy"), {
        code: "PATCH_INPUT_POLICY",
      });
    }

    const bundlePath = join(workspace, "patch-bundle.json");
    const planPath = join(workspace, "verified-patch-plan.json");
    const sourcePath = join(workspace, "source-notebook.ipynb");
    const notebookOutputPath = join(workspace, "patched-notebook.ipynb");
    const resultOutputPath = join(workspace, "patch-result.json");
    await Promise.all([
      writeFile(bundlePath, JSON.stringify(bundle), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
      writeFile(planPath, patchPlan, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
      writeFile(sourcePath, sourceNotebook, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      }),
    ]);

    const startedAt = performance.now();
    try {
      await this.runProcess(
        this.pythonExecutable,
        [
          "-m",
          "counterlab_kernel.hosted_patch",
          "--bundle",
          bundlePath,
          "--plan",
          planPath,
          "--source",
          sourcePath,
          "--fixture",
          this.fixturePath,
          "--output-notebook",
          notebookOutputPath,
          "--output-result",
          resultOutputPath,
        ],
        {
          cwd: workspace,
          timeout: 45_000,
          env: {
            LANG: "C.UTF-8",
            PATH: "/opt/counterlab-venv/bin:/usr/local/bin:/usr/bin:/bin",
            PYTHONHASHSEED: "0",
          },
        },
      );
    } catch (error) {
      throw Object.assign(
        new Error("Fixed-patch process failed", { cause: error }),
        { code: "PATCH_PROCESS_FAILED" },
      );
    }

    await Promise.all([
      assertBoundedFile(
        notebookOutputPath,
        MAX_NOTEBOOK_BYTES,
        "PATCH_OUTPUT_POLICY",
      ),
      assertBoundedFile(
        resultOutputPath,
        MAX_RESULT_BYTES,
        "PATCH_OUTPUT_POLICY",
      ),
    ]);
    const [notebookBody, patchResultBody] = await Promise.all([
      readFile(notebookOutputPath, "utf8"),
      readFile(resultOutputPath, "utf8"),
    ]);
    const patchResult = PatchResultSchema.parse(JSON.parse(patchResultBody));
    return {
      notebookBody,
      patchResultBody,
      patchResultHash: patchResult.resultHash,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
