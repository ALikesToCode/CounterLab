import { describe, expect, it } from "vitest";

import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";
import { assertSampleProofClaimScope } from "./sample-proof";

describe("sample proof claim scope", () => {
  it("accepts only the canonical fixed sample question", () => {
    expect(() =>
      assertSampleProofClaimScope({
        beliefTest: { learnerClaim: SAMPLE_LEAKAGE_QUESTION },
      } as Parameters<typeof assertSampleProofClaimScope>[0]),
    ).not.toThrow();
  });

  it("fails closed for a historical custom sample claim", () => {
    expect(() =>
      assertSampleProofClaimScope({
        beliefTest: {
          learnerClaim:
            "Purple bananas taste better on Tuesdays, so this score is meaningless.",
        },
      } as Parameters<typeof assertSampleProofClaimScope>[0]),
    ).toThrow(/outside the fixed sample proof scope/i);
  });
});
