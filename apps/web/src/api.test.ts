import { describe, expect, it, vi } from "vitest";

import {
  CANONICAL_JSON_PROFILE,
  migrateBeliefTestV1ToV2,
  type ArtifactManifest,
  type BeliefTest,
} from "@counterlab/contracts";

import { ApiClientError, CounterLabApiClient, SessionViewSchema } from "./api";

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

const beliefTest: BeliefTest = {
  schemaVersion: "1",
  id: "belief_1",
  concept: "entity_leakage",
  learnerClaim: "The score proves generalization.",
  currentHypothesis: {
    statement: "The model generalizes to unseen customers.",
    predictedOutcome: "Group-holdout accuracy remains high.",
  },
  competingHypothesis: {
    statement: "Repeated identities inflate the random split.",
    predictedOutcome: "Group-holdout accuracy falls.",
  },
  evidenceRefs: [],
  alternatives: [],
  decisiveIntervention: {
    id: "group-holdout",
    description: "Hold out complete customers.",
    controlledVariables: ["model", "seed"],
    changedVariables: ["split boundary"],
    discriminatesBecause: "The hypotheses predict different outcomes.",
  },
  uncertainty: {
    confidence: 0.25,
    limitations: ["The group result is not known yet."],
    insufficientEvidence: true,
  },
  requiresLearnerConfirmation: true,
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

const boundaryReceipt = {
  schemaVersion: "1" as const,
  canonicalProfile: CANONICAL_JSON_PROFILE,
  sessionId: session.sessionId,
  resultHash: digest("1"),
  verificationReportHash: digest("2"),
  experimentIrHash: digest("3"),
  authoritativeResultHash: digest("4"),
  evidenceVerdictHash: digest("5"),
  issuedAt: "2026-07-14T10:04:00.000Z",
  integrity: {
    mode: "integrity-hashed" as const,
    algorithm: "sha256" as const,
    contentHash: digest("6"),
  },
  receiptHash: digest("7"),
};

const boundaryAuthority = {
  jobId: "job_boundary_1",
  sweepId: "entity-recurrence-sweep",
  resultHash: boundaryReceipt.resultHash,
  verificationReportHash: boundaryReceipt.verificationReportHash,
  receipt: boundaryReceipt,
  cellCount: 4,
};

const reasoningDiffV2 = {
  schemaVersion: "2" as const,
  id: "reasoning_diff_v2",
  sessionId: session.sessionId,
  concept: "entity_leakage" as const,
  dimensions: {
    belief: {
      before: "Random rows prove reuse.",
      after: "Match the deployment unit.",
    },
    prediction: {
      before: "The score stays high.",
      after: "The held-out entity score fell.",
    },
    evidence: {
      before: "Rows were mixed.",
      after: "Whole entities were held out.",
    },
    boundary: {
      before: "No boundary was named.",
      after: "Recurrence changes the optimism gap.",
    },
    behavior: {
      before: "Use random rows.",
      after: "Use a time-ordered transfer split.",
    },
    code: {
      before: "train_test_split(rows)",
      after: "group_holdout(customer_id)",
    },
  },
  authority: {
    artifactManifestHash: digest("0"),
    beliefSpecHash: digest("1"),
    predictionHash: digest("2"),
    experimentIrHash: digest("3"),
    selectionHash: digest("4"),
    authoritativeResultHash: digest("5"),
    evidenceVerdictHash: digest("6"),
    epistemicReportHash: digest("7"),
    boundaryMapHash: digest("8"),
    boundaryReceiptHash: digest("9"),
    transferResultHash: digest("a"),
    patchPlanHash: digest("b"),
    patchResultHash: digest("c"),
    patchedArtifactHash: digest("d"),
  },
  evidenceEventHashes: [
    digest("0"),
    digest("1"),
    digest("2"),
    digest("3"),
    digest("4"),
    digest("5"),
    digest("6"),
    digest("7"),
  ],
  limitations: ["This result is bounded to the documented notebook pattern."],
  issuedAt: "2026-07-14T10:05:00.000Z",
};

const publicProofCapsule = {
  schemaVersion: "2" as const,
  capsuleId: "capsule_1",
  sessionId: session.sessionId,
  mode: "live_notebook" as const,
  replayId: null,
  mediaType: "application/vnd.counterlab.capsule+json" as const,
  canonicalProfile: CANONICAL_JSON_PROFILE,
  rootHash: digest("e"),
  bytesHash: digest("f"),
  byteLength: 4_096,
  reasoningDiffHash: digest("a"),
  eventChainHead: digest("b"),
  createdAt: "2026-07-14T10:06:00.000Z",
  integrity: {
    mode: "integrity-hashed" as const,
    algorithm: "sha256" as const,
  },
};

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("CounterLabApiClient", () => {
  it("accepts exactly one versioned belief authority in a session view", () => {
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);

    expect(SessionViewSchema.parse({ ...session, beliefTest })).toHaveProperty(
      "beliefTest.id",
      beliefTest.id,
    );
    expect(SessionViewSchema.parse({ ...session, beliefSpec })).toHaveProperty(
      "beliefSpec.id",
      beliefSpec.id,
    );
    expect(() =>
      SessionViewSchema.parse({ ...session, beliefTest, beliefSpec }),
    ).toThrow(/belief authority/i);
  });

  it("accepts Worker-owned v5 evidence authority in resumable session responses", async () => {
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    const evidenceVerdict = {
      schemaVersion: "1" as const,
      kind: "SUPPORTS" as const,
      hypothesisId: "competing" as const,
      scope: "unseen customers in the documented fixture",
      resultHash: digest("e"),
      irHash: digest("f"),
      technicalReportHash: digest("1"),
      verifierVersion: "epistemic-verifier-v1",
    };
    const v5Session = {
      ...session,
      state: "EXPERIMENT_COMPLETED" as const,
      version: 7,
      beliefSpec,
      evidenceVerdict,
      epistemicReportHash: digest("2"),
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: v5Session }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getSession(session.sessionId)).resolves.toMatchObject({
      beliefSpec: { id: beliefSpec.id },
      evidenceVerdict,
      epistemicReportHash: digest("2"),
    });
    expect(() =>
      SessionViewSchema.parse({
        ...session,
        beliefSpec,
        evidenceVerdict,
      }),
    ).toThrow(/report hash.*together/i);
    expect(() =>
      SessionViewSchema.parse({
        ...session,
        beliefTest,
        evidenceVerdict,
        epistemicReportHash: digest("2"),
      }),
    ).toThrow(/Belief Spec v2/i);
  });

  it("accepts only browser-safe native proof authority in a resumable session", () => {
    const nativeSession = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "PROOF_CAPSULE_ISSUED" as const,
      version: 18,
      boundaryMapAuthority: boundaryAuthority,
      reasoningDiffV2,
      proofCapsule: publicProofCapsule,
    };

    expect(SessionViewSchema.parse(nativeSession)).toMatchObject({
      boundaryMapAuthority: { resultHash: boundaryReceipt.resultHash },
      reasoningDiffV2: { schemaVersion: "2" },
      proofCapsule: { capsuleId: "capsule_1" },
    });
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        proofCapsule: {
          ...publicProofCapsule,
          objectKey: `proof-capsules/session_1/${publicProofCapsule.bytesHash}.counterlab`,
        },
      }),
    ).toThrow(/unrecognized key/i);
  });

  it("retrieves strict Boundary authority and both Reasoning Diff versions", async () => {
    const boundaryResult = {
      schemaVersion: "1" as const,
      canonicalProfile: CANONICAL_JSON_PROFILE,
      boundaryMapId: "boundary_1",
      sessionId: session.sessionId,
      concept: "entity_leakage" as const,
      conceptPackVersion: "2.0.0",
      artifactManifestHash: digest("0"),
      experimentIrHash: boundaryReceipt.experimentIrHash,
      authoritativeResultHash: boundaryReceipt.authoritativeResultHash,
      evidenceVerdictHash: boundaryReceipt.evidenceVerdictHash,
      sweepId: boundaryAuthority.sweepId,
      gridPresetId: "compact-test-grid",
      seed: 17,
      kernelVersion: "leakage-kernel-v2",
      axes: [
        {
          id: "test-fraction",
          label: "Test fraction",
          unit: "proportion",
          points: [
            { id: "test-20", value: 0.2, label: "20%" },
            { id: "test-30", value: 0.3, label: "30%" },
          ],
        },
        {
          id: "observations-per-customer",
          label: "Observations per customer",
          unit: "rows/customer",
          points: [
            { id: "rows-2", value: 2, label: "2" },
            { id: "rows-4", value: 4, label: "4" },
          ],
        },
      ],
      cells: [
        ["test-20", 0.2, "rows-2", 2, "little-gap", 0.08],
        ["test-20", 0.2, "rows-4", 4, "material-gap", 0.31],
        ["test-30", 0.3, "rows-2", 2, "little-gap", 0.1],
        ["test-30", 0.3, "rows-4", 4, "material-gap", 0.34],
      ].map(
        (
          [firstId, firstValue, secondId, secondValue, classificationId, gap],
          index,
        ) => ({
          cellId: `cell-${index + 1}`,
          concept: "entity_leakage" as const,
          coordinates: [
            {
              axisId: "test-fraction",
              pointId: firstId as string,
              value: firstValue as number,
            },
            {
              axisId: "observations-per-customer",
              pointId: secondId as string,
              value: secondValue as number,
            },
          ] as const,
          classificationId: classificationId as string,
          randomAccuracy: 0.94,
          groupAccuracy: 0.94 - (gap as number),
          optimismGap: gap as number,
          randomEntityOverlap: { count: 12, rate: 0.5 },
          groupEntityOverlap: { count: 0, rate: 0 },
          sampleSizes: { randomTest: 40, groupTest: 40 },
          fixtureViewHash: digest("8"),
          randomPipelineFingerprint: digest("9"),
          groupPipelineFingerprint: digest("a"),
        }),
      ),
      classifications: [
        {
          id: "little-gap",
          label: "Little gap",
          description: "The split choice changes little.",
        },
        {
          id: "material-gap",
          label: "Material gap",
          description: "Repeated identities inflate the row split.",
        },
      ],
      units: { accuracy: "proportion", optimism_gap: "proportion" },
      assumptions: ["The estimator and preprocessing remain fixed."],
      nonClaims: [
        "This map does not prove all grouped evaluations are better.",
      ],
      resultHash: boundaryReceipt.resultHash,
    };
    const boundaryReport = {
      schemaVersion: "1" as const,
      status: "VERIFIED" as const,
      verifierVersion: "boundary-map-verifier-v1" as const,
      resultHash: boundaryResult.resultHash,
      invariantCount: 1,
      invariants: [
        {
          name: "axis-order-resolved",
          passed: true,
          observed: ["test-fraction", "observations-per-customer"],
          expected: ["test-fraction", "observations-per-customer"],
        },
      ],
      reportHash: boundaryReceipt.verificationReportHash,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: {
            result: boundaryResult,
            report: boundaryReport,
            receipt: boundaryReceipt,
            authority: boundaryAuthority,
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: reasoningDiffV2 }));
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.getBoundary("session/with space"),
    ).resolves.toMatchObject({
      report: { status: "VERIFIED" },
      authority: { cellCount: 4 },
    });
    await expect(client.getReasoningDiff(session.sessionId)).resolves.toEqual(
      reasoningDiffV2,
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      "/api/sessions/session%2Fwith%20space/boundary",
    );
  });

  it("sends a locally validated v2 Belief Spec edit without a v1 shadow", async () => {
    const beliefSpec = migrateBeliefTestV1ToV2(beliefTest);
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: { ...session, beliefSpec } }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.respondToBeliefTest(session.sessionId, {
        action: "edit",
        beliefSpec,
      }),
    ).resolves.toMatchObject({ beliefSpec: { id: beliefSpec.id } });
    expect(fetcher).toHaveBeenCalledWith(
      `/api/sessions/${session.sessionId}/belief-test/confirm`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "edit", beliefSpec }),
      }),
    );
  });

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

  it("rejects incomplete or storage-bearing hosted replay payloads", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          schemaVersion: "2",
          replayId: "replay_1",
          replay: true,
          objectKey: "proof-capsules/private.counterlab",
        },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getReplay("replay_1")).rejects.toMatchObject({
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

  it("redelivers the identical interactive request once after an ambiguous runner dispatch", async () => {
    const liveSession = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "EXPERIMENT_COMPLETED" as const,
      version: 10,
    };
    const request = {
      schemaVersion: "1" as const,
      concept: "class_imbalance" as const,
      threshold: 0.2,
      prevalenceScenario: "rarer" as const,
      metricFocus: "recall" as const,
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: false,
            error: {
              code: "RUNNER_DISPATCH_FAILED",
              message:
                "The process runner did not acknowledge this job; retrying will redeliver the same job",
              status: 503,
              retryable: true,
            },
          },
          503,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: true,
            data: {
              ...liveSession,
              runnerJob: {
                ...runnerJob,
                status: "STARTING",
                jobVersion: 2,
                attempt: 1,
                runnerIdentity: "cloudflare-container-runner-v1",
              },
              selectedRunId: "interactive_abc",
              configurationHash: digest("d"),
            },
          },
          202,
        ),
      );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.runInteractiveImbalance(session.sessionId, request),
    ).resolves.toMatchObject({
      runnerJob: { jobId: runnerJob.jobId, status: "STARTING" },
      selectedRunId: "interactive_abc",
    });

    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0]).toEqual(fetcher.mock.calls[1]);
  });

  it("validates authoritative runner cancellation and its encoded route", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          ...session,
          mode: { kind: "live_notebook" },
          state: "LAB_REJECTED",
          version: 9,
          runnerJob: {
            ...runnerJob,
            status: "CANCELLED",
            jobVersion: 2,
            runnerIdentity: "counterlab-control-plane-cancel",
            completedAt: "2026-07-14T10:03:00.000Z",
            error: {
              code: "RUNNER_JOB_CANCELLED",
              message: "The learner cancelled this runner job.",
              retryable: true,
            },
          },
          reused: false,
          runnerAcknowledged: true,
        },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.cancelRunnerJob("session/with space", "job/with space"),
    ).resolves.toMatchObject({
      state: "LAB_REJECTED",
      runnerJob: { status: "CANCELLED" },
      runnerAcknowledged: true,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sessions/session%2Fwith%20space/jobs/job%2Fwith%20space/cancel",
      expect.objectContaining({ method: "POST" }),
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
        expectedPath: `/api/sessions/${encoded}/boundary/run`,
        expectedMethod: "POST",
        invoke: () => client.runBoundary(sessionId),
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
      {
        expectedPath: `/api/sessions/${encoded}/replays`,
        expectedMethod: "POST",
        invoke: () => client.publishReplay(sessionId),
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

  it("posts only the strict learner interaction contract", async () => {
    const receipt = {
      schemaVersion: "1" as const,
      eventId: "interaction_00000000000000000000000000000001",
      accepted: true as const,
      duplicate: false,
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: receipt }, 201),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.recordLearnerInteraction("session/1", {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000001",
        stage: "prediction",
        kind: "prediction.recorded",
        choice: "alternative_explanation",
        confidence: 72,
      }),
    ).resolves.toEqual(receipt);
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sessions/session%2F1/interactions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          schemaVersion: "1",
          eventId: "interaction_00000000000000000000000000000001",
          stage: "prediction",
          kind: "prediction.recorded",
          choice: "alternative_explanation",
          confidence: 72,
        }),
      }),
    );

    expect(() =>
      client.recordLearnerInteraction("session_1", {
        schemaVersion: "1",
        eventId: "interaction_00000000000000000000000000000002",
        stage: "apply",
        kind: "revision.recorded",
        authoringMode: "free_text",
        revision: "raw prose",
      } as never),
    ).toThrow();
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
    expect(client.proofCapsuleDownloadUrl("session/with space")).toBe(
      "https://studio.test/api/sessions/session%2Fwith%20space/proof-capsule",
    );
    expect(client.replayProofCapsuleDownloadUrl("replay/with space")).toBe(
      "https://studio.test/api/replays/replay%2Fwith%20space/proof-capsule",
    );
    expect(client.replayPatchedNotebookDownloadUrl("replay/with space")).toBe(
      "https://studio.test/api/replays/replay%2Fwith%20space/patched-notebook",
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
