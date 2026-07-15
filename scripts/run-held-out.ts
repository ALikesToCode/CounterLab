import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  renderHeldOutMatrix,
  runHeldOutBenchmark,
} from "../evals/held-out/src/runner.js";

const root = process.cwd();
const result = await runHeldOutBenchmark({ root });
const docs = path.join(root, "docs");
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
console.log(
  `Held-out intake/routing: ${result.summary.passed}/${result.summary.total}; ` +
    `fixed full-loop completion: ${result.summary.supportedCompletion.passed}/${result.summary.supportedCompletion.total}; ` +
    `results written to docs/HELD_OUT_RESULTS.json`,
);
process.exitCode =
  result.summary.failed === 0 && result.summary.supportedCompletion.passed >= 6
    ? 0
    : 1;
