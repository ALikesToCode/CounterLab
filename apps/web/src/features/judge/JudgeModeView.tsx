import type { CapabilityHealth } from "../../api";
import { getRun, verifiedReplay } from "../../sample";
import styles from "./JudgeModeView.module.css";

const percentage = new Intl.NumberFormat("en", {
  style: "percent",
  maximumFractionDigits: 1,
});

const learnerStages = [
  ["01", "Question", "Name the claim and bind it to exact evidence."],
  ["02", "Prediction", "Commit an expectation before results exist."],
  ["03", "Test", "Select and verify one discriminating intervention."],
  ["04", "Boundary", "Map where the result changes or stops applying."],
  ["05", "Apply", "Use the rule on a surface-different case."],
  ["06", "Repair", "Unlock the smallest verified notebook correction."],
] as const;

function liveAuthorityReady(health: CapabilityHealth | null): boolean {
  return (
    health?.liveGpt === "configured" &&
    health.liveCodex === "configured" &&
    health.liveKernel === "configured" &&
    health.sandbox === "credential-and-privilege-boundary" &&
    health.generationFilesystemReadIsolation === "PARTIAL" &&
    health.release?.status === "bound"
  );
}

export function JudgeModeView({
  health,
  healthPending,
  healthError,
  onRetryHealth,
  onStartSample,
}: {
  health: CapabilityHealth | null;
  healthPending: boolean;
  healthError: string | null;
  onRetryHealth: () => void;
  onStartSample: () => void;
}) {
  const random = getRun("random_row_split");
  const grouped = getRun("customer_group_split");
  const liveReady = liveAuthorityReady(health);
  const release = health?.release?.status === "bound" ? health.release : null;

  return (
    <main className={styles.page} id="main-content" tabIndex={-1}>
      <a className="skip-link" href="#judge-title">
        Skip to main content
      </a>
      <header className={styles.masthead}>
        <a className={styles.wordmark} href="/" aria-label="CounterLab home">
          <span aria-hidden="true">C/L</span>
          <strong>CounterLab</strong>
        </a>
        <div className={styles.dossierLabel}>
          <span>Public evidence dossier</span>
          <b>Judge Mode</b>
        </div>
        <a className={styles.homeLink} href="/">
          Learner view <span aria-hidden="true">↗</span>
        </a>
      </header>

      <section className={styles.hero} aria-labelledby="judge-title">
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Ask like chat. Prove it like science.</p>
          <h1 id="judge-title" tabIndex={-1}>
            See a belief break in twenty seconds.
          </h1>
          <p className={styles.lede}>
            CounterLab turns a notebook claim into two competing models, locks
            the learner&apos;s prediction, and lets fixed computation—not fluent
            prose—decide what the evidence supports.
          </p>
          <div className={styles.heroActions}>
            <button type="button" onClick={onStartSample}>
              Start sample <span aria-hidden="true">→</span>
            </button>
            <a href="/replay/leakage-01">Watch verified replay</a>
          </div>
          <p className={styles.scopeLine}>
            Released notebook support: entity leakage and class imbalance in
            documented Python/scikit-learn Jupyter patterns.
          </p>
        </div>

        <aside
          className={styles.twentySecondProof}
          aria-label="Twenty second proof"
        >
          <header>
            <span>Verified sample notebook evidence</span>
            <b>Fixed-kernel evidence</b>
          </header>
          <blockquote>
            “This score proves the model works for customers it has never seen.”
          </blockquote>
          <div className={styles.scoreComparison}>
            <div>
              <span>Random rows</span>
              <strong>{percentage.format(random.metrics.accuracy)}</strong>
              <small>{random.entityOverlap.count} shared customers</small>
            </div>
            <i aria-hidden="true">≠</i>
            <div>
              <span>Whole customers</span>
              <strong>{percentage.format(grouped.metrics.accuracy)}</strong>
              <small>{grouped.entityOverlap.count} shared customers</small>
            </div>
          </div>
          <p>
            Same estimator and preprocessing. The evaluation unit changed to
            match the deployment claim.
          </p>
        </aside>
      </section>

      <section
        className={styles.authoritySection}
        aria-labelledby="authority-title"
      >
        <header>
          <p>Generated vs. computed vs. verified</p>
          <h2 id="authority-title">Four authorities. No blurred hand-offs.</h2>
        </header>
        <div className={styles.authorityGrid}>
          <article>
            <span className={styles.authorityIndex}>A</span>
            <h3>GPT-5.6</h3>
            <strong>Frames the belief</strong>
            <p>
              Reads only approved, sanitized evidence and proposes competing
              hypotheses. It cannot execute the notebook or invent results.
            </p>
          </article>
          <article>
            <span className={styles.authorityIndex}>B</span>
            <h3>Runtime Codex</h3>
            <strong>Compiles the test plan</strong>
            <p>
              Produces bounded operation IDs and repairs structured plans. It
              cannot author formulas, metrics, or unrestricted code.
            </p>
          </article>
          <article>
            <span className={styles.authorityIndex}>C</span>
            <h3>Fixed kernel</h3>
            <strong>Computes every number</strong>
            <p>
              Runs registered split, metric, Boundary Map, and transfer
              operations deterministically from versioned inputs.
            </p>
          </article>
          <article>
            <span className={styles.authorityIndex}>D</span>
            <h3>Frozen verifier</h3>
            <strong>Decides what may ship</strong>
            <p>
              Rejects confounded plans, unresolved bindings, sample leakage,
              broad patches, and claims that exceed the signed evidence.
            </p>
          </article>
        </div>
      </section>

      <section className={styles.pathsSection} aria-labelledby="paths-title">
        <header>
          <p>Choose the evidence mode</p>
          <h2 id="paths-title">Three paths. Three explicit meanings.</h2>
        </header>
        <div className={styles.pathGrid}>
          <article>
            <span className={styles.modeTag}>Sample lesson</span>
            <h3>Try the complete learning loop.</h3>
            <p>
              Bundled approved evidence. Fast, deterministic, no account or
              model credential. Always labelled as a sample.
            </p>
            <button type="button" onClick={onStartSample}>
              Start sample <span aria-hidden="true">→</span>
            </button>
          </article>

          <article
            className={liveReady ? styles.liveReady : styles.liveUnavailable}
          >
            <span className={styles.modeTag}>Live notebook analysis</span>
            <h3>Test a supported notebook without running its cells.</h3>
            <p>
              Artifact-specific Belief Spec, Codex plan, fixed kernel,
              independent verification, transfer, and repair to a copy.
            </p>
            <div className={styles.liveStatus} role="status" aria-live="polite">
              <i aria-hidden="true" />
              {healthPending
                ? "Checking deployed authority…"
                : liveReady
                  ? "Deployed live authority is configured"
                  : "Live authority is unavailable"}
            </div>
            {liveReady ? (
              <a href="/new">
                Run live <span aria-hidden="true">→</span>
              </a>
            ) : (
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={onRetryHealth}
                disabled={healthPending}
              >
                Check live status
              </button>
            )}
            {healthError === null ? null : (
              <small className={styles.healthError}>{healthError}</small>
            )}
          </article>

          <article>
            <span className={styles.modeTag}>Verified replay</span>
            <h3>Inspect a genuine reject–repair trace.</h3>
            <p>
              Read-only stored events. No new model call, no new experiment, and
              a persistent replay banner on every screen.
            </p>
            <a href="/replay/leakage-01">
              Watch replay <span aria-hidden="true">→</span>
            </a>
            <small>
              Recorded{" "}
              {new Date(verifiedReplay.recordedAt).toLocaleDateString()}. This
              legacy v1 replay is genuine but does not offer a Proof Capsule
              download.
            </small>
          </article>
        </div>
      </section>

      <section className={styles.methodSection} aria-labelledby="method-title">
        <div className={styles.methodIntro}>
          <p>Not another answer box</p>
          <h2 id="method-title">A learning loop with a release gate.</h2>
          <p>
            Repair stays locked until the learner applies the rule in a changed
            context. The result is a Reasoning Diff for people and a Proof
            Capsule for machines.
          </p>
        </div>
        <ol className={styles.methodRail}>
          {learnerStages.map(([index, title, copy]) => (
            <li key={title}>
              <span>{index}</span>
              <div>
                <strong>{title}</strong>
                <p>{copy}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.proofSection} aria-labelledby="proof-title">
        <div>
          <p>What the evidence can claim</p>
          <h2 id="proof-title">Bounded proof, visible limitations.</h2>
          <ul>
            <li>
              Exact notebook cells and hashes bind the learner&apos;s claim.
            </li>
            <li>
              A verified result cannot appear before Prediction is locked.
            </li>
            <li>
              Transfer is fixed-code scored; no model grades free-form prose.
            </li>
            <li>The original notebook is never overwritten.</li>
          </ul>
        </div>
        <aside>
          <span>Known boundary</span>
          <h3>CounterLab does not claim universal notebook support.</h3>
          <p>
            It supports two reviewed ML Subject Packs and refuses unknown
            packages, arbitrary code execution, unsupported patch shapes, and
            insufficient evidence. A Proof Capsule proves integrity and scoped
            verification—not global mastery or formal sandbox security. The
            hosted Codex launch has a credential-and-privilege boundary;
            filesystem generation read isolation is explicitly PARTIAL.
          </p>
          <section
            className={styles.releaseIdentity}
            aria-labelledby="judge-release-title"
          >
            <h4 id="judge-release-title">Exact public build</h4>
            {release === null ? (
              <p>
                Release identity is unbound. Treat live qualification as
                unproven.
              </p>
            ) : (
              <dl>
                <div>
                  <dt>Worker commit</dt>
                  <dd>
                    <code>{release.workerEvidenceCommit}</code>
                  </dd>
                </div>
                <div>
                  <dt>Worker version</dt>
                  <dd>
                    <code>{release.workerVersionId}</code>
                  </dd>
                </div>
                <div>
                  <dt>Runner commit</dt>
                  <dd>
                    <code>{release.runnerSourceCommit}</code>
                  </dd>
                </div>
                <div>
                  <dt>Container digest</dt>
                  <dd>
                    <code>{release.runnerImageDigest}</code>
                  </dd>
                </div>
              </dl>
            )}
          </section>
        </aside>
      </section>

      <section
        className={styles.reproduceSection}
        aria-labelledby="reproduce-title"
      >
        <div>
          <p>Reproduce locally</p>
          <h2 id="reproduce-title">The demo has commands, not hand-waving.</h2>
        </div>
        <pre aria-label="CounterLab reproduction commands">
          <code>{`./scripts/test-all.sh\n./scripts/run-mutations.sh leakage\n./scripts/reproduce-session.sh leakage-01\n./scripts/replay-patch.sh leakage-01`}</code>
        </pre>
      </section>

      <footer className={styles.footer}>
        <strong>Chatbots explain.</strong>
        <span>CounterLab lets reality answer.</span>
        <a href="/">Open learner view</a>
      </footer>
    </main>
  );
}
