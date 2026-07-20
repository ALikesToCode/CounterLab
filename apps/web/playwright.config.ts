import { defineConfig } from "@playwright/test";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { resolveBrowserAuthority } from "./e2e/browser-authority";

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

const browserAuthority = resolveBrowserAuthority(process.env);

const port = Number(process.env.COUNTERLAB_E2E_PORT ?? "5173");
if (!Number.isInteger(port) || port < 1024 || port > 65_535) {
  throw new Error("COUNTERLAB_E2E_PORT must be an unprivileged TCP port");
}
const configuredBaseURL = process.env.COUNTERLAB_E2E_BASE_URL;
if (configuredBaseURL !== undefined && configuredBaseURL.trim() === "") {
  throw new Error("COUNTERLAB_E2E_BASE_URL must not be empty when supplied");
}
let remoteBaseURL: string | undefined;
if (configuredBaseURL !== undefined) {
  let remote: URL;
  try {
    remote = new URL(configuredBaseURL);
  } catch {
    throw new Error("COUNTERLAB_E2E_BASE_URL must be an absolute URL");
  }
  const loopbackHosts = new Set(["127.0.0.1", "localhost", "[::1]"]);
  const isLoopback = loopbackHosts.has(remote.hostname);
  const isCredentialFree = remote.username === "" && remote.password === "";
  const isRootOrigin =
    (remote.pathname === "" || remote.pathname === "/") &&
    remote.search === "" &&
    remote.hash === "";
  const isAllowedTransport =
    remote.protocol === "https:" || (remote.protocol === "http:" && isLoopback);
  if (!isCredentialFree || !isRootOrigin || !isAllowedTransport) {
    throw new Error(
      "COUNTERLAB_E2E_BASE_URL must be a credential-free HTTPS origin or an HTTP loopback origin",
    );
  }
  remoteBaseURL = remote.origin;
}
const baseURL = remoteBaseURL ?? `http://127.0.0.1:${port}`;
const staticDesignReview =
  browserAuthority.kind === "stock-chromium-design-review" &&
  process.env.COUNTERLAB_E2E_STATIC_CLIENT === "true";

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
    ...(browserAuthority.kind === "cloak"
      ? {
          connectOptions: {
            // The e2e fixture overrides the browser with connectOverCDP. This
            // guard makes any test that bypasses that fixture fail instead of
            // launching a local browser.
            wsEndpoint: "ws://127.0.0.1:1/counterlab-cdp-fixture-required",
            timeout: 1_000,
          },
        }
      : {}),
    acceptDownloads: true,
    viewport: { width: 1440, height: 900 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    // Stock Chromium is an explicitly labelled design-review fallback. It
    // keeps screenshots and traces but cannot stand in for Cloak video
    // evidence or install Playwright's FFmpeg outside this repository.
    video: browserAuthority.kind === "cloak" ? "retain-on-failure" : "off",
  },
  ...(remoteBaseURL === undefined
    ? {
        webServer: {
          command: staticDesignReview
            ? "node ../../scripts/serve-built-client.mjs"
            : `./node_modules/.bin/vite --host 127.0.0.1 --port ${port}`,
          cwd: import.meta.dirname,
          url: baseURL,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      }
    : {}),
});
