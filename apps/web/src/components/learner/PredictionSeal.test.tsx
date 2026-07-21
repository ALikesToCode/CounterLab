import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PredictionSeal } from "./PredictionSeal";

const options = [
  {
    value: "stays-high",
    label: "Remain near the notebook score",
    description: "The original score reflects a reusable signal.",
  },
  {
    value: "falls",
    label: "Fall materially",
    description: "Repeated identity inflated the original score.",
  },
] as const;

const displays = {
  notebookScore: { label: "Notebook score", value: "98.5%" },
  interventionExpectation: {
    label: "Expected whole-customer result",
    value: "Your categorical expectation",
  },
} as const;

describe("PredictionSeal", () => {
  it("keeps keyboard prediction controls wired to exact parent values", async () => {
    const user = userEvent.setup();
    const choose = vi.fn();
    const setConfidence = vi.fn();
    const commit = vi.fn();
    render(
      <PredictionSeal
        {...displays}
        options={options}
        choice={null}
        confidence={72}
        committed={false}
        onChoiceChange={choose}
        onConfidenceChange={setConfidence}
        onCommit={commit}
      />,
    );

    const falls = screen.getByRole("radio", { name: /fall materially/i });
    falls.focus();
    await user.keyboard(" ");
    expect(choose).toHaveBeenCalledWith("falls");

    fireEvent.change(
      screen.getByRole("slider", { name: "Prediction confidence" }),
      { target: { value: "63" } },
    );
    expect(setConfidence).toHaveBeenCalledWith(63);
    expect(
      screen.getByRole("button", { name: "Seal my prediction" }),
    ).toBeDisabled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("renders a persistent immutable summary after commitment", () => {
    render(
      <PredictionSeal
        {...displays}
        options={options}
        choice="falls"
        confidence={63}
        committed
        onChoiceChange={vi.fn()}
        onConfidenceChange={vi.fn()}
        onCommit={vi.fn()}
      />,
    );

    const sealed = screen.getByLabelText("Sealed prediction");
    expect(sealed).toHaveTextContent("Prediction sealed");
    expect(sealed).toHaveTextContent("Fall materially");
    expect(sealed).toHaveTextContent("63%");
    expect(sealed).toHaveTextContent("98.5%");
    expect(sealed).toHaveTextContent("Your categorical expectation");
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Seal my prediction" }),
    ).not.toBeInTheDocument();
  });

  it("disables every mutable prediction control while sealing is in flight", async () => {
    const user = userEvent.setup();
    const commit = vi.fn();
    render(
      <PredictionSeal
        {...displays}
        options={options}
        choice="falls"
        confidence={63}
        committed={false}
        disabled
        onChoiceChange={vi.fn()}
        onConfidenceChange={vi.fn()}
        onCommit={commit}
      />,
    );

    expect(
      screen.getByRole("radio", { name: /fall materially/i }),
    ).toBeDisabled();
    expect(
      screen.getByRole("slider", { name: "Prediction confidence" }),
    ).toBeDisabled();
    const button = screen.getByRole("button", { name: "Seal my prediction" });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(commit).not.toHaveBeenCalled();
  });
});
