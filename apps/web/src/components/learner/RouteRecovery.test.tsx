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
  ["missing-session", "alert", "This private session could not be opened."],
  ["session-unavailable", "alert", "This session could not be loaded."],
  ["missing-proof", "alert", "This private proof could not be opened."],
  ["proof-unavailable", "alert", "This proof could not be loaded."],
  ["proof-not-ready", "status", "This proof is not ready yet."],
  ["missing-replay", "alert", "This replay was not found."],
  ["unverified-replay", "alert", "This replay could not be verified."],
  [
    "missing-artifact",
    "alert",
    "This session's notebook evidence was not found.",
  ],
  [
    "artifact-unavailable",
    "alert",
    "This session's notebook evidence could not be loaded.",
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
          onBack={vi.fn()}
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
        onBack={vi.fn()}
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
        onBack={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent(
      "CounterLab will not run or resume a test from this screen.",
    );
    expect(screen.getByRole("button", { name: "Check again" })).toBeEnabled();
  });

  it("explains browser-bound private access without revealing existence", () => {
    render(
      <RouteRecovery
        reason="missing-session"
        attemptedPath="/session/private"
        onRetry={vi.fn()}
        onBack={vi.fn()}
        onHome={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /requires the browser capability that created it/i,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /does not reveal whether an inaccessible address exists/i,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/verified replay/i);
  });

  it("invokes retry, back, and home through native keyboard controls", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const back = vi.fn();
    const home = vi.fn();
    render(
      <RouteRecovery
        reason="missing-replay"
        attemptedPath="/replay/missing"
        onRetry={retry}
        onBack={back}
        onHome={home}
      />,
    );

    const retryButton = screen.getByRole("button", { name: "Retry replay" });
    retryButton.focus();
    await user.keyboard("{Enter}");
    expect(retry).toHaveBeenCalledOnce();
    expect(back).not.toHaveBeenCalled();
    expect(home).not.toHaveBeenCalled();

    const backButton = screen.getByRole("button", { name: "Back" });
    backButton.focus();
    await user.keyboard("{Enter}");
    expect(back).toHaveBeenCalledOnce();

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
        onBack={vi.fn()}
        onHome={vi.fn()}
        recentSessions={recentSessions}
      />,
    );

    const recent = screen
      .getByRole("heading", { name: "Recent work from this browser" })
      .closest("section");
    expect(recent).not.toBeNull();
    expect(within(recent!).getAllByRole("button")).toHaveLength(3);
    expect(recent).toHaveTextContent("Live notebook · Test preparing");
    expect(recent).toHaveTextContent("Verified sample · Result ready");
    expect(recent).toHaveTextContent("Stored replay · Proof Capsule ready");
    expect(recent).not.toHaveTextContent(
      /LAB_COMPILING|EXPERIMENT_COMPLETED|PROOF_CAPSULE_ISSUED/,
    );
    expect(screen.queryByText("Not displayed")).not.toBeInTheDocument();

    await user.click(
      within(recent!).getByRole("button", {
        name: /customer churn notebook/i,
      }),
    );
    expect(openFirst).toHaveBeenCalledOnce();
  });

  it("uses bounded learner copy for an unknown legacy status", () => {
    render(
      <RouteRecovery
        reason="missing-session"
        attemptedPath="/session/missing"
        onRetry={vi.fn()}
        onBack={vi.fn()}
        onHome={vi.fn()}
        recentSessions={[
          {
            id: "session-legacy",
            title: "Older investigation",
            mode: "live",
            status: "PRIVATE_INTERNAL_STATE",
            onOpen: vi.fn(),
          },
        ]}
      />,
    );

    expect(document.body).toHaveTextContent("Live notebook · Saved work");
    expect(document.body).not.toHaveTextContent("PRIVATE_INTERNAL_STATE");
  });
});
