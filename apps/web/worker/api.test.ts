// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { ArtifactManifest } from "@counterlab/contracts";
import type {
  CounterLabSession,
  EvidenceEvent,
  SessionRepository,
} from "@counterlab/session-core";

import { api, createApi } from "./api";
import type { ArtifactStore, StoredArtifact } from "./artifact-store";
import { ConcurrentD1SessionUpdateError } from "./d1-session-repository";

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

async function sessionHarness(
  mode: "instant" | "live",
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
  const sessionResponse = await app.request("/api/sessions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      artifactId: artifactBody.data.artifactId,
      mode,
    }),
  });
  const sessionBody = (await sessionResponse.json()) as {
    data: { sessionId: string };
  };
  return {
    app,
    sessionRepository,
    artifactId: artifactBody.data.artifactId,
    sessionId: sessionBody.data.sessionId,
  };
}

async function postJson(
  app: ReturnType<typeof createApi>,
  path: string,
  body: unknown = {},
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Cloudflare Worker API", () => {
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

  it("reports live analysis without exposing endpoint configuration", async () => {
    const response = await api.request("/api/health", undefined, {
      OPENAI_API_KEY: "server-only-key",
      OPENAI_BASE_URL: "https://responses.example.test/v1",
      OPENAI_MODEL: "configured-model",
    } as unknown as Env & Record<string, string>);

    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { liveGpt: "available" },
    });
    expect(JSON.stringify(body)).not.toContain("responses.example.test");
    expect(JSON.stringify(body)).not.toContain("configured-model");
  });

  it("retrieves stored artifact evidence without returning notebook bytes", async () => {
    const harness = await sessionHarness("instant");
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
      await sessionHarness("instant");

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
        mode: "instant",
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
      await sessionHarness("instant");
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
    const { app, sessionId } = await sessionHarness("instant", repository);
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
