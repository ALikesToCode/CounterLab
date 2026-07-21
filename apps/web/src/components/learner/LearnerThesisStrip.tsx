import styles from "./LearnerThesisStrip.module.css";

const stages = [
  {
    label: "State claim",
    action: "Name what you want to test",
  },
  {
    label: "Lock Prediction",
    action: "Commit before results",
  },
  {
    label: "Controlled test",
    action: "Run; result passes verification before release",
  },
] as const;

export function LearnerThesisStrip() {
  return (
    <section
      className={styles.strip}
      aria-label="How the opening sequence works"
      data-motion="none"
    >
      <div className={styles.intro}>
        <span className={styles.eyebrow}>How the opening sequence works</span>
        <p>
          State claim → lock Prediction → controlled test runs → result passes
          verification.
        </p>
      </div>

      <ol className={styles.stages} aria-label="CounterLab opening sequence">
        {stages.map((stage, index) => (
          <li key={stage.label}>
            <span className={styles.index} aria-hidden="true">
              {index + 1}
            </span>
            <span className={styles.stageCopy}>
              <strong>{stage.label}</strong>
              <span>{stage.action}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
