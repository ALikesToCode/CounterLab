import {
  CompileLabInputSchema,
  CompilePatchInputSchema,
  CompilerSetupError,
  RepairLabInputSchema,
  type CompileLabInput,
  type CompilePatchInput,
  type RepairLabInput,
} from "./types.js";

const LAB_FILES = [
  "artifact-adapter.py",
  "experiment-plan.json",
  "public_tests.py",
].sort();

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
