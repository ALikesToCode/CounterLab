import { describe, expect, it } from "vitest";

import { SourceBoundBuildReceiptSchema } from "./source-bound-build-receipt.js";

const commit = "a".repeat(40);
const sha = "b".repeat(64);
const digest = `sha256:${sha}`;

const receipt = {
  schemaVersion: "4" as const,
  status: "BUILT" as const,
  sourceCommit: commit,
  sourceArchiveSha256: sha,
  sourceTreeSha256: sha,
  dockerfileSha256: sha,
  localImageTag: `counterlab-runner:git-${commit}`,
  localImageDigest: digest,
  localManifestDigest: digest,
  localOciArchive: ".rt/releases/runner.oci.tar",
  localOciArchiveSha256: sha,
  adapterDockerfileSha256: sha,
  adapterImageTag: `counterlab-adapter:git-${commit}`,
  adapterImageDigest: digest,
  adapterManifestDigest: digest,
  adapterOciArchive: ".rt/releases/adapter.oci.tar",
  adapterOciArchiveSha256: sha,
  adapterOciRevision: commit,
  adapterOciSourceTreeSha256: sha,
  runtimeToolchainSha256: sha,
  runtimePolicySha256: sha,
  proofDependencyManifestSha256: sha,
  toolchainLockSha256: sha,
  runtimeAdapterSha256: sha,
  buildctlSha256: sha,
  buildkitdSha256: sha,
  buildkitConfigSha256: sha,
  builtAt: "2026-07-20T07:00:00.000Z",
};

describe("source-bound build receipt", () => {
  it("accepts the complete v4 receipt and rejects legacy or partial shapes", () => {
    expect(SourceBoundBuildReceiptSchema.parse(receipt)).toEqual(receipt);
    expect(() =>
      SourceBoundBuildReceiptSchema.parse({ ...receipt, schemaVersion: "3" }),
    ).toThrow();
    const { runtimePolicySha256: _omitted, ...partial } = receipt;
    expect(() => SourceBoundBuildReceiptSchema.parse(partial)).toThrow();
  });
});
