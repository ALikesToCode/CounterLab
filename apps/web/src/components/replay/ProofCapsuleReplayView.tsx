import type { PublicReplayProjectionV1 } from "@counterlab/contracts";

import styles from "./ProofCapsuleReplayView.module.css";

const percentage = new Intl.NumberFormat("en", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const dateTime = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

const replayStages = [
  { id: "replay-question", label: "Question" },
  { id: "replay-prediction", label: "Prediction" },
  { id: "replay-test", label: "Test" },
  { id: "replay-boundary", label: "Boundary" },
  { id: "replay-apply", label: "Apply" },
  { id: "replay-repair", label: "Repair" },
] as const;

type PublicBoundaryCell =
  PublicReplayProjectionV1["boundary"]["result"]["cells"][number];

function humanize(value: string): string {
  return value
    .replace(/^(?:leakage|imbalance)\./u, "")
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function recordedDate(value: string): string {
  return dateTime.format(new Date(value));
}

function ResultTable({ replay }: { replay: PublicReplayProjectionV1 }) {
  const result = replay.test.result;

  if (result.concept === "entity_leakage") {
    return (
      <div className={styles.tableWrap}>
        <table>
          <caption>
            Fixed-kernel evaluation runs from this artifact. Accuracy is a
            proportion; shared entities are counted between train and test.
          </caption>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Split</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Test rows</th>
              <th scope="col">Shared entities</th>
              <th scope="col">Seed</th>
            </tr>
          </thead>
          <tbody>
            {result.runs.map((run) => (
              <tr key={run.id}>
                <th scope="row">{humanize(run.operation)}</th>
                <td>{humanize(run.splitStrategy)}</td>
                <td>{percentage.format(run.metrics.accuracy)}</td>
                <td>{run.sampleSizes.test.toLocaleString()}</td>
                <td>
                  {run.entityOverlap.count.toLocaleString()} (
                  {percentage.format(run.entityOverlap.rate)})
                </td>
                <td>{run.seed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table>
        <caption>
          Fixed-kernel rare-event runs. Every class-specific metric comes from
          the stored verified result, not notebook headline text.
        </caption>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Threshold</th>
            <th scope="col">Accuracy</th>
            <th scope="col">Precision</th>
            <th scope="col">Recall</th>
            <th scope="col">F1</th>
            <th scope="col">PR-AUC</th>
            <th scope="col">Test rows</th>
          </tr>
        </thead>
        <tbody>
          {result.runs.map((run) => (
            <tr key={run.id}>
              <th scope="row">{humanize(run.operation)}</th>
              <td>{run.threshold.toFixed(2)}</td>
              <td>{percentage.format(run.metrics.accuracy)}</td>
              <td>{percentage.format(run.metrics.precision)}</td>
              <td>{percentage.format(run.metrics.recall)}</td>
              <td>{percentage.format(run.metrics.f1)}</td>
              <td>{run.metrics.prAuc.toFixed(3)}</td>
              <td>{run.sampleSizes.test.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function resultHeadline(replay: PublicReplayProjectionV1): {
  eyebrow: string;
  value: string;
  context: string;
} {
  const result = replay.test.result;
  if (result.concept === "entity_leakage") {
    const random = result.runs.find(
      (run) => run.operation === "leakage.random_row_split",
    );
    const group = result.runs.find(
      (run) => run.operation === "leakage.group_holdout",
    );
    return {
      eyebrow: "Whole-entity holdout",
      value:
        group === undefined
          ? "Verified"
          : percentage.format(group.metrics.accuracy),
      context:
        random === undefined || group === undefined
          ? "The stored fixed-kernel runs passed the independent verifier."
          : `${percentage.format(random.metrics.accuracy)} on random rows became ${percentage.format(group.metrics.accuracy)} on unseen entities, with ${group.entityOverlap.count} shared entities.`,
    };
  }

  const majority = result.runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const stratified = result.runs.find(
    (run) => run.operation === "imbalance.stratified_holdout",
  );
  return {
    eyebrow: "Minority-class recall",
    value:
      stratified === undefined
        ? "Verified"
        : percentage.format(stratified.metrics.recall),
    context:
      majority === undefined || stratified === undefined
        ? "The stored fixed-kernel runs passed the independent verifier."
        : `The ${percentage.format(majority.metrics.accuracy)} majority-baseline accuracy carried ${percentage.format(majority.metrics.recall)} recall; the evaluated model reached ${percentage.format(stratified.metrics.recall)} recall and ${stratified.metrics.prAuc.toFixed(3)} PR-AUC.`,
  };
}

function verdictPresentation(replay: PublicReplayProjectionV1): {
  label: string;
  title: string;
  detail: string;
} {
  const verdict = replay.test.evidenceVerdict;
  if (verdict.kind === "SUPPORTS") {
    const hypothesis = replay.question.hypotheses.find(
      (candidate) => candidate.id === verdict.hypothesisId,
    );
    return {
      label: "SUPPORTS",
      title: hypothesis?.statement ?? `Hypothesis: ${verdict.hypothesisId}`,
      detail:
        "The signed result matched the recorded decisive pattern for this bounded test.",
    };
  }
  if (verdict.kind === "INCONCLUSIVE") {
    return {
      label: "INCONCLUSIVE",
      title: "The test was valid, but it did not separate the hypotheses.",
      detail: `The recorded reason was ${humanize(verdict.reasonCode)}.`,
    };
  }
  return {
    label: "REJECTED",
    title: "The proposed evidence was not released as authoritative.",
    detail: `Verifier findings: ${verdict.findingIds.map(humanize).join(", ")}.`,
  };
}

function coordinateLabel(
  replay: PublicReplayProjectionV1,
  cell: PublicBoundaryCell,
  coordinateIndex: number,
): string {
  const coordinate = cell.coordinates[coordinateIndex];
  const axis = replay.boundary.result.axes[coordinateIndex];
  const point = axis?.points.find(
    (candidate) => candidate.id === coordinate?.pointId,
  );
  return point?.label ?? String(coordinate?.value ?? "—");
}

function boundaryObservable(cell: PublicBoundaryCell): string {
  if (cell.concept === "entity_leakage") {
    return `${(cell.optimismGap * 100).toFixed(1)} percentage-point optimism gap; ${cell.groupEntityOverlap.count} shared entities`;
  }
  return `${percentage.format(cell.metrics.recall)} recall; ${cell.metrics.prAuc.toFixed(3)} PR-AUC`;
}

function BoundaryEvidence({ replay }: { replay: PublicReplayProjectionV1 }) {
  const { result, verification, receipt } = replay.boundary;
  const classifications = new Map(
    result.classifications.map((classification) => [
      classification.id,
      classification,
    ]),
  );
  const integrity =
    receipt.integrity.mode === "hmac-signed"
      ? "HMAC-signed"
      : "Integrity-hashed";

  if (
    replay.test.evidenceVerdict.kind === "REJECTED" ||
    verification.status !== "VERIFIED"
  ) {
    return (
      <section
        id="replay-boundary"
        className={styles.section}
        aria-labelledby="replay-boundary-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <span>04 · Boundary</span>
            <h2 id="replay-boundary-title">Boundary evidence withheld</h2>
            <p>
              The recorded verifier did not authorize this map. Playback does
              not reveal unverified cells.
            </p>
          </div>
          <div className={styles.rejectedStamp}>REJECTED</div>
        </header>
      </section>
    );
  }

  return (
    <section
      id="replay-boundary"
      className={styles.section}
      aria-labelledby="replay-boundary-title"
    >
      <header className={styles.sectionHeader}>
        <div>
          <span>04 · Boundary</span>
          <h2 id="replay-boundary-title">Where the result changes</h2>
          <p>
            Fixed code swept the recorded, pack-approved conditions. Playback
            shows the exact stored grid and never recomputes a cell.
          </p>
        </div>
        <div className={styles.verificationStamp}>
          <strong>{verification.status}</strong>
          <span>{integrity}</span>
        </div>
      </header>

      <div className={styles.tableWrap}>
        <table>
          <caption>
            {result.axes[0].label} by {result.axes[1].label}. Units:{" "}
            {result.axes[0].unit} and {result.axes[1].unit}.
          </caption>
          <thead>
            <tr>
              <th scope="col">{result.axes[0].label}</th>
              <th scope="col">{result.axes[1].label}</th>
              <th scope="col">Region</th>
              <th scope="col">Verified outcome</th>
            </tr>
          </thead>
          <tbody>
            {result.cells.map((cell) => (
              <tr key={cell.cellId}>
                <td>{coordinateLabel(replay, cell, 0)}</td>
                <td>{coordinateLabel(replay, cell, 1)}</td>
                <td>
                  {classifications.get(cell.classificationId)?.label ??
                    humanize(cell.classificationId)}
                </td>
                <td>{boundaryObservable(cell)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.boundaryNotes}>
        <div>
          <h3>Held fixed</h3>
          <ul>
            {result.assumptions.map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Not claimed</h3>
          <ul>
            {result.nonClaims.map((nonClaim) => (
              <li key={nonClaim}>{nonClaim}</li>
            ))}
          </ul>
        </div>
      </div>
      <p className={styles.hashLine}>
        Boundary result {result.resultHash.slice(0, 16)}… · receipt{" "}
        {receipt.receiptHash.slice(0, 16)}…
      </p>
    </section>
  );
}

function ResultEvidence({ replay }: { replay: PublicReplayProjectionV1 }) {
  const headline = resultHeadline(replay);
  const verdict = verdictPresentation(replay);
  if (replay.test.evidenceVerdict.kind === "REJECTED") {
    return (
      <section
        id="replay-test"
        className={styles.section}
        aria-labelledby="replay-test-title"
      >
        <header className={styles.sectionHeader}>
          <div>
            <span>03 · Test</span>
            <h2 id="replay-test-title">Experimental result withheld</h2>
            <p>
              This stored proposal failed verification. CounterLab preserves the
              finding but releases no numerical result as evidence.
            </p>
          </div>
          <div className={styles.rejectedStamp}>REJECTED</div>
        </header>
        <aside
          className={`${styles.verdict} ${styles.verdictREJECTED}`}
          aria-label="Evidence Verdict: REJECTED"
        >
          <span>Evidence Verdict · REJECTED</span>
          <h3>{verdict.title}</h3>
          <p>{verdict.detail}</p>
        </aside>
      </section>
    );
  }
  return (
    <section
      id="replay-test"
      className={styles.section}
      aria-labelledby="replay-test-title"
    >
      <header className={styles.sectionHeader}>
        <div>
          <span>03 · Test</span>
          <h2 id="replay-test-title">Reality answered with fixed code</h2>
          <p>
            These share-safe values came from the recorded fixed-kernel result
            and were released only after technical and epistemic verification.
          </p>
        </div>
        <div className={styles.verificationStamp}>
          <strong>VERIFIED TEST</strong>
          <span>{replay.test.result.kernelVersion}</span>
        </div>
      </header>

      <div className={styles.resultHero}>
        <span>{headline.eyebrow}</span>
        <strong>{headline.value}</strong>
        <p>{headline.context}</p>
      </div>

      <ResultTable replay={replay} />

      <aside
        className={`${styles.verdict} ${styles[`verdict${verdict.label}`]}`}
        aria-label={`Evidence Verdict: ${verdict.label}`}
      >
        <span>Evidence Verdict · {verdict.label}</span>
        <h3>{verdict.title}</h3>
        <p>{verdict.detail}</p>
      </aside>

      <p className={styles.hashLine}>
        Result {replay.test.result.resultHash.slice(0, 16)}… · seed{" "}
        {replay.test.result.seed}
      </p>
    </section>
  );
}

export function ProofCapsuleReplayView({
  replay,
  onStartOver,
}: {
  replay: PublicReplayProjectionV1;
  onStartOver?: () => void;
}) {
  const integrityLabel =
    replay.authority.projectionIntegrity.mode === "hmac-signed"
      ? "HMAC-signed"
      : "Integrity-hashed";

  return (
    <main
      className={styles.replay}
      id="main-content"
      tabIndex={-1}
      data-replay-id={replay.replayId}
    >
      <aside className={styles.replayBanner} aria-label="Verified replay mode">
        <span className={styles.replayPulse} aria-hidden="true" />
        <div>
          <strong>Verified replay</strong>
          <span>Read-only playback · no new model call or experiment run</span>
        </div>
        <dl>
          <div>
            <dt>Source</dt>
            <dd>Completed live notebook analysis</dd>
          </div>
          <div>
            <dt>Recorded</dt>
            <dd>{recordedDate(replay.recordedAt)}</dd>
          </div>
        </dl>
        {onStartOver === undefined ? null : (
          <button
            className={styles.startOver}
            type="button"
            onClick={onStartOver}
          >
            Start new analysis
          </button>
        )}
      </aside>

      <div className={styles.content}>
        <header className={styles.hero}>
          <div>
            <p className={styles.kicker}>CounterLab Proof Capsule · v2</p>
            <h1>A live notebook claim, replayed from verified evidence.</h1>
            <p>
              This page reconstructs the stored Question → Prediction → Test →
              Boundary → Apply → Repair chain. It does not borrow sample results
              and cannot change the original session.
            </p>
          </div>
          <aside className={styles.artifactCard} aria-label="Source artifact">
            <span>Share-safe artifact summary</span>
            <strong>Private notebook withheld</strong>
            <p>
              {humanize(replay.concept)} · nbformat {replay.artifact.nbformat}
            </p>
            <code>{replay.artifact.supportStatus}</code>
          </aside>
        </header>

        <nav className={styles.stageRail} aria-label="Replay evidence stages">
          <ol>
            {replayStages.map((stage, index) => (
              <li key={stage.id}>
                <a href={`#${stage.id}`}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  {stage.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <section
          id="replay-question"
          className={styles.section}
          aria-labelledby="replay-question-title"
        >
          <header className={styles.sectionHeader}>
            <div>
              <span>01 · Question</span>
              <h2 id="replay-question-title">
                The claim that started the test
              </h2>
            </div>
            <strong className={styles.readOnlyBadge}>Read only</strong>
          </header>
          <blockquote className={styles.claim}>
            {replay.question.claim}
          </blockquote>
          <div className={styles.hypothesisGrid}>
            {replay.question.hypotheses.map((hypothesis) => (
              <article key={hypothesis.id}>
                <span>
                  {hypothesis.id === "current"
                    ? "Current model"
                    : "Competing model"}
                </span>
                <h3>{hypothesis.statement}</h3>
              </article>
            ))}
          </div>
          <div className={styles.evidenceList} aria-label="Artifact evidence">
            {replay.artifact.evidenceLocators.map((evidence) => (
              <article
                key={`${evidence.hash}:${evidence.cellIndex ?? "claim"}`}
              >
                <span>
                  {evidence.cellIndex === undefined
                    ? "Learner claim"
                    : `Cell ${evidence.cellIndex}${evidence.outputIndex === undefined ? "" : ` · output ${evidence.outputIndex}`}`}
                </span>
                <p>
                  {humanize(evidence.kind)} evidence · hash{" "}
                  {evidence.hash.slice(0, 16)}…
                </p>
                <small>
                  Source text, field names, and notebook identifiers are not
                  included in this public replay.
                </small>
              </article>
            ))}
          </div>
        </section>

        <section
          id="replay-prediction"
          className={styles.section}
          aria-labelledby="replay-prediction-title"
        >
          <header className={styles.sectionHeader}>
            <div>
              <span>02 · Prediction</span>
              <h2 id="replay-prediction-title">Locked before the result</h2>
            </div>
            <strong className={styles.lockedBadge}>Immutable</strong>
          </header>
          <div className={styles.predictionCard}>
            <blockquote>{replay.prediction.choice}</blockquote>
            <dl>
              <div>
                <dt>Confidence</dt>
                <dd>{replay.prediction.confidence}%</dd>
              </div>
              {replay.prediction.numericRange === undefined ? null : (
                <div>
                  <dt>Expected range</dt>
                  <dd>
                    {replay.prediction.numericRange.min}–
                    {replay.prediction.numericRange.max}
                  </dd>
                </div>
              )}
              <div>
                <dt>Committed</dt>
                <dd>{recordedDate(replay.prediction.committedAt)}</dd>
              </div>
              <div>
                <dt>Immutable hash</dt>
                <dd>{replay.prediction.immutableHash.slice(0, 16)}…</dd>
              </div>
            </dl>
          </div>
        </section>

        <ResultEvidence replay={replay} />
        <BoundaryEvidence replay={replay} />

        <section
          id="replay-apply"
          className={styles.section}
          aria-labelledby="replay-apply-title"
        >
          <header className={styles.sectionHeader}>
            <div>
              <span>05 · Apply</span>
              <h2 id="replay-apply-title">
                The rule transferred to a new case
              </h2>
              <p>
                No language model graded this step. Fixed checks scored the
                stored action.
              </p>
            </div>
            <div className={styles.verificationStamp}>
              <strong>{replay.apply.transfer.outcome}</strong>
              <span>{replay.apply.transfer.evaluatorVersion}</span>
            </div>
          </header>
          <div className={styles.transferLayout}>
            <div>
              <span>Stored learner revision</span>
              <blockquote>{replay.apply.revision.statement}</blockquote>
              <small>
                Recorded {recordedDate(replay.apply.revision.recordedAt)}
              </small>
            </div>
            <div>
              <span>Applied strategy</span>
              <h3>{replay.apply.transfer.selectedStrategy}</h3>
            </div>
          </div>
          <ul
            className={styles.checkList}
            aria-label="Deterministic transfer checks"
          >
            {replay.apply.transfer.checks.map((check) => (
              <li key={check.invariant}>
                <strong>{check.passed ? "Passed" : "Failed"}</strong>
                <span>{humanize(check.invariant)}</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          id="replay-repair"
          className={styles.section}
          aria-labelledby="replay-repair-title"
        >
          <header className={styles.sectionHeader}>
            <div>
              <span>06 · Repair</span>
              <h2 id="replay-repair-title">
                A minimal notebook copy passed verification
              </h2>
              <p>
                The source notebook remained untouched. The public replay
                exposes the verified repair summary, never notebook bytes or the
                source-level diff.
              </p>
            </div>
            <div className={styles.verificationStamp}>
              <strong>{replay.repair.status}</strong>
              <span>
                {replay.repair.modifiedCells.length} changed cell
                {replay.repair.modifiedCells.length === 1 ? "" : "s"}
              </span>
            </div>
          </header>
          <div className={styles.patchSummary}>
            <dl>
              <div>
                <dt>Changed cells</dt>
                <dd>{replay.repair.modifiedCells.join(", ")}</dd>
              </div>
              <div>
                <dt>Unchanged cells proven</dt>
                <dd>{replay.repair.unchangedCellCount}</dd>
              </div>
              <div>
                <dt>Patch result</dt>
                <dd>{replay.repair.resultHash.slice(0, 16)}…</dd>
              </div>
              <div>
                <dt>Patched hash</dt>
                <dd>{replay.repair.patchedArtifactHash.slice(0, 16)}…</dd>
              </div>
            </dl>
            <p>
              The owner can download the verified notebook copy only from the
              private, capability-gated session.
            </p>
          </div>
          <details className={styles.disclosure}>
            <summary>Review public repair verification</summary>
            <ul>
              {replay.repair.invariantNames.map((invariant) => (
                <li key={invariant}>{humanize(invariant)}</li>
              ))}
            </ul>
          </details>
        </section>

        <section
          className={styles.reasoningDiff}
          aria-labelledby="replay-reasoning-title"
        >
          <header className={styles.sectionHeader}>
            <div>
              <span>Reasoning Diff · Private text withheld</span>
              <h2 id="replay-reasoning-title">
                The public replay proves the change without republishing private
                notebook-derived prose.
              </h2>
              <p>
                Claim, prediction, and revision remain visible in their stages.
                The exact six-part Reasoning Diff stays in the owner-only Proof
                Capsule and is bound by its hash.
              </p>
            </div>
            <strong className={styles.readOnlyBadge}>Hash-bound</strong>
          </header>
        </section>

        <section
          id="replay-proof"
          className={styles.capsule}
          aria-labelledby="replay-capsule-title"
        >
          <div>
            <span>Machine-facing evidence</span>
            <h2 id="replay-capsule-title">
              Verify the public evidence binding.
            </h2>
            <p>
              This share-safe projection binds to the private source Capsule
              without publishing its notebook, patch diff, session identifiers,
              or Capsule bytes.
            </p>
          </div>
          <dl>
            <div>
              <dt>Integrity</dt>
              <dd>{integrityLabel}</dd>
            </div>
            <div>
              <dt>Root hash</dt>
              <dd>{replay.authority.sourceCapsuleRootHash.slice(0, 16)}…</dd>
            </div>
            <div>
              <dt>Projection hash</dt>
              <dd>{replay.authority.projectionHash.slice(0, 16)}…</dd>
            </div>
          </dl>
          <p>
            Full Proof Capsule export remains available only to the private
            session owner.
          </p>
        </section>

        <details className={styles.provenance}>
          <summary>
            Evidence &amp; proof · provenance, activity, and limitations
          </summary>
          <div className={styles.provenanceGrid}>
            <section>
              <h2>Replay authority</h2>
              <dl>
                <div>
                  <dt>Replay ID</dt>
                  <dd>{replay.replayId}</dd>
                </div>
                <div>
                  <dt>Source mode</dt>
                  <dd>live_notebook</dd>
                </div>
                <div>
                  <dt>Privacy profile</dt>
                  <dd>{replay.privacy.profile}</dd>
                </div>
                <div>
                  <dt>Source Capsule root</dt>
                  <dd>{replay.authority.sourceCapsuleRootHash}</dd>
                </div>
                <div>
                  <dt>Event chain head</dt>
                  <dd>{replay.authority.eventChainHead}</dd>
                </div>
              </dl>
            </section>
            <section>
              <h2>Recorded provenance</h2>
              <dl>
                <div>
                  <dt>Subject Pack</dt>
                  <dd>{replay.provenance.conceptPackVersion}</dd>
                </div>
                <div>
                  <dt>Kernel</dt>
                  <dd>{replay.provenance.kernelVersion}</dd>
                </div>
                <div>
                  <dt>Verifier</dt>
                  <dd>{replay.provenance.verifierVersion}</dd>
                </div>
                <div>
                  <dt>Boundary verifier</dt>
                  <dd>{replay.provenance.boundaryVerifierVersion}</dd>
                </div>
                <div>
                  <dt>Scientific verifier</dt>
                  <dd>{replay.provenance.scientificVerifierVersion}</dd>
                </div>
                <div>
                  <dt>Experiment scorer</dt>
                  <dd>{replay.provenance.scorerVersion}</dd>
                </div>
                <div>
                  <dt>Model IDs</dt>
                  <dd>
                    {replay.provenance.modelIds.join(", ") || "None recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Prompt hashes</dt>
                  <dd>
                    {replay.provenance.promptHashes
                      .map((hash) => `${hash.slice(0, 12)}…`)
                      .join(", ") || "None recorded"}
                  </dd>
                </div>
                <div>
                  <dt>Commit hashes</dt>
                  <dd>
                    {replay.provenance.commitHashes
                      .map((hash) => `${hash.slice(0, 12)}…`)
                      .join(", ") || "None recorded"}
                  </dd>
                </div>
              </dl>
            </section>
            <section>
              <h2>Allowlisted activity</h2>
              <ol>
                {replay.activity.map((event, index) => (
                  <li key={`${event.kind}:${event.sequence}:${index}`}>
                    <span>Step {event.sequence}</span>
                    <span>
                      {event.actor} · {humanize(event.kind)}
                    </span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2>Excluded from the public replay</h2>
              <ul>
                {replay.privacy.excluded.map((item) => (
                  <li key={item}>{humanize(item)}</li>
                ))}
              </ul>
            </section>
            <section>
              <h2>Limitations</h2>
              <ul>
                {replay.limitations.map((limitation) => (
                  <li key={limitation}>{limitation}</li>
                ))}
              </ul>
            </section>
          </div>
        </details>
      </div>
    </main>
  );
}
