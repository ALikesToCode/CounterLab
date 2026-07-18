import styles from "./LearnerCoach.module.css";

export function LearnerCoach({ next, why }: { next: string; why: string }) {
  return (
    <aside className={styles.coach} aria-label="Learner coach">
      <p>
        <strong>Next:</strong> {next}
      </p>
      <details className={styles.why}>
        <summary>Why?</summary>
        <p>{why}</p>
      </details>
    </aside>
  );
}
