import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  CodexCompiler,
  CompileHostedExperimentPlanInput,
  CompileLabInput,
  CompilePatchInput,
  CompilerEvent,
  CompilerHealth,
  RepairHostedExperimentPlanInput,
  RepairLabInput,
} from "@counterlab/codex-client";
import {
  RunnerLabCompileBundleSchema,
  type PublicCompilerEvent,
  type RunnerCallback,
  type RunnerLabCompileBundle,
} from "@counterlab/contracts";
import { afterEach, describe, expect, it } from "vitest";

import {
  HostedRunnerJobProcessor,
  type CandidateDecision,
  type RunnerControlPlane,
} from "./job-processor.js";

const workspaces: string[] = [];

function bundle(jobId = "runner_job_1"): RunnerLabCompileBundle {
  const sourceHash = "a".repeat(64);
  const outputHash = "b".repeat(64);
  const beliefId = "belief_1";
  return RunnerLabCompileBundleSchema.parse({
    schemaVersion: "1",
    kind: "LAB_COMPILE",
    jobId,
    sessionId: "session_1",
    stateVersion: 5,
    artifactManifestHash: "c".repeat(64),
    approvedBeliefTest: {
      schemaVersion: "1",
      id: beliefId,
      concept: "entity_leakage",
      learnerClaim: "The row split proves performance for unseen accounts.",
      currentHypothesis: {
        statement: "Row accuracy generalizes to unseen accounts.",
        predictedOutcome: "The group score stays similarly high.",
      },
      competingHypothesis: {
        statement: "Repeated account identity inflates the row split.",
        predictedOutcome: "The group score falls when overlap reaches zero.",
      },
      evidenceRefs: [
        {
          cellIndex: 1,
          kind: "code",
          hash: sourceHash,
          excerpt: "train_test_split(X, y)",
          relevance: "This cell defines the row-wise evaluation split.",
        },
        {
          cellIndex: 1,
          outputIndex: 0,
          kind: "metric",
          hash: outputHash,
          excerpt: "accuracy: 0.98",
          relevance: "This is the displayed result behind the claim.",
        },
      ],
      alternatives: [],
      decisiveIntervention: {
        id: "group_holdout",
        description: "Hold out complete accounts.",
        controlledVariables: ["model", "seed"],
        changedVariables: ["split strategy"],
        discriminatesBecause: "Only identity availability changes.",
      },
      uncertainty: {
        confidence: 0.9,
        limitations: ["This evaluates the documented fixture only."],
        insufficientEvidence: false,
      },
      requiresLearnerConfirmation: true,
    },
    prediction: {
      schemaVersion: "1",
      id: "prediction_1",
      sessionId: "session_1",
      beliefTestId: beliefId,
      choice: "The group score remains high.",
      confidence: 75,
      committedAt: "2026-07-14T10:00:00.000Z",
      immutableHash: "d".repeat(64),
    },
    artifactManifest: {
      artifactId: "artifact_1",
      fileName: "accounts.ipynb",
      fileSha256: "e".repeat(64),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [
        {
          index: 1,
          type: "code",
          sourceSha256: sourceHash,
          sourceExcerpt: "train_test_split(X, y)",
          executionCount: 2,
          outputHashes: [outputHash],
          symbols: ["train_test_split"],
          metricCandidates: [{ name: "accuracy", value: 0.98, outputIndex: 0 }],
        },
      ],
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
        rowCount: 800,
        entityCandidates: ["account_id"],
        targetCandidates: ["cancelled"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-14T10:00:00.000Z",
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
      verifierInvariants: ["zero_group_overlap"],
    },
    experimentPlanSchema: { type: "object" },
    resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    permittedOutputs: ["experiment-plan.json", "public-rationale.md"],
  });
}

class FakeCompiler implements CodexCompiler {
  compileCalls = 0;
  repairCalls: RepairHostedExperimentPlanInput[] = [];

  constructor(
    private readonly plan: Record<string, unknown>,
    private readonly forbiddenFile = false,
  ) {}

  health(): Promise<CompilerHealth> {
    return Promise.resolve({ mode: "live", available: true, version: "test" });
  }

  async *compileExperimentPlan(
    input: CompileHostedExperimentPlanInput,
  ): AsyncIterable<CompilerEvent> {
    this.compileCalls += 1;
    await this.writeCandidate(input.generationDirectory);
    yield { type: "plan_summary", summary: "Build the fair comparison." };
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_1",
      turnId: "turn_1",
    };
  }

  async *repairExperimentPlan(
    input: RepairHostedExperimentPlanInput,
  ): AsyncIterable<CompilerEvent> {
    this.repairCalls.push(input);
    await this.writeCandidate(input.generationDirectory);
    yield {
      type: "final_status",
      status: "completed",
      threadId: "thread_2",
      turnId: "turn_2",
    };
  }

  async writeCandidate(directory: string): Promise<void> {
    await writeFile(
      join(directory, "experiment-plan.json"),
      JSON.stringify(this.plan),
      "utf8",
    );
    await writeFile(
      join(directory, "public-rationale.md"),
      "A group holdout tests unseen accounts.",
      "utf8",
    );
    if (this.forbiddenFile) {
      await writeFile(join(directory, "artifact-adapter.py"), "bad", "utf8");
    }
  }

  compileLab(_input: CompileLabInput): AsyncIterable<CompilerEvent> {
    throw new Error("not used");
  }
  repairLab(_input: RepairLabInput): AsyncIterable<CompilerEvent> {
    throw new Error("not used");
  }
  compilePatch(_input: CompilePatchInput): AsyncIterable<CompilerEvent> {
    throw new Error("not used");
  }
}

class FakeControlPlane implements RunnerControlPlane {
  readonly events: PublicCompilerEvent[] = [];
  readonly uploads = new Map<string, string>();
  readonly callbacks: RunnerCallback[] = [];
  starts = 0;
  resumes = 0;
  candidateCalls = 0;

  constructor(
    private readonly input: RunnerLabCompileBundle,
    private readonly decisions: CandidateDecision[],
  ) {}

  getInput(): Promise<RunnerLabCompileBundle> {
    return Promise.resolve(this.input);
  }
  start(): Promise<void> {
    this.starts += 1;
    return Promise.resolve();
  }
  resume(): Promise<void> {
    this.resumes += 1;
    return Promise.resolve();
  }
  appendEvent(event: PublicCompilerEvent): Promise<void> {
    this.events.push(structuredClone(event));
    return Promise.resolve();
  }
  upload(path: string, body: string): Promise<{ sha256: string }> {
    this.uploads.set(path, body);
    return Promise.resolve({
      sha256: path.startsWith("experiment") ? "f".repeat(64) : "1".repeat(64),
    });
  }
  candidate(): Promise<CandidateDecision> {
    const decision = this.decisions[this.candidateCalls];
    this.candidateCalls += 1;
    if (decision === undefined) throw new Error("missing candidate decision");
    return Promise.resolve(structuredClone(decision));
  }
  callback(callback: RunnerCallback): Promise<void> {
    this.callbacks.push(structuredClone(callback));
    return Promise.resolve();
  }
}

const verifiedDecision: CandidateDecision = {
  status: "VERIFIED",
  canRepair: false,
  nextCursor: 4,
  counterexamples: [],
};

afterEach(async () => {
  await Promise.all(
    workspaces
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function workspace(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "counterlab-hosted-runner-"));
  workspaces.push(directory);
  return directory;
}

describe("HostedRunnerJobProcessor", () => {
  it("publishes only allow-listed files and completes a verified plan job", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const controlPlane = new FakeControlPlane(bundle(), [verifiedDecision]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_1`,
    });

    await processor.run("runner_job_1");

    expect(compiler.compileCalls).toBe(1);
    expect(controlPlane.starts).toBe(1);
    expect([...controlPlane.uploads.keys()].sort()).toEqual([
      "experiment-plan.json",
      "public-rationale.md",
    ]);
    expect(controlPlane.events.map((event) => event.kind)).toContain(
      "plan.summary",
    );
    expect(controlPlane.callbacks).toHaveLength(1);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 4,
    });
  });

  it("repairs from structured counterexamples and never receives verifier source", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" });
    const rejected: CandidateDecision = {
      status: "REJECTED",
      canRepair: true,
      nextCursor: 3,
      counterexamples: [
        {
          invariant: "zero_group_overlap",
          observed: { overlap: 2 },
          expected: { overlap: 0 },
          counterexample: "Two account IDs appear in both partitions.",
        },
      ],
    };
    const controlPlane = new FakeControlPlane(bundle(), [
      rejected,
      { ...verifiedDecision, nextCursor: 7 },
    ]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_2`,
    });

    await processor.run("runner_job_1");

    expect(controlPlane.resumes).toBe(1);
    expect(compiler.repairCalls).toHaveLength(1);
    expect(compiler.repairCalls[0]?.verifierCounterexamples).toEqual(
      rejected.counterexamples,
    );
    expect(JSON.stringify(compiler.repairCalls[0])).not.toContain(
      "verifier source",
    );
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "VERIFIED",
      finalEventCursor: 7,
    });
  });

  it("fails closed when Codex creates a file outside the hosted allowlist", async () => {
    const compiler = new FakeCompiler({ schemaVersion: "2" }, true);
    const controlPlane = new FakeControlPlane(bundle(), [verifiedDecision]);
    const processor = new HostedRunnerJobProcessor({
      workspaceRoot: await workspace(),
      compiler,
      controlPlane,
      now: () => new Date("2026-07-14T10:00:00.000Z"),
      id: (prefix) => `${prefix}_3`,
    });

    await processor.run("runner_job_1");

    expect(controlPlane.candidateCalls).toBe(0);
    expect(controlPlane.callbacks[0]).toMatchObject({
      status: "FAILED",
      error: { code: "RUNNER_OUTPUT_POLICY", retryable: false },
    });
  });
});
