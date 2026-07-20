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

  it("uses a stable opaque ID to deduplicate each session-stage event", async () => {
    const record = vi
      .spyOn(counterLabApi, "recordLearnerInteraction")
      .mockResolvedValue({
        schemaVersion: "1",
        eventId: "interaction_server",
        accepted: true,
        duplicate: false,
      });
    const draft = {
      kind: "stage.entered" as const,
      stage: "question" as const,
    };

    await recordLearnerInteraction("session_1", draft, {
      deduplicate: "session-stage",
    });
    await recordLearnerInteraction("session_1", draft, {
      deduplicate: "session-stage",
    });

    const firstEventId = record.mock.calls[0]?.[1].eventId;
    expect(firstEventId).toMatch(/^interaction_[0-9a-f]{32}$/u);
    expect(record.mock.calls[1]?.[1].eventId).toBe(firstEventId);
  });

  it("refuses session-stage deduplication for non-stage interactions", async () => {
    const record = vi.spyOn(counterLabApi, "recordLearnerInteraction");

    await expect(
      recordLearnerInteraction(
        "session_1",
        {
          kind: "patch.downloaded",
          stage: "repair",
        },
        { deduplicate: "session-stage" },
      ),
    ).resolves.toBe(false);
    expect(record).not.toHaveBeenCalled();
  });
});
