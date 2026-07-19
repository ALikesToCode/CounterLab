import { useEffect, useId, useState } from "react";

import {
  sampleBoundaryFixture,
  verifySampleBoundaryFixtureIntegrity,
} from "../../features/boundary/sampleBoundaryFixture";
import { getRun, sampleResult, type VerifiedRun } from "../../sample";
import sampleResultBytes from "../../../../../fixtures/public/leakage_verified_result.json?raw";
import styles from "./VerifiedBeliefBreakTheater.module.css";

const MODE_LABEL = "Verified sample exploration";

export type VerifiedBeliefBreakPresentation = "full" | "preview";

type VerifiedBeliefBreakEvidence = Readonly<{
  randomRows: VerifiedRun;
  wholeCustomers: VerifiedRun;
  resultHash: string;
  fixtureIntegrityHash: string;
}>;

type IntegrityState =
  | Readonly<{ status: "checking" }>
  | Readonly<{ status: "rejected" }>
  | Readonly<{
      status: "verified";
      evidence: VerifiedBeliefBreakEvidence;
    }>;

function asPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
    style: "percent",
  }).format(value);
}

async function sha256Text(value: string): Promise<string> {
  if (globalThis.crypto?.subtle === undefined) {
    throw new Error("Verified sample integrity is unavailable");
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function runsKeepTheQuestionFair(
  randomRows: VerifiedRun,
  wholeCustomers: VerifiedRun,
): boolean {
  return (
    randomRows.id === "random_row_split" &&
    randomRows.splitStrategy === "random" &&
    wholeCustomers.id === "customer_group_split" &&
    wholeCustomers.splitStrategy === "group" &&
    wholeCustomers.groupBy === "customer_id" &&
    randomRows.model === wholeCustomers.model &&
    randomRows.seed === wholeCustomers.seed &&
    randomRows.inputFingerprint === wholeCustomers.inputFingerprint &&
    randomRows.featureSetFingerprint === wholeCustomers.featureSetFingerprint &&
    randomRows.pipelineFingerprint === wholeCustomers.pipelineFingerprint &&
    randomRows.sampleSizes.train === wholeCustomers.sampleSizes.train &&
    randomRows.sampleSizes.test === wholeCustomers.sampleSizes.test
  );
}

async function verifyBundledEvidence(): Promise<VerifiedBeliefBreakEvidence> {
  const boundary = await verifySampleBoundaryFixtureIntegrity(
    sampleBoundaryFixture,
  );
  const resultFileHash = await sha256Text(sampleResultBytes);
  const randomRows = getRun("random_row_split");
  const wholeCustomers = getRun("customer_group_split");

  if (
    sampleResult.concept !== "entity_leakage" ||
    boundary.source.primaryResultHash !== sampleResult.resultHash ||
    boundary.source.primaryResultFileHash !== resultFileHash ||
    !runsKeepTheQuestionFair(randomRows, wholeCustomers)
  ) {
    throw new Error("Verified sample evidence lineage does not resolve");
  }

  return {
    randomRows,
    wholeCustomers,
    resultHash: sampleResult.resultHash,
    fixtureIntegrityHash: boundary.fixtureIntegrityHash,
  };
}

function EntityToken({ children }: { children: string }) {
  return <span className={styles.entityToken}>{children}</span>;
}

function MechanismDiagram({
  presentation,
}: {
  presentation: VerifiedBeliefBreakPresentation;
}) {
  const isPreview = presentation === "preview";

  return (
    <figure
      className={`${styles.mechanism} ${isPreview ? styles.previewMechanism : ""}`}
    >
      <figcaption className={isPreview ? styles.visuallyHidden : undefined}>
        Mechanism diagram. Lettered tokens illustrate repeated customers; they
        are not notebook rows or customer identities.
      </figcaption>

      <div className={styles.lanes}>
        <article className={styles.lane}>
          <header>
            <strong>Random rows</strong>
            {isPreview ? null : <span>Same customers cross the split</span>}
          </header>
          <div className={styles.split}>
            <div>
              <small>Training</small>
              <div className={styles.tokens} aria-hidden="true">
                <EntityToken>A</EntityToken>
                <EntityToken>B</EntityToken>
                <EntityToken>C</EntityToken>
                <EntityToken>D</EntityToken>
              </div>
            </div>
            <span className={styles.splitMark} aria-hidden="true">
              ↔
            </span>
            <div>
              <small>Test</small>
              <div className={styles.tokens} aria-hidden="true">
                <EntityToken>A</EntityToken>
                <EntityToken>C</EntityToken>
                <EntityToken>D</EntityToken>
              </div>
            </div>
          </div>
          <p>
            <span aria-hidden="true">↔</span> Repeated customers
          </p>
        </article>

        <article className={styles.lane}>
          <header>
            <strong>Whole customers</strong>
            {isPreview ? null : <span>New customers stay separate</span>}
          </header>
          <div className={styles.split}>
            <div>
              <small>Training</small>
              <div className={styles.tokens} aria-hidden="true">
                <EntityToken>A</EntityToken>
                <EntityToken>B</EntityToken>
                <EntityToken>C</EntityToken>
              </div>
            </div>
            <span className={styles.splitMark} aria-hidden="true">
              →
            </span>
            <div>
              <small>Test</small>
              <div className={styles.tokens} aria-hidden="true">
                <EntityToken>D</EntityToken>
                <EntityToken>E</EntityToken>
                <EntityToken>F</EntityToken>
              </div>
            </div>
          </div>
          <p>
            <span aria-hidden="true">∅</span> No shared customers
          </p>
        </article>
      </div>
    </figure>
  );
}

function PreviewComparison({
  randomRows,
  wholeCustomers,
}: {
  randomRows: VerifiedRun;
  wholeCustomers: VerifiedRun;
}) {
  return (
    <figure className={styles.previewComparison}>
      <figcaption>
        <span>Fixed-kernel evidence</span>
        <strong>Only the evaluation unit changed</strong>
      </figcaption>

      <div
        className={styles.previewSplits}
        role="group"
        aria-label="Why random rows and whole-customer holdout answer different questions. Lettered tokens illustrate customer identities; they are not notebook rows or real customer identifiers."
      >
        <article
          className={styles.previewSplitState}
          aria-label="Random-row split. Customer A appears in both training and test, so a repeated identity crosses the evaluation boundary."
        >
          <header>
            <strong>Random rows</strong>
            <span>Identities repeat</span>
          </header>
          <div className={styles.previewSplitTrack} aria-hidden="true">
            <div>
              <small>Training</small>
              <div className={styles.previewTokens}>
                <EntityToken>A</EntityToken>
                <EntityToken>B</EntityToken>
                <EntityToken>C</EntityToken>
              </div>
            </div>
            <span className={styles.previewSplitMark}>↔</span>
            <div>
              <small>Test</small>
              <div className={styles.previewTokens}>
                <EntityToken>A</EntityToken>
                <EntityToken>D</EntityToken>
              </div>
            </div>
          </div>
          <p>
            <span aria-hidden="true">↔</span> Customer A appears on both sides
          </p>
        </article>

        <article
          className={styles.previewSplitState}
          aria-label="Whole-customer holdout. Training contains customers A, B, and C while test contains D and E, so no identity crosses the evaluation boundary."
        >
          <header>
            <strong>Whole customers</strong>
            <span>Identities stay apart</span>
          </header>
          <div className={styles.previewSplitTrack} aria-hidden="true">
            <div>
              <small>Training</small>
              <div className={styles.previewTokens}>
                <EntityToken>A</EntityToken>
                <EntityToken>B</EntityToken>
                <EntityToken>C</EntityToken>
              </div>
            </div>
            <span className={styles.previewSplitMark}>→</span>
            <div>
              <small>Test</small>
              <div className={styles.previewTokens}>
                <EntityToken>D</EntityToken>
                <EntityToken>E</EntityToken>
              </div>
            </div>
          </div>
          <p>
            <span aria-hidden="true">∅</span> Train and test identities are
            disjoint
          </p>
        </article>
      </div>

      <div
        className={styles.previewScoreShift}
        role="group"
        aria-label={`Customer overlap falls from ${randomRows.entityOverlap.count} to ${wholeCustomers.entityOverlap.count}; accuracy falls from ${asPercent(randomRows.metrics.accuracy)} to ${asPercent(wholeCustomers.metrics.accuracy)}.`}
      >
        <div className={styles.previewScoreState}>
          <span>Random-row test</span>
          <strong>{asPercent(randomRows.metrics.accuracy)}</strong>
          <small>
            <b>{randomRows.entityOverlap.count}</b> customers overlap
          </small>
        </div>

        <div className={styles.previewTransition} aria-hidden="true">
          <span>→</span>
          <small>same model</small>
        </div>

        <div className={styles.previewScoreState}>
          <span>New-customer test</span>
          <strong>{asPercent(wholeCustomers.metrics.accuracy)}</strong>
          <small>
            <b>{wholeCustomers.entityOverlap.count}</b> customers overlap
          </small>
        </div>
      </div>

      <p className={styles.previewControlNote}>
        <span aria-hidden="true">✓</span>
        Model, features, preprocessing, sample sizes, and seed stayed fixed.
      </p>
    </figure>
  );
}

function VerifiedEvidence({
  evidence,
  presentation,
}: {
  evidence: VerifiedBeliefBreakEvidence;
  presentation: VerifiedBeliefBreakPresentation;
}) {
  const { randomRows, wholeCustomers } = evidence;
  const isPreview = presentation === "preview";

  return (
    <div
      className={`${styles.verifiedEvidence} ${isPreview ? styles.previewEvidence : ""}`}
      data-motion="verified-only"
    >
      {isPreview ? (
        <PreviewComparison
          randomRows={randomRows}
          wholeCustomers={wholeCustomers}
        />
      ) : (
        <MechanismDiagram presentation={presentation} />
      )}

      {isPreview ? null : (
        <div
          className={styles.resultPair}
          role="group"
          aria-label={`Customer overlap falls from ${randomRows.entityOverlap.count} to ${wholeCustomers.entityOverlap.count}; accuracy falls from ${asPercent(randomRows.metrics.accuracy)} to ${asPercent(wholeCustomers.metrics.accuracy)}.`}
        >
          <article aria-label="Customer overlap comparison">
            <span>Overlapping customers</span>
            <div>
              <strong>{randomRows.entityOverlap.count}</strong>
              <span aria-hidden="true">→</span>
              <strong>{wholeCustomers.entityOverlap.count}</strong>
            </div>
            <small>familiar identities → unseen identities</small>
          </article>
          <article aria-label="Accuracy comparison">
            <span>Accuracy</span>
            <div>
              <strong>{asPercent(randomRows.metrics.accuracy)}</strong>
              <span aria-hidden="true">→</span>
              <strong>{asPercent(wholeCustomers.metrics.accuracy)}</strong>
            </div>
            <small>random rows → whole-customer holdout</small>
          </article>
        </div>
      )}

      <p className={styles.finding}>
        {isPreview
          ? "A high score on familiar customers did not mean the model generalized to new ones."
          : "When familiar customers disappear from the test set, the score falls. The original score did not demonstrate generalization to new customers."}
      </p>

      <details className={styles.evidenceDisclosure}>
        <summary>Exact values and integrity</summary>
        <div className={styles.evidenceBody}>
          <div className={styles.tableWrap}>
            <table>
              <caption>Exact fixed-kernel evidence</caption>
              <thead>
                <tr>
                  <th scope="col">Evaluation</th>
                  <th scope="col">Customer relationship</th>
                  <th scope="col">Overlap</th>
                  <th scope="col">Accuracy proportion</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Random rows</th>
                  <td>Customers repeat across train and test</td>
                  <td>{randomRows.entityOverlap.count}</td>
                  <td>{String(randomRows.metrics.accuracy)}</td>
                </tr>
                <tr>
                  <th scope="row">Whole-customer holdout</th>
                  <td>Test customers are unseen during training</td>
                  <td>{wholeCustomers.entityOverlap.count}</td>
                  <td>{String(wholeCustomers.metrics.accuracy)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <dl className={styles.integrityList}>
            <div>
              <dt>Held fixed</dt>
              <dd>
                model, features, preprocessing, train/test sizes, and seed
              </dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{randomRows.model}</dd>
            </div>
            <div>
              <dt>Seed</dt>
              <dd>{randomRows.seed}</dd>
            </div>
            <div>
              <dt>Result hash</dt>
              <dd>
                <code>{evidence.resultHash}</code>
              </dd>
            </div>
            <div>
              <dt>Fixture integrity</dt>
              <dd>
                <code>{evidence.fixtureIntegrityHash}</code>
              </dd>
            </div>
          </dl>
        </div>
      </details>
    </div>
  );
}

function IntegrityBoundMechanism({
  presentation,
  showModeLabel,
}: {
  presentation: VerifiedBeliefBreakPresentation;
  showModeLabel: boolean;
}) {
  const [integrity, setIntegrity] = useState<IntegrityState>({
    status: "checking",
  });

  useEffect(() => {
    let active = true;
    void verifyBundledEvidence()
      .then((evidence) => {
        if (active) setIntegrity({ status: "verified", evidence });
      })
      .catch(() => {
        if (active) setIntegrity({ status: "rejected" });
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div
      className={`${styles.mechanismBody} ${presentation === "preview" ? styles.previewBody : ""}`}
      data-layout={presentation === "preview" ? "stable-preview" : "flow"}
    >
      {showModeLabel ? (
        <span className={styles.modeLabel}>
          <span aria-hidden="true">✓</span> {MODE_LABEL}
        </span>
      ) : null}

      {integrity.status === "checking" ? (
        <div
          className={styles.integrityState}
          role="status"
          aria-label="Checking verified belief-break evidence"
          aria-live="polite"
        >
          <strong>Checking fixed evidence…</strong>
          <span>Result values stay hidden until every hash resolves.</span>
        </div>
      ) : null}

      {integrity.status === "rejected" ? (
        <div
          className={styles.integrityState}
          role="alert"
          aria-label="Verified belief-break evidence unavailable"
        >
          <strong>Verified sample evidence is unavailable.</strong>
          <span>
            CounterLab refused to present values because their integrity binding
            did not resolve.
          </span>
        </div>
      ) : null}

      {integrity.status === "verified" ? (
        <VerifiedEvidence
          evidence={integrity.evidence}
          presentation={presentation}
        />
      ) : null}
    </div>
  );
}

export function VerifiedBeliefBreakMechanism({
  presentation = "full",
}: {
  presentation?: VerifiedBeliefBreakPresentation;
}) {
  return (
    <section
      className={`${styles.embeddedMechanism} ${presentation === "preview" ? styles.preview : ""}`}
      aria-label="Verified sample belief-break mechanism"
      data-presentation={presentation}
    >
      <IntegrityBoundMechanism
        presentation={presentation}
        showModeLabel={true}
      />
    </section>
  );
}

export function VerifiedBeliefBreakTheater({
  presentation = "full",
}: {
  presentation?: VerifiedBeliefBreakPresentation;
}) {
  const headingId = useId();
  const isPreview = presentation === "preview";

  return (
    <section
      className={`${styles.theater} ${isPreview ? styles.preview : ""}`}
      aria-labelledby={headingId}
      data-presentation={presentation}
    >
      <header className={styles.header}>
        <div>
          <span className={styles.modeLabel}>
            <span aria-hidden="true">✓</span> {MODE_LABEL}
          </span>
          <h2 id={headingId}>
            {isPreview
              ? "One fair test changed what the score means."
              : "Watch one fair test change the conclusion."}
          </h2>
        </div>
        <p>
          {isPreview
            ? "Same model and sample sizes. Only who counts as new changes."
            : "Same model. Same metric. Only the evaluation unit changes."}
        </p>
      </header>

      <IntegrityBoundMechanism
        presentation={presentation}
        showModeLabel={false}
      />
    </section>
  );
}
