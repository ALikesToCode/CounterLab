import { describe, expect, it } from "vitest";

import {
  deriveInteractivePlanV5,
  RunnerLabCompileBundleV5Schema,
  RunnerLabInteractiveRunBundleV5Schema,
  RunnerJobInputBundleV5Schema,
  RunnerScientificCandidateV5Schema,
  VersionedRunnerJobInputBundleSchema,
} from "../src/index.js";

const digest = (character: string) => character.repeat(64);

function runnerBundleV5() {
  const evidence = {
    cellIndex: 2,
    kind: "code" as const,
    hash: digest("c"),
    excerpt: "train_test_split(X, y)",
    relevance: "This cell defines the current evaluation boundary.",
  };
  return {
    schemaVersion: "5" as const,
    kind: "LAB_COMPILE" as const,
    jobId: "runner_job_scientific_1",
    sessionId: "session-live-1",
    stateVersion: 7,
    artifactManifestHash: digest("a"),
    approvedBeliefSpec: {
      schemaVersion: "2" as const,
      id: "belief-live-1",
      concept: "entity_leakage" as const,
      claim: "The random-row score proves performance for new customers.",
      evidenceRefs: [evidence],
      hypotheses: [
        {
          id: "current" as const,
          statement: "Behavioral signal generalizes to unseen customers.",
          conditions: ["The deployment unit is a customer."],
          nonClaims: ["This does not establish every deployment condition."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["group-holdout"],
        },
        {
          id: "competing" as const,
          statement: "Repeated customer identity inflates the row split.",
          conditions: ["Customers repeat across rows."],
          nonClaims: ["This does not prove the model has no useful signal."],
          evidence: [evidence],
          supportedCandidateExperimentIds: ["group-holdout"],
        },
      ],
      alternatives: [],
      uncertainty: 0.82,
      supportState: "SUPPORTED" as const,
      learnerDecision: "CONFIRMED" as const,
    },
    beliefSpecHash: digest("b"),
    prediction: {
      schemaVersion: "1" as const,
      id: "prediction-live-1",
      sessionId: "session-live-1",
      beliefTestId: "belief-live-1",
      choice: "The group-holdout score will remain close.",
      confidence: 76,
      committedAt: "2026-07-16T05:00:00.000Z",
      immutableHash: digest("d"),
    },
    artifactManifest: {
      artifactId: "artifact-live-1",
      fileName: "customer-analysis.ipynb",
      fileSha256: digest("e"),
      nbformat: 4,
      support: { status: "SUPPORTED" as const, reasons: [] },
      cells: [
        {
          index: 2,
          type: "code" as const,
          sourceSha256: digest("c"),
          sourceExcerpt: "train_test_split(X, y)",
          executionCount: 3,
          outputHashes: [],
          symbols: ["train_test_split"],
          metricCandidates: [],
        },
      ],
      schemaSummary: {
        fields: [
          {
            name: "customer_id",
            inferredType: "string",
            privacyClass: "identifier",
          },
        ],
        entityCandidates: ["customer_id"],
        targetCandidates: ["churned"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-16T04:59:00.000Z",
    },
    conceptPack: {
      id: "entity_leakage" as const,
      version: "2.0.0",
      title: "Entity leakage",
      allowedOperations: [
        "leakage.random_row_split" as const,
        "leakage.group_holdout" as const,
        "leakage.identity_ablation" as const,
      ],
      allowedMetrics: ["accuracy" as const, "entity_overlap_rate" as const],
      allowedVisualizations: [
        "metric_comparison" as const,
        "entity_overlap" as const,
      ],
      verifierInvariants: ["zero_group_overlap"],
      candidateExperimentIds: ["group-holdout"],
      planRequirements: ["Hold the estimator and preprocessing fixed."],
    },
    schemas: {
      discriminationContract: { type: "object" },
      experimentIr: { type: "object" },
      labScene: { type: "object" },
    },
    provenance: {
      generatorId: "codex-app-server-stdio-v1",
      promptHash: digest("f"),
      inputHashes: [digest("a"), digest("b"), digest("d")],
    },
    resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    permittedOutputs: [
      "discrimination-contract.json" as const,
      "experiment-ir.json" as const,
      "lab-scene.json" as const,
      "public-rationale.md" as const,
    ],
  };
}

function labRunBundleV5() {
  const compile = runnerBundleV5();
  const fixedSelection = {
    eligibleCandidateIds: ["group-holdout"],
    rejectedCandidates: [],
    selectedCandidateId: "group-holdout",
    minimumSeparation: 0.82,
    requiredSeparation: 0.6,
    complexityCost: 2,
    normalizedScore: 0.8,
    scorerVersion: "experiment-scorer-v1",
  };
  const baseline = {
    concept: "entity_leakage" as const,
    runId: "random-row",
    operation: "leakage.random_row_split" as const,
    seed: 1729,
    testFraction: 0.25,
    entityField: "customer_id",
    dropIdentity: false,
    model: "logistic_regression" as const,
  };
  const intervention = {
    concept: "entity_leakage" as const,
    runId: "group-holdout",
    operation: "leakage.group_holdout" as const,
    seed: 1729,
    testFraction: 0.25,
    entityField: "customer_id",
    dropIdentity: false,
    model: "logistic_regression" as const,
  };
  const experimentIr = {
    schemaVersion: "5" as const,
    irId: "ir-live-1",
    executionPlanId: "plan-live-1",
    sessionId: compile.sessionId,
    concept: "entity_leakage" as const,
    conceptPackVersion: compile.conceptPack.version,
    artifactManifestHash: compile.artifactManifestHash,
    beliefSpecId: compile.approvedBeliefSpec.id,
    beliefSpecHash: compile.beliefSpecHash,
    evidenceRefs: compile.approvedBeliefSpec.evidenceRefs,
    hypotheses: [
      {
        id: "current" as const,
        statement: compile.approvedBeliefSpec.hypotheses[0]!.statement,
        conditions: compile.approvedBeliefSpec.hypotheses[0]!.conditions,
        nonClaims: compile.approvedBeliefSpec.hypotheses[0]!.nonClaims,
        predictedPattern: {
          patternId: "leakage.small-gap",
          description: "Group and row accuracy remain similar.",
        },
      },
      {
        id: "competing" as const,
        statement: compile.approvedBeliefSpec.hypotheses[1]!.statement,
        conditions: compile.approvedBeliefSpec.hypotheses[1]!.conditions,
        nonClaims: compile.approvedBeliefSpec.hypotheses[1]!.nonClaims,
        predictedPattern: {
          patternId: "leakage.material-gap",
          description: "Group accuracy falls when entity overlap reaches zero.",
        },
      },
    ],
    candidateExperiments: [
      {
        id: "group-holdout",
        title: "Hold out whole customers",
        operationIds: [
          "leakage.random_row_split" as const,
          "leakage.group_holdout" as const,
          "leakage.entity_overlap" as const,
        ],
        baseline,
        interventions: [intervention],
        heldConstantIds: ["model", "seed", "preprocessing"],
        changedVariableIds: ["split-strategy"],
        observableIds: ["accuracy" as const, "entity_overlap_rate" as const],
        hypothesisPatterns: [
          {
            hypothesisId: "current" as const,
            patternId: "leakage.small-gap",
          },
          {
            hypothesisId: "competing" as const,
            patternId: "leakage.material-gap",
          },
        ],
        inconclusiveConditionIds: ["leakage.gap-within-tolerance"],
        complexityCost: 2,
        discriminatesBecause:
          "Only the evaluation unit changes while the estimator stays fixed.",
      },
    ],
    selection: {
      status: "SELECTED" as const,
      candidateId: fixedSelection.selectedCandidateId,
      eligibleCandidateIds: fixedSelection.eligibleCandidateIds,
      rejectedCandidates: fixedSelection.rejectedCandidates,
      minimumSeparation: fixedSelection.minimumSeparation,
      requiredSeparation: fixedSelection.requiredSeparation,
      complexityCost: fixedSelection.complexityCost,
      normalizedScore: fixedSelection.normalizedScore,
      scorerVersion: fixedSelection.scorerVersion,
    },
    visualizations: ["metric_comparison" as const, "entity_overlap" as const],
    inconclusiveConditions: [
      {
        id: "leakage.gap-within-tolerance",
        description:
          "The measured gap is too small to distinguish the hypotheses.",
      },
    ],
    transfer: {
      taskId: "forecast-future-leakage-v1",
      changedSurface: "Time-ordered forecasting with future-looking features.",
      requiredActionIds: ["time-ordered-holdout"],
      nonClaims: ["Transfer does not certify global mastery."],
    },
    nonClaims: ["This does not prove performance for every future customer."],
    provenance: {
      kind: "codex" as const,
      generatorId: compile.provenance.generatorId,
      promptHash: compile.provenance.promptHash,
      inputHashes: compile.provenance.inputHashes,
    },
    limitations: ["The result is scoped to this supported artifact family."],
    resourceLimits: compile.resourceLimits,
  };
  const projectedPlan = {
    schemaVersion: "2" as const,
    planId: experimentIr.executionPlanId,
    sessionId: experimentIr.sessionId,
    concept: experimentIr.concept,
    conceptPackVersion: experimentIr.conceptPackVersion,
    artifactManifestHash: experimentIr.artifactManifestHash,
    beliefTestId: experimentIr.beliefSpecId,
    evidenceRefs: experimentIr.evidenceRefs,
    baseline,
    interventions: [intervention],
    controlledVariables: ["model", "seed", "preprocessing"],
    changedVariables: ["split-strategy"],
    metrics: ["accuracy" as const, "entity_overlap_rate" as const],
    visualizations: experimentIr.visualizations,
    discriminatesBecause:
      experimentIr.candidateExperiments[0]!.discriminatesBecause,
    expectedPatterns: experimentIr.hypotheses.map((hypothesis) => ({
      hypothesisId: hypothesis.id,
      qualitativeOutcome: hypothesis.predictedPattern.description,
    })),
    nonClaims: experimentIr.nonClaims,
    resourceLimits: experimentIr.resourceLimits,
  };
  const expectedHashes = {
    artifactManifest: compile.artifactManifestHash,
    beliefSpec: compile.beliefSpecHash,
    prediction: compile.prediction.immutableHash,
    fixtureDescriptor: digest("7"),
    compileInputBundle: digest("b"),
    rawExperimentIrFile: digest("0"),
    rawExperimentIrCanonical: digest("a"),
    candidateVerificationReport: digest("9"),
    experimentSelection: digest("2"),
    selectedExperimentIr: digest("1"),
    projectedPlan: digest("3"),
  };

  return {
    schemaVersion: "5" as const,
    kind: "LAB_RUN" as const,
    purpose: "AUTHORITATIVE" as const,
    jobId: "runner_job_run_v5_1",
    sessionId: compile.sessionId,
    stateVersion: 10,
    artifactManifestHash: compile.artifactManifestHash,
    approvedBeliefSpec: compile.approvedBeliefSpec,
    beliefSpecHash: compile.beliefSpecHash,
    prediction: compile.prediction,
    artifactManifest: compile.artifactManifest,
    fixture: {
      id: "public-leakage-v1" as const,
      version: "leakage-fixture-v1",
      contentSha256: digest("8"),
    },
    selectedExperimentIr: experimentIr,
    selectedExperimentIrHash: expectedHashes.selectedExperimentIr,
    fixedSelection,
    projectedPlan,
    expectedHashes,
    provenance: {
      compileJobId: compile.jobId,
      compileInputBundleHash: expectedHashes.compileInputBundle,
      compilerOutputFileHashes: {
        "discrimination-contract.json": digest("4"),
        "experiment-ir.json": expectedHashes.rawExperimentIrFile,
        "lab-scene.json": digest("5"),
        "public-rationale.md": digest("6"),
      },
      rawExperimentIrCanonicalHash: expectedHashes.rawExperimentIrCanonical,
      scientificVerifierVersion: "scientific-candidate-verifier-v1" as const,
      candidateVerificationReportHash:
        expectedHashes.candidateVerificationReport,
      scorerVersion: fixedSelection.scorerVersion,
      projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1" as const,
    },
    resultOutput: {
      path: "verified-result.json" as const,
      schemaVersion: "2" as const,
      authoritativeInputHashes: expectedHashes,
    },
    permittedOutputs: ["verified-result.json" as const],
  };
}

function interactiveLabRunBundleV5() {
  const authoritative = labRunBundleV5();
  const configuration = {
    schemaVersion: "1" as const,
    splitStrategy: "group" as const,
    entityField: "customer_id",
    identityAblation: true,
    testFraction: 0.3,
  };
  const configurationHash = digest("e");
  const { interactivePlan, selectedRunId } = deriveInteractivePlanV5(
    authoritative.projectedPlan,
    configuration,
    configurationHash,
  );
  const compileAuthority = {
    schemaVersion: "5" as const,
    status: "VERIFIED" as const,
    source: "hosted-experiment-ir-v5" as const,
    jobId: authoritative.provenance.compileJobId,
    inputBundleHash: authoritative.expectedHashes.compileInputBundle,
    artifactManifestHash: authoritative.artifactManifestHash,
    beliefSpecHash: authoritative.beliefSpecHash,
    predictionHash: authoritative.prediction.immutableHash,
    compilerOutputFileHashes: authoritative.provenance.compilerOutputFileHashes,
    discriminationContractHash: digest("4"),
    rawExperimentIrCanonicalHash:
      authoritative.expectedHashes.rawExperimentIrCanonical,
    labSceneHash: digest("5"),
    candidateVerificationReportHash:
      authoritative.expectedHashes.candidateVerificationReport,
    scientificVerifierVersion: "scientific-candidate-verifier-v1" as const,
    selectionHash: authoritative.expectedHashes.experimentSelection,
    selectedExperimentIrHash: authoritative.selectedExperimentIrHash,
    projectedPlanHash: authoritative.expectedHashes.projectedPlan,
    scorerVersion: authoritative.fixedSelection.scorerVersion,
    projectionAdapterVersion: "experiment-ir-v5-to-plan-v2-v1" as const,
  };
  const authoritativeResultHash = digest("7");
  const evidenceVerdict = {
    schemaVersion: "1" as const,
    kind: "SUPPORTS" as const,
    hypothesisId: "competing" as const,
    scope: "This supported artifact and deployment unit.",
    resultHash: authoritativeResultHash,
    irHash: authoritative.selectedExperimentIrHash,
    technicalReportHash: digest("8"),
    verifierVersion: "epistemic-verifier-v1",
  };
  return {
    schemaVersion: "5" as const,
    kind: "LAB_RUN" as const,
    purpose: "INTERACTIVE" as const,
    jobId: "runner_job_interactive_v5_1",
    sessionId: authoritative.sessionId,
    stateVersion: 14,
    artifactManifestHash: authoritative.artifactManifestHash,
    artifactManifest: authoritative.artifactManifest,
    approvedBeliefSpec: authoritative.approvedBeliefSpec,
    beliefSpecHash: authoritative.beliefSpecHash,
    prediction: authoritative.prediction,
    fixture: authoritative.fixture,
    compileAuthority,
    selectedExperimentIr: authoritative.selectedExperimentIr,
    fixedSelection: authoritative.fixedSelection,
    basePlan: authoritative.projectedPlan,
    releaseAuthority: {
      authoritativeResultHash,
      evidenceVerdict,
      evidenceVerdictHash: digest("9"),
      epistemicReportHash: digest("a"),
    },
    configuration,
    configurationHash,
    derivationVersion: "interactive-plan-v5-derivation-v1" as const,
    selectedRunId,
    interactivePlan,
    interactivePlanHash: digest("b"),
    resultOutput: {
      path: "verified-result.json" as const,
      schemaVersion: "2" as const,
      authorityHash: configurationHash,
    },
    permittedOutputs: ["verified-result.json" as const],
  };
}

function patchCompileBundleV5() {
  const interactive = interactiveLabRunBundleV5();
  return {
    schemaVersion: "5" as const,
    kind: "PATCH_COMPILE" as const,
    jobId: "runner_job_patch_v5_1",
    sessionId: interactive.sessionId,
    stateVersion: 18,
    requestedAt: "2026-07-16T05:20:00.000Z",
    artifactManifestHash: interactive.artifactManifestHash,
    conceptPackVersion: interactive.selectedExperimentIr.conceptPackVersion,
    artifactManifest: interactive.artifactManifest,
    approvedBeliefSpec: interactive.approvedBeliefSpec,
    beliefSpecHash: interactive.beliefSpecHash,
    prediction: interactive.prediction,
    compileAuthority: interactive.compileAuthority,
    selectedExperimentIr: interactive.selectedExperimentIr,
    fixedSelection: interactive.fixedSelection,
    basePlan: interactive.basePlan,
    releaseAuthority: interactive.releaseAuthority,
    verifiedResultSummary: {
      schemaVersion: "2" as const,
      concept: "entity_leakage" as const,
      resultHash: interactive.releaseAuthority.authoritativeResultHash,
      planId: interactive.basePlan.planId,
      runIds: ["random-row", "group-holdout"],
    },
    transferContractId: interactive.selectedExperimentIr.transfer.taskId,
    transferResult: {
      schemaVersion: "1" as const,
      id: "transfer-live-1",
      sessionId: interactive.sessionId,
      taskId: "forecasting-future-leakage-01",
      outcome: "PASSED" as const,
      selectedStrategy: "time_ordered_holdout",
      identifiedRisks: ["centered_window_reads_future"],
      evidenceChoices: [
        "center_true_uses_later_targets",
        "random_split_mixes_dates",
      ],
      checks: [
        {
          invariant: "time_ordered_evaluation",
          passed: true,
          evidence: "The future rows are isolated from training.",
        },
      ],
      evaluatorVersion: "forecast-transfer-v1",
      evaluatedAt: "2026-07-16T05:19:00.000Z",
      resultHash: digest("c"),
    },
    patchContract: {
      id: "entity-leakage-patch-v1",
      allowedTransformations: [
        "replace_row_split_with_group_holdout" as const,
        "exclude_entity_feature" as const,
      ],
    },
    allowedCellIndices: [2],
    patchPlanSchema: { type: "object" },
    permittedOutputs: [
      "patch-plan.json" as const,
      "public-rationale.md" as const,
    ],
  };
}

describe("Runner LAB_COMPILE bundle v5", () => {
  it("parses as a versioned job without changing the stored v1 bundle", () => {
    const parsed = RunnerLabCompileBundleV5Schema.parse(runnerBundleV5());
    expect(parsed.approvedBeliefSpec.learnerDecision).toBe("CONFIRMED");
    expect(VersionedRunnerJobInputBundleSchema.parse(parsed)).toMatchObject({
      schemaVersion: "5",
      permittedOutputs: [
        "discrimination-contract.json",
        "experiment-ir.json",
        "lab-scene.json",
        "public-rationale.md",
      ],
    });
  });

  it("rejects unapproved or insufficient belief authority", () => {
    for (const update of [
      { learnerDecision: "UNDECIDED" },
      { learnerDecision: "REJECTED" },
      { learnerDecision: "ALTERNATIVE_SELECTED" },
      { supportState: "PARTIAL" },
      { supportState: "INSUFFICIENT_EVIDENCE" },
    ]) {
      expect(() =>
        RunnerLabCompileBundleV5Schema.parse({
          ...runnerBundleV5(),
          approvedBeliefSpec: {
            ...runnerBundleV5().approvedBeliefSpec,
            ...update,
          },
        }),
      ).toThrow(/learner-approved/i);
    }
  });

  it("rejects unresolved manifest evidence, mixed v1 fields, and extra outputs", () => {
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        approvedBeliefSpec: {
          ...runnerBundleV5().approvedBeliefSpec,
          evidenceRefs: [
            {
              ...runnerBundleV5().approvedBeliefSpec.evidenceRefs[0],
              hash: digest("f"),
            },
          ],
        },
      }),
    ).toThrow(/evidence/i);
    expect(() =>
      VersionedRunnerJobInputBundleSchema.parse({
        ...runnerBundleV5(),
        approvedBeliefTest: { id: "legacy" },
      }),
    ).toThrow();
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        permittedOutputs: [
          ...runnerBundleV5().permittedOutputs,
          "experiment-plan.json",
        ],
      }),
    ).toThrow();
  });

  it("requires compiler provenance to bind every authoritative input", () => {
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        provenance: {
          ...runnerBundleV5().provenance,
          inputHashes: [digest("a"), digest("b")],
        },
      }),
    ).toThrow(/provenance/i);
    expect(() =>
      RunnerLabCompileBundleV5Schema.parse({
        ...runnerBundleV5(),
        provenance: {
          ...runnerBundleV5().provenance,
          promptHash: "not-a-hash",
        },
      }),
    ).toThrow();
  });

  it("binds a v5 candidate submission to all four generated artifacts", () => {
    expect(
      RunnerScientificCandidateV5Schema.parse({
        schemaVersion: "5",
        attempt: 1,
        artifactHashes: {
          "discrimination-contract.json": digest("1"),
          "experiment-ir.json": digest("2"),
          "lab-scene.json": digest("3"),
          "public-rationale.md": digest("4"),
        },
      }),
    ).toMatchObject({ schemaVersion: "5", attempt: 1 });
    expect(() =>
      RunnerScientificCandidateV5Schema.parse({
        schemaVersion: "5",
        attempt: 1,
        artifactHashes: {
          "experiment-ir.json": digest("2"),
        },
      }),
    ).toThrow();
  });
});

describe("Runner LAB_RUN bundle v5", () => {
  it("accepts one fully lineage-bound selected scientific run", () => {
    const parsed = RunnerJobInputBundleV5Schema.safeParse(labRunBundleV5());
    const versioned =
      VersionedRunnerJobInputBundleSchema.safeParse(labRunBundleV5());

    expect(parsed.success).toBe(true);
    expect(versioned.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      schemaVersion: "5",
      kind: "LAB_RUN",
      purpose: "AUTHORITATIVE",
      selectedExperimentIrHash: digest("1"),
      expectedHashes: {
        fixtureDescriptor: digest("7"),
        rawExperimentIrFile: digest("0"),
        rawExperimentIrCanonical: digest("a"),
        selectedExperimentIr: digest("1"),
      },
      permittedOutputs: ["verified-result.json"],
    });
  });

  it("rejects unconfirmed belief, unselected IR, and scorer selection drift", () => {
    const source = labRunBundleV5();
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        approvedBeliefSpec: {
          ...source.approvedBeliefSpec,
          learnerDecision: "UNDECIDED",
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        selectedExperimentIr: {
          ...source.selectedExperimentIr,
          selection: { status: "UNSELECTED" },
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        fixedSelection: {
          ...source.fixedSelection,
          selectedCandidateId: "different-candidate",
        },
      }).success,
    ).toBe(false);
  });

  it("rejects projected-plan, manifest, and evidence lineage drift", () => {
    const source = labRunBundleV5();
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        projectedPlan: {
          ...source.projectedPlan,
          planId: "different-plan",
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        artifactManifestHash: digest("9"),
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        selectedExperimentIr: {
          ...source.selectedExperimentIr,
          evidenceRefs: [
            {
              ...source.selectedExperimentIr.evidenceRefs[0],
              hash: digest("9"),
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("requires one concept-matched, hash-bound fixed fixture", () => {
    const source = labRunBundleV5();
    const { fixture: _fixture, ...withoutFixture } = source;
    expect(RunnerJobInputBundleV5Schema.safeParse(withoutFixture).success).toBe(
      false,
    );
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        fixture: { ...source.fixture, id: "public-imbalance-v1" },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        resultOutput: {
          ...source.resultOutput,
          authoritativeInputHashes: {
            ...source.resultOutput.authoritativeInputHashes,
            fixtureDescriptor: digest("9"),
          },
        },
      }).success,
    ).toBe(false);
  });

  it("rejects hash, provenance, and result-output binding drift", () => {
    const source = labRunBundleV5();
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        expectedHashes: {
          ...source.expectedHashes,
          beliefSpec: digest("9"),
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        selectedExperimentIrHash: digest("9"),
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        expectedHashes: {
          ...source.expectedHashes,
          rawExperimentIrCanonical: source.expectedHashes.selectedExperimentIr,
        },
        provenance: {
          ...source.provenance,
          rawExperimentIrCanonicalHash:
            source.expectedHashes.selectedExperimentIr,
        },
        resultOutput: {
          ...source.resultOutput,
          authoritativeInputHashes: {
            ...source.resultOutput.authoritativeInputHashes,
            rawExperimentIrCanonical:
              source.expectedHashes.selectedExperimentIr,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        provenance: {
          ...source.provenance,
          compilerOutputFileHashes: {
            ...source.provenance.compilerOutputFileHashes,
            "experiment-ir.json": source.expectedHashes.selectedExperimentIr,
          },
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        provenance: {
          ...source.provenance,
          candidateVerificationReportHash: digest("0"),
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        provenance: {
          ...source.provenance,
          scorerVersion: "different-scorer",
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerJobInputBundleV5Schema.safeParse({
        ...source,
        resultOutput: {
          ...source.resultOutput,
          authoritativeInputHashes: {
            ...source.resultOutput.authoritativeInputHashes,
            projectedPlan: digest("9"),
          },
        },
      }).success,
    ).toBe(false);
  });
});

describe("Runner interactive LAB_RUN bundle v5", () => {
  it("accepts a purpose-separated run bound to frozen compile and release authority", () => {
    const parsed = RunnerLabInteractiveRunBundleV5Schema.safeParse(
      interactiveLabRunBundleV5(),
    );
    const versioned = VersionedRunnerJobInputBundleSchema.safeParse(
      interactiveLabRunBundleV5(),
    );

    expect(parsed.success).toBe(true);
    expect(versioned.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      schemaVersion: "5",
      kind: "LAB_RUN",
      purpose: "INTERACTIVE",
      derivationVersion: "interactive-plan-v5-derivation-v1",
      selectedRunId: `interactive-${digest("e").slice(0, 16)}`,
      permittedOutputs: ["verified-result.json"],
    });
  });

  it("rejects a rejected source verdict and release-result drift", () => {
    const source = interactiveLabRunBundleV5();
    expect(
      RunnerLabInteractiveRunBundleV5Schema.safeParse({
        ...source,
        releaseAuthority: {
          ...source.releaseAuthority,
          evidenceVerdict: {
            schemaVersion: "1",
            kind: "REJECTED",
            findingIds: ["finding-1"],
            resultReleased: false,
            irHash: source.compileAuthority.selectedExperimentIrHash,
            technicalReportHash: digest("8"),
            verifierVersion: "epistemic-verifier-v1",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerLabInteractiveRunBundleV5Schema.safeParse({
        ...source,
        releaseAuthority: {
          ...source.releaseAuthority,
          authoritativeResultHash: digest("c"),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects compile selection drift and a plan not derived from its configuration", () => {
    const source = interactiveLabRunBundleV5();
    expect(
      RunnerLabInteractiveRunBundleV5Schema.safeParse({
        ...source,
        fixedSelection: {
          ...source.fixedSelection,
          selectedCandidateId: "different-candidate",
        },
      }).success,
    ).toBe(false);
    expect(
      RunnerLabInteractiveRunBundleV5Schema.safeParse({
        ...source,
        interactivePlan: {
          ...source.interactivePlan,
          interventions: source.interactivePlan.interventions.map((run) =>
            run.runId === source.selectedRunId
              ? { ...run, seed: run.seed + 1 }
              : run,
          ),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects a missing selected run and all unknown fields", () => {
    const source = interactiveLabRunBundleV5();
    expect(
      RunnerLabInteractiveRunBundleV5Schema.safeParse({
        ...source,
        selectedRunId: "interactive-0000000000000000",
      }).success,
    ).toBe(false);
    expect(
      RunnerLabInteractiveRunBundleV5Schema.safeParse({
        ...source,
        shellCommand: "python arbitrary.py",
      }).success,
    ).toBe(false);
  });
});

describe("Runner PATCH_COMPILE bundle v5", () => {
  it("accepts a live repair bound to v5 belief, experiment, verdict, and transfer authority", () => {
    const parsed = VersionedRunnerJobInputBundleSchema.safeParse(
      patchCompileBundleV5(),
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      schemaVersion: "5",
      kind: "PATCH_COMPILE",
      approvedBeliefSpec: { schemaVersion: "2" },
      releaseAuthority: {
        evidenceVerdict: { kind: "SUPPORTS" },
      },
      transferResult: { outcome: "PASSED" },
      permittedOutputs: ["patch-plan.json", "public-rationale.md"],
    });
    expect("approvedBeliefTest" in parsed.data).toBe(false);
  });

  it("rejects sample authority, inconclusive evidence, and transfer or result drift", () => {
    const source = patchCompileBundleV5();
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        approvedBeliefTest: { id: "sample-belief-test" },
      }).success,
    ).toBe(false);
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        releaseAuthority: {
          ...source.releaseAuthority,
          evidenceVerdict: {
            ...source.releaseAuthority.evidenceVerdict,
            kind: "INCONCLUSIVE",
            reasonCode: "OUTCOME_WITHIN_TOLERANCE",
            scope: "The result did not separate the hypotheses.",
            nextExperimentId: "group-holdout",
          },
        },
      }).success,
    ).toBe(false);
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        transferResult: { ...source.transferResult, outcome: "FAILED" },
      }).success,
    ).toBe(false);
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        verifiedResultSummary: {
          ...source.verifiedResultSummary,
          resultHash: digest("f"),
        },
      }).success,
    ).toBe(false);
  });

  it("rejects selection, projected Plan, cell scope, and operation drift", () => {
    const source = patchCompileBundleV5();
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        fixedSelection: {
          ...source.fixedSelection,
          selectedCandidateId: "different-candidate",
        },
      }).success,
    ).toBe(false);
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        basePlan: { ...source.basePlan, planId: "different-plan" },
      }).success,
    ).toBe(false);
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        allowedCellIndices: [99],
      }).success,
    ).toBe(false);
    expect(
      VersionedRunnerJobInputBundleSchema.safeParse({
        ...source,
        patchContract: {
          ...source.patchContract,
          allowedTransformations: ["add_majority_baseline"],
        },
      }).success,
    ).toBe(false);
  });
});
