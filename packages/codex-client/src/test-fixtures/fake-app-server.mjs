import readline from "node:readline";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const ignoreSigtermArgument = process.argv.find((argument) =>
  argument.startsWith("--ignore-sigterm="),
);
const ignoreSigtermPidFile = ignoreSigtermArgument?.slice(
  "--ignore-sigterm=".length,
);
if (ignoreSigtermPidFile) {
  writeFileSync(ignoreSigtermPidFile, String(process.pid), { mode: 0o600 });
  process.on("SIGTERM", () => undefined);
  setInterval(() => undefined, 1_000);
}

const exitOnceArgument = process.argv.find((argument) =>
  argument.startsWith("--exit-once="),
);
const exitOnceFile = exitOnceArgument?.slice("--exit-once=".length);
if (exitOnceFile && !existsSync(exitOnceFile)) {
  writeFileSync(exitOnceFile, "exited\n", { mode: 0o600 });
  process.exit(17);
}

const lines = readline.createInterface({ input: process.stdin });
let initialized = false;
let selectedModel = "installed-compatible-default";
const requestApproval = process.argv.includes("--request-approval");
const failedTurn = process.argv.includes("--failed-turn");
const silentTurn = process.argv.includes("--silent-turn");
const failTurnOnceArgument = process.argv.find((argument) =>
  argument.startsWith("--fail-turn-once="),
);
const failTurnOnceFile = failTurnOnceArgument?.slice(
  "--fail-turn-once=".length,
);
const failTurnTwiceArgument = process.argv.find((argument) =>
  argument.startsWith("--fail-turn-twice="),
);
const failTurnTwiceFile = failTurnTwiceArgument?.slice(
  "--fail-turn-twice=".length,
);
const expectModelOmitted = process.argv.includes("--expect-model-omitted");
const expectConstrainedTurn = process.argv.includes(
  "--expect-constrained-turn",
);
const expectStructuredTurn = process.argv.includes("--expect-structured-turn");
const structuredPlanOutput = process.argv.includes("--structured-plan-output");
const structuredPatchOutput = process.argv.includes(
  "--structured-patch-output",
);
const structuredScientificOutput = process.argv.includes(
  "--structured-scientific-output",
);
const structuredScientificSelectedOutput = process.argv.includes(
  "--structured-scientific-selected-output",
);
const structuredScientificUnsafeBindingOutput = process.argv.includes(
  "--structured-scientific-unsafe-binding-output",
);
const structuredScientificFormulaOutput = process.argv.includes(
  "--structured-scientific-formula-output",
);
const structuredScientificFormulaUntilPolicyRepair = process.argv.includes(
  "--structured-scientific-formula-until-policy-repair",
);
const structuredScientificLineageUntilArtifactRepair = process.argv.includes(
  "--structured-scientific-lineage-until-artifact-repair",
);
const structuredInvalidOutput = process.argv.includes(
  "--structured-invalid-output",
);
const structuredNullEvidenceOutput = process.argv.includes(
  "--structured-null-evidence-output",
);
const expectStrictOutputSchema = process.argv.includes(
  "--expect-strict-output-schema",
);
const expectedModelArgument = process.argv.find((argument) =>
  argument.startsWith("--expect-model="),
);
const expectedModel = expectedModelArgument?.slice("--expect-model=".length);
const expectedCwdArgument = process.argv.find((argument) =>
  argument.startsWith("--expect-cwd="),
);
const expectedCwd = expectedCwdArgument?.slice("--expect-cwd=".length);

function send(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function isStrictStructuredSchema(value) {
  if (Array.isArray(value)) return value.every(isStrictStructuredSchema);
  if (value === null || typeof value !== "object") return true;
  if (Object.hasOwn(value, "oneOf")) return false;
  if (
    typeof value.pattern === "string" &&
    /\(\?(?:[=!]|<[=!])/u.test(value.pattern)
  ) {
    return false;
  }
  if (
    value.type === "array" &&
    (!Object.hasOwn(value, "items") || Object.hasOwn(value, "prefixItems"))
  ) {
    return false;
  }
  if (
    value.properties !== undefined &&
    (value.additionalProperties !== false ||
      !Array.isArray(value.required) ||
      JSON.stringify([...value.required].sort()) !==
        JSON.stringify(Object.keys(value.properties).sort()))
  ) {
    return false;
  }
  return Object.values(value).every(isStrictStructuredSchema);
}

function canonicalExperimentPlan(evidenceRefs) {
  return {
    schemaVersion: "2",
    planId: "plan_test",
    sessionId: "session_test",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: "e".repeat(64),
    beliefTestId: "belief_test",
    evidenceRefs,
    baseline: {
      concept: "entity_leakage",
      runId: "random_rows",
      operation: "leakage.random_row_split",
      seed: 1729,
      testFraction: 0.25,
      entityField: "account_id",
      dropIdentity: false,
      model: "logistic_regression",
    },
    interventions: [
      {
        concept: "entity_leakage",
        runId: "new_accounts",
        operation: "leakage.group_holdout",
        seed: 1729,
        testFraction: 0.25,
        entityField: "account_id",
        dropIdentity: false,
        model: "logistic_regression",
      },
      {
        concept: "entity_leakage",
        runId: "without_identity",
        operation: "leakage.identity_ablation",
        seed: 1729,
        testFraction: 0.25,
        entityField: "account_id",
        dropIdentity: true,
        model: "logistic_regression",
      },
    ],
    controlledVariables: ["model", "seed", "test fraction"],
    changedVariables: ["split boundary", "identity feature"],
    metrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
    visualizations: ["metric_comparison", "entity_overlap"],
    discriminatesBecause:
      "Whole-entity holdout removes cross-partition identity while preserving the estimator.",
    expectedPatterns: [
      {
        hypothesisId: "current",
        qualitativeOutcome:
          "Accuracy remains close to the random-row baseline with zero overlap.",
      },
      {
        hypothesisId: "competing",
        qualitativeOutcome:
          "Accuracy falls when complete accounts are held out and overlap reaches zero.",
      },
    ],
    nonClaims: ["This test does not prove deployment performance."],
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
  };
}

function canonicalPatchPlan(evidenceRefs) {
  return {
    schemaVersion: "1",
    planId: "patch_plan_test",
    sessionId: "session_test",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: "e".repeat(64),
    sourceArtifactHash: "b".repeat(64),
    transferResultHash: "d".repeat(64),
    verifiedResultHash: "c".repeat(64),
    evidenceRefs,
    targetCells: [2],
    preserveUnrelatedCells: true,
    nonClaims: ["The patch does not prove performance on every customer."],
    concept: "entity_leakage",
    entityField: "account_id",
    targetField: "cancelled",
    operations: [
      {
        id: "replace_row_split_with_group_holdout",
        cellIndex: 2,
        reason: "Evaluate deployment units as complete held-out accounts.",
      },
      {
        id: "exclude_entity_feature",
        cellIndex: 2,
        reason: "Prevent account identity from becoming a memorized shortcut.",
      },
    ],
  };
}

function canonicalScientificArtifacts(evidenceRefs) {
  const currentStatement = "Behavioral signal generalizes to unseen accounts.";
  const competingStatement =
    "Repeated account identity inflates the row split.";
  const currentPattern = "leakage.small-gap";
  const competingPattern = "leakage.material-gap";
  const nonClaim =
    "This test does not establish performance for every deployment condition.";
  const run = (runId, operation, dropIdentity) => ({
    concept: "entity_leakage",
    runId,
    operation,
    seed: 1729,
    testFraction: 0.25,
    entityField: "account_id",
    dropIdentity,
    model: "logistic_regression",
  });
  return {
    discriminationContract: {
      schemaVersion: "1",
      contractId: "discrimination_test",
      sessionId: "session_test",
      concept: "entity_leakage",
      conceptPackVersion: "2.0.0",
      artifactManifestHash: "e".repeat(64),
      beliefSpecId: "belief_test",
      beliefSpecHash: "f".repeat(64),
      hypotheses: [
        {
          id: "current",
          statement: currentStatement,
          decisivePatternId: currentPattern,
        },
        {
          id: "competing",
          statement: competingStatement,
          decisivePatternId: competingPattern,
        },
      ],
      candidateExperimentIds: ["group-holdout"],
      changedVariableIds: ["split_strategy", "identity_feature"],
      controlledVariableIds: ["model", "seed", "preprocessing"],
      observableIds: ["accuracy", "entity_overlap_rate"],
      inconclusiveConditionIds: ["gap-within-tolerance"],
      whyThisTest:
        "Holding the estimator fixed while separating complete accounts tests the deployment boundary directly.",
      nonClaims: [nonClaim],
      evidenceRefs,
    },
    experimentIr: {
      schemaVersion: "5",
      irId: "ir_test",
      executionPlanId: "plan_test",
      sessionId: "session_test",
      concept: "entity_leakage",
      conceptPackVersion: "2.0.0",
      artifactManifestHash: "e".repeat(64),
      beliefSpecId: "belief_test",
      beliefSpecHash: "f".repeat(64),
      evidenceRefs,
      hypotheses: [
        {
          id: "current",
          statement: currentStatement,
          conditions: ["Deployment evaluates unseen accounts."],
          nonClaims: [nonClaim],
          predictedPattern: {
            patternId: currentPattern,
            description:
              "Performance remains similar after complete accounts are held out.",
          },
        },
        {
          id: "competing",
          statement: competingStatement,
          conditions: ["Accounts repeat across rows."],
          nonClaims: [nonClaim],
          predictedPattern: {
            patternId: competingPattern,
            description:
              "Performance falls after cross-partition account overlap is removed.",
          },
        },
      ],
      candidateExperiments: [
        {
          id: "group-holdout",
          title: "Compare row and whole-account evaluation",
          operationIds: [
            "leakage.random_row_split",
            "leakage.group_holdout",
            "leakage.identity_ablation",
          ],
          baseline: run("random_rows", "leakage.random_row_split", false),
          interventions: [
            run("new_accounts", "leakage.group_holdout", false),
            run("without_identity", "leakage.identity_ablation", true),
          ],
          heldConstantIds: [
            "model",
            "seed",
            "test_fraction",
            "entity_field",
            "preprocessing",
            "model_hyperparameters",
          ],
          changedVariableIds: ["split_strategy", "identity_feature"],
          observableIds: ["accuracy", "entity_overlap_rate"],
          hypothesisPatterns: [
            { hypothesisId: "current", patternId: currentPattern },
            { hypothesisId: "competing", patternId: competingPattern },
          ],
          inconclusiveConditionIds: ["gap-within-tolerance"],
          complexityCost: 3,
          discriminatesBecause:
            "The registered runs compare deployment boundaries while preserving fixed model settings.",
        },
      ],
      selection: { status: "UNSELECTED" },
      visualizations: ["metric_comparison", "entity_overlap"],
      boundarySweep: {
        sweepId: "leakage-recurrence-sweep",
        axisIds: ["test_fraction", "observations_per_entity"],
        gridPresetId: "leakage-boundary-grid-v1",
        observableId: "optimism_gap",
        maxCells: 25,
      },
      inconclusiveConditions: [
        {
          id: "gap-within-tolerance",
          description:
            "The verified difference does not match either decisive pattern.",
        },
      ],
      transfer: {
        taskId: "forecast-future-leakage-v1",
        changedSurface: "Time-ordered forecasting",
        requiredActionIds: ["time_ordered_holdout"],
        nonClaims: ["This transfer does not certify global mastery."],
      },
      nonClaims: [nonClaim],
      provenance: {
        kind: "codex",
        generatorId: "codex-app-server-v1",
        promptHash: "1".repeat(64),
        inputHashes: ["e".repeat(64), "f".repeat(64)],
      },
      limitations: [
        "The test applies to the supported notebook and fixed public kernel.",
      ],
      resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    },
    labScene: {
      schemaVersion: "2",
      sceneId: "scene_test",
      sessionId: "session_test",
      concept: "entity_leakage",
      supportLabel: "GUIDED_VISUAL",
      title: "Does the score survive a new-account boundary?",
      blocks: [
        {
          id: "hypotheses",
          type: "Hypothesis",
          current: currentStatement,
          competing: competingStatement,
        },
        {
          id: "why",
          type: "WhyThisTest",
          text: "Change the account boundary while holding the estimator fixed.",
        },
        {
          id: "group_metric",
          type: "Metric",
          label: "Whole-account accuracy",
          resultBinding: "/runs/byId/new_accounts/metrics/accuracy",
          unit: "proportion",
        },
      ],
      assumptions: ["The fixed Subject Pack owns every metric."],
      limitations: [nonClaim],
    },
  };
}

function scientificArtifactsForOutput(
  evidenceRefs,
  formulaOutput = structuredScientificFormulaOutput,
  lineageOutput = false,
) {
  const artifacts = canonicalScientificArtifacts(evidenceRefs);
  if (structuredScientificSelectedOutput) {
    artifacts.experimentIr.selection = {
      status: "LEGACY_SELECTED",
      candidateId: "group-holdout",
      adapterVersion: "forbidden-model-selection-v1",
      notRescored: true,
    };
  }
  if (structuredScientificUnsafeBindingOutput) {
    artifacts.labScene.blocks[2].resultBinding = "//unsafe/result";
  }
  if (formulaOutput) {
    artifacts.experimentIr.candidateExperiments[0].discriminatesBecause =
      "precision = true positives divided by all alerts";
  }
  if (lineageOutput) {
    artifacts.experimentIr.sessionId = "session_wrong_lineage";
  }
  return artifacts;
}

lines.on("line", (line) => {
  const message = JSON.parse(line);
  if (message.method === "initialize") {
    send({
      id: message.id,
      result: {
        userAgent: "counterlab-test/0.144.4",
        codexHome: "/tmp/codex-home",
        platformFamily: "unix",
        platformOs: "linux",
      },
    });
    return;
  }
  if (message.method === "initialized") {
    initialized = true;
    return;
  }
  if (message.method === "account/read") {
    if (!initialized) process.exit(8);
    send({
      id: message.id,
      result: {
        account: { type: "chatgpt", planType: "test" },
        requiresOpenaiAuth: true,
      },
    });
    return;
  }
  if (message.method === "thread/start") {
    if (!initialized) process.exit(2);
    if (expectModelOmitted && Object.hasOwn(message.params, "model")) {
      process.exit(3);
    }
    if (expectedModel && message.params.model !== expectedModel) {
      process.exit(4);
    }
    if (Object.hasOwn(message.params, "model")) {
      selectedModel = message.params.model;
    }
    if (expectedCwd && message.params.cwd !== expectedCwd) process.exit(6);
    if (expectStructuredTurn && message.params.sandbox !== "read-only") {
      process.exit(9);
    }
    send({
      id: message.id,
      result: {
        thread: { id: "thread_test" },
        model: selectedModel,
      },
    });
    return;
  }
  if (message.method === "turn/start") {
    const turnInputText = Array.isArray(message.params.input)
      ? message.params.input
          .map((item) => (typeof item?.text === "string" ? item.text : ""))
          .join("\n")
      : "";
    const formulaOutput =
      structuredScientificFormulaOutput ||
      (structuredScientificFormulaUntilPolicyRepair &&
        !turnInputText.includes(
          "The previous candidate failed CounterLab's fixed scientific artifact validation",
        ));
    const lineageOutput =
      structuredScientificLineageUntilArtifactRepair &&
      !turnInputText.includes(
        "The previous candidate failed CounterLab's fixed scientific artifact validation",
      );
    const failureMarker = failTurnTwiceFile ?? failTurnOnceFile;
    const failuresBeforeSuccess = failTurnTwiceFile ? 2 : 1;
    const observedFailures =
      failureMarker && existsSync(failureMarker)
        ? Number(readFileSync(failureMarker, "utf8"))
        : 0;
    const failThisTurn =
      failedTurn ||
      (failureMarker !== undefined &&
        Number.isInteger(observedFailures) &&
        observedFailures < failuresBeforeSuccess);
    if (failureMarker !== undefined && failThisTurn && !failedTurn) {
      writeFileSync(failureMarker, String(observedFailures + 1), {
        mode: 0o600,
      });
    }
    if (expectedCwd && message.params.cwd !== expectedCwd) process.exit(7);
    if (
      expectConstrainedTurn &&
      (message.params.sandboxPolicy?.type !== "workspaceWrite" ||
        message.params.sandboxPolicy?.networkAccess !== false ||
        message.params.sandboxPolicy?.excludeSlashTmp !== true ||
        message.params.sandboxPolicy?.excludeTmpdirEnvVar !== true ||
        JSON.stringify(message.params.sandboxPolicy?.writableRoots) !==
          JSON.stringify([message.params.cwd]))
    ) {
      process.exit(5);
    }
    if (
      expectStructuredTurn &&
      (message.params.sandboxPolicy?.type !== "readOnly" ||
        message.params.sandboxPolicy?.networkAccess !== false ||
        message.params.outputSchema?.properties?.authoritativeArtifact ===
          undefined ||
        message.params.outputSchema?.properties?.publicRationale === undefined)
    ) {
      process.exit(10);
    }
    if (
      expectStrictOutputSchema &&
      !isStrictStructuredSchema(message.params.outputSchema)
    ) {
      process.exit(11);
    }
    send({ id: message.id, result: { turn: { id: "turn_test" } } });
    if (silentTurn) return;
    if (requestApproval) {
      send({
        id: 99,
        method: "item/commandExecution/requestApproval",
        params: { command: "not allowed" },
      });
      return;
    }
    if (!failThisTurn) {
      if (
        structuredPlanOutput ||
        structuredPatchOutput ||
        structuredScientificOutput
      ) {
        const evidenceRefs = structuredNullEvidenceOutput
          ? [
              {
                cellIndex: null,
                outputIndex: null,
                kind: "learner_claim",
                hash: "a".repeat(64),
                excerpt: "The learner's claim.",
                relevance: "This is the claim under test.",
              },
            ]
          : [
              {
                cellIndex: 2,
                outputIndex: null,
                kind: "code",
                hash: "a".repeat(64),
                excerpt: "train_test_split(X, y)",
                relevance: "This cell defines the row-wise evaluation.",
              },
            ];
        send({
          method: "item/completed",
          params: {
            threadId: "thread_test",
            turnId: "turn_test",
            completedAtMs: 122,
            item: {
              type: "agentMessage",
              id: "structured_output",
              text: JSON.stringify({
                authoritativeArtifact: structuredInvalidOutput
                  ? { schemaVersion: "2" }
                  : structuredScientificOutput
                    ? scientificArtifactsForOutput(
                        evidenceRefs,
                        formulaOutput,
                        lineageOutput,
                      )
                    : structuredPatchOutput
                      ? canonicalPatchPlan(evidenceRefs)
                      : canonicalExperimentPlan(evidenceRefs),
                publicRationale: structuredScientificOutput
                  ? "Whole-entity holdout changes only the deployment boundary."
                  : "Whole-entity holdout is the smallest fair test.",
              }),
              phase: "final_answer",
              memoryCitation: null,
            },
          },
        });
      }
      send({
        method: "item/plan/delta",
        params: {
          threadId: "thread_test",
          turnId: "turn_test",
          itemId: "plan_test",
          delta: "Create the constrained adapter.",
        },
      });
      send({
        method: "item/reasoning/textDelta",
        params: {
          threadId: "thread_test",
          turnId: "turn_test",
          itemId: "reasoning_test",
          delta: "private reasoning must never surface",
        },
      });
    }
    send({
      method: "turn/completed",
      params: {
        threadId: "thread_test",
        turn: {
          id: "turn_test",
          status: failThisTurn ? "failed" : "completed",
          durationMs: 123,
          error: failThisTurn
            ? { message: "candidate generation failed" }
            : null,
        },
      },
    });
  }
});
