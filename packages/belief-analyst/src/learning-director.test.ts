import { describe, expect, it } from "vitest";
import { zodTextFormat } from "openai/helpers/zod";

import {
  DEFAULT_LEARNING_DIRECTOR_MAX_OUTPUT_TOKENS,
  LEARNING_DIRECTOR_INSTRUCTIONS,
  LEARNING_DIRECTOR_NON_CLAIM_IDS,
  LEARNING_DIRECTOR_TOOL_NAMES,
  LEARNING_DIRECTOR_TOOLS,
  LearningDirectorController,
  LearningDirectorError,
  LearningDirectorStructuredOutputSchema,
  OpenAILearningDirectorTransport,
  type LearningDirectorDecision,
  type LearningDirectorFunctionCall,
  type LearningDirectorInput,
  type LearningDirectorRegistries,
  type LearningDirectorTransport,
  type LearningDirectorTransportRequest,
  type LearningDirectorTransportResult,
} from "./learning-director.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

const registries: LearningDirectorRegistries = {
  entity_leakage: {
    scaffoldIds: ["compare-splits", "hold-controls-fixed"],
    sceneRecipeIds: ["entity-overlap-stage"],
    boundaryViewIds: ["test-fraction-by-repeat-rate"],
  },
  class_imbalance: {
    scaffoldIds: ["compare-metrics"],
    sceneRecipeIds: ["confusion-matrix-stage"],
    boundaryViewIds: ["threshold-by-prevalence"],
  },
};

function packet(
  overrides: Partial<LearningDirectorInput> = {},
): LearningDirectorInput {
  return {
    concept: "entity_leakage",
    subjectPackVersion: "2.1.0",
    approvedEvidence: [
      { hash: HASH_A, excerpt: "A row-level split is recorded." },
      { hash: HASH_B, excerpt: "The entity field repeats across rows." },
    ],
    candidateExperimentIds: ["group-holdout", "identity-ablation"],
    clarificationAlreadyUsed: false,
    ...overrides,
  };
}

function readyPlan(
  overrides: Partial<
    Extract<LearningDirectorDecision, { status: "READY" }>["plan"]
  > = {},
): Extract<LearningDirectorDecision, { status: "READY" }> {
  return {
    status: "READY",
    plan: {
      concept: "entity_leakage",
      introductionStages: [
        "Question",
        "Prediction",
        "Test",
        "Boundary",
        "Apply",
      ],
      primaryEmphasis: "Boundary",
      scaffoldIds: ["compare-splits"],
      candidateExperimentIds: ["group-holdout"],
      sceneRecipeId: "entity-overlap-stage",
      boundaryViewId: "test-fraction-by-repeat-rate",
      evidenceHashes: [HASH_A, HASH_B],
      nonClaims: ["bounded-claim-only", "no-mastery-claim"],
      ...overrides,
    },
  };
}

function call(
  callId: string,
  name: string,
  args: unknown,
): LearningDirectorFunctionCall {
  return {
    callId,
    name,
    arguments: typeof args === "string" ? args : JSON.stringify(args),
    caller: { type: "direct" },
  };
}

function toolTurn(
  functionCalls: readonly LearningDirectorFunctionCall[],
  overrides: Partial<LearningDirectorTransportResult> = {},
): LearningDirectorTransportResult {
  return {
    outputItems: [
      {
        id: "reasoning_encrypted",
        type: "reasoning",
        encrypted_content: "opaque-not-logged",
      },
      ...functionCalls.map((item) => ({
        type: "function_call",
        call_id: item.callId,
        name: item.name,
        arguments: item.arguments,
        caller: item.caller,
      })),
    ],
    outputParsed: null,
    functionCalls,
    refusals: [],
    ...overrides,
  };
}

function finalTurn(
  outputParsed: unknown,
  overrides: Partial<LearningDirectorTransportResult> = {},
): LearningDirectorTransportResult {
  return {
    outputItems: [
      {
        id: "message_final",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [],
      },
    ],
    outputParsed,
    functionCalls: [],
    refusals: [],
    ...overrides,
  };
}

class ScriptedTransport implements LearningDirectorTransport {
  public readonly requests: LearningDirectorTransportRequest[] = [];
  private next = 0;

  public constructor(
    private readonly script: readonly (
      | LearningDirectorTransportResult
      | Error
      | ((
          request: LearningDirectorTransportRequest,
        ) => LearningDirectorTransportResult)
    )[],
  ) {}

  public async create(
    request: LearningDirectorTransportRequest,
  ): Promise<LearningDirectorTransportResult> {
    this.requests.push(request);
    const step = this.script[this.next];
    this.next += 1;
    if (step === undefined) throw new Error("script exhausted");
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(request) : step;
  }
}

function controller(transport: LearningDirectorTransport) {
  return new LearningDirectorController({
    transport,
    registries,
    safetyIdentifier: HASH_C,
  });
}

const allToolCalls = [
  call("call_evidence", "inspect_approved_evidence", {
    hashes: [HASH_A, HASH_B],
  }),
  call("call_capabilities", "get_subject_pack_capabilities", {
    concept: "entity_leakage",
  }),
  call("call_scenes", "list_trusted_scene_recipes", {
    concept: "entity_leakage",
  }),
  call("call_boundaries", "list_verified_boundary_views", {
    concept: "entity_leakage",
  }),
] as const;

describe("LearningDirectorController", () => {
  it("runs four bounded read-only tools, continues statelessly, and returns only decision provenance", async () => {
    const transport = new ScriptedTransport([
      toolTurn(allToolCalls, {
        responseId: "resp_tools",
        modelId: "gpt-5.6",
        usage: {
          inputTokens: 100,
          outputTokens: 20,
          totalTokens: 120,
          cachedInputTokens: 10,
          reasoningTokens: 6,
        },
      }),
      finalTurn(readyPlan(), {
        responseId: "resp_final",
        modelId: "gpt-5.6-2026-07-01",
        usage: {
          inputTokens: 180,
          outputTokens: 35,
          totalTokens: 215,
          cachedInputTokens: 40,
          reasoningTokens: 8,
        },
      }),
    ]);

    const result = await controller(transport).decide(packet());

    expect(result.decision).toEqual(readyPlan());
    expect(result.provenance).toMatchObject({
      modelId: "gpt-5.6-2026-07-01",
      turns: 2,
      usageTotals: {
        inputTokens: 280,
        outputTokens: 55,
        totalTokens: 335,
        cachedInputTokens: 50,
        reasoningTokens: 14,
      },
    });
    expect(result.provenance.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.provenance).not.toHaveProperty("responseId");
    expect(result.provenance.toolTrace).toHaveLength(4);
    expect(result.provenance.toolTrace.map(({ toolName }) => toolName)).toEqual(
      LEARNING_DIRECTOR_TOOL_NAMES,
    );
    for (const trace of result.provenance.toolTrace) {
      expect(trace.argsHash).toMatch(/^[a-f0-9]{64}$/);
      expect(trace.outputHash).toMatch(/^[a-f0-9]{64}$/);
      expect(trace.durationMs).toBeGreaterThanOrEqual(0);
    }
    expect(JSON.stringify(result)).not.toContain("opaque-not-logged");

    expect(transport.requests).toHaveLength(2);
    expect(transport.requests[0]).toMatchObject({
      model: "gpt-5.6",
      instructions: LEARNING_DIRECTOR_INSTRUCTIONS,
      store: false,
      max_output_tokens: DEFAULT_LEARNING_DIRECTOR_MAX_OUTPUT_TOKENS,
      parallel_tool_calls: true,
      include: ["reasoning.encrypted_content"],
      safety_identifier: HASH_C,
    });
    expect(transport.requests[0]!.tools).toHaveLength(4);
    expect(
      transport.requests[0]!.tools.every(
        (tool) => tool.strict && tool.parameters.additionalProperties === false,
      ),
    ).toBe(true);
    expect(transport.requests[0]!.text.format.type).toBe("json_schema");

    const continuation = transport.requests[1]!.input;
    expect(continuation[0]).toEqual(transport.requests[0]!.input[0]);
    expect(continuation).toContainEqual(
      expect.objectContaining({
        type: "reasoning",
        encrypted_content: "opaque-not-logged",
      }),
    );
    const outputs = continuation.filter(
      (item): item is Record<string, unknown> =>
        item !== null &&
        typeof item === "object" &&
        (item as { type?: unknown }).type === "function_call_output",
    );
    expect(outputs).toHaveLength(4);
    expect(outputs[0]).toMatchObject({
      type: "function_call_output",
      call_id: "call_evidence",
      caller: { type: "direct" },
    });
    expect(JSON.parse(String(outputs[0]!.output))).toEqual({
      evidence: packet().approvedEvidence,
    });
    expect(JSON.parse(String(outputs[1]!.output))).toMatchObject({
      concept: "entity_leakage",
      subjectPackVersion: "2.1.0",
    });
    expect(transport.requests[1]).not.toHaveProperty("previous_response_id");
  });

  it("requires at least one tool call before accepting a final decision", async () => {
    await expect(
      controller(new ScriptedTransport([finalTurn(readyPlan())])).decide(
        packet(),
      ),
    ).rejects.toMatchObject({ code: "TOOLS_REQUIRED" });
  });

  it("requires every registry referenced by a READY plan to be inspected", async () => {
    await expect(
      controller(
        new ScriptedTransport([
          toolTurn([allToolCalls[1]]),
          finalTurn(readyPlan({ evidenceHashes: [] })),
        ]),
      ).decide(packet()),
    ).rejects.toMatchObject({ code: "TOOLS_REQUIRED" });
  });

  it.each([
    [
      "unknown tool",
      [call("call_unknown", "write_learning_result", {})],
      "UNKNOWN_TOOL",
    ],
    [
      "malformed arguments",
      [call("call_bad_json", "get_subject_pack_capabilities", "{")],
      "MALFORMED_TOOL_CALL",
    ],
    [
      "cross-packet evidence",
      [
        call("call_bad_hash", "inspect_approved_evidence", {
          hashes: [HASH_C],
        }),
      ],
      "TOOL_ARGUMENT_REJECTED",
    ],
    [
      "cross-concept lookup",
      [
        call("call_bad_concept", "list_trusted_scene_recipes", {
          concept: "class_imbalance",
        }),
      ],
      "TOOL_ARGUMENT_REJECTED",
    ],
  ])("fails closed for %s", async (_label, calls, code) => {
    await expect(
      controller(new ScriptedTransport([toolTurn(calls)])).decide(packet()),
    ).rejects.toMatchObject({ code });
  });

  it("rejects duplicate call IDs before executing either duplicate", async () => {
    const duplicateCalls = [
      call("same_call", "get_subject_pack_capabilities", {
        concept: "entity_leakage",
      }),
      call("same_call", "list_trusted_scene_recipes", {
        concept: "entity_leakage",
      }),
    ];

    await expect(
      controller(new ScriptedTransport([toolTurn(duplicateCalls)])).decide(
        packet(),
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_TOOL_CALL_ID" });
  });

  it("enforces four total calls and three total Responses turns", async () => {
    const fiveCalls = [
      ...allToolCalls,
      call("call_five", "get_subject_pack_capabilities", {
        concept: "entity_leakage",
      }),
    ];
    await expect(
      controller(new ScriptedTransport([toolTurn(fiveCalls)])).decide(packet()),
    ).rejects.toMatchObject({ code: "TOOL_CALL_LIMIT" });

    const transport = new ScriptedTransport([
      toolTurn([
        call("turn_one", "get_subject_pack_capabilities", {
          concept: "entity_leakage",
        }),
      ]),
      toolTurn([
        call("turn_two", "list_trusted_scene_recipes", {
          concept: "entity_leakage",
        }),
      ]),
      toolTurn([
        call("turn_three", "list_verified_boundary_views", {
          concept: "entity_leakage",
        }),
      ]),
    ]);
    await expect(controller(transport).decide(packet())).rejects.toMatchObject({
      code: "TURN_LIMIT",
    });
    expect(transport.requests).toHaveLength(3);
  });

  it("allows one bounded clarification but rejects a second clarification", async () => {
    const clarification = {
      status: "CLARIFICATION_REQUIRED" as const,
      questionId: "learning-emphasis" as const,
      choices: ["comparison-first", "boundary-first"],
    };
    const makeTransport = () =>
      new ScriptedTransport([
        toolTurn([allToolCalls[1]]),
        finalTurn(clarification),
      ]);

    await expect(
      controller(makeTransport()).decide(packet()),
    ).resolves.toMatchObject({ decision: clarification });
    await expect(
      controller(makeTransport()).decide(
        packet({ clarificationAlreadyUsed: true, answer: "comparison-first" }),
      ),
    ).rejects.toMatchObject({ code: "CLARIFICATION_ALREADY_USED" });
  });

  it("rejects free-form decision fields and duplicate fixed choices", async () => {
    const withExplanation = {
      ...readyPlan(),
      explanation: "The result proves leakage.",
    };
    await expect(
      controller(
        new ScriptedTransport([
          toolTurn([allToolCalls[1]]),
          finalTurn(withExplanation),
        ]),
      ).decide(packet()),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });

    await expect(
      controller(
        new ScriptedTransport([
          toolTurn([allToolCalls[1]]),
          finalTurn({
            status: "CLARIFICATION_REQUIRED",
            questionId: "learning-emphasis",
            choices: ["comparison-first", "comparison-first"],
          }),
        ]),
      ).decide(packet()),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it.each([
    ["concept", { concept: "class_imbalance" }],
    ["evidence hash", { evidenceHashes: [HASH_C] }],
    ["experiment", { candidateExperimentIds: ["model-authored-experiment"] }],
    ["scaffold", { scaffoldIds: ["model-authored-scaffold"] }],
    ["scene", { sceneRecipeId: "model-authored-scene" }],
    ["boundary", { boundaryViewId: "model-authored-boundary" }],
  ])("rejects an unregistered READY %s", async (_label, override) => {
    await expect(
      controller(
        new ScriptedTransport([
          toolTurn(allToolCalls),
          finalTurn(readyPlan(override)),
        ]),
      ).decide(packet()),
    ).rejects.toMatchObject({ code: "UNREGISTERED_REFERENCE" });
  });

  it("enforces canonical stage order, emphasis membership, and fixed non-claim IDs", async () => {
    const invalidPlans = [
      readyPlan({ introductionStages: ["Test", "Question"] }),
      readyPlan({
        introductionStages: ["Question", "Prediction"],
        primaryEmphasis: "Boundary",
      }),
      {
        ...readyPlan(),
        plan: { ...readyPlan().plan, nonClaims: ["free-form-result-prose"] },
      },
    ];

    for (const invalidPlan of invalidPlans) {
      await expect(
        controller(
          new ScriptedTransport([
            toolTurn([allToolCalls[1]]),
            finalTurn(invalidPlan),
          ]),
        ).decide(packet()),
      ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    }
    expect(LEARNING_DIRECTOR_NON_CLAIM_IDS).not.toContain(
      "free-form-result-prose",
    );
  });

  it("maps refusals and injected transport failures to LearningDirectorError", async () => {
    let refusalFailure: unknown;
    try {
      await controller(
        new ScriptedTransport([
          finalTurn(null, { refusals: ["private refusal prose"] }),
        ]),
      ).decide(packet());
    } catch (error) {
      refusalFailure = error;
    }
    expect(refusalFailure).toBeInstanceOf(LearningDirectorError);
    expect(refusalFailure).toMatchObject({ code: "MODEL_REFUSAL" });
    expect(JSON.stringify(refusalFailure)).not.toContain(
      "private refusal prose",
    );

    await expect(
      controller(
        new ScriptedTransport([new Error("private upstream detail")]),
      ).decide(packet()),
    ).rejects.toMatchObject({
      name: "LearningDirectorError",
      code: "TRANSPORT_ERROR",
    });
  });

  it("rejects duplicate packet and closed-registry IDs before transport", async () => {
    const transport = new ScriptedTransport([]);
    await expect(
      controller(transport).decide(
        packet({
          candidateExperimentIds: ["group-holdout", "group-holdout"],
        }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(transport.requests).toHaveLength(0);

    expect(
      () =>
        new LearningDirectorController({
          transport,
          registries: {
            entity_leakage: {
              scaffoldIds: ["same", "same"],
              sceneRecipeIds: ["scene"],
              boundaryViewIds: ["boundary"],
            },
          },
          safetyIdentifier: HASH_C,
        }),
    ).toThrowError(expect.objectContaining({ code: "CONFIGURATION_ERROR" }));
  });
});

describe("OpenAILearningDirectorTransport", () => {
  function sdkRequest(): LearningDirectorTransportRequest {
    return {
      model: "gpt-5.6",
      instructions: LEARNING_DIRECTOR_INSTRUCTIONS,
      input: [{ role: "user", content: JSON.stringify(packet()) }],
      tools: LEARNING_DIRECTOR_TOOLS,
      text: {
        format: zodTextFormat(
          LearningDirectorStructuredOutputSchema,
          "counterlab_learning_director_decision_v1",
        ),
      },
      reasoning: { effort: "medium" },
      include: ["reasoning.encrypted_content"],
      store: false,
      safety_identifier: HASH_C,
      max_output_tokens: 1_200,
      parallel_tool_calls: true,
    };
  }

  it("sends a strict non-stored structured Responses request", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const transport = new OpenAILearningDirectorTransport({
      apiKey: "server-only-key",
      baseURL: "https://responses.example.test/v1",
      fetch: async (input, init) => {
        const request =
          input instanceof Request ? input : new Request(input, init);
        requestBody = (await request.clone().json()) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            id: "resp_sdk",
            object: "response",
            status: "completed",
            model: "gpt-5.6",
            output: [
              {
                id: "message_sdk",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [
                  {
                    type: "output_text",
                    text: JSON.stringify({ decision: readyPlan() }),
                    annotations: [],
                  },
                ],
              },
            ],
            usage: {
              input_tokens: 40,
              input_tokens_details: {
                cached_tokens: 5,
                cache_write_tokens: 0,
              },
              output_tokens: 15,
              output_tokens_details: { reasoning_tokens: 3 },
              total_tokens: 55,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    });

    const response = await transport.create(sdkRequest());

    expect(response).toMatchObject({
      outputParsed: readyPlan(),
      responseId: "resp_sdk",
      modelId: "gpt-5.6",
      usage: {
        inputTokens: 40,
        outputTokens: 15,
        totalTokens: 55,
        cachedInputTokens: 5,
        reasoningTokens: 3,
      },
    });
    expect(requestBody).toMatchObject({
      model: "gpt-5.6",
      store: false,
      max_output_tokens: 1_200,
      parallel_tool_calls: true,
      include: ["reasoning.encrypted_content"],
      safety_identifier: HASH_C,
      text: { format: { type: "json_schema", strict: true } },
    });
    expect(requestBody).not.toHaveProperty("previous_response_id");
    expect(
      (requestBody?.tools as Array<Record<string, unknown>>).map(
        ({ name }) => name,
      ),
    ).toEqual(LEARNING_DIRECTOR_TOOL_NAMES);
    expect(
      (requestBody?.tools as Array<Record<string, unknown>>).every(
        (tool) => tool.strict === true,
      ),
    ).toBe(true);
  });

  it("disables SDK retries and maps rate limits without preserving provider prose", async () => {
    let attempts = 0;
    const transport = new OpenAILearningDirectorTransport({
      apiKey: "server-only-key",
      baseURL: "https://responses.example.test/v1",
      fetch: async () => {
        attempts += 1;
        return new Response(
          JSON.stringify({
            error: {
              message: "private provider rate-limit detail",
              type: "rate_limit_error",
            },
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        );
      },
    });

    let failure: unknown;
    try {
      await transport.create(sdkRequest());
    } catch (error) {
      failure = error;
    }

    expect(attempts).toBe(1);
    expect(failure).toBeInstanceOf(LearningDirectorError);
    expect(failure).toMatchObject({ code: "RATE_LIMITED" });
    expect(JSON.stringify(failure)).not.toContain("private provider");
  });
});
