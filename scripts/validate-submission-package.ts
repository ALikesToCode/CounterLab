import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import { PilotAnalysisSchema } from "../evals/learner-pilot/src/pilot.js";
import { DeploymentReceiptV7Schema } from "../packages/scientific-engine-registry/src/schema.js";
import { parseQualifiedRunnerReleaseV6 } from "./generation-isolation-evidence.js";
import { parseReleaseCheckReceiptV5 } from "./release-check-receipt.js";
import { containedInputFile } from "./repository-cli-paths.js";
import {
  CloakBrowserEvidenceIndexSchema,
  CloakBrowserExecutionReportSchema,
  CloakBrowserQualificationReceiptSchema,
  CloakJourneyEvidenceReceiptSchema,
  CloakManualEvidenceReceiptSchema,
  DevpostSubmissionReceiptSchema,
  FeedbackSessionReceiptSchema,
  PostSubmitLinkAuditReceiptSchema,
  PublicationReleaseBindingSchema,
  PublicLinkAuditReceiptSchema,
  REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS,
  RepositoryAccessReceiptSchema,
  ScreenshotProvenanceReceiptSchema,
  VideoVerificationReceiptSchema,
  readPngDimensions,
} from "./submission-publication-evidence.js";

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
    qualifiedRunnerReceipt: NullableEvidence,
    releaseCheckReceipt: NullableEvidence,
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

const BrowserJourneyEvidenceReferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(512),
    evidence: EvidenceReferenceSchema,
  })
  .strict();

const BrowserManualEvidenceSchema = z
  .object({
    keyboard: NullableEvidence,
    screenReaderNames: NullableEvidence,
    reducedMotion: NullableEvidence,
    noHorizontalOverflow: NullableEvidence,
    zoom200: NullableEvidence,
    longContent: NullableEvidence,
    narrowVisualizations: NullableEvidence,
    touchTargets: NullableEvidence,
    consoleAndNetwork: NullableEvidence,
    webVitals: NullableEvidence,
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
        playwrightReport: NullableEvidence,
        evidenceIndex: NullableEvidence,
        journeyEvidence: z.array(BrowserJourneyEvidenceReferenceSchema).max(40),
        manualEvidence: BrowserManualEvidenceSchema,
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
const MAX_TEXT_EVIDENCE_BYTES = 4 * 1_024 * 1_024;
const MAX_SCREENSHOT_BYTES = 25 * 1_024 * 1_024;

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
    if (
      typeof current === "string" &&
      /"nbformat"\s*:\s*4.+"cells"\s*:/su.test(current)
    ) {
      throw new Error(`${label} contains raw notebook content`);
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
    /COUNTERLAB_RUNNER_SIGNING_(?:PRIVATE_)?KEY\s*[:=]/u.test(serialized) ||
    /"nbformat"\s*:\s*4.+"cells"\s*:/su.test(serialized)
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
    submission.release.qualifiedRunnerReceipt,
    submission.release.releaseCheckReceipt,
    submission.release.deploymentReceipt,
    submission.release.productionSmoke,
    submission.repository.accessEvidence,
    submission.video.verificationEvidence,
    submission.feedback.evidence,
    submission.browserQualification.evidence,
    submission.browserQualification.playwrightReport,
    submission.browserQualification.evidenceIndex,
    submission.publicLinkAudit.evidence,
    submission.officialSubmission.receipt,
    submission.officialSubmission.postSubmitLoggedOutEvidence,
  ].filter(
    (reference): reference is z.infer<typeof EvidenceReferenceSchema> =>
      reference !== null,
  );
  const manualBrowserEvidence = REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS.map(
    (key) => submission.browserQualification.manualEvidence[key],
  ).filter(
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
    ...submission.browserQualification.journeyEvidence.map(
      (journey) => journey.evidence,
    ),
    ...manualBrowserEvidence,
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

function youtubeVideoId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
      return null;
    const hostname = url.hostname.toLowerCase();
    const candidate =
      hostname === "youtu.be"
        ? url.pathname.slice(1)
        : hostname === "youtube.com" || hostname === "www.youtube.com"
          ? url.pathname === "/watch"
            ? url.searchParams.get("v")
            : null
          : null;
    return candidate !== null && /^[A-Za-z0-9_-]{11}$/u.test(candidate)
      ? candidate
      : null;
  } catch {
    return null;
  }
}

function normalizeDirectPublicUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "")
      return null;
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/$/u, "");
    return url.toString();
  } catch {
    return null;
  }
}

function finalDestinationMatches(
  role: "judge" | "repository" | "video" | "devpost",
  requestedUrl: string,
  finalUrl: string,
): boolean {
  if (role === "video") {
    const requestedId = youtubeVideoId(requestedUrl);
    return requestedId !== null && youtubeVideoId(finalUrl) === requestedId;
  }
  const requested = normalizeDirectPublicUrl(requestedUrl);
  return requested !== null && normalizeDirectPublicUrl(finalUrl) === requested;
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
    [
      "release.qualifiedRunnerReceipt",
      submission.release.qualifiedRunnerReceipt,
    ],
    ["release.releaseCheckReceipt", submission.release.releaseCheckReceipt],
    ["release.deploymentReceipt", submission.release.deploymentReceipt],
    ["release.productionSmoke", submission.release.productionSmoke],
    ["repository.accessEvidence", submission.repository.accessEvidence],
    ["video.publicUrl", submission.video.publicUrl],
    ["video.durationSeconds", submission.video.durationSeconds],
    ["video.verificationEvidence", submission.video.verificationEvidence],
    ["feedback.sessionId", submission.feedback.sessionId],
    ["feedback.evidence", submission.feedback.evidence],
    ["browserQualification.evidence", submission.browserQualification.evidence],
    [
      "browserQualification.playwrightReport",
      submission.browserQualification.playwrightReport,
    ],
    [
      "browserQualification.evidenceIndex",
      submission.browserQualification.evidenceIndex,
    ],
    ["publicLinkAudit.checkedAt", submission.publicLinkAudit.checkedAt],
    ["publicLinkAudit.evidence", submission.publicLinkAudit.evidence],
  ];
  for (const [field, value] of required) {
    if (value === null) issues.push(`${field} is required`);
  }
  if (submission.browserQualification.journeyEvidence.length !== 40) {
    issues.push("browserQualification.journeyEvidence requires 40 entries");
  }
  for (const key of REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS) {
    if (submission.browserQualification.manualEvidence[key] === null) {
      issues.push(`browserQualification.manualEvidence.${key} is required`);
    }
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
    youtubeVideoId(submission.video.publicUrl) === null
  ) {
    issues.push("video.publicUrl must identify one public YouTube video");
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
  const qualifiedRef = submission.release.qualifiedRunnerReceipt;
  const releaseCheckRef = submission.release.releaseCheckReceipt;
  const receiptRef = submission.release.deploymentReceipt;
  const smokeRef = submission.release.productionSmoke;
  if (
    qualifiedRef === null ||
    releaseCheckRef === null ||
    receiptRef === null ||
    smokeRef === null
  ) {
    return null;
  }
  try {
    const qualifiedValue = parseJson(
      cachedEvidence(evidence, qualifiedRef, "qualified runner receipt"),
      "qualified runner receipt",
    );
    const releaseCheckValue = parseJson(
      cachedEvidence(evidence, releaseCheckRef, "release-check receipt"),
      "release-check receipt",
    );
    const receiptValue = parseJson(
      cachedEvidence(evidence, receiptRef, "deployment receipt"),
      "deployment receipt",
    );
    const smokeValue = parseJson(
      cachedEvidence(evidence, smokeRef, "production smoke"),
      "production smoke",
    );
    assertPrivacySafeEvidence(qualifiedValue, "qualified runner receipt");
    assertPrivacySafeEvidence(releaseCheckValue, "release-check receipt");
    assertPrivacySafeEvidence(receiptValue, "deployment receipt");
    assertPrivacySafeEvidence(smokeValue, "production smoke");
    const qualified = parseQualifiedRunnerReleaseV6(qualifiedValue);
    const releaseCheck = parseReleaseCheckReceiptV5(releaseCheckValue);
    const receipt = DeploymentReceiptV7Schema.parse(receiptValue);
    const smoke = ProductionSmokeV6Schema.parse(smokeValue);
    const expectedOrigin = new URL(submission.publicProduct.judgeUrl).origin;
    const expectedContainerImage = `${qualified.registryImage.replace(
      /:git-[a-f0-9]{40}$/u,
      "",
    )}@${qualified.registryDigest}`;
    const releaseBindings: ReadonlyArray<readonly [string, unknown, unknown]> =
      [
        [
          "qualified evidence commit",
          qualified.evidenceCommit,
          submission.release.workerEvidenceCommit,
        ],
        [
          "qualified source commit",
          qualified.sourceCommit,
          submission.release.runnerSourceCommit,
        ],
        [
          "qualified registry digest",
          qualified.registryDigest,
          submission.release.containerImageDigest,
        ],
        [
          "release-check evidence commit",
          releaseCheck.evidenceCommit,
          qualified.evidenceCommit,
        ],
        [
          "release-check source commit",
          releaseCheck.sourceCommit,
          qualified.sourceCommit,
        ],
        [
          "qualified receipt hash in release check",
          releaseCheck.qualifiedRunnerReceiptSha256,
          qualifiedRef.sha256,
        ],
        [
          "qualified receipt hash in deployment",
          receipt.qualifiedRunnerReceiptSha256,
          qualifiedRef.sha256,
        ],
        [
          "release-check receipt hash in deployment",
          receipt.releaseCheckReceiptSha256,
          releaseCheckRef.sha256,
        ],
        ["qualification time", releaseCheck.qualifiedAt, qualified.qualifiedAt],
        [
          "release-check time",
          receipt.releaseCheckCheckedAt,
          releaseCheck.checkedAt,
        ],
        [
          "qualified local runner tag",
          releaseCheck.runnerImageTag,
          qualified.localImageTag,
        ],
        [
          "qualified local runner digest",
          releaseCheck.runnerImageDigest,
          qualified.localImageDigest,
        ],
        [
          "qualified adapter tag",
          releaseCheck.adapterImageTag,
          qualified.adapterImageTag,
        ],
        [
          "qualified adapter digest",
          releaseCheck.adapterImageDigest,
          qualified.adapterImageDigest,
        ],
        [
          "release-check registry digest",
          releaseCheck.registryDigest,
          qualified.registryDigest,
        ],
        [
          "deployed registry digest",
          receipt.containerImageDigest,
          qualified.registryDigest,
        ],
        [
          "deployed image reference",
          receipt.containerImage,
          expectedContainerImage,
        ],
        [
          "runtime toolchain",
          releaseCheck.runtimeToolchainSha256,
          qualified.runtimeToolchainSha256,
        ],
        [
          "deployed runtime toolchain",
          receipt.runtimeToolchainSha256,
          qualified.runtimeToolchainSha256,
        ],
        [
          "runtime policy",
          releaseCheck.runtimePolicySha256,
          qualified.runtimePolicySha256,
        ],
        [
          "deployed runtime policy",
          receipt.runtimePolicySha256,
          qualified.runtimePolicySha256,
        ],
        [
          "proof dependency manifest",
          releaseCheck.proofDependencyManifestSha256,
          qualified.proofDependencyManifestSha256,
        ],
        [
          "deployed proof dependency manifest",
          receipt.proofDependencyManifestSha256,
          qualified.proofDependencyManifestSha256,
        ],
        [
          "aggregate-limit evidence",
          releaseCheck.aggregateLimitEvidenceSha256,
          qualified.aggregateLimitEvidenceSha256,
        ],
        [
          "deployed aggregate-limit evidence",
          receipt.aggregateLimitEvidenceSha256,
          qualified.aggregateLimitEvidenceSha256,
        ],
        [
          "deployed timeout-cleanup receipt",
          receipt.timeoutCleanupReceiptSha256,
          qualified.timeoutCleanupReceiptSha256,
        ],
        [
          "runtime adapter",
          releaseCheck.runtimeAdapterSha256,
          qualified.runtimeAdapterSha256,
        ],
        [
          "deployed runtime adapter",
          receipt.runtimeAdapterSha256,
          qualified.runtimeAdapterSha256,
        ],
        [
          "deployed adapter digest",
          receipt.adapterImageDigest,
          qualified.adapterImageDigest,
        ],
        [
          "qualified isolation evidence",
          releaseCheck.generationIsolationEvidenceSha256,
          qualified.generationIsolationEvidenceSha256,
        ],
        [
          "qualified isolation probe",
          releaseCheck.generationIsolationProbeSha256,
          qualified.generationIsolationProbeSha256,
        ],
        [
          "qualified isolation time",
          releaseCheck.generationIsolationVerifiedAt,
          qualified.generationIsolationVerifiedAt,
        ],
        [
          "deployed qualified isolation evidence",
          receipt.generationIsolationEvidenceSha256,
          qualified.generationIsolationEvidenceSha256,
        ],
        [
          "deployed qualified isolation probe",
          receipt.generationIsolationProbeSha256,
          qualified.generationIsolationProbeSha256,
        ],
        [
          "deployed qualified isolation time",
          receipt.generationIsolationVerifiedAt,
          qualified.generationIsolationVerifiedAt,
        ],
        [
          "deployed release-check isolation evidence",
          receipt.releaseCheckGenerationIsolationEvidenceSha256,
          releaseCheck.releaseCheckGenerationIsolationEvidenceSha256,
        ],
        [
          "release-check isolation source tree",
          releaseCheck.releaseCheckGenerationIsolationEvidence.sourceTreeSha256,
          qualified.sourceTreeSha256,
        ],
        [
          "deployed release-check isolation probe",
          receipt.releaseCheckGenerationIsolationProbeSha256,
          releaseCheck.releaseCheckGenerationIsolationProbeSha256,
        ],
        [
          "deployed release-check isolation time",
          receipt.releaseCheckGenerationIsolationVerifiedAt,
          releaseCheck.releaseCheckGenerationIsolationVerifiedAt,
        ],
      ];
    for (const [label, observed, expected] of releaseBindings) {
      if (observed !== expected) {
        issues.push(`release chain ${label} does not match`);
      }
    }
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
    if (
      Date.parse(receipt.deployedAt) - Date.parse(qualified.qualifiedAt) >
      86_400_000
    ) {
      issues.push("qualified runner evidence is stale at deployment");
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
    return qualifiedRef.sha256;
  } catch {
    issues.push(
      "release evidence is not a valid qualified, checked, deployed, and smoke chain",
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

type EvidenceReference = z.infer<typeof EvidenceReferenceSchema>;
type PublicationReleaseBinding = z.infer<
  typeof PublicationReleaseBindingSchema
>;

function expectedPublicationRelease(
  submission: SubmissionPackage,
): PublicationReleaseBinding | null {
  const release = submission.release;
  if (
    release.deploymentReceipt === null ||
    release.workerEvidenceCommit === null ||
    release.runnerSourceCommit === null ||
    release.containerImageDigest === null ||
    release.workerVersionId === null
  ) {
    return null;
  }
  return PublicationReleaseBindingSchema.parse({
    deploymentReceiptSha256: release.deploymentReceipt.sha256,
    productionOrigin: new URL(submission.publicProduct.judgeUrl).origin,
    workerEvidenceCommit: release.workerEvidenceCommit,
    runnerSourceCommit: release.runnerSourceCommit,
    containerImageDigest: release.containerImageDigest,
    workerVersionId: release.workerVersionId,
  });
}

function parseEvidenceReceipt<T>(
  schema: z.ZodType<T>,
  reference: EvidenceReference | null,
  label: string,
  evidence: EvidenceCache,
  issues: string[],
): T | null {
  if (reference === null) return null;
  try {
    const value = parseJson(cachedEvidence(evidence, reference, label), label);
    assertPrivacySafeEvidence(value, label);
    return schema.parse(value);
  } catch {
    issues.push(`${label} evidence is invalid`);
    return null;
  }
}

function assertPublicationRelease(
  observed: PublicationReleaseBinding,
  expected: PublicationReleaseBinding | null,
  label: string,
  issues: string[],
): void {
  if (expected === null) {
    issues.push(`${label} cannot bind an incomplete release`);
    return;
  }
  for (const field of Object.keys(expected) as Array<
    keyof PublicationReleaseBinding
  >) {
    if (observed[field] !== expected[field]) {
      issues.push(`${label} release binding ${field} does not match`);
    }
  }
}

function publicationAvailableAt(
  submission: SubmissionPackage,
  evidence: EvidenceCache,
): number | null {
  const smokeReference = submission.release.productionSmoke;
  if (smokeReference === null) return null;
  try {
    const smoke = ProductionSmokeV6Schema.parse(
      parseJson(
        cachedEvidence(evidence, smokeReference, "production smoke"),
        "production smoke",
      ),
    );
    return Date.parse(smoke.completedAt);
  } catch {
    return null;
  }
}

function assertPreSubmissionTimestamp(
  checkedAt: string,
  submission: SubmissionPackage,
  now: Date,
  notBefore: number | null,
  label: string,
  issues: string[],
): void {
  const checked = Date.parse(checkedAt);
  if (notBefore !== null && checked < notBefore) {
    issues.push(`${label} predates production release completion`);
  }
  if (
    checked > now.getTime() ||
    checked > Date.parse(submission.competition.deadline) ||
    (submission.officialSubmission.submittedAt !== null &&
      checked > Date.parse(submission.officialSubmission.submittedAt))
  ) {
    issues.push(`${label} was checked after its allowed evidence window`);
  }
}

function assertEvidencePathPolicy(
  submission: SubmissionPackage,
  references: readonly EvidenceReference[],
  issues: string[],
): void {
  if (
    new Set(references.map((reference) => reference.path)).size !==
    references.length
  ) {
    issues.push("each evidence role must use a distinct repository path");
  }
  const fixedPaths: ReadonlyArray<readonly [EvidenceReference, string]> = [
    [submission.copy.devpostCopy, "docs/DEVPOST_COPY.md"],
    [submission.copy.readme, "README.md"],
    [submission.copy.license.evidence, "LICENSE"],
    [
      submission.publicProduct.capabilityManifest,
      "docs/RELEASE_CAPABILITY_MANIFEST.json",
    ],
    [submission.video.script, "docs/DEMO_SCRIPT.md"],
    [submission.video.captions, "docs/DEMO_CAPTIONS.vtt"],
    [submission.impact.aggregate, "docs/LEARNER_PILOT_RESULTS.json"],
  ];
  for (const [reference, expected] of fixedPaths) {
    if (reference.path !== expected) {
      issues.push(`evidence path must be ${expected}`);
    }
  }

  const deployment = submission.release.deploymentReceipt;
  if (deployment === null) {
    const unexpectedReleaseEvidence = [
      submission.release.qualifiedRunnerReceipt,
      submission.release.releaseCheckReceipt,
      submission.release.productionSmoke,
      submission.repository.accessEvidence,
      submission.video.verificationEvidence,
      submission.feedback.evidence,
      submission.browserQualification.evidence,
      submission.browserQualification.playwrightReport,
      submission.browserQualification.evidenceIndex,
      submission.publicLinkAudit.evidence,
      submission.officialSubmission.receipt,
      submission.officialSubmission.postSubmitLoggedOutEvidence,
      ...REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS.map(
        (key) => submission.browserQualification.manualEvidence[key],
      ),
    ].some((reference) => reference !== null);
    if (
      unexpectedReleaseEvidence ||
      submission.assets.length > 0 ||
      submission.browserQualification.journeyEvidence.length > 0
    ) {
      issues.push(
        "release-bound evidence requires a deployment receipt before any read",
      );
    }
    return;
  }
  const evidenceRoot = `docs/submission-evidence/${deployment.sha256}`;
  const expectedEvidencePaths: ReadonlyArray<
    readonly [EvidenceReference | null, string]
  > = [
    [
      submission.release.qualifiedRunnerReceipt,
      `${evidenceRoot}/qualified-runner-release.json`,
    ],
    [
      submission.release.releaseCheckReceipt,
      `${evidenceRoot}/release-check-receipt.json`,
    ],
    [deployment, `${evidenceRoot}/deployment-receipt.json`],
    [
      submission.release.productionSmoke,
      `${evidenceRoot}/production-smoke.json`,
    ],
    [
      submission.repository.accessEvidence,
      `${evidenceRoot}/repository-access.json`,
    ],
    [
      submission.video.verificationEvidence,
      `${evidenceRoot}/video-verification.json`,
    ],
    [submission.feedback.evidence, `${evidenceRoot}/feedback-session.json`],
    [
      submission.browserQualification.evidence,
      `${evidenceRoot}/cloakbrowser-qualification.json`,
    ],
    [
      submission.browserQualification.playwrightReport,
      `${evidenceRoot}/cloakbrowser-playwright-report.json`,
    ],
    [
      submission.browserQualification.evidenceIndex,
      `${evidenceRoot}/cloakbrowser-evidence-index.json`,
    ],
    [
      submission.publicLinkAudit.evidence,
      `${evidenceRoot}/public-link-audit.json`,
    ],
    [
      submission.officialSubmission.receipt,
      `${evidenceRoot}/devpost-submission.json`,
    ],
    [
      submission.officialSubmission.postSubmitLoggedOutEvidence,
      `${evidenceRoot}/post-submit-link-audit.json`,
    ],
  ];
  for (const [reference, expected] of expectedEvidencePaths) {
    if (reference !== null && reference.path !== expected) {
      issues.push(`evidence path must be ${expected}`);
    }
  }
  for (const [
    index,
    journey,
  ] of submission.browserQualification.journeyEvidence.entries()) {
    const sequence = String(index + 1).padStart(2, "0");
    const expected = `${evidenceRoot}/cloakbrowser-journeys/${sequence}.json`;
    if (journey.evidence.path !== expected) {
      issues.push(`evidence path must be ${expected}`);
    }
  }
  for (const key of REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS) {
    const reference = submission.browserQualification.manualEvidence[key];
    const expected = `${evidenceRoot}/cloakbrowser-manual/${key}.json`;
    if (reference !== null && reference.path !== expected) {
      issues.push(`evidence path must be ${expected}`);
    }
  }
  const assetRoot = `docs/submission-assets/${deployment.sha256}`;
  const imageHashes = submission.assets.map((asset) => asset.image.sha256);
  if (new Set(imageHashes).size !== imageHashes.length) {
    issues.push("each screenshot must have distinct image bytes");
  }
  for (const asset of submission.assets) {
    const imagePath = `${assetRoot}/${asset.fileName}`;
    if (asset.image.path !== imagePath) {
      issues.push(`screenshot image path must be ${imagePath}`);
    }
    if (asset.provenance.path !== `${imagePath}.json`) {
      issues.push(`screenshot provenance path must be ${imagePath}.json`);
    }
  }
}

function assertLinkSet(
  links: ReadonlyArray<{
    role: "judge" | "repository" | "video" | "devpost";
    url: string;
    finalUrl: string;
  }>,
  expected: ReadonlyMap<string, string>,
  label: string,
  issues: string[],
): void {
  const observed = new Map<string, (typeof links)[number]>(
    links.map((link) => [link.role, link]),
  );
  if (observed.size !== expected.size) {
    issues.push(`${label} does not contain each required link exactly once`);
    return;
  }
  for (const [role, url] of expected) {
    const link = observed.get(role);
    if (link?.url !== url) {
      issues.push(`${label} ${role} URL does not match`);
    } else if (!finalDestinationMatches(link.role, link.url, link.finalUrl)) {
      issues.push(`${label} ${role} final destination does not match`);
    }
  }
}

function assertPublicationEvidence(
  submission: SubmissionPackage,
  evidence: EvidenceCache,
  issues: string[],
  now: Date,
): void {
  const expectedRelease = expectedPublicationRelease(submission);
  const notBefore = publicationAvailableAt(submission, evidence);
  const repository = parseEvidenceReceipt(
    RepositoryAccessReceiptSchema,
    submission.repository.accessEvidence,
    "repository access",
    evidence,
    issues,
  );
  if (repository !== null) {
    assertPublicationRelease(
      repository.release,
      expectedRelease,
      "repository access",
      issues,
    );
    assertPreSubmissionTimestamp(
      repository.checkedAt,
      submission,
      now,
      notBefore,
      "repository access",
      issues,
    );
    const addresses = [...repository.sharedJudgeAddresses].sort();
    const expectedAddresses = [
      ...submission.repository.privateJudgeAddresses,
    ].sort();
    if (
      repository.repositoryUrl !== submission.repository.url ||
      repository.finalUrl !== submission.repository.url ||
      repository.accessMode !== submission.repository.accessMode ||
      JSON.stringify(addresses) !== JSON.stringify(expectedAddresses) ||
      !repository.judgeAccessVerified ||
      (repository.accessMode === "PUBLIC" &&
        (!repository.anonymousAccessible ||
          repository.loggedOutStatusCode !== 200)) ||
      (repository.accessMode === "PRIVATE_SHARED" &&
        (repository.anonymousAccessible ||
          repository.loggedOutStatusCode === 200))
    ) {
      issues.push("repository access receipt does not match the package");
    }
  }

  const video = parseEvidenceReceipt(
    VideoVerificationReceiptSchema,
    submission.video.verificationEvidence,
    "video verification",
    evidence,
    issues,
  );
  if (video !== null) {
    assertPublicationRelease(
      video.release,
      expectedRelease,
      "video verification",
      issues,
    );
    assertPreSubmissionTimestamp(
      video.checkedAt,
      submission,
      now,
      notBefore,
      "video verification",
      issues,
    );
    if (
      video.publicUrl !== submission.video.publicUrl ||
      video.durationSeconds !== submission.video.durationSeconds ||
      video.scriptSha256 !== submission.video.script.sha256 ||
      video.captionsSha256 !== submission.video.captions.sha256
    ) {
      issues.push("video verification receipt does not match the package");
    }
  }

  const feedback = parseEvidenceReceipt(
    FeedbackSessionReceiptSchema,
    submission.feedback.evidence,
    "feedback session",
    evidence,
    issues,
  );
  if (feedback !== null) {
    assertPublicationRelease(
      feedback.release,
      expectedRelease,
      "feedback session",
      issues,
    );
    assertPreSubmissionTimestamp(
      feedback.checkedAt,
      submission,
      now,
      notBefore,
      "feedback session",
      issues,
    );
    if (feedback.sessionId !== submission.feedback.sessionId) {
      issues.push("feedback Session ID does not match the package");
    }
  }

  const verifiedJourneyEvidence = new Map<
    string,
    {
      reference: EvidenceReference;
      receipt: z.infer<typeof CloakJourneyEvidenceReceiptSchema>;
    }
  >();
  for (const entry of submission.browserQualification.journeyEvidence) {
    const receipt = parseEvidenceReceipt(
      CloakJourneyEvidenceReceiptSchema,
      entry.evidence,
      `CloakBrowser journey ${entry.id}`,
      evidence,
      issues,
    );
    if (receipt === null) continue;
    assertPublicationRelease(
      receipt.release,
      expectedRelease,
      `CloakBrowser journey ${entry.id}`,
      issues,
    );
    assertPreSubmissionTimestamp(
      receipt.checkedAt,
      submission,
      now,
      notBefore,
      `CloakBrowser journey ${entry.id}`,
      issues,
    );
    if (receipt.id !== entry.id || verifiedJourneyEvidence.has(entry.id)) {
      issues.push("CloakBrowser journey evidence identity does not match");
      continue;
    }
    verifiedJourneyEvidence.set(entry.id, {
      reference: entry.evidence,
      receipt,
    });
  }

  const verifiedManualEvidence = new Map<
    (typeof REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS)[number],
    {
      reference: EvidenceReference;
      receipt: z.infer<typeof CloakManualEvidenceReceiptSchema>;
    }
  >();
  for (const key of REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS) {
    const reference = submission.browserQualification.manualEvidence[key];
    const receipt = parseEvidenceReceipt(
      CloakManualEvidenceReceiptSchema,
      reference,
      `CloakBrowser manual evidence ${key}`,
      evidence,
      issues,
    );
    if (reference === null || receipt === null) continue;
    assertPublicationRelease(
      receipt.release,
      expectedRelease,
      `CloakBrowser manual evidence ${key}`,
      issues,
    );
    assertPreSubmissionTimestamp(
      receipt.checkedAt,
      submission,
      now,
      notBefore,
      `CloakBrowser manual evidence ${key}`,
      issues,
    );
    if (receipt.check !== key) {
      issues.push(
        `CloakBrowser manual evidence ${key} identity does not match`,
      );
      continue;
    }
    verifiedManualEvidence.set(key, { reference, receipt });
  }

  const browserReportReference =
    submission.browserQualification.playwrightReport;
  const browserIndexReference = submission.browserQualification.evidenceIndex;
  const browserReport = parseEvidenceReceipt(
    CloakBrowserExecutionReportSchema,
    browserReportReference,
    "CloakBrowser execution report",
    evidence,
    issues,
  );
  const browserIndex = parseEvidenceReceipt(
    CloakBrowserEvidenceIndexSchema,
    browserIndexReference,
    "CloakBrowser evidence index",
    evidence,
    issues,
  );
  const browser = parseEvidenceReceipt(
    CloakBrowserQualificationReceiptSchema,
    submission.browserQualification.evidence,
    "CloakBrowser qualification",
    evidence,
    issues,
  );
  if (browserReport !== null) {
    assertPublicationRelease(
      browserReport.release,
      expectedRelease,
      "CloakBrowser execution report",
      issues,
    );
    assertPreSubmissionTimestamp(
      browserReport.checkedAt,
      submission,
      now,
      notBefore,
      "CloakBrowser execution report",
      issues,
    );
    for (const journey of browserReport.journeys) {
      const verified = verifiedJourneyEvidence.get(journey.id);
      if (
        verified === undefined ||
        verified.reference.sha256 !== journey.evidenceSha256 ||
        verified.receipt.viewport !== journey.viewport ||
        verified.receipt.journeyStatus !== journey.status ||
        verified.receipt.attempt !== journey.attempt ||
        verified.receipt.durationMs !== journey.durationMs ||
        Date.parse(verified.receipt.checkedAt) >
          Date.parse(browserReport.checkedAt)
      ) {
        issues.push(
          `CloakBrowser journey ${journey.id} does not match its report`,
        );
      }
    }
  }
  if (browserIndex !== null) {
    assertPublicationRelease(
      browserIndex.release,
      expectedRelease,
      "CloakBrowser evidence index",
      issues,
    );
    assertPreSubmissionTimestamp(
      browserIndex.checkedAt,
      submission,
      now,
      notBefore,
      "CloakBrowser evidence index",
      issues,
    );
    const manualHashes = Object.values(browserIndex.manual).map(
      (manual) => manual.evidenceSha256,
    );
    if (new Set(manualHashes).size !== manualHashes.length) {
      issues.push("CloakBrowser manual evidence hashes must be unique");
    }
    if (
      browserReport !== null &&
      new Set([
        ...manualHashes,
        ...browserReport.journeys.map((journey) => journey.evidenceSha256),
      ]).size !==
        manualHashes.length + browserReport.journeys.length
    ) {
      issues.push("CloakBrowser evidence roles must use distinct bytes");
    }
    for (const key of REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS) {
      const verified = verifiedManualEvidence.get(key);
      if (
        verified === undefined ||
        browserIndex.manual[key].evidenceSha256 !== verified.reference.sha256 ||
        Date.parse(verified.receipt.checkedAt) >
          Date.parse(browserIndex.checkedAt)
      ) {
        issues.push(
          `CloakBrowser manual evidence ${key} does not match its index`,
        );
      }
    }
  }
  if (browser !== null) {
    assertPublicationRelease(
      browser.release,
      expectedRelease,
      "CloakBrowser qualification",
      issues,
    );
    assertPreSubmissionTimestamp(
      browser.checkedAt,
      submission,
      now,
      notBefore,
      "CloakBrowser qualification",
      issues,
    );
    const manifest = submission.browserQualification;
    if (
      browser.authority !== manifest.authority ||
      browser.exactReleaseBound !== manifest.exactReleaseBound ||
      browser.desktopComplete !== manifest.desktopComplete ||
      browser.mobileComplete !== manifest.mobileComplete ||
      browser.requiredSkips !== manifest.requiredSkips ||
      browser.failures !== manifest.failures ||
      browser.consoleErrors !== manifest.consoleErrors ||
      browser.failedRequests !== manifest.failedRequests ||
      browserReportReference === null ||
      browserIndexReference === null ||
      browser.playwrightReportSha256 !== browserReportReference.sha256 ||
      browser.browserEvidenceIndexSha256 !== browserIndexReference.sha256 ||
      verifiedJourneyEvidence.size !== browser.journeyCount ||
      verifiedManualEvidence.size !== REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS.length
    ) {
      issues.push("CloakBrowser receipt does not match the package");
    }
    if (
      browserReport !== null &&
      (browser.browserVersion !== browserReport.browserVersion ||
        browser.playwrightVersion !== browserReport.playwrightVersion ||
        browser.failures !== browserReport.failures ||
        browser.requiredSkips !== browserReport.skips ||
        browser.consoleErrors !== browserReport.consoleErrors ||
        browser.failedRequests !== browserReport.failedRequests ||
        JSON.stringify(browser.journeys) !==
          JSON.stringify(browserReport.journeys) ||
        Date.parse(browserReport.checkedAt) > Date.parse(browser.checkedAt))
    ) {
      issues.push("CloakBrowser execution report does not match its receipt");
    }
    if (
      browserIndex !== null &&
      (browserReportReference === null ||
        browserIndex.executionReportSha256 !== browserReportReference.sha256 ||
        (browserReport !== null &&
          Date.parse(browserIndex.checkedAt) <
            Date.parse(browserReport.checkedAt)) ||
        Date.parse(browserIndex.checkedAt) > Date.parse(browser.checkedAt))
    ) {
      issues.push("CloakBrowser evidence index does not match its receipt");
    }
  }

  const linkAudit = parseEvidenceReceipt(
    PublicLinkAuditReceiptSchema,
    submission.publicLinkAudit.evidence,
    "public-link audit",
    evidence,
    issues,
  );
  if (linkAudit !== null) {
    assertPublicationRelease(
      linkAudit.release,
      expectedRelease,
      "public-link audit",
      issues,
    );
    assertPreSubmissionTimestamp(
      linkAudit.checkedAt,
      submission,
      now,
      notBefore,
      "public-link audit",
      issues,
    );
    if (
      linkAudit.checkedAt !== submission.publicLinkAudit.checkedAt ||
      linkAudit.loggedOut !== submission.publicLinkAudit.loggedOut ||
      submission.video.publicUrl === null
    ) {
      issues.push("public-link audit does not match the package");
    } else {
      assertLinkSet(
        linkAudit.links,
        new Map([
          ["judge", submission.publicProduct.judgeUrl],
          ["repository", submission.repository.url],
          ["video", submission.video.publicUrl],
        ]),
        "public-link audit",
        issues,
      );
    }
  }

  const firstImageSha256 = submission.assets.find(
    (asset) => asset.fileName === EXPECTED_ASSETS[0],
  )?.image.sha256;
  for (const asset of submission.assets) {
    const provenance = parseEvidenceReceipt(
      ScreenshotProvenanceReceiptSchema,
      asset.provenance,
      `screenshot provenance ${asset.fileName}`,
      evidence,
      issues,
    );
    if (provenance === null) continue;
    assertPublicationRelease(
      provenance.release,
      expectedRelease,
      `screenshot ${asset.fileName}`,
      issues,
    );
    assertPreSubmissionTimestamp(
      provenance.checkedAt,
      submission,
      now,
      notBefore,
      `screenshot ${asset.fileName}`,
      issues,
    );
    assertPreSubmissionTimestamp(
      provenance.capturedAt,
      submission,
      now,
      notBefore,
      `screenshot ${asset.fileName} capture`,
      issues,
    );
    try {
      const dimensions = readPngDimensions(
        cachedEvidence(evidence, asset.image, `screenshot ${asset.fileName}`),
      );
      const expectedPrimary = asset.fileName !== EXPECTED_ASSETS[4];
      if (
        dimensions.width !== provenance.viewport.width ||
        dimensions.height !== provenance.viewport.height ||
        (expectedPrimary &&
          (dimensions.width !== 1_440 || dimensions.height !== 900)) ||
        (!expectedPrimary &&
          (dimensions.width > 1_440 || dimensions.height > 900))
      ) {
        issues.push(`screenshot ${asset.fileName} dimensions do not match`);
      }
    } catch {
      issues.push(`screenshot ${asset.fileName} is not a valid PNG`);
    }
    const publicUrl = new URL(provenance.publicUrl);
    if (
      provenance.fileName !== asset.fileName ||
      provenance.imageSha256 !== asset.image.sha256 ||
      publicUrl.origin !== new URL(submission.publicProduct.judgeUrl).origin ||
      `${publicUrl.pathname}${publicUrl.search}` !== provenance.route ||
      Date.parse(provenance.capturedAt) > Date.parse(provenance.checkedAt) ||
      (asset.fileName !== EXPECTED_ASSETS[4] &&
        provenance.derivedFromSha256 !== null) ||
      (asset.fileName === EXPECTED_ASSETS[4] &&
        provenance.derivedFromSha256 !== firstImageSha256)
    ) {
      issues.push(`screenshot ${asset.fileName} provenance does not match`);
    }
  }
}

function assertSubmittedEvidence(
  submission: SubmissionPackage,
  evidence: EvidenceCache,
  issues: string[],
  now: Date,
): void {
  const expectedRelease = expectedPublicationRelease(submission);
  const notBefore = publicationAvailableAt(submission, evidence);
  const official = parseEvidenceReceipt(
    DevpostSubmissionReceiptSchema,
    submission.officialSubmission.receipt,
    "Devpost submission",
    evidence,
    issues,
  );
  if (official === null) return;
  assertPublicationRelease(
    official.release,
    expectedRelease,
    "Devpost submission",
    issues,
  );
  const manifest = submission.officialSubmission;
  let officialUrl: URL | null = null;
  try {
    officialUrl = new URL(official.publicUrl);
  } catch {
    issues.push("Devpost submission URL is invalid");
  }
  if (
    official.hackathonId !== submission.competition.hackathonId ||
    official.projectId !== submission.competition.projectId ||
    official.category !== submission.competition.category ||
    official.publicSlug !== manifest.publicSlug ||
    official.submittedAt !== manifest.submittedAt ||
    official.copy.devpostCopySha256 !== submission.copy.devpostCopy.sha256 ||
    official.copy.readmeSha256 !== submission.copy.readme.sha256 ||
    official.copy.videoScriptSha256 !== submission.video.script.sha256 ||
    official.copy.captionsSha256 !== submission.video.captions.sha256 ||
    (notBefore !== null && Date.parse(official.submittedAt) < notBefore) ||
    Date.parse(official.submittedAt) > Date.parse(official.capturedAt) ||
    Date.parse(official.capturedAt) > now.getTime() ||
    officialUrl === null ||
    officialUrl.username !== "" ||
    officialUrl.password !== "" ||
    !/^(?:www\.)?devpost\.com$/u.test(officialUrl.hostname) ||
    officialUrl.pathname.replace(/\/$/u, "") !==
      `/software/${official.publicSlug}` ||
    officialUrl.search !== "" ||
    officialUrl.hash !== ""
  ) {
    issues.push("Devpost submission receipt does not match the package");
  }

  const postAudit = parseEvidenceReceipt(
    PostSubmitLinkAuditReceiptSchema,
    manifest.postSubmitLoggedOutEvidence,
    "post-submit link audit",
    evidence,
    issues,
  );
  if (postAudit === null || submission.video.publicUrl === null) return;
  assertPublicationRelease(
    postAudit.release,
    expectedRelease,
    "post-submit link audit",
    issues,
  );
  if (
    (notBefore !== null && Date.parse(postAudit.checkedAt) < notBefore) ||
    Date.parse(postAudit.checkedAt) < Date.parse(official.submittedAt) ||
    Date.parse(postAudit.checkedAt) > now.getTime()
  ) {
    issues.push("post-submit link audit timestamp is invalid");
  }
  assertLinkSet(
    postAudit.links,
    new Map([
      ["judge", submission.publicProduct.judgeUrl],
      ["repository", submission.repository.url],
      ["video", submission.video.publicUrl],
      ["devpost", official.publicUrl],
    ]),
    "post-submit link audit",
    issues,
  );
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
  const issues: string[] = [];
  assertEvidencePathPolicy(submission, references, issues);
  if (issues.length > 0) throw new SubmissionValidationError(issues);
  const seen = new Map<string, string>();
  const evidence = new Map<string, Uint8Array>();
  const screenshotPaths = new Set(
    submission.assets.map((asset) => asset.image.path),
  );
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
    const maximumBytes = screenshotPaths.has(reference.path)
      ? MAX_SCREENSHOT_BYTES
      : MAX_TEXT_EVIDENCE_BYTES;
    if (value.byteLength > maximumBytes) {
      throw new Error(`evidence exceeds its size limit: ${reference.path}`);
    }
    if (sha256(value) !== reference.sha256) {
      throw new Error(`evidence hash mismatch: ${reference.path}`);
    }
    evidence.set(reference.path, value);
  }

  const now = options.now ?? new Date();
  if (Number.isNaN(now.getTime()))
    throw new Error("validation time is invalid");
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
    assertPublicationEvidence(submission, evidence, issues, now);
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
      Date.parse(official.submittedAt) >=
      Date.parse(submission.competition.deadline)
    ) {
      issues.push("official submission timestamp is at or after the deadline");
    } else if (Date.parse(official.submittedAt) > now.getTime()) {
      issues.push("official submission timestamp is in the future");
    }
    assertSubmittedEvidence(submission, evidence, issues, now);
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
  const file = await stat(path);
  const maximumBytes = reference.path.endsWith(".png")
    ? MAX_SCREENSHOT_BYTES
    : MAX_TEXT_EVIDENCE_BYTES;
  if (!file.isFile() || file.size > maximumBytes) {
    throw new Error(`submission evidence file is invalid: ${reference.path}`);
  }
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
