import { describe, expect, it, vi } from "vitest";

import {
  CANONICAL_JSON_PROFILE,
  canonicalJsonV1,
  migrateBeliefTestV1ToV2,
  type ArtifactManifest,
  type BeliefTest,
  VerifiedResultSetSchema,
} from "@counterlab/contracts";

import { ApiClientError, CounterLabApiClient, SessionViewSchema } from "./api";
import {
  publicReplayFixture,
  replayFixture,
} from "./components/replay/ProofCapsuleReplayView.fixture";
import { createDefaultProofBoundSessionFixture } from "./test-fixtures/proofBundle";
import rawSampleResult from "../../../fixtures/public/leakage_verified_result.json";

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

const verifiedLabSceneView = {
  schemaVersion: "1" as const,
  scene: {
    schemaVersion: "2" as const,
    sceneId: "scene_live_leakage",
    sessionId: "session/with space",
    concept: "entity_leakage" as const,
    supportLabel: "VERIFIED_TEST" as const,
    title: "Test the familiar-row score on unseen customers",
    blocks: [
      {
        id: "verified_metric",
        type: "Metric" as const,
        label: "Unseen-customer accuracy",
        resultBinding: "/metrics/unseenAccuracy",
        unit: "percent",
      },
      {
        id: "proof_badge",
        type: "ProofBadge" as const,
        label: "Fixed result verified",
        proofBinding: "/resultHash",
      },
    ],
    assumptions: ["The model and preprocessing remain fixed."],
    limitations: ["This result is bounded to the supplied notebook."],
    provenance: {
      experimentIrHash: digest("3"),
      discriminationContractHash: digest("4"),
    },
  },
  verifiedSceneHash: digest("8"),
  signedResult: {
    schemaVersion: "1" as const,
    verificationStatus: "VERIFIED" as const,
    sceneHash: digest("8"),
    sceneId: "scene_live_leakage",
    sessionId: "session/with space",
    concept: "entity_leakage" as const,
    experimentIrHash: digest("3"),
    discriminationContractHash: digest("4"),
    resultHash: digest("9"),
    integrity: {
      mode: "integrity-hashed" as const,
      contentHash: digest("9"),
    },
    result: {
      resultHash: digest("9"),
      metrics: { unseenAccuracy: 0.594 },
    },
  },
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

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function proofBoundSession() {
  return createDefaultProofBoundSessionFixture();
}

async function canonicalHash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJsonV1(value));
  const digestBytes = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digestBytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function nativeProofSession() {
  const replay = replayFixture("entity_leakage");
  const evidenceVerdictHash = await canonicalHash(replay.evidenceVerdict);
  const {
    integrity: _receiptIntegrity,
    receiptHash: _receiptHash,
    ...storedReceiptContent
  } = replay.boundary.receipt;
  const receiptContent = {
    ...storedReceiptContent,
    evidenceVerdictHash,
  };
  const receiptIntegrity = {
    mode: "integrity-hashed" as const,
    algorithm: "sha256" as const,
    contentHash: await canonicalHash(receiptContent),
  };
  const receipt = {
    ...receiptContent,
    integrity: receiptIntegrity,
    receiptHash: await canonicalHash({
      ...receiptContent,
      integrity: receiptIntegrity,
    }),
  };
  const boundaryMapAuthority = {
    jobId: "job_boundary_live_1",
    sweepId: replay.boundary.result.sweepId,
    resultHash: replay.boundary.result.resultHash,
    verificationReportHash: replay.boundary.report.reportHash,
    receipt,
    cellCount: replay.boundary.result.cells.length,
  };
  const reasoningDiff = {
    ...replay.reasoningDiff,
    authority: {
      ...replay.reasoningDiff.authority,
      artifactManifestHash: replay.boundary.result.artifactManifestHash,
      beliefSpecHash: await canonicalHash(replay.beliefSpec),
      predictionHash: await canonicalHash(replay.prediction),
      experimentIrHash: replay.evidenceVerdict.irHash,
      authoritativeResultHash: replay.verifiedResult.resultHash,
      evidenceVerdictHash,
      boundaryMapHash: boundaryMapAuthority.resultHash,
      boundaryReceiptHash: boundaryMapAuthority.receipt.receiptHash,
      transferResultHash: replay.transferResult.resultHash,
      patchResultHash: replay.patchResult.resultHash,
      patchedArtifactHash: replay.patchResult.patchedArtifactHash,
    },
  };

  return {
    sessionId: replay.sourceSessionId,
    artifactId: replay.artifactManifest.artifactId,
    mode: { kind: "live_notebook" as const },
    state: "PROOF_CAPSULE_ISSUED" as const,
    version: 18,
    createdAt: "2026-07-16T12:40:00.000Z",
    updatedAt: "2026-07-16T13:00:00.000Z",
    beliefSpec: replay.beliefSpec,
    prediction: replay.prediction,
    verifiedResult: replay.verifiedResult,
    evidenceVerdict: replay.evidenceVerdict,
    epistemicReportHash: reasoningDiff.authority.epistemicReportHash,
    boundaryMapAuthority,
    transferResult: replay.transferResult,
    patchResult: replay.patchResult,
    revision: replay.revision.statement,
    reasoningDiffV2: reasoningDiff,
    proofCapsule: {
      ...replay.proofCapsule,
      reasoningDiffHash: await canonicalHash(reasoningDiff),
    },
  };
}

describe("CounterLabApiClient", () => {
  it("binds a Proof Bundle to its outer session authority", async () => {
    const valid = proofBoundSession();
    expect(SessionViewSchema.parse(valid)).toMatchObject({
      sessionId: session.sessionId,
      proofBundle: { bundleId: "bundle_1" },
    });

    expect(() =>
      SessionViewSchema.parse({
        ...valid,
        proofBundle: { ...valid.proofBundle, sessionId: "session_other" },
      }),
    ).toThrow(/different session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...valid,
        proofBundle: {
          ...valid.proofBundle,
          artifactManifest: {
            ...valid.proofBundle.artifactManifest,
            artifactId: "artifact_other",
          },
        },
      }),
    ).toThrow(/different artifact/i);
    expect(() =>
      SessionViewSchema.parse({
        ...valid,
        mode: { kind: "sample_lesson", sampleId: "sample_other" },
      }),
    ).toThrow(/selected lesson/i);
    expect(() =>
      SessionViewSchema.parse({ ...valid, state: "PATCH_VERIFIED" }),
    ).toThrow(/before Reasoning Diff/i);
    expect(() =>
      SessionViewSchema.parse({
        ...valid,
        prediction: { ...valid.prediction, immutableHash: digest("0") },
      }),
    ).toThrow(/prediction authority/i);
    expect(() =>
      SessionViewSchema.parse({
        ...valid,
        verifiedResult: {
          ...valid.verifiedResult,
          resultHash: digest("0"),
        },
      }),
    ).toThrow(/verifiedResult authority/i);

    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: { ...valid.proofBundle, sessionId: "session_other" },
      }),
    );
    await expect(
      new CounterLabApiClient({ fetch: fetcher }).getProofBundle(
        session.sessionId,
      ),
    ).rejects.toMatchObject({ code: "PROOF_BUNDLE_LINEAGE_INVALID" });
  });

  it("rejects a session result that has no immutable Prediction", async () => {
    const verifiedResult = VerifiedResultSetSchema.parse(rawSampleResult);
    const malformedSession = {
      ...session,
      state: "EXPERIMENT_COMPLETED" as const,
      verifiedResult,
    };

    expect(() => SessionViewSchema.parse(malformedSession)).toThrow(
      /requires an immutable Prediction/i,
    );

    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: malformedSession }),
    );
    await expect(
      new CounterLabApiClient({ fetch: fetcher }).getSession(session.sessionId),
    ).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      status: 200,
    });
  });

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
    const verifiedResult = VerifiedResultSetSchema.parse(rawSampleResult);
    const prediction = {
      schemaVersion: "1" as const,
      id: "prediction_1",
      sessionId: session.sessionId,
      beliefTestId: beliefSpec.id,
      choice: "Group-holdout accuracy falls.",
      confidence: 80,
      committedAt: "2026-07-14T10:02:00.000Z",
      immutableHash: digest("8"),
    };
    const evidenceVerdict = {
      schemaVersion: "1" as const,
      kind: "SUPPORTS" as const,
      hypothesisId: "competing" as const,
      scope: "unseen customers in the documented fixture",
      resultHash: verifiedResult.resultHash,
      irHash: digest("f"),
      technicalReportHash: digest("1"),
      verifierVersion: "epistemic-verifier-v1",
    };
    const v5Session = {
      ...session,
      state: "EXPERIMENT_COMPLETED" as const,
      version: 7,
      beliefSpec,
      prediction,
      verifiedResult,
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
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        evidenceVerdict: {
          ...evidenceVerdict,
          resultHash: digest("0"),
        },
      }),
    ).toThrow(/verdict result.*verified result/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        verifiedResult: undefined,
      }),
    ).toThrow(/supporting or inconclusive verdict requires a verified result/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        verifiedResult: undefined,
        evidenceVerdict: {
          schemaVersion: "1",
          kind: "REJECTED",
          findingIds: ["result_binding_mismatch"],
          resultReleased: false,
          irHash: digest("f"),
          technicalReportHash: digest("1"),
          verifierVersion: "epistemic-verifier-v1",
        },
      }),
    ).not.toThrow();
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        evidenceVerdict: {
          schemaVersion: "1",
          kind: "REJECTED",
          findingIds: ["result_binding_mismatch"],
          resultReleased: false,
          irHash: digest("f"),
          technicalReportHash: digest("1"),
          verifierVersion: "epistemic-verifier-v1",
        },
      }),
    ).toThrow(/rejected verdict cannot release a verified result/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        evidenceVerdict: undefined,
        epistemicReportHash: undefined,
      }),
    ).toThrow(/Belief Spec v2 result requires an evidence verdict/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        state: "PATCH_VERIFIED",
        patchResult: {
          ...proofBoundSession().patchResult,
          sessionId: v5Session.sessionId,
        },
        evidenceVerdict: undefined,
        epistemicReportHash: undefined,
      }),
    ).toThrow(/Belief Spec v2 repair requires a supporting evidence verdict/i);
  });

  it("accepts only browser-safe, cross-bound native proof authority", async () => {
    const completed = proofBoundSession();
    const nativeSession = await nativeProofSession();

    expect(SessionViewSchema.parse(nativeSession)).toMatchObject({
      boundaryMapAuthority: {
        resultHash: nativeSession.boundaryMapAuthority.resultHash,
      },
      reasoningDiffV2: { schemaVersion: "2" },
      proofCapsule: { capsuleId: nativeSession.proofCapsule.capsuleId },
    });
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        verifiedResult: completed.verifiedResult,
        evidenceVerdict: {
          ...nativeSession.evidenceVerdict,
          resultHash: completed.verifiedResult.resultHash,
        },
      }),
    ).toThrow(/native Proof Capsule requires a hosted v2 result/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        boundaryMapAuthority: {
          ...nativeSession.boundaryMapAuthority,
          receipt: {
            ...nativeSession.boundaryMapAuthority.receipt,
            authoritativeResultHash: digest("0"),
          },
        },
      }),
    ).toThrow(/native proof authority does not match the session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        proofCapsule: {
          ...nativeSession.proofCapsule,
          objectKey: `proof-capsules/session_1/${nativeSession.proofCapsule.bytesHash}.counterlab`,
        },
      }),
    ).toThrow(/unrecognized key/i);

    const validFetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: nativeSession }),
    );
    await expect(
      new CounterLabApiClient({ fetch: validFetcher }).getSession(
        nativeSession.sessionId,
      ),
    ).resolves.toMatchObject({
      proofCapsule: {
        reasoningDiffHash: nativeSession.proofCapsule.reasoningDiffHash,
      },
    });

    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          ...nativeSession,
          proofCapsule: {
            ...nativeSession.proofCapsule,
            reasoningDiffHash: digest("0"),
          },
        },
      }),
    );
    await expect(
      new CounterLabApiClient({ fetch: fetcher }).getSession(
        nativeSession.sessionId,
      ),
    ).rejects.toMatchObject({ code: "NATIVE_PROOF_LINEAGE_INVALID" });
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

  it("starts a source-bound fresh investigation and remembers its new owner capability", async () => {
    const restarted = {
      ...session,
      sessionId: "session_revision",
      state: "INGESTED" as const,
      version: 1,
      ownerCapability: `cl_owner_${"a".repeat(43)}`,
    };
    const storage = new Map<string, string>();
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: restarted }),
    );
    const client = new CounterLabApiClient({
      fetch: fetcher,
      capabilityStorage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => storage.delete(key),
      },
    });

    await expect(
      client.restartSession("session/source"),
    ).resolves.toMatchObject({
      sessionId: "session_revision",
      state: "INGESTED",
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/sessions/session%2Fsource/restart",
      expect.objectContaining({
        method: "POST",
        body: "{}",
        headers: expect.objectContaining({
          "idempotency-key": "counterlab.restart.v1",
        }),
      }),
    );
    expect(client.hasSessionAccess("session_revision")).toBe(true);
  });

  it("reuses the same restart key after a response is lost", async () => {
    const restarted = {
      ...session,
      sessionId: "session_revision",
      state: "INGESTED" as const,
      version: 1,
      ownerCapability: `cl_owner_${"b".repeat(43)}`,
    };
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("response lost");
      return jsonResponse({ ok: true, data: restarted });
    });
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.restartSession("session_source")).rejects.toMatchObject(
      { code: "NETWORK_ERROR", retryable: true },
    );
    await expect(
      client.restartSession("session_source"),
    ).resolves.toMatchObject({ sessionId: "session_revision" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const call of fetcher.mock.calls) {
      expect(call[1]).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({
            "idempotency-key": "counterlab.restart.v1",
          }),
        }),
      );
    }
  });

  it("validates configured-but-unproven server capabilities", async () => {
    const health = {
      platform: "cloudflare-workers",
      sample: "available",
      replay: "available",
      liveGpt: "configured",
      liveCodex: "local-runner-required",
      liveKernel: "local-runner-required",
      readiness: "not-checked",
      maintenance: false,
      release: {
        status: "bound",
        workerVersionId: "11111111-2222-3333-4444-555555555555",
        workerVersionTag: `git-${"a".repeat(40)}`,
        workerEvidenceCommit: "a".repeat(40),
        runnerSourceCommit: "b".repeat(40),
        runnerImageDigest: `sha256:${"c".repeat(64)}`,
        generationIsolationEvidenceSha256: "5".repeat(64),
        generationIsolationProbeSha256: "6".repeat(64),
        releaseCheckGenerationIsolationEvidenceSha256: "7".repeat(64),
        releaseCheckGenerationIsolationProbeSha256: "6".repeat(64),
        releaseCheckGenerationIsolationVerifiedAt:
          "2026-07-19T05:31:00.000+05:30",
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
      sandbox: "local-runner-required",
      generationFilesystemReadIsolation: "PARTIAL",
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

    await expect(client.getHealth({ probeReadiness: true })).resolves.toEqual(
      health,
    );
    expect(fetcher).toHaveBeenLastCalledWith(
      "/api/health?readiness=probe",
      expect.objectContaining({ method: "GET" }),
    );

    const mismatchedProbeClient = new CounterLabApiClient({
      fetch: vi.fn<typeof fetch>(async () =>
        jsonResponse({
          ok: true,
          data: {
            ...health,
            release: {
              ...health.release,
              releaseCheckGenerationIsolationProbeSha256: "8".repeat(64),
            },
          },
        }),
      ),
    });
    await expect(mismatchedProbeClient.getHealth()).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
    });
  });

  it("accepts an explicitly OS-enforced generation isolation claim", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: "configured",
          liveCodex: "configured",
          liveKernel: "configured",
          readiness: "ready",
          sandbox: "credential-and-privilege-boundary",
          generationFilesystemReadIsolation: "OS_ENFORCED",
          requestId: "request_isolated",
        },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getHealth()).resolves.toMatchObject({
      generationFilesystemReadIsolation: "OS_ENFORCED",
    });
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
          generationFilesystemReadIsolation: "PARTIAL",
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
    const headers = new Headers(request?.headers);
    expect(headers.has("content-type")).toBe(false);
    expect(headers.get("idempotency-key")).toMatch(
      /^upload_[0-9a-f-]{36}_[a-f0-9]{64}$/u,
    );
  });

  it("reuses the hash-bound upload key after an ambiguous network failure", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network unavailable"))
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: artifact }, 201));
    const client = new CounterLabApiClient({ fetch: fetcher });
    const file = new File(["{}"], "sample.ipynb", {
      type: "application/json",
    });

    await expect(client.uploadArtifact(file)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    await expect(client.uploadArtifact(file)).resolves.toEqual(artifact);
    const first = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
      "idempotency-key",
    );
    const second = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get(
      "idempotency-key",
    );
    expect(first).toMatch(/^upload_[0-9a-f-]{36}_[a-f0-9]{64}$/u);
    expect(second).toBe(first);
  });

  it("reuses a server-consumed upload key after an interrupted body", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse(
          {
            ok: false,
            error: {
              code: "REQUEST_BODY_INTERRUPTED",
              message: "The notebook body was interrupted",
              status: 400,
              retryable: true,
            },
          },
          400,
        ),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: artifact }, 201));
    const client = new CounterLabApiClient({ fetch: fetcher });
    const file = new File(["{}"], "sample.ipynb", {
      type: "application/json",
    });

    await expect(client.uploadArtifact(file)).rejects.toMatchObject({
      code: "REQUEST_BODY_INTERRUPTED",
    });
    await expect(client.uploadArtifact(file)).resolves.toEqual(artifact);
    const first = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
      "idempotency-key",
    );
    const second = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get(
      "idempotency-key",
    );
    expect(second).toBe(first);
  });

  it("coalesces concurrent calls for the same File into one upload", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: artifact }, 201),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });
    const file = new File(["{}"], "sample.ipynb", {
      type: "application/json",
    });

    await expect(
      Promise.all([client.uploadArtifact(file), client.uploadArtifact(file)]),
    ).resolves.toEqual([artifact, artifact]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const first = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
      "idempotency-key",
    );
    expect(first).toMatch(/^upload_[0-9a-f-]{36}_[a-f0-9]{64}$/u);
  });

  it("uses distinct operation keys for distinct File objects", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: artifact }, 201),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await client.uploadArtifact(
      new File(["{}"], "first.ipynb", { type: "application/json" }),
    );
    await client.uploadArtifact(
      new File(["{}"], "second.ipynb", { type: "application/json" }),
    );
    const first = new Headers(fetcher.mock.calls[0]?.[1]?.headers).get(
      "idempotency-key",
    );
    const second = new Headers(fetcher.mock.calls[1]?.[1]?.headers).get(
      "idempotency-key",
    );
    expect(second).not.toBe(first);
  });

  it("bounds a stalled capability request", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>(
        (_input, init) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      );
      const client = new CounterLabApiClient({
        fetch: fetcher,
        requestTimeoutMs: 25,
      });

      const assertion = expect(client.getHealth()).rejects.toMatchObject({
        code: "REQUEST_TIMEOUT",
        retryable: true,
      });
      await vi.advanceTimersByTimeAsync(25);
      await assertion;
      expect(fetcher.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
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

  it("recomputes the public replay content hash before returning evidence", async () => {
    const verified = publicReplayFixture("entity_leakage");
    const validFetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: verified }),
    );
    await expect(
      new CounterLabApiClient({ fetch: validFetcher }).getReplay(
        verified.replayId,
      ),
    ).resolves.toEqual(verified);

    const tampered = structuredClone(verified);
    tampered.test.result.runs[0]!.seed += 1;
    const tamperedFetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: tampered }),
    );
    await expect(
      new CounterLabApiClient({ fetch: tamperedFetcher }).getReplay(
        tampered.replayId,
      ),
    ).rejects.toMatchObject({
      code: "REPLAY_INTEGRITY_INVALID",
      status: 0,
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
    const [firstUrl, firstInit] = fetcher.mock.calls[0]!;
    const [secondUrl, secondInit] = fetcher.mock.calls[1]!;
    const { signal: firstSignal, ...firstRequest } = firstInit!;
    const { signal: secondSignal, ...secondRequest } = secondInit!;
    expect(secondUrl).toBe(firstUrl);
    expect(secondRequest).toEqual(firstRequest);
    expect(firstSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).toBeInstanceOf(AbortSignal);
    expect(secondSignal).not.toBe(firstSignal);
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
        expectedPath: `/api/sessions/${encoded}/lab-scene`,
        expectedMethod: "GET",
        invoke: () => client.getLabScene(sessionId),
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
            strategyChoice: "time_ordered_holdout",
            riskChoice: "centered_window_reads_future",
            evidenceChoices: ["center_true_uses_later_targets"],
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
      {
        expectedPath: `/api/sessions/${encoded}/replays/revoke`,
        expectedMethod: "POST",
        invoke: () => client.revokeReplay(sessionId),
      },
      {
        expectedPath: `/api/sessions/${encoded}/replays/status`,
        expectedMethod: "GET",
        invoke: () => client.getReplayPublicationStatus(sessionId),
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

  it("accepts only a fully bound verified Lab Scene response", async () => {
    const validFetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: verifiedLabSceneView }),
    );
    await expect(
      new CounterLabApiClient({ fetch: validFetcher }).getLabScene(
        "session/with space",
      ),
    ).resolves.toMatchObject({
      verifiedSceneHash: digest("8"),
      signedResult: { resultHash: digest("9") },
    });
    expect(validFetcher).toHaveBeenCalledWith(
      "/api/sessions/session%2Fwith%20space/lab-scene",
      expect.objectContaining({ method: "GET" }),
    );

    const forgedFetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          ...verifiedLabSceneView,
          signedResult: {
            ...verifiedLabSceneView.signedResult,
            integrity: {
              mode: "integrity-hashed",
              contentHash: digest("a"),
            },
          },
        },
      }),
    );
    await expect(
      new CounterLabApiClient({ fetch: forgedFetcher }).getLabScene(
        "session/with space",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      status: 200,
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message:
              "scene result integrity must bind the authoritative result",
          }),
        ]),
      },
    });
  });

  it("rejects an evidence response whose integrity receipt does not match its events", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          events: [],
          integrity: {
            schemaVersion: "1",
            status: "VERIFIED",
            eventChainHead: digest("a"),
            eventCount: 1,
          },
        },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getEvents("session_1")).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message: "evidence receipt count does not match returned events",
          }),
        ]),
      },
    });
  });

  it("rejects compiler history that disagrees with its recorded-stream receipt", async () => {
    const compilerEvent = {
      schemaVersion: "1",
      eventId: "compiler_event_1",
      jobId: "job_1",
      cursor: 1,
      at: "2026-07-14T10:02:00.000Z",
      kind: "job.started",
    } as const;
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        ok: true,
        data: {
          events: [],
          compilerEvents: [compilerEvent],
          compilerActivity: {
            schemaVersion: "1",
            status: "RECORDED",
            ordering: "job-created-at-job-id-then-cursor",
            jobCount: 1,
            eventCount: 2,
          },
        },
      }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getEvents("session_1")).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      details: {
        issues: expect.arrayContaining([
          expect.objectContaining({
            message:
              "compiler activity receipt count does not match returned events",
          }),
        ]),
      },
    });
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

  it("builds only contained encoded private-session download URLs", () => {
    const client = new CounterLabApiClient({ baseUrl: "https://studio.test/" });

    expect(client.patchDownloadUrl("session/with space")).toBe(
      "https://studio.test/api/sessions/session%2Fwith%20space/patch/download",
    );
    expect(client.proofCapsuleDownloadUrl("session/with space")).toBe(
      "https://studio.test/api/sessions/session%2Fwith%20space/proof-capsule",
    );
  });

  it("retrieves private downloads with the owner capability and validates their bytes", async () => {
    const sessionId = "session_download_test";
    const ownerCapability = `cl_owner_${"d".repeat(43)}`;
    const privateSession = {
      ...session,
      sessionId,
      mode: { kind: "live_notebook" as const },
    };
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path === "/api/sample/sessions") {
        return jsonResponse({
          ok: true,
          data: { ...privateSession, ownerCapability },
        });
      }
      if (path === `/api/sessions/${sessionId}/patch/download`) {
        return new Response("patched notebook bytes", {
          headers: {
            "content-type": "application/x-ipynb+json; charset=utf-8",
            "content-disposition":
              'attachment; filename="customer-model.counterlab-patched.ipynb"',
          },
        });
      }
      if (path === `/api/sessions/${sessionId}/proof-capsule`) {
        return new Response("proof capsule bytes", {
          headers: {
            "content-type": "application/vnd.counterlab.capsule+json",
            "content-disposition":
              'attachment; filename="counterlab-session_download_test.counterlab"',
          },
        });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const client = new CounterLabApiClient({ fetch: fetcher });
    await client.createSampleSession({ sampleId: "leakage-01" });

    const patch = await client.downloadPatch(sessionId);
    const capsule = await client.downloadProofCapsule(sessionId);

    expect(patch.fileName).toBe("customer-model.counterlab-patched.ipynb");
    await expect(patch.blob.text()).resolves.toBe("patched notebook bytes");
    expect(capsule.fileName).toBe(
      "counterlab-session_download_test.counterlab",
    );
    await expect(capsule.blob.text()).resolves.toBe("proof capsule bytes");
    for (const [path, init] of fetcher.mock.calls.slice(1)) {
      expect(String(path)).not.toContain(ownerCapability);
      const headers = new Headers(init?.headers);
      expect(headers.get("authorization")).toBe(`Bearer ${ownerCapability}`);
      expect(init?.credentials).toBe("same-origin");
    }
  });

  it("rejects failed, empty, and incorrectly typed download responses", async () => {
    const failedClient = new CounterLabApiClient({
      fetch: vi.fn(async () =>
        jsonResponse(
          {
            ok: false,
            error: {
              code: "PATCH_NOT_READY",
              message: "A verified patch is required before download",
              status: 409,
            },
          },
          409,
        ),
      ),
    });
    await expect(failedClient.downloadPatch("session_1")).rejects.toMatchObject(
      {
        code: "PATCH_NOT_READY",
        status: 409,
      },
    );

    const wrongTypeClient = new CounterLabApiClient({
      fetch: vi.fn(
        async () =>
          new Response("<html>not a notebook</html>", {
            headers: { "content-type": "text/html" },
          }),
      ),
    });
    await expect(
      wrongTypeClient.downloadPatch("session_1"),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    const emptyClient = new CounterLabApiClient({
      fetch: vi.fn(
        async () =>
          new Response("", {
            headers: { "content-type": "application/x-ipynb+json" },
          }),
      ),
    });
    await expect(emptyClient.downloadPatch("session_1")).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
    });

    const unsafeNameClient = new CounterLabApiClient({
      fetch: vi.fn(
        async () =>
          new Response("patched notebook bytes", {
            headers: {
              "content-type": "application/x-ipynb+json",
              "content-disposition": 'attachment; filename="report.exe"',
            },
          }),
      ),
    });
    await expect(unsafeNameClient.downloadPatch("session/1")).resolves.toEqual(
      expect.objectContaining({
        fileName: "counterlab-session-1.patched.ipynb",
      }),
    );

    const interruptedClient = new CounterLabApiClient({
      fetch: vi.fn(async () => {
        const response = new Response("partial notebook", {
          headers: { "content-type": "application/x-ipynb+json" },
        });
        vi.spyOn(response, "blob").mockRejectedValue(
          new TypeError("body stream interrupted"),
        );
        return response;
      }),
    });
    await expect(
      interruptedClient.downloadPatch("session_1"),
    ).rejects.toMatchObject({
      code: "INVALID_API_RESPONSE",
      retryable: true,
    });
  });

  it("keeps owner capabilities out of URLs and attaches them only to private requests", async () => {
    const sessionId = "session_capability_test";
    const sessionCapability = `cl_owner_${"a".repeat(43)}`;
    const artifactCapability = `cl_owner_${"b".repeat(43)}`;
    const privateSession = {
      ...session,
      sessionId,
      mode: { kind: "live_notebook" as const },
    };
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      const path = String(input);
      if (path === "/api/sample/sessions") {
        return jsonResponse({
          ok: true,
          data: {
            ...privateSession,
            ownerCapability: sessionCapability,
          },
        });
      }
      if (path === "/api/artifacts") {
        return jsonResponse({
          ok: true,
          data: { ...artifact, ownerCapability: artifactCapability },
        });
      }
      if (path === "/api/live/sessions") {
        expect(JSON.parse(String(init?.body))).toEqual({
          artifactId: artifact.artifactId,
          artifactCapability,
        });
        return jsonResponse({
          ok: true,
          data: {
            ...privateSession,
            ownerCapability: sessionCapability,
          },
        });
      }
      if (path === `/api/sessions/${sessionId}/replays/revoke`) {
        return jsonResponse({
          ok: true,
          data: {
            replayId: "replay_capability_test",
            revoked: true,
            alreadyRevoked: false,
          },
        });
      }
      if (path === `/api/sessions/${sessionId}/replays/status`) {
        return jsonResponse({
          ok: true,
          data: { status: "never_published" },
        });
      }
      if (path === `/api/sessions/${sessionId}/access/revoke`) {
        return jsonResponse({ ok: true, data: { revoked: true } });
      }
      return jsonResponse({ ok: true, data: privateSession });
    });
    const storedCapabilities = new Map<string, string>();
    const client = new CounterLabApiClient({
      fetch: fetcher,
      capabilityStorage: {
        getItem: (key) => storedCapabilities.get(key) ?? null,
        setItem: (key, value) => storedCapabilities.set(key, value),
        removeItem: (key) => void storedCapabilities.delete(key),
      },
    });

    await client.createSampleSession({ sampleId: "leakage-01" });
    await client.getSession(sessionId);
    const privateRequest = fetcher.mock.calls.find(
      ([path]) => String(path) === `/api/sessions/${sessionId}`,
    );
    expect(new Headers(privateRequest?.[1]?.headers).get("authorization")).toBe(
      `Bearer ${sessionCapability}`,
    );
    expect(String(privateRequest?.[0])).not.toContain(sessionCapability);
    expect(
      storedCapabilities.get(`counterlab.ownerCapability.${sessionId}`),
    ).toBe(sessionCapability);

    await expect(client.revokeReplay(sessionId)).resolves.toEqual({
      replayId: "replay_capability_test",
      revoked: true,
      alreadyRevoked: false,
    });
    const revokeRequest = fetcher.mock.calls.find(
      ([path]) => String(path) === `/api/sessions/${sessionId}/replays/revoke`,
    );
    expect(new Headers(revokeRequest?.[1]?.headers).get("authorization")).toBe(
      `Bearer ${sessionCapability}`,
    );
    await expect(client.getReplayPublicationStatus(sessionId)).resolves.toEqual(
      { status: "never_published" },
    );
    const replayStatusRequest = fetcher.mock.calls.find(
      ([path]) => String(path) === `/api/sessions/${sessionId}/replays/status`,
    );
    expect(
      new Headers(replayStatusRequest?.[1]?.headers).get("authorization"),
    ).toBe(`Bearer ${sessionCapability}`);

    await expect(client.revokeSessionAccess(sessionId)).resolves.toEqual({
      revoked: true,
    });
    const accessRevocation = fetcher.mock.calls.find(
      ([path]) => String(path) === `/api/sessions/${sessionId}/access/revoke`,
    );
    expect(
      new Headers(accessRevocation?.[1]?.headers).get("authorization"),
    ).toBe(`Bearer ${sessionCapability}`);
    expect(client.hasSessionAccess(sessionId)).toBe(false);
    expect(
      storedCapabilities.has(`counterlab.ownerCapability.${sessionId}`),
    ).toBe(false);

    await client.uploadArtifact(
      new File(["{}"], "private.ipynb", { type: "application/json" }),
    );
    await client.createLiveSession({ artifactId: artifact.artifactId });
    expect(
      fetcher.mock.calls.some(([path]) => String(path).includes("cl_owner_")),
    ).toBe(false);
  });

  it("clears a stale owner key after an idempotent revocation retry succeeds", async () => {
    const sessionId = "session_lost_revocation_response";
    const ownerCapability = `cl_owner_${"c".repeat(43)}`;
    let revocationAttempts = 0;
    const fetcher = vi.fn<typeof fetch>(async (input) => {
      const path = String(input);
      if (path === "/api/sample/sessions") {
        return jsonResponse({
          ok: true,
          data: { ...session, sessionId, ownerCapability },
        });
      }
      if (path === `/api/sessions/${sessionId}/access/revoke`) {
        revocationAttempts += 1;
        if (revocationAttempts === 1) throw new TypeError("response lost");
        return jsonResponse({ ok: true, data: { revoked: false } });
      }
      throw new Error(`Unexpected request: ${path}`);
    });
    const storedCapabilities = new Map<string, string>();
    const client = new CounterLabApiClient({
      fetch: fetcher,
      capabilityStorage: {
        getItem: (key) => storedCapabilities.get(key) ?? null,
        setItem: (key, value) => storedCapabilities.set(key, value),
        removeItem: (key) => void storedCapabilities.delete(key),
      },
    });
    await client.createSampleSession({ sampleId: "leakage-01" });

    await expect(client.revokeSessionAccess(sessionId)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
    expect(client.hasSessionAccess(sessionId)).toBe(true);

    await expect(client.revokeSessionAccess(sessionId)).resolves.toEqual({
      revoked: false,
    });
    expect(client.hasSessionAccess(sessionId)).toBe(false);
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
