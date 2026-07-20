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

export type TimelineEvidenceOption<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
  description: string;
}>;

export function TimelineTransfer<
  SplitValue extends string,
  FeatureValue extends string,
  EvidenceValue extends string,
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
  evidenceValues,
  evidenceOptions,
  onEvidenceChange,
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
  evidenceValues: readonly EvidenceValue[];
  evidenceOptions: readonly TimelineEvidenceOption<EvidenceValue>[];
  onEvidenceChange: (values: EvidenceValue[]) => void;
  disabled?: boolean;
}) {
  const instanceId = useId();
  const selectedSplit = splitOptions.find(
    (option) => option.value === splitValue,
  );
  const selectedFeature = featureOptions.find(
    (option) => option.value === featureValue,
  );
  const toggleEvidence = (value: EvidenceValue, checked: boolean) => {
    onEvidenceChange(
      checked
        ? [...evidenceValues.filter((item) => item !== value), value]
        : evidenceValues.filter((item) => item !== value),
    );
  };

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
        <div className={styles.feature} aria-hidden="true">
          <span>{selectedFeature?.label ?? "Select a feature"}</span>
          <i />
          <strong>
            {selectedFeature === undefined
              ? "Choose where its information comes from"
              : "Compare its definition with the NOW boundary"}
          </strong>
        </div>
        <figcaption id={`${instanceId}-timeline-summary`}>
          {`Training window: ${trainingRange}. NOW marks prediction time. Test window: ${testRange}.`}{" "}
          {selectedSplit === undefined
            ? "No deployment split selected."
            : `Selected split: ${selectedSplit.label}. ${selectedSplit.description}`}{" "}
          {selectedFeature === undefined
            ? "No feature selected."
            : `Selected feature: ${selectedFeature.label}. ${selectedFeature.description}`}
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
            Use the NOW line to decide which feature would be available when a
            real prediction is made.
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
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.evidenceChoices} disabled={disabled}>
          <legend>Select the evidence that supports your decision</legend>
          {evidenceOptions.map((option) => (
            <label key={option.value}>
              <input
                type="checkbox"
                value={option.value}
                checked={evidenceValues.includes(option.value)}
                onChange={(event) =>
                  toggleEvidence(option.value, event.target.checked)
                }
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </section>
  );
}
