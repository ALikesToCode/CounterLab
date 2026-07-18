import { useId } from "react";

import styles from "./CostTransfer.module.css";

export type CostTransferChoice<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
  description: string;
}>;

export type CostMatrixCopy = Readonly<{
  alertLabel: string;
  noAlertLabel: string;
  actualPositiveLabel: string;
  actualNegativeLabel: string;
  caughtLabel: string;
  falseAlarmLabel: string;
  missedLabel: string;
  correctClearLabel: string;
}>;

export function CostTransfer<
  StrategyValue extends string,
  RiskValue extends string,
  EvidenceValue extends string,
>({
  heading,
  scenario,
  matrix,
  missedCost,
  deploymentPrevalence,
  strategyValue,
  strategyOptions,
  onStrategyChange,
  riskValue,
  riskOptions,
  onRiskChange,
  evidenceValues,
  evidenceOptions,
  onEvidenceChange,
  disabled = false,
}: {
  heading: string;
  scenario: string;
  matrix: CostMatrixCopy;
  missedCost: string;
  deploymentPrevalence: string;
  strategyValue: StrategyValue;
  strategyOptions: readonly CostTransferChoice<StrategyValue>[];
  onStrategyChange: (value: StrategyValue) => void;
  riskValue: RiskValue;
  riskOptions: readonly CostTransferChoice<RiskValue>[];
  onRiskChange: (value: RiskValue) => void;
  evidenceValues: readonly EvidenceValue[];
  evidenceOptions: readonly CostTransferChoice<EvidenceValue>[];
  onEvidenceChange: (values: EvidenceValue[]) => void;
  disabled?: boolean;
}) {
  const instanceId = useId();

  const toggleEvidence = (value: EvidenceValue, checked: boolean) => {
    const nextValues = checked
      ? [...evidenceValues.filter((item) => item !== value), value]
      : evidenceValues.filter((item) => item !== value);
    onEvidenceChange(nextValues);
  };

  return (
    <section
      className={styles.transfer}
      aria-labelledby={`${instanceId}-title`}
      data-motion="reduced-safe"
    >
      <header>
        <span>Apply · Cost transfer</span>
        <h2 id={`${instanceId}-title`}>{heading}</h2>
        <p>{scenario}</p>
      </header>

      <div className={styles.evidenceStory}>
        <table>
          <caption>Which outcomes carry the deployment cost?</caption>
          <thead>
            <tr>
              <td />
              <th scope="col">{matrix.actualPositiveLabel}</th>
              <th scope="col">{matrix.actualNegativeLabel}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">{matrix.alertLabel}</th>
              <td>{matrix.caughtLabel}</td>
              <td>{matrix.falseAlarmLabel}</td>
            </tr>
            <tr>
              <th scope="row">{matrix.noAlertLabel}</th>
              <td className={styles.costly}>{matrix.missedLabel}</td>
              <td>{matrix.correctClearLabel}</td>
            </tr>
          </tbody>
        </table>
        <dl>
          <div>
            <dt>Missed-defect cost</dt>
            <dd>{missedCost}</dd>
          </div>
          <div>
            <dt>Deployment prevalence</dt>
            <dd>{deploymentPrevalence}</dd>
          </div>
        </dl>
      </div>

      <div className={styles.questions}>
        <fieldset disabled={disabled}>
          <legend>Which evaluation decision matches deployment?</legend>
          {strategyOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${instanceId}-strategy`}
                value={option.value}
                checked={strategyValue === option.value}
                onChange={() => onStrategyChange(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset disabled={disabled}>
          <legend>Which error needs explicit weight?</legend>
          {riskOptions.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name={`${instanceId}-risk`}
                value={option.value}
                checked={riskValue === option.value}
                onChange={() => onRiskChange(option.value)}
              />
              <span>
                <strong>{option.label}</strong>
                <small>{option.description}</small>
              </span>
            </label>
          ))}
        </fieldset>

        <fieldset className={styles.evidenceChoices} disabled={disabled}>
          <legend>Select the evidence that supports the decision</legend>
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
