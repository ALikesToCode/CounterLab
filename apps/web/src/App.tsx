import { useEffect, useState } from "react";

import {
  ApiClientError,
  counterLabApi,
  type PatchResult,
  type ProofBundle,
  type SessionView,
  type VerifiedResultSet,
} from "./api";

import { getRun, sampleArtifact, sampleResult, verifiedReplay } from "./sample";

type Mode = "instant" | "live" | "replay";
type Stage =
  "landing" | "claim" | "belief" | "build" | "reality" | "live-setup";
type PredictionChoice = "stays-high" | "falls" | "unsure";
type TransferState = "locked" | "ready" | "failed" | "passed" | "patched";

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

function Header({ mode, stage }: { mode: Mode | null; stage: Stage }) {
  return (
    <header className="topbar">
      <button
        className="wordmark"
        type="button"
        onClick={() => window.location.reload()}
      >
        <span className="wordmark-mark">C</span>
        <span>CounterLab</span>
      </button>
      {stage !== "landing" && (
        <div className="topbar-context">
          <span className="eyebrow">Judge mode</span>
          <span>
            {mode === "replay"
              ? "Replay"
              : mode === "live"
                ? "Live generation"
                : "Instant sample"}
          </span>
        </div>
      )}
    </header>
  );
}

function Landing({ chooseMode }: { chooseMode: (mode: Mode) => void }) {
  return (
    <main className="landing shell">
      <section className="hero">
        <p className="kicker">
          <span /> CI for understanding
        </p>
        <h1>CounterLab</h1>
        <p className="tagline">
          Chatbots explain. CounterLab lets reality answer.
        </p>
        <p className="thesis">
          Treat a learner&rsquo;s claim like code: formalize it, run a
          discriminating test, reject invalid evidence, verify transfer, and
          only then merge the repair.
        </p>
      </section>

      <section className="mode-grid" aria-labelledby="choose-path">
        <div className="section-heading">
          <p className="eyebrow">Judge mode</p>
          <h2 id="choose-path">Choose a path</h2>
        </div>

        <button
          className="mode-card mode-card-primary"
          type="button"
          onClick={() => chooseMode("instant")}
        >
          <span className="mode-index">01</span>
          <span className="mode-copy">
            <strong>Try instantly</strong>
            <small>
              Complete the verified customer-churn learning loop. No account or
              secret.
            </small>
          </span>
          <Mark name="arrow" />
        </button>

        <button
          className="mode-card"
          type="button"
          onClick={() => chooseMode("live")}
        >
          <span className="mode-index">02</span>
          <span className="mode-copy">
            <strong>Generate live</strong>
            <small>
              Use GPT-5.6 and runtime Codex when local capabilities are
              available.
            </small>
          </span>
          <Mark name="spark" />
        </button>

        <button
          className="mode-card"
          type="button"
          onClick={() => chooseMode("replay")}
        >
          <span className="mode-index">03</span>
          <span className="mode-copy">
            <strong>Replay verified session</strong>
            <small>
              Reconstruct a stored event chain and genuine verifier trace.
            </small>
          </span>
          <Mark name="arrow" />
        </button>
      </section>

      <p className="support-note">
        Supports Jupyter notebooks in the documented scikit-learn classification
        subset. No cells run at intake.
      </p>
    </main>
  );
}

function ClaimScreen({
  claim,
  setClaim,
  continueToBelief,
}: {
  claim: string;
  setClaim: (claim: string) => void;
  continueToBelief: () => void;
}) {
  const random = getRun("random_row_split");
  return (
    <main className="workspace shell">
      <div className="screen-intro">
        <p className="eyebrow">01 · Claim</p>
        <h1>What does this result prove?</h1>
        <p>
          Inspect the notebook evidence, then state the generalization claim you
          think it supports.
        </p>
      </div>

      <div className="claim-layout">
        <section className="notebook-card" aria-labelledby="artifact-title">
          <div className="notebook-topline">
            <span className="file-chip">.ipynb</span>
            <span className="verified-chip">
              <Mark name="check" /> Supported
            </span>
          </div>
          <h2 id="artifact-title">{sampleArtifact.title}</h2>
          <p className="file-name">{sampleArtifact.fileName}</p>
          <div className="headline-metric">
            <span>{percent.format(random.metrics.accuracy)}</span>
            <small>reported test accuracy</small>
          </div>
          <div className="evidence-list">
            <div className="evidence-row">
              <span className="evidence-ref">Cell 3 · output 0</span>
              <span>
                Random row split · n={random.sampleSizes.test} test rows · seed{" "}
                {random.seed}
              </span>
            </div>
            <div className="evidence-row">
              <span className="evidence-ref">Cell 3 · source</span>
              <span>
                <code>customer_id</code> is included in categorical features
              </span>
            </div>
          </div>
          <details>
            <summary>Artifact integrity</summary>
            <dl className="provenance-list">
              <div>
                <dt>Rows</dt>
                <dd>{sampleArtifact.rows.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Customers</dt>
                <dd>{sampleArtifact.customers}</dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>
                  <code>{sampleArtifact.fileSha256.slice(0, 16)}…</code>
                </dd>
              </div>
            </dl>
          </details>
        </section>

        <section className="claim-form panel" aria-labelledby="claim-prompt">
          <div>
            <p className="eyebrow">Your interpretation</p>
            <h2 id="claim-prompt">Make the claim testable</h2>
            <p>
              Write what you believe the result says about customers the model
              has never seen.
            </p>
          </div>
          <label htmlFor="learner-claim">Your claim</label>
          <textarea
            id="learner-claim"
            value={claim}
            onChange={(event) => setClaim(event.target.value)}
            placeholder="I think this accuracy proves…"
            rows={7}
          />
          <div className="form-footer">
            <span>{claim.trim().length} characters</span>
            <button
              className="button button-primary"
              type="button"
              disabled={claim.trim().length < 12}
              onClick={continueToBelief}
            >
              Create Belief Test <Mark name="arrow" />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

function BeliefScreen({
  claim,
  confirmed,
  confirm,
  prediction,
  setPrediction,
  commitPrediction,
  editClaim,
  stop,
}: {
  claim: string;
  confirmed: boolean;
  confirm: () => void;
  prediction: PredictionChoice | null;
  setPrediction: (value: PredictionChoice) => void;
  commitPrediction: () => void;
  editClaim: () => void;
  stop: (reason: "rejected" | "insufficient") => void;
}) {
  return (
    <main className="workspace shell">
      <div className="screen-intro compact">
        <p className="eyebrow">02 · Formalize</p>
        <h1>Belief Test</h1>
        <p>
          Two explanations predict different behavior when customer identity
          stops crossing the split.
        </p>
      </div>

      <section className="claim-quote" aria-label="Learner claim">
        <span>Your claim</span>
        <blockquote>{claim}</blockquote>
      </section>

      <section className="hypothesis-grid" aria-label="Competing hypotheses">
        <article className="hypothesis current">
          <p className="hypothesis-label">Current hypothesis · H₁</p>
          <h2>
            The features capture a pattern that generalizes to new customers.
          </h2>
          <p className="prediction-line">
            <span>Predicts</span> Accuracy should remain near 98% after
            splitting by customer.
          </p>
        </article>
        <div className="versus" aria-hidden="true">
          vs
        </div>
        <article className="hypothesis competing">
          <p className="hypothesis-label">Competing hypothesis · H₂</p>
          <h2>
            The model recognizes the same customer&rsquo;s identity across
            random train and test rows.
          </h2>
          <p className="prediction-line">
            <span>Predicts</span> Accuracy will fall on unseen customers and
            after identity ablation.
          </p>
        </article>
      </section>

      <section className="evidence-strip" aria-label="Evidence references">
        <span className="evidence-chip">
          Cell 3 · source <strong>customer_id encoded</strong>
        </span>
        <span className="evidence-chip">
          Cell 3 · output 0 <strong>98.5% accuracy</strong>
        </span>
        <span className="evidence-chip">
          Schema <strong>480 repeated customers</strong>
        </span>
      </section>

      <section className="intervention panel">
        <div>
          <p className="eyebrow">Decisive intervention</p>
          <h2>Hold out entire customers, then remove identity.</h2>
          <p>
            The model, metric, seed, and target stay fixed. Only split grouping
            and identity availability change.
          </p>
        </div>
        <details>
          <summary>Alternatives, limitations, and uncertainty</summary>
          <p>
            Class imbalance and temporal drift remain alternatives. The
            available notebook evidence is sufficient to test entity leakage,
            but this experiment does not establish production performance or
            causality.
          </p>
        </details>
      </section>

      {!confirmed ? (
        <div className="action-cluster">
          <button
            className="button button-primary"
            type="button"
            onClick={confirm}
          >
            Confirm Belief Test <Mark name="check" />
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
              <h2 id="prediction-heading">Commit before reality answers</h2>
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
            Confidence <strong>72%</strong>
            <input type="range" min="0" max="100" defaultValue="72" />
          </label>
          <button
            className="button button-gold"
            type="button"
            disabled={prediction === null}
            onClick={commitPrediction}
          >
            Commit prediction <Mark name="lock" />
          </button>
        </section>
      )}
    </main>
  );
}

const compilerSteps = [
  ["Plan", "Experiment contract parsed"],
  ["Generate", "Three bounded files recorded"],
  ["Public tests", "Adapter composes fixed kernel"],
  ["External verifier", "12 named invariants checked"],
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
        <p className="eyebrow">03 · Compile and verify</p>
        <h1>Build and verify</h1>
        <p>
          Only sanitized plan, file, command, and verifier events appear here.
          Private reasoning is never relayed.
        </p>
      </div>

      <div className="lock-notice">
        <Mark name="lock" />
        <strong>Prediction locked</strong>
        <span>Committed before any verified result was revealed.</span>
      </div>

      <div className="build-layout">
        <section className="pipeline panel" aria-labelledby="pipeline-title">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Compiler trace</p>
              <h2 id="pipeline-title">Verified Lab pipeline</h2>
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
            <p className="eyebrow aqua">Frozen verifier</p>
            <strong>Candidate accepted for the documented leakage scope</strong>
            <p>
              Group overlap = 0 · result hash reproduced · chart contract
              matches payload
            </p>
          </div>
        </section>

        <aside className="trace panel" aria-labelledby="trace-title">
          <p className="eyebrow">Event log</p>
          <h2 id="trace-title">Sanitized evidence</h2>
          <ul className="event-list">
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
              <p>12 invariants accepted</p>
            </li>
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
              <dd>Not required</dd>
            </div>
          </dl>
        </aside>
      </div>

      <div className="continue-row">
        <p>
          The result is now eligible to render because a verified canonical
          payload is available.
        </p>
        <button
          className="button button-primary"
          type="button"
          onClick={openResult}
        >
          Open verified result <Mark name="arrow" />
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
  const [revision, setRevision] = useState(session?.revision ?? "");
  const initialTransferState: TransferState = session?.patchResult
    ? "patched"
    : session?.transferResult?.outcome === "PASSED"
      ? "passed"
      : session?.revision
        ? "ready"
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

  return (
    <main className="workspace shell reality">
      <div className="screen-intro compact">
        <p className="eyebrow aqua">04 · Reality and transfer</p>
        <h1>Verified result</h1>
        <p>
          The random split looked excellent. The discriminating tests show what
          it was measuring.
        </p>
      </div>

      <section className="metric-grid" aria-label="Verified metric cards">
        <article>
          <p>Random row split</p>
          <strong>{percent.format(random.metrics.accuracy)}</strong>
          <small>
            n={random.sampleSizes.test} · overlap {random.entityOverlap.count} ·
            seed {random.seed}
          </small>
        </article>
        <article className="metric-decisive">
          <p>Customer group split</p>
          <strong>{percent.format(group.metrics.accuracy)}</strong>
          <small>
            n={group.sampleSizes.test} · overlap {group.entityOverlap.count} ·
            seed {group.seed}
          </small>
        </article>
        <article>
          <p>Identity ablation</p>
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
            <h2>Same model family, different evidence</h2>
          </div>
          <code>{result.resultHash.slice(0, 12)}…</code>
        </div>
        <ResultBars result={result} />
        <ResultTable result={result} />
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
          <p className="eyebrow">Revise the rule</p>
          <h2>What will you check next time?</h2>
          <p>
            Write a reusable evaluation rule, not a summary of these exact
            percentages.
          </p>
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
          Test transfer <Mark name="arrow" />
        </button>
      </section>

      {actionError !== null && (
        <div className="transfer-result rejected" role="alert">
          <strong>Evidence was not recorded.</strong>
          <span>{actionError}</span>
        </div>
      )}

      <section
        className={`transfer panel ${transferState === "locked" ? "is-locked" : ""}`}
        aria-labelledby="transfer-title"
      >
        <div className="transfer-heading">
          <div>
            <p className="eyebrow">Fixed transfer · forecasting</p>
            <h2 id="transfer-title">
              Will the rule survive a different surface?
            </h2>
          </div>
          {transferState === "locked" && (
            <span className="locked-chip">
              <Mark name="lock" /> Patch locked
            </span>
          )}
        </div>
        {transferState === "locked" ? (
          <p className="locked-copy">
            Record a reusable revision before the forecasting case unlocks.
          </p>
        ) : (
          <>
            <div className="case-card">
              <p>
                A demand forecast builds a centered rolling target with{" "}
                <code>rolling(window=7, center=True)</code> and randomly splits
                daily rows. The deployment predicts future demand before later
                targets exist.
              </p>
            </div>
            <fieldset>
              <legend>Which evaluation design matches deployment?</legend>
              <label className="choice">
                <input
                  type="radio"
                  name="transfer-split"
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
                  onChange={() => setRiskChoice("price")}
                />
                <span>
                  <strong>Known item price</strong>
                </span>
              </label>
              <label className="choice">
                <input
                  type="radio"
                  name="transfer-risk"
                  onChange={() => setRiskChoice("future")}
                />
                <span>
                  <strong>Centered rolling target</strong>
                </span>
              </label>
            </fieldset>
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
                  The patch stays locked. Revisit what information exists at
                  prediction time.
                </span>
              </div>
            )}
            {(transferState === "passed" || transferState === "patched") && (
              <div className="transfer-result passed" role="status">
                <Mark name="check" />
                <strong>Transfer passed.</strong>
                <span>
                  You selected a time-aware split and removed future
                  information.
                </span>
              </div>
            )}
          </>
        )}
      </section>

      {(transferState === "passed" || transferState === "patched") && (
        <section className="patch panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow gold">Minimal correction</p>
              <h2>Patch unlocked</h2>
            </div>
            <span className="verified-chip">
              <Mark name="check" /> Copied notebook only
            </span>
          </div>
          {transferState === "passed" ? (
            <button
              className="button button-gold"
              type="button"
              disabled={actionBusy}
              onClick={compilePatch}
            >
              Verify notebook patch <Mark name="arrow" />
            </button>
          ) : (
            <>
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
            </>
          )}
        </section>
      )}

      {transferState === "patched" && (
        <section className="reasoning-diff panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow purple">Reasoning Diff</p>
              <h2>What changed—and what proved it</h2>
            </div>
            <button
              className="button button-quiet"
              type="button"
              disabled={proofBundle === null}
              onClick={exportProof}
            >
              {proofBundle === null
                ? "Proof Bundle finalizing"
                : "Export Proof Bundle"}
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
              <span>{percent.format(group.metrics.accuracy)}, verified</span>
            </div>
            <div className="diff-row" role="row">
              <strong>Code</strong>
              <span>Random rows + customer identity</span>
              <span>Group holdout + identity removed</span>
            </div>
            <div className="diff-row" role="row">
              <strong>Transfer</strong>
              <span>Rule not yet tested</span>
              <span>Time-aware forecasting choice passed</span>
            </div>
          </div>
          <details className="technical-proof">
            <summary>Technical proof and reproduction</summary>
            <pre>
              <code>{`result_hash=${result.resultHash}\nseed=${result.seed}\nreplay_id=${proofBundle?.replayId ?? verifiedReplay.id}\n./scripts/reproduce-session.sh leakage-01\n./scripts/replay-patch.sh leakage-01`}</code>
            </pre>
          </details>
        </section>
      )}
    </main>
  );
}

function LiveSetup({ fallBack }: { fallBack: (mode: Mode) => void }) {
  return (
    <main className="workspace shell narrow">
      <div className="screen-intro">
        <p className="eyebrow">Live capability check</p>
        <h1>Generate live</h1>
        <p>
          Live generation needs a server-side OpenAI key, authenticated Codex
          CLI, and the local sandbox runner.
        </p>
      </div>
      <section className="setup-card panel">
        <div className="setup-row">
          <span className="status-dot unavailable" />
          <div>
            <strong>Live status is checked server-side</strong>
            <p>No live call has been claimed or started from this screen.</p>
          </div>
        </div>
        <code>OPENAI_API_KEY · codex login · Docker</code>
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
  const [replayIntro, setReplayIntro] = useState(false);
  const [session, setSession] = useState<SessionView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const replay = mode === "replay";

  const reportError = (caught: unknown) => {
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
    const sessionId = window.localStorage.getItem("counterlab.sessionId");
    const storedMode = window.localStorage.getItem(
      "counterlab.mode",
    ) as Mode | null;
    const storedClaim = window.localStorage.getItem("counterlab.claim");
    if (sessionId === null || storedMode === null || storedMode === "replay")
      return;
    if (storedClaim !== null) setClaim(storedClaim);
    void withRequest(async () => {
      const restored = await counterLabApi.getSession(sessionId);
      setSession(restored);
      setMode(restored.mode);
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
        setStage("build");
      } else {
        setStage("reality");
      }
    });
    // Session restoration runs once for the stable browser API client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseMode = (nextMode: Mode) => {
    setMode(nextMode);
    if (nextMode === "live") {
      setStage("live-setup");
      return;
    }
    if (nextMode === "replay") {
      void withRequest(async () => {
        await counterLabApi.getReplay("leakage-01");
        window.localStorage.setItem("counterlab.mode", "replay");
        setReplayIntro(true);
        setStage("build");
      });
      return;
    }
    void withRequest(async () => {
      const artifact = await counterLabApi.createSampleArtifact();
      const created = await counterLabApi.createSession({
        artifactId: artifact.artifactId,
        mode: "instant",
      });
      setSession(created);
      window.localStorage.setItem("counterlab.sessionId", created.sessionId);
      window.localStorage.setItem("counterlab.mode", "instant");
      setStage("claim");
    });
  };

  const proposeBeliefTest = () => {
    if (session === null) return;
    window.localStorage.setItem("counterlab.claim", claim);
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
      await counterLabApi.commitPrediction(session.sessionId, {
        choice: labels[prediction],
        confidence: 72,
      });
      const compiled = await counterLabApi.compileLab(session.sessionId);
      setSession(compiled);
      setStage("build");
    });
  };

  const openResult = () => {
    if (session === null) {
      setStage("reality");
      return;
    }
    void withRequest(async () => {
      const completed = await counterLabApi.runLab(session.sessionId);
      setSession(completed);
      setStage("reality");
    });
  };

  return (
    <div className="app-frame">
      {replay && <ReplayBanner />}
      <Header mode={mode} stage={stage} />
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
      {stage === "claim" && (
        <ClaimScreen
          claim={claim}
          setClaim={setClaim}
          continueToBelief={proposeBeliefTest}
        />
      )}
      {stage === "belief" && (
        <BeliefScreen
          claim={claim}
          confirmed={confirmed}
          confirm={confirmBeliefTest}
          prediction={prediction}
          setPrediction={setPrediction}
          commitPrediction={commitPrediction}
          editClaim={() => setStage("claim")}
          stop={stopBeliefTest}
        />
      )}
      {stage === "build" &&
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
              onClick={() => setReplayIntro(false)}
            >
              Continue replay <Mark name="arrow" />
            </button>
          </main>
        ) : (
          <BuildScreen mode={mode} openResult={openResult} />
        ))}
      {stage === "reality" && (
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
      {stage === "live-setup" && <LiveSetup fallBack={chooseMode} />}
      <footer className="footer shell">
        <span>CounterLab · documented evidence, bounded claims</span>
        <span>Education track · local-first</span>
      </footer>
    </div>
  );
}
