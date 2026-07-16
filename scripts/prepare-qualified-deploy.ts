import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { QualifiedRunnerReleaseSchema } from "../packages/scientific-engine-registry/src/index.js";
import { canonicalJson } from "../packages/session-core/src/index.js";

type Arguments = {
  config: string;
  receipt: string;
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

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function commandBuffer(root: string, command: string, args: string[]): Buffer {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 256 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
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
}): Promise<{ digest: string; resolvedAt: string }> {
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
    commandText(input.root, "pnpm", [
      "exec",
      "wrangler",
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
    account_id?: string;
    registry_host?: string;
    username?: string;
    password?: string;
  };
  if (
    credentials.account_id !== match[1] ||
    credentials.registry_host !== "registry.cloudflare.com" ||
    typeof credentials.username !== "string" ||
    typeof credentials.password !== "string"
  ) {
    throw new Error("Cloudflare returned invalid scoped registry credentials");
  }
  const response = await fetch(
    `https://registry.cloudflare.com/v2/${match[1]}/${match[2]}/manifests/${match[3]}`,
    {
      method: "HEAD",
      headers: {
        Accept:
          "application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json",
        Authorization: `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString("base64")}`,
      },
    },
  );
  if (!response.ok) {
    throw new Error(
      `qualified registry image could not be resolved (${response.status})`,
    );
  }
  const digest = response.headers.get("Docker-Content-Digest") ?? "";
  if (!/^sha256:[a-f0-9]{64}$/.test(digest)) {
    throw new Error(
      "qualified registry image returned no valid manifest digest",
    );
  }
  return { digest, resolvedAt: new Date().toISOString() };
}

export async function collectRunnerReleaseEvidence(input: {
  root: string;
  sourceCommit: string;
  localImageTag: string;
  registryImage: string;
}): Promise<QualifiedReleaseObservation> {
  const root = resolve(input.root);
  const currentCommit = commandText(root, "git", ["rev-parse", "HEAD"]);
  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", input.sourceCommit, currentCommit],
    { cwd: root, stdio: "ignore" },
  );
  const changedPaths = commandText(root, "git", [
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    `${input.sourceCommit}..${currentCommit}`,
  ])
    .split("\n")
    .filter(Boolean);
  const imageInspect = JSON.parse(
    commandText(root, "docker", ["image", "inspect", input.localImageTag]),
  ) as Array<{
    Id?: string;
    Config?: { Labels?: Record<string, string>; User?: string };
  }>;
  const image = imageInspect[0];
  if (image === undefined) {
    throw new Error("qualified local image inspection returned no image");
  }
  if (image.Config?.User !== "10001:10001") {
    throw new Error("qualified local image must run as 10001:10001");
  }
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
  });

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
    localImageDigest: image.Id ?? "",
    ociRevision:
      image.Config?.Labels?.["org.opencontainers.image.revision"] ?? "",
    ociSourceTreeSha256:
      image.Config?.Labels?.["io.counterlab.source-tree-sha256"] ?? "",
    engineAuthorityHash: snapshotHash.authorityHash ?? "",
    runtimeManifestHash: sha256(canonicalJson(runtimeManifest)),
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
  return collectRunnerReleaseEvidence({
    root: input.root,
    sourceCommit: receipt.sourceCommit,
    localImageTag: receipt.localImageTag,
    registryImage: receipt.registryImage,
  });
}

export function createQualifiedRunnerRelease(
  observation: QualifiedReleaseObservation,
  qualifiedAt = new Date().toISOString(),
): unknown {
  assertQualifiedObservation(observation);
  return QualifiedRunnerReleaseSchema.parse({
    schemaVersion: "2",
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
    evidenceCommit: observation.currentCommit,
    registryImage: observation.registryImage,
    registryDigest: observation.registryDigest,
    registryResolvedAt: observation.registryResolvedAt,
    qualifiedAt,
    verifierVersion: "counterlab-release-v2",
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
      !["--config", "--receipt", "--image", "--output"].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: prepare-qualified-deploy --config FILE --receipt FILE --image REGISTRY_IMAGE --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 4) {
    throw new Error(
      "Usage: prepare-qualified-deploy --config FILE --receipt FILE --image REGISTRY_IMAGE --output FILE",
    );
  }
  return {
    config: values.get("--config")!,
    receipt: values.get("--receipt")!,
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

  if (!Array.isArray(config.containers) || config.containers.length !== 1) {
    throw new Error("Wrangler config must contain exactly one Container");
  }
  const container = record(config.containers[0], "Container config");
  if (container.class_name !== "CounterLabRunner") {
    throw new Error("qualified image may bind only to CounterLabRunner");
  }
  container.image = input.image;
  delete container.image_vars;
  delete container.image_build_context;
  config.containers = [container];
  return config;
}

async function main(): Promise<void> {
  const args = argumentsFrom(process.argv.slice(2));
  const [configText, receiptText] = await Promise.all([
    readFile(resolve(args.config), "utf8"),
    readFile(resolve(args.receipt), "utf8"),
  ]);
  const receipt = JSON.parse(receiptText) as unknown;
  const observation = await collectQualifiedReleaseObservation({
    root: resolve(import.meta.dirname, ".."),
    receipt,
  });
  const generated = qualifiedDeployConfig({
    config: JSON.parse(configText) as unknown,
    receipt,
    image: args.image,
    observation,
  });
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(generated, null, 2)}\n`, "utf8");
  console.log(`Qualified deploy config: ${output}`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
