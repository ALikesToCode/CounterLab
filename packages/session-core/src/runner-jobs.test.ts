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
  ): Promise<void> {
    await this.save(job, expectedVersion);
    this.callbacks.set(callback.idempotencyKey, structuredClone(callback));
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
      harness.service.transition(
        first.job.jobId,
        first.job.jobVersion,
        "RUNNING",
      ),
    ).rejects.toThrow(/terminal/i);
  });
});
