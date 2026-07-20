import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  SIGNED_RESULT_BINDING_V2_SCOPE,
  assertInternalScientificIntegrityScope,
  assertScientificIntegrityScopeRelationships,
  assertSignedResultBindingV2Scope,
  internalScientificIntegrityPaths,
} from "./internal-scientific-integrity-scope.js";

describe("source-owned scientific integrity scope", () => {
  it("binds the signed result renderer and mutation graph exactly", () => {
    expect(() => assertScientificIntegrityScopeRelationships()).not.toThrow();
    expect(() =>
      assertSignedResultBindingV2Scope(SIGNED_RESULT_BINDING_V2_SCOPE),
    ).not.toThrow();
  });

  it.each([
    ["duplicate", ["apps/example.ts", "apps/example.ts"]],
    ["absolute", ["/apps/example.ts"]],
    ["traversal", ["../apps/example.ts"]],
    ["backslash", ["apps\\example.ts"]],
    ["unsorted", ["z/example.ts", "a/example.ts"]],
  ])("rejects a %s path list", (_label, paths) => {
    expect(() =>
      assertInternalScientificIntegrityScope(
        "internal-renderer-integrity-v2",
        paths,
      ),
    ).toThrow();
  });

  it("reports both omitted and unexpected evidence paths", () => {
    const expected = internalScientificIntegrityPaths(
      "internal-renderer-integrity-v2",
    );
    expect(() =>
      assertInternalScientificIntegrityScope(
        "internal-renderer-integrity-v2",
        expected.slice(1),
      ),
    ).toThrow(/missing=/u);
    expect(() =>
      assertInternalScientificIntegrityScope("internal-renderer-integrity-v2", [
        ...expected,
        "z/unexpected-renderer.ts",
      ]),
    ).toThrow(/unexpected=/u);
  });

  it("requires both evidence generators to materialize the shared scope", async () => {
    for (const source of [
      "refresh-scientific-engine-bindings.ts",
      "bind-source-bound-scientific-evidence.ts",
    ]) {
      const body = await readFile(new URL(source, import.meta.url), "utf8");
      expect(body).toContain("internalScientificIntegrityPaths");
      expect(body).toContain("assertScientificIntegrityScopeRelationships");
      expect(body).toContain("SIGNED_RESULT_BINDING_V2_SCOPE");
    }
  });
});
