import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

import {
  BeliefTestSchema,
  migrateBeliefTestV1ToV2,
  type ArtifactManifest,
  type BeliefSpecV2,
  type BeliefTest,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";

import {
  APPROVED_LEAKAGE_SAMPLE_SHA256,
  BELIEF_ANALYST_INSTRUCTIONS,
  BELIEF_SPEC_ANALYST_INSTRUCTIONS,
  ApprovedSampleBeliefAnalyst,
  BeliefAnalystError,
  DisabledBeliefAnalyst,
  LiveBeliefAnalyst,
  OpenAIResponsesTransport,
  buildSanitizedAnalystContext,
  createLiveBeliefAnalystFromEnv,
  deriveSafetyIdentifier,
  normalizeResponsesBaseURL,
  normalizeResponsesTimeout,
  resolveBeliefSpecV2Evidence,
  resolveBeliefTestEvidence,
  schemaSummaryHash,
  type ResponsesTransport,
} from "./index.js";

const digest = (character: string) => character.repeat(64);

function manifest(overrides: Partial<ArtifactManifest> = {}): ArtifactManifest {
  return {
    artifactId: "artifact_private_server_id",
    fileName: "/home/learner/private/customer-churn.ipynb",
    fileSha256: APPROVED_LEAKAGE_SAMPLE_SHA256,
    nbformat: 4,
    support: { status: "SUPPORTED", reasons: [] },
    cells: [
      {
        index: 2,
        type: "code",
        sourceSha256: digest("a"),
        sourceExcerpt:
          "API_KEY = 'sk-secret-value-123456'\npath = '/home/learner/private/data.csv'\ntrain_test_split(X, y)",
        executionCount: 3,
        outputHashes: [digest("b")],
        symbols: ["train_test_split", "customer_id"],
        metricCandidates: [{ name: "accuracy", value: 0.9847, outputIndex: 0 }],
      },
    ],
    schemaSummary: {
      fields: [
        {
          name: "customer_id",
          inferredType: "categorical",
          privacyClass: "entity_identifier",
        },
        {
          name: "churned",
          inferredType: "integer",
          privacyClass: "target",
        },
      ],
      rowCount: 2_880,
      entityCandidates: ["customer_id"],
      targetCandidates: ["churned"],
    },
    packageHints: ["sklearn"],
    createdAt: "2026-07-14T10:00:00.000Z",
    ...overrides,
  };
}

const claim = "This proves the model generalizes to new customers.";

function parsedBeliefTest(artifact = manifest()): BeliefTest {
  const wire = liveModelOutput(artifact);
  return BeliefTestSchema.parse({
    ...wire,
    evidenceRefs: wire.evidenceRefs.map((evidence) => ({
      kind: evidence.kind,
      hash: evidence.hash,
      excerpt: evidence.excerpt,
      relevance: evidence.relevance,
      ...(evidence.cellIndex === null ? {} : { cellIndex: evidence.cellIndex }),
      ...(evidence.outputIndex === null
        ? {}
        : { outputIndex: evidence.outputIndex }),
    })),
  });
}

function liveModelOutput(
  artifact = manifest(),
  overrides: Partial<BeliefTest> = {},
) {
  return {
    schemaVersion: "1" as const,
    id: "belief_live_1",
    concept: "entity_leakage" as const,
    learnerClaim: claim,
    currentHypothesis: {
      statement: "Random-row accuracy measures new-customer generalization.",
      predictedOutcome: "Accuracy remains close to the notebook result.",
    },
    competingHypothesis: {
      statement: "Repeated customer identity leaks across the random split.",
      predictedOutcome: "Accuracy falls under a customer-group split.",
    },
    evidenceRefs: [
      {
        cellIndex: 2,
        outputIndex: null,
        kind: "code" as const,
        hash: artifact.cells[0]!.sourceSha256,
        excerpt: "train_test_split(X, y)",
        relevance: "The split is row-wise.",
      },
      {
        cellIndex: null,
        outputIndex: null,
        kind: "schema" as const,
        hash: schemaSummaryHash(artifact.schemaSummary),
        excerpt: "customer_id is an entity identifier",
        relevance: "Repeated entities can cross a row split.",
      },
    ],
    alternatives: [
      {
        label: "Class imbalance",
        rationale: "Accuracy may also hide minority-class errors.",
      },
    ],
    decisiveIntervention: {
      id: "group-by-customer",
      description: "Hold out complete customers while keeping the model fixed.",
      controlledVariables: ["model", "seed", "metric"],
      changedVariables: ["split strategy"],
      discriminatesBecause:
        "Only the leakage hypothesis predicts a large drop for unseen customers.",
    },
    uncertainty: {
      confidence: 0.91,
      limitations: ["The notebook output alone cannot establish the gap size."],
      insufficientEvidence: false,
    },
    requiresLearnerConfirmation: true as const,
    ...overrides,
  };
}

function imbalanceManifest(): ArtifactManifest {
  return manifest({
    fileSha256: digest("8"),
    cells: [
      {
        index: 1,
        type: "code",
        sourceSha256: digest("c"),
        sourceExcerpt:
          "positive_rate = y.mean()\ntrain_test_split(X, y, stratify=y)",
        executionCount: 1,
        outputHashes: [digest("d")],
        symbols: ["train_test_split", "value_counts", "stratify"],
        metricCandidates: [
          { name: "positive_rate", value: 0.03, outputIndex: 0 },
        ],
      },
      {
        index: 3,
        type: "code",
        sourceSha256: digest("e"),
        sourceExcerpt:
          "accuracy_score(y_test, prediction)\nclassification_report(y_test, prediction)",
        executionCount: 3,
        outputHashes: [digest("f")],
        symbols: ["accuracy_score", "classification_report"],
        metricCandidates: [{ name: "accuracy", value: 0.97, outputIndex: 0 }],
      },
    ],
    schemaSummary: {
      fields: [
        {
          name: "is_defective",
          inferredType: "binary",
          privacyClass: "target",
        },
      ],
      rowCount: 4_000,
      entityCandidates: [],
      targetCandidates: ["is_defective"],
    },
  });
}

function imbalanceModelOutput(artifact = imbalanceManifest()) {
  return {
    schemaVersion: "1" as const,
    id: "belief_imbalance_live_1",
    concept: "class_imbalance" as const,
    learnerClaim: "The high accuracy proves rare defects are detected well.",
    currentHypothesis: {
      statement: "High accuracy means rare defects are detected reliably.",
      predictedOutcome: "Recall remains high for the positive class.",
    },
    competingHypothesis: {
      statement: "Accuracy is dominated by the majority non-defect class.",
      predictedOutcome:
        "A majority baseline is competitive while positive-class recall is low.",
    },
    evidenceRefs: [
      {
        cellIndex: 1,
        outputIndex: 0,
        kind: "metric" as const,
        hash: artifact.cells[0]!.outputHashes[0]!,
        excerpt: "positive_rate: 0.03",
        relevance: "The displayed target prevalence establishes rarity.",
      },
      {
        cellIndex: 3,
        outputIndex: 0,
        kind: "metric" as const,
        hash: artifact.cells[1]!.outputHashes[0]!,
        excerpt: "accuracy: 0.97",
        relevance: "The learner interpreted this aggregate metric.",
      },
    ],
    alternatives: [
      {
        label: "Threshold choice",
        rationale: "The operating threshold changes precision and recall.",
      },
    ],
    decisiveIntervention: {
      id: "majority-and-threshold-comparison",
      description:
        "Compare the model with a majority baseline and inspect class-specific outcomes.",
      controlledVariables: ["fixture", "split", "seed"],
      changedVariables: ["baseline", "decision threshold"],
      discriminatesBecause:
        "Only the competing hypothesis predicts high accuracy alongside weak positive-class detection.",
    },
    uncertainty: {
      confidence: 0.9,
      limitations: ["Deployment prevalence may differ from this notebook."],
      insufficientEvidence: false,
    },
    requiresLearnerConfirmation: true as const,
  };
}

function liveBeliefSpecOutput(
  artifact = manifest(),
  overrides: Record<string, unknown> = {},
) {
  const codeEvidence = {
    cellIndex: 2,
    outputIndex: null,
    kind: "code" as const,
    hash: artifact.cells[0]!.sourceSha256,
    excerpt: "train_test_split(X, y)",
    relevance: "The split is row-wise.",
  };
  const schemaEvidence = {
    cellIndex: null,
    outputIndex: null,
    kind: "schema" as const,
    hash: schemaSummaryHash(artifact.schemaSummary),
    excerpt: "customer_id is an entity identifier",
    relevance: "Repeated entities can cross a row split.",
  };

  return {
    schemaVersion: "2" as const,
    evidenceRefs: [codeEvidence, schemaEvidence],
    hypotheses: [
      {
        id: "current" as const,
        statement: "Random-row accuracy measures new-customer generalization.",
        conditions: ["Rows are representative of future customers."],
        nonClaims: ["This does not establish performance for every cohort."],
        evidence: [codeEvidence],
        supportedCandidateExperimentIds: ["group-holdout"],
      },
      {
        id: "competing" as const,
        statement:
          "Repeated customer identity inflates the random-row evaluation.",
        conditions: ["The same customers recur across observations."],
        nonClaims: ["A group holdout does not prove the model is useless."],
        evidence: [schemaEvidence],
        supportedCandidateExperimentIds: ["group-holdout-plus-ablation"],
      },
    ],
    alternatives: [
      {
        id: "class-imbalance",
        label: "Class imbalance",
        statement: "Accuracy may be dominated by the majority class.",
        rationale: "This is plausible but does not explain entity overlap.",
        conditions: ["The target is rare."],
        nonClaims: ["Rarity alone does not establish identity leakage."],
        evidence: [schemaEvidence],
        supportedCandidateExperimentIds: ["group-holdout"],
      },
    ],
    uncertainty: 0.12,
    supportState: "SUPPORTED" as const,
    ...overrides,
  };
}

class CapturingTransport implements ResponsesTransport {
  public request: Parameters<ResponsesTransport["parse"]>[0] | undefined;

  public constructor(
    private readonly response: Awaited<ReturnType<ResponsesTransport["parse"]>>,
  ) {}

  public async parse(request: Parameters<ResponsesTransport["parse"]>[0]) {
    this.request = request;
    return this.response;
  }
}

describe("privacy-preserving analyst input", () => {
  it("derives a stable opaque safety identifier from the local session", () => {
    const first = deriveSafetyIdentifier("session-user@example.com");
    const second = deriveSafetyIdentifier("session-user@example.com");

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain("user@example.com");
    expect(deriveSafetyIdentifier("another-session")).not.toBe(first);
  });

  it("sends only bounded sanitized evidence and omits artifact metadata", () => {
    const context = buildSanitizedAnalystContext({
      sessionId: "session_1",
      learnerClaim: "See /home/learner/claim.txt with sk-claim-secret-12345",
      manifest: manifest(),
      concept: "entity_leakage",
    });
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("artifact_private_server_id");
    expect(serialized).not.toContain("customer-churn.ipynb");
    expect(serialized).not.toContain("2026-07-14");
    expect(serialized).not.toContain("/home/learner");
    expect(serialized).not.toContain("sk-secret");
    expect(serialized).not.toContain("sk-claim");
    expect(serialized).toContain("[REDACTED_PATH]");
    expect(serialized).toContain("[REDACTED_SECRET]");
    expect(context.schemaSummary.hash).toBe(
      schemaSummaryHash(manifest().schemaSummary),
    );
  });

  it("redacts credential assignments even when the value has no provider prefix", () => {
    const artifact = manifest();
    artifact.cells[0]!.sourceExcerpt =
      "API_KEY = 'plain-credential-value'\ntrain_test_split(X, y)";

    const serialized = JSON.stringify(
      buildSanitizedAnalystContext({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: artifact,
        concept: "entity_leakage",
      }),
    );

    expect(serialized).not.toContain("plain-credential-value");
    expect(serialized).toContain("[REDACTED_SECRET]");
  });

  it("redacts secrets before applying the evidence excerpt limit", () => {
    const artifact = manifest();
    const syntheticToken = ["sk", "abcdefghijklmnopqrstuvwxyz"].join("-");
    artifact.cells[0]!.sourceExcerpt = `${"x".repeat(690)} ${syntheticToken}`;

    const serialized = JSON.stringify(
      buildSanitizedAnalystContext({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: artifact,
        concept: "entity_leakage",
      }),
    );

    expect(serialized).not.toContain(syntheticToken.slice(0, 9));
  });

  it("sanitizes untrusted schema and symbol metadata", () => {
    const artifact = manifest();
    artifact.schemaSummary.fields[0]!.name = "/home/learner/private.csv";
    const syntheticEntityToken = ["sk", "entity-secret-123456"].join("-");
    artifact.schemaSummary.entityCandidates = [syntheticEntityToken];
    artifact.cells[0]!.symbols = ["C:\\Users\\learner\\secret.py"];
    artifact.cells[0]!.metricCandidates[0]!.name =
      "token = 'plain-metadata-secret'";

    const serialized = JSON.stringify(
      buildSanitizedAnalystContext({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: artifact,
        concept: "entity_leakage",
      }),
    );

    expect(serialized).not.toContain("/home/learner");
    expect(serialized).not.toContain(syntheticEntityToken.slice(0, 9));
    expect(serialized).not.toContain("C:\\\\Users");
    expect(serialized).not.toContain("plain-metadata-secret");
  });

  it("suppresses declared and unknown identifier fields everywhere in the outbound packet", () => {
    const artifact = manifest();
    artifact.schemaSummary.fields.push({
      name: "student_number",
      inferredType: "string",
      privacyClass: "unreviewed_school_identifier",
    });
    artifact.schemaSummary.entityCandidates.push("student_number");
    artifact.cells[0]!.sourceExcerpt =
      "customer_id = row.customer_id\nstudent_number = row.student_number";
    artifact.cells[0]!.symbols.push("student_number");

    const context = buildSanitizedAnalystContext({
      sessionId: "session_1",
      learnerClaim: "Does customer_id let the model memorize each learner?",
      manifest: artifact,
      concept: "entity_leakage",
    });
    const serialized = JSON.stringify(context);

    expect(serialized).not.toContain("customer_id");
    expect(serialized).not.toContain("student_number");
    expect(serialized).toContain("[REDACTED_SENSITIVE_FIELD_1]");
    expect(serialized).toContain("[REDACTED_SENSITIVE_FIELD_2]");
    expect(context.privacy).toMatchObject({
      policyVersion: "outbound-privacy-v2",
      suppressedFieldCount: 2,
    });
    expect(context.privacy.redactions).toContainEqual(
      expect.objectContaining({ category: "sensitive_field" }),
    );
  });

  it("redacts common identifiers, including normalized Unicode variants, without hiding scientific values", () => {
    const artifact = manifest();
    artifact.cells[0]!.sourceExcerpt = [
      "email = 'learner@example.edu'",
      "phone = '+1 (415) 555-0182'",
      "student_id = 'STUDENT-0042'",
      "request_id = '550e8400-e29b-41d4-a716-446655440000'",
      "unicode_phone = '＋１ ４１５ ５５５ ０１８２'",
      "accuracy = 0.9847",
      "run_date = '2026/07/18'",
      "operation = 'group_holdout_v1'",
    ].join("\n");

    const context = buildSanitizedAnalystContext({
      sessionId: "session_1",
      learnerClaim: claim,
      manifest: artifact,
      concept: "entity_leakage",
    });
    const excerpt = context.evidence[0]!.sourceExcerpt;

    expect(excerpt).not.toContain("learner@example.edu");
    expect(excerpt).not.toContain("415) 555-0182");
    expect(excerpt).not.toContain("STUDENT-0042");
    expect(excerpt).not.toContain("550e8400-e29b-41d4-a716-446655440000");
    expect(excerpt).not.toContain("４１５");
    expect(excerpt).toContain("0.9847");
    expect(excerpt).toContain("group_holdout_v1");
    expect(context.privacy.redactions).toContainEqual(
      expect.objectContaining({ category: "identifier" }),
    );
  });
});

describe("evidence resolution", () => {
  it("resolves every Belief Spec v2 reference against trusted artifact evidence", () => {
    const artifact = manifest();
    const beliefSpec = migrateBeliefTestV1ToV2(parsedBeliefTest(artifact));

    expect(() =>
      resolveBeliefSpecV2Evidence(beliefSpec, artifact),
    ).not.toThrow();
  });

  it("rejects a v2 reference even when its nested copies agree with each other", () => {
    const artifact = manifest();
    const source = migrateBeliefTestV1ToV2(parsedBeliefTest(artifact));
    const fabricatedEvidence = source.evidenceRefs.map((evidence) => ({
      ...evidence,
      hash: digest("f"),
    }));
    const fabricated = {
      ...source,
      evidenceRefs: fabricatedEvidence,
      hypotheses: [
        { ...source.hypotheses[0], evidence: fabricatedEvidence },
        { ...source.hypotheses[1], evidence: fabricatedEvidence },
      ],
      alternatives: source.alternatives.map((alternative) => ({
        ...alternative,
        evidence: fabricatedEvidence,
      })),
    } satisfies BeliefSpecV2;

    expect(() =>
      resolveBeliefSpecV2Evidence(fabricated, artifact),
    ).toThrowError(expect.objectContaining({ code: "UNRESOLVED_EVIDENCE" }));
  });

  it("accepts code, output, schema, and learner-claim hashes that resolve", () => {
    const artifact = manifest();
    const beliefTest: BeliefTest = {
      ...liveModelOutput(artifact),
      evidenceRefs: [
        {
          cellIndex: 2,
          kind: "code",
          hash: digest("a"),
          excerpt: "train_test_split(X, y)",
          relevance: "Row split evidence",
        },
        {
          cellIndex: 2,
          outputIndex: 0,
          kind: "metric",
          hash: digest("b"),
          excerpt: "accuracy 0.9847",
          relevance: "Headline metric",
        },
        {
          kind: "schema",
          hash: schemaSummaryHash(artifact.schemaSummary),
          excerpt: "customer_id",
          relevance: "Entity field",
        },
      ],
    };

    expect(() =>
      resolveBeliefTestEvidence(beliefTest, artifact, claim),
    ).not.toThrow();
  });

  it("rejects a fabricated evidence hash", () => {
    const artifact = manifest();
    const beliefTest = {
      ...liveModelOutput(artifact),
      evidenceRefs: [
        {
          cellIndex: 2,
          kind: "code" as const,
          hash: digest("f"),
          excerpt: "train_test_split(X, y)",
          relevance: "Fabricated",
        },
      ],
    } satisfies BeliefTest;

    expect(() =>
      resolveBeliefTestEvidence(beliefTest, artifact, claim),
    ).toThrowError(expect.objectContaining({ code: "UNRESOLVED_EVIDENCE" }));
  });

  it("accepts an explicit insufficient-evidence result with no references", () => {
    const insufficient = {
      ...liveModelOutput(manifest()),
      evidenceRefs: [],
      uncertainty: {
        confidence: 0.2,
        limitations: ["The notebook has no evaluation output."],
        insufficientEvidence: true,
      },
    } satisfies BeliefTest;

    expect(() =>
      resolveBeliefTestEvidence(insufficient, manifest(), claim),
    ).not.toThrow();
  });
});

describe("LiveBeliefAnalyst", () => {
  it("proposes a native v2 Belief Spec without granting the model learner authority", async () => {
    const artifact = manifest();
    const transport = new CapturingTransport({
      outputParsed: liveBeliefSpecOutput(artifact),
      refusals: [],
      responseId: "resp_v2_1",
      modelId: "gpt-5.6",
    });
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      model: "gpt-5.6",
      transport,
    });

    const result = await analyst.proposeBeliefSpec({
      sessionId: "session_v2_1",
      learnerClaim: claim,
      manifest: artifact,
      concept: "entity_leakage",
    });

    expect(result.beliefSpec).toMatchObject({
      schemaVersion: "2",
      concept: "entity_leakage",
      claim,
      learnerDecision: "UNDECIDED",
      hypotheses: [
        {
          id: "current",
          supportedCandidateExperimentIds: [
            "group-holdout",
            "group-holdout-plus-ablation",
          ],
        },
        {
          id: "competing",
          supportedCandidateExperimentIds: [
            "group-holdout",
            "group-holdout-plus-ablation",
          ],
        },
      ],
    });
    expect(result.beliefSpec.id).toMatch(/^belief_[a-f0-9]{20}$/);
    expect(result.provenance).toMatchObject({
      mode: "live",
      modelId: "gpt-5.6",
      responseId: "resp_v2_1",
    });
    expect(transport.request).toMatchObject({
      model: "gpt-5.6",
      store: false,
      safety_identifier: deriveSafetyIdentifier("session_v2_1"),
    });
    expect(transport.request?.instructions).toBe(
      BELIEF_SPEC_ANALYST_INSTRUCTIONS,
    );
    expect(transport.request?.instructions).toContain(
      "CounterLab binds the same pack-owned candidate experiment IDs to both primary hypotheses",
    );
    expect(JSON.parse(transport.request!.input)).toMatchObject({
      conceptPack: {
        candidateExperimentIds: [
          "group-holdout",
          "group-holdout-plus-ablation",
        ],
      },
    });
  });

  it("emits a Responses-compatible object schema for exactly two hypotheses", async () => {
    const artifact = manifest();
    const transport = new CapturingTransport({
      outputParsed: liveBeliefSpecOutput(artifact),
      refusals: [],
    });
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport,
    });

    await analyst.proposeBeliefSpec({
      sessionId: "session_v2_schema_compatibility",
      learnerClaim: claim,
      manifest: artifact,
      concept: "entity_leakage",
    });

    const format = transport.request?.text.format as unknown as {
      schema: {
        properties: {
          hypotheses: {
            items?: unknown;
            minItems?: number;
            maxItems?: number;
          };
        };
      };
    };
    const hypotheses = format.schema.properties.hypotheses;

    expect(Array.isArray(hypotheses.items)).toBe(false);
    expect(hypotheses).toMatchObject({ minItems: 2, maxItems: 2 });
  });

  it("rejects unregistered v2 candidate experiments before state can advance", async () => {
    const invalid = liveBeliefSpecOutput(manifest(), {
      hypotheses: [
        {
          ...liveBeliefSpecOutput().hypotheses[0],
          supportedCandidateExperimentIds: ["model-authored-operation"],
        },
        liveBeliefSpecOutput().hypotheses[1],
      ],
    });
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport: new CapturingTransport({
        outputParsed: invalid,
        refusals: [],
      }),
    });

    await expect(
      analyst.proposeBeliefSpec({
        sessionId: "session_v2_invalid",
        learnerClaim: claim,
        manifest: manifest(),
        concept: "entity_leakage",
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("accepts a v2 insufficient-evidence result without fabricated references", async () => {
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport: new CapturingTransport({
        outputParsed: liveBeliefSpecOutput(manifest(), {
          evidenceRefs: [],
          hypotheses: [
            {
              ...liveBeliefSpecOutput().hypotheses[0],
              evidence: [],
              supportedCandidateExperimentIds: [],
            },
            {
              ...liveBeliefSpecOutput().hypotheses[1],
              evidence: [],
              supportedCandidateExperimentIds: [],
            },
          ],
          alternatives: [],
          uncertainty: 0.84,
          supportState: "INSUFFICIENT_EVIDENCE",
        }),
        refusals: [],
      }),
    });

    const result = await analyst.proposeBeliefSpec({
      sessionId: "session_v2_insufficient",
      learnerClaim: claim,
      manifest: manifest(),
      concept: "entity_leakage",
    });

    expect(result.beliefSpec).toMatchObject({
      supportState: "INSUFFICIENT_EVIDENCE",
      evidenceRefs: [],
      learnerDecision: "UNDECIDED",
    });
  });

  it("derives compile readiness from fixed artifact support instead of model uncertainty", async () => {
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport: new CapturingTransport({
        outputParsed: liveBeliefSpecOutput(manifest(), {
          supportState: "PARTIAL",
          uncertainty: 0.45,
        }),
        refusals: [],
      }),
    });

    const result = await analyst.proposeBeliefSpec({
      sessionId: "session_v2_fixed_readiness",
      learnerClaim: claim,
      manifest: manifest(),
      concept: "entity_leakage",
    });

    expect(result.beliefSpec).toMatchObject({
      supportState: "SUPPORTED",
      uncertainty: 0.45,
    });
  });

  it("uses the Responses structured-output contract and revalidates locally", async () => {
    const transport = new CapturingTransport({
      outputParsed: liveModelOutput(),
      refusals: [],
      responseId: "resp_1",
      modelId: "gpt-5.6",
    });
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      model: "gpt-5.6",
      reasoningEffort: "medium",
      transport,
    });

    const result = await analyst.propose({
      sessionId: "session_1",
      learnerClaim: claim,
      manifest: manifest(),
      concept: "entity_leakage",
    });

    expect(result.beliefTest.id).toBe("belief_live_1");
    expect(result.provenance).toMatchObject({
      mode: "live",
      modelId: "gpt-5.6",
      responseId: "resp_1",
    });
    expect(transport.request).toMatchObject({
      model: "gpt-5.6",
      reasoning: { effort: "medium" },
      store: false,
      safety_identifier: deriveSafetyIdentifier("session_1"),
    });
    expect(transport.request?.text.format.type).toBe("json_schema");
    expect(transport.request?.instructions).not.toContain(claim);
    expect(transport.request?.input).toContain(claim);
  });

  it("returns a typed refusal error instead of advancing", async () => {
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport: new CapturingTransport({
        outputParsed: null,
        refusals: ["I cannot help with that request."],
      }),
    });

    await expect(
      analyst.propose({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: manifest(),
        concept: "entity_leakage",
      }),
    ).rejects.toMatchObject({ code: "MODEL_REFUSAL" });
  });

  it("rejects null and locally invalid structured output", async () => {
    const missing = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport: new CapturingTransport({
        outputParsed: null,
        refusals: [],
      }),
    });
    const invalid = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport: new CapturingTransport({
        outputParsed: liveModelOutput(manifest(), {
          competingHypothesis: {
            statement:
              "Random-row accuracy measures new-customer generalization.",
            predictedOutcome: "Accuracy remains high.",
          },
        }),
        refusals: [],
      }),
    });
    const input = {
      sessionId: "session_1",
      learnerClaim: claim,
      manifest: manifest(),
      concept: "entity_leakage" as const,
    };

    await expect(missing.propose(input)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
    await expect(invalid.propose(input)).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });

  it("rejects unsupported artifacts before invoking the model", async () => {
    const transport = new CapturingTransport({
      outputParsed: liveModelOutput(),
      refusals: [],
    });
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      transport,
    });

    await expect(
      analyst.propose({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: manifest({
          support: {
            status: "UNSUPPORTED",
            reasons: [{ code: "MAGIC", message: "Unsupported magic" }],
          },
        }),
        concept: "entity_leakage",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ARTIFACT" });
    expect(transport.request).toBeUndefined();
  });

  it("uses the released imbalance rules and validates an imbalance Belief Test", async () => {
    const artifact = imbalanceManifest();
    const transport = new CapturingTransport({
      outputParsed: imbalanceModelOutput(artifact),
      refusals: [],
      responseId: "resp_imbalance_1",
      modelId: "configured-model",
    });
    const analyst = new LiveBeliefAnalyst({
      apiKey: "server-only-key",
      model: "configured-model",
      transport,
    });

    const result = await analyst.propose({
      sessionId: "session_imbalance_1",
      learnerClaim: "The high accuracy proves rare defects are detected well.",
      manifest: artifact,
      concept: "class_imbalance",
    });

    expect(result.beliefTest.concept).toBe("class_imbalance");
    expect(BELIEF_ANALYST_INSTRUCTIONS).toContain(
      "Concept Pack: class_imbalance",
    );
    expect(BELIEF_ANALYST_INSTRUCTIONS).toContain("majority baseline");
    expect(JSON.parse(transport.request!.input)).toMatchObject({
      concept: "class_imbalance",
      conceptPack: {
        id: "class_imbalance",
        version: getConceptPack("class_imbalance").version,
      },
    });
  });
});

describe("custom Responses endpoint", () => {
  it("allows a bounded timeout for slower reasoning-compatible endpoints", () => {
    expect(normalizeResponsesTimeout(undefined)).toBe(180_000);
    expect(normalizeResponsesTimeout("240000")).toBe(240_000);
    expect(() => normalizeResponsesTimeout("5000")).toThrowError(
      expect.objectContaining({ code: "CONFIGURATION_ERROR" }),
    );
    expect(() => normalizeResponsesTimeout("unbounded")).toThrowError(
      expect.objectContaining({ code: "CONFIGURATION_ERROR" }),
    );
  });

  it("normalizes a provider-neutral v1 base URL", () => {
    expect(
      normalizeResponsesBaseURL(" https://responses.example.test/api/v1/ "),
    ).toBe("https://responses.example.test/api/v1");
    expect(normalizeResponsesBaseURL("https://responses.example.test")).toBe(
      "https://responses.example.test/v1",
    );
    expect(
      normalizeResponsesBaseURL("https://responses.example.test/v1/responses"),
    ).toBe("https://responses.example.test/v1");
    expect(normalizeResponsesBaseURL(undefined)).toBeUndefined();
    expect(normalizeResponsesBaseURL("   ")).toBeUndefined();
  });

  it.each([
    "http://responses.example.test/v1",
    "https://user:secret@responses.example.test/v1",
    "https://responses.example.test/v1?tenant=private",
    "https://responses.example.test/v1#fragment",
    "https://responses.example.test/custom-path",
    "not-a-url",
  ])("rejects unsafe or malformed base URL %s", (baseURL) => {
    expect(() => normalizeResponsesBaseURL(baseURL)).toThrowError(
      expect.objectContaining({ code: "CONFIGURATION_ERROR" }),
    );
  });

  it("permits an HTTP loopback base URL for local endpoint tests", () => {
    expect(normalizeResponsesBaseURL("http://127.0.0.1:8787/v1")).toBe(
      "http://127.0.0.1:8787/v1",
    );
    expect(normalizeResponsesBaseURL("http://localhost:8787/v1")).toBe(
      "http://localhost:8787/v1",
    );
  });

  it("posts through the configured /v1/responses endpoint", async () => {
    let requestedURL: string | undefined;
    const fakeFetch: typeof globalThis.fetch = async (input) => {
      requestedURL =
        input instanceof Request ? input.url : new URL(input.toString()).href;
      return new Response(
        JSON.stringify({
          id: "resp_custom_1",
          object: "response",
          status: "completed",
          model: "configured-model",
          output: [
            {
              id: "message_1",
              type: "message",
              role: "assistant",
              status: "completed",
              content: [
                {
                  type: "output_text",
                  text: JSON.stringify({ ok: true }),
                  annotations: [],
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const transport = new OpenAIResponsesTransport({
      apiKey: "server-only-key",
      baseURL: "https://responses.example.test/v1",
      fetch: fakeFetch,
    });

    const result = await transport.parse({
      model: "configured-model",
      instructions: "Return the schema.",
      input: "{}",
      text: {
        format: zodTextFormat(z.object({ ok: z.literal(true) }), "test_result"),
      },
      reasoning: { effort: "medium" },
      store: false,
      safety_identifier: deriveSafetyIdentifier("session_custom"),
    });

    expect(requestedURL).toBe("https://responses.example.test/v1/responses");
    expect(result).toMatchObject({
      outputParsed: { ok: true },
      responseId: "resp_custom_1",
      modelId: "configured-model",
    });
  });

  it("returns a provider-neutral typed setup error for endpoint authentication failure", async () => {
    const transport = new OpenAIResponsesTransport({
      apiKey: "server-only-key",
      baseURL: "https://responses.example.test/v1",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "upstream-specific authentication details",
              type: "invalid_request_error",
              code: "invalid_api_key",
            },
          }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
    });

    let failure: unknown;
    try {
      await transport.parse({
        model: "configured-model",
        instructions: "Return the schema.",
        input: "{}",
        text: {
          format: zodTextFormat(
            z.object({ ok: z.literal(true) }),
            "test_result",
          ),
        },
        reasoning: { effort: "medium" },
        store: false,
        safety_identifier: deriveSafetyIdentifier("session_custom"),
      });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      code: "LIVE_UNAVAILABLE",
      message: "Responses endpoint authentication failed",
      details: { category: "authentication", status: 401 },
    });
    expect(JSON.stringify(failure)).not.toContain("upstream-specific");
  });

  it("classifies connection failures as transport errors instead of request rejections", async () => {
    const transport = new OpenAIResponsesTransport({
      apiKey: "server-only-key",
      baseURL: "https://responses.example.test/v1",
      fetch: async () => {
        throw new TypeError("connection refused by private upstream hostname");
      },
    });

    await expect(
      transport.parse({
        model: "configured-model",
        instructions: "Return the schema.",
        input: "{}",
        text: {
          format: zodTextFormat(
            z.object({ ok: z.literal(true) }),
            "test_result",
          ),
        },
        reasoning: { effort: "medium" },
        store: false,
        safety_identifier: deriveSafetyIdentifier("session_custom"),
      }),
    ).rejects.toMatchObject({
      code: "LIVE_UNAVAILABLE",
      message: "Responses endpoint request failed",
      details: { category: "transport" },
    });
  });
});

describe("sample and disabled analysts", () => {
  it("produces a deterministic, visibly approved sample for the exact fixture", async () => {
    const analyst = new ApprovedSampleBeliefAnalyst();
    const input = {
      sessionId: "session_sample",
      learnerClaim: claim,
      manifest: manifest(),
      concept: "entity_leakage" as const,
    };

    const first = await analyst.propose(input);
    const second = await analyst.propose(input);

    expect(first).toEqual(second);
    expect(first.provenance).toMatchObject({ mode: "approved-sample" });
    expect(first.beliefTest.evidenceRefs.length).toBeGreaterThan(0);
    expect(() =>
      resolveBeliefTestEvidence(first.beliefTest, input.manifest, claim),
    ).not.toThrow();
  });

  it("refuses to apply the approved sample to another artifact", async () => {
    const analyst = new ApprovedSampleBeliefAnalyst();

    await expect(
      analyst.propose({
        sessionId: "session_other",
        learnerClaim: claim,
        manifest: manifest({ fileSha256: digest("9") }),
        concept: "entity_leakage",
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_ARTIFACT" });
  });

  it("returns a typed setup error when no server API key exists", async () => {
    const analyst = createLiveBeliefAnalystFromEnv({});

    expect(analyst).toBeInstanceOf(DisabledBeliefAnalyst);
    await expect(analyst.health()).resolves.toMatchObject({
      status: "unavailable",
      mode: "disabled",
      reason: "OPENAI_API_KEY is not configured",
    });
    await expect(
      analyst.propose({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: manifest(),
        concept: "entity_leakage",
      }),
    ).rejects.toBeInstanceOf(BeliefAnalystError);
    await expect(
      analyst.propose({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: manifest(),
        concept: "entity_leakage",
      }),
    ).rejects.toMatchObject({ code: "LIVE_UNAVAILABLE" });
  });

  it("uses documented live defaults and validates reasoning effort", async () => {
    const transport = new CapturingTransport({
      outputParsed: liveModelOutput(),
      refusals: [],
    });
    const analyst = createLiveBeliefAnalystFromEnv(
      { OPENAI_API_KEY: "server-only-key" },
      { transport },
    );

    await analyst.propose({
      sessionId: "session_1",
      learnerClaim: claim,
      manifest: manifest(),
      concept: "entity_leakage",
    });
    expect(transport.request).toMatchObject({
      model: "gpt-5.6",
      reasoning: { effort: "medium" },
    });

    expect(() =>
      createLiveBeliefAnalystFromEnv({
        OPENAI_API_KEY: "server-only-key",
        OPENAI_REASONING_EFFORT: "maximum",
      }),
    ).toThrowError(expect.objectContaining({ code: "CONFIGURATION_ERROR" }));
  });

  it("validates the custom base URL even when a test transport is injected", () => {
    expect(() =>
      createLiveBeliefAnalystFromEnv(
        {
          OPENAI_API_KEY: "server-only-key",
          OPENAI_BASE_URL: "http://responses.example.test/v1",
        },
        {
          transport: new CapturingTransport({
            outputParsed: liveModelOutput(),
            refusals: [],
          }),
        },
      ),
    ).toThrowError(expect.objectContaining({ code: "CONFIGURATION_ERROR" }));
  });
});
