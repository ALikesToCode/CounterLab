import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DeploymentReceiptV6Schema,
  DeploymentReceiptV7Schema,
  GenerationIsolationEvidenceV1Schema,
  GenerationIsolationEvidenceV2Schema,
  QualifiedRunnerReleaseV6Schema,
  ReleaseCheckReceiptV4Schema,
  ReleaseCheckReceiptV5Schema,
} from "../src/index.js";

const sourceCommit = "a".repeat(40);

function probePayload() {
  return {
    schemaVersion: "1",
    probeVersion: "counterlab-generation-isolation-v1",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: [
      "entrypoint",
      "non-root-user",
      "immutable-paths",
      "codex",
      "python",
      "bubblewrap",
      "bubblewrap-read-isolation",
      "setpriv",
      "writable-roots",
    ],
    generationFilesystemReadIsolation: "OS_ENFORCED",
    bubblewrapVersion: "0.11.0",
    bubblewrap: {
      forbiddenHostPathsHidden: true,
      parentEnvironmentHidden: true,
      workspaceVisible: true,
      workspaceWritable: true,
    },
  } as const;
}

function evidence() {
  return {
    schemaVersion: "1",
    status: "VERIFIED",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    sourceCommit,
    sourceTreeSha256: "b".repeat(64),
    localImageTag: `counterlab-runner:git-${sourceCommit}`,
    localImageDigest: `sha256:${"c".repeat(64)}`,
    imageUser: "10001:10001",
    mountPolicyVersion: "counterlab-bwrap-mount-policy-v1",
    probePayload: probePayload(),
    probePayloadSha256: "d".repeat(64),
    verifiedAt: "2026-07-20T21:30:00.000Z",
    verifierVersion: "counterlab-generation-isolation-evidence-v1",
  } as const;
}

function landlockEvidence() {
  return {
    schemaVersion: "2",
    status: "VERIFIED",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    sourceCommit,
    sourceTreeSha256: "b".repeat(64),
    localImageTag: `counterlab-runner:git-${sourceCommit}`,
    localImageDigest: `sha256:${"c".repeat(64)}`,
    imageUser: "10001:10001",
    policyVersion: "counterlab-landlock-path-policy-v1",
    probePayload: {
      schemaVersion: "2",
      probeVersion: "counterlab-generation-isolation-v2",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: [
        "entrypoint",
        "non-root-user",
        "immutable-paths",
        "codex",
        "python",
        "landlock",
        "landlock-read-isolation",
        "setpriv",
        "writable-roots",
      ],
      generationFilesystemReadIsolation: "OS_ENFORCED",
      mechanism: "landlock",
      landlockAbi: 9,
      landlock: {
        forbiddenHostPathsUnreadable: true,
        forbiddenHostWritesDenied: true,
        crossTreeReferDenied: true,
        execInheritanceEnforced: true,
        parentEnvironmentUnreadable: true,
        workspaceVisible: true,
        workspaceWritable: true,
      },
    },
    probePayloadSha256: "d".repeat(64),
    verifiedAt: "2026-07-23T13:30:00.000Z",
    verifierVersion: "counterlab-generation-isolation-evidence-v2",
  } as const;
}

describe("generation isolation evidence schema", () => {
  it("accepts only the pinned, source-bound, all-true probe envelope", () => {
    expect(GenerationIsolationEvidenceV1Schema.parse(evidence())).toEqual(
      evidence(),
    );
    expect(() =>
      GenerationIsolationEvidenceV1Schema.parse({
        ...evidence(),
        localImageTag: `counterlab-runner:git-${"e".repeat(40)}`,
      }),
    ).toThrow(/bind the source commit/u);
    expect(() =>
      GenerationIsolationEvidenceV1Schema.parse({
        ...evidence(),
        probePayload: {
          ...probePayload(),
          bubblewrap: {
            ...probePayload().bubblewrap,
            forbiddenHostPathsHidden: false,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      GenerationIsolationEvidenceV1Schema.parse({
        ...evidence(),
        unverifiedClaim: true,
      }),
    ).toThrow();
  });

  it("accepts Landlock evidence without reinterpreting historical Bubblewrap receipts", () => {
    expect(
      GenerationIsolationEvidenceV2Schema.parse(landlockEvidence()),
    ).toEqual(landlockEvidence());
    expect(() =>
      GenerationIsolationEvidenceV2Schema.parse({
        ...landlockEvidence(),
        probePayload: {
          ...landlockEvidence().probePayload,
          landlock: {
            ...landlockEvidence().probePayload.landlock,
            forbiddenHostWritesDenied: false,
          },
        },
      }),
    ).toThrow();
  });

  it("adds evidence bindings only in the next receipt versions", () => {
    for (const [schema, version] of [
      [QualifiedRunnerReleaseV6Schema, "6"],
      [ReleaseCheckReceiptV4Schema, "4"],
      [DeploymentReceiptV6Schema, "6"],
    ] as const) {
      const jsonSchema = z.toJSONSchema(schema) as {
        properties?: Record<string, { const?: string }>;
        required?: string[];
      };
      expect(jsonSchema.properties?.schemaVersion?.const).toBe(version);
      expect(jsonSchema.required).toEqual(
        expect.arrayContaining([
          ...(version === "6" && schema === QualifiedRunnerReleaseV6Schema
            ? ["generationIsolationEvidence"]
            : []),
          "generationIsolationEvidenceSha256",
          "generationIsolationProbeSha256",
          "generationIsolationVerifiedAt",
        ]),
      );
    }
    for (const [schema, version] of [
      [ReleaseCheckReceiptV5Schema, "5"],
      [DeploymentReceiptV7Schema, "7"],
    ] as const) {
      const jsonSchema = z.toJSONSchema(schema) as {
        properties?: Record<string, { const?: string }>;
        required?: string[];
      };
      expect(jsonSchema.properties?.schemaVersion?.const).toBe(version);
      expect(jsonSchema.required).toEqual(
        expect.arrayContaining([
          "releaseCheckGenerationIsolationEvidenceSha256",
          "releaseCheckGenerationIsolationProbeSha256",
          "releaseCheckGenerationIsolationVerifiedAt",
          ...(version === "5"
            ? ["releaseCheckGenerationIsolationEvidence"]
            : []),
        ]),
      );
    }
  });

  it("publishes the evidence and next-version receipt schemas", () => {
    for (const path of [
      "generation-isolation-evidence-v1.schema.json",
      "generation-isolation-evidence-v2.schema.json",
      "qualified-runner-release-v6.schema.json",
      "release-check-receipt-v4.schema.json",
      "release-check-receipt-v5.schema.json",
      "deployment-receipt-v6.schema.json",
      "deployment-receipt-v7.schema.json",
    ]) {
      const absolute = resolve(
        process.cwd(),
        "scientific-engines/schemas",
        path,
      );
      expect(existsSync(absolute)).toBe(true);
      const schema = JSON.parse(readFileSync(absolute, "utf8")) as {
        additionalProperties?: boolean;
      };
      expect(schema.additionalProperties).toBe(false);
    }

    const evidenceSchema = JSON.parse(
      readFileSync(
        resolve(
          process.cwd(),
          "scientific-engines/schemas/generation-isolation-evidence-v1.schema.json",
        ),
        "utf8",
      ),
    ) as {
      properties: {
        probePayload: {
          properties: {
            checks: {
              minItems?: number;
              maxItems?: number;
              items?: boolean;
              prefixItems?: unknown[];
            };
          };
        };
      };
    };
    expect(
      evidenceSchema.properties.probePayload.properties.checks,
    ).toMatchObject({
      minItems: 9,
      maxItems: 9,
      items: false,
    });
    expect(
      evidenceSchema.properties.probePayload.properties.checks.prefixItems,
    ).toHaveLength(9);
  });
});
