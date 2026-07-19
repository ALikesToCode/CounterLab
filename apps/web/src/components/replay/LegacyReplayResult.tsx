import { useId } from "react";

import type { VerifiedReplay } from "../../api";
import styles from "./LegacyReplayResult.module.css";

export type LegacyVerifiedReplay = Exclude<
  VerifiedReplay,
  { projectionKind: "public_replay" }
>;

export interface LegacyReplayResultProps {
  replay: LegacyVerifiedReplay;
  onStartSample: () => void;
  onStartOver: () => void;
}

const percentage = new Intl.NumberFormat("en", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const recordedDate = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());
}

function StoredResultTable({ replay }: { replay: LegacyVerifiedReplay }) {
  const result = replay.result;

  if (result.concept === "class_imbalance") {
    return (
      <div className={styles.tableWrap}>
        <table>
          <caption>
            Stored fixed-kernel comparison. These values are replayed exactly;
            this page does not recalculate them.
          </caption>
          <thead>
            <tr>
              <th scope="col">Run</th>
              <th scope="col">Accuracy</th>
              <th scope="col">Precision</th>
              <th scope="col">Recall</th>
              <th scope="col">F1</th>
              <th scope="col">PR-AUC</th>
            </tr>
          </thead>
          <tbody>
            {result.runs.map((run) => (
              <tr key={run.id}>
                <th scope="row">{humanize(run.id)}</th>
                <td>{percentage.format(run.metrics.accuracy)}</td>
                <td>{percentage.format(run.metrics.precision)}</td>
                <td>{percentage.format(run.metrics.recall)}</td>
                <td>{percentage.format(run.metrics.f1)}</td>
                <td>{run.metrics.prAuc.toFixed(3)}</td>
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
          Stored fixed-kernel comparison. Accuracy is shown beside entity
          overlap so the original evaluation conditions remain visible.
        </caption>
        <thead>
          <tr>
            <th scope="col">Run</th>
            <th scope="col">Split</th>
            <th scope="col">Accuracy</th>
            <th scope="col">Test rows</th>
            <th scope="col">Shared entities</th>
          </tr>
        </thead>
        <tbody>
          {result.runs.map((run) => (
            <tr key={run.id}>
              <th scope="row">{humanize(run.id)}</th>
              <td>{humanize(run.splitStrategy)}</td>
              <td>{percentage.format(run.metrics.accuracy)}</td>
              <td>{run.sampleSizes.test.toLocaleString("en")}</td>
              <td>
                {run.entityOverlap.count.toLocaleString("en")} (
                {percentage.format(run.entityOverlap.rate)})
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LegacyReplayResult({
  replay,
  onStartSample,
  onStartOver,
}: LegacyReplayResultProps) {
  const titleId = useId();

  return (
    <main
      className={styles.screen}
      id="main-content"
      tabIndex={-1}
      aria-labelledby={titleId}
      data-replay-id={replay.replayId}
    >
      <aside className={styles.status} aria-label="Legacy replay status">
        <span className={styles.statusMark} aria-hidden="true" />
        <strong>Verified replay · read-only stored evidence</strong>
      </aside>

      <div className={styles.content}>
        <header className={styles.hero}>
          <p className={styles.eyebrow}>Recorded evidence · Legacy schema v1</p>
          <h1 id={titleId}>Inspect the result without changing its history.</h1>
          <p>
            This is stored evidence from a prior verified run. It is not a live
            model run and does not analyze a new notebook.
          </p>
        </header>

        <section
          className={styles.provenance}
          aria-labelledby={`${titleId}-provenance`}
        >
          <div className={styles.sectionHeading}>
            <p>Stored provenance</p>
            <h2 id={`${titleId}-provenance`}>What produced this replay</h2>
          </div>
          <dl>
            <div>
              <dt>Replay ID</dt>
              <dd>{replay.replayId}</dd>
            </div>
            <div>
              <dt>Recorded</dt>
              <dd>{recordedDate.format(new Date(replay.recordedAt))}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{replay.modelId}</dd>
            </div>
            <div>
              <dt>Verifier</dt>
              <dd>{replay.verifierVersion}</dd>
            </div>
            <div>
              <dt>Template commit</dt>
              <dd>{replay.templateCommit}</dd>
            </div>
            <div>
              <dt>Fixture</dt>
              <dd>{replay.fixtureId}</dd>
            </div>
          </dl>
        </section>

        <section
          className={styles.result}
          aria-labelledby={`${titleId}-result`}
        >
          <div className={styles.sectionHeading}>
            <p>Stored comparison</p>
            <h2 id={`${titleId}-result`}>The recorded fixed-kernel result</h2>
          </div>
          <StoredResultTable replay={replay} />
          <dl className={styles.integrity}>
            <div>
              <dt>Result hash</dt>
              <dd>
                <code>{replay.result.resultHash}</code>
              </dd>
            </div>
            <div>
              <dt>Kernel</dt>
              <dd>{replay.result.kernelVersion}</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{replay.result.seed}</dd>
            </div>
          </dl>
        </section>

        <aside
          className={styles.limitations}
          aria-labelledby={`${titleId}-limits`}
        >
          <p>Legacy replay limitation</p>
          <h2 id={`${titleId}-limits`}>Observation only</h2>
          <p>
            This legacy record predates Proof Capsule v2. It cannot record your
            choices, verify a new transfer, unlock a repair, apply a patch, or
            provide a new proof download. Start a verified sample for an
            interactive learning path.
          </p>
        </aside>

        <div
          className={styles.actions}
          role="group"
          aria-label="Replay exit actions"
        >
          <button
            className={styles.primaryAction}
            type="button"
            onClick={onStartSample}
          >
            Start verified sample
          </button>
          <button
            className={styles.secondaryAction}
            type="button"
            onClick={onStartOver}
          >
            Start over
          </button>
        </div>
      </div>
    </main>
  );
}
