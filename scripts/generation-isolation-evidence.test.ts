import { describe, expect, it } from "vitest";

import {
  createGenerationIsolationEvidence,
  verifyGenerationIsolationEvidence,
} from "./generation-isolation-evidence.js";
import { hashGenerationIsolationProbe } from "../services/hosted-runner/src/startup-probe.js";

const sourceCommit = "a".repeat(40);
const sourceTreeSha256 = "b".repeat(64);
const localImageTag = `counterlab-runner:git-${sourceCommit}`;
const localImageDigest = `sha256:${"c".repeat(64)}`;
const probePayload = {
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
} as const;
const probeSha256 = hashGenerationIsolationProbe(probePayload);

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
  it("binds the privilege-separated v3 identities and policy", () => {
    const processIdentity = {
      brokerUid: 0,
      brokerGid: 0,
      runnerUid: 10_001,
      runnerGid: 10_001,
      generatorUid: 10_002,
      generatorGid: 10_002,
      generatorSupplementaryGroupsCleared: true,
      generatorCapabilitiesEmpty: true,
      generatorNoNewPrivileges: true,
      protectedPathsUnreadable: true,
      protectedPathsUnwritable: true,
      parentEnvironmentUnreadable: true,
      brokerEnvironmentUnreadable: true,
      workspaceVisible: true,
      workspaceWritable: true,
      outsideWorkspaceWritesDenied: true,
      fixedKernelUnavailable: true,
      credentialReadOnlyDuringInitialization: true,
      credentialRevocationSupported: true,
      boundedLaunchesEnforced: true,
      maximumLaunches: 3,
    } as const;
    const v3Probe = {
      schemaVersion: "3",
      probeVersion: "counterlab-generation-isolation-v3",
      service: "counterlab-hosted-runner",
      probe: "non-root-startup",
      checks: [
        "entrypoint",
        "non-root-user",
        "immutable-paths",
        "python",
        "setpriv",
        "privsep-broker",
        "posix-dac-process-identity",
        "writable-roots",
      ],
      generationFilesystemReadIsolation: "OS_ENFORCED",
      mechanism: "posix-dac-process-identity",
      brokerIdentity: "0:0",
      runnerIdentity: "10001:10001",
      generatorIdentity: "10002:10002",
      policyVersion: "counterlab-posix-dac-process-policy-v1",
      processIdentity,
    } as const;
    const generationIsolationProbeSha256 =
      hashGenerationIsolationProbe(v3Probe);
    const result = createGenerationIsolationEvidence({
      sourceCommit,
      sourceTreeSha256,
      localImageTag,
      localImageDigest,
      imageUser: "0:0",
      startupProbe: {
        status: "ready",
        service: "counterlab-hosted-runner",
        probe: "non-root-startup",
        checks: v3Probe.checks,
        generationFilesystemReadIsolation: "OS_ENFORCED",
        generationIsolationProbe: v3Probe,
        generationIsolationProbeSha256,
      },
      verifiedAt: "2026-07-27T10:30:00.000Z",
    });
    expect(result.evidence).toMatchObject({
      schemaVersion: "3",
      imageUser: "0:0",
      policyVersion: "counterlab-posix-dac-process-policy-v1",
      probePayload: v3Probe,
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
          imageUser: "0:0",
          probeSha256: generationIsolationProbeSha256,
        },
      }),
    ).toEqual(result);
  });

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
            landlockAbi: 2,
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
