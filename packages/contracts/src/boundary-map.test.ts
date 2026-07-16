import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
} from "./index.js";

const digest = (character: string) => character.repeat(64);

function leakageMap() {
  const withoutHash = {
    schemaVersion: "1" as const,
    canonicalProfile: "counterlab-canonical-json-v1" as const,
    boundaryMapId: "boundary_leakage_1",
    sessionId: "session_live_1",
    concept: "entity_leakage" as const,
    conceptPackVersion: "2.1.0",
    artifactManifestHash: digest("a"),
    experimentIrHash: digest("b"),
    authoritativeResultHash: digest("c"),
    evidenceVerdictHash: digest("d"),
    sweepId: "leakage-recurrence-sweep",
    gridPresetId: "leakage-boundary-grid-v1",
    seed: 1729,
    kernelVersion: "0.1.0",
    axes: [
      {
        id: "test_fraction",
        label: "Test fraction",
        unit: "proportion",
        points: [
          { id: "test-10", value: 0.1, label: "10%" },
          { id: "test-20", value: 0.2, label: "20%" },
        ],
      },
      {
        id: "observations_per_entity",
        label: "Observations per customer",
        unit: "observations/customer",
        points: [
          { id: "observations-1", value: 1, label: "1" },
          { id: "observations-2", value: 2, label: "2" },
        ],
      },
    ] as const,
    cells: [
      ["test-10", 0.1, "observations-1", 1, "little", 0.61, 0.6],
      ["test-10", 0.1, "observations-2", 2, "material", 0.91, 0.6],
      ["test-20", 0.2, "observations-1", 1, "transition", 0.66, 0.6],
      ["test-20", 0.2, "observations-2", 2, "material", 0.94, 0.6],
    ].map(
      (
        [
          testId,
          testValue,
          observationsId,
          observations,
          classification,
          random,
          group,
        ],
        index,
      ) => ({
        concept: "entity_leakage" as const,
        cellId: `leakage-cell-${index + 1}`,
        coordinates: [
          { axisId: "test_fraction", pointId: testId, value: testValue },
          {
            axisId: "observations_per_entity",
            pointId: observationsId,
            value: observations,
          },
        ] as const,
        classificationId: classification,
        randomAccuracy: random,
        groupAccuracy: group,
        optimismGap: Number(random) - Number(group),
        randomEntityOverlap: { count: 24, rate: 1 },
        groupEntityOverlap: { count: 0, rate: 0 },
        sampleSizes: { randomTest: 72, groupTest: 72 },
        fixtureViewHash: digest("e"),
        randomPipelineFingerprint: digest("f"),
        groupPipelineFingerprint: digest("1"),
      }),
    ),
    classifications: [
      {
        id: "material",
        label: "Material optimism",
        description: "The random-row gap is at least ten points.",
      },
      {
        id: "transition",
        label: "Transition",
        description: "The gap is visible but below ten points.",
      },
      {
        id: "little",
        label: "Little observed gap",
        description: "This configuration shows at most three points.",
      },
    ],
    units: { optimism_gap: "accuracy proportion" },
    assumptions: ["The estimator and preprocessing remain fixed."],
    nonClaims: ["A small observed gap does not prove universal safety."],
  };
  return { ...withoutHash, resultHash: digest("2") };
}

describe("Boundary Map v1 contracts", () => {
  it("accepts an exact two-axis, concept-specific map", () => {
    const parsed = BoundaryMapResultV1Schema.parse(leakageMap());
    expect(parsed.cells).toHaveLength(4);
    expect(parsed.axes.map((axis) => axis.id)).toEqual([
      "test_fraction",
      "observations_per_entity",
    ]);
  });

  it("rejects missing, duplicate, unresolved, and cross-concept cells", () => {
    const valid = leakageMap();
    expect(() =>
      BoundaryMapResultV1Schema.parse({
        ...valid,
        cells: valid.cells.slice(1),
      }),
    ).toThrow(/grid/i);
    expect(() =>
      BoundaryMapResultV1Schema.parse({
        ...valid,
        cells: [valid.cells[0], valid.cells[0], ...valid.cells.slice(2)],
      }),
    ).toThrow(/duplicate/i);
    expect(() =>
      BoundaryMapResultV1Schema.parse({
        ...valid,
        cells: [
          {
            ...valid.cells[0],
            coordinates: [
              { axisId: "test_fraction", pointId: "missing", value: 0.1 },
              valid.cells[0]!.coordinates[1],
            ],
          },
          ...valid.cells.slice(1),
        ],
      }),
    ).toThrow(/resolve/i);
    expect(() =>
      BoundaryMapResultV1Schema.parse({
        ...valid,
        cells: [
          {
            ...valid.cells[0],
            concept: "class_imbalance",
          },
          ...valid.cells.slice(1),
        ],
      }),
    ).toThrow();
  });

  it("binds verification, integrity mode, and the session authority ref", () => {
    const report = BoundaryMapVerificationReportV1Schema.parse({
      schemaVersion: "1",
      status: "VERIFIED",
      verifierVersion: "boundary-map-verifier-v1",
      resultHash: digest("2"),
      invariantCount: 1,
      invariants: [
        {
          name: "complete_grid",
          passed: true,
          observed: 4,
          expected: 4,
        },
      ],
      reportHash: digest("3"),
    });
    const receipt = BoundaryMapReceiptV1Schema.parse({
      schemaVersion: "1",
      canonicalProfile: "counterlab-canonical-json-v1",
      sessionId: "session_live_1",
      resultHash: digest("2"),
      verificationReportHash: report.reportHash,
      experimentIrHash: digest("b"),
      authoritativeResultHash: digest("c"),
      evidenceVerdictHash: digest("d"),
      issuedAt: "2026-07-16T12:00:00.000Z",
      integrity: {
        mode: "integrity-hashed",
        algorithm: "sha256",
        contentHash: digest("4"),
      },
      receiptHash: digest("5"),
    });

    expect(
      BoundaryMapAuthorityRefV1Schema.parse({
        jobId: "job_boundary_1",
        sweepId: "leakage-recurrence-sweep",
        resultHash: digest("2"),
        verificationReportHash: report.reportHash,
        receipt,
        cellCount: 4,
      }),
    ).toMatchObject({ cellCount: 4 });

    expect(() =>
      BoundaryMapReceiptV1Schema.parse({
        ...receipt,
        integrity: {
          mode: "hmac-signed",
          algorithm: "hmac-sha256",
          contentHash: digest("4"),
        },
      }),
    ).toThrow(/signature/i);
  });

  it("keeps committed JSON Schemas aligned with every authority contract", async () => {
    const definitions = [
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
    ];

    for (const definition of definitions) {
      const committed = JSON.parse(
        await readFile(
          new URL(`../schemas/${definition.fileName}`, import.meta.url),
          "utf8",
        ),
      );
      expect(committed).toEqual({
        $id: definition.id,
        title: definition.title,
        ...z.toJSONSchema(definition.schema),
      });
    }
  });
});
