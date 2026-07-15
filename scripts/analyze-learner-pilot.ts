import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  PilotSessionSchema,
  analyzePilot,
} from "../evals/learner-pilot/src/pilot.js";

const inputArgument = process.argv[2];
const input = path.resolve(
  inputArgument ?? "evals/learner-pilot/data/session-results.jsonl",
);
let records: unknown[] = [];
try {
  const text = await readFile(input, "utf8");
  records = text
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
} catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
    throw error;
}
const sessions = records.map((record) => PilotSessionSchema.parse(record));
const result = analyzePilot(sessions);
const output = path.resolve("docs/LEARNER_PILOT_RESULTS.json");
await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
console.log(
  result.status === "NO_DATA"
    ? `No pilot records found at ${input}; wrote an explicit NO_DATA result.`
    : `Analyzed ${result.participantCount} pseudonymous pilot sessions.`,
);
