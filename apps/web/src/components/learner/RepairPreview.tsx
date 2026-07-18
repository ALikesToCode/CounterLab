import { useId } from "react";

import styles from "./RepairPreview.module.css";

export function RepairPreview({
  changed,
  preserved,
}: {
  changed: readonly string[];
  preserved: readonly string[];
}) {
  const instanceId = useId();
  return (
    <section
      className={styles.preview}
      aria-labelledby={`${instanceId}-title`}
      data-motion="reduced-safe"
    >
      <header>
        <span>Repair preview</span>
        <h2 id={`${instanceId}-title`}>
          Review the scope before the raw diff.
        </h2>
        <p>
          This summary describes the bounded repair scope. The preview does not
          change the transfer result or patch payload.
        </p>
      </header>
      <div className={styles.columns}>
        <section aria-labelledby={`${instanceId}-changed`}>
          <h3 id={`${instanceId}-changed`}>This repair changes:</h3>
          <ul>
            {changed.map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby={`${instanceId}-preserved`}>
          <h3 id={`${instanceId}-preserved`}>This repair preserves:</h3>
          <ul>
            {preserved.map((item) => (
              <li key={item}>
                <span aria-hidden="true">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
