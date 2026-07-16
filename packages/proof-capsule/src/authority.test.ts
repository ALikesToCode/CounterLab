import { describe, expect, it } from "vitest";

import {
  PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS,
  createProofCapsuleV2,
  validateProofCapsulePayloadAuthorityV2,
} from "./index.js";

const hash = (digit: string) => digit.repeat(64);

function structurallyValidCapsule() {
  const authority = {
    lineage: {
      schemaVersion: "5",
      status: "VERIFIED",
      source: "hosted-experiment-ir-v5",
      jobId: "compile-1",
      inputBundleHash: hash("0"),
      artifactManifestHash: hash("1"),
      beliefSpecHash: hash("2"),
      predictionHash: hash("3"),
      compilerOutputFileHashes: {
        "discrimination-contract.json": hash("4"),
        "experiment-ir.json": hash("5"),
        "lab-scene.json": hash("6"),
        "public-rationale.md": hash("7"),
      },
      discriminationContractHash: hash("8"),
      rawExperimentIrCanonicalHash: hash("9"),
      labSceneHash: hash("a"),
      candidateVerificationReportHash: hash("b"),
      scientificVerifierVersion: "scientific-candidate-verifier-v1",
      selectionHash: hash("c"),
      selectedExperimentIrHash: hash("d"),
      projectedPlanHash: hash("e"),
      scorerVersion: "scorer-v1",
      projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1",
    },
    result: {
      schemaVersion: "5",
      jobId: "run-1",
      inputBundleHash: hash("f"),
      resultHash: hash("0"),
      resultFileHash: hash("1"),
      technicalReportHash: hash("2"),
      epistemicReportHash: hash("3"),
      evidenceVerdictHash: hash("4"),
    },
    boundary: {
      jobId: "boundary-1",
      sweepId: "boundary.v1",
      resultHash: hash("5"),
      verificationReportHash: hash("6"),
      receipt: {
        schemaVersion: "1",
        canonicalProfile: "counterlab-canonical-json-v1",
        sessionId: "session-1",
        resultHash: hash("5"),
        verificationReportHash: hash("6"),
        experimentIrHash: hash("d"),
        authoritativeResultHash: hash("0"),
        evidenceVerdictHash: hash("4"),
        issuedAt: "2026-07-16T12:00:00.000Z",
        integrity: {
          mode: "integrity-hashed",
          algorithm: "sha256",
          contentHash: hash("7"),
        },
        receiptHash: hash("8"),
      },
      cellCount: 4,
    },
    patch: {
      schemaVersion: "5",
      jobId: "patch-1",
      inputBundleHash: hash("9"),
      patchPlanHash: hash("a"),
      patchPlanFileHash: hash("b"),
      rationaleFileHash: hash("c"),
      patchPlanVerificationHash: hash("d"),
      patchResultHash: hash("e"),
      patchResultFileHash: hash("f"),
      patchedArtifactHash: hash("0"),
    },
    reasoningDiffHash: hash("1"),
    scientificEngineSnapshotHash: hash("2"),
    eventChainHead: hash("3"),
  } as const;
  return createProofCapsuleV2({
    capsuleId: "capsule-1",
    sessionId: "session-1",
    concept: "entity_leakage",
    createdAt: "2026-07-16T12:01:00.000Z",
    authority,
    limitations: ["This is a bounded test."],
    reproductionCommands: ["counterlab capsule validate capsule-1.counterlab"],
    entries: PROOF_CAPSULE_REQUIRED_PAYLOAD_PATHS.map((path) =>
      path.endsWith(".jsonl")
        ? { path, kind: "jsonl" as const, value: [{ sequence: 1 }] }
        : {
            path,
            kind: "json" as const,
            value: { schemaVersion: "invalid", path },
          },
    ),
  });
}

describe("Proof Capsule v2 semantic authority", () => {
  it("does not treat a structurally valid archive as verified evidence", async () => {
    await expect(
      validateProofCapsulePayloadAuthorityV2(structurallyValidCapsule()),
    ).rejects.toThrow(/Artifact Manifest/i);
  });
});
