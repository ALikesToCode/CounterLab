import type { SessionState } from "@counterlab/contracts";

import type { StudioStage } from "../studio/types";

export const learnerStages = [
  { id: "question", label: "Question" },
  { id: "prediction", label: "Prediction" },
  { id: "test", label: "Test" },
  { id: "boundary", label: "Boundary" },
  { id: "apply", label: "Apply" },
  { id: "repair", label: "Repair" },
] as const;

export type LearnerStageId = (typeof learnerStages)[number]["id"];
export type LearnerStageStatus = "completed" | "current" | "future";

export type LearnerStageProgressItem = (typeof learnerStages)[number] & {
  status: LearnerStageStatus;
};

const sessionStateStage = {
  INGESTED: "question",
  BELIEF_TEST_PROPOSED: "prediction",
  BELIEF_TEST_CONFIRMED: "prediction",
  INSUFFICIENT_EVIDENCE: "question",
  REJECTED_BY_LEARNER: "question",
  PREDICTION_COMMITTED: "test",
  LAB_COMPILING: "test",
  LAB_REJECTED: "test",
  LAB_VERIFIED: "test",
  EXPERIMENT_COMPLETED: "boundary",
  BOUNDARY_VERIFIED: "boundary",
  REVISION_RECORDED: "apply",
  TRANSFER_IN_PROGRESS: "apply",
  TRANSFER_FAILED: "apply",
  TRANSFER_PASSED: "repair",
  PATCH_COMPILING: "repair",
  PATCH_REJECTED: "repair",
  PATCH_VERIFIED: "repair",
  REASONING_DIFF_ISSUED: "repair",
  PROOF_CAPSULE_ISSUED: "repair",
} as const satisfies Record<SessionState, LearnerStageId>;

export function currentLearnerStage(
  studioStage: StudioStage,
  sessionState?: SessionState,
): LearnerStageId {
  if (
    studioStage === "question-path" ||
    studioStage === "live-setup" ||
    studioStage === "claim"
  ) {
    return "question";
  }
  if (studioStage === "belief") return "prediction";
  if (studioStage === "build" || studioStage === "live-compile") {
    return "test";
  }
  return sessionState === undefined
    ? "boundary"
    : sessionStateStage[sessionState];
}

export function learnerStageIndex(stage: LearnerStageId): number {
  return learnerStages.findIndex((candidate) => candidate.id === stage);
}

export function learnerStageProgress(
  studioStage: StudioStage,
  sessionState?: SessionState,
): readonly LearnerStageProgressItem[] {
  const currentIndex = learnerStageIndex(
    currentLearnerStage(studioStage, sessionState),
  );
  return learnerStages.map((stage, index) => ({
    ...stage,
    status:
      index < currentIndex
        ? "completed"
        : index === currentIndex
          ? "current"
          : "future",
  }));
}
