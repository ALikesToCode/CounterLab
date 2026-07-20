import { describe, expect, it } from "vitest";

import rawImbalanceResult from "../../../fixtures/public/imbalance_verified_result.json";
import rawResult from "../../../fixtures/public/leakage_verified_result.json";
import { parseBundledSampleEvidence } from "./sample";

describe("bundled sample evidence", () => {
  it("accepts the checked-in result and resolves every required run", () => {
    const parsed = parseBundledSampleEvidence(rawResult);

    expect(parsed.status).toBe("available");
    if (parsed.status === "available") {
      expect(parsed.runs.randomRows.id).toBe("random_row_split");
      expect(parsed.runs.wholeCustomers.id).toBe("customer_group_split");
      expect(parsed.runs.identityAblation.id).toBe("identity_ablation");
    }
  });

  it("returns an unavailable state instead of throwing for invalid evidence", () => {
    expect(() =>
      parseBundledSampleEvidence({ schemaVersion: "unknown" }),
    ).not.toThrow();
    expect(parseBundledSampleEvidence({ schemaVersion: "unknown" })).toEqual({
      status: "unavailable",
      reason: "INVALID_SCHEMA",
    });
  });

  it("fails closed for the wrong concept or a missing required run", () => {
    expect(parseBundledSampleEvidence(rawImbalanceResult)).toEqual({
      status: "unavailable",
      reason: "WRONG_CONCEPT",
    });

    const missingRun = structuredClone(rawResult);
    missingRun.runs = missingRun.runs.filter(
      (run) => run.id !== "customer_group_split",
    );
    expect(parseBundledSampleEvidence(missingRun)).toEqual({
      status: "unavailable",
      reason: "MISSING_REQUIRED_RUN",
    });
  });
});
