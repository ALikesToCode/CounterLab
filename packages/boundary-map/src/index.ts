import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import {
  BoundaryMapAuthorityRefV1Schema,
  BoundaryMapReceiptV1Schema,
  BoundaryMapResultV1Schema,
  BoundaryMapVerificationReportV1Schema,
  CANONICAL_JSON_PROFILE,
  canonicalJsonV1,
  type BoundaryMapAuthorityRefV1,
  type BoundaryMapCellV1,
  type BoundaryMapResultV1,
  type BoundaryMapVerificationReportV1,
} from "@counterlab/contracts";

type LeakageCell = Extract<BoundaryMapCellV1, { concept: "entity_leakage" }>;
type ImbalanceCell = Extract<BoundaryMapCellV1, { concept: "class_imbalance" }>;

type ExpectedLineage = Pick<
  BoundaryMapResultV1,
  | "boundaryMapId"
  | "sessionId"
  | "concept"
  | "conceptPackVersion"
  | "artifactManifestHash"
  | "experimentIrHash"
  | "authoritativeResultHash"
  | "evidenceVerdictHash"
  | "sweepId"
  | "gridPresetId"
  | "seed"
  | "kernelVersion"
>;

export type BoundaryMapExpectationV1 = ExpectedLineage & {
  axes: BoundaryMapResultV1["axes"];
  classifications: BoundaryMapResultV1["classifications"];
  units: BoundaryMapResultV1["units"];
  cellCount: number;
};

type BoundaryMapInvariant =
  BoundaryMapVerificationReportV1["invariants"][number];

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const NUMERIC_TOLERANCE = 1e-11;

export function hashBoundaryMapValue(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJsonV1(value), "utf8")
    .digest("hex");
}

function canonicalDiagnosticValue(value: unknown): unknown {
  if (value === undefined) return null;
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (Array.isArray(value)) return value.map(canonicalDiagnosticValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        canonicalDiagnosticValue(nested),
      ]),
    );
  }
  return String(value);
}

function invariant(
  name: string,
  passed: boolean,
  observed: unknown,
  expected: unknown,
  counterexample?: string,
): BoundaryMapInvariant {
  return {
    name,
    passed,
    observed: canonicalDiagnosticValue(observed),
    expected: canonicalDiagnosticValue(expected),
    ...(counterexample === undefined ? {} : { counterexample }),
  };
}

function canonicalEquals(left: unknown, right: unknown): boolean {
  return canonicalJsonV1(left) === canonicalJsonV1(right);
}

function nearlyEqual(
  left: number,
  right: number,
  tolerance = NUMERIC_TOLERANCE,
): boolean {
  return Math.abs(left - right) <= tolerance;
}

function candidateResultHash(input: unknown): string {
  if (
    typeof input === "object" &&
    input !== null &&
    "resultHash" in input &&
    typeof input.resultHash === "string" &&
    SHA256_PATTERN.test(input.resultHash)
  ) {
    return input.resultHash;
  }
  try {
    return hashBoundaryMapValue(canonicalDiagnosticValue(input));
  } catch {
    return hashBoundaryMapValue({ invalidBoundaryMap: typeof input });
  }
}

function createReport(
  resultHash: string,
  invariants: BoundaryMapInvariant[],
): BoundaryMapVerificationReportV1 {
  const draft = {
    schemaVersion: "1" as const,
    status: invariants.every((check) => check.passed)
      ? ("VERIFIED" as const)
      : ("REJECTED" as const),
    verifierVersion: "boundary-map-verifier-v1" as const,
    resultHash,
    invariantCount: invariants.length,
    invariants,
  };
  return BoundaryMapVerificationReportV1Schema.parse({
    ...draft,
    reportHash: hashBoundaryMapValue(draft),
  });
}

function resultHashMatches(result: BoundaryMapResultV1): boolean {
  const { resultHash, ...unsigned } = result;
  return resultHash === hashBoundaryMapValue(unsigned);
}

function expectedLineage(expected: BoundaryMapExpectationV1): ExpectedLineage {
  return {
    boundaryMapId: expected.boundaryMapId,
    sessionId: expected.sessionId,
    concept: expected.concept,
    conceptPackVersion: expected.conceptPackVersion,
    artifactManifestHash: expected.artifactManifestHash,
    experimentIrHash: expected.experimentIrHash,
    authoritativeResultHash: expected.authoritativeResultHash,
    evidenceVerdictHash: expected.evidenceVerdictHash,
    sweepId: expected.sweepId,
    gridPresetId: expected.gridPresetId,
    seed: expected.seed,
    kernelVersion: expected.kernelVersion,
  };
}

function observedLineage(result: BoundaryMapResultV1): ExpectedLineage {
  return {
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
  };
}

function coordinateKey(cell: BoundaryMapCellV1): string {
  return cell.coordinates
    .map((coordinate) => `${coordinate.axisId}:${coordinate.pointId}`)
    .join("|");
}

function expectedCoordinateKeys(axes: BoundaryMapResultV1["axes"]): string[] {
  return axes[0].points.flatMap((first) =>
    axes[1].points.map(
      (second) => `${axes[0].id}:${first.id}|${axes[1].id}:${second.id}`,
    ),
  );
}

function classifyLeakage(gap: number): "material" | "transition" | "little" {
  if (gap >= 0.1) return "material";
  if (gap > 0.03) return "transition";
  return "little";
}

function leakageInvariants(cells: LeakageCell[]): BoundaryMapInvariant[] {
  const arithmeticFailures = cells.filter(
    (cell) =>
      !nearlyEqual(
        cell.optimismGap,
        cell.randomAccuracy - cell.groupAccuracy,
        1e-12,
      ),
  );
  const overlapFailures = cells.filter(
    (cell) =>
      cell.groupEntityOverlap.count !== 0 ||
      !nearlyEqual(cell.groupEntityOverlap.rate, 0, 1e-12),
  );
  const perCellPipelineFailures = cells.filter(
    (cell) => cell.randomPipelineFingerprint !== cell.groupPipelineFingerprint,
  );
  const allPipelineFingerprints = new Set(
    cells.flatMap((cell) => [
      cell.randomPipelineFingerprint,
      cell.groupPipelineFingerprint,
    ]),
  );
  const classificationFailures = cells.filter(
    (cell) => cell.classificationId !== classifyLeakage(cell.optimismGap),
  );
  const observedGaps = new Set(
    cells.map((cell) => cell.optimismGap.toPrecision(15)),
  );

  return [
    invariant(
      "leakage_optimism_arithmetic",
      arithmeticFailures.length === 0,
      arithmeticFailures.map((cell) => cell.cellId),
      [],
      arithmeticFailures[0] === undefined
        ? undefined
        : `${arithmeticFailures[0].cellId} optimism gap does not equal random-row minus group-holdout accuracy.`,
    ),
    invariant(
      "leakage_group_overlap",
      overlapFailures.length === 0,
      overlapFailures.map((cell) => ({
        cellId: cell.cellId,
        overlap: cell.groupEntityOverlap,
      })),
      [],
      overlapFailures[0] === undefined
        ? undefined
        : `${overlapFailures[0].cellId} retains an entity in both group-holdout partitions.`,
    ),
    invariant(
      "leakage_pipeline_control",
      perCellPipelineFailures.length === 0 &&
        allPipelineFingerprints.size === 1,
      {
        changedCells: perCellPipelineFailures.map((cell) => cell.cellId),
        distinctFingerprints: allPipelineFingerprints.size,
      },
      { changedCells: [], distinctFingerprints: 1 },
      perCellPipelineFailures[0] === undefined &&
        allPipelineFingerprints.size === 1
        ? undefined
        : "The estimator or preprocessing fingerprint changed inside the controlled sweep.",
    ),
    invariant(
      "leakage_classification",
      classificationFailures.length === 0,
      classificationFailures.map((cell) => ({
        cellId: cell.cellId,
        classificationId: cell.classificationId,
        expected: classifyLeakage(cell.optimismGap),
      })),
      [],
      classificationFailures[0] === undefined
        ? undefined
        : `${classificationFailures[0].cellId} uses a classification that disagrees with the frozen optimism-gap thresholds.`,
    ),
    invariant(
      "leakage_observable_response",
      observedGaps.size > 1,
      observedGaps.size,
      "> 1 distinct optimism gap",
      observedGaps.size > 1
        ? undefined
        : "Every Boundary Map cell exposes the same optimism gap.",
    ),
  ];
}

function classifyImbalance(f1: number): "strong" | "tradeoff" | "weak" {
  if (f1 >= 0.3) return "strong";
  if (f1 >= 0.2) return "tradeoff";
  return "weak";
}

function scenarioGroups(cells: ImbalanceCell[]): Map<string, ImbalanceCell[]> {
  const groups = new Map<string, ImbalanceCell[]>();
  for (const cell of cells) {
    const group = groups.get(cell.prevalenceScenario) ?? [];
    group.push(cell);
    groups.set(cell.prevalenceScenario, group);
  }
  return groups;
}

function confusionMetrics(cell: ImbalanceCell): {
  total: number;
  prevalence: number;
  predictedPositiveRate: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
} {
  const { trueNegative, falsePositive, falseNegative, truePositive } =
    cell.confusion;
  const total = trueNegative + falsePositive + falseNegative + truePositive;
  const actualPositive = falseNegative + truePositive;
  const predictedPositive = falsePositive + truePositive;
  const precision =
    predictedPositive === 0 ? 0 : truePositive / predictedPositive;
  const recall = actualPositive === 0 ? 0 : truePositive / actualPositive;
  return {
    total,
    prevalence: total === 0 ? 0 : actualPositive / total,
    predictedPositiveRate: total === 0 ? 0 : predictedPositive / total,
    accuracy: total === 0 ? 0 : (trueNegative + truePositive) / total,
    precision,
    recall,
    f1:
      precision + recall === 0
        ? 0
        : (2 * precision * recall) / (precision + recall),
  };
}

function imbalanceInvariants(cells: ImbalanceCell[]): BoundaryMapInvariant[] {
  const confusionFailures = cells.filter(
    (cell) => confusionMetrics(cell).total !== cell.sampleSize,
  );
  const coordinateFailures = cells.filter((cell) => {
    const [prevalenceCoordinate, thresholdCoordinate] = cell.coordinates;
    return (
      prevalenceCoordinate.pointId !== cell.prevalenceScenario ||
      !nearlyEqual(prevalenceCoordinate.value, cell.prevalence) ||
      !nearlyEqual(thresholdCoordinate.value, cell.threshold) ||
      !nearlyEqual(confusionMetrics(cell).prevalence, cell.prevalence)
    );
  });
  const metricFailures = cells.filter((cell) => {
    const derived = confusionMetrics(cell);
    return (
      !nearlyEqual(derived.predictedPositiveRate, cell.predictedPositiveRate) ||
      !nearlyEqual(derived.accuracy, cell.metrics.accuracy) ||
      !nearlyEqual(derived.precision, cell.metrics.precision) ||
      !nearlyEqual(derived.recall, cell.metrics.recall) ||
      !nearlyEqual(derived.f1, cell.metrics.f1)
    );
  });
  const classificationFailures = cells.filter(
    (cell) => cell.classificationId !== classifyImbalance(cell.metrics.f1),
  );
  const groups = scenarioGroups(cells);
  const thresholdFailures = [...groups.entries()]
    .filter(
      ([, group]) =>
        new Set(group.map((cell) => cell.predictedPositiveRate.toPrecision(15)))
          .size <= 1,
    )
    .map(([scenario]) => scenario);
  const scoreFailures = [...groups.entries()]
    .filter(([, group]) => {
      const scoreFingerprints = new Set(
        group.map((cell) => cell.scoreFingerprint),
      );
      const prAucValues = new Set(
        group.map((cell) => cell.metrics.prAuc.toPrecision(15)),
      );
      const rocAucValues = new Set(
        group.map((cell) => cell.metrics.rocAuc.toPrecision(15)),
      );
      return (
        scoreFingerprints.size !== 1 ||
        prAucValues.size !== 1 ||
        rocAucValues.size !== 1
      );
    })
    .map(([scenario]) => scenario);
  const pipelineFingerprints = new Set(
    cells.map((cell) => cell.pipelineFingerprint),
  );
  const f1Values = new Set(
    cells.map((cell) => cell.metrics.f1.toPrecision(15)),
  );

  return [
    invariant(
      "imbalance_confusion_totals",
      confusionFailures.length === 0,
      confusionFailures.map((cell) => ({
        cellId: cell.cellId,
        observed: confusionMetrics(cell).total,
        sampleSize: cell.sampleSize,
      })),
      [],
      confusionFailures[0] === undefined
        ? undefined
        : `${confusionFailures[0].cellId} confusion counts do not total the sample size.`,
    ),
    invariant(
      "imbalance_coordinate_binding",
      coordinateFailures.length === 0,
      coordinateFailures.map((cell) => cell.cellId),
      [],
      coordinateFailures[0] === undefined
        ? undefined
        : `${coordinateFailures[0].cellId} does not bind its prevalence or threshold to the declared coordinate and labels.`,
    ),
    invariant(
      "imbalance_metric_arithmetic",
      metricFailures.length === 0,
      metricFailures.map((cell) => cell.cellId),
      [],
      metricFailures[0] === undefined
        ? undefined
        : `${metricFailures[0].cellId} metrics do not resolve from its confusion counts.`,
    ),
    invariant(
      "imbalance_classification",
      classificationFailures.length === 0,
      classificationFailures.map((cell) => ({
        cellId: cell.cellId,
        classificationId: cell.classificationId,
        expected: classifyImbalance(cell.metrics.f1),
      })),
      [],
      classificationFailures[0] === undefined
        ? undefined
        : `${classificationFailures[0].cellId} uses a classification that disagrees with the frozen F1 thresholds.`,
    ),
    invariant(
      "imbalance_threshold_response",
      thresholdFailures.length === 0,
      thresholdFailures,
      [],
      thresholdFailures[0] === undefined
        ? undefined
        : `${thresholdFailures[0]} predictions do not change across the threshold axis.`,
    ),
    invariant(
      "imbalance_score_control",
      scoreFailures.length === 0,
      scoreFailures,
      [],
      scoreFailures[0] === undefined
        ? undefined
        : `${scoreFailures[0]} changes fixed scores or threshold-independent metrics during the threshold sweep.`,
    ),
    invariant(
      "imbalance_pipeline_control",
      pipelineFingerprints.size === 1,
      pipelineFingerprints.size,
      1,
      pipelineFingerprints.size === 1
        ? undefined
        : "The model pipeline fingerprint changes inside the controlled sweep.",
    ),
    invariant(
      "imbalance_observable_response",
      f1Values.size > 1,
      f1Values.size,
      "> 1 distinct F1 value",
      f1Values.size > 1
        ? undefined
        : "Every Boundary Map cell exposes the same F1 value.",
    ),
  ];
}

export function verifyBoundaryMap(
  input: unknown,
  expected: BoundaryMapExpectationV1,
): BoundaryMapVerificationReportV1 {
  const parsed = BoundaryMapResultV1Schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 10).map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return createReport(candidateResultHash(input), [
      invariant(
        "schema_valid",
        false,
        issues,
        "BoundaryMapResultV1",
        issues[0]?.message ?? "Boundary Map input did not match its schema.",
      ),
    ]);
  }

  const result = parsed.data;
  const observedGrid = {
    sweepId: result.sweepId,
    gridPresetId: result.gridPresetId,
    axes: result.axes,
    cellCount: result.cells.length,
  };
  const registeredGrid = {
    sweepId: expected.sweepId,
    gridPresetId: expected.gridPresetId,
    axes: expected.axes,
    cellCount: expected.cellCount,
  };
  const actualCoordinateKeys = result.cells.map(coordinateKey);
  const canonicalCoordinateKeys = expectedCoordinateKeys(expected.axes);
  const uniqueCellIds = new Set(result.cells.map((cell) => cell.cellId));
  const baseInvariants: BoundaryMapInvariant[] = [
    invariant(
      "schema_valid",
      true,
      "BoundaryMapResultV1",
      "BoundaryMapResultV1",
    ),
    invariant(
      "canonical_result_hash",
      resultHashMatches(result),
      result.resultHash,
      (() => {
        const { resultHash: _ignored, ...unsigned } = result;
        return hashBoundaryMapValue(unsigned);
      })(),
      resultHashMatches(result)
        ? undefined
        : "The Boundary Map hash does not bind its canonical content.",
    ),
    invariant(
      "expected_lineage",
      canonicalEquals(observedLineage(result), expectedLineage(expected)),
      observedLineage(result),
      expectedLineage(expected),
      canonicalEquals(observedLineage(result), expectedLineage(expected))
        ? undefined
        : "Boundary Map provenance does not match the authorized session, artifact, experiment, result, and verdict.",
    ),
    invariant(
      "registered_grid",
      canonicalEquals(observedGrid, registeredGrid),
      observedGrid,
      registeredGrid,
      canonicalEquals(observedGrid, registeredGrid)
        ? undefined
        : "Boundary Map axes, point order, or grid authority differ from the registered fixed sweep.",
    ),
    invariant(
      "registered_units",
      canonicalEquals(result.units, expected.units),
      result.units,
      expected.units,
      canonicalEquals(result.units, expected.units)
        ? undefined
        : "Boundary Map units differ from the registered Subject Pack units.",
    ),
    invariant(
      "registered_classifications",
      canonicalEquals(result.classifications, expected.classifications),
      result.classifications,
      expected.classifications,
      canonicalEquals(result.classifications, expected.classifications)
        ? undefined
        : "Boundary Map legend or classification definitions differ from the registered Subject Pack.",
    ),
    invariant(
      "canonical_cell_order",
      canonicalEquals(actualCoordinateKeys, canonicalCoordinateKeys),
      actualCoordinateKeys,
      canonicalCoordinateKeys,
      canonicalEquals(actualCoordinateKeys, canonicalCoordinateKeys)
        ? undefined
        : "Boundary Map cells are not in canonical first-axis then second-axis order.",
    ),
    invariant(
      "unique_cell_ids",
      uniqueCellIds.size === result.cells.length,
      uniqueCellIds.size,
      result.cells.length,
      uniqueCellIds.size === result.cells.length
        ? undefined
        : "Boundary Map contains duplicate cell identifiers.",
    ),
  ];

  const conceptInvariants =
    result.concept === "entity_leakage"
      ? leakageInvariants(result.cells as LeakageCell[])
      : imbalanceInvariants(result.cells as ImbalanceCell[]);
  return createReport(result.resultHash, [
    ...baseInvariants,
    ...conceptInvariants,
  ]);
}

function reportHashMatches(report: BoundaryMapVerificationReportV1): boolean {
  const { reportHash, ...unsigned } = report;
  return reportHash === hashBoundaryMapValue(unsigned);
}

function hmac(contentHash: string, signingKey: string): string {
  return createHmac("sha256", signingKey)
    .update(contentHash, "utf8")
    .digest("hex");
}

function signaturesMatch(actual: string, expected: string): boolean {
  const actualBytes = Buffer.from(actual, "hex");
  const expectedBytes = Buffer.from(expected, "hex");
  return (
    actualBytes.length === expectedBytes.length &&
    timingSafeEqual(actualBytes, expectedBytes)
  );
}

function assertResultAndReportAuthority(
  result: BoundaryMapResultV1,
  report: BoundaryMapVerificationReportV1,
  expected: BoundaryMapExpectationV1,
): void {
  if (!resultHashMatches(result)) {
    throw new Error("Boundary Map result hash is invalid");
  }
  if (!reportHashMatches(report)) {
    throw new Error("Boundary Map verification report hash is invalid");
  }
  if (report.status !== "VERIFIED") {
    throw new Error("Boundary Map authority requires a verified report");
  }
  if (report.resultHash !== result.resultHash) {
    throw new Error("Boundary Map report does not bind the supplied result");
  }
  const freshReport = verifyBoundaryMap(result, expected);
  if (
    freshReport.status !== "VERIFIED" ||
    !canonicalEquals(freshReport, report)
  ) {
    throw new Error(
      "Boundary Map report does not match a fresh verifier run under the expected grid authority",
    );
  }
}

export type IssueBoundaryMapAuthorityInput = {
  jobId: string;
  result: BoundaryMapResultV1;
  report: BoundaryMapVerificationReportV1;
  expected: BoundaryMapExpectationV1;
  issuedAt: string;
  signing?: {
    keyId: string;
    signingKey: string;
  };
};

export function issueBoundaryMapAuthority(
  input: IssueBoundaryMapAuthorityInput,
): BoundaryMapAuthorityRefV1 {
  const result = BoundaryMapResultV1Schema.parse(input.result);
  const report = BoundaryMapVerificationReportV1Schema.parse(input.report);
  assertResultAndReportAuthority(result, report, input.expected);
  if (input.signing !== undefined && input.signing.signingKey.length === 0) {
    throw new Error("Boundary Map signing key must not be empty");
  }

  const receiptContent = {
    schemaVersion: "1" as const,
    canonicalProfile: CANONICAL_JSON_PROFILE,
    sessionId: result.sessionId,
    resultHash: result.resultHash,
    verificationReportHash: report.reportHash,
    experimentIrHash: result.experimentIrHash,
    authoritativeResultHash: result.authoritativeResultHash,
    evidenceVerdictHash: result.evidenceVerdictHash,
    issuedAt: input.issuedAt,
  };
  const contentHash = hashBoundaryMapValue(receiptContent);
  const integrity =
    input.signing === undefined
      ? {
          mode: "integrity-hashed" as const,
          algorithm: "sha256" as const,
          contentHash,
        }
      : {
          mode: "hmac-signed" as const,
          algorithm: "hmac-sha256" as const,
          contentHash,
          signature: hmac(contentHash, input.signing.signingKey),
          keyId: input.signing.keyId,
        };
  const unsignedReceipt = { ...receiptContent, integrity };
  const receipt = BoundaryMapReceiptV1Schema.parse({
    ...unsignedReceipt,
    receiptHash: hashBoundaryMapValue(unsignedReceipt),
  });
  return BoundaryMapAuthorityRefV1Schema.parse({
    jobId: input.jobId,
    sweepId: result.sweepId,
    resultHash: result.resultHash,
    verificationReportHash: report.reportHash,
    receipt,
    cellCount: result.cells.length,
  });
}

export type ValidateBoundaryMapAuthorityOptions = {
  result: BoundaryMapResultV1;
  report: BoundaryMapVerificationReportV1;
  expected: BoundaryMapExpectationV1;
  signingKey?: string;
  expectedKeyId?: string;
};

export function validateBoundaryMapAuthority(
  input: unknown,
  options: ValidateBoundaryMapAuthorityOptions,
): BoundaryMapAuthorityRefV1 {
  const authority = BoundaryMapAuthorityRefV1Schema.parse(input);
  const result = BoundaryMapResultV1Schema.parse(options.result);
  const report = BoundaryMapVerificationReportV1Schema.parse(options.report);
  assertResultAndReportAuthority(result, report, options.expected);

  if (
    authority.resultHash !== result.resultHash ||
    authority.verificationReportHash !== report.reportHash ||
    authority.sweepId !== result.sweepId ||
    authority.cellCount !== result.cells.length
  ) {
    throw new Error(
      "Boundary Map authority reference does not match its result",
    );
  }
  const receipt = authority.receipt;
  if (
    receipt.sessionId !== result.sessionId ||
    receipt.resultHash !== result.resultHash ||
    receipt.verificationReportHash !== report.reportHash ||
    receipt.experimentIrHash !== result.experimentIrHash ||
    receipt.authoritativeResultHash !== result.authoritativeResultHash ||
    receipt.evidenceVerdictHash !== result.evidenceVerdictHash
  ) {
    throw new Error("Boundary Map receipt lineage does not match its result");
  }

  const { integrity, receiptHash, ...receiptContent } = receipt;
  const expectedContentHash = hashBoundaryMapValue(receiptContent);
  if (integrity.contentHash !== expectedContentHash) {
    throw new Error("Boundary Map receipt content hash is invalid");
  }
  if (receiptHash !== hashBoundaryMapValue({ ...receiptContent, integrity })) {
    throw new Error("Boundary Map receipt hash is invalid");
  }
  if (integrity.mode === "hmac-signed") {
    if (options.signingKey === undefined || options.signingKey.length === 0) {
      throw new Error(
        "A signing key is required to validate this HMAC-signed Boundary Map receipt",
      );
    }
    if (
      options.expectedKeyId !== undefined &&
      options.expectedKeyId !== integrity.keyId
    ) {
      throw new Error("Boundary Map receipt signing key identifier is invalid");
    }
    const expectedSignature = hmac(integrity.contentHash, options.signingKey);
    if (!signaturesMatch(integrity.signature, expectedSignature)) {
      throw new Error("Boundary Map receipt HMAC signature is invalid");
    }
  } else if (
    options.signingKey !== undefined &&
    options.signingKey.length > 0
  ) {
    throw new Error(
      "A signing key was supplied, but the Boundary Map receipt is not HMAC-signed",
    );
  }

  return authority;
}
