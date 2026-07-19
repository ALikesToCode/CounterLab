import { describe, expect, it } from "vitest";

import { parseStudioLocation, studioPath } from "./AppRouter";

describe("Studio URL routing", () => {
  it("parses resumable session, replay, and proof paths", () => {
    expect(parseStudioLocation("/judge")).toEqual({ kind: "judge" });
    expect(parseStudioLocation("/session/session%2Fone")).toEqual({
      kind: "session",
      id: "session/one",
    });
    expect(parseStudioLocation("/replay/leakage-01")).toEqual({
      kind: "replay",
      id: "leakage-01",
    });
    expect(parseStudioLocation("/proof/session_1")).toEqual({
      kind: "proof",
      id: "session_1",
    });
    expect(parseStudioLocation("/session/%E0%A4%A")).toEqual({
      kind: "not-found",
    });
    expect(parseStudioLocation("/not-a-counterlab-route")).toEqual({
      kind: "not-found",
    });
    expect(parseStudioLocation("/session/session_1/extra")).toEqual({
      kind: "not-found",
    });
  });

  it("keeps sample, live, replay, and completed proof URLs distinct", () => {
    expect(studioPath({ stage: "landing", mode: null })).toBe("/");
    expect(studioPath({ stage: "live-setup", mode: "live" })).toBe("/new");
    expect(
      studioPath({
        stage: "belief",
        mode: "live",
        sessionId: "session/one",
      }),
    ).toBe("/session/session%2Fone");
    expect(
      studioPath({
        stage: "build",
        mode: "replay",
        replayId: "replay/dynamic one",
      }),
    ).toBe("/replay/replay%2Fdynamic%20one");
    expect(studioPath({ stage: "build", mode: "replay" })).toBe("/");
    expect(
      studioPath({
        stage: "reality",
        mode: "live",
        sessionId: "session_1",
        completed: true,
      }),
    ).toBe("/proof/session_1");
  });
});
