import { useId } from "react";

import styles from "./PredictionSeal.module.css";

export type PredictionDisplay = Readonly<{
  label: string;
  value: string;
}>;

export type PredictionOption = Readonly<{
  value: string;
  label: string;
  description?: string;
}>;

function PredictionComparison({
  notebookScore,
  interventionExpectation,
}: {
  notebookScore: PredictionDisplay;
  interventionExpectation: PredictionDisplay;
}) {
  return (
    <div className={styles.comparison} aria-label="Prediction comparison">
      <article>
        <span>{notebookScore.label}</span>
        <strong>{notebookScore.value}</strong>
      </article>
      <span className={styles.arrow} aria-hidden="true">
        →
      </span>
      <article>
        <span>{interventionExpectation.label}</span>
        <strong>{interventionExpectation.value}</strong>
      </article>
    </div>
  );
}

export function PredictionSeal({
  notebookScore,
  interventionExpectation,
  options,
  choice,
  confidence,
  committed,
  onChoiceChange,
  onConfidenceChange,
  onCommit,
}: {
  notebookScore: PredictionDisplay;
  interventionExpectation: PredictionDisplay;
  options: readonly PredictionOption[];
  choice: string | null;
  confidence: number;
  committed: boolean;
  onChoiceChange: (choice: string) => void;
  onConfidenceChange: (confidence: number) => void;
  onCommit: () => void;
}) {
  const titleId = useId();
  const radioName = useId();
  const selectedOption = options.find((option) => option.value === choice);

  if (committed && choice === null) {
    throw new Error("A committed Prediction requires a categorical choice");
  }

  if (committed) {
    return (
      <section
        className={`${styles.seal} ${styles.committed}`}
        aria-label="Sealed prediction"
      >
        <header>
          <span>Prediction sealed</span>
          <strong aria-hidden="true">🔒</strong>
        </header>
        <PredictionComparison
          notebookScore={notebookScore}
          interventionExpectation={interventionExpectation}
        />
        <dl className={styles.sealedSummary}>
          <div>
            <dt>Categorical choice</dt>
            <dd>{selectedOption?.label ?? choice}</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{confidence}%</dd>
          </div>
        </dl>
        <p>This expectation is locked before the verified result appears.</p>
      </section>
    );
  }

  return (
    <section className={styles.seal} aria-labelledby={titleId}>
      <header>
        <div>
          <span>Prediction</span>
          <h2 id={titleId}>Seal what you expect before the result appears.</h2>
        </div>
      </header>
      <PredictionComparison
        notebookScore={notebookScore}
        interventionExpectation={interventionExpectation}
      />
      <fieldset className={styles.options}>
        <legend>What do you expect?</legend>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={radioName}
              value={option.value}
              checked={choice === option.value}
              onChange={() => onChoiceChange(option.value)}
            />
            <span>
              <strong>{option.label}</strong>
              {option.description === undefined ? null : (
                <small>{option.description}</small>
              )}
            </span>
          </label>
        ))}
      </fieldset>
      <label className={styles.confidence}>
        <span>
          Confidence <strong>{confidence}%</strong>
        </span>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={confidence}
          aria-label="Prediction confidence"
          onChange={(event) => onConfidenceChange(Number(event.target.value))}
        />
      </label>
      <button
        className={styles.commit}
        type="button"
        disabled={choice === null}
        onClick={onCommit}
      >
        Seal my prediction
      </button>
    </section>
  );
}
