import { z } from "zod";

import {
  VerifiedOperationSummaryV1Schema,
  VerifiedResultSetSchema,
  type ArtifactManifest,
  type VerifiedResultSet,
} from "@counterlab/contracts";

import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";
import {
  sampleBoundaryFixture,
  verifySampleBoundaryFixtureIntegrity,
} from "../shared/sample-boundary-authority";

import samplePatchedNotebookText from "../../../fixtures/public/leakage_sample_patch_v1/customer_churn_leakage.patched.ipynb?raw";
import samplePatchEvidenceValue from "../../../fixtures/public/leakage_sample_patch_v1/patch-kernel-result.json";
import sampleResultText from "../../../fixtures/public/leakage_verified_result.json?raw";
import { sampleResult } from "./sample-evidence";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const SamplePatchEvidenceSchema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.literal("VERIFIED"),
    verified: z.literal(true),
    originalSha256: Sha256Schema,
    patchedSha256: Sha256Schema,
    metadataHash: Sha256Schema,
    correctedResult: z.object({ resultHash: Sha256Schema }).passthrough(),
    verification: z
      .object({
        status: z.literal("VERIFIED"),
        violations: z.array(z.unknown()).length(0),
      })
      .passthrough(),
  })
  .passthrough();

async function sha256Text(value: string): Promise<string> {
  if (crypto?.subtle === undefined) {
    throw new Error("Fixed sample hashing is unavailable");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function requireSampleResult(value: unknown): VerifiedResultSet {
  const result = VerifiedResultSetSchema.parse(value);
  if (
    result.schemaVersion !== "1" ||
    result.concept !== "entity_leakage" ||
    !["random_row_split", "customer_group_split", "identity_ablation"].every(
      (runId) => result.runs.some((run) => run.id === runId),
    )
  ) {
    throw new Error("Fixed sample result is outside the approved run contract");
  }
  return result;
}

export type VerifiedSampleLabAuthority = Readonly<{
  verification: Readonly<{
    schemaVersion: "1";
    status: "VERIFIED";
    authority: "checked-in-fixed-sample";
    source: "leakage-sample-boundary-v1";
    artifactFileSha256: string;
    resultHash: string;
    resultFileSha256: string;
    planHash: string;
    technicalReportHash: string;
    evidenceVerdictHash: string;
    boundaryResultHash: string;
    boundaryVerificationReportHash: string;
    boundaryReceiptHash: string;
    fixtureIntegrityHash: string;
  }>;
  evidenceHashes: readonly string[];
  operationSummary: ReturnType<typeof VerifiedOperationSummaryV1Schema.parse>;
}>;

export async function loadVerifiedSampleLabAuthority(input: {
  manifest: Pick<ArtifactManifest, "fileSha256">;
  fixture?: unknown;
  result?: unknown;
  patchEvidence?: unknown;
  resultFileText?: string;
  patchedNotebookText?: string;
}): Promise<VerifiedSampleLabAuthority> {
  const fixture = await verifySampleBoundaryFixtureIntegrity(
    input.fixture ?? sampleBoundaryFixture,
  );
  const result = requireSampleResult(input.result ?? sampleResult);
  const patch = SamplePatchEvidenceSchema.parse(
    input.patchEvidence ?? samplePatchEvidenceValue,
  );
  const [resultFileSha256, patchedNotebookSha256] = await Promise.all([
    sha256Text(input.resultFileText ?? sampleResultText),
    sha256Text(input.patchedNotebookText ?? samplePatchedNotebookText),
  ]);

  if (
    input.manifest.fileSha256 !== fixture.source.artifactManifestHash ||
    result.resultHash !== fixture.source.primaryResultHash ||
    resultFileSha256 !== fixture.source.primaryResultFileHash ||
    patch.originalSha256 !== fixture.source.artifactManifestHash ||
    patch.patchedSha256 !== patchedNotebookSha256
  ) {
    throw new Error("Fixed sample authority tuple does not resolve");
  }

  const verification = {
    schemaVersion: "1" as const,
    status: "VERIFIED" as const,
    authority: "checked-in-fixed-sample" as const,
    source: "leakage-sample-boundary-v1" as const,
    artifactFileSha256: fixture.source.artifactManifestHash,
    resultHash: fixture.source.primaryResultHash,
    resultFileSha256: fixture.source.primaryResultFileHash,
    planHash: fixture.boundary.result.experimentIrHash,
    technicalReportHash: fixture.evidenceVerdict.technicalReportHash,
    evidenceVerdictHash: fixture.boundary.result.evidenceVerdictHash,
    boundaryResultHash: fixture.boundary.result.resultHash,
    boundaryVerificationReportHash: fixture.boundary.report.reportHash,
    boundaryReceiptHash: fixture.boundary.receipt.receiptHash,
    fixtureIntegrityHash: fixture.fixtureIntegrityHash,
  };
  const evidenceHashes = [
    verification.artifactFileSha256,
    verification.resultFileSha256,
    verification.planHash,
    verification.technicalReportHash,
    verification.evidenceVerdictHash,
    verification.boundaryResultHash,
    verification.boundaryVerificationReportHash,
    verification.boundaryReceiptHash,
    verification.fixtureIntegrityHash,
  ];
  const selection = fixture.experimentIr.selection;
  if (selection.status === "UNSELECTED") {
    throw new Error("Fixed sample experiment is not selected");
  }
  const selectedCandidate = fixture.experimentIr.candidateExperiments.find(
    (candidate) => candidate.id === selection.candidateId,
  );
  if (selectedCandidate === undefined) {
    throw new Error("Fixed sample selection does not resolve to an experiment");
  }
  const operationSummary = VerifiedOperationSummaryV1Schema.parse({
    schemaVersion: "1",
    authority: "fixed-approved-sample",
    authorityHash: verification.planHash,
    selectionRef: selectedCandidate.id,
    operationIds: selectedCandidate.operationIds,
  });
  return { verification, evidenceHashes, operationSummary };
}

export function assertSampleProofClaimScope(input: {
  beliefTest?: { learnerClaim: string };
}): void {
  if (input.beliefTest?.learnerClaim !== SAMPLE_LEAKAGE_QUESTION) {
    throw new Error(
      "The stored sample claim is outside the fixed sample evidence scope",
    );
  }
}
