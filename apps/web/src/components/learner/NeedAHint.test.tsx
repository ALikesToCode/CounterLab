import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { NeedAHint } from "./NeedAHint";

describe("NeedAHint", () => {
  it("reveals only supplied deterministic copy and reports its fixed ID", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    render(
      <NeedAHint
        hintId="entity_leakage.boundary"
        hint="Compare the symbol at your chosen point with the reference point."
        evidenceHref="#boundary-exact-values"
        evidenceLabel="Review exact Boundary Map values"
        onOpen={onOpen}
      />,
    );

    const help = screen.getByLabelText("Contextual help");
    const summary = screen.getByText("Need a hint?");
    const details = summary.closest("details");
    expect(help).toContainElement(details);
    expect(details).not.toHaveAttribute("open");

    await user.click(summary);

    expect(details).toHaveAttribute("open");
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("entity_leakage.boundary");
    expect(
      screen.getByText(
        "Compare the symbol at your chosen point with the reference point.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review exact Boundary Map values" }),
    ).toHaveAttribute("href", "#boundary-exact-values");
    expect(fetchSpy).not.toHaveBeenCalled();

    fetchSpy.mockRestore();
  });

  it("works without a callback and keeps caller-provided values exact", async () => {
    const user = userEvent.setup();

    render(
      <NeedAHint
        hintId="entity_leakage.prediction"
        hint="Read the two predicted patterns before sealing your expectation."
        evidenceHref="#model-duel"
      />,
    );

    await user.click(screen.getByText("Need a hint?"));
    expect(
      screen.getByText(
        "Read the two predicted patterns before sealing your expectation.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Review the linked evidence" }),
    ).toHaveAttribute("href", "#model-duel");
  });
});
