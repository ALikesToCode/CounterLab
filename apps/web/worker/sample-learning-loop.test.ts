// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  ImbalanceTransferSubmissionSchema,
  LeakageTransferSubmissionSchema,
} from "@counterlab/contracts";

import imbalanceTransferTask from "../../../concept-packs/imbalance/transfer/task.json";
import leakageTransferTask from "../../../concept-packs/leakage/transfer/task.json";

import {
  assertPassedTransferMatchesFixedPolicy,
  createSamplePatchResult,
  evaluateImbalanceTransfer,
  evaluateLeakageTransfer,
} from "./sample-learning-loop";

const currentSampleArtifactHash =
  "d0e9f3238753f1ca55534446d83e36041590f31c607a011def3f1d0db3a5bbc9";

describe("cross-runtime transfer registry parity", () => {
  it("binds the TypeScript schemas to the checked-in fixed task IDs", () => {
    expect(leakageTransferTask.strategyChoices.map(({ id }) => id)).toEqual([
      "random_row_holdout",
      "time_ordered_holdout",
      "grouped_store_holdout",
    ]);
    expect(leakageTransferTask.riskChoices.map(({ id }) => id)).toEqual([
      "centered_window_reads_future",
      "model_is_too_simple",
      "stores_have_different_scales",
    ]);
    expect(leakageTransferTask.evidenceChips.map(({ id }) => id)).toEqual([
      "center_true_uses_later_targets",
      "random_split_mixes_dates",
      "metric_is_mae",
    ]);
    expect(imbalanceTransferTask.id).toBe("manufacturing-defect-transfer-01");
    expect(imbalanceTransferTask.decisionChoices.map(({ id }) => id)).toEqual([
      "approve_high_accuracy",
      "reject_accuracy_only",
      "collect_more_negatives",
    ]);
    expect(imbalanceTransferTask.metricChoices.map(({ id }) => id)).toEqual([
      "accuracy",
      "recall_and_pr_auc",
      "negative_specificity",
    ]);
    expect(imbalanceTransferTask.evidenceChips.map(({ id }) => id)).toEqual([
      "zero_true_positives",
      "rare_base_rate",
      "many_true_negatives",
    ]);
    expect(
      LeakageTransferSubmissionSchema.safeParse({
        strategyChoice: leakageTransferTask.strategyChoices[1]!.id,
        riskChoice: leakageTransferTask.riskChoices[0]!.id,
        evidenceChoices: leakageTransferTask.evidenceChips
          .slice(0, 2)
          .map(({ id }) => id),
      }).success,
    ).toBe(true);
    expect(
      ImbalanceTransferSubmissionSchema.safeParse({
        decisionChoice: imbalanceTransferTask.decisionChoices[1]!.id,
        metricChoice: imbalanceTransferTask.metricChoices[1]!.id,
        evidenceChoices: imbalanceTransferTask.evidenceChips
          .slice(0, 2)
          .map(({ id }) => id),
      }).success,
    ).toBe(true);
  });
});

describe("fixed leakage transfer evaluator", () => {
  it("passes only when the learner identifies the future-crossing feature", async () => {
    const safeChoice = await evaluateLeakageTransfer(
      "session_leakage",
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "model_is_too_simple",
        evidenceChoices: [
          "center_true_uses_later_targets",
          "random_split_mixes_dates",
        ],
      },
      "2026-07-15T00:00:00.000Z",
    );
    const leakingChoice = await evaluateLeakageTransfer(
      "session_leakage",
      {
        strategyChoice: "time_ordered_holdout",
        riskChoice: "centered_window_reads_future",
        evidenceChoices: [
          "center_true_uses_later_targets",
          "random_split_mixes_dates",
        ],
      },
      "2026-07-15T00:00:00.000Z",
    );

    expect(safeChoice.outcome).toBe("FAILED");
    expect(safeChoice.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invariant: "FUTURE_INFORMATION_RISK",
          passed: false,
        }),
      ]),
    );
    expect(leakingChoice.outcome).toBe("PASSED");
    expect(leakingChoice.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          invariant: "FUTURE_INFORMATION_RISK",
          passed: true,
        }),
      ]),
    );
    expect(leakingChoice.resultHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("binds Repair only to the current checked-in sample artifact", async () => {
    const patch = await createSamplePatchResult(
      "session_leakage",
      currentSampleArtifactHash,
      "2026-07-15T00:00:00.000Z",
    );

    expect(patch).toMatchObject({
      status: "VERIFIED",
      sourceArtifactHash: currentSampleArtifactHash,
      patchedArtifactHash:
        "6aee552e94f2dfbad8366cdd2435dcc5aa0c3c6cd45798a924779ae5008561fc",
    });
    await expect(
      createSamplePatchResult(
        "session_leakage",
        "0".repeat(64),
        "2026-07-15T00:00:00.000Z",
      ),
    ).rejects.toThrow(/source artifact/u);
  });
});

describe("fixed class-imbalance transfer evaluator", () => {
  it("passes only when the learner rejects accuracy-only evidence and selects minority metrics", async () => {
    const passed = await evaluateImbalanceTransfer(
      "session_imbalance",
      {
        decisionChoice: "reject_accuracy_only",
        metricChoice: "recall_and_pr_auc",
        evidenceChoices: ["zero_true_positives", "rare_base_rate"],
      },
      "2026-07-15T00:00:00.000Z",
    );
    const failed = await evaluateImbalanceTransfer(
      "session_imbalance",
      {
        decisionChoice: "approve_high_accuracy",
        metricChoice: "accuracy",
        evidenceChoices: ["many_true_negatives"],
      },
      "2026-07-15T00:00:00.000Z",
    );

    expect(passed).toMatchObject({
      taskId: "manufacturing-defect-transfer-01",
      outcome: "PASSED",
      evaluatorVersion: "counterlab-imbalance-transfer-v1",
      checks: [
        { invariant: "ACCURACY_CLAIM_REJECTED", passed: true },
        { invariant: "MINORITY_METRICS_SELECTED", passed: true },
        { invariant: "EVIDENCE_GROUNDED", passed: true },
      ],
    });
    expect(failed.outcome).toBe("FAILED");
    expect(failed.checks.every((check) => !check.passed)).toBe(true);
    expect(passed.resultHash).toMatch(/^[a-f0-9]{64}$/);
    expect(() =>
      assertPassedTransferMatchesFixedPolicy("class_imbalance", passed),
    ).not.toThrow();

    const legacyCostTuple = {
      ...passed,
      selectedStrategy: "cost_aware_threshold",
      identifiedRisks: ["minority_false_negative_cost"],
      evidenceChoices: [
        "confusion_matrix_exposes_misses",
        "prevalence_shift_changes_precision",
      ],
    };
    expect(() =>
      assertPassedTransferMatchesFixedPolicy(
        "class_imbalance",
        legacyCostTuple,
      ),
    ).toThrow(/fixed Subject Pack evaluator policy/i);
  });
});
