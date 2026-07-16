import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CounterLabStudio } from "./CounterLabStudio";

const context = {
  mode: "live" as const,
  stage: "live-compile" as const,
  artifact: null,
  session: null,
  events: [],
};

describe("CounterLabStudio", () => {
  it("keeps project and proof navigation visible without a permanent agent cockpit", () => {
    render(
      <CounterLabStudio
        context={context}
        actions={{
          newAnalysis: vi.fn(),
          showEvidence: vi.fn(),
          navigateStage: vi.fn(),
          startOver: vi.fn(),
          openRecent: vi.fn(),
        }}
      >
        <main>Current learner action</main>
      </CounterLabStudio>,
    );

    expect(screen.getByText("Current learner action")).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", { name: /project and evidence/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: /counterlab agents/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /proof console/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

  it("opens the keyboard command palette without hiding visible controls", () => {
    const analyze = vi.fn();
    render(
      <CounterLabStudio
        context={{ ...context, stage: "claim" }}
        actions={{
          newAnalysis: analyze,
          showEvidence: vi.fn(),
          navigateStage: vi.fn(),
          startOver: vi.fn(),
          openRecent: vi.fn(),
        }}
      >
        <main>Claim</main>
      </CounterLabStudio>,
    );

    fireEvent.keyDown(window, { key: "k", ctrlKey: true });
    expect(
      screen.getByRole("dialog", { name: /counterlab commands/i }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /analyze notebook/i }));
    expect(analyze).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: /new analysis/i }),
    ).toBeInTheDocument();
  });

  it("lets a learner revisit completed stages without resetting the session", () => {
    const navigateStage = vi.fn();
    render(
      <CounterLabStudio
        context={{ ...context, stage: "reality" }}
        actions={{
          newAnalysis: vi.fn(),
          showEvidence: vi.fn(),
          navigateStage,
          startOver: vi.fn(),
          openRecent: vi.fn(),
        }}
      >
        <main>Reality</main>
      </CounterLabStudio>,
    );

    fireEvent.click(screen.getByRole("button", { name: /belief test/i }));
    expect(navigateStage).toHaveBeenCalledWith("belief");
    expect(screen.getByRole("button", { name: /verified lab/i })).toBeEnabled();
    expect(screen.getByText(/transfer & patch/i).closest("li")).toHaveClass(
      "current",
    );
  });
});
