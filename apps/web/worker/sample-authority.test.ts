import { describe, expect, it } from "vitest";

import boundaryFixtureValue from "../../../fixtures/public/leakage_sample_boundary_v1.json";
import patchEvidenceValue from "../../../fixtures/public/leakage_sample_patch_v1/patch-kernel-result.json";
import legacyResultValue from "../../../replays/leakage-01/compiler/verified-live-run/verified-result.json";
import { FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1 } from "@counterlab/proof-capsule/sample-boundary-authority";
import { sampleManifest } from "./sample-evidence";
import { loadVerifiedSampleLabAuthority } from "./sample-authority";

const LEGACY_HASHES = [
  "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0",
  "92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024",
  "eb20dc7e71431ad5b4a57437d740a1c8844cd335bf3a3d54db48e23dfbd3a034",
  "9304e07716d6b5fec99b16916c2393bc371744faf0e403fb25278cb537214598",
  "ed70072a62888e240e8b6e2fead54f3a08569e4186446aa5562540fa1745d786",
] as const;

describe("fixed sample authority tuple", () => {
  it("resolves only the current notebook, result, Boundary, and patch lineage", async () => {
    const authority = await loadVerifiedSampleLabAuthority({
      manifest: sampleManifest,
    });

    expect(authority).toMatchObject({
      verification: {
        authority: "checked-in-fixed-sample",
        source: "leakage-sample-boundary-v1",
        artifactFileSha256:
          "d0e9f3238753f1ca55534446d83e36041590f31c607a011def3f1d0db3a5bbc9",
        resultHash:
          "a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94",
        resultFileSha256:
          "e2c1cad1e6d774d45671760602e236643bd41ce328df18ff61f1c60344f76170",
        planHash: FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1.experimentIrHash,
      },
      operationSummary: {
        authority: "fixed-approved-sample",
        selectionRef: "whole-customer-holdout",
        operationIds: [
          "leakage.random_row_split",
          "leakage.group_holdout",
          "leakage.entity_overlap",
        ],
      },
    });
    expect(authority.evidenceHashes).toHaveLength(9);
    const serialized = JSON.stringify(authority);
    for (const hash of LEGACY_HASHES) expect(serialized).not.toContain(hash);
  });

  it("rejects a tampered current Boundary fixture", async () => {
    const fixture = structuredClone(boundaryFixtureValue);
    fixture.source.primaryResultFileHash = "0".repeat(64);

    await expect(
      loadVerifiedSampleLabAuthority({
        manifest: sampleManifest,
        fixture,
      }),
    ).rejects.toThrow(/integrity does not resolve/i);
  });

  it("rejects the historical replay result under the current sample manifest", async () => {
    await expect(
      loadVerifiedSampleLabAuthority({
        manifest: sampleManifest,
        result: legacyResultValue,
      }),
    ).rejects.toThrow(/authority tuple does not resolve/i);
  });

  it("rejects historical patch lineage under the current sample fixture", async () => {
    await expect(
      loadVerifiedSampleLabAuthority({
        manifest: sampleManifest,
        patchEvidence: {
          ...patchEvidenceValue,
          originalSha256:
            "92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024",
          patchedSha256:
            "eb20dc7e71431ad5b4a57437d740a1c8844cd335bf3a3d54db48e23dfbd3a034",
        },
      }),
    ).rejects.toThrow(/authority tuple does not resolve/i);
  });
});
