import { describe, expect, it } from "vitest";

import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  DiscriminationContractV1Schema,
  PredictionContractSchema,
  type ExperimentPlanV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  RunnerLabCompileBundleV5Schema,
  hashExperimentIR,
  type ExperimentIRV5,
  type RunnerLabCompileBundleV5,
} from "@counterlab/experiment-ir";
import type { ExperimentSelection } from "@counterlab/experiment-scorer";
import { hashCanonical } from "@counterlab/session-core";

import {
  LabSceneV2Schema,
  type LabSceneV2,
} from "../../generative-ui-contracts/src/index.js";
import * as planVerifier from "./index.js";

const digest = (character: string) => character.repeat(64);

type ScientificCandidateArtifacts = {
  discriminationContract: ReturnType<
    typeof DiscriminationContractV1Schema.parse
  >;
  experimentIr: ExperimentIRV5;
  labScene: LabSceneV2;
  publicRationale: string;
};

type ScientificCandidateResult = {
  disposition:
    "VERIFIED" | "REPAIRABLE_REJECTION" | "INCONCLUSIVE_NO_DECISIVE_TEST";
  report: {
    status: string;
    invariants?: Array<{
      name: string;
      passed: boolean;
      observed?: unknown;
      expected?: unknown;
    }>;
  };
  selection?: ExperimentSelection;
  selectedIr?: ExperimentIRV5;
  selectedIrHash?: string;
  executionPlan?: ExperimentPlanV2;
  executionPlanHash?: string;
};

type VerifyScientificCandidateV5 = (input: {
  bundle: RunnerLabCompileBundleV5;
  artifacts: ScientificCandidateArtifacts;
}) => Promise<ScientificCandidateResult>;

function scientificVerifier(): VerifyScientificCandidateV5 {
  const candidate = (planVerifier as Record<string, unknown>)[
    "verifyScientificCandidateV5"
  ];
  expect(
    candidate,
    "plan-verifier must export verifyScientificCandidateV5",
  ).toBeTypeOf("function");
  return candidate as VerifyScientificCandidateV5;
}

async function scientificFixture(runSeed = 1729): Promise<{
  bundle: RunnerLabCompileBundleV5;
  artifacts: ScientificCandidateArtifacts;
}> {
  const evidence = {
    cellIndex: 2,
    kind: "code" as const,
    hash: digest("a"),
    excerpt: `train_test_split(X, y, test_size=0.25, random_state=${runSeed})`,
    relevance: "This cell defines a row-wise evaluation boundary.",
  };
  const metricEvidence = {
    cellIndex: 2,
    outputIndex: 0,
    kind: "metric" as const,
    hash: digest("c"),
    excerpt: "accuracy = 0.985",
    relevance: "This stored output is the claim's reported score.",
  };
  const artifactManifest = ArtifactManifestSchema.parse({
    artifactId: "artifact-scientific-v5",
    fileName: "customer-evaluation.ipynb",
    fileSha256: digest("b"),
    nbformat: 4,
    support: { status: "SUPPORTED", reasons: [] },
    cells: [
      {
        index: 2,
        type: "code",
        sourceSha256: evidence.hash,
        sourceExcerpt: evidence.excerpt,
        executionCount: 2,
        outputHashes: [digest("c")],
        symbols: ["train_test_split", "accuracy_score"],
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
    createdAt: "2026-07-16T05:00:00.000Z",
  });
  const beliefSpec = BeliefSpecV2Schema.parse({
    schemaVersion: "2",
    id: "belief-scientific-v5",
    concept: "entity_leakage",
    claim: "The row-split score proves performance for unseen customers.",
    evidenceRefs: [evidence, metricEvidence],
    hypotheses: [
      {
        id: "current",
        statement:
          "The learned behavioral signal generalizes to new customers.",
        conditions: ["The evaluation unit matches the deployment unit."],
        nonClaims: ["This does not establish every future deployment."],
        evidence: [evidence, metricEvidence],
        supportedCandidateExperimentIds: ["group-holdout-plus-ablation"],
      },
      {
        id: "competing",
        statement: "Repeated customer identity inflates row-split performance.",
        conditions: ["Customers repeat across observed rows."],
        nonClaims: ["This does not claim the model has no useful signal."],
        evidence: [evidence, metricEvidence],
        supportedCandidateExperimentIds: ["group-holdout-plus-ablation"],
      },
    ],
    alternatives: [],
    uncertainty: 0.78,
    supportState: "SUPPORTED",
    learnerDecision: "CONFIRMED",
  });
  const artifactManifestHash = await hashCanonical(artifactManifest);
  const beliefSpecHash = await hashCanonical(beliefSpec);
  const predictionBase = {
    schemaVersion: "1" as const,
    id: "prediction-scientific-v5",
    sessionId: "session-scientific-v5",
    beliefTestId: beliefSpec.id,
    choice: "The score will remain high with whole customers held out.",
    confidence: 74,
    committedAt: "2026-07-16T05:05:00.000Z",
  };
  const prediction = PredictionContractSchema.parse({
    ...predictionBase,
    immutableHash: await hashCanonical(predictionBase),
  });
  const pack = getConceptPack("entity_leakage");
  const bundle = RunnerLabCompileBundleV5Schema.parse({
    schemaVersion: "5",
    kind: "LAB_COMPILE",
    jobId: "runner-job-scientific-v5",
    sessionId: prediction.sessionId,
    stateVersion: 7,
    artifactManifestHash,
    approvedBeliefSpec: beliefSpec,
    beliefSpecHash,
    prediction,
    artifactManifest,
    conceptPack: {
      id: pack.id,
      version: pack.version,
      title: pack.title,
      allowedOperations: pack.allowedOperations,
      allowedMetrics: pack.allowedMetrics,
      allowedVisualizations: pack.allowedVisualizations,
      verifierInvariants: pack.verifierContract.invariants,
      candidateExperimentIds: pack.scientificMethod.candidateExperimentIds,
      fixedExecutionContract: pack.scientificMethod.fixedExecutionContract,
      boundarySweep: {
        sweepId: pack.scientificMethod.boundaryMap.sweepId,
        axisIds: [
          pack.scientificMethod.boundaryMap.axes[0].id,
          pack.scientificMethod.boundaryMap.axes[1].id,
        ],
        gridPresetId: pack.scientificMethod.boundaryMap.gridPresetId,
        observableId: pack.scientificMethod.boundaryMap.observableId,
        maxCells: pack.scientificMethod.boundaryMap.maxCells,
      },
      transferTask: pack.transferTask,
      planRequirements: pack.experimentPlanRules,
    },
    schemas: {
      discriminationContract: { type: "object" },
      experimentIr: { type: "object" },
      labScene: { type: "object" },
    },
    provenance: {
      generatorId: "codex-app-server-stdio-v1",
      promptHash: digest("d"),
      inputHashes: [
        artifactManifestHash,
        beliefSpecHash,
        prediction.immutableHash,
      ],
    },
    resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    permittedOutputs: [
      "discrimination-contract.json",
      "experiment-ir.json",
      "lab-scene.json",
      "public-rationale.md",
    ],
  });

  const candidateId = "group-holdout-plus-ablation";
  const baseline = {
    concept: "entity_leakage" as const,
    runId: "random-rows",
    operation: "leakage.random_row_split" as const,
    seed: runSeed,
    testFraction: 0.25,
    entityField: "customer_id",
    dropIdentity: false,
    model: "logistic_regression" as const,
  };
  const discriminationContract = DiscriminationContractV1Schema.parse({
    schemaVersion: "1",
    contractId: "discrimination-scientific-v5",
    sessionId: bundle.sessionId,
    concept: bundle.conceptPack.id,
    conceptPackVersion: bundle.conceptPack.version,
    artifactManifestHash,
    beliefSpecId: beliefSpec.id,
    beliefSpecHash,
    hypotheses: [
      {
        id: "current",
        statement: beliefSpec.hypotheses[0].statement,
        decisivePatternId: "leakage.small-gap",
      },
      {
        id: "competing",
        statement: beliefSpec.hypotheses[1].statement,
        decisivePatternId: "leakage.material-gap",
      },
    ],
    candidateExperimentIds: [candidateId],
    changedVariableIds: ["split_strategy", "identity_feature"],
    controlledVariableIds: [
      "model",
      "seed",
      "test_fraction",
      "entity_field",
      "primary_identity_setting",
      "preprocessing",
      "model_hyperparameters",
    ],
    observableIds: ["accuracy", "roc_auc", "entity_overlap_rate"],
    inconclusiveConditionIds: ["gap-within-tolerance"],
    whyThisTest:
      "Holding model settings fixed while separating complete customers tests the deployment boundary directly.",
    nonClaims: [
      "This test does not establish performance for every future customer.",
    ],
    evidenceRefs: beliefSpec.evidenceRefs,
  });
  const experimentIr = ExperimentIRV5Schema.parse({
    schemaVersion: "5",
    irId: "ir.scientific-v5",
    executionPlanId: "plan-scientific-v5",
    sessionId: bundle.sessionId,
    concept: bundle.conceptPack.id,
    conceptPackVersion: bundle.conceptPack.version,
    artifactManifestHash,
    beliefSpecId: beliefSpec.id,
    beliefSpecHash,
    evidenceRefs: beliefSpec.evidenceRefs,
    hypotheses: [
      {
        id: "current",
        statement: beliefSpec.hypotheses[0].statement,
        conditions: beliefSpec.hypotheses[0].conditions,
        nonClaims: beliefSpec.hypotheses[0].nonClaims,
        predictedPattern: {
          patternId: "leakage.small-gap",
          description:
            "The optimism gap remains small when complete customers are held out.",
        },
      },
      {
        id: "competing",
        statement: beliefSpec.hypotheses[1].statement,
        conditions: beliefSpec.hypotheses[1].conditions,
        nonClaims: beliefSpec.hypotheses[1].nonClaims,
        predictedPattern: {
          patternId: "leakage.material-gap",
          description:
            "The optimism gap becomes material when complete customers are held out.",
        },
      },
    ],
    candidateExperiments: [
      {
        id: candidateId,
        title: "Whole-customer holdout with identity ablation",
        operationIds: [
          "leakage.random_row_split",
          "leakage.group_holdout",
          "leakage.identity_ablation",
        ],
        baseline,
        interventions: [
          {
            ...baseline,
            runId: "unseen-customers",
            operation: "leakage.group_holdout",
          },
          {
            ...baseline,
            runId: "without-identity",
            operation: "leakage.identity_ablation",
            dropIdentity: true,
          },
        ],
        heldConstantIds: discriminationContract.controlledVariableIds,
        changedVariableIds: discriminationContract.changedVariableIds,
        observableIds: discriminationContract.observableIds,
        hypothesisPatterns: [
          { hypothesisId: "current", patternId: "leakage.small-gap" },
          { hypothesisId: "competing", patternId: "leakage.material-gap" },
        ],
        inconclusiveConditionIds: ["gap-within-tolerance"],
        complexityCost: 5,
        discriminatesBecause:
          "Whole-customer holdout changes the evaluation unit while the fixed runs separately test the identity shortcut.",
      },
    ],
    selection: { status: "UNSELECTED" },
    visualizations: ["metric_comparison", "entity_overlap"],
    boundarySweep: bundle.conceptPack.boundarySweep,
    inconclusiveConditions: [
      {
        id: "gap-within-tolerance",
        description:
          "The measured gap falls between the two decisive patterns.",
        nextExperimentId: candidateId,
      },
    ],
    transfer: bundle.conceptPack.transferTask?.experimentIrContract,
    nonClaims: discriminationContract.nonClaims,
    provenance: { kind: "codex", ...bundle.provenance },
    limitations: [
      "The result is scoped to the supplied notebook and fixed kernel.",
    ],
    resourceLimits: bundle.resourceLimits,
  });
  const labScene = await sceneFor(bundle, discriminationContract, experimentIr);

  return {
    bundle,
    artifacts: {
      discriminationContract,
      experimentIr,
      labScene,
      publicRationale:
        "A whole-customer holdout changes the evaluation boundary while fixed controls preserve the comparison.",
    },
  };
}

async function sceneFor(
  bundle: RunnerLabCompileBundleV5,
  discriminationContract: ScientificCandidateArtifacts["discriminationContract"],
  experimentIr: ExperimentIRV5,
): Promise<LabSceneV2> {
  const candidate = experimentIr.candidateExperiments[0];
  const comparisonRun = candidate?.interventions[0];
  if (candidate === undefined || comparisonRun === undefined) {
    throw new Error("the scientific fixture requires two comparable runs");
  }
  return LabSceneV2Schema.parse({
    schemaVersion: "2",
    sceneId: "scene-scientific-v5",
    sessionId: bundle.sessionId,
    concept: bundle.conceptPack.id,
    supportLabel: "GUIDED_VISUAL",
    title: "Does the score survive a whole-customer holdout?",
    blocks: [
      {
        id: "hypotheses",
        type: "Hypothesis",
        current: bundle.approvedBeliefSpec.hypotheses[0].statement,
        competing: bundle.approvedBeliefSpec.hypotheses[1].statement,
      },
      {
        id: "why",
        type: "WhyThisTest",
        text: discriminationContract.whyThisTest,
      },
      {
        id: "baseline-metric",
        type: "Metric",
        label: "Familiar-row accuracy",
        resultBinding: `/runs/byId/${candidate.baseline.runId}/metrics/accuracy`,
        unit: "proportion",
      },
      {
        id: "comparison-metric",
        type: "Metric",
        label: "Unseen-customer accuracy",
        resultBinding: `/runs/byId/${comparisonRun.runId}/metrics/accuracy`,
        unit: "proportion",
      },
    ],
    assumptions: ["The fixed kernel executes only registered operations."],
    limitations: ["No result is shown before external verification."],
    provenance: {
      discriminationContractHash: await hashCanonical(discriminationContract),
      experimentIrHash: await hashExperimentIR(experimentIr),
    },
  });
}

async function replaceIr(
  fixture: Awaited<ReturnType<typeof scientificFixture>>,
  experimentIr: ExperimentIRV5,
) {
  return {
    ...fixture,
    artifacts: {
      ...fixture.artifacts,
      experimentIr,
      labScene: await sceneFor(
        fixture.bundle,
        fixture.artifacts.discriminationContract,
        experimentIr,
      ),
    },
  };
}

async function replaceContract(
  fixture: Awaited<ReturnType<typeof scientificFixture>>,
  discriminationContract: ScientificCandidateArtifacts["discriminationContract"],
) {
  return {
    ...fixture,
    artifacts: {
      ...fixture.artifacts,
      discriminationContract,
      labScene: await sceneFor(
        fixture.bundle,
        discriminationContract,
        fixture.artifacts.experimentIr,
      ),
    },
  };
}

describe("scientific v5 candidate verification", () => {
  it("selects a decisive experiment and projects the fixed execution plan", async () => {
    const input = await scientificFixture();
    const result = await scientificVerifier()(input);

    expect(result).toMatchObject({
      disposition: "VERIFIED",
      report: {
        status: "VERIFIED",
        verifierVersion: "scientific-candidate-verifier-v4",
      },
      selection: {
        selectedCandidateId: "group-holdout-plus-ablation",
        scorerVersion: "experiment-scorer-v1",
      },
      selectedIr: {
        selection: {
          status: "SELECTED",
          candidateId: "group-holdout-plus-ablation",
        },
      },
      executionPlan: {
        planId: "plan-scientific-v5",
        baseline: { operation: "leakage.random_row_split" },
        interventions: [
          { operation: "leakage.group_holdout" },
          { operation: "leakage.identity_ablation" },
        ],
      },
    });
    expect(result.selectedIrHash).toBe(
      await hashExperimentIR(result.selectedIr),
    );
    expect(result.executionPlanHash).toBe(
      await hashCanonical(result.executionPlan),
    );
  });

  it.each([
    {
      label: "explanatory copy without a result comparison",
      mutate: (scene: LabSceneV2) => ({
        ...scene,
        blocks: scene.blocks.filter((block) => block.type !== "Metric"),
      }),
    },
    {
      label: "a metric outside the selected-run manifest",
      mutate: (scene: LabSceneV2) => ({
        ...scene,
        blocks: scene.blocks.map((block) =>
          block.id === "comparison-metric" && block.type === "Metric"
            ? {
                ...block,
                resultBinding: "/runs/byId/model_authored_run/metrics/accuracy",
              }
            : block,
        ),
      }),
    },
    {
      label: "a signed accuracy value presented as recall",
      mutate: (scene: LabSceneV2) => ({
        ...scene,
        blocks: scene.blocks.map((block) =>
          block.id === "comparison-metric" && block.type === "Metric"
            ? { ...block, label: "Unseen-customer recall" }
            : block,
        ),
      }),
    },
    {
      label: "a signed proportion presented with a percent unit",
      mutate: (scene: LabSceneV2) => ({
        ...scene,
        blocks: scene.blocks.map((block) =>
          block.id === "comparison-metric" && block.type === "Metric"
            ? { ...block, unit: "percent" }
            : block,
        ),
      }),
    },
    {
      label: "an invented result claim in the scene title",
      mutate: (scene: LabSceneV2) => ({
        ...scene,
        title:
          "The repeated-identity explanation won after accuracy collapsed.",
      }),
    },
    {
      label: "an invented verdict in the scene limitations",
      mutate: (scene: LabSceneV2) => ({
        ...scene,
        limitations: [
          "The result proves identity caused the score and grouped evaluation fixes it.",
        ],
      }),
    },
  ])("rejects $label", async ({ mutate }) => {
    const fixture = await scientificFixture();
    fixture.artifacts.labScene = LabSceneV2Schema.parse(
      mutate(fixture.artifacts.labScene),
    );

    const result = await scientificVerifier()(fixture);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "lab_scene_result_binding_manifest",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      expected: {
        bindingRoot: "authoritative-result-v2",
        minimumMetricBindings: 2,
        minimumDistinctRunCount: 2,
      },
    });
    expect(result).not.toHaveProperty("executionPlan");
  });

  it("keeps the compiler-authored IR unselected while deriving a selected copy", async () => {
    const input = await scientificFixture();
    const rawIrBeforeVerification = structuredClone(
      input.artifacts.experimentIr,
    );

    const result = await scientificVerifier()(input);

    expect(result.disposition).toBe("VERIFIED");
    expect(input.artifacts.experimentIr).toEqual(rawIrBeforeVerification);
    expect(input.artifacts.experimentIr.selection).toEqual({
      status: "UNSELECTED",
    });
    expect(result.selectedIr?.selection).toMatchObject({ status: "SELECTED" });
    expect(result.selectedIr).not.toBe(input.artifacts.experimentIr);
  });

  it.each([
    {
      label: "foreign task ID",
      update: {
        taskId: "transfer.unseen-entity-evaluation",
        changedSurface: "Repeated customer evaluation",
        requiredActionIds: ["hold_out_customers"],
        nonClaims: ["Model-authored transfer prose must not be echoed."],
      },
    },
    {
      label: "semantic drift under the correct task ID",
      update: {
        taskId: "forecast-future-leakage-v1",
        changedSurface: "Time-ordered forecasting",
        requiredActionIds: ["remove_future_feature"],
        nonClaims: ["A changed limitation must not pass exact binding."],
      },
    },
  ])("rejects $label before selection or execution", async ({ update }) => {
    const fixture = await scientificFixture();
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      transfer: update,
    });
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "transfer_contract",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        taskId: update.taskId,
        transferContractMatches: false,
      },
      expected: {
        taskId: "forecast-future-leakage-v1",
        transferContractMatches: true,
      },
    });
    expect(finding?.observed).toHaveProperty("transferContractHash");
    expect(finding?.expected).toHaveProperty("transferContractHash");
    expect(result).not.toHaveProperty("selectedIr");
    expect(result).not.toHaveProperty("executionPlan");
    expect(JSON.stringify(finding)).not.toContain(update.changedSurface);
    expect(JSON.stringify(finding)).not.toContain(update.nonClaims[0]);
  });

  it("rejects a Transfer scene block bound to a non-pack evaluator", async () => {
    const fixture = await scientificFixture();
    fixture.artifacts.labScene = LabSceneV2Schema.parse({
      ...fixture.artifacts.labScene,
      blocks: [
        ...fixture.artifacts.labScene.blocks,
        {
          id: "transfer",
          type: "Transfer",
          prompt: "Apply the rule to a new surface.",
          evaluatorId: "model-authored-evaluator",
        },
      ],
    });

    const result = await scientificVerifier()(fixture);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "transfer_contract",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        sceneTransferBlockCount: 1,
        sceneTransferEvaluatorHash: await hashCanonical([
          "model-authored-evaluator",
        ]),
        sceneTransferBindingsMatch: false,
      },
      expected: {
        evaluatorTaskId: "forecasting-future-leakage-01",
        sceneTransferBindingsMatch: true,
      },
    });
    expect(result).not.toHaveProperty("selectedIr");
    expect(result).not.toHaveProperty("executionPlan");
    expect(JSON.stringify(finding)).not.toContain("model-authored-evaluator");
  });

  it("preserves historical v5 verification when the old bundle has no transfer descriptor", async () => {
    const fixture = await scientificFixture(42);
    const {
      fixedExecutionContract: _fixedExecutionContract,
      transferTask: _transferTask,
      ...conceptPack
    } = fixture.bundle.conceptPack;
    const historical = {
      ...fixture,
      bundle: RunnerLabCompileBundleV5Schema.parse({
        ...fixture.bundle,
        conceptPack,
      }),
    };

    const result = await scientificVerifier()(historical);

    expect(result.disposition).toBe("VERIFIED");
    expect(result.report).toMatchObject({
      verifierVersion: "scientific-candidate-verifier-v1",
    });
    expect(await hashCanonical(result.report)).toBe(
      "9c13944ebb1a848c5c4fc5bf47077d45d2bef123e45105868024424aee25dc07",
    );
    expect(result.report.invariants).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "transfer_contract" }),
      ]),
    );
  });

  it("preserves transfer-aware v2 verification when the fixed execution descriptor is absent", async () => {
    const fixture = await scientificFixture(42);
    const { fixedExecutionContract: _fixedExecutionContract, ...conceptPack } =
      fixture.bundle.conceptPack;
    const historical = {
      ...fixture,
      bundle: RunnerLabCompileBundleV5Schema.parse({
        ...fixture.bundle,
        conceptPack,
      }),
    };

    const result = await scientificVerifier()(historical);

    expect(result).toMatchObject({
      disposition: "VERIFIED",
      report: { verifierVersion: "scientific-candidate-verifier-v2" },
    });
    expect(result.report.invariants).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "epistemic_outcome_coverage" }),
      ]),
    );
  });

  it("returns an inconclusive disposition and no plan when no candidate is decisive", async () => {
    const fixture = await scientificFixture();
    const candidate = fixture.artifacts.experimentIr.candidateExperiments[0]!;
    const nonDecisiveIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      candidateExperiments: [
        {
          ...candidate,
          operationIds: ["leakage.random_row_split", "leakage.group_holdout"],
          interventions: candidate.interventions.filter(
            (run) => run.operation !== "leakage.identity_ablation",
          ),
        },
      ],
    });
    const input = await replaceIr(fixture, nonDecisiveIr);

    const result = await scientificVerifier()(input);

    expect(result.disposition).toBe("INCONCLUSIVE_NO_DECISIVE_TEST");
    expect(result.selection).toMatchObject({
      selectedCandidateId: null,
      rejectedCandidates: [
        expect.objectContaining({
          candidateId: "group-holdout-plus-ablation",
          reasonCodes: expect.arrayContaining(["MISSING_REQUIRED_OPERATION"]),
        }),
      ],
    });
    expect(result).not.toHaveProperty("selectedIr");
    expect(result).not.toHaveProperty("executionPlan");
    expect(result).not.toHaveProperty("executionPlanHash");
  });

  it("returns a repairable rejection when the full scene provenance does not bind the raw IR", async () => {
    const input = await scientificFixture();
    input.artifacts.labScene = LabSceneV2Schema.parse({
      ...input.artifacts.labScene,
      provenance: {
        ...input.artifacts.labScene.provenance,
        experimentIrHash: digest("f"),
      },
    });

    const result = await scientificVerifier()(input);

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(result.report.invariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "lab_scene_provenance",
          passed: false,
        }),
      ]),
    );
    expect(result).not.toHaveProperty("selectedIr");
    expect(result).not.toHaveProperty("executionPlan");
  });

  it("reports both non-claim bindings when the contract diverges from the selected IR", async () => {
    const fixture = await scientificFixture();
    const discriminationContract = DiscriminationContractV1Schema.parse({
      ...fixture.artifacts.discriminationContract,
      nonClaims: ["This contract-only limitation is not bound to the IR."],
    });
    const input = await replaceContract(fixture, discriminationContract);

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "discrimination_binding",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        nonClaimsMatch: false,
        contractNonClaimsHash: await hashCanonical(
          discriminationContract.nonClaims,
        ),
        experimentIrNonClaimsHash: await hashCanonical(
          fixture.artifacts.experimentIr.nonClaims,
        ),
      },
      expected: {
        nonClaimsMatch: true,
      },
    });
    expect(JSON.stringify(finding)).not.toContain(
      discriminationContract.nonClaims[0],
    );
  });

  it("rejects a selected experiment that cannot represent the fixed classifier inconclusive outcome", async () => {
    const fixture = await scientificFixture();
    const unsupportedConditionId = "model-authored-uncertain-region";
    const discriminationContract = DiscriminationContractV1Schema.parse({
      ...fixture.artifacts.discriminationContract,
      inconclusiveConditionIds: [unsupportedConditionId],
    });
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      candidateExperiments:
        fixture.artifacts.experimentIr.candidateExperiments.map(
          (candidate) => ({
            ...candidate,
            inconclusiveConditionIds: [unsupportedConditionId],
          }),
        ),
      inconclusiveConditions: [
        {
          id: unsupportedConditionId,
          description:
            "The model-authored contract declares a different uncertain region.",
          nextExperimentId: "group-holdout-plus-ablation",
        },
      ],
    });
    const input = {
      ...fixture,
      artifacts: {
        ...fixture.artifacts,
        discriminationContract,
        experimentIr,
        labScene: await sceneFor(
          fixture.bundle,
          discriminationContract,
          experimentIr,
        ),
      },
    };

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "epistemic_outcome_coverage",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        inconclusiveOutcomes: [
          {
            conditionId: unsupportedConditionId,
            description:
              "The model-authored contract declares a different uncertain region.",
            nextExperimentId: "group-holdout-plus-ablation",
          },
        ],
      },
      expected: {
        inconclusiveOutcomes: [
          {
            conditionId: "gap-within-tolerance",
            description:
              "The measured gap falls between the two decisive patterns.",
            nextExperimentId: "group-holdout-plus-ablation",
          },
        ],
      },
    });
    expect(result).not.toHaveProperty("selectedIr");
    expect(result).not.toHaveProperty("executionPlan");
  });

  it("rejects a model-authored seed that drifts from the fixed run contract", async () => {
    const fixture = await scientificFixture();
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      candidateExperiments:
        fixture.artifacts.experimentIr.candidateExperiments.map(
          (candidate) => ({
            ...candidate,
            baseline: { ...candidate.baseline, seed: 17 },
            interventions: candidate.interventions.map((run) => ({
              ...run,
              seed: 17,
            })),
          }),
        ),
    });
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "selected_execution_semantics",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: { runSeeds: [17, 17, 17] },
      expected: { runSeed: 1729 },
    });
    expect(result).not.toHaveProperty("selectedIr");
    expect(result).not.toHaveProperty("executionPlan");
  });

  it("rejects reordered Belief Spec evidence before fixed execution", async () => {
    const fixture = await scientificFixture();
    const reorderedEvidence = [
      ...fixture.bundle.approvedBeliefSpec.evidenceRefs,
    ].reverse();
    const discriminationContract = DiscriminationContractV1Schema.parse({
      ...fixture.artifacts.discriminationContract,
      evidenceRefs: reorderedEvidence,
    });
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      evidenceRefs: reorderedEvidence,
    });
    const input = {
      bundle: fixture.bundle,
      artifacts: {
        ...fixture.artifacts,
        discriminationContract,
        experimentIr,
        labScene: await sceneFor(
          fixture.bundle,
          discriminationContract,
          experimentIr,
        ),
      },
    };

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "evidence_lineage",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        contractMatchesApproved: false,
        experimentIrMatchesApproved: false,
        approvedEvidenceHash: await hashCanonical(
          fixture.bundle.approvedBeliefSpec.evidenceRefs,
        ),
        contractEvidenceHash: await hashCanonical(reorderedEvidence),
        experimentIrEvidenceHash: await hashCanonical(reorderedEvidence),
      },
      expected: {
        contractMatchesApproved: true,
        experimentIrMatchesApproved: true,
      },
    });
    for (const evidenceRef of fixture.bundle.approvedBeliefSpec.evidenceRefs) {
      expect(JSON.stringify(finding)).not.toContain(evidenceRef.excerpt);
    }
  });

  it("reports a contract-to-IR candidate ID mismatch without echoing unbounded contract text", async () => {
    const fixture = await scientificFixture();
    const discriminationContract = DiscriminationContractV1Schema.parse({
      ...fixture.artifacts.discriminationContract,
      candidateExperimentIds: ["group-holdout"],
    });
    const input = await replaceContract(fixture, discriminationContract);

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "candidate_lineage",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        candidateIdsMatch: false,
        contractCandidateIdsHash: await hashCanonical(
          discriminationContract.candidateExperimentIds,
        ),
        experimentIrCandidateIdsHash: await hashCanonical(
          fixture.artifacts.experimentIr.candidateExperiments.map(
            (candidate) => candidate.id,
          ),
        ),
      },
      expected: {
        candidateIdsMatch: true,
        allowedCandidateIds: fixture.bundle.conceptPack.candidateExperimentIds,
      },
    });
  });

  it("reports candidate operation allowlist violations", async () => {
    const fixture = await scientificFixture();
    const original = fixture.artifacts.experimentIr.candidateExperiments[0]!;
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      candidateExperiments: [
        {
          ...original,
          operationIds: [
            ...original.operationIds,
            "imbalance.majority_baseline",
          ],
        },
      ],
    });
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "candidate_lineage",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        candidates: [
          {
            id: original.id,
            operationIds: experimentIr.candidateExperiments[0]!.operationIds,
          },
        ],
      },
      expected: {
        allowedOperationIds: fixture.bundle.conceptPack.allowedOperations,
        allowedObservableIds: fixture.bundle.conceptPack.allowedMetrics,
      },
    });
  });

  it("reports candidate observable allowlist violations", async () => {
    const fixture = await scientificFixture();
    const original = fixture.artifacts.experimentIr.candidateExperiments[0]!;
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      candidateExperiments: [
        {
          ...original,
          observableIds: [...original.observableIds, "precision"],
        },
      ],
    });
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);
    const finding = result.report.invariants?.find(
      (candidate) => candidate.name === "candidate_lineage",
    );

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(finding).toMatchObject({
      passed: false,
      observed: {
        candidates: [
          {
            id: original.id,
            observableIds: experimentIr.candidateExperiments[0]!.observableIds,
          },
        ],
      },
      expected: {
        allowedOperationIds: fixture.bundle.conceptPack.allowedOperations,
        allowedObservableIds: fixture.bundle.conceptPack.allowedMetrics,
      },
    });
  });

  it("accepts only the exact pack-owned Boundary Sweep request before selection", async () => {
    const fixture = await scientificFixture();
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      boundarySweep: {
        sweepId: "leakage-recurrence-sweep",
        axisIds: ["test_fraction", "observations_per_entity"],
        gridPresetId: "leakage-boundary-grid-v1",
        observableId: "optimism_gap",
        maxCells: 25,
      },
    });
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);

    expect(result.disposition).toBe("VERIFIED");
    expect(result.report.invariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "boundary_sweep_contract",
          passed: true,
        }),
      ]),
    );
    expect(result.selectedIr?.boundarySweep).toEqual(
      experimentIr.boundarySweep,
    );
  });

  it("rejects omission of the Boundary Sweep declared by a new compiler bundle", async () => {
    const fixture = await scientificFixture();
    const { boundarySweep: _boundarySweep, ...withoutBoundary } =
      fixture.artifacts.experimentIr;
    const experimentIr = ExperimentIRV5Schema.parse(withoutBoundary);
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(result.report.invariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "boundary_sweep_contract",
          passed: false,
        }),
      ]),
    );
  });

  it("rejects a Boundary Sweep that changes the frozen grid", async () => {
    const fixture = await scientificFixture();
    const experimentIr = ExperimentIRV5Schema.parse({
      ...fixture.artifacts.experimentIr,
      boundarySweep: {
        sweepId: "leakage-recurrence-sweep",
        axisIds: ["test_fraction", "observations_per_entity"],
        gridPresetId: "leakage-boundary-grid-v1",
        observableId: "optimism_gap",
        maxCells: 24,
      },
    });
    const input = await replaceIr(fixture, experimentIr);

    const result = await scientificVerifier()(input);

    expect(result.disposition).toBe("REPAIRABLE_REJECTION");
    expect(result.report.invariants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "boundary_sweep_contract",
          passed: false,
        }),
      ]),
    );
    expect(result).not.toHaveProperty("selectedIr");
  });
});
