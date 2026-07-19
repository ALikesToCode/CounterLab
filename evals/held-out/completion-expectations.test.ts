import { describe, expect, it } from "vitest";

import {
  completionMatchesExpectation,
  heldOutCasePasses,
  observedCompletionOutcome,
} from "./src/completion-expectations.js";
import type { HeldOutCompletion } from "./src/completion.js";

const HASH = "a".repeat(64);

function completion(overrides: Partial<HeldOutCompletion>): HeldOutCompletion {
  return {
    attempted: true,
    planSource: "deterministic_contract_probe",
    planVerified: true,
    resultVerified: true,
    transferPassed: true,
    patchVerified: true,
    unchangedCellCount: 1,
    resultHash: HASH,
    patchHash: HASH,
    durationMs: 1,
    failureCode: null,
    ...overrides,
  };
}

describe("held-out completion expectations", () => {
  it("does not count an unexpected estimator refusal as a verified patch", () => {
    const refused = completion({
      patchVerified: false,
      unchangedCellCount: 0,
      patchHash: null,
      failureCode: "PATCH_ESTIMATOR_OUTSIDE_CONTRACT",
    });

    expect(observedCompletionOutcome(refused)).toBe(
      "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
    );
    const completionOutcomeMatches = completionMatchesExpectation(
      "PATCH_VERIFIED",
      refused,
    );
    expect(completionOutcomeMatches).toBe(false);
    expect(
      heldOutCasePasses({ intakeChecksPass: true, completionOutcomeMatches }),
    ).toBe(false);
  });

  it("does not count an unexpected patch as an expected refusal", () => {
    const verified = completion({});

    expect(observedCompletionOutcome(verified)).toBe("PATCH_VERIFIED");
    const completionOutcomeMatches = completionMatchesExpectation(
      "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
      verified,
    );
    expect(completionOutcomeMatches).toBe(false);
    expect(
      heldOutCasePasses({ intakeChecksPass: true, completionOutcomeMatches }),
    ).toBe(false);
  });

  it("matches only the exact fail-closed estimator refusal", () => {
    const expectedRefusal = completion({
      patchVerified: false,
      unchangedCellCount: 0,
      patchHash: null,
      failureCode: "PATCH_ESTIMATOR_OUTSIDE_CONTRACT",
    });
    const unrelatedFailure = completion({
      patchVerified: false,
      unchangedCellCount: 0,
      patchHash: null,
      failureCode: "PATCH_NOT_VERIFIED",
    });

    expect(
      completionMatchesExpectation(
        "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
        expectedRefusal,
      ),
    ).toBe(true);
    expect(observedCompletionOutcome(unrelatedFailure)).toBe(
      "UNEXPECTED_FAILURE",
    );
    expect(
      completionMatchesExpectation(
        "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
        unrelatedFailure,
      ),
    ).toBe(false);
  });

  it("matches not-applicable only when no completion stage ran", () => {
    const notApplicable = completion({
      attempted: false,
      planVerified: false,
      resultVerified: false,
      transferPassed: false,
      patchVerified: false,
      unchangedCellCount: 0,
      resultHash: null,
      patchHash: null,
    });

    expect(observedCompletionOutcome(notApplicable)).toBe("NOT_APPLICABLE");
    expect(completionMatchesExpectation("NOT_APPLICABLE", notApplicable)).toBe(
      true,
    );
  });
});
