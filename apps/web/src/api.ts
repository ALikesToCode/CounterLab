import {
  ArtifactManifestSchema,
  BeliefTestSchema,
  EvidenceEventSchema,
  PatchResultSchema,
  PredictionContractSchema,
  ProofBundleSchema,
  ReasoningDiffSchema,
  SessionStateSchema,
  TransferResultSchema,
  VerifiedResultSetSchema,
  apiSuccessSchema,
  type ArtifactManifest,
  type BeliefTest,
  type EvidenceEvent,
  type PatchResult,
  type PredictionContract,
  type ProofBundle,
  type ReasoningDiff,
  type SessionState,
  type TransferResult,
  type VerifiedResultSet,
} from "@counterlab/contracts";
import { z } from "zod";

const NonEmptyString = z.string().trim().min(1);

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
  mode: z.enum(["instant", "live", "replay"]),
  state: SessionStateSchema,
  version: z.number().int().positive(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
  beliefTest: BeliefTestSchema.optional(),
  prediction: PredictionContractSchema.optional(),
  verifiedResult: VerifiedResultSetSchema.optional(),
  transferResult: TransferResultSchema.optional(),
  patchResult: PatchResultSchema.optional(),
  revision: z.string().trim().min(1).optional(),
  reasoningDiff: ReasoningDiffSchema.optional(),
  proofBundle: ProofBundleSchema.optional(),
};

export const SessionViewSchema = z.object(sessionViewShape).strict();
export type SessionView = z.infer<typeof SessionViewSchema>;
export type ArtifactView = ArtifactManifest;

const EventsResponseSchema = z
  .object({ events: z.array(EvidenceEventSchema) })
  .strict();

const PatchCompileResponseSchema = z
  .object({
    ...sessionViewShape,
    patch: PatchResultSchema,
    kernelVerification: z.unknown(),
  })
  .strict();

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

const CreateSessionInputSchema = z
  .object({
    artifactId: NonEmptyString,
    mode: z.enum(["instant", "live", "replay"]),
  })
  .strict();

const BeliefProposalInputSchema = z
  .object({ learnerClaim: z.string().trim().min(12).max(2_000) })
  .strict();

const BeliefResponseInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("confirm") }).strict(),
  z
    .object({ action: z.literal("edit"), beliefTest: BeliefTestSchema })
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

export type CreateSessionInput = z.input<typeof CreateSessionInputSchema>;
export type BeliefProposalInput = z.input<typeof BeliefProposalInputSchema>;
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

  createSession(input: CreateSessionInput): Promise<SessionView> {
    return this.request("/api/sessions", SessionViewSchema, {
      method: "POST",
      body: JSON.stringify(validatedInput(CreateSessionInputSchema, input)),
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

  compileLab(sessionId: string): Promise<SessionView> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/compile`,
      SessionViewSchema,
    );
  }

  runLab(sessionId: string): Promise<SessionView> {
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/lab/run`,
      SessionViewSchema,
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
    return this.postWithoutInput(
      `/api/sessions/${encodedId(sessionId)}/patch/compile`,
      PatchCompileResponseSchema,
    );
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
  ReasoningDiff,
  SessionState,
  TransferResult,
  VerifiedResultSet,
};
