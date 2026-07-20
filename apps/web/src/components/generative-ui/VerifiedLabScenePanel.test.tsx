import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { counterLabApi } from "../../api";
import { VerifiedLabScenePanel } from "./VerifiedLabScenePanel";

const digest = (character: string) => character.repeat(64);
const resultHash = digest("d");

function view() {
  return {
    schemaVersion: "1" as const,
    scene: {
      schemaVersion: "2" as const,
      sceneId: "scene_live",
      sessionId: "session_live",
      concept: "entity_leakage" as const,
      supportLabel: "GUIDED_VISUAL" as const,
      title: "Does the score survive new customers?",
      blocks: [
        {
          id: "metric",
          type: "Metric" as const,
          label: "Whole-customer accuracy",
          resultBinding: "/runs/byId/group_holdout/metrics/accuracy",
          unit: "proportion",
        },
      ],
      assumptions: ["The model and preprocessing stay fixed."],
      limitations: ["This does not establish global performance."],
      provenance: {
        experimentIrHash: digest("a"),
        discriminationContractHash: digest("b"),
      },
    },
    verifiedSceneHash: digest("c"),
    signedResult: {
      schemaVersion: "1" as const,
      verificationStatus: "VERIFIED" as const,
      sceneHash: digest("c"),
      sceneId: "scene_live",
      sessionId: "session_live",
      concept: "entity_leakage" as const,
      experimentIrHash: digest("a"),
      discriminationContractHash: digest("b"),
      resultHash,
      integrity: {
        mode: "integrity-hashed" as const,
        contentHash: resultHash,
      },
      result: {
        resultHash,
        runs: [{ id: "group_holdout", metrics: { accuracy: 0.594 } }],
      },
    },
  };
}

describe("VerifiedLabScenePanel", () => {
  afterEach(() => vi.restoreAllMocks());

  it("loads and renders only the server-verified scene envelope", async () => {
    const getLabScene = vi
      .spyOn(counterLabApi, "getLabScene")
      .mockResolvedValue(view());
    render(<VerifiedLabScenePanel sessionId="session_live" />);

    expect(screen.getByText(/resolving the verified scene/i)).toBeVisible();
    expect(
      await screen.findByRole("heading", {
        name: "Does the score survive new customers?",
      }),
    ).toBeVisible();
    expect(screen.getByText("0.594")).toBeVisible();
    expect(getLabScene).toHaveBeenCalledWith(
      "session_live",
      expect.any(AbortSignal),
    );
  });

  it("withholds generated presentation when authority cannot be loaded", async () => {
    vi.spyOn(counterLabApi, "getLabScene").mockRejectedValue(
      new Error("unavailable"),
    );
    render(<VerifiedLabScenePanel sessionId="session_live" />);

    expect(await screen.findByText(/generated visual withheld/i)).toBeVisible();
    expect(screen.queryByText("0.594")).not.toBeInTheDocument();
  });
});
