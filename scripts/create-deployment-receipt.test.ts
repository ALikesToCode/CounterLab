import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertActiveWorkerReleaseBindings,
  assertDeploymentReceiptBindings,
  assertFrozenDryRunProjection,
  qualifiedContainerImage,
  selectQualifiedContainer,
} from "./create-deployment-receipt";

describe("deployment receipt frozen dry-run projection", () => {
  const workerBundleSha256 = "a".repeat(64);

  it("accepts exactly one byte-identical Worker bundle", () => {
    expect(() =>
      assertFrozenDryRunProjection({
        workerBundleSha256,
        dryRunSha256: workerBundleSha256,
        dryRunFileCount: 1,
      }),
    ).not.toThrow();
  });

  it("rejects changed Worker bytes and every non-singleton projection", () => {
    expect(() =>
      assertFrozenDryRunProjection({
        workerBundleSha256,
        dryRunSha256: "b".repeat(64),
        dryRunFileCount: 1,
      }),
    ).toThrow(/bytes differ/u);

    for (const dryRunFileCount of [0, 2]) {
      expect(() =>
        assertFrozenDryRunProjection({
          workerBundleSha256,
          dryRunSha256: workerBundleSha256,
          dryRunFileCount,
        }),
      ).toThrow(/one exact Worker bundle/u);
    }
  });
});

describe("deployment receipt Container identity", () => {
  const sourceCommit = "a".repeat(40);
  const registryDigest = `sha256:${"b".repeat(64)}`;
  const registryImage = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
  const image = `registry.cloudflare.com/account-1/counterlab-runner@${registryDigest}`;
  const container = {
    id: "counterlab-container-1",
    image,
    name: "counterlab-counterlabrunner",
    state: "ready",
    version: 1,
  };

  it("derives the immutable image from the qualified repository and digest", () => {
    expect(qualifiedContainerImage(registryImage, registryDigest)).toBe(image);
    expect(
      selectQualifiedContainer({
        containers: [container],
        containerName: container.name,
        requestedImage: image,
        registryImage,
        registryDigest,
      }),
    ).toEqual(container);
  });

  it("rejects caller-selected repositories and duplicate applications", () => {
    expect(() =>
      selectQualifiedContainer({
        containers: [container],
        containerName: container.name,
        requestedImage: image.replace("account-1", "account-2"),
        registryImage,
        registryDigest,
      }),
    ).toThrow(/qualification-derived/u);
    expect(() =>
      selectQualifiedContainer({
        containers: [container, { ...container, id: "duplicate" }],
        containerName: container.name,
        requestedImage: image,
        registryImage,
        registryDigest,
      }),
    ).toThrow(/one qualified digest/u);
  });
});

describe("deployment receipt Worker identity", () => {
  const expected = {
    workerEvidenceCommit: "a".repeat(40),
    runnerSourceCommit: "b".repeat(40),
    runnerImageDigest: `sha256:${"c".repeat(64)}`,
    timeoutCleanupReceiptSha256: "d".repeat(64),
    aggregateLimitEvidenceSha256: "9".repeat(64),
    runtimePolicySha256: "e".repeat(64),
    proofDependencyManifestSha256: "f".repeat(64),
    workerArtifactClassification: "PROCESS_BOUND_PARTIAL" as const,
    workerArtifactManifestSha256: "1".repeat(64),
    workerBundleSha256: "2".repeat(64),
    clientAssetsSha256: "3".repeat(64),
    clientAssetCount: 27,
    clientPublicAssetsSha256: "4".repeat(64),
    clientPublicAssetCount: 25,
    viteVersion: "8.1.4" as const,
    wranglerVersion: "4.110.0" as const,
  };
  const bindings = [
    ["COUNTERLAB_WORKER_EVIDENCE_COMMIT", expected.workerEvidenceCommit],
    ["COUNTERLAB_RUNNER_SOURCE_COMMIT", expected.runnerSourceCommit],
    ["COUNTERLAB_RUNNER_IMAGE_DIGEST", expected.runnerImageDigest],
    [
      "COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256",
      expected.timeoutCleanupReceiptSha256,
    ],
    [
      "COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256",
      expected.aggregateLimitEvidenceSha256,
    ],
    ["COUNTERLAB_RUNTIME_POLICY_SHA256", expected.runtimePolicySha256],
    [
      "COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256",
      expected.proofDependencyManifestSha256,
    ],
    [
      "COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256",
      expected.workerArtifactManifestSha256,
    ],
    [
      "COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION",
      expected.workerArtifactClassification,
    ],
    ["COUNTERLAB_WORKER_BUNDLE_SHA256", expected.workerBundleSha256],
    ["COUNTERLAB_CLIENT_ASSETS_SHA256", expected.clientAssetsSha256],
    ["COUNTERLAB_CLIENT_ASSET_COUNT", String(expected.clientAssetCount)],
    [
      "COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256",
      expected.clientPublicAssetsSha256,
    ],
    [
      "COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT",
      String(expected.clientPublicAssetCount),
    ],
    ["COUNTERLAB_VITE_VERSION", expected.viteVersion],
    ["COUNTERLAB_WRANGLER_VERSION", expected.wranglerVersion],
    ["COUNTERLAB_MAINTENANCE_MODE", "false"],
  ].map(([name, text]) => ({ name, text, type: "plain_text" }));

  it("requires direct active bindings for both qualification hashes", () => {
    expect(() =>
      assertActiveWorkerReleaseBindings(bindings, expected),
    ).not.toThrow();

    for (const name of [
      "COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256",
      "COUNTERLAB_RUNTIME_POLICY_SHA256",
      "COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256",
      "COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256",
      "COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION",
      "COUNTERLAB_WORKER_BUNDLE_SHA256",
      "COUNTERLAB_CLIENT_ASSETS_SHA256",
      "COUNTERLAB_CLIENT_ASSET_COUNT",
      "COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256",
      "COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT",
      "COUNTERLAB_VITE_VERSION",
      "COUNTERLAB_WRANGLER_VERSION",
    ]) {
      expect(() =>
        assertActiveWorkerReleaseBindings(
          bindings.filter((binding) => binding.name !== name),
          expected,
        ),
      ).toThrow(new RegExp(name, "u"));
      expect(() =>
        assertActiveWorkerReleaseBindings(
          bindings.map((binding) =>
            binding.name === name
              ? { ...binding, text: "0".repeat(64) }
              : binding,
          ),
          expected,
        ),
      ).toThrow(new RegExp(name, "u"));
    }
  });
});

describe("deployment receipt qualification binding", () => {
  const qualifiedReceiptBytes = Buffer.from("qualified-receipt\n");
  const qualified = {
    generationFilesystemReadIsolation: "OS_ENFORCED",
    evidenceCommit: "a".repeat(40),
    sourceCommit: "b".repeat(40),
    registryDigest: `sha256:${"c".repeat(64)}`,
    qualifiedAt: "2026-07-19T00:01:00.000Z",
    localImageTag: `counterlab-runner:git-${"b".repeat(40)}`,
    localImageDigest: `sha256:${"d".repeat(64)}`,
    adapterImageTag: `counterlab-adapter:git-${"b".repeat(40)}`,
    adapterImageDigest: `sha256:${"e".repeat(64)}`,
    runtimeToolchainSha256: "1".repeat(64),
    runtimePolicySha256: "2".repeat(64),
    proofDependencyManifestSha256: "3".repeat(64),
    runtimeAdapterSha256: "4".repeat(64),
    aggregateLimitEvidenceSha256: "5".repeat(64),
  } as const;
  const releaseCheck = {
    generationFilesystemReadIsolation:
      qualified.generationFilesystemReadIsolation,
    evidenceCommit: qualified.evidenceCommit,
    sourceCommit: qualified.sourceCommit,
    qualifiedRunnerReceiptSha256: createHash("sha256")
      .update(qualifiedReceiptBytes)
      .digest("hex"),
    qualifiedAt: qualified.qualifiedAt,
    runnerImageTag: qualified.localImageTag,
    runnerImageDigest: qualified.localImageDigest,
    adapterImageTag: qualified.adapterImageTag,
    adapterImageDigest: qualified.adapterImageDigest,
    registryDigest: qualified.registryDigest,
    runtimeToolchainSha256: qualified.runtimeToolchainSha256,
    runtimePolicySha256: qualified.runtimePolicySha256,
    proofDependencyManifestSha256: qualified.proofDependencyManifestSha256,
    runtimeAdapterSha256: qualified.runtimeAdapterSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
  } as const;
  const common = {
    qualified,
    qualifiedReceiptBytes,
    releaseCheck,
    evidenceCommit: qualified.evidenceCommit,
    sourceCommit: qualified.sourceCommit,
    registryDigest: qualified.registryDigest,
  };

  it("requires one receipt identity before deployment evidence is issued", () => {
    expect(() => assertDeploymentReceiptBindings(common)).not.toThrow();
  });

  it("rejects each new qualification hash when release-check evidence drifts", () => {
    for (const [field, label] of [
      ["aggregateLimitEvidenceSha256", /aggregate limit evidence/u],
      ["runtimePolicySha256", /runtime policy/u],
      ["proofDependencyManifestSha256", /proof dependency manifest/u],
    ] as const) {
      expect(() =>
        assertDeploymentReceiptBindings({
          ...common,
          releaseCheck: { ...releaseCheck, [field]: "0".repeat(64) },
        }),
      ).toThrow(label);
    }
  });
});
