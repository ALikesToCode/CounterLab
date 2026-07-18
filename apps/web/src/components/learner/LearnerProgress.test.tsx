import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SessionState } from "@counterlab/contracts";

import { LearnerProgress } from "./LearnerProgress";
import { currentLearnerStage, learnerStages } from "./learnerStages";

describe("learnerStages", () => {
  it("maps Studio stages and persisted session states to one six-stage model", () => {
    expect(learnerStages.map((stage) => stage.label)).toEqual([
      "Question",
      "Prediction",
      "Test",
      "Boundary",
      "Apply",
      "Repair",
    ]);
    expect(currentLearnerStage("claim", "PROOF_CAPSULE_ISSUED")).toBe(
      "question",
    );
    expect(currentLearnerStage("belief", "INGESTED")).toBe("prediction");
    expect(currentLearnerStage("live-compile", "INGESTED")).toBe("test");

    const stateExpectations: Array<[SessionState, string]> = [
      ["EXPERIMENT_COMPLETED", "boundary"],
      ["BOUNDARY_VERIFIED", "boundary"],
      ["TRANSFER_FAILED", "apply"],
      ["TRANSFER_PASSED", "repair"],
      ["PROOF_CAPSULE_ISSUED", "repair"],
    ];
    for (const [state, expected] of stateExpectations) {
      expect(currentLearnerStage("reality", state)).toBe(expected);
    }
  });
});

describe("LearnerProgress", () => {
  it("makes completed stages keyboard-reviewable and keeps future stages inert", async () => {
    const user = userEvent.setup();
    const review = vi.fn();
    render(
      <LearnerProgress
        stage="reality"
        sessionState="TRANSFER_IN_PROGRESS"
        onReviewStage={review}
      />,
    );

    const desktop = within(screen.getByTestId("learner-progress-desktop"));
    const question = desktop.getByRole("button", {
      name: "Review Question",
    });
    question.focus();
    await user.keyboard("{Enter}");
    expect(review).toHaveBeenCalledWith("question");

    expect(
      desktop.getByText("Apply").closest('[aria-current="step"]'),
    ).not.toBeNull();
    expect(
      desktop.queryByRole("button", { name: "Review Repair" }),
    ).not.toBeInTheDocument();
    fireEvent.click(desktop.getByText("Repair"));
    expect(review).toHaveBeenCalledTimes(1);
  });

  it("offers the same stages in the mobile Step n of 6 disclosure", async () => {
    const user = userEvent.setup();
    const review = vi.fn();
    render(
      <LearnerProgress
        stage="reality"
        sessionState="TRANSFER_IN_PROGRESS"
        onReviewStage={review}
      />,
    );

    const mobileElement = screen.getByTestId("learner-progress-mobile");
    const mobile = within(mobileElement);
    const summary = mobile.getAllByText("Step 5 of 6")[0]?.closest("summary");
    expect(summary).not.toBeNull();
    await user.click(summary!);
    expect(mobileElement).toHaveAttribute("open");

    const stageNav = within(
      mobile.getByRole("navigation", { name: "All learner stages" }),
    );
    expect(
      stageNav.getByText("Apply").closest('[aria-current="step"]'),
    ).not.toBeNull();
    expect(
      stageNav.queryByRole("button", { name: "Review Repair" }),
    ).not.toBeInTheDocument();
    await user.click(stageNav.getByRole("button", { name: "Review Boundary" }));
    expect(review).toHaveBeenCalledWith("boundary");
  });
});
