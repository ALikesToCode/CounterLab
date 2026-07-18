import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  CostTransfer,
  type CostMatrixCopy,
  type CostTransferChoice,
} from "./CostTransfer";

type StrategyValue = "" | "highest_accuracy" | "cost_aware_threshold";
type RiskValue = "" | "overall_error_rate" | "minority_false_negative_cost";
type EvidenceValue =
  "confusion_matrix_exposes_misses" | "prevalence_shift_changes_precision";

const strategyOptions = [
  {
    value: "highest_accuracy",
    label: "Keep the highest-accuracy threshold",
    description: "Optimize the overall correct count.",
  },
  {
    value: "cost_aware_threshold",
    label: "Use a cost-aware threshold",
    description: "Include the cost of missing a defect.",
  },
] as const satisfies readonly CostTransferChoice<StrategyValue>[];

const riskOptions = [
  {
    value: "overall_error_rate",
    label: "Only total error rate",
    description: "Treat both error types as interchangeable.",
  },
  {
    value: "minority_false_negative_cost",
    label: "Missed-defect cost",
    description: "Give missed defects their deployment cost.",
  },
] as const satisfies readonly CostTransferChoice<RiskValue>[];

const evidenceOptions = [
  {
    value: "confusion_matrix_exposes_misses",
    label: "Confusion matrix shows misses",
    description: "Separates missed defects from false alarms.",
  },
  {
    value: "prevalence_shift_changes_precision",
    label: "Prevalence changes precision",
    description: "Uses the supplied deployment prevalence.",
  },
] as const satisfies readonly CostTransferChoice<EvidenceValue>[];

const matrix = {
  alertLabel: "Alert",
  noAlertLabel: "No alert",
  actualPositiveLabel: "Actual defect",
  actualNegativeLabel: "Actual clear",
  caughtLabel: "caught",
  falseAlarmLabel: "false alarm",
  missedLabel: "missed",
  correctClearLabel: "correct clear",
} as const satisfies CostMatrixCopy;

function ControlledCostTransfer({
  onStrategy = vi.fn(),
  onRisk = vi.fn(),
  onEvidence = vi.fn(),
}: {
  onStrategy?: (value: StrategyValue) => void;
  onRisk?: (value: RiskValue) => void;
  onEvidence?: (values: EvidenceValue[]) => void;
}) {
  const [strategy, setStrategy] = useState<StrategyValue>("");
  const [risk, setRisk] = useState<RiskValue>("");
  const [evidence, setEvidence] = useState<EvidenceValue[]>([]);
  return (
    <CostTransfer
      heading="Which mistakes matter at deployment?"
      scenario="A factory screens for a rare but costly defect."
      matrix={matrix}
      missedCost="Ten inspections"
      deploymentPrevalence="1 in 200 units"
      strategyValue={strategy}
      strategyOptions={strategyOptions}
      onStrategyChange={(value) => {
        onStrategy(value);
        setStrategy(value);
      }}
      riskValue={risk}
      riskOptions={riskOptions}
      onRiskChange={(value) => {
        onRisk(value);
        setRisk(value);
      }}
      evidenceValues={evidence}
      evidenceOptions={evidenceOptions}
      onEvidenceChange={(values) => {
        onEvidence(values);
        setEvidence(values);
      }}
    />
  );
}

describe("CostTransfer", () => {
  it("shows the accessible cost story and emits exact existing transfer values", async () => {
    const user = userEvent.setup();
    const onStrategy = vi.fn();
    const onRisk = vi.fn();
    const onEvidence = vi.fn();
    render(
      <ControlledCostTransfer
        onStrategy={onStrategy}
        onRisk={onRisk}
        onEvidence={onEvidence}
      />,
    );

    expect(
      screen.getByRole("table", {
        name: "Which outcomes carry the deployment cost?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ten inspections")).toBeInTheDocument();
    expect(screen.getByText("1 in 200 units")).toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", { name: /use a cost-aware threshold/i }),
    );
    await user.click(
      screen.getByRole("radio", { name: /missed-defect cost/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /confusion matrix shows misses/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /prevalence changes precision/i }),
    );

    expect(onStrategy).toHaveBeenLastCalledWith("cost_aware_threshold");
    expect(onRisk).toHaveBeenLastCalledWith("minority_false_negative_cost");
    expect(onEvidence).toHaveBeenLastCalledWith([
      "confusion_matrix_exposes_misses",
      "prevalence_shift_changes_precision",
    ]);
    expect(
      screen
        .getByRole("heading", {
          name: "Which mistakes matter at deployment?",
        })
        .closest("section"),
    ).toHaveAttribute("data-motion", "reduced-safe");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("returns a new evidence array without mutating caller-owned selections", async () => {
    const user = userEvent.setup();
    const existing = Object.freeze<EvidenceValue[]>([
      "confusion_matrix_exposes_misses",
    ]);
    const onEvidenceChange = vi.fn();
    render(
      <CostTransfer
        heading="Which mistakes matter at deployment?"
        scenario="A factory screens for defects."
        matrix={matrix}
        missedCost="Caller-supplied cost"
        deploymentPrevalence="Caller-supplied prevalence"
        strategyValue=""
        strategyOptions={strategyOptions}
        onStrategyChange={vi.fn()}
        riskValue=""
        riskOptions={riskOptions}
        onRiskChange={vi.fn()}
        evidenceValues={existing}
        evidenceOptions={evidenceOptions}
        onEvidenceChange={onEvidenceChange}
      />,
    );

    await user.click(
      screen.getByRole("checkbox", { name: /confusion matrix shows misses/i }),
    );

    expect(existing).toEqual(["confusion_matrix_exposes_misses"]);
    expect(onEvidenceChange).toHaveBeenCalledWith([]);
    expect(onEvidenceChange.mock.calls[0]?.[0]).not.toBe(existing);
  });
});
