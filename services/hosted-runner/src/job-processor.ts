import { mkdir, lstat, readFile, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
  type CodexCompiler,
  type CompileHostedExperimentPlanInput,
  type CompileHostedPatchPlanInput,
  type CompilerEvent,
  type RepairHostedExperimentPlanInput,
  type RepairHostedPatchPlanInput,
} from "@counterlab/codex-client";
import {
  HostedVerifiedResultSetV2Schema,
  PatchResultSchema,
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerJobInputBundleSchema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerLabCompileBundle,
  type RunnerLabRunBundle,
  type RunnerPatchCompileBundle,
  type RunnerJobInputBundle,
  type RunnerOperationalMetrics,
} from "@counterlab/contracts";

const PLAN_PATH = "experiment-plan.json";
const PATCH_PLAN_PATH = "patch-plan.json";
const RATIONALE_PATH = "public-rationale.md";
const LAB_PLAN_OUTPUTS = new Set([PLAN_PATH, RATIONALE_PATH]);
const PATCH_PLAN_OUTPUTS = new Set([PATCH_PLAN_PATH, RATIONALE_PATH]);
const MAX_PLAN_BYTES = 524_288;
const MAX_RATIONALE_BYTES = 65_536;
const MAX_RESULT_BYTES = 1_048_576;

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
  verifierDurationMs: number;
};

export interface RunnerControlPlane {
  getInput(signal?: AbortSignal): Promise<RunnerJobInputBundle>;
  getSource(signal?: AbortSignal): Promise<string>;
  start(signal?: AbortSignal): Promise<void>;
  resume(signal?: AbortSignal): Promise<void>;
  appendEvent(event: PublicCompilerEvent, signal?: AbortSignal): Promise<void>;
  upload(
    path: string,
    body: string,
    signal?: AbortSignal,
  ): Promise<{ sha256: string }>;
  candidate(
    input: {
      attempt: number;
      planSha256: string;
    },
    signal?: AbortSignal,
  ): Promise<CandidateDecision>;
  callback(callback: RunnerCallback, signal?: AbortSignal): Promise<void>;
}

export interface FixedKernelExecutor {
  run(
    bundle: RunnerLabRunBundle,
    workspace: string,
    signal?: AbortSignal,
  ): Promise<{ body: string; durationMs: number }>;
}

export interface FixedPatchExecutor {
  run(
    bundle: RunnerPatchCompileBundle,
    sourceNotebook: string,
    patchPlan: string,
    workspace: string,
    signal?: AbortSignal,
  ): Promise<{
    notebookBody: string;
    patchResultBody: string;
    patchResultHash: string;
    durationMs: number;
  }>;
}

export type HostedRunnerJobProcessorOptions = {
  workspaceRoot: string;
  compiler: CodexCompiler;
  fixedKernel?: FixedKernelExecutor;
  fixedPatch?: FixedPatchExecutor;
  controlPlane: RunnerControlPlane;
  now?: () => Date;
  id?: (prefix: string) => string;
};

type PublicCompilerEventPayload = PublicCompilerEvent extends infer Event
  ? Event extends PublicCompilerEvent
    ? Omit<Event, "schemaVersion" | "eventId" | "jobId" | "cursor" | "at">
    : never
  : never;

function emptyOperationalMetrics(): RunnerOperationalMetrics {
  return {
    compilerDurationMs: 0,
    verifierDurationMs: 0,
    kernelDurationMs: 0,
    patchDurationMs: 0,
    repairAttempts: 0,
    planTokenUsage: {
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningOutputTokens: 0,
      totalTokens: 0,
    },
  };
}

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

class RunnerCancelledError extends Error {
  constructor() {
    super("Runner job cancelled");
    this.name = "RunnerCancelledError";
  }
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new RunnerCancelledError();
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
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("KERNEL_")
  ) {
    return new RunnerProcessingError(
      error.code,
      "The fixed kernel could not complete the bounded Plan execution.",
      error.code === "KERNEL_PROCESS_FAILED",
    );
  }
  if (
    error instanceof Error &&
    "code" in error &&
    typeof error.code === "string" &&
    error.code.startsWith("PATCH_")
  ) {
    return new RunnerProcessingError(
      error.code,
      "The fixed patch engine could not complete the bounded patch job.",
      error.code === "PATCH_PROCESS_FAILED",
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

  async run(jobId: string, signal?: AbortSignal): Promise<void> {
    let bundle: RunnerJobInputBundle | undefined;
    let cursor = 0;
    let outputHashes: string[] = [];
    const operationalMetrics = emptyOperationalMetrics();
    try {
      throwIfCancelled(signal);
      bundle = RunnerJobInputBundleSchema.parse(
        await this.authorityCall(signal, () =>
          this.options.controlPlane.getInput(signal),
        ),
      );
      if (bundle.jobId !== jobId) {
        throw new RunnerProcessingError(
          "RUNNER_JOB_LINEAGE",
          "The runner input does not match the dispatched job.",
          false,
        );
      }
      const stateVersion = bundle.stateVersion;
      await this.authorityCall(signal, () =>
        this.options.controlPlane.start(signal),
      );
      throwIfCancelled(signal);
      cursor = await this.emit(jobId, cursor, { kind: "job.started" }, signal);

      const generationDirectory = await this.prepareWorkspace(jobId);
      if (bundle.kind === "LAB_RUN") {
        const fixedKernel = this.options.fixedKernel;
        if (fixedKernel === undefined) {
          throw new RunnerProcessingError(
            "FIXED_KERNEL_UNAVAILABLE",
            "The fixed kernel is unavailable in this runner.",
            true,
          );
        }
        const executed = await fixedKernel.run(
          bundle,
          generationDirectory,
          signal,
        );
        throwIfCancelled(signal);
        operationalMetrics.kernelDurationMs = executed.durationMs;
        if (
          new TextEncoder().encode(executed.body).byteLength > MAX_RESULT_BYTES
        ) {
          throw new RunnerProcessingError(
            "KERNEL_OUTPUT_POLICY",
            "The fixed-kernel result exceeded the output limit.",
            false,
          );
        }
        let rawResult: unknown;
        try {
          rawResult = JSON.parse(executed.body) as unknown;
        } catch {
          throw new RunnerProcessingError(
            "KERNEL_OUTPUT_INVALID",
            "The fixed kernel did not return valid JSON.",
            false,
          );
        }
        const result = HostedVerifiedResultSetV2Schema.parse(rawResult);
        const uploaded = await this.authorityCall(signal, () =>
          this.options.controlPlane.upload(
            "verified-result.json",
            executed.body,
            signal,
          ),
        );
        outputHashes = [uploaded.sha256];
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "command.completed",
            label: "Fixed kernel executed the verified Plan",
            exitCode: 0,
            durationMs: executed.durationMs,
            excerpt: `${result.runs.length} fixed run${result.runs.length === 1 ? "" : "s"} completed.`,
          },
          signal,
        );
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "result.ready",
            resultHash: result.resultHash,
          },
          signal,
        );
        await this.authorityCall(signal, () =>
          this.options.controlPlane.callback(
            RunnerCallbackSchema.parse({
              schemaVersion: "1",
              callbackId: this.id("runner_callback"),
              idempotencyKey: `${jobId}:verified:${uploaded.sha256}`,
              jobId,
              stateVersion,
              status: "VERIFIED",
              outputHashes,
              finalEventCursor: cursor,
              operationalMetrics,
              occurredAt: this.now().toISOString(),
            }),
            signal,
          ),
        );
        return;
      }
      if (bundle.kind === "PATCH_COMPILE") {
        const fixedPatch = this.options.fixedPatch;
        if (fixedPatch === undefined) {
          throw new RunnerProcessingError(
            "FIXED_PATCH_UNAVAILABLE",
            "The fixed patch engine is unavailable in this runner.",
            true,
          );
        }
        const compileInput = this.patchCompileInput(
          bundle,
          generationDirectory,
        );
        cursor = await this.consumeCompilerEvents(
          jobId,
          cursor,
          this.options.compiler.compileHostedPatchPlan(
            compileInput,
            signal === undefined ? {} : { signal },
          ),
          PATCH_PLAN_OUTPUTS,
          operationalMetrics,
          signal,
        );
        let uploaded = await this.validateAndUpload(
          jobId,
          cursor,
          generationDirectory,
          PATCH_PLAN_PATH,
          PATCH_PLAN_OUTPUTS,
          signal,
        );
        cursor = uploaded.cursor;
        outputHashes = uploaded.outputHashes;
        let decision = await this.authorityCall(signal, () =>
          this.options.controlPlane.candidate(
            { attempt: 1, planSha256: uploaded.planHash },
            signal,
          ),
        );
        operationalMetrics.verifierDurationMs += decision.verifierDurationMs;
        cursor = decision.nextCursor;
        for (
          let repairAttempt = 1;
          decision.status === "REJECTED";
          repairAttempt += 1
        ) {
          if (!decision.canRepair || repairAttempt > 2) {
            throw new RunnerProcessingError(
              "PATCH_PLAN_VERIFIER_REJECTED",
              "The external Patch Plan verifier rejected the candidate after the allowed repairs.",
              false,
            );
          }
          operationalMetrics.repairAttempts = repairAttempt;
          cursor = await this.emit(
            jobId,
            cursor,
            {
              kind: "repair.started",
              attempt: repairAttempt,
            },
            signal,
          );
          await this.authorityCall(signal, () =>
            this.options.controlPlane.resume(signal),
          );
          const repairInput: RepairHostedPatchPlanInput = {
            ...compileInput,
            repairAttempt: repairAttempt as 1 | 2,
            verifierCounterexamples: decision.counterexamples,
            previousOutputHashes: uploaded.outputHashByPath,
            previousCandidatePlan: uploaded.primaryPlan,
          };
          cursor = await this.consumeCompilerEvents(
            jobId,
            cursor,
            this.options.compiler.repairHostedPatchPlan(
              repairInput,
              signal === undefined ? {} : { signal },
            ),
            PATCH_PLAN_OUTPUTS,
            operationalMetrics,
            signal,
          );
          uploaded = await this.validateAndUpload(
            jobId,
            cursor,
            generationDirectory,
            PATCH_PLAN_PATH,
            PATCH_PLAN_OUTPUTS,
            signal,
          );
          cursor = uploaded.cursor;
          outputHashes = uploaded.outputHashes;
          decision = await this.authorityCall(signal, () =>
            this.options.controlPlane.candidate(
              {
                attempt: repairAttempt + 1,
                planSha256: uploaded.planHash,
              },
              signal,
            ),
          );
          operationalMetrics.verifierDurationMs += decision.verifierDurationMs;
          cursor = decision.nextCursor;
        }
        const patchPlan = await readFile(
          join(generationDirectory, PATCH_PLAN_PATH),
          "utf8",
        );
        const sourceNotebook = await this.authorityCall(signal, () =>
          this.options.controlPlane.getSource(signal),
        );
        const patched = await fixedPatch.run(
          bundle,
          sourceNotebook,
          patchPlan,
          generationDirectory,
          signal,
        );
        throwIfCancelled(signal);
        operationalMetrics.patchDurationMs = patched.durationMs;
        const patchResult = PatchResultSchema.parse(
          JSON.parse(patched.patchResultBody),
        );
        if (
          patchResult.status !== "VERIFIED" ||
          patchResult.resultHash !== patched.patchResultHash ||
          patchResult.sessionId !== bundle.sessionId ||
          patchResult.sourceArtifactHash !== bundle.artifactManifest.fileSha256
        ) {
          throw new RunnerProcessingError(
            "PATCH_OUTPUT_POLICY",
            "The fixed patch result failed its lineage policy.",
            false,
          );
        }
        const notebookUpload = await this.authorityCall(signal, () =>
          this.options.controlPlane.upload(
            "patched-notebook.ipynb",
            patched.notebookBody,
            signal,
          ),
        );
        const resultUpload = await this.authorityCall(signal, () =>
          this.options.controlPlane.upload(
            "patch-result.json",
            patched.patchResultBody,
            signal,
          ),
        );
        outputHashes = [
          ...outputHashes,
          notebookUpload.sha256,
          resultUpload.sha256,
        ];
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "command.completed",
            label: "Fixed patch engine applied and verified the Plan",
            exitCode: 0,
            durationMs: patched.durationMs,
            excerpt: `${patchResult.modifiedCells.length} notebook cell${patchResult.modifiedCells.length === 1 ? "" : "s"} changed.`,
          },
          signal,
        );
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "result.ready",
            resultHash: patchResult.resultHash,
          },
          signal,
        );
        await this.authorityCall(signal, () =>
          this.options.controlPlane.callback(
            RunnerCallbackSchema.parse({
              schemaVersion: "1",
              callbackId: this.id("runner_callback"),
              idempotencyKey: `${jobId}:verified:${outputHashes.join(":")}`,
              jobId,
              stateVersion,
              status: "VERIFIED",
              outputHashes,
              finalEventCursor: cursor,
              operationalMetrics,
              occurredAt: this.now().toISOString(),
            }),
            signal,
          ),
        );
        return;
      }
      const compileInput = this.compileInput(bundle, generationDirectory);
      cursor = await this.consumeCompilerEvents(
        jobId,
        cursor,
        this.options.compiler.compileExperimentPlan(
          compileInput,
          signal === undefined ? {} : { signal },
        ),
        LAB_PLAN_OUTPUTS,
        operationalMetrics,
        signal,
      );
      let uploaded = await this.validateAndUpload(
        jobId,
        cursor,
        generationDirectory,
        PLAN_PATH,
        LAB_PLAN_OUTPUTS,
        signal,
      );
      cursor = uploaded.cursor;
      outputHashes = uploaded.outputHashes;
      let decision = await this.authorityCall(signal, () =>
        this.options.controlPlane.candidate(
          { attempt: 1, planSha256: uploaded.planHash },
          signal,
        ),
      );
      operationalMetrics.verifierDurationMs += decision.verifierDurationMs;
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
        operationalMetrics.repairAttempts = repairAttempt;
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "repair.started",
            attempt: repairAttempt,
          },
          signal,
        );
        await this.authorityCall(signal, () =>
          this.options.controlPlane.resume(signal),
        );
        const repairInput: RepairHostedExperimentPlanInput = {
          ...compileInput,
          repairAttempt: repairAttempt as 1 | 2,
          verifierCounterexamples: decision.counterexamples,
          previousOutputHashes: uploaded.outputHashByPath,
          previousCandidatePlan: uploaded.primaryPlan,
        };
        cursor = await this.consumeCompilerEvents(
          jobId,
          cursor,
          this.options.compiler.repairExperimentPlan(
            repairInput,
            signal === undefined ? {} : { signal },
          ),
          LAB_PLAN_OUTPUTS,
          operationalMetrics,
          signal,
        );
        uploaded = await this.validateAndUpload(
          jobId,
          cursor,
          generationDirectory,
          PLAN_PATH,
          LAB_PLAN_OUTPUTS,
          signal,
        );
        cursor = uploaded.cursor;
        outputHashes = uploaded.outputHashes;
        decision = await this.authorityCall(signal, () =>
          this.options.controlPlane.candidate(
            {
              attempt: repairAttempt + 1,
              planSha256: uploaded.planHash,
            },
            signal,
          ),
        );
        operationalMetrics.verifierDurationMs += decision.verifierDurationMs;
        cursor = decision.nextCursor;
      }

      await this.authorityCall(signal, () =>
        this.options.controlPlane.callback(
          RunnerCallbackSchema.parse({
            schemaVersion: "1",
            callbackId: this.id("runner_callback"),
            idempotencyKey: `${jobId}:verified:${outputHashes.join(":")}`,
            jobId,
            stateVersion,
            status: "VERIFIED",
            outputHashes,
            finalEventCursor: cursor,
            operationalMetrics,
            occurredAt: this.now().toISOString(),
          }),
          signal,
        ),
      );
    } catch (error) {
      if (signal?.aborted || error instanceof RunnerCancelledError) return;
      const publicError = asPublicError(error);
      if (bundle === undefined) throw publicError;
      const failedStateVersion = bundle.stateVersion;
      await this.authorityCall(signal, () =>
        this.options.controlPlane.callback(
          RunnerCallbackSchema.parse({
            schemaVersion: "1",
            callbackId: this.id("runner_callback"),
            idempotencyKey: `${jobId}:failed:${publicError.code}`,
            jobId,
            stateVersion: failedStateVersion,
            status: "FAILED",
            outputHashes,
            finalEventCursor: cursor,
            error: {
              code: publicError.code,
              message: publicError.publicMessage,
              retryable: publicError.retryable,
            },
            operationalMetrics,
            occurredAt: this.now().toISOString(),
          }),
          signal,
        ),
      );
    }
  }

  private compileInput(
    bundle: RunnerLabCompileBundle,
    generationDirectory: string,
  ): CompileHostedExperimentPlanInput {
    return {
      sessionId: bundle.sessionId,
      artifactManifestHash: bundle.artifactManifestHash,
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
        planRequirements: [...bundle.conceptPack.planRequirements],
      },
      experimentPlanSchema: bundle.experimentPlanSchema,
      resourceLimits: bundle.resourceLimits,
      permittedOutputs: [...bundle.permittedOutputs],
    };
  }

  private patchCompileInput(
    bundle: RunnerPatchCompileBundle,
    generationDirectory: string,
  ): CompileHostedPatchPlanInput {
    return {
      sessionId: bundle.sessionId,
      artifactManifestHash: bundle.artifactManifestHash,
      sourceArtifactHash: bundle.artifactManifest.fileSha256,
      conceptPackVersion: bundle.conceptPackVersion,
      generationDirectory,
      approvedBeliefTest: bundle.approvedBeliefTest,
      artifactManifest: bundle.artifactManifest,
      verifiedResultSummary: bundle.verifiedResultSummary,
      transferSummary: bundle.transferSummary,
      patchContract: bundle.patchContract,
      allowedCellIndices: bundle.allowedCellIndices,
      patchPlanSchema: bundle.patchPlanSchema,
      resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 1 },
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
    allowedOutputs: ReadonlySet<string>,
    operationalMetrics: RunnerOperationalMetrics,
    signal?: AbortSignal,
  ): Promise<number> {
    let cursor = initialCursor;
    let completed = false;
    for await (const event of events) {
      throwIfCancelled(signal);
      if (event.type === "plan_summary") {
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "plan.summary",
            title: "Codex is compiling the counterexperiment",
            steps: event.summary
              .split(/\n+/u)
              .map((step) => step.trim())
              .filter(Boolean)
              .slice(0, 12),
          },
          signal,
        );
      } else if (event.type === "file_change") {
        for (const path of event.files) {
          if (!allowedOutputs.has(path)) {
            throw new RunnerProcessingError(
              "RUNNER_OUTPUT_POLICY",
              "Codex attempted to change a file outside the hosted allowlist.",
              false,
            );
          }
          cursor = await this.emit(
            jobId,
            cursor,
            {
              kind: "diff.updated",
              path: path as
                | typeof PLAN_PATH
                | typeof PATCH_PLAN_PATH
                | typeof RATIONALE_PATH,
              unifiedDiff: event.unifiedDiff,
            },
            signal,
          );
        }
      } else if (event.type === "command") {
        cursor = await this.emit(
          jobId,
          cursor,
          {
            kind: "command.completed",
            label: event.command,
            exitCode: event.exitCode ?? -1,
            durationMs: event.durationMs ?? 0,
            excerpt: event.outputExcerpt,
          },
          signal,
        );
      } else if (event.type === "final_status") {
        operationalMetrics.compilerDurationMs += event.durationMs ?? 0;
        completed = event.status === "completed" || event.status === "verified";
      } else if (event.type === "usage") {
        operationalMetrics.planTokenUsage.inputTokens += event.inputTokens;
        operationalMetrics.planTokenUsage.cachedInputTokens +=
          event.cachedInputTokens;
        operationalMetrics.planTokenUsage.outputTokens += event.outputTokens;
        operationalMetrics.planTokenUsage.reasoningOutputTokens +=
          event.reasoningOutputTokens;
        operationalMetrics.planTokenUsage.totalTokens += event.totalTokens;
      }
    }
    throwIfCancelled(signal);
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
    primaryPlanPath: typeof PLAN_PATH | typeof PATCH_PLAN_PATH,
    allowedOutputs: ReadonlySet<string>,
    signal?: AbortSignal,
  ): Promise<{
    cursor: number;
    planHash: string;
    outputHashes: string[];
    outputHashByPath: Record<string, string>;
    primaryPlan: unknown;
  }> {
    throwIfCancelled(signal);
    const entries = await readdir(directory, { withFileTypes: true });
    const names = entries.map((entry) => entry.name).sort();
    if (
      names.length !== allowedOutputs.size ||
      names.some((name) => !allowedOutputs.has(name)) ||
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
    let primaryPlan: unknown;
    for (const path of [primaryPlanPath, RATIONALE_PATH] as const) {
      throwIfCancelled(signal);
      const absolutePath = join(directory, path);
      assertContained(directory, absolutePath);
      const metadata = await lstat(absolutePath);
      const maximum =
        path === RATIONALE_PATH ? MAX_RATIONALE_BYTES : MAX_PLAN_BYTES;
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
      if (path === primaryPlanPath) {
        try {
          primaryPlan = JSON.parse(body) as unknown;
        } catch {
          primaryPlan = body;
        }
      }
      const uploaded = await this.authorityCall(signal, () =>
        this.options.controlPlane.upload(path, body, signal),
      );
      outputHashByPath[path] = uploaded.sha256;
      cursor = await this.emit(
        jobId,
        cursor,
        {
          kind: "file.created",
          path,
          sha256: uploaded.sha256,
        },
        signal,
      );
    }
    const planHash = outputHashByPath[primaryPlanPath];
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
      primaryPlan,
    };
  }

  private async emit(
    jobId: string,
    cursor: number,
    payload: PublicCompilerEventPayload,
    signal?: AbortSignal,
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
    await this.authorityCall(signal, () =>
      this.options.controlPlane.appendEvent(event, signal),
    );
    return nextCursor;
  }

  private async authorityCall<T>(
    signal: AbortSignal | undefined,
    action: () => Promise<T>,
  ): Promise<T> {
    throwIfCancelled(signal);
    const result = await action();
    throwIfCancelled(signal);
    return result;
  }
}
