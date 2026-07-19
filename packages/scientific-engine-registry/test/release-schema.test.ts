import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DeploymentReceiptSchema,
  QualifiedRunnerReleaseSchema,
  QualifiedRunnerReleaseV2Schema,
} from "../src/index";
import * as releaseTools from "../../../scripts/prepare-qualified-deploy";

function legacyReceipt() {
  const sourceCommit = "a".repeat(40);
  return {
    schemaVersion: "1",
    status: "VERIFIED",
    sourceCommit,
    sourceArchiveSha256: "b".repeat(64),
    sourceTreeSha256: "c".repeat(64),
    dockerfileSha256: "d".repeat(64),
    localImageTag: `counterlab-runner:git-${sourceCommit}`,
    localImageDigest: `sha256:${"e".repeat(64)}`,
    ociRevision: sourceCommit,
    ociSourceTreeSha256: "c".repeat(64),
    engineAuthorityHash: "f".repeat(64),
    runtimeManifestHash: "1".repeat(64),
    evidenceCommit: "2".repeat(40),
    qualifiedAt: "2026-07-16T16:00:00.000Z",
    verifierVersion: "counterlab-release-v1",
  };
}

describe("qualified runner release schema", () => {
  it("requires an exact registry promotion digest", () => {
    expect(() => QualifiedRunnerReleaseSchema.parse(legacyReceipt())).toThrow();
  });

  it("creates a runtime-bound promoted v3 receipt from recomputed evidence", () => {
    const sourceCommit = "a".repeat(40);
    const evidenceCommit = "2".repeat(40);
    const registryImage = `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`;
    const create = (
      releaseTools as unknown as {
        createQualifiedRunnerRelease: (
          observation: Record<string, unknown>,
          qualifiedAt: string,
        ) => unknown;
      }
    ).createQualifiedRunnerRelease;

    const receipt = create(
      {
        sourceCommit,
        sourceArchiveSha256: "b".repeat(64),
        sourceTreeSha256: "c".repeat(64),
        dockerfileSha256: "d".repeat(64),
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
        localImageDigest: `sha256:${"e".repeat(64)}`,
        ociRevision: sourceCommit,
        ociSourceTreeSha256: "c".repeat(64),
        engineAuthorityHash: "f".repeat(64),
        runtimeManifestHash: "1".repeat(64),
        runtimeToolchainSha256: "4".repeat(64),
        toolchainLockSha256: "5".repeat(64),
        runtimeAdapterSha256: "6".repeat(64),
        buildctlSha256: "7".repeat(64),
        buildkitdSha256: "8".repeat(64),
        buildkitConfigSha256: "9".repeat(64),
        adapterDockerfileSha256: "a".repeat(64),
        adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
        adapterImageDigest: `sha256:${"b".repeat(64)}`,
        adapterManifestDigest: `sha256:${"c".repeat(64)}`,
        adapterOciArchiveSha256: "d".repeat(64),
        adapterOciRevision: sourceCommit,
        adapterOciSourceTreeSha256: "c".repeat(64),
        currentCommit: evidenceCommit,
        sourceIsAncestor: true,
        changedPaths: ["scientific-engines/snapshot.json"],
        registryImage,
        registryDigest: `sha256:${"3".repeat(64)}`,
        registryResolvedAt: "2026-07-16T16:25:00.000Z",
        observedAt: "2026-07-16T16:30:00.000Z",
      },
      "2026-07-16T16:30:00.000Z",
    );

    expect(QualifiedRunnerReleaseSchema.parse(receipt)).toMatchObject({
      schemaVersion: "3",
      evidenceCommit,
      registryImage,
      registryDigest: `sha256:${"3".repeat(64)}`,
    });
  });

  it("retains strict parsing for historical v2 receipts", () => {
    const sourceCommit = "a".repeat(40);
    expect(
      QualifiedRunnerReleaseV2Schema.parse({
        ...legacyReceipt(),
        schemaVersion: "2",
        registryImage: `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`,
        registryDigest: `sha256:${"3".repeat(64)}`,
        registryResolvedAt: "2026-07-16T16:25:00.000Z",
        qualifiedAt: "2026-07-16T16:30:00.000Z",
      }),
    ).toMatchObject({ schemaVersion: "2" });
  });

  it("publishes the v3 receipt as generated JSON Schema", () => {
    const path = resolve(
      process.cwd(),
      "scientific-engines/schemas/qualified-runner-release-v3.schema.json",
    );
    expect(existsSync(path)).toBe(true);
    const schema = JSON.parse(readFileSync(path, "utf8")) as {
      properties?: { schemaVersion?: { const?: string } };
      required?: string[];
    };
    expect(schema.properties?.schemaVersion?.const).toBe("3");
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "registryImage",
        "registryDigest",
        "runtimeToolchainSha256",
        "runtimeAdapterSha256",
        "adapterImageDigest",
      ]),
    );
  });
});

describe("deployment receipt schema", () => {
  function receipt() {
    const worker = "a".repeat(40);
    const runner = "b".repeat(40);
    const digest = `sha256:${"c".repeat(64)}`;
    return {
      schemaVersion: "3",
      status: "DEPLOYED",
      workerName: "counterlab",
      productionOrigin: "https://counterlab.cserules.workers.dev",
      generationFilesystemReadIsolation: "PARTIAL",
      workerEvidenceCommit: worker,
      runnerSourceCommit: runner,
      qualifiedRunnerReceiptSha256: "1".repeat(64),
      releaseCheckReceiptSha256: "2".repeat(64),
      releaseCheckCheckedAt: "2026-07-19T00:02:00.000Z",
      runtimeToolchainSha256: "3".repeat(64),
      runtimeAdapterSha256: "4".repeat(64),
      adapterImageDigest: `sha256:${"5".repeat(64)}`,
      workerVersionId: "11111111-2222-3333-4444-555555555555",
      workerTag: `git-${worker}`,
      workerMessage: `CounterLab Worker ${worker}; runner ${runner}`,
      containerApplicationId: "container-app-1",
      containerApplicationVersion: "3",
      containerImage: `registry.cloudflare.com/account/counterlab-runner@${digest}`,
      containerState: "active",
      containerImageDigest: digest,
      deployConfigSha256: "6".repeat(64),
      workerBundleSha256: "7".repeat(64),
      clientAssetsSha256: "8".repeat(64),
      clientAssetCount: 9,
      dryRunSha256: "9".repeat(64),
      dryRunFileCount: 10,
      deploymentStatusSha256: "a".repeat(64),
      workerVersionSha256: "b".repeat(64),
      containerStatusSha256: "c".repeat(64),
      deployedAt: "2026-07-19T00:03:00.000Z",
      verifierVersion: "counterlab-deployment-v3",
    } as const;
  }

  it("binds the deployed Worker, Container, release checks, and exact artifacts", () => {
    expect(DeploymentReceiptSchema.parse(receipt())).toMatchObject({
      schemaVersion: "3",
      status: "DEPLOYED",
      workerName: "counterlab",
    });
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        containerImage: `registry.cloudflare.com/account/counterlab-runner@sha256:${"d".repeat(64)}`,
      }),
    ).toThrow(/exact qualified digest/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        releaseCheckCheckedAt: "2026-07-19T00:04:00.000Z",
      }),
    ).toThrow(/precede deployment/u);
    expect(() =>
      DeploymentReceiptSchema.parse({
        ...receipt(),
        generationFilesystemReadIsolation: "OS_ENFORCED",
      }),
    ).toThrow();
  });

  it("publishes the strict v3 deployment receipt as generated JSON Schema", () => {
    const path = resolve(
      process.cwd(),
      "scientific-engines/schemas/deployment-receipt-v3.schema.json",
    );
    expect(existsSync(path)).toBe(true);
    const schema = JSON.parse(readFileSync(path, "utf8")) as {
      additionalProperties?: boolean;
      properties?: { schemaVersion?: { const?: string } };
      required?: string[];
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties?.schemaVersion?.const).toBe("3");
    expect(schema.required).toEqual(
      expect.arrayContaining([
        "qualifiedRunnerReceiptSha256",
        "releaseCheckReceiptSha256",
        "generationFilesystemReadIsolation",
        "runtimeToolchainSha256",
        "adapterImageDigest",
        "workerBundleSha256",
        "clientAssetsSha256",
      ]),
    );
  });
});
