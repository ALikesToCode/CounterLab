import { execFile } from "node:child_process";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { promisify } from "node:util";

import { z } from "zod";

import {
  buildCompileLabPrompt,
  buildCompilePatchPrompt,
  buildRepairLabPrompt,
} from "./prompts.js";
import { redactSecrets, sanitizeAppServerMessage } from "./sanitizer.js";
import {
  CompileLabInputSchema,
  CompilePatchInputSchema,
  CompilerSetupError,
  RepairLabInputSchema,
  type CodexCompiler,
  type CompileLabInput,
  type CompilePatchInput,
  type CompilerEvent,
  type CompilerHealth,
  type RepairLabInput,
} from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_PROTOCOL_BUFFER_BYTES = 1_048_576;
const MAX_STDERR_BYTES = 4_000;

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

export type AppServerCodexCompilerOptions = {
  command?: string;
  commandArgs?: string[];
  healthCommand?: string;
  healthArgs?: string[];
  model?: string | undefined;
  timeoutMs?: number;
  environment?: NodeJS.ProcessEnv;
};

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
  private fatalError: Error | undefined;

  constructor(
    command: string,
    args: string[],
    environment: NodeJS.ProcessEnv,
    private readonly timeoutMs: number,
  ) {
    try {
      this.process = spawn(command, args, {
        env: environment,
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
    this.process.stdin.end();
    if (this.process.exitCode === null && this.process.signalCode === null) {
      this.process.kill("SIGTERM");
      const timer = setTimeout(() => {
        if (
          this.process.exitCode === null &&
          this.process.signalCode === null
        ) {
          this.process.kill("SIGKILL");
        }
      }, 250);
      timer.unref();
    }
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
      this.process.stdin.destroy();
      this.process.kill("SIGTERM");
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
  private readonly environment: NodeJS.ProcessEnv;

  constructor(options: AppServerCodexCompilerOptions = {}) {
    this.command = options.command ?? "codex";
    this.commandArgs = options.commandArgs ?? ["app-server", "--stdio"];
    this.healthCommand = options.healthCommand ?? this.command;
    this.healthArgs = options.healthArgs ?? ["--version"];
    this.model =
      options.model?.trim() || process.env.CODEX_MODEL?.trim() || undefined;
    this.timeoutMs = options.timeoutMs ?? 120_000;
    this.environment = safeEnvironment(options.environment ?? process.env);
  }

  async health(): Promise<CompilerHealth> {
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

  async *compileLab(raw: CompileLabInput): AsyncIterable<CompilerEvent> {
    const input = parseInput(CompileLabInputSchema, raw);
    yield* this.run(
      buildCompileLabPrompt(input),
      input.generationDirectory,
      "generate",
    );
  }

  async *repairLab(raw: RepairLabInput): AsyncIterable<CompilerEvent> {
    const input = parseInput(RepairLabInputSchema, raw);
    for (const counterexample of input.verifierCounterexamples) {
      yield { type: "verifier_counterexample", ...counterexample };
    }
    yield* this.run(
      buildRepairLabPrompt(input),
      input.generationDirectory,
      "repair",
    );
  }

  async *compilePatch(raw: CompilePatchInput): AsyncIterable<CompilerEvent> {
    const input = parseInput(CompilePatchInputSchema, raw);
    yield* this.run(
      buildCompilePatchPrompt(input),
      input.generationDirectory,
      "patch",
    );
  }

  private async *run(
    prompt: string,
    cwd: string,
    phase: "generate" | "repair" | "patch",
  ): AsyncIterable<CompilerEvent> {
    const connection = new AppServerConnection(
      this.command,
      this.commandArgs,
      this.environment,
      this.timeoutMs,
    );

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
      yield { type: "status", phase: "initialize", status: "completed" };

      yield { type: "status", phase: "thread", status: "started" };
      const threadParams: Record<string, unknown> = {
        cwd,
        approvalPolicy: "never",
        sandbox: "workspace-write",
        ephemeral: true,
        serviceName: "counterlab",
      };
      if (this.model) threadParams.model = this.model;
      const thread = ThreadStartResponseSchema.parse(
        await connection.request("thread/start", threadParams),
      );
      yield {
        type: "status",
        phase: "thread",
        status: "completed",
        ...(this.model ? { detail: `model:${thread.model}` } : {}),
      };

      yield { type: "status", phase, status: "started" };
      const turnParams: Record<string, unknown> = {
        threadId: thread.thread.id,
        input: [{ type: "text", text: prompt, text_elements: [] }],
        cwd,
        approvalPolicy: "never",
      };
      if (this.model) turnParams.model = this.model;
      const turn = TurnStartResponseSchema.parse(
        await connection.request("turn/start", turnParams),
      );

      let finished = false;
      let phaseSucceeded = false;
      while (!finished) {
        const event = await connection.nextEvent();
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
      yield {
        type: "status",
        phase,
        status: phaseSucceeded ? "completed" : "failed",
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new CompilerSetupError(
          "CODEX_PROTOCOL_ERROR",
          "Codex App Server response did not match the installed protocol.",
          { cause: error },
        );
      }
      throw asSetupError(error);
    } finally {
      connection.close();
    }
  }
}
