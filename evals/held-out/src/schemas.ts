import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ConceptSchema = z.enum(["entity_leakage", "class_imbalance"]);
const FamilySchema = z.enum([
  "entity_leakage",
  "class_imbalance",
  "unsupported",
]);

export const ReviewLabelSchema = z
  .object({
    schemaVersion: z.literal("1"),
    caseId: z.string().regex(/^[a-z0-9_]+$/),
    fileName: z.string().regex(/^[a-z0-9-]+\.ipynb$/),
    family: FamilySchema,
    variation: z.string().min(1),
    labelSource: z.literal("deterministic_case_spec"),
    humanReview: z
      .object({
        status: z.enum(["PENDING", "REVIEWED", "ADJUDICATED"]),
        reviewerId: z.string().min(1).nullable(),
        reviewedAt: z.string().datetime().nullable(),
        notes: z.string().max(2_000).nullable(),
      })
      .strict(),
    notebookSha256: Sha256Schema,
    expected: z
      .object({
        supportStatus: z.enum(["SUPPORTED", "PARTIAL", "UNSUPPORTED"]),
        concept: ConceptSchema.nullable(),
        requiredMetricNames: z.array(z.string().min(1)),
        requiredSymbols: z.array(z.string().min(1)),
        requiredPackageHints: z.array(z.string().min(1)),
        requiredSupportReasonCodes: z.array(z.string().min(1)),
      })
      .strict(),
  })
  .strict();

export const ReviewLabelFileSchema = z
  .object({
    schemaVersion: z.literal("1"),
    generatedAt: z.string().datetime(),
    generator: z.literal("scripts/generate-held-out-notebooks.py"),
    seed: z.number().int(),
    labels: z.array(ReviewLabelSchema).length(10),
  })
  .strict();

const FamilyCountSchema = z
  .object({
    passed: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  })
  .strict();

export const HeldOutBenchmarkResultSchema = z
  .object({
    schemaVersion: z.literal("2"),
    benchmarkId: z.literal("counterlab-held-out-v2"),
    executedAt: z.string().datetime(),
    parser: z.literal("@counterlab/notebook-parser"),
    executionMode: z.literal("safe_parse_plus_fixed_contract_completion"),
    labelsSha256: Sha256Schema,
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        passed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        byFamily: z
          .object({
            entity_leakage: FamilyCountSchema,
            class_imbalance: FamilyCountSchema,
            unsupported: FamilyCountSchema,
          })
          .strict(),
        supportedCompletion: FamilyCountSchema,
      })
      .strict(),
    cases: z.array(
      z
        .object({
          caseId: z.string(),
          fileName: z.string(),
          family: FamilySchema,
          variation: z.string(),
          humanReviewStatus: z.enum(["PENDING", "REVIEWED", "ADJUDICATED"]),
          executedParser: z.literal(true),
          expected: z
            .object({
              supportStatus: z.enum(["SUPPORTED", "PARTIAL", "UNSUPPORTED"]),
              concept: ConceptSchema.nullable(),
            })
            .strict(),
          observed: z
            .object({
              supportStatus: z.enum(["SUPPORTED", "PARTIAL", "UNSUPPORTED"]),
              concept: ConceptSchema.nullable(),
              metricNames: z.array(z.string()),
              symbols: z.array(z.string()),
              packageHints: z.array(z.string()),
              supportReasonCodes: z.array(z.string()),
              fileSha256: Sha256Schema,
            })
            .strict(),
          checks: z
            .object({
              notebookHashMatches: z.boolean(),
              supportStatusMatches: z.boolean(),
              conceptMatches: z.boolean(),
              metricsPresent: z.boolean(),
              symbolsPresent: z.boolean(),
              packagesPresent: z.boolean(),
              supportReasonsMatch: z.boolean(),
              stableEvidenceReferences: z.boolean(),
            })
            .strict(),
          completion: z
            .object({
              attempted: z.boolean(),
              planSource: z.literal("deterministic_contract_probe"),
              planVerified: z.boolean(),
              resultVerified: z.boolean(),
              transferPassed: z.boolean(),
              patchVerified: z.boolean(),
              unchangedCellCount: z.number().int().nonnegative(),
              resultHash: Sha256Schema.nullable(),
              patchHash: Sha256Schema.nullable(),
              durationMs: z.number().int().nonnegative(),
              failureCode: z.string().min(1).nullable(),
            })
            .strict(),
          passed: z.boolean(),
        })
        .strict(),
    ),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

export type ReviewLabel = z.infer<typeof ReviewLabelSchema>;
export type HeldOutBenchmarkResult = z.infer<
  typeof HeldOutBenchmarkResultSchema
>;
