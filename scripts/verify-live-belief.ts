import { readFile } from "node:fs/promises";
import path from "node:path";

import { createLiveBeliefAnalystFromEnv } from "../packages/belief-analyst/src/index.ts";
import { routeArtifactConcept } from "../packages/concept-registry/src/index.ts";
import { parseNotebook } from "../packages/notebook-parser/src/index.ts";

const root = process.cwd();
const requested =
  process.argv[2] ?? "fixtures/notebooks/fraud_class_imbalance.ipynb";
const notebookPath = path.resolve(root, requested);
if (!notebookPath.startsWith(`${root}${path.sep}`)) {
  throw new Error(
    "Notebook path must remain inside the CounterLab repository.",
  );
}
const bytes = await readFile(notebookPath);
const manifest = parseNotebook(bytes, path.basename(notebookPath), {
  maxBytes: 10_485_760,
  createdAt: new Date().toISOString(),
});
const routing = routeArtifactConcept(manifest);
if (routing.kind !== "selected") {
  throw new Error(
    `Notebook routing did not select one released concept: ${routing.kind}`,
  );
}
const claim =
  routing.concept === "class_imbalance"
    ? "The high test accuracy proves this classifier catches rare fraud."
    : "The high random-split accuracy proves generalization to new customers.";
const analyst = createLiveBeliefAnalystFromEnv(process.env);
const result = await analyst.proposeBeliefSpec({
  sessionId: `verify_${manifest.fileSha256.slice(0, 16)}`,
  learnerClaim: claim,
  manifest,
  concept: routing.concept,
});

console.log(
  JSON.stringify(
    {
      status: "VERIFIED",
      schemaVersion: result.beliefSpec.schemaVersion,
      concept: result.beliefSpec.concept,
      supportState: result.beliefSpec.supportState,
      evidenceReferences: result.beliefSpec.evidenceRefs.map((reference) => ({
        kind: reference.kind,
        cellIndex: reference.cellIndex ?? null,
        outputIndex: reference.outputIndex ?? null,
        hash: reference.hash,
      })),
      modelOutputValidated: true,
      evidenceResolved: true,
    },
    null,
    2,
  ),
);
