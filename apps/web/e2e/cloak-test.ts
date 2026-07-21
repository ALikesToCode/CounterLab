import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base } from "@playwright/test";

import {
  currentBrowserAuthorityLabel,
  resolveBrowserAuthority,
  validateCloakCdpEndpoint,
} from "./browser-authority";
import {
  classifyExpectedHttpErrorObservation,
  classifyExpectedHttpResourceConsoleObservation,
  JOURNEY_OBSERVATION_ATTACHMENT,
  journeyIdForParts,
  summarizeExpectedHttpErrors,
  summarizeExpectedHttpResourceConsoleErrors,
  summarizeRequestFailures,
  type ExpectedHttpErrorObservation,
} from "./qualification-reporter";
import {
  ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS,
  REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID,
  REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID,
} from "../../../scripts/submission-publication-evidence";

export { currentBrowserAuthorityLabel };

const repositoryRoot = realpathSync(
  fileURLToPath(new URL("../../..", import.meta.url)),
);
const runtimeParent = resolve(repositoryRoot, "apps/web/test-results/runtime");
type AllowedExpectedHttpError =
  (typeof ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS)[number];
const allowedExpectedHttpErrors: ReadonlySet<string> = new Set(
  ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS,
);

function expectedBrowserOrigin(): string {
  const configuredBaseUrl = process.env.COUNTERLAB_E2E_BASE_URL;
  const baseUrl =
    configuredBaseUrl ??
    `http://127.0.0.1:${process.env.COUNTERLAB_E2E_PORT ?? "5173"}`;
  return new URL(baseUrl).origin;
}

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
          validateCloakCdpEndpoint(authority.endpoint),
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
      const journeyId = journeyIdForParts(testInfo.file, testInfo.titlePath);
      const expectedViewport =
        REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID[
          journeyId as keyof typeof REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID
        ];
      if (expectedViewport === undefined) {
        throw new Error(
          `Unregistered browser qualification journey: ${journeyId}`,
        );
      }
      const [width, height] = expectedViewport
        .split("x")
        .map((part) => Number.parseInt(part, 10));
      await page.setViewportSize({ width: width!, height: height! });
      const expectedOrigin = expectedBrowserOrigin();
      const observedConsoleErrors: (ExpectedHttpErrorObservation | null)[] = [];
      const observedHttpErrors: (ExpectedHttpErrorObservation | null)[] = [];
      const failedRequests: string[] = [];
      page.on("console", (message) => {
        if (message.type() !== "error") return;
        observedConsoleErrors.push(
          classifyExpectedHttpResourceConsoleObservation({
            expectedOrigin,
            locationUrl: message.location().url,
            text: message.text(),
          }),
        );
      });
      page.on("pageerror", () => {
        observedConsoleErrors.push(null);
      });
      page.on("response", (response) => {
        if (response.status() < 400) return;
        observedHttpErrors.push(
          classifyExpectedHttpErrorObservation({
            expectedOrigin,
            method: response.request().method(),
            status: response.status(),
            url: response.url(),
          }),
        );
      });
      page.on("requestfailed", (request) => {
        try {
          const url = new URL(request.url());
          failedRequests.push(
            `${request.method().toUpperCase()} ${url.pathname}`,
          );
        } catch {
          failedRequests.push("UNPARSEABLE");
        }
      });
      const browserVersion =
        page.context().browser()?.version().trim() || "unavailable";

      await use();

      const expectedHttpAnnotations = testInfo.annotations.filter(
        (annotation) => annotation.type === "counterlab-expected-http-errors",
      );
      const expectedHttpAnnotationValues = expectedHttpAnnotations.map(
        (annotation) => annotation.description ?? "",
      );
      const expectedHttpErrorResponses = expectedHttpAnnotationValues.filter(
        (value): value is AllowedExpectedHttpError =>
          allowedExpectedHttpErrors.has(value),
      );
      const requiredHttpErrorResponses =
        REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID[
          journeyId as keyof typeof REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID
        ];
      const httpErrorSummary = summarizeExpectedHttpErrors(
        observedHttpErrors.map((observation) => observation?.signature ?? null),
        expectedHttpAnnotationValues,
      );
      const httpResourceConsoleSummary =
        summarizeExpectedHttpResourceConsoleErrors(
          observedConsoleErrors,
          httpErrorSummary.matched
            ? observedHttpErrors.filter(
                (observation): observation is ExpectedHttpErrorObservation =>
                  observation !== null,
              )
            : [],
        );
      const expectedFailureAnnotations = testInfo.annotations.filter(
        (annotation) =>
          annotation.type === "counterlab-expected-request-failures",
      );
      const expectedRequestFailures = expectedFailureAnnotations.map(
        (annotation) => annotation.description ?? "",
      );
      const requestFailureSummary = summarizeRequestFailures(
        failedRequests,
        expectedRequestFailures,
      );
      const viewport = page.viewportSize();
      await testInfo.attach(JOURNEY_OBSERVATION_ATTACHMENT, {
        body: Buffer.from(
          JSON.stringify({
            schemaVersion: "4",
            authority: currentBrowserAuthorityLabel(),
            viewport: viewport ?? { width: 0, height: 0 },
            totalConsoleErrors: httpResourceConsoleSummary.totalCount,
            expectedHttpResourceConsoleErrors:
              httpResourceConsoleSummary.expectedCount,
            unexpectedConsoleErrors: httpResourceConsoleSummary.unexpectedCount,
            expectedHttpErrorResponses,
            observedHttpErrorResponses:
              httpErrorSummary.observedHttpErrorResponses,
            unexpectedHttpErrorResponses: httpErrorSummary.unexpectedCount,
            expectedHttpResponsesMatched:
              httpErrorSummary.matched &&
              expectedHttpAnnotationValues.length ===
                expectedHttpErrorResponses.length &&
              JSON.stringify(expectedHttpErrorResponses) ===
                JSON.stringify(requiredHttpErrorResponses),
            expectedRequestFailures,
            expectedFailedRequests: requestFailureSummary.expectedCount,
            unexpectedFailedRequests: requestFailureSummary.unexpectedCount,
            observedRequestFailures:
              requestFailureSummary.observedRequestFailures,
            observedFailedRequests: requestFailureSummary.observedCount,
            expectedRequestFailuresMatched: requestFailureSummary.matched,
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
