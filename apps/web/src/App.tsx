import { useEffect, useLayoutEffect, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type ArtifactView,
  type BeliefTest,
  type CapabilityHealth,
  type PatchResult,
  type ProofBundle,
  type SessionView,
  type VerifiedResultSet,
} from "./api";

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
type TransferState = "locked" | "ready" | "failed" | "passed" | "patched";
type ReviewStep = "claim" | "belief" | "build" | "reality";

const storageKeys = {
  sessionId: "counterlab.sessionId",
  mode: "counterlab.mode",
  claim: "counterlab.claim",
  replayStage: "counterlab.replayStage",
  replayIntro: "counterlab.replayIntro",
  replayTransferState: "counterlab.replayTransferState",
  replayRevision: "counterlab.replayRevision",
} as const;

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
            <span>Interactive lesson</span> · about 3 minutes
          </p>
          <h2>A model scored 98.5%. Can you trust it?</h2>
          <p className="learning-promise">
            CounterLab is a guided lesson: make a prediction, watch a fairer
            test, then use the rule on a new problem.
          </p>
          <div className="learning-actions">
            <button
              className="button lesson-primary"
              type="button"
              aria-label="Start the 3-minute lesson — Try instantly"
              onClick={() => chooseMode("instant")}
            >
              Start the 3-minute lesson <Mark name="arrow" />
            </button>
          </div>
          <div className="lesson-trust" aria-label="Lesson details">
            <span>
              <Mark name="check" /> No account needed
            </span>
            <span>
              <Mark name="check" /> Real results, not a quiz answer
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

      <section className="lesson-steps shell" aria-label="How the lesson works">
        {[
          ["1", "Make a prediction", "Say what you expect before results."],
          ["2", "See the evidence", "Compare the old test with a fairer one."],
          [
            "3",
            "Apply the lesson",
            "Solve a different case to unlock the fix.",
          ],
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
          <span>Already know the lesson?</span>
          <p>Bring a notebook or inspect a recorded run.</p>
        </div>
        <div className="simple-mode-grid">
          <button
            className="simple-mode-card"
            type="button"
            aria-label="Test my notebook — Generate live"
            onClick={() => chooseMode("live")}
          >
            <span className="path-icon">A</span>
            <strong>Test my notebook</strong>
            <small>Supported Jupyter notebooks</small>
            <span>
              Check support <Mark name="arrow" />
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
          Today CounterLab teaches two machine-learning mistakes in supported
          Jupyter notebooks. Uploaded cells are read, never run.
        </p>
      </section>
    </main>
  );
}

function ClaimScreen({
  artifact,
  claim,
  setClaim,
  continueToBelief,
  uploadNotebook,
  busy,
}: {
  artifact: ArtifactView | null;
  claim: string;
  setClaim: (claim: string) => void;
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
              setClaim(
                "I think the high score means the model will work for completely new customers.",
              )
            }
          >
            <Mark name="spark" /> Use a starter claim
          </button>
          <textarea
            id="learner-claim"
            value={claim}
            onChange={(event) => setClaim(event.target.value)}
            placeholder="I think this score means the model will work for…"
            rows={7}
          />
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
        </section>
      </div>
    </main>
  );
}

function BeliefScreen({
  claim,
  beliefTest,
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
  beliefTest?: BeliefTest | undefined;
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
  const currentHypothesis =
    "The model learned a useful pattern that will work for new customers.";
  const currentPrediction = "The score stays close to 98% for new customers.";
  const competingHypothesis =
    "The model partly remembers customers it already saw.";
  const competingPrediction =
    "The score drops for new customers and without customer ID.";

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
          <p className="hypothesis-label">Idea A · A useful pattern</p>
          <h2>{currentHypothesis}</h2>
          <p className="prediction-line">
            <span>Predicts</span> {currentPrediction}
          </p>
          {beliefTest !== undefined && (
            <details className="analyst-wording">
              <summary>Show exact analyst wording</summary>
              <p>{beliefTest.currentHypothesis.statement}</p>
              <p>{beliefTest.currentHypothesis.predictedOutcome}</p>
            </details>
          )}
        </article>
        <div className="versus" aria-hidden="true">
          vs
        </div>
        <article className="hypothesis competing">
          <p className="hypothesis-label">Idea B · Customer memory</p>
          <h2>{competingHypothesis}</h2>
          <p className="prediction-line">
            <span>Predicts</span> {competingPrediction}
          </p>
          {beliefTest !== undefined && (
            <details className="analyst-wording">
              <summary>Show exact analyst wording</summary>
              <p>{beliefTest.competingHypothesis.statement}</p>
              <p>{beliefTest.competingHypothesis.predictedOutcome}</p>
            </details>
          )}
        </article>
      </section>

      <section className="evidence-strip" aria-label="Evidence references">
        {beliefTest === undefined ? (
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
          beliefTest.evidenceRefs.slice(0, 3).map((evidence) => (
            <span className="evidence-chip" key={evidence.hash}>
              {evidence.cellIndex === undefined
                ? evidence.kind
                : `Cell ${evidence.cellIndex}${
                    evidence.outputIndex === undefined
                      ? " · source"
                      : ` · output ${evidence.outputIndex}`
                  }`}{" "}
              <strong>
                {evidence.outputIndex !== undefined
                  ? "98.5% score shown"
                  : evidence.kind === "schema"
                    ? "customer ID marks who must stay together"
                    : "random split uses customer ID"}
              </strong>
            </span>
          ))
        )}
      </section>

      <section className="intervention panel">
        <div>
          <p className="eyebrow">The fairer test</p>
          <h2>
            Keep each customer&apos;s rows together, then remove customer ID.
          </h2>
          <p>
            We keep the model the same. We change who appears in the test, then
            check what happens without customer ID.
          </p>
        </div>
        <details>
          <summary>Alternatives, limitations, and uncertainty</summary>
          <p>
            {beliefTest === undefined
              ? "Class imbalance and temporal drift remain alternatives. The available notebook evidence is sufficient to test entity leakage, but this experiment does not establish production performance or causality."
              : `${beliefTest.alternatives
                  .map(
                    (alternative) =>
                      `${alternative.label}: ${alternative.rationale}`,
                  )
                  .join(" ")} ${beliefTest.uncertainty.limitations.join(" ")}`}
          </p>
        </details>
      </section>

      <details className="concept-help panel">
        <summary>Why can this test teach us something?</summary>
        <p>
          If the model learned a reusable pattern, the score should stay high.
          If it remembers customers, the score should fall. The two ideas now
          predict different outcomes.
        </p>
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
            <legend>If we hold out entire customers, accuracy will…</legend>
            <label className="choice">
              <input
                type="radio"
                name="prediction"
                checked={prediction === "stays-high"}
                onChange={() => setPrediction("stays-high")}
              />
              <span>
                <strong>Remain near 98%</strong>
                <small>The notebook result reflects a reusable signal.</small>
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
                <strong>Fall materially</strong>
                <small>
                  The random split is benefiting from repeated identities.
                </small>
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

function resultRun(result: VerifiedResultSet, id: string) {
  const run = result.runs.find((candidate) => candidate.id === id);
  if (run === undefined)
    throw new Error(`Verified result is missing run ${id}`);
  return run;
}

function ResultBars({ result }: { result: VerifiedResultSet }) {
  const runs = [
    resultRun(result, "random_row_split"),
    resultRun(result, "customer_group_split"),
    resultRun(result, "identity_ablation"),
  ];
  return (
    <div
      className="result-visual"
      role="img"
      aria-label="Accuracy comparison: random row split 98.5 percent, customer group split 59.4 percent, and identity ablation 67.4 percent"
    >
      {runs.map((run) => (
        <div className="bar-row" key={run.id}>
          <span>
            {run.id === "random_row_split"
              ? "Random rows"
              : run.id === "customer_group_split"
                ? "New customers"
                : "No identity"}
          </span>
          <div className="bar-track">
            <span style={{ width: percent.format(run.metrics.accuracy) }} />
          </div>
          <strong>{percent.format(run.metrics.accuracy)}</strong>
        </div>
      ))}
    </div>
  );
}

function ResultTable({ result }: { result: VerifiedResultSet }) {
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
  const random = resultRun(result, "random_row_split");
  const group = resultRun(result, "customer_group_split");
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
                {session?.beliefTest?.currentHypothesis.statement ??
                  "The score reflects a reusable pattern."}
              </strong>
            </article>
            <article>
              <span>Story B</span>
              <strong>
                {session?.beliefTest?.competingHypothesis.statement ??
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

function RealityScreen({
  claim,
  prediction,
  result,
  session,
  updateSession,
}: {
  claim: string;
  prediction: PredictionChoice;
  result: VerifiedResultSet;
  session: SessionView | null;
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
      setPatch(updated.patch);
      updateSession(updated);
      setTransferState("patched");
      try {
        setProofBundle(await counterLabApi.getProofBundle(session.sessionId));
      } catch (caught) {
        if (!(caught instanceof ApiClientError && caught.status === 409)) {
          throw caught;
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
    anchor.download = `counterlab-${proofBundle.replayId}-proof-bundle.json`;
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
            <button
              className="button button-quiet"
              type="button"
              disabled={proofBundle === null}
              onClick={exportProof}
            >
              {proofBundle === null ? "Preparing proof" : "Download proof"}
            </button>
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

      {actionErrorNotice}
    </main>
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
              <span className="status-dot pending" />
              <div>
                <strong>A local runner is needed for the final lab</strong>
                <p>
                  You can review the notebook and make a prediction here. The
                  checked experiment runs only on a separately protected device.
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

function LiveCompileBoundary({ fallBack }: { fallBack: (mode: Mode) => void }) {
  return (
    <main className="workspace shell narrow">
      <div className="screen-intro">
        <p className="eyebrow">03 · Compile and verify</p>
        <h1>Local runner required</h1>
        <p>
          Your Prediction Contract is committed. This Cloudflare session does
          not have the isolated local compiler, kernel, and sandbox required to
          authorize a Verified Lab.
        </p>
      </div>
      <section className="setup-card panel">
        <div className="setup-row">
          <span className="status-dot unavailable" />
          <div>
            <strong>Compilation did not start</strong>
            <p>
              No lab result was produced. Continue with an offline verified
              path, or run the documented local stack.
            </p>
          </div>
        </div>
      </section>
      <div className="action-cluster">
        <button
          className="button button-primary"
          type="button"
          onClick={() => fallBack("instant")}
        >
          Try instantly
        </button>
        <button
          className="button button-quiet"
          type="button"
          onClick={() => fallBack("replay")}
        >
          Replay verified session
        </button>
      </div>
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
  const replay = mode === "replay";

  const reportError = (caught: unknown) => {
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

  useEffect(() => {
    const sessionId = window.localStorage.getItem(storageKeys.sessionId);
    const storedMode = window.localStorage.getItem(
      storageKeys.mode,
    ) as Mode | null;
    const storedClaim = window.localStorage.getItem(storageKeys.claim);

    if (storedMode === "replay") {
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

    if (sessionId === null || storedMode === null) {
      if (storedMode === "live") {
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
      setMode(restored.mode);
      if (restored.prediction !== undefined) {
        const savedChoice = restored.prediction.choice.toLowerCase();
        setPrediction(
          savedChoice.includes("fall")
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
        setStage(
          restored.mode === "live" && restored.verifiedResult === undefined
            ? "live-compile"
            : "build",
        );
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
      const created = await counterLabApi.createSession({
        artifactId: sample.artifactId,
        mode: "instant",
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
  };

  const review = (step: ReviewStep) => {
    setReviewStep(step);
    resetViewport();
  };

  const returnToCurrent = () => {
    setReviewStep(null);
    resetViewport();
  };

  const startLiveSession = () => {
    if (liveHealth?.liveGpt !== "configured") return;
    void withRequest(async () => {
      const sample = await counterLabApi.createSampleArtifact();
      const created = await counterLabApi.createSession({
        artifactId: sample.artifactId,
        mode: "live",
      });
      setArtifact(sample);
      setSession(created);
      setClaim("");
      setConfirmed(false);
      setPrediction(null);
      setConfidence(72);
      window.localStorage.setItem(storageKeys.sessionId, created.sessionId);
      window.localStorage.setItem(storageKeys.mode, "live");
      setStage("claim");
    });
  };

  const uploadNotebook = (file: File) => {
    void withRequest(async () => {
      const uploaded = await counterLabApi.uploadArtifact(file);
      setArtifact(uploaded);
      setSession(null);
      window.localStorage.removeItem(storageKeys.sessionId);
      if (uploaded.support.status !== "SUPPORTED") return;
      const created = await counterLabApi.createSession({
        artifactId: uploaded.artifactId,
        mode: "instant",
      });
      setSession(created);
      window.localStorage.setItem(storageKeys.sessionId, created.sessionId);
      window.localStorage.setItem(storageKeys.mode, "instant");
    });
  };

  const proposeBeliefTest = () => {
    if (session === null) return;
    window.localStorage.setItem(storageKeys.claim, claim);
    void withRequest(async () => {
      const updated = await counterLabApi.proposeBeliefTest(session.sessionId, {
        learnerClaim: claim,
      });
      setSession(updated);
      setStage("belief");
    });
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
    const labels: Record<PredictionChoice, string> = {
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
        setStage("live-compile");
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
      {reviewStep !== null && (
        <ReviewScreen
          step={reviewStep}
          claim={
            claim ||
            "The notebook accuracy proves generalization to new customers."
          }
          session={session}
          result={session?.verifiedResult ?? sampleResult}
          returnToCurrent={returnToCurrent}
          restart={restart}
        />
      )}
      {reviewStep === null && stage === "landing" && (
        <Landing chooseMode={chooseMode} />
      )}
      {reviewStep === null && stage === "claim" && (
        <ClaimScreen
          artifact={artifact}
          claim={claim}
          setClaim={setClaim}
          continueToBelief={proposeBeliefTest}
          uploadNotebook={uploadNotebook}
          busy={busy}
        />
      )}
      {reviewStep === null && stage === "belief" && (
        <BeliefScreen
          claim={claim}
          beliefTest={session?.beliefTest}
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
                This path reconstructs recorded events and computed payloads. It
                is not a live model run.
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
          claim={
            claim ||
            "The notebook accuracy proves generalization to new customers."
          }
          prediction={prediction ?? "stays-high"}
          result={session?.verifiedResult ?? sampleResult}
          session={session}
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
        <LiveCompileBoundary fallBack={chooseMode} />
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
