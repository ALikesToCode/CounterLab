import { useEffect, useLayoutEffect, useState } from "react";

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
import { InteractiveImbalanceLab } from "./components/lesson/InteractiveImbalanceLab";
import { ImbalancePatchReview } from "./components/lesson/ImbalancePatchReview";
import { ImbalanceTransferLesson } from "./components/lesson/ImbalanceTransferLesson";
import type { RecentProject, StudioStage } from "./components/studio/types";
import { BoundaryStage } from "./features/boundary/BoundaryStage";

import { getRun, sampleArtifact, sampleResult, verifiedReplay } from "./sample";

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
type TransferState =
  "locked" | "ready" | "failed" | "passed" | "patching" | "patched";
type ReviewStep = "claim" | "belief" | "build" | "reality";

function sessionProofReady(session: SessionView | null): boolean {
  return (
    session?.state === "PROOF_CAPSULE_ISSUED" ||
    session?.state === "REASONING_DIFF_ISSUED"
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

function ReplayBanner() {
  return (
    <aside className="replay-banner" aria-label="Replay status">
      <span className="status-dot" />
      <strong>Verified replay</strong>
      <span>{verifiedReplay.id}</span>
      <span className="replay-meta">
        Recorded {new Date(verifiedReplay.recordedAt).toLocaleDateString()}
      </span>
    </aside>
  );
}

function Header({
  mode,
  stage,
  reviewStep,
  review,
  returnToCurrent,
  restart,
}: {
  mode: Mode | null;
  stage: Stage;
  reviewStep: ReviewStep | null;
  review: (step: ReviewStep) => void;
  returnToCurrent: () => void;
  restart: () => void;
}) {
  const proofStages = [
    {
      label: "Question",
      reviewStep: "claim",
      stages: ["claim", "live-setup"],
    },
    { label: "Your guess", reviewStep: "belief", stages: ["belief"] },
    {
      label: "Fair test",
      reviewStep: "build",
      stages: ["build", "live-compile"],
    },
    { label: "Learn & apply", reviewStep: "reality", stages: ["reality"] },
  ] as const;
  const progressIndex = proofStages.findIndex((item) =>
    item.stages.some((candidate) => candidate === stage),
  );
  const viewedIndex =
    reviewStep === null
      ? progressIndex
      : proofStages.findIndex((item) => item.reviewStep === reviewStep);

  return (
    <header className={`topbar ${stage === "landing" ? "topbar-landing" : ""}`}>
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
      {stage !== "landing" && (
        <>
          <nav className="proof-rail" aria-label="CounterLab proof stages">
            {proofStages.map((item, index) => (
              <button
                type="button"
                aria-label={item.label}
                className={`${index === viewedIndex ? "active" : ""} ${index < progressIndex ? "complete" : ""}`}
                aria-current={index === viewedIndex ? "step" : undefined}
                disabled={index > progressIndex}
                onClick={() =>
                  index === progressIndex
                    ? returnToCurrent()
                    : review(item.reviewStep)
                }
                key={item.label}
              >
                <i>{index < progressIndex ? "✓" : index + 1}</i>
                <b>{item.label}</b>
              </button>
            ))}
          </nav>
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
          <button
            className="start-over-control"
            type="button"
            onClick={restart}
          >
            Start over
          </button>
        </>
      )}
    </header>
  );
}

function LearningGuide({
  step,
  title,
  known,
  unknown,
  next,
  tone = "blue",
}: {
  step: string;
  title: string;
  known: string;
  unknown: string;
  next: string;
  tone?: "blue" | "purple" | "aqua" | "gold";
}) {
  return (
    <aside className={`learning-guide ${tone}`} aria-label={`${step} guide`}>
      <div className="guide-title">
        <span>{step}</span>
        <strong>{title}</strong>
      </div>
      <div className="guide-action">
        <span>Your next move</span>
        <strong>{next}</strong>
      </div>
      <details className="guide-context">
        <summary>Why this step?</summary>
        <p>
          <strong>What we know:</strong> {known}
        </p>
        <p>
          <strong>The open question:</strong> {unknown}
        </p>
      </details>
    </aside>
  );
}

function Landing({ chooseMode }: { chooseMode: (mode: Mode) => void }) {
  const random = getRun("random_row_split");
  const grouped = getRun("customer_group_split");

  return (
    <main className="landing">
      <section className="learning-hero shell">
        <div className="learning-hero-copy">
          <h1 className="sr-only">CounterLab</h1>
          <p className="lesson-kicker">
            <span>CounterLab Studio</span> · mental-model debugger for ML
            notebooks
          </p>
          <h2>Your notebook made a claim. Will it survive a fair test?</h2>
          <p className="learning-promise">
            Bring a notebook result. Lock what you expect, run a verified test,
            apply the lesson once, then unlock a repair.
          </p>
          <div className="learning-actions">
            <button
              className="button lesson-primary"
              type="button"
              aria-label="Analyze a notebook — Generate live"
              onClick={() => chooseMode("live")}
            >
              Analyze a notebook <Mark name="arrow" />
            </button>
            <button
              className="button lesson-secondary"
              type="button"
              aria-label="Try the 3-minute sample — Try instantly"
              onClick={() => chooseMode("instant")}
            >
              Try the 3-minute sample
            </button>
          </div>
          <div className="lesson-trust" aria-label="Lesson details">
            <span>
              <Mark name="check" /> No account needed
            </span>
            <span>
              <Mark name="check" /> Uploaded cells are read, never run
            </span>
          </div>
        </div>

        <aside className="lesson-preview" aria-label="Sample lesson preview">
          <div className="lesson-preview-head">
            <span>Example: customer churn</span>
            <span className="lesson-badge">Real computed result</span>
          </div>
          <p className="preview-question">
            Does a high test score mean the model works for new customers?
          </p>
          <div className="score-story">
            <div className="score-card score-before">
              <span>The notebook says</span>
              <strong>{percent.format(random.metrics.accuracy)}</strong>
              <small>rows mixed at random</small>
            </div>
            <div className="score-arrow" aria-hidden="true">
              <Mark name="arrow" />
            </div>
            <div className="score-card score-after">
              <span>New customers</span>
              <strong>{percent.format(grouped.metrics.accuracy)}</strong>
              <small>no customer overlap</small>
            </div>
          </div>
          <p className="preview-lesson">
            <Mark name="spark" /> Same model. A test that matches the real
            question.
          </p>
        </aside>
      </section>

      <section className="lesson-steps shell" aria-label="How CounterLab works">
        {[
          ["1", "Question the claim", "Link exact notebook evidence."],
          ["2", "Let reality answer", "Predict, then test fairly."],
          ["3", "Transfer, then repair", "Apply the rule before repair."],
        ].map(([index, title, copy]) => (
          <article key={index}>
            <span>{index}</span>
            <div>
              <strong>{title}</strong>
              <p>{copy}</p>
            </div>
          </article>
        ))}
      </section>

      <section className="more-paths shell" id="judge-paths">
        <div className="more-paths-heading">
          <span>See it before uploading</span>
          <p>Try the sample or inspect a verified run.</p>
        </div>
        <div className="simple-mode-grid">
          <button
            className="simple-mode-card"
            type="button"
            aria-label="Try the 3-minute sample lesson"
            onClick={() => chooseMode("instant")}
          >
            <span className="path-icon">A</span>
            <strong>Try the sample lesson</strong>
            <small>No upload, account, or secret needed</small>
            <span>
              Start sample <Mark name="arrow" />
            </span>
          </button>

          <button
            className="simple-mode-card"
            type="button"
            aria-label="Watch a verified replay — Replay verified session"
            onClick={() => chooseMode("replay")}
          >
            <span className="path-icon">B</span>
            <strong>Watch a verified replay</strong>
            <small>See a recorded run from start to finish</small>
            <span>
              Watch replay <Mark name="arrow" />
            </span>
          </button>
        </div>

        <p className="plain-support-note">
          Released support: entity leakage and class imbalance in documented
          Python/scikit-learn Jupyter notebooks. Unsupported files are refused,
          not guessed.
        </p>
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
  const random = getRun("random_row_split");
  const isSample = artifact?.fileSha256 === sampleArtifact.fileSha256;
  const metricCandidates =
    artifact?.cells.flatMap((cell) =>
      cell.metricCandidates.map((metric) => ({
        ...metric,
        cellIndex: cell.index,
      })),
    ) ?? [];
  const supported = artifact?.support.status === "SUPPORTED";
  return (
    <main className="workspace shell">
      <div className="screen-intro">
        <p className="eyebrow">Step 1 of 4 · Your idea</p>
        <h1>What do you think the score means?</h1>
        <p>Write one sentence about who you think this model will work for.</p>
      </div>

      <LearningGuide
        step="Start here"
        title="A high score is a result—not yet a conclusion."
        known="The notebook reports a high score on held-out rows."
        unknown="Whether it also works for completely new customers."
        next="Say what you believe the score tells us."
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
          {isSample ? (
            <div className="headline-metric">
              <span>{percent.format(random.metrics.accuracy)}</span>
              <small>score shown in the notebook</small>
            </div>
          ) : metricCandidates[0] ? (
            <div className="headline-metric">
              <span>{metricCandidates[0].value.toLocaleString()}</span>
              <small>
                {metricCandidates[0].name} · displayed notebook output
              </small>
            </div>
          ) : (
            <p className="evidence-empty">
              No safe displayed metric was extracted.
            </p>
          )}
          <div className="evidence-list">
            {isSample ? (
              <>
                <div className="evidence-row">
                  <span className="evidence-ref">Cell 3 · output 0</span>
                  <span>The test mixed rows from the same customers.</span>
                </div>
                <div className="evidence-row">
                  <span className="evidence-ref">Cell 3 · source</span>
                  <span>
                    The model can use <code>customer_id</code>.
                  </span>
                </div>
              </>
            ) : (
              metricCandidates.slice(0, 3).map((metric) => (
                <div
                  className="evidence-row"
                  key={`${metric.cellIndex}-${metric.outputIndex}-${metric.name}`}
                >
                  <span className="evidence-ref">
                    Cell {metric.cellIndex} · output {metric.outputIndex}
                  </span>
                  <span>
                    {metric.name}: {metric.value.toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
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
          <details>
            <summary>Artifact integrity</summary>
            <dl className="provenance-list">
              <div>
                <dt>Rows</dt>
                <dd>
                  {artifact?.schemaSummary.rowCount?.toLocaleString() ??
                    "Not inferred"}
                </dd>
              </div>
              <div>
                <dt>Entity candidates</dt>
                <dd>
                  {artifact?.schemaSummary.entityCandidates.join(", ") ||
                    "None"}
                </dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code>{artifact?.fileSha256.slice(0, 16) ?? "pending"}…</code>
                </dd>
              </div>
            </dl>
          </details>
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
              <p>
                This sanitized bundle contains notebook structure and short
                evidence excerpts—not raw rows, local paths, or notebook bytes.
              </p>
              <pre aria-label="Exact sanitized analyst input">
                <code>
                  {JSON.stringify(analysisPreview.sanitizedContent, null, 2)}
                </code>
              </pre>
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
        currentLabel: "Idea A · Accuracy is enough",
        currentHypothesis:
          "The high overall score means the model catches the rare cases that matter.",
        currentPrediction:
          "Minority recall should also be strong and clearly beat a majority-only baseline.",
        competingLabel: "Idea B · Rarity hides failure",
        competingHypothesis:
          "The common class makes accuracy look excellent even when rare cases are missed.",
        competingPrediction:
          "A majority baseline will look similar while recall and PR-AUC expose the misses.",
        fairTest:
          "Compare the majority baseline, confusion matrix, and rare-class metrics.",
        intervention:
          "We keep the data and scoring model fixed. We expose class-specific errors, then test a bounded threshold change.",
        help: "If accuracy reflects useful rare-event detection, recall should stay strong and beat the majority baseline. If rarity hides failure, class-specific evidence will reveal the gap.",
        predictionLegend:
          "When we inspect minority performance, the evidence will…",
        staysTitle: "Still support the high-score claim",
        staysDetail:
          "Rare-class recall and PR-AUC confirm the overall accuracy.",
        fallsTitle: "Expose a serious minority-class problem",
        fallsDetail:
          "The majority baseline or missed positives explain the high score.",
      }
    : {
        currentLabel: "Idea A · A useful pattern",
        currentHypothesis:
          "The model learned a useful pattern that will work for new customers.",
        currentPrediction: "The score stays close to 98% for new customers.",
        competingLabel: "Idea B · Customer memory",
        competingHypothesis:
          "The model partly remembers customers it already saw.",
        competingPrediction:
          "The score drops for new customers and without customer ID.",
        fairTest:
          "Keep each customer's rows together, then remove customer ID.",
        intervention:
          "We keep the model the same. We change who appears in the test, then check what happens without customer ID.",
        help: "If the model learned a reusable pattern, the score should stay high. If it remembers customers, the score should fall. The two ideas now predict different outcomes.",
        predictionLegend: "If we hold out entire customers, accuracy will…",
        staysTitle: "Remain near 98%",
        staysDetail: "The notebook result reflects a reusable signal.",
        fallsTitle: "Fall materially",
        fallsDetail: "The random split is benefiting from repeated identities.",
      };

  return (
    <main className="workspace shell">
      <div className="screen-intro compact">
        <p className="eyebrow">Step 2 of 4 · Your prediction</p>
        <h1>Which explanation fits?</h1>
        <p>
          Both ideas could explain the high score. A fair test will separate
          them.
        </p>
      </div>

      <LearningGuide
        step="Belief Test"
        title="Choose before you see the answer."
        known="Both explanations fit the score we have."
        unknown="What happens when the test uses only new customers."
        next="Check the two ideas, then lock your prediction."
        tone="purple"
      />

      <section className="claim-quote" aria-label="Learner claim">
        <span>Your claim</span>
        <blockquote>{claim}</blockquote>
      </section>

      <section className="hypothesis-grid" aria-label="Competing hypotheses">
        <article className="hypothesis current">
          <p className="hypothesis-label">{copy.currentLabel}</p>
          <h2>{belief?.current.statement ?? copy.currentHypothesis}</h2>
          <p className="prediction-line">
            <span>Predicts</span>{" "}
            {belief?.current.predictedOutcome ?? copy.currentPrediction}
          </p>
          {belief?.schemaVersion === "2" && (
            <details className="analyst-wording">
              <summary>Show conditions and limits</summary>
              <p>Conditions: {belief.current.conditions.join(" ")}</p>
              <p>Does not claim: {belief.current.nonClaims.join(" ")}</p>
            </details>
          )}
        </article>
        <div className="versus" aria-hidden="true">
          vs
        </div>
        <article className="hypothesis competing">
          <p className="hypothesis-label">{copy.competingLabel}</p>
          <h2>{belief?.competing.statement ?? copy.competingHypothesis}</h2>
          <p className="prediction-line">
            <span>Predicts</span>{" "}
            {belief?.competing.predictedOutcome ?? copy.competingPrediction}
          </p>
          {belief?.schemaVersion === "2" && (
            <details className="analyst-wording">
              <summary>Show conditions and limits</summary>
              <p>Conditions: {belief.competing.conditions.join(" ")}</p>
              <p>Does not claim: {belief.competing.nonClaims.join(" ")}</p>
            </details>
          )}
        </article>
      </section>

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

      {!confirmed ? (
        <div className="action-cluster">
          <button
            className="button button-primary"
            type="button"
            onClick={confirm}
          >
            These two ideas make sense <Mark name="check" />
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={editClaim}
          >
            Edit claim
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => stop("rejected")}
          >
            Reject
          </button>
          <button
            className="button button-quiet"
            type="button"
            onClick={() => stop("insufficient")}
          >
            Insufficient evidence
          </button>
        </div>
      ) : (
        <section
          className="prediction-contract panel"
          aria-labelledby="prediction-heading"
        >
          <div className="prediction-title">
            <div>
              <p className="eyebrow gold">Prediction Contract</p>
              <h2 id="prediction-heading">What do you think will happen?</h2>
            </div>
            <Mark name="lock" />
          </div>
          <fieldset>
            <legend>{copy.predictionLegend}</legend>
            <label className="choice">
              <input
                type="radio"
                name="prediction"
                checked={prediction === "stays-high"}
                onChange={() => setPrediction("stays-high")}
              />
              <span>
                <strong>{copy.staysTitle}</strong>
                <small>{copy.staysDetail}</small>
              </span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="prediction"
                checked={prediction === "falls"}
                onChange={() => setPrediction("falls")}
              />
              <span>
                <strong>{copy.fallsTitle}</strong>
                <small>{copy.fallsDetail}</small>
              </span>
            </label>
            <label className="choice">
              <input
                type="radio"
                name="prediction"
                checked={prediction === "unsure"}
                onChange={() => setPrediction("unsure")}
              />
              <span>
                <strong>I am unsure</strong>
                <small>The intervention is still worth running.</small>
              </span>
            </label>
          </fieldset>
          <label className="confidence-control">
            Confidence <strong>{confidence}%</strong>
            <input
              type="range"
              min="0"
              max="100"
              value={confidence}
              onChange={(event) => setConfidence(Number(event.target.value))}
            />
          </label>
          <button
            className="button button-gold"
            type="button"
            disabled={prediction === null}
            onClick={commitPrediction}
          >
            Lock my answer and run the test <Mark name="lock" />
          </button>
        </section>
      )}
    </main>
  );
}

const compilerSteps = [
  ["Test planned", "Only the customer boundary will change"],
  ["Files checked", "Generated work stayed inside its limits"],
  ["Result repeated", "The same input produced the same answer"],
  ["Safety checks passed", "Invalid alternatives were rejected"],
] as const;

function BuildScreen({
  mode,
  openResult,
}: {
  mode: Mode;
  openResult: () => void;
}) {
  return (
    <main className="workspace shell">
      <div className="screen-intro compact">
        <p className="eyebrow">Step 3 of 4 · What happened</p>
        <h1>The result is ready.</h1>
        <p>
          Your answer was locked first. CounterLab has now run and checked the
          fairer test.
        </p>
      </div>

      <LearningGuide
        step="Before the reveal"
        title="The answer comes from the test, not from the tutor."
        known="Your prediction cannot be changed."
        unknown="Whether the score stays high for new customers."
        next="Review the completed checks, then reveal the result."
        tone="aqua"
      />

      <div className="lock-notice">
        <Mark name="lock" />
        <strong>Your answer is locked</strong>
        <span>It was saved before any new result was shown.</span>
      </div>

      <div className="build-layout">
        <section className="pipeline panel" aria-labelledby="pipeline-title">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Compiler trace</p>
              <h2 id="pipeline-title">Four checks completed</h2>
            </div>
            <span className="verified-chip">
              <Mark name="check" /> Verified
            </span>
          </div>
          <ol className="stepper">
            {compilerSteps.map(([title, detail], index) => (
              <li key={title}>
                <span className="step-index">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span>
                  <strong>{title}</strong>
                  <small>{detail}</small>
                </span>
                <Mark name="check" />
              </li>
            ))}
          </ol>
          <div className="verifier-callout">
            <p className="eyebrow aqua">Independent checks</p>
            <strong>
              {mode === "replay"
                ? "A failed run showed no result; a later valid run passed"
                : "This result is ready for the lesson"}
            </strong>
            <p>
              {mode === "replay"
                ? "The recording preserves both the rejected attempt and the later passing run."
                : "No customer appears on both sides of the fairer test, and the result repeats."}
            </p>
          </div>
        </section>

        <details className="trace panel technical-trace">
          <summary id="trace-title">Show technical run details</summary>
          <p className="eyebrow">Recorded event log</p>
          <ul className="event-list">
            {mode === "replay" ? (
              <>
                <li>
                  <time>02:21</time>
                  <span>rejected</span>
                  <p>Unsupported SDK argument · constrained tests exit 20</p>
                </li>
                <li>
                  <time>03:30</time>
                  <span>repair 1</span>
                  <p>SDK fixed; exact-file policy found __pycache__</p>
                </li>
                <li>
                  <time>04:40</time>
                  <span>repair 2</span>
                  <p>Repair cap reached · rejected run produced no result</p>
                </li>
                <li>
                  <time>01:19</time>
                  <span>later run</span>
                  <p>Separate live candidate verified · not called repair 3</p>
                </li>
              </>
            ) : (
              <>
                <li>
                  <time>00:00.0</time>
                  <span>plan</span>
                  <p>Loaded approved entity-leakage contract</p>
                </li>
                <li>
                  <time>00:00.2</time>
                  <span>file</span>
                  <p>experiment-plan.json</p>
                </li>
                <li>
                  <time>00:00.4</time>
                  <span>command</span>
                  <p>public test summary · exit 0</p>
                </li>
                <li>
                  <time>00:01.3</time>
                  <span>verifier</span>
                  <p>18 invariants accepted · 12/12 mutations detected</p>
                </li>
              </>
            )}
          </ul>
          <dl className="trace-meta">
            <div>
              <dt>Mode</dt>
              <dd>
                {mode === "replay"
                  ? "Stored replay"
                  : "Stored approved artifacts"}
              </dd>
            </div>
            <div>
              <dt>Result authority</dt>
              <dd>Fixed kernel</dd>
            </div>
            <div>
              <dt>Network</dt>
              <dd>
                {mode === "replay"
                  ? "Denied in candidate runner"
                  : "Not required"}
              </dd>
            </div>
            {mode === "replay" && (
              <div>
                <dt>Generation isolation</dt>
                <dd>Partial · host-global skill files were readable</dd>
              </div>
            )}
          </dl>
        </details>
      </div>

      <div className="continue-row">
        <p>Ready? Compare your prediction with what the test found.</p>
        <button
          className="button button-primary"
          type="button"
          onClick={openResult}
        >
          Show me what happened <Mark name="arrow" />
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

function ResultBars({ result }: { result: LeakageVerifiedResultSet }) {
  const runs = [
    { run: resultRun(result, "random_row_split"), label: "Random rows" },
    {
      run: resultRun(result, "customer_group_split"),
      label: "New customers",
    },
    { run: resultRun(result, "identity_ablation"), label: "No identity" },
  ];
  return (
    <div
      className="result-visual"
      role="img"
      aria-label={`Accuracy comparison: ${runs.map(({ label, run }) => `${label} ${percent.format(run.metrics.accuracy)}`).join(", ")}`}
    >
      {runs.map(({ run, label }) => (
        <div className="bar-row" key={run.id}>
          <span>{label}</span>
          <div className="bar-track">
            <span style={{ width: percent.format(run.metrics.accuracy) }} />
          </div>
          <strong>{percent.format(run.metrics.accuracy)}</strong>
        </div>
      ))}
    </div>
  );
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
    claim: "Review your original question",
    belief: "Review your prediction",
    build: "Review the rare-event test",
    reality: "Review what you learned",
  };
  return (
    <main className="workspace shell lesson-review">
      <div className="screen-intro compact">
        <p className="eyebrow">Lesson map · Saved step</p>
        <h1>{titles[step]}</h1>
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
        {step === "claim" && (
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
        {step === "belief" && (
          <>
            <p className="eyebrow purple">Your committed guess</p>
            <h2>{session?.prediction?.choice ?? "Prediction not committed"}</h2>
            <p>
              {belief?.competing.statement ??
                "Class rarity can make a weak detector look accurate."}
            </p>
          </>
        )}
        {step === "build" && (
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
        {step === "reality" && (
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
              {session?.revision ?? "Write a reusable evaluation rule."}
            </blockquote>
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
  session,
  result,
  returnToCurrent,
  restart,
}: {
  step: ReviewStep;
  claim: string;
  session: SessionView | null;
  result: VerifiedResultSet;
  returnToCurrent: () => void;
  restart: () => void;
}) {
  const belief = sessionBeliefPresentation(session);
  if (result.concept === "class_imbalance") {
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
  const leakageResult = result as LeakageVerifiedResultSet;
  const random = resultRun(leakageResult, "random_row_split");
  const group = resultRun(leakageResult, "customer_group_split");
  const titles: Record<ReviewStep, string> = {
    claim: "Review your original question",
    belief: "Review your prediction",
    build: "Review the fair test",
    reality: "Review what you learned",
  };

  return (
    <main className="workspace shell lesson-review">
      <div className="screen-intro compact">
        <p className="eyebrow">Lesson map · Saved step</p>
        <h1>{titles[step]}</h1>
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

      {step === "claim" && (
        <section className="review-card panel">
          <p className="eyebrow">The result you questioned</p>
          <div className="review-score-row">
            <strong>{percent.format(random.metrics.accuracy)}</strong>
            <div>
              <span>Notebook score</span>
              <p>Rows from the same customers appeared on both sides.</p>
            </div>
          </div>
          <blockquote>{claim}</blockquote>
        </section>
      )}

      {step === "belief" && (
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

      {step === "build" && (
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

      {step === "reality" && (
        <section className="review-card panel">
          <p className="eyebrow gold">Verified lesson</p>
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
          <blockquote>
            {session?.revision ??
              "Write a reusable rule to complete this lesson."}
          </blockquote>
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
            result used by your Prediction Contract or Proof Bundle.
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
  const ablation = resultRun(result, "identity_ablation");
  const [revision, setRevision] = useState(
    session?.revision ??
      window.localStorage.getItem(storageKeys.replayRevision) ??
      "",
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
  const [splitChoice, setSplitChoice] = useState("");
  const [riskChoice, setRiskChoice] = useState("");
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
  const predictionWasSupported = prediction === "falls";

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
      setTransferState(
        updated.transferResult?.outcome === "PASSED" ? "passed" : "failed",
      );
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
    return (
      <main className="workspace shell reality lesson-phase completion-phase">
        <div className="screen-intro compact">
          <p className="eyebrow purple">
            Lesson complete · Transfer passed · Verified correction
          </p>
          <h1 id="lesson-phase-title" tabIndex={-1}>
            You found the hidden shortcut.
          </h1>
          <p>
            You challenged the score, used the rule on a different problem, and
            unlocked a correction that passed the same checks.
          </p>
        </div>

        <section className="completion-hero" aria-label="Lesson completion">
          <div className="completion-mark">
            <Mark name="check" />
          </div>
          <div>
            <span>Reusable rule</span>
            <h2>The test must match what the model will face in real life.</h2>
            <p>
              Hold out whole customers for new-customer claims. Hold out later
              time periods for forecasting claims.
            </p>
          </div>
          <dl>
            <div>
              <dt>Customer test</dt>
              <dd>0 shared customers</dd>
            </div>
            <div>
              <dt>Forecasting transfer</dt>
              <dd>Passed</dd>
            </div>
            <div>
              <dt>Notebook correction</dt>
              <dd>Verified copy</dd>
            </div>
          </dl>
        </section>

        <section className="reasoning-diff panel">
          <div className="panel-title final-title">
            <div>
              <p className="eyebrow purple">Reasoning Diff</p>
              <h2>Your learning, before and after</h2>
              <p>One view of what changed in your idea, evidence, and code.</p>
            </div>
            <div className="completion-actions">
              {session?.mode.kind === "live_notebook" && patch !== null && (
                <a
                  className="button button-gold patch-download"
                  href={counterLabApi.patchDownloadUrl(session.sessionId)}
                  download
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
          <div className="diff-table" role="table" aria-label="Reasoning Diff">
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
              Only the supported evaluation cell changed. The original notebook
              remains untouched.
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

        <section className="lesson-recap" aria-label="Rule carried forward">
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
          <div
            className="forecast-window"
            aria-label="Forecast information timeline"
          >
            <div className="forecast-labels">
              <span>Available history</span>
              <strong>Prediction time</strong>
              <span>Unavailable future</span>
            </div>
            <div className="forecast-track">
              {[-3, -2, -1, 0, 1, 2, 3].map((day) => (
                <span
                  className={day === 0 ? "now" : day > 0 ? "future" : "past"}
                  key={day}
                >
                  {day === 0 ? "NOW" : day > 0 ? `+${day}` : day}
                </span>
              ))}
            </div>
          </div>
          <div className="transfer-questions">
            <fieldset>
              <legend>Which evaluation design matches deployment?</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="transfer-split"
                  checked={splitChoice === "random"}
                  onChange={() => setSplitChoice("random")}
                />
                <span>
                  <strong>Random daily rows</strong>
                  <small>Mix observations from all dates.</small>
                </span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="transfer-split"
                  checked={splitChoice === "time"}
                  onChange={() => setSplitChoice("time")}
                />
                <span>
                  <strong>Time-ordered holdout</strong>
                  <small>Train on earlier dates and test on later dates.</small>
                </span>
              </label>
            </fieldset>
            <fieldset>
              <legend>Which feature leaks future information?</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="transfer-risk"
                  checked={riskChoice === "price"}
                  onChange={() => setRiskChoice("price")}
                />
                <span>
                  <strong>Known item price</strong>
                  <small>Known when the prediction is made.</small>
                </span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="transfer-risk"
                  checked={riskChoice === "future"}
                  onChange={() => setRiskChoice("future")}
                />
                <span>
                  <strong>Centered rolling target</strong>
                  <small>Reads outcomes from later days.</small>
                </span>
              </label>
            </fieldset>
          </div>
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

  return (
    <main className="workspace shell reality">
      <div className="screen-intro compact">
        <p className="eyebrow aqua">Step 4 of 4 · The lesson</p>
        <h1 id="lesson-phase-title" tabIndex={-1}>
          Here’s what changed.
        </h1>
        <p>
          The model looked excellent on familiar customers. It struggled on
          customers it had never seen.
        </p>
      </div>

      <LearningGuide
        step="What you learned"
        title="The test must match the people the model will meet."
        known={`New customers scored ${accuracyGapPoints.toFixed(1)} points lower.`}
        unknown="Whether you can spot the same mistake in a different problem."
        next="Write the rule in your words, then try one new case."
        tone="gold"
      />

      <section className="finding-banner" aria-label="Verified finding summary">
        <div>
          <span
            className={predictionWasSupported ? "supported" : "contradicted"}
          >
            {predictionWasSupported
              ? "Prediction supported"
              : "Prediction contradicted"}
          </span>
          <h2>
            {percent.format(random.metrics.accuracy)} became{" "}
            {percent.format(group.metrics.accuracy)} on new customers.
          </h2>
          <p>
            The first test put {random.entityOverlap.count} of the same
            customers on both sides. The fairer test shared{" "}
            {group.entityOverlap.count}.
          </p>
        </div>
        <dl>
          <div>
            <dt>We changed</dt>
            <dd>Which customers appear in the test</dd>
          </div>
          <div>
            <dt>We kept</dt>
            <dd>The model, target, and random seed</dd>
          </div>
          <div>
            <dt>We checked</dt>
            <dd>Zero overlap and a repeatable result</dd>
          </div>
        </dl>
      </section>

      <section className="metric-grid" aria-label="Verified metric cards">
        <article>
          <p>Familiar customers mixed in</p>
          <strong>{percent.format(random.metrics.accuracy)}</strong>
          <small>
            n={random.sampleSizes.test} · overlap {random.entityOverlap.count} ·
            seed {random.seed}
          </small>
        </article>
        <article className="metric-decisive">
          <p>Only new customers</p>
          <strong>{percent.format(group.metrics.accuracy)}</strong>
          <small>
            n={group.sampleSizes.test} · overlap {group.entityOverlap.count} ·
            seed {group.seed}
          </small>
        </article>
        <article>
          <p>Customer ID removed</p>
          <strong>{percent.format(ablation.metrics.accuracy)}</strong>
          <small>
            n={ablation.sampleSizes.test} · customer_id removed · seed{" "}
            {ablation.seed}
          </small>
        </article>
      </section>

      <section className="results-panel panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Accuracy · higher is better</p>
            <h2>Why the score changed</h2>
          </div>
        </div>
        <div className="overlap-story" aria-label="Entity overlap comparison">
          <div>
            <span>Random rows</span>
            <div className="entity-dots shared" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <strong>{random.entityOverlap.count} shared customers</strong>
          </div>
          <Mark name="arrow" />
          <div>
            <span>Customer groups</span>
            <div className="entity-dots isolated" aria-hidden="true">
              {Array.from({ length: 12 }, (_, index) => (
                <i key={index} />
              ))}
            </div>
            <strong>{group.entityOverlap.count} shared customers</strong>
          </div>
        </div>
        <ResultBars result={result} />
        <details className="exact-results">
          <summary>Show exact values and run details</summary>
          <ResultTable result={result} />
          <code>result {result.resultHash.slice(0, 12)}…</code>
        </details>
      </section>

      <InteractiveLeakageLab
        session={session}
        artifact={artifact}
        authoritativeResult={result}
      />

      <section className="prediction-observed">
        <div>
          <p className="eyebrow gold">Prediction</p>
          <h2>
            {prediction === "stays-high"
              ? "Accuracy remains near 98%"
              : prediction === "falls"
                ? "Accuracy falls materially"
                : "Uncertain outcome"}
          </h2>
        </div>
        <div className="reasoning-arrow">
          <Mark name="arrow" />
        </div>
        <div>
          <p className="eyebrow aqua">Observed</p>
          <h2>{percent.format(group.metrics.accuracy)} on new customers</h2>
          <p>Zero customer overlap</p>
        </div>
      </section>

      {session?.mode.kind === "live_notebook" && (
        <BoundaryStage
          session={session}
          prediction={
            prediction === "stays-high"
              ? "Accuracy remains near 98% on unseen customers."
              : prediction === "falls"
                ? "Accuracy falls materially on unseen customers."
                : "The unseen-customer result is uncertain."
          }
          updateSession={updateSession}
        />
      )}

      {(session?.mode.kind !== "live_notebook" ||
        session.boundaryMapAuthority !== undefined) && (
        <section className="revision panel">
          <div>
            <p className="eyebrow">In your words</p>
            <h2>Write the rule you’ll use next time</h2>
            <p>Focus on how you would split the data—not these exact scores.</p>
          </div>
          <label htmlFor="revision">Your revised mental model</label>
          <textarea
            id="revision"
            rows={4}
            value={revision}
            onChange={(event) => setRevision(event.target.value)}
            placeholder="When rows repeat an entity, I should…"
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
      )}

      {actionErrorNotice}
    </main>
  );
}

function ImbalanceRealityScreen({
  claim,
  result,
  session,
  updateSession,
}: {
  claim: string;
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
  return (
    <main className="workspace shell reality imbalance-reality">
      <div className="screen-intro">
        <p className="eyebrow aqua">Verified Lab · rare-event evaluation</p>
        <h1>A high accuracy can still miss every rare event.</h1>
        <p>
          CounterLab compared the notebook claim with a computed majority
          baseline, class-specific metrics, and two bounded operating scenarios.
        </p>
      </div>
      <LearningGuide
        step="Reality answered"
        title="Ask what happens to the class you cannot afford to miss."
        known={`The majority baseline is ${percent.format(majority.metrics.accuracy)} accurate with ${percent.format(majority.metrics.recall)} rare-class recall.`}
        unknown="Which threshold and metric match the real cost of missed positives."
        next="Compare recall, precision, and prevalence—not accuracy alone."
        tone="gold"
      />
      <section
        className="finding-banner"
        aria-label="Verified imbalance finding"
      >
        <div>
          <span className="contradicted">Headline contradicted</span>
          <h2>
            {percent.format(majority.metrics.accuracy)} accuracy, zero rare
            cases caught.
          </h2>
          <p>{claim}</p>
        </div>
        <dl>
          <div>
            <dt>We changed</dt>
            <dd>Metric, threshold, and prevalence scenario</dd>
          </div>
          <div>
            <dt>We kept</dt>
            <dd>Fixture, stratified holdout, model score, and seed</dd>
          </div>
          <div>
            <dt>We checked</dt>
            <dd>
              Confusion totals, deterministic hash, and response to controls
            </dd>
          </div>
        </dl>
      </section>
      <section
        className="metric-grid imbalance-metric-grid"
        aria-label="Rare-event metrics"
      >
        <article>
          <p>Majority baseline accuracy</p>
          <strong>{percent.format(majority.metrics.accuracy)}</strong>
          <small>
            recall {percent.format(majority.metrics.recall)} · n=
            {majority.sampleSizes.test}
          </small>
        </article>
        <article className="metric-decisive">
          <p>Model rare-class recall</p>
          <strong>{percent.format(stratified.metrics.recall)}</strong>
          <small>
            precision {percent.format(stratified.metrics.precision)} · threshold{" "}
            {stratified.threshold}
          </small>
        </article>
        <article>
          <p>PR-AUC vs prevalence</p>
          <strong>{stratified.metrics.prAuc.toFixed(3)}</strong>
          <small>
            base rate {percent.format(stratified.prevalence)} · ROC-AUC{" "}
            {stratified.metrics.rocAuc.toFixed(3)}
          </small>
        </article>
      </section>
      <section className="results-panel panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Fixed-kernel comparison</p>
            <h2>What each operating choice reveals</h2>
          </div>
          <span className="verified-chip">
            <Mark name="check" /> Verified
          </span>
        </div>
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
        <div
          className="imbalance-control-story"
          aria-label="Verified control response"
        >
          <article>
            <span>Threshold {stratified.threshold}</span>
            <strong>{percent.format(stratified.metrics.recall)} recall</strong>
          </article>
          <Mark name="arrow" />
          <article>
            <span>Threshold {threshold.threshold}</span>
            <strong>{percent.format(threshold.metrics.recall)} recall</strong>
          </article>
          <Mark name="arrow" />
          <article>
            <span>{prevalence.prevalenceScenario.replaceAll("_", " ")}</span>
            <strong>
              {percent.format(prevalence.metrics.precision)} precision
            </strong>
          </article>
        </div>
        <code>
          result {result.resultHash.slice(0, 12)}… · seed {result.seed}
        </code>
      </section>
      <section className="prediction-observed">
        <div>
          <p className="eyebrow gold">Claim</p>
          <h2>{claim}</h2>
        </div>
        <div className="reasoning-arrow">
          <Mark name="arrow" />
        </div>
        <div>
          <p className="eyebrow aqua">Observed</p>
          <h2>{majority.confusionMatrix.fn} rare positives missed</h2>
          <p>{majority.confusionMatrix.tp} true positives</p>
        </div>
      </section>
      <InteractiveImbalanceLab
        isLive={session?.mode.kind === "live_notebook"}
        sessionId={session?.sessionId ?? null}
        authoritativeResultHash={result.resultHash}
      />
      {session?.mode.kind === "live_notebook" && (
        <BoundaryStage
          session={session}
          {...(session.prediction === undefined
            ? {}
            : { prediction: session.prediction.choice })}
          updateSession={updateSession}
        />
      )}
      {session !== null &&
        session.mode.kind !== "verified_replay" &&
        (session.mode.kind !== "live_notebook" ||
          session.boundaryMapAuthority !== undefined) && (
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
        </>
      )}
      {session?.revision !== undefined && (
        <section className="revision panel">
          <p className="eyebrow">Saved revision</p>
          <h2>{session.revision}</h2>
        </section>
      )}
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
  events,
  job,
  failed,
  canCancel,
  retrying,
  cancelling,
  onRetry,
  onCancel,
}: {
  events: readonly PublicCompilerEvent[];
  job: RunnerJob | null;
  failed: boolean;
  canCancel: boolean;
  retrying: boolean;
  cancelling: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const repaired = events.some((event) => event.kind === "repair.started");
  const verified = events.some(
    (event) =>
      event.kind === "verifier.verified" || event.kind === "result.ready",
  );
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
      <section className="live-compiler-grid">
        <div className="pipeline panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Public compiler trace</p>
              <h2>Plan → verify → repair → compute</h2>
            </div>
            <span
              className={`runner-state ${verified ? "verified" : "active"}`}
            >
              <span className="status-dot configured" />
              {job?.status.replaceAll("_", " ") ?? "STARTING"}
            </span>
          </div>
          <ol className="live-event-list" aria-live="polite">
            {events.length === 0 && (
              <li className="active">
                <span className="event-mark" />
                <div>
                  <strong>Dispatching protected job</strong>
                  <p>Waiting for the first sanitized runner event.</p>
                </div>
              </li>
            )}
            {events.map((event) => {
              const copy = compilerEventCopy(event);
              return (
                <li className={copy.tone} key={event.eventId}>
                  <span className="event-mark" />
                  <div>
                    <strong>{copy.label}</strong>
                    <p>{copy.detail}</p>
                    <time>{new Date(event.at).toLocaleTimeString()}</time>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <aside className="compiler-authority panel">
          <p className="eyebrow aqua">Who decides what</p>
          <div>
            <span>Codex</span>
            <strong>Proposes the experiment plan</strong>
          </div>
          <div>
            <span>Verifier</span>
            <strong>Rejects invalid or irrelevant plans</strong>
          </div>
          <div>
            <span>Fixed kernel</span>
            <strong>Computes every displayed number</strong>
          </div>
          {repaired && (
            <div className="repair-note">
              <span>Repair is evidence</span>
              <strong>The rejected attempt released no result.</strong>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

export function App() {
  const [mode, setMode] = useState<Mode | null>(null);
  const [stage, setStage] = useState<Stage>("landing");
  const [claim, setClaim] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [prediction, setPrediction] = useState<PredictionChoice | null>(null);
  const [confidence, setConfidence] = useState(72);
  const [reviewStep, setReviewStep] = useState<ReviewStep | null>(null);
  const [replayIntro, setReplayIntro] = useState(false);
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
  const belief = sessionBeliefPresentation(session);
  const effectiveClaim =
    claim ||
    belief?.claim ||
    "The notebook accuracy proves generalization to new customers.";

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

  useEffect(() => {
    const route = parseStudioLocation(window.location.pathname);
    const sessionId =
      route.kind === "session" || route.kind === "proof"
        ? route.id
        : window.localStorage.getItem(storageKeys.sessionId);
    const storedMode = window.localStorage.getItem(
      storageKeys.mode,
    ) as Mode | null;
    const storedClaim = window.localStorage.getItem(storageKeys.claim);

    if (storedMode === "replay" || route.kind === "replay") {
      setMode("replay");
      setReplayIntro(
        window.localStorage.getItem(storageKeys.replayIntro) !== "false",
      );
      setStage(
        window.localStorage.getItem(storageKeys.replayStage) === "reality"
          ? "reality"
          : "build",
      );
      return;
    }

    const routeProvidesSession =
      route.kind === "session" || route.kind === "proof";
    if (sessionId === null || (storedMode === null && !routeProvidesSession)) {
      if (storedMode === "live" || route.kind === "new") {
        setMode("live");
        setStage("live-setup");
        void checkLiveCapabilities();
      }
      return;
    }
    if (storedClaim !== null) setClaim(storedClaim);
    void withRequest(async () => {
      const restored = await counterLabApi.getSession(sessionId);
      setArtifact(await counterLabApi.getArtifact(restored.artifactId));
      setSession(restored);
      setMode(presentationMode(restored.mode));
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
    });
    // Session restoration runs once for the stable browser API client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    resetViewport();
  }, [stage]);

  useEffect(() => {
    const path = studioPath({
      stage,
      mode,
      ...(session === null ? {} : { sessionId: session.sessionId }),
      completed: sessionProofReady(session),
    });
    if (window.location.pathname !== path) {
      window.history.replaceState({}, "", path);
    }
  }, [mode, session, stage]);

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
      void withRequest(async () => {
        await counterLabApi.getReplay("leakage-01");
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

  const restart = () => {
    Object.values(storageKeys).forEach((key) =>
      window.localStorage.removeItem(key),
    );
    clearAllActiveRunnerCheckpoints(window.localStorage);
    setMode(null);
    setStage("landing");
    setClaim("");
    setConfirmed(false);
    setPrediction(null);
    setConfidence(72);
    setReviewStep(null);
    setReplayIntro(false);
    setArtifact(null);
    setSession(null);
    setError(null);
    setAnalysisPreview(null);
    setSensitiveContentApproved(false);
    setRunnerJob(null);
    runner.clear();
  };

  const review = (step: ReviewStep) => {
    setReviewStep(step);
    resetViewport();
  };

  const returnToCurrent = () => {
    setReviewStep(null);
    resetViewport();
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
  };

  const exportCurrentProof = () => {
    if (session === null || !sessionProofReady(session)) return;
    if (session.proofCapsule !== undefined) {
      const anchor = document.createElement("a");
      anchor.href = counterLabApi.proofCapsuleDownloadUrl(session.sessionId);
      anchor.download = "";
      anchor.click();
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
      setClaim("");
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
      setSession(completed);
      setStage("reality");
    });
  };

  const continueReplay = () => {
    window.localStorage.setItem(storageKeys.replayIntro, "false");
    setReplayIntro(false);
  };

  return (
    <div className={`app-frame stage-${stage}`}>
      {replay && <ReplayBanner />}
      <Header
        mode={mode}
        stage={stage}
        reviewStep={reviewStep}
        review={review}
        returnToCurrent={returnToCurrent}
        restart={restart}
      />
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
      {stage === "landing" && <Landing chooseMode={chooseMode} />}
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
            newAnalysis: () => chooseMode("live"),
            showEvidence: () => review("claim"),
            navigateStage: (target) => review(target),
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
              session={session}
              result={session?.verifiedResult ?? sampleResult}
              returnToCurrent={returnToCurrent}
              restart={restart}
            />
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
            (replayIntro ? (
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
                      <dd>{verifiedReplay.id}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{verifiedReplay.model}</dd>
                    </div>
                    <div>
                      <dt>Verifier</dt>
                      <dd>{verifiedReplay.verifier}</dd>
                    </div>
                    <div>
                      <dt>Commit</dt>
                      <dd>{verifiedReplay.commit}</dd>
                    </div>
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
              <BuildScreen mode={mode} openResult={openResult} />
            ))}
          {reviewStep === null && stage === "reality" && (
            <RealityScreen
              claim={effectiveClaim}
              prediction={prediction ?? "stays-high"}
              result={session?.verifiedResult ?? sampleResult}
              session={session}
              artifact={artifact}
              updateSession={setSession}
            />
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
      <footer className="footer shell">
        <span>
          <strong>CounterLab</strong> · learn from a fair test
        </span>
        <span>Chatbots explain. CounterLab lets reality answer.</span>
        <span>Education demo · Jupyter notebooks</span>
      </footer>
    </div>
  );
}
