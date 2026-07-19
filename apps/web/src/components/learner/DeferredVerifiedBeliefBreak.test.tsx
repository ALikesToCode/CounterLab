import { render, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VerifiedEvidenceLoadBoundary } from "./DeferredVerifiedBeliefBreak";

function BrokenEvidence(): ReactElement {
  throw new Error("simulated lazy chunk failure");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VerifiedEvidenceLoadBoundary", () => {
  it("keeps result and conclusion copy closed when evidence UI cannot load", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <VerifiedEvidenceLoadBoundary>
        <BrokenEvidence />
      </VerifiedEvidenceLoadBoundary>,
    );

    const alert = screen.getByRole("alert", {
      name: /verified sample evidence unavailable/i,
    });
    expect(alert).toHaveTextContent(/no result or conclusion was released/i);
    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("59.4%")).not.toBeInTheDocument();
    expect(screen.queryByText("Boundary consequence")).not.toBeInTheDocument();
    expect(screen.queryByText("Learner benefit")).not.toBeInTheDocument();
  });
});
