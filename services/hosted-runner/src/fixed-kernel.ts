import { execFile } from "node:child_process";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { RunnerLabRunBundle } from "@counterlab/contracts";
import type {
  RunnerBoundaryMapBundleV5,
  RunnerLabInteractiveRunBundleV5,
  RunnerLabRunBundleV5,
} from "@counterlab/experiment-ir";

import type { FixedKernelExecutor } from "./job-processor.js";

const MAX_RESULT_BYTES = 1_048_576;

export type FixedKernelProcessOptions = {
  cwd: string;
  timeout: number;
  env: NodeJS.ProcessEnv;
  signal?: AbortSignal;
};

export type FixedKernelProcessRunner = (
  command: string,
  args: string[],
  options: FixedKernelProcessOptions,
) => Promise<void>;

function runFixedProcess(
  command: string,
  args: string[],
  options: FixedKernelProcessOptions,
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

export type PythonFixedKernelExecutorOptions = {
  pythonExecutable?: string;
  runProcess?: FixedKernelProcessRunner;
};

export class PythonFixedKernelExecutor implements FixedKernelExecutor {
  private readonly pythonExecutable: string;
  private readonly runProcess: FixedKernelProcessRunner;

  constructor(options: PythonFixedKernelExecutorOptions = {}) {
    this.pythonExecutable =
      options.pythonExecutable ?? "/opt/counterlab-venv/bin/python";
    this.runProcess = options.runProcess ?? runFixedProcess;
  }

  async run(
    bundle:
      | RunnerLabRunBundle
      | RunnerLabRunBundleV5
      | RunnerLabInteractiveRunBundleV5
      | RunnerBoundaryMapBundleV5,
    workspace: string,
    signal?: AbortSignal,
  ): Promise<{ body: string; durationMs: number }> {
    const inputPath = join(workspace, "lab-run-bundle.json");
    const outputPath = join(
      workspace,
      bundle.schemaVersion === "5" && bundle.purpose === "BOUNDARY"
        ? "boundary-map.json"
        : "verified-result.json",
    );
    await writeFile(inputPath, JSON.stringify(bundle), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    const startedAt = performance.now();
    try {
      await this.runProcess(
        this.pythonExecutable,
        [
          "-m",
          "counterlab_kernel.hosted_run",
          "--bundle",
          inputPath,
          "--output",
          outputPath,
        ],
        {
          cwd: workspace,
          timeout:
            (bundle.schemaVersion === "5"
              ? bundle.purpose === "BOUNDARY"
                ? bundle.selectedExperimentIr
                : bundle.purpose === "INTERACTIVE"
                  ? bundle.interactivePlan
                  : bundle.projectedPlan
              : bundle.experimentPlan
            ).resourceLimits.wallSeconds * 1_000,
          ...(signal === undefined ? {} : { signal }),
          env: {
            LANG: "C.UTF-8",
            PATH: "/opt/counterlab-venv/bin:/usr/local/bin:/usr/bin:/bin",
            PYTHONHASHSEED: "0",
          },
        },
      );
    } catch (error) {
      throw Object.assign(
        new Error("Fixed-kernel process failed", { cause: error }),
        {
          code: "KERNEL_PROCESS_FAILED",
        },
      );
    }
    const metadata = await lstat(outputPath);
    if (
      !metadata.isFile() ||
      metadata.isSymbolicLink() ||
      metadata.size <= 0 ||
      metadata.size > MAX_RESULT_BYTES
    ) {
      throw Object.assign(new Error("Fixed-kernel output failed policy"), {
        code: "KERNEL_OUTPUT_POLICY",
      });
    }
    return {
      body: await readFile(outputPath, "utf8"),
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    };
  }
}
