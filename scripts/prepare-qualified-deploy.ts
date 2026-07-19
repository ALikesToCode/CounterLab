import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import {
  ContainedRuntimeAttestationSchema,
  QualifiedRunnerReleaseSchema,
} from "../packages/scientific-engine-registry/src/index.js";
import { canonicalJson } from "../packages/session-core/src/index.js";
import { assertReleaseCheckBinding } from "./release-check-receipt.js";

type Arguments = {
  config: string;
  receipt: string;
  releaseCheckReceipt: string;
  image: string;
  output: string;
};

export type QualifiedReleaseObservation = {
  sourceCommit: string;
  sourceArchiveSha256: string;
  sourceTreeSha256: string;
  dockerfileSha256: string;
  localImageTag: string;
  localImageDigest: string;
  ociRevision: string;
  ociSourceTreeSha256: string;
  engineAuthorityHash: string;
  runtimeManifestHash: string;
  runtimeToolchainSha256: string;
  toolchainLockSha256: string;
  runtimeAdapterSha256: string;
  buildctlSha256: string;
  buildkitdSha256: string;
  buildkitConfigSha256: string;
  adapterDockerfileSha256: string;
  adapterImageTag: string;
  adapterImageDigest: string;
  adapterManifestDigest: string;
  adapterOciArchiveSha256: string;
  adapterOciRevision: string;
  adapterOciSourceTreeSha256: string;
  registryImage: string;
  registryDigest: string;
  registryResolvedAt: string;
  currentCommit: string;
  sourceIsAncestor: boolean;
  changedPaths: string[];
  observedAt: string;
};

const RELEASE_EVIDENCE_PATHS = ["scientific-engines/", "docs/sbom/"] as const;
const RELEASE_EVIDENCE_FILES = new Set([
  "docs/DECISIONS.md",
  "docs/DEPENDENCY_ADMISSION.md",
  "docs/FIRST_PRIZE_UPGRADE_PLAN.md",
  "docs/PROGRESS.md",
  "docs/SCIENTIFIC_ENGINES.md",
]);

async function configureContainedEnvironment(root: string): Promise<void> {
  const cacheRoot = resolve(root, "node_modules/.cache/counterlab-v6.1");
  const environment = {
    HOME: resolve(cacheRoot, "home"),
    TMPDIR: resolve(cacheRoot, "tmp"),
    XDG_CACHE_HOME: resolve(cacheRoot, "xdg-cache"),
    XDG_CONFIG_HOME: resolve(cacheRoot, "xdg-config"),
    XDG_DATA_HOME: resolve(cacheRoot, "xdg-data"),
  } as const;
  await Promise.all(
    Object.values(environment).map((path) => mkdir(path, { recursive: true })),
  );
  Object.assign(process.env, environment, { CI: "1" });
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRepositoryPath(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!pathFromRoot.startsWith("..") && !isAbsolute(pathFromRoot))
  );
}

async function existingRepositoryFile(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(`release input escapes the repository: ${requested}`);
  }
  const resolved = await realpath(candidate);
  if (!isRepositoryPath(root, resolved) || !(await stat(resolved)).isFile()) {
    throw new Error(`release input is not a repository file: ${requested}`);
  }
  return resolved;
}

async function repositoryOutputPath(
  root: string,
  requested: string,
): Promise<string> {
  const output = resolve(root, requested);
  if (!isRepositoryPath(root, output)) {
    throw new Error(`release output escapes the repository: ${requested}`);
  }
  const parent = await realpath(dirname(output));
  if (!isRepositoryPath(root, parent)) {
    throw new Error(
      `release output parent escapes the repository: ${requested}`,
    );
  }
  return output;
}

function commandBuffer(root: string, command: string, args: string[]): Buffer {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
}

function commandText(root: string, command: string, args: string[]): string {
  return commandBuffer(root, command, args).toString("utf8").trim();
}

function evidenceOnly(path: string): boolean {
  return (
    RELEASE_EVIDENCE_FILES.has(path) ||
    RELEASE_EVIDENCE_PATHS.some((prefix) => path.startsWith(prefix))
  );
}

function assertQualifiedObservation(
  observation: QualifiedReleaseObservation,
): void {
  if (!observation.sourceIsAncestor) {
    throw new Error(
      "qualified source commit is not an ancestor of the evidence commit",
    );
  }
  const unauthorized = observation.changedPaths.filter(
    (path) => !evidenceOnly(path),
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `qualified evidence commit changes runtime source: ${unauthorized.join(", ")}`,
    );
  }
}

async function resolveRegistryDigest(input: {
  root: string;
  registryImage: string;
  expectedConfigDigest: string;
  expectedManifestDigest: string;
}): Promise<{
  digest: string;
  resolvedAt: string;
  user: string;
  labels: Record<string, string>;
}> {
  const imageUrl = new URL(`https://${input.registryImage}`);
  if (imageUrl.hostname !== "registry.cloudflare.com") {
    throw new Error(
      "qualified registry image must use registry.cloudflare.com",
    );
  }
  const match = imageUrl.pathname.match(
    /^\/([A-Za-z0-9_-]{3,64})\/(counterlab-runner):([^/]+)$/,
  );
  if (match === null) {
    throw new Error(
      "qualified registry image has an invalid account, repository, or tag",
    );
  }
  const credentials = JSON.parse(
    commandText(input.root, resolve(input.root, "node_modules/.bin/wrangler"), [
      "containers",
      "registries",
      "credentials",
      "registry.cloudflare.com",
      "--pull",
      "--expiration-minutes",
      "5",
      "--json",
      "--config",
      "apps/web/wrangler.jsonc",
    ]),
  ) as {
    username?: string;
    password?: string;
  };
  if (
    typeof credentials.username !== "string" ||
    credentials.username.length === 0 ||
    typeof credentials.password !== "string" ||
    credentials.password.length < 32
  ) {
    throw new Error("Cloudflare returned invalid scoped registry credentials");
  }
  const response = await fetch(
    `https://registry.cloudflare.com/v2/${match[1]}/${match[2]}/manifests/${match[3]}`,
    {
      method: "GET",
      headers: {
        Accept:
          "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok) {
    throw new Error(
      `qualified registry image could not be resolved (${response.status})`,
    );
  }
  const manifestBytes = Buffer.from(await response.arrayBuffer());
  const bodyDigest = `sha256:${sha256(manifestBytes)}`;
  const digest = response.headers.get("Docker-Content-Digest") ?? bodyDigest;
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(
      "qualified registry image returned no valid manifest digest",
    );
  }
  if (digest !== bodyDigest) {
    throw new Error(
      "qualified registry manifest digest does not match its bytes",
    );
  }
  if (digest !== input.expectedManifestDigest) {
    throw new Error(
      "qualified registry manifest differs from the built OCI manifest",
    );
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8")) as {
    schemaVersion?: number;
    config?: { digest?: string };
  };
  if (
    manifest.schemaVersion !== 2 ||
    manifest.config?.digest !== input.expectedConfigDigest
  ) {
    throw new Error(
      "qualified registry manifest is not bound to the built OCI config",
    );
  }
  const configResponse = await fetch(
    `https://registry.cloudflare.com/v2/${match[1]}/${match[2]}/blobs/${input.expectedConfigDigest}`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!configResponse.ok) {
    throw new Error(
      `qualified registry config could not be resolved (${configResponse.status})`,
    );
  }
  const configBytes = Buffer.from(await configResponse.arrayBuffer());
  if (`sha256:${sha256(configBytes)}` !== input.expectedConfigDigest) {
    throw new Error(
      "qualified registry config digest does not match its bytes",
    );
  }
  const config = JSON.parse(configBytes.toString("utf8")) as {
    config?: { User?: string; Labels?: Record<string, string> };
  };
  return {
    digest,
    resolvedAt: new Date().toISOString(),
    user: config.config?.User ?? "",
    labels: config.config?.Labels ?? {},
  };
}

export async function collectRunnerReleaseEvidence(input: {
  root: string;
  sourceCommit: string;
  localImageTag: string;
  runtimeAdapter: string;
  expectedRegistryDigest: string;
  registryImage: string;
  adapterImageTag: string;
  adapterManifestDigest: string;
  adapterOciArchiveSha256: string;
}): Promise<QualifiedReleaseObservation> {
  const root = resolve(input.root);
  const runtimeAdapter = await existingRepositoryFile(
    root,
    input.runtimeAdapter,
  );
  if (((await stat(runtimeAdapter)).mode & 0o111) === 0) {
    throw new Error("runtime adapter is not executable");
  }
  const runtimeAttestation = ContainedRuntimeAttestationSchema.parse(
    JSON.parse(
      commandText(root, runtimeAdapter, ["counterlab-attest"]),
    ) as unknown,
  );
  const localImageDigest = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.localImageTag,
    "--format",
    "{{.Id}}",
  ]);
  const localImageUser = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.localImageTag,
    "--format",
    "{{.Config.User}}",
  ]);
  const localOciRevision = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.localImageTag,
    "--format",
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  ]);
  const localSourceTree = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.localImageTag,
    "--format",
    '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
  ]);
  const adapterImageDigest = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.adapterImageTag,
    "--format",
    "{{.Id}}",
  ]);
  const adapterImageUser = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.adapterImageTag,
    "--format",
    "{{.Config.User}}",
  ]);
  const adapterOciRevision = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.adapterImageTag,
    "--format",
    '{{index .Config.Labels "org.opencontainers.image.revision"}}',
  ]);
  const adapterOciSourceTreeSha256 = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    input.adapterImageTag,
    "--format",
    '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}',
  ]);
  if (!/^sha256:[a-f0-9]{64}$/.test(localImageDigest)) {
    throw new Error("runtime adapter returned an invalid local image digest");
  }
  if (localImageUser !== "10001:10001") {
    throw new Error("qualified local image must run as 10001:10001");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(adapterImageDigest)) {
    throw new Error("runtime adapter returned an invalid adapter image digest");
  }
  if (adapterImageUser !== "65532:65532") {
    throw new Error("qualified adapter image must run as 65532:65532");
  }
  if (
    adapterOciRevision !== input.sourceCommit ||
    adapterOciSourceTreeSha256 !== localSourceTree
  ) {
    throw new Error("qualified adapter provenance labels do not match");
  }
  const currentCommit = commandText(root, "git", ["rev-parse", "HEAD"]);
  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", input.sourceCommit, currentCommit],
    { cwd: root, stdio: "ignore" },
  );
  const changedPaths = commandText(root, "git", [
    "diff",
    "--name-only",
    `${input.sourceCommit}..${currentCommit}`,
  ])
    .split("\n")
    .filter(Boolean);
  const snapshotHash = JSON.parse(
    readFileSync(
      resolve(root, "scientific-engines/snapshot-hash.json"),
      "utf8",
    ),
  ) as { authorityHash?: string };
  const runtimeManifest = JSON.parse(
    readFileSync(
      resolve(root, "scientific-engines/runtime-manifest.json"),
      "utf8",
    ),
  ) as unknown;
  const registry = await resolveRegistryDigest({
    root,
    registryImage: input.registryImage,
    expectedConfigDigest: localImageDigest,
    expectedManifestDigest: input.expectedRegistryDigest,
  });
  if (registry.user !== "10001:10001") {
    throw new Error("qualified registry image must run as 10001:10001");
  }
  const registryRevision =
    registry.labels["org.opencontainers.image.revision"] ?? "";
  const registrySourceTree =
    registry.labels["io.counterlab.source-tree-sha256"] ?? "";
  if (
    localOciRevision !== input.sourceCommit ||
    registryRevision !== localOciRevision ||
    registrySourceTree !== localSourceTree
  ) {
    throw new Error("local and promoted runner provenance labels do not match");
  }

  return {
    sourceCommit: input.sourceCommit,
    sourceArchiveSha256: sha256(
      commandBuffer(root, "git", [
        "archive",
        "--format=tar",
        input.sourceCommit,
      ]),
    ),
    sourceTreeSha256: sha256(
      commandBuffer(root, "git", [
        "ls-tree",
        "-r",
        "--full-tree",
        input.sourceCommit,
      ]),
    ),
    dockerfileSha256: sha256(
      commandBuffer(root, "git", [
        "show",
        `${input.sourceCommit}:Dockerfile.runner`,
      ]),
    ),
    localImageTag: input.localImageTag,
    localImageDigest,
    ociRevision: registryRevision,
    ociSourceTreeSha256: registrySourceTree,
    engineAuthorityHash: snapshotHash.authorityHash ?? "",
    runtimeManifestHash: sha256(canonicalJson(runtimeManifest)),
    runtimeToolchainSha256: runtimeAttestation.runtimeToolchainSha256,
    toolchainLockSha256: runtimeAttestation.toolchainLockSha256,
    runtimeAdapterSha256: runtimeAttestation.adapterSha256,
    buildctlSha256: runtimeAttestation.componentSha256.buildctl,
    buildkitdSha256: runtimeAttestation.componentSha256.buildkitd,
    buildkitConfigSha256: runtimeAttestation.fileSha256.buildkitConfig,
    adapterDockerfileSha256: sha256(
      commandBuffer(root, "git", [
        "show",
        `${input.sourceCommit}:services/runner/Dockerfile`,
      ]),
    ),
    adapterImageTag: input.adapterImageTag,
    adapterImageDigest,
    adapterManifestDigest: input.adapterManifestDigest,
    adapterOciArchiveSha256: input.adapterOciArchiveSha256,
    adapterOciRevision,
    adapterOciSourceTreeSha256,
    registryImage: input.registryImage,
    registryDigest: registry.digest,
    registryResolvedAt: registry.resolvedAt,
    currentCommit,
    sourceIsAncestor: ancestry.status === 0,
    changedPaths,
    observedAt: new Date().toISOString(),
  };
}

export async function collectQualifiedReleaseObservation(input: {
  root: string;
  receipt: unknown;
}): Promise<QualifiedReleaseObservation> {
  const receipt = QualifiedRunnerReleaseSchema.parse(input.receipt);
  const runtimeAdapter = process.env.COUNTERLAB_DOCKER_BIN;
  if (runtimeAdapter === undefined || runtimeAdapter.trim().length === 0) {
    throw new Error(
      "COUNTERLAB_DOCKER_BIN must name the repository-contained runtime adapter",
    );
  }
  return collectRunnerReleaseEvidence({
    root: input.root,
    sourceCommit: receipt.sourceCommit,
    localImageTag: receipt.localImageTag,
    runtimeAdapter,
    expectedRegistryDigest: receipt.registryDigest,
    registryImage: receipt.registryImage,
    adapterImageTag: receipt.adapterImageTag,
    adapterManifestDigest: receipt.adapterManifestDigest,
    adapterOciArchiveSha256: receipt.adapterOciArchiveSha256,
  });
}

export function createQualifiedRunnerRelease(
  observation: QualifiedReleaseObservation,
  qualifiedAt = new Date().toISOString(),
): unknown {
  assertQualifiedObservation(observation);
  return QualifiedRunnerReleaseSchema.parse({
    schemaVersion: "3",
    status: "VERIFIED",
    sourceCommit: observation.sourceCommit,
    sourceArchiveSha256: observation.sourceArchiveSha256,
    sourceTreeSha256: observation.sourceTreeSha256,
    dockerfileSha256: observation.dockerfileSha256,
    localImageTag: observation.localImageTag,
    localImageDigest: observation.localImageDigest,
    ociRevision: observation.ociRevision,
    ociSourceTreeSha256: observation.ociSourceTreeSha256,
    engineAuthorityHash: observation.engineAuthorityHash,
    runtimeManifestHash: observation.runtimeManifestHash,
    runtimeToolchainSha256: observation.runtimeToolchainSha256,
    toolchainLockSha256: observation.toolchainLockSha256,
    runtimeAdapterSha256: observation.runtimeAdapterSha256,
    buildctlSha256: observation.buildctlSha256,
    buildkitdSha256: observation.buildkitdSha256,
    buildkitConfigSha256: observation.buildkitConfigSha256,
    adapterDockerfileSha256: observation.adapterDockerfileSha256,
    adapterImageTag: observation.adapterImageTag,
    adapterImageDigest: observation.adapterImageDigest,
    adapterManifestDigest: observation.adapterManifestDigest,
    adapterOciArchiveSha256: observation.adapterOciArchiveSha256,
    adapterOciRevision: observation.adapterOciRevision,
    adapterOciSourceTreeSha256: observation.adapterOciSourceTreeSha256,
    evidenceCommit: observation.currentCommit,
    registryImage: observation.registryImage,
    registryDigest: observation.registryDigest,
    registryResolvedAt: observation.registryResolvedAt,
    qualifiedAt,
    verifierVersion: "counterlab-release-v3",
  });
}

function argumentsFrom(argv: string[]): Arguments {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      ![
        "--config",
        "--receipt",
        "--release-check-receipt",
        "--image",
        "--output",
      ].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: prepare-qualified-deploy --config FILE --receipt FILE --release-check-receipt FILE --image REGISTRY_IMAGE --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 5) {
    throw new Error(
      "Usage: prepare-qualified-deploy --config FILE --receipt FILE --release-check-receipt FILE --image REGISTRY_IMAGE --output FILE",
    );
  }
  return {
    config: values.get("--config")!,
    receipt: values.get("--receipt")!,
    releaseCheckReceipt: values.get("--release-check-receipt")!,
    image: values.get("--image")!,
    output: values.get("--output")!,
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}

function assertProductionBindings(config: Record<string, unknown>): void {
  if (
    config.name !== "counterlab" ||
    config.main !== "index.js" ||
    config.compatibility_date !== "2026-07-14" ||
    JSON.stringify(config.compatibility_flags) !==
      JSON.stringify(["nodejs_compat"])
  ) {
    throw new Error("Wrangler Worker identity is not release-bound");
  }
  const variables = record(config.vars, "Worker vars");
  const requiredVariables = {
    OPENAI_MODEL: "gpt-5.6",
    OPENAI_REASONING_EFFORT: "medium",
    OPENAI_TIMEOUT_MS: "180000",
    COUNTERLAB_MAX_NOTEBOOK_BYTES: "10485760",
    COUNTERLAB_SIGNING_KEY_ID: "counterlab-boundary-v1",
    COUNTERLAB_MAINTENANCE_MODE: "false",
  } as const;
  if (
    JSON.stringify(Object.keys(variables).sort()) !==
    JSON.stringify(Object.keys(requiredVariables).sort())
  ) {
    throw new Error("Wrangler plain-text variables contain an unexpected key");
  }
  for (const [name, expected] of Object.entries(requiredVariables)) {
    if (variables[name] !== expected) {
      throw new Error(
        `Wrangler behavior variable ${name} is not release-bound`,
      );
    }
  }
  const assets = record(config.assets, "assets config");
  if (
    assets.directory !== "../client" ||
    assets.not_found_handling !== "single-page-application" ||
    JSON.stringify(assets.run_worker_first) !==
      JSON.stringify(["/api/*", "/ready"])
  ) {
    throw new Error("Wrangler assets must preserve Worker-first API routing");
  }
  const versionMetadata = record(
    config.version_metadata,
    "Worker version metadata",
  );
  if (versionMetadata.binding !== "CF_VERSION_METADATA") {
    throw new Error("Worker version metadata binding is not release-bound");
  }

  const databases = config.d1_databases;
  if (!Array.isArray(databases) || databases.length !== 1) {
    throw new Error("Wrangler config must contain exactly one D1 database");
  }
  const database = record(databases[0], "D1 database config");
  if (
    database.binding !== "DB" ||
    database.database_name !== "counterlab" ||
    database.database_id !== "64caa8fc-b9b6-4393-81fa-d856ff774a36" ||
    database.migrations_dir !== "../../migrations"
  ) {
    throw new Error("Wrangler D1 binding does not match CounterLab production");
  }

  const buckets = config.r2_buckets;
  if (!Array.isArray(buckets) || buckets.length !== 1) {
    throw new Error("Wrangler config must contain exactly one R2 bucket");
  }
  const bucket = record(buckets[0], "R2 bucket config");
  if (
    bucket.binding !== "ARTIFACTS" ||
    bucket.bucket_name !== "counterlab-artifacts"
  ) {
    throw new Error("Wrangler R2 binding does not match CounterLab production");
  }

  const durableObjects = record(
    config.durable_objects,
    "Durable Object config",
  );
  if (!Array.isArray(durableObjects.bindings)) {
    throw new Error("Wrangler Durable Object bindings are missing");
  }
  const bindings = durableObjects.bindings
    .map((binding) => record(binding, "Durable Object binding"))
    .map((binding) => `${String(binding.name)}:${String(binding.class_name)}`)
    .sort();
  if (
    JSON.stringify(bindings) !==
    JSON.stringify(["ADMISSION:CounterLabAdmission", "RUNNER:CounterLabRunner"])
  ) {
    throw new Error(
      "Wrangler Durable Object authority bindings are incomplete",
    );
  }

  if (!Array.isArray(config.migrations)) {
    throw new Error("Wrangler Durable Object migrations are missing");
  }
  const migrations = config.migrations.map((migration) =>
    record(migration, "Durable Object migration"),
  );
  if (
    migrations.length !== 2 ||
    migrations[0]?.tag !== "v1" ||
    JSON.stringify(migrations[0]?.new_sqlite_classes) !==
      JSON.stringify(["CounterLabRunner"]) ||
    migrations[1]?.tag !== "v2" ||
    JSON.stringify(migrations[1]?.new_sqlite_classes) !==
      JSON.stringify(["CounterLabAdmission"])
  ) {
    throw new Error("Wrangler Durable Object migrations are incomplete");
  }
  const observability = record(config.observability, "observability config");
  if (observability.enabled !== true) {
    throw new Error("Wrangler observability must remain enabled");
  }
}

export function qualifiedDeployConfig(input: {
  config: unknown;
  receipt: unknown;
  image: string;
  observation: QualifiedReleaseObservation;
}): Record<string, unknown> {
  const config = structuredClone(record(input.config, "Wrangler config"));
  const receipt = QualifiedRunnerReleaseSchema.parse(input.receipt);
  const comparisons: Array<[string, string, string]> = [
    ["source commit", receipt.sourceCommit, input.observation.sourceCommit],
    [
      "source archive",
      receipt.sourceArchiveSha256,
      input.observation.sourceArchiveSha256,
    ],
    [
      "source tree",
      receipt.sourceTreeSha256,
      input.observation.sourceTreeSha256,
    ],
    [
      "Dockerfile",
      receipt.dockerfileSha256,
      input.observation.dockerfileSha256,
    ],
    ["local image tag", receipt.localImageTag, input.observation.localImageTag],
    [
      "local image digest",
      receipt.localImageDigest,
      input.observation.localImageDigest,
    ],
    ["OCI revision", receipt.ociRevision, input.observation.ociRevision],
    [
      "OCI source tree",
      receipt.ociSourceTreeSha256,
      input.observation.ociSourceTreeSha256,
    ],
    [
      "engine authority",
      receipt.engineAuthorityHash,
      input.observation.engineAuthorityHash,
    ],
    [
      "runtime manifest",
      receipt.runtimeManifestHash,
      input.observation.runtimeManifestHash,
    ],
    [
      "runtime toolchain",
      receipt.runtimeToolchainSha256,
      input.observation.runtimeToolchainSha256,
    ],
    [
      "toolchain lock",
      receipt.toolchainLockSha256,
      input.observation.toolchainLockSha256,
    ],
    [
      "runtime adapter",
      receipt.runtimeAdapterSha256,
      input.observation.runtimeAdapterSha256,
    ],
    ["buildctl", receipt.buildctlSha256, input.observation.buildctlSha256],
    ["buildkitd", receipt.buildkitdSha256, input.observation.buildkitdSha256],
    [
      "BuildKit config",
      receipt.buildkitConfigSha256,
      input.observation.buildkitConfigSha256,
    ],
    [
      "adapter Dockerfile",
      receipt.adapterDockerfileSha256,
      input.observation.adapterDockerfileSha256,
    ],
    [
      "adapter image tag",
      receipt.adapterImageTag,
      input.observation.adapterImageTag,
    ],
    [
      "adapter image digest",
      receipt.adapterImageDigest,
      input.observation.adapterImageDigest,
    ],
    [
      "adapter manifest",
      receipt.adapterManifestDigest,
      input.observation.adapterManifestDigest,
    ],
    [
      "adapter OCI archive",
      receipt.adapterOciArchiveSha256,
      input.observation.adapterOciArchiveSha256,
    ],
    [
      "adapter OCI revision",
      receipt.adapterOciRevision,
      input.observation.adapterOciRevision,
    ],
    [
      "adapter source tree",
      receipt.adapterOciSourceTreeSha256,
      input.observation.adapterOciSourceTreeSha256,
    ],
    ["registry image", receipt.registryImage, input.observation.registryImage],
    [
      "registry digest",
      receipt.registryDigest,
      input.observation.registryDigest,
    ],
  ];
  for (const [label, expected, observed] of comparisons) {
    if (expected !== observed) {
      throw new Error(
        `qualified ${label} does not match recomputed release evidence`,
      );
    }
  }
  if (input.observation.currentCommit !== receipt.evidenceCommit) {
    throw new Error("qualified evidence commit is not the current HEAD");
  }
  assertQualifiedObservation(input.observation);
  const qualifiedAt = Date.parse(receipt.qualifiedAt);
  const observedAt = Date.parse(input.observation.observedAt);
  if (
    !Number.isFinite(qualifiedAt) ||
    !Number.isFinite(observedAt) ||
    qualifiedAt > observedAt + 5 * 60_000 ||
    observedAt - qualifiedAt > 24 * 60 * 60_000
  ) {
    throw new Error("qualified release receipt is stale or future-dated");
  }
  const imageMatch = input.image.match(
    /^registry\.cloudflare\.com\/([A-Za-z0-9_-]{3,64})\/counterlab-runner:git-([a-f0-9]{40})$/,
  );
  if (imageMatch === null) {
    throw new Error(
      "qualified image must use registry.cloudflare.com/<account>/counterlab-runner:git-<source-commit>",
    );
  }
  if (imageMatch[2] !== receipt.sourceCommit) {
    throw new Error(
      "qualified image tag does not match the receipt source commit",
    );
  }
  if (input.image !== receipt.registryImage) {
    throw new Error(
      "qualified image does not match the promoted registry image",
    );
  }
  if (config.account_id !== imageMatch[1]) {
    throw new Error(
      "qualified image account does not match Wrangler account_id",
    );
  }
  assertProductionBindings(config);

  if (!Array.isArray(config.containers) || config.containers.length !== 1) {
    throw new Error("Wrangler config must contain exactly one Container");
  }
  const container = record(config.containers[0], "Container config");
  if (container.class_name !== "CounterLabRunner") {
    throw new Error("qualified image may bind only to CounterLabRunner");
  }
  const ssh = record(container.wrangler_ssh, "Container SSH config");
  if (
    container.name !== "counterlab-counterlabrunner" ||
    container.max_instances !== 10 ||
    container.instance_type !== "basic" ||
    ssh.enabled !== false
  ) {
    throw new Error("qualified Container capacity or SSH policy changed");
  }
  container.image = input.image.replace(
    /:git-[a-f0-9]{40}$/,
    `@${receipt.registryDigest}`,
  );
  delete container.image_vars;
  delete container.image_build_context;
  config.containers = [container];
  config.vars = {
    ...record(config.vars, "Worker vars"),
    COUNTERLAB_WORKER_EVIDENCE_COMMIT: receipt.evidenceCommit,
    COUNTERLAB_RUNNER_SOURCE_COMMIT: receipt.sourceCommit,
    COUNTERLAB_RUNNER_IMAGE_DIGEST: receipt.registryDigest,
  };
  return config;
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2));
  const root = await realpath(resolve(import.meta.dirname, ".."));
  await configureContainedEnvironment(root);
  const [configPath, receiptPath, releaseCheckReceiptPath] = await Promise.all([
    existingRepositoryFile(root, args.config),
    existingRepositoryFile(root, args.receipt),
    existingRepositoryFile(root, args.releaseCheckReceipt),
  ]);
  const [configText, receiptBytes, releaseCheckReceiptText] = await Promise.all(
    [
      readFile(configPath, "utf8"),
      readFile(receiptPath),
      readFile(releaseCheckReceiptPath, "utf8"),
    ],
  );
  const receipt = JSON.parse(receiptBytes.toString("utf8")) as unknown;
  const observation = await collectQualifiedReleaseObservation({
    root,
    receipt,
  });
  const runtimeAdapter = process.env.COUNTERLAB_DOCKER_BIN;
  if (runtimeAdapter === undefined) {
    throw new Error("COUNTERLAB_DOCKER_BIN is required for deployment");
  }
  assertReleaseCheckBinding({
    qualifiedReceipt: receipt,
    qualifiedReceiptBytes: receiptBytes,
    releaseCheckReceipt: JSON.parse(releaseCheckReceiptText) as unknown,
    runtimeAttestation: JSON.parse(
      commandText(root, runtimeAdapter, ["counterlab-attest"]),
    ) as unknown,
    currentCommit: observation.currentCommit,
    worktreeClean:
      commandText(root, "git", [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]).length === 0,
    runnerImageDigest: observation.localImageDigest,
    adapterImageDigest: observation.adapterImageDigest,
    observedAt: observation.observedAt,
  });
  const generated = qualifiedDeployConfig({
    config: JSON.parse(configText) as unknown,
    receipt,
    image: args.image,
    observation,
  });
  const output = await repositoryOutputPath(root, args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(generated, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Qualified deploy config: ${output}`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
