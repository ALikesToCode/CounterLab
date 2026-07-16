import { describe, expect, it } from "vitest";

import {
  PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
  createProofCapsuleV2,
  inspectProofCapsuleV2,
  validateProofCapsuleV2,
} from "./index.js";

const HASHES = Object.fromEntries(
  Array.from({ length: 32 }, (_, index) => [
    index,
    index.toString(16).padStart(2, "0").repeat(32),
  ]),
) as Record<number, string>;

function hash(index: number): string {
  return HASHES[index]!;
}

function authority() {
  return {
    lineage: {
      schemaVersion: "5",
      status: "VERIFIED",
      source: "hosted-experiment-ir-v5",
      jobId: "job-compile-1",
      inputBundleHash: hash(0),
      artifactManifestHash: hash(1),
      beliefSpecHash: hash(2),
      predictionHash: hash(3),
      compilerOutputFileHashes: {
        "discrimination-contract.json": hash(4),
        "experiment-ir.json": hash(5),
        "lab-scene.json": hash(6),
        "public-rationale.md": hash(7),
      },
      discriminationContractHash: hash(8),
      rawExperimentIrCanonicalHash: hash(9),
      labSceneHash: hash(10),
      candidateVerificationReportHash: hash(11),
      scientificVerifierVersion: "scientific-candidate-verifier-v1",
      selectionHash: hash(12),
      selectedExperimentIrHash: hash(13),
      projectedPlanHash: hash(14),
      scorerVersion: "experiment-scorer-v1",
      projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1",
    },
    result: {
      schemaVersion: "5",
      jobId: "job-run-1",
      inputBundleHash: hash(15),
      resultHash: hash(16),
      resultFileHash: hash(17),
      technicalReportHash: hash(18),
      epistemicReportHash: hash(19),
      evidenceVerdictHash: hash(20),
    },
    boundary: {
      jobId: "job-boundary-1",
      sweepId: "leakage.boundary.v1",
      resultHash: hash(21),
      verificationReportHash: hash(22),
      receipt: {
        schemaVersion: "1",
        canonicalProfile: "counterlab-canonical-json-v1",
        sessionId: "session-live-1",
        resultHash: hash(21),
        verificationReportHash: hash(22),
        experimentIrHash: hash(13),
        authoritativeResultHash: hash(16),
        evidenceVerdictHash: hash(20),
        issuedAt: "2026-07-16T12:00:00.000Z",
        integrity: {
          mode: "integrity-hashed",
          algorithm: "sha256",
          contentHash: hash(23),
        },
        receiptHash: hash(24),
      },
      cellCount: 9,
    },
    patch: {
      schemaVersion: "5",
      jobId: "job-patch-1",
      inputBundleHash: hash(25),
      patchPlanHash: hash(26),
      patchPlanFileHash: hash(27),
      rationaleFileHash: hash(28),
      patchPlanVerificationHash: hash(29),
      patchResultHash: hash(30),
      patchResultFileHash: hash(31),
      patchedArtifactHash: hash(0),
    },
    reasoningDiffHash: hash(1),
    scientificEngineSnapshotHash: hash(2),
    eventChainHead: hash(3),
  } as const;
}

function payloadEntries() {
  return PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS.map((path) =>
    path.endsWith(".jsonl")
      ? {
          path,
          kind: "jsonl" as const,
          value: [{ path, sequence: 1 }],
        }
      : {
          path,
          kind: "json" as const,
          value: { path, schemaVersion: "test" },
        },
  );
}

function input() {
  return {
    capsuleId: "capsule-live-1",
    sessionId: "session-live-1",
    concept: "entity_leakage" as const,
    createdAt: "2026-07-16T12:01:00.000Z",
    authority: authority(),
    limitations: ["This capsule verifies one bounded experiment, not mastery."],
    reproductionCommands: [
      "counterlab capsule validate capsule-live-1.counterlab",
    ],
    entries: payloadEntries(),
  };
}

describe("Proof Capsule v2 deterministic archive", () => {
  it("produces stable canonical bytes and a content-addressed reference", () => {
    const first = createProofCapsuleV2(input());
    const shuffled = createProofCapsuleV2({
      ...input(),
      entries: [...payloadEntries()].reverse(),
    });

    expect(first.bytes).toEqual(shuffled.bytes);
    expect(first.reference).toEqual(shuffled.reference);
    expect(first.reference.objectKey).toBe(
      `proof-capsules/session-live-1/${first.reference.bytesHash}.counterlab`,
    );
    expect(first.reference.integrity).toEqual({
      mode: "integrity-hashed",
      algorithm: "sha256",
    });
    expect(validateProofCapsuleV2(first.bytes).reference).toEqual(
      first.reference,
    );

    const inspected = inspectProofCapsuleV2(first.bytes);
    expect(inspected.manifest.limitations).toEqual(input().limitations);
    expect(inspected.entries.map((entry) => entry.path)).toEqual(
      [...inspected.entries.map((entry) => entry.path)].sort(),
    );
    expect(inspected.entries.map((entry) => entry.path)).toContain(
      "README.txt",
    );
  });

  it("signs the root with a named key and fails closed for a wrong key", () => {
    const created = createProofCapsuleV2({
      ...input(),
      signing: {
        keyId: "counterlab-proof-v2",
        signingKey: "test-only-signing-key",
      },
    });

    expect(created.reference.integrity).toMatchObject({
      mode: "hmac-signed",
      keyId: "counterlab-proof-v2",
    });
    expect(
      validateProofCapsuleV2(created.bytes, {
        signingKeys: {
          "counterlab-proof-v2": "test-only-signing-key",
        },
        expectedIntegrityMode: "hmac-signed",
      }).reference,
    ).toEqual(created.reference);
    expect(() =>
      validateProofCapsuleV2(created.bytes, {
        signingKeys: { "counterlab-proof-v2": "wrong-key" },
      }),
    ).toThrow(/signature/i);
    expect(() => validateProofCapsuleV2(created.bytes)).toThrow(/signing key/i);
  });

  it("rejects missing, duplicate, and unknown payload paths", () => {
    expect(() =>
      createProofCapsuleV2({
        ...input(),
        entries: payloadEntries().slice(1),
      }),
    ).toThrow(/missing required/i);

    expect(() =>
      createProofCapsuleV2({
        ...input(),
        entries: [...payloadEntries(), payloadEntries()[0]!],
      }),
    ).toThrow(/duplicate/i);

    expect(() =>
      createProofCapsuleV2({
        ...input(),
        entries: [
          ...payloadEntries(),
          {
            path: "../secret.json",
            kind: "json" as const,
            value: { secret: true },
          },
        ],
      }),
    ).toThrow(/not allowed/i);
  });

  it("rejects byte, entry, root, and integrity-mode tampering", () => {
    const created = createProofCapsuleV2(input());
    const envelope = JSON.parse(new TextDecoder().decode(created.bytes));

    const contentTamper = structuredClone(envelope);
    contentTamper.entries[0].content = "{}";
    expect(() =>
      validateProofCapsuleV2(
        new TextEncoder().encode(`${JSON.stringify(contentTamper)}\n`),
      ),
    ).toThrow();

    const rootTamper = structuredClone(envelope);
    rootTamper.integrity.rootHash = hash(31);
    expect(() =>
      validateProofCapsuleV2(
        new TextEncoder().encode(`${JSON.stringify(rootTamper)}\n`),
      ),
    ).toThrow(/root hash/i);

    expect(() =>
      validateProofCapsuleV2(created.bytes, {
        expectedIntegrityMode: "hmac-signed",
      }),
    ).toThrow(/integrity mode/i);

    const extraNewline = new Uint8Array(created.bytes.length + 1);
    extraNewline.set(created.bytes);
    extraNewline[extraNewline.length - 1] = 10;
    expect(() => validateProofCapsuleV2(extraNewline)).toThrow(/canonical/i);
  });
});
