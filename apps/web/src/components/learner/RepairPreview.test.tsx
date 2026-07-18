import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RepairPreview } from "./RepairPreview";

describe("RepairPreview", () => {
  it("renders only the supplied changed and preserved scope without mutation", () => {
    const payload = Object.freeze({
      changed: Object.freeze([
        "random rows → whole-customer holdout",
        "identity removed from model input",
        "overlap reported beside accuracy",
      ]),
      preserved: Object.freeze([
        "target",
        "model family",
        "unrelated cells",
        "original notebook",
      ]),
    });
    const originalSnapshot = structuredClone(payload);
    const changedReference = payload.changed;
    const preservedReference = payload.preserved;

    render(
      <RepairPreview changed={payload.changed} preserved={payload.preserved} />,
    );

    const changed = screen
      .getByRole("heading", { name: "This repair changes:" })
      .closest("section");
    const preserved = screen
      .getByRole("heading", { name: "This repair preserves:" })
      .closest("section");
    expect(changed).not.toBeNull();
    expect(preserved).not.toBeNull();
    for (const item of payload.changed) {
      expect(within(changed!).getByText(item)).toBeInTheDocument();
    }
    for (const item of payload.preserved) {
      expect(within(preserved!).getByText(item)).toBeInTheDocument();
    }
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(payload).toEqual(originalSnapshot);
    expect(payload.changed).toBe(changedReference);
    expect(payload.preserved).toBe(preservedReference);
    expect(
      screen
        .getByRole("heading", {
          name: "Review the scope before the raw diff.",
        })
        .closest("section"),
    ).toHaveAttribute("data-motion", "reduced-safe");
  });
});
