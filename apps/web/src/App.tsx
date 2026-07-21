import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  migrateBeliefTestV1ToV2,
  prePredictionBeliefTestNarrativeIssues,
  prePredictionNarrativeIssues,
} from "@counterlab/contracts";

import {
  ApiClientError,
  counterLabApi,
  getSessionBeliefAuthority,
  type ArtifactView,
  type BeliefAnalysisPreview,
  type BeliefTest,
  type CapabilityHealth,
  type EvidenceEvent,
  type ImbalanceVerifiedResultSet,
  type LeakageVerifiedResultSet,
  type PatchResult,
  type ProofBundle,
  type PublicCompilerEvent,
  type RunnerJob,
  type SessionView,
  type VerifiedReplay,
  type VerifiedResultSet,
} from "./api";
import { useRunnerEvents } from "./hooks/useRunnerEvents";
import {
  clearAllActiveRunnerCheckpoints,
  clearActiveRunnerCheckpoint,
  readActiveRunnerCheckpoint,
  writeActiveRunnerCheckpoint,
} from "./hooks/runnerCheckpoint";
import { parseStudioLocation, studioPath } from "./app/AppRouter";
import { ClaimPathChooser } from "./components/learner/ClaimPathChooser";
import { LearnerCompletion } from "./components/learner/LearnerCompletion";
import { LearnerCoach } from "./components/learner/LearnerCoach";
import { NeedAHint } from "./components/learner/NeedAHint";
import { LearnerProgress } from "./components/learner/LearnerProgress";
import { ReflectionBuilder } from "./components/learner/ReflectionBuilder";
import { RepairPreview } from "./components/learner/RepairPreview";
import {
  RouteRecovery,
  type RouteRecoveryReason,
  type RouteRecoveryRecentSession,
} from "./components/learner/RouteRecovery";
import { StartOverDialog } from "./components/learner/StartOverDialog";
import {
  TimelineTransfer,
  type TimelineEvidenceOption,
  type TimelineFeatureOption,
  type TimelineSplitOption,
} from "./components/learner/TimelineTransfer";
import {
  ExperimentTheater,
  type ExperimentTheaterVerifiedPayload,
} from "./components/learner/ExperimentTheater";
import {
  FairTestBuilder,
  type FairTestRepairStory,
  type PublicTechnicalDetail,
} from "./components/learner/FairTestBuilder";
import { ModelDuel, type DuelModel } from "./components/learner/ModelDuel";
import {
  NotebookEvidenceStory,
  type NotebookEvidenceReference,
} from "./components/learner/NotebookEvidenceStory";
import {
  PredictionSeal,
  type PredictionDisplay,
  type PredictionOption,
} from "./components/learner/PredictionSeal";
import { PrivacyPacketSummary } from "./components/learner/PrivacyPacketSummary";
import { QuestionComposer } from "./components/learner/QuestionComposer";
import { LockedBeliefBreakPreview } from "./components/learner/LockedBeliefBreakPreview";
import {
  currentLearnerStage,
  learnerSessionStatusLabel,
  type LearnerStageId,
} from "./components/learner/learnerStages";
import { DeferredReasoningDiffView } from "./components/proof/DeferredReasoningDiffView";
import type {
  ImbalanceTransferDecision,
  ImbalanceTransferEvidence,
  ImbalanceTransferMetric,
} from "./components/lesson/ImbalanceTransferLesson";
import { LegacyReplayResult } from "./components/replay/LegacyReplayResult";
import type {
  ProofEventLoadStatus,
  RecentProject,
  StudioStage,
} from "./components/studio/types";
import { BoundaryStage } from "./features/boundary/BoundaryStage";
import { recordLearnerInteraction } from "./features/learner/interactionEvidence";
import { saveAuthenticatedDownload } from "./features/learner/saveDownload";
import { mergeProofEventSources } from "./features/proof/mergeProofEvents";
import {
  listActiveRunnerJobs,
  markActiveRunnerJobTerminal,
  registerActiveRunnerJob,
  type ActiveRunnerRecord,
} from "./features/learner/activeRunnerRegistry";
import {
  listRecentWork,
  recentWorkPath,
  removeRecentWork,
  upsertRecentWork,
} from "./features/learner/recentWorkRegistry";
import { subjectPackHint } from "./features/learner/subjectPackHints";
import { useLearnerStageTiming } from "./hooks/useLearnerStageTiming";

import { bundledSampleEvidence, sampleArtifact } from "./sample";
import { verifiedReplay } from "./sampleReplayMetadata";
import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";

const LazySampleBoundaryPanel = lazy(async () => {
  const module = await import("./features/boundary/SampleBoundaryPanel");
  return { default: module.SampleBoundaryPanel };
});

const LazyCounterLabStudio = lazy(async () => {
  const module = await import("./app/CounterLabStudio");
  return { default: module.CounterLabStudio };
});

const LazyJudgeModeView = lazy(async () => {
  const module = await import("./features/judge/JudgeModeView");
  return { default: module.JudgeModeView };
});

const LazyProofCapsuleReplayView = lazy(async () => {
  const module = await import("./components/replay/ProofCapsuleReplayView");
  return { default: module.ProofCapsuleReplayView };
});

const LazyInteractiveImbalanceLab = lazy(async () => {
  const module = await import("./components/lesson/InteractiveImbalanceLab");
  return { default: module.InteractiveImbalanceLab };
});

const LazyImbalanceTransferLesson = lazy(async () => {
  const module = await import("./components/lesson/ImbalanceTransferLesson");
  return { default: module.ImbalanceTransferLesson };
});

const LazyImbalancePatchReview = lazy(async () => {
  const module = await import("./components/lesson/ImbalancePatchReview");
  return { default: module.ImbalancePatchReview };
});

const LazyVerifiedLabScenePanel = lazy(async () => {
  const module =
    await import("./components/generative-ui/VerifiedLabScenePanel");
  return { default: module.VerifiedLabScenePanel };
});

function DeferredSurfaceFallback({ label }: { label: string }) {
  return (
    <main
      className="workspace shell narrow deferred-surface-fallback"
      id="main-content"
      tabIndex={-1}
      role="status"
      aria-live="polite"
    >
      <p>{label}</p>
    </main>
  );
}

function DeferredPanelFallback({ label }: { label: string }) {
  return (
    <section
      className="panel deferred-panel-fallback"
      role="status"
      aria-live="polite"
    >
      <p>{label}</p>
    </section>
  );
}

type Mode = "instant" | "live" | "replay";
type Stage =
  | "landing"
  | "question-path"
  | "claim"
  | "belief"
  | "build"
  | "reality"
  | "live-setup"
  | "live-compile";
type PredictionChoice = "stays-high" | "falls" | "unsure";

const predictionReceiptChoices: Readonly<Record<string, PredictionChoice>> = {
  "Accuracy remains near 98%": "stays-high",
  "Accuracy falls materially": "falls",
  "I am unsure": "unsure",
  "Accuracy still supports useful rare-case detection": "stays-high",
  "Minority metrics expose a serious evaluation problem": "falls",
};

function predictionChoiceFromReceipt(choice: string): PredictionChoice | null {
  return predictionReceiptChoices[choice] ?? null;
}
type LeakageTransferSplit =
  "" | "random_row_holdout" | "time_ordered_holdout" | "grouped_store_holdout";
type LeakageTransferRisk =
  | ""
  | "centered_window_reads_future"
  | "model_is_too_simple"
  | "stores_have_different_scales";
type LeakageTransferEvidence =
  | "center_true_uses_later_targets"
  | "random_split_mixes_dates"
  | "metric_is_mae";
type TransferState =
  "locked" | "ready" | "failed" | "passed" | "patching" | "patched";
type ReviewStep = LearnerStageId;

const imbalanceTransferDecisions = new Set<ImbalanceTransferDecision>([
  "approve_high_accuracy",
  "reject_accuracy_only",
  "collect_more_negatives",
]);
const imbalanceTransferMetrics = new Set<ImbalanceTransferMetric>([
  "accuracy",
  "recall_and_pr_auc",
  "negative_specificity",
]);
const imbalanceTransferEvidence = new Set<ImbalanceTransferEvidence>([
  "zero_true_positives",
  "rare_base_rate",
  "many_true_negatives",
]);

function restoredImbalanceDecision(
  value: string | undefined,
): ImbalanceTransferDecision | undefined {
  return value !== undefined &&
    imbalanceTransferDecisions.has(value as ImbalanceTransferDecision)
    ? (value as ImbalanceTransferDecision)
    : undefined;
}

function restoredImbalanceMetric(
  value: string | undefined,
): ImbalanceTransferMetric | undefined {
  return value !== undefined &&
    imbalanceTransferMetrics.has(value as ImbalanceTransferMetric)
    ? (value as ImbalanceTransferMetric)
    : undefined;
}

function restoredImbalanceEvidence(
  values: readonly string[] | undefined,
): ImbalanceTransferEvidence[] {
  return (values ?? []).filter((value): value is ImbalanceTransferEvidence =>
    imbalanceTransferEvidence.has(value as ImbalanceTransferEvidence),
  );
}

const leakageReflectionWhen = [
  {
    id: "repeated-entity",
    text: "rows repeat the same entity",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified familiar-row and new-customer comparison",
  },
  {
    id: "future-observations",
    text: "later observations must represent deployment",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified controlled comparison",
  },
] as const;

const leakageReflectionActions = [
  {
    id: "whole-entities",
    text: "hold out whole entities",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "zero-overlap whole-customer run",
  },
  {
    id: "deployment-boundary",
    text: "place the test boundary where deployment places it",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "held-fixed variables and verified finding",
  },
] as const;

const leakageReflectionReasons = [
  {
    id: "identity-overlap",
    text: "random rows can share identity across train and test",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified entity-overlap evidence",
  },
  {
    id: "claim-match",
    text: "the evaluation must match the population named in the claim",
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "verified new-customer comparison",
  },
] as const;

const leakageTimelineSplits = [
  {
    value: "random_row_holdout",
    label: "Random daily rows",
    description: "Evaluate rows drawn across the recorded date range.",
    visual: "mixed",
  },
  {
    value: "time_ordered_holdout",
    label: "Time-ordered holdout",
    description: "Train on earlier dates, then evaluate later dates.",
    visual: "ordered",
  },
  {
    value: "grouped_store_holdout",
    label: "Whole-store holdout",
    description: "Evaluate new stores while dates may remain mixed.",
    visual: "mixed",
  },
] as const satisfies readonly TimelineSplitOption<LeakageTransferSplit>[];

const leakageTimelineFeatures = [
  {
    value: "model_is_too_simple",
    label: "Model complexity",
    description: "The estimator may underfit nonlinear demand patterns.",
    crossesNow: false,
  },
  {
    value: "centered_window_reads_future",
    label: "Centered rolling target",
    description: "Uses a seven-day window centered on each date.",
    crossesNow: true,
  },
  {
    value: "stores_have_different_scales",
    label: "Store volume scale",
    description: "Records how demand magnitudes differ across stores.",
    crossesNow: false,
  },
] as const satisfies readonly TimelineFeatureOption<LeakageTransferRisk>[];

const leakageTimelineEvidence = [
  {
    value: "center_true_uses_later_targets",
    label: "Centered-window definition",
    description: "The target feature uses a centered seven-day window.",
  },
  {
    value: "random_split_mixes_dates",
    label: "Shuffled-split definition",
    description: "Training and test rows are sampled across dates.",
  },
  {
    value: "metric_is_mae",
    label: "Metric definition",
    description: "The report uses mean absolute error.",
  },
] as const satisfies readonly TimelineEvidenceOption<LeakageTransferEvidence>[];

const leakageRepairChanges = [
  "random rows → whole-customer holdout",
  "identity removed from model input",
  "overlap reported beside accuracy",
] as const;

const leakageRepairPreserves = [
  "target",
  "model family",
  "unrelated cells",
  "original notebook",
] as const;

function sessionProofReady(session: SessionView | null): boolean {
  if (session === null) return false;
  if (session.mode.kind === "live_notebook") {
    return (
      session.state === "PROOF_CAPSULE_ISSUED" &&
      session.proofCapsule !== undefined
    );
  }
  return (
    session.mode.kind === "sample_lesson" && session.proofBundle !== undefined
  );
}

function beliefResponseClosed(session: SessionView | null): boolean {
  return (
    session?.state === "INSUFFICIENT_EVIDENCE" ||
    session?.state === "REJECTED_BY_LEARNER"
  );
}

function restoredStageForSession(
  session: SessionView,
): "claim" | "belief" | "build" | "reality" {
  if (
    session.state === "INGESTED" ||
    session.state === "INSUFFICIENT_EVIDENCE" ||
    session.state === "REJECTED_BY_LEARNER"
  ) {
    return "claim";
  }
  if (
    session.state === "BELIEF_TEST_PROPOSED" ||
    session.state === "BELIEF_TEST_CONFIRMED"
  ) {
    return "belief";
  }
  if (
    session.state === "PREDICTION_COMMITTED" ||
    session.state === "LAB_COMPILING" ||
    session.state === "LAB_REJECTED" ||
    session.state === "LAB_VERIFIED"
  ) {
    return "build";
  }
  return "reality";
}

type BeliefPresentation = {
  schemaVersion: "1" | "2";
  concept: BeliefTest["concept"];
  claim: string;
  current: {
    statement: string;
    predictedOutcome?: string;
    conditions: string[];
    nonClaims: string[];
  };
  competing: {
    statement: string;
    predictedOutcome?: string;
    conditions: string[];
    nonClaims: string[];
  };
  evidenceRefs: BeliefTest["evidenceRefs"];
  alternatives: Array<{ label: string; rationale: string }>;
  limitations: string[];
};

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sessionBeliefNarrativeIssues(
  session: Pick<SessionView, "beliefTest" | "beliefSpec"> | null,
) {
  if (session === null) return [];
  const authority = getSessionBeliefAuthority(session);
  if (authority === undefined) return [];
  if (authority.schemaVersion === "2") {
    return prePredictionNarrativeIssues(authority.beliefSpec);
  }
  return prePredictionBeliefTestNarrativeIssues(authority.beliefTest);
}

function sessionBeliefPresentation(
  session: Pick<SessionView, "beliefTest" | "beliefSpec"> | null,
): BeliefPresentation | undefined {
  if (session === null) return undefined;
  const authority = getSessionBeliefAuthority(session);
  if (authority === undefined) return undefined;
  if (sessionBeliefNarrativeIssues(session).length > 0) return undefined;
  if (authority.schemaVersion === "1") {
    const { beliefTest } = authority;
    const compatibilityView = migrateBeliefTestV1ToV2(beliefTest);
    const [current, competing] = compatibilityView.hypotheses;
    return {
      schemaVersion: "1",
      concept: beliefTest.concept,
      claim: beliefTest.learnerClaim,
      current: {
        ...beliefTest.currentHypothesis,
        conditions: current.conditions,
        nonClaims: current.nonClaims,
      },
      competing: {
        ...beliefTest.competingHypothesis,
        conditions: competing.conditions,
        nonClaims: competing.nonClaims,
      },
      evidenceRefs: compatibilityView.evidenceRefs,
      alternatives: compatibilityView.alternatives.map(
        ({ label, rationale }) => ({ label, rationale }),
      ),
      limitations: uniqueStrings([
        ...current.nonClaims,
        ...competing.nonClaims,
      ]),
    };
  }

  const { beliefSpec } = authority;
  const [current, competing] = beliefSpec.hypotheses;
  return {
    schemaVersion: "2",
    concept: beliefSpec.concept,
    claim: beliefSpec.claim,
    current: {
      statement: current.statement,
      conditions: current.conditions,
      nonClaims: current.nonClaims,
    },
    competing: {
      statement: competing.statement,
      conditions: competing.conditions,
      nonClaims: competing.nonClaims,
    },
    evidenceRefs: beliefSpec.evidenceRefs,
    alternatives: beliefSpec.alternatives.map(({ label, rationale }) => ({
      label,
      rationale,
    })),
    limitations: uniqueStrings([...current.nonClaims, ...competing.nonClaims]),
  };
}

function presentationMode(mode: SessionView["mode"]): Mode {
  if (mode.kind === "sample_lesson") return "instant";
  if (mode.kind === "verified_replay") return "replay";
  return "live";
}

const storageKeys = {
  sessionId: "counterlab.sessionId",
  mode: "counterlab.mode",
  claim: "counterlab.claim",
  claimSessionId: "counterlab.claimSessionId",
  replayStage: "counterlab.replayStage",
  replayId: "counterlab.replayId",
  replayIntro: "counterlab.replayIntro",
  replayTransferState: "counterlab.replayTransferState",
  replayRevision: "counterlab.replayRevision",
  sampleBoundarySessionId: "counterlab.sampleBoundarySessionId",
  activeRunnerJobId: "counterlab.activeRunnerJobId",
  activeRunnerJobKind: "counterlab.activeRunnerJobKind",
} as const;

function SkipLink() {
  return (
    <a className="skip-link" href="#main-content">
      Skip to main content
    </a>
  );
}

function legacyRunnerKind(value: string | null): RunnerJob["kind"] | null {
  return value === "BELIEF_ANALYSIS" ||
    value === "LAB_COMPILE" ||
    value === "LAB_VERIFY" ||
    value === "LAB_RUN" ||
    value === "PATCH_COMPILE" ||
    value === "PATCH_VERIFY"
    ? value
    : null;
}

function storedRunnerCheckpoint(sessionId: string) {
  const current = readActiveRunnerCheckpoint(sessionId, window.localStorage);
  if (current !== null) return current;
  const legacyJobId = window.localStorage.getItem(
    storageKeys.activeRunnerJobId,
  );
  const legacyKind = legacyRunnerKind(
    window.localStorage.getItem(storageKeys.activeRunnerJobKind),
  );
  if (legacyJobId === null || legacyKind === null) return null;
  const migrated = {
    schemaVersion: "1" as const,
    sessionId,
    jobId: legacyJobId,
    kind: legacyKind,
  };
  writeActiveRunnerCheckpoint(migrated, window.localStorage);
  return migrated;
}

function rememberRunnerCheckpoint(sessionId: string, job: RunnerJob) {
  writeActiveRunnerCheckpoint(
    {
      schemaVersion: "1",
      sessionId,
      jobId: job.jobId,
      kind: job.kind,
    },
    window.localStorage,
  );
  // Keep one-release compatibility with child lesson components that still
  // recognize the former pair. The single JSON checkpoint is authoritative.
  window.localStorage.setItem(storageKeys.activeRunnerJobId, job.jobId);
  window.localStorage.setItem(storageKeys.activeRunnerJobKind, job.kind);
}

function forgetRunnerCheckpoint(sessionId: string, jobId?: string) {
  clearActiveRunnerCheckpoint(sessionId, jobId, window.localStorage);
  window.localStorage.removeItem(storageKeys.activeRunnerJobId);
  window.localStorage.removeItem(storageKeys.activeRunnerJobKind);
}

function knownActiveRunnerJobs(sessionId: string): ActiveRunnerRecord[] {
  let jobs: ActiveRunnerRecord[] = [];
  try {
    jobs = listActiveRunnerJobs(sessionId, window.sessionStorage);
  } catch {
    // The legacy reconnect checkpoint below remains available if session
    // storage is blocked by the browser.
  }
  const checkpoint = storedRunnerCheckpoint(sessionId);
  if (
    checkpoint !== null &&
    !jobs.some((job) => job.jobId === checkpoint.jobId)
  ) {
    jobs.push({
      sessionId,
      jobId: checkpoint.jobId,
      kind: checkpoint.kind,
      registeredAt: new Date().toISOString(),
    });
  }
  return jobs;
}

function storedReplayTransferState(): TransferState {
  const stored = window.localStorage.getItem(storageKeys.replayTransferState);
  return stored === "ready" ||
    stored === "failed" ||
    stored === "passed" ||
    stored === "patched"
    ? stored
    : "locked";
}

function resetViewport(focusId?: string) {
  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.setProperty("scroll-behavior", "auto", "important");
  root.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo(0, 0);
  if (focusId !== undefined) {
    document.getElementById(focusId)?.focus({ preventScroll: true });
  }
  window.requestAnimationFrame(() => {
    root.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
    if (previousScrollBehavior === "") {
      root.style.removeProperty("scroll-behavior");
    } else {
      root.style.scrollBehavior = previousScrollBehavior;
    }
  });
}

const percent = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 1,
});

function notebookScoreDisplay(
  artifact: ArtifactView | null,
): PredictionDisplay {
  if (artifact?.fileSha256 === sampleArtifact.fileSha256) {
    if (bundledSampleEvidence.status !== "available") {
      return {
        label: "Score shown in the notebook",
        value: "Verified sample unavailable",
      };
    }
    return {
      label: "Score shown in the notebook",
      value: percent.format(
        bundledSampleEvidence.runs.randomRows.metrics.accuracy,
      ),
    };
  }
  const metric = artifact?.cells.flatMap((cell) => cell.metricCandidates).at(0);
  return metric === undefined
    ? { label: "Displayed notebook metric", value: "Not available" }
    : {
        label: `${metric.name} shown in the notebook`,
        value: metric.value.toLocaleString(),
      };
}

function notebookEvidenceReferences(
  artifact: ArtifactView | null,
): readonly NotebookEvidenceReference[] {
  if (artifact?.fileSha256 === sampleArtifact.fileSha256) {
    if (bundledSampleEvidence.status !== "available") return [];
    return [
      {
        id: "sample-cell-3-output-0",
        reference: "Cell 3 · output 0",
        relevance: "This is the notebook score behind your question.",
        excerpt: `accuracy: ${bundledSampleEvidence.runs.randomRows.metrics.accuracy}`,
      },
      {
        id: "sample-cell-3-source",
        reference: "Cell 3 · source",
        relevance:
          "The split and customer identity determine whether familiar entities cross the test boundary.",
        excerpt:
          "train_test_split includes customer_id among the model inputs.",
      },
    ];
  }
  if (artifact === null) return [];
  const metricReferences = artifact.cells.flatMap((cell) =>
    cell.metricCandidates.map((metric) => ({
      id:
        cell.outputHashes[metric.outputIndex] ??
        `${cell.sourceSha256}-${metric.outputIndex}-${metric.name}`,
      reference: `Cell ${cell.index} · output ${metric.outputIndex}`,
      relevance: `${metric.name} is displayed notebook evidence attached to this question.`,
      excerpt: `${metric.name}: ${metric.value.toLocaleString()}`,
    })),
  );
  if (metricReferences.length > 0) return metricReferences.slice(0, 3);
  return artifact.cells.slice(0, 3).map((cell) => ({
    id: cell.sourceSha256,
    reference: `Cell ${cell.index} · source`,
    relevance: "This safe excerpt is part of the supported notebook evidence.",
    excerpt: cell.sourceExcerpt,
  }));
}

function predictionOptionsFor(
  concept: BeliefTest["concept"] | undefined,
): readonly PredictionOption[] {
  if (concept === "class_imbalance") {
    return [
      {
        value: "stays-high",
        label: "Still support the high-score claim",
        description:
          "Rare-class recall and PR-AUC confirm the overall accuracy.",
      },
      {
        value: "falls",
        label: "Expose a serious minority-class problem",
        description:
          "The majority baseline or missed positives explain the high score.",
      },
      {
        value: "unsure",
        label: "I am unsure",
        description: "The intervention is still worth running.",
      },
    ];
  }
  return [
    {
      value: "stays-high",
      label: "Remain near 98%",
      description: "The notebook result reflects a reusable signal.",
    },
    {
      value: "falls",
      label: "Fall materially",
      description: "The random split is benefiting from repeated identities.",
    },
    {
      value: "unsure",
      label: "I am unsure",
      description: "The intervention is still worth running.",
    },
  ];
}

function interventionExpectation(
  concept: BeliefTest["concept"] | undefined,
  prediction: PredictionChoice | null,
): PredictionDisplay {
  const selected = predictionOptionsFor(concept).find(
    (option) => option.value === prediction,
  );
  return {
    label:
      concept === "class_imbalance"
        ? "Expected minority-performance result"
        : "Expected whole-customer result",
    value: selected?.label ?? "Choose an expectation",
  };
}

type FairTestExplanation = Readonly<{
  whyThisTest: string;
  deploymentMatch: string;
  changedVariable: string;
  heldFixed: readonly string[];
}>;

function fairTestExplanationFor(
  concept: BeliefTest["concept"] | undefined,
): FairTestExplanation {
  if (concept === "class_imbalance") {
    return {
      whyThisTest:
        "Compare headline accuracy with a majority baseline and rare-class errors.",
      deploymentMatch:
        "Rare events must be judged with evidence tied to missed positives at deployment prevalence.",
      changedVariable:
        "Observable: headline accuracy → rare-class precision, recall, and PR-AUC",
      heldFixed: [
        "Fixed fixture",
        "Stratified holdout",
        "Model scores",
        "Random seed",
      ],
    };
  }
  return {
    whyThisTest:
      "Hold out whole customers while keeping the model and scoring setup the same.",
    deploymentMatch:
      "A new-customer claim must be evaluated on customers that were absent from training.",
    changedVariable: "Evaluation unit: random rows → whole customers",
    heldFixed: ["Model family", "Target", "Metric", "Preprocessing", "Seed"],
  };
}

function technicalDetailForEvent(
  event: PublicCompilerEvent,
): PublicTechnicalDetail {
  const label = `Event ${event.cursor} · ${event.kind}`;
  switch (event.kind) {
    case "job.started":
      return { label, value: `${event.eventId} · ${event.at}` };
    case "plan.summary":
      return {
        label,
        value: `${event.title} · ${event.steps.join(" · ")}`,
      };
    case "artifact.read":
      return {
        label,
        value: event.evidenceRefs
          .map((reference) =>
            reference.cellIndex === undefined
              ? reference.kind
              : `Cell ${reference.cellIndex} · ${reference.kind}`,
          )
          .join(" · "),
      };
    case "file.created":
      return { label, value: `${event.path} · SHA-256 ${event.sha256}` };
    case "diff.updated":
      return { label, value: `${event.path}\n${event.unifiedDiff}` };
    case "command.completed":
      return {
        label,
        value: `${event.label} · exit ${event.exitCode} · ${event.durationMs} ms\n${event.excerpt}`,
      };
    case "verifier.rejected":
      return {
        label,
        value: `${event.invariant}\n${event.counterexample}\nObserved: ${JSON.stringify(event.observed)}\nExpected: ${JSON.stringify(event.expected)}`,
      };
    case "repair.started":
      return { label, value: `Bounded repair attempt ${event.attempt}` };
    case "verifier.verified":
      return {
        label,
        value: `${event.invariantCount} invariants · ${event.mutationCount} mutations`,
      };
    case "result.ready":
      return { label, value: `Result SHA-256 ${event.resultHash}` };
    case "job.failed":
      return { label, value: `${event.code} · ${event.message}` };
  }
}

function fairTestRepairStory(
  events: readonly PublicCompilerEvent[],
): FairTestRepairStory | undefined {
  const rejection = events.find(
    (
      event,
    ): event is Extract<PublicCompilerEvent, { kind: "verifier.rejected" }> =>
      event.kind === "verifier.rejected",
  );
  if (rejection === undefined) return undefined;
  const publicFinding = `${rejection.invariant} ${rejection.counterexample} ${JSON.stringify(rejection.observed)}`;
  if (
    !/evaluation[-_ ]unit/iu.test(publicFinding) ||
    !/model/iu.test(publicFinding)
  ) {
    return undefined;
  }
  return {
    firstPlanChanged:
      "The first plan changed both the evaluation unit and the model.",
    whyThatWasFlawed: "That would not tell us which change mattered.",
    repairedBy: "Codex repaired it by changing only the evaluation unit.",
  };
}

function Mark({ name }: { name: "arrow" | "check" | "lock" | "spark" }) {
  const paths = {
    arrow: <path d="M5 12h13m-5-5 5 5-5 5" />,
    check: <path d="m5 12 4 4L19 6" />,
    lock: (
      <path d="M7 11V8a5 5 0 0 1 10 0v3m-8 0h6a2 2 0 0 1 2 2v7H7v-7a2 2 0 0 1 2-2Z" />
    ),
    spark: (
      <path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" />
    ),
  };
  return (
    <svg aria-hidden="true" className="icon" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function EntryIcon({
  name,
}: {
  name: "new" | "sample" | "replay" | "judge" | "proof";
}) {
  const paths = {
    new: <path d="M12 5v14M5 12h14" />,
    sample: (
      <>
        <path d="M9 4h6M10 4v5l-4.5 7.8A2 2 0 0 0 7.2 20h9.6a2 2 0 0 0 1.7-3.2L14 9V4" />
        <path d="M8 15h8" />
      </>
    ),
    replay: (
      <>
        <path d="M5 8V4m0 0h4M5 4a9 9 0 1 1-1.7 10.7" />
        <path d="M12 8v5l3 2" />
      </>
    ),
    judge: (
      <>
        <path d="M12 4v16M7 6h10M5 9l-3 5h6L5 9Zm14 0-3 5h6l-3-5Z" />
        <path d="M8 20h8" />
      </>
    ),
    proof: (
      <>
        <path d="M12 3 5 6v5c0 4.5 2.8 7.8 7 10 4.2-2.2 7-5.5 7-10V6l-7-3Z" />
        <path d="m9 12 2 2 4-5" />
      </>
    ),
  };
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24">
      {paths[name]}
    </svg>
  );
}

function ReplayBanner({ replay }: { replay: VerifiedReplay }) {
  return (
    <aside className="replay-banner" aria-label="Replay status">
      <span className="status-dot" />
      <strong>Verified replay · read-only stored evidence</strong>
      <span>{replay.replayId}</span>
      <span className="replay-meta">
        Recorded {new Date(replay.recordedAt).toLocaleDateString()}
      </span>
    </aside>
  );
}

function Header({
  mode,
  stage,
  session,
  review,
  restart,
}: {
  mode: Mode | null;
  stage: Exclude<Stage, "landing">;
  session: SessionView | null;
  review: (step: ReviewStep) => void;
  restart: () => void;
}) {
  return (
    <header className="topbar">
      <button
        className="wordmark"
        type="button"
        aria-label="CounterLab home"
        onClick={restart}
      >
        <span className="wordmark-mark">C</span>
        <span className="wordmark-copy">
          <strong>CounterLab</strong>
          <small>Learn from a fair test</small>
        </span>
      </button>
      <div
        className="learner-progress-slot"
        id="learner-progress"
        tabIndex={-1}
      >
        <LearnerProgress
          stage={stage}
          {...(session === null ? {} : { sessionState: session.state })}
          onReviewStage={review}
        />
      </div>
      <div className="topbar-context">
        <span className="mode-light" />
        <span>
          {mode === "replay"
            ? "Verified replay · read-only"
            : mode === "live"
              ? "Live notebook analysis"
              : "Verified sample lesson"}
        </span>
      </div>
      <button className="start-over-control" type="button" onClick={restart}>
        Start over
      </button>
    </header>
  );
}

function Landing({
  claim,
  updateClaim,
  attachNotebook,
  testClaim,
  chooseMode,
  busy,
  recentSessions,
}: {
  claim: string;
  updateClaim: (claim: string) => void;
  attachNotebook: (file: File) => void;
  testClaim: () => void;
  chooseMode: (mode: Mode) => void;
  busy: boolean;
  recentSessions: readonly RouteRecoveryRecentSession[];
}) {
  const hint = subjectPackHint(undefined, "question");
  const [railOpen, setRailOpen] = useState(false);
  const railToggleRef = useRef<HTMLButtonElement>(null);
  const proofDetailsRef = useRef<HTMLDetailsElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!railOpen) return;

    const closeRail = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setRailOpen(false);
      railToggleRef.current?.focus();
    };

    window.addEventListener("keydown", closeRail);
    return () => window.removeEventListener("keydown", closeRail);
  }, [railOpen]);
  const startSample = () => {
    setRailOpen(false);
    updateClaim("");
    chooseMode("instant");
  };
  const openReplay = () => {
    setRailOpen(false);
    updateClaim("");
    chooseMode("replay");
  };

  return (
    <main
      className="landing landing-question-first"
      id="main-content"
      tabIndex={-1}
    >
      <section className="landing-canvas" aria-labelledby="landing-title">
        <div className="question-first-layout">
          <section className="landing-question-column">
            <div className="landing-intro">
              <h1 id="landing-title" tabIndex={-1}>
                What result are you trying to understand?
              </h1>
              <p className="landing-trust-summary">
                Ask a question or attach a supported notebook. CounterLab reads
                the evidence and never runs its cells.
              </p>
            </div>

            <QuestionComposer
              value={claim}
              onChange={updateClaim}
              onAttachNotebook={attachNotebook}
              onSubmit={testClaim}
              inputRef={composerInputRef}
              busy={busy}
            />

            <button
              className="landing-mobile-sample"
              type="button"
              disabled={busy}
              onClick={startSample}
            >
              Start verified sample lesson <span aria-hidden="true">→</span>
            </button>
          </section>

          <aside
            className="landing-belief-break"
            aria-label="Locked fair-test preview"
          >
            <LockedBeliefBreakPreview density="strip" />
          </aside>

          <div
            className="landing-proof-note"
            id="landing-support-note"
            tabIndex={-1}
          >
            <p className="landing-trust-line">
              No account needed <span aria-hidden="true">·</span> Sample, live,
              and replay stay clearly labelled
            </p>
            <details
              ref={proofDetailsRef}
              className="landing-evidence-disclosure"
            >
              <summary>Evidence &amp; proof</summary>
              <div>
                <p>
                  Fixed kernels calculate the result, then frozen checks verify
                  the evidence binding before it appears.
                </p>
                <p id="landing-supported-evidence">
                  <strong>Supported today:</strong> documented
                  Python/scikit-learn Jupyter notebooks for entity leakage and
                  class imbalance. Unsupported evidence is refused, not guessed.
                </p>
              </div>
            </details>
            <NeedAHint
              hintId={hint.id}
              hint={hint.copy}
              evidenceHref="#landing-supported-evidence"
              evidenceLabel="Review the supported evidence boundary"
            />
          </div>

          {recentSessions.length > 0 ? (
            <details className="landing-recent-work">
              <summary>Recent work from this browser</summary>
              <ul>
                {recentSessions.map((session) => (
                  <li key={session.id}>
                    <button
                      type="button"
                      disabled={session.disabled}
                      onClick={session.onOpen}
                    >
                      <strong>{session.title}</strong>
                      <span>{learnerSessionStatusLabel(session.status)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      <aside className="landing-rail" aria-label="CounterLab entry paths">
        <div className="landing-rail-header">
          <div className="landing-rail-brand" aria-label="CounterLab">
            <span aria-hidden="true">C</span>
            <strong>CounterLab</strong>
          </div>
          <button
            ref={railToggleRef}
            className="landing-menu-toggle"
            type="button"
            aria-controls="landing-rail-navigation"
            aria-expanded={railOpen}
            onClick={() => setRailOpen((open) => !open)}
          >
            Modes
          </button>
        </div>

        <nav
          className={`landing-rail-navigation ${railOpen ? "is-open" : ""}`}
          id="landing-rail-navigation"
          aria-label="Start a CounterLab investigation"
        >
          <button
            className="landing-new-question"
            type="button"
            aria-label="New question"
            onClick={() => {
              setRailOpen(false);
              updateClaim("");
              composerInputRef.current?.focus();
            }}
          >
            <span className="landing-rail-icon" aria-hidden="true">
              <EntryIcon name="new" />
            </span>
            <span className="landing-rail-label">New question</span>
          </button>

          <div className="landing-rail-group">
            <span>Start with evidence</span>
            <button
              type="button"
              disabled={busy}
              aria-label="Try verified sample"
              onClick={startSample}
            >
              <span className="landing-rail-icon" aria-hidden="true">
                <EntryIcon name="sample" />
              </span>
              <span className="landing-rail-label">Verified sample</span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-label="Watch verified replay"
              onClick={openReplay}
            >
              <span className="landing-rail-icon" aria-hidden="true">
                <EntryIcon name="replay" />
              </span>
              <span className="landing-rail-label">Verified replay</span>
            </button>
          </div>

          <div className="landing-rail-group landing-rail-secondary">
            <a href="/judge" aria-label="Judge Mode">
              <span className="landing-rail-icon" aria-hidden="true">
                <EntryIcon name="judge" />
              </span>
              <span className="landing-rail-label">Judge Mode</span>
            </a>
            <a
              href="#landing-support-note"
              aria-label="How proof works"
              onClick={() => {
                setRailOpen(false);
                if (proofDetailsRef.current !== null) {
                  proofDetailsRef.current.open = true;
                  proofDetailsRef.current.querySelector("summary")?.focus();
                }
              }}
            >
              <span className="landing-rail-icon" aria-hidden="true">
                <EntryIcon name="proof" />
              </span>
              <span className="landing-rail-label">How proof works</span>
            </a>
          </div>
        </nav>
      </aside>
    </main>
  );
}

function ClaimScreen({
  artifact,
  fixedSample,
  claim,
  updateClaim,
  analysisPreview,
  sensitiveContentApproved,
  setSensitiveContentApproved,
  cancelPreview,
  continueToBelief,
  uploadNotebook,
  requiresFreshSession,
  startFreshSession,
  busy,
}: {
  artifact: ArtifactView;
  fixedSample: boolean;
  claim: string;
  updateClaim: (claim: string) => void;
  analysisPreview: BeliefAnalysisPreview | null;
  sensitiveContentApproved: boolean;
  setSensitiveContentApproved: (approved: boolean) => void;
  cancelPreview: () => void;
  continueToBelief: () => void;
  uploadNotebook: (file: File) => void;
  requiresFreshSession: boolean;
  startFreshSession: () => void;
  busy: boolean;
}) {
  const isSample = fixedSample;
  const supported = artifact.support.status === "SUPPORTED";
  const evidenceReferences = notebookEvidenceReferences(artifact);
  const headlineMetric = notebookScoreDisplay(artifact);
  return (
    <main className="workspace shell" id="main-content" tabIndex={-1}>
      <div className="screen-intro">
        <p className="eyebrow">Question · Your idea</p>
        <h1>What do you think the score means?</h1>
        <p>Write one sentence about who you think this model will work for.</p>
      </div>

      <LearnerCoach
        next="say what you believe the score tells us."
        why="A high score is a result, but the notebook evidence does not yet show whether it generalizes to completely new customers."
      />

      {requiresFreshSession && (
        <section className="support-warning" role="status">
          <strong>Your response closed that explanation.</strong>
          <p>
            Your notebook and claim are preserved. Start a fresh investigation
            before asking CounterLab to frame another comparison.
          </p>
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={startFreshSession}
          >
            Revise in a new investigation <Mark name="arrow" />
          </button>
        </section>
      )}

      <div className="claim-layout">
        <section className="notebook-card" aria-labelledby="artifact-title">
          <div className="notebook-topline">
            <span className="file-chip">.ipynb</span>
            <span
              className={supported ? "verified-chip" : "support-chip rejected"}
            >
              {supported && <Mark name="check" />} {artifact.support.status}
            </span>
          </div>
          <h2 id="artifact-title">
            {isSample ? sampleArtifact.title : "Uploaded notebook evidence"}
          </h2>
          <p className="file-name">{artifact.fileName}</p>
          <NotebookEvidenceStory
            title="What this notebook actually shows"
            headlineMetric={headlineMetric}
            references={evidenceReferences}
            integrity={[
              {
                label: "Notebook SHA-256",
                value: artifact.fileSha256,
              },
              {
                label: "Evidence cells",
                value: String(artifact.cells.length),
              },
              {
                label: "Support decision",
                value: artifact.support.status,
              },
            ]}
          />
          {artifact.support.reasons.length > 0 && (
            <div className="support-warning" role="status">
              <strong>Notebook support limits</strong>
              <ul>
                {artifact.support.reasons.map((reason) => (
                  <li key={`${reason.code}-${reason.cellIndex ?? "artifact"}`}>
                    {reason.code}: {reason.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {artifact.support.status !== "SUPPORTED" && (
            <aside
              className="unsupported-guide"
              aria-label="Unsupported notebook guidance"
            >
              <span>Honest refusal</span>
              <strong>
                We parsed the notebook. We will not invent a lab for it.
              </strong>
              <p>
                CounterLab advances only when the evidence resolves to a tested
                concept pack. Unsupported subjects and dependencies stay visible
                as limits instead of becoming model guesses.
              </p>
            </aside>
          )}
          <label className="upload-control">
            <span className="upload-title">
              <Mark name="spark" /> Use a different notebook
            </span>
            <input
              type="file"
              accept=".ipynb,application/x-ipynb+json,application/json"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) uploadNotebook(file);
              }}
            />
            <small>
              Jupyter <code>.ipynb</code> only. We inspect cells here; we do not
              run them.
            </small>
          </label>
        </section>

        <section className="claim-form panel" aria-labelledby="claim-prompt">
          <div>
            <p className="eyebrow">
              {isSample ? "Fixed practice question" : "In your words"}
            </p>
            <h2 id="claim-prompt">
              {isSample ? "Test one bounded question" : "Finish this thought"}
            </h2>
            <p>
              {isSample
                ? SAMPLE_LEAKAGE_QUESTION
                : "“Because the notebook scored highly, I think the model…”"}
            </p>
          </div>
          {isSample ? (
            <div className="lock-notice" role="note">
              <Mark name="lock" />
              <strong>Approved sample framing</strong>
              <span>
                This bundled lesson does not analyze or sign a custom claim. Its
                pre-authored question and explanations are the only framing that
                enters the proof record.
              </span>
            </div>
          ) : (
            <>
              <label htmlFor="learner-claim">Your claim</label>
              <button
                className="claim-starter"
                type="button"
                onClick={() =>
                  updateClaim(
                    "I think the high score means the model will work for completely new customers.",
                  )
                }
              >
                <Mark name="spark" /> Use a starter claim
              </button>
              <textarea
                id="learner-claim"
                value={claim}
                onChange={(event) => updateClaim(event.target.value)}
                placeholder="I think this score means the model will work for…"
                rows={7}
              />
            </>
          )}
          {isSample ? (
            <div className="form-footer">
              <span>Verified sample · fixed framing</span>
              <button
                className="button button-primary"
                type="button"
                disabled={!supported || requiresFreshSession || busy}
                onClick={continueToBelief}
              >
                Compare two explanations <Mark name="arrow" />
              </button>
            </div>
          ) : analysisPreview === null ? (
            <div className="form-footer">
              <span>{claim.trim().length} characters</span>
              <button
                className="button button-primary"
                type="button"
                disabled={
                  claim.trim().length < 12 ||
                  !supported ||
                  requiresFreshSession ||
                  busy
                }
                onClick={continueToBelief}
              >
                Compare two explanations <Mark name="arrow" />
              </button>
            </div>
          ) : (
            <section
              className="analyst-preview"
              aria-labelledby="analyst-preview-title"
            >
              <div className="analyst-preview-head">
                <div>
                  <p className="eyebrow aqua">Your approval boundary</p>
                  <h3 id="analyst-preview-title">
                    Review the evidence sent for analysis
                  </h3>
                </div>
                <span className="concept-chip">
                  {analysisPreview.conceptTitle}
                </span>
              </div>
              <PrivacyPacketSummary
                packet={{ exactPacket: analysisPreview.sanitizedContent }}
              />
              {analysisPreview.requiresSensitiveApproval && (
                <label className="sensitive-approval">
                  <input
                    type="checkbox"
                    checked={sensitiveContentApproved}
                    onChange={(event) =>
                      setSensitiveContentApproved(event.target.checked)
                    }
                  />
                  <span>
                    I reviewed the exact redacted packet and understand that
                    automated redaction can miss identifiers.
                  </span>
                </label>
              )}
              <div className="analyst-preview-actions">
                <button
                  className="button button-primary"
                  type="button"
                  disabled={
                    busy ||
                    (analysisPreview.requiresSensitiveApproval &&
                      !sensitiveContentApproved)
                  }
                  onClick={continueToBelief}
                >
                  Send this evidence <Mark name="arrow" />
                </button>
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={busy}
                  onClick={cancelPreview}
                >
                  Change my claim
                </button>
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}

function BeliefScreen({
  claim,
  belief,
  fixedSampleFraming,
  notebookScore,
  confirmed,
  confirm,
  prediction,
  setPrediction,
  confidence,
  setConfidence,
  commitPrediction,
  editClaim,
  stop,
}: {
  claim: string;
  belief?: BeliefPresentation | undefined;
  fixedSampleFraming: boolean;
  notebookScore: PredictionDisplay;
  confirmed: boolean;
  confirm: () => void;
  prediction: PredictionChoice | null;
  setPrediction: (value: PredictionChoice) => void;
  confidence: number;
  setConfidence: (value: number) => void;
  commitPrediction: () => void;
  editClaim: () => void;
  stop: (reason: "rejected" | "insufficient") => void;
}) {
  const copy =
    belief?.concept === "class_imbalance"
      ? {
          currentHypothesis:
            "The high overall score means the model catches the rare cases that matter.",
          currentPrediction:
            "Minority recall should also be strong and clearly beat a majority-only baseline.",
          competingHypothesis:
            "The common class makes accuracy look excellent even when rare cases are missed.",
          competingPrediction:
            "A majority baseline will look similar while recall and PR-AUC expose the misses.",
          fairTest:
            "Compare the same predictions with overall and class-specific measures.",
          intervention:
            "The proposed comparison keeps the data and model fixed while changing only what is measured. Exact operations appear after your Prediction is sealed.",
          help: "If accuracy reflects useful rare-event detection, recall should stay strong and beat the majority baseline. If overall accuracy obscures rare-case behavior, class-specific measures will differ.",
          conditions:
            "This comparison applies to the supplied rare-event notebook and its registered evaluation pattern.",
          currentNonClaim:
            "It does not establish performance for every rare event, threshold, or deployment prevalence.",
          competingNonClaim:
            "It does not establish that every high-accuracy classifier ignores the rare class.",
          alternativesAndLimits:
            "Threshold choice, prevalence shift, and asymmetric error costs remain open considerations. This bounded comparison does not establish production quality or causality.",
        }
      : {
          currentHypothesis:
            "The model learned a useful pattern that will work for new customers.",
          currentPrediction:
            "The score should remain close to the notebook's familiar-row score for new customers.",
          competingHypothesis:
            "The model partly remembers customers it already saw.",
          competingPrediction:
            "The score changes when the test contains only new customers.",
          fairTest: "Compare the same model across two evaluation boundaries.",
          intervention:
            "The proposed comparison keeps the model fixed while changing only who appears in the test. Exact operations appear after your Prediction is sealed.",
          help: "If the model learned a reusable pattern, the score should stay high. If it remembers customers, the score should fall. The two ideas now predict different outcomes.",
          conditions:
            "This comparison applies to the supplied notebook and its question about unseen customers.",
          currentNonClaim:
            "It does not establish performance for every customer population or future deployment.",
          competingNonClaim:
            "It does not establish that every repeated-entity dataset contains identity leakage.",
          alternativesAndLimits:
            "Class balance and temporal drift remain open alternatives. This bounded comparison does not establish production performance or causality.",
        };
  // Before Prediction, learner-facing hypotheses come only from this closed
  // Subject Pack framing. Model-authored prose remains evidence, never UI
  // authority for a retrospective verdict, result value, or repair directive.
  const currentModel: DuelModel = {
    statement: copy.currentHypothesis,
    prediction: copy.currentPrediction,
    conditions: [copy.conditions],
    nonClaims: [copy.currentNonClaim],
  };
  const alternativeModel: DuelModel = {
    statement: copy.competingHypothesis,
    prediction: copy.competingPrediction,
    conditions: [copy.conditions],
    nonClaims: [copy.competingNonClaim],
  };
  const predictionOptions = predictionOptionsFor(belief?.concept);

  return (
    <main className="workspace shell" id="main-content" tabIndex={-1}>
      <div className="screen-intro compact">
        <p className="eyebrow">Prediction · Your explanation</p>
        <h1>Check your explanation before the test.</h1>
        <p>
          Both ideas could explain the high score. A fair test will separate
          them.
        </p>
      </div>

      <LearnerCoach
        next="check the two ideas, then lock your prediction."
        why="Both explanations fit the score you have. Sealing an expectation before the fair test makes the later comparison honest."
      />

      <section className="claim-quote" aria-label="Investigation question">
        <span>
          {fixedSampleFraming ? "Fixed sample question" : "Your claim"}
        </span>
        <blockquote>{claim}</blockquote>
      </section>

      {fixedSampleFraming && (
        <section className="lock-notice" role="note">
          <Mark name="lock" />
          <strong>Approved sample framing</strong>
          <span>
            These explanations are pre-authored for this fixed sample. No model
            analyzed your draft, and only the question above enters the proof
            record.
          </span>
        </section>
      )}

      <ModelDuel
        current={currentModel}
        alternative={alternativeModel}
        confirmed={confirmed}
        onConfirm={confirm}
        onEdit={editClaim}
        onInsufficientEvidence={() => stop("insufficient")}
        onReject={() => stop("rejected")}
      />

      <details className="prediction-proof">
        <summary>Evidence &amp; proof</summary>
        <div className="prediction-proof-body">
          <section className="evidence-strip" aria-label="Evidence references">
            {belief === undefined ? (
              <>
                <span className="evidence-chip">
                  Cell 3 · source <strong>customer_id encoded</strong>
                </span>
                <span className="evidence-chip">
                  Cell 3 · output 0 <strong>98.5% accuracy</strong>
                </span>
                <span className="evidence-chip">
                  Schema <strong>480 repeated customers</strong>
                </span>
              </>
            ) : (
              belief.evidenceRefs.slice(0, 3).map((evidence) => (
                <span className="evidence-chip" key={evidence.hash}>
                  {evidence.cellIndex === undefined
                    ? evidence.kind
                    : `Cell ${evidence.cellIndex}${
                        evidence.outputIndex === undefined
                          ? " · source"
                          : ` · output ${evidence.outputIndex}`
                      }`}{" "}
                  <strong>
                    {evidence.kind === "metric"
                      ? "Notebook-reported metric selected as evidence."
                      : evidence.kind === "code"
                        ? "Notebook evaluation source selected as evidence."
                        : evidence.kind === "schema"
                          ? "Notebook schema selected as evidence."
                          : "Resolved notebook evidence selected for this comparison."}
                  </strong>
                  <small>{evidence.excerpt}</small>
                </span>
              ))
            )}
          </section>

          <section className="intervention panel">
            <div>
              <p className="eyebrow">Proposed comparison</p>
              <h2>{copy.fairTest}</h2>
              <p>{copy.intervention}</p>
            </div>
            <details>
              <summary>Alternatives, limitations, and uncertainty</summary>
              <p>{copy.alternativesAndLimits}</p>
              <p>
                Pre-result explanation wording comes from the reviewed Subject
                Pack. Model proposals cannot supply result, verdict, or repair
                copy on this screen.
              </p>
            </details>
          </section>

          <details className="concept-help panel">
            <summary>Why can this test teach us something?</summary>
            <p>{copy.help}</p>
          </details>
        </div>
      </details>

      {confirmed && (
        <PredictionSeal
          notebookScore={notebookScore}
          interventionExpectation={interventionExpectation(
            belief?.concept,
            prediction,
          )}
          options={predictionOptions}
          choice={prediction}
          confidence={confidence}
          committed={false}
          onChoiceChange={(choice) => {
            if (
              choice === "stays-high" ||
              choice === "falls" ||
              choice === "unsure"
            ) {
              setPrediction(choice);
            }
          }}
          onConfidenceChange={setConfidence}
          onCommit={commitPrediction}
        />
      )}
    </main>
  );
}

function WithheldBeliefScreen({
  claim,
  restart,
}: {
  claim: string;
  restart: () => void;
}) {
  return (
    <main
      className="workspace shell narrow"
      id="main-content"
      tabIndex={-1}
      role="alert"
    >
      <div className="screen-intro">
        <p className="eyebrow">Prediction · Explanation withheld</p>
        <h1>CounterLab refused unsafe pre-result wording.</h1>
        <p>
          The proposed explanation contained an unbound result, verdict, or
          repair instruction. No Prediction was sealed and no test result was
          released.
        </p>
      </div>
      <section className="claim-quote" aria-label="Investigation question">
        <span>Your claim</span>
        <blockquote>{claim}</blockquote>
      </section>
      <button className="button button-primary" type="button" onClick={restart}>
        Start a fresh investigation <Mark name="arrow" />
      </button>
    </main>
  );
}

function BuildScreen({
  mode,
  resultReady,
  notebookScore,
  concept,
  predictionChoice,
  sealedCategoricalChoice,
  confidence,
  openResult,
}: {
  mode: Mode;
  resultReady: boolean;
  notebookScore: PredictionDisplay;
  concept: BeliefTest["concept"] | undefined;
  predictionChoice: PredictionChoice | null;
  sealedCategoricalChoice: string | null;
  confidence: number;
  openResult: () => void;
}) {
  const fairTest = fairTestExplanationFor(concept);
  return (
    <main className="workspace shell" id="main-content" tabIndex={-1}>
      <div className="screen-intro compact">
        <p className="eyebrow">Test · What happened</p>
        <h1>
          {resultReady ? "The result is ready." : "The fair test is ready."}
        </h1>
        <p>
          {resultReady
            ? "Your answer was locked first. CounterLab has now run and checked the fairer test."
            : "Your answer is locked. CounterLab verified the plan, but it has not released a result yet."}
        </p>
      </div>

      <LearnerCoach
        next="review the completed checks, then reveal the result."
        why="Your prediction is sealed, and the result comes from the verified fixed-kernel test rather than the tutor."
      />

      {sealedCategoricalChoice === null ? (
        <div className="lock-notice">
          <Mark name="lock" />
          <strong>Stored replay prediction</strong>
          <span>The replay preserves the recorded pre-result evidence.</span>
        </div>
      ) : (
        <PredictionSeal
          notebookScore={notebookScore}
          interventionExpectation={interventionExpectation(
            concept,
            predictionChoice,
          )}
          options={predictionOptionsFor(concept)}
          choice={sealedCategoricalChoice}
          confidence={confidence}
          committed
          onChoiceChange={() => undefined}
          onConfidenceChange={() => undefined}
          onCommit={() => undefined}
        />
      )}

      <div className="continue-row">
        <p>Ready? Compare your prediction with what the test found.</p>
        <button
          className="button button-primary"
          type="button"
          onClick={openResult}
        >
          {resultReady ? "Show me what happened" : "Run the fair test"}{" "}
          <Mark name="arrow" />
        </button>
      </div>

      <FairTestBuilder
        {...fairTest}
        events={[]}
        verificationState="verified"
        sanitizedTechnicalDetails={[
          {
            label: "Mode",
            value:
              mode === "replay"
                ? "Verified replay"
                : mode === "live"
                  ? "Live notebook"
                  : "Verified sample",
          },
          { label: "Result authority", value: "Fixed kernel" },
          {
            label: "Release state",
            value: resultReady
              ? "Verified result stored"
              : "Verified plan; result not released",
          },
        ]}
      />
    </main>
  );
}

const semanticOperations = {
  random_row_split: "leakage.random_row_split",
  customer_group_split: "leakage.group_holdout",
  identity_ablation: "leakage.identity_ablation",
} as const;

function resultRun(
  result: LeakageVerifiedResultSet,
  id: keyof typeof semanticOperations,
) {
  const run = result.runs.find(
    (candidate) =>
      candidate.id === id ||
      ("operation" in candidate &&
        candidate.operation === semanticOperations[id]),
  );
  if (run === undefined)
    throw new Error(`Verified result is missing semantic run ${id}`);
  return run;
}

function ResultTable({ result }: { result: LeakageVerifiedResultSet }) {
  const runs = [
    resultRun(result, "random_row_split"),
    resultRun(result, "customer_group_split"),
    resultRun(result, "identity_ablation"),
  ];
  return (
    <div className="table-wrap">
      <table>
        <caption>
          Verified experiment metrics. Accuracy and ROC AUC are proportions.
        </caption>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Split</th>
            <th scope="col">Accuracy</th>
            <th scope="col">ROC AUC</th>
            <th scope="col">Test n</th>
            <th scope="col">Customer overlap</th>
            <th scope="col">Seed</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <th scope="row">{run.id.replaceAll("_", " ")}</th>
              <td>{run.splitStrategy}</td>
              <td>{percent.format(run.metrics.accuracy)}</td>
              <td>
                {run.metrics.rocAuc === null
                  ? "n/a"
                  : run.metrics.rocAuc.toFixed(3)}
              </td>
              <td>{run.sampleSizes.test}</td>
              <td>
                {run.entityOverlap.count} (
                {percent.format(run.entityOverlap.rate)})
              </td>
              <td>{run.seed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImbalanceReviewScreen({
  step,
  claim,
  session,
  result,
  returnToCurrent,
  restart,
}: {
  step: ReviewStep;
  claim: string;
  session: SessionView | null;
  result: ImbalanceVerifiedResultSet;
  returnToCurrent: () => void;
  restart: () => void;
}) {
  const belief = sessionBeliefPresentation(session);
  const majority = result.runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const stratified = result.runs.find(
    (run) => run.operation === "imbalance.stratified_holdout",
  );
  if (majority === undefined || stratified === undefined) {
    throw new Error("Verified imbalance result is missing required runs");
  }
  const titles: Record<ReviewStep, string> = {
    question: "Review your original question",
    prediction: "Review your prediction",
    test: "Review the rare-event test",
    boundary: "Review the verified boundary",
    apply: "Review how you applied the lesson",
    repair: "Review the verified repair",
  };
  return (
    <main
      className="workspace shell lesson-review"
      id="main-content"
      tabIndex={-1}
    >
      <div className="screen-intro compact">
        <p className="eyebrow">Lesson map · Saved step</p>
        <h1 id="review-title" tabIndex={-1}>
          {titles[step]}
        </h1>
        <p>Saved evidence stays read-only while you inspect this step.</p>
      </div>
      <aside className="review-notice" role="note">
        <Mark name="lock" />
        <div>
          <strong>Saved evidence is read-only.</strong>
          <span>Your current lesson remains exactly where you left it.</span>
        </div>
      </aside>
      <section className="review-card panel">
        {step === "question" && (
          <>
            <p className="eyebrow">The result you questioned</p>
            <div className="review-score-row">
              <strong>{percent.format(majority.metrics.accuracy)}</strong>
              <div>
                <span>Accuracy can hide the rare class</span>
                <p>The majority baseline catches no positive cases.</p>
              </div>
            </div>
            <blockquote>{claim}</blockquote>
          </>
        )}
        {step === "prediction" && (
          <>
            <p className="eyebrow purple">Your committed guess</p>
            <h2>{session?.prediction?.choice ?? "Prediction not committed"}</h2>
            <p>
              {belief?.competing.statement ??
                "Class rarity can make a weak detector look accurate."}
            </p>
          </>
        )}
        {step === "test" && (
          <>
            <p className="eyebrow aqua">Verified Test</p>
            <h2>
              CounterLab measured the minority class, not only the headline.
            </h2>
            <ul className="review-checks">
              <li>
                <Mark name="check" /> Computed majority baseline
              </li>
              <li>
                <Mark name="check" /> Confusion totals match sample size
              </li>
              <li>
                <Mark name="check" /> Threshold and prevalence respond
              </li>
            </ul>
          </>
        )}
        {step === "boundary" && (
          <>
            <p className="eyebrow gold">Verified lesson</p>
            <div className="review-result-change">
              <span>
                Accuracy{" "}
                <strong>{percent.format(majority.metrics.accuracy)}</strong>
              </span>
              <Mark name="arrow" />
              <span>
                Rare-class recall{" "}
                <strong>{percent.format(stratified.metrics.recall)}</strong>
              </span>
            </div>
            <blockquote>
              Accuracy alone does not show whether rare cases are detected.
            </blockquote>
          </>
        )}
        {step === "apply" && (
          <>
            <p className="eyebrow gold">Saved transfer</p>
            <h2>Apply the metric that matches the cost of misses.</h2>
            <blockquote>
              {session?.revision ?? "Write a reusable evaluation rule."}
            </blockquote>
          </>
        )}
        {step === "repair" && (
          <>
            <p className="eyebrow aqua">Verified repair</p>
            <h2>
              {session?.patchResult === undefined
                ? "Repair remains locked until transfer passes."
                : "The repaired copy reports rare-class evidence beside accuracy."}
            </h2>
          </>
        )}
      </section>
      <div className="review-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={returnToCurrent}
        >
          Return to current step <Mark name="arrow" />
        </button>
        <button className="button button-quiet" type="button" onClick={restart}>
          Start a new lesson
        </button>
      </div>
    </main>
  );
}

function ReviewScreen({
  step,
  claim,
  artifact,
  session,
  result,
  returnToCurrent,
  restart,
}: {
  step: ReviewStep;
  claim: string;
  artifact: ArtifactView | null;
  session: SessionView | null;
  result?: VerifiedResultSet;
  returnToCurrent: () => void;
  restart: () => void;
}) {
  const belief = sessionBeliefPresentation(session);
  if (result?.concept === "class_imbalance") {
    return (
      <ImbalanceReviewScreen
        step={step}
        claim={claim}
        session={session}
        result={result as ImbalanceVerifiedResultSet}
        returnToCurrent={returnToCurrent}
        restart={restart}
      />
    );
  }
  const leakageResult =
    result?.concept === "entity_leakage"
      ? (result as LeakageVerifiedResultSet)
      : undefined;
  const random =
    leakageResult === undefined
      ? undefined
      : resultRun(leakageResult, "random_row_split");
  const group =
    leakageResult === undefined
      ? undefined
      : resultRun(leakageResult, "customer_group_split");
  const artifactMetric = artifact?.cells
    .flatMap((cell) => cell.metricCandidates)
    .at(0);
  const titles: Record<ReviewStep, string> = {
    question: "Review your original question",
    prediction: "Review your prediction",
    test: "Review the fair test",
    boundary: "Review the verified boundary",
    apply: "Review how you applied the lesson",
    repair: "Review the verified repair",
  };

  return (
    <main
      className="workspace shell lesson-review"
      id="main-content"
      tabIndex={-1}
    >
      <div className="screen-intro compact">
        <p className="eyebrow">Lesson map · Saved step</p>
        <h1 id="review-title" tabIndex={-1}>
          {titles[step]}
        </h1>
        <p>
          This is the evidence saved at that point in your lesson. Inspect it
          without losing your current place.
        </p>
      </div>

      <aside className="review-notice" role="note">
        <Mark name="lock" />
        <div>
          <strong>Saved evidence is read-only.</strong>
          <span>Start a new lesson if you want to make different choices.</span>
        </div>
      </aside>

      {step === "question" && (
        <section className="review-card panel">
          <p className="eyebrow">The result you questioned</p>
          <div className="review-score-row">
            <strong>
              {random !== undefined
                ? percent.format(random.metrics.accuracy)
                : (artifactMetric?.value.toLocaleString() ?? "Evidence saved")}
            </strong>
            <div>
              <span>{artifactMetric?.name ?? "Notebook evidence"}</span>
              <p>
                This is the artifact evidence attached to the question, not a
                newly computed result.
              </p>
            </div>
          </div>
          <blockquote>{claim}</blockquote>
        </section>
      )}

      {step === "prediction" && (
        <section className="review-card panel">
          <p className="eyebrow purple">Your committed guess</p>
          <h2>
            {session?.prediction?.choice ?? "Prediction not yet committed"}
          </h2>
          {session?.prediction !== undefined && (
            <p className="review-confidence">
              Confidence <strong>{session.prediction.confidence}%</strong>
            </p>
          )}
          <div className="review-hypotheses">
            <article>
              <span>Story A</span>
              <strong>
                {belief?.current.statement ??
                  "The score reflects a reusable pattern."}
              </strong>
            </article>
            <article>
              <span>Story B</span>
              <strong>
                {belief?.competing.statement ??
                  "Repeated customer identity inflated the score."}
              </strong>
            </article>
          </div>
        </section>
      )}

      {step === "test" && (
        <section className="review-card panel">
          <p className="eyebrow aqua">Verified Test</p>
          <h2>CounterLab changed the customer boundary—not the answer.</h2>
          <ul className="review-checks">
            <li>
              <Mark name="check" /> Same model, target, and seed
            </li>
            <li>
              <Mark name="check" /> Zero customer overlap
            </li>
            <li>
              <Mark name="check" /> Repeated result hash
            </li>
            <li>
              <Mark name="check" /> Invalid alternatives rejected
            </li>
          </ul>
        </section>
      )}

      {step === "boundary" && (
        <section className="review-card panel">
          <p className="eyebrow gold">Verified lesson</p>
          {random !== undefined && group !== undefined ? (
            <div className="review-result-change">
              <span>
                Familiar rows{" "}
                <strong>{percent.format(random.metrics.accuracy)}</strong>
              </span>
              <Mark name="arrow" />
              <span>
                New customers{" "}
                <strong>{percent.format(group.metrics.accuracy)}</strong>
              </span>
            </div>
          ) : (
            <p>No verified result was released for this session.</p>
          )}
          <blockquote>
            A score on familiar rows does not establish performance for new
            entities.
          </blockquote>
        </section>
      )}

      {step === "apply" && (
        <section className="review-card panel">
          <p className="eyebrow gold">Saved transfer</p>
          <h2>Apply the same boundary to a surface-different case.</h2>
          <blockquote>
            {session?.revision ??
              "Write a reusable rule to complete this lesson."}
          </blockquote>
        </section>
      )}

      {step === "repair" && (
        <section className="review-card panel">
          <p className="eyebrow aqua">Verified repair</p>
          <h2>
            {session?.patchResult === undefined
              ? "Repair remains locked until transfer passes."
              : "The repaired copy uses a whole-entity holdout."}
          </h2>
        </section>
      )}

      <div className="review-actions">
        <button
          className="button button-primary"
          type="button"
          onClick={returnToCurrent}
        >
          Return to current step <Mark name="arrow" />
        </button>
        <button className="button button-quiet" type="button" onClick={restart}>
          Start a new lesson
        </button>
      </div>
    </main>
  );
}

function InteractiveLeakageLab({
  session,
  artifact,
  authoritativeResult,
  recordCompilerEvents,
}: {
  session: SessionView | null;
  artifact: ArtifactView | null;
  authoritativeResult: LeakageVerifiedResultSet;
  recordCompilerEvents: (
    sessionId: string,
    events: readonly PublicCompilerEvent[],
  ) => void;
}) {
  const isLive = session?.mode.kind === "live_notebook";
  const entityCandidates = artifact?.schemaSummary.entityCandidates ?? [];
  const [splitStrategy, setSplitStrategy] = useState<"random" | "group">(
    "group",
  );
  const [entityField, setEntityField] = useState(
    entityCandidates[0] ?? "customer_id",
  );
  const [identityAblation, setIdentityAblation] = useState(false);
  const [testFraction, setTestFraction] = useState(0.25);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [exploredResult, setExploredResult] =
    useState<LeakageVerifiedResultSet | null>(null);
  const [configurationHash, setConfigurationHash] = useState<string | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runner = useRunnerEvents();

  useEffect(() => {
    if (session === null || runner.events.length === 0) return;
    recordCompilerEvents(session.sessionId, runner.events);
  }, [recordCompilerEvents, runner.events, session]);

  useEffect(() => {
    if (
      entityCandidates.length > 0 &&
      !entityCandidates.includes(entityField)
    ) {
      setEntityField(entityCandidates[0]!);
    }
  }, [entityCandidates, entityField]);

  const selectedRun = exploredResult?.runs.find(
    (run) => run.id === selectedRunId,
  );

  const runConfiguration = async () => {
    if (!isLive || session === null) return;
    setBusy(true);
    setError(null);
    setExploredResult(null);
    setSelectedRunId(null);
    setConfigurationHash(null);
    runner.clear();
    try {
      const queued = await counterLabApi.runInteractiveLeakage(
        session.sessionId,
        {
          schemaVersion: "1",
          splitStrategy,
          entityField,
          identityAblation,
          testFraction,
        },
      );
      await runner.waitForStandaloneJob({
        sessionId: session.sessionId,
        jobId: queued.runnerJob.jobId,
        jobKind: queued.runnerJob.kind,
      });
      const verified = await counterLabApi.getInteractiveResult(
        session.sessionId,
        queued.runnerJob.jobId,
      );
      if (verified.result.concept !== "entity_leakage") {
        throw new ApiClientError({
          code: "INTERACTIVE_RESULT_CONCEPT_MISMATCH",
          message: "The exploratory result did not match the leakage lab.",
          status: 409,
        });
      }
      setExploredResult(verified.result as LeakageVerifiedResultSet);
      setSelectedRunId(verified.selectedRunId);
      setConfigurationHash(verified.configurationHash);
    } catch (caught) {
      setError(
        caught instanceof ApiClientError
          ? caught.message
          : "The protected runner could not verify this configuration.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (!isLive) {
    return (
      <section className="interactive-lab panel interactive-lab-preview">
        <div>
          <p className="eyebrow aqua">Explore with your own notebook</p>
          <h2>Change the test, then let the kernel recompute it.</h2>
          <p>
            Live notebook sessions can change the split boundary, identity
            feature, entity field, and test size. Every combination is rerun by
            fixed code and independently verified before a value appears.
          </p>
        </div>
        <span className="verified-chip">
          Sample result stays fixed for a reproducible lesson
        </span>
      </section>
    );
  }

  return (
    <section
      className="interactive-lab panel"
      aria-labelledby="lab-controls-title"
    >
      <div className="interactive-lab-heading">
        <div>
          <p className="eyebrow aqua">Explore the causal boundary</p>
          <h2 id="lab-controls-title">What changes the conclusion?</h2>
          <p>
            Choose one evaluation design. Values appear only after the fixed
            kernel and external verifier agree.
          </p>
        </div>
        <span className="verified-chip">
          Authoritative result {authoritativeResult.resultHash.slice(0, 10)}…
        </span>
      </div>

      <div className="lab-control-grid">
        <fieldset className="segmented-control">
          <legend>Who belongs in the test?</legend>
          <label>
            <input
              type="radio"
              name="interactive-split"
              checked={splitStrategy === "random"}
              onChange={() => setSplitStrategy("random")}
            />
            <span>Mixed rows</span>
          </label>
          <label>
            <input
              type="radio"
              name="interactive-split"
              checked={splitStrategy === "group"}
              onChange={() => setSplitStrategy("group")}
            />
            <span>Whole entities</span>
          </label>
        </fieldset>

        <label className="lab-select-control">
          <span>Entity boundary</span>
          <select
            value={entityField}
            onChange={(event) => setEntityField(event.target.value)}
          >
            {entityCandidates.map((candidate) => (
              <option key={candidate} value={candidate}>
                {candidate}
              </option>
            ))}
          </select>
        </label>

        <label className="lab-toggle-control">
          <input
            type="checkbox"
            checked={identityAblation}
            onChange={(event) => setIdentityAblation(event.target.checked)}
          />
          <span>
            <strong>Remove identity feature</strong>
            <small>
              Tests whether the model relies on who the row belongs to.
            </small>
          </span>
        </label>

        <label className="lab-range-control">
          <span>
            Test size <strong>{Math.round(testFraction * 100)}%</strong>
          </span>
          <input
            type="range"
            min="0.1"
            max="0.5"
            step="0.05"
            value={testFraction}
            onChange={(event) => setTestFraction(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="interactive-run-summary">
        <div>
          <span>Changed</span>
          <strong>
            {splitStrategy === "group" ? "entity boundary" : "row boundary"}
            {identityAblation ? " + identity removed" : " + identity kept"}
          </strong>
        </div>
        <div>
          <span>Controlled</span>
          <strong>Fixture · model · preprocessing · seed</strong>
        </div>
        <button
          className="button button-primary"
          type="button"
          disabled={busy || entityCandidates.length === 0}
          onClick={() => void runConfiguration()}
        >
          {busy ? "Running fair test…" : "Run this configuration"}
          {!busy && <Mark name="arrow" />}
        </button>
      </div>

      {busy && (
        <div className="interactive-progress" role="status" aria-live="polite">
          <span className="status-dot configured" />
          <div>
            <strong>
              {runner.events.at(-1) === undefined
                ? "Protected runner accepted the configuration"
                : compilerEventCopy(runner.events.at(-1)!).label}
            </strong>
            <span>
              No chart is released until the result payload passes verification.
            </span>
          </div>
        </div>
      )}

      {error !== null && (
        <div className="transfer-result rejected" role="alert">
          <strong>No exploratory result was released.</strong>
          <span>{error}</span>
        </div>
      )}

      {selectedRun !== undefined && configurationHash !== null && (
        <div className="interactive-result" aria-live="polite">
          <div className="interactive-result-score">
            <span className="verified-chip">Verified exploratory result</span>
            <span>Verified accuracy</span>
            <strong>{percent.format(selectedRun.metrics.accuracy)}</strong>
            <small>
              n={selectedRun.sampleSizes.test} · overlap{" "}
              {selectedRun.entityOverlap.count} · seed {selectedRun.seed}
            </small>
          </div>
          <dl>
            <div>
              <dt>Split</dt>
              <dd>{selectedRun.splitStrategy}</dd>
            </div>
            <div>
              <dt>Identity</dt>
              <dd>
                {selectedRun.dropFeatures.includes(entityField)
                  ? "Removed"
                  : "Included"}
              </dd>
            </div>
            <div>
              <dt>Result proof</dt>
              <dd>{exploredResult?.resultHash.slice(0, 12)}…</dd>
            </div>
            <div>
              <dt>Configuration</dt>
              <dd>{configurationHash.slice(0, 12)}…</dd>
            </div>
          </dl>
          <p>
            This is a verified exploration. It does not replace the immutable
            result used by your locked Prediction or final Proof Capsule.
          </p>
        </div>
      )}
    </section>
  );
}

function ResultInterpretationPrompt({
  id,
  value,
  onChange,
  disabled = false,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const ready = value.trim().length >= 20;
  const descriptionId = `${id}-description`;
  return (
    <section
      className="revision panel"
      aria-label="Learner result interpretation"
    >
      <p className="eyebrow">Your interpretation</p>
      <label id={`${id}-label`} htmlFor={id}>
        What do you notice in this comparison?
      </label>
      <textarea
        id={id}
        value={value}
        rows={3}
        disabled={disabled}
        aria-describedby={descriptionId}
        onChange={(event) => onChange(event.target.value)}
        placeholder="I notice…"
      />
      <small id={descriptionId} aria-live="polite">
        {ready
          ? "Interpretation recorded locally. Explore and Boundary are now available."
          : "Write at least 20 characters before CounterLab reveals its reading or opens the next view."}
      </small>
    </section>
  );
}

function LeakageRealityScreen({
  claim,
  prediction,
  result,
  session,
  artifact,
  updateSession,
  recordCompilerEvents,
}: {
  claim: string;
  prediction: PredictionChoice;
  result: LeakageVerifiedResultSet;
  session: SessionView | null;
  artifact: ArtifactView | null;
  updateSession: (session: SessionView) => void;
  recordCompilerEvents: (
    sessionId: string,
    events: readonly PublicCompilerEvent[],
  ) => void;
}) {
  const random = resultRun(result, "random_row_split");
  const group = resultRun(result, "customer_group_split");
  const [revision, setRevision] = useState(
    session === null
      ? (window.localStorage.getItem(storageKeys.replayRevision) ?? "")
      : (session.revision ?? ""),
  );
  const [revisionAuthored, setRevisionAuthored] = useState(
    revision.trim().length >= 20,
  );
  const interpretationComplete =
    session === null ||
    session.mode.kind === "verified_replay" ||
    session?.revision !== undefined ||
    (revisionAuthored && revision.trim().length >= 20);
  const [revisionMode, setRevisionMode] = useState<"clauses" | "free_text">(
    "clauses",
  );
  const initialTransferState: TransferState = session?.patchResult
    ? "patched"
    : session?.transferResult?.outcome === "PASSED"
      ? "passed"
      : session?.transferResult?.outcome === "FAILED"
        ? "failed"
        : session?.revision
          ? "ready"
          : session === null
            ? storedReplayTransferState()
            : "locked";
  const [transferState, setTransferState] =
    useState<TransferState>(initialTransferState);
  const [splitChoice, setSplitChoice] = useState<LeakageTransferSplit>(() => {
    const stored = session?.transferResult?.selectedStrategy;
    return leakageTimelineSplits.some((option) => option.value === stored)
      ? (stored as LeakageTransferSplit)
      : "";
  });
  const [riskChoice, setRiskChoice] = useState<LeakageTransferRisk>(() => {
    const stored = session?.transferResult?.identifiedRisks[0];
    return leakageTimelineFeatures.some((option) => option.value === stored)
      ? (stored as LeakageTransferRisk)
      : "";
  });
  const [transferEvidence, setTransferEvidence] = useState<
    LeakageTransferEvidence[]
  >(() =>
    (session?.transferResult?.evidenceChoices ?? []).filter(
      (value): value is LeakageTransferEvidence =>
        leakageTimelineEvidence.some((option) => option.value === value),
    ),
  );
  const [patch, setPatch] = useState<PatchResult | null>(
    session?.patchResult ?? null,
  );
  const [proofBundle, setProofBundle] = useState<ProofBundle | null>(
    session?.proofBundle ?? null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const actionInFlight = useRef(false);
  const sampleSessionId =
    session?.mode.kind === "sample_lesson" ? session.sessionId : null;
  const [sampleBoundaryComplete, setSampleBoundaryComplete] = useState(
    sampleSessionId === null ||
      session?.revision !== undefined ||
      window.localStorage.getItem(storageKeys.sampleBoundarySessionId) ===
        sampleSessionId,
  );
  const [patchJob, setPatchJob] = useState<RunnerJob | null>(null);
  const patchRunner = useRunnerEvents();
  const accuracyGapPoints =
    (random.metrics.accuracy - group.metrics.accuracy) * 100;

  useLayoutEffect(() => {
    resetViewport("lesson-phase-title");
  }, [transferState]);

  useEffect(() => {
    if (session === null || patchRunner.events.length === 0) return;
    recordCompilerEvents(session.sessionId, patchRunner.events);
  }, [patchRunner.events, recordCompilerEvents, session]);

  useEffect(() => {
    if (session !== null) return;
    window.localStorage.setItem(storageKeys.replayTransferState, transferState);
    window.localStorage.setItem(storageKeys.replayRevision, revision);
  }, [revision, session, transferState]);

  const runAction = async (operation: () => Promise<void>) => {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setActionBusy(true);
    setActionError(null);
    try {
      await operation();
    } catch (caught) {
      setActionError(
        caught instanceof ApiClientError
          ? caught.message
          : "CounterLab could not record this evidence.",
      );
    } finally {
      actionInFlight.current = false;
      setActionBusy(false);
    }
  };

  const completePatchJob = async (jobId: string) => {
    if (session === null) return;
    const completed = await patchRunner.waitForJob({
      sessionId: session.sessionId,
      jobId,
      jobKind: "PATCH_COMPILE",
      terminalStates: ["PROOF_CAPSULE_ISSUED", "PATCH_REJECTED"],
      onSession: updateSession,
    });
    if (
      completed.state !== "PROOF_CAPSULE_ISSUED" ||
      completed.patchResult === undefined
    ) {
      setTransferState("passed");
      throw new ApiClientError({
        code: "PATCH_REJECTED",
        message:
          "The patch verifier rejected this candidate. The original notebook remains unchanged.",
        status: 409,
      });
    }
    setPatch(completed.patchResult);
    updateSession(completed);
    forgetRunnerCheckpoint(session.sessionId, jobId);
    setTransferState("patched");
    try {
      setProofBundle(await counterLabApi.getProofBundle(session.sessionId));
    } catch (caught) {
      if (!(caught instanceof ApiClientError && caught.status === 409)) {
        throw caught;
      }
    }
  };

  useEffect(() => {
    const activeJob =
      session === null ? null : storedRunnerCheckpoint(session.sessionId);
    if (
      session?.state !== "PATCH_COMPILING" ||
      activeJob === null ||
      activeJob.kind !== "PATCH_COMPILE"
    ) {
      return;
    }
    setTransferState("patching");
    void runAction(() => completePatchJob(activeJob.jobId));
    // Resume the one persisted patch job once when this session is restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.sessionId]);

  const recordRevision = () => {
    if (session === null) {
      setTransferState("ready");
      return;
    }
    void runAction(async () => {
      const updated = await counterLabApi.recordRevision(session.sessionId, {
        revision,
      });
      updateSession(updated);
      setTransferState("ready");
      void recordLearnerInteraction(session.sessionId, {
        kind: "revision.recorded",
        stage: "apply",
        authoringMode: revisionMode,
      });
    });
  };

  const checkTransfer = () => {
    if (
      splitChoice === "" ||
      riskChoice === "" ||
      transferEvidence.length === 0
    ) {
      return;
    }
    if (session === null) {
      setTransferState(
        splitChoice === "time_ordered_holdout" &&
          riskChoice === "centered_window_reads_future" &&
          transferEvidence.includes("center_true_uses_later_targets") &&
          transferEvidence.includes("random_split_mixes_dates")
          ? "passed"
          : "failed",
      );
      return;
    }
    void runAction(async () => {
      const updated = await counterLabApi.submitTransfer(session.sessionId, {
        strategyChoice: splitChoice,
        riskChoice,
        evidenceChoices: transferEvidence,
      });
      updateSession(updated);
      const outcome =
        updated.transferResult?.outcome === "PASSED" ? "PASSED" : "FAILED";
      setTransferState(outcome === "PASSED" ? "passed" : "failed");
      void recordLearnerInteraction(session.sessionId, {
        kind: "transfer.evaluated",
        stage: "apply",
        outcome,
      });
    });
  };

  const compilePatch = () => {
    if (session === null) {
      setTransferState("patched");
      return;
    }
    void runAction(async () => {
      const updated = await counterLabApi.compilePatch(session.sessionId);
      updateSession(updated);
      if (updated.patch !== undefined) {
        setPatch(updated.patch);
        setTransferState("patched");
      } else if (updated.runnerJob !== undefined) {
        setPatchJob(updated.runnerJob);
        patchRunner.clear();
        setTransferState("patching");
        rememberRunnerCheckpoint(session.sessionId, updated.runnerJob);
        await completePatchJob(updated.runnerJob.jobId);
      } else {
        throw new ApiClientError({
          code: "PATCH_NOT_STARTED",
          message: "No verified patch or runner job was returned.",
          status: 409,
        });
      }
      if (
        updated.patch !== undefined &&
        updated.state === "PROOF_CAPSULE_ISSUED"
      ) {
        try {
          setProofBundle(
            updated.proofBundle ??
              (await counterLabApi.getProofBundle(session.sessionId)),
          );
        } catch (caught) {
          if (!(caught instanceof ApiClientError && caught.status === 409)) {
            throw caught;
          }
        }
      }
    });
  };

  const exportProof = () => {
    if (proofBundle === null) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(proofBundle, null, 2)], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `counterlab-${proofBundle.replayId ?? proofBundle.sessionId}-proof-bundle.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadCompletionPatch = () => {
    if (session === null || patch === null) return;
    void runAction(async () => {
      saveAuthenticatedDownload(
        await counterLabApi.downloadPatch(session.sessionId),
      );
      void recordLearnerInteraction(session.sessionId, {
        kind: "patch.downloaded",
        stage: "repair",
      });
    });
  };

  const exportCompletionProof = () => {
    if (session?.proofCapsule !== undefined) {
      void runAction(async () => {
        saveAuthenticatedDownload(
          await counterLabApi.downloadProofCapsule(session.sessionId),
        );
        void recordLearnerInteraction(session.sessionId, {
          kind: "proof_capsule.downloaded",
          stage: "repair",
        });
      });
      return;
    }
    exportProof();
  };

  const inspectFixedSampleEvidence = () => {
    window.location.assign("/judge#sample-evidence");
  };

  const actionErrorNotice =
    actionError === null ? null : (
      <div className="transfer-result rejected" role="alert">
        <strong>We could not save that step.</strong>
        <span>{actionError}</span>
      </div>
    );

  if (transferState === "patching") {
    return (
      <main
        className="workspace shell reality lesson-phase live-compiler"
        id="main-content"
        tabIndex={-1}
      >
        <div className="screen-intro compact">
          <p className="eyebrow gold">Patch unlocked · Verifying a copy</p>
          <h1 id="lesson-phase-title" tabIndex={-1}>
            Checking every changed notebook cell…
          </h1>
          <p>
            Codex proposes a bounded patch plan. Fixed code applies it to a
            copy, and the patch verifier checks the conclusion really changed
            because the evaluation design changed.
          </p>
        </div>
        <RepairPreview
          changed={leakageRepairChanges}
          preserved={leakageRepairPreserves}
        />
        <section className="live-compiler-grid">
          <div className="pipeline panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Public patch trace</p>
                <h2>Plan → apply to copy → verify</h2>
              </div>
              <span className="runner-state active">
                <span className="status-dot configured" />
                {patchJob?.status.replaceAll("_", " ") ?? "STARTING"}
              </span>
            </div>
            <ol className="live-event-list" aria-live="polite">
              {patchRunner.events.length === 0 && (
                <li className="active">
                  <span className="event-mark" />
                  <div>
                    <strong>Preparing separate patch job</strong>
                    <p>The uploaded notebook remains read-only.</p>
                  </div>
                </li>
              )}
              {patchRunner.events.map((event) => {
                const copy = compilerEventCopy(event);
                return (
                  <li className={copy.tone} key={event.eventId}>
                    <span className="event-mark" />
                    <div>
                      <strong>{copy.label}</strong>
                      <p>{copy.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
          <aside className="compiler-authority panel">
            <p className="eyebrow aqua">Patch safety</p>
            <div>
              <span>Source</span>
              <strong>Original upload is never overwritten</strong>
            </div>
            <div>
              <span>Scope</span>
              <strong>Only evidence-linked evaluation cells may change</strong>
            </div>
            <div>
              <span>Release rule</span>
              <strong>A rejected patch cannot be downloaded</strong>
            </div>
          </aside>
        </section>
        {actionErrorNotice}
        {actionError !== null && (
          <section
            className="panel compiler-retry"
            aria-labelledby="patch-retry-title"
          >
            <div>
              <p className="eyebrow gold">Safe stop · Source untouched</p>
              <h2 id="patch-retry-title">Retry the bounded patch turn.</h2>
              <p>
                CounterLab will start a fresh Patch Plan job. The failed job
                remains in the proof history and no notebook copy is released
                until the patch verifier passes.
              </p>
            </div>
            <button
              className="button button-primary"
              type="button"
              disabled={actionBusy}
              onClick={compilePatch}
            >
              {actionBusy ? "Retrying…" : "Retry protected patch"}
            </button>
          </section>
        )}
      </main>
    );
  }

  if (transferState === "patched") {
    const liveCompletionProof =
      session?.mode.kind === "live_notebook" &&
      session.state === "PROOF_CAPSULE_ISSUED" &&
      session.reasoningDiffV2 !== undefined &&
      session.proofCapsule !== undefined &&
      session.beliefSpec !== undefined &&
      session.prediction !== undefined &&
      session.revision !== undefined &&
      patch !== null
        ? {
            sessionId: session.sessionId,
            diff: session.reasoningDiffV2,
            capsule: session.proofCapsule,
            patch,
            publicTextPreview: {
              claim: session.beliefSpec.claim,
              hypotheses: [
                session.beliefSpec.hypotheses[0].statement,
                session.beliefSpec.hypotheses[1].statement,
              ] as const,
              prediction: session.prediction.choice,
              revision: session.revision,
            },
          }
        : null;
    return (
      <main
        className="workspace shell reality lesson-phase completion-phase"
        id="main-content"
        tabIndex={-1}
      >
        <LearnerCompletion
          titleId="lesson-phase-title"
          headingLevel="h1"
          capability={{
            intro: "You completed one verified entity-leakage loop.",
            first: "good on familiar rows",
            connector: "was compared with",
            second: "performance on new entities in this fixed task",
          }}
          beforeReasoning={claim}
          afterReasoning={revision}
          transferStatus={{
            label: "Fixed transfer task passed",
            detail:
              "Your submitted choices matched the fixed forecasting evaluator. This records one task outcome; it does not establish mastery.",
          }}
          repairedNotebookAction={{
            label: "Download repaired notebook",
            onActivate: downloadCompletionPatch,
            disabled: actionBusy || session === null || patch === null,
          }}
          proofCapsuleAction={{
            ...(session?.mode.kind === "live_notebook"
              ? {
                  label:
                    session.proofCapsule === undefined
                      ? "Download proof record"
                      : "Export Proof Capsule",
                  onActivate: exportCompletionProof,
                  disabled:
                    actionBusy ||
                    (session.proofCapsule === undefined &&
                      proofBundle === null),
                }
              : {
                  label: "Inspect fixed sample evidence",
                  onActivate: inspectFixedSampleEvidence,
                  disabled: actionBusy,
                }),
          }}
          evidenceAndProof={
            liveCompletionProof === null ? (
              <>
                <p>
                  Result {result.resultHash} · seed {result.seed}
                </p>
                <p>
                  The verified conclusion is bounded to the supported notebook,
                  fixed fixture, registered evaluation changes, and transfer
                  scenario. It does not establish global model quality.
                </p>
              </>
            ) : (
              <DeferredReasoningDiffView
                presentation="completion-evidence"
                diff={liveCompletionProof.diff}
                capsule={liveCompletionProof.capsule}
                patch={liveCompletionProof.patch}
                patchDownloadUrl={counterLabApi.patchDownloadUrl(
                  liveCompletionProof.sessionId,
                )}
                proofCapsuleDownloadUrl={counterLabApi.proofCapsuleDownloadUrl(
                  liveCompletionProof.sessionId,
                )}
                publishReplay={() =>
                  counterLabApi.publishReplay(liveCompletionProof.sessionId)
                }
                revokeReplay={() =>
                  counterLabApi.revokeReplay(liveCompletionProof.sessionId)
                }
                loadReplayStatus={() =>
                  counterLabApi.getReplayPublicationStatus(
                    liveCompletionProof.sessionId,
                  )
                }
                publicTextPreview={liveCompletionProof.publicTextPreview}
              />
            )
          }
        />

        <RepairPreview
          changed={leakageRepairChanges}
          preserved={leakageRepairPreserves}
        />

        {liveCompletionProof === null && (
          <section className="reasoning-diff panel">
            <div className="panel-title final-title">
              <div>
                <p className="eyebrow purple">Reasoning Diff</p>
                <h2>Your learning, before and after</h2>
                <p>
                  One view of what changed in your idea, evidence, and code.
                </p>
              </div>
              <div className="completion-actions">
                {session?.mode.kind === "live_notebook" && patch !== null && (
                  <button
                    className="button button-gold patch-download"
                    type="button"
                    disabled={actionBusy}
                    onClick={downloadCompletionPatch}
                  >
                    Download verified notebook copy <Mark name="arrow" />
                  </button>
                )}
                <button
                  className="button button-quiet"
                  type="button"
                  disabled={proofBundle === null}
                  onClick={exportProof}
                >
                  {proofBundle === null ? "Preparing proof" : "Download proof"}
                </button>
              </div>
            </div>
            <div
              className="diff-table"
              role="table"
              aria-label="Reasoning Diff"
            >
              <div className="diff-row diff-head" role="row">
                <span>Dimension</span>
                <span>Before</span>
                <span>After</span>
              </div>
              <div className="diff-row" role="row">
                <strong>Belief</strong>
                <span>{claim}</span>
                <span>{revision}</span>
              </div>
              <div className="diff-row" role="row">
                <strong>Prediction</strong>
                <span>
                  {prediction === "stays-high"
                    ? "Near 98%"
                    : prediction === "falls"
                      ? "Material fall"
                      : "Uncertain"}
                </span>
                <span>
                  {percent.format(group.metrics.accuracy)} on new customers
                </span>
              </div>
              <div className="diff-row" role="row">
                <strong>Code</strong>
                <span>Random rows + customer identity</span>
                <span>Whole-customer holdout + identity removed</span>
              </div>
              <div className="diff-row" role="row">
                <strong>Transfer</strong>
                <span>Rule not yet tested</span>
                <span>Time-aware forecasting choice passed</span>
              </div>
            </div>
            <details className="verified-patch-details">
              <summary>See the verified notebook change</summary>
              <p>
                Only the supported evaluation cell changed. The original
                notebook remains untouched.
              </p>
              <pre className="diff" aria-label="Verified notebook cell diff">
                <code>
                  {patch?.diff ??
                    "Verified replay patch: random rows replaced with customer-group evaluation; customer identity removed."}
                </code>
              </pre>
              <p className="patch-proof">
                <Mark name="check" /> Cell 3 changed · unrelated source hashes
                unchanged · group overlap 0 · result reproduced
              </p>
            </details>
            <details className="technical-proof">
              <summary>Technical proof and reproduction</summary>
              <pre>
                <code>{`result_hash=${result.resultHash}\nseed=${result.seed}\nreplay_id=${proofBundle?.replayId ?? verifiedReplay.id}\n./scripts/reproduce-session.sh leakage-01\n./scripts/replay-patch.sh leakage-01`}</code>
              </pre>
            </details>
          </section>
        )}
        {actionErrorNotice}
      </main>
    );
  }

  if (transferState === "passed") {
    return (
      <main
        className="workspace shell reality lesson-phase transfer-passed-phase"
        id="main-content"
        tabIndex={-1}
      >
        <div className="screen-intro compact">
          <p className="eyebrow aqua">Transfer passed · Patch unlocked</p>
          <h1 id="lesson-phase-title" tabIndex={-1}>
            This fixed forecasting transfer passed.
          </h1>
          <p>
            Your submitted choices matched the fixed evaluator for the
            forecasting scenario. This records one task outcome; it does not
            establish mastery.
          </p>
        </div>

        <RepairPreview
          changed={leakageRepairChanges}
          preserved={leakageRepairPreserves}
        />
        <section className="transfer-win panel">
          <div className="transfer-win-seal">
            <Mark name="check" />
            <span>Rule transferred</span>
          </div>
          <h2>Your notebook correction is ready.</h2>
          <p>
            CounterLab teaches before it repairs. Now that you used the rule on
            a new problem, it can correct a copy of the original notebook.
          </p>
          <div className="transfer-win-grid">
            <article>
              <span>Customer lesson</span>
              <strong>Keep each customer on one side</strong>
            </article>
            <Mark name="arrow" />
            <article>
              <span>Forecasting transfer</span>
              <strong>Keep later dates out of training</strong>
            </article>
          </div>
          <div className="patch-unlock-row">
            <div>
              <span>What the patch will change</span>
              <strong>Random rows → whole-customer holdout</strong>
              <small>The original upload will not be overwritten.</small>
            </div>
            <button
              className="button button-gold"
              type="button"
              disabled={actionBusy}
              onClick={compilePatch}
            >
              Verify notebook patch <Mark name="arrow" />
            </button>
          </div>
        </section>
        {actionErrorNotice}
      </main>
    );
  }

  if (transferState === "ready" || transferState === "failed") {
    return (
      <main
        className="workspace shell reality lesson-phase transfer-phase"
        id="main-content"
        tabIndex={-1}
      >
        <div className="screen-intro compact">
          <p className="eyebrow purple">New problem · No notebook hints</p>
          <h1 id="lesson-phase-title" tabIndex={-1}>
            Try your rule on forecasting.
          </h1>
          <p>
            The surface changed from customers to time. Choose the evaluation
            that matches what will be available when a real prediction is made.
          </p>
        </div>

        <section
          className="lesson-recap"
          id="learner-apply-evidence"
          aria-label="Rule carried forward"
        >
          <div className="recap-score">
            <span>Customer lesson</span>
            <strong>
              {percent.format(random.metrics.accuracy)} →{" "}
              {percent.format(group.metrics.accuracy)}
            </strong>
            <small>when only new customers were tested</small>
          </div>
          <div className="recap-rule">
            <span>Your rule</span>
            <p>{revision}</p>
          </div>
        </section>

        <section className="transfer panel" aria-labelledby="transfer-title">
          <div className="transfer-heading">
            <div>
              <p className="eyebrow">Forecasting challenge</p>
              <h2 id="transfer-title">
                What information exists at prediction time?
              </h2>
            </div>
            <span className="locked-chip">
              <Mark name="lock" /> Fix still locked
            </span>
          </div>
          <div className="case-card">
            <span className="case-label">Scenario</span>
            <p>
              A demand forecast learns from nearby days. Its rolling feature
              looks both backward and forward, and the notebook randomly mixes
              dates between training and testing.
            </p>
            <p className="plain-warning">
              In real life, tomorrow&apos;s sales do not exist when today&apos;s
              prediction is made.
            </p>
          </div>
          <TimelineTransfer
            heading="What information exists at prediction time?"
            scenario="A demand forecast learns from nearby days. Choose the deployment split, then identify the feature that uses information unavailable when a real prediction is made."
            trainingRange="Jan — Mar"
            testRange="Apr — Jun"
            splitValue={splitChoice}
            splitOptions={leakageTimelineSplits}
            onSplitChange={setSplitChoice}
            featureValue={riskChoice}
            featureOptions={leakageTimelineFeatures}
            onFeatureChange={setRiskChoice}
            evidenceValues={transferEvidence}
            evidenceOptions={leakageTimelineEvidence}
            onEvidenceChange={setTransferEvidence}
            disabled={actionBusy}
          />
          <button
            className="button button-primary"
            type="button"
            disabled={
              !splitChoice ||
              !riskChoice ||
              transferEvidence.length === 0 ||
              actionBusy
            }
            onClick={checkTransfer}
          >
            Check transfer
          </button>
          {transferState === "failed" && (
            <div className="transfer-result rejected" role="status">
              <strong>Transfer not yet passed.</strong>
              <span>
                Use the NOW line: choose a test where training happens before
                testing, then identify the feature that reads values to the
                right of NOW. The patch remains locked.
              </span>
            </div>
          )}
        </section>
        {actionErrorNotice}
      </main>
    );
  }

  const predictionSummary =
    session?.prediction?.choice ??
    (prediction === "stays-high"
      ? "Accuracy remains near 98% on unseen customers."
      : prediction === "falls"
        ? "Accuracy falls materially on unseen customers."
        : "The unseen-customer result is uncertain.");
  const applyAvailable =
    interpretationComplete &&
    (session?.mode.kind === "sample_lesson"
      ? sampleBoundaryComplete
      : session?.mode.kind !== "live_notebook" ||
        session.boundaryMapAuthority !== undefined);
  const theaterPayload: ExperimentTheaterVerifiedPayload = {
    ...(session?.mode.kind === "sample_lesson" &&
    bundledSampleEvidence.status === "available" &&
    result.resultHash === bundledSampleEvidence.result.resultHash
      ? {
          trustedVisual: {
            id: "verified_sample_belief_break_v1" as const,
            resultHash: result.resultHash,
            revealFinding: interpretationComplete,
          },
        }
      : {}),
    comparison: {
      title: "Familiar rows versus new customers",
      accessibleSummary: `Verified accuracy comparison: familiar rows ${percent.format(random.metrics.accuracy)}; new customers ${percent.format(group.metrics.accuracy)}.`,
      first: {
        label: "Familiar rows",
        value: percent.format(random.metrics.accuracy),
        detail: `${random.entityOverlap.count} shared customers`,
      },
      second: {
        label: "New customers",
        value: percent.format(group.metrics.accuracy),
        detail: `${group.entityOverlap.count} shared customers`,
      },
    },
    finding: interpretationComplete
      ? `${percent.format(random.metrics.accuracy)} became ${percent.format(group.metrics.accuracy)} when the test contained only new customers.`
      : "What do you notice in the verified comparison? Record your interpretation before CounterLab reveals its bounded reading.",
    controlledVariables: "model, target, metric, preprocessing, and seed",
    views: {
      observe: {
        heading: "Inspect the verified runs",
        available: true,
        completed: interpretationComplete,
        content: (
          <>
            {session?.mode.kind === "live_notebook" ? (
              <Suspense
                fallback={
                  <DeferredPanelFallback label="Loading trusted Lab Scene…" />
                }
              >
                <LazyVerifiedLabScenePanel sessionId={session.sessionId} />
              </Suspense>
            ) : null}
            <details id="leakage-verified-evidence" className="exact-results">
              <summary>Show exact values and run details</summary>
              <ResultTable result={result} />
              <code>result {result.resultHash.slice(0, 12)}…</code>
            </details>
            {session !== null &&
            session.mode.kind !== "verified_replay" &&
            session.revision === undefined ? (
              <ResultInterpretationPrompt
                id="leakage-result-interpretation"
                value={revision}
                onChange={(nextRevision) => {
                  setRevision(nextRevision);
                  setRevisionAuthored(nextRevision.trim().length >= 20);
                }}
                disabled={actionBusy}
              />
            ) : null}
          </>
        ),
      },
      explore: {
        heading: "Explore bounded test choices",
        available: interpretationComplete,
        completed: false,
        content: (
          <InteractiveLeakageLab
            session={session}
            artifact={artifact}
            authoritativeResult={result}
            recordCompilerEvents={recordCompilerEvents}
          />
        ),
      },
      boundary: {
        heading: "Find where the conclusion changes",
        available: interpretationComplete,
        completed:
          session?.mode.kind === "sample_lesson"
            ? sampleBoundaryComplete
            : session?.boundaryMapAuthority !== undefined,
        content:
          session?.mode.kind === "live_notebook" ? (
            <BoundaryStage
              session={session}
              prediction={predictionSummary}
              updateSession={updateSession}
            />
          ) : session?.mode.kind === "sample_lesson" ? (
            <Suspense
              fallback={
                <section className="revision panel" role="status">
                  <p className="eyebrow aqua">Verified sample exploration</p>
                  <h4>Opening the fixed Boundary Map…</h4>
                  <p>
                    CounterLab is loading preverified cells. No model call or
                    browser metric calculation is running.
                  </p>
                </section>
              }
            >
              <LazySampleBoundaryPanel
                sessionId={session.sessionId}
                prediction={predictionSummary}
                onComplete={() => {
                  window.localStorage.setItem(
                    storageKeys.sampleBoundarySessionId,
                    session.sessionId,
                  );
                  setSampleBoundaryComplete(true);
                }}
              />
            </Suspense>
          ) : (
            <section className="revision panel">
              <p className="eyebrow aqua">Verified sample boundary</p>
              <h4>The conclusion changes at the entity boundary.</h4>
              <p>
                The verified whole-customer run has {group.entityOverlap.count}{" "}
                shared customers; the random-row run has{" "}
                {random.entityOverlap.count}.
              </p>
            </section>
          ),
      },
      apply: {
        heading: "State the rule you will apply",
        available: applyAvailable,
        completed: session?.revision !== undefined,
        content: (
          <section className="revision panel">
            <ReflectionBuilder
              value={revision}
              onRevisionChange={setRevision}
              onLearnerEdit={(nextRevision) =>
                setRevisionAuthored(nextRevision.trim().length >= 20)
              }
              onGeneratedRevision={() => setRevisionAuthored(false)}
              whenOptions={leakageReflectionWhen}
              actionOptions={leakageReflectionActions}
              becauseOptions={leakageReflectionReasons}
              editorLabel="Your revised mental model"
              disabled={actionBusy}
              onAuthoringModeChange={setRevisionMode}
            />
            <p>
              Complete all three clauses or write a full rule in your own words.
              CounterLab records the revision without grading the prose.
            </p>
            <button
              className="button button-primary"
              type="button"
              disabled={
                !revisionAuthored || revision.trim().length < 20 || actionBusy
              }
              onClick={recordRevision}
            >
              Try the rule on a new problem <Mark name="arrow" />
            </button>
          </section>
        ),
      },
    },
  };

  return (
    <main className="workspace shell reality" id="main-content" tabIndex={-1}>
      <div className="screen-intro compact">
        <p className="eyebrow aqua">Boundary · Verified result</p>
        <h1 id="lesson-phase-title" tabIndex={-1}>
          Compare the verified result.
        </h1>
        <p>
          The fixed values are visible now. Write what you notice before
          CounterLab reveals its bounded interpretation.
        </p>
      </div>
      <LearnerCoach
        next="observe the result, explore it, then find and apply its boundary."
        why={
          !interpretationComplete
            ? "The verified values are available for your interpretation. The four views change presentation only; fixed evidence remains the authority."
            : `The verified test found a ${accuracyGapPoints.toFixed(1)}-point gap for new customers. The four views change presentation only; fixed evidence remains the authority.`
        }
      />
      <ExperimentTheater
        key={session?.sessionId ?? result.resultHash}
        prediction={predictionSummary}
        verifiedPayload={theaterPayload}
      />
      {actionErrorNotice}
    </main>
  );
}

function ImbalanceRealityScreen({
  claim,
  prediction,
  result,
  session,
  updateSession,
}: {
  claim: string;
  prediction: PredictionChoice;
  result: ImbalanceVerifiedResultSet;
  session: SessionView | null;
  updateSession: (session: SessionView) => void;
}) {
  const [resultInterpretation, setResultInterpretation] = useState(
    session?.revision ?? "",
  );
  const interpretationComplete =
    session === null ||
    session.mode.kind === "verified_replay" ||
    session?.revision !== undefined ||
    resultInterpretation.trim().length >= 20;
  const majority = result.runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const stratified = result.runs.find(
    (run) => run.operation === "imbalance.stratified_holdout",
  );
  const threshold = result.runs.find(
    (run) => run.operation === "imbalance.threshold_sweep",
  );
  const prevalence = result.runs.find(
    (run) => run.operation === "imbalance.prevalence_sweep",
  );
  if (
    majority === undefined ||
    stratified === undefined ||
    threshold === undefined ||
    prevalence === undefined
  ) {
    throw new Error("Verified imbalance result is missing required fixed runs");
  }
  const predictionSummary =
    session?.prediction?.choice ??
    (prediction === "stays-high"
      ? "The high score is supported by strong rare-class performance."
      : prediction === "falls"
        ? "Rare-class evidence exposes a serious problem."
        : "The rare-class outcome is uncertain.");
  const applyAvailable =
    session !== null &&
    session.mode.kind !== "verified_replay" &&
    interpretationComplete &&
    (session.mode.kind !== "live_notebook" ||
      session.boundaryMapAuthority !== undefined);
  const restoreApplyView =
    session?.state === "REVISION_RECORDED" ||
    session?.state === "TRANSFER_IN_PROGRESS" ||
    session?.state === "TRANSFER_FAILED" ||
    session?.state === "TRANSFER_PASSED" ||
    session?.state === "PATCH_COMPILING" ||
    session?.state === "PATCH_REJECTED" ||
    session?.state === "PATCH_VERIFIED" ||
    session?.state === "REASONING_DIFF_ISSUED" ||
    session?.state === "PROOF_CAPSULE_ISSUED";
  const restoredTransferDecision = restoredImbalanceDecision(
    session?.transferResult?.selectedStrategy,
  );
  const restoredTransferMetric = restoredImbalanceMetric(
    session?.transferResult?.identifiedRisks[0],
  );
  const restoredTransferEvidence = restoredImbalanceEvidence(
    session?.transferResult?.evidenceChoices,
  );
  const theaterPayload: ExperimentTheaterVerifiedPayload = {
    comparison: {
      title: "Headline accuracy versus rare-class recall",
      accessibleSummary: `Verified comparison: majority baseline accuracy ${percent.format(majority.metrics.accuracy)}; model rare-class recall ${percent.format(stratified.metrics.recall)}.`,
      first: {
        label: "Majority baseline accuracy",
        value: percent.format(majority.metrics.accuracy),
        detail: `${majority.confusionMatrix.fn} rare positives missed`,
      },
      second: {
        label: "Model rare-class recall",
        value: percent.format(stratified.metrics.recall),
        detail: `${percent.format(stratified.metrics.precision)} precision`,
      },
    },
    finding: interpretationComplete
      ? `${percent.format(majority.metrics.accuracy)} headline accuracy coincided with only ${majority.confusionMatrix.tp} rare positives caught by the majority baseline.`
      : "What do you notice in the verified comparison? Record your interpretation before CounterLab reveals its bounded reading.",
    controlledVariables:
      "fixed fixture, stratified holdout, model scores, and seed",
    views: {
      observe: {
        heading: "Inspect the verified rare-event runs",
        available: true,
        completed: interpretationComplete,
        content: (
          <>
            {session?.mode.kind === "live_notebook" ? (
              <Suspense
                fallback={
                  <DeferredPanelFallback label="Loading trusted Lab Scene…" />
                }
              >
                <LazyVerifiedLabScenePanel sessionId={session.sessionId} />
              </Suspense>
            ) : null}
            <blockquote>{claim}</blockquote>
            <details className="exact-results">
              <summary>Show exact values and run details</summary>
              <div className="table-wrap">
                <table>
                  <caption>
                    All values come from the canonical result payload.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Run</th>
                      <th scope="col">Threshold</th>
                      <th scope="col">Prevalence</th>
                      <th scope="col">Precision</th>
                      <th scope="col">Recall</th>
                      <th scope="col">F1</th>
                      <th scope="col">PR-AUC</th>
                      <th scope="col">Test n</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.runs.map((run) => (
                      <tr key={run.id}>
                        <th scope="row">{run.id.replaceAll("_", " ")}</th>
                        <td>{run.threshold.toFixed(2)}</td>
                        <td>{percent.format(run.prevalence)}</td>
                        <td>{percent.format(run.metrics.precision)}</td>
                        <td>{percent.format(run.metrics.recall)}</td>
                        <td>{percent.format(run.metrics.f1)}</td>
                        <td>{run.metrics.prAuc.toFixed(3)}</td>
                        <td>{run.sampleSizes.test}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <code>
                result {result.resultHash.slice(0, 12)}… · seed {result.seed}
              </code>
            </details>
            {session !== null &&
            session.mode.kind !== "verified_replay" &&
            session.revision === undefined ? (
              <ResultInterpretationPrompt
                id="imbalance-result-interpretation"
                value={resultInterpretation}
                onChange={setResultInterpretation}
              />
            ) : null}
          </>
        ),
      },
      explore: {
        heading: "Explore threshold and prevalence choices",
        available: interpretationComplete,
        completed: false,
        content: (
          <Suspense
            fallback={<DeferredPanelFallback label="Loading exploration…" />}
          >
            <LazyInteractiveImbalanceLab
              isLive={session?.mode.kind === "live_notebook"}
              sessionId={session?.sessionId ?? null}
              authoritativeResultHash={result.resultHash}
            />
          </Suspense>
        ),
      },
      boundary: {
        heading: "Find where the metric conclusion changes",
        available: interpretationComplete,
        completed: session?.boundaryMapAuthority !== undefined,
        content:
          session?.mode.kind === "live_notebook" ? (
            <BoundaryStage
              session={session}
              prediction={predictionSummary}
              updateSession={updateSession}
            />
          ) : (
            <section className="revision panel">
              <p className="eyebrow aqua">Verified sample boundary</p>
              <h4>Threshold and prevalence change what the metrics reveal.</h4>
              <p>
                At threshold {threshold.threshold}, recall is{" "}
                {percent.format(threshold.metrics.recall)}. In the{" "}
                {prevalence.prevalenceScenario.replaceAll("_", " ")} scenario,
                precision is {percent.format(prevalence.metrics.precision)}.
              </p>
            </section>
          ),
      },
      apply: {
        heading: "Apply the cost-aware rule",
        available: applyAvailable,
        completed:
          session?.revision !== undefined ||
          session?.transferResult?.outcome === "PASSED",
        content:
          session === null ? null : (
            <>
              <Suspense
                fallback={<DeferredPanelFallback label="Loading transfer…" />}
              >
                <LazyImbalanceTransferLesson
                  sessionId={session.sessionId}
                  state={session.state}
                  {...(session.revision === undefined
                    ? {}
                    : { revision: session.revision })}
                  {...(session.revision === undefined &&
                  resultInterpretation.trim().length >= 20
                    ? { initialInterpretation: resultInterpretation }
                    : {})}
                  {...(session.transferResult === undefined
                    ? {}
                    : { transferOutcome: session.transferResult.outcome })}
                  {...(restoredTransferDecision === undefined
                    ? {}
                    : { initialDecisionChoice: restoredTransferDecision })}
                  {...(restoredTransferMetric === undefined
                    ? {}
                    : { initialMetricChoice: restoredTransferMetric })}
                  {...(restoredTransferEvidence.length === 0
                    ? {}
                    : { initialEvidenceChoices: restoredTransferEvidence })}
                  updateSession={updateSession}
                />
              </Suspense>
              {session.transferResult?.outcome === "PASSED" && (
                <Suspense
                  fallback={
                    <DeferredPanelFallback label="Loading repair review…" />
                  }
                >
                  <LazyImbalancePatchReview
                    session={session}
                    updateSession={updateSession}
                  />
                </Suspense>
              )}
              {session.revision !== undefined && (
                <section className="revision panel">
                  <p className="eyebrow">Saved revision</p>
                  <h4>{session.revision}</h4>
                </section>
              )}
            </>
          ),
      },
    },
  };

  return (
    <main
      className="workspace shell reality imbalance-reality"
      id="main-content"
      tabIndex={-1}
    >
      <div className="screen-intro compact">
        <p className="eyebrow aqua">Boundary · Verified result</p>
        <h1>Compare the verified rare-event result.</h1>
        <p>
          The fixed values are visible now. Write what you notice before
          CounterLab reveals its bounded interpretation.
        </p>
      </div>
      <LearnerCoach
        next="observe the result, explore it, then find and apply its boundary."
        why={
          !interpretationComplete
            ? "The verified values are available for your interpretation. The four views change presentation only; fixed evidence remains the authority."
            : `The majority baseline is ${percent.format(majority.metrics.accuracy)} accurate with ${percent.format(majority.metrics.recall)} rare-class recall. The four views change presentation only; fixed evidence remains the authority.`
        }
      />
      <ExperimentTheater
        key={session?.sessionId ?? result.resultHash}
        prediction={predictionSummary}
        verifiedPayload={theaterPayload}
        initialView={restoreApplyView ? "apply" : "observe"}
      />
    </main>
  );
}

function RealityScreen(props: {
  claim: string;
  prediction: PredictionChoice;
  result: VerifiedResultSet;
  session: SessionView | null;
  artifact: ArtifactView | null;
  updateSession: (session: SessionView) => void;
  recordCompilerEvents: (
    sessionId: string,
    events: readonly PublicCompilerEvent[],
  ) => void;
}) {
  if (props.result.concept === "class_imbalance") {
    return (
      <ImbalanceRealityScreen
        claim={props.claim}
        prediction={props.prediction}
        result={props.result as ImbalanceVerifiedResultSet}
        session={props.session}
        updateSession={props.updateSession}
      />
    );
  }
  return (
    <LeakageRealityScreen
      {...props}
      result={props.result as LeakageVerifiedResultSet}
    />
  );
}

function LiveSetup({
  health,
  checking,
  checkError,
  uploadNotebook,
  pendingArtifact,
  retrySessionSetup,
  retry,
  fallBack,
  busy,
}: {
  health: CapabilityHealth | null;
  checking: boolean;
  checkError: string | null;
  uploadNotebook: (file: File) => void;
  pendingArtifact: ArtifactView | null;
  retrySessionSetup: () => void;
  retry: () => void;
  fallBack: (mode: Mode) => void;
  busy: boolean;
}) {
  const configured = health?.liveGpt === "configured";
  const runnerConfigured =
    health?.readiness === "ready" &&
    health?.liveCodex === "configured" &&
    health.liveKernel === "configured" &&
    health.sandbox === "credential-and-privilege-boundary" &&
    health.generationFilesystemReadIsolation === "OS_ENFORCED" &&
    health.release?.status === "bound";
  return (
    <main className="workspace shell narrow" id="main-content" tabIndex={-1}>
      <div className="screen-intro">
        <p className="eyebrow">Use your notebook</p>
        <h1>Test my notebook</h1>
        <p>
          First, CounterLab checks whether this device has the tools needed to
          create and verify a live lesson.
        </p>
      </div>
      <section className="setup-card panel">
        {checking ? (
          <div className="setup-row" role="status">
            <span className="status-dot pending" />
            <div>
              <strong>Checking lesson tools</strong>
              <p>Your notebook has not been sent.</p>
            </div>
          </div>
        ) : checkError !== null ? (
          <div className="setup-row" role="alert">
            <span className="status-dot unavailable" />
            <div>
              <strong>Capability check unavailable</strong>
              <p>{checkError} No live request has started.</p>
            </div>
          </div>
        ) : (
          <>
            <div className="setup-row">
              <span
                className={`status-dot ${configured ? "configured" : "unavailable"}`}
              />
              <div>
                <strong>
                  {configured
                    ? "Notebook lesson tools are ready to try"
                    : "Live notebook lessons are not set up"}
                </strong>
                <p>
                  {configured
                    ? "The first lesson request confirms that the connection works."
                    : "Nothing was sent. You can still use the sample lesson or watch the replay."}
                </p>
              </div>
            </div>
            <div className="setup-row">
              <span
                className={`status-dot ${runnerConfigured ? "configured" : "pending"}`}
              />
              <div>
                <strong>
                  {runnerConfigured
                    ? "Source-bound hosted notebook runner is ready"
                    : "A qualified hosted runner is needed for the final lab"}
                </strong>
                <p>
                  {runnerConfigured
                    ? "Plans, verification, and fixed-kernel results can complete in this hosted session."
                    : health?.generationFilesystemReadIsolation === "PARTIAL"
                      ? "Generation filesystem read isolation is partial and is not accepted as live authority. Use the verified sample or replay."
                      : "You can review the notebook and make a prediction here. The checked experiment runs only on a separately protected device."}
                </p>
              </div>
            </div>
          </>
        )}
      </section>
      {pendingArtifact?.support.status === "SUPPORTED" && (
        <section className="setup-card panel" role="status">
          <div className="setup-row">
            <span className="status-dot configured" />
            <div>
              <strong>Notebook intake passed</strong>
              <p>
                {pendingArtifact.fileName} is preserved in this tab. The private
                investigation still needs its source-bound session.
              </p>
            </div>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={retrySessionSetup}
          >
            Retry private session setup
          </button>
        </section>
      )}
      <div className="action-cluster">
        {configured && runnerConfigured && !checking && checkError === null && (
          <label className="upload-control">
            <span className="upload-title">
              <Mark name="spark" /> Attach a supported notebook
            </span>
            <input
              type="file"
              accept=".ipynb,application/x-ipynb+json,application/json"
              disabled={busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) uploadNotebook(file);
              }}
            />
            <small>
              Intake reads supported notebook evidence and never executes its
              cells. The investigation starts only after a supported decision.
            </small>
          </label>
        )}
        {checkError !== null && (
          <button
            className="button button-primary"
            type="button"
            onClick={retry}
          >
            Check again
          </button>
        )}
        <button
          className="button button-quiet"
          type="button"
          onClick={() => fallBack("instant")}
        >
          Use the sample lesson
        </button>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => fallBack("replay")}
        >
          Watch the verified replay
        </button>
      </div>
    </main>
  );
}

function compilerEventCopy(event: PublicCompilerEvent): {
  label: string;
  detail: string;
  tone: "active" | "verified" | "rejected";
} {
  switch (event.kind) {
    case "job.started":
      return {
        label: "Runner started",
        detail: "A protected runner accepted this one-session job.",
        tone: "active",
      };
    case "plan.summary":
      return {
        label: event.title,
        detail: event.steps.join(" · "),
        tone: "active",
      };
    case "artifact.read":
      return {
        label: "Notebook evidence resolved",
        detail: `${event.evidenceRefs.length} approved reference${event.evidenceRefs.length === 1 ? "" : "s"} linked to exact cells.`,
        tone: "active",
      };
    case "file.created":
      return {
        label: `${event.path} created`,
        detail: `Integrity hash ${event.sha256.slice(0, 12)}…`,
        tone: "active",
      };
    case "diff.updated":
      return {
        label: `${event.path} revised`,
        detail: "A bounded repair changed the generated plan.",
        tone: "active",
      };
    case "command.completed":
      return {
        label: event.label,
        detail: `Exit ${event.exitCode} · ${event.durationMs} ms · ${event.excerpt}`,
        tone: event.exitCode === 0 ? "verified" : "rejected",
      };
    case "verifier.rejected":
      return {
        label: `Rejected: ${event.invariant}`,
        detail: event.counterexample,
        tone: "rejected",
      };
    case "repair.started":
      return {
        label: `Repair ${event.attempt} started`,
        detail:
          "Only the structured counterexample was returned to the compiler.",
        tone: "active",
      };
    case "verifier.verified":
      return {
        label: "External verifier accepted the plan",
        detail: `${event.invariantCount} invariants · ${event.mutationCount} mutations checked`,
        tone: "verified",
      };
    case "result.ready":
      return {
        label: "Fixed-kernel result ready",
        detail: `Result hash ${event.resultHash.slice(0, 12)}…`,
        tone: "verified",
      };
    case "job.failed":
      return {
        label: `Runner stopped: ${event.code}`,
        detail: event.message,
        tone: "rejected",
      };
  }
}

function LiveCompileScreen({
  concept,
  events,
  job,
  failed,
  canCancel,
  retrying,
  cancelling,
  onRetry,
  onCancel,
}: {
  concept: BeliefTest["concept"] | undefined;
  events: readonly PublicCompilerEvent[];
  job: RunnerJob | null;
  failed: boolean;
  canCancel: boolean;
  retrying: boolean;
  cancelling: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const verified = events.some(
    (event) =>
      event.kind === "verifier.verified" || event.kind === "result.ready",
  );
  const repairStory = fairTestRepairStory(events);
  return (
    <main
      className="workspace shell live-compiler"
      id="main-content"
      tabIndex={-1}
    >
      <div className="screen-intro compact">
        <p className="eyebrow">03 · Build and verify</p>
        <h1>
          {failed
            ? "The runner stopped safely."
            : verified
              ? "The fair test passed its checks."
              : "Building your fair test…"}
        </h1>
        <p>
          {failed
            ? "No result was released. Your notebook evidence and locked prediction are preserved, so you can retry without starting over."
            : "Your prediction is locked. The compiler can propose a plan, but only the independent verifier can authorize a result."}
        </p>
      </div>
      <div className="lock-notice">
        <Mark name="lock" />
        <strong>Your answer is immutable</strong>
        <span>No experimental value is shown until verification finishes.</span>
      </div>
      {!failed && canCancel && (
        <div className="compiler-controls">
          <span>
            You can leave this page and return; CounterLab will reconnect to the
            same protected job.
          </span>
          <button
            className="button button-quiet"
            type="button"
            disabled={cancelling}
            onClick={onCancel}
          >
            {cancelling ? "Cancelling safely…" : "Cancel this test"}
          </button>
        </div>
      )}
      {failed && (
        <section className="panel compiler-retry" aria-labelledby="retry-title">
          <div>
            <p className="eyebrow gold">Safe stop · Evidence preserved</p>
            <h2 id="retry-title">Try a fresh bounded compiler turn.</h2>
            <p>
              CounterLab will create a new separate job. The failed job stays in
              the proof history and still cannot release a result.
            </p>
          </div>
          <button
            className="button button-primary"
            type="button"
            disabled={retrying}
            onClick={onRetry}
          >
            {retrying ? "Retrying…" : "Retry protected compile"}
          </button>
        </section>
      )}
      <FairTestBuilder
        {...fairTestExplanationFor(concept)}
        events={events}
        verificationState={
          failed ? "stopped" : verified ? "verified" : "verifying"
        }
        {...(repairStory === undefined ? {} : { repairStory })}
        sanitizedTechnicalDetails={[
          {
            label: "Runner state",
            value: job?.status.replaceAll("_", " ") ?? "STARTING",
          },
          ...events.map(technicalDetailForEvent),
        ]}
      />
    </main>
  );
}

export function App() {
  const [judgeMode, setJudgeMode] = useState(
    () => parseStudioLocation(window.location.pathname).kind === "judge",
  );
  const [mode, setMode] = useState<Mode | null>(null);
  const [stage, setStage] = useState<Stage>("landing");
  const [claim, setClaim] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [prediction, setPrediction] = useState<PredictionChoice | null>(null);
  const [confidence, setConfidence] = useState(72);
  const [reviewStep, setReviewStep] = useState<ReviewStep | null>(null);
  const [replayIntro, setReplayIntro] = useState(false);
  const [activeReplayId, setActiveReplayId] = useState<string | null>(null);
  const [activeReplay, setActiveReplay] = useState<VerifiedReplay | null>(null);
  const [locationRevision, setLocationRevision] = useState(0);
  const [routeHydrated, setRouteHydrated] = useState(false);
  const [routeRecovery, setRouteRecovery] = useState<{
    reason: RouteRecoveryReason;
    attemptedPath: string;
  } | null>(null);
  const routeRecoveryHeadingRef = useRef<HTMLHeadingElement>(null);
  const [artifact, setArtifact] = useState<ArtifactView | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [storedProofSnapshot, setStoredProofSnapshot] = useState<{
    sessionId: string;
    sessionVersion: number;
    evidenceEvents: readonly EvidenceEvent[];
    compilerEvents: readonly PublicCompilerEvent[];
  } | null>(null);
  const [proofEventRequest, setProofEventRequest] = useState<{
    sessionId: string;
    sessionVersion: number;
    status: Exclude<ProofEventLoadStatus, "idle">;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveHealth, setLiveHealth] = useState<CapabilityHealth | null>(null);
  const [liveHealthError, setLiveHealthError] = useState<string | null>(null);
  const [checkingLiveHealth, setCheckingLiveHealth] = useState(false);
  const [cancellingRunner, setCancellingRunner] = useState(false);
  const [restartRequest, setRestartRequest] = useState<{
    sessionId: string;
    jobs: ActiveRunnerRecord[];
  } | null>(null);
  const [restartBusy, setRestartBusy] = useState(false);
  const [analysisPreview, setAnalysisPreview] =
    useState<BeliefAnalysisPreview | null>(null);
  const [sensitiveContentApproved, setSensitiveContentApproved] =
    useState(false);
  const [runnerJob, setRunnerJob] = useState<RunnerJob | null>(null);
  const [transientCompilerEvents, setTransientCompilerEvents] = useState<{
    sessionId: string;
    events: readonly PublicCompilerEvent[];
  } | null>(null);
  const runner = useRunnerEvents();
  const proofEventRequestGeneration = useRef(0);
  const userRequestGeneration = useRef(0);
  const downloadRequestInFlight = useRef(false);
  const activeSessionId = session?.sessionId ?? null;
  const activeSessionVersion = session?.version ?? null;
  const recordTransientCompilerEvents = useCallback(
    (sessionId: string, events: readonly PublicCompilerEvent[]) => {
      setTransientCompilerEvents((current) => {
        const existing = current?.sessionId === sessionId ? current.events : [];
        const additions = events.filter(
          (candidate) =>
            !existing.some(
              (recorded) =>
                recorded.eventId === candidate.eventId &&
                JSON.stringify(recorded) === JSON.stringify(candidate),
            ),
        );
        if (additions.length === 0 && current?.sessionId === sessionId) {
          return current;
        }
        return { sessionId, events: [...existing, ...additions] };
      });
    },
    [],
  );
  useEffect(() => {
    setTransientCompilerEvents((current) =>
      current?.sessionId === activeSessionId ? current : null,
    );
  }, [activeSessionId]);
  const mergedProofEvents = useMemo(() => {
    const proofBundle = session?.proofBundle;
    return mergeProofEventSources({
      ...(activeSessionId === null
        ? {}
        : { expectedSessionId: activeSessionId }),
      storedEvidenceEvents:
        storedProofSnapshot?.sessionId === activeSessionId
          ? storedProofSnapshot.evidenceEvents
          : [],
      recordedCompilerEvents:
        activeSessionId === null
          ? []
          : [
              ...(storedProofSnapshot?.sessionId === activeSessionId
                ? storedProofSnapshot.compilerEvents
                : []),
              ...(proofBundle?.schemaVersion === "2"
                ? proofBundle.publicCompilerEvents
                : []),
            ],
      streamedCompilerEvents:
        activeSessionId === null
          ? []
          : [
              ...(runnerJob === null || runnerJob.sessionId === activeSessionId
                ? runner.events
                : []),
              ...(transientCompilerEvents?.sessionId === activeSessionId
                ? transientCompilerEvents.events
                : []),
            ],
    });
  }, [
    activeSessionId,
    runner.events,
    runnerJob,
    session?.proofBundle,
    storedProofSnapshot,
    transientCompilerEvents,
  ]);
  const proofEventStatus: ProofEventLoadStatus =
    activeSessionId === null
      ? "idle"
      : proofEventRequest?.sessionId === activeSessionId &&
          proofEventRequest.sessionVersion === activeSessionVersion
        ? proofEventRequest.status
        : "loading";
  const replay = mode === "replay";
  const hostedReplay =
    activeReplay !== null && "projectionKind" in activeReplay
      ? activeReplay
      : null;
  const legacyReplay =
    activeReplay !== null && !("projectionKind" in activeReplay)
      ? activeReplay
      : null;
  const legacyReplayResult = legacyReplay?.result;
  const verifiedResult =
    session === null
      ? legacyReplayResult
      : session.prediction === undefined
        ? undefined
        : session.verifiedResult;
  const beliefNarrativeWithheld =
    sessionBeliefNarrativeIssues(session).length > 0;
  const belief = sessionBeliefPresentation(session);
  const effectiveClaim =
    belief?.claim ||
    session?.beliefSpec?.claim ||
    session?.beliefTest?.learnerClaim ||
    hostedReplay?.question.claim ||
    claim ||
    "The notebook accuracy proves generalization to new customers.";
  const activeLearnerStage =
    stage === "landing"
      ? "question"
      : currentLearnerStage(stage as StudioStage, session?.state);
  const activeHint = subjectPackHint(belief?.concept, activeLearnerStage);

  useLearnerStageTiming({
    sessionId: session?.sessionId ?? null,
    stage: activeLearnerStage,
    journeyComplete: sessionProofReady(session),
  });

  const reportError = (caught: unknown) => {
    if (caught instanceof Error && caught.name === "AbortError") return;
    if (
      caught instanceof ApiClientError &&
      caught.code === "LIVE_UNAVAILABLE"
    ) {
      setError(
        "Live reasoning is unavailable. Check the server configuration or use an offline path. No live result was produced.",
      );
      return;
    }
    if (
      caught instanceof ApiClientError &&
      (caught.code === "ILLEGAL_TRANSITION" ||
        caught.code === "SESSION_STEP_CLOSED")
    ) {
      setError(
        "That investigation step is closed. Keep your claim and start a fresh investigation to revise it.",
      );
      return;
    }
    setError(
      caught instanceof ApiClientError
        ? caught.message
        : "CounterLab could not complete this step.",
    );
  };

  const withRequest = async (
    operation: (request: { assertCurrent: () => void }) => Promise<void>,
  ) => {
    const generation = userRequestGeneration.current + 1;
    userRequestGeneration.current = generation;
    const assertCurrent = () => {
      if (userRequestGeneration.current !== generation) {
        throw new DOMException(
          "Request superseded by navigation",
          "AbortError",
        );
      }
    };
    setBusy(true);
    setError(null);
    try {
      await operation({ assertCurrent });
      assertCurrent();
    } catch (caught) {
      if (userRequestGeneration.current === generation) reportError(caught);
    } finally {
      if (userRequestGeneration.current === generation) setBusy(false);
    }
  };

  const rememberRunnerJob = (job: RunnerJob) => {
    setRunnerJob(job);
    rememberRunnerCheckpoint(job.sessionId, job);
    try {
      registerActiveRunnerJob(
        {
          sessionId: job.sessionId,
          jobId: job.jobId,
          kind: job.kind,
          registeredAt: new Date().toISOString(),
        },
        window.sessionStorage,
      );
    } catch {
      // The local reconnect checkpoint remains available when session storage
      // is blocked by the browser.
    }
  };

  const forgetRunnerJob = (sessionId: string, jobId?: string) => {
    forgetRunnerCheckpoint(sessionId, jobId);
    if (jobId !== undefined) {
      try {
        markActiveRunnerJobTerminal(sessionId, jobId, window.sessionStorage);
      } catch {
        // Storage is only a recovery aid; the server remains authoritative.
      }
    }
  };

  const advanceLiveLab = async (
    startingSession: SessionView,
    request: { assertCurrent: () => void } = { assertCurrent: () => undefined },
  ) => {
    const sessionId = startingSession.sessionId;
    let current: SessionView & { runnerJob?: RunnerJob | undefined } =
      startingSession;
    setStage("live-compile");

    if (
      current.state === "PREDICTION_COMMITTED" ||
      current.state === "LAB_REJECTED"
    ) {
      runner.clear();
      forgetRunnerJob(sessionId);
      const compiled = await counterLabApi.compileLab(sessionId);
      request.assertCurrent();
      setSession(compiled);
      current = compiled;
      if (compiled.runnerJob !== undefined)
        rememberRunnerJob(compiled.runnerJob);
    }

    if (current.state === "LAB_COMPILING") {
      const checkpoint = storedRunnerCheckpoint(sessionId);
      let jobId = current.runnerJob?.jobId ?? checkpoint?.jobId ?? null;
      if (jobId === null || jobId === undefined) {
        const recovered = await counterLabApi.compileLab(sessionId);
        request.assertCurrent();
        setSession(recovered);
        current = recovered;
        if (recovered.runnerJob !== undefined) {
          rememberRunnerJob(recovered.runnerJob);
          jobId = recovered.runnerJob.jobId;
        }
      }
      if (jobId === null || jobId === undefined) {
        throw new ApiClientError({
          code: "RUNNER_RESUME_TOKEN_MISSING",
          message:
            "CounterLab found an active compile but could not reconnect to its public event stream.",
          status: 409,
          retryable: true,
        });
      }
      current = await runner.waitForJob({
        sessionId,
        jobId,
        jobKind: "LAB_COMPILE",
        terminalStates: ["LAB_VERIFIED", "LAB_REJECTED"],
        onSession: (updated) => {
          request.assertCurrent();
          setSession(updated);
        },
      });
      request.assertCurrent();
    }

    if (current.state === "LAB_REJECTED") {
      throw new ApiClientError({
        code: "LAB_REJECTED",
        message:
          "The external verifier rejected this plan. No experimental result was released.",
        status: 409,
      });
    }

    if (
      current.state === "LAB_VERIFIED" &&
      current.verifiedResult === undefined
    ) {
      const run = await counterLabApi.runLab(sessionId);
      request.assertCurrent();
      setSession(run);
      current = run;
      if (run.runnerJob !== undefined) rememberRunnerJob(run.runnerJob);
    }

    if (
      current.state === "LAB_COMPILING" ||
      (current.state === "LAB_VERIFIED" && current.verifiedResult === undefined)
    ) {
      const checkpoint = storedRunnerCheckpoint(sessionId);
      const jobId = current.runnerJob?.jobId ?? checkpoint?.jobId ?? null;
      if (jobId === null || jobId === undefined) {
        throw new ApiClientError({
          code: "RUNNER_RESUME_TOKEN_MISSING",
          message:
            "CounterLab found an active kernel run but could not reconnect to its public event stream.",
          status: 409,
          retryable: true,
        });
      }
      current = await runner.waitForJob({
        sessionId,
        jobId,
        jobKind: "LAB_RUN",
        terminalStates: ["EXPERIMENT_COMPLETED", "LAB_REJECTED"],
        onSession: (updated) => {
          request.assertCurrent();
          setSession(updated);
        },
      });
      request.assertCurrent();
    }

    if (
      current.state !== "EXPERIMENT_COMPLETED" ||
      current.verifiedResult === undefined
    ) {
      throw new ApiClientError({
        code: "RESULT_NOT_AUTHORIZED",
        message:
          "The fixed kernel did not release a verified result for this session.",
        status: 409,
      });
    }
    request.assertCurrent();
    forgetRunnerJob(sessionId);
    setSession(current);
    setStage("build");
  };

  const retryLiveLab = () => {
    if (session === null) return;
    void withRequest(async (request) => {
      const restored = await counterLabApi.getSession(session.sessionId);
      request.assertCurrent();
      setSession(restored);
      await advanceLiveLab(restored, request);
    });
  };

  const cancelLiveLab = () => {
    const checkpoint =
      session === null ? null : storedRunnerCheckpoint(session.sessionId);
    const jobId = runnerJob?.jobId ?? checkpoint?.jobId ?? null;
    if (session === null || jobId === null || cancellingRunner) return;
    const generation = userRequestGeneration.current + 1;
    userRequestGeneration.current = generation;
    const sessionId = session.sessionId;
    setCancellingRunner(true);
    runner.cancel();
    void counterLabApi
      .cancelRunnerJob(sessionId, jobId)
      .then((updated) => {
        if (userRequestGeneration.current !== generation) return;
        setSession(updated);
        setRunnerJob(updated.runnerJob);
        forgetRunnerJob(sessionId, jobId);
        setError(
          "You cancelled this test before it could release a result. Your notebook, claim, and locked prediction are preserved.",
        );
      })
      .catch((caught: unknown) => {
        if (userRequestGeneration.current === generation) reportError(caught);
      })
      .finally(() => {
        if (userRequestGeneration.current === generation) {
          setCancellingRunner(false);
        }
      });
  };

  const resetJourney = (notice?: string) => {
    userRequestGeneration.current += 1;
    Object.values(storageKeys).forEach((key) =>
      window.localStorage.removeItem(key),
    );
    clearAllActiveRunnerCheckpoints(window.localStorage);
    window.history.replaceState({}, "", "/");
    setJudgeMode(false);
    setMode(null);
    setStage("landing");
    setClaim("");
    setConfirmed(false);
    setPrediction(null);
    setConfidence(72);
    setReviewStep(null);
    setReplayIntro(false);
    setActiveReplayId(null);
    setActiveReplay(null);
    setArtifact(null);
    setSession(null);
    setError(notice ?? null);
    setBusy(false);
    setCancellingRunner(false);
    setAnalysisPreview(null);
    setSensitiveContentApproved(false);
    setRunnerJob(null);
    setRouteRecovery(null);
    setRestartRequest(null);
    setRestartBusy(false);
    setRouteHydrated(true);
    runner.clear();
  };

  const restart = () => {
    if (restartBusy) return;
    const sessionId =
      session?.sessionId ?? window.localStorage.getItem(storageKeys.sessionId);
    if (sessionId !== null) {
      const jobs = knownActiveRunnerJobs(sessionId);
      if (jobs.length > 0) {
        setRestartRequest({ sessionId, jobs });
        return;
      }
    }
    resetJourney();
  };

  const revokeCurrentSessionAccess = () => {
    if (session === null || busy) return;
    if (knownActiveRunnerJobs(session.sessionId).length > 0) {
      setError(
        "Cancel the active test before revoking this browser's private session access.",
      );
      return;
    }
    const sessionId = session.sessionId;
    const sessionMode = presentationMode(session.mode);
    void withRequest(async (request) => {
      await counterLabApi.revokeSessionAccess(sessionId);
      request.assertCurrent();
      removeRecentWork(sessionId, sessionMode, window.localStorage);
      resetJourney(
        "Private session access was revoked. Stored immutable evidence was not deleted.",
      );
    });
  };

  const dismissRestart = useCallback(() => {
    if (!restartBusy) setRestartRequest(null);
  }, [restartBusy]);

  const confirmRestart = async () => {
    if (restartRequest === null || restartBusy) return;
    const generation = userRequestGeneration.current + 1;
    userRequestGeneration.current = generation;
    const request = restartRequest;
    setRestartBusy(true);
    runner.cancel();
    const confirmedTerminal = await Promise.all(
      request.jobs.map(async (job) => {
        const controller = new AbortController();
        const timeout = window.setTimeout(
          () =>
            controller.abort(
              new DOMException("Cancellation timed out", "TimeoutError"),
            ),
          8_000,
        );
        try {
          await counterLabApi.cancelRunnerJob(
            request.sessionId,
            job.jobId,
            controller.signal,
          );
          return true;
        } catch (caught) {
          return (
            caught instanceof ApiClientError &&
            caught.code === "RUNNER_JOB_NOT_ACTIVE"
          );
        } finally {
          window.clearTimeout(timeout);
        }
      }),
    );
    if (userRequestGeneration.current !== generation) return;
    let unresolved = 0;
    for (const [index, job] of request.jobs.entries()) {
      if (confirmedTerminal[index] === true) {
        try {
          markActiveRunnerJobTerminal(
            request.sessionId,
            job.jobId,
            window.sessionStorage,
          );
        } catch {
          // A blocked storage surface does not change the server's terminal
          // cancellation authority.
        }
      } else {
        unresolved += 1;
      }
    }
    resetJourney(
      unresolved === 0
        ? undefined
        : `CounterLab returned home, but could not confirm cancellation for ${unresolved} live ${unresolved === 1 ? "job" : "jobs"}. The ${unresolved === 1 ? "job remains" : "jobs remain"} registered for recovery; no result was authorized by leaving the page.`,
    );
  };

  useEffect(() => {
    const handlePopState = () => {
      userRequestGeneration.current += 1;
      setBusy(false);
      setCancellingRunner(false);
      setRestartBusy(false);
      setRouteHydrated(false);
      setLocationRevision((current) => current + 1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => {
      userRequestGeneration.current += 1;
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  useEffect(() => {
    if (routeRecovery !== null) routeRecoveryHeadingRef.current?.focus();
  }, [routeRecovery]);

  useEffect(() => {
    if (session !== null) {
      upsertRecentWork(
        {
          id: session.sessionId,
          mode: presentationMode(session.mode),
          status: session.state,
          updatedAt: new Date().toISOString(),
        },
        window.localStorage,
      );
      return;
    }
    if (activeReplayId !== null && activeReplay !== null) {
      upsertRecentWork(
        {
          id: activeReplayId,
          mode: "replay",
          status: "STORED_EVIDENCE",
          updatedAt: new Date().toISOString(),
        },
        window.localStorage,
      );
    }
  }, [activeReplay, activeReplayId, session]);

  useEffect(() => {
    proofEventRequestGeneration.current += 1;
    const requestGeneration = proofEventRequestGeneration.current;
    if (activeSessionId === null || activeSessionVersion === null) {
      setStoredProofSnapshot(null);
      setProofEventRequest(null);
      return;
    }

    let active = true;
    setProofEventRequest({
      sessionId: activeSessionId,
      sessionVersion: activeSessionVersion,
      status: "loading",
    });
    void counterLabApi
      .getEvents(activeSessionId)
      .then((snapshot) => {
        if (
          !active ||
          proofEventRequestGeneration.current !== requestGeneration
        )
          return;
        setStoredProofSnapshot({
          sessionId: activeSessionId,
          sessionVersion: activeSessionVersion,
          evidenceEvents: snapshot.events,
          compilerEvents: snapshot.compilerEvents ?? [],
        });
        setProofEventRequest({
          sessionId: activeSessionId,
          sessionVersion: activeSessionVersion,
          status: "ready",
        });
      })
      .catch(() => {
        if (
          !active ||
          proofEventRequestGeneration.current !== requestGeneration
        )
          return;
        setStoredProofSnapshot((current) =>
          current?.sessionId === activeSessionId ? null : current,
        );
        setProofEventRequest({
          sessionId: activeSessionId,
          sessionVersion: activeSessionVersion,
          status: "failed",
        });
      });

    return () => {
      active = false;
    };
  }, [activeSessionId, activeSessionVersion]);

  useEffect(() => {
    let active = true;
    const attemptedPath = window.location.pathname;
    const route = parseStudioLocation(attemptedPath);

    if (route.kind === "not-found") {
      runner.clear();
      setJudgeMode(false);
      setMode(null);
      setStage("landing");
      setActiveReplayId(null);
      setActiveReplay(null);
      setSession(null);
      setArtifact(null);
      setBusy(false);
      setError(null);
      setRouteHydrated(false);
      setRouteRecovery({ reason: "unknown-route", attemptedPath });
      return;
    }

    setRouteRecovery(null);

    if (route.kind === "judge") {
      runner.clear();
      setJudgeMode(true);
      setMode(null);
      setStage("landing");
      setActiveReplayId(null);
      setActiveReplay(null);
      setSession(null);
      setArtifact(null);
      setError(null);
      setRouteHydrated(true);
      void checkLiveCapabilities(false);
      return;
    }

    setJudgeMode(false);

    if (route.kind === "landing") {
      restart();
      return;
    }

    if (route.kind === "replay") {
      const replayId = route.id;
      runner.clear();
      setMode("replay");
      setActiveReplayId(replayId);
      setActiveReplay(null);
      setSession(null);
      setArtifact(null);
      setError(null);
      window.localStorage.setItem(storageKeys.mode, "replay");
      window.localStorage.setItem(storageKeys.replayId, replayId);
      setReplayIntro(
        window.localStorage.getItem(storageKeys.replayIntro) !== "false",
      );
      setStage(
        window.localStorage.getItem(storageKeys.replayStage) === "reality"
          ? "reality"
          : "build",
      );
      setRouteHydrated(true);
      setBusy(true);
      void counterLabApi
        .getReplay(replayId)
        .then((loaded) => {
          if (!active) return;
          setActiveReplay(loaded);
          if ("projectionKind" in loaded) {
            setReplayIntro(false);
            setStage("reality");
          }
        })
        .catch((caught: unknown) => {
          if (active) {
            const missing =
              caught instanceof ApiClientError && caught.status === 404;
            if (missing) {
              removeRecentWork(replayId, "replay", window.localStorage);
            }
            setError(null);
            setRouteHydrated(false);
            setRouteRecovery({
              reason: missing ? "missing-replay" : "unverified-replay",
              attemptedPath,
            });
          }
        })
        .finally(() => {
          if (active) setBusy(false);
        });
      return () => {
        active = false;
      };
    }

    setActiveReplayId(null);
    setActiveReplay(null);
    setReplayIntro(false);

    if (route.kind === "new") {
      runner.clear();
      const storedClaim =
        window.localStorage.getItem(storageKeys.claim)?.trim() ?? "";
      setMode("live");
      setClaim(storedClaim);
      setStage(storedClaim.length > 0 ? "question-path" : "live-setup");
      setSession(null);
      setArtifact(null);
      setError(null);
      window.localStorage.setItem(storageKeys.mode, "live");
      setRouteHydrated(true);
      if (storedClaim.length === 0) void checkLiveCapabilities(true);
      return;
    }

    const sessionId = route.id;
    const storedClaimOwner =
      window.localStorage.getItem(storageKeys.claimSessionId) ??
      window.localStorage.getItem(storageKeys.sessionId);
    const storedClaim =
      storedClaimOwner === sessionId
        ? window.localStorage.getItem(storageKeys.claim)
        : null;
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        let restored: SessionView;
        try {
          restored = await counterLabApi.getSession(sessionId);
        } catch (caught) {
          if (active) {
            if (caught instanceof ApiClientError && caught.status === 404) {
              removeRecentWork(sessionId, "live", window.localStorage);
              removeRecentWork(sessionId, "instant", window.localStorage);
            }
            setRouteHydrated(false);
            setRouteRecovery({
              reason:
                route.kind === "proof" ? "missing-proof" : "missing-session",
              attemptedPath,
            });
          }
          return;
        }
        let restoredArtifact: ArtifactView;
        try {
          restoredArtifact = await counterLabApi.getSessionArtifact(
            restored.sessionId,
          );
        } catch (caught) {
          if (active) {
            if (caught instanceof ApiClientError && caught.status === 404) {
              removeRecentWork(
                restored.sessionId,
                presentationMode(restored.mode),
                window.localStorage,
              );
            }
            setRouteHydrated(false);
            setRouteRecovery({ reason: "missing-artifact", attemptedPath });
          }
          return;
        }
        if (!active) return;
        const restoredBelief = sessionBeliefPresentation(restored);
        setClaim(
          restoredBelief?.claim ??
            restored.beliefSpec?.claim ??
            restored.beliefTest?.learnerClaim ??
            storedClaim ??
            "",
        );
        setArtifact(restoredArtifact);
        setSession(restored);
        setMode(presentationMode(restored.mode));
        window.localStorage.setItem(storageKeys.sessionId, restored.sessionId);
        window.localStorage.setItem(
          storageKeys.mode,
          presentationMode(restored.mode),
        );
        if (restored.prediction !== undefined) {
          setPrediction(
            predictionChoiceFromReceipt(restored.prediction.choice),
          );
          setConfidence(restored.prediction.confidence);
        }
        setConfirmed(
          restored.state !== "INGESTED" &&
            restored.state !== "BELIEF_TEST_PROPOSED",
        );
        if (route.kind === "proof") {
          if (!sessionProofReady(restored)) {
            setRouteHydrated(false);
            setRouteRecovery({ reason: "proof-not-ready", attemptedPath });
            return;
          }
          setStage("reality");
          setRouteHydrated(true);
          return;
        }
        // The route is safe to synchronize as soon as the persisted session
        // and artifact have been restored. A resumed runner may still fail;
        // keeping hydration disabled until that network job succeeds would
        // freeze later retry navigation on the stale URL.
        setRouteHydrated(true);
        if (
          restored.state === "INGESTED" ||
          restored.state === "INSUFFICIENT_EVIDENCE" ||
          restored.state === "REJECTED_BY_LEARNER"
        ) {
          setStage("claim");
        } else if (
          restored.state === "BELIEF_TEST_PROPOSED" ||
          restored.state === "BELIEF_TEST_CONFIRMED"
        ) {
          setStage("belief");
        } else if (
          restored.state === "PREDICTION_COMMITTED" ||
          restored.state === "LAB_COMPILING" ||
          restored.state === "LAB_REJECTED" ||
          restored.state === "LAB_VERIFIED"
        ) {
          if (
            restored.mode.kind === "live_notebook" &&
            restored.verifiedResult === undefined
          ) {
            await advanceLiveLab(restored, {
              assertCurrent: () => {
                if (!active) {
                  throw new DOMException(
                    "Route restoration superseded",
                    "AbortError",
                  );
                }
              },
            });
          } else {
            setStage("build");
          }
        } else {
          setStage("reality");
        }
      } catch (caught) {
        if (active) reportError(caught);
      } finally {
        if (active) setBusy(false);
      }
    })();
    return () => {
      active = false;
    };
    // Route restoration reruns only when browser history changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationRevision]);

  useLayoutEffect(() => {
    resetViewport(
      judgeMode
        ? "judge-title"
        : reviewStep !== null
          ? "review-title"
          : stage === "landing"
            ? "landing-title"
            : stage === "question-path"
              ? "claim-path-title"
              : undefined,
    );
  }, [judgeMode, reviewStep, stage]);

  useEffect(() => {
    if (!routeHydrated || judgeMode || routeRecovery !== null) return;
    const path = studioPath({
      stage,
      mode,
      ...(session === null ? {} : { sessionId: session.sessionId }),
      ...(activeReplayId === null ? {} : { replayId: activeReplayId }),
      completed: sessionProofReady(session),
    });
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }, [
    activeReplayId,
    judgeMode,
    mode,
    routeHydrated,
    routeRecovery,
    session,
    stage,
  ]);

  const checkLiveCapabilities = async (probeReadiness: boolean) => {
    const generation = userRequestGeneration.current;
    setCheckingLiveHealth(true);
    setLiveHealthError(null);
    setLiveHealth(null);
    try {
      const health = await counterLabApi.getHealth({ probeReadiness });
      if (userRequestGeneration.current !== generation) return;
      setLiveHealth(health);
    } catch (caught) {
      if (userRequestGeneration.current !== generation) return;
      setLiveHealthError(
        caught instanceof ApiClientError
          ? "CounterLab could not verify the capability response."
          : "CounterLab could not reach the capability service.",
      );
    } finally {
      if (userRequestGeneration.current === generation) {
        setCheckingLiveHealth(false);
      }
    }
  };

  const chooseMode = (nextMode: Mode) => {
    if (
      nextMode === "instant" &&
      bundledSampleEvidence.status !== "available"
    ) {
      setError(
        "The verified sample is unavailable because its bundled evidence did not pass local integrity checks.",
      );
      return;
    }
    setJudgeMode(false);
    setMode(nextMode);
    setReviewStep(null);
    setError(null);
    setAnalysisPreview(null);
    setSensitiveContentApproved(false);
    window.localStorage.setItem(storageKeys.mode, nextMode);
    if (nextMode === "instant") {
      setClaim(SAMPLE_LEAKAGE_QUESTION);
      window.localStorage.setItem(storageKeys.claim, SAMPLE_LEAKAGE_QUESTION);
    }
    if (nextMode === "live") {
      setStage("live-setup");
      void checkLiveCapabilities(true);
      return;
    }
    if (nextMode === "replay") {
      const replayId = "leakage-01";
      setActiveReplayId(replayId);
      window.localStorage.setItem(storageKeys.replayId, replayId);
      void withRequest(async (request) => {
        const loaded = await counterLabApi.getReplay(replayId);
        request.assertCurrent();
        setActiveReplay(loaded);
        setSession(null);
        setArtifact(null);
        window.localStorage.setItem(storageKeys.replayStage, "build");
        window.localStorage.setItem(storageKeys.replayIntro, "true");
        window.localStorage.removeItem(storageKeys.replayTransferState);
        window.localStorage.removeItem(storageKeys.replayRevision);
        setReplayIntro(true);
        setStage("build");
      });
      return;
    }
    void withRequest(async (request) => {
      const sample = await counterLabApi.createSampleArtifact();
      request.assertCurrent();
      const created = await counterLabApi.createSampleSession({
        sampleId: "leakage-01",
      });
      request.assertCurrent();
      setArtifact(sample);
      setSession(created);
      window.localStorage.setItem(storageKeys.sessionId, created.sessionId);
      window.localStorage.setItem(storageKeys.claim, SAMPLE_LEAKAGE_QUESTION);
      window.localStorage.setItem(
        storageKeys.claimSessionId,
        created.sessionId,
      );
      setStage("claim");
    });
  };

  const review = (step: ReviewStep) => {
    setReviewStep(step);
    resetViewport();
  };

  const returnToCurrent = () => {
    setReviewStep(null);
    window.requestAnimationFrame(() => resetViewport("learner-progress"));
  };

  const openRecentProject = (project: RecentProject) => {
    window.localStorage.setItem(storageKeys.sessionId, project.sessionId);
    window.localStorage.setItem(storageKeys.mode, project.mode);
    window.history.pushState(
      {},
      "",
      `/session/${encodeURIComponent(project.sessionId)}`,
    );
    window.location.reload();
  };

  const downloadCurrentPatch = () => {
    if (session?.patchResult === undefined || downloadRequestInFlight.current) {
      return;
    }
    downloadRequestInFlight.current = true;
    void withRequest(async (request) => {
      const download = await counterLabApi.downloadPatch(session.sessionId);
      request.assertCurrent();
      saveAuthenticatedDownload(download);
      void recordLearnerInteraction(session.sessionId, {
        kind: "patch.downloaded",
        stage: "repair",
      });
    }).finally(() => {
      downloadRequestInFlight.current = false;
    });
  };

  const exportCurrentProof = () => {
    if (
      session === null ||
      !sessionProofReady(session) ||
      downloadRequestInFlight.current
    ) {
      return;
    }
    downloadRequestInFlight.current = true;
    if (session.proofCapsule !== undefined) {
      void withRequest(async (request) => {
        const download = await counterLabApi.downloadProofCapsule(
          session.sessionId,
        );
        request.assertCurrent();
        saveAuthenticatedDownload(download);
        void recordLearnerInteraction(session.sessionId, {
          kind: "proof_capsule.downloaded",
          stage: "repair",
        });
      }).finally(() => {
        downloadRequestInFlight.current = false;
      });
      return;
    }
    void withRequest(async (request) => {
      const proof = await counterLabApi.getProofBundle(session.sessionId);
      request.assertCurrent();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(proof, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `counterlab-${session.sessionId}-proof-bundle.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    }).finally(() => {
      downloadRequestInFlight.current = false;
    });
  };

  const createLiveArtifactSession = async (
    uploaded: ArtifactView,
    request: { assertCurrent: () => void },
  ) => {
    setMode("live");
    setStage("live-setup");
    window.localStorage.setItem(storageKeys.mode, "live");
    const created = await counterLabApi.createLiveSession({
      artifactId: uploaded.artifactId,
    });
    request.assertCurrent();
    setSession(created);
    window.localStorage.setItem(storageKeys.sessionId, created.sessionId);
    if (claim.trim().length > 0) {
      window.localStorage.setItem(storageKeys.claim, claim);
      window.localStorage.setItem(
        storageKeys.claimSessionId,
        created.sessionId,
      );
    }
    setStage("claim");
  };

  const uploadNotebook = (file: File) => {
    void withRequest(async (request) => {
      setAnalysisPreview(null);
      setSensitiveContentApproved(false);
      const uploaded = await counterLabApi.uploadArtifact(file);
      request.assertCurrent();
      setArtifact(uploaded);
      setSession(null);
      window.localStorage.removeItem(storageKeys.sessionId);
      if (uploaded.support.status !== "SUPPORTED") {
        setMode("live");
        setStage("claim");
        window.localStorage.setItem(storageKeys.mode, "live");
        setError(
          uploaded.support.reasons[0]?.message ??
            "This notebook is outside the released live support boundary. No investigation was created.",
        );
        return;
      }
      await createLiveArtifactSession(uploaded, request);
    });
  };

  const retryLiveSessionSetup = () => {
    if (artifact?.support.status !== "SUPPORTED" || session !== null) return;
    void withRequest((request) => createLiveArtifactSession(artifact, request));
  };

  const restartClosedBeliefResponse = () => {
    if (session === null || !beliefResponseClosed(session)) return;
    const sourceClaim = claim.trim();
    void withRequest(async (request) => {
      const restarted = await counterLabApi.restartSession(session.sessionId);
      request.assertCurrent();
      const restartedClaim =
        sessionBeliefPresentation(restarted)?.claim ?? sourceClaim;
      setSession(restarted);
      setMode(presentationMode(restarted.mode));
      setClaim(restartedClaim);
      setConfirmed(
        restarted.state !== "INGESTED" &&
          restarted.state !== "BELIEF_TEST_PROPOSED",
      );
      setPrediction(
        restarted.prediction === undefined
          ? null
          : predictionChoiceFromReceipt(restarted.prediction.choice),
      );
      setConfidence(restarted.prediction?.confidence ?? 72);
      setAnalysisPreview(null);
      setSensitiveContentApproved(false);
      try {
        window.localStorage.setItem(storageKeys.sessionId, restarted.sessionId);
        window.localStorage.setItem(
          storageKeys.mode,
          presentationMode(restarted.mode),
        );
        if (restartedClaim.length > 0) {
          window.localStorage.setItem(storageKeys.claim, restartedClaim);
          window.localStorage.setItem(
            storageKeys.claimSessionId,
            restarted.sessionId,
          );
        } else {
          window.localStorage.removeItem(storageKeys.claim);
          window.localStorage.removeItem(storageKeys.claimSessionId);
        }
      } catch {
        // The reconciled server session remains authoritative when this
        // browser blocks optional local recovery storage.
      }
      setStage(restoredStageForSession(restarted));
    });
  };

  const proposeBeliefTest = () => {
    if (session === null || beliefResponseClosed(session)) return;
    const submittedClaim =
      session.mode.kind === "sample_lesson" ? SAMPLE_LEAKAGE_QUESTION : claim;
    window.localStorage.setItem(storageKeys.claim, submittedClaim);
    window.localStorage.setItem(storageKeys.claimSessionId, session.sessionId);
    void withRequest(async (request) => {
      if (mode === "live" && analysisPreview === null) {
        const preview = await counterLabApi.previewBeliefAnalysis(
          session.sessionId,
          claim,
        );
        request.assertCurrent();
        setAnalysisPreview(preview);
        setSensitiveContentApproved(false);
        return;
      }
      const updated = await counterLabApi.proposeBeliefTest(session.sessionId, {
        learnerClaim: submittedClaim,
        ...(analysisPreview === null
          ? {}
          : {
              previewHash: analysisPreview.previewHash,
              sensitiveContentApproved:
                analysisPreview.requiresSensitiveApproval
                  ? sensitiveContentApproved
                  : false,
            }),
      });
      request.assertCurrent();
      setSession(updated);
      const authoritativeClaim =
        sessionBeliefPresentation(updated)?.claim ?? submittedClaim;
      setClaim(authoritativeClaim);
      window.localStorage.setItem(storageKeys.claim, authoritativeClaim);
      setAnalysisPreview(null);
      setSensitiveContentApproved(false);
      setStage("belief");
    });
  };

  const updateClaim = (nextClaim: string) => {
    setClaim(nextClaim);
    setAnalysisPreview(null);
    setSensitiveContentApproved(false);
  };

  const confirmBeliefTest = () => {
    if (session === null) return;
    void withRequest(async (request) => {
      const updated = await counterLabApi.confirmBeliefTest(session.sessionId);
      request.assertCurrent();
      setSession(updated);
      setConfirmed(true);
    });
  };

  const stopBeliefTest = (reason: "rejected" | "insufficient") => {
    if (session === null) return;
    void withRequest(async (request) => {
      const stopped = await counterLabApi.respondToBeliefTest(
        session.sessionId,
        reason === "rejected"
          ? {
              action: "reject",
              reason: "Learner chose not to confirm the proposed explanation.",
            }
          : {
              action: "insufficient_evidence",
              reason: "Learner marked the available evidence insufficient.",
            },
      );
      request.assertCurrent();
      setSession(stopped);
      setConfirmed(false);
      setPrediction(null);
      setAnalysisPreview(null);
      setSensitiveContentApproved(false);
      setStage("claim");
    });
  };

  const commitPrediction = () => {
    if (session === null || prediction === null) return;
    const labels: Record<PredictionChoice, string> =
      belief?.concept === "class_imbalance"
        ? {
            "stays-high": "Accuracy still supports useful rare-case detection",
            falls: "Minority metrics expose a serious evaluation problem",
            unsure: "I am unsure",
          }
        : {
            "stays-high": "Accuracy remains near 98%",
            falls: "Accuracy falls materially",
            unsure: "I am unsure",
          };
    void withRequest(async (request) => {
      const committed = await counterLabApi.commitPrediction(
        session.sessionId,
        {
          choice: labels[prediction],
          confidence,
        },
      );
      request.assertCurrent();
      setSession(committed);
      void recordLearnerInteraction(session.sessionId, {
        kind: "prediction.recorded",
        stage: "prediction",
        choice:
          prediction === "stays-high"
            ? "current_explanation"
            : prediction === "falls"
              ? "alternative_explanation"
              : "unsure",
        confidence,
      });
      if (mode === "live") {
        await advanceLiveLab(committed, request);
        return;
      }
      const compiled = await counterLabApi.compileLab(session.sessionId);
      request.assertCurrent();
      setSession(compiled);
      setStage("build");
    });
  };

  const openResult = () => {
    if (session === null) {
      if (legacyReplayResult === undefined) {
        setError(
          "This replay did not release a verified result. No sample result was substituted.",
        );
        return;
      }
      window.localStorage.setItem(storageKeys.replayStage, "reality");
      setStage("reality");
      return;
    }
    if (session.verifiedResult !== undefined) {
      setStage("reality");
      return;
    }
    void withRequest(async (request) => {
      const completed = await counterLabApi.runLab(session.sessionId);
      request.assertCurrent();
      if (completed.verifiedResult === undefined) {
        throw new ApiClientError({
          code: "RESULT_NOT_AUTHORIZED",
          message:
            "The fixed kernel did not release a verified result for this session.",
          status: 409,
        });
      }
      setSession(completed);
      setStage("reality");
    });
  };

  const continueReplay = () => {
    window.localStorage.setItem(storageKeys.replayIntro, "false");
    setReplayIntro(false);
    setStage("reality");
  };

  const retryRouteRecovery = () => {
    setRouteRecovery(null);
    setRouteHydrated(false);
    setBusy(false);
    setLocationRevision((current) => current + 1);
  };

  const recentWorkSessions = listRecentWork(window.localStorage).map(
    (recent): RouteRecoveryRecentSession => ({
      id: `${recent.mode}:${recent.id}`,
      title:
        recent.mode === "instant"
          ? "Verified sample session"
          : recent.mode === "replay"
            ? "Verified replay"
            : "Live notebook session",
      mode: recent.mode,
      status: recent.status,
      onOpen: () => {
        window.history.pushState({}, "", recentWorkPath(recent));
        setRouteRecovery(null);
        setRouteHydrated(false);
        setLocationRevision((current) => current + 1);
      },
    }),
  );
  const routeRecoveryRecentSessions =
    routeRecovery === null ? [] : recentWorkSessions;
  const restartDialog =
    restartRequest === null ? null : (
      <StartOverDialog
        jobs={restartRequest.jobs}
        busy={restartBusy}
        onKeepWorking={dismissRestart}
        onConfirm={() => void confirmRestart()}
      />
    );

  if (routeRecovery !== null) {
    return (
      <div className="app-frame stage-landing">
        <SkipLink />
        {restartDialog}
        <RouteRecovery
          ref={routeRecoveryHeadingRef}
          reason={routeRecovery.reason}
          attemptedPath={routeRecovery.attemptedPath}
          onRetry={retryRouteRecovery}
          onHome={restart}
          recentSessions={routeRecoveryRecentSessions}
        />
      </div>
    );
  }

  if (judgeMode) {
    return (
      <Suspense
        fallback={<DeferredSurfaceFallback label="Loading Judge Mode…" />}
      >
        <LazyJudgeModeView
          health={liveHealth}
          healthPending={checkingLiveHealth}
          healthError={liveHealthError}
          onRetryHealth={() => void checkLiveCapabilities(true)}
          onStartSample={() => chooseMode("instant")}
        />
      </Suspense>
    );
  }

  if (hostedReplay !== null) {
    return (
      <div className="app-frame stage-reality hosted-replay-frame">
        <SkipLink />
        <Suspense
          fallback={
            <DeferredSurfaceFallback label="Loading verified replay…" />
          }
        >
          <LazyProofCapsuleReplayView
            replay={hostedReplay}
            onStartOver={restart}
          />
        </Suspense>
        <footer className="footer shell">
          <span>
            <strong>CounterLab</strong> · verified replay
          </span>
          <span>Chatbots explain. CounterLab lets reality answer.</span>
          <span>Read-only Capsule playback</span>
        </footer>
      </div>
    );
  }

  if (legacyReplay !== null && !replayIntro) {
    return (
      <div className="app-frame stage-reality hosted-replay-frame">
        <SkipLink />
        <LegacyReplayResult
          replay={legacyReplay}
          onStartSample={() => {
            restart();
            chooseMode("instant");
          }}
          onStartOver={restart}
        />
        <footer className="footer shell">
          <span>
            <strong>CounterLab</strong> · verified replay
          </span>
          <span>Chatbots explain. CounterLab lets reality answer.</span>
          <span>Read-only legacy evidence</span>
        </footer>
      </div>
    );
  }

  return (
    <div className={`app-frame stage-${stage}`}>
      <SkipLink />
      {restartDialog}
      {replay && activeReplay !== null && (
        <ReplayBanner replay={activeReplay} />
      )}
      {stage !== "landing" && stage !== "question-path" && (
        <Header
          mode={mode}
          stage={stage}
          session={session}
          review={review}
          restart={restart}
        />
      )}
      {error !== null && (
        <div className="api-error" role="alert">
          {error}
        </div>
      )}
      {busy && (
        <div className="api-progress" role="status">
          Recording evidence…
        </div>
      )}
      {stage === "landing" && (
        <Landing
          claim={claim}
          updateClaim={updateClaim}
          attachNotebook={(file) => {
            setMode("live");
            window.localStorage.setItem(storageKeys.mode, "live");
            uploadNotebook(file);
          }}
          testClaim={() => {
            window.localStorage.setItem(storageKeys.claim, claim);
            setJudgeMode(false);
            setMode("live");
            setReviewStep(null);
            setError(null);
            setAnalysisPreview(null);
            setSensitiveContentApproved(false);
            window.localStorage.setItem(storageKeys.mode, "live");
            setStage("question-path");
          }}
          chooseMode={chooseMode}
          busy={busy}
          recentSessions={recentWorkSessions}
        />
      )}
      {stage === "question-path" && mode === "live" && (
        <ClaimPathChooser
          claim={claim}
          busy={busy}
          onStartSample={() => chooseMode("instant")}
          onAttachNotebook={(file) => {
            setMode("live");
            window.localStorage.setItem(storageKeys.mode, "live");
            uploadNotebook(file);
          }}
          onCheckLiveTools={() => chooseMode("live")}
          onBack={() => {
            window.history.replaceState({}, "", "/");
            window.localStorage.removeItem(storageKeys.mode);
            setMode(null);
            setStage("landing");
            setError(null);
            setAnalysisPreview(null);
            setSensitiveContentApproved(false);
            setRouteHydrated(true);
          }}
        />
      )}
      {stage !== "landing" && stage !== "question-path" && mode !== null && (
        <Suspense
          fallback={
            <DeferredSurfaceFallback label="Loading the scientific instrument…" />
          }
        >
          <LazyCounterLabStudio
            context={{
              mode,
              stage: stage as StudioStage,
              artifact,
              session,
              events: mergedProofEvents.compilerEvents,
              evidenceEvents: mergedProofEvents.evidenceEvents,
              proofEventIssues: mergedProofEvents.issues,
              proofEventStatus,
            }}
            actions={{
              newAnalysis: () => {
                setClaim("");
                chooseMode("live");
              },
              showEvidence: () => review("question"),
              ...(stage === "belief" && confirmed && prediction !== null
                ? { lockPrediction: commitPrediction }
                : {}),
              ...(stage === "build" ? { runFairTest: openResult } : {}),
              ...(session?.patchResult === undefined
                ? {}
                : {
                    reviewPatch: () => setStage("reality"),
                    ...(busy ? {} : { downloadPatch: downloadCurrentPatch }),
                  }),
              ...(sessionProofReady(session) && !busy
                ? { exportProof: exportCurrentProof }
                : {}),
              ...(session !== null
                ? {
                    revokeSessionAccess: revokeCurrentSessionAccess,
                    revokeSessionAccessDisabled: busy,
                  }
                : {}),
              startOver: restart,
              openRecent: openRecentProject,
            }}
          >
            {reviewStep !== null && (
              <ReviewScreen
                step={reviewStep}
                claim={effectiveClaim}
                artifact={artifact}
                session={session}
                {...(verifiedResult === undefined
                  ? {}
                  : { result: verifiedResult })}
                returnToCurrent={returnToCurrent}
                restart={restart}
              />
            )}
            {reviewStep === null && session !== null && (
              <div className="shell learner-stage-hint">
                <NeedAHint
                  hintId={activeHint.id}
                  hint={activeHint.copy}
                  evidenceHref={activeHint.evidenceHref}
                  evidenceLabel={activeHint.evidenceLabel}
                  onOpen={(hintId) => {
                    void recordLearnerInteraction(session.sessionId, {
                      kind: "hint.opened",
                      stage: activeLearnerStage,
                      hintId,
                    });
                  }}
                />
              </div>
            )}
            {reviewStep === null && stage === "claim" && artifact !== null && (
              <ClaimScreen
                artifact={artifact}
                fixedSample={session?.mode.kind === "sample_lesson"}
                claim={claim}
                updateClaim={updateClaim}
                analysisPreview={analysisPreview}
                sensitiveContentApproved={sensitiveContentApproved}
                setSensitiveContentApproved={setSensitiveContentApproved}
                cancelPreview={() => {
                  setAnalysisPreview(null);
                  setSensitiveContentApproved(false);
                }}
                continueToBelief={proposeBeliefTest}
                uploadNotebook={uploadNotebook}
                requiresFreshSession={beliefResponseClosed(session)}
                startFreshSession={restartClosedBeliefResponse}
                busy={busy}
              />
            )}
            {reviewStep === null && stage === "claim" && artifact === null && (
              <main
                className="workspace shell narrow"
                id="main-content"
                tabIndex={-1}
                role="alert"
              >
                <div className="screen-intro">
                  <p className="eyebrow">Question · Evidence required</p>
                  <h1>Attach a supported notebook before continuing.</h1>
                  <p>
                    No artifact-specific investigation exists yet, and no result
                    can be created from a claim alone.
                  </p>
                </div>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() => chooseMode("live")}
                >
                  Return to notebook intake
                </button>
              </main>
            )}
            {reviewStep === null &&
              stage === "belief" &&
              beliefNarrativeWithheld && (
                <WithheldBeliefScreen
                  claim={effectiveClaim}
                  restart={restart}
                />
              )}
            {reviewStep === null &&
              stage === "belief" &&
              !beliefNarrativeWithheld && (
                <BeliefScreen
                  claim={effectiveClaim}
                  belief={belief}
                  fixedSampleFraming={mode === "instant"}
                  notebookScore={notebookScoreDisplay(artifact)}
                  confirmed={confirmed}
                  confirm={confirmBeliefTest}
                  prediction={prediction}
                  setPrediction={setPrediction}
                  confidence={confidence}
                  setConfidence={setConfidence}
                  commitPrediction={commitPrediction}
                  editClaim={() => setStage("claim")}
                  stop={stopBeliefTest}
                />
              )}
            {reviewStep === null &&
              stage === "build" &&
              mode !== null &&
              (replay && activeReplay === null ? (
                <main
                  className="workspace shell narrow"
                  id="main-content"
                  tabIndex={-1}
                  aria-live="polite"
                >
                  <div className="screen-intro">
                    <p className="eyebrow">Checking stored evidence</p>
                    <h1>Opening this replay…</h1>
                    <p>
                      CounterLab will label it verified only after the stored
                      payload passes its strict replay contract.
                    </p>
                  </div>
                </main>
              ) : replayIntro && activeReplay !== null ? (
                <main
                  className="workspace shell narrow"
                  id="main-content"
                  tabIndex={-1}
                >
                  <div className="screen-intro">
                    <p className="eyebrow">Stored evidence chain</p>
                    <h1>Replay verified session</h1>
                    <p>
                      This path reconstructs recorded events and computed
                      payloads. It is not a live model run.
                    </p>
                  </div>
                  <section className="setup-card panel">
                    <dl className="provenance-list">
                      <div>
                        <dt>Replay</dt>
                        <dd>{activeReplay.replayId}</dd>
                      </div>
                      {!("projectionKind" in activeReplay) ? (
                        <>
                          <div>
                            <dt>Model</dt>
                            <dd>{activeReplay.modelId}</dd>
                          </div>
                          <div>
                            <dt>Verifier</dt>
                            <dd>{activeReplay.verifierVersion}</dd>
                          </div>
                          <div>
                            <dt>Commit</dt>
                            <dd>{activeReplay.templateCommit}</dd>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <dt>Subject Pack</dt>
                            <dd>{activeReplay.concept.replaceAll("_", " ")}</dd>
                          </div>
                          <div>
                            <dt>Privacy</dt>
                            <dd>{activeReplay.privacy.profile}</dd>
                          </div>
                          <div>
                            <dt>Root hash</dt>
                            <dd>
                              {activeReplay.authority.sourceCapsuleRootHash}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </section>
                  <button
                    className="button button-primary"
                    type="button"
                    onClick={continueReplay}
                  >
                    Continue replay <Mark name="arrow" />
                  </button>
                </main>
              ) : (
                <BuildScreen
                  mode={mode}
                  resultReady={verifiedResult !== undefined}
                  notebookScore={notebookScoreDisplay(artifact)}
                  concept={belief?.concept}
                  predictionChoice={prediction}
                  sealedCategoricalChoice={
                    session?.prediction?.choice ?? prediction
                  }
                  confidence={session?.prediction?.confidence ?? confidence}
                  openResult={openResult}
                />
              ))}
            {reviewStep === null &&
              stage === "reality" &&
              verifiedResult !== undefined &&
              prediction !== null && (
                <RealityScreen
                  claim={effectiveClaim}
                  prediction={prediction}
                  result={verifiedResult}
                  session={session}
                  artifact={artifact}
                  updateSession={setSession}
                  recordCompilerEvents={recordTransientCompilerEvents}
                />
              )}
            {reviewStep === null &&
              stage === "reality" &&
              (verifiedResult === undefined || prediction === null) && (
                <main
                  className="workspace shell narrow"
                  id="main-content"
                  tabIndex={-1}
                  role="alert"
                >
                  <div className="screen-intro compact">
                    <p className="eyebrow">Result withheld</p>
                    <h1>No verified result was released.</h1>
                    <p>
                      {verifiedResult === undefined
                        ? "CounterLab will not substitute bundled sample evidence for this session. Return to the test and try again."
                        : "The immutable Prediction receipt could not be mapped to this learner view. CounterLab withheld the result instead of inventing a Prediction."}
                    </p>
                  </div>
                </main>
              )}
            {reviewStep === null && stage === "live-setup" && (
              <LiveSetup
                health={liveHealth}
                checking={checkingLiveHealth}
                checkError={liveHealthError}
                uploadNotebook={uploadNotebook}
                pendingArtifact={session === null ? artifact : null}
                retrySessionSetup={retryLiveSessionSetup}
                retry={() => void checkLiveCapabilities(true)}
                fallBack={chooseMode}
                busy={busy}
              />
            )}
            {reviewStep === null && stage === "live-compile" && (
              <LiveCompileScreen
                concept={belief?.concept}
                events={runner.events}
                job={runnerJob}
                failed={error !== null}
                canCancel={
                  session?.mode.kind === "live_notebook" &&
                  (runnerJob !== null || session.state === "LAB_COMPILING")
                }
                retrying={busy}
                cancelling={cancellingRunner}
                onRetry={retryLiveLab}
                onCancel={cancelLiveLab}
              />
            )}
          </LazyCounterLabStudio>
        </Suspense>
      )}
      {stage !== "landing" && stage !== "question-path" && (
        <footer className="footer shell">
          <span>
            <strong>CounterLab</strong> · learn from a fair test
          </span>
          <span>Chatbots explain. CounterLab lets reality answer.</span>
          <span>Education demo · Jupyter notebooks</span>
        </footer>
      )}
    </div>
  );
}
