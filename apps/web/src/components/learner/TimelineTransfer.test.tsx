import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  TimelineTransfer,
  type TimelineFeatureOption,
  type TimelineSplitOption,
} from "./TimelineTransfer";

type SplitValue = "" | "random" | "time";
type FeatureValue = "" | "price" | "future";

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
    description: "Reads outcomes from later days.",
    crossesNow: true,
  },
] as const satisfies readonly TimelineFeatureOption<FeatureValue>[];

function ControlledTimeline({
  onSplit = vi.fn(),
  onFeature = vi.fn(),
}: {
  onSplit?: (value: SplitValue) => void;
  onFeature?: (value: FeatureValue) => void;
}) {
  const [splitValue, setSplitValue] = useState<SplitValue>("");
  const [featureValue, setFeatureValue] = useState<FeatureValue>("");
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
    />
  );
}

describe("TimelineTransfer", () => {
  it("synchronizes the visual with exact caller-owned split and feature values", async () => {
    const user = userEvent.setup();
    const onSplit = vi.fn();
    const onFeature = vi.fn();
    const { container } = render(
      <ControlledTimeline onSplit={onSplit} onFeature={onFeature} />,
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

    expect(onSplit).toHaveBeenLastCalledWith("time");
    expect(onFeature).toHaveBeenLastCalledWith("future");
    expect(
      screen.getByRole("radio", { name: /time-ordered holdout/i }),
    ).toBeChecked();
    expect(futureFeature).toBeChecked();
    expect(
      screen.getByText(/selected split: time-ordered holdout/i),
    ).toHaveTextContent("Train on earlier dates and test on later dates.");
    expect(
      screen.getByText(/selected feature: centered rolling target/i),
    ).toHaveTextContent("Reads outcomes from later days.");
    expect(
      container.querySelector('[data-crosses-now="true"]'),
    ).toBeInTheDocument();
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
