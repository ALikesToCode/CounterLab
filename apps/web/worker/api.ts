import {
  ArtifactManifestSchema,
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  ExperimentPlanV2Schema,
  HostedExperimentLineageV5Schema,
  HostedVerifiedResultSetV2Schema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  ImbalanceTransferSubmissionSchema,
  LearnerInteractionInputSchema,
  LearnerInteractionReceiptSchema,
  LearnerInteractionRecordSchema,
  LearningDirectorClarificationChoiceIdSchema,
  LearningDirectorSessionStateSchema,
  LeakageTransferSubmissionSchema,
  PatchPlanV1Schema,
  PatchResultSchema,
  PublicReplayProjectionV1Schema,
  PublicReplayPublicationReceiptV2Schema,
  ProofCapsuleRefV2Schema,
  ProofCapsuleReplayReceiptV2Schema,
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerLabCompileBundleSchema,
  RunnerLabRunBundleSchema,
  RunnerOutputPathSchema,
  RunnerPatchCompileBundleSchema,
  RunnerRequestIdentityV1Schema,
  VerifiedOperationSummaryV1Schema,
  type BeliefSpecV2,
  type BeliefTest,
  type ArtifactManifest,
  type BoundaryMapAuthorityRefV1,
  type BoundaryMapResultV1,
  type BoundaryMapVerificationReportV1,
  type ExperimentPlanV2,
  type HostedPatchAuthorityRefV5,
  type HostedResultAuthorityRefV5,
  type PatchResult,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerJob,
  type RunnerRequestIdentityV1,
  type VerifiedResultSet,
  canonicalJsonV1,
} from "@counterlab/contracts";

import { SAMPLE_LEAKAGE_QUESTION } from "../shared/sample-authority";
import {
  canonicalUploadMediaType,
  canonicalUploadRequestBinding,
} from "../shared/upload-operation";
import {
  ExperimentIRV5Schema,
  RunnerBoundaryMapBundleV5Schema,
  RunnerLabCompileBundleV5Schema,
  RunnerLabInteractiveRunBundleV5Schema,
  RunnerLabRunBundleV5Schema,
  RunnerPatchCompileBundleV5Schema,
  RunnerScientificCandidateV5Schema,
  VersionedRunnerJobInputBundleSchema,
  deriveInteractivePlanV5,
  hashExperimentIR,
  type RunnerBoundaryMapBundleV5,
  type RunnerPatchCompileBundleV5,
} from "@counterlab/experiment-ir";
import {
  issueBoundaryMapAuthority,
  validateBoundaryMapAuthority,
  verifyBoundaryMap,
  type BoundaryMapExpectationV1,
} from "@counterlab/boundary-map";
import {
  ApprovedSampleBeliefAnalyst,
  BeliefAnalystError,
  LearningDirectorError,
  buildSanitizedAnalystContext,
  createLiveBeliefAnalystFromEnv,
  createLiveLearningDirectorFromEnv,
  requireApplicableClaim,
} from "@counterlab/belief-analyst";
import {
  getConceptPack,
  routeArtifactConcept,
} from "@counterlab/concept-registry";
import {
  LabSceneV2Schema,
  VerifiedLabSceneViewV1Schema,
} from "@counterlab/generative-ui-contracts";
import { NotebookParseError, parseNotebook } from "@counterlab/notebook-parser";
import {
  EpistemicVerificationReportV1Schema,
  PlanVerificationError,
  PatchPlanVerificationError,
  ResultVerificationError,
  verifyExperimentPlan,
  verifyEpistemicEvidence,
  verifyHostedResultSet,
  verifyInteractiveLeakageExperimentPlan,
  verifyInteractiveResultSet,
  verifyPatchPlan,
  verifyScientificCandidateV5,
  type EpistemicVerificationReport,
} from "@counterlab/plan-verifier";
import {
  ConcurrentRunnerJobUpdateError,
  InvalidSessionTransitionError,
  PredictionAlreadyCommittedError,
  RunnerCallbackConflictError,
  RunnerCallbackStateError,
  RunnerEventCursorError,
  RunnerJobNotFoundError,
  RunnerJobService,
  SessionInputError,
  SessionAlreadyExistsError,
  SessionNotFoundError,
  SessionService,
  getSessionBeliefAuthority,
  hashCanonical,
  resolveSessionEvidenceAuthority,
  type RunnerCallbackClaimToken,
  type RunnerJobRepository,
  type CounterLabSession,
  type SessionRepository,
} from "@counterlab/session-core";
import {
  createPublicReplayProjectionV1,
  projectProofCapsuleReplayV2,
  validatePublicReplayProjectionV1,
  validateProofCapsulePayloadAuthorityV2,
  validateProofCapsuleV2,
} from "@counterlab/proof-capsule";
import {
  validateProofBundle,
  verifyEvidenceChain,
} from "@counterlab/proof-bundle";
import { Hono } from "hono";
import type { Context } from "hono";
import { z, ZodError } from "zod";

import samplePatchedNotebookText from "../../../fixtures/public/leakage_sample_patch_v1/customer_churn_leakage.patched.ipynb?raw";
import samplePatchKernelResult from "../../../fixtures/public/leakage_sample_patch_v1/patch-kernel-result.json";
import scientificEngineSnapshotValue from "../../../scientific-engines/snapshot-hash.json";
import replayPatchKernelResult from "../../../replays/leakage-01/patch-kernel-result.json";
import compilerReplaySummary from "../../../replays/leakage-01/compiler/replay-summary.json";
import replayVerifiedResult from "../../../replays/leakage-01/compiler/verified-live-run/verified-result.json";
import experimentPlanSchema from "../../../packages/contracts/schemas/experiment-plan-v2.schema.json";
import discriminationContractSchema from "../../../packages/contracts/schemas/discrimination-contract-v1.schema.json";
import experimentIrSchema from "../../../packages/experiment-ir/schemas/experiment-ir-v5.schema.json";
import labSceneDraftSchema from "../../../packages/generative-ui-contracts/schemas/lab-scene-draft-v2.schema.json";
import patchPlanSchema from "../../../packages/contracts/schemas/patch-plan-v1.schema.json";
import {
  D1ArtifactStore,
  type ArtifactStore,
  type StoredArtifact,
} from "./artifact-store";
import {
  D1OwnerCapabilityRepository,
  OwnerCapabilityConflictError,
  createOwnerCapability,
  deriveRestartOwnerCapability,
  deriveUploadOwnerCapability,
  ensureArtifactOwnerCapability,
  ensureSessionOwnerCapability,
  hashOwnerCapability,
  ownerCapabilityMatches,
  ownerCapabilityIdentifies,
  type OwnerCapabilityRepository,
} from "./access-control";
import {
  ADMISSION_POLICY_VERSION,
  DurableObjectAdmissionControl,
  hmacAdmissionKey,
  trustedAdmissionCaller,
  type AdmissionControl,
  type AdmissionDecision,
  type AdmissionKind,
  type AdmissionNamespace,
} from "./admission-control";
import {
  D1LearnerInteractionRepository,
  LearnerInteractionConflictError,
  type LearnerInteractionRepository,
} from "./learner-interaction-repository";
import {
  ConcurrentD1SessionUpdateError,
  D1SessionRepository,
} from "./d1-session-repository";
import { D1RunnerJobRepository } from "./d1-runner-job-repository";
import {
  CloudflareContainerRunnerDispatcher,
  HttpRunnerDispatcher,
  R2RunnerObjectStore,
  isRunnerContainerBinding,
  type RunnerDispatcher,
  type RunnerObjectStore,
} from "./runner-control-plane";
import { createRunnerContainerEnvVars } from "./runner-container-env";
import {
  deriveRunnerJobTokenPublicKey,
  RunnerTokenError,
  issueRunnerJobToken,
  verifyRunnerJobToken,
} from "./runner-token";
import { sampleManifest, sampleResult } from "./sample-evidence";
import {
  assertPassedTransferMatchesFixedPolicy,
  createSamplePatchResult,
  evaluateImbalanceTransfer,
  evaluateLeakageTransfer,
} from "./sample-learning-loop";
import {
  assertSampleProofClaimScope,
  loadVerifiedSampleLabAuthority,
} from "./sample-authority";
import { createLiveReasoningProof } from "./live-proof";
import {
  createNativeProofCapsuleV2,
  createNativeReasoningDiffV2,
  type NativeProofArtifactsV5,
} from "./live-proof-v5";
import {
  loadOperationalDiagnostics,
  type OperationalDiagnostics,
} from "./operational-diagnostics";
import {
  D1ProofCapsuleReplayRepository,
  ReplayPublicationConflictError,
  ReplayPublicationExpiredError,
  ReplayPublicationRevokedError,
  type ProofCapsuleReplayRepository,
} from "./replay-repository";

type WorkerBindings = Omit<Env, "COUNTERLAB_MAINTENANCE_MODE"> & {
  CODEX_AUTH_JSON?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_REASONING_EFFORT?: string;
  OPENAI_TIMEOUT_MS?: string;
  COUNTERLAB_CODEX_MODE?: string;
  COUNTERLAB_MAX_NOTEBOOK_BYTES?: string;
  COUNTERLAB_SIGNING_KEY?: string;
  COUNTERLAB_SIGNING_KEY_ID?: string;
  COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY?: string;
  COUNTERLAB_RUNNER_BASE_URL?: string;
  COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET?: string;
  COUNTERLAB_ADMISSION_KEY?: string;
  COUNTERLAB_MAINTENANCE_MODE?: string;
  COUNTERLAB_WORKER_EVIDENCE_COMMIT?: string;
  COUNTERLAB_RUNNER_SOURCE_COMMIT?: string;
  COUNTERLAB_RUNNER_IMAGE_DIGEST?: string;
  COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256?: string;
  COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256?: string;
  COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256?: string;
  COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256?: string;
  COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT?: string;
  COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256?: string;
  COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256?: string;
  COUNTERLAB_RUNTIME_POLICY_SHA256?: string;
  COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256?: string;
  COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION?: string;
  COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256?: string;
  COUNTERLAB_WORKER_BUNDLE_SHA256?: string;
  COUNTERLAB_CLIENT_ASSETS_SHA256?: string;
  COUNTERLAB_CLIENT_ASSET_COUNT?: string;
  COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256?: string;
  COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT?: string;
  COUNTERLAB_VITE_VERSION?: string;
  COUNTERLAB_WRANGLER_VERSION?: string;
  CF_VERSION_METADATA?: {
    id: string;
    tag: string;
    timestamp: string;
  };
  ADMISSION?: AdmissionNamespace;
  RUNNER?: unknown;
};

type AppBindings = {
  Bindings: WorkerBindings;
  Variables: {
    requestId: string;
    runnerCallbackClaim:
      { jobId: string; claim: RunnerCallbackClaimToken } | undefined;
  };
};

export interface ApiOptions {
  sessionRepository?: SessionRepository;
  artifactStore?: ArtifactStore;
  ownerCapabilityRepository?: OwnerCapabilityRepository;
  admissionControl?: AdmissionControl;
  admissionHmacKey?: string;
  admissionCaller?: (request: Request) => string;
  runnerJobRepository?: RunnerJobRepository;
  runnerObjectStore?: RunnerObjectStore;
  replayRepository?: ProofCapsuleReplayRepository;
  learnerInteractionRepository?: LearnerInteractionRepository;
  runnerDispatcher?: RunnerDispatcher;
  runnerSigningPrivateKey?: string;
  adminDiagnosticSecret?: string;
  operationalDiagnostics?: () => Promise<OperationalDiagnostics>;
  now?: () => Date;
  id?: (prefix: string) => string;
}

const SCIENTIFIC_COMPILER_ATTEMPT_WALL_SECONDS = 120;
const SCIENTIFIC_COMPILER_MAX_ATTEMPTS = 3;
const SCIENTIFIC_COMPILER_CONTROL_PLANE_RESERVE_SECONDS = 60;
const SCIENTIFIC_COMPILER_JOB_TIMEOUT_SECONDS =
  SCIENTIFIC_COMPILER_ATTEMPT_WALL_SECONDS * SCIENTIFIC_COMPILER_MAX_ATTEMPTS +
  SCIENTIFIC_COMPILER_CONTROL_PLANE_RESERVE_SECONDS;
const RUNNER_JOB_TOKEN_GRACE_SECONDS = 120;
const MAX_RUNNER_JOB_TOKEN_TTL_SECONDS = 900;
const MAX_SESSION_RUNNER_HISTORY_JOBS = 32;
const MAX_SESSION_COMPILER_HISTORY_EVENTS = 512;
const MAX_EVIDENCE_SNAPSHOT_ATTEMPTS = 4;

const JsonObjectSchema = z.record(z.string(), z.unknown());
const HostedPlanLineageSchema = z
  .object({
    status: z.literal("VERIFIED"),
    jobId: z.string().trim().min(1),
    planHash: z.string().regex(/^[a-f0-9]{64}$/u),
    source: z.literal("hosted-plan-v2"),
  })
  .passthrough();
const CreateArtifactSchema = z.object({ sample: z.literal(true) }).strict();
const CreateSampleSessionSchema = z
  .object({ sampleId: z.literal("leakage-01") })
  .strict();
const CreateLiveSessionSchema = z
  .object({
    artifactId: z.string().trim().min(1),
    artifactCapability: z
      .string()
      .regex(/^cl_owner_[A-Za-z0-9_-]{43}$/u)
      .optional(),
  })
  .strict();
const CreateReplaySessionSchema = z
  .object({ replayId: z.literal("leakage-01") })
  .strict();
const RestartSessionSchema = z.object({}).strict();
const PublishReplaySchema = z.object({}).strict();
const PublicReplayLocatorSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u);
const PUBLIC_REPLAY_TTL_MS = 30 * 24 * 60 * 60 * 1_000;
const BeliefRequestSchema = z
  .object({
    learnerClaim: z.string().trim().min(12).max(2000),
    previewHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .optional(),
    sensitiveContentApproved: z.boolean().optional(),
  })
  .strict();
const ConfirmationSchema = z.union([
  z.object({ action: z.literal("confirm") }).strict(),
  z
    .object({
      action: z.literal("edit"),
      beliefTest: JsonObjectSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("edit"),
      beliefSpec: JsonObjectSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("reject"), reason: z.string().trim().min(1) })
    .strict(),
  z
    .object({
      action: z.literal("insufficient_evidence"),
      reason: z.string().trim().min(1),
    })
    .strict(),
]);
const LearningDirectorAnswerSchema = z
  .object({ answer: LearningDirectorClarificationChoiceIdSchema })
  .strict();
const PredictionRequestSchema = z
  .object({
    choice: z.string().trim().min(1).max(300),
    numericRange: z
      .object({ min: z.number().finite(), max: z.number().finite() })
      .strict()
      .optional(),
    confidence: z.number().finite().min(0).max(100),
  })
  .strict();
const RevisionSchema = z
  .object({ revision: z.string().trim().min(20).max(4000) })
  .strict();
const LegacyRunnerCandidateSchema = z
  .object({
    attempt: z.number().int().positive().max(3),
    planSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

const DEFAULT_MAX_NOTEBOOK_BYTES = 10_485_760;
const MAX_MULTIPART_OVERHEAD_BYTES = 65_536;
const MAX_MULTIPART_BOUNDARY_CHARACTERS = 200;
const MAX_UPLOAD_FILE_NAME_CHARACTERS = 255;
const ACCEPTED_NOTEBOOK_TYPES = new Set([
  "application/json",
  "application/x-ipynb+json",
  "application/octet-stream",
]);

function jsonSuccess<T>(data: T) {
  return { ok: true as const, data };
}

function jsonError(
  code: string,
  message: string,
  status: number,
  retryable = false,
) {
  return {
    ok: false as const,
    error: { code, message, status, ...(retryable ? { retryable: true } : {}) },
  };
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |=
      (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

function contentLength(context: Context<AppBindings>): number | undefined {
  const raw = context.req.header("content-length");
  if (raw === undefined) return undefined;
  if (!/^(?:0|[1-9]\d*)$/u.test(raw)) {
    throw new ApiInputError(
      "INVALID_CONTENT_LENGTH",
      "Content-Length must be one non-negative decimal integer",
      400,
    );
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value)) {
    throw new ApiInputError(
      "INVALID_CONTENT_LENGTH",
      "Content-Length is outside the supported range",
      400,
    );
  }
  return value;
}

async function readBoundedBody(
  context: Context<AppBindings>,
  maxBytes: number,
): Promise<Uint8Array> {
  const declared = contentLength(context);
  if (
    declared !== undefined &&
    context.req.header("transfer-encoding") !== undefined
  ) {
    throw new ApiInputError(
      "AMBIGUOUS_BODY_LENGTH",
      "A request cannot declare both Content-Length and Transfer-Encoding",
      400,
    );
  }
  if (declared !== undefined && declared > maxBytes) {
    throw new ApiInputError(
      "REQUEST_TOO_LARGE",
      `Request exceeds ${maxBytes} bytes`,
      413,
    );
  }
  const body = context.req.raw.body;
  if (body === null) {
    if (declared !== undefined && declared !== 0) {
      throw new ApiInputError(
        "BODY_LENGTH_MISMATCH",
        "The request body does not match Content-Length",
        400,
      );
    }
    return new Uint8Array();
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      if (received + chunk.byteLength > maxBytes) {
        await reader.cancel("CounterLab request body limit exceeded");
        throw new ApiInputError(
          "REQUEST_TOO_LARGE",
          `Request exceeds ${maxBytes} bytes`,
          413,
        );
      }
      chunks.push(chunk);
      received += chunk.byteLength;
    }
  } catch (error) {
    if (error instanceof ApiInputError) throw error;
    try {
      await reader.cancel("CounterLab request body read failed");
    } catch {
      // The underlying stream may already be errored or closed.
    }
    throw new ApiInputError(
      "REQUEST_BODY_INTERRUPTED",
      "The request body ended before it could be validated",
      400,
      true,
    );
  } finally {
    reader.releaseLock();
  }
  if (declared !== undefined && declared !== received) {
    throw new ApiInputError(
      "BODY_LENGTH_MISMATCH",
      "The request body does not match Content-Length",
      400,
    );
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function readJson(
  context: Context<AppBindings>,
  maxBytes = 64 * 1024,
): Promise<unknown> {
  const text = new TextDecoder().decode(
    await readBoundedBody(context, maxBytes),
  );
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiInputError(
      "INVALID_JSON",
      "Request body is not valid JSON",
      400,
    );
  }
}

async function readBoundedText(
  context: Context<AppBindings>,
  maxBytes: number,
): Promise<string> {
  return new TextDecoder().decode(await readBoundedBody(context, maxBytes));
}

class ApiInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

function requiredDatabase(context: Context<AppBindings>): D1Database {
  if (context.env?.DB === undefined) {
    throw new ApiInputError(
      "DATABASE_UNAVAILABLE",
      "CounterLab persistence is not configured for this runtime",
      503,
    );
  }
  return context.env.DB;
}

function sessionService(
  context: Context<AppBindings>,
  options: ApiOptions,
): SessionService {
  const repository =
    options.sessionRepository ??
    new D1SessionRepository(requiredDatabase(context));
  return new SessionService(repository, {
    ...(options.now === undefined ? {} : { now: options.now }),
    ...(options.id === undefined ? {} : { id: options.id }),
  });
}

function artifacts(
  context: Context<AppBindings>,
  options: ApiOptions,
): ArtifactStore {
  return (
    options.artifactStore ?? new D1ArtifactStore(requiredDatabase(context))
  );
}

function ownerCapabilitiesEnabled(options: ApiOptions): boolean {
  return (
    options.ownerCapabilityRepository !== undefined ||
    options.sessionRepository === undefined
  );
}

function ownerCapabilities(
  context: Context<AppBindings>,
  options: ApiOptions,
): OwnerCapabilityRepository {
  return (
    options.ownerCapabilityRepository ??
    new D1OwnerCapabilityRepository(requiredDatabase(context))
  );
}

function bearerOwnerCapability(
  context: Context<AppBindings>,
): string | undefined {
  const authorization = context.req.header("authorization") ?? "";
  return authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
}

function sessionOwnerCookieName(sessionId: string): string {
  return `counterlab_owner_${sessionId.replace(/[^A-Za-z0-9_-]/gu, "_")}`;
}

function sessionOwnerCookie(
  context: Context<AppBindings>,
  sessionId: string,
): string | undefined {
  const expected = `${sessionOwnerCookieName(sessionId)}=`;
  for (const part of (context.req.header("cookie") ?? "").split(";")) {
    const candidate = part.trim();
    if (candidate.startsWith(expected)) {
      return candidate.slice(expected.length);
    }
  }
  return undefined;
}

function setSessionOwnerCookie(
  context: Context<AppBindings>,
  sessionId: string,
  token: string,
): void {
  context.header(
    "set-cookie",
    `${sessionOwnerCookieName(sessionId)}=${token}; Path=/api/sessions/${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Strict`,
  );
}

function clearSessionOwnerCookie(
  context: Context<AppBindings>,
  sessionId: string,
): void {
  context.header(
    "set-cookie",
    `${sessionOwnerCookieName(sessionId)}=; Path=/api/sessions/${encodeURIComponent(sessionId)}; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  );
}

async function issueArtifactOwnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions,
  artifactId: string,
  createdAt: string,
): Promise<string | undefined> {
  if (!ownerCapabilitiesEnabled(options)) return undefined;
  const token = createOwnerCapability();
  await ownerCapabilities(context, options).createArtifact({
    resourceId: artifactId,
    tokenHash: await hashOwnerCapability(token),
    createdAt,
  });
  return token;
}

async function issueUploadArtifactOwnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions,
  input: {
    artifactId: string;
    createdAt: string;
    fileSha256: string;
    uploadIdempotencyKey: string;
  },
): Promise<string | undefined> {
  if (!ownerCapabilitiesEnabled(options)) return undefined;
  const secret =
    options.admissionHmacKey ?? context.env?.COUNTERLAB_ADMISSION_KEY ?? "";
  if (secret.trim().length < 32) {
    throw new ApiInputError(
      "UPLOAD_CAPABILITY_UNAVAILABLE",
      "Hash-bound notebook upload authority is not configured",
      503,
      true,
    );
  }
  const token = await deriveUploadOwnerCapability(
    secret,
    input.uploadIdempotencyKey,
    input.artifactId,
    input.fileSha256,
  );
  await ensureArtifactOwnerCapability(ownerCapabilities(context, options), {
    resourceId: input.artifactId,
    tokenHash: await hashOwnerCapability(token),
    createdAt: input.createdAt,
  });
  return token;
}

async function requireArtifactOwnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions,
  artifactId: string,
  token: string | undefined,
): Promise<void> {
  if (!ownerCapabilitiesEnabled(options)) return;
  const tokenHash =
    token === undefined ? undefined : await hashOwnerCapability(token);
  const record =
    tokenHash === undefined
      ? undefined
      : await ownerCapabilities(context, options).findArtifact(
          artifactId,
          tokenHash,
        );
  if (token === undefined || !(await ownerCapabilityMatches(record, token))) {
    throw new ApiInputError(
      "ARTIFACT_ACCESS_DENIED",
      "The requested private artifact is unavailable",
      404,
    );
  }
}

async function issueSessionOwnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions,
  sessionId: string,
  createdAt: string,
): Promise<string | undefined> {
  if (!ownerCapabilitiesEnabled(options)) return undefined;
  const token = createOwnerCapability();
  await ownerCapabilities(context, options).createSession({
    resourceId: sessionId,
    tokenHash: await hashOwnerCapability(token),
    createdAt,
  });
  return token;
}

async function issueRestartedSessionOwnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions,
  sourceSessionId: string,
  restarted: CounterLabSession,
): Promise<string | undefined> {
  if (!ownerCapabilitiesEnabled(options)) return undefined;
  const sourceCapability =
    bearerOwnerCapability(context) ??
    sessionOwnerCookie(context, sourceSessionId);
  if (sourceCapability === undefined) {
    throw new ApiInputError(
      "SESSION_ACCESS_DENIED",
      "The requested private session is unavailable",
      404,
    );
  }
  const token = await deriveRestartOwnerCapability(
    sourceCapability,
    restarted.id,
  );
  try {
    await ensureSessionOwnerCapability(ownerCapabilities(context, options), {
      resourceId: restarted.id,
      tokenHash: await hashOwnerCapability(token),
      createdAt: restarted.createdAt,
    });
  } catch (error) {
    if (error instanceof OwnerCapabilityConflictError) {
      throw new ApiInputError(
        "SESSION_RESTART_CONFLICT",
        "The fresh investigation could not be reconciled safely",
        409,
      );
    }
    throw error;
  }
  return token;
}

async function requireSessionOwnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions,
): Promise<void> {
  if (!ownerCapabilitiesEnabled(options)) return;
  const sessionId = context.req.param("sessionId");
  if (sessionId === undefined) {
    throw new ApiInputError(
      "SESSION_ACCESS_DENIED",
      "The requested private session is unavailable",
      404,
    );
  }
  const token =
    bearerOwnerCapability(context) ?? sessionOwnerCookie(context, sessionId);
  const record = await ownerCapabilities(context, options).findSession(
    sessionId,
  );
  const activeCapability = await ownerCapabilityMatches(record, token);
  const revocationRetry =
    new URL(context.req.url).pathname.endsWith("/access/revoke") &&
    record?.revokedAt !== undefined &&
    (await ownerCapabilityIdentifies(record, token));
  if (token === undefined || (!activeCapability && !revocationRetry)) {
    throw new ApiInputError(
      "SESSION_ACCESS_DENIED",
      "The requested private session is unavailable",
      404,
    );
  }
  if (activeCapability) setSessionOwnerCookie(context, sessionId, token);
}

function runnerJobService(
  context: Context<AppBindings>,
  options: ApiOptions,
): RunnerJobService {
  const repository =
    options.runnerJobRepository ??
    new D1RunnerJobRepository(requiredDatabase(context));
  return new RunnerJobService(repository, {
    ...(options.now === undefined ? {} : { now: options.now }),
  });
}

function runnerObjectStore(
  context: Context<AppBindings>,
  options: ApiOptions,
): RunnerObjectStore {
  const store =
    options.runnerObjectStore ??
    (() => {
      if (context.env?.ARTIFACTS === undefined) {
        throw new ApiInputError(
          "RUNNER_STORAGE_UNAVAILABLE",
          "Private runner storage is not configured",
          503,
        );
      }
      return new R2RunnerObjectStore(context.env.ARTIFACTS);
    })();
  const callbackClaim = context.get("runnerCallbackClaim");
  if (callbackClaim === undefined) return store;
  return {
    get: (key) => store.get(key),
    put: async (key, body, contentType) => {
      const jobs = runnerJobService(context, options);
      await jobs.assertCallbackClaim(callbackClaim.jobId, callbackClaim.claim);
      await store.put(key, body, contentType);
      await jobs.assertCallbackClaim(callbackClaim.jobId, callbackClaim.claim);
    },
  };
}

function proofCapsuleReplays(
  context: Context<AppBindings>,
  options: ApiOptions,
): ProofCapsuleReplayRepository {
  return (
    options.replayRepository ??
    new D1ProofCapsuleReplayRepository(requiredDatabase(context))
  );
}

function learnerInteractions(
  context: Context<AppBindings>,
  options: ApiOptions,
): LearnerInteractionRepository {
  return (
    options.learnerInteractionRepository ??
    new D1LearnerInteractionRepository(requiredDatabase(context))
  );
}

function interactionConcept(
  session: CounterLabSession,
): "entity_leakage" | "class_imbalance" | "unresolved" {
  return (
    session.beliefSpec?.concept ??
    session.beliefTest?.concept ??
    session.verifiedResult?.concept ??
    "unresolved"
  );
}

async function loadHostedPublicReplayProjection(
  context: Context<AppBindings>,
  options: ApiOptions,
  replayId: string,
) {
  if (options.replayRepository === undefined && context.env?.DB === undefined) {
    throw new ApiInputError(
      "REPLAY_NOT_FOUND",
      "The requested replay was not found",
      404,
    );
  }
  const record = await proofCapsuleReplays(context, options).find(
    replayId,
    requestNow(options).toISOString(),
  );
  if (record === undefined) {
    throw new ApiInputError(
      "REPLAY_NOT_FOUND",
      "The requested replay was not found",
      404,
    );
  }
  const persisted = await requireFrozenAuthorityObject(
    runnerObjectStore(context, options),
    record.projectionObjectKey,
    "public replay projection",
  );
  if (
    persisted.contentType !== "application/vnd.counterlab.public-replay+json" ||
    (await sha256Text(persisted.body)) !== record.projectionBytesHash
  ) {
    throw new ApiInputError(
      "REPLAY_AUTHORITY_MISMATCH",
      "The frozen public replay bytes do not match their publication record",
      409,
    );
  }
  const parsed = PublicReplayProjectionV1Schema.parse(
    parseFrozenAuthorityJson(persisted, "public replay projection"),
  );
  let replay;
  try {
    const integrity = parsed.authority.projectionIntegrity;
    replay = validatePublicReplayProjectionV1(parsed, {
      ...(integrity.mode === "hmac-signed" &&
      context.env?.COUNTERLAB_SIGNING_KEY_ID === integrity.keyId &&
      context.env.COUNTERLAB_SIGNING_KEY !== undefined
        ? {
            signingKeys: {
              [integrity.keyId]: context.env.COUNTERLAB_SIGNING_KEY,
            },
          }
        : {}),
    });
  } catch {
    throw new ApiInputError(
      "REPLAY_AUTHORITY_MISMATCH",
      "The frozen public replay failed integrity validation",
      409,
    );
  }
  if (
    replay.replayId !== record.replayId ||
    replay.authority.projectionHash !== record.projectionHash
  ) {
    throw new ApiInputError(
      "REPLAY_AUTHORITY_MISMATCH",
      "The replay record does not match its Proof Capsule authority",
      409,
    );
  }
  return { record, replay };
}

function runnerDispatcher(
  context: Context<AppBindings>,
  options: ApiOptions,
): RunnerDispatcher | undefined {
  if (options.runnerDispatcher !== undefined) return options.runnerDispatcher;
  const runnerSourceCommit =
    context.env?.COUNTERLAB_RUNNER_SOURCE_COMMIT?.trim() ?? "";
  const runnerImageDigest =
    context.env?.COUNTERLAB_RUNNER_IMAGE_DIGEST?.trim() ?? "";
  const generationIsolationEvidenceSha256 =
    context.env?.COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256?.trim() ?? "";
  const generationIsolationProbeSha256 =
    context.env?.COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256?.trim() ?? "";
  const exactRunnerIdentity =
    /^[a-f0-9]{40}$/u.test(runnerSourceCommit) &&
    /^sha256:[a-f0-9]{64}$/u.test(runnerImageDigest) &&
    /^[a-f0-9]{64}$/u.test(generationIsolationEvidenceSha256) &&
    /^[a-f0-9]{64}$/u.test(generationIsolationProbeSha256);
  const processRunnerURL = context.env?.COUNTERLAB_RUNNER_BASE_URL?.trim();
  if (
    processRunnerURL !== undefined &&
    processRunnerURL.length > 0 &&
    exactRunnerIdentity
  ) {
    try {
      return new HttpRunnerDispatcher({
        baseURL: processRunnerURL,
        releaseIdentity: {
          runnerSourceCommit,
          runnerImageDigest,
          generationIsolationEvidenceSha256,
          generationIsolationProbeSha256,
        },
      });
    } catch {
      return undefined;
    }
  }
  return isRunnerContainerBinding(context.env?.RUNNER) &&
    (context.env?.CODEX_AUTH_JSON?.trim().length ?? 0) > 0 &&
    exactRunnerIdentity
    ? new CloudflareContainerRunnerDispatcher(
        context.env.RUNNER,
        createRunnerContainerEnvVars(context.env),
        {
          runnerSourceCommit,
          runnerImageDigest,
          generationIsolationEvidenceSha256,
          generationIsolationProbeSha256,
        },
      )
    : undefined;
}

function runnerSigningPrivateKey(
  context: Context<AppBindings>,
  options: ApiOptions,
): string {
  const privateKey =
    options.runnerSigningPrivateKey ??
    context.env?.COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY;
  if (privateKey === undefined) {
    throw new ApiInputError(
      "RUNNER_AUTH_UNAVAILABLE",
      "Runner job signing is not configured",
      503,
    );
  }
  try {
    deriveRunnerJobTokenPublicKey(privateKey);
  } catch {
    throw new ApiInputError(
      "RUNNER_AUTH_UNAVAILABLE",
      "Runner job signing is not configured",
      503,
    );
  }
  return privateKey;
}

function runnerVerifyingPublicKey(
  context: Context<AppBindings>,
  options: ApiOptions,
): string {
  return deriveRunnerJobTokenPublicKey(
    runnerSigningPrivateKey(context, options),
  );
}

function requestNow(options: ApiOptions): Date {
  return options.now?.() ?? new Date();
}

function releaseIdentity(context: Context<AppBindings>):
  | {
      status: "bound";
      workerVersionId: string;
      workerVersionTag: string;
      workerEvidenceCommit: string;
      runnerSourceCommit: string;
      runnerImageDigest: string;
      generationIsolationEvidenceSha256: string;
      generationIsolationProbeSha256: string;
      releaseCheckGenerationIsolationEvidenceSha256: string;
      releaseCheckGenerationIsolationProbeSha256: string;
      releaseCheckGenerationIsolationVerifiedAt: string;
      timeoutCleanupReceiptSha256: string;
      aggregateLimitEvidenceSha256: string;
      runtimePolicySha256: string;
      proofDependencyManifestSha256: string;
      workerArtifactClassification: "PROCESS_BOUND_PARTIAL";
      workerArtifactManifestSha256: string;
      workerBundleSha256: string;
      clientAssetsSha256: string;
      clientAssetCount: number;
      clientPublicAssetsSha256: string;
      clientPublicAssetCount: number;
      viteVersion: "8.1.4";
      wranglerVersion: "4.110.0";
    }
  | { status: "unbound" } {
  const workerEvidenceCommit =
    context.env?.COUNTERLAB_WORKER_EVIDENCE_COMMIT ?? "";
  const runnerSourceCommit = context.env?.COUNTERLAB_RUNNER_SOURCE_COMMIT ?? "";
  const runnerImageDigest = context.env?.COUNTERLAB_RUNNER_IMAGE_DIGEST ?? "";
  const generationIsolationEvidenceSha256 =
    context.env?.COUNTERLAB_GENERATION_ISOLATION_EVIDENCE_SHA256 ?? "";
  const generationIsolationProbeSha256 =
    context.env?.COUNTERLAB_GENERATION_ISOLATION_PROBE_SHA256 ?? "";
  const releaseCheckGenerationIsolationEvidenceSha256 =
    context.env
      ?.COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256 ?? "";
  const releaseCheckGenerationIsolationProbeSha256 =
    context.env?.COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256 ??
    "";
  const releaseCheckGenerationIsolationVerifiedAt =
    context.env?.COUNTERLAB_RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT ??
    "";
  const timeoutCleanupReceiptSha256 =
    context.env?.COUNTERLAB_TIMEOUT_CLEANUP_RECEIPT_SHA256 ?? "";
  const aggregateLimitEvidenceSha256 =
    context.env?.COUNTERLAB_AGGREGATE_LIMIT_EVIDENCE_SHA256 ?? "";
  const runtimePolicySha256 =
    context.env?.COUNTERLAB_RUNTIME_POLICY_SHA256 ?? "";
  const proofDependencyManifestSha256 =
    context.env?.COUNTERLAB_PROOF_DEPENDENCY_MANIFEST_SHA256 ?? "";
  const workerArtifactClassification =
    context.env?.COUNTERLAB_WORKER_ARTIFACT_CLASSIFICATION ?? "";
  const workerArtifactManifestSha256 =
    context.env?.COUNTERLAB_WORKER_ARTIFACT_MANIFEST_SHA256 ?? "";
  const workerBundleSha256 = context.env?.COUNTERLAB_WORKER_BUNDLE_SHA256 ?? "";
  const clientAssetsSha256 = context.env?.COUNTERLAB_CLIENT_ASSETS_SHA256 ?? "";
  const clientAssetCountText = context.env?.COUNTERLAB_CLIENT_ASSET_COUNT ?? "";
  const clientPublicAssetsSha256 =
    context.env?.COUNTERLAB_CLIENT_PUBLIC_ASSETS_SHA256 ?? "";
  const clientPublicAssetCountText =
    context.env?.COUNTERLAB_CLIENT_PUBLIC_ASSET_COUNT ?? "";
  const viteVersion = context.env?.COUNTERLAB_VITE_VERSION ?? "";
  const wranglerVersion = context.env?.COUNTERLAB_WRANGLER_VERSION ?? "";
  const clientAssetCount = Number(clientAssetCountText);
  const clientPublicAssetCount = Number(clientPublicAssetCountText);
  const workerVersionId = context.env?.CF_VERSION_METADATA?.id ?? "";
  const workerVersionTag = context.env?.CF_VERSION_METADATA?.tag ?? "";
  if (
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(
      workerVersionId,
    ) ||
    !/^[a-f0-9]{40}$/u.test(workerEvidenceCommit) ||
    !/^[a-f0-9]{40}$/u.test(runnerSourceCommit) ||
    !/^sha256:[a-f0-9]{64}$/u.test(runnerImageDigest) ||
    !/^[a-f0-9]{64}$/u.test(generationIsolationEvidenceSha256) ||
    !/^[a-f0-9]{64}$/u.test(generationIsolationProbeSha256) ||
    !/^[a-f0-9]{64}$/u.test(releaseCheckGenerationIsolationEvidenceSha256) ||
    releaseCheckGenerationIsolationProbeSha256 !==
      generationIsolationProbeSha256 ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(
      releaseCheckGenerationIsolationVerifiedAt,
    ) ||
    !Number.isFinite(Date.parse(releaseCheckGenerationIsolationVerifiedAt)) ||
    !/^[a-f0-9]{64}$/u.test(timeoutCleanupReceiptSha256) ||
    !/^[a-f0-9]{64}$/u.test(aggregateLimitEvidenceSha256) ||
    !/^[a-f0-9]{64}$/u.test(runtimePolicySha256) ||
    !/^[a-f0-9]{64}$/u.test(proofDependencyManifestSha256) ||
    workerArtifactClassification !== "PROCESS_BOUND_PARTIAL" ||
    !/^[a-f0-9]{64}$/u.test(workerArtifactManifestSha256) ||
    !/^[a-f0-9]{64}$/u.test(workerBundleSha256) ||
    !/^[a-f0-9]{64}$/u.test(clientAssetsSha256) ||
    !/^[1-9][0-9]*$/u.test(clientAssetCountText) ||
    !Number.isSafeInteger(clientAssetCount) ||
    !/^[a-f0-9]{64}$/u.test(clientPublicAssetsSha256) ||
    !/^[1-9][0-9]*$/u.test(clientPublicAssetCountText) ||
    !Number.isSafeInteger(clientPublicAssetCount) ||
    clientPublicAssetCount > clientAssetCount ||
    viteVersion !== "8.1.4" ||
    wranglerVersion !== "4.110.0" ||
    workerVersionTag !== `git-${workerEvidenceCommit}`
  ) {
    return { status: "unbound" };
  }
  return {
    status: "bound",
    workerVersionId,
    workerVersionTag,
    workerEvidenceCommit,
    runnerSourceCommit,
    runnerImageDigest,
    generationIsolationEvidenceSha256,
    generationIsolationProbeSha256,
    releaseCheckGenerationIsolationEvidenceSha256,
    releaseCheckGenerationIsolationProbeSha256,
    releaseCheckGenerationIsolationVerifiedAt,
    timeoutCleanupReceiptSha256,
    aggregateLimitEvidenceSha256,
    runtimePolicySha256,
    proofDependencyManifestSha256,
    workerArtifactClassification,
    workerArtifactManifestSha256,
    workerBundleSha256,
    clientAssetsSha256,
    clientAssetCount,
    clientPublicAssetsSha256,
    clientPublicAssetCount,
    viteVersion,
    wranglerVersion,
  };
}

function maintenanceEnabled(context: Context<AppBindings>): boolean {
  return context.env?.COUNTERLAB_MAINTENANCE_MODE === "true";
}

async function readinessSnapshot(
  context: Context<AppBindings>,
  options: ApiOptions,
) {
  const dispatcher = runnerDispatcher(context, options);
  let signing = false;
  try {
    runnerSigningPrivateKey(context, options);
    signing = true;
  } catch {
    signing = false;
  }
  let persistence =
    options.sessionRepository !== undefined &&
    options.runnerJobRepository !== undefined;
  if (!persistence && context.env?.DB !== undefined) {
    try {
      await context.env.DB.prepare("SELECT 1 AS ready").first();
      persistence = true;
    } catch {
      persistence = false;
    }
  }
  let privateStorage = options.runnerObjectStore !== undefined;
  if (!privateStorage && context.env?.ARTIFACTS !== undefined) {
    try {
      await context.env.ARTIFACTS.head("health/counterlab-readiness-probe");
      privateStorage = true;
    } catch {
      privateStorage = false;
    }
  }
  let runner = false;
  if (dispatcher !== undefined) {
    try {
      runner = await dispatcher.ready();
    } catch {
      runner = false;
    }
  }
  const release = releaseIdentity(context);
  const checks = {
    admission: admissionConfigured(context, options),
    analyst: (context.env?.OPENAI_API_KEY?.trim().length ?? 0) > 0,
    maintenance: !maintenanceEnabled(context),
    persistence,
    privateStorage,
    releaseIdentity: release.status === "bound" || !admissionEnabled(options),
    runner,
    signing,
  };
  return {
    checks,
    ready: Object.values(checks).every(Boolean),
    release,
  };
}

function requestId(options: ApiOptions, prefix: string): string {
  return options.id?.(prefix) ?? `${prefix}_${crypto.randomUUID()}`;
}

type AdmissionGrant = Extract<AdmissionDecision, { admitted: true }>;

function admissionEnabled(options: ApiOptions): boolean {
  return (
    options.admissionControl !== undefined ||
    (options.sessionRepository === undefined &&
      options.artifactStore === undefined &&
      options.runnerJobRepository === undefined &&
      options.runnerObjectStore === undefined)
  );
}

function admissionConfigured(
  context: Context<AppBindings>,
  options: ApiOptions,
): boolean {
  if (!admissionEnabled(options)) return true;
  const key =
    options.admissionHmacKey ?? context.env?.COUNTERLAB_ADMISSION_KEY ?? "";
  return (
    key.trim().length >= 32 &&
    (options.admissionControl !== undefined ||
      context.env?.ADMISSION !== undefined)
  );
}

function admissionHmacSecret(
  context: Context<AppBindings>,
  options: ApiOptions,
): string {
  const secret =
    options.admissionHmacKey ?? context.env?.COUNTERLAB_ADMISSION_KEY ?? "";
  if (secret.trim().length < 32) {
    throw new ApiInputError(
      "ADMISSION_UNAVAILABLE",
      "CounterLab cost admission is not configured for this runtime",
      503,
      true,
    );
  }
  return secret;
}

function admissionCoordinator(
  context: Context<AppBindings>,
  options: ApiOptions,
): AdmissionControl {
  if (options.admissionControl !== undefined) return options.admissionControl;
  if (context.env?.ADMISSION === undefined) {
    throw new ApiInputError(
      "ADMISSION_UNAVAILABLE",
      "CounterLab cost admission is not configured for this runtime",
      503,
      true,
    );
  }
  return new DurableObjectAdmissionControl(context.env.ADMISSION);
}

function admissionDenialMessage(reason: string): string {
  if (reason === "CALLER_BUDGET") {
    return "This browser has started too many costly operations in the current recovery window";
  }
  if (reason === "SESSION_BUDGET") {
    return "This learning session has reached its costly-operation recovery limit";
  }
  if (reason === "GLOBAL_BUSY") {
    return "CounterLab is at its verified live-work capacity; retry after the recovery window";
  }
  if (reason === "GLOBAL_BUDGET") {
    return "CounterLab has reached its global live-work safety budget; retry after the recovery window";
  }
  return "The admission operation identity conflicts with an existing request";
}

async function admitOperation(
  context: Context<AppBindings>,
  options: ApiOptions,
  input: {
    kind: AdmissionKind;
    operationKey: string;
    sessionId?: string;
  },
): Promise<AdmissionGrant> {
  if (!admissionEnabled(options)) {
    return { admitted: true, reused: false, leaseStatus: "none" };
  }
  const secret = admissionHmacSecret(context, options);
  const caller =
    options.admissionCaller?.(context.req.raw) ??
    trustedAdmissionCaller(context.req.raw);
  const [callerKey, sessionKey, operationKey] = await Promise.all([
    hmacAdmissionKey(secret, "caller", caller),
    input.sessionId === undefined
      ? Promise.resolve(undefined)
      : hmacAdmissionKey(secret, "session", input.sessionId),
    hmacAdmissionKey(
      secret,
      "operation",
      `${input.kind}\u0000${input.operationKey}`,
    ),
  ]);
  const decision = await admissionCoordinator(context, options).admit({
    policyVersion: ADMISSION_POLICY_VERSION,
    kind: input.kind,
    operationKey,
    callerKey,
    ...(sessionKey === undefined ? {} : { sessionKey }),
  });
  if (!decision.admitted) {
    const collision = decision.reason === "OPERATION_COLLISION";
    throw new ApiInputError(
      collision ? "ADMISSION_OPERATION_CONFLICT" : decision.reason,
      admissionDenialMessage(decision.reason),
      collision ? 409 : 429,
      !collision,
      collision ? undefined : decision.retryAfterSeconds,
    );
  }
  return decision;
}

async function releaseAdmissionBestEffort(
  context: Context<AppBindings>,
  options: ApiOptions,
  kind: AdmissionKind,
  rawOperationKey: string | undefined,
  leaseGeneration?: number,
): Promise<void> {
  if (!admissionEnabled(options) || rawOperationKey === undefined) return;
  try {
    const operationKey = await hmacAdmissionKey(
      admissionHmacSecret(context, options),
      "operation",
      `${kind}\u0000${rawOperationKey}`,
    );
    await admissionCoordinator(context, options).release({
      policyVersion: ADMISSION_POLICY_VERSION,
      kind,
      operationKey,
      ...(leaseGeneration === undefined ? {} : { leaseGeneration }),
    });
  } catch (error) {
    console.warn("CounterLab could not release an expiring admission lease", {
      requestId: context.get("requestId"),
      kind,
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

function runnerAdmissionOperationKey(job: RunnerJob): string {
  if (job.requestFingerprint === undefined) {
    throw new ApiInputError(
      "RUNNER_IDEMPOTENCY_REQUIRED",
      "Live runner work requires a semantic request fingerprint",
      409,
    );
  }
  return job.requestFingerprint;
}

function requestIdempotencyKey(
  context: Context<AppBindings>,
  options: ApiOptions,
  prefix: string,
): string {
  const provided = context.req.header("idempotency-key");
  if (provided === undefined) return requestId(options, prefix);
  if (!/^[A-Za-z0-9._:-]{16,128}$/u.test(provided)) {
    throw new ApiInputError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must contain 16 to 128 safe ASCII characters",
      400,
    );
  }
  return provided;
}

const UploadIdempotencyKeyPattern =
  /^upload_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})_([a-f0-9]{64})$/u;

type UploadOperationIdentity = Readonly<{
  bindingHash: string;
  operationId: string;
  rawKey: string;
}>;

function requireUploadOperationIdentity(
  rawKey: string,
): UploadOperationIdentity {
  const match = UploadIdempotencyKeyPattern.exec(rawKey);
  if (match?.[1] === undefined || match[2] === undefined) {
    throw new ApiInputError(
      "INVALID_UPLOAD_IDEMPOTENCY_KEY",
      "Notebook uploads require one hash-bound upload operation key",
      400,
    );
  }
  return {
    rawKey,
    operationId: match[1],
    bindingHash: match[2],
  };
}

async function requireUploadRequestBinding(
  operation: UploadOperationIdentity,
  input: { fileName: string; fileSha256: string; mediaType: string },
): Promise<void> {
  const expected = await hashCanonical(
    canonicalUploadRequestBinding({
      operationId: operation.operationId,
      fileSha256: input.fileSha256,
      fileName: input.fileName,
      mediaType: input.mediaType,
    }),
  );
  if (!constantTimeEqual(operation.bindingHash, expected)) {
    throw new ApiInputError(
      "UPLOAD_IDEMPOTENCY_CONFLICT",
      "This upload operation key is bound to different notebook content or metadata",
      409,
    );
  }
}

const DEFAULT_RESTART_IDEMPOTENCY_KEY = "counterlab.restart.v1";

function restartIdempotencyKey(context: Context<AppBindings>): string {
  const provided =
    context.req.header("idempotency-key") ?? DEFAULT_RESTART_IDEMPOTENCY_KEY;
  if (!/^[A-Za-z0-9._:-]{16,128}$/u.test(provided)) {
    throw new ApiInputError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency-Key must contain 16 to 128 safe ASCII characters",
      400,
    );
  }
  return provided;
}

async function deterministicRestartSessionId(
  sourceSessionId: string,
  idempotencyKey: string,
): Promise<string> {
  const fingerprint = await hashCanonical({
    schemaVersion: "1",
    operation: "restart-closed-belief-response",
    sourceSessionId,
    idempotencyKey,
  });
  return `session_restart_${fingerprint}`;
}

async function requireReconciledRestart(
  service: SessionService,
  source: CounterLabSession,
  restartedSessionId: string,
): Promise<CounterLabSession> {
  const restarted = await service.getSession(restartedSessionId);
  const [sourceEvents, restartedEvents, sourceModeHash, restartedModeHash] =
    await Promise.all([
      service.listEvents(source.id),
      service.listEvents(restarted.id),
      hashCanonical(source.mode),
      hashCanonical(restarted.mode),
    ]);
  const sourceHead = sourceEvents.at(-1);
  const creation = restartedEvents[0];
  const expectedSourceHash = await hashCanonical(source);
  const lineageValid =
    restarted.id === restartedSessionId &&
    restarted.artifactId === source.artifactId &&
    sourceModeHash === restartedModeHash &&
    sourceHead !== undefined &&
    creation?.kind === "session.created" &&
    creation.sequence === 1 &&
    creation.payload.sourceSessionId === source.id &&
    creation.payload.sourceState === source.state &&
    creation.payload.sourceEventHash === sourceHead.eventHash &&
    creation.inputHashes.length === 2 &&
    creation.inputHashes[0] === expectedSourceHash &&
    creation.inputHashes[1] === sourceHead.eventHash;
  if (!lineageValid) {
    throw new ApiInputError(
      "SESSION_RESTART_CONFLICT",
      "The fresh investigation could not be reconciled safely",
      409,
    );
  }
  return restarted;
}

function liveRunnerRequestIdentity(
  input: Omit<RunnerRequestIdentityV1, "schemaVersion" | "mode">,
): RunnerRequestIdentityV1 {
  return RunnerRequestIdentityV1Schema.parse({
    schemaVersion: "1",
    mode: "live_notebook",
    ...input,
  });
}

async function dispatchRecoverableRunnerJob(input: {
  context: Context<AppBindings>;
  options: ApiOptions;
  jobs: RunnerJobService;
  dispatcher: RunnerDispatcher;
  job: RunnerJob;
}): Promise<RunnerJob> {
  let dispatchJob = input.job;
  if (dispatchJob.status === "QUEUED") {
    try {
      dispatchJob = await input.jobs.transition(
        dispatchJob.jobId,
        dispatchJob.jobVersion,
        "STARTING",
        { runnerIdentity: input.dispatcher.identity },
      );
    } catch (error) {
      if (!(error instanceof ConcurrentRunnerJobUpdateError)) throw error;
      dispatchJob = await input.jobs.getJob(dispatchJob.jobId);
    }
  }
  if (
    dispatchJob.status !== "STARTING" ||
    dispatchJob.dispatchAcknowledgedAt !== undefined
  ) {
    return dispatchJob;
  }

  const nowEpochSeconds = Math.floor(
    requestNow(input.options).getTime() / 1_000,
  );
  const inputBundleKey = `runner-input/${dispatchJob.jobId}.json`;
  const tokenTtlSeconds = Math.min(
    dispatchJob.timeoutSeconds + RUNNER_JOB_TOKEN_GRACE_SECONDS,
    MAX_RUNNER_JOB_TOKEN_TTL_SECONDS,
  );
  const token = await issueRunnerJobToken(
    {
      schemaVersion: "2",
      issuer: "counterlab-control-plane",
      audience: "counterlab-runner",
      purpose: "RUN_JOB",
      controlPlaneOrigin: new URL(input.context.req.url).origin,
      tokenId: requestId(input.options, "runner_token"),
      jobId: dispatchJob.jobId,
      sessionId: dispatchJob.sessionId,
      artifactManifestHash: dispatchJob.artifactManifestHash,
      inputBundleKey,
      outputPrefix: `runner-output/${dispatchJob.jobId}/`,
      callbackPath: `/api/runner/jobs/${dispatchJob.jobId}/callback`,
      stateVersion: dispatchJob.stateVersion,
      issuedAt: nowEpochSeconds,
      expiresAt: nowEpochSeconds + tokenTtlSeconds,
    },
    runnerSigningPrivateKey(input.context, input.options),
  );
  const admissionOperationKey = runnerAdmissionOperationKey(dispatchJob);
  const admission = await admitOperation(input.context, input.options, {
    kind: "runner",
    sessionId: dispatchJob.sessionId,
    operationKey: admissionOperationKey,
  });
  if (admission.leaseStatus === "already-active") return dispatchJob;
  try {
    await input.dispatcher.dispatch({
      job: dispatchJob,
      token,
      controlPlaneUrl: new URL(input.context.req.url).origin,
    });
    try {
      return await input.jobs.acknowledgeDispatch(
        dispatchJob.jobId,
        dispatchJob.jobVersion,
      );
    } catch (error) {
      if (!(error instanceof ConcurrentRunnerJobUpdateError)) throw error;
      return input.jobs.getJob(dispatchJob.jobId);
    }
  } catch (dispatchError) {
    await releaseAdmissionBestEffort(
      input.context,
      input.options,
      "runner",
      admissionOperationKey,
    );
    const failure = {
      code: "RUNNER_DISPATCH_FAILED",
      message:
        "The process runner did not acknowledge this job; retrying will create a fresh separate job",
      retryable: true,
    } as const;
    try {
      await input.jobs.failJobWithEvent(
        dispatchJob.jobId,
        dispatchJob.jobVersion,
        {
          runnerIdentity: input.dispatcher.identity,
          error: failure,
        },
        {
          schemaVersion: "1",
          eventId: requestId(input.options, "compiler_event"),
          jobId: dispatchJob.jobId,
          cursor: dispatchJob.eventCursor + 1,
          at: requestNow(input.options).toISOString(),
          kind: "job.failed",
          code: failure.code,
          message: failure.message,
        },
      );
    } catch (stateError) {
      if (!(stateError instanceof ConcurrentRunnerJobUpdateError)) {
        console.error("CounterLab could not persist runner dispatch failure", {
          requestId: input.context.get("requestId"),
          jobId: dispatchJob.jobId,
          errorName:
            stateError instanceof Error ? stateError.name : "UnknownError",
        });
      }
    }
    console.warn("CounterLab runner dispatch was not acknowledged", {
      requestId: input.context.get("requestId"),
      jobId: dispatchJob.jobId,
      errorName:
        dispatchError instanceof Error ? dispatchError.name : "UnknownError",
    });
    throw new ApiInputError(failure.code, failure.message, 503, true);
  }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const SCIENTIFIC_COMPILER_OUTPUTS = [
  "discrimination-contract.json",
  "experiment-ir.json",
  "lab-scene.json",
  "public-rationale.md",
] as const;

async function reconstructScientificCompileAuthority(input: {
  store: RunnerObjectStore;
  job: RunnerJob;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  inputBundleKey: string;
  outputPrefix: string;
  callbackOutputHashes?: readonly string[];
}) {
  const authorityPrefix = `runner-authority/${input.job.jobId}/`;
  const [inputObject, ...objects] = await Promise.all([
    input.store.get(input.inputBundleKey),
    ...SCIENTIFIC_COMPILER_OUTPUTS.map((path) =>
      input.store.get(`${input.outputPrefix}${path}`),
    ),
    input.store.get(`${authorityPrefix}candidate-verification.json`),
    input.store.get(`${authorityPrefix}experiment-selection.json`),
    input.store.get(`${authorityPrefix}selected-experiment-ir.json`),
    input.store.get(`${authorityPrefix}experiment-plan.json`),
  ]);
  if (
    inputObject === undefined ||
    objects.some((object) => object === undefined)
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_MISSING",
      "The final scientific compiler authority is incomplete",
      409,
    );
  }
  const [
    contractObject,
    rawIrObject,
    sceneObject,
    rationaleObject,
    storedReportObject,
    storedSelectionObject,
    storedSelectedIrObject,
    storedPlanObject,
  ] = objects as [
    { body: string; contentType: string },
    { body: string; contentType: string },
    { body: string; contentType: string },
    { body: string; contentType: string },
    { body: string; contentType: string },
    { body: string; contentType: string },
    { body: string; contentType: string },
    { body: string; contentType: string },
  ];

  let bundle: z.infer<typeof RunnerLabCompileBundleV5Schema>;
  let contract: unknown;
  let rawIr: unknown;
  let scene: z.infer<typeof LabSceneV2Schema>;
  let storedReport: unknown;
  let storedSelection: unknown;
  let storedSelectedIr: z.infer<typeof ExperimentIRV5Schema>;
  let storedPlan: ExperimentPlanV2;
  try {
    bundle = RunnerLabCompileBundleV5Schema.parse(JSON.parse(inputObject.body));
    contract = JSON.parse(contractObject.body) as unknown;
    rawIr = JSON.parse(rawIrObject.body) as unknown;
    scene = LabSceneV2Schema.parse(JSON.parse(sceneObject.body));
    storedReport = JSON.parse(storedReportObject.body) as unknown;
    storedSelection = JSON.parse(storedSelectionObject.body) as unknown;
    storedSelectedIr = ExperimentIRV5Schema.parse(
      JSON.parse(storedSelectedIrObject.body),
    );
    storedPlan = ExperimentPlanV2Schema.parse(
      JSON.parse(storedPlanObject.body),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new ApiInputError(
        "SCIENTIFIC_AUTHORITY_INVALID",
        "The final scientific compiler authority failed strict validation",
        409,
      );
    }
    throw error;
  }

  if (
    input.job.kind !== "LAB_COMPILE" ||
    bundle.jobId !== input.job.jobId ||
    bundle.sessionId !== input.job.sessionId ||
    bundle.stateVersion !== input.job.stateVersion ||
    bundle.artifactManifestHash !== input.job.artifactManifestHash ||
    input.session.id !== input.job.sessionId ||
    input.session.beliefSpec === undefined ||
    input.session.prediction === undefined ||
    input.session.beliefTest !== undefined ||
    input.job.conceptPack.id !== bundle.conceptPack.id ||
    input.job.conceptPack.version !== bundle.conceptPack.version
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_LINEAGE_MISMATCH",
      "The scientific compiler authority does not belong to this live session",
      409,
    );
  }

  const fileHashes = await Promise.all(
    [contractObject, rawIrObject, sceneObject, rationaleObject].map((object) =>
      sha256Text(object.body),
    ),
  );
  if (
    input.callbackOutputHashes !== undefined &&
    (input.callbackOutputHashes.length !== fileHashes.length ||
      input.callbackOutputHashes.some(
        (hash, index) => hash !== fileHashes[index],
      ))
  ) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_HASH_MISMATCH",
      "Scientific compiler bytes do not exactly match the terminal callback",
      409,
    );
  }

  const [
    inputBundleHash,
    manifestHash,
    bundledManifestHash,
    beliefSpecHash,
    bundledBeliefSpecHash,
    predictionHash,
    bundledPredictionHash,
  ] = await Promise.all([
    hashCanonical(bundle),
    hashCanonical(input.manifest),
    hashCanonical(bundle.artifactManifest),
    hashCanonical(input.session.beliefSpec),
    hashCanonical(bundle.approvedBeliefSpec),
    hashCanonical(input.session.prediction),
    hashCanonical(bundle.prediction),
  ]);
  if (
    !input.job.inputHashes.includes(inputBundleHash) ||
    manifestHash !== input.job.artifactManifestHash ||
    bundledManifestHash !== manifestHash ||
    beliefSpecHash !== bundle.beliefSpecHash ||
    bundledBeliefSpecHash !== beliefSpecHash ||
    predictionHash !== bundledPredictionHash ||
    input.session.prediction.immutableHash !== bundle.prediction.immutableHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_LINEAGE_MISMATCH",
      "Current session authority does not match the compiled scientific inputs",
      409,
    );
  }

  const outcome = await verifyScientificCandidateV5({
    bundle,
    artifacts: {
      discriminationContract: contract,
      experimentIr: rawIr,
      labScene: scene,
      publicRationale: rationaleObject.body,
    },
  });
  if (outcome.disposition !== "VERIFIED") {
    throw new ApiInputError(
      outcome.disposition === "INCONCLUSIVE_NO_DECISIVE_TEST"
        ? "INCONCLUSIVE_NO_DECISIVE_TEST"
        : "SCIENTIFIC_VERIFIER_REJECTED",
      "The final scientific candidate did not pass fixed verification",
      409,
    );
  }

  const [
    reportHash,
    storedReportHash,
    selectionHash,
    storedSelectionHash,
    storedSelectedIrHash,
    storedPlanHash,
  ] = await Promise.all([
    hashCanonical(outcome.report),
    hashCanonical(storedReport),
    hashCanonical(outcome.selection),
    hashCanonical(storedSelection),
    hashExperimentIR(storedSelectedIr),
    hashCanonical(storedPlan),
  ]);
  if (
    storedReportHash !== reportHash ||
    storedSelectionHash !== selectionHash ||
    storedSelectedIrHash !== outcome.selectedIrHash ||
    storedPlanHash !== outcome.executionPlanHash ||
    (await hashExperimentIR(outcome.selectedIr)) !== storedSelectedIrHash ||
    (await hashCanonical(outcome.executionPlan)) !== storedPlanHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Stored fixed scientific derivations do not match fresh verification",
      409,
    );
  }

  const compilerOutputFileHashes = {
    "discrimination-contract.json": fileHashes[0]!,
    "experiment-ir.json": fileHashes[1]!,
    "lab-scene.json": fileHashes[2]!,
    "public-rationale.md": fileHashes[3]!,
  };
  const lineage = HostedExperimentLineageV5Schema.parse({
    schemaVersion: "5",
    status: "VERIFIED",
    source: "hosted-experiment-ir-v5",
    jobId: input.job.jobId,
    inputBundleHash,
    artifactManifestHash: manifestHash,
    beliefSpecHash,
    predictionHash: input.session.prediction.immutableHash,
    compilerOutputFileHashes,
    discriminationContractHash: outcome.report.discriminationContractHash,
    rawExperimentIrCanonicalHash: outcome.report.rawExperimentIrHash,
    labSceneHash: outcome.report.labSceneHash,
    candidateVerificationReportHash: reportHash,
    scientificVerifierVersion: outcome.report.verifierVersion,
    selectionHash,
    selectedExperimentIrHash: outcome.selectedIrHash,
    projectedPlanHash: outcome.executionPlanHash,
    scorerVersion: outcome.selection.scorerVersion,
    projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1",
  });
  return {
    bundle,
    compilerOutputFileHashes,
    labScene: scene,
    lineage,
    outcome,
    projectedPlan: storedPlan,
    selectedExperimentIr: storedSelectedIr,
  };
}

function verifiedScientificOperationSummary(
  authority: Awaited<ReturnType<typeof reconstructScientificCompileAuthority>>,
) {
  const selectionRef = authority.outcome.selection.selectedCandidateId;
  const selectedCandidate =
    authority.selectedExperimentIr.candidateExperiments.find(
      (candidate) => candidate.id === selectionRef,
    );
  if (selectionRef === null || selectedCandidate === undefined) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "The verified Experiment IR has no fixed-selected operation set",
      409,
    );
  }
  return VerifiedOperationSummaryV1Schema.parse({
    schemaVersion: "1",
    authority: "verified-selected-experiment-ir",
    authorityHash: authority.lineage.selectedExperimentIrHash,
    selectionRef,
    operationIds: selectedCandidate.operationIds,
  });
}

async function loadFrozenScientificCompileAuthority(input: {
  store: RunnerObjectStore;
  jobs: RunnerJobService;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  lineage: z.infer<typeof HostedExperimentLineageV5Schema>;
}) {
  const compileJob = await input.jobs.getJob(input.lineage.jobId);
  if (
    compileJob.kind !== "LAB_COMPILE" ||
    compileJob.status !== "VERIFIED" ||
    compileJob.sessionId !== input.session.id ||
    compileJob.artifactId !== input.manifest.artifactId
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_MISSING",
      "The frozen scientific compiler job is not verified for this artifact",
      409,
    );
  }
  const authority = await reconstructScientificCompileAuthority({
    store: input.store,
    job: compileJob,
    session: input.session,
    manifest: input.manifest,
    inputBundleKey: `runner-input/${compileJob.jobId}.json`,
    outputPrefix: `runner-authority/${compileJob.jobId}/compiler-output/`,
  });
  if (
    (await hashCanonical(authority.lineage)) !==
    (await hashCanonical(input.lineage))
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Frozen scientific compiler authority conflicts with the session lineage",
      409,
    );
  }
  return authority;
}

async function resolveRunnerPatchAuthorityV5(input: {
  store: RunnerObjectStore;
  jobs: RunnerJobService;
  job: RunnerJob;
  session: CounterLabSession;
  artifact: StoredArtifact;
  bundle: RunnerPatchCompileBundleV5;
}) {
  const evidenceAuthority = await resolveSessionEvidenceAuthority(
    input.session,
  ).catch((error: unknown) => {
    if (error instanceof SessionInputError) {
      throw new ApiInputError(
        "RUNNER_INPUT_LINEAGE_MISMATCH",
        "The v5 patch authority no longer matches the session evidence",
        409,
      );
    }
    throw error;
  });
  if (
    evidenceAuthority.protocol !== "v5" ||
    evidenceAuthority.verdict !== "SUPPORTS" ||
    input.session.transferResult?.outcome !== "PASSED"
  ) {
    throw new ApiInputError(
      "RUNNER_INPUT_LINEAGE_MISMATCH",
      "A supporting v5 verdict and passed transfer are required",
      409,
    );
  }
  const pack = getConceptPack(evidenceAuthority.concept);
  try {
    assertPassedTransferMatchesFixedPolicy(
      evidenceAuthority.concept,
      input.session.transferResult,
    );
  } catch {
    throw new ApiInputError(
      "RUNNER_INPUT_LINEAGE_MISMATCH",
      "The passed transfer does not match frozen Subject Pack semantics",
      409,
    );
  }
  const frozenCompile = await loadFrozenScientificCompileAuthority({
    store: input.store,
    jobs: input.jobs,
    session: input.session,
    manifest: input.artifact.manifest,
    lineage: evidenceAuthority.lineage,
  });
  const [
    bundleHash,
    manifestHash,
    bundledManifestHash,
    beliefSpecHash,
    bundledBeliefSpecHash,
    predictionHash,
    bundledPredictionHash,
    compileAuthorityHash,
    bundledCompileAuthorityHash,
    selectionHash,
    bundledSelectionHash,
    projectedPlanHash,
    bundledPlanHash,
    evidenceVerdictHash,
    bundledEvidenceVerdictHash,
    transferResultHash,
    bundledTransferResultHash,
    selectedTransferContractHash,
    expectedTransferContractHash,
    patchContractHash,
  ] = await Promise.all([
    hashCanonical(input.bundle),
    hashCanonical(input.artifact.manifest),
    hashCanonical(input.bundle.artifactManifest),
    hashCanonical(evidenceAuthority.beliefSpec),
    hashCanonical(input.bundle.approvedBeliefSpec),
    hashCanonical(evidenceAuthority.prediction),
    hashCanonical(input.bundle.prediction),
    hashCanonical(evidenceAuthority.lineage),
    hashCanonical(input.bundle.compileAuthority),
    hashCanonical(frozenCompile.outcome.selection),
    hashCanonical(input.bundle.fixedSelection),
    hashCanonical(frozenCompile.projectedPlan),
    hashCanonical(input.bundle.basePlan),
    hashCanonical(evidenceAuthority.evidenceVerdict),
    hashCanonical(input.bundle.releaseAuthority.evidenceVerdict),
    hashCanonical(input.session.transferResult),
    hashCanonical(input.bundle.transferResult),
    hashCanonical(frozenCompile.selectedExperimentIr.transfer),
    hashCanonical(pack.transferTask.experimentIrContract),
    hashCanonical({
      id: pack.patchContract.id,
      allowedTransformations: pack.patchContract.allowedTransformations,
      allowedCellIndices: input.bundle.allowedCellIndices,
    }),
  ]);
  const selectedExperimentIrHash = await hashExperimentIR(
    frozenCompile.selectedExperimentIr,
  );
  const expectedInputHashes = [
    manifestHash,
    beliefSpecHash,
    evidenceAuthority.prediction.immutableHash,
    selectedExperimentIrHash,
    selectionHash,
    projectedPlanHash,
    evidenceAuthority.result.resultHash,
    evidenceVerdictHash,
    evidenceAuthority.epistemicReportHash,
    input.session.transferResult.resultHash,
    patchContractHash,
    bundleHash,
  ];
  if (
    input.bundle.jobId !== input.job.jobId ||
    input.bundle.sessionId !== input.job.sessionId ||
    input.bundle.stateVersion !== input.job.stateVersion ||
    input.bundle.conceptPackVersion !== input.job.conceptPack.version ||
    input.job.conceptPack.id !== pack.id ||
    input.job.artifactManifestHash !== manifestHash ||
    bundledManifestHash !== manifestHash ||
    input.bundle.artifactManifestHash !== manifestHash ||
    input.bundle.beliefSpecHash !== beliefSpecHash ||
    bundledBeliefSpecHash !== beliefSpecHash ||
    bundledPredictionHash !== predictionHash ||
    bundledCompileAuthorityHash !== compileAuthorityHash ||
    bundledSelectionHash !== selectionHash ||
    bundledPlanHash !== projectedPlanHash ||
    bundledEvidenceVerdictHash !== evidenceVerdictHash ||
    input.bundle.releaseAuthority.evidenceVerdictHash !== evidenceVerdictHash ||
    input.bundle.releaseAuthority.epistemicReportHash !==
      evidenceAuthority.epistemicReportHash ||
    input.bundle.releaseAuthority.authoritativeResultHash !==
      evidenceAuthority.result.resultHash ||
    bundledTransferResultHash !== transferResultHash ||
    input.bundle.transferResult.resultHash !==
      input.session.transferResult.resultHash ||
    input.bundle.transferContractId !== pack.transferTask.id ||
    input.bundle.transferResult.taskId !== pack.transferTask.evaluatorTaskId ||
    selectedTransferContractHash !== expectedTransferContractHash ||
    input.bundle.patchContract.id !== pack.patchContract.id ||
    JSON.stringify(input.job.inputHashes) !==
      JSON.stringify(expectedInputHashes)
  ) {
    throw new ApiInputError(
      "RUNNER_INPUT_LINEAGE_MISMATCH",
      "The v5 patch input does not match frozen session authority",
      409,
    );
  }
  return { evidenceAuthority, frozenCompile, pack };
}

async function persistRunnerAuthorityBytes(input: {
  store: RunnerObjectStore;
  key: string;
  body: string;
  contentType: string;
}): Promise<string> {
  const expectedHash = await sha256Text(input.body);
  const existing = await input.store.get(input.key);
  if (
    existing !== undefined &&
    (await sha256Text(existing.body)) !== expectedHash
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_CONFLICT",
      "Frozen runner authority conflicts with the verified output bytes",
      409,
    );
  }
  if (existing === undefined) {
    await input.store.put(input.key, input.body, input.contentType);
  }
  const persisted = await input.store.get(input.key);
  if (
    persisted === undefined ||
    (await sha256Text(persisted.body)) !== expectedHash
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_MISSING",
      "Verified runner authority could not be frozen",
      409,
    );
  }
  return expectedHash;
}

async function persistScientificAuthority(
  store: RunnerObjectStore,
  key: string,
  value: unknown,
): Promise<string> {
  const expectedHash = await hashCanonical(value);
  const existing = await store.get(key);
  if (existing !== undefined) {
    try {
      const existingHash = await hashCanonical(JSON.parse(existing.body));
      if (existingHash !== expectedHash) {
        throw new ApiInputError(
          "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
          "Stored scientific result authority conflicts with fresh verification",
          409,
        );
      }
    } catch (error) {
      if (error instanceof ApiInputError) throw error;
      throw new ApiInputError(
        "SCIENTIFIC_AUTHORITY_INVALID",
        "Stored scientific result authority is invalid",
        409,
      );
    }
  } else {
    await store.put(key, JSON.stringify(value), "application/json");
  }
  const persisted = await store.get(key);
  if (persisted === undefined) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_MISSING",
      "Scientific result authority could not be persisted",
      409,
    );
  }
  try {
    if ((await hashCanonical(JSON.parse(persisted.body))) !== expectedHash) {
      throw new ApiInputError(
        "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
        "Persisted scientific result authority does not match fresh verification",
        409,
      );
    }
  } catch (error) {
    if (error instanceof ApiInputError) throw error;
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_INVALID",
      "Persisted scientific result authority is invalid",
      409,
    );
  }
  return expectedHash;
}

function registeredBoundarySweep(pack: ReturnType<typeof getConceptPack>) {
  const definition = pack.scientificMethod.boundaryMap;
  return {
    sweepId: definition.sweepId,
    axisIds: [definition.axes[0].id, definition.axes[1].id] as const,
    gridPresetId: definition.gridPresetId,
    observableId: definition.observableId,
    maxCells: definition.maxCells,
  };
}

async function boundaryMapExpectation(
  bundle: RunnerBoundaryMapBundleV5,
): Promise<BoundaryMapExpectationV1> {
  const pack = getConceptPack(bundle.selectedExperimentIr.concept);
  const definition = pack.scientificMethod.boundaryMap;
  const boundaryMapIdHash = await hashCanonical({
    concept: pack.id,
    experimentIrHash: bundle.selectedExperimentIrHash,
    sessionId: bundle.sessionId,
    sweepId: bundle.boundaryRequest.sweepId,
  });
  const axes = definition.axes.map((axis) => ({
    id: axis.id,
    label: axis.label,
    unit: axis.unit,
    points: axis.points.map((point) => ({
      id: point.id,
      label: point.label,
      value: point.outputValue,
    })),
  })) as BoundaryMapResultV1["axes"];
  return {
    boundaryMapId: `boundary_${boundaryMapIdHash.slice(0, 24)}`,
    sessionId: bundle.sessionId,
    concept: pack.id,
    conceptPackVersion: pack.version,
    artifactManifestHash: bundle.artifactManifestHash,
    experimentIrHash: bundle.selectedExperimentIrHash,
    authoritativeResultHash: bundle.releaseAuthority.authoritativeResultHash,
    evidenceVerdictHash: bundle.releaseAuthority.evidenceVerdictHash,
    sweepId: definition.sweepId,
    gridPresetId: definition.gridPresetId,
    seed: definition.seed,
    kernelVersion: pack.fixedResultAuthority.kernelVersion,
    axes,
    classifications: definition.classifications.map((classification) => ({
      ...classification,
    })),
    units: { ...definition.units },
    assumptions: [...definition.assumptions],
    nonClaims: [...definition.nonClaims],
    cellCount: axes[0].points.length * axes[1].points.length,
  };
}

async function reconstructBoundaryMapAuthority(input: {
  store: RunnerObjectStore;
  jobs: RunnerJobService;
  job: RunnerJob;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  inputBundleKey: string;
  outputPrefix: string;
  callbackOutputHashes: readonly string[];
  issuedAt: string;
  signingKey?: string;
  signingKeyId?: string;
}): Promise<{
  bundle: RunnerBoundaryMapBundleV5;
  result: BoundaryMapResultV1 | null;
  report: BoundaryMapVerificationReportV1;
  authority: BoundaryMapAuthorityRefV1 | null;
  rawResultHash: string;
}> {
  const authorityPrefix = `runner-authority/${input.job.jobId}/`;
  const frozenResultKey = `${authorityPrefix}boundary-map.json`;
  const [inputObject, mutableResultObject, frozenResultObject] =
    await Promise.all([
      input.store.get(input.inputBundleKey),
      input.store.get(`${input.outputPrefix}boundary-map.json`),
      input.store.get(frozenResultKey),
    ]);
  const resultObject = frozenResultObject ?? mutableResultObject;
  if (inputObject === undefined || resultObject === undefined) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_MISSING",
      "Required Boundary Map input or fixed-kernel output is missing",
      409,
    );
  }

  let bundle: RunnerBoundaryMapBundleV5;
  let rawResult: unknown;
  try {
    bundle = RunnerBoundaryMapBundleV5Schema.parse(
      JSON.parse(inputObject.body),
    );
    rawResult = JSON.parse(resultObject.body) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new ApiInputError(
        "BOUNDARY_CONTRACT_REJECTED",
        "The Boundary Map input or output failed strict validation",
        409,
      );
    }
    throw error;
  }

  const rawResultHash = await sha256Text(resultObject.body);
  if (
    input.callbackOutputHashes.length !== 1 ||
    input.callbackOutputHashes[0] !== rawResultHash
  ) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_HASH_MISMATCH",
      "Boundary Map bytes do not exactly match the terminal callback",
      409,
    );
  }
  await persistRunnerAuthorityBytes({
    store: input.store,
    key: frozenResultKey,
    body: resultObject.body,
    contentType: "application/json",
  });

  const evidenceAuthority = await resolveSessionEvidenceAuthority(
    input.session,
  ).catch(() => {
    throw new ApiInputError(
      "EVIDENCE_AUTHORITY_REQUIRED",
      "Released v5 evidence is required before a Boundary Map",
      409,
    );
  });
  if (
    evidenceAuthority.protocol !== "v5" ||
    evidenceAuthority.verdict === "REJECTED"
  ) {
    throw new ApiInputError(
      "EVIDENCE_AUTHORITY_REQUIRED",
      "A rejected experiment cannot authorize a Boundary Map",
      409,
    );
  }
  const lineage = HostedExperimentLineageV5Schema.parse(
    input.session.labVerification,
  );
  const frozenCompile = await loadFrozenScientificCompileAuthority({
    store: input.store,
    jobs: input.jobs,
    session: input.session,
    manifest: input.manifest,
    lineage,
  });
  const pack = getConceptPack(evidenceAuthority.concept);
  const boundaryDefinition = pack.scientificMethod.boundaryMap;
  const expected = await boundaryMapExpectation(bundle);
  const [
    bundleHash,
    manifestHash,
    selectedExperimentIrHash,
    evidenceVerdictHash,
    boundaryExpectationHash,
  ] = await Promise.all([
    hashCanonical(bundle),
    hashCanonical(input.manifest),
    hashExperimentIR(bundle.selectedExperimentIr),
    hashCanonical(evidenceAuthority.evidenceVerdict),
    hashCanonical(expected),
  ]);
  const expectedInputHashes = [
    manifestHash,
    selectedExperimentIrHash,
    evidenceAuthority.result.resultHash,
    evidenceVerdictHash,
    evidenceAuthority.epistemicReportHash,
    boundaryExpectationHash,
    bundleHash,
  ];
  const registeredRequest = {
    sweepId: boundaryDefinition.sweepId,
    axisIds: boundaryDefinition.axes.map((axis) => axis.id),
    gridPresetId: boundaryDefinition.gridPresetId,
    observableId: boundaryDefinition.observableId,
    maxCells: boundaryDefinition.maxCells,
  };
  if (
    input.job.kind !== "LAB_RUN" ||
    input.job.requestIdentity?.purpose !== "LAB_RUN_BOUNDARY" ||
    bundle.jobId !== input.job.jobId ||
    bundle.sessionId !== input.job.sessionId ||
    bundle.stateVersion !== input.job.stateVersion ||
    bundle.artifactManifestHash !== input.job.artifactManifestHash ||
    input.session.id !== input.job.sessionId ||
    input.session.mode.kind !== "live_notebook" ||
    manifestHash !== input.job.artifactManifestHash ||
    input.job.conceptPack.id !== pack.id ||
    input.job.conceptPack.version !== pack.version ||
    bundle.conceptPackVersion !== pack.version ||
    JSON.stringify(bundle.fixture) !== JSON.stringify(pack.fixedFixture) ||
    JSON.stringify(bundle.boundaryRequest) !==
      JSON.stringify(registeredRequest) ||
    bundle.seed !== boundaryDefinition.seed ||
    JSON.stringify(input.job.inputHashes) !==
      JSON.stringify(expectedInputHashes) ||
    selectedExperimentIrHash !== lineage.selectedExperimentIrHash ||
    selectedExperimentIrHash !== bundle.selectedExperimentIrHash ||
    (await hashExperimentIR(frozenCompile.selectedExperimentIr)) !==
      selectedExperimentIrHash ||
    bundle.releaseAuthority.authoritativeResultHash !==
      evidenceAuthority.result.resultHash ||
    bundle.releaseAuthority.evidenceVerdictHash !== evidenceVerdictHash ||
    (await hashCanonical(bundle.releaseAuthority.evidenceVerdict)) !==
      evidenceVerdictHash ||
    bundle.releaseAuthority.epistemicReportHash !==
      evidenceAuthority.epistemicReportHash
  ) {
    throw new ApiInputError(
      "BOUNDARY_AUTHORITY_LINEAGE_MISMATCH",
      "Boundary Map lineage does not match the frozen experiment and Subject Pack authority",
      409,
    );
  }

  const report = verifyBoundaryMap(rawResult, expected);
  await persistScientificAuthority(
    input.store,
    `${authorityPrefix}boundary-map-expectation.json`,
    expected,
  );
  await persistScientificAuthority(
    input.store,
    `${authorityPrefix}boundary-map-verification.json`,
    report,
  );
  if (report.status !== "VERIFIED") {
    return {
      bundle,
      result: null,
      report,
      authority: null,
      rawResultHash,
    };
  }

  const result = BoundaryMapResultV1Schema.parse(rawResult);
  const receiptKey = `${authorityPrefix}boundary-map-receipt.json`;
  const existingReceiptObject = await input.store.get(receiptKey);
  let issuedAt = input.issuedAt;
  if (existingReceiptObject !== undefined) {
    try {
      issuedAt = BoundaryMapAuthorityRefV1Schema.parse(
        JSON.parse(existingReceiptObject.body),
      ).receipt.issuedAt;
    } catch (error) {
      if (error instanceof SyntaxError || error instanceof ZodError) {
        throw new ApiInputError(
          "BOUNDARY_AUTHORITY_INVALID",
          "The frozen Boundary Map receipt failed strict validation",
          409,
        );
      }
      throw error;
    }
  }
  const authority = issueBoundaryMapAuthority({
    jobId: input.job.jobId,
    result,
    report,
    expected,
    issuedAt,
    ...(input.signingKey === undefined
      ? {}
      : {
          signing: {
            keyId: input.signingKeyId ?? "counterlab-boundary-v1",
            signingKey: input.signingKey,
          },
        }),
  });
  validateBoundaryMapAuthority(authority, {
    result,
    report,
    expected,
    ...(input.signingKey === undefined
      ? {}
      : {
          signingKey: input.signingKey,
          expectedKeyId: input.signingKeyId ?? "counterlab-boundary-v1",
        }),
  });
  await persistScientificAuthority(input.store, receiptKey, authority);
  return { bundle, result, report, authority, rawResultHash };
}

async function reconstructScientificRunAuthority(input: {
  store: RunnerObjectStore;
  jobs: RunnerJobService;
  job: RunnerJob;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  inputBundleKey: string;
  outputPrefix: string;
  callbackOutputHashes: readonly string[];
}) {
  const frozenResultKey = `runner-authority/${input.job.jobId}/verified-result.json`;
  const [inputObject, mutableResultObject, frozenResultObject] =
    await Promise.all([
      input.store.get(input.inputBundleKey),
      input.store.get(`${input.outputPrefix}verified-result.json`),
      input.store.get(frozenResultKey),
    ]);
  const resultObject = frozenResultObject ?? mutableResultObject;
  if (inputObject === undefined || resultObject === undefined) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_MISSING",
      "Required scientific run input or fixed-kernel result is missing",
      409,
    );
  }

  let bundle: z.infer<typeof RunnerLabRunBundleV5Schema>;
  let result: z.infer<typeof HostedVerifiedResultSetV2Schema>;
  try {
    bundle = RunnerLabRunBundleV5Schema.parse(JSON.parse(inputObject.body));
    result = HostedVerifiedResultSetV2Schema.parse(
      JSON.parse(resultObject.body),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new ApiInputError(
        "RESULT_CONTRACT_REJECTED",
        "The scientific fixed-kernel result authority failed strict validation",
        409,
      );
    }
    throw error;
  }

  const rawResultHash = await sha256Text(resultObject.body);
  if (
    input.callbackOutputHashes.length !== 1 ||
    input.callbackOutputHashes[0] !== rawResultHash
  ) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_HASH_MISMATCH",
      "Scientific fixed-kernel bytes do not exactly match the terminal callback",
      409,
    );
  }
  if (frozenResultObject === undefined) {
    await input.store.put(
      frozenResultKey,
      resultObject.body,
      "application/json",
    );
  }
  const persistedResult = await input.store.get(frozenResultKey);
  if (
    persistedResult === undefined ||
    (await sha256Text(persistedResult.body)) !== rawResultHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Frozen scientific result bytes do not match the terminal callback",
      409,
    );
  }

  const [bundleHash, manifestHash, bundledManifestHash] = await Promise.all([
    hashCanonical(bundle),
    hashCanonical(input.manifest),
    hashCanonical(bundle.artifactManifest),
  ]);
  const expectedJobInputHashes = [
    ...Object.values(bundle.expectedHashes),
    bundleHash,
  ];
  if (
    input.job.kind !== "LAB_RUN" ||
    bundle.jobId !== input.job.jobId ||
    bundle.sessionId !== input.job.sessionId ||
    bundle.stateVersion !== input.job.stateVersion ||
    bundle.artifactManifestHash !== input.job.artifactManifestHash ||
    input.session.id !== input.job.sessionId ||
    input.session.mode.kind !== "live_notebook" ||
    input.session.beliefSpec === undefined ||
    input.session.prediction === undefined ||
    input.session.beliefTest !== undefined ||
    manifestHash !== input.job.artifactManifestHash ||
    bundledManifestHash !== manifestHash ||
    JSON.stringify(input.job.inputHashes) !==
      JSON.stringify(expectedJobInputHashes)
  ) {
    throw new ApiInputError(
      "RUNNER_INPUT_LINEAGE_MISMATCH",
      "Scientific fixed-run lineage does not match the live session and runner job",
      409,
    );
  }

  const { immutableHash: _bundleImmutableHash, ...bundlePredictionBase } =
    bundle.prediction;
  const [
    beliefSpecHash,
    bundledBeliefSpecHash,
    predictionHash,
    predictionBaseHash,
  ] = await Promise.all([
    hashCanonical(input.session.beliefSpec),
    hashCanonical(bundle.approvedBeliefSpec),
    hashCanonical(input.session.prediction),
    hashCanonical(bundlePredictionBase),
  ]);
  if (
    beliefSpecHash !== bundle.beliefSpecHash ||
    bundledBeliefSpecHash !== beliefSpecHash ||
    predictionHash !== (await hashCanonical(bundle.prediction)) ||
    predictionBaseHash !== bundle.prediction.immutableHash ||
    input.session.prediction.immutableHash !==
      bundle.prediction.immutableHash ||
    bundle.expectedHashes.artifactManifest !== manifestHash ||
    bundle.expectedHashes.beliefSpec !== beliefSpecHash ||
    bundle.expectedHashes.prediction !== bundle.prediction.immutableHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_LINEAGE_MISMATCH",
      "Current belief, prediction, or artifact authority does not match the scientific run",
      409,
    );
  }

  const pack = getConceptPack(bundle.approvedBeliefSpec.concept);
  const fixtureDescriptorHash = await hashCanonical(pack.fixedFixture);
  if (
    input.job.conceptPack.id !== pack.id ||
    input.job.conceptPack.version !== pack.version ||
    bundle.selectedExperimentIr.conceptPackVersion !== pack.version ||
    JSON.stringify(bundle.fixture) !== JSON.stringify(pack.fixedFixture) ||
    bundle.expectedHashes.fixtureDescriptor !== fixtureDescriptorHash ||
    result.fixture.sha256 !== pack.fixedFixture.contentSha256
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_LINEAGE_MISMATCH",
      "The scientific run does not match the registered Subject Pack fixture",
      409,
    );
  }

  const compileJob = await input.jobs.getJob(bundle.provenance.compileJobId);
  if (
    compileJob.status !== "VERIFIED" ||
    compileJob.sessionId !== input.job.sessionId ||
    compileJob.artifactId !== input.job.artifactId
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_MISSING",
      "The referenced scientific compiler job is not verified",
      409,
    );
  }
  const compileAuthority = await reconstructScientificCompileAuthority({
    store: input.store,
    job: compileJob,
    session: input.session,
    manifest: input.manifest,
    inputBundleKey: `runner-input/${compileJob.jobId}.json`,
    outputPrefix: `runner-output/${compileJob.jobId}/`,
  });
  const sessionLineage = HostedExperimentLineageV5Schema.safeParse(
    input.session.labVerification,
  );
  const expectedHashes = {
    artifactManifest: compileAuthority.lineage.artifactManifestHash,
    beliefSpec: compileAuthority.lineage.beliefSpecHash,
    prediction: compileAuthority.lineage.predictionHash,
    fixtureDescriptor: fixtureDescriptorHash,
    compileInputBundle: compileAuthority.lineage.inputBundleHash,
    rawExperimentIrFile:
      compileAuthority.lineage.compilerOutputFileHashes["experiment-ir.json"],
    rawExperimentIrCanonical:
      compileAuthority.lineage.rawExperimentIrCanonicalHash,
    candidateVerificationReport:
      compileAuthority.lineage.candidateVerificationReportHash,
    experimentSelection: compileAuthority.lineage.selectionHash,
    selectedExperimentIr: compileAuthority.lineage.selectedExperimentIrHash,
    projectedPlan: compileAuthority.lineage.projectedPlanHash,
  };
  const [selectedIrHash, selectionHash, projectedPlanHash] = await Promise.all([
    hashExperimentIR(bundle.selectedExperimentIr),
    hashCanonical(bundle.fixedSelection),
    hashCanonical(bundle.projectedPlan),
  ]);
  if (
    !sessionLineage.success ||
    (await hashCanonical(sessionLineage.data)) !==
      (await hashCanonical(compileAuthority.lineage)) ||
    JSON.stringify(bundle.expectedHashes) !== JSON.stringify(expectedHashes) ||
    JSON.stringify(bundle.provenance.compilerOutputFileHashes) !==
      JSON.stringify(compileAuthority.compilerOutputFileHashes) ||
    bundle.provenance.compileJobId !== compileJob.jobId ||
    bundle.provenance.compileInputBundleHash !==
      compileAuthority.lineage.inputBundleHash ||
    bundle.provenance.rawExperimentIrCanonicalHash !==
      compileAuthority.lineage.rawExperimentIrCanonicalHash ||
    bundle.provenance.candidateVerificationReportHash !==
      compileAuthority.lineage.candidateVerificationReportHash ||
    bundle.provenance.scientificVerifierVersion !==
      compileAuthority.lineage.scientificVerifierVersion ||
    bundle.provenance.scorerVersion !==
      compileAuthority.lineage.scorerVersion ||
    bundle.provenance.projectionAdapterVersion !==
      compileAuthority.lineage.projectionAdapterVersion ||
    selectedIrHash !== expectedHashes.selectedExperimentIr ||
    selectionHash !== expectedHashes.experimentSelection ||
    projectedPlanHash !== expectedHashes.projectedPlan ||
    (await hashCanonical(compileAuthority.outcome.selection)) !==
      selectionHash ||
    (await hashExperimentIR(compileAuthority.selectedExperimentIr)) !==
      selectedIrHash ||
    (await hashCanonical(compileAuthority.projectedPlan)) !== projectedPlanHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Scientific compile authority does not match the fixed-run bundle",
      409,
    );
  }

  const report = EpistemicVerificationReportV1Schema.parse(
    await verifyEpistemicEvidence({
      artifactManifest: input.manifest,
      sessionId: input.session.id,
      beliefSpec: input.session.beliefSpec,
      ir: bundle.selectedExperimentIr,
      result,
      presentation: pack.scientificMethod.defaultPresentation,
    }),
  );
  const authorityPrefix = `runner-authority/${input.job.jobId}/`;
  const technicalReportHash = await persistScientificAuthority(
    input.store,
    `${authorityPrefix}technical-verification.json`,
    report.technicalReport,
  );
  const epistemicReportHash = await persistScientificAuthority(
    input.store,
    `${authorityPrefix}epistemic-verification.json`,
    report,
  );
  const evidenceVerdictHash = await persistScientificAuthority(
    input.store,
    `${authorityPrefix}evidence-verdict.json`,
    report.verdict,
  );
  if (technicalReportHash !== report.technicalReportHash) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Epistemic report does not match its technical authority",
      409,
    );
  }
  return {
    bundle,
    result,
    rawResultHash,
    report,
    epistemicReportHash,
    evidenceVerdictHash,
  };
}

const PROOF_CAPSULE_MEDIA_TYPE =
  "application/vnd.counterlab.capsule+json" as const;

type LoadedNativeProofAuthorityV5 = {
  artifacts: NativeProofArtifactsV5;
  compilerEvents: PublicCompilerEvent[];
};

async function requireFrozenAuthorityObject(
  store: RunnerObjectStore,
  key: string,
  label: string,
): Promise<{ body: string; contentType: string }> {
  const object = await store.get(key);
  if (object === undefined) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISSING",
      `Immutable ${label} authority is missing`,
      409,
    );
  }
  return object;
}

function parseFrozenAuthorityJson(
  object: { body: string },
  label: string,
): unknown {
  try {
    return JSON.parse(object.body) as unknown;
  } catch {
    throw new ApiInputError(
      "PROOF_AUTHORITY_INVALID",
      `Immutable ${label} authority is not valid JSON`,
      409,
    );
  }
}

async function requireAuthorityHash(
  label: string,
  actual: string,
  expected: string,
): Promise<void> {
  if (actual !== expected) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISMATCH",
      `Immutable ${label} authority does not match the released session`,
      409,
    );
  }
}

function configuredSigningKey(input: {
  signingKey?: string;
  signingKeyId?: string;
}): { signingKey: string; keyId: string } | undefined {
  const signingKey = input.signingKey;
  if (signingKey === undefined || signingKey.trim().length === 0) {
    return undefined;
  }
  const configuredKeyId = input.signingKeyId?.trim();
  return {
    signingKey,
    keyId:
      configuredKeyId === undefined || configuredKeyId.length === 0
        ? "counterlab-capsule-v2"
        : configuredKeyId,
  };
}

async function loadNativeProofAuthorityV5(input: {
  store: RunnerObjectStore;
  jobs: RunnerJobService;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  signingKey?: string;
  signingKeyId?: string;
}): Promise<LoadedNativeProofAuthorityV5> {
  if (
    input.session.mode.kind !== "live_notebook" ||
    input.session.resultAuthority === undefined ||
    input.session.boundaryMapAuthority === undefined ||
    input.session.patchAuthority === undefined
  ) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISSING",
      "Native proof authority requires a live v5 result, Boundary Map, and patch",
      409,
    );
  }
  const lineage = HostedExperimentLineageV5Schema.parse(
    input.session.labVerification,
  );
  const resultRef = input.session.resultAuthority;
  const boundaryRef = BoundaryMapAuthorityRefV1Schema.parse(
    input.session.boundaryMapAuthority,
  );
  const patchRef = input.session.patchAuthority;
  const manifestHash = await hashCanonical(input.manifest);
  await requireAuthorityHash(
    "Artifact Manifest",
    manifestHash,
    lineage.artifactManifestHash,
  );

  const jobSpecifications = [
    {
      jobId: lineage.jobId,
      kind: "LAB_COMPILE" as const,
      purpose: "LAB_COMPILE",
    },
    {
      jobId: resultRef.jobId,
      kind: "LAB_RUN" as const,
      purpose: "LAB_RUN_AUTHORITATIVE",
    },
    {
      jobId: boundaryRef.jobId,
      kind: "LAB_RUN" as const,
      purpose: "LAB_RUN_BOUNDARY",
    },
    {
      jobId: patchRef.jobId,
      kind: "PATCH_COMPILE" as const,
      purpose: "PATCH_COMPILE",
    },
  ];
  const authorityJobs = await Promise.all(
    jobSpecifications.map(async (specification) => {
      const job = await input.jobs.getJob(specification.jobId);
      if (
        job.status !== "VERIFIED" ||
        job.kind !== specification.kind ||
        job.requestIdentity?.purpose !== specification.purpose ||
        job.sessionId !== input.session.id ||
        job.artifactId !== input.manifest.artifactId ||
        job.artifactManifestHash !== manifestHash ||
        job.conceptPack.id !== input.session.verifiedResult?.concept ||
        job.eventCursor < 1
      ) {
        throw new ApiInputError(
          "PROOF_AUTHORITY_MISMATCH",
          `Verified ${specification.purpose} job does not match the released session`,
          409,
        );
      }
      const events = await input.jobs.listEvents(job.jobId, 0);
      if (
        events.length !== job.eventCursor ||
        events.at(-1)?.cursor !== job.eventCursor
      ) {
        throw new ApiInputError(
          "PROOF_EVENT_STREAM_INCOMPLETE",
          `Public ${specification.purpose} event history is incomplete`,
          409,
        );
      }
      return { job, events };
    }),
  );
  const [compileAuthorityJob, runAuthorityJob, boundaryAuthorityJob, patchJob] =
    authorityJobs;
  if (
    compileAuthorityJob === undefined ||
    runAuthorityJob === undefined ||
    boundaryAuthorityJob === undefined ||
    patchJob === undefined
  ) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISSING",
      "The native proof job set is incomplete",
      409,
    );
  }

  const frozenCompile = await loadFrozenScientificCompileAuthority({
    store: input.store,
    jobs: input.jobs,
    session: input.session,
    manifest: input.manifest,
    lineage,
  });
  const runAuthority = await reconstructScientificRunAuthority({
    store: input.store,
    jobs: input.jobs,
    job: runAuthorityJob.job,
    session: input.session,
    manifest: input.manifest,
    inputBundleKey: `runner-input/${runAuthorityJob.job.jobId}.json`,
    outputPrefix: `runner-authority/${runAuthorityJob.job.jobId}/`,
    callbackOutputHashes: runAuthorityJob.job.outputHashes,
  });
  if (
    (await hashCanonical(runAuthority.result)) !==
      (await hashCanonical(input.session.verifiedResult)) ||
    runAuthority.result.resultHash !== resultRef.resultHash ||
    runAuthority.rawResultHash !== resultRef.resultFileHash ||
    runAuthority.epistemicReportHash !== resultRef.epistemicReportHash ||
    runAuthority.evidenceVerdictHash !== resultRef.evidenceVerdictHash ||
    runAuthority.report.technicalReportHash !== resultRef.technicalReportHash
  ) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISMATCH",
      "Immutable fixed-result authority does not match the released session",
      409,
    );
  }

  const boundaryIntegrity = boundaryRef.receipt.integrity;
  const currentSigning = configuredSigningKey(input);
  if (
    boundaryIntegrity.mode === "hmac-signed" &&
    currentSigning === undefined
  ) {
    throw new ApiInputError(
      "PROOF_SIGNING_KEY_REQUIRED",
      "The signing key for the released Boundary Map is unavailable",
      503,
    );
  }
  const boundaryAuthority = await reconstructBoundaryMapAuthority({
    store: input.store,
    jobs: input.jobs,
    job: boundaryAuthorityJob.job,
    session: input.session,
    manifest: input.manifest,
    inputBundleKey: `runner-input/${boundaryAuthorityJob.job.jobId}.json`,
    outputPrefix: `runner-authority/${boundaryAuthorityJob.job.jobId}/`,
    callbackOutputHashes: boundaryAuthorityJob.job.outputHashes,
    issuedAt: boundaryRef.receipt.issuedAt,
    ...(boundaryIntegrity.mode === "hmac-signed" && currentSigning !== undefined
      ? {
          signingKey: currentSigning.signingKey,
          signingKeyId: boundaryIntegrity.keyId,
        }
      : {}),
  });
  if (
    boundaryAuthority.authority === null ||
    boundaryAuthority.result === null ||
    boundaryAuthority.report.status !== "VERIFIED" ||
    (await hashCanonical(boundaryAuthority.authority)) !==
      (await hashCanonical(boundaryRef))
  ) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISMATCH",
      "Immutable Boundary Map authority does not match the released session",
      409,
    );
  }

  const patchPrefix = `runner-authority/${patchJob.job.jobId}/`;
  const [
    patchBundleObject,
    patchPlanObject,
    patchRationaleObject,
    patchVerificationObject,
    patchResultObject,
    patchedNotebookObject,
  ] = await Promise.all([
    requireFrozenAuthorityObject(
      input.store,
      `runner-input/${patchJob.job.jobId}.json`,
      "Patch input",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${patchPrefix}patch-plan.json`,
      "Patch Plan",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${patchPrefix}public-rationale.md`,
      "Patch rationale",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${patchPrefix}patch-plan-verification.json`,
      "Patch Plan verifier",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${patchPrefix}patch-result.json`,
      "Patch Result",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${patchPrefix}patched-notebook.ipynb`,
      "patched notebook",
    ),
  ]);
  const patchBundle = RunnerPatchCompileBundleV5Schema.parse(
    parseFrozenAuthorityJson(patchBundleObject, "Patch input"),
  );
  const patchPlan = PatchPlanV1Schema.parse(
    parseFrozenAuthorityJson(patchPlanObject, "Patch Plan"),
  );
  const patchResultFromStore = PatchResultSchema.parse(
    parseFrozenAuthorityJson(patchResultObject, "Patch Result"),
  );
  const patchAuthority = await resolveRunnerPatchAuthorityV5({
    store: input.store,
    jobs: input.jobs,
    job: patchJob.job,
    session: input.session,
    artifact: { manifest: input.manifest },
    bundle: patchBundle,
  });
  const freshPatchVerification = await verifyPatchPlan(patchPlan, {
    sessionId: input.session.id,
    manifest: input.manifest,
    beliefSpec: patchAuthority.evidenceAuthority.beliefSpec,
    verifiedResultHash: patchAuthority.evidenceAuthority.result.resultHash,
    transferResultHash: patchBundle.transferResult.resultHash,
    conceptPackVersion: patchJob.job.conceptPack.version,
    allowedTransformations: patchBundle.patchContract.allowedTransformations,
    allowedCellIndices: patchBundle.allowedCellIndices,
  });
  const storedPatchVerification = parseFrozenAuthorityJson(
    patchVerificationObject,
    "Patch Plan verifier",
  );
  if (
    (await sha256Text(patchPlanObject.body)) !== patchRef.patchPlanFileHash ||
    (await sha256Text(patchRationaleObject.body)) !==
      patchRef.rationaleFileHash ||
    (await sha256Text(patchResultObject.body)) !==
      patchRef.patchResultFileHash ||
    (await sha256Text(patchedNotebookObject.body)) !==
      patchRef.patchedArtifactHash ||
    (await hashCanonical(patchPlan)) !== patchRef.patchPlanHash ||
    (await hashCanonical(freshPatchVerification)) !==
      patchRef.patchPlanVerificationHash ||
    (await hashCanonical(storedPatchVerification)) !==
      patchRef.patchPlanVerificationHash ||
    patchResultFromStore.resultHash !== patchRef.patchResultHash ||
    (await hashCanonical(patchResultFromStore)) !==
      (await hashCanonical(input.session.patchResult))
  ) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISMATCH",
      "Immutable patch authority does not match the released session",
      409,
    );
  }

  const compilePrefix = `runner-authority/${compileAuthorityJob.job.jobId}/`;
  const runPrefix = `runner-authority/${runAuthorityJob.job.jobId}/`;
  const [
    discriminationContractObject,
    candidateVerificationObject,
    experimentSelectionObject,
    selectedExperimentIrObject,
    technicalVerificationObject,
    epistemicVerificationObject,
    evidenceVerdictObject,
  ] = await Promise.all([
    requireFrozenAuthorityObject(
      input.store,
      `${compilePrefix}compiler-output/discrimination-contract.json`,
      "Discrimination Contract",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${compilePrefix}candidate-verification.json`,
      "candidate verifier",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${compilePrefix}experiment-selection.json`,
      "fixed experiment selection",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${compilePrefix}selected-experiment-ir.json`,
      "selected Experiment IR",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${runPrefix}technical-verification.json`,
      "technical verifier",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${runPrefix}epistemic-verification.json`,
      "epistemic verifier",
    ),
    requireFrozenAuthorityObject(
      input.store,
      `${runPrefix}evidence-verdict.json`,
      "Evidence Verdict",
    ),
  ]);
  const discriminationContract = parseFrozenAuthorityJson(
    discriminationContractObject,
    "Discrimination Contract",
  );
  const candidateVerification = parseFrozenAuthorityJson(
    candidateVerificationObject,
    "candidate verifier",
  );
  const experimentSelection = parseFrozenAuthorityJson(
    experimentSelectionObject,
    "fixed experiment selection",
  );
  const selectedExperimentIr = parseFrozenAuthorityJson(
    selectedExperimentIrObject,
    "selected Experiment IR",
  );
  const technicalVerification = parseFrozenAuthorityJson(
    technicalVerificationObject,
    "technical verifier",
  );
  const epistemicVerification = parseFrozenAuthorityJson(
    epistemicVerificationObject,
    "epistemic verifier",
  );
  const evidenceVerdict = parseFrozenAuthorityJson(
    evidenceVerdictObject,
    "Evidence Verdict",
  );
  if (
    (await sha256Text(discriminationContractObject.body)) !==
      lineage.compilerOutputFileHashes["discrimination-contract.json"] ||
    (await hashCanonical(discriminationContract)) !==
      lineage.discriminationContractHash ||
    (await hashCanonical(candidateVerification)) !==
      lineage.candidateVerificationReportHash ||
    (await hashCanonical(experimentSelection)) !== lineage.selectionHash ||
    (await hashExperimentIR(
      ExperimentIRV5Schema.parse(selectedExperimentIr),
    )) !== lineage.selectedExperimentIrHash ||
    (await hashCanonical(frozenCompile.outcome.selection)) !==
      lineage.selectionHash ||
    (await hashCanonical(technicalVerification)) !==
      resultRef.technicalReportHash ||
    (await hashCanonical(epistemicVerification)) !==
      resultRef.epistemicReportHash ||
    (await hashCanonical(evidenceVerdict)) !== resultRef.evidenceVerdictHash
  ) {
    throw new ApiInputError(
      "PROOF_AUTHORITY_MISMATCH",
      "Immutable experiment authority does not match the released session",
      409,
    );
  }

  return {
    artifacts: {
      experimentSelection,
      discriminationContract,
      selectedExperimentIr,
      candidateVerification,
      technicalVerification,
      epistemicVerification,
      evidenceVerdict,
      boundaryMap: boundaryAuthority.result,
      boundaryVerification: boundaryAuthority.report,
      patchPlan,
      patchPlanVerification: storedPatchVerification,
      patchedNotebook: patchedNotebookObject.body,
    },
    compilerEvents: authorityJobs.flatMap(({ events }) => events),
  };
}

async function validatePersistedNativeProofCapsule(input: {
  body: string;
  contentType: string;
  expectedReference: NonNullable<CounterLabSession["proofCapsule"]>;
  signingKey?: string;
  signingKeyId?: string;
}) {
  if (input.contentType !== PROOF_CAPSULE_MEDIA_TYPE) {
    throw new ApiInputError(
      "PROOF_CAPSULE_INVALID",
      "Persisted Proof Capsule media type is invalid",
      409,
    );
  }
  const currentSigning = configuredSigningKey(input);
  if (
    input.expectedReference.integrity.mode === "hmac-signed" &&
    currentSigning === undefined
  ) {
    throw new ApiInputError(
      "PROOF_SIGNING_KEY_REQUIRED",
      "The signing key for this Proof Capsule is unavailable",
      503,
    );
  }
  try {
    const validated = validateProofCapsuleV2(
      new TextEncoder().encode(input.body),
      {
        expectedIntegrityMode: input.expectedReference.integrity.mode,
        ...(input.expectedReference.integrity.mode === "hmac-signed" &&
        currentSigning !== undefined
          ? {
              signingKeys: {
                [input.expectedReference.integrity.keyId]:
                  currentSigning.signingKey,
              },
            }
          : {}),
      },
    );
    if (
      (await hashCanonical(validated.reference)) !==
      (await hashCanonical(input.expectedReference))
    ) {
      throw new Error("Proof Capsule reference mismatch");
    }
    const boundaryIntegrity =
      validated.manifest.authority.boundary.receipt.integrity;
    if (
      boundaryIntegrity.mode === "hmac-signed" &&
      currentSigning === undefined
    ) {
      throw new ApiInputError(
        "PROOF_SIGNING_KEY_REQUIRED",
        "The signing key for the Capsule Boundary Map is unavailable",
        503,
      );
    }
    await validateProofCapsulePayloadAuthorityV2(validated, {
      ...(boundaryIntegrity.mode === "hmac-signed" &&
      currentSigning !== undefined
        ? {
            boundarySigningKeys: {
              [boundaryIntegrity.keyId]: currentSigning.signingKey,
            },
          }
        : {}),
    });
    return validated;
  } catch (error) {
    if (error instanceof ApiInputError) throw error;
    throw new ApiInputError(
      "PROOF_CAPSULE_INVALID",
      "Persisted Proof Capsule failed integrity or evidence-authority validation",
      409,
    );
  }
}

async function finalizeNativeProofV5(input: {
  service: SessionService;
  jobs: RunnerJobService;
  store: RunnerObjectStore;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  signingKey?: string;
  signingKeyId?: string;
}): Promise<CounterLabSession> {
  let session = await input.service.getSession(input.session.id);
  if (
    session.state !== "PATCH_VERIFIED" &&
    session.state !== "REASONING_DIFF_ISSUED" &&
    session.state !== "PROOF_CAPSULE_ISSUED"
  ) {
    throw new ApiInputError(
      "PROOF_STATE_INVALID",
      "Native proof can be issued only after a verified patch",
      409,
    );
  }
  const authority = await loadNativeProofAuthorityV5({
    store: input.store,
    jobs: input.jobs,
    session,
    manifest: input.manifest,
    ...(input.signingKey === undefined ? {} : { signingKey: input.signingKey }),
    ...(input.signingKeyId === undefined
      ? {}
      : { signingKeyId: input.signingKeyId }),
  });

  if (session.state === "PATCH_VERIFIED") {
    const reasoningDiff = await createNativeReasoningDiffV2({
      session,
      events: await input.service.listEvents(session.id),
      boundaryMap: authority.artifacts.boundaryMap,
      patchPlan: authority.artifacts.patchPlan,
    });
    try {
      session = await input.service.issueReasoningDiffV2(
        session.id,
        reasoningDiff,
      );
    } catch (error) {
      session = await input.service.getSession(session.id);
      if (
        (session.state !== "REASONING_DIFF_ISSUED" &&
          session.state !== "PROOF_CAPSULE_ISSUED") ||
        session.reasoningDiffV2 === undefined ||
        (await hashCanonical(session.reasoningDiffV2)) !==
          (await hashCanonical(reasoningDiff))
      ) {
        throw error;
      }
    }
  }

  if (session.state === "REASONING_DIFF_ISSUED") {
    const capsuleSigning = configuredSigningKey(input);
    const capsule = await createNativeProofCapsuleV2({
      session,
      manifest: input.manifest,
      events: await input.service.listEvents(session.id),
      compilerEvents: authority.compilerEvents,
      artifacts: authority.artifacts,
      ...(capsuleSigning === undefined ? {} : { signing: capsuleSigning }),
    });
    const capsuleBody = new TextDecoder().decode(capsule.bytes);
    await persistRunnerAuthorityBytes({
      store: input.store,
      key: capsule.reference.objectKey,
      body: capsuleBody,
      contentType: PROOF_CAPSULE_MEDIA_TYPE,
    });
    const persisted = await requireFrozenAuthorityObject(
      input.store,
      capsule.reference.objectKey,
      "Proof Capsule",
    );
    await validatePersistedNativeProofCapsule({
      ...persisted,
      expectedReference: capsule.reference,
      ...(input.signingKey === undefined
        ? {}
        : { signingKey: input.signingKey }),
      ...(input.signingKeyId === undefined
        ? {}
        : { signingKeyId: input.signingKeyId }),
    });
    try {
      session = await input.service.issueProofCapsuleV2(
        session.id,
        capsule.reference,
      );
    } catch (error) {
      session = await input.service.getSession(session.id);
      if (
        session.state !== "PROOF_CAPSULE_ISSUED" ||
        session.proofCapsule === undefined ||
        (await hashCanonical(session.proofCapsule)) !==
          (await hashCanonical(capsule.reference))
      ) {
        throw error;
      }
    }
  }

  if (session.state === "PROOF_CAPSULE_ISSUED") {
    if (session.proofCapsule === undefined) {
      throw new ApiInputError(
        "PROOF_CAPSULE_MISSING",
        "The issued Proof Capsule reference is missing",
        409,
      );
    }
    const persisted = await requireFrozenAuthorityObject(
      input.store,
      session.proofCapsule.objectKey,
      "Proof Capsule",
    );
    await validatePersistedNativeProofCapsule({
      ...persisted,
      expectedReference: session.proofCapsule,
      ...(input.signingKey === undefined
        ? {}
        : { signingKey: input.signingKey }),
      ...(input.signingKeyId === undefined
        ? {}
        : { signingKeyId: input.signingKeyId }),
    });
  }
  return session;
}

async function reconstructScientificInteractiveRunAuthority(input: {
  store: RunnerObjectStore;
  jobs: RunnerJobService;
  job: RunnerJob;
  session: CounterLabSession;
  manifest: ArtifactManifest;
  inputBundleKey: string;
  outputPrefix: string;
  callbackOutputHashes: readonly string[];
}) {
  const frozenResultKey = `runner-authority/${input.job.jobId}/verified-result.json`;
  const [inputObject, mutableResultObject, frozenResultObject] =
    await Promise.all([
      input.store.get(input.inputBundleKey),
      input.store.get(`${input.outputPrefix}verified-result.json`),
      input.store.get(frozenResultKey),
    ]);
  const resultObject = frozenResultObject ?? mutableResultObject;
  if (inputObject === undefined || resultObject === undefined) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_MISSING",
      "Required interactive input or fixed-kernel result is missing",
      409,
    );
  }

  let bundle: z.infer<typeof RunnerLabInteractiveRunBundleV5Schema>;
  let result: z.infer<typeof HostedVerifiedResultSetV2Schema>;
  try {
    bundle = RunnerLabInteractiveRunBundleV5Schema.parse(
      JSON.parse(inputObject.body),
    );
    result = HostedVerifiedResultSetV2Schema.parse(
      JSON.parse(resultObject.body),
    );
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      throw new ApiInputError(
        "RESULT_CONTRACT_REJECTED",
        "The interactive fixed-kernel authority failed strict validation",
        409,
      );
    }
    throw error;
  }

  const rawResultHash = await sha256Text(resultObject.body);
  if (
    input.callbackOutputHashes.length !== 1 ||
    input.callbackOutputHashes[0] !== rawResultHash
  ) {
    throw new ApiInputError(
      "RUNNER_OUTPUT_HASH_MISMATCH",
      "Interactive fixed-kernel bytes do not match the terminal callback",
      409,
    );
  }
  if (frozenResultObject === undefined) {
    await input.store.put(
      frozenResultKey,
      resultObject.body,
      "application/json",
    );
  }
  const persistedResult = await input.store.get(frozenResultKey);
  if (
    persistedResult === undefined ||
    (await sha256Text(persistedResult.body)) !== rawResultHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Frozen interactive result bytes do not match the terminal callback",
      409,
    );
  }

  const evidenceAuthority = await resolveSessionEvidenceAuthority(
    input.session,
  ).catch(() => {
    throw new ApiInputError(
      "EVIDENCE_AUTHORITY_REQUIRED",
      "Released scientific evidence is required for interactive exploration",
      409,
    );
  });
  if (
    evidenceAuthority.protocol !== "v5" ||
    evidenceAuthority.verdict === "REJECTED"
  ) {
    throw new ApiInputError(
      "EVIDENCE_AUTHORITY_REQUIRED",
      "Interactive exploration requires released v5 evidence",
      409,
    );
  }
  const sessionLineage = HostedExperimentLineageV5Schema.parse(
    input.session.labVerification,
  );
  const compileAuthority = await loadFrozenScientificCompileAuthority({
    store: input.store,
    jobs: input.jobs,
    session: input.session,
    manifest: input.manifest,
    lineage: sessionLineage,
  });
  const [
    bundleHash,
    manifestHash,
    bundledManifestHash,
    selectionHash,
    selectedIrHash,
    basePlanHash,
    interactivePlanHash,
    evidenceVerdictHash,
  ] = await Promise.all([
    hashCanonical(bundle),
    hashCanonical(input.manifest),
    hashCanonical(bundle.artifactManifest),
    hashCanonical(bundle.fixedSelection),
    hashExperimentIR(bundle.selectedExperimentIr),
    hashCanonical(bundle.basePlan),
    hashCanonical(bundle.interactivePlan),
    hashCanonical(evidenceAuthority.evidenceVerdict),
  ]);
  const expectedInputHashes = [
    manifestHash,
    selectedIrHash,
    selectionHash,
    basePlanHash,
    evidenceAuthority.result.resultHash,
    evidenceVerdictHash,
    evidenceAuthority.epistemicReportHash,
    bundle.configurationHash,
    interactivePlanHash,
    bundleHash,
  ];
  if (
    input.job.kind !== "LAB_RUN" ||
    input.job.status !== "AWAITING_APPROVAL" ||
    bundle.jobId !== input.job.jobId ||
    bundle.sessionId !== input.job.sessionId ||
    bundle.stateVersion !== input.job.stateVersion ||
    bundle.artifactManifestHash !== input.job.artifactManifestHash ||
    input.session.id !== input.job.sessionId ||
    input.session.mode.kind !== "live_notebook" ||
    manifestHash !== input.job.artifactManifestHash ||
    bundledManifestHash !== manifestHash ||
    JSON.stringify(input.job.inputHashes) !==
      JSON.stringify(expectedInputHashes)
  ) {
    throw new ApiInputError(
      "RUNNER_INPUT_LINEAGE_MISMATCH",
      "Interactive fixed-run lineage does not match the live session",
      409,
    );
  }
  const configurationHash = await hashCanonical({
    schemaVersion: "1",
    sessionId: input.session.id,
    artifactManifestHash: manifestHash,
    selectedExperimentIrHash: sessionLineage.selectedExperimentIrHash,
    selectionHash: sessionLineage.selectionHash,
    projectedPlanHash: sessionLineage.projectedPlanHash,
    authoritativeResultHash: evidenceAuthority.result.resultHash,
    evidenceVerdictHash,
    epistemicReportHash: evidenceAuthority.epistemicReportHash,
    configuration: bundle.configuration,
  });
  if (
    bundle.configurationHash !== configurationHash ||
    bundle.interactivePlanHash !== interactivePlanHash ||
    (await hashCanonical(bundle.compileAuthority)) !==
      (await hashCanonical(sessionLineage)) ||
    selectedIrHash !== sessionLineage.selectedExperimentIrHash ||
    selectionHash !== sessionLineage.selectionHash ||
    basePlanHash !== sessionLineage.projectedPlanHash ||
    (await hashExperimentIR(compileAuthority.selectedExperimentIr)) !==
      selectedIrHash ||
    (await hashCanonical(compileAuthority.outcome.selection)) !==
      selectionHash ||
    (await hashCanonical(compileAuthority.projectedPlan)) !== basePlanHash ||
    bundle.releaseAuthority.authoritativeResultHash !==
      evidenceAuthority.result.resultHash ||
    (await hashCanonical(bundle.releaseAuthority.evidenceVerdict)) !==
      evidenceVerdictHash ||
    bundle.releaseAuthority.evidenceVerdictHash !== evidenceVerdictHash ||
    bundle.releaseAuthority.epistemicReportHash !==
      evidenceAuthority.epistemicReportHash
  ) {
    throw new ApiInputError(
      "SCIENTIFIC_AUTHORITY_DERIVATION_MISMATCH",
      "Interactive bundle does not match frozen compile and release authority",
      409,
    );
  }

  let report;
  try {
    report =
      result.concept === "class_imbalance"
        ? await verifyHostedResultSet(result, bundle.interactivePlan)
        : await verifyInteractiveResultSet(
            result,
            bundle.interactivePlan,
            bundle.selectedRunId,
          );
  } catch (error) {
    if (error instanceof ResultVerificationError) throw error;
    throw error;
  }
  await persistScientificAuthority(
    input.store,
    `runner-authority/${input.job.jobId}/technical-verification.json`,
    report,
  );
  return { bundle, result, report, rawResultHash };
}

function scientificAuthorityEvents(input: {
  jobId: string;
  runnerCursor: number;
  authorityAt: string;
  report: EpistemicVerificationReport;
}): PublicCompilerEvent[] {
  const eventBase = (offset: number) => ({
    schemaVersion: "1" as const,
    eventId: `authority_${input.jobId}_${input.runnerCursor + offset}`,
    jobId: input.jobId,
    cursor: input.runnerCursor + offset,
    at: input.authorityAt,
  });
  if (input.report.status === "VERIFIED") {
    return [
      PublicCompilerEventSchema.parse({
        ...eventBase(1),
        kind: "verifier.verified",
        invariantCount: input.report.technicalReport.invariantCount,
        mutationCount: 0,
      }),
      PublicCompilerEventSchema.parse({
        ...eventBase(2),
        kind: "result.ready",
        resultHash: input.report.resultHash,
      }),
    ];
  }
  return input.report.findings.map((finding, index) =>
    PublicCompilerEventSchema.parse({
      ...eventBase(index + 1),
      kind: "verifier.rejected",
      invariant: finding.code,
      observed: finding.observed ?? null,
      expected: finding.expected ?? null,
      counterexample: (
        finding.counterexample ??
        `${finding.code}: the fixed verifier withheld result authority.`
      ).slice(0, 2_000),
    }),
  );
}

async function appendScientificAuthorityEvents(input: {
  jobs: RunnerJobService;
  job: RunnerJob;
  callback: RunnerCallback;
  callbackClaim?: RunnerCallbackClaimToken | undefined;
  authorityAt: string;
  report: EpistemicVerificationReport;
}): Promise<{
  finalEventCursor: number;
  terminalEvent?: PublicCompilerEvent;
}> {
  const expected = scientificAuthorityEvents({
    jobId: input.job.jobId,
    runnerCursor: input.callback.finalEventCursor,
    authorityAt: input.authorityAt,
    report: input.report,
  });
  const existing = await input.jobs.listEvents(
    input.job.jobId,
    input.callback.finalEventCursor,
  );
  if (existing.length > 0) {
    const expectedPrefix = expected.slice(0, existing.length);
    if (
      existing.length > expected.length ||
      (await hashCanonical(existing.map(authorityEventPayload))) !==
        (await hashCanonical(expectedPrefix.map(authorityEventPayload)))
    ) {
      throw new ApiInputError(
        "RUNNER_AUTHORITY_EVENT_CONFLICT",
        "Persisted scientific authority events are partial or conflicting",
        409,
      );
    }
  }
  const current = await input.jobs.getJob(input.job.jobId);
  if (
    current.eventCursor !==
    input.callback.finalEventCursor + existing.length
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_EVENT_CONFLICT",
      "Runner event cursor contains unrecognized scientific authority events",
      409,
    );
  }
  const missing = expected.slice(existing.length);
  const terminalEvent = missing.at(-1);
  let updated = current;
  for (const event of missing.slice(0, -1)) {
    updated = await input.jobs.appendEvent(
      input.job.jobId,
      updated.jobVersion,
      event,
      input.callbackClaim,
    );
  }
  return {
    finalEventCursor: input.callback.finalEventCursor + expected.length,
    ...(terminalEvent === undefined ? {} : { terminalEvent }),
  };
}

async function appendInteractiveAuthorityEvents(input: {
  jobs: RunnerJobService;
  job: RunnerJob;
  callback: RunnerCallback;
  callbackClaim?: RunnerCallbackClaimToken | undefined;
  authorityAt: string;
  invariantCount: number;
  resultHash: string;
}): Promise<{
  finalEventCursor: number;
  terminalEvent?: PublicCompilerEvent;
}> {
  const expected = [
    PublicCompilerEventSchema.parse({
      schemaVersion: "1",
      eventId: `authority_${input.job.jobId}_${input.callback.finalEventCursor + 1}`,
      jobId: input.job.jobId,
      cursor: input.callback.finalEventCursor + 1,
      at: input.authorityAt,
      kind: "verifier.verified",
      invariantCount: input.invariantCount,
      mutationCount: 0,
    }),
    PublicCompilerEventSchema.parse({
      schemaVersion: "1",
      eventId: `authority_${input.job.jobId}_${input.callback.finalEventCursor + 2}`,
      jobId: input.job.jobId,
      cursor: input.callback.finalEventCursor + 2,
      at: input.authorityAt,
      kind: "result.ready",
      resultHash: input.resultHash,
    }),
  ];
  const existing = await input.jobs.listEvents(
    input.job.jobId,
    input.callback.finalEventCursor,
  );
  if (
    existing.length > expected.length ||
    (await hashCanonical(existing.map(authorityEventPayload))) !==
      (await hashCanonical(
        expected.slice(0, existing.length).map(authorityEventPayload),
      ))
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_EVENT_CONFLICT",
      "Persisted interactive authority events are partial or conflicting",
      409,
    );
  }
  let current = await input.jobs.getJob(input.job.jobId);
  if (
    current.eventCursor !==
    input.callback.finalEventCursor + existing.length
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_EVENT_CONFLICT",
      "Runner event cursor contains unrecognized interactive authority events",
      409,
    );
  }
  const missing = expected.slice(existing.length);
  const terminalEvent = missing.at(-1);
  for (const event of missing.slice(0, -1)) {
    current = await input.jobs.appendEvent(
      input.job.jobId,
      current.jobVersion,
      event,
      input.callbackClaim,
    );
  }
  return {
    finalEventCursor: input.callback.finalEventCursor + expected.length,
    ...(terminalEvent === undefined ? {} : { terminalEvent }),
  };
}

async function appendBoundaryAuthorityEvents(input: {
  jobs: RunnerJobService;
  job: RunnerJob;
  callback: RunnerCallback;
  callbackClaim?: RunnerCallbackClaimToken | undefined;
  authorityAt: string;
  report: BoundaryMapVerificationReportV1;
}): Promise<{
  finalEventCursor: number;
  terminalEvent?: PublicCompilerEvent;
}> {
  const eventBase = (offset: number) => ({
    schemaVersion: "1" as const,
    eventId: `authority_${input.job.jobId}_${input.callback.finalEventCursor + offset}`,
    jobId: input.job.jobId,
    cursor: input.callback.finalEventCursor + offset,
    at: input.authorityAt,
  });
  const expected =
    input.report.status === "VERIFIED"
      ? [
          PublicCompilerEventSchema.parse({
            ...eventBase(1),
            kind: "verifier.verified",
            invariantCount: input.report.invariantCount,
            mutationCount: 0,
          }),
          PublicCompilerEventSchema.parse({
            ...eventBase(2),
            kind: "result.ready",
            resultHash: input.report.resultHash,
          }),
        ]
      : input.report.invariants
          .filter((invariant) => !invariant.passed)
          .map((invariant, index) =>
            PublicCompilerEventSchema.parse({
              ...eventBase(index + 1),
              kind: "verifier.rejected",
              invariant: invariant.name,
              observed: invariant.observed,
              expected: invariant.expected,
              counterexample: (
                invariant.counterexample ??
                `${invariant.name}: the Boundary Map verifier withheld authority.`
              ).slice(0, 2_000),
            }),
          );
  const existing = await input.jobs.listEvents(
    input.job.jobId,
    input.callback.finalEventCursor,
  );
  if (
    existing.length > expected.length ||
    (await hashCanonical(existing.map(authorityEventPayload))) !==
      (await hashCanonical(
        expected.slice(0, existing.length).map(authorityEventPayload),
      ))
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_EVENT_CONFLICT",
      "Persisted Boundary Map authority events are partial or conflicting",
      409,
    );
  }
  let current = await input.jobs.getJob(input.job.jobId);
  if (
    current.eventCursor !==
    input.callback.finalEventCursor + existing.length
  ) {
    throw new ApiInputError(
      "RUNNER_AUTHORITY_EVENT_CONFLICT",
      "Runner event cursor contains unrecognized Boundary Map authority events",
      409,
    );
  }
  const missing = expected.slice(existing.length);
  const terminalEvent = missing.at(-1);
  for (const event of missing.slice(0, -1)) {
    current = await input.jobs.appendEvent(
      input.job.jobId,
      current.jobVersion,
      event,
      input.callbackClaim,
    );
  }
  return {
    finalEventCursor: input.callback.finalEventCursor + expected.length,
    ...(terminalEvent === undefined ? {} : { terminalEvent }),
  };
}

function authorityEventPayload(event: PublicCompilerEvent) {
  const { eventId: _eventId, at: _at, ...authority } = event;
  return authority;
}

async function closeScientificRunnerBoundary(input: {
  jobs: RunnerJobService;
  job: RunnerJob;
  callback: RunnerCallback;
}): Promise<RunnerJob> {
  if (["VERIFIED", "REJECTED", "FAILED"].includes(input.job.status)) {
    return input.job;
  }
  if (input.job.status === "AWAITING_APPROVAL") return input.job;
  if (input.job.eventCursor !== input.callback.finalEventCursor) {
    throw new ApiInputError(
      "RUNNER_EVENT_CURSOR_MISMATCH",
      "The scientific callback does not close the current runner event stream",
      409,
    );
  }
  if (input.job.status !== "RUNNING" && input.job.status !== "REPAIRING") {
    throw new ApiInputError(
      "RUNNER_JOB_NOT_ACTIVE",
      "The scientific runner boundary cannot be closed from this job state",
      409,
    );
  }
  return input.jobs.transition(
    input.job.jobId,
    input.job.jobVersion,
    "AWAITING_APPROVAL",
    {
      runnerIdentity:
        input.job.runnerIdentity ?? "counterlab-control-plane-verifier",
    },
  );
}

function bearerToken(context: Context<AppBindings>): string {
  const authorization = context.req.header("authorization");
  if (authorization === undefined || !authorization.startsWith("Bearer ")) {
    throw new ApiInputError(
      "RUNNER_AUTH_REQUIRED",
      "A scoped runner job token is required",
      401,
    );
  }
  return authorization.slice("Bearer ".length);
}

async function authorizeRunner(
  context: Context<AppBindings>,
  options: ApiOptions,
  jobId: string,
  callbackPath?: string,
) {
  const job = await runnerJobService(context, options).getJob(jobId);
  const claims = await verifyRunnerJobToken(
    bearerToken(context),
    runnerVerifyingPublicKey(context, options),
    {
      nowEpochSeconds: Math.floor(requestNow(options).getTime() / 1_000),
      jobId,
      purpose: "RUN_JOB",
      controlPlaneOrigin: new URL(context.req.url).origin,
      artifactManifestHash: job.artifactManifestHash,
      ...(callbackPath === undefined ? {} : { callbackPath }),
    },
  );
  if (
    claims.sessionId !== job.sessionId ||
    claims.stateVersion !== job.stateVersion
  ) {
    throw new RunnerTokenError("Runner token lineage does not match the job");
  }
  return { claims, job };
}

function maxNotebookBytes(context: Context<AppBindings>): number {
  const configured = Number(context.env?.COUNTERLAB_MAX_NOTEBOOK_BYTES);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_NOTEBOOK_BYTES;
}

function runnerCapability(
  context: Context<AppBindings>,
  options: ApiOptions = {},
) {
  try {
    runnerSigningPrivateKey(context, options);
    return runnerDispatcher(context, options) === undefined
      ? ("local-runner-required" as const)
      : ("configured" as const);
  } catch {
    return "local-runner-required" as const;
  }
}

function requireApprovedSampleArtifact(
  artifact: Awaited<ReturnType<ArtifactStore["find"]>>,
  errorCode:
    | "MODE_ARTIFACT_MISMATCH"
    | "ARTIFACT_RESULT_MISMATCH"
    | "ARTIFACT_TRANSFER_MISMATCH"
    | "ARTIFACT_PATCH_MISMATCH",
): asserts artifact is StoredArtifact {
  if (
    artifact?.manifest.artifactId !== sampleManifest.artifactId ||
    artifact.manifest.fileSha256 !== sampleManifest.fileSha256
  ) {
    throw new ApiInputError(
      errorCode,
      "Bundled sample evidence is authorized only for the approved sample artifact",
      409,
    );
  }
}

async function requireApprovedSampleAuthority(
  artifact: Awaited<ReturnType<ArtifactStore["find"]>>,
  errorCode:
    | "MODE_ARTIFACT_MISMATCH"
    | "ARTIFACT_RESULT_MISMATCH"
    | "ARTIFACT_TRANSFER_MISMATCH"
    | "ARTIFACT_PATCH_MISMATCH",
) {
  requireApprovedSampleArtifact(artifact, errorCode);
  try {
    return await loadVerifiedSampleLabAuthority({
      manifest: artifact.manifest,
    });
  } catch {
    throw new ApiInputError(
      "SAMPLE_AUTHORITY_MISMATCH",
      "The checked-in fixed sample evidence no longer resolves to one authority tuple",
      503,
    );
  }
}

function requireMutableSession(
  session: Awaited<ReturnType<SessionService["getSession"]>>,
): void {
  if (session.mode.kind === "verified_replay") {
    throw new ApiInputError(
      "REPLAY_READ_ONLY",
      "Verified replay sessions are reconstructed from stored evidence and cannot be mutated",
      409,
    );
  }
  requireStoredSampleClaimScope(session);
}

function requireStoredSampleClaimScope(
  session: Awaited<ReturnType<SessionService["getSession"]>>,
): void {
  if (session.mode.kind !== "sample_lesson") {
    return;
  }
  if (
    session.state === "INGESTED" &&
    session.beliefTest === undefined &&
    session.beliefSpec === undefined
  ) {
    return;
  }
  try {
    assertSampleProofClaimScope(session);
  } catch {
    throw new ApiInputError(
      "SAMPLE_SCOPE_RESTART_REQUIRED",
      "This historical sample used custom claim framing outside the fixed evidence scope. Start a new fixed sample to inspect verified conclusions.",
      409,
    );
  }
}

async function requireStoredProofBundleIntegrity(
  session: Awaited<ReturnType<SessionService["getSession"]>>,
  service: SessionService,
  signingKey: string | undefined,
): Promise<void> {
  if (session.proofBundle === undefined) return;

  try {
    const chain = verifyEvidenceChain(await service.listEvents(session.id));
    const proofBundleHash = await hashCanonical(session.proofBundle);
    const issuanceEvents = chain.events.filter(
      (event) => event.kind === "reasoning_diff.issued",
    );
    if (
      chain.sessionId !== session.id ||
      issuanceEvents.length !== 1 ||
      !issuanceEvents[0]?.outputHashes.includes(proofBundleHash)
    ) {
      throw new Error(
        "stored Proof Bundle is not bound to its issuance evidence",
      );
    }
  } catch {
    throw new ApiInputError(
      "PROOF_BUNDLE_INVALID",
      "The stored Proof Bundle failed integrity or lineage validation",
      409,
    );
  }

  const usableSigningKey =
    signingKey === undefined || signingKey.trim().length === 0
      ? undefined
      : signingKey;
  if (
    session.proofBundle.integrity.mode === "hmac-signed" &&
    usableSigningKey === undefined
  ) {
    throw new ApiInputError(
      "PROOF_SIGNING_KEY_REQUIRED",
      "The signing key for the stored Proof Bundle is unavailable",
      503,
    );
  }
  try {
    const proofBundle = validateProofBundle(session.proofBundle, {
      ...(session.proofBundle.schemaVersion === "2"
        ? {
            scientificEngineSnapshotHash:
              scientificEngineSnapshotValue.authorityHash,
          }
        : {}),
      ...(session.proofBundle.integrity.mode === "hmac-signed" &&
      usableSigningKey !== undefined
        ? { signingKey: usableSigningKey }
        : {}),
    });
    const modeMatches =
      proofBundle.schemaVersion === "2"
        ? session.mode.kind === "live_notebook"
        : session.mode.kind !== "sample_lesson" ||
          proofBundle.replayId === session.mode.sampleId;
    if (
      proofBundle.sessionId !== session.id ||
      proofBundle.artifactManifest.artifactId !== session.artifactId ||
      !modeMatches ||
      (session.state !== "REASONING_DIFF_ISSUED" &&
        session.state !== "PROOF_CAPSULE_ISSUED") ||
      session.prediction?.immutableHash !==
        proofBundle.predictionContract.immutableHash ||
      session.verifiedResult?.resultHash !==
        proofBundle.verifiedResultSet.resultHash ||
      session.transferResult?.resultHash !==
        proofBundle.transferResult.resultHash ||
      session.patchResult?.resultHash !== proofBundle.patchResult.resultHash ||
      session.reasoningDiff?.id !== proofBundle.reasoningDiff.id
    ) {
      throw new Error("stored Proof Bundle does not match its outer session");
    }
  } catch {
    throw new ApiInputError(
      "PROOF_BUNDLE_INVALID",
      "The stored Proof Bundle failed integrity or lineage validation",
      409,
    );
  }
}

function isFile(value: string | File | null): value is File {
  return value !== null && typeof value !== "string";
}

function learningDirectorRegistries(concept: BeliefSpecV2["concept"]) {
  const pack = getConceptPack(concept);
  return {
    [concept]: pack.scientificMethod.learningDirectorPresentation,
  };
}

function learningDirectorPacket(
  sanitizedContent: ReturnType<typeof buildSanitizedAnalystContext>,
  clarificationAlreadyUsed: boolean,
  answer?: string,
) {
  const seenHashes = new Set<string>();
  const approvedEvidence = sanitizedContent.evidence.flatMap((evidence) => {
    if (seenHashes.has(evidence.sourceHash)) return [];
    seenHashes.add(evidence.sourceHash);
    return [{ hash: evidence.sourceHash, excerpt: evidence.sourceExcerpt }];
  });
  return {
    concept: sanitizedContent.concept,
    subjectPackVersion: sanitizedContent.conceptPack.version,
    approvedEvidence,
    candidateExperimentIds: [
      ...sanitizedContent.conceptPack.candidateExperimentIds,
    ],
    clarificationAlreadyUsed,
    ...(answer === undefined ? {} : { answer }),
  };
}

function approvedLiveReasoningPackets(
  sanitizedContent: ReturnType<typeof buildSanitizedAnalystContext>,
) {
  return {
    beliefAnalyst: sanitizedContent,
    learningDirector: learningDirectorPacket(sanitizedContent, false),
  };
}

async function statePayload(
  context: Context<AppBindings>,
  session: Awaited<ReturnType<SessionService["getSession"]>>,
  options: ApiOptions,
) {
  await requireStoredProofBundleIntegrity(
    session,
    sessionService(context, options),
    context.env?.COUNTERLAB_SIGNING_KEY,
  );
  const publicProofCapsule =
    session.proofCapsule === undefined
      ? undefined
      : (({ objectKey: _objectKey, ...receipt }) => receipt)(
          session.proofCapsule,
        );
  return {
    sessionId: session.id,
    artifactId: session.artifactId,
    mode: session.mode,
    state: session.state,
    version: session.version,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.beliefTest === undefined
      ? {}
      : { beliefTest: session.beliefTest }),
    ...(session.beliefSpec === undefined
      ? {}
      : { beliefSpec: session.beliefSpec }),
    ...(session.learningDirector === undefined
      ? {}
      : { learningDirector: session.learningDirector }),
    ...(session.prediction === undefined
      ? {}
      : { prediction: session.prediction }),
    ...(session.verifiedResult === undefined
      ? {}
      : { verifiedResult: session.verifiedResult }),
    ...(session.evidenceVerdict === undefined
      ? {}
      : { evidenceVerdict: session.evidenceVerdict }),
    ...(session.epistemicReportHash === undefined
      ? {}
      : { epistemicReportHash: session.epistemicReportHash }),
    ...(session.boundaryMapAuthority === undefined
      ? {}
      : { boundaryMapAuthority: session.boundaryMapAuthority }),
    ...(session.transferResult === undefined
      ? {}
      : { transferResult: session.transferResult }),
    ...(session.patchResult === undefined
      ? {}
      : { patchResult: session.patchResult }),
    ...(session.revision === undefined ? {} : { revision: session.revision }),
    ...(session.reasoningDiff === undefined
      ? {}
      : { reasoningDiff: session.reasoningDiff }),
    ...(session.proofBundle === undefined
      ? {}
      : { proofBundle: session.proofBundle }),
    ...(session.reasoningDiffV2 === undefined ||
    publicProofCapsule === undefined
      ? {}
      : { reasoningDiffV2: session.reasoningDiffV2 }),
    ...(publicProofCapsule === undefined
      ? {}
      : { proofCapsule: publicProofCapsule }),
  };
}

export function createApi(options: ApiOptions = {}) {
  const app = new Hono<AppBindings>();
  let activeReadinessProbe: ReturnType<typeof readinessSnapshot> | null = null;
  const observeReadiness = (context: Context<AppBindings>) => {
    if (activeReadinessProbe !== null) return activeReadinessProbe;
    const probe = readinessSnapshot(context, options).finally(() => {
      if (activeReadinessProbe === probe) activeReadinessProbe = null;
    });
    activeReadinessProbe = probe;
    return probe;
  };
  const requireExactLiveReleaseReadiness = async (
    context: Context<AppBindings>,
  ) => {
    if (!admissionEnabled(options)) return;
    const snapshot = await observeReadiness(context);
    if (!snapshot.ready || snapshot.release.status !== "bound") {
      throw new ApiInputError(
        "LIVE_AUTHORITY_NOT_READY",
        "The exact released live runtime is not ready. Your supported notebook remains available for retry; no live investigation was created.",
        503,
        true,
      );
    }
  };

  app.get("/ready", async (context) => {
    const snapshot = await observeReadiness(context);
    context.header("cache-control", "no-store");
    context.header("x-content-type-options", "nosniff");
    return context.json(
      {
        status: snapshot.ready ? ("ready" as const) : ("not-ready" as const),
        service: "counterlab-control-plane" as const,
        checks: snapshot.checks,
        maintenance: maintenanceEnabled(context),
        release: snapshot.release,
      },
      snapshot.ready ? 200 : 503,
    );
  });

  app.use("/api/*", async (context, next) => {
    const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
    context.set("requestId", requestId);
    context.header("cache-control", "no-store");
    context.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors 'none'",
    );
    context.header("referrer-policy", "no-referrer");
    context.header("x-content-type-options", "nosniff");
    context.header("x-frame-options", "DENY");
    if (
      maintenanceEnabled(context) &&
      new URL(context.req.url).pathname !== "/api/health"
    ) {
      return context.json(
        jsonError(
          "RELEASE_MAINTENANCE",
          "CounterLab is applying a bounded release migration. Retry shortly.",
          503,
          true,
        ),
        503,
      );
    }
    await next();
  });

  app.use("/api/sessions/:sessionId", async (context, next) => {
    await requireSessionOwnerCapability(context, options);
    await next();
  });

  app.use("/api/sessions/:sessionId/*", async (context, next) => {
    await requireSessionOwnerCapability(context, options);
    await next();
  });

  app.get("/api/health", async (context) => {
    const readinessQuery = new URL(context.req.url).searchParams.get(
      "readiness",
    );
    if (readinessQuery !== null && readinessQuery !== "probe") {
      throw new ApiInputError(
        "INVALID_READINESS_QUERY",
        "readiness must be omitted or set to probe",
        400,
      );
    }
    const runner = runnerCapability(context, options);
    const readiness =
      readinessQuery === "probe" ? await observeReadiness(context) : null;
    const release = readiness?.release ?? releaseIdentity(context);
    return context.json(
      jsonSuccess({
        platform: "cloudflare-workers" as const,
        sample: "available" as const,
        replay: "available" as const,
        liveGpt: context.env?.OPENAI_API_KEY?.trim().length
          ? ("configured" as const)
          : ("server-key-required" as const),
        liveCodex: runner,
        liveKernel: runner,
        maintenance: maintenanceEnabled(context),
        readiness:
          readiness === null
            ? ("not-checked" as const)
            : readiness.ready
              ? ("ready" as const)
              : ("not-ready" as const),
        release,
        sandbox:
          runner === "configured"
            ? ("credential-and-privilege-boundary" as const)
            : ("local-runner-required" as const),
        generationFilesystemReadIsolation:
          readiness?.checks.runner === true
            ? ("OS_ENFORCED" as const)
            : ("PARTIAL" as const),
        requestId: context.get("requestId"),
      }),
    );
  });

  app.get("/api/admin/diagnostics", async (context) => {
    const configured = (
      options.adminDiagnosticSecret ??
      context.env?.COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET ??
      ""
    ).trim();
    if (configured.length < 32) {
      return context.json(
        jsonError("NOT_FOUND", "The requested resource was not found", 404),
        404,
      );
    }
    const authorization = context.req.header("authorization") ?? "";
    const presented = authorization.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : "";
    if (!constantTimeEqual(presented, configured)) {
      return context.json(
        jsonError(
          "ADMIN_AUTH_REQUIRED",
          "Administrative authorization failed",
          401,
        ),
        401,
      );
    }
    const generatedAt = requestNow(options).toISOString();
    const diagnostics =
      options.operationalDiagnostics === undefined
        ? await loadOperationalDiagnostics(
            requiredDatabase(context),
            generatedAt,
          )
        : await options.operationalDiagnostics();
    return context.json(jsonSuccess(diagnostics));
  });

  app.post("/api/artifacts", async (context) => {
    const rawContentType = context.req.header("content-type") ?? "";
    const type = rawContentType.split(";", 1)[0];
    if (type === "application/json") {
      CreateArtifactSchema.parse(await readJson(context));
      const stored = await artifacts(context, options).save(sampleManifest);
      return context.json(jsonSuccess(stored.manifest), 201);
    }
    if (type !== "multipart/form-data") {
      throw new ApiInputError(
        "UNSUPPORTED_CONTENT_TYPE",
        "Use application/json for the sample or multipart/form-data for a notebook",
        415,
      );
    }
    const maxBytes = maxNotebookBytes(context);
    const boundaryMatch = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;\s]+))/iu.exec(
      rawContentType,
    );
    const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2];
    if (
      boundary === undefined ||
      boundary.length === 0 ||
      boundary.length > MAX_MULTIPART_BOUNDARY_CHARACTERS ||
      /[^\x20-\x7e]/u.test(boundary)
    ) {
      throw new ApiInputError(
        "INVALID_MULTIPART_BOUNDARY",
        "Multipart uploads require one bounded ASCII boundary",
        400,
      );
    }
    const rawUploadOperationKey = requestIdempotencyKey(
      context,
      options,
      "artifact_upload",
    );
    const uploadOperation = admissionEnabled(options)
      ? requireUploadOperationIdentity(rawUploadOperationKey)
      : undefined;
    const uploadAdmission = await admitOperation(context, options, {
      kind: "upload",
      operationKey: rawUploadOperationKey,
    });
    if (uploadAdmission.leaseStatus === "already-active") {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          ((uploadAdmission.leaseExpiresAt ??
            requestNow(options).getTime() + 1_000) -
            requestNow(options).getTime()) /
            1_000,
        ),
      );
      throw new ApiInputError(
        "UPLOAD_IN_PROGRESS",
        "The same notebook upload is already in progress",
        409,
        true,
        retryAfterSeconds,
      );
    }
    try {
      let bodyBytes: Uint8Array;
      try {
        bodyBytes = await readBoundedBody(
          context,
          maxBytes + MAX_MULTIPART_OVERHEAD_BYTES,
        );
      } catch (error) {
        if (
          error instanceof ApiInputError &&
          error.code === "REQUEST_TOO_LARGE"
        ) {
          throw new ApiInputError(
            "MAXIMUM_SIZE_EXCEEDED",
            `Notebook upload exceeds ${maxBytes} bytes plus the permitted multipart envelope`,
            413,
          );
        }
        throw error;
      }
      let form: FormData;
      try {
        form = await new Response(bodyBytes, {
          headers: { "content-type": rawContentType },
        }).formData();
      } catch {
        throw new ApiInputError(
          "INVALID_MULTIPART_BODY",
          "The multipart notebook upload could not be parsed",
          400,
        );
      }
      const entries = [...form.entries()];
      if (
        entries.length !== 1 ||
        entries[0]?.[0] !== "file" ||
        !isFile(entries[0]?.[1] ?? null)
      ) {
        throw new ApiInputError(
          "INVALID_UPLOAD_FIELDS",
          "A notebook upload must contain exactly one file field",
          400,
        );
      }
      const file = form.get("file");
      if (!isFile(file)) {
        throw new ApiInputError(
          "FILE_REQUIRED",
          "A notebook file is required",
          400,
        );
      }
      if (!file.name.toLowerCase().endsWith(".ipynb")) {
        throw new ApiInputError(
          "INVALID_EXTENSION",
          "Only .ipynb notebook files are accepted",
          415,
        );
      }
      if (file.name.length > MAX_UPLOAD_FILE_NAME_CHARACTERS) {
        throw new ApiInputError(
          "FILE_NAME_TOO_LONG",
          `Notebook file names may contain at most ${MAX_UPLOAD_FILE_NAME_CHARACTERS} characters`,
          400,
        );
      }
      if (file.type.length > 0 && !ACCEPTED_NOTEBOOK_TYPES.has(file.type)) {
        throw new ApiInputError(
          "UNSUPPORTED_CONTENT_TYPE",
          `Notebook content type ${file.type} is not accepted`,
          415,
        );
      }
      if (file.size > maxBytes) {
        throw new ApiInputError(
          "MAXIMUM_SIZE_EXCEEDED",
          `Notebook upload exceeds ${maxBytes} bytes`,
          413,
        );
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const manifest = ArtifactManifestSchema.parse(
        parseNotebook(bytes, file.name, {
          maxBytes,
          createdAt: requestNow(options).toISOString(),
        }),
      );
      if (uploadOperation !== undefined) {
        await requireUploadRequestBinding(uploadOperation, {
          fileName: file.name,
          fileSha256: manifest.fileSha256,
          mediaType: canonicalUploadMediaType(file.type),
        });
      }
      if (context.env?.ARTIFACTS === undefined) {
        throw new ApiInputError(
          "ARTIFACT_STORAGE_UNAVAILABLE",
          "Private artifact storage is not configured",
          503,
        );
      }
      const artifactStore = artifacts(context, options);
      const objectKey = `uploads/${manifest.artifactId}/${manifest.fileSha256}.ipynb`;
      const existing = await artifactStore.find(manifest.artifactId);
      if (
        existing !== undefined &&
        (existing.manifest.artifactId !== manifest.artifactId ||
          existing.manifest.fileSha256 !== manifest.fileSha256)
      ) {
        throw new ApiInputError(
          "UPLOAD_ARTIFACT_IDENTITY_CONFLICT",
          "The stored artifact identity conflicts with this notebook",
          409,
        );
      }
      if (
        existing !== undefined &&
        existing.manifest.fileName !== manifest.fileName
      ) {
        throw new ApiInputError(
          "UPLOAD_ARTIFACT_METADATA_CONFLICT",
          "This notebook content is already bound to different upload metadata",
          409,
        );
      }
      if (
        existing?.objectKey !== undefined &&
        existing.objectKey !== objectKey
      ) {
        throw new ApiInputError(
          "UPLOAD_ARTIFACT_STORAGE_CONFLICT",
          "The stored artifact object binding conflicts with this notebook",
          409,
        );
      }
      let objectIsValid = false;
      if (existing?.objectKey === objectKey) {
        const object = await context.env.ARTIFACTS.head(objectKey);
        objectIsValid =
          object !== null &&
          object !== undefined &&
          object.size === bytes.byteLength &&
          object.customMetadata?.artifactId === manifest.artifactId &&
          object.customMetadata?.fileSha256 === manifest.fileSha256 &&
          object.customMetadata?.byteLength === String(bytes.byteLength);
      }
      if (!objectIsValid) {
        await context.env.ARTIFACTS.put(objectKey, bytes, {
          httpMetadata: { contentType: "application/x-ipynb+json" },
          customMetadata: {
            artifactId: manifest.artifactId,
            fileSha256: manifest.fileSha256,
            byteLength: String(bytes.byteLength),
          },
        });
      }
      const stored = await artifactStore.save(manifest, objectKey);
      if (
        stored.objectKey !== objectKey ||
        stored.manifest.artifactId !== manifest.artifactId ||
        stored.manifest.fileSha256 !== manifest.fileSha256 ||
        stored.manifest.fileName !== manifest.fileName
      ) {
        throw new ApiInputError(
          "UPLOAD_ARTIFACT_RECONCILIATION_FAILED",
          "The uploaded notebook could not be reconciled with durable storage",
          409,
        );
      }
      const ownerCapability =
        uploadOperation === undefined
          ? await issueArtifactOwnerCapability(
              context,
              options,
              stored.manifest.artifactId,
              stored.manifest.createdAt,
            )
          : await issueUploadArtifactOwnerCapability(context, options, {
              artifactId: stored.manifest.artifactId,
              createdAt: stored.manifest.createdAt,
              fileSha256: stored.manifest.fileSha256,
              uploadIdempotencyKey: uploadOperation.rawKey,
            });
      return context.json(
        jsonSuccess({
          ...stored.manifest,
          ...(ownerCapability === undefined ? {} : { ownerCapability }),
        }),
        201,
      );
    } finally {
      await releaseAdmissionBestEffort(
        context,
        options,
        "upload",
        rawUploadOperationKey,
        uploadAdmission.leaseGeneration,
      );
    }
  });

  app.get("/api/artifacts/:artifactId", async (context) => {
    if (ownerCapabilitiesEnabled(options)) {
      throw new ApiInputError(
        "PRIVATE_ARTIFACT_ROUTE_DISABLED",
        "Private artifact evidence is available only through its owner session",
        404,
      );
    }
    const artifact = await artifacts(context, options).find(
      context.req.param("artifactId"),
    );
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${context.req.param("artifactId")} was not found`,
        404,
      );
    }
    return context.json(jsonSuccess(artifact.manifest));
  });

  app.post("/api/sample/sessions", async (context) => {
    const input = CreateSampleSessionSchema.parse(await readJson(context));
    const artifact = await artifacts(context, options).save(sampleManifest);
    const session = await sessionService(context, options).createSession({
      artifactId: artifact.manifest.artifactId,
      mode: { kind: "sample_lesson", sampleId: input.sampleId },
    });
    const ownerCapability = await issueSessionOwnerCapability(
      context,
      options,
      session.id,
      session.createdAt,
    );
    if (ownerCapability !== undefined) {
      setSessionOwnerCookie(context, session.id, ownerCapability);
    }
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, session, options)),
        ...(ownerCapability === undefined ? {} : { ownerCapability }),
      }),
      201,
    );
  });

  app.post("/api/live/sessions", async (context) => {
    const input = CreateLiveSessionSchema.parse(await readJson(context));
    await requireArtifactOwnerCapability(
      context,
      options,
      input.artifactId,
      input.artifactCapability,
    );
    const artifact = await artifacts(context, options).find(input.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${input.artifactId} was not found`,
        404,
      );
    }
    if (artifact.manifest.artifactId === sampleManifest.artifactId) {
      throw new ApiInputError(
        "MODE_ARTIFACT_MISMATCH",
        "The bundled sample must use the sample lesson route",
        409,
      );
    }
    if (artifact.manifest.support.status !== "SUPPORTED") {
      throw new ApiInputError(
        "ARTIFACT_UNSUPPORTED",
        "A live investigation requires a notebook inside the released intake support boundary",
        422,
      );
    }
    await requireExactLiveReleaseReadiness(context);
    const session = await sessionService(context, options).createSession({
      artifactId: input.artifactId,
      mode: { kind: "live_notebook" },
    });
    const ownerCapability = await issueSessionOwnerCapability(
      context,
      options,
      session.id,
      session.createdAt,
    );
    if (ownerCapability !== undefined) {
      setSessionOwnerCookie(context, session.id, ownerCapability);
    }
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, session, options)),
        ...(ownerCapability === undefined ? {} : { ownerCapability }),
      }),
      201,
    );
  });

  app.post("/api/replay/sessions", async (context) => {
    CreateReplaySessionSchema.parse(await readJson(context));
    throw new ApiInputError(
      "REPLAY_SESSION_UNAVAILABLE",
      "Verified replay is served from its immutable stored evidence and cannot be converted into a mutable session",
      409,
    );
  });

  app.get("/api/sessions/:sessionId", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    requireStoredSampleClaimScope(session);
    return context.json(
      jsonSuccess(await statePayload(context, session, options)),
    );
  });

  app.get("/api/sessions/:sessionId/artifact", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    const artifact = await artifacts(context, options).find(session.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "The session artifact was not found",
        404,
      );
    }
    return context.json(jsonSuccess(artifact.manifest));
  });

  app.get("/api/sessions/:sessionId/lab-scene", async (context) => {
    const service = sessionService(context, options);
    const session = await service.getSession(context.req.param("sessionId"));
    if (session.mode.kind !== "live_notebook") {
      throw new ApiInputError(
        "LIVE_LAB_SCENE_REQUIRED",
        "A generated Lab Scene is available only for a verified live notebook session",
        409,
      );
    }
    const artifact = await artifacts(context, options).find(session.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "The live notebook artifact could not be resolved",
        404,
      );
    }
    const evidenceAuthority = await resolveSessionEvidenceAuthority(
      session,
    ).catch(() => {
      throw new ApiInputError(
        "LAB_SCENE_RESULT_REQUIRED",
        "The trusted Lab Scene remains withheld until a fixed result passes verification",
        409,
      );
    });
    if (
      evidenceAuthority.protocol !== "v5" ||
      evidenceAuthority.verdict === "REJECTED" ||
      evidenceAuthority.resultAuthority === undefined
    ) {
      throw new ApiInputError(
        "LAB_SCENE_RESULT_REQUIRED",
        "The trusted Lab Scene remains withheld until a fixed result passes verification",
        409,
      );
    }
    const lineage = HostedExperimentLineageV5Schema.parse(
      session.labVerification,
    );
    const frozenCompile = await loadFrozenScientificCompileAuthority({
      store: runnerObjectStore(context, options),
      jobs: runnerJobService(context, options),
      session,
      manifest: artifact.manifest,
      lineage,
    });
    const result = evidenceAuthority.result;
    const view = VerifiedLabSceneViewV1Schema.parse({
      schemaVersion: "1",
      scene: frozenCompile.labScene,
      verifiedSceneHash: lineage.labSceneHash,
      signedResult: {
        schemaVersion: "1",
        verificationStatus: "VERIFIED",
        sceneHash: lineage.labSceneHash,
        sceneId: frozenCompile.labScene.sceneId,
        sessionId: session.id,
        concept: result.concept,
        experimentIrHash: lineage.rawExperimentIrCanonicalHash,
        discriminationContractHash: lineage.discriminationContractHash,
        resultHash: result.resultHash,
        integrity: {
          mode: "integrity-hashed",
          contentHash: result.resultHash,
        },
        result,
      },
    });
    context.header("cache-control", "private, no-store");
    return context.json(jsonSuccess(view));
  });

  app.post("/api/sessions/:sessionId/restart", async (context) => {
    RestartSessionSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sourceSessionId = context.req.param("sessionId");
    const source = await service.getSession(sourceSessionId);
    if (
      source.state !== "INSUFFICIENT_EVIDENCE" &&
      source.state !== "REJECTED_BY_LEARNER"
    ) {
      throw new ApiInputError(
        "SESSION_RESTART_NOT_AVAILABLE",
        "A fresh investigation is available only after the learner closes the current explanation",
        409,
      );
    }
    requireMutableSession(source);
    const artifact = await artifacts(context, options).find(source.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "The source investigation artifact was not found",
        404,
      );
    }
    if (source.mode.kind === "live_notebook") {
      if (artifact.manifest.support.status !== "SUPPORTED") {
        throw new ApiInputError(
          "ARTIFACT_UNSUPPORTED",
          "The original notebook no longer satisfies the released intake support boundary",
          422,
        );
      }
    }
    const restartedSessionId = await deterministicRestartSessionId(
      source.id,
      restartIdempotencyKey(context),
    );
    let created = true;
    let restarted: CounterLabSession;
    try {
      restarted = await service.createSession({
        id: restartedSessionId,
        artifactId: source.artifactId,
        mode: source.mode,
        sourceSessionId: source.id,
      });
    } catch (error) {
      if (!(error instanceof SessionAlreadyExistsError)) throw error;
      created = false;
      restarted = await requireReconciledRestart(
        service,
        source,
        restartedSessionId,
      );
    }
    const ownerCapability = await issueRestartedSessionOwnerCapability(
      context,
      options,
      sourceSessionId,
      restarted,
    );
    if (ownerCapability !== undefined) {
      setSessionOwnerCookie(context, restarted.id, ownerCapability);
    }
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, restarted, options)),
        ...(ownerCapability === undefined ? {} : { ownerCapability }),
      }),
      created ? 201 : 200,
    );
  });

  app.post("/api/sessions/:sessionId/access/revoke", async (context) => {
    const sessionId = context.req.param("sessionId");
    await sessionService(context, options).getSession(sessionId);
    if (!ownerCapabilitiesEnabled(options)) {
      return context.json(jsonSuccess({ revoked: false as const }));
    }
    const currentCapability = await ownerCapabilities(
      context,
      options,
    ).findSession(sessionId);
    if (currentCapability?.revokedAt === undefined) {
      const activeJobs = await runnerJobService(
        context,
        options,
      ).listActiveForSession(sessionId);
      if (activeJobs.length > 0) {
        throw new ApiInputError(
          "SESSION_ACCESS_REVOCATION_BLOCKED",
          "Cancel the active test before revoking private session access",
          409,
        );
      }
    }
    const revoked = await ownerCapabilities(context, options).revokeSession(
      sessionId,
      requestNow(options).toISOString(),
    );
    if (!revoked) {
      const latestCapability = await ownerCapabilities(
        context,
        options,
      ).findSession(sessionId);
      if (latestCapability?.revokedAt === undefined) {
        throw new ApiInputError(
          "SESSION_ACCESS_REVOCATION_BLOCKED",
          "Private access changed while an active test was starting; cancel it and retry",
          409,
        );
      }
    }
    clearSessionOwnerCookie(context, sessionId);
    return context.json(jsonSuccess({ revoked }));
  });

  app.post("/api/sessions/:sessionId/belief-test/preview", async (context) => {
    const { learnerClaim } = BeliefRequestSchema.pick({
      learnerClaim: true,
    }).parse(await readJson(context));
    const service = sessionService(context, options);
    const session = await service.getSession(context.req.param("sessionId"));
    requireMutableSession(session);
    if (session.mode.kind !== "live_notebook") {
      throw new ApiInputError(
        "LIVE_PREVIEW_MODE_REQUIRED",
        "Sanitized analyst preview is available only for live notebook sessions",
        409,
      );
    }
    if (session.state !== "INGESTED") {
      throw new ApiInputError(
        "LIVE_PREVIEW_STATE_INVALID",
        "Sanitized analyst preview must be created before the Belief Test",
        409,
      );
    }
    const artifact = await artifacts(context, options).find(session.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "Session artifact was not found",
        404,
      );
    }
    const routing = routeArtifactConcept(artifact.manifest);
    if (routing.kind !== "selected") {
      throw new ApiInputError(
        routing.kind === "choice_required"
          ? "CONCEPT_CHOICE_REQUIRED"
          : routing.kind === "unsupported_artifact"
            ? "ARTIFACT_UNSUPPORTED"
            : "INSUFFICIENT_EVIDENCE",
        routing.kind === "choice_required"
          ? "More than one released concept pack matches this notebook"
          : routing.kind === "unsupported_artifact"
            ? (routing.reasons[0]?.message ??
              "No released concept pack supports this artifact")
            : "The notebook does not contain enough resolved evidence for a live analyst call",
        routing.kind === "choice_required" ? 409 : 422,
      );
    }
    requireApplicableClaim(routing.concept, learnerClaim);
    const sanitizedContent = buildSanitizedAnalystContext({
      sessionId: session.id,
      learnerClaim,
      manifest: artifact.manifest,
      concept: routing.concept,
    });
    const outboundPackets = approvedLiveReasoningPackets(sanitizedContent);
    return context.json(
      jsonSuccess({
        schemaVersion: "1" as const,
        concept: routing.concept,
        conceptTitle: getConceptPack(routing.concept).title,
        previewHash: await hashCanonical(outboundPackets),
        requiresSensitiveApproval:
          sanitizedContent.privacy.suppressedFieldCount > 0 ||
          sanitizedContent.privacy.redactions.length > 0,
        sanitizedContent,
        learningDirectorPacket: outboundPackets.learningDirector,
      }),
    );
  });

  app.post("/api/sessions/:sessionId/belief-test", async (context) => {
    const input = BeliefRequestSchema.parse(await readJson(context));
    const { learnerClaim } = input;
    const service = sessionService(context, options);
    const session = await service.getSession(context.req.param("sessionId"));
    requireMutableSession(session);
    const artifact = await artifacts(context, options).find(session.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "Session artifact was not found",
        404,
      );
    }

    if (
      session.mode.kind === "sample_lesson" &&
      learnerClaim !== SAMPLE_LEAKAGE_QUESTION
    ) {
      throw new ApiInputError(
        "SAMPLE_CLAIM_MISMATCH",
        "This fixed sample supports only its disclosed customer-generalization question. Start a live investigation for a custom claim.",
        400,
      );
    }

    const routing = routeArtifactConcept(artifact.manifest);
    if (routing.kind === "unsupported_artifact") {
      throw new ApiInputError(
        "ARTIFACT_UNSUPPORTED",
        routing.reasons[0]?.message ??
          "No released concept pack supports this artifact",
        422,
      );
    }
    if (routing.kind === "choice_required") {
      throw new ApiInputError(
        "CONCEPT_CHOICE_REQUIRED",
        "More than one released concept pack matches this notebook",
        409,
      );
    }
    if (routing.kind === "insufficient_evidence") {
      const concept = routing.candidates[0] ?? "entity_leakage";
      if (session.mode.kind === "live_notebook") {
        requireApplicableClaim(concept, learnerClaim);
      }
      const insufficient: BeliefSpecV2 = {
        schemaVersion: "2",
        id: `belief_insufficient_${session.id}`,
        concept,
        claim: learnerClaim,
        evidenceRefs: [],
        hypotheses: [
          {
            id: "current",
            statement: learnerClaim,
            conditions: [
              "The notebook must expose a supported evaluation design.",
            ],
            nonClaims: [
              "CounterLab has not established whether this claim is true or false.",
            ],
            evidence: [],
            supportedCandidateExperimentIds: [],
          },
          {
            id: "competing",
            statement:
              "A different evaluation boundary may change the reported result.",
            conditions: [
              "The notebook must expose enough split and metric evidence to test this alternative.",
            ],
            nonClaims: [
              "Missing evidence is not evidence for this competing explanation.",
            ],
            evidence: [],
            supportedCandidateExperimentIds: [],
          },
        ],
        alternatives: [],
        uncertainty: 1,
        supportState: "INSUFFICIENT_EVIDENCE",
        learnerDecision: "UNDECIDED",
      };
      const proposed = await service.proposeBeliefSpecV2(
        session.id,
        insufficient,
        { actor: "system", modelId: "concept-router-v1" },
      );
      return context.json(
        jsonSuccess(await statePayload(context, proposed, options)),
      );
    }

    if (session.mode.kind === "live_notebook") {
      requireApplicableClaim(routing.concept, learnerClaim);
      const sanitizedContent = buildSanitizedAnalystContext({
        sessionId: session.id,
        learnerClaim,
        manifest: artifact.manifest,
        concept: routing.concept,
      });
      const outboundPackets = approvedLiveReasoningPackets(sanitizedContent);
      const expectedPreviewHash = await hashCanonical(outboundPackets);
      if (input.previewHash !== expectedPreviewHash) {
        throw new ApiInputError(
          "SANITIZED_PREVIEW_REQUIRED",
          "Review the current sanitized analyst preview before starting live reasoning",
          409,
        );
      }
      const containsSensitiveRedaction =
        sanitizedContent.privacy.suppressedFieldCount > 0 ||
        sanitizedContent.privacy.redactions.length > 0;
      if (
        containsSensitiveRedaction &&
        input.sensitiveContentApproved !== true
      ) {
        throw new ApiInputError(
          "SENSITIVE_CONTENT_APPROVAL_REQUIRED",
          "Explicit approval is required because sensitive-looking content was redacted",
          409,
        );
      }

      const analystOperationKey = `${session.id}:${expectedPreviewHash}`;
      const analystAdmission = await admitOperation(context, options, {
        kind: "analyst",
        sessionId: session.id,
        operationKey: analystOperationKey,
      });
      if (analystAdmission.leaseStatus === "already-active") {
        const retryAfterSeconds = Math.max(
          1,
          Math.ceil(
            ((analystAdmission.leaseExpiresAt ??
              requestNow(options).getTime() + 1_000) -
              requestNow(options).getTime()) /
              1_000,
          ),
        );
        throw new ApiInputError(
          "ANALYST_IN_PROGRESS",
          "The same sanitized analyst request is already in progress",
          409,
          true,
          retryAfterSeconds,
        );
      }
      try {
        const analyst = createLiveBeliefAnalystFromEnv({
          OPENAI_API_KEY: context.env?.OPENAI_API_KEY,
          OPENAI_BASE_URL: context.env?.OPENAI_BASE_URL,
          OPENAI_MODEL: context.env?.OPENAI_MODEL,
          OPENAI_REASONING_EFFORT: context.env?.OPENAI_REASONING_EFFORT,
          OPENAI_TIMEOUT_MS: context.env?.OPENAI_TIMEOUT_MS,
        });
        const result = await analyst.proposeBeliefSpec({
          sessionId: session.id,
          learnerClaim,
          manifest: artifact.manifest,
          concept: routing.concept,
        });
        let proposed = await service.proposeBeliefSpecV2(
          session.id,
          result.beliefSpec,
          {
            actor: "gpt-5.6",
            modelId: result.provenance.modelId,
            promptHash: result.provenance.promptHash,
          },
        );
        if (result.beliefSpec.supportState === "SUPPORTED") {
          try {
            const directorResult = await createLiveLearningDirectorFromEnv(
              {
                OPENAI_API_KEY: context.env?.OPENAI_API_KEY,
                OPENAI_BASE_URL: context.env?.OPENAI_BASE_URL,
                OPENAI_MODEL: context.env?.OPENAI_MODEL,
                OPENAI_REASONING_EFFORT: context.env?.OPENAI_REASONING_EFFORT,
                OPENAI_TIMEOUT_MS: context.env?.OPENAI_TIMEOUT_MS,
              },
              {
                registries: learningDirectorRegistries(
                  result.beliefSpec.concept,
                ),
                sessionId: session.id,
              },
            ).decide(outboundPackets.learningDirector);
            proposed = await service.recordLearningDirector(
              session.id,
              LearningDirectorSessionStateSchema.parse({
                schemaVersion: "1",
                beliefSpecHash: await hashCanonical(result.beliefSpec),
                approvedPacketHash: expectedPreviewHash,
                subjectPackVersion:
                  outboundPackets.learningDirector.subjectPackVersion,
                clarificationUsed:
                  directorResult.decision.status === "CLARIFICATION_REQUIRED",
                decision: directorResult.decision,
                provenance: directorResult.provenance,
              }),
            );
          } catch (error) {
            if (!(error instanceof LearningDirectorError)) throw error;
          }
        }
        return context.json(
          jsonSuccess(await statePayload(context, proposed, options)),
        );
      } finally {
        await releaseAdmissionBestEffort(
          context,
          options,
          "analyst",
          analystOperationKey,
        );
      }
    }

    const analyst = new ApprovedSampleBeliefAnalyst();
    const result = await analyst.propose({
      sessionId: session.id,
      learnerClaim: SAMPLE_LEAKAGE_QUESTION,
      manifest: artifact.manifest,
      concept: routing.concept,
    });
    const beliefTest: BeliefTest = result.beliefTest;
    if (result.provenance.mode !== "approved-sample") {
      throw new BeliefAnalystError(
        "INVALID_RESPONSE",
        "The sample lesson received non-sample belief authority",
      );
    }
    const proposed = await service.proposeBeliefTest(session.id, beliefTest, {
      actor: "system",
      modelId: result.provenance.approvalId,
    });
    return context.json(
      jsonSuccess(await statePayload(context, proposed, options)),
    );
  });

  app.post("/api/sessions/:sessionId/learning-director", async (context) => {
    const input = LearningDirectorAnswerSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    const directorState = current.learningDirector;
    if (
      current.state !== "BELIEF_TEST_PROPOSED" ||
      current.mode.kind !== "live_notebook" ||
      current.beliefSpec === undefined ||
      directorState?.decision.status !== "CLARIFICATION_REQUIRED"
    ) {
      throw new ApiInputError(
        "LEARNING_DIRECTOR_NOT_AWAITING_ANSWER",
        "This investigation is not awaiting a Learning Director clarification",
        409,
      );
    }
    if (!directorState.decision.choices.includes(input.answer)) {
      throw new ApiInputError(
        "LEARNING_DIRECTOR_ANSWER_INVALID",
        "Choose one of the fixed clarification answers",
        400,
      );
    }
    const artifact = await artifacts(context, options).find(current.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "Session artifact was not found",
        404,
      );
    }
    const sanitizedContent = buildSanitizedAnalystContext({
      sessionId,
      learnerClaim: current.beliefSpec.claim,
      manifest: artifact.manifest,
      concept: current.beliefSpec.concept,
    });
    const approvedPackets = approvedLiveReasoningPackets(sanitizedContent);
    if (
      (await hashCanonical(approvedPackets)) !==
      directorState.approvedPacketHash
    ) {
      throw new ApiInputError(
        "LEARNING_DIRECTOR_PACKET_CHANGED",
        "The approved Learning Director packet no longer matches this investigation",
        409,
      );
    }

    const answerHash = await hashCanonical(input.answer);
    const operationKey = `${sessionId}:director:${answerHash}`;
    const admission = await admitOperation(context, options, {
      kind: "analyst",
      sessionId,
      operationKey,
    });
    if (admission.leaseStatus === "already-active") {
      throw new ApiInputError(
        "ANALYST_IN_PROGRESS",
        "This Learning Director answer is already being processed",
        409,
        true,
        1,
      );
    }
    try {
      const result = await createLiveLearningDirectorFromEnv(
        {
          OPENAI_API_KEY: context.env?.OPENAI_API_KEY,
          OPENAI_BASE_URL: context.env?.OPENAI_BASE_URL,
          OPENAI_MODEL: context.env?.OPENAI_MODEL,
          OPENAI_REASONING_EFFORT: context.env?.OPENAI_REASONING_EFFORT,
          OPENAI_TIMEOUT_MS: context.env?.OPENAI_TIMEOUT_MS,
        },
        {
          registries: learningDirectorRegistries(current.beliefSpec.concept),
          sessionId,
        },
      ).decide(learningDirectorPacket(sanitizedContent, true, input.answer));
      const updated = await service.recordLearningDirector(
        sessionId,
        LearningDirectorSessionStateSchema.parse({
          schemaVersion: "1",
          beliefSpecHash: directorState.beliefSpecHash,
          approvedPacketHash: directorState.approvedPacketHash,
          subjectPackVersion: directorState.subjectPackVersion,
          clarificationUsed: true,
          decision: result.decision,
          provenance: result.provenance,
        }),
        { clarificationAnswerHash: answerHash },
      );
      return context.json(
        jsonSuccess(await statePayload(context, updated, options)),
      );
    } finally {
      await releaseAdmissionBestEffort(
        context,
        options,
        "analyst",
        operationKey,
      );
    }
  });

  app.post("/api/sessions/:sessionId/belief-test/confirm", async (context) => {
    const input = ConfirmationSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    if (input.action === "confirm") {
      return context.json(
        jsonSuccess(
          await statePayload(
            context,
            await service.confirmBeliefTest(sessionId),
            options,
          ),
        ),
      );
    }
    if (input.action === "edit") {
      if (current.beliefSpec !== undefined) {
        if (!("beliefSpec" in input)) {
          throw new SessionInputError(
            "A live Belief Spec edit cannot submit a v1 Belief Test",
          );
        }
        return context.json(
          jsonSuccess(
            await statePayload(
              context,
              await service.editBeliefSpecV2(sessionId, input.beliefSpec),
              options,
            ),
          ),
        );
      }
      if (!("beliefTest" in input)) {
        throw new SessionInputError(
          "A sample Belief Test edit cannot submit a v2 Belief Spec",
        );
      }
      return context.json(
        jsonSuccess(
          await statePayload(
            context,
            await service.editBeliefTest(sessionId, input.beliefTest),
            options,
          ),
        ),
      );
    }
    if (input.action === "reject") {
      return context.json(
        jsonSuccess(
          await statePayload(
            context,
            await service.rejectBeliefTest(sessionId, input.reason),
            options,
          ),
        ),
      );
    }
    return context.json(
      jsonSuccess(
        await statePayload(
          context,
          await service.markInsufficientEvidence(sessionId, input.reason),
          options,
        ),
      ),
    );
  });

  app.post("/api/sessions/:sessionId/prediction", async (context) => {
    const input = PredictionRequestSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    const beliefAuthority = getSessionBeliefAuthority(current);
    if (beliefAuthority === undefined) {
      throw new SessionInputError(
        "A confirmed Belief Test or Belief Spec is required",
      );
    }
    const committedAt = (options.now?.() ?? new Date()).toISOString();
    const base = {
      schemaVersion: "1" as const,
      id: `prediction_${crypto.randomUUID()}`,
      sessionId,
      beliefTestId: beliefAuthority.id,
      choice: input.choice,
      ...(input.numericRange === undefined
        ? {}
        : { numericRange: input.numericRange }),
      confidence: input.confidence,
      committedAt,
    };
    const prediction = {
      ...base,
      immutableHash: await hashCanonical(base),
    };
    return context.json(
      jsonSuccess(
        await statePayload(
          context,
          await service.commitPrediction(sessionId, prediction),
          options,
        ),
      ),
      201,
    );
  });

  app.post("/api/sessions/:sessionId/lab/compile", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    if (current.mode.kind === "live_notebook") {
      const dispatcher = runnerDispatcher(context, options);
      if (dispatcher === undefined) {
        throw new ApiInputError(
          "LOCAL_RUNNER_REQUIRED",
          "Live Codex compilation requires a configured CounterLab runner",
          503,
        );
      }
      const beliefAuthority = getSessionBeliefAuthority(current);
      if (beliefAuthority === undefined || current.prediction === undefined) {
        throw new ApiInputError(
          "LIVE_CONTRACTS_REQUIRED",
          "A confirmed Belief Test or Belief Spec and immutable prediction are required",
          409,
        );
      }
      if (
        current.beliefSpec !== undefined &&
        (current.beliefSpec.learnerDecision !== "CONFIRMED" ||
          current.beliefSpec.supportState !== "SUPPORTED")
      ) {
        throw new ApiInputError(
          "BELIEF_SPEC_NOT_APPROVED",
          "Live v5 compilation requires a confirmed, supported Belief Spec",
          409,
        );
      }
      const artifact = await artifacts(context, options).find(
        current.artifactId,
      );
      if (artifact === undefined) {
        throw new ApiInputError(
          "ARTIFACT_NOT_FOUND",
          "Session artifact was not found",
          404,
        );
      }
      const routing = routeArtifactConcept(artifact.manifest);
      const routedConcepts =
        routing.kind === "selected"
          ? [routing.concept]
          : routing.kind === "choice_required"
            ? routing.candidates.map((candidate) => candidate.concept)
            : [];
      if (!routedConcepts.includes(beliefAuthority.concept)) {
        throw new ApiInputError(
          "CONCEPT_ROUTE_MISMATCH",
          "The approved belief authority does not match a supported artifact concept",
          409,
        );
      }
      const pack = getConceptPack(beliefAuthority.concept);
      const v5Compile = current.beliefSpec !== undefined;
      const boundarySweep = registeredBoundarySweep(pack);
      const manifestHash = await hashCanonical(artifact.manifest);
      const beliefAuthorityHash = await hashCanonical(beliefAuthority);
      const packContractHash = await hashCanonical({
        id: pack.id,
        version: pack.version,
        allowedOperations: pack.allowedOperations,
        allowedMetrics: pack.allowedMetrics,
        allowedVisualizations: pack.allowedVisualizations,
        verifierInvariants: pack.verifierContract.invariants,
        candidateExperimentIds: pack.scientificMethod.candidateExperimentIds,
        ...(v5Compile
          ? {
              boundarySweep,
              fixedExecutionContract:
                pack.scientificMethod.fixedExecutionContract,
              transferTask: pack.transferTask,
            }
          : {}),
        planRequirements: pack.experimentPlanRules,
      });
      const scientificPromptHash = await hashCanonical({
        promptVersion: "scientific-method-compile-v4",
        conceptPack: { id: pack.id, version: pack.version },
        packContractHash,
        candidateExperimentIds: pack.scientificMethod.candidateExperimentIds,
        boundarySweep,
        fixedExecutionContract: pack.scientificMethod.fixedExecutionContract,
        transferTask: pack.transferTask,
        schemaHashes: {
          discriminationContract: await hashCanonical(
            discriminationContractSchema,
          ),
          experimentIr: await hashCanonical(experimentIrSchema),
          labScene: await hashCanonical(labSceneDraftSchema),
        },
      });
      const requestIdentity = liveRunnerRequestIdentity({
        sessionId,
        purpose: "LAB_COMPILE",
        artifactId: artifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: { id: pack.id, version: pack.version },
        authorityProfileHash: await hashCanonical(
          v5Compile
            ? {
                compiler: "codex-app-server-stdio",
                contractVersion: "scientific-method-v5",
                schemas: {
                  discriminationContractSchema,
                  experimentIrSchema,
                  labSceneDraftSchema,
                },
                boundarySweep,
                fixedExecutionContract:
                  pack.scientificMethod.fixedExecutionContract,
                resourceLimits: {
                  wallSeconds: SCIENTIFIC_COMPILER_ATTEMPT_WALL_SECONDS,
                  memoryMb: 768,
                  maxRuns: 4,
                },
                permittedOutputs: [
                  "discrimination-contract.json",
                  "experiment-ir.json",
                  "lab-scene.json",
                  "public-rationale.md",
                ],
              }
            : {
                compiler: "codex-app-server-stdio",
                contractVersion: "experiment-plan-v2",
                experimentPlanSchema,
                resourceLimits: {
                  wallSeconds: 45,
                  memoryMb: 768,
                  maxRuns: 4,
                },
                permittedOutputs: [
                  "experiment-plan.json",
                  "public-rationale.md",
                ],
              },
        ),
        authorityInputHashes: {
          artifactManifest: manifestHash,
          [v5Compile ? "beliefSpec" : "beliefTest"]: beliefAuthorityHash,
          prediction: current.prediction.immutableHash,
          conceptPack: packContractHash,
          ...(v5Compile ? { compilerPrompt: scientificPromptHash } : {}),
        },
      });
      const jobs = runnerJobService(context, options);
      const reusable = await jobs.findReusableRequest(requestIdentity);
      if (reusable !== undefined) {
        const runnerJob = await dispatchRecoverableRunnerJob({
          context,
          options,
          jobs,
          dispatcher,
          job: reusable,
        });
        return context.json(
          jsonSuccess({
            ...(await statePayload(context, current, options)),
            runnerJob,
            reused: true as const,
          }),
          202,
        );
      }
      const started =
        current.state === "LAB_COMPILING"
          ? current
          : await service.startLabCompilation(sessionId, {
              actor: "system",
              authority: "runtime-codex-requested",
            });
      const jobId = requestId(options, "runner_job");
      const bundle =
        current.beliefSpec === undefined
          ? RunnerLabCompileBundleSchema.parse({
              schemaVersion: "1",
              kind: "LAB_COMPILE",
              jobId,
              sessionId,
              stateVersion: started.version,
              artifactManifestHash: manifestHash,
              approvedBeliefTest: current.beliefTest,
              prediction: current.prediction,
              artifactManifest: artifact.manifest,
              conceptPack: {
                id: pack.id,
                version: pack.version,
                title: pack.title,
                allowedOperations: pack.allowedOperations,
                allowedMetrics: pack.allowedMetrics,
                allowedVisualizations: pack.allowedVisualizations,
                verifierInvariants: pack.verifierContract.invariants,
                planRequirements: pack.experimentPlanRules,
              },
              experimentPlanSchema,
              resourceLimits: {
                wallSeconds: 45,
                memoryMb: 768,
                maxRuns: 4,
              },
              permittedOutputs: ["experiment-plan.json", "public-rationale.md"],
            })
          : RunnerLabCompileBundleV5Schema.parse({
              schemaVersion: "5",
              kind: "LAB_COMPILE",
              jobId,
              sessionId,
              stateVersion: started.version,
              artifactManifestHash: manifestHash,
              approvedBeliefSpec: current.beliefSpec,
              beliefSpecHash: beliefAuthorityHash,
              prediction: current.prediction,
              artifactManifest: artifact.manifest,
              conceptPack: {
                id: pack.id,
                version: pack.version,
                title: pack.title,
                allowedOperations: pack.allowedOperations,
                allowedMetrics: pack.allowedMetrics,
                allowedVisualizations: pack.allowedVisualizations,
                verifierInvariants: pack.verifierContract.invariants,
                candidateExperimentIds:
                  pack.scientificMethod.candidateExperimentIds,
                boundarySweep,
                fixedExecutionContract:
                  pack.scientificMethod.fixedExecutionContract,
                transferTask: pack.transferTask,
                planRequirements: pack.experimentPlanRules,
              },
              schemas: {
                discriminationContract: discriminationContractSchema,
                experimentIr: experimentIrSchema,
                labScene: labSceneDraftSchema,
              },
              provenance: {
                generatorId: "codex-app-server-stdio-v1",
                promptHash: scientificPromptHash,
                inputHashes: [
                  manifestHash,
                  beliefAuthorityHash,
                  current.prediction.immutableHash,
                  packContractHash,
                ],
              },
              resourceLimits: {
                wallSeconds: SCIENTIFIC_COMPILER_ATTEMPT_WALL_SECONDS,
                memoryMb: 768,
                maxRuns: 4,
              },
              permittedOutputs: [
                "discrimination-contract.json",
                "experiment-ir.json",
                "lab-scene.json",
                "public-rationale.md",
              ],
            });
      const inputBundleHash = await hashCanonical(bundle);
      const inputBundleKey = `runner-input/${jobId}.json`;
      await runnerObjectStore(context, options).put(
        inputBundleKey,
        JSON.stringify(bundle),
        "application/json",
      );
      const claimed = await jobs.createOrReuseJob({
        jobId,
        kind: "LAB_COMPILE",
        sessionId,
        artifactId: artifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: { id: pack.id, version: pack.version },
        inputHashes: [
          manifestHash,
          beliefAuthorityHash,
          current.prediction.immutableHash,
          inputBundleHash,
        ],
        requestIdentity,
        stateVersion: started.version,
        maxAttempts: SCIENTIFIC_COMPILER_MAX_ATTEMPTS,
        timeoutSeconds: v5Compile
          ? SCIENTIFIC_COMPILER_JOB_TIMEOUT_SECONDS
          : 180,
      });
      const starting = await dispatchRecoverableRunnerJob({
        context,
        options,
        jobs,
        dispatcher,
        job: claimed.job,
      });
      return context.json(
        jsonSuccess({
          ...(await statePayload(context, started, options)),
          runnerJob: starting,
          ...(claimed.reused ? { reused: true as const } : {}),
        }),
        202,
      );
    }
    const sampleArtifact = await artifacts(context, options).find(
      current.artifactId,
    );
    const sampleAuthority = await requireApprovedSampleAuthority(
      sampleArtifact,
      "MODE_ARTIFACT_MISMATCH",
    );
    await service.startLabCompilation(sessionId, {
      actor: "system",
      authority: "fixed-approved-sample",
    });
    const verified = await service.verifyLab(
      sessionId,
      sampleAuthority.verification,
      [...sampleAuthority.evidenceHashes],
      sampleAuthority.operationSummary,
    );
    return context.json(
      jsonSuccess(await statePayload(context, verified, options)),
    );
  });

  app.get("/api/runner/jobs/:jobId/input", async (context) => {
    const jobId = context.req.param("jobId");
    const { claims } = await authorizeRunner(context, options, jobId);
    const input = await runnerObjectStore(context, options).get(
      claims.inputBundleKey,
    );
    if (input === undefined) {
      throw new ApiInputError(
        "RUNNER_INPUT_NOT_FOUND",
        "The sanitized runner input bundle was not found",
        404,
      );
    }
    return new Response(input.body, {
      headers: {
        "content-type": input.contentType,
        "cache-control": "no-store",
      },
    });
  });

  app.get("/api/runner/jobs/:jobId/source", async (context) => {
    const jobId = context.req.param("jobId");
    const { claims, job } = await authorizeRunner(context, options, jobId);
    if (
      job.kind !== "PATCH_COMPILE" ||
      (job.status !== "RUNNING" && job.status !== "REPAIRING")
    ) {
      throw new ApiInputError(
        "RUNNER_SOURCE_NOT_PERMITTED",
        "Source bytes are available only to an active fixed patch job",
        403,
      );
    }
    const artifact = await artifacts(context, options).find(job.artifactId);
    if (artifact?.objectKey === undefined) {
      throw new ApiInputError(
        "RUNNER_SOURCE_NOT_FOUND",
        "The scoped source notebook was not found",
        404,
      );
    }
    const [inputObject, planObject, session] = await Promise.all([
      runnerObjectStore(context, options).get(claims.inputBundleKey),
      runnerObjectStore(context, options).get(
        `${claims.outputPrefix}patch-plan.json`,
      ),
      sessionService(context, options).getSession(job.sessionId),
    ]);
    if (inputObject === undefined || planObject === undefined) {
      throw new ApiInputError(
        "PATCH_PLAN_NOT_VERIFIED",
        "Source bytes remain sealed until the external Patch Plan verifier passes",
        409,
      );
    }
    try {
      const versionedBundle = VersionedRunnerJobInputBundleSchema.parse(
        JSON.parse(inputObject.body),
      );
      if (versionedBundle.kind !== "PATCH_COMPILE") {
        throw new SyntaxError("runner input is not a Patch Compile bundle");
      }
      const planInput = JSON.parse(planObject.body) as unknown;
      if (versionedBundle.schemaVersion === "5") {
        const bundle = RunnerPatchCompileBundleV5Schema.parse(versionedBundle);
        const authority = await resolveRunnerPatchAuthorityV5({
          store: runnerObjectStore(context, options),
          jobs: runnerJobService(context, options),
          job,
          session,
          artifact,
          bundle,
        });
        await verifyPatchPlan(planInput, {
          sessionId: session.id,
          manifest: artifact.manifest,
          beliefSpec: authority.evidenceAuthority.beliefSpec,
          verifiedResultHash: authority.evidenceAuthority.result.resultHash,
          transferResultHash: bundle.transferResult.resultHash,
          conceptPackVersion: job.conceptPack.version,
          allowedTransformations: bundle.patchContract.allowedTransformations,
          allowedCellIndices: bundle.allowedCellIndices,
        });
      } else {
        if (
          session.beliefTest === undefined ||
          session.verifiedResult === undefined ||
          session.transferResult?.outcome !== "PASSED"
        ) {
          throw new ApiInputError(
            "PATCH_PLAN_NOT_VERIFIED",
            "Source bytes remain sealed until the external Patch Plan verifier passes",
            409,
          );
        }
        const bundle = RunnerPatchCompileBundleSchema.parse(versionedBundle);
        await verifyPatchPlan(planInput, {
          sessionId: session.id,
          manifest: artifact.manifest,
          beliefTest: session.beliefTest,
          verifiedResultHash: session.verifiedResult.resultHash,
          transferResultHash: session.transferResult.resultHash,
          conceptPackVersion: job.conceptPack.version,
          allowedTransformations: bundle.patchContract.allowedTransformations,
          allowedCellIndices: bundle.allowedCellIndices,
        });
      }
    } catch (error) {
      if (
        error instanceof PatchPlanVerificationError ||
        error instanceof SyntaxError ||
        error instanceof ZodError
      ) {
        throw new ApiInputError(
          "PATCH_PLAN_NOT_VERIFIED",
          "Source bytes remain sealed until the external Patch Plan verifier passes",
          409,
        );
      }
      throw error;
    }
    const source = await runnerObjectStore(context, options).get(
      artifact.objectKey,
    );
    if (
      source === undefined ||
      (await sha256Text(source.body)) !== artifact.manifest.fileSha256
    ) {
      throw new ApiInputError(
        "RUNNER_SOURCE_HASH_MISMATCH",
        "The scoped source notebook does not match the artifact manifest",
        409,
      );
    }
    return new Response(source.body, {
      headers: {
        "content-type": "application/x-ipynb+json; charset=utf-8",
        "cache-control": "no-store",
        "content-disposition": "attachment; filename=source-notebook.ipynb",
      },
    });
  });

  app.post("/api/runner/jobs/:jobId/start", async (context) => {
    const jobId = context.req.param("jobId");
    const { job } = await authorizeRunner(context, options, jobId);
    const started = await runnerJobService(context, options).startJob(
      jobId,
      job.runnerIdentity ?? "authenticated-runner",
    );
    return context.json(
      jsonSuccess({
        runnerJob: started.job,
        ...(started.reused ? { reused: true as const } : {}),
      }),
    );
  });

  app.post("/api/runner/jobs/:jobId/events", async (context) => {
    const jobId = context.req.param("jobId");
    const { claims, job } = await authorizeRunner(context, options, jobId);
    if (job.status !== "RUNNING" && job.status !== "REPAIRING") {
      throw new ApiInputError(
        "RUNNER_JOB_NOT_ACTIVE",
        "Compiler events are accepted only while a runner job is active",
        409,
      );
    }
    const event = PublicCompilerEventSchema.parse(await readJson(context));
    if (
      job.kind === "LAB_RUN" &&
      ["verifier.verified", "verifier.rejected", "result.ready"].includes(
        event.kind,
      )
    ) {
      const inputObject = await runnerObjectStore(context, options).get(
        claims.inputBundleKey,
      );
      if (inputObject === undefined) {
        throw new ApiInputError(
          "RUNNER_INPUT_MISSING",
          "The authenticated runner input bundle is missing",
          409,
        );
      }
      let declaredVersion: unknown;
      try {
        const raw = JSON.parse(inputObject.body) as unknown;
        declaredVersion =
          raw !== null && typeof raw === "object" && !Array.isArray(raw)
            ? (raw as Record<string, unknown>).schemaVersion
            : undefined;
        if (declaredVersion === "5") {
          const bundle = VersionedRunnerJobInputBundleSchema.parse(raw);
          if (bundle.kind !== "LAB_RUN") {
            throw new SyntaxError("runner input is not a LAB_RUN bundle");
          }
        }
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof ZodError) {
          throw new ApiInputError(
            "RUNNER_INPUT_INVALID",
            "The scientific run input bundle is invalid",
            409,
          );
        }
        throw error;
      }
      if (declaredVersion === "5") {
        throw new ApiInputError(
          "RUNNER_EVENT_NOT_PERMITTED",
          "Scientific verifier and result authority events are emitted only by the Worker control plane",
          403,
        );
      }
    }
    const updated = await runnerJobService(context, options).appendEvent(
      jobId,
      job.jobVersion,
      event,
    );
    return context.json(jsonSuccess({ runnerJob: updated }), 201);
  });

  app.put("/api/runner/jobs/:jobId/outputs/:generatedPath", async (context) => {
    const jobId = context.req.param("jobId");
    const { claims, job } = await authorizeRunner(context, options, jobId);
    const jobs = runnerJobService(context, options);
    if (job.status !== "RUNNING" && job.status !== "REPAIRING") {
      throw new ApiInputError(
        "RUNNER_JOB_NOT_ACTIVE",
        "Runner outputs are accepted only while a job is active",
        409,
      );
    }
    const generatedPath = RunnerOutputPathSchema.parse(
      context.req.param("generatedPath"),
    );
    let permitted: Set<string>;
    if (job.kind === "LAB_COMPILE") {
      const inputObject = await runnerObjectStore(context, options).get(
        claims.inputBundleKey,
      );
      if (inputObject === undefined) {
        throw new ApiInputError(
          "RUNNER_INPUT_MISSING",
          "The authenticated runner input bundle is missing",
          409,
        );
      }
      const bundle = VersionedRunnerJobInputBundleSchema.parse(
        JSON.parse(inputObject.body),
      );
      if (
        bundle.kind !== "LAB_COMPILE" ||
        bundle.jobId !== job.jobId ||
        bundle.sessionId !== job.sessionId
      ) {
        throw new ApiInputError(
          "RUNNER_INPUT_LINEAGE_MISMATCH",
          "The runner input bundle does not belong to this compile job",
          409,
        );
      }
      permitted = new Set(bundle.permittedOutputs);
    } else if (job.kind === "LAB_RUN") {
      const inputObject = await runnerObjectStore(context, options).get(
        claims.inputBundleKey,
      );
      if (inputObject === undefined) {
        throw new ApiInputError(
          "RUNNER_INPUT_MISSING",
          "The authenticated runner input bundle is missing",
          409,
        );
      }
      const bundle = VersionedRunnerJobInputBundleSchema.parse(
        JSON.parse(inputObject.body),
      );
      if (
        bundle.kind !== "LAB_RUN" ||
        bundle.jobId !== job.jobId ||
        bundle.sessionId !== job.sessionId
      ) {
        throw new ApiInputError(
          "RUNNER_INPUT_LINEAGE_MISMATCH",
          "The runner input bundle does not belong to this run job",
          409,
        );
      }
      permitted = new Set(bundle.permittedOutputs);
    } else {
      permitted = new Set([
        "patch-plan.json",
        "public-rationale.md",
        "patched-notebook.ipynb",
        "patch-result.json",
      ]);
    }
    if (!permitted.has(generatedPath)) {
      throw new ApiInputError(
        "RUNNER_OUTPUT_NOT_PERMITTED",
        `Output ${generatedPath} is not permitted for ${job.kind}`,
        403,
      );
    }
    const outputClaim = await jobs.claimOutputWrite(
      jobId,
      job.jobVersion,
      context.get("requestId"),
      generatedPath,
    );
    try {
      const body = await readBoundedText(
        context,
        generatedPath.endsWith(".ipynb")
          ? maxNotebookBytes(context)
          : 1_048_576,
      );
      const contentType = generatedPath.endsWith(".json")
        ? "application/json"
        : generatedPath.endsWith(".ipynb")
          ? "application/x-ipynb+json; charset=utf-8"
          : "text/markdown; charset=utf-8";
      await jobs.assertOutputWriteClaim(jobId, outputClaim.claim);
      await runnerObjectStore(context, options).put(
        `${claims.outputPrefix}${generatedPath}`,
        body,
        contentType,
      );
      await jobs.assertOutputWriteClaim(jobId, outputClaim.claim);
      return context.json(
        jsonSuccess({ path: generatedPath, sha256: await sha256Text(body) }),
        201,
      );
    } finally {
      await jobs.releaseOutputWriteClaim(jobId, outputClaim.claim);
    }
  });

  app.post("/api/runner/jobs/:jobId/resume", async (context) => {
    const jobId = context.req.param("jobId");
    const { job } = await authorizeRunner(context, options, jobId);
    if (job.status !== "REPAIRING") {
      throw new ApiInputError(
        "RUNNER_JOB_NOT_REPAIRING",
        "Only a repairing runner job can resume compilation",
        409,
      );
    }
    const resumed = await runnerJobService(context, options).transition(
      jobId,
      job.jobVersion,
      "RUNNING",
      { runnerIdentity: job.runnerIdentity ?? "authenticated-runner" },
    );
    return context.json(jsonSuccess({ runnerJob: resumed }));
  });

  app.post("/api/runner/jobs/:jobId/candidate", async (context) => {
    const jobId = context.req.param("jobId");
    const { claims, job } = await authorizeRunner(context, options, jobId);
    if (
      (job.kind !== "LAB_COMPILE" && job.kind !== "PATCH_COMPILE") ||
      job.status !== "RUNNING"
    ) {
      throw new ApiInputError(
        "RUNNER_CANDIDATE_NOT_ACCEPTED",
        "Plan candidates are accepted only for an active compile job",
        409,
      );
    }
    const inputObject = await runnerObjectStore(context, options).get(
      claims.inputBundleKey,
    );
    if (inputObject === undefined) {
      throw new ApiInputError(
        "RUNNER_INPUT_MISSING",
        "The authenticated runner input bundle is missing",
        409,
      );
    }
    const inputBundle = VersionedRunnerJobInputBundleSchema.parse(
      JSON.parse(inputObject.body),
    );
    if (
      inputBundle.kind !== job.kind ||
      inputBundle.jobId !== job.jobId ||
      inputBundle.sessionId !== job.sessionId
    ) {
      throw new ApiInputError(
        "RUNNER_INPUT_LINEAGE_MISMATCH",
        "The runner input bundle does not belong to this compile job",
        409,
      );
    }
    const candidateInput = await readJson(context);
    if (
      inputBundle.kind === "LAB_COMPILE" &&
      inputBundle.schemaVersion === "5"
    ) {
      const scientificBundle =
        RunnerLabCompileBundleV5Schema.parse(inputBundle);
      const scientificCandidate =
        RunnerScientificCandidateV5Schema.parse(candidateInput);
      if (scientificCandidate.attempt !== job.attempt) {
        throw new ApiInputError(
          "RUNNER_ATTEMPT_MISMATCH",
          "Candidate attempt does not match the runner job attempt",
          409,
        );
      }
      const paths = scientificBundle.permittedOutputs;
      const bodies = new Map<(typeof paths)[number], string>();
      for (const path of paths) {
        const output = await runnerObjectStore(context, options).get(
          `${claims.outputPrefix}${path}`,
        );
        if (output === undefined) {
          throw new ApiInputError(
            "RUNNER_CANDIDATE_LINEAGE_MISSING",
            `Scientific candidate output ${path} is missing`,
            409,
          );
        }
        if (
          (await sha256Text(output.body)) !==
          scientificCandidate.artifactHashes[path]
        ) {
          throw new ApiInputError(
            "RUNNER_OUTPUT_HASH_MISMATCH",
            `Scientific candidate output ${path} does not match the declared hash`,
            409,
          );
        }
        bodies.set(path, output.body);
      }
      const artifact = await artifacts(context, options).find(job.artifactId);
      const session = await sessionService(context, options).getSession(
        job.sessionId,
      );
      if (
        artifact === undefined ||
        session.beliefSpec === undefined ||
        session.prediction === undefined
      ) {
        throw new ApiInputError(
          "RUNNER_CANDIDATE_LINEAGE_MISSING",
          "Scientific candidate lineage is incomplete",
          409,
        );
      }
      const [
        inputBundleHash,
        artifactManifestHash,
        bundledManifestHash,
        beliefSpecHash,
        bundledBeliefSpecHash,
        predictionHash,
        bundledPredictionHash,
      ] = await Promise.all([
        hashCanonical(scientificBundle),
        hashCanonical(artifact.manifest),
        hashCanonical(scientificBundle.artifactManifest),
        hashCanonical(session.beliefSpec),
        hashCanonical(scientificBundle.approvedBeliefSpec),
        hashCanonical(session.prediction),
        hashCanonical(scientificBundle.prediction),
      ]);
      if (
        !job.inputHashes.includes(inputBundleHash) ||
        artifactManifestHash !== job.artifactManifestHash ||
        bundledManifestHash !== artifactManifestHash ||
        beliefSpecHash !== scientificBundle.beliefSpecHash ||
        bundledBeliefSpecHash !== beliefSpecHash ||
        predictionHash !== bundledPredictionHash ||
        scientificBundle.stateVersion !== job.stateVersion ||
        scientificBundle.conceptPack.id !== job.conceptPack.id ||
        scientificBundle.conceptPack.version !== job.conceptPack.version
      ) {
        throw new ApiInputError(
          "RUNNER_INPUT_LINEAGE_MISMATCH",
          "Scientific candidate authority does not match the current session",
          409,
        );
      }

      const parseArtifact = (path: (typeof paths)[number]): unknown => {
        const body = bodies.get(path) ?? "";
        try {
          return JSON.parse(body) as unknown;
        } catch {
          return null;
        }
      };
      const verifierStartedAt = performance.now();
      const outcome = await verifyScientificCandidateV5({
        bundle: scientificBundle,
        artifacts: {
          discriminationContract: parseArtifact("discrimination-contract.json"),
          experimentIr: parseArtifact("experiment-ir.json"),
          labScene: parseArtifact("lab-scene.json"),
          publicRationale: bodies.get("public-rationale.md") ?? "",
        },
      });
      const verifierDurationMs = Math.max(
        0,
        Math.round(performance.now() - verifierStartedAt),
      );
      const authorityPrefix = `runner-authority/${jobId}/`;
      const store = runnerObjectStore(context, options);
      await store.put(
        `${authorityPrefix}candidate-verification.json`,
        JSON.stringify(outcome.report),
        "application/json",
      );
      if (outcome.selection !== undefined) {
        await store.put(
          `${authorityPrefix}experiment-selection.json`,
          JSON.stringify(outcome.selection),
          "application/json",
        );
      }

      const jobs = runnerJobService(context, options);
      let updatedJob = job;
      if (outcome.disposition === "VERIFIED") {
        await Promise.all([
          ...paths.map((path) =>
            store.put(
              `${authorityPrefix}compiler-output/${path}`,
              bodies.get(path) ?? "",
              path.endsWith(".json")
                ? "application/json"
                : "text/markdown; charset=utf-8",
            ),
          ),
          store.put(
            `${authorityPrefix}selected-experiment-ir.json`,
            JSON.stringify(outcome.selectedIr),
            "application/json",
          ),
          store.put(
            `${authorityPrefix}experiment-plan.json`,
            JSON.stringify(outcome.executionPlan),
            "application/json",
          ),
        ]);
        updatedJob = await jobs.appendEvent(jobId, updatedJob.jobVersion, {
          schemaVersion: "1",
          eventId: requestId(options, "compiler_event"),
          jobId,
          cursor: updatedJob.eventCursor + 1,
          at: requestNow(options).toISOString(),
          kind: "verifier.verified",
          invariantCount: outcome.report.invariantCount,
          mutationCount: 0,
        });
        return context.json(
          jsonSuccess({
            status: "VERIFIED" as const,
            canRepair: false,
            counterexamples: [],
            nextCursor: updatedJob.eventCursor,
            verifierDurationMs,
            runnerJob: updatedJob,
            verification: outcome.report,
            selection: outcome.selection,
            selectedIrHash: outcome.selectedIrHash,
            executionPlanHash: outcome.executionPlanHash,
          }),
        );
      }

      const counterexamples = outcome.report.invariants
        .filter((invariant) => !invariant.passed)
        .map((invariant) => ({
          invariant: invariant.name,
          observed: invariant.observed ?? null,
          expected: invariant.expected ?? null,
          counterexample:
            invariant.counterexample ??
            `Candidate violated ${invariant.name.replaceAll("_", " ")}.`,
        }));
      for (const counterexample of counterexamples) {
        updatedJob = await jobs.appendEvent(jobId, updatedJob.jobVersion, {
          schemaVersion: "1",
          eventId: requestId(options, "compiler_event"),
          jobId,
          cursor: updatedJob.eventCursor + 1,
          at: requestNow(options).toISOString(),
          kind: "verifier.rejected",
          ...counterexample,
        });
      }
      const canRepair = updatedJob.attempt < updatedJob.maxAttempts;
      if (canRepair) {
        updatedJob = await jobs.transition(
          jobId,
          updatedJob.jobVersion,
          "REPAIRING",
          {
            runnerIdentity: updatedJob.runnerIdentity ?? "authenticated-runner",
          },
        );
      }
      return context.json(
        jsonSuccess({
          status: "REJECTED" as const,
          canRepair,
          counterexamples,
          nextCursor: updatedJob.eventCursor,
          verifierDurationMs,
          runnerJob: updatedJob,
          verification: outcome.report,
          ...(outcome.selection === undefined
            ? {}
            : { selection: outcome.selection }),
        }),
      );
    }
    if (
      inputBundle.kind === "PATCH_COMPILE" &&
      inputBundle.schemaVersion === "5"
    ) {
      const bundle = RunnerPatchCompileBundleV5Schema.parse(inputBundle);
      const candidate = LegacyRunnerCandidateSchema.parse(candidateInput);
      if (candidate.attempt !== job.attempt) {
        throw new ApiInputError(
          "RUNNER_ATTEMPT_MISMATCH",
          "Candidate attempt does not match the runner job attempt",
          409,
        );
      }
      const [artifact, session, planObject] = await Promise.all([
        artifacts(context, options).find(job.artifactId),
        sessionService(context, options).getSession(job.sessionId),
        runnerObjectStore(context, options).get(
          `${claims.outputPrefix}patch-plan.json`,
        ),
      ]);
      if (artifact === undefined || planObject === undefined) {
        throw new ApiInputError(
          "RUNNER_CANDIDATE_LINEAGE_MISSING",
          "Patch Plan candidate lineage is incomplete",
          409,
        );
      }
      if ((await sha256Text(planObject.body)) !== candidate.planSha256) {
        throw new ApiInputError(
          "RUNNER_OUTPUT_HASH_MISMATCH",
          "Patch Plan candidate bytes do not match the declared hash",
          409,
        );
      }
      const authority = await resolveRunnerPatchAuthorityV5({
        store: runnerObjectStore(context, options),
        jobs: runnerJobService(context, options),
        job,
        session,
        artifact,
        bundle,
      });
      let planInput: unknown = null;
      try {
        planInput = JSON.parse(planObject.body) as unknown;
      } catch {
        planInput = null;
      }
      const verifierStartedAt = performance.now();
      let report: Awaited<ReturnType<typeof verifyPatchPlan>>;
      try {
        report = await verifyPatchPlan(planInput, {
          sessionId: session.id,
          manifest: artifact.manifest,
          beliefSpec: authority.evidenceAuthority.beliefSpec,
          verifiedResultHash: authority.evidenceAuthority.result.resultHash,
          transferResultHash: bundle.transferResult.resultHash,
          conceptPackVersion: job.conceptPack.version,
          allowedTransformations: bundle.patchContract.allowedTransformations,
          allowedCellIndices: bundle.allowedCellIndices,
        });
      } catch (error) {
        if (!(error instanceof PatchPlanVerificationError)) throw error;
        report = error.report;
      }
      const verifierDurationMs = Math.max(
        0,
        Math.round(performance.now() - verifierStartedAt),
      );
      const store = runnerObjectStore(context, options);
      await store.put(
        `runner-authority/${jobId}/patch-plan-verification.json`,
        JSON.stringify(report),
        "application/json",
      );
      const jobs = runnerJobService(context, options);
      let updatedJob = job;
      if (report.status === "VERIFIED") {
        updatedJob = await jobs.appendEvent(jobId, updatedJob.jobVersion, {
          schemaVersion: "1",
          eventId: requestId(options, "compiler_event"),
          jobId,
          cursor: updatedJob.eventCursor + 1,
          at: requestNow(options).toISOString(),
          kind: "verifier.verified",
          invariantCount: report.invariantCount,
          mutationCount: 0,
        });
        return context.json(
          jsonSuccess({
            status: "VERIFIED" as const,
            canRepair: false,
            counterexamples: [],
            nextCursor: updatedJob.eventCursor,
            verifierDurationMs,
            runnerJob: updatedJob,
            verification: report,
          }),
        );
      }
      const counterexamples = report.invariants
        .filter((invariant) => !invariant.passed)
        .map((invariant) => ({
          invariant: invariant.name,
          observed: invariant.observed ?? null,
          expected: invariant.expected ?? null,
          counterexample:
            invariant.counterexample ??
            `Candidate violated ${invariant.name.replaceAll("_", " ")}.`,
        }));
      for (const counterexample of counterexamples) {
        updatedJob = await jobs.appendEvent(jobId, updatedJob.jobVersion, {
          schemaVersion: "1",
          eventId: requestId(options, "compiler_event"),
          jobId,
          cursor: updatedJob.eventCursor + 1,
          at: requestNow(options).toISOString(),
          kind: "verifier.rejected",
          ...counterexample,
        });
      }
      const canRepair = updatedJob.attempt < updatedJob.maxAttempts;
      if (canRepair) {
        updatedJob = await jobs.transition(
          jobId,
          updatedJob.jobVersion,
          "REPAIRING",
          {
            runnerIdentity: updatedJob.runnerIdentity ?? "authenticated-runner",
          },
        );
      }
      return context.json(
        jsonSuccess({
          status: "REJECTED" as const,
          canRepair,
          counterexamples,
          nextCursor: updatedJob.eventCursor,
          verifierDurationMs,
          runnerJob: updatedJob,
          verification: report,
        }),
      );
    }
    const candidate = LegacyRunnerCandidateSchema.parse(candidateInput);
    if (candidate.attempt !== job.attempt) {
      throw new ApiInputError(
        "RUNNER_ATTEMPT_MISMATCH",
        "Candidate attempt does not match the runner job attempt",
        409,
      );
    }
    const artifact = await artifacts(context, options).find(job.artifactId);
    const session = await sessionService(context, options).getSession(
      job.sessionId,
    );
    const planObject = await runnerObjectStore(context, options).get(
      `${claims.outputPrefix}${
        job.kind === "LAB_COMPILE" ? "experiment-plan.json" : "patch-plan.json"
      }`,
    );
    if (
      artifact === undefined ||
      session.beliefTest === undefined ||
      planObject === undefined
    ) {
      throw new ApiInputError(
        "RUNNER_CANDIDATE_LINEAGE_MISSING",
        "Plan candidate lineage is incomplete",
        409,
      );
    }
    if ((await sha256Text(planObject.body)) !== candidate.planSha256) {
      throw new ApiInputError(
        "RUNNER_OUTPUT_HASH_MISMATCH",
        "Plan candidate bytes do not match the declared hash",
        409,
      );
    }

    let planInput: unknown = null;
    try {
      planInput = JSON.parse(planObject.body) as unknown;
    } catch {
      planInput = null;
    }
    const verifierStartedAt = performance.now();
    let report:
      | Awaited<ReturnType<typeof verifyExperimentPlan>>
      | Awaited<ReturnType<typeof verifyPatchPlan>>;
    try {
      if (job.kind === "LAB_COMPILE") {
        report = await verifyExperimentPlan(planInput, {
          sessionId: job.sessionId,
          manifest: artifact.manifest,
          beliefTest: session.beliefTest,
        });
      } else {
        const inputObject = await runnerObjectStore(context, options).get(
          claims.inputBundleKey,
        );
        if (
          inputObject === undefined ||
          session.verifiedResult === undefined ||
          session.transferResult?.outcome !== "PASSED"
        ) {
          throw new ApiInputError(
            "RUNNER_CANDIDATE_LINEAGE_MISSING",
            "Patch Plan lineage is incomplete",
            409,
          );
        }
        const bundle = RunnerPatchCompileBundleSchema.parse(
          JSON.parse(inputObject.body),
        );
        report = await verifyPatchPlan(planInput, {
          sessionId: session.id,
          manifest: artifact.manifest,
          beliefTest: session.beliefTest,
          verifiedResultHash: session.verifiedResult.resultHash,
          transferResultHash: session.transferResult.resultHash,
          conceptPackVersion: job.conceptPack.version,
          allowedTransformations: bundle.patchContract.allowedTransformations,
          allowedCellIndices: bundle.allowedCellIndices,
        });
      }
    } catch (error) {
      if (
        !(error instanceof PlanVerificationError) &&
        !(error instanceof PatchPlanVerificationError)
      ) {
        throw error;
      }
      report = error.report;
    }
    const verifierDurationMs = Math.max(
      0,
      Math.round(performance.now() - verifierStartedAt),
    );

    const jobs = runnerJobService(context, options);
    let updatedJob = job;
    if (report.status === "VERIFIED") {
      updatedJob = await jobs.appendEvent(jobId, updatedJob.jobVersion, {
        schemaVersion: "1",
        eventId: requestId(options, "compiler_event"),
        jobId,
        cursor: updatedJob.eventCursor + 1,
        at: requestNow(options).toISOString(),
        kind: "verifier.verified",
        invariantCount: report.invariantCount,
        mutationCount: 0,
      });
      return context.json(
        jsonSuccess({
          status: "VERIFIED" as const,
          canRepair: false,
          counterexamples: [],
          nextCursor: updatedJob.eventCursor,
          verifierDurationMs,
          runnerJob: updatedJob,
          verification: report,
        }),
      );
    }

    const failed = report.invariants.filter((invariant) => !invariant.passed);
    const counterexamples = failed.map((invariant) => ({
      invariant: invariant.name,
      observed: invariant.observed ?? null,
      expected: invariant.expected ?? null,
      counterexample:
        invariant.counterexample ??
        `Candidate violated ${invariant.name.replaceAll("_", " ")}.`,
    }));
    for (const counterexample of counterexamples) {
      updatedJob = await jobs.appendEvent(jobId, updatedJob.jobVersion, {
        schemaVersion: "1",
        eventId: requestId(options, "compiler_event"),
        jobId,
        cursor: updatedJob.eventCursor + 1,
        at: requestNow(options).toISOString(),
        kind: "verifier.rejected",
        ...counterexample,
      });
    }
    const canRepair = updatedJob.attempt < updatedJob.maxAttempts;
    if (canRepair) {
      updatedJob = await jobs.transition(
        jobId,
        updatedJob.jobVersion,
        "REPAIRING",
        { runnerIdentity: updatedJob.runnerIdentity ?? "authenticated-runner" },
      );
    }
    return context.json(
      jsonSuccess({
        status: "REJECTED" as const,
        canRepair,
        counterexamples,
        nextCursor: updatedJob.eventCursor,
        verifierDurationMs,
        runnerJob: updatedJob,
        verification: report,
      }),
    );
  });

  app.get("/api/sessions/:sessionId/jobs/:jobId/events", async (context) => {
    const sessionId = context.req.param("sessionId");
    const jobId = context.req.param("jobId");
    const jobs = runnerJobService(context, options);
    const existingJob = await jobs.getJob(jobId);
    if (existingJob.sessionId !== sessionId) {
      throw new ApiInputError(
        "RUNNER_JOB_SESSION_MISMATCH",
        "Runner job does not belong to this session",
        404,
      );
    }
    const job = await jobs.expireIfTimedOut(jobId);
    if (job.status === "TIMED_OUT") {
      await releaseAdmissionBestEffort(
        context,
        options,
        "runner",
        job.requestFingerprint,
      );
      const service = sessionService(context, options);
      const current = await service.getSession(sessionId);
      if (job.kind === "LAB_COMPILE" && current.state === "LAB_COMPILING") {
        await service.rejectLab(sessionId, {
          code: "RUNNER_JOB_TIMED_OUT",
          jobId,
        });
      } else if (
        job.kind === "PATCH_COMPILE" &&
        current.state === "PATCH_COMPILING"
      ) {
        await service.rejectPatch(sessionId, {
          code: "RUNNER_JOB_TIMED_OUT",
          jobId,
        });
      }
    }
    const rawAfter = context.req.query("after") ?? "0";
    const after = Number(rawAfter);
    if (!Number.isInteger(after) || after < 0) {
      throw new ApiInputError(
        "INVALID_EVENT_CURSOR",
        "Event cursor must be a non-negative integer",
        400,
      );
    }
    const events = await jobs.listEvents(jobId, after);
    return context.json(
      jsonSuccess({
        jobId,
        events,
        nextCursor: events.at(-1)?.cursor ?? after,
        jobStatus: job.status,
        ...(job.error === undefined ? {} : { jobError: job.error }),
        terminal: [
          "VERIFIED",
          "REJECTED",
          "FAILED",
          "CANCELLED",
          "TIMED_OUT",
        ].includes(job.status),
      }),
    );
  });

  app.post("/api/sessions/:sessionId/jobs/:jobId/cancel", async (context) => {
    const sessionId = context.req.param("sessionId");
    const jobId = context.req.param("jobId");
    const service = sessionService(context, options);
    const session = await service.getSession(sessionId);
    requireMutableSession(session);
    if (session.mode.kind !== "live_notebook") {
      throw new ApiInputError(
        "RUNNER_CANCEL_MODE_MISMATCH",
        "Only a live notebook job can be cancelled",
        409,
      );
    }
    const jobs = runnerJobService(context, options);
    const job = await jobs.getJob(jobId);
    if (job.sessionId !== sessionId || job.artifactId !== session.artifactId) {
      throw new ApiInputError(
        "RUNNER_JOB_SESSION_MISMATCH",
        "Runner job does not belong to this session",
        404,
      );
    }
    const projectCancellation = async () => {
      const latest = await service.getSession(sessionId);
      if (job.kind === "LAB_COMPILE" && latest.state === "LAB_COMPILING") {
        return service.rejectLab(sessionId, {
          code: "RUNNER_JOB_CANCELLED",
          jobId,
        });
      }
      if (job.kind === "PATCH_COMPILE" && latest.state === "PATCH_COMPILING") {
        return service.rejectPatch(sessionId, {
          code: "RUNNER_JOB_CANCELLED",
          jobId,
        });
      }
      return latest;
    };
    if (job.status === "CANCELLED") {
      await releaseAdmissionBestEffort(
        context,
        options,
        "runner",
        job.requestFingerprint,
      );
      const projectedSession = await projectCancellation();
      return context.json(
        jsonSuccess({
          ...(await statePayload(context, projectedSession, options)),
          runnerJob: job,
          reused: true as const,
          runnerAcknowledged: true,
        }),
      );
    }
    if (["VERIFIED", "REJECTED", "FAILED", "TIMED_OUT"].includes(job.status)) {
      await releaseAdmissionBestEffort(
        context,
        options,
        "runner",
        job.requestFingerprint,
      );
      throw new ApiInputError(
        "RUNNER_JOB_NOT_ACTIVE",
        `Runner job is already terminal with status ${job.status}`,
        409,
      );
    }
    const dispatcher = runnerDispatcher(context, options);
    if (dispatcher === undefined) {
      throw new ApiInputError(
        "LOCAL_RUNNER_REQUIRED",
        "Runner cancellation requires a configured CounterLab runner",
        503,
      );
    }
    const nowEpochSeconds = Math.floor(requestNow(options).getTime() / 1_000);
    const token = await issueRunnerJobToken(
      {
        schemaVersion: "2",
        issuer: "counterlab-control-plane",
        audience: "counterlab-runner",
        purpose: "CANCEL_JOB",
        controlPlaneOrigin: new URL(context.req.url).origin,
        tokenId: requestId(options, "runner_cancel_token"),
        jobId,
        sessionId,
        artifactManifestHash: job.artifactManifestHash,
        inputBundleKey: `runner-input/${jobId}.json`,
        outputPrefix: `runner-output/${jobId}/`,
        callbackPath: `/api/runner/jobs/${jobId}/callback`,
        stateVersion: job.stateVersion,
        issuedAt: nowEpochSeconds,
        expiresAt: nowEpochSeconds + 60,
      },
      runnerSigningPrivateKey(context, options),
    );
    const cancelled = await jobs.cancelJob(jobId);
    await releaseAdmissionBestEffort(
      context,
      options,
      "runner",
      cancelled.requestFingerprint,
    );
    const updatedSession = await projectCancellation();
    let runnerAcknowledged = true;
    try {
      await dispatcher.cancel({
        job: cancelled,
        token,
        controlPlaneUrl: new URL(context.req.url).origin,
      });
    } catch {
      runnerAcknowledged = false;
    }
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, updatedSession, options)),
        runnerJob: cancelled,
        reused: false as const,
        runnerAcknowledged,
      }),
    );
  });

  app.post("/api/runner/jobs/:jobId/callback", async (context) => {
    const jobId = context.req.param("jobId");
    const callbackPath = `/api/runner/jobs/${jobId}/callback`;
    const { claims } = await authorizeRunner(
      context,
      options,
      jobId,
      callbackPath,
    );
    const callback = RunnerCallbackSchema.parse(await readJson(context));
    if (callback.jobId !== jobId) {
      throw new ApiInputError(
        "RUNNER_CALLBACK_JOB_MISMATCH",
        "Runner callback does not match the authorized job",
        403,
      );
    }
    const jobs = runnerJobService(context, options);
    const claimedCallback = await jobs.claimCallback(
      callback,
      context.get("requestId"),
    );
    const job = claimedCallback.job;
    const callbackClaim = claimedCallback.duplicate
      ? undefined
      : claimedCallback.claim;
    if (callbackClaim !== undefined) {
      context.set("runnerCallbackClaim", { jobId, claim: callbackClaim });
    }
    const service = sessionService(context, options);
    const currentSession = await service.getSession(job.sessionId);
    if (
      currentSession.artifactId !== job.artifactId ||
      currentSession.mode.kind !== "live_notebook"
    ) {
      throw new ApiInputError(
        "RUNNER_CALLBACK_SESSION_MISMATCH",
        "Runner callback does not match a live artifact session",
        409,
      );
    }
    const storedLabAuthority = HostedExperimentLineageV5Schema.safeParse(
      currentSession.labVerification,
    );
    const storedPlanAuthority = HostedPlanLineageSchema.safeParse(
      currentSession.labVerification,
    );
    const callbackAlreadyProjected =
      (storedLabAuthority.success && storedLabAuthority.data.jobId === jobId) ||
      (storedPlanAuthority.success &&
        storedPlanAuthority.data.jobId === jobId) ||
      currentSession.resultAuthority?.jobId === jobId ||
      currentSession.boundaryMapAuthority?.jobId === jobId ||
      currentSession.patchAuthority?.jobId === jobId;
    if (claimedCallback.duplicate && callbackAlreadyProjected) {
      let duplicateSession = currentSession;
      if (
        job.kind === "PATCH_COMPILE" &&
        currentSession.patchAuthority?.jobId === jobId &&
        (currentSession.state === "PATCH_VERIFIED" ||
          currentSession.state === "REASONING_DIFF_ISSUED" ||
          currentSession.state === "PROOF_CAPSULE_ISSUED")
      ) {
        const artifact = await artifacts(context, options).find(job.artifactId);
        if (artifact === undefined) {
          throw new ApiInputError(
            "PROOF_AUTHORITY_MISSING",
            "The source Artifact Manifest is unavailable for native proof issuance",
            409,
          );
        }
        duplicateSession = await finalizeNativeProofV5({
          service,
          jobs,
          store: runnerObjectStore(context, options),
          session: currentSession,
          manifest: artifact.manifest,
          ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
            ? {}
            : { signingKey: context.env.COUNTERLAB_SIGNING_KEY }),
          ...(context.env?.COUNTERLAB_SIGNING_KEY_ID === undefined
            ? {}
            : { signingKeyId: context.env.COUNTERLAB_SIGNING_KEY_ID }),
        });
      }
      return context.json(
        jsonSuccess({
          duplicate: true as const,
          runnerJob: job,
          session: await statePayload(context, duplicateSession, options),
          verification: null,
        }),
      );
    }

    let verification:
      | Awaited<ReturnType<typeof verifyExperimentPlan>>
      | Awaited<ReturnType<typeof verifyHostedResultSet>>
      | Awaited<ReturnType<typeof verifyPatchPlan>>
      | Awaited<ReturnType<typeof verifyScientificCandidateV5>>["report"]
      | EpistemicVerificationReport
      | BoundaryMapVerificationReportV1
      | null = null;
    let scientificAuthority: Awaited<
      ReturnType<typeof reconstructScientificCompileAuthority>
    > | null = null;
    let verifiedResult: VerifiedResultSet | null = null;
    let epistemicAuthority: Awaited<
      ReturnType<typeof reconstructScientificRunAuthority>
    > | null = null;
    let scientificInteractiveAuthority: Awaited<
      ReturnType<typeof reconstructScientificInteractiveRunAuthority>
    > | null = null;
    let boundaryMapAuthority: Awaited<
      ReturnType<typeof reconstructBoundaryMapAuthority>
    > | null = null;
    let boundaryRun = false;
    let interactiveRun = false;
    let patchResult: PatchResult | null = null;
    let scientificPatch = false;
    let scientificPatchAuthority: HostedPatchAuthorityRefV5 | null = null;
    let terminalCallback: RunnerCallback = callback;
    let terminalAuthorityEvent: PublicCompilerEvent | undefined;
    if (callback.status === "VERIFIED" && job.kind === "LAB_COMPILE") {
      const artifact = await artifacts(context, options).find(job.artifactId);
      const inputObject = await runnerObjectStore(context, options).get(
        claims.inputBundleKey,
      );
      let scientificBundle = false;
      if (inputObject !== undefined) {
        try {
          scientificBundle = RunnerLabCompileBundleV5Schema.safeParse(
            JSON.parse(inputObject.body),
          ).success;
        } catch {
          scientificBundle = false;
        }
      }
      if (scientificBundle) {
        if (artifact === undefined) {
          terminalCallback = {
            ...callback,
            status: "REJECTED",
            error: {
              code: "RUNNER_OUTPUT_MISSING",
              message: "Required scientific artifact lineage is missing",
              retryable: false,
            },
          };
        } else {
          try {
            scientificAuthority = await reconstructScientificCompileAuthority({
              store: runnerObjectStore(context, options),
              job,
              session: currentSession,
              manifest: artifact.manifest,
              inputBundleKey: claims.inputBundleKey,
              outputPrefix: claims.outputPrefix,
              callbackOutputHashes: callback.outputHashes,
            });
            verification = scientificAuthority.outcome.report;
          } catch (error) {
            if (!(error instanceof ApiInputError)) throw error;
            terminalCallback = {
              ...callback,
              status: "REJECTED",
              error: {
                code: error.code,
                message: error.message,
                retryable: false,
              },
            };
          }
        }
      } else {
        const planObject = await runnerObjectStore(context, options).get(
          `${claims.outputPrefix}experiment-plan.json`,
        );
        if (
          artifact === undefined ||
          currentSession.beliefTest === undefined ||
          planObject === undefined
        ) {
          terminalCallback = {
            ...callback,
            status: "REJECTED",
            error: {
              code: "RUNNER_OUTPUT_MISSING",
              message:
                "Required artifact lineage or experiment plan is missing",
              retryable: false,
            },
          };
        } else {
          const rawPlanHash = await sha256Text(planObject.body);
          if (!callback.outputHashes.includes(rawPlanHash)) {
            terminalCallback = {
              ...callback,
              status: "REJECTED",
              error: {
                code: "RUNNER_OUTPUT_HASH_MISMATCH",
                message:
                  "Experiment plan bytes do not match the callback hashes",
                retryable: false,
              },
            };
          } else {
            try {
              verification = await verifyExperimentPlan(
                JSON.parse(planObject.body) as unknown,
                {
                  sessionId: job.sessionId,
                  manifest: artifact.manifest,
                  beliefTest: currentSession.beliefTest,
                },
              );
            } catch (error) {
              if (!(error instanceof PlanVerificationError)) throw error;
              verification = error.report;
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "PLAN_VERIFIER_REJECTED",
                  message: "The external Plan verifier rejected the candidate",
                  retryable: false,
                  details: {
                    failedInvariants: error.report.invariants
                      .filter((invariant) => !invariant.passed)
                      .map((invariant) => invariant.name),
                  },
                },
              };
            }
          }
        }
      }
    }
    if (callback.status === "VERIFIED" && job.kind === "LAB_RUN") {
      const inputObject = await runnerObjectStore(context, options).get(
        claims.inputBundleKey,
      );
      let declaredVersion: unknown;
      let declaredPurpose: unknown;
      if (inputObject !== undefined) {
        try {
          const raw = JSON.parse(inputObject.body) as unknown;
          declaredVersion =
            raw !== null && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>).schemaVersion
              : undefined;
          declaredPurpose =
            raw !== null && typeof raw === "object" && !Array.isArray(raw)
              ? (raw as Record<string, unknown>).purpose
              : undefined;
        } catch {
          declaredVersion = undefined;
          declaredPurpose = undefined;
        }
      }
      if (declaredVersion === "5") {
        const artifact = await artifacts(context, options).find(job.artifactId);
        if (artifact === undefined) {
          terminalCallback = {
            ...callback,
            status: "REJECTED",
            error: {
              code: "RUNNER_OUTPUT_MISSING",
              message: "Required scientific artifact lineage is missing",
              retryable: false,
            },
          };
        } else if (declaredPurpose === "BOUNDARY") {
          boundaryRun = true;
          try {
            const jobs = runnerJobService(context, options);
            const scientificRunJob = await closeScientificRunnerBoundary({
              jobs,
              job,
              callback,
            });
            boundaryMapAuthority = await reconstructBoundaryMapAuthority({
              store: runnerObjectStore(context, options),
              jobs,
              job: scientificRunJob,
              session: currentSession,
              manifest: artifact.manifest,
              inputBundleKey: claims.inputBundleKey,
              outputPrefix: claims.outputPrefix,
              callbackOutputHashes: callback.outputHashes,
              issuedAt: requestNow(options).toISOString(),
              ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
                ? {}
                : {
                    signingKey: context.env.COUNTERLAB_SIGNING_KEY,
                    ...(context.env.COUNTERLAB_SIGNING_KEY_ID === undefined
                      ? {}
                      : {
                          signingKeyId: context.env.COUNTERLAB_SIGNING_KEY_ID,
                        }),
                  }),
            });
            verification = boundaryMapAuthority.report;
            if (boundaryMapAuthority.report.status !== "VERIFIED") {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "BOUNDARY_MAP_VERIFIER_REJECTED",
                  message:
                    "The external Boundary Map verifier withheld result authority",
                  retryable: false,
                  details: {
                    failedInvariants: boundaryMapAuthority.report.invariants
                      .filter((invariant) => !invariant.passed)
                      .map((invariant) => invariant.name),
                  },
                },
              };
            }
            const authorityEvents = await appendBoundaryAuthorityEvents({
              jobs,
              job: scientificRunJob,
              callback,
              callbackClaim,
              authorityAt: requestNow(options).toISOString(),
              report: boundaryMapAuthority.report,
            });
            terminalCallback = {
              ...terminalCallback,
              finalEventCursor: authorityEvents.finalEventCursor,
            };
            terminalAuthorityEvent = authorityEvents.terminalEvent;
          } catch (error) {
            if (!(error instanceof ApiInputError)) throw error;
            terminalCallback = {
              ...callback,
              status: "REJECTED",
              error: {
                code: error.code,
                message: error.message,
                retryable: false,
              },
            };
          }
        } else if (declaredPurpose === "INTERACTIVE") {
          try {
            const jobs = runnerJobService(context, options);
            const scientificRunJob = await closeScientificRunnerBoundary({
              jobs,
              job,
              callback,
            });
            scientificInteractiveAuthority =
              await reconstructScientificInteractiveRunAuthority({
                store: runnerObjectStore(context, options),
                jobs,
                job: scientificRunJob,
                session: currentSession,
                manifest: artifact.manifest,
                inputBundleKey: claims.inputBundleKey,
                outputPrefix: claims.outputPrefix,
                callbackOutputHashes: callback.outputHashes,
              });
            interactiveRun = true;
            verification = scientificInteractiveAuthority.report;
            verifiedResult = scientificInteractiveAuthority.result;
            const authorityEvents = await appendInteractiveAuthorityEvents({
              jobs,
              job: scientificRunJob,
              callback,
              callbackClaim,
              authorityAt: requestNow(options).toISOString(),
              invariantCount:
                scientificInteractiveAuthority.report.invariantCount,
              resultHash: scientificInteractiveAuthority.result.resultHash,
            });
            terminalCallback = {
              ...terminalCallback,
              finalEventCursor: authorityEvents.finalEventCursor,
            };
            terminalAuthorityEvent = authorityEvents.terminalEvent;
          } catch (error) {
            if (error instanceof ResultVerificationError) {
              verification = error.report;
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "RESULT_VERIFIER_REJECTED",
                  message:
                    "The external verifier rejected the interactive result",
                  retryable: false,
                  details: {
                    failedInvariants: error.report.invariants
                      .filter((invariant) => !invariant.passed)
                      .map((invariant) => invariant.name),
                  },
                },
              };
            } else if (error instanceof ApiInputError) {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: error.code,
                  message: error.message,
                  retryable: false,
                },
              };
            } else {
              throw error;
            }
          }
        } else {
          try {
            const jobs = runnerJobService(context, options);
            const scientificRunJob = await closeScientificRunnerBoundary({
              jobs,
              job,
              callback,
            });
            epistemicAuthority = await reconstructScientificRunAuthority({
              store: runnerObjectStore(context, options),
              jobs,
              job: scientificRunJob,
              session: currentSession,
              manifest: artifact.manifest,
              inputBundleKey: claims.inputBundleKey,
              outputPrefix: claims.outputPrefix,
              callbackOutputHashes: callback.outputHashes,
            });
            verification = epistemicAuthority.report;
            if (epistemicAuthority.report.status === "VERIFIED") {
              verifiedResult = epistemicAuthority.result;
            } else {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "EPISTEMIC_VERIFIER_REJECTED",
                  message:
                    "The fixed technical or epistemic verifier withheld result authority",
                  retryable: false,
                  details: {
                    failedFindings: epistemicAuthority.report.findings.map(
                      (finding) => finding.code,
                    ),
                  },
                },
              };
            }
            const authorityEvents = await appendScientificAuthorityEvents({
              jobs,
              job: scientificRunJob,
              callback,
              callbackClaim,
              authorityAt: requestNow(options).toISOString(),
              report: epistemicAuthority.report,
            });
            terminalCallback = {
              ...terminalCallback,
              finalEventCursor: authorityEvents.finalEventCursor,
            };
            terminalAuthorityEvent = authorityEvents.terminalEvent;
          } catch (error) {
            if (!(error instanceof ApiInputError)) throw error;
            terminalCallback = {
              ...callback,
              status: "REJECTED",
              error: {
                code: error.code,
                message: error.message,
                retryable: false,
              },
            };
          }
        }
      } else {
        const resultObject = await runnerObjectStore(context, options).get(
          `${claims.outputPrefix}verified-result.json`,
        );
        if (inputObject === undefined || resultObject === undefined) {
          terminalCallback = {
            ...callback,
            status: "REJECTED",
            error: {
              code: "RUNNER_OUTPUT_MISSING",
              message: "Required Plan input or fixed-kernel result is missing",
              retryable: false,
            },
          };
        } else {
          const rawResultHash = await sha256Text(resultObject.body);
          if (!callback.outputHashes.includes(rawResultHash)) {
            terminalCallback = {
              ...callback,
              status: "REJECTED",
              error: {
                code: "RUNNER_OUTPUT_HASH_MISMATCH",
                message:
                  "Fixed-kernel result bytes do not match the callback hashes",
                retryable: false,
              },
            };
          } else {
            try {
              const bundle = RunnerLabRunBundleSchema.parse(
                JSON.parse(inputObject.body),
              );
              interactiveRun = bundle.purpose === "INTERACTIVE";
              if (
                bundle.jobId !== jobId ||
                bundle.sessionId !== job.sessionId ||
                bundle.artifactManifestHash !== job.artifactManifestHash ||
                (await hashCanonical(bundle)) !== job.inputHashes.at(-1) ||
                (await hashCanonical(bundle.artifactManifest)) !==
                  job.artifactManifestHash
              ) {
                throw new ApiInputError(
                  "RUNNER_INPUT_LINEAGE_MISMATCH",
                  "Fixed-kernel input lineage does not match the runner job",
                  409,
                );
              }
              const result = HostedVerifiedResultSetV2Schema.parse(
                JSON.parse(resultObject.body),
              );
              verification =
                bundle.purpose === "INTERACTIVE"
                  ? result.concept === "class_imbalance"
                    ? await verifyHostedResultSet(result, bundle.experimentPlan)
                    : await verifyInteractiveResultSet(
                        result,
                        bundle.experimentPlan,
                        bundle.experimentPlan.baseline.runId,
                      )
                  : await verifyHostedResultSet(result, bundle.experimentPlan);
              verifiedResult = result;
            } catch (error) {
              if (error instanceof ApiInputError) throw error;
              if (error instanceof ResultVerificationError) {
                verification = error.report;
                terminalCallback = {
                  ...callback,
                  status: "REJECTED",
                  error: {
                    code: "RESULT_VERIFIER_REJECTED",
                    message:
                      "The external result verifier rejected the fixed-kernel payload",
                    retryable: false,
                    details: {
                      failedInvariants: error.report.invariants
                        .filter((invariant) => !invariant.passed)
                        .map((invariant) => invariant.name),
                    },
                  },
                };
              } else if (
                error instanceof SyntaxError ||
                error instanceof ZodError
              ) {
                terminalCallback = {
                  ...callback,
                  status: "REJECTED",
                  error: {
                    code: "RESULT_CONTRACT_REJECTED",
                    message: "The fixed-kernel result contract is invalid",
                    retryable: false,
                  },
                };
              } else {
                throw error;
              }
            }
          }
        }
      }
    }
    if (callback.status === "VERIFIED" && job.kind === "PATCH_COMPILE") {
      const store = runnerObjectStore(context, options);
      const inputObject = await store.get(claims.inputBundleKey);
      let v5Bundle: RunnerPatchCompileBundleV5 | undefined;
      if (inputObject !== undefined) {
        try {
          const parsed = VersionedRunnerJobInputBundleSchema.parse(
            JSON.parse(inputObject.body),
          );
          if (parsed.kind === "PATCH_COMPILE" && parsed.schemaVersion === "5") {
            v5Bundle = RunnerPatchCompileBundleV5Schema.parse(parsed);
          }
        } catch {
          v5Bundle = undefined;
        }
      }
      const artifact = await artifacts(context, options).find(job.artifactId);
      if (v5Bundle !== undefined) {
        const authorityPrefix = `runner-authority/${jobId}/`;
        const [
          mutablePlan,
          mutableRationale,
          mutableResult,
          mutableNotebook,
          frozenPlan,
          frozenRationale,
          frozenResult,
          frozenNotebook,
        ] = await Promise.all([
          store.get(`${claims.outputPrefix}patch-plan.json`),
          store.get(`${claims.outputPrefix}public-rationale.md`),
          store.get(`${claims.outputPrefix}patch-result.json`),
          store.get(`${claims.outputPrefix}patched-notebook.ipynb`),
          store.get(`${authorityPrefix}patch-plan.json`),
          store.get(`${authorityPrefix}public-rationale.md`),
          store.get(`${authorityPrefix}patch-result.json`),
          store.get(`${authorityPrefix}patched-notebook.ipynb`),
        ]);
        const planObject = frozenPlan ?? mutablePlan;
        const rationaleObject = frozenRationale ?? mutableRationale;
        const resultObject = frozenResult ?? mutableResult;
        const notebookObject = frozenNotebook ?? mutableNotebook;
        if (
          artifact === undefined ||
          inputObject === undefined ||
          planObject === undefined ||
          rationaleObject === undefined ||
          resultObject === undefined ||
          notebookObject === undefined
        ) {
          terminalCallback = {
            ...callback,
            status: "REJECTED",
            error: {
              code: "RUNNER_OUTPUT_MISSING",
              message:
                "Required v5 Patch Plan lineage or fixed patch output is missing",
              retryable: false,
            },
          };
        } else {
          try {
            const jobs = runnerJobService(context, options);
            const closedJob = await closeScientificRunnerBoundary({
              jobs,
              job,
              callback,
            });
            const authority = await resolveRunnerPatchAuthorityV5({
              store,
              jobs,
              job: closedJob,
              session: currentSession,
              artifact,
              bundle: v5Bundle,
            });
            const rawHashes = await Promise.all([
              sha256Text(planObject.body),
              sha256Text(rationaleObject.body),
              sha256Text(notebookObject.body),
              sha256Text(resultObject.body),
            ]);
            if (
              JSON.stringify(callback.outputHashes) !==
              JSON.stringify(rawHashes)
            ) {
              throw new ApiInputError(
                "RUNNER_OUTPUT_HASH_MISMATCH",
                "The exact v5 patch output set does not match the terminal callback",
                409,
              );
            }
            verification = await verifyPatchPlan(
              JSON.parse(planObject.body) as unknown,
              {
                sessionId: currentSession.id,
                manifest: artifact.manifest,
                beliefSpec: authority.evidenceAuthority.beliefSpec,
                verifiedResultHash:
                  authority.evidenceAuthority.result.resultHash,
                transferResultHash: v5Bundle.transferResult.resultHash,
                conceptPackVersion: job.conceptPack.version,
                allowedTransformations:
                  v5Bundle.patchContract.allowedTransformations,
                allowedCellIndices: v5Bundle.allowedCellIndices,
              },
            );
            const parsedPatch = PatchResultSchema.parse(
              JSON.parse(resultObject.body),
            );
            const { resultHash: _declaredResultHash, ...patchPayload } =
              parsedPatch;
            if (
              parsedPatch.status !== "VERIFIED" ||
              parsedPatch.sessionId !== currentSession.id ||
              parsedPatch.generatedAt !== v5Bundle.requestedAt ||
              parsedPatch.sourceArtifactHash !== artifact.manifest.fileSha256 ||
              parsedPatch.patchedArtifactHash !== rawHashes[2] ||
              parsedPatch.patchHash !==
                (await hashCanonical(parsedPatch.diff)) ||
              parsedPatch.resultHash !== (await hashCanonical(patchPayload)) ||
              parsedPatch.modifiedCells.some(
                (cell) => !v5Bundle.allowedCellIndices.includes(cell),
              )
            ) {
              throw new ApiInputError(
                "PATCH_RESULT_LINEAGE_MISMATCH",
                "The v5 patch result does not match its source, Plan, or notebook bytes",
                409,
              );
            }
            await persistRunnerAuthorityBytes({
              store,
              key: `${authorityPrefix}patch-plan.json`,
              body: planObject.body,
              contentType: "application/json",
            });
            await persistRunnerAuthorityBytes({
              store,
              key: `${authorityPrefix}public-rationale.md`,
              body: rationaleObject.body,
              contentType: "text/markdown; charset=utf-8",
            });
            await persistRunnerAuthorityBytes({
              store,
              key: `${authorityPrefix}patch-result.json`,
              body: resultObject.body,
              contentType: "application/json",
            });
            await persistRunnerAuthorityBytes({
              store,
              key: `${authorityPrefix}patched-notebook.ipynb`,
              body: notebookObject.body,
              contentType: "application/x-ipynb+json; charset=utf-8",
            });
            await persistScientificAuthority(
              store,
              `${authorityPrefix}patch-plan-verification.json`,
              verification,
            );
            patchResult = parsedPatch;
            scientificPatch = true;
            scientificPatchAuthority = {
              schemaVersion: "5",
              jobId,
              inputBundleHash: await hashCanonical(v5Bundle),
              patchPlanHash: verification.planHash,
              patchPlanFileHash: rawHashes[0],
              rationaleFileHash: rawHashes[1],
              patchPlanVerificationHash: await hashCanonical(verification),
              patchResultHash: parsedPatch.resultHash,
              patchResultFileHash: rawHashes[3],
              patchedArtifactHash: rawHashes[2],
            };
            await store.put(
              `patches/${currentSession.id}/patched-notebook.ipynb`,
              notebookObject.body,
              "application/x-ipynb+json; charset=utf-8",
            );
          } catch (error) {
            if (error instanceof ApiInputError) {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: error.code,
                  message: error.message,
                  retryable: false,
                },
              };
            } else if (error instanceof PatchPlanVerificationError) {
              verification = error.report;
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "PATCH_PLAN_VERIFIER_REJECTED",
                  message:
                    "The external Patch Plan verifier rejected the candidate",
                  retryable: false,
                  details: {
                    failedInvariants: error.report.invariants
                      .filter((invariant) => !invariant.passed)
                      .map((invariant) => invariant.name),
                  },
                },
              };
            } else if (
              error instanceof SyntaxError ||
              error instanceof ZodError
            ) {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "PATCH_CONTRACT_REJECTED",
                  message: "The fixed v5 patch output contract is invalid",
                  retryable: false,
                },
              };
            } else {
              throw error;
            }
          }
        }
      } else {
        const [planObject, resultObject, notebookObject] = await Promise.all([
          store.get(`${claims.outputPrefix}patch-plan.json`),
          store.get(`${claims.outputPrefix}patch-result.json`),
          store.get(`${claims.outputPrefix}patched-notebook.ipynb`),
        ]);
        if (
          artifact === undefined ||
          inputObject === undefined ||
          planObject === undefined ||
          resultObject === undefined ||
          notebookObject === undefined ||
          currentSession.beliefTest === undefined ||
          currentSession.verifiedResult === undefined ||
          currentSession.transferResult?.outcome !== "PASSED"
        ) {
          terminalCallback = {
            ...callback,
            status: "REJECTED",
            error: {
              code: "RUNNER_OUTPUT_MISSING",
              message:
                "Required Patch Plan lineage or fixed patch output is missing",
              retryable: false,
            },
          };
        } else {
          try {
            const bundle = RunnerPatchCompileBundleSchema.parse(
              JSON.parse(inputObject.body),
            );
            if (
              bundle.jobId !== jobId ||
              bundle.sessionId !== job.sessionId ||
              bundle.artifactManifestHash !== job.artifactManifestHash ||
              (await hashCanonical(bundle)) !== job.inputHashes.at(-1) ||
              (await hashCanonical(bundle.artifactManifest)) !==
                job.artifactManifestHash
            ) {
              throw new ApiInputError(
                "RUNNER_INPUT_LINEAGE_MISMATCH",
                "Fixed patch input lineage does not match the runner job",
                409,
              );
            }
            const rawHashes = await Promise.all([
              sha256Text(planObject.body),
              sha256Text(resultObject.body),
              sha256Text(notebookObject.body),
            ]);
            if (
              !rawHashes.every((hash) => callback.outputHashes.includes(hash))
            ) {
              throw new ApiInputError(
                "RUNNER_OUTPUT_HASH_MISMATCH",
                "Fixed patch bytes do not match the callback hashes",
                409,
              );
            }
            verification = await verifyPatchPlan(
              JSON.parse(planObject.body) as unknown,
              {
                sessionId: currentSession.id,
                manifest: artifact.manifest,
                beliefTest: currentSession.beliefTest,
                verifiedResultHash: currentSession.verifiedResult.resultHash,
                transferResultHash: currentSession.transferResult.resultHash,
                conceptPackVersion: job.conceptPack.version,
                allowedTransformations:
                  bundle.patchContract.allowedTransformations,
                allowedCellIndices: bundle.allowedCellIndices,
              },
            );
            const parsedPatch = PatchResultSchema.parse(
              JSON.parse(resultObject.body),
            );
            const { resultHash: _declaredResultHash, ...patchPayload } =
              parsedPatch;
            if (
              parsedPatch.status !== "VERIFIED" ||
              parsedPatch.sessionId !== currentSession.id ||
              parsedPatch.generatedAt !== bundle.requestedAt ||
              parsedPatch.sourceArtifactHash !== artifact.manifest.fileSha256 ||
              parsedPatch.patchedArtifactHash !== rawHashes[2] ||
              parsedPatch.patchHash !==
                (await hashCanonical(parsedPatch.diff)) ||
              parsedPatch.resultHash !== (await hashCanonical(patchPayload)) ||
              parsedPatch.modifiedCells.some(
                (cell) => !bundle.allowedCellIndices.includes(cell),
              )
            ) {
              throw new ApiInputError(
                "PATCH_RESULT_LINEAGE_MISMATCH",
                "The fixed patch result does not match its source, Plan, or notebook bytes",
                409,
              );
            }
            patchResult = parsedPatch;
            await store.put(
              `patches/${currentSession.id}/patched-notebook.ipynb`,
              notebookObject.body,
              "application/x-ipynb+json; charset=utf-8",
            );
          } catch (error) {
            if (error instanceof ApiInputError) {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: error.code,
                  message: error.message,
                  retryable: false,
                },
              };
            } else if (error instanceof PatchPlanVerificationError) {
              verification = error.report;
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "PATCH_PLAN_VERIFIER_REJECTED",
                  message:
                    "The external Patch Plan verifier rejected the candidate",
                  retryable: false,
                  details: {
                    failedInvariants: error.report.invariants
                      .filter((invariant) => !invariant.passed)
                      .map((invariant) => invariant.name),
                  },
                },
              };
            } else if (
              error instanceof SyntaxError ||
              error instanceof ZodError
            ) {
              terminalCallback = {
                ...callback,
                status: "REJECTED",
                error: {
                  code: "PATCH_CONTRACT_REJECTED",
                  message: "The fixed patch output contract is invalid",
                  retryable: false,
                },
              };
            } else {
              throw error;
            }
          }
        }
      }
    }

    const completed = await jobs.recordCallback(terminalCallback, {
      ...(callbackClaim === undefined ? {} : { claim: callbackClaim }),
      claimedCallback: callback,
      ...(terminalAuthorityEvent === undefined
        ? {}
        : { terminalEvent: terminalAuthorityEvent }),
    });
    context.set("runnerCallbackClaim", undefined);
    await releaseAdmissionBestEffort(
      context,
      options,
      "runner",
      completed.job.requestFingerprint,
    );
    let updatedSession = await service.getSession(job.sessionId);
    if (
      job.kind === "LAB_COMPILE" &&
      terminalCallback.status === "VERIFIED" &&
      scientificAuthority !== null
    ) {
      if (updatedSession.state === "LAB_COMPILING") {
        updatedSession = await service.verifyLab(
          job.sessionId,
          scientificAuthority.lineage,
          [
            scientificAuthority.lineage.inputBundleHash,
            scientificAuthority.lineage.artifactManifestHash,
            scientificAuthority.lineage.beliefSpecHash,
            scientificAuthority.lineage.predictionHash,
            ...Object.values(
              scientificAuthority.lineage.compilerOutputFileHashes,
            ),
            scientificAuthority.lineage.discriminationContractHash,
            scientificAuthority.lineage.rawExperimentIrCanonicalHash,
            scientificAuthority.lineage.labSceneHash,
            scientificAuthority.lineage.candidateVerificationReportHash,
            scientificAuthority.lineage.selectionHash,
            scientificAuthority.lineage.selectedExperimentIrHash,
            scientificAuthority.lineage.projectedPlanHash,
          ],
          verifiedScientificOperationSummary(scientificAuthority),
        );
      } else {
        const existing = HostedExperimentLineageV5Schema.safeParse(
          updatedSession.labVerification,
        );
        if (
          !existing.success ||
          (await hashCanonical(existing.data)) !==
            (await hashCanonical(scientificAuthority.lineage))
        ) {
          throw new ApiInputError(
            "RUNNER_PROJECTION_CONFLICT",
            "The terminal scientific callback conflicts with session evidence",
            409,
          );
        }
      }
    } else if (
      job.kind === "LAB_COMPILE" &&
      terminalCallback.status === "VERIFIED" &&
      verification?.status === "VERIFIED" &&
      "planHash" in verification
    ) {
      if (updatedSession.state === "LAB_COMPILING") {
        updatedSession = await service.verifyLab(
          job.sessionId,
          {
            ...verification,
            jobId,
            source: "hosted-plan-v2",
          },
          [
            ...new Set([
              ...terminalCallback.outputHashes,
              verification.planHash,
            ]),
          ],
        );
      } else {
        const existing = HostedPlanLineageSchema.safeParse(
          updatedSession.labVerification,
        );
        if (
          !existing.success ||
          existing.data.jobId !== jobId ||
          existing.data.planHash !== verification.planHash
        ) {
          throw new ApiInputError(
            "RUNNER_PROJECTION_CONFLICT",
            "The terminal Plan callback conflicts with session evidence",
            409,
          );
        }
      }
    } else if (job.kind === "LAB_COMPILE") {
      if (updatedSession.state === "LAB_COMPILING") {
        updatedSession = await service.rejectLab(job.sessionId, {
          jobId,
          status: terminalCallback.status,
          error: terminalCallback.error ?? null,
          verification,
        });
      } else if (updatedSession.state !== "LAB_REJECTED") {
        throw new ApiInputError(
          "RUNNER_PROJECTION_CONFLICT",
          "The rejected Plan callback conflicts with session evidence",
          409,
        );
      }
    } else if (job.kind === "LAB_RUN" && boundaryRun) {
      if (
        terminalCallback.status === "VERIFIED" &&
        boundaryMapAuthority?.report.status === "VERIFIED" &&
        boundaryMapAuthority.authority !== null
      ) {
        const repeatsExistingAuthority =
          updatedSession.boundaryMapAuthority !== undefined &&
          (await hashCanonical(updatedSession.boundaryMapAuthority)) ===
            (await hashCanonical(boundaryMapAuthority.authority));
        if (repeatsExistingAuthority) {
          // A later learner stage may still carry this immutable Boundary Map authority.
        } else if (
          updatedSession.state === "EXPERIMENT_COMPLETED" &&
          updatedSession.boundaryMapAuthority === undefined
        ) {
          updatedSession = await service.recordBoundaryMapAuthority(
            job.sessionId,
            boundaryMapAuthority.authority,
          );
        } else {
          throw new ApiInputError(
            "RUNNER_PROJECTION_CONFLICT",
            "The Boundary Map callback conflicts with session evidence",
            409,
          );
        }
      }
    } else if (job.kind === "LAB_RUN" && epistemicAuthority !== null) {
      const expectedVerdictHash = epistemicAuthority.evidenceVerdictHash;
      if (epistemicAuthority.report.status === "VERIFIED") {
        const resultAuthority: HostedResultAuthorityRefV5 = {
          schemaVersion: "5",
          jobId,
          inputBundleHash: await hashCanonical(epistemicAuthority.bundle),
          resultHash: epistemicAuthority.result.resultHash,
          resultFileHash: epistemicAuthority.rawResultHash,
          technicalReportHash: epistemicAuthority.report.technicalReportHash,
          epistemicReportHash: epistemicAuthority.epistemicReportHash,
          evidenceVerdictHash: expectedVerdictHash,
        };
        const repeatsExistingResult =
          updatedSession.verifiedResult !== undefined &&
          updatedSession.evidenceVerdict !== undefined &&
          (await hashCanonical(updatedSession.verifiedResult)) ===
            (await hashCanonical(epistemicAuthority.result)) &&
          (await hashCanonical(updatedSession.evidenceVerdict)) ===
            expectedVerdictHash &&
          updatedSession.epistemicReportHash ===
            epistemicAuthority.epistemicReportHash &&
          updatedSession.resultAuthority !== undefined &&
          (await hashCanonical(updatedSession.resultAuthority)) ===
            (await hashCanonical(resultAuthority));
        if (repeatsExistingResult) {
          // A later learner stage may still carry this immutable result authority.
        } else if (
          updatedSession.state === "LAB_VERIFIED" &&
          updatedSession.verifiedResult === undefined
        ) {
          updatedSession = await service.recordEpistemicResult(job.sessionId, {
            result: epistemicAuthority.result,
            verdict: epistemicAuthority.report.verdict,
            epistemicReportHash: epistemicAuthority.epistemicReportHash,
            resultAuthority,
          });
        } else {
          throw new ApiInputError(
            "RUNNER_PROJECTION_CONFLICT",
            "The epistemic result callback conflicts with session evidence",
            409,
          );
        }
      } else {
        const repeatsExistingRejection =
          updatedSession.state === "LAB_VERIFIED" &&
          updatedSession.verifiedResult === undefined &&
          updatedSession.evidenceVerdict !== undefined &&
          (await hashCanonical(updatedSession.evidenceVerdict)) ===
            expectedVerdictHash &&
          updatedSession.epistemicReportHash ===
            epistemicAuthority.epistemicReportHash;
        if (repeatsExistingRejection) {
          // The callback receipt and no-release evidence already agree.
        } else if (
          completed.duplicate &&
          (await service.listEvents(job.sessionId)).some(
            (event) =>
              event.kind === "experiment.evidence_rejected" &&
              event.payload.epistemicReportHash ===
                epistemicAuthority.epistemicReportHash,
          )
        ) {
          // A later run superseded this already-projected no-release verdict.
        } else if (
          updatedSession.state === "LAB_VERIFIED" &&
          updatedSession.verifiedResult === undefined
        ) {
          updatedSession = await service.recordEpistemicRejection(
            job.sessionId,
            {
              verdict: epistemicAuthority.report.verdict,
              epistemicReportHash: epistemicAuthority.epistemicReportHash,
            },
          );
        } else {
          throw new ApiInputError(
            "RUNNER_PROJECTION_CONFLICT",
            "The epistemic rejection callback conflicts with session evidence",
            409,
          );
        }
      }
    } else if (
      job.kind === "LAB_RUN" &&
      !interactiveRun &&
      terminalCallback.status === "VERIFIED" &&
      verification?.status === "VERIFIED" &&
      verifiedResult !== null
    ) {
      if (updatedSession.state === "LAB_VERIFIED") {
        updatedSession = await service.recordExperimentResult(
          job.sessionId,
          verifiedResult,
        );
      } else if (
        updatedSession.verifiedResult?.resultHash !== verifiedResult.resultHash
      ) {
        throw new ApiInputError(
          "RUNNER_PROJECTION_CONFLICT",
          "The fixed-kernel callback conflicts with session evidence",
          409,
        );
      }
    } else if (
      job.kind === "PATCH_COMPILE" &&
      terminalCallback.status === "VERIFIED" &&
      verification?.status === "VERIFIED" &&
      patchResult !== null
    ) {
      if (updatedSession.state === "PATCH_COMPILING") {
        updatedSession = await service.verifyPatch(
          job.sessionId,
          patchResult,
          scientificPatchAuthority ?? undefined,
        );
      } else if (
        updatedSession.patchResult?.resultHash !== patchResult.resultHash ||
        (scientificPatch &&
          (scientificPatchAuthority === null ||
            updatedSession.patchAuthority === undefined ||
            (await hashCanonical(updatedSession.patchAuthority)) !==
              (await hashCanonical(scientificPatchAuthority))))
      ) {
        throw new ApiInputError(
          "RUNNER_PROJECTION_CONFLICT",
          "The fixed patch callback conflicts with session evidence",
          409,
        );
      }
      if (updatedSession.state === "PATCH_VERIFIED" && !scientificPatch) {
        const lineage = HostedPlanLineageSchema.parse(
          updatedSession.labVerification,
        );
        const [experimentPlanObject, patchPlanObject] = await Promise.all([
          runnerObjectStore(context, options).get(
            `runner-output/${lineage.jobId}/experiment-plan.json`,
          ),
          runnerObjectStore(context, options).get(
            `${claims.outputPrefix}patch-plan.json`,
          ),
        ]);
        const artifact = await artifacts(context, options).find(job.artifactId);
        if (
          artifact === undefined ||
          experimentPlanObject === undefined ||
          patchPlanObject === undefined ||
          updatedSession.beliefTest === undefined ||
          updatedSession.verifiedResult === undefined ||
          updatedSession.transferResult === undefined
        ) {
          throw new ApiInputError(
            "LIVE_PROOF_LINEAGE_MISSING",
            "Verified patch evidence could not be assembled into a proof",
            409,
          );
        }
        const experimentPlan = ExperimentPlanV2Schema.parse(
          JSON.parse(experimentPlanObject.body),
        );
        const patchPlan = PatchPlanV1Schema.parse(
          JSON.parse(patchPlanObject.body),
        );
        const [planVerification, patchPlanVerification, evidenceEvents] =
          await Promise.all([
            verifyExperimentPlan(experimentPlan, {
              sessionId: updatedSession.id,
              manifest: artifact.manifest,
              beliefTest: updatedSession.beliefTest,
            }),
            verifyPatchPlan(patchPlan, {
              sessionId: updatedSession.id,
              manifest: artifact.manifest,
              beliefTest: updatedSession.beliefTest,
              verifiedResultHash: updatedSession.verifiedResult.resultHash,
              transferResultHash: updatedSession.transferResult.resultHash,
              conceptPackVersion: job.conceptPack.version,
              allowedTransformations: getConceptPack(patchPlan.concept)
                .patchContract.allowedTransformations,
              allowedCellIndices: patchPlan.targetCells,
            }),
            service.listEvents(job.sessionId),
          ]);
        const compilerEvents = [
          ...(await runnerJobService(context, options).listEvents(
            lineage.jobId,
            0,
          )),
          ...(await runnerJobService(context, options).listEvents(jobId, 0)),
        ];
        const proof = createLiveReasoningProof({
          session: updatedSession,
          manifest: artifact.manifest,
          events: evidenceEvents,
          experimentPlan,
          planVerification,
          compilerEvents,
          patchPlan,
          patchPlanVerification,
          issuedAt: terminalCallback.occurredAt,
          ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
            ? {}
            : { signingKey: context.env.COUNTERLAB_SIGNING_KEY }),
        });
        updatedSession = await service.issueReasoningDiff(
          job.sessionId,
          proof.reasoningDiff,
          proof.proofBundle,
        );
      }
      if (scientificPatch) {
        const artifact = await artifacts(context, options).find(job.artifactId);
        if (artifact === undefined) {
          throw new ApiInputError(
            "PROOF_AUTHORITY_MISSING",
            "The source Artifact Manifest is unavailable for native proof issuance",
            409,
          );
        }
        updatedSession = await finalizeNativeProofV5({
          service,
          jobs: runnerJobService(context, options),
          store: runnerObjectStore(context, options),
          session: updatedSession,
          manifest: artifact.manifest,
          ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
            ? {}
            : { signingKey: context.env.COUNTERLAB_SIGNING_KEY }),
          ...(context.env?.COUNTERLAB_SIGNING_KEY_ID === undefined
            ? {}
            : { signingKeyId: context.env.COUNTERLAB_SIGNING_KEY_ID }),
        });
      }
    } else if (job.kind === "PATCH_COMPILE") {
      if (updatedSession.state === "PATCH_COMPILING") {
        updatedSession = await service.rejectPatch(job.sessionId, {
          jobId,
          status: terminalCallback.status,
          error: terminalCallback.error ?? null,
          verification,
        });
      } else if (updatedSession.state !== "PATCH_REJECTED") {
        throw new ApiInputError(
          "RUNNER_PROJECTION_CONFLICT",
          "The rejected patch callback conflicts with session evidence",
          409,
        );
      }
    }
    return context.json(
      jsonSuccess({
        duplicate: completed.duplicate,
        runnerJob: completed.job,
        session: await statePayload(context, updatedSession, options),
        verification,
      }),
    );
  });

  app.get("/api/sessions/:sessionId/events", async (context) => {
    const service = sessionService(context, options);
    const jobs = runnerJobService(context, options);
    const sessionId = context.req.param("sessionId");
    for (
      let attempt = 0;
      attempt < MAX_EVIDENCE_SNAPSHOT_ATTEMPTS;
      attempt += 1
    ) {
      const sessionBefore = await service.getSession(sessionId);
      requireStoredSampleClaimScope(sessionBefore);
      const jobsBefore = await jobs.listForSession(sessionId);
      if (jobsBefore.length > MAX_SESSION_RUNNER_HISTORY_JOBS) {
        throw new ApiInputError(
          "COMPILER_ACTIVITY_LIMIT_EXCEEDED",
          "Stored compiler activity exceeds the bounded proof-history limit",
          409,
        );
      }
      const expectedCompilerEventCount = jobsBefore.reduce(
        (count, job) => count + job.eventCursor,
        0,
      );
      if (expectedCompilerEventCount > MAX_SESSION_COMPILER_HISTORY_EVENTS) {
        throw new ApiInputError(
          "COMPILER_ACTIVITY_LIMIT_EXCEEDED",
          "Stored compiler activity exceeds the bounded proof-history limit",
          409,
        );
      }
      const events = await service.listEvents(sessionId);
      const compilerEvents = (
        await Promise.all(
          jobsBefore.map((job) => jobs.listEvents(job.jobId, 0)),
        )
      ).flat();
      let verified: ReturnType<typeof verifyEvidenceChain>;
      try {
        verified = verifyEvidenceChain(events);
      } catch {
        throw new ApiInputError(
          "EVIDENCE_CHAIN_INVALID",
          "Stored evidence failed integrity validation",
          409,
        );
      }
      if (verified.sessionId !== sessionId) {
        throw new ApiInputError(
          "EVIDENCE_CHAIN_INVALID",
          "Stored evidence failed integrity validation",
          409,
        );
      }
      const sessionAfter = await service.getSession(sessionId);
      const jobsAfter = await jobs.listForSession(sessionId);
      if (
        sessionBefore.version !== sessionAfter.version ||
        canonicalJsonV1(jobsBefore) !== canonicalJsonV1(jobsAfter)
      ) {
        continue;
      }
      if (verified.length !== sessionAfter.version) {
        throw new ApiInputError(
          "EVIDENCE_CHAIN_INVALID",
          "Stored evidence failed integrity validation",
          409,
        );
      }
      const compilerEventIds = new Set<string>();
      let compilerEventIndex = 0;
      for (const job of jobsAfter) {
        for (let cursor = 1; cursor <= job.eventCursor; cursor += 1) {
          const event = compilerEvents[compilerEventIndex];
          if (
            event === undefined ||
            event.jobId !== job.jobId ||
            event.cursor !== cursor ||
            compilerEventIds.has(event.eventId)
          ) {
            throw new ApiInputError(
              "COMPILER_ACTIVITY_INVALID",
              "Stored compiler activity failed cursor and identity validation",
              409,
            );
          }
          compilerEventIds.add(event.eventId);
          compilerEventIndex += 1;
        }
      }
      if (
        compilerEventIndex !== compilerEvents.length ||
        compilerEvents.length !== expectedCompilerEventCount
      ) {
        throw new ApiInputError(
          "COMPILER_ACTIVITY_INVALID",
          "Stored compiler activity failed cursor and identity validation",
          409,
        );
      }
      return context.json(
        jsonSuccess({
          events: verified.events,
          integrity: {
            schemaVersion: "1" as const,
            status: "VERIFIED" as const,
            eventChainHead: verified.headHash,
            eventCount: verified.length,
          },
          compilerEvents,
          compilerActivity: {
            schemaVersion: "1" as const,
            status: "RECORDED" as const,
            ordering: "job-created-at-job-id-then-cursor" as const,
            jobCount: jobsAfter.length,
            eventCount: compilerEvents.length,
          },
        }),
      );
    }
    throw new ApiInputError(
      "EVIDENCE_SNAPSHOT_BUSY",
      "Stored evidence changed while it was being read. Retry the request.",
      503,
      true,
    );
  });

  app.post("/api/sessions/:sessionId/interactions", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    const interaction = LearnerInteractionInputSchema.parse(
      await readJson(context, 4_096),
    );
    const record = LearnerInteractionRecordSchema.parse({
      schemaVersion: "1",
      eventId: interaction.eventId,
      sessionId: session.id,
      actor: "learner",
      mode: session.mode.kind,
      concept: interactionConcept(session),
      timestamp: (options.now?.() ?? new Date()).toISOString(),
      interaction,
    });
    const stored = await learnerInteractions(context, options).append(record);
    const receipt = LearnerInteractionReceiptSchema.parse({
      schemaVersion: "1",
      eventId: record.eventId,
      accepted: true,
      duplicate: stored.duplicate,
    });
    return context.json(jsonSuccess(receipt), stored.duplicate ? 200 : 201);
  });

  app.post("/api/sessions/:sessionId/lab/run", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    const artifact = await artifacts(context, options).find(current.artifactId);
    if (current.mode.kind === "live_notebook") {
      const dispatcher = runnerDispatcher(context, options);
      if (dispatcher === undefined) {
        throw new ApiInputError(
          "LOCAL_RUNNER_REQUIRED",
          "Live fixed-kernel execution requires a configured CounterLab runner",
          503,
        );
      }
      if (artifact === undefined || current.labVerification === undefined) {
        throw new ApiInputError(
          "LIVE_CONTRACTS_REQUIRED",
          "A verified artifact-specific Plan is required before execution",
          409,
        );
      }
      const scientificLineage = HostedExperimentLineageV5Schema.safeParse(
        current.labVerification,
      );
      if (scientificLineage.success) {
        if (
          current.beliefSpec === undefined ||
          current.prediction === undefined ||
          current.beliefTest !== undefined
        ) {
          throw new ApiInputError(
            "LIVE_SCIENTIFIC_AUTHORITY_MISSING",
            "A confirmed Belief Spec and immutable prediction are required for this scientific run",
            409,
          );
        }
        const jobs = runnerJobService(context, options);
        const compileJob = await jobs.getJob(scientificLineage.data.jobId);
        if (compileJob.status !== "VERIFIED") {
          throw new ApiInputError(
            "LIVE_SCIENTIFIC_AUTHORITY_MISSING",
            "The scientific compiler job is not verified",
            409,
          );
        }
        const authority = await reconstructScientificCompileAuthority({
          store: runnerObjectStore(context, options),
          job: compileJob,
          session: current,
          manifest: artifact.manifest,
          inputBundleKey: `runner-input/${compileJob.jobId}.json`,
          outputPrefix: `runner-output/${compileJob.jobId}/`,
        });
        if (
          (await hashCanonical(authority.lineage)) !==
          (await hashCanonical(scientificLineage.data))
        ) {
          throw new ApiInputError(
            "LIVE_SCIENTIFIC_AUTHORITY_DRIFT",
            "The verified scientific authority changed before fixed execution",
            409,
          );
        }
        const pack = getConceptPack(authority.bundle.conceptPack.id);
        const fixtureDescriptorHash = await hashCanonical(pack.fixedFixture);
        const expectedHashes = {
          artifactManifest: scientificLineage.data.artifactManifestHash,
          beliefSpec: scientificLineage.data.beliefSpecHash,
          prediction: scientificLineage.data.predictionHash,
          fixtureDescriptor: fixtureDescriptorHash,
          compileInputBundle: scientificLineage.data.inputBundleHash,
          rawExperimentIrFile:
            scientificLineage.data.compilerOutputFileHashes[
              "experiment-ir.json"
            ],
          rawExperimentIrCanonical:
            scientificLineage.data.rawExperimentIrCanonicalHash,
          candidateVerificationReport:
            scientificLineage.data.candidateVerificationReportHash,
          experimentSelection: scientificLineage.data.selectionHash,
          selectedExperimentIr: scientificLineage.data.selectedExperimentIrHash,
          projectedPlan: scientificLineage.data.projectedPlanHash,
        };
        const requestIdentity = liveRunnerRequestIdentity({
          sessionId,
          purpose: "LAB_RUN_AUTHORITATIVE",
          artifactId: artifact.manifest.artifactId,
          artifactManifestHash: scientificLineage.data.artifactManifestHash,
          conceptPack: { id: pack.id, version: pack.version },
          authorityProfileHash: await hashCanonical({
            kernel: "counterlab-fixed-kernel-v2",
            technicalVerifier: "hosted-result-verifier-v2",
            epistemicVerifier: "epistemic-verifier-v1",
            fixture: pack.fixedFixture,
            permittedOutputs: ["verified-result.json"],
          }),
          authorityInputHashes: expectedHashes,
        });
        const reusable = await jobs.findReusableRequest(requestIdentity);
        if (reusable !== undefined) {
          const runnerJob = await dispatchRecoverableRunnerJob({
            context,
            options,
            jobs,
            dispatcher,
            job: reusable,
          });
          return context.json(
            jsonSuccess({
              ...(await statePayload(context, current, options)),
              runnerJob,
              reused: true as const,
            }),
            202,
          );
        }
        const jobId = requestId(options, "runner_job");
        const bundle = RunnerLabRunBundleV5Schema.parse({
          schemaVersion: "5",
          kind: "LAB_RUN",
          purpose: "AUTHORITATIVE",
          jobId,
          sessionId,
          stateVersion: current.version,
          artifactManifestHash: scientificLineage.data.artifactManifestHash,
          approvedBeliefSpec: current.beliefSpec,
          beliefSpecHash: scientificLineage.data.beliefSpecHash,
          prediction: current.prediction,
          artifactManifest: artifact.manifest,
          fixture: pack.fixedFixture,
          selectedExperimentIr: authority.selectedExperimentIr,
          selectedExperimentIrHash:
            scientificLineage.data.selectedExperimentIrHash,
          fixedSelection: authority.outcome.selection,
          projectedPlan: authority.projectedPlan,
          expectedHashes,
          provenance: {
            compileJobId: compileJob.jobId,
            compileInputBundleHash: scientificLineage.data.inputBundleHash,
            compilerOutputFileHashes:
              scientificLineage.data.compilerOutputFileHashes,
            rawExperimentIrCanonicalHash:
              scientificLineage.data.rawExperimentIrCanonicalHash,
            scientificVerifierVersion:
              scientificLineage.data.scientificVerifierVersion,
            candidateVerificationReportHash:
              scientificLineage.data.candidateVerificationReportHash,
            scorerVersion: scientificLineage.data.scorerVersion,
            projectionAdapterVersion:
              scientificLineage.data.projectionAdapterVersion,
          },
          resultOutput: {
            path: "verified-result.json",
            schemaVersion: "2",
            authoritativeInputHashes: expectedHashes,
          },
          permittedOutputs: ["verified-result.json"],
        });
        const bundleHash = await hashCanonical(bundle);
        await runnerObjectStore(context, options).put(
          `runner-input/${jobId}.json`,
          JSON.stringify(bundle),
          "application/json",
        );
        const claimed = await jobs.createOrReuseJob({
          jobId,
          kind: "LAB_RUN",
          sessionId,
          artifactId: artifact.manifest.artifactId,
          artifactManifestHash: scientificLineage.data.artifactManifestHash,
          conceptPack: { id: pack.id, version: pack.version },
          inputHashes: [...Object.values(expectedHashes), bundleHash],
          requestIdentity,
          stateVersion: current.version,
          maxAttempts: 1,
          timeoutSeconds: 150,
        });
        const starting = await dispatchRecoverableRunnerJob({
          context,
          options,
          jobs,
          dispatcher,
          job: claimed.job,
        });
        return context.json(
          jsonSuccess({
            ...(await statePayload(context, current, options)),
            runnerJob: starting,
            ...(claimed.reused ? { reused: true as const } : {}),
          }),
          202,
        );
      }
      if (current.beliefTest === undefined) {
        throw new ApiInputError(
          "LIVE_PLAN_LINEAGE_MISSING",
          "The verified Plan lineage is incomplete",
          409,
        );
      }
      const lineage = HostedPlanLineageSchema.safeParse(
        current.labVerification,
      );
      if (!lineage.success) {
        throw new ApiInputError(
          "LIVE_PLAN_LINEAGE_MISSING",
          "The verified Plan lineage is incomplete",
          409,
        );
      }
      const planObject = await runnerObjectStore(context, options).get(
        `runner-output/${lineage.data.jobId}/experiment-plan.json`,
      );
      if (planObject === undefined) {
        throw new ApiInputError(
          "LIVE_PLAN_LINEAGE_MISSING",
          "The verified Plan bytes could not be resolved",
          409,
        );
      }
      let plan: z.infer<typeof ExperimentPlanV2Schema>;
      try {
        plan = ExperimentPlanV2Schema.parse(JSON.parse(planObject.body));
        await verifyExperimentPlan(plan, {
          sessionId,
          manifest: artifact.manifest,
          beliefTest: current.beliefTest,
        });
      } catch (error) {
        if (
          error instanceof PlanVerificationError ||
          error instanceof SyntaxError ||
          error instanceof ZodError
        ) {
          throw new ApiInputError(
            "LIVE_PLAN_REJECTED",
            "The stored Plan no longer passes independent verification",
            409,
          );
        }
        throw error;
      }
      const manifestHash = await hashCanonical(artifact.manifest);
      const planHash = await hashCanonical(plan);
      if (
        manifestHash !== plan.artifactManifestHash ||
        planHash !== lineage.data.planHash
      ) {
        throw new ApiInputError(
          "LIVE_PLAN_LINEAGE_MISSING",
          "The Plan hash does not match the verified artifact lineage",
          409,
        );
      }
      const fixtureId =
        plan.concept === "class_imbalance"
          ? "public-imbalance-v1"
          : "public-leakage-v1";
      const requestIdentity = liveRunnerRequestIdentity({
        sessionId,
        purpose: "LAB_RUN_AUTHORITATIVE",
        artifactId: artifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: {
          id: plan.concept,
          version: plan.conceptPackVersion,
        },
        authorityProfileHash: await hashCanonical({
          kernel: "counterlab-fixed-kernel-v2",
          verifier: "hosted-result-verifier-v2",
          fixtureId,
          permittedOutputs: ["verified-result.json"],
        }),
        authorityInputHashes: {
          artifactManifest: manifestHash,
          experimentPlan: planHash,
          beliefTest: await hashCanonical(current.beliefTest),
        },
      });
      const jobId = requestId(options, "runner_job");
      const bundle = RunnerLabRunBundleSchema.parse({
        schemaVersion: "1",
        kind: "LAB_RUN",
        purpose: "AUTHORITATIVE",
        jobId,
        sessionId,
        stateVersion: current.version,
        artifactManifestHash: manifestHash,
        artifactManifest: artifact.manifest,
        learnerClaim: current.beliefTest.learnerClaim,
        experimentPlan: plan,
        experimentPlanHash: planHash,
        fixture: { id: fixtureId },
        permittedOutputs: ["verified-result.json"],
      });
      const bundleHash = await hashCanonical(bundle);
      const inputBundleKey = `runner-input/${jobId}.json`;
      const jobs = runnerJobService(context, options);
      await runnerObjectStore(context, options).put(
        inputBundleKey,
        JSON.stringify(bundle),
        "application/json",
      );
      const claimed = await jobs.createOrReuseJob({
        jobId,
        kind: "LAB_RUN",
        sessionId,
        artifactId: artifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: {
          id: plan.concept,
          version: plan.conceptPackVersion,
        },
        inputHashes: [manifestHash, planHash, bundleHash],
        requestIdentity,
        stateVersion: current.version,
        maxAttempts: 1,
        timeoutSeconds: 150,
      });
      const starting = await dispatchRecoverableRunnerJob({
        context,
        options,
        jobs,
        dispatcher,
        job: claimed.job,
      });
      return context.json(
        jsonSuccess({
          ...(await statePayload(context, current, options)),
          runnerJob: starting,
          ...(claimed.reused ? { reused: true as const } : {}),
        }),
        202,
      );
    }
    if (current.mode.kind !== "sample_lesson") {
      throw new ApiInputError(
        "REPLAY_READ_ONLY",
        "Verified replay sessions cannot start new experiments",
        409,
      );
    }
    await requireApprovedSampleAuthority(artifact, "ARTIFACT_RESULT_MISMATCH");
    const completed = await service.recordExperimentResult(
      sessionId,
      sampleResult,
    );
    return context.json(
      jsonSuccess(await statePayload(context, completed, options)),
    );
  });

  app.post("/api/sessions/:sessionId/boundary/run", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    if (current.mode.kind !== "live_notebook") {
      throw new ApiInputError(
        "BOUNDARY_LIVE_REQUIRED",
        "Boundary Map execution is available only for live notebook sessions",
        409,
      );
    }
    const dispatcher = runnerDispatcher(context, options);
    if (dispatcher === undefined) {
      throw new ApiInputError(
        "LOCAL_RUNNER_REQUIRED",
        "Boundary Map execution requires a configured CounterLab runner",
        503,
      );
    }
    const artifact = await artifacts(context, options).find(current.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "The live notebook artifact could not be resolved",
        404,
      );
    }
    const evidenceAuthority = await resolveSessionEvidenceAuthority(
      current,
    ).catch(() => {
      throw new ApiInputError(
        "EVIDENCE_AUTHORITY_REQUIRED",
        "A released v5 result is required before a Boundary Map",
        409,
      );
    });
    if (
      evidenceAuthority.protocol !== "v5" ||
      evidenceAuthority.verdict === "REJECTED"
    ) {
      throw new ApiInputError(
        "EVIDENCE_AUTHORITY_REQUIRED",
        "A rejected experiment cannot authorize a Boundary Map",
        409,
      );
    }
    const lineage = HostedExperimentLineageV5Schema.parse(
      current.labVerification,
    );
    const jobs = runnerJobService(context, options);
    const store = runnerObjectStore(context, options);
    const frozenCompile = await loadFrozenScientificCompileAuthority({
      store,
      jobs,
      session: current,
      manifest: artifact.manifest,
      lineage,
    });
    const pack = getConceptPack(evidenceAuthority.concept);
    const definition = pack.scientificMethod.boundaryMap;
    const selection = frozenCompile.selectedExperimentIr.selection;
    const selectedCandidate =
      selection.status === "SELECTED"
        ? frozenCompile.selectedExperimentIr.candidateExperiments.find(
            (candidate) => candidate.id === selection.candidateId,
          )
        : undefined;
    if (
      selectedCandidate === undefined ||
      frozenCompile.selectedExperimentIr.boundarySweep === undefined
    ) {
      throw new ApiInputError(
        "BOUNDARY_SWEEP_NOT_AUTHORIZED",
        "The selected Experiment IR does not authorize a registered Boundary Sweep",
        409,
      );
    }
    const [manifestHash, selectedExperimentIrHash, evidenceVerdictHash] =
      await Promise.all([
        hashCanonical(artifact.manifest),
        hashExperimentIR(frozenCompile.selectedExperimentIr),
        hashCanonical(evidenceAuthority.evidenceVerdict),
      ]);
    const jobId = requestId(options, "runner_job");
    const boundaryRequest = registeredBoundarySweep(pack);
    const bundle = RunnerBoundaryMapBundleV5Schema.parse({
      schemaVersion: "5",
      kind: "LAB_RUN",
      purpose: "BOUNDARY",
      jobId,
      sessionId,
      stateVersion: current.version,
      artifactManifestHash: manifestHash,
      fixture: pack.fixedFixture,
      conceptPackVersion: pack.version,
      selectedExperimentIr: frozenCompile.selectedExperimentIr,
      selectedExperimentIrHash,
      releaseAuthority: {
        authoritativeResultHash: evidenceAuthority.result.resultHash,
        evidenceVerdict: evidenceAuthority.evidenceVerdict,
        evidenceVerdictHash,
        epistemicReportHash: evidenceAuthority.epistemicReportHash,
      },
      boundaryRequest,
      seed: definition.seed,
      resultOutput: {
        path: "boundary-map.json",
        schemaVersion: "1",
        lineage: {
          artifactManifestHash: manifestHash,
          experimentIrHash: selectedExperimentIrHash,
          authoritativeResultHash: evidenceAuthority.result.resultHash,
          evidenceVerdictHash,
        },
      },
      permittedOutputs: ["boundary-map.json"],
    });
    const expectation = await boundaryMapExpectation(bundle);
    const [expectationHash, bundleHash] = await Promise.all([
      hashCanonical(expectation),
      hashCanonical(bundle),
    ]);
    const requestIdentity = liveRunnerRequestIdentity({
      sessionId,
      purpose: "LAB_RUN_BOUNDARY",
      artifactId: artifact.manifest.artifactId,
      artifactManifestHash: manifestHash,
      conceptPack: { id: pack.id, version: pack.version },
      authorityProfileHash: await hashCanonical({
        kernelVersion: pack.fixedResultAuthority.kernelVersion,
        verifierVersion: "boundary-map-verifier-v1",
        receiptSchemaVersion: "1",
        fixture: pack.fixedFixture,
        boundaryDefinition: definition,
        permittedOutputs: bundle.permittedOutputs,
      }),
      authorityInputHashes: {
        artifactManifest: manifestHash,
        selectedExperimentIr: selectedExperimentIrHash,
        authoritativeResult: evidenceAuthority.result.resultHash,
        evidenceVerdict: evidenceVerdictHash,
        epistemicReport: evidenceAuthority.epistemicReportHash,
        boundaryExpectation: expectationHash,
      },
    });
    const reusable = await jobs.findReusableRequest(requestIdentity);
    if (reusable !== undefined) {
      const runnerJob = await dispatchRecoverableRunnerJob({
        context,
        options,
        jobs,
        dispatcher,
        job: reusable,
      });
      return context.json(
        jsonSuccess({
          ...(await statePayload(context, current, options)),
          runnerJob,
          reused: true as const,
        }),
        202,
      );
    }
    if (
      current.state !== "EXPERIMENT_COMPLETED" ||
      current.boundaryMapAuthority !== undefined
    ) {
      throw new ApiInputError(
        "BOUNDARY_STAGE_REQUIRED",
        "A new Boundary Map can start only after the primary experiment and before revision",
        409,
      );
    }
    const inputHashes = [
      manifestHash,
      selectedExperimentIrHash,
      evidenceAuthority.result.resultHash,
      evidenceVerdictHash,
      evidenceAuthority.epistemicReportHash,
      expectationHash,
      bundleHash,
    ];
    await store.put(
      `runner-input/${jobId}.json`,
      JSON.stringify(bundle),
      "application/json",
    );
    const claimed = await jobs.createOrReuseJob({
      jobId,
      kind: "LAB_RUN",
      sessionId,
      artifactId: artifact.manifest.artifactId,
      artifactManifestHash: manifestHash,
      conceptPack: { id: pack.id, version: pack.version },
      inputHashes,
      requestIdentity,
      stateVersion: current.version,
      maxAttempts: 1,
      timeoutSeconds: 180,
    });
    const starting = await dispatchRecoverableRunnerJob({
      context,
      options,
      jobs,
      dispatcher,
      job: claimed.job,
    });
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, current, options)),
        runnerJob: starting,
        ...(claimed.reused ? { reused: true as const } : {}),
      }),
      202,
    );
  });

  app.post("/api/sessions/:sessionId/lab/interactive", async (context) => {
    const configuration = z
      .union([
        InteractiveLeakageRunRequestSchema,
        InteractiveImbalanceRunRequestSchema,
      ])
      .parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    if (
      current.mode.kind !== "live_notebook" ||
      current.verifiedResult === undefined
    ) {
      throw new ApiInputError(
        "INTERACTIVE_LAB_NOT_READY",
        "A completed live result for this interactive concept is required",
        409,
      );
    }
    const dispatcher = runnerDispatcher(context, options);
    if (dispatcher === undefined) {
      throw new ApiInputError(
        "LOCAL_RUNNER_REQUIRED",
        "Interactive fixed-kernel execution requires a configured CounterLab runner",
        503,
      );
    }
    const artifact = await artifacts(context, options).find(current.artifactId);
    const scientificLineage = HostedExperimentLineageV5Schema.safeParse(
      current.labVerification,
    );
    const lineage = HostedPlanLineageSchema.safeParse(current.labVerification);
    if (
      artifact === undefined ||
      (!scientificLineage.success && !lineage.success)
    ) {
      throw new ApiInputError(
        "LIVE_PLAN_LINEAGE_MISSING",
        "The verified Plan lineage is incomplete",
        409,
      );
    }
    if (scientificLineage.success) {
      const evidenceAuthority = await resolveSessionEvidenceAuthority(
        current,
      ).catch(() => {
        throw new ApiInputError(
          "EVIDENCE_AUTHORITY_REQUIRED",
          "Released v5 evidence is required for interactive exploration",
          409,
        );
      });
      if (
        evidenceAuthority.protocol !== "v5" ||
        evidenceAuthority.verdict === "REJECTED" ||
        ("concept" in configuration
          ? configuration.concept !== evidenceAuthority.concept
          : evidenceAuthority.concept !== "entity_leakage")
      ) {
        throw new ApiInputError(
          "INTERACTIVE_CONCEPT_MISMATCH",
          "The requested controls do not match the released v5 evidence",
          409,
        );
      }
      if (
        !("concept" in configuration) &&
        !artifact.manifest.schemaSummary.entityCandidates.includes(
          configuration.entityField,
        )
      ) {
        throw new ApiInputError(
          "INTERACTIVE_ENTITY_UNRESOLVED",
          "The selected entity field is not an artifact candidate",
          422,
        );
      }
      const store = runnerObjectStore(context, options);
      const jobs = runnerJobService(context, options);
      const frozenCompile = await loadFrozenScientificCompileAuthority({
        store,
        jobs,
        session: current,
        manifest: artifact.manifest,
        lineage: scientificLineage.data,
      });
      const [manifestHash, evidenceVerdictHash] = await Promise.all([
        hashCanonical(artifact.manifest),
        hashCanonical(evidenceAuthority.evidenceVerdict),
      ]);
      const configurationHash = await hashCanonical({
        schemaVersion: "1",
        sessionId,
        artifactManifestHash: manifestHash,
        selectedExperimentIrHash:
          scientificLineage.data.selectedExperimentIrHash,
        selectionHash: scientificLineage.data.selectionHash,
        projectedPlanHash: scientificLineage.data.projectedPlanHash,
        authoritativeResultHash: evidenceAuthority.result.resultHash,
        evidenceVerdictHash,
        epistemicReportHash: evidenceAuthority.epistemicReportHash,
        configuration,
      });
      const derivationVersion = "interactive-plan-v5-derivation-v2" as const;
      let derived: ReturnType<typeof deriveInteractivePlanV5>;
      try {
        derived = deriveInteractivePlanV5(
          frozenCompile.projectedPlan,
          configuration,
          configurationHash,
          derivationVersion,
        );
      } catch {
        throw new ApiInputError(
          "INTERACTIVE_PLAN_INCOMPLETE",
          "The frozen Experiment Plan is missing the registered control",
          409,
        );
      }
      const interactivePlanHash = await hashCanonical(derived.interactivePlan);
      const pack = getConceptPack(evidenceAuthority.concept);
      const jobId = requestId(options, "runner_job");
      const bundle = RunnerLabInteractiveRunBundleV5Schema.parse({
        schemaVersion: "5",
        kind: "LAB_RUN",
        purpose: "INTERACTIVE",
        jobId,
        sessionId,
        stateVersion: current.version,
        artifactManifestHash: manifestHash,
        artifactManifest: artifact.manifest,
        approvedBeliefSpec: evidenceAuthority.beliefSpec,
        beliefSpecHash: scientificLineage.data.beliefSpecHash,
        prediction: current.prediction,
        fixture: pack.fixedFixture,
        compileAuthority: scientificLineage.data,
        selectedExperimentIr: frozenCompile.selectedExperimentIr,
        fixedSelection: frozenCompile.outcome.selection,
        basePlan: frozenCompile.projectedPlan,
        releaseAuthority: {
          authoritativeResultHash: evidenceAuthority.result.resultHash,
          evidenceVerdict: evidenceAuthority.evidenceVerdict,
          evidenceVerdictHash,
          epistemicReportHash: evidenceAuthority.epistemicReportHash,
        },
        configuration,
        configurationHash,
        derivationVersion,
        selectedRunId: derived.selectedRunId,
        interactivePlan: derived.interactivePlan,
        interactivePlanHash,
        resultOutput: {
          path: "verified-result.json",
          schemaVersion: "2",
          authorityHash: configurationHash,
        },
        permittedOutputs: ["verified-result.json"],
      });
      const bundleHash = await hashCanonical(bundle);
      const requestIdentity = liveRunnerRequestIdentity({
        sessionId,
        purpose: "LAB_RUN_INTERACTIVE",
        artifactId: artifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: { id: pack.id, version: pack.version },
        authorityProfileHash: await hashCanonical({
          kernel: "counterlab-fixed-kernel-v2",
          verifier: "interactive-result-verifier-v5",
          derivation: bundle.derivationVersion,
          fixture: pack.fixedFixture,
          permittedOutputs: bundle.permittedOutputs,
        }),
        authorityInputHashes: {
          artifactManifest: manifestHash,
          selectedExperimentIr: scientificLineage.data.selectedExperimentIrHash,
          experimentSelection: scientificLineage.data.selectionHash,
          basePlan: scientificLineage.data.projectedPlanHash,
          authoritativeResult: evidenceAuthority.result.resultHash,
          evidenceVerdict: evidenceVerdictHash,
          epistemicReport: evidenceAuthority.epistemicReportHash,
          interactivePlan: interactivePlanHash,
        },
        configurationHash,
      });
      const inputBundleKey = `runner-input/${jobId}.json`;
      await store.put(
        inputBundleKey,
        JSON.stringify(bundle),
        "application/json",
      );
      const claimed = await jobs.createOrReuseJob({
        jobId,
        kind: "LAB_RUN",
        sessionId,
        artifactId: artifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: { id: pack.id, version: pack.version },
        inputHashes: [
          manifestHash,
          scientificLineage.data.selectedExperimentIrHash,
          scientificLineage.data.selectionHash,
          scientificLineage.data.projectedPlanHash,
          evidenceAuthority.result.resultHash,
          evidenceVerdictHash,
          evidenceAuthority.epistemicReportHash,
          configurationHash,
          interactivePlanHash,
          bundleHash,
        ],
        requestIdentity,
        stateVersion: current.version,
        maxAttempts: 1,
        timeoutSeconds: 150,
      });
      const starting = await dispatchRecoverableRunnerJob({
        context,
        options,
        jobs,
        dispatcher,
        job: claimed.job,
      });
      return context.json(
        jsonSuccess({
          ...(await statePayload(context, current, options)),
          runnerJob: starting,
          selectedRunId: derived.selectedRunId,
          configurationHash,
          ...(claimed.reused ? { reused: true as const } : {}),
        }),
        202,
      );
    }
    if (!lineage.success) {
      throw new ApiInputError(
        "LIVE_PLAN_LINEAGE_MISSING",
        "The verified legacy Plan lineage is incomplete",
        409,
      );
    }
    if (
      current.beliefTest === undefined ||
      current.verifiedResult.concept !== current.beliefTest.concept ||
      ("concept" in configuration &&
        configuration.concept !== current.beliefTest.concept) ||
      (!("concept" in configuration) &&
        current.beliefTest.concept !== "entity_leakage")
    ) {
      throw new ApiInputError(
        "INTERACTIVE_LAB_NOT_READY",
        "A completed live result for this interactive concept is required",
        409,
      );
    }
    if (
      !("concept" in configuration) &&
      !artifact.manifest.schemaSummary.entityCandidates.includes(
        configuration.entityField,
      )
    ) {
      throw new ApiInputError(
        "INTERACTIVE_ENTITY_UNRESOLVED",
        "The selected entity field is not an artifact candidate",
        422,
      );
    }
    const planObject = await runnerObjectStore(context, options).get(
      `runner-output/${lineage.data.jobId}/experiment-plan.json`,
    );
    if (planObject === undefined) {
      throw new ApiInputError(
        "LIVE_PLAN_LINEAGE_MISSING",
        "The verified Plan bytes could not be resolved",
        409,
      );
    }
    const plan = ExperimentPlanV2Schema.parse(JSON.parse(planObject.body));
    if (plan.concept !== current.beliefTest.concept) {
      throw new ApiInputError(
        "INTERACTIVE_CONCEPT_MISMATCH",
        "The verified Plan does not match the session concept",
        409,
      );
    }
    const manifestHash = await hashCanonical(artifact.manifest);
    const basePlanHash = await hashCanonical(plan);
    if (
      manifestHash !== plan.artifactManifestHash ||
      basePlanHash !== lineage.data.planHash
    ) {
      throw new ApiInputError(
        "LIVE_PLAN_LINEAGE_MISSING",
        "The Plan hash does not match the verified artifact lineage",
        409,
      );
    }
    const configurationHash = await hashCanonical({
      schemaVersion: "1",
      basePlanHash,
      configuration,
    });
    let selectedRunId: string;
    const interactivePlan = ExperimentPlanV2Schema.parse(
      "concept" in configuration
        ? (() => {
            const thresholdRun = plan.interventions.find(
              (run) => run.operation === "imbalance.threshold_sweep",
            );
            const prevalenceRun = plan.interventions.find(
              (run) => run.operation === "imbalance.prevalence_sweep",
            );
            if (
              plan.concept !== "class_imbalance" ||
              thresholdRun?.concept !== "class_imbalance" ||
              prevalenceRun?.concept !== "class_imbalance"
            ) {
              throw new ApiInputError(
                "INTERACTIVE_PLAN_INCOMPLETE",
                "The verified imbalance Plan is missing registered controls",
                409,
              );
            }
            selectedRunId = `interactive_${configurationHash.slice(0, 16)}`;
            const scenario =
              configuration.prevalenceScenario === "observed"
                ? "rarer"
                : configuration.prevalenceScenario;
            return {
              ...plan,
              planId: `interactive_plan_${configurationHash.slice(0, 16)}`,
              interventions: plan.interventions.map((run) => {
                if (run.operation === "imbalance.threshold_sweep") {
                  return {
                    ...run,
                    runId:
                      configuration.prevalenceScenario === "observed"
                        ? selectedRunId
                        : run.runId,
                    threshold: configuration.threshold,
                    prevalenceScenario: "observed" as const,
                  };
                }
                if (run.operation === "imbalance.prevalence_sweep") {
                  return {
                    ...run,
                    runId:
                      configuration.prevalenceScenario === "observed"
                        ? run.runId
                        : selectedRunId,
                    threshold: configuration.threshold,
                    prevalenceScenario: scenario,
                  };
                }
                return run;
              }),
              controlledVariables: [
                "fixture",
                "model score",
                "stratified holdout",
                "seed",
              ],
              changedVariables: ["decision threshold", "deployment prevalence"],
            };
          })()
        : (() => {
            selectedRunId = `interactive_${configurationHash.slice(0, 16)}`;
            const targetOperation =
              configuration.splitStrategy === "group"
                ? "leakage.group_holdout"
                : configuration.identityAblation
                  ? "leakage.identity_ablation"
                  : "leakage.random_row_split";
            const configureRun = <T extends ExperimentPlanV2["baseline"]>(
              run: T,
            ): T =>
              (run.operation === targetOperation
                ? {
                    ...run,
                    runId: selectedRunId,
                    entityField: configuration.entityField,
                    dropIdentity: configuration.identityAblation,
                    testFraction: configuration.testFraction,
                  }
                : run) as T;
            return {
              ...plan,
              planId: `interactive_plan_${configurationHash.slice(0, 16)}`,
              baseline: configureRun(plan.baseline),
              interventions: plan.interventions.map(configureRun),
              controlledVariables: [
                "fixture",
                "model",
                "preprocessing",
                "seed",
              ],
              changedVariables: [
                "split strategy",
                "identity feature",
                "test fraction",
              ],
            };
          })(),
    );
    if ("concept" in configuration) {
      await verifyExperimentPlan(interactivePlan, {
        sessionId,
        manifest: artifact.manifest,
        beliefTest: current.beliefTest,
      });
    } else {
      await verifyInteractiveLeakageExperimentPlan(
        interactivePlan,
        plan,
        configuration,
        {
          sessionId,
          manifest: artifact.manifest,
          beliefTest: current.beliefTest,
        },
      );
    }
    const planHash = await hashCanonical(interactivePlan);
    const interactiveFixtureId =
      interactivePlan.concept === "class_imbalance"
        ? "public-imbalance-v1"
        : "public-leakage-v1";
    const requestIdentity = liveRunnerRequestIdentity({
      sessionId,
      purpose: "LAB_RUN_INTERACTIVE",
      artifactId: artifact.manifest.artifactId,
      artifactManifestHash: manifestHash,
      conceptPack: {
        id: interactivePlan.concept,
        version: interactivePlan.conceptPackVersion,
      },
      authorityProfileHash: await hashCanonical({
        kernel: "counterlab-fixed-kernel-v2",
        verifier: "interactive-result-verifier-v2",
        fixtureId: interactiveFixtureId,
        permittedOutputs: ["verified-result.json"],
      }),
      authorityInputHashes: {
        artifactManifest: manifestHash,
        basePlan: basePlanHash,
        interactivePlan: planHash,
      },
      configurationHash,
    });
    const jobId = requestId(options, "runner_job");
    const bundle = RunnerLabRunBundleSchema.parse({
      schemaVersion: "1",
      kind: "LAB_RUN",
      purpose: "INTERACTIVE",
      jobId,
      sessionId,
      stateVersion: current.version,
      artifactManifestHash: manifestHash,
      artifactManifest: artifact.manifest,
      learnerClaim: current.beliefTest.learnerClaim,
      experimentPlan: interactivePlan,
      experimentPlanHash: planHash,
      fixture: { id: interactiveFixtureId },
      permittedOutputs: ["verified-result.json"],
    });
    const bundleHash = await hashCanonical(bundle);
    const inputBundleKey = `runner-input/${jobId}.json`;
    const jobs = runnerJobService(context, options);
    await runnerObjectStore(context, options).put(
      inputBundleKey,
      JSON.stringify(bundle),
      "application/json",
    );
    const claimed = await jobs.createOrReuseJob({
      jobId,
      kind: "LAB_RUN",
      sessionId,
      artifactId: artifact.manifest.artifactId,
      artifactManifestHash: manifestHash,
      conceptPack: {
        id: interactivePlan.concept,
        version: interactivePlan.conceptPackVersion,
      },
      inputHashes: [manifestHash, planHash, configurationHash, bundleHash],
      requestIdentity,
      stateVersion: current.version,
      maxAttempts: 1,
      timeoutSeconds: 150,
    });
    const starting = await dispatchRecoverableRunnerJob({
      context,
      options,
      jobs,
      dispatcher,
      job: claimed.job,
    });
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, current, options)),
        runnerJob: starting,
        selectedRunId,
        configurationHash,
        ...(claimed.reused ? { reused: true as const } : {}),
      }),
      202,
    );
  });

  app.get("/api/sessions/:sessionId/boundary", async (context) => {
    const sessionId = context.req.param("sessionId");
    const session = await sessionService(context, options).getSession(
      sessionId,
    );
    const authorityRef = session.boundaryMapAuthority;
    if (authorityRef === undefined) {
      throw new ApiInputError(
        "BOUNDARY_MAP_NOT_READY",
        "A Boundary Map is released only after independent verification",
        409,
      );
    }
    const jobs = runnerJobService(context, options);
    const job = await jobs.getJob(authorityRef.jobId);
    if (
      job.status !== "VERIFIED" ||
      job.kind !== "LAB_RUN" ||
      job.sessionId !== sessionId ||
      job.requestIdentity?.purpose !== "LAB_RUN_BOUNDARY"
    ) {
      throw new ApiInputError(
        "BOUNDARY_AUTHORITY_MISSING",
        "The verified Boundary Map job does not match this session",
        409,
      );
    }
    const prefix = `runner-authority/${job.jobId}/`;
    const store = runnerObjectStore(context, options);
    const [
      bundleObject,
      resultObject,
      expectationObject,
      reportObject,
      receiptObject,
    ] = await Promise.all([
      store.get(`runner-input/${job.jobId}.json`),
      store.get(`${prefix}boundary-map.json`),
      store.get(`${prefix}boundary-map-expectation.json`),
      store.get(`${prefix}boundary-map-verification.json`),
      store.get(`${prefix}boundary-map-receipt.json`),
    ]);
    if (
      bundleObject === undefined ||
      resultObject === undefined ||
      expectationObject === undefined ||
      reportObject === undefined ||
      receiptObject === undefined
    ) {
      throw new ApiInputError(
        "BOUNDARY_AUTHORITY_MISSING",
        "Immutable Boundary Map authority objects are missing",
        409,
      );
    }

    try {
      const bundle = RunnerBoundaryMapBundleV5Schema.parse(
        JSON.parse(bundleObject.body),
      );
      const result = BoundaryMapResultV1Schema.parse(
        JSON.parse(resultObject.body),
      );
      const report = BoundaryMapVerificationReportV1Schema.parse(
        JSON.parse(reportObject.body),
      );
      const persistedAuthority = BoundaryMapAuthorityRefV1Schema.parse(
        JSON.parse(receiptObject.body),
      );
      const expected = await boundaryMapExpectation(bundle);
      if (
        bundle.jobId !== job.jobId ||
        bundle.sessionId !== sessionId ||
        (await hashCanonical(JSON.parse(expectationObject.body))) !==
          (await hashCanonical(expected)) ||
        job.outputHashes.length !== 1 ||
        (await sha256Text(resultObject.body)) !== job.outputHashes[0] ||
        (await hashCanonical(persistedAuthority)) !==
          (await hashCanonical(authorityRef))
      ) {
        throw new ApiInputError(
          "BOUNDARY_AUTHORITY_LINEAGE_MISMATCH",
          "Persisted Boundary Map authority no longer matches the session",
          409,
        );
      }
      const integrity = persistedAuthority.receipt.integrity;
      if (
        integrity.mode === "hmac-signed" &&
        context.env?.COUNTERLAB_SIGNING_KEY === undefined
      ) {
        throw new ApiInputError(
          "BOUNDARY_SIGNING_KEY_REQUIRED",
          "The Boundary Map signing key is unavailable",
          503,
        );
      }
      validateBoundaryMapAuthority(persistedAuthority, {
        result,
        report,
        expected,
        ...(integrity.mode === "hmac-signed"
          ? {
              signingKey: context.env?.COUNTERLAB_SIGNING_KEY as string,
              expectedKeyId:
                context.env?.COUNTERLAB_SIGNING_KEY_ID ??
                "counterlab-boundary-v1",
            }
          : {}),
      });
      context.header("cache-control", "private, no-store");
      return context.json(
        jsonSuccess({
          result,
          report,
          receipt: persistedAuthority.receipt,
          authority: persistedAuthority,
        }),
      );
    } catch (error) {
      if (error instanceof ApiInputError) throw error;
      if (error instanceof SyntaxError || error instanceof ZodError) {
        throw new ApiInputError(
          "BOUNDARY_AUTHORITY_INVALID",
          "Persisted Boundary Map authority failed strict validation",
          409,
        );
      }
      throw new ApiInputError(
        "BOUNDARY_AUTHORITY_INVALID",
        "Persisted Boundary Map authority failed independent verification",
        409,
      );
    }
  });

  app.get("/api/sessions/:sessionId/jobs/:jobId/result", async (context) => {
    const sessionId = context.req.param("sessionId");
    const jobId = context.req.param("jobId");
    const job = await runnerJobService(context, options).getJob(jobId);
    if (job.sessionId !== sessionId || job.kind !== "LAB_RUN") {
      throw new ApiInputError(
        "RUNNER_JOB_SESSION_MISMATCH",
        "Interactive result does not belong to this session",
        404,
      );
    }
    if (job.status !== "VERIFIED") {
      throw new ApiInputError(
        "INTERACTIVE_RESULT_NOT_READY",
        "The interactive result has not passed verification",
        409,
      );
    }
    const [inputObject, frozenResultObject, mutableResultObject] =
      await Promise.all([
        runnerObjectStore(context, options).get(`runner-input/${jobId}.json`),
        runnerObjectStore(context, options).get(
          `runner-authority/${jobId}/verified-result.json`,
        ),
        runnerObjectStore(context, options).get(
          `runner-output/${jobId}/verified-result.json`,
        ),
      ]);
    const resultObject = frozenResultObject ?? mutableResultObject;
    if (inputObject === undefined || resultObject === undefined) {
      throw new ApiInputError(
        "RUNNER_OUTPUT_MISSING",
        "The verified interactive result is missing",
        409,
      );
    }
    let rawBundle: unknown;
    try {
      rawBundle = JSON.parse(inputObject.body) as unknown;
    } catch {
      throw new ApiInputError(
        "INTERACTIVE_RESULT_LINEAGE_MISMATCH",
        "The interactive input bundle is invalid",
        409,
      );
    }
    const scientificBundle =
      RunnerLabInteractiveRunBundleV5Schema.safeParse(rawBundle);
    if (scientificBundle.success) {
      if (scientificBundle.data.sessionId !== sessionId) {
        throw new ApiInputError(
          "INTERACTIVE_RESULT_LINEAGE_MISMATCH",
          "The result is not an interactive run for this session",
          409,
        );
      }
      const rawHash = await sha256Text(resultObject.body);
      if (!job.outputHashes.includes(rawHash)) {
        throw new ApiInputError(
          "RUNNER_OUTPUT_HASH_MISMATCH",
          "Interactive result bytes do not match the callback hash",
          409,
        );
      }
      const result = HostedVerifiedResultSetV2Schema.parse(
        JSON.parse(resultObject.body),
      );
      const verification =
        result.concept === "class_imbalance"
          ? await verifyHostedResultSet(
              result,
              scientificBundle.data.interactivePlan,
            )
          : await verifyInteractiveResultSet(
              result,
              scientificBundle.data.interactivePlan,
              scientificBundle.data.selectedRunId,
            );
      return context.json(
        jsonSuccess({
          result,
          selectedRunId: scientificBundle.data.selectedRunId,
          configurationHash: scientificBundle.data.configurationHash,
          verification,
        }),
      );
    }
    const bundle = RunnerLabRunBundleSchema.parse(JSON.parse(inputObject.body));
    if (bundle.purpose !== "INTERACTIVE" || bundle.sessionId !== sessionId) {
      throw new ApiInputError(
        "INTERACTIVE_RESULT_LINEAGE_MISMATCH",
        "The result is not an interactive run for this session",
        409,
      );
    }
    const rawHash = await sha256Text(resultObject.body);
    if (!job.outputHashes.includes(rawHash)) {
      throw new ApiInputError(
        "RUNNER_OUTPUT_HASH_MISMATCH",
        "Interactive result bytes do not match the callback hash",
        409,
      );
    }
    const result = HostedVerifiedResultSetV2Schema.parse(
      JSON.parse(resultObject.body),
    );
    const selectedRunId =
      [
        bundle.experimentPlan.baseline,
        ...bundle.experimentPlan.interventions,
      ].find((run) => run.runId.startsWith("interactive_"))?.runId ?? "";
    if (selectedRunId.length === 0) {
      throw new ApiInputError(
        "INTERACTIVE_RESULT_LINEAGE_MISMATCH",
        "The selected interactive run could not be resolved",
        409,
      );
    }
    const verification =
      result.concept === "class_imbalance"
        ? await verifyHostedResultSet(result, bundle.experimentPlan)
        : await verifyInteractiveResultSet(
            result,
            bundle.experimentPlan,
            selectedRunId,
          );
    return context.json(
      jsonSuccess({
        result,
        selectedRunId,
        configurationHash: job.inputHashes.at(-2),
        verification,
      }),
    );
  });

  app.post("/api/sessions/:sessionId/revision", async (context) => {
    const { revision } = RevisionSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    requireMutableSession(await service.getSession(sessionId));
    const updated = await service.recordRevision(sessionId, revision);
    return context.json(
      jsonSuccess(await statePayload(context, updated, options)),
    );
  });

  app.post("/api/sessions/:sessionId/transfer", async (context) => {
    const rawSubmission = await readJson(context);
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    const evidenceAuthority = await resolveSessionEvidenceAuthority(
      current,
    ).catch((error: unknown) => {
      if (error instanceof SessionInputError) {
        throw new ApiInputError(
          "LIVE_RESULT_REQUIRED",
          "An artifact-bound verified result is required before transfer",
          409,
        );
      }
      throw error;
    });
    if (evidenceAuthority.verdict === "REJECTED") {
      throw new ApiInputError(
        "EVIDENCE_REJECTED",
        "Rejected evidence cannot advance to transfer",
        409,
      );
    }
    const evaluateSubmission =
      evidenceAuthority.concept === "class_imbalance"
        ? (() => {
            const submission =
              ImbalanceTransferSubmissionSchema.parse(rawSubmission);
            return (evaluatedAt: string) =>
              evaluateImbalanceTransfer(sessionId, submission, evaluatedAt);
          })()
        : (() => {
            const submission =
              LeakageTransferSubmissionSchema.parse(rawSubmission);
            return (evaluatedAt: string) =>
              evaluateLeakageTransfer(sessionId, submission, evaluatedAt);
          })();
    const artifact = await artifacts(context, options).find(current.artifactId);
    if (current.mode.kind === "verified_replay") {
      throw new ApiInputError(
        "REPLAY_READ_ONLY",
        "Verified replay sessions cannot submit a new transfer answer",
        409,
      );
    }
    if (current.mode.kind === "sample_lesson") {
      await requireApprovedSampleAuthority(
        artifact,
        "ARTIFACT_TRANSFER_MISMATCH",
      );
    } else {
      const manifestHash =
        artifact === undefined ? null : await hashCanonical(artifact.manifest);
      if (
        evidenceAuthority.result.schemaVersion !== "2" ||
        evidenceAuthority.result.artifactManifestHash !== manifestHash
      ) {
        throw new ApiInputError(
          "LIVE_RESULT_REQUIRED",
          "An artifact-bound verified result is required before transfer",
          409,
        );
      }
    }
    await service.startTransfer(sessionId);
    const evaluatedAt = (options.now?.() ?? new Date()).toISOString();
    const result = await evaluateSubmission(evaluatedAt);
    const updated = await service.recordTransferResult(sessionId, result);
    return context.json(
      jsonSuccess(await statePayload(context, updated, options)),
    );
  });

  app.post("/api/sessions/:sessionId/patch/compile", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    if (current.evidenceVerdict?.kind === "REJECTED") {
      throw new ApiInputError(
        "EVIDENCE_REJECTED",
        "Rejected evidence cannot unlock repair",
        409,
      );
    }
    if (current.evidenceVerdict?.kind === "INCONCLUSIVE") {
      throw new ApiInputError(
        "PATCH_LOCKED_INCONCLUSIVE",
        "The experiment was valid but inconclusive, so repair remains locked",
        409,
      );
    }
    const sourceArtifact = await artifacts(context, options).find(
      current.artifactId,
    );
    if (current.mode.kind === "live_notebook") {
      const dispatcher = runnerDispatcher(context, options);
      if (dispatcher === undefined) {
        throw new ApiInputError(
          "LOCAL_RUNNER_REQUIRED",
          "Live artifact-specific patching requires a configured CounterLab runner",
          503,
        );
      }
      const evidenceAuthority = await resolveSessionEvidenceAuthority(
        current,
      ).catch((error: unknown) => {
        if (error instanceof SessionInputError) {
          throw new ApiInputError(
            "LIVE_PATCH_CONTRACTS_REQUIRED",
            "A passed transfer and artifact-bound verified result are required",
            409,
          );
        }
        throw error;
      });
      if (evidenceAuthority.protocol === "v5") {
        if (evidenceAuthority.verdict !== "SUPPORTS") {
          throw new ApiInputError(
            "PATCH_LOCKED_INCONCLUSIVE",
            "The experiment was valid but inconclusive, so repair remains locked",
            409,
          );
        }
        if (
          sourceArtifact?.objectKey === undefined ||
          current.transferResult?.outcome !== "PASSED" ||
          current.patchResult !== undefined
        ) {
          throw new ApiInputError(
            "LIVE_PATCH_CONTRACTS_REQUIRED",
            "A passed transfer and artifact-bound verified result are required",
            409,
          );
        }
        const manifestHash = await hashCanonical(sourceArtifact.manifest);
        if (
          evidenceAuthority.result.artifactManifestHash !== manifestHash ||
          evidenceAuthority.lineage.artifactManifestHash !== manifestHash
        ) {
          throw new ApiInputError(
            "LIVE_PATCH_LINEAGE_MISMATCH",
            "The verified result does not match this source notebook",
            409,
          );
        }
        const pack = getConceptPack(evidenceAuthority.concept);
        if (
          current.transferResult.taskId !== pack.transferTask.evaluatorTaskId
        ) {
          throw new ApiInputError(
            "LIVE_PATCH_TRANSFER_MISMATCH",
            "The passed transfer does not match the selected Subject Pack",
            409,
          );
        }
        try {
          assertPassedTransferMatchesFixedPolicy(
            evidenceAuthority.concept,
            current.transferResult,
          );
        } catch {
          throw new ApiInputError(
            "LIVE_PATCH_TRANSFER_MISMATCH",
            "The passed transfer does not match the fixed Subject Pack evaluator",
            409,
          );
        }
        const allowedCellIndices = sourceArtifact.manifest.cells
          .filter((cell) => {
            if (cell.type !== "code") return false;
            const evidence = new Set(cell.symbols);
            if (
              evidence.has("train_test_split") ||
              cell.sourceExcerpt.includes("train_test_split")
            ) {
              return true;
            }
            return (
              evidenceAuthority.concept === "class_imbalance" &&
              [
                "accuracy_score",
                "classification_report",
                "confusion_matrix",
              ].some(
                (symbol) =>
                  evidence.has(symbol) || cell.sourceExcerpt.includes(symbol),
              )
            );
          })
          .map((cell) => cell.index)
          .slice(0, 4);
        if (allowedCellIndices.length === 0) {
          throw new ApiInputError(
            "LIVE_PATCH_UNSUPPORTED",
            "No supported evaluation cell could be resolved for a minimal patch",
            409,
          );
        }
        const store = runnerObjectStore(context, options);
        const jobs = runnerJobService(context, options);
        const frozenCompile = await loadFrozenScientificCompileAuthority({
          store,
          jobs,
          session: current,
          manifest: sourceArtifact.manifest,
          lineage: evidenceAuthority.lineage,
        });
        if (
          (await hashCanonical(frozenCompile.selectedExperimentIr.transfer)) !==
          (await hashCanonical(pack.transferTask.experimentIrContract))
        ) {
          throw new ApiInputError(
            "LIVE_PATCH_TRANSFER_MISMATCH",
            "The frozen Experiment IR transfer does not match the Subject Pack",
            409,
          );
        }
        const [beliefSpecHash, evidenceVerdictHash, patchContractHash] =
          await Promise.all([
            hashCanonical(evidenceAuthority.beliefSpec),
            hashCanonical(evidenceAuthority.evidenceVerdict),
            hashCanonical({
              id: pack.patchContract.id,
              allowedTransformations: pack.patchContract.allowedTransformations,
              allowedCellIndices,
            }),
          ]);
        const authorityInputHashes = {
          artifactManifest: manifestHash,
          beliefSpec: beliefSpecHash,
          prediction: evidenceAuthority.prediction.immutableHash,
          selectedExperimentIr:
            evidenceAuthority.lineage.selectedExperimentIrHash,
          fixedSelection: evidenceAuthority.lineage.selectionHash,
          projectedPlan: evidenceAuthority.lineage.projectedPlanHash,
          verifiedResult: evidenceAuthority.result.resultHash,
          evidenceVerdict: evidenceVerdictHash,
          epistemicReport: evidenceAuthority.epistemicReportHash,
          transferResult: current.transferResult.resultHash,
          patchContract: patchContractHash,
        };
        const requestIdentity = liveRunnerRequestIdentity({
          sessionId,
          purpose: "PATCH_COMPILE",
          artifactId: sourceArtifact.manifest.artifactId,
          artifactManifestHash: manifestHash,
          conceptPack: { id: pack.id, version: pack.version },
          authorityProfileHash: await hashCanonical({
            compiler: "codex-app-server-stdio",
            authorityVersion: "5",
            patchPlanSchema,
            permittedOutputs: ["patch-plan.json", "public-rationale.md"],
          }),
          authorityInputHashes,
        });
        const reusable = await jobs.findReusableRequest(requestIdentity);
        if (reusable !== undefined) {
          const runnerJob = await dispatchRecoverableRunnerJob({
            context,
            options,
            jobs,
            dispatcher,
            job: reusable,
          });
          return context.json(
            jsonSuccess({
              ...(await statePayload(context, current, options)),
              runnerJob,
              reused: true as const,
            }),
            202,
          );
        }
        const started =
          current.state === "PATCH_COMPILING"
            ? current
            : await service.startPatchCompilation(sessionId, {
                actor: "system",
                authority: "runtime-codex-requested",
              });
        const jobId = requestId(options, "runner_job");
        const bundle = RunnerPatchCompileBundleV5Schema.parse({
          schemaVersion: "5",
          kind: "PATCH_COMPILE",
          jobId,
          sessionId,
          stateVersion: started.version,
          requestedAt: started.updatedAt,
          artifactManifestHash: manifestHash,
          conceptPackVersion: pack.version,
          artifactManifest: sourceArtifact.manifest,
          approvedBeliefSpec: evidenceAuthority.beliefSpec,
          beliefSpecHash,
          prediction: evidenceAuthority.prediction,
          compileAuthority: evidenceAuthority.lineage,
          selectedExperimentIr: frozenCompile.selectedExperimentIr,
          fixedSelection: frozenCompile.outcome.selection,
          basePlan: frozenCompile.projectedPlan,
          releaseAuthority: {
            authoritativeResultHash: evidenceAuthority.result.resultHash,
            evidenceVerdict: evidenceAuthority.evidenceVerdict,
            evidenceVerdictHash,
            epistemicReportHash: evidenceAuthority.epistemicReportHash,
          },
          verifiedResultSummary: {
            schemaVersion: "2",
            concept: evidenceAuthority.concept,
            resultHash: evidenceAuthority.result.resultHash,
            planId: evidenceAuthority.result.planId,
            runIds: evidenceAuthority.result.runs.map((run) => run.id),
          },
          transferContractId:
            frozenCompile.selectedExperimentIr.transfer.taskId,
          transferResult: current.transferResult,
          patchContract: {
            id: pack.patchContract.id,
            allowedTransformations: pack.patchContract.allowedTransformations,
          },
          allowedCellIndices,
          patchPlanSchema,
          permittedOutputs: ["patch-plan.json", "public-rationale.md"],
        });
        const bundleHash = await hashCanonical(bundle);
        const inputBundleKey = `runner-input/${jobId}.json`;
        await store.put(
          inputBundleKey,
          JSON.stringify(bundle),
          "application/json",
        );
        const claimed = await jobs.createOrReuseJob({
          jobId,
          kind: "PATCH_COMPILE",
          sessionId,
          artifactId: sourceArtifact.manifest.artifactId,
          artifactManifestHash: manifestHash,
          conceptPack: { id: pack.id, version: pack.version },
          inputHashes: [...Object.values(authorityInputHashes), bundleHash],
          requestIdentity,
          stateVersion: started.version,
          maxAttempts: SCIENTIFIC_COMPILER_MAX_ATTEMPTS,
          timeoutSeconds: SCIENTIFIC_COMPILER_JOB_TIMEOUT_SECONDS,
        });
        const starting = await dispatchRecoverableRunnerJob({
          context,
          options,
          jobs,
          dispatcher,
          job: claimed.job,
        });
        return context.json(
          jsonSuccess({
            ...(await statePayload(context, started, options)),
            runnerJob: starting,
            ...(claimed.reused ? { reused: true as const } : {}),
          }),
          202,
        );
      }
      if (
        sourceArtifact?.objectKey === undefined ||
        current.beliefTest === undefined ||
        current.verifiedResult?.schemaVersion !== "2" ||
        current.verifiedResult.concept !== current.beliefTest.concept ||
        current.transferResult?.outcome !== "PASSED"
      ) {
        throw new ApiInputError(
          "LIVE_PATCH_CONTRACTS_REQUIRED",
          "A passed transfer and artifact-bound verified result are required",
          409,
        );
      }
      const manifestHash = await hashCanonical(sourceArtifact.manifest);
      if (
        current.verifiedResult.artifactManifestHash !== manifestHash ||
        current.patchResult !== undefined
      ) {
        throw new ApiInputError(
          "LIVE_PATCH_LINEAGE_MISMATCH",
          "The verified result does not match this source notebook",
          409,
        );
      }
      const allowedCellIndices = sourceArtifact.manifest.cells
        .filter((cell) => {
          if (cell.type !== "code") return false;
          const evidence = new Set(cell.symbols);
          if (
            evidence.has("train_test_split") ||
            cell.sourceExcerpt.includes("train_test_split")
          ) {
            return true;
          }
          return (
            current.beliefTest?.concept === "class_imbalance" &&
            [
              "accuracy_score",
              "classification_report",
              "confusion_matrix",
            ].some(
              (symbol) =>
                evidence.has(symbol) || cell.sourceExcerpt.includes(symbol),
            )
          );
        })
        .map((cell) => cell.index)
        .slice(0, 4);
      if (allowedCellIndices.length === 0) {
        throw new ApiInputError(
          "LIVE_PATCH_UNSUPPORTED",
          "No supported evaluation cell could be resolved for a minimal patch",
          409,
        );
      }
      const pack = getConceptPack(current.beliefTest.concept);
      const patchContractHash = await hashCanonical({
        id: pack.patchContract.id,
        allowedTransformations: pack.patchContract.allowedTransformations,
        allowedCellIndices,
      });
      const requestIdentity = liveRunnerRequestIdentity({
        sessionId,
        purpose: "PATCH_COMPILE",
        artifactId: sourceArtifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: { id: pack.id, version: pack.version },
        authorityProfileHash: await hashCanonical({
          compiler: "codex-app-server-stdio",
          patchPlanSchema,
          permittedOutputs: ["patch-plan.json", "public-rationale.md"],
        }),
        authorityInputHashes: {
          artifactManifest: manifestHash,
          verifiedResult: current.verifiedResult.resultHash,
          transferResult: current.transferResult.resultHash,
          patchContract: patchContractHash,
        },
      });
      const jobs = runnerJobService(context, options);
      const reusable = await jobs.findReusableRequest(requestIdentity);
      if (reusable !== undefined) {
        const runnerJob = await dispatchRecoverableRunnerJob({
          context,
          options,
          jobs,
          dispatcher,
          job: reusable,
        });
        return context.json(
          jsonSuccess({
            ...(await statePayload(context, current, options)),
            runnerJob,
            reused: true as const,
          }),
          202,
        );
      }
      const started =
        current.state === "PATCH_COMPILING"
          ? current
          : await service.startPatchCompilation(sessionId, {
              actor: "system",
              authority: "runtime-codex-requested",
            });
      const jobId = requestId(options, "runner_job");
      const bundle = RunnerPatchCompileBundleSchema.parse({
        schemaVersion: "1",
        kind: "PATCH_COMPILE",
        jobId,
        sessionId,
        stateVersion: started.version,
        requestedAt: started.updatedAt,
        artifactManifestHash: manifestHash,
        conceptPackVersion: pack.version,
        artifactManifest: sourceArtifact.manifest,
        approvedBeliefTest: current.beliefTest,
        verifiedResultSummary: {
          schemaVersion: "2",
          resultHash: current.verifiedResult.resultHash,
          planId: current.verifiedResult.planId,
          runIds: current.verifiedResult.runs.map((run) => run.id),
        },
        transferSummary: {
          outcome: "PASSED",
          resultHash: current.transferResult.resultHash,
          selectedStrategy: current.transferResult.selectedStrategy,
          identifiedRisks: current.transferResult.identifiedRisks,
        },
        patchContract: {
          id: pack.patchContract.id,
          allowedTransformations: pack.patchContract.allowedTransformations,
        },
        allowedCellIndices,
        patchPlanSchema,
        permittedOutputs: ["patch-plan.json", "public-rationale.md"],
      });
      const bundleHash = await hashCanonical(bundle);
      const inputBundleKey = `runner-input/${jobId}.json`;
      await runnerObjectStore(context, options).put(
        inputBundleKey,
        JSON.stringify(bundle),
        "application/json",
      );
      const claimed = await jobs.createOrReuseJob({
        jobId,
        kind: "PATCH_COMPILE",
        sessionId,
        artifactId: sourceArtifact.manifest.artifactId,
        artifactManifestHash: manifestHash,
        conceptPack: { id: pack.id, version: pack.version },
        inputHashes: [
          manifestHash,
          current.verifiedResult.resultHash,
          current.transferResult.resultHash,
          bundleHash,
        ],
        requestIdentity,
        stateVersion: started.version,
        maxAttempts: 3,
        timeoutSeconds: 180,
      });
      const starting = await dispatchRecoverableRunnerJob({
        context,
        options,
        jobs,
        dispatcher,
        job: claimed.job,
      });
      return context.json(
        jsonSuccess({
          ...(await statePayload(context, started, options)),
          runnerJob: starting,
          ...(claimed.reused ? { reused: true as const } : {}),
        }),
        202,
      );
    }
    if (current.mode.kind !== "sample_lesson") {
      throw new ApiInputError(
        "REPLAY_READ_ONLY",
        "Verified replay sessions cannot compile a new patch",
        409,
      );
    }
    if (current.transferResult?.outcome !== "PASSED") {
      throw new ApiInputError(
        "PATCH_LOCKED_TRANSFER",
        "Repair remains locked until the deterministic transfer task passes",
        409,
      );
    }
    await requireApprovedSampleAuthority(
      sourceArtifact,
      "ARTIFACT_PATCH_MISMATCH",
    );
    try {
      assertSampleProofClaimScope(current);
    } catch {
      throw new ApiInputError(
        "SAMPLE_SCOPE_RESTART_REQUIRED",
        "This historical sample used custom claim framing. Start a new fixed sample before creating a repair or proof record.",
        409,
      );
    }
    await service.startPatchCompilation(sessionId, {
      actor: "system",
      authority: "fixed-approved-sample",
    });
    const patchResult = await createSamplePatchResult(
      sessionId,
      sampleManifest.fileSha256,
      (options.now?.() ?? new Date()).toISOString(),
    );
    if (
      (await sha256Text(samplePatchedNotebookText)) !==
      patchResult.patchedArtifactHash
    ) {
      throw new ApiInputError(
        "SAMPLE_PATCH_FIXTURE_INVALID",
        "The fixed sample patch bytes do not match their verified authority record",
        500,
      );
    }
    if (context.env?.ARTIFACTS !== undefined) {
      await context.env.ARTIFACTS.put(
        `patches/${sessionId}/customer_churn_leakage.patched.ipynb`,
        samplePatchedNotebookText,
        {
          httpMetadata: { contentType: "application/x-ipynb+json" },
          customMetadata: {
            sourceArtifactId: current.artifactId,
            patchedSha256: patchResult.patchedArtifactHash,
          },
        },
      );
    }
    const updated = await service.verifyPatch(sessionId, patchResult);
    return context.json(
      jsonSuccess({
        ...(await statePayload(context, updated, options)),
        patch: patchResult,
        kernelVerification: samplePatchKernelResult,
      }),
    );
  });

  app.get("/api/sessions/:sessionId/reasoning-diff", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    requireStoredSampleClaimScope(session);
    const reasoningDiff = session.reasoningDiffV2 ?? session.reasoningDiff;
    if (
      reasoningDiff === undefined ||
      (session.reasoningDiffV2 !== undefined &&
        session.proofCapsule === undefined)
    ) {
      throw new ApiInputError(
        "REASONING_DIFF_NOT_READY",
        "Reasoning Diff is issued only after a verified patch",
        409,
      );
    }
    return context.json(jsonSuccess(reasoningDiff));
  });

  app.get("/api/sessions/:sessionId/patch/download", async (context) => {
    const sessionId = context.req.param("sessionId");
    const session = await sessionService(context, options).getSession(
      sessionId,
    );
    requireStoredSampleClaimScope(session);
    if (session.patchResult?.status !== "VERIFIED") {
      throw new ApiInputError(
        "PATCH_NOT_READY",
        "A verified patch is required before download",
        409,
      );
    }
    const artifact = await artifacts(context, options).find(session.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "The patch source artifact was not found",
        404,
      );
    }
    const body =
      session.mode.kind === "sample_lesson"
        ? samplePatchedNotebookText
        : (
            await runnerObjectStore(context, options).get(
              `patches/${sessionId}/patched-notebook.ipynb`,
            )
          )?.body;
    if (
      body === undefined ||
      (await sha256Text(body)) !== session.patchResult.patchedArtifactHash
    ) {
      throw new ApiInputError(
        "PATCH_BYTES_NOT_FOUND",
        "The verified patched notebook bytes could not be resolved",
        404,
      );
    }
    const stem = artifact.manifest.fileName
      .replace(/\.ipynb$/iu, "")
      .replace(/[^A-Za-z0-9._-]+/gu, "-")
      .slice(0, 120);
    return new Response(body, {
      headers: {
        "content-type": "application/x-ipynb+json; charset=utf-8",
        "content-disposition": `attachment; filename="${stem || "notebook"}.counterlab-patched.ipynb"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });

  app.get("/api/sessions/:sessionId/proof-bundle", async (context) => {
    const service = sessionService(context, options);
    const session = await service.getSession(context.req.param("sessionId"));
    requireStoredSampleClaimScope(session);
    if (session.proofBundle === undefined) {
      throw new ApiInputError(
        "PROOF_BUNDLE_NOT_READY",
        "Proof Bundle is issued only after a verified patch",
        409,
      );
    }
    await requireStoredProofBundleIntegrity(
      session,
      service,
      context.env?.COUNTERLAB_SIGNING_KEY,
    );
    context.header(
      "content-disposition",
      `attachment; filename="counterlab-${session.id}-proof-bundle.json"`,
    );
    return context.json(jsonSuccess(session.proofBundle));
  });

  app.post("/api/sessions/:sessionId/replays", async (context) => {
    PublishReplaySchema.parse(await readJson(context));
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    if (
      session.mode.kind !== "live_notebook" ||
      session.state !== "PROOF_CAPSULE_ISSUED" ||
      session.proofCapsule === undefined
    ) {
      throw new ApiInputError(
        "REPLAY_PUBLICATION_LOCKED",
        "A replay can be published only from a completed live Proof Capsule",
        409,
      );
    }
    const persisted = await requireFrozenAuthorityObject(
      runnerObjectStore(context, options),
      session.proofCapsule.objectKey,
      "Proof Capsule",
    );
    const validated = await validatePersistedNativeProofCapsule({
      ...persisted,
      expectedReference: session.proofCapsule,
      ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
        ? {}
        : { signingKey: context.env.COUNTERLAB_SIGNING_KEY }),
      ...(context.env?.COUNTERLAB_SIGNING_KEY_ID === undefined
        ? {}
        : { signingKeyId: context.env.COUNTERLAB_SIGNING_KEY_ID }),
    });
    const { objectKey, ...publicCapsule } = session.proofCapsule;
    const replayId = `replay-${session.proofCapsule.rootHash.slice(0, 40)}`;
    const receipt = ProofCapsuleReplayReceiptV2Schema.parse({
      schemaVersion: "2",
      replayId,
      replay: true,
      label: "Verified replay",
      playbackMode: "verified_capsule_replay",
      sourceMode: "live_notebook",
      sourceSessionId: session.id,
      capsuleId: session.proofCapsule.capsuleId,
      concept: validated.manifest.concept,
      recordedAt: session.proofCapsule.createdAt,
      rootHash: session.proofCapsule.rootHash,
      bytesHash: session.proofCapsule.bytesHash,
      eventChainHead: session.proofCapsule.eventChainHead,
      proofCapsule: publicCapsule,
    });
    const exactReplay = await projectProofCapsuleReplayV2(validated, receipt, {
      ...(validated.manifest.authority.boundary.receipt.integrity.mode ===
        "hmac-signed" && context.env?.COUNTERLAB_SIGNING_KEY !== undefined
        ? {
            boundarySigningKeys: {
              [validated.manifest.authority.boundary.receipt.integrity.keyId]:
                context.env.COUNTERLAB_SIGNING_KEY,
            },
          }
        : {}),
    });
    const publicReplay = createPublicReplayProjectionV1(exactReplay, {
      ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined ||
      context.env?.COUNTERLAB_SIGNING_KEY_ID === undefined
        ? {}
        : {
            signing: {
              keyId: context.env.COUNTERLAB_SIGNING_KEY_ID,
              signingKey: context.env.COUNTERLAB_SIGNING_KEY,
            },
          }),
    });
    const projectionBody = canonicalJsonV1(publicReplay);
    const projectionBytesHash = await sha256Text(projectionBody);
    const projectionObjectKey =
      `public-replays/${publicReplay.replayId}/` +
      `${projectionBytesHash}.json`;
    await persistRunnerAuthorityBytes({
      store: runnerObjectStore(context, options),
      key: projectionObjectKey,
      body: projectionBody,
      contentType: "application/vnd.counterlab.public-replay+json",
    });
    const publishedAt = requestNow(options);
    const expiresAt = new Date(publishedAt.getTime() + PUBLIC_REPLAY_TTL_MS);
    const publication = await proofCapsuleReplays(
      context,
      options,
    ).createOrReuse(
      {
        schemaVersion: "2",
        replayId,
        sourceSessionId: session.id,
        capsuleId: session.proofCapsule.capsuleId,
        objectKey,
        projectionObjectKey,
        projectionHash: publicReplay.authority.projectionHash,
        projectionBytesHash,
        recordedAt: session.proofCapsule.createdAt,
        publishedAt: publishedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        metadata: receipt,
      },
      publishedAt.toISOString(),
    );
    const publicReceipt = PublicReplayPublicationReceiptV2Schema.parse({
      schemaVersion: "2",
      replayId: publicReplay.replayId,
      replay: true,
      label: "Verified replay",
      concept: publicReplay.concept,
      recordedAt: publicReplay.recordedAt,
      retention: {
        policy: "expires_or_revoked",
        revocable: true,
        publishedAt: publication.record.publishedAt,
        expiresAt: publication.record.expiresAt,
      },
    });
    return context.json(
      jsonSuccess({
        reused: publication.reused,
        replay: publicReceipt,
      }),
      publication.reused ? 200 : 201,
    );
  });

  app.get("/api/sessions/:sessionId/replays/status", async (context) => {
    const publication = await proofCapsuleReplays(
      context,
      options,
    ).statusBySourceSession(
      context.req.param("sessionId"),
      requestNow(options).toISOString(),
    );
    if (publication === undefined) {
      return context.json(jsonSuccess({ status: "never_published" as const }));
    }
    const replay = PublicReplayPublicationReceiptV2Schema.parse({
      schemaVersion: "2",
      replayId: publication.record.replayId,
      replay: true,
      label: "Verified replay",
      concept: publication.record.metadata.concept,
      recordedAt: publication.record.recordedAt,
      retention: {
        policy: "expires_or_revoked",
        revocable: true,
        publishedAt: publication.record.publishedAt,
        expiresAt: publication.record.expiresAt,
      },
    });
    return context.json(jsonSuccess({ status: publication.status, replay }));
  });

  app.post("/api/sessions/:sessionId/replays/revoke", async (context) => {
    PublishReplaySchema.parse(await readJson(context));
    const revoked = await proofCapsuleReplays(
      context,
      options,
    ).revokeBySourceSession(
      context.req.param("sessionId"),
      requestId(options, "replay-revocation"),
      requestNow(options).toISOString(),
    );
    if (revoked === undefined) {
      throw new ApiInputError(
        "REPLAY_NOT_FOUND",
        "No public replay exists for this private session",
        404,
      );
    }
    return context.json(
      jsonSuccess({
        replayId: revoked.replayId,
        revoked: true,
        alreadyRevoked: !revoked.revoked,
      }),
    );
  });

  app.get("/api/sessions/:sessionId/proof-capsule", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    requireStoredSampleClaimScope(session);
    if (session.proofCapsule === undefined) {
      throw new ApiInputError(
        "PROOF_CAPSULE_NOT_READY",
        "Proof Capsule v2 is issued only after native Reasoning Diff authority",
        409,
      );
    }
    const persisted = await requireFrozenAuthorityObject(
      runnerObjectStore(context, options),
      session.proofCapsule.objectKey,
      "Proof Capsule",
    );
    await validatePersistedNativeProofCapsule({
      ...persisted,
      expectedReference: session.proofCapsule,
      ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
        ? {}
        : { signingKey: context.env.COUNTERLAB_SIGNING_KEY }),
      ...(context.env?.COUNTERLAB_SIGNING_KEY_ID === undefined
        ? {}
        : { signingKeyId: context.env.COUNTERLAB_SIGNING_KEY_ID }),
    });
    const safeSessionId = session.id.replace(/[^A-Za-z0-9._-]+/gu, "-");
    return new Response(persisted.body, {
      headers: {
        "content-type": PROOF_CAPSULE_MEDIA_TYPE,
        "content-disposition": `attachment; filename="counterlab-${safeSessionId}.counterlab"`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });

  app.get("/api/replays/:replayId", async (context) => {
    const replayId = context.req.param("replayId");
    if (!PublicReplayLocatorSchema.safeParse(replayId).success) {
      throw new ApiInputError(
        "REPLAY_NOT_FOUND",
        "The requested replay was not found",
        404,
      );
    }
    if (replayId === "leakage-01") {
      return context.json(
        jsonSuccess({
          schemaVersion: "1" as const,
          replayId,
          replay: true as const,
          recordedAt: compilerReplaySummary.recordedAt,
          modelId: compilerReplaySummary.modelId,
          fixtureId: "customer-churn-public-v1",
          verifierVersion: "leakage-verifier-v1",
          templateCommit: compilerReplaySummary.repositoryCommitAtRun,
          compilerTrace: compilerReplaySummary,
          result: replayVerifiedResult,
          patch: replayPatchKernelResult,
        }),
      );
    }
    const { replay } = await loadHostedPublicReplayProjection(
      context,
      options,
      replayId,
    );
    context.header("cache-control", "private, no-store");
    return context.json(jsonSuccess(replay));
  });

  app.get("/api/replays/:replayId/proof-capsule", async (context) => {
    throw new ApiInputError(
      "REPLAY_PRIVATE_ARTIFACT_UNAVAILABLE",
      "Private replay artifacts are available only from the owner session",
      404,
    );
  });

  app.get("/api/replays/:replayId/patched-notebook", async (context) => {
    throw new ApiInputError(
      "REPLAY_PRIVATE_ARTIFACT_UNAVAILABLE",
      "Private replay artifacts are available only from the owner session",
      404,
    );
  });

  app.notFound((context) =>
    context.json(
      jsonError(
        "ROUTE_NOT_FOUND",
        `No CounterLab API route matches ${context.req.method} ${context.req.path}`,
        404,
      ),
      404,
    ),
  );

  app.onError(async (error, context) => {
    const callbackClaim = context.get("runnerCallbackClaim");
    if (callbackClaim !== undefined) {
      context.set("runnerCallbackClaim", undefined);
      try {
        await runnerJobService(context, options).releaseCallbackClaim(
          callbackClaim.jobId,
          callbackClaim.claim,
        );
      } catch {
        // Preserve the request error; the persisted claim remains observable.
      }
    }
    if (error instanceof ApiInputError) {
      if (error.retryAfterSeconds !== undefined) {
        context.header("retry-after", String(error.retryAfterSeconds));
      }
      return context.json(
        jsonError(error.code, error.message, error.status, error.retryable),
        { status: error.status as 400 },
      );
    }
    if (error instanceof ZodError) {
      return context.json(
        jsonError(
          "VALIDATION_ERROR",
          error.issues.map((issue) => issue.message).join("; "),
          400,
        ),
        400,
      );
    }
    if (error instanceof SessionNotFoundError) {
      return context.json(
        jsonError("SESSION_NOT_FOUND", error.message, 404),
        404,
      );
    }
    if (error instanceof LearnerInteractionConflictError) {
      return context.json(
        jsonError("INTERACTION_CONFLICT", error.message, 409),
        409,
      );
    }
    if (error instanceof RunnerCallbackStateError) {
      return context.json(
        jsonError("RUNNER_CALLBACK_STATE", error.message, 409),
        409,
      );
    }
    if (error instanceof InvalidSessionTransitionError) {
      return context.json(
        jsonError(
          "SESSION_STEP_CLOSED",
          "That investigation step is closed. Start a fresh investigation to revise it.",
          409,
        ),
        409,
      );
    }
    if (
      error instanceof PredictionAlreadyCommittedError ||
      error instanceof ConcurrentD1SessionUpdateError ||
      error instanceof ConcurrentRunnerJobUpdateError ||
      error instanceof ReplayPublicationConflictError ||
      error instanceof ReplayPublicationExpiredError ||
      error instanceof ReplayPublicationRevokedError ||
      error instanceof RunnerCallbackConflictError ||
      error instanceof RunnerEventCursorError
    ) {
      return context.json(
        jsonError("ILLEGAL_TRANSITION", error.message, 409),
        409,
      );
    }
    if (error instanceof RunnerJobNotFoundError) {
      return context.json(
        jsonError("RUNNER_JOB_NOT_FOUND", error.message, 404),
        404,
      );
    }
    if (error instanceof RunnerTokenError) {
      return context.json(
        jsonError("RUNNER_AUTH_INVALID", "Runner authorization failed", 401),
        401,
      );
    }
    if (error instanceof SessionInputError) {
      return context.json(
        jsonError("SESSION_INPUT_ERROR", error.message, 400),
        400,
      );
    }
    if (error instanceof NotebookParseError) {
      const status = error.code === "MAXIMUM_SIZE_EXCEEDED" ? 413 : 422;
      return context.json(jsonError(error.code, error.message, status), {
        status: status as 413,
      });
    }
    if (error instanceof BeliefAnalystError) {
      const upstreamStatus = error.details.status;
      const isAuthenticationFailure =
        error.code === "LIVE_UNAVAILABLE" &&
        (upstreamStatus === 401 || upstreamStatus === 403);
      const status =
        error.code === "UNSUPPORTED_ARTIFACT" ||
        error.code === "UNRESOLVED_EVIDENCE" ||
        error.code === "CLAIM_NOT_APPLICABLE" ||
        error.code === "INVALID_RESPONSE"
          ? 422
          : error.code === "INVALID_INPUT"
            ? 400
            : 503;
      const message = isAuthenticationFailure
        ? "Live reasoning is unavailable. Check the server configuration."
        : error.message;
      return context.json(jsonError(error.code, message, status), {
        status: status as 400,
      });
    }
    if (error instanceof LearningDirectorError) {
      const status =
        error.code === "INVALID_INPUT" ||
        error.code === "INVALID_RESPONSE" ||
        error.code === "UNREGISTERED_REFERENCE" ||
        error.code === "CLARIFICATION_ALREADY_USED" ||
        error.code === "TOOLS_REQUIRED" ||
        error.code === "TOOL_CALL_LIMIT" ||
        error.code === "TURN_LIMIT" ||
        error.code === "DUPLICATE_TOOL_CALL_ID" ||
        error.code === "UNKNOWN_TOOL" ||
        error.code === "MALFORMED_TOOL_CALL" ||
        error.code === "TOOL_ARGUMENT_REJECTED"
          ? 422
          : 503;
      return context.json(jsonError(error.code, error.message, status), {
        status: status as 422,
      });
    }
    console.error("CounterLab Worker request failed", {
      requestId: context.get("requestId"),
      name: error.name,
      message: error.message,
    });
    return context.json(
      jsonError("INTERNAL_ERROR", "The request could not be completed", 500),
      500,
    );
  });

  return app;
}

export const api = createApi();
