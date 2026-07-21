import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { DeploymentReceiptV7Schema } from "../packages/scientific-engine-registry/src/schema.js";
import { containedInputFile } from "./repository-cli-paths.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const ImageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const WorkerVersionSchema = z
  .string()
  .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);
const RepositoryPathSchema = z
  .string()
  .min(1)
  .max(512)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.includes("\\") &&
      !value.split("/").includes(".."),
    "evidence path must stay inside the repository",
  );

const EvidenceReferenceSchema = z
  .object({
    path: RepositoryPathSchema,
    sha256: Sha256Schema,
  })
  .strict();

const NullableString = z.string().trim().min(1).nullable();
const NullableEvidence = EvidenceReferenceSchema.nullable();

const ReleaseSchema = z
  .object({
    workerEvidenceCommit: GitCommitSchema.nullable(),
    runnerSourceCommit: GitCommitSchema.nullable(),
    containerImageDigest: ImageDigestSchema.nullable(),
    workerVersionId: WorkerVersionSchema.nullable(),
    deploymentReceipt: NullableEvidence,
    productionSmoke: NullableEvidence,
  })
  .strict();

const AssetSchema = z
  .object({
    fileName: z.string().trim().min(1),
    image: EvidenceReferenceSchema,
    provenance: EvidenceReferenceSchema,
  })
  .strict();

export const SubmissionPackageSchema = z
  .object({
    schemaVersion: z.literal("1"),
    submissionState: z.enum(["DRAFT", "READY_TO_SUBMIT", "SUBMITTED"]),
    competition: z
      .object({
        hackathonId: z.literal("30223"),
        projectId: z.literal("1330312"),
        category: z.literal("Education"),
        deadline: z.literal("2026-07-22T00:00:00Z"),
        submitterType: NullableString,
        country: NullableString,
      })
      .strict(),
    copy: z
      .object({
        title: z.literal("CounterLab — A scientific debugger for beliefs"),
        tagline: z.literal("Ask like chat. Prove it like science."),
        audience: z.literal(
          "ML learners and instructors who need to test what a notebook result actually supports",
        ),
        devpostCopy: EvidenceReferenceSchema,
        readme: EvidenceReferenceSchema,
        license: z
          .object({
            identifier: z.literal("MIT"),
            evidence: EvidenceReferenceSchema,
          })
          .strict(),
      })
      .strict(),
    publicProduct: z
      .object({
        judgeUrl: z.literal("https://counterlab.cserules.workers.dev/judge"),
        freeTestPath: z.literal("/judge"),
        capabilityManifest: EvidenceReferenceSchema,
      })
      .strict(),
    release: ReleaseSchema,
    repository: z
      .object({
        url: z.literal("https://github.com/ALikesToCode/CounterLab"),
        accessMode: z.enum(["UNVERIFIED", "PUBLIC", "PRIVATE_SHARED"]),
        accessEvidence: NullableEvidence,
        privateJudgeAddresses: z.array(z.string().email()).max(2),
      })
      .strict(),
    video: z
      .object({
        publicUrl: NullableString,
        durationSeconds: z.number().positive().max(180).nullable(),
        audioPresent: z.boolean(),
        codexRoleCovered: z.boolean(),
        gpt56RoleCovered: z.boolean(),
        script: EvidenceReferenceSchema,
        captions: EvidenceReferenceSchema,
        verificationEvidence: NullableEvidence,
      })
      .strict(),
    feedback: z
      .object({
        sessionId: NullableString,
        evidence: NullableEvidence,
      })
      .strict(),
    browserQualification: z
      .object({
        authority: z.enum(["NONE", "STOCK_DESIGN_REVIEW", "CLOAKBROWSER"]),
        exactReleaseBound: z.boolean(),
        desktopComplete: z.boolean(),
        mobileComplete: z.boolean(),
        requiredSkips: z.number().int().nonnegative(),
        failures: z.number().int().nonnegative(),
        consoleErrors: z.number().int().nonnegative(),
        failedRequests: z.number().int().nonnegative(),
        evidence: NullableEvidence,
      })
      .strict(),
    assets: z.array(AssetSchema).max(5),
    impact: z
      .object({
        status: z.enum(["NO_DATA", "DESCRIPTIVE_ONLY"]),
        aggregate: EvidenceReferenceSchema,
        qualifiedReleaseReceiptSha256: Sha256Schema.nullable(),
      })
      .strict(),
    publicLinkAudit: z
      .object({
        loggedOut: z.boolean(),
        checkedAt: z.iso.datetime({ offset: true }).nullable(),
        evidence: NullableEvidence,
      })
      .strict(),
    officialSubmission: z
      .object({
        state: z.enum(["NOT_SUBMITTED", "SUBMITTED"]),
        publicSlug: NullableString,
        submittedAt: z.iso.datetime({ offset: true }).nullable(),
        receipt: NullableEvidence,
        postSubmitLoggedOutEvidence: NullableEvidence,
      })
      .strict(),
  })
  .strict();

export type SubmissionPackage = z.infer<typeof SubmissionPackageSchema>;
export type SubmissionValidationMode = "draft" | "ready" | "submitted";
export type EvidenceReader = (
  reference: z.infer<typeof EvidenceReferenceSchema>,
) => Promise<Uint8Array>;

const EXPECTED_ASSETS = [
  "01-judge-belief-break-1440x900.png",
  "02-live-prediction-and-authority-1440x900.png",
  "03-theater-boundary-1440x900.png",
  "04-transfer-repair-proof-1440x900.png",
  "thumbnail-judge-belief-break.png",
] as const;

const ProductionSmokeV6Schema = z
  .object({
    schemaVersion: z.literal("6"),
    status: z.literal("PASSED"),
    baseUrl: z.literal("https://counterlab.cserules.workers.dev"),
    deployment: z
      .object({
        workerVersion: WorkerVersionSchema,
        workerEvidenceCommit: GitCommitSchema,
        runnerSourceCommit: GitCommitSchema,
        containerImageDigest: ImageDigestSchema,
        deploymentReceiptSha256: Sha256Schema,
      })
      .passthrough(),
  })
  .passthrough();

class SubmissionValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Submission package failed ${issues.length} gate(s)`);
    this.name = "SubmissionValidationError";
    this.issues = issues;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function parseJson(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error(`${label} is not valid UTF-8 JSON`);
  }
}

function collectEvidenceReferences(
  submission: SubmissionPackage,
): readonly z.infer<typeof EvidenceReferenceSchema>[] {
  const optional = [
    submission.release.deploymentReceipt,
    submission.release.productionSmoke,
    submission.repository.accessEvidence,
    submission.video.verificationEvidence,
    submission.feedback.evidence,
    submission.browserQualification.evidence,
    submission.publicLinkAudit.evidence,
    submission.officialSubmission.receipt,
    submission.officialSubmission.postSubmitLoggedOutEvidence,
  ].filter(
    (reference): reference is z.infer<typeof EvidenceReferenceSchema> =>
      reference !== null,
  );
  return [
    submission.copy.devpostCopy,
    submission.copy.readme,
    submission.copy.license.evidence,
    submission.publicProduct.capabilityManifest,
    submission.video.script,
    submission.video.captions,
    submission.impact.aggregate,
    ...submission.assets.flatMap((asset) => [asset.image, asset.provenance]),
    ...optional,
  ];
}

function assertNoPlaceholderStrings(value: unknown, path = "package"): void {
  if (typeof value === "string" && /^(?:PENDING|TBD|TODO)$/iu.test(value)) {
    throw new Error(`${path} contains a placeholder value`);
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) =>
      assertNoPlaceholderStrings(child, `${path}[${index}]`),
    );
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, child]) =>
      assertNoPlaceholderStrings(child, `${path}.${key}`),
    );
  }
}

function requireReadyFields(
  submission: SubmissionPackage,
  issues: string[],
): void {
  const required: Array<[string, unknown]> = [
    ["competition.submitterType", submission.competition.submitterType],
    ["competition.country", submission.competition.country],
    ["release.workerEvidenceCommit", submission.release.workerEvidenceCommit],
    ["release.runnerSourceCommit", submission.release.runnerSourceCommit],
    ["release.containerImageDigest", submission.release.containerImageDigest],
    ["release.workerVersionId", submission.release.workerVersionId],
    ["release.deploymentReceipt", submission.release.deploymentReceipt],
    ["release.productionSmoke", submission.release.productionSmoke],
    ["repository.accessEvidence", submission.repository.accessEvidence],
    ["video.publicUrl", submission.video.publicUrl],
    ["video.durationSeconds", submission.video.durationSeconds],
    ["video.verificationEvidence", submission.video.verificationEvidence],
    ["feedback.sessionId", submission.feedback.sessionId],
    ["feedback.evidence", submission.feedback.evidence],
    ["browserQualification.evidence", submission.browserQualification.evidence],
    ["publicLinkAudit.checkedAt", submission.publicLinkAudit.checkedAt],
    ["publicLinkAudit.evidence", submission.publicLinkAudit.evidence],
  ];
  for (const [field, value] of required) {
    if (value === null) issues.push(`${field} is required`);
  }
  if (submission.submissionState === "DRAFT") {
    issues.push("submissionState must be READY_TO_SUBMIT or SUBMITTED");
  }
  if (
    submission.repository.accessMode === "PUBLIC" &&
    submission.repository.privateJudgeAddresses.length !== 0
  ) {
    issues.push("public repository must not claim private judge shares");
  }
  if (submission.repository.accessMode === "PRIVATE_SHARED") {
    const requiredJudges = new Set([
      "testing@devpost.com",
      "build-week-event@openai.com",
    ]);
    if (
      submission.repository.privateJudgeAddresses.length !== 2 ||
      submission.repository.privateJudgeAddresses.some(
        (address) => !requiredJudges.has(address),
      )
    ) {
      issues.push(
        "private repository must be shared with both judge addresses",
      );
    }
  } else if (submission.repository.accessMode !== "PUBLIC") {
    issues.push("repository access must be PUBLIC or PRIVATE_SHARED");
  }
  if (
    submission.video.publicUrl === null ||
    !/^https:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)/u.test(
      submission.video.publicUrl,
    )
  ) {
    issues.push("video.publicUrl must be a public YouTube URL");
  }
  if (
    !submission.video.audioPresent ||
    !submission.video.codexRoleCovered ||
    !submission.video.gpt56RoleCovered
  ) {
    issues.push("video must include audio and both Codex and GPT-5.6 roles");
  }
  const browser = submission.browserQualification;
  if (
    browser.authority !== "CLOAKBROWSER" ||
    !browser.exactReleaseBound ||
    !browser.desktopComplete ||
    !browser.mobileComplete ||
    browser.requiredSkips !== 0 ||
    browser.failures !== 0 ||
    browser.consoleErrors !== 0 ||
    browser.failedRequests !== 0
  ) {
    issues.push(
      "browser qualification must be exact, complete CloakBrowser evidence",
    );
  }
  const assetNames = submission.assets.map((asset) => asset.fileName).sort();
  if (
    JSON.stringify(assetNames) !== JSON.stringify([...EXPECTED_ASSETS].sort())
  ) {
    issues.push("assets must contain the exact four screenshots and thumbnail");
  }
  if (!submission.publicLinkAudit.loggedOut) {
    issues.push("public links must be checked logged out");
  }
}

async function assertReleaseEvidence(
  submission: SubmissionPackage,
  readEvidence: EvidenceReader,
  issues: string[],
): Promise<void> {
  const receiptRef = submission.release.deploymentReceipt;
  const smokeRef = submission.release.productionSmoke;
  if (receiptRef === null || smokeRef === null) return;
  try {
    const receipt = DeploymentReceiptV7Schema.parse(
      parseJson(await readEvidence(receiptRef), "deployment receipt"),
    );
    const smoke = ProductionSmokeV6Schema.parse(
      parseJson(await readEvidence(smokeRef), "production smoke"),
    );
    const expectedOrigin = new URL(submission.publicProduct.judgeUrl).origin;
    if (
      receipt.productionOrigin !== expectedOrigin ||
      receipt.workerEvidenceCommit !==
        submission.release.workerEvidenceCommit ||
      receipt.runnerSourceCommit !== submission.release.runnerSourceCommit ||
      receipt.containerImageDigest !==
        submission.release.containerImageDigest ||
      receipt.workerVersionId !== submission.release.workerVersionId
    ) {
      issues.push(
        "deployment receipt does not match the submission release tuple",
      );
    }
    if (
      smoke.baseUrl !== expectedOrigin ||
      smoke.deployment.workerEvidenceCommit !==
        submission.release.workerEvidenceCommit ||
      smoke.deployment.runnerSourceCommit !==
        submission.release.runnerSourceCommit ||
      smoke.deployment.containerImageDigest !==
        submission.release.containerImageDigest ||
      smoke.deployment.workerVersion !== submission.release.workerVersionId ||
      smoke.deployment.deploymentReceiptSha256 !== receiptRef.sha256
    ) {
      issues.push(
        "production smoke does not match the submission release tuple",
      );
    }
  } catch {
    issues.push(
      "release evidence is not a valid schema-v7 receipt and schema-v6 smoke",
    );
  }
}

async function assertImpactEvidence(
  submission: SubmissionPackage,
  readEvidence: EvidenceReader,
  issues: string[],
): Promise<void> {
  try {
    const impact = z
      .object({
        schemaVersion: z.literal("2"),
        status: z.enum(["NO_DATA", "DESCRIPTIVE_ONLY"]),
        qualifiedReleaseReceiptSha256: Sha256Schema.nullable(),
        participantCount: z.number().int().nonnegative(),
        completedSessionCount: z.number().int().nonnegative(),
        metrics: z.unknown().nullable(),
        limitations: z.array(z.string().trim().min(1)).min(1),
      })
      .passthrough()
      .parse(
        parseJson(
          await readEvidence(submission.impact.aggregate),
          "impact aggregate",
        ),
      );
    if (impact.status !== submission.impact.status) {
      issues.push("impact status does not match its aggregate");
    }
    if (
      impact.status === "NO_DATA" &&
      (impact.participantCount !== 0 ||
        impact.completedSessionCount !== 0 ||
        impact.metrics !== null ||
        impact.qualifiedReleaseReceiptSha256 !== null ||
        submission.impact.qualifiedReleaseReceiptSha256 !== null)
    ) {
      issues.push(
        "NO_DATA impact must contain zero participants and no metrics",
      );
    }
  } catch {
    issues.push("impact aggregate is invalid");
  }
}

export async function validateSubmissionPackage(
  input: unknown,
  mode: SubmissionValidationMode,
  readEvidence: EvidenceReader,
): Promise<SubmissionPackage> {
  assertNoPlaceholderStrings(input);
  const submission = SubmissionPackageSchema.parse(input);
  const references = collectEvidenceReferences(submission);
  const seen = new Map<string, string>();
  for (const reference of references) {
    const previous = seen.get(reference.path);
    if (previous !== undefined && previous !== reference.sha256) {
      throw new Error(
        `evidence path has conflicting hashes: ${reference.path}`,
      );
    }
    seen.set(reference.path, reference.sha256);
    const bytes = await readEvidence(reference);
    if (sha256(bytes) !== reference.sha256) {
      throw new Error(`evidence hash mismatch: ${reference.path}`);
    }
  }

  const issues: string[] = [];
  await assertImpactEvidence(submission, readEvidence, issues);
  if (mode !== "draft") {
    requireReadyFields(submission, issues);
    await assertReleaseEvidence(submission, readEvidence, issues);
  }
  if (mode === "submitted") {
    const official = submission.officialSubmission;
    if (
      submission.submissionState !== "SUBMITTED" ||
      official.state !== "SUBMITTED" ||
      official.publicSlug === null ||
      official.submittedAt === null ||
      official.receipt === null ||
      official.postSubmitLoggedOutEvidence === null
    ) {
      issues.push(
        "submitted package requires slug, timestamp, receipt, and logged-out proof",
      );
    } else if (
      Date.parse(official.submittedAt) >
      Date.parse(submission.competition.deadline)
    ) {
      issues.push("official submission timestamp is after the deadline");
    }
  }
  if (issues.length > 0) throw new SubmissionValidationError(issues);
  return submission;
}

async function repositoryEvidenceReader(
  root: string,
  reference: z.infer<typeof EvidenceReferenceSchema>,
): Promise<Uint8Array> {
  const path = await containedInputFile(
    root,
    reference.path,
    "submission evidence",
  );
  return new Uint8Array(await readFile(path));
}

async function main(): Promise<void> {
  const modeValue = process.argv[2] ?? "--draft";
  const mode =
    modeValue === "--draft"
      ? "draft"
      : modeValue === "--ready"
        ? "ready"
        : modeValue === "--submitted"
          ? "submitted"
          : null;
  if (mode === null || process.argv.length > 3) {
    throw new Error(
      "Usage: validate-submission-package.ts --draft|--ready|--submitted",
    );
  }
  const root = resolve(import.meta.dirname, "..");
  const manifestPath = await containedInputFile(
    root,
    "docs/SUBMISSION_PACKAGE.json",
    "submission package",
  );
  const input = parseJson(
    new Uint8Array(await readFile(manifestPath)),
    "submission package",
  );
  await validateSubmissionPackage(input, mode, (reference) =>
    repositoryEvidenceReader(root, reference),
  );
  process.stdout.write(`SUBMISSION_PACKAGE_${mode.toUpperCase()}_VALID\n`);
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  resolve(invokedPath) === resolve(import.meta.filename)
) {
  main().catch((error: unknown) => {
    if (error instanceof SubmissionValidationError) {
      for (const issue of error.issues) process.stderr.write(`- ${issue}\n`);
    } else {
      process.stderr.write(
        `${error instanceof Error ? error.message : "Submission validation failed"}\n`,
      );
    }
    process.exitCode = 1;
  });
}
