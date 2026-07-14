// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  type ArtifactManifest,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJob,
} from "@counterlab/contracts";
import type {
  CounterLabSession,
  EvidenceEvent,
  RunnerJobRepository,
  SessionMode,
  SessionRepository,
} from "@counterlab/session-core";
import { createEvidenceEvent, hashCanonical } from "@counterlab/session-core";

import { api, createApi } from "./api";
import type { ArtifactStore, StoredArtifact } from "./artifact-store";
import { ConcurrentD1SessionUpdateError } from "./d1-session-repository";
import type {
  RunnerDispatchRequest,
  RunnerDispatcher,
  RunnerObjectStore,
} from "./runner-control-plane";

class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, CounterLabSession>();
  private readonly eventLog = new Map<string, EvidenceEvent[]>();

  async create(
    session: CounterLabSession,
    firstEvent: EvidenceEvent,
  ): Promise<void> {
    this.sessions.set(session.id, structuredClone(session));
    this.eventLog.set(session.id, [structuredClone(firstEvent)]);
  }

  async find(sessionId: string): Promise<CounterLabSession | undefined> {
    const session = this.sessions.get(sessionId);
    return session === undefined ? undefined : structuredClone(session);
  }

  async save(
    session: CounterLabSession,
    expectedVersion: number,
    event: EvidenceEvent,
  ): Promise<void> {
    const current = this.sessions.get(session.id);
    if (current === undefined || current.version !== expectedVersion) {
      throw new Error("stale test session write");
    }
    this.sessions.set(session.id, structuredClone(session));
    const events = this.eventLog.get(session.id) ?? [];
    events.push(structuredClone(event));
    this.eventLog.set(session.id, events);
  }

  async listEvents(sessionId: string): Promise<EvidenceEvent[]> {
    return structuredClone(this.eventLog.get(sessionId) ?? []);
  }

  async lastEvent(sessionId: string): Promise<EvidenceEvent | undefined> {
    return structuredClone(this.eventLog.get(sessionId)?.at(-1));
  }

  close(): void {}
}

class MemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, StoredArtifact>();

  async save(
    manifest: ArtifactManifest,
    objectKey?: string,
  ): Promise<StoredArtifact> {
    const stored = {
      manifest: structuredClone(manifest),
      ...(objectKey === undefined ? {} : { objectKey }),
    };
    this.artifacts.set(manifest.artifactId, stored);
    return structuredClone(stored);
  }

  async find(artifactId: string): Promise<StoredArtifact | undefined> {
    const artifact = this.artifacts.get(artifactId);
    return artifact === undefined ? undefined : structuredClone(artifact);
  }
}

class ConflictSessionRepository extends MemorySessionRepository {
  private conflict = false;

  enableConflict(): void {
    this.conflict = true;
  }

  override async save(
    session: CounterLabSession,
    expectedVersion: number,
    event: EvidenceEvent,
  ): Promise<void> {
    if (this.conflict) {
      throw new ConcurrentD1SessionUpdateError(session.id);
    }
    await super.save(session, expectedVersion, event);
  }
}

class MemoryRunnerJobRepository implements RunnerJobRepository {
  private readonly jobs = new Map<string, RunnerJob>();
  private readonly events = new Map<string, PublicCompilerEvent[]>();
  private readonly callbacks = new Map<string, RunnerCallback>();

  async create(job: RunnerJob): Promise<void> {
    this.jobs.set(job.jobId, structuredClone(job));
  }

  async find(jobId: string): Promise<RunnerJob | undefined> {
    const job = this.jobs.get(jobId);
    return job === undefined ? undefined : structuredClone(job);
  }

  async save(job: RunnerJob, expectedVersion: number): Promise<void> {
    const current = this.jobs.get(job.jobId);
    if (current?.jobVersion !== expectedVersion) throw new Error("stale job");
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

class MemoryRunnerObjectStore implements RunnerObjectStore {
  readonly objects = new Map<string, { body: string; contentType: string }>();

  put(key: string, body: string, contentType: string): Promise<void> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve();
  }

  get(key: string): Promise<{ body: string; contentType: string } | undefined> {
    return Promise.resolve(structuredClone(this.objects.get(key)));
  }
}

class CapturingRunnerDispatcher implements RunnerDispatcher {
  readonly identity = "test-runner-v1";
  readonly dispatched: RunnerDispatchRequest[] = [];

  dispatch(request: RunnerDispatchRequest): Promise<void> {
    this.dispatched.push(structuredClone(request));
    return Promise.resolve();
  }
}

async function sessionHarness(
  mode: "sample" | "live",
  sessionRepository: MemorySessionRepository = new MemorySessionRepository(),
) {
  const artifactStore = new MemoryArtifactStore();
  let idSequence = 0;
  const app = createApi({
    sessionRepository,
    artifactStore,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix) => `${prefix}_${++idSequence}`,
  });
  const artifactResponse = await app.request("/api/artifacts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sample: true }),
  });
  const artifactBody = (await artifactResponse.json()) as {
    data: ArtifactManifest;
  };
  const sessionResponse =
    mode === "sample"
      ? await postJson(app, "/api/sample/sessions", {
          sampleId: "leakage-01",
        })
      : await (async () => {
          const uploaded = await saveUploadedArtifact(
            artifactStore,
            artifactBody.data.artifactId,
          );
          return postJson(app, "/api/live/sessions", {
            artifactId: uploaded.artifactId,
          });
        })();
  const sessionBody = (await sessionResponse.json()) as {
    data: { sessionId: string };
  };
  return {
    app,
    artifactStore,
    sessionRepository,
    artifactId: artifactBody.data.artifactId,
    sessionId: sessionBody.data.sessionId,
  };
}

async function saveUploadedArtifact(
  artifactStore: MemoryArtifactStore,
  sampleArtifactId: string,
): Promise<ArtifactManifest> {
  const sample = await artifactStore.find(sampleArtifactId);
  if (sample === undefined) throw new Error("sample artifact is missing");
  const uploaded = {
    ...sample.manifest,
    artifactId: "artifact_uploaded_not_sample",
    fileName: "uploaded_customer_model.ipynb",
    fileSha256: "a".repeat(64),
  } satisfies ArtifactManifest;
  await artifactStore.save(uploaded, "uploads/not-public.ipynb");
  return uploaded;
}

async function seedSession(
  repository: MemorySessionRepository,
  input: {
    id: string;
    artifactId: string;
    mode: SessionMode;
    state: CounterLabSession["state"];
    version: number;
    patch?: Partial<CounterLabSession>;
  },
): Promise<void> {
  const timestamp = "2026-07-14T10:00:00.000Z";
  const session: CounterLabSession = {
    ...input.patch,
    id: input.id,
    artifactId: input.artifactId,
    mode: input.mode,
    state: input.state,
    version: input.version,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  const firstEvent = await createEvidenceEvent({
    sessionId: session.id,
    sequence: 1,
    timestamp,
    eventId: `event_${session.id}`,
    draft: {
      actor: "system",
      kind: "session.seeded_for_authority_regression",
      payload: { state: session.state, artifactId: session.artifactId },
    },
  });
  await repository.create(session, firstEvent);
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function preparedHostedRunner(sessionId: string) {
  const harness = await sessionHarness("sample");
  const sampleRoute = `/api/sessions/${harness.sessionId}`;
  await postJson(harness.app, `${sampleRoute}/belief-test`, {
    learnerClaim:
      "The high row-split score proves this model generalizes to new accounts.",
  });
  await postJson(harness.app, `${sampleRoute}/belief-test/confirm`, {
    action: "confirm",
  });
  await postJson(harness.app, `${sampleRoute}/prediction`, {
    choice: "The score will remain high for unseen accounts.",
    confidence: 77,
  });
  const lesson = await harness.sessionRepository.find(harness.sessionId);
  if (lesson?.beliefTest === undefined || lesson.prediction === undefined) {
    throw new Error("sample lesson did not create the required contracts");
  }
  const uploaded = await saveUploadedArtifact(
    harness.artifactStore,
    harness.artifactId,
  );
  const { immutableHash: _oldHash, ...predictionBase } = lesson.prediction;
  const livePredictionBase = {
    ...predictionBase,
    id: `prediction_${sessionId}`,
    sessionId,
    beliefTestId: lesson.beliefTest.id,
    committedAt: "2026-07-14T10:00:00.000Z",
  };
  const prediction = {
    ...livePredictionBase,
    immutableHash: await hashCanonical(livePredictionBase),
  };
  await seedSession(harness.sessionRepository, {
    id: sessionId,
    artifactId: uploaded.artifactId,
    mode: { kind: "live_notebook" },
    state: "PREDICTION_COMMITTED",
    version: 4,
    patch: { beliefTest: lesson.beliefTest, prediction },
  });
  const runnerJobs = new MemoryRunnerJobRepository();
  const runnerObjects = new MemoryRunnerObjectStore();
  const dispatcher = new CapturingRunnerDispatcher();
  const app = createApi({
    sessionRepository: harness.sessionRepository,
    artifactStore: harness.artifactStore,
    runnerJobRepository: runnerJobs,
    runnerObjectStore: runnerObjects,
    runnerDispatcher: dispatcher,
    runnerSigningKey: "runner-test-signing-key-that-is-long-enough",
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix) => `${prefix}_${sessionId}`,
  });
  const queued = await postJson(app, `/api/sessions/${sessionId}/lab/compile`);
  const dispatch = dispatcher.dispatched[0];
  if (dispatch === undefined) throw new Error("runner was not dispatched");
  return {
    ...harness,
    app,
    dispatch,
    lesson,
    queued,
    runnerJobs,
    runnerObjects,
    uploaded,
  };
}

async function postJson(
  app: ReturnType<typeof createApi>,
  path: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("Cloudflare Worker API", () => {
  it("creates sample, live, and replay sessions only through mode-specific routes", async () => {
    const harness = await sessionHarness("sample");
    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );

    const sample = await postJson(harness.app, "/api/sample/sessions", {
      sampleId: "leakage-01",
    });
    expect(sample.status).toBe(201);
    await expect(sample.json()).resolves.toMatchObject({
      ok: true,
      data: {
        artifactId: harness.artifactId,
        mode: { kind: "sample_lesson", sampleId: "leakage-01" },
      },
    });

    const live = await postJson(harness.app, "/api/live/sessions", {
      artifactId: uploaded.artifactId,
    });
    expect(live.status).toBe(201);
    await expect(live.json()).resolves.toMatchObject({
      ok: true,
      data: {
        artifactId: uploaded.artifactId,
        mode: { kind: "live_notebook" },
      },
    });

    const replay = await postJson(harness.app, "/api/replay/sessions", {
      replayId: "leakage-01",
    });
    expect(replay.status).toBe(201);
    await expect(replay.json()).resolves.toMatchObject({
      ok: true,
      data: {
        artifactId: harness.artifactId,
        mode: { kind: "verified_replay", replayId: "leakage-01" },
      },
    });
  });

  it("rejects cross-mode fields and retires generic mode selection", async () => {
    const harness = await sessionHarness("sample");

    const crossed = await postJson(harness.app, "/api/live/sessions", {
      artifactId: harness.artifactId,
      sampleId: "leakage-01",
    });
    expect(crossed.status).toBe(400);

    const generic = await postJson(harness.app, "/api/sessions", {
      artifactId: harness.artifactId,
      mode: "instant",
    });
    expect(generic.status).toBe(404);
  });

  it("rejects a non-sample artifact at the sample-lesson session boundary", async () => {
    const harness = await sessionHarness("sample");
    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );

    const response = await postJson(harness.app, "/api/sample/sessions", {
      sampleId: "leakage-01",
      artifactId: uploaded.artifactId,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("does not grant sample authority to a separately uploaded copy with the same hash", async () => {
    const harness = await sessionHarness("sample");
    const sample = await harness.artifactStore.find(harness.artifactId);
    if (sample === undefined) throw new Error("sample artifact is missing");
    const copiedManifest = {
      ...sample.manifest,
      artifactId: "artifact_uploaded_copy",
      fileName: "copied_sample.ipynb",
    } satisfies ArtifactManifest;
    await harness.artifactStore.save(copiedManifest, "uploads/copied.ipynb");

    const response = await postJson(harness.app, "/api/sample/sessions", {
      sampleId: "leakage-01",
      artifactId: copiedManifest.artifactId,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
  });

  it("never attaches the bundled sample result to a non-sample artifact", async () => {
    const harness = await sessionHarness("sample");
    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );
    const sessionId = "session_uploaded_result_guard";
    await seedSession(harness.sessionRepository, {
      id: sessionId,
      artifactId: uploaded.artifactId,
      mode: { kind: "live_notebook" },
      state: "LAB_VERIFIED",
      version: 6,
    });

    const response = await postJson(
      harness.app,
      `/api/sessions/${sessionId}/lab/run`,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ARTIFACT_RESULT_MISMATCH" },
    });
    const stored = await harness.sessionRepository.find(sessionId);
    expect(stored?.state).toBe("LAB_VERIFIED");
    expect(stored).not.toHaveProperty("verifiedResult");
  });

  it("never persists the bundled sample patch for a non-sample artifact", async () => {
    const harness = await sessionHarness("sample");
    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );
    const sessionId = "session_uploaded_patch_guard";
    await seedSession(harness.sessionRepository, {
      id: sessionId,
      artifactId: uploaded.artifactId,
      mode: { kind: "live_notebook" },
      state: "TRANSFER_PASSED",
      version: 10,
    });

    const response = await postJson(
      harness.app,
      `/api/sessions/${sessionId}/patch/compile`,
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ARTIFACT_PATCH_MISMATCH" },
    });
    const stored = await harness.sessionRepository.find(sessionId);
    expect(stored?.state).toBe("TRANSFER_PASSED");
    expect(stored).not.toHaveProperty("patchResult");
  });

  it("never scores the bundled sample transfer for a live artifact", async () => {
    const harness = await sessionHarness("sample");
    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );
    const sessionId = "session_uploaded_transfer_guard";
    await seedSession(harness.sessionRepository, {
      id: sessionId,
      artifactId: uploaded.artifactId,
      mode: { kind: "live_notebook" },
      state: "REVISION_RECORDED",
      version: 8,
    });

    const response = await postJson(
      harness.app,
      `/api/sessions/${sessionId}/transfer`,
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: ["center_true_uses_later_targets"],
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ARTIFACT_TRANSFER_MISMATCH" },
    });
    const stored = await harness.sessionRepository.find(sessionId);
    expect(stored?.state).toBe("REVISION_RECORDED");
    expect(stored).not.toHaveProperty("transferResult");
  });

  it("compiles and independently verifies an artifact-specific hosted plan through an authenticated runner job", async () => {
    const harness = await sessionHarness("sample");
    const sampleRoute = `/api/sessions/${harness.sessionId}`;
    await postJson(harness.app, `${sampleRoute}/belief-test`, {
      learnerClaim:
        "The high row-split score proves this model generalizes to new accounts.",
    });
    await postJson(harness.app, `${sampleRoute}/belief-test/confirm`, {
      action: "confirm",
    });
    await postJson(harness.app, `${sampleRoute}/prediction`, {
      choice: "The score will remain high for unseen accounts.",
      confidence: 77,
    });
    const lesson = await harness.sessionRepository.find(harness.sessionId);
    if (lesson?.beliefTest === undefined || lesson.prediction === undefined) {
      throw new Error("sample lesson did not create the required contracts");
    }

    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );
    const sessionId = "session_hosted_plan";
    const predictionBase = {
      ...lesson.prediction,
      id: "prediction_hosted_plan",
      sessionId,
      beliefTestId: lesson.beliefTest.id,
      committedAt: "2026-07-14T10:00:00.000Z",
    };
    delete (predictionBase as Partial<typeof predictionBase>).immutableHash;
    const prediction = {
      ...predictionBase,
      immutableHash: await hashCanonical(predictionBase),
    };
    await seedSession(harness.sessionRepository, {
      id: sessionId,
      artifactId: uploaded.artifactId,
      mode: { kind: "live_notebook" },
      state: "PREDICTION_COMMITTED",
      version: 4,
      patch: { beliefTest: lesson.beliefTest, prediction },
    });

    const runnerJobs = new MemoryRunnerJobRepository();
    const runnerObjects = new MemoryRunnerObjectStore();
    const dispatcher = new CapturingRunnerDispatcher();
    const app = createApi({
      sessionRepository: harness.sessionRepository,
      artifactStore: harness.artifactStore,
      runnerJobRepository: runnerJobs,
      runnerObjectStore: runnerObjects,
      runnerDispatcher: dispatcher,
      runnerSigningKey: "runner-test-signing-key-that-is-long-enough",
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_hosted_plan`,
    });

    const queued = await postJson(
      app,
      `/api/sessions/${sessionId}/lab/compile`,
    );
    expect(queued.status).toBe(202);
    const queuedBody = (await queued.json()) as {
      data: { state: string; runnerJob: RunnerJob };
    };
    expect(queuedBody.data).toMatchObject({
      state: "LAB_COMPILING",
      runnerJob: {
        kind: "LAB_COMPILE",
        status: "STARTING",
        artifactId: uploaded.artifactId,
        conceptPack: { id: "entity_leakage", version: "2.0.0" },
      },
    });
    expect(dispatcher.dispatched).toHaveLength(1);
    const dispatch = dispatcher.dispatched[0];
    if (dispatch === undefined) throw new Error("runner was not dispatched");
    expect(dispatch.job.jobId).toBe(queuedBody.data.runnerJob.jobId);
    const inputObject = runnerObjects.objects.get(
      `runner-input/${dispatch.job.jobId}.json`,
    );
    expect(inputObject?.contentType).toBe("application/json");
    expect(inputObject?.body).toContain(uploaded.artifactId);
    expect(inputObject?.body).not.toContain("nbformat_minor");
    expect(inputObject?.body).not.toContain("OPENAI_API_KEY");
    expect(inputObject?.body).not.toContain("uploads/not-public.ipynb");

    const authorization = { authorization: `Bearer ${dispatch.token}` };
    const started = await app.request(
      `/api/runner/jobs/${dispatch.job.jobId}/start`,
      { method: "POST", headers: authorization },
    );
    expect(started.status).toBe(200);

    const firstEvent: PublicCompilerEvent = {
      schemaVersion: "1",
      eventId: "compiler_event_1",
      jobId: dispatch.job.jobId,
      cursor: 1,
      at: "2026-07-14T10:00:00.000Z",
      kind: "job.started",
    };
    expect(
      (
        await postJson(
          app,
          `/api/runner/jobs/${dispatch.job.jobId}/events`,
          firstEvent,
          authorization,
        )
      ).status,
    ).toBe(201);

    const manifestHash = await hashCanonical(uploaded);
    const plan = {
      schemaVersion: "2" as const,
      planId: "plan_hosted_1",
      sessionId,
      concept: "entity_leakage" as const,
      conceptPackVersion: "2.0.0",
      artifactManifestHash: manifestHash,
      beliefTestId: lesson.beliefTest.id,
      evidenceRefs: lesson.beliefTest.evidenceRefs,
      baseline: {
        concept: "entity_leakage" as const,
        runId: "random_rows",
        operation: "leakage.random_row_split" as const,
        seed: 42,
        testFraction: 0.25,
        entityField: uploaded.schemaSummary.entityCandidates[0],
        dropIdentity: false,
        model: "logistic_regression" as const,
      },
      interventions: [
        {
          concept: "entity_leakage" as const,
          runId: "unseen_entities",
          operation: "leakage.group_holdout" as const,
          seed: 42,
          testFraction: 0.25,
          entityField: uploaded.schemaSummary.entityCandidates[0],
          dropIdentity: false,
          model: "logistic_regression" as const,
        },
        {
          concept: "entity_leakage" as const,
          runId: "without_identity",
          operation: "leakage.identity_ablation" as const,
          seed: 42,
          testFraction: 0.25,
          entityField: uploaded.schemaSummary.entityCandidates[0],
          dropIdentity: true,
          model: "logistic_regression" as const,
        },
      ],
      controlledVariables: ["model", "seed", "test_fraction"],
      changedVariables: ["split_strategy", "identity_feature"],
      metrics: ["accuracy", "roc_auc", "entity_overlap_rate"] as const,
      visualizations: ["metric_comparison", "entity_overlap"] as const,
      discriminatesBecause:
        "Holding out complete entities separates memorization from transferable signal.",
      expectedPatterns: [
        {
          hypothesisId: "current" as const,
          qualitativeOutcome:
            "Performance remains similarly strong when complete entities are held out.",
        },
        {
          hypothesisId: "competing" as const,
          qualitativeOutcome:
            "Performance falls and overlap reaches zero under entity holdout.",
        },
      ],
      nonClaims: ["This does not prove performance for every future account."],
      resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 3 },
    };
    const planText = JSON.stringify(plan);
    const planHash = await sha256Text(planText);
    const uploadedPlan = await app.request(
      `/api/runner/jobs/${dispatch.job.jobId}/outputs/experiment-plan.json`,
      {
        method: "PUT",
        headers: { ...authorization, "content-type": "application/json" },
        body: planText,
      },
    );
    expect(uploadedPlan.status).toBe(201);
    expect(
      (
        await postJson(
          app,
          `/api/runner/jobs/${dispatch.job.jobId}/events`,
          {
            schemaVersion: "1",
            eventId: "compiler_event_2",
            jobId: dispatch.job.jobId,
            cursor: 2,
            at: "2026-07-14T10:00:00.000Z",
            kind: "file.created",
            path: "experiment-plan.json",
            sha256: planHash,
          },
          authorization,
        )
      ).status,
    ).toBe(201);

    const candidate = await postJson(
      app,
      `/api/runner/jobs/${dispatch.job.jobId}/candidate`,
      { attempt: 1, planSha256: planHash },
      authorization,
    );
    expect(candidate.status).toBe(200);
    await expect(candidate.json()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "VERIFIED",
        canRepair: false,
        nextCursor: 3,
        verification: { status: "VERIFIED" },
      },
    });

    const reconnected = await app.request(
      `/api/sessions/${sessionId}/jobs/${dispatch.job.jobId}/events?after=1`,
    );
    expect(reconnected.status).toBe(200);
    await expect(reconnected.json()).resolves.toMatchObject({
      data: {
        events: [
          { cursor: 2, kind: "file.created" },
          { cursor: 3, kind: "verifier.verified" },
        ],
        nextCursor: 3,
      },
    });

    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_hosted_1",
      idempotencyKey: "hosted-plan-complete-1",
      jobId: dispatch.job.jobId,
      stateVersion: dispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [planHash],
      finalEventCursor: 3,
      occurredAt: "2026-07-14T10:00:01.000Z",
    };
    const callback = await postJson(
      app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      callbackBody,
      authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        duplicate: false,
        runnerJob: { status: "VERIFIED", outputHashes: [planHash] },
        session: { state: "LAB_VERIFIED", artifactId: uploaded.artifactId },
        verification: { status: "VERIFIED" },
      },
    });
    const stored = await harness.sessionRepository.find(sessionId);
    expect(stored).toMatchObject({
      state: "LAB_VERIFIED",
      artifactId: uploaded.artifactId,
      labVerification: { status: "VERIFIED" },
    });
    expect(stored).not.toHaveProperty("verifiedResult");

    const eventCount = (await harness.sessionRepository.listEvents(sessionId))
      .length;
    const duplicate = await postJson(
      app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      callbackBody,
      authorization,
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: { duplicate: true, session: { state: "LAB_VERIFIED" } },
    });
    expect(await harness.sessionRepository.listEvents(sessionId)).toHaveLength(
      eventCount,
    );
  });

  it("rejects a runner-claimed success when the independent hosted Plan verifier fails", async () => {
    const sessionId = "session_rejected_hosted_plan";
    const harness = await preparedHostedRunner(sessionId);
    expect(harness.queued.status).toBe(202);
    const jobId = harness.dispatch.job.jobId;
    const authorization = {
      authorization: `Bearer ${harness.dispatch.token}`,
    };
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: authorization,
        })
      ).status,
    ).toBe(200);

    const invalidPlanText = JSON.stringify({
      schemaVersion: "2",
      planId: "plan_with_literal_result",
      literalResult: 0.99,
    });
    const invalidPlanHash = await sha256Text(invalidPlanText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/experiment-plan.json`,
          {
            method: "PUT",
            headers: { ...authorization, "content-type": "application/json" },
            body: invalidPlanText,
          },
        )
      ).status,
    ).toBe(201);

    const candidate = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/candidate`,
      { attempt: 1, planSha256: invalidPlanHash },
      authorization,
    );
    expect(candidate.status).toBe(200);
    await expect(candidate.json()).resolves.toMatchObject({
      ok: true,
      data: {
        status: "REJECTED",
        canRepair: true,
        nextCursor: 1,
        counterexamples: [
          { invariant: "structural_schema", expected: "Experiment Plan v2" },
        ],
        runnerJob: { status: "REPAIRING", attempt: 2 },
      },
    });

    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_rejected_hosted_plan",
        idempotencyKey: "rejected-hosted-plan-1",
        jobId,
        stateVersion: harness.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [invalidPlanHash],
        finalEventCursor: 1,
        occurredAt: "2026-07-14T10:00:01.000Z",
      },
      authorization,
    );

    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runnerJob: {
          status: "REJECTED",
          error: { code: "PLAN_VERIFIER_REJECTED" },
        },
        session: { state: "LAB_REJECTED" },
        verification: {
          status: "REJECTED",
          invariants: [{ name: "structural_schema", passed: false }],
        },
      },
    });
    const stored = await harness.sessionRepository.find(sessionId);
    expect(stored?.state).toBe("LAB_REJECTED");
    expect(stored).not.toHaveProperty("verifiedResult");
  });

  it("keeps verified replay sessions read-only", async () => {
    const harness = await sessionHarness("sample");
    const created = await postJson(harness.app, "/api/replay/sessions", {
      replayId: "leakage-01",
    });
    const body = (await created.json()) as { data: { sessionId: string } };

    const response = await postJson(
      harness.app,
      `/api/sessions/${body.data.sessionId}/belief-test`,
      {
        learnerClaim:
          "The notebook accuracy proves generalization to new customers.",
      },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "REPLAY_READ_ONLY" },
    });
    const stored = await harness.sessionRepository.find(body.data.sessionId);
    expect(stored?.state).toBe("INGESTED");
    expect(
      await harness.sessionRepository.listEvents(body.data.sessionId),
    ).toHaveLength(1);
  });

  it("reports honest edge and local-runner capabilities", async () => {
    const response = await api.request("/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        platform: "cloudflare-workers",
        sample: "available",
        replay: "available",
        liveCodex: "local-runner-required",
        liveKernel: "local-runner-required",
      },
    });
  });

  it("reports a present live credential as configured rather than available", async () => {
    const response = await api.request("/api/health", undefined, {
      OPENAI_API_KEY: "configured-but-unvalidated",
    } as unknown as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        liveGpt: "configured",
        liveCodex: "local-runner-required",
      },
    });
  });

  it("reports live analysis without exposing endpoint configuration", async () => {
    const response = await api.request("/api/health", undefined, {
      OPENAI_API_KEY: "server-only-key",
      OPENAI_BASE_URL: "https://responses.example.test/v1",
      OPENAI_MODEL: "configured-model",
    } as unknown as Env & Record<string, string>);

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { liveGpt: "configured" },
    });
    expect(JSON.stringify(body)).not.toContain("responses.example.test");
    expect(JSON.stringify(body)).not.toContain("configured-model");
  });

  it("retrieves stored artifact evidence without returning notebook bytes", async () => {
    const harness = await sessionHarness("sample");
    const response = await harness.app.request(
      `/api/artifacts/${harness.artifactId}`,
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: ArtifactManifest };
    expect(body.data.artifactId).toBe(harness.artifactId);
    expect(body.data.support.status).toBe("SUPPORTED");
    expect(JSON.stringify(body)).not.toContain("nbformat_minor");
  });

  it("returns the real verified replay payload", async () => {
    const response = await api.request("/api/replays/leakage-01");

    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: {
        replayId: string;
        modelId: string;
        compilerTrace: { trace: Array<{ status: string }> };
        result: { resultHash: string; runs: unknown[] };
      };
    };
    expect(body.data.replayId).toBe("leakage-01");
    expect(body.data.result.resultHash).toBe(
      "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0",
    );
    expect(body.data.result.runs).toHaveLength(3);
    expect(body.data.modelId).toBe("gpt-5.6-sol");
    expect(
      body.data.compilerTrace.trace.some(
        (event) => event.status === "REJECTED",
      ),
    ).toBe(true);
    expect(body.data.compilerTrace.trace.at(-1)?.status).toBe("VERIFIED");
  });

  it("returns a typed error for an unknown replay", async () => {
    const response = await api.request("/api/replays/missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "REPLAY_NOT_FOUND",
        message: "Replay missing was not found",
        status: 404,
      },
    });
  });

  it("stores approved-sample provenance for an instant Belief Test", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");

    const response = await app.request(
      `/api/sessions/${sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          learnerClaim:
            "The notebook accuracy proves generalization to new customers.",
        }),
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        sessionId,
        mode: { kind: "sample_lesson", sampleId: "leakage-01" },
        state: "BELIEF_TEST_PROPOSED",
      },
    });
    const events = await sessionRepository.listEvents(sessionId);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      actor: "system",
      kind: "belief_test.proposed",
      modelId: "leakage-customer-churn-belief-v1",
    });
    expect(events[1]).not.toHaveProperty("promptHash");
  });

  it("returns LIVE_UNAVAILABLE without advancing a live session when the key is missing", async () => {
    const { app, sessionId, sessionRepository } = await sessionHarness("live");

    const response = await app.request(
      `/api/sessions/${sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          learnerClaim:
            "The notebook accuracy proves generalization to new customers.",
        }),
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "LIVE_UNAVAILABLE",
        message: "OPENAI_API_KEY is not configured",
        status: 503,
      },
    });
    await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
      state: "INGESTED",
      version: 1,
    });
    expect(await sessionRepository.listEvents(sessionId)).toHaveLength(1);
  });

  it("returns an honest insufficient-evidence Belief Test before any live model call", async () => {
    const harness = await sessionHarness("sample");
    const sample = await harness.artifactStore.find(harness.artifactId);
    if (sample === undefined) throw new Error("sample artifact is missing");
    const sparseManifest = {
      ...sample.manifest,
      artifactId: "artifact_sparse_live",
      fileName: "sparse.ipynb",
      fileSha256: "e".repeat(64),
      cells: [],
    } satisfies ArtifactManifest;
    await harness.artifactStore.save(
      sparseManifest,
      "uploads/artifact_sparse_live.ipynb",
    );
    const created = await postJson(harness.app, "/api/live/sessions", {
      artifactId: sparseManifest.artifactId,
    });
    const body = (await created.json()) as { data: { sessionId: string } };

    const response = await postJson(
      harness.app,
      `/api/sessions/${body.data.sessionId}/belief-test`,
      {
        learnerClaim:
          "The notebook accuracy proves generalization to new customers.",
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        state: "BELIEF_TEST_PROPOSED",
        beliefTest: {
          concept: "entity_leakage",
          evidenceRefs: [],
          uncertainty: { insufficientEvidence: true },
        },
      },
    });
    const events = await harness.sessionRepository.listEvents(
      body.data.sessionId,
    );
    expect(events.at(-1)).toMatchObject({
      actor: "system",
      kind: "belief_test.proposed",
    });
    expect(events.at(-1)).not.toHaveProperty("promptHash");
  });

  it("returns a neutral typed setup error when the first live request rejects authentication", async () => {
    const { app, sessionId, sessionRepository } = await sessionHarness("live");
    const upstream = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "invalid credential",
            type: "invalid_request_error",
            param: null,
            code: "invalid_api_key",
          },
        }),
        {
          status: 401,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    try {
      const response = await app.request(
        `/api/sessions/${sessionId}/belief-test`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            learnerClaim:
              "The notebook accuracy proves generalization to new customers.",
          }),
        },
        { OPENAI_API_KEY: "configured-but-invalid" } as unknown as Env,
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: {
          code: "LIVE_UNAVAILABLE",
          message:
            "Live reasoning is unavailable. Check the server configuration.",
          status: 503,
        },
      });
      await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
        state: "INGESTED",
        version: 1,
      });
      expect(await sessionRepository.listEvents(sessionId)).toHaveLength(1);
    } finally {
      upstream.mockRestore();
    }
  });

  it("rejects an unsafe custom endpoint without advancing the live session", async () => {
    const { app, sessionId, sessionRepository } = await sessionHarness("live");

    const response = await app.request(
      `/api/sessions/${sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          learnerClaim:
            "The notebook accuracy proves generalization to new customers.",
        }),
      },
      {
        OPENAI_API_KEY: "server-only-key",
        OPENAI_BASE_URL: "http://responses.example.test/v1",
      } as unknown as Env & Record<string, string>,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "CONFIGURATION_ERROR", status: 503 },
    });
    await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
      state: "INGESTED",
      version: 1,
    });
    expect(await sessionRepository.listEvents(sessionId)).toHaveLength(1);
  });

  it("persists the evidence-gated instant path through a verified patch", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const route = `/api/sessions/${sessionId}`;

    expect(
      (
        await postJson(app, `${route}/belief-test`, {
          learnerClaim:
            "The 98.5% test accuracy proves generalization to new customers.",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await postJson(app, `${route}/belief-test/confirm`, {
          action: "confirm",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await postJson(app, `${route}/prediction`, {
          choice: "Accuracy remains near 98%",
          confidence: 72,
        })
      ).status,
    ).toBe(201);

    const duplicatePrediction = await postJson(app, `${route}/prediction`, {
      choice: "Changed after commitment",
      confidence: 10,
    });
    expect(duplicatePrediction.status).toBe(409);

    expect((await postJson(app, `${route}/lab/compile`)).status).toBe(200);
    expect((await postJson(app, `${route}/lab/run`)).status).toBe(200);
    expect(
      (
        await postJson(app, `${route}/revision`, {
          revision:
            "Hold out complete entities and remove identity shortcuts before claiming generalization.",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await postJson(app, `${route}/transfer`, {
          strategyChoice: "time_ordered_holdout",
          riskChoice: "centered_window_reads_future",
          evidenceChoices: [
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
          ],
        })
      ).status,
    ).toBe(200);
    const patch = await postJson(app, `${route}/patch/compile`);
    expect(patch.status).toBe(200);
    await expect(patch.json()).resolves.toMatchObject({
      ok: true,
      data: {
        state: "REASONING_DIFF_ISSUED",
        patch: {
          status: "VERIFIED",
          modifiedCells: [3],
          verification: { passed: true },
        },
        reasoningDiff: {
          schemaVersion: "1",
          sessionId,
        },
        proofBundle: {
          schemaVersion: "1",
          sessionId,
          replayId: "leakage-01",
          integrity: { mode: "integrity-hashed" },
        },
      },
    });

    const session = await sessionRepository.find(sessionId);
    expect(session).toMatchObject({
      state: "REASONING_DIFF_ISSUED",
      verifiedResult: {
        resultHash:
          "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0",
      },
      transferResult: { outcome: "PASSED" },
      patchResult: { status: "VERIFIED" },
    });
    const events = await sessionRepository.listEvents(sessionId);
    expect(events).toHaveLength(13);
    expect(events.map((event) => event.kind)).toEqual([
      "session.created",
      "belief_test.proposed",
      "belief_test.confirmed",
      "prediction.committed",
      "lab.compilation_started",
      "lab.verified",
      "experiment.completed",
      "revision.recorded",
      "transfer.started",
      "transfer.passed",
      "patch.compilation_started",
      "patch.verified",
      "reasoning_diff.issued",
    ]);
    expect(events.at(-1)?.previousEventHash).toBe(events.at(-2)?.eventHash);

    const refreshed = await app.request(route);
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toMatchObject({
      ok: true,
      data: {
        sessionId,
        state: "REASONING_DIFF_ISSUED",
        revision:
          "Hold out complete entities and remove identity shortcuts before claiming generalization.",
      },
    });

    const proof = await app.request(`${route}/proof-bundle`);
    expect(proof.status).toBe(200);
    await expect(proof.json()).resolves.toMatchObject({
      ok: true,
      data: {
        sessionId,
        replayId: "leakage-01",
        integrity: {
          mode: "integrity-hashed",
          eventChainHead: events[11]?.eventHash,
        },
      },
    });
  });

  it("maps a lost D1 optimistic update to a typed conflict", async () => {
    const repository = new ConflictSessionRepository();
    const { app, sessionId } = await sessionHarness("sample", repository);
    const route = `/api/sessions/${sessionId}`;

    await postJson(app, `${route}/belief-test`, {
      learnerClaim:
        "The notebook accuracy proves generalization to new customers.",
    });
    await postJson(app, `${route}/belief-test/confirm`, { action: "confirm" });
    repository.enableConflict();

    const response = await postJson(app, `${route}/prediction`, {
      choice: "Accuracy remains near 98%",
      confidence: 100,
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "ILLEGAL_TRANSITION",
        message: `Session changed during D1 update: ${sessionId}`,
        status: 409,
      },
    });
  });
});
