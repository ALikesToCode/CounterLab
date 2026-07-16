import {
  ArtifactManifestSchema,
  ExperimentPlanV2Schema,
  HostedExperimentLineageV5Schema,
  HostedVerifiedResultSetV2Schema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  PatchPlanV1Schema,
  PatchResultSchema,
  PublicCompilerEventSchema,
  RunnerCallbackSchema,
  RunnerLabCompileBundleSchema,
  RunnerLabRunBundleSchema,
  RunnerOutputPathSchema,
  RunnerPatchCompileBundleSchema,
  RunnerRequestIdentityV1Schema,
  type BeliefSpecV2,
  type BeliefTest,
  type ArtifactManifest,
  type ExperimentPlanV2,
  type PatchResult,
  type RunnerCallback,
  type RunnerJob,
  type RunnerRequestIdentityV1,
  type VerifiedResultSet,
} from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  RunnerLabCompileBundleV5Schema,
  RunnerScientificCandidateV5Schema,
  VersionedRunnerJobInputBundleSchema,
  hashExperimentIR,
} from "@counterlab/experiment-ir";
import {
  ApprovedSampleBeliefAnalyst,
  BeliefAnalystError,
  buildSanitizedAnalystContext,
  createLiveBeliefAnalystFromEnv,
} from "@counterlab/belief-analyst";
import {
  getConceptPack,
  routeArtifactConcept,
} from "@counterlab/concept-registry";
import { NotebookParseError, parseNotebook } from "@counterlab/notebook-parser";
import {
  PlanVerificationError,
  PatchPlanVerificationError,
  ResultVerificationError,
  verifyExperimentPlan,
  verifyHostedResultSet,
  verifyInteractiveLeakageExperimentPlan,
  verifyInteractiveResultSet,
  verifyPatchPlan,
  verifyScientificCandidateV5,
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
  SessionNotFoundError,
  SessionService,
  getSessionBeliefAuthority,
  hashCanonical,
  type RunnerJobRepository,
  type CounterLabSession,
  type SessionRepository,
} from "@counterlab/session-core";
import { Hono } from "hono";
import type { Context } from "hono";
import { z, ZodError } from "zod";

import patchedNotebookText from "../../../replays/leakage-01/patch/customer_churn_leakage.patched.ipynb?raw";
import patchKernelResult from "../../../replays/leakage-01/patch-kernel-result.json";
import compilerReplaySummary from "../../../replays/leakage-01/compiler/replay-summary.json";
import replayVerifiedResult from "../../../replays/leakage-01/compiler/verified-live-run/verified-result.json";
import experimentPlanSchema from "../../../packages/contracts/schemas/experiment-plan-v2.schema.json";
import discriminationContractSchema from "../../../packages/contracts/schemas/discrimination-contract-v1.schema.json";
import experimentIrSchema from "../../../packages/experiment-ir/schemas/experiment-ir-v5.schema.json";
import labSceneDraftSchema from "../../../packages/generative-ui-contracts/schemas/lab-scene-draft-v2.schema.json";
import patchPlanSchema from "../../../packages/contracts/schemas/patch-plan-v1.schema.json";
import { D1ArtifactStore, type ArtifactStore } from "./artifact-store";
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
  createSamplePatchResult,
  evaluateImbalanceTransfer,
  evaluateLeakageTransfer,
} from "./sample-learning-loop";
import {
  createSampleReasoningProof,
  sampleLabEvidenceHashes,
  sampleLabVerification,
} from "./sample-proof";
import { createLiveReasoningProof } from "./live-proof";
import {
  loadOperationalDiagnostics,
  type OperationalDiagnostics,
} from "./operational-diagnostics";

type WorkerBindings = Env & {
  CODEX_AUTH_JSON?: string;
  OPENAI_API_KEY?: string;
  OPENAI_BASE_URL?: string;
  OPENAI_MODEL?: string;
  OPENAI_REASONING_EFFORT?: string;
  OPENAI_TIMEOUT_MS?: string;
  COUNTERLAB_CODEX_MODE?: string;
  COUNTERLAB_MAX_NOTEBOOK_BYTES?: string;
  COUNTERLAB_SIGNING_KEY?: string;
  COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY?: string;
  COUNTERLAB_RUNNER_BASE_URL?: string;
  COUNTERLAB_ADMIN_DIAGNOSTIC_SECRET?: string;
  RUNNER?: unknown;
};

type AppBindings = {
  Bindings: WorkerBindings;
  Variables: {
    requestId: string;
  };
};

export interface ApiOptions {
  sessionRepository?: SessionRepository;
  artifactStore?: ArtifactStore;
  runnerJobRepository?: RunnerJobRepository;
  runnerObjectStore?: RunnerObjectStore;
  runnerDispatcher?: RunnerDispatcher;
  runnerSigningPrivateKey?: string;
  adminDiagnosticSecret?: string;
  operationalDiagnostics?: () => Promise<OperationalDiagnostics>;
  now?: () => Date;
  id?: (prefix: string) => string;
}

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
  .object({ artifactId: z.string().trim().min(1) })
  .strict();
const CreateReplaySessionSchema = z
  .object({ replayId: z.literal("leakage-01") })
  .strict();
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
const TransferSubmissionSchema = z
  .object({
    strategyChoice: z.string().trim().min(1),
    riskChoice: z.string().trim().min(1),
    evidenceChoices: z.array(z.string().trim().min(1)).max(3),
  })
  .strict();
const LegacyRunnerCandidateSchema = z
  .object({
    attempt: z.number().int().positive().max(3),
    planSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  })
  .strict();

const DEFAULT_MAX_NOTEBOOK_BYTES = 10_485_760;
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
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

async function readJson(
  context: Context<AppBindings>,
  maxBytes = 64 * 1024,
): Promise<unknown> {
  const declared = contentLength(context);
  if (declared !== undefined && declared > maxBytes) {
    throw new ApiInputError(
      "REQUEST_TOO_LARGE",
      `JSON request exceeds ${maxBytes} bytes`,
      413,
    );
  }
  const text = await context.req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiInputError(
      "REQUEST_TOO_LARGE",
      `JSON request exceeds ${maxBytes} bytes`,
      413,
    );
  }
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
  const declared = contentLength(context);
  if (declared !== undefined && declared > maxBytes) {
    throw new ApiInputError(
      "REQUEST_TOO_LARGE",
      `Request exceeds ${maxBytes} bytes`,
      413,
    );
  }
  const text = await context.req.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    throw new ApiInputError(
      "REQUEST_TOO_LARGE",
      `Request exceeds ${maxBytes} bytes`,
      413,
    );
  }
  return text;
}

class ApiInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly retryable = false,
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
  if (options.runnerObjectStore !== undefined) return options.runnerObjectStore;
  if (context.env?.ARTIFACTS === undefined) {
    throw new ApiInputError(
      "RUNNER_STORAGE_UNAVAILABLE",
      "Private runner storage is not configured",
      503,
    );
  }
  return new R2RunnerObjectStore(context.env.ARTIFACTS);
}

function runnerDispatcher(
  context: Context<AppBindings>,
  options: ApiOptions,
): RunnerDispatcher | undefined {
  if (options.runnerDispatcher !== undefined) return options.runnerDispatcher;
  const processRunnerURL = context.env?.COUNTERLAB_RUNNER_BASE_URL?.trim();
  if (processRunnerURL !== undefined && processRunnerURL.length > 0) {
    try {
      return new HttpRunnerDispatcher({ baseURL: processRunnerURL });
    } catch {
      return undefined;
    }
  }
  return isRunnerContainerBinding(context.env?.RUNNER) &&
    (context.env?.CODEX_AUTH_JSON?.trim().length ?? 0) > 0
    ? new CloudflareContainerRunnerDispatcher(
        context.env.RUNNER,
        createRunnerContainerEnvVars(context.env),
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

function requestId(options: ApiOptions, prefix: string): string {
  return options.id?.(prefix) ?? `${prefix}_${crypto.randomUUID()}`;
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
      expiresAt: nowEpochSeconds + 300,
    },
    runnerSigningPrivateKey(input.context, input.options),
  );
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
    const failure = {
      code: "RUNNER_DISPATCH_FAILED",
      message:
        "The process runner did not acknowledge this job; retrying will create a fresh isolated job",
      retryable: true,
    } as const;
    try {
      const failed = await input.jobs.transition(
        dispatchJob.jobId,
        dispatchJob.jobVersion,
        "FAILED",
        { runnerIdentity: input.dispatcher.identity, error: failure },
      );
      await input.jobs.appendEvent(failed.jobId, failed.jobVersion, {
        schemaVersion: "1",
        eventId: requestId(input.options, "compiler_event"),
        jobId: failed.jobId,
        cursor: failed.eventCursor + 1,
        at: requestNow(input.options).toISOString(),
        kind: "job.failed",
        code: failure.code,
        message: failure.message,
      });
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
  ] = objects as Array<{ body: string; contentType: string }>;

  let bundle: z.infer<typeof RunnerLabCompileBundleV5Schema>;
  let contract: unknown;
  let rawIr: unknown;
  let scene: unknown;
  let storedReport: unknown;
  let storedSelection: unknown;
  let storedSelectedIr: z.infer<typeof ExperimentIRV5Schema>;
  let storedPlan: ExperimentPlanV2;
  try {
    bundle = RunnerLabCompileBundleV5Schema.parse(JSON.parse(inputObject.body));
    contract = JSON.parse(contractObject.body) as unknown;
    rawIr = JSON.parse(rawIrObject.body) as unknown;
    scene = JSON.parse(sceneObject.body) as unknown;
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
    lineage,
    outcome,
    projectedPlan: storedPlan,
    selectedExperimentIr: storedSelectedIr,
  };
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
): void {
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
}

function isFile(value: string | File | null): value is File {
  return value !== null && typeof value !== "string";
}

function statePayload(
  session: Awaited<ReturnType<SessionService["getSession"]>>,
) {
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
    ...(session.prediction === undefined
      ? {}
      : { prediction: session.prediction }),
    ...(session.verifiedResult === undefined
      ? {}
      : { verifiedResult: session.verifiedResult }),
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
  };
}

export function createApi(options: ApiOptions = {}) {
  const app = new Hono<AppBindings>();

  app.get("/ready", async (context) => {
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
    const checks = {
      analyst: (context.env?.OPENAI_API_KEY?.trim().length ?? 0) > 0,
      persistence,
      privateStorage,
      runner: dispatcher === undefined ? false : await dispatcher.ready(),
      signing,
    };
    const ready = Object.values(checks).every(Boolean);
    context.header("cache-control", "no-store");
    context.header("x-content-type-options", "nosniff");
    return context.json(
      {
        status: ready ? ("ready" as const) : ("not-ready" as const),
        service: "counterlab-control-plane" as const,
        checks,
      },
      ready ? 200 : 503,
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
    await next();
  });

  app.get("/api/health", (context) => {
    const runner = runnerCapability(context, options);
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
        sandbox: runner,
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
    const type = (context.req.header("content-type") ?? "").split(";", 1)[0];
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
    const declared = contentLength(context);
    const maxBytes = maxNotebookBytes(context);
    if (declared !== undefined && declared > maxBytes + 65_536) {
      throw new ApiInputError(
        "MAXIMUM_SIZE_EXCEEDED",
        `Notebook upload exceeds ${maxBytes} bytes`,
        413,
      );
    }
    const form = await context.req.formData();
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
        createdAt: new Date().toISOString(),
      }),
    );
    if (context.env?.ARTIFACTS === undefined) {
      throw new ApiInputError(
        "ARTIFACT_STORAGE_UNAVAILABLE",
        "Private artifact storage is not configured",
        503,
      );
    }
    const objectKey = `uploads/${manifest.artifactId}/${manifest.fileSha256}.ipynb`;
    await context.env.ARTIFACTS.put(objectKey, bytes, {
      httpMetadata: { contentType: "application/x-ipynb+json" },
      customMetadata: { artifactId: manifest.artifactId },
    });
    await artifacts(context, options).save(manifest, objectKey);
    return context.json(jsonSuccess(manifest), 201);
  });

  app.get("/api/artifacts/:artifactId", async (context) => {
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
    return context.json(jsonSuccess(statePayload(session)), 201);
  });

  app.post("/api/live/sessions", async (context) => {
    const input = CreateLiveSessionSchema.parse(await readJson(context));
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
    const session = await sessionService(context, options).createSession({
      artifactId: input.artifactId,
      mode: { kind: "live_notebook" },
    });
    return context.json(jsonSuccess(statePayload(session)), 201);
  });

  app.post("/api/replay/sessions", async (context) => {
    const input = CreateReplaySessionSchema.parse(await readJson(context));
    const artifact = await artifacts(context, options).save(sampleManifest);
    const session = await sessionService(context, options).createSession({
      artifactId: artifact.manifest.artifactId,
      mode: { kind: "verified_replay", replayId: input.replayId },
    });
    return context.json(jsonSuccess(statePayload(session)), 201);
  });

  app.get("/api/sessions/:sessionId", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    return context.json(jsonSuccess(statePayload(session)));
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
    const sanitizedContent = buildSanitizedAnalystContext({
      sessionId: session.id,
      learnerClaim,
      manifest: artifact.manifest,
      concept: routing.concept,
    });
    const serialized = JSON.stringify(sanitizedContent);
    return context.json(
      jsonSuccess({
        schemaVersion: "1" as const,
        concept: routing.concept,
        conceptTitle: getConceptPack(routing.concept).title,
        previewHash: await hashCanonical(sanitizedContent),
        requiresSensitiveApproval:
          serialized.includes("[REDACTED_SECRET]") ||
          serialized.includes("[REDACTED_PATH]"),
        sanitizedContent,
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
      return context.json(jsonSuccess(statePayload(proposed)));
    }

    if (session.mode.kind === "live_notebook") {
      const sanitizedContent = buildSanitizedAnalystContext({
        sessionId: session.id,
        learnerClaim,
        manifest: artifact.manifest,
        concept: routing.concept,
      });
      const expectedPreviewHash = await hashCanonical(sanitizedContent);
      if (input.previewHash !== expectedPreviewHash) {
        throw new ApiInputError(
          "SANITIZED_PREVIEW_REQUIRED",
          "Review the current sanitized analyst preview before starting live reasoning",
          409,
        );
      }
      const serialized = JSON.stringify(sanitizedContent);
      const containsSensitiveRedaction =
        serialized.includes("[REDACTED_SECRET]") ||
        serialized.includes("[REDACTED_PATH]");
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
      const proposed = await service.proposeBeliefSpecV2(
        session.id,
        result.beliefSpec,
        {
          actor: "gpt-5.6",
          modelId: result.provenance.modelId,
          promptHash: result.provenance.promptHash,
        },
      );
      return context.json(jsonSuccess(statePayload(proposed)));
    }

    const analyst = new ApprovedSampleBeliefAnalyst();
    const result = await analyst.propose({
      sessionId: session.id,
      learnerClaim,
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
    return context.json(jsonSuccess(statePayload(proposed)));
  });

  app.post("/api/sessions/:sessionId/belief-test/confirm", async (context) => {
    const input = ConfirmationSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    if (input.action === "confirm") {
      return context.json(
        jsonSuccess(statePayload(await service.confirmBeliefTest(sessionId))),
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
            statePayload(
              await service.editBeliefSpecV2(sessionId, input.beliefSpec),
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
          statePayload(
            await service.editBeliefTest(sessionId, input.beliefTest),
          ),
        ),
      );
    }
    if (input.action === "reject") {
      return context.json(
        jsonSuccess(
          statePayload(await service.rejectBeliefTest(sessionId, input.reason)),
        ),
      );
    }
    return context.json(
      jsonSuccess(
        statePayload(
          await service.markInsufficientEvidence(sessionId, input.reason),
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
        statePayload(await service.commitPrediction(sessionId, prediction)),
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
        planRequirements: pack.experimentPlanRules,
      });
      const v5Compile = current.beliefSpec !== undefined;
      const scientificPromptHash = await hashCanonical({
        promptVersion: "scientific-method-compile-v1",
        conceptPack: { id: pack.id, version: pack.version },
        candidateExperimentIds: pack.scientificMethod.candidateExperimentIds,
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
                resourceLimits: {
                  wallSeconds: 45,
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
            ...statePayload(current),
            runnerJob,
            reused: true as const,
          }),
          202,
        );
      }
      const started =
        current.state === "LAB_COMPILING"
          ? current
          : await service.startLabCompilation(sessionId);
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
                wallSeconds: 45,
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
          ...statePayload(started),
          runnerJob: starting,
          ...(claimed.reused ? { reused: true as const } : {}),
        }),
        202,
      );
    }
    await service.startLabCompilation(sessionId);
    const verified = await service.verifyLab(
      sessionId,
      {
        ...sampleLabVerification,
        source: "stored-approved-leakage-v1",
      },
      [
        sampleLabEvidenceHashes.adapter,
        sampleLabEvidenceHashes.publicTests,
        sampleLabEvidenceHashes.externalVerifier,
      ],
    );
    return context.json(jsonSuccess(statePayload(verified)));
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
    if (
      inputObject === undefined ||
      planObject === undefined ||
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
    try {
      const bundle = RunnerPatchCompileBundleSchema.parse(
        JSON.parse(inputObject.body),
      );
      await verifyPatchPlan(JSON.parse(planObject.body) as unknown, {
        sessionId: session.id,
        manifest: artifact.manifest,
        beliefTest: session.beliefTest,
        verifiedResultHash: session.verifiedResult.resultHash,
        transferResultHash: session.transferResult.resultHash,
        conceptPackVersion: job.conceptPack.version,
        allowedTransformations: bundle.patchContract.allowedTransformations,
        allowedCellIndices: bundle.allowedCellIndices,
      });
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
    const started = await runnerJobService(context, options).transition(
      jobId,
      job.jobVersion,
      "RUNNING",
      { runnerIdentity: job.runnerIdentity ?? "authenticated-runner" },
    );
    return context.json(jsonSuccess({ runnerJob: started }));
  });

  app.post("/api/runner/jobs/:jobId/events", async (context) => {
    const jobId = context.req.param("jobId");
    const { job } = await authorizeRunner(context, options, jobId);
    if (job.status !== "RUNNING" && job.status !== "REPAIRING") {
      throw new ApiInputError(
        "RUNNER_JOB_NOT_ACTIVE",
        "Compiler events are accepted only while a runner job is active",
        409,
      );
    }
    const event = PublicCompilerEventSchema.parse(await readJson(context));
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
      permitted = new Set(["verified-result.json"]);
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
    const body = await readBoundedText(
      context,
      generatedPath.endsWith(".ipynb") ? maxNotebookBytes(context) : 1_048_576,
    );
    const contentType = generatedPath.endsWith(".json")
      ? "application/json"
      : generatedPath.endsWith(".ipynb")
        ? "application/x-ipynb+json; charset=utf-8"
        : "text/markdown; charset=utf-8";
    await runnerObjectStore(context, options).put(
      `${claims.outputPrefix}${generatedPath}`,
      body,
      contentType,
    );
    return context.json(
      jsonSuccess({ path: generatedPath, sha256: await sha256Text(body) }),
      201,
    );
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
      const projectedSession = await projectCancellation();
      return context.json(
        jsonSuccess({
          ...statePayload(projectedSession),
          runnerJob: job,
          reused: true as const,
          runnerAcknowledged: true,
        }),
      );
    }
    if (["VERIFIED", "REJECTED", "FAILED", "TIMED_OUT"].includes(job.status)) {
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
        ...statePayload(updatedSession),
        runnerJob: cancelled,
        reused: false as const,
        runnerAcknowledged,
      }),
    );
  });

  app.post("/api/runner/jobs/:jobId/callback", async (context) => {
    const jobId = context.req.param("jobId");
    const callbackPath = `/api/runner/jobs/${jobId}/callback`;
    const { claims, job } = await authorizeRunner(
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

    let verification:
      | Awaited<ReturnType<typeof verifyExperimentPlan>>
      | Awaited<ReturnType<typeof verifyHostedResultSet>>
      | Awaited<ReturnType<typeof verifyPatchPlan>>
      | Awaited<ReturnType<typeof verifyScientificCandidateV5>>["report"]
      | null = null;
    let scientificAuthority: Awaited<
      ReturnType<typeof reconstructScientificCompileAuthority>
    > | null = null;
    let verifiedResult: VerifiedResultSet | null = null;
    let interactiveRun = false;
    let patchResult: PatchResult | null = null;
    let terminalCallback: RunnerCallback = callback;
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
    if (callback.status === "VERIFIED" && job.kind === "PATCH_COMPILE") {
      const [artifact, inputObject, planObject, resultObject, notebookObject] =
        await Promise.all([
          artifacts(context, options).find(job.artifactId),
          runnerObjectStore(context, options).get(claims.inputBundleKey),
          runnerObjectStore(context, options).get(
            `${claims.outputPrefix}patch-plan.json`,
          ),
          runnerObjectStore(context, options).get(
            `${claims.outputPrefix}patch-result.json`,
          ),
          runnerObjectStore(context, options).get(
            `${claims.outputPrefix}patched-notebook.ipynb`,
          ),
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
            parsedPatch.patchHash !== (await hashCanonical(parsedPatch.diff)) ||
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
          await runnerObjectStore(context, options).put(
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

    const completed = await runnerJobService(context, options).recordCallback(
      terminalCallback,
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
        updatedSession = await service.verifyPatch(job.sessionId, patchResult);
      } else if (
        updatedSession.patchResult?.resultHash !== patchResult.resultHash
      ) {
        throw new ApiInputError(
          "RUNNER_PROJECTION_CONFLICT",
          "The fixed patch callback conflicts with session evidence",
          409,
        );
      }
      if (updatedSession.state === "PATCH_VERIFIED") {
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
        session: statePayload(updatedSession),
        verification,
      }),
    );
  });

  app.get("/api/sessions/:sessionId/events", async (context) => {
    const events = await sessionService(context, options).listEvents(
      context.req.param("sessionId"),
    );
    return context.json(jsonSuccess({ events }));
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
      if (
        artifact === undefined ||
        current.beliefTest === undefined ||
        current.labVerification === undefined
      ) {
        throw new ApiInputError(
          "LIVE_CONTRACTS_REQUIRED",
          "A verified artifact-specific Plan is required before execution",
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
          ...statePayload(current),
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
    requireApprovedSampleArtifact(artifact, "ARTIFACT_RESULT_MISMATCH");
    const completed = await service.recordExperimentResult(
      sessionId,
      sampleResult,
    );
    return context.json(jsonSuccess(statePayload(completed)));
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
      current.verifiedResult === undefined ||
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
    const dispatcher = runnerDispatcher(context, options);
    if (dispatcher === undefined) {
      throw new ApiInputError(
        "LOCAL_RUNNER_REQUIRED",
        "Interactive fixed-kernel execution requires a configured CounterLab runner",
        503,
      );
    }
    const artifact = await artifacts(context, options).find(current.artifactId);
    const lineage = HostedPlanLineageSchema.safeParse(current.labVerification);
    if (artifact === undefined || !lineage.success) {
      throw new ApiInputError(
        "LIVE_PLAN_LINEAGE_MISSING",
        "The verified Plan lineage is incomplete",
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
        ...statePayload(current),
        runnerJob: starting,
        selectedRunId,
        configurationHash,
        ...(claimed.reused ? { reused: true as const } : {}),
      }),
      202,
    );
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
    const [inputObject, resultObject] = await Promise.all([
      runnerObjectStore(context, options).get(`runner-input/${jobId}.json`),
      runnerObjectStore(context, options).get(
        `runner-output/${jobId}/verified-result.json`,
      ),
    ]);
    if (inputObject === undefined || resultObject === undefined) {
      throw new ApiInputError(
        "RUNNER_OUTPUT_MISSING",
        "The verified interactive result is missing",
        409,
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
    return context.json(jsonSuccess(statePayload(updated)));
  });

  app.post("/api/sessions/:sessionId/transfer", async (context) => {
    const submission = TransferSubmissionSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
    const artifact = await artifacts(context, options).find(current.artifactId);
    if (current.mode.kind === "verified_replay") {
      throw new ApiInputError(
        "REPLAY_READ_ONLY",
        "Verified replay sessions cannot submit a new transfer answer",
        409,
      );
    }
    if (current.mode.kind === "sample_lesson") {
      requireApprovedSampleArtifact(artifact, "ARTIFACT_TRANSFER_MISMATCH");
    } else {
      const manifestHash =
        artifact === undefined ? null : await hashCanonical(artifact.manifest);
      if (
        current.verifiedResult?.schemaVersion !== "2" ||
        current.beliefTest === undefined ||
        current.verifiedResult.concept !== current.beliefTest.concept ||
        current.verifiedResult.artifactManifestHash !== manifestHash
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
    const result =
      current.beliefTest?.concept === "class_imbalance"
        ? await evaluateImbalanceTransfer(sessionId, submission, evaluatedAt)
        : await evaluateLeakageTransfer(sessionId, submission, evaluatedAt);
    const updated = await service.recordTransferResult(sessionId, result);
    return context.json(jsonSuccess(statePayload(updated)));
  });

  app.post("/api/sessions/:sessionId/patch/compile", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    requireMutableSession(current);
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
            ...statePayload(current),
            runnerJob,
            reused: true as const,
          }),
          202,
        );
      }
      const started =
        current.state === "PATCH_COMPILING"
          ? current
          : await service.startPatchCompilation(sessionId);
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
          ...statePayload(started),
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
    requireApprovedSampleArtifact(sourceArtifact, "ARTIFACT_PATCH_MISMATCH");
    await service.startPatchCompilation(sessionId);
    const patchResult = await createSamplePatchResult(
      sessionId,
      sampleManifest.fileSha256,
      (options.now?.() ?? new Date()).toISOString(),
    );
    if (context.env?.ARTIFACTS !== undefined) {
      await context.env.ARTIFACTS.put(
        `patches/${sessionId}/customer_churn_leakage.patched.ipynb`,
        patchedNotebookText,
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
    const artifact = await artifacts(context, options).find(updated.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        "Session artifact was not found while issuing proof",
        404,
      );
    }
    const events = await service.listEvents(sessionId);
    const proof = createSampleReasoningProof({
      session: updated,
      manifest: artifact.manifest,
      events,
      issuedAt: (options.now?.() ?? new Date()).toISOString(),
      ...(context.env?.COUNTERLAB_SIGNING_KEY === undefined
        ? {}
        : { signingKey: context.env.COUNTERLAB_SIGNING_KEY }),
    });
    const issued = await service.issueReasoningDiff(
      sessionId,
      proof.reasoningDiff,
      proof.proofBundle,
    );
    return context.json(
      jsonSuccess({
        ...statePayload(issued),
        patch: patchResult,
        kernelVerification: patchKernelResult,
      }),
    );
  });

  app.get("/api/sessions/:sessionId/reasoning-diff", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    if (session.reasoningDiff === undefined) {
      throw new ApiInputError(
        "REASONING_DIFF_NOT_READY",
        "Reasoning Diff is issued only after a verified patch",
        409,
      );
    }
    return context.json(jsonSuccess(session.reasoningDiff));
  });

  app.get("/api/sessions/:sessionId/patch/download", async (context) => {
    const sessionId = context.req.param("sessionId");
    const session = await sessionService(context, options).getSession(
      sessionId,
    );
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
        ? patchedNotebookText
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
      },
    });
  });

  app.get("/api/sessions/:sessionId/proof-bundle", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    if (session.proofBundle === undefined) {
      throw new ApiInputError(
        "PROOF_BUNDLE_NOT_READY",
        "Proof Bundle is issued only after a verified patch",
        409,
      );
    }
    context.header(
      "content-disposition",
      `attachment; filename="counterlab-${session.id}-proof-bundle.json"`,
    );
    return context.json(jsonSuccess(session.proofBundle));
  });

  app.get("/api/replays/:replayId", (context) => {
    const replayId = context.req.param("replayId");
    if (replayId !== "leakage-01") {
      return context.json(
        jsonError("REPLAY_NOT_FOUND", `Replay ${replayId} was not found`, 404),
        404,
      );
    }
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
        patch: patchKernelResult,
      }),
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

  app.onError((error, context) => {
    if (error instanceof ApiInputError) {
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
    if (
      error instanceof InvalidSessionTransitionError ||
      error instanceof PredictionAlreadyCommittedError ||
      error instanceof ConcurrentD1SessionUpdateError ||
      error instanceof ConcurrentRunnerJobUpdateError ||
      error instanceof RunnerCallbackConflictError ||
      error instanceof RunnerCallbackStateError ||
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
