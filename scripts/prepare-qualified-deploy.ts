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
  currentCommit: string;
  sourceIsAncestor: boolean;
  changedPaths: string[];
  observedAt: string;
};

const RELEASE_EVIDENCE_PATHS = [
  "scientific-engines/",
  "docs/sbom/",
] as const;
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

export function collectQualifiedReleaseObservation(input: {
  root: string;
  receipt: unknown;
}): QualifiedReleaseObservation {
  const root = resolve(input.root);
  const receipt = QualifiedRunnerReleaseSchema.parse(input.receipt);
  const currentCommit = commandText(root, "git", ["rev-parse", "HEAD"]);
  const ancestry = spawnSync(
    "git",
    ["merge-base", "--is-ancestor", receipt.sourceCommit, currentCommit],
    { cwd: root, stdio: "ignore" },
  );
  const changedPaths = commandText(root, "git", [
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    `${receipt.sourceCommit}..${currentCommit}`,
  ])
    .split("\n")
    .filter(Boolean);
  const imageInspect = JSON.parse(
    commandText(root, "docker", ["image", "inspect", receipt.localImageTag]),
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
    readFileSync(resolve(root, "scientific-engines/snapshot-hash.json"), "utf8"),
  ) as { authorityHash?: string };
  const runtimeManifest = JSON.parse(
    readFileSync(resolve(root, "scientific-engines/runtime-manifest.json"), "utf8"),
  ) as unknown;

  return {
    sourceCommit: receipt.sourceCommit,
    sourceArchiveSha256: sha256(
      commandBuffer(root, "git", ["archive", "--format=tar", receipt.sourceCommit]),
    ),
    sourceTreeSha256: sha256(
      commandBuffer(root, "git", [
        "ls-tree",
        "-r",
        "--full-tree",
        receipt.sourceCommit,
      ]),
    ),
    dockerfileSha256: sha256(
      commandBuffer(root, "git", [
        "show",
        `${receipt.sourceCommit}:Dockerfile.runner`,
      ]),
    ),
    localImageTag: receipt.localImageTag,
    localImageDigest: image.Id ?? "",
    ociRevision:
      image.Config?.Labels?.["org.opencontainers.image.revision"] ?? "",
    ociSourceTreeSha256:
      image.Config?.Labels?.["io.counterlab.source-tree-sha256"] ?? "",
    engineAuthorityHash: snapshotHash.authorityHash ?? "",
    runtimeManifestHash: sha256(canonicalJson(runtimeManifest)),
    currentCommit,
    sourceIsAncestor: ancestry.status === 0,
    changedPaths,
    observedAt: new Date().toISOString(),
  };
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
    ["source tree", receipt.sourceTreeSha256, input.observation.sourceTreeSha256],
    ["Dockerfile", receipt.dockerfileSha256, input.observation.dockerfileSha256],
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
  if (!input.observation.sourceIsAncestor) {
    throw new Error("qualified source commit is not an ancestor of the evidence commit");
  }
  const unauthorized = input.observation.changedPaths.filter(
    (path) => !evidenceOnly(path),
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `qualified evidence commit changes runtime source: ${unauthorized.join(", ")}`,
    );
  }
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
    throw new Error("qualified image tag does not match the receipt source commit");
  }
  if (config.account_id !== imageMatch[1]) {
    throw new Error("qualified image account does not match Wrangler account_id");
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
  const observation = collectQualifiedReleaseObservation({
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
