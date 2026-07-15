import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { routeArtifactConcept } from "../../../packages/concept-registry/src/index.js";
import { parseNotebook } from "../../../packages/notebook-parser/src/index.js";

import {
  HeldOutBenchmarkResultSchema,
  ReviewLabelFileSchema,
  type HeldOutBenchmarkResult,
  type ReviewLabel,
} from "./schemas.js";
import { runHeldOutCompletion } from "./completion.js";

type BenchmarkOptions = {
  root: string;
  executedAt?: string;
};

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function union(values: string[][]): string[] {
  return [...new Set(values.flat())].sort();
}

function includesAll(observed: string[], required: string[]): boolean {
  const available = new Set(observed);
  return required.every((item) => available.has(item));
}

async function evaluateCase(
  root: string,
  label: ReviewLabel,
  bytes: Uint8Array,
) {
  const first = parseNotebook(bytes, label.fileName, { maxBytes: 10_485_760 });
  const second = parseNotebook(bytes, label.fileName, { maxBytes: 10_485_760 });
  const routing = routeArtifactConcept(first);
  const metricNames = union(
    first.cells.map((cell) =>
      cell.metricCandidates.map((metric) => metric.name),
    ),
  );
  const symbols = union(first.cells.map((cell) => cell.symbols));
  const supportReasonCodes = first.support.reasons
    .map((reason) => reason.code)
    .sort();
  const observed = {
    supportStatus: first.support.status,
    concept: routing.kind === "selected" ? routing.concept : null,
    metricNames,
    symbols,
    packageHints: [...first.packageHints].sort(),
    supportReasonCodes,
    fileSha256: first.fileSha256,
  };
  const checks = {
    notebookHashMatches: sha256(bytes) === label.notebookSha256,
    supportStatusMatches:
      observed.supportStatus === label.expected.supportStatus,
    conceptMatches: observed.concept === label.expected.concept,
    metricsPresent: includesAll(
      observed.metricNames,
      label.expected.requiredMetricNames,
    ),
    symbolsPresent: includesAll(
      observed.symbols,
      label.expected.requiredSymbols,
    ),
    packagesPresent: includesAll(
      observed.packageHints,
      label.expected.requiredPackageHints,
    ),
    supportReasonsMatch: includesAll(
      observed.supportReasonCodes,
      label.expected.requiredSupportReasonCodes,
    ),
    stableEvidenceReferences:
      first.fileSha256 === second.fileSha256 &&
      canonicalJson(first.cells) === canonicalJson(second.cells),
  };
  const completion =
    routing.kind === "selected"
      ? await runHeldOutCompletion({
          root,
          caseId: label.caseId,
          bytes,
          manifest: first,
          concept: routing.concept,
          evidence: routing.evidence,
        })
      : {
          attempted: false as const,
          planSource: "deterministic_contract_probe" as const,
          planVerified: false,
          resultVerified: false,
          transferPassed: false,
          patchVerified: false,
          unchangedCellCount: 0,
          resultHash: null,
          patchHash: null,
          durationMs: 0,
          failureCode: null,
        };
  return {
    caseId: label.caseId,
    fileName: label.fileName,
    family: label.family,
    variation: label.variation,
    humanReviewStatus: label.humanReview.status,
    executedParser: true as const,
    expected: {
      supportStatus: label.expected.supportStatus,
      concept: label.expected.concept,
    },
    observed,
    checks,
    completion,
    passed: Object.values(checks).every(Boolean),
  };
}

export async function runHeldOutBenchmark(
  options: BenchmarkOptions,
): Promise<HeldOutBenchmarkResult> {
  const heldOutRoot = path.join(options.root, "evals", "held-out");
  const labelsBytes = await readFile(
    path.join(heldOutRoot, "review-labels.json"),
  );
  const labels = ReviewLabelFileSchema.parse(
    JSON.parse(labelsBytes.toString("utf8")),
  );
  const cases: Array<Awaited<ReturnType<typeof evaluateCase>>> = [];
  for (const label of labels.labels) {
    const bytes = await readFile(
      path.join(heldOutRoot, "notebooks", label.fileName),
    );
    cases.push(await evaluateCase(options.root, label, bytes));
  }

  const familyNames = [
    "entity_leakage",
    "class_imbalance",
    "unsupported",
  ] as const;
  const byFamily = Object.fromEntries(
    familyNames.map((family) => {
      const selected = cases.filter((item) => item.family === family);
      return [
        family,
        {
          passed: selected.filter((item) => item.passed).length,
          total: selected.length,
        },
      ];
    }),
  ) as HeldOutBenchmarkResult["summary"]["byFamily"];
  const passed = cases.filter((item) => item.passed).length;
  const supported = cases.filter((item) => item.completion.attempted);
  const completed = supported.filter(
    (item) =>
      item.completion.planVerified &&
      item.completion.resultVerified &&
      item.completion.transferPassed &&
      item.completion.patchVerified,
  );
  return HeldOutBenchmarkResultSchema.parse({
    schemaVersion: "2",
    benchmarkId: "counterlab-held-out-v2",
    executedAt: options.executedAt ?? new Date().toISOString(),
    parser: "@counterlab/notebook-parser",
    executionMode: "safe_parse_plus_fixed_contract_completion",
    labelsSha256: sha256(labelsBytes),
    summary: {
      total: cases.length,
      passed,
      failed: cases.length - passed,
      byFamily,
      supportedCompletion: {
        passed: completed.length,
        total: supported.length,
      },
    },
    cases,
    limitations: [
      "The intake benchmark executes the safe notebook parser; it never executes uploaded notebook cells.",
      "Supported cases additionally exercise a deterministic contract probe through the independent Plan verifier, fixed synthetic kernel, fixed transfer evaluator, and fixed copy-patch verifier.",
      "The completion probe does not call GPT or Codex and is labelled deterministic_contract_probe; it measures fixed authority coverage, not live model-generation success.",
      "Concept-family inference is a deterministic evidence heuristic, not an LLM evaluation.",
      "Human review labels remain PENDING until independent reviewers complete and adjudicate the matrix.",
      "Held-out parser accuracy does not establish learner outcomes or arbitrary-notebook support.",
    ],
  });
}

export function renderHeldOutMatrix(result: HeldOutBenchmarkResult): string {
  const rows = result.cases.map(
    (item) =>
      `| ${item.caseId} | ${item.family} | ${item.variation} | ${item.expected.supportStatus} | ${item.observed.supportStatus} | ${item.expected.concept ?? "refuse"} | ${item.observed.concept ?? "refuse"} | ${item.completion.attempted ? (item.completion.patchVerified ? "PASS" : (item.completion.failureCode ?? "FAIL")) : "N/A"} | ${item.humanReviewStatus} | ${item.passed ? "PASS" : "FAIL"} |`,
  );
  return `# Held-out review matrix

Generated from the real safe-parser and fixed-authority execution recorded in \`docs/HELD_OUT_RESULTS.json\`. Uploaded notebook cells were not executed. The completion Plan source is explicitly \`deterministic_contract_probe\`, not GPT or Codex. Human review remains pending and no learner outcome is implied.

| Case | Family | Variation | Expected support | Observed support | Expected concept | Observed concept | Fixed completion | Human review | Intake checks |
|---|---|---|---|---|---|---|---|---|---|
${rows.join("\n")}

## Summary

- Automated checks: ${result.summary.passed}/${result.summary.total} passed.
- Leakage variants: ${result.summary.byFamily.entity_leakage.passed}/${result.summary.byFamily.entity_leakage.total} passed.
- Imbalance variants: ${result.summary.byFamily.class_imbalance.passed}/${result.summary.byFamily.class_imbalance.total} passed.
- Unsupported/refusal cases: ${result.summary.byFamily.unsupported.passed}/${result.summary.byFamily.unsupported.total} passed.
- Fixed full-loop completion: ${result.summary.supportedCompletion.passed}/${result.summary.supportedCompletion.total} supported cases passed without source edits.
- Human review status: pending for all cases until reviewer labels and adjudication are recorded.
`;
}
