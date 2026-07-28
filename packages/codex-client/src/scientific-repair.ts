import type { ExperimentIRPolicyFindingCode } from "@counterlab/experiment-ir";
import { z } from "zod";

const MAX_FINDING_PATHS = 24;
const MAX_FINDING_PATH_LENGTH = 180;
const SAFE_PATH_CHARACTERS = /[^A-Za-z0-9_$.[\]-]/gu;

export type ScientificArtifactFindingCode =
  | ExperimentIRPolicyFindingCode
  | "OUTPUT_SCHEMA_INVALID"
  | "IMMUTABLE_LINEAGE_MISMATCH"
  | "CANDIDATE_REFERENCE_INVALID"
  | "LAB_SCENE_INVALID";

export class ScientificArtifactValidationError extends Error {
  readonly findingCode: ScientificArtifactFindingCode;
  readonly findingPaths: readonly string[];

  constructor(
    findingCode: ScientificArtifactFindingCode,
    message: string,
    options?: ErrorOptions & { findingPaths?: readonly string[] },
  ) {
    super(message, { cause: options?.cause });
    this.name = "ScientificArtifactValidationError";
    this.findingCode = findingCode;
    this.findingPaths = normalizeScientificFindingPaths(
      options?.findingPaths ?? [],
    );
  }
}

export function normalizeScientificFindingPaths(
  paths: readonly string[],
): string[] {
  return [
    ...new Set(
      paths
        .map((path) =>
          path
            .replace(SAFE_PATH_CHARACTERS, "?")
            .slice(0, MAX_FINDING_PATH_LENGTH),
        )
        .filter((path) => path.length > 0),
    ),
  ]
    .sort()
    .slice(0, MAX_FINDING_PATHS);
}

export function zodScientificFindingPaths(
  error: z.ZodError,
  root: string,
): string[] {
  return normalizeScientificFindingPaths(
    error.issues.map((issue) => {
      const suffix = issue.path
        .slice(0, 12)
        .map((segment) =>
          typeof segment === "number"
            ? `[${Math.max(0, Math.min(segment, 9_999))}]`
            : /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u.test(String(segment))
              ? `.${String(segment)}`
              : ".?",
        )
        .join("");
      return `${root}${suffix}`;
    }),
  );
}

export function mismatchedScientificFindingPaths(
  checks: ReadonlyArray<{
    path: string;
    actual: unknown;
    expected: unknown;
  }>,
): string[] {
  return normalizeScientificFindingPaths(
    checks
      .filter(
        ({ actual, expected }) =>
          JSON.stringify(actual) !== JSON.stringify(expected),
      )
      .map(({ path }) => path),
  );
}

export function buildScientificPolicyRepairPrompt(
  originalPrompt: string,
  attempt: 1 | 2,
  findingCodes: readonly ScientificArtifactFindingCode[],
  findingPaths: readonly string[],
): string {
  const sanitizedPaths = normalizeScientificFindingPaths(findingPaths);
  return `${originalPrompt}

The previous candidate failed CounterLab's fixed scientific artifact validation before any file was materialized. This is bounded repair attempt ${attempt} of at most 2.
Return a fresh complete structured candidate. Correct the rejected fields identified below while keeping every other valid field stable. The complete candidate must still pass every fixed schema and policy. Never repeat an invalid value merely to explain it.

Copy immutable lineage from the original input using these fixed mappings:
- discriminationContract.sessionId, experimentIr.sessionId, labScene.sessionId <- sessionId
- discriminationContract.artifactManifestHash, experimentIr.artifactManifestHash <- artifactManifestHash
- discriminationContract.beliefSpecId, experimentIr.beliefSpecId <- approvedBeliefSpec.id
- discriminationContract.beliefSpecHash, experimentIr.beliefSpecHash <- beliefSpecHash
- discriminationContract.concept, experimentIr.concept, labScene.concept <- approvedBeliefSpec.concept
- discriminationContract.conceptPackVersion, experimentIr.conceptPackVersion <- conceptPack.version
- discriminationContract.hypotheses[*].statement, experimentIr.hypotheses[*].statement <- approvedBeliefSpec.hypotheses[*].statement
- experimentIr.provenance <- the exact provenance object supplied in the original input
- experimentIr.selection.status <- UNSELECTED

Use only allowed candidate and operation IDs. Do not weaken, omit, or reinterpret any fixed schema or policy. Use short plain-language comparisons only; do not use equations, assignment syntax, executable source, commands, SQL, URLs, or raw paths.

Fixed local validation classes:
${JSON.stringify(findingCodes)}

Sanitized failing fields (paths only; values are intentionally withheld):
${sanitizedPaths.length > 0 ? JSON.stringify(sanitizedPaths) : "(No narrower safe field path was available.)"}
`;
}
