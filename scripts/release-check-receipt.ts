import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  ContainedRuntimeAttestationSchema,
  DeploymentReceiptV5Schema,
  DeploymentReceiptV6Schema,
  GenerationIsolationEvidenceV1Schema,
  RELEASE_CHECK_IDS,
  QualifiedRunnerReleaseV5Schema,
  ReleaseCheckReceiptV4Schema,
} from "../packages/scientific-engine-registry/src/index.js";
import {
  hashGenerationIsolationEvidence,
  parseQualifiedRunnerReleaseV6,
  verifyGenerationIsolationEvidence,
} from "./generation-isolation-evidence.js";
import {
  containedRuntimeAdapterArguments,
  requireContainedRuntimeSessionId,
} from "./contained-runtime-attestation.mjs";

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

export function createQualifiedReleaseIdentity(receiptBytes: Buffer) {
  const value = JSON.parse(receiptBytes.toString("utf8")) as unknown;
  const receipt =
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === "6"
      ? parseQualifiedRunnerReleaseV6(value)
      : QualifiedRunnerReleaseV5Schema.parse(value);
  return {
    identitySchemaVersion: "1",
    receiptType: "qualified-runner-release",
    receiptSha256: sha256(receiptBytes),
    receipt,
  } as const;
}

export function createDeploymentReleaseIdentity(receiptBytes: Buffer) {
  const value = JSON.parse(receiptBytes.toString("utf8")) as unknown;
  const receipt =
    typeof value === "object" &&
    value !== null &&
    "schemaVersion" in value &&
    value.schemaVersion === "6"
      ? DeploymentReceiptV6Schema.parse(value)
      : DeploymentReceiptV5Schema.parse(value);
  return {
    identitySchemaVersion: "1",
    receiptType: "deployment-receipt",
    receiptSha256: sha256(receiptBytes),
    receipt,
  } as const;
}

export function assertReleaseCheckBinding(input: BindingInput) {
  const qualified = parseQualifiedRunnerReleaseV6(input.qualifiedReceipt);
  const releaseCheck = ReleaseCheckReceiptV4Schema.parse(
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
    [
      "generation isolation evidence",
      releaseCheck.generationIsolationEvidenceSha256,
      qualified.generationIsolationEvidenceSha256,
    ],
    [
      "generation isolation probe",
      releaseCheck.generationIsolationProbeSha256,
      qualified.generationIsolationProbeSha256,
    ],
    [
      "generation isolation verification time",
      releaseCheck.generationIsolationVerifiedAt,
      qualified.generationIsolationVerifiedAt,
    ],
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
      "runtime policy",
      releaseCheck.runtimePolicySha256,
      qualified.runtimePolicySha256,
    ],
    [
      "proof dependency manifest",
      releaseCheck.proofDependencyManifestSha256,
      qualified.proofDependencyManifestSha256,
    ],
    [
      "aggregate limit evidence",
      releaseCheck.aggregateLimitEvidenceSha256,
      qualified.aggregateLimitEvidenceSha256,
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
      "live runtime policy",
      runtime.runtimePolicySha256,
      qualified.runtimePolicySha256,
    ],
    [
      "live proof dependency manifest",
      runtime.proofDependencyManifestSha256,
      qualified.proofDependencyManifestSha256,
    ],
    [
      "live runtime adapter",
      runtime.adapterSha256,
      qualified.runtimeAdapterSha256,
    ],
    [
      "timeout runtime session",
      runtime.sessionId,
      qualified.timeoutRuntimeSessionId,
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
  generationIsolationEvidence: unknown;
  checkedAt?: string;
}) {
  const qualified = parseQualifiedRunnerReleaseV6(input.qualifiedReceipt);
  const runtime = ContainedRuntimeAttestationSchema.parse(
    input.runtimeAttestation,
  );
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const freshEvidence = GenerationIsolationEvidenceV1Schema.parse(
    input.generationIsolationEvidence,
  );
  verifyGenerationIsolationEvidence({
    evidence: freshEvidence,
    evidenceSha256: hashGenerationIsolationEvidence(freshEvidence),
    expected: {
      sourceCommit: qualified.sourceCommit,
      sourceTreeSha256: qualified.sourceTreeSha256,
      localImageTag: qualified.localImageTag,
      localImageDigest: qualified.localImageDigest,
      probeSha256: qualified.generationIsolationProbeSha256,
    },
  });
  const freshVerifiedAt = Date.parse(freshEvidence.verifiedAt);
  const checkedAtMilliseconds = Date.parse(checkedAt);
  if (
    !Number.isFinite(freshVerifiedAt) ||
    !Number.isFinite(checkedAtMilliseconds) ||
    freshVerifiedAt > checkedAtMilliseconds + 5 * 60_000 ||
    checkedAtMilliseconds - freshVerifiedAt > 30 * 60_000
  ) {
    throw new Error("release-check generation-isolation evidence is not fresh");
  }
  const receipt = ReleaseCheckReceiptV4Schema.parse({
    schemaVersion: "4",
    status: "PASSED",
    generationFilesystemReadIsolation:
      qualified.generationFilesystemReadIsolation,
    generationIsolationEvidenceSha256:
      qualified.generationIsolationEvidenceSha256,
    generationIsolationProbeSha256: qualified.generationIsolationProbeSha256,
    generationIsolationVerifiedAt: qualified.generationIsolationVerifiedAt,
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
    runtimePolicySha256: qualified.runtimePolicySha256,
    proofDependencyManifestSha256: qualified.proofDependencyManifestSha256,
    aggregateLimitEvidenceSha256: qualified.aggregateLimitEvidenceSha256,
    runtimeAdapterSha256: qualified.runtimeAdapterSha256,
    checks: RELEASE_CHECK_IDS.map((id) => ({ id, status: "PASSED" })),
    checkedAt,
    verifierVersion: "counterlab-release-check-v4",
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

function runtimeAdapterArguments(args: string[]): string[] {
  return containedRuntimeAdapterArguments(
    requireContainedRuntimeSessionId(process.env.COUNTERLAB_RUNTIME_SESSION_ID),
    args,
  );
}

function argumentsFrom(argv: string[]) {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      ![
        "--qualified",
        "--runtime-adapter",
        "--generation-isolation-report",
        "--output",
      ].includes(flag) ||
      values.has(flag)
    ) {
      throw new Error(
        "Usage: release-check-receipt --qualified FILE --runtime-adapter FILE --generation-isolation-report FILE --output FILE",
      );
    }
    values.set(flag, value);
  }
  if (values.size !== 4) {
    throw new Error(
      "Usage: release-check-receipt --qualified FILE --runtime-adapter FILE --generation-isolation-report FILE --output FILE",
    );
  }
  return {
    qualified: values.get("--qualified")!,
    runtimeAdapter: values.get("--runtime-adapter")!,
    generationIsolationReport: values.get("--generation-isolation-report")!,
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
    process.stdout.write(
      `${JSON.stringify(createQualifiedReleaseIdentity(readFileSync(qualifiedPath)))}\n`,
    );
    return;
  }
  if (process.argv[2] === "deployment-identity") {
    if (process.argv.length !== 5 || process.argv[3] !== "--deployment") {
      throw new Error(
        "Usage: release-check-receipt deployment-identity --deployment FILE",
      );
    }
    const deploymentPath = await existingRepositoryFile(root, process.argv[4]!);
    process.stdout.write(
      `${JSON.stringify(createDeploymentReleaseIdentity(readFileSync(deploymentPath)))}\n`,
    );
    return;
  }
  const args = argumentsFrom(process.argv.slice(2));
  const [qualifiedPath, runtimeAdapter, generationIsolationReport, output] =
    await Promise.all([
      existingRepositoryFile(root, args.qualified),
      existingRepositoryFile(root, args.runtimeAdapter),
      existingRepositoryFile(root, args.generationIsolationReport),
      repositoryOutput(root, args.output),
    ]);
  if (((await stat(runtimeAdapter)).mode & 0o111) === 0) {
    throw new Error("release-check runtime adapter is not executable");
  }
  const qualifiedReceiptBytes = readFileSync(qualifiedPath);
  const qualifiedReceipt = parseQualifiedRunnerReleaseV6(
    JSON.parse(qualifiedReceiptBytes.toString("utf8")) as unknown,
  );
  const runtimeAttestation = JSON.parse(
    commandText(
      root,
      runtimeAdapter,
      runtimeAdapterArguments(["counterlab-attest"]),
    ),
  ) as unknown;
  const runnerImageDigest = commandText(
    root,
    runtimeAdapter,
    runtimeAdapterArguments([
      "image",
      "inspect",
      qualifiedReceipt.localImageTag,
      "--format",
      "{{.Id}}",
    ]),
  );
  const adapterImageDigest = commandText(
    root,
    runtimeAdapter,
    runtimeAdapterArguments([
      "image",
      "inspect",
      qualifiedReceipt.adapterImageTag,
      "--format",
      "{{.Id}}",
    ]),
  );
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
    generationIsolationEvidence: JSON.parse(
      readFileSync(generationIsolationReport, "utf8"),
    ) as unknown,
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
