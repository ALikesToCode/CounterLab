import type {
  BoundaryMapCellV1,
  ProofCapsuleReplayV2,
  PublicCompilerEvent,
} from "@counterlab/contracts";

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

const reasoningDimensions = [
  ["belief", "Belief"],
  ["prediction", "Prediction"],
  ["evidence", "Evidence"],
  ["boundary", "Boundary"],
  ["behavior", "Apply"],
  ["code", "Repair"],
] as const;

const replayStages = [
  { id: "replay-question", label: "Question" },
  { id: "replay-prediction", label: "Prediction" },
  { id: "replay-test", label: "Test" },
  { id: "replay-boundary", label: "Boundary" },
  { id: "replay-apply", label: "Apply" },
  { id: "replay-repair", label: "Repair" },
] as const;

function humanize(value: string): string {
  return value
    .replace(/^(?:leakage|imbalance)\./u, "")
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function recordedDate(value: string): string {
  return dateTime.format(new Date(value));
}

function ResultTable({ replay }: { replay: ProofCapsuleReplayV2 }) {
  const result = replay.verifiedResult;

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

function resultHeadline(replay: ProofCapsuleReplayV2): {
  eyebrow: string;
  value: string;
  context: string;
} {
  const result = replay.verifiedResult;
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

function verdictPresentation(replay: ProofCapsuleReplayV2): {
  label: string;
  title: string;
  detail: string;
} {
  const verdict = replay.evidenceVerdict;
  if (verdict.kind === "SUPPORTS") {
    const hypothesis = replay.beliefSpec.hypotheses.find(
      (candidate) => candidate.id === verdict.hypothesisId,
    );
    return {
      label: "SUPPORTS",
      title: hypothesis?.statement ?? `Hypothesis: ${verdict.hypothesisId}`,
      detail: verdict.scope,
    };
  }
  if (verdict.kind === "INCONCLUSIVE") {
    return {
      label: "INCONCLUSIVE",
      title: "The test was valid, but it did not separate the hypotheses.",
      detail: verdict.scope,
    };
  }
  return {
    label: "REJECTED",
    title: "The proposed evidence was not released as authoritative.",
    detail: `Verifier findings: ${verdict.findingIds.map(humanize).join(", ")}.`,
  };
}

function coordinateLabel(
  replay: ProofCapsuleReplayV2,
  cell: BoundaryMapCellV1,
  coordinateIndex: number,
): string {
  const coordinate = cell.coordinates[coordinateIndex];
  const axis = replay.boundary.result.axes[coordinateIndex];
  const point = axis?.points.find(
    (candidate) => candidate.id === coordinate?.pointId,
  );
  return point?.label ?? String(coordinate?.value ?? "—");
}

function boundaryObservable(cell: BoundaryMapCellV1): string {
  if (cell.concept === "entity_leakage") {
    return `${(cell.optimismGap * 100).toFixed(1)} percentage-point optimism gap; ${cell.groupEntityOverlap.count} shared entities`;
  }
  return `${percentage.format(cell.metrics.recall)} recall; ${cell.metrics.prAuc.toFixed(3)} PR-AUC`;
}

function BoundaryEvidence({ replay }: { replay: ProofCapsuleReplayV2 }) {
  const { result, report, receipt } = replay.boundary;
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
    replay.evidenceVerdict.kind === "REJECTED" ||
    report.status !== "VERIFIED"
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
          <strong>{report.status}</strong>
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

function compilerEventLabel(event: PublicCompilerEvent): string {
  switch (event.kind) {
    case "job.started":
      return "Compiler job started";
    case "plan.summary":
      return event.title;
    case "artifact.read":
      return `${event.evidenceRefs.length} artifact evidence reference${event.evidenceRefs.length === 1 ? "" : "s"} read`;
    case "file.created":
      return `${event.path} created`;
    case "diff.updated":
      return `${event.path} updated`;
    case "command.completed":
      return `${event.label} completed with exit ${event.exitCode}`;
    case "verifier.rejected":
      return `Verifier rejected ${humanize(event.invariant)}`;
    case "repair.started":
      return `Repair attempt ${event.attempt} started`;
    case "verifier.verified":
      return `Verifier accepted ${event.invariantCount} invariants`;
    case "result.ready":
      return `Verified result ${event.resultHash.slice(0, 12)}… ready`;
    case "job.failed":
      return `${event.code}: ${event.message}`;
  }
}

function ResultEvidence({ replay }: { replay: ProofCapsuleReplayV2 }) {
  const headline = resultHeadline(replay);
  const verdict = verdictPresentation(replay);
  if (replay.evidenceVerdict.kind === "REJECTED") {
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
            These values were computed for {replay.artifactManifest.fileName}{" "}
            and released only after technical and epistemic verification.
          </p>
        </div>
        <div className={styles.verificationStamp}>
          <strong>VERIFIED TEST</strong>
          <span>{replay.verifiedResult.kernelVersion}</span>
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
        Result {replay.verifiedResult.resultHash.slice(0, 16)}… · seed{" "}
        {replay.verifiedResult.seed}
      </p>
    </section>
  );
}

export function ProofCapsuleReplayView({
  replay,
  proofCapsuleDownloadUrl,
  patchedNotebookDownloadUrl,
  onStartOver,
}: {
  replay: ProofCapsuleReplayV2;
  proofCapsuleDownloadUrl: string;
  patchedNotebookDownloadUrl: string;
  onStartOver?: () => void;
}) {
  const integrityLabel =
    replay.proofCapsule.integrity.mode === "hmac-signed"
      ? "HMAC-signed"
      : "Integrity-hashed";

  return (
    <main className={styles.replay} data-replay-id={replay.replayId}>
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
            <span>Original artifact</span>
            <strong>{replay.artifactManifest.fileName}</strong>
            <p>
              {humanize(replay.concept)} · nbformat{" "}
              {replay.artifactManifest.nbformat}
            </p>
            <code>{replay.artifactManifest.fileSha256.slice(0, 18)}…</code>
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
            {replay.beliefSpec.claim}
          </blockquote>
          <div className={styles.hypothesisGrid}>
            {replay.beliefSpec.hypotheses.map((hypothesis) => (
              <article key={hypothesis.id}>
                <span>
                  {hypothesis.id === "current"
                    ? "Current model"
                    : "Competing model"}
                </span>
                <h3>{hypothesis.statement}</h3>
                <p>{hypothesis.conditions.join(" · ")}</p>
              </article>
            ))}
          </div>
          <div className={styles.evidenceList} aria-label="Artifact evidence">
            {replay.beliefSpec.evidenceRefs.map((evidence) => (
              <article
                key={`${evidence.hash}:${evidence.cellIndex ?? "claim"}`}
              >
                <span>
                  {evidence.cellIndex === undefined
                    ? "Learner claim"
                    : `Cell ${evidence.cellIndex}${evidence.outputIndex === undefined ? "" : ` · output ${evidence.outputIndex}`}`}
                </span>
                <p>{evidence.excerpt}</p>
                <small>{evidence.relevance}</small>
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
              <strong>{replay.transferResult.outcome}</strong>
              <span>{replay.transferResult.evaluatorVersion}</span>
            </div>
          </header>
          <div className={styles.transferLayout}>
            <div>
              <span>Stored learner revision</span>
              <blockquote>{replay.revision.statement}</blockquote>
              <small>Recorded {recordedDate(replay.revision.recordedAt)}</small>
            </div>
            <div>
              <span>Applied strategy</span>
              <h3>{replay.transferResult.selectedStrategy}</h3>
              <ul>
                {replay.transferResult.identifiedRisks.map((risk) => (
                  <li key={risk}>{risk}</li>
                ))}
              </ul>
            </div>
          </div>
          <ul
            className={styles.checkList}
            aria-label="Deterministic transfer checks"
          >
            {replay.transferResult.checks.map((check) => (
              <li key={check.invariant}>
                <strong>{check.passed ? "Passed" : "Failed"}</strong>
                <span>{humanize(check.invariant)}</span>
                <p>{check.evidence}</p>
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
                The source notebook remained untouched. Only the recorded
                artifact copy is downloadable.
              </p>
            </div>
            <div className={styles.verificationStamp}>
              <strong>{replay.patchResult.status}</strong>
              <span>
                {replay.patchResult.modifiedCells.length} changed cell
                {replay.patchResult.modifiedCells.length === 1 ? "" : "s"}
              </span>
            </div>
          </header>
          <div className={styles.patchSummary}>
            <dl>
              <div>
                <dt>Changed cells</dt>
                <dd>{replay.patchResult.modifiedCells.join(", ")}</dd>
              </div>
              <div>
                <dt>Unchanged cells proven</dt>
                <dd>
                  {replay.patchResult.verification.unchangedCellHashes.length}
                </dd>
              </div>
              <div>
                <dt>Source hash</dt>
                <dd>{replay.patchResult.sourceArtifactHash.slice(0, 16)}…</dd>
              </div>
              <div>
                <dt>Patched hash</dt>
                <dd>{replay.patchResult.patchedArtifactHash.slice(0, 16)}…</dd>
              </div>
            </dl>
            <a
              className={styles.secondaryDownload}
              href={patchedNotebookDownloadUrl}
              download
            >
              Download repaired notebook copy
            </a>
          </div>
          <details className={styles.disclosure}>
            <summary>Review verified notebook-cell diff</summary>
            <pre aria-label="Verified notebook-cell diff">
              <code>{replay.patchResult.diff}</code>
            </pre>
            <ul>
              {replay.patchResult.verification.invariants.map((invariant) => (
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
              <span>Reasoning Diff · Learner-facing</span>
              <h2 id="replay-reasoning-title">
                What changed was the rule, not only the score.
              </h2>
            </div>
            <strong className={styles.readOnlyBadge}>6 linked changes</strong>
          </header>
          <div className={styles.tableWrap}>
            <table>
              <caption>
                Before-and-after reasoning bound to this Proof Capsule.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Dimension</th>
                  <th scope="col">Before</th>
                  <th scope="col">After</th>
                </tr>
              </thead>
              <tbody>
                {reasoningDimensions.map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{replay.reasoningDiff.dimensions[key].before}</td>
                    <td>{replay.reasoningDiff.dimensions[key].after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="replay-proof"
          className={styles.capsule}
          aria-labelledby="replay-capsule-title"
        >
          <div>
            <span>Machine-facing evidence</span>
            <h2 id="replay-capsule-title">Take the complete proof with you.</h2>
            <p>
              The Capsule binds the live source mode, artifact, prediction,
              computed result, verifier reports, transfer, patch, and event
              chain.
            </p>
          </div>
          <dl>
            <div>
              <dt>Integrity</dt>
              <dd>{integrityLabel}</dd>
            </div>
            <div>
              <dt>Root hash</dt>
              <dd>{replay.rootHash.slice(0, 16)}…</dd>
            </div>
            <div>
              <dt>Exact bytes</dt>
              <dd>{replay.proofCapsule.byteLength.toLocaleString()} bytes</dd>
            </div>
          </dl>
          <a
            className={styles.primaryDownload}
            href={proofCapsuleDownloadUrl}
            download
          >
            Download Proof Capsule
          </a>
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
                  <dt>Source session</dt>
                  <dd>{replay.sourceSessionId}</dd>
                </div>
                <div>
                  <dt>Capsule ID</dt>
                  <dd>{replay.capsuleId}</dd>
                </div>
                <div>
                  <dt>Event chain head</dt>
                  <dd>{replay.eventChainHead}</dd>
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
              <h2>Sanitized compiler record</h2>
              <ol>
                {replay.compilerEvents.map((event, index) => (
                  <li key={`${event.kind}:${event.at}:${index}`}>
                    <time dateTime={event.at}>{recordedDate(event.at)}</time>
                    <span>{compilerEventLabel(event)}</span>
                  </li>
                ))}
              </ol>
            </section>
            <section>
              <h2>Append-only timeline</h2>
              <ol>
                {replay.timeline.map((event) => (
                  <li key={event.eventHash}>
                    <time dateTime={event.timestamp}>
                      {recordedDate(event.timestamp)}
                    </time>
                    <span>
                      {event.actor} · {humanize(event.kind)}
                    </span>
                  </li>
                ))}
              </ol>
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
