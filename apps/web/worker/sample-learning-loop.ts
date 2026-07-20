import {
  PatchResultSchema,
  TransferResultSchema,
  type PatchResult,
  type TransferResult,
  type ImbalanceTransferSubmission,
  type LeakageTransferSubmission,
} from "@counterlab/contracts";
import { hashCanonical } from "@counterlab/session-core";

import patchKernelResult from "../../../fixtures/public/leakage_sample_patch_v1/patch-kernel-result.json";

const EXPECTED_STRATEGY = "time_ordered_holdout";
const EXPECTED_RISK = "centered_window_reads_future";
const REQUIRED_EVIDENCE = [
  "center_true_uses_later_targets",
  "random_split_mixes_dates",
] as const;

export async function evaluateLeakageTransfer(
  sessionId: string,
  submission: LeakageTransferSubmission,
  evaluatedAt: string,
): Promise<TransferResult> {
  const selected = new Set(submission.evidenceChoices);
  const checks = [
    {
      invariant: "TIME_AWARE_EVALUATION",
      passed: submission.strategyChoice === EXPECTED_STRATEGY,
      evidence:
        "A deployment-aligned forecast trains on earlier dates and evaluates later dates.",
    },
    {
      invariant: "FUTURE_INFORMATION_RISK",
      passed: submission.riskChoice === EXPECTED_RISK,
      evidence:
        "A centered target window reads observations that do not exist at prediction time.",
    },
    {
      invariant: "EVIDENCE_GROUNDED",
      passed: REQUIRED_EVIDENCE.every((item) => selected.has(item)),
      evidence:
        "Both center=True and the shuffled date split must be selected as code evidence.",
    },
  ];
  const outcome = checks.every((check) => check.passed) ? "PASSED" : "FAILED";
  const base = {
    schemaVersion: "1" as const,
    id: `transfer_${crypto.randomUUID()}`,
    sessionId,
    taskId: "forecasting-future-leakage-01",
    outcome,
    selectedStrategy: submission.strategyChoice,
    identifiedRisks: [submission.riskChoice],
    evidenceChoices: [...selected].sort(),
    checks,
    evaluatorVersion: "counterlab-transfer-v1",
    evaluatedAt,
  };
  return TransferResultSchema.parse({
    ...base,
    resultHash: await hashCanonical(base),
  });
}

export const evaluateSampleTransfer = evaluateLeakageTransfer;

const IMBALANCE_EXPECTED_DECISION = "reject_accuracy_only";
const IMBALANCE_EXPECTED_METRIC = "recall_and_pr_auc";
const IMBALANCE_REQUIRED_EVIDENCE = [
  "zero_true_positives",
  "rare_base_rate",
] as const;

type TransferConcept = "entity_leakage" | "class_imbalance";

const TRANSFER_POLICIES = {
  entity_leakage: {
    taskId: "forecasting-future-leakage-01",
    evaluatorVersion: "counterlab-transfer-v1",
    selectedStrategy: EXPECTED_STRATEGY,
    identifiedRisks: [EXPECTED_RISK],
    requiredEvidence: REQUIRED_EVIDENCE,
    allowedEvidence: [
      "center_true_uses_later_targets",
      "random_split_mixes_dates",
      "metric_is_mae",
    ],
    invariants: [
      "TIME_AWARE_EVALUATION",
      "FUTURE_INFORMATION_RISK",
      "EVIDENCE_GROUNDED",
    ],
  },
  class_imbalance: {
    taskId: "manufacturing-defect-transfer-01",
    evaluatorVersion: "counterlab-imbalance-transfer-v1",
    selectedStrategy: IMBALANCE_EXPECTED_DECISION,
    identifiedRisks: [IMBALANCE_EXPECTED_METRIC],
    requiredEvidence: IMBALANCE_REQUIRED_EVIDENCE,
    allowedEvidence: [
      "zero_true_positives",
      "rare_base_rate",
      "many_true_negatives",
    ],
    invariants: [
      "ACCURACY_CLAIM_REJECTED",
      "MINORITY_METRICS_SELECTED",
      "EVIDENCE_GROUNDED",
    ],
  },
} as const satisfies Record<TransferConcept, object>;

export function assertPassedTransferMatchesFixedPolicy(
  concept: TransferConcept,
  result: TransferResult,
): void {
  const policy = TRANSFER_POLICIES[concept];
  const evidence = result.evidenceChoices;
  const evidenceSet = new Set(evidence);
  const invariants = result.checks.map((check) => check.invariant);
  if (
    result.outcome !== "PASSED" ||
    result.taskId !== policy.taskId ||
    result.evaluatorVersion !== policy.evaluatorVersion ||
    result.selectedStrategy !== policy.selectedStrategy ||
    JSON.stringify(result.identifiedRisks) !==
      JSON.stringify(policy.identifiedRisks) ||
    evidenceSet.size !== evidence.length ||
    !policy.requiredEvidence.every((choice) => evidenceSet.has(choice)) ||
    !evidence.every((choice) =>
      (policy.allowedEvidence as readonly string[]).includes(choice),
    ) ||
    JSON.stringify(invariants) !== JSON.stringify(policy.invariants) ||
    !result.checks.every((check) => check.passed)
  ) {
    throw new Error(
      "Passed transfer does not match the fixed Subject Pack evaluator policy",
    );
  }
}

export async function evaluateImbalanceTransfer(
  sessionId: string,
  submission: ImbalanceTransferSubmission,
  evaluatedAt: string,
): Promise<TransferResult> {
  const selected = new Set(submission.evidenceChoices);
  const checks = [
    {
      invariant: "ACCURACY_CLAIM_REJECTED",
      passed: submission.decisionChoice === IMBALANCE_EXPECTED_DECISION,
      evidence:
        "Overall accuracy cannot support deployment when the classifier misses every rare defective part.",
    },
    {
      invariant: "MINORITY_METRICS_SELECTED",
      passed: submission.metricChoice === IMBALANCE_EXPECTED_METRIC,
      evidence:
        "Defect recall and PR-AUC expose performance on the rare class and relative to its base rate.",
    },
    {
      invariant: "EVIDENCE_GROUNDED",
      passed: IMBALANCE_REQUIRED_EVIDENCE.every((item) => selected.has(item)),
      evidence:
        "Use both the zero true-positive count and the 1% base rate as evidence.",
    },
  ];
  const outcome = checks.every((check) => check.passed) ? "PASSED" : "FAILED";
  const base = {
    schemaVersion: "1" as const,
    id: `transfer_${crypto.randomUUID()}`,
    sessionId,
    taskId: "manufacturing-defect-transfer-01",
    outcome,
    selectedStrategy: submission.decisionChoice,
    identifiedRisks: [submission.metricChoice],
    evidenceChoices: [...selected].sort(),
    checks,
    evaluatorVersion: "counterlab-imbalance-transfer-v1",
    evaluatedAt,
  };
  return TransferResultSchema.parse({
    ...base,
    resultHash: await hashCanonical(base),
  });
}

type KernelPatchResult = {
  originalSha256: string;
  patchedSha256: string;
  metadataHash: string;
  cellDiff: string;
  changedCellIndices: number[];
  unrelatedCellSourceHashes: Array<{
    afterSha256: string;
    unchanged: boolean;
  }>;
  verification: { status: string; invariants: string[]; violations: unknown[] };
};

const verifiedKernelPatch = patchKernelResult as KernelPatchResult;

export async function createSamplePatchResult(
  sessionId: string,
  sourceArtifactHash: string,
  generatedAt: string,
): Promise<PatchResult> {
  if (sourceArtifactHash !== verifiedKernelPatch.originalSha256) {
    throw new Error("Stored sample patch does not match the source artifact");
  }
  if (
    verifiedKernelPatch.verification.status !== "VERIFIED" ||
    verifiedKernelPatch.verification.violations.length !== 0 ||
    !verifiedKernelPatch.unrelatedCellSourceHashes.every(
      (cell) => cell.unchanged,
    )
  ) {
    throw new Error("Stored sample patch is not verified");
  }
  const patchHash = await hashCanonical(verifiedKernelPatch.cellDiff);
  const base = {
    schemaVersion: "1" as const,
    id: `patch_${crypto.randomUUID()}`,
    sessionId,
    status: "VERIFIED" as const,
    sourceArtifactHash,
    patchedArtifactHash: verifiedKernelPatch.patchedSha256,
    patchHash,
    modifiedCells: verifiedKernelPatch.changedCellIndices,
    diff: verifiedKernelPatch.cellDiff,
    verification: {
      passed: true,
      invariants: verifiedKernelPatch.verification.invariants,
      unchangedCellHashes: verifiedKernelPatch.unrelatedCellSourceHashes.map(
        (cell) => cell.afterSha256,
      ),
    },
    generatedAt,
  };
  return PatchResultSchema.parse({
    ...base,
    resultHash: await hashCanonical(base),
  });
}
