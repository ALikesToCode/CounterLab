import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  currentBrowserAuthorityLabel,
  ensureRuntimeParent,
  expect,
  requiredRuntimeRoot,
  test,
  type Page,
} from "./cloak-test";

const publicOrigin = process.env.COUNTERLAB_E2E_BASE_URL;
const replayPath = "/replay/leakage-01";

type BrowserObservations = {
  consoleErrorCount: number;
  failedRequests: string[];
  pageErrorCount: number;
  unsafeRequests: string[];
};

type OverflowReading = {
  bodyScrollWidth: number;
  documentScrollWidth: number;
  viewportWidth: number;
};

function pathnameFromUrl(value: string): string {
  try {
    return new URL(value).pathname;
  } catch {
    return "[non-http-resource]";
  }
}

function expectConfiguredPublicOrigin(value: string): void {
  if (publicOrigin === undefined || publicOrigin.trim() === "") {
    throw new Error(
      "Public replay qualification requires COUNTERLAB_E2E_BASE_URL",
    );
  }
  expect(new URL(value).origin).toBe(new URL(publicOrigin).origin);
}

function observeBrowser(page: Page): BrowserObservations {
  const observations: BrowserObservations = {
    consoleErrorCount: 0,
    failedRequests: [],
    pageErrorCount: 0,
    unsafeRequests: [],
  };

  page.on("console", (message) => {
    if (message.type() === "error") observations.consoleErrorCount += 1;
  });
  page.on("pageerror", () => {
    observations.pageErrorCount += 1;
  });
  page.on("requestfailed", (request) => {
    observations.failedRequests.push(
      `${request.method()} ${pathnameFromUrl(request.url())}`,
    );
  });
  page.on("request", (request) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method())) {
      observations.unsafeRequests.push(
        `${request.method()} ${pathnameFromUrl(request.url())}`,
      );
    }
  });

  return observations;
}

async function expectReadOnlyReplay(page: Page): Promise<void> {
  const legacyBanner = page.getByRole("complementary", {
    name: "Legacy replay status",
  });
  const capsuleBanner = page.getByRole("complementary", {
    name: "Verified replay mode",
  });
  await expect(legacyBanner.or(capsuleBanner)).toBeVisible({ timeout: 30_000 });
  await expect(legacyBanner.or(capsuleBanner)).toContainText(
    /Verified replay/i,
  );

  const legacyHeading = page.getByRole("heading", {
    name: /Inspect the result without changing its history/i,
  });
  const capsuleHeading = page.getByRole("heading", {
    name: /live notebook claim, replayed from verified evidence/i,
  });
  await expect(legacyHeading.or(capsuleHeading)).toBeVisible();
  await expect(page.locator("main[data-replay-id]")).toHaveAttribute(
    "data-replay-id",
    "leakage-01",
  );

  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: /Continue replay|Show me what happened|Run fair test|Lock my answer|Check my answer|Verify notebook patch/i,
    }),
  ).toHaveCount(0);
}

async function enterReadOnlyReplay(page: Page): Promise<void> {
  const replayStatus = page.getByRole("complementary", {
    name: "Replay status",
  });
  await expect(replayStatus).toBeVisible({ timeout: 30_000 });
  await expect(replayStatus).toContainText(
    "Verified replay · read-only stored evidence",
  );
  await expect(
    page.getByRole("heading", { name: /Replay verified session/i }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Continue replay/i }).click();
  await expectReadOnlyReplay(page);
}

async function readRootOverflow(page: Page): Promise<OverflowReading> {
  return page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
}

function expectNoRootOverflow(reading: OverflowReading): void {
  expect(reading.documentScrollWidth).toBeLessThanOrEqual(
    reading.viewportWidth,
  );
  expect(reading.bodyScrollWidth).toBeLessThanOrEqual(reading.viewportWidth);
}

function expectCleanReadOnlyObservations(
  observations: BrowserObservations,
): void {
  expect(observations.consoleErrorCount).toBe(0);
  expect(observations.pageErrorCount).toBe(0);
  expect(observations.failedRequests).toEqual([]);
  expect(observations.unsafeRequests).toEqual([]);
}

async function preserveMobileEvidence(input: {
  actions: readonly string[];
  elapsedMs: number;
  name: string;
  observations: BrowserObservations;
  overflow: OverflowReading;
  page: Page;
}): Promise<void> {
  const screenshotName = `${input.name}.png`;
  const screenshotPath = await ensureRuntimeParent(
    resolve(requiredRuntimeRoot(), "evidence", screenshotName),
  );
  await input.page.screenshot({ path: screenshotPath, fullPage: false });

  const evidencePath = await ensureRuntimeParent(
    resolve(requiredRuntimeRoot(), "evidence", `${input.name}.json`),
  );
  await writeFile(
    evidencePath,
    `${JSON.stringify(
      {
        schemaVersion: "1",
        browserAuthority: currentBrowserAuthorityLabel(),
        capturedAt: new Date().toISOString(),
        publicOrigin,
        finalPath: pathnameFromUrl(input.page.url()),
        viewport: input.page.viewportSize(),
        reducedMotion: true,
        actions: input.actions,
        elapsedMs: input.elapsedMs,
        overflow: input.overflow,
        observations: input.observations,
        screenshot: screenshotName,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

test.describe("public mobile replay routing", () => {
  test.skip(
    publicOrigin === undefined || publicOrigin.trim() === "",
    "Public mobile replay qualification requires COUNTERLAB_E2E_BASE_URL",
  );

  test("390x844 opens the replay deep link read-only without root overflow", async ({
    page,
  }) => {
    const startedAt = Date.now();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const observations = observeBrowser(page);

    const response = await page.goto(replayPath, {
      waitUntil: "domcontentloaded",
    });
    expect(response).not.toBeNull();
    expect(response!.ok()).toBe(true);
    expect(response!.request().redirectedFrom()).toBeNull();
    expectConfiguredPublicOrigin(response!.url());
    await expect(page).toHaveURL(new RegExp(`${replayPath}$`, "u"));
    await enterReadOnlyReplay(page);
    await page.waitForLoadState("networkidle");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page).toHaveURL(new RegExp(`${replayPath}$`, "u"));
    await expectReadOnlyReplay(page);
    const overflow = await readRootOverflow(page);
    expectNoRootOverflow(overflow);
    await page.waitForLoadState("networkidle");
    expectCleanReadOnlyObservations(observations);

    await preserveMobileEvidence({
      actions: [
        `deep-link ${replayPath}`,
        "verify persistent read-only authority label",
        "reload exact replay route",
        "measure document and body overflow",
      ],
      elapsedMs: Date.now() - startedAt,
      name: "public-mobile-replay-deep-link-390x844",
      observations,
      overflow,
      page,
    });
  });

  test("375x812 preserves replay authority through browser back and forward", async ({
    page,
  }) => {
    const startedAt = Date.now();
    await page.setViewportSize({ width: 375, height: 812 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    const observations = observeBrowser(page);

    const judgeResponse = await page.goto("/judge", {
      waitUntil: "domcontentloaded",
    });
    expect(judgeResponse).not.toBeNull();
    expect(judgeResponse!.ok()).toBe(true);
    expect(judgeResponse!.request().redirectedFrom()).toBeNull();
    expectConfiguredPublicOrigin(judgeResponse!.url());
    await expect(
      page.getByRole("heading", {
        name: /see a verified belief break in ten seconds/i,
      }),
    ).toBeVisible();
    expectNoRootOverflow(await readRootOverflow(page));
    await page.waitForLoadState("networkidle");

    const replayLink = page
      .getByRole("link", { name: /watch.*replay/i })
      .first();
    await expect(replayLink).toHaveAttribute("href", replayPath);
    await replayLink.click();
    await expect(page).toHaveURL(new RegExp(`${replayPath}$`, "u"));
    await enterReadOnlyReplay(page);
    await page.waitForLoadState("networkidle");

    await page.goBack({ waitUntil: "commit" });
    await expect(page).toHaveURL(/\/judge$/u);
    await expect(
      page.getByRole("heading", {
        name: /see a verified belief break in ten seconds/i,
      }),
    ).toBeVisible();
    await page.waitForLoadState("networkidle");

    await page.goForward({ waitUntil: "commit" });
    await expect(page).toHaveURL(new RegExp(`${replayPath}$`, "u"));
    await expectReadOnlyReplay(page);
    const overflow = await readRootOverflow(page);
    expectNoRootOverflow(overflow);
    await page.waitForLoadState("networkidle");
    expectCleanReadOnlyObservations(observations);

    await preserveMobileEvidence({
      actions: [
        "open Judge Mode",
        `follow the verified replay link to ${replayPath}`,
        "browser back to Judge Mode",
        "browser forward to the exact replay",
        "verify read-only authority and root overflow",
      ],
      elapsedMs: Date.now() - startedAt,
      name: "public-mobile-replay-history-375x812",
      observations,
      overflow,
      page,
    });
  });
});
