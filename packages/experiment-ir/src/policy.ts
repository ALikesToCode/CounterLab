import { ExperimentIRV5Schema } from "./schema.js";

export type ExperimentIRPolicyFindingCode =
  | "SCHEMA_INVALID"
  | "EXECUTABLE_SOURCE"
  | "DYNAMIC_EXPRESSION"
  | "SHELL_COMMAND"
  | "SQL_SOURCE"
  | "NETWORK_REFERENCE"
  | "RAW_PATH";

export interface ExperimentIRPolicyFinding {
  code: ExperimentIRPolicyFindingCode;
  path: string;
  message: string;
}

export class ExperimentIRPolicyError extends Error {
  readonly findings: ExperimentIRPolicyFinding[];

  constructor(findings: ExperimentIRPolicyFinding[]) {
    super(
      `Experiment IR policy rejected ${findings.length} finding${findings.length === 1 ? "" : "s"}`,
    );
    this.name = "ExperimentIRPolicyError";
    this.findings = findings;
  }
}

const FORBIDDEN_TEXT: ReadonlyArray<{
  code: Exclude<ExperimentIRPolicyFindingCode, "SCHEMA_INVALID">;
  pattern: RegExp;
  message: string;
}> = [
  {
    code: "DYNAMIC_EXPRESSION",
    pattern:
      /(?:=>|\blambda\b|\b(?:sin|cos|tan|sqrt|pow)\s*\(|\b[a-z_][a-z0-9_]*\s*=\s*[^=])/iu,
    message: "dynamic expressions or formulas are not allowed",
  },
  {
    code: "EXECUTABLE_SOURCE",
    pattern:
      /(?:\b(?:eval|exec|compile)\s*\(|\bimport\s+(?:os|sys|subprocess|socket|requests|httpx)\b|\bos\.system\s*\()/iu,
    message: "executable source is not allowed in Experiment IR",
  },
  {
    code: "SHELL_COMMAND",
    pattern: /(?:^|[\s;|&])(?:curl|wget|bash|sh|powershell|pip|npm|pnpm)\s+/iu,
    message: "shell or package-manager commands are not allowed",
  },
  {
    code: "SQL_SOURCE",
    pattern:
      /\b(?:select|insert|update|delete|drop|alter)\b[\s\S]{0,96}\b(?:from|into|table|set)\b/iu,
    message: "SQL source is not allowed in Experiment IR",
  },
  {
    code: "NETWORK_REFERENCE",
    pattern: /\bhttps?:\/\//iu,
    message: "network references are not allowed in Experiment IR",
  },
  {
    code: "RAW_PATH",
    pattern: /(?:\.\.\/|\/(?:etc|home|root|proc|sys)\/|[A-Za-z]:\\)/u,
    message: "raw filesystem paths are not allowed in Experiment IR",
  },
];

export function validateExperimentIRPolicy(
  value: unknown,
): ExperimentIRPolicyFinding[] {
  const parsed = ExperimentIRV5Schema.safeParse(value);
  if (!parsed.success) {
    return [
      {
        code: "SCHEMA_INVALID",
        path: "$",
        message: "Experiment IR does not match schema version 5",
      },
    ];
  }

  const findings: ExperimentIRPolicyFinding[] = [];
  visitStrings(parsed.data, "$", (text, path) => {
    for (const rule of FORBIDDEN_TEXT) {
      if (
        /^\$\.evidenceRefs\[\d+\]\.excerpt$/u.test(path) &&
        (rule.code === "EXECUTABLE_SOURCE" ||
          rule.code === "DYNAMIC_EXPRESSION")
      ) {
        continue;
      }
      if (rule.pattern.test(text)) {
        findings.push({
          code: rule.code,
          path,
          message: rule.message,
        });
      }
    }
  });
  return findings;
}

export function assertExperimentIRPolicy(value: unknown): void {
  const findings = validateExperimentIRPolicy(value);
  if (findings.length > 0) throw new ExperimentIRPolicyError(findings);
}

function visitStrings(
  value: unknown,
  path: string,
  visitor: (text: string, path: string) => void,
): void {
  if (typeof value === "string") {
    visitor(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      visitStrings(item, `${path}[${index}]`, visitor),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      visitStrings(item, `${path}.${key}`, visitor);
    }
  }
}
