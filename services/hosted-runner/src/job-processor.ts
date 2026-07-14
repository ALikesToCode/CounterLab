import { mkdir, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
  type CodexCompiler,
  type CompileHostedExperimentPlanInput,
  type CompilerEvent,
  type RepairHostedExperimentPlanInput,
} from "@counterlab/codex-client";
import {
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerLabCompileBundleSchema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerLabCompileBundle,
} from "@counterlab/contracts";

const PLAN_PATH = "experiment-plan.json";
const RATIONALE_PATH = "public-rationale.md";
const ALLOWED_OUTPUTS = new Set([PLAN_PATH, RATIONALE_PATH]);
const MAX_PLAN_BYTES = 524_288;
const MAX_RATIONALE_BYTES = 65_536;

export type VerifierCounterexample = {
  invariant: string;
  observed: unknown;
  expected: unknown;
  counterexample: string;
};

export type CandidateDecision = {
  status: "VERIFIED" | "REJECTED";
  canRepair: boolean;
  nextCursor: number;
  counterexamples: VerifierCounterexample[];
};

export interface RunnerControlPlane {
  getInput(): Promise<RunnerLabCompileBundle>;
  start(): Promise<void>;
  resume(): Promise<void>;
  appendEvent(event: PublicCompilerEvent): Promise<void>;
  upload(path: string, body: string): Promise<{ sha256: string }>;
  candidate(input: {
    attempt: number;
    planSha256: string;
  }): Promise<CandidateDecision>;
  callback(callback: RunnerCallback): Promise<void>;
}

export type HostedRunnerJobProcessorOptions = {
  workspaceRoot: string;
  compiler: CodexCompiler;
  controlPlane: RunnerControlPlane;
  now?: () => Date;
  id?: (prefix: string) => string;
};

type PublicCompilerEventPayload = PublicCompilerEvent extends infer Event
  ? Event extends PublicCompilerEvent
    ? Omit<Event, "schemaVersion" | "eventId" | "jobId" | "cursor" | "at">
    : never
  : never;

class RunnerProcessingError extends Error {
  constructor(
    readonly code: string,
    readonly publicMessage: string,
    readonly retryable: boolean,
  ) {
    super(publicMessage);
    this.name = "RunnerProcessingError";
  }
}

function asPublicError(error: unknown): RunnerProcessingError {
  if (error instanceof RunnerProcessingError) return error;
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("CODEX_")
  ) {
    return new RunnerProcessingError(
      error.code,
      "Codex App Server could not complete the bounded Plan job.",
      ["CODEX_TIMEOUT", "CODEX_PROCESS_EXITED", "CODEX_SPAWN_FAILED"].includes(
        error.code,
      ),
    );
  }
  return new RunnerProcessingError(
    "RUNNER_INTERNAL",
    "The hosted runner could not complete this job.",
    false,
  );
}

function assertContained(root: string, candidate: string): void {
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot === "" ||
    pathFromRoot.startsWith("..") ||
    isAbsolute(pathFromRoot)
  ) {
    throw new RunnerProcessingError(
      "RUNNER_PATH_POLICY",
      "The generation workspace failed its containment check.",
      false,
    );
  }
}

export class HostedRunnerJobProcessor {
  private readonly now: () => Date;
  private readonly id: (prefix: string) => string;

  constructor(private readonly options: HostedRunnerJobProcessorOptions) {
    this.now = options.now ?? (() => new Date());
    this.id = options.id ?? ((prefix) => `${prefix}_${crypto.randomUUID()}`);
  }

  async run(jobId: string): Promise<void> {
    let bundle: RunnerLabCompileBundle | undefined;
    let cursor = 0;
    let outputHashes: string[] = [];
    try {
      bundle = RunnerLabCompileBundleSchema.parse(
        await this.options.controlPlane.getInput(),
      );
      if (bundle.jobId !== jobId) {
        throw new RunnerProcessingError(
          "RUNNER_JOB_LINEAGE",
          "The runner input does not match the dispatched job.",
          false,
        );
      }
      await this.options.controlPlane.start();
      cursor = await this.emit(jobId, cursor, { kind: "job.started" });

      const generationDirectory = await this.prepareWorkspace(jobId);
      const compileInput = this.compileInput(bundle, generationDirectory);
      cursor = await this.consumeCompilerEvents(
        jobId,
        cursor,
        this.options.compiler.compileExperimentPlan(compileInput),
      );
      let uploaded = await this.validateAndUpload(
        jobId,
        cursor,
        generationDirectory,
      );
      cursor = uploaded.cursor;
      outputHashes = uploaded.outputHashes;
      let decision = await this.options.controlPlane.candidate({
        attempt: 1,
        planSha256: uploaded.planHash,
      });
      cursor = decision.nextCursor;

      for (
        let repairAttempt = 1;
        decision.status === "REJECTED";
        repairAttempt += 1
      ) {
        if (!decision.canRepair || repairAttempt > 2) {
          throw new RunnerProcessingError(
            "PLAN_VERIFIER_REJECTED",
            "The external Plan verifier rejected the candidate after the allowed repairs.",
            false,
          );
        }
        cursor = await this.emit(jobId, cursor, {
          kind: "repair.started",
          attempt: repairAttempt,
        });
        await this.options.controlPlane.resume();
        const repairInput: RepairHostedExperimentPlanInput = {
          ...compileInput,
          repairAttempt: repairAttempt as 1 | 2,
          verifierCounterexamples: decision.counterexamples,
          previousOutputHashes: uploaded.outputHashByPath,
        };
        cursor = await this.consumeCompilerEvents(
          jobId,
          cursor,
          this.options.compiler.repairExperimentPlan(repairInput),
        );
        uploaded = await this.validateAndUpload(
          jobId,
          cursor,
          generationDirectory,
        );
        cursor = uploaded.cursor;
        outputHashes = uploaded.outputHashes;
        decision = await this.options.controlPlane.candidate({
          attempt: repairAttempt + 1,
          planSha256: uploaded.planHash,
        });
        cursor = decision.nextCursor;
      }

      await this.options.controlPlane.callback(
        RunnerCallbackSchema.parse({
          schemaVersion: "1",
          callbackId: this.id("runner_callback"),
          idempotencyKey: `${jobId}:verified:${outputHashes.join(":")}`,
          jobId,
          stateVersion: bundle.stateVersion,
          status: "VERIFIED",
          outputHashes,
          finalEventCursor: cursor,
          occurredAt: this.now().toISOString(),
        }),
      );
    } catch (error) {
      const publicError = asPublicError(error);
      if (bundle === undefined) throw publicError;
      await this.options.controlPlane.callback(
        RunnerCallbackSchema.parse({
          schemaVersion: "1",
          callbackId: this.id("runner_callback"),
          idempotencyKey: `${jobId}:failed:${publicError.code}`,
          jobId,
          stateVersion: bundle.stateVersion,
          status: "FAILED",
          outputHashes,
          finalEventCursor: cursor,
          error: {
            code: publicError.code,
            message: publicError.publicMessage,
            retryable: publicError.retryable,
          },
          occurredAt: this.now().toISOString(),
        }),
      );
    }
  }

  private compileInput(
    bundle: RunnerLabCompileBundle,
    generationDirectory: string,
  ): CompileHostedExperimentPlanInput {
    return {
      sessionId: bundle.sessionId,
      generationDirectory,
      approvedBeliefTest: bundle.approvedBeliefTest,
      artifactManifest: bundle.artifactManifest,
      conceptPack: {
        id: bundle.conceptPack.id,
        version: bundle.conceptPack.version,
        title: bundle.conceptPack.title,
        allowedOperations: [...bundle.conceptPack.allowedOperations],
        allowedMetrics: [...bundle.conceptPack.allowedMetrics],
        allowedVisualizations: [...bundle.conceptPack.allowedVisualizations],
        verifierInvariants: [...bundle.conceptPack.verifierInvariants],
      },
      experimentPlanSchema: bundle.experimentPlanSchema,
      resourceLimits: bundle.resourceLimits,
      permittedOutputs: [...bundle.permittedOutputs],
    };
  }

  private async prepareWorkspace(jobId: string): Promise<string> {
    if (!/^[A-Za-z0-9_-]+$/u.test(jobId)) {
      throw new RunnerProcessingError(
        "RUNNER_JOB_ID_POLICY",
        "The runner job identifier is invalid.",
        false,
      );
    }
    const root = resolve(this.options.workspaceRoot);
    await mkdir(root, { recursive: true, mode: 0o700 });
    const canonicalRoot = await realpath(root);
    const directory = join(canonicalRoot, jobId);
    assertContained(canonicalRoot, directory);
    await mkdir(directory, { recursive: false, mode: 0o700 });
    return directory;
  }

  private async consumeCompilerEvents(
    jobId: string,
    initialCursor: number,
    events: AsyncIterable<CompilerEvent>,
  ): Promise<number> {
    let cursor = initialCursor;
    let completed = false;
    for await (const event of events) {
      if (event.type === "plan_summary") {
        cursor = await this.emit(jobId, cursor, {
          kind: "plan.summary",
          title: "Codex is compiling the counterexperiment",
          steps: event.summary
            .split(/\n+/u)
            .map((step) => step.trim())
            .filter(Boolean)
            .slice(0, 12),
        });
      } else if (event.type === "file_change") {
        for (const path of event.files) {
          if (!ALLOWED_OUTPUTS.has(path)) {
            throw new RunnerProcessingError(
              "RUNNER_OUTPUT_POLICY",
              "Codex attempted to change a file outside the hosted allowlist.",
              false,
            );
          }
          cursor = await this.emit(jobId, cursor, {
            kind: "diff.updated",
            path: path as typeof PLAN_PATH | typeof RATIONALE_PATH,
            unifiedDiff: event.unifiedDiff,
          });
        }
      } else if (event.type === "command") {
        cursor = await this.emit(jobId, cursor, {
          kind: "command.completed",
          label: event.command,
          exitCode: event.exitCode ?? -1,
          durationMs: event.durationMs ?? 0,
          excerpt: event.outputExcerpt,
        });
      } else if (event.type === "final_status") {
        completed = event.status === "completed" || event.status === "verified";
      }
    }
    if (!completed) {
      throw new RunnerProcessingError(
        "CODEX_PROCESS_EXITED",
        "Codex App Server did not complete the Plan turn.",
        true,
      );
    }
    return cursor;
  }

  private async validateAndUpload(
    jobId: string,
    initialCursor: number,
    directory: string,
  ): Promise<{
    cursor: number;
    planHash: string;
    outputHashes: string[];
    outputHashByPath: Record<string, string>;
  }> {
    const entries = await readdir(directory, { withFileTypes: true });
    const names = entries.map((entry) => entry.name).sort();
    if (
      names.length !== ALLOWED_OUTPUTS.size ||
      names.some((name) => !ALLOWED_OUTPUTS.has(name)) ||
      entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
    ) {
      throw new RunnerProcessingError(
        "RUNNER_OUTPUT_POLICY",
        "Codex created a file outside the hosted output allowlist.",
        false,
      );
    }

    let cursor = initialCursor;
    const outputHashByPath: Record<string, string> = {};
    for (const path of [PLAN_PATH, RATIONALE_PATH] as const) {
      const absolutePath = join(directory, path);
      assertContained(directory, absolutePath);
      const metadata = await lstat(absolutePath);
      const maximum = path === PLAN_PATH ? MAX_PLAN_BYTES : MAX_RATIONALE_BYTES;
      if (
        !metadata.isFile() ||
        metadata.isSymbolicLink() ||
        metadata.size <= 0 ||
        metadata.size > maximum
      ) {
        throw new RunnerProcessingError(
          "RUNNER_OUTPUT_POLICY",
          `The generated ${path} failed the file policy.`,
          false,
        );
      }
      const body = await readFile(absolutePath, "utf8");
      const uploaded = await this.options.controlPlane.upload(path, body);
      outputHashByPath[path] = uploaded.sha256;
      cursor = await this.emit(jobId, cursor, {
        kind: "file.created",
        path,
        sha256: uploaded.sha256,
      });
    }
    const planHash = outputHashByPath[PLAN_PATH];
    if (planHash === undefined) {
      throw new RunnerProcessingError(
        "RUNNER_OUTPUT_POLICY",
        "The experiment Plan output is missing.",
        false,
      );
    }
    return {
      cursor,
      planHash,
      outputHashes: Object.values(outputHashByPath),
      outputHashByPath,
    };
  }

  private async emit(
    jobId: string,
    cursor: number,
    payload: PublicCompilerEventPayload,
  ): Promise<number> {
    const nextCursor = cursor + 1;
    const event = PublicCompilerEventSchema.parse({
      schemaVersion: "1",
      eventId: this.id("compiler_event"),
      jobId,
      cursor: nextCursor,
      at: this.now().toISOString(),
      ...payload,
    });
    await this.options.controlPlane.appendEvent(event);
    return nextCursor;
  }
}
