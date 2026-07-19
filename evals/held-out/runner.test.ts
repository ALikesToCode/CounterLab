import { describe, expect, it } from "vitest";

import { runHeldOutBenchmark } from "./src/runner.js";

const benchmark = runHeldOutBenchmark({
  root: process.cwd(),
  executedAt: "2026-07-15T00:00:00.000Z",
});

describe("held-out notebook benchmark", () => {
  it("executes the real safe parser over all labelled cases", async () => {
    const result = await benchmark;

    expect(result.schemaVersion).toBe("2");
    expect(result.summary.total).toBe(10);
    expect(result.summary.byFamily).toEqual({
      entity_leakage: { passed: 4, total: 4 },
      class_imbalance: { passed: 4, total: 4 },
      unsupported: { passed: 2, total: 2 },
    });
    expect(result.summary.passed).toBe(10);
    expect(result.summary.supportedCompletion).toEqual({ passed: 7, total: 8 });
    expect(result.summary.patchEligibleCompletion).toEqual({
      passed: 7,
      total: 7,
    });
    expect(result.summary.expectedEstimatorContractRefusals).toEqual({
      passed: 1,
      total: 1,
    });
    expect(
      result.cases.filter((item) => item.completion.patchVerified),
    ).toHaveLength(7);
    expect(result.cases.every((item) => item.executedParser === true)).toBe(
      true,
    );
    expect(result.cases.every((item) => item.passed)).toBe(true);
  }, 120_000);

  it("keeps unsupported refusal checks distinct from concept inference", async () => {
    const result = await benchmark;
    const unsupported = result.cases.filter(
      (item) => item.family === "unsupported",
    );

    expect(unsupported).toHaveLength(2);
    expect(
      unsupported.every(
        (item) => item.observed.supportStatus === "UNSUPPORTED",
      ),
    ).toBe(true);
    expect(unsupported.every((item) => item.observed.concept === null)).toBe(
      true,
    );
    expect(
      unsupported.every((item) => item.checks.supportReasonsMatch === true),
    ).toBe(true);
  }, 120_000);

  it("records the RandomForest patch refusal as an explicit expected outcome", async () => {
    const result = await benchmark;
    const randomForest = result.cases.find(
      (item) => item.caseId === "leakage_random_forest",
    );

    expect(randomForest).toMatchObject({
      expected: {
        completionOutcome: "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
      },
      checks: { completionOutcomeMatches: true },
      completion: {
        failureCode: "PATCH_ESTIMATOR_OUTSIDE_CONTRACT",
        outcome: "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
        patchVerified: false,
      },
      passed: true,
    });
  }, 120_000);
});
