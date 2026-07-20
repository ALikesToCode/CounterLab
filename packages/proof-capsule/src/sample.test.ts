import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalJsonV1 } from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import {
  SAMPLE_PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
  SampleProofCapsuleReferenceV1Schema,
  createSampleProofCapsuleV1,
  validateSampleProofCapsuleV1,
} from "./sample.js";
import { validateProofCapsuleV2 } from "./index.js";

const repositoryRoot = resolve(import.meta.dirname, "../../..");
const capsulePath = resolve(
  repositoryRoot,
  "fixtures/public/leakage_sample_proof_capsule_v1.counterlab",
);
const referencePath = resolve(
  repositoryRoot,
  "fixtures/public/leakage_sample_proof_capsule_v1.ref.json",
);

async function checkedInCapsule() {
  const [bytes, referenceText] = await Promise.all([
    readFile(capsulePath),
    readFile(referencePath, "utf8"),
  ]);
  const reference = SampleProofCapsuleReferenceV1Schema.parse(
    JSON.parse(referenceText),
  );
  return { bytes: new Uint8Array(bytes), reference };
}

function encodedEnvelope(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${canonicalJsonV1(value)}\n`);
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function payloadEntries(
  validated: Awaited<ReturnType<typeof validateSampleProofCapsuleV1>>,
) {
  return SAMPLE_PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS.map((path) => {
    const entry = validated.envelope.entries.find(
      (candidate) => candidate.path === path,
    );
    if (entry === undefined) {
      throw new Error(`missing checked-in payload ${path}`);
    }
    return { path, content: entry.content };
  });
}

function replaceJsonEntry(
  entries: ReturnType<typeof payloadEntries>,
  path: ReturnType<typeof payloadEntries>[number]["path"],
  value: unknown,
) {
  const content = `${canonicalJsonV1(value)}\n`;
  return {
    entries: entries.map((entry) =>
      entry.path === path ? { ...entry, content } : entry,
    ),
    content,
  };
}

describe("Sample Proof Capsule v1", () => {
  it("validates the checked-in fixed sample and its external reference", async () => {
    const { bytes, reference } = await checkedInCapsule();
    const validated = await validateSampleProofCapsuleV1(bytes, reference);

    expect(validated.reference).toEqual(reference);
    expect(validated.manifest.mode).toEqual({
      kind: "sample_lesson",
      sampleId: "leakage-01",
    });
    expect(validated.manifest.calls).toEqual({
      gpt56: "not-called",
      runtimeCodex: "not-called",
      runner: "not-called",
    });
    expect(validated.manifest.learnerEpisode).toEqual({
      predictionIncluded: false,
      revisionIncluded: false,
      eventChainIncluded: false,
    });
    expect(validated.manifest.liveProofCapsuleV2).toBe(false);
    expect(validated.manifest.rawSourceArtifactIncluded).toBe(false);
    expect(validated.envelope.integrity.mode).toBe("integrity-hashed");
  });

  it("rebuilds deterministically independent of payload input order", async () => {
    const { bytes } = await checkedInCapsule();
    const validated = await validateSampleProofCapsuleV1(bytes);
    const entries = payloadEntries(validated);

    const rebuilt = await createSampleProofCapsuleV1({
      evidenceAsOf: validated.manifest.evidenceAsOf,
      fixtureGeneratedAt: validated.manifest.fixtureGeneratedAt,
      authority: validated.manifest.authority,
      limitations: validated.manifest.limitations,
      nonClaims: validated.manifest.nonClaims,
      entries: [...entries].reverse(),
    });

    expect(rebuilt.bytes).toEqual(bytes);
    expect(rebuilt.reference).toEqual(validated.reference);
  });

  it("fails closed for content, root, unknown-entry, and duplicate-entry tampering", async () => {
    const { bytes } = await checkedInCapsule();
    const envelope = JSON.parse(new TextDecoder().decode(bytes));

    const contentTamper = structuredClone(envelope);
    contentTamper.entries[0].content = "{}";
    await expect(
      validateSampleProofCapsuleV1(encodedEnvelope(contentTamper)),
    ).rejects.toThrow(/entry hash|canonical/i);

    const rootTamper = structuredClone(envelope);
    rootTamper.integrity.rootHash = "0".repeat(64);
    await expect(
      validateSampleProofCapsuleV1(encodedEnvelope(rootTamper)),
    ).rejects.toThrow(/root hash/i);

    const unknownEntry = structuredClone(envelope);
    unknownEntry.entries.push({
      path: "private-reasoning.json",
      mediaType: "application/json",
      contentEncoding: "utf-8",
      content: "{}",
      byteLength: 2,
      sha256: "0".repeat(64),
    });
    unknownEntry.entries.sort(
      (left: { path: string }, right: { path: string }) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    await expect(
      validateSampleProofCapsuleV1(encodedEnvelope(unknownEntry)),
    ).rejects.toThrow(/not allowed/i);

    const duplicateEntry = structuredClone(envelope);
    duplicateEntry.entries.push(structuredClone(duplicateEntry.entries[0]));
    duplicateEntry.entries.sort(
      (left: { path: string }, right: { path: string }) =>
        left.path < right.path ? -1 : left.path > right.path ? 1 : 0,
    );
    await expect(
      validateSampleProofCapsuleV1(encodedEnvelope(duplicateEntry)),
    ).rejects.toThrow(/duplicate/i);
  });

  it("rejects a mismatched external reference and unresolved authority", async () => {
    const { bytes, reference } = await checkedInCapsule();
    await expect(
      validateSampleProofCapsuleV1(bytes, {
        ...reference,
        rootHash: "0".repeat(64),
      }),
    ).rejects.toThrow(/reference does not match/i);

    const validated = await validateSampleProofCapsuleV1(bytes);
    const entries = payloadEntries(validated);
    await expect(
      createSampleProofCapsuleV1({
        evidenceAsOf: validated.manifest.evidenceAsOf,
        fixtureGeneratedAt: validated.manifest.fixtureGeneratedAt,
        authority: {
          ...validated.manifest.authority,
          primaryResultCanonicalHash: "0".repeat(64),
        },
        limitations: validated.manifest.limitations,
        nonClaims: validated.manifest.nonClaims,
        entries,
      }),
    ).rejects.toThrow(/authority bindings do not resolve/i);
  });

  it("rejects a re-bound metric mutation that retains the trusted result hash", async () => {
    const { bytes } = await checkedInCapsule();
    const validated = await validateSampleProofCapsuleV1(bytes);
    const entries = payloadEntries(validated);
    const resultEntry = entries.find(
      (entry) => entry.path === "primary-result.json",
    );
    const fixtureEntry = entries.find(
      (entry) => entry.path === "sample-boundary-fixture.json",
    );
    if (resultEntry === undefined || fixtureEntry === undefined) {
      throw new Error("checked-in sample payload is incomplete");
    }
    const result = JSON.parse(resultEntry.content);
    result.runs[0].metrics.accuracy = 0.1;
    result.chartData[0].accuracy = 0.1;
    const changedResult = `${canonicalJsonV1(result)}\n`;
    const changedResultFileSha256 = sha256Text(changedResult);

    const fixture = JSON.parse(fixtureEntry.content);
    fixture.source.primaryResultFileHash = changedResultFileSha256;
    const { fixtureIntegrityHash: _oldFixtureHash, ...fixtureContent } =
      fixture;
    fixture.fixtureIntegrityHash = sha256Text(canonicalJsonV1(fixtureContent));
    let changedEntries = entries.map((entry) =>
      entry.path === "primary-result.json"
        ? { ...entry, content: changedResult }
        : entry,
    );
    changedEntries = replaceJsonEntry(
      changedEntries,
      "sample-boundary-fixture.json",
      fixture,
    ).entries;

    await expect(
      createSampleProofCapsuleV1({
        evidenceAsOf: validated.manifest.evidenceAsOf,
        fixtureGeneratedAt: validated.manifest.fixtureGeneratedAt,
        authority: {
          ...validated.manifest.authority,
          primaryResultFileSha256: changedResultFileSha256,
          fixtureIntegrityHash: fixture.fixtureIntegrityHash,
        },
        limitations: validated.manifest.limitations,
        nonClaims: validated.manifest.nonClaims,
        entries: changedEntries,
      }),
    ).rejects.toThrow(/fixed leakage sample authority|authority bindings/i);
  });

  it("rejects re-bound Belief Spec, unsupported artifact, and reproduction-kind mutations", async () => {
    const { bytes } = await checkedInCapsule();
    const validated = await validateSampleProofCapsuleV1(bytes);
    const entries = payloadEntries(validated);
    const fixtureEntry = entries.find(
      (entry) => entry.path === "sample-boundary-fixture.json",
    );
    const artifactEntry = entries.find(
      (entry) => entry.path === "artifact-manifest.json",
    );
    const snapshotRefEntry = entries.find(
      (entry) => entry.path === "scientific-engine-snapshot-ref.json",
    );
    const sbomEntry = entries.find(
      (entry) => entry.path === "sbom-manifest.json",
    );
    if (
      fixtureEntry === undefined ||
      artifactEntry === undefined ||
      snapshotRefEntry === undefined ||
      sbomEntry === undefined
    ) {
      throw new Error("checked-in sample payload is incomplete");
    }

    const fixture = JSON.parse(fixtureEntry.content);
    fixture.beliefSpec.claim = "Purple customers sing accurately.";
    const { fixtureIntegrityHash: _oldFixtureHash, ...fixtureContent } =
      fixture;
    fixture.fixtureIntegrityHash = sha256Text(canonicalJsonV1(fixtureContent));
    const changedFixture = replaceJsonEntry(
      entries,
      "sample-boundary-fixture.json",
      fixture,
    );
    await expect(
      createSampleProofCapsuleV1({
        evidenceAsOf: validated.manifest.evidenceAsOf,
        fixtureGeneratedAt: validated.manifest.fixtureGeneratedAt,
        authority: {
          ...validated.manifest.authority,
          fixtureIntegrityHash: fixture.fixtureIntegrityHash,
        },
        limitations: validated.manifest.limitations,
        nonClaims: validated.manifest.nonClaims,
        entries: changedFixture.entries,
      }),
    ).rejects.toThrow(/integrity|authority/i);

    const artifact = JSON.parse(artifactEntry.content);
    artifact.support = {
      status: "UNSUPPORTED",
      reasons: [{ code: "TEST_UNSUPPORTED", message: "Test mutation" }],
    };
    const changedArtifact = replaceJsonEntry(
      entries,
      "artifact-manifest.json",
      artifact,
    );
    await expect(
      createSampleProofCapsuleV1({
        evidenceAsOf: validated.manifest.evidenceAsOf,
        fixtureGeneratedAt: validated.manifest.fixtureGeneratedAt,
        authority: {
          ...validated.manifest.authority,
          artifactManifestFileSha256: sha256Text(changedArtifact.content),
        },
        limitations: validated.manifest.limitations,
        nonClaims: validated.manifest.nonClaims,
        entries: changedArtifact.entries,
      }),
    ).rejects.toThrow(/authority bindings/i);

    const snapshotRef = JSON.parse(snapshotRefEntry.content);
    snapshotRef.environmentKind = "cloudflare_production";
    const sbom = JSON.parse(sbomEntry.content);
    sbom.environmentKind = "cloudflare_production";
    const changedSnapshotRef = replaceJsonEntry(
      entries,
      "scientific-engine-snapshot-ref.json",
      snapshotRef,
    );
    const changedSbom = replaceJsonEntry(
      changedSnapshotRef.entries,
      "sbom-manifest.json",
      sbom,
    );
    await expect(
      createSampleProofCapsuleV1({
        evidenceAsOf: validated.manifest.evidenceAsOf,
        fixtureGeneratedAt: validated.manifest.fixtureGeneratedAt,
        authority: {
          ...validated.manifest.authority,
          sbomManifestSha256: sha256Text(changedSbom.content),
          reproductionCandidate: {
            ...validated.manifest.authority.reproductionCandidate,
            environmentKind: "cloudflare_production",
          },
        },
        limitations: validated.manifest.limitations,
        nonClaims: validated.manifest.nonClaims,
        entries: changedSbom.entries,
      }),
    ).rejects.toThrow(/authority bindings/i);
  });

  it("cannot be parsed as a Live Proof Capsule v2", async () => {
    const { bytes } = await checkedInCapsule();
    expect(() => validateProofCapsuleV2(bytes)).toThrow();
  });
});
