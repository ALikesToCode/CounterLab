import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { canonicalJson as proofCanonicalJson } from "../../proof-bundle/src/index.js";

import { canonicalJson } from "./index.js";

describe("Worker runtime boundary", () => {
  it("keeps Node built-ins and SQLite outside the runtime-neutral entrypoint", () => {
    const runtimeNeutralFiles = [
      "index.ts",
      "domain.ts",
      "repository.ts",
      "service.ts",
    ];
    for (const file of runtimeNeutralFiles) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/from ["']node:/);
      expect(source, file).not.toContain("sqlite-repository");
    }
  });

  it("matches proof-bundle canonical ordering for mixed-case and non-ASCII keys", () => {
    const vector = {
      z: "lower-z",
      Z: "upper-z",
      é: "accent",
      a: "lower-a",
      A: "upper-a",
      Å: "ring",
      内: { β: 3, b: 1, B: 2 },
    };
    const golden =
      '{"A":"upper-a","Z":"upper-z","a":"lower-a","z":"lower-z","Å":"ring","é":"accent","内":{"B":2,"b":1,"β":3}}';

    expect(canonicalJson(vector)).toBe(golden);
    expect(canonicalJson(vector)).toBe(proofCanonicalJson(vector));
  });

  it("preserves own prototype-named keys with proof-bundle parity", () => {
    const vector = JSON.parse('{"safe":1,"__proto__":{"x":1}}') as Record<
      string,
      unknown
    >;
    const golden = '{"__proto__":{"x":1},"safe":1}';

    expect(canonicalJson(vector)).toBe(golden);
    expect(proofCanonicalJson(vector)).toBe(golden);
  });

  it("rejects values that proof-bundle canonical JSON cannot represent", () => {
    const sparse = new Array(1);
    const invalidValues = [
      { value: undefined },
      [undefined],
      { value: Number.NaN },
      sparse,
    ];

    for (const value of invalidValues) {
      expect(() => canonicalJson(value)).toThrow(TypeError);
      expect(() => proofCanonicalJson(value)).toThrow(TypeError);
    }
  });
});
