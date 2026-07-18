import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import styles from "./BoundaryHunt.module.css";
import { BoundaryHunt, type VerifiedBoundaryHuntData } from "./BoundaryHunt";

function boundaryFixture(): VerifiedBoundaryHuntData {
  return {
    resultHash: "a".repeat(64),
    referenceCellId: "cell-stable-20-low",
    axes: [
      {
        id: "test_fraction",
        label: "Test fraction",
        values: [
          { id: "test-20", label: "20%" },
          { id: "test-30", label: "30%" },
        ],
      },
      {
        id: "repeated_entities",
        label: "Repeated entities",
        values: [
          { id: "repeat-low", label: "Low" },
          { id: "repeat-high", label: "High" },
        ],
      },
    ],
    cells: [
      {
        cellId: "cell-stable-20-low",
        coordinates: [
          { axisId: "test_fraction", valueId: "test-20" },
          { axisId: "repeated_entities", valueId: "repeat-low" },
        ],
        expectedClassification: "CONCLUSION_DOES_NOT_CHANGE",
      },
      {
        cellId: "cell-change-30-high",
        coordinates: [
          { axisId: "test_fraction", valueId: "test-30" },
          { axisId: "repeated_entities", valueId: "repeat-high" },
        ],
        expectedClassification: "CONCLUSION_CHANGES",
      },
      {
        cellId: "cell-stable-30-low",
        coordinates: [
          { axisId: "test_fraction", valueId: "test-30" },
          { axisId: "repeated_entities", valueId: "repeat-low" },
        ],
        expectedClassification: "CONCLUSION_DOES_NOT_CHANGE",
      },
    ],
  };
}

const hint = {
  text: "Look for the condition with more repeated entities.",
  evidenceLabel: "Review the verified overlap evidence",
} as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHunt(
  boundary = boundaryFixture(),
  callbacks: {
    onRevealMap?: () => void;
    onSkip?: () => void;
  } = {},
) {
  const onRevealMap = callbacks.onRevealMap ?? vi.fn();
  const onSkip = callbacks.onSkip ?? vi.fn();
  render(
    <BoundaryHunt
      boundary={boundary}
      hint={hint}
      onRevealMap={onRevealMap}
      onSkip={onSkip}
    />,
  );
  return { onRevealMap, onSkip };
}

describe("BoundaryHunt", () => {
  it("reveals the map after one explicitly classified successful attempt", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { onRevealMap } = renderHunt();

    const changingCondition = screen.getByRole("radio", {
      name: /test fraction 30%.*repeated entities high/i,
    });
    await user.click(changingCondition);
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      /you found a changing condition/i,
    );
    expect(changingCondition.closest("label")).toHaveAttribute(
      "data-attempted",
      "true",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reveals the map after two non-changing attempts", async () => {
    const user = userEvent.setup();
    const { onRevealMap } = renderHunt();

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 20%.*repeated entities low/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );
    expect(onRevealMap).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent(/try one more/i);

    const secondCondition = screen.getByRole("radio", {
      name: /test fraction 30%.*repeated entities low/i,
    });
    await user.click(secondCondition);
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent(
      /two conditions are enough/i,
    );
    expect(secondCondition.closest("label")).toHaveAttribute(
      "data-attempted",
      "true",
    );
  });

  it("supports an explicit reveal without selecting or classifying a cell", async () => {
    const user = userEvent.setup();
    const { onRevealMap } = renderHunt();

    await user.click(screen.getByRole("button", { name: "Reveal the map" }));

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("lets the learner skip through the dedicated callback", async () => {
    const user = userEvent.setup();
    const { onRevealMap, onSkip } = renderHunt();

    await user.click(screen.getByRole("button", { name: "Skip the hunt" }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onRevealMap).not.toHaveBeenCalled();
  });

  it("supports keyboard selection, submission, and the evidence-linked hint", async () => {
    const user = userEvent.setup();
    const { onRevealMap } = renderHunt();
    const changingCondition = screen.getByRole("radio", {
      name: /test fraction 30%.*repeated entities high/i,
    });

    changingCondition.focus();
    await user.keyboard("[Space]");
    expect(changingCondition).toBeChecked();
    await user.tab();
    expect(
      screen.getByRole("button", { name: "Check this condition" }),
    ).toHaveFocus();
    await user.keyboard("[Enter]");
    expect(onRevealMap).toHaveBeenCalledOnce();

    await user.click(screen.getByText("Need a hint?"));
    const hintDisclosure = screen.getByText("Need a hint?").closest("details");
    expect(hintDisclosure).toHaveAttribute("open");
    const evidence = screen.getByText(/bound to verified boundary map result/i);
    expect(
      within(hintDisclosure!).getByRole("link", {
        name: "Review the verified overlap evidence",
      }),
    ).toHaveAttribute("href", `#${evidence.id}`);
  });

  it("identifies the reference condition and focuses the hunt question", () => {
    renderHunt();

    expect(
      screen.getByRole("heading", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toHaveFocus();
    const reference = screen
      .getByRole("radio", {
        name: /test fraction 20%.*repeated entities low/i,
      })
      .closest("label");
    expect(within(reference!).getByText("Reference")).toBeInTheDocument();
  });

  it("preserves the verified cells and result hash object", async () => {
    const user = userEvent.setup();
    const boundary = boundaryFixture();
    const originalCells = boundary.cells;
    const originalSnapshot = structuredClone(boundary);
    const { onRevealMap } = renderHunt(boundary);

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 30%.*repeated entities high/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(boundary).toEqual(originalSnapshot);
    expect(boundary.cells).toBe(originalCells);
    expect(boundary.resultHash).toBe(originalSnapshot.resultHash);
    expect(
      screen.getByRole("region", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toHaveAttribute("data-boundary-result-hash", boundary.resultHash);
  });

  it("provides non-color status symbols and reduced-motion parity", async () => {
    const user = userEvent.setup();
    renderHunt();

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 20%.*repeated entities low/i,
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(screen.getByRole("status")).toHaveTextContent("○");
    const reducedMotionClass = styles.reducedMotionSafe;
    expect(reducedMotionClass).toBeDefined();
    expect(
      screen.getByRole("region", {
        name: /can you find a condition where the conclusion changes/i,
      }),
    ).toHaveClass(reducedMotionClass!);
    expect(screen.getByRole("status")).toHaveAttribute("aria-live", "polite");
  });
});
