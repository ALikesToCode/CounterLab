import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { ApprovedSampleBeliefAnalyst } from "../packages/belief-analyst/src/index.ts";
import type { CompileLabInput } from "../packages/codex-client/src/index.ts";
import { parseNotebook } from "../packages/notebook-parser/src/index.ts";

export async function createLiveCompileInput(input: {
  root: string;
  sessionId: string;
  generationDirectory: string;
  createdAt: string;
}): Promise<CompileLabInput> {
  const publicRoot = join(input.root, "concept-packs", "leakage", "public");
  const notebookPath = join(
    input.root,
    "fixtures",
    "notebooks",
    "customer_churn_leakage.ipynb",
  );
  const manifest = parseNotebook(
    await readFile(notebookPath),
    basename(notebookPath),
    {
      maxBytes: 10_485_760,
      createdAt: input.createdAt,
    },
  );
  const claim =
    "The notebook's random-row accuracy proves the model generalizes to customers it has never seen.";
  const approved = await new ApprovedSampleBeliefAnalyst().propose({
    sessionId: input.sessionId,
    learnerClaim: claim,
    manifest,
    concept: "entity_leakage",
  });
  return {
    sessionId: input.sessionId,
    generationDirectory: input.generationDirectory,
    approvedBeliefTest: approved.beliefTest,
    experimentPlanSchema: JSON.parse(
      await readFile(join(publicRoot, "experiment-plan.schema.json"), "utf8"),
    ),
    conceptPackDocumentation: await readFile(
      join(publicRoot, "README.md"),
      "utf8",
    ),
    fixtureSchema: {
      fields: manifest.schemaSummary.fields,
      entityCandidates: manifest.schemaSummary.entityCandidates,
      targetCandidates: manifest.schemaSummary.targetCandidates,
      rowCount: manifest.schemaSummary.rowCount,
    },
    evidenceReferences: approved.beliefTest.evidenceRefs,
    resourceLimits: {
      wallSeconds: 20,
      memoryMb: 512,
      maxProcesses: 16,
      maxFiles: 8,
      maxOutputBytes: 262_144,
    },
    permittedFiles: [
      "experiment-plan.json",
      "artifact-adapter.py",
      "public_tests.py",
    ],
    permittedCommands: [
      "PYTHONPYCACHEPREFIX=/tmp/counterlab-pycache python -m py_compile artifact-adapter.py public_tests.py",
    ],
  };
}
