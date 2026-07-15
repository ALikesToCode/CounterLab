import { BeliefSpecV2Schema, type BeliefSpecV2 } from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  type CandidateExperiment,
  type ExperimentIRV5,
} from "@counterlab/experiment-ir";

import {
  ExperimentScoringPolicySchema,
  ExperimentSelectionSchema,
  type ExperimentScoringPolicy,
  type ExperimentSelection,
} from "./schema.js";

export type ExperimentRejectionReason =
  | "NOT_SUPPORTED_BY_BELIEF_SPEC"
  | "UNKNOWN_OPERATION"
  | "MISSING_REQUIRED_OPERATION"
  | "MISSING_REQUIRED_CONTROL"
  | "UNCONTROLLED_VARIABLE_CHANGE"
  | "MISSING_REQUIRED_OBSERVABLE"
  | "UNKNOWN_OBSERVABLE"
  | "UNRECOGNIZED_PATTERN_PAIR"
  | "INSUFFICIENT_PATTERN_SEPARATION"
  | "COMPLEXITY_LIMIT_EXCEEDED";

const REASON_ORDER: readonly ExperimentRejectionReason[] = [
  "NOT_SUPPORTED_BY_BELIEF_SPEC",
  "UNKNOWN_OPERATION",
  "MISSING_REQUIRED_OPERATION",
  "MISSING_REQUIRED_CONTROL",
  "UNCONTROLLED_VARIABLE_CHANGE",
  "MISSING_REQUIRED_OBSERVABLE",
  "UNKNOWN_OBSERVABLE",
  "UNRECOGNIZED_PATTERN_PAIR",
  "INSUFFICIENT_PATTERN_SEPARATION",
  "COMPLEXITY_LIMIT_EXCEEDED",
];

export class ExperimentScoringError extends Error {
  readonly code:
    | "BELIEF_NOT_APPROVED"
    | "BELIEF_LINEAGE_MISMATCH"
    | "CONCEPT_MISMATCH"
    | "ALREADY_SELECTED"
    | "NO_DECISIVE_TEST";

  constructor(code: ExperimentScoringError["code"], message: string) {
    super(message);
    this.name = "ExperimentScoringError";
    this.code = code;
  }
}

export interface ScoreExperimentsInput {
  beliefSpec: unknown;
  beliefSpecHash: string;
  ir: unknown;
  policy: unknown;
}

interface EligibleCandidate {
  candidate: CandidateExperiment;
  separation: number;
  normalizedScore: number;
}

export function scoreExperiments(
  input: ScoreExperimentsInput,
): ExperimentSelection {
  const beliefSpec = BeliefSpecV2Schema.parse(input.beliefSpec);
  const ir = ExperimentIRV5Schema.parse(input.ir);
  const policy = ExperimentScoringPolicySchema.parse(input.policy);
  assertLineage(beliefSpec, input.beliefSpecHash, ir, policy);

  const supportedByCurrent = new Set(
    beliefSpec.hypotheses[0].supportedCandidateExperimentIds,
  );
  const supportedByCompeting = new Set(
    beliefSpec.hypotheses[1].supportedCandidateExperimentIds,
  );
  const patternSeparations = new Map(
    policy.patternSeparations.map((pattern) => [
      `${pattern.currentPatternId}:${pattern.competingPatternId}`,
      pattern.separation,
    ]),
  );
  const allowedOperations = new Set(policy.allowedOperationIds);
  const allowedChanges = new Set(policy.allowedChangedVariableIds);
  const allowedObservables = new Set(policy.allowedObservableIds);
  const eligible: EligibleCandidate[] = [];
  const rejected: ExperimentSelection["rejectedCandidates"] = [];

  const candidates = [...ir.candidateExperiments].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  for (const candidate of candidates) {
    const reasons = new Set<ExperimentRejectionReason>();
    if (
      !supportedByCurrent.has(candidate.id) ||
      !supportedByCompeting.has(candidate.id)
    ) {
      reasons.add("NOT_SUPPORTED_BY_BELIEF_SPEC");
    }
    if (candidate.operationIds.some((item) => !allowedOperations.has(item))) {
      reasons.add("UNKNOWN_OPERATION");
    }
    if (
      policy.requiredOperationIds.some(
        (item) => !candidate.operationIds.includes(item),
      )
    ) {
      reasons.add("MISSING_REQUIRED_OPERATION");
    }
    if (
      policy.requiredControlIds.some(
        (item) => !candidate.heldConstantIds.includes(item),
      )
    ) {
      reasons.add("MISSING_REQUIRED_CONTROL");
    }
    if (
      candidate.changedVariableIds.some((item) => !allowedChanges.has(item))
    ) {
      reasons.add("UNCONTROLLED_VARIABLE_CHANGE");
    }
    if (
      policy.requiredObservableIds.some(
        (item) => !candidate.observableIds.includes(item),
      )
    ) {
      reasons.add("MISSING_REQUIRED_OBSERVABLE");
    }
    if (candidate.observableIds.some((item) => !allowedObservables.has(item))) {
      reasons.add("UNKNOWN_OBSERVABLE");
    }
    if (candidate.complexityCost > policy.maximumComplexityCost) {
      reasons.add("COMPLEXITY_LIMIT_EXCEEDED");
    }

    const patternKey = `${candidate.hypothesisPatterns[0].patternId}:${candidate.hypothesisPatterns[1].patternId}`;
    const separation = patternSeparations.get(patternKey);
    if (separation === undefined) {
      reasons.add("UNRECOGNIZED_PATTERN_PAIR");
    } else if (separation < policy.minimumSeparation) {
      reasons.add("INSUFFICIENT_PATTERN_SEPARATION");
    }

    if (reasons.size > 0 || separation === undefined) {
      rejected.push({
        candidateId: candidate.id,
        reasonCodes: REASON_ORDER.filter((reason) => reasons.has(reason)),
      });
      continue;
    }

    const complexityFraction =
      candidate.complexityCost / policy.maximumComplexityCost;
    eligible.push({
      candidate,
      separation,
      normalizedScore: roundScore(
        separation - policy.complexityWeight * complexityFraction,
      ),
    });
  }

  eligible.sort(
    (left, right) =>
      left.candidate.complexityCost - right.candidate.complexityCost ||
      right.separation - left.separation ||
      left.candidate.id.localeCompare(right.candidate.id),
  );
  const selected = eligible[0];

  return ExperimentSelectionSchema.parse({
    eligibleCandidateIds: eligible
      .map(({ candidate }) => candidate.id)
      .sort((left, right) => left.localeCompare(right)),
    rejectedCandidates: rejected,
    selectedCandidateId: selected?.candidate.id ?? null,
    minimumSeparation: selected?.separation ?? 0,
    requiredSeparation: policy.minimumSeparation,
    complexityCost: selected?.candidate.complexityCost ?? 0,
    normalizedScore: selected?.normalizedScore ?? 0,
    scorerVersion: policy.scorerVersion,
  });
}

export function applyExperimentSelection(
  value: unknown,
  selectionValue: unknown,
): ExperimentIRV5 {
  const ir = ExperimentIRV5Schema.parse(value);
  const selection = ExperimentSelectionSchema.parse(selectionValue);
  if (selection.selectedCandidateId === null) {
    throw new ExperimentScoringError(
      "NO_DECISIVE_TEST",
      "INCONCLUSIVE_NO_DECISIVE_TEST: no candidate passed fixed scoring",
    );
  }
  return ExperimentIRV5Schema.parse({
    ...ir,
    selection: {
      status: "SELECTED",
      candidateId: selection.selectedCandidateId,
      eligibleCandidateIds: selection.eligibleCandidateIds,
      rejectedCandidates: selection.rejectedCandidates,
      minimumSeparation: selection.minimumSeparation,
      requiredSeparation: selection.requiredSeparation,
      complexityCost: selection.complexityCost,
      normalizedScore: selection.normalizedScore,
      scorerVersion: selection.scorerVersion,
    },
  });
}

function assertLineage(
  beliefSpec: BeliefSpecV2,
  beliefSpecHash: string,
  ir: ExperimentIRV5,
  policy: ExperimentScoringPolicy,
): void {
  if (
    beliefSpec.learnerDecision !== "CONFIRMED" &&
    beliefSpec.learnerDecision !== "ALTERNATIVE_SELECTED"
  ) {
    throw new ExperimentScoringError(
      "BELIEF_NOT_APPROVED",
      "The learner must approve the Belief Spec before experiment selection",
    );
  }
  if (
    ir.beliefSpecId !== beliefSpec.id ||
    ir.beliefSpecHash !== beliefSpecHash
  ) {
    throw new ExperimentScoringError(
      "BELIEF_LINEAGE_MISMATCH",
      "Experiment IR belief ID or hash does not match the approved Belief Spec",
    );
  }
  if (ir.concept !== beliefSpec.concept || ir.concept !== policy.concept) {
    throw new ExperimentScoringError(
      "CONCEPT_MISMATCH",
      "Belief Spec, Experiment IR, and scoring policy concepts must match",
    );
  }
  if (ir.selection.status !== "UNSELECTED") {
    throw new ExperimentScoringError(
      "ALREADY_SELECTED",
      "Fixed scoring only accepts an unselected Experiment IR draft",
    );
  }
}

function roundScore(value: number): number {
  const bounded = Math.min(1, Math.max(0, value));
  return Math.round(bounded * 1_000_000) / 1_000_000;
}
