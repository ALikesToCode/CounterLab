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
    vi.restoreAllMocks();
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
        key: (index: number) => [...values.keys()][index] ?? null,
        get length() {
          return values.size;
        },
      } satisfies Storage,
    });
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

    expect(recordLearnerInteraction).toHaveBeenCalledWith(
      "session_1",
      {
        kind: "stage.entered",
        stage: "question",
      },
      { deduplicate: "session-stage" },
    );

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
      { deduplicate: "session-stage" },
    );
    expect(recordLearnerInteraction).toHaveBeenCalledWith(
      "session_1",
      {
        kind: "stage.entered",
        stage: "prediction",
      },
      { deduplicate: "session-stage" },
    );

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

  it("preserves the original stage entry time across a refresh", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const firstView = render(
      <TimingHarness
        sessionId="session_refresh"
        stage="question"
        journeyComplete={false}
      />,
    );
    firstView.unmount();

    now.mockReturnValue(2_500);
    const refreshedView = render(
      <TimingHarness
        sessionId="session_refresh"
        stage="question"
        journeyComplete={false}
      />,
    );
    now.mockReturnValue(3_000);
    refreshedView.rerender(
      <TimingHarness
        sessionId="session_refresh"
        stage="prediction"
        journeyComplete={false}
      />,
    );

    expect(recordLearnerInteraction).toHaveBeenCalledWith(
      "session_refresh",
      {
        kind: "stage.completed",
        stage: "question",
        elapsedMs: 2_000,
      },
      { deduplicate: "session-stage" },
    );
  });

  it("retries a completed stage with the exact persisted elapsed payload", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(5_000);
    const firstView = render(
      <TimingHarness
        sessionId="session_completion_retry"
        stage="repair"
        journeyComplete={false}
      />,
    );
    now.mockReturnValue(6_250);
    firstView.rerender(
      <TimingHarness
        sessionId="session_completion_retry"
        stage="repair"
        journeyComplete
      />,
    );
    firstView.unmount();

    now.mockReturnValue(20_000);
    render(
      <TimingHarness
        sessionId="session_completion_retry"
        stage="repair"
        journeyComplete
      />,
    );

    const completionPayloads = recordLearnerInteraction.mock.calls
      .filter(
        ([, interaction]) =>
          interaction.kind === "stage.completed" &&
          interaction.stage === "repair",
      )
      .map(([, interaction]) => interaction);
    expect(completionPayloads).toEqual([
      {
        kind: "stage.completed",
        stage: "repair",
        elapsedMs: 1_250,
      },
      {
        kind: "stage.completed",
        stage: "repair",
        elapsedMs: 1_250,
      },
    ]);
  });
});
