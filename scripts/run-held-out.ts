import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  renderHeldOutMatrix,
  runHeldOutBenchmark,
} from "../evals/held-out/src/runner.js";
import { HeldOutBenchmarkResultSchema } from "../evals/held-out/src/schemas.js";

function releaseComparableResult(
  result: Awaited<ReturnType<typeof runHeldOutBenchmark>>,
) {
  return {
    ...result,
    executedAt: "<release-check-ignores-execution-time>",
    cases: result.cases.map((heldOutCase) => ({
      ...heldOutCase,
      completion: {
        ...heldOutCase.completion,
        durationMs: 0,
      },
    })),
  };
}

const root = process.cwd();
const args = process.argv.slice(2);
if (args.some((argument) => argument !== "--check") || args.length > 1) {
  throw new Error("Usage: node --import tsx scripts/run-held-out.ts [--check]");
}
const checkOnly = args[0] === "--check";
const result = await runHeldOutBenchmark({ root });
const docs = path.join(root, "docs");
if (checkOnly) {
  const trackedResult = HeldOutBenchmarkResultSchema.parse(
    JSON.parse(
      await readFile(path.join(docs, "HELD_OUT_RESULTS.json"), "utf8"),
    ),
  );
  if (
    JSON.stringify(releaseComparableResult(result)) !==
    JSON.stringify(releaseComparableResult(trackedResult))
  ) {
    throw new Error(
      "Held-out execution no longer matches docs/HELD_OUT_RESULTS.json",
    );
  }
  const trackedMatrix = await readFile(
    path.join(docs, "HELD_OUT_MATRIX.md"),
    "utf8",
  );
  if (renderHeldOutMatrix(result) !== trackedMatrix) {
    throw new Error(
      "Held-out execution no longer matches docs/HELD_OUT_MATRIX.md",
    );
  }
} else {
  await mkdir(docs, { recursive: true });
  await writeFile(
    path.join(docs, "HELD_OUT_RESULTS.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(docs, "HELD_OUT_MATRIX.md"),
    renderHeldOutMatrix(result),
    "utf8",
  );
}
console.log(
  `Held-out intake/routing: ${result.summary.passed}/${result.summary.total}; ` +
    `fixed full-loop completion: ${result.summary.supportedCompletion.passed}/${result.summary.supportedCompletion.total}; ` +
    (checkOnly
      ? "tracked held-out evidence matched"
      : "results written to docs/HELD_OUT_RESULTS.json"),
);
process.exitCode =
  result.summary.failed === 0 && result.summary.supportedCompletion.passed >= 6
    ? 0
    : 1;
