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
  mode: "instant" as const,
  state: "INGESTED" as const,
  version: 1,
  createdAt: "2026-07-14T10:01:00.000Z",
  updatedAt: "2026-07-14T10:01:00.000Z",
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CounterLabApiClient", () => {
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

  it("creates and retrieves typed session views", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: session }, 201))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: session }));
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.createSession({
        artifactId: artifact.artifactId,
        mode: "instant",
      }),
    ).resolves.toEqual(session);
    await expect(client.getSession("session_1")).resolves.toEqual(session);

    expect(fetcher.mock.calls[0]).toEqual([
      "/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          artifactId: artifact.artifactId,
          mode: "instant",
        }),
      }),
    ]);
    expect(fetcher.mock.calls[1]).toEqual([
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
