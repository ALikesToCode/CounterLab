import type { LearnerHintId } from "../../api";
import type { LearnerStageId } from "../../components/learner/learnerStages";

export type LearnerHint = Readonly<{
  id: LearnerHintId;
  copy: string;
  evidenceHref: string;
  evidenceLabel: string;
}>;

type HintConcept = "entity_leakage" | "class_imbalance" | "shared";

const evidenceTargets = {
  question: {
    evidenceHref: "#notebook-evidence-story",
    evidenceLabel: "Review what the notebook actually shows",
  },
  prediction: {
    evidenceHref: "#model-duel",
    evidenceLabel: "Review the two explanations",
  },
  test: {
    evidenceHref: "#fair-test-title",
    evidenceLabel: "Review why this test is fair",
  },
  boundary: {
    evidenceHref: "#experiment-theater-comparison",
    evidenceLabel: "Review the verified comparison",
  },
  apply: {
    evidenceHref: "#learner-apply-evidence",
    evidenceLabel: "Review the verified finding you are transferring",
  },
  repair: {
    evidenceHref: "#repair-preview",
    evidenceLabel: "Review what changes and what stays fixed",
  },
} as const satisfies Record<
  LearnerStageId,
  { evidenceHref: string; evidenceLabel: string }
>;

const hintCopy = {
  shared: {
    question:
      "Name the result, who or what it should apply to, and the evidence the notebook actually measured.",
    prediction:
      "Choose what you expect before the verified comparison appears. Confidence records uncertainty; it does not change the test.",
    test: "Compare the changed variable with the held-fixed list. The verified test should isolate one meaningful difference.",
    boundary:
      "Compare a condition with the reference and look for a different verified classification. You do not need to calculate a value.",
    apply:
      "Translate the original deployment boundary to the new setting before choosing an evaluation.",
    repair:
      "Check the changed and preserved lists before opening the raw diff. The original notebook remains untouched.",
  },
  entity_leakage: {
    question:
      "Name which customers the score is meant to describe, then compare that population with the notebook's actual split.",
    prediction:
      "Ask what each explanation predicts for customers that never appeared in training; seal only your expectation.",
    test: "Check that the model, target, preprocessing, and seed stay fixed while the customer boundary changes.",
    boundary:
      "Compare a condition with the reference and look for a different verified classification; no new score needs to be calculated.",
    apply:
      "Carry the deployment-boundary rule into the forecasting setting before selecting a split or feature.",
    repair:
      "Confirm that customer grouping, identity input, and overlap reporting change while the target, model family, unrelated cells, and original stay fixed.",
  },
  class_imbalance: {
    question:
      "Name the rare event and the decision the headline score is supposed to support.",
    prediction:
      "Ask what each explanation predicts for the rare class; seal your expectation before class-specific results appear.",
    test: "Check that the fixture and scores stay fixed while the test exposes the majority baseline, class errors, threshold, and prevalence.",
    boundary:
      "Compare a condition with the reference and look for a different verified metric classification; do not infer it from color.",
    apply:
      "Use the supplied deployment costs and prevalence to frame the new decision before choosing evidence.",
    repair:
      "Confirm that holdout and reported error evidence change while the target, model family, unrelated cells, and original stay fixed.",
  },
} as const satisfies Record<HintConcept, Record<LearnerStageId, string>>;

const hintIds = {
  shared: {
    question: "shared.question",
    prediction: "shared.prediction",
    test: "shared.test",
    boundary: "shared.boundary",
    apply: "shared.apply",
    repair: "shared.repair",
  },
  entity_leakage: {
    question: "entity_leakage.question",
    prediction: "entity_leakage.prediction",
    test: "entity_leakage.test",
    boundary: "entity_leakage.boundary",
    apply: "entity_leakage.apply",
    repair: "entity_leakage.repair",
  },
  class_imbalance: {
    question: "class_imbalance.question",
    prediction: "class_imbalance.prediction",
    test: "class_imbalance.test",
    boundary: "class_imbalance.boundary",
    apply: "class_imbalance.apply",
    repair: "class_imbalance.repair",
  },
} as const satisfies Record<HintConcept, Record<LearnerStageId, LearnerHintId>>;

export function subjectPackHint(
  concept: Exclude<HintConcept, "shared"> | undefined,
  stage: LearnerStageId,
): LearnerHint {
  const resolvedConcept = concept ?? "shared";
  return {
    id: hintIds[resolvedConcept][stage],
    copy: hintCopy[resolvedConcept][stage],
    ...evidenceTargets[stage],
  };
}
