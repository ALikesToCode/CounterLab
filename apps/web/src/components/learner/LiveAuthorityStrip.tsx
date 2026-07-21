import styles from "./LiveAuthorityStrip.module.css";

const authorities = [
  {
    name: "GPT-5.6",
    responsibility: "Proposes a bounded belief frame",
  },
  {
    name: "Runtime Codex",
    responsibility: "Compiles allowlisted experiment plans",
  },
  {
    name: "Fixed kernel",
    responsibility: "Computes the numerical result",
  },
  {
    name: "Frozen verifier",
    responsibility: "Decides validity and releases evidence",
  },
] as const;

export function LiveAuthorityStrip() {
  return (
    <section
      className={styles.strip}
      aria-label="Authority roles for a live notebook run"
      data-authority-context="live-capability"
    >
      <div className={styles.heading}>
        <span className={styles.badge}>Live path</span>
        <p>
          <strong>Live authority</strong>
          <span>No live call starts on this screen.</span>
        </p>
      </div>

      <dl className={styles.authorities}>
        {authorities.map((authority) => (
          <div key={authority.name}>
            <dt>{authority.name}</dt>
            <dd>{authority.responsibility}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
