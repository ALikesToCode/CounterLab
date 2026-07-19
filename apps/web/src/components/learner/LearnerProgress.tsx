import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const mobileInstanceId = useId();
  const mobileTitleId = `${mobileInstanceId}-title`;
  const mobileDialogId = `${mobileInstanceId}-dialog`;
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const mobileDialog = useRef<HTMLDivElement>(null);
  const mobileClose = useRef<HTMLButtonElement>(null);
  const restoreMobileFocus = useRef(false);
  const currentStage = currentLearnerStage(stage, sessionState);
  const currentIndex = learnerStageIndex(currentStage);
  const items = learnerStageProgress(stage, sessionState);
  const current = items[currentIndex];

  useEffect(() => {
    if (mobileOpen) {
      mobileClose.current?.focus();
      return;
    }
    if (restoreMobileFocus.current) {
      restoreMobileFocus.current = false;
      mobileTrigger.current?.focus();
    }
  }, [mobileOpen]);

  if (current === undefined) {
    throw new Error(`Unknown learner stage: ${currentStage}`);
  }

  const closeMobileProgress = () => {
    restoreMobileFocus.current = true;
    setMobileOpen(false);
  };

  const containMobileFocus = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMobileProgress();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = mobileDialog.current;
    if (dialog === null) return;
    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (!dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const reviewStage = (reviewedStage: LearnerStageId) => {
    restoreMobileFocus.current = false;
    setMobileOpen(false);
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

      <div className={styles.mobile} data-testid="learner-progress-mobile">
        <button
          ref={mobileTrigger}
          className={styles.mobileSummary}
          type="button"
          aria-label={`Step ${currentIndex + 1} of ${items.length}: ${current.label}. Open all learner stages`}
          aria-expanded={mobileOpen}
          aria-controls={mobileDialogId}
          onClick={() => setMobileOpen(true)}
        >
          <span>
            Step {currentIndex + 1} of {items.length}
          </span>
          <strong>{current.label}</strong>
        </button>
        {mobileOpen ? (
          <>
            <div
              className={styles.mobileBackdrop}
              data-testid="learner-progress-backdrop"
              aria-hidden="true"
              onClick={closeMobileProgress}
            />
            <div
              ref={mobileDialog}
              className={styles.mobilePanel}
              id={mobileDialogId}
              role="dialog"
              aria-modal="true"
              aria-labelledby={mobileTitleId}
              onKeyDown={containMobileFocus}
            >
              <div className={styles.mobilePanelHeading}>
                <span id={mobileTitleId}>Your progress</span>
                <strong>
                  Step {currentIndex + 1} of {items.length}
                </strong>
                <button
                  ref={mobileClose}
                  type="button"
                  aria-label="Close progress"
                  onClick={closeMobileProgress}
                >
                  Close
                </button>
              </div>
              <nav aria-label="All learner stages">
                <StageItems items={items} onReviewStage={reviewStage} />
              </nav>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
