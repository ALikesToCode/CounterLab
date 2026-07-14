import { createHash } from "node:crypto";

import {
  ArtifactManifestSchema,
  BeliefTestSchema,
  type ArtifactManifest,
  type BeliefTest,
} from "@counterlab/contracts";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

export const APPROVED_LEAKAGE_SAMPLE_SHA256 =
  "92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CLAIM_CHARACTERS = 4_000;
const MAX_EVIDENCE_CELLS = 12;
const MAX_EXCERPT_CHARACTERS = 700;

const conceptInstructions = `Concept Pack: entity_leakage
- Entity leakage is plausible when repeated entity identifiers or entity-stable shortcuts cross an evaluation boundary.
- A decisive intervention holds out complete entities while controlling the model, seed, and metric.
- Identity ablation is supporting evidence, not a substitute for a group split.

Concept Pack: class_imbalance
- Accuracy can conceal minority-class failure when class prevalence is skewed.
- A decisive intervention keeps predictions fixed and evaluates class-sensitive metrics and the confusion matrix.
- Never infer class imbalance without schema or output evidence.`;

export const BELIEF_ANALYST_INSTRUCTIONS = `You are CounterLab's reasoning analyst. Formalize the learner's claim as a Belief Test; do not execute code, invent results, grade mastery, or decide whether generated code is valid.

Use only the supplied sanitized evidence. Every evidence reference must copy an exact supplied hash. Use null for cellIndex or outputIndex when that index does not apply. Return no more than three evidence references. Keep the learner's current hypothesis distinct from the competing hypothesis. The decisive intervention must predict observably different outcomes. If the supplied evidence cannot support a discriminating test, set uncertainty.insufficientEvidence to true, explain the limitation, and return an empty evidenceRefs array. Always require learner confirmation.

${conceptInstructions}`;

const BeliefTestWireSchema = z
  .object({
    schemaVersion: z.literal("1"),
    id: z.string().trim().min(1),
    concept: z.enum(["entity_leakage", "class_imbalance"]),
    learnerClaim: z.string().trim().min(1),
    currentHypothesis: z
      .object({
        statement: z.string().trim().min(1),
        predictedOutcome: z.string().trim().min(1),
      })
      .strict(),
    competingHypothesis: z
      .object({
        statement: z.string().trim().min(1),
        predictedOutcome: z.string().trim().min(1),
      })
      .strict(),
    evidenceRefs: z
      .array(
        z
          .object({
            cellIndex: z.number().int().nonnegative().nullable(),
            outputIndex: z.number().int().nonnegative().nullable(),
            kind: z.enum([
              "code",
              "metric",
              "schema",
              "output",
              "learner_claim",
            ]),
            hash: z.string().regex(SHA256_PATTERN),
            excerpt: z.string(),
            relevance: z.string().trim().min(1),
          })
          .strict(),
      )
      .max(3),
    alternatives: z.array(
      z
        .object({
          label: z.string().trim().min(1),
          rationale: z.string().trim().min(1),
        })
        .strict(),
    ),
    decisiveIntervention: z
      .object({
        id: z.string().trim().min(1),
        description: z.string().trim().min(1),
        controlledVariables: z.array(z.string().trim().min(1)),
        changedVariables: z.array(z.string().trim().min(1)).min(1),
        discriminatesBecause: z.string().trim().min(1),
      })
      .strict(),
    uncertainty: z
      .object({
        confidence: z.number().finite().min(0).max(1),
        limitations: z.array(z.string().trim().min(1)),
        insufficientEvidence: z.boolean(),
      })
      .strict(),
    requiresLearnerConfirmation: z.literal(true),
  })
  .strict();

export type ReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type BeliefAnalystErrorCode =
  | "CONFIGURATION_ERROR"
  | "INVALID_INPUT"
  | "INVALID_RESPONSE"
  | "LIVE_UNAVAILABLE"
  | "MODEL_REFUSAL"
  | "UNRESOLVED_EVIDENCE"
  | "UNSUPPORTED_ARTIFACT";

export class BeliefAnalystError extends Error {
  public readonly code: BeliefAnalystErrorCode;
  public readonly details: Readonly<Record<string, unknown>>;

  public constructor(
    code: BeliefAnalystErrorCode,
    message: string,
    details: Readonly<Record<string, unknown>> = {},
  ) {
    super(message);
    this.name = "BeliefAnalystError";
    this.code = code;
    this.details = details;
  }
}

export type BeliefAnalystInput = {
  sessionId: string;
  learnerClaim: string;
  manifest: ArtifactManifest;
  concept: "entity_leakage" | "class_imbalance";
};

export type BeliefAnalystHealth =
  | {
      status: "available";
      mode: "live";
      model: string;
    }
  | {
      status: "available";
      mode: "approved-sample";
      approvalId: string;
    }
  | {
      status: "unavailable";
      mode: "disabled";
      reason: string;
    };

export type BeliefAnalystResult = {
  beliefTest: BeliefTest;
  provenance:
    | {
        mode: "live";
        modelId: string;
        responseId?: string;
        promptHash: string;
      }
    | {
        mode: "approved-sample";
        approvalId: string;
      };
};

export interface BeliefAnalyst {
  propose(input: BeliefAnalystInput): Promise<BeliefAnalystResult>;
  health(): Promise<BeliefAnalystHealth>;
}

export type ResponsesTransportRequest = {
  model: string;
  instructions: string;
  input: string;
  text: {
    format: ReturnType<typeof zodTextFormat>;
  };
  reasoning: {
    effort: ReasoningEffort;
  };
  store: false;
  safety_identifier: string;
};

export type ResponsesTransportResult = {
  outputParsed: unknown;
  refusals: string[];
  responseId?: string;
  modelId?: string;
};

export interface ResponsesTransport {
  parse(request: ResponsesTransportRequest): Promise<ResponsesTransportResult>;
}

type SanitizedAnalystContext = {
  learnerClaim: string;
  concept: "entity_leakage" | "class_imbalance";
  support: {
    status: ArtifactManifest["support"]["status"];
    reasons: Array<{ code: string; message: string; cellIndex?: number }>;
  };
  schemaSummary: ArtifactManifest["schemaSummary"] & { hash: string };
  evidence: Array<{
    cellIndex: number;
    kind: ArtifactManifest["cells"][number]["type"];
    sourceHash: string;
    sourceExcerpt: string;
    outputHashes: string[];
    symbols: string[];
    metricCandidates: ArtifactManifest["cells"][number]["metricCandidates"];
  }>;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function hashJson(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function schemaSummaryHash(
  schemaSummary: ArtifactManifest["schemaSummary"],
): string {
  return hashJson(schemaSummary);
}

export function learnerClaimHash(learnerClaim: string): string {
  return hashJson(learnerClaim);
}

export function deriveSafetyIdentifier(sessionId: string): string {
  return createHash("sha256")
    .update(`counterlab-session:${sessionId}`)
    .digest("hex");
}

function sanitizeText(value: string, maximum = MAX_EXCERPT_CHARACTERS): string {
  const redacted = value
    .replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, "[REDACTED_SECRET]")
    .replace(
      /\b((?:api[_-]?key|token|secret|password)\s*=\s*)(["'])[^"'\n]+\2/gi,
      "$1[REDACTED_SECRET]",
    )
    .replace(
      /\/(?:home|Users|tmp|var|etc|opt|root)\/[^\s'"\n]+/g,
      "[REDACTED_PATH]",
    )
    .replace(
      /[A-Za-z]:\\(?:Users|Temp|Windows)\\[^\s'"\n]+/g,
      "[REDACTED_PATH]",
    );
  return redacted.slice(0, maximum);
}

function validateAnalystInput(input: BeliefAnalystInput): ArtifactManifest {
  if (input.sessionId.trim().length === 0) {
    throw new BeliefAnalystError("INVALID_INPUT", "sessionId is required");
  }
  if (
    input.learnerClaim.trim().length === 0 ||
    input.learnerClaim.length > MAX_CLAIM_CHARACTERS
  ) {
    throw new BeliefAnalystError(
      "INVALID_INPUT",
      `learnerClaim must contain 1-${MAX_CLAIM_CHARACTERS} characters`,
    );
  }

  const parsed = ArtifactManifestSchema.safeParse(input.manifest);
  if (!parsed.success) {
    throw new BeliefAnalystError(
      "INVALID_INPUT",
      "artifact manifest is invalid",
      {
        issues: parsed.error.issues,
      },
    );
  }
  if (parsed.data.support.status !== "SUPPORTED") {
    throw new BeliefAnalystError(
      "UNSUPPORTED_ARTIFACT",
      "a live Belief Test requires a supported artifact",
      { support: parsed.data.support },
    );
  }
  return parsed.data;
}

export function buildSanitizedAnalystContext(
  input: BeliefAnalystInput,
): SanitizedAnalystContext {
  const manifest = validateAnalystInput(input);
  const evidenceCells = manifest.cells
    .filter(
      (cell) =>
        cell.symbols.length > 0 ||
        cell.outputHashes.length > 0 ||
        cell.metricCandidates.length > 0,
    )
    .slice(0, MAX_EVIDENCE_CELLS)
    .map((cell) => ({
      cellIndex: cell.index,
      kind: cell.type,
      sourceHash: cell.sourceSha256,
      sourceExcerpt: sanitizeText(cell.sourceExcerpt),
      outputHashes: [...cell.outputHashes],
      symbols: cell.symbols.map((symbol) => sanitizeText(symbol, 120)),
      metricCandidates: cell.metricCandidates.map((candidate) => ({
        ...candidate,
        name: sanitizeText(candidate.name, 120),
      })),
    }));

  return {
    learnerClaim: sanitizeText(input.learnerClaim, MAX_CLAIM_CHARACTERS),
    concept: input.concept,
    support: {
      status: manifest.support.status,
      reasons: manifest.support.reasons.slice(0, 8).map((reason) => ({
        code: reason.code,
        message: sanitizeText(reason.message, 300),
        ...(reason.cellIndex === undefined
          ? {}
          : { cellIndex: reason.cellIndex }),
      })),
    },
    schemaSummary: {
      fields: manifest.schemaSummary.fields.slice(0, 64).map((field) => ({
        name: sanitizeText(field.name, 120),
        inferredType: sanitizeText(field.inferredType, 120),
        privacyClass: sanitizeText(field.privacyClass, 120),
      })),
      ...(manifest.schemaSummary.rowCount === undefined
        ? {}
        : { rowCount: manifest.schemaSummary.rowCount }),
      entityCandidates: manifest.schemaSummary.entityCandidates.map(
        (candidate) => sanitizeText(candidate, 120),
      ),
      targetCandidates: manifest.schemaSummary.targetCandidates.map(
        (candidate) => sanitizeText(candidate, 120),
      ),
      hash: schemaSummaryHash(manifest.schemaSummary),
    },
    evidence: evidenceCells,
  };
}

function evidenceError(index: number, message: string): never {
  throw new BeliefAnalystError(
    "UNRESOLVED_EVIDENCE",
    `evidenceRefs[${index}] does not resolve: ${message}`,
    { evidenceIndex: index },
  );
}

export function resolveBeliefTestEvidence(
  beliefTest: BeliefTest,
  manifest: ArtifactManifest,
  learnerClaim: string,
): void {
  if (
    beliefTest.uncertainty.insufficientEvidence &&
    beliefTest.evidenceRefs.length === 0
  ) {
    return;
  }

  for (const [index, evidence] of beliefTest.evidenceRefs.entries()) {
    if (evidence.kind === "schema") {
      if (evidence.hash !== schemaSummaryHash(manifest.schemaSummary)) {
        evidenceError(index, "schema hash is unknown");
      }
      continue;
    }

    if (evidence.kind === "learner_claim") {
      if (evidence.hash !== learnerClaimHash(learnerClaim)) {
        evidenceError(index, "learner claim hash is unknown");
      }
      if (
        evidence.excerpt.length > 0 &&
        !sanitizeText(learnerClaim, MAX_CLAIM_CHARACTERS).includes(
          evidence.excerpt,
        )
      ) {
        evidenceError(index, "learner claim excerpt is not present");
      }
      continue;
    }

    if (evidence.cellIndex === undefined) {
      evidenceError(index, "cell index is missing");
    }
    const cell = manifest.cells.find(
      (candidate) => candidate.index === evidence.cellIndex,
    );
    if (cell === undefined) {
      evidenceError(index, "cell index is unknown");
    }

    if (evidence.kind === "code") {
      if (evidence.hash !== cell.sourceSha256) {
        evidenceError(index, "source hash is unknown");
      }
      if (
        evidence.excerpt.length > 0 &&
        !sanitizeText(cell.sourceExcerpt).includes(evidence.excerpt)
      ) {
        evidenceError(index, "code excerpt is not present");
      }
      continue;
    }

    if (evidence.outputIndex === undefined) {
      evidenceError(index, "output index is missing");
    }
    if (cell.outputHashes[evidence.outputIndex] !== evidence.hash) {
      evidenceError(index, "output hash is unknown");
    }
    if (
      evidence.kind === "metric" &&
      !cell.metricCandidates.some(
        (candidate) => candidate.outputIndex === evidence.outputIndex,
      )
    ) {
      evidenceError(index, "output is not a metric candidate");
    }
  }
}

function fromWire(value: unknown, input: BeliefAnalystInput): BeliefTest {
  const wire = BeliefTestWireSchema.safeParse(value);
  if (!wire.success) {
    throw new BeliefAnalystError(
      "INVALID_RESPONSE",
      "the model response does not match the Belief Test wire schema",
      { issues: wire.error.issues },
    );
  }

  const candidate = {
    ...wire.data,
    learnerClaim: input.learnerClaim,
    evidenceRefs: wire.data.evidenceRefs.map((evidence) => ({
      kind: evidence.kind,
      hash: evidence.hash,
      excerpt: evidence.excerpt,
      relevance: evidence.relevance,
      ...(evidence.cellIndex === null ? {} : { cellIndex: evidence.cellIndex }),
      ...(evidence.outputIndex === null
        ? {}
        : { outputIndex: evidence.outputIndex }),
    })),
  };
  const parsed = BeliefTestSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new BeliefAnalystError(
      "INVALID_RESPONSE",
      "the model response failed CounterLab's local Belief Test schema",
      { issues: parsed.error.issues },
    );
  }
  if (parsed.data.concept !== input.concept) {
    throw new BeliefAnalystError(
      "INVALID_RESPONSE",
      "the model response changed the selected concept",
    );
  }

  resolveBeliefTestEvidence(parsed.data, input.manifest, input.learnerClaim);
  return parsed.data;
}

export function normalizeResponsesBaseURL(
  configured: string | undefined,
): string | undefined {
  const value = configured?.trim();
  if (value === undefined || value.length === 0) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      "OPENAI_BASE_URL must be an absolute Responses endpoint URL",
    );
  }

  const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  const secure = url.protocol === "https:";
  const localDevelopment =
    url.protocol === "http:" && loopbackHosts.has(url.hostname);
  if (!secure && !localDevelopment) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      "OPENAI_BASE_URL must use HTTPS (HTTP is allowed only for loopback development)",
    );
  }
  if (url.username.length > 0 || url.password.length > 0) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      "OPENAI_BASE_URL must not contain credentials",
    );
  }
  if (url.search.length > 0 || url.hash.length > 0) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      "OPENAI_BASE_URL must not contain a query string or fragment",
    );
  }

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname.length === 0) {
    pathname = "/v1";
  } else if (pathname.endsWith("/v1/responses")) {
    pathname = pathname.slice(0, -"/responses".length);
  }
  if (!pathname.endsWith("/v1")) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      "OPENAI_BASE_URL must be a host root, a /v1 base, or a full /v1/responses endpoint",
    );
  }
  url.pathname = pathname;
  return url.toString().replace(/\/$/, "");
}

export type OpenAIResponsesTransportOptions = {
  apiKey: string;
  baseURL?: string;
  fetch?: typeof globalThis.fetch;
};

export class OpenAIResponsesTransport implements ResponsesTransport {
  private readonly client: OpenAI;

  public constructor(options: OpenAIResponsesTransportOptions) {
    const baseURL = normalizeResponsesBaseURL(options.baseURL);
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
  }

  public async parse(
    request: ResponsesTransportRequest,
  ): Promise<ResponsesTransportResult> {
    let response: Awaited<ReturnType<OpenAI["responses"]["parse"]>>;
    try {
      response = await this.client.responses.parse(request);
    } catch (error) {
      if (error instanceof BeliefAnalystError) {
        throw error;
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        throw new BeliefAnalystError(
          "INVALID_RESPONSE",
          "Responses endpoint returned invalid structured output",
          { category: "structured_output" },
        );
      }
      if (error instanceof OpenAI.APIError) {
        const status = error.status;
        if (status === 401 || status === 403) {
          throw new BeliefAnalystError(
            "LIVE_UNAVAILABLE",
            "Responses endpoint authentication failed",
            { category: "authentication", status },
          );
        }
        if (status === 404) {
          throw new BeliefAnalystError(
            "LIVE_UNAVAILABLE",
            "Responses endpoint or configured model is unavailable",
            { category: "configuration", status },
          );
        }
        if (status === 429) {
          throw new BeliefAnalystError(
            "LIVE_UNAVAILABLE",
            "Responses endpoint rate limit was reached",
            { category: "rate_limit", status },
          );
        }
        throw new BeliefAnalystError(
          "LIVE_UNAVAILABLE",
          "Responses endpoint rejected the request",
          {
            category:
              status !== undefined && status >= 500 ? "upstream" : "request",
            ...(status === undefined ? {} : { status }),
          },
        );
      }
      throw new BeliefAnalystError(
        "LIVE_UNAVAILABLE",
        "Responses endpoint request failed",
        { category: "transport" },
      );
    }
    const refusals: string[] = [];
    for (const item of response.output) {
      if (item.type !== "message") {
        continue;
      }
      for (const content of item.content) {
        if (content.type === "refusal") {
          refusals.push(content.refusal);
        }
      }
    }
    return {
      outputParsed: response.output_parsed,
      refusals,
      responseId: response.id,
      modelId: response.model,
    };
  }
}

export type LiveBeliefAnalystOptions = {
  apiKey: string;
  baseURL?: string;
  model?: string;
  reasoningEffort?: ReasoningEffort;
  transport?: ResponsesTransport;
};

export class LiveBeliefAnalyst implements BeliefAnalyst {
  private readonly model: string;
  private readonly reasoningEffort: ReasoningEffort;
  private readonly transport: ResponsesTransport;

  public constructor(options: LiveBeliefAnalystOptions) {
    if (options.apiKey.trim().length === 0 && options.transport === undefined) {
      throw new BeliefAnalystError(
        "CONFIGURATION_ERROR",
        "LiveBeliefAnalyst requires a server-side API key",
      );
    }
    this.model = options.model?.trim() || "gpt-5.6";
    this.reasoningEffort = options.reasoningEffort ?? "medium";
    const baseURL = normalizeResponsesBaseURL(options.baseURL);
    this.transport =
      options.transport ??
      new OpenAIResponsesTransport({
        apiKey: options.apiKey,
        ...(baseURL === undefined ? {} : { baseURL }),
      });
  }

  public async health(): Promise<BeliefAnalystHealth> {
    return { status: "available", mode: "live", model: this.model };
  }

  public async propose(
    input: BeliefAnalystInput,
  ): Promise<BeliefAnalystResult> {
    const context = buildSanitizedAnalystContext(input);
    const serializedContext = JSON.stringify(context);
    const request: ResponsesTransportRequest = {
      model: this.model,
      instructions: BELIEF_ANALYST_INSTRUCTIONS,
      input: serializedContext,
      text: {
        format: zodTextFormat(BeliefTestWireSchema, "counterlab_belief_test"),
      },
      reasoning: { effort: this.reasoningEffort },
      store: false,
      safety_identifier: deriveSafetyIdentifier(input.sessionId),
    };
    const response = await this.transport.parse(request);

    if (response.refusals.length > 0) {
      throw new BeliefAnalystError(
        "MODEL_REFUSAL",
        "the reasoning analyst refused the request",
        { refusal: response.refusals[0] },
      );
    }
    if (response.outputParsed === null || response.outputParsed === undefined) {
      throw new BeliefAnalystError(
        "INVALID_RESPONSE",
        "the reasoning analyst returned no structured Belief Test",
      );
    }

    const beliefTest = fromWire(response.outputParsed, input);
    return {
      beliefTest,
      provenance: {
        mode: "live",
        modelId: response.modelId ?? this.model,
        ...(response.responseId === undefined
          ? {}
          : { responseId: response.responseId }),
        promptHash: hashJson({
          instructions: BELIEF_ANALYST_INSTRUCTIONS,
          input: serializedContext,
          model: this.model,
          reasoningEffort: this.reasoningEffort,
        }),
      },
    };
  }
}

const APPROVED_SAMPLE_ID = "leakage-customer-churn-belief-v1";

function approvedSampleBeliefTest(input: BeliefAnalystInput): BeliefTest {
  const codeCell = input.manifest.cells.find(
    (cell) =>
      cell.sourceExcerpt.includes("train_test_split") ||
      cell.symbols.includes("train_test_split"),
  );
  const metricCell = input.manifest.cells.find(
    (cell) => cell.metricCandidates.length > 0,
  );
  const metric = metricCell?.metricCandidates[0];
  const evidenceRefs: BeliefTest["evidenceRefs"] = [];

  if (codeCell !== undefined && codeCell.sourceExcerpt.length > 0) {
    const sanitizedExcerpt = sanitizeText(codeCell.sourceExcerpt);
    evidenceRefs.push({
      cellIndex: codeCell.index,
      kind: "code",
      hash: codeCell.sourceSha256,
      excerpt: sanitizedExcerpt.slice(
        Math.max(0, sanitizedExcerpt.indexOf("train_test_split")),
        Math.max(0, sanitizedExcerpt.indexOf("train_test_split")) + 180,
      ),
      relevance: "The notebook evaluates a row-wise random split.",
    });
  }
  if (
    metricCell !== undefined &&
    metric !== undefined &&
    metricCell.outputHashes[metric.outputIndex] !== undefined
  ) {
    const metricOutputHash = metricCell.outputHashes[metric.outputIndex];
    if (metricOutputHash === undefined) {
      throw new BeliefAnalystError(
        "INVALID_INPUT",
        "approved sample metric output hash is missing",
      );
    }
    evidenceRefs.push({
      cellIndex: metricCell.index,
      outputIndex: metric.outputIndex,
      kind: "metric",
      hash: metricOutputHash,
      excerpt: `${metric.name}: ${metric.value}`,
      relevance: "This is the deceptive random-split headline under test.",
    });
  }
  evidenceRefs.push({
    kind: "schema",
    hash: schemaSummaryHash(input.manifest.schemaSummary),
    excerpt: `Entity candidates: ${input.manifest.schemaSummary.entityCandidates.join(", ")}`,
    relevance: "The schema identifies the customer entity boundary.",
  });

  const id = `belief_${hashJson({
    approvalId: APPROVED_SAMPLE_ID,
    artifact: input.manifest.fileSha256,
    claim: input.learnerClaim,
  }).slice(0, 20)}`;
  const candidate = BeliefTestSchema.parse({
    schemaVersion: "1",
    id,
    concept: "entity_leakage",
    learnerClaim: input.learnerClaim,
    currentHypothesis: {
      statement:
        "The notebook's random-row test accuracy demonstrates generalization to new customers.",
      predictedOutcome:
        "Accuracy should remain close to the notebook result when complete customers are held out.",
    },
    competingHypothesis: {
      statement:
        "Customer identity crosses the random split, so the model recognizes customers instead of generalizing to unseen ones.",
      predictedOutcome:
        "Accuracy should fall materially under a customer-group split and after identity ablation.",
    },
    evidenceRefs: evidenceRefs.slice(0, 3),
    alternatives: [
      {
        label: "Class imbalance",
        rationale:
          "Accuracy can also hide minority-class errors, but it does not explain customer overlap by itself.",
      },
    ],
    decisiveIntervention: {
      id: "group-split-and-identity-ablation",
      description:
        "Compare the fixed model under random-row, customer-group, and identity-ablated evaluation.",
      controlledVariables: ["fixture", "model", "seed", "metric"],
      changedVariables: ["split boundary", "customer identity feature"],
      discriminatesBecause:
        "The learner's hypothesis predicts stable performance, while leakage predicts a large out-of-customer drop.",
    },
    uncertainty: {
      confidence: 0.93,
      limitations: [
        "The intervention can test evaluation leakage in this supported notebook; it does not prove global model quality or learner mastery.",
      ],
      insufficientEvidence: false,
    },
    requiresLearnerConfirmation: true,
  });
  resolveBeliefTestEvidence(candidate, input.manifest, input.learnerClaim);
  return candidate;
}

export class ApprovedSampleBeliefAnalyst implements BeliefAnalyst {
  public async health(): Promise<BeliefAnalystHealth> {
    return {
      status: "available",
      mode: "approved-sample",
      approvalId: APPROVED_SAMPLE_ID,
    };
  }

  public async propose(
    input: BeliefAnalystInput,
  ): Promise<BeliefAnalystResult> {
    const manifest = validateAnalystInput(input);
    if (
      input.concept !== "entity_leakage" ||
      manifest.fileSha256 !== APPROVED_LEAKAGE_SAMPLE_SHA256
    ) {
      throw new BeliefAnalystError(
        "UNSUPPORTED_ARTIFACT",
        "the approved sample analyst only applies to the bundled customer-churn artifact",
      );
    }
    return {
      beliefTest: approvedSampleBeliefTest({ ...input, manifest }),
      provenance: {
        mode: "approved-sample",
        approvalId: APPROVED_SAMPLE_ID,
      },
    };
  }
}

export class DisabledBeliefAnalyst implements BeliefAnalyst {
  public constructor(
    private readonly reason = "OPENAI_API_KEY is not configured",
  ) {}

  public async health(): Promise<BeliefAnalystHealth> {
    return { status: "unavailable", mode: "disabled", reason: this.reason };
  }

  public async propose(
    _input: BeliefAnalystInput,
  ): Promise<BeliefAnalystResult> {
    throw new BeliefAnalystError("LIVE_UNAVAILABLE", this.reason, {
      availableAlternatives: ["approved-sample", "verified-replay"],
    });
  }
}

const REASONING_EFFORTS = new Set<ReasoningEffort>([
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

export function createLiveBeliefAnalystFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  overrides: { transport?: ResponsesTransport } = {},
): BeliefAnalyst {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (apiKey === undefined || apiKey.length === 0) {
    return new DisabledBeliefAnalyst();
  }
  const configuredEffort = env.OPENAI_REASONING_EFFORT?.trim() || "medium";
  if (!REASONING_EFFORTS.has(configuredEffort as ReasoningEffort)) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      `unsupported OPENAI_REASONING_EFFORT: ${configuredEffort}`,
      { allowed: [...REASONING_EFFORTS] },
    );
  }
  return new LiveBeliefAnalyst({
    apiKey,
    ...(env.OPENAI_BASE_URL === undefined
      ? {}
      : { baseURL: env.OPENAI_BASE_URL }),
    model: env.OPENAI_MODEL?.trim() || "gpt-5.6",
    reasoningEffort: configuredEffort as ReasoningEffort,
    ...(overrides.transport === undefined
      ? {}
      : { transport: overrides.transport }),
  });
}
