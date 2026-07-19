import { describe, expect, it } from "vitest";

import {
  listRecentWork,
  recentWorkPath,
  removeRecentWork,
  upsertRecentWork,
  type RecentWorkRecord,
} from "./recentWorkRegistry";

function storage(values = new Map<string, string>()): Storage {
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => void values.delete(key),
    setItem: (key, value) => void values.set(key, value),
  };
}

function record(
  id: string,
  updatedAt: string,
  mode: RecentWorkRecord["mode"] = "live",
): RecentWorkRecord {
  return { id, mode, status: "LAB_COMPILING", updatedAt };
}

describe("recent work registry", () => {
  it("keeps the latest three privacy-safe locators across reloads", () => {
    const values = new Map<string, string>();
    const firstPage = storage(values);
    for (const [index, id] of ["one", "two", "three", "four"].entries()) {
      expect(
        upsertRecentWork(
          record(id, `2026-07-19T10:0${index}:00.000Z`),
          firstPage,
        ),
      ).toBe(true);
    }

    expect(listRecentWork(storage(values)).map(({ id }) => id)).toEqual([
      "four",
      "three",
      "two",
    ]);
    const serialized = [...values.values()].join("\n");
    expect(serialized).not.toMatch(
      /claim|question|notebook|artifact|capability|token|secret|raw.?text/iu,
    );
  });

  it("deduplicates updates, creates encoded routes, and removes stale work", () => {
    const target = storage();
    upsertRecentWork(record("session:one", "2026-07-19T10:00:00.000Z"), target);
    upsertRecentWork(
      {
        ...record("session:one", "2026-07-19T10:01:00.000Z"),
        status: "EXPERIMENT_COMPLETED",
      },
      target,
    );
    expect(listRecentWork(target)).toHaveLength(1);
    expect(listRecentWork(target)[0]?.status).toBe("EXPERIMENT_COMPLETED");
    expect(recentWorkPath(listRecentWork(target)[0]!)).toBe(
      "/session/session%3Aone",
    );
    expect(
      recentWorkPath(
        record("leakage-01", "2026-07-19T10:02:00.000Z", "replay"),
      ),
    ).toBe("/replay/leakage-01");

    expect(removeRecentWork("session:one", "live", target)).toBe(true);
    expect(listRecentWork(target)).toEqual([]);
  });

  it("fails closed on invalid records and corrupt storage", () => {
    const target = storage();
    expect(
      upsertRecentWork(
        {
          ...record("safe", "2026-07-19T10:00:00.000Z"),
          claim: "raw",
        } as RecentWorkRecord,
        target,
      ),
    ).toBe(false);
    target.setItem("counterlab.recentWork.v1", "{bad-json");
    expect(listRecentWork(target)).toEqual([]);
  });
});
