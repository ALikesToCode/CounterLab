import { describe, expect, it } from "vitest";

import { QualifiedRunnerReleaseSchema } from "../src/index";
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

  it("creates a promoted v2 receipt from recomputed evidence", () => {
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
      schemaVersion: "2",
      evidenceCommit,
      registryImage,
      registryDigest: `sha256:${"3".repeat(64)}`,
    });
  });

  it("publishes the v2 receipt as generated JSON Schema", () => {
    const path = resolve(
      process.cwd(),
      "scientific-engines/schemas/qualified-runner-release-v2.schema.json",
    );
    expect(existsSync(path)).toBe(true);
    const schema = JSON.parse(readFileSync(path, "utf8")) as {
      properties?: { schemaVersion?: { const?: string } };
      required?: string[];
    };
    expect(schema.properties?.schemaVersion?.const).toBe("2");
    expect(schema.required).toEqual(
      expect.arrayContaining(["registryImage", "registryDigest"]),
    );
  });
});
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
