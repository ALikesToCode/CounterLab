import { describe, expect, it } from "vitest";

import {
  createGenerationIsolationEvidence,
  verifyGenerationIsolationEvidence,
} from "./generation-isolation-evidence.js";

const sourceCommit = "a".repeat(40);
const sourceTreeSha256 = "b".repeat(64);
const localImageTag = `counterlab-runner:git-${sourceCommit}`;
const localImageDigest = `sha256:${"c".repeat(64)}`;
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
const probeSha256 =
  "700cc58bedc163846e3854415170f49f55da9fd3ba316cc4967747d5268199dc";

function startupProbe() {
  return {
    status: "ready",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: probePayload.checks,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationProbe: probePayload,
    generationIsolationProbeSha256: probeSha256,
  } as const;
}

function createEvidence() {
  return createGenerationIsolationEvidence({
    sourceCommit,
    sourceTreeSha256,
    localImageTag,
    localImageDigest,
    imageUser: "10001:10001",
    startupProbe: startupProbe(),
    verifiedAt: "2026-07-20T21:30:00.000Z",
  });
}

describe("generation-isolation evidence", () => {
  it("binds canonical exact-image probe evidence to source and image", () => {
    const result = createEvidence();
    expect(result.probeSha256).toBe(probeSha256);
    expect(result.evidence).toMatchObject({
      sourceCommit,
      sourceTreeSha256,
      localImageTag,
      localImageDigest,
      imageUser: "10001:10001",
      probePayloadSha256: probeSha256,
    });
    expect(
      verifyGenerationIsolationEvidence({
        evidence: result.evidence,
        evidenceSha256: result.evidenceSha256,
        expected: {
          sourceCommit,
          sourceTreeSha256,
          localImageTag,
          localImageDigest,
          probeSha256,
          verifiedAt: "2026-07-20T21:30:00.000Z",
        },
      }),
    ).toEqual(result);
  });

  it("rejects self-reported, evidence, source, and image hash mutations", () => {
    expect(() =>
      createGenerationIsolationEvidence({
        sourceCommit,
        sourceTreeSha256,
        localImageTag,
        localImageDigest,
        imageUser: "10001:10001",
        startupProbe: {
          ...startupProbe(),
          generationIsolationProbeSha256: "d".repeat(64),
        },
      }),
    ).toThrow(/probe hash/u);

    const result = createEvidence();
    for (const mutation of [
      { evidenceSha256: "d".repeat(64), expected: {} },
      {
        evidenceSha256: result.evidenceSha256,
        expected: { sourceCommit: "e".repeat(40) },
      },
      {
        evidenceSha256: result.evidenceSha256,
        expected: { sourceTreeSha256: "f".repeat(64) },
      },
      {
        evidenceSha256: result.evidenceSha256,
        expected: { localImageDigest: `sha256:${"0".repeat(64)}` },
      },
      {
        evidenceSha256: result.evidenceSha256,
        expected: { probeSha256: "1".repeat(64) },
      },
    ]) {
      expect(() =>
        verifyGenerationIsolationEvidence({
          evidence: result.evidence,
          evidenceSha256: mutation.evidenceSha256,
          expected: {
            sourceCommit,
            sourceTreeSha256,
            localImageTag,
            localImageDigest,
            ...mutation.expected,
          },
        }),
      ).toThrow();
    }
  });

  it("rejects a modified probe payload even when its outer envelope is intact", () => {
    const result = createEvidence();
    expect(() =>
      verifyGenerationIsolationEvidence({
        evidence: {
          ...result.evidence,
          probePayload: {
            ...result.evidence.probePayload,
            bubblewrapVersion: "0.11.1",
          },
        },
        evidenceSha256: result.evidenceSha256,
        expected: {
          sourceCommit,
          sourceTreeSha256,
          localImageTag,
          localImageDigest,
        },
      }),
    ).toThrow();
  });
});
