// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  type ArtifactManifest,
  type BeliefTest,
  type ExperimentPlanV2,
  HostedVerifiedResultSetV2Schema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJob,
  type RunnerJobKind,
  RunnerLabRunBundleSchema,
  RunnerPatchCompileBundleSchema,
} from "@counterlab/contracts";
import type {
  CounterLabSession,
  EvidenceEvent,
  RunnerJobRepository,
  SessionMode,
  SessionRepository,
} from "@counterlab/session-core";
import { createEvidenceEvent, hashCanonical } from "@counterlab/session-core";
import { validateProofBundle } from "@counterlab/proof-bundle";

import sourceNotebookText from "../../../fixtures/notebooks/customer_churn_leakage.ipynb?raw";
import patchedNotebookText from "../../../replays/leakage-01/patch/customer_churn_leakage.patched.ipynb?raw";
import scientificEngineSnapshotValue from "../../../scientific-engines/snapshot-hash.json";

import { api, createApi } from "./api";
import type { ArtifactStore, StoredArtifact } from "./artifact-store";
import { ConcurrentD1SessionUpdateError } from "./d1-session-repository";
import { sampleResult } from "./sample-evidence";
import { createSamplePatchResult } from "./sample-learning-loop";
import type {
  RunnerDispatchRequest,
  RunnerDispatcher,
  RunnerObjectStore,
} from "./runner-control-plane";
import { generateRunnerJobTokenKeyPair } from "./runner-token";
import { summarizeOperationalRows } from "./operational-diagnostics";

const { privateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY } =
  await generateRunnerJobTokenKeyPair();

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
  readonly cancelled: RunnerDispatchRequest[] = [];

  constructor(private dispatchFailuresRemaining = 0) {}

  ready(): Promise<boolean> {
    return Promise.resolve(true);
  }

  dispatch(request: RunnerDispatchRequest): Promise<void> {
    this.dispatched.push(structuredClone(request));
    if (this.dispatchFailuresRemaining > 0) {
      this.dispatchFailuresRemaining -= 1;
      return Promise.reject(new Error("ambiguous runner dispatch"));
    }
    return Promise.resolve();
  }

  cancel(request: RunnerDispatchRequest): Promise<void> {
    this.cancelled.push(structuredClone(request));
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
  fileSha256 = "a".repeat(64),
): Promise<ArtifactManifest> {
  const sample = await artifactStore.find(sampleArtifactId);
  if (sample === undefined) throw new Error("sample artifact is missing");
  const uploaded = {
    ...sample.manifest,
    artifactId: "artifact_uploaded_not_sample",
    fileName: "uploaded_customer_model.ipynb",
    fileSha256,
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
      kind: "session.created",
      payload: { state: session.state, artifactId: session.artifactId },
    },
  });
  await repository.create(session, firstEvent);
  if (session.beliefTest !== undefined && session.prediction !== undefined) {
    let previous = firstEvent;
    const drafts = [
      {
        actor: "gpt-5.6" as const,
        kind: "belief_test.proposed",
        payload: { beliefTestId: session.beliefTest.id },
      },
      {
        actor: "learner" as const,
        kind: "belief_test.confirmed",
        payload: { beliefTestId: session.beliefTest.id },
      },
      {
        actor: "learner" as const,
        kind: "prediction.committed",
        payload: { predictionId: session.prediction.id },
        outputHashes: [session.prediction.immutableHash],
      },
    ];
    for (const draft of drafts) {
      const evidence = await createEvidenceEvent({
        sessionId: session.id,
        sequence: previous.sequence + 1,
        timestamp,
        eventId: `event_${session.id}_${previous.sequence + 1}`,
        previousEventHash: previous.eventHash,
        draft,
      });
      await repository.save(session, session.version, evidence);
      previous = evidence;
    }
  }
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

async function preparedHostedRunner(
  sessionId: string,
  dispatcher = new CapturingRunnerDispatcher(),
) {
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
  let runnerIdSequence = 0;
  const app = createApi({
    sessionRepository: harness.sessionRepository,
    artifactStore: harness.artifactStore,
    runnerJobRepository: runnerJobs,
    runnerObjectStore: runnerObjects,
    runnerDispatcher: dispatcher,
    runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix) => `${prefix}_${sessionId}_${++runnerIdSequence}`,
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
    dispatcher,
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

async function liveBeliefInput(
  app: ReturnType<typeof createApi>,
  sessionId: string,
  learnerClaim: string,
) {
  const preview = await postJson(
    app,
    `/api/sessions/${sessionId}/belief-test/preview`,
    { learnerClaim },
  );
  expect(preview.status).toBe(200);
  const body = (await preview.json()) as {
    data: { previewHash: string; requiresSensitiveApproval: boolean };
  };
  return {
    learnerClaim,
    previewHash: body.data.previewHash,
    ...(body.data.requiresSensitiveApproval
      ? { sensitiveContentApproved: true }
      : {}),
  };
}

function imbalanceArtifactManifest(): ArtifactManifest {
  return {
    artifactId: "artifact_uploaded_imbalance",
    fileName: "rare_event_classifier.ipynb",
    fileSha256: "9".repeat(64),
    nbformat: 4,
    support: { status: "SUPPORTED", reasons: [] },
    cells: [
      {
        index: 2,
        type: "code",
        sourceSha256: "a".repeat(64),
        sourceExcerpt:
          "positive_rate = y.mean()\nX_train, X_test = train_test_split(X, y, stratify=y)",
        executionCount: 2,
        outputHashes: ["b".repeat(64)],
        symbols: ["train_test_split", "value_counts", "stratify"],
        metricCandidates: [
          { name: "positive_rate", value: 0.025, outputIndex: 0 },
        ],
      },
      {
        index: 4,
        type: "code",
        sourceSha256: "c".repeat(64),
        sourceExcerpt:
          "print(accuracy_score(y_test, predictions))\nprint(classification_report(y_test, predictions))",
        executionCount: 4,
        outputHashes: ["d".repeat(64)],
        symbols: ["accuracy_score", "classification_report"],
        metricCandidates: [{ name: "accuracy", value: 0.975, outputIndex: 0 }],
      },
    ],
    schemaSummary: {
      fields: [
        {
          name: "is_fraud",
          inferredType: "binary",
          privacyClass: "target",
        },
      ],
      rowCount: 4_000,
      entityCandidates: [],
      targetCandidates: ["is_fraud"],
    },
    packageHints: ["sklearn"],
    createdAt: "2026-07-14T10:00:00.000Z",
  };
}

function imbalanceBeliefTest(artifact: ArtifactManifest): BeliefTest {
  return {
    schemaVersion: "1",
    id: "belief_imbalance_live",
    concept: "class_imbalance",
    learnerClaim: "The high accuracy proves the classifier catches rare fraud.",
    currentHypothesis: {
      statement: "High accuracy means the rare-event classifier is useful.",
      predictedOutcome: "Minority recall remains high.",
    },
    competingHypothesis: {
      statement: "Class rarity hides a classifier that misses rare events.",
      predictedOutcome:
        "A majority baseline stays accurate while minority recall is zero.",
    },
    evidenceRefs: [
      {
        cellIndex: 2,
        outputIndex: 0,
        kind: "metric",
        hash: artifact.cells[0]!.outputHashes[0]!,
        excerpt: "positive_rate = 0.025",
        relevance: "The positive class is rare.",
      },
      {
        cellIndex: 4,
        outputIndex: 0,
        kind: "metric",
        hash: artifact.cells[1]!.outputHashes[0]!,
        excerpt: "accuracy = 0.975",
        relevance: "The notebook relies on aggregate accuracy.",
      },
    ],
    alternatives: [
      {
        label: "Threshold mismatch",
        rationale: "The default threshold may not match false-negative cost.",
      },
    ],
    decisiveIntervention: {
      id: "minority-metrics",
      description:
        "Compare a majority baseline, minority metrics, threshold, and prevalence.",
      controlledVariables: ["seed", "holdout"],
      changedVariables: ["threshold", "prevalence"],
      discriminatesBecause:
        "The hypotheses predict different rare-class recall and precision.",
    },
    uncertainty: {
      confidence: 0.88,
      limitations: ["This does not select a production threshold."],
      insufficientEvidence: false,
    },
    requiresLearnerConfirmation: true,
  };
}

async function imbalanceExperimentPlan(
  sessionId: string,
  artifact: ArtifactManifest,
  beliefTest: BeliefTest,
): Promise<ExperimentPlanV2> {
  const run = (
    runId: string,
    operation:
      | "imbalance.majority_baseline"
      | "imbalance.stratified_holdout"
      | "imbalance.threshold_sweep"
      | "imbalance.prevalence_sweep",
    model: "majority_baseline" | "logistic_regression",
    threshold: number,
    prevalenceScenario: "observed" | "rarer",
  ) => ({
    concept: "class_imbalance" as const,
    runId,
    operation,
    seed: 2603,
    threshold,
    prevalenceScenario,
    model,
  });
  return {
    schemaVersion: "2",
    planId: "plan_imbalance_live",
    sessionId,
    concept: "class_imbalance",
    conceptPackVersion: "1.0.0",
    artifactManifestHash: await hashCanonical(artifact),
    beliefTestId: beliefTest.id,
    evidenceRefs: beliefTest.evidenceRefs,
    baseline: run(
      "majority",
      "imbalance.majority_baseline",
      "majority_baseline",
      0.5,
      "observed",
    ),
    interventions: [
      run(
        "stratified",
        "imbalance.stratified_holdout",
        "logistic_regression",
        0.5,
        "observed",
      ),
      run(
        "threshold",
        "imbalance.threshold_sweep",
        "logistic_regression",
        0.25,
        "observed",
      ),
      run(
        "prevalence",
        "imbalance.prevalence_sweep",
        "logistic_regression",
        0.25,
        "rarer",
      ),
    ],
    controlledVariables: ["seed", "holdout"],
    changedVariables: ["threshold", "prevalence"],
    metrics: [
      "accuracy",
      "precision",
      "recall",
      "f1",
      "pr_auc",
      "roc_auc",
      "confusion_matrix",
      "prevalence",
    ],
    visualizations: [
      "metric_comparison",
      "confusion_matrix",
      "threshold_curve",
      "prevalence_sensitivity",
    ],
    discriminatesBecause:
      "A majority baseline can be accurate while missing every rare event.",
    expectedPatterns: [
      { hypothesisId: "current", qualitativeOutcome: "Recall remains high." },
      {
        hypothesisId: "competing",
        qualitativeOutcome: "Accuracy stays high while recall is low.",
      },
    ],
    nonClaims: ["This does not choose a production threshold."],
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
  };
}

async function imbalanceVerifiedResult(plan: ExperimentPlanV2) {
  if (plan.concept !== "class_imbalance") {
    throw new Error("imbalance result requires an imbalance plan");
  }
  const fixtureHash = "e".repeat(64);
  const featureHash = "f".repeat(64);
  const confusionByOperation = {
    "imbalance.majority_baseline": { tn: 1460, fp: 0, fn: 40, tp: 0 },
    "imbalance.stratified_holdout": { tn: 1450, fp: 10, fn: 32, tp: 8 },
    "imbalance.threshold_sweep": { tn: 1400, fp: 60, fn: 15, tp: 25 },
    "imbalance.prevalence_sweep": { tn: 1400, fp: 60, fn: 7, tp: 13 },
  } as const;
  const rounded = (value: number) => Number(value.toFixed(12));
  const runs = [plan.baseline, ...plan.interventions].map((spec) => {
    if (spec.concept !== "class_imbalance") {
      throw new Error("mixed concept plan");
    }
    const matrix = confusionByOperation[spec.operation];
    const total = matrix.tn + matrix.fp + matrix.fn + matrix.tp;
    const precision =
      matrix.tp + matrix.fp === 0 ? 0 : matrix.tp / (matrix.tp + matrix.fp);
    const recall =
      matrix.tp + matrix.fn === 0 ? 0 : matrix.tp / (matrix.tp + matrix.fn);
    const f1 =
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall);
    return {
      id: spec.runId,
      operation: spec.operation,
      model: spec.model,
      seed: spec.seed,
      threshold: spec.threshold,
      prevalenceScenario: spec.prevalenceScenario,
      metrics: {
        accuracy: rounded((matrix.tn + matrix.tp) / total),
        precision: rounded(precision),
        recall: rounded(recall),
        f1: rounded(f1),
        prAuc:
          spec.operation === "imbalance.majority_baseline" ? 0.026667 : 0.31,
        rocAuc: spec.operation === "imbalance.majority_baseline" ? 0.5 : 0.84,
      },
      confusionMatrix: matrix,
      sampleSizes: { train: 4500, test: total },
      classCounts: {
        train: { negative: 4380, positive: 120 },
        test: {
          negative: matrix.tn + matrix.fp,
          positive: matrix.fn + matrix.tp,
        },
      },
      prevalence: rounded((matrix.fn + matrix.tp) / total),
      predictedPositiveRate: rounded((matrix.fp + matrix.tp) / total),
      featureSetFingerprint: featureHash,
      pipelineFingerprint:
        spec.model === "majority_baseline" ? "1".repeat(64) : "2".repeat(64),
      evaluationSetFingerprint:
        spec.prevalenceScenario === "observed"
          ? "3".repeat(64)
          : "4".repeat(64),
      scoreFingerprint:
        spec.model === "majority_baseline"
          ? "5".repeat(64)
          : spec.prevalenceScenario === "observed"
            ? "6".repeat(64)
            : "7".repeat(64),
      inputFingerprint: fixtureHash,
    };
  });
  const withoutHash = {
    schemaVersion: "2" as const,
    concept: "class_imbalance" as const,
    planId: plan.planId,
    sessionId: plan.sessionId,
    artifactManifestHash: plan.artifactManifestHash,
    conceptPackVersion: plan.conceptPackVersion,
    fixture: {
      sha256: fixtureHash,
      rows: 6000,
      positives: 160,
      prevalence: rounded(160 / 6000),
    },
    kernelVersion: "0.1.0",
    seed: plan.baseline.seed,
    runs,
    chartData: runs.map((run) => ({
      runId: run.id,
      operation: run.operation,
      ...run.metrics,
      prevalence: run.prevalence,
      predictedPositiveRate: run.predictedPositiveRate,
      sampleSize: run.sampleSizes.test,
      threshold: run.threshold,
      prevalenceScenario: run.prevalenceScenario,
      seed: run.seed,
    })),
  };
  return HostedVerifiedResultSetV2Schema.parse({
    ...withoutHash,
    resultHash: await hashCanonical(withoutHash),
  });
}

async function preparedImbalanceInteractiveSession() {
  const sessionRepository = new MemorySessionRepository();
  const artifactStore = new MemoryArtifactStore();
  const runnerJobs = new MemoryRunnerJobRepository();
  const runnerObjects = new MemoryRunnerObjectStore();
  const dispatcher = new CapturingRunnerDispatcher();
  const artifact = imbalanceArtifactManifest();
  const beliefTest = imbalanceBeliefTest(artifact);
  const sessionId = "session_imbalance_interactive";
  const plan = await imbalanceExperimentPlan(sessionId, artifact, beliefTest);
  const planHash = await hashCanonical(plan);
  const predictionBase = {
    schemaVersion: "1" as const,
    id: "prediction_imbalance_interactive",
    sessionId,
    beliefTestId: beliefTest.id,
    choice: "Accuracy will stay useful after minority-class checks.",
    confidence: 72,
    committedAt: "2026-07-14T10:00:00.000Z",
  };
  await artifactStore.save(artifact, "uploads/rare-event.ipynb");
  await runnerObjects.put(
    "runner-output/runner_job_imbalance_compile/experiment-plan.json",
    JSON.stringify(plan),
    "application/json",
  );
  await seedSession(sessionRepository, {
    id: sessionId,
    artifactId: artifact.artifactId,
    mode: { kind: "live_notebook" },
    state: "EXPERIMENT_COMPLETED",
    version: 6,
    patch: {
      beliefTest,
      prediction: {
        ...predictionBase,
        immutableHash: await hashCanonical(predictionBase),
      },
      labVerification: {
        status: "VERIFIED",
        jobId: "runner_job_imbalance_compile",
        planHash,
        source: "hosted-plan-v2",
      },
      verifiedResult: await imbalanceVerifiedResult(plan),
    },
  });
  const app = createApi({
    sessionRepository,
    artifactStore,
    runnerJobRepository: runnerJobs,
    runnerObjectStore: runnerObjects,
    runnerDispatcher: dispatcher,
    runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix) => `${prefix}_imbalance_interactive`,
  });
  return {
    app,
    artifact,
    beliefTest,
    dispatcher,
    plan,
    runnerJobs,
    runnerObjects,
    sessionRepository,
    sessionId,
  };
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

  it("dispatches the class-imbalance fixture for a verified live imbalance plan", async () => {
    const sessionRepository = new MemorySessionRepository();
    const artifactStore = new MemoryArtifactStore();
    const runnerJobs = new MemoryRunnerJobRepository();
    const runnerObjects = new MemoryRunnerObjectStore();
    const dispatcher = new CapturingRunnerDispatcher();
    const artifact = imbalanceArtifactManifest();
    const beliefTest = imbalanceBeliefTest(artifact);
    const sessionId = "session_imbalance_run";
    const plan = await imbalanceExperimentPlan(sessionId, artifact, beliefTest);
    const planHash = await hashCanonical(plan);
    const predictionBase = {
      schemaVersion: "1" as const,
      id: "prediction_imbalance_run",
      sessionId,
      beliefTestId: beliefTest.id,
      choice: "Accuracy will stay useful after minority-class checks.",
      confidence: 72,
      committedAt: "2026-07-14T10:00:00.000Z",
    };
    const prediction = {
      ...predictionBase,
      immutableHash: await hashCanonical(predictionBase),
    };
    await artifactStore.save(artifact, "uploads/rare-event.ipynb");
    await runnerObjects.put(
      "runner-output/runner_job_imbalance_compile/experiment-plan.json",
      JSON.stringify(plan),
      "application/json",
    );
    await seedSession(sessionRepository, {
      id: sessionId,
      artifactId: artifact.artifactId,
      mode: { kind: "live_notebook" },
      state: "LAB_VERIFIED",
      version: 5,
      patch: {
        beliefTest,
        prediction,
        labVerification: {
          status: "VERIFIED",
          jobId: "runner_job_imbalance_compile",
          planHash,
          source: "hosted-plan-v2",
        },
      },
    });
    const app = createApi({
      sessionRepository,
      artifactStore,
      runnerJobRepository: runnerJobs,
      runnerObjectStore: runnerObjects,
      runnerDispatcher: dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_imbalance_run`,
    });

    const response = await postJson(app, `/api/sessions/${sessionId}/lab/run`);

    expect(response.status).toBe(202);
    const firstBody = (await response.clone().json()) as {
      data: { runnerJob: RunnerJob };
    };
    const duplicate = await postJson(app, `/api/sessions/${sessionId}/lab/run`);
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: {
        reused: true,
        runnerJob: { jobId: firstBody.data.runnerJob.jobId },
      },
    });
    expect(dispatcher.dispatched).toHaveLength(1);
    const dispatch = dispatcher.dispatched[0];
    if (dispatch === undefined) throw new Error("runner was not dispatched");
    const input = runnerObjects.objects.get(
      `runner-input/${dispatch.job.jobId}.json`,
    );
    expect(input).toBeDefined();
    const bundle = RunnerLabRunBundleSchema.parse(JSON.parse(input!.body));
    expect(bundle).toMatchObject({
      purpose: "AUTHORITATIVE",
      fixture: { id: "public-imbalance-v1" },
      experimentPlan: { concept: "class_imbalance" },
    });

    const authorization = { authorization: `Bearer ${dispatch.token}` };
    expect(
      (
        await app.request(`/api/runner/jobs/${dispatch.job.jobId}/start`, {
          method: "POST",
          headers: authorization,
        })
      ).status,
    ).toBe(200);
    const verified = await imbalanceVerifiedResult(bundle.experimentPlan);
    if (verified.concept !== "class_imbalance") {
      throw new Error("expected an imbalance result");
    }
    const changedRuns = verified.runs.map((run) =>
      run.operation === "imbalance.threshold_sweep"
        ? { ...run, scoreFingerprint: "0".repeat(64) }
        : run,
    );
    const { resultHash: _resultHash, ...resultWithoutHash } = verified;
    const tamperedResult = {
      ...resultWithoutHash,
      runs: changedRuns,
      resultHash: await hashCanonical({
        ...resultWithoutHash,
        runs: changedRuns,
      }),
    };
    const resultText = JSON.stringify(tamperedResult);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await app.request(
          `/api/runner/jobs/${dispatch.job.jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callback = await postJson(
      app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_imbalance_fingerprint_drift",
        idempotencyKey: "imbalance-fingerprint-drift-1",
        jobId: dispatch.job.jobId,
        stateVersion: dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [resultFileHash],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:02.000Z",
      },
      authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        runnerJob: {
          status: "REJECTED",
          error: { code: "RESULT_VERIFIER_REJECTED" },
        },
        session: { state: "LAB_VERIFIED" },
        verification: {
          status: "REJECTED",
          invariants: expect.arrayContaining([
            expect.objectContaining({
              name: "fixed_control_fingerprints",
              passed: false,
            }),
          ]),
        },
      },
    });
    const stored = await sessionRepository.find(sessionId);
    expect(stored?.state).toBe("LAB_VERIFIED");
    expect(stored).not.toHaveProperty("verifiedResult");
  });

  it("dispatches bounded threshold and prevalence controls through the fixed imbalance plan", async () => {
    const harness = await preparedImbalanceInteractiveSession();

    const response = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/lab/interactive`,
      {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.2,
        prevalenceScenario: "more_common",
        metricFocus: "recall",
      },
    );

    expect(response.status).toBe(202);
    const firstBody = (await response.clone().json()) as {
      data: { runnerJob: RunnerJob };
    };
    const duplicate = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/lab/interactive`,
      {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.2,
        prevalenceScenario: "more_common",
        metricFocus: "recall",
      },
    );
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: {
        reused: true,
        runnerJob: { jobId: firstBody.data.runnerJob.jobId },
      },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(1);
    const dispatch = harness.dispatcher.dispatched[0];
    if (dispatch === undefined) throw new Error("runner was not dispatched");
    const input = harness.runnerObjects.objects.get(
      `runner-input/${dispatch.job.jobId}.json`,
    );
    if (input === undefined) throw new Error("runner input was not stored");
    const bundle = RunnerLabRunBundleSchema.parse(JSON.parse(input.body));
    expect(bundle).toMatchObject({
      purpose: "INTERACTIVE",
      fixture: { id: "public-imbalance-v1" },
      experimentPlan: {
        concept: "class_imbalance",
        changedVariables: ["decision threshold", "deployment prevalence"],
      },
    });
    const thresholdRun = bundle.experimentPlan.interventions.find(
      (run) => run.operation === "imbalance.threshold_sweep",
    );
    const prevalenceRun = bundle.experimentPlan.interventions.find(
      (run) => run.operation === "imbalance.prevalence_sweep",
    );
    expect(thresholdRun).toMatchObject({
      threshold: 0.2,
      prevalenceScenario: "observed",
    });
    expect(prevalenceRun).toMatchObject({
      threshold: 0.2,
      prevalenceScenario: "more_common",
    });

    const authorization = { authorization: `Bearer ${dispatch.token}` };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${dispatch.job.jobId}/start`,
          { method: "POST", headers: authorization },
        )
      ).status,
    ).toBe(200);
    const result = await imbalanceVerifiedResult(bundle.experimentPlan);
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${dispatch.job.jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_imbalance_interactive",
        idempotencyKey: "imbalance-interactive-complete-1",
        jobId: dispatch.job.jobId,
        stateVersion: dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [resultFileHash],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:02.000Z",
      },
      authorization,
    );
    expect(callback.status).toBe(200);
    const callbackBody = (await callback.json()) as {
      data: { verification?: unknown; session: unknown };
    };
    expect(callbackBody.data.verification).toMatchObject({
      status: "VERIFIED",
    });
    expect(callbackBody).toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED" },
        verification: { status: "VERIFIED" },
      },
    });
    await expect(
      Promise.resolve(
        harness.app.request(
          `/api/sessions/${harness.sessionId}/jobs/${dispatch.job.jobId}/result`,
        ),
      ).then(async (verified) => ({
        status: verified.status,
        body: (await verified.json()) as unknown,
      })),
    ).resolves.toMatchObject({
      status: 200,
      body: {
        data: {
          selectedRunId: expect.stringMatching(/^interactive_/),
          result: { concept: "class_imbalance", resultHash: result.resultHash },
          verification: { status: "VERIFIED" },
        },
      },
    });
    await expect(
      harness.sessionRepository.find(harness.sessionId),
    ).resolves.toMatchObject({
      state: "EXPERIMENT_COMPLETED",
      verifiedResult: { planId: harness.plan.planId },
    });
  });

  it("scores the fixed manufacturing transfer for an artifact-bound imbalance result", async () => {
    const harness = await preparedImbalanceInteractiveSession();
    const seeded = await harness.sessionRepository.find(harness.sessionId);
    const previousEvent = await harness.sessionRepository.lastEvent(
      harness.sessionId,
    );
    if (seeded === undefined || previousEvent === undefined) {
      throw new Error("imbalance session evidence was not seeded");
    }
    await harness.sessionRepository.save(
      seeded,
      seeded.version,
      await createEvidenceEvent({
        sessionId: harness.sessionId,
        sequence: previousEvent.sequence + 1,
        timestamp: "2026-07-14T10:00:00.000Z",
        eventId: "event_imbalance_experiment_completed",
        previousEventHash: previousEvent.eventHash,
        draft: {
          actor: "kernel",
          kind: "experiment.completed",
          outputHashes: [seeded.verifiedResult!.resultHash],
          payload: { concept: "class_imbalance" },
        },
      }),
    );
    await harness.runnerJobs.create({
      schemaVersion: "1",
      jobId: "runner_job_imbalance_compile",
      kind: "LAB_COMPILE",
      status: "VERIFIED",
      sessionId: harness.sessionId,
      artifactId: harness.artifact.artifactId,
      artifactManifestHash: harness.plan.artifactManifestHash,
      conceptPack: { id: "class_imbalance", version: "1.0.0" },
      inputHashes: ["1".repeat(64)],
      stateVersion: 4,
      jobVersion: 4,
      createdAt: "2026-07-14T09:59:58.000Z",
      updatedAt: "2026-07-14T10:00:00.000Z",
      startedAt: "2026-07-14T09:59:59.000Z",
      completedAt: "2026-07-14T10:00:00.000Z",
      attempt: 1,
      maxAttempts: 3,
      runnerIdentity: "test-runner",
      timeoutSeconds: 180,
      outputHashes: ["2".repeat(64)],
      eventCursor: 0,
    });
    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.sessionId}/revision`,
          {
            revision:
              "For rare events, accuracy needs a majority baseline, a confusion matrix, and a cost-aware threshold.",
          },
        )
      ).status,
    ).toBe(200);

    const transfer = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/transfer`,
      {
        strategyChoice: "cost_aware_threshold",
        riskChoice: "minority_false_negative_cost",
        evidenceChoices: [
          "confusion_matrix_exposes_misses",
          "prevalence_shift_changes_precision",
        ],
      },
    );

    expect(transfer.status).toBe(200);
    await expect(transfer.json()).resolves.toMatchObject({
      data: {
        state: "TRANSFER_PASSED",
        transferResult: {
          taskId: "manufacturing-defect-transfer-01",
          outcome: "PASSED",
          evaluatorVersion: "counterlab-imbalance-transfer-v1",
        },
      },
    });

    const patchCompile = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/patch/compile`,
    );
    expect(patchCompile.status).toBe(202);
    expect(harness.dispatcher.dispatched).toHaveLength(1);
    const dispatch = harness.dispatcher.dispatched[0];
    if (dispatch === undefined)
      throw new Error("patch runner was not dispatched");
    const input = harness.runnerObjects.objects.get(
      `runner-input/${dispatch.job.jobId}.json`,
    );
    if (input === undefined) throw new Error("patch input was not stored");
    expect(
      RunnerPatchCompileBundleSchema.parse(JSON.parse(input.body)),
    ).toMatchObject({
      kind: "PATCH_COMPILE",
      approvedBeliefTest: { concept: "class_imbalance" },
      patchContract: {
        id: "imbalance-notebook-patch-v1",
        allowedTransformations: [
          "stratify_classification_holdout",
          "add_majority_baseline",
          "replace_accuracy_only_evaluation",
        ],
      },
    });

    const bundle = RunnerPatchCompileBundleSchema.parse(JSON.parse(input.body));
    const authorization = { authorization: `Bearer ${dispatch.token}` };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${dispatch.job.jobId}/start`,
          { method: "POST", headers: authorization },
        )
      ).status,
    ).toBe(200);
    const transferSession = await harness.sessionRepository.find(
      harness.sessionId,
    );
    if (
      transferSession?.transferResult === undefined ||
      transferSession.verifiedResult === undefined
    ) {
      throw new Error("imbalance patch lineage is incomplete");
    }
    const patchPlan = {
      schemaVersion: "1" as const,
      planId: "patch_plan_imbalance_worker",
      sessionId: harness.sessionId,
      concept: "class_imbalance" as const,
      conceptPackVersion: "1.0.0",
      artifactManifestHash: harness.plan.artifactManifestHash,
      sourceArtifactHash: harness.artifact.fileSha256,
      transferResultHash: transferSession.transferResult.resultHash,
      verifiedResultHash: transferSession.verifiedResult.resultHash,
      evidenceRefs: [
        {
          cellIndex: 4,
          outputIndex: 0,
          kind: "metric" as const,
          hash: harness.artifact.cells[1]!.outputHashes[0]!,
          excerpt: "accuracy = 0.975",
          relevance: "The notebook relies on aggregate accuracy.",
        },
      ],
      targetCells: [2],
      targetField: "is_fraud",
      operations: [
        {
          id: "stratify_classification_holdout" as const,
          cellIndex: 2,
          reason: "Preserve class prevalence in the evaluation holdout.",
        },
        {
          id: "add_majority_baseline" as const,
          cellIndex: 2,
          reason: "Compute the trivial high-accuracy reference.",
        },
        {
          id: "replace_accuracy_only_evaluation" as const,
          cellIndex: 2,
          reason: "Expose minority errors and threshold tradeoffs.",
        },
      ],
      preserveUnrelatedCells: true as const,
      nonClaims: ["This does not choose a production threshold."],
    };
    const planText = JSON.stringify(patchPlan);
    const notebookText = '{"cells":[{"cell_type":"code"}]}\n';
    const notebookHash = await sha256Text(notebookText);
    const diff = "@@ cell 2 @@\n- accuracy only\n+ minority metrics";
    const patchPayload = {
      schemaVersion: "1" as const,
      id: "patch_imbalance_worker",
      sessionId: harness.sessionId,
      status: "VERIFIED" as const,
      sourceArtifactHash: harness.artifact.fileSha256,
      patchedArtifactHash: notebookHash,
      patchHash: await hashCanonical(diff),
      modifiedCells: [2],
      diff,
      verification: {
        passed: true,
        invariants: [
          "STRATIFIED_HOLDOUT",
          "MAJORITY_BASELINE_COMPUTED",
          "MINORITY_METRICS_RECOMPUTED",
        ],
        unchangedCellHashes: ["f".repeat(64)],
      },
      generatedAt: bundle.requestedAt,
    };
    const patchResult = {
      ...patchPayload,
      resultHash: await hashCanonical(patchPayload),
    };
    const resultText = JSON.stringify(patchResult);
    const outputs = [
      ["patch-plan.json", planText, "application/json"],
      ["patch-result.json", resultText, "application/json"],
      ["patched-notebook.ipynb", notebookText, "application/x-ipynb+json"],
    ] as const;
    for (const [name, body, contentType] of outputs) {
      expect(
        (
          await harness.app.request(
            `/api/runner/jobs/${dispatch.job.jobId}/outputs/${name}`,
            {
              method: "PUT",
              headers: {
                ...authorization,
                "content-type": contentType,
              },
              body,
            },
          )
        ).status,
      ).toBe(201);
    }
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_imbalance_patch",
        idempotencyKey: "imbalance-patch-complete-1",
        jobId: dispatch.job.jobId,
        stateVersion: dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: await Promise.all(
          outputs.map(([, body]) => sha256Text(body)),
        ),
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:02.000Z",
      },
      authorization,
    );
    const patchCallbackBody = (await callback.json()) as {
      data: { verification?: unknown; session: unknown };
    };
    expect({ status: callback.status }).toEqual({
      status: 200,
    });
    expect(patchCallbackBody.data.verification).toMatchObject({
      status: "VERIFIED",
    });
    expect(patchCallbackBody).toMatchObject({
      data: {
        session: {
          state: "REASONING_DIFF_ISSUED",
          patchResult: { status: "VERIFIED", modifiedCells: [2] },
          reasoningDiff: {
            dimensions: {
              code: {
                after: expect.stringContaining("majority baseline"),
              },
              transfer: {
                after: expect.stringContaining("cost-aware threshold"),
              },
            },
          },
          proofBundle: {
            sessionMode: "live_notebook",
            verifiedResultSet: { concept: "class_imbalance" },
            reproductionCommands: [
              "./scripts/test-all.sh",
              "./scripts/run-mutations.sh imbalance",
            ],
          },
        },
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

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "LOCAL_RUNNER_REQUIRED" },
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

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "LOCAL_RUNNER_REQUIRED" },
    });
    const stored = await harness.sessionRepository.find(sessionId);
    expect(stored?.state).toBe("TRANSFER_PASSED");
    expect(stored).not.toHaveProperty("patchResult");
  });

  it("never scores transfer for a live artifact without an artifact-bound result", async () => {
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
      error: { code: "LIVE_RESULT_REQUIRED" },
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
      await sha256Text(sourceNotebookText),
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
    await runnerObjects.put(
      "uploads/not-public.ipynb",
      sourceNotebookText,
      "application/x-ipynb+json",
    );
    const dispatcher = new CapturingRunnerDispatcher();
    let hostedIdSequence = 0;
    const app = createApi({
      sessionRepository: harness.sessionRepository,
      artifactStore: harness.artifactStore,
      runnerJobRepository: runnerJobs,
      runnerObjectStore: runnerObjects,
      runnerDispatcher: dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_hosted_plan_${++hostedIdSequence}`,
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
    const originalSessionSave = harness.sessionRepository.save.bind(
      harness.sessionRepository,
    );
    let interruptProjection = true;
    harness.sessionRepository.save = async (...arguments_) => {
      if (interruptProjection) {
        interruptProjection = false;
        throw new ConcurrentD1SessionUpdateError(sessionId);
      }
      return originalSessionSave(...arguments_);
    };
    const interruptedCallback = await postJson(
      app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      callbackBody,
      authorization,
    );
    expect(interruptedCallback.status).toBe(409);
    await expect(interruptedCallback.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ILLEGAL_TRANSITION" },
    });
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
        duplicate: true,
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

    const queuedRun = await postJson(app, `/api/sessions/${sessionId}/lab/run`);
    expect(queuedRun.status).toBe(202);
    const runBody = (await queuedRun.json()) as {
      data: { state: string; runnerJob: RunnerJob };
    };
    expect(runBody.data).toMatchObject({
      state: "LAB_VERIFIED",
      runnerJob: {
        kind: "LAB_RUN",
        status: "STARTING",
        artifactId: uploaded.artifactId,
      },
    });
    expect(dispatcher.dispatched).toHaveLength(2);
    const runDispatch = dispatcher.dispatched[1];
    if (runDispatch === undefined) throw new Error("run was not dispatched");
    const runInput = runnerObjects.objects.get(
      `runner-input/${runDispatch.job.jobId}.json`,
    );
    expect(runInput?.body).toContain('"kind":"LAB_RUN"');
    expect(runInput?.body).toContain(plan.planId);
    expect(runInput?.body).not.toContain("nbformat_minor");

    const runAuthorization = {
      authorization: `Bearer ${runDispatch.token}`,
    };
    expect(
      (
        await app.request(`/api/runner/jobs/${runDispatch.job.jobId}/start`, {
          method: "POST",
          headers: runAuthorization,
        })
      ).status,
    ).toBe(200);
    const sourceRuns = new Map(
      sampleResult.runs.map((run) => [run.id, run] as const),
    );
    const resultRuns = [plan.baseline, ...plan.interventions].map((spec) => {
      const sourceId =
        spec.operation === "leakage.group_holdout"
          ? "customer_group_split"
          : spec.operation === "leakage.identity_ablation"
            ? "identity_ablation"
            : "random_row_split";
      const source = sourceRuns.get(sourceId);
      if (source === undefined) throw new Error("sample source run missing");
      return {
        ...source,
        id: spec.runId,
        operation: spec.operation,
        seed: spec.seed,
        groupBy:
          spec.operation === "leakage.group_holdout" ? spec.entityField : null,
        dropFeatures:
          spec.operation === "leakage.identity_ablation"
            ? [spec.entityField]
            : [],
      };
    });
    const resultWithoutHash = {
      schemaVersion: "2" as const,
      concept: "entity_leakage" as const,
      planId: plan.planId,
      sessionId,
      artifactManifestHash: manifestHash,
      conceptPackVersion: plan.conceptPackVersion,
      fixture: sampleResult.fixture,
      kernelVersion: sampleResult.kernelVersion,
      seed: plan.baseline.seed,
      runs: resultRuns,
      chartData: resultRuns.map((run) => ({
        runId: run.id,
        splitStrategy: run.splitStrategy,
        accuracy: run.metrics.accuracy,
        rocAuc: run.metrics.rocAuc,
        sampleSize: run.sampleSizes.test,
        seed: run.seed,
      })),
    };
    const liveResult = {
      ...resultWithoutHash,
      resultHash: await hashCanonical(resultWithoutHash),
    };
    const liveResultText = JSON.stringify(liveResult);
    const liveResultFileHash = await sha256Text(liveResultText);
    expect(
      (
        await app.request(
          `/api/runner/jobs/${runDispatch.job.jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...runAuthorization,
              "content-type": "application/json",
            },
            body: liveResultText,
          },
        )
      ).status,
    ).toBe(201);
    const runCallback = await postJson(
      app,
      `/api/runner/jobs/${runDispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_hosted_run_1",
        idempotencyKey: "hosted-run-complete-1",
        jobId: runDispatch.job.jobId,
        stateVersion: runDispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [liveResultFileHash],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:02.000Z",
      },
      runAuthorization,
    );
    expect(runCallback.status).toBe(200);
    await expect(runCallback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "EXPERIMENT_COMPLETED",
          verifiedResult: {
            schemaVersion: "2",
            planId: plan.planId,
            artifactManifestHash: manifestHash,
          },
        },
        verification: { status: "VERIFIED" },
      },
    });
    const liveStored = await harness.sessionRepository.find(sessionId);
    expect(liveStored?.verifiedResult?.resultHash).toBe(liveResult.resultHash);
    expect(liveStored?.verifiedResult?.resultHash).not.toBe(
      sampleResult.resultHash,
    );

    const unresolvedInteractive = await postJson(
      app,
      `/api/sessions/${sessionId}/lab/interactive`,
      {
        schemaVersion: "1",
        splitStrategy: "random",
        entityField: "not_in_the_manifest",
        identityAblation: true,
        testFraction: 0.25,
      },
    );
    expect(unresolvedInteractive.status).toBe(422);
    expect(dispatcher.dispatched).toHaveLength(2);

    const queuedInteractive = await postJson(
      app,
      `/api/sessions/${sessionId}/lab/interactive`,
      {
        schemaVersion: "1",
        splitStrategy: "random",
        entityField: plan.baseline.entityField,
        identityAblation: true,
        testFraction: 0.25,
      },
    );
    expect(queuedInteractive.status).toBe(202);
    const interactiveBody = (await queuedInteractive.json()) as {
      data: {
        state: string;
        runnerJob: RunnerJob;
        selectedRunId: string;
        configurationHash: string;
      };
    };
    expect(interactiveBody.data).toMatchObject({
      state: "EXPERIMENT_COMPLETED",
      runnerJob: { kind: "LAB_RUN", status: "STARTING" },
    });
    expect(interactiveBody.data.selectedRunId).toMatch(/^interactive_/);
    expect(interactiveBody.data.configurationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(dispatcher.dispatched).toHaveLength(3);

    const interactiveDispatch = dispatcher.dispatched[2];
    if (interactiveDispatch === undefined) {
      throw new Error("interactive run was not dispatched");
    }
    const interactiveInputObject = runnerObjects.objects.get(
      `runner-input/${interactiveDispatch.job.jobId}.json`,
    );
    if (interactiveInputObject === undefined) {
      throw new Error("interactive runner bundle was not stored");
    }
    const interactiveBundle = RunnerLabRunBundleSchema.parse(
      JSON.parse(interactiveInputObject.body),
    );
    expect(interactiveBundle.purpose).toBe("INTERACTIVE");
    expect(
      [
        interactiveBundle.experimentPlan.baseline,
        ...interactiveBundle.experimentPlan.interventions,
      ].find((run) => run.runId === interactiveBody.data.selectedRunId),
    ).toMatchObject({
      runId: interactiveBody.data.selectedRunId,
      operation: "leakage.identity_ablation",
      entityField: plan.baseline.entityField,
      dropIdentity: true,
      testFraction: 0.25,
    });
    expect(interactiveInputObject.body).not.toContain("nbformat_minor");

    const interactiveAuthorization = {
      authorization: `Bearer ${interactiveDispatch.token}`,
    };
    expect(
      (
        await app.request(
          `/api/runner/jobs/${interactiveDispatch.job.jobId}/start`,
          { method: "POST", headers: interactiveAuthorization },
        )
      ).status,
    ).toBe(200);
    const interactiveRuns = [
      interactiveBundle.experimentPlan.baseline,
      ...interactiveBundle.experimentPlan.interventions,
    ].map((spec) => {
      if (spec.concept !== "entity_leakage") {
        throw new Error("interactive leakage plan contains another concept");
      }
      const sourceId =
        spec.operation === "leakage.group_holdout"
          ? "customer_group_split"
          : spec.dropIdentity
            ? "identity_ablation"
            : "random_row_split";
      const source = sourceRuns.get(sourceId);
      if (source === undefined) {
        throw new Error("interactive source run missing");
      }
      const group = spec.operation === "leakage.group_holdout";
      return {
        ...source,
        id: spec.runId,
        operation: spec.operation,
        splitStrategy: group ? ("group" as const) : ("random" as const),
        groupBy: group ? spec.entityField : null,
        dropFeatures: spec.dropIdentity ? [spec.entityField] : [],
        seed: spec.seed,
      };
    });
    const interactiveResultWithoutHash = {
      schemaVersion: "2" as const,
      concept: "entity_leakage" as const,
      planId: interactiveBundle.experimentPlan.planId,
      sessionId,
      artifactManifestHash: manifestHash,
      conceptPackVersion: interactiveBundle.experimentPlan.conceptPackVersion,
      fixture: sampleResult.fixture,
      kernelVersion: sampleResult.kernelVersion,
      seed: interactiveBundle.experimentPlan.baseline.seed,
      runs: interactiveRuns,
      chartData: interactiveRuns.map((run) => ({
        runId: run.id,
        splitStrategy: run.splitStrategy,
        accuracy: run.metrics.accuracy,
        rocAuc: run.metrics.rocAuc,
        sampleSize: run.sampleSizes.test,
        seed: run.seed,
      })),
    };
    const interactiveResult = {
      ...interactiveResultWithoutHash,
      resultHash: await hashCanonical(interactiveResultWithoutHash),
    };
    const interactiveResultText = JSON.stringify(interactiveResult);
    const interactiveResultFileHash = await sha256Text(interactiveResultText);
    expect(
      (
        await app.request(
          `/api/runner/jobs/${interactiveDispatch.job.jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...interactiveAuthorization,
              "content-type": "application/json",
            },
            body: interactiveResultText,
          },
        )
      ).status,
    ).toBe(201);
    const interactiveCallback = await postJson(
      app,
      `/api/runner/jobs/${interactiveDispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_interactive_run_1",
        idempotencyKey: "interactive-run-complete-1",
        jobId: interactiveDispatch.job.jobId,
        stateVersion: interactiveDispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [interactiveResultFileHash],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:03.000Z",
      },
      interactiveAuthorization,
    );
    expect(interactiveCallback.status).toBe(200);
    await expect(interactiveCallback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "EXPERIMENT_COMPLETED",
          verifiedResult: { resultHash: liveResult.resultHash },
        },
        verification: { status: "VERIFIED" },
      },
    });

    const interactiveResponse = await app.request(
      `/api/sessions/${sessionId}/jobs/${interactiveDispatch.job.jobId}/result`,
    );
    expect(interactiveResponse.status).toBe(200);
    await expect(interactiveResponse.json()).resolves.toMatchObject({
      ok: true,
      data: {
        result: { resultHash: interactiveResult.resultHash },
        selectedRunId: interactiveBody.data.selectedRunId,
        configurationHash: interactiveBody.data.configurationHash,
        verification: { status: "VERIFIED" },
      },
    });
    const storedAfterInteractive =
      await harness.sessionRepository.find(sessionId);
    expect(storedAfterInteractive?.verifiedResult?.resultHash).toBe(
      liveResult.resultHash,
    );

    const revised = await postJson(app, `/api/sessions/${sessionId}/revision`, {
      revision:
        "Evaluation units must match deployment units, so complete accounts must be held out together.",
    });
    expect(revised.status).toBe(200);
    const transferred = await postJson(
      app,
      `/api/sessions/${sessionId}/transfer`,
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: [
          "center_true_uses_later_targets",
          "random_split_mixes_dates",
        ],
      },
    );
    expect(transferred.status).toBe(200);
    const transferredBody = (await transferred.json()) as {
      data: { transferResult: { resultHash: string } };
    };
    expect(transferredBody).toMatchObject({
      data: {
        state: "TRANSFER_PASSED",
        transferResult: {
          outcome: "PASSED",
          evaluatorVersion: "counterlab-transfer-v1",
        },
      },
    });

    const patchQueued = await postJson(
      app,
      `/api/sessions/${sessionId}/patch/compile`,
    );
    expect(patchQueued.status).toBe(202);
    const patchQueuedBody = (await patchQueued.json()) as {
      data: { state: string; runnerJob: RunnerJob };
    };
    expect(patchQueuedBody.data).toMatchObject({
      state: "PATCH_COMPILING",
      runnerJob: {
        kind: "PATCH_COMPILE",
        status: "STARTING",
        artifactId: uploaded.artifactId,
      },
    });
    expect(dispatcher.dispatched).toHaveLength(4);
    const patchDispatch = dispatcher.dispatched[3];
    if (patchDispatch === undefined) {
      throw new Error("patch runner was not dispatched");
    }
    const patchAuthorization = {
      authorization: `Bearer ${patchDispatch.token}`,
    };
    expect(
      (
        await app.request(`/api/runner/jobs/${patchDispatch.job.jobId}/start`, {
          method: "POST",
          headers: patchAuthorization,
        })
      ).status,
    ).toBe(200);
    const sourceBeforeVerification = await app.request(
      `/api/runner/jobs/${patchDispatch.job.jobId}/source`,
      { headers: patchAuthorization },
    );
    expect(sourceBeforeVerification.status).toBe(409);

    const patchPlan = {
      schemaVersion: "1" as const,
      planId: "patch_plan_hosted_1",
      sessionId,
      concept: "entity_leakage" as const,
      conceptPackVersion: "2.0.0",
      artifactManifestHash: manifestHash,
      sourceArtifactHash: uploaded.fileSha256,
      transferResultHash: transferredBody.data.transferResult.resultHash,
      verifiedResultHash: liveResult.resultHash,
      evidenceRefs: lesson.beliefTest.evidenceRefs,
      targetCells: [3],
      entityField: uploaded.schemaSummary.entityCandidates[0],
      targetField: uploaded.schemaSummary.targetCandidates[0],
      operations: [
        {
          id: "replace_row_split_with_group_holdout" as const,
          cellIndex: 3,
          reason: "Evaluate complete customers together.",
        },
        {
          id: "exclude_entity_feature" as const,
          cellIndex: 3,
          reason: "Remove customer identity from model features.",
        },
      ],
      preserveUnrelatedCells: true as const,
      nonClaims: ["This does not establish production performance."],
    };
    const patchPlanText = JSON.stringify(patchPlan);
    const patchPlanFileHash = await sha256Text(patchPlanText);
    expect(
      (
        await app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/patch-plan.json`,
          {
            method: "PUT",
            headers: {
              ...patchAuthorization,
              "content-type": "application/json",
            },
            body: patchPlanText,
          },
        )
      ).status,
    ).toBe(201);
    const patchCandidate = await postJson(
      app,
      `/api/runner/jobs/${patchDispatch.job.jobId}/candidate`,
      { attempt: 1, planSha256: patchPlanFileHash },
      patchAuthorization,
    );
    expect(patchCandidate.status).toBe(200);
    await expect(patchCandidate.json()).resolves.toMatchObject({
      data: {
        status: "VERIFIED",
        verification: { status: "VERIFIED" },
      },
    });
    const scopedSource = await app.request(
      `/api/runner/jobs/${patchDispatch.job.jobId}/source`,
      { headers: patchAuthorization },
    );
    expect(scopedSource.status).toBe(200);
    await expect(scopedSource.text()).resolves.toBe(sourceNotebookText);

    const livePatchResult = await createSamplePatchResult(
      sessionId,
      uploaded.fileSha256,
      "2026-07-14T10:00:00.000Z",
    );
    const patchResultText = JSON.stringify(livePatchResult);
    const patchResultFileHash = await sha256Text(patchResultText);
    const patchedNotebookFileHash = await sha256Text(patchedNotebookText);
    expect(
      (
        await app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/patched-notebook.ipynb`,
          {
            method: "PUT",
            headers: {
              ...patchAuthorization,
              "content-type": "application/x-ipynb+json",
            },
            body: patchedNotebookText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/patch-result.json`,
          {
            method: "PUT",
            headers: {
              ...patchAuthorization,
              "content-type": "application/json",
            },
            body: patchResultText,
          },
        )
      ).status,
    ).toBe(201);
    const patchCallback = await postJson(
      app,
      `/api/runner/jobs/${patchDispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_hosted_patch_1",
        idempotencyKey: "hosted-patch-complete-1",
        jobId: patchDispatch.job.jobId,
        stateVersion: patchDispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [
          patchPlanFileHash,
          patchedNotebookFileHash,
          patchResultFileHash,
        ],
        finalEventCursor: 1,
        occurredAt: "2026-07-14T10:00:03.000Z",
      },
      patchAuthorization,
    );
    expect(patchCallback.status).toBe(200);
    const patchCallbackPayload = (await patchCallback.json()) as {
      data: { session: { proofBundle: unknown } };
    };
    expect(patchCallbackPayload).toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "REASONING_DIFF_ISSUED",
          artifactId: uploaded.artifactId,
          patchResult: {
            sourceArtifactHash: uploaded.fileSha256,
            patchedArtifactHash: patchedNotebookFileHash,
          },
          reasoningDiff: { sessionId, schemaVersion: "1" },
          proofBundle: {
            sessionId,
            schemaVersion: "2",
            sessionMode: "live_notebook",
            replayId: null,
            scientificEngineSnapshotHash:
              scientificEngineSnapshotValue.authorityHash,
          },
        },
        verification: { status: "VERIFIED" },
      },
    });
    expect(() =>
      validateProofBundle(patchCallbackPayload.data.session.proofBundle, {
        scientificEngineSnapshotHash:
          scientificEngineSnapshotValue.authorityHash,
      }),
    ).not.toThrow();
    expect(() =>
      validateProofBundle(patchCallbackPayload.data.session.proofBundle, {
        scientificEngineSnapshotHash: "f".repeat(64),
      }),
    ).toThrow(/scientific engine snapshot/i);
    const download = await app.request(
      `/api/sessions/${sessionId}/patch/download`,
    );
    expect(download.status).toBe(200);
    expect(download.headers.get("content-disposition")).toContain(
      "uploaded_customer_model.counterlab-patched.ipynb",
    );
    await expect(download.text()).resolves.toBe(patchedNotebookText);
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

  it("fails closed on readiness until the analyst and process runner are usable", async () => {
    const unavailable = await api.request("/ready");
    expect(unavailable.status).toBe(503);
    await expect(unavailable.json()).resolves.toMatchObject({
      status: "not-ready",
      checks: { analyst: false, runner: false },
    });

    const dispatcher = new CapturingRunnerDispatcher();
    const readyApi = createApi({
      sessionRepository: new MemorySessionRepository(),
      artifactStore: new MemoryArtifactStore(),
      runnerJobRepository: new MemoryRunnerJobRepository(),
      runnerObjectStore: new MemoryRunnerObjectStore(),
      runnerDispatcher: dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    });
    const response = await readyApi.request("/ready", undefined, {
      OPENAI_API_KEY: "configured-server-key",
    } as unknown as Env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      service: "counterlab-control-plane",
      checks: {
        analyst: true,
        persistence: true,
        privateStorage: true,
        runner: true,
        signing: true,
      },
    });
  });

  it("reuses an active compile submission and cancels the process job once", async () => {
    const harness = await preparedHostedRunner("session_idempotent_compile");
    const firstBody = (await harness.queued.json()) as {
      data: { runnerJob: RunnerJob };
    };

    const duplicate = await postJson(
      harness.app,
      `/api/sessions/${firstBody.data.runnerJob.sessionId}/lab/compile`,
    );
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: {
        runnerJob: { jobId: firstBody.data.runnerJob.jobId },
        reused: true,
      },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(1);

    const cancelPath = `/api/sessions/${firstBody.data.runnerJob.sessionId}/jobs/${firstBody.data.runnerJob.jobId}/cancel`;
    const cancelled = await postJson(harness.app, cancelPath);
    expect(cancelled.status).toBe(200);
    await expect(cancelled.json()).resolves.toMatchObject({
      data: { runnerJob: { status: "CANCELLED" } },
    });
    expect(harness.dispatcher.cancelled).toHaveLength(1);

    const duplicateCancel = await postJson(harness.app, cancelPath);
    expect(duplicateCancel.status).toBe(200);
    await expect(duplicateCancel.json()).resolves.toMatchObject({
      data: { runnerJob: { status: "CANCELLED" }, reused: true },
    });
    expect(harness.dispatcher.cancelled).toHaveLength(1);
  });

  it("redelivers the same compile job after an ambiguous dispatch without creating a second job", async () => {
    const dispatcher = new CapturingRunnerDispatcher(1);
    const harness = await preparedHostedRunner(
      "session_dispatch_recovery",
      dispatcher,
    );
    expect(harness.queued.status).toBe(503);
    const firstAttempt = dispatcher.dispatched[0];
    if (firstAttempt === undefined)
      throw new Error("first dispatch was missing");
    await expect(
      harness.runnerJobs.find(firstAttempt.job.jobId),
    ).resolves.toMatchObject({
      status: "STARTING",
    });

    const retry = await postJson(
      harness.app,
      `/api/sessions/${firstAttempt.job.sessionId}/lab/compile`,
    );

    expect(retry.status).toBe(202);
    await expect(retry.json()).resolves.toMatchObject({
      data: {
        reused: true,
        runnerJob: {
          jobId: firstAttempt.job.jobId,
          status: "STARTING",
        },
      },
    });
    expect(dispatcher.dispatched).toHaveLength(2);
    expect(dispatcher.dispatched[1]?.job.jobId).toBe(firstAttempt.job.jobId);
    expect(dispatcher.dispatched[1]?.token).not.toBe(firstAttempt.token);
  });

  it("projects a timed-out compile job into the session exactly once", async () => {
    const harness = await preparedHostedRunner("session_timeout_projection");
    const queued = (await harness.queued.clone().json()) as {
      data: { runnerJob: RunnerJob };
    };
    const timeoutApi = createApi({
      sessionRepository: harness.sessionRepository,
      artifactStore: harness.artifactStore,
      runnerJobRepository: harness.runnerJobs,
      runnerObjectStore: harness.runnerObjects,
      runnerDispatcher: harness.dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
      now: () => new Date("2026-07-14T10:04:00.000Z"),
      id: (prefix) => `${prefix}_timeout_projection`,
    });
    const eventsPath = `/api/sessions/${queued.data.runnerJob.sessionId}/jobs/${queued.data.runnerJob.jobId}/events`;
    const eventCountBeforeTimeout = (
      await harness.sessionRepository.listEvents(
        queued.data.runnerJob.sessionId,
      )
    ).length;

    const timedOut = await timeoutApi.request(eventsPath);
    expect(timedOut.status).toBe(200);
    await expect(timedOut.json()).resolves.toMatchObject({
      data: {
        jobStatus: "TIMED_OUT",
        terminal: true,
        jobError: { code: "RUNNER_JOB_TIMED_OUT" },
      },
    });
    await expect(
      harness.sessionRepository.find(queued.data.runnerJob.sessionId),
    ).resolves.toMatchObject({ state: "LAB_REJECTED" });

    const repeated = await timeoutApi.request(eventsPath);
    expect(repeated.status).toBe(200);
    await expect(
      harness.sessionRepository.listEvents(queued.data.runnerJob.sessionId),
    ).resolves.toHaveLength(eventCountBeforeTimeout + 1);
  });

  it("makes authoritative cancellation win even when runner acknowledgement fails", async () => {
    const harness = await preparedHostedRunner("session_cancel_authority");
    const queued = (await harness.queued.json()) as {
      data: { runnerJob: RunnerJob };
    };
    harness.dispatcher.cancel = () =>
      Promise.reject(new Error("runner unavailable"));

    const response = await postJson(
      harness.app,
      `/api/sessions/${queued.data.runnerJob.sessionId}/jobs/${queued.data.runnerJob.jobId}/cancel`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        state: "LAB_REJECTED",
        runnerJob: { status: "CANCELLED" },
        runnerAcknowledged: false,
      },
    });
    await expect(
      harness.runnerJobs.find(queued.data.runnerJob.jobId),
    ).resolves.toMatchObject({ status: "CANCELLED" });
  });

  it("keeps private operational diagnostics secret-protected and identifier-free", async () => {
    const secret = "diagnostic-secret-that-is-long-enough";
    const diagnostics = summarizeOperationalRows(
      [],
      "2026-07-15T10:00:00.000Z",
    );
    const protectedApi = createApi({
      adminDiagnosticSecret: secret,
      operationalDiagnostics: () => Promise.resolve(diagnostics),
    });

    const unauthenticated = await protectedApi.request(
      "/api/admin/diagnostics",
    );
    expect(unauthenticated.status).toBe(401);
    await expect(unauthenticated.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "ADMIN_AUTH_REQUIRED" },
    });

    const authenticated = await protectedApi.request("/api/admin/diagnostics", {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(authenticated.status).toBe(200);
    const body = await authenticated.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        schemaVersion: "1",
        sampledJobs: 0,
        privacy: {
          includesNotebookContent: false,
          includesArtifactIdentifiers: false,
          includesSessionIdentifiers: false,
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(secret);

    const hidden = await createApi().request("/api/admin/diagnostics");
    expect(hidden.status).toBe(404);
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

  it("reports a process runner only when dispatch and signing are both configured", async () => {
    const response = await api.request("/api/health", undefined, {
      COUNTERLAB_RUNNER_BASE_URL: "http://127.0.0.1:8788",
      COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    } as unknown as Env & Record<string, string>);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        liveCodex: "configured",
        liveKernel: "configured",
        sandbox: "configured",
      },
    });

    const unsigned = await api.request("/api/health", undefined, {
      COUNTERLAB_RUNNER_BASE_URL: "http://127.0.0.1:8788",
    } as unknown as Env & Record<string, string>);
    await expect(unsigned.json()).resolves.toMatchObject({
      data: { liveCodex: "local-runner-required" },
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
    const learnerClaim =
      "The notebook accuracy proves generalization to new customers.";

    const response = await app.request(
      `/api/sessions/${sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          await liveBeliefInput(app, sessionId, learnerClaim),
        ),
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
    const learnerClaim =
      "The notebook accuracy proves generalization to new customers.";
    const beliefInput = await liveBeliefInput(app, sessionId, learnerClaim);
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
          body: JSON.stringify(beliefInput),
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
    const learnerClaim =
      "The notebook accuracy proves generalization to new customers.";
    const beliefInput = await liveBeliefInput(app, sessionId, learnerClaim);

    const response = await app.request(
      `/api/sessions/${sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(beliefInput),
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
          "a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94",
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
