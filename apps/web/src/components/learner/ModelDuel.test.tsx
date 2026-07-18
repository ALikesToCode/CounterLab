import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ModelDuel } from "./ModelDuel";

const current = {
  statement: "The model learned a reusable customer pattern.",
  prediction: "The score stays high for unseen customers.",
  conditions: ["The evaluation contains unseen customers."],
  nonClaims: ["This does not establish production causality."],
};

const alternative = {
  statement: "Repeated identity makes familiar rows look easier.",
  prediction: "The score falls when whole customers are held out.",
  conditions: ["Customer identity repeats across rows."],
  nonClaims: ["This does not claim every feature is leakage."],
};

describe("ModelDuel", () => {
  it("gives both models equal weight and exposes their conditions", async () => {
    const user = userEvent.setup();
    render(
      <ModelDuel
        current={current}
        alternative={alternative}
        onConfirm={vi.fn()}
        onEdit={vi.fn()}
        onInsufficientEvidence={vi.fn()}
        onReject={vi.fn()}
      />,
    );

    const currentCard = screen.getByLabelText("Your current explanation");
    const alternativeCard = screen.getByLabelText(
      "Alternative CounterLab will test",
    );
    expect(currentCard).toHaveAttribute("data-model-weight", "equal");
    expect(alternativeCard).toHaveAttribute("data-model-weight", "equal");
    expect(currentCard.className).toBe(alternativeCard.className);
    expect(screen.getByText(current.prediction)).toBeInTheDocument();
    expect(screen.getByText(alternative.prediction)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/correct|incorrect/i);

    await user.click(currentCard.querySelector("summary") as HTMLElement);
    expect(screen.getByText(current.conditions[0]!)).toBeInTheDocument();
    expect(screen.getByText(current.nonClaims[0]!)).toBeInTheDocument();
  });

  it("routes confirmation, editing, and tertiary decisions through callbacks", async () => {
    const user = userEvent.setup();
    const confirm = vi.fn();
    const edit = vi.fn();
    const insufficient = vi.fn();
    const reject = vi.fn();
    render(
      <ModelDuel
        current={current}
        alternative={alternative}
        onConfirm={confirm}
        onEdit={edit}
        onInsufficientEvidence={insufficient}
        onReject={reject}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Does your current explanation capture what you mean?",
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Yes, this captures my view" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Edit my explanation" }),
    );
    await user.click(screen.getByText("More ways to respond"));
    await user.click(
      screen.getByRole("button", { name: "Not enough evidence" }),
    );
    await user.click(screen.getByRole("button", { name: "Reject" }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(edit).toHaveBeenCalledOnce();
    expect(insufficient).toHaveBeenCalledOnce();
    expect(reject).toHaveBeenCalledOnce();
  });
});
