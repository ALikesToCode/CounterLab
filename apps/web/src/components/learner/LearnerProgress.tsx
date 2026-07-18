import { useRef } from "react";
import type { SessionState } from "@counterlab/contracts";

import type { StudioStage } from "../studio/types";
import {
  currentLearnerStage,
  learnerStageIndex,
  learnerStageProgress,
  type LearnerStageId,
  type LearnerStageProgressItem,
} from "./learnerStages";
import styles from "./LearnerProgress.module.css";

function StageItems({
  items,
  onReviewStage,
}: {
  items: readonly LearnerStageProgressItem[];
  onReviewStage: (stage: LearnerStageId) => void;
}) {
  return (
    <ol className={styles.stageList}>
      {items.map((stage, index) => (
        <li className={styles[stage.status]} key={stage.id}>
          {stage.status === "completed" ? (
            <button
              className={styles.stageButton}
              type="button"
              aria-label={`Review ${stage.label}`}
              onClick={() => onReviewStage(stage.id)}
            >
              <span className={styles.marker} aria-hidden="true">
                ✓
              </span>
              <span>{stage.label}</span>
            </button>
          ) : (
            <span
              className={styles.stageLabel}
              aria-current={stage.status === "current" ? "step" : undefined}
              aria-disabled={stage.status === "future" ? "true" : undefined}
            >
              <span className={styles.marker} aria-hidden="true">
                {index + 1}
              </span>
              <span>{stage.label}</span>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function LearnerProgress({
  stage,
  sessionState,
  onReviewStage,
}: {
  stage: StudioStage;
  sessionState?: SessionState;
  onReviewStage: (stage: LearnerStageId) => void;
}) {
  const mobileDisclosure = useRef<HTMLDetailsElement>(null);
  const currentStage = currentLearnerStage(stage, sessionState);
  const currentIndex = learnerStageIndex(currentStage);
  const items = learnerStageProgress(stage, sessionState);
  const current = items[currentIndex];

  if (current === undefined) {
    throw new Error(`Unknown learner stage: ${currentStage}`);
  }

  const reviewStage = (reviewedStage: LearnerStageId) => {
    mobileDisclosure.current?.removeAttribute("open");
    onReviewStage(reviewedStage);
  };

  return (
    <div className={styles.progress}>
      <nav
        className={styles.desktop}
        aria-label="Learner progress"
        data-testid="learner-progress-desktop"
      >
        <StageItems items={items} onReviewStage={reviewStage} />
      </nav>

      <details
        ref={mobileDisclosure}
        className={styles.mobile}
        data-testid="learner-progress-mobile"
      >
        <summary className={styles.mobileSummary}>
          <span>
            Step {currentIndex + 1} of {items.length}
          </span>
          <strong>{current.label}</strong>
        </summary>
        <nav className={styles.mobilePanel} aria-label="All learner stages">
          <div className={styles.mobilePanelHeading}>
            <span>Your progress</span>
            <strong>
              Step {currentIndex + 1} of {items.length}
            </strong>
          </div>
          <StageItems items={items} onReviewStage={reviewStage} />
        </nav>
      </details>
    </div>
  );
}
