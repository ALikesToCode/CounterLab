import {
  ExperimentPlanV2Schema,
  type ExperimentPlanV2,
} from "@counterlab/contracts";

import { ExperimentIRV5Schema, type ExperimentIRV5 } from "./schema.js";

interface LegacyMigrationOptions {
  beliefSpecHash: string;
  sourcePlanHash: string;
  transfer: ExperimentIRV5["transfer"];
}

function token(value: string, prefix: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .slice(0, 80);
  return `${prefix}.${normalized.length === 0 ? "legacy" : normalized}`;
}

export function migrateExperimentPlanV2ToIRV5(
  value: unknown,
  options: LegacyMigrationOptions,
): ExperimentIRV5 {
  const plan = ExperimentPlanV2Schema.parse(value);
  const candidateId = token(plan.planId, "legacy-candidate");
  const conditionId = "legacy.unmapped-outcome";
  const patterns = plan.expectedPatterns.map((pattern) => ({
    hypothesisId: pattern.hypothesisId,
    patternId: `legacy.${pattern.hypothesisId}`,
  })) as [
    { hypothesisId: "current"; patternId: string },
    { hypothesisId: "competing"; patternId: string },
  ];

  return ExperimentIRV5Schema.parse({
    schemaVersion: "5",
    irId: token(plan.planId, "ir"),
    executionPlanId: plan.planId,
    sessionId: plan.sessionId,
    concept: plan.concept,
    conceptPackVersion: plan.conceptPackVersion,
    artifactManifestHash: plan.artifactManifestHash,
    beliefSpecId: plan.beliefTestId,
    beliefSpecHash: options.beliefSpecHash,
    evidenceRefs: plan.evidenceRefs,
    hypotheses: plan.expectedPatterns.map((pattern) => ({
      id: pattern.hypothesisId,
      statement: pattern.qualitativeOutcome,
      conditions: plan.controlledVariables.map(
        (variable) => `${variable} remains controlled.`,
      ),
      nonClaims: plan.nonClaims,
      predictedPattern: {
        patternId: `legacy.${pattern.hypothesisId}`,
        description: pattern.qualitativeOutcome,
      },
    })),
    candidateExperiments: [
      {
        id: candidateId,
        title: "Legacy Experiment Plan v2 execution",
        operationIds: [
          ...new Set([
            plan.baseline.operation,
            ...plan.interventions.map((run) => run.operation),
          ]),
        ],
        baseline: plan.baseline,
        interventions: plan.interventions,
        heldConstantIds: plan.controlledVariables.map((value) =>
          token(value, "control"),
        ),
        changedVariableIds: plan.changedVariables.map((value) =>
          token(value, "change"),
        ),
        observableIds: plan.metrics,
        hypothesisPatterns: patterns,
        inconclusiveConditionIds: [conditionId],
        complexityCost: plan.interventions.length + 1,
        discriminatesBecause: plan.discriminatesBecause,
      },
    ],
    selection: {
      status: "LEGACY_SELECTED",
      candidateId,
      adapterVersion: "legacy-plan-v2-adapter-v1",
      notRescored: true,
    },
    visualizations: plan.visualizations,
    inconclusiveConditions: [
      {
        id: conditionId,
        description:
          "The legacy plan did not encode an explicit inconclusive decision boundary.",
      },
    ],
    transfer: options.transfer,
    nonClaims: plan.nonClaims,
    provenance: {
      kind: "legacy_plan_v2",
      generatorId: "legacy-plan-v2-adapter-v1",
      sourcePlanHash: options.sourcePlanHash,
      inputHashes: [
        plan.artifactManifestHash,
        options.beliefSpecHash,
        options.sourcePlanHash,
      ],
    },
    limitations: [
      "Adapted from Experiment Plan v2; the fixed v5 experiment scorer was not run.",
    ],
    resourceLimits: plan.resourceLimits,
  });
}

export function projectExperimentIRV5ToPlanV2(
  value: unknown,
): ExperimentPlanV2 {
  const ir = ExperimentIRV5Schema.parse(value);
  const selection = ir.selection;
  if (selection.status === "UNSELECTED") {
    throw new Error(
      "Experiment IR must have a selected candidate before execution",
    );
  }
  const selectedCandidateId = selection.candidateId;
  const candidate = ir.candidateExperiments.find(
    (item) => item.id === selectedCandidateId,
  );
  if (candidate === undefined) {
    throw new Error("Selected Experiment IR candidate does not resolve");
  }

  return ExperimentPlanV2Schema.parse({
    schemaVersion: "2",
    planId: ir.executionPlanId,
    sessionId: ir.sessionId,
    concept: ir.concept,
    conceptPackVersion: ir.conceptPackVersion,
    artifactManifestHash: ir.artifactManifestHash,
    beliefTestId: ir.beliefSpecId,
    evidenceRefs: ir.evidenceRefs,
    baseline: candidate.baseline,
    interventions: candidate.interventions,
    controlledVariables: candidate.heldConstantIds.map((value) =>
      value.startsWith("control.") ? value.slice("control.".length) : value,
    ),
    changedVariables: candidate.changedVariableIds.map((value) =>
      value.startsWith("change.") ? value.slice("change.".length) : value,
    ),
    metrics: candidate.observableIds,
    visualizations: ir.visualizations,
    discriminatesBecause: candidate.discriminatesBecause,
    expectedPatterns: ir.hypotheses.map((hypothesis) => ({
      hypothesisId: hypothesis.id,
      qualitativeOutcome: hypothesis.predictedPattern.description,
    })),
    nonClaims: ir.nonClaims,
    resourceLimits: ir.resourceLimits,
  });
}
