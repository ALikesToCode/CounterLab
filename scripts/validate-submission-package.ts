import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { PilotAnalysisSchema } from "../evals/learner-pilot/src/pilot.js";
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
      value
        .split("/")
        .every(
          (component) =>
            component.length > 0 && component !== "." && component !== "..",
        ),
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
export type SubmissionValidationOptions = Readonly<{
  now?: Date;
}>;
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

const SmokeDeploymentSchema = z
  .object({
    workerVersion: WorkerVersionSchema,
    workerEvidenceCommit: GitCommitSchema,
    runnerSourceCommit: GitCommitSchema,
    containerImageDigest: ImageDigestSchema,
    deploymentReceiptSha256: Sha256Schema,
    timeoutCleanupReceiptSha256: Sha256Schema,
    runtimePolicySha256: Sha256Schema,
    proofDependencyManifestSha256: Sha256Schema,
    aggregateLimitEvidenceSha256: Sha256Schema,
    workerArtifactClassification: z.literal("PROCESS_BOUND_PARTIAL"),
    workerArtifactManifestSha256: Sha256Schema,
    workerBundleSha256: Sha256Schema,
    clientAssetsSha256: Sha256Schema,
    clientAssetCount: z.number().int().positive(),
    clientPublicAssetsSha256: Sha256Schema,
    clientPublicAssetCount: z.number().int().positive(),
    viteVersion: z.literal("8.1.4"),
    wranglerVersion: z.literal("4.110.0"),
    generationIsolationEvidenceSha256: Sha256Schema,
    generationIsolationProbeSha256: Sha256Schema,
    generationIsolationVerifiedAt: z.iso.datetime({ offset: true }),
    releaseCheckGenerationIsolationEvidenceSha256: Sha256Schema,
    releaseCheckGenerationIsolationProbeSha256: Sha256Schema,
    releaseCheckGenerationIsolationVerifiedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((deployment, context) => {
    if (deployment.clientPublicAssetCount > deployment.clientAssetCount) {
      context.addIssue({
        code: "custom",
        path: ["clientPublicAssetCount"],
        message: "public client asset count exceeds the full deploy tree",
      });
    }
    if (
      deployment.releaseCheckGenerationIsolationProbeSha256 !==
      deployment.generationIsolationProbeSha256
    ) {
      context.addIssue({
        code: "custom",
        path: ["releaseCheckGenerationIsolationProbeSha256"],
        message: "release-check isolation probe must match qualification",
      });
    }
  });

const SmokeStageSchema = z
  .object({
    id: z.string().regex(/^[A-Za-z0-9_.:-]{1,256}$/u),
    mode: z.enum(["control_plane", "sample", "replay", "live_notebook"]),
    concept: z.enum(["entity_leakage", "class_imbalance"]).optional(),
    status: z.literal("PASSED"),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }),
    evidence: z.record(z.string(), z.unknown()),
  })
  .strict();

const REQUIRED_SMOKE_STAGES = new Map<
  string,
  readonly [
    "control_plane" | "sample" | "replay" | "live_notebook",
    "entity_leakage" | "class_imbalance" | undefined,
  ]
>([
  ["public-readiness", ["control_plane", undefined]],
  ["capability-health", ["control_plane", undefined]],
  ["public-secret-scan", ["control_plane", undefined]],
  ["judge-mode", ["control_plane", undefined]],
  ["sample-lesson", ["sample", undefined]],
  ["verified-replay", ["replay", undefined]],
  ["hosted-capsule-replay", ["replay", "entity_leakage"]],
  ["live-leakage", ["live_notebook", "entity_leakage"]],
  ["live-imbalance", ["live_notebook", "class_imbalance"]],
]);

const ProductionSmokeV6Schema = z
  .object({
    schemaVersion: z.literal("6"),
    status: z.literal("PASSED"),
    baseUrl: z.literal("https://counterlab.cserules.workers.dev"),
    startedAt: z.iso.datetime({ offset: true }),
    completedAt: z.iso.datetime({ offset: true }),
    deployment: SmokeDeploymentSchema,
    stages: z.array(SmokeStageSchema).length(REQUIRED_SMOKE_STAGES.size),
    privacy: z
      .object({
        containsSecrets: z.literal(false),
        containsRawNotebookBytes: z.literal(false),
        containsPrivateReasoning: z.literal(false),
      })
      .strict(),
  })
  .strict()
  .superRefine((report, context) => {
    const startedAt = Date.parse(report.startedAt);
    const completedAt = Date.parse(report.completedAt);
    if (completedAt < startedAt) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "smoke report completes before it starts",
      });
    }
    const qualificationAt = Date.parse(
      report.deployment.generationIsolationVerifiedAt,
    );
    const releaseCheckAt = Date.parse(
      report.deployment.releaseCheckGenerationIsolationVerifiedAt,
    );
    if (qualificationAt > startedAt || releaseCheckAt > startedAt) {
      context.addIssue({
        code: "custom",
        path: ["deployment"],
        message: "isolation verification must precede production smoke",
      });
    }
    if (
      releaseCheckAt < qualificationAt ||
      startedAt - releaseCheckAt > 86_400_000
    ) {
      context.addIssue({
        code: "custom",
        path: ["deployment", "releaseCheckGenerationIsolationVerifiedAt"],
        message: "release-check isolation evidence is stale or out of order",
      });
    }

    const observed = new Set<string>();
    let previousStartedAt = Number.NEGATIVE_INFINITY;
    let previousCompletedAt = Number.NEGATIVE_INFINITY;
    for (const [index, stage] of report.stages.entries()) {
      const expected = REQUIRED_SMOKE_STAGES.get(stage.id);
      if (
        expected === undefined ||
        expected[0] !== stage.mode ||
        expected[1] !== stage.concept ||
        observed.has(stage.id)
      ) {
        context.addIssue({
          code: "custom",
          path: ["stages", index],
          message:
            "smoke report does not contain the exact required stage matrix",
        });
      }
      observed.add(stage.id);
      const stageStartedAt = Date.parse(stage.startedAt);
      const stageCompletedAt = Date.parse(stage.completedAt);
      if (
        stageStartedAt < startedAt ||
        stageCompletedAt < stageStartedAt ||
        stageStartedAt < previousStartedAt ||
        stageCompletedAt < previousCompletedAt ||
        stageCompletedAt > completedAt
      ) {
        context.addIssue({
          code: "custom",
          path: ["stages", index],
          message: "smoke stages must be complete and chronological",
        });
      }
      previousStartedAt = stageStartedAt;
      previousCompletedAt = stageCompletedAt;
    }
    if (observed.size !== REQUIRED_SMOKE_STAGES.size) {
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "smoke report is missing a required stage",
      });
    }
  });

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

const FORBIDDEN_EVIDENCE_KEYS = new Set([
  "authorization",
  "apikey",
  "credential",
  "credentials",
  "notebookbytes",
  "privatereasoning",
  "rawnotebook",
  "secret",
  "token",
  "password",
  "cookie",
  "setcookie",
  "codexauthjson",
  "openaiapikey",
]);

function assertPrivacySafeEvidence(value: unknown, label: string): void {
  const inspect = (current: unknown): void => {
    if (Array.isArray(current)) {
      current.forEach(inspect);
      return;
    }
    if (current !== null && typeof current === "object") {
      const record = current as Record<string, unknown>;
      if (record.nbformat === 4 && Array.isArray(record.cells)) {
        throw new Error(`${label} contains raw notebook content`);
      }
      for (const [key, child] of Object.entries(record)) {
        const normalized = key.toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
        if (FORBIDDEN_EVIDENCE_KEYS.has(normalized)) {
          throw new Error(`${label} contains forbidden private field ${key}`);
        }
        inspect(child);
      }
      return;
    }
    if (typeof current === "string" && /^[\s]*[\[{]/u.test(current)) {
      try {
        inspect(JSON.parse(current));
      } catch (error) {
        if (error instanceof SyntaxError) return;
        throw error;
      }
    }
  };
  inspect(value);
  const serialized = JSON.stringify(value);
  if (
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(serialized) ||
    /\bsk-[A-Za-z0-9_-]{24,}\b/u.test(serialized) ||
    /CODEX_AUTH_JSON\s*[:=]/u.test(serialized) ||
    /COUNTERLAB_RUNNER_SIGNING_(?:PRIVATE_)?KEY\s*[:=]/u.test(serialized)
  ) {
    throw new Error(`${label} contains secret or private content`);
  }
}

type EvidenceCache = ReadonlyMap<string, Uint8Array>;

function cachedEvidence(
  evidence: EvidenceCache,
  reference: z.infer<typeof EvidenceReferenceSchema>,
  label: string,
): Uint8Array {
  const value = evidence.get(reference.path);
  if (value === undefined) {
    throw new Error(`${label} was not loaded from verified evidence`);
  }
  return value;
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
  if (
    typeof value === "string" &&
    /^(?:PENDING|TBD|TODO)$/iu.test(value.trim())
  ) {
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
  evidence: EvidenceCache,
  issues: string[],
  now: Date,
): Promise<string | null> {
  const receiptRef = submission.release.deploymentReceipt;
  const smokeRef = submission.release.productionSmoke;
  if (receiptRef === null || smokeRef === null) return null;
  try {
    const receiptValue = parseJson(
      cachedEvidence(evidence, receiptRef, "deployment receipt"),
      "deployment receipt",
    );
    const smokeValue = parseJson(
      cachedEvidence(evidence, smokeRef, "production smoke"),
      "production smoke",
    );
    assertPrivacySafeEvidence(receiptValue, "deployment receipt");
    assertPrivacySafeEvidence(smokeValue, "production smoke");
    const receipt = DeploymentReceiptV7Schema.parse(receiptValue);
    const smoke = ProductionSmokeV6Schema.parse(smokeValue);
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
    const smokeBindings: ReadonlyArray<readonly [string, unknown, unknown]> = [
      [
        "timeout cleanup receipt",
        smoke.deployment.timeoutCleanupReceiptSha256,
        receipt.timeoutCleanupReceiptSha256,
      ],
      [
        "aggregate-limit evidence",
        smoke.deployment.aggregateLimitEvidenceSha256,
        receipt.aggregateLimitEvidenceSha256,
      ],
      [
        "runtime policy",
        smoke.deployment.runtimePolicySha256,
        receipt.runtimePolicySha256,
      ],
      [
        "proof dependency manifest",
        smoke.deployment.proofDependencyManifestSha256,
        receipt.proofDependencyManifestSha256,
      ],
      [
        "Worker artifact classification",
        smoke.deployment.workerArtifactClassification,
        receipt.workerArtifactClassification,
      ],
      [
        "Worker artifact manifest",
        smoke.deployment.workerArtifactManifestSha256,
        receipt.workerArtifactManifestSha256,
      ],
      [
        "Worker bundle",
        smoke.deployment.workerBundleSha256,
        receipt.workerBundleSha256,
      ],
      [
        "client assets",
        smoke.deployment.clientAssetsSha256,
        receipt.clientAssetsSha256,
      ],
      [
        "client asset count",
        smoke.deployment.clientAssetCount,
        receipt.clientAssetCount,
      ],
      [
        "public client assets",
        smoke.deployment.clientPublicAssetsSha256,
        receipt.clientPublicAssetsSha256,
      ],
      [
        "public client asset count",
        smoke.deployment.clientPublicAssetCount,
        receipt.clientPublicAssetCount,
      ],
      ["Vite version", smoke.deployment.viteVersion, receipt.viteVersion],
      [
        "Wrangler version",
        smoke.deployment.wranglerVersion,
        receipt.wranglerVersion,
      ],
      [
        "qualified isolation evidence",
        smoke.deployment.generationIsolationEvidenceSha256,
        receipt.generationIsolationEvidenceSha256,
      ],
      [
        "qualified isolation probe",
        smoke.deployment.generationIsolationProbeSha256,
        receipt.generationIsolationProbeSha256,
      ],
      [
        "qualified isolation time",
        smoke.deployment.generationIsolationVerifiedAt,
        receipt.generationIsolationVerifiedAt,
      ],
      [
        "release-check isolation evidence",
        smoke.deployment.releaseCheckGenerationIsolationEvidenceSha256,
        receipt.releaseCheckGenerationIsolationEvidenceSha256,
      ],
      [
        "release-check isolation probe",
        smoke.deployment.releaseCheckGenerationIsolationProbeSha256,
        receipt.releaseCheckGenerationIsolationProbeSha256,
      ],
      [
        "release-check isolation time",
        smoke.deployment.releaseCheckGenerationIsolationVerifiedAt,
        receipt.releaseCheckGenerationIsolationVerifiedAt,
      ],
    ];
    for (const [label, observed, expected] of smokeBindings) {
      if (observed !== expected) {
        issues.push(`production smoke ${label} does not match deployment`);
      }
    }
    if (Date.parse(receipt.deployedAt) > Date.parse(smoke.startedAt)) {
      issues.push("production smoke started before the recorded deployment");
    }
    const smokeCompletedAt = Date.parse(smoke.completedAt);
    if (
      Date.parse(receipt.deployedAt) > now.getTime() ||
      smokeCompletedAt > now.getTime()
    ) {
      issues.push("release evidence is dated in the future");
    }
    if (smokeCompletedAt > Date.parse(submission.competition.deadline)) {
      issues.push("production smoke completed after the competition deadline");
    }
    if (
      submission.officialSubmission.submittedAt !== null &&
      smokeCompletedAt > Date.parse(submission.officialSubmission.submittedAt)
    ) {
      issues.push("production smoke completed after the official submission");
    }
    return receipt.qualifiedRunnerReceiptSha256;
  } catch {
    issues.push(
      "release evidence is not a valid schema-v7 receipt and schema-v6 smoke",
    );
    return null;
  }
}

async function assertImpactEvidence(
  submission: SubmissionPackage,
  evidence: EvidenceCache,
  issues: string[],
  now: Date,
  qualifiedReleaseReceiptSha256: string | null,
): Promise<void> {
  try {
    const impact = PilotAnalysisSchema.parse(
      parseJson(
        cachedEvidence(
          evidence,
          submission.impact.aggregate,
          "impact aggregate",
        ),
        "impact aggregate",
      ),
    );
    if (impact.status !== submission.impact.status) {
      issues.push("impact status does not match its aggregate");
    }
    if (impact.status === "NO_DATA") {
      if (submission.impact.qualifiedReleaseReceiptSha256 !== null) {
        issues.push("NO_DATA impact must not bind a qualified release");
      }
      if (
        !impact.limitations.includes(
          "No consented learner-pilot session records were supplied; no learner outcome is claimed.",
        )
      ) {
        issues.push("NO_DATA impact must retain the canonical limitation");
      }
    } else {
      if (
        qualifiedReleaseReceiptSha256 === null ||
        impact.qualifiedReleaseReceiptSha256 !==
          qualifiedReleaseReceiptSha256 ||
        submission.impact.qualifiedReleaseReceiptSha256 !==
          qualifiedReleaseReceiptSha256
      ) {
        issues.push("impact aggregate does not match its qualified release");
      }
    }
    const analyzedAt = Date.parse(impact.analyzedAt);
    if (
      analyzedAt > now.getTime() ||
      analyzedAt > Date.parse(submission.competition.deadline) ||
      (submission.officialSubmission.submittedAt !== null &&
        analyzedAt > Date.parse(submission.officialSubmission.submittedAt))
    ) {
      issues.push(
        "impact aggregate was analyzed after its allowed evidence window",
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
  options: SubmissionValidationOptions = {},
): Promise<SubmissionPackage> {
  assertNoPlaceholderStrings(input);
  const submission = SubmissionPackageSchema.parse(input);
  const references = collectEvidenceReferences(submission);
  const seen = new Map<string, string>();
  const evidence = new Map<string, Uint8Array>();
  for (const reference of references) {
    const previous = seen.get(reference.path);
    if (previous !== undefined && previous !== reference.sha256) {
      throw new Error(
        `evidence path has conflicting hashes: ${reference.path}`,
      );
    }
    if (previous !== undefined) continue;
    seen.set(reference.path, reference.sha256);
    const value = new Uint8Array(await readEvidence(reference));
    if (sha256(value) !== reference.sha256) {
      throw new Error(`evidence hash mismatch: ${reference.path}`);
    }
    evidence.set(reference.path, value);
  }

  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime()))
    throw new Error("validation time is invalid");
  const issues: string[] = [];
  const expectedState = {
    draft: "DRAFT",
    ready: "READY_TO_SUBMIT",
    submitted: "SUBMITTED",
  } as const;
  if (submission.submissionState !== expectedState[mode]) {
    issues.push(
      `${mode} validation requires submissionState ${expectedState[mode]}`,
    );
  }
  if (mode !== "submitted") {
    const official = submission.officialSubmission;
    if (
      official.state !== "NOT_SUBMITTED" ||
      official.publicSlug !== null ||
      official.submittedAt !== null ||
      official.receipt !== null ||
      official.postSubmitLoggedOutEvidence !== null
    ) {
      issues.push(
        "draft and ready packages must not claim submission evidence",
      );
    }
  }
  let qualifiedReleaseReceiptSha256: string | null = null;
  if (mode !== "draft") {
    requireReadyFields(submission, issues);
    qualifiedReleaseReceiptSha256 = await assertReleaseEvidence(
      submission,
      evidence,
      issues,
      now,
    );
  }
  await assertImpactEvidence(
    submission,
    evidence,
    issues,
    now,
    qualifiedReleaseReceiptSha256,
  );
  if (
    mode === "ready" &&
    now.getTime() >= Date.parse(submission.competition.deadline)
  ) {
    issues.push("ready package cannot be verified at or after the deadline");
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
    } else if (Date.parse(official.submittedAt) > now.getTime()) {
      issues.push("official submission timestamp is in the future");
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
