import { useEffect, useLayoutEffect, useRef, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  getSessionBeliefAuthority,
  type ArtifactView,
  type BeliefAnalysisPreview,
  type BeliefTest,
  type CapabilityHealth,
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
import { CounterLabStudio } from "./app/CounterLabStudio";
import { parseStudioLocation, studioPath } from "./app/AppRouter";
import { LearnerCompletion } from "./components/learner/LearnerCompletion";
import { LearnerCoach } from "./components/learner/LearnerCoach";
import { NeedAHint } from "./components/learner/NeedAHint";
import { LearnerProgress } from "./components/learner/LearnerProgress";
import { ReflectionBuilder } from "./components/learner/ReflectionBuilder";
import { RepairPreview } from "./components/learner/RepairPreview";
import {
  TimelineTransfer,
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
import {
  currentLearnerStage,
  type LearnerStageId,
} from "./components/learner/learnerStages";
import { InteractiveImbalanceLab } from "./components/lesson/InteractiveImbalanceLab";
import { ImbalancePatchReview } from "./components/lesson/ImbalancePatchReview";
import { ImbalanceTransferLesson } from "./components/lesson/ImbalanceTransferLesson";
import { DeferredReasoningDiffView } from "./components/proof/DeferredReasoningDiffView";
import { ProofCapsuleReplayView } from "./components/replay/ProofCapsuleReplayView";
import type { RecentProject, StudioStage } from "./components/studio/types";
import { BoundaryStage } from "./features/boundary/BoundaryStage";
import { JudgeModeView } from "./features/judge/JudgeModeView";
import { recordLearnerInteraction } from "./features/learner/interactionEvidence";
import { subjectPackHint } from "./features/learner/subjectPackHints";
import { useLearnerStageTiming } from "./hooks/useLearnerStageTiming";

import { getRun, sampleArtifact, verifiedReplay } from "./sample";

type Mode = "instant" | "live" | "replay";
type Stage =
  | "landing"
  | "claim"
  | "belief"
  | "build"
  | "reality"
  | "live-setup"
  | "live-compile";
type PredictionChoice = "stays-high" | "falls" | "unsure";
type LeakageTransferSplit = "" | "random" | "time";
type LeakageTransferRisk = "" | "price" | "future";
type TransferState =
  "locked" | "ready" | "failed" | "passed" | "patching" | "patched";
type ReviewStep = LearnerStageId;

const defaultLeakageReflection =
  "When rows repeat the same entity,\nI should hold out whole entities,\nbecause random rows can share identity across train and test.";

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
    value: "random",
    label: "Random daily rows",
    description: "Mix observations from all dates.",
    visual: "mixed",
  },
  {
    value: "time",
    label: "Time-ordered holdout",
    description: "Train on earlier dates and test on later dates.",
    visual: "ordered",
  },
] as const satisfies readonly TimelineSplitOption<LeakageTransferSplit>[];

const leakageTimelineFeatures = [
  {
    value: "price",
    label: "Known item price",
    description: "Known when the prediction is made.",
    crossesNow: false,
  },
  {
    value: "future",
    label: "Centered rolling target",
    description: "Reads outcomes from later days.",
    crossesNow: true,
  },
] as const satisfies readonly TimelineFeatureOption<LeakageTransferRisk>[];

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

function sessionBeliefPresentation(
  session: Pick<SessionView, "beliefTest" | "beliefSpec"> | null,
): BeliefPresentation | undefined {
  if (session === null) return undefined;
  const authority = getSessionBeliefAuthority(session);
  if (authority === undefined) return undefined;
  if (authority.schemaVersion === "1") {
    const { beliefTest } = authority;
    return {
      schemaVersion: "1",
      concept: beliefTest.concept,
      claim: beliefTest.learnerClaim,
      current: {
        ...beliefTest.currentHypothesis,
        conditions: [],
        nonClaims: beliefTest.uncertainty.limitations,
      },
      competing: {
        ...beliefTest.competingHypothesis,
        conditions: [],
        nonClaims: beliefTest.uncertainty.limitations,
      },
      evidenceRefs: beliefTest.evidenceRefs,
      alternatives: beliefTest.alternatives,
      limitations: beliefTest.uncertainty.limitations,
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
  replayStage: "counterlab.replayStage",
  replayId: "counterlab.replayId",
  replayIntro: "counterlab.replayIntro",
  replayTransferState: "counterlab.replayTransferState",
  replayRevision: "counterlab.replayRevision",
  activeRunnerJobId: "counterlab.activeRunnerJobId",
  activeRunnerJobKind: "counterlab.activeRunnerJobKind",
} as const;

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
    return {
      label: "Score shown in the notebook",
      value: percent.format(getRun("random_row_split").metrics.accuracy),
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
    return [
      {
        id: "sample-cell-3-output-0",
        reference: "Cell 3 · output 0",
        relevance: "This is the notebook score behind your question.",
        excerpt: `accuracy: ${getRun("random_row_split").metrics.accuracy}`,
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

function ReplayBanner({ replay }: { replay: VerifiedReplay }) {
  return (
    <aside className="replay-banner" aria-label="Replay status">
      <span className="status-dot" />
      <strong>Verified replay</strong>
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
            ? "Replay mode"
            : mode === "live"
              ? "Live generation"
              : "Instant sample"}
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
}: {
  claim: string;
  updateClaim: (claim: string) => void;
  attachNotebook: (file: File) => void;
  testClaim: () => void;
  chooseMode: (mode: Mode) => void;
  busy: boolean;
}) {
  const hint = subjectPackHint(undefined, "question");
  const [railOpen, setRailOpen] = useState(false);
  const railToggleRef = useRef<HTMLButtonElement>(null);

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
    <main className="landing landing-question-first">
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
            Explore
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
            onClick={() => {
              setRailOpen(false);
              updateClaim("");
            }}
          >
            <span aria-hidden="true">+</span>
            New question
          </button>

          <div className="landing-rail-group">
            <span>Start with evidence</span>
            <button type="button" disabled={busy} onClick={startSample}>
              Try verified sample
            </button>
            <button type="button" disabled={busy} onClick={openReplay}>
              Watch verified replay
            </button>
          </div>

          <div className="landing-rail-group landing-rail-secondary">
            <a href="/judge">Judge Mode</a>
            <a
              href="#landing-support-note"
              onClick={() => {
                setRailOpen(false);
                document.getElementById("landing-support-note")?.focus();
              }}
            >
              How proof works
            </a>
          </div>
        </nav>

        <p className="landing-rail-trust">No account needed</p>
      </aside>

      <section className="landing-canvas" aria-labelledby="landing-title">
        <div className="question-first-layout">
          <div className="landing-intro">
            <p>Ask like chat. Prove it like science.</p>
            <h1 id="landing-title" tabIndex={-1}>
              What result are you trying to understand?
            </h1>
            <span>
              State the claim. If you have a notebook, attach it—we read the
              evidence and never run the cells.
            </span>
          </div>

          <QuestionComposer
            value={claim}
            onChange={updateClaim}
            onAttachNotebook={attachNotebook}
            onSubmit={testClaim}
            onStartSample={startSample}
            onOpenReplay={openReplay}
            busy={busy}
          />

          <div
            className="landing-proof-note"
            id="landing-support-note"
            tabIndex={-1}
          >
            <p>
              <strong>How proof works:</strong> fixed kernels calculate the
              result, then frozen checks verify the evidence binding before it
              appears.
            </p>
            <p id="landing-supported-evidence">
              <strong>Supported today:</strong> documented Python/scikit-learn
              Jupyter notebooks for entity leakage and class imbalance.
              Unsupported evidence is refused, not guessed.
            </p>
            <NeedAHint
              hintId={hint.id}
              hint={hint.copy}
              evidenceHref="#landing-supported-evidence"
              evidenceLabel="Review the supported evidence boundary"
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function ClaimScreen({
  artifact,
  claim,
  updateClaim,
  analysisPreview,
  sensitiveContentApproved,
  setSensitiveContentApproved,
  cancelPreview,
  continueToBelief,
  uploadNotebook,
  busy,
}: {
  artifact: ArtifactView | null;
  claim: string;
  updateClaim: (claim: string) => void;
  analysisPreview: BeliefAnalysisPreview | null;
  sensitiveContentApproved: boolean;
  setSensitiveContentApproved: (approved: boolean) => void;
  cancelPreview: () => void;
  continueToBelief: () => void;
  uploadNotebook: (file: File) => void;
  busy: boolean;
}) {
  const isSample = artifact?.fileSha256 === sampleArtifact.fileSha256;
  const supported = artifact?.support.status === "SUPPORTED";
  const evidenceReferences = notebookEvidenceReferences(artifact);
  const headlineMetric = notebookScoreDisplay(artifact);
  return (
    <main className="workspace shell">
      <div className="screen-intro">
        <p className="eyebrow">Question · Your idea</p>
        <h1>What do you think the score means?</h1>
        <p>Write one sentence about who you think this model will work for.</p>
      </div>

      <LearnerCoach
        next="say what you believe the score tells us."
        why="A high score is a result, but the notebook evidence does not yet show whether it generalizes to completely new customers."
      />

      <div className="claim-layout">
        <section className="notebook-card" aria-labelledby="artifact-title">
          <div className="notebook-topline">
            <span className="file-chip">.ipynb</span>
            <span
              className={supported ? "verified-chip" : "support-chip rejected"}
            >
              {supported && <Mark name="check" />}{" "}
              {artifact?.support.status ?? "Loading"}
            </span>
          </div>
          <h2 id="artifact-title">
            {isSample ? sampleArtifact.title : "Uploaded notebook evidence"}
          </h2>
          <p className="file-name">
            {artifact?.fileName ?? "Preparing artifact…"}
          </p>
          <NotebookEvidenceStory
            title="What this notebook actually shows"
            headlineMetric={headlineMetric}
            references={evidenceReferences}
            integrity={[
              {
                label: "Notebook SHA-256",
                value: artifact?.fileSha256 ?? "Pending intake",
              },
              {
                label: "Evidence cells",
                value: String(artifact?.cells.length ?? 0),
              },
              {
                label: "Support decision",
                value: artifact?.support.status ?? "Pending",
              },
            ]}
          />
          {artifact !== null && artifact.support.reasons.length > 0 && (
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
          {artifact !== null && artifact.support.status !== "SUPPORTED" && (
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
            <p className="eyebrow">In your words</p>
            <h2 id="claim-prompt">Finish this thought</h2>
            <p>“Because the notebook scored highly, I think the model…”</p>
          </div>
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
          {analysisPreview === null ? (
            <div className="form-footer">
              <span>{claim.trim().length} characters</span>
              <button
                className="button button-primary"
                type="button"
                disabled={claim.trim().length < 12 || !supported || busy}
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
                    I reviewed the redacted sensitive-looking excerpt and want
                    to continue.
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
  const isImbalance = belief?.concept === "class_imbalance";
  const copy = isImbalance
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
          "Compare the majority baseline, confusion matrix, and rare-class metrics.",
        intervention:
          "We keep the data and scoring model fixed. We expose class-specific errors, then test a bounded threshold change.",
        help: "If accuracy reflects useful rare-event detection, recall should stay strong and beat the majority baseline. If rarity hides failure, class-specific evidence will reveal the gap.",
      }
    : {
        currentHypothesis:
          "The model learned a useful pattern that will work for new customers.",
        currentPrediction: "The score stays close to 98% for new customers.",
        competingHypothesis:
          "The model partly remembers customers it already saw.",
        competingPrediction:
          "The score drops for new customers and without customer ID.",
        fairTest:
          "Keep each customer's rows together, then remove customer ID.",
        intervention:
          "We keep the model the same. We change who appears in the test, then check what happens without customer ID.",
        help: "If the model learned a reusable pattern, the score should stay high. If it remembers customers, the score should fall. The two ideas now predict different outcomes.",
      };
  const currentModel: DuelModel = {
    statement: belief?.current.statement ?? copy.currentHypothesis,
    prediction: belief?.current.predictedOutcome ?? copy.currentPrediction,
    conditions: belief?.current.conditions ?? [],
    nonClaims: belief?.current.nonClaims ?? [
      "This explanation does not establish performance outside the supplied notebook evidence.",
    ],
  };
  const alternativeModel: DuelModel = {
    statement: belief?.competing.statement ?? copy.competingHypothesis,
    prediction: belief?.competing.predictedOutcome ?? copy.competingPrediction,
    conditions: belief?.competing.conditions ?? [],
    nonClaims: belief?.competing.nonClaims ?? [
      "This explanation does not claim every model feature is leakage.",
    ],
  };
  const predictionOptions = predictionOptionsFor(belief?.concept);

  return (
    <main className="workspace shell">
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

      <section className="claim-quote" aria-label="Learner claim">
        <span>Your claim</span>
        <blockquote>{claim}</blockquote>
      </section>

      <ModelDuel
        current={currentModel}
        alternative={alternativeModel}
        confirmed={confirmed}
        onConfirm={confirm}
        onEdit={editClaim}
        onInsufficientEvidence={() => stop("insufficient")}
        onReject={() => stop("rejected")}
      />

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
              <strong>{evidence.relevance}</strong>
              <small>{evidence.excerpt}</small>
            </span>
          ))
        )}
      </section>

      <section className="intervention panel">
        <div>
          <p className="eyebrow">The fairer test</p>
          <h2>{copy.fairTest}</h2>
          <p>{copy.intervention}</p>
        </div>
        <details>
          <summary>Alternatives, limitations, and uncertainty</summary>
          <p>
            {belief === undefined
              ? "Class imbalance and temporal drift remain alternatives. The available notebook evidence is sufficient to test entity leakage, but this experiment does not establish production performance or causality."
              : `${belief.alternatives
                  .map(
                    (alternative) =>
                      `${alternative.label}: ${alternative.rationale}`,
                  )
                  .join(" ")} ${belief.limitations.join(" ")}`}
          </p>
        </details>
      </section>

      <details className="concept-help panel">
        <summary>Why can this test teach us something?</summary>
        <p>{copy.help}</p>
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
    <main className="workspace shell">
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
    <main className="workspace shell lesson-review">
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
            <p className="eyebrow aqua">Verified Lab</p>
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
    <main className="workspace shell lesson-review">
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
          <p className="eyebrow aqua">Verified Lab</p>
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
}: {
  session: SessionView | null;
  artifact: ArtifactView | null;
  authoritativeResult: LeakageVerifiedResultSet;
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

function LeakageRealityScreen({
  claim,
  prediction,
  result,
  session,
  artifact,
  updateSession,
}: {
  claim: string;
  prediction: PredictionChoice;
  result: LeakageVerifiedResultSet;
  session: SessionView | null;
  artifact: ArtifactView | null;
  updateSession: (session: SessionView) => void;
}) {
  const random = resultRun(result, "random_row_split");
  const group = resultRun(result, "customer_group_split");
  const [revision, setRevision] = useState(
    session?.revision ??
      window.localStorage.getItem(storageKeys.replayRevision) ??
      defaultLeakageReflection,
  );
  const [revisionMode, setRevisionMode] = useState<"clauses" | "free_text">(
    "clauses",
  );
  const initialTransferState: TransferState = session?.patchResult
    ? "patched"
    : session?.transferResult?.outcome === "PASSED"
      ? "passed"
      : session?.revision
        ? "ready"
        : session === null
          ? storedReplayTransferState()
          : "locked";
  const [transferState, setTransferState] =
    useState<TransferState>(initialTransferState);
  const [splitChoice, setSplitChoice] = useState<LeakageTransferSplit>("");
  const [riskChoice, setRiskChoice] = useState<LeakageTransferRisk>("");
  const [patch, setPatch] = useState<PatchResult | null>(
    session?.patchResult ?? null,
  );
  const [proofBundle, setProofBundle] = useState<ProofBundle | null>(
    session?.proofBundle ?? null,
  );
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [patchJob, setPatchJob] = useState<RunnerJob | null>(null);
  const patchRunner = useRunnerEvents();
  const accuracyGapPoints =
    (random.metrics.accuracy - group.metrics.accuracy) * 100;

  useLayoutEffect(() => {
    resetViewport("lesson-phase-title");
  }, [transferState]);

  useEffect(() => {
    if (session !== null) return;
    window.localStorage.setItem(storageKeys.replayTransferState, transferState);
    window.localStorage.setItem(storageKeys.replayRevision, revision);
  }, [revision, session, transferState]);

  const runAction = async (operation: () => Promise<void>) => {
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
      setActionBusy(false);
    }
  };

  const completePatchJob = async (jobId: string) => {
    if (session === null) return;
    const completed = await patchRunner.waitForJob({
      sessionId: session.sessionId,
      jobId,
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
    if (session === null) {
      setTransferState(
        splitChoice === "time" && riskChoice === "future" ? "passed" : "failed",
      );
      return;
    }
    void runAction(async () => {
      const updated = await counterLabApi.submitTransfer(session.sessionId, {
        strategyChoice:
          splitChoice === "time" ? "time_ordered_holdout" : "random_rows",
        riskChoice:
          riskChoice === "future"
            ? "centered_window_reads_future"
            : "known_price_is_safe",
        evidenceChoices:
          splitChoice === "time" && riskChoice === "future"
            ? ["center_true_uses_later_targets", "random_split_mixes_dates"]
            : ["chosen_evidence_does_not_establish_time_boundary"],
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
      if (updated.patch !== undefined) {
        try {
          setProofBundle(await counterLabApi.getProofBundle(session.sessionId));
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
    const anchor = document.createElement("a");
    anchor.href = counterLabApi.patchDownloadUrl(session.sessionId);
    anchor.download = "";
    anchor.click();
    void recordLearnerInteraction(session.sessionId, {
      kind: "patch.downloaded",
      stage: "repair",
    });
  };

  const exportCompletionProof = () => {
    if (session?.proofCapsule !== undefined) {
      const anchor = document.createElement("a");
      anchor.href = counterLabApi.proofCapsuleDownloadUrl(session.sessionId);
      anchor.download = "";
      anchor.click();
      void recordLearnerInteraction(session.sessionId, {
        kind: "proof_capsule.downloaded",
        stage: "repair",
      });
      return;
    }
    exportProof();
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
      <main className="workspace shell reality lesson-phase live-compiler">
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
                    <strong>Preparing isolated patch job</strong>
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
              <h2 id="patch-retry-title">Retry the isolated patch turn.</h2>
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
      patch !== null
        ? {
            sessionId: session.sessionId,
            diff: session.reasoningDiffV2,
            capsule: session.proofCapsule,
            patch,
          }
        : null;
    return (
      <main className="workspace shell reality lesson-phase completion-phase">
        <LearnerCompletion
          titleId="lesson-phase-title"
          headingLevel="h1"
          capability={{
            intro: "You can now distinguish:",
            first: "good on familiar rows",
            connector: "from",
            second: "generalizes to new entities",
          }}
          beforeReasoning={claim}
          afterReasoning={revision}
          transferStatus={{
            label: "Passed",
            detail:
              "You carried the deployment-boundary rule from customers to time-ordered forecasting.",
          }}
          repairedNotebookAction={{
            label: "Download repaired notebook",
            onActivate: downloadCompletionPatch,
            disabled: session === null || patch === null,
          }}
          proofCapsuleAction={{
            label:
              session?.proofCapsule === undefined
                ? "Download proof record"
                : "Export Proof Capsule",
            onActivate: exportCompletionProof,
            disabled:
              session?.proofCapsule === undefined && proofBundle === null,
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
                  <a
                    className="button button-gold patch-download"
                    href={counterLabApi.patchDownloadUrl(session.sessionId)}
                    download
                    onClick={() => {
                      void recordLearnerInteraction(session.sessionId, {
                        kind: "patch.downloaded",
                        stage: "repair",
                      });
                    }}
                  >
                    Download verified notebook copy <Mark name="arrow" />
                  </a>
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
      <main className="workspace shell reality lesson-phase transfer-passed-phase">
        <div className="screen-intro compact">
          <p className="eyebrow aqua">Transfer passed · Patch unlocked</p>
          <h1 id="lesson-phase-title" tabIndex={-1}>
            You applied the rule correctly.
          </h1>
          <p>
            You recognized the same evaluation mistake in forecasting, where
            future information had leaked into the test.
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
      <main className="workspace shell reality lesson-phase transfer-phase">
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
            scenario="A demand forecast learns from nearby days. Choose the split and feature that match what is available when a real prediction is made."
            trainingRange="Jan — Mar"
            testRange="Apr — Jun"
            splitValue={splitChoice}
            splitOptions={leakageTimelineSplits}
            onSplitChange={setSplitChoice}
            featureValue={riskChoice}
            featureOptions={leakageTimelineFeatures}
            onFeatureChange={setRiskChoice}
            disabled={actionBusy}
          />
          <button
            className="button button-primary"
            type="button"
            disabled={!splitChoice || !riskChoice || actionBusy}
            onClick={checkTransfer}
          >
            Check transfer
          </button>
          {transferState === "failed" && (
            <div className="transfer-result rejected" role="status">
              <strong>Transfer not yet passed.</strong>
              <span>
                Use the NOW line: pick a test where training happens before
                testing, then remove any feature that reads values to the right
                of NOW. The patch remains locked.
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
    session?.mode.kind !== "live_notebook" ||
    session.boundaryMapAuthority !== undefined;
  const theaterPayload: ExperimentTheaterVerifiedPayload = {
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
    finding: `${percent.format(random.metrics.accuracy)} became ${percent.format(group.metrics.accuracy)} when the test contained only new customers.`,
    controlledVariables: "model, target, metric, preprocessing, and seed",
    views: {
      observe: {
        heading: "Inspect the verified runs",
        available: true,
        completed: true,
        content: (
          <details id="leakage-verified-evidence" className="exact-results">
            <summary>Show exact values and run details</summary>
            <ResultTable result={result} />
            <code>result {result.resultHash.slice(0, 12)}…</code>
          </details>
        ),
      },
      explore: {
        heading: "Explore bounded test choices",
        available: true,
        completed: false,
        content: (
          <InteractiveLeakageLab
            session={session}
            artifact={artifact}
            authoritativeResult={result}
          />
        ),
      },
      boundary: {
        heading: "Find where the conclusion changes",
        available: true,
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
              whenOptions={leakageReflectionWhen}
              actionOptions={leakageReflectionActions}
              becauseOptions={leakageReflectionReasons}
              initialSelection={{
                whenId: "repeated-entity",
                actionId: "whole-entities",
                becauseId: "identity-overlap",
              }}
              editorLabel="Your revised mental model"
              disabled={actionBusy}
              onAuthoringModeChange={setRevisionMode}
            />
            <button
              className="button button-primary"
              type="button"
              disabled={revision.trim().length < 20 || actionBusy}
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
    <main className="workspace shell reality">
      <div className="screen-intro compact">
        <p className="eyebrow aqua">Boundary · Verified result</p>
        <h1 id="lesson-phase-title" tabIndex={-1}>
          Here’s what changed.
        </h1>
        <p>
          The model looked excellent on familiar customers. It struggled on
          customers it had never seen.
        </p>
      </div>
      <LearnerCoach
        next="observe the result, explore it, then find and apply its boundary."
        why={`The verified test found a ${accuracyGapPoints.toFixed(1)}-point gap for new customers. The four views change presentation only; fixed evidence remains the authority.`}
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
    finding: `${percent.format(majority.metrics.accuracy)} headline accuracy coincided with only ${majority.confusionMatrix.tp} rare positives caught by the majority baseline.`,
    controlledVariables:
      "fixed fixture, stratified holdout, model scores, and seed",
    views: {
      observe: {
        heading: "Inspect the verified rare-event runs",
        available: true,
        completed: true,
        content: (
          <>
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
          </>
        ),
      },
      explore: {
        heading: "Explore threshold and prevalence choices",
        available: true,
        completed: false,
        content: (
          <InteractiveImbalanceLab
            isLive={session?.mode.kind === "live_notebook"}
            sessionId={session?.sessionId ?? null}
            authoritativeResultHash={result.resultHash}
          />
        ),
      },
      boundary: {
        heading: "Find where the metric conclusion changes",
        available: true,
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
              <ImbalanceTransferLesson
                sessionId={session.sessionId}
                state={session.state}
                {...(session.revision === undefined
                  ? {}
                  : { revision: session.revision })}
                {...(session.transferResult === undefined
                  ? {}
                  : { transferOutcome: session.transferResult.outcome })}
                updateSession={updateSession}
              />
              {session.transferResult?.outcome === "PASSED" && (
                <ImbalancePatchReview
                  session={session}
                  updateSession={updateSession}
                />
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
    <main className="workspace shell reality imbalance-reality">
      <div className="screen-intro compact">
        <p className="eyebrow aqua">Boundary · Verified result</p>
        <h1>A high accuracy can still miss every rare event.</h1>
        <p>
          CounterLab compared the notebook claim with a computed majority
          baseline, class-specific metrics, and two bounded operating scenarios.
        </p>
      </div>
      <LearnerCoach
        next="observe the result, explore it, then find and apply its boundary."
        why={`The majority baseline is ${percent.format(majority.metrics.accuracy)} accurate with ${percent.format(majority.metrics.recall)} rare-class recall. The four views change presentation only; fixed evidence remains the authority.`}
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
  startLive,
  retry,
  fallBack,
  busy,
}: {
  health: CapabilityHealth | null;
  checking: boolean;
  checkError: string | null;
  startLive: () => void;
  retry: () => void;
  fallBack: (mode: Mode) => void;
  busy: boolean;
}) {
  const configured = health?.liveGpt === "configured";
  const runnerConfigured =
    health?.liveCodex === "configured" &&
    health.liveKernel === "configured" &&
    health.sandbox === "configured";
  return (
    <main className="workspace shell narrow">
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
                    ? "Hosted notebook runner is ready"
                    : "A local runner is needed for the final lab"}
                </strong>
                <p>
                  {runnerConfigured
                    ? "Plans, verification, and fixed-kernel results can complete in this hosted session."
                    : "You can review the notebook and make a prediction here. The checked experiment runs only on a separately protected device."}
                </p>
              </div>
            </div>
          </>
        )}
      </section>
      <div className="action-cluster">
        {configured && !checking && checkError === null && (
          <button
            className="button button-primary"
            type="button"
            disabled={busy}
            onClick={startLive}
          >
            Continue with my notebook <Mark name="arrow" />
          </button>
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
    <main className="workspace shell live-compiler">
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
              CounterLab will create a new isolated job. The failed job stays in
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
  const [artifact, setArtifact] = useState<ArtifactView | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveHealth, setLiveHealth] = useState<CapabilityHealth | null>(null);
  const [liveHealthError, setLiveHealthError] = useState<string | null>(null);
  const [checkingLiveHealth, setCheckingLiveHealth] = useState(false);
  const [cancellingRunner, setCancellingRunner] = useState(false);
  const [analysisPreview, setAnalysisPreview] =
    useState<BeliefAnalysisPreview | null>(null);
  const [sensitiveContentApproved, setSensitiveContentApproved] =
    useState(false);
  const [runnerJob, setRunnerJob] = useState<RunnerJob | null>(null);
  const runner = useRunnerEvents();
  const replay = mode === "replay";
  const hostedReplay =
    activeReplay?.schemaVersion === "2" ? activeReplay : null;
  const legacyReplayResult =
    activeReplay?.schemaVersion === "1" ? activeReplay.result : undefined;
  const verifiedResult = session?.verifiedResult ?? legacyReplayResult;
  const belief = sessionBeliefPresentation(session);
  const effectiveClaim =
    claim ||
    hostedReplay?.beliefSpec.claim ||
    belief?.claim ||
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
    setError(
      caught instanceof ApiClientError
        ? caught.message
        : "CounterLab could not complete this step.",
    );
  };

  const withRequest = async (operation: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await operation();
    } catch (caught) {
      reportError(caught);
    } finally {
      setBusy(false);
    }
  };

  const rememberRunnerJob = (job: RunnerJob) => {
    setRunnerJob(job);
    rememberRunnerCheckpoint(job.sessionId, job);
  };

  const forgetRunnerJob = (sessionId: string, jobId?: string) => {
    forgetRunnerCheckpoint(sessionId, jobId);
  };

  const advanceLiveLab = async (startingSession: SessionView) => {
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
        terminalStates: ["LAB_VERIFIED", "LAB_REJECTED"],
        onSession: setSession,
      });
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
        terminalStates: ["EXPERIMENT_COMPLETED", "LAB_REJECTED"],
        onSession: setSession,
      });
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
    forgetRunnerJob(sessionId);
    setSession(current);
    setStage("build");
  };

  const retryLiveLab = () => {
    if (session === null) return;
    void withRequest(async () => {
      const restored = await counterLabApi.getSession(session.sessionId);
      setSession(restored);
      await advanceLiveLab(restored);
    });
  };

  const cancelLiveLab = () => {
    const checkpoint =
      session === null ? null : storedRunnerCheckpoint(session.sessionId);
    const jobId = runnerJob?.jobId ?? checkpoint?.jobId ?? null;
    if (session === null || jobId === null || cancellingRunner) return;
    setCancellingRunner(true);
    runner.cancel();
    void counterLabApi
      .cancelRunnerJob(session.sessionId, jobId)
      .then((updated) => {
        setSession(updated);
        setRunnerJob(updated.runnerJob);
        forgetRunnerJob(session.sessionId, jobId);
        setError(
          "You cancelled this test before it could release a result. Your notebook, claim, and locked prediction are preserved.",
        );
      })
      .catch(reportError)
      .finally(() => setCancellingRunner(false));
  };

  const restart = () => {
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
    setError(null);
    setBusy(false);
    setAnalysisPreview(null);
    setSensitiveContentApproved(false);
    setRunnerJob(null);
    setRouteHydrated(true);
    runner.clear();
  };

  useEffect(() => {
    const handlePopState = () => {
      setRouteHydrated(false);
      setLocationRevision((current) => current + 1);
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    const route = parseStudioLocation(window.location.pathname);

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
      void checkLiveCapabilities();
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
          if (loaded.schemaVersion === "2") {
            setReplayIntro(false);
            setStage("reality");
          }
        })
        .catch((caught: unknown) => {
          if (active) reportError(caught);
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
      setMode("live");
      setStage("live-setup");
      setSession(null);
      setArtifact(null);
      setError(null);
      window.localStorage.setItem(storageKeys.mode, "live");
      setRouteHydrated(true);
      void checkLiveCapabilities();
      return;
    }

    const sessionId = route.id;
    const storedClaim =
      window.localStorage.getItem(storageKeys.sessionId) === sessionId
        ? window.localStorage.getItem(storageKeys.claim)
        : null;
    setClaim(storedClaim ?? "");
    setBusy(true);
    setError(null);
    void (async () => {
      try {
        const restored = await counterLabApi.getSession(sessionId);
        const restoredArtifact = await counterLabApi.getArtifact(
          restored.artifactId,
        );
        if (!active) return;
        setArtifact(restoredArtifact);
        setSession(restored);
        setMode(presentationMode(restored.mode));
        window.localStorage.setItem(storageKeys.sessionId, restored.sessionId);
        window.localStorage.setItem(
          storageKeys.mode,
          presentationMode(restored.mode),
        );
        if (restored.prediction !== undefined) {
          const savedChoice = restored.prediction.choice.toLowerCase();
          setPrediction(
            savedChoice.includes("fall") || savedChoice.includes("minority")
              ? "falls"
              : savedChoice.includes("unsure")
                ? "unsure"
                : "stays-high",
          );
          setConfidence(restored.prediction.confidence);
        }
        setConfirmed(
          restored.state !== "INGESTED" &&
            restored.state !== "BELIEF_TEST_PROPOSED",
        );
        // The route is safe to synchronize as soon as the persisted session
        // and artifact have been restored. A resumed runner may still fail;
        // keeping hydration disabled until that network job succeeds would
        // freeze later retry navigation on the stale URL.
        setRouteHydrated(true);
        if (restored.state === "INGESTED") setStage("claim");
        else if (
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
            await advanceLiveLab(restored);
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
            : undefined,
    );
  }, [judgeMode, reviewStep, stage]);

  useEffect(() => {
    if (!routeHydrated || judgeMode) return;
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
  }, [activeReplayId, judgeMode, mode, routeHydrated, session, stage]);

  const checkLiveCapabilities = async () => {
    setCheckingLiveHealth(true);
    setLiveHealthError(null);
    setLiveHealth(null);
    try {
      setLiveHealth(await counterLabApi.getHealth());
    } catch (caught) {
      setLiveHealthError(
        caught instanceof ApiClientError
          ? "CounterLab could not verify the capability response."
          : "CounterLab could not reach the capability service.",
      );
    } finally {
      setCheckingLiveHealth(false);
    }
  };

  const chooseMode = (nextMode: Mode) => {
    setJudgeMode(false);
    setMode(nextMode);
    setReviewStep(null);
    setError(null);
    setAnalysisPreview(null);
    setSensitiveContentApproved(false);
    window.localStorage.setItem(storageKeys.mode, nextMode);
    if (nextMode === "live") {
      setStage("live-setup");
      void checkLiveCapabilities();
      return;
    }
    if (nextMode === "replay") {
      const replayId = "leakage-01";
      setActiveReplayId(replayId);
      window.localStorage.setItem(storageKeys.replayId, replayId);
      void withRequest(async () => {
        const loaded = await counterLabApi.getReplay(replayId);
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
    void withRequest(async () => {
      const sample = await counterLabApi.createSampleArtifact();
      const created = await counterLabApi.createSampleSession({
        sampleId: "leakage-01",
      });
      setArtifact(sample);
      setSession(created);
      window.localStorage.setItem(storageKeys.sessionId, created.sessionId);
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
    if (session?.patchResult === undefined) return;
    const anchor = document.createElement("a");
    anchor.href = counterLabApi.patchDownloadUrl(session.sessionId);
    anchor.download = "";
    anchor.click();
    void recordLearnerInteraction(session.sessionId, {
      kind: "patch.downloaded",
      stage: "repair",
    });
  };

  const exportCurrentProof = () => {
    if (session === null || !sessionProofReady(session)) return;
    if (session.proofCapsule !== undefined) {
      const anchor = document.createElement("a");
      anchor.href = counterLabApi.proofCapsuleDownloadUrl(session.sessionId);
      anchor.download = "";
      anchor.click();
      void recordLearnerInteraction(session.sessionId, {
        kind: "proof_capsule.downloaded",
        stage: "repair",
      });
      return;
    }
    void withRequest(async () => {
      const proof = await counterLabApi.getProofBundle(session.sessionId);
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
    });
  };

  const startLiveSession = () => {
    if (liveHealth?.liveGpt !== "configured") return;
    void withRequest(async () => {
      setArtifact(null);
      setSession(null);
      setConfirmed(false);
      setPrediction(null);
      setConfidence(72);
      setAnalysisPreview(null);
      setSensitiveContentApproved(false);
      window.localStorage.removeItem(storageKeys.sessionId);
      window.localStorage.setItem(storageKeys.mode, "live");
      setStage("claim");
    });
  };

  const uploadNotebook = (file: File) => {
    void withRequest(async () => {
      setAnalysisPreview(null);
      setSensitiveContentApproved(false);
      const uploaded = await counterLabApi.uploadArtifact(file);
      setArtifact(uploaded);
      setSession(null);
      window.localStorage.removeItem(storageKeys.sessionId);
      if (uploaded.support.status !== "SUPPORTED") return;
      const created = await counterLabApi.createLiveSession({
        artifactId: uploaded.artifactId,
      });
      setSession(created);
      setMode("live");
      window.localStorage.setItem(storageKeys.sessionId, created.sessionId);
      window.localStorage.setItem(storageKeys.mode, "live");
    });
  };

  const proposeBeliefTest = () => {
    if (session === null) return;
    window.localStorage.setItem(storageKeys.claim, claim);
    void withRequest(async () => {
      if (mode === "live" && analysisPreview === null) {
        const preview = await counterLabApi.previewBeliefAnalysis(
          session.sessionId,
          claim,
        );
        setAnalysisPreview(preview);
        setSensitiveContentApproved(false);
        return;
      }
      const updated = await counterLabApi.proposeBeliefTest(session.sessionId, {
        learnerClaim: claim,
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
      setSession(updated);
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
    void withRequest(async () => {
      const updated = await counterLabApi.confirmBeliefTest(session.sessionId);
      setSession(updated);
      setConfirmed(true);
    });
  };

  const stopBeliefTest = (reason: "rejected" | "insufficient") => {
    if (session === null) return;
    void withRequest(async () => {
      await counterLabApi.respondToBeliefTest(
        session.sessionId,
        reason === "rejected"
          ? {
              action: "reject",
              reason: "Learner rejected the proposed Belief Test.",
            }
          : {
              action: "insufficient_evidence",
              reason: "Learner marked the available evidence insufficient.",
            },
      );
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
    void withRequest(async () => {
      const committed = await counterLabApi.commitPrediction(
        session.sessionId,
        {
          choice: labels[prediction],
          confidence,
        },
      );
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
        await advanceLiveLab(committed);
        return;
      }
      const compiled = await counterLabApi.compileLab(session.sessionId);
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
    void withRequest(async () => {
      const completed = await counterLabApi.runLab(session.sessionId);
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
  };

  if (judgeMode) {
    return (
      <JudgeModeView
        health={liveHealth}
        healthPending={checkingLiveHealth}
        healthError={liveHealthError}
        onRetryHealth={() => void checkLiveCapabilities()}
        onStartSample={() => chooseMode("instant")}
      />
    );
  }

  if (hostedReplay !== null) {
    return (
      <div className="app-frame stage-reality hosted-replay-frame">
        <ProofCapsuleReplayView
          replay={hostedReplay}
          proofCapsuleDownloadUrl={counterLabApi.replayProofCapsuleDownloadUrl(
            hostedReplay.replayId,
          )}
          patchedNotebookDownloadUrl={counterLabApi.replayPatchedNotebookDownloadUrl(
            hostedReplay.replayId,
          )}
          onStartOver={restart}
        />
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

  return (
    <div className={`app-frame stage-${stage}`}>
      {replay && activeReplay !== null && (
        <ReplayBanner replay={activeReplay} />
      )}
      {stage !== "landing" && (
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
            setStage("claim");
            window.localStorage.setItem(storageKeys.mode, "live");
            uploadNotebook(file);
          }}
          testClaim={() => {
            window.localStorage.setItem(storageKeys.claim, claim);
            chooseMode("live");
          }}
          chooseMode={chooseMode}
          busy={busy}
        />
      )}
      {stage !== "landing" && mode !== null && (
        <CounterLabStudio
          context={{
            mode,
            stage: stage as StudioStage,
            artifact,
            session,
            events: runner.events,
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
                  downloadPatch: downloadCurrentPatch,
                }),
            ...(sessionProofReady(session)
              ? { exportProof: exportCurrentProof }
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
          {reviewStep === null && stage === "claim" && (
            <ClaimScreen
              artifact={artifact}
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
              busy={busy}
            />
          )}
          {reviewStep === null && stage === "belief" && (
            <BeliefScreen
              claim={effectiveClaim}
              belief={belief}
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
              <main className="workspace shell narrow" aria-live="polite">
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
              <main className="workspace shell narrow">
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
                    {activeReplay.schemaVersion === "1" ? (
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
                          <dt>Capsule</dt>
                          <dd>{activeReplay.capsuleId}</dd>
                        </div>
                        <div>
                          <dt>Root hash</dt>
                          <dd>{activeReplay.rootHash}</dd>
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
            verifiedResult !== undefined && (
              <RealityScreen
                claim={effectiveClaim}
                prediction={prediction ?? "stays-high"}
                result={verifiedResult}
                session={session}
                artifact={artifact}
                updateSession={setSession}
              />
            )}
          {reviewStep === null &&
            stage === "reality" &&
            verifiedResult === undefined && (
              <main className="workspace shell narrow" role="alert">
                <div className="screen-intro compact">
                  <p className="eyebrow">Result withheld</p>
                  <h1>No verified result was released.</h1>
                  <p>
                    CounterLab will not substitute bundled sample evidence for
                    this session. Return to the test and try again.
                  </p>
                </div>
              </main>
            )}
          {reviewStep === null && stage === "live-setup" && (
            <LiveSetup
              health={liveHealth}
              checking={checkingLiveHealth}
              checkError={liveHealthError}
              startLive={startLiveSession}
              retry={() => void checkLiveCapabilities()}
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
        </CounterLabStudio>
      )}
      {stage !== "landing" && (
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
