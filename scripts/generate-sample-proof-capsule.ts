import { createHash } from "node:crypto";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  ArtifactManifestSchema,
  VerifiedResultSetSchema,
  canonicalJsonV1,
} from "../packages/contracts/src/index.js";
import {
  FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1,
  verifyFixedLeakageSampleBoundaryFixture,
} from "../packages/proof-capsule/src/sample-boundary-authority.js";
import {
  createSampleProofCapsuleV1,
  type SampleProofCapsuleAuthorityV1,
  type SampleProofCapsulePayloadEntryInput,
} from "../packages/proof-capsule/src/sample.js";
import {
  ScientificEngineSnapshotSchema,
  hashScientificEngineSnapshot,
} from "../packages/scientific-engine-registry/src/index.js";
import { hashCanonical } from "../packages/session-core/src/index.js";
import { parseNotebook } from "../packages/notebook-parser/src/index.js";
import { z } from "zod";

const root = resolve(import.meta.dirname, "..");
const marker = resolve(root, "COUNTERLAB_REPO_ROOT");
const notebookPath = resolve(
  root,
  "fixtures/notebooks/customer_churn_leakage.ipynb",
);
const resultPath = resolve(
  root,
  "fixtures/public/leakage_verified_result.json",
);
const fixturePath = resolve(
  root,
  "fixtures/public/leakage_sample_boundary_v1.json",
);
const snapshotPath = resolve(root, "scientific-engines/snapshot.json");
const snapshotRefPath = resolve(root, "scientific-engines/snapshot-hash.json");
const sbomPath = resolve(root, "docs/sbom/manifest.json");
const capsulePath = resolve(
  root,
  "fixtures/public/leakage_sample_proof_capsule_v1.counterlab",
);
const referencePath = resolve(
  root,
  "fixtures/public/leakage_sample_proof_capsule_v1.ref.json",
);

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const EnvironmentKindSchema = z.enum([
  "local_candidate",
  "cloudflare_production",
]);
const SnapshotReferenceSchema = z
  .object({
    schemaVersion: z.literal("1"),
    environmentId: z.string().trim().min(1),
    environmentKind: EnvironmentKindSchema,
    generatedAt: z.iso.datetime({ offset: true }),
    authorityHash: Sha256Schema,
    snapshotFileSha256: Sha256Schema,
    registryHash: Sha256Schema,
    bindingsHash: Sha256Schema,
  })
  .strict();
const SbomBindingSchema = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: z.iso.datetime({ offset: true }),
    environmentId: z.string().trim().min(1),
    environmentKind: EnvironmentKindSchema,
    sourceCommit: GitCommitSchema,
    imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/u),
    registryHash: Sha256Schema,
    bindingsHash: Sha256Schema,
  })
  .passthrough();

function assertContained(path: string): void {
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing path outside the CounterLab repository: ${path}`);
  }
}

async function readContained(path: string): Promise<Buffer> {
  assertContained(path);
  const physicalRoot = await realpath(root);
  const physicalPath = await realpath(path);
  if (
    physicalPath !== physicalRoot &&
    !physicalPath.startsWith(`${physicalRoot}${sep}`)
  ) {
    throw new Error(`Input resolves outside the repository: ${path}`);
  }
  return readFile(physicalPath);
}

async function assertSafeOutput(path: string): Promise<void> {
  assertContained(path);
  const physicalRoot = await realpath(root);
  const physicalParent = await realpath(dirname(path));
  if (
    physicalParent !== physicalRoot &&
    !physicalParent.startsWith(`${physicalRoot}${sep}`)
  ) {
    throw new Error(`Output parent resolves outside the repository: ${path}`);
  }
  try {
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Refusing to overwrite a symlink: ${path}`);
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON`);
  }
}

async function buildCapsule() {
  const [
    notebookBytes,
    resultBytes,
    fixtureBytes,
    snapshotBytes,
    snapshotRefBytes,
    sbomBytes,
  ] = await Promise.all([
    readContained(notebookPath),
    readContained(resultPath),
    readContained(fixturePath),
    readContained(snapshotPath),
    readContained(snapshotRefPath),
    readContained(sbomPath),
  ]);

  const artifactManifest = ArtifactManifestSchema.parse(
    parseNotebook(
      new Uint8Array(notebookBytes),
      "customer_churn_leakage.ipynb",
      {
        maxBytes: 10_485_760,
        createdAt: "2026-07-14T08:45:00.000Z",
      },
    ),
  );
  const result = VerifiedResultSetSchema.parse(
    parseJson(resultBytes, "primary sample result"),
  );
  const fixture = await verifyFixedLeakageSampleBoundaryFixture(
    parseJson(fixtureBytes, "sample Boundary fixture"),
  );
  const snapshot = ScientificEngineSnapshotSchema.parse(
    parseJson(snapshotBytes, "scientific-engine snapshot"),
  );
  const snapshotRef = SnapshotReferenceSchema.parse(
    parseJson(snapshotRefBytes, "scientific-engine snapshot reference"),
  );
  const sbom = SbomBindingSchema.parse(parseJson(sbomBytes, "SBOM manifest"));

  const snapshotFileSha256 = sha256(snapshotBytes);
  const sbomManifestSha256 = sha256(sbomBytes);
  const snapshotAuthorityHash = await hashScientificEngineSnapshot(snapshot);
  const technicalReportHash = await hashCanonical(fixture.technicalReport);
  const evidenceVerdictHash = await hashCanonical(fixture.evidenceVerdict);
  const artifactManifestText = `${canonicalJsonV1(artifactManifest)}\n`;
  const resultFileSha256 = sha256(resultBytes);
  const fixed = FIXED_LEAKAGE_SAMPLE_AUTHORITY_V1;

  if (
    result.concept !== "entity_leakage" ||
    artifactManifest.support.status !== "SUPPORTED" ||
    artifactManifest.fileSha256 !== fixture.source.artifactManifestHash ||
    artifactManifest.fileSha256 !== fixed.sourceArtifactFileSha256 ||
    result.resultHash !== fixture.source.primaryResultHash ||
    result.resultHash !== fixed.primaryResultCanonicalHash ||
    resultFileSha256 !== fixture.source.primaryResultFileHash ||
    resultFileSha256 !== fixed.primaryResultFileSha256 ||
    snapshotAuthorityHash !== snapshotRef.authorityHash ||
    snapshotFileSha256 !== snapshotRef.snapshotFileSha256 ||
    snapshot.runtimeManifest.sbomManifestHash !== sbomManifestSha256 ||
    snapshot.runtimeManifest.sourceCommit !== sbom.sourceCommit ||
    snapshot.runtimeManifest.container.imageDigest !== sbom.imageDigest ||
    snapshot.runtimeManifest.environmentId !== sbom.environmentId ||
    snapshot.runtimeManifest.environmentKind !== sbom.environmentKind ||
    snapshot.runtimeManifest.generatedAt !== sbom.generatedAt ||
    snapshot.runtimeManifest.registryHash !== sbom.registryHash ||
    snapshot.runtimeManifest.bindingsHash !== sbom.bindingsHash ||
    snapshotRef.environmentId !== sbom.environmentId ||
    snapshotRef.environmentKind !== sbom.environmentKind ||
    snapshotRef.generatedAt !== sbom.generatedAt ||
    snapshotRef.registryHash !== sbom.registryHash ||
    snapshotRef.bindingsHash !== sbom.bindingsHash
  ) {
    throw new Error(
      "Sample Proof Capsule source, fixture, scientific-engine, or SBOM bindings do not resolve",
    );
  }

  const authority: SampleProofCapsuleAuthorityV1 = {
    sourceArtifactFileSha256: artifactManifest.fileSha256,
    artifactManifestFileSha256: sha256(artifactManifestText),
    primaryResultCanonicalHash: result.resultHash,
    primaryResultFileSha256: resultFileSha256,
    experimentIrHash: fixture.boundary.result.experimentIrHash,
    technicalReportHash,
    evidenceVerdictHash,
    boundaryResultHash: fixture.boundary.result.resultHash,
    boundaryVerificationReportHash: fixture.boundary.report.reportHash,
    boundaryReceiptHash: fixture.boundary.receipt.receiptHash,
    fixtureIntegrityHash: fixture.fixtureIntegrityHash,
    scientificEngineSnapshotAuthorityHash: snapshotAuthorityHash,
    scientificEngineSnapshotFileSha256: snapshotFileSha256,
    sbomManifestSha256,
    fixedKernelEvidence: {
      role: "build-time-fixed-kernel-fixture",
      kernelVersion: result.kernelVersion,
      technicalVerification: "VERIFIED",
      releaseRegenerationCheck: "required",
    },
    reproductionCandidate: {
      role: "reproduction-candidate",
      generatedAt: snapshot.runtimeManifest.generatedAt,
      sourceCommit: snapshot.runtimeManifest.sourceCommit,
      imageDigest: snapshot.runtimeManifest.container.imageDigest,
      environmentId: snapshot.runtimeManifest.environmentId,
      environmentKind: snapshot.runtimeManifest.environmentKind,
      executionReceiptIncluded: false,
      embeddedEngineEvidenceFiles: false,
    },
  };
  const entries: SampleProofCapsulePayloadEntryInput[] = [
    {
      path: "artifact-manifest.json",
      content: artifactManifestText,
    },
    {
      path: "primary-result.json",
      content: new TextDecoder().decode(resultBytes),
    },
    {
      path: "sample-boundary-fixture.json",
      content: new TextDecoder().decode(fixtureBytes),
    },
    {
      path: "scientific-engine-snapshot.json",
      content: new TextDecoder().decode(snapshotBytes),
    },
    {
      path: "scientific-engine-snapshot-ref.json",
      content: new TextDecoder().decode(snapshotRefBytes),
    },
    {
      path: "sbom-manifest.json",
      content: new TextDecoder().decode(sbomBytes),
    },
  ];
  return createSampleProofCapsuleV1({
    evidenceAsOf: snapshot.runtimeManifest.generatedAt,
    fixtureGeneratedAt: fixture.generatedAt,
    authority,
    limitations: [
      "This is a checked-in fixed sample, not a newly executed live notebook session.",
      "The scientific runtime snapshot records a local candidate image and does not claim a deployed Worker release.",
      "The reproduction-candidate snapshot is not a receipt that its Container generated this fixed fixture.",
      ...fixture.technicalReport.limitations,
    ],
    nonClaims: [
      "No GPT-5.6, Runtime Codex, hosted runner, or learner event-chain activity is represented.",
      "This Sample Proof Capsule v1 is not Live Proof Capsule v2 and does not certify global mastery.",
      ...fixture.boundary.result.nonClaims,
    ],
    entries,
  });
}

async function main(): Promise<void> {
  await access(marker);
  const mode = process.argv[2];
  if (mode !== "--write" && mode !== "--check") {
    throw new Error("Usage: generate-sample-proof-capsule.ts --write|--check");
  }
  await Promise.all([
    assertSafeOutput(capsulePath),
    assertSafeOutput(referencePath),
  ]);
  const capsule = await buildCapsule();
  const referenceText = `${JSON.stringify(capsule.reference, null, 2)}\n`;

  if (mode === "--write") {
    await Promise.all([
      writeFile(capsulePath, capsule.bytes, { mode: 0o644 }),
      writeFile(referencePath, referenceText, {
        encoding: "utf8",
        mode: 0o644,
      }),
    ]);
    process.stdout.write(
      `WROTE_SAMPLE_PROOF_CAPSULE root=${capsule.reference.rootHash} bytes=${capsule.reference.byteLength}\n`,
    );
    return;
  }

  const [checkedCapsule, checkedReference] = await Promise.all([
    readContained(capsulePath),
    readContained(referencePath),
  ]);
  if (
    !Buffer.from(checkedCapsule).equals(Buffer.from(capsule.bytes)) ||
    new TextDecoder().decode(checkedReference) !== referenceText
  ) {
    throw new Error(
      "Checked-in Sample Proof Capsule is stale; regenerate only after reviewing its bound evidence",
    );
  }
  process.stdout.write(
    `VERIFIED_SAMPLE_PROOF_CAPSULE root=${capsule.reference.rootHash} bytes=${capsule.reference.byteLength}\n`,
  );
}

await main();
