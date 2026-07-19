import { describe, expect, it } from "vitest";

import {
  assertReleaseCheckBinding,
  createReleaseCheckReceipt,
} from "../../../scripts/release-check-receipt";

const sourceCommit = "a".repeat(40);
const evidenceCommit = "b".repeat(40);

function qualifiedReceipt() {
  return {
    schemaVersion: "3",
    status: "VERIFIED",
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
    evidenceCommit,
    registryImage: `registry.cloudflare.com/account-1/counterlab-runner:git-${sourceCommit}`,
    registryDigest: `sha256:${"1".repeat(64)}`,
    registryResolvedAt: "2026-07-19T00:00:00.000Z",
    qualifiedAt: "2026-07-19T00:01:00.000Z",
    verifierVersion: "counterlab-release-v3",
  } as const;
}

function runtimeAttestation() {
  const session = "rt-v61-test1";
  return {
    schemaVersion: "1",
    status: "VERIFIED",
    sessionId: session,
    namespace: "counterlab-v6.1",
    runtimeToolchainSha256: "7".repeat(64),
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

describe("release-check receipt", () => {
  it("binds every passing gate to the qualified images and runtime", () => {
    const receipt = createReleaseCheckReceipt({
      qualifiedReceipt: qualifiedReceipt(),
      qualifiedReceiptBytes: qualifiedBytes(),
      runtimeAttestation: runtimeAttestation(),
      currentCommit: evidenceCommit,
      worktreeClean: true,
      runnerImageDigest: qualifiedReceipt().localImageDigest,
      adapterImageDigest: qualifiedReceipt().adapterImageDigest,
      checkedAt: "2026-07-19T00:02:00.000Z",
    });

    expect(receipt).toMatchObject({
      status: "PASSED",
      evidenceCommit,
      verifierVersion: "counterlab-release-check-v1",
    });
    expect(receipt.checks).toHaveLength(11);
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
