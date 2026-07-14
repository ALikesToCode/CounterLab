import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("Worker runtime boundary", () => {
  it("keeps Node built-ins and SQLite outside the runtime-neutral entrypoint", () => {
    const runtimeNeutralFiles = [
      "index.ts",
      "domain.ts",
      "repository.ts",
      "service.ts",
    ];
    for (const file of runtimeNeutralFiles) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/from ["']node:/);
      expect(source, file).not.toContain("sqlite-repository");
    }
  });
});
