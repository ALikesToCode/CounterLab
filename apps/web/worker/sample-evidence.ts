import { ArtifactManifestSchema } from "@counterlab/contracts";
import { parseNotebook } from "@counterlab/notebook-parser";

import sampleNotebookText from "../../../fixtures/notebooks/customer_churn_leakage.ipynb?raw";
import sampleVerifiedResult from "../../../fixtures/public/leakage_verified_result.json";

const SAMPLE_CREATED_AT = "2026-07-14T08:45:00.000Z";

export const sampleManifest = ArtifactManifestSchema.parse(
  parseNotebook(
    new TextEncoder().encode(sampleNotebookText),
    "customer_churn_leakage.ipynb",
    {
      maxBytes: 10_485_760,
      createdAt: SAMPLE_CREATED_AT,
    },
  ),
);

export const sampleResult = sampleVerifiedResult;
