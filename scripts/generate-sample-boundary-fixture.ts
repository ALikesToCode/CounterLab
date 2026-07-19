import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  access,
  lstat,
  mkdir,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

import {
  BeliefSpecV2Schema,
  BoundaryMapResultV1Schema,
  EvidenceVerdictSchema,
  VerifiedResultSetSchema,
  canonicalJsonV1,
  migrateBeliefTestV1ToV2,
} from "../packages/contracts/src/index.js";
import {
  hashBoundaryMapValue,
  issueBoundaryMapAuthority,
  verifyBoundaryMap,
  type BoundaryMapExpectationV1,
} from "../packages/boundary-map/src/index.js";
import {
  ExperimentIRV5Schema,
  hashExperimentIR,
} from "../packages/experiment-ir/src/index.js";
import { ApprovedSampleBeliefAnalyst } from "../packages/belief-analyst/src/index.js";
import { parseNotebook } from "../packages/notebook-parser/src/index.js";

const root = resolve(import.meta.dirname, "..");
const marker = resolve(root, "COUNTERLAB_REPO_ROOT");
const notebookPath = resolve(
  root,
  "fixtures/notebooks/customer_churn_leakage.ipynb",
);
const primaryResultPath = resolve(
  root,
  "fixtures/public/leakage_verified_result.json",
);
const outputPath = resolve(
  root,
  "fixtures/public/leakage_sample_boundary_v1.json",
);
const pythonPath = resolve(root, ".venv/bin/python");
const runtimeRoot = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/sample-boundary-generator",
);

const sessionId = "sample_boundary_leakage_01_v1";
const subjectPackVersion = "2.1.0";
const generatedAt = "2026-07-18T00:00:00.000Z";
const sampleClaim =
  "The notebook accuracy proves generalization to new customers.";

function assertContained(path: string): void {
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error(`Refusing path outside the CounterLab repository: ${path}`);
  }
}

async function assertSafeOutput(): Promise<void> {
  assertContained(outputPath);
  const physicalRoot = await realpath(root);
  const physicalParent = await realpath(dirname(outputPath));
  if (
    physicalParent !== physicalRoot &&
    !physicalParent.startsWith(`${physicalRoot}${sep}`)
  ) {
    throw new Error("Sample Boundary output parent escapes the repository");
  }
  try {
    if ((await lstat(outputPath)).isSymbolicLink()) {
      throw new Error("Refusing to overwrite a symlinked sample fixture");
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixedExperimentIr(input: {
  artifactManifestHash: string;
  beliefSpec: ReturnType<typeof BeliefSpecV2Schema.parse>;
  beliefSpecHash: string;
  primaryResultHash: string;
}) {
  const baseline = {
    concept: "entity_leakage" as const,
    runId: "random_row_split",
    operation: "leakage.random_row_split" as const,
    seed: 1729,
    testFraction: 0.25,
    entityField: "customer_id",
    dropIdentity: false,
    model: "logistic_regression" as const,
  };
  const intervention = {
    concept: "entity_leakage" as const,
    runId: "customer_group_split",
    operation: "leakage.group_holdout" as const,
    seed: 1729,
    testFraction: 0.25,
    entityField: "customer_id",
    dropIdentity: false,
    model: "logistic_regression" as const,
  };

  return ExperimentIRV5Schema.parse({
    schemaVersion: "5",
    irId: "ir.sample-boundary.leakage-01-v1",
    executionPlanId: "plan-sample-boundary-leakage-01-v1",
    sessionId,
    concept: "entity_leakage",
    conceptPackVersion: subjectPackVersion,
    artifactManifestHash: input.artifactManifestHash,
    beliefSpecId: input.beliefSpec.id,
    beliefSpecHash: input.beliefSpecHash,
    evidenceRefs: input.beliefSpec.evidenceRefs,
    hypotheses: [
      {
        id: "current",
        statement: input.beliefSpec.hypotheses[0].statement,
        conditions: input.beliefSpec.hypotheses[0].conditions,
        nonClaims: input.beliefSpec.hypotheses[0].nonClaims,
        predictedPattern: {
          patternId: "leakage.small-optimism-gap",
          description: "Random-row and whole-customer accuracy remain similar.",
        },
      },
      {
        id: "competing",
        statement: input.beliefSpec.hypotheses[1].statement,
        conditions: input.beliefSpec.hypotheses[1].conditions,
        nonClaims: input.beliefSpec.hypotheses[1].nonClaims,
        predictedPattern: {
          patternId: "leakage.material-optimism-gap",
          description:
            "Accuracy falls under whole-customer holdout while entity overlap becomes zero.",
        },
      },
    ],
    candidateExperiments: [
      {
        id: "whole-customer-holdout",
        title: "Compare familiar rows with whole-customer holdout",
        operationIds: [
          "leakage.random_row_split",
          "leakage.group_holdout",
          "leakage.entity_overlap",
        ],
        baseline,
        interventions: [intervention],
        heldConstantIds: [
          "control.fixture",
          "control.model",
          "control.seed",
          "control.test-fraction",
        ],
        changedVariableIds: ["change.evaluation-unit"],
        observableIds: ["accuracy", "entity_overlap_rate"],
        hypothesisPatterns: [
          {
            hypothesisId: "current",
            patternId: "leakage.small-optimism-gap",
          },
          {
            hypothesisId: "competing",
            patternId: "leakage.material-optimism-gap",
          },
        ],
        inconclusiveConditionIds: ["leakage.gap-within-tolerance"],
        complexityCost: 2,
        discriminatesBecause:
          "Only the evaluation unit changes while the model, seed, fixture, and test fraction remain fixed.",
      },
    ],
    selection: {
      status: "LEGACY_SELECTED",
      candidateId: "whole-customer-holdout",
      adapterVersion: "sample-boundary-adapter-v1",
      notRescored: true,
    },
    visualizations: ["metric_comparison", "entity_overlap"],
    inconclusiveConditions: [
      {
        id: "leakage.gap-within-tolerance",
        description:
          "The optimism gap is too small to distinguish the explanations.",
      },
    ],
    boundarySweep: {
      sweepId: "leakage-recurrence-sweep",
      axisIds: ["test_fraction", "observations_per_entity"],
      gridPresetId: "leakage-boundary-grid-v1",
      observableId: "optimism_gap",
      maxCells: 25,
    },
    transfer: {
      taskId: "forecast-future-leakage-v1",
      changedSurface: "Time-ordered forecasting with future-looking features.",
      requiredActionIds: ["time-ordered-holdout", "remove-future-feature"],
      nonClaims: ["Transfer does not certify global mastery."],
    },
    nonClaims: [
      "This fixed sample does not establish performance for unrelated datasets.",
    ],
    provenance: {
      kind: "fixed",
      generatorId: "counterlab.sample-boundary-fixture-v1",
      inputHashes: [
        input.artifactManifestHash,
        input.beliefSpecHash,
        input.primaryResultHash,
      ],
    },
    limitations: [
      "The Boundary Map is scoped to the registered synthetic customer fixture.",
    ],
    resourceLimits: { wallSeconds: 45, memoryMb: 512, maxRuns: 4 },
  });
}

const pythonSource = String.raw`
import json
import sys

from counterlab_kernel.boundary_map import compute_leakage_boundary_map
from counterlab_kernel.experiment import run_leakage_experiment
from counterlab_kernel.fixture import generate_leakage_fixture
from counterlab_kernel.verifier import verify_candidate

payload = json.load(sys.stdin)
primary_result = run_leakage_experiment(
    generate_leakage_fixture(seed=1729), seed=1729
)
technical_report = verify_candidate(primary_result)
boundary = compute_leakage_boundary_map(**payload["lineage"])
print(json.dumps(
    {
        "primaryResult": primary_result,
        "technicalReport": technical_report,
        "boundary": boundary,
    },
    sort_keys=True,
    separators=(",", ":"),
    ensure_ascii=False,
))
`;

async function main(): Promise<void> {
  await access(marker);
  await access(pythonPath);
  await assertSafeOutput();
  await mkdir(runtimeRoot, { recursive: true });

  const [notebookBytes, primaryResultBytes] = await Promise.all([
    readFile(notebookPath),
    readFile(primaryResultPath),
  ]);
  const manifest = parseNotebook(
    new Uint8Array(notebookBytes),
    "customer_churn_leakage.ipynb",
    {
      maxBytes: 10_485_760,
      createdAt: "2026-07-14T08:45:00.000Z",
    },
  );
  const checkedPrimaryResult = VerifiedResultSetSchema.parse(
    JSON.parse(primaryResultBytes.toString("utf8")),
  );
  if (checkedPrimaryResult.concept !== "entity_leakage") {
    throw new Error("The sample Boundary fixture requires leakage evidence");
  }

  const analyst = new ApprovedSampleBeliefAnalyst();
  const proposed = await analyst.propose({
    sessionId,
    learnerClaim: sampleClaim,
    manifest,
    concept: "entity_leakage",
  });
  const beliefSpec = BeliefSpecV2Schema.parse({
    ...migrateBeliefTestV1ToV2(proposed.beliefTest),
    learnerDecision: "CONFIRMED",
  });
  const beliefSpecHash = hashBoundaryMapValue(beliefSpec);
  const experimentIr = fixedExperimentIr({
    artifactManifestHash: manifest.fileSha256,
    beliefSpec,
    beliefSpecHash,
    primaryResultHash: checkedPrimaryResult.resultHash,
  });
  const experimentIrHash = await hashExperimentIR(experimentIr);

  const preliminaryLineage = {
    session_id: sessionId,
    concept_pack_version: subjectPackVersion,
    artifact_manifest_hash: manifest.fileSha256,
    experiment_ir_hash: experimentIrHash,
    authoritative_result_hash: checkedPrimaryResult.resultHash,
    evidence_verdict_hash: "0".repeat(64),
  };
  const pythonEnvironment = {
    HOME: runtimeRoot,
    TMPDIR: runtimeRoot,
    XDG_CACHE_HOME: runtimeRoot,
    PYTHONPATH: resolve(root, "services/kernel/src"),
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONNOUSERSITE: "1",
    OPENBLAS_NUM_THREADS: "1",
    OMP_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
  };
  const primaryProbe = spawnSync(pythonPath, ["-c", pythonSource], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({ lineage: preliminaryLineage }),
    maxBuffer: 16 * 1024 * 1024,
    env: pythonEnvironment,
  });
  if (primaryProbe.status !== 0) {
    throw new Error(
      `Fixed sample Boundary kernel failed: ${primaryProbe.stderr.trim()}`,
    );
  }
  const firstOutput = JSON.parse(primaryProbe.stdout) as {
    primaryResult: unknown;
    technicalReport: Record<string, unknown>;
  };
  const regeneratedPrimary = VerifiedResultSetSchema.parse(
    firstOutput.primaryResult,
  );
  if (
    canonicalJsonV1(regeneratedPrimary) !==
    canonicalJsonV1(checkedPrimaryResult)
  ) {
    throw new Error(
      "Checked-in sample result does not match a fresh fixed-kernel run",
    );
  }
  if (firstOutput.technicalReport.status !== "VERIFIED") {
    throw new Error(
      "Frozen primary-result verifier rejected the sample fixture",
    );
  }

  const technicalReportHash = hashBoundaryMapValue(firstOutput.technicalReport);
  const evidenceVerdict = EvidenceVerdictSchema.parse({
    schemaVersion: "1",
    kind: "SUPPORTS",
    hypothesisId: "competing",
    scope:
      "The registered customer sample under the fixed row-split and whole-customer evaluation conditions.",
    resultHash: checkedPrimaryResult.resultHash,
    irHash: experimentIrHash,
    technicalReportHash,
    verifierVersion: "sample-fixture-epistemic-verifier-v1",
  });
  const evidenceVerdictHash = hashBoundaryMapValue(evidenceVerdict);
  const lineage = {
    ...preliminaryLineage,
    evidence_verdict_hash: evidenceVerdictHash,
  };

  const completedProbe = spawnSync(pythonPath, ["-c", pythonSource], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify({ lineage }),
    maxBuffer: 16 * 1024 * 1024,
    env: pythonEnvironment,
  });
  if (completedProbe.status !== 0) {
    throw new Error(
      `Fixed sample Boundary kernel failed: ${completedProbe.stderr.trim()}`,
    );
  }
  const output = JSON.parse(completedProbe.stdout) as {
    technicalReport: Record<string, unknown>;
    boundary: unknown;
  };
  if (hashBoundaryMapValue(output.technicalReport) !== technicalReportHash) {
    throw new Error("Primary technical verifier output changed between runs");
  }
  const result = BoundaryMapResultV1Schema.parse(output.boundary);
  const expected: BoundaryMapExpectationV1 = {
    boundaryMapId: result.boundaryMapId,
    sessionId: result.sessionId,
    concept: result.concept,
    conceptPackVersion: result.conceptPackVersion,
    artifactManifestHash: result.artifactManifestHash,
    experimentIrHash: result.experimentIrHash,
    authoritativeResultHash: result.authoritativeResultHash,
    evidenceVerdictHash: result.evidenceVerdictHash,
    sweepId: result.sweepId,
    gridPresetId: result.gridPresetId,
    seed: result.seed,
    kernelVersion: result.kernelVersion,
    axes: result.axes,
    classifications: result.classifications,
    units: result.units,
    assumptions: result.assumptions,
    nonClaims: result.nonClaims,
    cellCount: result.cells.length,
  };
  const report = verifyBoundaryMap(result, expected);
  if (report.status !== "VERIFIED") {
    const failures = report.invariants
      .filter((invariant) => !invariant.passed)
      .map((invariant) => invariant.name)
      .join(", ");
    throw new Error(`Boundary verifier rejected the sample map: ${failures}`);
  }
  const authority = issueBoundaryMapAuthority({
    jobId: "sample-boundary-fixture-job-v1",
    result,
    report,
    expected,
    issuedAt: generatedAt,
  });
  const boundary = {
    result,
    report,
    receipt: authority.receipt,
    authority,
  };
  const unsignedFixture = {
    schemaVersion: "1" as const,
    fixtureId: "leakage-sample-boundary-v1",
    label: "Verified sample exploration" as const,
    generatedAt,
    source: {
      sampleId: "leakage-01",
      artifactManifestHash: manifest.fileSha256,
      primaryResultHash: checkedPrimaryResult.resultHash,
      primaryResultFileHash: sha256(primaryResultBytes),
      subjectPackVersion,
      boundaryKernelVersion: result.kernelVersion,
    },
    beliefSpec,
    experimentIr,
    technicalReport: output.technicalReport,
    evidenceVerdict,
    boundary,
  };
  const fixture = {
    ...unsignedFixture,
    fixtureIntegrityHash: hashBoundaryMapValue(unsignedFixture),
  };
  await writeFile(outputPath, `${canonicalJsonV1(fixture)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  process.stdout.write(
    `VERIFIED_SAMPLE_BOUNDARY ${result.resultHash} fixture=${fixture.fixtureIntegrityHash} cells=${result.cells.length}\n`,
  );
}

await main();
