import { createHash } from "node:crypto";
import path from "node:path";

import {
  ArtifactManifestSchema,
  type ArtifactManifest,
  type SupportReason,
} from "@counterlab/contracts";

export type NotebookParseErrorCode =
  | "INVALID_OPTIONS"
  | "MAXIMUM_SIZE_EXCEEDED"
  | "INVALID_JSON"
  | "MAXIMUM_DEPTH_EXCEEDED"
  | "INVALID_NOTEBOOK";

export class NotebookParseError extends Error {
  readonly code: NotebookParseErrorCode;

  constructor(code: NotebookParseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NotebookParseError";
    this.code = code;
  }
}

export type ParseNotebookOptions = {
  maxBytes: number;
  maxDepth?: number;
  createdAt?: string;
};

type JsonRecord = Record<string, unknown>;

const ACTIVE_MIME_TYPES = new Set([
  "text/html",
  "application/javascript",
  "application/x-javascript",
  "image/svg+xml",
  "application/vnd.jupyter.widget-view+json",
]);
const SAFE_MIME_TYPES = ["text/plain", "application/json"] as const;
const NETWORK_PACKAGES = new Set(["aiohttp", "httpx", "requests", "socket", "urllib3"]);
const SUPPORTED_PACKAGES = new Set([
  "collections",
  "counterlab_sdk",
  "dataclasses",
  "functools",
  "itertools",
  "json",
  "math",
  "matplotlib",
  "numpy",
  "pandas",
  "pathlib",
  "scipy",
  "seaborn",
  "sklearn",
  "statistics",
  "typing",
]);
const KNOWN_SYMBOLS = [
  "train_test_split",
  "GroupShuffleSplit",
  "TimeSeriesSplit",
  "ColumnTransformer",
  "OneHotEncoder",
  "Pipeline",
  "LogisticRegression",
  "RandomForestClassifier",
  "accuracy_score",
  "roc_auc_score",
  "f1_score",
] as const;
const DEFAULT_CREATED_AT = "1970-01-01T00:00:00.000Z";
const DEFAULT_MAX_DEPTH = 64;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function joinedText(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((part) => typeof part === "string")) {
    return value.join("");
  }
  return undefined;
}

function assertBoundedDepth(value: unknown, maxDepth: number): void {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 1 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    if (current.depth > maxDepth) {
      throw new NotebookParseError(
        "MAXIMUM_DEPTH_EXCEEDED",
        `Notebook exceeds the maximum JSON depth of ${maxDepth}`,
      );
    }
    if (Array.isArray(current.value)) {
      for (const child of current.value) pending.push({ value: child, depth: current.depth + 1 });
    } else if (isRecord(current.value)) {
      for (const child of Object.values(current.value)) {
        pending.push({ value: child, depth: current.depth + 1 });
      }
    }
  }
}

function safeFileName(fileName: string): string {
  const normalized = fileName.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized).replaceAll("\0", "").trim();
  return basename.length > 0 ? basename : "notebook.ipynb";
}

function sourceExcerpt(source: string, active: boolean): string {
  if (active) return "[active content omitted]";
  return source.replace(/\s+/g, " ").trim().slice(0, 320);
}

function packageHints(source: string): string[] {
  const hints = new Set<string>();
  for (const line of source.split(/\r?\n/)) {
    const fromMatch = /^\s*from\s+([A-Za-z_][\w.]*)\s+import\b/.exec(line);
    if (fromMatch?.[1] !== undefined) hints.add(fromMatch[1].split(".")[0] ?? fromMatch[1]);

    const importMatch = /^\s*import\s+(.+)$/.exec(line);
    if (importMatch?.[1] === undefined) continue;
    for (const imported of importMatch[1].split(",")) {
      const moduleName = imported.trim().split(/\s+as\s+/i)[0]?.split(".")[0];
      if (moduleName !== undefined && /^[A-Za-z_]\w*$/.test(moduleName)) hints.add(moduleName);
    }
  }
  return [...hints].sort();
}

function symbols(source: string): string[] {
  return KNOWN_SYMBOLS.filter((symbol) => new RegExp(`\\b${symbol}\\b`).test(source));
}

function metricCandidates(value: unknown, outputIndex: number): Array<{
  name: string;
  value: number;
  outputIndex: number;
}> {
  const candidates: Array<{ name: string; value: number; outputIndex: number }> = [];
  const seen = new Set<string>();
  const add = (name: string, rawValue: number, percent = false): void => {
    const normalizedName = name.toLowerCase().replace(/[\s-]+/g, "_").replace("rocauc", "roc_auc");
    const key = `${normalizedName}:${outputIndex}`;
    if (!Number.isFinite(rawValue) || seen.has(key)) return;
    seen.add(key);
    candidates.push({
      name: normalizedName,
      value: percent ? rawValue / 100 : rawValue,
      outputIndex,
    });
  };

  if (typeof value === "string") {
    const pattern =
      /\b(roc[\s_-]*auc|accuracy|f1(?:[\s_-]*score)?|precision|recall)\b\s*(?:score\s*)?[:=]\s*(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)\s*(%)?/gi;
    for (const match of value.matchAll(pattern)) {
      const name = match[1];
      const numeric = match[2];
      if (name !== undefined && numeric !== undefined) {
        add(name, Number(numeric), match[3] === "%");
      }
    }
  } else if (isRecord(value)) {
    for (const [name, rawValue] of Object.entries(value)) {
      if (
        typeof rawValue === "number" &&
        /^(accuracy|roc_auc|f1(?:_score)?|precision|recall)$/i.test(name)
      ) {
        add(name, rawValue);
      }
    }
  }

  return candidates;
}

function normalizeCreatedAt(value: unknown): string | undefined {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return undefined;
  return new Date(value).toISOString();
}

function readSchemaSummary(metadata: JsonRecord): ArtifactManifest["schemaSummary"] | undefined {
  const counterlab = metadata.counterlab;
  if (!isRecord(counterlab) || !isRecord(counterlab.schemaSummary)) return undefined;
  const summary = counterlab.schemaSummary;
  if (
    !Array.isArray(summary.fields) ||
    !Array.isArray(summary.entityCandidates) ||
    !Array.isArray(summary.targetCandidates)
  ) {
    return undefined;
  }

  const fields = summary.fields.flatMap((field) => {
    if (
      !isRecord(field) ||
      typeof field.name !== "string" ||
      typeof field.inferredType !== "string" ||
      typeof field.privacyClass !== "string"
    ) {
      return [];
    }
    return [
      {
        name: field.name,
        inferredType: field.inferredType,
        privacyClass: field.privacyClass,
      },
    ];
  });
  if (fields.length !== summary.fields.length) return undefined;
  if (!summary.entityCandidates.every((value) => typeof value === "string")) return undefined;
  if (!summary.targetCandidates.every((value) => typeof value === "string")) return undefined;
  if (
    summary.rowCount !== undefined &&
    (!Number.isInteger(summary.rowCount) || (summary.rowCount as number) < 0)
  ) {
    return undefined;
  }

  return {
    fields,
    ...(typeof summary.rowCount === "number" ? { rowCount: summary.rowCount } : {}),
    entityCandidates: summary.entityCandidates as string[],
    targetCandidates: summary.targetCandidates as string[],
  };
}

export function parseNotebook(
  bytes: Uint8Array,
  fileName: string,
  options: ParseNotebookOptions,
): ArtifactManifest {
  if (!Number.isInteger(options.maxBytes) || options.maxBytes <= 0) {
    throw new NotebookParseError("INVALID_OPTIONS", "maxBytes must be a positive integer");
  }
  if (bytes.byteLength > options.maxBytes) {
    throw new NotebookParseError(
      "MAXIMUM_SIZE_EXCEEDED",
      `Notebook exceeds the maximum size of ${options.maxBytes} bytes`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch (error) {
    throw new NotebookParseError("INVALID_JSON", "Notebook is not valid JSON", { cause: error });
  }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxDepth) || maxDepth <= 0) {
    throw new NotebookParseError("INVALID_OPTIONS", "maxDepth must be a positive integer");
  }
  assertBoundedDepth(parsed, maxDepth);

  if (!isRecord(parsed) || !Array.isArray(parsed.cells) || typeof parsed.nbformat !== "number") {
    throw new NotebookParseError(
      "INVALID_NOTEBOOK",
      "Notebook must contain a numeric nbformat and a cells array",
    );
  }

  const partialReasons: SupportReason[] = [];
  const unsupportedReasons: SupportReason[] = [];
  const addReason = (
    severity: "partial" | "unsupported",
    reason: SupportReason,
  ): void => {
    const target = severity === "unsupported" ? unsupportedReasons : partialReasons;
    if (!target.some((item) => item.code === reason.code && item.cellIndex === reason.cellIndex)) {
      target.push(reason);
    }
  };

  if (parsed.nbformat !== 4) {
    addReason("unsupported", {
      code: "UNSUPPORTED_NBFORMAT",
      message: `Only nbformat 4 is supported; received nbformat ${parsed.nbformat}`,
    });
  }

  const metadata = isRecord(parsed.metadata) ? parsed.metadata : {};
  if ("widgets" in metadata) {
    addReason("partial", {
      code: "ACTIVE_METADATA_REMOVED",
      message: "Jupyter widget metadata was omitted",
    });
  }

  const allPackageHints = new Set<string>();
  const cells: ArtifactManifest["cells"] = [];

  for (const [index, rawCell] of parsed.cells.entries()) {
    if (!isRecord(rawCell)) {
      addReason("unsupported", {
        code: "INVALID_CELL",
        message: "Cell is not a JSON object",
        cellIndex: index,
      });
      continue;
    }

    const source = joinedText(rawCell.source) ?? "";
    const rawType = rawCell.cell_type;
    const type = rawType === "code" || rawType === "markdown" || rawType === "raw" ? rawType : "raw";
    if (type !== rawType) {
      addReason("unsupported", {
        code: "UNSUPPORTED_CELL_TYPE",
        message: `Unsupported cell type: ${String(rawType)}`,
        cellIndex: index,
      });
    } else if (type === "raw") {
      addReason("partial", {
        code: "RAW_CELL_OMITTED",
        message: "Raw cell content is not accepted as Belief Test evidence",
        cellIndex: index,
      });
    }

    const activeSource =
      type !== "code" && /<(?:script|iframe|object|embed)\b|javascript\s*:/i.test(source);
    if (activeSource) {
      addReason("partial", {
        code: "ACTIVE_CELL_CONTENT_REMOVED",
        message: "Active cell content was omitted from the excerpt",
        cellIndex: index,
      });
    }

    const cellPackages = type === "code" ? packageHints(source) : [];
    for (const packageName of cellPackages) {
      allPackageHints.add(packageName);
      if (NETWORK_PACKAGES.has(packageName)) {
        addReason("unsupported", {
          code: "EXTERNAL_NETWORK_DEPENDENCY",
          message: `External network package is outside the support contract: ${packageName}`,
          cellIndex: index,
        });
      } else if (!SUPPORTED_PACKAGES.has(packageName)) {
        addReason("unsupported", {
          code: "UNKNOWN_PACKAGE_REQUIREMENT",
          message: `Package is outside the supported allowlist: ${packageName}`,
          cellIndex: index,
        });
      }
    }
    if (type === "code" && /^\s*(?:%{1,2}|!)/m.test(source)) {
      addReason("unsupported", {
        code: "UNSUPPORTED_MAGIC",
        message: "Notebook magics and shell escapes are outside the support contract",
        cellIndex: index,
      });
    }

    const outputHashes: string[] = [];
    const metrics: ArtifactManifest["cells"][number]["metricCandidates"] = [];
    if (type === "code" && Array.isArray(rawCell.outputs)) {
      for (const [outputIndex, output] of rawCell.outputs.entries()) {
        if (!isRecord(output)) {
          addReason("partial", {
            code: "UNSAFE_OUTPUT_REMOVED",
            message: "Malformed notebook output was omitted",
            cellIndex: index,
          });
          continue;
        }

        if (output.output_type === "stream") {
          const text = joinedText(output.text);
          if (text === undefined) {
            addReason("partial", {
              code: "UNSAFE_OUTPUT_REMOVED",
              message: "Malformed stream output was omitted",
              cellIndex: index,
            });
            continue;
          }
          outputHashes.push(
            sha256(canonicalJson({ outputType: "stream", mimeType: "text/plain", value: text })),
          );
          metrics.push(...metricCandidates(text, outputIndex));
          continue;
        }

        if (
          (output.output_type === "display_data" || output.output_type === "execute_result") &&
          isRecord(output.data)
        ) {
          for (const mimeType of Object.keys(output.data)) {
            if (ACTIVE_MIME_TYPES.has(mimeType)) {
              addReason("partial", {
                code: "ACTIVE_OUTPUT_REMOVED",
                message: "Active HTML, JavaScript, SVG, or widget output was omitted",
                cellIndex: index,
              });
            } else if (!SAFE_MIME_TYPES.includes(mimeType as (typeof SAFE_MIME_TYPES)[number])) {
              addReason("partial", {
                code: "BINARY_OUTPUT_REMOVED",
                message: `Non-text output was omitted: ${mimeType}`,
                cellIndex: index,
              });
            }
          }

          for (const mimeType of SAFE_MIME_TYPES) {
            if (!(mimeType in output.data)) continue;
            const rawValue = output.data[mimeType];
            const value = mimeType === "text/plain" ? joinedText(rawValue) : rawValue;
            if (value === undefined) {
              addReason("partial", {
                code: "UNSAFE_OUTPUT_REMOVED",
                message: `Malformed ${mimeType} output was omitted`,
                cellIndex: index,
              });
              continue;
            }
            outputHashes.push(
              sha256(canonicalJson({ outputType: output.output_type, mimeType, value })),
            );
            metrics.push(...metricCandidates(value, outputIndex));
          }
          continue;
        }

        addReason("partial", {
          code: "UNSAFE_OUTPUT_REMOVED",
          message: `Unsupported output type was omitted: ${String(output.output_type)}`,
          cellIndex: index,
        });
      }
    }

    const executionCount =
      type === "code" &&
      (rawCell.execution_count === null ||
        (typeof rawCell.execution_count === "number" &&
          Number.isInteger(rawCell.execution_count) &&
          rawCell.execution_count >= 0))
        ? rawCell.execution_count
        : undefined;

    cells.push({
      index,
      type,
      sourceSha256: sha256(source),
      sourceExcerpt: sourceExcerpt(source, activeSource),
      ...(executionCount !== undefined ? { executionCount } : {}),
      outputHashes,
      symbols: symbols(source),
      metricCandidates: metrics,
    });
  }

  const schemaSummary = readSchemaSummary(metadata);
  if (schemaSummary === undefined) {
    addReason("partial", {
      code: "MISSING_SCHEMA_EVIDENCE",
      message: "No valid sanitized schema summary was provided",
    });
  }

  const counterlabMetadata = isRecord(metadata.counterlab) ? metadata.counterlab : {};
  const createdAt =
    normalizeCreatedAt(counterlabMetadata.createdAt) ??
    normalizeCreatedAt(options.createdAt) ??
    DEFAULT_CREATED_AT;
  const fileSha256 = sha256(bytes);
  const reasons = [...unsupportedReasons, ...partialReasons];
  const status =
    unsupportedReasons.length > 0
      ? "UNSUPPORTED"
      : partialReasons.length > 0
        ? "PARTIAL"
        : "SUPPORTED";

  return ArtifactManifestSchema.parse({
    artifactId: `artifact_${fileSha256.slice(0, 24)}`,
    fileName: safeFileName(fileName),
    fileSha256,
    nbformat: parsed.nbformat,
    support: { status, reasons },
    cells,
    schemaSummary: schemaSummary ?? {
      fields: [],
      entityCandidates: [],
      targetCandidates: [],
    },
    packageHints: [...allPackageHints].sort(),
    createdAt,
  });
}
