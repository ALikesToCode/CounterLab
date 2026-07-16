import { createHash } from "node:crypto";

import {
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapVerificationReportV1Schema,
  canonicalJsonV1,
  type BoundaryMapResultV1,
} from "@counterlab/contracts";
import { describe, expect, it } from "vitest";

import {
  issueBoundaryMapAuthority,
  validateBoundaryMapAuthority,
  verifyBoundaryMap,
  type BoundaryMapExpectationV1,
} from "../src/index.js";

const sha = (value: unknown): string =>
  createHash("sha256").update(canonicalJsonV1(value), "utf8").digest("hex");

const digest = (character: string): string => character.repeat(64);

const LEAKAGE_AXES = [
  {
    id: "test_fraction",
    label: "Test fraction",
    unit: "proportion",
    points: [
      { id: "test-fraction-10", value: 0.1, label: "10%" },
      { id: "test-fraction-20", value: 0.2, label: "20%" },
    ],
  },
  {
    id: "observations_per_entity",
    label: "Observations per customer",
    unit: "observations/customer",
    points: [
      { id: "observations-1", value: 1, label: "1 observation" },
      { id: "observations-2", value: 2, label: "2 observations" },
    ],
  },
] as const;

const LEAKAGE_CLASSIFICATIONS = [
  {
    id: "material",
    label: "Material optimism",
    description:
      "Random-row accuracy exceeds group-holdout accuracy by at least 0.10.",
  },
  {
    id: "transition",
    label: "Transition region",
    description: "The observed gap is greater than 0.03 but below 0.10.",
  },
  {
    id: "little",
    label: "Little observed gap",
    description: "The observed gap is at most 0.03.",
  },
] as const;

function leakageAxes(): BoundaryMapResultV1["axes"] {
  return [
    {
      ...LEAKAGE_AXES[0],
      points: LEAKAGE_AXES[0].points.map((point) => ({ ...point })),
    },
    {
      ...LEAKAGE_AXES[1],
      points: LEAKAGE_AXES[1].points.map((point) => ({ ...point })),
    },
  ];
}

const lineage = {
  boundaryMapId: "boundary_leakage_test",
  sessionId: "session_boundary_test",
  concept: "entity_leakage" as const,
  conceptPackVersion: "2.1.0",
  artifactManifestHash: digest("a"),
  experimentIrHash: digest("b"),
  authoritativeResultHash: digest("c"),
  evidenceVerdictHash: digest("d"),
  sweepId: "leakage-recurrence-sweep",
  gridPresetId: "leakage-boundary-grid-v1",
  seed: 1729,
  kernelVersion: "leakage-kernel-v1",
};

function coordinate(
  axisId: string,
  pointId: string,
  value: number,
): { axisId: string; pointId: string; value: number } {
  return { axisId, pointId, value };
}

function leakageCell(
  testFraction: number,
  observations: number,
  randomAccuracy: number,
  groupAccuracy: number,
  classificationId: "material" | "transition" | "little",
): Extract<
  BoundaryMapResultV1["cells"][number],
  { concept: "entity_leakage" }
> {
  const fractionId = `test-fraction-${Math.round(testFraction * 100)}`;
  const observationId = `observations-${observations}`;
  return {
    cellId: `${fractionId}--${observationId}`,
    coordinates: [
      coordinate("test_fraction", fractionId, testFraction),
      coordinate("observations_per_entity", observationId, observations),
    ],
    classificationId,
    concept: "entity_leakage" as const,
    randomAccuracy,
    groupAccuracy,
    optimismGap: Number((randomAccuracy - groupAccuracy).toFixed(12)),
    randomEntityOverlap: {
      count: observations === 1 ? 0 : 10,
      rate: observations === 1 ? 0 : 0.5,
    },
    groupEntityOverlap: { count: 0, rate: 0 },
    sampleSizes: { randomTest: 100, groupTest: 100 },
    fixtureViewHash: digest(observations === 1 ? "1" : "2"),
    randomPipelineFingerprint: digest("e"),
    groupPipelineFingerprint: digest("e"),
  };
}

function withResultHash<T extends Record<string, unknown>>(
  value: T,
): T & { resultHash: string } {
  const { resultHash: _ignored, ...unsigned } = value;
  return { ...unsigned, resultHash: sha(unsigned) } as T & {
    resultHash: string;
  };
}

function leakageMap(): BoundaryMapResultV1 {
  return withResultHash({
    schemaVersion: "1" as const,
    canonicalProfile: "counterlab-canonical-json-v1" as const,
    ...lineage,
    axes: leakageAxes(),
    cells: [
      leakageCell(0.1, 1, 0.7, 0.69, "little"),
      leakageCell(0.1, 2, 0.82, 0.7, "material"),
      leakageCell(0.2, 1, 0.72, 0.68, "transition"),
      leakageCell(0.2, 2, 0.85, 0.72, "material"),
    ],
    classifications: LEAKAGE_CLASSIFICATIONS.map((value) => ({ ...value })),
    units: { optimism_gap: "accuracy proportion" },
    assumptions: ["The model and preprocessing remain fixed."],
    nonClaims: ["This bounded map does not establish global performance."],
  });
}

const LEAKAGE_EXPECTATION: BoundaryMapExpectationV1 = {
  ...lineage,
  axes: leakageAxes(),
  classifications: LEAKAGE_CLASSIFICATIONS.map((value) => ({ ...value })),
  units: { optimism_gap: "accuracy proportion" },
  cellCount: 4,
};

const IMBALANCE_AXES = [
  {
    id: "class_prevalence",
    label: "Positive-class prevalence",
    unit: "proportion",
    points: [
      { id: "rarer", value: 0.1, label: "Rarer" },
      { id: "observed", value: 0.2, label: "Observed" },
    ],
  },
  {
    id: "decision_threshold",
    label: "Decision threshold",
    unit: "probability",
    points: [
      { id: "threshold-20", value: 0.2, label: "0.2" },
      { id: "threshold-50", value: 0.5, label: "0.5" },
    ],
  },
] as const;

const IMBALANCE_CLASSIFICATIONS = [
  {
    id: "strong",
    label: "Stronger balanced utility",
    description: "The fixed F1 score is at least 0.30.",
  },
  {
    id: "tradeoff",
    label: "Tradeoff region",
    description: "The fixed F1 score is at least 0.20 and below 0.30.",
  },
  {
    id: "weak",
    label: "Weak minority utility",
    description: "The fixed F1 score is below 0.20.",
  },
] as const;

function imbalanceAxes(): BoundaryMapResultV1["axes"] {
  return [
    {
      ...IMBALANCE_AXES[0],
      points: IMBALANCE_AXES[0].points.map((point) => ({ ...point })),
    },
    {
      ...IMBALANCE_AXES[1],
      points: IMBALANCE_AXES[1].points.map((point) => ({ ...point })),
    },
  ];
}

const imbalanceLineage = {
  boundaryMapId: "boundary_imbalance_test",
  sessionId: "session_boundary_test",
  concept: "class_imbalance" as const,
  conceptPackVersion: "1.1.0",
  artifactManifestHash: digest("a"),
  experimentIrHash: digest("b"),
  authoritativeResultHash: digest("c"),
  evidenceVerdictHash: digest("d"),
  sweepId: "imbalance-threshold-prevalence-sweep",
  gridPresetId: "imbalance-boundary-grid-v1",
  seed: 2718,
  kernelVersion: "imbalance-kernel-v1",
};

function imbalanceCell(input: {
  scenario: "rarer" | "observed";
  prevalence: number;
  threshold: number;
  confusion: {
    trueNegative: number;
    falsePositive: number;
    falseNegative: number;
    truePositive: number;
  };
}): Extract<
  BoundaryMapResultV1["cells"][number],
  { concept: "class_imbalance" }
> {
  const { scenario, prevalence, threshold, confusion } = input;
  const thresholdId = `threshold-${Math.round(threshold * 100)}`;
  const sampleSize = Object.values(confusion).reduce(
    (total, value) => total + value,
    0,
  );
  const predictedPositive = confusion.falsePositive + confusion.truePositive;
  const actualPositive = confusion.falseNegative + confusion.truePositive;
  const precision =
    predictedPositive === 0 ? 0 : confusion.truePositive / predictedPositive;
  const recall =
    actualPositive === 0 ? 0 : confusion.truePositive / actualPositive;
  const f1 =
    precision + recall === 0
      ? 0
      : (2 * precision * recall) / (precision + recall);
  return {
    cellId: `${scenario}--${thresholdId}`,
    coordinates: [
      coordinate("class_prevalence", scenario, prevalence),
      coordinate("decision_threshold", thresholdId, threshold),
    ],
    classificationId: f1 >= 0.3 ? ("strong" as const) : ("weak" as const),
    concept: "class_imbalance" as const,
    prevalenceScenario: scenario,
    prevalence,
    threshold,
    metrics: {
      accuracy: (confusion.trueNegative + confusion.truePositive) / sampleSize,
      precision,
      recall,
      f1,
      prAuc: scenario === "rarer" ? 0.5 : 0.6,
      rocAuc: scenario === "rarer" ? 0.75 : 0.8,
    },
    confusion,
    predictedPositiveRate: predictedPositive / sampleSize,
    sampleSize,
    scoreFingerprint: digest(scenario === "rarer" ? "3" : "4"),
    pipelineFingerprint: digest("f"),
  };
}

function imbalanceMap(): BoundaryMapResultV1 {
  return withResultHash({
    schemaVersion: "1" as const,
    canonicalProfile: "counterlab-canonical-json-v1" as const,
    ...imbalanceLineage,
    axes: imbalanceAxes(),
    cells: [
      imbalanceCell({
        scenario: "rarer",
        prevalence: 0.1,
        threshold: 0.2,
        confusion: {
          trueNegative: 80,
          falsePositive: 10,
          falseNegative: 2,
          truePositive: 8,
        },
      }),
      imbalanceCell({
        scenario: "rarer",
        prevalence: 0.1,
        threshold: 0.5,
        confusion: {
          trueNegative: 88,
          falsePositive: 2,
          falseNegative: 5,
          truePositive: 5,
        },
      }),
      imbalanceCell({
        scenario: "observed",
        prevalence: 0.2,
        threshold: 0.2,
        confusion: {
          trueNegative: 65,
          falsePositive: 15,
          falseNegative: 2,
          truePositive: 18,
        },
      }),
      imbalanceCell({
        scenario: "observed",
        prevalence: 0.2,
        threshold: 0.5,
        confusion: {
          trueNegative: 77,
          falsePositive: 3,
          falseNegative: 9,
          truePositive: 11,
        },
      }),
    ],
    classifications: IMBALANCE_CLASSIFICATIONS.map((value) => ({ ...value })),
    units: {
      f1: "proportion",
      prevalence: "proportion",
      threshold: "probability",
    },
    assumptions: ["Scores remain fixed inside each prevalence scenario."],
    nonClaims: ["This map does not choose a production threshold."],
  });
}

const IMBALANCE_EXPECTATION: BoundaryMapExpectationV1 = {
  ...imbalanceLineage,
  axes: imbalanceAxes(),
  classifications: IMBALANCE_CLASSIFICATIONS.map((value) => ({ ...value })),
  units: {
    f1: "proportion",
    prevalence: "proportion",
    threshold: "probability",
  },
  cellCount: 4,
};

function mutateAndRehash(
  source: BoundaryMapResultV1,
  mutate: (draft: Record<string, any>) => void,
): BoundaryMapResultV1 {
  const draft = structuredClone(source) as Record<string, any>;
  mutate(draft);
  return withResultHash(draft) as BoundaryMapResultV1;
}

function failedInvariantNames(
  report: ReturnType<typeof verifyBoundaryMap>,
): string[] {
  return report.invariants
    .filter((invariant) => !invariant.passed)
    .map((invariant) => invariant.name);
}

describe("Boundary Map verifier", () => {
  it("verifies a canonical leakage map and hashes the report without reportHash", () => {
    const result = leakageMap();
    const report = verifyBoundaryMap(result, LEAKAGE_EXPECTATION);
    const { reportHash, ...unsignedReport } = report;

    expect(report.status).toBe("VERIFIED");
    expect(report.invariants.every((invariant) => invariant.passed)).toBe(true);
    expect(reportHash).toBe(sha(unsignedReport));
    expect(BoundaryMapVerificationReportV1Schema.parse(report)).toEqual(report);
  });

  it("rejects a stale canonical result hash", () => {
    const result = leakageMap();
    (result.cells[0] as { optimismGap: number }).optimismGap = 0.9;

    const report = verifyBoundaryMap(result, LEAKAGE_EXPECTATION);

    expect(report.status).toBe("REJECTED");
    expect(failedInvariantNames(report)).toContain("canonical_result_hash");
  });

  it.each([
    [
      "swapped axes",
      (draft: Record<string, any>) => {
        draft.axes.reverse();
        for (const cell of draft.cells) cell.coordinates.reverse();
        draft.cells = [
          draft.cells[0],
          draft.cells[2],
          draft.cells[1],
          draft.cells[3],
        ];
      },
      "registered_grid",
    ],
    [
      "out-of-order cells",
      (draft: Record<string, any>) => {
        [draft.cells[1], draft.cells[2]] = [draft.cells[2], draft.cells[1]];
      },
      "canonical_cell_order",
    ],
    [
      "frozen observables",
      (draft: Record<string, any>) => {
        for (const cell of draft.cells) {
          cell.randomAccuracy = 0.7;
          cell.groupAccuracy = 0.69;
          cell.optimismGap = 0.01;
          cell.classificationId = "little";
        }
      },
      "leakage_observable_response",
    ],
    [
      "wrong unit",
      (draft: Record<string, any>) => {
        draft.units.optimism_gap = "percent";
      },
      "registered_units",
    ],
    [
      "wrong legend",
      (draft: Record<string, any>) => {
        draft.classifications[0].label = "Always generalizes";
      },
      "registered_classifications",
    ],
    [
      "wrong classification",
      (draft: Record<string, any>) => {
        draft.cells[0].classificationId = "material";
      },
      "leakage_classification",
    ],
    [
      "stale lineage",
      (draft: Record<string, any>) => {
        draft.experimentIrHash = digest("9");
      },
      "expected_lineage",
    ],
    [
      "changed pipeline",
      (draft: Record<string, any>) => {
        draft.cells[1].groupPipelineFingerprint = digest("8");
      },
      "leakage_pipeline_control",
    ],
    [
      "nonzero group overlap",
      (draft: Record<string, any>) => {
        draft.cells[2].groupEntityOverlap = { count: 1, rate: 0.01 };
      },
      "leakage_group_overlap",
    ],
  ])("rejects the leakage mutation: %s", (_name, mutation, invariantName) => {
    const report = verifyBoundaryMap(
      mutateAndRehash(leakageMap(), mutation),
      LEAKAGE_EXPECTATION,
    );

    expect(report.status).toBe("REJECTED");
    expect(failedInvariantNames(report)).toContain(invariantName);
  });

  it.each([
    [
      "missing cell",
      (draft: Record<string, any>) => {
        draft.cells.pop();
      },
    ],
    [
      "duplicate cell",
      (draft: Record<string, any>) => {
        draft.cells[3] = structuredClone(draft.cells[0]);
      },
    ],
  ])(
    "turns malformed leakage input into a typed rejection: %s",
    (_name, mutation) => {
      const input = mutateAndRehash(leakageMap(), mutation);

      const report = verifyBoundaryMap(input, LEAKAGE_EXPECTATION);

      expect(report.status).toBe("REJECTED");
      expect(failedInvariantNames(report)).toContain("schema_valid");
      expect(BoundaryMapVerificationReportV1Schema.parse(report)).toEqual(
        report,
      );
    },
  );

  it("verifies imbalance confusion, coordinate, score, and threshold authority", () => {
    const report = verifyBoundaryMap(imbalanceMap(), IMBALANCE_EXPECTATION);

    expect(report.status).toBe("VERIFIED");
    expect(report.invariants.every((invariant) => invariant.passed)).toBe(true);
  });

  it.each([
    [
      "confusion total mismatch",
      (draft: Record<string, any>) => {
        draft.cells[0].sampleSize = 99;
      },
      "imbalance_confusion_totals",
    ],
    [
      "prevalence mismatch",
      (draft: Record<string, any>) => {
        draft.cells[0].prevalence = 0.11;
      },
      "imbalance_coordinate_binding",
    ],
    [
      "frozen threshold predictions",
      (draft: Record<string, any>) => {
        for (const scenario of ["rarer", "observed"]) {
          const cells = draft.cells.filter(
            (cell: Record<string, any>) => cell.prevalenceScenario === scenario,
          );
          cells[1].predictedPositiveRate = cells[0].predictedPositiveRate;
          cells[1].confusion = structuredClone(cells[0].confusion);
          cells[1].metrics = structuredClone(cells[0].metrics);
          cells[1].classificationId = cells[0].classificationId;
        }
      },
      "imbalance_threshold_response",
    ],
    [
      "changed score fingerprint",
      (draft: Record<string, any>) => {
        draft.cells[1].scoreFingerprint = digest("8");
      },
      "imbalance_score_control",
    ],
    [
      "changed pipeline fingerprint",
      (draft: Record<string, any>) => {
        draft.cells[3].pipelineFingerprint = digest("8");
      },
      "imbalance_pipeline_control",
    ],
    [
      "wrong F1 classification",
      (draft: Record<string, any>) => {
        draft.cells[0].classificationId = "weak";
      },
      "imbalance_classification",
    ],
  ])("rejects the imbalance mutation: %s", (_name, mutation, invariantName) => {
    const report = verifyBoundaryMap(
      mutateAndRehash(imbalanceMap(), mutation),
      IMBALANCE_EXPECTATION,
    );

    expect(report.status).toBe("REJECTED");
    expect(failedInvariantNames(report)).toContain(invariantName);
  });
});

describe("Boundary Map authority receipt", () => {
  it("issues and validates an integrity-hashed authority reference", () => {
    const result = leakageMap();
    const report = verifyBoundaryMap(result, LEAKAGE_EXPECTATION);
    const authority = issueBoundaryMapAuthority({
      jobId: "job_boundary_1",
      result,
      report,
      expected: LEAKAGE_EXPECTATION,
      issuedAt: "2026-07-16T12:00:00.000Z",
    });
    const { receiptHash, ...unsignedReceipt } = authority.receipt;

    expect(authority.receipt.integrity.mode).toBe("integrity-hashed");
    expect(receiptHash).toBe(sha(unsignedReceipt));
    expect(BoundaryMapReceiptV1Schema.parse(authority.receipt)).toEqual(
      authority.receipt,
    );
    expect(BoundaryMapAuthorityRefV1Schema.parse(authority)).toEqual(authority);
    expect(
      validateBoundaryMapAuthority(authority, {
        result,
        report,
        expected: LEAKAGE_EXPECTATION,
      }),
    ).toEqual(authority);
  });

  it("issues an HMAC-signed receipt and rejects the wrong signing key", () => {
    const result = imbalanceMap();
    const report = verifyBoundaryMap(result, IMBALANCE_EXPECTATION);
    const authority = issueBoundaryMapAuthority({
      jobId: "job_boundary_2",
      result,
      report,
      expected: IMBALANCE_EXPECTATION,
      issuedAt: "2026-07-16T12:00:00.000Z",
      signing: {
        keyId: "boundary-signing-v1",
        signingKey: "test-only-boundary-signing-key",
      },
    });

    expect(authority.receipt.integrity.mode).toBe("hmac-signed");
    expect(
      validateBoundaryMapAuthority(authority, {
        result,
        report,
        expected: IMBALANCE_EXPECTATION,
        signingKey: "test-only-boundary-signing-key",
      }),
    ).toEqual(authority);
    expect(() =>
      validateBoundaryMapAuthority(authority, {
        result,
        report,
        expected: IMBALANCE_EXPECTATION,
        signingKey: "wrong-key",
      }),
    ).toThrow(/HMAC signature/i);
  });

  it("refuses to issue authority for a rejected map", () => {
    const result = mutateAndRehash(leakageMap(), (draft) => {
      draft.cells[0].classificationId = "material";
    });
    const report = verifyBoundaryMap(result, LEAKAGE_EXPECTATION);

    expect(() =>
      issueBoundaryMapAuthority({
        jobId: "job_boundary_rejected",
        result,
        report,
        expected: LEAKAGE_EXPECTATION,
        issuedAt: "2026-07-16T12:00:00.000Z",
      }),
    ).toThrow(/verified/i);
  });

  it("refuses a canonically hashed but fabricated verification report", () => {
    const result = leakageMap();
    const fabricatedDraft = {
      schemaVersion: "1" as const,
      status: "VERIFIED" as const,
      verifierVersion: "boundary-map-verifier-v1" as const,
      resultHash: result.resultHash,
      invariantCount: 1,
      invariants: [
        {
          name: "schema_valid",
          passed: true,
          observed: "BoundaryMapResultV1",
          expected: "BoundaryMapResultV1",
        },
      ],
    };
    const fabricated = BoundaryMapVerificationReportV1Schema.parse({
      ...fabricatedDraft,
      reportHash: sha(fabricatedDraft),
    });

    expect(() =>
      issueBoundaryMapAuthority({
        jobId: "job_boundary_fabricated",
        result,
        report: fabricated,
        expected: LEAKAGE_EXPECTATION,
        issuedAt: "2026-07-16T12:00:00.000Z",
      }),
    ).toThrow(/fresh verifier/i);
  });
});
