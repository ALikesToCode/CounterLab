import { createRef } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
  RouteRecovery,
  type RouteRecoveryReason,
  type RouteRecoveryRecentSession,
} from "./RouteRecovery";

const reasons = [
  ["unknown-route", "alert", "We couldn't find that CounterLab page."],
  ["missing-session", "alert", "This session could not be restored."],
  ["missing-proof", "alert", "This proof could not be found."],
  ["proof-not-ready", "status", "This proof is not ready yet."],
  ["missing-replay", "alert", "This replay was not found."],
  [
    "missing-artifact",
    "alert",
    "This session's notebook evidence could not be restored.",
  ],
] as const satisfies readonly (readonly [
  RouteRecoveryReason,
  "alert" | "status",
  string,
])[];

describe("RouteRecovery", () => {
  it.each(reasons)(
    "announces %s with the appropriate %s role",
    (reason, role, title) => {
      render(
        <RouteRecovery
          reason={reason}
          attemptedPath={`/broken/${reason}`}
          onRetry={vi.fn()}
          onHome={vi.fn()}
        />,
      );

      expect(screen.getByRole(role, { name: title })).toHaveTextContent(
        `/broken/${reason}`,
      );
    },
  );

  it("exposes a focusable heading without moving focus on its own", () => {
    const headingRef = createRef<HTMLHeadingElement>();
    render(
      <RouteRecovery
        ref={headingRef}
        reason="missing-session"
        attemptedPath="/session/missing"
        onRetry={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    expect(headingRef.current).not.toHaveFocus();
    expect(headingRef.current).toHaveAttribute("tabindex", "-1");
    headingRef.current?.focus();
    expect(headingRef.current).toHaveFocus();
  });

  it("does not claim that checking pending proof will run or resume work", () => {
    render(
      <RouteRecovery
        reason="proof-not-ready"
        attemptedPath="/proof/session-one"
        onRetry={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "CounterLab will not run or resume a test from this screen.",
    );
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("invokes retry and home through native keyboard controls", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const home = vi.fn();
    render(
      <RouteRecovery
        reason="missing-replay"
        attemptedPath="/replay/missing"
        onRetry={retry}
        onHome={home}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "Retry replay" });
    retryButton.focus();
    await user.keyboard("{Enter}");
    expect(retry).toHaveBeenCalledOnce();
    expect(home).not.toHaveBeenCalled();

    const homeButton = screen.getByRole("button", {
      name: "Go to CounterLab home",
    });
    homeButton.focus();
    await user.keyboard(" ");
    expect(home).toHaveBeenCalledOnce();
  });

  it("offers at most three recent-session actions with mode and status", async () => {
    const user = userEvent.setup();
    const openFirst = vi.fn();
    const recentSessions: readonly RouteRecoveryRecentSession[] = [
      {
        id: "session-one",
        title: "Customer churn notebook",
        mode: "live",
        status: "LAB_COMPILING",
        onOpen: openFirst,
      },
      {
        id: "session-two",
        title: "Leakage sample",
        mode: "instant",
        status: "EXPERIMENT_COMPLETED",
        onOpen: vi.fn(),
      },
      {
        id: "session-three",
        title: "Stored evidence",
        mode: "replay",
        status: "PROOF_CAPSULE_ISSUED",
        onOpen: vi.fn(),
      },
      {
        id: "session-four",
        title: "Not displayed",
        mode: "live",
        status: "INGESTED",
        onOpen: vi.fn(),
      },
    ];
    render(
      <RouteRecovery
        reason="missing-session"
        attemptedPath="/session/missing"
        onRetry={vi.fn()}
        onHome={vi.fn()}
        recentSessions={recentSessions}
      />,
    );

    const recent = screen
      .getByRole("heading", { name: "Recent work from this browser" })
      .closest("section");
    expect(recent).not.toBeNull();
    expect(within(recent!).getAllByRole("button")).toHaveLength(3);
    expect(recent).toHaveTextContent("Live notebook · lab compiling");
    expect(recent).toHaveTextContent("Verified sample · experiment completed");
    expect(recent).toHaveTextContent("Verified replay · proof capsule issued");
    expect(screen.queryByText("Not displayed")).not.toBeInTheDocument();

    await user.click(
      within(recent!).getByRole("button", {
        name: /customer churn notebook/i,
      }),
    );
    expect(openFirst).toHaveBeenCalledOnce();
  });
});
