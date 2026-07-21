import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { SessionView } from "../../api";
import { LearningDirectorPanel } from "./LearningDirectorPanel";

const hash = (character: string) => character.repeat(64);
const provenance = {
  modelId: "gpt-5.6",
  promptHash: hash("a"),
  turns: 2 as const,
  toolTrace: [
    {
      toolName: "get_subject_pack_capabilities" as const,
      argsHash: hash("b"),
      outputHash: hash("c"),
      durationMs: 1,
    },
  ],
};

describe("LearningDirectorPanel", () => {
  it("renders only fixed clarification labels and returns the selected ID", async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    const state = {
      schemaVersion: "1" as const,
      beliefSpecHash: hash("d"),
      approvedPacketHash: hash("e"),
      subjectPackVersion: "2.1.0",
      clarificationUsed: true,
      decision: {
        status: "CLARIFICATION_REQUIRED" as const,
        questionId: "learning-emphasis" as const,
        choices: ["controls-first", "boundary-first"] as const,
      },
      provenance,
    } satisfies NonNullable<SessionView["learningDirector"]>;

    render(
      <LearningDirectorPanel state={state} busy={false} onAnswer={onAnswer} />,
    );

    expect(
      screen.getByText(/cannot choose the experiment/i),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /trace the controls/i }),
    );
    expect(onAnswer).toHaveBeenCalledWith("controls-first");
  });

  it("labels a ready route as presentation-only without exposing result authority", () => {
    const state = {
      schemaVersion: "1" as const,
      beliefSpecHash: hash("e"),
      approvedPacketHash: hash("f"),
      subjectPackVersion: "2.1.0",
      clarificationUsed: false,
      decision: {
        status: "READY" as const,
        plan: {
          concept: "entity_leakage" as const,
          introductionStages: [
            "Question",
            "Prediction",
            "Test",
            "Boundary",
            "Apply",
          ] as const,
          primaryEmphasis: "Boundary" as const,
          scaffoldIds: ["compare-splits"],
          candidateExperimentIds: ["group-holdout"],
          sceneRecipeId: "entity-overlap-stage",
          boundaryViewId: "test-fraction-by-repeat-rate",
          evidenceHashes: [hash("d")],
          nonClaims: ["bounded-claim-only" as const],
        },
      },
      provenance,
    } satisfies NonNullable<SessionView["learningDirector"]>;

    render(
      <LearningDirectorPanel
        state={state}
        busy={false}
        onAnswer={() => undefined}
      />,
    );

    expect(screen.getByText(/presentation only/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /suggested introduction emphasis/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not claim to apply every suggestion/i),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/lesson will emphasize/i);
    expect(screen.getByText(/subject pack scorer/i)).toBeInTheDocument();
    expect(screen.queryByText(hash("d"))).not.toBeInTheDocument();
  });
});
