import { describe, expect, it } from "vitest";

import type {
  PublicCompilerEvent,
  RunnerCallback,
  RunnerJob,
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

  async find(jobId: string): Promise<RunnerJob | undefined> {
    const job = this.jobs.get(jobId);
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
