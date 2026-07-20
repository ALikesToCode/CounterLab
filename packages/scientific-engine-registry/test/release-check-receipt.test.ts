import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ReleaseCheckReceiptSchema,
  ReleaseCheckReceiptV2Schema,
  ReleaseCheckReceiptV3Schema,
} from "../src/index";
import { createGenerationIsolationEvidence } from "../../../scripts/generation-isolation-evidence";

import {
  assertReleaseCheckBinding,
  createDeploymentReleaseIdentity,
  createQualifiedReleaseIdentity,
  createReleaseCheckReceipt,
} from "../../../scripts/release-check-receipt";

const sourceCommit = "a".repeat(40);
const evidenceCommit = "b".repeat(40);

function generationIsolation(verifiedAt = "2026-07-19T00:00:30.000Z") {
  const probePayload = {
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
  return createGenerationIsolationEvidence({
    sourceCommit,
    sourceTreeSha256: "2".repeat(64),
    localImageTag: `counterlab-runner:git-${sourceCommit}`,
    localImageDigest: `sha256:${"4".repeat(64)}`,
    imageUser: "10001:10001",
    verifiedAt,
    startupProbe: {
      status: "ready",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: probePayload.checks,
      generationFilesystemReadIsolation: "OS_ENFORCED",
      generationIsolationProbe: probePayload,
      generationIsolationProbeSha256:
        "700cc58bedc163846e3854415170f49f55da9fd3ba316cc4967747d5268199dc",
    },
  });
}

function generationIsolationFields() {
  const result = generationIsolation();
  return {
    generationIsolationEvidence: result.evidence,
    generationIsolationEvidenceSha256: result.evidenceSha256,
    generationIsolationProbeSha256: result.probeSha256,
    generationIsolationVerifiedAt: result.evidence.verifiedAt,
  } as const;
}

function freshGenerationIsolationEvidence() {
  return generationIsolation("2026-07-19T00:01:30.000Z").evidence;
}

function qualifiedReceipt() {
  return {
    schemaVersion: "6",
    status: "VERIFIED",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    ...generationIsolationFields(),
    sourceCommit,
    sourceArchiveSha256: "1".repeat(64),
    sourceTreeSha256: "2".repeat(64),
    dockerfileSha256: "3".repeat(64),
    localImageTag: `counterlab-runner:git-${sourceCommit}`,
    localImageDigest: `sha256:${"4".repeat(64)}`,
    ociRevision: sourceCommit,
    ociSourceTreeSha256: "2".repeat(64),
    engineAuthorityHash: "5".repeat(64),
    runtimeManifestHash: "6".repeat(64),
    runtimeToolchainSha256: "7".repeat(64),
    runtimePolicySha256: "2".repeat(64),
    proofDependencyManifestSha256: "3".repeat(64),
    toolchainLockSha256: "8".repeat(64),
    runtimeAdapterSha256: "9".repeat(64),
    buildctlSha256: "a".repeat(64),
    buildkitdSha256: "b".repeat(64),
    buildkitConfigSha256: "c".repeat(64),
    adapterDockerfileSha256: "d".repeat(64),
    adapterImageTag: `counterlab-adapter:git-${sourceCommit}`,
    adapterImageDigest: `sha256:${"e".repeat(64)}`,
    adapterManifestDigest: `sha256:${"f".repeat(64)}`,
    adapterOciArchiveSha256: "0".repeat(64),
    adapterOciRevision: sourceCommit,
    adapterOciSourceTreeSha256: "2".repeat(64),
    limitMode: "container-cgroup-and-process-rlimit",
    aggregateLimitIntentEnforced: true,
    aggregateLimitEvidenceSha256: "2".repeat(64),
    timeoutCleanupReceipt: `node_modules/.cache/counterlab-v6.1/releases/timeout-cleanup-${sourceCommit}.json`,
    timeoutCleanupReceiptSha256: "3".repeat(64),
    timeoutCleanupPayloadSha256: "4".repeat(64),
    timeoutRunControlReceiptSha256: "5".repeat(64),
    timeoutRootlessReceiptSha256: "6".repeat(64),
    timeoutRuntimeSessionId: "rt-v61-test1",
    timeoutVerifiedAt: "2026-07-19T00:00:30.000Z",
    evidenceCommit,
    registryImage: `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`,
    registryDigest: `sha256:${"1".repeat(64)}`,
    registryResolvedAt: "2026-07-19T00:00:00.000Z",
    qualifiedAt: "2026-07-19T00:01:00.000Z",
    verifierVersion: "counterlab-release-v6",
  } as const;
}

function runtimeAttestation() {
  const session = "rt-v61-test1";
  return {
    schemaVersion: "2",
    status: "VERIFIED",
    sessionId: session,
    namespace: "counterlab-v6.1",
    runtimeToolchainSha256: "7".repeat(64),
    runtimePolicySha256: "2".repeat(64),
    proofDependencyManifestSha256: "3".repeat(64),
    toolchainLockSha256: "8".repeat(64),
    adapterSha256: "9".repeat(64),
    componentSha256: {
      buildctl: "a".repeat(64),
      buildkitd: "b".repeat(64),
      containerd: "c".repeat(64),
      "containerd-shim-runc-v2": "d".repeat(64),
      ctr: "1".repeat(64),
      nerdctl: "e".repeat(64),
      rootlesskit: "f".repeat(64),
      runc: "0".repeat(64),
    },
    fileSha256: {
      containerdConfig: "1".repeat(64),
      buildkitConfig: "c".repeat(64),
    },
    containerdRootlesskitApiSocket: `.rt/${session}/run/containerd-rootless/api.sock`,
    containerdSocket: `.rt/${session}/run/containerd.sock`,
    runtimeCommandSocket: `.rt/${session}/run/runtime-command.sock`,
    buildkitSocket: `.rt/${session}/run/buildkitd.sock`,
  } as const;
}

function qualifiedBytes(): Buffer {
  return Buffer.from(`${JSON.stringify(qualifiedReceipt(), null, 2)}\n`);
}

function deploymentReceipt() {
  const worker = "c".repeat(40);
  const runner = "d".repeat(40);
  const digest = `sha256:${"a".repeat(64)}`;
  return {
    schemaVersion: "6",
    status: "DEPLOYED",
    workerName: "counterlab",
    productionOrigin: "https://counterlab.cserules.workers.dev",
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationEvidenceSha256: "0".repeat(64),
    generationIsolationProbeSha256: "1".repeat(64),
    generationIsolationVerifiedAt: "2026-07-18T23:58:00.000Z",
    workerEvidenceCommit: worker,
    runnerSourceCommit: runner,
    qualifiedRunnerReceiptSha256: "1".repeat(64),
    releaseCheckReceiptSha256: "2".repeat(64),
    releaseCheckCheckedAt: "2026-07-18T23:59:00.000Z",
    timeoutCleanupReceiptSha256: "b".repeat(64),
    aggregateLimitEvidenceSha256: "6".repeat(64),
    runtimeToolchainSha256: "3".repeat(64),
    runtimePolicySha256: "c".repeat(64),
    proofDependencyManifestSha256: "d".repeat(64),
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
    workerArtifactClassification: "PROCESS_BOUND_PARTIAL",
    workerArtifactManifestSha256: "e".repeat(64),
    deployConfigSha256: "6".repeat(64),
    workerBundleSha256: "7".repeat(64),
    clientAssetsSha256: "8".repeat(64),
    clientAssetCount: 9,
    clientPublicAssetsSha256: "9".repeat(64),
    clientPublicAssetCount: 7,
    viteVersion: "8.1.4",
    wranglerVersion: "4.110.0",
    dryRunSha256: "7".repeat(64),
    dryRunFileCount: 1,
    deploymentStatusSha256: "b".repeat(64),
    workerVersionSha256: "c".repeat(64),
    containerStatusSha256: "d".repeat(64),
    deployedAt: "2026-07-19T00:00:00.000Z",
    verifierVersion: "counterlab-deployment-v6",
  } as const;
}

describe("release-check receipt", () => {
  it("hands qualified identity across as strict keyed JSON bound to exact bytes", () => {
    const bytes = qualifiedBytes();
    const identity = createQualifiedReleaseIdentity(bytes);

    expect(Object.keys(identity).sort()).toEqual([
      "identitySchemaVersion",
      "receipt",
      "receiptSha256",
      "receiptType",
    ]);
    expect(identity).toMatchObject({
      identitySchemaVersion: "1",
      receiptType: "qualified-runner-release",
      receiptSha256: createHash("sha256").update(bytes).digest("hex"),
      receipt: {
        evidenceCommit,
        sourceCommit,
        localImageTag: `counterlab-runner:git-${sourceCommit}`,
      },
    });

    const differentlySerialized = Buffer.from(
      JSON.stringify(qualifiedReceipt()),
    );
    expect(
      createQualifiedReleaseIdentity(differentlySerialized).receipt,
    ).toEqual(identity.receipt);
    expect(
      createQualifiedReleaseIdentity(differentlySerialized).receiptSha256,
    ).not.toBe(identity.receiptSha256);

    const missing: Record<string, unknown> = { ...qualifiedReceipt() };
    delete missing.runtimePolicySha256;
    expect(() =>
      createQualifiedReleaseIdentity(Buffer.from(JSON.stringify(missing))),
    ).toThrow();
    expect(() =>
      createQualifiedReleaseIdentity(
        Buffer.from(
          JSON.stringify({ ...qualifiedReceipt(), unexpected: true }),
        ),
      ),
    ).toThrow();
  });

  it("hands deployment identity across as strict keyed JSON bound to exact bytes", () => {
    const bytes = Buffer.from(
      `${JSON.stringify(deploymentReceipt(), null, 2)}\n`,
    );
    const identity = createDeploymentReleaseIdentity(bytes);

    expect(Object.keys(identity).sort()).toEqual([
      "identitySchemaVersion",
      "receipt",
      "receiptSha256",
      "receiptType",
    ]);
    expect(identity).toMatchObject({
      identitySchemaVersion: "1",
      receiptType: "deployment-receipt",
      receiptSha256: createHash("sha256").update(bytes).digest("hex"),
      receipt: {
        workerVersionId: deploymentReceipt().workerVersionId,
        workerEvidenceCommit: deploymentReceipt().workerEvidenceCommit,
        runnerSourceCommit: deploymentReceipt().runnerSourceCommit,
        containerImageDigest: deploymentReceipt().containerImageDigest,
      },
    });

    const missing: Record<string, unknown> = { ...deploymentReceipt() };
    delete missing.releaseCheckReceiptSha256;
    expect(() =>
      createDeploymentReleaseIdentity(Buffer.from(JSON.stringify(missing))),
    ).toThrow();
    expect(() =>
      createDeploymentReleaseIdentity(
        Buffer.from(
          JSON.stringify({
            ...deploymentReceipt(),
            workerTag: `git-${"0".repeat(40)}`,
          }),
        ),
      ),
    ).toThrow(/Worker tag/u);
  });

  it("uses named receipt accessors instead of positional release tuples", () => {
    const releaseCheck = readFileSync("scripts/release-check.sh", "utf8");
    const deploy = readFileSync("scripts/deploy-qualified.sh", "utf8");
    const smoke = readFileSync("scripts/production-smoke.sh", "utf8");

    for (const script of [releaseCheck, deploy]) {
      expect(script).not.toContain("RELEASE_IDENTITY[");
      expect(script).toContain("qualified_identity_value evidenceCommit");
      expect(script).toContain("receiptSha256");
    }
    expect(smoke).not.toContain("IFS=$'\\t'");
    expect(smoke).toContain("deployment_identity_value workerVersionId");
    expect(smoke).toContain("deployment_identity_value receiptSha256");
  });

  it("binds every passing gate to the qualified images and runtime", () => {
    const receipt = createReleaseCheckReceipt({
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      generationIsolationEvidence: freshGenerationIsolationEvidence(),
      checkedAt: "2026-07-19T00:02:00.000Z",
    });

    expect(receipt).toMatchObject({
      schemaVersion: "4",
      status: "PASSED",
      generationFilesystemReadIsolation: "OS_ENFORCED",
      evidenceCommit,
      verifierVersion: "counterlab-release-check-v4",
    });
    expect(receipt.checks).toHaveLength(11);
  });

  it("requires a fresh exact-image probe that matches qualification", () => {
    const input = {
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      checkedAt: "2026-07-19T00:02:00.000Z",
    } as const;
    expect(() =>
      createReleaseCheckReceipt({
        ...input,
        generationIsolationEvidence: {
          ...freshGenerationIsolationEvidence(),
          sourceCommit: "0".repeat(40),
        },
      }),
    ).toThrow(/source commit|sourceCommit/iu);
    expect(() =>
      createReleaseCheckReceipt({
        ...input,
        generationIsolationEvidence: generationIsolation(
          "2026-07-18T22:00:00.000Z",
        ).evidence,
      }),
    ).toThrow(/not fresh/u);
  });

  it("preserves v3 and v2 receipts while requiring hash binding in v4", () => {
    const current = createReleaseCheckReceipt({
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      generationIsolationEvidence: freshGenerationIsolationEvidence(),
      checkedAt: "2026-07-19T00:02:00.000Z",
    });
    const {
      generationIsolationEvidenceSha256: _generationIsolationEvidenceSha256,
      generationIsolationProbeSha256: _generationIsolationProbeSha256,
      generationIsolationVerifiedAt: _generationIsolationVerifiedAt,
      ...legacyV3
    } = current;
    expect(
      ReleaseCheckReceiptV3Schema.parse({
        ...legacyV3,
        schemaVersion: "3",
        verifierVersion: "counterlab-release-check-v3",
      }),
    ).toMatchObject({ schemaVersion: "3" });
    const {
      generationFilesystemReadIsolation: _generationFilesystemReadIsolation,
      ...legacy
    } = legacyV3;

    expect(
      ReleaseCheckReceiptV2Schema.parse({
        ...legacy,
        schemaVersion: "2",
        verifierVersion: "counterlab-release-check-v2",
      }),
    ).toMatchObject({ schemaVersion: "2" });
    expect(() =>
      ReleaseCheckReceiptSchema.parse({
        ...current,
        generationFilesystemReadIsolation: "PARTIAL",
      }),
    ).toThrow();
  });

  it("publishes distinct historical v2 and isolation-enforced v3 schemas", () => {
    const v2Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/release-check-receipt-v2.schema.json",
    );
    const v3Path = resolve(
      process.cwd(),
      "scientific-engines/schemas/release-check-receipt-v3.schema.json",
    );
    expect(existsSync(v2Path)).toBe(true);
    expect(existsSync(v3Path)).toBe(true);
    const v2 = JSON.parse(readFileSync(v2Path, "utf8")) as {
      properties?: Record<string, { const?: string }>;
      required?: string[];
    };
    const v3 = JSON.parse(readFileSync(v3Path, "utf8")) as typeof v2;

    expect(v2.properties?.schemaVersion?.const).toBe("2");
    expect(v2.properties).not.toHaveProperty(
      "generationFilesystemReadIsolation",
    );
    expect(v2.required).not.toContain("generationFilesystemReadIsolation");
    expect(v3.properties?.schemaVersion?.const).toBe("3");
    expect(v3.properties?.generationFilesystemReadIsolation?.const).toBe(
      "OS_ENFORCED",
    );
    expect(v3.required).toContain("generationFilesystemReadIsolation");
  });

  it("rejects a different qualified receipt or live runtime", () => {
    const receipt = createReleaseCheckReceipt({
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      generationIsolationEvidence: freshGenerationIsolationEvidence(),
      checkedAt: "2026-07-19T00:02:00.000Z",
    });
    const common = {
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      releaseCheckReceipt: receipt,
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      observedAt: "2026-07-19T00:03:00.000Z",
    };

    expect(() =>
      assertReleaseCheckBinding({
        ...common,
        qualifiedReceiptBytes: Buffer.concat([
          qualifiedBytes(),
          Buffer.from(" "),
        ]),
        runtimeAttestation: runtimeAttestation(),
      }),
    ).toThrow(/qualified receipt hash/u);
    expect(() =>
      assertReleaseCheckBinding({
        ...common,
        runtimeAttestation: {
          ...runtimeAttestation(),
          runtimeToolchainSha256: "0".repeat(64),
        },
      }),
    ).toThrow(/live runtime toolchain/u);

    for (const [field, label] of [
      ["runtimePolicySha256", /runtime policy/u],
      ["proofDependencyManifestSha256", /proof dependency manifest/u],
    ] as const) {
      expect(() =>
        assertReleaseCheckBinding({
          ...common,
          releaseCheckReceipt: {
            ...receipt,
            [field]: "0".repeat(64),
          },
          runtimeAttestation: runtimeAttestation(),
        }),
      ).toThrow(label);
      expect(() =>
        assertReleaseCheckBinding({
          ...common,
          runtimeAttestation: {
            ...runtimeAttestation(),
            [field]: "0".repeat(64),
          },
        }),
      ).toThrow(new RegExp(`live ${label.source}`, "u"));
    }
    for (const [field, value, label] of [
      [
        "generationIsolationEvidenceSha256",
        "0".repeat(64),
        /generation isolation evidence/u,
      ],
      [
        "generationIsolationProbeSha256",
        "0".repeat(64),
        /generation isolation probe/u,
      ],
      [
        "generationIsolationVerifiedAt",
        "2026-07-19T00:00:31.000Z",
        /generation isolation verification/u,
      ],
    ] as const) {
      expect(() =>
        assertReleaseCheckBinding({
          ...common,
          releaseCheckReceipt: { ...receipt, [field]: value },
          runtimeAttestation: runtimeAttestation(),
        }),
      ).toThrow(label);
    }
  });

  it("rejects stale receipts and incomplete check sets", () => {
    const receipt = createReleaseCheckReceipt({
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      generationIsolationEvidence: freshGenerationIsolationEvidence(),
      checkedAt: "2026-07-19T00:02:00.000Z",
    });
    const common = {
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
    };

    expect(() =>
      assertReleaseCheckBinding({
        ...common,
        releaseCheckReceipt: receipt,
        observedAt: "2026-07-20T00:03:01.000Z",
      }),
    ).toThrow(/stale/u);
    expect(() =>
      assertReleaseCheckBinding({
        ...common,
        releaseCheckReceipt: { ...receipt, checks: receipt.checks.slice(1) },
        observedAt: "2026-07-19T00:03:00.000Z",
      }),
    ).toThrow();
  });
});
