import styles from "./VerifiedBeliefBreakTheater.module.css";
import previewStyles from "./LockedBeliefBreakPreview.module.css";

export function LockedBeliefBreakEvidence() {
  return (
    <div
      className={`${styles.verifiedEvidence} ${styles.previewEvidence} ${styles.foldEvidence}`}
      data-motion="none"
    >
      <figure className={styles.foldComparison}>
        <figcaption>
          <span>Fair-test mechanism</span>
          <strong>Result locked until Prediction</strong>
        </figcaption>

        <div
          className={styles.foldCausalRow}
          role="group"
          aria-label="Changed variable: evaluation unit. The fair test compares familiar-row evaluation with whole-entity holdout. The model, features, preprocessing, sample sizes, metric, and seed stay fixed. Result values remain hidden until Prediction is sealed."
        >
          <span>Familiar rows · identities may repeat</span>
          <b>Evaluation unit</b>
          <span>Unseen entities · identities stay apart</span>
        </div>

        <div
          className={styles.previewScoreShift}
          role="group"
          aria-label="The familiar-row and unseen-entity scores are hidden until the learner seals a Prediction."
        >
          <div className={styles.previewScoreState}>
            <span>Familiar-row test</span>
            <strong aria-label="result hidden">—</strong>
            <small>identity may cross the split</small>
          </div>
          <div className={styles.previewTransition} aria-hidden="true">
            <span>→</span>
            <small>same model</small>
          </div>
          <div className={styles.previewScoreState}>
            <span>Unseen-entity test</span>
            <strong aria-label="result hidden">—</strong>
            <small>test identities stay new</small>
          </div>
        </div>

        <p className={styles.previewControlNote}>
          <span aria-hidden="true">✓</span>
          Model, features, preprocessing, sample sizes, metric, and seed stay
          fixed.
        </p>
      </figure>

      <p className={styles.foldFinding}>
        Seal what you expect before CounterLab reveals whether the conclusion
        stays similar when only the evaluation unit changes.
      </p>

      <dl className={styles.foldTakeaway}>
        <div>
          <dt>Boundary question</dt>
          <dd>Where does the conclusion change or stop applying?</dd>
        </div>
        <div>
          <dt>Learner action</dt>
          <dd>Predict first, then let verified evidence answer.</dd>
        </div>
      </dl>
    </div>
  );
}

export function LockedBeliefBreakPreview({
  density = "full",
}: {
  density?: "full" | "strip";
}) {
  if (density === "strip") {
    return (
      <section
        className={previewStyles.strip}
        aria-label="Fair-test preview with result locked"
        data-motion="none"
        data-presentation="strip"
        data-result-visibility="locked"
      >
        <p className={previewStyles.status}>
          <span>Fair-test preview</span>
          <strong>Result locked until Prediction</strong>
        </p>
        <p
          className={previewStyles.sequence}
          aria-label="The fair test changes who counts as new: familiar rows become unseen customers."
        >
          <span>Familiar rows</span>
          <span className={previewStyles.change}>
            <span aria-hidden="true">→</span>
            change who counts as new
          </span>
          <span>Unseen customers</span>
        </p>
        <p className={previewStyles.heldFixed}>
          <span aria-hidden="true">✓</span>
          Same model, features, preprocessing, sample size, metric, and seed.
        </p>
      </section>
    );
  }

  return (
    <section
      className={`${styles.embeddedMechanism} ${styles.preview} ${styles.compact}`}
      aria-label="Belief-break fair-test mechanism with result locked"
      data-presentation="compact"
      data-result-visibility="locked"
    >
      <div
        className={`${styles.mechanismBody} ${styles.previewBody} ${styles.compactBody}`}
        data-layout="stable-preview"
      >
        <LockedBeliefBreakEvidence />
      </div>
    </section>
  );
}
