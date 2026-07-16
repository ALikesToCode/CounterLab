import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function luminance(color: string): number {
  const channels = [1, 3, 5].map((offset) =>
    Number.parseInt(color.slice(offset, offset + 2), 16),
  );
  const linear = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
}

function contrast(first: string, second: string): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort(
    (left, right) => right - left,
  ) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Cloudflare static asset routing", () => {
  it("runs API and public readiness paths through the Worker before serving the SPA", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf-8"),
    ) as {
      assets?: {
        directory?: string;
        not_found_handling?: string;
        run_worker_first?: string[];
      };
    };

    expect(config.assets).toEqual(
      expect.objectContaining({
        directory: "./dist/client",
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*", "/ready"],
      }),
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), "package.json"), "utf-8"),
    ) as { scripts?: Record<string, string> };
    expect(packageJson.scripts?.deploy).toBe(
      "vite build && wrangler deploy --config dist/counterlab/wrangler.json",
    );
  });

  it("builds the Container from the source revision qualified by the scientific runtime manifest", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf-8"),
    ) as {
      containers?: Array<{
        image_vars?: { COUNTERLAB_SOURCE_COMMIT?: string };
      }>;
    };
    const runtimeManifest = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "../../scientific-engines/runtime-manifest.json",
        ),
        "utf-8",
      ),
    ) as { sourceCommit?: string };

    expect(config.containers).toHaveLength(1);
    expect(config.containers?.[0]?.image_vars?.COUNTERLAB_SOURCE_COMMIT).toBe(
      runtimeManifest.sourceCommit,
    );
  });

  it("keeps primary semantic text colors above normal-text contrast", () => {
    const css = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf-8");
    const variables = Object.fromEntries(
      [...css.matchAll(/--([a-z-]+):\s*(#[0-9a-f]{6})/g)].map((match) => [
        match[1]!,
        match[2]!,
      ]),
    );
    const paper = variables.paper!;

    for (const name of [
      "ink",
      "ink-soft",
      "blue-deep",
      "purple",
      "aqua",
      "gold",
      "red",
    ]) {
      expect(contrast(variables[name]!, paper), name).toBeGreaterThanOrEqual(
        4.5,
      );
    }
    expect(
      contrast(variables.blue!, "#ffffff"),
      "blue button",
    ).toBeGreaterThanOrEqual(4.5);
  });
});
