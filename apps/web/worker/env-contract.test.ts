import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const webRoot = resolve(import.meta.dirname, "..");

describe("Worker environment type boundary", () => {
  it("keeps generated runtime types from narrowing shared Node process environments", async () => {
    const [packageJson, declaration, configuration] = await Promise.all([
      readFile(resolve(webRoot, "package.json"), "utf8"),
      readFile(resolve(webRoot, "worker/env.d.ts"), "utf8"),
      readFile(resolve(webRoot, "wrangler.jsonc"), "utf8"),
    ]);
    const scripts = (
      JSON.parse(packageJson) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    const wrangler = JSON.parse(configuration) as {
      vars: Record<string, string>;
    };

    expect(scripts["types:worker"]).toContain("--include-env=false");
    expect(declaration).not.toContain("namespace NodeJS");
    expect(declaration).not.toContain("ProcessEnv");
    for (const [name, value] of Object.entries(wrangler.vars)) {
      expect(declaration).toContain(`${name}: ${JSON.stringify(value)};`);
    }
    for (const binding of [
      "ARTIFACTS",
      "DB",
      "CF_VERSION_METADATA",
      "RUNNER",
      "ADMISSION",
    ]) {
      expect(declaration).toMatch(new RegExp(`\\b${binding}:`));
    }
  });
});
