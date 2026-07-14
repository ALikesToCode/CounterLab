import { expect, test, type Page } from "@playwright/test";
import { ProofBundleSchema } from "@counterlab/contracts";
import { readFile } from "node:fs/promises";

const claim =
  "The 98 percent random split accuracy proves this model generalizes to customers it has never seen.";
const revision =
  "When rows repeat an entity, hold out whole entities and remove identity-derived features before claiming generalization.";

async function reset(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function startInstant(page: Page) {
  await reset(page);
  await page
    .getByRole("button", { name: /Start the 3-minute lesson/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  await page.getByLabel("Your claim").fill(claim);
  await page.getByRole("button", { name: /Compare two explanations/i }).click();
  await expect(
    page.getByRole("heading", { name: "Which explanation fits?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /These two ideas make sense/i })
    .click();
}

async function commitAndOpenResult(page: Page) {
  await page.getByLabel(/Remain near 98%/i).check();
  await page.getByRole("button", { name: /Lock my answer/i }).click();
  await expect(
    page.getByRole("heading", { name: /The result is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
}

async function recordRevision(page: Page) {
  await page.getByLabel("Your revised mental model").fill(revision);
  await page
    .getByRole("button", { name: /Try the rule on a new problem/i })
    .click();
  await expect(
    page.getByText(/Which evaluation design matches deployment/i),
  ).toBeVisible();
}

test("the first visit explains the lesson before asking for technical knowledge", async ({
  page,
}) => {
  await reset(page);
  await expect(
    page.getByRole("heading", {
      name: "A model scored 98.5%. Can you trust it?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /CounterLab is a guided lesson.*make a prediction.*fairer test.*new problem/i,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Start the 3-minute lesson/i }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: /Test my notebook/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Watch a verified replay/i }),
  ).toBeVisible();

  const visibleWords = (await page.locator("body").innerText())
    .trim()
    .split(/\s+/).length;
  expect(visibleWords).toBeLessThan(210);
  await expect(page.locator("body")).not.toContainText(
    /formalize|discriminating|canonical|mutation/i,
  );
});

test("Try Instantly persists the verified learning loop and exports a valid proof", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await startInstant(page);
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toHaveCount(0);

  const sessionId = await page.evaluate(() =>
    window.localStorage.getItem("counterlab.sessionId"),
  );
  expect(sessionId).toMatch(/^session_/);

  await commitAndOpenResult(page);
  await expect(page.getByText("59.4%").first()).toBeVisible();

  await recordRevision(page);
  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(page.getByText(/Transfer passed/i)).toBeVisible();
  await page.getByRole("button", { name: /Verify notebook patch/i }).click();
  await expect(
    page.getByRole("heading", { name: /Your learning, before and after/i }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download proof/i }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const proof = ProofBundleSchema.parse(
    JSON.parse(await readFile(downloadPath!, "utf8")),
  );
  expect(proof.sessionId).toBe(sessionId);
  expect(proof.events).toHaveLength(12);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Your learning, before and after/i }),
  ).toBeVisible();
  await expect(page.getByText(/Transfer passed/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test("the lesson keeps one learner decision in focus at a time", async ({
  page,
}) => {
  await startInstant(page);
  await commitAndOpenResult(page);

  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
  await expect(
    page.getByText(/Which evaluation design matches deployment/i),
  ).toHaveCount(0);

  await page.getByLabel("Your revised mental model").fill(revision);
  await page
    .getByRole("button", { name: /Try the rule on a new problem/i })
    .click();

  await expect(
    page.getByRole("heading", { name: /Try your rule on forecasting/i }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(24);
  await expect(
    page.getByRole("heading", { name: /Why the score changed/i }),
  ).toHaveCount(0);

  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();

  await expect(
    page.getByRole("heading", { name: /You applied the rule correctly/i }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(24);
  await expect(
    page.getByText(/Which evaluation design matches deployment/i),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /Verify notebook patch/i }).click();
  await expect(
    page.getByRole("heading", { name: /Your learning, before and after/i }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(24);
  await expect(page.locator("pre.diff")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: /Download proof/i }),
  ).toBeVisible();
});

test("prediction is immutable and results do not exist before commitment", async ({
  page,
}) => {
  await startInstant(page);
  const sessionId = await page.evaluate(() =>
    window.localStorage.getItem("counterlab.sessionId"),
  );
  expect(sessionId).not.toBeNull();

  const before = await page.request.get(`/api/sessions/${sessionId}`);
  expect(before.ok()).toBe(true);
  expect((await before.json()).data.verifiedResult).toBeUndefined();

  await page.getByLabel(/Fall materially/i).check();
  await page.getByLabel(/Confidence/i).fill("88");
  await expect(page.getByText("88%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Lock my answer/i }).click();
  await expect(
    page.getByRole("heading", { name: /The result is ready/i }),
  ).toBeVisible();
  const overwrite = await page.request.post(
    `/api/sessions/${sessionId}/prediction`,
    {
      data: { choice: "Accuracy remains near 98%", confidence: 100 },
    },
  );
  expect(overwrite.status()).toBe(409);
  expect((await overwrite.json()).error.code).toBe("ILLEGAL_TRANSITION");

  const committed = await page.request.get(`/api/sessions/${sessionId}`);
  expect(committed.ok()).toBe(true);
  expect((await committed.json()).data.prediction.confidence).toBe(88);
});

test("a learner can use a claim starter and return home", async ({ page }) => {
  await reset(page);
  await page
    .getByRole("button", { name: /Start the 3-minute lesson/i })
    .click();

  await page.getByRole("button", { name: /Use a starter claim/i }).click();
  await expect(page.getByLabel("Your claim")).toHaveValue(/new customers/i);
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toBeEnabled();

  await page.getByRole("button", { name: /Start over/i }).click();
  await expect(
    page.getByRole("heading", {
      name: "A model scored 98.5%. Can you trust it?",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("counterlab.sessionId"),
    ),
  ).toBeNull();
});

test("refresh restores the current lesson and the committed prediction", async ({
  page,
}) => {
  await startInstant(page);
  await page.getByLabel(/Fall materially/i).check();
  await page.getByLabel(/Confidence/i).fill("88");
  await page.getByRole("button", { name: /Lock my answer/i }).click();
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: /Accuracy falls materially/i }),
  ).toBeVisible();
});

test("completed lesson steps open as read-only pages", async ({ page }) => {
  await startInstant(page);
  await commitAndOpenResult(page);

  await page.getByRole("button", { name: "Your guess" }).click();
  await expect(
    page.getByRole("heading", { name: /Review your prediction/i }),
  ).toBeVisible();
  await expect(page.getByText(/saved evidence is read-only/i)).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);

  await page.getByRole("button", { name: /Return to current step/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
});

test("failed transfer keeps the patch locked and a corrected answer unlocks it", async ({
  page,
}) => {
  await startInstant(page);
  await commitAndOpenResult(page);
  await recordRevision(page);

  await page.getByLabel(/Random daily rows/i).check();
  await page.getByLabel(/Known item price/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(page.getByText(/Transfer not yet passed/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Verify notebook patch/i }),
  ).toHaveCount(0);

  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(page.getByText(/Transfer passed/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Verify notebook patch/i }),
  ).toBeEnabled();
});

test("Replay remains visibly labelled for the full reconstructed path", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Replay verified session/i }).click();
  const replayBanner = page.getByLabel("Replay status");
  await expect(replayBanner).toContainText("Verified replay");
  await page.getByRole("button", { name: /Continue replay/i }).click();
  await expect(replayBanner).toContainText("Verified replay");
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(replayBanner).toContainText("Verified replay");
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();

  await page.reload();
  await expect(replayBanner).toContainText("Verified replay");
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
});

test("missing live capabilities are stated without claiming a model call", async ({
  page,
}) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: "server-key-required",
          liveCodex: "local-runner-required",
          liveKernel: "local-runner-required",
          sandbox: "local-runner-required",
          requestId: "e2e-health-missing",
        },
      }),
    });
  });
  await reset(page);
  await page.getByRole("button", { name: /Generate live/i }).click();
  await expect(
    page.getByRole("heading", { name: "Test my notebook" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Live notebook lessons are not set up/i),
  ).toBeVisible();
  await expect(page.getByText(/Nothing was sent/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /OPENAI|GPT-|https?:\/\//i,
  );
});

test("configured live reasoning remains unproven until its first request", async ({
  page,
}) => {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: {
          platform: "cloudflare-workers",
          sample: "available",
          replay: "available",
          liveGpt: "configured",
          liveCodex: "local-runner-required",
          liveKernel: "local-runner-required",
          sandbox: "local-runner-required",
          requestId: "e2e-health",
        },
      }),
    });
  });
  await reset(page);
  await page.getByRole("button", { name: /Generate live/i }).click();

  await expect(
    page.getByText(/Notebook lesson tools are ready to try/i),
  ).toBeVisible();
  await expect(page.getByText(/local runner is needed/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with my notebook/i }),
  ).toBeEnabled();
  await expect(page.locator("body")).not.toContainText(
    /OPENAI|GPT-|https?:\/\//i,
  );
});

test("unsupported notebooks are parsed without execution and cannot advance", async ({
  page,
}) => {
  await reset(page);
  await page
    .getByRole("button", { name: /Start the 3-minute lesson/i })
    .click();
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  const notebook = {
    cells: [
      {
        cell_type: "code",
        execution_count: null,
        metadata: {},
        outputs: [],
        source: ["%load_ext custom_extension\n", "import requests\n"],
      },
    ],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  };
  await page.locator('input[type="file"]').setInputFiles({
    name: "unsupported.ipynb",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(notebook)),
  });

  await expect(page.getByText(/UNSUPPORTED_MAGIC/i)).toBeVisible();
  await expect(page.getByText(/EXTERNAL_NETWORK_DEPENDENCY/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toBeDisabled();
});

test("the judged path is keyboard operable with reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await reset(page);

  const tryInstant = page.getByRole("button", {
    name: /Start the 3-minute lesson/i,
  });
  await tryInstant.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();

  const claimInput = page.getByLabel("Your claim");
  await claimInput.focus();
  await page.keyboard.type(claim);
  await page.getByRole("button", { name: /Compare two explanations/i }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /These two ideas make sense/i })
    .focus();
  await page.keyboard.press("Enter");

  await page.getByLabel(/Fall materially/i).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /Lock my answer/i }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /The result is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show me what happened/i }).focus();
  await page.keyboard.press("Enter");

  const revisionInput = page.getByLabel("Your revised mental model");
  await revisionInput.focus();
  await page.keyboard.type(revision);
  await page
    .getByRole("button", { name: /Try the rule on a new problem/i })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByLabel(/Time-ordered holdout/i).focus();
  await page.keyboard.press("Space");
  await page.getByLabel(/Centered rolling target/i).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /Check transfer/i }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Transfer passed/i)).toBeVisible();

  await page.getByRole("button", { name: /Verify notebook patch/i }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Your learning, before and after/i }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
