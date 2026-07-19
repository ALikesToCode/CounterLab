import type { HeldOutCompletion } from "./completion.js";

export const EXPECTED_COMPLETION_OUTCOMES = [
  "PATCH_VERIFIED",
  "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
  "NOT_APPLICABLE",
] as const;

export const OBSERVED_COMPLETION_OUTCOMES = [
  ...EXPECTED_COMPLETION_OUTCOMES,
  "UNEXPECTED_FAILURE",
] as const;

export type ExpectedCompletionOutcome =
  (typeof EXPECTED_COMPLETION_OUTCOMES)[number];
export type ObservedCompletionOutcome =
  (typeof OBSERVED_COMPLETION_OUTCOMES)[number];

function completedVerifiedPatch(completion: HeldOutCompletion): boolean {
  return (
    completion.attempted &&
    completion.planVerified &&
    completion.resultVerified &&
    completion.transferPassed &&
    completion.patchVerified &&
    completion.resultHash !== null &&
    completion.patchHash !== null &&
    completion.failureCode === null
  );
}

function completedExpectedEstimatorRefusal(
  completion: HeldOutCompletion,
): boolean {
  return (
    completion.attempted &&
    completion.planVerified &&
    completion.resultVerified &&
    completion.transferPassed &&
    !completion.patchVerified &&
    completion.resultHash !== null &&
    completion.patchHash === null &&
    completion.failureCode === "PATCH_ESTIMATOR_OUTSIDE_CONTRACT"
  );
}

function didNotAttemptCompletion(completion: HeldOutCompletion): boolean {
  return (
    !completion.attempted &&
    !completion.planVerified &&
    !completion.resultVerified &&
    !completion.transferPassed &&
    !completion.patchVerified &&
    completion.resultHash === null &&
    completion.patchHash === null &&
    completion.failureCode === null
  );
}

export function observedCompletionOutcome(
  completion: HeldOutCompletion,
): ObservedCompletionOutcome {
  if (completedVerifiedPatch(completion)) return "PATCH_VERIFIED";
  if (completedExpectedEstimatorRefusal(completion)) {
    return "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT";
  }
  if (didNotAttemptCompletion(completion)) return "NOT_APPLICABLE";
  return "UNEXPECTED_FAILURE";
}

export function completionMatchesExpectation(
  expected: ExpectedCompletionOutcome,
  completion: HeldOutCompletion,
): boolean {
  return observedCompletionOutcome(completion) === expected;
}

export function heldOutCasePasses(
  checks: Readonly<Record<string, boolean>>,
): boolean {
  return Object.values(checks).every(Boolean);
}
