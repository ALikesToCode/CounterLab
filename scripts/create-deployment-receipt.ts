import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { DeploymentReceiptV7Schema } from "../packages/scientific-engine-registry/src/index.js";
import type {
  QualifiedRunnerReleaseV6,
  ReleaseCheckReceiptV5,
} from "../packages/scientific-engine-registry/src/index.js";
import {
  parseQualifiedRunnerReleaseV6,
  verifyGenerationIsolationEvidence,
} from "./generation-isolation-evidence.js";
import { parseReleaseCheckReceiptV5 } from "./release-check-receipt.js";
import {
  collectFrozenClientAssets,
  verifyFrozenWorkerReleaseManifest,
} from "./frozen-worker-release.js";

const flags = [
  "--status",
  "--version",
  "--containers",
  "--output",
  "--source-commit",
  "--evidence-commit",
  "--registry-digest",
  "--config",
  "--deployed-version-id",
  "--worker-tag",
  "--worker-message",
  "--container-name",
  "--container-image",
  "--qualified-receipt",
  "--release-check-receipt",
  "--worker-artifact-manifest",
  "--worker-bundle",
  "--client-dir",
  "--dry-run-dir",
] as const;

function argumentsFrom(argv: string[]): Record<(typeof flags)[number], string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !flags.includes(flag as (typeof flags)[number]) ||
      values.has(flag)
    ) {
      throw new Error("deployment receipt arguments are invalid");
    }
    values.set(flag, value);
  }
  if (values.size !== flags.length) {
    throw new Error("deployment receipt arguments are incomplete");
  }
  return Object.fromEntries(
    flags.map((flag) => [flag, values.get(flag)!]),
  ) as Record<(typeof flags)[number], string>;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRepositoryPath(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function existingRepositoryPath(
  root: string,
  requested: string,
  kind: "file" | "directory",
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(`deployment evidence escaped the repository: ${requested}`);
  }
  const physical = await realpath(candidate);
  const metadata = await stat(physical);
  if (
    !isRepositoryPath(root, physical) ||
    (kind === "file" ? !metadata.isFile() : !metadata.isDirectory())
  ) {
    throw new Error(`deployment evidence has the wrong type: ${requested}`);
  }
  return physical;
}

async function outputPath(root: string, requested: string): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error("deployment receipt output escaped the repository");
  }
  const parent = await realpath(dirname(candidate));
  if (!isRepositoryPath(root, parent)) {
    throw new Error("deployment receipt parent escaped the repository");
  }
  return candidate;
}

export function assertFrozenDryRunProjection(input: {
  workerBundleSha256: string;
  dryRunSha256: string;
  dryRunFileCount: number;
}): void {
  if (input.dryRunSha256 !== input.workerBundleSha256) {
    throw new Error(
      "Wrangler dry-run Worker bytes differ from the frozen bundle",
    );
  }
  if (input.dryRunFileCount !== 1) {
    throw new Error(
      "Wrangler dry-run authority must contain one exact Worker bundle",
    );
  }
}

function dryRunWorkerHash(
  root: string,
  directory: string,
  expectedWorkerSha256: string,
) {
  const entries = readdirSync(directory, { withFileTypes: true }).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  if (
    JSON.stringify(entries.map((entry) => entry.name)) !==
      JSON.stringify(["README.md", "index.js"]) ||
    entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
  ) {
    throw new Error("Wrangler dry-run output has an unexpected shape");
  }
  const workerPath = resolve(directory, "index.js");
  const readmePath = resolve(directory, "README.md");
  if (
    !isRepositoryPath(root, workerPath) ||
    !isRepositoryPath(root, readmePath)
  ) {
    throw new Error("Wrangler dry-run output escaped the repository");
  }
  const workerSha256 = sha256(readFileSync(workerPath));
  assertFrozenDryRunProjection({
    workerBundleSha256: expectedWorkerSha256,
    dryRunSha256: workerSha256,
    dryRunFileCount: 1,
  });
  const readme = readFileSync(readmePath, "utf8");
  if (
    !/^This folder contains the built output assets for the worker "counterlab" generated at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.$/u.test(
      readme,
    )
  ) {
    throw new Error("Wrangler dry-run README has an unexpected format");
  }
  return { sha256: workerSha256, count: 1 };
}

type ContainerObservation = {
  id?: string;
  image?: string;
  name?: string;
  state?: string;
  version?: number | string;
};

export function qualifiedContainerImage(
  registryImage: string,
  registryDigest: string,
): string {
  if (
    !/^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner:git-[a-f0-9]{40}$/.test(
      registryImage,
    ) ||
    !/^sha256:[a-f0-9]{64}$/.test(registryDigest)
  ) {
    throw new Error("qualified Container image identity is invalid");
  }
  return registryImage.replace(/:git-[a-f0-9]{40}$/, `@${registryDigest}`);
}

export function selectQualifiedContainer(input: {
  containers: unknown;
  containerName: string;
  requestedImage: string;
  registryImage: string;
  registryDigest: string;
}): ContainerObservation {
  const expectedName = "counterlab-counterlabrunner";
  const expectedImage = qualifiedContainerImage(
    input.registryImage,
    input.registryDigest,
  );
  if (
    input.containerName !== expectedName ||
    input.requestedImage !== expectedImage ||
    !Array.isArray(input.containers)
  ) {
    throw new Error(
      "requested Container identity is not qualification-derived",
    );
  }
  const named = (input.containers as ContainerObservation[]).filter(
    (candidate) => candidate?.name === expectedName,
  );
  if (named.length !== 1 || named[0]?.image !== expectedImage) {
    throw new Error("active Container does not expose one qualified digest");
  }
  return named[0];
}

export function assertActiveWorkerReleaseBindings(
  bindings: unknown,
  expected: {
    workerEvidenceCommit: string;
    runnerSourceCommit: string;
    runnerImageDigest: string;
    generationIsolationEvidenceSha256: string;
    generationIsolationProbeSha256: string;
    releaseCheckGenerationIsolationEvidenceSha256: string;
    releaseCheckGenerationIsolationProbeSha256: string;
    releaseCheckGenerationIsolationVerifiedAt: string;
    timeoutCleanupReceiptSha256: string;
    aggregateLimitEvidenceSha256: string;
    runtimePolicySha256: string;
    proofDependencyManifestSha256: string;
    workerArtifactClassification: "PROCESS_BOUND_PARTIAL";
    workerArtifactManifestSha256: string;
    workerBundleSha256: string;
    clientAssetsSha256: string;
    clientAssetCount: number;
    clientPublicAssetsSha256: string;
    clientPublicAssetCount: number;
    viteVersion: "8.1.4";
    wranglerVersion: "4.110.0";
  },
): asserts bindings is Array<Record<string, unknown>> {
  if (!Array.isArray(bindings)) {
    throw new Error("the active Worker did not expose deployed bindings");
  }
  const expectedBindings = {
    COUNTERLAB_WORKER_EVIDENCE_COMMIT: expected.workerEvidenceCommit,
    COUNTERLAB_RUNNER_SOURCE_COMMIT: expected.runnerSourceCommit,
    COUNTERLAB_RUNNER_IMAGE_DIGEST: expected.runnerImageDigest,
    COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256:
      expected.generationIsolationEvidenceSha256,
    COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256:
      expected.generationIsolationProbeSha256,
    COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256:
      expected.releaseCheckGenerationIsolationEvidenceSha256,
    COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256:
      expected.releaseCheckGenerationIsolationProbeSha256,
    COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT:
      expected.releaseCheckGenerationIsolationVerifiedAt,
    COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256:
      expected.timeoutCleanupReceiptSha256,
    COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256:
      expected.aggregateLimitEvidenceSha256,
    COUNTERLAB_RUNTIME_POLICY_SHA256: expected.runtimePolicySha256,
    COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256:
      expected.proofDependencyManifestSha256,
    COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION:
      expected.workerArtifactClassification,
    COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256:
      expected.workerArtifactManifestSha256,
    COUNTERLAB_WORKER_BUNDLE_SHA256: expected.workerBundleSha256,
    COUNTERLAB_CLIENT_ASSETS_SHA256: expected.clientAssetsSha256,
    COUNTERLAB_CLIENT_ASSET_COUNT: String(expected.clientAssetCount),
    COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256: expected.clientPublicAssetsSha256,
    COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT: String(
      expected.clientPublicAssetCount,
    ),
    COUNTERLAB_VITE_VERSION: expected.viteVersion,
    COUNTERLAB_WRANGLER_VERSION: expected.wranglerVersion,
    COUNTERLAB_MAINTENANCE_MODE: "false",
  } as const;
  for (const [name, value] of Object.entries(expectedBindings)) {
    const matchingBindings = (
      bindings as Array<Record<string, unknown>>
    ).filter(
      (candidate) => candidate.name === name && candidate.type === "plain_text",
    );
    if (matchingBindings.length !== 1 || matchingBindings[0]?.text !== value) {
      throw new Error(`active Worker binding ${name} is not release-bound`);
    }
  }
}

type QualifiedDeploymentIdentity = Pick<
  QualifiedRunnerReleaseV6,
  | "evidenceCommit"
  | "sourceCommit"
  | "sourceTreeSha256"
  | "registryDigest"
  | "qualifiedAt"
  | "localImageTag"
  | "localImageDigest"
  | "adapterImageTag"
  | "adapterImageDigest"
  | "runtimeToolchainSha256"
  | "runtimePolicySha256"
  | "proofDependencyManifestSha256"
  | "aggregateLimitEvidenceSha256"
  | "runtimeAdapterSha256"
  | "generationIsolationEvidenceSha256"
  | "generationIsolationProbeSha256"
  | "generationIsolationVerifiedAt"
>;

type ReleaseCheckDeploymentIdentity = Pick<
  ReleaseCheckReceiptV5,
  | "evidenceCommit"
  | "sourceCommit"
  | "qualifiedRunnerReceiptSha256"
  | "qualifiedAt"
  | "runnerImageTag"
  | "runnerImageDigest"
  | "adapterImageTag"
  | "adapterImageDigest"
  | "registryDigest"
  | "runtimeToolchainSha256"
  | "runtimePolicySha256"
  | "proofDependencyManifestSha256"
  | "aggregateLimitEvidenceSha256"
  | "runtimeAdapterSha256"
  | "generationIsolationEvidenceSha256"
  | "generationIsolationProbeSha256"
  | "generationIsolationVerifiedAt"
  | "releaseCheckGenerationIsolationEvidence"
  | "releaseCheckGenerationIsolationEvidenceSha256"
  | "releaseCheckGenerationIsolationProbeSha256"
  | "releaseCheckGenerationIsolationVerifiedAt"
>;

export function assertDeploymentReceiptBindings(input: {
  qualified: QualifiedDeploymentIdentity;
  qualifiedReceiptBytes: Buffer;
  releaseCheck: ReleaseCheckDeploymentIdentity;
  evidenceCommit: string;
  sourceCommit: string;
  registryDigest: string;
}): void {
  verifyGenerationIsolationEvidence({
    evidence: input.releaseCheck.releaseCheckGenerationIsolationEvidence,
    evidenceSha256:
      input.releaseCheck.releaseCheckGenerationIsolationEvidenceSha256,
    expected: {
      sourceCommit: input.qualified.sourceCommit,
      sourceTreeSha256: input.qualified.sourceTreeSha256,
      localImageTag: input.qualified.localImageTag,
      localImageDigest: input.qualified.localImageDigest,
      probeSha256: input.qualified.generationIsolationProbeSha256,
      verifiedAt: input.releaseCheck.releaseCheckGenerationIsolationVerifiedAt,
    },
  });
  const comparisons: ReadonlyArray<readonly [string, string, string]> = [
    [
      "qualified evidence commit",
      input.qualified.evidenceCommit,
      input.evidenceCommit,
    ],
    [
      "qualified source commit",
      input.qualified.sourceCommit,
      input.sourceCommit,
    ],
    [
      "qualified registry digest",
      input.qualified.registryDigest,
      input.registryDigest,
    ],
    [
      "release-check evidence commit",
      input.releaseCheck.evidenceCommit,
      input.qualified.evidenceCommit,
    ],
    [
      "release-check source commit",
      input.releaseCheck.sourceCommit,
      input.qualified.sourceCommit,
    ],
    [
      "qualified receipt hash",
      input.releaseCheck.qualifiedRunnerReceiptSha256,
      sha256(input.qualifiedReceiptBytes),
    ],
    [
      "qualification time",
      input.releaseCheck.qualifiedAt,
      input.qualified.qualifiedAt,
    ],
    [
      "generation isolation evidence",
      input.releaseCheck.generationIsolationEvidenceSha256,
      input.qualified.generationIsolationEvidenceSha256,
    ],
    [
      "generation isolation probe",
      input.releaseCheck.generationIsolationProbeSha256,
      input.qualified.generationIsolationProbeSha256,
    ],
    [
      "generation isolation verification time",
      input.releaseCheck.generationIsolationVerifiedAt,
      input.qualified.generationIsolationVerifiedAt,
    ],
    [
      "release-check generation isolation probe",
      input.releaseCheck.releaseCheckGenerationIsolationProbeSha256,
      input.qualified.generationIsolationProbeSha256,
    ],
    [
      "runner image tag",
      input.releaseCheck.runnerImageTag,
      input.qualified.localImageTag,
    ],
    [
      "runner image digest",
      input.releaseCheck.runnerImageDigest,
      input.qualified.localImageDigest,
    ],
    [
      "adapter image tag",
      input.releaseCheck.adapterImageTag,
      input.qualified.adapterImageTag,
    ],
    [
      "adapter image digest",
      input.releaseCheck.adapterImageDigest,
      input.qualified.adapterImageDigest,
    ],
    [
      "registry digest",
      input.releaseCheck.registryDigest,
      input.qualified.registryDigest,
    ],
    [
      "runtime toolchain",
      input.releaseCheck.runtimeToolchainSha256,
      input.qualified.runtimeToolchainSha256,
    ],
    [
      "runtime policy",
      input.releaseCheck.runtimePolicySha256,
      input.qualified.runtimePolicySha256,
    ],
    [
      "proof dependency manifest",
      input.releaseCheck.proofDependencyManifestSha256,
      input.qualified.proofDependencyManifestSha256,
    ],
    [
      "aggregate limit evidence",
      input.releaseCheck.aggregateLimitEvidenceSha256,
      input.qualified.aggregateLimitEvidenceSha256,
    ],
    [
      "runtime adapter",
      input.releaseCheck.runtimeAdapterSha256,
      input.qualified.runtimeAdapterSha256,
    ],
  ];
  for (const [label, observed, expected] of comparisons) {
    if (observed !== expected) {
      throw new Error(`deployment ${label} is not release-bound`);
    }
  }
}

async function main(): Promise<void> {
  const root = await realpath(
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  const args = argumentsFrom(process.argv.slice(2));
  const pathFlags = {
    status: [args["--status"], "file"],
    version: [args["--version"], "file"],
    containers: [args["--containers"], "file"],
    config: [args["--config"], "file"],
    qualified: [args["--qualified-receipt"], "file"],
    releaseCheck: [args["--release-check-receipt"], "file"],
    workerArtifactManifest: [args["--worker-artifact-manifest"], "file"],
    workerBundle: [args["--worker-bundle"], "file"],
    client: [args["--client-dir"], "directory"],
    dryRun: [args["--dry-run-dir"], "directory"],
  } as const;
  const paths = Object.fromEntries(
    await Promise.all(
      Object.entries(pathFlags).map(async ([name, [path, kind]]) => [
        name,
        await existingRepositoryPath(root, path, kind),
      ]),
    ),
  ) as Record<keyof typeof pathFlags, string>;
  const receiptPath = await outputPath(root, args["--output"]);
  const frozenWorkerRelease = await verifyFrozenWorkerReleaseManifest(
    root,
    paths.workerArtifactManifest,
  );

  const statusBytes = readFileSync(paths.status);
  const status = JSON.parse(statusBytes.toString("utf8")) as {
    versions?: Array<{ percentage?: number; version_id?: string }>;
  };
  if (!Array.isArray(status.versions) || status.versions.length !== 1) {
    throw new Error("production must have exactly one active Worker version");
  }
  const active = status.versions[0]!;
  if (
    active.percentage !== 100 ||
    active.version_id !== args["--deployed-version-id"]
  ) {
    throw new Error("the deployed Worker is not receiving 100 percent traffic");
  }

  const versionBytes = readFileSync(paths.version);
  const version = JSON.parse(versionBytes.toString("utf8")) as {
    id?: string;
    annotations?: Record<string, string>;
    resources?: { bindings?: Array<Record<string, unknown>> };
  };
  if (
    version.id !== args["--deployed-version-id"] ||
    version.annotations?.["workers/tag"] !== args["--worker-tag"] ||
    version.annotations?.["workers/message"] !== args["--worker-message"]
  ) {
    throw new Error("the active Worker metadata does not match deployment");
  }
  const bindings = version.resources?.bindings;
  const qualifiedBytes = readFileSync(paths.qualified);
  const qualified = parseQualifiedRunnerReleaseV6(
    JSON.parse(qualifiedBytes.toString("utf8")) as unknown,
  );
  const releaseCheckBytes = readFileSync(paths.releaseCheck);
  const releaseCheck = parseReleaseCheckReceiptV5(
    JSON.parse(releaseCheckBytes.toString("utf8")) as unknown,
  );
  assertActiveWorkerReleaseBindings(bindings, {
    workerEvidenceCommit: args["--evidence-commit"],
    runnerSourceCommit: args["--source-commit"],
    runnerImageDigest: args["--registry-digest"],
    generationIsolationEvidenceSha256:
      qualified.generationIsolationEvidenceSha256,
    generationIsolationProbeSha256: qualified.generationIsolationProbeSha256,
    releaseCheckGenerationIsolationEvidenceSha256:
      releaseCheck.releaseCheckGenerationIsolationEvidenceSha256,
    releaseCheckGenerationIsolationProbeSha256:
      releaseCheck.releaseCheckGenerationIsolationProbeSha256,
    releaseCheckGenerationIsolationVerifiedAt:
      releaseCheck.releaseCheckGenerationIsolationVerifiedAt,
    timeoutCleanupReceiptSha256: qualified.timeoutCleanupReceiptSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
    runtimePolicySha256: qualified.runtimePolicySha256,
    proofDependencyManifestSha256: qualified.proofDependencyManifestSha256,
    workerArtifactClassification: frozenWorkerRelease.identity.classification,
    workerArtifactManifestSha256: frozenWorkerRelease.identity.manifestSha256,
    workerBundleSha256: frozenWorkerRelease.identity.workerBundleSha256,
    clientAssetsSha256: frozenWorkerRelease.identity.clientAssetsSha256,
    clientAssetCount: frozenWorkerRelease.identity.clientAssetCount,
    clientPublicAssetsSha256:
      frozenWorkerRelease.identity.clientPublicAssetsSha256,
    clientPublicAssetCount: frozenWorkerRelease.identity.clientPublicAssetCount,
    viteVersion: frozenWorkerRelease.identity.viteVersion,
    wranglerVersion: frozenWorkerRelease.identity.wranglerVersion,
  });
  if (
    !bindings.some(
      (binding) =>
        binding.name === "CF_VERSION_METADATA" &&
        binding.type === "version_metadata",
    )
  ) {
    throw new Error("active Worker lacks version metadata");
  }

  assertDeploymentReceiptBindings({
    qualified,
    qualifiedReceiptBytes: qualifiedBytes,
    releaseCheck,
    evidenceCommit: args["--evidence-commit"],
    sourceCommit: args["--source-commit"],
    registryDigest: args["--registry-digest"],
  });

  const containersBytes = readFileSync(paths.containers);
  const containers = JSON.parse(containersBytes.toString("utf8")) as unknown;
  const container = selectQualifiedContainer({
    containers,
    containerName: args["--container-name"],
    requestedImage: args["--container-image"],
    registryImage: qualified.registryImage,
    registryDigest: qualified.registryDigest,
  });
  const containerVersion = String(container.version ?? "");
  if (
    !["active", "ready"].includes(container.state ?? "") ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(container.id ?? "") ||
    !/^[1-9][0-9]*$/.test(containerVersion)
  ) {
    throw new Error("active Container does not expose the qualified digest");
  }

  if (frozenWorkerRelease.identity.sourceCommit !== args["--evidence-commit"]) {
    throw new Error("frozen Worker release does not bind the evidence commit");
  }
  const client = await collectFrozenClientAssets(root, paths.client);
  if (
    client.clientAssetsSha256 !==
      frozenWorkerRelease.identity.clientAssetsSha256 ||
    client.clientAssetCount !== frozenWorkerRelease.identity.clientAssetCount ||
    client.clientPublicAssetsSha256 !==
      frozenWorkerRelease.identity.clientPublicAssetsSha256 ||
    client.clientPublicAssetCount !==
      frozenWorkerRelease.identity.clientPublicAssetCount
  ) {
    throw new Error("client assets differ from the frozen release manifest");
  }
  const workerBundleSha256 = sha256(readFileSync(paths.workerBundle));
  if (workerBundleSha256 !== frozenWorkerRelease.identity.workerBundleSha256) {
    throw new Error("Worker bundle differs from the frozen release manifest");
  }
  const dryRun = dryRunWorkerHash(root, paths.dryRun, workerBundleSha256);
  const configBytes = readFileSync(paths.config);
  const receipt = DeploymentReceiptV7Schema.parse({
    schemaVersion: "7",
    status: "DEPLOYED",
    workerName: "counterlab",
    productionOrigin: "https://counterlab.cserules.workers.dev",
    generationFilesystemReadIsolation:
      releaseCheck.generationFilesystemReadIsolation,
    generationIsolationEvidenceSha256:
      releaseCheck.generationIsolationEvidenceSha256,
    generationIsolationProbeSha256: releaseCheck.generationIsolationProbeSha256,
    generationIsolationVerifiedAt: releaseCheck.generationIsolationVerifiedAt,
    releaseCheckGenerationIsolationEvidenceSha256:
      releaseCheck.releaseCheckGenerationIsolationEvidenceSha256,
    releaseCheckGenerationIsolationProbeSha256:
      releaseCheck.releaseCheckGenerationIsolationProbeSha256,
    releaseCheckGenerationIsolationVerifiedAt:
      releaseCheck.releaseCheckGenerationIsolationVerifiedAt,
    workerEvidenceCommit: args["--evidence-commit"],
    runnerSourceCommit: args["--source-commit"],
    qualifiedRunnerReceiptSha256: sha256(qualifiedBytes),
    releaseCheckReceiptSha256: sha256(releaseCheckBytes),
    releaseCheckCheckedAt: releaseCheck.checkedAt,
    timeoutCleanupReceiptSha256: qualified.timeoutCleanupReceiptSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
    runtimeToolchainSha256: releaseCheck.runtimeToolchainSha256,
    runtimePolicySha256: releaseCheck.runtimePolicySha256,
    proofDependencyManifestSha256: releaseCheck.proofDependencyManifestSha256,
    runtimeAdapterSha256: releaseCheck.runtimeAdapterSha256,
    adapterImageDigest: releaseCheck.adapterImageDigest,
    workerVersionId: active.version_id,
    workerTag: args["--worker-tag"],
    workerMessage: args["--worker-message"],
    containerApplicationId: container.id,
    containerApplicationVersion: containerVersion,
    containerImage: container.image,
    containerState: container.state,
    containerImageDigest: args["--registry-digest"],
    workerArtifactClassification: frozenWorkerRelease.identity.classification,
    workerArtifactManifestSha256: frozenWorkerRelease.identity.manifestSha256,
    deployConfigSha256: sha256(configBytes),
    workerBundleSha256,
    clientAssetsSha256: client.clientAssetsSha256,
    clientAssetCount: client.clientAssetCount,
    clientPublicAssetsSha256: client.clientPublicAssetsSha256,
    clientPublicAssetCount: client.clientPublicAssetCount,
    viteVersion: frozenWorkerRelease.identity.viteVersion,
    wranglerVersion: frozenWorkerRelease.identity.wranglerVersion,
    dryRunSha256: dryRun.sha256,
    dryRunFileCount: dryRun.count,
    deploymentStatusSha256: sha256(statusBytes),
    workerVersionSha256: sha256(versionBytes),
    containerStatusSha256: sha256(containersBytes),
    deployedAt: new Date().toISOString(),
    verifierVersion: "counterlab-deployment-v7",
  });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${receipt.workerVersionId}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
