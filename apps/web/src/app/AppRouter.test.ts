import { describe, expect, it } from "vitest";

import { parseStudioLocation, studioPath } from "./AppRouter";

describe("Studio URL routing", () => {
  it("parses resumable session, replay, and proof paths", () => {
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
      kind: "landing",
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
    expect(studioPath({ stage: "build", mode: "replay" })).toBe(
      "/replay/leakage-01",
    );
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
