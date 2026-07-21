import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base } from "@playwright/test";

import {
  currentBrowserAuthorityLabel,
  resolveBrowserAuthority,
} from "./browser-authority";
import { JOURNEY_OBSERVATION_ATTACHMENT } from "./qualification-reporter";

export { currentBrowserAuthorityLabel };

const repositoryRoot = realpathSync(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const runtimeParent = resolve(repositoryRoot, "apps/web/test-results/runtime");

function assertNoSymlinkEscape(candidate: string, label: string): void {
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

function assertContainedPath(candidate: string, label: string): string {
  const resolved = resolve(candidate);
  const relativePath = relative(repositoryRoot, resolved);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `${label} must resolve to a descendant of the CounterLab repository`,
    );
  }
  assertNoSymlinkEscape(resolved, label);
  return resolved;
}

export function requiredRuntimeRoot(): string {
  const configured = process.env.COUNTERLAB_E2E_RUNTIME_ROOT;
  if (configured === undefined || configured.trim().length === 0) {
    throw new Error(
      "COUNTERLAB_E2E_RUNTIME_ROOT is required and must be repository-local",
    );
  }
  const resolved = assertContainedPath(
    configured,
    "COUNTERLAB_E2E_RUNTIME_ROOT",
  );
  const relativePath = relative(runtimeParent, resolved);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      "COUNTERLAB_E2E_RUNTIME_ROOT must be beneath apps/web/test-results/runtime",
    );
  }
  return resolved;
}

export function runtimeOutputPath(candidate: string, label: string): string {
  const runtimeRoot = requiredRuntimeRoot();
  const resolved = assertContainedPath(candidate, label);
  const relativePath = relative(runtimeRoot, resolved);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) {
    throw new Error(
      `${label} must resolve beneath COUNTERLAB_E2E_RUNTIME_ROOT`,
    );
  }
  return resolved;
}

function validatedCloakEndpoint(configured: string): string {
  const endpoint = new URL(configured);
  if (!["http:", "https:", "ws:", "wss:"].includes(endpoint.protocol)) {
    throw new Error(
      "CLOAK_CDP_ENDPOINT must use an http(s) or ws(s) CDP endpoint",
    );
  }
  if (endpoint.username !== "" || endpoint.password !== "") {
    throw new Error("CLOAK_CDP_ENDPOINT must not contain URL credentials");
  }
  return endpoint.toString();
}

type CounterLabAutomaticFixtures = {
  counterlabJourneyObservation: void;
};

export const test = base.extend<CounterLabAutomaticFixtures>({
  browser: [
    async ({ playwright }, use) => {
      const authority = resolveBrowserAuthority(process.env);
      const artifactsDir = runtimeOutputPath(
        resolve(requiredRuntimeRoot(), "browser-artifacts"),
        "Playwright browser artifacts",
      );
      await mkdir(artifactsDir, { recursive: true });
      assertContainedPath(artifactsDir, "Playwright browser artifacts");
      if (authority.kind === "cloak") {
        const browser = await playwright.chromium.connectOverCDP(
          validatedCloakEndpoint(authority.endpoint),
          {
            artifactsDir,
            timeout: 30_000,
          },
        );

        await use(browser);
        // The CloakBrowser process and CDP connection are shared
        // infrastructure. Each test closes its own context/page; never close
        // or kill the remote browser from this worker fixture.
        return;
      }

      const browserRuntime = resolve(requiredRuntimeRoot(), "stock-chromium");
      const browserHome = resolve(browserRuntime, "home");
      const browserCache = resolve(browserRuntime, "cache");
      const browserConfig = resolve(browserRuntime, "config");
      // Chromium's process singleton uses a Unix socket below TMPDIR. Keep
      // this repository-contained path short enough for the platform limit.
      const browserTmp = resolve(repositoryRoot, ".counterlab/tmp");
      for (const [path, label] of [
        [browserRuntime, "Stock Chromium runtime"],
        [browserHome, "Stock Chromium home"],
        [browserCache, "Stock Chromium cache"],
        [browserConfig, "Stock Chromium config"],
        [browserTmp, "Stock Chromium temporary directory"],
      ] as const) {
        assertContainedPath(path, label);
        await mkdir(path, { recursive: true });
      }
      const browser = await playwright.chromium.launch({
        executablePath: authority.executablePath,
        headless: true,
        artifactsDir,
        downloadsPath: artifactsDir,
        tracesDir: artifactsDir,
        env: {
          HOME: browserHome,
          LANG: process.env.LANG ?? "C.UTF-8",
          PATH: process.env.PATH,
          TMPDIR: browserTmp,
          XDG_CACHE_HOME: browserCache,
          XDG_CONFIG_HOME: browserConfig,
        },
      });

      try {
        await use(browser);
      } finally {
        await browser.close();
      }
    },
    { scope: "worker" },
  ],
  counterlabJourneyObservation: [
    async ({ page }, use, testInfo) => {
      let consoleErrors = 0;
      let failedRequests = 0;
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors += 1;
      });
      page.on("pageerror", () => {
        consoleErrors += 1;
      });
      page.on("requestfailed", () => {
        failedRequests += 1;
      });
      const browserVersion =
        page.context().browser()?.version().trim() || "unavailable";

      await use();

      const expectedFailureAnnotations = testInfo.annotations.filter(
        (annotation) =>
          annotation.type === "counterlab-expected-request-failures",
      );
      const expectedRequestFailures = Number.parseInt(
        expectedFailureAnnotations[0]?.description ?? "0",
        10,
      );
      const expectedRequestFailuresValid =
        expectedFailureAnnotations.length <= 1 &&
        Number.isSafeInteger(expectedRequestFailures) &&
        expectedRequestFailures >= 0;
      const viewport = page.viewportSize();
      await testInfo.attach(JOURNEY_OBSERVATION_ATTACHMENT, {
        body: Buffer.from(
          JSON.stringify({
            schemaVersion: "1",
            authority: currentBrowserAuthorityLabel(),
            viewport: viewport ?? { width: 0, height: 0 },
            consoleErrors,
            failedRequests: Math.max(
              0,
              failedRequests -
                (expectedRequestFailuresValid ? expectedRequestFailures : 0),
            ),
            expectedRequestFailuresMatched:
              expectedRequestFailuresValid &&
              failedRequests === expectedRequestFailures,
            browserVersion,
          }),
        ),
        contentType: "application/json",
      });
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
export type { Locator, Page } from "@playwright/test";

export async function ensureRuntimeParent(path: string): Promise<string> {
  const contained = runtimeOutputPath(path, "Runtime output");
  await mkdir(dirname(contained), { recursive: true });
  assertContainedPath(dirname(contained), "Runtime output parent");
  return contained;
}
