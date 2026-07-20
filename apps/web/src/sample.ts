import rawResult from "../../../fixtures/public/leakage_verified_result.json";
import {
  VerifiedResultSetSchema,
  type LeakageVerifiedResultSet,
} from "@counterlab/contracts";

export type VerifiedRun = LeakageVerifiedResultSet["runs"][number];

export type BundledSampleEvidence =
  | Readonly<{
      status: "available";
      result: LeakageVerifiedResultSet;
      runs: Readonly<{
        randomRows: VerifiedRun;
        wholeCustomers: VerifiedRun;
        identityAblation: VerifiedRun;
      }>;
    }>
  | Readonly<{
      status: "unavailable";
      reason: "INVALID_SCHEMA" | "WRONG_CONCEPT" | "MISSING_REQUIRED_RUN";
    }>;

export function parseBundledSampleEvidence(
  value: unknown,
): BundledSampleEvidence {
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "concept" in value &&
    value.concept !== "entity_leakage"
  ) {
    return { status: "unavailable", reason: "WRONG_CONCEPT" };
  }
  if (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "concept" in value &&
    value.concept === "entity_leakage" &&
    "runs" in value &&
    Array.isArray(value.runs)
  ) {
    const runIds = new Set(
      value.runs.flatMap((run) =>
        run !== null && typeof run === "object" && "id" in run ? [run.id] : [],
      ),
    );
    if (
      !runIds.has("random_row_split") ||
      !runIds.has("customer_group_split") ||
      !runIds.has("identity_ablation")
    ) {
      return { status: "unavailable", reason: "MISSING_REQUIRED_RUN" };
    }
  }
  const parsed = VerifiedResultSetSchema.safeParse(value);
  if (!parsed.success) {
    return { status: "unavailable", reason: "INVALID_SCHEMA" };
  }
  if (parsed.data.concept !== "entity_leakage")
    return { status: "unavailable", reason: "WRONG_CONCEPT" };
  const result = parsed.data as LeakageVerifiedResultSet;
  const randomRows = result.runs.find(
    (candidate) => candidate.id === "random_row_split",
  );
  const wholeCustomers = result.runs.find(
    (candidate) => candidate.id === "customer_group_split",
  );
  const identityAblation = result.runs.find(
    (candidate) => candidate.id === "identity_ablation",
  );
  if (
    randomRows === undefined ||
    wholeCustomers === undefined ||
    identityAblation === undefined
  ) {
    return { status: "unavailable", reason: "MISSING_REQUIRED_RUN" };
  }
  return {
    status: "available",
    result,
    runs: { randomRows, wholeCustomers, identityAblation },
  };
}

export const bundledSampleEvidence = parseBundledSampleEvidence(rawResult);

export function requireBundledSampleResult(): LeakageVerifiedResultSet {
  if (bundledSampleEvidence.status !== "available") {
    throw new Error("The bundled verified sample is unavailable");
  }
  return bundledSampleEvidence.result;
}

const randomRows =
  bundledSampleEvidence.status === "available"
    ? bundledSampleEvidence.runs.randomRows
    : null;

export const sampleArtifact = {
  title: "Customer churn evaluation",
  fileName: "customer_churn_leakage.ipynb",
  fileSha256:
    "d0e9f3238753f1ca55534446d83e36041590f31c607a011def3f1d0db3a5bbc9",
  rows: 2880,
  customers: 480,
  evidence:
    randomRows === null
      ? []
      : [
          {
            ref: "Cell 3 · output 0",
            label: "Random row-split accuracy",
            value: randomRows.metrics.accuracy,
          },
          {
            ref: "Cell 3 · output 0",
            label: "Train/test customer overlap",
            value: randomRows.entityOverlap.rate,
          },
        ],
} as const;
