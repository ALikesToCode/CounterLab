import { useId } from "react";

import styles from "./TimelineTransfer.module.css";

export type TimelineSplitOption<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
  description: string;
  visual: "mixed" | "ordered";
}>;

export type TimelineFeatureOption<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
  description: string;
  crossesNow: boolean;
}>;

function featureOptionClassification(crossesNow: boolean): string {
  return crossesNow
    ? "Future-leaking risk. Reads outcomes from after NOW."
    : "Safe at prediction time. Not the future-leaking risk.";
}

function selectedFeatureClassification(crossesNow: boolean): string {
  return crossesNow
    ? "Selected feature classification: future-leaking risk. This identifies the risk requested by the fixed transfer task."
    : "Selected feature classification: safe at prediction time. This does not identify the requested future-leaking risk.";
}

export function TimelineTransfer<
  SplitValue extends string,
  FeatureValue extends string,
>({
  heading,
  scenario,
  trainingRange,
  testRange,
  splitValue,
  splitOptions,
  onSplitChange,
  featureValue,
  featureOptions,
  onFeatureChange,
  disabled = false,
}: {
  heading: string;
  scenario: string;
  trainingRange: string;
  testRange: string;
  splitValue: SplitValue;
  splitOptions: readonly TimelineSplitOption<SplitValue>[];
  onSplitChange: (value: SplitValue) => void;
  featureValue: FeatureValue;
  featureOptions: readonly TimelineFeatureOption<FeatureValue>[];
  onFeatureChange: (value: FeatureValue) => void;
  disabled?: boolean;
}) {
  const instanceId = useId();
  const selectedSplit = splitOptions.find(
    (option) => option.value === splitValue,
  );
  const selectedFeature = featureOptions.find(
    (option) => option.value === featureValue,
  );

  return (
    <section
      className={styles.transfer}
      aria-labelledby={`${instanceId}-title`}
      data-motion="reduced-safe"
    >
      <header>
        <span>Apply · Timeline transfer</span>
        <h2 id={`${instanceId}-title`}>{heading}</h2>
        <p>{scenario}</p>
      </header>

      <figure
        className={styles.timeline}
        aria-describedby={`${instanceId}-timeline-summary`}
      >
        <div className={styles.labels} aria-hidden="true">
          <strong>TRAINING</strong>
          <strong>NOW</strong>
          <strong>TEST</strong>
        </div>
        <div
          className={styles.track}
          data-split-visual={selectedSplit?.visual ?? "unselected"}
          aria-hidden="true"
        >
          <span>{trainingRange}</span>
          <i />
          <span>{testRange}</span>
        </div>
        <div
          className={styles.feature}
          data-crosses-now={selectedFeature?.crossesNow ?? false}
          aria-hidden="true"
        >
          <span>{selectedFeature?.label ?? "Select a feature"}</span>
          <i />
          <strong>
            {selectedFeature === undefined
              ? "Choose where its information comes from"
              : selectedFeature.crossesNow
                ? "future-leaking risk identified ✓"
                : "safe comparison — risk not identified ×"}
          </strong>
        </div>
        <figcaption id={`${instanceId}-timeline-summary`}>
          {`Training window: ${trainingRange}. NOW marks prediction time. Test window: ${testRange}.`}{" "}
          {selectedSplit === undefined
            ? "No deployment split selected."
            : `Selected split: ${selectedSplit.label}. ${selectedSplit.description}`}{" "}
          {selectedFeature === undefined
            ? "No feature selected."
            : `Selected feature: ${selectedFeature.label}. ${selectedFeature.description} ${selectedFeatureClassification(selectedFeature.crossesNow)}`}
        </figcaption>
      </figure>

      <div className={styles.questions}>
        <fieldset disabled={disabled}>
          <legend>Which evaluation design matches deployment?</legend>
          {splitOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${instanceId}-split`}
                value={option.value}
                checked={splitValue === option.value}
                onChange={() => onSplitChange(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset
          disabled={disabled}
          aria-describedby={`${instanceId}-feature-task`}
        >
          <legend>Which feature leaks information from after NOW?</legend>
          <p
            className={styles.taskInstruction}
            id={`${instanceId}-feature-task`}
          >
            Identify the future-leaking feature. The safe feature is a
            comparison, not the answer to this question.
          </p>
          {featureOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${instanceId}-feature`}
                value={option.value}
                checked={featureValue === option.value}
                onChange={() => onFeatureChange(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
                <small className={styles.classification}>
                  {featureOptionClassification(option.crossesNow)}
                </small>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
