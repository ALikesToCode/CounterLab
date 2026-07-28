import { describe, expect, it, vi } from "vitest";
import {
  parseCountResponse,
  queryLegacyReplayCount,
} from "./query-legacy-replay-count.js";

function countResponse(
  field: "existing_replay_count" | "migration_applied",
  value: number,
): string {
  return JSON.stringify([
    {
      results: [{ [field]: value }],
      success: true,
    },
  ]);
}

describe("qualified deployment replay preflight", () => {
  it("counts every replay before the share-safe projection migration", () => {
    const query = vi
      .fn<(sql: string) => string>()
      .mockReturnValueOnce(countResponse("migration_applied", 0))
      .mockReturnValueOnce(countResponse("existing_replay_count", 2));

    expect(queryLegacyReplayCount(query)).toEqual({
      legacyReplayCount: 2,
      projectionMigrationApplied: false,
      queryScope: "all-replays",
      schemaVersion: "1",
    });
    expect(query.mock.calls[1]?.[0]).not.toContain("public_replay_projections");
  });

  it("counts only unprojected rows after the projection migration", () => {
    const query = vi
      .fn<(sql: string) => string>()
      .mockReturnValueOnce(countResponse("migration_applied", 1))
      .mockReturnValueOnce(countResponse("existing_replay_count", 0));

    expect(queryLegacyReplayCount(query)).toEqual({
      legacyReplayCount: 0,
      projectionMigrationApplied: true,
      queryScope: "unprojected-replays",
      schemaVersion: "1",
    });
    expect(query.mock.calls[1]?.[0]).toContain(
      "public_replay_projections.replay_id IS NULL",
    );
  });

  it("fails closed on an ambiguous migration state", () => {
    expect(() =>
      queryLegacyReplayCount(() => countResponse("migration_applied", 2)),
    ).toThrow(/ambiguous replay projection migration state/u);
  });

  it("rejects malformed D1 count output", () => {
    expect(() =>
      parseCountResponse(
        JSON.stringify([{ results: [], success: true }]),
        "existing_replay_count",
      ),
    ).toThrow(/one successful count result/u);
  });
});
