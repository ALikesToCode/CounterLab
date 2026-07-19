import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ContainedRuntimeAttestationSchema,
  QualifiedRunnerReleaseSchema,
  RELEASE_CHECK_IDS,
  ReleaseCheckReceiptSchema,
} from "../packages/scientific-engine-registry/src/index.js";

type BindingInput = {
  qualifiedReceipt: unknown;
  qualifiedReceiptBytes: Buffer;
  releaseCheckReceipt: unknown;
  runtimeAttestation: unknown;
  currentCommit: string;
  worktreeClean: boolean;
  runnerImageDigest: string;
  adapterImageDigest: string;
  observedAt: string;
};

function sha256(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function assertReleaseCheckBinding(input: BindingInput) {
  const qualified = QualifiedRunnerReleaseSchema.parse(input.qualifiedReceipt);
  const releaseCheck = ReleaseCheckReceiptSchema.parse(
    input.releaseCheckReceipt,
  );
  const runtime = ContainedRuntimeAttestationSchema.parse(
    input.runtimeAttestation,
  );
  const comparisons: Array<[string, string, string]> = [
    ["evidence commit", releaseCheck.evidenceCommit, qualified.evidenceCommit],
    ["source commit", releaseCheck.sourceCommit, qualified.sourceCommit],
    [
      "qualified receipt hash",
      releaseCheck.qualifiedRunnerReceiptSha256,
      sha256(input.qualifiedReceiptBytes),
    ],
    ["qualification time", releaseCheck.qualifiedAt, qualified.qualifiedAt],
    ["runner image tag", releaseCheck.runnerImageTag, qualified.localImageTag],
    [
      "runner image digest",
      releaseCheck.runnerImageDigest,
      qualified.localImageDigest,
    ],
    [
      "adapter image tag",
      releaseCheck.adapterImageTag,
      qualified.adapterImageTag,
    ],
    [
      "adapter image digest",
      releaseCheck.adapterImageDigest,
      qualified.adapterImageDigest,
    ],
    ["registry digest", releaseCheck.registryDigest, qualified.registryDigest],
    [
      "runtime toolchain",
      releaseCheck.runtimeToolchainSha256,
      qualified.runtimeToolchainSha256,
    ],
    [
      "runtime adapter",
      releaseCheck.runtimeAdapterSha256,
      qualified.runtimeAdapterSha256,
    ],
    [
      "live runtime toolchain",
      runtime.runtimeToolchainSha256,
      qualified.runtimeToolchainSha256,
    ],
    [
      "live runtime adapter",
      runtime.adapterSha256,
      qualified.runtimeAdapterSha256,
    ],
    ["live runner image", input.runnerImageDigest, qualified.localImageDigest],
    [
      "live adapter image",
      input.adapterImageDigest,
      qualified.adapterImageDigest,
    ],
  ];
  for (const [label, observed, expected] of comparisons) {
    if (observed !== expected) {
      throw new Error(`release-check ${label} does not match qualification`);
    }
  }
  if (
    !input.worktreeClean ||
    input.currentCommit !== qualified.evidenceCommit
  ) {
    throw new Error("release-check receipt does not bind a clean current HEAD");
  }
  const checkedAt = Date.parse(releaseCheck.checkedAt);
  const observedAt = Date.parse(input.observedAt);
  if (
    !Number.isFinite(checkedAt) ||
    !Number.isFinite(observedAt) ||
    checkedAt > observedAt + 5 * 60_000 ||
    observedAt - checkedAt > 24 * 60 * 60_000
  ) {
    throw new Error("release-check receipt is stale or future-dated");
  }
  return releaseCheck;
}

export function createReleaseCheckReceipt(input: {
  qualifiedReceipt: unknown;
  qualifiedReceiptBytes: Buffer;
  runtimeAttestation: unknown;
  currentCommit: string;
  worktreeClean: boolean;
  runnerImageDigest: string;
  adapterImageDigest: string;
  checkedAt?: string;
}) {
  const qualified = QualifiedRunnerReleaseSchema.parse(input.qualifiedReceipt);
  const runtime = ContainedRuntimeAttestationSchema.parse(
    input.runtimeAttestation,
  );
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const receipt = ReleaseCheckReceiptSchema.parse({
    schemaVersion: "1",
    status: "PASSED",
    evidenceCommit: qualified.evidenceCommit,
    sourceCommit: qualified.sourceCommit,
    qualifiedRunnerReceiptSha256: sha256(input.qualifiedReceiptBytes),
    qualifiedAt: qualified.qualifiedAt,
    runnerImageTag: qualified.localImageTag,
    runnerImageDigest: qualified.localImageDigest,
    adapterImageTag: qualified.adapterImageTag,
    adapterImageDigest: qualified.adapterImageDigest,
    registryDigest: qualified.registryDigest,
    runtimeToolchainSha256: qualified.runtimeToolchainSha256,
    runtimeAdapterSha256: qualified.runtimeAdapterSha256,
    checks: RELEASE_CHECK_IDS.map((id) => ({ id, status: "PASSED" })),
    checkedAt,
    verifierVersion: "counterlab-release-check-v1",
  });
  return assertReleaseCheckBinding({
    qualifiedReceipt: qualified,
    qualifiedReceiptBytes: input.qualifiedReceiptBytes,
    releaseCheckReceipt: receipt,
    runtimeAttestation: runtime,
    currentCommit: input.currentCommit,
    worktreeClean: input.worktreeClean,
    runnerImageDigest: input.runnerImageDigest,
    adapterImageDigest: input.adapterImageDigest,
    observedAt: checkedAt,
  });
}

function isRepositoryPath(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function existingRepositoryFile(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(`release-check input escaped the repository: ${requested}`);
  }
  const physical = await realpath(candidate);
  if (!isRepositoryPath(root, physical) || !(await stat(physical)).isFile()) {
    throw new Error(
      `release-check input is not a repository file: ${requested}`,
    );
  }
  return physical;
}

async function repositoryOutput(
  root: string,
  requested: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate)) {
    throw new Error(
      `release-check output escaped the repository: ${requested}`,
    );
  }
  const parent = await realpath(dirname(candidate));
  if (!isRepositoryPath(root, parent)) {
    throw new Error("release-check output parent escaped the repository");
  }
  return candidate;
}

function commandText(root: string, command: string, args: string[]): string {
  return execFileSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

function argumentsFrom(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !["--qualified", "--runtime-adapter", "--output"].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: release-check-receipt --qualified FILE --runtime-adapter FILE --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 3) {
    throw new Error(
      "Usage: release-check-receipt --qualified FILE --runtime-adapter FILE --output FILE",
    );
  }
  return {
    qualified: values.get("--qualified")!,
    runtimeAdapter: values.get("--runtime-adapter")!,
    output: values.get("--output")!,
  };
}

async function main(): Promise<void> {
  const root = await realpath(
    resolve(dirname(fileURLToPath(import.meta.url)), ".."),
  );
  if (process.argv[2] === "identity") {
    if (process.argv.length !== 5 || process.argv[3] !== "--qualified") {
      throw new Error("Usage: release-check-receipt identity --qualified FILE");
    }
    const qualifiedPath = await existingRepositoryFile(root, process.argv[4]!);
    const qualified = QualifiedRunnerReleaseSchema.parse(
      JSON.parse(readFileSync(qualifiedPath, "utf8")) as unknown,
    );
    for (const value of [
      qualified.evidenceCommit,
      qualified.sourceCommit,
      qualified.localImageTag,
      qualified.localImageDigest,
      qualified.adapterImageTag,
      qualified.adapterImageDigest,
      qualified.runtimeToolchainSha256,
      qualified.runtimeAdapterSha256,
      qualified.qualifiedAt,
      qualified.registryDigest,
    ]) {
      process.stdout.write(`${value}\n`);
    }
    return;
  }
  const args = argumentsFrom(process.argv.slice(2));
  const [qualifiedPath, runtimeAdapter, output] = await Promise.all([
    existingRepositoryFile(root, args.qualified),
    existingRepositoryFile(root, args.runtimeAdapter),
    repositoryOutput(root, args.output),
  ]);
  if (((await stat(runtimeAdapter)).mode & 0o111) === 0) {
    throw new Error("release-check runtime adapter is not executable");
  }
  const qualifiedReceiptBytes = readFileSync(qualifiedPath);
  const qualifiedReceipt = QualifiedRunnerReleaseSchema.parse(
    JSON.parse(qualifiedReceiptBytes.toString("utf8")) as unknown,
  );
  const runtimeAttestation = JSON.parse(
    commandText(root, runtimeAdapter, ["counterlab-attest"]),
  ) as unknown;
  const runnerImageDigest = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    qualifiedReceipt.localImageTag,
    "--format",
    "{{.Id}}",
  ]);
  const adapterImageDigest = commandText(root, runtimeAdapter, [
    "image",
    "inspect",
    qualifiedReceipt.adapterImageTag,
    "--format",
    "{{.Id}}",
  ]);
  const receipt = createReleaseCheckReceipt({
    qualifiedReceipt,
    qualifiedReceiptBytes,
    runtimeAttestation,
    currentCommit: commandText(root, "git", ["rev-parse", "HEAD"]),
    worktreeClean:
      commandText(root, "git", [
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
      ]).length === 0,
    runnerImageDigest,
    adapterImageDigest,
  });
  await writeFile(output, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`Release-check receipt: ${output}\n`);
}

if (
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
