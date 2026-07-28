import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "scripts/production-smoke.sh"),
  "utf8",
);

describe("production smoke policy", () => {
  it("requires clean attempt-zero telemetry for every browser lane", () => {
    expect(
      source.match(/COUNTERLAB_E2E_REQUIRE_CLEAN_TELEMETRY=true/gu),
    ).toHaveLength(6);
    expect(source).not.toContain("COUNTERLAB_E2E_REQUIRE_CLEAN_TEMETRY");
  });

  it("requires two consecutive deep-readiness passes before browser work", () => {
    expect(source).toContain("HEALTH_ATTEMPT < 12 && HEALTH_CONSECUTIVE < 2");
    expect(source).toContain("HEALTH_CONSECUTIVE != 2");
    expect(source).toContain(
      '"generationFilesystemReadIsolation": "OS_ENFORCED"',
    );
    expect(source).toContain(
      '"${HEALTH_REQUEST_ID}" == "${HEALTH_PREVIOUS_REQUEST_ID}"',
    );
    expect(source.indexOf("HEALTH_CONSECUTIVE != 2")).toBeLessThan(
      source.indexOf("BROWSER_RUNTIME_PARENT="),
    );
  });
});
