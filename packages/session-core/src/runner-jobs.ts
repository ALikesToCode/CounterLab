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
  type RunnerRequestIdentityV1,
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

export interface CreateIdempotentRunnerJobInput extends CreateRunnerJobInput {
  requestIdentity: RunnerRequestIdentityV1;
}

export interface RunnerJobRepository {
  create(job: RunnerJob): Promise<void>;
  createOrReuse(job: RunnerJob): Promise<{
    job: RunnerJob;
    reused: boolean;
  }>;
  find(jobId: string): Promise<RunnerJob | undefined>;
  findForState(input: {
    sessionId: string;
    kind: RunnerJobKind;
    artifactManifestHash: string;
    stateVersion: number;
  }): Promise<RunnerJob | undefined>;
  findReusableRequest(
    requestFingerprint: string,
  ): Promise<RunnerJob | undefined>;
  findForSession(sessionId: string): Promise<RunnerJob[]>;
  findActiveForSession(sessionId: string): Promise<RunnerJob[]>;
  save(job: RunnerJob, expectedVersion: number): Promise<void>;
  appendEvent(
    job: RunnerJob,
    expectedVersion: number,
    event: PublicCompilerEvent,
  ): Promise<void>;
  appendTerminalEvent(
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
    terminalEvent?: PublicCompilerEvent,
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

export type RunnerCallbackClaimToken = {
  ownerId: string;
  callbackHash: string;
};

export type RunnerOutputWriteClaimToken = {
  ownerId: string;
  generatedPath: string;
};

function callbackStableIdentity(
  callback: RunnerCallback,
): Record<string, unknown> {
  return {
    schemaVersion: callback.schemaVersion,
    callbackId: callback.callbackId,
    idempotencyKey: callback.idempotencyKey,
    jobId: callback.jobId,
    stateVersion: callback.stateVersion,
    outputHashes: callback.outputHashes,
    occurredAt: callback.occurredAt,
    operationalMetrics: callback.operationalMetrics ?? null,
  };
}

async function callbacksShareRunnerOrigin(
  stored: RunnerCallback,
  incoming: RunnerCallback,
): Promise<boolean> {
  return (await hashCanonical(stored)) === (await hashCanonical(incoming));
}

async function callbackCanSettleClaim(
  claimed: RunnerCallback,
  settled: RunnerCallback,
): Promise<boolean> {
  if (settled.finalEventCursor < claimed.finalEventCursor) return false;
  if (
    (await hashCanonical(callbackStableIdentity(claimed))) !==
    (await hashCanonical(callbackStableIdentity(settled)))
  ) {
    return false;
  }
  if (claimed.status === settled.status) {
    return (
      (await hashCanonical(claimed.error ?? null)) ===
      (await hashCanonical(settled.error ?? null))
    );
  }
  return (
    claimed.status === "VERIFIED" &&
    settled.status === "REJECTED" &&
    settled.error !== undefined
  );
}

type RunnerClock = { now(): Date };

const DEFAULT_CLOCK: RunnerClock = { now: () => new Date() };
const TERMINAL_JOB_STATUSES = new Set<RunnerJobStatus>([
  "VERIFIED",
  "REJECTED",
  "FAILED",
  "CANCELLED",
  "TIMED_OUT",
]);
const ACTIVE_JOB_STATUSES = new Set<RunnerJobStatus>([
  "QUEUED",
  "STARTING",
  "RUNNING",
  "AWAITING_APPROVAL",
  "REPAIRING",
]);
const REUSABLE_STARTED_JOB_STATUSES = new Set<RunnerJobStatus>([
  "RUNNING",
  "AWAITING_APPROVAL",
  "REPAIRING",
]);
const START_CONFLICT_RETRY_LIMIT = 3;
const CALLBACK_SETTLEMENT_GRACE_MS = 60_000;

function jobDeadline(job: RunnerJob): number {
  const deadlineBase = Date.parse(job.startedAt ?? job.createdAt);
  return deadlineBase + job.timeoutSeconds * 1_000;
}

function isOutputWriteClaimExpired(
  job: RunnerJob,
  claimedAt: string,
  now: Date,
): boolean {
  const timestamp = Date.parse(claimedAt);
  if (!Number.isFinite(timestamp)) return true;
  return now.getTime() >= jobDeadline(job);
}

function callbackSettlementDeadline(job: RunnerJob): number {
  return jobDeadline(job) + CALLBACK_SETTLEMENT_GRACE_MS;
}

function isCallbackClaimExpired(
  job: RunnerJob,
  claimedAt: string,
  now: Date,
): boolean {
  const timestamp = Date.parse(claimedAt);
  if (!Number.isFinite(timestamp)) return true;
  return now.getTime() >= callbackSettlementDeadline(job);
}

function jobDeadlineReached(job: RunnerJob, now: Date): boolean {
  return now.getTime() >= jobDeadline(job);
}

export class RunnerJobService {
  private readonly clock: RunnerClock;

  constructor(
    private readonly repository: RunnerJobRepository,
    clock: Partial<RunnerClock> = {},
  ) {
    this.clock = { ...DEFAULT_CLOCK, ...clock };
  }

  async createJob(input: CreateRunnerJobInput): Promise<RunnerJob> {
    const job = await this.buildJob(input);
    await this.repository.create(job);
    return structuredClone(job);
  }

  async createOrReuseJob(
    input: CreateIdempotentRunnerJobInput,
  ): Promise<{ job: RunnerJob; reused: boolean }> {
    const requestFingerprint = await hashCanonical(input.requestIdentity);
    const job = await this.buildJob({
      ...input,
      requestFingerprint,
    });
    const result = await this.repository.createOrReuse(job);
    if (
      result.job.requestFingerprint !== requestFingerprint ||
      result.job.requestIdentity === undefined ||
      (await hashCanonical(result.job.requestIdentity)) !== requestFingerprint
    ) {
      throw new RunnerCallbackStateError(
        "Reusable runner job request identity does not match its fingerprint",
      );
    }
    return {
      job: structuredClone(result.job),
      reused: result.reused,
    };
  }

  private async buildJob(
    input: CreateRunnerJobInput & {
      requestIdentity?: RunnerRequestIdentityV1;
      requestFingerprint?: string;
    },
  ): Promise<RunnerJob> {
    const timestamp = this.clock.now().toISOString();
    return RunnerJobSchema.parse({
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
  }

  async getJob(jobId: string): Promise<RunnerJob> {
    const job = await this.repository.find(jobId);
    if (job === undefined) throw new RunnerJobNotFoundError(jobId);
    return structuredClone(job);
  }

  async findForState(input: {
    sessionId: string;
    kind: RunnerJobKind;
    artifactManifestHash: string;
    stateVersion: number;
  }): Promise<RunnerJob | undefined> {
    const job = await this.repository.findForState(input);
    return job === undefined ? undefined : structuredClone(job);
  }

  async findReusableRequest(
    requestIdentity: RunnerRequestIdentityV1,
  ): Promise<RunnerJob | undefined> {
    const requestFingerprint = await hashCanonical(requestIdentity);
    const job = await this.repository.findReusableRequest(requestFingerprint);
    if (job === undefined) return undefined;
    if (
      job.requestFingerprint !== requestFingerprint ||
      job.requestIdentity === undefined ||
      (await hashCanonical(job.requestIdentity)) !== requestFingerprint
    ) {
      throw new RunnerCallbackStateError(
        "Reusable runner job request identity does not match its fingerprint",
      );
    }
    return structuredClone(job);
  }

  async listActiveForSession(sessionId: string): Promise<RunnerJob[]> {
    const jobs = await this.repository.findActiveForSession(sessionId);
    for (const job of jobs) {
      if (job.sessionId !== sessionId || !ACTIVE_JOB_STATUSES.has(job.status)) {
        throw new RunnerCallbackStateError(
          "Runner repository returned a job outside the active session query",
        );
      }
    }
    return structuredClone(jobs);
  }

  async listForSession(sessionId: string): Promise<RunnerJob[]> {
    const jobs = await this.repository.findForSession(sessionId);
    const jobIds = new Set<string>();
    for (const job of jobs) {
      if (job.sessionId !== sessionId || jobIds.has(job.jobId)) {
        throw new RunnerCallbackStateError(
          "Runner repository returned invalid session history",
        );
      }
      jobIds.add(job.jobId);
    }
    return structuredClone(
      [...jobs].sort(
        (left, right) =>
          left.createdAt.localeCompare(right.createdAt) ||
          left.jobId.localeCompare(right.jobId),
      ),
    );
  }

  async cancelJob(jobId: string): Promise<RunnerJob> {
    const current = await this.getJob(jobId);
    if (current.status === "CANCELLED") return current;
    if (TERMINAL_JOB_STATUSES.has(current.status)) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} is already terminal with status ${current.status}`,
      );
    }
    try {
      return await this.transition(
        current.jobId,
        current.jobVersion,
        "CANCELLED",
        {
          runnerIdentity:
            current.runnerIdentity ?? "counterlab-control-plane-cancel",
          error: {
            code: "RUNNER_JOB_CANCELLED",
            message: "The learner cancelled this runner job.",
            retryable: true,
          },
        },
      );
    } catch (error) {
      if (!(error instanceof ConcurrentRunnerJobUpdateError)) throw error;
      const updated = await this.getJob(jobId);
      if (updated.status === "CANCELLED") return updated;
      throw error;
    }
  }

  async expireIfTimedOut(jobId: string): Promise<RunnerJob> {
    const current = await this.getJob(jobId);
    if (TERMINAL_JOB_STATUSES.has(current.status)) return current;
    const now = this.clock.now();
    if (!jobDeadlineReached(current, now)) return current;
    if (
      (current.callbackClaim !== undefined ||
        current.callbackRecovery !== undefined) &&
      now.getTime() < callbackSettlementDeadline(current)
    ) {
      return current;
    }
    return this.transition(current.jobId, current.jobVersion, "TIMED_OUT", {
      runnerIdentity: current.runnerIdentity ?? "control-plane-timeout",
      error: {
        code: "RUNNER_JOB_TIMED_OUT",
        message: `Runner job exceeded its ${current.timeoutSeconds} second deadline`,
        retryable: true,
      },
    });
  }

  async acknowledgeDispatch(
    jobId: string,
    expectedVersion: number,
  ): Promise<RunnerJob> {
    const current = await this.getJob(jobId);
    if (current.dispatchAcknowledgedAt !== undefined) return current;
    if (current.jobVersion !== expectedVersion) {
      throw new ConcurrentRunnerJobUpdateError(jobId);
    }
    if (current.status !== "STARTING") {
      if (
        [
          "RUNNING",
          "AWAITING_APPROVAL",
          "REPAIRING",
          "VERIFIED",
          "REJECTED",
        ].includes(current.status)
      ) {
        return current;
      }
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} cannot acknowledge dispatch from ${current.status}`,
      );
    }
    const timestamp = this.clock.now().toISOString();
    const next = RunnerJobSchema.parse({
      ...current,
      dispatchAcknowledgedAt: timestamp,
      jobVersion: current.jobVersion + 1,
      updatedAt: timestamp,
    });
    await this.repository.save(next, current.jobVersion);
    return structuredClone(next);
  }

  async startJob(
    jobId: string,
    runnerIdentity: string,
  ): Promise<{ job: RunnerJob; reused: boolean }> {
    for (let attempt = 0; attempt < START_CONFLICT_RETRY_LIMIT; attempt += 1) {
      const current = await this.getJob(jobId);
      if (REUSABLE_STARTED_JOB_STATUSES.has(current.status)) {
        return { job: current, reused: true };
      }
      if (current.status !== "STARTING") {
        throw new RunnerCallbackStateError(
          `Runner job ${jobId} cannot start from ${current.status}`,
        );
      }
      try {
        return {
          job: await this.transition(
            current.jobId,
            current.jobVersion,
            "RUNNING",
            { runnerIdentity },
          ),
          reused: false,
        };
      } catch (error) {
        if (!(error instanceof ConcurrentRunnerJobUpdateError)) throw error;
      }
    }
    throw new ConcurrentRunnerJobUpdateError(jobId);
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
    const now = this.clock.now();
    const callbackClaimExpired =
      current.callbackClaim !== undefined &&
      isCallbackClaimExpired(current, current.callbackClaim.claimedAt, now);
    const outputWriteClaimExpired =
      current.outputWriteClaim !== undefined &&
      isOutputWriteClaimExpired(
        current,
        current.outputWriteClaim.claimedAt,
        now,
      );
    if (
      to === "TIMED_OUT" &&
      (current.callbackClaim !== undefined ||
        current.callbackRecovery !== undefined) &&
      now.getTime() < callbackSettlementDeadline(current)
    ) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} is inside its bounded callback settlement window`,
      );
    }
    if (
      current.callbackClaim !== undefined &&
      !callbackClaimExpired &&
      (to === "CANCELLED" || to === "TIMED_OUT")
    ) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} has an active callback claim`,
      );
    }
    if (
      current.outputWriteClaim !== undefined &&
      !outputWriteClaimExpired &&
      (to === "CANCELLED" || to === "TIMED_OUT")
    ) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} has an active output-write claim`,
      );
    }
    assertRunnerJobTransition(current.status, to);
    let transitionable = current;
    if (callbackClaimExpired && current.callbackClaim !== undefined) {
      const callbackClaim = current.callbackClaim;
      const { callbackClaim: _callbackClaim, ...released } = transitionable;
      transitionable = RunnerJobSchema.parse({
        ...released,
        callbackRecovery: {
          idempotencyKey: callbackClaim.idempotencyKey,
          callbackHash: callbackClaim.callbackHash,
          releasedAt: now.toISOString(),
        },
      });
    }
    if (
      outputWriteClaimExpired &&
      transitionable.outputWriteClaim !== undefined
    ) {
      const { outputWriteClaim: _outputWriteClaim, ...released } =
        transitionable;
      transitionable = RunnerJobSchema.parse(released);
    }
    const timestamp = now.toISOString();
    const terminal = TERMINAL_JOB_STATUSES.has(to);
    const next = RunnerJobSchema.parse({
      ...transitionable,
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
    callbackClaim?: RunnerCallbackClaimToken,
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
    if (TERMINAL_JOB_STATUSES.has(current.status)) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} cannot append events after terminal status ${current.status}`,
      );
    }
    const callbackClaimAuthorized =
      current.callbackClaim !== undefined &&
      callbackClaim !== undefined &&
      !isCallbackClaimExpired(
        current,
        current.callbackClaim.claimedAt,
        this.clock.now(),
      ) &&
      current.callbackClaim.ownerId === callbackClaim.ownerId &&
      current.callbackClaim.callbackHash === callbackClaim.callbackHash;
    if (
      ((current.callbackClaim !== undefined || callbackClaim !== undefined) &&
        !callbackClaimAuthorized) ||
      current.outputWriteClaim !== undefined
    ) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} cannot append events while a terminal mutation is claimed`,
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

  async failJobWithEvent(
    jobId: string,
    expectedVersion: number,
    patch: Required<Pick<RunnerJobTransitionPatch, "runnerIdentity" | "error">>,
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
    if (
      parsed.kind !== "job.failed" ||
      parsed.code !== patch.error.code ||
      parsed.message !== patch.error.message
    ) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} failure event must match the terminal error`,
      );
    }
    if (
      current.callbackClaim !== undefined ||
      current.outputWriteClaim !== undefined
    ) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} cannot fail while a terminal mutation is claimed`,
      );
    }
    assertRunnerJobTransition(current.status, "FAILED");
    const expectedCursor = current.eventCursor + 1;
    if (parsed.cursor !== expectedCursor) {
      throw new RunnerEventCursorError(jobId, expectedCursor, parsed.cursor);
    }
    const timestamp = this.clock.now().toISOString();
    const next = RunnerJobSchema.parse({
      ...current,
      status: "FAILED",
      runnerIdentity: patch.runnerIdentity,
      error: patch.error,
      eventCursor: parsed.cursor,
      jobVersion: current.jobVersion + 1,
      updatedAt: timestamp,
      completedAt: timestamp,
    });
    await this.repository.appendTerminalEvent(next, current.jobVersion, parsed);
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

  async claimOutputWrite(
    jobId: string,
    expectedVersion: number,
    ownerId: string,
    generatedPath: string,
  ): Promise<{ job: RunnerJob; claim: RunnerOutputWriteClaimToken }> {
    if (ownerId.trim().length === 0 || ownerId.length > 200) {
      throw new RunnerCallbackStateError(
        "Runner output claim owner must be a bounded opaque identifier",
      );
    }
    if (generatedPath.trim().length === 0 || generatedPath.length > 200) {
      throw new RunnerCallbackStateError(
        "Runner output claim path must be bounded",
      );
    }
    const current = await this.getJob(jobId);
    if (current.jobVersion !== expectedVersion) {
      throw new ConcurrentRunnerJobUpdateError(jobId);
    }
    if (current.status !== "RUNNING" && current.status !== "REPAIRING") {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} cannot accept output from ${current.status}`,
      );
    }
    const now = this.clock.now();
    if (jobDeadlineReached(current, now)) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} cannot claim an output write after its deadline`,
      );
    }
    if (current.callbackClaim !== undefined) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} has an active callback claim`,
      );
    }
    const existingExpired =
      current.outputWriteClaim !== undefined &&
      isOutputWriteClaimExpired(
        current,
        current.outputWriteClaim.claimedAt,
        now,
      );
    if (current.outputWriteClaim !== undefined && !existingExpired) {
      throw new RunnerCallbackStateError(
        `Runner job ${jobId} has an active output-write claim`,
      );
    }
    const claim = { ownerId, generatedPath };
    const { outputWriteClaim: _outputWriteClaim, ...claimable } = current;
    const next = RunnerJobSchema.parse({
      ...claimable,
      outputWriteClaim: {
        ...claim,
        claimedAt: now.toISOString(),
      },
      jobVersion: current.jobVersion + 1,
      updatedAt: now.toISOString(),
    });
    await this.repository.save(next, current.jobVersion);
    return { job: structuredClone(next), claim };
  }

  async releaseOutputWriteClaim(
    jobId: string,
    claim: RunnerOutputWriteClaimToken,
  ): Promise<void> {
    for (let attempt = 0; attempt < START_CONFLICT_RETRY_LIMIT; attempt += 1) {
      const current = await this.getJob(jobId);
      if (
        current.outputWriteClaim === undefined ||
        current.outputWriteClaim.ownerId !== claim.ownerId ||
        current.outputWriteClaim.generatedPath !== claim.generatedPath
      ) {
        return;
      }
      const { outputWriteClaim: _outputWriteClaim, ...released } = current;
      const timestamp = this.clock.now().toISOString();
      const next = RunnerJobSchema.parse({
        ...released,
        jobVersion: current.jobVersion + 1,
        updatedAt: timestamp,
      });
      try {
        await this.repository.save(next, current.jobVersion);
        return;
      } catch (error) {
        if (!(error instanceof ConcurrentRunnerJobUpdateError)) throw error;
      }
    }
    throw new ConcurrentRunnerJobUpdateError(jobId);
  }

  async assertOutputWriteClaim(
    jobId: string,
    claim: RunnerOutputWriteClaimToken,
  ): Promise<void> {
    const current = await this.getJob(jobId);
    if (
      current.outputWriteClaim === undefined ||
      current.outputWriteClaim.ownerId !== claim.ownerId ||
      current.outputWriteClaim.generatedPath !== claim.generatedPath ||
      isOutputWriteClaimExpired(
        current,
        current.outputWriteClaim.claimedAt,
        this.clock.now(),
      )
    ) {
      throw new RunnerCallbackStateError(
        `Runner output claim does not authorize writing ${claim.generatedPath}`,
      );
    }
  }

  async claimCallback(
    callback: unknown,
    ownerId: string,
  ): Promise<
    | { duplicate: true; job: RunnerJob }
    | {
        duplicate: false;
        job: RunnerJob;
        claim: RunnerCallbackClaimToken;
      }
  > {
    const parsed = RunnerCallbackSchema.parse(callback);
    if (ownerId.trim().length === 0 || ownerId.length > 200) {
      throw new RunnerCallbackStateError(
        "Runner callback claim owner must be a bounded opaque identifier",
      );
    }
    const existing = await this.repository.findCallback(parsed.idempotencyKey);
    if (existing !== undefined) {
      if (!(await callbacksShareRunnerOrigin(existing, parsed))) {
        throw new RunnerCallbackConflictError(parsed.idempotencyKey);
      }
      return { duplicate: true, job: await this.getJob(parsed.jobId) };
    }

    const current = await this.getJob(parsed.jobId);
    if (TERMINAL_JOB_STATUSES.has(current.status)) {
      throw new RunnerCallbackStateError(
        `Runner callback cannot claim terminal job ${current.jobId} with status ${current.status}`,
      );
    }
    if (current.stateVersion !== parsed.stateVersion) {
      throw new RunnerCallbackStateError(
        `Callback state version ${parsed.stateVersion} does not match job state version ${current.stateVersion}`,
      );
    }
    const callbackHash = await hashCanonical(parsed);
    const now = this.clock.now();
    const callbackClaimExpired =
      current.callbackClaim !== undefined &&
      isCallbackClaimExpired(current, current.callbackClaim.claimedAt, now);
    const matchingClaim =
      current.callbackClaim?.idempotencyKey === parsed.idempotencyKey &&
      current.callbackClaim.callbackHash === callbackHash;
    const recovering =
      current.callbackRecovery?.idempotencyKey === parsed.idempotencyKey &&
      current.callbackRecovery.callbackHash === callbackHash;
    if (now.getTime() >= callbackSettlementDeadline(current)) {
      throw new RunnerCallbackStateError(
        `Runner callback cannot claim job ${current.jobId} after its settlement deadline`,
      );
    }
    if (jobDeadlineReached(current, now) && !recovering && !matchingClaim) {
      throw new RunnerCallbackStateError(
        `A new runner callback cannot claim job ${current.jobId} after its deadline`,
      );
    }
    if (
      current.eventCursor !== parsed.finalEventCursor &&
      !(recovering && current.eventCursor > parsed.finalEventCursor)
    ) {
      throw new RunnerEventCursorError(
        current.jobId,
        current.eventCursor,
        parsed.finalEventCursor,
      );
    }
    try {
      assertRunnerJobTransition(current.status, parsed.status);
    } catch (error) {
      throw new RunnerCallbackStateError(
        error instanceof Error
          ? error.message
          : `Runner callback cannot transition job ${current.jobId} from ${current.status}`,
      );
    }
    if (current.callbackClaim !== undefined) {
      if (!matchingClaim) {
        throw new RunnerCallbackConflictError(parsed.idempotencyKey);
      }
      if (!callbackClaimExpired) {
        throw new RunnerCallbackStateError(
          `Runner callback ${parsed.idempotencyKey} is already being processed`,
        );
      }
    }
    const outputWriteClaimExpired =
      current.outputWriteClaim !== undefined &&
      isOutputWriteClaimExpired(
        current,
        current.outputWriteClaim.claimedAt,
        now,
      );
    if (current.outputWriteClaim !== undefined && !outputWriteClaimExpired) {
      throw new RunnerCallbackStateError(
        `Runner callback ${parsed.idempotencyKey} cannot overtake an active output write`,
      );
    }
    let claimable = current;
    if (callbackClaimExpired && claimable.callbackClaim !== undefined) {
      const { callbackClaim: _callbackClaim, ...released } = claimable;
      claimable = RunnerJobSchema.parse(released);
    }
    if (outputWriteClaimExpired && claimable.outputWriteClaim !== undefined) {
      const { outputWriteClaim: _outputWriteClaim, ...released } = claimable;
      claimable = RunnerJobSchema.parse(released);
    }
    const timestamp = now.toISOString();
    const claim = { ownerId, callbackHash };
    const { callbackRecovery: _callbackRecovery, ...withoutRecovery } =
      claimable;
    const next = RunnerJobSchema.parse({
      ...withoutRecovery,
      callbackClaim: {
        idempotencyKey: parsed.idempotencyKey,
        callbackHash,
        ownerId,
        claimedAt: timestamp,
      },
      jobVersion: current.jobVersion + 1,
      updatedAt: timestamp,
    });
    await this.repository.save(next, current.jobVersion);
    return { duplicate: false, job: structuredClone(next), claim };
  }

  async releaseCallbackClaim(
    jobId: string,
    claim: RunnerCallbackClaimToken,
  ): Promise<void> {
    for (let attempt = 0; attempt < START_CONFLICT_RETRY_LIMIT; attempt += 1) {
      const current = await this.getJob(jobId);
      if (
        current.callbackClaim === undefined ||
        current.callbackClaim.ownerId !== claim.ownerId ||
        current.callbackClaim.callbackHash !== claim.callbackHash
      ) {
        return;
      }
      const { callbackClaim: _callbackClaim, ...released } = current;
      const next = RunnerJobSchema.parse({
        ...released,
        callbackRecovery: {
          idempotencyKey: current.callbackClaim.idempotencyKey,
          callbackHash: current.callbackClaim.callbackHash,
          releasedAt: this.clock.now().toISOString(),
        },
        jobVersion: current.jobVersion + 1,
        updatedAt: this.clock.now().toISOString(),
      });
      try {
        await this.repository.save(next, current.jobVersion);
        return;
      } catch (error) {
        if (!(error instanceof ConcurrentRunnerJobUpdateError)) throw error;
      }
    }
    throw new ConcurrentRunnerJobUpdateError(jobId);
  }

  async assertCallbackClaim(
    jobId: string,
    claim: RunnerCallbackClaimToken,
  ): Promise<void> {
    const current = await this.getJob(jobId);
    if (
      current.callbackClaim === undefined ||
      current.callbackClaim.ownerId !== claim.ownerId ||
      current.callbackClaim.callbackHash !== claim.callbackHash ||
      isCallbackClaimExpired(
        current,
        current.callbackClaim.claimedAt,
        this.clock.now(),
      )
    ) {
      throw new RunnerCallbackStateError(
        `Runner callback claim does not authorize mutation for ${jobId}`,
      );
    }
  }

  async recordCallback(
    callback: unknown,
    options: {
      claim?: RunnerCallbackClaimToken;
      claimedCallback?: unknown;
      terminalEvent?: unknown;
    } = {},
  ): Promise<{ duplicate: boolean; job: RunnerJob }> {
    const parsed = RunnerCallbackSchema.parse(callback);
    const claimedCallback = RunnerCallbackSchema.parse(
      options.claimedCallback ?? parsed,
    );
    const existing = await this.repository.findCallback(parsed.idempotencyKey);
    if (existing !== undefined) {
      const settledJob = await this.getJob(parsed.jobId);
      if (
        !(await callbacksShareRunnerOrigin(existing, claimedCallback)) ||
        !(await callbackCanSettleClaim(claimedCallback, parsed)) ||
        parsed.status !== settledJob.status ||
        parsed.finalEventCursor !== settledJob.eventCursor ||
        (await hashCanonical(parsed.outputHashes)) !==
          (await hashCanonical(settledJob.outputHashes)) ||
        (await hashCanonical(parsed.error ?? null)) !==
          (await hashCanonical(settledJob.error ?? null))
      ) {
        throw new RunnerCallbackConflictError(parsed.idempotencyKey);
      }
      return { duplicate: true, job: settledJob };
    }

    let claim = options.claim;
    if (claim === undefined) {
      const claimed = await this.claimCallback(
        claimedCallback,
        `record-callback:${claimedCallback.callbackId}`,
      );
      if (claimed.duplicate) return claimed;
      claim = claimed.claim;
    }

    const current = await this.getJob(parsed.jobId);
    const claimedCallbackHash = await hashCanonical(claimedCallback);
    if (
      current.callbackClaim === undefined ||
      current.callbackClaim.ownerId !== claim.ownerId ||
      current.callbackClaim.callbackHash !== claim.callbackHash ||
      current.callbackClaim.idempotencyKey !== parsed.idempotencyKey ||
      claim.callbackHash !== claimedCallbackHash ||
      !(await callbackCanSettleClaim(claimedCallback, parsed))
    ) {
      throw new RunnerCallbackStateError(
        `Runner callback claim does not authorize completion for ${parsed.jobId}`,
      );
    }
    const completedAt = this.clock.now();
    if (
      isCallbackClaimExpired(
        current,
        current.callbackClaim.claimedAt,
        completedAt,
      ) ||
      completedAt.getTime() >= callbackSettlementDeadline(current)
    ) {
      throw new RunnerCallbackStateError(
        `Runner callback cannot complete job ${parsed.jobId} after its claim deadline`,
      );
    }
    if (current.stateVersion !== parsed.stateVersion) {
      throw new RunnerCallbackStateError(
        `Callback state version ${parsed.stateVersion} does not match job state version ${current.stateVersion}`,
      );
    }
    const terminalEvent =
      options.terminalEvent === undefined
        ? undefined
        : PublicCompilerEventSchema.parse(options.terminalEvent);
    const expectedFinalCursor =
      current.eventCursor + (terminalEvent === undefined ? 0 : 1);
    if (
      terminalEvent !== undefined &&
      (terminalEvent.jobId !== parsed.jobId ||
        terminalEvent.cursor !== expectedFinalCursor)
    ) {
      throw new RunnerCallbackStateError(
        `Terminal authority event does not close runner job ${parsed.jobId}`,
      );
    }
    if (expectedFinalCursor !== parsed.finalEventCursor) {
      throw new RunnerEventCursorError(
        current.jobId,
        expectedFinalCursor,
        parsed.finalEventCursor,
      );
    }
    try {
      assertRunnerJobTransition(current.status, parsed.status);
    } catch (error) {
      throw new RunnerCallbackStateError(
        error instanceof Error
          ? error.message
          : `Runner callback cannot transition job ${current.jobId} from ${current.status}`,
      );
    }
    const {
      callbackClaim: _callbackClaim,
      callbackRecovery: _callbackRecovery,
      ...completing
    } = current;
    const next = RunnerJobSchema.parse({
      ...completing,
      status: parsed.status,
      jobVersion: current.jobVersion + 1,
      updatedAt: completedAt.toISOString(),
      completedAt: completedAt.toISOString(),
      eventCursor: expectedFinalCursor,
      outputHashes: parsed.outputHashes,
      ...(parsed.error === undefined ? {} : { error: parsed.error }),
    });
    await this.repository.complete(
      next,
      current.jobVersion,
      claimedCallback,
      terminalEvent,
    );
    return { duplicate: false, job: structuredClone(next) };
  }
}
