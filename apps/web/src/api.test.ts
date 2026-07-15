import { describe, expect, it, vi } from "vitest";

import type { ArtifactManifest } from "@counterlab/contracts";

import { ApiClientError, CounterLabApiClient } from "./api";

const digest = (character: string) => character.repeat(64);

const artifact: ArtifactManifest = {
  artifactId: "artifact_1",
  fileName: "customer_churn_leakage.ipynb",
  fileSha256: digest("a"),
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-07-14T10:00:00.000Z",
};

const session = {
  sessionId: "session_1",
  artifactId: artifact.artifactId,
  mode: { kind: "sample_lesson", sampleId: "leakage-01" } as const,
  state: "INGESTED" as const,
  version: 1,
  createdAt: "2026-07-14T10:01:00.000Z",
  updatedAt: "2026-07-14T10:01:00.000Z",
};

const runnerJob = {
  schemaVersion: "1" as const,
  jobId: "job_1",
  kind: "LAB_RUN" as const,
  status: "QUEUED" as const,
  sessionId: session.sessionId,
  artifactId: artifact.artifactId,
  artifactManifestHash: digest("b"),
  conceptPack: { id: "entity_leakage" as const, version: "1.0.0" },
  inputHashes: [digest("c")],
  stateVersion: 8,
  jobVersion: 1,
  createdAt: "2026-07-14T10:02:00.000Z",
  updatedAt: "2026-07-14T10:02:00.000Z",
  attempt: 0,
  maxAttempts: 2,
  runnerIdentity: null,
  timeoutSeconds: 180,
  outputHashes: [],
  eventCursor: 0,
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CounterLabApiClient", () => {
  it("validates configured-but-unproven server capabilities", async () => {
    const health = {
      platform: "cloudflare-workers",
      sample: "available",
      replay: "available",
      liveGpt: "configured",
      liveCodex: "local-runner-required",
      liveKernel: "local-runner-required",
      sandbox: "local-runner-required",
      requestId: "request_1",
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: health }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getHealth()).resolves.toEqual(health);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/health",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("rejects health responses that claim configured means available", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: "available",
          liveCodex: "local-runner-required",
          liveKernel: "local-runner-required",
          sandbox: "local-runner-required",
          requestId: "request_1",
        },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getHealth()).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
    });
  });

  it("creates the sample artifact through the validated common envelope", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: artifact }, 201),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.createSampleArtifact()).resolves.toEqual(artifact);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith(
      "/api/artifacts",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sample: true }),
        headers: expect.objectContaining({
          accept: "application/json",
          "content-type": "application/json",
        }),
      }),
    );
  });

  it("uploads notebooks as multipart data without overriding the boundary", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: artifact }, 201),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });
    const file = new File(["{}"], "sample.ipynb", {
      type: "application/json",
    });

    await expect(client.uploadArtifact(file)).resolves.toEqual(artifact);
    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.body).toBeInstanceOf(FormData);
    expect(new Headers(request?.headers).has("content-type")).toBe(false);
  });

  it("creates mode-specific typed session views and retrieves a session", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: session }, 201))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            data: { ...session, mode: { kind: "live_notebook" } },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            data: {
              ...session,
              mode: { kind: "verified_replay", replayId: "leakage-01" },
            },
          },
          201,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: session }));
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.createSampleSession({ sampleId: "leakage-01" }),
    ).resolves.toEqual(session);
    await expect(
      client.createLiveSession({ artifactId: artifact.artifactId }),
    ).resolves.toMatchObject({ mode: { kind: "live_notebook" } });
    await expect(
      client.createReplaySession({ replayId: "leakage-01" }),
    ).resolves.toMatchObject({
      mode: { kind: "verified_replay", replayId: "leakage-01" },
    });
    await expect(client.getSession("session_1")).resolves.toEqual(session);

    expect(fetcher.mock.calls[0]).toEqual([
      "/api/sample/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ sampleId: "leakage-01" }),
      }),
    ]);
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/live/sessions");
    expect(fetcher.mock.calls[2]?.[0]).toBe("/api/replay/sessions");
    expect(fetcher.mock.calls[3]).toEqual([
      "/api/sessions/session_1",
      expect.objectContaining({ method: "GET" }),
    ]);
  });

  it("throws a typed API error and never substitutes fallback data", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          ok: false,
          error: {
            code: "LIVE_UNAVAILABLE",
            message: "OPENAI_API_KEY is not configured",
            status: 503,
          },
        },
        503,
      ),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    const error = await client
      .proposeBeliefTest("session_1", {
        learnerClaim:
          "The notebook accuracy proves generalization to new customers.",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiClientError);
    expect(error).toMatchObject({
      code: "LIVE_UNAVAILABLE",
      message: "OPENAI_API_KEY is not configured",
      status: 503,
      retryable: false,
    });
  });

  it("rejects malformed success data instead of returning unvalidated JSON", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: { ...artifact, fileSha256: "not-a-digest" },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.createSampleArtifact()).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      status: 200,
    });
  });

  it("accepts queued live lab and patch jobs without substituting sample outputs", async () => {
    const liveSession = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "LAB_VERIFIED" as const,
      version: 8,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({ ok: true, data: { ...liveSession, runnerJob } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: {
            ...liveSession,
            state: "TRANSFER_PASSED",
            version: 12,
            runnerJob: {
              ...runnerJob,
              jobId: "job_patch_1",
              kind: "PATCH_COMPILE",
              stateVersion: 12,
            },
          },
        }),
      );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.runLab(session.sessionId)).resolves.toMatchObject({
      mode: { kind: "live_notebook" },
      runnerJob: { kind: "LAB_RUN", status: "QUEUED" },
    });
    await expect(client.compilePatch(session.sessionId)).resolves.toMatchObject(
      {
        mode: { kind: "live_notebook" },
        runnerJob: { kind: "PATCH_COMPILE", status: "QUEUED" },
      },
    );
  });

  it("maps every learning-loop method to its encoded route without swallowing errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse(
        {
          ok: false,
          error: { code: "NOT_READY", message: "Not ready", status: 409 },
        },
        409,
      ),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });
    const sessionId = "session/with space";
    const encoded = "session%2Fwith%20space";
    const calls: Array<{
      expectedPath: string;
      expectedMethod: string;
      invoke: () => Promise<unknown>;
    }> = [
      {
        expectedPath: `/api/sessions/${encoded}/belief-test`,
        expectedMethod: "POST",
        invoke: () =>
          client.proposeBeliefTest(sessionId, {
            learnerClaim:
              "The notebook accuracy proves generalization to new customers.",
          }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/belief-test/confirm`,
        expectedMethod: "POST",
        invoke: () =>
          client.respondToBeliefTest(sessionId, { action: "confirm" }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/prediction`,
        expectedMethod: "POST",
        invoke: () =>
          client.commitPrediction(sessionId, {
            choice: "Accuracy stays high",
            confidence: 72,
          }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/lab/compile`,
        expectedMethod: "POST",
        invoke: () => client.compileLab(sessionId),
      },
      {
        expectedPath: `/api/sessions/${encoded}/lab/run`,
        expectedMethod: "POST",
        invoke: () => client.runLab(sessionId),
      },
      {
        expectedPath: `/api/sessions/${encoded}/lab/interactive`,
        expectedMethod: "POST",
        invoke: () =>
          client.runInteractiveLeakage(sessionId, {
            schemaVersion: "1",
            splitStrategy: "group",
            entityField: "account_key",
            identityAblation: true,
            testFraction: 0.25,
          }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/lab/interactive`,
        expectedMethod: "POST",
        invoke: () =>
          client.runInteractiveImbalance(sessionId, {
            schemaVersion: "1",
            concept: "class_imbalance",
            threshold: 0.25,
            prevalenceScenario: "rarer",
            metricFocus: "recall",
          }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/jobs/job%2Fone/result`,
        expectedMethod: "GET",
        invoke: () => client.getInteractiveResult(sessionId, "job/one"),
      },
      {
        expectedPath: `/api/sessions/${encoded}/revision`,
        expectedMethod: "POST",
        invoke: () =>
          client.recordRevision(sessionId, {
            revision:
              "Evaluation must hold out the entity boundary that the claim targets.",
          }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/transfer`,
        expectedMethod: "POST",
        invoke: () =>
          client.submitTransfer(sessionId, {
            strategyChoice: "time-ordered-split",
            riskChoice: "future-information",
            evidenceChoices: ["feature-created-after-forecast"],
          }),
      },
      {
        expectedPath: `/api/sessions/${encoded}/patch/compile`,
        expectedMethod: "POST",
        invoke: () => client.compilePatch(sessionId),
      },
      {
        expectedPath: `/api/sessions/${encoded}/events`,
        expectedMethod: "GET",
        invoke: () => client.getEvents(sessionId),
      },
      {
        expectedPath: `/api/sessions/${encoded}/jobs/job%2Fone/events?after=4`,
        expectedMethod: "GET",
        invoke: () => client.listRunnerEvents(sessionId, "job/one", 4),
      },
      {
        expectedPath: `/api/sessions/${encoded}/reasoning-diff`,
        expectedMethod: "GET",
        invoke: () => client.getReasoningDiff(sessionId),
      },
      {
        expectedPath: `/api/sessions/${encoded}/proof-bundle`,
        expectedMethod: "GET",
        invoke: () => client.getProofBundle(sessionId),
      },
      {
        expectedPath: "/api/replays/leakage-01",
        expectedMethod: "GET",
        invoke: () => client.getReplay("leakage-01"),
      },
    ];

    for (const call of calls) {
      fetcher.mockClear();
      await expect(call.invoke()).rejects.toMatchObject({ code: "NOT_READY" });
      expect(fetcher).toHaveBeenCalledWith(
        call.expectedPath,
        expect.objectContaining({ method: call.expectedMethod }),
      );
    }
  });

  it("rejects invalid compiler event cursors before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.listRunnerEvents("session_1", "job_1", -1),
    ).rejects.toMatchObject({ code: "INVALID_EVENT_CURSOR", status: 400 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an unbounded interactive configuration before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CounterLabApiClient({ fetch: fetcher });

    let caught: unknown;
    try {
      client.runInteractiveLeakage("session_1", {
        schemaVersion: "1",
        splitStrategy: "random",
        entityField: "account_key",
        identityAblation: false,
        testFraction: 0.8,
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({ code: "INVALID_REQUEST", status: 0 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects an invalid imbalance metric focus before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const client = new CounterLabApiClient({ fetch: fetcher });

    expect(() =>
      client.runInteractiveImbalance("session_1", {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.25,
        prevalenceScenario: "rarer",
        metricFocus: "accuracy" as "recall",
      }),
    ).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("builds a contained encoded patch download URL", () => {
    const client = new CounterLabApiClient({ baseUrl: "https://studio.test/" });

    expect(client.patchDownloadUrl("session/with space")).toBe(
      "https://studio.test/api/sessions/session%2Fwith%20space/patch/download",
    );
  });

  it("turns transport failures into typed retryable errors", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getReplay("leakage-01")).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
      retryable: true,
    });
  });
});
