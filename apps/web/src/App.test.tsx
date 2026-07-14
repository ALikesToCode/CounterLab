import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("CounterLab judged flow", () => {
  it("offers three honest Judge Mode paths", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "CounterLab" })).toBeInTheDocument();
    expect(screen.getByText("Chatbots explain. CounterLab lets reality answer.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try instantly/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /generate live/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /replay verified session/i })).toBeEnabled();
  });

  it("keeps computed results hidden until an immutable prediction is committed", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /try instantly/i }));
    expect(screen.getByRole("heading", { name: /what does this result prove/i })).toBeInTheDocument();
    expect(screen.getByText(/cell 3 · output 0/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /verified result/i })).not.toBeInTheDocument();

    const continueButton = screen.getByRole("button", { name: /create belief test/i });
    expect(continueButton).toBeDisabled();
    await user.type(
      screen.getByLabelText(/your claim/i),
      "The 98.5% test accuracy proves the model generalizes to new customers.",
    );
    await user.click(continueButton);

    expect(screen.getByRole("heading", { name: "Belief Test" })).toBeInTheDocument();
    expect(screen.getByText(/same customer.s identity/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /verified result/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /confirm belief test/i }));
    await user.click(screen.getByRole("radio", { name: /remain near 98/i }));
    await user.click(screen.getByRole("button", { name: /commit prediction/i }));

    expect(screen.getByText(/prediction locked/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /build and verify/i })).toBeInTheDocument();
  });

  it("keeps the replay label persistent across the judged flow", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /replay verified session/i }));
    expect(screen.getByText(/verified replay/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue replay/i }));
    expect(screen.getByText(/verified replay/i)).toBeInTheDocument();
  });
});
