import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { RELEASE_CHECK_IDS } from "../packages/scientific-engine-registry/src/schema.js";
import { canonicalJson } from "../packages/session-core/src/index.js";
import { createGenerationIsolationEvidence } from "./generation-isolation-evidence.js";
import {
  REQUIRED_CLOAK_JOURNEY_IDS,
  REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS,
} from "./submission-publication-evidence.js";
import {
  SubmissionPackageSchema,
  type EvidenceReader,
  validateSubmissionPackage,
} from "./validate-submission-package.js";

const root = resolve(import.meta.dirname, "..");

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function bytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    typeof value === "string" ? value : JSON.stringify(value),
  );
}

function reference(path: string, content: Uint8Array) {
  return { path, sha256: hash(content) };
}

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function joinBytes(parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(data.byteLength + 12);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.byteLength, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(
    8 + data.byteLength,
    pngCrc32(joinBytes([typeBytes, data])),
    false,
  );
  return chunk;
}

function pngFixture(
  width: number,
  height: number,
  discriminator: number,
): Uint8Array {
  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false);
  headerView.setUint32(4, height, false);
  header.set([8, 0, 0, 0, 0], 8);
  const scanlines = new Uint8Array(height * (width + 1));
  scanlines[1] = discriminator;
  return joinBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array(deflateSync(scanlines))),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function pngHeaderOnlyFixture(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  header.set([8, 0, 0, 0, 0], 8);
  return joinBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
  ]);
}

function undecodablePngFixture(width: number, height: number): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  header.set([8, 0, 0, 0, 0], 8);
  return joinBytes([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", new Uint8Array([1, 2, 3, 4])),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

async function draftInput(): Promise<unknown> {
  return JSON.parse(
    await readFile(resolve(root, "docs/SUBMISSION_PACKAGE.json"), "utf8"),
  );
}

const repositoryReader: EvidenceReader = async (entry) =>
  new Uint8Array(await readFile(resolve(root, entry.path)));

function isolationEvidence(input: {
  sourceCommit: string;
  sourceTreeSha256: string;
  localImageTag: string;
  localImageDigest: string;
  verifiedAt: string;
}) {
  const probePayload = {
    schemaVersion: "1",
    probeVersion: "counterlab-generation-isolation-v1",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: [
      "entrypoint",
      "non-root-user",
      "immutable-paths",
      "codex",
      "python",
      "bubblewrap",
      "bubblewrap-read-isolation",
      "setpriv",
      "writable-roots",
    ],
    generationFilesystemReadIsolation: "OS_ENFORCED",
    bubblewrapVersion: "0.11.0",
    bubblewrap: {
      forbiddenHostPathsHidden: true,
      parentEnvironmentHidden: true,
      workspaceVisible: true,
      workspaceWritable: true,
    },
  } as const;
  return createGenerationIsolationEvidence({
    ...input,
    imageUser: "10001:10001",
    startupProbe: {
      status: "ready",
      service: probePayload.service,
      probe: probePayload.probe,
      checks: probePayload.checks,
      generationFilesystemReadIsolation:
        probePayload.generationFilesystemReadIsolation,
      generationIsolationProbe: probePayload,
      generationIsolationProbeSha256: hash(bytes(canonicalJson(probePayload))),
    },
  });
}

function releaseEvidenceChain(
  options: Readonly<{ qualificationDay?: "2026-07-18" | "2026-07-19" }> = {},
) {
  const qualificationDay = options.qualificationDay ?? "2026-07-19";
  const worker = "a".repeat(40);
  const runner = "b".repeat(40);
  const sourceTreeSha256 = "8".repeat(64);
  const localImageDigest = `sha256:${"d".repeat(64)}`;
  const registryDigest = `sha256:${"c".repeat(64)}`;
  const adapterImageDigest = `sha256:${"5".repeat(64)}`;
  const localImageTag = `counterlab-runner:git-${runner}`;
  const adapterImageTag = `counterlab-adapter:git-${runner}`;
  const qualifiedIsolation = isolationEvidence({
    sourceCommit: runner,
    sourceTreeSha256,
    localImageTag,
    localImageDigest,
    verifiedAt: `${qualificationDay}T00:00:10.000Z`,
  });
  const qualified = {
    schemaVersion: "6",
    status: "VERIFIED",
    sourceCommit: runner,
    sourceArchiveSha256: "0".repeat(64),
    sourceTreeSha256,
    dockerfileSha256: "1".repeat(64),
    localImageTag,
    localImageDigest,
    ociRevision: runner,
    ociSourceTreeSha256: sourceTreeSha256,
    engineAuthorityHash: "2".repeat(64),
    runtimeManifestHash: "3".repeat(64),
    runtimeToolchainSha256: "4".repeat(64),
    runtimePolicySha256: "5".repeat(64),
    proofDependencyManifestSha256: "6".repeat(64),
    toolchainLockSha256: "7".repeat(64),
    runtimeAdapterSha256: "8".repeat(64),
    buildctlSha256: "9".repeat(64),
    buildkitdSha256: "a".repeat(64),
    buildkitConfigSha256: "b".repeat(64),
    adapterDockerfileSha256: "c".repeat(64),
    adapterImageTag,
    adapterImageDigest,
    adapterManifestDigest: `sha256:${"6".repeat(64)}`,
    adapterOciArchiveSha256: "d".repeat(64),
    adapterOciRevision: runner,
    adapterOciSourceTreeSha256: sourceTreeSha256,
    limitMode: "container-cgroup-and-process-rlimit",
    aggregateLimitIntentEnforced: true,
    aggregateLimitEvidenceSha256: "e".repeat(64),
    timeoutCleanupReceipt: "evidence/timeout-cleanup-receipt.json",
    timeoutCleanupReceiptSha256: "f".repeat(64),
    timeoutCleanupPayloadSha256: "0".repeat(64),
    timeoutRunControlReceiptSha256: "1".repeat(64),
    timeoutRootlessReceiptSha256: "2".repeat(64),
    timeoutRuntimeSessionId: "rt-12345678",
    timeoutVerifiedAt: `${qualificationDay}T00:00:20.000Z`,
    evidenceCommit: worker,
    registryImage: `registry.cloudflare.com/account/counterlab-runner:git-${runner}`,
    registryDigest,
    registryResolvedAt: `${qualificationDay}T00:00:30.000Z`,
    qualifiedAt: `${qualificationDay}T00:01:00.000Z`,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationEvidence: qualifiedIsolation.evidence,
    generationIsolationEvidenceSha256: qualifiedIsolation.evidenceSha256,
    generationIsolationProbeSha256: qualifiedIsolation.probeSha256,
    generationIsolationVerifiedAt: qualifiedIsolation.evidence.verifiedAt,
    verifierVersion: "counterlab-release-v6",
  } as const;
  const qualifiedBytes = bytes(qualified);
  const freshIsolation = isolationEvidence({
    sourceCommit: runner,
    sourceTreeSha256,
    localImageTag,
    localImageDigest,
    verifiedAt: "2026-07-19T00:01:30.000Z",
  });
  const releaseCheck = {
    schemaVersion: "5",
    status: "PASSED",
    evidenceCommit: worker,
    sourceCommit: runner,
    qualifiedRunnerReceiptSha256: hash(qualifiedBytes),
    qualifiedAt: qualified.qualifiedAt,
    runnerImageTag: localImageTag,
    runnerImageDigest: localImageDigest,
    adapterImageTag,
    adapterImageDigest,
    registryDigest,
    runtimeToolchainSha256: qualified.runtimeToolchainSha256,
    runtimePolicySha256: qualified.runtimePolicySha256,
    proofDependencyManifestSha256: qualified.proofDependencyManifestSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
    runtimeAdapterSha256: qualified.runtimeAdapterSha256,
    checks: RELEASE_CHECK_IDS.map((id) => ({ id, status: "PASSED" as const })),
    checkedAt: "2026-07-19T00:02:00.000Z",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationEvidenceSha256:
      qualified.generationIsolationEvidenceSha256,
    generationIsolationProbeSha256: qualified.generationIsolationProbeSha256,
    generationIsolationVerifiedAt: qualified.generationIsolationVerifiedAt,
    releaseCheckGenerationIsolationEvidence: freshIsolation.evidence,
    releaseCheckGenerationIsolationEvidenceSha256:
      freshIsolation.evidenceSha256,
    releaseCheckGenerationIsolationProbeSha256: freshIsolation.probeSha256,
    releaseCheckGenerationIsolationVerifiedAt:
      freshIsolation.evidence.verifiedAt,
    verifierVersion: "counterlab-release-check-v5",
  } as const;
  const releaseCheckBytes = bytes(releaseCheck);
  const receipt = {
    schemaVersion: "7",
    status: "DEPLOYED",
    workerName: "counterlab",
    productionOrigin: "https://counterlab.cserules.workers.dev",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationEvidenceSha256:
      qualified.generationIsolationEvidenceSha256,
    generationIsolationProbeSha256: qualified.generationIsolationProbeSha256,
    generationIsolationVerifiedAt: qualified.generationIsolationVerifiedAt,
    releaseCheckGenerationIsolationEvidenceSha256:
      releaseCheck.releaseCheckGenerationIsolationEvidenceSha256,
    releaseCheckGenerationIsolationProbeSha256:
      releaseCheck.releaseCheckGenerationIsolationProbeSha256,
    releaseCheckGenerationIsolationVerifiedAt:
      releaseCheck.releaseCheckGenerationIsolationVerifiedAt,
    workerEvidenceCommit: worker,
    runnerSourceCommit: runner,
    qualifiedRunnerReceiptSha256: hash(qualifiedBytes),
    releaseCheckReceiptSha256: hash(releaseCheckBytes),
    releaseCheckCheckedAt: releaseCheck.checkedAt,
    timeoutCleanupReceiptSha256: qualified.timeoutCleanupReceiptSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
    runtimeToolchainSha256: qualified.runtimeToolchainSha256,
    runtimePolicySha256: qualified.runtimePolicySha256,
    proofDependencyManifestSha256: qualified.proofDependencyManifestSha256,
    runtimeAdapterSha256: qualified.runtimeAdapterSha256,
    adapterImageDigest,
    workerVersionId: "11111111-2222-3333-4444-555555555555",
    workerTag: `git-${worker}`,
    workerMessage: `CounterLab Worker ${worker}; runner ${runner}`,
    containerApplicationId: "container-app-1",
    containerApplicationVersion: "3",
    containerImage: `registry.cloudflare.com/account/counterlab-runner@${registryDigest}`,
    containerState: "active",
    containerImageDigest: registryDigest,
    workerArtifactClassification: "PROCESS_BOUND_PARTIAL",
    workerArtifactManifestSha256: "f".repeat(64),
    deployConfigSha256: "6".repeat(64),
    workerBundleSha256: "7".repeat(64),
    clientAssetsSha256: "8".repeat(64),
    clientAssetCount: 9,
    clientPublicAssetsSha256: "9".repeat(64),
    clientPublicAssetCount: 7,
    viteVersion: "8.1.4",
    wranglerVersion: "4.110.0",
    dryRunSha256: "7".repeat(64),
    dryRunFileCount: 1,
    deploymentStatusSha256: "a".repeat(64),
    workerVersionSha256: "b".repeat(64),
    containerStatusSha256: "c".repeat(64),
    deployedAt: "2026-07-19T00:03:00.000Z",
    verifierVersion: "counterlab-deployment-v7",
  } as const;
  return {
    qualified,
    qualifiedBytes,
    releaseCheck,
    releaseCheckBytes,
    receipt,
  };
}

function productionSmoke(
  receipt: ReturnType<typeof releaseEvidenceChain>["receipt"],
  deploymentReceiptSha256: string,
) {
  const stages = [
    ["public-readiness", "control_plane", undefined],
    ["capability-health", "control_plane", undefined],
    ["public-secret-scan", "control_plane", undefined],
    ["judge-mode", "control_plane", undefined],
    ["sample-lesson", "sample", undefined],
    ["verified-replay", "replay", undefined],
    ["hosted-capsule-replay", "replay", "entity_leakage"],
    ["live-leakage", "live_notebook", "entity_leakage"],
    ["live-imbalance", "live_notebook", "class_imbalance"],
  ] as const;
  return {
    schemaVersion: "6",
    status: "PASSED",
    baseUrl: receipt.productionOrigin,
    startedAt: "2026-07-19T00:04:00.000Z",
    completedAt: "2026-07-19T00:14:00.000Z",
    deployment: {
      workerVersion: receipt.workerVersionId,
      workerEvidenceCommit: receipt.workerEvidenceCommit,
      runnerSourceCommit: receipt.runnerSourceCommit,
      containerImageDigest: receipt.containerImageDigest,
      deploymentReceiptSha256,
      timeoutCleanupReceiptSha256: receipt.timeoutCleanupReceiptSha256,
      runtimePolicySha256: receipt.runtimePolicySha256,
      proofDependencyManifestSha256: receipt.proofDependencyManifestSha256,
      aggregateLimitEvidenceSha256: receipt.aggregateLimitEvidenceSha256,
      workerArtifactClassification: receipt.workerArtifactClassification,
      workerArtifactManifestSha256: receipt.workerArtifactManifestSha256,
      workerBundleSha256: receipt.workerBundleSha256,
      clientAssetsSha256: receipt.clientAssetsSha256,
      clientAssetCount: receipt.clientAssetCount,
      clientPublicAssetsSha256: receipt.clientPublicAssetsSha256,
      clientPublicAssetCount: receipt.clientPublicAssetCount,
      viteVersion: receipt.viteVersion,
      wranglerVersion: receipt.wranglerVersion,
      generationIsolationEvidenceSha256:
        receipt.generationIsolationEvidenceSha256,
      generationIsolationProbeSha256: receipt.generationIsolationProbeSha256,
      generationIsolationVerifiedAt: receipt.generationIsolationVerifiedAt,
      releaseCheckGenerationIsolationEvidenceSha256:
        receipt.releaseCheckGenerationIsolationEvidenceSha256,
      releaseCheckGenerationIsolationProbeSha256:
        receipt.releaseCheckGenerationIsolationProbeSha256,
      releaseCheckGenerationIsolationVerifiedAt:
        receipt.releaseCheckGenerationIsolationVerifiedAt,
    },
    stages: stages.map(([id, mode, concept], index) => ({
      id,
      mode,
      ...(concept === undefined ? {} : { concept }),
      status: "PASSED",
      startedAt: `2026-07-19T00:${String(index + 4).padStart(2, "0")}:00.000Z`,
      completedAt: `2026-07-19T00:${String(index + 5).padStart(2, "0")}:00.000Z`,
      evidence: { verified: true },
    })),
    privacy: {
      containsSecrets: false,
      containsRawNotebookBytes: false,
      containsPrivateReasoning: false,
    },
  } as const;
}

async function readyPackage(
  options: Parameters<typeof releaseEvidenceChain>[0] = {},
) {
  const input = SubmissionPackageSchema.parse(await draftInput());
  const evidence = new Map<string, Uint8Array>();
  for (const entry of [
    input.copy.devpostCopy,
    input.copy.readme,
    input.copy.license.evidence,
    input.publicProduct.capabilityManifest,
    input.video.script,
    input.video.captions,
    input.impact.aggregate,
  ]) {
    evidence.set(entry.path, await repositoryReader(entry));
  }
  const addEvidence = (path: string, content: Uint8Array) => {
    evidence.set(path, content);
    return reference(path, content);
  };
  const chain = releaseEvidenceChain(options);
  const { receipt } = chain;
  const receiptBytes = bytes(receipt);
  const deploymentReceiptSha256 = hash(receiptBytes);
  const evidenceRoot = `docs/submission-evidence/${deploymentReceiptSha256}`;
  const assetRoot = `docs/submission-assets/${deploymentReceiptSha256}`;
  const qualifiedRef = addEvidence(
    `${evidenceRoot}/qualified-runner-release.json`,
    chain.qualifiedBytes,
  );
  const releaseCheckRef = addEvidence(
    `${evidenceRoot}/release-check-receipt.json`,
    chain.releaseCheckBytes,
  );
  const receiptRef = addEvidence(
    `${evidenceRoot}/deployment-receipt.json`,
    receiptBytes,
  );
  const smokeRef = addEvidence(
    `${evidenceRoot}/production-smoke.json`,
    bytes(productionSmoke(receipt, receiptRef.sha256)),
  );
  const checkedAt = "2026-07-21T10:00:00.000Z";
  const publicationRelease = {
    deploymentReceiptSha256,
    productionOrigin: receipt.productionOrigin,
    workerEvidenceCommit: receipt.workerEvidenceCommit,
    runnerSourceCommit: receipt.runnerSourceCommit,
    containerImageDigest: receipt.containerImageDigest,
    workerVersionId: receipt.workerVersionId,
  } as const;
  const publicationPrivacy = {
    containsSecrets: false,
    containsRawNotebook: false,
    containsPersonalData: false,
  } as const;
  const receiptBase = {
    schemaVersion: "1",
    status: "VERIFIED",
    checkedAt,
    release: publicationRelease,
    privacy: publicationPrivacy,
  } as const;
  const repositoryEvidence = addEvidence(
    `${evidenceRoot}/repository-access.json`,
    bytes({
      ...receiptBase,
      kind: "repository-access",
      repositoryUrl: input.repository.url,
      accessMode: "PUBLIC",
      loggedOutChecked: true,
      loggedOutStatusCode: 200,
      authenticatedJudgeStatusCode: 200,
      finalUrl: input.repository.url,
      anonymousAccessible: true,
      judgeAccessVerified: true,
      sharedJudgeAddresses: [],
    }),
  );
  const videoUrl = "https://youtu.be/CLabDemo123";
  const videoEvidence = addEvidence(
    `${evidenceRoot}/video-verification.json`,
    bytes({
      ...receiptBase,
      kind: "video-verification",
      publicUrl: videoUrl,
      durationSeconds: 165,
      audioPresent: true,
      codexRoleCovered: true,
      gpt56RoleCovered: true,
      loggedOutPlayable: true,
      statusCode: 200,
      scriptSha256: input.video.script.sha256,
      captionsSha256: input.video.captions.sha256,
    }),
  );
  const feedbackSessionId = "019f6069-2af2-7132-8181-d313081884c8";
  const feedbackEvidence = addEvidence(
    `${evidenceRoot}/feedback-session.json`,
    bytes({
      ...receiptBase,
      kind: "feedback-session",
      sessionId: feedbackSessionId,
      source: "codex-feedback",
      verifiedByOwner: true,
      contentCaptured: false,
    }),
  );
  const browserViewports = [
    "375x812",
    "390x844",
    "768x1024",
    "1280x720",
    "1366x768",
    "1440x900",
    "1920x1080",
  ] as const;
  const browserVersion = "CloakBrowser Chromium 140.0.0.0";
  const journeyEvidence = REQUIRED_CLOAK_JOURNEY_IDS.map((id, index) => {
    const viewport = browserViewports[index % browserViewports.length]!;
    const durationMs = 1_000 + index;
    const sequence = String(index + 1).padStart(2, "0");
    const evidenceReference = addEvidence(
      `${evidenceRoot}/cloakbrowser-journeys/${sequence}.json`,
      bytes({
        ...receiptBase,
        kind: "cloakbrowser-journey-evidence",
        authority: "CLOAKBROWSER",
        id,
        viewport,
        journeyStatus: "PASSED",
        attempt: 0,
        durationMs,
        assertionCount: 3,
        consoleErrors: 0,
        failedRequests: 0,
      }),
    );
    return {
      id,
      evidence: evidenceReference,
      journey: {
        id,
        status: "PASSED",
        attempt: 0,
        durationMs,
        viewport,
        evidenceSha256: evidenceReference.sha256,
      },
    };
  });
  const journeys = journeyEvidence.map((entry) => entry.journey);
  const browserReport = addEvidence(
    `${evidenceRoot}/cloakbrowser-playwright-report.json`,
    bytes({
      schemaVersion: "1",
      kind: "cloakbrowser-execution-report",
      status: "PASSED",
      checkedAt,
      authority: "CLOAKBROWSER",
      baseUrl: receipt.productionOrigin,
      release: publicationRelease,
      privacy: publicationPrivacy,
      browserVersion,
      playwrightVersion: "1.61.1",
      journeys,
      failures: 0,
      skips: 0,
      retries: 0,
      consoleErrors: 0,
      failedRequests: 0,
    }),
  );
  const manualEvidenceEntries = REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS.map(
    (check) => {
      const evidenceReference = addEvidence(
        `${evidenceRoot}/cloakbrowser-manual/${check}.json`,
        bytes({
          ...receiptBase,
          kind: "cloakbrowser-manual-evidence",
          authority: "CLOAKBROWSER",
          check,
          observationCount: 3,
          artifactSha256: hash(bytes(`manual-artifact-${check}`)),
        }),
      );
      return [check, evidenceReference] as const;
    },
  );
  const manualEvidenceReferences = Object.fromEntries(manualEvidenceEntries);
  const manualEvidence = Object.fromEntries(
    manualEvidenceEntries.map(([check, evidenceReference]) => [
      check,
      { status: "PASSED", evidenceSha256: evidenceReference.sha256 },
    ]),
  );
  const browserEvidenceIndex = addEvidence(
    `${evidenceRoot}/cloakbrowser-evidence-index.json`,
    bytes({
      ...receiptBase,
      kind: "cloakbrowser-evidence-index",
      executionReportSha256: browserReport.sha256,
      manual: manualEvidence,
    }),
  );
  const browserEvidence = addEvidence(
    `${evidenceRoot}/cloakbrowser-qualification.json`,
    bytes({
      ...receiptBase,
      kind: "cloakbrowser-qualification",
      authority: "CLOAKBROWSER",
      baseUrl: receipt.productionOrigin,
      exactReleaseBound: true,
      journeyCount: 40,
      viewports: browserViewports,
      browserVersion,
      playwrightVersion: "1.61.1",
      playwrightReportSha256: browserReport.sha256,
      browserEvidenceIndexSha256: browserEvidenceIndex.sha256,
      journeys,
      desktopComplete: true,
      mobileComplete: true,
      keyboardComplete: true,
      screenReaderNamesComplete: true,
      reducedMotionComplete: true,
      noHorizontalOverflow: true,
      zoom200Complete: true,
      longContentComplete: true,
      narrowVisualizationsComplete: true,
      touchTargetsComplete: true,
      requiredSkips: 0,
      failures: 0,
      consoleErrors: 0,
      failedRequests: 0,
      webVitals: { lcpMs: 1_200, cls: 0.02, inpMs: 90 },
    }),
  );
  const publicLinkEvidence = addEvidence(
    `${evidenceRoot}/public-link-audit.json`,
    bytes({
      ...receiptBase,
      kind: "public-link-audit",
      loggedOut: true,
      links: [
        {
          role: "judge",
          url: input.publicProduct.judgeUrl,
          statusCode: 200,
          finalUrl: input.publicProduct.judgeUrl,
        },
        {
          role: "repository",
          url: input.repository.url,
          statusCode: 200,
          finalUrl: input.repository.url,
        },
        {
          role: "video",
          url: videoUrl,
          statusCode: 200,
          finalUrl: videoUrl,
        },
      ],
    }),
  );
  const assetNames = [
    "01-judge-belief-break-1440x900.png",
    "02-live-prediction-and-authority-1440x900.png",
    "03-theater-boundary-1440x900.png",
    "04-transfer-repair-proof-1440x900.png",
    "thumbnail-judge-belief-break.png",
  ] as const;
  const imageAssets = assetNames.map((fileName, index) => {
    const viewport =
      fileName === "thumbnail-judge-belief-break.png"
        ? { width: 1_200, height: 675 }
        : { width: 1_440, height: 900 };
    return {
      fileName,
      viewport,
      image: addEvidence(
        `${assetRoot}/${fileName}`,
        pngFixture(viewport.width, viewport.height, index + 1),
      ),
    };
  });
  const firstImageSha256 = imageAssets[0]!.image.sha256;
  const assets = imageAssets.map(({ fileName, image, viewport }) => ({
    fileName,
    image,
    provenance: addEvidence(
      `${assetRoot}/${fileName}.json`,
      bytes({
        ...receiptBase,
        kind: "screenshot-provenance",
        fileName,
        imageSha256: image.sha256,
        publicUrl: input.publicProduct.judgeUrl,
        route: input.publicProduct.freeTestPath,
        viewport,
        capturedAt: "2026-07-21T09:55:00.000Z",
        authority: "CLOAKBROWSER",
        consoleErrors: 0,
        failedRequests: 0,
        derivedFromSha256:
          fileName === "thumbnail-judge-belief-break.png"
            ? firstImageSha256
            : null,
      }),
    ),
  }));
  const ready = {
    ...input,
    submissionState: "READY_TO_SUBMIT" as const,
    competition: {
      ...input.competition,
      submitterType: "Individual",
      country: "India",
    },
    release: {
      workerEvidenceCommit: receipt.workerEvidenceCommit,
      runnerSourceCommit: receipt.runnerSourceCommit,
      containerImageDigest: receipt.containerImageDigest,
      workerVersionId: receipt.workerVersionId,
      qualifiedRunnerReceipt: qualifiedRef,
      releaseCheckReceipt: releaseCheckRef,
      deploymentReceipt: receiptRef,
      productionSmoke: smokeRef,
    },
    repository: {
      ...input.repository,
      accessMode: "PUBLIC" as const,
      accessEvidence: repositoryEvidence,
    },
    video: {
      ...input.video,
      publicUrl: videoUrl,
      durationSeconds: 165,
      audioPresent: true,
      codexRoleCovered: true,
      gpt56RoleCovered: true,
      verificationEvidence: videoEvidence,
    },
    feedback: {
      sessionId: feedbackSessionId,
      evidence: feedbackEvidence,
    },
    browserQualification: {
      authority: "CLOAKBROWSER" as const,
      exactReleaseBound: true,
      desktopComplete: true,
      mobileComplete: true,
      requiredSkips: 0,
      failures: 0,
      consoleErrors: 0,
      failedRequests: 0,
      playwrightReport: browserReport,
      evidenceIndex: browserEvidenceIndex,
      journeyEvidence: journeyEvidence.map(({ id, evidence }) => ({
        id,
        evidence,
      })),
      manualEvidence: manualEvidenceReferences,
      evidence: browserEvidence,
    },
    assets,
    publicLinkAudit: {
      loggedOut: true,
      checkedAt,
      evidence: publicLinkEvidence,
    },
  };
  return {
    ready,
    evidence,
    reader: async (entry: { path: string }) => {
      const content = evidence.get(entry.path);
      if (content === undefined) throw new Error("missing test evidence");
      return content;
    },
  };
}

async function submittedPackage() {
  const { ready, evidence } = await readyPackage();
  const deploymentReceipt = ready.release.deploymentReceipt;
  const deploymentReceiptSha256 = deploymentReceipt.sha256;
  const evidenceRoot = `docs/submission-evidence/${deploymentReceiptSha256}`;
  const release = {
    deploymentReceiptSha256,
    productionOrigin: "https://counterlab.cserules.workers.dev",
    workerEvidenceCommit: ready.release.workerEvidenceCommit,
    runnerSourceCommit: ready.release.runnerSourceCommit,
    containerImageDigest: ready.release.containerImageDigest,
    workerVersionId: ready.release.workerVersionId,
  } as const;
  const privacy = {
    containsSecrets: false,
    containsRawNotebook: false,
    containsPersonalData: false,
  } as const;
  const publicSlug = "counterlab-scientific-debugger";
  const publicUrl = `https://devpost.com/software/${publicSlug}`;
  const submittedAt = "2026-07-21T23:30:00.000Z";
  const addEvidence = (path: string, content: Uint8Array) => {
    evidence.set(path, content);
    return reference(path, content);
  };
  const receipt = addEvidence(
    `${evidenceRoot}/devpost-submission.json`,
    bytes({
      schemaVersion: "1",
      kind: "devpost-submission",
      status: "SUBMITTED",
      capturedAt: "2026-07-21T23:31:00.000Z",
      hackathonId: ready.competition.hackathonId,
      projectId: ready.competition.projectId,
      category: ready.competition.category,
      publicSlug,
      publicUrl,
      submittedAt,
      release,
      copy: {
        devpostCopySha256: ready.copy.devpostCopy.sha256,
        readmeSha256: ready.copy.readme.sha256,
        videoScriptSha256: ready.video.script.sha256,
        captionsSha256: ready.video.captions.sha256,
      },
      privacy,
    }),
  );
  const postSubmitLoggedOutEvidence = addEvidence(
    `${evidenceRoot}/post-submit-link-audit.json`,
    bytes({
      schemaVersion: "1",
      kind: "post-submit-link-audit",
      status: "VERIFIED",
      checkedAt: "2026-07-21T23:32:00.000Z",
      release,
      privacy,
      loggedOut: true,
      links: [
        {
          role: "judge",
          url: ready.publicProduct.judgeUrl,
          statusCode: 200,
          finalUrl: ready.publicProduct.judgeUrl,
        },
        {
          role: "repository",
          url: ready.repository.url,
          statusCode: 200,
          finalUrl: ready.repository.url,
        },
        {
          role: "video",
          url: ready.video.publicUrl,
          statusCode: 200,
          finalUrl: ready.video.publicUrl,
        },
        {
          role: "devpost",
          url: publicUrl,
          statusCode: 200,
          finalUrl: publicUrl,
        },
      ],
    }),
  );
  const submitted = {
    ...ready,
    submissionState: "SUBMITTED" as const,
    officialSubmission: {
      state: "SUBMITTED" as const,
      publicSlug,
      submittedAt,
      receipt,
      postSubmitLoggedOutEvidence,
    },
  };
  return {
    submitted,
    evidence,
    reader: async (entry: { path: string }) => {
      const content = evidence.get(entry.path);
      if (content === undefined) throw new Error("missing test evidence");
      return content;
    },
  };
}

describe("submission package validator", () => {
  it("validates the honest current draft and all checked-in hashes", async () => {
    const result = await validateSubmissionPackage(
      await draftInput(),
      "draft",
      repositoryReader,
    );

    expect(result.submissionState).toBe("DRAFT");
    expect(result.impact.status).toBe("NO_DATA");
    expect(result.officialSubmission.state).toBe("NOT_SUBMITTED");
  });

  it("fails readiness for the current external and release blockers", async () => {
    await expect(
      validateSubmissionPackage(await draftInput(), "ready", repositoryReader),
    ).rejects.toThrow(/failed \d+ gate/iu);
  });

  it("accepts a fully typed publication-ready fixture", async () => {
    const { ready, reader } = await readyPackage();

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ submissionState: "READY_TO_SUBMIT" });
  });

  it("accepts a fully typed submitted fixture captured before the deadline", async () => {
    const { submitted, reader } = await submittedPackage();

    await expect(
      validateSubmissionPackage(submitted, "submitted", reader, {
        now: new Date("2026-07-22T01:00:00.000Z"),
      }),
    ).resolves.toMatchObject({
      submissionState: "SUBMITTED",
      officialSubmission: { state: "SUBMITTED" },
    });
  });

  it("rejects generic JSON in place of a typed publication receipt", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const generic = bytes({ status: "VERIFIED" });
    const path = ready.repository.accessEvidence!.path;
    evidence.set(path, generic);
    ready.repository.accessEvidence = reference(path, generic);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining(["repository access evidence is invalid"]),
    });
  });

  it("rejects text bytes presented as a PNG screenshot", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const asset = ready.assets[0]!;
    const fakePng = bytes("not a screenshot");
    evidence.set(asset.image.path, fakePng);
    asset.image = reference(asset.image.path, fakePng);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        `screenshot ${asset.fileName} is not a valid PNG`,
      ]),
    });
  });

  it("rejects a checksum-valid PNG header without image data or an end chunk", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const asset = ready.assets[0]!;
    const headerOnly = pngHeaderOnlyFixture(1_440, 900);
    evidence.set(asset.image.path, headerOnly);
    asset.image = reference(asset.image.path, headerOnly);
    const provenanceBytes = evidence.get(asset.provenance.path);
    if (provenanceBytes === undefined)
      throw new Error("missing screenshot provenance");
    const provenance = JSON.parse(
      new TextDecoder().decode(provenanceBytes),
    ) as { imageSha256: string };
    provenance.imageSha256 = asset.image.sha256;
    const changedProvenance = bytes(provenance);
    evidence.set(asset.provenance.path, changedProvenance);
    asset.provenance = reference(asset.provenance.path, changedProvenance);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        `screenshot ${asset.fileName} is not a valid PNG`,
      ]),
    });
  });

  it("rejects checksum-valid PNG chunks with undecodable image data", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const asset = ready.assets[0]!;
    const undecodable = undecodablePngFixture(1_440, 900);
    evidence.set(asset.image.path, undecodable);
    asset.image = reference(asset.image.path, undecodable);
    const provenanceBytes = evidence.get(asset.provenance.path);
    if (provenanceBytes === undefined)
      throw new Error("missing screenshot provenance");
    const provenance = JSON.parse(
      new TextDecoder().decode(provenanceBytes),
    ) as { imageSha256: string };
    provenance.imageSha256 = asset.image.sha256;
    const changedProvenance = bytes(provenance);
    evidence.set(asset.provenance.path, changedProvenance);
    asset.provenance = reference(asset.provenance.path, changedProvenance);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        `screenshot ${asset.fileName} is not a valid PNG`,
      ]),
    });
  });

  it("rejects a public link that redirects to an unrelated destination", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const auditRef = ready.publicLinkAudit.evidence!;
    const current = evidence.get(auditRef.path);
    if (current === undefined) throw new Error("missing public-link audit");
    const audit = JSON.parse(new TextDecoder().decode(current)) as {
      links: Array<{ role: string; finalUrl: string }>;
    };
    audit.links[0]!.finalUrl = "https://example.com/unrelated";
    const changed = bytes(audit);
    evidence.set(auditRef.path, changed);
    ready.publicLinkAudit.evidence = reference(auditRef.path, changed);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "public-link audit judge final destination does not match",
      ]),
    });
  });

  it("rejects publication evidence dated before production smoke completed", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const accessRef = ready.repository.accessEvidence!;
    const current = evidence.get(accessRef.path);
    if (current === undefined) throw new Error("missing repository receipt");
    const access = JSON.parse(new TextDecoder().decode(current)) as {
      checkedAt: string;
    };
    access.checkedAt = "2026-07-18T10:00:00.000Z";
    const changed = bytes(access);
    evidence.set(accessRef.path, changed);
    ready.repository.accessEvidence = reference(accessRef.path, changed);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "repository access predates production release completion",
      ]),
    });
  });

  it("rejects a non-success repository access receipt", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const accessRef = ready.repository.accessEvidence!;
    const current = evidence.get(accessRef.path);
    if (current === undefined) throw new Error("missing repository receipt");
    const access = JSON.parse(new TextDecoder().decode(current)) as {
      authenticatedJudgeStatusCode: number;
    };
    access.authenticatedJudgeStatusCode = 599;
    const changed = bytes(access);
    evidence.set(accessRef.path, changed);
    ready.repository.accessEvidence = reference(accessRef.path, changed);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining(["repository access evidence is invalid"]),
    });
  });

  it("rejects CloakBrowser evidence with duplicate journey identities", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const browserRef = ready.browserQualification.evidence!;
    const current = evidence.get(browserRef.path);
    if (current === undefined) throw new Error("missing browser receipt");
    const browser = JSON.parse(new TextDecoder().decode(current)) as {
      journeys: Array<{ id: string }>;
    };
    browser.journeys[1]!.id = browser.journeys[0]!.id;
    const changed = bytes(browser);
    evidence.set(browserRef.path, changed);
    ready.browserQualification.evidence = reference(browserRef.path, changed);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "CloakBrowser qualification evidence is invalid",
      ]),
    });
  });

  it("binds screenshot roles by file name instead of manifest order", async () => {
    const { ready, reader } = await readyPackage();
    ready.assets = [ready.assets[4]!, ...ready.assets.slice(0, 4)];

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ submissionState: "READY_TO_SUBMIT" });
  });

  it("rejects a Devpost receipt for a different public slug", async () => {
    const { submitted, reader, evidence } = await submittedPackage();
    const receiptRef = submitted.officialSubmission.receipt;
    const current = evidence.get(receiptRef.path);
    if (current === undefined) throw new Error("missing Devpost receipt");
    const receipt = JSON.parse(new TextDecoder().decode(current)) as {
      publicSlug: string;
      publicUrl: string;
    };
    receipt.publicSlug = "different-counterlab-project";
    receipt.publicUrl = `https://devpost.com/software/${receipt.publicSlug}`;
    const changed = bytes(receipt);
    evidence.set(receiptRef.path, changed);
    submitted.officialSubmission.receipt = reference(receiptRef.path, changed);

    await expect(
      validateSubmissionPackage(submitted, "submitted", reader, {
        now: new Date("2026-07-22T01:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "Devpost submission receipt does not match the package",
      ]),
    });
  });

  it("rejects a noncanonical Devpost project URL", async () => {
    const { submitted, reader, evidence } = await submittedPackage();
    const receiptRef = submitted.officialSubmission.receipt;
    const current = evidence.get(receiptRef.path);
    if (current === undefined) throw new Error("missing Devpost receipt");
    const receipt = JSON.parse(new TextDecoder().decode(current)) as {
      publicSlug: string;
      publicUrl: string;
    };
    receipt.publicUrl = `https://devpost.com/showcase/${receipt.publicSlug}`;
    const changed = bytes(receipt);
    evidence.set(receiptRef.path, changed);
    submitted.officialSubmission.receipt = reference(receiptRef.path, changed);

    await expect(
      validateSubmissionPackage(submitted, "submitted", reader, {
        now: new Date("2026-07-22T01:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "Devpost submission receipt does not match the package",
      ]),
    });
  });

  it("rejects a submission timestamp equal to the deadline", async () => {
    const { submitted, reader } = await submittedPackage();
    submitted.officialSubmission.submittedAt = submitted.competition.deadline;

    await expect(
      validateSubmissionPackage(submitted, "submitted", reader, {
        now: new Date("2026-07-22T01:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "official submission timestamp is at or after the deadline",
      ]),
    });
  });

  it("rejects a qualification older than 24 hours at deployment", async () => {
    const { ready, reader } = await readyPackage({
      qualificationDay: "2026-07-18",
    });

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "qualified runner evidence is stale at deployment",
      ]),
    });
  });

  it("rejects individually valid receipts with a broken qualified hash edge", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const releaseCheckBytes = evidence.get(
      ready.release.releaseCheckReceipt!.path,
    );
    if (releaseCheckBytes === undefined) {
      throw new Error("missing release-check fixture");
    }
    const releaseCheck = JSON.parse(
      new TextDecoder().decode(releaseCheckBytes),
    ) as { qualifiedRunnerReceiptSha256: string };
    releaseCheck.qualifiedRunnerReceiptSha256 = "f".repeat(64);
    const changedReleaseCheck = bytes(releaseCheck);
    const changedReleaseCheckPath = ready.release.releaseCheckReceipt!.path;
    evidence.set(changedReleaseCheckPath, changedReleaseCheck);
    ready.release.releaseCheckReceipt = reference(
      changedReleaseCheckPath,
      changedReleaseCheck,
    );

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "release chain qualified receipt hash in release check does not match",
      ]),
    });
  });

  it("rejects deployment timeout evidence that drifts from qualification", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const qualifiedBytes = evidence.get(
      ready.release.qualifiedRunnerReceipt!.path,
    );
    if (qualifiedBytes === undefined) {
      throw new Error("missing qualified runner fixture");
    }
    const qualified = JSON.parse(new TextDecoder().decode(qualifiedBytes)) as {
      timeoutCleanupReceiptSha256: string;
    };
    qualified.timeoutCleanupReceiptSha256 = "0".repeat(64);
    const changedQualified = bytes(qualified);
    const changedQualifiedPath = ready.release.qualifiedRunnerReceipt!.path;
    evidence.set(changedQualifiedPath, changedQualified);
    ready.release.qualifiedRunnerReceipt = reference(
      changedQualifiedPath,
      changedQualified,
    );

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "release chain deployed timeout-cleanup receipt does not match",
      ]),
    });
  });

  it("rejects fresh isolation evidence for a different source tree", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const releaseCheckBytes = evidence.get(
      ready.release.releaseCheckReceipt!.path,
    );
    if (releaseCheckBytes === undefined) {
      throw new Error("missing release-check fixture");
    }
    const releaseCheck = JSON.parse(
      new TextDecoder().decode(releaseCheckBytes),
    ) as {
      sourceCommit: string;
      runnerImageTag: string;
      runnerImageDigest: string;
      releaseCheckGenerationIsolationEvidence: unknown;
      releaseCheckGenerationIsolationEvidenceSha256: string;
      releaseCheckGenerationIsolationProbeSha256: string;
      releaseCheckGenerationIsolationVerifiedAt: string;
    };
    const wrongTreeIsolation = isolationEvidence({
      sourceCommit: releaseCheck.sourceCommit,
      sourceTreeSha256: "7".repeat(64),
      localImageTag: releaseCheck.runnerImageTag,
      localImageDigest: releaseCheck.runnerImageDigest,
      verifiedAt: releaseCheck.releaseCheckGenerationIsolationVerifiedAt,
    });
    releaseCheck.releaseCheckGenerationIsolationEvidence =
      wrongTreeIsolation.evidence;
    releaseCheck.releaseCheckGenerationIsolationEvidenceSha256 =
      wrongTreeIsolation.evidenceSha256;
    releaseCheck.releaseCheckGenerationIsolationProbeSha256 =
      wrongTreeIsolation.probeSha256;
    const changedReleaseCheck = bytes(releaseCheck);
    const changedReleaseCheckPath = ready.release.releaseCheckReceipt!.path;
    evidence.set(changedReleaseCheckPath, changedReleaseCheck);
    ready.release.releaseCheckReceipt = reference(
      changedReleaseCheckPath,
      changedReleaseCheck,
    );

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "release chain release-check isolation source tree does not match",
      ]),
    });
  });

  it("rejects the former minimal synthetic production smoke", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const minimal = bytes({
      schemaVersion: "6",
      status: "PASSED",
      baseUrl: "https://counterlab.cserules.workers.dev",
      deployment: {
        workerVersion: ready.release.workerVersionId,
        workerEvidenceCommit: ready.release.workerEvidenceCommit,
        runnerSourceCommit: ready.release.runnerSourceCommit,
        containerImageDigest: ready.release.containerImageDigest,
        deploymentReceiptSha256: ready.release.deploymentReceipt!.sha256,
      },
    });
    const path = ready.release.productionSmoke!.path;
    evidence.set(path, minimal);
    ready.release.productionSmoke = reference(path, minimal);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.stringMatching(/valid qualified.*smoke chain/iu),
      ]),
    });
  });

  it("rejects private fields inside production-smoke evidence", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const current = evidence.get(ready.release.productionSmoke!.path);
    if (current === undefined) throw new Error("missing strict smoke fixture");
    const smoke = JSON.parse(new TextDecoder().decode(current)) as {
      stages: Array<{ evidence: Record<string, unknown> }>;
    };
    smoke.stages[0]!.evidence = { token: "redacted" };
    const privateSmoke = bytes(smoke);
    const path = ready.release.productionSmoke!.path;
    evidence.set(path, privateSmoke);
    ready.release.productionSmoke = reference(path, privateSmoke);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.stringMatching(/valid qualified.*smoke chain/iu),
      ]),
    });
  });

  it("rejects prefixed serialized raw-notebook content in smoke evidence", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const current = evidence.get(ready.release.productionSmoke!.path);
    if (current === undefined) throw new Error("missing strict smoke fixture");
    const smoke = JSON.parse(new TextDecoder().decode(current)) as {
      stages: Array<{ evidence: Record<string, unknown> }>;
    };
    smoke.stages[0]!.evidence = {
      note: 'captured: {"nbformat":4,"cells":[]}',
    };
    const privateSmoke = bytes(smoke);
    const path = ready.release.productionSmoke!.path;
    evidence.set(path, privateSmoke);
    ready.release.productionSmoke = reference(path, privateSmoke);

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        expect.stringMatching(/valid qualified.*smoke chain/iu),
      ]),
    });
  });

  it("binds every validation mode to one exact package state", async () => {
    const draft = await draftInput();
    await expect(
      validateSubmissionPackage(draft, "ready", repositoryReader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "ready validation requires submissionState READY_TO_SUBMIT",
      ]),
    });

    const { ready, reader } = await readyPackage();
    await expect(
      validateSubmissionPackage(ready, "draft", reader),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "draft validation requires submissionState DRAFT",
      ]),
    });
  });

  it("rejects readiness at or after the competition deadline", async () => {
    const { ready, reader } = await readyPackage();

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-22T00:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "ready package cannot be verified at or after the deadline",
      ]),
    });
  });

  it("rejects release evidence dated after the validation instant", async () => {
    const { ready, reader } = await readyPackage();

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-19T00:10:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "release evidence is dated in the future",
      ]),
    });
  });

  it("hashes and parses each unique evidence file from one immutable read", async () => {
    const calls = new Map<string, number>();
    const reader: EvidenceReader = async (entry) => {
      const count = (calls.get(entry.path) ?? 0) + 1;
      calls.set(entry.path, count);
      if (count > 1) return bytes({ replacedAfterHash: true });
      return repositoryReader(entry);
    };

    await expect(
      validateSubmissionPackage(await draftInput(), "draft", reader),
    ).resolves.toMatchObject({ submissionState: "DRAFT" });
    expect(Math.max(...calls.values())).toBe(1);
  });

  it("loads every release and browser evidence role exactly once", async () => {
    const { ready, reader } = await readyPackage();
    const calls = new Map<string, number>();
    const immutableReader: EvidenceReader = async (entry) => {
      const count = (calls.get(entry.path) ?? 0) + 1;
      calls.set(entry.path, count);
      if (count > 1) return bytes({ replacedAfterHash: true });
      return reader(entry);
    };

    await expect(
      validateSubmissionPackage(ready, "ready", immutableReader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ submissionState: "READY_TO_SUBMIT" });
    expect(calls.size).toBeGreaterThan(60);
    expect(Math.max(...calls.values())).toBe(1);
  });

  it("uses the canonical learner-pilot schema", async () => {
    const input = SubmissionPackageSchema.parse(await draftInput());
    const qualifiedReleaseReceiptSha256 = "a".repeat(64);
    const invalidImpact = bytes({
      schemaVersion: "2",
      status: "DESCRIPTIVE_ONLY",
      analyzedAt: "2026-07-21T10:00:00.000Z",
      qualifiedReleaseReceiptSha256,
      participantCount: 1,
      completedSessionCount: 1,
      metrics: {},
      limitations: [
        "Results are descriptive pilot observations, not causal estimates or proof of mastery.",
      ],
    });
    input.impact = {
      status: "DESCRIPTIVE_ONLY",
      aggregate: reference("docs/LEARNER_PILOT_RESULTS.json", invalidImpact),
      qualifiedReleaseReceiptSha256,
    };
    const reader: EvidenceReader = async (entry) =>
      entry.path === input.impact.aggregate.path
        ? invalidImpact
        : repositoryReader(entry);

    await expect(
      validateSubmissionPackage(input, "draft", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining(["impact aggregate is invalid"]),
    });
  });

  it("binds descriptive learner evidence to the deployed qualified receipt", async () => {
    const { ready, reader, evidence } = await readyPackage();
    const wrongQualifiedReceiptSha256 = "e".repeat(64);
    const aggregate = bytes({
      schemaVersion: "2",
      status: "DESCRIPTIVE_ONLY",
      analyzedAt: "2026-07-21T10:00:00.000Z",
      qualifiedReleaseReceiptSha256: wrongQualifiedReceiptSha256,
      participantCount: 1,
      completedSessionCount: 1,
      metrics: {
        completionRate: 1,
        taskCount: 1,
        firstUnassistedTransferPassRate: 1,
        predictionDifferenceRate: 0,
        confusionObservedRate: 0,
        confusionCategoryCounts: {
          navigation: 0,
          prediction_meaning: 0,
          test_rationale: 0,
          boundary_interpretation: 0,
          transfer_choice: 0,
          repair_scope: 0,
          proof_interpretation: 0,
          other_no_detail: 0,
        },
        abandonmentRate: 0,
        medianTaskDurationSeconds: 120,
        reactions: {
          clarity: {
            clearer: 1,
            unchanged: 0,
            less_clear: 0,
            declined: 0,
          },
          usefulness: {
            useful: 1,
            neutral: 0,
            not_useful: 0,
            declined: 0,
          },
        },
        abandonmentReasons: {
          participant_withdrew: 0,
          accessibility_barrier: 0,
          technical_failure: 0,
          time_limit: 0,
          facilitator_stopped: 0,
          other_no_detail: 0,
        },
        byConcept: {
          entity_leakage: {
            tasks: 1,
            firstUnassistedTransferPassed: 1,
            predictionDifferedFromResult: 0,
            confusionObserved: 0,
          },
          class_imbalance: {
            tasks: 0,
            firstUnassistedTransferPassed: 0,
            predictionDifferedFromResult: 0,
            confusionObserved: 0,
          },
        },
      },
      limitations: [
        "Results are descriptive pilot observations, not causal estimates or proof of mastery.",
      ],
    });
    const path = "docs/LEARNER_PILOT_RESULTS.json";
    evidence.set(path, aggregate);
    ready.impact = {
      status: "DESCRIPTIVE_ONLY",
      aggregate: reference(path, aggregate),
      qualifiedReleaseReceiptSha256: wrongQualifiedReceiptSha256,
    };

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "impact aggregate does not match its qualified release",
      ]),
    });
  });

  it("rejects evidence hash drift", async () => {
    const input = SubmissionPackageSchema.parse(await draftInput());
    input.copy.readme.sha256 = "0".repeat(64);

    await expect(
      validateSubmissionPackage(input, "draft", repositoryReader),
    ).rejects.toThrow(/evidence hash mismatch/iu);
  });

  it("rejects unknown fields, placeholders, and escaping evidence paths", async () => {
    const input = (await draftInput()) as Record<string, unknown>;
    await expect(
      validateSubmissionPackage(
        { ...input, invented: true },
        "draft",
        repositoryReader,
      ),
    ).rejects.toThrow();
    const placeholder = structuredClone(input) as {
      competition: { submitterType: string | null };
    };
    placeholder.competition.submitterType = "  PENDING  ";
    await expect(
      validateSubmissionPackage(placeholder, "draft", repositoryReader),
    ).rejects.toThrow(/placeholder/iu);
    const escaped = structuredClone(input) as {
      copy: { readme: { path: string } };
    };
    escaped.copy.readme.path = "../README.md";
    await expect(
      validateSubmissionPackage(escaped, "draft", repositoryReader),
    ).rejects.toThrow(/inside the repository/iu);
    const aliased = structuredClone(input) as {
      copy: { readme: { path: string } };
    };
    aliased.copy.readme.path = "./README.md";
    await expect(
      validateSubmissionPackage(aliased, "draft", repositoryReader),
    ).rejects.toThrow(/inside the repository/iu);
  });

  it("rejects a wrong evidence role path before invoking the reader", async () => {
    const input = SubmissionPackageSchema.parse(await draftInput());
    input.copy.readme.path = "docs/not-the-readme.md";
    let reads = 0;
    const reader: EvidenceReader = async () => {
      reads += 1;
      return bytes("unexpected read");
    };

    await expect(
      validateSubmissionPackage(input, "draft", reader),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining(["evidence path must be README.md"]),
    });
    expect(reads).toBe(0);
  });

  it("rejects release-bound evidence without a deployment before invoking the reader", async () => {
    const input = SubmissionPackageSchema.parse(await draftInput());
    input.release.qualifiedRunnerReceipt = reference(
      "docs/submission-evidence/unbound/qualified-runner-release.json",
      bytes({ status: "VERIFIED" }),
    );
    let reads = 0;
    const reader: EvidenceReader = async () => {
      reads += 1;
      return bytes("unexpected read");
    };

    await expect(
      validateSubmissionPackage(input, "draft", reader),
    ).rejects.toMatchObject({
      issues: expect.arrayContaining([
        "release-bound evidence requires a deployment receipt before any read",
      ]),
    });
    expect(reads).toBe(0);
  });
});
