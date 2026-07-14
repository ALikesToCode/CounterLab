import {
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerJobSchema,
  assertRunnerJobTransition,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJob,
  type RunnerJobError,
  type RunnerJobKind,
  type RunnerJobStatus,
} from "@counterlab/contracts";

import { hashCanonical } from "./domain.js";

export interface CreateRunnerJobInput {
  jobId: string;
  kind: RunnerJobKind;
  sessionId: string;
  artifactId: string;
  artifactManifestHash: string;
  conceptPack: RunnerJob["conceptPack"];
  inputHashes: string[];
  stateVersion: number;
  maxAttempts: number;
  timeoutSeconds: number;
}

export interface RunnerJobRepository {
  create(job: RunnerJob): Promise<void>;
  find(jobId: string): Promise<RunnerJob | undefined>;
  save(job: RunnerJob, expectedVersion: number): Promise<void>;
  appendEvent(
    job: RunnerJob,
    expectedVersion: number,
    event: PublicCompilerEvent,
  ): Promise<void>;
  listEvents(
    jobId: string,
    afterCursor: number,
  ): Promise<PublicCompilerEvent[]>;
  findCallback(idempotencyKey: string): Promise<RunnerCallback | undefined>;
  complete(
    job: RunnerJob,
    expectedVersion: number,
    callback: RunnerCallback,
  ): Promise<void>;
}

export class RunnerJobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Runner job not found: ${jobId}`);
    this.name = "RunnerJobNotFoundError";
  }
}

export class ConcurrentRunnerJobUpdateError extends Error {
  constructor(jobId: string) {
    super(`Runner job changed during update: ${jobId}`);
    this.name = "ConcurrentRunnerJobUpdateError";
  }
}

export class RunnerEventCursorError extends Error {
  constructor(jobId: string, expected: number, observed: number) {
    super(
      `Runner event cursor mismatch for ${jobId}: expected ${expected}, observed ${observed}`,
    );
    this.name = "RunnerEventCursorError";
  }
}

export class RunnerCallbackConflictError extends Error {
  constructor(idempotencyKey: string) {
    super(`Runner callback idempotency conflict: ${idempotencyKey}`);
    this.name = "RunnerCallbackConflictError";
  }
}

export class RunnerCallbackStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RunnerCallbackStateError";
  }
}

export type RunnerJobTransitionPatch = {
  runnerIdentity?: string;
  outputHashes?: string[];
  error?: RunnerJobError;
};

type RunnerClock = { now(): Date };

const DEFAULT_CLOCK: RunnerClock = { now: () => new Date() };

export class RunnerJobService {
  private readonly clock: RunnerClock;

  constructor(
    private readonly repository: RunnerJobRepository,
    clock: Partial<RunnerClock> = {},
  ) {
    this.clock = { ...DEFAULT_CLOCK, ...clock };
  }

  async createJob(input: CreateRunnerJobInput): Promise<RunnerJob> {
    const timestamp = this.clock.now().toISOString();
    const job = RunnerJobSchema.parse({
      schemaVersion: "1",
      ...input,
      status: "QUEUED",
      jobVersion: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      attempt: 0,
      runnerIdentity: null,
      outputHashes: [],
      eventCursor: 0,
    });
    await this.repository.create(job);
    return structuredClone(job);
  }

  async getJob(jobId: string): Promise<RunnerJob> {
    const job = await this.repository.find(jobId);
    if (job === undefined) throw new RunnerJobNotFoundError(jobId);
    return structuredClone(job);
  }

  async transition(
    jobId: string,
    expectedVersion: number,
    to: RunnerJobStatus,
    patch: RunnerJobTransitionPatch = {},
  ): Promise<RunnerJob> {
    const current = await this.getJob(jobId);
    if (current.jobVersion !== expectedVersion) {
      throw new ConcurrentRunnerJobUpdateError(jobId);
    }
    assertRunnerJobTransition(current.status, to);
    const timestamp = this.clock.now().toISOString();
    const terminal = [
      "VERIFIED",
      "REJECTED",
      "FAILED",
      "CANCELLED",
      "TIMED_OUT",
    ].includes(to);
    const next = RunnerJobSchema.parse({
      ...current,
      status: to,
      jobVersion: current.jobVersion + 1,
      updatedAt: timestamp,
      attempt:
        to === "STARTING" || to === "REPAIRING"
          ? current.attempt + 1
          : current.attempt,
      runnerIdentity: patch.runnerIdentity ?? current.runnerIdentity,
      ...(to === "STARTING" && current.startedAt === undefined
        ? { startedAt: timestamp }
        : {}),
      ...(terminal ? { completedAt: timestamp } : {}),
      ...(patch.outputHashes === undefined
        ? {}
        : { outputHashes: patch.outputHashes }),
      ...(patch.error === undefined ? {} : { error: patch.error }),
    });
    await this.repository.save(next, current.jobVersion);
    return structuredClone(next);
  }

  async appendEvent(
    jobId: string,
    expectedVersion: number,
    event: unknown,
  ): Promise<RunnerJob> {
    const parsed = PublicCompilerEventSchema.parse(event);
    const current = await this.getJob(jobId);
    if (current.jobVersion !== expectedVersion) {
      throw new ConcurrentRunnerJobUpdateError(jobId);
    }
    if (parsed.jobId !== jobId) {
      throw new RunnerCallbackStateError(
        `Compiler event job ${parsed.jobId} does not match ${jobId}`,
      );
    }
    const expectedCursor = current.eventCursor + 1;
    if (parsed.cursor !== expectedCursor) {
      throw new RunnerEventCursorError(jobId, expectedCursor, parsed.cursor);
    }
    const next = RunnerJobSchema.parse({
      ...current,
      eventCursor: parsed.cursor,
      jobVersion: current.jobVersion + 1,
      updatedAt: this.clock.now().toISOString(),
    });
    await this.repository.appendEvent(next, current.jobVersion, parsed);
    return structuredClone(next);
  }

  async listEvents(
    jobId: string,
    afterCursor = 0,
  ): Promise<PublicCompilerEvent[]> {
    await this.getJob(jobId);
    if (!Number.isInteger(afterCursor) || afterCursor < 0) {
      throw new RunnerEventCursorError(jobId, 0, afterCursor);
    }
    return structuredClone(
      await this.repository.listEvents(jobId, afterCursor),
    );
  }

  async recordCallback(
    callback: unknown,
  ): Promise<{ duplicate: boolean; job: RunnerJob }> {
    const parsed = RunnerCallbackSchema.parse(callback);
    const existing = await this.repository.findCallback(parsed.idempotencyKey);
    if (existing !== undefined) {
      if ((await hashCanonical(existing)) !== (await hashCanonical(parsed))) {
        throw new RunnerCallbackConflictError(parsed.idempotencyKey);
      }
      return { duplicate: true, job: await this.getJob(parsed.jobId) };
    }

    const current = await this.getJob(parsed.jobId);
    if (current.stateVersion !== parsed.stateVersion) {
      throw new RunnerCallbackStateError(
        `Callback state version ${parsed.stateVersion} does not match job state version ${current.stateVersion}`,
      );
    }
    if (current.eventCursor !== parsed.finalEventCursor) {
      throw new RunnerEventCursorError(
        current.jobId,
        current.eventCursor,
        parsed.finalEventCursor,
      );
    }
    assertRunnerJobTransition(current.status, parsed.status);
    const next = RunnerJobSchema.parse({
      ...current,
      status: parsed.status,
      jobVersion: current.jobVersion + 1,
      updatedAt: parsed.occurredAt,
      completedAt: parsed.occurredAt,
      outputHashes: parsed.outputHashes,
      ...(parsed.error === undefined ? {} : { error: parsed.error }),
    });
    await this.repository.complete(next, current.jobVersion, parsed);
    return { duplicate: false, job: structuredClone(next) };
  }
}
