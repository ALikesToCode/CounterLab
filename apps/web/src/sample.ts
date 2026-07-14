import rawResult from "../../../fixtures/public/leakage_verified_result.json";
import {
  VerifiedResultSetSchema,
  type VerifiedResultSet,
} from "@counterlab/contracts";

export type VerifiedRun = VerifiedResultSet["runs"][number];

export const sampleResult = VerifiedResultSetSchema.parse(rawResult);

export function getRun(id: string): VerifiedRun {
  const run = sampleResult.runs.find((candidate) => candidate.id === id);
  if (run === undefined) {
    throw new Error(`Verified fixture is missing run ${id}`);
  }
  return run;
}

export const sampleArtifact = {
  title: "Customer churn evaluation",
  fileName: "customer_churn_leakage.ipynb",
  fileSha256:
    "92ba63894d3c2ffd64ba76324bb7bb2b3afeb0310883a33ed140faf058d03024",
  rows: 2880,
  customers: 480,
  evidence: [
    {
      ref: "Cell 3 · output 0",
      label: "Random row-split accuracy",
      value: getRun("random_row_split").metrics.accuracy,
    },
    {
      ref: "Cell 3 · output 0",
      label: "Train/test customer overlap",
      value: getRun("random_row_split").entityOverlap.rate,
    },
  ],
} as const;

export const verifiedReplay = {
  id: "leakage-01",
  recordedAt: "2026-07-14T11:50:37.947Z",
  model: "gpt-5.6-sol · authenticated App Server replay",
  fixture: "customer-churn-public-v1",
  verifier: "leakage-verifier-v1",
  commit: "4f2f647228304d63ac8b9cba8cdca1dc7a07e192",
} as const;
