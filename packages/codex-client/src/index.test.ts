import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ExperimentPlanV2Schema,
  PatchPlanV1Schema,
} from "@counterlab/contracts";

import {
  AppServerCodexCompiler,
  buildCompileHostedExperimentPlanPrompt,
  buildCompileHostedPatchPlanPrompt,
  buildRepairHostedExperimentPlanPrompt,
  buildRepairHostedPatchPlanPrompt,
  CompilerSetupError,
  DisabledCodexCompiler,
  ReplayCodexCompiler,
  sanitizeAppServerMessage,
  type CompileLabInput,
  type CompilePatchInput,
  type CompilerEvent,
  type CompileHostedExperimentPlanInput,
  type CompileHostedPatchPlanInput,
  type RepairHostedExperimentPlanInput,
  type RepairLabInput,
} from "./index.js";

const generationDirectory = "/tmp/counterlab/generated/session_test";
const unisolatedTestProcess = {
  allowUnisolatedTestProcess: true as const,
  restartDelayMs: 0,
};

function labInput(): CompileLabInput {
  return {
    sessionId: "session_test",
    generationDirectory,
    approvedBeliefTest: {
      id: "belief_test",
      concept: "entity_leakage",
      evidenceRefs: [{ hash: "a".repeat(64), cellIndex: 2 }],
    },
    experimentPlanSchema: {
      type: "object",
      required: ["schemaVersion"],
    },
    conceptPackDocumentation:
      "Compose only the fixed CounterLab leakage SDK primitives.",
    fixtureSchema: {
      fields: ["customer_id", "tenure_months", "churned"],
      entity: "customer_id",
      target: "churned",
    },
    evidenceReferences: [{ hash: "a".repeat(64), cellIndex: 2 }],
    resourceLimits: {
      wallSeconds: 30,
      memoryMb: 512,
      maxProcesses: 4,
      maxFiles: 16,
      maxOutputBytes: 1_048_576,
    },
    permittedFiles: [
      "experiment-plan.json",
      "artifact-adapter.py",
      "public_tests.py",
    ],
    permittedCommands: ["python -m pytest public_tests.py"],
  };
}

function patchInput(): CompilePatchInput {
  return {
    sessionId: "session_test",
    generationDirectory,
    approvedBeliefTest: { id: "belief_test", concept: "entity_leakage" },
    verifiedResult: { schemaVersion: "1", resultHash: "c".repeat(64) },
    transferResult: { schemaVersion: "1", outcome: "PASSED" },
    notebookCopyFileName: "customer-churn-copy.ipynb",
    allowedCellIndices: [2],
    patchMetadataFileName: "patch-metadata.json",
    resourceLimits: {
      wallSeconds: 30,
      memoryMb: 512,
      maxProcesses: 4,
      maxFiles: 16,
      maxOutputBytes: 1_048_576,
    },
    permittedCommands: ["python -m counterlab_kernel patch-verify"],
  };
}

function hostedPlanInput(
  directory = generationDirectory,
): CompileHostedExperimentPlanInput {
  return {
    sessionId: "session_test",
    artifactManifestHash: "e".repeat(64),
    generationDirectory: directory,
    approvedBeliefTest: {
      id: "belief_test",
      concept: "entity_leakage",
      evidenceRefs: [{ hash: "a".repeat(64), cellIndex: 2 }],
    },
    artifactManifest: {
      artifactId: "artifact_test",
      fileSha256: "b".repeat(64),
      support: { status: "SUPPORTED", reasons: [] },
      cells: [{ index: 2, sourceSha256: "a".repeat(64) }],
      schemaSummary: {
        fields: [
          {
            name: "account_id",
            inferredType: "string",
            privacyClass: "identifier",
          },
          {
            name: "cancelled",
            inferredType: "boolean",
            privacyClass: "target",
          },
        ],
        entityCandidates: ["account_id"],
        targetCandidates: ["cancelled"],
      },
    },
    conceptPack: {
      id: "entity_leakage",
      version: "2.0.0",
      title: "Entity leakage",
      allowedOperations: [
        "leakage.random_row_split",
        "leakage.group_holdout",
        "leakage.identity_ablation",
      ],
      allowedMetrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
      allowedVisualizations: ["metric_comparison", "entity_overlap"],
      verifierInvariants: ["resolved_evidence", "zero_group_overlap"],
      planRequirements: [
        "Use exactly one group holdout with identity retained.",
        "Use exactly one identity ablation with identity removed.",
      ],
    },
    experimentPlanSchema: {
      type: "object",
      required: ["schemaVersion", "artifactManifestHash"],
    },
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 4 },
    permittedOutputs: ["experiment-plan.json", "public-rationale.md"],
  };
}

function hostedPatchInput(
  directory = generationDirectory,
): CompileHostedPatchPlanInput {
  return {
    sessionId: "session_test",
    artifactManifestHash: "e".repeat(64),
    sourceArtifactHash: "b".repeat(64),
    conceptPackVersion: "2.0.0",
    generationDirectory: directory,
    approvedBeliefTest: {
      id: "belief_test",
      concept: "entity_leakage",
      evidenceRefs: [{ hash: "a".repeat(64), cellIndex: 2 }],
    },
    artifactManifest: hostedPlanInput().artifactManifest,
    verifiedResultSummary: {
      schemaVersion: "2",
      resultHash: "c".repeat(64),
      planId: "plan_1",
      runIds: ["random_rows", "new_accounts", "without_identity"],
    },
    transferSummary: {
      outcome: "PASSED",
      resultHash: "d".repeat(64),
      selectedStrategy: "time_ordered_holdout",
      identifiedRisks: ["centered_window_reads_future"],
    },
    patchContract: {
      id: "leakage-notebook-patch-v2",
      allowedTransformations: [
        "replace_row_split_with_group_holdout",
        "exclude_entity_feature",
      ],
    },
    allowedCellIndices: [2],
    patchPlanSchema: { type: "object", required: ["operations"] },
    resourceLimits: { wallSeconds: 30, memoryMb: 512, maxRuns: 1 },
    permittedOutputs: ["patch-plan.json", "public-rationale.md"],
  };
}

function hostedPatchV5Input(): CompileHostedPatchPlanInput {
  const legacy = hostedPatchInput();
  if (!("approvedBeliefTest" in legacy)) {
    throw new Error("legacy hosted patch fixture lost Belief Test authority");
  }
  const { approvedBeliefTest: _legacyBelief, ...shared } = legacy;
  return {
    ...shared,
    authorityVersion: "5",
    approvedBeliefSpec: {
      schemaVersion: "2",
      id: "belief_spec_v5",
      concept: "entity_leakage",
      claim: "The random-row score proves performance for new customers.",
      evidenceRefs: [{ hash: "a".repeat(64), cellIndex: 2 }],
    },
  } as CompileHostedPatchPlanInput;
}

async function collect(iterable: AsyncIterable<CompilerEvent>) {
  const events: CompilerEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("sanitizeAppServerMessage", () => {
  it("drops reasoning and agent prose but preserves allowed plan summaries", () => {
    expect(
      sanitizeAppServerMessage({
        method: "item/reasoning/textDelta",
        params: { delta: "private chain of thought" },
      }),
    ).toEqual([]);
    expect(
      sanitizeAppServerMessage({
        method: "item/agentMessage/delta",
        params: { delta: "unreviewed agent prose" },
      }),
    ).toEqual([]);
    expect(
      sanitizeAppServerMessage({
        method: "item/plan/delta",
        params: {
          threadId: "thread_1",
          turnId: "turn_1",
          itemId: "item_1",
          delta: "Inspect the notebook adapter.",
        },
      }),
    ).toEqual([
      {
        type: "plan_summary",
        summary: "Inspect the notebook adapter.",
      },
    ]);
  });

  it("redacts secrets, limits command output, and emits only safe file names", () => {
    const [command] = sanitizeAppServerMessage({
      method: "item/completed",
      params: {
        threadId: "thread_1",
        turnId: "turn_1",
        completedAtMs: 1,
        item: {
          type: "commandExecution",
          id: "command_1",
          command: "python -m pytest public_tests.py",
          cwd: "/private/workspace",
          processId: null,
          source: "agent",
          status: "completed",
          commandActions: [],
          aggregatedOutput: `ok sk-${"x".repeat(32)} ${"z".repeat(5_000)}`,
          exitCode: 0,
          durationMs: 87,
        },
      },
    });

    expect(command).toMatchObject({
      type: "command",
      command: "python -m pytest public_tests.py",
      durationMs: 87,
      exitCode: 0,
      status: "completed",
    });
    expect(command?.type === "command" && command.outputExcerpt).not.toContain(
      `sk-${"x".repeat(32)}`,
    );
    expect(
      command?.type === "command" && command.outputExcerpt.length,
    ).toBeLessThanOrEqual(4_001);

    expect(
      sanitizeAppServerMessage({
        method: "item/fileChange/patchUpdated",
        params: {
          threadId: "thread_1",
          turnId: "turn_1",
          itemId: "file_1",
          changes: [
            {
              path: "/private/workspace/artifact-adapter.py",
              kind: { type: "update", move_path: null },
              diff: "@@ -1 +1 @@\n-old\n+new",
            },
          ],
        },
      }),
    ).toEqual([
      {
        type: "file_change",
        files: ["artifact-adapter.py"],
        unifiedDiff: "@@ -1 +1 @@\n-old\n+new",
        status: "updated",
      },
    ]);
  });

  it("removes machine-local paths from command summaries and diff headers", () => {
    const [command] = sanitizeAppServerMessage({
      method: "item/completed",
      params: {
        threadId: "thread_1",
        turnId: "turn_1",
        item: {
          type: "commandExecution",
          id: "command_1",
          command:
            "/bin/bash -lc 'sed /home/person/.codex/skills/example/SKILL.md && python /tmp/private/check.py'",
          cwd: "/home/person/project",
          processId: null,
          source: "agent",
          status: "completed",
          commandActions: [],
          aggregatedOutput: "ok",
          exitCode: 0,
          durationMs: 2,
        },
      },
    });
    expect(command?.type).toBe("command");
    if (command?.type === "command") {
      expect(command.command).not.toContain("/home/person");
      expect(command.command).not.toContain("/tmp/private");
      expect(command.command).toContain("[local-path]");
      expect(command.command).toContain("[temp-path]");
    }

    const [diff] = sanitizeAppServerMessage({
      method: "turn/diff/updated",
      params: {
        threadId: "thread_1",
        turnId: "turn_1",
        diff: [
          "diff --git a/data/live-runs/session/artifact-adapter.py b/data/live-runs/session/artifact-adapter.py",
          "--- a/data/live-runs/session/artifact-adapter.py",
          "+++ b/data/live-runs/session/artifact-adapter.py",
          "@@ -1 +1 @@",
          "-old",
          "+new",
        ].join("\n"),
      },
    });
    expect(diff?.type).toBe("file_change");
    if (diff?.type === "file_change") {
      expect(diff.unifiedDiff).not.toContain("data/live-runs");
      expect(diff.unifiedDiff).toContain(
        "diff --git a/artifact-adapter.py b/artifact-adapter.py",
      );
    }
  });

  it("captures the current turn token usage as private compiler telemetry", () => {
    expect(
      sanitizeAppServerMessage({
        method: "thread/tokenUsage/updated",
        params: {
          threadId: "thread_1",
          turnId: "turn_1",
          tokenUsage: {
            last: {
              inputTokens: 120,
              cachedInputTokens: 80,
              outputTokens: 35,
              reasoningOutputTokens: 12,
              totalTokens: 155,
            },
            total: {
              inputTokens: 320,
              cachedInputTokens: 180,
              outputTokens: 70,
              reasoningOutputTokens: 24,
              totalTokens: 390,
            },
            modelContextWindow: 200_000,
          },
        },
      }),
    ).toEqual([
      {
        type: "usage",
        inputTokens: 120,
        cachedInputTokens: 80,
        outputTokens: 35,
        reasoningOutputTokens: 12,
        totalTokens: 155,
        modelContextWindow: 200_000,
      },
    ]);
  });

  it("rejects malformed protocol notifications instead of guessing", () => {
    expect(() =>
      sanitizeAppServerMessage({
        method: "item/plan/delta",
        params: { delta: 42 },
      }),
    ).toThrow(/invalid app-server message/i);
  });
});

describe("hosted plan-only compiler", () => {
  it("builds an artifact-specific prompt with a strict non-executable authority boundary", () => {
    const prompt = buildCompileHostedExperimentPlanPrompt(hostedPlanInput());

    expect(prompt).toContain("account_id");
    expect(prompt).toContain("artifactManifestHash");
    expect(prompt).toContain('"sessionId": "session_test"');
    expect(prompt).toContain(`"artifactManifestHash": "${"e".repeat(64)}"`);
    expect(prompt).toContain(
      "Use exactly one group holdout with identity retained.",
    );
    expect(prompt).toContain("experiment-plan.json");
    expect(prompt).toContain("public-rationale.md");
    expect(prompt).toMatch(/must not contain executable source code/i);
    expect(prompt).toMatch(/do not run shell commands/i);
    expect(prompt).toMatch(/result values/i);
    expect(prompt).not.toContain(generationDirectory);
  });

  it("rejects any hosted output path outside the two authorized files", () => {
    expect(() =>
      buildCompileHostedExperimentPlanPrompt({
        ...hostedPlanInput(),
        permittedOutputs: ["experiment-plan.json", "artifact-adapter.py"],
      }),
    ).toThrow(/only experiment-plan\.json and public-rationale\.md/i);
  });

  it("limits repair feedback to structured verifier counterexamples and two attempts", () => {
    const repair: RepairHostedExperimentPlanInput = {
      ...hostedPlanInput(),
      repairAttempt: 2,
      previousOutputHashes: {
        "experiment-plan.json": "c".repeat(64),
        "public-rationale.md": "d".repeat(64),
      },
      previousCandidatePlan: {
        schemaVersion: "2",
        planId: "plan_previous",
        sessionId: "session_test",
      },
      verifierCounterexamples: [
        {
          invariant: "zero_group_overlap",
          observed: { overlap: 3 },
          expected: { overlap: 0 },
          counterexample: "Three account IDs occur in both partitions.",
        },
      ],
    };

    const prompt = buildRepairHostedExperimentPlanPrompt(repair);
    expect(prompt).toContain("repair attempt 2 of at most 2");
    expect(prompt).toContain("zero_group_overlap");
    expect(prompt).toContain("Three account IDs occur in both partitions.");
    expect(prompt).toContain('"planId": "plan_previous"');
    expect(prompt).toMatch(/preserve every field that was not rejected/i);
    expect(prompt).not.toContain("hidden verifier source");
  });

  it("materializes hosted Plan artifacts from a read-only schema-constrained turn", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-structured-plan-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--structured-plan-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      const events = await collect(
        compiler.compileExperimentPlan(hostedPlanInput(work)),
      );
      expect(events).toContainEqual({
        type: "status",
        phase: "plan",
        status: "completed",
      });
      const materializedPlan = JSON.parse(
        await readFile(join(work, "experiment-plan.json"), "utf8"),
      ) as unknown;
      expect(ExperimentPlanV2Schema.safeParse(materializedPlan).success).toBe(
        true,
      );
      expect(await readFile(join(work, "public-rationale.md"), "utf8")).toBe(
        "Whole-entity holdout is the smallest fair test.\n",
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "file_change",
          files: ["experiment-plan.json", "public-rationale.md"],
          status: "completed",
        }),
      );
      expect(events.some((event) => event.type === "command")).toBe(false);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("adapts the canonical Plan schema to the strict App Server output subset", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const canonicalSchema = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL(
            "../../contracts/schemas/experiment-plan-v2.schema.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const work = await mkdtemp(join(tmpdir(), "counterlab-strict-plan-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--expect-strict-output-schema",
        "--structured-plan-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await expect(
        collect(
          compiler.compileExperimentPlan({
            ...hostedPlanInput(work),
            experimentPlanSchema: canonicalSchema,
          }),
        ),
      ).resolves.toContainEqual({
        type: "status",
        phase: "plan",
        status: "completed",
      });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("rejects an incomplete structured Plan before materializing files", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const canonicalSchema = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL(
            "../../contracts/schemas/experiment-plan-v2.schema.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const work = await mkdtemp(join(tmpdir(), "counterlab-invalid-plan-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--structured-plan-output",
        "--structured-invalid-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await expect(
        collect(
          compiler.compileExperimentPlan({
            ...hostedPlanInput(work),
            experimentPlanSchema: canonicalSchema,
          }),
        ),
      ).rejects.toMatchObject({ code: "CODEX_PROTOCOL_ERROR" });
      await expect(
        readFile(join(work, "experiment-plan.json"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("removes only model-boundary null placeholders before materialization", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-null-plan-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--structured-plan-output",
        "--structured-null-evidence-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await collect(
        compiler.compileExperimentPlan({
          ...hostedPlanInput(work),
          experimentPlanSchema: JSON.parse(
            await readFile(
              fileURLToPath(
                new URL(
                  "../../contracts/schemas/experiment-plan-v2.schema.json",
                  import.meta.url,
                ),
              ),
              "utf8",
            ),
          ) as Record<string, unknown>,
        }),
      );
      const materializedPlan = ExperimentPlanV2Schema.parse(
        JSON.parse(
          await readFile(join(work, "experiment-plan.json"), "utf8"),
        ) as unknown,
      );
      expect(materializedPlan.evidenceRefs[0]?.cellIndex).toBeUndefined();
      expect(materializedPlan.evidenceRefs[0]?.outputIndex).toBeUndefined();
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("adapts the canonical Patch Plan union to the strict App Server output subset", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const canonicalSchema = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL(
            "../../contracts/schemas/patch-plan-v1.schema.json",
            import.meta.url,
          ),
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const work = await mkdtemp(join(tmpdir(), "counterlab-strict-patch-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--expect-strict-output-schema",
        "--structured-patch-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      const events = await collect(
        compiler.compileHostedPatchPlan({
          ...hostedPatchInput(work),
          patchPlanSchema: canonicalSchema,
        }),
      );
      expect(events).toContainEqual({
        type: "status",
        phase: "patch",
        status: "completed",
      });
      const materializedPatch = JSON.parse(
        await readFile(join(work, "patch-plan.json"), "utf8"),
      ) as unknown;
      expect(PatchPlanV1Schema.safeParse(materializedPatch).success).toBe(true);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("restarts one App Server that exits before emitting compiler output", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-codex-restart-"));
    const exitMarker = join(work, "first-process-exited");
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        `--exit-once=${exitMarker}`,
        "--structured-plan-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await expect(
        collect(compiler.compileExperimentPlan(hostedPlanInput(work))),
      ).resolves.toContainEqual({
        type: "status",
        phase: "plan",
        status: "completed",
      });
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("does not misclassify or restart a failed turn as a process exit", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(
      join(tmpdir(), "counterlab-codex-turn-restart-"),
    );
    const failureMarker = join(work, "failed-turn-count");
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        `--fail-turn-twice=${failureMarker}`,
        "--structured-plan-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await expect(
        collect(compiler.compileExperimentPlan(hostedPlanInput(work))),
      ).rejects.toMatchObject({
        name: "CompilerSetupError",
        code: "CODEX_TURN_FAILED",
      });
      expect(await readFile(failureMarker, "utf8")).toBe("1");
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("fails closed after the bounded startup restarts are exhausted", async () => {
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: ["-e", "process.exit(17)"],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    await expect(
      collect(compiler.compileExperimentPlan(hostedPlanInput())),
    ).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_PROCESS_EXITED",
    });
  });
});

describe("hosted patch-plan compiler", () => {
  it("keeps raw notebook content and executable repairs outside the model turn", () => {
    const prompt = buildCompileHostedPatchPlanPrompt(hostedPatchInput());

    expect(prompt).toContain("patch-plan.json");
    expect(prompt).toContain("replace_row_split_with_group_holdout");
    expect(prompt).toContain('"sessionId": "session_test"');
    expect(prompt).toContain(`"artifactManifestHash": "${"e".repeat(64)}"`);
    expect(prompt).toContain(`"verifiedResultHash": "${"c".repeat(64)}"`);
    expect(prompt).toContain(`"transferResultHash": "${"d".repeat(64)}"`);
    expect(prompt).toMatch(/do not write notebook code/i);
    expect(prompt).not.toContain(generationDirectory);
    expect(prompt).not.toContain("nbformat_minor");
  });

  it("labels v5 learner authority as a Belief Spec without accepting a legacy sample Belief Test", () => {
    const prompt = buildCompileHostedPatchPlanPrompt(hostedPatchV5Input());

    expect(prompt).toContain("Approved Belief Spec:");
    expect(prompt).toContain('"id": "belief_spec_v5"');
    expect(prompt).not.toContain("Approved Belief Test:");
    expect(prompt).not.toContain('"id": "belief_test"');
  });

  it("repairs the prior Patch Plan without rebuilding resolved lineage", () => {
    const prompt = buildRepairHostedPatchPlanPrompt({
      ...hostedPatchInput(),
      repairAttempt: 1,
      previousOutputHashes: {
        "patch-plan.json": "1".repeat(64),
        "public-rationale.md": "2".repeat(64),
      },
      previousCandidatePlan: {
        schemaVersion: "1",
        planId: "patch_plan_previous",
        sessionId: "session_test",
      },
      verifierCounterexamples: [
        {
          invariant: "allowed_cell_scope",
          observed: [3],
          expected: [2],
          counterexample: "Cell 3 is outside the approved patch scope.",
        },
      ],
    });

    expect(prompt).toContain('"planId": "patch_plan_previous"');
    expect(prompt).toMatch(/preserve every field that was not rejected/i);
  });
});

describe("fallback compiler implementations", () => {
  it("replays stored sanitized events while retaining the replay label", async () => {
    const stored: CompilerEvent[] = [
      { type: "status", phase: "generate", status: "started" },
      {
        type: "final_status",
        status: "verified",
        threadId: "thread_replay",
        turnId: "turn_replay",
      },
    ];
    const compiler = new ReplayCodexCompiler({
      replayId: "leakage-01",
      recordedAt: "2026-07-14T10:00:00.000Z",
      model: "gpt-5.6-codex",
      events: stored,
    });

    expect(await compiler.health()).toMatchObject({
      mode: "replay",
      available: true,
      replayId: "leakage-01",
    });
    expect(await collect(compiler.compileLab(labInput()))).toEqual([
      {
        type: "replay_metadata",
        replayId: "leakage-01",
        recordedAt: "2026-07-14T10:00:00.000Z",
        model: "gpt-5.6-codex",
      },
      ...stored,
    ]);
  });

  it("returns a typed setup error rather than pretending disabled mode worked", async () => {
    const compiler = new DisabledCodexCompiler("Codex live mode is disabled.");
    expect(await compiler.health()).toEqual({
      mode: "disabled",
      available: false,
      reason: "Codex live mode is disabled.",
    });

    await expect(
      collect(compiler.compileLab(labInput())),
    ).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_DISABLED",
    });
    expect(
      await collect(compiler.compileLab(labInput())).catch((error) => error),
    ).toBeInstanceOf(CompilerSetupError);
  });
});

describe("AppServerCodexCompiler stdio transport", () => {
  it("fails closed when no trusted launch boundary is configured", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer],
      timeoutMs: 2_000,
    });

    await expect(
      collect(compiler.compileLab(labInput())),
    ).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_ISOLATION_UNAVAILABLE",
      message: expect.stringMatching(
        /credential-and-privilege launch boundary/i,
      ),
    });
    expect(await compiler.health()).toMatchObject({
      mode: "live",
      available: false,
      reason: expect.stringMatching(
        /credential-and-privilege launch boundary/i,
      ),
    });
  });

  it("handshakes, starts a thread and turn, sanitizes events, and omits an unset model", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-model-omitted",
        "--expect-constrained-turn",
      ],
      model: undefined,
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    const events = await collect(compiler.compileLab(labInput()));

    expect(events).toContainEqual({
      type: "status",
      phase: "initialize",
      status: "completed",
    });
    expect(events).toContainEqual({
      type: "status",
      phase: "thread",
      status: "completed",
      detail: "model:installed-compatible-default",
    });
    expect(events).toContainEqual({
      type: "plan_summary",
      summary: "Create the constrained adapter.",
    });
    expect(events.map((event) => String(event.type))).not.toContain(
      "reasoning",
    );
    expect(events).toContainEqual({
      type: "final_status",
      status: "completed",
      threadId: "thread_test",
      turnId: "turn_test",
      durationMs: 123,
    });
  });

  it("uses the boundary-provided guest workspace for protocol confinement", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-cwd=/workspace",
        "--expect-constrained-turn",
      ],
      timeoutMs: 2_000,
      launchBoundary: {
        async health() {
          return { available: true as const };
        },
        async prepare(request) {
          expect(request.hostCwd).toBe(generationDirectory);
          return {
            command: request.command,
            args: request.args,
            environment: request.environment,
            protocolCwd: "/workspace",
          };
        },
      },
    });

    const events = await collect(compiler.compileLab(labInput()));
    expect(events).toContainEqual({
      type: "status",
      phase: "generate",
      status: "completed",
    });
  });

  it("revokes staged credentials before starting a model thread", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    let revoked = false;
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer, "--expect-constrained-turn"],
      timeoutMs: 2_000,
      launchBoundary: {
        async health() {
          return { available: true as const };
        },
        async prepare(request) {
          return {
            command: request.command,
            args: request.args,
            environment: request.environment,
            protocolCwd: request.hostCwd,
            async revokeCredentials() {
              revoked = true;
            },
          };
        },
      },
    });

    await collect(compiler.compileLab(labInput()));
    expect(revoked).toBe(true);
  });

  it("passes CODEX_MODEL only when explicitly configured", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer, "--expect-model=gpt-5.6-codex"],
      model: "gpt-5.6-codex",
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    const events = await collect(compiler.compileLab(labInput()));
    expect(events).toContainEqual({
      type: "status",
      phase: "thread",
      status: "completed",
      detail: "model:gpt-5.6-codex",
    });
  });

  it("terminates a silent process and returns a typed timeout", async () => {
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 50,
      ...unisolatedTestProcess,
    });

    await expect(
      collect(compiler.compileLab(labInput())),
    ).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_TIMEOUT",
    });
  });

  it("terminates an active App Server turn when the runner cancels it", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer, "--silent-turn"],
      timeoutMs: 5_000,
      ...unisolatedTestProcess,
    });
    const controller = new AbortController();
    const compilation = collect(
      compiler.compileLab(labInput(), { signal: controller.signal }),
    );
    setTimeout(() => controller.abort(), 50);

    await expect(compilation).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_CANCELLED",
    });
  });

  it("escalates cancellation when an App Server ignores SIGTERM", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-codex-cancel-"));
    const pidFile = join(work, "app-server.pid");
    let processId: number | undefined;
    let disposedAfterExit = false;
    try {
      const compiler = new AppServerCodexCompiler({
        command: process.execPath,
        commandArgs: [
          fakeServer,
          "--silent-turn",
          `--ignore-sigterm=${pidFile}`,
        ],
        timeoutMs: 5_000,
        launchBoundary: {
          async health() {
            return { available: true as const };
          },
          async prepare(request) {
            return {
              command: request.command,
              args: request.args,
              environment: request.environment,
              protocolCwd: request.hostCwd,
              async dispose() {
                expect(() => process.kill(processId!, 0)).toThrow();
                disposedAfterExit = true;
              },
            };
          },
        },
      });
      const controller = new AbortController();
      const compilation = collect(
        compiler.compileLab(labInput(), { signal: controller.signal }),
      );
      await new Promise((resolve) => setTimeout(resolve, 50));
      processId = Number(await readFile(pidFile, "utf8"));
      controller.abort();

      await expect(compilation).rejects.toMatchObject({
        name: "CompilerSetupError",
        code: "CODEX_CANCELLED",
      });
      expect(() => process.kill(processId!, 0)).toThrow();
      expect(disposedAfterExit).toBe(true);
    } finally {
      if (processId !== undefined) {
        try {
          process.kill(processId, "SIGKILL");
        } catch {
          // The expected path has already reaped the test process.
        }
      }
      await rm(work, { recursive: true, force: true });
    }
  });

  it("denies interactive server requests instead of forwarding approvals", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer, "--request-approval"],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    await expect(
      collect(compiler.compileLab(labInput())),
    ).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_PROTOCOL_ERROR",
      message: expect.stringMatching(/disallowed interaction/i),
    });
  });

  it("returns a typed invalid-input error before spawning", async () => {
    const compiler = new AppServerCodexCompiler({
      command: "/definitely/not/a/real/codex",
      timeoutMs: 50,
      ...unisolatedTestProcess,
    });
    const invalid = { ...labInput(), sessionId: "../escape" };

    await expect(collect(compiler.compileLab(invalid))).rejects.toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_INVALID_INPUT",
    });
  });

  it("fails closed without labelling a failed turn as completed", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer, "--failed-turn"],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    const events: CompilerEvent[] = [];
    let failure: unknown;
    try {
      for await (const event of compiler.compileLab(labInput())) {
        events.push(event);
      }
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: "CompilerSetupError",
      code: "CODEX_TURN_FAILED",
    });
    expect(events).toContainEqual({
      type: "status",
      phase: "generate",
      status: "failed",
    });
    expect(events).not.toContainEqual({
      type: "status",
      phase: "generate",
      status: "completed",
    });
  });

  it("streams only structured verifier feedback into either repair attempt", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });
    const repair: RepairLabInput = {
      ...labInput(),
      repairAttempt: 1,
      previousArtifactHashes: {
        "artifact-adapter.py": "b".repeat(64),
      },
      verifierCounterexamples: [
        {
          invariant: "group_split_zero_overlap",
          observed: { overlap: 4 },
          counterexample: { customerIds: ["customer_001"] },
        },
      ],
    };

    const events = await collect(compiler.repairLab(repair));
    expect(events[0]).toEqual({
      type: "verifier_counterexample",
      invariant: "group_split_zero_overlap",
      observed: { overlap: 4 },
      counterexample: { customerIds: ["customer_001"] },
    });
    expect(events).toContainEqual({
      type: "status",
      phase: "repair",
      status: "completed",
    });
  });

  it("runs patch compilation as a separate bounded turn", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [fakeServer],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    const events = await collect(compiler.compilePatch(patchInput()));
    expect(events).toContainEqual({
      type: "status",
      phase: "patch",
      status: "completed",
    });
  });

  it("reports executable availability without starting an App Server turn", async () => {
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      healthCommand: process.execPath,
      healthArgs: ["--version"],
      model: "gpt-5.6-codex",
      ...unisolatedTestProcess,
    });
    expect(await compiler.health()).toMatchObject({
      mode: "live",
      available: true,
      model: "gpt-5.6-codex",
    });
  });
});
