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

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderHunt(
  boundary = boundaryFixture(),
  callbacks: {
    onRevealMap?: () => void;
    onSkip?: () => void;
    onClassify?: (
      classification: "CONCLUSION_CHANGES" | "CONCLUSION_STABLE",
    ) => void;
  } = {},
) {
  const onRevealMap = callbacks.onRevealMap ?? vi.fn();
  const onSkip = callbacks.onSkip ?? vi.fn();
  const onClassify = callbacks.onClassify ?? vi.fn();
  render(
    <BoundaryHunt
      boundary={boundary}
      onRevealMap={onRevealMap}
      onSkip={onSkip}
      onClassify={onClassify}
    />,
  );
  return { onRevealMap, onSkip, onClassify };
}

describe("BoundaryHunt", () => {
  it("reveals the map after one explicitly classified successful attempt", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const { onRevealMap, onClassify } = renderHunt();

    const changingCondition = screen.getByRole("radio", {
      name: /test fraction 30%.*repeated entities high/i,
    });
    await user.click(changingCondition);
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(onClassify).toHaveBeenCalledWith("CONCLUSION_CHANGES");
    expect(screen.getByRole("status")).toHaveTextContent(
      /you found a changing condition/i,
    );
    expect(changingCondition.closest("label")).toHaveAttribute(
      "data-attempted",
      "true",
    );
    expect(
      screen.getByRole("button", { name: "Reveal the map" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Skip the hunt" }),
    ).toBeDisabled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reveals the map after two non-changing attempts", async () => {
    const user = userEvent.setup();
    const { onRevealMap, onClassify } = renderHunt();

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
    const check = screen.getByRole("button", { name: "Check this condition" });
    expect(check).toBeDisabled();
    await user.click(check);
    expect(onClassify).toHaveBeenCalledOnce();
    expect(onRevealMap).not.toHaveBeenCalled();

    const secondCondition = screen.getByRole("radio", {
      name: /test fraction 30%.*repeated entities low/i,
    });
    await user.click(secondCondition);
    await user.click(
      screen.getByRole("button", { name: "Check this condition" }),
    );

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(onClassify).toHaveBeenNthCalledWith(1, "CONCLUSION_STABLE");
    expect(onClassify).toHaveBeenNthCalledWith(2, "CONCLUSION_STABLE");
    expect(screen.getByRole("status")).toHaveTextContent(
      /two conditions are enough/i,
    );
    expect(secondCondition.closest("label")).toHaveAttribute(
      "data-attempted",
      "true",
    );
    expect(check).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Reveal the map" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Skip the hunt" }),
    ).toBeDisabled();

    const changingCondition = screen.getByRole("radio", {
      name: /test fraction 30%.*repeated entities high/i,
    });
    await user.click(changingCondition);
    expect(check).toBeEnabled();
    await user.click(check);
    expect(onClassify).toHaveBeenNthCalledWith(3, "CONCLUSION_CHANGES");
    expect(screen.getByRole("status")).toHaveTextContent(
      /you found a changing condition/i,
    );
  });

  it("supports an explicit reveal without selecting or classifying a cell", async () => {
    const user = userEvent.setup();
    const { onRevealMap, onClassify } = renderHunt();

    await user.click(screen.getByRole("button", { name: "Reveal the map" }));

    expect(onRevealMap).toHaveBeenCalledOnce();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("radio", {
        name: /test fraction 30%.*repeated entities high/i,
      }),
    );
    const checkButton = screen.getByRole("button", {
      name: "Check this condition",
    });
    expect(checkButton).toBeEnabled();
    await user.click(checkButton);
    expect(onClassify).toHaveBeenCalledWith("CONCLUSION_CHANGES");
    expect(onRevealMap).toHaveBeenCalledOnce();
  });

  it("lets the learner skip through the dedicated callback", async () => {
    const user = userEvent.setup();
    const { onRevealMap, onSkip } = renderHunt();

    await user.click(screen.getByRole("button", { name: "Skip the hunt" }));

    expect(onSkip).toHaveBeenCalledOnce();
    expect(onRevealMap).not.toHaveBeenCalled();
  });

  it("supports keyboard selection, submission, and verified-result binding", async () => {
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

    expect(
      screen.getByText(/bound to verified boundary map result/i),
    ).toHaveTextContent(boundaryFixture().resultHash.slice(0, 12));
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
