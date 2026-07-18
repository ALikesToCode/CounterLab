import { defineConfig } from "@playwright/test";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

const repositoryRoot = realpathSync(resolve(import.meta.dirname, "../.."));
const runtimeParent = resolve(import.meta.dirname, "test-results/runtime");
const configuredRuntimeRoot = process.env.COUNTERLAB_E2E_RUNTIME_ROOT;
if (configuredRuntimeRoot !== undefined && !isAbsolute(configuredRuntimeRoot)) {
  throw new Error("COUNTERLAB_E2E_RUNTIME_ROOT must be an absolute path");
}
const runtimeRoot = resolve(
  configuredRuntimeRoot ?? join(runtimeParent, "m8-local"),
);

function isContained(
  root: string,
  candidate: string,
  allowRoot = true,
): boolean {
  const pathFromRoot = relative(root, candidate);
  if (pathFromRoot === "") return allowRoot;
  return !pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot);
}

function assertNoSymlinkTraversal(candidate: string, label: string): void {
  const relativePath = relative(repositoryRoot, candidate);
  let current = repositoryRoot;
  for (const segment of relativePath.split(sep)) {
    current = resolve(current, segment);
    if (!existsSync(current)) break;
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} must not traverse a symbolic link`);
    }
  }
}

if (
  !isContained(repositoryRoot, runtimeRoot, false) ||
  !isContained(runtimeParent, runtimeRoot, false)
) {
  throw new Error(
    "COUNTERLAB_E2E_RUNTIME_ROOT must stay inside apps/web/test-results/runtime",
  );
}
assertNoSymlinkTraversal(runtimeParent, "Playwright runtime parent");
assertNoSymlinkTraversal(runtimeRoot, "COUNTERLAB_E2E_RUNTIME_ROOT");

const outputDir = join(runtimeRoot, "playwright-output");
const resultsFile = join(runtimeRoot, "evidence/results.json");
assertNoSymlinkTraversal(outputDir, "Playwright output directory");
assertNoSymlinkTraversal(resultsFile, "Playwright results file");

if ((process.env.CLOAK_CDP_ENDPOINT ?? "").trim() === "") {
  throw new Error(
    "CLOAK_CDP_ENDPOINT is required; CounterLab browser QA never launches stock Chromium",
  );
}

const port = Number(process.env.COUNTERLAB_E2E_PORT ?? "5173");
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("COUNTERLAB_E2E_PORT must be an unprivileged TCP port");
}
const remoteBaseURL = process.env.COUNTERLAB_E2E_BASE_URL?.replace(/\/$/, "");
if (remoteBaseURL !== undefined) {
  const remote = new URL(remoteBaseURL);
  if (
    !["http:", "https:"].includes(remote.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(remote.hostname) ||
    remote.username !== "" ||
    remote.password !== ""
  ) {
    throw new Error(
      "COUNTERLAB_E2E_BASE_URL must be a credential-free loopback URL",
    );
  }
}
const baseURL = remoteBaseURL ?? `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: process.env.CI ? 1 : 0,
  outputDir,
  reporter: [["line"], ["json", { outputFile: resultsFile }]],
  use: {
    baseURL,
    browserName: "chromium",
    connectOptions: {
      // The e2e fixture overrides the browser with connectOverCDP. This guard
      // makes any test that bypasses that fixture fail instead of launching a
      // local or stock browser.
      wsEndpoint: "ws://127.0.0.1:1/counterlab-cdp-fixture-required",
      timeout: 1_000,
    },
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  webServer:
    remoteBaseURL === undefined
      ? {
          command: `./node_modules/.bin/vite --host 127.0.0.1 --port ${port}`,
          cwd: import.meta.dirname,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
        }
      : undefined,
});
