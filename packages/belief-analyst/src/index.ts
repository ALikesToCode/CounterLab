import { createHash } from "node:crypto";

import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  BeliefTestSchema,
  PrePredictionBeliefSpecV2Schema,
  type ArtifactManifest,
  type BeliefSpecV2,
  type BeliefTest,
  type ConceptId,
  type EvidenceRef,
} from "@counterlab/contracts";
import {
  getConceptPack,
  releasedConceptPacks,
} from "@counterlab/concept-registry";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  LearningDirectorController,
  OpenAILearningDirectorTransport,
  type LearningDirectorRegistries,
  type LearningDirectorTransport,
} from "./learning-director.js";

export * from "./learning-director.js";

export const APPROVED_LEAKAGE_SAMPLE_SHA256 =
  "d0e9f3238753f1ca55534446d83e36041590f31c607a011def3f1d0db3a5bbc9";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const MAX_CLAIM_CHARACTERS = 4_000;
const MAX_EVIDENCE_CELLS = 12;
const MAX_EXCERPT_CHARACTERS = 700;

const conceptInstructions = releasedConceptPacks()
  .map(
    (pack) =>
      `Concept Pack: ${pack.id}\n${pack.analystRules.stableInstructions
        .map((rule) => `- ${rule}`)
        .join("\n")}`,
  )
  .join("\n\n");

export const BELIEF_ANALYST_INSTRUCTIONS = `You are CounterLab's reasoning analyst. Formalize the learner's claim as a Belief Test; do not execute code, invent results, grade mastery, or decide whether generated code is valid.

Use only the supplied sanitized evidence. Every evidence reference must copy an exact supplied hash. For code and learner_claim evidence, excerpt must be an empty string or an exact contiguous verbatim substring of the supplied sanitized text; never summarize or paraphrase inside excerpt. For all other evidence kinds, use an empty excerpt unless the exact displayed text is supplied. Use null for cellIndex or outputIndex when that index does not apply. Return no more than three evidence references. Keep the learner's current hypothesis distinct from the competing hypothesis. The decisive intervention must predict observably different outcomes. If the supplied evidence cannot support a discriminating test, set uncertainty.insufficientEvidence to true, explain the limitation, and return an empty evidenceRefs array. Always require learner confirmation.

${conceptInstructions}`;

export const BELIEF_SPEC_ANALYST_INSTRUCTIONS = `You are CounterLab's reasoning analyst. Propose two meaningfully different models of the learner's claim using only the sanitized artifact evidence and the selected Concept Pack below. Do not execute code, invent results, grade mastery, choose for the learner, or decide verification.

Every evidence item must copy an exact supplied hash. For code and learner_claim evidence, excerpt must be an empty string or an exact contiguous verbatim substring of the supplied sanitized text; never summarize or paraphrase inside excerpt. For all other evidence kinds, use an empty excerpt unless the exact displayed text is supplied. Use null for an inapplicable cellIndex or outputIndex. Hypothesis and alternative evidence must copy a selected top-level evidenceRefs object exactly. Candidate experiment IDs must come only from the selected Concept Pack's candidateExperimentIds. CounterLab binds the same pack-owned candidate experiment IDs to both primary hypotheses after validating the proposal, because a discriminating experiment must evaluate predictions under both hypotheses. State explicit conditions and at least one non-claim for each hypothesis. supportState describes readiness to run a discriminating experiment, not whether either hypothesis is already proven. Unknown experimental outcomes belong in conditions, non-claims, and uncertainty. Return SUPPORTED when the supplied supported artifact evidence can frame two candidate-linked hypotheses. If the evidence cannot support a discriminating experiment, return INSUFFICIENT_EVIDENCE with empty evidence and candidate lists. CounterLab will bind the original claim, concept, identifier, support readiness, and UNDECIDED learner state after local validation.

${conceptInstructions}`;

const EvidenceRefWireSchema = z
  .object({
    cellIndex: z.number().int().nonnegative().nullable(),
    outputIndex: z.number().int().nonnegative().nullable(),
    kind: z.enum(["code", "metric", "schema", "output", "learner_claim"]),
    hash: z.string().regex(SHA256_PATTERN),
    excerpt: z
      .string()
      .describe(
        "Use an empty string or an exact contiguous verbatim substring of supplied sanitized code or learner-claim text; never summarize or paraphrase. For other evidence kinds, use an empty string unless exact displayed text was supplied.",
      ),
    relevance: z.string().trim().min(1),
  })
  .strict();

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
    evidenceRefs: z.array(EvidenceRefWireSchema).max(3),
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

const PrimaryHypothesisWireSchema = z
  .object({
    id: z.enum(["current", "competing"]),
    statement: z.string().trim().min(1),
    conditions: z.array(z.string().trim().min(1)).min(1),
    nonClaims: z.array(z.string().trim().min(1)).min(1),
    evidence: z.array(EvidenceRefWireSchema).max(6),
    supportedCandidateExperimentIds: z.array(z.string().trim().min(1)).max(12),
  })
  .strict();

const BeliefSpecV2WireSchema = z
  .object({
    schemaVersion: z.literal("2"),
    evidenceRefs: z.array(EvidenceRefWireSchema).max(6),
    hypotheses: z.array(PrimaryHypothesisWireSchema).length(2),
    alternatives: z
      .array(
        z
          .object({
            id: z.string().trim().min(1),
            label: z.string().trim().min(1),
            statement: z.string().trim().min(1),
            rationale: z.string().trim().min(1),
            conditions: z.array(z.string().trim().min(1)).min(1),
            nonClaims: z.array(z.string().trim().min(1)).min(1),
            evidence: z.array(EvidenceRefWireSchema).max(6),
            supportedCandidateExperimentIds: z
              .array(z.string().trim().min(1))
              .max(12),
          })
          .strict(),
      )
      .max(8),
    uncertainty: z.number().finite().min(0).max(1),
    supportState: z.enum(["SUPPORTED", "PARTIAL", "INSUFFICIENT_EVIDENCE"]),
  })
  .strict();

export type ReasoningEffort =
  "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";

export type BeliefAnalystErrorCode =
  | "CONFIGURATION_ERROR"
  | "CLAIM_NOT_APPLICABLE"
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
  concept: ConceptId;
};

export const CLAIM_APPLICABILITY_POLICY_VERSION = "claim-applicability-v1";

export type ClaimApplicabilityAssessment =
  | {
      applicable: true;
      policyVersion: typeof CLAIM_APPLICABILITY_POLICY_VERSION;
    }
  | {
      applicable: false;
      policyVersion: typeof CLAIM_APPLICABILITY_POLICY_VERSION;
      reason: "OFF_TOPIC" | "SELF_CONTRADICTORY";
      guidance: string;
    };

const ENTITY_LEAKAGE_CLAIM_PATTERNS = [
  /\bgeneraliz(?:e|es|ed|ing|ation)\b/,
  /\b(?:unseen|new)\s+(?:customer|entity|account|patient|user)s?\b/,
  /\b(?:entity|identity)\s+(?:leak(?:age|ing)?|overlap|feature|memorization)\b/,
  /\b(?:random[- ]row|row[- ]level|group[- ]aware|group)\s+(?:split|holdout|evaluation)\b/,
  /\b(?:hold\s*out|holdout)\s+(?:whole\s+)?(?:customer|entity|account|patient|user|group)s?\b/,
  /\b(?:memorize|memorise|memorization|memorisation)\b/,
  /\b(?:accuracy|score|metric|performance|validation|test)\b.{0,48}\b(?:production|deployment|real[- ]world|unseen|new\s+data|future)\b/,
  /\b(?:production|deployment|real[- ]world|unseen|new\s+data|future)\b.{0,48}\b(?:accuracy|score|metric|performance|validation|test)\b/,
] as const;

const CLASS_IMBALANCE_CLAIM_PATTERNS = [
  /\bclass\s+imbalance\b/,
  /\b(?:rare|minority|majority)\s+(?:class|case|event|example|defect|fraud|positive|negative)s?\b/,
  /\b(?:recall|precision|f1|pr[- ]?auc|confusion\s+matrix|prevalence|decision\s+threshold)\b.{0,48}\b(?:enough|appropriate|matter|high|low|poor|good|trust|show|mean|hide|mask|compare|choose|use|change|affect)\w*\b/,
  /\b(?:enough|appropriate|matter|high|low|poor|good|trust|show|mean|hide|mask|compare|choose|use|change|affect)\w*\b.{0,48}\b(?:recall|precision|f1|pr[- ]?auc|confusion\s+matrix|prevalence|decision\s+threshold)\b/,
  /\b(?:recall|precision|f1|pr[- ]?auc|confusion\s+matrix|prevalence|decision\s+threshold)\b.{0,24}\b(?:versus|vs\.?)\b.{0,24}\b(?:recall|precision|f1|pr[- ]?auc|confusion\s+matrix|prevalence|decision\s+threshold)\b/,
  /\bfalse[- ]?(?:negative|positive)s?\b/,
  /\bmiss(?:ed|es|ing)?\s+(?:case|event|defect|fraud|positive)s?\b/,
  /\b(?:defect|fraud|minority)s?\b.{0,48}\b(?:accuracy|score|metric|performance|detect|catch|find)\w*\b/,
  /\b(?:accuracy|score|metric|performance|detect|catch|find)\w*\b.{0,48}\b(?:defect|fraud|minority)s?\b/,
] as const;

const ENTITY_LEAKAGE_CONTRADICTIONS = [
  /\bgeneraliz\w*\b.{0,120}\b(?:and|but)\b.{0,80}\b(?:(?:does|do|did|will|can|could|would|is|are)\s+)?(?:not|never)\s+generaliz\w*/,
  /\b(?:(?:does|do|did|will|can|could|would|is|are)\s+)?(?:not|never)\s+generaliz\w*.{0,120}\b(?:and|but)\b.{0,80}\bgeneraliz\w*/,
] as const;

const CLASS_IMBALANCE_CONTRADICTIONS = [
  /\b(?:detect|catch|find|identify)\w*\b.{0,80}\b(?:rare|minority|defect|fraud|positive)s?\b.{0,120}\b(?:and|but)\b.{0,80}\b(?:(?:does|do|did|will|can|could|would)\s+)?(?:not|never)\s+(?:detect|catch|find|identify)\w*/,
  /\b(?:(?:does|do|did|will|can|could|would)\s+)?(?:not|never)\s+(?:detect|catch|find|identify)\w*.{0,80}\b(?:rare|minority|defect|fraud|positive)s?\b.{0,120}\b(?:and|but)\b.{0,80}\b(?:detect|catch|find|identify)\w*/,
] as const;

const CLAIM_APPLICABILITY_POLICIES = {
  entity_leakage: {
    topicPatterns: ENTITY_LEAKAGE_CLAIM_PATTERNS,
    contradictionPatterns: ENTITY_LEAKAGE_CONTRADICTIONS,
    guidance:
      "Ask how the notebook evaluates generalization across distinct entities, such as customers, patients, or accounts.",
  },
  class_imbalance: {
    topicPatterns: CLASS_IMBALANCE_CLAIM_PATTERNS,
    contradictionPatterns: CLASS_IMBALANCE_CONTRADICTIONS,
    guidance:
      "Ask how the notebook evaluates rare cases, metric choice, threshold choice, or error cost.",
  },
} satisfies Record<
  ConceptId,
  {
    topicPatterns: readonly RegExp[];
    contradictionPatterns: readonly RegExp[];
    guidance: string;
  }
>;

function normalizeClaimForApplicability(claim: string): string {
  return claim
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\bdoesn't\b/g, "does not")
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bisn't\b/g, "is not")
    .replace(/\baren't\b/g, "are not")
    .replace(/\s+/g, " ")
    .trim();
}

export function assessClaimApplicability(
  concept: ConceptId,
  learnerClaim: string,
): ClaimApplicabilityAssessment {
  const claim = normalizeClaimForApplicability(learnerClaim);
  const policy = CLAIM_APPLICABILITY_POLICIES[concept];
  if (!policy.topicPatterns.some((pattern) => pattern.test(claim))) {
    return {
      applicable: false,
      policyVersion: CLAIM_APPLICABILITY_POLICY_VERSION,
      reason: "OFF_TOPIC",
      guidance: policy.guidance,
    };
  }

  if (policy.contradictionPatterns.some((pattern) => pattern.test(claim))) {
    return {
      applicable: false,
      policyVersion: CLAIM_APPLICABILITY_POLICY_VERSION,
      reason: "SELF_CONTRADICTORY",
      guidance:
        "State one uncertainty or ask a comparison question so CounterLab can frame two distinct explanations.",
    };
  }

  return {
    applicable: true,
    policyVersion: CLAIM_APPLICABILITY_POLICY_VERSION,
  };
}

export function requireApplicableClaim(
  concept: ConceptId,
  learnerClaim: string,
): void {
  const assessment = assessClaimApplicability(concept, learnerClaim);
  if (assessment.applicable) return;
  throw new BeliefAnalystError("CLAIM_NOT_APPLICABLE", assessment.guidance, {
    concept,
    policyVersion: assessment.policyVersion,
    reason: assessment.reason,
  });
}

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

export type BeliefSpecAnalystResult = {
  beliefSpec: BeliefSpecV2;
  provenance: Extract<BeliefAnalystResult["provenance"], { mode: "live" }>;
};

export interface BeliefAnalyst {
  propose(input: BeliefAnalystInput): Promise<BeliefAnalystResult>;
  health(): Promise<BeliefAnalystHealth>;
}

export interface BeliefSpecAnalyst {
  proposeBeliefSpec(
    input: BeliefAnalystInput,
  ): Promise<BeliefSpecAnalystResult>;
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
  concept: ConceptId;
  conceptPack: {
    id: ConceptId;
    version: string;
    learnerQuestion: string;
    candidateExperimentIds: string[];
  };
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
  privacy: {
    policyVersion: "outbound-privacy-v3";
    suppressedFieldCount: number;
    redactions: Array<{
      category: "secret" | "path" | "identifier" | "sensitive_field";
      count: number;
    }>;
    limitation: string;
  };
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

function redactCommonSensitiveText(value: string): string {
  return value
    .normalize("NFKC")
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
    )
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,63}\b/giu,
      "[REDACTED_IDENTIFIER]",
    )
    .replace(
      /(?<![\p{L}\p{N}])(?:\+?\d{1,3}[ .-]?)?(?:\(?\d{2,4}\)?[ .-]?){2,4}\d{2,4}(?![\p{L}\p{N}])/gu,
      (candidate) =>
        candidate.replace(/\D/gu, "").length >= 7
          ? "[REDACTED_IDENTIFIER]"
          : candidate,
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/giu,
      "[REDACTED_IDENTIFIER]",
    )
    .replace(/\b\d{3}-\d{2}-\d{4}\b/gu, "[REDACTED_IDENTIFIER]")
    .replace(
      /\b((?:account|customer|employee|patient|student|user)[_-]?id\s*[:=]\s*)(["'])[^"'\n]+\2/giu,
      "$1[REDACTED_IDENTIFIER]",
    );
}

function sanitizeText(value: string, maximum = MAX_EXCERPT_CHARACTERS): string {
  return redactCommonSensitiveText(value).slice(0, maximum);
}

const OUTBOUND_PUBLIC_PRIVACY_CLASSES = new Set(["feature", "target"]);
const MAX_PRIVACY_FIELD_GROUPS = 512;
const MAX_PRIVACY_FIELD_NAME_CHARACTERS = 256;

function canExposeSchemaField(privacyClass: string): boolean {
  return OUTBOUND_PUBLIC_PRIVACY_CLASSES.has(privacyClass.trim().toLowerCase());
}

type FieldPrivacyInventory = {
  aliasesByCanonicalName: ReadonlyMap<string, string>;
  replacementEntries: readonly {
    normalizedName: string;
    alias: string;
  }[];
  suppressedFieldCount: number;
};

function canonicalFieldName(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function escapedRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function fieldNameVariants(value: string): string[] {
  const normalized = value.normalize("NFKC");
  return [
    ...new Set(
      [
        normalized,
        normalized.toLocaleLowerCase("en-US"),
        normalized.toLocaleUpperCase("en-US"),
      ].map((variant) => variant.normalize("NFKC")),
    ),
  ];
}

function fieldPrivacyInventory(
  manifest: ArtifactManifest,
): FieldPrivacyInventory {
  const groups = new Map<
    string,
    {
      normalizedName: string;
      fields: ArtifactManifest["schemaSummary"]["fields"];
      sensitive: boolean;
    }
  >();
  for (const field of manifest.schemaSummary.fields) {
    const normalizedName = field.name.normalize("NFKC");
    if (normalizedName.length > MAX_PRIVACY_FIELD_NAME_CHARACTERS) {
      throw new BeliefAnalystError(
        "INVALID_INPUT",
        "schema field names exceed the bounded outbound privacy policy",
      );
    }
    const key = canonicalFieldName(normalizedName);
    const existing = groups.get(key);
    if (existing === undefined) {
      groups.set(key, {
        normalizedName,
        fields: [field],
        sensitive: !canExposeSchemaField(field.privacyClass),
      });
      continue;
    }
    existing.fields.push(field);
    if (!canExposeSchemaField(field.privacyClass)) existing.sensitive = true;
  }
  if (groups.size > MAX_PRIVACY_FIELD_GROUPS) {
    throw new BeliefAnalystError(
      "INVALID_INPUT",
      "schema fields exceed the bounded outbound privacy policy",
    );
  }

  const aliasesByCanonicalName = new Map<string, string>();
  const replacementEntries: Array<{ normalizedName: string; alias: string }> =
    [];
  let aliasIndex = 0;
  let suppressedFieldCount = 0;
  for (const [key, group] of groups) {
    if (group.sensitive) {
      aliasIndex += 1;
      const alias = `[REDACTED_SENSITIVE_FIELD_${aliasIndex}]`;
      aliasesByCanonicalName.set(key, alias);
      for (const variant of fieldNameVariants(group.normalizedName)) {
        replacementEntries.push({ normalizedName: variant, alias });
      }
      suppressedFieldCount += group.fields.length;
    } else {
      aliasesByCanonicalName.set(key, sanitizeText(group.normalizedName, 120));
    }
  }
  replacementEntries.sort(
    (left, right) => right.normalizedName.length - left.normalizedName.length,
  );
  return { aliasesByCanonicalName, replacementEntries, suppressedFieldCount };
}

function sanitizeWithFieldPrivacy(
  value: string,
  inventory: FieldPrivacyInventory,
  maximum = MAX_EXCERPT_CHARACTERS,
): string {
  let safe = redactCommonSensitiveText(value);
  if (inventory.replacementEntries.length > 0) {
    const aliasByVariant = new Map(
      inventory.replacementEntries.map(({ normalizedName, alias }) => [
        canonicalFieldName(normalizedName),
        alias,
      ]),
    );
    const pattern = inventory.replacementEntries
      .map(({ normalizedName }) => escapedRegex(normalizedName))
      .join("|");
    safe = safe.replace(new RegExp(pattern, "giu"), (match) => {
      return (
        aliasByVariant.get(canonicalFieldName(match)) ??
        "[REDACTED_SENSITIVE_FIELD]"
      );
    });
  }
  return safe.slice(0, maximum);
}

function sanitizeArtifactText(
  value: string,
  manifest: ArtifactManifest,
  maximum = MAX_EXCERPT_CHARACTERS,
): string {
  return sanitizeWithFieldPrivacy(
    value,
    fieldPrivacyInventory(manifest),
    maximum,
  );
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
  const conceptPack = getConceptPack(input.concept);
  const privacyInventory = fieldPrivacyInventory(manifest);
  const schemaFields = manifest.schemaSummary.fields
    .slice(0, 64)
    .map((field) => {
      const canonicalName = canonicalFieldName(field.name);
      const safeName =
        privacyInventory.aliasesByCanonicalName.get(canonicalName) ??
        "[REDACTED_SCHEMA_FIELD]";
      if (!safeName.startsWith("[REDACTED_SENSITIVE_FIELD_")) {
        return {
          name: safeName,
          inferredType: sanitizeWithFieldPrivacy(
            field.inferredType,
            privacyInventory,
            120,
          ),
          privacyClass: field.privacyClass.trim().toLowerCase(),
        };
      }
      return {
        name: safeName,
        inferredType: sanitizeWithFieldPrivacy(
          field.inferredType,
          privacyInventory,
          120,
        ),
        privacyClass: "sensitive_identifier",
      };
    });
  const sanitizeOutboundText = (
    value: string,
    maximum = MAX_EXCERPT_CHARACTERS,
  ): string => {
    return sanitizeWithFieldPrivacy(value, privacyInventory, maximum);
  };
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
      sourceExcerpt: sanitizeOutboundText(cell.sourceExcerpt),
      outputHashes: [...cell.outputHashes],
      symbols: cell.symbols.map((symbol) => sanitizeOutboundText(symbol, 120)),
      metricCandidates: cell.metricCandidates.map((candidate) => ({
        ...candidate,
        name: sanitizeOutboundText(candidate.name, 120),
      })),
    }));

  const projected = {
    learnerClaim: sanitizeOutboundText(
      input.learnerClaim,
      MAX_CLAIM_CHARACTERS,
    ),
    concept: input.concept,
    conceptPack: {
      id: conceptPack.id,
      version: conceptPack.version,
      learnerQuestion: conceptPack.learnerQuestion,
      candidateExperimentIds: [
        ...conceptPack.scientificMethod.candidateExperimentIds,
      ],
    },
    support: {
      status: manifest.support.status,
      reasons: manifest.support.reasons.slice(0, 8).map((reason) => ({
        code: sanitizeOutboundText(reason.code, 120),
        message: sanitizeOutboundText(reason.message, 300),
        ...(reason.cellIndex === undefined
          ? {}
          : { cellIndex: reason.cellIndex }),
      })),
    },
    schemaSummary: {
      fields: schemaFields,
      ...(manifest.schemaSummary.rowCount === undefined
        ? {}
        : { rowCount: manifest.schemaSummary.rowCount }),
      entityCandidates: manifest.schemaSummary.entityCandidates.map(
        (candidate, index) =>
          privacyInventory.aliasesByCanonicalName.get(
            canonicalFieldName(candidate),
          ) ?? `[REDACTED_ENTITY_FIELD_${index + 1}]`,
      ),
      targetCandidates: manifest.schemaSummary.targetCandidates.map(
        (candidate, index) =>
          privacyInventory.aliasesByCanonicalName.get(
            canonicalFieldName(candidate),
          ) ?? `[REDACTED_TARGET_FIELD_${index + 1}]`,
      ),
      hash: schemaSummaryHash(manifest.schemaSummary),
    },
    evidence: evidenceCells,
  };
  const serialized = JSON.stringify(projected);
  const markerCounts = (
    marker: string,
    category: "secret" | "path" | "identifier" | "sensitive_field",
  ) => ({
    category,
    count: serialized.split(marker).length - 1,
  });
  return {
    ...projected,
    privacy: {
      policyVersion: "outbound-privacy-v3",
      suppressedFieldCount: privacyInventory.suppressedFieldCount,
      redactions: [
        markerCounts("[REDACTED_SECRET]", "secret"),
        markerCounts("[REDACTED_PATH]", "path"),
        markerCounts("[REDACTED_IDENTIFIER]", "identifier"),
        {
          category: "sensitive_field" as const,
          count: Array.from(
            new Set(
              privacyInventory.replacementEntries.map(({ alias }) => alias),
            ),
          ).reduce(
            (count, marker) => count + serialized.split(marker).length - 1,
            0,
          ),
        },
      ].filter(({ count }) => count > 0),
      limitation:
        "Declared identifiers and common sensitive patterns are removed, but automated redaction cannot guarantee complete de-identification.",
    },
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
  resolveEvidenceRefs(
    beliefTest.evidenceRefs,
    manifest,
    learnerClaim,
    beliefTest.uncertainty.insufficientEvidence,
  );
}

export function resolveBeliefSpecV2Evidence(
  beliefSpec: BeliefSpecV2,
  manifest: ArtifactManifest,
): void {
  const parsed = BeliefSpecV2Schema.parse(beliefSpec);
  resolveEvidenceRefs(
    parsed.evidenceRefs,
    manifest,
    parsed.claim,
    parsed.supportState === "INSUFFICIENT_EVIDENCE",
  );
}

function resolveEvidenceRefs(
  evidenceRefs: readonly EvidenceRef[],
  manifest: ArtifactManifest,
  learnerClaim: string,
  insufficientEvidence: boolean,
): void {
  if (insufficientEvidence && evidenceRefs.length === 0) {
    return;
  }

  for (const [index, evidence] of evidenceRefs.entries()) {
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
        !sanitizeArtifactText(
          learnerClaim,
          manifest,
          MAX_CLAIM_CHARACTERS,
        ).includes(evidence.excerpt)
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
        !sanitizeArtifactText(cell.sourceExcerpt, manifest).includes(
          evidence.excerpt,
        )
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

function withoutNullableIndexes(
  evidence: z.infer<typeof EvidenceRefWireSchema>,
): EvidenceRef {
  return {
    kind: evidence.kind,
    hash: evidence.hash,
    excerpt: evidence.excerpt,
    relevance: evidence.relevance,
    ...(evidence.cellIndex === null ? {} : { cellIndex: evidence.cellIndex }),
    ...(evidence.outputIndex === null
      ? {}
      : { outputIndex: evidence.outputIndex }),
  };
}

function canonicalEvidenceExcerpt(
  evidence: z.infer<typeof EvidenceRefWireSchema>,
  input: BeliefAnalystInput,
): string {
  if (evidence.kind === "learner_claim") {
    return evidence.hash === learnerClaimHash(input.learnerClaim)
      ? sanitizeArtifactText(
          input.learnerClaim,
          input.manifest,
          MAX_CLAIM_CHARACTERS,
        )
      : "";
  }
  if (evidence.kind !== "code" || evidence.cellIndex === null) {
    return "";
  }
  const cell = input.manifest.cells.find(
    (candidate) => candidate.index === evidence.cellIndex,
  );
  return cell !== undefined && cell.sourceSha256 === evidence.hash
    ? sanitizeArtifactText(cell.sourceExcerpt, input.manifest)
    : "";
}

function canonicalEvidenceRef(
  evidence: z.infer<typeof EvidenceRefWireSchema>,
  input: BeliefAnalystInput,
): EvidenceRef {
  return {
    ...withoutNullableIndexes(evidence),
    excerpt: canonicalEvidenceExcerpt(evidence, input),
  };
}

function evidenceReferenceIdentity(
  evidence: Pick<EvidenceRef, "kind" | "hash"> & {
    cellIndex?: number | null | undefined;
    outputIndex?: number | null | undefined;
  },
): string {
  return JSON.stringify([
    evidence.kind,
    evidence.hash,
    evidence.cellIndex ?? null,
    evidence.outputIndex ?? null,
  ]);
}

function fromBeliefSpecWire(
  value: unknown,
  input: BeliefAnalystInput,
): BeliefSpecV2 {
  const wire = BeliefSpecV2WireSchema.safeParse(value);
  if (!wire.success) {
    throw new BeliefAnalystError(
      "INVALID_RESPONSE",
      "the model response does not match the Belief Spec v2 wire schema",
      { issues: wire.error.issues },
    );
  }

  const registeredCandidateIds = [
    ...getConceptPack(input.concept).scientificMethod.candidateExperimentIds,
  ];
  const allowedCandidateIds = new Set(registeredCandidateIds);
  for (const hypothesis of [
    ...wire.data.hypotheses,
    ...wire.data.alternatives,
  ]) {
    for (const candidateId of hypothesis.supportedCandidateExperimentIds) {
      if (!allowedCandidateIds.has(candidateId)) {
        throw new BeliefAnalystError(
          "INVALID_RESPONSE",
          `the model response used an unregistered candidate experiment: ${candidateId}`,
          { candidateId },
        );
      }
    }
  }
  const evidenceRefs = wire.data.evidenceRefs.map((evidence) =>
    canonicalEvidenceRef(evidence, input),
  );
  const evidenceByIdentity = new Map(
    evidenceRefs.map((evidence) => [
      evidenceReferenceIdentity(evidence),
      evidence,
    ]),
  );
  const canonicalNestedEvidence = (
    evidence: z.infer<typeof EvidenceRefWireSchema>,
  ): EvidenceRef =>
    evidenceByIdentity.get(evidenceReferenceIdentity(evidence)) ??
    canonicalEvidenceRef(evidence, input);
  const mapHypothesis = (
    hypothesis: z.infer<typeof PrimaryHypothesisWireSchema>,
  ) => ({
    ...hypothesis,
    evidence: hypothesis.evidence.map(canonicalNestedEvidence),
  });
  const insufficientEvidence =
    wire.data.supportState === "INSUFFICIENT_EVIDENCE";
  const candidate = {
    schemaVersion: "2" as const,
    id: `belief_${hashJson({
      artifact: input.manifest.fileSha256,
      claim: input.learnerClaim,
      concept: input.concept,
      hypotheses: wire.data.hypotheses.map(({ id, statement }) => ({
        id,
        statement,
      })),
    }).slice(0, 20)}`,
    concept: input.concept,
    claim: input.learnerClaim,
    evidenceRefs,
    hypotheses: wire.data.hypotheses.map((hypothesis) => ({
      ...mapHypothesis(hypothesis),
      supportedCandidateExperimentIds: insufficientEvidence
        ? []
        : [...registeredCandidateIds],
    })),
    alternatives: wire.data.alternatives.map((alternative) => ({
      ...alternative,
      evidence: alternative.evidence.map(canonicalNestedEvidence),
    })),
    uncertainty: wire.data.uncertainty,
    // The model may express uncertainty about an unmeasured outcome as PARTIAL.
    // Compilation readiness is a fixed intake/evidence decision: a supported
    // artifact with schema-valid, resolved, candidate-linked hypotheses is
    // ready to test. An explicit insufficient-evidence result remains closed.
    supportState:
      wire.data.supportState === "INSUFFICIENT_EVIDENCE"
        ? "INSUFFICIENT_EVIDENCE"
        : input.manifest.support.status === "SUPPORTED"
          ? "SUPPORTED"
          : "PARTIAL",
    learnerDecision: "UNDECIDED" as const,
  };
  const parsed = PrePredictionBeliefSpecV2Schema.safeParse(candidate);
  if (!parsed.success) {
    throw new BeliefAnalystError(
      "INVALID_RESPONSE",
      "the model response failed CounterLab's local Belief Spec v2 schema",
      { issues: parsed.error.issues },
    );
  }

  resolveBeliefSpecV2Evidence(parsed.data, input.manifest);
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
  timeoutMs?: number;
};

export function normalizeResponsesTimeout(
  configured: string | undefined,
): number {
  const fallback = 180_000;
  if (configured === undefined || configured.trim().length === 0)
    return fallback;
  const parsed = Number(configured);
  if (!Number.isInteger(parsed) || parsed < 10_000 || parsed > 300_000) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      "OPENAI_TIMEOUT_MS must be an integer from 10000 to 300000",
    );
  }
  return parsed;
}

export class OpenAIResponsesTransport implements ResponsesTransport {
  private readonly client: OpenAI;

  public constructor(options: OpenAIResponsesTransportOptions) {
    const baseURL = normalizeResponsesBaseURL(options.baseURL);
    this.client = new OpenAI({
      apiKey: options.apiKey,
      ...(baseURL === undefined ? {} : { baseURL }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      maxRetries: 0,
      timeout: options.timeoutMs ?? 180_000,
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
      if (error instanceof OpenAI.APIConnectionError) {
        throw new BeliefAnalystError(
          "LIVE_UNAVAILABLE",
          "Responses endpoint request failed",
          {
            category:
              error instanceof OpenAI.APIConnectionTimeoutError
                ? "timeout"
                : "transport",
          },
        );
      }
      if (error instanceof OpenAI.APIError) {
        const status = error.status;
        const category =
          status === 401 || status === 403
            ? "authentication"
            : status === 404
              ? "configuration"
              : status === 429
                ? "rate_limit"
                : status !== undefined && status >= 500
                  ? "upstream"
                  : "request";
        console.error("CounterLab Responses request rejected", {
          status: status ?? null,
          category,
        });
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
            category,
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
  timeoutMs?: number;
  transport?: ResponsesTransport;
};

export class LiveBeliefAnalyst implements BeliefAnalyst, BeliefSpecAnalyst {
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
        ...(options.timeoutMs === undefined
          ? {}
          : { timeoutMs: options.timeoutMs }),
      });
  }

  public async health(): Promise<BeliefAnalystHealth> {
    return { status: "available", mode: "live", model: this.model };
  }

  public async propose(
    input: BeliefAnalystInput,
  ): Promise<BeliefAnalystResult> {
    const context = buildSanitizedAnalystContext(input);
    requireApplicableClaim(input.concept, input.learnerClaim);
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

  public async proposeBeliefSpec(
    input: BeliefAnalystInput,
  ): Promise<BeliefSpecAnalystResult> {
    const context = buildSanitizedAnalystContext(input);
    requireApplicableClaim(input.concept, input.learnerClaim);
    const serializedContext = JSON.stringify(context);
    const response = await this.transport.parse({
      model: this.model,
      instructions: BELIEF_SPEC_ANALYST_INSTRUCTIONS,
      input: serializedContext,
      text: {
        format: zodTextFormat(
          BeliefSpecV2WireSchema,
          "counterlab_belief_spec_v2",
        ),
      },
      reasoning: { effort: this.reasoningEffort },
      store: false,
      safety_identifier: deriveSafetyIdentifier(input.sessionId),
    });

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
        "the reasoning analyst returned no structured Belief Spec",
      );
    }

    return {
      beliefSpec: fromBeliefSpecWire(response.outputParsed, input),
      provenance: {
        mode: "live",
        modelId: response.modelId ?? this.model,
        ...(response.responseId === undefined
          ? {}
          : { responseId: response.responseId }),
        promptHash: hashJson({
          instructions: BELIEF_SPEC_ANALYST_INSTRUCTIONS,
          input: serializedContext,
          model: this.model,
          reasoningEffort: this.reasoningEffort,
        }),
      },
    };
  }
}

const APPROVED_SAMPLE_ID = "leakage-customer-churn-belief-v2";
const APPROVED_LEAKAGE_SAMPLE_CLAIM =
  "Does the notebook's random-row accuracy generalize to completely new customers?";
const APPROVED_LEAKAGE_SAMPLE_FIXTURE_CLAIM =
  "The notebook accuracy proves generalization to new customers.";
const APPROVED_LEAKAGE_SAMPLE_CLAIMS = new Set([
  APPROVED_LEAKAGE_SAMPLE_CLAIM,
  APPROVED_LEAKAGE_SAMPLE_FIXTURE_CLAIM,
]);

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
      relevance: "The notebook source records a row-wise random split.",
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
      relevance:
        "The notebook reports this metric for its recorded evaluation.",
    });
  }
  evidenceRefs.push({
    kind: "schema",
    hash: schemaSummaryHash(input.manifest.schemaSummary),
    excerpt: `Entity candidates: ${input.manifest.schemaSummary.entityCandidates.join(", ")}`,
    relevance:
      "The notebook schema names the customer field used in the recorded evaluation.",
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
        "The score should remain similar when the evaluation contains customers the model has not seen.",
    },
    competingHypothesis: {
      statement:
        "Customer identity crosses the random split, so the model recognizes customers instead of generalizing to unseen ones.",
      predictedOutcome:
        "The score should change when the evaluation contains customers the model has not seen.",
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
    if (!APPROVED_LEAKAGE_SAMPLE_CLAIMS.has(input.learnerClaim)) {
      throw new BeliefAnalystError(
        "INVALID_INPUT",
        "the approved sample analyst only applies to the canonical fixed sample question",
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

export class DisabledBeliefAnalyst implements BeliefAnalyst, BeliefSpecAnalyst {
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

  public async proposeBeliefSpec(
    _input: BeliefAnalystInput,
  ): Promise<BeliefSpecAnalystResult> {
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
): BeliefAnalyst & BeliefSpecAnalyst {
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
    timeoutMs: normalizeResponsesTimeout(env.OPENAI_TIMEOUT_MS),
    ...(overrides.transport === undefined
      ? {}
      : { transport: overrides.transport }),
  });
}

export function createLiveLearningDirectorFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  input: {
    registries: LearningDirectorRegistries;
    sessionId: string;
  },
  overrides: { transport?: LearningDirectorTransport } = {},
): LearningDirectorController {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (
    (apiKey === undefined || apiKey.length === 0) &&
    overrides.transport === undefined
  ) {
    throw new BeliefAnalystError(
      "LIVE_UNAVAILABLE",
      "OPENAI_API_KEY is not configured",
      { availableAlternatives: ["approved-sample", "verified-replay"] },
    );
  }
  const configuredEffort = env.OPENAI_REASONING_EFFORT?.trim() || "medium";
  if (!REASONING_EFFORTS.has(configuredEffort as ReasoningEffort)) {
    throw new BeliefAnalystError(
      "CONFIGURATION_ERROR",
      `unsupported OPENAI_REASONING_EFFORT: ${configuredEffort}`,
      { allowed: [...REASONING_EFFORTS] },
    );
  }
  const baseURL = normalizeResponsesBaseURL(env.OPENAI_BASE_URL);
  const transport =
    overrides.transport ??
    new OpenAILearningDirectorTransport({
      apiKey: apiKey ?? "",
      ...(baseURL === undefined ? {} : { baseURL }),
      timeoutMs: normalizeResponsesTimeout(env.OPENAI_TIMEOUT_MS),
    });
  return new LearningDirectorController({
    transport,
    registries: input.registries,
    model: env.OPENAI_MODEL?.trim() || "gpt-5.6",
    reasoningEffort: configuredEffort as ReasoningEffort,
    safetyIdentifier: deriveSafetyIdentifier(input.sessionId),
  });
}
