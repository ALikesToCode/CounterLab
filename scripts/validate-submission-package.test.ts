import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

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

function deploymentReceipt() {
  const worker = "a".repeat(40);
  const runner = "b".repeat(40);
  const digest = `sha256:${"c".repeat(64)}`;
  return {
    schemaVersion: "7",
    status: "DEPLOYED",
    workerName: "counterlab",
    productionOrigin: "https://counterlab.cserules.workers.dev",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationEvidenceSha256: "0".repeat(64),
    generationIsolationProbeSha256: "1".repeat(64),
    generationIsolationVerifiedAt: "2026-07-19T00:01:00.000Z",
    releaseCheckGenerationIsolationEvidenceSha256: "2".repeat(64),
    releaseCheckGenerationIsolationProbeSha256: "1".repeat(64),
    releaseCheckGenerationIsolationVerifiedAt: "2026-07-19T00:01:30.000Z",
    workerEvidenceCommit: worker,
    runnerSourceCommit: runner,
    qualifiedRunnerReceiptSha256: "1".repeat(64),
    releaseCheckReceiptSha256: "2".repeat(64),
    releaseCheckCheckedAt: "2026-07-19T00:02:00.000Z",
    timeoutCleanupReceiptSha256: "d".repeat(64),
    aggregateLimitEvidenceSha256: "6".repeat(64),
    runtimeToolchainSha256: "3".repeat(64),
    runtimePolicySha256: "d".repeat(64),
    proofDependencyManifestSha256: "e".repeat(64),
    runtimeAdapterSha256: "4".repeat(64),
    adapterImageDigest: `sha256:${"5".repeat(64)}`,
    workerVersionId: "11111111-2222-3333-4444-555555555555",
    workerTag: `git-${worker}`,
    workerMessage: `CounterLab Worker ${worker}; runner ${runner}`,
    containerApplicationId: "container-app-1",
    containerApplicationVersion: "3",
    containerImage: `registry.cloudflare.com/account/counterlab-runner@${digest}`,
    containerState: "active",
    containerImageDigest: digest,
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
}

async function readyPackage() {
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
  const receipt = deploymentReceipt();
  const receiptBytes = bytes(receipt);
  const receiptRef = addEvidence(
    "evidence/deployment-receipt.json",
    receiptBytes,
  );
  const smokeRef = addEvidence(
    "evidence/production-smoke.json",
    bytes({
      schemaVersion: "6",
      status: "PASSED",
      baseUrl: receipt.productionOrigin,
      deployment: {
        workerVersion: receipt.workerVersionId,
        workerEvidenceCommit: receipt.workerEvidenceCommit,
        runnerSourceCommit: receipt.runnerSourceCommit,
        containerImageDigest: receipt.containerImageDigest,
        deploymentReceiptSha256: receiptRef.sha256,
      },
    }),
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

  it("accepts a complete, tuple-consistent ready package", async () => {
    const { ready, reader } = await readyPackage();

    await expect(
      validateSubmissionPackage(ready, "ready", reader),
    ).resolves.toMatchObject({ submissionState: "READY_TO_SUBMIT" });
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
    placeholder.competition.submitterType = "PENDING";
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
  });
});
