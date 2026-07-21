import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { RELEASE_CHECK_IDS } from "../packages/scientific-engine-registry/src/schema.js";
import { canonicalJson } from "../packages/session-core/src/index.js";
import { createGenerationIsolationEvidence } from "./generation-isolation-evidence.js";
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
  const qualifiedRef = addEvidence(
    "evidence/qualified-runner-release.json",
    chain.qualifiedBytes,
  );
  const releaseCheckRef = addEvidence(
    "evidence/release-check-receipt.json",
    chain.releaseCheckBytes,
  );
  const receiptBytes = bytes(receipt);
  const receiptRef = addEvidence(
    "evidence/deployment-receipt.json",
    receiptBytes,
  );
  const smokeRef = addEvidence(
    "evidence/production-smoke.json",
    bytes(productionSmoke(receipt, receiptRef.sha256)),
  );
  const genericEvidence = (name: string) =>
    addEvidence(`evidence/${name}.json`, bytes({ status: "VERIFIED", name }));
  const assetNames = [
    "01-judge-belief-break-1440x900.png",
    "02-live-prediction-and-authority-1440x900.png",
    "03-theater-boundary-1440x900.png",
    "04-transfer-repair-proof-1440x900.png",
    "thumbnail-judge-belief-break.png",
  ];
  const assets = assetNames.map((fileName) => ({
    fileName,
    image: addEvidence(
      `docs/submission-assets/${fileName}`,
      bytes(`png:${fileName}`),
    ),
    provenance: addEvidence(
      `docs/submission-assets/${fileName}.json`,
      bytes({ fileName, release: receipt.workerVersionId }),
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
      accessEvidence: genericEvidence("repository-access"),
    },
    video: {
      ...input.video,
      publicUrl: "https://youtu.be/counterlab-demo",
      durationSeconds: 165,
      audioPresent: true,
      codexRoleCovered: true,
      gpt56RoleCovered: true,
      verificationEvidence: genericEvidence("video"),
    },
    feedback: {
      sessionId: "019f6069-2af2-7132-8181-d313081884c8",
      evidence: genericEvidence("feedback"),
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
      evidence: genericEvidence("browser"),
    },
    assets,
    publicLinkAudit: {
      loggedOut: true,
      checkedAt: "2026-07-21T10:00:00.000Z",
      evidence: genericEvidence("links"),
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

  it("accepts a tuple-consistent release fixture", async () => {
    const { ready, reader } = await readyPackage();

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ submissionState: "READY_TO_SUBMIT" });
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
    const changedReleaseCheckPath = "evidence/drifted-release-check.json";
    evidence.set(changedReleaseCheckPath, changedReleaseCheck);
    ready.release.releaseCheckReceipt = reference(
      changedReleaseCheckPath,
      changedReleaseCheck,
    );

    const deploymentBytes = evidence.get(ready.release.deploymentReceipt!.path);
    if (deploymentBytes === undefined) {
      throw new Error("missing deployment fixture");
    }
    const deployment = JSON.parse(
      new TextDecoder().decode(deploymentBytes),
    ) as { releaseCheckReceiptSha256: string };
    deployment.releaseCheckReceiptSha256 =
      ready.release.releaseCheckReceipt.sha256;
    const changedDeployment = bytes(deployment);
    const changedDeploymentPath = "evidence/drifted-deployment.json";
    evidence.set(changedDeploymentPath, changedDeployment);
    ready.release.deploymentReceipt = reference(
      changedDeploymentPath,
      changedDeployment,
    );

    const smokeBytes = evidence.get(ready.release.productionSmoke!.path);
    if (smokeBytes === undefined) throw new Error("missing smoke fixture");
    const smoke = JSON.parse(new TextDecoder().decode(smokeBytes)) as {
      deployment: { deploymentReceiptSha256: string };
    };
    smoke.deployment.deploymentReceiptSha256 =
      ready.release.deploymentReceipt.sha256;
    const changedSmoke = bytes(smoke);
    const changedSmokePath = "evidence/drifted-smoke.json";
    evidence.set(changedSmokePath, changedSmoke);
    ready.release.productionSmoke = reference(changedSmokePath, changedSmoke);

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
    const deploymentBytes = evidence.get(ready.release.deploymentReceipt!.path);
    if (deploymentBytes === undefined) {
      throw new Error("missing deployment fixture");
    }
    const deployment = JSON.parse(
      new TextDecoder().decode(deploymentBytes),
    ) as { timeoutCleanupReceiptSha256: string };
    deployment.timeoutCleanupReceiptSha256 = "0".repeat(64);
    const changedDeployment = bytes(deployment);
    const changedDeploymentPath = "evidence/timeout-drift-deployment.json";
    evidence.set(changedDeploymentPath, changedDeployment);
    ready.release.deploymentReceipt = reference(
      changedDeploymentPath,
      changedDeployment,
    );

    const smokeBytes = evidence.get(ready.release.productionSmoke!.path);
    if (smokeBytes === undefined) throw new Error("missing smoke fixture");
    const smoke = JSON.parse(new TextDecoder().decode(smokeBytes)) as {
      deployment: {
        deploymentReceiptSha256: string;
        timeoutCleanupReceiptSha256: string;
      };
    };
    smoke.deployment.deploymentReceiptSha256 =
      ready.release.deploymentReceipt.sha256;
    smoke.deployment.timeoutCleanupReceiptSha256 =
      deployment.timeoutCleanupReceiptSha256;
    const changedSmoke = bytes(smoke);
    const changedSmokePath = "evidence/timeout-drift-smoke.json";
    evidence.set(changedSmokePath, changedSmoke);
    ready.release.productionSmoke = reference(changedSmokePath, changedSmoke);

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
    const changedReleaseCheckPath = "evidence/wrong-tree-release-check.json";
    evidence.set(changedReleaseCheckPath, changedReleaseCheck);
    ready.release.releaseCheckReceipt = reference(
      changedReleaseCheckPath,
      changedReleaseCheck,
    );

    const deploymentBytes = evidence.get(ready.release.deploymentReceipt!.path);
    if (deploymentBytes === undefined) {
      throw new Error("missing deployment fixture");
    }
    const deployment = JSON.parse(
      new TextDecoder().decode(deploymentBytes),
    ) as {
      releaseCheckReceiptSha256: string;
      releaseCheckGenerationIsolationEvidenceSha256: string;
    };
    deployment.releaseCheckReceiptSha256 =
      ready.release.releaseCheckReceipt.sha256;
    deployment.releaseCheckGenerationIsolationEvidenceSha256 =
      wrongTreeIsolation.evidenceSha256;
    const changedDeployment = bytes(deployment);
    const changedDeploymentPath = "evidence/wrong-tree-deployment.json";
    evidence.set(changedDeploymentPath, changedDeployment);
    ready.release.deploymentReceipt = reference(
      changedDeploymentPath,
      changedDeployment,
    );

    const smokeBytes = evidence.get(ready.release.productionSmoke!.path);
    if (smokeBytes === undefined) throw new Error("missing smoke fixture");
    const smoke = JSON.parse(new TextDecoder().decode(smokeBytes)) as {
      deployment: {
        deploymentReceiptSha256: string;
        releaseCheckGenerationIsolationEvidenceSha256: string;
      };
    };
    smoke.deployment.deploymentReceiptSha256 =
      ready.release.deploymentReceipt.sha256;
    smoke.deployment.releaseCheckGenerationIsolationEvidenceSha256 =
      wrongTreeIsolation.evidenceSha256;
    const changedSmoke = bytes(smoke);
    const changedSmokePath = "evidence/wrong-tree-smoke.json";
    evidence.set(changedSmokePath, changedSmoke);
    ready.release.productionSmoke = reference(changedSmokePath, changedSmoke);

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
    const path = "evidence/minimal-production-smoke.json";
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
    const path = "evidence/private-production-smoke.json";
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
    const path = "evidence/raw-notebook-production-smoke.json";
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
      aggregate: reference("evidence/invalid-impact.json", invalidImpact),
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
    const path = "evidence/mismatched-impact.json";
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
});
