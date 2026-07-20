import {
  BeliefSpecV2Schema,
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  EvidenceVerdictSchema,
  canonicalJsonV1,
} from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  hashExperimentIR,
} from "@counterlab/experiment-ir";
import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);

const TechnicalReportSchema = z
  .object({
    status: z.literal("VERIFIED"),
    resultHash: Sha256Schema,
    verifiedInvariants: z.array(z.string().trim().min(1)).min(1),
    failures: z.array(z.unknown()).length(0),
    limitations: z.array(z.string().trim().min(1)),
  })
  .strict();

const BoundaryResponseSchema = z
  .object({
    result: BoundaryMapResultV1Schema,
    report: BoundaryMapVerificationReportV1Schema,
    receipt: BoundaryMapReceiptV1Schema,
    authority: BoundaryMapAuthorityRefV1Schema,
  })
  .strict()
  .superRefine((boundary, context) => {
    if (
      boundary.report.status !== "VERIFIED" ||
      boundary.result.resultHash !== boundary.report.resultHash ||
      boundary.result.resultHash !== boundary.receipt.resultHash ||
      boundary.result.resultHash !== boundary.authority.resultHash ||
      boundary.result.sweepId !== boundary.authority.sweepId ||
      boundary.report.reportHash !== boundary.receipt.verificationReportHash ||
      boundary.report.reportHash !==
        boundary.authority.verificationReportHash ||
      canonicalJsonV1(boundary.receipt) !==
        canonicalJsonV1(boundary.authority.receipt) ||
      boundary.result.cells.length !== boundary.authority.cellCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Sample Boundary response authority does not resolve",
        path: ["authority"],
      });
    }
  });

export const SampleBoundaryFixtureSchema = z
  .object({
    schemaVersion: z.literal("1"),
    fixtureId: z.literal("leakage-sample-boundary-v1"),
    label: z.literal("Verified sample exploration"),
    generatedAt: z.iso.datetime({ offset: true }),
    source: z
      .object({
        sampleId: z.literal("leakage-01"),
        artifactManifestHash: Sha256Schema,
        primaryResultHash: Sha256Schema,
        primaryResultFileHash: Sha256Schema,
        subjectPackVersion: z.string().trim().min(1),
        boundaryKernelVersion: z.string().trim().min(1),
      })
      .strict(),
    beliefSpec: BeliefSpecV2Schema,
    experimentIr: ExperimentIRV5Schema,
    technicalReport: TechnicalReportSchema,
    evidenceVerdict: EvidenceVerdictSchema,
    boundary: BoundaryResponseSchema,
    fixtureIntegrityHash: Sha256Schema,
  })
  .strict()
  .superRefine((fixture, context) => {
    const { source, boundary, experimentIr, technicalReport, evidenceVerdict } =
      fixture;
    const result = boundary.result;
    const valid =
      evidenceVerdict.kind === "SUPPORTS" &&
      source.artifactManifestHash === result.artifactManifestHash &&
      source.artifactManifestHash === experimentIr.artifactManifestHash &&
      source.primaryResultHash === result.authoritativeResultHash &&
      source.primaryResultHash === technicalReport.resultHash &&
      source.primaryResultHash === evidenceVerdict.resultHash &&
      source.subjectPackVersion === result.conceptPackVersion &&
      source.subjectPackVersion === experimentIr.conceptPackVersion &&
      source.boundaryKernelVersion === result.kernelVersion &&
      evidenceVerdict.irHash === result.experimentIrHash &&
      experimentIr.boundarySweep?.sweepId === result.sweepId &&
      experimentIr.boundarySweep?.gridPresetId === result.gridPresetId;
    if (!valid) {
      context.addIssue({
        code: "custom",
        message: "Sample Boundary fixture lineage does not resolve",
        path: ["source"],
      });
    }
  });

export type SampleBoundaryFixture = z.infer<typeof SampleBoundaryFixtureSchema>;

export const FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1 = {
  sampleId: "leakage-01",
  fixtureId: "leakage-sample-boundary-v1",
  fixtureLabel: "Verified sample exploration",
  sourceArtifactFileSha256:
    "d0e9f3238753f1ca55534446d83e36041590f31c607a011def3f1d0db3a5bbc9",
  primaryResultCanonicalHash:
    "a6ae7652e04e4d70196f991c63b8f7bcb3b76f8c4ab833d3ce2b626df0ab6c94",
  primaryResultFileSha256:
    "e2c1cad1e6d774d45671760602e236643bd41ce328df18ff61f1c60344f76170",
  fixtureIntegrityHash:
    "5b33c4adad52d797fa8268c53fe8a0dec560161c76a162ffe83e87d91271ffd2",
  experimentIrHash:
    "0f62ac4ba5cc971713f235d15fe757c164ce99c24043d431fa6842054bb4cb74",
  boundaryResultHash:
    "c948d25fef6ab5f5f33322dde2025557f0704f01bff2bde48ee93149066ccbd3",
  subjectPackVersion: "2.1.0",
  kernelVersion: "0.1.0",
} as const;

async function canonicalSha256(value: unknown): Promise<string> {
  if (typeof crypto === "undefined" || crypto.subtle === undefined) {
    throw new Error("Sample Boundary integrity verification is unavailable");
  }
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonicalJsonV1(value)),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifySampleBoundaryFixtureIntegrity(
  fixture: unknown,
): Promise<SampleBoundaryFixture> {
  const checked = SampleBoundaryFixtureSchema.parse(fixture);
  const { result, report, receipt } = checked.boundary;
  const { resultHash: _resultHash, ...resultContent } = result;
  const { reportHash: _reportHash, ...reportContent } = report;
  const { receiptHash: _receiptHash, integrity, ...receiptContent } = receipt;
  const { fixtureIntegrityHash: _fixtureIntegrityHash, ...fixtureContent } =
    checked;

  const [
    resultHash,
    reportHash,
    receiptContentHash,
    receiptHash,
    technicalReportHash,
    evidenceVerdictHash,
    beliefSpecHash,
    fixtureIntegrityHash,
    experimentIrHash,
  ] = await Promise.all([
    canonicalSha256(resultContent),
    canonicalSha256(reportContent),
    canonicalSha256(receiptContent),
    canonicalSha256({ ...receiptContent, integrity }),
    canonicalSha256(checked.technicalReport),
    canonicalSha256(checked.evidenceVerdict),
    canonicalSha256(checked.beliefSpec),
    canonicalSha256(fixtureContent),
    hashExperimentIR(checked.experimentIr),
  ]);

  const hashesResolve =
    resultHash === result.resultHash &&
    reportHash === report.reportHash &&
    receiptContentHash === receipt.integrity.contentHash &&
    receiptHash === receipt.receiptHash &&
    technicalReportHash === checked.evidenceVerdict.technicalReportHash &&
    evidenceVerdictHash === result.evidenceVerdictHash &&
    beliefSpecHash === checked.experimentIr.beliefSpecHash &&
    fixtureIntegrityHash === checked.fixtureIntegrityHash &&
    experimentIrHash === result.experimentIrHash;

  if (!hashesResolve) {
    throw new Error("Sample Boundary fixture integrity does not resolve");
  }
  return checked;
}

export async function verifyFixedLeakageSampleBoundaryFixture(
  fixture: unknown,
): Promise<SampleBoundaryFixture> {
  const checked = await verifySampleBoundaryFixtureIntegrity(fixture);
  const fixed = FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1;
  if (
    checked.fixtureId !== fixed.fixtureId ||
    checked.label !== fixed.fixtureLabel ||
    checked.source.sampleId !== fixed.sampleId ||
    checked.source.artifactManifestHash !== fixed.sourceArtifactFileSha256 ||
    checked.source.primaryResultHash !== fixed.primaryResultCanonicalHash ||
    checked.source.primaryResultFileHash !== fixed.primaryResultFileSha256 ||
    checked.source.subjectPackVersion !== fixed.subjectPackVersion ||
    checked.source.boundaryKernelVersion !== fixed.kernelVersion ||
    checked.fixtureIntegrityHash !== fixed.fixtureIntegrityHash ||
    checked.boundary.result.experimentIrHash !== fixed.experimentIrHash ||
    checked.boundary.result.resultHash !== fixed.boundaryResultHash
  ) {
    throw new Error("Fixed leakage sample authority does not resolve");
  }
  return checked;
}
