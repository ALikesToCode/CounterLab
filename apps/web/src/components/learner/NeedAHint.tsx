import type { SyntheticEvent } from "react";

import type { LearnerHintId } from "../../api";
import styles from "./NeedAHint.module.css";

export interface NeedAHintProps {
  hintId: LearnerHintId;
  hint: string;
  evidenceHref: string;
  evidenceLabel?: string;
  onOpen?: (hintId: LearnerHintId) => void;
}

export function NeedAHint({
  hintId,
  hint,
  evidenceHref,
  evidenceLabel = "Review the linked evidence",
  onOpen,
}: NeedAHintProps) {
  function handleToggle(event: SyntheticEvent<HTMLDetailsElement>) {
    if (event.currentTarget.open) {
      onOpen?.(hintId);
    }
  }

  return (
    <aside className={styles.hint} aria-label="Contextual help">
      <details onToggle={handleToggle}>
        <summary>Need a hint?</summary>
        <div className={styles.hintBody}>
          <p>{hint}</p>
          <a href={evidenceHref}>{evidenceLabel}</a>
        </div>
      </details>
    </aside>
  );
}
