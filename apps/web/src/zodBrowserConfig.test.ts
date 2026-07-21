import { describe, expect, it } from "vitest";
import { z } from "zod";

import "./zodBrowserConfig";

describe("browser schema configuration", () => {
  it("keeps Zod validation jitless under the strict script policy", () => {
    const originalFunction = globalThis.Function;
    let dynamicFunctionAttempted = false;
    // @ts-expect-error The throwing stand-in verifies that validation does not
    // touch the dynamic Function constructor under the browser CSP.
    globalThis.Function = function DisabledFunction(): never {
      dynamicFunctionAttempted = true;
      throw new Error("Dynamic Function construction is disabled");
    };

    try {
      expect(z.config().jitless).toBe(true);
      expect(
        z.object({ value: z.string() }).parse({ value: "verified" }),
      ).toEqual({ value: "verified" });
      expect(dynamicFunctionAttempted).toBe(false);
    } finally {
      globalThis.Function = originalFunction;
    }
  });
});
