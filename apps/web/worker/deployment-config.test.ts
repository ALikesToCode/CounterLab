import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("Cloudflare static asset routing", () => {
  it("runs only API paths through the Worker before serving the SPA", () => {
    const config = JSON.parse(
      readFileSync(resolve(process.cwd(), "wrangler.jsonc"), "utf-8"),
    ) as {
      assets?: {
        not_found_handling?: string;
        run_worker_first?: string[];
      };
    };

    expect(config.assets).toEqual(
      expect.objectContaining({
        not_found_handling: "single-page-application",
        run_worker_first: ["/api/*"],
      }),
    );
  });
});
