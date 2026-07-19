import {
  ensureRuntimeParent,
  expect,
  test,
  type Locator,
  type Page,
} from "./cloak-test";
import {
  ArtifactManifestSchema,
  ProofBundleSchema,
  PublicProofCapsuleRefV2Schema,
  PublicReplayProjectionV1Schema,
  PublicReplayPublicationReceiptV1Schema,
  ReasoningDiffV2Schema,
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

function recursiveObjectKeys(value: unknown, keys = new Set<string>()) {
  if (Array.isArray(value)) {
    value.forEach((entry) => recursiveObjectKeys(entry, keys));
    return keys;
  }
  if (value === null || typeof value !== "object") return keys;
  for (const [key, child] of Object.entries(value)) {
    keys.add(key);
    recursiveObjectKeys(child, keys);
  }
  return keys;
}

async function approveExactPacketWhenRequired(page: Page): Promise<void> {
  const approval = page.getByRole("checkbox", {
    name: /reviewed the exact redacted packet/i,
  });
  if ((await approval.count()) > 0) {
    await expect(approval).toBeVisible();
    await approval.check();
  }
  await expect(
    page.getByRole("button", { name: /Send this evidence/i }),
  ).toBeEnabled();
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
  const containedDestination =
    destination === undefined || destination.length === 0
      ? null
      : await ensureRuntimeParent(destination);

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
  const reasoningDiff = ReasoningDiffV2Schema.parse(
    completedSessionPayload.data?.reasoningDiffV2,
  );
  const proofCapsuleReference = PublicProofCapsuleRefV2Schema.parse(
    completedSessionPayload.data?.proofCapsule,
  );
  expect(reasoningDiff.sessionId).toBe(sessionId);
  expect(reasoningDiff.concept).toBe(concept);
  expect(proofCapsuleReference.sessionId).toBe(sessionId);

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
  const artifactManifestEntry = capsuleEnvelope.entries?.find(
    (entry) => entry.path === "artifact-manifest.json",
  );
  if (
    typeof artifactManifestEntry?.sha256 !== "string" ||
    typeof artifactManifestEntry.content !== "string" ||
    sha256(artifactManifestEntry.content) !== artifactManifestEntry.sha256
  ) {
    throw new Error(
      "Live smoke evidence requires a hashed artifact manifest entry",
    );
  }
  const artifactManifest = ArtifactManifestSchema.parse(
    JSON.parse(artifactManifestEntry.content),
  );

  const patchedNotebook = await readFile(patchedNotebookPath);
  const parsedPatchedNotebook = JSON.parse(
    patchedNotebook.toString("utf8"),
  ) as {
    nbformat?: unknown;
    cells?: unknown;
  };
  expect(parsedPatchedNotebook.nbformat).toBe(4);
  expect(Array.isArray(parsedPatchedNotebook.cells)).toBe(true);

  const capsuleSha256 = sha256(proofCapsule);
  const patchSha256 = sha256(patchedNotebook);
  expect(capsuleSha256).toBe(proofCapsuleReference.bytesHash);
  expect(proofCapsule.byteLength).toBe(proofCapsuleReference.byteLength);

  const publicationConsent = page.getByRole("checkbox", {
    name: /I understand that the listed evidence and learner-authored text become public/i,
  });
  const publishButton = page.getByRole("button", {
    name: /Confirm and publish read-only replay/i,
  });
  await expect(publicationConsent).toBeVisible();
  await expect(publicationConsent).not.toBeChecked();
  await expect(publishButton).toBeDisabled();
  await publicationConsent.check();
  await expect(publishButton).toBeEnabled();

  const publicationResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname === `/api/sessions/${encodeURIComponent(sessionId)}/replays`
    );
  });
  await publishButton.click();
  const publicationResponse = await publicationResponsePromise;
  expect([200, 201]).toContain(publicationResponse.status());
  const publicationPayload = (await publicationResponse.json()) as {
    data?: { replay?: unknown };
  };
  const receipt = PublicReplayPublicationReceiptV1Schema.parse(
    publicationPayload.data?.replay,
  );
  expect(receipt.concept).toBe(concept);
  for (const privatePublicationKey of [
    "objectKey",
    "sourceSessionId",
    "sessionId",
    "capsuleId",
    "rootHash",
    "bytesHash",
  ]) {
    expect(recursiveObjectKeys(publicationPayload)).not.toContain(
      privatePublicationKey,
    );
  }
  await expect(
    page.getByRole("link", { name: /Open verified replay/i }),
  ).toHaveAttribute("href", `/replay/${encodeURIComponent(receipt.replayId)}`);

  const duplicatePublicationResponse = await page.request.post(
    `/api/sessions/${encodeURIComponent(sessionId)}/replays`,
    { data: {} },
  );
  expect(duplicatePublicationResponse.status()).toBe(200);
  const duplicatePublicationPayload =
    (await duplicatePublicationResponse.json()) as {
      data?: { reused?: unknown; replay?: unknown };
    };
  const duplicateReceipt = PublicReplayPublicationReceiptV1Schema.parse(
    duplicatePublicationPayload.data?.replay,
  );
  expect(duplicatePublicationPayload.data?.reused).toBe(true);
  expect(duplicateReceipt.replayId).toBe(receipt.replayId);

  const activeStatusResponse = await page.request.get(
    `/api/sessions/${encodeURIComponent(sessionId)}/replays/status`,
  );
  expect(activeStatusResponse.ok()).toBe(true);
  const activeStatusPayload = (await activeStatusResponse.json()) as {
    data?: { status?: unknown; replay?: unknown };
  };
  expect(activeStatusPayload.data?.status).toBe("active");
  expect(
    PublicReplayPublicationReceiptV1Schema.parse(
      activeStatusPayload.data?.replay,
    ).replayId,
  ).toBe(receipt.replayId);

  const replayResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}`,
  );
  expect(replayResponse.ok()).toBe(true);
  const replayPayload = (await replayResponse.json()) as { data?: unknown };
  const replay = PublicReplayProjectionV1Schema.parse(replayPayload.data);
  expect(replay.replayId).toBe(receipt.replayId);
  expect(replay.concept).toBe(concept);
  expect(replay.authority).toMatchObject({
    sourceCapsuleRootHash: proofCapsuleReference.rootHash,
    sourceCapsuleBytesHash: proofCapsuleReference.bytesHash,
    eventChainHead: proofCapsuleReference.eventChainHead,
    artifactManifestHash: reasoningDiff.authority.artifactManifestHash,
    beliefSpecHash: reasoningDiff.authority.beliefSpecHash,
    predictionHash: reasoningDiff.authority.predictionHash,
    resultHash: reasoningDiff.authority.authoritativeResultHash,
    evidenceVerdictHash: reasoningDiff.authority.evidenceVerdictHash,
    boundaryMapHash: reasoningDiff.authority.boundaryMapHash,
    boundaryReceiptHash: reasoningDiff.authority.boundaryReceiptHash,
    transferResultHash: reasoningDiff.authority.transferResultHash,
    patchResultHash: reasoningDiff.authority.patchResultHash,
    reasoningDiffHash: proofCapsuleReference.reasoningDiffHash,
  });
  expect(replay.privacy).toEqual({
    profile: "share-safe-v1",
    excluded: [
      "raw_rows",
      "notebook_bytes",
      "local_paths",
      "source_session_identifiers",
      "artifact_record_ids",
      "source_excerpts",
      "field_names",
      "patch_diff",
      "private_capsule",
      "reasoning_diff_text",
      "transfer_evidence_text",
      "event_timestamps",
      "boundary_internal_fingerprints",
    ],
  });

  const serializedReplay = JSON.stringify(replayPayload);
  const replayKeys = recursiveObjectKeys(replayPayload.data);
  for (const privateReplayKey of [
    "objectKey",
    "sourceSessionId",
    "sessionId",
    "capsuleId",
    "artifactId",
    "fileSha256",
    "fileName",
    "filename",
    "sourceExcerpt",
    "fields",
    "diff",
    "unifiedDiff",
    "patchResult",
    "jobId",
    "eventId",
    "reasoning",
    "identifiedRisks",
    "generatedAt",
    "timestamp",
    "fixtureViewHash",
    "randomPipelineFingerprint",
    "groupPipelineFingerprint",
    "scoreFingerprint",
    "pipelineFingerprint",
  ]) {
    expect(replayKeys).not.toContain(privateReplayKey);
  }
  for (const privateReplayValue of [
    sessionId,
    artifactManifest.artifactId,
    artifactManifest.fileName,
  ]) {
    expect(serializedReplay).not.toContain(privateReplayValue);
  }

  const replayCapsuleResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}/proof-capsule`,
  );
  expect(replayCapsuleResponse.status()).toBe(404);
  await expect(replayCapsuleResponse.json()).resolves.toMatchObject({
    error: { code: "REPLAY_PRIVATE_ARTIFACT_UNAVAILABLE" },
  });

  const replayPatchResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}/patched-notebook`,
  );
  expect(replayPatchResponse.status()).toBe(404);
  await expect(replayPatchResponse.json()).resolves.toMatchObject({
    error: { code: "REPLAY_PRIVATE_ARTIFACT_UNAVAILABLE" },
  });

  const ownerProofUrl = page.url();
  await page.goto(`/replay/${encodeURIComponent(receipt.replayId)}`);
  await expect(
    page.getByRole("complementary", { name: "Verified replay mode" }),
  ).toBeVisible();
  await expect(page.getByText("Private notebook withheld")).toBeVisible();
  await expect(
    page.getByText(/Full Proof Capsule export remains available only/i),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Export Proof Capsule/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Download repaired notebook/i }),
  ).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(sessionId);
  await expect(page.locator("body")).not.toContainText(
    artifactManifest.fileName,
  );
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Verified replay mode" }),
  ).toBeVisible();

  if (containedDestination !== null) {
    await writeFile(
      containedDestination,
      `${JSON.stringify(
        {
          schemaVersion: "3",
          concept,
          sessionId,
          publishedReplayId: receipt.replayId,
          sourceArtifactHash: artifactManifest.fileSha256,
          experimentIrHash: reasoningDiff.authority.experimentIrHash,
          experimentSelectionHash: reasoningDiff.authority.selectionHash,
          resultHash: replay.test.result.resultHash,
          evidenceVerdictHash: reasoningDiff.authority.evidenceVerdictHash,
          epistemicReportHash: reasoningDiff.authority.epistemicReportHash,
          boundaryMapHash: replay.boundary.result.resultHash,
          boundaryReceiptHash: reasoningDiff.authority.boundaryReceiptHash,
          transferResultHash: reasoningDiff.authority.transferResultHash,
          patchPlanHash: reasoningDiff.authority.patchPlanHash,
          patchResultHash: replay.repair.resultHash,
          patchedArtifactHash: replay.repair.patchedArtifactHash,
          patchedNotebookSha256: patchSha256,
          proofCapsuleSha256: capsuleSha256,
          proofCapsuleRootHash: proofCapsuleReference.rootHash,
          proofCapsuleBytesHash: proofCapsuleReference.bytesHash,
          proofCapsuleMediaType: proofCapsuleReference.mediaType,
          proofCapsuleIntegrityMode: proofCapsuleReference.integrity.mode,
          proofCapsuleByteLength: proofCapsuleReference.byteLength,
          reasoningDiffHash: proofCapsuleReference.reasoningDiffHash,
          eventChainHead: proofCapsuleReference.eventChainHead,
          scientificEngineSnapshotHash: engineSnapshotEntry.sha256,
          replayProjectionHash: replay.authority.projectionHash,
          ownerProofCapsuleSha256: capsuleSha256,
          ownerPatchedNotebookSha256: patchSha256,
          replayPlaybackMode: replay.playbackMode,
          replaySourceMode: replay.sourceMode,
          replayPersistedAfterRefresh: true,
          publicReplayAuthorityMatches:
            replay.authority.sourceCapsuleBytesHash === capsuleSha256 &&
            replay.repair.patchedArtifactHash ===
              reasoningDiff.authority.patchedArtifactHash,
          publicReplayPrivateArtifactsUnavailable: true,
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

  // Keep one evidence-bound public replay available for judge review while the
  // second live Subject Pack proves revocation and idempotent cleanup.
  if (concept === "entity_leakage") return;

  await page.goto(ownerProofUrl);
  const revokeButton = page.getByRole("button", {
    name: /Revoke public replay/i,
  });
  await expect(revokeButton).toBeVisible();
  const revocationResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname ===
        `/api/sessions/${encodeURIComponent(sessionId)}/replays/revoke`
    );
  });
  await revokeButton.click();
  const revocationResponse = await revocationResponsePromise;
  expect(revocationResponse.status()).toBe(200);
  await expect(revocationResponse.json()).resolves.toMatchObject({
    data: {
      replayId: receipt.replayId,
      revoked: true,
      alreadyRevoked: false,
    },
  });
  await expect(
    page.getByRole("heading", { name: /This public replay is revoked/i }),
  ).toBeVisible();
  await expect(page.getByText(/Public playback is disabled/i)).toBeVisible();

  const revokedReplayResponse = await page.request.get(
    `/api/replays/${encodeURIComponent(receipt.replayId)}`,
  );
  expect(revokedReplayResponse.status()).toBe(404);

  const revokedStatusResponse = await page.request.get(
    `/api/sessions/${encodeURIComponent(sessionId)}/replays/status`,
  );
  expect(revokedStatusResponse.ok()).toBe(true);
  await expect(revokedStatusResponse.json()).resolves.toMatchObject({
    data: {
      status: "revoked",
      replay: { replayId: receipt.replayId },
    },
  });

  const duplicateRevocationResponse = await page.request.post(
    `/api/sessions/${encodeURIComponent(sessionId)}/replays/revoke`,
    { data: {} },
  );
  expect(duplicateRevocationResponse.status()).toBe(200);
  await expect(duplicateRevocationResponse.json()).resolves.toMatchObject({
    data: { replayId: receipt.replayId, revoked: true, alreadyRevoked: true },
  });

  const republishRevokedResponse = await page.request.post(
    `/api/sessions/${encodeURIComponent(sessionId)}/replays`,
    { data: {} },
  );
  expect(republishRevokedResponse.status()).toBe(409);
  await expect(republishRevokedResponse.json()).resolves.toMatchObject({
    error: { code: "ILLEGAL_TRANSITION" },
  });
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

async function revealLandingNavigation(page: Page) {
  const toggle = page.getByRole("button", { name: "Modes" });
  if (await toggle.isVisible()) await toggle.click();
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth &&
          document.body.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectMinimumTarget(locator: Locator, minimum = 44) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.height).toBeGreaterThanOrEqual(minimum);
  expect(box!.width).toBeGreaterThanOrEqual(minimum);
}

async function openLiveSetup(page: Page, question = claim) {
  await reset(page);
  await page.getByLabel("Your question or claim").fill(question);
  await page.getByRole("button", { name: /Test this claim/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Start with evidence that matches your question/i,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Check live notebook tools/i })
    .click();
  await expect(
    page.getByRole("heading", { name: "Test my notebook" }),
  ).toBeVisible();
}

async function startInstant(page: Page) {
  await reset(page);
  await revealLandingNavigation(page);
  await page.getByRole("button", { name: /Try verified sample/i }).click();
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();
  await page.getByLabel("Your claim").fill(claim);
  await page.getByRole("button", { name: /Compare two explanations/i }).click();
  await expect(
    page.getByRole("heading", {
      name: /Does your current explanation capture what you mean/i,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Yes, this captures my view/i })
    .click();
  await expect(
    page.getByRole("heading", {
      name: /Seal what you expect before the result appears/i,
    }),
  ).toBeVisible();
}

async function commitAndOpenResult(page: Page) {
  await page.getByLabel(/Remain near 98%/i).check();
  await page.getByRole("button", { name: /Seal my prediction/i }).click();
  await expect(
    page.getByRole("heading", { name: /The result is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: /Let the verified test answer/i }),
  ).toBeVisible();
}

async function openTheaterView(
  page: Page,
  name: "Observe" | "Explore" | "Boundary" | "Apply",
) {
  const tab = page.getByRole("tab", { name: new RegExp(name, "i") });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel")).toBeVisible();
}

async function completeSampleBoundary(page: Page) {
  const applyTab = page.getByRole("tab", { name: /Apply/i });
  if (!(await applyTab.isDisabled())) return;
  await openTheaterView(page, "Boundary");
  await page.getByRole("button", { name: /Reveal the map/i }).click();
  await expect(
    page.getByRole("table", { name: /Verified Boundary Map values/i }),
  ).toBeVisible();
  await expect(applyTab).toBeEnabled();
}

async function recordRevision(page: Page) {
  await completeSampleBoundary(page);
  await openTheaterView(page, "Apply");
  await page.getByLabel("Your revised mental model").fill(revision);
  await page
    .getByRole("button", { name: /Try the rule on a new problem/i })
    .click();
  await expect(
    page.getByText(/Which evaluation design matches deployment/i),
  ).toBeVisible();
}

async function waitForSamplePatch(page: Page) {
  await expect(
    page.getByRole("heading", { name: /You can now distinguish/i }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: /Your learning, before and after/i }),
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

async function revealVerifiedBoundary(page: Page) {
  const verified = page.getByRole("heading", {
    name: /Where does the result change/i,
  });
  const hunt = page.getByRole("heading", {
    name: /Can you find a condition where the conclusion changes/i,
  });
  const retry = page.getByRole("button", {
    name: /Retry Boundary verification/i,
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page
      .getByRole("button", {
        name:
          attempt === 0 ? /Map the boundary/i : /Retry Boundary verification/i,
      })
      .click();
    await expect(verified.or(hunt).or(retry)).toBeVisible({ timeout: 180_000 });
    if (await hunt.isVisible()) {
      const huntRegion = hunt.locator("xpath=ancestor::section[1]");
      const verifiedResultHash = await huntRegion.getAttribute(
        "data-boundary-result-hash",
      );
      expect(verifiedResultHash).toMatch(/^[a-f0-9]{64}$/);
      const choices = huntRegion.getByRole("radio");
      expect(await choices.count()).toBeGreaterThanOrEqual(3);
      await choices.nth(2).check();
      await huntRegion
        .getByRole("button", { name: /Check this condition/i })
        .click();
      await expect(verified).toBeVisible({ timeout: 30_000 });
    }
    if (await verified.isVisible()) {
      const table = page.getByRole("table", {
        name: /Verified Boundary Map values/i,
      });
      await expect(table).toBeVisible();
      const cells = table.getByRole("button");
      await cells.first().focus();
      await page.keyboard.press("ArrowRight");
      await expect(cells.nth(1)).toBeFocused();
      await expect(
        page.getByText(/SHA-256 content integrity|Signing key ID/i),
      ).toBeVisible();
      return;
    }
  }

  await expect(verified).toBeVisible({ timeout: 180_000 });
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
      generationFilesystemReadIsolation?: unknown;
      release?: { status?: unknown };
    };
  };
  const liveReady =
    health.data?.liveGpt === "configured" &&
    health.data.liveCodex === "configured" &&
    health.data.liveKernel === "configured" &&
    health.data.sandbox === "credential-and-privilege-boundary" &&
    health.data.generationFilesystemReadIsolation === "PARTIAL" &&
    health.data.release?.status === "bound";
  await page.goto("/judge");
  await expect(page).toHaveURL(/\/judge$/);
  await expect(
    page.getByRole("heading", {
      name: /see a belief break in twenty seconds/i,
    }),
  ).toBeVisible();
  await expect(page.getByText("Sample lesson")).toBeVisible();
  await expect(page.getByText("Live notebook analysis")).toBeVisible();
  await expect(
    page.getByText("Verified replay", { exact: true }),
  ).toBeVisible();
  if (liveReady) {
    await expect(page.getByRole("link", { name: /run live/i })).toHaveAttribute(
      "href",
      "/new",
    );
  } else {
    await expect(
      page.getByText(/live authority is unavailable/i),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /run live/i })).toHaveCount(0);
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
      name: "What result are you trying to understand?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/No account needed.*never run the cells/i),
  ).toBeVisible();
  await expect(page.getByLabel("Your question or claim")).toBeInViewport();
  await expect(page.getByLabel("Attach notebook")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Test this claim/i }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Try verified sample/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Watch verified replay/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /Judge Mode/i })).toHaveAttribute(
    "href",
    "/judge",
  );
  const skipLink = page.getByRole("link", { name: /Skip to main content/i });
  await expect(skipLink).toHaveAttribute("href", "#main-content");
  await skipLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();

  const visibleWords = (await page.locator("body").innerText())
    .trim()
    .split(/\s+/).length;
  expect(visibleWords).toBeLessThan(190);
  await expect(page.locator("body")).not.toContainText(
    /formalize|discriminating|canonical|mutation/i,
  );
});

for (const viewport of [
  { name: "wide desktop", width: 1440, height: 900 },
  { name: "compact desktop", width: 1280, height: 720 },
  { name: "mobile", width: 390, height: 844 },
] as const) {
  test(`${viewport.name} keeps the question and canonical progress accessible`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await reset(page);
    await revealLandingNavigation(page);

    const question = page.getByLabel("Your question or claim");
    await expect(question).toHaveAccessibleName("Your question or claim");
    await expect(
      page.getByRole("button", { name: /Try verified sample/i }),
    ).toBeVisible();
    await expectMinimumTarget(
      page.getByRole("button", { name: /Try verified sample/i }),
    );
    await expectMinimumTarget(page.getByRole("link", { name: /Judge Mode/i }));
    await expect(page.getByText("No account needed")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: /Try verified sample/i }).click();
    await expect(
      page.getByRole("heading", { name: /What do you think the score means/i }),
    ).toBeVisible();
    if (viewport.width <= 700) {
      const progress = page.getByTestId("learner-progress-mobile");
      await expect(progress).toBeVisible();
      await expect(progress).toContainText("Step 1 of 6");
      await expectMinimumTarget(progress.locator("summary"));
    } else {
      const progress = page.getByRole("navigation", {
        name: "Learner progress",
      });
      await expect(progress).toBeVisible();
      await expect(progress).toContainText("Question");
      await expect(progress).toContainText("Repair");
    }
    await expectNoHorizontalOverflow(page);

    const typography = await page.evaluate(() => ({
      body: Number.parseFloat(getComputedStyle(document.body).fontSize),
      secondary: Number.parseFloat(
        getComputedStyle(
          document.querySelector(".screen-intro p:last-child") ?? document.body,
        ).fontSize,
      ),
    }));
    expect(typography.body).toBeGreaterThanOrEqual(15);
    expect(typography.secondary).toBeGreaterThanOrEqual(13);
  });
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
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toHaveCount(0);

  const sessionId = await page.evaluate(() =>
    window.localStorage.getItem("counterlab.sessionId"),
  );
  expect(sessionId).toMatch(/^session_/);

  await commitAndOpenResult(page);
  await expect(page.getByText("59.4%").first()).toBeVisible();
  await openTheaterView(page, "Explore");
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
  await waitForSamplePatch(page);

  const patchDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download repaired notebook", exact: true })
    .click();
  const patchDownload = await patchDownloadPromise;
  expect(patchDownload.suggestedFilename()).toMatch(/\.ipynb$/i);
  expect(await patchDownload.path()).not.toBeNull();

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download proof record", exact: true })
    .click();
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

  await completeSampleBoundary(page);
  await openTheaterView(page, "Apply");
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
  await waitForSamplePatch(page);
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(24);
  await expect(page.locator("pre.diff")).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download proof record", exact: true }),
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
  await page.getByRole("button", { name: /Seal my prediction/i }).click();
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
  await page.getByRole("button", { name: /Try verified sample/i }).click();

  await page.getByRole("button", { name: /Use a starter claim/i }).click();
  await expect(page.getByLabel("Your claim")).toHaveValue(/new customers/i);
  await expect(
    page.getByRole("button", { name: /Compare two explanations/i }),
  ).toBeEnabled();

  await page.getByRole("button", { name: /Start over/i }).click();
  await expect(
    page.getByRole("heading", {
      name: "What result are you trying to understand?",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() =>
      window.localStorage.getItem("counterlab.sessionId"),
    ),
  ).toBeNull();
});

test("refresh restores the question and confirmed Prediction phases", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Try verified sample/i }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();

  await page.getByLabel("Your claim").fill(claim);
  await page.getByRole("button", { name: /Compare two explanations/i }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: /Does your current explanation capture what you mean/i,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Yes, this captures my view/i })
    .click();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: /Seal what you expect before the result appears/i,
    }),
  ).toBeVisible();
});

test("refresh restores the current lesson and the committed prediction", async ({
  page,
}) => {
  await startInstant(page);
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: /Seal what you expect before the result appears/i,
    }),
  ).toBeVisible();
  await page.getByLabel(/Fall materially/i).check();
  await page.getByLabel(/Confidence/i).fill("88");
  await page.getByRole("button", { name: /Seal my prediction/i }).click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /The result is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show me what happened/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Pinned prediction")).toContainText(
    /Accuracy falls materially/i,
  );
  await expect(
    page.getByRole("region", { name: /Let the verified test answer/i }),
  ).toBeVisible();

  await recordRevision(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Try your rule on forecasting/i }),
  ).toBeVisible();
  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /You applied the rule correctly/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Verify notebook patch/i }).click();
  await waitForSamplePatch(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /You can now distinguish/i }),
  ).toBeVisible();
});

test("a rejected test releases no result and remains recoverable after refresh", async ({
  page,
}) => {
  await page.route("**/api/sessions/*/lab/compile", async (route) => {
    await route.fulfill({
      status: 409,
      contentType: "application/json",
      body: JSON.stringify({
        ok: false,
        error: {
          code: "TEST_REJECTED",
          message:
            "The frozen verifier rejected the proposed test. No result was released.",
          status: 409,
          retryable: true,
        },
        requestId: "e2e-rejected-test",
      }),
    });
  });

  await startInstant(page);
  await page.getByLabel(/Fall materially/i).check();
  await page.getByRole("button", { name: /Seal my prediction/i }).click();
  await expect(page.getByRole("alert")).toContainText(
    /No result was released/i,
  );
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toHaveCount(0);

  const sessionId = await page.evaluate(() =>
    window.localStorage.getItem("counterlab.sessionId"),
  );
  const stored = await page.request.get(`/api/sessions/${sessionId}`);
  expect(stored.ok()).toBe(true);
  expect((await stored.json()).data.verifiedResult).toBeUndefined();

  await page.reload();
  await expect(
    page.getByRole("heading", { name: /The fair test is ready/i }),
  ).toBeVisible();
  await expect(page.getByText(/has not released a result yet/i)).toBeVisible();
});

test("local hints and Theater views never request a model or new result", async ({
  page,
}) => {
  await startInstant(page);
  await commitAndOpenResult(page);

  const authorityRequests: string[] = [];
  page.on("request", (request) => {
    const path = new URL(request.url()).pathname;
    if (
      path.includes("/belief-test") ||
      path.endsWith("/lab/compile") ||
      path.endsWith("/lab/run")
    ) {
      authorityRequests.push(path);
    }
  });

  for (const view of ["Explore", "Observe"] as const) {
    await openTheaterView(page, view);
    await expect(page.getByRole("tabpanel")).toHaveCount(1);
  }
  await completeSampleBoundary(page);
  await openTheaterView(page, "Apply");
  await openTheaterView(page, "Observe");
  await expect(page.getByRole("tab", { name: /Observe/i })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByRole("img", {
      name: /Verified accuracy comparison.*familiar rows.*new customers/i,
    }),
  ).toBeVisible();

  const hint = page.getByLabel("Contextual help");
  await hint.getByText("Need a hint?").click();
  await expect(hint.getByRole("link")).toBeVisible();
  expect(authorityRequests).toEqual([]);
});

test("completed lesson steps open as read-only pages", async ({ page }) => {
  await startInstant(page);
  await commitAndOpenResult(page);

  await page.getByRole("button", { name: "Review Prediction" }).click();
  await expect(
    page.getByRole("heading", { name: /Review your prediction/i }),
  ).toBeVisible();
  await expect(page.getByText(/saved evidence is read-only/i)).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);

  await page.getByRole("button", { name: /Return to current step/i }).click();
  await expect(
    page.getByRole("heading", { name: /Here.s what changed/i }),
  ).toBeVisible();
  await expect(page.locator("#learner-progress")).toBeFocused();
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

test("Replay remains visibly labelled and read-only after refresh", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Watch verified replay/i }).click();
  const replayBanner = page.getByLabel("Legacy replay status");
  await expect(replayBanner).toContainText(
    "Verified replay · read-only stored evidence",
  );
  await expect(
    page.getByRole("heading", {
      name: /Inspect the result without changing its history/i,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: /Stored fixed-kernel comparison/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue replay/i }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Show me what happened/i }),
  ).toHaveCount(0);

  await page.reload();
  await expect(page.getByLabel("Legacy replay status")).toContainText(
    "Verified replay · read-only stored evidence",
  );
  await expect(
    page.getByRole("heading", {
      name: /Inspect the result without changing its history/i,
    }),
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
          generationFilesystemReadIsolation: "PARTIAL",
          requestId: "e2e-health-missing",
        },
      }),
    });
  });
  await openLiveSetup(page);
  await expect(
    page.getByText(/Live notebook lessons are not set up/i),
  ).toBeVisible();
  await expect(page.getByText(/Nothing was sent/i)).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /OPENAI|GPT-|https?:\/\//i,
  );
});

test("configured reasoning cannot start without a qualified hosted runner", async ({
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
          generationFilesystemReadIsolation: "PARTIAL",
          requestId: "e2e-health",
        },
      }),
    });
  });
  await openLiveSetup(page);

  await expect(
    page.getByText(/Notebook lesson tools are ready to try/i),
  ).toBeVisible();
  await expect(
    page.getByText(/qualified hosted runner is needed/i),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with my notebook/i }),
  ).not.toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /OPENAI|GPT-|https?:\/\//i,
  );
});

test("unsupported notebooks are parsed without execution and cannot advance", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Try verified sample/i }).click();
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

  const modes = page.getByRole("button", { name: "Modes" });
  await modes.focus();
  await page.keyboard.press("Enter");
  await expect(modes).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(modes).toHaveAttribute("aria-expanded", "false");
  await expect(modes).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(modes).toHaveAttribute("aria-expanded", "true");

  const tryInstant = page.getByRole("button", {
    name: /Try verified sample/i,
  });
  await tryInstant.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /What do you think the score means/i }),
  ).toBeVisible();

  const mobileProgress = page.getByTestId("learner-progress-mobile");
  await expect(mobileProgress).toContainText("Step 1 of 6");
  const progressSummary = mobileProgress.locator("summary");
  await progressSummary.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("navigation", { name: "All learner stages" }),
  ).toBeVisible();
  await page.keyboard.press("Space");

  const hint = page.getByLabel("Contextual help").getByText("Need a hint?");
  await hint.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByLabel("Contextual help").getByRole("link"),
  ).toBeVisible();

  const claimInput = page.getByLabel("Your claim");
  await claimInput.focus();
  await page.keyboard.type(claim);
  await page.getByRole("button", { name: /Compare two explanations/i }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("button", { name: /Yes, this captures my view/i })
    .focus();
  await page.keyboard.press("Enter");

  await page.getByLabel(/Fall materially/i).focus();
  await page.keyboard.press("Space");
  await page.getByRole("button", { name: /Seal my prediction/i }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /The result is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Show me what happened/i }).focus();
  await page.keyboard.press("Enter");

  const comparison = page.getByRole("img", {
    name: /Verified accuracy comparison.*familiar rows.*new customers/i,
  });
  await expect(comparison).toBeVisible();
  const observeTab = page.getByRole("tab", { name: /Observe/i });
  await observeTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Explore/i })).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Boundary/i })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toContainText(
    /Verified sample boundary/i,
  );
  await page.getByRole("button", { name: /Reveal the map/i }).click();
  await expect(
    page.getByRole("table", { name: /Verified Boundary Map values/i }),
  ).toBeVisible();
  await page.getByRole("tab", { name: /Boundary/i }).focus();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Apply/i })).toBeFocused();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await expect(page.getByRole("tabpanel")).toHaveCount(1);

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
  await waitForSamplePatch(page);
  const motionDurations = await page
    .locator('[data-motion="reduced-safe"]')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).animationDuration),
    );
  expect(
    motionDurations.every((duration) =>
      duration.split(",").every((value) => Number.parseFloat(value) <= 0.01),
    ),
  ).toBe(true);
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
    sandbox: "credential-and-privilege-boundary",
    generationFilesystemReadIsolation: "PARTIAL",
    release: { status: "bound" },
  });

  await openLiveSetup(page);
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
  await approveExactPacketWhenRequired(page);
  await page.getByRole("button", { name: /Send this evidence/i }).click();

  await expect(
    page.getByRole("heading", {
      name: /Does your current explanation capture what you mean/i,
    }),
  ).toBeVisible({ timeout: 210_000 });
  const hypotheses = page.getByRole("region", { name: "Model duel" });
  await expect(
    hypotheses.getByRole("article", { name: "Your current explanation" }),
  ).toBeVisible();
  await expect(
    hypotheses.getByRole("article", {
      name: "Alternative CounterLab will test",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Yes, this captures my view/i })
    .click();
  await page.getByLabel(/Remain near 98%/i).check();
  await page.getByLabel(/Prediction confidence/i).fill("84");
  await page.getByRole("button", { name: /Seal my prediction/i }).click();

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
  await revealVerifiedBoundary(page);

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
    success: page.getByRole("link", {
      name: /Download repaired notebook/i,
    }),
    failure: page.locator(
      ".lesson-phase.live-compiler > .transfer-result[role='alert']",
    ),
    retry: page.getByRole("button", { name: /Retry protected patch/i }),
  });
  await expect(page).toHaveURL(/\/proof\//);

  const patchDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download repaired notebook/i }).click();
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
    sandbox: "credential-and-privilege-boundary",
    generationFilesystemReadIsolation: "PARTIAL",
    release: { status: "bound" },
  });

  await openLiveSetup(
    page,
    "The 99 percent accuracy proves this fraud classifier catches the rare cases that matter.",
  );
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
  await approveExactPacketWhenRequired(page);
  await page.getByRole("button", { name: /Send this evidence/i }).click();

  await expect(
    page.getByRole("heading", {
      name: /Does your current explanation capture what you mean/i,
    }),
  ).toBeVisible({ timeout: 210_000 });
  await expect(
    page.getByRole("article", {
      name: "Alternative CounterLab will test",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Yes, this captures my view/i })
    .click();
  await page.getByLabel(/Expose a serious minority-class problem/i).check();
  await page.getByLabel(/Prediction confidence/i).fill("86");
  await page.getByRole("button", { name: /Seal my prediction/i }).click();

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
  await revealVerifiedBoundary(page);

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
    success: page.getByRole("link", {
      name: /Download repaired notebook/i,
    }),
    failure: page.locator(".imbalance-patch-gate [role='alert']"),
    retry: page.getByRole("button", { name: /Verify notebook repair/i }),
  });
  await expect(page).toHaveURL(/\/proof\//);

  const patchDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: /Download repaired notebook/i }).click();
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
