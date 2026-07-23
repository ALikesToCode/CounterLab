import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DeploymentReceiptSchema,
  DeploymentReceiptV3Schema,
  DeploymentReceiptV4Schema,
  DeploymentReceiptV5Schema,
  DeploymentReceiptV6Schema,
  QualifiedRunnerReleaseSchema,
  QualifiedRunnerReleaseV2Schema,
  QualifiedRunnerReleaseV3Schema,
  QualifiedRunnerReleaseV4Schema,
  QualifiedRunnerReleaseV5Schema,
  TimeoutCleanupReceiptSchema,
} from "../src/index";
import { createGenerationIsolationEvidence } from "../../../scripts/generation-isolation-evidence";
import * as releaseTools from "../../../scripts/prepare-qualified-deploy";

function legacyReceipt() {
  const sourceCommit = "a".repeat(40);
  return {
    schemaVersion: "1",
    status: "VERIFIED",
    sourceCommit,
    sourceArchiveSha256: "b".repeat(64),
    sourceTreeSha256: "c".repeat(64),
    dockerfileSha256: "d".repeat(64),
    localImageTag: `counterlab-runner:git-${sourceCommit}`,
    localImageDigest: `sha256:${"e".repeat(64)}`,
    ociRevision: sourceCommit,
    ociSourceTreeSha256: "c".repeat(64),
    engineAuthorityHash: "f".repeat(64),
    runtimeManifestHash: "1".repeat(64),
    evidenceCommit: "2".repeat(40),
    qualifiedAt: "2026-07-16T16:00:00.000Z",
    verifierVersion: "counterlab-release-v1",
  };
}

function generationIsolationQualification(input: {
  sourceCommit: string;
  sourceTreeSha256: string;
  localImageTag: string;
  localImageDigest: string;
  verifiedAt?: string;
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
  const result = createGenerationIsolationEvidence({
    ...input,
    imageUser: "10001:10001",
    verifiedAt: input.verifiedAt ?? "2026-07-16T16:23:00.000Z",
    startupProbe: {
      status: "ready",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: probePayload.checks,
      generationFilesystemReadIsolation: "OS_ENFORCED",
      generationIsolationProbe: probePayload,
      generationIsolationProbeSha256:
        "700cc58bedc163846e3854415170f49f55da9fd3ba316cc4967747d5268199dc",
    },
  });
  return {
    generationIsolationEvidence: result.evidence,
    generationIsolationEvidenceSha256: result.evidenceSha256,
    generationIsolationProbeSha256: result.probeSha256,
    generationIsolationVerifiedAt: result.evidence.verifiedAt,
  } as const;
}

describe("qualified runner release schema", () => {
  it("binds timeout qualification to the fixed 30-second probe budget", () => {
    expect(
      TimeoutCleanupReceiptSchema.shape.candidateWallSeconds.safeParse(30)
        .success,
    ).toBe(true);
    expect(
      TimeoutCleanupReceiptSchema.shape.candidateWallSeconds.safeParse(1)
        .success,
    ).toBe(false);
  });

  it("requires an exact registry promotion digest", () => {
    expect(() => QualifiedRunnerReleaseSchema.parse(legacyReceipt())).toThrow();
  });

  it("creates a runtime-bound promoted v6 receipt from recomputed evidence", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const registryImage = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const create = (
      releaseTools as unknown as {
        createQualifiedRunnerRelease: (
          observation: Record<string, unknown>,
          qualifiedAt: string,
        ) => unknown;
      }
    ).createQualifiedRunnerRelease;

    const receipt = create(
      {
        sourceCommit,
        sourceArchiveSha256: "b".repeat(64),
        sourceTreeSha256: "c".repeat(64),
        dockerfileSha256: "d".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: `sha256:${"e".repeat(64)}`,
        ociRevision: sourceCommit,
        ociSourceTreeSha256: "c".repeat(64),
        engineAuthorityHash: "f".repeat(64),
        runtimeManifestHash: "1".repeat(64),
        runtimeToolchainSha256: "4".repeat(64),
        runtimePolicySha256: "0".repeat(64),
        proofDependencyManifestSha256: "1".repeat(64),
        toolchainLockSha256: "5".repeat(64),
        runtimeAdapterSha256: "6".repeat(64),
        buildctlSha256: "7".repeat(64),
        buildkitdSha256: "8".repeat(64),
        buildkitConfigSha256: "9".repeat(64),
        adapterDockerfileSha256: "a".repeat(64),
        adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
        adapterImageDigest: `sha256:${"b".repeat(64)}`,
        adapterManifestDigest: `sha256:${"c".repeat(64)}`,
        adapterOciArchiveSha256: "d".repeat(64),
        adapterOciRevision: sourceCommit,
        adapterOciSourceTreeSha256: "c".repeat(64),
        limitMode: "container-cgroup-and-process-rlimit",
        aggregateLimitIntentEnforced: true,
        aggregateLimitEvidenceSha256: "e".repeat(64),
        timeoutCleanupReceipt: `node_modules/.cache/counterlab-v6.1/releases/timeout-cleanup-${sourceCommit}.json`,
        timeoutCleanupReceiptSha256: "e".repeat(64),
        timeoutCleanupPayloadSha256: "f".repeat(64),
        timeoutRunControlReceiptSha256: "0".repeat(64),
        timeoutRootlessReceiptSha256: "1".repeat(64),
        timeoutRuntimeSessionId: "rt-v61-test1",
        timeoutVerifiedAt: "2026-07-16T16:24:00.000Z",
        currentCommit: evidenceCommit,
        generationFilesystemReadIsolation: "OS_ENFORCED",
        ...generationIsolationQualification({
          sourceCommit,
          sourceTreeSha256: "c".repeat(64),
          localImageTag: `counterlab-runner:git-${sourceCommit}`,
          localImageDigest: `sha256:${"e".repeat(64)}`,
        }),
        sourceIsAncestor: true,
        changedPaths: ["scientific-engines/snapshot.json"],
        registryImage,
        registryDigest: `sha256:${"3".repeat(64)}`,
        registryResolvedAt: "2026-07-16T16:25:00.000Z",
        observedAt: "2026-07-16T16:30:00.000Z",
      },
      "2026-07-16T16:30:00.000Z",
    );

    expect(QualifiedRunnerReleaseSchema.parse(receipt)).toMatchObject({
      schemaVersion: "6",
      generationFilesystemReadIsolation: "OS_ENFORCED",
      evidenceCommit,
      registryImage,
      registryDigest: `sha256:${"3".repeat(64)}`,
      limitMode: "container-cgroup-and-process-rlimit",
      aggregateLimitIntentEnforced: true,
    });

    expect(() =>
      QualifiedRunnerReleaseSchema.parse({
        ...(receipt as Record<string, unknown>),
        aggregateLimitIntentEnforced: false,
      }),
    ).toThrow();
  });

  it("retains the exact historical v5 and v4 receipt contracts", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const current = (
      releaseTools as unknown as {
        createQualifiedRunnerRelease: (
          observation: Record<string, unknown>,
          qualifiedAt: string,
        ) => Record<string, unknown>;
      }
    ).createQualifiedRunnerRelease(
      {
        sourceCommit,
        sourceArchiveSha256: "b".repeat(64),
        sourceTreeSha256: "c".repeat(64),
        dockerfileSha256: "d".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: `sha256:${"e".repeat(64)}`,
        ociRevision: sourceCommit,
        ociSourceTreeSha256: "c".repeat(64),
        engineAuthorityHash: "f".repeat(64),
        runtimeManifestHash: "1".repeat(64),
        runtimeToolchainSha256: "4".repeat(64),
        runtimePolicySha256: "0".repeat(64),
        proofDependencyManifestSha256: "1".repeat(64),
        toolchainLockSha256: "5".repeat(64),
        runtimeAdapterSha256: "6".repeat(64),
        buildctlSha256: "7".repeat(64),
        buildkitdSha256: "8".repeat(64),
        buildkitConfigSha256: "9".repeat(64),
        adapterDockerfileSha256: "a".repeat(64),
        adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
        adapterImageDigest: `sha256:${"b".repeat(64)}`,
        adapterManifestDigest: `sha256:${"c".repeat(64)}`,
        adapterOciArchiveSha256: "d".repeat(64),
        adapterOciRevision: sourceCommit,
        adapterOciSourceTreeSha256: "c".repeat(64),
        limitMode: "container-cgroup-and-process-rlimit",
        aggregateLimitIntentEnforced: true,
        aggregateLimitEvidenceSha256: "e".repeat(64),
        timeoutCleanupReceipt: `node_modules/.cache/counterlab-v6.1/releases/timeout-cleanup-${sourceCommit}.json`,
        timeoutCleanupReceiptSha256: "e".repeat(64),
        timeoutCleanupPayloadSha256: "f".repeat(64),
        timeoutRunControlReceiptSha256: "0".repeat(64),
        timeoutRootlessReceiptSha256: "1".repeat(64),
        timeoutRuntimeSessionId: "rt-v61-test1",
        timeoutVerifiedAt: "2026-07-16T16:24:00.000Z",
        currentCommit: evidenceCommit,
        generationFilesystemReadIsolation: "OS_ENFORCED",
        ...generationIsolationQualification({
          sourceCommit,
          sourceTreeSha256: "c".repeat(64),
          localImageTag: `counterlab-runner:git-${sourceCommit}`,
          localImageDigest: `sha256:${"e".repeat(64)}`,
        }),
        sourceIsAncestor: true,
        changedPaths: ["scientific-engines/snapshot.json"],
        registryImage: `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`,
        registryDigest: `sha256:${"3".repeat(64)}`,
        registryResolvedAt: "2026-07-16T16:25:00.000Z",
        observedAt: "2026-07-16T16:30:00.000Z",
      },
      "2026-07-16T16:30:00.000Z",
    );
    const {
      generationIsolationEvidence: _generationIsolationEvidence,
      generationIsolationEvidenceSha256: _generationIsolationEvidenceSha256,
      generationIsolationProbeSha256: _generationIsolationProbeSha256,
      generationIsolationVerifiedAt: _generationIsolationVerifiedAt,
      ...legacyV5
    } = current;
    expect(
      QualifiedRunnerReleaseV5Schema.parse({
        ...legacyV5,
        schemaVersion: "5",
        verifierVersion: "counterlab-release-v5",
      }),
    ).toMatchObject({ schemaVersion: "5" });
    const {
      generationFilesystemReadIsolation: _generationFilesystemReadIsolation,
      ...legacyV4
    } = legacyV5;

    expect(
      QualifiedRunnerReleaseV4Schema.parse({
        ...legacyV4,
        schemaVersion: "4",
        verifierVersion: "counterlab-release-v4",
      }),
    ).toMatchObject({ schemaVersion: "4" });
    expect(() => QualifiedRunnerReleaseSchema.parse(legacyV4)).toThrow();
  });

  it("retains strict parsing for historical v3 receipts", () => {
    const sourceCommit = "a".repeat(40);
    expect(
      QualifiedRunnerReleaseV3Schema.parse({
        ...legacyReceipt(),
        schemaVersion: "3",
        runtimeToolchainSha256: "4".repeat(64),
        toolchainLockSha256: "5".repeat(64),
        runtimeAdapterSha256: "6".repeat(64),
        buildctlSha256: "7".repeat(64),
        buildkitdSha256: "8".repeat(64),
        buildkitConfigSha256: "9".repeat(64),
        adapterDockerfileSha256: "a".repeat(64),
        adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
        adapterImageDigest: `sha256:${"b".repeat(64)}`,
        adapterManifestDigest: `sha256:${"c".repeat(64)}`,
        adapterOciArchiveSha256: "d".repeat(64),
        adapterOciRevision: sourceCommit,
        adapterOciSourceTreeSha256: "c".repeat(64),
        registryImage: `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`,
        registryDigest: `sha256:${"3".repeat(64)}`,
        registryResolvedAt: "2026-07-16T16:25:00.000Z",
        qualifiedAt: "2026-07-16T16:30:00.000Z",
        verifierVersion: "counterlab-release-v3",
      }),
    ).toMatchObject({ schemaVersion: "3" });
  });

  it("retains strict parsing for historical v2 receipts", () => {
    const sourceCommit = "a".repeat(40);
    expect(
      QualifiedRunnerReleaseV2Schema.parse({
        ...legacyReceipt(),
        schemaVersion: "2",
        registryImage: `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`,
        registryDigest: `sha256:${"3".repeat(64)}`,
        registryResolvedAt: "2026-07-16T16:25:00.000Z",
        qualifiedAt: "2026-07-16T16:30:00.000Z",
      }),
    ).toMatchObject({ schemaVersion: "2" });
  });

  it("publishes the v3 receipt as generated JSON Schema", () => {
    const path = resolve(
      process.cwd(),
      "scientific-engines/schemas/qualified-runner-release-v3.schema.json",
    );
    expect(existsSync(path)).toBe(true);
    const schema = JSON.parse(readFileSync(path, "utf8")) as {
      properties?: { schemaVersion?: { const?: string } };
      required?: string[];
    };
    expect(schema.properties?.schemaVersion?.const).toBe("3");
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "registryImage",
        "registryDigest",
        "runtimeToolchainSha256",
        "runtimeAdapterSha256",
        "adapterImageDigest",
      ]),
    );
  });

  it("publishes distinct historical v4 and isolation-enforced v5 schemas", () => {
    const v4Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/qualified-runner-release-v4.schema.json",
    );
    const v5Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/qualified-runner-release-v5.schema.json",
    );
    expect(existsSync(v4Path)).toBe(true);
    expect(existsSync(v5Path)).toBe(true);
    const v4 = JSON.parse(readFileSync(v4Path, "utf8")) as {
      properties?: Record<string, { const?: string }>;
      required?: string[];
    };
    const v5 = JSON.parse(readFileSync(v5Path, "utf8")) as {
      properties?: Record<string, { const?: string }>;
      required?: string[];
    };
    expect(v4.properties?.schemaVersion?.const).toBe("4");
    expect(v4.properties).not.toHaveProperty(
      "generationFilesystemReadIsolation",
    );
    expect(v4.required).not.toContain("generationFilesystemReadIsolation");
    expect(v4.required).toEqual(
      expect.arrayContaining([
        "timeoutCleanupReceipt",
        "timeoutCleanupReceiptSha256",
        "timeoutRunControlReceiptSha256",
        "timeoutRootlessReceiptSha256",
        "limitMode",
        "aggregateLimitIntentEnforced",
        "aggregateLimitEvidenceSha256",
        "runtimePolicySha256",
        "proofDependencyManifestSha256",
      ]),
    );
    expect(v5.properties?.schemaVersion?.const).toBe("5");
    expect(v5.properties?.generationFilesystemReadIsolation?.const).toBe(
      "OS_ENFORCED",
    );
    expect(v5.required).toContain("generationFilesystemReadIsolation");
  });
});

describe("deployment receipt schema", () => {
  function receipt() {
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

  it("binds the deployed Worker, Container, release checks, and exact artifacts", () => {
    expect(DeploymentReceiptSchema.parse(receipt())).toMatchObject({
      schemaVersion: "7",
      status: "DEPLOYED",
      workerName: "counterlab",
    });
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        containerImage: `registry.cloudflare.com/account/counterlab-runner@sha256:${"d".repeat(64)}`,
      }),
    ).toThrow(/exact qualified digest/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        releaseCheckCheckedAt: "2026-07-19T00:04:00.000Z",
      }),
    ).toThrow(/precede deployment/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        generationFilesystemReadIsolation: "PARTIAL",
      }),
    ).toThrow();
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        releaseCheckGenerationIsolationProbeSha256: "0".repeat(64),
      }),
    ).toThrow(/must match the qualified probe/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        releaseCheckGenerationIsolationVerifiedAt: "2026-07-19T00:04:00.000Z",
      }),
    ).toThrow(/precede deployment/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        releaseCheckGenerationIsolationVerifiedAt: "2026-07-19T00:00:30.000Z",
      }),
    ).toThrow(/follow qualification/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        releaseCheckGenerationIsolationVerifiedAt: "2026-07-19T00:02:30.000Z",
      }),
    ).toThrow(/precede receipt issuance/u);
  });

  it("retains the historical v6, v5, and v4 isolation contracts", () => {
    const {
      releaseCheckGenerationIsolationEvidenceSha256:
        _releaseCheckGenerationIsolationEvidenceSha256,
      releaseCheckGenerationIsolationProbeSha256:
        _releaseCheckGenerationIsolationProbeSha256,
      releaseCheckGenerationIsolationVerifiedAt:
        _releaseCheckGenerationIsolationVerifiedAt,
      ...legacyV6
    } = receipt();
    expect(
      DeploymentReceiptV6Schema.parse({
        ...legacyV6,
        schemaVersion: "6",
        verifierVersion: "counterlab-deployment-v6",
      }),
    ).toMatchObject({ schemaVersion: "6" });
    const {
      generationIsolationEvidenceSha256: _generationIsolationEvidenceSha256,
      generationIsolationProbeSha256: _generationIsolationProbeSha256,
      generationIsolationVerifiedAt: _generationIsolationVerifiedAt,
      ...legacyV5
    } = legacyV6;
    expect(
      DeploymentReceiptV5Schema.parse({
        ...legacyV5,
        schemaVersion: "5",
        verifierVersion: "counterlab-deployment-v5",
      }),
    ).toMatchObject({ schemaVersion: "5" });
    expect(
      DeploymentReceiptV4Schema.parse({
        ...legacyV5,
        schemaVersion: "4",
        generationFilesystemReadIsolation: "PARTIAL",
        verifierVersion: "counterlab-deployment-v4",
      }),
    ).toMatchObject({
      schemaVersion: "4",
      generationFilesystemReadIsolation: "PARTIAL",
    });
  });

  it("rejects a dry-run projection that changes bytes or contains another file", () => {
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        dryRunSha256: "0".repeat(64),
      }),
    ).toThrow(/equal the frozen Worker bundle/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        dryRunFileCount: 2,
      }),
    ).toThrow();
  });

  it("retains strict parsing for historical v3 deployment receipts", () => {
    const {
      releaseCheckGenerationIsolationEvidenceSha256:
        _releaseCheckGenerationIsolationEvidenceSha256,
      releaseCheckGenerationIsolationProbeSha256:
        _releaseCheckGenerationIsolationProbeSha256,
      releaseCheckGenerationIsolationVerifiedAt:
        _releaseCheckGenerationIsolationVerifiedAt,
      generationIsolationEvidenceSha256: _generationIsolationEvidenceSha256,
      generationIsolationProbeSha256: _generationIsolationProbeSha256,
      generationIsolationVerifiedAt: _generationIsolationVerifiedAt,
      timeoutCleanupReceiptSha256: _timeoutCleanupReceiptSha256,
      aggregateLimitEvidenceSha256: _aggregateLimitEvidenceSha256,
      runtimePolicySha256: _runtimePolicySha256,
      proofDependencyManifestSha256: _proofDependencyManifestSha256,
      workerArtifactClassification: _workerArtifactClassification,
      workerArtifactManifestSha256: _workerArtifactManifestSha256,
      clientPublicAssetsSha256: _clientPublicAssetsSha256,
      clientPublicAssetCount: _clientPublicAssetCount,
      viteVersion: _viteVersion,
      wranglerVersion: _wranglerVersion,
      ...historical
    } = receipt();
    expect(
      DeploymentReceiptV3Schema.parse({
        ...historical,
        schemaVersion: "3",
        generationFilesystemReadIsolation: "PARTIAL",
        verifierVersion: "counterlab-deployment-v3",
      }),
    ).toMatchObject({ schemaVersion: "3" });
  });

  it("publishes the strict v3 deployment receipt as generated JSON Schema", () => {
    const path = resolve(
      process.cwd(),
      "scientific-engines/schemas/deployment-receipt-v3.schema.json",
    );
    expect(existsSync(path)).toBe(true);
    const schema = JSON.parse(readFileSync(path, "utf8")) as {
      additionalProperties?: boolean;
      properties?: { schemaVersion?: { const?: string } };
      required?: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.schemaVersion?.const).toBe("3");
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "qualifiedRunnerReceiptSha256",
        "releaseCheckReceiptSha256",
        "generationFilesystemReadIsolation",
        "runtimeToolchainSha256",
        "adapterImageDigest",
        "workerBundleSha256",
        "clientAssetsSha256",
      ]),
    );
  });

  it("publishes distinct historical v4 and isolation-enforced v5 deployment schemas", () => {
    const v4Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/deployment-receipt-v4.schema.json",
    );
    const v5Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/deployment-receipt-v5.schema.json",
    );
    const v7Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/deployment-receipt-v7.schema.json",
    );
    expect(existsSync(v4Path)).toBe(true);
    expect(existsSync(v5Path)).toBe(true);
    expect(existsSync(v7Path)).toBe(true);
    const v4 = JSON.parse(readFileSync(v4Path, "utf8")) as {
      properties?: {
        schemaVersion?: { const?: string };
        generationFilesystemReadIsolation?: { const?: string };
        dryRunFileCount?: { const?: number };
      };
      required?: string[];
    };
    const v5 = JSON.parse(readFileSync(v5Path, "utf8")) as typeof v4;
    const v7 = JSON.parse(readFileSync(v7Path, "utf8")) as typeof v4;
    expect(v4.properties?.schemaVersion?.const).toBe("4");
    expect(v4.properties?.generationFilesystemReadIsolation?.const).toBe(
      "PARTIAL",
    );
    expect(v4.properties?.dryRunFileCount?.const).toBe(1);
    expect(v4.required).toEqual(
      expect.arrayContaining([
        "timeoutCleanupReceiptSha256",
        "aggregateLimitEvidenceSha256",
        "runtimePolicySha256",
        "proofDependencyManifestSha256",
        "workerArtifactClassification",
        "workerArtifactManifestSha256",
        "clientPublicAssetsSha256",
        "clientPublicAssetCount",
        "viteVersion",
        "wranglerVersion",
      ]),
    );
    expect(v5.properties?.schemaVersion?.const).toBe("5");
    expect(v5.properties?.generationFilesystemReadIsolation?.const).toBe(
      "OS_ENFORCED",
    );
    expect(v7.properties?.schemaVersion?.const).toBe("7");
    expect(v7.required).toEqual(
      expect.arrayContaining([
        "releaseCheckGenerationIsolationEvidenceSha256",
        "releaseCheckGenerationIsolationProbeSha256",
        "releaseCheckGenerationIsolationVerifiedAt",
      ]),
    );
  });
});
