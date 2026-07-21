import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { z } from "zod";

import {
  BeliefSpecV2Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  DiscriminationContractV1Schema,
  EpistemicObservationV1Schema,
  EpistemicVerifierPolicyV1Schema,
  EvidenceVerdictSchema,
  ExperimentPlanV2Schema,
  PatchPlanV1Schema,
} from "../packages/contracts/src/index.js";
import {
  ContainedRuntimeAttestationSchema,
  ContainedRuntimeAttestationV1Schema,
  DeploymentReceiptV3Schema,
  DeploymentReceiptV4Schema,
  DeploymentReceiptV5Schema,
  DeploymentReceiptV6Schema,
  DeploymentReceiptV7Schema,
  GenerationIsolationEvidenceV1Schema,
  QualifiedRunnerReleaseV2Schema,
  QualifiedRunnerReleaseV3Schema,
  QualifiedRunnerReleaseV4Schema,
  QualifiedRunnerReleaseV5Schema,
  QualifiedRunnerReleaseV6Schema,
  ReleaseCheckReceiptV1Schema,
  ReleaseCheckReceiptV2Schema,
  ReleaseCheckReceiptV3Schema,
  ReleaseCheckReceiptV4Schema,
  ReleaseCheckReceiptV5Schema,
  ScientificEngineEvidenceCatalogSchema,
  ScientificEngineRegistrySchema,
  ScientificEngineRuntimeManifestSchema,
  ScientificEngineSnapshotSchema,
  SubjectPackEngineBindingsSchema,
  TimeoutCleanupReceiptSchema,
} from "../packages/scientific-engine-registry/src/index.js";
import { ExperimentIRV5Schema } from "../packages/experiment-ir/src/index.js";
import {
  LabSceneDraftV2Schema,
  LabSceneV2Schema,
} from "../packages/generative-ui-contracts/src/index.js";

const root = resolve(import.meta.dirname, "..");

function closeTupleArrays(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) closeTupleArrays(item);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const record = value as Record<string, unknown>;
  if (Array.isArray(record.prefixItems)) {
    record.minItems = record.prefixItems.length;
    record.maxItems = record.prefixItems.length;
    record.items = false;
  }
  for (const item of Object.values(record)) closeTupleArrays(item);
}

const schemas = [
  {
    fileName: "generation-isolation-evidence-v1.schema.json",
    id: "https://counterlab.dev/schemas/generation-isolation-evidence-v1.schema.json",
    title: "CounterLab generation isolation evidence v1",
    schema: GenerationIsolationEvidenceV1Schema,
    closeTupleArrays: true,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/generation-isolation-evidence-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "boundary-map-result-v1.schema.json",
    id: "https://counterlab.dev/schemas/boundary-map-result-v1.schema.json",
    title: "CounterLab Boundary Map result v1",
    schema: BoundaryMapResultV1Schema,
  },
  {
    fileName: "boundary-map-verification-v1.schema.json",
    id: "https://counterlab.dev/schemas/boundary-map-verification-v1.schema.json",
    title: "CounterLab Boundary Map verification report v1",
    schema: BoundaryMapVerificationReportV1Schema,
  },
  {
    fileName: "boundary-map-receipt-v1.schema.json",
    id: "https://counterlab.dev/schemas/boundary-map-receipt-v1.schema.json",
    title: "CounterLab Boundary Map receipt v1",
    schema: BoundaryMapReceiptV1Schema,
  },
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
    fileName: "discrimination-contract-v1.schema.json",
    id: "https://counterlab.dev/schemas/discrimination-contract-v1.schema.json",
    title: "CounterLab Discrimination Contract v1",
    schema: DiscriminationContractV1Schema,
    destinations: [
      resolve(
        root,
        "packages/contracts/schemas/discrimination-contract-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "epistemic-observation-v1.schema.json",
    id: "https://counterlab.dev/schemas/epistemic-observation-v1.schema.json",
    title: "CounterLab epistemic observation v1",
    schema: EpistemicObservationV1Schema,
  },
  {
    fileName: "evidence-verdict-v1.schema.json",
    id: "https://counterlab.dev/schemas/evidence-verdict-v1.schema.json",
    title: "CounterLab evidence verdict v1",
    schema: EvidenceVerdictSchema,
  },
  {
    fileName: "epistemic-verifier-policy-v1.schema.json",
    id: "https://counterlab.dev/schemas/epistemic-verifier-policy-v1.schema.json",
    title: "CounterLab epistemic verifier policy v1",
    schema: EpistemicVerifierPolicyV1Schema,
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
    fileName: "lab-scene-draft-v2.schema.json",
    id: "https://counterlab.dev/schemas/lab-scene-draft-v2.schema.json",
    title: "CounterLab unverified Lab Scene draft v2",
    schema: LabSceneDraftV2Schema,
    destinations: [
      resolve(
        root,
        "packages/generative-ui-contracts/schemas/lab-scene-draft-v2.schema.json",
      ),
    ],
  },
  {
    fileName: "lab-scene-v2.schema.json",
    id: "https://counterlab.dev/schemas/lab-scene-v2.schema.json",
    title: "CounterLab bounded Lab Scene v2",
    schema: LabSceneV2Schema,
    destinations: [
      resolve(
        root,
        "packages/generative-ui-contracts/schemas/lab-scene-v2.schema.json",
      ),
    ],
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
  {
    fileName: "qualified-runner-release-v2.schema.json",
    id: "https://counterlab.dev/schemas/qualified-runner-release-v2.schema.json",
    title: "CounterLab qualified runner release v2",
    schema: QualifiedRunnerReleaseV2Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/qualified-runner-release-v2.schema.json",
      ),
    ],
  },
  {
    fileName: "qualified-runner-release-v3.schema.json",
    id: "https://counterlab.dev/schemas/qualified-runner-release-v3.schema.json",
    title: "CounterLab qualified runner release v3",
    schema: QualifiedRunnerReleaseV3Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/qualified-runner-release-v3.schema.json",
      ),
    ],
  },
  {
    fileName: "qualified-runner-release-v4.schema.json",
    id: "https://counterlab.dev/schemas/qualified-runner-release-v4.schema.json",
    title: "CounterLab qualified runner release v4",
    schema: QualifiedRunnerReleaseV4Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/qualified-runner-release-v4.schema.json",
      ),
    ],
  },
  {
    fileName: "qualified-runner-release-v5.schema.json",
    id: "https://counterlab.dev/schemas/qualified-runner-release-v5.schema.json",
    title: "CounterLab qualified runner release v5",
    schema: QualifiedRunnerReleaseV5Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/qualified-runner-release-v5.schema.json",
      ),
    ],
  },
  {
    fileName: "qualified-runner-release-v6.schema.json",
    id: "https://counterlab.dev/schemas/qualified-runner-release-v6.schema.json",
    title: "CounterLab qualified runner release v6",
    schema: QualifiedRunnerReleaseV6Schema,
    closeTupleArrays: true,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/qualified-runner-release-v6.schema.json",
      ),
    ],
  },
  {
    fileName: "timeout-cleanup-receipt-v1.schema.json",
    id: "https://counterlab.dev/schemas/timeout-cleanup-receipt-v1.schema.json",
    title: "CounterLab contained runtime timeout cleanup receipt v1",
    schema: TimeoutCleanupReceiptSchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/timeout-cleanup-receipt-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "contained-runtime-attestation-v1.schema.json",
    id: "https://counterlab.dev/schemas/contained-runtime-attestation-v1.schema.json",
    title: "CounterLab contained runtime attestation v1",
    schema: ContainedRuntimeAttestationV1Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/contained-runtime-attestation-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "contained-runtime-attestation-v2.schema.json",
    id: "https://counterlab.dev/schemas/contained-runtime-attestation-v2.schema.json",
    title: "CounterLab contained runtime attestation v2",
    schema: ContainedRuntimeAttestationSchema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/contained-runtime-attestation-v2.schema.json",
      ),
    ],
  },
  {
    fileName: "release-check-receipt-v1.schema.json",
    id: "https://counterlab.dev/schemas/release-check-receipt-v1.schema.json",
    title: "CounterLab release-check receipt v1",
    schema: ReleaseCheckReceiptV1Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/release-check-receipt-v1.schema.json",
      ),
    ],
  },
  {
    fileName: "release-check-receipt-v2.schema.json",
    id: "https://counterlab.dev/schemas/release-check-receipt-v2.schema.json",
    title: "CounterLab release-check receipt v2",
    schema: ReleaseCheckReceiptV2Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/release-check-receipt-v2.schema.json",
      ),
    ],
  },
  {
    fileName: "release-check-receipt-v3.schema.json",
    id: "https://counterlab.dev/schemas/release-check-receipt-v3.schema.json",
    title: "CounterLab release-check receipt v3",
    schema: ReleaseCheckReceiptV3Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/release-check-receipt-v3.schema.json",
      ),
    ],
  },
  {
    fileName: "release-check-receipt-v4.schema.json",
    id: "https://counterlab.dev/schemas/release-check-receipt-v4.schema.json",
    title: "CounterLab release-check receipt v4",
    schema: ReleaseCheckReceiptV4Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/release-check-receipt-v4.schema.json",
      ),
    ],
  },
  {
    fileName: "release-check-receipt-v5.schema.json",
    id: "https://counterlab.dev/schemas/release-check-receipt-v5.schema.json",
    title: "CounterLab release-check receipt v5",
    schema: ReleaseCheckReceiptV5Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/release-check-receipt-v5.schema.json",
      ),
    ],
  },
  {
    fileName: "deployment-receipt-v3.schema.json",
    id: "https://counterlab.dev/schemas/deployment-receipt-v3.schema.json",
    title: "CounterLab deployment receipt v3",
    schema: DeploymentReceiptV3Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/deployment-receipt-v3.schema.json",
      ),
    ],
  },
  {
    fileName: "deployment-receipt-v4.schema.json",
    id: "https://counterlab.dev/schemas/deployment-receipt-v4.schema.json",
    title: "CounterLab deployment receipt v4",
    schema: DeploymentReceiptV4Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/deployment-receipt-v4.schema.json",
      ),
    ],
  },
  {
    fileName: "deployment-receipt-v5.schema.json",
    id: "https://counterlab.dev/schemas/deployment-receipt-v5.schema.json",
    title: "CounterLab deployment receipt v5",
    schema: DeploymentReceiptV5Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/deployment-receipt-v5.schema.json",
      ),
    ],
  },
  {
    fileName: "deployment-receipt-v6.schema.json",
    id: "https://counterlab.dev/schemas/deployment-receipt-v6.schema.json",
    title: "CounterLab deployment receipt v6",
    schema: DeploymentReceiptV6Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/deployment-receipt-v6.schema.json",
      ),
    ],
  },
  {
    fileName: "deployment-receipt-v7.schema.json",
    id: "https://counterlab.dev/schemas/deployment-receipt-v7.schema.json",
    title: "CounterLab deployment receipt v7",
    schema: DeploymentReceiptV7Schema,
    destinations: [
      resolve(
        root,
        "scientific-engines/schemas/deployment-receipt-v7.schema.json",
      ),
    ],
  },
];

for (const definition of schemas) {
  const generated = z.toJSONSchema(definition.schema);
  if ("closeTupleArrays" in definition && definition.closeTupleArrays) {
    closeTupleArrays(generated);
  }
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
