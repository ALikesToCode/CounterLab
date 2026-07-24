import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ArtifactManifestSchema,
  migrateBeliefTestV1ToV2,
  VerifiedResultSetSchema,
  type EvidenceEvent,
} from "@counterlab/contracts";
import { hashCanonicalJson } from "@counterlab/proof-bundle";

import imbalanceResultText from "../../../fixtures/held-out/imbalance_epistemic_competing_v2.json?raw";
import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";

import { App, notebookEvidenceReferences } from "./App";
import { SessionViewSchema } from "./api";
import {
  publicReplayFixture,
  replayFixture,
} from "./components/replay/ProofCapsuleReplayView.fixture";
import { activeRunnerRegistryKey } from "./features/learner/activeRunnerRegistry";
import { requireBundledSampleResult, sampleArtifact } from "./sample";

const sampleResult = requireBundledSampleResult();

function withCanonicalPredictionHash<
  T extends { readonly immutableHash: string },
>(prediction: T): T {
  const { immutableHash: _immutableHash, ...content } = prediction;
  return {
    ...content,
    immutableHash: hashCanonicalJson(content),
  } as T;
}

function withCanonicalResultHash<T extends { readonly resultHash: string }>(
  result: T,
): T {
  const { resultHash: _resultHash, ...content } = result;
  return { ...content, resultHash: hashCanonicalJson(content) } as T;
}

const PRE_PREDICTION_RESULT_LANGUAGE =
  /59\.4%|\bdeceptive\b|\bfairer test\b|\bverified result\b|\bevidence verdict\b|\bsupported hypothesis\b|\bthe fix\b|\bremove customer(?:_| )id\b|\bkeep each customer's rows together\b|\bproves?\b/i;
const LANDING_FIXED_SAMPLE_VALUES = /98\.5%|59\.4%/i;

const artifact = {
  artifactId: "artifact_sample",
  fileName: sampleArtifact.fileName,
  fileSha256: sampleArtifact.fileSha256,
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [],
  schemaSummary: {
    fields: [],
    rowCount: sampleArtifact.rows,
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-07-14T09:00:00.000Z",
};

const uploadedArtifact = {
  ...artifact,
  artifactId: "artifact_uploaded",
  fileName: "uploaded_customer_model.ipynb",
  fileSha256: "a".repeat(64),
};

const verifiedImbalanceResult = withCanonicalResultHash({
  ...VerifiedResultSetSchema.parse(JSON.parse(imbalanceResultText)),
  sessionId: "session_ui",
  artifactManifestHash: hashCanonicalJson(uploadedArtifact),
});

const unsupportedArtifact = {
  ...uploadedArtifact,
  artifactId: "artifact_unsupported",
  fileName: "unsupported_notebook.ipynb",
  support: {
    status: "UNSUPPORTED" as const,
    reasons: [
      {
        code: "UNSUPPORTED_ESTIMATOR",
        message:
          "This estimator is outside the released notebook support boundary.",
      },
    ],
  },
};

const liveBeliefTest = {
  schemaVersion: "1",
  id: "belief_live_ui",
  concept: "entity_leakage",
  learnerClaim: "The notebook accuracy proves generalization to new customers.",
  currentHypothesis: {
    statement: "Live current hypothesis from the submitted claim.",
    predictedOutcome: "Accuracy remains high for held-out customers.",
  },
  competingHypothesis: {
    statement:
      "Live competing hypothesis: repeated identity crosses the split.",
    predictedOutcome: "Accuracy falls when complete customers are held out.",
  },
  evidenceRefs: [
    {
      kind: "schema",
      hash: "c".repeat(64),
      excerpt: "customer_id identifies the evaluation boundary",
      relevance: "The claim targets unseen customers.",
    },
  ],
  alternatives: [
    {
      label: "Metric choice",
      rationale: "Accuracy can hide class-specific errors.",
    },
  ],
  decisiveIntervention: {
    id: "live-group-split",
    description:
      "Compare the registered evaluation boundary while keeping the model fixed.",
    controlledVariables: ["model", "metric", "seed"],
    changedVariables: ["split boundary"],
    discriminatesBecause: "The hypotheses predict different held-out accuracy.",
  },
  uncertainty: {
    confidence: 0.88,
    limitations: ["This test covers the supplied notebook evidence only."],
    insufficientEvidence: false,
  },
  requiresLearnerConfirmation: true,
};

const imbalanceBeliefTest = {
  ...liveBeliefTest,
  id: "belief_live_imbalance_ui",
  concept: "class_imbalance" as const,
  learnerClaim:
    "The 99 percent accuracy means this fraud model catches rare fraud.",
  currentHypothesis: {
    statement: "High accuracy means the classifier is useful.",
    predictedOutcome: "Rare-class recall should be strong.",
  },
  competingHypothesis: {
    statement: "Class rarity lets a majority predictor appear highly accurate.",
    predictedOutcome:
      "The majority baseline stays high while rare-class recall is poor.",
  },
  evidenceRefs: [
    {
      kind: "metric" as const,
      cellIndex: 4,
      outputIndex: 0,
      hash: "e".repeat(64),
      excerpt: "accuracy: 0.99",
      relevance: "Overall accuracy does not reveal rare-class misses.",
    },
  ],
};

const liveBeliefSpec = {
  ...migrateBeliefTestV1ToV2(liveBeliefTest),
  learnerDecision: "UNDECIDED" as const,
};

const confirmedLiveBeliefSpec = {
  ...liveBeliefSpec,
  supportState: "SUPPORTED" as const,
  learnerDecision: "CONFIRMED" as const,
};

const liveImbalanceBeliefSpec = {
  ...migrateBeliefTestV1ToV2(imbalanceBeliefTest),
  supportState: "SUPPORTED" as const,
  learnerDecision: "CONFIRMED" as const,
};

const livePreview = {
  schemaVersion: "1" as const,
  concept: "entity_leakage" as const,
  conceptTitle: "Entity leakage",
  previewHash: "d".repeat(64),
  requiresSensitiveApproval: false,
  sanitizedContent: {
    learnerClaim:
      "The notebook accuracy proves generalization to new customers.",
    supportStatus: "SUPPORTED",
    evidence: [
      {
        cellIndex: 3,
        kind: "code",
        excerpt: "train_test_split(X, y, random_state=42)",
      },
    ],
  },
  learningDirectorPacket: {},
};

const sensitiveLivePreview = {
  ...livePreview,
  requiresSensitiveApproval: true,
  sanitizedContent: {
    ...livePreview.sanitizedContent,
    evidence: [
      {
        cellIndex: 3,
        kind: "code",
        excerpt: "token = '[REDACTED_SECRET]'",
      },
    ],
  },
};

const operationByRun = {
  random_row_split: "leakage.random_row_split",
  customer_group_split: "leakage.group_holdout",
  identity_ablation: "leakage.identity_ablation",
} as const;

const { resultHash: _sampleResultHash, ...sampleResultContent } = sampleResult;
const liveResult = withCanonicalResultHash({
  ...sampleResultContent,
  schemaVersion: "2" as const,
  planId: "plan_live_ui",
  sessionId: "session_ui",
  artifactManifestHash: hashCanonicalJson(uploadedArtifact),
  conceptPackVersion: "1.0.0",
  runs: sampleResult.runs.map((run) => ({
    ...run,
    operation:
      operationByRun[run.id as keyof typeof operationByRun] ??
      "leakage.random_row_split",
  })),
  resultHash: sampleResult.resultHash,
});

const epistemicReportHash = "9".repeat(64);
const evidenceVerdictBase = {
  schemaVersion: "1" as const,
  irHash: "8".repeat(64),
  technicalReportHash: "7".repeat(64),
  verifierVersion: "epistemic-verifier-v1",
};
const supportingEvidenceVerdict = {
  ...evidenceVerdictBase,
  kind: "SUPPORTS" as const,
  hypothesisId: "competing" as const,
  scope: "unseen customers in this supplied notebook",
  resultHash: liveResult.resultHash,
};
const supportingImbalanceEvidenceVerdict = {
  ...evidenceVerdictBase,
  kind: "SUPPORTS" as const,
  hypothesisId: "competing" as const,
  scope: "rare events in this supplied notebook",
  resultHash: verifiedImbalanceResult.resultHash,
};
const inconclusiveEvidenceVerdict = {
  ...evidenceVerdictBase,
  kind: "INCONCLUSIVE" as const,
  reasonCode: "OBSERVED_GAP_WITHIN_TOLERANCE" as const,
  scope: "unseen customers in this supplied notebook",
  resultHash: liveResult.resultHash,
};
const rejectedEvidenceVerdict = {
  ...evidenceVerdictBase,
  kind: "REJECTED" as const,
  findingIds: ["result_binding_mismatch"],
  resultReleased: false as const,
};

const liveLabSceneView = {
  schemaVersion: "1" as const,
  scene: {
    schemaVersion: "2" as const,
    sceneId: "scene_live_ui",
    sessionId: "session_ui",
    concept: "entity_leakage" as const,
    supportLabel: "GUIDED_VISUAL" as const,
    title: "See the verified test as a bounded scene",
    blocks: [
      {
        id: "unseen_accuracy",
        type: "Metric" as const,
        label: "Whole-customer accuracy",
        resultBinding: "/runs/byId/customer_group_split/metrics/accuracy",
        unit: "proportion",
      },
      {
        id: "familiar_accuracy",
        type: "Metric" as const,
        label: "Familiar-row accuracy",
        resultBinding: "/runs/byId/random_row_split/metrics/accuracy",
        unit: "proportion",
      },
    ],
    assumptions: ["The model and preprocessing remain fixed."],
    limitations: ["This result is bounded to the submitted notebook."],
    provenance: {
      experimentIrHash: "b".repeat(64),
      discriminationContractHash: "c".repeat(64),
    },
  },
  verifiedSceneHash: "d".repeat(64),
  signedResult: {
    schemaVersion: "1" as const,
    verificationStatus: "VERIFIED" as const,
    sceneHash: "d".repeat(64),
    sceneId: "scene_live_ui",
    sessionId: "session_ui",
    concept: "entity_leakage" as const,
    experimentIrHash: "b".repeat(64),
    discriminationContractHash: "c".repeat(64),
    resultHash: liveResult.resultHash,
    integrity: {
      mode: "integrity-hashed" as const,
      contentHash: liveResult.resultHash,
    },
    result: liveResult,
  },
};

const committedPrediction = withCanonicalPredictionHash({
  schemaVersion: "1" as const,
  id: "prediction_ui",
  sessionId: "session_ui",
  beliefTestId: liveBeliefSpec.id,
  choice: "Accuracy falls materially",
  confidence: 88,
  committedAt: "2026-07-14T09:03:00.000Z",
  immutableHash: "f".repeat(64),
});

const failedLeakageTransfer = withCanonicalResultHash({
  schemaVersion: "1" as const,
  id: "transfer_failed_ui",
  sessionId: "session_ui",
  taskId: "forecasting-future-leakage-01",
  outcome: "FAILED" as const,
  selectedStrategy: "random_row_holdout",
  identifiedRisks: ["model_is_too_simple"],
  evidenceChoices: ["metric_is_mae"],
  checks: [
    {
      invariant: "TIME_AWARE_EVALUATION",
      passed: false,
      evidence: "The submitted evaluation did not match deployment time.",
    },
  ],
  evaluatorVersion: "counterlab-transfer-v1",
  evaluatedAt: "2026-07-14T09:05:00.000Z",
  resultHash: "e".repeat(64),
});

const committedImbalancePrediction = withCanonicalPredictionHash({
  ...committedPrediction,
  id: "prediction_imbalance_ui",
  beliefTestId: liveImbalanceBeliefSpec.id,
  choice: "Minority metrics expose a serious evaluation problem",
});

const failedImbalanceTransfer = withCanonicalResultHash({
  schemaVersion: "1" as const,
  id: "transfer_failed_imbalance_ui",
  sessionId: "session_ui",
  taskId: "manufacturing-defect-transfer-01",
  outcome: "FAILED" as const,
  selectedStrategy: "approve_high_accuracy",
  identifiedRisks: ["accuracy"],
  evidenceChoices: ["many_true_negatives"],
  checks: [
    {
      invariant: "ACCURACY_CLAIM_REJECTED",
      passed: false,
      evidence: "Overall accuracy does not establish rare-class utility.",
    },
  ],
  evaluatorVersion: "counterlab-imbalance-transfer-v1",
  evaluatedAt: "2026-07-14T09:05:00.000Z",
  resultHash: "d".repeat(64),
});

const passedLeakageTransfer = withCanonicalResultHash({
  ...failedLeakageTransfer,
  id: "transfer_passed_ui",
  outcome: "PASSED" as const,
  selectedStrategy: "time_ordered_holdout",
  identifiedRisks: ["centered_window_reads_future"],
  evidenceChoices: [
    "center_true_uses_later_targets",
    "random_split_mixes_dates",
  ],
  checks: failedLeakageTransfer.checks.map((check) => ({
    ...check,
    passed: true,
  })),
});

const latePassedLeakageTransfer = withCanonicalResultHash({
  ...passedLeakageTransfer,
  id: "transfer_passed_late_ui",
});

const liveRunnerJob = {
  schemaVersion: "1" as const,
  jobId: "runner_job_ui",
  kind: "LAB_COMPILE" as const,
  status: "STARTING" as const,
  sessionId: "session_ui",
  artifactId: uploadedArtifact.artifactId,
  artifactManifestHash: hashCanonicalJson(uploadedArtifact),
  conceptPack: { id: "entity_leakage" as const, version: "1.0.0" },
  inputHashes: ["b".repeat(64)],
  requestFingerprint: "c".repeat(64),
  requestIdentity: {
    schemaVersion: "1" as const,
    sessionId: "session_ui",
    mode: "live_notebook" as const,
    purpose: "LAB_COMPILE" as const,
    artifactId: uploadedArtifact.artifactId,
    artifactManifestHash: hashCanonicalJson(uploadedArtifact),
    conceptPack: { id: "entity_leakage" as const, version: "1.0.0" },
    authorityProfileHash: "d".repeat(64),
    authorityInputHashes: { artifactManifest: "e".repeat(64) },
  },
  stateVersion: 5,
  jobVersion: 2,
  createdAt: "2026-07-14T09:02:00.000Z",
  updatedAt: "2026-07-14T09:02:01.000Z",
  startedAt: "2026-07-14T09:02:01.000Z",
  dispatchAcknowledgedAt: "2026-07-14T09:02:01.000Z",
  attempt: 1,
  maxAttempts: 3,
  runnerIdentity: "cloudflare-container-runner-v1",
  timeoutSeconds: 180,
  outputHashes: [],
  eventCursor: 0,
};

const restartedSessionId =
  "session_restart_d97fe9f6854ad0ac2b036b0942552e90c5cbabd7f467c6877949fbc5cadc2366";

function session(
  state: string,
  version: number,
  extra: Record<string, unknown> = {},
) {
  return {
    sessionId: "session_ui",
    artifactId: artifact.artifactId,
    mode: { kind: "sample_lesson", sampleId: "leakage-01" },
    state,
    version,
    createdAt: "2026-07-14T09:01:00.000Z",
    updatedAt: "2026-07-14T09:01:00.000Z",
    ...extra,
  };
}

function storedEvidenceEvent(
  sessionId: string,
  sequence: number,
  kind: string,
  actor: EvidenceEvent["actor"] = "system",
): EvidenceEvent {
  const eventHash = sequence.toString(16).repeat(64).slice(0, 64);
  return {
    schemaVersion: "1",
    eventId: `${sessionId}_event_${sequence}`,
    sessionId,
    sequence,
    timestamp: `2026-07-19T10:00:0${sequence}.000Z`,
    actor,
    kind,
    inputHashes: [],
    outputHashes: [eventHash],
    payload: {},
    ...(sequence === 1
      ? {}
      : {
          previousEventHash: (sequence - 1)
            .toString(16)
            .repeat(64)
            .slice(0, 64),
        }),
    eventHash,
  };
}

function response(data: unknown, status = 200) {
  return new Response(JSON.stringify({ ok: true, data }), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return new Response(
    JSON.stringify({ ok: false, error: { code, message, status } }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((fulfilled) => {
    resolve = fulfilled;
  });
  return { promise, resolve };
}

function installApi(
  options: {
    liveGpt?: "configured" | "server-key-required";
    runner?: "configured" | "local-runner-required";
    generationIsolation?: "PARTIAL" | "OS_ENFORCED";
    rejectLiveBelief?: boolean;
    cancelOffline?: boolean;
    beliefTest?: typeof liveBeliefTest | typeof imbalanceBeliefTest;
    stallRunner?: boolean;
    failRunnerResume?: boolean;
    preview?: typeof livePreview | typeof sensitiveLivePreview;
    uploadOutcomes?: readonly (
      "supported" | "unsupported" | "malformed" | "interrupted"
    )[];
    liveSessionFailures?: number;
    restoredSessionState?:
      | "INGESTED"
      | "INSUFFICIENT_EVIDENCE"
      | "REJECTED_BY_LEARNER"
      | "BELIEF_TEST_PROPOSED"
      | "BELIEF_TEST_CONFIRMED"
      | "LAB_COMPILING"
      | "LAB_VERIFIED"
      | "EXPERIMENT_COMPLETED"
      | "REVISION_RECORDED"
      | "TRANSFER_FAILED"
      | "TRANSFER_PASSED"
      | "REASONING_DIFF_ISSUED"
      | "PROOF_CAPSULE_ISSUED";
    restoredSessionExtra?: Record<string, unknown>;
    restartSessionState?:
      | "INGESTED"
      | "BELIEF_TEST_PROPOSED"
      | "BELIEF_TEST_CONFIRMED"
      | "PREDICTION_COMMITTED";
    restartSessionExtra?: Record<string, unknown>;
    omitRestoredPrediction?: boolean;
    replay?: ReturnType<typeof publicReplayFixture>;
    replayFailure?: boolean;
    eventsHandler?: (
      sessionId: string,
      requestIndex: number,
    ) => Response | Promise<Response>;
    predictionCommitResponseLost?: boolean;
  } = {},
) {
  const uploadOutcomes = [...(options.uploadOutcomes ?? [])];
  let liveSessionFailures = options.liveSessionFailures ?? 0;
  let activeMode:
    | { kind: "sample_lesson"; sampleId: "leakage-01" }
    | { kind: "live_notebook" } = {
    kind: "sample_lesson",
    sampleId: "leakage-01",
  };
  let activeArtifactId = artifact.artifactId;
  let activePrediction: Record<string, unknown> | null = null;
  let predictionCommitResponseLost =
    options.predictionCommitResponseLost ?? false;
  const restoredBeliefSpec = options.restoredSessionExtra?.beliefSpec as
    { concept?: string } | undefined;
  const predictionTemplate =
    options.beliefTest?.concept === "class_imbalance" ||
    restoredBeliefSpec?.concept === "class_imbalance"
      ? committedImbalancePrediction
      : committedPrediction;
  const activeConcept =
    options.beliefTest?.concept ?? restoredBeliefSpec?.concept;
  const activeVerifiedResult =
    activeConcept === "class_imbalance" ? verifiedImbalanceResult : liveResult;
  const activeBeliefAuthority =
    restoredBeliefSpec === undefined
      ? { beliefTest: options.beliefTest ?? liveBeliefTest }
      : { beliefSpec: options.restoredSessionExtra?.beliefSpec };
  const activeNativeEvidenceAuthority =
    restoredBeliefSpec === undefined
      ? {}
      : {
          evidenceVerdict:
            options.restoredSessionExtra?.evidenceVerdict ??
            (activeConcept === "class_imbalance"
              ? supportingImbalanceEvidenceVerdict
              : supportingEvidenceVerdict),
          epistemicReportHash:
            options.restoredSessionExtra?.epistemicReportHash ??
            epistemicReportHash,
        };
  let eventRequestIndex = 0;
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      const routedSessionId = /^\/api\/sessions\/([^/]+)/u.exec(path)?.[1];
      if (path === "/api/health" || path === "/api/health?readiness=probe") {
        const deepReadiness = path.endsWith("?readiness=probe");
        return response({
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: options.liveGpt ?? "server-key-required",
          liveCodex: options.runner ?? "local-runner-required",
          liveKernel: options.runner ?? "local-runner-required",
          readiness: deepReadiness
            ? options.liveGpt === "configured" &&
              options.runner === "configured"
              ? "ready"
              : "not-ready"
            : "not-checked",
          sandbox:
            options.runner === "configured"
              ? "credential-and-privilege-boundary"
              : "local-runner-required",
          generationFilesystemReadIsolation:
            options.generationIsolation ??
            (options.runner === "configured" ? "OS_ENFORCED" : "PARTIAL"),
          ...(options.runner === "configured"
            ? {
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
              }
            : {}),
          requestId: "request_ui",
        });
      }
      if (path === "/api/artifacts") {
        if (init?.body instanceof FormData) {
          const outcome = uploadOutcomes.shift() ?? "supported";
          if (outcome === "interrupted") {
            throw new TypeError("network unavailable");
          }
          if (outcome === "malformed") {
            return errorResponse(
              "INVALID_NOTEBOOK",
              "The notebook could not be parsed safely.",
              400,
            );
          }
          if (outcome === "unsupported") {
            return response(unsupportedArtifact, 201);
          }
        }
        return response(
          init?.body instanceof FormData ? uploadedArtifact : artifact,
          201,
        );
      }
      if (path === "/api/sample/sessions") {
        activeMode = { kind: "sample_lesson", sampleId: "leakage-01" };
        return response(session("INGESTED", 1, { mode: activeMode }), 201);
      }
      if (path === "/api/live/sessions") {
        if (liveSessionFailures > 0) {
          liveSessionFailures -= 1;
          throw new TypeError("network unavailable");
        }
        activeMode = { kind: "live_notebook" };
        activeArtifactId = uploadedArtifact.artifactId;
        return response(
          session("INGESTED", 1, {
            artifactId: activeArtifactId,
            mode: activeMode,
          }),
          201,
        );
      }
      if (path.endsWith("/restart")) {
        return response(
          session(options.restartSessionState ?? "INGESTED", 1, {
            sessionId: restartedSessionId,
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(options.restartSessionExtra ?? {}),
          }),
          201,
        );
      }
      const eventsMatch = path.match(/^\/api\/sessions\/([^/]+)\/events$/u);
      if (eventsMatch?.[1] !== undefined) {
        const requestIndex = eventRequestIndex;
        eventRequestIndex += 1;
        return (
          (await options.eventsHandler?.(
            decodeURIComponent(eventsMatch[1]),
            requestIndex,
          )) ?? response({ events: [] })
        );
      }
      if (path === "/api/sessions/session_ui/artifact") {
        return response(uploadedArtifact);
      }
      if (path === "/api/sessions/session_ui/lab-scene") {
        return response(liveLabSceneView);
      }
      if (path === `/api/sessions/${restartedSessionId}/artifact`) {
        return response(uploadedArtifact);
      }
      if (path === `/api/sessions/${restartedSessionId}`) {
        return response(
          session(options.restartSessionState ?? "INGESTED", 1, {
            sessionId: restartedSessionId,
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(options.restartSessionExtra ?? {}),
          }),
        );
      }
      if (path === "/api/sessions/session_ui") {
        if (
          options.predictionCommitResponseLost === true &&
          activePrediction !== null
        ) {
          return response(
            session("PREDICTION_COMMITTED", 4, {
              artifactId: activeArtifactId,
              mode: activeMode,
              ...activeBeliefAuthority,
              prediction: activePrediction,
            }),
          );
        }
        activeMode = { kind: "live_notebook" };
        activeArtifactId = uploadedArtifact.artifactId;
        const restoredExtra = options.restoredSessionExtra ?? {};
        const restoredState = options.restoredSessionState ?? "LAB_COMPILING";
        const restoredStateRequiresPrediction = ![
          "INGESTED",
          "INSUFFICIENT_EVIDENCE",
          "REJECTED_BY_LEARNER",
          "BELIEF_TEST_PROPOSED",
          "BELIEF_TEST_CONFIRMED",
        ].includes(restoredState);
        activePrediction =
          restoredExtra.prediction === undefined
            ? restoredStateRequiresPrediction &&
              options.omitRestoredPrediction !== true
              ? predictionTemplate
              : null
            : (restoredExtra.prediction as Record<string, unknown>);
        const restoredBeliefAuthority =
          (activePrediction !== null ||
            restoredExtra.verifiedResult !== undefined) &&
          restoredExtra.beliefSpec === undefined &&
          restoredExtra.beliefTest === undefined
            ? { beliefTest: options.beliefTest ?? liveBeliefTest }
            : {};
        return response(
          session(restoredState, 5, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
            ...(activePrediction === null
              ? {}
              : { prediction: activePrediction }),
            ...restoredBeliefAuthority,
            ...restoredExtra,
          }),
        );
      }
      if (path.includes("/jobs/runner_job_ui/events?after=")) {
        if (options.failRunnerResume) {
          return response({
            jobId: "runner_job_ui",
            events: [],
            nextCursor: 0,
            jobStatus: "FAILED",
            terminal: true,
            jobError: {
              code: "CODEX_TURN_FAILED",
              message: "The bounded compiler turn failed.",
              retryable: false,
            },
          });
        }
        return response({
          jobId: "runner_job_ui",
          events: [],
          nextCursor: 0,
          jobStatus: "STARTING",
          terminal: false,
        });
      }
      if (path.endsWith("/jobs/runner_job_ui/cancel")) {
        if (options.cancelOffline) throw new TypeError("network unavailable");
        return response({
          ...session("LAB_REJECTED", 6, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
          }),
          runnerJob: {
            ...liveRunnerJob,
            status: "CANCELLED",
            jobVersion: 3,
            completedAt: "2026-07-14T09:02:02.000Z",
            error: {
              code: "RUNNER_JOB_CANCELLED",
              message: "The learner cancelled this runner job.",
              retryable: true,
            },
          },
          reused: false,
          runnerAcknowledged: true,
        });
      }
      if (path.endsWith("/belief-test/preview")) {
        return response(options.preview ?? livePreview);
      }
      if (path.endsWith("/belief-test")) {
        if (activeMode.kind === "live_notebook" && options.rejectLiveBelief) {
          return errorResponse(
            "LIVE_UNAVAILABLE",
            "Responses endpoint authentication failed",
            503,
          );
        }
        return response(
          session("BELIEF_TEST_PROPOSED", 2, {
            ...(routedSessionId === undefined
              ? {}
              : { sessionId: decodeURIComponent(routedSessionId) }),
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(activeMode.kind === "live_notebook"
              ? { beliefTest: options.beliefTest ?? liveBeliefTest }
              : {}),
          }),
        );
      }
      if (path.endsWith("/belief-test/confirm")) {
        const body = JSON.parse(String(init?.body)) as { action?: string };
        if (body.action === "reject") {
          return response(
            session("REJECTED_BY_LEARNER", 3, {
              ...(routedSessionId === undefined
                ? {}
                : { sessionId: decodeURIComponent(routedSessionId) }),
              artifactId: activeArtifactId,
              mode: activeMode,
            }),
          );
        }
        if (body.action === "insufficient_evidence") {
          return response(
            session("INSUFFICIENT_EVIDENCE", 3, {
              ...(routedSessionId === undefined
                ? {}
                : { sessionId: decodeURIComponent(routedSessionId) }),
              artifactId: activeArtifactId,
              mode: activeMode,
            }),
          );
        }
        return response(
          session("BELIEF_TEST_CONFIRMED", 3, {
            ...(routedSessionId === undefined
              ? {}
              : { sessionId: decodeURIComponent(routedSessionId) }),
            artifactId: activeArtifactId,
            mode: activeMode,
          }),
        );
      }
      if (path.endsWith("/prediction")) {
        const input = JSON.parse(String(init?.body)) as {
          choice: string;
          confidence: number;
        };
        activePrediction = withCanonicalPredictionHash({
          ...predictionTemplate,
          sessionId:
            routedSessionId === undefined
              ? predictionTemplate.sessionId
              : decodeURIComponent(routedSessionId),
          choice: input.choice,
          confidence: input.confidence,
        });
        if (predictionCommitResponseLost) {
          predictionCommitResponseLost = false;
          return errorResponse(
            "ILLEGAL_TRANSITION",
            `Prediction is already committed for session ${routedSessionId ?? "session_ui"}`,
            409,
          );
        }
        return response(
          session("PREDICTION_COMMITTED", 4, {
            ...(routedSessionId === undefined
              ? {}
              : { sessionId: decodeURIComponent(routedSessionId) }),
            artifactId: activeArtifactId,
            mode: activeMode,
            ...activeBeliefAuthority,
            prediction: activePrediction,
          }),
          201,
        );
      }
      if (path.endsWith("/interactions")) {
        const interaction = JSON.parse(String(init?.body)) as {
          eventId: string;
        };
        return response(
          {
            schemaVersion: "1",
            eventId: interaction.eventId,
            accepted: true,
            duplicate: false,
          },
          201,
        );
      }
      if (path.endsWith("/lab/compile")) {
        if (options.stallRunner) {
          return response({
            ...session("LAB_COMPILING", 5, {
              ...(routedSessionId === undefined
                ? {}
                : { sessionId: decodeURIComponent(routedSessionId) }),
              artifactId: activeArtifactId,
              mode: activeMode,
            }),
            runnerJob: liveRunnerJob,
          });
        }
        return response(
          session("LAB_VERIFIED", 6, {
            ...(routedSessionId === undefined
              ? {}
              : { sessionId: decodeURIComponent(routedSessionId) }),
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(activePrediction === null
              ? {}
              : { prediction: activePrediction }),
            ...(activePrediction === null ? {} : activeBeliefAuthority),
          }),
        );
      }
      if (path.endsWith("/lab/run")) {
        const completed = session("EXPERIMENT_COMPLETED", 7, {
          ...(routedSessionId === undefined
            ? {}
            : { sessionId: decodeURIComponent(routedSessionId) }),
          artifactId: activeArtifactId,
          mode: activeMode,
          ...(activePrediction === null
            ? {}
            : { prediction: activePrediction }),
          ...activeBeliefAuthority,
          verifiedResult:
            activeMode.kind === "live_notebook"
              ? activeVerifiedResult
              : sampleResult,
          ...activeNativeEvidenceAuthority,
        });
        SessionViewSchema.parse(completed);
        return response(completed);
      }
      if (path.endsWith("/revision")) {
        const input = JSON.parse(String(init?.body)) as { revision: string };
        return response(
          session("REVISION_RECORDED", 8, {
            ...(routedSessionId === undefined
              ? {}
              : { sessionId: decodeURIComponent(routedSessionId) }),
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(activePrediction === null
              ? {}
              : { prediction: activePrediction }),
            ...activeBeliefAuthority,
            verifiedResult:
              activeMode.kind === "live_notebook"
                ? activeVerifiedResult
                : sampleResult,
            ...activeNativeEvidenceAuthority,
            revision: input.revision,
          }),
        );
      }
      if (path.endsWith("/transfer")) {
        const input = JSON.parse(String(init?.body)) as {
          strategyChoice: string;
          riskChoice: string;
          evidenceChoices: string[];
        };
        const passed =
          input.strategyChoice === "time_ordered_holdout" &&
          input.riskChoice === "centered_window_reads_future" &&
          input.evidenceChoices.includes("center_true_uses_later_targets") &&
          input.evidenceChoices.includes("random_split_mixes_dates");
        const transferResult = withCanonicalResultHash({
          ...failedLeakageTransfer,
          sessionId:
            routedSessionId === undefined
              ? "session_ui"
              : decodeURIComponent(routedSessionId),
          id: passed ? "transfer_passed_ui" : "transfer_failed_ui",
          outcome: passed ? ("PASSED" as const) : ("FAILED" as const),
          selectedStrategy: input.strategyChoice,
          identifiedRisks: [input.riskChoice],
          evidenceChoices: input.evidenceChoices,
          checks: [
            {
              invariant: "FIXED_TRANSFER",
              passed,
              evidence: "The fixed transfer evaluator checked the submission.",
            },
          ],
        });
        return response(
          session(passed ? "TRANSFER_PASSED" : "TRANSFER_FAILED", 9, {
            ...(routedSessionId === undefined
              ? {}
              : { sessionId: decodeURIComponent(routedSessionId) }),
            artifactId: activeArtifactId,
            mode: activeMode,
            ...(activePrediction === null
              ? {}
              : { prediction: activePrediction }),
            ...activeBeliefAuthority,
            verifiedResult:
              activeMode.kind === "live_notebook"
                ? activeVerifiedResult
                : sampleResult,
            ...activeNativeEvidenceAuthority,
            revision:
              "Evaluation must match deployment timing and use exact code evidence.",
            transferResult,
          }),
        );
      }
      if (path.startsWith("/api/replays/")) {
        if (options.replayFailure) throw new TypeError("network unavailable");
        const replayId = decodeURIComponent(path.slice("/api/replays/".length));
        if (options.replay?.replayId === replayId) {
          return response(options.replay);
        }
        return response({
          schemaVersion: "1",
          replayId,
          replay: true,
          recordedAt: "2026-07-14T11:50:37.947Z",
          modelId: "gpt-5.6-sol",
          fixtureId: "customer-churn-public-v1",
          verifierVersion: "leakage-verifier-v1",
          templateCommit: "4f2f647228304d63ac8b9cba8cdca1dc7a07e192",
          compilerTrace: {
            schemaVersion: "1",
            replayId,
            label: "Verified replay",
            modelId: "gpt-5.6-sol",
            codexVersion: "codex-cli 0.144.4",
            repositoryCommitAtRun: "4f2f647228304d63ac8b9cba8cdca1dc7a07e192",
            publicSdkDocumentationHash: "a".repeat(64),
            recordedAt: "2026-07-14T11:50:37.947Z",
            generationIsolation: {
              status: "PARTIAL",
              limitation:
                "Generation-time hidden-verifier isolation is partial.",
            },
            candidateExecutionIsolation: {
              status: "VERIFIED",
              properties: ["hidden verifier not mounted"],
            },
            trace: [
              {
                stage: "external_verifier",
                status: "VERIFIED",
                run: "verified-live-run",
                invariants: 18,
                mutationsDetected: 12,
                mutationsTotal: 12,
                resultHash: sampleResult.resultHash,
              },
            ],
          },
          result: sampleResult,
          patch: { status: "VERIFIED" },
        });
      }
      throw new Error(
        `Unexpected UI test request: ${init?.method ?? "GET"} ${path}`,
      );
    },
  );
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

const storageValues = new Map<string, string>();
const testStorage: Storage = {
  get length() {
    return storageValues.size;
  },
  clear: () => storageValues.clear(),
  getItem: (key) => storageValues.get(key) ?? null,
  key: (index) => [...storageValues.keys()][index] ?? null,
  removeItem: (key) => {
    storageValues.delete(key);
  },
  setItem: (key, value) => {
    storageValues.set(key, value);
  },
};

const sessionStorageValues = new Map<string, string>();
const testSessionStorage: Storage = {
  get length() {
    return sessionStorageValues.size;
  },
  clear: () => sessionStorageValues.clear(),
  getItem: (key) => sessionStorageValues.get(key) ?? null,
  key: (index) => [...sessionStorageValues.keys()][index] ?? null,
  removeItem: (key) => {
    sessionStorageValues.delete(key);
  },
  setItem: (key, value) => {
    sessionStorageValues.set(key, value);
  },
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: testStorage,
  });
  Object.defineProperty(window, "sessionStorage", {
    configurable: true,
    value: testSessionStorage,
  });
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  installApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openLiveSetup(user: ReturnType<typeof userEvent.setup>) {
  await user.type(
    screen.getByRole("textbox", { name: /your question or claim/i }),
    "Does this result hold in deployment?",
  );
  await user.click(screen.getByRole("button", { name: /test this claim/i }));
  await user.click(
    screen.getByRole("button", { name: /check live notebook tools/i }),
  );
}

async function openSampleModelDuel(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: /try verified sample/i }),
  );
  await screen.findByRole("heading", {
    name: /what do you think the score means/i,
  });
  await user.click(
    screen.getByRole("button", { name: /compare two explanations/i }),
  );
}

describe("CounterLab judged flow", () => {
  it("assigns distinct evidence identities to metrics from one output", () => {
    const outputHash = "d".repeat(64);
    const references = notebookEvidenceReferences(
      ArtifactManifestSchema.parse({
        ...uploadedArtifact,
        cells: [
          {
            index: 1,
            type: "code",
            sourceSha256: "b".repeat(64),
            sourceExcerpt: "accuracy and roc_auc",
            executionCount: 1,
            outputHashes: [outputHash],
            symbols: [],
            metricCandidates: [
              { name: "accuracy", value: 0.98, outputIndex: 0 },
              { name: "roc_auc", value: 0.97, outputIndex: 0 },
            ],
          },
        ],
      }),
    );

    expect(references.map(({ id }) => id)).toEqual([
      `${outputHash}-0-accuracy`,
      `${outputHash}-0-roc_auc`,
    ]);
    expect(new Set(references.map(({ id }) => id)).size).toBe(
      references.length,
    );
  });

  it("keeps Judge Mode on its own refresh-safe route", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
    });
    window.localStorage.setItem("counterlab.mode", "live");
    window.localStorage.setItem("counterlab.sessionId", "stale_session");
    window.history.replaceState({}, "", "/judge");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /see a verified belief break in ten seconds/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/judge");
    expect(
      screen.getByRole("link", { name: /inspect stored evidence/i }),
    ).toHaveAttribute("href", "/replay/leakage-01");
    expect(
      await screen.findByText(/live readiness has not been checked/i),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([path]) => String(path) === "/api/health"),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/health?readiness=probe",
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: /check live readiness/i }),
    );
    expect(
      await screen.findByRole("link", { name: /run an unprimed live test/i }),
    ).toHaveAttribute("href", "/new");
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/health?readiness=probe",
      ),
    ).toBe(true);
  });

  it("starts with a question and keeps every honest path available", async () => {
    const user = userEvent.setup();
    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: "What result are you trying to understand?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /counterlab is a belief debugger—not a tutor or notebook linter/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /attach a supported notebook.*reads the evidence and never runs its cells.*seal a prediction.*one controlled test answer—not ai prose/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /skip to main content/i }),
    ).toHaveAttribute("href", "#main-content");
    const fastPaths = screen.getByLabelText(
      /fastest ways to see counterlab work/i,
    );
    const skipLink = screen.getByRole("link", {
      name: /skip to main content/i,
    });
    skipLink.focus();
    expect(skipLink).toHaveFocus();
    await user.tab();
    expect(
      within(fastPaths).getByRole("button", {
        name: /^start verified sample/i,
      }),
    ).toHaveFocus();
    await user.tab();
    expect(
      within(fastPaths).getByRole("link", { name: /judge mode/i }),
    ).toHaveFocus();
    await user.tab();
    expect(
      screen.getByRole("textbox", { name: /your question or claim/i }),
    ).toHaveFocus();
    expect(screen.getByLabelText(/attach notebook/i)).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /try verified sample/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /^start verified sample/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /watch verified replay/i }),
    ).toBeEnabled();
    expect(
      within(fastPaths).getByRole("link", { name: /judge mode/i }),
    ).toHaveAttribute("href", "/judge");
    expect(
      screen.getByLabelText(/how the opening sequence works/i),
    ).toHaveTextContent(
      /state claim.*lock prediction.*controlled test runs.*result passes verification/i,
    );
    expect(
      screen.getByLabelText(/authority roles for a live notebook run/i),
    ).toHaveTextContent(
      /gpt-5\.6.*runtime codex.*fixed kernel.*frozen verifier/i,
    );
    expect(screen.getByText(/no account needed/i)).toBeInTheDocument();
    expect(
      document.querySelector(".landing-trust-line .landing-trust-line"),
    ).toBeNull();
    expect(
      screen.getByText(/fixed kernels calculate the result/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/reads the evidence and never runs its cells/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", {
        name: /start a counterlab investigation/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("State a claim or attach a notebook…"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Question" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /test this claim/i }),
    ).toBeDisabled();
    const lockedPreview = screen.getByLabelText(
      /fair-test preview with result locked/i,
    );
    expect(lockedPreview).toHaveTextContent(
      /familiar rows.*change who counts as new.*unseen customers/i,
    );
    expect(lockedPreview).toHaveAttribute("data-presentation", "strip");
    expect(lockedPreview).toHaveAttribute("data-result-visibility", "locked");
    expect(document.body).not.toHaveTextContent(LANDING_FIXED_SAMPLE_VALUES);
    expect(document.body).not.toHaveTextContent(PRE_PREDICTION_RESULT_LANGUAGE);
    const proofSummary = screen.getByText("Evidence & proof");
    await user.click(screen.getByRole("link", { name: /how proof works/i }));
    expect(proofSummary.closest("details")).toHaveAttribute("open");
    expect(proofSummary).toHaveFocus();

    const questionInput = screen.getByPlaceholderText(
      "State a claim or attach a notebook…",
    );
    await user.click(
      screen.getByRole("button", {
        name: /does this evaluation match how the model will be used/i,
      }),
    );
    expect(
      screen.getByRole("button", { name: /test this claim/i }),
    ).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "New question" }));
    expect(questionInput).toHaveValue("");
    expect(questionInput).toHaveFocus();
    expect(document.body).not.toHaveTextContent(
      /formalize|discriminating|canonical|mutation/i,
    );
    expect(document.body).not.toHaveTextContent(
      /teaches two machine-learning mistakes/i,
    );

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/verified sample belief-break mechanism/i),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/59\.4%/);
  });

  it("preserves a plain question and offers an honest evidence choice before notebook setup", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);

    const question = "Will this score hold for new customers?";
    await user.type(
      screen.getByRole("textbox", { name: /your question or claim/i }),
      question,
    );
    await user.click(screen.getByRole("button", { name: /test this claim/i }));

    expect(
      screen.getByRole("heading", {
        name: /start with evidence that matches your question/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /practice with leakage sample/i }),
    ).toBeEnabled();
    expect(screen.getByLabelText(/attach a supported notebook/i)).toBeEnabled();
    expect(
      fetcher.mock.calls.some(([path]) => String(path) === "/api/health"),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: /practice with leakage sample/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/your claim/i)).not.toBeInTheDocument();
    expect(screen.getByText(SAMPLE_LEAKAGE_QUESTION)).toBeInTheDocument();
    expect(screen.getByLabelText(/saved original question/i)).toHaveTextContent(
      question,
    );
    expect(window.localStorage.getItem("counterlab.sampleOriginQuestion")).toBe(
      question,
    );
    expect(
      window.localStorage.getItem("counterlab.sampleOriginSessionId"),
    ).toBe("session_ui");
    expect(
      screen.getByText(/does not analyze or sign a custom claim/i),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );
    expect(
      await screen.findByText(
        "Does the notebook's random-row accuracy generalize to completely new customers?",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/pre-authored for this fixed sample/i),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/saved original question/i)).toHaveTextContent(
      /does not claim to answer or sign your original question/i,
    );
    expect(screen.getByText(question)).toBeInTheDocument();
  });

  it("does not attribute an origin question to a different sample session", async () => {
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.sampleOriginQuestion",
      "Will an older score hold for another population?",
    );
    window.localStorage.setItem(
      "counterlab.sampleOriginSessionId",
      "different-session",
    );
    installApi({
      restoredSessionState: "INGESTED",
      restoredSessionExtra: {
        mode: { kind: "sample_lesson", sampleId: "leakage-01" },
      },
    });

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/saved original question/i),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      "Will an older score hold for another population?",
    );
  });

  it("checks exact live readiness before the evidence chooser sends a notebook", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);

    await user.type(
      screen.getByRole("textbox", { name: /your question or claim/i }),
      "Will this score hold for new customers?",
    );
    await user.click(screen.getByRole("button", { name: /test this claim/i }));
    await user.upload(
      screen.getByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(
        ([path]) => String(path) === "/api/health?readiness=probe",
      ),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.some(([path]) => String(path) === "/api/artifacts"),
    ).toBe(false);
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/live/sessions",
      ),
    ).toBe(false);
  });

  it("uploads from the evidence chooser only after exact live readiness passes", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await user.type(
      screen.getByRole("textbox", { name: /your question or claim/i }),
      "Will this score hold for new customers?",
    );
    await user.click(screen.getByRole("button", { name: /test this claim/i }));
    await user.upload(
      screen.getByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    const requestedPaths = fetcher.mock.calls.map(([path]) => String(path));
    expect(requestedPaths.indexOf("/api/health?readiness=probe")).toBeLessThan(
      requestedPaths.indexOf("/api/artifacts"),
    );
    expect(requestedPaths.indexOf("/api/artifacts")).toBeLessThan(
      requestedPaths.indexOf("/api/live/sessions"),
    );
  });

  it("restores a saved question on the refresh-safe new investigation route", async () => {
    const question = "Does this result generalize beyond familiar rows?";
    window.localStorage.setItem("counterlab.claim", question);
    window.history.replaceState({}, "", "/new");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /start with evidence that matches your question/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(question)).toBeInTheDocument();
    expect(window.location.pathname).toBe("/new");
  });

  it("closes the compact entry menu with Escape and restores focus", async () => {
    const user = userEvent.setup();
    render(<App />);

    const toggle = screen.getByRole("button", { name: "Modes" });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveFocus();
  });

  it("does not end live notebook analysis at a local boundary when the hosted runner is configured", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await openLiveSetup(user);

    expect(
      await screen.findByText(/hosted notebook runner is ready/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/local runner required/i);
  });

  it("keeps live notebook upload disabled when generation read isolation is partial", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      generationIsolation: "PARTIAL",
    });
    render(<App />);

    await openLiveSetup(user);

    expect(
      await screen.findByText(/qualified hosted runner is needed/i),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(
      /generation filesystem read isolation is partial.*not accepted as live authority/i,
    );
    expect(
      screen.queryByLabelText(/attach a supported notebook/i),
    ).not.toBeInTheDocument();
  });

  it("does not continue live setup until a supported notebook has been uploaded", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await openLiveSetup(user);

    expect(
      await screen.findByText(/hosted notebook runner is ready/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /continue with my notebook/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText(/attach a supported notebook/i)).toBeEnabled();
    expect(document.body).not.toHaveTextContent(/preparing artifact/i);
    expect(
      fetcher.mock.calls.some(([path]) => String(path) === "/api/artifacts"),
    ).toBe(false);
  });

  it("keeps malformed notebook intake on the upload surface", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      uploadOutcomes: ["malformed"],
    });
    render(<App />);
    await openLiveSetup(user);

    await user.upload(
      screen.getByLabelText(/attach a supported notebook/i),
      new File(["not-json"], "broken.ipynb", {
        type: "application/json",
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be parsed safely/i,
    );
    expect(
      screen.getByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/attach a supported notebook/i)).toBeEnabled();
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/live/sessions",
      ),
    ).toBe(false);
  });

  it("shows an unsupported notebook refusal without creating a live session", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      uploadOutcomes: ["unsupported"],
    });
    render(<App />);
    await openLiveSetup(user);

    await user.upload(
      screen.getByLabelText(/attach a supported notebook/i),
      new File(["{}"], unsupportedArtifact.fileName, {
        type: "application/json",
      }),
    );

    expect(
      (
        await screen.findAllByText(
          /outside the released notebook support boundary/i,
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(unsupportedArtifact.fileName)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /compare two explanations/i }),
    ).toBeDisabled();
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/live/sessions",
      ),
    ).toBe(false);
  });

  it("retries the same file after an interrupted upload", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      uploadOutcomes: ["interrupted", "supported"],
    });
    render(<App />);
    await openLiveSetup(user);
    const file = new File(["{}"], uploadedArtifact.fileName, {
      type: "application/json",
    });
    const input = await screen.findByLabelText(/attach a supported notebook/i);

    await user.upload(input, file);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the api/i,
    );
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      file,
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([path]) => String(path) === "/api/artifacts"),
    ).toHaveLength(2);
  });

  it("retries private session setup without uploading the notebook again", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      liveSessionFailures: 1,
    });
    render(<App />);
    await openLiveSetup(user);

    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    expect(
      await screen.findByRole("button", {
        name: /retry private session setup/i,
      }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: /retry private session setup/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([path]) => String(path) === "/api/artifacts"),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.filter(
        ([path]) => String(path) === "/api/live/sessions",
      ),
    ).toHaveLength(2);
  });

  it("keeps pending live evidence under its live label when replay loading fails", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      liveSessionFailures: 1,
      replayFailure: true,
    });
    render(<App />);
    await openLiveSetup(user);
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    await screen.findByRole("button", { name: /retry private session setup/i });
    expect(document.body).toHaveTextContent(uploadedArtifact.fileName);
    await user.click(
      screen.getByRole("button", { name: /watch the verified replay/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the api/i,
    );
    expect(
      screen.getByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(uploadedArtifact.fileName);
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    expect(screen.getByText("Uploaded notebook")).toBeInTheDocument();
    expect(screen.queryByText("Replay artifact")).toBeNull();
  });

  it("accepts a notebook from the question-first landing without running it", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await user.upload(
      screen.getByLabelText(/attach notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path) === "/api/artifacts" && init?.method === "POST",
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/lab/run")),
    ).toBe(false);
  });

  it("tells the notebook evidence story with exact references", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );

    const story = within(
      await screen.findByRole("region", {
        name: /what this notebook actually shows/i,
      }),
    );
    const exactReferences = within(
      story.getByRole("list", { name: /exact evidence references/i }),
    );
    expect(exactReferences.getByText("Cell 3 · output 0")).toBeInTheDocument();
    expect(exactReferences.getByText("Cell 3 · source")).toBeInTheDocument();
    expect(story.getByText(/score shown in the notebook/i)).toBeInTheDocument();
    await user.click(story.getByText(/full evidence and integrity/i));
    expect(story.getByText(/sha-256/i)).toBeInTheDocument();
  });

  it("installs the sample session route before exposing the Question stage", async () => {
    const user = userEvent.setup();
    const originalPushState = window.history.pushState.bind(window.history);
    const questionVisibilityAtSessionActivation: boolean[] = [];
    const pushStateSpy = vi
      .spyOn(window.history, "pushState")
      .mockImplementation((data, unused, url) => {
        if (String(url).startsWith("/session/")) {
          questionVisibilityAtSessionActivation.push(
            screen.queryByRole("heading", {
              name: /what do you think the score means/i,
            }) !== null,
          );
        }
        originalPushState(data, unused, url);
      });

    try {
      render(<App />);
      await user.click(
        screen.getByRole("button", { name: /try verified sample/i }),
      );

      expect(
        await screen.findByRole("heading", {
          name: /what do you think the score means/i,
        }),
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe("/session/session_ui");
      expect(questionVisibilityAtSessionActivation).toEqual([false]);
    } finally {
      pushStateSpy.mockRestore();
    }
  });

  it("opens one deterministic stage hint and records only its fixed identity", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );
    await user.click(await screen.findByText("Need a hint?"));

    expect(
      screen.getByText(/name the result, who or what it should apply to/i),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      const request = fetcher.mock.calls.find(
        ([path, init]) =>
          String(path).endsWith("/interactions") &&
          String(init?.body).includes('"kind":"hint.opened"'),
      );
      expect(request).toBeDefined();
      const body = JSON.parse(String(request?.[1]?.body)) as Record<
        string,
        unknown
      >;
      expect(body).toMatchObject({
        schemaVersion: "1",
        kind: "hint.opened",
        stage: "question",
        hintId: "shared.question",
      });
      expect(Object.keys(body).sort()).toEqual(
        ["eventId", "hintId", "kind", "schemaVersion", "stage"].sort(),
      );
    });
  });

  it("shows an honest unavailable state when live reasoning is not configured", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "server-key-required" });
    render(<App />);

    await openLiveSetup(user);

    expect(
      await screen.findByRole("heading", { name: "Test my notebook" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/live notebook lessons are not set up/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/nothing was sent/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/OPENAI|GPT-|https?:\/\//i);
  });

  it("requires approval for a sensitive-looking sanitized preview", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      preview: sensitiveLivePreview,
    });
    render(<App />);

    await openLiveSetup(user);
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    const liveClaim = screen.getByLabelText(/your claim/i);
    await user.clear(liveClaim);
    await user.type(
      liveClaim,
      "The notebook accuracy proves generalization to new customers.",
    );
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );

    const sendButton = await screen.findByRole("button", {
      name: /send this evidence/i,
    });
    expect(sendButton).toBeDisabled();
    expect(
      screen.getByText(/automated redaction can miss identifiers/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("checkbox", {
        name: /reviewed the exact redacted packet/i,
      }),
    );
    expect(sendButton).toBeEnabled();
  });

  it("starts a configured live notebook and completes the hosted artifact-specific lab", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await openLiveSetup(user);
    expect(
      await screen.findByText(/notebook lesson tools are ready to try/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/hosted notebook runner is ready/i),
    ).toBeInTheDocument();
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    expect(
      (await screen.findAllByText(uploadedArtifact.fileName)).length,
    ).toBeGreaterThan(0);
    const liveClaim = screen.getByLabelText(/your claim/i);
    await user.clear(liveClaim);
    await user.type(
      liveClaim,
      "The notebook accuracy proves generalization to new customers.",
    );
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /review the evidence sent for analysis/i,
      }),
    ).toBeInTheDocument();
    const packetSummary = screen.getByRole("complementary", {
      name: /privacy packet summary/i,
    });
    expect(within(packetSummary).getByText(/your claim/i)).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/short notebook excerpts/i),
    ).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/non-sensitive schema names and roles/i),
    ).toBeInTheDocument();
    expect(within(packetSummary).getByText(/no raw rows/i)).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/no notebook file/i),
    ).toBeInTheDocument();
    expect(
      within(packetSummary).getByText(/no local paths/i),
    ).toBeInTheDocument();
    await user.click(within(packetSummary).getByText(/review exact packet/i));
    expect(screen.getByText(/train_test_split/)).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).endsWith("/belief-test"),
      ),
    ).toBe(false);
    await user.click(
      screen.getByRole("button", { name: /send this evidence/i }),
    );

    expect(
      await screen.findByRole("region", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(liveBeliefTest.competingHypothesis.statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/the claim targets unseen customers/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/customer_id identifies the evaluation boundary/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /show me what happened/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /see the verified test as a bounded scene/i,
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/local runner required/i);
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).endsWith("/lab/compile"),
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/lab/run")),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path) === "/api/live/sessions" &&
          String(init?.body).includes(uploadedArtifact.artifactId),
      ),
    ).toBe(true);
  });

  it("requires verified Boundary authority before a live learner can revise", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: { verifiedResult: liveResult },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /compare the verified result/i,
      }),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-trusted-visual-id="verified_sample_belief_break_v1"]',
      ),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /apply/i })).toBeDisabled();
    const boundaryTab = screen.getByRole("tab", { name: /boundary/i });
    expect(boundaryTab).toBeDisabled();
    await user.type(
      screen.getByRole("textbox", { name: /what do you notice/i }),
      "The evaluation result changes across the deployment boundary.",
    );
    expect(boundaryTab).toBeEnabled();
    await user.click(boundaryTab);
    expect(
      await screen.findByRole("button", { name: /map the boundary/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText(/your revised mental model/i),
    ).not.toBeInTheDocument();
  });

  it("withholds a restored result that has no immutable Prediction", async () => {
    installApi({
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: { verifiedResult: liveResult },
      omitRestoredPrediction: true,
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /this session could not be loaded/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /compare the verified result/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/98\.5%|59\.4%/i);
  });

  it("reviews a completed stage and restores focus to canonical progress", async () => {
    const user = userEvent.setup();
    installApi({
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: { verifiedResult: liveResult },
    });
    window.history.replaceState({}, "", "/session/session_ui");
    render(<App />);

    const desktopProgress = within(
      await screen.findByTestId("learner-progress-desktop"),
    );
    await user.click(
      desktopProgress.getByRole("button", { name: /review test/i }),
    );
    const reviewTitle = await screen.findByRole("heading", {
      name: /review the fair test/i,
    });
    expect(reviewTitle).toHaveFocus();
    expect(screen.getByText("Verified Test")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Verified Lab");

    await user.click(
      screen.getByRole("button", { name: /return to current step/i }),
    );
    await vi.waitFor(() =>
      expect(document.getElementById("learner-progress")).toHaveFocus(),
    );
  });

  it("restores focus when reviewing a completed imbalance stage", async () => {
    const user = userEvent.setup();
    installApi({
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: {
        beliefSpec: liveImbalanceBeliefSpec,
        prediction: committedImbalancePrediction,
        verifiedResult: verifiedImbalanceResult,
        evidenceVerdict: supportingImbalanceEvidenceVerdict,
        epistemicReportHash,
      },
    });
    window.history.replaceState({}, "", "/session/session_ui");
    render(<App />);

    const desktopProgress = within(
      await screen.findByTestId("learner-progress-desktop"),
    );
    await user.click(
      desktopProgress.getByRole("button", { name: /review test/i }),
    );
    const reviewTitle = await screen.findByRole("heading", {
      name: /review the rare-event test/i,
    });
    await vi.waitFor(() => expect(reviewTitle).toHaveFocus());
    expect(screen.getByText("Verified Test")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Verified Lab");
  });

  it("keeps the two models equal and lets the learner edit their meaning", async () => {
    const user = userEvent.setup();
    render(<App />);
    await openSampleModelDuel(user);

    const duel = await screen.findByRole("region", {
      name: /does your current explanation capture what you mean/i,
    });
    expect(
      within(duel).getByRole("article", {
        name: /your current explanation/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(duel).getByRole("article", {
        name: /alternative counterlab will test/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /edit my explanation/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/your claim/i)).not.toBeInTheDocument();
    expect(screen.getByText(SAMPLE_LEAKAGE_QUESTION)).toBeInTheDocument();
  });

  it("records not-enough-evidence without sealing a prediction", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);
    await openSampleModelDuel(user);

    await user.click(screen.getByText(/more ways to respond/i));
    await user.click(
      screen.getByRole("button", { name: /not enough evidence/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    const responseRequest = fetcher.mock.calls.find(
      ([path, init]) =>
        String(path).endsWith("/belief-test/confirm") &&
        String(init?.body).includes("insufficient_evidence"),
    );
    expect(responseRequest).toBeDefined();
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/prediction")),
    ).toBe(false);
  });

  it.each([
    ["not enough evidence", "insufficient_evidence"],
    ["reject", "reject"],
  ])(
    "recovers from %s in a fresh session while preserving the claim",
    async (buttonName, action) => {
      const user = userEvent.setup();
      const fetcher = installApi();
      render(<App />);
      await openSampleModelDuel(user);

      if (action === "insufficient_evidence") {
        await user.click(screen.getByText(/more ways to respond/i));
      }
      await user.click(
        screen.getByRole("button", { name: new RegExp(buttonName, "i") }),
      );

      expect(
        await screen.findByRole("button", {
          name: /revise in a new investigation/i,
        }),
      ).toBeEnabled();
      expect(screen.queryByLabelText(/your claim/i)).not.toBeInTheDocument();
      expect(screen.getByText(SAMPLE_LEAKAGE_QUESTION)).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(
        /INSUFFICIENT_EVIDENCE|REJECTED_BY_LEARNER/,
      );

      await user.click(
        screen.getByRole("button", {
          name: /revise in a new investigation/i,
        }),
      );
      await user.click(
        screen.getByRole("button", { name: /compare two explanations/i }),
      );

      const restartRequests = fetcher.mock.calls.filter(([path]) =>
        String(path).endsWith("/restart"),
      );
      expect(restartRequests).toHaveLength(1);
      expect(
        fetcher.mock.calls.some(
          ([path]) =>
            String(path) === `/api/sessions/${restartedSessionId}/belief-test`,
        ),
      ).toBe(true);
      const responseRequests = fetcher.mock.calls.filter(
        ([path, init]) =>
          String(path).endsWith("/belief-test/confirm") &&
          String(init?.body).includes(`\"action\":\"${action}\"`),
      );
      expect(responseRequests).toHaveLength(1);
      const responseBody = String(responseRequests[0]?.[1]?.body ?? "");
      expect(responseBody).not.toContain("Belief Test");
      if (action === "reject") {
        expect(responseBody).toContain(
          "Learner chose not to confirm the proposed explanation.",
        );
      }

      await user.click(
        await screen.findByRole("button", {
          name: /yes, this captures my view/i,
        }),
      );
      await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
      await user.click(
        screen.getByRole("button", { name: /seal my prediction/i }),
      );

      expect(
        await screen.findByRole("region", { name: /sealed prediction/i }),
      ).toBeInTheDocument();
      await vi.waitFor(() =>
        expect(
          fetcher.mock.calls.map(([path]) => String(path)),
          fetcher.mock.calls.map(([path]) => String(path)).join("\n"),
        ).toContain(`/api/sessions/${restartedSessionId}/prediction`),
      );
    },
  );

  it("restores a terminal learner response as a recoverable claim without raw state names", async () => {
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.claim",
      "The high score means the model will work for new customers.",
    );
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    installApi({
      restoredSessionState: "REJECTED_BY_LEARNER",
      restoredSessionExtra: { beliefSpec: liveBeliefSpec },
    });

    render(<App />);

    expect(
      await screen.findByRole("button", {
        name: /revise in a new investigation/i,
      }),
    ).toBeEnabled();
    expect(screen.getByLabelText(/your claim/i)).toHaveValue(
      liveBeliefSpec.claim,
    );
    expect(document.body).not.toHaveTextContent(
      /INSUFFICIENT_EVIDENCE|REJECTED_BY_LEARNER/,
    );
  });

  it("hydrates an already-progressed revision returned by restart reconciliation", async () => {
    const user = userEvent.setup();
    const progressedClaim =
      "The revised claim is limited to performance on entirely new customers.";
    const progressedBeliefSpec = {
      ...liveBeliefSpec,
      claim: progressedClaim,
    };
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.claim", liveBeliefSpec.claim);
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    installApi({
      restoredSessionState: "REJECTED_BY_LEARNER",
      restoredSessionExtra: { beliefSpec: liveBeliefSpec },
      restartSessionState: "BELIEF_TEST_PROPOSED",
      restartSessionExtra: { beliefSpec: progressedBeliefSpec },
    });

    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: /revise in a new investigation/i,
      }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/your claim/i)).not.toBeInTheDocument();
    expect(screen.getByText(progressedClaim)).toBeInTheDocument();
    expect(window.localStorage.getItem("counterlab.claim")).toBe(
      progressedClaim,
    );
    expect(window.localStorage.getItem("counterlab.claimSessionId")).toBe(
      restartedSessionId,
    );
    expect(window.location.pathname).toBe(`/session/${restartedSessionId}`);
  });

  it("withholds adversarial live explanation prose before Prediction", async () => {
    const maliciousBeliefSpec = {
      ...liveBeliefSpec,
      hypotheses: [
        liveBeliefSpec.hypotheses[0],
        {
          ...liveBeliefSpec.hypotheses[1],
          statement:
            "The verified result supports this hypothesis at 59.4%; the fix is to remove customer_id.",
        },
      ],
    };
    installApi({
      restoredSessionState: "BELIEF_TEST_PROPOSED",
      restoredSessionExtra: { beliefSpec: maliciousBeliefSpec },
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /refused unsafe pre-result wording/i,
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(liveBeliefSpec.claim);
    expect(document.body).not.toHaveTextContent(
      /59\.4%|supports this hypothesis|remove customer_id/i,
    );
    expect(
      screen.queryByRole("button", { name: /yes, this captures my view/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /start a fresh investigation/i }),
    ).toBeEnabled();
  });

  it("withholds adversarial historical v1 prose before Prediction", async () => {
    const historicalLearnerClaim =
      "Does this familiar-row notebook score extend to unseen accounts?";
    const maliciousBeliefTest = {
      ...liveBeliefTest,
      learnerClaim: historicalLearnerClaim,
      currentHypothesis: {
        ...liveBeliefTest.currentHypothesis,
        predictedOutcome:
          "The verified result is 59.4%; the fix is to remove customer_id.",
      },
    };
    installApi({
      restoredSessionState: "BELIEF_TEST_PROPOSED",
      restoredSessionExtra: {
        beliefTest: maliciousBeliefTest,
        beliefSpec: undefined,
      },
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /refused unsafe pre-result wording/i,
      }),
    ).toBeInTheDocument();
    expect(document.body).toHaveTextContent(historicalLearnerClaim);
    expect(document.body).not.toHaveTextContent(
      /59\.4%|verified result|remove customer_id/i,
    );
    expect(
      screen.queryByRole("button", { name: /yes, this captures my view/i }),
    ).not.toBeInTheDocument();
  });

  it("renders the exact reviewed Belief Spec before Prediction", async () => {
    const modelAuthoredSentinel = "A bespoke analyst phrase for cohort omega.";
    const proposed = {
      ...liveBeliefSpec,
      hypotheses: [
        {
          ...liveBeliefSpec.hypotheses[0],
          statement: modelAuthoredSentinel,
          conditions: ["Bespoke analyst condition omega."],
          nonClaims: ["Bespoke analyst limitation omega."],
        },
        liveBeliefSpec.hypotheses[1],
      ],
      alternatives: [
        {
          ...liveBeliefSpec.alternatives[0],
          rationale: "Bespoke analyst alternative omega.",
        },
      ],
    };
    installApi({
      restoredSessionState: "BELIEF_TEST_PROPOSED",
      restoredSessionExtra: { beliefSpec: proposed },
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(modelAuthoredSentinel)).toBeInTheDocument();
    expect(
      screen.getByText("Bespoke analyst condition omega."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Bespoke analyst limitation omega."),
    ).toHaveLength(2);
    expect(screen.getAllByText("AI-suggested draft")).toHaveLength(2);
    expect(
      screen.getByText("Bespoke analyst alternative omega."),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /The model learned a useful pattern that will work for new customers/i,
    );
  });

  it("keeps optional Director setup from surviving Belief Spec confirmation", async () => {
    const user = userEvent.setup();
    installApi({
      restoredSessionState: "BELIEF_TEST_PROPOSED",
      restoredSessionExtra: {
        beliefSpec: liveBeliefSpec,
        learningDirector: {
          schemaVersion: "1",
          beliefSpecHash: "a".repeat(64),
          approvedPacketHash: "b".repeat(64),
          subjectPackVersion: "2.1.0",
          clarificationUsed: true,
          decision: {
            status: "CLARIFICATION_REQUIRED",
            questionId: "learning-emphasis",
            choices: ["controls-first", "boundary-first"],
          },
          provenance: {
            modelId: "gpt-5.6",
            promptHash: "c".repeat(64),
            turns: 1,
            toolTrace: [
              {
                toolName: "get_subject_pack_capabilities",
                argsHash: "d".repeat(64),
                outputHash: "e".repeat(64),
                durationMs: 1,
              },
            ],
          },
        },
      },
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /which part should the introduction foreground/i,
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /seal what you expect before the result appears/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /which part should the introduction foreground/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("shows a neutral question prompt before notebook concept routing", async () => {
    const user = userEvent.setup();
    installApi({ liveGpt: "configured", runner: "configured" });
    render(<App />);

    await openLiveSetup(user);
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );

    expect(
      await screen.findByText(
        /write one bounded claim about what the reported result supports/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/because the notebook reported this result/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /completely new customers|rare fraud|minority class/i,
    );
  });

  it.each([
    ["rejected", "REJECTED_BY_LEARNER"],
    ["insufficient", "INSUFFICIENT_EVIDENCE"],
  ] as const)(
    "keeps a learner-authored live claim through %s restart, reload, back, and forward",
    async (_response, terminalState) => {
      const user = userEvent.setup();
      const learnerClaim =
        "My familiar-row score should hold when entirely new customers arrive.";
      const learnerBeliefTest = { ...liveBeliefTest, learnerClaim };
      const learnerBeliefSpec = {
        ...migrateBeliefTestV1ToV2(learnerBeliefTest),
        learnerDecision:
          terminalState === "REJECTED_BY_LEARNER"
            ? ("REJECTED" as const)
            : ("UNDECIDED" as const),
        ...(terminalState === "INSUFFICIENT_EVIDENCE"
          ? { supportState: "INSUFFICIENT_EVIDENCE" as const }
          : {}),
      };
      window.localStorage.setItem("counterlab.sessionId", "session_ui");
      window.localStorage.setItem("counterlab.claim", learnerClaim);
      window.localStorage.setItem("counterlab.claimSessionId", "session_ui");
      window.localStorage.setItem("counterlab.mode", "live");
      window.history.replaceState({}, "", "/session/session_ui");
      const fetcher = installApi({
        beliefTest: learnerBeliefTest,
        restoredSessionState: terminalState,
        restoredSessionExtra: { beliefSpec: learnerBeliefSpec },
      });

      const mounted = render(<App />);
      expect(
        await screen.findByRole("button", {
          name: /revise in a new investigation/i,
        }),
      ).toBeEnabled();
      expect(screen.getByLabelText(/your claim/i)).toHaveValue(learnerClaim);

      await user.click(
        screen.getByRole("button", {
          name: /revise in a new investigation/i,
        }),
      );
      await vi.waitFor(() =>
        expect(window.location.pathname).toBe(`/session/${restartedSessionId}`),
      );
      expect(window.localStorage.getItem("counterlab.sessionId")).toBe(
        restartedSessionId,
      );
      expect(window.localStorage.getItem("counterlab.claimSessionId")).toBe(
        restartedSessionId,
      );
      expect(window.localStorage.getItem("counterlab.claim")).toBe(
        learnerClaim,
      );

      mounted.unmount();
      render(<App />);
      expect(await screen.findByLabelText(/your claim/i)).toHaveValue(
        learnerClaim,
      );

      await act(async () => window.history.back());
      await vi.waitFor(() =>
        expect(window.location.pathname).toBe("/session/session_ui"),
      );
      expect(
        await screen.findByRole("button", {
          name: /revise in a new investigation/i,
        }),
      ).toBeEnabled();
      expect(screen.getByLabelText(/your claim/i)).toHaveValue(learnerClaim);

      await act(async () => window.history.forward());
      await vi.waitFor(() =>
        expect(window.location.pathname).toBe(`/session/${restartedSessionId}`),
      );
      expect(await screen.findByLabelText(/your claim/i)).toHaveValue(
        learnerClaim,
      );

      await user.click(
        screen.getByRole("button", { name: /compare two explanations/i }),
      );
      await user.click(
        await screen.findByRole("button", { name: /send this evidence/i }),
      );
      const proposal = fetcher.mock.calls.find(
        ([path]) =>
          String(path) === `/api/sessions/${restartedSessionId}/belief-test`,
      );
      expect(proposal).toBeDefined();
      expect(JSON.parse(String(proposal?.[1]?.body))).toMatchObject({
        learnerClaim,
      });
      expect(
        await screen.findByRole("heading", {
          name: /does your current explanation capture what you mean/i,
        }),
      ).toBeInTheDocument();
      expect(document.body).not.toHaveTextContent(
        /INSUFFICIENT_EVIDENCE|REJECTED_BY_LEARNER/,
      );
    },
  );

  it("keeps the first failed live request provider-neutral and on the claim screen", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      rejectLiveBelief: true,
    });
    render(<App />);

    await openLiveSetup(user);
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/json",
      }),
    );
    const rejectedClaim = await screen.findByLabelText(/your claim/i);
    await user.clear(rejectedClaim);
    await user.type(
      rejectedClaim,
      "The notebook accuracy proves generalization to new customers.",
    );
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /send this evidence/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /live reasoning is unavailable/i,
    );
    expect(
      screen.getByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /Responses endpoint|OpenAI|GPT-/i,
    );
  });

  it("restores an active live compile and lets the learner cancel it safely", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJobId",
      liveRunnerJob.jobId,
    );
    window.localStorage.setItem(
      "counterlab.activeRunnerJobKind",
      liveRunnerJob.kind,
    );

    render(<App />);
    const planningPhase = (
      await screen.findByText(/Generated planning · In progress/i)
    ).closest("li");
    expect(planningPhase).toHaveAttribute("data-state", "active");
    expect(screen.getByText(/Fixed testing · Waiting/i)).toBeInTheDocument();
    expect(screen.getByText(/Verified result · Waiting/i)).toBeInTheDocument();
    await user.click(
      await screen.findByRole("button", { name: /cancel this test/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /runner stopped safely/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/cancelled this test before it could release a result/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Generated planning · Stopped safely/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    expect(screen.getByRole("button", { name: /new analysis/i })).toBeEnabled();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path).endsWith("/jobs/runner_job_ui/cancel") &&
          init?.method === "POST",
      ),
    ).toBe(true);
  });

  it("ignores a late cancel response after browser navigation", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    const cancellationResponse = await normalFetch(
      "/api/sessions/session_ui/jobs/runner_job_ui/cancel",
      { method: "POST" },
    );
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input).endsWith("/jobs/runner_job_ui/cancel")
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJobId",
      liveRunnerJob.jobId,
    );
    window.localStorage.setItem(
      "counterlab.activeRunnerJobKind",
      liveRunnerJob.kind,
    );

    render(<App />);
    await user.click(
      await screen.findByRole("button", { name: /cancel this test/i }),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(([path]) =>
          String(path).endsWith("/jobs/runner_job_ui/cancel"),
        ),
      ).toBe(true),
    );

    act(() => {
      window.history.pushState({}, "", "/judge");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByRole("heading", {
      name: /see a verified belief break in ten seconds/i,
    });
    await act(async () => {
      pending.resolve(cancellationResponse);
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/judge");
    expect(document.body).not.toHaveTextContent(
      /You cancelled this test before it could release a result/i,
    );
  });

  it("confirms Start over, cancels every registered live job, and then returns home", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );

    render(<App />);
    await screen.findByRole("button", { name: /cancel this test/i });
    await user.click(screen.getByRole("button", { name: /^start over$/i }));

    expect(
      screen.getByRole("heading", { name: /stop live work and start over/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(liveRunnerJob.jobId)).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(
        ([path, init]) =>
          String(path).endsWith("/jobs/runner_job_ui/cancel") &&
          init?.method === "POST",
      ),
    ).toHaveLength(1);
    expect(
      window.sessionStorage.getItem(activeRunnerRegistryKey("session_ui")),
    ).toBeNull();
    expect(window.location.pathname).toBe("/");
  });

  it("does not let a late Start over cancellation replace a newer route", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    const cancellationResponse = await normalFetch(
      "/api/sessions/session_ui/jobs/runner_job_ui/cancel",
      { method: "POST" },
    );
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input).endsWith("/jobs/runner_job_ui/cancel")
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );

    render(<App />);
    await screen.findByRole("button", { name: /cancel this test/i });
    await user.click(screen.getByRole("button", { name: /^start over$/i }));
    await user.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(([path]) =>
          String(path).endsWith("/jobs/runner_job_ui/cancel"),
        ),
      ).toBe(true),
    );

    act(() => {
      window.history.pushState({}, "", "/judge");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByRole("heading", {
      name: /see a verified belief break in ten seconds/i,
    });
    await act(async () => {
      pending.resolve(cancellationResponse);
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/judge");
    expect(
      screen.getByRole("heading", {
        name: /see a verified belief break in ten seconds/i,
      }),
    ).toBeInTheDocument();
  });

  it("keeps an unreachable live job registered when Start over detaches offline", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
      cancelOffline: true,
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );

    render(<App />);
    await screen.findByRole("button", { name: /cancel this test/i });
    await user.click(screen.getByRole("button", { name: /^start over$/i }));
    await user.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not confirm cancellation for 1 live job/i,
    );
    expect(
      window.sessionStorage.getItem(activeRunnerRegistryKey("session_ui")),
    ).not.toBeNull();
    expect(window.localStorage.getItem("counterlab.sessionId")).toBe(
      "session_ui",
    );
    expect(
      window.localStorage.getItem("counterlab.activeRunnerJob.session_ui"),
    ).not.toBeNull();
  });

  it("reacquires an idempotent compile job when refresh lost the local job checkpoint", async () => {
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    const view = render(<App />);

    expect(
      await screen.findByRole("button", { name: /cancel this test/i }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path).endsWith("/sessions/session_ui/lab/compile") &&
          init?.method === "POST",
      ),
    ).toBe(true);
    expect(window.localStorage.getItem("counterlab.activeRunnerJobId")).toBe(
      liveRunnerJob.jobId,
    );

    view.unmount();
  });

  it("reacquires an unacknowledged fixed run after refresh", async () => {
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      restoredSessionState: "LAB_VERIFIED",
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: "runner_job_ui",
        kind: "LAB_RUN",
      }),
    );

    render(<App />);

    await vi.waitFor(
      () =>
        expect(
          fetcher.mock.calls.some(
            ([path, init]) =>
              String(path).endsWith("/sessions/session_ui/lab/run") &&
              init?.method === "POST",
          ),
        ).toBe(true),
      { timeout: 750 },
    );
    expect(
      await screen.findByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
  });

  it("hydrates a private session route without flashing the landing page", async () => {
    installApi({ restoredSessionState: "INGESTED" });
    window.history.pushState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      screen.getByRole("heading", { name: /opening this investigation/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).not.toBeInTheDocument();

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/live notebook analysis/i)).toBeInTheDocument();
  });

  it("hydrates the new-analysis route without flashing the landing page", async () => {
    installApi();
    window.history.pushState({}, "", "/new");

    render(<App />);

    expect(
      screen.queryByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    await screen.findByText(/live notebook lessons are not set up/i);
  });

  it("clears private session state before opening a new analysis", async () => {
    const user = userEvent.setup();
    installApi({ restoredSessionState: "INGESTED" });
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem("counterlab.sessionId", "session_ui");

    render(<App />);
    await screen.findByRole("heading", {
      name: /what do you think the score means/i,
    });
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    await user.click(screen.getByRole("button", { name: /new analysis/i }));

    expect(
      await screen.findByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    await screen.findByText(/live notebook lessons are not set up/i);
    expect(window.location.pathname).toBe("/new");
    expect(window.localStorage.getItem("counterlab.sessionId")).toBeNull();
    expect(document.body).not.toHaveTextContent(uploadedArtifact.fileName);
  });

  it("continues to a new analysis after cancelling registered live work", async () => {
    const user = userEvent.setup();
    installApi({ restoredSessionState: "INGESTED" });
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );

    render(<App />);
    await screen.findByRole("heading", {
      name: /what do you think the score means/i,
    });
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    await user.click(screen.getByRole("button", { name: /new analysis/i }));
    expect(
      screen.getByRole("heading", { name: /stop live work and start over/i }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    await screen.findByText(/live notebook lessons are not set up/i);
    expect(window.location.pathname).toBe("/new");
  });

  it("detaches private UI but retains active-job recovery when history returns home", async () => {
    installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );

    render(<App />);
    await screen.findByRole("button", { name: /cancel this test/i });
    await act(async () => undefined);
    await act(async () => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(
      await screen.findByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /live test is still registered/i,
    );
    expect(document.body).not.toHaveTextContent(uploadedArtifact.fileName);
    expect(
      window.localStorage.getItem("counterlab.activeRunnerJob.session_ui"),
    ).not.toBeNull();
  });

  it("does not enter a new analysis when browser history leaves an active job", async () => {
    installApi({
      liveGpt: "configured",
      runner: "configured",
      stallRunner: true,
    });
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );

    render(<App />);
    await screen.findByRole("button", { name: /cancel this test/i });
    await act(async () => {
      window.history.pushState({}, "", "/new");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(
      await screen.findByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /live test is still registered/i,
    );
    expect(window.location.pathname).toBe("/");
    expect(
      screen.queryByRole("heading", { name: /test my notebook/i }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("counterlab.activeRunnerJob.session_ui"),
    ).not.toBeNull();
  });

  it("requires active-job cancellation before opening another recent session", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      restoredSessionState: "INGESTED",
    });
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );
    window.localStorage.setItem(
      "counterlab.recentProjects.v1",
      JSON.stringify([
        {
          sessionId: "session_revision",
          artifactId: uploadedArtifact.artifactId,
          fileName: "older-notebook.ipynb",
          mode: "live",
          state: "INGESTED",
          updatedAt: "2026-07-20T09:00:00.000Z",
        },
      ]),
    );

    render(<App />);
    await screen.findByRole("heading", {
      name: /what do you think the score means/i,
    });
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /older-notebook\.ipynb/i }),
    );

    expect(
      screen.getByRole("heading", { name: /stop live work and start over/i }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/session/session_ui");
    await user.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );

    await vi.waitFor(() =>
      expect(window.location.pathname).toBe("/session/session_revision"),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([path]) => String(path) === "/api/sessions/session_revision",
        ),
      ).toBe(true),
    );
    expect(
      screen.queryByRole("heading", { name: /stop live work and start over/i }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("counterlab.activeRunnerJob.session_ui"),
    ).toBeNull();
    expect(
      window.sessionStorage.getItem(activeRunnerRegistryKey("session_ui")),
    ).toBeNull();
  });

  it("keeps routed live work recoverable when cancellation cannot be confirmed", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      liveGpt: "configured",
      runner: "configured",
      restoredSessionState: "INGESTED",
      cancelOffline: true,
    });
    window.history.replaceState({}, "", "/session/session_ui");
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );
    window.localStorage.setItem(
      "counterlab.recentProjects.v1",
      JSON.stringify([
        {
          sessionId: "session_revision",
          artifactId: uploadedArtifact.artifactId,
          fileName: "older-notebook.ipynb",
          mode: "live",
          state: "INGESTED",
          updatedAt: "2026-07-20T09:00:00.000Z",
        },
      ]),
    );

    render(<App />);
    await screen.findByRole("heading", {
      name: /what do you think the score means/i,
    });
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /older-notebook\.ipynb/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /stop jobs and start over/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /could not confirm cancellation for 1 live job/i,
    );
    expect(window.location.pathname).toBe("/");
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_revision",
      ),
    ).toBe(false);
    expect(
      screen.queryByRole("heading", { name: /stop live work and start over/i }),
    ).not.toBeInTheDocument();
    expect(
      window.localStorage.getItem("counterlab.activeRunnerJob.session_ui"),
    ).not.toBeNull();
  });

  it("hydrates restored session evidence from the canonical private endpoint", async () => {
    const user = userEvent.setup();
    const storedEvents = [
      storedEvidenceEvent("session_ui", 1, "session.created"),
      storedEvidenceEvent("session_ui", 2, "prediction.committed", "learner"),
      storedEvidenceEvent("session_ui", 3, "experiment.completed", "kernel"),
    ];
    const storedCompilerEvents = [
      {
        schemaVersion: "1" as const,
        eventId: "compiler_plan_1",
        jobId: "job_compile_history",
        cursor: 1,
        at: "2026-07-19T10:01:00.000Z",
        kind: "plan.summary" as const,
        title: "Stored bounded compile plan",
        steps: ["Read approved evidence", "Emit typed experiment IR"],
      },
      {
        schemaVersion: "1" as const,
        eventId: "compiler_verifier_2",
        jobId: "job_compile_history",
        cursor: 2,
        at: "2026-07-19T10:01:01.000Z",
        kind: "verifier.verified" as const,
        invariantCount: 12,
        mutationCount: 8,
      },
    ];
    const fetcher = installApi({
      restoredSessionState: "EXPERIMENT_COMPLETED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
        evidenceVerdict: supportingEvidenceVerdict,
        epistemicReportHash,
      },
      eventsHandler: () =>
        response({
          events: storedEvents,
          compilerEvents: storedCompilerEvents,
          compilerActivity: {
            schemaVersion: "1",
            status: "RECORDED",
            ordering: "job-created-at-job-id-then-cursor",
            jobCount: 1,
            eventCount: 2,
          },
        }),
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    const proofToggle = await screen.findByRole("button", {
      name: /evidence & proof/i,
    });
    await user.click(proofToggle);
    const chain = await screen.findByRole("region", {
      name: /session event chain/i,
    });
    expect(chain).toHaveTextContent(
      /session\.created[\s\S]*prediction\.committed[\s\S]*experiment\.completed/,
    );
    expect(chain).toHaveTextContent(/Sequence 2 · learner/);
    await user.click(screen.getByRole("tab", { name: "Plan" }));
    expect(
      (await screen.findAllByText(/stored bounded compile plan/i)).length,
    ).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Verifier" }));
    expect(
      (await screen.findAllByText(/12 invariants and 8 mutations passed/i))
        .length,
    ).toBeGreaterThan(0);
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_ui/events",
      ),
    ).toBe(true);
  });

  it("retains same-session evidence while refreshing and ignores an older response", async () => {
    const user = userEvent.setup();
    let resolveOlderRequest: ((value: Response) => void) | undefined;
    const olderRequest = new Promise<Response>((resolve) => {
      resolveOlderRequest = resolve;
    });
    installApi({
      eventsHandler: (_sessionId, requestIndex) => {
        if (requestIndex === 0) {
          return response({
            events: [storedEvidenceEvent("session_ui", 1, "session.created")],
          });
        }
        if (requestIndex === 1) return olderRequest;
        return response({
          events: [
            storedEvidenceEvent("session_ui", 1, "session.created"),
            storedEvidenceEvent("session_ui", 2, "belief_test.proposed"),
            storedEvidenceEvent(
              "session_ui",
              3,
              "belief_test.confirmed",
              "learner",
            ),
          ],
        });
      },
    });
    render(<App />);
    await openSampleModelDuel(user);

    await user.click(screen.getByRole("button", { name: /evidence & proof/i }));
    expect(
      await screen.findByRole("region", { name: /session event chain/i }),
    ).toHaveTextContent("session.created");
    expect(screen.getByRole("status")).toHaveTextContent(
      /loading the stored session event chain/i,
    );

    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await vi.waitFor(() =>
      expect(
        screen.getByRole("region", { name: /session event chain/i }),
      ).toHaveTextContent("belief_test.confirmed"),
    );

    resolveOlderRequest?.(
      response({
        events: [storedEvidenceEvent("session_ui", 1, "stale.response.marker")],
      }),
    );
    await act(async () => Promise.resolve());

    expect(
      screen.getByRole("region", { name: /session event chain/i }),
    ).toHaveTextContent("belief_test.confirmed");
    expect(document.body).not.toHaveTextContent("stale.response.marker");
  });

  it("reports an unavailable stored chain without inferring lifecycle evidence", async () => {
    const user = userEvent.setup();
    installApi({
      restoredSessionState: "INGESTED",
      eventsHandler: () =>
        errorResponse(
          "EVENT_CHAIN_UNAVAILABLE",
          "Stored session evidence could not be loaded.",
          503,
        ),
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    await user.click(
      await screen.findByRole("button", { name: /evidence & proof/i }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /stored session event chain is unavailable/i,
    );
    expect(document.body).not.toHaveTextContent("session.created");
    expect(screen.getByText(/0 chain events/)).toBeInTheDocument();
  });

  it("clears an earlier same-session chain when a later integrity fetch fails", async () => {
    const user = userEvent.setup();
    installApi({
      eventsHandler: (_sessionId, requestIndex) =>
        requestIndex === 0
          ? response({
              events: [storedEvidenceEvent("session_ui", 1, "session.created")],
            })
          : errorResponse(
              "EVIDENCE_CHAIN_INVALID",
              "Stored evidence failed integrity validation",
              409,
            ),
    });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );
    await screen.findByRole("heading", {
      name: /what do you think the score means/i,
    });
    await user.click(screen.getByRole("button", { name: /evidence & proof/i }));
    expect(
      await screen.findByRole("region", { name: /session event chain/i }),
    ).toHaveTextContent("session.created");

    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /stored session event chain is unavailable/i,
    );
    expect(document.body).not.toHaveTextContent("session.created");
    expect(screen.getByText(/0 chain events/)).toBeInTheDocument();
  });

  it("keeps URL synchronization active when a restored runner resume fails", async () => {
    installApi({
      restoredSessionState: "LAB_COMPILING",
      stallRunner: true,
      failRunnerResume: true,
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByText(/the bounded compiler turn failed/i),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/session/session_ui");
  });

  it("does not mark a live Reasoning Diff complete before its Capsule exists", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      restoredSessionState: "REASONING_DIFF_ISSUED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
        evidenceVerdict: supportingEvidenceVerdict,
        epistemicReportHash,
      },
    });
    window.history.replaceState({}, "", "/proof/session_ui");

    render(<App />);

    const recoveryHeading = await screen.findByRole("heading", {
      name: /this proof is not ready yet/i,
    });
    expect(recoveryHeading).toHaveFocus();
    expect(window.location.pathname).toBe("/proof/session_ui");
    expect(
      screen.queryByRole("button", { name: /export proof/i }),
    ).not.toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path).endsWith("/lab/compile") && init?.method === "POST",
      ),
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: /check again/i }));
    await screen.findByRole("heading", {
      name: /this proof is not ready yet/i,
    });
    expect(
      fetcher.mock.calls.some(
        ([path, init]) =>
          String(path).endsWith("/lab/compile") && init?.method === "POST",
      ),
    ).toBe(false);
  });

  it("restores the exact reviewed Belief Spec and evidence after refresh", async () => {
    installApi({
      restoredSessionState: "BELIEF_TEST_PROPOSED",
      restoredSessionExtra: { beliefSpec: liveBeliefSpec },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByText(liveBeliefSpec.hypotheses[0].statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(liveBeliefSpec.hypotheses[1].statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(liveBeliefSpec.evidenceRefs[0]!.relevance),
    ).toBeInTheDocument();
    expect(
      screen.getByText(liveBeliefSpec.evidenceRefs[0]!.excerpt),
    ).toBeInTheDocument();
    expect(screen.getByText(liveBeliefSpec.claim)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /customer_id encoded|98\.5% accuracy/i,
    );
  });

  it("does not rerun a restored epistemically rejected test", async () => {
    const fetcher = installApi({
      restoredSessionState: "LAB_VERIFIED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        evidenceVerdict: rejectedEvidenceVerdict,
        epistemicReportHash,
      },
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /experimental result was withheld/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/result binding mismatch/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/98\.5%|59\.4%/i);
    expect(
      fetcher.mock.calls.some(([path]) => String(path).endsWith("/lab/run")),
    ).toBe(false);
  });

  it("shows an inconclusive result without unlocking repair", async () => {
    installApi({
      restoredSessionState: "TRANSFER_PASSED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
        evidenceVerdict: inconclusiveEvidenceVerdict,
        epistemicReportHash,
        revision:
          "Evaluation must match deployment timing and use exact code evidence.",
        transferResult: passedLeakageTransfer,
      },
    });
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /fixed forecasting transfer passed/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/evidence verdict · inconclusive/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/repair remains locked/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /verify notebook patch/i }),
    ).not.toBeInTheDocument();
  });

  it("restores the immutable Prediction Seal after refresh", async () => {
    installApi({
      restoredSessionState: "LAB_VERIFIED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
        evidenceVerdict: supportingEvidenceVerdict,
        epistemicReportHash,
      },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    const seal = within(
      await screen.findByRole("region", { name: /sealed prediction/i }),
    );
    expect(seal.getByText(committedPrediction.choice)).toBeInTheDocument();
    expect(seal.getByText("88%")).toBeInTheDocument();
    expect(seal.queryByRole("radio")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /the result is ready/i }),
    ).toBeInTheDocument();
  });

  it("restores a failed transfer and submits only learner-selected canonical evidence", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      restoredSessionState: "TRANSFER_FAILED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
        evidenceVerdict: supportingEvidenceVerdict,
        epistemicReportHash,
        revision:
          "Evaluation must match deployment timing and use exact code evidence.",
        transferResult: failedLeakageTransfer,
      },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByText(/transfer not yet passed/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: /random daily rows/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /model complexity/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: /metric definition/i }),
    ).toBeChecked();
    expect(
      screen.queryByRole("button", { name: /verify notebook patch/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: /time-ordered holdout/i }),
    );
    await user.click(
      screen.getByRole("radio", { name: /centered rolling target/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /metric definition/i }),
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: /centered-window definition/i,
      }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /shuffled-split definition/i }),
    );
    await user.click(screen.getByRole("button", { name: /check transfer/i }));

    expect(
      await screen.findByRole("heading", {
        name: /this fixed forecasting transfer passed/i,
      }),
    ).toBeInTheDocument();
    const transferRequest = fetcher.mock.calls.find(([path]) =>
      String(path).endsWith("/transfer"),
    );
    expect(JSON.parse(String(transferRequest?.[1]?.body))).toEqual({
      strategyChoice: "time_ordered_holdout",
      riskChoice: "centered_window_reads_future",
      evidenceChoices: [
        "center_true_uses_later_targets",
        "random_split_mixes_dates",
      ],
    });
  });

  it("ignores a late child transfer response after starting a new analysis", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi({
      restoredSessionState: "TRANSFER_FAILED",
      restoredSessionExtra: {
        beliefSpec: confirmedLiveBeliefSpec,
        prediction: committedPrediction,
        verifiedResult: liveResult,
        evidenceVerdict: supportingEvidenceVerdict,
        epistemicReportHash,
        revision:
          "Evaluation must match deployment timing and use exact code evidence.",
        transferResult: failedLeakageTransfer,
      },
    });
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input).endsWith("/transfer")
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);
    await screen.findByText(/transfer not yet passed/i);
    await user.click(screen.getByRole("button", { name: /check transfer/i }));
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(([path]) => String(path).endsWith("/transfer")),
      ).toBe(true),
    );
    await user.click(
      screen.getByRole("button", { name: /project & evidence/i }),
    );
    await user.click(screen.getByRole("button", { name: /new analysis/i }));
    expect(
      await screen.findByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();

    await act(async () => {
      pending.resolve(
        response(
          session("TRANSFER_PASSED", 9, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
            beliefSpec: confirmedLiveBeliefSpec,
            prediction: committedPrediction,
            verifiedResult: liveResult,
            evidenceVerdict: supportingEvidenceVerdict,
            epistemicReportHash,
            revision:
              "Evaluation must match deployment timing and use exact code evidence.",
            transferResult: latePassedLeakageTransfer,
          }),
        ),
      );
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/new");
    expect(
      screen.getByRole("heading", { name: /test my notebook/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", {
        name: /fixed forecasting transfer passed/i,
      }),
    ).toBeNull();
  });

  it("restores failed class-imbalance v1 choices after refresh", async () => {
    installApi({
      restoredSessionState: "TRANSFER_FAILED",
      restoredSessionExtra: {
        beliefSpec: liveImbalanceBeliefSpec,
        prediction: committedImbalancePrediction,
        verifiedResult: verifiedImbalanceResult,
        evidenceVerdict: supportingImbalanceEvidenceVerdict,
        epistemicReportHash,
        revision:
          "Overall accuracy needs minority-sensitive metrics and direct rare-class evidence.",
        transferResult: failedImbalanceTransfer,
      },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    expect(
      await screen.findByRole("radio", {
        name: /approve because accuracy is 99%/i,
      }),
    ).toBeChecked();
    expect(
      screen.getByRole("radio", { name: /^accuracy only/i }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", {
        name: /19,800 acceptable parts were classified correctly/i,
      }),
    ).toBeChecked();
    expect(
      screen.queryByRole("button", { name: /verify notebook patch/i }),
    ).not.toBeInTheDocument();
  });

  it("commits class-imbalance prediction wording from Belief Spec v2", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({
      restoredSessionState: "BELIEF_TEST_CONFIRMED",
      restoredSessionExtra: { beliefSpec: liveImbalanceBeliefSpec },
    });
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem("counterlab.mode", "live");
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);

    await user.click(
      await screen.findByRole("radio", {
        name: /expose a serious minority-class problem/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    await vi.waitFor(() => {
      const predictionRequest = fetcher.mock.calls.find(([path]) =>
        String(path).endsWith("/prediction"),
      );
      expect(predictionRequest).toBeDefined();
      expect(String(predictionRequest?.[1]?.body)).toContain(
        "Minority metrics expose a serious evaluation problem",
      );
      expect(String(predictionRequest?.[1]?.body)).not.toContain(
        "Accuracy falls materially",
      );
      const interactionRequest = fetcher.mock.calls.find(
        ([path, init]) =>
          String(path).endsWith("/interactions") &&
          String(init?.body).includes('"kind":"prediction.recorded"'),
      );
      expect(interactionRequest).toBeDefined();
      expect(JSON.parse(String(interactionRequest?.[1]?.body))).toMatchObject({
        kind: "prediction.recorded",
        stage: "prediction",
        choice: "alternative_explanation",
        confidence: 72,
      });
    });
  });

  it("submits an immutable Prediction only once while the request is pending", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi({
      restoredSessionState: "BELIEF_TEST_CONFIRMED",
      restoredSessionExtra: { beliefSpec: confirmedLiveBeliefSpec },
    });
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input).endsWith("/prediction")
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    window.history.replaceState({}, "", "/session/session_ui");

    render(<App />);
    await user.click(
      await screen.findByRole("radio", { name: /fall materially/i }),
    );
    const seal = screen.getByRole("button", { name: /seal my prediction/i });
    await user.dblClick(seal);

    const predictionCalls = fetcher.mock.calls.filter(([path]) =>
      String(path).endsWith("/prediction"),
    );
    expect(predictionCalls).toHaveLength(1);
    expect(seal).toBeDisabled();
    const predictionCall = predictionCalls[0];
    if (predictionCall === undefined)
      throw new Error("Prediction request missing");
    await act(async () => {
      pending.resolve(await normalFetch(predictionCall[0], predictionCall[1]));
      await pending.promise;
    });
    await screen.findByRole("heading", { name: /the result is ready/i });
  });

  it("recovers an already-committed Prediction after its response is lost", async () => {
    const user = userEvent.setup();
    const fetcher = installApi({ predictionCommitResponseLost: true });
    render(<App />);

    await openSampleModelDuel(user);
    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    expect(
      await screen.findByRole("region", { name: /sealed prediction/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /the fair test is ready/i }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.filter(([path]) =>
        String(path).endsWith("/prediction"),
      ),
    ).toHaveLength(1);
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_ui",
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).endsWith("/lab/compile"),
      ),
    ).toBe(true);
    expect(document.body).not.toHaveTextContent(
      /prediction is already committed/i,
    );
  });

  it("uses class-imbalance language when the analyst routes a rare-event notebook", async () => {
    const user = userEvent.setup();
    installApi({
      liveGpt: "configured",
      runner: "configured",
      beliefTest: imbalanceBeliefTest,
    });
    render(<App />);

    await openLiveSetup(user);
    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], "fraud_model.ipynb", {
        type: "application/json",
      }),
    );
    const imbalanceClaim = await screen.findByLabelText(/your claim/i);
    await user.clear(imbalanceClaim);
    await user.type(imbalanceClaim, imbalanceBeliefTest.learnerClaim);
    await user.click(
      screen.getByRole("button", { name: /compare two explanations/i }),
    );
    await user.click(
      await screen.findByRole("button", { name: /send this evidence/i }),
    );

    expect(
      await screen.findByText(imbalanceBeliefTest.currentHypothesis.statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(imbalanceBeliefTest.competingHypothesis.statement),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/same predictions with overall and class-specific/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /hold out entire customers|customer memory/i,
    );
  });

  it("keeps computed results hidden until an immutable prediction is committed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    const exactReferences = within(
      screen.getByRole("list", { name: /exact evidence references/i }),
    );
    expect(exactReferences.getByText(/cell 3 · output 0/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /here.s what changed/i }),
    ).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", {
      name: /compare two explanations/i,
    });
    expect(continueButton).toBeEnabled();
    await user.click(continueButton);

    expect(
      await screen.findByRole("heading", {
        name: /does your current explanation capture what you mean/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/partly remembers customers/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /here.s what changed/i }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /deceptive|fairer test|keep each customer's rows together|remove customer id|evidence verdict|supported hypothesis|59\.4%/i,
    );

    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    expect(
      await screen.findByRole("region", { name: /sealed prediction/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /the fair test is ready/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /reveal verified sample result/i }),
    ).toBeEnabled();
    expect(screen.queryByText(/new customers 59\.4%/i)).not.toBeInTheDocument();
  });

  it("runs the fair test only once while its result request is pending", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi();
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input).endsWith("/lab/run")
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);

    await openSampleModelDuel(user);
    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );
    const runButton = await screen.findByRole("button", {
      name: /reveal verified sample result/i,
    });
    await user.click(runButton);
    await user.click(runButton);

    const runCalls = fetcher.mock.calls.filter(([path]) =>
      String(path).endsWith("/lab/run"),
    );
    expect(runCalls).toHaveLength(1);
    expect(runButton).toBeDisabled();
    const runCall = runCalls[0];
    if (runCall === undefined) throw new Error("Fair-test request missing");
    await act(async () => {
      pending.resolve(await normalFetch(runCall[0], runCall[1]));
      await pending.promise;
    });
    expect(
      await screen.findByRole("heading", {
        name: /let the verified test answer/i,
      }),
    ).toBeInTheDocument();
  });

  it("explains the fair test before revealing one verified Theater view", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "counterlab.replayRevision",
      "A stale replay interpretation must never authorize this new sample.",
    );
    render(<App />);

    await openSampleModelDuel(user);
    await user.click(
      screen.getByRole("button", { name: /yes, this captures my view/i }),
    );
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(
      screen.getByRole("button", { name: /seal my prediction/i }),
    );

    expect(
      await screen.findByRole("heading", { name: /the fair test is ready/i }),
    ).toBeInTheDocument();
    const builder = screen.getByRole("region", {
      name: /building one fair test/i,
    });
    expect(within(builder).getByText(/why this test/i)).toBeInTheDocument();
    expect(
      within(builder).getByText(/random rows → whole customers/i),
    ).toBeInTheDocument();
    expect(within(builder).getByText(/held fixed/i)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/new customers 59\.4%/i);

    await user.click(
      screen.getByRole("button", { name: /reveal verified sample result/i }),
    );

    expect(
      await screen.findByRole("heading", {
        name: /let the verified test answer/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Verified result")).toBeInTheDocument();
    const mechanism = await screen.findByLabelText(
      /verified sample belief-break mechanism/i,
    );
    expect(await within(mechanism).findByText("98.5%")).toBeVisible();
    expect(within(mechanism).getByText("59.4%")).toBeVisible();
    expect(mechanism).toHaveTextContent(/record your interpretation/i);
    expect(document.body).not.toHaveTextContent(
      /a high score on familiar customers did not mean/i,
    );
    expect(screen.queryByText("Boundary consequence")).not.toBeInTheDocument();
    expect(screen.queryByText("Learner benefit")).not.toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: /experiment views/i });
    const applyTab = within(tabs).getByRole("tab", { name: /apply/i });
    const exploreTab = within(tabs).getByRole("tab", { name: /explore/i });
    const boundaryTab = within(tabs).getByRole("tab", { name: /boundary/i });
    expect(applyTab).toBeDisabled();
    expect(exploreTab).toBeDisabled();
    expect(boundaryTab).toBeDisabled();
    expect(within(tabs).getByRole("tab", { name: /observe/i })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(
      screen.getByRole("textbox", { name: /what do you notice/i }),
    ).toHaveValue("");
    expect(document.body).not.toHaveTextContent(/98\.5% became 59\.4%/i);

    const interpretation = screen.getByRole("textbox", {
      name: /what do you notice/i,
    });
    await user.type(interpretation, "xxxxxxxxxxxxxxxxxxxx");
    expect(exploreTab).toBeDisabled();
    expect(boundaryTab).toBeDisabled();
    await user.clear(interpretation);
    await user.type(
      interpretation,
      "The result changes when the evaluation boundary changes.",
    );
    expect(document.body).toHaveTextContent(
      /a high score on familiar customers did not mean/i,
    );
    expect(screen.getByText("Boundary consequence")).toBeInTheDocument();
    expect(screen.getByText("Learner benefit")).toBeInTheDocument();
    expect(exploreTab).toBeEnabled();
    expect(boundaryTab).toBeEnabled();
    expect(document.body).toHaveTextContent(/98\.5% became 59\.4%/i);

    await user.click(exploreTab);
    expect(
      screen.getByRole("heading", { name: /explore bounded test choices/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    await user.click(boundaryTab);
    expect(
      await screen.findByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/verified sample exploration/i).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("table", { name: /verified boundary map values/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /reveal the map/i }));
    expect(
      await screen.findByRole("table", {
        name: /verified boundary map values/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/integrity-hashed/i)).toBeInTheDocument();
    expect(applyTab).toBeEnabled();
    expect(
      window.localStorage.getItem(
        "counterlab.sampleBoundaryClassifiedSessionId",
      ),
    ).toBe("session_ui");

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 10%.*observations per customer 2 observations/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /check this condition/i }),
    );
    expect(applyTab).toBeEnabled();
    expect(
      window.localStorage.getItem(
        "counterlab.sampleBoundaryClassifiedSessionId",
      ),
    ).toBe("session_ui");

    await user.click(applyTab);
    expect(screen.getByLabelText(/your revised mental model/i)).toHaveValue("");
    expect(
      screen.getByRole("button", { name: /try the rule on a new problem/i }),
    ).toBeDisabled();
    await user.selectOptions(
      screen.getByLabelText(/choose the condition/i),
      "repeated-entity",
    );
    await user.selectOptions(
      screen.getByLabelText(/choose the action/i),
      "whole-entities",
    );
    await user.selectOptions(
      screen.getByLabelText(/choose the evidence-based reason/i),
      "identity-overlap",
    );
    expect(
      screen.getByRole("button", { name: /try the rule on a new problem/i }),
    ).toBeEnabled();
  });

  it("keeps legacy replay strictly read-only across the judged flow", async () => {
    const user = userEvent.setup();
    const fetcher = installApi();
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /watch verified replay/i }),
    );
    expect(
      (await screen.findAllByText(/verified replay/i)).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /start|run.*test|new analysis/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue replay/i }));
    expect(
      await screen.findByRole("heading", {
        name: /inspect the result without changing its history/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/verified replay · read-only stored evidence/i),
    ).toBeInTheDocument();
    expect(
      document.querySelector(
        '[data-trusted-visual-id="verified_sample_belief_break_v1"]',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /try the rule on a new problem/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /check my answer/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /return to counterlab home/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /start|run.*test|new analysis/i }),
    ).not.toBeInTheDocument();
    expect(
      fetcher.mock.calls.every(([, init]) =>
        [undefined, "GET"].includes(init?.method),
      ),
    ).toBe(true);
  });

  it("shows the cancellation confirmation when replay returns home with registered live work", async () => {
    const user = userEvent.setup();
    installApi();
    window.localStorage.setItem("counterlab.sessionId", "session_ui");
    window.localStorage.setItem(
      "counterlab.activeRunnerJob.session_ui",
      JSON.stringify({
        schemaVersion: "1",
        sessionId: "session_ui",
        jobId: liveRunnerJob.jobId,
        kind: liveRunnerJob.kind,
      }),
    );
    window.history.replaceState({}, "", "/replay/leakage-01");

    render(<App />);
    await screen.findByRole("heading", { name: /replay verified session/i });
    await user.click(
      screen.getByRole("button", { name: /return to counterlab home/i }),
    );

    expect(
      screen.getByRole("heading", { name: /stop live work and start over/i }),
    ).toBeInTheDocument();
  });

  it("restores the exact replay URL instead of substituting the bundled replay", async () => {
    const replayId = "replay:dynamic.one";
    window.localStorage.setItem("counterlab.mode", "replay");
    window.localStorage.setItem("counterlab.replayId", "stale-replay");
    window.history.replaceState(
      {},
      "",
      `/replay/${encodeURIComponent(replayId)}`,
    );
    const fetcher = installApi();

    render(<App />);

    expect(
      (await screen.findAllByText(replayId, { exact: true })).length,
    ).toBeGreaterThan(0);
    expect(window.location.pathname).toBe(
      `/replay/${encodeURIComponent(replayId)}`,
    );
    expect(
      fetcher.mock.calls.some(
        ([path]) =>
          String(path) === `/api/replays/${encodeURIComponent(replayId)}`,
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/replays/leakage-01",
      ),
    ).toBe(false);
  });

  it("returns to an honest chooser when a replay cannot be loaded", async () => {
    const user = userEvent.setup();
    installApi({ replayFailure: true });
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /watch verified replay/i }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not reach the api/i,
    );
    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /opening this replay/i }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("counterlab.mode")).toBeNull();
    expect(window.localStorage.getItem("counterlab.replayId")).toBeNull();
  });

  it("canonicalizes a stored replay session route to its read-only replay URL", async () => {
    const replayId = "replay:stored.session";
    window.history.replaceState({}, "", "/session/session_ui");
    const fetcher = installApi({
      restoredSessionState: "INGESTED",
      restoredSessionExtra: {
        mode: { kind: "verified_replay", replayId },
      },
    });

    render(<App />);

    expect(
      (await screen.findAllByText(replayId, { exact: true })).length,
    ).toBeGreaterThan(0);
    expect(window.location.pathname).toBe(
      `/replay/${encodeURIComponent(replayId)}`,
    );
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_ui/artifact",
      ),
    ).toBe(false);
    expect(
      fetcher.mock.calls.some(
        ([path]) =>
          String(path) === `/api/replays/${encodeURIComponent(replayId)}`,
      ),
    ).toBe(true);
  });

  it("lets an explicit session URL override stale replay storage", async () => {
    window.localStorage.setItem("counterlab.mode", "replay");
    window.localStorage.setItem("counterlab.replayId", "replay_retention_913");
    window.history.replaceState({}, "", "/session/session_ui");
    const fetcher = installApi({ restoredSessionState: "INGESTED" });

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe("/session/session_ui");
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_ui",
      ),
    ).toBe(true);
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).startsWith("/api/replays/"),
      ),
    ).toBe(false);
  });

  it("does not carry a claim from another session into an explicit session URL", async () => {
    window.localStorage.setItem("counterlab.sessionId", "session_old");
    window.localStorage.setItem(
      "counterlab.claim",
      "A claim from another notebook",
    );
    window.history.replaceState({}, "", "/session/session_ui");
    installApi({ restoredSessionState: "INGESTED" });

    render(<App />);

    expect(await screen.findByLabelText(/your claim/i)).toHaveValue("");
  });

  it("keeps the explicit landing URL instead of restoring stale replay state", () => {
    window.localStorage.setItem("counterlab.mode", "replay");
    window.localStorage.setItem("counterlab.replayId", "replay_retention_913");
    const fetcher = installApi();

    render(<App />);

    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([path]) =>
        String(path).startsWith("/api/replays/"),
      ),
    ).toBe(false);
  });

  it("offers recent work on the normal landing and resumes it explicitly", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "counterlab.recentWork.v1",
      JSON.stringify({
        schemaVersion: "1",
        records: [
          {
            id: "session_ui",
            mode: "live",
            status: "INGESTED",
            updatedAt: "2026-07-19T01:00:00.000Z",
          },
        ],
      }),
    );
    const fetcher = installApi({ restoredSessionState: "INGESTED" });

    render(<App />);

    await user.click(screen.getByText("Recent work from this browser"));
    await user.click(
      screen.getByRole("button", {
        name: /live notebook session.*question ready/i,
      }),
    );

    expect(window.location.pathname).toBe("/session/session_ui");
    expect(
      await screen.findByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(
        ([path]) => String(path) === "/api/sessions/session_ui",
      ),
    ).toBe(true);
  });

  it("disables recent-work navigation while a mode request is pending", async () => {
    const user = userEvent.setup();
    window.localStorage.setItem(
      "counterlab.recentWork.v1",
      JSON.stringify({
        schemaVersion: "1",
        records: [
          {
            id: "session_ui",
            mode: "live",
            status: "INGESTED",
            updatedAt: "2026-07-19T01:00:00.000Z",
          },
        ],
      }),
    );
    const normalFetch = installApi();
    const pending = deferredResponse();
    const sampleResponse = await normalFetch("/api/sample/sessions", {
      method: "POST",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) =>
        String(input) === "/api/sample/sessions"
          ? pending.promise
          : normalFetch(input, init),
      ),
    );
    render(<App />);

    await user.click(screen.getByText("Recent work from this browser"));
    const recent = screen.getByRole("button", {
      name: /live notebook session.*question ready/i,
    });
    expect(recent).toBeEnabled();
    await user.click(
      screen.getByRole("button", { name: /start verified sample/i }),
    );
    await vi.waitFor(() =>
      expect(
        screen.getByRole("button", { name: /start verified sample/i }),
      ).toBeDisabled(),
    );
    const disabledWhilePending = recent.hasAttribute("disabled");

    await act(async () => {
      pending.resolve(sampleResponse);
      await pending.promise;
    });

    expect(disabledWhilePending).toBe(true);
  });

  it("reconstructs the landing page when browser history emits popstate", async () => {
    window.history.replaceState({}, "", "/replay/leakage-01");
    installApi();
    render(<App />);

    expect(
      (await screen.findAllByText(/verified replay/i)).length,
    ).toBeGreaterThan(0);

    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    const landingTitle = await screen.findByRole("heading", {
      name: /what result are you trying to understand/i,
    });
    expect(landingTitle).toHaveFocus();
    expect(screen.queryByLabelText("Replay status")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Verified replay mode"),
    ).not.toBeInTheDocument();
  });

  it("ignores a deferred sample session after browser Back returns home", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi();
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input) === "/api/sample/sessions"
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /try verified sample/i }),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([path]) => String(path) === "/api/sample/sessions",
        ),
      ).toBe(true),
    );

    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(
      await screen.findByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();

    await act(async () => {
      pending.resolve(
        response(
          session("INGESTED", 1, {
            mode: { kind: "sample_lesson", sampleId: "leakage-01" },
          }),
          201,
        ),
      );
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/");
    expect(window.localStorage.getItem("counterlab.sessionId")).toBeNull();
    expect(window.localStorage.getItem("counterlab.mode")).toBeNull();
    expect(
      screen.queryByRole("heading", {
        name: /what do you think the score means/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("ignores a deferred replay after browser Back returns home", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi();
    const replayResponse = await normalFetch("/api/replays/leakage-01");
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input) === "/api/replays/leakage-01"
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);

    await user.click(
      screen.getByRole("button", { name: /watch verified replay/i }),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([path]) => String(path) === "/api/replays/leakage-01",
        ),
      ).toBe(true),
    );

    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByRole("heading", {
      name: /what result are you trying to understand/i,
    });
    await act(async () => {
      pending.resolve(replayResponse);
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/");
    expect(window.localStorage.getItem("counterlab.replayId")).toBeNull();
    expect(screen.queryByLabelText("Replay status")).not.toBeInTheDocument();
  });

  it("ignores a deferred notebook upload after browser Back returns home", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi({
      liveGpt: "configured",
      runner: "configured",
    });
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input) === "/api/artifacts" && init?.body instanceof FormData
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await openLiveSetup(user);

    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/x-ipynb+json",
      }),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([path, init]) =>
            String(path) === "/api/artifacts" && init?.body instanceof FormData,
        ),
      ).toBe(true),
    );

    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByRole("heading", {
      name: /what result are you trying to understand/i,
    });
    await act(async () => {
      pending.resolve(response(uploadedArtifact, 201));
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/");
    expect(window.localStorage.getItem("counterlab.sessionId")).toBeNull();
    expect(document.body).not.toHaveTextContent(uploadedArtifact.fileName);
  });

  it("ignores a deferred live-session creation after browser Back returns home", async () => {
    const user = userEvent.setup();
    const normalFetch = installApi({
      liveGpt: "configured",
      runner: "configured",
    });
    const pending = deferredResponse();
    const fetcher = vi.fn<typeof fetch>((input, init) =>
      String(input) === "/api/live/sessions"
        ? pending.promise
        : normalFetch(input, init),
    );
    vi.stubGlobal("fetch", fetcher);
    render(<App />);
    await openLiveSetup(user);

    await user.upload(
      await screen.findByLabelText(/attach a supported notebook/i),
      new File(["{}"], uploadedArtifact.fileName, {
        type: "application/x-ipynb+json",
      }),
    );
    await vi.waitFor(() =>
      expect(
        fetcher.mock.calls.some(
          ([path]) => String(path) === "/api/live/sessions",
        ),
      ).toBe(true),
    );

    act(() => {
      window.history.pushState({}, "", "/");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await screen.findByRole("heading", {
      name: /what result are you trying to understand/i,
    });
    await act(async () => {
      pending.resolve(
        response(
          session("INGESTED", 1, {
            artifactId: uploadedArtifact.artifactId,
            mode: { kind: "live_notebook" },
          }),
          201,
        ),
      );
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/");
    expect(window.localStorage.getItem("counterlab.sessionId")).toBeNull();
    expect(document.body).not.toHaveTextContent(uploadedArtifact.fileName);
  });

  it("renders a hosted Capsule replay as read-only artifact-specific evidence", async () => {
    const user = userEvent.setup();
    const replay = publicReplayFixture("class_imbalance");
    window.history.replaceState(
      {},
      "",
      `/replay/${encodeURIComponent(replay.replayId)}`,
    );
    const fetcher = installApi({ replay });

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /live notebook claim, replayed from verified evidence/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Private notebook withheld")).toBeInTheDocument();
    expect(screen.getByText(replay.question.claim)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/merchant_risk_audit_live/);
    expect(document.body).not.toHaveTextContent(sampleArtifact.fileName);
    expect(screen.queryByText(/run fair test/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lock my answer/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/verify notebook patch/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download proof capsule/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /download repaired notebook/i }),
    ).not.toBeInTheDocument();
    expect(
      fetcher.mock.calls.every(([, init]) =>
        [undefined, "GET"].includes(init?.method),
      ),
    ).toBe(true);

    await user.click(
      screen.getByText(
        /evidence & proof · provenance, activity, and limitations/i,
      ),
    );
    expect(screen.getByText("Allowlisted activity")).toBeInTheDocument();
    expect(
      fetcher.mock.calls.some(([path]) =>
        /\/api\/sessions\/[^/]+\/events$/u.test(String(path)),
      ),
    ).toBe(false);

    await user.click(
      screen.getByRole("button", { name: /return to counterlab home/i }),
    );
    expect(window.location.pathname).toBe("/");
    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toHaveFocus();
  });

  it("does not label an unknown replay as verified", async () => {
    window.history.replaceState({}, "", "/replay/missing-replay");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        errorResponse("REPLAY_NOT_FOUND", "Replay was not found", 404),
      ),
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /replay was not found/i,
    );
    expect(screen.queryByLabelText(/replay status/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/verified replay/i);
  });

  it("ignores a direct replay load after the learner returns home", async () => {
    window.history.replaceState({}, "", "/replay/leakage-01");
    const normalFetch = installApi();
    const replayResponse = await normalFetch("/api/replays/leakage-01");
    const pending = deferredResponse();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>((input, init) =>
        String(input) === "/api/replays/leakage-01"
          ? pending.promise
          : normalFetch(input, init),
      ),
    );
    const user = userEvent.setup();

    render(<App />);
    await user.click(
      await screen.findByRole("button", {
        name: /return to counterlab home/i,
      }),
    );
    await act(async () => {
      pending.resolve(replayResponse);
      await pending.promise;
    });

    expect(window.location.pathname).toBe("/");
    expect(
      screen.getByRole("heading", {
        name: /what result are you trying to understand/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Replay status")).not.toBeInTheDocument();
  });

  it("treats a 404 session as inaccessible private work and offers durable recovery actions", async () => {
    window.history.replaceState({}, "", "/session/missing-session");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        errorResponse("SESSION_NOT_FOUND", "Session was not found", 404),
      ),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /this private session could not be opened/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /does not reveal whether an inaccessible address exists/i,
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /go to counterlab home/i }),
    ).toBeEnabled();
  });

  it("keeps browser recovery metadata when private-session access is denied", async () => {
    window.history.replaceState({}, "", "/session/private-session");
    window.localStorage.setItem(
      "counterlab.recentWork.v1",
      JSON.stringify({
        schemaVersion: "1",
        records: [
          {
            id: "private-session",
            mode: "live",
            status: "BELIEF_TEST_PROPOSED",
            updatedAt: "2026-07-19T01:00:00.000Z",
          },
        ],
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        errorResponse(
          "SESSION_ACCESS_DENIED",
          "Private session access was not provided",
          404,
        ),
      ),
    );

    render(<App />);

    const recentWork = (
      await screen.findByRole("heading", {
        name: /recent work from this browser/i,
      })
    ).closest("section");
    expect(recentWork).not.toBeNull();
    const privateSession = within(recentWork!).getByRole("button", {
      name: /live notebook session/i,
    });
    expect(privateSession).toBeEnabled();
    expect(privateSession).toHaveTextContent(/explanation ready to review/i);
    expect(window.localStorage.getItem("counterlab.recentWork.v1")).toContain(
      "private-session",
    );
  });

  it("does not misreport a non-404 proof failure as missing", async () => {
    window.history.replaceState({}, "", "/proof/session-unavailable");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        errorResponse(
          "SESSION_STORE_UNAVAILABLE",
          "Session storage is unavailable",
          503,
        ),
      ),
    );

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /this proof could not be loaded/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      /proof was not found/i,
    );
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("gives an unknown route a distinct not-found recovery surface", async () => {
    window.history.replaceState({}, "", "/not-a-counterlab-route");

    render(<App />);

    expect(
      await screen.findByRole("heading", {
        name: /we couldn't find that counterlab page/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
    expect(window.location.pathname).toBe("/not-a-counterlab-route");
  });

  it("does not misreport a replay integrity failure as a missing link", async () => {
    window.history.replaceState({}, "", "/replay/replay-integrity-failed");
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () =>
        errorResponse(
          "REPLAY_AUTHORITY_MISMATCH",
          "Replay authority did not verify",
          409,
        ),
      ),
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /replay could not be verified/i,
    );
    expect(document.body).not.toHaveTextContent(/replay was not found/i);
    expect(screen.queryByLabelText(/replay status/i)).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/verified replay/i);
  });
});
