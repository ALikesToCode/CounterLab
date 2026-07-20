import {
  CompileLabInputSchema,
  CompileHostedExperimentPlanInputSchema,
  CompileHostedScientificMethodInputSchema,
  CompileHostedPatchPlanInputSchema,
  CompilePatchInputSchema,
  CompilerSetupError,
  RepairLabInputSchema,
  RepairHostedExperimentPlanInputSchema,
  RepairHostedScientificMethodInputSchema,
  RepairHostedPatchPlanInputSchema,
  type CompileLabInput,
  type CompileHostedExperimentPlanInput,
  type CompileHostedScientificMethodInput,
  type CompileHostedPatchPlanInput,
  type CompilePatchInput,
  type RepairLabInput,
  type RepairHostedExperimentPlanInput,
  type RepairHostedScientificMethodInput,
  type RepairHostedPatchPlanInput,
} from "./types.js";

const LAB_FILES = [
  "artifact-adapter.py",
  "experiment-plan.json",
  "public_tests.py",
].sort();
const HOSTED_PLAN_OUTPUTS = [
  "experiment-plan.json",
  "public-rationale.md",
].sort();
const HOSTED_SCIENTIFIC_OUTPUTS = [
  "discrimination-contract.json",
  "experiment-ir.json",
  "lab-scene.json",
  "public-rationale.md",
].sort();
const HOSTED_PATCH_OUTPUTS = ["patch-plan.json", "public-rationale.md"].sort();

function json(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function validateLabFiles(files: string[]): void {
  const actual = [...files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(LAB_FILES)) {
    throw new CompilerSetupError(
      "CODEX_INVALID_INPUT",
      "The lab compiler may write only experiment-plan.json, artifact-adapter.py, and public_tests.py.",
    );
  }
}

function validateHostedPlanOutputs(files: string[]): void {
  const actual = [...files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(HOSTED_PLAN_OUTPUTS)) {
    throw new CompilerSetupError(
      "CODEX_INVALID_INPUT",
      "The hosted compiler may write only experiment-plan.json and public-rationale.md.",
    );
  }
}

function validateHostedScientificOutputs(files: string[]): void {
  const actual = [...files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(HOSTED_SCIENTIFIC_OUTPUTS)) {
    throw new CompilerSetupError(
      "CODEX_INVALID_INPUT",
      "The hosted v5 compiler may write only the four scientific artifacts: discrimination-contract.json, experiment-ir.json, lab-scene.json, and public-rationale.md.",
    );
  }
}

function validateHostedPatchOutputs(files: string[]): void {
  const actual = [...files].sort();
  if (JSON.stringify(actual) !== JSON.stringify(HOSTED_PATCH_OUTPUTS)) {
    throw new CompilerSetupError(
      "CODEX_INVALID_INPUT",
      "The hosted patch compiler may write only patch-plan.json and public-rationale.md.",
    );
  }
}

function renderHostedExperimentPlanPrompt(
  input: CompileHostedExperimentPlanInput,
): string {
  validateHostedPlanOutputs(input.permittedOutputs);
  return `You are the bounded CounterLab hosted Experiment Plan compiler. Produce an artifact-specific plan that composes fixed, independently verified operations.

Authority boundary:
- Do not call tools or write files. Return one schema-constrained JSON object; fixed CounterLab code materializes only ${input.permittedOutputs.join(" and ")}.
- authoritativeArtifact becomes experiment-plan.json and must match the supplied Experiment Plan JSON Schema exactly.
- publicRationale becomes public-rationale.md, is display-only plain language, and never determines verification, execution, teaching, or pass/fail.
- The plan must not contain executable source code, shell commands, SQL, arbitrary formulas, literal result values, raw paths, imports, network actions, or dynamic expressions.
- Do not run shell commands, execute notebook cells, read files, inspect environment variables, access parent directories, use the network, or install packages.
- Use only the registered operations, metrics, and visualizations listed below.
- Copy evidence references only from the approved Belief Test and sanitized Artifact Manifest. Do not invent rows, metrics, outputs, support status, or evidence.
- State expected patterns qualitatively. Never guess numeric results.
- Finish with only a concise public status; do not reveal private reasoning.

Required immutable lineage (copy these values exactly):
${json({
  sessionId: input.sessionId,
  artifactManifestHash: input.artifactManifestHash,
  beliefTestId: input.approvedBeliefTest.id,
  conceptPackVersion: input.conceptPack.version,
})}

Approved Belief Test:
${json(input.approvedBeliefTest)}

Sanitized Artifact Manifest:
${json(input.artifactManifest)}

Selected Concept Pack capabilities:
${json(input.conceptPack)}

Public Plan composition requirements:
${json(input.conceptPack.planRequirements)}

Experiment Plan v2 JSON Schema:
${json(input.experimentPlanSchema)}

Resource limits that must be copied into the plan:
${json(input.resourceLimits)}
`;
}

export function buildCompileHostedExperimentPlanPrompt(
  raw: CompileHostedExperimentPlanInput,
): string {
  return renderHostedExperimentPlanPrompt(
    CompileHostedExperimentPlanInputSchema.parse(raw),
  );
}

export function buildRepairHostedExperimentPlanPrompt(
  raw: RepairHostedExperimentPlanInput,
): string {
  const input = RepairHostedExperimentPlanInputSchema.parse(raw);
  const base = renderHostedExperimentPlanPrompt(input);
  return `${base}
This is repair attempt ${input.repairAttempt} of at most 2. Correct only the rejected invariants. Preserve every field that was not rejected. Do not weaken the plan schema, change artifact or Belief Test lineage, or add new evidence.

Previous candidate Plan to amend:
${json(input.previousCandidatePlan)}

Previous output hashes:
${json(input.previousOutputHashes)}

Structured external-verifier counterexamples:
${json(input.verifierCounterexamples)}
`;
}

function renderHostedScientificMethodPrompt(
  input: CompileHostedScientificMethodInput,
): string {
  validateHostedScientificOutputs(input.permittedOutputs);
  const resultMetricFields =
    input.conceptPack.id === "entity_leakage"
      ? ["accuracy", "rocAuc"]
      : ["accuracy", "precision", "recall", "f1", "prAuc", "rocAuc"];
  return `You are the bounded CounterLab scientific-method compiler. Turn one learner-approved Belief Spec into candidate counterexperiments and a display-only scene using only the selected Subject Pack.

Authority boundary:
- Do not call tools or write files. Return one schema-constrained JSON object; fixed CounterLab code materializes only ${input.permittedOutputs.join(", ")}.
- Produce discriminationContract, experimentIr, and labScene fields matching the supplied schemas. publicRationale is display-only.
- Experiment IR selection must remain UNSELECTED. The fixed scorer, never Codex, selects the decisive experiment.
- The Lab Scene is an unverified draft. Use GUIDED_VISUAL or EXPLANATION_ONLY, never VERIFIED_TEST or ProofBadge; fixed verification owns promotion.
- For the current fixed-kernel release, use GUIDED_VISUAL and include at least two distinct Metric blocks. Each resultBinding must be /runs/byId/<runId>/metrics/<field>, where runId exactly matches a baseline or intervention runId shared by every candidate and field comes from the fixed binding manifest below. Bind at least two different runIds so the learner sees the changed evaluation. Do not add Prediction, chart, BoundaryMap, MotionCanvas, NotebookCell, NotebookDiff, ReasoningDiff, or ProofBadge bindings; those surfaces are not present in the authoritative result root.
- Use operation IDs only. No literal result values are permitted. Do not include source code, commands, SQL, arbitrary formulas, imports, network actions, dynamic expressions, or raw paths.
- Copy evidence only from the approved Belief Spec and sanitized Artifact Manifest. Do not invent cells, outputs, rows, support status, measurements, or results.
- Preserve the supplied session, artifact, Belief Spec, Subject Pack, resource, and provenance lineage exactly.
- Copy approvedBeliefSpec.evidenceRefs exactly and in order into both discriminationContract.evidenceRefs and experimentIr.evidenceRefs; do not add, omit, edit, or reorder entries.
- Set discriminationContract.candidateExperimentIds to exactly the IDs in experimentIr.candidateExperiments, without additions, omissions, or aliases.
- Copy discriminationContract.nonClaims into experimentIr.nonClaims exactly; the two arrays must be identical.
- Every candidate operationIds and observableIds entry must come only from the supplied Subject Pack allowlists.
- State decisive patterns qualitatively and include explicit inconclusive conditions and non-claims.
- ${
    input.conceptPack.fixedExecutionContract === undefined
      ? "This historical compiler bundle has no fixed execution descriptor; preserve its existing compatibility contract."
      : "Use conceptPack.fixedExecutionContract.runSeed for every run. Copy its inconclusive outcome IDs into discriminationContract.inconclusiveConditionIds and every candidate inconclusiveConditionIds. For each descriptor, create one experimentIr.inconclusiveConditions entry with id equal to conditionId and copy description and nextExperimentId exactly."
  }
- ${
    input.conceptPack.boundarySweep === undefined
      ? "Do not invent a Boundary Sweep when the historical compiler bundle does not declare one."
      : "Copy conceptPack.boundarySweep exactly into experimentIr.boundarySweep; do not rename, reorder, omit, or extend its fields."
  }
- ${
    input.conceptPack.transferTask === undefined
      ? "This historical compiler bundle does not declare a frozen transfer contract; do not invent transfer authority."
      : "Copy conceptPack.transferTask.experimentIrContract exactly into experimentIr.transfer; do not rename, reorder, omit, extend, or author any transfer field. If labScene contains a Transfer block, set its evaluatorId to conceptPack.transferTask.evaluatorTaskId exactly."
  }
- Do not reveal private reasoning.

Immutable lineage:
${json({
  sessionId: input.sessionId,
  artifactManifestHash: input.artifactManifestHash,
  beliefSpecId: input.approvedBeliefSpec.id,
  beliefSpecHash: input.beliefSpecHash,
  conceptPackVersion: input.conceptPack.version,
  provenance: input.provenance,
})}

Approved Belief Spec:
${json(input.approvedBeliefSpec)}

Sanitized Artifact Manifest:
${json(input.artifactManifest)}

Public Subject Pack capabilities and candidate IDs:
${json(input.conceptPack)}

Fixed scorer composition requirements:
${json(input.conceptPack.planRequirements)}

Fixed post-result Lab Scene binding manifest:
${json({
  schemaVersion: "1",
  bindingRoot: "authoritative-result-v2",
  requiredBlockType: "Metric",
  minimumMetricBindings: 2,
  minimumDistinctRunIds: 2,
  resultBindingPattern: "/runs/byId/<runId>/metrics/<field>",
  metricFields: resultMetricFields,
})}

Discrimination Contract JSON Schema:
${json(input.schemas.discriminationContract)}

Experiment IR v5 JSON Schema:
${json(input.schemas.experimentIr)}

Unverified Lab Scene draft JSON Schema:
${json(input.schemas.labScene)}

Resource limits:
${json(input.resourceLimits)}
`;
}

export function buildCompileHostedScientificMethodPrompt(
  raw: CompileHostedScientificMethodInput,
): string {
  return renderHostedScientificMethodPrompt(
    CompileHostedScientificMethodInputSchema.parse(raw),
  );
}

export function buildRepairHostedScientificMethodPrompt(
  raw: RepairHostedScientificMethodInput,
): string {
  const input = RepairHostedScientificMethodInputSchema.parse(raw);
  return `${renderHostedScientificMethodPrompt(input)}
This is repair attempt ${input.repairAttempt} of at most 2. Correct only the structured findings. Preserve all valid lineage, evidence, controls, and non-claims. Keep Experiment IR selection UNSELECTED.
When transfer_contract is rejected, replace experimentIr.transfer with conceptPack.transferTask.experimentIrContract in full and bind every Transfer block evaluatorId to conceptPack.transferTask.evaluatorTaskId; do not preserve any rejected transfer field.

Previous artifacts:
${json(input.previousArtifacts)}

Previous output hashes:
${json(input.previousOutputHashes)}

External scorer/verifier counterexamples:
${json(input.verifierCounterexamples)}
`;
}

function renderHostedPatchPlanPrompt(
  input: CompileHostedPatchPlanInput,
): string {
  validateHostedPatchOutputs(input.permittedOutputs);
  const beliefAuthority =
    "approvedBeliefSpec" in input
      ? input.approvedBeliefSpec
      : input.approvedBeliefTest;
  const beliefAuthorityName =
    "approvedBeliefSpec" in input ? "Belief Spec" : "Belief Test";
  return `You are the bounded CounterLab hosted Patch Plan compiler. Select the smallest registered repair after deterministic transfer has passed.

Authority boundary:
- Do not call tools or write files. Return one schema-constrained JSON object; fixed CounterLab code materializes only ${input.permittedOutputs.join(" and ")}.
- authoritativeArtifact becomes patch-plan.json and must match the supplied Patch Plan schema exactly.
- publicRationale becomes public-rationale.md, is display-only, and never determines patch validity.
- Do not write notebook code, Python, shell commands, SQL, imports, formulas, result literals, raw paths, or dynamic expressions.
- Select only the registered transformations and allowed cell indexes below.
- Copy evidence references only from the approved ${beliefAuthorityName} and Artifact Manifest.
- Preserve unrelated cells and make no claim beyond the verified result and passed transfer.
- Do not read files, execute notebook cells, inspect environment variables, access parent directories, use the network, or install packages.
- Finish with concise public status only; do not reveal private reasoning.

Required immutable lineage (copy these values exactly):
${json({
  sessionId: input.sessionId,
  conceptPackVersion: input.conceptPackVersion,
  artifactManifestHash: input.artifactManifestHash,
  sourceArtifactHash: input.sourceArtifactHash,
  verifiedResultHash: input.verifiedResultSummary.resultHash,
  transferResultHash: input.transferSummary.resultHash,
})}

Approved ${beliefAuthorityName}:
${json(beliefAuthority)}

Sanitized Artifact Manifest:
${json(input.artifactManifest)}

Verified result summary:
${json(input.verifiedResultSummary)}

Passed deterministic transfer summary:
${json(input.transferSummary)}

Registered patch contract:
${json(input.patchContract)}

Allowed cell indexes:
${json(input.allowedCellIndices)}

Patch Plan JSON Schema:
${json(input.patchPlanSchema)}

Resource limits:
${json(input.resourceLimits)}
`;
}

export function buildCompileHostedPatchPlanPrompt(
  raw: CompileHostedPatchPlanInput,
): string {
  return renderHostedPatchPlanPrompt(
    CompileHostedPatchPlanInputSchema.parse(raw),
  );
}

export function buildRepairHostedPatchPlanPrompt(
  raw: RepairHostedPatchPlanInput,
): string {
  const input = RepairHostedPatchPlanInputSchema.parse(raw);
  return `${renderHostedPatchPlanPrompt(input)}
This is repair attempt ${input.repairAttempt} of at most 2. Correct only the rejected invariants and preserve every field that was not rejected. Do not change artifact, result, transfer, or evidence lineage.

Previous candidate Patch Plan to amend:
${json(input.previousCandidatePlan)}

Previous output hashes:
${json(input.previousOutputHashes)}

Structured external-verifier counterexamples:
${json(input.verifierCounterexamples)}
`;
}

function renderCompileLabPrompt(input: CompileLabInput): string {
  validateLabFiles(input.permittedFiles);
  return `You are the bounded CounterLab lab compiler. Create an artifact-specific experiment adapter, not metric truth.

Authority boundary:
- Write only these files in the current generation directory: ${input.permittedFiles.join(", ")}.
- Compose the documented fixed SDK. Do not implement metrics, split primitives, transfer scoring, chart rendering, or verifier decisions.
- Do not read environment variables, hidden verifier files, held-out fixtures, secrets, parent directories, or unrelated files.
- Do not use the network or install packages.
- Use only these commands: ${input.permittedCommands.join(", ") || "none"}.
- Finish by reporting only the files changed, command outcomes, and final status.

Approved Belief Test:
${json(input.approvedBeliefTest)}

Experiment plan JSON Schema:
${json(input.experimentPlanSchema)}

Public Concept Pack SDK documentation:
${input.conceptPackDocumentation}

Redacted fixture schema:
${json(input.fixtureSchema)}

Approved evidence references:
${json(input.evidenceReferences)}

Resource limits:
${json(input.resourceLimits)}
`;
}

export function buildCompileLabPrompt(raw: CompileLabInput): string {
  return renderCompileLabPrompt(CompileLabInputSchema.parse(raw));
}

export function buildRepairLabPrompt(raw: RepairLabInput): string {
  const input = RepairLabInputSchema.parse(raw);
  const base = renderCompileLabPrompt(input);
  return `${base}
This is repair attempt ${input.repairAttempt} of at most 2. Repair only the rejected invariants. Do not weaken tests or change the fixed contract.

Previous artifact hashes:
${json(input.previousArtifactHashes)}

External verifier counterexamples (the only hidden-verifier feedback available):
${json(input.verifierCounterexamples)}
`;
}

export function buildCompilePatchPrompt(raw: CompilePatchInput): string {
  const input = CompilePatchInputSchema.parse(raw);
  return `You are the bounded CounterLab notebook patch compiler. The learner already passed the deterministic transfer task.

Authority boundary:
- Modify only ${input.notebookCopyFileName}, which is a copy. Never locate or overwrite the original upload.
- Write patch metadata only to ${input.patchMetadataFileName}.
- Change only notebook cells ${input.allowedCellIndices.join(", ")}.
- Replace row-wise evaluation with customer-group evaluation and remove customer identity from model features where required.
- Preserve every unrelated cell source byte-for-byte. Make the smallest local correction.
- Do not add dependencies, hardcode metrics, use the network, read environment variables, or access parent directories.
- Use only these commands: ${input.permittedCommands.join(", ") || "none"}.

Approved Belief Test:
${json(input.approvedBeliefTest)}

Canonical verified result:
${json(input.verifiedResult)}

Deterministic transfer result:
${json(input.transferResult)}

Resource limits:
${json(input.resourceLimits)}
`;
}
