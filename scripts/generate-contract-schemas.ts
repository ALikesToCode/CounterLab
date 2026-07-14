import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import { ExperimentPlanV2Schema } from "../packages/contracts/src/index.js";

const root = resolve(import.meta.dirname, "..");
const destinations = [
  resolve(root, "packages/contracts/schemas/experiment-plan-v2.schema.json"),
  resolve(
    root,
    "services/kernel/src/counterlab_kernel/schemas/experiment-plan-v2.schema.json",
  ),
];
const generated = z.toJSONSchema(ExperimentPlanV2Schema);
const schema = {
  $id: "https://counterlab.dev/schemas/experiment-plan-v2.schema.json",
  title: "CounterLab hosted Experiment Plan v2",
  ...generated,
};
const serialized = `${JSON.stringify(schema, null, 2)}\n`;

for (const destination of destinations) {
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, serialized, "utf8");
}
