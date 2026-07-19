import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DeploymentReceiptSchema,
  QualifiedRunnerReleaseSchema,
  ReleaseCheckReceiptSchema,
} from "../packages/scientific-engine-registry/src/index.js";

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

function directoryHash(root: string, directory: string) {
  const entries: Array<{ path: string; sha256: string; size: number }> = [];
  const visit = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const path = resolve(current, entry.name);
      if (!isRepositoryPath(root, path) || entry.isSymbolicLink()) {
        throw new Error(
          "deployment artifact directory contains an unsafe entry",
        );
      }
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        const bytes = readFileSync(path);
        entries.push({
          path: relative(directory, path).split("\\").join("/"),
          sha256: sha256(bytes),
          size: bytes.length,
        });
      } else {
        throw new Error(
          "deployment artifact directory contains a special file",
        );
      }
    }
  };
  visit(directory);
  if (entries.length === 0) {
    throw new Error("deployment artifact directory is empty");
  }
  return {
    sha256: sha256(JSON.stringify(entries)),
    count: entries.length,
  };
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
  if (!Array.isArray(bindings)) {
    throw new Error("the active Worker did not expose deployed bindings");
  }
  const expectedBindings = {
    COUNTERLAB_WORKER_EVIDENCE_COMMIT: args["--evidence-commit"],
    COUNTERLAB_RUNNER_SOURCE_COMMIT: args["--source-commit"],
    COUNTERLAB_RUNNER_IMAGE_DIGEST: args["--registry-digest"],
    COUNTERLAB_MAINTENANCE_MODE: "false",
  } as const;
  for (const [name, expected] of Object.entries(expectedBindings)) {
    const binding = bindings.find(
      (candidate) => candidate.name === name && candidate.type === "plain_text",
    );
    if (binding?.text !== expected) {
      throw new Error(`active Worker binding ${name} is not release-bound`);
    }
  }
  if (
    !bindings.some(
      (binding) =>
        binding.name === "CF_VERSION_METADATA" &&
        binding.type === "version_metadata",
    )
  ) {
    throw new Error("active Worker lacks version metadata");
  }

  const containersBytes = readFileSync(paths.containers);
  const containers = JSON.parse(containersBytes.toString("utf8")) as Array<{
    id?: string;
    image?: string;
    name?: string;
    state?: string;
    version?: number | string;
  }>;
  if (!Array.isArray(containers)) {
    throw new Error("Container status response is invalid");
  }
  const container = containers.find(
    (candidate) =>
      candidate.name === args["--container-name"] &&
      candidate.image === args["--container-image"],
  );
  const containerVersion = String(container?.version ?? "");
  if (
    container === undefined ||
    !["active", "ready"].includes(container.state ?? "") ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(container.id ?? "") ||
    !/^[1-9][0-9]*$/.test(containerVersion)
  ) {
    throw new Error("active Container does not expose the qualified digest");
  }

  const qualifiedBytes = readFileSync(paths.qualified);
  const qualified = QualifiedRunnerReleaseSchema.parse(
    JSON.parse(qualifiedBytes.toString("utf8")) as unknown,
  );
  const releaseCheckBytes = readFileSync(paths.releaseCheck);
  const releaseCheck = ReleaseCheckReceiptSchema.parse(
    JSON.parse(releaseCheckBytes.toString("utf8")) as unknown,
  );
  if (
    qualified.evidenceCommit !== args["--evidence-commit"] ||
    qualified.sourceCommit !== args["--source-commit"] ||
    qualified.registryDigest !== args["--registry-digest"] ||
    releaseCheck.evidenceCommit !== qualified.evidenceCommit ||
    releaseCheck.sourceCommit !== qualified.sourceCommit ||
    releaseCheck.qualifiedRunnerReceiptSha256 !== sha256(qualifiedBytes) ||
    releaseCheck.qualifiedAt !== qualified.qualifiedAt ||
    releaseCheck.runnerImageTag !== qualified.localImageTag ||
    releaseCheck.runnerImageDigest !== qualified.localImageDigest ||
    releaseCheck.adapterImageTag !== qualified.adapterImageTag ||
    releaseCheck.adapterImageDigest !== qualified.adapterImageDigest ||
    releaseCheck.registryDigest !== qualified.registryDigest ||
    releaseCheck.runtimeToolchainSha256 !== qualified.runtimeToolchainSha256 ||
    releaseCheck.runtimeAdapterSha256 !== qualified.runtimeAdapterSha256
  ) {
    throw new Error("deployment receipts do not share one qualified identity");
  }

  const client = directoryHash(root, paths.client);
  const dryRun = directoryHash(root, paths.dryRun);
  const configBytes = readFileSync(paths.config);
  const receipt = DeploymentReceiptSchema.parse({
    schemaVersion: "3",
    status: "DEPLOYED",
    workerName: "counterlab",
    productionOrigin: "https://counterlab.cserules.workers.dev",
    generationFilesystemReadIsolation: "PARTIAL",
    workerEvidenceCommit: args["--evidence-commit"],
    runnerSourceCommit: args["--source-commit"],
    qualifiedRunnerReceiptSha256: sha256(qualifiedBytes),
    releaseCheckReceiptSha256: sha256(releaseCheckBytes),
    releaseCheckCheckedAt: releaseCheck.checkedAt,
    runtimeToolchainSha256: releaseCheck.runtimeToolchainSha256,
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
    deployConfigSha256: sha256(configBytes),
    workerBundleSha256: sha256(readFileSync(paths.workerBundle)),
    clientAssetsSha256: client.sha256,
    clientAssetCount: client.count,
    dryRunSha256: dryRun.sha256,
    dryRunFileCount: dryRun.count,
    deploymentStatusSha256: sha256(statusBytes),
    workerVersionSha256: sha256(versionBytes),
    containerStatusSha256: sha256(containersBytes),
    deployedAt: new Date().toISOString(),
    verifierVersion: "counterlab-deployment-v3",
  });
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${receipt.workerVersionId}\n`);
}

await main();
