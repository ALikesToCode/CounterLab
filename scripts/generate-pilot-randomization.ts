import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createBalancedRandomization } from "../evals/learner-pilot/src/pilot.js";

const result = createBalancedRandomization({ slots: 24, seed: 1729 });
const output = path.join(
  process.cwd(),
  "evals",
  "learner-pilot",
  "randomization.json",
);
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(
  `Wrote ${result.assignments.length} balanced pilot slots to ${output}`,
);
