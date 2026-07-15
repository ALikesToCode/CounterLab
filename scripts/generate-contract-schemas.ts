import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  BeliefSpecV2Schema,
  ExperimentPlanV2Schema,
  PatchPlanV1Schema,
} from "../packages/contracts/src/index.js";
import {
  ScientificEngineEvidenceCatalogSchema,
  ScientificEngineRegistrySchema,
  ScientificEngineRuntimeManifestSchema,
  ScientificEngineSnapshotSchema,
  SubjectPackEngineBindingsSchema,
} from "../packages/scientific-engine-registry/src/index.js";
import { ExperimentIRV5Schema } from "../packages/experiment-ir/src/index.js";

const root = resolve(import.meta.dirname, "..");
const schemas = [
  {
    fileName: "belief-spec-v2.schema.json",
    id: "https://counterlab.dev/schemas/belief-spec-v2.schema.json",
    title: "CounterLab Belief Spec v2",
    schema: BeliefSpecV2Schema,
    destinations: [
      resolve(root, "packages/contracts/schemas/belief-spec-v2.schema.json"),
    ],
  },
  {
    fileName: "experiment-ir-v5.schema.json",
    id: "https://counterlab.dev/schemas/experiment-ir-v5.schema.json",
    title: "CounterLab Experiment IR v5",
    schema: ExperimentIRV5Schema,
    destinations: [
      resolve(
        root,
        "packages/experiment-ir/schemas/experiment-ir-v5.schema.json",
      ),
      resolve(
        root,
        "services/kernel/src/counterlab_kernel/schemas/experiment-ir-v5.schema.json",
      ),
    ],
  },
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
  {
    fileName: "CounterLab_Scientific_Engine_Registry_v5_1.schema.json",
    id: "https://counterlab.dev/schemas/scientific-engine-snapshot-v5.1.schema.json",
    title: "CounterLab scientific engine authority snapshot v5.1",
    schema: ScientificEngineSnapshotSchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/CounterLab_Scientific_Engine_Registry_v5_1.schema.json",
      ),
    ],
  },
  {
    fileName: "scientific-engine-registry-v1.schema.json",
    id: "https://counterlab.dev/schemas/scientific-engine-registry-v1.schema.json",
    title: "CounterLab scientific engine registry v1",
    schema: ScientificEngineRegistrySchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/scientific-engine-registry-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "subject-pack-engine-bindings-v1.schema.json",
    id: "https://counterlab.dev/schemas/subject-pack-engine-bindings-v1.schema.json",
    title: "CounterLab Subject Pack engine bindings v1",
    schema: SubjectPackEngineBindingsSchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/subject-pack-engine-bindings-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "scientific-engine-runtime-v1.schema.json",
    id: "https://counterlab.dev/schemas/scientific-engine-runtime-v1.schema.json",
    title: "CounterLab scientific engine runtime manifest v1",
    schema: ScientificEngineRuntimeManifestSchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/scientific-engine-runtime-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "scientific-engine-evidence-v1.schema.json",
    id: "https://counterlab.dev/schemas/scientific-engine-evidence-v1.schema.json",
    title: "CounterLab scientific engine evidence catalog v1",
    schema: ScientificEngineEvidenceCatalogSchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/scientific-engine-evidence-v1.schema.json",
      ),
    ],
  },
];

for (const definition of schemas) {
  const generated = z.toJSONSchema(definition.schema);
  const serialized = `${JSON.stringify(
    { $id: definition.id, title: definition.title, ...generated },
    null,
    2,
  )}\n`;
  const destinations =
    "destinations" in definition
      ? definition.destinations
      : [
          resolve(root, "packages/contracts/schemas", definition.fileName),
          resolve(
            root,
            "services/kernel/src/counterlab_kernel/schemas",
            definition.fileName,
          ),
        ];
  for (const destination of destinations) {
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, serialized, "utf8");
  }
}
