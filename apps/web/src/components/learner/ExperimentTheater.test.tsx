import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ExperimentTheater,
  type ExperimentTheaterVerifiedPayload,
} from "./ExperimentTheater";

const payload = {
  comparison: {
    title: "Accuracy on familiar versus unseen customers",
    accessibleSummary:
      "Accuracy falls from 98.5 percent on familiar rows to 59.4 percent on unseen customers.",
    first: {
      label: "Familiar rows",
      value: "98.5%",
      detail: "Random-row evaluation",
    },
    second: {
      label: "Unseen customers",
      value: "59.4%",
      detail: "Whole-customer holdout",
    },
  },
  finding:
    "The high score depended on seeing the same customer identities in training and test.",
  controlledVariables: "model family, target, preprocessing, and metric",
  views: {
    observe: {
      heading: "Observe the verified comparison",
      content: <p>Two evaluation units, one fixed model.</p>,
      available: true,
      completed: true,
    },
    explore: {
      heading: "Explore the verified evidence",
      content: <p>Inspect the entity overlap beside accuracy.</p>,
      available: true,
      completed: false,
    },
    boundary: {
      heading: "Find the verified boundary",
      content: <p>Review where repeated identities change the conclusion.</p>,
      available: false,
      completed: true,
    },
    apply: {
      heading: "Apply the result",
      content: <p>Transfer is not available yet.</p>,
      available: false,
      completed: false,
    },
  },
} satisfies ExperimentTheaterVerifiedPayload;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ExperimentTheater", () => {
  it("keeps every result-bearing surface hidden until a verified payload arrives", () => {
    const { rerender } = render(
      <ExperimentTheater prediction="I expect the score to stay above 90%." />,
    );

    expect(screen.getByLabelText("Pinned prediction")).toHaveTextContent(
      "I expect the score to stay above 90%.",
    );
    expect(screen.getByText("Result locked")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for a verified result.",
    );
    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("59.4%")).not.toBeInTheDocument();
    expect(screen.queryByText(payload.finding)).not.toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();

    rerender(
      <ExperimentTheater
        prediction="I expect the score to stay above 90%."
        verifiedPayload={payload}
      />,
    );

    expect(screen.getByText("Verified result")).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: payload.comparison.accessibleSummary,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("98.5%")).toBeInTheDocument();
    expect(screen.getByText("59.4%")).toBeInTheDocument();
    expect(screen.getByText(payload.finding)).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("mounts only the registered visual after a verified payload", async () => {
    const visualPayload: ExperimentTheaterVerifiedPayload = {
      ...payload,
      trustedVisual: {
        id: "verified_sample_belief_break_v1",
        resultHash: "not-the-registered-sample-result",
        revealFinding: false,
      },
    };
    const { rerender } = render(
      <ExperimentTheater prediction="I expect the score to stay high." />,
    );

    expect(
      document.querySelector(
        '[data-trusted-visual-id="verified_sample_belief_break_v1"]',
      ),
    ).not.toBeInTheDocument();

    rerender(
      <ExperimentTheater
        prediction="I expect the score to stay high."
        verifiedPayload={visualPayload}
      />,
    );

    expect(
      document.querySelector(
        '[data-trusted-visual-id="verified_sample_belief_break_v1"]',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", {
        name: /integrity-bound verified sample comparison/i,
      }),
    ).toHaveAttribute(
      "data-trusted-visual-id",
      "verified_sample_belief_break_v1",
    );
    expect(
      await screen.findByRole("alert", {
        name: /verified belief-break evidence unavailable/i,
      }),
    ).toHaveTextContent(/refused to present values/i);
    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("59.4%")).not.toBeInTheDocument();
    expect(screen.queryByText(payload.finding)).not.toBeInTheDocument();
  });

  it("fails closed when a runtime payload names an unknown visual", () => {
    const unknownVisualPayload = {
      ...payload,
      trustedVisual: {
        id: "unregistered-result-visual",
        resultHash: "untrusted-result",
        revealFinding: true,
      },
    } as unknown as ExperimentTheaterVerifiedPayload;

    render(
      <ExperimentTheater
        prediction="I expect the score to stay high."
        verifiedPayload={unknownVisualPayload}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /registered component did not resolve/i,
    );
    expect(screen.queryByText("98.5%")).not.toBeInTheDocument();
    expect(screen.queryByText("59.4%")).not.toBeInTheDocument();
    expect(screen.queryByText(payload.finding)).not.toBeInTheDocument();
  });

  it("expands one local view at a time and keeps completed views reviewable", async () => {
    const user = userEvent.setup();
    render(
      <ExperimentTheater
        prediction="I expect the score to stay above 90%."
        verifiedPayload={payload}
      />,
    );

    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    expect(
      screen.getByText("Two evaluation units, one fixed model."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Inspect the entity overlap beside accuracy."),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Observe/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: /Apply/ })).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: /Explore/ }));

    const exploreHeading = screen.getByRole("heading", {
      name: "Explore the verified evidence",
    });
    expect(exploreHeading).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Explore/ })).toHaveFocus();
    expect(
      screen.getByText("Inspect the entity overlap beside accuracy."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Two evaluation units, one fixed model."),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);

    await user.click(screen.getByRole("tab", { name: /Boundary/ }));

    expect(screen.getByRole("tab", { name: /Boundary/ })).toHaveFocus();
    expect(
      screen.getByText(
        "Review where repeated identities change the conclusion.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /Observe/ }));

    expect(screen.getByRole("tab", { name: /Observe/ })).toHaveFocus();
    expect(
      within(screen.getByRole("tab", { name: /Observe/ })).getByText(
        "Completed",
      ),
    ).toBeInTheDocument();
  });

  it("supports roving keyboard focus with immediate reduced-motion parity", async () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: true,
        media: "(prefers-reduced-motion: reduce)",
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );
    const user = userEvent.setup();
    const { container } = render(
      <ExperimentTheater
        prediction="I expect the score to stay above 90%."
        verifiedPayload={payload}
      />,
    );
    const observeTab = screen.getByRole("tab", { name: /Observe/ });
    observeTab.focus();

    await user.keyboard("{ArrowRight}");

    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /Explore/ })).toHaveFocus();
    });
    expect(screen.getByRole("tab", { name: /Explore/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(container.firstElementChild).toHaveAttribute(
      "data-motion",
      "reduced-safe",
    );
  });
});
