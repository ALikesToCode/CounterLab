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
  await page.getByRole("button", { name: /Try instantly/i }).click();
  await expect(
    page.getByRole("heading", { name: /What does this result prove/i }),
  ).toBeVisible();
  await page.getByLabel("Your claim").fill(claim);
  await page.getByRole("button", { name: /Create Belief Test/i }).click();
  await expect(
    page.getByRole("heading", { name: "Belief Test" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Confirm Belief Test/i }).click();
}

async function commitAndOpenResult(page: Page) {
  await page.getByLabel(/Remain near 98%/i).check();
  await page.getByRole("button", { name: /Commit prediction/i }).click();
  await expect(
    page.getByRole("heading", { name: /Build and verify/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Open verified result/i }).click();
  await expect(
    page.getByRole("heading", { name: "Verified result" }),
  ).toBeVisible();
}

async function recordRevision(page: Page) {
  await page.getByLabel("Your revised mental model").fill(revision);
  await page.getByRole("button", { name: /Test transfer/i }).click();
  await expect(
    page.getByText(/Which evaluation design matches deployment/i),
  ).toBeVisible();
}

test("Try Instantly persists the verified learning loop and exports a valid proof", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await startInstant(page);
  await expect(
    page.getByRole("heading", { name: "Verified result" }),
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
    page.getByRole("heading", { name: /What changed—and what proved it/i }),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export Proof Bundle/i }).click();
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
    page.getByRole("heading", { name: /What changed—and what proved it/i }),
  ).toBeVisible();
  await expect(page.getByText(/Transfer passed/i)).toBeVisible();
  expect(consoleErrors).toEqual([]);
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
  await page.getByRole("button", { name: /Commit prediction/i }).click();
  const overwrite = await page.request.post(
    `/api/sessions/${sessionId}/prediction`,
    {
      data: { choice: "Accuracy remains near 98%", confidence: 100 },
    },
  );
  expect(overwrite.status()).toBe(409);
  expect((await overwrite.json()).error.code).toBe("ILLEGAL_TRANSITION");
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
  await page.getByRole("button", { name: /Open verified result/i }).click();
  await expect(replayBanner).toContainText("Verified replay");
  await expect(
    page.getByRole("heading", { name: "Verified result" }),
  ).toBeVisible();
});

test("missing live capabilities are stated without claiming a model call", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Generate live/i }).click();
  await expect(
    page.getByRole("heading", { name: "Generate live" }),
  ).toBeVisible();
  await expect(
    page.getByText(/No live call has been claimed or started/i),
  ).toBeVisible();
  await expect(
    page.getByText(/OPENAI_API_KEY · codex login · Docker/i),
  ).toBeVisible();
});

test("unsupported notebooks are parsed without execution and cannot advance", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Try instantly/i }).click();
  await expect(
    page.getByRole("heading", { name: /What does this result prove/i }),
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
    page.getByRole("button", { name: /Create Belief Test/i }),
  ).toBeDisabled();
});
