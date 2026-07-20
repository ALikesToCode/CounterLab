import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  BeliefTestSchema,
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  EvidenceVerdictSchema,
  EvidenceEventSchema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  LearnerInteractionInputSchema,
  LearnerInteractionReceiptSchema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  PublicReplayProjectionV1Schema,
  PublicReplayPublicationReceiptV1Schema,
  PublicProofCapsuleRefV2Schema,
  PublicCompilerEventSchema,
  ReasoningDiffSchema,
  ReasoningDiffV2Schema,
  RunnerJobErrorSchema,
  RunnerJobSchema,
  RunnerJobStatusSchema,
  SessionModeSchema,
  SessionStateSchema,
  TransferResultSchema,
  VerifiedResultSetSchema,
  apiSuccessSchema,
  canonicalJsonV1,
  type ArtifactManifest,
  type BeliefSpecV2,
  type BeliefTest,
  type BoundaryMapAuthorityRefV1,
  type BoundaryMapReceiptV1,
  type BoundaryMapResultV1,
  type BoundaryMapVerificationReportV1,
  type EvidenceEvent,
  type InteractiveImbalanceRunRequest,
  type InteractiveLeakageRunRequest,
  type LearnerHintId,
  type LearnerInteractionInput,
  type LearnerInteractionReceipt,
  type LeakageVerifiedResultSet,
  type ImbalanceVerifiedResultSet,
  type PatchResult,
  type PredictionContract,
  type ProofBundle,
  type PublicReplayProjectionV1,
  type PublicReplayPublicationReceiptV1,
  type PublicProofCapsuleRefV2,
  type ReasoningDiff,
  type ReasoningDiffV2,
  type RunnerJob,
  type PublicCompilerEvent,
  type SessionState,
  type TransferResult,
  type VerifiedResultSet,
} from "@counterlab/contracts";
import { z } from "zod";

import { canonicalUploadRequestBinding } from "../shared/upload-operation";

const NonEmptyString = z.string().trim().min(1);
const Sha256Digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");
const DEFAULT_REQUEST_TIMEOUT_MS = 210_000;
const UPLOAD_REQUEST_TIMEOUT_MS = 60_000;

const ReleaseIdentitySchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unbound") }).strict(),
  z
    .object({
      status: z.literal("bound"),
      workerVersionId: z
        .string()
        .regex(
          /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/,
        ),
      workerVersionTag: z.string().regex(/^git-[a-f0-9]{40}$/),
      workerEvidenceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      runnerSourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      runnerImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    })
    .strict(),
]);

export const CapabilityHealthSchema = z
  .object({
    platform: z.literal("cloudflare-workers"),
    sample: z.literal("available"),
    replay: z.literal("available"),
    liveGpt: z.enum(["configured", "server-key-required"]),
    liveCodex: z.enum(["configured", "local-runner-required"]),
    liveKernel: z.enum(["configured", "local-runner-required"]),
    maintenance: z.boolean().optional(),
    release: ReleaseIdentitySchema.optional(),
    sandbox: z.enum([
      "credential-and-privilege-boundary",
      "local-runner-required",
    ]),
    generationFilesystemReadIsolation: z.literal("PARTIAL"),
    requestId: NonEmptyString,
  })
  .strict();

export type CapabilityHealth = z.infer<typeof CapabilityHealthSchema>;

const ApiErrorEnvelopeSchema = z
  .object({
    ok: z.literal(false),
    error: z
      .object({
        code: NonEmptyString,
        message: NonEmptyString,
        status: z.number().int().min(100).max(599).optional(),
        details: z.record(z.string(), z.unknown()).optional(),
        retryable: z.boolean().optional(),
      })
      .strict(),
    requestId: NonEmptyString.optional(),
  })
  .strict();

function envelopeSchema<T extends z.ZodType>(dataSchema: T) {
  return z.union([apiSuccessSchema(dataSchema), ApiErrorEnvelopeSchema]);
}

const sessionViewShape = {
  sessionId: NonEmptyString,
  artifactId: NonEmptyString,
  mode: SessionModeSchema,
  state: SessionStateSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  beliefTest: BeliefTestSchema.optional(),
  beliefSpec: BeliefSpecV2Schema.optional(),
  prediction: PredictionContractSchema.optional(),
  verifiedResult: VerifiedResultSetSchema.optional(),
  evidenceVerdict: EvidenceVerdictSchema.optional(),
  epistemicReportHash: Sha256Digest.optional(),
  boundaryMapAuthority: BoundaryMapAuthorityRefV1Schema.optional(),
  transferResult: TransferResultSchema.optional(),
  patchResult: PatchResultSchema.optional(),
  revision: z.string().trim().min(1).optional(),
  reasoningDiff: ReasoningDiffSchema.optional(),
  proofBundle: ProofBundleSchema.optional(),
  reasoningDiffV2: ReasoningDiffV2Schema.optional(),
  proofCapsule: PublicProofCapsuleRefV2Schema.optional(),
};

function requireExclusiveBeliefAuthority(
  value: {
    beliefTest?: unknown;
    beliefSpec?: unknown;
    evidenceVerdict?: unknown;
    epistemicReportHash?: unknown;
  },
  context: z.RefinementCtx,
): void {
  if (value.beliefTest !== undefined && value.beliefSpec !== undefined) {
    context.addIssue({
      code: "custom",
      message: "a session view cannot contain more than one belief authority",
      path: ["beliefSpec"],
    });
  }
  const hasVerdict = value.evidenceVerdict !== undefined;
  const hasReport = value.epistemicReportHash !== undefined;
  if (hasVerdict !== hasReport) {
    context.addIssue({
      code: "custom",
      message:
        "an evidence verdict and epistemic report hash must be returned together",
      path: [hasVerdict ? "epistemicReportHash" : "evidenceVerdict"],
    });
  }
  if (hasVerdict && value.beliefSpec === undefined) {
    context.addIssue({
      code: "custom",
      message: "epistemic evidence requires Belief Spec v2 authority",
      path: ["evidenceVerdict"],
    });
  }
}

export const SessionViewSchema = z
  .object(sessionViewShape)
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type SessionView = z.infer<typeof SessionViewSchema>;
const OwnerCapabilitySchema = z.string().regex(/^cl_owner_[A-Za-z0-9_-]{43}$/u);
const SessionCreationViewSchema = z
  .object({
    ...sessionViewShape,
    ownerCapability: OwnerCapabilitySchema.optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
const ArtifactUploadViewSchema = ArtifactManifestSchema.extend({
  ownerCapability: OwnerCapabilitySchema.optional(),
}).strict();
export type ArtifactView = ArtifactManifest;

export type SessionBeliefAuthority =
  | { schemaVersion: "1"; beliefTest: BeliefTest }
  | { schemaVersion: "2"; beliefSpec: BeliefSpecV2 };

export function getSessionBeliefAuthority(
  session: Pick<SessionView, "beliefTest" | "beliefSpec">,
): SessionBeliefAuthority | undefined {
  if (session.beliefTest !== undefined) {
    return { schemaVersion: "1", beliefTest: session.beliefTest };
  }
  if (session.beliefSpec !== undefined) {
    return { schemaVersion: "2", beliefSpec: session.beliefSpec };
  }
  return undefined;
}

const LabCompileResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema.optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type LabCompileResponse = z.infer<typeof LabCompileResponseSchema>;

const RunnerActionResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema.optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type RunnerActionResponse = z.infer<typeof RunnerActionResponseSchema>;

const RunnerCancelResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema,
    reused: z.boolean(),
    runnerAcknowledged: z.boolean(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type RunnerCancelResponse = z.infer<typeof RunnerCancelResponseSchema>;

const InteractiveRunResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema,
    selectedRunId: NonEmptyString,
    configurationHash: Sha256Digest,
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type InteractiveRunResponse = z.infer<
  typeof InteractiveRunResponseSchema
>;

const InteractiveResultResponseSchema = z
  .object({
    result: VerifiedResultSetSchema,
    selectedRunId: NonEmptyString,
    configurationHash: Sha256Digest,
    verification: z.object({ status: z.literal("VERIFIED") }).passthrough(),
  })
  .strict();
export type InteractiveResultResponse = z.infer<
  typeof InteractiveResultResponseSchema
>;

const BoundaryRunResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema,
    reused: z.literal(true).optional(),
  })
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type BoundaryRunResponse = z.infer<typeof BoundaryRunResponseSchema>;

const BoundaryResponseSchema = z
  .object({
    result: BoundaryMapResultV1Schema,
    report: BoundaryMapVerificationReportV1Schema,
    receipt: BoundaryMapReceiptV1Schema,
    authority: BoundaryMapAuthorityRefV1Schema,
  })
  .strict()
  .superRefine((response, context) => {
    if (
      response.result.resultHash !== response.receipt.resultHash ||
      response.report.reportHash !== response.receipt.verificationReportHash ||
      response.authority.resultHash !== response.result.resultHash ||
      response.authority.verificationReportHash !==
        response.report.reportHash ||
      response.authority.sweepId !== response.result.sweepId ||
      response.authority.cellCount !== response.result.cells.length ||
      canonicalJsonV1(response.authority.receipt) !==
        canonicalJsonV1(response.receipt)
    ) {
      context.addIssue({
        code: "custom",
        message: "Boundary response authority hashes must resolve",
        path: ["authority"],
      });
    }
  });
export type BoundaryResponse = z.infer<typeof BoundaryResponseSchema>;

const ReasoningDiffResponseSchema = z.union([
  ReasoningDiffV2Schema,
  ReasoningDiffSchema,
]);
export type ReasoningDiffResponse = z.infer<typeof ReasoningDiffResponseSchema>;

const RunnerEventsResponseSchema = z
  .object({
    events: z.array(PublicCompilerEventSchema),
    nextCursor: z.number().int().nonnegative(),
    terminal: z.boolean(),
    jobStatus: RunnerJobStatusSchema.optional(),
    jobError: RunnerJobErrorSchema.optional(),
  })
  .strict();
export type RunnerEventsResponse = z.infer<typeof RunnerEventsResponseSchema>;

const EventsResponseSchema = z
  .object({ events: z.array(EvidenceEventSchema) })
  .strict();

const PatchCompileResponseSchema = z
  .object({
    ...sessionViewShape,
    runnerJob: RunnerJobSchema.optional(),
    patch: PatchResultSchema.optional(),
    kernelVerification: z.unknown().optional(),
  })
  .strict()
  .superRefine((response, context) => {
    requireExclusiveBeliefAuthority(response, context);
    if (response.runnerJob === undefined && response.patch === undefined) {
      context.addIssue({
        code: "custom",
        message: "patch compilation must queue a runner job or return a patch",
      });
    }
  });

const LegacyReplaySchema = z
  .object({
    schemaVersion: z.literal("1"),
    replayId: NonEmptyString,
    replay: z.literal(true),
    recordedAt: z.iso.datetime({ offset: true }),
    modelId: NonEmptyString,
    fixtureId: NonEmptyString,
    verifierVersion: NonEmptyString,
    templateCommit: NonEmptyString,
    compilerTrace: z
      .object({
        schemaVersion: z.literal("1"),
        replayId: NonEmptyString,
        label: z.literal("Verified replay"),
        trace: z.array(z.record(z.string(), z.unknown())).min(1),
      })
      .passthrough(),
    result: VerifiedResultSetSchema,
    patch: z.record(z.string(), z.unknown()),
  })
  .strict();

const ReplaySchema = z.union([
  LegacyReplaySchema,
  PublicReplayProjectionV1Schema,
]);

export type VerifiedReplay =
  z.infer<typeof LegacyReplaySchema> | PublicReplayProjectionV1;

const PublishReplayResponseSchema = z
  .object({
    reused: z.boolean(),
    replay: PublicReplayPublicationReceiptV1Schema,
  })
  .strict();

export type PublishReplayResponse = {
  reused: boolean;
  replay: PublicReplayPublicationReceiptV1;
};

const RevokeReplayResponseSchema = z
  .object({
    replayId: NonEmptyString,
    revoked: z.literal(true),
    alreadyRevoked: z.boolean(),
  })
  .strict();

export type RevokeReplayResponse = z.infer<typeof RevokeReplayResponseSchema>;

const ReplayPublicationStatusSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("never_published") }).strict(),
  z
    .object({
      status: z.enum(["active", "revoked"]),
      replay: PublicReplayPublicationReceiptV1Schema,
    })
    .strict(),
]);

export type ReplayPublicationStatus = z.infer<
  typeof ReplayPublicationStatusSchema
>;

const CreateSampleSessionInputSchema = z
  .object({ sampleId: z.literal("leakage-01") })
  .strict();
const CreateLiveSessionInputSchema = z
  .object({ artifactId: NonEmptyString })
  .strict();
const CreateReplaySessionInputSchema = z
  .object({ replayId: z.literal("leakage-01") })
  .strict();

const BeliefProposalInputSchema = z
  .object({
    learnerClaim: z.string().trim().min(12).max(2_000),
    previewHash: Sha256Digest.optional(),
    sensitiveContentApproved: z.boolean().optional(),
  })
  .strict();

const BeliefAnalysisPreviewSchema = z
  .object({
    schemaVersion: z.literal("1"),
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    conceptTitle: NonEmptyString,
    previewHash: Sha256Digest,
    requiresSensitiveApproval: z.boolean(),
    sanitizedContent: z.record(z.string(), z.unknown()),
  })
  .strict();

const BeliefResponseInputSchema = z.union([
  z.object({ action: z.literal("confirm") }).strict(),
  z
    .object({ action: z.literal("edit"), beliefTest: BeliefTestSchema })
    .strict(),
  z
    .object({ action: z.literal("edit"), beliefSpec: BeliefSpecV2Schema })
    .strict(),
  z.object({ action: z.literal("reject"), reason: NonEmptyString }).strict(),
  z
    .object({
      action: z.literal("insufficient_evidence"),
      reason: NonEmptyString,
    })
    .strict(),
]);

const PredictionInputSchema = z
  .object({
    choice: z.string().trim().min(1).max(300),
    numericRange: z
      .object({ min: z.number().finite(), max: z.number().finite() })
      .strict()
      .optional(),
    confidence: z.number().finite().min(0).max(100),
  })
  .strict()
  .superRefine((prediction, context) => {
    if (
      prediction.numericRange !== undefined &&
      prediction.numericRange.min > prediction.numericRange.max
    ) {
      context.addIssue({
        code: "custom",
        message: "numeric range minimum cannot exceed maximum",
        path: ["numericRange"],
      });
    }
  });

const RevisionInputSchema = z
  .object({ revision: z.string().trim().min(20).max(4_000) })
  .strict();

const TransferInputSchema = z
  .object({
    strategyChoice: NonEmptyString,
    riskChoice: NonEmptyString,
    evidenceChoices: z.array(NonEmptyString).max(3),
  })
  .strict();

export type CreateSampleSessionInput = z.input<
  typeof CreateSampleSessionInputSchema
>;
export type CreateLiveSessionInput = z.input<
  typeof CreateLiveSessionInputSchema
>;
export type CreateReplaySessionInput = z.input<
  typeof CreateReplaySessionInputSchema
>;
export type BeliefProposalInput = z.input<typeof BeliefProposalInputSchema>;
export type BeliefAnalysisPreview = z.infer<typeof BeliefAnalysisPreviewSchema>;
export type BeliefResponseInput = z.input<typeof BeliefResponseInputSchema>;
export type PredictionInput = z.input<typeof PredictionInputSchema>;
export type RevisionInput = z.input<typeof RevisionInputSchema>;
export type TransferInput = z.input<typeof TransferInputSchema>;

export type PatchCompileResponse = z.infer<typeof PatchCompileResponseSchema>;

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: Readonly<Record<string, unknown>>;
  readonly retryable: boolean;
  readonly requestId?: string;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    details?: Readonly<Record<string, unknown>>;
    retryable?: boolean;
    requestId?: string;
    cause?: unknown;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "ApiClientError";
    this.code = input.code;
    this.status = input.status;
    this.details = input.details ?? {};
    this.retryable = input.retryable ?? false;
    if (input.requestId !== undefined) {
      this.requestId = input.requestId;
    }
  }
}

export type CounterLabApiClientOptions = {
  baseUrl?: string;
  fetch?: typeof fetch;
  capabilityStorage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  requestTimeoutMs?: number;
};

function encodedId(value: string): string {
  if (value.trim().length === 0) {
    throw new ApiClientError({
      code: "INVALID_REQUEST",
      message: "route identifier cannot be empty",
      status: 0,
    });
  }
  return encodeURIComponent(value);
}

function validatedInput<T extends z.ZodType>(
  schema: T,
  value: unknown,
): z.output<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiClientError({
      code: "INVALID_REQUEST",
      message: "request data failed client validation",
      status: 0,
      details: { issues: parsed.error.issues },
    });
  }
  return parsed.data;
}

async function validatePublicReplayContent(
  replay: PublicReplayProjectionV1,
): Promise<void> {
  const {
    projectionHash: _projectionHash,
    projectionIntegrity: _projectionIntegrity,
    ...sourceAuthority
  } = replay.authority;
  const canonical = canonicalJsonV1({
    ...replay,
    authority: sourceAuthority,
  });
  if (globalThis.crypto?.subtle === undefined) {
    throw new ApiClientError({
      code: "REPLAY_INTEGRITY_UNAVAILABLE",
      message: "This browser cannot verify the public replay hash",
      status: 0,
    });
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical),
  );
  const expected = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (
    replay.authority.projectionHash !== expected ||
    replay.authority.projectionIntegrity.contentHash !== expected
  ) {
    throw new ApiClientError({
      code: "REPLAY_INTEGRITY_INVALID",
      message: "The public replay content does not match its authority hash",
      status: 0,
    });
  }
}

async function createUploadIdempotencyKey(file: File): Promise<string> {
  if (
    globalThis.crypto?.subtle === undefined ||
    typeof globalThis.crypto.randomUUID !== "function"
  ) {
    throw new ApiClientError({
      code: "UPLOAD_INTEGRITY_UNAVAILABLE",
      message: "This browser cannot create a hash-bound upload operation",
      status: 0,
    });
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  const fileSha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const operationId = globalThis.crypto.randomUUID();
  const requestBinding = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      canonicalJsonV1(
        canonicalUploadRequestBinding({
          operationId,
          fileSha256,
          fileName: file.name,
          mediaType: file.type,
        }),
      ),
    ),
  );
  const bindingHash = [...new Uint8Array(requestBinding)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `upload_${operationId}_${bindingHash}`;
}

export class CounterLabApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch | undefined;
  private readonly capabilityStorage:
    Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined;
  private readonly requestTimeoutMs: number;
  private readonly ownerCapabilities = new Map<string, string>();
  private readonly artifactCapabilities = new Map<string, string>();
  private readonly uploadIdempotencyKeys = new WeakMap<File, Promise<string>>();
  private readonly activeUploads = new WeakMap<
    File,
    Promise<ArtifactManifest>
  >();

  constructor(options: CounterLabApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetcher = options.fetch;
    this.capabilityStorage = options.capabilityStorage;
    this.requestTimeoutMs =
      options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    if (
      !Number.isInteger(this.requestTimeoutMs) ||
      this.requestTimeoutMs < 1 ||
      this.requestTimeoutMs > DEFAULT_REQUEST_TIMEOUT_MS
    ) {
      throw new ApiClientError({
        code: "INVALID_CONFIGURATION",
        message: "API request timeout is outside the supported range",
        status: 0,
      });
    }
  }

  hasSessionAccess(sessionId: string): boolean {
    return this.sessionOwnerCapability(sessionId) !== undefined;
  }

  getHealth(): Promise<CapabilityHealth> {
    return this.request("/api/health", CapabilityHealthSchema);
  }

  createSampleArtifact(): Promise<ArtifactManifest> {
    return this.request("/api/artifacts", ArtifactManifestSchema, {
      method: "POST",
      body: JSON.stringify({ sample: true }),
    });
  }

  uploadArtifact(file: File): Promise<ArtifactManifest> {
    const active = this.activeUploads.get(file);
    if (active !== undefined) return active;
    const upload = this.performArtifactUpload(file).finally(() => {
      if (this.activeUploads.get(file) === upload) {
        this.activeUploads.delete(file);
      }
    });
    this.activeUploads.set(file, upload);
    return upload;
  }

  private async performArtifactUpload(file: File): Promise<ArtifactManifest> {
    const existingKey = this.uploadIdempotencyKeys.get(file);
    const keyPromise = existingKey ?? createUploadIdempotencyKey(file);
    if (existingKey === undefined) {
      this.uploadIdempotencyKeys.set(file, keyPromise);
    }
    let idempotencyKey: string;
    try {
      idempotencyKey = await keyPromise;
    } catch (error) {
      if (this.uploadIdempotencyKeys.get(file) === keyPromise) {
        this.uploadIdempotencyKeys.delete(file);
      }
      throw error;
    }
    const form = new FormData();
    form.set("file", file, file.name);
    const uploaded = await this.request(
      "/api/artifacts",
      ArtifactUploadViewSchema,
      {
        method: "POST",
        headers: { "idempotency-key": idempotencyKey },
        body: form,
      },
      Math.min(this.requestTimeoutMs, UPLOAD_REQUEST_TIMEOUT_MS),
    );
    if (this.uploadIdempotencyKeys.get(file) === keyPromise) {
      this.uploadIdempotencyKeys.delete(file);
    }
    const { ownerCapability, ...artifact } = uploaded;
    if (ownerCapability !== undefined) {
      this.artifactCapabilities.set(artifact.artifactId, ownerCapability);
    }
    return artifact;
  }

  getArtifact(artifactId: string): Promise<ArtifactManifest> {
    return this.request(
      `/api/artifacts/${encodedId(artifactId)}`,
      ArtifactManifestSchema,
    );
  }

  getSessionArtifact(sessionId: string): Promise<ArtifactManifest> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/artifact`,
      ArtifactManifestSchema,
    );
  }

  createSampleSession(input: CreateSampleSessionInput): Promise<SessionView> {
    return this.request("/api/sample/sessions", SessionCreationViewSchema, {
      method: "POST",
      body: JSON.stringify(
        validatedInput(CreateSampleSessionInputSchema, input),
      ),
    }).then((created) => this.rememberCreatedSession(created));
  }

  createLiveSession(input: CreateLiveSessionInput): Promise<SessionView> {
    const artifactCapability = this.artifactCapabilities.get(input.artifactId);
    return this.request("/api/live/sessions", SessionCreationViewSchema, {
      method: "POST",
      body: JSON.stringify({
        ...validatedInput(CreateLiveSessionInputSchema, input),
        ...(artifactCapability === undefined ? {} : { artifactCapability }),
      }),
    }).then((created) => {
      this.artifactCapabilities.delete(input.artifactId);
      return this.rememberCreatedSession(created);
    });
  }

  restartSession(sessionId: string): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/restart`,
      SessionCreationViewSchema,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    ).then((created) => this.rememberCreatedSession(created));
  }

  createReplaySession(input: CreateReplaySessionInput): Promise<SessionView> {
    return this.request("/api/replay/sessions", SessionCreationViewSchema, {
      method: "POST",
      body: JSON.stringify(
        validatedInput(CreateReplaySessionInputSchema, input),
      ),
    }).then((created) => this.rememberCreatedSession(created));
  }

  getSession(sessionId: string): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}`,
      SessionViewSchema,
    );
  }

  proposeBeliefTest(
    sessionId: string,
    input: BeliefProposalInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/belief-test`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(BeliefProposalInputSchema, input)),
      },
    );
  }

  previewBeliefAnalysis(
    sessionId: string,
    learnerClaim: string,
  ): Promise<BeliefAnalysisPreview> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/belief-test/preview`,
      BeliefAnalysisPreviewSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(
            BeliefProposalInputSchema.pick({ learnerClaim: true }),
            {
              learnerClaim,
            },
          ),
        ),
      },
    );
  }

  respondToBeliefTest(
    sessionId: string,
    input: BeliefResponseInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/belief-test/confirm`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(BeliefResponseInputSchema, input)),
      },
    );
  }

  confirmBeliefTest(sessionId: string): Promise<SessionView> {
    return this.respondToBeliefTest(sessionId, { action: "confirm" });
  }

  commitPrediction(
    sessionId: string,
    input: PredictionInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/prediction`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(PredictionInputSchema, input)),
      },
    );
  }

  compileLab(sessionId: string): Promise<LabCompileResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/compile`,
      LabCompileResponseSchema,
    );
  }

  listRunnerEvents(
    sessionId: string,
    jobId: string,
    after = 0,
  ): Promise<RunnerEventsResponse> {
    if (!Number.isInteger(after) || after < 0) {
      return Promise.reject(
        new ApiClientError({
          code: "INVALID_EVENT_CURSOR",
          message: "Event cursor must be a non-negative integer",
          status: 400,
        }),
      );
    }
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/events?after=${after}`,
      RunnerEventsResponseSchema,
    );
  }

  cancelRunnerJob(
    sessionId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<RunnerCancelResponse> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/cancel`,
      RunnerCancelResponseSchema,
      {
        method: "POST",
        body: JSON.stringify({}),
        ...(signal === undefined ? {} : { signal }),
      },
    );
  }

  runLab(sessionId: string): Promise<RunnerActionResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/run`,
      RunnerActionResponseSchema,
    );
  }

  runBoundary(sessionId: string): Promise<BoundaryRunResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/boundary/run`,
      BoundaryRunResponseSchema,
    );
  }

  getBoundary(sessionId: string): Promise<BoundaryResponse> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/boundary`,
      BoundaryResponseSchema,
    );
  }

  runInteractiveLeakage(
    sessionId: string,
    input: InteractiveLeakageRunRequest,
  ): Promise<InteractiveRunResponse> {
    return this.requestRunnerAction(
      `/api/sessions/${encodedId(sessionId)}/lab/interactive`,
      InteractiveRunResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(InteractiveLeakageRunRequestSchema, input),
        ),
      },
    );
  }

  runInteractiveImbalance(
    sessionId: string,
    input: InteractiveImbalanceRunRequest,
  ): Promise<InteractiveRunResponse> {
    return this.requestRunnerAction(
      `/api/sessions/${encodedId(sessionId)}/lab/interactive`,
      InteractiveRunResponseSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(InteractiveImbalanceRunRequestSchema, input),
        ),
      },
    );
  }

  getInteractiveResult(
    sessionId: string,
    jobId: string,
  ): Promise<InteractiveResultResponse> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/result`,
      InteractiveResultResponseSchema,
    );
  }

  recordRevision(
    sessionId: string,
    input: RevisionInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/revision`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(RevisionInputSchema, input)),
      },
    );
  }

  submitTransfer(
    sessionId: string,
    input: TransferInput,
  ): Promise<SessionView> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/transfer`,
      SessionViewSchema,
      {
        method: "POST",
        body: JSON.stringify(validatedInput(TransferInputSchema, input)),
      },
    );
  }

  recordLearnerInteraction(
    sessionId: string,
    input: LearnerInteractionInput,
  ): Promise<LearnerInteractionReceipt> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/interactions`,
      LearnerInteractionReceiptSchema,
      {
        method: "POST",
        body: JSON.stringify(
          validatedInput(LearnerInteractionInputSchema, input),
        ),
      },
    );
  }

  compilePatch(sessionId: string): Promise<PatchCompileResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/patch/compile`,
      PatchCompileResponseSchema,
    );
  }

  patchDownloadUrl(sessionId: string): string {
    return `${this.baseUrl}/api/sessions/${encodedId(sessionId)}/patch/download`;
  }

  proofCapsuleDownloadUrl(sessionId: string): string {
    return `${this.baseUrl}/api/sessions/${encodedId(sessionId)}/proof-capsule`;
  }

  getEvents(sessionId: string): Promise<EvidenceEvent[]> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/events`,
      EventsResponseSchema,
    ).then((response) => response.events);
  }

  getReasoningDiff(sessionId: string): Promise<ReasoningDiffResponse> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/reasoning-diff`,
      ReasoningDiffResponseSchema,
    );
  }

  getProofBundle(sessionId: string): Promise<ProofBundle> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/proof-bundle`,
      ProofBundleSchema,
    );
  }

  async getReplay(replayId: string): Promise<VerifiedReplay> {
    const replay = await this.request(
      `/api/replays/${encodedId(replayId)}`,
      ReplaySchema,
    );
    if ("projectionKind" in replay) await validatePublicReplayContent(replay);
    return replay;
  }

  publishReplay(sessionId: string): Promise<PublishReplayResponse> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/replays`,
      PublishReplayResponseSchema,
    );
  }

  revokeReplay(sessionId: string): Promise<RevokeReplayResponse> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/replays/revoke`,
      RevokeReplayResponseSchema,
    );
  }

  getReplayPublicationStatus(
    sessionId: string,
  ): Promise<ReplayPublicationStatus> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/replays/status`,
      ReplayPublicationStatusSchema,
    );
  }

  revokeSessionAccess(sessionId: string): Promise<{ revoked: boolean }> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/access/revoke`,
      z.object({ revoked: z.boolean() }).strict(),
    ).then((result) => {
      this.ownerCapabilities.delete(sessionId);
      try {
        this.browserStorage()?.removeItem(this.ownerCapabilityKey(sessionId));
      } catch {
        // Access can remain memory-only when storage is unavailable.
      }
      return result;
    });
  }

  private rememberCreatedSession(
    created: z.infer<typeof SessionCreationViewSchema>,
  ): SessionView {
    const { ownerCapability, ...session } = created;
    if (ownerCapability !== undefined) {
      this.ownerCapabilities.set(session.sessionId, ownerCapability);
      try {
        this.browserStorage()?.setItem(
          this.ownerCapabilityKey(session.sessionId),
          ownerCapability,
        );
      } catch {
        // The in-memory capability still protects this browser tab.
      }
    }
    return session;
  }

  private ownerCapabilityKey(sessionId: string): string {
    return `counterlab.ownerCapability.${encodeURIComponent(sessionId)}`;
  }

  private browserStorage():
    Pick<Storage, "getItem" | "setItem" | "removeItem"> | undefined {
    if (this.capabilityStorage !== undefined) return this.capabilityStorage;
    if (typeof window !== "undefined" && window.localStorage !== undefined) {
      return window.localStorage;
    }
    return undefined;
  }

  private sessionOwnerCapability(sessionId: string): string | undefined {
    const current = this.ownerCapabilities.get(sessionId);
    if (current !== undefined) return current;
    try {
      const stored = this.browserStorage()?.getItem(
        this.ownerCapabilityKey(sessionId),
      );
      const parsed = OwnerCapabilitySchema.safeParse(stored);
      if (parsed.success) {
        this.ownerCapabilities.set(sessionId, parsed.data);
        return parsed.data;
      }
    } catch {
      // A missing or blocked storage surface is equivalent to no capability.
    }
    return undefined;
  }

  private postWithoutInput<T>(path: string, schema: z.ZodType<T>): Promise<T> {
    return this.request(path, schema, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  private postRunnerActionWithoutInput<T>(
    path: string,
    schema: z.ZodType<T>,
  ): Promise<T> {
    return this.requestRunnerAction(path, schema, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }

  private async requestRunnerAction<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit,
  ): Promise<T> {
    try {
      return await this.request(path, schema, init);
    } catch (error) {
      if (
        !(error instanceof ApiClientError) ||
        error.code !== "RUNNER_DISPATCH_FAILED" ||
        !error.retryable
      ) {
        throw error;
      }
      return this.request(path, schema, init);
    }
  }

  private async request<T>(
    path: string,
    dataSchema: z.ZodType<T>,
    init: RequestInit = { method: "GET" },
    timeoutMs = this.requestTimeoutMs,
  ): Promise<T> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (
      init.body !== undefined &&
      !(typeof FormData !== "undefined" && init.body instanceof FormData)
    ) {
      headers["content-type"] = "application/json";
    }
    for (const [name, value] of new Headers(init.headers).entries()) {
      headers[name] = value;
    }
    const sessionRoute = /^\/api\/sessions\/([^/?]+)/u.exec(path);
    if (
      sessionRoute?.[1] !== undefined &&
      headers.authorization === undefined
    ) {
      let sessionId: string;
      try {
        sessionId = decodeURIComponent(sessionRoute[1]);
      } catch {
        throw new ApiClientError({
          code: "INVALID_REQUEST",
          message: "session route identifier is malformed",
          status: 0,
        });
      }
      const capability = this.sessionOwnerCapability(sessionId);
      if (capability !== undefined) {
        headers.authorization = `Bearer ${capability}`;
      }
    }

    const controller = new AbortController();
    const callerSignal = init.signal;
    let timedOut = false;
    const timeout = globalThis.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const abortFromCaller = () => controller.abort(callerSignal?.reason);
    if (callerSignal?.aborted) {
      abortFromCaller();
    } else {
      callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
    }

    let response: Response | undefined;
    let responseText: string;
    try {
      const fetcher = this.fetcher ?? globalThis.fetch.bind(globalThis);
      response = await fetcher(`${this.baseUrl}${path}`, {
        ...init,
        method: init.method ?? "GET",
        headers,
        credentials: init.credentials ?? "same-origin",
        signal: controller.signal,
      });
      responseText = await response.text();
    } catch (cause) {
      if (cause instanceof ApiClientError) throw cause;
      if (timedOut) {
        throw new ApiClientError({
          code: "REQUEST_TIMEOUT",
          message: "CounterLab stopped waiting for the API response",
          status: 0,
          retryable: true,
          cause,
        });
      }
      throw new ApiClientError({
        code: response === undefined ? "NETWORK_ERROR" : "INVALID_API_RESPONSE",
        message:
          response === undefined
            ? "CounterLab could not reach the API"
            : "CounterLab could not read the API response",
        status: response?.status ?? 0,
        retryable: response === undefined,
        cause,
      });
    } finally {
      globalThis.clearTimeout(timeout);
      callerSignal?.removeEventListener("abort", abortFromCaller);
    }

    let payload: unknown;
    try {
      payload = JSON.parse(responseText);
    } catch (cause) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab received a non-JSON API response",
        status: response.status,
        cause,
      });
    }

    const parsed = envelopeSchema(dataSchema).safeParse(payload);
    if (!parsed.success) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "CounterLab received an invalid API response",
        status: response.status,
        details: { issues: parsed.error.issues },
      });
    }

    if (!parsed.data.ok) {
      throw new ApiClientError({
        code: parsed.data.error.code,
        message: parsed.data.error.message,
        status: parsed.data.error.status ?? response.status,
        ...(parsed.data.error.details === undefined
          ? {}
          : { details: parsed.data.error.details }),
        retryable: parsed.data.error.retryable ?? false,
        ...(parsed.data.requestId === undefined
          ? {}
          : { requestId: parsed.data.requestId }),
      });
    }

    if (!response.ok) {
      throw new ApiClientError({
        code: "INVALID_API_RESPONSE",
        message: "A failed HTTP response contained a success envelope",
        status: response.status,
      });
    }
    return parsed.data.data;
  }
}

export const counterLabApi = new CounterLabApiClient();

export type {
  ArtifactManifest,
  BeliefTest,
  BoundaryMapAuthorityRefV1,
  BoundaryMapReceiptV1,
  BoundaryMapResultV1,
  BoundaryMapVerificationReportV1,
  EvidenceEvent,
  PatchResult,
  PredictionContract,
  ProofBundle,
  PublicProofCapsuleRefV2,
  PublicCompilerEvent,
  ReasoningDiff,
  ReasoningDiffV2,
  RunnerJob,
  SessionState,
  TransferResult,
  VerifiedResultSet,
  LeakageVerifiedResultSet,
  ImbalanceVerifiedResultSet,
  LearnerHintId,
  LearnerInteractionInput,
  LearnerInteractionReceipt,
};
