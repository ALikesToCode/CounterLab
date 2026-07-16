import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  BeliefTestSchema,
  EvidenceEventSchema,
  InteractiveImbalanceRunRequestSchema,
  InteractiveLeakageRunRequestSchema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  PublicCompilerEventSchema,
  ReasoningDiffSchema,
  RunnerJobErrorSchema,
  RunnerJobSchema,
  RunnerJobStatusSchema,
  SessionModeSchema,
  SessionStateSchema,
  TransferResultSchema,
  VerifiedResultSetSchema,
  apiSuccessSchema,
  type ArtifactManifest,
  type BeliefSpecV2,
  type BeliefTest,
  type EvidenceEvent,
  type InteractiveImbalanceRunRequest,
  type InteractiveLeakageRunRequest,
  type LeakageVerifiedResultSet,
  type ImbalanceVerifiedResultSet,
  type PatchResult,
  type PredictionContract,
  type ProofBundle,
  type ReasoningDiff,
  type RunnerJob,
  type PublicCompilerEvent,
  type SessionState,
  type TransferResult,
  type VerifiedResultSet,
} from "@counterlab/contracts";
import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);
const Sha256Digest = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");

export const CapabilityHealthSchema = z
  .object({
    platform: z.literal("cloudflare-workers"),
    sample: z.literal("available"),
    replay: z.literal("available"),
    liveGpt: z.enum(["configured", "server-key-required"]),
    liveCodex: z.enum(["configured", "local-runner-required"]),
    liveKernel: z.enum(["configured", "local-runner-required"]),
    sandbox: z.enum(["configured", "local-runner-required"]),
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
  transferResult: TransferResultSchema.optional(),
  patchResult: PatchResultSchema.optional(),
  revision: z.string().trim().min(1).optional(),
  reasoningDiff: ReasoningDiffSchema.optional(),
  proofBundle: ProofBundleSchema.optional(),
};

function requireExclusiveBeliefAuthority(
  value: { beliefTest?: unknown; beliefSpec?: unknown },
  context: z.RefinementCtx,
): void {
  if (value.beliefTest !== undefined && value.beliefSpec !== undefined) {
    context.addIssue({
      code: "custom",
      message: "a session view cannot contain more than one belief authority",
      path: ["beliefSpec"],
    });
  }
}

export const SessionViewSchema = z
  .object(sessionViewShape)
  .strict()
  .superRefine(requireExclusiveBeliefAuthority);
export type SessionView = z.infer<typeof SessionViewSchema>;
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

const ReplaySchema = z
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

export type VerifiedReplay = z.infer<typeof ReplaySchema>;

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

export class CounterLabApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch | undefined;

  constructor(options: CounterLabApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetcher = options.fetch;
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
    const form = new FormData();
    form.set("file", file, file.name);
    return this.request("/api/artifacts", ArtifactManifestSchema, {
      method: "POST",
      body: form,
    });
  }

  getArtifact(artifactId: string): Promise<ArtifactManifest> {
    return this.request(
      `/api/artifacts/${encodedId(artifactId)}`,
      ArtifactManifestSchema,
    );
  }

  createSampleSession(input: CreateSampleSessionInput): Promise<SessionView> {
    return this.request("/api/sample/sessions", SessionViewSchema, {
      method: "POST",
      body: JSON.stringify(
        validatedInput(CreateSampleSessionInputSchema, input),
      ),
    });
  }

  createLiveSession(input: CreateLiveSessionInput): Promise<SessionView> {
    return this.request("/api/live/sessions", SessionViewSchema, {
      method: "POST",
      body: JSON.stringify(validatedInput(CreateLiveSessionInputSchema, input)),
    });
  }

  createReplaySession(input: CreateReplaySessionInput): Promise<SessionView> {
    return this.request("/api/replay/sessions", SessionViewSchema, {
      method: "POST",
      body: JSON.stringify(
        validatedInput(CreateReplaySessionInputSchema, input),
      ),
    });
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
  ): Promise<RunnerCancelResponse> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/jobs/${encodedId(jobId)}/cancel`,
      RunnerCancelResponseSchema,
    );
  }

  runLab(sessionId: string): Promise<RunnerActionResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/run`,
      RunnerActionResponseSchema,
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

  compilePatch(sessionId: string): Promise<PatchCompileResponse> {
    return this.postRunnerActionWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/patch/compile`,
      PatchCompileResponseSchema,
    );
  }

  patchDownloadUrl(sessionId: string): string {
    return `${this.baseUrl}/api/sessions/${encodedId(sessionId)}/patch/download`;
  }

  getEvents(sessionId: string): Promise<EvidenceEvent[]> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/events`,
      EventsResponseSchema,
    ).then((response) => response.events);
  }

  getReasoningDiff(sessionId: string): Promise<ReasoningDiff> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/reasoning-diff`,
      ReasoningDiffSchema,
    );
  }

  getProofBundle(sessionId: string): Promise<ProofBundle> {
    return this.request(
      `/api/sessions/${encodedId(sessionId)}/proof-bundle`,
      ProofBundleSchema,
    );
  }

  getReplay(replayId: string): Promise<VerifiedReplay> {
    return this.request(`/api/replays/${encodedId(replayId)}`, ReplaySchema);
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

    let response: Response;
    try {
      const fetcher = this.fetcher ?? globalThis.fetch.bind(globalThis);
      response = await fetcher(`${this.baseUrl}${path}`, {
        ...init,
        method: init.method ?? "GET",
        headers,
        credentials: init.credentials ?? "same-origin",
      });
    } catch (cause) {
      if (cause instanceof ApiClientError) throw cause;
      throw new ApiClientError({
        code: "NETWORK_ERROR",
        message: "CounterLab could not reach the API",
        status: 0,
        retryable: true,
        cause,
      });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
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
  EvidenceEvent,
  PatchResult,
  PredictionContract,
  ProofBundle,
  PublicCompilerEvent,
  ReasoningDiff,
  RunnerJob,
  SessionState,
  TransferResult,
  VerifiedResultSet,
  LeakageVerifiedResultSet,
  ImbalanceVerifiedResultSet,
};
