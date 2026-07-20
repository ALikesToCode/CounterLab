import type { CapabilityHealth } from "../../api";
import { VerifiedBeliefBreakMechanism } from "../../components/learner/VerifiedBeliefBreakTheater";
import { verifiedReplay } from "../../sampleReplayMetadata";
import styles from "./JudgeModeView.module.css";
import { SampleEvidencePack } from "./SampleEvidencePack";

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
    health?.readiness === "ready" &&
    health.liveGpt === "configured" &&
    health.liveCodex === "configured" &&
    health.liveKernel === "configured" &&
    health.sandbox === "credential-and-privilege-boundary" &&
    health.generationFilesystemReadIsolation === "OS_ENFORCED" &&
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
          <p className={styles.kicker}>
            Evidence-first learning for notebook users
          </p>
          <h1 id="judge-title" tabIndex={-1}>
            See a verified belief break in ten seconds.
          </h1>
          <p className={styles.lede}>
            Seal a Prediction, change one condition, and let fixed evidence—not
            AI prose—release the bounded result. CounterLab turns the
            learner&apos;s notebook claim into a checkable Question → Prediction
            → Test → Boundary → Apply → Repair record.
          </p>
        </div>

        <aside
          className={styles.twentySecondProof}
          aria-label="Ten second fixed sample preview"
        >
          <header>
            <span>Completed fixed sample · not a live result</span>
            <b>Hashes checked before values</b>
          </header>
          <blockquote>
            “This score proves the model works for customers it has never seen.”
          </blockquote>
          <p className={styles.previewAuthority}>
            Approved fixed sample framing. No GPT-5.6, Codex, or runner call
            occurs in this preview.
          </p>
          <VerifiedBeliefBreakMechanism presentation="compact" />
          <a className={styles.previewProofLink} href="#sample-evidence">
            Inspect exact values and integrity
          </a>
        </aside>

        <div className={styles.heroAfter}>
          <div className={styles.heroActions}>
            {liveReady ? (
              <a href="/new">
                Run an unprimed live test <span aria-hidden="true">→</span>
              </a>
            ) : (
              <button
                type="button"
                onClick={onRetryHealth}
                disabled={healthPending}
              >
                Check live readiness
              </button>
            )}
            <a href="/replay/leakage-01">Inspect stored evidence</a>
          </div>
          <p className={styles.scopeLine}>
            Released notebook support: entity leakage and class imbalance in
            documented Python/scikit-learn Jupyter patterns.
          </p>
        </div>
      </section>

      <section
        className={styles.authoritySection}
        aria-labelledby="authority-title"
      >
        <header>
          <p>Generated vs. computed vs. verified</p>
          <h2 id="authority-title">Four authorities. No blurred hand-offs.</h2>
          <p>
            These roles describe supported live notebook runs. The disclosed
            sample above uses checked-in fixed evidence; replay shows stored
            historical evidence and makes no new calls.
          </p>
        </header>
        <div className={styles.authorityGrid}>
          <article>
            <span className={styles.authorityIndex}>A</span>
            <h3>GPT-5.6</h3>
            <strong>Frames a supported live belief</strong>
            <p>
              Reads only approved, sanitized evidence and proposes competing
              hypotheses. It cannot execute the notebook or invent results.
            </p>
          </article>
          <article>
            <span className={styles.authorityIndex}>B</span>
            <h3>Runtime Codex</h3>
            <strong>Compiles a supported live test plan</strong>
            <p>
              Produces bounded operation IDs and repairs structured plans. It
              cannot author formulas, metrics, or unrestricted code.
            </p>
          </article>
          <article>
            <span className={styles.authorityIndex}>C</span>
            <h3>Fixed kernel</h3>
            <strong>Computes live result values</strong>
            <p>
              In a live run, it executes registered split, metric, Boundary Map,
              and transfer operations deterministically. Sample and replay
              surfaces disclose stored evidence instead.
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
            <h3>Open the disclosed sample walkthrough.</h3>
            <p>
              Bundled approved evidence. Fast, deterministic, no account or
              model credential. Because its answer is visible above, this path
              is not counted as an unassisted Prediction.
            </p>
            <button type="button" onClick={onStartSample}>
              Open disclosed walkthrough <span aria-hidden="true">→</span>
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
                  ? "Exact runner readiness was observed; model credentials are exercised only by a live run"
                  : healthError !== null
                    ? "Live authority is unavailable; readiness could not be checked"
                    : health?.generationFilesystemReadIsolation === "PARTIAL"
                      ? "Generation filesystem read isolation is partial, so live authority remains unavailable"
                      : health?.readiness === "not-checked"
                        ? "Live readiness has not been checked"
                        : "Live authority did not pass the latest readiness check"}
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

      <section
        className={styles.lineageSection}
        aria-labelledby="lineage-title"
      >
        <header>
          <p>Established pedagogy, a different evidence layer</p>
          <h2 id="lineage-title">What CounterLab builds on—and adds.</h2>
          <p>
            CounterLab does not claim to invent predict-before-reveal. Its
            narrower contribution is binding that learning loop to a supported
            artifact, fixed computation, frozen verification, deterministic
            transfer, and a portable evidence record.
          </p>
        </header>
        <div className={styles.contrastGrid}>
          <article>
            <span>Learning-science lineage</span>
            <h3>Predict–Observe–Explain and Peer Instruction</h3>
            <p>
              These approaches establish prediction and commitment before the
              reveal. CounterLab carries that lineage into a machine-checked,
              artifact-bound loop; the pedagogy itself is not new.
            </p>
            <div className={styles.sourceLinks}>
              <a
                href="https://teach.lams.es/pedagogies/poe"
                rel="noreferrer"
                target="_blank"
              >
                LAMS POE overview
              </a>
              <a
                href="https://www.frontiersin.org/journals/education/articles/10.3389/feduc.2018.00033/full"
                rel="noreferrer"
                target="_blank"
              >
                Peer Instruction review
              </a>
            </div>
          </article>
          <article>
            <span>Closest lesson pattern</span>
            <h3>LAMS Predict–Observe–Explain</h3>
            <p>
              LAMS already pairs prediction, confidence, explanation, and
              reflection. CounterLab adds a fixed transfer gate and separates
              learner-facing Reasoning Diff from machine-facing Proof Capsule.
            </p>
            <a
              href="https://teach.lams.es/pedagogies/poe"
              rel="noreferrer"
              target="_blank"
            >
              Inspect the prior-art template
            </a>
          </article>
          <article>
            <span>Closest notebook tooling</span>
            <h3>NBLyzer and sklearn-diagnose</h3>
            <p>
              These tools detect or diagnose notebook and model problems.
              CounterLab&apos;s scoped difference is learner action: predict,
              inspect one controlled test, map a Boundary, and pass transfer
              before Repair unlocks.
            </p>
            <div className={styles.sourceLinks}>
              <a
                href="https://arxiv.org/html/2603.10742v3"
                rel="noreferrer"
                target="_blank"
              >
                NBLyzer paper
              </a>
              <a
                href="https://github.com/leockl/sklearn-diagnose"
                rel="noreferrer"
                target="_blank"
              >
                sklearn-diagnose repository
              </a>
            </div>
          </article>
        </div>
      </section>

      <SampleEvidencePack />

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
                <div>
                  <dt>Timeout cleanup proof</dt>
                  <dd>
                    <code>{release.timeoutCleanupReceiptSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Aggregate limit evidence</dt>
                  <dd>
                    <code>{release.aggregateLimitEvidenceSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Qualification runtime policy</dt>
                  <dd>
                    <code>{release.runtimePolicySha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Qualification proof dependency manifest</dt>
                  <dd>
                    <code>{release.proofDependencyManifestSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Frozen Worker artifact manifest SHA-256</dt>
                  <dd>
                    <code>{release.workerArtifactManifestSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Frozen Worker bundle SHA-256</dt>
                  <dd>
                    <code>{release.workerBundleSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Worker artifact evidence class</dt>
                  <dd>
                    <code>{release.workerArtifactClassification}</code>
                  </dd>
                </div>
                <div>
                  <dt>Frozen client deploy tree SHA-256</dt>
                  <dd>
                    <code>{release.clientAssetsSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Frozen client deploy tree files</dt>
                  <dd>{release.clientAssetCount}</dd>
                </div>
                <div>
                  <dt>Fetchable public client subset SHA-256</dt>
                  <dd>
                    <code>{release.clientPublicAssetsSha256}</code>
                  </dd>
                </div>
                <div>
                  <dt>Fetchable public client files</dt>
                  <dd>{release.clientPublicAssetCount}</dd>
                </div>
                <div>
                  <dt>Frozen build tools</dt>
                  <dd>
                    Vite <code>{release.viteVersion}</code>; Wrangler{" "}
                    <code>{release.wranglerVersion}</code>
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
