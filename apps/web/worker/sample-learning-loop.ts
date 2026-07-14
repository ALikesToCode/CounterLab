import {
  PatchResultSchema,
  TransferResultSchema,
  type PatchResult,
  type TransferResult,
} from "@counterlab/contracts";
import { hashCanonical } from "@counterlab/session-core";

import patchKernelResult from "../../../replays/leakage-01/patch-kernel-result.json";

const EXPECTED_STRATEGY = "time_ordered_holdout";
const EXPECTED_RISK = "centered_window_reads_future";
const REQUIRED_EVIDENCE = new Set([
  "center_true_uses_later_targets",
  "random_split_mixes_dates",
]);

export interface TransferSubmission {
  strategyChoice: string;
  riskChoice: string;
  evidenceChoices: string[];
}

export async function evaluateLeakageTransfer(
  sessionId: string,
  submission: TransferSubmission,
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
      passed: [...REQUIRED_EVIDENCE].every((item) => selected.has(item)),
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

type KernelPatchResult = {
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
