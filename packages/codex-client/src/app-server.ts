import { execFile } from "node:child_process";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { constants } from "node:fs";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import {
  ExperimentPlanV2Schema,
  PatchPlanV1Schema,
} from "@counterlab/contracts";
import { z } from "zod";

import {
  buildCompileLabPrompt,
  buildCompileHostedExperimentPlanPrompt,
  buildCompileHostedPatchPlanPrompt,
  buildCompilePatchPrompt,
  buildRepairLabPrompt,
  buildRepairHostedExperimentPlanPrompt,
  buildRepairHostedPatchPlanPrompt,
} from "./prompts.js";
import { redactSecrets, sanitizeAppServerMessage } from "./sanitizer.js";
import {
  CompileLabInputSchema,
  CompileHostedExperimentPlanInputSchema,
  CompileHostedPatchPlanInputSchema,
  CompilePatchInputSchema,
  CompilerSetupError,
  JsonValueSchema,
  RepairLabInputSchema,
  RepairHostedExperimentPlanInputSchema,
  RepairHostedPatchPlanInputSchema,
  type CodexCompiler,
  type CompileLabInput,
  type CompileHostedExperimentPlanInput,
  type CompileHostedPatchPlanInput,
  type CompilePatchInput,
  type CompilerEvent,
  type CompilerExecutionOptions,
  type CompilerHealth,
  type RepairLabInput,
  type RepairHostedExperimentPlanInput,
  type RepairHostedPatchPlanInput,
} from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_PROTOCOL_BUFFER_BYTES = 1_048_576;
const MAX_STDERR_BYTES = 4_000;
const MAX_APP_SERVER_ATTEMPTS = 3;
const MAX_STRUCTURED_OUTPUT_BYTES = 1_048_576;
const PUBLIC_RATIONALE_PATH = "public-rationale.md";

const StructuredHostedOutputSchema = z
  .object({
    authoritativeArtifact: JsonValueSchema,
    publicRationale: z.string().trim().min(1).max(16_000),
  })
  .strict();

const FinalAgentMessageNotificationSchema = z
  .object({
    method: z.literal("item/completed"),
    params: z
      .object({
        threadId: z.string().min(1),
        turnId: z.string().min(1),
        item: z
          .object({
            type: z.literal("agentMessage"),
            text: z.string().max(MAX_STRUCTURED_OUTPUT_BYTES),
            phase: z.literal("final_answer"),
          })
          .passthrough(),
      })
      .passthrough(),
  })
  .passthrough();

type StructuredRun = {
  outputSchema: Record<string, unknown>;
  materialize(finalMessage: string): Promise<void>;
};

function structuredOutputSchema(
  authoritativeSchema: Record<string, unknown>,
): Record<string, unknown> {
  const strictAuthoritativeSchema = strictStructuredSchema(authoritativeSchema);
  return {
    type: "object",
    properties: {
      authoritativeArtifact: strictAuthoritativeSchema,
      publicRationale: {
        type: "string",
        minLength: 1,
        maxLength: 16_000,
      },
    },
    required: ["authoritativeArtifact", "publicRationale"],
    additionalProperties: false,
  };
}

function strictStructuredSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strictStructuredSchema);
  if (value === null || typeof value !== "object") return value;

  const source = value as Record<string, unknown>;
  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(source)) {
    if (key === "$id" || key === "$schema" || key === "title") continue;
    if (key === "required" || key === "properties") continue;
    if (key === "oneOf") {
      output.anyOf = strictStructuredSchema(nested);
      continue;
    }
    output[key] = strictStructuredSchema(nested);
  }

  if (
    source.properties !== null &&
    typeof source.properties === "object" &&
    !Array.isArray(source.properties)
  ) {
    const properties = source.properties as Record<string, unknown>;
    const originallyRequired = new Set(
      Array.isArray(source.required)
        ? source.required.filter(
            (entry): entry is string => typeof entry === "string",
          )
        : [],
    );
    output.properties = Object.fromEntries(
      Object.entries(properties).map(([name, propertySchema]) => {
        const strictPropertySchema = strictStructuredSchema(propertySchema);
        return [
          name,
          originallyRequired.has(name)
            ? strictPropertySchema
            : {
                anyOf: [strictPropertySchema, { type: "null" }],
              },
        ];
      }),
    );
    output.required = Object.keys(properties);
    output.additionalProperties = false;
  }

  return output;
}

function removeModelBoundaryNullPlaceholders(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(removeModelBoundaryNullPlaceholders);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== null)
      .map(([name, nested]) => [
        name,
        removeModelBoundaryNullPlaceholders(nested),
      ]),
  );
}

function directChild(root: string, fileName: string): string {
  const candidate = join(root, fileName);
  const pathFromRoot = relative(root, candidate);
  if (
    pathFromRoot !== fileName ||
    pathFromRoot.startsWith("..") ||
    isAbsolute(pathFromRoot)
  ) {
    throw new CompilerSetupError(
      "CODEX_ISOLATION_UNAVAILABLE",
      "Hosted output escaped the generation directory.",
    );
  }
  return candidate;
}

async function writeBoundedFile(path: string, body: string): Promise<void> {
  const noFollow = constants.O_NOFOLLOW ?? 0;
  const handle = await open(
    path,
    constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | noFollow,
    0o600,
  );
  try {
    await handle.writeFile(body, "utf8");
  } finally {
    await handle.close();
  }
}

async function materializeStructuredHostedOutput(
  generationDirectory: string,
  authoritativePath: "experiment-plan.json" | "patch-plan.json",
  authoritativeValidator: z.ZodType<unknown>,
  finalMessage: string,
): Promise<void> {
  if (Buffer.byteLength(finalMessage, "utf8") > MAX_STRUCTURED_OUTPUT_BYTES) {
    throw new CompilerSetupError(
      "CODEX_PROTOCOL_ERROR",
      "Codex structured output exceeded the hosted size limit.",
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(finalMessage) as unknown;
  } catch (error) {
    throw new CompilerSetupError(
      "CODEX_PROTOCOL_ERROR",
      "Codex did not return schema-constrained JSON.",
      { cause: error },
    );
  }
  const output = StructuredHostedOutputSchema.parse(value);
  // The strict model schema represents canonical optional properties as null.
  // Current hosted contracts admit no null-valued properties, so remove those
  // placeholders and immediately fail closed against the fixed local contract.
  const authoritativeArtifact = authoritativeValidator.parse(
    removeModelBoundaryNullPlaceholders(output.authoritativeArtifact),
  );
  const canonicalDirectory = await realpath(generationDirectory);
  await writeBoundedFile(
    directChild(canonicalDirectory, authoritativePath),
    `${JSON.stringify(authoritativeArtifact, null, 2)}\n`,
  );
  await writeBoundedFile(
    directChild(canonicalDirectory, PUBLIC_RATIONALE_PATH),
    `${output.publicRationale}\n`,
  );
}

function materializedFileEvent(
  authoritativePath: "experiment-plan.json" | "patch-plan.json",
): CompilerEvent {
  return {
    type: "file_change",
    files: [authoritativePath, PUBLIC_RATIONALE_PATH],
    unifiedDiff: [
      `--- /dev/null`,
      `+++ b/${authoritativePath}`,
      "@@ -0,0 +1 @@",
      "+[schema-constrained artifact materialized by CounterLab]",
      `--- /dev/null`,
      `+++ b/${PUBLIC_RATIONALE_PATH}`,
      "@@ -0,0 +1 @@",
      "+[display-only rationale materialized by CounterLab]",
    ].join("\n"),
    status: "completed",
  };
}

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new CompilerSetupError(
      "CODEX_CANCELLED",
      "Codex compilation was cancelled.",
    );
  }
}

const ResponseEnvelopeSchema = z
  .object({
    id: z.union([z.string(), z.number().int()]),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number().int().optional(),
        message: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough()
  .refine(
    (value) =>
      !("method" in value) &&
      (Object.hasOwn(value, "result") || Object.hasOwn(value, "error")),
    "A response must contain result or error and must not contain method.",
  );

const ServerRequestEnvelopeSchema = z
  .object({
    id: z.union([z.string(), z.number().int()]),
    method: z.string().min(1),
    params: z.unknown().optional(),
  })
  .passthrough();

const InitializeResponseSchema = z
  .object({
    userAgent: z.string(),
    codexHome: z.string(),
    platformFamily: z.string(),
    platformOs: z.string(),
  })
  .passthrough();

const ThreadStartResponseSchema = z
  .object({
    thread: z.object({ id: z.string().min(1) }).passthrough(),
    model: z.string().min(1),
  })
  .passthrough();

const TurnStartResponseSchema = z
  .object({
    turn: z.object({ id: z.string().min(1) }).passthrough(),
  })
  .passthrough();

const AccountReadResponseSchema = z
  .object({
    account: z.unknown().nullable(),
    requiresOpenaiAuth: z.boolean(),
  })
  .passthrough();

export type AppServerCodexCompilerOptions = {
  command?: string;
  commandArgs?: string[];
  healthCommand?: string;
  healthArgs?: string[];
  model?: string | undefined;
  timeoutMs?: number;
  restartDelayMs?: number;
  environment?: NodeJS.ProcessEnv;
  launchBoundary?: AppServerLaunchBoundary;
  /** Fake App Server processes in unit tests only. Rejected outside NODE_ENV=test. */
  allowUnisolatedTestProcess?: boolean;
};

export type AppServerLaunchRequest = {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
  hostCwd: string;
};

export type PreparedAppServerLaunch = {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
  protocolCwd: string;
  spawnCwd?: string;
  revokeCredentials?: () => Promise<void>;
  dispose?: () => Promise<void>;
};

export type AppServerLaunchBoundaryHealth =
  { available: true } | { available: false; reason: string };

export interface AppServerLaunchBoundary {
  health(): Promise<AppServerLaunchBoundaryHealth>;
  prepare(request: AppServerLaunchRequest): Promise<PreparedAppServerLaunch>;
}

type PendingRequest = {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
};

class AsyncEventQueue {
  private readonly values: CompilerEvent[] = [];
  private readonly waiters: Array<{
    resolve(value: CompilerEvent): void;
    reject(error: Error): void;
    timer: NodeJS.Timeout;
  }> = [];
  private failed: Error | undefined;

  push(event: CompilerEvent): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      clearTimeout(waiter.timer);
      waiter.resolve(event);
      return;
    }
    this.values.push(event);
  }

  fail(error: Error): void {
    if (this.failed) return;
    this.failed = error;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
  }

  next(timeoutMs: number): Promise<CompilerEvent> {
    const value = this.values.shift();
    if (value) return Promise.resolve(value);
    if (this.failed) return Promise.reject(this.failed);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const index = this.waiters.findIndex(
          (waiter) => waiter.timer === timer,
        );
        if (index >= 0) this.waiters.splice(index, 1);
        reject(
          new CompilerSetupError(
            "CODEX_TIMEOUT",
            "Codex App Server did not produce a protocol event before the timeout.",
          ),
        );
      }, timeoutMs);
      this.waiters.push({ resolve, reject, timer });
    });
  }
}

function safeEnvironment(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  const exact = new Set([
    "PATH",
    "HOME",
    "USER",
    "SHELL",
    "TERM",
    "LANG",
    "LC_ALL",
    "TMPDIR",
    "CODEX_HOME",
    "RUST_BACKTRACE",
  ]);
  for (const [key, value] of Object.entries(source)) {
    if (
      value !== undefined &&
      (exact.has(key) || key.startsWith("XDG_") || key.startsWith("LC_"))
    ) {
      environment[key] = value;
    }
  }
  return environment;
}

function asSetupError(error: unknown): CompilerSetupError {
  if (error instanceof CompilerSetupError) return error;
  const code =
    error instanceof Error && "code" in error && error.code === "ENOENT"
      ? "CODEX_NOT_FOUND"
      : "CODEX_SPAWN_FAILED";
  return new CompilerSetupError(code, "Unable to start Codex App Server.", {
    cause: error,
  });
}

function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new CompilerSetupError(
      "CODEX_INVALID_INPUT",
      "Codex compiler input did not match the constrained contract.",
      { cause: result.error },
    );
  }
  return result.data;
}

class AppServerConnection {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly events = new AsyncEventQueue();
  private stdoutBuffer = "";
  private stderrBuffer = "";
  private requestSequence = 0;
  private closed = false;
  private terminationScheduled = false;
  private fatalError: Error | undefined;
  private finalAgentMessage:
    { threadId: string; turnId: string; text: string } | undefined;

  constructor(
    command: string,
    args: string[],
    environment: NodeJS.ProcessEnv,
    cwd: string | undefined,
    private readonly timeoutMs: number,
  ) {
    try {
      this.process = spawn(command, args, {
        env: environment,
        ...(cwd ? { cwd } : {}),
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (error) {
      throw asSetupError(error);
    }

    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stdout.on("data", (chunk: string) => this.receive(chunk));
    this.process.stderr.on("data", (chunk: string) => {
      this.stderrBuffer = `${this.stderrBuffer}${chunk}`.slice(
        -MAX_STDERR_BYTES,
      );
    });
    this.process.on("error", (error) => this.fail(asSetupError(error)));
    this.process.on("exit", (code, signal) => {
      if (this.closed) return;
      const detail = this.stderrBuffer.trim()
        ? ` ${redactSecrets(this.stderrBuffer.trim())}`
        : "";
      this.fail(
        new CompilerSetupError(
          "CODEX_PROCESS_EXITED",
          `Codex App Server exited before turn completion (code ${String(code)}, signal ${String(signal)}).${detail}`,
        ),
      );
    });
  }

  request(method: string, params: unknown): Promise<unknown> {
    if (this.fatalError) return Promise.reject(this.fatalError);
    const id = String(++this.requestSequence);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new CompilerSetupError(
            "CODEX_TIMEOUT",
            `Codex App Server did not answer ${method} before the timeout.`,
          ),
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id: Number(id), method, params });
    });
  }

  notify(method: string): void {
    this.write({ method });
  }

  nextEvent(): Promise<CompilerEvent> {
    return this.events.next(this.timeoutMs);
  }

  structuredFinalMessage(threadId: string, turnId: string): string | undefined {
    return this.finalAgentMessage?.threadId === threadId &&
      this.finalAgentMessage.turnId === turnId
      ? this.finalAgentMessage.text
      : undefined;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(
        new CompilerSetupError(
          "CODEX_PROCESS_EXITED",
          "Codex App Server connection closed.",
        ),
      );
    }
    this.pending.clear();
    this.terminateProcess();
  }

  cancel(): void {
    this.fail(
      new CompilerSetupError(
        "CODEX_CANCELLED",
        "Codex compilation was cancelled.",
      ),
    );
  }

  private write(message: unknown): void {
    if (!this.process.stdin.writable) {
      this.fail(
        new CompilerSetupError(
          "CODEX_PROCESS_EXITED",
          "Codex App Server stdin is not writable.",
        ),
      );
      return;
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private receive(chunk: string): void {
    this.stdoutBuffer += chunk;
    if (
      Buffer.byteLength(this.stdoutBuffer, "utf8") > MAX_PROTOCOL_BUFFER_BYTES
    ) {
      this.fail(
        new CompilerSetupError(
          "CODEX_PROTOCOL_ERROR",
          "Codex App Server exceeded the maximum JSONL message size.",
        ),
      );
      return;
    }

    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (line) this.receiveLine(line);
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private receiveLine(line: string): void {
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch (error) {
      this.fail(
        new CompilerSetupError(
          "CODEX_PROTOCOL_ERROR",
          "Codex App Server emitted invalid JSONL.",
          { cause: error },
        ),
      );
      return;
    }

    const response = ResponseEnvelopeSchema.safeParse(value);
    if (response.success) {
      const pending = this.pending.get(String(response.data.id));
      if (!pending) {
        this.fail(
          new CompilerSetupError(
            "CODEX_PROTOCOL_ERROR",
            "Codex App Server returned an unknown request id.",
          ),
        );
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(String(response.data.id));
      if (response.data.error) {
        pending.reject(
          new CompilerSetupError(
            "CODEX_PROTOCOL_ERROR",
            `Codex App Server rejected the request: ${redactSecrets(response.data.error.message)}`,
          ),
        );
      } else {
        pending.resolve(response.data.result);
      }
      return;
    }

    const serverRequest = ServerRequestEnvelopeSchema.safeParse(value);
    if (serverRequest.success) {
      this.write({
        id: serverRequest.data.id,
        error: {
          code: -32_604,
          message: "CounterLab denies interactive App Server requests.",
        },
      });
      this.fail(
        new CompilerSetupError(
          "CODEX_PROTOCOL_ERROR",
          `Codex requested disallowed interaction: ${serverRequest.data.method}.`,
        ),
      );
      return;
    }

    const finalAgentMessage =
      FinalAgentMessageNotificationSchema.safeParse(value);
    if (finalAgentMessage.success) {
      this.finalAgentMessage = {
        threadId: finalAgentMessage.data.params.threadId,
        turnId: finalAgentMessage.data.params.turnId,
        text: finalAgentMessage.data.params.item.text,
      };
    }

    try {
      for (const event of sanitizeAppServerMessage(value))
        this.events.push(event);
    } catch (error) {
      this.fail(asSetupError(error));
    }
  }

  private fail(error: Error): void {
    if (this.fatalError) return;
    this.fatalError = error;
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
    this.events.fail(error);
    if (!this.closed) {
      this.closed = true;
      this.terminateProcess();
    }
  }

  private terminateProcess(): void {
    if (this.terminationScheduled) return;
    this.terminationScheduled = true;
    this.process.stdin.destroy();
    if (this.process.exitCode !== null || this.process.signalCode !== null) {
      return;
    }
    this.killProcessTree("SIGTERM");
    const timer = setTimeout(() => {
      if (this.process.exitCode === null && this.process.signalCode === null) {
        this.killProcessTree("SIGKILL");
      }
    }, 250);
    timer.unref();
  }

  private killProcessTree(signal: NodeJS.Signals): void {
    const pid = this.process.pid;
    if (process.platform !== "win32" && pid !== undefined) {
      try {
        process.kill(-pid, signal);
        return;
      } catch {
        // Fall through when the process group has already exited.
      }
    }
    try {
      this.process.kill(signal);
    } catch {
      // The child exited between the lifecycle check and the signal.
    }
  }
}

export class AppServerCodexCompiler implements CodexCompiler {
  private readonly command: string;
  private readonly commandArgs: string[];
  private readonly healthCommand: string;
  private readonly healthArgs: string[];
  private readonly model: string | undefined;
  private readonly timeoutMs: number;
  private readonly restartDelayMs: number;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly launchBoundary: AppServerLaunchBoundary | undefined;
  private readonly allowUnisolatedTestProcess: boolean;

  constructor(options: AppServerCodexCompilerOptions = {}) {
    this.command = options.command ?? "codex";
    this.commandArgs = options.commandArgs ?? ["app-server", "--stdio"];
    this.healthCommand = options.healthCommand ?? this.command;
    this.healthArgs = options.healthArgs ?? ["--version"];
    this.model =
      options.model?.trim() || process.env.CODEX_MODEL?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.restartDelayMs = options.restartDelayMs ?? 1_000;
    if (
      !Number.isInteger(this.restartDelayMs) ||
      this.restartDelayMs < 0 ||
      this.restartDelayMs > 10_000
    ) {
      throw new CompilerSetupError(
        "CODEX_INVALID_INPUT",
        "Codex App Server restart delay must be an integer from 0 to 10000 milliseconds.",
      );
    }
    this.environment = safeEnvironment(options.environment ?? process.env);
    this.launchBoundary = options.launchBoundary;
    this.allowUnisolatedTestProcess =
      options.allowUnisolatedTestProcess === true;
    if (this.allowUnisolatedTestProcess && process.env.NODE_ENV !== "test") {
      throw new CompilerSetupError(
        "CODEX_ISOLATION_UNAVAILABLE",
        "Unisolated App Server launch is restricted to fake processes under NODE_ENV=test.",
      );
    }
  }

  async health(): Promise<CompilerHealth> {
    const isolationHealth = await this.isolationHealth();
    if (!isolationHealth.available) {
      return {
        mode: "live",
        available: false,
        reason: isolationHealth.reason,
        ...(this.model ? { model: this.model } : {}),
      };
    }
    try {
      const { stdout, stderr } = await execFileAsync(
        this.healthCommand,
        this.healthArgs,
        { env: this.environment, timeout: Math.min(this.timeoutMs, 10_000) },
      );
      const version = redactSecrets(`${stdout}${stderr}`.trim()).slice(0, 256);
      return {
        mode: "live",
        available: true,
        version,
        ...(this.model ? { model: this.model } : {}),
      };
    } catch (error) {
      const reason =
        error instanceof Error && "code" in error && error.code === "ENOENT"
          ? "The codex executable is not installed or not on PATH."
          : "Codex App Server health check failed.";
      return {
        mode: "live",
        available: false,
        reason,
        ...(this.model ? { model: this.model } : {}),
      };
    }
  }

  async *compileLab(
    raw: CompileLabInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(CompileLabInputSchema, raw);
    yield* this.run(
      buildCompileLabPrompt(input),
      input.generationDirectory,
      "generate",
      options.signal,
    );
  }

  async *compileExperimentPlan(
    raw: CompileHostedExperimentPlanInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(CompileHostedExperimentPlanInputSchema, raw);
    yield* this.run(
      buildCompileHostedExperimentPlanPrompt(input),
      input.generationDirectory,
      "plan",
      options.signal,
      {
        outputSchema: structuredOutputSchema(input.experimentPlanSchema),
        materialize: (finalMessage) =>
          materializeStructuredHostedOutput(
            input.generationDirectory,
            "experiment-plan.json",
            ExperimentPlanV2Schema,
            finalMessage,
          ),
      },
    );
    yield materializedFileEvent("experiment-plan.json");
  }

  async *repairExperimentPlan(
    raw: RepairHostedExperimentPlanInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(RepairHostedExperimentPlanInputSchema, raw);
    for (const counterexample of input.verifierCounterexamples) {
      yield {
        type: "verifier_counterexample",
        invariant: counterexample.invariant,
        observed: counterexample.observed,
        counterexample: counterexample.counterexample,
      };
    }
    yield* this.run(
      buildRepairHostedExperimentPlanPrompt(input),
      input.generationDirectory,
      "repair",
      options.signal,
      {
        outputSchema: structuredOutputSchema(input.experimentPlanSchema),
        materialize: (finalMessage) =>
          materializeStructuredHostedOutput(
            input.generationDirectory,
            "experiment-plan.json",
            ExperimentPlanV2Schema,
            finalMessage,
          ),
      },
    );
    yield materializedFileEvent("experiment-plan.json");
  }

  async *compileHostedPatchPlan(
    raw: CompileHostedPatchPlanInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(CompileHostedPatchPlanInputSchema, raw);
    yield* this.run(
      buildCompileHostedPatchPlanPrompt(input),
      input.generationDirectory,
      "patch",
      options.signal,
      {
        outputSchema: structuredOutputSchema(input.patchPlanSchema),
        materialize: (finalMessage) =>
          materializeStructuredHostedOutput(
            input.generationDirectory,
            "patch-plan.json",
            PatchPlanV1Schema,
            finalMessage,
          ),
      },
    );
    yield materializedFileEvent("patch-plan.json");
  }

  async *repairHostedPatchPlan(
    raw: RepairHostedPatchPlanInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(RepairHostedPatchPlanInputSchema, raw);
    for (const counterexample of input.verifierCounterexamples) {
      yield {
        type: "verifier_counterexample",
        invariant: counterexample.invariant,
        observed: counterexample.observed,
        counterexample: counterexample.counterexample,
      };
    }
    yield* this.run(
      buildRepairHostedPatchPlanPrompt(input),
      input.generationDirectory,
      "repair",
      options.signal,
      {
        outputSchema: structuredOutputSchema(input.patchPlanSchema),
        materialize: (finalMessage) =>
          materializeStructuredHostedOutput(
            input.generationDirectory,
            "patch-plan.json",
            PatchPlanV1Schema,
            finalMessage,
          ),
      },
    );
    yield materializedFileEvent("patch-plan.json");
  }

  async *repairLab(
    raw: RepairLabInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(RepairLabInputSchema, raw);
    for (const counterexample of input.verifierCounterexamples) {
      yield { type: "verifier_counterexample", ...counterexample };
    }
    yield* this.run(
      buildRepairLabPrompt(input),
      input.generationDirectory,
      "repair",
      options.signal,
    );
  }

  async *compilePatch(
    raw: CompilePatchInput,
    options: CompilerExecutionOptions = {},
  ): AsyncIterable<CompilerEvent> {
    const input = parseInput(CompilePatchInputSchema, raw);
    yield* this.run(
      buildCompilePatchPrompt(input),
      input.generationDirectory,
      "patch",
      options.signal,
    );
  }

  private async *run(
    prompt: string,
    cwd: string,
    phase: "plan" | "generate" | "repair" | "patch",
    signal?: AbortSignal,
    structured?: StructuredRun,
  ): AsyncIterable<CompilerEvent> {
    for (
      let startupAttempt = 0;
      startupAttempt < MAX_APP_SERVER_ATTEMPTS;
      startupAttempt += 1
    ) {
      throwIfCancelled(signal);
      let emittedCompilerOutput = false;
      try {
        for await (const event of this.runOnce(
          prompt,
          cwd,
          phase,
          signal,
          structured,
        )) {
          if (
            event.type !== "status" &&
            event.type !== "final_status" &&
            event.type !== "usage"
          ) {
            emittedCompilerOutput = true;
          }
          yield event;
        }
        return;
      } catch (error) {
        throwIfCancelled(signal);
        const setupError = asSetupError(error);
        if (
          startupAttempt < MAX_APP_SERVER_ATTEMPTS - 1 &&
          !emittedCompilerOutput &&
          setupError.code === "CODEX_PROCESS_EXITED"
        ) {
          await delay(this.restartDelayMs);
          continue;
        }
        throw setupError;
      }
    }
  }

  private async *runOnce(
    prompt: string,
    cwd: string,
    phase: "plan" | "generate" | "repair" | "patch",
    signal?: AbortSignal,
    structured?: StructuredRun,
  ): AsyncIterable<CompilerEvent> {
    throwIfCancelled(signal);
    const launch = await this.prepareLaunch(cwd);
    const connection = new AppServerConnection(
      launch.command,
      launch.args,
      launch.environment,
      launch.spawnCwd,
      this.timeoutMs,
    );
    const cancel = () => connection.cancel();
    signal?.addEventListener("abort", cancel, { once: true });

    try {
      yield { type: "status", phase: "initialize", status: "started" };
      const initialized = InitializeResponseSchema.parse(
        await connection.request("initialize", {
          clientInfo: {
            name: "counterlab",
            title: "CounterLab",
            version: "0.1.0",
          },
          capabilities: {
            experimentalApi: false,
            requestAttestation: false,
            optOutNotificationMethods: [
              "item/reasoning/summaryTextDelta",
              "item/reasoning/summaryPartAdded",
              "item/reasoning/textDelta",
              "rawResponseItem/completed",
            ],
          },
        }),
      );
      void initialized;
      connection.notify("initialized");
      if (launch.revokeCredentials) {
        const account = AccountReadResponseSchema.parse(
          await connection.request("account/read", { refreshToken: false }),
        );
        if (account.requiresOpenaiAuth && account.account === null) {
          throw new CompilerSetupError(
            "CODEX_ISOLATION_UNAVAILABLE",
            "Codex did not load the staged credential before revocation.",
          );
        }
        await launch.revokeCredentials();
      }
      yield { type: "status", phase: "initialize", status: "completed" };

      yield { type: "status", phase: "thread", status: "started" };
      const threadParams: Record<string, unknown> = {
        cwd: launch.protocolCwd,
        approvalPolicy: "never",
        sandbox: structured === undefined ? "workspace-write" : "read-only",
        ephemeral: true,
        serviceName: "counterlab",
      };
      if (structured !== undefined) {
        threadParams.baseInstructions =
          "Return only a final JSON object matching the supplied schema. Do not call tools, inspect files, run commands, or modify files. All required context is in the user message.";
      }
      if (this.model) threadParams.model = this.model;
      const thread = ThreadStartResponseSchema.parse(
        await connection.request("thread/start", threadParams),
      );
      yield {
        type: "status",
        phase: "thread",
        status: "completed",
        detail: `model:${thread.model}`,
      };

      yield { type: "status", phase, status: "started" };
      const turnParams: Record<string, unknown> = {
        threadId: thread.thread.id,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        cwd: launch.protocolCwd,
        approvalPolicy: "never",
        sandboxPolicy:
          structured === undefined
            ? {
                type: "workspaceWrite",
                writableRoots: [launch.protocolCwd],
                networkAccess: false,
                excludeSlashTmp: true,
                excludeTmpdirEnvVar: true,
              }
            : { type: "readOnly", networkAccess: false },
      };
      if (structured !== undefined)
        turnParams.outputSchema = structured.outputSchema;
      if (this.model) turnParams.model = this.model;
      const turn = TurnStartResponseSchema.parse(
        await connection.request("turn/start", turnParams),
      );

      let finished = false;
      let phaseSucceeded = false;
      while (!finished) {
        const event = await connection.nextEvent();
        if (
          structured !== undefined &&
          (event.type === "command" || event.type === "file_change")
        ) {
          throw new CompilerSetupError(
            "CODEX_PROTOCOL_ERROR",
            "Hosted structured compilation attempted to use a disallowed tool.",
          );
        }
        yield event;
        if (
          event.type === "final_status" &&
          event.threadId === thread.thread.id &&
          event.turnId === turn.turn.id
        ) {
          finished = true;
          phaseSucceeded =
            event.status === "completed" || event.status === "verified";
        }
      }
      if (!phaseSucceeded) {
        yield { type: "status", phase, status: "failed" };
        throw new CompilerSetupError(
          "CODEX_PROCESS_EXITED",
          "Codex App Server did not complete the requested turn.",
        );
      }
      if (structured !== undefined) {
        const finalMessage = connection.structuredFinalMessage(
          thread.thread.id,
          turn.turn.id,
        );
        if (finalMessage === undefined) {
          throw new CompilerSetupError(
            "CODEX_PROTOCOL_ERROR",
            "Codex App Server completed without a structured final message.",
          );
        }
        await structured.materialize(finalMessage);
      }
      yield { type: "status", phase, status: "completed" };
    } catch (error) {
      throwIfCancelled(signal);
      if (error instanceof z.ZodError) {
        throw new CompilerSetupError(
          "CODEX_PROTOCOL_ERROR",
          "Codex App Server response did not match the installed protocol.",
          { cause: error },
        );
      }
      throw asSetupError(error);
    } finally {
      signal?.removeEventListener("abort", cancel);
      connection.close();
      await launch.dispose?.();
    }
  }

  private async isolationHealth(): Promise<AppServerLaunchBoundaryHealth> {
    if (this.launchBoundary) return this.launchBoundary.health();
    if (this.allowUnisolatedTestProcess) return { available: true };
    return {
      available: false,
      reason:
        "Live Codex requires an OS-enforced generation read-isolation boundary; none is configured.",
    };
  }

  private async prepareLaunch(cwd: string): Promise<PreparedAppServerLaunch> {
    if (this.launchBoundary) {
      const health = await this.launchBoundary.health();
      if (!health.available) {
        throw new CompilerSetupError(
          "CODEX_ISOLATION_UNAVAILABLE",
          health.reason,
        );
      }
      return this.launchBoundary.prepare({
        command: this.command,
        args: this.commandArgs,
        environment: this.environment,
        hostCwd: cwd,
      });
    }
    if (!this.allowUnisolatedTestProcess) {
      throw new CompilerSetupError(
        "CODEX_ISOLATION_UNAVAILABLE",
        "Live Codex requires an OS-enforced generation read-isolation boundary; none is configured.",
      );
    }
    return {
      command: this.command,
      args: this.commandArgs,
      environment: this.environment,
      protocolCwd: cwd,
    };
  }
}
