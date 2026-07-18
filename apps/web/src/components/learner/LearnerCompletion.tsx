import { useId, useState } from "react";
import type { ReactNode, SyntheticEvent } from "react";

import styles from "./LearnerCompletion.module.css";

export interface LearnerCapability {
  intro: string;
  first: string;
  connector: string;
  second: string;
}

export interface LearnerCompletionAction {
  label: string;
  onActivate: () => void;
  disabled?: boolean;
}

export interface LearnerTransferStatus {
  label: string;
  detail?: string;
}

export interface LearnerCompletionProps {
  titleId?: string;
  headingLevel?: "h1" | "h2";
  capability: LearnerCapability;
  beforeReasoning: ReactNode;
  afterReasoning: ReactNode;
  transferStatus: LearnerTransferStatus;
  repairedNotebookAction: LearnerCompletionAction;
  proofCapsuleAction: LearnerCompletionAction;
  nextCaseAction?: LearnerCompletionAction;
  evidenceAndProof: ReactNode;
}

function CompletionActionButton({
  action,
  className,
}: {
  action: LearnerCompletionAction;
  className: string | undefined;
}) {
  return (
    <button
      className={className}
      type="button"
      onClick={action.onActivate}
      disabled={action.disabled}
    >
      {action.label}
    </button>
  );
}

export function LearnerCompletion({
  titleId,
  headingLevel = "h2",
  capability,
  beforeReasoning,
  afterReasoning,
  transferStatus,
  repairedNotebookAction,
  proofCapsuleAction,
  nextCaseAction,
  evidenceAndProof,
}: LearnerCompletionProps) {
  const instanceId = useId();
  const resolvedTitleId = titleId ?? `${instanceId}-title`;
  const Heading = headingLevel;
  const [evidenceRevealed, setEvidenceRevealed] = useState(false);

  const revealEvidence = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (event.currentTarget.open) setEvidenceRevealed(true);
  };

  return (
    <section
      className={styles.completion}
      aria-labelledby={resolvedTitleId}
      data-motion="reduced-safe"
    >
      <header className={styles.capability}>
        <Heading id={resolvedTitleId} tabIndex={-1}>
          {capability.intro}
        </Heading>
        <p className={styles.comparison}>
          <q>{capability.first}</q>
          <span>{capability.connector}</span>
          <q>{capability.second}</q>
        </p>
      </header>

      <section
        className={styles.reasoning}
        aria-labelledby={`${instanceId}-reasoning-title`}
      >
        <h3 id={`${instanceId}-reasoning-title`}>Before and after reasoning</h3>
        <dl>
          <div>
            <dt>Before</dt>
            <dd>{beforeReasoning}</dd>
          </div>
          <div>
            <dt>After</dt>
            <dd>{afterReasoning}</dd>
          </div>
        </dl>
      </section>

      <section
        className={styles.transfer}
        aria-labelledby={`${instanceId}-transfer-title`}
        role="status"
      >
        <h3 id={`${instanceId}-transfer-title`}>Transfer status</h3>
        <p className={styles.transferLabel}>{transferStatus.label}</p>
        {transferStatus.detail ? <p>{transferStatus.detail}</p> : null}
      </section>

      <div className={styles.actions} aria-label="Completion actions">
        <CompletionActionButton
          action={repairedNotebookAction}
          className={styles.primaryAction}
        />
        <CompletionActionButton
          action={proofCapsuleAction}
          className={styles.secondaryAction}
        />
        {nextCaseAction ? (
          <CompletionActionButton
            action={nextCaseAction}
            className={styles.tertiaryAction}
          />
        ) : null}
      </div>

      <details className={styles.evidence} onToggle={revealEvidence}>
        <summary>Evidence &amp; proof</summary>
        {evidenceRevealed ? (
          <div className={styles.evidenceBody}>{evidenceAndProof}</div>
        ) : null}
      </details>
    </section>
  );
}
