import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  buildScientificPolicyRepairPrompt,
  mismatchedScientificFindingPaths,
  normalizeScientificFindingPaths,
  ScientificArtifactValidationError,
  zodScientificFindingPaths,
} from "./scientific-repair.js";

describe("scientific repair diagnostics", () => {
  it("reports bounded schema paths without rejected values", () => {
    const schema = z
      .object({
        experimentIr: z.object({
          sessionId: z.literal("session_expected"),
          candidateExperiments: z.array(
            z.object({ id: z.literal("allowed-candidate") }),
          ),
        }),
      })
      .strict();
    const result = schema.safeParse({
      experimentIr: {
        sessionId: "session_private_rejected",
        candidateExperiments: [{ id: "private-invalid-candidate" }],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    const paths = zodScientificFindingPaths(
      result.error,
      "authoritativeArtifact",
    );
    const prompt = buildScientificPolicyRepairPrompt(
      "original bounded input",
      1,
      ["OUTPUT_SCHEMA_INVALID"],
      paths,
    );

    expect(paths).toEqual([
      "authoritativeArtifact.experimentIr.candidateExperiments[0].id",
      "authoritativeArtifact.experimentIr.sessionId",
    ]);
    expect(prompt).toContain("authoritativeArtifact.experimentIr.sessionId");
    expect(prompt).not.toContain("session_private_rejected");
    expect(prompt).not.toContain("private-invalid-candidate");
  });

  it("redacts non-structural Zod path segments", () => {
    const schema = z.object({
      values: z.record(z.string(), z.literal("expected")),
    });
    const result = schema.safeParse({
      values: { "learner-private-field": "rejected" },
    });
    expect(result.success).toBe(false);
    if (result.success) return;

    expect(zodScientificFindingPaths(result.error, "artifact")).toEqual([
      "artifact.values.?",
    ]);
  });

  it("limits and sanitizes untrusted path labels", () => {
    const paths = normalizeScientificFindingPaths([
      "experimentIr.safe",
      "experimentIr.safe",
      "experimentIr.bad value/secret",
      ...Array.from({ length: 30 }, (_, index) => `labScene.blocks[${index}]`),
    ]);

    expect(paths).toHaveLength(24);
    expect(paths).toContain("experimentIr.bad?value?secret");
    expect(paths.filter((path) => path === "experimentIr.safe")).toHaveLength(
      1,
    );
    expect(paths.every((path) => !path.includes("/"))).toBe(true);
  });

  it("names only immutable fields whose values differ", () => {
    expect(
      mismatchedScientificFindingPaths([
        { path: "experimentIr.sessionId", actual: "wrong", expected: "right" },
        {
          path: "experimentIr.concept",
          actual: "entity_leakage",
          expected: "entity_leakage",
        },
      ]),
    ).toEqual(["experimentIr.sessionId"]);
  });

  it("keeps only sanitized paths on artifact validation errors", () => {
    const error = new ScientificArtifactValidationError(
      "IMMUTABLE_LINEAGE_MISMATCH",
      "fixed validation failed",
      {
        findingPaths: ["experimentIr.sessionId", "experimentIr.secret/value"],
      },
    );

    expect(error.findingPaths).toEqual([
      "experimentIr.secret?value",
      "experimentIr.sessionId",
    ]);
    expect(error.message).toBe("fixed validation failed");
  });
});
