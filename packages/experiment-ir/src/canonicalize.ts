import { canonicalJsonV1 } from "@counterlab/contracts";

import { assertExperimentIRPolicy } from "./policy.js";
import { ExperimentIRV5Schema, type ExperimentIRV5 } from "./schema.js";

export function canonicalizeExperimentIR(value: unknown): string {
  assertExperimentIRPolicy(value);
  const parsed = ExperimentIRV5Schema.parse(value);
  return canonicalJsonV1(parsed);
}

export function parseExperimentIR(value: unknown): ExperimentIRV5 {
  assertExperimentIRPolicy(value);
  return ExperimentIRV5Schema.parse(value);
}
