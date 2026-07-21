import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveAuthorityStrip } from "./LiveAuthorityStrip";

describe("LiveAuthorityStrip", () => {
  it("separates proposal, compilation, computation, and verification roles", () => {
    render(<LiveAuthorityStrip />);

    const strip = screen.getByLabelText(
      "Authority roles for a live notebook run",
    );
    expect(strip).toHaveAttribute("data-authority-context", "live-capability");
    expect(within(strip).getByText("Live authority")).toBeVisible();

    const responsibilities = within(strip).getAllByRole("definition");
    expect(responsibilities).toHaveLength(4);
    expect(strip).toHaveTextContent("GPT-5.6Proposes a bounded belief frame");
    expect(strip).toHaveTextContent(
      "Runtime CodexCompiles allowlisted experiment plans",
    );
    expect(strip).toHaveTextContent(
      "Fixed kernelComputes the numerical result",
    );
    expect(strip).toHaveTextContent(
      "Frozen verifierDecides validity and releases evidence",
    );
  });

  it("states that the landing strip describes capability rather than an active call", () => {
    render(<LiveAuthorityStrip />);

    expect(
      screen.getByText("No live call starts on this screen."),
    ).toBeVisible();
  });
});
