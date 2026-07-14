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
  it("makes project, agent, and proof navigation visible around the learner action", () => {
    render(
      <CounterLabStudio
        context={context}
        actions={{
          newAnalysis: vi.fn(),
          showEvidence: vi.fn(),
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
      screen.getByRole("complementary", { name: /counterlab agents/i }),
    ).toBeInTheDocument();
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
});
