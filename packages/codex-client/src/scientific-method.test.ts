import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DiscriminationContractV1Schema,
  type EvidenceRef,
} from "@counterlab/contracts";
import {
  ExperimentIRV5Schema,
  hashExperimentIR,
} from "@counterlab/experiment-ir";
import {
  LabSceneDraftV2Schema,
  LabSceneV2Schema,
} from "@counterlab/generative-ui-contracts";
import { hashCanonical } from "@counterlab/session-core";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AppServerCodexCompiler,
  buildCompileHostedScientificMethodPrompt,
  buildRepairHostedScientificMethodPrompt,
  type CompileHostedScientificMethodInput,
  type CompilerEvent,
  type RepairHostedScientificMethodInput,
} from "./index.js";
import { hasUnsupportedRegexLookaround } from "./app-server.js";

const digest = (character: string) => character.repeat(64);
const generationDirectory = "/tmp/counterlab/generated/session_test";
const unisolatedTestProcess = {
  allowUnisolatedTestProcess: true as const,
  restartDelayMs: 0,
};

function evidence(): EvidenceRef {
  return {
    cellIndex: 2,
    kind: "code",
    hash: digest("a"),
    excerpt: "train_test_split(X, y)",
    relevance: "This cell defines the row-wise evaluation boundary.",
  };
}

function scientificInput(
  directory = generationDirectory,
): CompileHostedScientificMethodInput {
  const evidenceRef = evidence();
  return {
    sessionId: "session_test",
    generationDirectory: directory,
    artifactManifestHash: digest("e"),
    beliefSpecHash: digest("f"),
    approvedBeliefSpec: {
      schemaVersion: "2",
      id: "belief_test",
      concept: "entity_leakage",
      claim: "The row split proves performance for unseen accounts.",
      evidenceRefs: [evidenceRef],
      hypotheses: [
        {
          id: "current",
          statement: "Behavioral signal generalizes to unseen accounts.",
          conditions: ["Deployment evaluates unseen accounts."],
          nonClaims: ["This does not establish every deployment condition."],
          evidence: [evidenceRef],
          supportedCandidateExperimentIds: ["group-holdout"],
        },
        {
          id: "competing",
          statement: "Repeated account identity inflates the row split.",
          conditions: ["Accounts repeat across rows."],
          nonClaims: ["This does not prove there is no behavioral signal."],
          evidence: [evidenceRef],
          supportedCandidateExperimentIds: ["group-holdout"],
        },
      ],
      alternatives: [],
      uncertainty: 0.84,
      supportState: "SUPPORTED",
      learnerDecision: "CONFIRMED",
    },
    artifactManifest: {
      artifactId: "artifact_test",
      fileName: "accounts.ipynb",
      fileSha256: digest("b"),
      nbformat: 4,
      support: { status: "SUPPORTED", reasons: [] },
      cells: [
        {
          index: 2,
          type: "code",
          sourceSha256: digest("a"),
          sourceExcerpt: "train_test_split(X, y)",
          executionCount: 2,
          outputHashes: [],
          symbols: ["train_test_split"],
          metricCandidates: [],
        },
      ],
      schemaSummary: {
        fields: [
          {
            name: "account_id",
            inferredType: "string",
            privacyClass: "identifier",
          },
        ],
        entityCandidates: ["account_id"],
        targetCandidates: ["cancelled"],
      },
      packageHints: ["sklearn"],
      createdAt: "2026-07-16T05:00:00.000Z",
    },
    conceptPack: {
      id: "entity_leakage",
      version: "2.0.0",
      title: "Entity leakage",
      allowedOperations: [
        "leakage.random_row_split",
        "leakage.group_holdout",
        "leakage.identity_ablation",
      ],
      allowedMetrics: ["accuracy", "roc_auc", "entity_overlap_rate"],
      allowedVisualizations: ["metric_comparison", "entity_overlap"],
      verifierInvariants: ["zero_group_overlap"],
      candidateExperimentIds: ["group-holdout"],
      boundarySweep: {
        sweepId: "leakage-recurrence-sweep",
        axisIds: ["test_fraction", "observations_per_entity"],
        gridPresetId: "leakage-boundary-grid-v1",
        observableId: "optimism_gap",
        maxCells: 25,
      },
      transferTask: {
        id: "forecast-future-leakage-v1",
        evaluatorTaskId: "forecasting-future-leakage-01",
        title: "Choose an evaluation boundary that cannot see the future",
        experimentIrContract: {
          taskId: "forecast-future-leakage-v1",
          changedSurface: "Time-ordered forecasting",
          requiredActionIds: ["time_ordered_holdout"],
          nonClaims: ["This transfer does not certify global mastery."],
        },
      },
      planRequirements: [
        'Fixed scorer required heldConstantIds: ["model","seed","test_fraction","entity_field","primary_identity_setting","preprocessing","model_hyperparameters"].',
        'Fixed scorer decisive pattern pairs: [{"currentPatternId":"leakage.small-gap","competingPatternId":"leakage.material-gap","separation":0.82}].',
      ],
    },
    schemas: {
      discriminationContract: z.toJSONSchema(DiscriminationContractV1Schema),
      experimentIr: z.toJSONSchema(ExperimentIRV5Schema),
      labScene: z.toJSONSchema(LabSceneDraftV2Schema),
    },
    provenance: {
      generatorId: "codex-app-server-v1",
      promptHash: digest("1"),
      inputHashes: [digest("e"), digest("f")],
    },
    resourceLimits: { wallSeconds: 45, memoryMb: 768, maxRuns: 4 },
    permittedOutputs: [
      "discrimination-contract.json",
      "experiment-ir.json",
      "lab-scene.json",
      "public-rationale.md",
    ],
  };
}

async function collect(iterable: AsyncIterable<CompilerEvent>) {
  const events: CompilerEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

describe("hosted scientific-method compiler", () => {
  it("detects lookaround assertions without stripping regex literals", () => {
    for (const pattern of ["a(?=b)", "a(?!b)", "(?<=a)b", "(?<!a)b"])
      expect(hasUnsupportedRegexLookaround(pattern)).toBe(true);
    for (const pattern of [
      "^[a-z]+$",
      "[(?=]",
      String.raw`\(\?=literal`,
      "a(?:b)",
    ])
      expect(hasUnsupportedRegexLookaround(pattern)).toBe(false);
  });

  it("asks Codex for unselected typed artifacts and preserves fixed authority", () => {
    const prompt = buildCompileHostedScientificMethodPrompt(scientificInput());
    expect(prompt).toContain("discrimination-contract.json");
    expect(prompt).toContain("experiment-ir.json");
    expect(prompt).toContain("lab-scene.json");
    expect(prompt).toMatch(/selection must remain UNSELECTED/i);
    expect(prompt).toMatch(/fixed scorer/i);
    expect(prompt).toContain("Fixed scorer composition requirements:");
    expect(prompt).toContain("primary_identity_setting");
    expect(prompt).toContain("leakage.small-gap");
    expect(prompt).toContain("leakage.material-gap");
    expect(prompt).toMatch(
      /discriminationContract\.candidateExperimentIds.*experimentIr\.candidateExperiments/i,
    );
    expect(prompt).toMatch(
      /discriminationContract\.nonClaims.*experimentIr\.nonClaims.*exactly/i,
    );
    expect(prompt).toContain(
      "Copy approvedBeliefSpec.evidenceRefs exactly and in order into both discriminationContract.evidenceRefs and experimentIr.evidenceRefs",
    );
    expect(prompt).toMatch(
      /candidate.*operationIds.*observableIds.*allowlists/i,
    );
    expect(prompt).toMatch(/no literal result values/i);
    expect(prompt).toMatch(/copy conceptPack\.boundarySweep exactly/i);
    expect(prompt).toMatch(
      /copy conceptPack\.transferTask\.experimentIrContract exactly into experimentIr\.transfer/i,
    );
    expect(prompt).toContain("forecast-future-leakage-v1");
    expect(prompt).toContain("forecasting-future-leakage-01");
    expect(prompt).toMatch(/Transfer block.*evaluatorId/i);
    expect(prompt).toMatch(/do not rename, reorder, omit, extend, or author/i);
    expect(prompt).not.toContain(generationDirectory);
  });

  it("rejects any output outside the four v5 files", () => {
    expect(() =>
      buildCompileHostedScientificMethodPrompt({
        ...scientificInput(),
        permittedOutputs: [
          "discrimination-contract.json",
          "experiment-ir.json",
          "generated-widget.tsx",
          "public-rationale.md",
        ],
      }),
    ).toThrow(/four scientific artifacts/i);
  });

  it("bounds repair to two turns and exposes only structured findings", () => {
    const repair: RepairHostedScientificMethodInput = {
      ...scientificInput(),
      repairAttempt: 2,
      verifierCounterexamples: [
        {
          invariant: "NON_DISCRIMINATING_EXPERIMENT",
          observed: { changedVariables: 2 },
          expected: { changedVariables: 1 },
          counterexample: "The candidate changes the split and estimator.",
        },
      ],
      previousOutputHashes: {
        "discrimination-contract.json": digest("2"),
        "experiment-ir.json": digest("3"),
        "lab-scene.json": digest("4"),
        "public-rationale.md": digest("5"),
      },
      previousArtifacts: {
        discriminationContract: { schemaVersion: "1" },
        experimentIr: { schemaVersion: "5" },
        labScene: { schemaVersion: "2" },
      },
    };
    const prompt = buildRepairHostedScientificMethodPrompt(repair);
    expect(prompt).toContain("repair attempt 2 of at most 2");
    expect(prompt).toContain("NON_DISCRIMINATING_EXPERIMENT");
    expect(prompt).toContain("The candidate changes the split and estimator.");
    expect(() =>
      buildRepairHostedScientificMethodPrompt({
        ...repair,
        repairAttempt: 3,
      } as unknown as RepairHostedScientificMethodInput),
    ).toThrow();
  });

  it("materializes three locally validated artifacts and adds fixed provenance", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-scientific-method-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--expect-strict-output-schema",
        "--structured-scientific-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      const events = await collect(
        compiler.compileScientificMethod(scientificInput(work)),
      );
      const discrimination = DiscriminationContractV1Schema.parse(
        JSON.parse(
          await readFile(join(work, "discrimination-contract.json"), "utf8"),
        ),
      );
      const ir = ExperimentIRV5Schema.parse(
        JSON.parse(await readFile(join(work, "experiment-ir.json"), "utf8")),
      );
      const scene = LabSceneV2Schema.parse(
        JSON.parse(await readFile(join(work, "lab-scene.json"), "utf8")),
      );
      expect(ir.selection).toEqual({ status: "UNSELECTED" });
      expect(scene.provenance).toEqual({
        discriminationContractHash: await hashCanonical(discrimination),
        experimentIrHash: await hashExperimentIR(ir),
      });
      expect(await readFile(join(work, "public-rationale.md"), "utf8")).toBe(
        "Whole-entity holdout changes only the deployment boundary.\n",
      );
      expect(events).toContainEqual(
        expect.objectContaining({
          type: "file_change",
          files: [
            "discrimination-contract.json",
            "experiment-ir.json",
            "lab-scene.json",
            "public-rationale.md",
          ],
        }),
      );
      expect(events.some((event) => event.type === "command")).toBe(false);
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("writes nothing when Codex tries to claim experiment-selection authority", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-invalid-science-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--structured-scientific-output",
        "--structured-scientific-selected-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await expect(
        collect(compiler.compileScientificMethod(scientificInput(work))),
      ).rejects.toMatchObject({ code: "CODEX_PROTOCOL_ERROR" });
      for (const path of scientificInput(work).permittedOutputs) {
        await expect(readFile(join(work, path), "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });

  it("keeps full local binding validation after model-schema normalization", async () => {
    const fakeServer = fileURLToPath(
      new URL("./test-fixtures/fake-app-server.mjs", import.meta.url),
    );
    const work = await mkdtemp(join(tmpdir(), "counterlab-unsafe-binding-"));
    const compiler = new AppServerCodexCompiler({
      command: process.execPath,
      commandArgs: [
        fakeServer,
        "--expect-structured-turn",
        "--expect-strict-output-schema",
        "--structured-scientific-output",
        "--structured-scientific-unsafe-binding-output",
      ],
      timeoutMs: 2_000,
      ...unisolatedTestProcess,
    });

    try {
      await expect(
        collect(compiler.compileScientificMethod(scientificInput(work))),
      ).rejects.toMatchObject({ code: "CODEX_PROTOCOL_ERROR" });
      for (const path of scientificInput(work).permittedOutputs) {
        await expect(readFile(join(work, path), "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      }
    } finally {
      await rm(work, { recursive: true, force: true });
    }
  });
});
