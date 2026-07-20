import { createHash } from "node:crypto";

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
