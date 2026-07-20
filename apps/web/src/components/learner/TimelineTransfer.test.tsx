import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  TimelineTransfer,
  type TimelineEvidenceOption,
  type TimelineFeatureOption,
  type TimelineSplitOption,
} from "./TimelineTransfer";

type SplitValue = "" | "random" | "time";
type FeatureValue = "" | "price" | "future";
type EvidenceValue = "centered-window" | "shuffled-dates" | "metric";

const splitOptions = [
  {
    value: "random",
    label: "Random daily rows",
    description: "Mix observations from all dates.",
    visual: "mixed",
  },
  {
    value: "time",
    label: "Time-ordered holdout",
    description: "Train on earlier dates and test on later dates.",
    visual: "ordered",
  },
] as const satisfies readonly TimelineSplitOption<SplitValue>[];

const featureOptions = [
  {
    value: "price",
    label: "Known item price",
    description: "Known when the prediction is made.",
    crossesNow: false,
  },
  {
    value: "future",
    label: "Centered rolling target",
    description: "Uses a seven-day window centered on each date.",
    crossesNow: true,
  },
] as const satisfies readonly TimelineFeatureOption<FeatureValue>[];

const evidenceOptions = [
  {
    value: "centered-window",
    label: "Centered-window definition",
    description: "The target feature uses a centered seven-day window.",
  },
  {
    value: "shuffled-dates",
    label: "Shuffled-split definition",
    description: "Training and test rows are sampled across dates.",
  },
  {
    value: "metric",
    label: "Metric definition",
    description: "The report uses mean absolute error.",
  },
] as const satisfies readonly TimelineEvidenceOption<EvidenceValue>[];

function ControlledTimeline({
  onSplit = vi.fn(),
  onFeature = vi.fn(),
  onEvidence = vi.fn(),
}: {
  onSplit?: (value: SplitValue) => void;
  onFeature?: (value: FeatureValue) => void;
  onEvidence?: (value: EvidenceValue[]) => void;
}) {
  const [splitValue, setSplitValue] = useState<SplitValue>("");
  const [featureValue, setFeatureValue] = useState<FeatureValue>("");
  const [evidenceValues, setEvidenceValues] = useState<EvidenceValue[]>([]);
  return (
    <TimelineTransfer
      heading="What information exists at prediction time?"
      scenario="A demand forecast learns from nearby days."
      trainingRange="Jan — Mar"
      testRange="Apr — Jun"
      splitValue={splitValue}
      splitOptions={splitOptions}
      onSplitChange={(value) => {
        onSplit(value);
        setSplitValue(value);
      }}
      featureValue={featureValue}
      featureOptions={featureOptions}
      onFeatureChange={(value) => {
        onFeature(value);
        setFeatureValue(value);
      }}
      evidenceValues={evidenceValues}
      evidenceOptions={evidenceOptions}
      onEvidenceChange={(values) => {
        onEvidence(values);
        setEvidenceValues(values);
      }}
    />
  );
}

describe("TimelineTransfer", () => {
  it("keeps the pre-submit timeline neutral for every feature choice", async () => {
    const user = userEvent.setup();
    const { container } = render(<ControlledTimeline />);

    expect(
      screen.getByRole("group", {
        name: "Which feature leaks information from after NOW?",
      }),
    ).toHaveAccessibleDescription(
      "Use the NOW line to decide which feature would be available when a real prediction is made.",
    );

    const safeFeature = screen.getByRole("radio", {
      name: /known item price.*known when the prediction is made/i,
    });
    const futureFeature = screen.getByRole("radio", {
      name: /centered rolling target.*seven-day window centered on each date/i,
    });

    expect(document.body).not.toHaveTextContent(
      /future-leaking risk identified|safe comparison|not the answer|spans observations|does not span|correct|incorrect/i,
    );

    await user.click(safeFeature);

    expect(safeFeature).toBeChecked();
    expect(
      screen.getByText("Compare its definition with the NOW boundary"),
    ).toBeVisible();
    expect(
      screen.getByText(/selected feature: known item price/i),
    ).not.toHaveTextContent(/classification|requested future-leaking risk/i);
    expect(
      container.querySelector("[data-crosses-now]"),
    ).not.toBeInTheDocument();

    await user.click(futureFeature);

    expect(futureFeature).toBeChecked();
    expect(
      screen.getByText("Compare its definition with the NOW boundary"),
    ).toBeVisible();
    expect(
      screen.getByText(/selected feature: centered rolling target/i),
    ).not.toHaveTextContent(/classification|requested future-leaking risk/i);
    expect(
      container.querySelector("[data-crosses-now]"),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /future-leaking risk identified|safe comparison|not the answer|spans observations|does not span|correct|incorrect/i,
    );
  });

  it("gives sighted and screen-reader users the same neutral selected-feature facts", async () => {
    const user = userEvent.setup();
    render(<ControlledTimeline />);

    await user.click(
      screen.getByRole("radio", { name: /centered rolling target/i }),
    );

    const timeline = screen.getByRole("figure");
    expect(timeline).toHaveAccessibleDescription(
      "Training window: Jan — Mar. NOW marks prediction time. Test window: Apr — Jun. No deployment split selected. Selected feature: Centered rolling target. Uses a seven-day window centered on each date.",
    );
    expect(
      screen.getByText(/selected feature: centered rolling target/i),
    ).toBeVisible();
    expect(screen.getAllByText("Centered rolling target")).toHaveLength(2);
    expect(document.body).not.toHaveTextContent(
      /classification|answer is|passed|failed|patch unlocked/i,
    );
  });

  it("synchronizes the visual with exact caller-owned split and feature values", async () => {
    const user = userEvent.setup();
    const onSplit = vi.fn();
    const onFeature = vi.fn();
    const onEvidence = vi.fn();
    const { container } = render(
      <ControlledTimeline
        onSplit={onSplit}
        onFeature={onFeature}
        onEvidence={onEvidence}
      />,
    );

    expect(screen.getByText(/training window: jan — mar/i)).toHaveTextContent(
      "NOW marks prediction time. Test window: Apr — Jun.",
    );
    expect(
      screen.getByText(/no deployment split selected/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("radio", { name: /time-ordered holdout/i }),
    );
    const futureFeature = screen.getByRole("radio", {
      name: /centered rolling target/i,
    });
    futureFeature.focus();
    await user.keyboard("[Space]");
    await user.click(
      screen.getByRole("checkbox", { name: /centered-window definition/i }),
    );

    expect(onSplit).toHaveBeenLastCalledWith("time");
    expect(onFeature).toHaveBeenLastCalledWith("future");
    expect(onEvidence).toHaveBeenLastCalledWith(["centered-window"]);
    expect(
      screen.getByRole("radio", { name: /time-ordered holdout/i }),
    ).toBeChecked();
    expect(futureFeature).toBeChecked();
    expect(
      screen.getByText(/selected split: time-ordered holdout/i),
    ).toHaveTextContent("Train on earlier dates and test on later dates.");
    expect(
      screen.getByText(/selected feature: centered rolling target/i),
    ).toHaveTextContent("Uses a seven-day window centered on each date.");
    expect(
      container.querySelector("[data-crosses-now]"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("heading", {
          name: "What information exists at prediction time?",
        })
        .closest("section"),
    ).toHaveAttribute("data-motion", "reduced-safe");
  });

  it("does not score the transfer or expose an action that could unlock repair", () => {
    render(<ControlledTimeline />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /passed|failed|patch unlocked/i,
    );
  });
});
