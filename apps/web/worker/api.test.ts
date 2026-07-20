// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import {
  BoundaryMapResultV1Schema,
  DiscriminationContractV1Schema,
  HostedExperimentLineageV5Schema,
  type ArtifactManifest,
  type BeliefTest,
  type ExperimentPlanV2,
  type HostedVerifiedResultSetV2,
  HostedVerifiedResultSetV2Schema,
  type LearnerInteractionRecord,
  type PublicCompilerEvent,
  PublicReplayProjectionV1Schema,
  type RunnerCallback,
  type RunnerJob,
  type RunnerJobKind,
  RunnerJobSchema,
  RunnerLabRunBundleSchema,
  RunnerPatchCompileBundleSchema,
} from "@counterlab/contracts";
import { LabSceneV2Schema } from "@counterlab/generative-ui-contracts";
import type {
  CounterLabSession,
  EvidenceEvent,
  RunnerJobRepository,
  SessionMode,
  SessionRepository,
} from "@counterlab/session-core";
import {
  SessionAlreadyExistsError,
  SessionService,
  createEvidenceEvent,
  hashCanonical,
} from "@counterlab/session-core";
import { validateProofBundle } from "@counterlab/proof-bundle";
import {
  validatePublicReplayProjectionV1,
  validateProofCapsulePayloadAuthorityV2,
  validateProofCapsuleV2,
} from "@counterlab/proof-capsule";
import { runProofCapsuleCli } from "@counterlab/proof-capsule/node-cli";
import { schemaSummaryHash } from "@counterlab/belief-analyst";
import { getConceptPack } from "@counterlab/concept-registry";
import { verifyScientificCandidateV5 } from "@counterlab/plan-verifier";
import {
  ExperimentIRV5Schema,
  RunnerBoundaryMapBundleV5Schema,
  RunnerLabCompileBundleV5Schema,
  RunnerLabInteractiveRunBundleV5Schema,
  RunnerLabRunBundleV5Schema,
  RunnerPatchCompileBundleV5Schema,
  hashExperimentIR,
  type RunnerLabCompileBundleV5,
  type RunnerBoundaryMapBundleV5,
  type RunnerLabInteractiveRunBundleV5,
  type RunnerLabRunBundleV5,
} from "@counterlab/experiment-ir";

import sourceNotebookText from "../../../fixtures/notebooks/customer_churn_leakage.ipynb?raw";
import imbalanceNotebookText from "../../../fixtures/notebooks/fraud_class_imbalance.ipynb?raw";
import imbalanceResultText from "../../../fixtures/public/imbalance_verified_result.json?raw";
import patchedNotebookText from "../../../fixtures/public/leakage_sample_patch_v1/customer_churn_leakage.patched.ipynb?raw";
import scientificEngineSnapshotValue from "../../../scientific-engines/snapshot-hash.json";

import { api, createApi } from "./api";
import type {
  AdmissionControl,
  AdmissionDecision,
  AdmissionRelease,
  AdmissionRequest,
} from "./admission-control";
import {
  hashOwnerCapability,
  type OwnerCapabilityRecord,
  type OwnerCapabilityRepository,
} from "./access-control";
import type { ArtifactStore, StoredArtifact } from "./artifact-store";
import { ConcurrentD1SessionUpdateError } from "./d1-session-repository";
import type { LearnerInteractionRepository } from "./learner-interaction-repository";
import {
  ReplayPublicationExpiredError,
  ReplayPublicationRevokedError,
  type ProofCapsuleReplayRecordV2,
} from "./replay-repository";
import { sampleResult } from "./sample-evidence";
import { createSamplePatchResult } from "./sample-learning-loop";
import type {
  RunnerDispatchRequest,
  RunnerDispatcher,
  RunnerObjectStore,
} from "./runner-control-plane";
import {
  generateRunnerJobTokenKeyPair,
  verifyRunnerJobToken,
} from "./runner-token";
import { summarizeOperationalRows } from "./operational-diagnostics";
import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";
import { canonicalUploadRequestBinding } from "../shared/upload-operation";

const {
  privateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
  publicKey: TEST_RUNNER_VERIFYING_PUBLIC_KEY,
} = await generateRunnerJobTokenKeyPair();
const LIVE_LEAKAGE_PACK_VERSION = getConceptPack("entity_leakage").version;
const LIVE_IMBALANCE_PACK_VERSION = getConceptPack("class_imbalance").version;

function recursiveObjectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => recursiveObjectKeys(item));
  }
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, nested]) => [
    key,
    ...recursiveObjectKeys(nested),
  ]);
}

class MemorySessionRepository implements SessionRepository {
  private readonly sessions = new Map<string, CounterLabSession>();
  private readonly eventLog = new Map<string, EvidenceEvent[]>();

  async create(
    session: CounterLabSession,
    firstEvent: EvidenceEvent,
  ): Promise<void> {
    if (this.sessions.has(session.id)) {
      throw new SessionAlreadyExistsError(session.id);
    }
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

  replaceEventsForIntegrityTest(
    sessionId: string,
    events: readonly EvidenceEvent[],
  ): void {
    this.eventLog.set(sessionId, structuredClone([...events]));
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

class StableMemoryArtifactStore implements ArtifactStore {
  private readonly artifacts = new Map<string, StoredArtifact>();
  readonly saves: Array<{ manifest: ArtifactManifest; objectKey?: string }> =
    [];

  async save(
    manifest: ArtifactManifest,
    objectKey?: string,
  ): Promise<StoredArtifact> {
    this.saves.push({
      manifest: structuredClone(manifest),
      ...(objectKey === undefined ? {} : { objectKey }),
    });
    const existing = this.artifacts.get(manifest.artifactId);
    const stored =
      existing === undefined
        ? {
            manifest: structuredClone(manifest),
            ...(objectKey === undefined ? {} : { objectKey }),
          }
        : {
            manifest: existing.manifest,
            ...(existing.objectKey === undefined && objectKey !== undefined
              ? { objectKey }
              : existing.objectKey === undefined
                ? {}
                : { objectKey: existing.objectKey }),
          };
    this.artifacts.set(manifest.artifactId, structuredClone(stored));
    return structuredClone(stored);
  }

  async find(artifactId: string): Promise<StoredArtifact | undefined> {
    return structuredClone(this.artifacts.get(artifactId));
  }
}

class MemoryProofCapsuleReplayRepository {
  private readonly records = new Map<string, ProofCapsuleReplayRecordV2>();
  private readonly revoked = new Set<string>();

  async createOrReuse(
    record: ProofCapsuleReplayRecordV2,
    now: string,
  ): Promise<{ record: ProofCapsuleReplayRecordV2; reused: boolean }> {
    const existing = [...this.records.values()].find(
      (candidate) => candidate.sourceSessionId === record.sourceSessionId,
    );
    if (existing !== undefined) {
      if (this.revoked.has(existing.replayId)) {
        throw new ReplayPublicationRevokedError(record.sourceSessionId);
      }
      if (existing.expiresAt <= now) {
        throw new ReplayPublicationExpiredError(record.sourceSessionId);
      }
      if (
        existing.capsuleId !== record.capsuleId ||
        existing.objectKey !== record.objectKey
      ) {
        throw new Error("conflicting replay publication");
      }
      return { record: structuredClone(existing), reused: true };
    }
    this.records.set(record.replayId, structuredClone(record));
    return { record: structuredClone(record), reused: false };
  }

  async find(
    replayId: string,
    now: string,
  ): Promise<ProofCapsuleReplayRecordV2 | undefined> {
    const record = this.records.get(replayId);
    return record === undefined ||
      this.revoked.has(replayId) ||
      record.expiresAt <= now
      ? undefined
      : structuredClone(record);
  }

  async statusBySourceSession(
    sourceSessionId: string,
    now: string,
  ): Promise<
    | {
        record: ProofCapsuleReplayRecordV2;
        status: "active" | "revoked" | "expired";
      }
    | undefined
  > {
    const record = [...this.records.values()].find(
      (candidate) => candidate.sourceSessionId === sourceSessionId,
    );
    return record === undefined
      ? undefined
      : {
          record: structuredClone(record),
          status: this.revoked.has(record.replayId)
            ? "revoked"
            : record.expiresAt <= now
              ? "expired"
              : "active",
        };
  }

  async revokeBySourceSession(
    sourceSessionId: string,
    _eventId: string,
    _revokedAt: string,
  ): Promise<{ replayId: string; revoked: boolean } | undefined> {
    const record = [...this.records.values()].find(
      (candidate) => candidate.sourceSessionId === sourceSessionId,
    );
    if (record === undefined) return undefined;
    const revoked = !this.revoked.has(record.replayId);
    this.revoked.add(record.replayId);
    return { replayId: record.replayId, revoked };
  }
}

class MemoryLearnerInteractionRepository implements LearnerInteractionRepository {
  readonly records = new Map<string, LearnerInteractionRecord>();

  append(record: LearnerInteractionRecord): Promise<{ duplicate: boolean }> {
    const existing = this.records.get(record.eventId);
    if (existing !== undefined) {
      if (
        existing.sessionId !== record.sessionId ||
        JSON.stringify(existing.interaction) !==
          JSON.stringify(record.interaction)
      ) {
        throw new Error("interaction ID conflict");
      }
      return Promise.resolve({ duplicate: true });
    }
    this.records.set(record.eventId, structuredClone(record));
    return Promise.resolve({ duplicate: false });
  }
}

class MemoryOwnerCapabilityRepository implements OwnerCapabilityRepository {
  private readonly artifacts = new Map<string, OwnerCapabilityRecord>();
  private readonly sessions = new Map<string, OwnerCapabilityRecord>();
  readonly artifactCreates: OwnerCapabilityRecord[] = [];

  async createArtifact(record: OwnerCapabilityRecord): Promise<void> {
    this.artifactCreates.push(structuredClone(record));
    this.artifacts.set(
      `${record.resourceId}:${record.tokenHash}`,
      structuredClone(record),
    );
  }

  findArtifact(
    artifactId: string,
    tokenHash: string,
  ): Promise<OwnerCapabilityRecord | undefined> {
    return Promise.resolve(
      structuredClone(this.artifacts.get(`${artifactId}:${tokenHash}`)),
    );
  }

  async createSession(record: OwnerCapabilityRecord): Promise<void> {
    this.sessions.set(record.resourceId, structuredClone(record));
  }

  findSession(sessionId: string): Promise<OwnerCapabilityRecord | undefined> {
    return Promise.resolve(structuredClone(this.sessions.get(sessionId)));
  }

  async revokeSession(sessionId: string, revokedAt: string): Promise<boolean> {
    const current = this.sessions.get(sessionId);
    if (current === undefined || current.revokedAt !== undefined) return false;
    this.sessions.set(sessionId, { ...current, revokedAt });
    return true;
  }
}

class RecoverableOwnerCapabilityRepository extends MemoryOwnerCapabilityRepository {
  private failNextSessionInsert = false;

  failNextSessionCapabilityInsert(): void {
    this.failNextSessionInsert = true;
  }

  override async createSession(record: OwnerCapabilityRecord): Promise<void> {
    if (this.failNextSessionInsert) {
      this.failNextSessionInsert = false;
      throw new Error("simulated capability insert failure");
    }
    await super.createSession(record);
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
  private mutateHistoryAtSnapshotEnd = false;
  private historyReads = 0;

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
    this.historyReads += 1;
    if (this.mutateHistoryAtSnapshotEnd && this.historyReads % 2 === 0) {
      const current = [...this.jobs.values()].find(
        (job) => job.sessionId === sessionId,
      );
      if (current !== undefined) {
        this.jobs.set(current.jobId, {
          ...current,
          jobVersion: current.jobVersion + 1,
          updatedAt: new Date(Date.parse(current.updatedAt) + 1).toISOString(),
        });
      }
    }
    return structuredClone(
      [...this.jobs.values()].filter((job) => job.sessionId === sessionId),
    );
  }

  mutateEveryHistorySnapshotEnd(): void {
    this.mutateHistoryAtSnapshotEnd = true;
    this.historyReads = 0;
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

  replaceEventsForIntegrityTest(
    jobId: string,
    events: readonly PublicCompilerEvent[],
  ): void {
    this.events.set(jobId, structuredClone([...events]));
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

class InterruptibleRunnerJobRepository extends MemoryRunnerJobRepository {
  private authorityAppendsUntilFailure: number | undefined;

  interruptAfterAuthorityAppends(count: number): void {
    this.authorityAppendsUntilFailure = count;
  }

  override async appendEvent(
    job: RunnerJob,
    expectedVersion: number,
    event: PublicCompilerEvent,
  ): Promise<void> {
    if (this.authorityAppendsUntilFailure !== undefined) {
      this.authorityAppendsUntilFailure -= 1;
      if (this.authorityAppendsUntilFailure === 0) {
        this.authorityAppendsUntilFailure = undefined;
        throw new Error("simulated authority event interruption");
      }
    }
    await super.appendEvent(job, expectedVersion, event);
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

class CapturingAdmissionControl implements AdmissionControl {
  readonly admitted: AdmissionRequest[] = [];
  readonly released: AdmissionRelease[] = [];
  private decisionIndex = 0;
  private readonly decisions: readonly AdmissionDecision[];

  constructor(
    decision: AdmissionDecision | readonly AdmissionDecision[] = {
      admitted: true,
      reused: false,
      leaseStatus: "acquired",
      leaseExpiresAt: Date.parse("2026-07-14T10:15:00.000Z"),
    },
  ) {
    this.decisions = Array.isArray(decision) ? decision : [decision];
  }

  admit(input: AdmissionRequest): Promise<AdmissionDecision> {
    this.admitted.push(structuredClone(input));
    const decision =
      this.decisions[
        Math.min(this.decisionIndex, Math.max(0, this.decisions.length - 1))
      ];
    this.decisionIndex += 1;
    if (decision === undefined) {
      throw new Error("test admission control has no decision");
    }
    return Promise.resolve(structuredClone(decision));
  }

  release(input: AdmissionRelease): Promise<void> {
    this.released.push(structuredClone(input));
    return Promise.resolve();
  }
}

async function sessionHarness(
  mode: "sample" | "live",
  sessionRepository: MemorySessionRepository = new MemorySessionRepository(),
) {
  const artifactStore = new MemoryArtifactStore();
  const runnerJobs = new MemoryRunnerJobRepository();
  let idSequence = 0;
  const app = createApi({
    sessionRepository,
    artifactStore,
    runnerJobRepository: runnerJobs,
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
    runnerJobs,
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
  admissionControl?: CapturingAdmissionControl,
) {
  const harness = await sessionHarness("sample");
  const sampleRoute = `/api/sessions/${harness.sessionId}`;
  await postJson(harness.app, `${sampleRoute}/belief-test`, {
    learnerClaim: SAMPLE_LEAKAGE_QUESTION,
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
    ...(admissionControl === undefined
      ? {}
      : {
          admissionControl,
          admissionHmacKey:
            "contained-api-admission-test-key-with-at-least-32-characters",
          admissionCaller: () => "203.0.113.8",
        }),
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

function liveBeliefSpecWire(artifact: ArtifactManifest) {
  const codeCell = artifact.cells.find((cell) =>
    cell.symbols.includes("train_test_split"),
  );
  if (codeCell === undefined) throw new Error("split evidence is missing");
  const codeEvidence = {
    cellIndex: codeCell.index,
    outputIndex: null,
    kind: "code" as const,
    hash: codeCell.sourceSha256,
    excerpt: "train_test_split",
    relevance: "The evaluation splits rows rather than complete entities.",
  };
  const schemaEvidence = {
    cellIndex: null,
    outputIndex: null,
    kind: "schema" as const,
    hash: schemaSummaryHash(artifact.schemaSummary),
    excerpt: "customer_id",
    relevance: "The schema exposes the deployment entity boundary.",
  };
  return {
    schemaVersion: "2" as const,
    evidenceRefs: [codeEvidence, schemaEvidence],
    hypotheses: [
      {
        id: "current" as const,
        statement: "The model generalizes to unseen customers.",
        conditions: ["Random rows represent future customer deployment."],
        nonClaims: ["This does not establish performance for every cohort."],
        evidence: [codeEvidence],
        supportedCandidateExperimentIds: [
          "group-holdout",
          "group-holdout-plus-ablation",
        ],
      },
      {
        id: "competing" as const,
        statement: "Repeated customer identity inflates row-split accuracy.",
        conditions: ["Customer observations recur across the split."],
        nonClaims: ["This does not prove all non-identity signal is absent."],
        evidence: [schemaEvidence],
        supportedCandidateExperimentIds: [
          "group-holdout",
          "group-holdout-plus-ablation",
        ],
      },
    ],
    alternatives: [],
    uncertainty: 0.14,
    supportState: "SUPPORTED" as const,
  };
}

function liveImbalanceBeliefSpecWire(artifact: ArtifactManifest) {
  const prevalenceCell = artifact.cells.find((cell) =>
    cell.metricCandidates.some((metric) => metric.name === "positive_rate"),
  );
  const accuracyCell = artifact.cells.find((cell) =>
    cell.metricCandidates.some((metric) => metric.name === "accuracy"),
  );
  if (prevalenceCell === undefined || accuracyCell === undefined) {
    throw new Error("class-imbalance evidence is missing");
  }
  const prevalenceEvidence = {
    cellIndex: prevalenceCell.index,
    outputIndex: 0,
    kind: "metric" as const,
    hash: prevalenceCell.outputHashes[0]!,
    excerpt: "positive_rate = 0.025",
    relevance: "The displayed prevalence establishes a rare positive class.",
  };
  const accuracyEvidence = {
    cellIndex: accuracyCell.index,
    outputIndex: 0,
    kind: "metric" as const,
    hash: accuracyCell.outputHashes[0]!,
    excerpt: "accuracy = 0.975",
    relevance: "The learner relies on aggregate accuracy.",
  };
  const candidateExperimentIds = [
    "threshold-and-majority-baseline",
    "prevalence-and-threshold-sweep",
  ];
  return {
    schemaVersion: "2" as const,
    evidenceRefs: [prevalenceEvidence, accuracyEvidence],
    hypotheses: [
      {
        id: "current" as const,
        statement: "High accuracy reflects useful minority detection.",
        conditions: ["The rare class is detected at the documented threshold."],
        nonClaims: ["This threshold is not claimed optimal everywhere."],
        evidence: [accuracyEvidence],
        supportedCandidateExperimentIds: candidateExperimentIds,
      },
      {
        id: "competing" as const,
        statement:
          "Class rarity lets a weak majority prediction appear accurate.",
        conditions: ["The positive class is rare in the evaluation set."],
        nonClaims: ["Accuracy is not useless for every balanced task."],
        evidence: [prevalenceEvidence],
        supportedCandidateExperimentIds: candidateExperimentIds,
      },
    ],
    alternatives: [],
    uncertainty: 0.18,
    supportState: "SUPPORTED" as const,
  };
}

function structuredResponsesResult(output: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "resp_worker_v2",
      object: "response",
      status: "completed",
      model: "configured-model",
      output: [
        {
          id: "message_v2",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(output),
              annotations: [],
            },
          ],
        },
      ],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

async function preparedScientificHostedRunner(
  runnerJobs: MemoryRunnerJobRepository = new MemoryRunnerJobRepository(),
) {
  const harness = await sessionHarness("live");
  const storedArtifact = await harness.artifactStore.find(
    "artifact_uploaded_not_sample",
  );
  if (storedArtifact === undefined) throw new Error("live artifact is missing");
  const artifact = {
    ...storedArtifact,
    manifest: {
      ...storedArtifact.manifest,
      fileSha256: await sha256Text(sourceNotebookText),
    },
  };
  await harness.artifactStore.save(artifact.manifest, artifact.objectKey);
  const learnerClaim =
    "The notebook accuracy proves generalization to new customers.";
  const beliefInput = await liveBeliefInput(
    harness.app,
    harness.sessionId,
    learnerClaim,
  );
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      structuredResponsesResult(liveBeliefSpecWire(artifact.manifest)),
    );
  try {
    const proposed = await harness.app.request(
      `/api/sessions/${harness.sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(beliefInput),
      },
      {
        OPENAI_API_KEY: "server-only-key",
        OPENAI_MODEL: "configured-model",
      } as unknown as Env & Record<string, string>,
    );
    expect(proposed.status).toBe(200);
  } finally {
    upstream.mockRestore();
  }
  expect(
    (
      await postJson(
        harness.app,
        `/api/sessions/${harness.sessionId}/belief-test/confirm`,
        { action: "confirm" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await postJson(
        harness.app,
        `/api/sessions/${harness.sessionId}/prediction`,
        {
          choice: "The score survives a whole-customer holdout",
          confidence: 71,
        },
      )
    ).status,
  ).toBe(201);

  const session = await harness.sessionRepository.find(harness.sessionId);
  if (session?.beliefSpec === undefined || session.prediction === undefined) {
    throw new Error("live v5 contracts are missing");
  }
  const runnerObjects = new MemoryRunnerObjectStore();
  if (artifact.objectKey === undefined) {
    throw new Error("live artifact source key is missing");
  }
  await runnerObjects.put(
    artifact.objectKey,
    sourceNotebookText,
    "application/x-ipynb+json; charset=utf-8",
  );
  const dispatcher = new CapturingRunnerDispatcher();
  const replayRepository = new MemoryProofCapsuleReplayRepository();
  let runnerIdSequence = 0;
  const apiOptions = {
    sessionRepository: harness.sessionRepository,
    artifactStore: harness.artifactStore,
    runnerJobRepository: runnerJobs,
    runnerObjectStore: runnerObjects,
    replayRepository,
    runnerDispatcher: dispatcher,
    runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix: string) => `${prefix}_scientific_${++runnerIdSequence}`,
  };
  const app = createApi(apiOptions);
  const queued = await postJson(
    app,
    `/api/sessions/${harness.sessionId}/lab/compile`,
  );
  expect(queued.status).toBe(202);
  const dispatch = dispatcher.dispatched[0];
  if (dispatch === undefined) throw new Error("v5 runner was not dispatched");
  const inputObject = runnerObjects.objects.get(
    `runner-input/${dispatch.job.jobId}.json`,
  );
  if (inputObject === undefined) throw new Error("v5 input bundle is missing");
  const bundle = RunnerLabCompileBundleV5Schema.parse(
    JSON.parse(inputObject.body),
  );
  return {
    ...harness,
    app,
    artifact: artifact.manifest,
    bundle,
    dispatch,
    dispatcher,
    runnerJobs,
    runnerObjects,
    replayRepository,
    session,
  };
}

async function preparedScientificImbalanceHostedRunner(
  runnerJobs: MemoryRunnerJobRepository = new MemoryRunnerJobRepository(),
) {
  const sessionRepository = new MemorySessionRepository();
  const artifactStore = new MemoryArtifactStore();
  const artifact = {
    ...imbalanceArtifactManifest(),
    fileSha256: await sha256Text(imbalanceNotebookText),
  };
  await artifactStore.save(artifact, "uploads/rare-event-classifier.ipynb");
  let intakeIdSequence = 0;
  const intakeApp = createApi({
    sessionRepository,
    artifactStore,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix) => `${prefix}_imbalance_${++intakeIdSequence}`,
  });
  const created = await postJson(intakeApp, "/api/live/sessions", {
    artifactId: artifact.artifactId,
  });
  expect(created.status).toBe(201);
  const createdBody = (await created.json()) as {
    data: { sessionId: string };
  };
  const sessionId = createdBody.data.sessionId;
  const learnerClaim =
    "The high accuracy proves the classifier catches rare fraud.";
  const beliefInput = await liveBeliefInput(intakeApp, sessionId, learnerClaim);
  const upstream = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(
      structuredResponsesResult(liveImbalanceBeliefSpecWire(artifact)),
    );
  try {
    const proposed = await intakeApp.request(
      `/api/sessions/${sessionId}/belief-test`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(beliefInput),
      },
      {
        OPENAI_API_KEY: "server-only-key",
        OPENAI_MODEL: "configured-model",
      } as unknown as Env & Record<string, string>,
    );
    expect(proposed.status).toBe(200);
  } finally {
    upstream.mockRestore();
  }
  expect(
    (
      await postJson(
        intakeApp,
        `/api/sessions/${sessionId}/belief-test/confirm`,
        { action: "confirm" },
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await postJson(intakeApp, `/api/sessions/${sessionId}/prediction`, {
        choice: "High accuracy still means useful rare-event detection",
        confidence: 68,
      })
    ).status,
  ).toBe(201);
  const session = await sessionRepository.find(sessionId);
  if (session?.beliefSpec === undefined || session.prediction === undefined) {
    throw new Error("live class-imbalance v5 contracts are missing");
  }

  const runnerObjects = new MemoryRunnerObjectStore();
  await runnerObjects.put(
    "uploads/rare-event-classifier.ipynb",
    imbalanceNotebookText,
    "application/x-ipynb+json; charset=utf-8",
  );
  const dispatcher = new CapturingRunnerDispatcher();
  const replayRepository = new MemoryProofCapsuleReplayRepository();
  let runnerIdSequence = 0;
  const app = createApi({
    sessionRepository,
    artifactStore,
    runnerJobRepository: runnerJobs,
    runnerObjectStore: runnerObjects,
    replayRepository,
    runnerDispatcher: dispatcher,
    runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    now: () => new Date("2026-07-14T10:00:00.000Z"),
    id: (prefix) => `${prefix}_scientific_imbalance_${++runnerIdSequence}`,
  });
  const queued = await postJson(app, `/api/sessions/${sessionId}/lab/compile`);
  expect(queued.status).toBe(202);
  const dispatch = dispatcher.dispatched[0];
  if (dispatch === undefined) {
    throw new Error("class-imbalance v5 runner was not dispatched");
  }
  const inputObject = runnerObjects.objects.get(
    `runner-input/${dispatch.job.jobId}.json`,
  );
  if (inputObject === undefined) {
    throw new Error("class-imbalance v5 input bundle is missing");
  }
  const bundle = RunnerLabCompileBundleV5Schema.parse(
    JSON.parse(inputObject.body),
  );
  return {
    app,
    artifact,
    artifactId: artifact.artifactId,
    artifactStore,
    bundle,
    dispatch,
    dispatcher,
    runnerJobs,
    runnerObjects,
    replayRepository,
    session,
    sessionId,
    sessionRepository,
  };
}

async function scientificCandidateArtifacts(bundle: RunnerLabCompileBundleV5) {
  const transferContract =
    bundle.conceptPack.transferTask?.experimentIrContract;
  if (transferContract === undefined) {
    throw new Error("scientific compiler transfer authority is missing");
  }
  const entityField = bundle.artifactManifest.schemaSummary.entityCandidates[0];
  if (entityField === undefined) throw new Error("entity field is missing");
  const candidateId = "group-holdout-plus-ablation";
  const baseline = {
    concept: "entity_leakage" as const,
    runId: "random_rows",
    operation: "leakage.random_row_split" as const,
    seed: 1729,
    testFraction: 0.25,
    entityField,
    dropIdentity: false,
    model: "logistic_regression" as const,
  };
  const discriminationContract = DiscriminationContractV1Schema.parse({
    schemaVersion: "1",
    contractId: "discrimination.live-v5",
    sessionId: bundle.sessionId,
    concept: bundle.approvedBeliefSpec.concept,
    conceptPackVersion: bundle.conceptPack.version,
    artifactManifestHash: bundle.artifactManifestHash,
    beliefSpecId: bundle.approvedBeliefSpec.id,
    beliefSpecHash: bundle.beliefSpecHash,
    hypotheses: bundle.approvedBeliefSpec.hypotheses.map(
      (hypothesis, index) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        decisivePatternId:
          index === 0 ? "leakage.small-gap" : "leakage.material-gap",
      }),
    ),
    candidateExperimentIds: [candidateId],
    changedVariableIds: ["split_strategy", "identity_feature"],
    controlledVariableIds: [
      "model",
      "seed",
      "test_fraction",
      "entity_field",
      "primary_identity_setting",
      "preprocessing",
      "model_hyperparameters",
    ],
    observableIds: ["accuracy", "roc_auc", "entity_overlap_rate"],
    inconclusiveConditionIds: ["gap-within-tolerance"],
    whyThisTest:
      "Holding model settings fixed while separating complete customers tests the deployment boundary directly.",
    nonClaims: [
      "This test does not establish performance for every future customer.",
    ],
    evidenceRefs: bundle.approvedBeliefSpec.evidenceRefs,
  });
  const experimentIr = ExperimentIRV5Schema.parse({
    schemaVersion: "5",
    irId: "ir.live-v5",
    executionPlanId: "plan_live_v5",
    sessionId: bundle.sessionId,
    concept: bundle.approvedBeliefSpec.concept,
    conceptPackVersion: bundle.conceptPack.version,
    artifactManifestHash: bundle.artifactManifestHash,
    beliefSpecId: bundle.approvedBeliefSpec.id,
    beliefSpecHash: bundle.beliefSpecHash,
    evidenceRefs: bundle.approvedBeliefSpec.evidenceRefs,
    hypotheses: [
      {
        id: "current",
        statement: bundle.approvedBeliefSpec.hypotheses[0].statement,
        conditions: bundle.approvedBeliefSpec.hypotheses[0].conditions,
        nonClaims: bundle.approvedBeliefSpec.hypotheses[0].nonClaims,
        predictedPattern: {
          patternId: "leakage.small-gap",
          description:
            "The optimism gap remains small when complete customers are held out.",
        },
      },
      {
        id: "competing",
        statement: bundle.approvedBeliefSpec.hypotheses[1].statement,
        conditions: bundle.approvedBeliefSpec.hypotheses[1].conditions,
        nonClaims: bundle.approvedBeliefSpec.hypotheses[1].nonClaims,
        predictedPattern: {
          patternId: "leakage.material-gap",
          description:
            "The optimism gap becomes material when complete customers are held out.",
        },
      },
    ],
    candidateExperiments: [
      {
        id: candidateId,
        title: "Whole-customer holdout with identity ablation",
        operationIds: [
          "leakage.random_row_split",
          "leakage.group_holdout",
          "leakage.identity_ablation",
        ],
        baseline,
        interventions: [
          {
            ...baseline,
            runId: "unseen_customers",
            operation: "leakage.group_holdout",
          },
          {
            ...baseline,
            runId: "without_identity",
            operation: "leakage.identity_ablation",
            dropIdentity: true,
          },
        ],
        heldConstantIds: [
          "model",
          "seed",
          "test_fraction",
          "entity_field",
          "primary_identity_setting",
          "preprocessing",
          "model_hyperparameters",
        ],
        changedVariableIds: ["split_strategy", "identity_feature"],
        observableIds: ["accuracy", "roc_auc", "entity_overlap_rate"],
        hypothesisPatterns: [
          { hypothesisId: "current", patternId: "leakage.small-gap" },
          { hypothesisId: "competing", patternId: "leakage.material-gap" },
        ],
        inconclusiveConditionIds: ["gap-within-tolerance"],
        complexityCost: 5,
        discriminatesBecause:
          "Whole-customer holdout changes the evaluation unit while the fixed runs separately test the identity shortcut.",
      },
    ],
    selection: { status: "UNSELECTED" },
    visualizations: ["metric_comparison", "entity_overlap"],
    boundarySweep: bundle.conceptPack.boundarySweep,
    inconclusiveConditions: [
      {
        id: "gap-within-tolerance",
        description:
          "The measured gap falls between the two decisive patterns.",
        nextExperimentId: candidateId,
      },
    ],
    transfer: transferContract,
    nonClaims: [
      "This test does not establish performance for every future customer.",
    ],
    provenance: { kind: "codex", ...bundle.provenance },
    limitations: [
      "The result is scoped to the supplied notebook and fixed kernel.",
    ],
    resourceLimits: bundle.resourceLimits,
  });
  const labScene = LabSceneV2Schema.parse({
    schemaVersion: "2",
    sceneId: "scene-live-v5",
    sessionId: bundle.sessionId,
    concept: bundle.approvedBeliefSpec.concept,
    supportLabel: "GUIDED_VISUAL",
    title: "Does the score survive a whole-customer holdout?",
    blocks: [
      {
        id: "hypotheses",
        type: "Hypothesis",
        current: bundle.approvedBeliefSpec.hypotheses[0].statement,
        competing: bundle.approvedBeliefSpec.hypotheses[1].statement,
      },
      {
        id: "why",
        type: "WhyThisTest",
        text: discriminationContract.whyThisTest,
      },
      {
        id: "familiar-accuracy",
        type: "Metric",
        label: "Familiar-row accuracy",
        resultBinding: "/runs/byId/random_rows/metrics/accuracy",
        unit: "proportion",
      },
      {
        id: "unseen-accuracy",
        type: "Metric",
        label: "Unseen-customer accuracy",
        resultBinding: "/runs/byId/unseen_customers/metrics/accuracy",
        unit: "proportion",
      },
    ],
    assumptions: ["The fixed kernel executes only registered operations."],
    limitations: ["No result is shown before external verification."],
    provenance: {
      discriminationContractHash: await hashCanonical(discriminationContract),
      experimentIrHash: await hashExperimentIR(experimentIr),
    },
  });
  return {
    "discrimination-contract.json": JSON.stringify(discriminationContract),
    "experiment-ir.json": JSON.stringify(experimentIr),
    "lab-scene.json": JSON.stringify(labScene),
    "public-rationale.md":
      "A whole-customer holdout changes the evaluation boundary while fixed controls preserve the comparison.",
  } as const;
}

async function scientificImbalanceCandidateArtifacts(
  bundle: RunnerLabCompileBundleV5,
) {
  const transferContract =
    bundle.conceptPack.transferTask?.experimentIrContract;
  if (transferContract === undefined) {
    throw new Error("scientific compiler transfer authority is missing");
  }
  if (bundle.approvedBeliefSpec.concept !== "class_imbalance") {
    throw new Error("test candidate requires the class-imbalance Subject Pack");
  }
  const candidateId = "threshold-and-majority-baseline";
  const baseline = {
    concept: "class_imbalance" as const,
    runId: "majority_baseline",
    operation: "imbalance.majority_baseline" as const,
    seed: 2603,
    threshold: 0.5,
    prevalenceScenario: "observed" as const,
    model: "majority_baseline" as const,
  };
  const discriminationContract = DiscriminationContractV1Schema.parse({
    schemaVersion: "1",
    contractId: "discrimination.imbalance-live-v5",
    sessionId: bundle.sessionId,
    concept: "class_imbalance",
    conceptPackVersion: bundle.conceptPack.version,
    artifactManifestHash: bundle.artifactManifestHash,
    beliefSpecId: bundle.approvedBeliefSpec.id,
    beliefSpecHash: bundle.beliefSpecHash,
    hypotheses: bundle.approvedBeliefSpec.hypotheses.map(
      (hypothesis, index) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        decisivePatternId:
          index === 0
            ? "imbalance.useful-minority-detection"
            : "imbalance.majority-dominance",
      }),
    ),
    candidateExperimentIds: [candidateId, "prevalence-and-threshold-sweep"],
    changedVariableIds: ["decision_threshold", "class_prevalence"],
    controlledVariableIds: ["model_scores", "seed", "evaluation_set"],
    observableIds: [
      "accuracy",
      "precision",
      "recall",
      "f1",
      "pr_auc",
      "roc_auc",
      "confusion_matrix",
      "prevalence",
    ],
    inconclusiveConditionIds: ["minority-utility-uncertain"],
    whyThisTest:
      "The majority baseline and fixed-score threshold comparison reveal whether aggregate accuracy hides missed rare cases.",
    nonClaims: ["This test does not choose a universal production threshold."],
    evidenceRefs: bundle.approvedBeliefSpec.evidenceRefs,
  });
  const interventions = [
    {
      ...baseline,
      runId: "stratified_model",
      operation: "imbalance.stratified_holdout" as const,
      model: "logistic_regression" as const,
    },
    {
      ...baseline,
      runId: "lower_threshold",
      operation: "imbalance.threshold_sweep" as const,
      model: "logistic_regression" as const,
      threshold: 0.25,
    },
    {
      ...baseline,
      runId: "rarer_prevalence",
      operation: "imbalance.prevalence_sweep" as const,
      model: "logistic_regression" as const,
      threshold: 0.25,
      prevalenceScenario: "rarer" as const,
    },
  ];
  const primaryCandidate = {
    id: candidateId,
    title: "Majority baseline and threshold sensitivity",
    operationIds: [
      "imbalance.majority_baseline" as const,
      "imbalance.stratified_holdout" as const,
      "imbalance.confusion_matrix" as const,
      "imbalance.threshold_sweep" as const,
      "imbalance.prevalence_sweep" as const,
    ],
    baseline,
    interventions,
    heldConstantIds: ["model_scores", "seed", "evaluation_set"],
    changedVariableIds: ["decision_threshold", "class_prevalence"],
    observableIds: [
      "accuracy",
      "precision",
      "recall",
      "f1",
      "pr_auc",
      "roc_auc",
      "confusion_matrix",
      "prevalence",
    ] as const,
    hypothesisPatterns: [
      {
        hypothesisId: "current" as const,
        patternId: "imbalance.useful-minority-detection",
      },
      {
        hypothesisId: "competing" as const,
        patternId: "imbalance.majority-dominance",
      },
    ],
    inconclusiveConditionIds: ["minority-utility-uncertain"],
    complexityCost: 4,
    discriminatesBecause:
      "A majority baseline and a fixed-score threshold sweep expose minority performance hidden by aggregate accuracy.",
  };
  const experimentIr = ExperimentIRV5Schema.parse({
    schemaVersion: "5",
    irId: "ir.imbalance-live-v5",
    executionPlanId: "plan_imbalance_live_v5",
    sessionId: bundle.sessionId,
    concept: "class_imbalance",
    conceptPackVersion: bundle.conceptPack.version,
    artifactManifestHash: bundle.artifactManifestHash,
    beliefSpecId: bundle.approvedBeliefSpec.id,
    beliefSpecHash: bundle.beliefSpecHash,
    evidenceRefs: bundle.approvedBeliefSpec.evidenceRefs,
    hypotheses: [
      {
        id: "current",
        statement: bundle.approvedBeliefSpec.hypotheses[0].statement,
        conditions: bundle.approvedBeliefSpec.hypotheses[0].conditions,
        nonClaims: bundle.approvedBeliefSpec.hypotheses[0].nonClaims,
        predictedPattern: {
          patternId: "imbalance.useful-minority-detection",
          description: "Minority recall and F1 remain useful.",
        },
      },
      {
        id: "competing",
        statement: bundle.approvedBeliefSpec.hypotheses[1].statement,
        conditions: bundle.approvedBeliefSpec.hypotheses[1].conditions,
        nonClaims: bundle.approvedBeliefSpec.hypotheses[1].nonClaims,
        predictedPattern: {
          patternId: "imbalance.majority-dominance",
          description: "Accuracy stays high while minority recall fails.",
        },
      },
    ],
    candidateExperiments: [
      primaryCandidate,
      {
        ...primaryCandidate,
        id: "prevalence-and-threshold-sweep",
        title: "Prevalence and threshold boundary follow-up",
        complexityCost: 6,
      },
    ],
    selection: { status: "UNSELECTED" },
    visualizations: [
      "metric_comparison",
      "confusion_matrix",
      "threshold_curve",
      "prevalence_sensitivity",
    ],
    boundarySweep: bundle.conceptPack.boundarySweep,
    inconclusiveConditions: [
      {
        id: "minority-utility-uncertain",
        description: "Minority utility falls between decisive thresholds.",
        nextExperimentId: "prevalence-and-threshold-sweep",
      },
    ],
    transfer: transferContract,
    nonClaims: ["This test does not choose a universal production threshold."],
    provenance: { kind: "codex", ...bundle.provenance },
    limitations: [
      "The result is scoped to the supplied notebook and fixed kernel.",
    ],
    resourceLimits: bundle.resourceLimits,
  });
  const labScene = LabSceneV2Schema.parse({
    schemaVersion: "2",
    sceneId: "scene-imbalance-live-v5",
    sessionId: bundle.sessionId,
    concept: "class_imbalance",
    supportLabel: "GUIDED_VISUAL",
    title: "Does accuracy hide missed rare cases?",
    blocks: [
      {
        id: "hypotheses",
        type: "Hypothesis",
        current: bundle.approvedBeliefSpec.hypotheses[0].statement,
        competing: bundle.approvedBeliefSpec.hypotheses[1].statement,
      },
      {
        id: "why",
        type: "WhyThisTest",
        text: discriminationContract.whyThisTest,
      },
      {
        id: "headline-accuracy",
        type: "Metric",
        label: "Majority-baseline accuracy",
        resultBinding: "/runs/byId/majority_baseline/metrics/accuracy",
        unit: "proportion",
      },
      {
        id: "rare-recall",
        type: "Metric",
        label: "Rare-class recall",
        resultBinding: "/runs/byId/stratified_model/metrics/recall",
        unit: "proportion",
      },
    ],
    assumptions: ["The fixed kernel computes every class-specific metric."],
    limitations: ["No result is shown before external verification."],
    provenance: {
      discriminationContractHash: await hashCanonical(discriminationContract),
      experimentIrHash: await hashExperimentIR(experimentIr),
    },
  });
  return {
    "discrimination-contract.json": JSON.stringify(discriminationContract),
    "experiment-ir.json": JSON.stringify(experimentIr),
    "lab-scene.json": JSON.stringify(labScene),
    "public-rationale.md":
      "A majority baseline and fixed-score comparisons test whether aggregate accuracy represents useful rare-event detection.",
  } as const;
}

type ScientificCandidateArtifacts = {
  "discrimination-contract.json": string;
  "experiment-ir.json": string;
  "lab-scene.json": string;
  "public-rationale.md": string;
};

type ScientificCandidateFactory = (
  bundle: RunnerLabCompileBundleV5,
) => Promise<ScientificCandidateArtifacts>;

type ScientificHostedRunnerHarness = Pick<
  Awaited<ReturnType<typeof preparedScientificHostedRunner>>,
  | "app"
  | "artifact"
  | "artifactStore"
  | "bundle"
  | "dispatch"
  | "dispatcher"
  | "runnerJobs"
  | "runnerObjects"
  | "session"
  | "sessionId"
  | "sessionRepository"
>;

async function stageScientificCandidate(
  harness: ScientificHostedRunnerHarness,
  createArtifacts: ScientificCandidateFactory = scientificCandidateArtifacts,
) {
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
  const artifacts = await createArtifacts(harness.bundle);
  const artifactHashes = {} as Record<keyof typeof artifacts, string>;
  for (const [path, body] of Object.entries(artifacts) as Array<
    [keyof typeof artifacts, string]
  >) {
    const uploaded = await harness.app.request(
      `/api/runner/jobs/${jobId}/outputs/${path}`,
      {
        method: "PUT",
        headers: {
          ...authorization,
          "content-type": path.endsWith(".json")
            ? "application/json"
            : "text/markdown; charset=utf-8",
        },
        body,
      },
    );
    expect(uploaded.status, path).toBe(201);
    artifactHashes[path] = await sha256Text(body);
  }
  const candidate = await postJson(
    harness.app,
    `/api/runner/jobs/${jobId}/candidate`,
    { schemaVersion: "5", attempt: 1, artifactHashes },
    authorization,
  );
  expect(candidate.status).toBe(200);
  const payload = (await candidate.json()) as {
    data: { status: string; runnerJob: RunnerJob };
  };
  expect(payload.data.status, JSON.stringify(payload.data)).toBe("VERIFIED");
  return { artifactHashes, artifacts, authorization, jobId, payload };
}

async function completeScientificCompileAndQueueRun(
  harness: ScientificHostedRunnerHarness,
  createArtifacts?: ScientificCandidateFactory,
) {
  const staged = await stageScientificCandidate(harness, createArtifacts);
  const compileCallback = await postJson(
    harness.app,
    `/api/runner/jobs/${staged.jobId}/callback`,
    {
      schemaVersion: "1",
      callbackId: "callback_scientific_compile_for_run",
      idempotencyKey: "scientific-compile-for-run-complete",
      jobId: staged.jobId,
      stateVersion: harness.dispatch.job.stateVersion,
      status: "VERIFIED",
      outputHashes: Object.values(staged.artifactHashes),
      finalEventCursor: staged.payload.data.runnerJob.eventCursor,
      occurredAt: "2026-07-14T10:00:01.000Z",
    },
    staged.authorization,
  );
  expect(compileCallback.status).toBe(200);
  const queuedRun = await postJson(
    harness.app,
    `/api/sessions/${harness.bundle.sessionId}/lab/run`,
  );
  expect(queuedRun.status).toBe(202);
  const dispatch = harness.dispatcher.dispatched[1];
  if (dispatch === undefined) throw new Error("v5 run was not dispatched");
  const input = harness.runnerObjects.objects.get(
    `runner-input/${dispatch.job.jobId}.json`,
  );
  if (input === undefined) throw new Error("v5 run input is missing");
  return {
    staged,
    dispatch,
    bundle: RunnerLabRunBundleV5Schema.parse(JSON.parse(input.body)),
    authorization: { authorization: `Bearer ${dispatch.token}` },
  };
}

async function completePrimaryAndQueueBoundary(
  harness: ScientificHostedRunnerHarness,
  createArtifacts: ScientificCandidateFactory,
  createResult: (
    bundle: RunnerLabRunBundleV5,
  ) => Promise<HostedVerifiedResultSetV2>,
  idSuffix: string,
) {
  const run = await completeScientificCompileAndQueueRun(
    harness,
    createArtifacts,
  );
  const runJobId = run.dispatch.job.jobId;
  expect(
    (
      await harness.app.request(`/api/runner/jobs/${runJobId}/start`, {
        method: "POST",
        headers: run.authorization,
      })
    ).status,
  ).toBe(200);
  const primaryResult = await createResult(run.bundle);
  const primaryText = JSON.stringify(primaryResult);
  expect(
    (
      await harness.app.request(
        `/api/runner/jobs/${runJobId}/outputs/verified-result.json`,
        {
          method: "PUT",
          headers: {
            ...run.authorization,
            "content-type": "application/json",
          },
          body: primaryText,
        },
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await postJson(
        harness.app,
        `/api/runner/jobs/${runJobId}/callback`,
        {
          schemaVersion: "1",
          callbackId: `callback_primary_${idSuffix}`,
          idempotencyKey: `primary-${idSuffix}`,
          jobId: runJobId,
          stateVersion: run.dispatch.job.stateVersion,
          status: "VERIFIED",
          outputHashes: [await sha256Text(primaryText)],
          finalEventCursor: 0,
          occurredAt: "2026-07-14T10:00:04.000Z",
        },
        run.authorization,
      )
    ).status,
  ).toBe(200);
  const queued = await postJson(
    harness.app,
    `/api/sessions/${harness.bundle.sessionId}/boundary/run`,
  );
  expect(queued.status, await queued.clone().text()).toBe(202);
  const boundaryDispatch = harness.dispatcher.dispatched[2];
  if (boundaryDispatch === undefined) {
    throw new Error("Boundary Map runner was not dispatched");
  }
  const input = harness.runnerObjects.objects.get(
    `runner-input/${boundaryDispatch.job.jobId}.json`,
  );
  if (input === undefined) throw new Error("Boundary Map input is missing");
  return {
    boundaryAuthorization: {
      authorization: `Bearer ${boundaryDispatch.token}`,
    },
    boundaryBundle: RunnerBoundaryMapBundleV5Schema.parse(
      JSON.parse(input.body),
    ),
    boundaryDispatch,
    primaryResult,
    run,
  };
}

async function queueAndVerifyBoundary(
  harness: ScientificHostedRunnerHarness,
  idSuffix: string,
) {
  const queued = await postJson(
    harness.app,
    `/api/sessions/${harness.bundle.sessionId}/boundary/run`,
  );
  expect(queued.status, await queued.clone().text()).toBe(202);
  const boundaryDispatch = harness.dispatcher.dispatched.at(-1);
  if (boundaryDispatch === undefined) {
    throw new Error("Boundary Map runner was not dispatched");
  }
  const input = harness.runnerObjects.objects.get(
    `runner-input/${boundaryDispatch.job.jobId}.json`,
  );
  if (input === undefined) throw new Error("Boundary Map input is missing");
  const boundaryBundle = RunnerBoundaryMapBundleV5Schema.parse(
    JSON.parse(input.body),
  );
  const authorization = {
    authorization: `Bearer ${boundaryDispatch.token}`,
  };
  expect(
    (
      await harness.app.request(
        `/api/runner/jobs/${boundaryDispatch.job.jobId}/start`,
        { method: "POST", headers: authorization },
      )
    ).status,
  ).toBe(200);
  const result = await scientificBoundaryMap(boundaryBundle);
  const resultText = JSON.stringify(result);
  expect(
    (
      await harness.app.request(
        `/api/runner/jobs/${boundaryDispatch.job.jobId}/outputs/boundary-map.json`,
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
    `/api/runner/jobs/${boundaryDispatch.job.jobId}/callback`,
    {
      schemaVersion: "1",
      callbackId: `callback_boundary_${idSuffix}`,
      idempotencyKey: `boundary-${idSuffix}`,
      jobId: boundaryDispatch.job.jobId,
      stateVersion: boundaryDispatch.job.stateVersion,
      status: "VERIFIED",
      outputHashes: [await sha256Text(resultText)],
      finalEventCursor: 0,
      occurredAt: "2026-07-14T10:00:06.000Z",
    },
    authorization,
  );
  expect(callback.status, await callback.clone().text()).toBe(200);
  await expect(callback.json()).resolves.toMatchObject({
    data: {
      runnerJob: { status: "VERIFIED" },
      session: { state: "BOUNDARY_VERIFIED" },
      verification: { status: "VERIFIED" },
    },
  });
  return { boundaryBundle, boundaryDispatch, result };
}

async function scientificLeakageResult(bundle: RunnerLabRunBundleV5) {
  if (bundle.projectedPlan.concept !== "entity_leakage") {
    throw new Error("test result helper requires the leakage Subject Pack");
  }
  const sourceByOperation = new Map([
    ["leakage.random_row_split", sampleResult.runs[0]],
    ["leakage.group_holdout", sampleResult.runs[1]],
    ["leakage.identity_ablation", sampleResult.runs[2]],
  ] as const);
  const specifications = [
    bundle.projectedPlan.baseline,
    ...bundle.projectedPlan.interventions,
  ];
  const runs = specifications.map((specification) => {
    if (specification.concept !== "entity_leakage") {
      throw new Error("mixed-concept test Plan is unsupported");
    }
    const source = sourceByOperation.get(specification.operation);
    if (source === undefined) {
      throw new Error(`missing test run for ${specification.operation}`);
    }
    return {
      ...source,
      id: specification.runId,
      operation: specification.operation,
      splitStrategy:
        specification.operation === "leakage.group_holdout"
          ? ("group" as const)
          : ("random" as const),
      groupBy:
        specification.operation === "leakage.group_holdout"
          ? specification.entityField
          : null,
      dropFeatures: specification.dropIdentity
        ? [specification.entityField]
        : [],
      model: specification.model,
      seed: specification.seed,
    };
  });
  const payload = {
    schemaVersion: "2" as const,
    concept: "entity_leakage" as const,
    planId: bundle.projectedPlan.planId,
    sessionId: bundle.sessionId,
    artifactManifestHash: bundle.artifactManifestHash,
    conceptPackVersion: bundle.selectedExperimentIr.conceptPackVersion,
    fixture: sampleResult.fixture,
    kernelVersion: sampleResult.kernelVersion,
    seed: bundle.projectedPlan.baseline.seed,
    runs,
    chartData: runs.map((run) => ({
      runId: run.id,
      splitStrategy: run.splitStrategy,
      accuracy: run.metrics.accuracy,
      rocAuc: run.metrics.rocAuc,
      sampleSize: run.sampleSizes.test,
      seed: run.seed,
    })),
  };
  return HostedVerifiedResultSetV2Schema.parse({
    ...payload,
    resultHash: await hashCanonical(payload),
  });
}

type HostedImbalanceResultV2 = Extract<
  HostedVerifiedResultSetV2,
  { concept: "class_imbalance" }
>;

async function scientificImbalanceResult(bundle: RunnerLabRunBundleV5) {
  if (bundle.projectedPlan.concept !== "class_imbalance") {
    throw new Error("test result helper requires the imbalance Subject Pack");
  }
  const source = JSON.parse(imbalanceResultText) as {
    fixture: HostedImbalanceResultV2["fixture"];
    kernelVersion: string;
    seed: number;
    runs: HostedImbalanceResultV2["runs"];
  };
  if (source.fixture.sha256 !== bundle.fixture.contentSha256) {
    throw new Error("public imbalance result does not match fixture authority");
  }
  const sourceByOperation = new Map(
    source.runs.map((run) => [run.operation, run]),
  );
  const specifications = [
    bundle.projectedPlan.baseline,
    ...bundle.projectedPlan.interventions,
  ];
  const runs = specifications.map((specification) => {
    if (specification.concept !== "class_imbalance") {
      throw new Error("mixed-concept test Plan is unsupported");
    }
    const sourceRun = sourceByOperation.get(specification.operation);
    if (sourceRun === undefined) {
      throw new Error(`missing test run for ${specification.operation}`);
    }
    return {
      ...sourceRun,
      id: specification.runId,
      operation: specification.operation,
      model: specification.model,
      seed: specification.seed,
      threshold: specification.threshold,
      prevalenceScenario: specification.prevalenceScenario,
    };
  });
  const payload = {
    schemaVersion: "2" as const,
    concept: "class_imbalance" as const,
    planId: bundle.projectedPlan.planId,
    sessionId: bundle.sessionId,
    artifactManifestHash: bundle.artifactManifestHash,
    conceptPackVersion: bundle.selectedExperimentIr.conceptPackVersion,
    fixture: source.fixture,
    kernelVersion: source.kernelVersion,
    seed: source.seed,
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
    ...payload,
    resultHash: await hashCanonical(payload),
  });
}

async function scientificBoundaryMap(bundle: RunnerBoundaryMapBundleV5) {
  const concept = bundle.selectedExperimentIr.concept;
  const definition = getConceptPack(concept).scientificMethod.boundaryMap;
  const axes = definition.axes.map((axis) => ({
    id: axis.id,
    label: axis.label,
    unit: axis.unit,
    points: axis.points.map((point) => ({
      id: point.id,
      label: point.label,
      value: point.outputValue,
    })),
  }));
  const pipelineFingerprint = await hashCanonical({
    concept,
    pipeline: "fixed-boundary-test-pipeline",
  });
  const cells = [] as Array<Record<string, unknown>>;
  if (concept === "entity_leakage") {
    for (const [fractionIndex, fraction] of axes[0]!.points.entries()) {
      for (const [
        observationIndex,
        observations,
      ] of axes[1]!.points.entries()) {
        const optimismGap =
          observationIndex === 0
            ? Number((0.01 + fractionIndex * 0.002).toFixed(12))
            : Number((0.04 + observationIndex * 0.03).toFixed(12));
        const groupAccuracy = 0.66;
        cells.push({
          cellId: `${fraction.id}--${observations.id}`,
          coordinates: [
            {
              axisId: axes[0]!.id,
              pointId: fraction.id,
              value: fraction.value,
            },
            {
              axisId: axes[1]!.id,
              pointId: observations.id,
              value: observations.value,
            },
          ],
          classificationId:
            optimismGap >= 0.1
              ? "material"
              : optimismGap > 0.03
                ? "transition"
                : "little",
          concept,
          randomAccuracy: groupAccuracy + optimismGap,
          groupAccuracy,
          optimismGap,
          randomEntityOverlap: {
            count: observationIndex === 0 ? 0 : 20,
            rate: observationIndex === 0 ? 0 : 0.5,
          },
          groupEntityOverlap: { count: 0, rate: 0 },
          sampleSizes: { randomTest: 120, groupTest: 120 },
          fixtureViewHash: await hashCanonical({
            fixture: bundle.fixture.contentSha256,
            observations: observations.value,
          }),
          randomPipelineFingerprint: pipelineFingerprint,
          groupPipelineFingerprint: pipelineFingerprint,
        });
      }
    }
  } else {
    const scenarioCounts = [
      { total: 373, positive: 2 },
      { total: 375, positive: 4 },
      { total: 375, positive: 8 },
    ];
    for (const [scenarioIndex, scenario] of axes[0]!.points.entries()) {
      const counts = scenarioCounts[scenarioIndex]!;
      const scoreFingerprint = await hashCanonical({
        scenario: scenario.id,
        fixture: bundle.fixture.contentSha256,
      });
      for (const [thresholdIndex, threshold] of axes[1]!.points.entries()) {
        const truePositive = Math.max(
          0,
          counts.positive - Math.floor((thresholdIndex * counts.positive) / 4),
        );
        const falsePositive = Math.max(
          0,
          30 - thresholdIndex * 7 - scenarioIndex * 2,
        );
        const falseNegative = counts.positive - truePositive;
        const trueNegative = counts.total - counts.positive - falsePositive;
        const predictedPositive = truePositive + falsePositive;
        const precision =
          predictedPositive === 0 ? 0 : truePositive / predictedPositive;
        const recall =
          counts.positive === 0 ? 0 : truePositive / counts.positive;
        const f1 =
          precision + recall === 0
            ? 0
            : (2 * precision * recall) / (precision + recall);
        cells.push({
          cellId: `${scenario.id}--${threshold.id}`,
          coordinates: [
            {
              axisId: axes[0]!.id,
              pointId: scenario.id,
              value: scenario.value,
            },
            {
              axisId: axes[1]!.id,
              pointId: threshold.id,
              value: threshold.value,
            },
          ],
          classificationId:
            f1 >= 0.3 ? "strong" : f1 >= 0.2 ? "tradeoff" : "weak",
          concept,
          prevalenceScenario: scenario.id,
          prevalence: scenario.value,
          threshold: threshold.value,
          metrics: {
            accuracy: (trueNegative + truePositive) / counts.total,
            precision,
            recall,
            f1,
            prAuc: 0.18 + scenarioIndex * 0.03,
            rocAuc: 0.74 + scenarioIndex * 0.01,
          },
          confusion: {
            trueNegative,
            falsePositive,
            falseNegative,
            truePositive,
          },
          predictedPositiveRate: predictedPositive / counts.total,
          sampleSize: counts.total,
          scoreFingerprint,
          pipelineFingerprint,
        });
      }
    }
  }
  const idHash = await hashCanonical({
    concept,
    experimentIrHash: bundle.selectedExperimentIrHash,
    sessionId: bundle.sessionId,
    sweepId: bundle.boundaryRequest.sweepId,
  });
  const payload = {
    schemaVersion: "1" as const,
    canonicalProfile: "counterlab-canonical-json-v1" as const,
    boundaryMapId: `boundary_${idHash.slice(0, 24)}`,
    sessionId: bundle.sessionId,
    concept,
    conceptPackVersion: bundle.conceptPackVersion,
    artifactManifestHash: bundle.artifactManifestHash,
    experimentIrHash: bundle.selectedExperimentIrHash,
    authoritativeResultHash: bundle.releaseAuthority.authoritativeResultHash,
    evidenceVerdictHash: bundle.releaseAuthority.evidenceVerdictHash,
    sweepId: bundle.boundaryRequest.sweepId,
    gridPresetId: bundle.boundaryRequest.gridPresetId,
    seed: bundle.seed,
    kernelVersion: getConceptPack(concept).fixedResultAuthority.kernelVersion,
    axes,
    cells,
    classifications: definition.classifications,
    units: definition.units,
    assumptions: definition.assumptions,
    nonClaims: definition.nonClaims,
  };
  return BoundaryMapResultV1Schema.parse({
    ...payload,
    resultHash: await hashCanonical(payload),
  });
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
    conceptPackVersion: LIVE_IMBALANCE_PACK_VERSION,
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
  const source = JSON.parse(imbalanceResultText) as {
    fixture: HostedImbalanceResultV2["fixture"];
    kernelVersion: string;
    runs: HostedImbalanceResultV2["runs"];
  };
  const sourceByOperation = new Map(
    source.runs.map((run) => [run.operation, run]),
  );
  const runs = [plan.baseline, ...plan.interventions].map((spec) => {
    if (spec.concept !== "class_imbalance") {
      throw new Error("mixed concept plan");
    }
    const sourceRun = sourceByOperation.get(spec.operation);
    if (sourceRun === undefined) {
      throw new Error(`public fixture is missing ${spec.operation}`);
    }
    return {
      ...sourceRun,
      id: spec.runId,
      operation: spec.operation,
      model: spec.model,
      seed: spec.seed,
      threshold: spec.threshold,
      prevalenceScenario: spec.prevalenceScenario,
    };
  });
  const withoutHash = {
    schemaVersion: "2" as const,
    concept: "class_imbalance" as const,
    planId: plan.planId,
    sessionId: plan.sessionId,
    artifactManifestHash: plan.artifactManifestHash,
    conceptPackVersion: plan.conceptPackVersion,
    fixture: source.fixture,
    kernelVersion: source.kernelVersion,
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
  describe("bounded notebook intake", () => {
    const uploadEnv = (maxBytes: number, put = vi.fn()) =>
      ({
        COUNTERLAB_MAX_NOTEBOOK_BYTES: String(maxBytes),
        ARTIFACTS: { put },
      }) as unknown as Env;

    function notebookForm(
      body = sourceNotebookText,
      name = "customer-model.ipynb",
      type = "application/x-ipynb+json",
    ) {
      const form = new FormData();
      form.set("file", new Blob([body], { type }), name);
      return form;
    }

    async function boundUploadKey(
      body = sourceNotebookText,
      name = "customer-model.ipynb",
      type = "application/x-ipynb+json",
      operationId = "123e4567-e89b-42d3-a456-426614174000",
    ): Promise<string> {
      const fileSha256 = await sha256Text(body);
      const bindingHash = await hashCanonical(
        canonicalUploadRequestBinding({
          operationId,
          fileSha256,
          fileName: name,
          mediaType: type,
        }),
      );
      return `upload_${operationId}_${bindingHash}`;
    }

    function reconciledUploadEnv(maxBytes: number) {
      const objects = new Map<
        string,
        { body: Uint8Array; customMetadata: Record<string, string> }
      >();
      const put = vi.fn(
        async (
          key: string,
          value: Uint8Array,
          options?: { customMetadata?: Record<string, string> },
        ) => {
          objects.set(key, {
            body: new Uint8Array(value),
            customMetadata: { ...(options?.customMetadata ?? {}) },
          });
        },
      );
      const head = vi.fn(async (key: string) => {
        const object = objects.get(key);
        return object === undefined
          ? null
          : {
              size: object.body.byteLength,
              customMetadata: { ...object.customMetadata },
            };
      });
      return {
        env: {
          COUNTERLAB_MAX_NOTEBOOK_BYTES: String(maxBytes),
          ARTIFACTS: { head, put },
        } as unknown as Env,
        head,
        objects,
        put,
      };
    }

    it("rejects an upload budget before reading or storing its body", async () => {
      const admissionControl = new CapturingAdmissionControl({
        admitted: false,
        reason: "CALLER_BUDGET",
        retryAfterSeconds: 37,
      });
      const app = createApi({
        artifactStore: new MemoryArtifactStore(),
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
      });
      const request = new Request("https://counterlab.test/api/artifacts", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=counterlab-test",
          "idempotency-key": `upload_123e4567-e89b-42d3-a456-426614174000_${"a".repeat(64)}`,
        },
        body: "--counterlab-test--",
      });
      if (request.body === null) throw new Error("test body is unavailable");
      const getReader = vi.spyOn(request.body, "getReader");

      const response = await app.fetch(request, uploadEnv(1_024));

      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("37");
      expect(getReader).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "CALLER_BUDGET",
          retryable: true,
          status: 429,
        },
      });
      expect(admissionControl.admitted).toHaveLength(1);
      expect(admissionControl.admitted[0]).toMatchObject({
        kind: "upload",
        callerKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
        operationKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
      });
      expect(JSON.stringify(admissionControl.admitted[0])).not.toContain(
        "203.0.113.8",
      );
    });

    it("defers an active duplicate upload before reading or storing another body", async () => {
      const admissionControl = new CapturingAdmissionControl({
        admitted: true,
        reused: true,
        leaseStatus: "already-active",
        leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
        leaseGeneration: 1,
      });
      const put = vi.fn();
      const app = createApi({
        artifactStore: new MemoryArtifactStore(),
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
      });
      const request = new Request("https://counterlab.test/api/artifacts", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=counterlab-test",
          "idempotency-key": `upload_123e4567-e89b-42d3-a456-426614174000_${"a".repeat(64)}`,
        },
        body: "--counterlab-test--",
      });
      if (request.body === null) throw new Error("test body is unavailable");
      const getReader = vi.spyOn(request.body, "getReader");

      const response = await app.fetch(request, uploadEnv(1_024, put));

      expect(response.status).toBe(409);
      expect(getReader).not.toHaveBeenCalled();
      expect(put).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "UPLOAD_IN_PROGRESS",
          retryable: true,
          status: 409,
        },
      });
      expect(admissionControl.released).toHaveLength(0);
    });

    it("reconciles an identical same-key retry without rewriting the object or issuing new authority", async () => {
      const admissionControl = new CapturingAdmissionControl([
        {
          admitted: true,
          reused: false,
          leaseStatus: "acquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
          leaseGeneration: 1,
        },
        {
          admitted: true,
          reused: true,
          leaseStatus: "reacquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:04:00.000Z"),
          leaseGeneration: 2,
        },
      ]);
      const artifactStore = new StableMemoryArtifactStore();
      const ownerCapabilities = new MemoryOwnerCapabilityRepository();
      const secret =
        "contained-api-admission-test-key-with-at-least-32-characters";
      const app = createApi({
        artifactStore,
        ownerCapabilityRepository: ownerCapabilities,
        admissionControl,
        admissionHmacKey: secret,
        admissionCaller: () => "203.0.113.8",
        now: () => new Date("2026-07-14T10:00:00.000Z"),
      });
      const maxBytes = new TextEncoder().encode(sourceNotebookText).byteLength;
      const storage = reconciledUploadEnv(maxBytes);
      const idempotencyKey = await boundUploadKey();

      const first = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey },
          body: notebookForm(),
        },
        storage.env,
      );
      const firstBody = (await first.json()) as {
        data: ArtifactManifest & { ownerCapability: string };
      };
      const retry = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": idempotencyKey },
          body: notebookForm(),
        },
        storage.env,
      );
      const retryBody = (await retry.json()) as {
        data: ArtifactManifest & { ownerCapability: string };
      };

      expect(first.status).toBe(201);
      expect(retry.status).toBe(201);
      expect(retryBody).toEqual(firstBody);
      expect(firstBody.data.ownerCapability).toMatch(
        /^cl_owner_[A-Za-z0-9_-]{43}$/u,
      );
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(storage.head).toHaveBeenCalledTimes(1);
      expect(storage.objects.size).toBe(1);
      expect(artifactStore.saves).toHaveLength(2);
      expect(ownerCapabilities.artifactCreates).toHaveLength(1);
      await expect(
        ownerCapabilities.findArtifact(
          firstBody.data.artifactId,
          await hashOwnerCapability(firstBody.data.ownerCapability),
        ),
      ).resolves.toMatchObject({ resourceId: firstBody.data.artifactId });
      expect(admissionControl.released).toEqual([
        expect.objectContaining({ kind: "upload", leaseGeneration: 1 }),
        expect.objectContaining({ kind: "upload", leaseGeneration: 2 }),
      ]);
    });

    it("shares one object while issuing independent authority for new upload keys", async () => {
      const admissionControl = new CapturingAdmissionControl([
        {
          admitted: true,
          reused: false,
          leaseStatus: "acquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
          leaseGeneration: 1,
        },
        {
          admitted: true,
          reused: false,
          leaseStatus: "acquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
          leaseGeneration: 1,
        },
      ]);
      const artifactStore = new StableMemoryArtifactStore();
      const ownerCapabilities = new MemoryOwnerCapabilityRepository();
      const app = createApi({
        artifactStore,
        ownerCapabilityRepository: ownerCapabilities,
        sessionRepository: new MemorySessionRepository(),
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
        now: () => new Date("2026-07-14T10:00:00.000Z"),
      });
      const uploadBody = imbalanceNotebookText;
      const uploadName = "rare-event.ipynb";
      const maxBytes = new TextEncoder().encode(uploadBody).byteLength;
      const storage = reconciledUploadEnv(maxBytes);
      const firstKey = await boundUploadKey(uploadBody, uploadName);
      const secondKey = await boundUploadKey(
        uploadBody,
        uploadName,
        "application/x-ipynb+json",
        "223e4567-e89b-42d3-a456-426614174000",
      );

      const first = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": firstKey },
          body: notebookForm(uploadBody, uploadName),
        },
        storage.env,
      );
      const second = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": secondKey },
          body: notebookForm(uploadBody, uploadName),
        },
        storage.env,
      );
      const firstBody = (await first.json()) as {
        data: ArtifactManifest & { ownerCapability: string };
      };
      const secondBody = (await second.json()) as {
        data: ArtifactManifest & { ownerCapability: string };
      };

      expect(first.status).toBe(201);
      expect(second.status).toBe(201);
      expect(secondBody.data.artifactId).toBe(firstBody.data.artifactId);
      expect(secondBody.data.ownerCapability).not.toBe(
        firstBody.data.ownerCapability,
      );
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(storage.head).toHaveBeenCalledTimes(1);
      expect(storage.objects.size).toBe(1);
      expect(ownerCapabilities.artifactCreates).toHaveLength(2);
      for (const capability of [
        firstBody.data.ownerCapability,
        secondBody.data.ownerCapability,
      ]) {
        await expect(
          ownerCapabilities.findArtifact(
            firstBody.data.artifactId,
            await hashOwnerCapability(capability),
          ),
        ).resolves.toMatchObject({ resourceId: firstBody.data.artifactId });
      }

      const firstSession = await app.request("/api/live/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artifactId: firstBody.data.artifactId,
          artifactCapability: firstBody.data.ownerCapability,
        }),
      });
      const secondSession = await app.request("/api/live/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          artifactId: secondBody.data.artifactId,
          artifactCapability: secondBody.data.ownerCapability,
        }),
      });
      expect(firstSession.status).toBe(201);
      expect(secondSession.status).toBe(201);
    });

    it("canonicalizes an empty browser MIME type before binding the upload", async () => {
      const admissionControl = new CapturingAdmissionControl({
        admitted: true,
        reused: false,
        leaseStatus: "acquired",
        leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
        leaseGeneration: 1,
      });
      const ownerCapabilities = new MemoryOwnerCapabilityRepository();
      const app = createApi({
        artifactStore: new StableMemoryArtifactStore(),
        ownerCapabilityRepository: ownerCapabilities,
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
      });
      const maxBytes = new TextEncoder().encode(sourceNotebookText).byteLength;
      const storage = reconciledUploadEnv(maxBytes);

      const response = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: {
            "idempotency-key": await boundUploadKey(undefined, undefined, ""),
          },
          body: notebookForm(undefined, undefined, ""),
        },
        storage.env,
      );
      const body = (await response.json()) as {
        data: ArtifactManifest & { ownerCapability: string };
      };

      expect(response.status).toBe(201);
      expect(body.data.support.status).toBe("SUPPORTED");
      expect(body.data.ownerCapability).toMatch(
        /^cl_owner_[A-Za-z0-9_-]{43}$/u,
      );
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(ownerCapabilities.artifactCreates).toHaveLength(1);
    });

    it("fails closed without exposing metadata for renamed identical bytes", async () => {
      const admissionControl = new CapturingAdmissionControl([
        {
          admitted: true,
          reused: false,
          leaseStatus: "acquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
          leaseGeneration: 1,
        },
        {
          admitted: true,
          reused: false,
          leaseStatus: "acquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
          leaseGeneration: 1,
        },
      ]);
      const artifactStore = new StableMemoryArtifactStore();
      const ownerCapabilities = new MemoryOwnerCapabilityRepository();
      const app = createApi({
        artifactStore,
        ownerCapabilityRepository: ownerCapabilities,
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
      });
      const maxBytes = new TextEncoder().encode(sourceNotebookText).byteLength;
      const storage = reconciledUploadEnv(maxBytes);

      const first = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": await boundUploadKey() },
          body: notebookForm(),
        },
        storage.env,
      );
      const renamed = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: {
            "idempotency-key": await boundUploadKey(
              sourceNotebookText,
              "renamed-copy.ipynb",
              "application/x-ipynb+json",
              "223e4567-e89b-42d3-a456-426614174000",
            ),
          },
          body: notebookForm(sourceNotebookText, "renamed-copy.ipynb"),
        },
        storage.env,
      );
      const renamedBody = (await renamed.json()) as {
        error: { code: string; message: string };
      };

      expect(first.status).toBe(201);
      expect(renamed.status).toBe(409);
      expect(renamedBody).toMatchObject({
        error: { code: "UPLOAD_ARTIFACT_METADATA_CONFLICT" },
      });
      expect(JSON.stringify(renamedBody)).not.toContain("customer-model.ipynb");
      expect(JSON.stringify(renamedBody)).not.toContain("renamed-copy.ipynb");
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(ownerCapabilities.artifactCreates).toHaveLength(1);
    });

    it("rejects a hash-bound upload key reused with different bytes", async () => {
      const admissionControl = new CapturingAdmissionControl({
        admitted: true,
        reused: false,
        leaseStatus: "acquired",
        leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
        leaseGeneration: 7,
      });
      const artifactStore = new StableMemoryArtifactStore();
      const secret =
        "contained-api-admission-test-key-with-at-least-32-characters";
      const app = createApi({
        artifactStore,
        admissionControl,
        admissionHmacKey: secret,
        admissionCaller: () => "203.0.113.8",
      });
      const alteredNotebook = `${sourceNotebookText}\n`;
      const storage = reconciledUploadEnv(
        new TextEncoder().encode(alteredNotebook).byteLength,
      );
      const response = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": await boundUploadKey() },
          body: notebookForm(alteredNotebook),
        },
        storage.env,
      );

      expect(response.status).toBe(409);
      const responseBody = (await response.json()) as {
        error: { code: string; retryable?: boolean };
      };
      expect(responseBody).toMatchObject({
        error: { code: "UPLOAD_IDEMPOTENCY_CONFLICT" },
      });
      expect(responseBody.error).not.toHaveProperty("retryable");
      expect(storage.put).not.toHaveBeenCalled();
      expect(artifactStore.saves).toHaveLength(0);
      expect(admissionControl.released).toEqual([
        expect.objectContaining({ kind: "upload", leaseGeneration: 7 }),
      ]);
    });

    it("does not consume costly-operation admission for public replay reads", async () => {
      const admissionControl = new CapturingAdmissionControl();
      const app = createApi({
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
      });

      const response = await app.request("/api/replays/leakage-01");

      expect(response.status).toBe(200);
      expect(admissionControl.admitted).toHaveLength(0);
      expect(admissionControl.released).toHaveLength(0);
    });

    it("accepts a valid notebook exactly at the configured file maximum", async () => {
      const bytes = new TextEncoder().encode(sourceNotebookText).byteLength;
      const put = vi.fn().mockResolvedValue(undefined);
      const app = createApi({
        artifactStore: new MemoryArtifactStore(),
        ownerCapabilityRepository: new MemoryOwnerCapabilityRepository(),
      });

      const response = await app.request(
        "/api/artifacts",
        { method: "POST", body: notebookForm() },
        uploadEnv(bytes, put),
      );

      expect(response.status).toBe(201);
      expect(put).toHaveBeenCalledTimes(1);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        data: {
          fileName: "customer-model.ipynb",
          support: { status: "SUPPORTED" },
        },
      });
    });

    it("rejects a file one byte over the configured maximum", async () => {
      const bytes = new TextEncoder().encode(sourceNotebookText).byteLength;
      const put = vi.fn().mockResolvedValue(undefined);
      const app = createApi({ artifactStore: new MemoryArtifactStore() });

      const response = await app.request(
        "/api/artifacts",
        { method: "POST", body: notebookForm() },
        uploadEnv(bytes - 1, put),
      );

      expect(response.status).toBe(413);
      expect(put).not.toHaveBeenCalled();
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "MAXIMUM_SIZE_EXCEEDED", status: 413 },
      });
    });

    it("rejects a declared oversized envelope before multipart materialization", async () => {
      const formDataSpy = vi.spyOn(Response.prototype, "formData");
      const app = createApi({ artifactStore: new MemoryArtifactStore() });

      const response = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: {
            "content-type": "multipart/form-data; boundary=counterlab-test",
            "content-length": "65554",
          },
          body: "x",
        },
        uploadEnv(16),
      );

      expect(response.status).toBe(413);
      expect(formDataSpy).not.toHaveBeenCalled();
      formDataSpy.mockRestore();
    });

    it("stops and cancels an absent-length stream at the envelope cap", async () => {
      let cancelled = false;
      let pullCount = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pullCount += 1;
          controller.enqueue(new Uint8Array(40_000));
        },
        cancel() {
          cancelled = true;
        },
      });
      const request = new Request("https://counterlab.test/api/artifacts", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=counterlab-test",
        },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      const app = createApi({ artifactStore: new MemoryArtifactStore() });

      const response = await app.fetch(request, uploadEnv(16));

      expect(response.status).toBe(413);
      expect(pullCount).toBeLessThanOrEqual(3);
      expect(cancelled).toBe(true);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "MAXIMUM_SIZE_EXCEEDED" },
      });
    });

    it("releases an interrupted upload lease and permits the same-key retry", async () => {
      let pullCount = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          pullCount += 1;
          if (pullCount === 1) {
            controller.enqueue(new TextEncoder().encode("--counterlab\r\n"));
            return;
          }
          controller.error(new Error("synthetic disconnect"));
        },
      });
      const request = new Request("https://counterlab.test/api/artifacts", {
        method: "POST",
        headers: {
          "content-type": "multipart/form-data; boundary=counterlab",
          "idempotency-key": await boundUploadKey(),
        },
        body: stream,
        duplex: "half",
      } as RequestInit & { duplex: "half" });
      const admissionControl = new CapturingAdmissionControl([
        {
          admitted: true,
          reused: false,
          leaseStatus: "acquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
          leaseGeneration: 4,
        },
        {
          admitted: true,
          reused: true,
          leaseStatus: "reacquired",
          leaseExpiresAt: Date.parse("2026-07-14T10:04:00.000Z"),
          leaseGeneration: 5,
        },
      ]);
      const app = createApi({
        artifactStore: new StableMemoryArtifactStore(),
        ownerCapabilityRepository: new MemoryOwnerCapabilityRepository(),
        admissionControl,
        admissionHmacKey:
          "contained-api-admission-test-key-with-at-least-32-characters",
        admissionCaller: () => "203.0.113.8",
      });
      const storage = reconciledUploadEnv(
        new TextEncoder().encode(sourceNotebookText).byteLength,
      );

      const response = await app.fetch(request, storage.env);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "REQUEST_BODY_INTERRUPTED", retryable: true },
      });
      expect(admissionControl.released).toEqual([
        expect.objectContaining({ kind: "upload", leaseGeneration: 4 }),
      ]);

      const retried = await app.request(
        "/api/artifacts",
        {
          method: "POST",
          headers: { "idempotency-key": await boundUploadKey() },
          body: notebookForm(),
        },
        storage.env,
      );
      expect(retried.status).toBe(201);
      expect(admissionControl.released).toEqual([
        expect.objectContaining({ kind: "upload", leaseGeneration: 4 }),
        expect.objectContaining({ kind: "upload", leaseGeneration: 5 }),
      ]);
    });

    it("rejects ambiguous, malformed, and over-broad multipart envelopes", async () => {
      const app = createApi({ artifactStore: new MemoryArtifactStore() });
      const cases = [
        {
          headers: {
            "content-type": "multipart/form-data; boundary=counterlab",
            "content-length": "1, 2",
          },
          body: "x",
          code: "INVALID_CONTENT_LENGTH",
        },
        {
          headers: {
            "content-type": "multipart/form-data; boundary=counterlab",
            "content-length": "1",
            "transfer-encoding": "chunked",
          },
          body: "x",
          code: "AMBIGUOUS_BODY_LENGTH",
        },
        {
          headers: { "content-type": "multipart/form-data" },
          body: "x",
          code: "INVALID_MULTIPART_BOUNDARY",
        },
      ];

      for (const testCase of cases) {
        const response = await app.request(
          "/api/artifacts",
          { method: "POST", headers: testCase.headers, body: testCase.body },
          uploadEnv(1_024),
        );
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({
          error: { code: testCase.code },
        });
      }

      const multiple = notebookForm();
      multiple.set("claim", "not allowed");
      const multipleResponse = await app.request(
        "/api/artifacts",
        { method: "POST", body: multiple },
        uploadEnv(new TextEncoder().encode(sourceNotebookText).byteLength + 1),
      );
      expect(multipleResponse.status).toBe(400);
      await expect(multipleResponse.json()).resolves.toMatchObject({
        error: { code: "INVALID_UPLOAD_FIELDS" },
      });
    });
  });

  it("refuses a live session for an intake-unsupported artifact", async () => {
    const harness = await sessionHarness("sample");
    const uploaded = await saveUploadedArtifact(
      harness.artifactStore,
      harness.artifactId,
    );
    await harness.artifactStore.save({
      ...uploaded,
      support: {
        status: "UNSUPPORTED",
        reasons: [
          {
            code: "UNSUPPORTED_ESTIMATOR",
            message: "The estimator is outside the released support boundary.",
          },
        ],
      },
    });

    const response = await postJson(harness.app, "/api/live/sessions", {
      artifactId: uploaded.artifactId,
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ARTIFACT_UNSUPPORTED",
        message: expect.not.stringMatching(/session_/u),
      },
    });
  });

  describe("private owner capabilities", () => {
    function protectedApi(
      ownerCapabilityRepository: OwnerCapabilityRepository = new MemoryOwnerCapabilityRepository(),
    ) {
      const sessionRepository = new MemorySessionRepository();
      const artifactStore = new MemoryArtifactStore();
      const replayRepository = new MemoryProofCapsuleReplayRepository();
      const runnerJobs = new MemoryRunnerJobRepository();
      let sequence = 0;
      const app = createApi({
        sessionRepository,
        artifactStore,
        ownerCapabilityRepository,
        replayRepository,
        runnerJobRepository: runnerJobs,
        now: () => new Date("2026-07-18T10:00:00.000Z"),
        id: (prefix) => `${prefix}_protected_${++sequence}`,
      });
      return {
        app,
        artifactStore,
        ownerCapabilityRepository,
        runnerJobs,
        sessionRepository,
      };
    }

    async function closeProtectedSample(
      app: ReturnType<typeof createApi>,
    ): Promise<{
      sourceSessionId: string;
      authorization: string;
      route: string;
    }> {
      const createdResponse = await postJson(app, "/api/sample/sessions", {
        sampleId: "leakage-01",
      });
      const created = (await createdResponse.json()) as {
        data: { sessionId: string; ownerCapability: string };
      };
      const authorization = `Bearer ${created.data.ownerCapability}`;
      const route = `/api/sessions/${created.data.sessionId}`;
      expect(
        (
          await postJson(
            app,
            `${route}/belief-test`,
            { learnerClaim: SAMPLE_LEAKAGE_QUESTION },
            { authorization },
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await postJson(
            app,
            `${route}/belief-test/confirm`,
            {
              action: "reject",
              reason: "The proposed explanation does not capture my claim.",
            },
            { authorization },
          )
        ).status,
      ).toBe(200);
      return {
        sourceSessionId: created.data.sessionId,
        authorization,
        route,
      };
    }

    it("fails closed instead of exposing a corrupted stored evidence chain", async () => {
      const { app, sessionRepository } = protectedApi();
      const createdResponse = await postJson(app, "/api/sample/sessions", {
        sampleId: "leakage-01",
      });
      const created = (await createdResponse.json()) as {
        data: { sessionId: string; ownerCapability: string };
      };
      const authorization = `Bearer ${created.data.ownerCapability}`;
      const events = await sessionRepository.listEvents(created.data.sessionId);
      const first = events[0];
      if (first === undefined) throw new Error("missing creation evidence");
      sessionRepository.replaceEventsForIntegrityTest(created.data.sessionId, [
        {
          ...first,
          payload: { ...first.payload, tampered: true },
        },
      ]);

      const response = await app.request(
        `/api/sessions/${created.data.sessionId}/events`,
        { headers: { authorization } },
      );

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "EVIDENCE_CHAIN_INVALID",
          message: "Stored evidence failed integrity validation",
        },
      });
    });

    it("returns a verified chain receipt and rejects a self-consistent truncated chain", async () => {
      const { app, sessionRepository } = protectedApi();
      const createdResponse = await postJson(app, "/api/sample/sessions", {
        sampleId: "leakage-01",
      });
      const created = (await createdResponse.json()) as {
        data: { sessionId: string; ownerCapability: string };
      };
      const authorization = `Bearer ${created.data.ownerCapability}`;
      const eventsPath = `/api/sessions/${created.data.sessionId}/events`;
      const firstResponse = await app.request(eventsPath, {
        headers: { authorization },
      });
      expect(firstResponse.status).toBe(200);
      const firstPayload = (await firstResponse.json()) as {
        data: {
          events: EvidenceEvent[];
          integrity: {
            status: string;
            eventChainHead: string;
            eventCount: number;
          };
        };
      };
      expect(firstPayload.data.integrity).toEqual({
        schemaVersion: "1",
        status: "VERIFIED",
        eventChainHead: firstPayload.data.events[0]?.eventHash,
        eventCount: 1,
      });

      expect(
        (
          await postJson(
            app,
            `/api/sessions/${created.data.sessionId}/belief-test`,
            {
              learnerClaim: SAMPLE_LEAKAGE_QUESTION,
            },
            { authorization },
          )
        ).status,
      ).toBe(200);
      const complete = await sessionRepository.listEvents(
        created.data.sessionId,
      );
      sessionRepository.replaceEventsForIntegrityTest(created.data.sessionId, [
        complete[0]!,
      ]);

      const truncated = await app.request(eventsPath, {
        headers: { authorization },
      });
      expect(truncated.status).toBe(409);
      await expect(truncated.json()).resolves.toMatchObject({
        error: { code: "EVIDENCE_CHAIN_INVALID" },
      });
    });

    it("treats a session ID as a locator and requires its separate owner key", async () => {
      const { app } = protectedApi();
      const createdResponse = await postJson(app, "/api/sample/sessions", {
        sampleId: "leakage-01",
      });
      expect(createdResponse.status).toBe(201);
      const created = (await createdResponse.json()) as {
        data: { sessionId: string; ownerCapability: string };
      };
      expect(created.data.ownerCapability).toMatch(
        /^cl_owner_[A-Za-z0-9_-]{43}$/u,
      );
      expect(createdResponse.headers.get("set-cookie")).toContain(
        "HttpOnly; Secure; SameSite=Strict",
      );

      const unowned = await app.request(
        `/api/sessions/${created.data.sessionId}`,
      );
      const wrong = await app.request(
        `/api/sessions/${created.data.sessionId}`,
        { headers: { authorization: `Bearer cl_owner_${"x".repeat(43)}` } },
      );
      for (const denied of [unowned, wrong]) {
        expect(denied.status).toBe(404);
        await expect(denied.json()).resolves.toMatchObject({
          error: { code: "SESSION_ACCESS_DENIED" },
        });
      }

      const authorization = `Bearer ${created.data.ownerCapability}`;
      const owned = await app.request(
        `/api/sessions/${created.data.sessionId}`,
        { headers: { authorization } },
      );
      expect(owned.status).toBe(200);
      await expect(owned.json()).resolves.toMatchObject({
        data: { sessionId: created.data.sessionId },
      });

      const cookie = createdResponse.headers
        .get("set-cookie")
        ?.split(";", 1)[0];
      expect(cookie).toBeDefined();
      const cookieOwned = await app.request(
        `/api/sessions/${created.data.sessionId}/artifact`,
        { headers: { cookie: cookie! } },
      );
      expect(cookieOwned.status).toBe(200);

      for (const headers of [
        { "content-type": "application/json" },
        {
          "content-type": "application/json",
          authorization: `Bearer cl_owner_${"x".repeat(43)}`,
        },
      ]) {
        const deniedRevocation = await app.request(
          `/api/sessions/${created.data.sessionId}/replays/revoke`,
          { method: "POST", headers, body: "{}" },
        );
        expect(deniedRevocation.status).toBe(404);
        await expect(deniedRevocation.json()).resolves.toMatchObject({
          error: { code: "SESSION_ACCESS_DENIED" },
        });
      }
      const ownedMissingReplay = await app.request(
        `/api/sessions/${created.data.sessionId}/replays/revoke`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization,
          },
          body: "{}",
        },
      );
      expect(ownedMissingReplay.status).toBe(404);
      await expect(ownedMissingReplay.json()).resolves.toMatchObject({
        error: { code: "REPLAY_NOT_FOUND" },
      });

      const revoked = await postJson(
        app,
        `/api/sessions/${created.data.sessionId}/access/revoke`,
        {},
        { authorization },
      );
      expect(revoked.status).toBe(200);
      expect(revoked.headers.get("set-cookie")).toContain("Max-Age=0");
      await expect(revoked.json()).resolves.toMatchObject({
        data: { revoked: true },
      });

      const repeatedRevocation = await postJson(
        app,
        `/api/sessions/${created.data.sessionId}/access/revoke`,
        {},
        { authorization },
      );
      expect(repeatedRevocation.status).toBe(200);
      expect(repeatedRevocation.headers.get("set-cookie")).toContain(
        "Max-Age=0",
      );
      await expect(repeatedRevocation.json()).resolves.toMatchObject({
        data: { revoked: false },
      });

      const afterRevocation = await app.request(
        `/api/sessions/${created.data.sessionId}`,
        { headers: { authorization } },
      );
      expect(afterRevocation.status).toBe(404);
    });

    it.each(["reject", "insufficient_evidence"] as const)(
      "restarts a %s response as a distinct source-bound investigation",
      async (action) => {
        const { app, sessionRepository } = protectedApi();
        const createdResponse = await postJson(app, "/api/sample/sessions", {
          sampleId: "leakage-01",
        });
        const created = (await createdResponse.json()) as {
          data: { sessionId: string; ownerCapability: string };
        };
        const authorization = `Bearer ${created.data.ownerCapability}`;
        const route = `/api/sessions/${created.data.sessionId}`;
        expect(
          (
            await postJson(
              app,
              `${route}/belief-test`,
              {
                learnerClaim: SAMPLE_LEAKAGE_QUESTION,
              },
              { authorization },
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await postJson(
              app,
              `${route}/belief-test/confirm`,
              {
                action,
                reason:
                  action === "reject"
                    ? "The proposed explanation does not capture my claim."
                    : "The current evidence does not support this claim.",
              },
              { authorization },
            )
          ).status,
        ).toBe(200);

        const unownedRestart = await postJson(app, `${route}/restart`);
        expect(unownedRestart.status).toBe(404);
        await expect(unownedRestart.json()).resolves.toMatchObject({
          error: { code: "SESSION_ACCESS_DENIED" },
        });

        const invalidRestart = await postJson(
          app,
          `${route}/restart`,
          {},
          {
            authorization,
            "idempotency-key": "short",
          },
        );
        expect(invalidRestart.status).toBe(400);
        await expect(invalidRestart.json()).resolves.toMatchObject({
          error: { code: "INVALID_IDEMPOTENCY_KEY" },
        });

        const restart = await postJson(
          app,
          `${route}/restart`,
          {},
          { authorization },
        );
        expect(restart.status).toBe(201);
        const restarted = (await restart.json()) as {
          data: {
            sessionId: string;
            artifactId: string;
            mode: SessionMode;
            state: string;
            ownerCapability: string;
          };
        };
        expect(restarted.data).toMatchObject({
          artifactId: expect.any(String),
          mode: { kind: "sample_lesson", sampleId: "leakage-01" },
          state: "INGESTED",
        });
        expect(restarted.data.sessionId).not.toBe(created.data.sessionId);
        expect(restarted.data.ownerCapability).toMatch(
          /^cl_owner_[A-Za-z0-9_-]{43}$/u,
        );

        const repeatedRestartResponse = await postJson(
          app,
          `${route}/restart`,
          {},
          { authorization },
        );
        expect(repeatedRestartResponse.status).toBe(200);
        const repeatedRestart = (await repeatedRestartResponse.json()) as {
          data: { sessionId: string; ownerCapability: string };
        };
        expect(repeatedRestart.data).toMatchObject({
          sessionId: restarted.data.sessionId,
          ownerCapability: restarted.data.ownerCapability,
        });

        const oldSession = await sessionRepository.find(created.data.sessionId);
        expect(oldSession?.state).toBe(
          action === "reject" ? "REJECTED_BY_LEARNER" : "INSUFFICIENT_EVIDENCE",
        );
        const oldResubmission = await postJson(
          app,
          `${route}/belief-test`,
          { learnerClaim: SAMPLE_LEAKAGE_QUESTION },
          { authorization },
        );
        expect(oldResubmission.status).toBe(409);
        await expect(oldResubmission.json()).resolves.toMatchObject({
          error: {
            code: "SESSION_STEP_CLOSED",
            message: expect.not.stringMatching(
              /INGESTED|BELIEF_TEST_PROPOSED|INSUFFICIENT_EVIDENCE|REJECTED_BY_LEARNER/u,
            ),
          },
        });

        const sourceEvents = await sessionRepository.listEvents(
          created.data.sessionId,
        );
        const sourceHead = sourceEvents.at(-1);
        const restartEvents = await sessionRepository.listEvents(
          restarted.data.sessionId,
        );
        expect(restartEvents).toHaveLength(1);
        expect(restartEvents[0]).toMatchObject({
          kind: "session.created",
          payload: {
            sourceSessionId: created.data.sessionId,
            sourceState:
              action === "reject"
                ? "REJECTED_BY_LEARNER"
                : "INSUFFICIENT_EVIDENCE",
            sourceEventHash: sourceHead?.eventHash,
          },
          inputHashes: expect.arrayContaining([sourceHead?.eventHash]),
        });

        const restartedAuthorization = `Bearer ${restarted.data.ownerCapability}`;
        const restartedRoute = `/api/sessions/${restarted.data.sessionId}`;
        expect(
          (
            await postJson(
              app,
              `${restartedRoute}/belief-test`,
              { learnerClaim: SAMPLE_LEAKAGE_QUESTION },
              { authorization: restartedAuthorization },
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await postJson(
              app,
              `${restartedRoute}/belief-test/confirm`,
              { action: "confirm" },
              { authorization: restartedAuthorization },
            )
          ).status,
        ).toBe(200);
        expect(
          (
            await postJson(
              app,
              `${restartedRoute}/prediction`,
              {
                choice: "The score will remain high for unseen customers.",
                confidence: 72,
              },
              { authorization: restartedAuthorization },
            )
          ).status,
        ).toBe(201);
        expect(
          (await sessionRepository.find(restarted.data.sessionId))?.state,
        ).toBe("PREDICTION_COMMITTED");

        const nonterminalRestart = await postJson(
          app,
          `${restartedRoute}/restart`,
          {},
          { authorization: restartedAuthorization },
        );
        expect(nonterminalRestart.status).toBe(409);
        await expect(nonterminalRestart.json()).resolves.toMatchObject({
          error: {
            code: "SESSION_RESTART_NOT_AVAILABLE",
            message: expect.not.stringMatching(
              /INGESTED|INSUFFICIENT_EVIDENCE|REJECTED_BY_LEARNER/u,
            ),
          },
        });
      },
    );

    it("repairs a response-loss window after the child session was created", async () => {
      const capabilities = new RecoverableOwnerCapabilityRepository();
      const { app, sessionRepository } = protectedApi(capabilities);
      const source = await closeProtectedSample(app);
      capabilities.failNextSessionCapabilityInsert();

      const interrupted = await postJson(
        app,
        `${source.route}/restart`,
        {},
        { authorization: source.authorization },
      );
      expect(interrupted.status).toBe(500);

      const retried = await postJson(
        app,
        `${source.route}/restart`,
        {},
        { authorization: source.authorization },
      );
      expect(retried.status).toBe(200);
      const body = (await retried.json()) as {
        data: { sessionId: string; ownerCapability: string };
      };
      expect(body.data.ownerCapability).toMatch(
        /^cl_owner_[A-Za-z0-9_-]{43}$/u,
      );
      expect(
        await sessionRepository.listEvents(body.data.sessionId),
      ).toHaveLength(1);
      expect(
        (
          await app.request(`/api/sessions/${body.data.sessionId}`, {
            headers: {
              authorization: `Bearer ${body.data.ownerCapability}`,
            },
          })
        ).status,
      ).toBe(200);
    });

    it("reconciles simultaneous restart requests to one child and one capability", async () => {
      const { app, sessionRepository } = protectedApi();
      const source = await closeProtectedSample(app);

      const responses = await Promise.all([
        postJson(
          app,
          `${source.route}/restart`,
          {},
          { authorization: source.authorization },
        ),
        postJson(
          app,
          `${source.route}/restart`,
          {},
          { authorization: source.authorization },
        ),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 201,
      ]);
      const bodies = (await Promise.all(
        responses.map((response) => response.json()),
      )) as Array<{
        data: { sessionId: string; ownerCapability: string };
      }>;
      expect(bodies[0]?.data).toEqual(bodies[1]?.data);
      const restarted = bodies[0]?.data;
      if (restarted === undefined) throw new Error("missing restarted session");
      expect(
        await sessionRepository.listEvents(restarted.sessionId),
      ).toHaveLength(1);
      expect(
        (
          await app.request(`/api/sessions/${restarted.sessionId}`, {
            headers: {
              authorization: `Bearer ${restarted.ownerCapability}`,
            },
          })
        ).status,
      ).toBe(200);
    });

    it("fails closed when a deterministic restart ID has unrelated lineage", async () => {
      const { app, sessionRepository } = protectedApi();
      const sourceAccess = await closeProtectedSample(app);
      const source = await sessionRepository.find(sourceAccess.sourceSessionId);
      if (source === undefined) throw new Error("missing source session");
      const fingerprint = await hashCanonical({
        schemaVersion: "1",
        operation: "restart-closed-belief-response",
        sourceSessionId: source.id,
        idempotencyKey: "counterlab.restart.v1",
      });
      const conflictingId = `session_restart_${fingerprint}`;
      const conflictService = new SessionService(sessionRepository, {
        id: (prefix) => `${prefix}_conflict`,
        now: () => new Date("2026-07-18T10:00:00.000Z"),
      });
      await conflictService.createSession({
        id: conflictingId,
        artifactId: source.artifactId,
        mode: source.mode,
      });

      const response = await postJson(
        app,
        `${sourceAccess.route}/restart`,
        {},
        { authorization: sourceAccess.authorization },
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "SESSION_RESTART_CONFLICT" },
      });
    });

    it("blocks session revocation while an authoritative runner job is active", async () => {
      const { app, runnerJobs, sessionRepository } = protectedApi();
      const createdResponse = await postJson(app, "/api/sample/sessions", {
        sampleId: "leakage-01",
      });
      const created = (await createdResponse.json()) as {
        data: { sessionId: string; ownerCapability: string };
      };
      const storedSession = await sessionRepository.find(
        created.data.sessionId,
      );
      if (storedSession === undefined)
        throw new Error("Session was not stored");
      await runnerJobs.create(
        RunnerJobSchema.parse({
          schemaVersion: "1",
          jobId: "job_revocation_guard",
          kind: "LAB_RUN",
          status: "QUEUED",
          sessionId: storedSession.id,
          artifactId: storedSession.artifactId,
          artifactManifestHash: "a".repeat(64),
          conceptPack: {
            id: "entity_leakage",
            version: LIVE_LEAKAGE_PACK_VERSION,
          },
          inputHashes: ["b".repeat(64)],
          stateVersion: storedSession.version,
          jobVersion: 1,
          createdAt: "2026-07-18T10:00:00.000Z",
          updatedAt: "2026-07-18T10:00:00.000Z",
          attempt: 0,
          maxAttempts: 2,
          runnerIdentity: null,
          timeoutSeconds: 180,
          outputHashes: [],
          eventCursor: 0,
        }),
      );

      const response = await postJson(
        app,
        `/api/sessions/${created.data.sessionId}/access/revoke`,
        {},
        { authorization: `Bearer ${created.data.ownerCapability}` },
      );
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "SESSION_ACCESS_REVOCATION_BLOCKED" },
      });

      const stillAccessible = await app.request(
        `/api/sessions/${created.data.sessionId}`,
        {
          headers: {
            authorization: `Bearer ${created.data.ownerCapability}`,
          },
        },
      );
      expect(stillAccessible.status).toBe(200);
    });

    it("requires the upload owner key before creating a private live session", async () => {
      const { app } = protectedApi();
      const form = new FormData();
      form.set(
        "file",
        new Blob([imbalanceNotebookText], {
          type: "application/x-ipynb+json",
        }),
        "rare-events.ipynb",
      );
      const upload = await app.request(
        "/api/artifacts",
        { method: "POST", body: form },
        {
          COUNTERLAB_MAX_NOTEBOOK_BYTES: String(
            new TextEncoder().encode(imbalanceNotebookText).byteLength,
          ),
          ARTIFACTS: { put: vi.fn().mockResolvedValue(undefined) },
        } as unknown as Env,
      );
      expect(upload.status).toBe(201);
      const uploaded = (await upload.json()) as {
        data: {
          artifactId: string;
          ownerCapability: string;
        };
      };

      for (const artifactCapability of [
        undefined,
        `cl_owner_${"y".repeat(43)}`,
      ]) {
        const denied = await postJson(app, "/api/live/sessions", {
          artifactId: uploaded.data.artifactId,
          ...(artifactCapability === undefined ? {} : { artifactCapability }),
        });
        expect(denied.status).toBe(404);
        await expect(denied.json()).resolves.toMatchObject({
          error: { code: "ARTIFACT_ACCESS_DENIED" },
        });
      }

      const created = await postJson(app, "/api/live/sessions", {
        artifactId: uploaded.data.artifactId,
        artifactCapability: uploaded.data.ownerCapability,
      });
      expect(created.status).toBe(201);
      await expect(created.json()).resolves.toMatchObject({
        data: {
          artifactId: uploaded.data.artifactId,
          mode: { kind: "live_notebook" },
          ownerCapability: expect.stringMatching(/^cl_owner_/u),
        },
      });

      const publicArtifact = await app.request(
        `/api/artifacts/${uploaded.data.artifactId}`,
      );
      expect(publicArtifact.status).toBe(404);
      await expect(publicArtifact.json()).resolves.toMatchObject({
        error: { code: "PRIVATE_ARTIFACT_ROUTE_DISABLED" },
      });
    });
  });

  it("creates mutable modes only through mode-specific routes and keeps replay static", async () => {
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
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "REPLAY_SESSION_UNAVAILABLE" },
    });
  });

  it("stores strict learner interactions outside session and evidence authority", async () => {
    const harness = await sessionHarness("sample");
    const interactions = new MemoryLearnerInteractionRepository();
    let interactionNow = new Date("2026-07-18T08:00:00.000Z");
    const app = createApi({
      sessionRepository: harness.sessionRepository,
      artifactStore: harness.artifactStore,
      learnerInteractionRepository: interactions,
      now: () => interactionNow,
    });
    const beforeSession = await harness.sessionRepository.find(
      harness.sessionId,
    );
    const beforeEvents = await harness.sessionRepository.listEvents(
      harness.sessionId,
    );

    const response = await postJson(
      app,
      `/api/sessions/${harness.sessionId}/interactions`,
      {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000001",
        stage: "prediction",
        kind: "prediction.recorded",
        choice: "alternative_explanation",
        confidence: 72,
      },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000001",
        accepted: true,
        duplicate: false,
      },
    });
    expect(
      interactions.records.get("interaction_00000000000000000000000000000001"),
    ).toEqual({
      schemaVersion: "1",
      eventId: "interaction_00000000000000000000000000000001",
      sessionId: harness.sessionId,
      actor: "learner",
      mode: "sample_lesson",
      concept: "unresolved",
      timestamp: "2026-07-18T08:00:00.000Z",
      interaction: {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000001",
        stage: "prediction",
        kind: "prediction.recorded",
        choice: "alternative_explanation",
        confidence: 72,
      },
    });
    expect(await harness.sessionRepository.find(harness.sessionId)).toEqual(
      beforeSession,
    );
    expect(
      await harness.sessionRepository.listEvents(harness.sessionId),
    ).toEqual(beforeEvents);

    interactionNow = new Date("2026-07-18T08:01:00.000Z");
    const duplicate = await postJson(
      app,
      `/api/sessions/${harness.sessionId}/interactions`,
      {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000001",
        stage: "prediction",
        kind: "prediction.recorded",
        choice: "alternative_explanation",
        confidence: 72,
      },
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toEqual({
      ok: true,
      data: {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000001",
        accepted: true,
        duplicate: true,
      },
    });
    expect(interactions.records.size).toBe(1);
    expect(
      interactions.records.get("interaction_00000000000000000000000000000001")
        ?.timestamp,
    ).toBe("2026-07-18T08:00:00.000Z");

    const rejected = await postJson(
      app,
      `/api/sessions/${harness.sessionId}/interactions`,
      {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000002",
        stage: "apply",
        kind: "revision.recorded",
        authoringMode: "free_text",
        revision: "raw learner prose",
        notebook: "raw notebook content",
      },
    );
    expect(rejected.status).toBe(400);
    expect(
      interactions.records.has("interaction_00000000000000000000000000000002"),
    ).toBe(false);
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
      conceptPack: {
        id: "class_imbalance",
        version: LIVE_IMBALANCE_PACK_VERSION,
      },
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
        decisionChoice: "reject_accuracy_only",
        metricChoice: "recall_and_pr_auc",
        evidenceChoices: ["zero_true_positives", "rare_base_rate"],
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
      conceptPackVersion: LIVE_IMBALANCE_PACK_VERSION,
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

  it("verifies a class-imbalance v5 patch through the frozen Worker authority", async () => {
    const harness = await preparedScientificImbalanceHostedRunner();
    const run = await completeScientificCompileAndQueueRun(
      harness,
      scientificImbalanceCandidateArtifacts,
    );
    const runJobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${runJobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const result = await scientificImbalanceResult(run.bundle);
    const resultText = JSON.stringify(result);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${runJobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postJson(
          harness.app,
          `/api/runner/jobs/${runJobId}/callback`,
          {
            schemaVersion: "1",
            callbackId: "callback_imbalance_before_patch_v5",
            idempotencyKey: "imbalance-before-patch-v5",
            jobId: runJobId,
            stateVersion: run.dispatch.job.stateVersion,
            status: "VERIFIED",
            outputHashes: [await sha256Text(resultText)],
            finalEventCursor: 0,
            occurredAt: "2026-07-14T10:00:04.000Z",
          },
          run.authorization,
        )
      ).status,
    ).toBe(200);
    await queueAndVerifyBoundary(harness, "imbalance-before-patch");
    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.sessionId}/revision`,
          {
            revision:
              "Rare-event accuracy needs a majority baseline and class-specific evidence.",
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.sessionId}/transfer`,
          {
            decisionChoice: "reject_accuracy_only",
            metricChoice: "recall_and_pr_auc",
            evidenceChoices: ["zero_true_positives", "rare_base_rate"],
          },
        )
      ).status,
    ).toBe(200);

    const patchQueued = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/patch/compile`,
    );
    expect(patchQueued.status).toBe(202);
    const patchDispatch = harness.dispatcher.dispatched[3];
    if (patchDispatch === undefined) {
      throw new Error("class-imbalance v5 patch was not dispatched");
    }
    const inputObject = harness.runnerObjects.objects.get(
      `runner-input/${patchDispatch.job.jobId}.json`,
    );
    if (inputObject === undefined) {
      throw new Error("class-imbalance v5 patch bundle is missing");
    }
    const patchBundle = RunnerPatchCompileBundleV5Schema.parse(
      JSON.parse(inputObject.body),
    );
    expect(patchBundle).toMatchObject({
      approvedBeliefSpec: { concept: "class_imbalance" },
      transferContractId: "manufacturing-rare-defect-v1",
      transferResult: { taskId: "manufacturing-defect-transfer-01" },
      patchContract: {
        id: "imbalance-notebook-patch-v1",
        allowedTransformations: [
          "stratify_classification_holdout",
          "add_majority_baseline",
          "replace_accuracy_only_evaluation",
        ],
      },
    });
    const patchAuthorization = {
      authorization: `Bearer ${patchDispatch.token}`,
    };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/start`,
          { method: "POST", headers: patchAuthorization },
        )
      ).status,
    ).toBe(200);
    const targetCell = patchBundle.allowedCellIndices[0];
    const targetField =
      patchBundle.artifactManifest.schemaSummary.targetCandidates[0];
    if (targetCell === undefined || targetField === undefined) {
      throw new Error("class-imbalance patch target is unresolved");
    }
    const patchPlan = {
      schemaVersion: "1" as const,
      planId: "patch_plan_imbalance_scientific_v5",
      sessionId: patchBundle.sessionId,
      concept: "class_imbalance" as const,
      conceptPackVersion: patchBundle.conceptPackVersion,
      artifactManifestHash: patchBundle.artifactManifestHash,
      sourceArtifactHash: patchBundle.artifactManifest.fileSha256,
      transferResultHash: patchBundle.transferResult.resultHash,
      verifiedResultHash: patchBundle.releaseAuthority.authoritativeResultHash,
      evidenceRefs: patchBundle.approvedBeliefSpec.evidenceRefs,
      targetCells: [targetCell],
      targetField,
      operations: [
        {
          id: "stratify_classification_holdout" as const,
          cellIndex: targetCell,
          reason: "Preserve rare-event prevalence in the holdout.",
        },
        {
          id: "add_majority_baseline" as const,
          cellIndex: targetCell,
          reason: "Compute the trivial high-accuracy reference.",
        },
        {
          id: "replace_accuracy_only_evaluation" as const,
          cellIndex: targetCell,
          reason: "Show minority errors and threshold-sensitive metrics.",
        },
      ],
      preserveUnrelatedCells: true as const,
      nonClaims: ["This does not choose a universal production threshold."],
    };
    const patchPlanText = JSON.stringify(patchPlan);
    const rationaleText =
      "This patch adds the registered rare-event evaluation block only.";
    for (const [path, body, contentType] of [
      ["patch-plan.json", patchPlanText, "application/json"],
      ["public-rationale.md", rationaleText, "text/markdown"],
    ] as const) {
      expect(
        (
          await harness.app.request(
            `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/${path}`,
            {
              method: "PUT",
              headers: {
                ...patchAuthorization,
                "content-type": contentType,
              },
              body,
            },
          )
        ).status,
      ).toBe(201);
    }
    const patchPlanHash = await sha256Text(patchPlanText);
    const candidate = await postJson(
      harness.app,
      `/api/runner/jobs/${patchDispatch.job.jobId}/candidate`,
      { attempt: 1, planSha256: patchPlanHash },
      patchAuthorization,
    );
    expect(candidate.status).toBe(200);
    await expect(candidate.json()).resolves.toMatchObject({
      data: { status: "VERIFIED" },
    });
    const scopedSource = await harness.app.request(
      `/api/runner/jobs/${patchDispatch.job.jobId}/source`,
      { headers: patchAuthorization },
    );
    expect(scopedSource.status).toBe(200);
    await expect(scopedSource.text()).resolves.toBe(imbalanceNotebookText);

    const patchedNotebook = JSON.stringify({
      cells: [
        { cell_type: "markdown", source: ["Rare-event evaluation"] },
        { cell_type: "code", source: ["# verified metric block"] },
      ],
      metadata: {},
      nbformat: 4,
      nbformat_minor: 5,
    });
    const patchedNotebookHash = await sha256Text(patchedNotebook);
    const diff =
      "@@ cell 2 @@\n- accuracy only\n+ majority baseline and minority metrics";
    const patchPayload = {
      schemaVersion: "1" as const,
      id: "patch_imbalance_scientific_v5",
      sessionId: patchBundle.sessionId,
      status: "VERIFIED" as const,
      sourceArtifactHash: patchBundle.artifactManifest.fileSha256,
      patchedArtifactHash: patchedNotebookHash,
      patchHash: await hashCanonical(diff),
      modifiedCells: [targetCell],
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
      generatedAt: patchBundle.requestedAt,
    };
    const patchResult = {
      ...patchPayload,
      resultHash: await hashCanonical(patchPayload),
    };
    const patchResultText = JSON.stringify(patchResult);
    for (const [path, body, contentType] of [
      ["patched-notebook.ipynb", patchedNotebook, "application/x-ipynb+json"],
      ["patch-result.json", patchResultText, "application/json"],
    ] as const) {
      expect(
        (
          await harness.app.request(
            `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/${path}`,
            {
              method: "PUT",
              headers: {
                ...patchAuthorization,
                "content-type": contentType,
              },
              body,
            },
          )
        ).status,
      ).toBe(201);
    }
    const patchJob = await harness.runnerJobs.find(patchDispatch.job.jobId);
    if (patchJob === undefined) {
      throw new Error("class-imbalance patch job disappeared");
    }
    const patchCallback = await postJson(
      harness.app,
      `/api/runner/jobs/${patchDispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_imbalance_scientific_patch_v5",
        idempotencyKey: "imbalance-scientific-patch-v5",
        jobId: patchDispatch.job.jobId,
        stateVersion: patchDispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [
          patchPlanHash,
          await sha256Text(rationaleText),
          patchedNotebookHash,
          await sha256Text(patchResultText),
        ],
        finalEventCursor: patchJob.eventCursor,
        occurredAt: "2026-07-14T10:00:06.000Z",
      },
      patchAuthorization,
    );
    expect(patchCallback.status).toBe(200);
    await expect(patchCallback.json()).resolves.toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "PROOF_CAPSULE_ISSUED",
          patchResult: { resultHash: patchResult.resultHash },
          reasoningDiffV2: {
            schemaVersion: "2",
            authority: {
              authoritativeResultHash: result.resultHash,
              patchResultHash: patchResult.resultHash,
            },
          },
          proofCapsule: {
            schemaVersion: "2",
            mode: "live_notebook",
            integrity: { mode: "integrity-hashed" },
          },
        },
      },
    });
    const storedAuthority = await harness.sessionRepository.find(
      patchBundle.sessionId,
    );
    expect(storedAuthority?.resultAuthority).toMatchObject({
      jobId: runJobId,
      resultHash: result.resultHash,
      resultFileHash: await sha256Text(resultText),
    });
    expect(storedAuthority?.patchAuthority).toMatchObject({
      jobId: patchDispatch.job.jobId,
      patchPlanHash: await hashCanonical(patchPlan),
      patchPlanFileHash: patchPlanHash,
      patchedArtifactHash: patchedNotebookHash,
      patchResultHash: patchResult.resultHash,
    });

    const replayPublication = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/replays`,
    );
    expect(
      replayPublication.status,
      await replayPublication.clone().text(),
    ).toBe(201);
    const replayPublicationPayload = (await replayPublication.json()) as {
      data: { replay: { replayId: string } };
    };
    const hostedReplay = await harness.app.request(
      `/api/replays/${replayPublicationPayload.data.replay.replayId}`,
    );
    expect(hostedReplay.status).toBe(200);
    const hostedReplayBody = (await hostedReplay.json()) as { data: unknown };
    const publicReplay = PublicReplayProjectionV1Schema.parse(
      hostedReplayBody.data,
    );
    expect(publicReplay).toMatchObject({
      schemaVersion: "1",
      projectionKind: "public_replay",
      replay: true,
      concept: "class_imbalance",
      artifact: { kind: "notebook" },
      test: {
        result: {
          concept: "class_imbalance",
          resultHash: result.resultHash,
        },
      },
      repair: { resultHash: patchResult.resultHash },
      provenance: {
        conceptPackVersion: result.conceptPackVersion,
        kernelVersion: result.kernelVersion,
      },
    });
    expect(JSON.stringify(publicReplay)).not.toContain(harness.artifactId);
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
      learnerClaim: SAMPLE_LEAKAGE_QUESTION,
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
        conceptPack: {
          id: "entity_leakage",
          version: LIVE_LEAKAGE_PACK_VERSION,
        },
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
      conceptPackVersion: LIVE_LEAKAGE_PACK_VERSION,
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

    const compileEvidence =
      await harness.sessionRepository.listEvents(sessionId);
    expect(
      compileEvidence.find((event) => event.kind === "lab.compilation_started"),
    ).toMatchObject({
      actor: "system",
      payload: { authority: "runtime-codex-requested" },
    });
    expect(
      compileEvidence.find((event) => event.kind === "lab.verified"),
    ).toMatchObject({
      actor: "verifier",
      payload: {
        status: "VERIFIED",
        source: "hosted-plan-v2",
        jobId: dispatch.job.jobId,
        planHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      },
    });
    expect(compileEvidence.some((event) => event.actor === "codex")).toBe(
      false,
    );

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
      conceptPackVersion: LIVE_LEAKAGE_PACK_VERSION,
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
    expect(download.headers.get("x-content-type-options")).toBe("nosniff");
    expect(download.headers.get("cache-control")).toBe("private, no-store");
    await expect(download.text()).resolves.toBe(patchedNotebookText);
  });

  it("budgets a v5 compiler job through two bounded repairs and scopes its token past the deadline", async () => {
    const harness = await preparedScientificHostedRunner();
    const claims = await verifyRunnerJobToken(
      harness.dispatch.token,
      TEST_RUNNER_VERIFYING_PUBLIC_KEY,
      {
        nowEpochSeconds: Date.parse("2026-07-14T10:00:00.000Z") / 1_000,
        jobId: harness.dispatch.job.jobId,
        purpose: "RUN_JOB",
      },
    );

    expect(harness.dispatch.job).toMatchObject({
      kind: "LAB_COMPILE",
      maxAttempts: 3,
      timeoutSeconds: 420,
    });
    expect(harness.bundle.resourceLimits.wallSeconds).toBe(120);
    expect(claims.expiresAt - claims.issuedAt).toBe(
      harness.dispatch.job.timeoutSeconds + 120,
    );
    expect(claims.expiresAt - claims.issuedAt).toBeLessThanOrEqual(900);
  });

  it("reuses an authenticated duplicate runner start without advancing its version", async () => {
    const harness = await preparedScientificHostedRunner();
    const jobId = harness.dispatch.job.jobId;
    const authorization = {
      authorization: `Bearer ${harness.dispatch.token}`,
    };
    const first = await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
      method: "POST",
      headers: authorization,
    });
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: { runnerJob: RunnerJob; reused?: boolean };
    };

    const duplicate = await harness.app.request(
      `/api/runner/jobs/${jobId}/start`,
      { method: "POST", headers: authorization },
    );
    expect(duplicate.status).toBe(200);
    const duplicateBody = (await duplicate.json()) as {
      data: { runnerJob: RunnerJob; reused?: boolean };
    };
    expect(duplicateBody).toMatchObject({
      data: {
        runnerJob: { jobId, status: "RUNNING" },
        reused: true,
      },
    });
    expect(duplicateBody.data.runnerJob.jobVersion).toBe(
      firstBody.data.runnerJob.jobVersion,
    );
  });

  it("accepts exactly four v5 artifacts, fixes selection, and persists the projected execution plan", async () => {
    const harness = await preparedScientificHostedRunner();
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

    const artifacts = await scientificCandidateArtifacts(harness.bundle);
    const artifactHashes = {} as Record<keyof typeof artifacts, string>;
    for (const [path, body] of Object.entries(artifacts) as Array<
      [keyof typeof artifacts, string]
    >) {
      const uploaded = await harness.app.request(
        `/api/runner/jobs/${jobId}/outputs/${path}`,
        {
          method: "PUT",
          headers: {
            ...authorization,
            "content-type": path.endsWith(".json")
              ? "application/json"
              : "text/markdown; charset=utf-8",
          },
          body,
        },
      );
      expect(uploaded.status, path).toBe(201);
      artifactHashes[path] = await sha256Text(body);
    }

    const forbiddenLegacyOutput = await harness.app.request(
      `/api/runner/jobs/${jobId}/outputs/experiment-plan.json`,
      {
        method: "PUT",
        headers: { ...authorization, "content-type": "application/json" },
        body: JSON.stringify({ schemaVersion: "2" }),
      },
    );
    expect(forbiddenLegacyOutput.status).toBe(403);
    await expect(forbiddenLegacyOutput.json()).resolves.toMatchObject({
      error: { code: "RUNNER_OUTPUT_NOT_PERMITTED" },
    });

    const missingHash = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/candidate`,
      {
        schemaVersion: "5",
        attempt: 1,
        artifactHashes: {
          "discrimination-contract.json":
            artifactHashes["discrimination-contract.json"],
          "experiment-ir.json": artifactHashes["experiment-ir.json"],
          "public-rationale.md": artifactHashes["public-rationale.md"],
        },
      },
      authorization,
    );
    expect(missingHash.status).toBe(400);
    await expect(missingHash.json()).resolves.toMatchObject({
      error: { code: "VALIDATION_ERROR" },
    });

    const wrongHash = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/candidate`,
      {
        schemaVersion: "5",
        attempt: 1,
        artifactHashes: {
          ...artifactHashes,
          "lab-scene.json": "f".repeat(64),
        },
      },
      authorization,
    );
    expect(wrongHash.status).toBe(409);
    await expect(wrongHash.json()).resolves.toMatchObject({
      error: { code: "RUNNER_OUTPUT_HASH_MISMATCH" },
    });

    const candidate = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/candidate`,
      {
        schemaVersion: "5",
        attempt: 1,
        artifactHashes,
      },
      authorization,
    );
    expect(candidate.status).toBe(200);
    const candidatePayload = (await candidate.json()) as {
      data: { runnerJob: RunnerJob };
    };
    expect(candidatePayload).toMatchObject({
      ok: true,
      data: {
        status: "VERIFIED",
        canRepair: false,
        selection: {
          selectedCandidateId: "group-holdout-plus-ablation",
          scorerVersion: "experiment-scorer-v1",
        },
        verification: { status: "VERIFIED" },
        runnerJob: { status: "RUNNING" },
      },
    });

    const generated = [...harness.runnerObjects.objects.entries()].filter(
      ([key]) => key.startsWith(`runner-output/${jobId}/`),
    );
    const authority = [...harness.runnerObjects.objects.entries()].filter(
      ([key]) => key.startsWith(`runner-authority/${jobId}/`),
    );
    const rawIrObject = generated.find(([key]) =>
      key.endsWith("/experiment-ir.json"),
    )?.[1];
    const selectedIrObject = authority.find(([key]) =>
      key.endsWith("/selected-experiment-ir.json"),
    )?.[1];
    const projectedPlanObject = authority.find(([key]) =>
      key.endsWith("/experiment-plan.json"),
    )?.[1];
    expect(rawIrObject).toBeDefined();
    expect(selectedIrObject).toBeDefined();
    expect(projectedPlanObject).toBeDefined();
    expect(JSON.parse(rawIrObject!.body)).toMatchObject({
      schemaVersion: "5",
      selection: { status: "UNSELECTED" },
    });
    expect(JSON.parse(selectedIrObject!.body)).toMatchObject({
      schemaVersion: "5",
      selection: {
        status: "SELECTED",
        candidateId: "group-holdout-plus-ablation",
        scorerVersion: "experiment-scorer-v1",
      },
    });
    expect(JSON.parse(projectedPlanObject!.body)).toMatchObject({
      schemaVersion: "2",
      planId: "plan_live_v5",
      sessionId: harness.bundle.sessionId,
      beliefTestId: harness.bundle.approvedBeliefSpec.id,
      baseline: { operation: "leakage.random_row_split" },
      interventions: [
        { operation: "leakage.group_holdout" },
        { operation: "leakage.identity_ablation" },
      ],
    });

    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_compile_v5",
        idempotencyKey: "scientific-compile-v5-complete-1",
        jobId,
        stateVersion: harness.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: Object.values(artifactHashes),
        finalEventCursor: candidatePayload.data.runnerJob.eventCursor,
        occurredAt: "2026-07-14T10:00:01.000Z",
      },
      authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "LAB_VERIFIED",
        },
        verification: {
          status: "VERIFIED",
          reasonCode: "SELECTED",
          verifierVersion: "scientific-candidate-verifier-v4",
        },
      },
    });
    const storedSession = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    expect(storedSession?.labVerification).toMatchObject({
      status: "VERIFIED",
      source: "hosted-experiment-ir-v5",
      jobId,
      rawExperimentIrCanonicalHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      selectedExperimentIrHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      projectedPlanHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(storedSession?.beliefTest).toBeUndefined();
    expect(
      (
        await harness.sessionRepository.listEvents(harness.bundle.sessionId)
      ).find((event) => event.kind === "lab.verified")?.payload,
    ).toMatchObject({
      verifiedOperationSummary: {
        schemaVersion: "1",
        authority: "verified-selected-experiment-ir",
        authorityHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        selectionRef: "group-holdout-plus-ablation",
        operationIds: [
          "leakage.random_row_split",
          "leakage.group_holdout",
          "leakage.identity_ablation",
        ],
      },
    });

    const queuedRun = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/lab/run`,
    );
    expect(queuedRun.status).toBe(202);
    const runDispatch = harness.dispatcher.dispatched[1];
    if (runDispatch === undefined) throw new Error("v5 run was not dispatched");
    const runInput = harness.runnerObjects.objects.get(
      `runner-input/${runDispatch.job.jobId}.json`,
    );
    if (runInput === undefined) throw new Error("v5 run input is missing");
    const runBundle = RunnerLabRunBundleV5Schema.parse(
      JSON.parse(runInput.body),
    );
    expect(runBundle).toMatchObject({
      schemaVersion: "5",
      kind: "LAB_RUN",
      purpose: "AUTHORITATIVE",
      sessionId: harness.bundle.sessionId,
      approvedBeliefSpec: { id: harness.bundle.approvedBeliefSpec.id },
      selectedExperimentIr: {
        selection: {
          status: "SELECTED",
          candidateId: "group-holdout-plus-ablation",
        },
      },
      fixture: {
        id: "public-leakage-v1",
        version: "leakage-fixture-v1",
        contentSha256:
          "5c482f39e4e948a92dab61bf9c9f5c6577fbe9fc688fd597c9fefd785ee1be70",
      },
      provenance: {
        compileJobId: jobId,
        scientificVerifierVersion: "scientific-candidate-verifier-v4",
        scorerVersion: "experiment-scorer-v1",
      },
      permittedOutputs: ["verified-result.json"],
    });
    expect(runBundle).not.toHaveProperty("approvedBeliefTest");
    expect(runBundle).not.toHaveProperty("learnerClaim");
    const duplicateRun = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/lab/run`,
    );
    expect(duplicateRun.status).toBe(202);
    await expect(duplicateRun.json()).resolves.toMatchObject({
      data: {
        reused: true,
        runnerJob: { jobId: runDispatch.job.jobId, kind: "LAB_RUN" },
      },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(2);
  });

  it("rejects pack-incompatible transfer contracts for both live concepts before releasing execution authority", async () => {
    const cases: Array<{
      label: string;
      createHarness: () => Promise<ScientificHostedRunnerHarness>;
      createArtifacts: ScientificCandidateFactory;
    }> = [
      {
        label: "entity leakage",
        createHarness: preparedScientificHostedRunner,
        createArtifacts: scientificCandidateArtifacts,
      },
      {
        label: "class imbalance",
        createHarness: preparedScientificImbalanceHostedRunner,
        createArtifacts: scientificImbalanceCandidateArtifacts,
      },
    ];

    for (const testCase of cases) {
      const harness = await testCase.createHarness();
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
        testCase.label,
      ).toBe(200);

      const artifacts = await testCase.createArtifacts(harness.bundle);
      const rawIr = ExperimentIRV5Schema.parse(
        JSON.parse(artifacts["experiment-ir.json"]),
      );
      const privateModelText = `Do not echo model-authored ${testCase.label} transfer prose.`;
      const mutatedIr = ExperimentIRV5Schema.parse({
        ...rawIr,
        transfer: {
          taskId: "transfer.foreign-contract",
          changedSurface: privateModelText,
          requiredActionIds: ["foreign_action"],
          nonClaims: [privateModelText],
        },
      });
      const rawScene = LabSceneV2Schema.parse(
        JSON.parse(artifacts["lab-scene.json"]),
      );
      const mutatedScene = LabSceneV2Schema.parse({
        ...rawScene,
        provenance: {
          ...rawScene.provenance,
          experimentIrHash: await hashExperimentIR(mutatedIr),
        },
      });
      const mutatedArtifacts: ScientificCandidateArtifacts = {
        ...artifacts,
        "experiment-ir.json": JSON.stringify(mutatedIr),
        "lab-scene.json": JSON.stringify(mutatedScene),
      };
      const artifactHashes = {} as Record<
        keyof ScientificCandidateArtifacts,
        string
      >;
      for (const [path, body] of Object.entries(mutatedArtifacts) as Array<
        [keyof ScientificCandidateArtifacts, string]
      >) {
        const upload = await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/${path}`,
          {
            method: "PUT",
            headers: {
              ...authorization,
              "content-type": path.endsWith(".json")
                ? "application/json"
                : "text/markdown; charset=utf-8",
            },
            body,
          },
        );
        expect(upload.status, `${testCase.label}: ${path}`).toBe(201);
        artifactHashes[path] = await sha256Text(body);
      }

      const candidate = await postJson(
        harness.app,
        `/api/runner/jobs/${jobId}/candidate`,
        { schemaVersion: "5", attempt: 1, artifactHashes },
        authorization,
      );
      expect(candidate.status, testCase.label).toBe(200);
      const candidateBody = (await candidate.json()) as {
        data: {
          counterexamples: Array<{ invariant: string }>;
          runnerJob: RunnerJob;
        };
      };
      expect(candidateBody).toMatchObject({
        data: {
          status: "REJECTED",
          canRepair: true,
          counterexamples: expect.arrayContaining([
            expect.objectContaining({ invariant: "transfer_contract" }),
          ]),
          runnerJob: { status: "REPAIRING", attempt: 2 },
        },
      });
      expect(JSON.stringify(candidateBody)).not.toContain(privateModelText);

      const authorityKeys = [...harness.runnerObjects.objects.keys()].filter(
        (key) => key.startsWith(`runner-authority/${jobId}/`),
      );
      expect(authorityKeys).toContain(
        `runner-authority/${jobId}/candidate-verification.json`,
      );
      expect(authorityKeys).not.toContain(
        `runner-authority/${jobId}/selected-experiment-ir.json`,
      );
      expect(authorityKeys).not.toContain(
        `runner-authority/${jobId}/experiment-plan.json`,
      );

      const run = await postJson(
        harness.app,
        `/api/sessions/${harness.bundle.sessionId}/lab/run`,
      );
      expect(run.status, testCase.label).toBe(409);
      await expect(run.json()).resolves.toMatchObject({
        error: { code: "LIVE_CONTRACTS_REQUIRED" },
      });
      const patch = await postJson(
        harness.app,
        `/api/sessions/${harness.bundle.sessionId}/patch/compile`,
      );
      expect(patch.status, testCase.label).toBe(409);
      await expect(patch.json()).resolves.toMatchObject({
        error: { code: "LIVE_PATCH_CONTRACTS_REQUIRED" },
      });
      expect(harness.dispatcher.dispatched).toHaveLength(1);

      const session = await harness.sessionRepository.find(
        harness.bundle.sessionId,
      );
      expect(session).not.toHaveProperty("labVerification");
      expect(session).not.toHaveProperty("verifiedResult");
      expect(session).not.toHaveProperty("transferResult");
      expect(session).not.toHaveProperty("patchResult");
      const publicEvents = await harness.runnerJobs.listEvents(jobId, 0);
      expect(JSON.stringify(publicEvents)).not.toContain(privateModelText);

      const resume = await harness.app.request(
        `/api/runner/jobs/${jobId}/resume`,
        { method: "POST", headers: authorization },
      );
      expect(resume.status, testCase.label).toBe(200);
      const repairedHashes = {} as Record<
        keyof ScientificCandidateArtifacts,
        string
      >;
      for (const [path, body] of Object.entries(artifacts) as Array<
        [keyof ScientificCandidateArtifacts, string]
      >) {
        const upload = await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/${path}`,
          {
            method: "PUT",
            headers: {
              ...authorization,
              "content-type": path.endsWith(".json")
                ? "application/json"
                : "text/markdown; charset=utf-8",
            },
            body,
          },
        );
        expect(upload.status, `${testCase.label}: repaired ${path}`).toBe(201);
        repairedHashes[path] = await sha256Text(body);
      }
      const repairedCandidate = await postJson(
        harness.app,
        `/api/runner/jobs/${jobId}/candidate`,
        { schemaVersion: "5", attempt: 2, artifactHashes: repairedHashes },
        authorization,
      );
      expect(repairedCandidate.status, testCase.label).toBe(200);
      const repairedBody = (await repairedCandidate.json()) as {
        data: { runnerJob: RunnerJob };
      };
      expect(repairedBody).toMatchObject({
        data: {
          status: "VERIFIED",
          canRepair: false,
          runnerJob: { status: "RUNNING", attempt: 2 },
          verification: { status: "VERIFIED" },
        },
      });
      const callback = await postJson(
        harness.app,
        `/api/runner/jobs/${jobId}/callback`,
        {
          schemaVersion: "1",
          callbackId: `callback_transfer_repair_${harness.bundle.conceptPack.id}`,
          idempotencyKey: `transfer-repair-${harness.bundle.conceptPack.id}`,
          jobId,
          stateVersion: harness.dispatch.job.stateVersion,
          status: "VERIFIED",
          outputHashes: Object.values(repairedHashes),
          finalEventCursor: repairedBody.data.runnerJob.eventCursor,
          occurredAt: "2026-07-14T10:00:01.000Z",
        },
        authorization,
      );
      expect(callback.status, testCase.label).toBe(200);
      await expect(callback.json()).resolves.toMatchObject({
        data: {
          runnerJob: { status: "VERIFIED", attempt: 2 },
          session: { state: "LAB_VERIFIED" },
          verification: { status: "VERIFIED" },
        },
      });
      const repairedRun = await postJson(
        harness.app,
        `/api/sessions/${harness.bundle.sessionId}/lab/run`,
      );
      expect(repairedRun.status, testCase.label).toBe(202);
      expect(harness.dispatcher.dispatched).toHaveLength(2);
    }
  });

  it("releases a v5 fixed result only after Worker-owned epistemic verification", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const jobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    for (const event of [
      {
        schemaVersion: "1" as const,
        eventId: "event_v5_run_started",
        jobId,
        cursor: 1,
        at: "2026-07-14T10:00:02.000Z",
        kind: "job.started" as const,
      },
      {
        schemaVersion: "1" as const,
        eventId: "event_v5_kernel_completed",
        jobId,
        cursor: 2,
        at: "2026-07-14T10:00:03.000Z",
        kind: "command.completed" as const,
        label: "Execute fixed kernel",
        exitCode: 0,
        durationMs: 18,
        excerpt: "Fixed result bytes uploaded for external verification.",
      },
    ]) {
      const accepted = await postJson(
        harness.app,
        `/api/runner/jobs/${jobId}/events`,
        event,
        run.authorization,
      );
      expect(accepted.status).toBe(201);
    }
    const result = await scientificLeakageResult(run.bundle);
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    const uploaded = await harness.app.request(
      `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
      {
        method: "PUT",
        headers: {
          ...run.authorization,
          "content-type": "application/json",
        },
        body: resultText,
      },
    );
    expect(uploaded.status).toBe(201);
    expect(
      (await harness.runnerJobs.listEvents(jobId, 0)).map(
        (event) => event.kind,
      ),
    ).toEqual(["job.started", "command.completed"]);

    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_scientific_run_v5",
      idempotencyKey: "scientific-run-v5-complete",
      jobId,
      stateVersion: run.dispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [resultFileHash],
      finalEventCursor: 2,
      occurredAt: "2026-07-14T10:00:04.000Z",
    };
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      run.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        duplicate: false,
        runnerJob: { status: "VERIFIED", eventCursor: 4 },
        session: {
          state: "EXPERIMENT_COMPLETED",
          verifiedResult: { resultHash: result.resultHash },
          evidenceVerdict: {
            kind: "SUPPORTS",
            hypothesisId: "competing",
            resultHash: result.resultHash,
          },
          epistemicReportHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
        verification: {
          status: "VERIFIED",
          verdict: { kind: "SUPPORTS", resultHash: result.resultHash },
          technicalReport: { status: "VERIFIED" },
        },
      },
    });
    expect(
      (await harness.runnerJobs.listEvents(jobId, 0)).map((event) => ({
        cursor: event.cursor,
        kind: event.kind,
        at: event.at,
      })),
    ).toEqual([
      {
        cursor: 1,
        kind: "job.started",
        at: "2026-07-14T10:00:02.000Z",
      },
      {
        cursor: 2,
        kind: "command.completed",
        at: "2026-07-14T10:00:03.000Z",
      },
      {
        cursor: 3,
        kind: "verifier.verified",
        at: "2026-07-14T10:00:00.000Z",
      },
      {
        cursor: 4,
        kind: "result.ready",
        at: "2026-07-14T10:00:00.000Z",
      },
    ]);
    for (const file of [
      "technical-verification.json",
      "epistemic-verification.json",
      "evidence-verdict.json",
    ]) {
      expect(
        harness.runnerObjects.objects.has(`runner-authority/${jobId}/${file}`),
      ).toBe(true);
    }

    await queueAndVerifyBoundary(harness, "leakage-before-revision");

    const revised = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/revision`,
      {
        revision:
          "Deployment units must determine the evaluation split before I trust generalization.",
      },
    );
    expect(revised.status).toBe(200);
    const duplicate = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      run.authorization,
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: {
        duplicate: true,
        runnerJob: { eventCursor: 4 },
        session: { state: "REVISION_RECORDED" },
      },
    });
    expect(await harness.runnerJobs.listEvents(jobId, 0)).toHaveLength(4);

    const transfer = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/transfer`,
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: [
          "center_true_uses_later_targets",
          "random_split_mixes_dates",
        ],
      },
    );
    expect(transfer.status).toBe(200);
    await expect(transfer.json()).resolves.toMatchObject({
      data: {
        state: "TRANSFER_PASSED",
        transferResult: {
          taskId: "forecasting-future-leakage-01",
          evaluatorVersion: "counterlab-transfer-v1",
        },
      },
    });
  });

  it("withholds, binds, and revalidates the generated Lab Scene against the verified live result", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const sessionId = harness.bundle.sessionId;

    const withheld = await harness.app.request(
      `/api/sessions/${sessionId}/lab-scene`,
    );
    expect(withheld.status).toBe(409);
    await expect(withheld.json()).resolves.toMatchObject({
      error: { code: "LAB_SCENE_RESULT_REQUIRED" },
    });

    const runJobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${runJobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const result = await scientificLeakageResult(run.bundle);
    const resultText = JSON.stringify(result);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${runJobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postJson(
          harness.app,
          `/api/runner/jobs/${runJobId}/callback`,
          {
            schemaVersion: "1",
            callbackId: "callback_lab_scene_result",
            idempotencyKey: "lab-scene-result-complete",
            jobId: runJobId,
            stateVersion: run.dispatch.job.stateVersion,
            status: "VERIFIED",
            outputHashes: [await sha256Text(resultText)],
            finalEventCursor: 0,
            occurredAt: "2026-07-14T10:00:04.000Z",
          },
          run.authorization,
        )
      ).status,
    ).toBe(200);

    const completedSession = await harness.sessionRepository.find(sessionId);
    const lineage = HostedExperimentLineageV5Schema.parse(
      completedSession?.labVerification,
    );

    const response = await harness.app.request(
      `/api/sessions/${sessionId}/lab-scene`,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const expectedScene = LabSceneV2Schema.parse(
      JSON.parse(run.staged.artifacts["lab-scene.json"]),
    );
    expect(
      expectedScene.blocks.filter((block) => block.type === "Metric"),
    ).toHaveLength(2);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        schemaVersion: "1",
        scene: expectedScene,
        verifiedSceneHash: lineage.labSceneHash,
        signedResult: {
          verificationStatus: "VERIFIED",
          sceneHash: lineage.labSceneHash,
          sessionId,
          resultHash: result.resultHash,
          integrity: {
            mode: "integrity-hashed",
            contentHash: result.resultHash,
          },
          result: { resultHash: result.resultHash },
        },
      },
    });

    const frozenSceneKey = `runner-authority/${run.staged.jobId}/compiler-output/lab-scene.json`;
    const frozenScene = harness.runnerObjects.objects.get(frozenSceneKey);
    if (frozenScene === undefined) {
      throw new Error("frozen Lab Scene bytes are missing");
    }
    const mutatedScene = {
      ...(JSON.parse(frozenScene.body) as Record<string, unknown>),
      title: "A stale result-bearing presentation",
    };
    harness.runnerObjects.objects.set(frozenSceneKey, {
      ...frozenScene,
      body: JSON.stringify(mutatedScene),
    });
    const drifted = await harness.app.request(
      `/api/sessions/${sessionId}/lab-scene`,
    );
    expect(drifted.status).toBe(409);
    await expect(drifted.json()).resolves.toMatchObject({
      error: { code: "SCIENTIFIC_VERIFIER_REJECTED" },
    });
  });

  it("dispatches, verifies, resumes, and retrieves a frozen Boundary Map", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const runJobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${runJobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const primaryResult = await scientificLeakageResult(run.bundle);
    const primaryText = JSON.stringify(primaryResult);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${runJobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: primaryText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postJson(
          harness.app,
          `/api/runner/jobs/${runJobId}/callback`,
          {
            schemaVersion: "1",
            callbackId: "callback_primary_before_boundary",
            idempotencyKey: "primary-before-boundary",
            jobId: runJobId,
            stateVersion: run.dispatch.job.stateVersion,
            status: "VERIFIED",
            outputHashes: [await sha256Text(primaryText)],
            finalEventCursor: 0,
            occurredAt: "2026-07-14T10:00:04.000Z",
          },
          run.authorization,
        )
      ).status,
    ).toBe(200);

    const queued = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/boundary/run`,
    );
    expect(queued.status, await queued.clone().text()).toBe(202);
    const boundaryDispatch = harness.dispatcher.dispatched[2];
    if (boundaryDispatch === undefined) {
      throw new Error("Boundary Map runner was not dispatched");
    }
    expect(boundaryDispatch.job.requestIdentity).toMatchObject({
      purpose: "LAB_RUN_BOUNDARY",
    });
    const boundaryInput = harness.runnerObjects.objects.get(
      `runner-input/${boundaryDispatch.job.jobId}.json`,
    );
    if (boundaryInput === undefined) {
      throw new Error("Boundary Map input bundle is missing");
    }
    const boundaryBundle = RunnerBoundaryMapBundleV5Schema.parse(
      JSON.parse(boundaryInput.body),
    );
    expect(boundaryBundle).toMatchObject({
      purpose: "BOUNDARY",
      seed: 1729,
      permittedOutputs: ["boundary-map.json"],
      releaseAuthority: {
        authoritativeResultHash: primaryResult.resultHash,
      },
    });
    expect(boundaryBundle.selectedExperimentIr.candidateExperiments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          baseline: expect.objectContaining({ seed: 1729 }),
        }),
      ]),
    );
    const duplicateQueue = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/boundary/run`,
    );
    expect(duplicateQueue.status).toBe(202);
    await expect(duplicateQueue.json()).resolves.toMatchObject({
      data: {
        reused: true,
        runnerJob: { jobId: boundaryDispatch.job.jobId },
      },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(3);

    const prematureRevision = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/revision`,
      {
        revision:
          "Deployment units must determine the evaluation split before I trust generalization.",
      },
    );
    expect(prematureRevision.status).toBe(400);
    await expect(prematureRevision.json()).resolves.toMatchObject({
      error: {
        code: "SESSION_INPUT_ERROR",
        message: expect.stringMatching(/verified Boundary Map/i),
      },
    });
    expect(
      (await harness.sessionRepository.find(harness.bundle.sessionId))?.state,
    ).toBe("EXPERIMENT_COMPLETED");

    const boundaryAuthorization = {
      authorization: `Bearer ${boundaryDispatch.token}`,
    };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${boundaryDispatch.job.jobId}/start`,
          { method: "POST", headers: boundaryAuthorization },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${boundaryDispatch.job.jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...boundaryAuthorization,
              "content-type": "application/json",
            },
            body: primaryText,
          },
        )
      ).status,
    ).toBe(403);
    const forgedResultEvent = await postJson(
      harness.app,
      `/api/runner/jobs/${boundaryDispatch.job.jobId}/events`,
      {
        schemaVersion: "1",
        eventId: "forged_boundary_result",
        jobId: boundaryDispatch.job.jobId,
        cursor: 1,
        at: "2026-07-14T10:00:05.000Z",
        kind: "result.ready",
        resultHash: "f".repeat(64),
      },
      boundaryAuthorization,
    );
    expect(forgedResultEvent.status).toBe(403);

    const boundaryResult = await scientificBoundaryMap(boundaryBundle);
    const boundaryText = JSON.stringify(boundaryResult);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${boundaryDispatch.job.jobId}/outputs/boundary-map.json`,
          {
            method: "PUT",
            headers: {
              ...boundaryAuthorization,
              "content-type": "application/json",
            },
            body: boundaryText,
          },
        )
      ).status,
    ).toBe(201);
    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_boundary_v5",
      idempotencyKey: "boundary-v5-complete",
      jobId: boundaryDispatch.job.jobId,
      stateVersion: boundaryDispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [await sha256Text(boundaryText)],
      finalEventCursor: 0,
      occurredAt: "2026-07-14T10:00:06.000Z",
    };
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${boundaryDispatch.job.jobId}/callback`,
      callbackBody,
      boundaryAuthorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        duplicate: false,
        runnerJob: { status: "VERIFIED", eventCursor: 2 },
        session: {
          state: "BOUNDARY_VERIFIED",
          boundaryMapAuthority: {
            jobId: boundaryDispatch.job.jobId,
            resultHash: boundaryResult.resultHash,
            cellCount: 25,
            receipt: {
              integrity: { mode: "integrity-hashed" },
            },
          },
        },
        verification: { status: "VERIFIED" },
      },
    });
    expect(
      (await harness.runnerJobs.listEvents(boundaryDispatch.job.jobId, 0)).map(
        (event) => event.kind,
      ),
    ).toEqual(["verifier.verified", "result.ready"]);
    for (const file of [
      "boundary-map.json",
      "boundary-map-expectation.json",
      "boundary-map-verification.json",
      "boundary-map-receipt.json",
    ]) {
      expect(
        harness.runnerObjects.objects.has(
          `runner-authority/${boundaryDispatch.job.jobId}/${file}`,
        ),
      ).toBe(true);
    }

    await harness.runnerObjects.put(
      `runner-output/${boundaryDispatch.job.jobId}/boundary-map.json`,
      JSON.stringify({ tampered: true }),
      "application/json",
    );
    const retrieval = await harness.app.request(
      `/api/sessions/${harness.bundle.sessionId}/boundary`,
    );
    expect(retrieval.status).toBe(200);
    expect(retrieval.headers.get("cache-control")).toBe("private, no-store");
    await expect(retrieval.json()).resolves.toMatchObject({
      data: {
        result: { resultHash: boundaryResult.resultHash },
        report: { status: "VERIFIED" },
        authority: { jobId: boundaryDispatch.job.jobId },
      },
    });

    const duplicateCallback = await postJson(
      harness.app,
      `/api/runner/jobs/${boundaryDispatch.job.jobId}/callback`,
      callbackBody,
      boundaryAuthorization,
    );
    expect(duplicateCallback.status).toBe(200);
    await expect(duplicateCallback.json()).resolves.toMatchObject({
      data: {
        duplicate: true,
        session: { state: "BOUNDARY_VERIFIED" },
      },
    });
    expect(
      await harness.runnerJobs.listEvents(boundaryDispatch.job.jobId, 0),
    ).toHaveLength(2);
  });

  it("withholds Boundary Map authority when the frozen verifier rejects a candidate", async () => {
    const harness = await preparedScientificHostedRunner();
    const prepared = await completePrimaryAndQueueBoundary(
      harness,
      scientificCandidateArtifacts,
      scientificLeakageResult,
      "boundary-rejection",
    );
    const jobId = prepared.boundaryDispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: prepared.boundaryAuthorization,
        })
      ).status,
    ).toBe(200);
    const valid = await scientificBoundaryMap(prepared.boundaryBundle);
    if (valid.concept !== "entity_leakage") {
      throw new Error("rejection test requires the leakage Boundary Map");
    }
    const { resultHash: _validHash, ...candidate } = valid;
    const mutatedPayload = {
      ...candidate,
      cells: candidate.cells.map((cell, index) =>
        index === 0
          ? {
              ...cell,
              groupEntityOverlap: { count: 1, rate: 1 / 120 },
            }
          : cell,
      ),
    };
    const rejectedResult = BoundaryMapResultV1Schema.parse({
      ...mutatedPayload,
      resultHash: await hashCanonical(mutatedPayload),
    });
    const rejectedText = JSON.stringify(rejectedResult);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/boundary-map.json`,
          {
            method: "PUT",
            headers: {
              ...prepared.boundaryAuthorization,
              "content-type": "application/json",
            },
            body: rejectedText,
          },
        )
      ).status,
    ).toBe(201);
    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_boundary_rejected_v5",
      idempotencyKey: "boundary-rejected-v5",
      jobId,
      stateVersion: prepared.boundaryDispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [await sha256Text(rejectedText)],
      finalEventCursor: 0,
      occurredAt: "2026-07-14T10:00:06.000Z",
    };
    const rejected = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      prepared.boundaryAuthorization,
    );
    expect(rejected.status).toBe(200);
    await expect(rejected.json()).resolves.toMatchObject({
      data: {
        duplicate: false,
        runnerJob: {
          status: "REJECTED",
          error: { code: "BOUNDARY_MAP_VERIFIER_REJECTED" },
        },
        session: {
          state: "EXPERIMENT_COMPLETED",
        },
        verification: { status: "REJECTED" },
      },
    });
    const session = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    expect(session?.boundaryMapAuthority).toBeUndefined();
    const events = await harness.runnerJobs.listEvents(jobId, 0);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every((event) => event.kind === "verifier.rejected")).toBe(
      true,
    );
    expect(events.some((event) => event.kind === "result.ready")).toBe(false);
    for (const file of [
      "boundary-map.json",
      "boundary-map-expectation.json",
      "boundary-map-verification.json",
    ]) {
      expect(
        harness.runnerObjects.objects.has(`runner-authority/${jobId}/${file}`),
      ).toBe(true);
    }
    expect(
      harness.runnerObjects.objects.has(
        `runner-authority/${jobId}/boundary-map-receipt.json`,
      ),
    ).toBe(false);
    const unavailable = await harness.app.request(
      `/api/sessions/${harness.bundle.sessionId}/boundary`,
    );
    expect(unavailable.status).toBe(409);
    await expect(unavailable.json()).resolves.toMatchObject({
      error: { code: "BOUNDARY_MAP_NOT_READY" },
    });
    const sessionEventCount = (
      await harness.sessionRepository.listEvents(harness.bundle.sessionId)
    ).length;
    const duplicate = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      prepared.boundaryAuthorization,
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: { duplicate: true, session: { state: "EXPERIMENT_COMPLETED" } },
    });
    expect(await harness.runnerJobs.listEvents(jobId, 0)).toHaveLength(
      events.length,
    );
    expect(
      await harness.sessionRepository.listEvents(harness.bundle.sessionId),
    ).toHaveLength(sessionEventCount);
  });

  it("verifies and retrieves an HMAC-signed class-imbalance Boundary Map", async () => {
    const harness = await preparedScientificImbalanceHostedRunner();
    const prepared = await completePrimaryAndQueueBoundary(
      harness,
      scientificImbalanceCandidateArtifacts,
      scientificImbalanceResult,
      "imbalance-boundary",
    );
    const jobId = prepared.boundaryDispatch.job.jobId;
    expect(prepared.boundaryBundle).toMatchObject({
      fixture: { id: "public-imbalance-v1" },
      seed: 2603,
      boundaryRequest: {
        axisIds: ["class_prevalence", "decision_threshold"],
        maxCells: 15,
      },
    });
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: prepared.boundaryAuthorization,
        })
      ).status,
    ).toBe(200);
    const boundaryResult = await scientificBoundaryMap(prepared.boundaryBundle);
    expect(boundaryResult).toMatchObject({
      concept: "class_imbalance",
      seed: 2603,
    });
    expect(boundaryResult.cells).toHaveLength(15);
    const boundaryText = JSON.stringify(boundaryResult);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/boundary-map.json`,
          {
            method: "PUT",
            headers: {
              ...prepared.boundaryAuthorization,
              "content-type": "application/json",
            },
            body: boundaryText,
          },
        )
      ).status,
    ).toBe(201);
    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_imbalance_boundary_v5",
      idempotencyKey: "imbalance-boundary-v5",
      jobId,
      stateVersion: prepared.boundaryDispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [await sha256Text(boundaryText)],
      finalEventCursor: 0,
      occurredAt: "2026-07-14T10:00:06.000Z",
    };
    const signingEnv = {
      COUNTERLAB_SIGNING_KEY:
        "counterlab-test-boundary-signing-key-with-sufficient-entropy",
      COUNTERLAB_SIGNING_KEY_ID: "boundary-test-key-v1",
    } as unknown as Env & Record<string, string>;
    const callback = await harness.app.request(
      `/api/runner/jobs/${jobId}/callback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...prepared.boundaryAuthorization,
        },
        body: JSON.stringify(callbackBody),
      },
      signingEnv,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        session: {
          state: "BOUNDARY_VERIFIED",
          boundaryMapAuthority: {
            cellCount: 15,
            receipt: {
              issuedAt: "2026-07-14T10:00:00.000Z",
              integrity: {
                mode: "hmac-signed",
                keyId: "boundary-test-key-v1",
              },
            },
          },
        },
        verification: { status: "VERIFIED" },
      },
    });

    const missingKey = await harness.app.request(
      `/api/sessions/${harness.bundle.sessionId}/boundary`,
    );
    expect(missingKey.status).toBe(503);
    await expect(missingKey.json()).resolves.toMatchObject({
      error: { code: "BOUNDARY_SIGNING_KEY_REQUIRED" },
    });
    const retrieved = await harness.app.request(
      `/api/sessions/${harness.bundle.sessionId}/boundary`,
      undefined,
      signingEnv,
    );
    expect(retrieved.status).toBe(200);
    await expect(retrieved.json()).resolves.toMatchObject({
      data: {
        result: {
          resultHash: boundaryResult.resultHash,
          cells: expect.any(Array),
        },
        receipt: {
          integrity: {
            mode: "hmac-signed",
            keyId: "boundary-test-key-v1",
          },
        },
      },
    });
    const wrongKey = await harness.app.request(
      `/api/sessions/${harness.bundle.sessionId}/boundary`,
      undefined,
      {
        ...signingEnv,
        COUNTERLAB_SIGNING_KEY: "wrong-boundary-signing-key",
      } as unknown as Env & Record<string, string>,
    );
    expect(wrongKey.status).toBe(409);
    await expect(wrongKey.json()).resolves.toMatchObject({
      error: { code: "BOUNDARY_AUTHORITY_INVALID" },
    });

    const duplicate = await harness.app.request(
      `/api/runner/jobs/${jobId}/callback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...prepared.boundaryAuthorization,
        },
        body: JSON.stringify(callbackBody),
      },
      signingEnv,
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: { duplicate: true, session: { state: "BOUNDARY_VERIFIED" } },
    });
  });

  it("dispatches a live v5 patch from frozen experiment, verdict, and transfer authority", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const runJobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${runJobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const result = await scientificLeakageResult(run.bundle);
    const resultText = JSON.stringify(result);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${runJobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postJson(
          harness.app,
          `/api/runner/jobs/${runJobId}/callback`,
          {
            schemaVersion: "1",
            callbackId: "callback_scientific_before_patch_v5",
            idempotencyKey: "scientific-before-patch-v5",
            jobId: runJobId,
            stateVersion: run.dispatch.job.stateVersion,
            status: "VERIFIED",
            outputHashes: [await sha256Text(resultText)],
            finalEventCursor: 0,
            occurredAt: "2026-07-14T10:00:04.000Z",
          },
          run.authorization,
        )
      ).status,
    ).toBe(200);
    await queueAndVerifyBoundary(harness, "leakage-before-patch");
    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.bundle.sessionId}/revision`,
          {
            revision:
              "Deployment units must determine the evaluation split before I trust generalization.",
          },
        )
      ).status,
    ).toBe(200);
    const transfer = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/transfer`,
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: [
          "center_true_uses_later_targets",
          "random_split_mixes_dates",
        ],
      },
    );
    expect(transfer.status).toBe(200);

    const patch = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/patch/compile`,
    );

    expect(patch.status).toBe(202);
    expect(harness.dispatcher.dispatched).toHaveLength(4);
    const patchDispatch = harness.dispatcher.dispatched[3];
    if (patchDispatch === undefined) {
      throw new Error("v5 patch runner was not dispatched");
    }
    expect(patchDispatch.job).toMatchObject({
      kind: "PATCH_COMPILE",
      maxAttempts: 3,
      timeoutSeconds: 420,
    });
    const inputObject = harness.runnerObjects.objects.get(
      `runner-input/${patchDispatch.job.jobId}.json`,
    );
    if (inputObject === undefined) {
      throw new Error("v5 patch input bundle is missing");
    }
    const bundle = RunnerPatchCompileBundleV5Schema.parse(
      JSON.parse(inputObject.body),
    );
    const session = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    if (
      session?.evidenceVerdict === undefined ||
      session.epistemicReportHash === undefined ||
      session.transferResult === undefined
    ) {
      throw new Error("v5 patch session authority is incomplete");
    }
    expect(bundle).toMatchObject({
      schemaVersion: "5",
      kind: "PATCH_COMPILE",
      approvedBeliefSpec: { id: harness.bundle.approvedBeliefSpec.id },
      compileAuthority: session.labVerification,
      selectedExperimentIr: run.bundle.selectedExperimentIr,
      fixedSelection: run.bundle.fixedSelection,
      basePlan: run.bundle.projectedPlan,
      releaseAuthority: {
        authoritativeResultHash: result.resultHash,
        evidenceVerdict: { kind: "SUPPORTS", resultHash: result.resultHash },
        epistemicReportHash: session.epistemicReportHash,
      },
      verifiedResultSummary: {
        concept: "entity_leakage",
        resultHash: result.resultHash,
        planId: run.bundle.projectedPlan.planId,
      },
      transferContractId: run.bundle.selectedExperimentIr.transfer.taskId,
      transferResult: {
        taskId: "forecasting-future-leakage-01",
        resultHash: session.transferResult.resultHash,
      },
    });
    expect(bundle).not.toHaveProperty("approvedBeliefTest");

    const duplicate = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/patch/compile`,
    );
    expect(duplicate.status).toBe(202);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: {
        reused: true,
        runnerJob: { jobId: patchDispatch.job.jobId },
      },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(4);

    const patchAuthorization = {
      authorization: `Bearer ${patchDispatch.token}`,
    };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/start`,
          { method: "POST", headers: patchAuthorization },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/source`,
          { headers: patchAuthorization },
        )
      ).status,
    ).toBe(409);

    const targetCell = bundle.allowedCellIndices[0];
    const entityField =
      bundle.artifactManifest.schemaSummary.entityCandidates[0];
    const targetField =
      bundle.artifactManifest.schemaSummary.targetCandidates[0];
    if (
      targetCell === undefined ||
      entityField === undefined ||
      targetField === undefined
    ) {
      throw new Error("v5 patch target authority is incomplete");
    }
    const patchPlan = {
      schemaVersion: "1" as const,
      planId: "patch_plan_scientific_v5",
      sessionId: bundle.sessionId,
      concept: "entity_leakage" as const,
      conceptPackVersion: bundle.conceptPackVersion,
      artifactManifestHash: bundle.artifactManifestHash,
      sourceArtifactHash: bundle.artifactManifest.fileSha256,
      transferResultHash: bundle.transferResult.resultHash,
      verifiedResultHash: bundle.releaseAuthority.authoritativeResultHash,
      evidenceRefs: bundle.approvedBeliefSpec.evidenceRefs,
      targetCells: [targetCell],
      entityField,
      targetField,
      operations: [
        {
          id: "replace_row_split_with_group_holdout" as const,
          cellIndex: targetCell,
          reason: "Evaluate complete customers together.",
        },
        {
          id: "exclude_entity_feature" as const,
          cellIndex: targetCell,
          reason: "Remove customer identity from model features.",
        },
      ],
      preserveUnrelatedCells: true as const,
      nonClaims: ["This does not establish production performance."],
    };
    const patchPlanText = JSON.stringify(patchPlan);
    const patchPlanHash = await sha256Text(patchPlanText);
    const rejectedPatchPlanText = JSON.stringify({
      ...patchPlan,
      operations: patchPlan.operations.slice(0, 1),
    });
    const rejectedPatchPlanHash = await sha256Text(rejectedPatchPlanText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/patch-plan.json`,
          {
            method: "PUT",
            headers: {
              ...patchAuthorization,
              "content-type": "application/json",
            },
            body: rejectedPatchPlanText,
          },
        )
      ).status,
    ).toBe(201);
    const rejectedCandidate = await postJson(
      harness.app,
      `/api/runner/jobs/${patchDispatch.job.jobId}/candidate`,
      { attempt: 1, planSha256: rejectedPatchPlanHash },
      patchAuthorization,
    );
    expect(rejectedCandidate.status).toBe(200);
    await expect(rejectedCandidate.json()).resolves.toMatchObject({
      data: {
        status: "REJECTED",
        canRepair: true,
        runnerJob: { status: "REPAIRING", attempt: 2 },
      },
    });
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/source`,
          { headers: patchAuthorization },
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${patchDispatch.job.jobId}/resume`,
          { method: "POST", headers: patchAuthorization },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.app.request(
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
    const candidate = await postJson(
      harness.app,
      `/api/runner/jobs/${patchDispatch.job.jobId}/candidate`,
      { attempt: 2, planSha256: patchPlanHash },
      patchAuthorization,
    );
    expect(candidate.status).toBe(200);
    await expect(candidate.json()).resolves.toMatchObject({
      data: {
        status: "VERIFIED",
        verification: { status: "VERIFIED" },
      },
    });
    const scopedSource = await harness.app.request(
      `/api/runner/jobs/${patchDispatch.job.jobId}/source`,
      { headers: patchAuthorization },
    );
    expect(scopedSource.status, await scopedSource.clone().text()).toBe(200);
    await expect(scopedSource.text()).resolves.toBe(sourceNotebookText);
    expect(
      harness.runnerObjects.objects.has(
        `runner-authority/${patchDispatch.job.jobId}/patch-plan-verification.json`,
      ),
    ).toBe(true);
    const finalSession = await harness.sessionRepository.find(bundle.sessionId);
    expect(finalSession?.beliefSpec?.id).toBe(bundle.approvedBeliefSpec.id);
    expect(finalSession?.beliefTest).toBeUndefined();

    const rationaleText =
      "This patch changes only the evaluation boundary and identity feature.";
    const patchResult = await createSamplePatchResult(
      bundle.sessionId,
      bundle.artifactManifest.fileSha256,
      bundle.requestedAt,
    );
    const patchResultText = JSON.stringify(patchResult);
    const rationaleHash = await sha256Text(rationaleText);
    const patchedNotebookHash = await sha256Text(patchedNotebookText);
    const patchResultHash = await sha256Text(patchResultText);
    for (const [path, body, contentType] of [
      ["public-rationale.md", rationaleText, "text/markdown"],
      [
        "patched-notebook.ipynb",
        patchedNotebookText,
        "application/x-ipynb+json",
      ],
      ["patch-result.json", patchResultText, "application/json"],
    ] as const) {
      expect(
        (
          await harness.app.request(
            `/api/runner/jobs/${patchDispatch.job.jobId}/outputs/${path}`,
            {
              method: "PUT",
              headers: {
                ...patchAuthorization,
                "content-type": contentType,
              },
              body,
            },
          )
        ).status,
      ).toBe(201);
    }
    const activePatchJob = await harness.runnerJobs.find(
      patchDispatch.job.jobId,
    );
    if (activePatchJob === undefined) {
      throw new Error("active v5 patch job is missing");
    }
    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_scientific_patch_v5",
      idempotencyKey: "scientific-patch-v5-complete",
      jobId: patchDispatch.job.jobId,
      stateVersion: patchDispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [
        patchPlanHash,
        rationaleHash,
        patchedNotebookHash,
        patchResultHash,
      ],
      finalEventCursor: activePatchJob.eventCursor,
      occurredAt: "2026-07-14T10:00:05.000Z",
    };
    const capsuleSigningKey =
      "counterlab-test-capsule-signing-key-with-sufficient-entropy";
    const capsuleSigningEnv = {
      COUNTERLAB_SIGNING_KEY: capsuleSigningKey,
      COUNTERLAB_SIGNING_KEY_ID: "capsule-test-key-v2",
    } as unknown as Env & Record<string, string>;
    const callback = await harness.app.request(
      `/api/runner/jobs/${patchDispatch.job.jobId}/callback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...patchAuthorization,
        },
        body: JSON.stringify(callbackBody),
      },
      capsuleSigningEnv,
    );
    expect(callback.status).toBe(200);
    const callbackPayload = (await callback.json()) as {
      data: { session: Record<string, unknown> };
    };
    expect(callbackPayload).toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "PROOF_CAPSULE_ISSUED",
          patchResult: { resultHash: patchResult.resultHash },
          reasoningDiffV2: {
            schemaVersion: "2",
            authority: {
              authoritativeResultHash: result.resultHash,
              patchResultHash: patchResult.resultHash,
            },
          },
          proofCapsule: {
            schemaVersion: "2",
            mode: "live_notebook",
            integrity: {
              mode: "hmac-signed",
              keyId: "capsule-test-key-v2",
            },
          },
        },
        verification: { status: "VERIFIED" },
      },
    });
    expect(callbackPayload.data.session).not.toHaveProperty("beliefTest");
    expect(callbackPayload.data.session).not.toHaveProperty("reasoningDiff");
    expect(callbackPayload.data.session).not.toHaveProperty("proofBundle");
    expect(callbackPayload.data.session).not.toHaveProperty("resultAuthority");
    expect(callbackPayload.data.session).not.toHaveProperty("patchAuthority");
    expect(callbackPayload.data.session).not.toHaveProperty("objectKey");
    expect(callbackPayload.data.session.proofCapsule).not.toHaveProperty(
      "objectKey",
    );
    const storedAuthority = await harness.sessionRepository.find(
      bundle.sessionId,
    );
    if (storedAuthority === undefined) {
      throw new Error("v5 authority session disappeared");
    }
    expect(storedAuthority.resultAuthority).toMatchObject({
      schemaVersion: "5",
      jobId: runJobId,
      resultHash: result.resultHash,
      resultFileHash: await sha256Text(resultText),
      technicalReportHash: storedAuthority.evidenceVerdict?.technicalReportHash,
      epistemicReportHash: storedAuthority.epistemicReportHash,
    });
    expect(storedAuthority.patchAuthority).toMatchObject({
      schemaVersion: "5",
      jobId: patchDispatch.job.jobId,
      patchPlanHash: await hashCanonical(patchPlan),
      patchPlanFileHash: patchPlanHash,
      rationaleFileHash: rationaleHash,
      patchResultHash: patchResult.resultHash,
      patchResultFileHash: patchResultHash,
      patchedArtifactHash: patchedNotebookHash,
    });
    expect(storedAuthority.state).toBe("PROOF_CAPSULE_ISSUED");
    expect(storedAuthority.reasoningDiffV2).toMatchObject({
      schemaVersion: "2",
      authority: {
        authoritativeResultHash: result.resultHash,
        patchResultHash: patchResult.resultHash,
      },
    });
    const storedProofCapsule = storedAuthority.proofCapsule;
    if (storedProofCapsule === undefined) {
      throw new Error("v5 Proof Capsule reference is missing");
    }
    expect(storedProofCapsule.objectKey).toBe(
      `proof-capsules/${bundle.sessionId}/${storedProofCapsule.bytesHash}.counterlab`,
    );
    for (const path of [
      "patch-plan.json",
      "public-rationale.md",
      "patch-plan-verification.json",
      "patch-result.json",
      "patched-notebook.ipynb",
    ]) {
      expect(
        harness.runnerObjects.objects.has(
          `runner-authority/${patchDispatch.job.jobId}/${path}`,
        ),
        path,
      ).toBe(true);
    }
    const patchedDownload = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/patch/download`,
    );
    expect(patchedDownload.status).toBe(200);
    await expect(patchedDownload.text()).resolves.toBe(patchedNotebookText);

    const missingCapsuleKey = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/proof-capsule`,
    );
    expect(missingCapsuleKey.status).toBe(503);
    await expect(missingCapsuleKey.json()).resolves.toMatchObject({
      error: { code: "PROOF_SIGNING_KEY_REQUIRED" },
    });
    const capsuleDownload = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/proof-capsule`,
      undefined,
      capsuleSigningEnv,
    );
    expect(capsuleDownload.status).toBe(200);
    expect(capsuleDownload.headers.get("content-type")).toContain(
      "application/vnd.counterlab.capsule+json",
    );
    expect(capsuleDownload.headers.get("cache-control")).toBe(
      "private, no-store",
    );
    expect(capsuleDownload.headers.get("x-content-type-options")).toBe(
      "nosniff",
    );
    const capsuleBytes = new Uint8Array(await capsuleDownload.arrayBuffer());
    const validatedCapsule = validateProofCapsuleV2(capsuleBytes, {
      expectedIntegrityMode: "hmac-signed",
      signingKeys: {
        "capsule-test-key-v2": capsuleSigningKey,
      },
    });
    expect(validatedCapsule.reference).toEqual(storedProofCapsule);
    expect(validatedCapsule.manifest.limitations).toContain(
      "The hosted Codex launch has a credential-and-privilege boundary; filesystem generation read isolation is PARTIAL, not a formal sandbox proof.",
    );
    await expect(
      validateProofCapsulePayloadAuthorityV2(validatedCapsule),
    ).resolves.toMatchObject({
      valid: true,
      sessionId: bundle.sessionId,
      concept: "entity_leakage",
      resultHash: result.resultHash,
      patchResultHash: patchResult.resultHash,
    });
    const publishedReplay = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      capsuleSigningEnv,
    );
    expect(publishedReplay.status, await publishedReplay.clone().text()).toBe(
      201,
    );
    const publishedReplayPayload = (await publishedReplay.json()) as {
      data: {
        reused: boolean;
        replay: {
          replayId: string;
        };
      };
    };
    expect(publishedReplayPayload).toMatchObject({
      data: {
        reused: false,
        replay: {
          schemaVersion: "2",
          replay: true,
          label: "Verified replay",
          concept: "entity_leakage",
          recordedAt: storedProofCapsule.createdAt,
          retention: {
            policy: "expires_or_revoked",
            revocable: true,
            publishedAt: "2026-07-14T10:00:00.000Z",
            expiresAt: "2026-08-13T10:00:00.000Z",
          },
        },
      },
    });
    const serializedPublication = JSON.stringify(publishedReplayPayload);
    for (const forbidden of [
      "objectKey",
      "sourceSessionId",
      "capsuleId",
      "rootHash",
      "bytesHash",
    ]) {
      expect(serializedPublication).not.toContain(forbidden);
    }
    const activePublicationStatus = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays/status`,
      undefined,
      capsuleSigningEnv,
    );
    expect(activePublicationStatus.status).toBe(200);
    await expect(activePublicationStatus.json()).resolves.toMatchObject({
      data: {
        status: "active",
        replay: { replayId: publishedReplayPayload.data.replay.replayId },
      },
    });

    const duplicatePublication = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      capsuleSigningEnv,
    );
    expect(duplicatePublication.status).toBe(200);
    await expect(duplicatePublication.json()).resolves.toMatchObject({
      data: {
        reused: true,
        replay: { replayId: publishedReplayPayload.data.replay.replayId },
      },
    });

    const hostedReplay = await harness.app.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}`,
      undefined,
      capsuleSigningEnv,
    );
    expect(hostedReplay.status).toBe(200);
    const hostedReplayPayload = (await hostedReplay.json()) as {
      data: Record<string, unknown>;
    };
    const publicReplay = PublicReplayProjectionV1Schema.parse(
      hostedReplayPayload.data,
    );
    expect(publicReplay).toMatchObject({
      schemaVersion: "1",
      projectionKind: "public_replay",
      replayId: publishedReplayPayload.data.replay.replayId,
      replay: true,
      label: "Verified replay",
      playbackMode: "verified_capsule_replay",
      sourceMode: "live_notebook",
      concept: "entity_leakage",
      authority: {
        sourceCapsuleRootHash: storedProofCapsule.rootHash,
        sourceCapsuleBytesHash: storedProofCapsule.bytesHash,
        resultHash: result.resultHash,
        patchResultHash: patchResult.resultHash,
        projectionIntegrity: {
          mode: "hmac-signed",
          keyId: "capsule-test-key-v2",
        },
      },
      artifact: {
        kind: "notebook",
        nbformat: 4,
        supportStatus: "SUPPORTED",
      },
      question: {
        claim: bundle.approvedBeliefSpec.claim,
      },
      test: {
        result: { resultHash: result.resultHash },
        evidenceVerdict: { kind: "SUPPORTS", resultHash: result.resultHash },
      },
      boundary: {
        result: { concept: "entity_leakage" },
        verification: { status: "VERIFIED" },
      },
      apply: {
        revision: {
          statement:
            "Deployment units must determine the evaluation split before I trust generalization.",
        },
        transfer: { outcome: "PASSED" },
      },
      repair: { resultHash: patchResult.resultHash },
      privacy: { profile: "share-safe-v1" },
    });
    expect(
      validatePublicReplayProjectionV1(publicReplay, {
        expectedIntegrityMode: "hmac-signed",
        signingKeys: { "capsule-test-key-v2": capsuleSigningKey },
      }),
    ).toEqual(publicReplay);
    const serializedHostedReplay = JSON.stringify(hostedReplayPayload);
    const hostedReplayKeys = recursiveObjectKeys(hostedReplayPayload.data);
    for (const forbiddenKey of [
      "objectKey",
      "sourceSessionId",
      "capsuleId",
      "artifactId",
      "fileSha256",
      "fileName",
      "filename",
      "sourceExcerpt",
      "fields",
      "patchResult",
      "jobId",
    ]) {
      expect(hostedReplayKeys).not.toContain(forbiddenKey);
    }
    for (const forbiddenValue of [
      "patch diff",
      "patched-notebook.ipynb",
      "private reasoning",
      bundle.sessionId,
      bundle.artifactManifest.artifactId,
    ]) {
      expect(serializedHostedReplay).not.toContain(forbiddenValue);
    }

    const expiredApp = createApi({
      sessionRepository: harness.sessionRepository,
      artifactStore: harness.artifactStore,
      runnerJobRepository: harness.runnerJobs,
      runnerObjectStore: harness.runnerObjects,
      replayRepository: harness.replayRepository,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
      now: () => new Date("2026-08-13T10:00:00.000Z"),
      id: (prefix) => `${prefix}_expired_replay_probe`,
    });
    const expiredHostedReplay = await expiredApp.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}`,
      undefined,
      capsuleSigningEnv,
    );
    expect(expiredHostedReplay.status).toBe(404);
    await expect(expiredHostedReplay.json()).resolves.toMatchObject({
      error: { code: "REPLAY_NOT_FOUND" },
    });
    const expiredPublicationStatus = await expiredApp.request(
      `/api/sessions/${bundle.sessionId}/replays/status`,
      undefined,
      capsuleSigningEnv,
    );
    expect(expiredPublicationStatus.status).toBe(200);
    await expect(expiredPublicationStatus.json()).resolves.toMatchObject({
      data: {
        status: "expired",
        replay: {
          replayId: publishedReplayPayload.data.replay.replayId,
          retention: {
            expiresAt: "2026-08-13T10:00:00.000Z",
          },
        },
      },
    });

    const frozenPrivateCapsule = harness.runnerObjects.objects.get(
      storedProofCapsule.objectKey,
    );
    if (frozenPrivateCapsule === undefined) {
      throw new Error("private Capsule bytes are missing");
    }
    harness.runnerObjects.objects.set(storedProofCapsule.objectKey, {
      ...frozenPrivateCapsule,
      body: "poisoned private Capsule",
    });
    const replayWithoutPrivateCapsule = await harness.app.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}`,
      undefined,
      capsuleSigningEnv,
    );
    expect(replayWithoutPrivateCapsule.status).toBe(200);
    await expect(replayWithoutPrivateCapsule.json()).resolves.toEqual(
      hostedReplayPayload,
    );
    harness.runnerObjects.objects.set(
      storedProofCapsule.objectKey,
      frozenPrivateCapsule,
    );

    const projectionObjectKey = [...harness.runnerObjects.objects.keys()].find(
      (key) =>
        key.startsWith(
          `public-replays/${publishedReplayPayload.data.replay.replayId}/`,
        ),
    );
    if (projectionObjectKey === undefined) {
      throw new Error("frozen public replay projection is missing");
    }
    const frozenProjection =
      harness.runnerObjects.objects.get(projectionObjectKey);
    if (frozenProjection === undefined) {
      throw new Error("frozen public replay bytes are missing");
    }
    harness.runnerObjects.objects.set(projectionObjectKey, {
      ...frozenProjection,
      body: `${frozenProjection.body} `,
    });
    const poisonedPublicProjection = await harness.app.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}`,
      undefined,
      capsuleSigningEnv,
    );
    expect(poisonedPublicProjection.status).toBe(409);
    await expect(poisonedPublicProjection.json()).resolves.toMatchObject({
      error: { code: "REPLAY_AUTHORITY_MISMATCH" },
    });
    harness.runnerObjects.objects.set(projectionObjectKey, frozenProjection);

    const replayCapsuleDownload = await harness.app.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}/proof-capsule`,
      undefined,
      capsuleSigningEnv,
    );
    expect(replayCapsuleDownload.status).toBe(404);
    await expect(replayCapsuleDownload.json()).resolves.toMatchObject({
      error: { code: "REPLAY_PRIVATE_ARTIFACT_UNAVAILABLE" },
    });

    const replayPatchedNotebookDownload = await harness.app.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}/patched-notebook`,
      undefined,
      capsuleSigningEnv,
    );
    expect(replayPatchedNotebookDownload.status).toBe(404);
    await expect(replayPatchedNotebookDownload.json()).resolves.toMatchObject({
      error: { code: "REPLAY_PRIVATE_ARTIFACT_UNAVAILABLE" },
    });

    const revokeReplay = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays/revoke`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      capsuleSigningEnv,
    );
    expect(revokeReplay.status).toBe(200);
    await expect(revokeReplay.json()).resolves.toMatchObject({
      data: {
        replayId: publishedReplayPayload.data.replay.replayId,
        revoked: true,
        alreadyRevoked: false,
      },
    });
    const revokedHostedReplay = await harness.app.request(
      `/api/replays/${publishedReplayPayload.data.replay.replayId}`,
      undefined,
      capsuleSigningEnv,
    );
    expect(revokedHostedReplay.status).toBe(404);
    const revokedPublicationStatus = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays/status`,
      undefined,
      capsuleSigningEnv,
    );
    expect(revokedPublicationStatus.status).toBe(200);
    await expect(revokedPublicationStatus.json()).resolves.toMatchObject({
      data: {
        status: "revoked",
        replay: { replayId: publishedReplayPayload.data.replay.replayId },
      },
    });

    const duplicateRevocation = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays/revoke`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      capsuleSigningEnv,
    );
    expect(duplicateRevocation.status).toBe(200);
    await expect(duplicateRevocation.json()).resolves.toMatchObject({
      data: { revoked: true, alreadyRevoked: true },
    });

    const republishRevokedReplay = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/replays`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      },
      capsuleSigningEnv,
    );
    expect(republishRevokedReplay.status).toBe(409);
    await expect(republishRevokedReplay.json()).resolves.toMatchObject({
      error: { code: "ILLEGAL_TRANSITION" },
    });
    const wrongCapsuleKey = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/proof-capsule`,
      undefined,
      {
        ...capsuleSigningEnv,
        COUNTERLAB_SIGNING_KEY: "wrong-capsule-signing-key",
      } as unknown as Env & Record<string, string>,
    );
    expect(wrongCapsuleKey.status).toBe(409);
    await expect(wrongCapsuleKey.json()).resolves.toMatchObject({
      error: { code: "PROOF_CAPSULE_INVALID" },
    });
    for (const command of ["validate", "inspect", "replay"] as const) {
      const stdout: string[] = [];
      const stderr: string[] = [];
      await expect(
        runProofCapsuleCli([command, "worker-issued.counterlab"], {
          readBytes: () => Promise.resolve(capsuleBytes),
          stdout: (value) => stdout.push(value),
          stderr: (value) => stderr.push(value),
          env: capsuleSigningEnv,
        }),
      ).resolves.toBe(0);
      expect(stderr).toEqual([]);
      expect(JSON.parse(stdout.join(""))).toMatchObject({
        valid: true,
        sessionId: bundle.sessionId,
        sourceMode: "live_notebook",
        resultHash: result.resultHash,
      });
      expect(stdout.join("")).not.toContain("objectKey");
      if (command === "replay") {
        expect(stdout.join("")).toContain(
          '"playbackMode":"verified_capsule_replay"',
        );
        expect(stdout.join("")).not.toContain("patched-notebook.ipynb");
      }
    }

    for (const path of [
      "patch-plan.json",
      "public-rationale.md",
      "patch-result.json",
      "patched-notebook.ipynb",
    ]) {
      harness.runnerObjects.objects.delete(
        `runner-output/${patchDispatch.job.jobId}/${path}`,
      );
    }
    const duplicateCallback = await harness.app.request(
      `/api/runner/jobs/${patchDispatch.job.jobId}/callback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...patchAuthorization,
        },
        body: JSON.stringify(callbackBody),
      },
      capsuleSigningEnv,
    );
    expect(duplicateCallback.status).toBe(200);
    await expect(duplicateCallback.json()).resolves.toMatchObject({
      data: {
        duplicate: true,
        runnerJob: { status: "VERIFIED" },
        session: {
          state: "PROOF_CAPSULE_ISSUED",
          patchResult: { resultHash: patchResult.resultHash },
          proofCapsule: {
            bytesHash: storedProofCapsule.bytesHash,
          },
        },
      },
    });
    const evidenceResponse = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/events`,
    );
    expect(evidenceResponse.status).toBe(200);
    const evidencePayload = (await evidenceResponse.json()) as {
      data: { events: Array<{ kind: string }> };
    };
    expect(
      evidencePayload.data.events.filter(
        (event) => event.kind === "reasoning_diff_v2.issued",
      ),
    ).toHaveLength(1);
    expect(
      evidencePayload.data.events.filter(
        (event) => event.kind === "proof_capsule.issued",
      ),
    ).toHaveLength(1);

    const persistedCapsule = harness.runnerObjects.objects.get(
      storedProofCapsule.objectKey,
    );
    if (persistedCapsule === undefined) {
      throw new Error("persisted Proof Capsule bytes are missing");
    }
    harness.runnerObjects.objects.set(storedProofCapsule.objectKey, {
      ...persistedCapsule,
      body: `${persistedCapsule.body.slice(0, -2)}x\n`,
    });
    const tamperedDownload = await harness.app.request(
      `/api/sessions/${bundle.sessionId}/proof-capsule`,
      undefined,
      capsuleSigningEnv,
    );
    expect(tamperedDownload.status).toBe(409);
    await expect(tamperedDownload.json()).resolves.toMatchObject({
      error: { code: "PROOF_CAPSULE_INVALID" },
    });
    harness.runnerObjects.objects.set(
      storedProofCapsule.objectKey,
      persistedCapsule,
    );
  });

  it("runs a v5 interactive control from frozen authority without replacing the verdict", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const authoritativeJobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${authoritativeJobId}/start`,
          { method: "POST", headers: run.authorization },
        )
      ).status,
    ).toBe(200);
    const authoritativeResult = await scientificLeakageResult(run.bundle);
    const authoritativeText = JSON.stringify(authoritativeResult);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${authoritativeJobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: authoritativeText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postJson(
          harness.app,
          `/api/runner/jobs/${authoritativeJobId}/callback`,
          {
            schemaVersion: "1",
            callbackId: "callback_scientific_before_interactive",
            idempotencyKey: "scientific-before-interactive",
            jobId: authoritativeJobId,
            stateVersion: run.dispatch.job.stateVersion,
            status: "VERIFIED",
            outputHashes: [await sha256Text(authoritativeText)],
            finalEventCursor: 0,
            occurredAt: "2026-07-14T10:00:04.000Z",
          },
          run.authorization,
        )
      ).status,
    ).toBe(200);
    const before = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    if (
      before?.verifiedResult === undefined ||
      before.evidenceVerdict === undefined ||
      before.epistemicReportHash === undefined
    ) {
      throw new Error("v5 source evidence was not released");
    }

    const queued = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/lab/interactive`,
      {
        schemaVersion: "1",
        splitStrategy: "group",
        entityField: "customer_id",
        identityAblation: false,
        testFraction: 0.25,
      },
    );
    expect(queued.status).toBe(202);
    const queuedBody = (await queued.json()) as {
      data: { selectedRunId: string; configurationHash: string };
    };
    expect(queuedBody.data.selectedRunId).toMatch(
      /^interactive-[a-f0-9]{16}$/u,
    );

    const interactiveDispatch = harness.dispatcher.dispatched[2];
    if (interactiveDispatch === undefined) {
      throw new Error("v5 interactive run was not dispatched");
    }
    const interactiveInput = harness.runnerObjects.objects.get(
      `runner-input/${interactiveDispatch.job.jobId}.json`,
    );
    if (interactiveInput === undefined) {
      throw new Error("v5 interactive input is missing");
    }
    const interactiveBundle = RunnerLabInteractiveRunBundleV5Schema.parse(
      JSON.parse(interactiveInput.body),
    );
    expect(interactiveBundle).toMatchObject({
      purpose: "INTERACTIVE",
      selectedRunId: queuedBody.data.selectedRunId,
      configurationHash: queuedBody.data.configurationHash,
      releaseAuthority: {
        authoritativeResultHash: before.verifiedResult.resultHash,
        evidenceVerdict: { kind: "SUPPORTS" },
        epistemicReportHash: before.epistemicReportHash,
      },
    });

    for (const path of [
      "discrimination-contract.json",
      "experiment-ir.json",
      "lab-scene.json",
      "public-rationale.md",
    ]) {
      expect(
        harness.runnerObjects.objects.has(
          `runner-authority/${run.staged.jobId}/compiler-output/${path}`,
        ),
      ).toBe(true);
      harness.runnerObjects.objects.delete(
        `runner-output/${run.staged.jobId}/${path}`,
      );
    }

    const interactiveResult = await scientificLeakageResult({
      ...run.bundle,
      projectedPlan: interactiveBundle.interactivePlan,
    } as RunnerLabRunBundleV5);
    const interactiveText = JSON.stringify(interactiveResult);
    const interactiveAuthorization = {
      authorization: `Bearer ${interactiveDispatch.token}`,
    };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${interactiveDispatch.job.jobId}/start`,
          { method: "POST", headers: interactiveAuthorization },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${interactiveDispatch.job.jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...interactiveAuthorization,
              "content-type": "application/json",
            },
            body: interactiveText,
          },
        )
      ).status,
    ).toBe(201);
    const completed = await postJson(
      harness.app,
      `/api/runner/jobs/${interactiveDispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_interactive_v5",
        idempotencyKey: "scientific-interactive-v5",
        jobId: interactiveDispatch.job.jobId,
        stateVersion: interactiveDispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [await sha256Text(interactiveText)],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:06.000Z",
      },
      interactiveAuthorization,
    );
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED", eventCursor: 2 },
        session: {
          state: before.state,
          verifiedResult: { resultHash: before.verifiedResult.resultHash },
          evidenceVerdict: before.evidenceVerdict,
          epistemicReportHash: before.epistemicReportHash,
        },
        verification: { status: "VERIFIED" },
      },
    });

    harness.runnerObjects.objects.set(
      `runner-output/${interactiveDispatch.job.jobId}/verified-result.json`,
      { body: "{}", contentType: "application/json" },
    );
    const fetched = await harness.app.request(
      `/api/sessions/${harness.bundle.sessionId}/jobs/${interactiveDispatch.job.jobId}/result`,
    );
    expect(fetched.status).toBe(200);
    await expect(fetched.json()).resolves.toMatchObject({
      data: {
        result: { resultHash: interactiveResult.resultHash },
        selectedRunId: interactiveBundle.selectedRunId,
        configurationHash: interactiveBundle.configurationHash,
        verification: { status: "VERIFIED" },
      },
    });
    const after = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    expect(after).toMatchObject({
      state: before.state,
      verifiedResult: { resultHash: before.verifiedResult.resultHash },
      evidenceVerdict: before.evidenceVerdict,
      epistemicReportHash: before.epistemicReportHash,
    });
  });

  it("releases a class-imbalance v5 result through the same Worker authority boundary", async () => {
    const harness = await preparedScientificImbalanceHostedRunner();
    const run = await completeScientificCompileAndQueueRun(
      harness,
      scientificImbalanceCandidateArtifacts,
    );
    const jobId = run.dispatch.job.jobId;
    expect(run.bundle).toMatchObject({
      schemaVersion: "5",
      kind: "LAB_RUN",
      approvedBeliefSpec: { concept: "class_imbalance" },
      fixture: {
        id: "public-imbalance-v1",
        version: "imbalance-fixture-v1",
        contentSha256:
          "7974fe5744c4f9f2e8a31817791dac09ba9efb17cc88a4aa3383ae333e92ad7f",
      },
      selectedExperimentIr: {
        selection: {
          status: "SELECTED",
          candidateId: "threshold-and-majority-baseline",
        },
      },
      projectedPlan: {
        concept: "class_imbalance",
        baseline: { operation: "imbalance.majority_baseline" },
        interventions: [
          { operation: "imbalance.stratified_holdout" },
          { operation: "imbalance.threshold_sweep" },
          { operation: "imbalance.prevalence_sweep" },
        ],
      },
    });
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const result = await scientificImbalanceResult(run.bundle);
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_imbalance_run_v5",
        idempotencyKey: "scientific-imbalance-run-v5-complete",
        jobId,
        stateVersion: run.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [resultFileHash],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:04.000Z",
      },
      run.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runnerJob: { status: "VERIFIED", eventCursor: 2 },
        session: {
          state: "EXPERIMENT_COMPLETED",
          verifiedResult: {
            concept: "class_imbalance",
            resultHash: result.resultHash,
          },
          evidenceVerdict: {
            kind: "SUPPORTS",
            hypothesisId: "competing",
            resultHash: result.resultHash,
          },
          epistemicReportHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
        verification: {
          status: "VERIFIED",
          verdict: {
            kind: "SUPPORTS",
            hypothesisId: "competing",
            resultHash: result.resultHash,
          },
          technicalReport: { status: "VERIFIED" },
        },
      },
    });
    expect(
      (await harness.runnerJobs.listEvents(jobId, 0)).map(
        (event) => event.kind,
      ),
    ).toEqual(["verifier.verified", "result.ready"]);

    await queueAndVerifyBoundary(harness, "imbalance-before-revision");

    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.sessionId}/revision`,
          {
            revision:
              "Rare-event accuracy needs a majority baseline and class-specific evidence.",
          },
        )
      ).status,
    ).toBe(200);
    const transfer = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/transfer`,
      {
        decisionChoice: "reject_accuracy_only",
        metricChoice: "recall_and_pr_auc",
        evidenceChoices: ["zero_true_positives", "rare_base_rate"],
      },
    );
    expect(transfer.status).toBe(200);
    await expect(transfer.json()).resolves.toMatchObject({
      data: {
        state: "TRANSFER_PASSED",
        transferResult: {
          taskId: "manufacturing-defect-transfer-01",
          evaluatorVersion: "counterlab-imbalance-transfer-v1",
        },
      },
    });
  });

  it("rejects class-imbalance seed drift before fixed execution authority is released", async () => {
    const harness = await preparedScientificImbalanceHostedRunner();
    expect(harness.bundle.conceptPack.fixedExecutionContract).toEqual({
      runSeed: 2603,
      inconclusiveOutcomes: [
        {
          conditionId: "minority-utility-uncertain",
          description: "Minority utility falls between decisive thresholds.",
          nextExperimentId: "prevalence-and-threshold-sweep",
        },
      ],
    });
    const artifacts = await scientificImbalanceCandidateArtifacts(
      harness.bundle,
    );
    const rawIr = ExperimentIRV5Schema.parse(
      JSON.parse(artifacts["experiment-ir.json"]),
    );
    const driftedIr = ExperimentIRV5Schema.parse({
      ...rawIr,
      candidateExperiments: rawIr.candidateExperiments.map((candidate) => ({
        ...candidate,
        baseline: { ...candidate.baseline, seed: 17 },
        interventions: candidate.interventions.map((run) => ({
          ...run,
          seed: 17,
        })),
      })),
    });
    const rawScene = LabSceneV2Schema.parse(
      JSON.parse(artifacts["lab-scene.json"]),
    );
    const driftedScene = LabSceneV2Schema.parse({
      ...rawScene,
      provenance: {
        ...rawScene.provenance,
        experimentIrHash: await hashExperimentIR(driftedIr),
      },
    });

    const verification = await verifyScientificCandidateV5({
      bundle: harness.bundle,
      artifacts: {
        discriminationContract: JSON.parse(
          artifacts["discrimination-contract.json"],
        ),
        experimentIr: driftedIr,
        labScene: driftedScene,
        publicRationale: artifacts["public-rationale.md"],
      },
    });
    const seedFinding = verification.report.invariants.find(
      (invariant) => invariant.name === "selected_execution_semantics",
    );

    expect(verification).toMatchObject({
      disposition: "REPAIRABLE_REJECTION",
      report: { verifierVersion: "scientific-candidate-verifier-v4" },
    });
    expect(seedFinding).toMatchObject({
      passed: false,
      observed: { runSeeds: [17, 17, 17, 17] },
      expected: { runSeed: 2603 },
    });
    expect(verification).not.toHaveProperty("selectedIr");
    expect(verification).not.toHaveProperty("executionPlan");
  });

  it("runs class-imbalance v5 controls through the fixed interactive authority", async () => {
    const harness = await preparedScientificImbalanceHostedRunner();
    const run = await completeScientificCompileAndQueueRun(
      harness,
      scientificImbalanceCandidateArtifacts,
    );
    const sourceJobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${sourceJobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const sourceResult = await scientificImbalanceResult(run.bundle);
    const sourceText = JSON.stringify(sourceResult);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${sourceJobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: sourceText,
          },
        )
      ).status,
    ).toBe(201);
    expect(
      (
        await postJson(
          harness.app,
          `/api/runner/jobs/${sourceJobId}/callback`,
          {
            schemaVersion: "1",
            callbackId: "callback_imbalance_before_interactive_v5",
            idempotencyKey: "imbalance-before-interactive-v5",
            jobId: sourceJobId,
            stateVersion: run.dispatch.job.stateVersion,
            status: "VERIFIED",
            outputHashes: [await sha256Text(sourceText)],
            finalEventCursor: 0,
            occurredAt: "2026-07-14T10:00:04.000Z",
          },
          run.authorization,
        )
      ).status,
    ).toBe(200);
    const before = await harness.sessionRepository.find(harness.sessionId);
    if (
      before?.verifiedResult === undefined ||
      before.evidenceVerdict === undefined ||
      before.epistemicReportHash === undefined
    ) {
      throw new Error("class-imbalance source authority is missing");
    }

    const queued = await postJson(
      harness.app,
      `/api/sessions/${harness.sessionId}/lab/interactive`,
      {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.2,
        prevalenceScenario: "rarer",
        metricFocus: "recall",
      },
    );
    expect(queued.status).toBe(202);
    const dispatch = harness.dispatcher.dispatched[2];
    if (dispatch === undefined) {
      throw new Error("class-imbalance interactive run was not dispatched");
    }
    const inputObject = harness.runnerObjects.objects.get(
      `runner-input/${dispatch.job.jobId}.json`,
    );
    if (inputObject === undefined) {
      throw new Error("class-imbalance interactive bundle is missing");
    }
    const bundle = RunnerLabInteractiveRunBundleV5Schema.parse(
      JSON.parse(inputObject.body),
    );
    expect(
      bundle.interactivePlan.interventions.find(
        (runSpec) => runSpec.runId === bundle.selectedRunId,
      ),
    ).toMatchObject({
      operation: "imbalance.prevalence_sweep",
      threshold: 0.2,
      prevalenceScenario: "rarer",
    });
    expect(
      bundle.interactivePlan.interventions.find(
        (runSpec) => runSpec.operation === "imbalance.threshold_sweep",
      ),
    ).toMatchObject({
      threshold: 0.2,
      prevalenceScenario: "observed",
    });
    const result = await scientificImbalanceResult({
      ...run.bundle,
      projectedPlan: bundle.interactivePlan,
    } as RunnerLabRunBundleV5);
    const resultText = JSON.stringify(result);
    const authorization = { authorization: `Bearer ${dispatch.token}` };
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${dispatch.job.jobId}/start`,
          { method: "POST", headers: authorization },
        )
      ).status,
    ).toBe(200);
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
    const completed = await postJson(
      harness.app,
      `/api/runner/jobs/${dispatch.job.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_imbalance_interactive_v5",
        idempotencyKey: "imbalance-interactive-v5",
        jobId: dispatch.job.jobId,
        stateVersion: dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [await sha256Text(resultText)],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:06.000Z",
      },
      authorization,
    );
    expect(completed.status).toBe(200);
    await expect(completed.json()).resolves.toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED", eventCursor: 2 },
        session: {
          state: before.state,
          verifiedResult: { resultHash: before.verifiedResult.resultHash },
          evidenceVerdict: before.evidenceVerdict,
          epistemicReportHash: before.epistemicReportHash,
        },
        verification: { status: "VERIFIED" },
      },
    });
  });

  it.each([
    [
      "fixture rows",
      (result: HostedImbalanceResultV2) => ({
        ...result,
        fixture: { ...result.fixture, rows: result.fixture.rows + 1 },
      }),
    ],
    [
      "fixture positives",
      (result: HostedImbalanceResultV2) => ({
        ...result,
        fixture: {
          ...result.fixture,
          positives: result.fixture.positives + 1,
        },
      }),
    ],
    [
      "fixture prevalence",
      (result: HostedImbalanceResultV2) => ({
        ...result,
        fixture: { ...result.fixture, prevalence: 0.02 },
      }),
    ],
    [
      "kernel version",
      (result: HostedImbalanceResultV2) => ({
        ...result,
        kernelVersion: "forged-kernel",
      }),
    ],
    [
      "top-level seed",
      (result: HostedImbalanceResultV2) => ({
        ...result,
        seed: result.seed + 1,
      }),
    ],
  ] as Array<
    [string, (result: HostedImbalanceResultV2) => HostedImbalanceResultV2]
  >)(
    "rejects class-imbalance v5 %s drift before result release",
    async (label, mutate) => {
      const harness = await preparedScientificImbalanceHostedRunner();
      const run = await completeScientificCompileAndQueueRun(
        harness,
        scientificImbalanceCandidateArtifacts,
      );
      const jobId = run.dispatch.job.jobId;
      expect(
        (
          await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
            method: "POST",
            headers: run.authorization,
          })
        ).status,
      ).toBe(200);
      const valid = await scientificImbalanceResult(run.bundle);
      if (valid.concept !== "class_imbalance") {
        throw new Error("expected a class-imbalance test result");
      }
      const { resultHash: _resultHash, ...tamperedPayload } = mutate(valid);
      const result = HostedVerifiedResultSetV2Schema.parse({
        ...tamperedPayload,
        resultHash: await hashCanonical(tamperedPayload),
      });
      const resultText = JSON.stringify(result);
      const resultFileHash = await sha256Text(resultText);
      expect(
        (
          await harness.app.request(
            `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
            {
              method: "PUT",
              headers: {
                ...run.authorization,
                "content-type": "application/json",
              },
              body: resultText,
            },
          )
        ).status,
      ).toBe(201);
      const suffix = label.replaceAll(" ", "_");
      const callback = await postJson(
        harness.app,
        `/api/runner/jobs/${jobId}/callback`,
        {
          schemaVersion: "1",
          callbackId: `callback_imbalance_${suffix}`,
          idempotencyKey: `imbalance-${suffix}`,
          jobId,
          stateVersion: run.dispatch.job.stateVersion,
          status: "VERIFIED",
          outputHashes: [resultFileHash],
          finalEventCursor: 0,
          occurredAt: "2026-07-14T10:00:04.000Z",
        },
        run.authorization,
      );
      expect(callback.status).toBe(200);
      await expect(callback.json()).resolves.toMatchObject({
        data: {
          runnerJob: {
            status: "REJECTED",
            error: { code: "EPISTEMIC_VERIFIER_REJECTED" },
          },
          session: {
            state: "LAB_VERIFIED",
            evidenceVerdict: { kind: "REJECTED", resultReleased: false },
          },
          verification: {
            status: "REJECTED",
            technicalReport: {
              status: "REJECTED",
              invariants: expect.arrayContaining([
                expect.objectContaining({
                  name: "fixed_result_authority",
                  passed: false,
                }),
              ]),
            },
          },
        },
      });
      expect(
        (await harness.sessionRepository.find(harness.sessionId))
          ?.verifiedResult,
      ).toBeUndefined();
      expect(
        (await harness.runnerJobs.listEvents(jobId, 0)).map(
          (event) => event.kind,
        ),
      ).toEqual(["verifier.rejected"]);
    },
  );

  it("resumes a v5 callback after a partial Worker authority-event append", async () => {
    const runnerJobs = new InterruptibleRunnerJobRepository();
    const harness = await preparedScientificHostedRunner(runnerJobs);
    const run = await completeScientificCompileAndQueueRun(harness);
    const jobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const result = await scientificLeakageResult(run.bundle);
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_scientific_run_interrupted",
      idempotencyKey: "scientific-run-interrupted",
      jobId,
      stateVersion: run.dispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [resultFileHash],
      finalEventCursor: 0,
      occurredAt: "2026-07-14T10:00:04.000Z",
    };
    runnerJobs.interruptAfterAuthorityAppends(2);
    const interrupted = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      run.authorization,
    );
    expect(interrupted.status).toBe(500);
    expect((await runnerJobs.find(jobId))?.status).toBe("AWAITING_APPROVAL");
    expect(
      (await runnerJobs.listEvents(jobId, 0)).map((event) => event.kind),
    ).toEqual(["verifier.verified"]);
    expect(
      (await harness.sessionRepository.find(harness.bundle.sessionId))?.state,
    ).toBe("LAB_VERIFIED");
    const lateEvent = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/events`,
      {
        schemaVersion: "1",
        eventId: "late_runner_event",
        jobId,
        cursor: 2,
        at: "2026-07-14T10:00:05.000Z",
        kind: "command.completed",
        label: "Late runner write",
        exitCode: 0,
        durationMs: 1,
        excerpt: "This event arrived after the runner boundary closed.",
      },
      run.authorization,
    );
    expect(lateEvent.status).toBe(409);
    await expect(lateEvent.json()).resolves.toMatchObject({
      error: { code: "RUNNER_JOB_NOT_ACTIVE" },
    });
    harness.runnerObjects.objects.set(
      `runner-output/${jobId}/verified-result.json`,
      {
        body: JSON.stringify({ tampered: true }),
        contentType: "application/json",
      },
    );

    const recovered = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      run.authorization,
    );
    expect(recovered.status).toBe(200);
    await expect(recovered.json()).resolves.toMatchObject({
      data: {
        duplicate: false,
        runnerJob: { status: "VERIFIED", eventCursor: 2 },
        session: {
          state: "EXPERIMENT_COMPLETED",
          evidenceVerdict: { kind: "SUPPORTS" },
        },
      },
    });
    expect(
      (await runnerJobs.listEvents(jobId, 0)).map((event) => event.kind),
    ).toEqual(["verifier.verified", "result.ready"]);
  });

  it("reserves v5 verifier and result events for the Worker control plane", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const jobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    for (const [kind, extra] of [
      ["verifier.verified", { invariantCount: 8, mutationCount: 0 }],
      [
        "verifier.rejected",
        {
          invariant: "TECHNICAL_VERIFICATION_FAILED",
          observed: "runner claim",
          expected: "Worker authority",
          counterexample: "The runner cannot decide verification.",
        },
      ],
      ["result.ready", { resultHash: "a".repeat(64) }],
    ] as const) {
      const response = await postJson(
        harness.app,
        `/api/runner/jobs/${jobId}/events`,
        {
          schemaVersion: "1",
          eventId: `forbidden_${kind}`,
          jobId,
          cursor: 1,
          at: "2026-07-14T10:00:02.000Z",
          kind,
          ...extra,
        },
        run.authorization,
      );
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "RUNNER_EVENT_NOT_PERMITTED" },
      });
    }
    expect(await harness.runnerJobs.listEvents(jobId, 0)).toEqual([]);
  });

  it("rejects extra v5 result hashes instead of accepting a partial match", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const jobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const result = await scientificLeakageResult(run.bundle);
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_run_extra_hash",
        idempotencyKey: "scientific-run-extra-hash",
        jobId,
        stateVersion: run.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [resultFileHash, "f".repeat(64)],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:04.000Z",
      },
      run.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        runnerJob: {
          status: "REJECTED",
          error: { code: "RUNNER_OUTPUT_HASH_MISMATCH" },
        },
        session: { state: "LAB_VERIFIED" },
      },
    });
    expect(
      (await harness.sessionRepository.find(harness.bundle.sessionId))
        ?.verifiedResult,
    ).toBeUndefined();
  });

  it("persists a v5 technical rejection without releasing a result", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const jobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const valid = await scientificLeakageResult(run.bundle);
    if (valid.concept !== "entity_leakage") {
      throw new Error("expected a leakage test result");
    }
    const mutatedRuns = valid.runs.map((resultRun) =>
      resultRun.operation === "leakage.group_holdout"
        ? {
            ...resultRun,
            entityOverlap: { count: 1, rate: 0.01 },
          }
        : resultRun,
    );
    const { resultHash: _validResultHash, ...validPayload } = valid;
    const mutatedPayload = { ...validPayload, runs: mutatedRuns };
    const result = HostedVerifiedResultSetV2Schema.parse({
      ...mutatedPayload,
      resultHash: await hashCanonical(mutatedPayload),
    });
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callbackBody = {
      schemaVersion: "1" as const,
      callbackId: "callback_scientific_run_rejected",
      idempotencyKey: "scientific-run-rejected",
      jobId,
      stateVersion: run.dispatch.job.stateVersion,
      status: "VERIFIED" as const,
      outputHashes: [resultFileHash],
      finalEventCursor: 0,
      occurredAt: "2026-07-14T10:00:04.000Z",
    };
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      run.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        duplicate: false,
        runnerJob: {
          status: "REJECTED",
          error: { code: "EPISTEMIC_VERIFIER_REJECTED" },
          eventCursor: 1,
        },
        session: {
          state: "LAB_VERIFIED",
          evidenceVerdict: {
            kind: "REJECTED",
            resultReleased: false,
          },
          epistemicReportHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
        },
        verification: {
          status: "REJECTED",
          technicalReport: { status: "REJECTED" },
          verdict: { kind: "REJECTED", resultReleased: false },
        },
      },
    });
    const stored = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    expect(stored?.verifiedResult).toBeUndefined();
    expect(
      (await harness.runnerJobs.listEvents(jobId, 0)).map(
        (event) => event.kind,
      ),
    ).toEqual(["verifier.rejected"]);

    const duplicate = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      callbackBody,
      run.authorization,
    );
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({
      data: { duplicate: true, runnerJob: { eventCursor: 1 } },
    });
    expect(
      (
        await harness.sessionRepository.listEvents(harness.bundle.sessionId)
      ).filter((event) => event.kind === "experiment.evidence_rejected"),
    ).toHaveLength(1);
  });

  it("releases a declared inconclusive v5 result as educational evidence", async () => {
    const harness = await preparedScientificHostedRunner();
    const run = await completeScientificCompileAndQueueRun(harness);
    const jobId = run.dispatch.job.jobId;
    expect(
      (
        await harness.app.request(`/api/runner/jobs/${jobId}/start`, {
          method: "POST",
          headers: run.authorization,
        })
      ).status,
    ).toBe(200);
    const decisive = await scientificLeakageResult(run.bundle);
    if (decisive.concept !== "entity_leakage") {
      throw new Error("expected a leakage test result");
    }
    const accuracyByOperation = new Map<string, number>([
      ["leakage.random_row_split", 0.7],
      ["leakage.group_holdout", 0.65],
      ["leakage.identity_ablation", 0.64],
    ]);
    const runs = decisive.runs.map((resultRun) => ({
      ...resultRun,
      metrics: {
        ...resultRun.metrics,
        accuracy: accuracyByOperation.get(resultRun.operation)!,
      },
    }));
    const chartData = decisive.chartData.map((chart) => ({
      ...chart,
      accuracy: runs.find((resultRun) => resultRun.id === chart.runId)!.metrics
        .accuracy,
    }));
    const { resultHash: _decisiveResultHash, ...decisivePayload } = decisive;
    const inconclusivePayload = { ...decisivePayload, runs, chartData };
    const result = HostedVerifiedResultSetV2Schema.parse({
      ...inconclusivePayload,
      resultHash: await hashCanonical(inconclusivePayload),
    });
    const resultText = JSON.stringify(result);
    const resultFileHash = await sha256Text(resultText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${jobId}/outputs/verified-result.json`,
          {
            method: "PUT",
            headers: {
              ...run.authorization,
              "content-type": "application/json",
            },
            body: resultText,
          },
        )
      ).status,
    ).toBe(201);
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_run_inconclusive",
        idempotencyKey: "scientific-run-inconclusive",
        jobId,
        stateVersion: run.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [resultFileHash],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:04.000Z",
      },
      run.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        runnerJob: { status: "VERIFIED", eventCursor: 2 },
        session: {
          state: "EXPERIMENT_COMPLETED",
          verifiedResult: { resultHash: result.resultHash },
          evidenceVerdict: {
            kind: "INCONCLUSIVE",
            reasonCode: "GAP_WITHIN_TOLERANCE",
            resultHash: result.resultHash,
          },
        },
        verification: {
          status: "VERIFIED",
          verdict: { kind: "INCONCLUSIVE" },
        },
      },
    });

    await queueAndVerifyBoundary(harness, "inconclusive-before-revision");

    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.bundle.sessionId}/revision`,
          {
            revision:
              "The evidence is inconclusive, so I need a more separating test before repair.",
          },
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await postJson(
          harness.app,
          `/api/sessions/${harness.bundle.sessionId}/transfer`,
          {
            strategyChoice: "time_ordered_holdout",
            riskChoice: "centered_window_reads_future",
            evidenceChoices: [
              "center_true_uses_later_targets",
              "random_split_mixes_dates",
            ],
          },
        )
      ).status,
    ).toBe(200);
    const patch = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/patch/compile`,
    );
    expect(patch.status).toBe(409);
    await expect(patch.json()).resolves.toMatchObject({
      error: { code: "PATCH_LOCKED_INCONCLUSIVE" },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(3);
  });

  it("re-verifies final v5 compiler bytes before projecting verified authority", async () => {
    const harness = await preparedScientificHostedRunner();
    const staged = await stageScientificCandidate(harness);
    const changedIr = {
      ...(JSON.parse(staged.artifacts["experiment-ir.json"]) as Record<
        string,
        unknown
      >),
      unverifiedResult: 0.99,
    };
    const changedIrText = JSON.stringify(changedIr);
    const changedIrHash = await sha256Text(changedIrText);
    expect(
      (
        await harness.app.request(
          `/api/runner/jobs/${staged.jobId}/outputs/experiment-ir.json`,
          {
            method: "PUT",
            headers: {
              ...staged.authorization,
              "content-type": "application/json",
            },
            body: changedIrText,
          },
        )
      ).status,
    ).toBe(201);

    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${staged.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_compile_v5_tampered",
        idempotencyKey: "scientific-compile-v5-tampered-1",
        jobId: staged.jobId,
        stateVersion: harness.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: [
          staged.artifactHashes["discrimination-contract.json"],
          changedIrHash,
          staged.artifactHashes["lab-scene.json"],
          staged.artifactHashes["public-rationale.md"],
        ],
        finalEventCursor: staged.payload.data.runnerJob.eventCursor,
        occurredAt: "2026-07-14T10:00:01.000Z",
      },
      staged.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      ok: true,
      data: {
        runnerJob: {
          status: "REJECTED",
          error: { code: "SCIENTIFIC_VERIFIER_REJECTED" },
        },
        session: { state: "LAB_REJECTED" },
      },
    });
    const storedSession = await harness.sessionRepository.find(
      harness.bundle.sessionId,
    );
    expect(storedSession?.labVerification).toBeUndefined();
  });

  it("rejects candidate-time v5 derivations that drift before callback", async () => {
    const harness = await preparedScientificHostedRunner();
    const staged = await stageScientificCandidate(harness);
    const planKey = `runner-authority/${staged.jobId}/experiment-plan.json`;
    const storedPlan = harness.runnerObjects.objects.get(planKey);
    if (storedPlan === undefined) throw new Error("selected Plan is missing");
    const changedPlan = {
      ...(JSON.parse(storedPlan.body) as Record<string, unknown>),
      planId: "tampered_plan",
    };
    harness.runnerObjects.objects.set(planKey, {
      ...storedPlan,
      body: JSON.stringify(changedPlan),
    });

    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${staged.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_compile_v5_derivation_drift",
        idempotencyKey: "scientific-compile-v5-derivation-drift-1",
        jobId: staged.jobId,
        stateVersion: harness.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: Object.values(staged.artifactHashes),
        finalEventCursor: staged.payload.data.runnerJob.eventCursor,
        occurredAt: "2026-07-14T10:00:01.000Z",
      },
      staged.authorization,
    );
    expect(callback.status).toBe(200);
    await expect(callback.json()).resolves.toMatchObject({
      data: {
        runnerJob: {
          status: "REJECTED",
          error: { code: "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH" },
        },
        session: { state: "LAB_REJECTED" },
      },
    });
  });

  it("blocks a v5 fixed run when verified compile authority drifts later", async () => {
    const harness = await preparedScientificHostedRunner();
    const staged = await stageScientificCandidate(harness);
    const callback = await postJson(
      harness.app,
      `/api/runner/jobs/${staged.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_scientific_compile_v5_before_run_drift",
        idempotencyKey: "scientific-compile-v5-before-run-drift-1",
        jobId: staged.jobId,
        stateVersion: harness.dispatch.job.stateVersion,
        status: "VERIFIED",
        outputHashes: Object.values(staged.artifactHashes),
        finalEventCursor: staged.payload.data.runnerJob.eventCursor,
        occurredAt: "2026-07-14T10:00:01.000Z",
      },
      staged.authorization,
    );
    expect(callback.status).toBe(200);

    const selectionKey = `runner-authority/${staged.jobId}/experiment-selection.json`;
    const storedSelection = harness.runnerObjects.objects.get(selectionKey);
    if (storedSelection === undefined)
      throw new Error("fixed selection is missing");
    harness.runnerObjects.objects.set(selectionKey, {
      ...storedSelection,
      body: JSON.stringify({
        ...(JSON.parse(storedSelection.body) as Record<string, unknown>),
        normalizedScore: 0.01,
      }),
    });

    const run = await postJson(
      harness.app,
      `/api/sessions/${harness.bundle.sessionId}/lab/run`,
    );
    expect(run.status).toBe(409);
    await expect(run.json()).resolves.toMatchObject({
      error: { code: "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH" },
    });
    expect(harness.dispatcher.dispatched).toHaveLength(1);
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
    const replaySessionId = "session_static_replay";
    await seedSession(harness.sessionRepository, {
      id: replaySessionId,
      artifactId: harness.artifactId,
      mode: { kind: "verified_replay", replayId: "leakage-01" },
      state: "INGESTED",
      version: 1,
    });

    const response = await postJson(
      harness.app,
      `/api/sessions/${replaySessionId}/belief-test`,
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
    const stored = await harness.sessionRepository.find(replaySessionId);
    expect(stored?.state).toBe("INGESTED");
    expect(
      await harness.sessionRepository.listEvents(replaySessionId),
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
        maintenance: false,
        readiness: "not-checked",
      },
    });
  });

  it("keeps ordinary health shallow and performs storage and runner work only for an explicit probe", async () => {
    const first = vi.fn().mockResolvedValue({ ready: 1 });
    const prepare = vi.fn(() => ({ first }));
    const head = vi.fn().mockResolvedValue(undefined);
    const dispatcher = new CapturingRunnerDispatcher();
    const ready = vi.spyOn(dispatcher, "ready");
    const probeApi = createApi({
      runnerDispatcher: dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    });
    const environment = {
      DB: { prepare },
      ARTIFACTS: { head },
      OPENAI_API_KEY: "configured-server-key",
    } as unknown as Env;

    const shallow = await probeApi.request(
      "/api/health",
      undefined,
      environment,
    );
    expect(shallow.status).toBe(200);
    await expect(shallow.json()).resolves.toMatchObject({
      ok: true,
      data: { readiness: "not-checked" },
    });
    expect(prepare).not.toHaveBeenCalled();
    expect(first).not.toHaveBeenCalled();
    expect(head).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();

    const deep = await probeApi.request(
      "/api/health?readiness=probe",
      undefined,
      environment,
    );
    expect(deep.status).toBe(200);
    expect(prepare).toHaveBeenCalledOnce();
    expect(first).toHaveBeenCalledOnce();
    expect(head).toHaveBeenCalledOnce();
    expect(ready).toHaveBeenCalledOnce();

    const invalid = await probeApi.request(
      "/api/health?readiness=always",
      undefined,
      environment,
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toMatchObject({
      error: { code: "INVALID_READINESS_QUERY" },
    });
  });

  it("coalesces simultaneous deep readiness probes without caching their result", async () => {
    const dispatcher = new CapturingRunnerDispatcher();
    let releaseProbe: ((ready: boolean) => void) | undefined;
    const probeGate = new Promise<boolean>((resolve) => {
      releaseProbe = resolve;
    });
    const ready = vi.spyOn(dispatcher, "ready").mockReturnValue(probeGate);
    const probeApi = createApi({
      sessionRepository: new MemorySessionRepository(),
      artifactStore: new MemoryArtifactStore(),
      runnerJobRepository: new MemoryRunnerJobRepository(),
      runnerObjectStore: new MemoryRunnerObjectStore(),
      runnerDispatcher: dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    });
    const environment = {
      OPENAI_API_KEY: "configured-server-key",
    } as unknown as Env;

    const readinessRequest = probeApi.request("/ready", undefined, environment);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    const healthRequest = probeApi.request(
      "/api/health?readiness=probe",
      undefined,
      environment,
    );
    await Promise.resolve();
    expect(ready).toHaveBeenCalledOnce();
    releaseProbe?.(true);
    await Promise.all([readinessRequest, healthRequest]);

    await probeApi.request("/ready", undefined, environment);
    expect(ready).toHaveBeenCalledTimes(2);
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
        admission: true,
        analyst: true,
        maintenance: true,
        persistence: true,
        privateStorage: true,
        releaseIdentity: true,
        runner: true,
        signing: true,
      },
      maintenance: false,
      release: { status: "unbound" },
    });

    const health = await readyApi.request("/api/health", undefined, {
      OPENAI_API_KEY: "configured-server-key",
    } as unknown as Env);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      data: { readiness: "not-checked" },
    });
    const probedHealth = await readyApi.request(
      "/api/health?readiness=probe",
      undefined,
      { OPENAI_API_KEY: "configured-server-key" } as unknown as Env,
    );
    await expect(probedHealth.json()).resolves.toMatchObject({
      ok: true,
      data: { readiness: "ready" },
    });
  });

  it("does not advertise live readiness when the runner probe fails", async () => {
    const dispatcher = new CapturingRunnerDispatcher();
    vi.spyOn(dispatcher, "ready").mockRejectedValue(
      new Error("runner probe unavailable"),
    );
    const unavailableApi = createApi({
      sessionRepository: new MemorySessionRepository(),
      artifactStore: new MemoryArtifactStore(),
      runnerJobRepository: new MemoryRunnerJobRepository(),
      runnerObjectStore: new MemoryRunnerObjectStore(),
      runnerDispatcher: dispatcher,
      runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    });

    const health = await unavailableApi.request(
      "/api/health?readiness=probe",
      undefined,
      { OPENAI_API_KEY: "configured-server-key" } as unknown as Env,
    );

    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      ok: true,
      data: {
        liveCodex: "configured",
        liveKernel: "configured",
        readiness: "not-ready",
      },
    });
  });

  it("freezes API mutation during the bounded migration window", async () => {
    const maintenanceApi = createApi({
      artifactStore: new MemoryArtifactStore(),
    });
    const response = await maintenanceApi.request(
      "/api/artifacts",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sample: true }),
      },
      { COUNTERLAB_MAINTENANCE_MODE: "true" } as unknown as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "RELEASE_MAINTENANCE", retryable: true },
    });
    const health = await maintenanceApi.request("/api/health", undefined, {
      COUNTERLAB_MAINTENANCE_MODE: "true",
    } as unknown as Env);
    expect(health.status).toBe(200);
    await expect(health.json()).resolves.toMatchObject({
      data: { maintenance: true },
    });
    const readiness = await maintenanceApi.request("/ready", undefined, {
      COUNTERLAB_MAINTENANCE_MODE: "true",
    } as unknown as Env);
    expect(readiness.status).toBe(503);
    await expect(readiness.json()).resolves.toMatchObject({
      maintenance: true,
      checks: { maintenance: false },
    });
  });

  it("reports only validated release identities", async () => {
    const workerVersionId = "11111111-2222-3333-4444-555555555555";
    const workerEvidenceCommit = "a".repeat(40);
    const response = await api.request("/api/health", undefined, {
      COUNTERLAB_WORKER_EVIDENCE_COMMIT: workerEvidenceCommit,
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
      COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256: "d".repeat(64),
      COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256: "9".repeat(64),
      COUNTERLAB_RUNTIME_POLICY_SHA256: "e".repeat(64),
      COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256: "f".repeat(64),
      COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION: "PROCESS_BOUND_PARTIAL",
      COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256: "1".repeat(64),
      COUNTERLAB_WORKER_BUNDLE_SHA256: "2".repeat(64),
      COUNTERLAB_CLIENT_ASSETS_SHA256: "3".repeat(64),
      COUNTERLAB_CLIENT_ASSET_COUNT: "27",
      COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: "4".repeat(64),
      COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: "25",
      COUNTERLAB_VITE_VERSION: "8.1.4",
      COUNTERLAB_WRANGLER_VERSION: "4.110.0",
      CF_VERSION_METADATA: {
        id: workerVersionId,
        tag: `git-${workerEvidenceCommit}`,
        timestamp: "2026-07-19T00:00:00.000Z",
      },
    } as unknown as Env);

    await expect(response.json()).resolves.toMatchObject({
      data: {
        release: {
          status: "bound",
          workerVersionId,
          workerVersionTag: `git-${workerEvidenceCommit}`,
          workerEvidenceCommit,
          runnerSourceCommit: "b".repeat(40),
          runnerImageDigest: `sha256:${"c".repeat(64)}`,
          timeoutCleanupReceiptSha256: "d".repeat(64),
          aggregateLimitEvidenceSha256: "9".repeat(64),
          runtimePolicySha256: "e".repeat(64),
          proofDependencyManifestSha256: "f".repeat(64),
          workerArtifactClassification: "PROCESS_BOUND_PARTIAL",
          workerArtifactManifestSha256: "1".repeat(64),
          workerBundleSha256: "2".repeat(64),
          clientAssetsSha256: "3".repeat(64),
          clientAssetCount: 27,
          clientPublicAssetsSha256: "4".repeat(64),
          clientPublicAssetCount: 25,
          viteVersion: "8.1.4",
          wranglerVersion: "4.110.0",
        },
      },
    });

    const mismatchedTag = await api.request("/api/health", undefined, {
      COUNTERLAB_WORKER_EVIDENCE_COMMIT: workerEvidenceCommit,
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
      COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256: "d".repeat(64),
      COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256: "9".repeat(64),
      COUNTERLAB_RUNTIME_POLICY_SHA256: "e".repeat(64),
      COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256: "f".repeat(64),
      COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION: "PROCESS_BOUND_PARTIAL",
      COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256: "1".repeat(64),
      COUNTERLAB_WORKER_BUNDLE_SHA256: "2".repeat(64),
      COUNTERLAB_CLIENT_ASSETS_SHA256: "3".repeat(64),
      COUNTERLAB_CLIENT_ASSET_COUNT: "27",
      COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: "4".repeat(64),
      COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: "25",
      COUNTERLAB_VITE_VERSION: "8.1.4",
      COUNTERLAB_WRANGLER_VERSION: "4.110.0",
      CF_VERSION_METADATA: {
        id: workerVersionId,
        tag: `git-${"d".repeat(40)}`,
        timestamp: "2026-07-19T00:00:00.000Z",
      },
    } as unknown as Env);
    await expect(mismatchedTag.json()).resolves.toMatchObject({
      data: { release: { status: "unbound" } },
    });

    const missingTimeoutProof = await api.request("/api/health", undefined, {
      COUNTERLAB_WORKER_EVIDENCE_COMMIT: workerEvidenceCommit,
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
      CF_VERSION_METADATA: {
        id: workerVersionId,
        tag: `git-${workerEvidenceCommit}`,
        timestamp: "2026-07-19T00:00:00.000Z",
      },
    } as unknown as Env);
    await expect(missingTimeoutProof.json()).resolves.toMatchObject({
      data: { release: { status: "unbound" } },
    });

    for (const invalidQualificationBinding of [
      { COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256: undefined },
      { COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256: "0".repeat(63) },
      { COUNTERLAB_RUNTIME_POLICY_SHA256: undefined },
      { COUNTERLAB_RUNTIME_POLICY_SHA256: "0".repeat(63) },
      { COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256: undefined },
      { COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256: "0".repeat(63) },
      { COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION: undefined },
      { COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION: "OS_ENFORCED" },
      { COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256: undefined },
      { COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256: "0".repeat(63) },
      { COUNTERLAB_WORKER_BUNDLE_SHA256: undefined },
      { COUNTERLAB_WORKER_BUNDLE_SHA256: "0".repeat(63) },
      { COUNTERLAB_CLIENT_ASSETS_SHA256: undefined },
      { COUNTERLAB_CLIENT_ASSETS_SHA256: "0".repeat(63) },
      { COUNTERLAB_CLIENT_ASSET_COUNT: undefined },
      { COUNTERLAB_CLIENT_ASSET_COUNT: "0" },
      { COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: undefined },
      { COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: "0".repeat(63) },
      { COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: undefined },
      { COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: "28" },
      { COUNTERLAB_VITE_VERSION: undefined },
      { COUNTERLAB_VITE_VERSION: "8.1.5" },
      { COUNTERLAB_WRANGLER_VERSION: undefined },
      { COUNTERLAB_WRANGLER_VERSION: "4.111.0" },
    ]) {
      const environment = {
        COUNTERLAB_WORKER_EVIDENCE_COMMIT: workerEvidenceCommit,
        COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
        COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
        COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256: "d".repeat(64),
        COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256: "9".repeat(64),
        COUNTERLAB_RUNTIME_POLICY_SHA256: "e".repeat(64),
        COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256: "f".repeat(64),
        COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION: "PROCESS_BOUND_PARTIAL",
        COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256: "1".repeat(64),
        COUNTERLAB_WORKER_BUNDLE_SHA256: "2".repeat(64),
        COUNTERLAB_CLIENT_ASSETS_SHA256: "3".repeat(64),
        COUNTERLAB_CLIENT_ASSET_COUNT: "27",
        COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: "4".repeat(64),
        COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: "25",
        COUNTERLAB_VITE_VERSION: "8.1.4",
        COUNTERLAB_WRANGLER_VERSION: "4.110.0",
        CF_VERSION_METADATA: {
          id: workerVersionId,
          tag: `git-${workerEvidenceCommit}`,
          timestamp: "2026-07-19T00:00:00.000Z",
        },
        ...invalidQualificationBinding,
      } as unknown as Env;
      const invalidQualification = await api.request(
        "/api/health",
        undefined,
        environment,
      );
      await expect(invalidQualification.json()).resolves.toMatchObject({
        data: { release: { status: "unbound" } },
      });
      const readiness = await api.request("/ready", undefined, environment);
      expect(readiness.status).toBe(503);
      await expect(readiness.json()).resolves.toMatchObject({
        checks: { releaseIdentity: false },
      });
    }
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

    const lateCallback = await postJson(
      harness.app,
      `/api/runner/jobs/${firstBody.data.runnerJob.jobId}/callback`,
      {
        schemaVersion: "1",
        callbackId: "callback_after_start_over",
        idempotencyKey: "callback-after-start-over",
        jobId: firstBody.data.runnerJob.jobId,
        stateVersion: harness.dispatch.job.stateVersion,
        status: "FAILED",
        outputHashes: [],
        finalEventCursor: 0,
        occurredAt: "2026-07-14T10:00:01.000Z",
        error: {
          code: "LATE_RUNNER_CALLBACK",
          message: "Late completion after browser reset",
          retryable: false,
        },
      },
      { authorization: `Bearer ${harness.dispatch.token}` },
    );
    expect(lateCallback.status).toBe(409);
    await expect(lateCallback.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNNER_CALLBACK_STATE" },
    });
    const afterLateCallback = await harness.runnerJobs.find(
      firstBody.data.runnerJob.jobId,
    );
    expect(afterLateCallback).toMatchObject({ status: "CANCELLED" });
  });

  it("acquires one opaque runner lease and releases it on cancellation", async () => {
    const admissionControl = new CapturingAdmissionControl();
    const dispatcher = new CapturingRunnerDispatcher();
    const harness = await preparedHostedRunner(
      "session_admission_release",
      dispatcher,
      admissionControl,
    );
    const queued = (await harness.queued.json()) as {
      data: { runnerJob: RunnerJob };
    };

    expect(admissionControl.admitted).toHaveLength(1);
    expect(admissionControl.admitted[0]).toMatchObject({
      kind: "runner",
      callerKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
      sessionKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
      operationKey: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    const cancelled = await postJson(
      harness.app,
      `/api/sessions/${queued.data.runnerJob.sessionId}/jobs/${queued.data.runnerJob.jobId}/cancel`,
    );
    expect(cancelled.status).toBe(200);
    expect(admissionControl.released).toEqual([
      {
        policyVersion: "counterlab-admission-v1",
        kind: "runner",
        operationKey: admissionControl.admitted[0]?.operationKey,
      },
    ]);
  });

  it("preserves a failed dispatch and retries the compile on a fresh separate job", async () => {
    const dispatcher = new CapturingRunnerDispatcher(1);
    const harness = await preparedHostedRunner(
      "session_dispatch_recovery",
      dispatcher,
    );
    expect(harness.queued.status).toBe(503);
    await expect(harness.queued.clone().json()).resolves.toMatchObject({
      ok: false,
      error: { code: "RUNNER_DISPATCH_FAILED", retryable: true },
    });
    const firstAttempt = dispatcher.dispatched[0];
    if (firstAttempt === undefined)
      throw new Error("first dispatch was missing");
    await expect(
      harness.runnerJobs.find(firstAttempt.job.jobId),
    ).resolves.toMatchObject({
      status: "FAILED",
      error: { code: "RUNNER_DISPATCH_FAILED", retryable: true },
    });
    await expect(
      harness.runnerJobs.listEvents(firstAttempt.job.jobId, 0),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "job.failed",
        code: "RUNNER_DISPATCH_FAILED",
      }),
    ]);

    const retry = await postJson(
      harness.app,
      `/api/sessions/${firstAttempt.job.sessionId}/lab/compile`,
    );

    expect(retry.status).toBe(202);
    const retryBody = (await retry.json()) as {
      data: { runnerJob: RunnerJob; reused?: boolean };
    };
    expect(retryBody).toMatchObject({
      data: {
        runnerJob: {
          status: "STARTING",
        },
      },
    });
    expect(retryBody.data).not.toHaveProperty("reused");
    expect(dispatcher.dispatched).toHaveLength(2);
    expect(dispatcher.dispatched[1]?.job.jobId).not.toBe(
      firstAttempt.job.jobId,
    );
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
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
    } as unknown as Env & Record<string, string>);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        liveCodex: "configured",
        liveKernel: "configured",
        sandbox: "credential-and-privilege-boundary",
        generationFilesystemReadIsolation: "PARTIAL",
      },
    });

    const unsigned = await api.request("/api/health", undefined, {
      COUNTERLAB_RUNNER_BASE_URL: "http://127.0.0.1:8788",
      COUNTERLAB_RUNNER_SOURCE_COMMIT: "b".repeat(40),
      COUNTERLAB_RUNNER_IMAGE_DIGEST: `sha256:${"c".repeat(64)}`,
    } as unknown as Env & Record<string, string>);
    await expect(unsigned.json()).resolves.toMatchObject({
      data: { liveCodex: "local-runner-required" },
    });
  });

  it("does not advertise an HTTP runner without an exact release identity", async () => {
    const response = await api.request("/api/health", undefined, {
      COUNTERLAB_RUNNER_BASE_URL: "http://127.0.0.1:8788",
      COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY: TEST_RUNNER_SIGNING_PRIVATE_KEY,
    } as unknown as Env & Record<string, string>);

    await expect(response.json()).resolves.toMatchObject({
      data: {
        liveCodex: "local-runner-required",
        liveKernel: "local-runner-required",
        readiness: "not-checked",
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
        patch: { originalSha256: string; patchedSha256: string };
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
    expect(body.data.patch).toMatchObject({
      originalSha256:
        "92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024",
      patchedSha256:
        "eb20dc7e71431ad5b4a57437d740a1c8844cd335bf3a3d54db48e23dfbd3a034",
    });
  });

  it("returns a typed error for an unknown replay", async () => {
    const response = await api.request("/api/replays/missing");

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "REPLAY_NOT_FOUND",
        message: "The requested replay was not found",
        status: 404,
      },
    });

    const overlong = await api.request(`/api/replays/${"a".repeat(129)}`);
    expect(overlong.status).toBe(404);
    await expect(overlong.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "REPLAY_NOT_FOUND",
        message: "The requested replay was not found",
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
          learnerClaim: SAMPLE_LEAKAGE_QUESTION,
        }),
      },
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Record<string, unknown> };
    expect(body).toMatchObject({
      ok: true,
      data: {
        sessionId,
        mode: { kind: "sample_lesson", sampleId: "leakage-01" },
        state: "BELIEF_TEST_PROPOSED",
      },
    });
    expect(body.data).toHaveProperty("beliefTest");
    expect(body.data).not.toHaveProperty("beliefSpec");
    const events = await sessionRepository.listEvents(sessionId);
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({
      actor: "system",
      kind: "belief_test.proposed",
      modelId: "leakage-customer-churn-belief-v2",
    });
    expect(events[1]).not.toHaveProperty("promptHash");
  });

  it("rejects unrelated learner prose outside the fixed sample claim authority", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const unrelatedThought =
      "Purple bananas taste better on Tuesdays, so this score is meaningless.";

    const response = await postJson(
      app,
      `/api/sessions/${sessionId}/belief-test`,
      { learnerClaim: unrelatedThought },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: {
        code: "SAMPLE_CLAIM_MISMATCH",
        message:
          "This fixed sample supports only its disclosed customer-generalization question. Start a live investigation for a custom claim.",
        status: 400,
      },
    });
    await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
      state: "INGESTED",
      version: 1,
    });
    const events = await sessionRepository.listEvents(sessionId);
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain(unrelatedThought);
  });

  it("fails closed when restoring or exporting a historical out-of-scope sample", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const route = `/api/sessions/${sessionId}`;
    expect(
      (
        await postJson(app, `${route}/belief-test`, {
          learnerClaim: SAMPLE_LEAKAGE_QUESTION,
        })
      ).status,
    ).toBe(200);
    const current = await sessionRepository.find(sessionId);
    const previous = await sessionRepository.lastEvent(sessionId);
    if (current?.beliefTest === undefined || previous === undefined) {
      throw new Error("sample belief fixture was not created");
    }
    const outOfScopeClaim =
      "Purple bananas taste better on Tuesdays, so this score is meaningless.";
    const historical: CounterLabSession = {
      ...current,
      state: "BELIEF_TEST_PROPOSED",
      version: current.version + 1,
      beliefTest: {
        ...current.beliefTest,
        learnerClaim: outOfScopeClaim,
      },
    };
    const historicalEvent = await createEvidenceEvent({
      sessionId,
      sequence: previous.sequence + 1,
      timestamp: historical.updatedAt,
      eventId: `event_${sessionId}_historical_scope`,
      previousEventHash: previous.eventHash,
      draft: {
        actor: "learner",
        kind: "belief_test.edited",
        payload: { beliefTestId: current.beliefTest.id },
      },
    });
    await sessionRepository.save(historical, current.version, historicalEvent);

    for (const endpoint of [
      route,
      `${route}/events`,
      `${route}/reasoning-diff`,
      `${route}/patch/download`,
      `${route}/proof-bundle`,
      `${route}/proof-capsule`,
    ]) {
      const response = await app.request(endpoint);
      expect(response.status, endpoint).toBe(409);
      await expect(response.json()).resolves.toEqual({
        ok: false,
        error: {
          code: "SAMPLE_SCOPE_RESTART_REQUIRED",
          message:
            "This historical sample used custom claim framing outside the fixed evidence scope. Start a new fixed sample to inspect verified conclusions.",
          status: 409,
        },
      });
    }

    const beforeAdvance = await sessionRepository.find(sessionId);
    const advance = await postJson(app, `${route}/belief-test/confirm`, {
      action: "confirm",
    });
    expect(advance.status).toBe(409);
    await expect(advance.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "SAMPLE_SCOPE_RESTART_REQUIRED", status: 409 },
    });
    await expect(sessionRepository.find(sessionId)).resolves.toEqual(
      beforeAdvance,
    );
  });

  it("returns bounded all-status compiler history and rejects a missing cursor", async () => {
    const { app, artifactId, sessionId, runnerJobs } =
      await sessionHarness("sample");
    const runnerJob = (
      jobId: string,
      status: "REJECTED" | "FAILED",
      createdAt: string,
    ): RunnerJob =>
      RunnerJobSchema.parse({
        schemaVersion: "1",
        jobId,
        kind: "LAB_COMPILE",
        status,
        sessionId,
        artifactId,
        artifactManifestHash: "a".repeat(64),
        conceptPack: { id: "entity_leakage", version: "2.0.0" },
        inputHashes: ["b".repeat(64)],
        stateVersion: 1,
        jobVersion: 2,
        createdAt,
        updatedAt: createdAt,
        completedAt: createdAt,
        attempt: 1,
        maxAttempts: 2,
        runnerIdentity: "bounded-runner-history-test",
        timeoutSeconds: 90,
        outputHashes: [],
        error: {
          code: status === "REJECTED" ? "PLAN_REJECTED" : "RUNNER_FAILED",
          message: "The bounded runner attempt released no result.",
          retryable: true,
        },
        eventCursor: 1,
      });
    const firstJob = runnerJob(
      "job_rejected_history",
      "REJECTED",
      "2026-07-14T10:01:00.000Z",
    );
    const secondJob = runnerJob(
      "job_failed_history",
      "FAILED",
      "2026-07-14T10:02:00.000Z",
    );
    const compilerEvent = (
      jobId: string,
      eventId: string,
      at: string,
    ): PublicCompilerEvent => ({
      schemaVersion: "1",
      eventId,
      jobId,
      cursor: 1,
      at,
      kind: "job.started",
    });
    const firstEvent = compilerEvent(
      firstJob.jobId,
      "compiler_rejected_1",
      firstJob.createdAt,
    );
    const secondEvent = compilerEvent(
      secondJob.jobId,
      "compiler_failed_1",
      secondJob.createdAt,
    );
    await runnerJobs.create(firstJob);
    await runnerJobs.create(secondJob);
    runnerJobs.replaceEventsForIntegrityTest(firstJob.jobId, [firstEvent]);
    runnerJobs.replaceEventsForIntegrityTest(secondJob.jobId, [secondEvent]);

    const response = await app.request(`/api/sessions/${sessionId}/events`);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        compilerEvents: [firstEvent, secondEvent],
        compilerActivity: {
          schemaVersion: "1",
          status: "RECORDED",
          ordering: "job-created-at-job-id-then-cursor",
          jobCount: 2,
          eventCount: 2,
        },
      },
    });

    runnerJobs.replaceEventsForIntegrityTest(secondJob.jobId, [
      { ...secondEvent, eventId: firstEvent.eventId },
    ]);
    const duplicateIdentity = await app.request(
      `/api/sessions/${sessionId}/events`,
    );
    expect(duplicateIdentity.status).toBe(409);
    await expect(duplicateIdentity.json()).resolves.toMatchObject({
      error: { code: "COMPILER_ACTIVITY_INVALID" },
    });

    runnerJobs.replaceEventsForIntegrityTest(secondJob.jobId, [
      { ...secondEvent, jobId: firstJob.jobId },
    ]);
    const foreignStream = await app.request(
      `/api/sessions/${sessionId}/events`,
    );
    expect(foreignStream.status).toBe(409);
    await expect(foreignStream.json()).resolves.toMatchObject({
      error: { code: "COMPILER_ACTIVITY_INVALID" },
    });

    runnerJobs.replaceEventsForIntegrityTest(secondJob.jobId, [secondEvent]);
    runnerJobs.replaceEventsForIntegrityTest(firstJob.jobId, []);
    const corrupted = await app.request(`/api/sessions/${sessionId}/events`);
    expect(corrupted.status).toBe(409);
    await expect(corrupted.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "COMPILER_ACTIVITY_INVALID", status: 409 },
    });
  });

  it("returns a retryable busy response when runner history keeps changing", async () => {
    const { app, artifactId, sessionId, runnerJobs } =
      await sessionHarness("sample");
    await runnerJobs.create(
      RunnerJobSchema.parse({
        schemaVersion: "1",
        jobId: "job_snapshot_race",
        kind: "LAB_COMPILE",
        status: "QUEUED",
        sessionId,
        artifactId,
        artifactManifestHash: "a".repeat(64),
        conceptPack: { id: "entity_leakage", version: "2.0.0" },
        inputHashes: ["b".repeat(64)],
        stateVersion: 1,
        jobVersion: 1,
        createdAt: "2026-07-14T10:01:00.000Z",
        updatedAt: "2026-07-14T10:01:00.000Z",
        attempt: 0,
        maxAttempts: 2,
        runnerIdentity: null,
        timeoutSeconds: 90,
        outputHashes: [],
        eventCursor: 0,
      }),
    );
    runnerJobs.mutateEveryHistorySnapshotEnd();

    const response = await app.request(`/api/sessions/${sessionId}/events`);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: {
        code: "EVIDENCE_SNAPSHOT_BUSY",
        status: 503,
        retryable: true,
      },
    });
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

  it("does not make a duplicate live analyst call while the same packet is active", async () => {
    const { app, sessionId, sessionRepository, artifactStore } =
      await sessionHarness("live");
    const learnerClaim =
      "The notebook accuracy proves generalization to new customers.";
    const beliefInput = await liveBeliefInput(app, sessionId, learnerClaim);
    const admissionControl = new CapturingAdmissionControl({
      admitted: true,
      reused: true,
      leaseStatus: "already-active",
      leaseExpiresAt: Date.parse("2026-07-14T10:02:00.000Z"),
    });
    const admissionApp = createApi({
      sessionRepository,
      artifactStore,
      admissionControl,
      admissionHmacKey:
        "contained-api-admission-test-key-with-at-least-32-characters",
      admissionCaller: () => "203.0.113.8",
      now: () => new Date("2026-07-14T10:00:00.000Z"),
    });
    const upstream = vi.spyOn(globalThis, "fetch");

    try {
      const response = await admissionApp.request(
        `/api/sessions/${sessionId}/belief-test`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(beliefInput),
        },
        {
          OPENAI_API_KEY: "server-only-key",
          OPENAI_MODEL: "configured-model",
        } as unknown as Env & Record<string, string>,
      );

      expect(response.status).toBe(409);
      expect(response.headers.get("retry-after")).toBe("120");
      await expect(response.json()).resolves.toMatchObject({
        error: {
          code: "ANALYST_IN_PROGRESS",
          retryable: true,
          status: 409,
        },
      });
      expect(upstream).not.toHaveBeenCalled();
      expect(admissionControl.released).toHaveLength(0);
      await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
        state: "INGESTED",
      });
    } finally {
      upstream.mockRestore();
    }
  });

  it("persists native v2 belief authority for a successful live notebook analysis", async () => {
    const { app, sessionId, sessionRepository, artifactStore } =
      await sessionHarness("live");
    const artifact = await artifactStore.find("artifact_uploaded_not_sample");
    if (artifact === undefined) throw new Error("live artifact is missing");
    const learnerClaim =
      "The notebook accuracy proves generalization to new customers.";
    const beliefInput = await liveBeliefInput(app, sessionId, learnerClaim);
    const upstream = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        structuredResponsesResult(liveBeliefSpecWire(artifact.manifest)),
      );

    try {
      const response = await app.request(
        `/api/sessions/${sessionId}/belief-test`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(beliefInput),
        },
        {
          OPENAI_API_KEY: "server-only-key",
          OPENAI_MODEL: "configured-model",
        } as unknown as Env & Record<string, string>,
      );

      expect(response.status).toBe(200);
      const body = (await response.json()) as { data: Record<string, unknown> };
      expect(body.data).toMatchObject({
        state: "BELIEF_TEST_PROPOSED",
        beliefSpec: {
          schemaVersion: "2",
          concept: "entity_leakage",
          claim: learnerClaim,
          learnerDecision: "UNDECIDED",
        },
      });
      expect(body.data).not.toHaveProperty("beliefTest");
      const beliefSpecId = (body.data.beliefSpec as { id: string }).id;
      const confirmed = await postJson(
        app,
        `/api/sessions/${sessionId}/belief-test/confirm`,
        { action: "confirm" },
      );
      await expect(confirmed.json()).resolves.toMatchObject({
        data: {
          state: "BELIEF_TEST_CONFIRMED",
          beliefSpec: { learnerDecision: "CONFIRMED" },
        },
      });
      const prediction = await postJson(
        app,
        `/api/sessions/${sessionId}/prediction`,
        { choice: "Group holdout remains high", confidence: 73 },
      );
      await expect(prediction.json()).resolves.toMatchObject({
        data: {
          state: "PREDICTION_COMMITTED",
          prediction: { beliefTestId: beliefSpecId },
        },
      });
      const refreshed = await app.request(`/api/sessions/${sessionId}`);
      await expect(refreshed.json()).resolves.toMatchObject({
        data: {
          state: "PREDICTION_COMMITTED",
          beliefSpec: { schemaVersion: "2", learnerDecision: "CONFIRMED" },
          prediction: { beliefTestId: beliefSpecId },
        },
      });
      const runnerJobs = new MemoryRunnerJobRepository();
      const runnerObjects = new MemoryRunnerObjectStore();
      const dispatcher = new CapturingRunnerDispatcher();
      const compileApp = createApi({
        sessionRepository,
        artifactStore,
        runnerJobRepository: runnerJobs,
        runnerObjectStore: runnerObjects,
        runnerDispatcher: dispatcher,
        runnerSigningPrivateKey: TEST_RUNNER_SIGNING_PRIVATE_KEY,
        now: () => new Date("2026-07-14T10:00:00.000Z"),
        id: (prefix) => `${prefix}_v5_live`,
      });
      const compile = await postJson(
        compileApp,
        `/api/sessions/${sessionId}/lab/compile`,
      );
      expect(compile.status).toBe(202);
      expect(dispatcher.dispatched).toHaveLength(1);
      const dispatched = dispatcher.dispatched[0];
      if (dispatched === undefined)
        throw new Error("v5 job was not dispatched");
      const storedInput = runnerObjects.objects.get(
        `runner-input/${dispatched.job.jobId}.json`,
      );
      if (storedInput === undefined) throw new Error("v5 input was not stored");
      const storedBundle = RunnerLabCompileBundleV5Schema.parse(
        JSON.parse(storedInput.body),
      );
      expect(storedBundle).toMatchObject({
        schemaVersion: "5",
        approvedBeliefSpec: { id: beliefSpecId },
        conceptPack: {
          candidateExperimentIds: [
            "group-holdout",
            "group-holdout-plus-ablation",
          ],
          fixedExecutionContract: {
            runSeed: 1729,
            inconclusiveOutcomes: [
              {
                conditionId: "gap-within-tolerance",
                description:
                  "The measured gap falls between the two decisive patterns.",
                nextExperimentId: "group-holdout-plus-ablation",
              },
            ],
          },
          planRequirements: expect.arrayContaining([
            'Fixed scorer required heldConstantIds: ["model","seed","test_fraction","entity_field","primary_identity_setting","preprocessing","model_hyperparameters"].',
            'Fixed scorer allowed changedVariableIds: ["split_strategy","identity_feature"].',
            'Fixed scorer decisive pattern pairs: [{"currentPatternId":"leakage.small-gap","competingPatternId":"leakage.material-gap","separation":0.82}].',
          ]),
          transferTask: {
            id: "forecast-future-leakage-v1",
            evaluatorTaskId: "forecasting-future-leakage-01",
            experimentIrContract: {
              taskId: "forecast-future-leakage-v1",
              changedSurface: "Time-ordered forecasting",
              requiredActionIds: ["time_ordered_holdout"],
              nonClaims: ["This transfer does not certify global mastery."],
            },
          },
        },
        permittedOutputs: [
          "discrimination-contract.json",
          "experiment-ir.json",
          "lab-scene.json",
          "public-rationale.md",
        ],
      });
      const packContractHash = storedBundle.provenance.inputHashes[3];
      expect(packContractHash).toBeDefined();
      expect(
        dispatched.job.requestIdentity?.authorityInputHashes.compilerPrompt,
      ).toBe(storedBundle.provenance.promptHash);
      expect(storedBundle.provenance.promptHash).toBe(
        await hashCanonical({
          promptVersion: "scientific-method-compile-v4",
          conceptPack: {
            id: storedBundle.conceptPack.id,
            version: storedBundle.conceptPack.version,
          },
          packContractHash,
          candidateExperimentIds:
            storedBundle.conceptPack.candidateExperimentIds,
          boundarySweep: storedBundle.conceptPack.boundarySweep,
          fixedExecutionContract:
            storedBundle.conceptPack.fixedExecutionContract,
          transferTask: storedBundle.conceptPack.transferTask,
          schemaHashes: {
            discriminationContract: await hashCanonical(
              storedBundle.schemas.discriminationContract,
            ),
            experimentIr: await hashCanonical(
              storedBundle.schemas.experimentIr,
            ),
            labScene: await hashCanonical(storedBundle.schemas.labScene),
          },
        }),
      );
      expect(await sessionRepository.listEvents(sessionId)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "belief_spec.proposed",
            modelId: "configured-model",
          }),
        ]),
      );
    } finally {
      upstream.mockRestore();
    }
  });

  it("returns an honest insufficient-evidence Belief Spec before any live model call", async () => {
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
        beliefSpec: {
          schemaVersion: "2",
          concept: "entity_leakage",
          evidenceRefs: [],
          supportState: "INSUFFICIENT_EVIDENCE",
          learnerDecision: "UNDECIDED",
        },
      },
    });
    const events = await harness.sessionRepository.listEvents(
      body.data.sessionId,
    );
    expect(events.at(-1)).toMatchObject({
      actor: "system",
      kind: "belief_spec.proposed",
    });
    expect(events.at(-1)).not.toHaveProperty("promptHash");
  });

  it("rejects an inapplicable live claim before preview, admission, or model work", async () => {
    const { app, sessionId, sessionRepository } = await sessionHarness("live");
    const learnerClaim = "Purple bananas sing together at midnight.";

    const preview = await postJson(
      app,
      `/api/sessions/${sessionId}/belief-test/preview`,
      { learnerClaim },
    );
    expect(preview.status).toBe(422);
    const previewBody = await preview.json();
    expect(previewBody).toEqual({
      ok: false,
      error: {
        code: "CLAIM_NOT_APPLICABLE",
        message:
          "Ask how the notebook evaluates generalization across distinct entities, such as customers, patients, or accounts.",
        status: 422,
      },
    });

    const submit = await postJson(
      app,
      `/api/sessions/${sessionId}/belief-test`,
      { learnerClaim, previewHash: "0".repeat(64) },
    );
    expect(submit.status).toBe(422);
    const submitBody = await submit.json();
    expect(submitBody).toMatchObject({
      ok: false,
      error: { code: "CLAIM_NOT_APPLICABLE", status: 422 },
    });
    await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
      state: "INGESTED",
      version: 1,
    });
    const events = await sessionRepository.listEvents(sessionId);
    expect(events).toHaveLength(1);
    expect(JSON.stringify({ previewBody, submitBody, events })).not.toContain(
      learnerClaim,
    );
  });

  it("does not store an inapplicable claim when artifact evidence is insufficient", async () => {
    const harness = await sessionHarness("sample");
    const sample = await harness.artifactStore.find(harness.artifactId);
    if (sample === undefined) throw new Error("sample artifact is missing");
    const sparseManifest = {
      ...sample.manifest,
      artifactId: "artifact_sparse_off_topic",
      fileName: "sparse-off-topic.ipynb",
      fileSha256: "d".repeat(64),
      cells: [],
    } satisfies ArtifactManifest;
    await harness.artifactStore.save(
      sparseManifest,
      "uploads/artifact_sparse_off_topic.ipynb",
    );
    const created = await postJson(harness.app, "/api/live/sessions", {
      artifactId: sparseManifest.artifactId,
    });
    const body = (await created.json()) as { data: { sessionId: string } };

    const response = await postJson(
      harness.app,
      `/api/sessions/${body.data.sessionId}/belief-test`,
      { learnerClaim: "Purple bananas sing together at midnight." },
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "CLAIM_NOT_APPLICABLE", status: 422 },
    });
    await expect(
      harness.sessionRepository.find(body.data.sessionId),
    ).resolves.toMatchObject({ state: "INGESTED", version: 1 });
    expect(
      await harness.sessionRepository.listEvents(body.data.sessionId),
    ).toHaveLength(1);
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

  it("keeps Repair locked after a failed leakage transfer", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const route = `/api/sessions/${sessionId}`;

    await postJson(app, `${route}/belief-test`, {
      learnerClaim: SAMPLE_LEAKAGE_QUESTION,
    });
    await postJson(app, `${route}/belief-test/confirm`, { action: "confirm" });
    await postJson(app, `${route}/prediction`, {
      choice: "Accuracy remains near 98%",
      confidence: 72,
    });
    await postJson(app, `${route}/lab/compile`);
    await postJson(app, `${route}/lab/run`);
    await postJson(app, `${route}/revision`, {
      revision:
        "Hold out complete entities and remove identity shortcuts before claiming generalization.",
    });
    const transfer = await postJson(app, `${route}/transfer`, {
      strategyChoice: "time_ordered_holdout",
      riskChoice: "model_is_too_simple",
      evidenceChoices: [
        "center_true_uses_later_targets",
        "random_split_mixes_dates",
      ],
    });
    expect(transfer.status).toBe(200);
    await expect(transfer.json()).resolves.toMatchObject({
      data: {
        state: "TRANSFER_FAILED",
        transferResult: { outcome: "FAILED" },
      },
    });

    const patch = await postJson(app, `${route}/patch/compile`);
    expect(patch.status).toBe(409);
    await expect(patch.json()).resolves.toMatchObject({
      error: { code: "PATCH_LOCKED_TRANSFER" },
    });
    await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
      state: "TRANSFER_FAILED",
      transferResult: { outcome: "FAILED" },
    });
    expect(
      (await sessionRepository.find(sessionId))?.patchResult,
    ).toBeUndefined();
  });

  it("recovers a persisted in-progress transfer without duplicating the start transition", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const route = `/api/sessions/${sessionId}`;

    await postJson(app, `${route}/belief-test`, {
      learnerClaim: SAMPLE_LEAKAGE_QUESTION,
    });
    await postJson(app, `${route}/belief-test/confirm`, { action: "confirm" });
    await postJson(app, `${route}/prediction`, {
      choice: "Accuracy remains near 98%",
      confidence: 72,
    });
    await postJson(app, `${route}/lab/compile`);
    await postJson(app, `${route}/lab/run`);
    await postJson(app, `${route}/revision`, {
      revision:
        "Evaluation must follow the deployment boundary and use the recorded code evidence.",
    });

    const interruptedService = new SessionService(sessionRepository, {
      id: (prefix) => `${prefix}_interrupted_transfer`,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
    });
    await interruptedService.startTransfer(sessionId);
    await expect(sessionRepository.find(sessionId)).resolves.toMatchObject({
      state: "TRANSFER_IN_PROGRESS",
    });
    const restored = await app.request(route);
    expect(restored.status).toBe(200);
    await expect(restored.json()).resolves.toMatchObject({
      data: { state: "TRANSFER_IN_PROGRESS" },
    });

    const failed = await postJson(app, `${route}/transfer`, {
      strategyChoice: "time_ordered_holdout",
      riskChoice: "model_is_too_simple",
      evidenceChoices: [
        "center_true_uses_later_targets",
        "random_split_mixes_dates",
      ],
    });
    expect(failed.status).toBe(200);
    await expect(failed.json()).resolves.toMatchObject({
      data: {
        state: "TRANSFER_FAILED",
        transferResult: { outcome: "FAILED" },
      },
    });
    expect((await postJson(app, `${route}/patch/compile`)).status).toBe(409);

    const passed = await postJson(app, `${route}/transfer`, {
      strategyChoice: "time_ordered_holdout",
      riskChoice: "centered_window_reads_future",
      evidenceChoices: [
        "center_true_uses_later_targets",
        "random_split_mixes_dates",
      ],
    });
    expect(passed.status).toBe(200);
    await expect(passed.json()).resolves.toMatchObject({
      data: {
        state: "TRANSFER_PASSED",
        transferResult: { outcome: "PASSED" },
      },
    });

    const eventKinds = (await sessionRepository.listEvents(sessionId)).map(
      (event) => event.kind,
    );
    expect(
      eventKinds.filter((kind) => kind === "transfer.started"),
    ).toHaveLength(2);
    expect(
      eventKinds.filter((kind) => kind === "transfer.failed"),
    ).toHaveLength(1);
    expect(
      eventKinds.filter((kind) => kind === "transfer.passed"),
    ).toHaveLength(1);
  });

  it("rejects unknown or duplicate leakage transfer IDs before mutation", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const route = `/api/sessions/${sessionId}`;

    await postJson(app, `${route}/belief-test`, {
      learnerClaim: SAMPLE_LEAKAGE_QUESTION,
    });
    await postJson(app, `${route}/belief-test/confirm`, { action: "confirm" });
    await postJson(app, `${route}/prediction`, {
      choice: "Accuracy remains near 98%",
      confidence: 72,
    });
    await postJson(app, `${route}/lab/compile`);
    await postJson(app, `${route}/lab/run`);
    await postJson(app, `${route}/revision`, {
      revision:
        "Evaluation must follow the deployment boundary and use the recorded code evidence.",
    });

    const before = await sessionRepository.find(sessionId);
    const eventsBefore = await sessionRepository.listEvents(sessionId);
    const invalidSubmissions = [
      {
        strategyChoice: "invented_strategy",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: ["center_true_uses_later_targets"],
      },
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "invented_risk",
        evidenceChoices: ["center_true_uses_later_targets"],
      },
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: ["invented_evidence"],
      },
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: [
          "center_true_uses_later_targets",
          "center_true_uses_later_targets",
        ],
      },
    ];

    for (const submission of invalidSubmissions) {
      const response = await postJson(app, `${route}/transfer`, submission);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
      await expect(sessionRepository.find(sessionId)).resolves.toEqual(before);
      await expect(sessionRepository.listEvents(sessionId)).resolves.toEqual(
        eventsBefore,
      );
    }
  });

  it("rejects leakage, obsolete cost, and duplicate tuples for an imbalance session before mutation", async () => {
    const harness = await preparedImbalanceInteractiveSession();
    const route = `/api/sessions/${harness.sessionId}`;
    expect(
      (
        await postJson(harness.app, `${route}/revision`, {
          revision:
            "Rare events require class-specific evidence and deployment-cost reasoning.",
        })
      ).status,
    ).toBe(200);
    const before = await harness.sessionRepository.find(harness.sessionId);
    const eventsBefore = await harness.sessionRepository.listEvents(
      harness.sessionId,
    );

    const invalidSubmissions = [
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: ["center_true_uses_later_targets"],
      },
      {
        strategyChoice: "cost_aware_threshold",
        riskChoice: "minority_false_negative_cost",
        evidenceChoices: [
          "confusion_matrix_exposes_misses",
          "prevalence_shift_changes_precision",
        ],
      },
      {
        decisionChoice: "reject_accuracy_only",
        metricChoice: "recall_and_pr_auc",
        evidenceChoices: ["zero_true_positives", "zero_true_positives"],
      },
    ];

    for (const submission of invalidSubmissions) {
      const response = await postJson(
        harness.app,
        `${route}/transfer`,
        submission,
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "VALIDATION_ERROR" },
      });
      await expect(
        harness.sessionRepository.find(harness.sessionId),
      ).resolves.toEqual(before);
      await expect(
        harness.sessionRepository.listEvents(harness.sessionId),
      ).resolves.toEqual(eventsBefore);
    }
  });

  it("persists the evidence-gated instant path through a verified patch", async () => {
    const { app, sessionId, sessionRepository } =
      await sessionHarness("sample");
    const route = `/api/sessions/${sessionId}`;

    expect(
      (
        await postJson(app, `${route}/belief-test`, {
          learnerClaim: SAMPLE_LEAKAGE_QUESTION,
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
    const patchBody = (await patch.json()) as {
      data: {
        patch: {
          sourceArtifactHash: string;
          patchedArtifactHash: string;
        };
      };
    };
    expect(patchBody).toMatchObject({
      ok: true,
      data: {
        state: "PATCH_VERIFIED",
        patch: {
          status: "VERIFIED",
          modifiedCells: [3],
          verification: { passed: true },
        },
      },
    });
    expect(patchBody.data).not.toHaveProperty("reasoningDiff");
    expect(patchBody.data).not.toHaveProperty("proofBundle");
    expect(patchBody.data.patch).toMatchObject({
      sourceArtifactHash:
        "d0e9f3238753f1ca55534446d83e36041590f31c607a011def3f1d0db3a5bbc9",
      patchedArtifactHash:
        "6aee552e94f2dfbad8366cdd2435dcc5aa0c3c6cd45798a924779ae5008561fc",
    });

    const download = await app.request(`${route}/patch/download`);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toContain(
      "application/x-ipynb+json",
    );
    expect(await sha256Text(await download.text())).toBe(
      "6aee552e94f2dfbad8366cdd2435dcc5aa0c3c6cd45798a924779ae5008561fc",
    );

    const session = await sessionRepository.find(sessionId);
    expect(session).toMatchObject({
      state: "PATCH_VERIFIED",
      verifiedResult: {
        resultHash:
          "a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94",
      },
      transferResult: { outcome: "PASSED" },
      patchResult: { status: "VERIFIED" },
    });
    const events = await sessionRepository.listEvents(sessionId);
    expect(events).toHaveLength(12);
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
    ]);
    expect(
      events.filter((event) =>
        ["lab.compilation_started", "patch.compilation_started"].includes(
          event.kind,
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        kind: "lab.compilation_started",
        actor: "system",
        payload: { authority: "fixed-approved-sample" },
      }),
      expect.objectContaining({
        kind: "patch.compilation_started",
        actor: "system",
        payload: { authority: "fixed-approved-sample" },
      }),
    ]);
    expect(
      events.some(
        (event) => event.actor === "gpt-5.6" || event.actor === "codex",
      ),
    ).toBe(false);
    expect(
      events.find((event) => event.kind === "lab.verified")?.payload,
    ).toMatchObject({
      planHash: expect.stringMatching(/^[a-f0-9]{64}$/u),
      verifiedOperationSummary: {
        schemaVersion: "1",
        authority: "fixed-approved-sample",
        selectionRef: "whole-customer-holdout",
        operationIds: [
          "leakage.random_row_split",
          "leakage.group_holdout",
          "leakage.entity_overlap",
        ],
      },
    });
    expect(events.at(-1)?.previousEventHash).toBe(events.at(-2)?.eventHash);

    const refreshed = await app.request(route);
    expect(refreshed.status).toBe(200);
    await expect(refreshed.json()).resolves.toMatchObject({
      ok: true,
      data: {
        sessionId,
        state: "PATCH_VERIFIED",
        revision:
          "Hold out complete entities and remove identity shortcuts before claiming generalization.",
      },
    });

    const proof = await app.request(`${route}/proof-bundle`);
    expect(proof.status).toBe(409);
    await expect(proof.json()).resolves.toMatchObject({
      ok: false,
      error: { code: "PROOF_BUNDLE_NOT_READY" },
    });

    const serializedAuthority = JSON.stringify({ patchBody, session, events });
    for (const legacyHash of [
      "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0",
      "92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024",
      "eb20dc7e71431ad5b4a57437d740a1c8844cd335bf3a3d54db48e23dfbd3a034",
      "9304e07716d6b5fec99b16916c2393bc371744faf0e403fb25278cb537214598",
      "ed70072a62888e240e8b6e2fead54f3a08569e4186446aa5562540fa1745d786",
    ]) {
      expect(serializedAuthority).not.toContain(legacyHash);
    }
  });

  it("maps a lost D1 optimistic update to a typed conflict", async () => {
    const repository = new ConflictSessionRepository();
    const { app, sessionId } = await sessionHarness("sample", repository);
    const route = `/api/sessions/${sessionId}`;

    await postJson(app, `${route}/belief-test`, {
      learnerClaim: SAMPLE_LEAKAGE_QUESTION,
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
