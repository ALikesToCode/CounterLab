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

function productionSmoke(
  receipt: ReturnType<typeof deploymentReceipt>,
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

  it("accepts a complete, tuple-consistent ready package", async () => {
    const { ready, reader } = await readyPackage();

    await expect(
      validateSubmissionPackage(ready, "ready", reader, {
        now: new Date("2026-07-21T12:00:00.000Z"),
      }),
    ).resolves.toMatchObject({ submissionState: "READY_TO_SUBMIT" });
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
        expect.stringMatching(/schema-v6 smoke/iu),
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
        expect.stringMatching(/schema-v6 smoke/iu),
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
