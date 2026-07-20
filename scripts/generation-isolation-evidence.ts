import { createHash } from "node:crypto";
import { lstat, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  GENERATION_ISOLATION_MOUNT_POLICY_VERSION,
  GenerationIsolationEvidenceV1Schema,
  GenerationIsolationProbePayloadSchema,
  QualifiedRunnerReleaseV6Schema,
  type GenerationIsolationEvidenceV1,
  type QualifiedRunnerReleaseV6,
} from "../packages/scientific-engine-registry/src/index.js";
import { canonicalJson } from "../packages/session-core/src/index.js";
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const StartupProbeResultSchema = z
  .strictObject({
    status: z.literal("ready"),
    service: z.literal("counterlab-hosted-runner"),
    probe: z.literal("non-root-startup"),
    checks: GenerationIsolationProbePayloadSchema.shape.checks,
    generationFilesystemReadIsolation: z.literal("OS_ENFORCED"),
    generationIsolationProbe: GenerationIsolationProbePayloadSchema,
    generationIsolationProbeSha256: Sha256Schema,
  })
  .superRefine((result, context) => {
    for (const [field, outer, inner] of [
      ["service", result.service, result.generationIsolationProbe.service],
      ["probe", result.probe, result.generationIsolationProbe.probe],
      [
        "checks",
        canonicalJson(result.checks),
        canonicalJson(result.generationIsolationProbe.checks),
      ],
      [
        "generationFilesystemReadIsolation",
        result.generationFilesystemReadIsolation,
        result.generationIsolationProbe.generationFilesystemReadIsolation,
      ],
    ] as const) {
      if (outer !== inner) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${field} must match the nested isolation probe`,
        });
      }
    }
  });

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

export function hashGenerationIsolationEvidence(
  evidence: GenerationIsolationEvidenceV1,
): string {
  return sha256Canonical(GenerationIsolationEvidenceV1Schema.parse(evidence));
}

export function createGenerationIsolationEvidence(input: {
  sourceCommit: string;
  sourceTreeSha256: string;
  localImageTag: string;
  localImageDigest: string;
  imageUser: string;
  startupProbe: unknown;
  verifiedAt?: string;
}): {
  evidence: GenerationIsolationEvidenceV1;
  evidenceSha256: string;
  probeSha256: string;
} {
  const startupProbe = StartupProbeResultSchema.parse(input.startupProbe);
  const probeSha256 = sha256Canonical(startupProbe.generationIsolationProbe);
  if (probeSha256 !== startupProbe.generationIsolationProbeSha256) {
    throw new Error(
      "Generation-isolation probe hash does not match the exact-image payload",
    );
  }
  const evidence = GenerationIsolationEvidenceV1Schema.parse({
    schemaVersion: "1",
    status: "VERIFIED",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    sourceCommit: input.sourceCommit,
    sourceTreeSha256: input.sourceTreeSha256,
    localImageTag: input.localImageTag,
    localImageDigest: input.localImageDigest,
    imageUser: input.imageUser,
    mountPolicyVersion: GENERATION_ISOLATION_MOUNT_POLICY_VERSION,
    probePayload: startupProbe.generationIsolationProbe,
    probePayloadSha256: probeSha256,
    verifiedAt: input.verifiedAt ?? new Date().toISOString(),
    verifierVersion: "counterlab-generation-isolation-evidence-v1",
  });
  return {
    evidence,
    evidenceSha256: hashGenerationIsolationEvidence(evidence),
    probeSha256,
  };
}

export function verifyGenerationIsolationEvidence(input: {
  evidence: unknown;
  evidenceSha256: string;
  expected: {
    sourceCommit: string;
    sourceTreeSha256: string;
    localImageTag: string;
    localImageDigest: string;
    imageUser?: "10001:10001";
    probeSha256?: string;
    verifiedAt?: string;
  };
}): {
  evidence: GenerationIsolationEvidenceV1;
  evidenceSha256: string;
  probeSha256: string;
} {
  const evidence = GenerationIsolationEvidenceV1Schema.parse(input.evidence);
  const evidenceSha256 = hashGenerationIsolationEvidence(evidence);
  if (evidenceSha256 !== Sha256Schema.parse(input.evidenceSha256)) {
    throw new Error("Generation-isolation evidence hash mismatch");
  }
  const probeSha256 = sha256Canonical(evidence.probePayload);
  if (probeSha256 !== evidence.probePayloadSha256) {
    throw new Error("Generation-isolation probe payload hash mismatch");
  }
  for (const [field, expected, observed] of [
    ["sourceCommit", input.expected.sourceCommit, evidence.sourceCommit],
    [
      "sourceTreeSha256",
      input.expected.sourceTreeSha256,
      evidence.sourceTreeSha256,
    ],
    ["localImageTag", input.expected.localImageTag, evidence.localImageTag],
    [
      "localImageDigest",
      input.expected.localImageDigest,
      evidence.localImageDigest,
    ],
    [
      "imageUser",
      input.expected.imageUser ?? "10001:10001",
      evidence.imageUser,
    ],
    [
      "probeSha256",
      input.expected.probeSha256 ?? evidence.probePayloadSha256,
      evidence.probePayloadSha256,
    ],
    [
      "verifiedAt",
      input.expected.verifiedAt ?? evidence.verifiedAt,
      evidence.verifiedAt,
    ],
  ] as const) {
    if (expected !== observed) {
      throw new Error(`Generation-isolation ${field} binding mismatch`);
    }
  }
  return { evidence, evidenceSha256, probeSha256 };
}

export function parseQualifiedRunnerReleaseV6(
  value: unknown,
): QualifiedRunnerReleaseV6 {
  const release = QualifiedRunnerReleaseV6Schema.parse(value);
  verifyGenerationIsolationEvidence({
    evidence: release.generationIsolationEvidence,
    evidenceSha256: release.generationIsolationEvidenceSha256,
    expected: {
      sourceCommit: release.sourceCommit,
      sourceTreeSha256: release.sourceTreeSha256,
      localImageTag: release.localImageTag,
      localImageDigest: release.localImageDigest,
      probeSha256: release.generationIsolationProbeSha256,
      verifiedAt: release.generationIsolationVerifiedAt,
    },
  });
  return release;
}

function isContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function newContainedOutput(root: string, requested: string) {
  const output = resolve(root, requested);
  if (!isContained(root, output) || output === root) {
    throw new Error(
      "Generation-isolation output must remain in the repository",
    );
  }
  let current = root;
  for (const component of relative(root, output).split(sep)) {
    current = resolve(current, component);
    try {
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink()) {
        throw new Error("Generation-isolation output path contains a symlink");
      }
      if (!isContained(root, await realpath(current))) {
        throw new Error(
          "Generation-isolation output path escapes the repository",
        );
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") break;
      throw error;
    }
  }
  const parent = await realpath(dirname(output));
  if (!isContained(root, parent) || !(await stat(parent)).isDirectory()) {
    throw new Error("Generation-isolation output parent is not contained");
  }
  try {
    await lstat(output);
    throw new Error("Generation-isolation output already exists");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return output;
}

function cliArguments(argv: string[]): Record<string, string> {
  const allowed = new Set([
    "--source-commit",
    "--source-tree-sha256",
    "--local-image-tag",
    "--local-image-digest",
    "--image-user",
    "--startup-probe-json",
    "--verified-at",
    "--output",
  ]);
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (
      flag === undefined ||
      value === undefined ||
      !allowed.has(flag) ||
      values.has(flag)
    ) {
      throw new Error("Invalid generation-isolation evidence arguments");
    }
    values.set(flag, value);
  }
  if (values.size !== allowed.size) {
    throw new Error("Incomplete generation-isolation evidence arguments");
  }
  return Object.fromEntries(values);
}

async function main(): Promise<void> {
  const root = await realpath(resolve(import.meta.dirname, ".."));
  const values = cliArguments(process.argv.slice(2));
  const output = await newContainedOutput(root, values["--output"] ?? "");
  const result = createGenerationIsolationEvidence({
    sourceCommit: values["--source-commit"] ?? "",
    sourceTreeSha256: values["--source-tree-sha256"] ?? "",
    localImageTag: values["--local-image-tag"] ?? "",
    localImageDigest: values["--local-image-digest"] ?? "",
    imageUser: values["--image-user"] ?? "",
    startupProbe: JSON.parse(values["--startup-probe-json"] ?? "") as unknown,
    verifiedAt: values["--verified-at"] ?? "",
  });
  await writeFile(output, `${JSON.stringify(result.evidence, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    JSON.stringify({
      evidenceSha256: result.evidenceSha256,
      probeSha256: result.probeSha256,
      output: relative(root, output),
    }),
  );
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  await main();
}
