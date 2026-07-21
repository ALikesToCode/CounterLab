import {
  currentBrowserAuthorityLabel,
  ensureRuntimeParent,
  expect,
  requiredRuntimeRoot,
  test,
  type Locator,
  type Page,
} from "./cloak-test";
import {
  ArtifactManifestSchema,
  PublicProofCapsuleRefV2Schema,
  PublicReplayProjectionV1Schema,
  PublicReplayPublicationReceiptV2Schema,
  ReasoningDiffV2Schema,
} from "@counterlab/contracts";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { FrozenWorkerReleaseManifestSchema } from "../../../scripts/frozen-worker-release.js";
import { validateSampleProofCapsuleV1 } from "@counterlab/proof-capsule/sample";
import {
  installBrowserPerformanceEvidence,
  snapshotBrowserPerformanceEvidence,
  type BrowserPerformanceEvidence,
} from "./performance-evidence";

const claim =
  "The 98 percent random split accuracy proves this model generalizes to customers it has never seen.";
const revision =
  "When rows repeat an entity, hold out whole entities and remove identity-derived features before claiming generalization.";
const prePredictionResultLanguage =
  /59\.4%|\bdeceptive\b|\bfairer test\b|\bverified result\b|\bevidence verdict\b|\bsupported hypothesis\b|\bthe fix\b|\bremove customer(?:_| )id\b|\bkeep each customer's rows together\b|\bproves?\b/i;
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

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`Public release evidence requires ${name}`);
  }
  return value;
}

async function frozenPublicReleaseManifest() {
  const root = await realpath(resolve(import.meta.dirname, "../../.."));
  const requested = requiredEnvironment(
    "COUNTERLAB_E2E_FROZEN_WORKER_MANIFEST_PATH",
  );
  const candidate = resolve(root, requested);
  const fromRoot = relative(root, candidate);
  if (
    fromRoot.startsWith("..") ||
    isAbsolute(fromRoot) ||
    (await lstat(candidate)).isSymbolicLink()
  ) {
    throw new Error("Frozen Worker manifest escaped the repository");
  }
  const physical = await realpath(candidate);
  const physicalFromRoot = relative(root, physical);
  if (physicalFromRoot.startsWith("..") || isAbsolute(physicalFromRoot)) {
    throw new Error("Frozen Worker manifest resolved outside the repository");
  }
  const bytes = await readFile(physical);
  const expectedManifestSha256 = requiredEnvironment(
    "COUNTERLAB_E2E_WORKER_ARTIFACT_MANIFEST_SHA256",
  );
  if (sha256(bytes) !== expectedManifestSha256) {
    throw new Error("Frozen Worker manifest bytes do not match the receipt");
  }
  const manifest = FrozenWorkerReleaseManifestSchema.parse(
    JSON.parse(bytes.toString("utf8")) as unknown,
  );
  const expectedClientAssetCount = Number(
    requiredEnvironment("COUNTERLAB_E2E_CLIENT_ASSET_COUNT"),
  );
  const expectedPublicAssetCount = Number(
    requiredEnvironment("COUNTERLAB_E2E_CLIENT_PUBLIC_ASSET_COUNT"),
  );
  if (
    manifest.clientAssetsSha256 !==
      requiredEnvironment("COUNTERLAB_E2E_CLIENT_ASSETS_SHA256") ||
    manifest.clientAssetCount !== expectedClientAssetCount ||
    manifest.clientPublicAssetsSha256 !==
      requiredEnvironment("COUNTERLAB_E2E_CLIENT_PUBLIC_ASSETS_SHA256") ||
    manifest.clientPublicAssetCount !== expectedPublicAssetCount
  ) {
    throw new Error("Frozen client manifest does not match the receipt");
  }
  return { manifest, manifestSha256: expectedManifestSha256 };
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
  const receipt = PublicReplayPublicationReceiptV2Schema.parse(
    publicationPayload.data?.replay,
  );
  expect(receipt.concept).toBe(concept);
  expect(Date.parse(receipt.retention.expiresAt)).toBeGreaterThan(
    Date.parse(receipt.retention.publishedAt),
  );
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
  const duplicateReceipt = PublicReplayPublicationReceiptV2Schema.parse(
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
    PublicReplayPublicationReceiptV2Schema.parse(
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
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await page.waitForLoadState("networkidle");
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

type BrowserFailureLog = {
  consoleErrors: string[];
  failedRequests: string[];
  failedResponses: string[];
  pageErrors: string[];
};

function observeBrowserFailures(page: Page): BrowserFailureLog {
  const failures: BrowserFailureLog = {
    consoleErrors: [],
    failedRequests: [],
    failedResponses: [],
    pageErrors: [],
  };
  page.on("console", (message) => {
    if (message.type() === "error") failures.consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    failures.failedRequests.push(
      `${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown failure"}`,
    );
  });
  page.on("pageerror", (error) => {
    failures.pageErrors.push(error.message);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      failures.failedResponses.push(
        `${response.status()} ${response.request().method()} ${response.url()}`,
      );
    }
  });
  return failures;
}

async function resetWithBrowserFailureObservation(
  page: Page,
): Promise<BrowserFailureLog> {
  const failures = observeBrowserFailures(page);
  await installBrowserPerformanceEvidence(page);
  await reset(page);
  await page.waitForLoadState("networkidle");
  return failures;
}

function expectWithinComprehensionBudget(
  startedAt: number,
  maximumMs: number,
  label: string,
) {
  expect(Date.now() - startedAt, label).toBeLessThanOrEqual(maximumMs);
}

function expectNoBrowserFailures(failures: BrowserFailureLog) {
  expect(
    failures,
    "browser console, page, request, and response failures",
  ).toEqual({
    consoleErrors: [],
    failedRequests: [],
    failedResponses: [],
    pageErrors: [],
  });
}

async function expectEntirelyInFirstViewport(
  page: Page,
  locator: Locator,
  label: string,
) {
  await expect(locator, label).toBeVisible();
  const viewport = page.viewportSize();
  const box = await locator.boundingBox();
  expect(viewport, `${label}: viewport`).not.toBeNull();
  expect(box, `${label}: bounding box`).not.toBeNull();
  expect(box!.x, `${label}: left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${label}: top edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label}: right edge`).toBeLessThanOrEqual(
    viewport!.width,
  );
  expect(box!.y + box!.height, `${label}: bottom edge`).toBeLessThanOrEqual(
    viewport!.height,
  );
}

async function expectBeliefBreakInFirstViewport(
  page: Page,
  surface: Locator,
  modeLabel: RegExp,
  startedAt: number,
) {
  const mechanism = surface.getByRole("region", {
    name: "Verified sample belief-break mechanism",
  });
  const comprehensionStages = [
    {
      budgetMs: 10_000,
      label: "claim and numerical belief break",
      required: [
        {
          label: "learner claim",
          locator: surface.getByText(
            /This score proves the model works for customers it has never seen/i,
          ),
        },
        {
          label: "familiar-row score",
          locator: mechanism.getByText("98.5%", { exact: true }),
        },
        {
          label: "familiar-row evaluation",
          locator: mechanism.getByText("Random-row test", { exact: true }),
        },
        {
          label: "unseen-customer score",
          locator: mechanism.getByText("59.4%", { exact: true }),
        },
        {
          label: "unseen-customer evaluation",
          locator: mechanism.getByText("New-customer test", { exact: true }),
        },
      ],
    },
    {
      budgetMs: 20_000,
      label: "changed variable and held controls",
      required: [
        {
          label: "one changed evaluation unit",
          locator: mechanism.getByText("Only the evaluation unit changed", {
            exact: true,
          }),
        },
        {
          label: "held-fixed controls",
          locator: mechanism.getByText(
            /Model, features, preprocessing, sample sizes, and seed stayed fixed/i,
          ),
        },
      ],
    },
    {
      budgetMs: 30_000,
      label: "bounded consequence, benefit, and sample authority",
      required: [
        {
          label: "fixed-sample authority label",
          locator: surface.getByText(modeLabel),
        },
        {
          label: "Boundary consequence",
          locator: mechanism.getByText("Boundary consequence", {
            exact: true,
          }),
        },
        {
          label: "bounded conclusion",
          locator: mechanism.getByText(
            /The conclusion changes when the test contains only unseen customer identities/i,
          ),
        },
        {
          label: "learner benefit",
          locator: mechanism.getByText("Learner benefit", { exact: true }),
        },
        {
          label: "deployment benefit",
          locator: mechanism.getByText(
            /Choose an evaluation that matches who will be new at deployment time/i,
          ),
        },
      ],
    },
  ] as const;

  await expect(mechanism).toBeVisible();
  for (const stage of comprehensionStages) {
    for (const required of stage.required) {
      await expectEntirelyInFirstViewport(
        page,
        required.locator,
        required.label,
      );
    }
    expectWithinComprehensionBudget(
      startedAt,
      stage.budgetMs,
      `Judge ${stage.label} must be inspectable within ${stage.budgetMs / 1_000} seconds`,
    );
  }
}

async function captureBeliefBreakScreenshot(page: Page, fileName: string) {
  const configuredDirectory =
    process.env.COUNTERLAB_E2E_BELIEF_BREAK_EVIDENCE_DIR ??
    resolve(requiredRuntimeRoot(), "evidence", "belief-break");
  const destination = await ensureRuntimeParent(
    resolve(configuredDirectory, fileName),
  );
  await page.screenshot({ path: destination, fullPage: false });
  const performance = await snapshotBrowserPerformanceEvidence(page);
  expectFirstFoldPerformanceBudgets(performance);
  const evidenceDestination = await ensureRuntimeParent(
    resolve(configuredDirectory, fileName.replace(/\.png$/u, ".json")),
  );
  await writeFile(
    evidenceDestination,
    `${JSON.stringify(
      {
        browserAuthority: currentBrowserAuthorityLabel(),
        capturedAt: new Date().toISOString(),
        performance,
        screenshot: fileName,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
}

function expectFirstFoldPerformanceBudgets(
  performance: BrowserPerformanceEvidence,
): void {
  expect(performance.support.largestContentfulPaint).toBe(true);
  expect(performance.support.cumulativeLayoutShift).toBe(true);
  expect(performance.support.firstContentfulPaint).toBe(true);
  expect(performance.support.navigationTiming).toBe(true);
  expect(performance.largestContentfulPaintMs).not.toBeNull();
  expect(performance.cumulativeLayoutShift).not.toBeNull();
  expect(performance.firstContentfulPaintMs).not.toBeNull();
  expect(performance.navigationTtfbMs).not.toBeNull();
  expect(performance.largestContentfulPaintMs!).toBeLessThanOrEqual(2_500);
  expect(performance.cumulativeLayoutShift!).toBeLessThanOrEqual(0.1);
  expect(performance.navigationTtfbMs!).toBeLessThanOrEqual(800);
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
  await page.getByRole("button", { name: /Run the fair test/i }).click();
  await expect(
    page.getByRole("heading", { name: /Compare the verified result/i }),
  ).toBeVisible();
  await authorResultInterpretation(page);
  await expect(
    page.getByRole("region", { name: /Let the verified test answer/i }),
  ).toBeVisible();
}

async function authorResultInterpretation(page: Page) {
  await page
    .getByRole("textbox", { name: /What do you notice in this comparison/i })
    .fill("The score falls when the test contains only unseen customers.");
  await expect(
    page.getByText(/Interpretation recorded locally/i),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: /Explore/i })).toBeEnabled();
  await expect(page.getByRole("tab", { name: /Boundary/i })).toBeEnabled();
}

async function selectLeakageTransferEvidence(page: Page) {
  await page.getByLabel(/Centered-window definition/i).check();
  await page.getByLabel(/Shuffled-split definition/i).check();
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
    page.getByRole("heading", {
      name: /You completed one verified entity-leakage loop/i,
    }),
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

test.describe("production release transport", () => {
  test.skip(
    process.env.COUNTERLAB_E2E_PUBLIC_ASSET_SCAN !== "1",
    "Production-only public asset evidence",
  );

  test("Loaded public release routes and assets retain security headers and contain no secrets", async ({
    page,
  }) => {
    const configuredBaseURL = process.env.COUNTERLAB_E2E_BASE_URL;
    if (configuredBaseURL === undefined || configuredBaseURL.length === 0) {
      throw new Error("Public asset evidence requires COUNTERLAB_E2E_BASE_URL");
    }
    const baseURL = new URL(configuredBaseURL);
    const { manifest, manifestSha256 } = await frozenPublicReleaseManifest();
    const publicManifestAssets = manifest.clientAssets.filter(
      (asset) => asset.publicPath !== null,
    );
    expect(publicManifestAssets).toHaveLength(manifest.clientPublicAssetCount);
    const assetResponses = new Map<
      string,
      {
        body: Uint8Array;
        cacheControl: string;
        redirectedFrom: string | null;
        status: number;
      }
    >();
    const seenAssetURLs = new Set<string>();
    const assetTasks: Promise<void>[] = [];
    page.on("response", (response) => {
      const responseURL = new URL(response.url());
      if (
        responseURL.origin !== baseURL.origin ||
        !/\.(?:css|js)$/u.test(responseURL.pathname) ||
        seenAssetURLs.has(responseURL.href)
      ) {
        return;
      }
      seenAssetURLs.add(responseURL.href);
      assetTasks.push(
        (async () => {
          const body = await response.body();
          const headers = await response.allHeaders();
          assetResponses.set(responseURL.href, {
            body,
            cacheControl: headers["cache-control"] ?? "",
            redirectedFrom: response.request().redirectedFrom()?.url() ?? null,
            status: response.status(),
          });
        })(),
      );
    });

    const requiredHeaders: Record<string, readonly string[]> = {
      "content-security-policy": [
        "default-src 'none'",
        "frame-ancestors 'none'",
        "script-src 'self'",
        "connect-src 'self'",
      ],
      "x-content-type-options": ["nosniff"],
      "x-frame-options": ["DENY"],
      "referrer-policy": ["strict-origin-when-cross-origin"],
      "permissions-policy": ["camera=()", "microphone=()", "payment=()"],
      "strict-transport-security": ["max-age=31536000"],
    };
    const routeBodies: Uint8Array[] = [];
    const routeHashes: Record<string, string> = {};
    for (const route of [
      "/",
      "/judge",
      "/new",
      "/replay/leakage-01",
      "/counterlab-release-route-that-does-not-exist",
    ]) {
      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response, `missing browser response for ${route}`).not.toBeNull();
      expect(response!.request().redirectedFrom(), route).toBeNull();
      expect(response!.ok(), route).toBe(true);
      expect(new URL(response!.url()).origin, route).toBe(baseURL.origin);
      const headers = await response!.allHeaders();
      for (const [name, requiredValues] of Object.entries(requiredHeaders)) {
        for (const requiredValue of requiredValues) {
          expect(headers[name] ?? "", `${route} ${name}`).toContain(
            requiredValue,
          );
        }
      }
      const body = await response!.body();
      routeBodies.push(body);
      routeHashes[route] = sha256(body);
    }

    await Promise.all(assetTasks);
    expect(assetResponses.size).toBeGreaterThan(0);
    for (const [url, asset] of assetResponses) {
      expect(asset.status, url).toBe(200);
      expect(asset.redirectedFrom, url).toBeNull();
      for (const directive of ["public", "max-age=31536000", "immutable"]) {
        expect(asset.cacheControl, url).toContain(directive);
      }
    }

    const exactPublicAssets = [] as Array<{
      path: string;
      publicPath: string;
      sha256: string;
      size: number;
      cacheControl: string;
    }>;
    for (const asset of publicManifestAssets) {
      const publicPath = asset.publicPath;
      if (publicPath === null) {
        throw new Error("Public client manifest contains an unfetchable entry");
      }
      const observed = await page.evaluate(async (path) => {
        const response = await fetch(path, {
          cache: "reload",
          credentials: "omit",
          redirect: "manual",
        });
        const bytes = new Uint8Array(await response.arrayBuffer());
        const digest = [
          ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
        ]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        const text = new TextDecoder().decode(bytes);
        const secretFindings = [
          /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(text)
            ? "private key"
            : null,
          /\bsk-[A-Za-z0-9_-]{24,}\b/u.test(text) ? "API credential" : null,
          /CODEX_AUTH_JSON\s*[:=]\s*["']?\{/u.test(text)
            ? "Codex credential bundle"
            : null,
          /COUNTERLAB_RUNNER_SIGNING_(?:PRIVATE_)?KEY\s*[:=]\s*["'][A-Za-z0-9_-]{32,}/u.test(
            text,
          )
            ? "runner signing value"
            : null,
        ].filter((finding): finding is string => finding !== null);
        return {
          cacheControl: response.headers.get("cache-control") ?? "",
          redirected: response.redirected,
          secretFindings,
          sha256: digest,
          size: bytes.byteLength,
          status: response.status,
          url: response.url,
        };
      }, publicPath);
      expect(observed.status, publicPath).toBe(200);
      expect(observed.redirected, publicPath).toBe(false);
      expect(new URL(observed.url).origin, publicPath).toBe(baseURL.origin);
      expect(new URL(observed.url).pathname, publicPath).toBe(publicPath);
      expect(observed.sha256, publicPath).toBe(asset.sha256);
      expect(observed.size, publicPath).toBe(asset.size);
      expect(observed.secretFindings, publicPath).toEqual([]);
      if (publicPath.startsWith("/assets/")) {
        for (const directive of ["public", "max-age=31536000", "immutable"]) {
          expect(observed.cacheControl, publicPath).toContain(directive);
        }
      }
      exactPublicAssets.push({
        path: asset.path,
        publicPath,
        sha256: observed.sha256,
        size: observed.size,
        cacheControl: observed.cacheControl,
      });
    }
    expect(exactPublicAssets).toHaveLength(manifest.clientPublicAssetCount);
    expect(
      sha256(
        JSON.stringify(
          exactPublicAssets.map(({ path, publicPath, sha256, size }) => ({
            path,
            publicPath,
            sha256,
            size,
          })),
        ),
      ),
    ).toBe(manifest.clientPublicAssetsSha256);

    const publicText = new TextDecoder().decode(
      Buffer.concat([
        ...routeBodies.map((body) => Buffer.from(body)),
        ...[...assetResponses.values()].map((asset) => Buffer.from(asset.body)),
      ]),
    );
    for (const [label, pattern] of [
      ["private key", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
      ["API credential", /\bsk-[A-Za-z0-9_-]{24,}\b/u],
      ["Codex credential bundle", /CODEX_AUTH_JSON\s*[:=]\s*["']?\{/u],
      [
        "runner signing value",
        /COUNTERLAB_RUNNER_SIGNING_(?:PRIVATE_)?KEY\s*[:=]\s*["'][A-Za-z0-9_-]{32,}/u,
      ],
    ] as const) {
      expect(publicText, label).not.toMatch(pattern);
    }

    const evidencePath = process.env.COUNTERLAB_E2E_PUBLIC_ASSET_EVIDENCE_PATH;
    if (evidencePath !== undefined && evidencePath.length > 0) {
      const destination = await ensureRuntimeParent(evidencePath);
      await writeFile(
        destination,
        `${JSON.stringify(
          {
            schemaVersion: "2",
            origin: baseURL.origin,
            workerArtifactManifestSha256: manifestSha256,
            clientDeployTreeSha256: manifest.clientAssetsSha256,
            clientDeployTreeCount: manifest.clientAssetCount,
            clientPublicAssetsSha256: manifest.clientPublicAssetsSha256,
            clientPublicAssetCount: manifest.clientPublicAssetCount,
            exactPublicAssets,
            routeHashes,
            assetCount: assetResponses.size,
            assetHashes: [...assetResponses.entries()]
              .sort(([left], [right]) => left.localeCompare(right))
              .map(([url, asset]) => ({ url, sha256: sha256(asset.body) })),
            securityHeadersVerified: Object.keys(requiredHeaders),
            publicSecretScan: "PASSED",
            browserAuthority: currentBrowserAuthorityLabel(),
          },
          null,
          2,
        )}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
    }
  });
});

const beliefBreakViewports = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

for (const viewport of beliefBreakViewports) {
  test(`${viewport.name} Landing keeps the unprimed Question and fair-test promise in the first viewport`, async ({
    page,
  }) => {
    const navigationStartedAt = Date.now();
    await page.setViewportSize(viewport);
    const failures = await resetWithBrowserFailureObservation(page);

    const skipLink = page.getByRole("link", {
      name: /Skip to main content/i,
    });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await page.keyboard.press("Tab");
    const composer = page.getByLabel("Your question or claim");
    await expect(composer).toBeFocused();
    await expectEntirelyInFirstViewport(
      page,
      composer,
      "question composer before secondary paths",
    );
    await expectEntirelyInFirstViewport(
      page,
      page.getByRole("heading", {
        name: /What result are you trying to understand/i,
      }),
      "Question-first heading",
    );
    await expectEntirelyInFirstViewport(
      page,
      page.getByText(
        /Ask a question or attach a supported notebook.*never runs its cells/i,
      ),
      "artifact safety summary",
    );

    const submit = page.getByRole("button", { name: /Test this claim/i });
    await expect(submit).toBeDisabled();
    await expectEntirelyInFirstViewport(
      page,
      submit,
      "primary Question action",
    );
    await expectEntirelyInFirstViewport(
      page,
      page.getByRole("group", { name: /Prompt starters/i }),
      "learner prompt starters",
    );
    if (viewport.width <= 620) {
      const submitBox = await submit.boundingBox();
      expect(submitBox, "mobile primary Question action bounds").not.toBeNull();
      expect(submitBox!.width).toBeGreaterThanOrEqual(130);
    }

    const preview = page.locator(
      '[data-presentation="strip"][data-result-visibility="locked"]',
    );
    await expectEntirelyInFirstViewport(
      page,
      preview,
      "pre-Prediction fair-test promise",
    );
    await expect(preview).toContainText(/Result locked until Prediction/i);
    await expect(preview).toContainText(
      /Familiar rows.*change who counts as new.*Unseen customers/i,
    );
    await expect(preview).toContainText(
      /Same model, features, preprocessing, sample size, metric, and seed/i,
    );
    await expect(page.locator("body")).not.toContainText(
      prePredictionResultLanguage,
    );
    await expect(
      page.getByRole("region", {
        name: "Verified sample belief-break mechanism",
      }),
    ).toHaveCount(0);
    expectWithinComprehensionBudget(
      navigationStartedAt,
      10_000,
      "Landing Question and fair-test promise must become inspectable within ten seconds",
    );
    await expectNoHorizontalOverflow(page);
    await captureBeliefBreakScreenshot(
      page,
      `belief-break-landing-${viewport.name}.png`,
    );
    await page.waitForLoadState("networkidle");
    expectNoBrowserFailures(failures);
  });

  test(`${viewport.name} Judge Mode shows the honest fixed-sample belief break in the first viewport`, async ({
    page,
  }) => {
    const navigationStartedAt = Date.now();
    const failures = observeBrowserFailures(page);
    await installBrowserPerformanceEvidence(page);
    await page.setViewportSize(viewport);
    await page.goto("/judge", { waitUntil: "networkidle" });
    await expect(page).toHaveURL(/\/judge$/);

    const preview = page.getByRole("complementary", {
      name: /Ten second fixed sample preview/i,
    });
    await expectBeliefBreakInFirstViewport(
      page,
      preview,
      /Completed fixed sample.*not a live result/i,
      navigationStartedAt,
    );
    await expect(
      preview.getByText(
        /Approved fixed sample framing.*No GPT-5\.6, Codex, or runner call occurs/i,
      ),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await captureBeliefBreakScreenshot(
      page,
      `belief-break-judge-${viewport.name}.png`,
    );
    await page.waitForLoadState("networkidle");
    expectNoBrowserFailures(failures);
  });

  test(`${viewport.name} sample remains unprimed before Prediction and mounts the trusted mechanism only after sealing`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const failures = await resetWithBrowserFailureObservation(page);
    await expect(
      page.getByRole("region", {
        name: "Verified sample belief-break mechanism",
      }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("59.4%");

    const startSample =
      viewport.width <= 700
        ? page.getByRole("button", {
            name: /Start verified sample lesson/i,
          })
        : page.getByRole("button", { name: /Try verified sample/i });
    await startSample.click();
    await expect(
      page.getByRole("heading", { name: /What do you think the score means/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", {
        name: "Verified sample belief-break mechanism",
      }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("59.4%");

    await page
      .getByRole("button", { name: /Compare two explanations/i })
      .click();
    await page
      .getByRole("button", { name: /Yes, this captures my view/i })
      .click();
    await expect(
      page.getByRole("heading", {
        name: /Seal what you expect before the result appears/i,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", {
        name: "Verified sample belief-break mechanism",
      }),
    ).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("59.4%");

    await page.getByLabel(/Fall materially/i).check();
    await page.getByRole("button", { name: /Seal my prediction/i }).click();
    await expect(
      page.getByRole("heading", { name: /The fair test is ready/i }),
    ).toBeVisible();
    await page.getByRole("button", { name: /Run the fair test/i }).click();
    await expect(
      page.getByRole("heading", { name: /Compare the verified result/i }),
    ).toBeVisible();
    const trustedVisual = page.locator(
      '[data-trusted-visual-id="verified_sample_belief_break_v1"]',
    );
    await expect(trustedVisual).toBeVisible();
    const trustedMechanism = trustedVisual.getByRole("region", {
      name: "Verified sample belief-break mechanism",
    });
    await expect(trustedMechanism).toBeVisible();
    await expect(
      trustedMechanism.getByText("59.4%", { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel("Pinned prediction")).toContainText(
      /falls materially/i,
    );
    await expect(
      page.getByRole("region", {
        name: "Verified sample belief-break mechanism",
      }),
    ).toHaveCount(1);
    await captureBeliefBreakScreenshot(
      page,
      `belief-break-sample-post-seal-${viewport.name}.png`,
    );
    await page.waitForLoadState("networkidle");
    expectNoBrowserFailures(failures);
  });
}

test("Judge Mode distinguishes every authority path", async ({ page }) => {
  const healthResponse = await page.request.get("/api/health");
  expect(healthResponse.ok()).toBe(true);
  const health = (await healthResponse.json()) as {
    data?: {
      liveGpt?: unknown;
      liveCodex?: unknown;
      liveKernel?: unknown;
      readiness?: unknown;
      sandbox?: unknown;
      generationFilesystemReadIsolation?: unknown;
      release?: { status?: unknown };
    };
  };
  const liveReady =
    health.data?.readiness === "ready" &&
    health.data.liveGpt === "configured" &&
    health.data.liveCodex === "configured" &&
    health.data.liveKernel === "configured" &&
    health.data.sandbox === "credential-and-privilege-boundary" &&
    health.data.generationFilesystemReadIsolation === "OS_ENFORCED" &&
    health.data.release?.status === "bound";
  await page.goto("/judge");
  await expect(page).toHaveURL(/\/judge$/);
  await expect(
    page.getByRole("heading", {
      name: /see a verified belief break in ten seconds/i,
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
      name: /see a verified belief break in ten seconds/i,
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
      await expectMinimumTarget(
        progress.getByRole("button", { name: /Step 1 of 6/i }),
      );
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
  const failures = observeBrowserFailures(page);

  await startInstant(page);
  await expect(
    page.getByRole("heading", { name: /Compare the verified result/i }),
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
  await selectLeakageTransferEvidence(page);
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

  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Your learning, before and after/i }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("status", { name: /Transfer status/i })
      .getByText(/Fixed transfer task passed/i),
  ).toBeVisible();

  await page
    .getByRole("button", { name: /Inspect fixed sample evidence/i })
    .click();
  await expect(page).toHaveURL(/\/judge#sample-evidence$/u);
  await expect(
    page.getByRole("heading", { name: /Sample Proof Capsule v1/i }),
  ).toBeVisible();
  const proofDownloadPromise = page.waitForEvent("download");
  await page
    .getByRole("link", { name: /Download Sample Proof Capsule/i })
    .click();
  const proofDownloadPath = await (await proofDownloadPromise).path();
  expect(proofDownloadPath).not.toBeNull();
  const sampleProof = await validateSampleProofCapsuleV1(
    await readFile(proofDownloadPath!),
  );
  expect(sampleProof.manifest.mode).toEqual({
    kind: "sample_lesson",
    sampleId: "leakage-01",
  });
  expect(sampleProof.manifest.calls).toEqual({
    gpt56: "not-called",
    runtimeCodex: "not-called",
    runner: "not-called",
  });
  expectNoBrowserFailures(failures);
});

test("the lesson keeps one learner decision in focus at a time", async ({
  page,
}) => {
  await startInstant(page);
  await commitAndOpenResult(page);

  await expect(
    page.getByRole("heading", { name: /Compare the verified result/i }),
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
  await selectLeakageTransferEvidence(page);
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
    page.getByRole("heading", { name: /The fair test is ready/i }),
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
  const committedPayload = await committed.json();
  expect(committedPayload.data.prediction.confidence).toBe(88);
  expect(committedPayload.data.verifiedResult).toBeUndefined();
});

test("the fixed sample keeps approved framing and can return home", async ({
  page,
}) => {
  await reset(page);
  await page.getByRole("button", { name: /Try verified sample/i }).click();

  await expect(page.getByText(/Approved sample framing/i)).toBeVisible();
  await expect(page.getByLabel("Your claim")).toHaveCount(0);
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
    page.getByRole("heading", { name: /The fair test is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Run the fair test/i }).click();
  await expect(
    page.getByRole("heading", { name: /Compare the verified result/i }),
  ).toBeVisible();
  await authorResultInterpretation(page);

  await page.reload();

  await expect(
    page.getByRole("heading", { name: /Compare the verified result/i }),
  ).toBeVisible();
  await expect(page.getByLabel("Pinned prediction")).toContainText(
    /Accuracy falls materially/i,
  );
  await expect(
    page.getByRole("region", { name: /Let the verified test answer/i }),
  ).toBeVisible();
  await authorResultInterpretation(page);

  await recordRevision(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Try your rule on forecasting/i }),
  ).toBeVisible();
  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await selectLeakageTransferEvidence(page);
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
    page.getByRole("heading", {
      name: /You completed one verified entity-leakage loop/i,
    }),
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
    page.getByRole("heading", { name: /Compare the verified result/i }),
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
    page.getByRole("heading", { name: /Compare the verified result/i }),
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
  await page.getByLabel(/Model complexity/i).check();
  await page.getByLabel(/Metric definition/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(page.getByText(/Transfer not yet passed/i)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Verify notebook patch/i }),
  ).toHaveCount(0);

  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await page.getByLabel(/Metric definition/i).uncheck();
  await selectLeakageTransferEvidence(page);
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
    page.getByLabel(/Attach a supported notebook/i),
  ).not.toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /OPENAI|GPT-|https?:\/\//i,
  );
});

test("partial generation isolation cannot expose live notebook upload", async ({
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
          liveCodex: "configured",
          liveKernel: "configured",
          readiness: "ready",
          sandbox: "credential-and-privilege-boundary",
          generationFilesystemReadIsolation: "PARTIAL",
          requestId: "e2e-health-partial-isolation",
        },
      }),
    });
  });

  await openLiveSetup(page);
  await expect(
    page.getByText(/generation filesystem read isolation is partial/i),
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
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
  const progressSummary = mobileProgress.getByRole("button", {
    name: /Step 1 of 6/i,
  });
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
    page.getByRole("heading", { name: /The fair test is ready/i }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Run the fair test/i }).focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: /Compare the verified result/i }),
  ).toBeVisible();
  const interpretation = page.getByRole("textbox", {
    name: /What do you notice in this comparison/i,
  });
  await interpretation.focus();
  await page.keyboard.type(
    "The score falls when the test contains only unseen customers.",
  );
  await expect(
    page.getByText(/Interpretation recorded locally/i),
  ).toBeVisible();

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
  await page.getByLabel(/Centered-window definition/i).focus();
  await page.keyboard.press("Space");
  await page.getByLabel(/Shuffled-split definition/i).focus();
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
    readiness: "ready",
    liveGpt: "configured",
    liveCodex: "configured",
    liveKernel: "configured",
    sandbox: "credential-and-privilege-boundary",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    release: { status: "bound" },
  });

  await openLiveSetup(page);
  await expect(
    page.getByText(/Hosted notebook runner is ready/i),
  ).toBeVisible();
  await page
    .getByLabel(/Attach a supported notebook/i)
    .setInputFiles(leakageNotebookPath);
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
    page.getByRole("heading", { name: /Compare the verified result/i }),
  ).toBeVisible();
  await authorResultInterpretation(page);
  await expect(page.getByText(/0 shared customers/i).first()).toBeVisible();

  await openTheaterView(page, "Explore");
  await page.getByLabel(/Whole entities/i).check();
  await page.getByLabel(/Remove identity feature/i).check();
  await page.getByLabel(/Test size/i).fill("0.3");
  await page.getByRole("button", { name: /Run this configuration/i }).click();
  await expect(page.getByText(/Verified exploratory result/i)).toBeVisible({
    timeout: 180_000,
  });
  await openTheaterView(page, "Boundary");
  await revealVerifiedBoundary(page);

  await openTheaterView(page, "Apply");
  await page.getByLabel("Your revised mental model").fill(revision);
  await page
    .getByRole("button", { name: /Try the rule on a new problem/i })
    .click();
  await page.getByLabel(/Time-ordered holdout/i).check();
  await page.getByLabel(/Centered rolling target/i).check();
  await selectLeakageTransferEvidence(page);
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(
    page.locator(".eyebrow", { hasText: "Transfer passed" }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Verify notebook patch/i }).click();
  await waitForVerifiedPatch({
    success: page.getByRole("button", {
      name: /Download repaired notebook/i,
    }),
    failure: page.locator(
      ".lesson-phase.live-compiler > .transfer-result[role='alert']",
    ),
    retry: page.getByRole("button", { name: /Retry protected patch/i }),
  });
  await expect(page).toHaveURL(/\/proof\//);

  const patchDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Download repaired notebook/i })
    .click();
  const patch = await patchDownload;
  expect(patch.suggestedFilename()).toMatch(/\.counterlab-patched\.ipynb$/i);
  const patchedNotebookPath = await patch.path();
  expect(patchedNotebookPath).not.toBeNull();

  const capsuleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export Proof Capsule/i }).click();
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
    readiness: "ready",
    liveGpt: "configured",
    liveCodex: "configured",
    liveKernel: "configured",
    sandbox: "credential-and-privilege-boundary",
    generationFilesystemReadIsolation: "OS_ENFORCED",
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
    .getByLabel(/Attach a supported notebook/i)
    .setInputFiles(imbalanceNotebookPath);
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
      name: /Compare the verified rare-event result/i,
    }),
  ).toBeVisible();
  await authorResultInterpretation(page);
  await expect(page.getByText(/Boundary · Verified result/i)).toBeVisible();

  await openTheaterView(page, "Explore");
  await page.getByLabel("Decision threshold").fill("0.2");
  await page.getByLabel("Prevalence scenario").selectOption("rarer");
  await page.getByLabel("Metric focus").selectOption("recall");
  await page.getByRole("button", { name: /Run this scenario/i }).click();
  await expect(page.getByText(/Verified exploratory result/i)).toBeVisible({
    timeout: 180_000,
  });
  await openTheaterView(page, "Boundary");
  await revealVerifiedBoundary(page);

  await openTheaterView(page, "Apply");
  await page
    .getByLabel("Your revised mental model")
    .fill(
      "When positive cases are rare, compare against the majority baseline and choose class-specific metrics and a threshold that match deployment cost.",
    );
  await page.getByRole("button", { name: /Try it on defects/i }).click();
  await page.getByLabel(/Reject the accuracy-only conclusion/i).check();
  await page.getByLabel(/Defect recall and PR-AUC/i).check();
  await page.getByLabel(/zero true positives/i).check();
  await page.getByLabel(/Defects are only 1%/i).check();
  await page.getByRole("button", { name: /Check transfer/i }).click();
  await expect(page.locator(".imbalance-transfer-pass .eyebrow")).toHaveText(
    "Transfer passed",
  );

  await page.getByRole("button", { name: /Verify notebook repair/i }).click();
  await waitForVerifiedPatch({
    success: page.getByRole("button", {
      name: /Download repaired notebook/i,
    }),
    failure: page.locator(".imbalance-patch-gate [role='alert']"),
    retry: page.getByRole("button", { name: /Verify notebook repair/i }),
  });
  await expect(page).toHaveURL(/\/proof\//);

  const patchDownload = page.waitForEvent("download");
  await page
    .getByRole("button", { name: /Download repaired notebook/i })
    .click();
  const patch = await patchDownload;
  expect(patch.suggestedFilename()).toMatch(/\.counterlab-patched\.ipynb$/i);
  const patchedNotebookPath = await patch.path();
  expect(patchedNotebookPath).not.toBeNull();

  const capsuleDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export Proof Capsule/i }).click();
  const capsulePath = await (await capsuleDownload).path();
  expect(capsulePath).not.toBeNull();
  await writeLiveSmokeEvidence(
    "class_imbalance",
    page,
    capsulePath!,
    patchedNotebookPath!,
  );
});
