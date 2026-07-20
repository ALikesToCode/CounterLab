import { createHash } from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const PinnedBuildToolVersionsSchema = z.strictObject({
  vite: z.literal("8.1.4"),
  wrangler: z.literal("4.110.0"),
});

const FrozenAssetInputSchema = z.strictObject({
  path: z
    .string()
    .min(1)
    .regex(/^(?!\/)(?!.*\/\/)(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9._\/-]+$/u),
  sha256: Sha256Schema,
  size: z.number().int().nonnegative(),
});

export const FrozenClientAssetSchema = FrozenAssetInputSchema.extend({
  publicPath: z.string().startsWith("/").nullable(),
});

export type FrozenClientAsset = z.infer<typeof FrozenClientAssetSchema>;
export type FrozenClientAssetInput = z.infer<typeof FrozenAssetInputSchema>;

const DEPLOY_METADATA_PATHS = new Set([
  ".assetsignore",
  "_headers",
  "_redirects",
]);

function compareCanonicalPath(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function publicPathForClientAsset(path: string): string | null {
  if (DEPLOY_METADATA_PATHS.has(path)) return null;
  return path === "index.html" ? "/" : `/${path}`;
}

export const FrozenClientAssetCollectionSchema = z
  .strictObject({
    clientAssets: z.array(FrozenClientAssetSchema).min(1),
    clientAssetsSha256: Sha256Schema,
    clientAssetCount: z.number().int().positive(),
    clientPublicAssetsSha256: Sha256Schema,
    clientPublicAssetCount: z.number().int().positive(),
  })
  .superRefine((collection, context) => {
    const paths = collection.clientAssets.map((asset) => asset.path);
    if (
      paths.length !== new Set(paths).size ||
      JSON.stringify(paths) !==
        JSON.stringify([...paths].sort(compareCanonicalPath))
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientAssets"],
        message: "client assets must have unique sorted paths",
      });
    }
    for (const [index, asset] of collection.clientAssets.entries()) {
      if (asset.publicPath !== publicPathForClientAsset(asset.path)) {
        context.addIssue({
          code: "custom",
          path: ["clientAssets", index, "publicPath"],
          message: "client asset public path does not match deploy semantics",
        });
      }
    }
    if (collection.clientAssetCount !== collection.clientAssets.length) {
      context.addIssue({
        code: "custom",
        path: ["clientAssetCount"],
        message: "client asset count does not match the full deploy tree",
      });
    }
    if (
      collection.clientAssetsSha256 !==
      sha256(JSON.stringify(collection.clientAssets))
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientAssetsSha256"],
        message: "client asset digest does not match the full deploy tree",
      });
    }
    const publicAssets = collection.clientAssets.filter(
      (asset) => asset.publicPath !== null,
    );
    if (collection.clientPublicAssetCount !== publicAssets.length) {
      context.addIssue({
        code: "custom",
        path: ["clientPublicAssetCount"],
        message: "public client asset count does not match fetchable paths",
      });
    }
    if (
      collection.clientPublicAssetsSha256 !==
      sha256(JSON.stringify(publicAssets))
    ) {
      context.addIssue({
        code: "custom",
        path: ["clientPublicAssetsSha256"],
        message: "public client digest does not match fetchable paths",
      });
    }
  });

export type FrozenClientAssetCollection = z.infer<
  typeof FrozenClientAssetCollectionSchema
>;

export const FrozenWorkerReleaseManifestSchema = z
  .strictObject({
    // This is the first issued schema. Earlier v1 shapes existed only as
    // branch-local drafts, so finalizing the full/public asset split here does
    // not reinterpret a previously accepted manifest.
    schemaVersion: z.literal("1"),
    status: z.literal("FROZEN"),
    classification: z.literal("PROCESS_BOUND_PARTIAL"),
    sourceCommit: GitCommitSchema,
    workerBundlePath: z.literal("apps/web/dist/counterlab/index.js"),
    workerBundleSha256: Sha256Schema,
    workerBundleSize: z.number().int().positive(),
    clientDirectoryPath: z.literal("apps/web/dist/client"),
    ...FrozenClientAssetCollectionSchema.shape,
    viteVersion: z.literal("8.1.4"),
    wranglerVersion: z.literal("4.110.0"),
  })
  .superRefine((manifest, context) => {
    const collection = FrozenClientAssetCollectionSchema.safeParse({
      clientAssets: manifest.clientAssets,
      clientAssetsSha256: manifest.clientAssetsSha256,
      clientAssetCount: manifest.clientAssetCount,
      clientPublicAssetsSha256: manifest.clientPublicAssetsSha256,
      clientPublicAssetCount: manifest.clientPublicAssetCount,
    });
    if (!collection.success) {
      for (const issue of collection.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });

export type FrozenWorkerReleaseManifest = z.infer<
  typeof FrozenWorkerReleaseManifestSchema
>;

export type FrozenWorkerReleaseIdentity = {
  schemaVersion: "1";
  classification: "PROCESS_BOUND_PARTIAL";
  sourceCommit: string;
  manifestSha256: string;
  workerBundleSha256: string;
  clientAssetsSha256: string;
  clientAssetCount: number;
  clientPublicAssetsSha256: string;
  clientPublicAssetCount: number;
  viteVersion: "8.1.4";
  wranglerVersion: "4.110.0";
};

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
    throw new Error(`frozen release path escapes the repository: ${requested}`);
  }
  const metadata = await lstat(candidate);
  if (metadata.isSymbolicLink()) {
    throw new Error(`frozen release path may not be a symlink: ${requested}`);
  }
  const physical = await realpath(candidate);
  const physicalMetadata = await stat(physical);
  if (
    !isRepositoryPath(root, physical) ||
    (kind === "file"
      ? !physicalMetadata.isFile()
      : !physicalMetadata.isDirectory())
  ) {
    throw new Error(`frozen release path has the wrong type: ${requested}`);
  }
  return physical;
}

async function repositoryOutputPath(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error("frozen release output escapes the repository");
  }
  const parent = await realpath(dirname(candidate));
  if (!isRepositoryPath(root, parent)) {
    throw new Error("frozen release output parent escapes the repository");
  }
  return candidate;
}

export function canonicalFrozenClientAssetCollection(
  inputs: readonly FrozenClientAssetInput[],
): FrozenClientAssetCollection {
  const assets = inputs
    .map((input) => FrozenAssetInputSchema.parse(input))
    .map((asset) => ({
      ...asset,
      publicPath: publicPathForClientAsset(asset.path),
    }))
    .sort((left, right) => compareCanonicalPath(left.path, right.path));
  const publicAssets = assets.filter((asset) => asset.publicPath !== null);
  return FrozenClientAssetCollectionSchema.parse({
    clientAssets: assets,
    clientAssetsSha256: sha256(JSON.stringify(assets)),
    clientAssetCount: assets.length,
    clientPublicAssetsSha256: sha256(JSON.stringify(publicAssets)),
    clientPublicAssetCount: publicAssets.length,
  });
}

export async function collectFrozenClientAssets(
  root: string,
  requestedDirectory: string,
): Promise<FrozenClientAssetCollection> {
  const directory = await existingRepositoryPath(
    root,
    requestedDirectory,
    "directory",
  );
  const assets: FrozenClientAssetInput[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = (await readdir(current, { withFileTypes: true })).sort(
      (left, right) => compareCanonicalPath(left.name, right.name),
    );
    for (const entry of entries) {
      const candidate = resolve(current, entry.name);
      if (!isRepositoryPath(root, candidate) || entry.isSymbolicLink()) {
        throw new Error("client artifact tree contains an unsafe entry");
      }
      if (entry.isDirectory()) {
        await visit(await existingRepositoryPath(root, candidate, "directory"));
        continue;
      }
      if (!entry.isFile()) {
        throw new Error("client artifact tree contains a special file");
      }
      const file = await existingRepositoryPath(root, candidate, "file");
      const bytes = await readFile(file);
      assets.push({
        path: relative(directory, file).split("\\").join("/"),
        sha256: sha256(bytes),
        size: bytes.length,
      });
    }
  };
  await visit(directory);
  return canonicalFrozenClientAssetCollection(assets);
}

export function observedPinnedBuildToolVersions(input: {
  vite: string;
  wrangler: string;
}): z.infer<typeof PinnedBuildToolVersionsSchema> {
  const viteObservation = input.vite.trim();
  const viteMatch =
    /^(?:vite\/)?([0-9]+\.[0-9]+\.[0-9]+)(?: [a-z0-9]+-[a-z0-9_]+ node-v[0-9]+\.[0-9]+\.[0-9]+)?$/u.exec(
      viteObservation,
    );
  const wranglerMatch = /^([0-9]+\.[0-9]+\.[0-9]+)$/u.exec(
    input.wrangler.trim(),
  );
  if (viteMatch === null || wranglerMatch === null) {
    throw new Error("observed Vite or Wrangler version output is invalid");
  }
  return PinnedBuildToolVersionsSchema.parse({
    vite: viteMatch[1],
    wrangler: wranglerMatch[1],
  });
}

export function frozenWorkerReleaseManifest(input: {
  sourceCommit: string;
  workerBundleBytes: Buffer;
  clientAssets: readonly FrozenClientAssetInput[];
  observedViteVersion: string;
  observedWranglerVersion: string;
}): FrozenWorkerReleaseManifest {
  const assetCollection = canonicalFrozenClientAssetCollection(
    input.clientAssets,
  );
  const toolVersions = observedPinnedBuildToolVersions({
    vite: input.observedViteVersion,
    wrangler: input.observedWranglerVersion,
  });
  return FrozenWorkerReleaseManifestSchema.parse({
    schemaVersion: "1",
    status: "FROZEN",
    classification: "PROCESS_BOUND_PARTIAL",
    sourceCommit: input.sourceCommit,
    workerBundlePath: "apps/web/dist/counterlab/index.js",
    workerBundleSha256: sha256(input.workerBundleBytes),
    workerBundleSize: input.workerBundleBytes.length,
    clientDirectoryPath: "apps/web/dist/client",
    ...assetCollection,
    viteVersion: toolVersions.vite,
    wranglerVersion: toolVersions.wrangler,
  });
}

async function observedManifest(input: {
  root: string;
  sourceCommit: string;
  workerBundle: string;
  clientDirectory: string;
  observedViteVersion: string;
  observedWranglerVersion: string;
}): Promise<FrozenWorkerReleaseManifest> {
  const [workerPath, assets] = await Promise.all([
    existingRepositoryPath(input.root, input.workerBundle, "file"),
    collectFrozenClientAssets(input.root, input.clientDirectory),
  ]);
  const workerBundleBytes = await readFile(workerPath);
  return frozenWorkerReleaseManifest({
    sourceCommit: input.sourceCommit,
    workerBundleBytes,
    clientAssets: assets.clientAssets.map(({ path, sha256, size }) => ({
      path,
      sha256,
      size,
    })),
    observedViteVersion: input.observedViteVersion,
    observedWranglerVersion: input.observedWranglerVersion,
  });
}

export function frozenWorkerReleaseIdentity(
  manifest: FrozenWorkerReleaseManifest,
  manifestBytes: Buffer,
): FrozenWorkerReleaseIdentity {
  const parsed = FrozenWorkerReleaseManifestSchema.parse(manifest);
  return {
    schemaVersion: "1",
    classification: parsed.classification,
    sourceCommit: parsed.sourceCommit,
    manifestSha256: sha256(manifestBytes),
    workerBundleSha256: parsed.workerBundleSha256,
    clientAssetsSha256: parsed.clientAssetsSha256,
    clientAssetCount: parsed.clientAssetCount,
    clientPublicAssetsSha256: parsed.clientPublicAssetsSha256,
    clientPublicAssetCount: parsed.clientPublicAssetCount,
    viteVersion: parsed.viteVersion,
    wranglerVersion: parsed.wranglerVersion,
  };
}

export async function verifyFrozenWorkerReleaseManifest(
  root: string,
  requestedManifest: string,
): Promise<{
  manifest: FrozenWorkerReleaseManifest;
  manifestBytes: Buffer;
  identity: FrozenWorkerReleaseIdentity;
}> {
  const manifestPath = await existingRepositoryPath(
    root,
    requestedManifest,
    "file",
  );
  const manifestBytes = await readFile(manifestPath);
  const manifest = FrozenWorkerReleaseManifestSchema.parse(
    JSON.parse(manifestBytes.toString("utf8")) as unknown,
  );
  const observed = await observedManifest({
    root,
    sourceCommit: manifest.sourceCommit,
    workerBundle: manifest.workerBundlePath,
    clientDirectory: manifest.clientDirectoryPath,
    observedViteVersion: manifest.viteVersion,
    observedWranglerVersion: manifest.wranglerVersion,
  });
  if (JSON.stringify(observed) !== JSON.stringify(manifest)) {
    throw new Error("frozen Worker or client artifacts changed");
  }
  return {
    manifest,
    manifestBytes,
    identity: frozenWorkerReleaseIdentity(manifest, manifestBytes),
  };
}

export type FrozenWranglerDryRunEntry = {
  name: string;
  kind: "file" | "directory" | "symlink" | "special";
};

export type FrozenWranglerDryRunProjection = {
  schemaVersion: "1";
  status: "VERIFIED";
  sha256: string;
  size: number;
  count: 1;
  readmeGeneratedAt: string;
};

function assertFrozenWranglerDryRunEntries(
  entries: readonly FrozenWranglerDryRunEntry[],
): void {
  const sorted = [...entries].sort((left, right) =>
    compareCanonicalPath(left.name, right.name),
  );
  if (
    JSON.stringify(sorted.map((entry) => entry.name)) !==
      JSON.stringify(["README.md", "index.js"]) ||
    sorted.some((entry) => entry.kind !== "file")
  ) {
    throw new Error(
      "Wrangler dry-run must contain exactly regular README.md and index.js files",
    );
  }
}

/**
 * Pure byte-level verifier used by both the CLI and negative controls. The
 * Wrangler README is timestamp metadata; only the exact index.js bytes carry
 * Worker authority.
 */
export function frozenWranglerDryRunProjection(input: {
  entries: readonly FrozenWranglerDryRunEntry[];
  workerBundleBytes: Buffer;
  indexBytes: Buffer;
  readmeBytes: Buffer;
}): FrozenWranglerDryRunProjection {
  assertFrozenWranglerDryRunEntries(input.entries);
  if (
    input.workerBundleBytes.length === 0 ||
    !input.indexBytes.equals(input.workerBundleBytes)
  ) {
    throw new Error(
      "Wrangler dry-run index.js bytes differ from the frozen Worker bundle",
    );
  }
  const readme = input.readmeBytes.toString("utf8");
  if (!Buffer.from(readme, "utf8").equals(input.readmeBytes)) {
    throw new Error("Wrangler dry-run README is not canonical UTF-8");
  }
  const readmeMatch =
    /^This folder contains the built output assets for the worker "counterlab" generated at (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z)\.$/u.exec(
      readme,
    );
  if (readmeMatch === null) {
    throw new Error("Wrangler dry-run README has an unexpected format");
  }
  const readmeGeneratedAt = readmeMatch[1];
  if (readmeGeneratedAt === undefined) {
    throw new Error("Wrangler dry-run README timestamp is missing");
  }
  const generatedAtMilliseconds = Date.parse(readmeGeneratedAt);
  if (
    !Number.isFinite(generatedAtMilliseconds) ||
    new Date(generatedAtMilliseconds).toISOString() !== readmeGeneratedAt
  ) {
    throw new Error("Wrangler dry-run README timestamp is invalid");
  }
  return {
    schemaVersion: "1",
    status: "VERIFIED",
    sha256: sha256(input.indexBytes),
    size: input.indexBytes.length,
    count: 1,
    readmeGeneratedAt,
  };
}

export async function verifyFrozenWranglerDryRunDirectory(
  root: string,
  requestedDirectory: string,
  requestedWorkerBundle: string,
): Promise<FrozenWranglerDryRunProjection> {
  const [directory, workerBundlePath] = await Promise.all([
    existingRepositoryPath(root, requestedDirectory, "directory"),
    existingRepositoryPath(root, requestedWorkerBundle, "file"),
  ]);
  const directoryEntries = await readdir(directory, { withFileTypes: true });
  const entries: FrozenWranglerDryRunEntry[] = directoryEntries.map(
    (entry) => ({
      name: entry.name,
      kind: entry.isSymbolicLink()
        ? "symlink"
        : entry.isFile()
          ? "file"
          : entry.isDirectory()
            ? "directory"
            : "special",
    }),
  );
  assertFrozenWranglerDryRunEntries(entries);
  const [indexPath, readmePath] = await Promise.all([
    existingRepositoryPath(root, resolve(directory, "index.js"), "file"),
    existingRepositoryPath(root, resolve(directory, "README.md"), "file"),
  ]);
  const [workerBundleBytes, indexBytes, readmeBytes] = await Promise.all([
    readFile(workerBundlePath),
    readFile(indexPath),
    readFile(readmePath),
  ]);
  return frozenWranglerDryRunProjection({
    entries,
    workerBundleBytes,
    indexBytes,
    readmeBytes,
  });
}

function parseArguments(argv: string[]): {
  command: "create" | "verify" | "identity" | "verify-dry-run";
  values: Map<string, string>;
} {
  const [command, ...rest] = argv;
  if (
    !(["create", "verify", "identity", "verify-dry-run"] as const).includes(
      command as never,
    )
  ) {
    throw new Error(
      "Usage: frozen-worker-release create|verify|identity|verify-dry-run [arguments]",
    );
  }
  const values = new Map<string, string>();
  for (let index = 0; index < rest.length; index += 2) {
    const flag = rest[index];
    const value = rest[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !flag.startsWith("--") ||
      values.has(flag)
    ) {
      throw new Error("frozen Worker release arguments are invalid");
    }
    values.set(flag, value);
  }
  return {
    command: command as "create" | "verify" | "identity" | "verify-dry-run",
    values,
  };
}

function exactArguments(
  values: Map<string, string>,
  required: readonly string[],
): void {
  if (
    values.size !== required.length ||
    required.some((flag) => !values.has(flag))
  ) {
    throw new Error("frozen Worker release arguments are incomplete");
  }
}

async function main(): Promise<void> {
  const root = await realpath(resolve(import.meta.dirname, ".."));
  const { command, values } = parseArguments(process.argv.slice(2));
  if (command === "create") {
    exactArguments(values, [
      "--source-commit",
      "--worker-bundle",
      "--client-dir",
      "--vite-version",
      "--wrangler-version",
      "--output",
    ]);
    const manifest = await observedManifest({
      root,
      sourceCommit: values.get("--source-commit")!,
      workerBundle: values.get("--worker-bundle")!,
      clientDirectory: values.get("--client-dir")!,
      observedViteVersion: values.get("--vite-version")!,
      observedWranglerVersion: values.get("--wrangler-version")!,
    });
    const output = await repositoryOutputPath(root, values.get("--output")!);
    await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    process.stdout.write(`${output}\n`);
    return;
  }

  if (command === "verify-dry-run") {
    exactArguments(values, ["--manifest", "--dry-run-dir"]);
    const { manifest } = await verifyFrozenWorkerReleaseManifest(
      root,
      values.get("--manifest")!,
    );
    const projection = await verifyFrozenWranglerDryRunDirectory(
      root,
      values.get("--dry-run-dir")!,
      manifest.workerBundlePath,
    );
    process.stdout.write(`${JSON.stringify(projection)}\n`);
    return;
  }

  exactArguments(values, ["--manifest"]);
  const { identity } = await verifyFrozenWorkerReleaseManifest(
    root,
    values.get("--manifest")!,
  );
  if (command === "verify") {
    process.stdout.write("FROZEN_WORKER_RELEASE_VERIFIED\n");
    return;
  }
  process.stdout.write(`${JSON.stringify(identity)}\n`);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
