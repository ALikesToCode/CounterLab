import { z } from "zod";

export const JsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

const JsonObjectSchema = z.record(z.string(), JsonValueSchema);

export const ResourceLimitsSchema = z
  .object({
    wallSeconds: z.number().int().positive().max(300),
    memoryMb: z.number().int().positive().max(4096),
    maxProcesses: z.number().int().positive().max(32),
    maxFiles: z.number().int().positive().max(256),
    maxOutputBytes: z.number().int().positive().max(16_777_216),
  })
  .strict();

const EvidenceReferenceSchema = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/i),
    cellIndex: z.number().int().nonnegative().optional(),
    outputIndex: z.number().int().nonnegative().optional(),
    kind: z.string().max(64).optional(),
    excerpt: z.string().max(2_000).optional(),
  })
  .passthrough();

const BaseCompilationSchema = z.object({
  sessionId: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
  generationDirectory: z.string().min(1).max(4_096),
});

export const CompileLabInputSchema = BaseCompilationSchema.extend({
  approvedBeliefTest: JsonObjectSchema,
  experimentPlanSchema: JsonObjectSchema,
  conceptPackDocumentation: z.string().min(1).max(50_000),
  fixtureSchema: JsonObjectSchema,
  evidenceReferences: z.array(EvidenceReferenceSchema).max(32),
  resourceLimits: ResourceLimitsSchema,
  permittedFiles: z
    .array(
      z
        .string()
        .min(1)
        .max(128)
        .regex(/^[A-Za-z0-9_.-]+$/),
    )
    .length(3),
  permittedCommands: z.array(z.string().min(1).max(512)).max(16),
}).strict();

export type CompileLabInput = z.infer<typeof CompileLabInputSchema>;

export const HostedPlanResourceLimitsSchema = z
  .object({
    wallSeconds: z.number().int().positive().max(120),
    memoryMb: z.number().int().min(128).max(2_048),
    maxRuns: z.number().int().positive().max(8),
  })
  .strict();

const HostedConceptPackSchema = z
  .object({
    id: z.enum(["entity_leakage", "class_imbalance"]),
    version: z.string().min(1).max(64),
    title: z.string().min(1).max(160),
    allowedOperations: z.array(z.string().min(1).max(128)).min(1).max(16),
    allowedMetrics: z.array(z.string().min(1).max(64)).min(1).max(16),
    allowedVisualizations: z.array(z.string().min(1).max(64)).min(1).max(16),
    verifierInvariants: z.array(z.string().min(1).max(128)).min(1).max(24),
  })
  .strict();

export const CompileHostedExperimentPlanInputSchema =
  BaseCompilationSchema.extend({
    approvedBeliefTest: JsonObjectSchema,
    artifactManifest: JsonObjectSchema,
    conceptPack: HostedConceptPackSchema,
    experimentPlanSchema: JsonObjectSchema,
    resourceLimits: HostedPlanResourceLimitsSchema,
    permittedOutputs: z.array(z.string().min(1).max(128)).length(2),
  }).strict();

export type CompileHostedExperimentPlanInput = z.infer<
  typeof CompileHostedExperimentPlanInputSchema
>;

const VerifierCounterexampleSchema = z
  .object({
    invariant: z.string().min(1).max(128),
    observed: JsonValueSchema,
    counterexample: JsonValueSchema,
  })
  .strict();

export const RepairLabInputSchema = CompileLabInputSchema.extend({
  repairAttempt: z.union([z.literal(1), z.literal(2)]),
  verifierCounterexamples: z.array(VerifierCounterexampleSchema).min(1).max(24),
  previousArtifactHashes: z.record(
    z.string(),
    z.string().regex(/^[a-f0-9]{64}$/i),
  ),
}).strict();

export type RepairLabInput = z.infer<typeof RepairLabInputSchema>;

const HostedVerifierCounterexampleSchema = z
  .object({
    invariant: z.string().min(1).max(128),
    observed: JsonValueSchema,
    expected: JsonValueSchema,
    counterexample: z.string().min(1).max(2_000),
  })
  .strict();

export const RepairHostedExperimentPlanInputSchema =
  CompileHostedExperimentPlanInputSchema.extend({
    repairAttempt: z.union([z.literal(1), z.literal(2)]),
    verifierCounterexamples: z
      .array(HostedVerifierCounterexampleSchema)
      .min(1)
      .max(24),
    previousOutputHashes: z.record(
      z.string(),
      z.string().regex(/^[a-f0-9]{64}$/i),
    ),
  }).strict();

export type RepairHostedExperimentPlanInput = z.infer<
  typeof RepairHostedExperimentPlanInputSchema
>;

export const CompileHostedPatchPlanInputSchema = BaseCompilationSchema.extend({
  approvedBeliefTest: JsonObjectSchema,
  artifactManifest: JsonObjectSchema,
  verifiedResultSummary: JsonObjectSchema,
  transferSummary: JsonObjectSchema,
  patchContract: JsonObjectSchema,
  allowedCellIndices: z.array(z.number().int().nonnegative()).min(1).max(4),
  patchPlanSchema: JsonObjectSchema,
  resourceLimits: HostedPlanResourceLimitsSchema,
  permittedOutputs: z.array(z.string().min(1).max(128)).length(2),
}).strict();

export type CompileHostedPatchPlanInput = z.infer<
  typeof CompileHostedPatchPlanInputSchema
>;

export const RepairHostedPatchPlanInputSchema =
  CompileHostedPatchPlanInputSchema.extend({
    repairAttempt: z.union([z.literal(1), z.literal(2)]),
    verifierCounterexamples: z
      .array(HostedVerifierCounterexampleSchema)
      .min(1)
      .max(24),
    previousOutputHashes: z.record(
      z.string(),
      z.string().regex(/^[a-f0-9]{64}$/i),
    ),
  }).strict();

export type RepairHostedPatchPlanInput = z.infer<
  typeof RepairHostedPatchPlanInputSchema
>;

export const CompilePatchInputSchema = BaseCompilationSchema.extend({
  approvedBeliefTest: JsonObjectSchema,
  verifiedResult: JsonObjectSchema,
  transferResult: JsonObjectSchema,
  notebookCopyFileName: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9_.-]+\.ipynb$/),
  allowedCellIndices: z.array(z.number().int().nonnegative()).min(1).max(32),
  patchMetadataFileName: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_.-]+\.json$/),
  resourceLimits: ResourceLimitsSchema,
  permittedCommands: z.array(z.string().min(1).max(512)).max(16),
}).strict();

export type CompilePatchInput = z.infer<typeof CompilePatchInputSchema>;

export const CompilerEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("status"),
      phase: z.enum([
        "initialize",
        "thread",
        "plan",
        "generate",
        "public_tests",
        "verify",
        "repair",
        "patch",
      ]),
      status: z.enum(["started", "completed", "failed"]),
      detail: z.string().max(512).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("plan_summary"),
      summary: z.string().max(4_000),
    })
    .strict(),
  z
    .object({
      type: z.literal("file_change"),
      files: z.array(z.string().max(255)).max(16),
      unifiedDiff: z.string().max(64_000),
      status: z.enum(["started", "updated", "completed", "failed"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("command"),
      command: z.string().max(1_024),
      outputExcerpt: z.string().max(4_001),
      durationMs: z.number().int().nonnegative().nullable(),
      exitCode: z.number().int().nullable(),
      status: z.enum(["inProgress", "completed", "failed", "declined"]),
    })
    .strict(),
  z
    .object({
      type: z.literal("verifier_counterexample"),
      invariant: z.string().max(128),
      observed: JsonValueSchema,
      counterexample: JsonValueSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal("final_status"),
      status: z.enum([
        "completed",
        "verified",
        "rejected",
        "failed",
        "interrupted",
      ]),
      threadId: z.string().max(256),
      turnId: z.string().max(256),
      durationMs: z.number().int().nonnegative().optional(),
      error: z.string().max(1_000).optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("usage"),
      inputTokens: z.number().int().nonnegative(),
      cachedInputTokens: z.number().int().nonnegative(),
      outputTokens: z.number().int().nonnegative(),
      reasoningOutputTokens: z.number().int().nonnegative(),
      totalTokens: z.number().int().nonnegative(),
      modelContextWindow: z.number().int().positive().nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal("replay_metadata"),
      replayId: z.string().min(1).max(128),
      recordedAt: z.string().datetime(),
      model: z.string().min(1).max(256),
    })
    .strict(),
]);

export type CompilerEvent = z.infer<typeof CompilerEventSchema>;

export type CompilerHealth =
  | {
      mode: "live";
      available: true;
      version: string;
      model?: string;
    }
  | {
      mode: "live";
      available: false;
      reason: string;
      model?: string;
    }
  | {
      mode: "replay";
      available: true;
      replayId: string;
      recordedAt: string;
      model: string;
    }
  | { mode: "disabled"; available: false; reason: string };

export interface CodexCompiler {
  compileLab(input: CompileLabInput): AsyncIterable<CompilerEvent>;
  repairLab(input: RepairLabInput): AsyncIterable<CompilerEvent>;
  compilePatch(input: CompilePatchInput): AsyncIterable<CompilerEvent>;
  compileExperimentPlan(
    input: CompileHostedExperimentPlanInput,
  ): AsyncIterable<CompilerEvent>;
  repairExperimentPlan(
    input: RepairHostedExperimentPlanInput,
  ): AsyncIterable<CompilerEvent>;
  compileHostedPatchPlan(
    input: CompileHostedPatchPlanInput,
  ): AsyncIterable<CompilerEvent>;
  repairHostedPatchPlan(
    input: RepairHostedPatchPlanInput,
  ): AsyncIterable<CompilerEvent>;
  health(): Promise<CompilerHealth>;
}

export type CompilerSetupErrorCode =
  | "CODEX_DISABLED"
  | "CODEX_NOT_FOUND"
  | "CODEX_SPAWN_FAILED"
  | "CODEX_TIMEOUT"
  | "CODEX_PROTOCOL_ERROR"
  | "CODEX_PROCESS_EXITED"
  | "CODEX_ISOLATION_UNAVAILABLE"
  | "CODEX_INVALID_INPUT";

export class CompilerSetupError extends Error {
  readonly code: CompilerSetupErrorCode;

  constructor(
    code: CompilerSetupErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CompilerSetupError";
    this.code = code;
  }
}
