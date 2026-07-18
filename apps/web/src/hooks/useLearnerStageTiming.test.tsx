import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LearnerStageId } from "../components/learner/learnerStages";
import { useLearnerStageTiming } from "./useLearnerStageTiming";

const recordLearnerInteraction = vi.hoisted(() => vi.fn());

vi.mock("../features/learner/interactionEvidence", () => ({
  recordLearnerInteraction,
}));

function TimingHarness({
  sessionId,
  stage,
  journeyComplete,
}: {
  sessionId: string | null;
  stage: LearnerStageId;
  journeyComplete: boolean;
}) {
  useLearnerStageTiming({ sessionId, stage, journeyComplete });
  return null;
}

describe("useLearnerStageTiming", () => {
  beforeEach(() => {
    recordLearnerInteraction.mockReset();
    recordLearnerInteraction.mockResolvedValue(true);
  });

  it("records categorical stage entry, completion, and final elapsed time", () => {
    const view = render(
      <TimingHarness
        sessionId="session_1"
        stage="question"
        journeyComplete={false}
      />,
    );

    expect(recordLearnerInteraction).toHaveBeenCalledWith("session_1", {
      kind: "stage.entered",
      stage: "question",
    });

    view.rerender(
      <TimingHarness
        sessionId="session_1"
        stage="prediction"
        journeyComplete={false}
      />,
    );

    expect(recordLearnerInteraction).toHaveBeenCalledWith(
      "session_1",
      expect.objectContaining({
        kind: "stage.completed",
        stage: "question",
        elapsedMs: expect.any(Number),
      }),
    );
    expect(recordLearnerInteraction).toHaveBeenCalledWith("session_1", {
      kind: "stage.entered",
      stage: "prediction",
    });

    view.rerender(
      <TimingHarness
        sessionId="session_1"
        stage="repair"
        journeyComplete={false}
      />,
    );
    view.rerender(
      <TimingHarness sessionId="session_1" stage="repair" journeyComplete />,
    );

    const repairCompletions = recordLearnerInteraction.mock.calls.filter(
      ([, interaction]) =>
        interaction.kind === "stage.completed" &&
        interaction.stage === "repair",
    );
    expect(repairCompletions).toHaveLength(1);
    expect(repairCompletions[0]?.[1]).toEqual(
      expect.objectContaining({ elapsedMs: expect.any(Number) }),
    );
  });

  it("does not record without a scientific session", () => {
    render(
      <TimingHarness
        sessionId={null}
        stage="question"
        journeyComplete={false}
      />,
    );
    expect(recordLearnerInteraction).not.toHaveBeenCalled();
  });
});
