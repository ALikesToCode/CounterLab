import { z } from "zod";

import {
  AllowedMetricSchema,
  ConceptIdSchema,
  FixedOperationIdSchema,
} from "@counterlab/contracts";

const TokenIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9._:-]{0,95}$/, "expected a lowercase token");
const ReasonCodeSchema = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]{0,95}$/, "expected an uppercase reason code");

const PatternSeparationSchema = z
  .object({
    currentPatternId: TokenIdSchema,
    competingPatternId: TokenIdSchema,
    separation: z.number().finite().min(0).max(1),
  })
  .strict();

export const ExperimentScoringPolicySchema = z
  .object({
    schemaVersion: z.literal("1"),
    policyVersion: TokenIdSchema,
    concept: ConceptIdSchema,
    allowedOperationIds: z.array(FixedOperationIdSchema).min(1).max(20),
    requiredOperationIds: z.array(FixedOperationIdSchema).min(1).max(12),
    requiredControlIds: z.array(TokenIdSchema).min(1).max(20),
    allowedChangedVariableIds: z.array(TokenIdSchema).min(1).max(12),
    requiredObservableIds: z.array(AllowedMetricSchema).min(1).max(12),
    allowedObservableIds: z.array(AllowedMetricSchema).min(1).max(20),
    patternSeparations: z.array(PatternSeparationSchema).min(1).max(24),
    minimumSeparation: z.number().finite().min(0).max(1),
    maximumComplexityCost: z.number().finite().positive().max(100),
    complexityWeight: z.number().finite().min(0).max(1),
    scorerVersion: TokenIdSchema,
  })
  .strict()
  .superRefine((policy, context) => {
    const allowedOperations = new Set(policy.allowedOperationIds);
    for (const [index, operation] of policy.requiredOperationIds.entries()) {
      if (!allowedOperations.has(operation)) {
        context.addIssue({
          code: "custom",
          message: "required operation must also be allowed",
          path: ["requiredOperationIds", index],
        });
      }
    }
    const allowedObservables = new Set(policy.allowedObservableIds);
    for (const [index, observable] of policy.requiredObservableIds.entries()) {
      if (!allowedObservables.has(observable)) {
        context.addIssue({
          code: "custom",
          message: "required observable must also be allowed",
          path: ["requiredObservableIds", index],
        });
      }
    }
    const pairs = new Set<string>();
    for (const [index, pattern] of policy.patternSeparations.entries()) {
      const key = `${pattern.currentPatternId}:${pattern.competingPatternId}`;
      if (pairs.has(key)) {
        context.addIssue({
          code: "custom",
          message: "pattern separation pairs must be unique",
          path: ["patternSeparations", index],
        });
      }
      pairs.add(key);
    }
  });

export type ExperimentScoringPolicy = z.infer<
  typeof ExperimentScoringPolicySchema
>;

export const ExperimentSelectionSchema = z
  .object({
    eligibleCandidateIds: z.array(TokenIdSchema).max(8),
    rejectedCandidates: z
      .array(
        z
          .object({
            candidateId: TokenIdSchema,
            reasonCodes: z.array(ReasonCodeSchema).min(1).max(12),
          })
          .strict(),
      )
      .max(8),
    selectedCandidateId: TokenIdSchema.nullable(),
    minimumSeparation: z.number().finite().min(0).max(1),
    requiredSeparation: z.number().finite().min(0).max(1),
    complexityCost: z.number().finite().min(0).max(100),
    normalizedScore: z.number().finite().min(0).max(1),
    scorerVersion: TokenIdSchema,
  })
  .strict();

export type ExperimentSelection = z.infer<typeof ExperimentSelectionSchema>;
