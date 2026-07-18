import { fireEvent, render, screen, within } from "@testing-library/react";
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
  it("keeps project tools collapsed while preserving on-demand access", () => {
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
    const tools = screen.getByRole("button", { name: /project & evidence/i });
    expect(tools).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("dialog", { name: /project and evidence tools/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(tools);
    const dialog = screen.getByRole("dialog", {
      name: /project and evidence tools/i,
    });
    expect(dialog).toBeInTheDocument();
    const close = within(dialog).getByRole("button", {
      name: /close project tools/i,
    });
    const commands = within(dialog).getByRole("button", { name: /commands/i });
    commands.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(commands).toHaveFocus();
    expect(
      screen.queryByRole("complementary", { name: /counterlab agents/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /evidence & proof/i }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.queryByRole("navigation", { name: /session stages/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(close);
    expect(tools).toHaveFocus();
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
      screen.getByRole("button", { name: /project & evidence/i }),
    ).toBeInTheDocument();
  });

  it("supports arrow-key navigation across Evidence & proof tabs", () => {
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
        <main>Compile</main>
      </CounterLabStudio>,
    );

    const activity = screen.getByRole("tab", { name: "Activity" });
    activity.focus();
    fireEvent.keyDown(activity, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Plan" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Plan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});
