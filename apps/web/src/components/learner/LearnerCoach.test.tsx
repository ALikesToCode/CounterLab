import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { LearnerCoach } from "./LearnerCoach";

describe("LearnerCoach", () => {
  it("keeps the next move concise and reveals context on demand", async () => {
    const user = userEvent.setup();
    render(
      <LearnerCoach
        next="lock what you expect before CounterLab reveals the result."
        why="A sealed prediction keeps the later comparison honest."
      />,
    );

    expect(screen.getByLabelText("Learner coach")).toHaveTextContent(
      "Next: lock what you expect before CounterLab reveals the result.",
    );
    const why = screen.getByText("Why?");
    await user.click(why);
    expect(why.closest("details")).toHaveAttribute("open");
    expect(
      screen.getByText(
        "A sealed prediction keeps the later comparison honest.",
      ),
    ).toBeInTheDocument();
  });
});
