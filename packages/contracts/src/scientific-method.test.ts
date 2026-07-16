import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  DiscriminationContractV1Schema,
  RunnerOutputPathSchema,
} from "./index.js";

const digest = (character: string) => character.repeat(64);

function contract() {
  return {
    schemaVersion: "1" as const,
    contractId: "discrimination-live-1",
    sessionId: "session-live-1",
    concept: "entity_leakage" as const,
    conceptPackVersion: "2.0.0",
    artifactManifestHash: digest("a"),
    beliefSpecId: "belief-live-1",
    beliefSpecHash: digest("b"),
    hypotheses: [
      {
        id: "current" as const,
        statement: "The learned behavior generalizes to unseen customers.",
        decisivePatternId: "leakage.small-gap",
      },
      {
        id: "competing" as const,
        statement: "Repeated customer identity inflates the row split.",
        decisivePatternId: "leakage.material-gap",
      },
    ],
    candidateExperimentIds: ["group-holdout"],
    changedVariableIds: ["split_strategy"],
    controlledVariableIds: ["model", "seed", "preprocessing"],
    observableIds: ["accuracy", "entity_overlap_rate"],
    inconclusiveConditionIds: ["gap-within-tolerance"],
    whyThisTest:
      "Holding the model fixed while separating whole customers tests the deployment boundary directly.",
    nonClaims: [
      "This test does not prove performance for every future customer.",
    ],
    evidenceRefs: [
      {
        cellIndex: 2,
        kind: "code" as const,
        hash: digest("c"),
        excerpt: "train_test_split",
        relevance: "This cell defines the current evaluation boundary.",
      },
    ],
  };
}

describe("Discrimination Contract v1", () => {
  it("accepts a bounded pre-result contract with two ordered hypotheses", () => {
    expect(DiscriminationContractV1Schema.parse(contract())).toMatchObject({
      hypotheses: [{ id: "current" }, { id: "competing" }],
      candidateExperimentIds: ["group-holdout"],
    });
  });

  it("rejects executable fields, literal result claims, and unresolved ordering", () => {
    expect(() =>
      DiscriminationContractV1Schema.parse({
        ...contract(),
        command: "python experiment.py",
      }),
    ).toThrow();
    expect(() =>
      DiscriminationContractV1Schema.parse({
        ...contract(),
        hypotheses: [...contract().hypotheses].reverse(),
      }),
    ).toThrow();
    expect(() =>
      DiscriminationContractV1Schema.parse({
        ...contract(),
        whyThisTest: "The group accuracy will be 0.594444.",
      }),
    ).toThrow(/result literal/i);
  });

  it("keeps the committed JSON Schema aligned with the runtime contract", async () => {
    const committed = JSON.parse(
      await readFile(
        new URL(
          "../schemas/discrimination-contract-v1.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(committed).toEqual({
      $id: "https://counterlab.dev/schemas/discrimination-contract-v1.schema.json",
      title: "CounterLab Discrimination Contract v1",
      ...z.toJSONSchema(DiscriminationContractV1Schema),
    });
  });

  it("registers only the bounded v5 compiler output paths", () => {
    for (const path of [
      "discrimination-contract.json",
      "experiment-ir.json",
      "lab-scene.json",
      "public-rationale.md",
    ]) {
      expect(RunnerOutputPathSchema.parse(path)).toBe(path);
    }
    expect(() =>
      RunnerOutputPathSchema.parse("generated-widget.tsx"),
    ).toThrow();
  });
});
