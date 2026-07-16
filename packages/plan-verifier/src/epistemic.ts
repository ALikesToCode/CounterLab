import { z } from "zod";

import {
  getConceptPack,
  type ConceptPackDefinition,
  type SubjectPackEpistemicAdapter,
} from "@counterlab/concept-registry";
import {
  ArtifactManifestSchema,
  BeliefSpecV2Schema,
  EpistemicFindingCodeSchema,
  EpistemicObservationV1Schema,
  EvidenceVerdictSchema,
  HostedVerifiedResultSetV2Schema,
  type ArtifactManifest,
  type EpistemicFindingCode,
  type EpistemicObservationV1,
  type EvidenceRef,
  type EvidenceVerdict,
} from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  hashExperimentIR,
  type ExperimentIRV5,
} from "@counterlab/experiment-ir";
import { scoreExperiments } from "@counterlab/experiment-scorer";
import { hashCanonical } from "@counterlab/session-core";

const Sha256Schema = z
  .string()
  .regex(/^[a-f0-9]{64}$/, "expected a lowercase SHA-256 digest");
const BoundedCopySchema = z.string().trim().min(1).max(500);

export const EpistemicPresentationV1Schema = z
  .object({
    scope: BoundedCopySchema,
    learnerFacingClaims: z.array(BoundedCopySchema).max(8),
  })
  .strict();

export const TechnicalInvariantSchema = z
  .object({
    name: z.string().trim().min(1),
    passed: z.boolean(),
    observed: z.unknown(),
    expected: z.unknown(),
    counterexample: z.string().optional(),
  })
  .strict();

export const TechnicalResultVerificationReportSchema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.enum(["VERIFIED", "REJECTED"]),
    verifierVersion: z.literal("hosted-result-verifier-v1"),
    resultHash: Sha256Schema,
    invariantCount: z.number().int().nonnegative(),
    invariants: z.array(TechnicalInvariantSchema),
  })
  .strict()
  .superRefine((report, context) => {
    if (report.invariantCount !== report.invariants.length) {
      context.addIssue({
        code: "custom",
        message: "technical invariant count does not match report contents",
        path: ["invariantCount"],
      });
    }
    if (
      report.status === "VERIFIED" &&
      report.invariants.some((invariant) => !invariant.passed)
    ) {
      context.addIssue({
        code: "custom",
        message: "verified technical report contains a failed invariant",
        path: ["status"],
      });
    }
  });

export const EpistemicFindingSchema = z
  .object({
    id: z.string().trim().min(1),
    code: EpistemicFindingCodeSchema,
    message: z.string().trim().min(1),
    observed: z.unknown(),
    expected: z.unknown(),
    counterexample: z.string().optional(),
  })
  .strict();

export const EpistemicVerificationReportV1Schema = z
  .object({
    schemaVersion: z.literal("1"),
    status: z.enum(["VERIFIED", "REJECTED"]),
    verifierVersion: z.string().trim().min(1),
    policyVersion: z.string().trim().min(1),
    classifierId: z.string().trim().min(1),
    irHash: Sha256Schema,
    technicalReportHash: Sha256Schema,
    technicalReport: TechnicalResultVerificationReportSchema,
    resultHash: Sha256Schema.optional(),
    findingCount: z.number().int().nonnegative(),
    findings: z.array(EpistemicFindingSchema),
    observation: EpistemicObservationV1Schema.optional(),
    verdict: EvidenceVerdictSchema,
  })
  .strict()
  .superRefine((report, context) => {
    if (report.findingCount !== report.findings.length) {
      context.addIssue({
        code: "custom",
        message: "epistemic finding count does not match report contents",
        path: ["findingCount"],
      });
    }
    if (
      report.verdict.irHash !== report.irHash ||
      report.verdict.technicalReportHash !== report.technicalReportHash ||
      report.verdict.verifierVersion !== report.verifierVersion
    ) {
      context.addIssue({
        code: "custom",
        message: "Evidence Verdict authority does not match its report",
        path: ["verdict"],
      });
    }
    if (report.status === "VERIFIED") {
      if (
        report.findings.length !== 0 ||
        report.observation === undefined ||
        report.resultHash === undefined ||
        report.verdict.kind === "REJECTED" ||
        report.technicalReport.status !== "VERIFIED" ||
        report.technicalReport.resultHash !== report.resultHash ||
        report.verdict.resultHash !== report.resultHash
      ) {
        context.addIssue({
          code: "custom",
          message:
            "verified epistemic report has inconsistent release authority",
          path: ["status"],
        });
      }
      return;
    }
    if (
      report.findings.length === 0 ||
      report.observation !== undefined ||
      report.resultHash !== undefined ||
      report.verdict.kind !== "REJECTED" ||
      report.verdict.resultReleased !== false ||
      JSON.stringify(report.verdict.findingIds) !==
        JSON.stringify(report.findings.map((finding) => finding.id))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "rejected epistemic report has inconsistent no-release authority",
        path: ["status"],
      });
    }
  });

export type EpistemicFinding = z.infer<typeof EpistemicFindingSchema>;

export type EpistemicVerificationReport = z.infer<
  typeof EpistemicVerificationReportV1Schema
>;

export interface EvaluateVerifiedEpistemicEvidenceInput {
  artifactManifest: unknown;
  sessionId: unknown;
  beliefSpec: unknown;
  ir: unknown;
  result: unknown;
  technicalReport: unknown;
  presentation: unknown;
}

type AddFinding = (
  code: EpistemicFindingCode,
  message: string,
  observed: unknown,
  expected: unknown,
  counterexample?: string,
) => void;

/**
 * Internal authority seam. The public package entrypoint calls this only after
 * the fixed technical verifier has recomputed and accepted the kernel result.
 * adapterOverride exists for mutation tests and is not re-exported publicly.
 */
export async function evaluateVerifiedEpistemicEvidence(
  input: EvaluateVerifiedEpistemicEvidenceInput,
  adapterOverride?: SubjectPackEpistemicAdapter,
): Promise<EpistemicVerificationReport> {
  const beliefSpec = BeliefSpecV2Schema.parse(input.beliefSpec);
  const artifactManifest = ArtifactManifestSchema.parse(input.artifactManifest);
  const sessionId = z.string().trim().min(1).parse(input.sessionId);
  const ir = ExperimentIRV5Schema.parse(input.ir);
  const result = HostedVerifiedResultSetV2Schema.parse(input.result);
  const technicalReport = TechnicalResultVerificationReportSchema.parse(
    input.technicalReport,
  );
  const presentation = EpistemicPresentationV1Schema.parse(input.presentation);
  const pack = getConceptPack(ir.concept);
  const adapter = adapterOverride ?? pack.scientificMethod.epistemic;
  const policy = adapter.policy;
  const irHash = await hashExperimentIR(ir);
  const artifactManifestHash = await hashCanonical(artifactManifest);
  const technicalReportHash = await hashCanonical(technicalReport);
  const [beliefAuthorityHash, experimentAuthorityHash] = await Promise.all([
    hashCanonical({
      evidenceRefs: beliefSpec.evidenceRefs,
      hypotheses: beliefSpec.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        conditions: hypothesis.conditions,
        nonClaims: hypothesis.nonClaims,
      })),
    }),
    hashCanonical({
      evidenceRefs: ir.evidenceRefs,
      hypotheses: ir.hypotheses.map((hypothesis) => ({
        id: hypothesis.id,
        statement: hypothesis.statement,
        conditions: hypothesis.conditions,
        nonClaims: hypothesis.nonClaims,
      })),
    }),
  ]);
  const findings: EpistemicFinding[] = [];
  const addFinding: AddFinding = (
    code,
    message,
    observed,
    expected,
    counterexample,
  ) => {
    findings.push({
      id: `finding_${String(findings.length + 1).padStart(3, "0")}`,
      code: EpistemicFindingCodeSchema.parse(code),
      message,
      observed,
      expected,
      ...(counterexample === undefined ? {} : { counterexample }),
    });
  };

  if (
    technicalReport.status !== "VERIFIED" ||
    technicalReport.resultHash !== result.resultHash
  ) {
    addFinding(
      "TECHNICAL_VERIFICATION_FAILED",
      "The fixed technical verifier did not approve these exact result bytes.",
      {
        status: technicalReport.status,
        resultHashMatches: technicalReport.resultHash === result.resultHash,
      },
      "VERIFIED report bound to the canonical fixed-kernel result hash",
    );
  }

  if (
    beliefSpec.supportState !== "SUPPORTED" ||
    beliefSpec.learnerDecision !== "CONFIRMED"
  ) {
    addFinding(
      "NON_DISCRIMINATING_EXPERIMENT",
      "Only a supported, learner-confirmed Belief Spec can authorize an experiment.",
      {
        supportState: beliefSpec.supportState,
        learnerDecision: beliefSpec.learnerDecision,
      },
      { supportState: "SUPPORTED", learnerDecision: "CONFIRMED" },
    );
  }

  const manifestAndSessionBind =
    artifactManifest.support.status === "SUPPORTED" &&
    ir.artifactManifestHash === artifactManifestHash &&
    result.artifactManifestHash === artifactManifestHash &&
    ir.sessionId === sessionId &&
    result.sessionId === sessionId;
  if (!manifestAndSessionBind) {
    addFinding(
      "RESULT_BINDING_MISMATCH",
      "The experiment and result do not belong to the trusted Artifact Manifest and session.",
      {
        manifestSupport: artifactManifest.support.status,
        irManifestHashMatches: ir.artifactManifestHash === artifactManifestHash,
        resultManifestHashMatches:
          result.artifactManifestHash === artifactManifestHash,
        irSessionMatches: ir.sessionId === sessionId,
        resultSessionMatches: result.sessionId === sessionId,
      },
      "one supported Artifact Manifest and expected session",
    );
  }

  const supportDetection = pack.supportDetector(artifactManifest);
  const supportEvidenceKeys = new Set(
    supportDetection.evidence.map(evidenceAuthorityKey),
  );
  const beliefUsesPackEvidence = beliefSpec.evidenceRefs.some((evidence) =>
    supportEvidenceKeys.has(evidenceAuthorityKey(evidence)),
  );
  if (!supportDetection.supported || !beliefUsesPackEvidence) {
    addFinding(
      "RESULT_BINDING_MISMATCH",
      "The selected Subject Pack does not support the manifest or the belief is not grounded in its routing evidence.",
      {
        concept: pack.id,
        confidence: supportDetection.confidence,
        beliefUsesPackEvidence,
        limitations: supportDetection.limitations,
      },
      `a manifest supported by Subject Pack ${pack.id}@${pack.version}`,
    );
  }

  const [beliefEvidenceResolves, experimentEvidenceResolves] =
    await Promise.all([
      allEvidenceResolves(
        beliefSpec.evidenceRefs,
        artifactManifest,
        beliefSpec.claim,
      ),
      allEvidenceResolves(ir.evidenceRefs, artifactManifest, beliefSpec.claim),
    ]);
  if (!beliefEvidenceResolves || !experimentEvidenceResolves) {
    addFinding(
      "RESULT_BINDING_MISMATCH",
      "Belief or experiment evidence does not resolve to the trusted Artifact Manifest.",
      { beliefEvidenceResolves, experimentEvidenceResolves },
      "every evidence reference resolves by cell, output, kind, and hash",
    );
  }

  const beliefSpecHash = await hashCanonical(beliefSpec);
  if (
    !ir.provenance.inputHashes.includes(artifactManifestHash) ||
    !ir.provenance.inputHashes.includes(beliefSpecHash)
  ) {
    addFinding(
      "RESULT_BINDING_MISMATCH",
      "Experiment provenance does not include its trusted manifest and Belief Spec inputs.",
      ir.provenance.inputHashes,
      [artifactManifestHash, beliefSpecHash],
    );
  }
  if (
    beliefSpec.concept !== ir.concept ||
    beliefSpec.id !== ir.beliefSpecId ||
    ir.beliefSpecHash !== beliefSpecHash ||
    beliefAuthorityHash !== experimentAuthorityHash ||
    result.concept !== ir.concept ||
    result.conceptPackVersion !== pack.version ||
    ir.conceptPackVersion !== pack.version ||
    policy.concept !== pack.id
  ) {
    addFinding(
      "NON_DISCRIMINATING_EXPERIMENT",
      "The belief, experiment, result, and frozen Subject Pack do not share one authority lineage.",
      {
        beliefConceptMatches: beliefSpec.concept === ir.concept,
        beliefIdMatches: beliefSpec.id === ir.beliefSpecId,
        beliefHashMatches: ir.beliefSpecHash === beliefSpecHash,
        beliefSemanticsMatch: beliefAuthorityHash === experimentAuthorityHash,
        resultConceptMatches: result.concept === ir.concept,
        resultPackVersionMatches: result.conceptPackVersion === pack.version,
        experimentPackVersionMatches: ir.conceptPackVersion === pack.version,
      },
      "one registered Subject Pack version and approved Belief Spec",
    );
  }

  const selectedCandidate = verifyFixedSelection(
    ir,
    beliefSpec,
    beliefSpecHash,
    pack,
    addFinding,
  );
  let observation: EpistemicObservationV1 | undefined;

  if (selectedCandidate !== undefined) {
    const controlBindings = await verifyAndBindControls(
      selectedCandidate,
      result,
      adapter,
      addFinding,
    );
    const observableBindings = verifyAndBindObservables(
      selectedCandidate,
      result,
      adapter,
      pack.scientificMethod.epistemic,
      addFinding,
    );
    const outcome = adapter.classifyOutcome(result);
    verifyOutcome(selectedCandidate, ir, outcome, addFinding);
    verifyBoundaryRequest(ir, policy, addFinding);
    verifyPublicClaims(presentation, policy, addFinding);

    const parsedObservation = EpistemicObservationV1Schema.safeParse({
      schemaVersion: "1",
      irHash,
      resultHash: result.resultHash,
      selectedCandidateId: selectedCandidate.id,
      technicalVerification: {
        status: "VERIFIED",
        reportHash: technicalReportHash,
      },
      changedVariableIds: selectedCandidate.changedVariableIds,
      controlBindings,
      observableBindings,
      outcome,
      scope: presentation.scope,
      learnerFacingClaims: presentation.learnerFacingClaims,
    });
    if (parsedObservation.success) {
      observation = parsedObservation.data;
    } else {
      addFinding(
        "RESULT_BINDING_MISMATCH",
        "The fixed epistemic projection did not satisfy its public contract.",
        parsedObservation.error.issues[0]?.message ?? "invalid projection",
        "Epistemic Observation v1",
      );
    }
  }

  if (findings.length > 0 || observation === undefined) {
    return rejectedReport({
      irHash,
      technicalReportHash,
      technicalReport,
      policyVersion: policy.policyVersion,
      verifierVersion: policy.verifierVersion,
      classifierId: policy.classifierId,
      findings:
        findings.length > 0
          ? findings
          : [
              {
                id: "finding_001",
                code: "UNRESOLVED_OUTCOME",
                message: "No valid epistemic observation was produced.",
                observed: "missing observation",
                expected: "validated observation",
              },
            ],
    });
  }

  const verdict = verdictForObservation(
    ir,
    observation,
    policy.verifierVersion,
  );
  return EpistemicVerificationReportV1Schema.parse({
    schemaVersion: "1",
    status: "VERIFIED",
    verifierVersion: policy.verifierVersion,
    policyVersion: policy.policyVersion,
    classifierId: policy.classifierId,
    irHash,
    technicalReportHash,
    technicalReport,
    resultHash: result.resultHash,
    findingCount: 0,
    findings: [],
    observation,
    verdict,
  });
}

export async function technicalFailureEpistemicReport(
  irValue: unknown,
  technicalReportValue: unknown,
): Promise<EpistemicVerificationReport> {
  const ir = ExperimentIRV5Schema.parse(irValue);
  const technicalReport =
    TechnicalResultVerificationReportSchema.parse(technicalReportValue);
  const policy = getConceptPack(ir.concept).scientificMethod.epistemic.policy;
  const irHash = await hashExperimentIR(ir);
  const technicalReportHash = await hashCanonical(technicalReport);
  return rejectedReport({
    irHash,
    technicalReportHash,
    technicalReport,
    policyVersion: policy.policyVersion,
    verifierVersion: policy.verifierVersion,
    classifierId: policy.classifierId,
    findings: [
      {
        id: "finding_001",
        code: "TECHNICAL_VERIFICATION_FAILED",
        message: "The fixed technical verifier rejected the candidate result.",
        observed: technicalReport.status,
        expected: "VERIFIED",
        counterexample:
          technicalReport.invariants.find((invariant) => !invariant.passed)
            ?.counterexample ?? "A named technical invariant failed.",
      },
    ],
  });
}

function rejectedReport(input: {
  irHash: string;
  technicalReportHash: string;
  technicalReport: z.infer<typeof TechnicalResultVerificationReportSchema>;
  policyVersion: string;
  verifierVersion: string;
  classifierId: string;
  findings: EpistemicFinding[];
}): EpistemicVerificationReport {
  const verdict = EvidenceVerdictSchema.parse({
    schemaVersion: "1",
    kind: "REJECTED",
    findingIds: input.findings.map((finding) => finding.id),
    resultReleased: false,
    irHash: input.irHash,
    technicalReportHash: input.technicalReportHash,
    verifierVersion: input.verifierVersion,
  });
  return EpistemicVerificationReportV1Schema.parse({
    schemaVersion: "1",
    status: "REJECTED",
    verifierVersion: input.verifierVersion,
    policyVersion: input.policyVersion,
    classifierId: input.classifierId,
    irHash: input.irHash,
    technicalReportHash: input.technicalReportHash,
    technicalReport: input.technicalReport,
    findingCount: input.findings.length,
    findings: input.findings,
    verdict,
  });
}

function verifyFixedSelection(
  ir: ExperimentIRV5,
  beliefSpec: ReturnType<typeof BeliefSpecV2Schema.parse>,
  beliefSpecHash: string,
  pack: ConceptPackDefinition,
  addFinding: AddFinding,
): ExperimentIRV5["candidateExperiments"][number] | undefined {
  if (ir.selection.status !== "SELECTED") {
    addFinding(
      "NON_DISCRIMINATING_EXPERIMENT",
      "The experiment was not selected by the fixed scorer.",
      ir.selection.status,
      "SELECTED",
    );
    return undefined;
  }
  const selection = ir.selection;
  const selectedCandidate = ir.candidateExperiments.find(
    (candidate) => candidate.id === selection.candidateId,
  );
  if (selectedCandidate === undefined) {
    addFinding(
      "NON_DISCRIMINATING_EXPERIMENT",
      "The selected experiment does not resolve.",
      selection.candidateId,
      "a registered candidate",
    );
    return undefined;
  }

  let rescored;
  try {
    rescored = scoreExperiments({
      beliefSpec,
      beliefSpecHash,
      ir: { ...ir, selection: { status: "UNSELECTED" } },
      policy: pack.scientificMethod.scoringPolicy,
    });
  } catch (error) {
    addFinding(
      "NON_DISCRIMINATING_EXPERIMENT",
      "The selected experiment cannot be reproduced by the fixed scorer.",
      error instanceof Error ? error.name : "scoring failure",
      "reproducible fixed selection",
    );
    return selectedCandidate;
  }

  const selectionMatches =
    rescored.selectedCandidateId === selection.candidateId &&
    rescored.scorerVersion === selection.scorerVersion &&
    rescored.minimumSeparation === selection.minimumSeparation &&
    rescored.requiredSeparation === selection.requiredSeparation &&
    rescored.complexityCost === selection.complexityCost &&
    rescored.normalizedScore === selection.normalizedScore &&
    JSON.stringify(rescored.eligibleCandidateIds) ===
      JSON.stringify(selection.eligibleCandidateIds) &&
    JSON.stringify(rescored.rejectedCandidates) ===
      JSON.stringify(selection.rejectedCandidates);
  if (!selectionMatches) {
    addFinding(
      "NON_DISCRIMINATING_EXPERIMENT",
      "The stored selection trace does not match the frozen scorer output.",
      "selection trace mismatch",
      `${pack.scientificMethod.scoringPolicy.policyVersion} reproducible output`,
    );
  }
  return selectedCandidate;
}

async function verifyAndBindControls(
  candidate: ExperimentIRV5["candidateExperiments"][number],
  result: ReturnType<typeof HostedVerifiedResultSetV2Schema.parse>,
  adapter: SubjectPackEpistemicAdapter,
  addFinding: AddFinding,
): Promise<EpistemicObservationV1["controlBindings"]> {
  const resolved = new Map(
    adapter
      .resolveControlValues(candidate, result)
      .map((binding) => [binding.controlId, binding.values]),
  );
  const bindings: EpistemicObservationV1["controlBindings"] = [];
  for (const controlId of candidate.heldConstantIds) {
    const values = resolved.get(controlId) ?? [];
    const hasUnresolved =
      values.length < 2 || values.some((value) => value === undefined);
    const hashes = hasUnresolved
      ? [await hashCanonical({ unresolved: controlId })]
      : await Promise.all(values.map((value) => hashCanonical(value)));
    const firstHash = hashes[0]!;
    const changedHash = hashes.find((hash) => hash !== firstHash) ?? firstHash;
    bindings.push({
      controlId,
      beforeHash: firstHash,
      afterHash: changedHash,
    });
    if (hasUnresolved || hashes.some((hash) => hash !== firstHash)) {
      addFinding(
        "CONFOUNDED_INTERVENTION",
        "A required held constant was unresolved or changed across fixed runs.",
        { controlId, resolvedValueCount: values.length },
        "the same canonical value in every selected run",
      );
    }
  }
  if (!sameStrings([...resolved.keys()], candidate.heldConstantIds)) {
    addFinding(
      "CONFOUNDED_INTERVENTION",
      "The Subject Pack control adapter did not resolve exactly the declared controls.",
      [...resolved.keys()].sort(),
      [...candidate.heldConstantIds].sort(),
    );
  }
  return bindings;
}

function verifyAndBindObservables(
  candidate: ExperimentIRV5["candidateExperiments"][number],
  result: ReturnType<typeof HostedVerifiedResultSetV2Schema.parse>,
  adapter: SubjectPackEpistemicAdapter,
  registeredAdapter: SubjectPackEpistemicAdapter,
  addFinding: AddFinding,
): EpistemicObservationV1["observableBindings"] {
  const bindings: EpistemicObservationV1["observableBindings"] = [];
  for (const observableId of candidate.observableIds) {
    const resultPath = adapter.resolveObservablePath(observableId, result);
    const registeredPath = registeredAdapter.resolveObservablePath(
      observableId,
      result,
    );
    const allowedPrefixes = adapter.policy.observableResultPathPrefixes.find(
      (binding) => binding.observableId === observableId,
    )?.prefixes;
    const pathIsAuthorized =
      resultPath !== undefined &&
      allowedPrefixes?.some(
        (prefix) =>
          resultPath === prefix || resultPath.startsWith(`${prefix}/`),
      ) === true;
    if (
      resultPath === undefined ||
      resultPath !== registeredPath ||
      !pathIsAuthorized ||
      !jsonPointerResolves(result, resultPath)
    ) {
      addFinding(
        "RESULT_BINDING_MISMATCH",
        "A selected observable does not resolve in the signed fixed-kernel result.",
        {
          observableId,
          resultPath: resultPath ?? "unresolved",
          registeredPath: registeredPath ?? "unresolved",
          authorized: pathIsAuthorized,
        },
        "a frozen Subject Pack-authorized path resolving in the canonical result",
      );
      continue;
    }
    bindings.push({ observableId, resultPath, resultHash: result.resultHash });
  }
  return bindings;
}

function verifyOutcome(
  candidate: ExperimentIRV5["candidateExperiments"][number],
  ir: ExperimentIRV5,
  outcome: EpistemicObservationV1["outcome"],
  addFinding: AddFinding,
): void {
  const candidatePatternsMatchHypotheses = candidate.hypothesisPatterns.every(
    (pattern, index) =>
      pattern.hypothesisId === ir.hypotheses[index]?.id &&
      pattern.patternId === ir.hypotheses[index]?.predictedPattern.patternId,
  );
  if (!candidatePatternsMatchHypotheses) {
    addFinding(
      "MISSING_DECISIVE_PATTERN",
      "The selected candidate patterns do not match the approved hypothesis predictions.",
      "candidate and hypothesis pattern mismatch",
      "one resolved pattern per primary hypothesis",
    );
  }

  if (outcome.kind === "HYPOTHESIS_PATTERN") {
    const expected = candidate.hypothesisPatterns.find(
      (pattern) => pattern.hypothesisId === outcome.hypothesisId,
    );
    if (expected?.patternId !== outcome.patternId) {
      addFinding(
        "MISSING_DECISIVE_PATTERN",
        "The fixed classifier outcome does not resolve to the declared hypothesis pattern.",
        outcome.patternId,
        expected?.patternId ?? "a declared decisive pattern",
      );
    }
    return;
  }

  if (outcome.kind === "INCONCLUSIVE") {
    const condition = ir.inconclusiveConditions.find(
      (item) => item.id === outcome.conditionId,
    );
    const represented =
      condition !== undefined &&
      candidate.inconclusiveConditionIds.includes(condition.id) &&
      condition.nextExperimentId === outcome.nextExperimentId;
    if (!represented) {
      addFinding(
        "INCONCLUSIVE_NOT_REPRESENTED",
        "The fixed classifier reached an inconclusive region absent from the selected experiment.",
        outcome.conditionId,
        candidate.inconclusiveConditionIds,
      );
    }
    return;
  }

  addFinding(
    "UNRESOLVED_OUTCOME",
    "The fixed classifier could not map the result to a decisive or declared inconclusive pattern.",
    "UNRESOLVED",
    "HYPOTHESIS_PATTERN or INCONCLUSIVE",
  );
}

function verifyBoundaryRequest(
  ir: ExperimentIRV5,
  policy: SubjectPackEpistemicAdapter["policy"],
  addFinding: AddFinding,
): void {
  if (ir.boundarySweep === undefined) return;
  const contract = policy.boundarySweeps.find(
    (candidate) => candidate.sweepId === ir.boundarySweep?.sweepId,
  );
  const contractMatches =
    contract !== undefined &&
    sameStrings(contract.axisIds, ir.boundarySweep.axisIds) &&
    contract.gridPresetId === ir.boundarySweep.gridPresetId &&
    contract.observableId === ir.boundarySweep.observableId &&
    contract.maxCells === ir.boundarySweep.maxCells;
  addFinding(
    "BOUNDARY_SWEEP_UNAUTHORIZED",
    contractMatches
      ? "The authorized Boundary Sweep has no independently signed Boundary Map result yet."
      : "The Experiment IR requests a Boundary Sweep outside the frozen Subject Pack contract.",
    contractMatches ? "missing signed boundary binding" : ir.boundarySweep,
    contract ?? "an authorized boundary contract",
  );
}

function verifyPublicClaims(
  presentation: ReturnType<typeof EpistemicPresentationV1Schema.parse>,
  policy: SubjectPackEpistemicAdapter["policy"],
  addFinding: AddFinding,
): void {
  const approved = new Set(policy.approvedClaims);
  const forbidden = policy.forbiddenClaims.map((claim) => claim.toLowerCase());
  const invalidClaims = presentation.learnerFacingClaims.filter((claim) => {
    const normalized = claim.toLowerCase();
    return (
      !approved.has(claim) ||
      forbidden.some((forbiddenClaim) => normalized.includes(forbiddenClaim))
    );
  });
  if (
    !policy.allowedScopes.includes(presentation.scope) ||
    invalidClaims.length > 0
  ) {
    addFinding(
      "CLAIM_EXCEEDS_EVIDENCE",
      "Learner-facing copy exceeds the frozen scope or approved claim set.",
      {
        scopeApproved: policy.allowedScopes.includes(presentation.scope),
        invalidClaimCount: invalidClaims.length,
      },
      "a Subject Pack-approved scope and learner-facing claim",
    );
  }
}

function verdictForObservation(
  ir: ExperimentIRV5,
  observation: EpistemicObservationV1,
  verifierVersion: string,
): EvidenceVerdict {
  const common = {
    schemaVersion: "1" as const,
    irHash: observation.irHash,
    technicalReportHash: observation.technicalVerification.reportHash,
    verifierVersion,
    scope: observation.scope,
    resultHash: observation.resultHash,
  };
  if (observation.outcome.kind === "INCONCLUSIVE") {
    const outcome = observation.outcome;
    const condition = ir.inconclusiveConditions.find(
      (item) => item.id === outcome.conditionId,
    )!;
    return EvidenceVerdictSchema.parse({
      ...common,
      kind: "INCONCLUSIVE",
      reasonCode: reasonCodeFor(condition.id),
      ...(condition.nextExperimentId === undefined
        ? {}
        : { nextExperimentId: condition.nextExperimentId }),
    });
  }
  if (observation.outcome.kind !== "HYPOTHESIS_PATTERN") {
    throw new Error("verified epistemic outcome is unresolved");
  }
  return EvidenceVerdictSchema.parse({
    ...common,
    kind: "SUPPORTS",
    hypothesisId: observation.outcome.hypothesisId,
  });
}

function reasonCodeFor(value: string): string {
  return value.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}

function jsonPointerResolves(value: unknown, pointer: string): boolean {
  let cursor: unknown = value;
  for (const token of pointer.slice(1).split("/")) {
    if (Array.isArray(cursor)) {
      if (!/^\d+$/.test(token)) return false;
      const index = Number(token);
      if (index >= cursor.length) return false;
      cursor = cursor[index];
      continue;
    }
    if (
      cursor === null ||
      typeof cursor !== "object" ||
      !Object.prototype.hasOwnProperty.call(cursor, token)
    ) {
      return false;
    }
    cursor = (cursor as Record<string, unknown>)[token];
  }
  return cursor !== undefined;
}

async function allEvidenceResolves(
  evidenceRefs: readonly EvidenceRef[],
  manifest: ArtifactManifest,
  learnerClaim: string,
): Promise<boolean> {
  const resolutions = await Promise.all(
    evidenceRefs.map((evidence) =>
      evidenceResolves(evidence, manifest, learnerClaim),
    ),
  );
  return resolutions.every(Boolean);
}

async function evidenceResolves(
  evidence: EvidenceRef,
  manifest: ArtifactManifest,
  learnerClaim: string,
): Promise<boolean> {
  const coordinatesAreValid =
    evidence.kind === "schema" || evidence.kind === "learner_claim"
      ? evidence.cellIndex === undefined && evidence.outputIndex === undefined
      : evidence.kind === "code"
        ? evidence.cellIndex !== undefined && evidence.outputIndex === undefined
        : evidence.cellIndex !== undefined &&
          evidence.outputIndex !== undefined;
  if (!coordinatesAreValid) return false;
  if (evidence.kind === "schema") {
    return evidence.hash === (await hashCanonical(manifest.schemaSummary));
  }
  if (evidence.kind === "learner_claim") {
    return evidence.hash === (await hashCanonical(learnerClaim));
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

function evidenceAuthorityKey(evidence: EvidenceRef): string {
  return [
    evidence.kind,
    evidence.hash,
    evidence.cellIndex ?? "",
    evidence.outputIndex ?? "",
  ].join(":");
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  const leftSorted = [...left].sort((a, b) => a.localeCompare(b));
  const rightSorted = [...right].sort((a, b) => a.localeCompare(b));
  return leftSorted.every((item, index) => item === rightSorted[index]);
}
