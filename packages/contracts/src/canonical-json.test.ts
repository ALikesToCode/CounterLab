import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CANONICAL_JSON_PROFILE, canonicalJsonV1 } from "./canonical-json.js";

const vectors = JSON.parse(
  readFileSync(
    new URL(
      "../../../fixtures/canonical/counterlab-canonical-json-v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as {
  profile: string;
  vectors: Array<{
    id: string;
    value: unknown;
    canonical: string;
    sha256: string;
  }>;
};

describe("CounterLab canonical JSON v1", () => {
  it("matches every shared cross-runtime vector", () => {
    expect(CANONICAL_JSON_PROFILE).toBe(vectors.profile);

    for (const vector of vectors.vectors) {
      const canonical = canonicalJsonV1(vector.value);
      expect(canonical, vector.id).toBe(vector.canonical);
      expect(
        createHash("sha256").update(canonical, "utf8").digest("hex"),
        vector.id,
      ).toBe(vector.sha256);
    }
  });

  it("rejects values that do not have one portable JSON representation", () => {
    const sparse = new Array(1);
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    const custom = Object.create({ inherited: true }) as Record<
      string,
      unknown
    >;
    custom.safe = true;

    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      "\ud800",
      "\udc00",
      { key: "\ud800" },
      { "\ud800": "key" },
      { value: undefined },
      [undefined],
      sparse,
      1n,
      new Date(0),
      new Map(),
      custom,
      cyclic,
    ]) {
      expect(() => canonicalJsonV1(value)).toThrow(TypeError);
    }
  });
});
