// @vitest-environment node

import { describe, expect, it } from "vitest";

import { evaluateImbalanceTransfer } from "./sample-learning-loop";

describe("fixed class-imbalance transfer evaluator", () => {
  it("passes only when the learner transfers prevalence and false-negative cost", async () => {
    const passed = await evaluateImbalanceTransfer(
      "session_imbalance",
      {
        strategyChoice: "cost_aware_threshold",
        riskChoice: "minority_false_negative_cost",
        evidenceChoices: [
          "confusion_matrix_exposes_misses",
          "prevalence_shift_changes_precision",
        ],
      },
      "2026-07-15T00:00:00.000Z",
    );
    const failed = await evaluateImbalanceTransfer(
      "session_imbalance",
      {
        strategyChoice: "highest_accuracy",
        riskChoice: "overall_error_rate",
        evidenceChoices: ["accuracy_is_high"],
      },
      "2026-07-15T00:00:00.000Z",
    );

    expect(passed).toMatchObject({
      taskId: "manufacturing-defect-transfer-01",
      outcome: "PASSED",
      evaluatorVersion: "counterlab-imbalance-transfer-v1",
      checks: [
        { invariant: "ASYMMETRIC_ERROR_COST", passed: true },
        { invariant: "PREVALENCE_SENSITIVE_METRIC", passed: true },
        { invariant: "EVIDENCE_GROUNDED", passed: true },
      ],
    });
    expect(failed.outcome).toBe("FAILED");
    expect(failed.checks.every((check) => !check.passed)).toBe(true);
    expect(passed.resultHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
