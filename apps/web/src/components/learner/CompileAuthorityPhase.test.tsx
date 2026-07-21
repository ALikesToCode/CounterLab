import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CompileAuthorityPhase } from "./CompileAuthorityPhase";

function phase(name: RegExp) {
  return screen.getByText(name).closest("li");
}

describe("CompileAuthorityPhase", () => {
  it("shows generated planning without implying a result", () => {
    render(
      <CompileAuthorityPhase
        jobKind="LAB_COMPILE"
        resultReady={false}
        failed={false}
      />,
    );

    expect(phase(/Generated planning/)).toHaveAttribute("data-state", "active");
    expect(phase(/Fixed testing/)).toHaveAttribute("data-state", "pending");
    expect(phase(/Verified result/)).toHaveAttribute("data-state", "pending");
    expect(
      screen.getByText(/Runtime Codex proposes the experiment only/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/98\.5|59\.4/);
  });

  it("uses the real run job kind for the fixed-kernel phase", () => {
    render(
      <CompileAuthorityPhase
        jobKind="LAB_RUN"
        resultReady={false}
        failed={false}
      />,
    );

    expect(phase(/Generated planning/)).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(phase(/Fixed testing/)).toHaveAttribute("data-state", "active");
    expect(phase(/Verified result/)).toHaveAttribute("data-state", "pending");
  });

  it("marks every authority phase complete only when a result-ready event exists", () => {
    render(
      <CompileAuthorityPhase jobKind="LAB_RUN" resultReady failed={false} />,
    );

    for (const item of screen.getAllByRole("listitem")) {
      expect(item).toHaveAttribute("data-state", "complete");
    }
    expect(
      within(phase(/Verified result/)! as HTMLElement).getByText(
        /Frozen verifier releases/i,
      ),
    ).toBeInTheDocument();
  });

  it("reports a safe stop at the phase owned by the current job", () => {
    render(
      <CompileAuthorityPhase jobKind="LAB_RUN" resultReady={false} failed />,
    );

    expect(phase(/Generated planning/)).toHaveAttribute(
      "data-state",
      "complete",
    );
    expect(phase(/Fixed testing/)).toHaveAttribute("data-state", "stopped");
    expect(phase(/Verified result/)).toHaveAttribute("data-state", "pending");
    expect(screen.getByText(/Stopped safely/)).toBeInTheDocument();
  });
});
