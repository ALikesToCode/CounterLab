import { beforeEach, describe, expect, it, vi } from "vitest";

import { counterLabApi } from "../../api";
import { recordLearnerInteraction } from "./interactionEvidence";

describe("privacy-safe learner interaction recording", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("adds only an opaque ID and the closed categorical draft", async () => {
    const record = vi
      .spyOn(counterLabApi, "recordLearnerInteraction")
      .mockResolvedValue({
        schemaVersion: "1",
        eventId: "interaction_server",
        accepted: true,
        duplicate: false,
      });

    await expect(
      recordLearnerInteraction("session_1", {
        kind: "prediction.recorded",
        stage: "prediction",
        choice: "alternative_explanation",
        confidence: 72,
      }),
    ).resolves.toBe(true);

    expect(record).toHaveBeenCalledWith(
      "session_1",
      expect.objectContaining({
        schemaVersion: "1",
        eventId: expect.stringMatching(/^interaction_/u),
        kind: "prediction.recorded",
        stage: "prediction",
        choice: "alternative_explanation",
        confidence: 72,
      }),
    );
    expect(JSON.stringify(record.mock.calls[0])).not.toMatch(
      /name|revision|notebook|file|path|claim/iu,
    );
  });

  it("cannot interrupt an authoritative learner action when telemetry fails", async () => {
    vi.spyOn(counterLabApi, "recordLearnerInteraction").mockRejectedValue(
      new Error("analytics unavailable"),
    );
    await expect(
      recordLearnerInteraction("session_1", {
        kind: "patch.downloaded",
        stage: "repair",
      }),
    ).resolves.toBe(false);
  });
});
