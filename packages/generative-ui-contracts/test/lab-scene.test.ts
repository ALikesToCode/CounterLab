import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { LabSceneDraftV2Schema, LabSceneV2Schema } from "../src/index.js";

const digest = (character: string) => character.repeat(64);

function scene() {
  return {
    schemaVersion: "2" as const,
    sceneId: "scene-live-1",
    sessionId: "session-live-1",
    concept: "entity_leakage" as const,
    supportLabel: "VERIFIED_TEST" as const,
    title: "Does the score survive a new-customer boundary?",
    blocks: [
      {
        id: "hypotheses",
        type: "Hypothesis" as const,
        current: "Behavioral signal generalizes.",
        competing: "Repeated identity inflates the score.",
      },
      {
        id: "why",
        type: "WhyThisTest" as const,
        text: "Change only the customer boundary and keep the model fixed.",
      },
      {
        id: "metric",
        type: "Metric" as const,
        label: "Group-holdout accuracy",
        resultBinding: "/runs/byId/customer_group_split/metrics/accuracy",
        unit: "proportion",
      },
      {
        id: "proof",
        type: "ProofBadge" as const,
        label: "Verified Test",
        proofBinding: "/epistemicReport/verdict",
      },
    ],
    assumptions: ["The fixed public fixture and registered model are used."],
    limitations: ["This scene does not establish global customer performance."],
    provenance: {
      experimentIrHash: digest("a"),
      discriminationContractHash: digest("b"),
    },
  };
}

describe("Lab Scene v2", () => {
  it("accepts only an unbound draft before fixed code supplies provenance", () => {
    const { provenance: _provenance, ...unbound } = scene();
    const draft = {
      ...unbound,
      supportLabel: "GUIDED_VISUAL" as const,
      blocks: unbound.blocks.filter((block) => block.type !== "ProofBadge"),
    };
    expect(LabSceneDraftV2Schema.parse(draft)).not.toHaveProperty("provenance");
    expect(() => LabSceneV2Schema.parse(draft)).toThrow();
    expect(() =>
      LabSceneDraftV2Schema.parse({
        ...draft,
        supportLabel: "VERIFIED_TEST",
      }),
    ).toThrow(/fixed verification/i);
  });

  it("accepts an allowlisted scene whose result blocks use signed bindings", () => {
    expect(LabSceneV2Schema.parse(scene()).blocks).toHaveLength(4);
  });

  it("rejects arbitrary components, executable presentation, and metric literals", () => {
    expect(() =>
      LabSceneV2Schema.parse({
        ...scene(),
        blocks: [{ id: "html", type: "Html", html: "<script />" }],
      }),
    ).toThrow();
    expect(() =>
      LabSceneV2Schema.parse({
        ...scene(),
        blocks: [
          {
            id: "metric",
            type: "Metric",
            label: "Accuracy",
            value: 0.99,
            resultBinding: "/runs/0/metrics/accuracy",
            unit: "proportion",
          },
        ],
      }),
    ).toThrow();
  });

  it("requires a proof binding for every verified badge", () => {
    const withoutBinding = {
      ...scene(),
      blocks: scene().blocks.map((block) =>
        block.type === "ProofBadge"
          ? { id: block.id, type: block.type, label: block.label }
          : block,
      ),
    };
    expect(() => LabSceneV2Schema.parse(withoutBinding)).toThrow();
  });

  it("keeps the committed JSON Schema aligned with the runtime scene", async () => {
    const committed = JSON.parse(
      await readFile(
        new URL("../schemas/lab-scene-v2.schema.json", import.meta.url),
        "utf8",
      ),
    );
    expect(committed).toEqual({
      $id: "https://counterlab.dev/schemas/lab-scene-v2.schema.json",
      title: "CounterLab bounded Lab Scene v2",
      ...z.toJSONSchema(LabSceneV2Schema),
    });

    const draft = JSON.parse(
      await readFile(
        new URL("../schemas/lab-scene-draft-v2.schema.json", import.meta.url),
        "utf8",
      ),
    );
    expect(draft).toEqual({
      $id: "https://counterlab.dev/schemas/lab-scene-draft-v2.schema.json",
      title: "CounterLab unverified Lab Scene draft v2",
      ...z.toJSONSchema(LabSceneDraftV2Schema),
    });
  });
});
