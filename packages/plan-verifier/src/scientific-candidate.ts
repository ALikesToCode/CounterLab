import { z } from "zod";

import {
  DiscriminationContractV1Schema,
  type ArtifactManifest,
  type EvidenceRef,
  type ExperimentPlanV2,
} from "@counterlab/contracts";
import { getConceptPack } from "@counterlab/concept-registry";
import {
  ExperimentIRV5Schema,
  RunnerLabCompileBundleV5Schema,
  hashExperimentIR,
  projectExperimentIRV5ToPlanV2,
  type ExperimentIRV5,
  type RunnerLabCompileBundleV5,
} from "@counterlab/experiment-ir";
import {
  applyExperimentSelection,
  scoreExperiments,
  type ExperimentSelection,
} from "@counterlab/experiment-scorer";
import { LabSceneV2Schema } from "@counterlab/generative-ui-contracts";
import { hashCanonical } from "@counterlab/session-core";

const PublicRationaleSchema = z
  .string()
  .trim()
  .min(1)
  .max(8_192)
  .refine(
    (value) =>
      !/(?:<\/?(?:script|iframe|style)|javascript:|data:text\/html)/iu.test(
        value,
      ),
    "public rationale contains active presentation content",
  )
  .refine(
    (value) =>
      !/(?:\b\d+(?:\.\d+)?\s*%|\b(?:accuracy|recall|precision|f1|auc)\s*(?:is|=|:)?\s*0?\.\d+)/iu.test(
        value,
      ),
    "public rationale must not contain a generated result literal",
  );

export type ScientificCandidateArtifactsV5 = {
  discriminationContract: unknown;
  experimentIr: unknown;
  labScene: unknown;
  publicRationale: unknown;
};

export type ScientificCandidateInvariant = {
  name: string;
  passed: boolean;
  observed: unknown;
  expected: unknown;
  counterexample?: string;
};

export type ScientificCandidateReportV1 = {
  schemaVersion: "1";
  status: "VERIFIED" | "REJECTED";
  reasonCode:
    | "SELECTED"
    | "SCIENTIFIC_CANDIDATE_INVALID"
    | "INCONCLUSIVE_NO_DECISIVE_TEST";
  verifierVersion: "scientific-candidate-verifier-v1";
  discriminationContractHash: string;
  rawExperimentIrHash: string;
  labSceneHash: string;
  selectionHash?: string;
  selectedIrHash?: string;
  executionPlanHash?: string;
  invariantCount: number;
  invariants: ScientificCandidateInvariant[];
};

export type ScientificCandidateVerificationV1 =
  | {
      disposition: "VERIFIED";
      report: ScientificCandidateReportV1;
      selection: ExperimentSelection;
      selectedIr: ExperimentIRV5;
      selectedIrHash: string;
      executionPlan: ExperimentPlanV2;
      executionPlanHash: string;
    }
  | {
      disposition: "REPAIRABLE_REJECTION";
      report: ScientificCandidateReportV1;
      selection?: ExperimentSelection;
    }
  | {
      disposition: "INCONCLUSIVE_NO_DECISIVE_TEST";
      report: ScientificCandidateReportV1;
      selection: ExperimentSelection;
    };

export type VerifyScientificCandidateV5Input = {
  bundle: unknown;
  artifacts: ScientificCandidateArtifactsV5;
};

function diagnostic(value: unknown): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(diagnostic);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, diagnostic(nested)]),
    );
  }
  return String(value);
}

function invariant(
  name: string,
  passed: boolean,
  observed: unknown,
  expected: unknown,
  counterexample?: string,
): ScientificCandidateInvariant {
  return {
    name,
    passed,
    observed: diagnostic(observed),
    expected: diagnostic(expected),
    ...(counterexample === undefined ? {} : { counterexample }),
  };
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

function evidenceAuthorityKey(evidence: EvidenceRef): string {
  return [
    evidence.kind,
    evidence.cellIndex ?? "",
    evidence.outputIndex ?? "",
    evidence.hash,
  ].join(":");
}

async function evidenceResolves(
  evidence: EvidenceRef,
  manifest: ArtifactManifest,
  claim: string,
): Promise<boolean> {
  if (evidence.kind === "schema") {
    return evidence.hash === (await hashCanonical(manifest.schemaSummary));
  }
  if (evidence.kind === "learner_claim") {
    return evidence.hash === (await hashCanonical(claim));
  }
  const cell = manifest.cells.find(
    (candidate) => candidate.index === evidence.cellIndex,
  );
  if (cell === undefined) return false;
  if (evidence.kind === "code") return evidence.hash === cell.sourceSha256;
  if (evidence.outputIndex === undefined) return false;
  if (cell.outputHashes[evidence.outputIndex] !== evidence.hash) return false;
  return (
    evidence.kind !== "metric" ||
    cell.metricCandidates.some(
      (candidate) => candidate.outputIndex === evidence.outputIndex,
    )
  );
}

function fixedPackSnapshot(pack: ReturnType<typeof getConceptPack>) {
  return {
    id: pack.id,
    version: pack.version,
    title: pack.title,
    allowedOperations: pack.allowedOperations,
    allowedMetrics: pack.allowedMetrics,
    allowedVisualizations: pack.allowedVisualizations,
    verifierInvariants: pack.verifierContract.invariants,
    candidateExperimentIds: pack.scientificMethod.candidateExperimentIds,
    planRequirements: pack.experimentPlanRules,
  };
}

function selectedExecutionSemantics(
  ir: ExperimentIRV5,
  plan: ExperimentPlanV2,
): { passed: boolean; observed: unknown; expected: unknown } {
  if (ir.selection.status !== "SELECTED") {
    return {
      passed: false,
      observed: ir.selection.status,
      expected: "SELECTED",
    };
  }
  const selectedCandidateId = ir.selection.candidateId;
  const candidate = ir.candidateExperiments.find(
    (item) => item.id === selectedCandidateId,
  );
  if (candidate === undefined) {
    return {
      passed: false,
      observed: selectedCandidateId,
      expected: "a resolving candidate",
    };
  }
  const runs = [candidate.baseline, ...candidate.interventions];
  const operations = runs.map((run) => run.operation);

  if (ir.concept === "entity_leakage") {
    const baseline = runs.find(
      (run) => run.operation === "leakage.random_row_split",
    );
    const group = runs.find((run) => run.operation === "leakage.group_holdout");
    const ablation = runs.find(
      (run) => run.operation === "leakage.identity_ablation",
    );
    const typed = [baseline, group, ablation].every(
      (run) => run?.concept === "entity_leakage",
    );
    const controlsMatch =
      typed &&
      baseline?.concept === "entity_leakage" &&
      group?.concept === "entity_leakage" &&
      ablation?.concept === "entity_leakage" &&
      baseline.model === group.model &&
      baseline.model === ablation.model &&
      baseline.seed === group.seed &&
      baseline.seed === ablation.seed &&
      baseline.testFraction === group.testFraction &&
      baseline.testFraction === ablation.testFraction &&
      baseline.entityField === group.entityField &&
      baseline.entityField === ablation.entityField &&
      baseline.dropIdentity === false &&
      group.dropIdentity === false &&
      ablation.dropIdentity === true;
    const expectedOperations = [
      "leakage.random_row_split",
      "leakage.group_holdout",
      "leakage.identity_ablation",
    ];
    return {
      passed:
        sameSet(operations, expectedOperations) &&
        controlsMatch &&
        sameSet(candidate.changedVariableIds, [
          "split_strategy",
          "identity_feature",
        ]) &&
        plan.baseline.operation === "leakage.random_row_split",
      observed: {
        operations,
        changedVariableIds: candidate.changedVariableIds,
        controlsMatch,
      },
      expected: {
        operations: expectedOperations,
        changedVariableIds: ["split_strategy", "identity_feature"],
        controlsMatch: true,
      },
    };
  }

  const baseline = runs.find(
    (run) => run.operation === "imbalance.majority_baseline",
  );
  const stratified = runs.find(
    (run) => run.operation === "imbalance.stratified_holdout",
  );
  const threshold = runs.find(
    (run) => run.operation === "imbalance.threshold_sweep",
  );
  const prevalence = runs.find(
    (run) => run.operation === "imbalance.prevalence_sweep",
  );
  const expectedOperations = [
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
  ];
  const controlsMatch =
    baseline?.concept === "class_imbalance" &&
    stratified?.concept === "class_imbalance" &&
    threshold?.concept === "class_imbalance" &&
    prevalence?.concept === "class_imbalance" &&
    baseline.model === "majority_baseline" &&
    baseline.prevalenceScenario === "observed" &&
    stratified.model === "logistic_regression" &&
    threshold.model === "logistic_regression" &&
    prevalence.model === "logistic_regression" &&
    new Set(runs.map((run) => run.seed)).size === 1 &&
    threshold.threshold !== stratified.threshold &&
    prevalence.threshold === threshold.threshold &&
    prevalence.prevalenceScenario !== threshold.prevalenceScenario;
  const pack = getConceptPack("class_imbalance");
  return {
    passed:
      sameSet(operations, expectedOperations) &&
      controlsMatch &&
      sameSet(candidate.changedVariableIds, [
        "decision_threshold",
        "class_prevalence",
      ]) &&
      sameSet(plan.metrics, pack.allowedMetrics) &&
      sameSet(plan.visualizations, pack.allowedVisualizations),
    observed: {
      operations,
      changedVariableIds: candidate.changedVariableIds,
      controlsMatch,
      metrics: plan.metrics,
      visualizations: plan.visualizations,
    },
    expected: {
      operations: expectedOperations,
      changedVariableIds: ["decision_threshold", "class_prevalence"],
      controlsMatch: true,
      metrics: pack.allowedMetrics,
      visualizations: pack.allowedVisualizations,
    },
  };
}

async function rejectionReport(
  artifacts: ScientificCandidateArtifactsV5,
  invariants: ScientificCandidateInvariant[],
  options: {
    reasonCode?: ScientificCandidateReportV1["reasonCode"];
    selection?: ExperimentSelection;
  } = {},
): Promise<ScientificCandidateReportV1> {
  return {
    schemaVersion: "1",
    status: "REJECTED",
    reasonCode: options.reasonCode ?? "SCIENTIFIC_CANDIDATE_INVALID",
    verifierVersion: "scientific-candidate-verifier-v1",
    discriminationContractHash: await hashCanonical(
      artifacts.discriminationContract,
    ),
    rawExperimentIrHash: await hashCanonical(artifacts.experimentIr),
    labSceneHash: await hashCanonical(artifacts.labScene),
    ...(options.selection === undefined
      ? {}
      : { selectionHash: await hashCanonical(options.selection) }),
    invariantCount: invariants.length,
    invariants,
  };
}

export async function verifyScientificCandidateV5(
  input: VerifyScientificCandidateV5Input,
): Promise<ScientificCandidateVerificationV1> {
  const bundleResult = RunnerLabCompileBundleV5Schema.safeParse(input.bundle);
  const contractResult = DiscriminationContractV1Schema.safeParse(
    input.artifacts.discriminationContract,
  );
  const irResult = ExperimentIRV5Schema.safeParse(input.artifacts.experimentIr);
  const sceneResult = LabSceneV2Schema.safeParse(input.artifacts.labScene);
  const rationaleResult = PublicRationaleSchema.safeParse(
    input.artifacts.publicRationale,
  );
  if (
    !bundleResult.success ||
    !contractResult.success ||
    !irResult.success ||
    !sceneResult.success ||
    !rationaleResult.success
  ) {
    const issues = [
      ["bundle", bundleResult],
      ["discrimination-contract.json", contractResult],
      ["experiment-ir.json", irResult],
      ["lab-scene.json", sceneResult],
      ["public-rationale.md", rationaleResult],
    ]
      .filter((entry) => !(entry[1] as { success: boolean }).success)
      .map(([label, result]) => ({
        label,
        issue:
          (result as { error?: z.ZodError }).error?.issues[0]?.message ??
          "invalid structure",
      }));
    const checks = [
      invariant(
        "structural_contracts",
        false,
        issues,
        "Runner bundle v5 and four bounded scientific artifacts",
        "One or more scientific artifacts failed strict schema validation.",
      ),
    ];
    return {
      disposition: "REPAIRABLE_REJECTION",
      report: await rejectionReport(input.artifacts, checks),
    };
  }

  const bundle: RunnerLabCompileBundleV5 = bundleResult.data;
  const contract = contractResult.data;
  const rawIr = irResult.data;
  const scene = sceneResult.data;
  const pack = getConceptPack(bundle.conceptPack.id);
  const [
    manifestHash,
    beliefSpecHash,
    predictionHash,
    contractHash,
    rawIrHash,
  ] = await Promise.all([
    hashCanonical(bundle.artifactManifest),
    hashCanonical(bundle.approvedBeliefSpec),
    hashCanonical(
      Object.fromEntries(
        Object.entries(bundle.prediction).filter(
          ([key]) => key !== "immutableHash",
        ),
      ),
    ),
    hashCanonical(contract),
    hashExperimentIR(rawIr),
  ]);
  const support = pack.supportDetector(bundle.artifactManifest);
  const approvedEvidence = new Set(
    bundle.approvedBeliefSpec.evidenceRefs.map(evidenceAuthorityKey),
  );
  const supportEvidence = new Set(support.evidence.map(evidenceAuthorityKey));
  const contractEvidence = contract.evidenceRefs.map(evidenceAuthorityKey);
  const irEvidence = rawIr.evidenceRefs.map(evidenceAuthorityKey);
  const allEvidenceResolves = (
    await Promise.all(
      [...contract.evidenceRefs, ...rawIr.evidenceRefs].map((evidence) =>
        evidenceResolves(
          evidence,
          bundle.artifactManifest,
          bundle.approvedBeliefSpec.claim,
        ),
      ),
    )
  ).every(Boolean);
  const hypothesisAuthority = bundle.approvedBeliefSpec.hypotheses.map(
    ({ id, statement, conditions, nonClaims }) => ({
      id,
      statement,
      conditions,
      nonClaims,
    }),
  );
  const irHypothesisAuthority = rawIr.hypotheses.map(
    ({ id, statement, conditions, nonClaims }) => ({
      id,
      statement,
      conditions,
      nonClaims,
    }),
  );
  const candidateIds = rawIr.candidateExperiments.map(
    (candidate) => candidate.id,
  );
  const allowedCandidateIds = new Set(
    pack.scientificMethod.candidateExperimentIds,
  );
  const checks: ScientificCandidateInvariant[] = [
    invariant(
      "bundle_authority",
      manifestHash === bundle.artifactManifestHash &&
        beliefSpecHash === bundle.beliefSpecHash &&
        predictionHash === bundle.prediction.immutableHash &&
        sameJson(bundle.conceptPack, fixedPackSnapshot(pack)),
      {
        manifestHashMatches: manifestHash === bundle.artifactManifestHash,
        beliefSpecHashMatches: beliefSpecHash === bundle.beliefSpecHash,
        predictionHashMatches:
          predictionHash === bundle.prediction.immutableHash,
        packSnapshotMatches: sameJson(
          bundle.conceptPack,
          fixedPackSnapshot(pack),
        ),
      },
      "canonical manifest, Belief Spec, Prediction, and frozen Subject Pack",
    ),
    invariant(
      "codex_provenance",
      rawIr.selection.status === "UNSELECTED" &&
        rawIr.provenance.kind === "codex" &&
        rawIr.provenance.generatorId === bundle.provenance.generatorId &&
        rawIr.provenance.promptHash === bundle.provenance.promptHash &&
        sameJson(rawIr.provenance.inputHashes, bundle.provenance.inputHashes) &&
        sameJson(rawIr.resourceLimits, bundle.resourceLimits),
      {
        selection: rawIr.selection.status,
        provenanceKind: rawIr.provenance.kind,
      },
      "UNSELECTED IR with exact compiler provenance and resource limits",
    ),
    invariant(
      "artifact_authority_lineage",
      contract.sessionId === bundle.sessionId &&
        rawIr.sessionId === bundle.sessionId &&
        contract.artifactManifestHash === manifestHash &&
        rawIr.artifactManifestHash === manifestHash &&
        contract.beliefSpecId === bundle.approvedBeliefSpec.id &&
        rawIr.beliefSpecId === bundle.approvedBeliefSpec.id &&
        contract.beliefSpecHash === beliefSpecHash &&
        rawIr.beliefSpecHash === beliefSpecHash &&
        contract.concept === pack.id &&
        rawIr.concept === pack.id &&
        contract.conceptPackVersion === pack.version &&
        rawIr.conceptPackVersion === pack.version,
      {
        contractSession: contract.sessionId,
        irSession: rawIr.sessionId,
        concept: rawIr.concept,
        packVersion: rawIr.conceptPackVersion,
      },
      {
        sessionId: bundle.sessionId,
        concept: pack.id,
        packVersion: pack.version,
      },
    ),
    invariant(
      "hypothesis_lineage",
      sameJson(irHypothesisAuthority, hypothesisAuthority) &&
        contract.hypotheses.every(
          (hypothesis, index) =>
            hypothesis.id === rawIr.hypotheses[index]?.id &&
            hypothesis.statement === rawIr.hypotheses[index]?.statement &&
            hypothesis.decisivePatternId ===
              rawIr.hypotheses[index]?.predictedPattern.patternId,
        ),
      rawIr.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        patternId: hypothesis.predictedPattern.patternId,
      })),
      "exact learner-approved hypotheses and decisive patterns",
    ),
    invariant(
      "evidence_lineage",
      allEvidenceResolves &&
        sameSet(contractEvidence, irEvidence) &&
        contractEvidence.every((key) => approvedEvidence.has(key)) &&
        irEvidence.some((key) => supportEvidence.has(key)),
      {
        allEvidenceResolves,
        contractCount: contractEvidence.length,
        irCount: irEvidence.length,
        usesPackRoutingEvidence: irEvidence.some((key) =>
          supportEvidence.has(key),
        ),
      },
      "approved, resolving Artifact Manifest evidence including Subject Pack routing evidence",
    ),
    invariant(
      "candidate_lineage",
      sameSet(contract.candidateExperimentIds, candidateIds) &&
        candidateIds.every((candidateId) =>
          allowedCandidateIds.has(candidateId),
        ) &&
        rawIr.candidateExperiments.every(
          (candidate) =>
            candidate.operationIds.every((operation) =>
              pack.allowedOperations.includes(operation),
            ) &&
            candidate.observableIds.every((metric) =>
              pack.allowedMetrics.includes(metric),
            ),
        ) &&
        rawIr.visualizations.every((visualization) =>
          pack.allowedVisualizations.includes(visualization),
        ),
      {
        candidateIds,
        visualizations: rawIr.visualizations,
        boundarySweepRequested: rawIr.boundarySweep !== undefined,
      },
      {
        candidateIds: pack.scientificMethod.candidateExperimentIds,
        allowedVisualizations: pack.allowedVisualizations,
        boundarySweepHandledSeparately: true,
      },
    ),
    (() => {
      const request = rawIr.boundarySweep;
      const contract =
        request === undefined
          ? undefined
          : pack.scientificMethod.epistemic.policy.boundarySweeps.find(
              (candidate) => candidate.sweepId === request.sweepId,
            );
      const authorized =
        request === undefined ||
        (contract !== undefined &&
          sameJson(contract.axisIds, request.axisIds) &&
          contract.gridPresetId === request.gridPresetId &&
          contract.observableId === request.observableId &&
          contract.maxCells === request.maxCells);
      return invariant(
        "boundary_sweep_contract",
        authorized,
        request ?? null,
        contract ?? null,
        authorized
          ? undefined
          : "The Boundary Sweep must match one exact frozen Subject Pack contract.",
      );
    })(),
    invariant(
      "lab_scene_provenance",
      scene.provenance.discriminationContractHash === contractHash &&
        scene.provenance.experimentIrHash === rawIrHash,
      {
        contractHashMatches:
          scene.provenance.discriminationContractHash === contractHash,
        rawIrHashMatches: scene.provenance.experimentIrHash === rawIrHash,
      },
      { contractHashMatches: true, rawIrHashMatches: true },
    ),
    invariant(
      "scene_draft_authority",
      scene.sessionId === bundle.sessionId &&
        scene.concept === pack.id &&
        scene.supportLabel !== "VERIFIED_TEST" &&
        !scene.blocks.some((block) => block.type === "ProofBadge") &&
        scene.blocks
          .filter((block) => block.type === "Hypothesis")
          .every(
            (block) =>
              block.current ===
                bundle.approvedBeliefSpec.hypotheses[0].statement &&
              block.competing ===
                bundle.approvedBeliefSpec.hypotheses[1].statement,
          ) &&
        scene.blocks
          .filter((block) => block.type === "WhyThisTest")
          .every((block) => block.text === contract.whyThisTest) &&
        scene.blocks.some((block) => block.type === "Hypothesis") &&
        scene.blocks.some((block) => block.type === "WhyThisTest"),
      {
        supportLabel: scene.supportLabel,
      },
      "an unverified scene bound to the raw IR, contract, hypotheses, and Why this test copy",
    ),
  ];

  if (checks.some((check) => !check.passed)) {
    return {
      disposition: "REPAIRABLE_REJECTION",
      report: await rejectionReport(input.artifacts, checks),
    };
  }

  const selection = scoreExperiments({
    beliefSpec: bundle.approvedBeliefSpec,
    beliefSpecHash,
    ir: rawIr,
    policy: pack.scientificMethod.scoringPolicy,
  });
  if (selection.selectedCandidateId === null) {
    const selectionCheck = invariant(
      "decisive_candidate_selection",
      false,
      selection.rejectedCandidates,
      `one candidate above separation ${selection.requiredSeparation}`,
      "INCONCLUSIVE_NO_DECISIVE_TEST: no proposed candidate passed the fixed scorer.",
    );
    const report = await rejectionReport(
      input.artifacts,
      [...checks, selectionCheck],
      { reasonCode: "INCONCLUSIVE_NO_DECISIVE_TEST", selection },
    );
    return {
      disposition: "INCONCLUSIVE_NO_DECISIVE_TEST",
      report,
      selection,
    };
  }

  const selectedIr = applyExperimentSelection(rawIr, selection);
  const executionPlan = projectExperimentIRV5ToPlanV2(selectedIr);
  const selectedCandidate = selectedIr.candidateExperiments.find(
    (candidate) => candidate.id === selection.selectedCandidateId,
  );
  if (selectedCandidate === undefined) {
    throw new TypeError("fixed scorer selected an unresolved candidate");
  }
  const selectedSemantics = selectedExecutionSemantics(
    selectedIr,
    executionPlan,
  );
  const postSelectionChecks = [
    invariant(
      "discrimination_binding",
      contract.candidateExperimentIds.includes(selectedCandidate.id) &&
        sameSet(
          contract.changedVariableIds,
          selectedCandidate.changedVariableIds,
        ) &&
        sameSet(
          contract.controlledVariableIds,
          selectedCandidate.heldConstantIds,
        ) &&
        sameSet(contract.observableIds, selectedCandidate.observableIds) &&
        sameSet(
          contract.inconclusiveConditionIds,
          selectedCandidate.inconclusiveConditionIds,
        ) &&
        sameSet(contract.nonClaims, selectedIr.nonClaims),
      {
        selectedCandidateId: selectedCandidate.id,
        changedVariableIds: contract.changedVariableIds,
        controlledVariableIds: contract.controlledVariableIds,
        observableIds: contract.observableIds,
      },
      "Discrimination Contract exactly bound to the fixed selected candidate",
    ),
    invariant(
      "selected_execution_semantics",
      selectedSemantics.passed,
      selectedSemantics.observed,
      selectedSemantics.expected,
      "The fixed-selected candidate does not compose the complete Subject Pack execution contract.",
    ),
    invariant(
      "projected_plan_binding",
      executionPlan.sessionId === bundle.sessionId &&
        executionPlan.artifactManifestHash === manifestHash &&
        executionPlan.beliefTestId === bundle.approvedBeliefSpec.id &&
        executionPlan.concept === pack.id &&
        executionPlan.conceptPackVersion === pack.version &&
        sameJson(executionPlan.evidenceRefs, selectedIr.evidenceRefs) &&
        sameJson(executionPlan.resourceLimits, bundle.resourceLimits),
      {
        sessionId: executionPlan.sessionId,
        concept: executionPlan.concept,
        packVersion: executionPlan.conceptPackVersion,
      },
      {
        sessionId: bundle.sessionId,
        concept: pack.id,
        packVersion: pack.version,
      },
    ),
  ];
  const allChecks = [...checks, ...postSelectionChecks];
  if (postSelectionChecks.some((check) => !check.passed)) {
    return {
      disposition: "REPAIRABLE_REJECTION",
      selection,
      report: await rejectionReport(input.artifacts, allChecks, { selection }),
    };
  }

  const [selectionHash, selectedIrHash, executionPlanHash, labSceneHash] =
    await Promise.all([
      hashCanonical(selection),
      hashExperimentIR(selectedIr),
      hashCanonical(executionPlan),
      hashCanonical(scene),
    ]);
  const report: ScientificCandidateReportV1 = {
    schemaVersion: "1",
    status: "VERIFIED",
    reasonCode: "SELECTED",
    verifierVersion: "scientific-candidate-verifier-v1",
    discriminationContractHash: contractHash,
    rawExperimentIrHash: rawIrHash,
    labSceneHash,
    selectionHash,
    selectedIrHash,
    executionPlanHash,
    invariantCount: allChecks.length,
    invariants: allChecks,
  };
  return {
    disposition: "VERIFIED",
    report,
    selection,
    selectedIr,
    selectedIrHash,
    executionPlan,
    executionPlanHash,
  };
}
