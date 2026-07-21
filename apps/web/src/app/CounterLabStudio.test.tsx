import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StudioContext } from "../components/studio/types";
import { CounterLabStudio } from "./CounterLabStudio";

const context: StudioContext = {
  mode: "live" as const,
  stage: "live-compile" as const,
  artifact: null,
  session: null,
  events: [],
};

const sampleProofBundle = {
  schemaVersion: "1",
  experimentPlan: {
    concept: "entity_leakage",
    runs: [
      { id: "random_row_split" },
      { id: "customer_group_split" },
      { id: "identity_ablation" },
    ],
  },
  generatedAdapter: {
    sha256: "a".repeat(64),
    commitHash: "b".repeat(40),
  },
  publicTests: {
    passed: 1,
    failed: 0,
    command: "python /workspace/public_tests.py",
    reportHash: "c".repeat(64),
  },
  externalVerifier: {
    status: "VERIFIED",
    verifiedInvariants: ["baseline_overlap_exists", "canonical_result_hash"],
    mutations: ["swapped split labels"],
    reportHash: "d".repeat(64),
  },
  patchResult: {
    status: "VERIFIED",
    modifiedCells: [3],
    diff: "--- cell-3-before.py\n+++ cell-3-after.py",
    verification: {
      passed: true,
      invariants: ["EVALUATION_CELL_ONLY", "GROUP_OVERLAP_ZERO"],
      unchangedCellHashes: ["e".repeat(64)],
    },
  },
} as unknown as NonNullable<StudioContext["session"]>["proofBundle"];

describe("CounterLabStudio", () => {
  it("closes proof after compile when it was opened automatically", () => {
    const actions = {
      newAnalysis: vi.fn(),
      showEvidence: vi.fn(),
      startOver: vi.fn(),
      openRecent: vi.fn(),
    };
    const { rerender } = render(
      <CounterLabStudio context={context} actions={actions}>
        <main>Compile</main>
      </CounterLabStudio>,
    );

    expect(
      screen.getByRole("button", { name: /evidence & proof/i }),
    ).toHaveAttribute("aria-expanded", "true");

    rerender(
      <CounterLabStudio
        context={{ ...context, stage: "reality" }}
        actions={actions}
      >
        <main>Result</main>
      </CounterLabStudio>,
    );

    expect(
      screen.getByRole("button", { name: /evidence & proof/i }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps proof open across stages when the learner opened it", () => {
    const actions = {
      newAnalysis: vi.fn(),
      showEvidence: vi.fn(),
      startOver: vi.fn(),
      openRecent: vi.fn(),
    };
    const { rerender } = render(
      <CounterLabStudio
        context={{ ...context, stage: "claim" }}
        actions={actions}
      >
        <main>Claim</main>
      </CounterLabStudio>,
    );
    const proofToggle = screen.getByRole("button", {
      name: /evidence & proof/i,
    });

    fireEvent.click(proofToggle);
    expect(proofToggle).toHaveAttribute("aria-expanded", "true");

    rerender(
      <CounterLabStudio context={context} actions={actions}>
        <main>Compile</main>
      </CounterLabStudio>,
    );
    rerender(
      <CounterLabStudio
        context={{ ...context, stage: "reality" }}
        actions={actions}
      >
        <main>Result</main>
      </CounterLabStudio>,
    );

    expect(
      screen.getByRole("button", { name: /evidence & proof/i }),
    ).toHaveAttribute("aria-expanded", "true");
  });

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

  it("shows validated sample proof details in their evidence tabs", () => {
    render(
      <CounterLabStudio
        context={{
          ...context,
          session: {
            proofBundle: sampleProofBundle,
          } as NonNullable<StudioContext["session"]>,
        }}
        actions={{
          newAnalysis: vi.fn(),
          showEvidence: vi.fn(),
          startOver: vi.fn(),
          openRecent: vi.fn(),
        }}
      >
        <main>Completed sample</main>
      </CounterLabStudio>,
    );

    fireEvent.click(screen.getByRole("tab", { name: "Tests" }));
    expect(screen.getByText("1 passed · 0 failed")).toBeInTheDocument();
    expect(screen.getByText("Public test report SHA-256")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Verifier" }));
    expect(screen.getByText("baseline_overlap_exists")).toBeInTheDocument();
    expect(screen.getByText("canonical_result_hash")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Diff" }));
    expect(screen.getByText("Changed notebook cells: 3")).toBeInTheDocument();
    expect(screen.getByText(/cell-3-before\.py/iu)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Plan" }));
    expect(screen.getByText("customer_group_split")).toBeInTheDocument();
    expect(screen.getByText("Generated adapter SHA-256")).toBeInTheDocument();
  });

  it("exposes private-session revocation only on demand in provenance", () => {
    const revokeSessionAccess = vi.fn();
    render(
      <CounterLabStudio
        context={context}
        actions={{
          newAnalysis: vi.fn(),
          showEvidence: vi.fn(),
          revokeSessionAccess,
          startOver: vi.fn(),
          openRecent: vi.fn(),
        }}
      >
        <main>Compile</main>
      </CounterLabStudio>,
    );

    expect(
      screen.queryByRole("button", { name: /revoke private session access/i }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Provenance" }));
    const revoke = screen.getByRole("button", {
      name: /revoke private session access/i,
    });
    expect(
      screen.getByText(/separate owner key held by this browser/i),
    ).toBeInTheDocument();
    fireEvent.click(revoke);
    expect(revokeSessionAccess).toHaveBeenCalledOnce();
  });
});
