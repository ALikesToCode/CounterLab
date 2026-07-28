import { afterEach, describe, expect, it, vi } from "vitest";

const preservedEnvironment = {
  CLOAK_CDP_ENDPOINT: process.env.CLOAK_CDP_ENDPOINT,
  COUNTERLAB_E2E_DEPLOYMENT_RECEIPT:
    process.env.COUNTERLAB_E2E_DEPLOYMENT_RECEIPT,
};

afterEach(() => {
  vi.unstubAllEnvs();
  for (const [name, value] of Object.entries(preservedEnvironment)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.resetModules();
});

describe("Playwright release-smoke configuration", () => {
  it("forces attempt zero when clean CloakBrowser telemetry is required", async () => {
    vi.stubEnv("CI", "true");
    vi.stubEnv("CLOAK_CDP_ENDPOINT", "http://127.0.0.1:9");
    vi.stubEnv("COUNTERLAB_BROWSER_QUALIFICATION", "false");
    vi.stubEnv("COUNTERLAB_E2E_REQUIRE_CLEAN_TELEMETRY", "true");
    delete process.env.COUNTERLAB_E2E_DEPLOYMENT_RECEIPT;

    const { default: config } = await import("../../playwright.config");

    expect(config.retries).toBe(0);
    expect(config.reporter).toContainEqual([
      "./e2e/qualification-reporter.ts",
      expect.objectContaining({
        qualificationRequested: false,
        requireCleanTelemetry: true,
      }),
    ]);
  });

  it("rejects clean-telemetry enforcement without CloakBrowser", async () => {
    vi.stubEnv("COUNTERLAB_BROWSER_AUTHORITY", "stock-chromium-design-review");
    vi.stubEnv("COUNTERLAB_BROWSER_QUALIFICATION", "false");
    vi.stubEnv("COUNTERLAB_E2E_REQUIRE_CLEAN_TELEMETRY", "true");
    delete process.env.CLOAK_CDP_ENDPOINT;
    delete process.env.COUNTERLAB_E2E_DEPLOYMENT_RECEIPT;

    await expect(import("../../playwright.config")).rejects.toThrow(
      /requires CloakBrowser authority/i,
    );
  });
});
