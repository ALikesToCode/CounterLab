import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  ExperimentPlanV2Schema,
  PatchPlanV1Schema,
} from "../packages/contracts/src/index.js";

const root = resolve(import.meta.dirname, "..");
const schemas = [
  {
    fileName: "experiment-plan-v2.schema.json",
    id: "https://counterlab.dev/schemas/experiment-plan-v2.schema.json",
    title: "CounterLab hosted Experiment Plan v2",
    schema: ExperimentPlanV2Schema,
  },
  {
    fileName: "patch-plan-v1.schema.json",
    id: "https://counterlab.dev/schemas/patch-plan-v1.schema.json",
    title: "CounterLab hosted Patch Plan v1",
    schema: PatchPlanV1Schema,
  },
];

for (const definition of schemas) {
  const generated = z.toJSONSchema(definition.schema);
  const serialized = `${JSON.stringify(
    { $id: definition.id, title: definition.title, ...generated },
    null,
    2,
  )}\n`;
  for (const destination of [
    resolve(root, "packages/contracts/schemas", definition.fileName),
    resolve(
      root,
      "services/kernel/src/counterlab_kernel/schemas",
      definition.fileName,
    ),
  ]) {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, serialized, "utf8");
  }
}
