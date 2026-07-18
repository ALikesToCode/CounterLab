import { existsSync, lstatSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { test as base } from "@playwright/test";

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

function cloakEndpoint(): string {
  const configured = process.env.CLOAK_CDP_ENDPOINT;
  if (configured === undefined || configured.trim().length === 0) {
    throw new Error(
      "CLOAK_CDP_ENDPOINT is required; CounterLab browser QA will not launch stock Chromium",
    );
  }
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

export const test = base.extend({
  browser: [
    async ({ playwright }, use) => {
      const artifactsDir = runtimeOutputPath(
        resolve(requiredRuntimeRoot(), "browser-artifacts"),
        "Playwright browser artifacts",
      );
      await mkdir(artifactsDir, { recursive: true });
      assertContainedPath(artifactsDir, "Playwright browser artifacts");
      const browser = await playwright.chromium.connectOverCDP(
        cloakEndpoint(),
        {
          artifactsDir,
          timeout: 30_000,
        },
      );

      await use(browser);
      // The CloakBrowser process and CDP connection are shared infrastructure.
      // Playwright closes each test-created context/page; never close or kill the
      // remote browser from this worker fixture.
    },
    { scope: "worker" },
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
