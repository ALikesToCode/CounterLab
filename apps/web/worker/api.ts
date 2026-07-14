import {
  ArtifactManifestSchema,
  type BeliefTest,
} from "@counterlab/contracts";
import {
  ApprovedSampleBeliefAnalyst,
  BeliefAnalystError,
  createLiveBeliefAnalystFromEnv,
} from "@counterlab/belief-analyst";
import { NotebookParseError, parseNotebook } from "@counterlab/notebook-parser";
import {
  InvalidSessionTransitionError,
  PredictionAlreadyCommittedError,
  SessionInputError,
  SessionNotFoundError,
  SessionService,
  hashCanonical,
  type SessionRepository,
} from "@counterlab/session-core";
import { Hono } from "hono";
import type { Context } from "hono";
import { z, ZodError } from "zod";

import patchedNotebookText from "../../../replays/leakage-01/patch/customer_churn_leakage.patched.ipynb?raw";
import patchKernelResult from "../../../replays/leakage-01/patch-kernel-result.json";
import { D1ArtifactStore, type ArtifactStore } from "./artifact-store";
import { D1SessionRepository } from "./d1-session-repository";
import { sampleManifest, sampleResult } from "./sample-evidence";
import {
  createSamplePatchResult,
  evaluateSampleTransfer,
} from "./sample-learning-loop";
import {
  createSampleReasoningProof,
  sampleLabEvidenceHashes,
  sampleLabVerification,
} from "./sample-proof";

type WorkerBindings = Env & {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_REASONING_EFFORT?: string;
  COUNTERLAB_CODEX_MODE?: string;
  COUNTERLAB_MAX_NOTEBOOK_BYTES?: string;
  COUNTERLAB_SIGNING_KEY?: string;
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
  now?: () => Date;
  id?: (prefix: string) => string;
}

const JsonObjectSchema = z.record(z.string(), z.unknown());
const CreateArtifactSchema = z.object({ sample: z.literal(true) }).strict();
const CreateSessionSchema = z
  .object({
    artifactId: z.string().trim().min(1),
    mode: z.enum(["instant", "live", "replay"]),
  })
  .strict();
const BeliefRequestSchema = z
  .object({ learnerClaim: z.string().trim().min(12).max(2000) })
  .strict();
const ConfirmationSchema = z
  .discriminatedUnion("action", [
    z.object({ action: z.literal("confirm") }).strict(),
    z
      .object({
        action: z.literal("edit"),
        beliefTest: JsonObjectSchema,
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

const DEFAULT_MAX_NOTEBOOK_BYTES = 10_485_760;
const ACCEPTED_NOTEBOOK_TYPES = new Set([
  "application/json",
  "application/x-ipynb+json",
  "application/octet-stream",
]);

function jsonSuccess<T>(data: T) {
  return { ok: true as const, data };
}

function jsonError(code: string, message: string, status: number) {
  return { ok: false as const, error: { code, message, status } };
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
    throw new ApiInputError("INVALID_JSON", "Request body is not valid JSON", 400);
  }
}

class ApiInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
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
  return options.artifactStore ?? new D1ArtifactStore(requiredDatabase(context));
}

function maxNotebookBytes(context: Context<AppBindings>): number {
  const configured = Number(context.env?.COUNTERLAB_MAX_NOTEBOOK_BYTES);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_MAX_NOTEBOOK_BYTES;
}

function isFile(value: string | File | null): value is File {
  return value !== null && typeof value !== "string";
}

function statePayload(session: Awaited<ReturnType<SessionService["getSession"]>>) {
  return {
    sessionId: session.id,
    artifactId: session.artifactId,
    mode: session.mode,
    state: session.state,
    version: session.version,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    ...(session.beliefTest === undefined ? {} : { beliefTest: session.beliefTest }),
    ...(session.prediction === undefined ? {} : { prediction: session.prediction }),
    ...(session.verifiedResult === undefined
      ? {}
      : { verifiedResult: session.verifiedResult }),
    ...(session.transferResult === undefined
      ? {}
      : { transferResult: session.transferResult }),
    ...(session.patchResult === undefined ? {} : { patchResult: session.patchResult }),
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

  app.use("/api/*", async (context, next) => {
    const requestId = context.req.header("cf-ray") ?? crypto.randomUUID();
    context.set("requestId", requestId);
    context.header("cache-control", "no-store");
    context.header("content-security-policy", "default-src 'none'; frame-ancestors 'none'");
    context.header("referrer-policy", "no-referrer");
    context.header("x-content-type-options", "nosniff");
    context.header("x-frame-options", "DENY");
    await next();
  });

  app.get("/api/health", (context) =>
    context.json(
      jsonSuccess({
        platform: "cloudflare-workers" as const,
        sample: "available" as const,
        replay: "available" as const,
        liveGpt:
          context.env?.OPENAI_API_KEY === undefined
            ? ("server-key-required" as const)
            : ("available" as const),
        liveCodex: "local-runner-required" as const,
        liveKernel: "local-runner-required" as const,
        sandbox: "local-runner-required" as const,
        requestId: context.get("requestId"),
      }),
    ),
  );

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
      throw new ApiInputError("FILE_REQUIRED", "A notebook file is required", 400);
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

  app.post("/api/sessions", async (context) => {
    const input = CreateSessionSchema.parse(await readJson(context));
    const artifact = await artifacts(context, options).find(input.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError(
        "ARTIFACT_NOT_FOUND",
        `Artifact ${input.artifactId} was not found`,
        404,
      );
    }
    const session = await sessionService(context, options).createSession(input);
    return context.json(jsonSuccess(statePayload(session)), 201);
  });

  app.get("/api/sessions/:sessionId", async (context) => {
    const session = await sessionService(context, options).getSession(
      context.req.param("sessionId"),
    );
    return context.json(jsonSuccess(statePayload(session)));
  });

  app.post("/api/sessions/:sessionId/belief-test", async (context) => {
    const { learnerClaim } = BeliefRequestSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const session = await service.getSession(context.req.param("sessionId"));
    const artifact = await artifacts(context, options).find(session.artifactId);
    if (artifact === undefined) {
      throw new ApiInputError("ARTIFACT_NOT_FOUND", "Session artifact was not found", 404);
    }

    const analyst =
      session.mode === "live"
        ? createLiveBeliefAnalystFromEnv({
            OPENAI_API_KEY: context.env?.OPENAI_API_KEY,
            OPENAI_MODEL: context.env?.OPENAI_MODEL,
            OPENAI_REASONING_EFFORT:
              context.env?.OPENAI_REASONING_EFFORT,
          })
        : new ApprovedSampleBeliefAnalyst();
    const result = await analyst.propose({
      sessionId: session.id,
      learnerClaim,
      manifest: artifact.manifest,
      concept: "entity_leakage",
    });
    const beliefTest: BeliefTest = result.beliefTest;
    const liveProvenance =
      result.provenance.mode === "live"
        ? {
            actor: "gpt-5.6" as const,
            modelId: result.provenance.modelId,
            promptHash: result.provenance.promptHash,
          }
        : {
            actor: "system" as const,
            modelId: result.provenance.approvalId,
          };
    const proposed = await service.proposeBeliefTest(
      session.id,
      beliefTest,
      liveProvenance,
    );
    return context.json(jsonSuccess(statePayload(proposed)));
  });

  app.post("/api/sessions/:sessionId/belief-test/confirm", async (context) => {
    const input = ConfirmationSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    if (input.action === "confirm") {
      return context.json(jsonSuccess(statePayload(await service.confirmBeliefTest(sessionId))));
    }
    if (input.action === "edit") {
      return context.json(
        jsonSuccess(statePayload(await service.editBeliefTest(sessionId, input.beliefTest))),
      );
    }
    if (input.action === "reject") {
      return context.json(
        jsonSuccess(statePayload(await service.rejectBeliefTest(sessionId, input.reason))),
      );
    }
    return context.json(
      jsonSuccess(
        statePayload(await service.markInsufficientEvidence(sessionId, input.reason)),
      ),
    );
  });

  app.post("/api/sessions/:sessionId/prediction", async (context) => {
    const input = PredictionRequestSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    if (current.beliefTest === undefined) {
      throw new SessionInputError("A confirmed Belief Test is required");
    }
    const committedAt = (options.now?.() ?? new Date()).toISOString();
    const base = {
      schemaVersion: "1" as const,
      id: `prediction_${crypto.randomUUID()}`,
      sessionId,
      beliefTestId: current.beliefTest.id,
      choice: input.choice,
      ...(input.numericRange === undefined ? {} : { numericRange: input.numericRange }),
      confidence: input.confidence,
      committedAt,
    };
    const prediction = {
      ...base,
      immutableHash: await hashCanonical(base),
    };
    return context.json(
      jsonSuccess(statePayload(await service.commitPrediction(sessionId, prediction))),
      201,
    );
  });

  app.post("/api/sessions/:sessionId/lab/compile", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
    if (current.mode === "live") {
      throw new ApiInputError(
        "LOCAL_RUNNER_REQUIRED",
        "Live Codex compilation requires the local CounterLab runner",
        503,
      );
    }
    await service.startLabCompilation(sessionId);
    const verified = await service.verifyLab(
      sessionId,
      {
        ...sampleLabVerification,
        source:
          current.mode === "replay"
            ? "verified-replay-leakage-01"
            : "stored-approved-leakage-v1",
      },
      [
        sampleLabEvidenceHashes.adapter,
        sampleLabEvidenceHashes.publicTests,
        sampleLabEvidenceHashes.externalVerifier,
      ],
    );
    return context.json(jsonSuccess(statePayload(verified)));
  });

  app.get("/api/sessions/:sessionId/events", async (context) => {
    const events = await sessionService(context, options).listEvents(
      context.req.param("sessionId"),
    );
    return context.json(jsonSuccess({ events }));
  });

  app.post("/api/sessions/:sessionId/lab/run", async (context) => {
    const completed = await sessionService(context, options).recordExperimentResult(
      context.req.param("sessionId"),
      sampleResult,
    );
    return context.json(jsonSuccess(statePayload(completed)));
  });

  app.post("/api/sessions/:sessionId/revision", async (context) => {
    const { revision } = RevisionSchema.parse(await readJson(context));
    const updated = await sessionService(context, options).recordRevision(
      context.req.param("sessionId"),
      revision,
    );
    return context.json(jsonSuccess(statePayload(updated)));
  });

  app.post("/api/sessions/:sessionId/transfer", async (context) => {
    const submission = TransferSubmissionSchema.parse(await readJson(context));
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    await service.startTransfer(sessionId);
    const result = await evaluateSampleTransfer(
      sessionId,
      submission,
      (options.now?.() ?? new Date()).toISOString(),
    );
    const updated = await service.recordTransferResult(sessionId, result);
    return context.json(jsonSuccess(statePayload(updated)));
  });

  app.post("/api/sessions/:sessionId/patch/compile", async (context) => {
    const service = sessionService(context, options);
    const sessionId = context.req.param("sessionId");
    const current = await service.getSession(sessionId);
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
        recordedAt: "2026-07-14T09:05:00.000Z",
        modelId: "stored-codex-app-server-trace",
        fixtureId: "customer-churn-public-v1",
        verifierVersion: "leakage-verifier-v1",
        templateCommit: "template-leakage-v1",
        result: sampleResult,
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
      return context.json(jsonError(error.code, error.message, error.status), {
        status: error.status as 400,
      });
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
      return context.json(jsonError("SESSION_NOT_FOUND", error.message, 404), 404);
    }
    if (
      error instanceof InvalidSessionTransitionError ||
      error instanceof PredictionAlreadyCommittedError
    ) {
      return context.json(jsonError("ILLEGAL_TRANSITION", error.message, 409), 409);
    }
    if (error instanceof SessionInputError) {
      return context.json(jsonError("SESSION_INPUT_ERROR", error.message, 400), 400);
    }
    if (error instanceof NotebookParseError) {
      const status = error.code === "MAXIMUM_SIZE_EXCEEDED" ? 413 : 422;
      return context.json(jsonError(error.code, error.message, status), {
        status: status as 413,
      });
    }
    if (error instanceof BeliefAnalystError) {
      const status =
        error.code === "UNSUPPORTED_ARTIFACT" ||
        error.code === "UNRESOLVED_EVIDENCE" ||
        error.code === "INVALID_RESPONSE"
          ? 422
          : error.code === "INVALID_INPUT"
            ? 400
            : 503;
      return context.json(jsonError(error.code, error.message, status), {
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
