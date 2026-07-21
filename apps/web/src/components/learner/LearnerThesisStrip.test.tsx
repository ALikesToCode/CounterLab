import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LearnerThesisStrip } from "./LearnerThesisStrip";

describe("LearnerThesisStrip", () => {
  it("explains the opening sequence as three fixed learner stages", () => {
    render(<LearnerThesisStrip />);

    const strip = screen.getByLabelText("How the opening sequence works");
    const sequence = within(strip).getByRole("list", {
      name: "CounterLab opening sequence",
    });
    const stages = within(sequence).getAllByRole("listitem");

    expect(stages).toHaveLength(3);
    expect(stages[0]).toHaveTextContent(
      "State claimName what you want to test",
    );
    expect(stages[1]).toHaveTextContent("Lock PredictionCommit before results");
    expect(stages[2]).toHaveTextContent(
      "Controlled testRun; result passes verification before release",
    );
  });

  it("does not expose a result value or verdict", () => {
    const { container } = render(<LearnerThesisStrip />);

    expect(container).not.toHaveTextContent(/\b\d{2,3}(?:\.\d+)?%/u);
    expect(container).not.toHaveTextContent(
      /\b(?:supports|rejected|inconclusive)\b/iu,
    );
  });
});
