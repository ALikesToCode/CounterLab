import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  ExperimentPlanV2Schema,
  HostedVerifiedResultSetV2Schema,
  type HostedVerifiedResultSetV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  migrateExperimentPlanV2ToIRV5,
  projectExperimentIRV5ToPlanV2,
} from "@counterlab/experiment-ir";
import {
  applyExperimentSelection,
  scoreExperiments,
} from "@counterlab/experiment-scorer";
import { hashCanonical } from "@counterlab/session-core";

import { evaluateVerifiedEpistemicEvidence } from "./epistemic.js";
import {
  EpistemicVerificationReportV1Schema,
  verifyEpistemicEvidence,
  verifyHostedResultSet,
} from "./index.js";

const digest = (character: string) => character.repeat(64);

const evidence = {
  cellIndex: 2,
  kind: "code" as const,
  hash: digest("a"),
  excerpt: "train_test_split(X, y)",
  relevance: "The evaluation split is row-wise.",
};

const manifest = ArtifactManifestSchema.parse({
  artifactId: "artifact-leakage-epistemic-v2",
  fileName: "customer-leakage-epistemic.ipynb",
  fileSha256: digest("c"),
  nbformat: 4,
  support: { status: "SUPPORTED", reasons: [] },
  cells: [
    {
      index: 2,
      type: "code",
      sourceSha256: digest("a"),
      sourceExcerpt: "train_test_split(X, y)",
      executionCount: 3,
      outputHashes: [digest("9")],
      symbols: ["accuracy_score", "train_test_split"],
      metricCandidates: [{ name: "accuracy", value: 0.985, outputIndex: 0 }],
    },
  ],
  schemaSummary: {
    fields: [
      {
        name: "customer_id",
        inferredType: "string",
        privacyClass: "identifier",
      },
      {
        name: "churned",
        inferredType: "integer",
        privacyClass: "target",
      },
    ],
    rowCount: 1_800,
    entityCandidates: ["customer_id"],
    targetCandidates: ["churned"],
  },
  packageHints: ["sklearn"],
  createdAt: "2026-03-10T12:00:00.000Z",
});

const beliefSpec = BeliefSpecV2Schema.parse({
  schemaVersion: "2",
  id: "belief-1",
  concept: "entity_leakage",
  claim: "The row split proves new-customer generalization.",
  evidenceRefs: [evidence],
  hypotheses: [
    {
      id: "current",
      statement: "Random rows measure new-customer performance.",
      conditions: ["Evaluation units match deployment units."],
      nonClaims: ["No claim is made about distribution shift."],
      evidence: [evidence],
      supportedCandidateExperimentIds: [
        "group-holdout",
        "group-holdout-plus-ablation",
      ],
    },
    {
      id: "competing",
      statement: "Repeated identity inflates random-row performance.",
      conditions: ["Customers repeat across rows."],
      nonClaims: ["Leakage is not claimed for every notebook."],
      evidence: [evidence],
      supportedCandidateExperimentIds: [
        "group-holdout",
        "group-holdout-plus-ablation",
      ],
    },
  ],
  alternatives: [],
  uncertainty: 0.84,
  supportState: "SUPPORTED",
  learnerDecision: "CONFIRMED",
});

const presentation = {
  scope: "unseen customers in the documented fixture",
  learnerFacingClaims: [
    "Zero entity overlap was verified for the group holdout run.",
  ],
};

async function selectedIr() {
  const beliefSpecHash = await hashCanonical(beliefSpec);
  const manifestHash = await hashCanonical(manifest);
  const plan = ExperimentPlanV2Schema.parse({
    schemaVersion: "2",
    planId: "plan-1",
    sessionId: "session-1",
    concept: "entity_leakage",
    conceptPackVersion: "2.0.0",
    artifactManifestHash: manifestHash,
    beliefTestId: beliefSpec.id,
    evidenceRefs: [evidence],
    baseline: {
      concept: "entity_leakage",
      runId: "random",
      operation: "leakage.random_row_split",
      seed: 1729,
      testFraction: 0.25,
      entityField: "customer_id",
      dropIdentity: false,
      model: "logistic_regression",
    },
    interventions: [
      {
        concept: "entity_leakage",
        runId: "group",
        operation: "leakage.group_holdout",
        seed: 1729,
        testFraction: 0.25,
        entityField: "customer_id",
        dropIdentity: false,
        model: "logistic_regression",
      },
    ],
    controlledVariables: ["model", "seed", "test_fraction"],
    changedVariables: ["split_strategy"],
    metrics: ["accuracy", "entity_overlap_rate"],
    visualizations: ["metric_comparison", "entity_overlap"],
    discriminatesBecause:
      "Whole-customer holdout changes only the evaluation unit.",
    expectedPatterns: [
      {
        hypothesisId: "current",
        qualitativeOutcome: "The optimism gap stays small.",
      },
      {
        hypothesisId: "competing",
        qualitativeOutcome: "The optimism gap becomes material.",
      },
    ],
    nonClaims: ["This does not prove all future performance."],
    resourceLimits: { wallSeconds: 45, memoryMb: 512, maxRuns: 4 },
  });
  const migrated = migrateExperimentPlanV2ToIRV5(plan, {
    beliefSpecHash,
    sourcePlanHash: digest("d"),
    transfer: {
      taskId: "forecast-future-leakage-v1",
      changedSurface: "Time-ordered forecasting.",
      requiredActionIds: ["time_ordered_holdout"],
      nonClaims: ["Transfer does not certify mastery."],
    },
  });
  const source = migrated.candidateExperiments[0]!;
  const group = {
    ...source,
    id: "group-holdout",
    heldConstantIds: [
      "model",
      "seed",
      "test_fraction",
      "entity_field",
      "primary_identity_setting",
      "preprocessing",
      "model_hyperparameters",
    ],
    changedVariableIds: ["split_strategy"],
    hypothesisPatterns: [
      { hypothesisId: "current" as const, patternId: "leakage.small-gap" },
      {
        hypothesisId: "competing" as const,
        patternId: "leakage.material-gap",
      },
    ] as const,
    inconclusiveConditionIds: ["gap-within-tolerance"],
    complexityCost: 2,
  };
  const ablation = {
    ...group,
    id: "group-holdout-plus-ablation",
    operationIds: [...group.operationIds, "leakage.identity_ablation" as const],
    interventions: [
      ...group.interventions,
      {
        ...group.interventions[0]!,
        runId: "ablation",
        operation: "leakage.identity_ablation" as const,
        dropIdentity: true,
      },
    ],
    complexityCost: 5,
  };
  const draft = ExperimentIRV5Schema.parse({
    ...migrated,
    hypotheses: [
      {
        ...migrated.hypotheses[0],
        statement: beliefSpec.hypotheses[0].statement,
        conditions: beliefSpec.hypotheses[0].conditions,
        nonClaims: beliefSpec.hypotheses[0].nonClaims,
        predictedPattern: {
          patternId: "leakage.small-gap",
          description: "The optimism gap stays small.",
        },
      },
      {
        ...migrated.hypotheses[1],
        statement: beliefSpec.hypotheses[1].statement,
        conditions: beliefSpec.hypotheses[1].conditions,
        nonClaims: beliefSpec.hypotheses[1].nonClaims,
        predictedPattern: {
          patternId: "leakage.material-gap",
          description: "The optimism gap becomes material.",
        },
      },
    ],
    candidateExperiments: [ablation, group],
    selection: { status: "UNSELECTED" },
    inconclusiveConditions: [
      {
        id: "gap-within-tolerance",
        description: "The measured gap falls between decisive patterns.",
        nextExperimentId: "group-holdout-plus-ablation",
      },
    ],
    provenance: {
      kind: "fixed",
      generatorId: "epistemic-test-fixture-v1",
      inputHashes: [manifestHash, beliefSpecHash],
    },
    limitations: ["Test fixture only."],
  });
  const selection = scoreExperiments({
    beliefSpec,
    beliefSpecHash,
    ir: draft,
    policy: getConceptPack("entity_leakage").scientificMethod.scoringPolicy,
  });
  return applyExperimentSelection(draft, selection);
}

async function resultFor(
  ir: Awaited<ReturnType<typeof selectedIr>>,
): Promise<HostedVerifiedResultSetV2> {
  const plan = projectExperimentIRV5ToPlanV2(ir);
  const fixtureHash = digest("8");
  const runs = [plan.baseline, ...plan.interventions].map((spec) => {
    if (spec.concept !== "entity_leakage") {
      throw new Error("test fixture supports leakage only");
    }
    const grouped = spec.operation === "leakage.group_holdout";
    const ablated = spec.operation === "leakage.identity_ablation";
    return {
      id: spec.runId,
      operation: spec.operation,
      splitStrategy: grouped ? ("group" as const) : ("random" as const),
      groupBy: grouped ? spec.entityField : null,
      dropFeatures: spec.dropIdentity ? [spec.entityField] : [],
      model: spec.model,
      seed: spec.seed,
      inputFingerprint: fixtureHash,
      featureSetFingerprint: spec.dropIdentity ? digest("6") : digest("7"),
      pipelineFingerprint: digest("5"),
      metrics: {
        accuracy: grouped ? 0.59 : ablated ? 0.62 : 0.985,
        rocAuc: grouped ? 0.64 : ablated ? 0.66 : 0.99,
      },
      sampleSizes: { train: 1_350, test: 450 },
      entityCounts: { train: 360, test: 120 },
      entityOverlap: grouped ? { count: 0, rate: 0 } : { count: 120, rate: 1 },
    };
  });
  const withoutHash = {
    schemaVersion: "2" as const,
    concept: "entity_leakage" as const,
    planId: plan.planId,
    sessionId: plan.sessionId,
    artifactManifestHash: plan.artifactManifestHash,
    conceptPackVersion: plan.conceptPackVersion,
    fixture: {
      customers: 480,
      rows: 1_800,
      sha256: fixtureHash,
      targetRate: 0.49,
    },
    kernelVersion: "0.1.0",
    seed: plan.baseline.seed,
    runs,
    chartData: runs.map((run) => ({
      runId: run.id,
      splitStrategy: run.splitStrategy,
      accuracy: run.metrics.accuracy,
      rocAuc: run.metrics.rocAuc,
      sampleSize: run.sampleSizes.test,
      seed: run.seed,
    })),
  };
  return HostedVerifiedResultSetV2Schema.parse({
    ...withoutHash,
    resultHash: await hashCanonical(withoutHash),
  });
}

type Fixture = {
  ir: Awaited<ReturnType<typeof selectedIr>>;
  result: HostedVerifiedResultSetV2;
  presentation: typeof presentation;
};

async function fixture(): Promise<Fixture> {
  const ir = await selectedIr();
  return { ir, result: await resultFor(ir), presentation };
}

async function rehash(
  result: HostedVerifiedResultSetV2,
): Promise<HostedVerifiedResultSetV2> {
  const { resultHash: _resultHash, ...withoutHash } = result;
  return HostedVerifiedResultSetV2Schema.parse({
    ...withoutHash,
    resultHash: await hashCanonical(withoutHash),
  });
}

async function rebindManifest(
  value: Fixture,
  changedManifest: typeof manifest,
): Promise<Fixture> {
  const manifestHash = await hashCanonical(changedManifest);
  const ir = ExperimentIRV5Schema.parse({
    ...value.ir,
    artifactManifestHash: manifestHash,
    provenance: {
      ...value.ir.provenance,
      inputHashes: value.ir.provenance.inputHashes.map((inputHash) =>
        inputHash === value.ir.artifactManifestHash ? manifestHash : inputHash,
      ),
    },
  });
  if (value.result.concept !== "entity_leakage") {
    throw new Error("wrong test concept");
  }
  return {
    ...value,
    ir,
    result: await rehash({
      ...value.result,
      artifactManifestHash: manifestHash,
    }),
  };
}

async function setAccuracies(
  value: Fixture,
  baselineAccuracy: number,
  groupAccuracy: number,
): Promise<Fixture> {
  if (value.result.concept !== "entity_leakage") return value;
  const runs = value.result.runs.map((run) => ({
    ...run,
    metrics: {
      ...run.metrics,
      accuracy:
        run.operation === "leakage.group_holdout"
          ? groupAccuracy
          : baselineAccuracy,
    },
  }));
  const chartData = value.result.chartData.map((row) => ({
    ...row,
    accuracy:
      runs.find((run) => run.id === row.runId)?.metrics.accuracy ??
      row.accuracy,
  }));
  return {
    ...value,
    result: await rehash({ ...value.result, runs, chartData }),
  };
}

async function verify(mutate?: (value: Fixture) => Fixture | Promise<Fixture>) {
  const original = await fixture();
  const candidate = mutate ? await mutate(structuredClone(original)) : original;
  return verifyEpistemicEvidence({
    artifactManifest: manifest,
    sessionId: "session-1",
    beliefSpec,
    ir: candidate.ir,
    result: candidate.result,
    presentation: candidate.presentation,
  });
}

describe("epistemic verifier authority", () => {
  it("derives a scoped supports verdict from the canonical kernel result", async () => {
    const report = await verify();

    expect(report.status).toBe("VERIFIED");
    expect(report.findings).toEqual([]);
    expect(report).toHaveProperty("technicalReport", {
      schemaVersion: "1",
      status: "VERIFIED",
      verifierVersion: "hosted-result-verifier-v1",
      resultHash: report.resultHash,
      invariantCount: expect.any(Number),
      invariants: expect.any(Array),
    });
    expect(report.verdict).toMatchObject({
      kind: "SUPPORTS",
      hypothesisId: "competing",
      resultHash: report.resultHash,
    });
    expect(report.observation).toMatchObject({
      resultHash: report.resultHash,
      outcome: {
        kind: "HYPOTHESIS_PATTERN",
        patternId: "leakage.material-gap",
      },
      technicalVerification: { status: "VERIFIED" },
    });
    expect(report.observation?.observableBindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observableId: "accuracy",
          resultPath: "/runs/1/metrics/accuracy",
        }),
        expect.objectContaining({
          observableId: "entity_overlap_rate",
          resultPath: "/runs/1/entityOverlap/rate",
        }),
      ]),
    );
    expect(EpistemicVerificationReportV1Schema.parse(report)).toEqual(report);
    expect(() =>
      EpistemicVerificationReportV1Schema.parse({
        ...report,
        technicalReportHash: digest("0"),
      }),
    ).toThrow(/authority/i);
  });

  it("derives a real inconclusive verdict from a between-pattern kernel result", async () => {
    const report = await verify((value) => setAccuracies(value, 0.7, 0.64));

    expect(report.status).toBe("VERIFIED");
    expect(report.verdict).toMatchObject({
      kind: "INCONCLUSIVE",
      reasonCode: "GAP_WITHIN_TOLERANCE",
      nextExperimentId: "group-holdout-plus-ablation",
    });
  });

  it("keeps the direct live-result release gate decisive while the epistemic path can represent inconclusive", async () => {
    const value = await setAccuracies(await fixture(), 0.7, 0.64);

    await expect(
      verifyHostedResultSet(
        value.result,
        projectExperimentIRV5ToPlanV2(value.ir),
      ),
    ).rejects.toMatchObject({
      report: {
        status: "REJECTED",
        invariants: expect.arrayContaining([
          expect.objectContaining({
            name: "discriminating_outcomes",
            passed: false,
          }),
        ]),
      },
    });

    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-1",
      beliefSpec,
      ir: value.ir,
      result: value.result,
      presentation: value.presentation,
    });
    expect(report.verdict.kind).toBe("INCONCLUSIVE");
  });

  it("does not accept a caller-supplied verifier policy", async () => {
    const value = await fixture();
    await expect(
      verifyEpistemicEvidence({
        artifactManifest: manifest,
        sessionId: "session-1",
        beliefSpec,
        ir: value.ir,
        result: value.result,
        presentation: value.presentation,
        policy: { approvedClaims: ["anything"] },
      } as never),
    ).rejects.toThrow(/unknown fields/i);
  });

  it("rejects an artifact manifest that does not own the result", async () => {
    const value = await fixture();
    const report = await verifyEpistemicEvidence({
      artifactManifest: { ...manifest, fileName: "another.ipynb" },
      sessionId: "session-1",
      beliefSpec,
      ir: value.ir,
      result: value.result,
      presentation: value.presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "RESULT_BINDING_MISMATCH",
    );
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
  });

  it("rejects a trusted session that does not own the result", async () => {
    const value = await fixture();
    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-other",
      beliefSpec,
      ir: value.ir,
      result: value.result,
      presentation: value.presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "RESULT_BINDING_MISMATCH",
    );
    expect(report.verdict.kind).toBe("REJECTED");
  });

  it("rejects evidence that does not resolve to the bound manifest", async () => {
    const value = await fixture();
    const changedManifest = ArtifactManifestSchema.parse({
      ...manifest,
      cells: manifest.cells.map((cell) => ({
        ...cell,
        sourceSha256: digest("e"),
      })),
    });
    const rebound = await rebindManifest(value, changedManifest);
    const report = await verifyEpistemicEvidence({
      artifactManifest: changedManifest,
      sessionId: "session-1",
      beliefSpec,
      ir: rebound.ir,
      result: rebound.result,
      presentation: value.presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "RESULT_BINDING_MISMATCH",
    );
  });

  it("rejects a manifest that is marked supported but not supported by the selected Subject Pack", async () => {
    const value = await fixture();
    const wrongPackManifest = ArtifactManifestSchema.parse({
      ...manifest,
      schemaSummary: {
        ...manifest.schemaSummary,
        entityCandidates: [],
      },
    });
    const rebound = await rebindManifest(value, wrongPackManifest);
    const report = await verifyEpistemicEvidence({
      artifactManifest: wrongPackManifest,
      sessionId: "session-1",
      beliefSpec,
      ir: rebound.ir,
      result: rebound.result,
      presentation: value.presentation,
    });

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESULT_BINDING_MISMATCH",
          message: expect.stringMatching(/Subject Pack does not support/i),
        }),
      ]),
    );
  });

  it("does not advance an insufficient or unconfirmed Belief Spec", async () => {
    const value = await fixture();
    const unsupported = BeliefSpecV2Schema.parse({
      ...beliefSpec,
      supportState: "INSUFFICIENT_EVIDENCE",
      learnerDecision: "UNDECIDED",
    });
    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-1",
      beliefSpec: unsupported,
      ir: value.ir,
      result: value.result,
      presentation: value.presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "NON_DISCRIMINATING_EXPERIMENT",
    );
    expect(report.verdict.kind).toBe("REJECTED");
  });

  it("does not score primary hypotheses after an alternative is selected", async () => {
    const value = await fixture();
    const alternativeSelected = BeliefSpecV2Schema.parse({
      ...beliefSpec,
      alternatives: [
        {
          id: "alternative-data-shift",
          label: "Data shift",
          statement: "A deployment shift changes the measured relationship.",
          rationale: "This requires a different experiment contract.",
          conditions: ["The future population differs from this fixture."],
          nonClaims: ["No shift has been measured yet."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["distribution-shift-audit"],
        },
      ],
      learnerDecision: "ALTERNATIVE_SELECTED",
      selectedAlternativeId: "alternative-data-shift",
    });
    const report = await verifyEpistemicEvidence({
      artifactManifest: manifest,
      sessionId: "session-1",
      beliefSpec: alternativeSelected,
      ir: value.ir,
      result: value.result,
      presentation: value.presentation,
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "NON_DISCRIMINATING_EXPERIMENT",
    );
    expect(report.verdict.kind).toBe("REJECTED");
  });

  it("rejects a tampered fixed-selection trace", async () => {
    const report = await verify((value) => {
      if (value.ir.selection.status !== "SELECTED") {
        throw new Error("test fixture must be selected");
      }
      return {
        ...value,
        ir: ExperimentIRV5Schema.parse({
          ...value.ir,
          selection: {
            ...value.ir.selection,
            normalizedScore: Math.max(
              0,
              value.ir.selection.normalizedScore - 0.01,
            ),
          },
        }),
      };
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "NON_DISCRIMINATING_EXPERIMENT",
    );
  });

  it("rejects semantic hypothesis drift even when IDs and patterns remain unchanged", async () => {
    const report = await verify((value) => ({
      ...value,
      ir: ExperimentIRV5Schema.parse({
        ...value.ir,
        hypotheses: [
          {
            ...value.ir.hypotheses[0],
            statement:
              "Random rows prove deployment performance for every customer.",
          },
          value.ir.hypotheses[1],
        ],
      }),
    }));

    expect(report.findings.map((finding) => finding.code)).toContain(
      "NON_DISCRIMINATING_EXPERIMENT",
    );
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
  });

  it("rejects provenance that omits the trusted manifest input", async () => {
    const report = await verify((value) => ({
      ...value,
      ir: ExperimentIRV5Schema.parse({
        ...value.ir,
        provenance: {
          ...value.ir.provenance,
          inputHashes: value.ir.provenance.inputHashes.filter(
            (inputHash) => inputHash !== value.ir.artifactManifestHash,
          ),
        },
      }),
    }));

    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESULT_BINDING_MISMATCH",
          message: expect.stringMatching(/provenance/i),
        }),
      ]),
    );
    expect(report.verdict.kind).toBe("REJECTED");
  });

  it("rejects a confounded fixed run even when its technical bytes are valid", async () => {
    const report = await verify(async (value) => {
      const selectedId =
        value.ir.selection.status === "SELECTED"
          ? value.ir.selection.candidateId
          : "";
      const candidates = value.ir.candidateExperiments.map((candidate) =>
        candidate.id !== selectedId
          ? candidate
          : {
              ...candidate,
              interventions: candidate.interventions.map((run) => ({
                ...run,
                seed: 99,
              })),
            },
      );
      const ir = ExperimentIRV5Schema.parse({
        ...value.ir,
        candidateExperiments: candidates,
      });
      if (value.result.concept !== "entity_leakage") return value;
      const changedRunIds = new Set(
        candidates
          .find((candidate) => candidate.id === selectedId)
          ?.interventions.map((run) => run.runId) ?? [],
      );
      const runs = value.result.runs.map((run) =>
        changedRunIds.has(run.id) ? { ...run, seed: 99 } : run,
      );
      const chartData = value.result.chartData.map((row) =>
        changedRunIds.has(row.runId) ? { ...row, seed: 99 } : row,
      );
      return {
        ...value,
        ir,
        result: await rehash({ ...value.result, runs, chartData }),
      };
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "CONFOUNDED_INTERVENTION",
    );
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
  });

  it("rejects a grouped result that hides an undeclared identity ablation", async () => {
    const report = await verify(async (value) => {
      if (value.result.concept !== "entity_leakage") return value;
      const runs = value.result.runs.map((run) =>
        run.operation === "leakage.group_holdout"
          ? {
              ...run,
              dropFeatures: ["customer_id"],
              featureSetFingerprint: digest("6"),
            }
          : run,
      );
      return {
        ...value,
        result: await rehash({ ...value.result, runs }),
      };
    });

    expect(report.findings.map((finding) => finding.code)).toEqual([
      "TECHNICAL_VERIFICATION_FAILED",
    ]);
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
  });

  it("rejects hypothesis patterns that drift from the selected candidate", async () => {
    const report = await verify((value) => ({
      ...value,
      ir: ExperimentIRV5Schema.parse({
        ...value.ir,
        hypotheses: [
          value.ir.hypotheses[0],
          {
            ...value.ir.hypotheses[1],
            predictedPattern: {
              ...value.ir.hypotheses[1].predictedPattern,
              patternId: "leakage.other-material-gap",
            },
          },
        ],
      }),
    }));

    expect(report.findings.map((finding) => finding.code)).toContain(
      "MISSING_DECISIVE_PATTERN",
    );
  });

  it("rejects a valid but unsupported outcome reversal", async () => {
    const report = await verify((value) => setAccuracies(value, 0.6, 0.9));

    expect(report.findings.map((finding) => finding.code)).toContain(
      "UNRESOLVED_OUTCOME",
    );
  });

  it("rejects overclaiming public copy", async () => {
    const report = await verify((value) => ({
      ...value,
      presentation: {
        ...value.presentation,
        learnerFacingClaims: [
          "This proves performance for every future customer.",
        ],
      },
    }));

    expect(report.findings.map((finding) => finding.code)).toContain(
      "CLAIM_EXCEEDS_EVIDENCE",
    );
  });

  it("rejects an inconclusive region absent from the selected contract", async () => {
    const report = await verify(async (value) => {
      const inconclusiveConditions = [
        {
          id: "different-region",
          description: "A different fixed uncertainty region.",
          nextExperimentId: "group-holdout-plus-ablation",
        },
      ];
      const candidates = value.ir.candidateExperiments.map((candidate) => ({
        ...candidate,
        inconclusiveConditionIds: ["different-region"],
      }));
      return setAccuracies(
        {
          ...value,
          ir: ExperimentIRV5Schema.parse({
            ...value.ir,
            candidateExperiments: candidates,
            inconclusiveConditions,
          }),
        },
        0.7,
        0.64,
      );
    });

    expect(report.findings.map((finding) => finding.code)).toContain(
      "INCONCLUSIVE_NOT_REPRESENTED",
    );
  });

  it("rejects a Boundary Sweep until an independently signed map is bound", async () => {
    const report = await verify((value) => ({
      ...value,
      ir: ExperimentIRV5Schema.parse({
        ...value.ir,
        boundarySweep: {
          sweepId: "leakage-recurrence-sweep",
          axisIds: ["entity_recurrence", "identity_signal_strength"],
          gridPresetId: "leakage-boundary-grid-v1",
          observableId: "accuracy",
          maxCells: 625,
        },
      }),
    }));

    expect(report.findings.map((finding) => finding.code)).toContain(
      "BOUNDARY_SWEEP_UNAUTHORIZED",
    );
  });

  it("rejects nonexistent result paths even from an internal adapter", async () => {
    const value = await fixture();
    const plan = projectExperimentIRV5ToPlanV2(value.ir);
    const technicalReport = await verifyHostedResultSet(value.result, plan);
    const registered =
      getConceptPack("entity_leakage").scientificMethod.epistemic;
    const report = await evaluateVerifiedEpistemicEvidence(
      {
        artifactManifest: manifest,
        sessionId: "session-1",
        beliefSpec,
        ir: value.ir,
        result: value.result,
        technicalReport,
        presentation: value.presentation,
      },
      {
        ...registered,
        resolveObservablePath: () => "/does/not/exist",
      },
    );

    expect(report.findings.map((finding) => finding.code)).toContain(
      "RESULT_BINDING_MISMATCH",
    );
  });

  it("rejects an existing result path outside the observable policy", async () => {
    const value = await fixture();
    const plan = projectExperimentIRV5ToPlanV2(value.ir);
    const technicalReport = await verifyHostedResultSet(value.result, plan);
    const registered =
      getConceptPack("entity_leakage").scientificMethod.epistemic;
    const report = await evaluateVerifiedEpistemicEvidence(
      {
        artifactManifest: manifest,
        sessionId: "session-1",
        beliefSpec,
        ir: value.ir,
        result: value.result,
        technicalReport,
        presentation: value.presentation,
      },
      {
        ...registered,
        resolveObservablePath: () => "/fixture/rows",
      },
    );

    expect(report.findings.map((finding) => finding.code)).toContain(
      "RESULT_BINDING_MISMATCH",
    );
  });

  it.each(["/runs", "/chartData", "/runs/0/metrics/accuracy"])(
    "rejects a non-authoritative observable binding at %s",
    async (resultPath) => {
      const value = await fixture();
      const plan = projectExperimentIRV5ToPlanV2(value.ir);
      const technicalReport = await verifyHostedResultSet(value.result, plan);
      const registered =
        getConceptPack("entity_leakage").scientificMethod.epistemic;
      const report = await evaluateVerifiedEpistemicEvidence(
        {
          artifactManifest: manifest,
          sessionId: "session-1",
          beliefSpec,
          ir: value.ir,
          result: value.result,
          technicalReport,
          presentation: value.presentation,
        },
        {
          ...registered,
          resolveObservablePath: () => resultPath,
        },
      );

      expect(report.findings.map((finding) => finding.code)).toContain(
        "RESULT_BINDING_MISMATCH",
      );
    },
  );

  it("turns technical hash or invariant failure into a no-release verdict", async () => {
    const report = await verify((value) => ({
      ...value,
      result: { ...value.result, resultHash: digest("0") },
    }));

    expect(report.findings.map((finding) => finding.code)).toEqual([
      "TECHNICAL_VERIFICATION_FAILED",
    ]);
    expect(report.verdict).toMatchObject({
      kind: "REJECTED",
      resultReleased: false,
    });
    expect("resultHash" in report).toBe(false);
    expect("observation" in report).toBe(false);
  });
});
