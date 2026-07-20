// @vitest-environment node

import { describe, expect, it } from "vitest";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ImbalanceTransferSubmissionSchema,
  LeakageTransferSubmissionSchema,
} from "@counterlab/contracts";

import transferSemanticsFixture from "../../../fixtures/transfer/counterlab-transfer-semantics-v1.json";
import imbalanceTransferTask from "../../../concept-packs/imbalance/transfer/task.json";
import leakageTransferTask from "../../../concept-packs/leakage/transfer/task.json";

import {
  evaluateImbalanceTransfer,
  evaluateLeakageTransfer,
} from "./sample-learning-loop";

type TransferBinding = {
  irTaskId: string;
  evaluatorTaskId: string;
  evaluatorVersion: string;
};

type AcceptedProjection = {
  accepted: true;
  passed: boolean;
  primaryChoice: string;
  secondaryChoice: string;
  canonicalEvidence: string[];
  checks: Record<string, boolean>;
};

type RejectedProjection = { accepted: false };
type ExpectedProjection = AcceptedProjection | RejectedProjection;

type TransferVector = {
  id: string;
  equivalenceGroup?: string;
  input: Record<string, unknown>;
  expected: ExpectedProjection;
};

type TransferPack = {
  concept: "entity_leakage" | "class_imbalance";
  submissionKind: "leakage" | "imbalance";
  binding: TransferBinding;
  vectors: TransferVector[];
};

type TransferFixture = {
  schemaVersion: "1";
  normalizationProfile: "counterlab-transfer-semantic-projection-v1";
  packs: TransferPack[];
};

type SemanticProjection =
  | RejectedProjection
  | (AcceptedProjection & {
      irTaskId: string;
      evaluatorTaskId: string;
      evaluatorVersion: string;
    });

const fixture = transferSemanticsFixture as TransferFixture;
const evaluatedAt = "2026-07-20T00:00:00.000Z";

function expectedProjection(
  pack: TransferPack,
  vector: TransferVector,
): SemanticProjection {
  if (!vector.expected.accepted) {
    return vector.expected;
  }
  return {
    ...vector.expected,
    irTaskId: pack.binding.irTaskId,
    evaluatorTaskId: pack.binding.evaluatorTaskId,
    evaluatorVersion: pack.binding.evaluatorVersion,
  };
}

async function projectTypeScriptSemantics(
  pack: TransferPack,
  vector: TransferVector,
): Promise<SemanticProjection> {
  const conceptPack = getConceptPack(pack.concept);
  if (pack.submissionKind === "leakage") {
    const parsed = LeakageTransferSubmissionSchema.safeParse(vector.input);
    if (!parsed.success) {
      return { accepted: false };
    }
    const result = await evaluateLeakageTransfer(
      "session_transfer_vectors",
      parsed.data,
      evaluatedAt,
    );
    return {
      accepted: true,
      irTaskId: conceptPack.transferTask.id,
      evaluatorTaskId: result.taskId,
      evaluatorVersion: result.evaluatorVersion,
      passed: result.outcome === "PASSED",
      primaryChoice: result.selectedStrategy,
      secondaryChoice: result.identifiedRisks[0] ?? "",
      canonicalEvidence: result.evidenceChoices,
      checks: Object.fromEntries(
        result.checks.map((check) => [check.invariant, check.passed]),
      ),
    };
  }

  const parsed = ImbalanceTransferSubmissionSchema.safeParse(vector.input);
  if (!parsed.success) {
    return { accepted: false };
  }
  const result = await evaluateImbalanceTransfer(
    "session_transfer_vectors",
    parsed.data,
    evaluatedAt,
  );
  return {
    accepted: true,
    irTaskId: conceptPack.transferTask.id,
    evaluatorTaskId: result.taskId,
    evaluatorVersion: result.evaluatorVersion,
    passed: result.outcome === "PASSED",
    primaryChoice: result.selectedStrategy,
    secondaryChoice: result.identifiedRisks[0] ?? "",
    canonicalEvidence: result.evidenceChoices,
    checks: Object.fromEntries(
      result.checks.map((check) => [check.invariant, check.passed]),
    ),
  };
}

describe.each(fixture.packs)("$concept transfer semantic vectors", (pack) => {
  it("binds the IR task, evaluator task, and evaluator version", () => {
    const conceptPack = getConceptPack(pack.concept);
    const publicTask =
      pack.submissionKind === "leakage"
        ? leakageTransferTask
        : imbalanceTransferTask;

    expect(conceptPack.transferTask.id).toBe(pack.binding.irTaskId);
    expect(conceptPack.transferTask.evaluatorTaskId).toBe(
      pack.binding.evaluatorTaskId,
    );
    expect(publicTask.id).toBe(pack.binding.evaluatorTaskId);
  });

  it.each(pack.vectors)("projects $id consistently", async (vector) => {
    await expect(projectTypeScriptSemantics(pack, vector)).resolves.toEqual(
      expectedProjection(pack, vector),
    );
  });

  it("canonicalizes evidence ordering within each equivalence group", async () => {
    const groups = new Map<string, TransferVector[]>();
    for (const vector of pack.vectors) {
      if (vector.equivalenceGroup === undefined) {
        continue;
      }
      const group = groups.get(vector.equivalenceGroup) ?? [];
      group.push(vector);
      groups.set(vector.equivalenceGroup, group);
    }

    expect([...groups.values()].every((group) => group.length >= 2)).toBe(true);
    for (const group of groups.values()) {
      const [first, ...rest] = await Promise.all(
        group.map((vector) => projectTypeScriptSemantics(pack, vector)),
      );
      for (const projection of rest) {
        expect(projection).toEqual(first);
      }
    }
  });
});
