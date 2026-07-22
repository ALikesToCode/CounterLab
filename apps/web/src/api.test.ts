import { describe, expect, it, vi } from "vitest";

import {
  CANONICAL_JSON_PROFILE,
  canonicalJsonV1,
  migrateBeliefTestV1ToV2,
  type ArtifactManifest,
  type BeliefTest,
  type RunnerJob,
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
  requestFingerprint: digest("d"),
  requestIdentity: {
    schemaVersion: "1" as const,
    sessionId: session.sessionId,
    mode: "live_notebook" as const,
    purpose: "LAB_RUN_AUTHORITATIVE" as const,
    artifactId: artifact.artifactId,
    artifactManifestHash: digest("b"),
    conceptPack: { id: "entity_leakage" as const, version: "1.0.0" },
    authorityProfileHash: digest("e"),
    authorityInputHashes: { artifactManifest: digest("b") },
  },
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
  const { immutableHash: _immutableHash, ...predictionContent } =
    replay.prediction;
  const prediction = {
    ...predictionContent,
    immutableHash: await canonicalHash(predictionContent),
  };
  const { resultHash: _verifiedResultHash, ...verifiedResultContent } =
    replay.verifiedResult;
  const verifiedResult = {
    ...verifiedResultContent,
    resultHash: await canonicalHash(verifiedResultContent),
  };
  const evidenceVerdict = {
    ...replay.evidenceVerdict,
    resultHash: verifiedResult.resultHash,
  };
  const evidenceVerdictHash = await canonicalHash(evidenceVerdict);
  const { resultHash: _transferResultHash, ...transferResultContent } =
    replay.transferResult;
  const transferResult = {
    ...transferResultContent,
    resultHash: await canonicalHash(transferResultContent),
  };
  const patchWithContentHash = {
    ...replay.patchResult,
    patchHash: await canonicalHash(replay.patchResult.diff),
  };
  const { resultHash: _patchResultHash, ...patchResultContent } =
    patchWithContentHash;
  const patchResult = {
    ...patchResultContent,
    resultHash: await canonicalHash(patchResultContent),
  };
  const {
    integrity: _receiptIntegrity,
    receiptHash: _receiptHash,
    ...storedReceiptContent
  } = replay.boundary.receipt;
  const receiptContent = {
    ...storedReceiptContent,
    evidenceVerdictHash,
    authoritativeResultHash: verifiedResult.resultHash,
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
      predictionHash: prediction.immutableHash,
      experimentIrHash: replay.evidenceVerdict.irHash,
      authoritativeResultHash: verifiedResult.resultHash,
      evidenceVerdictHash,
      boundaryMapHash: boundaryMapAuthority.resultHash,
      boundaryReceiptHash: boundaryMapAuthority.receipt.receiptHash,
      transferResultHash: transferResult.resultHash,
      patchResultHash: patchResult.resultHash,
      patchedArtifactHash: patchResult.patchedArtifactHash,
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
    prediction,
    verifiedResult,
    evidenceVerdict,
    epistemicReportHash: reasoningDiff.authority.epistemicReportHash,
    boundaryMapAuthority,
    transferResult,
    patchResult,
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
    expect(() =>
      SessionViewSchema.parse({
        ...valid,
        reasoningDiff: {
          ...valid.reasoningDiff,
          sessionId: "session_other",
        },
      }),
    ).toThrow(/legacy Reasoning Diff belongs to a different session/i);

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

  it("requires every immutable Prediction to retain its belief authority", async () => {
    const nativeSession = await nativeProofSession();

    expect(() =>
      SessionViewSchema.parse({
        ...session,
        state: "PREDICTION_COMMITTED",
        prediction: {
          ...nativeSession.prediction,
          sessionId: session.sessionId,
        },
      }),
    ).toThrow(/Prediction requires belief authority/i);
  });

  it("accepts Worker-owned v5 evidence authority in resumable session responses", async () => {
    const nativeSession = await nativeProofSession();
    const beliefSpec = nativeSession.beliefSpec;
    const verifiedResult = nativeSession.verifiedResult;
    const prediction = nativeSession.prediction;
    const evidenceVerdict = nativeSession.evidenceVerdict;
    const v5Session = {
      sessionId: nativeSession.sessionId,
      artifactId: nativeSession.artifactId,
      mode: nativeSession.mode,
      state: "EXPERIMENT_COMPLETED" as const,
      version: 7,
      createdAt: nativeSession.createdAt,
      updatedAt: nativeSession.updatedAt,
      beliefSpec,
      prediction,
      verifiedResult,
      evidenceVerdict,
      epistemicReportHash: nativeSession.epistemicReportHash,
    };
    const fetcher = vi.fn<typeof fetch>(async () =>
      jsonResponse({ ok: true, data: v5Session }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(client.getSession(v5Session.sessionId)).resolves.toMatchObject(
      {
        beliefSpec: { id: beliefSpec.id },
        evidenceVerdict,
        epistemicReportHash: nativeSession.epistemicReportHash,
      },
    );
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
        patchResult: nativeSession.patchResult,
        evidenceVerdict: undefined,
        epistemicReportHash: undefined,
      }),
    ).toThrow(/Belief Spec v2 repair requires a supporting evidence verdict/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        beliefSpec: { ...beliefSpec, learnerDecision: "UNDECIDED" },
      }),
    ).toThrow(/learner-confirmed/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        beliefSpec: { ...beliefSpec, supportState: "PARTIAL" },
      }),
    ).toThrow(/supported Belief Spec/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        state: "INGESTED",
        beliefSpec: { ...beliefSpec, learnerDecision: "UNDECIDED" },
      }),
    ).toThrow(/learner-confirmed/i);
    const legacyResult = VerifiedResultSetSchema.parse(rawSampleResult);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        verifiedResult: legacyResult,
        evidenceVerdict: {
          ...evidenceVerdict,
          resultHash: legacyResult.resultHash,
        },
      }),
    ).toThrow(/hosted v2 result/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        prediction: { ...prediction, sessionId: "session_other" },
      }),
    ).toThrow(/Prediction.*session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        prediction: { ...prediction, beliefTestId: "belief_other" },
      }),
    ).toThrow(/Prediction.*Belief Spec/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        verifiedResult: { ...verifiedResult, sessionId: "session_other" },
      }),
    ).toThrow(/result session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        transferResult: {
          ...nativeSession.transferResult,
          sessionId: "session_other",
        },
      }),
    ).toThrow(/transfer result belongs to a different session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        patchResult: {
          ...nativeSession.patchResult,
          sessionId: "session_other",
        },
      }),
    ).toThrow(/patch result belongs to a different session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        state: "PATCH_VERIFIED",
        transferResult: undefined,
        reasoningDiffV2: undefined,
        proofCapsule: undefined,
      }),
    ).toThrow(/verified patch requires passed transfer/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        state: "PATCH_VERIFIED",
        transferResult: {
          ...nativeSession.transferResult,
          outcome: "FAILED",
          checks: nativeSession.transferResult.checks.map((check) => ({
            ...check,
            passed: false,
          })),
        },
        reasoningDiffV2: undefined,
        proofCapsule: undefined,
      }),
    ).toThrow(/verified patch requires passed transfer/i);
    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        boundaryMapAuthority: {
          ...nativeSession.boundaryMapAuthority,
          receipt: {
            ...nativeSession.boundaryMapAuthority.receipt,
            sessionId: "session_other",
          },
        },
      }),
    ).toThrow(/Boundary receipt belongs to a different session/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        verifiedResult: {
          ...replayFixture("class_imbalance").verifiedResult,
          sessionId: v5Session.sessionId,
        },
      }),
    ).toThrow(/result concept/i);
    expect(() =>
      SessionViewSchema.parse({
        ...v5Session,
        beliefSpec: undefined,
        evidenceVerdict: undefined,
        epistemicReportHash: undefined,
      }),
    ).toThrow(/verified result requires belief authority/i);

    const preCapsuleReasoningDiff = {
      ...nativeSession,
      state: "REASONING_DIFF_ISSUED" as const,
      proofCapsule: undefined,
    };
    expect(() => SessionViewSchema.parse(preCapsuleReasoningDiff)).toThrow(
      /Reasoning Diff.*Proof Capsule/i,
    );

    expect(() =>
      SessionViewSchema.parse({
        ...nativeSession,
        state: "BOUNDARY_VERIFIED",
        transferResult: undefined,
        patchResult: undefined,
        reasoningDiffV2: undefined,
        proofCapsule: undefined,
        boundaryMapAuthority: {
          ...nativeSession.boundaryMapAuthority,
          receipt: {
            ...nativeSession.boundaryMapAuthority.receipt,
            authoritativeResultHash: digest("0"),
          },
        },
      }),
    ).toThrow(/Boundary receipt does not match the verified result/i);

    const legacySession = {
      ...v5Session,
      beliefSpec: undefined,
      beliefTest: { ...beliefTest, id: beliefSpec.id },
      evidenceVerdict: undefined,
      epistemicReportHash: undefined,
    };
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: legacySession }),
        ),
      }).getSession(legacySession.sessionId),
    ).resolves.toMatchObject({
      beliefTest: { id: beliefSpec.id },
      verifiedResult: { schemaVersion: "2" },
    });
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

    const authorityMutations = [
      (candidate: typeof nativeSession) => {
        candidate.verifiedResult.planId += "_tampered";
      },
      (candidate: typeof nativeSession) => {
        candidate.prediction.confidence -= 1;
      },
      (candidate: typeof nativeSession) => {
        candidate.transferResult.selectedStrategy = "random_row_holdout";
      },
      (candidate: typeof nativeSession) => {
        candidate.patchResult.diff += "\n+ unverified change";
      },
      (candidate: typeof nativeSession) => {
        candidate.boundaryMapAuthority.receipt.issuedAt =
          "2026-07-14T10:04:01.000Z";
      },
    ];
    for (const mutate of authorityMutations) {
      const candidate = structuredClone(nativeSession);
      mutate(candidate);
      const tamperedFetcher = vi.fn<typeof fetch>(async () =>
        jsonResponse({ ok: true, data: candidate }),
      );
      await expect(
        new CounterLabApiClient({ fetch: tamperedFetcher }).getSession(
          candidate.sessionId,
        ),
      ).rejects.toMatchObject({ code: "SESSION_AUTHORITY_HASH_INVALID" });
    }

    const preCapsuleReasoning = {
      ...structuredClone(nativeSession),
      state: "REASONING_DIFF_ISSUED" as const,
      proofCapsule: undefined,
    };
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: preCapsuleReasoning }),
        ),
      }).getSession(preCapsuleReasoning.sessionId),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    const boundaryOnly = {
      ...structuredClone(nativeSession),
      state: "BOUNDARY_VERIFIED" as const,
      transferResult: undefined,
      patchResult: undefined,
      reasoningDiffV2: undefined,
      proofCapsule: undefined,
    };
    boundaryOnly.evidenceVerdict.technicalReportHash = digest("0");
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: boundaryOnly }),
        ),
      }).getSession(boundaryOnly.sessionId),
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
    const { resultHash: _boundaryResultHash, ...boundaryResultContent } =
      boundaryResult;
    boundaryResult.resultHash = await canonicalHash(boundaryResultContent);
    boundaryReport.resultHash = boundaryResult.resultHash;
    const { reportHash: _boundaryReportHash, ...boundaryReportContent } =
      boundaryReport;
    boundaryReport.reportHash = await canonicalHash(boundaryReportContent);
    const {
      integrity: _boundaryReceiptIntegrity,
      receiptHash: _boundaryReceiptHash,
      ...boundaryReceiptBase
    } = boundaryReceipt;
    const boundaryReceiptContent = {
      ...boundaryReceiptBase,
      resultHash: boundaryResult.resultHash,
      verificationReportHash: boundaryReport.reportHash,
    };
    const boundaryReceiptIntegrity = {
      mode: "integrity-hashed" as const,
      algorithm: "sha256" as const,
      contentHash: await canonicalHash(boundaryReceiptContent),
    };
    const canonicalBoundaryReceipt = {
      ...boundaryReceiptContent,
      integrity: boundaryReceiptIntegrity,
      receiptHash: await canonicalHash({
        ...boundaryReceiptContent,
        integrity: boundaryReceiptIntegrity,
      }),
    };
    const canonicalBoundaryAuthority = {
      ...boundaryAuthority,
      resultHash: boundaryResult.resultHash,
      verificationReportHash: boundaryReport.reportHash,
      receipt: canonicalBoundaryReceipt,
    };
    const boundaryPayload = {
      result: boundaryResult,
      report: boundaryReport,
      receipt: canonicalBoundaryReceipt,
      authority: canonicalBoundaryAuthority,
    };
    const rehashBoundaryPayload = async (
      candidate: typeof boundaryPayload,
    ): Promise<void> => {
      const { resultHash: _resultHash, ...resultContent } = candidate.result;
      candidate.result.resultHash = await canonicalHash(resultContent);
      candidate.report.resultHash = candidate.result.resultHash;
      const { reportHash: _reportHash, ...reportContent } = candidate.report;
      candidate.report.reportHash = await canonicalHash(reportContent);
      const {
        integrity: _integrity,
        receiptHash: _receiptHash,
        ...receiptContent
      } = candidate.receipt;
      receiptContent.resultHash = candidate.result.resultHash;
      receiptContent.verificationReportHash = candidate.report.reportHash;
      const integrity = {
        ...candidate.receipt.integrity,
        contentHash: await canonicalHash(receiptContent),
      };
      candidate.receipt = {
        ...receiptContent,
        integrity,
        receiptHash: await canonicalHash({ ...receiptContent, integrity }),
      };
      candidate.authority = {
        ...candidate.authority,
        resultHash: candidate.result.resultHash,
        verificationReportHash: candidate.report.reportHash,
        receipt: candidate.receipt,
      };
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: boundaryPayload,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true, data: reasoningDiffV2 }));
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.getBoundary(session.sessionId, canonicalBoundaryAuthority),
    ).resolves.toMatchObject({
      report: { status: "VERIFIED" },
      authority: { cellCount: 4 },
    });
    await expect(
      client.getReasoningDiff(session.sessionId, reasoningDiffV2),
    ).resolves.toEqual(reasoningDiffV2);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      `/api/sessions/${session.sessionId}/boundary`,
    );

    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: boundaryPayload }),
        ),
      }).getBoundary("session_other", canonicalBoundaryAuthority),
    ).rejects.toMatchObject({ code: "BOUNDARY_AUTHORITY_LINEAGE_INVALID" });

    const coherentStaleBoundary = structuredClone(boundaryPayload);
    coherentStaleBoundary.result.assumptions.push(
      "A stale but internally consistent assumption.",
    );
    await rehashBoundaryPayload(coherentStaleBoundary);
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: coherentStaleBoundary }),
        ),
      }).getBoundary(session.sessionId, canonicalBoundaryAuthority),
    ).rejects.toMatchObject({ code: "BOUNDARY_AUTHORITY_LINEAGE_INVALID" });

    const rejectedBoundary = structuredClone({
      ...boundaryPayload,
      report: {
        ...boundaryPayload.report,
        status: "REJECTED" as const,
        invariants: boundaryPayload.report.invariants.map(
          (invariant, index) => ({
            ...invariant,
            passed: index === 0 ? false : invariant.passed,
          }),
        ),
      },
    });
    const { reportHash: _rejectedReportHash, ...rejectedReportContent } =
      rejectedBoundary.report;
    rejectedBoundary.report.reportHash = await canonicalHash(
      rejectedReportContent,
    );
    const {
      integrity: _rejectedReceiptIntegrity,
      receiptHash: _rejectedReceiptHash,
      ...rejectedReceiptContent
    } = rejectedBoundary.receipt;
    rejectedReceiptContent.verificationReportHash =
      rejectedBoundary.report.reportHash;
    const rejectedReceiptIntegrity = {
      ...rejectedBoundary.receipt.integrity,
      contentHash: await canonicalHash(rejectedReceiptContent),
    };
    rejectedBoundary.receipt = {
      ...rejectedReceiptContent,
      integrity: rejectedReceiptIntegrity,
      receiptHash: await canonicalHash({
        ...rejectedReceiptContent,
        integrity: rejectedReceiptIntegrity,
      }),
    };
    rejectedBoundary.authority = {
      ...rejectedBoundary.authority,
      verificationReportHash: rejectedBoundary.report.reportHash,
      receipt: rejectedBoundary.receipt,
    };
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: rejectedBoundary }),
        ),
      }).getBoundary(session.sessionId, canonicalBoundaryAuthority),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    const foreignLineage = structuredClone(boundaryPayload);
    foreignLineage.receipt.authoritativeResultHash = digest("f");
    foreignLineage.authority.receipt.authoritativeResultHash = digest("f");
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: foreignLineage }),
        ),
      }).getBoundary(session.sessionId, canonicalBoundaryAuthority),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    const boundaryMutations = [
      (candidate: typeof boundaryPayload) => {
        candidate.result.assumptions.push("Unverified assumption.");
      },
      (candidate: typeof boundaryPayload) => {
        candidate.report.invariants[0]!.observed[0] = "tampered";
      },
      (candidate: typeof boundaryPayload) => {
        candidate.receipt.issuedAt = "2026-07-14T10:04:01.000Z";
        candidate.authority.receipt.issuedAt = "2026-07-14T10:04:01.000Z";
      },
    ];
    for (const mutate of boundaryMutations) {
      const candidate = structuredClone(boundaryPayload);
      mutate(candidate);
      const tamperedFetcher = vi.fn<typeof fetch>(async () =>
        jsonResponse({ ok: true, data: candidate }),
      );
      await expect(
        new CounterLabApiClient({ fetch: tamperedFetcher }).getBoundary(
          session.sessionId,
          canonicalBoundaryAuthority,
        ),
      ).rejects.toMatchObject({ code: "BOUNDARY_AUTHORITY_HASH_INVALID" });
    }

    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: { ...reasoningDiffV2, sessionId: "session_other" },
          }),
        ),
      }).getReasoningDiff(session.sessionId, reasoningDiffV2),
    ).rejects.toMatchObject({ code: "REASONING_DIFF_LINEAGE_INVALID" });

    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: {
              ...reasoningDiffV2,
              authority: {
                ...reasoningDiffV2.authority,
                authoritativeResultHash: digest("f"),
              },
            },
          }),
        ),
      }).getReasoningDiff(session.sessionId, reasoningDiffV2),
    ).rejects.toMatchObject({ code: "REASONING_DIFF_LINEAGE_INVALID" });
  });

  it("binds interactive results to their queued request and canonical result", async () => {
    const nativeSession = await nativeProofSession();
    const selectedRunId = nativeSession.verifiedResult.runs[0]!.id;
    const expected = {
      selectedRunId,
      configurationHash: digest("d"),
    };
    const payload = {
      result: nativeSession.verifiedResult,
      ...expected,
      verification: {
        schemaVersion: "1",
        status: "VERIFIED",
        verifierVersion: "hosted-result-verifier-v1",
        resultHash: nativeSession.verifiedResult.resultHash,
        invariantCount: 1,
        invariants: [
          {
            name: "canonical_result_hash",
            passed: true,
            observed: nativeSession.verifiedResult.resultHash,
            expected: nativeSession.verifiedResult.resultHash,
          },
        ],
      },
    };
    const clientFor = (value: unknown) =>
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: value }),
        ),
      });

    await expect(
      clientFor(payload).getInteractiveResult(
        nativeSession.sessionId,
        "job_interactive_1",
        expected,
      ),
    ).resolves.toMatchObject(expected);

    const tampered = structuredClone(payload);
    tampered.result.planId += "_tampered";
    await expect(
      clientFor(tampered).getInteractiveResult(
        nativeSession.sessionId,
        "job_interactive_1",
        expected,
      ),
    ).rejects.toMatchObject({ code: "INTERACTIVE_RESULT_AUTHORITY_INVALID" });

    const foreign = structuredClone(payload);
    const { resultHash: _foreignResultHash, ...foreignResultContent } =
      foreign.result;
    foreignResultContent.sessionId = "session_other";
    foreign.result = {
      ...foreignResultContent,
      resultHash: await canonicalHash(foreignResultContent),
    };
    foreign.verification.resultHash = foreign.result.resultHash;
    await expect(
      clientFor(foreign).getInteractiveResult(
        nativeSession.sessionId,
        "job_interactive_1",
        expected,
      ),
    ).rejects.toMatchObject({ code: "INTERACTIVE_RESULT_AUTHORITY_INVALID" });

    await expect(
      clientFor({
        ...payload,
        selectedRunId: nativeSession.verifiedResult.runs[1]!.id,
      }).getInteractiveResult(
        nativeSession.sessionId,
        "job_interactive_1",
        expected,
      ),
    ).rejects.toMatchObject({ code: "INTERACTIVE_RESULT_AUTHORITY_INVALID" });
    await expect(
      clientFor({
        ...payload,
        configurationHash: digest("e"),
      }).getInteractiveResult(
        nativeSession.sessionId,
        "job_interactive_1",
        expected,
      ),
    ).rejects.toMatchObject({ code: "INTERACTIVE_RESULT_AUTHORITY_INVALID" });

    await expect(
      clientFor({
        ...payload,
        verification: {
          ...payload.verification,
          invariantCount: 2,
        },
      }).getInteractiveResult(
        nativeSession.sessionId,
        "job_interactive_1",
        expected,
      ),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
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
    const source = { ...session, sessionId: "session/source" };
    const restartedSessionId = `session_restart_${await canonicalHash({
      schemaVersion: "1",
      operation: "restart-closed-belief-response",
      sourceSessionId: source.sessionId,
      idempotencyKey: "counterlab.restart.v1",
    })}`;
    const restarted = {
      ...source,
      sessionId: restartedSessionId,
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

    await expect(client.restartSession(source)).resolves.toMatchObject({
      sessionId: restartedSessionId,
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
    expect(client.hasSessionAccess(restartedSessionId)).toBe(true);
  });

  it("reuses the same restart key after a response is lost", async () => {
    const source = { ...session, sessionId: "session_source" };
    const restartedSessionId = `session_restart_${await canonicalHash({
      schemaVersion: "1",
      operation: "restart-closed-belief-response",
      sourceSessionId: source.sessionId,
      idempotencyKey: "counterlab.restart.v1",
    })}`;
    const restarted = {
      ...source,
      sessionId: restartedSessionId,
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

    await expect(client.restartSession(source)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      retryable: true,
    });
    await expect(client.restartSession(source)).resolves.toMatchObject({
      sessionId: restartedSessionId,
    });
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

  it("rejects session and replay payloads detached from the requested identity", async () => {
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: { ...session, sessionId: "session_other" },
          }),
        ),
      }).getSession(session.sessionId),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });

    const replay = publicReplayFixture("entity_leakage");
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: replay }),
        ),
      }).getReplay("replay_other"),
    ).rejects.toMatchObject({ code: "REPLAY_LINEAGE_INVALID" });
  });

  it("rejects created sessions detached from the requested mode or artifact", async () => {
    const clientFor = (data: unknown) =>
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data }, 201),
        ),
      });

    await expect(
      clientFor({
        ...session,
        mode: { kind: "live_notebook" },
      }).createSampleSession({ sampleId: "leakage-01" }),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });

    await expect(
      clientFor({
        ...session,
        artifactId: "artifact_other",
        mode: { kind: "live_notebook" },
      }).createLiveSession({ artifactId: artifact.artifactId }),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });

    await expect(
      clientFor({
        ...session,
        mode: { kind: "verified_replay", replayId: "replay_other" },
      }).createReplaySession({ replayId: "leakage-01" }),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
  });

  it("binds creation responses to the validated request snapshot", async () => {
    const requestedArtifactId = artifact.artifactId;
    const input = { artifactId: requestedArtifactId };
    let releaseResponse: ((response: Response) => void) | undefined;
    const fetcher = vi.fn<typeof fetch>(
      () =>
        new Promise<Response>((resolve) => {
          releaseResponse = resolve;
        }),
    );
    const client = new CounterLabApiClient({ fetch: fetcher });
    const created = client.createLiveSession(input);

    input.artifactId = "artifact_mutated_after_dispatch";
    releaseResponse?.(
      jsonResponse(
        {
          ok: true,
          data: {
            ...session,
            artifactId: requestedArtifactId,
            mode: { kind: "live_notebook" },
          },
        },
        201,
      ),
    );

    await expect(created).resolves.toMatchObject({
      artifactId: requestedArtifactId,
      mode: { kind: "live_notebook" },
    });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/live/sessions",
      expect.objectContaining({
        body: JSON.stringify({ artifactId: requestedArtifactId }),
      }),
    );
  });

  it("rejects restarted sessions detached from source lineage", async () => {
    const source = {
      ...session,
      sessionId: "session_restart_source",
      mode: { kind: "live_notebook" as const },
    };
    const expectedSessionId = `session_restart_${await canonicalHash({
      schemaVersion: "1",
      operation: "restart-closed-belief-response",
      sourceSessionId: source.sessionId,
      idempotencyKey: "counterlab.restart.v1",
    })}`;
    const restarted = {
      ...source,
      sessionId: expectedSessionId,
      state: "INGESTED" as const,
      version: 1,
    };
    const clientFor = (data: unknown) =>
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data }, 201),
        ),
      });

    await expect(
      clientFor({ ...restarted, sessionId: "session_unbound" }).restartSession(
        source,
      ),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      clientFor({ ...restarted, artifactId: "artifact_other" }).restartSession(
        source,
      ),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      clientFor({
        ...restarted,
        mode: { kind: "sample_lesson", sampleId: "leakage-01" },
      }).restartSession(source),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
  });

  it("rejects session artifacts and runner jobs detached from request authority", async () => {
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: { ...artifact, artifactId: "artifact_other" },
          }),
        ),
      }).getSessionArtifact(session.sessionId, artifact.artifactId),
    ).rejects.toMatchObject({ code: "ARTIFACT_RESPONSE_LINEAGE_INVALID" });

    const liveSession = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "LAB_VERIFIED" as const,
      version: 8,
    };
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: {
              ...liveSession,
              runnerJob: { ...runnerJob, sessionId: "session_other" },
            },
          }),
        ),
      }).runLab(session.sessionId),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
  });

  it("cross-binds queued runner jobs to action kind, artifact, and state version", async () => {
    const liveSession = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "LAB_VERIFIED" as const,
      version: 8,
    };
    const clientFor = (job: RunnerJob) =>
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: { ...liveSession, runnerJob: job } }),
        ),
      });

    await expect(
      clientFor({
        ...runnerJob,
        kind: "LAB_COMPILE",
        requestIdentity: {
          ...runnerJob.requestIdentity,
          purpose: "LAB_COMPILE",
        },
      }).compileLab(session.sessionId),
    ).resolves.toMatchObject({
      runnerJob: { kind: "LAB_COMPILE", stateVersion: 8 },
    });
    await expect(
      clientFor({ ...runnerJob, kind: "PATCH_COMPILE" }).runLab(
        session.sessionId,
      ),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      clientFor({ ...runnerJob, artifactId: "artifact_other" }).runLab(
        session.sessionId,
      ),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      clientFor({ ...runnerJob, stateVersion: 7 }).runLab(session.sessionId),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      clientFor({
        ...runnerJob,
        requestIdentity: {
          ...runnerJob.requestIdentity,
          purpose: "LAB_RUN_BOUNDARY",
        },
      }).runLab(session.sessionId),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: liveSession }),
        ),
      }).runLab(session.sessionId),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });

    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: {
              ...liveSession,
              state: "EXPERIMENT_COMPLETED",
              version: 9,
              runnerJob: {
                ...runnerJob,
                status: "VERIFIED",
                stateVersion: 8,
                jobVersion: 3,
                runnerIdentity: "cloudflare-container-runner-v1",
                completedAt: "2026-07-14T10:03:00.000Z",
                outputHashes: [digest("d")],
              },
            },
          }),
        ),
      }).runLab(session.sessionId),
    ).resolves.toMatchObject({
      version: 9,
      runnerJob: { status: "VERIFIED", stateVersion: 8 },
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
              requestIdentity: {
                ...runnerJob.requestIdentity,
                purpose: "PATCH_COMPILE",
              },
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

  it("binds interactive jobs to their returned configuration", async () => {
    const liveSession = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "EXPERIMENT_COMPLETED" as const,
      version: 8,
    };
    const client = new CounterLabApiClient({
      fetch: vi.fn<typeof fetch>(async () =>
        jsonResponse({
          ok: true,
          data: {
            ...liveSession,
            runnerJob: {
              ...runnerJob,
              requestIdentity: {
                ...runnerJob.requestIdentity,
                purpose: "LAB_RUN_INTERACTIVE",
                configurationHash: digest("c"),
              },
            },
            selectedRunId: "interactive_abc",
            configurationHash: digest("d"),
          },
        }),
      ),
    });

    await expect(
      client.runInteractiveImbalance(session.sessionId, {
        schemaVersion: "1",
        concept: "class_imbalance",
        threshold: 0.25,
        prevalenceScenario: "rarer",
        metricFocus: "recall",
      }),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
  });

  it("cross-binds queued patch jobs to patch authority", async () => {
    const queuedPatch = {
      ...session,
      mode: { kind: "live_notebook" as const },
      state: "TRANSFER_PASSED" as const,
      version: 12,
      runnerJob: {
        ...runnerJob,
        jobId: "job_patch_1",
        kind: "PATCH_COMPILE" as const,
        requestIdentity: {
          ...runnerJob.requestIdentity,
          purpose: "PATCH_COMPILE" as const,
        },
        stateVersion: 12,
      },
    };
    const clientFor = (data: unknown) =>
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data }),
        ),
      });

    await expect(
      clientFor(queuedPatch).compilePatch(session.sessionId),
    ).resolves.toMatchObject({ runnerJob: { kind: "PATCH_COMPILE" } });
    await expect(
      clientFor({
        ...queuedPatch,
        runnerJob: { ...queuedPatch.runnerJob, kind: "LAB_RUN" },
      }).compilePatch(session.sessionId),
    ).rejects.toMatchObject({ code: "PATCH_AUTHORITY_LINEAGE_INVALID" });
    await expect(
      clientFor({
        ...queuedPatch,
        runnerJob: {
          ...queuedPatch.runnerJob,
          artifactId: "artifact_other",
        },
      }).compilePatch(session.sessionId),
    ).rejects.toMatchObject({ code: "PATCH_AUTHORITY_LINEAGE_INVALID" });
    await expect(
      clientFor({
        ...queuedPatch,
        runnerJob: { ...queuedPatch.runnerJob, stateVersion: 11 },
      }).compilePatch(session.sessionId),
    ).rejects.toMatchObject({ code: "PATCH_AUTHORITY_LINEAGE_INVALID" });
  });

  it("accepts only a verified patch bound to the returned session authority", async () => {
    const nativeSession = await nativeProofSession();
    const validResponse = {
      ...nativeSession,
      patch: nativeSession.patchResult,
    };
    const clientFor = (value: unknown) =>
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({ ok: true, data: value }),
        ),
      });

    await expect(
      clientFor(validResponse).compilePatch(nativeSession.sessionId),
    ).resolves.toMatchObject({
      patch: {
        status: "VERIFIED",
        resultHash: nativeSession.patchResult.resultHash,
      },
    });

    await expect(
      clientFor(validResponse).compilePatch("session_other"),
    ).rejects.toMatchObject({ code: "PATCH_AUTHORITY_LINEAGE_INVALID" });

    await expect(
      clientFor({
        ...validResponse,
        patch: {
          ...nativeSession.patchResult,
          status: "REJECTED",
          verification: {
            ...nativeSession.patchResult.verification,
            passed: false,
          },
        },
      }).compilePatch(nativeSession.sessionId),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });

    const detachedPatch = {
      ...nativeSession.patchResult,
      diff: `${nativeSession.patchResult.diff}\n+ detached change`,
    };
    detachedPatch.patchHash = await canonicalHash(detachedPatch.diff);
    const { resultHash: _detachedHash, ...detachedContent } = detachedPatch;
    detachedPatch.resultHash = await canonicalHash(detachedContent);
    await expect(
      clientFor({ ...validResponse, patch: detachedPatch }).compilePatch(
        nativeSession.sessionId,
      ),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
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
                requestIdentity: {
                  ...runnerJob.requestIdentity,
                  purpose: "LAB_RUN_INTERACTIVE",
                  configurationHash: digest("d"),
                },
                stateVersion: liveSession.version,
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
          sessionId: "session/with space",
          mode: { kind: "live_notebook" },
          state: "LAB_REJECTED",
          version: 9,
          runnerJob: {
            ...runnerJob,
            jobId: "job/with space",
            sessionId: "session/with space",
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

    await expect(
      new CounterLabApiClient({
        fetch: vi.fn<typeof fetch>(async () =>
          jsonResponse({
            ok: true,
            data: {
              ...session,
              mode: { kind: "live_notebook" },
              state: "LAB_REJECTED",
              version: 9,
              runnerJob: {
                ...runnerJob,
                jobId: "job_other",
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
        ),
      }).cancelRunnerJob(session.sessionId, runnerJob.jobId),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
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
        invoke: () =>
          client.getInteractiveResult(sessionId, "job/one", {
            selectedRunId: "interactive_abc",
            configurationHash: digest("d"),
          }),
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
        invoke: () => client.getReasoningDiff(sessionId, reasoningDiffV2),
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

  it("binds runner event streams to the requested job", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: {
            jobId: "job_1",
            events: [
              {
                schemaVersion: "1",
                eventId: "compiler_event_other",
                jobId: "job_other",
                cursor: 1,
                at: "2026-07-14T10:02:00.000Z",
                kind: "job.started",
              },
            ],
            nextCursor: 1,
            terminal: false,
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          ok: true,
          data: {
            jobId: "job_other",
            events: [],
            nextCursor: 0,
            terminal: true,
            jobStatus: "VERIFIED",
          },
        }),
      );
    const client = new CounterLabApiClient({ fetch: fetcher });

    await expect(
      client.listRunnerEvents("session_1", "job_1"),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
    await expect(
      client.listRunnerEvents("session_1", "job_1"),
    ).rejects.toMatchObject({ code: "SESSION_RESPONSE_LINEAGE_INVALID" });
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
      mode: { kind: "sample_lesson" as const, sampleId: "leakage-01" as const },
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
            mode: { kind: "sample_lesson", sampleId: "leakage-01" },
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
