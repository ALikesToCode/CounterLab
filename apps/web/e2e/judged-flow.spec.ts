import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ProofBundleSchema,
  ProofCapsuleReplayReceiptV2Schema,
  ProofCapsuleReplayV2Schema,
} from "@counterlab/contracts";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const claim =
  "The 98 percent random split accuracy proves this model generalizes to customers it has never seen.";
const revision =
  "When rows repeat an entity, hold out whole entities and remove identity-derived features before claiming generalization.";
const imbalanceNotebookPath = new URL(
  "../../../fixtures/notebooks/fraud_class_imbalance.ipynb",
  import.meta.url,
).pathname;
const leakageNotebookPath = new URL(
  "../../../evals/held-out/notebooks/leakage-rows-pipeline.ipynb",
  import.meta.url,
).pathname;

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeLiveSmokeEvidence(
  concept: "entity_leakage" | "class_imbalance",
  page: Page,
  proofCapsulePath: string,
  patchedNotebookPath: string,
  authorityChecks?: {
    duplicateCompileReused: boolean;
    reconnectedFromCursor: boolean;
    cancellationAcknowledged: boolean;
    cancelledWithoutResult: boolean;
    duplicateCancelReused: boolean;
  },
): Promise<void> {
  const destination = process.env.COUNTERLAB_E2E_EVIDENCE_PATH;
  if (destination === undefined || destination.length === 0) return;

  const sessionId = await page.evaluate(() =>
    window.localStorage.getItem("counterlab.sessionId"),
  );
  if (sessionId === null) {
    throw new Error("Live smoke evidence requires a persisted session ID");
  }

  const completedSessionResponse = await page.request.get(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
  expect(completedSessionResponse.ok()).toBe(true);
  const completedSessionPayload = (await completedSessionResponse.json()) as {
    data?: {
      state?: unknown;
      reasoningDiffV2?: unknown;
      proofCapsule?: unknown;
    };
  };
  expect(completedSessionPayload.data?.state).toBe("PROOF_CAPSULE_ISSUED");
  expect(completedSessionPayload.data?.reasoningDiffV2).toBeDefined();
  expect(completedSessionPayload.data?.proofCapsule).toBeDefined();

  const proofCapsule = await readFile(proofCapsulePath);
  const capsuleEnvelope = JSON.parse(proofCapsule.toString("utf8")) as {
    entries?: Array<{ path?: unknown; sha256?: unknown; content?: unknown }>;
  };
  const engineSnapshotEntry = capsuleEnvelope.entries?.find(
    (entry) => entry.path === "scientific-engine-snapshot.json",
  );
  if (
    typeof engineSnapshotEntry?.sha256 !== "string" ||
    typeof engineSnapshotEntry.content !== "string" ||
    sha256(engineSnapshotEntry.content) !== engineSnapshotEntry.sha256
  ) {
    throw new Error(
      "Live smoke evidence requires a hashed scientific-engine snapshot entry",
    );
  }

  const publicationResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname ===
        `/api/sessions/${encodeURIComponent(sessionId)}/replays`
    );
  });
  await page
    .getByRole("button", { name: /Publish read-only replay/i })
    .click();
  const publicationResponse = await publicationResponsePromise;
  expect([200, 201]).toContain(publicationResponse.status());
  const publicationPayload = (await publicationResponse.json()) as {
    data?: { replay?: unknown };
  };
  const receipt = ProofCapsuleReplayReceiptV2Schema.parse(
    publicationPayload.data?.replay,
  );
  await expect(
    page.getByRole("link", { name: /Open verified replay/i }),
  ).toHaveAttribute(
    "href",
    `/replay/${encodeURIComponent(receipt.replayId)}`,
  );

  const duplicatePublicationResponse = await page.request.post(
    `/api/sessions/${encodeURIComponent(sessionId)}/replays`,
    { data: {} },
  );
  expect(duplicatePublicationResponse.status()).toBe(200);
  const duplicatePublicationPayload =
    (await duplicatePublicationResponse.json()) as {
      data?: { reused?: unknown; replay?: unknown };
    };
  const duplicateReceipt = ProofCapsuleReplayReceiptV2Schema.parse(
    duplicatePublicationPayload.data?.replay,
  );
  expect(duplicatePublicationPayload.data?.reused).toBe(true);
  expect(duplicateReceipt.replayId).toBe(receipt.replayId);

  const replayResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}`,
  );
  expect(replayResponse.ok()).toBe(true);
  const replayPayload = (await replayResponse.json()) as { data?: unknown };
  const replay = ProofCapsuleReplayV2Schema.parse(replayPayload.data);

  const replayCapsuleResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}/proof-capsule`,
  );
  expect(replayCapsuleResponse.ok()).toBe(true);
  expect(replayCapsuleResponse.headers()["content-type"]).toContain(
    "application/vnd.counterlab.capsule+json",
  );
  const replayCapsule = Buffer.from(await replayCapsuleResponse.body());

  const replayPatchResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}/patched-notebook`,
  );
  expect(replayPatchResponse.ok()).toBe(true);
  expect(replayPatchResponse.headers()["content-type"]).toContain(
    "application/x-ipynb+json",
  );
  const replayPatch = Buffer.from(await replayPatchResponse.body());
  const patchedNotebook = await readFile(patchedNotebookPath);
  const parsedPatchedNotebook = JSON.parse(patchedNotebook.toString("utf8")) as {
    nbformat?: unknown;
    cells?: unknown;
  };
  expect(parsedPatchedNotebook.nbformat).toBe(4);
  expect(Array.isArray(parsedPatchedNotebook.cells)).toBe(true);

  const capsuleSha256 = sha256(proofCapsule);
  const patchSha256 = sha256(patchedNotebook);
  expect(capsuleSha256).toBe(receipt.bytesHash);
  expect(proofCapsule.byteLength).toBe(receipt.proofCapsule.byteLength);
  expect(sha256(replayCapsule)).toBe(capsuleSha256);
  expect(sha256(replayPatch)).toBe(patchSha256);

  await page.goto(`/replay/${encodeURIComponent(receipt.replayId)}`);
  await expect(
    page.getByRole("complementary", { name: "Verified replay mode" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Verified replay mode" }),
  ).toBeVisible();

  await writeFile(
    destination,
    `${JSON.stringify(
      {
        schemaVersion: "2",
        concept,
        sessionId,
        publishedReplayId: receipt.replayId,
        sourceArtifactHash: replay.artifactManifest.fileSha256,
        experimentIrHash: replay.reasoningDiff.authority.experimentIrHash,
        experimentSelectionHash:
          replay.reasoningDiff.authority.selectionHash,
        resultHash: replay.verifiedResult.resultHash,
        evidenceVerdictHash:
          replay.reasoningDiff.authority.evidenceVerdictHash,
        epistemicReportHash:
          replay.reasoningDiff.authority.epistemicReportHash,
        boundaryMapHash: replay.boundary.result.resultHash,
        boundaryReceiptHash:
          replay.reasoningDiff.authority.boundaryReceiptHash,
        transferResultHash:
          replay.reasoningDiff.authority.transferResultHash,
        patchPlanHash: replay.reasoningDiff.authority.patchPlanHash,
        patchResultHash: replay.patchResult.resultHash,
        patchedArtifactHash: replay.patchResult.patchedArtifactHash,
        patchedNotebookSha256: patchSha256,
        proofCapsuleSha256: capsuleSha256,
        proofCapsuleRootHash: receipt.rootHash,
        proofCapsuleBytesHash: receipt.bytesHash,
        proofCapsuleMediaType: receipt.proofCapsule.mediaType,
        proofCapsuleIntegrityMode: receipt.proofCapsule.integrity.mode,
        proofCapsuleByteLength: receipt.proofCapsule.byteLength,
        reasoningDiffHash: receipt.proofCapsule.reasoningDiffHash,
        eventChainHead: receipt.eventChainHead,
        scientificEngineSnapshotHash: engineSnapshotEntry.sha256,
        replayProjectionHash: sha256(JSON.stringify(replay)),
        replayProofCapsuleSha256: sha256(replayCapsule),
        replayPatchedNotebookSha256: sha256(replayPatch),
        replayPlaybackMode: replay.playbackMode,
        replaySourceMode: replay.sourceMode,
        replayPersistedAfterRefresh: true,
        replayDownloadsMatch:
          sha256(replayCapsule) === capsuleSha256 &&
          sha256(replayPatch) === patchSha256,
        duplicateReplayPublicationReused:
          duplicatePublicationPayload.data?.reused === true,
        ...authorityChecks,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

type BrowserRunnerCheckpoint = {
  sessionId: string;
  jobId: string;
  cursor: number;
};

async function browserRunnerCheckpoint(
  page: Page,
): Promise<BrowserRunnerCheckpoint | null> {
  return page.evaluate(() => {
    const sessionId = window.localStorage.getItem("counterlab.sessionId");
    if (sessionId === null) return null;
    const activeBody = window.localStorage.getItem(
      `counterlab.activeRunnerJob.${encodeURIComponent(sessionId)}`,
    );
    if (activeBody === null) return null;
    try {
      const active = JSON.parse(activeBody) as {
        sessionId?: unknown;
        jobId?: unknown;
      };
      if (active.sessionId !== sessionId || typeof active.jobId !== "string") {
        return null;
      }
      const eventBody = window.localStorage.getItem(
        `counterlab.runnerEvents.${encodeURIComponent(sessionId)}.${encodeURIComponent(active.jobId)}`,
      );
      if (eventBody === null) return null;
      const eventSnapshot = JSON.parse(eventBody) as { cursor?: unknown };
      if (
        typeof eventSnapshot.cursor !== "number" ||
        eventSnapshot.cursor <= 0
      ) {
        return null;
      }
      return {
        sessionId,
        jobId: active.jobId,
        cursor: eventSnapshot.cursor,
      };
    } catch {
      return null;
    }
  });
}

async function reset(page: Page) {
  await page.goto("/");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
}

async function startInstant(page: Page) {
  await reset(page);
  await page
    .getByRole("button", { name: /Try the 3-minute sample — Try instantly/i })
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

async function waitForVerifiedLiveCompile(page: Page) {
  const verified = page.getByRole("heading", {
    name: /The fair test passed its checks/i,
  });
  const retry = page.getByRole("button", {
    name: /Retry protected compile/i,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outcome = await Promise.race([
      verified
        .waitFor({ state: "visible", timeout: 360_000 })
        .then(() => "verified" as const),
      retry
        .waitFor({ state: "visible", timeout: 360_000 })
        .then(() => "retry" as const),
    ]);
    if (outcome === "verified") return;
    await retry.click();
  }

  await expect(verified).toBeVisible({ timeout: 360_000 });
}

async function waitForVerifiedPatch({
  success,
  failure,
  retry,
}: {
  success: Locator;
  failure: Locator;
  retry: Locator;
}) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const outcome = await Promise.race([
      success
        .waitFor({ state: "visible", timeout: 360_000 })
        .then(() => "verified" as const),
      failure
        .waitFor({ state: "visible", timeout: 360_000 })
        .then(() => "retry" as const),
    ]);
    if (outcome === "verified") return;
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(failure).toBeHidden();
  }

  await expect(success).toBeVisible({ timeout: 360_000 });
}

test("Judge Mode distinguishes every authority path", async ({ page }) => {
  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.ok()).toBe(true);
  const health = (await healthResponse.json()) as {
    data?: {
      liveGpt?: unknown;
      liveCodex?: unknown;
      liveKernel?: unknown;
      sandbox?: unknown;
    };
  };
  const liveReady =
    health.data?.liveGpt === "configured" &&
    health.data.liveCodex === "configured" &&
    health.data.liveKernel === "configured" &&
    health.data.sandbox === "configured";
  await page.goto("/judge");
  await expect(page).toHaveURL(/\/judge$/);
  await expect(
    page.getByRole("heading", {
      name: /see a belief break in twenty seconds/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("Sample lesson")).toBeVisible();
  await expect(page.getByText("Live notebook analysis")).toBeVisible();
  await expect(page.getByText("Verified replay", { exact: true })).toBeVisible();
  if (liveReady) {
    await expect(
      page.getByRole("link", { name: /run live/i }),
    ).toHaveAttribute("href", "/new");
  } else {
    await expect(page.getByText(/live authority is unavailable/i)).toBeVisible();
    await expect(
      page.getByRole("link", { name: /run live/i }),
    ).toHaveCount(0);
  }
  await expect(
    page.getByRole("link", { name: /watch replay/i }),
  ).toHaveAttribute("href", "/replay/leakage-01");
  await expect(
    page.getByRole("heading", { name: "GPT-5.6", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Runtime Codex", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Fixed kernel", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Frozen verifier", exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/judge$/);
  await expect(
    page.getByRole("heading", {
      name: /see a belief break in twenty seconds/i,
    }),
  ).toBeVisible();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("the first visit explains the lesson before asking for technical knowledge", async ({
  page,
}) => {
  await reset(page);
  await expect(
    page.getByRole("heading", {
      name: "Your notebook made a claim. Will it survive a fair test?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Lock what you expect.*verified test.*apply the lesson.*repair/i,
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Try the 3-minute sample — Try instantly/i,
    }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: /Analyze a notebook — Generate live/i }),
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
  await expect(
    page.getByRole("heading", {
      name: /Change the test, then let the kernel recompute it/i,
    }),
  ).toBeVisible();

  await recordRevision(page);
  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();
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
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();
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
    .getByRole("button", { name: /Try the 3-minute sample — Try instantly/i })
    .click();

  await page.getByRole("button", { name: /Use a starter claim/i }).click();
  await expect(page.getByLabel("Your claim")).toHaveValue(/new customers/i);
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toBeEnabled();

  await page.getByRole("button", { name: /Start over/i }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your notebook made a claim. Will it survive a fair test?",
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
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Verify notebook patch/i }),
  ).toBeEnabled();
});

test("Replay remains visibly labelled for the full reconstructed path", async ({
  page,
}) => {
  await reset(page);
  await page
    .getByRole("button", {
      name: /Watch a verified replay — Replay verified session/i,
    })
    .click();
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
  await page
    .getByRole("button", { name: /Analyze a notebook — Generate live/i })
    .click();
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
  await page
    .getByRole("button", { name: /Analyze a notebook — Generate live/i })
    .click();

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
    .getByRole("button", { name: /Try the 3-minute sample — Try instantly/i })
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
    name: /Try the 3-minute sample — Try instantly/i,
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
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();

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

test("a configured hosted runner completes an untouched leakage notebook", async ({
  page,
}) => {
  test.skip(
    process.env.COUNTERLAB_E2E_LIVE !== "1",
    "Set COUNTERLAB_E2E_LIVE=1 only against a real configured analyst and runner.",
  );
  test.setTimeout(12 * 60_000);

  const health = await page.request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect((await health.json()).data).toMatchObject({
    liveGpt: "configured",
    liveCodex: "configured",
    liveKernel: "configured",
    sandbox: "configured",
  });

  await reset(page);
  await page
    .getByRole("button", { name: /Analyze a notebook — Generate live/i })
    .click();
  await expect(
    page.getByText(/Hosted notebook runner is ready/i),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Continue with my notebook/i })
    .click();

  await page.locator('input[type="file"]').setInputFiles(leakageNotebookPath);
  await expect(
    page.getByText(/leakage-rows-pipeline.ipynb/i).first(),
  ).toBeVisible();
  await page.getByLabel("Your claim").fill(claim);
  await page.getByRole("button", { name: /Compare two explanations/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Review the evidence sent for analysis/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Entity leakage/i).first()).toBeVisible();
  const sensitiveApproval = page.getByRole("checkbox", {
    name: /I reviewed the sensitive-looking excerpts/i,
  });
  if ((await sensitiveApproval.count()) > 0) await sensitiveApproval.check();
  await page.getByRole("button", { name: /Send this evidence/i }).click();

  await expect(
    page.getByRole("heading", { name: /Which explanation fits/i }),
  ).toBeVisible({ timeout: 210_000 });
  const hypotheses = page.getByRole("region", {
    name: "Competing hypotheses",
  });
  await expect(hypotheses.getByRole("heading")).toHaveCount(2);
  await expect(hypotheses.getByText(/Idea B · Customer memory/i)).toBeVisible();
  await page
    .getByRole("button", { name: /These two ideas make sense/i })
    .click();
  await page.getByLabel(/Remain near 98%/i).check();
  await page.getByLabel(/Confidence/i).fill("84");
  await page.getByRole("button", { name: /Lock my answer/i }).click();

  await expect
    .poll(async () => (await browserRunnerCheckpoint(page))?.cursor ?? 0, {
      timeout: 120_000,
      message: "the live compiler should persist a nonzero public cursor",
    })
    .toBeGreaterThan(0);
  const initialCheckpoint = await browserRunnerCheckpoint(page);
  expect(initialCheckpoint).not.toBeNull();

  await expect(
    page.getByRole("button", { name: /Cancel this test/i }),
  ).toBeVisible();

  const cancelResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      response.url().includes(`/jobs/${initialCheckpoint!.jobId}/cancel`),
  );
  await page.getByRole("button", { name: /Cancel this test/i }).click();
  const cancelBody = await (await cancelResponse).json();
  expect(cancelBody).toMatchObject({
    ok: true,
    data: {
      state: "LAB_REJECTED",
      runnerAcknowledged: true,
      runnerJob: { status: "CANCELLED" },
    },
  });
  expect(cancelBody.data.verifiedResult).toBeUndefined();
  await expect(
    page.getByRole("heading", { name: /The runner stopped safely/i }),
  ).toBeVisible();

  const duplicateCancel = await page.evaluate(async ({ sessionId, jobId }) => {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST" },
    );
    return { status: response.status, body: await response.json() };
  }, initialCheckpoint!);
  expect(duplicateCancel.status).toBe(200);
  expect(duplicateCancel.body).toMatchObject({
    ok: true,
    data: {
      reused: true,
      runnerJob: { status: "CANCELLED" },
    },
  });

  await page.getByRole("button", { name: /Retry protected compile/i }).click();

  await expect
    .poll(
      async () => {
        const checkpoint = await browserRunnerCheckpoint(page);
        return checkpoint?.jobId !== initialCheckpoint!.jobId
          ? (checkpoint?.cursor ?? 0)
          : 0;
      },
      {
        timeout: 120_000,
        message: "the retry compiler should persist a new public cursor",
      },
    )
    .toBeGreaterThan(0);
  const retryCheckpoint = await browserRunnerCheckpoint(page);
  expect(retryCheckpoint).not.toBeNull();
  expect(retryCheckpoint!.jobId).not.toBe(initialCheckpoint!.jobId);

  const duplicateCompile = await page.evaluate(async (sessionId) => {
    const response = await fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/lab/compile`,
      { method: "POST" },
    );
    return { status: response.status, body: await response.json() };
  }, retryCheckpoint!.sessionId);
  expect(duplicateCompile.status).toBe(202);
  expect(duplicateCompile.body).toMatchObject({
    ok: true,
    data: {
      reused: true,
      runnerJob: { jobId: retryCheckpoint!.jobId },
    },
  });

  const resumedRequest = page.waitForRequest(
    (request) => {
      const url = new URL(request.url());
      return (
        url.pathname.includes(`/jobs/${retryCheckpoint!.jobId}/events`) &&
        Number(url.searchParams.get("after")) > 0
      );
    },
    { timeout: 60_000 },
  );
  await page.reload();
  const resumedAfter = Number(
    new URL((await resumedRequest).url()).searchParams.get("after"),
  );
  expect(resumedAfter).toBeGreaterThan(0);

  await waitForVerifiedLiveCompile(page);
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
  await expect(page.getByText(/0 shared customers/i).first()).toBeVisible();

  await page.getByLabel(/Whole entities/i).check();
  await page.getByLabel(/Remove identity feature/i).check();
  await page.getByLabel(/Test size/i).fill("0.3");
  await page.getByRole("button", { name: /Run this configuration/i }).click();
  await expect(page.getByText(/Verified exploratory result/i)).toBeVisible({
    timeout: 180_000,
  });

  await page.getByLabel("Your revised mental model").fill(revision);
  await page
    .getByRole("button", { name: /Try the rule on a new problem/i })
    .click();
  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Verify notebook patch/i }).click();
  await waitForVerifiedPatch({
    success: page.getByRole("heading", {
      name: /You found the hidden shortcut/i,
    }),
    failure: page.locator(
      ".lesson-phase.live-compiler > .transfer-result[role='alert']",
    ),
    retry: page.getByRole("button", { name: /Retry protected patch/i }),
  });
  await expect(page).toHaveURL(/\/proof\//);

  const patchDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /Download repaired notebook/i })
    .click();
  const patch = await patchDownload;
  expect(patch.suggestedFilename()).toMatch(/\.counterlab-patched\.ipynb$/i);
  const patchedNotebookPath = await patch.path();
  expect(patchedNotebookPath).not.toBeNull();

  const capsuleDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export Proof Capsule/i }).click();
  const capsulePath = await (await capsuleDownload).path();
  expect(capsulePath).not.toBeNull();
  await writeLiveSmokeEvidence(
    "entity_leakage",
    page,
    capsulePath!,
    patchedNotebookPath!,
    {
      duplicateCompileReused: duplicateCompile.body.data.reused === true,
      reconnectedFromCursor: resumedAfter > 0,
      cancellationAcknowledged: cancelBody.data.runnerAcknowledged === true,
      cancelledWithoutResult: cancelBody.data.verifiedResult === undefined,
      duplicateCancelReused: duplicateCancel.body.data.reused === true,
    },
  );
});

test("a configured hosted runner completes an untouched class-imbalance notebook", async ({
  page,
}) => {
  test.skip(
    process.env.COUNTERLAB_E2E_LIVE !== "1",
    "Set COUNTERLAB_E2E_LIVE=1 only against a real configured analyst and runner.",
  );
  test.setTimeout(12 * 60_000);

  const health = await page.request.get("/api/health");
  expect(health.ok()).toBe(true);
  const capability = (await health.json()).data;
  expect(capability).toMatchObject({
    liveGpt: "configured",
    liveCodex: "configured",
    liveKernel: "configured",
    sandbox: "configured",
  });

  await reset(page);
  await page
    .getByRole("button", { name: /Analyze a notebook — Generate live/i })
    .click();
  await expect(
    page.getByText(/Hosted notebook runner is ready/i),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Continue with my notebook/i })
    .click();

  await page.locator('input[type="file"]').setInputFiles(imbalanceNotebookPath);
  await expect(
    page.getByText(/fraud_class_imbalance.ipynb/i).first(),
  ).toBeVisible();
  await page
    .getByLabel("Your claim")
    .fill(
      "The 99 percent accuracy proves this fraud classifier catches the rare cases that matter.",
    );
  await page.getByRole("button", { name: /Compare two explanations/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Review the evidence sent for analysis/i,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Class imbalance/i).first()).toBeVisible();
  await page.getByRole("button", { name: /Send this evidence/i }).click();

  await expect(
    page.getByRole("heading", { name: /Which explanation fits/i }),
  ).toBeVisible({ timeout: 210_000 });
  await expect(page.getByText(/Rarity hides failure/i).first()).toBeVisible();
  await page
    .getByRole("button", { name: /These two ideas make sense/i })
    .click();
  await page.getByLabel(/Expose a serious minority-class problem/i).check();
  await page.getByLabel(/Confidence/i).fill("86");
  await page.getByRole("button", { name: /Lock my answer/i }).click();

  await waitForVerifiedLiveCompile(page);
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /A high accuracy can still miss every rare event/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Verified Lab · rare-event evaluation/i),
  ).toBeVisible();

  await page.getByLabel("Decision threshold").fill("0.2");
  await page.getByLabel("Prevalence scenario").selectOption("rarer");
  await page.getByLabel("Metric focus").selectOption("recall");
  await page.getByRole("button", { name: /Run this scenario/i }).click();
  await expect(page.getByText(/Verified exploratory result/i)).toBeVisible({
    timeout: 180_000,
  });

  await page
    .getByLabel("Your revised mental model")
    .fill(
      "When positive cases are rare, compare against the majority baseline and choose class-specific metrics and a threshold that match deployment cost.",
    );
  await page.getByRole("button", { name: /Try it on defects/i }).click();
  await page.getByLabel(/Lower threshold based on missed-defect cost/i).check();
  await page.getByLabel(/Missing a defect is the costly error/i).check();
  await page.getByLabel(/Confusion matrix shows misses/i).check();
  await page.getByLabel(/Prevalence changes precision/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(page.locator(".imbalance-transfer-pass .eyebrow")).toHaveText(
    "Transfer passed",
  );

  await page.getByRole("button", { name: /Verify notebook repair/i }).click();
  await waitForVerifiedPatch({
    success: page.getByRole("heading", {
      name: /Your notebook copy passed the repair checks/i,
    }),
    failure: page.locator(".imbalance-patch-gate [role='alert']"),
    retry: page.getByRole("button", { name: /Verify notebook repair/i }),
  });
  await expect(page).toHaveURL(/\/proof\//);

  const patchDownload = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /Download repaired notebook/i })
    .click();
  const patch = await patchDownload;
  expect(patch.suggestedFilename()).toMatch(/\.counterlab-patched\.ipynb$/i);
  const patchedNotebookPath = await patch.path();
  expect(patchedNotebookPath).not.toBeNull();

  const capsuleDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: /Export Proof Capsule/i }).click();
  const capsulePath = await (await capsuleDownload).path();
  expect(capsulePath).not.toBeNull();
  await writeLiveSmokeEvidence(
    "class_imbalance",
    page,
    capsulePath!,
    patchedNotebookPath!,
  );
});
