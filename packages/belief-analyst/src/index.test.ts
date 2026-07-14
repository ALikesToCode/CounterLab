import { describe, expect, it } from "vitest";

import type { ArtifactManifest, BeliefTest } from "@counterlab/contracts";

import {
  APPROVED_LEAKAGE_SAMPLE_SHA256,
  ApprovedSampleBeliefAnalyst,
  BeliefAnalystError,
  DisabledBeliefAnalyst,
  LiveBeliefAnalyst,
  buildSanitizedAnalystContext,
  createLiveBeliefAnalystFromEnv,
  deriveSafetyIdentifier,
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
    artifact.cells[0]!.sourceExcerpt = `${"x".repeat(690)} sk-abcdefghijklmnopqrstuvwxyz`;

    const serialized = JSON.stringify(
      buildSanitizedAnalystContext({
        sessionId: "session_1",
        learnerClaim: claim,
        manifest: artifact,
        concept: "entity_leakage",
      }),
    );

    expect(serialized).not.toContain("sk-abcdef");
  });

  it("sanitizes untrusted schema and symbol metadata", () => {
    const artifact = manifest();
    artifact.schemaSummary.fields[0]!.name = "/home/learner/private.csv";
    artifact.schemaSummary.entityCandidates = ["sk-entity-secret-123456"];
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
    expect(serialized).not.toContain("sk-entity");
    expect(serialized).not.toContain("C:\\\\Users");
    expect(serialized).not.toContain("plain-metadata-secret");
  });
});

describe("evidence resolution", () => {
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
});
