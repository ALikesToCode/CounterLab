import { defineConfig } from "@playwright/test";

const port = Number(process.env.COUNTERLAB_E2E_PORT ?? "5173");
const remoteBaseURL = process.env.COUNTERLAB_E2E_BASE_URL?.replace(/\/$/, "");
const baseURL = remoteBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["line"]],
  use: {
    baseURL,
    browserName: "chromium",
    headless: process.env.COUNTERLAB_E2E_HEADED !== "1",
    launchOptions: {
      executablePath: "/home/mysterious/.local/bin/cloakbrowser-chromium",
    },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer:
    remoteBaseURL === undefined
      ? {
          command: `pnpm dev --host 127.0.0.1 --port ${port}`,
          cwd: import.meta.dirname,
          url: baseURL,
          reuseExistingServer: true,
          timeout: 120_000,
        }
      : undefined,
});
