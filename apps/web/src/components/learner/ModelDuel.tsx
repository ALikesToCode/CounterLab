import { useId } from "react";

import styles from "./ModelDuel.module.css";

export type DuelModel = Readonly<{
  statement: string;
  prediction: string;
  conditions: readonly string[];
  nonClaims: readonly string[];
}>;

function ModelCard({ label, model }: { label: string; model: DuelModel }) {
  return (
    <article
      className={styles.model}
      data-model-weight="equal"
      aria-label={label}
    >
      <h3 className={styles.modelLabel}>{label}</h3>
      <p className={styles.modelStatement}>{model.statement}</p>
      <p className={styles.prediction}>
        <strong>Predicts</strong>
        {model.prediction}
      </p>
      <details className={styles.scope}>
        <summary>Conditions and limits</summary>
        <div>
          <section>
            <h4>Applies when</h4>
            <ul>
              {model.conditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
          </section>
          <section>
            <h4>Does not claim</h4>
            <ul>
              {model.nonClaims.map((nonClaim) => (
                <li key={nonClaim}>{nonClaim}</li>
              ))}
            </ul>
          </section>
        </div>
      </details>
    </article>
  );
}

export function ModelDuel({
  current,
  alternative,
  onConfirm,
  onEdit,
  onInsufficientEvidence,
  onReject,
  confirmed = false,
}: {
  current: DuelModel;
  alternative: DuelModel;
  onConfirm: () => void;
  onEdit: () => void;
  onInsufficientEvidence: () => void;
  onReject: () => void;
  confirmed?: boolean;
}) {
  const titleId = useId();
  const comparison = (
    <div className={styles.models}>
      <ModelCard label="Your current explanation" model={current} />
      <span className={styles.versus} aria-hidden="true">
        versus
      </span>
      <ModelCard label="Alternative CounterLab will test" model={alternative} />
    </div>
  );

  return (
    <section
      id="model-duel"
      className={styles.duel}
      aria-labelledby={titleId}
      data-confirmed={confirmed ? "true" : "false"}
    >
      <header>
        <span>Two explanations, one fair test</span>
        <h2 id={titleId}>
          Does your current explanation capture what you mean?
        </h2>
        <p>
          Both models can fit the evidence so far. Confirm your meaning before
          CounterLab tests how their predictions differ.
        </p>
      </header>

      {confirmed ? (
        <details className={styles.confirmedReview}>
          <summary>
            <span aria-hidden="true">✓</span> Explanation confirmed · Review
            both models
          </summary>
          {comparison}
        </details>
      ) : (
        <>
          {comparison}
          <div className={styles.actions}>
            <button
              className={styles.primary}
              type="button"
              onClick={onConfirm}
            >
              Yes, this captures my view
            </button>
            <button className={styles.secondary} type="button" onClick={onEdit}>
              Edit my explanation
            </button>
          </div>

          <details className={styles.tertiary}>
            <summary>More ways to respond</summary>
            <div>
              <button type="button" onClick={onInsufficientEvidence}>
                Not enough evidence
              </button>
              <button type="button" onClick={onReject}>
                Reject
              </button>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
