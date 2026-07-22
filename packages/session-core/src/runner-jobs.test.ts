import { describe, expect, it } from "vitest";

import type {
  PublicCompilerEvent,
  RunnerCallback,
  RunnerJob,
  RunnerJobKind,
} from "@counterlab/contracts";

import {
  ConcurrentRunnerJobUpdateError,
  RunnerCallbackConflictError,
  RunnerCallbackStateError,
  RunnerJobService,
  type CreateRunnerJobInput,
  type RunnerJobRepository,
} from "./runner-jobs.js";

class MemoryRunnerJobRepository implements RunnerJobRepository {
  readonly jobs = new Map<string, RunnerJob>();
  readonly events = new Map<string, PublicCompilerEvent[]>();
  readonly callbacks = new Map<string, RunnerCallback>();

  async create(job: RunnerJob): Promise<void> {
    if (this.jobs.has(job.jobId)) throw new Error("duplicate runner job");
    this.jobs.set(job.jobId, structuredClone(job));
  }

  async createOrReuse(
    job: RunnerJob,
  ): Promise<{ job: RunnerJob; reused: boolean }> {
    const existing = [...this.jobs.values()].find(
      (candidate) =>
        candidate.requestFingerprint === job.requestFingerprint &&
        !["REJECTED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(
          candidate.status,
        ),
    );
    if (existing !== undefined) {
      return { job: structuredClone(existing), reused: true };
    }
    await this.create(job);
    return { job: structuredClone(job), reused: false };
  }

  async find(jobId: string): Promise<RunnerJob | undefined> {
    const job = this.jobs.get(jobId);
    return job === undefined ? undefined : structuredClone(job);
  }

  async findReusableRequest(
    requestFingerprint: string,
  ): Promise<RunnerJob | undefined> {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        candidate.requestFingerprint === requestFingerprint &&
        !["REJECTED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(
          candidate.status,
        ),
    );
    return job === undefined ? undefined : structuredClone(job);
  }

  async findActiveForSession(sessionId: string): Promise<RunnerJob[]> {
    return structuredClone(
      [...this.jobs.values()].filter(
        (job) =>
          job.sessionId === sessionId &&
          [
            "QUEUED",
            "STARTING",
            "RUNNING",
            "AWAITING_APPROVAL",
            "REPAIRING",
          ].includes(job.status),
      ),
    );
  }

  async findForSession(sessionId: string): Promise<RunnerJob[]> {
    return structuredClone(
      [...this.jobs.values()].filter((job) => job.sessionId === sessionId),
    );
  }

  async findForState(input: {
    sessionId: string;
    kind: RunnerJobKind;
    artifactManifestHash: string;
    stateVersion: number;
  }): Promise<RunnerJob | undefined> {
    const job = [...this.jobs.values()].find(
      (candidate) =>
        !["REJECTED", "FAILED", "CANCELLED", "TIMED_OUT"].includes(
          candidate.status,
        ) &&
        candidate.sessionId === input.sessionId &&
        candidate.kind === input.kind &&
        candidate.artifactManifestHash === input.artifactManifestHash &&
        candidate.stateVersion === input.stateVersion,
    );
    return job === undefined ? undefined : structuredClone(job);
  }

  async save(job: RunnerJob, expectedVersion: number): Promise<void> {
    const current = this.jobs.get(job.jobId);
    if (current?.jobVersion !== expectedVersion) {
      throw new ConcurrentRunnerJobUpdateError(job.jobId);
    }
    this.jobs.set(job.jobId, structuredClone(job));
  }

  async appendEvent(
    job: RunnerJob,
    expectedVersion: number,
    event: PublicCompilerEvent,
  ): Promise<void> {
    await this.save(job, expectedVersion);
    const events = this.events.get(job.jobId) ?? [];
    events.push(structuredClone(event));
    this.events.set(job.jobId, events);
  }

  async appendTerminalEvent(
    job: RunnerJob,
    expectedVersion: number,
    event: PublicCompilerEvent,
  ): Promise<void> {
    await this.appendEvent(job, expectedVersion, event);
  }

  async listEvents(
    jobId: string,
    afterCursor: number,
  ): Promise<PublicCompilerEvent[]> {
    return structuredClone(
      (this.events.get(jobId) ?? []).filter(
        (event) => event.cursor > afterCursor,
      ),
    );
  }

  async findCallback(
    idempotencyKey: string,
  ): Promise<RunnerCallback | undefined> {
    const callback = this.callbacks.get(idempotencyKey);
    return callback === undefined ? undefined : structuredClone(callback);
  }

  async complete(
    job: RunnerJob,
    expectedVersion: number,
    callback: RunnerCallback,
    terminalEvent?: PublicCompilerEvent,
  ): Promise<void> {
    await this.save(job, expectedVersion);
    if (terminalEvent !== undefined) {
      const events = this.events.get(job.jobId) ?? [];
      events.push(structuredClone(terminalEvent));
      this.events.set(job.jobId, events);
    }
    this.callbacks.set(callback.idempotencyKey, structuredClone(callback));
  }
}

class StartRaceRunnerJobRepository extends MemoryRunnerJobRepository {
  private injectAcknowledgement = true;

  override async save(job: RunnerJob, expectedVersion: number): Promise<void> {
    if (this.injectAcknowledgement && job.status === "RUNNING") {
      this.injectAcknowledgement = false;
      const current = this.jobs.get(job.jobId);
      if (current === undefined) throw new Error("runner job disappeared");
      this.jobs.set(job.jobId, {
        ...current,
        dispatchAcknowledgedAt: "2026-07-15T00:00:02.000Z",
        jobVersion: current.jobVersion + 1,
        updatedAt: "2026-07-15T00:00:02.000Z",
      });
      throw new ConcurrentRunnerJobUpdateError(job.jobId);
    }
    await super.save(job, expectedVersion);
  }
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

function jobInput(): CreateRunnerJobInput {
  return {
    jobId: "job_live_1",
    kind: "LAB_COMPILE",
    sessionId: "session_live_1",
    artifactId: "artifact_live_1",
    artifactManifestHash: HASH_A,
    conceptPack: { id: "entity_leakage", version: "2.0.0" },
    inputHashes: [HASH_B],
    stateVersion: 4,
    maxAttempts: 3,
    timeoutSeconds: 90,
  };
}

function service(repository = new MemoryRunnerJobRepository()) {
  let tick = 0;
  return {
    repository,
    service: new RunnerJobService(repository, {
      now: () =>
        new Date(`2026-07-15T00:00:${String(tick++).padStart(2, "0")}.000Z`),
    }),
  };
}

describe("RunnerJobService", () => {
  it("returns deterministic all-status session history and rejects foreign jobs", async () => {
    const harness = service();
    const later = await harness.service.createJob({
      ...jobInput(),
      jobId: "job_z",
    });
    const earlier = await harness.service.createJob({
      ...jobInput(),
      jobId: "job_a",
    });
    harness.repository.jobs.set(later.jobId, {
      ...later,
      createdAt: earlier.createdAt,
      updatedAt: earlier.updatedAt,
      status: "REJECTED",
      error: {
        code: "TEST_REJECTED",
        message: "The bounded test job was rejected.",
        retryable: true,
      },
      runnerIdentity: "runner-history-test",
    });

    await expect(
      harness.service.listForSession("session_live_1"),
    ).resolves.toMatchObject([
      { jobId: "job_a", status: "QUEUED" },
      { jobId: "job_z", status: "REJECTED" },
    ]);

    const original = harness.repository.findForSession.bind(harness.repository);
    harness.repository.findForSession = async (sessionId) => [
      ...(await original(sessionId)),
      { ...earlier, jobId: "job_foreign", sessionId: "session_foreign" },
    ];
    await expect(
      harness.service.listForSession("session_live_1"),
    ).rejects.toThrow(/invalid session history/u);
  });

  it("atomically reuses one semantic request and separates interactive configurations", async () => {
    const harness = service();
    const identity = {
      schemaVersion: "1" as const,
      sessionId: "session_live_1",
      mode: "live_notebook" as const,
      purpose: "LAB_RUN_INTERACTIVE" as const,
      artifactId: "artifact_live_1",
      artifactManifestHash: HASH_A,
      conceptPack: { id: "entity_leakage" as const, version: "2.0.0" },
      authorityProfileHash: HASH_B,
      authorityInputHashes: { plan: HASH_C },
      configurationHash: "d".repeat(64),
    };
    const first = await harness.service.createOrReuseJob({
      ...jobInput(),
      jobId: "job_interactive_1",
      kind: "LAB_RUN",
      requestIdentity: identity,
    });
    const duplicate = await harness.service.createOrReuseJob({
      ...jobInput(),
      jobId: "job_interactive_2",
      kind: "LAB_RUN",
      requestIdentity: identity,
    });
    const distinct = await harness.service.createOrReuseJob({
      ...jobInput(),
      jobId: "job_interactive_3",
      kind: "LAB_RUN",
      requestIdentity: {
        ...identity,
        configurationHash: "e".repeat(64),
      },
    });

    expect(first).toMatchObject({ reused: false });
    expect(duplicate).toMatchObject({
      reused: true,
      job: { jobId: "job_interactive_1" },
    });
    expect(distinct).toMatchObject({
      reused: false,
      job: { jobId: "job_interactive_3" },
    });
    expect(harness.repository.jobs.size).toBe(2);
  });

  it("finds the one job bound to a session state and cancels it idempotently", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );

    await expect(
      harness.service.findForState({
        sessionId: starting.sessionId,
        kind: starting.kind,
        artifactManifestHash: starting.artifactManifestHash,
        stateVersion: starting.stateVersion,
      }),
    ).resolves.toMatchObject({ jobId: starting.jobId, status: "STARTING" });

    const cancelled = await harness.service.cancelJob(starting.jobId);
    expect(cancelled).toMatchObject({
      status: "CANCELLED",
      error: {
        code: "RUNNER_JOB_CANCELLED",
        retryable: true,
      },
    });
    await expect(harness.service.cancelJob(starting.jobId)).resolves.toEqual(
      cancelled,
    );
  });

  it("expires a stalled non-terminal job from its start deadline", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob({
      ...jobInput(),
      timeoutSeconds: 30,
    });
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );

    now = new Date("2026-07-15T00:00:29.000Z");
    await expect(jobs.expireIfTimedOut(starting.jobId)).resolves.toMatchObject({
      status: "STARTING",
    });

    now = new Date("2026-07-15T00:00:30.000Z");
    await expect(jobs.expireIfTimedOut(starting.jobId)).resolves.toMatchObject({
      status: "TIMED_OUT",
      completedAt: "2026-07-15T00:00:30.000Z",
      error: {
        code: "RUNNER_JOB_TIMED_OUT",
        retryable: true,
      },
    });
  });

  it("creates and advances an optimistic job without allowing stale writes", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    expect(queued).toMatchObject({
      status: "QUEUED",
      jobVersion: 1,
      attempt: 0,
      runnerIdentity: null,
    });

    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    expect(starting).toMatchObject({
      status: "STARTING",
      jobVersion: 2,
      attempt: 1,
      runnerIdentity: "runner-container-test",
    });

    await expect(
      harness.service.transition(queued.jobId, 1, "RUNNING"),
    ).rejects.toBeInstanceOf(ConcurrentRunnerJobUpdateError);
  });

  it("starts once across a dispatch-acknowledgement race and reuses duplicate starts", async () => {
    const harness = service(new StartRaceRunnerJobRepository());
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );

    const first = await harness.service.startJob(
      starting.jobId,
      "runner-container-test",
    );
    const duplicate = await harness.service.startJob(
      starting.jobId,
      "runner-container-test",
    );

    expect(first).toMatchObject({
      reused: false,
      job: {
        status: "RUNNING",
        dispatchAcknowledgedAt: "2026-07-15T00:00:02.000Z",
      },
    });
    expect(duplicate).toEqual({ job: first.job, reused: true });
  });

  it("persists browser-safe events in cursor order and reconnects after a cursor", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const first = await harness.service.appendEvent(
      running.jobId,
      running.jobVersion,
      {
        schemaVersion: "1",
        eventId: "public_event_1",
        jobId: running.jobId,
        cursor: 1,
        kind: "job.started",
        at: "2026-07-15T00:00:03.000Z",
      },
    );
    const second = await harness.service.appendEvent(
      first.jobId,
      first.jobVersion,
      {
        schemaVersion: "1",
        eventId: "public_event_2",
        jobId: running.jobId,
        cursor: 2,
        kind: "plan.summary",
        title: "Test the claimed evaluation boundary",
        steps: ["Read evidence", "Compose fixed operations"],
        at: "2026-07-15T00:00:04.000Z",
      },
    );

    expect(second.eventCursor).toBe(2);
    await expect(
      harness.service.appendEvent(second.jobId, second.jobVersion, {
        schemaVersion: "1",
        eventId: "public_event_4",
        jobId: second.jobId,
        cursor: 4,
        kind: "job.started",
        at: "2026-07-15T00:00:05.000Z",
      }),
    ).rejects.toThrow(/cursor/i);
    await expect(harness.service.listEvents(second.jobId, 1)).resolves.toEqual([
      expect.objectContaining({ cursor: 2, kind: "plan.summary" }),
    ]);
  });

  it("records a terminal callback once and rejects a conflicting replay", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_1",
      idempotencyKey: "job_live_1:verified:1",
      jobId: running.jobId,
      stateVersion: 4,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: 0,
      occurredAt: "2026-07-15T00:00:05.000Z",
    };

    const first = await harness.service.recordCallback(callback);
    expect(first).toMatchObject({
      duplicate: false,
      job: { status: "VERIFIED" },
    });
    const duplicate = await harness.service.recordCallback(callback);
    expect(duplicate).toMatchObject({
      duplicate: true,
      job: { status: "VERIFIED" },
    });

    await expect(
      harness.service.recordCallback({
        ...callback,
        outputHashes: [HASH_B],
      }),
    ).rejects.toBeInstanceOf(RunnerCallbackConflictError);
    await expect(
      harness.service.recordCallback({
        ...callback,
        operationalMetrics: {
          compilerDurationMs: 1,
          verifierDurationMs: 2,
          kernelDurationMs: 3,
          patchDurationMs: 0,
          repairAttempts: 0,
          planTokenUsage: {
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            reasoningOutputTokens: 0,
            totalTokens: 2,
          },
        },
      }),
    ).rejects.toBeInstanceOf(RunnerCallbackConflictError);
    await expect(
      harness.service.recordCallback({
        ...callback,
        finalEventCursor: callback.finalEventCursor + 1,
      }),
    ).rejects.toBeInstanceOf(RunnerCallbackConflictError);
    await expect(
      harness.service.recordCallback({
        ...callback,
        status: "REJECTED",
        error: {
          code: "MUTATED_DUPLICATE",
          message: "The duplicate callback changed status.",
          retryable: false,
        },
      }),
    ).rejects.toBeInstanceOf(RunnerCallbackConflictError);
    await expect(
      harness.service.transition(
        first.job.jobId,
        first.job.jobVersion,
        "RUNNING",
      ),
    ).rejects.toThrow(/terminal/i);
  });

  it("binds settlement to the claimed payload and commits its final authority event", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_bound_payload",
      idempotencyKey: "job_live_1:verified:bound-payload",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: 0,
      occurredAt: "2026-07-15T00:00:05.000Z",
    };
    const claimed = await harness.service.claimCallback(
      callback,
      "request_bound_payload",
    );
    if (claimed.duplicate) throw new Error("callback claim was duplicated");
    const completion = {
      claim: claimed.claim,
      claimedCallback: callback,
    };
    const error = {
      code: "CALLBACK_MUTATION_REJECTED",
      message: "The settled callback did not match its claim.",
      retryable: false,
    };

    for (const mutation of [
      { ...callback, callbackId: "callback_changed" },
      { ...callback, outputHashes: [HASH_B] },
      {
        ...callback,
        status: "FAILED" as const,
        error,
      },
      {
        ...callback,
        operationalMetrics: {
          compilerDurationMs: 1,
          verifierDurationMs: 2,
          kernelDurationMs: 3,
          patchDurationMs: 0,
          repairAttempts: 0,
          planTokenUsage: {
            inputTokens: 1,
            cachedInputTokens: 0,
            outputTokens: 1,
            reasoningOutputTokens: 0,
            totalTokens: 2,
          },
        },
      },
    ]) {
      await expect(
        harness.service.recordCallback(mutation, completion),
      ).rejects.toBeInstanceOf(RunnerCallbackStateError);
    }

    const resultReady: PublicCompilerEvent = {
      schemaVersion: "1",
      eventId: "authority_job_live_1_1",
      jobId: running.jobId,
      cursor: 1,
      kind: "result.ready",
      resultHash: HASH_C,
      at: "2026-07-15T00:00:06.000Z",
    };
    await expect(
      harness.service.recordCallback(
        { ...callback, finalEventCursor: 1 },
        { ...completion, terminalEvent: resultReady },
      ),
    ).resolves.toMatchObject({
      duplicate: false,
      job: { status: "VERIFIED", eventCursor: 1 },
    });
    await expect(harness.service.listEvents(running.jobId)).resolves.toEqual([
      resultReady,
    ]);
  });

  it("rejects a callback after cancellation without changing the terminal job", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const cancelled = await harness.service.transition(
      running.jobId,
      running.jobVersion,
      "CANCELLED",
      {
        error: {
          code: "RUNNER_JOB_CANCELLED",
          message: "The learner started over",
          retryable: false,
        },
      },
    );

    await expect(
      harness.service.recordCallback({
        schemaVersion: "1",
        callbackId: "callback_after_cancel",
        idempotencyKey: "job_live_1:verified:after-cancel",
        jobId: cancelled.jobId,
        stateVersion: cancelled.stateVersion,
        status: "VERIFIED",
        outputHashes: [HASH_C],
        finalEventCursor: cancelled.eventCursor,
        occurredAt: "2026-07-15T00:00:05.000Z",
      }),
    ).rejects.toBeInstanceOf(RunnerCallbackStateError);

    await expect(
      harness.service.getJob(cancelled.jobId),
    ).resolves.toMatchObject({
      status: "CANCELLED",
      outputHashes: [],
    });
  });

  it("makes callback claiming race atomically with cancellation and supports bounded release", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_claimed",
      idempotencyKey: "job_live_1:verified:claimed",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: running.eventCursor,
      occurredAt: "2026-07-15T00:00:05.000Z",
    };

    const claimed = await harness.service.claimCallback(
      callback,
      "request_callback_claimed",
    );
    expect(claimed).toMatchObject({
      duplicate: false,
      job: {
        status: "RUNNING",
        callbackClaim: { ownerId: "request_callback_claimed" },
      },
    });
    await expect(
      harness.service.appendEvent(claimed.job.jobId, claimed.job.jobVersion, {
        schemaVersion: "1",
        eventId: "event_after_callback_claim",
        jobId: claimed.job.jobId,
        cursor: 1,
        kind: "job.started",
        at: "2026-07-15T00:00:05.000Z",
      }),
    ).rejects.toThrow(/terminal mutation/u);
    if (claimed.duplicate)
      throw new Error("callback claim unexpectedly reused");
    await expect(
      harness.service.appendEvent(
        claimed.job.jobId,
        claimed.job.jobVersion,
        {
          schemaVersion: "1",
          eventId: "authority_event_with_wrong_claim",
          jobId: claimed.job.jobId,
          cursor: 1,
          kind: "verifier.verified",
          at: "2026-07-15T00:00:05.000Z",
          invariantCount: 1,
          mutationCount: 0,
        },
        { ...claimed.claim, ownerId: "request_wrong_callback" },
      ),
    ).rejects.toThrow(/terminal mutation/u);
    await expect(
      harness.service.appendEvent(
        claimed.job.jobId,
        claimed.job.jobVersion,
        {
          schemaVersion: "1",
          eventId: "authority_event_after_callback_claim",
          jobId: claimed.job.jobId,
          cursor: 1,
          kind: "verifier.verified",
          at: "2026-07-15T00:00:05.000Z",
          invariantCount: 1,
          mutationCount: 0,
        },
        claimed.claim,
      ),
    ).resolves.toMatchObject({
      eventCursor: 1,
      callbackClaim: { ownerId: "request_callback_claimed" },
    });
    await expect(harness.service.cancelJob(running.jobId)).rejects.toThrow(
      /callback claim/u,
    );
    await harness.service.releaseCallbackClaim(running.jobId, claimed.claim);
    const released = await harness.service.getJob(running.jobId);
    await expect(
      harness.service.appendEvent(
        released.jobId,
        released.jobVersion,
        {
          schemaVersion: "1",
          eventId: "authority_event_with_released_claim",
          jobId: released.jobId,
          cursor: released.eventCursor + 1,
          kind: "verifier.verified",
          at: "2026-07-15T00:00:06.000Z",
          invariantCount: 1,
          mutationCount: 0,
        },
        claimed.claim,
      ),
    ).rejects.toThrow(/terminal mutation/u);
    const cancelled = await harness.service.cancelJob(running.jobId);
    expect(cancelled).toMatchObject({ status: "CANCELLED" });
    expect(cancelled).not.toHaveProperty("callbackClaim");
  });

  it("keeps one callback processor exclusive through the settlement deadline", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob(jobInput());
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await jobs.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_stale_claim",
      idempotencyKey: "job_live_1:verified:stale-claim",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: running.eventCursor,
      occurredAt: "2026-07-15T00:00:05.000Z",
    };
    const claimed = await jobs.claimCallback(
      callback,
      "request_before_worker_crash",
    );
    if (claimed.duplicate) throw new Error("callback claim was duplicated");

    now = new Date("2026-07-15T00:01:01.000Z");
    await expect(
      jobs.claimCallback(callback, "request_before_job_deadline"),
    ).rejects.toThrow(/already being processed/u);

    now = new Date("2026-07-15T00:01:31.000Z");
    await expect(
      jobs.claimCallback(callback, "request_after_worker_crash"),
    ).rejects.toThrow(/already being processed/u);
    await expect(
      jobs.recordCallback(callback, {
        claim: claimed.claim,
        claimedCallback: callback,
      }),
    ).resolves.toMatchObject({
      job: {
        status: "VERIFIED",
        completedAt: "2026-07-15T00:01:31.000Z",
      },
    });
  });

  it("recovers an explicitly released callback after its authority event advanced the cursor", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob(jobInput());
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await jobs.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_crashed_after_event",
      idempotencyKey: "job_live_1:verified:crashed-after-event",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: running.eventCursor,
      occurredAt: "2026-07-15T00:00:05.000Z",
    };
    const firstClaim = await jobs.claimCallback(
      callback,
      "request_before_worker_crash",
    );
    if (firstClaim.duplicate)
      throw new Error("callback claim unexpectedly reused");
    await jobs.appendEvent(
      firstClaim.job.jobId,
      firstClaim.job.jobVersion,
      {
        schemaVersion: "1",
        eventId: "event_before_worker_crash",
        jobId: firstClaim.job.jobId,
        cursor: 1,
        kind: "verifier.verified",
        at: "2026-07-15T00:00:05.000Z",
        invariantCount: 1,
        mutationCount: 0,
      },
      firstClaim.claim,
    );
    await jobs.releaseCallbackClaim(callback.jobId, firstClaim.claim);

    now = new Date("2026-07-15T00:01:31.000Z");
    await expect(
      jobs.appendEvent(
        firstClaim.job.jobId,
        (await jobs.getJob(firstClaim.job.jobId)).jobVersion,
        {
          schemaVersion: "1",
          eventId: "event_with_released_claim",
          jobId: firstClaim.job.jobId,
          cursor: 2,
          kind: "verifier.verified",
          at: "2026-07-15T00:01:01.000Z",
          invariantCount: 1,
          mutationCount: 0,
        },
        firstClaim.claim,
      ),
    ).rejects.toThrow(/terminal mutation/u);
    await expect(
      jobs.claimCallback(callback, "request_after_worker_crash"),
    ).resolves.toMatchObject({
      duplicate: false,
      job: {
        eventCursor: 1,
        callbackClaim: { ownerId: "request_after_worker_crash" },
      },
    });
  });

  it("settles only a matching released callback inside the fixed post-deadline window", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob(jobInput());
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await jobs.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_near_deadline",
      idempotencyKey: "job_live_1:verified:near-deadline",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: running.eventCursor,
      occurredAt: "2026-07-15T00:01:29.000Z",
    };
    now = new Date("2026-07-15T00:01:29.000Z");
    const initialClaim = await jobs.claimCallback(
      callback,
      "request_before_deadline_release",
    );
    if (initialClaim.duplicate)
      throw new Error("callback claim was duplicated");
    await jobs.releaseCallbackClaim(callback.jobId, initialClaim.claim);

    now = new Date("2026-07-15T00:01:31.000Z");
    await expect(
      jobs.claimCallback(
        {
          ...callback,
          idempotencyKey: "job_live_1:verified:new-after-deadline",
        },
        "unrelated_callback_after_deadline",
      ),
    ).rejects.toThrow(/new runner callback.*after its deadline/iu);
    const recovered = await jobs.claimCallback(
      callback,
      "request_recovering_inside_settlement",
    );
    if (recovered.duplicate)
      throw new Error("callback recovery was duplicated");
    await expect(
      jobs.recordCallback(callback, {
        claim: recovered.claim,
        claimedCallback: callback,
      }),
    ).resolves.toMatchObject({
      duplicate: false,
      job: {
        status: "VERIFIED",
        completedAt: "2026-07-15T00:01:31.000Z",
      },
    });
  });

  it("times out callback progress that exceeds the fixed settlement deadline", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob(jobInput());
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await jobs.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_settlement_timeout",
      idempotencyKey: "job_live_1:verified:settlement-timeout",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: running.eventCursor,
      occurredAt: "2026-07-15T00:01:29.000Z",
    };
    now = new Date("2026-07-15T00:01:29.000Z");
    const claimed = await jobs.claimCallback(
      callback,
      "request_exceeding_settlement",
    );
    if (claimed.duplicate) throw new Error("callback claim was duplicated");

    now = new Date("2026-07-15T00:02:31.000Z");
    await expect(
      jobs.recordCallback(callback, {
        claim: claimed.claim,
        claimedCallback: callback,
      }),
    ).rejects.toThrow(/claim deadline/u);
    await expect(jobs.expireIfTimedOut(running.jobId)).resolves.toMatchObject({
      status: "TIMED_OUT",
    });
  });

  it("does not let a claim acquired near the job deadline extend that deadline", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob(jobInput());
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await jobs.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    now = new Date("2026-07-15T00:01:29.000Z");
    const output = await jobs.claimOutputWrite(
      running.jobId,
      running.jobVersion,
      "request_near_deadline",
      "experiment-ir.json",
    );
    now = new Date("2026-07-15T00:01:30.000Z");

    await expect(
      jobs.expireIfTimedOut(output.job.jobId),
    ).resolves.toMatchObject({ status: "TIMED_OUT" });
    await expect(
      jobs.claimCallback(
        {
          schemaVersion: "1",
          callbackId: "callback_after_deadline",
          idempotencyKey: "job_live_1:verified:after-deadline",
          jobId: running.jobId,
          stateVersion: running.stateVersion,
          status: "VERIFIED",
          outputHashes: [HASH_C],
          finalEventCursor: running.eventCursor,
          occurredAt: "2026-07-15T00:01:30.000Z",
        },
        "request_after_deadline",
      ),
    ).rejects.toThrow(/terminal job|deadline/u);
  });

  it("keeps an output write fenced until the job deadline", async () => {
    const repository = new MemoryRunnerJobRepository();
    let now = new Date("2026-07-15T00:00:00.000Z");
    const jobs = new RunnerJobService(repository, { now: () => now });
    const queued = await jobs.createJob(jobInput());
    const starting = await jobs.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await jobs.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const output = await jobs.claimOutputWrite(
      running.jobId,
      running.jobVersion,
      "request_long_output_write",
      "experiment-ir.json",
    );

    now = new Date("2026-07-15T00:01:01.000Z");
    await expect(
      jobs.assertOutputWriteClaim(output.job.jobId, output.claim),
    ).resolves.toBeUndefined();
    await expect(
      jobs.claimOutputWrite(
        output.job.jobId,
        output.job.jobVersion,
        "request_competing_output_write",
        "experiment-ir.json",
      ),
    ).rejects.toThrow(/active output-write claim/u);

    now = new Date("2026-07-15T00:01:30.000Z");
    await expect(
      jobs.assertOutputWriteClaim(output.job.jobId, output.claim),
    ).rejects.toThrow(/does not authorize/u);
    await expect(
      jobs.expireIfTimedOut(output.job.jobId),
    ).resolves.toMatchObject({ status: "TIMED_OUT" });
  });

  it("requires an atomic terminal event to match the failed job error", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const error = {
      code: "RUNNER_DISPATCH_FAILED",
      message: "The bounded runner did not accept the job.",
      retryable: true,
    };

    await expect(
      harness.service.failJobWithEvent(
        queued.jobId,
        queued.jobVersion,
        { runnerIdentity: "control-plane", error },
        {
          schemaVersion: "1",
          eventId: "contradictory_terminal_event",
          jobId: queued.jobId,
          cursor: 1,
          kind: "result.ready",
          at: "2026-07-15T00:00:01.000Z",
          resultHash: HASH_C,
        },
      ),
    ).rejects.toThrow(/must match the terminal error/u);

    await expect(
      harness.service.failJobWithEvent(
        queued.jobId,
        queued.jobVersion,
        { runnerIdentity: "control-plane", error },
        {
          schemaVersion: "1",
          eventId: "mismatched_failure_event",
          jobId: queued.jobId,
          cursor: 1,
          kind: "job.failed",
          at: "2026-07-15T00:00:01.000Z",
          code: error.code,
          message: "A different failure.",
        },
      ),
    ).rejects.toThrow(/must match the terminal error/u);
  });

  it("fences output writes against callbacks, events, and cancellation", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const output = await harness.service.claimOutputWrite(
      running.jobId,
      running.jobVersion,
      "request_output_write",
      "experiment-ir.json",
    );
    const callback: RunnerCallback = {
      schemaVersion: "1",
      callbackId: "callback_during_output",
      idempotencyKey: "job_live_1:verified:during-output",
      jobId: running.jobId,
      stateVersion: running.stateVersion,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: running.eventCursor,
      occurredAt: "2026-07-15T00:00:05.000Z",
    };

    await expect(
      harness.service.claimCallback(callback, "request_callback"),
    ).rejects.toThrow(/output write/u);
    await expect(
      harness.service.appendEvent(output.job.jobId, output.job.jobVersion, {
        schemaVersion: "1",
        eventId: "event_during_output",
        jobId: output.job.jobId,
        cursor: 1,
        kind: "job.started",
        at: "2026-07-15T00:00:05.000Z",
      }),
    ).rejects.toThrow(/terminal mutation/u);
    await expect(harness.service.cancelJob(running.jobId)).rejects.toThrow(
      /output-write claim/u,
    );

    await harness.service.releaseOutputWriteClaim(running.jobId, output.claim);
    await expect(
      harness.service.claimCallback(callback, "request_callback"),
    ).resolves.toMatchObject({ duplicate: false });
  });

  it("rejects public event appends after a job is terminal", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const cancelled = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "CANCELLED",
      { runnerIdentity: "counterlab-control-plane-cancel" },
    );

    await expect(
      harness.service.appendEvent(cancelled.jobId, cancelled.jobVersion, {
        schemaVersion: "1",
        eventId: "public_event_after_cancel",
        jobId: cancelled.jobId,
        cursor: 1,
        kind: "job.started",
        at: "2026-07-15T00:00:05.000Z",
      }),
    ).rejects.toThrow(/terminal status CANCELLED/u);
  });

  it("can terminalize a job after the control plane closes runner writes", async () => {
    const harness = service();
    const queued = await harness.service.createJob(jobInput());
    const starting = await harness.service.transition(
      queued.jobId,
      queued.jobVersion,
      "STARTING",
      { runnerIdentity: "runner-container-test" },
    );
    const running = await harness.service.transition(
      starting.jobId,
      starting.jobVersion,
      "RUNNING",
    );
    const awaiting = await harness.service.transition(
      running.jobId,
      running.jobVersion,
      "AWAITING_APPROVAL",
    );

    const completed = await harness.service.recordCallback({
      schemaVersion: "1",
      callbackId: "callback_after_boundary_close",
      idempotencyKey: "job_live_1:verified:boundary-close",
      jobId: awaiting.jobId,
      stateVersion: 4,
      status: "VERIFIED",
      outputHashes: [HASH_C],
      finalEventCursor: 0,
      occurredAt: "2026-07-15T00:00:05.000Z",
    });

    expect(completed).toMatchObject({
      duplicate: false,
      job: { status: "VERIFIED" },
    });
  });
});
