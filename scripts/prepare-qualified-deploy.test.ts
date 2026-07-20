import { describe, expect, it } from "vitest";

import {
  assertEvidenceOnlyReleaseDelta,
  parseEvidenceOnlyReleaseDelta,
} from "./prepare-qualified-deploy.js";

describe("qualified release evidence-only delta", () => {
  it("accepts only reviewed generated evidence and release notes", () => {
    expect(() =>
      assertEvidenceOnlyReleaseDelta([
        "docs/PROGRESS.md",
        "docs/sbom/node.cdx.json",
        "scientific-engines/evidence-catalog.json",
        "scientific-engines/fixtures/validation/internal-renderer-integrity-v2.json",
        "scientific-engines/fixtures/validation/signed-result-binding-v2.json",
        "scientific-engines/subject-pack-bindings.json",
      ]),
    ).not.toThrow();
  });

  it("rejects authority schemas, runtime policy, and undeclared evidence files", () => {
    for (const path of [
      "scientific-engines/schemas/qualified-runner-release-v4.schema.json",
      "services/runner/src/counterlab_runner/contained-runtime-policy.json",
      "scientific-engines/fixtures/validation/unreviewed.json",
      "scripts/qualify-runner-release.ts",
    ]) {
      expect(() => assertEvidenceOnlyReleaseDelta([path])).toThrow(
        /changes runtime source/u,
      );
    }
  });

  it("accepts only regular-file additions and modifications", () => {
    expect(
      parseEvidenceOnlyReleaseDelta(
        [
          `:100644 100644 ${"1".repeat(40)} ${"2".repeat(40)} M\tdocs/PROGRESS.md`,
          `:000000 100644 ${"0".repeat(40)} ${"3".repeat(40)} A\tdocs/sbom/node.cdx.json`,
        ].join("\n"),
      ),
    ).toEqual(["docs/PROGRESS.md", "docs/sbom/node.cdx.json"]);

    for (const raw of [
      `:100644 000000 ${"1".repeat(40)} ${"0".repeat(40)} D\tdocs/PROGRESS.md`,
      `:100644 120000 ${"1".repeat(40)} ${"2".repeat(40)} M\tdocs/PROGRESS.md`,
      `:100644 100755 ${"1".repeat(40)} ${"2".repeat(40)} M\tdocs/PROGRESS.md`,
      `:100644 100644 ${"1".repeat(40)} ${"2".repeat(40)} R100\tdocs/PROGRESS.md`,
    ]) {
      expect(() => parseEvidenceOnlyReleaseDelta(raw)).toThrow(
        /unsupported Git delta|file type or mode/u,
      );
    }
  });
});
