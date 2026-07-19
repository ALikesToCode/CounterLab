import { readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  PilotConsentReferenceSchema,
  PilotSessionSchema,
  RandomizationSchema,
  analyzePilot,
} from "../evals/learner-pilot/src/pilot.js";
import { containedInputFile } from "./repository-cli-paths.js";

const DEFAULT_SESSION_INPUT = "evals/learner-pilot/data/session-results.jsonl";
const DEFAULT_CONSENT_INPUT =
  "evals/learner-pilot/data/consent-references.jsonl";
const RANDOMIZATION_INPUT = "evals/learner-pilot/randomization.json";
const ANALYSIS_OUTPUT = "docs/LEARNER_PILOT_RESULTS.json";

type JsonLine = Readonly<{ lineNumber: number; value: unknown }>;
type SafeSchema<T> = Readonly<{
  safeParse: (
    value: unknown,
  ) => Readonly<{ success: true; data: T }> | Readonly<{ success: false }>;
}>;

export type PilotAnalysisArguments = Readonly<{
  sessionInput: string;
  sessionInputWasExplicit: boolean;
  consentInput: string;
  consentInputWasExplicit: boolean;
}>;

export function parsePilotAnalysisArguments(
  argv: readonly string[],
): PilotAnalysisArguments {
  if (argv.length > 2 || argv.some((value) => value.startsWith("--"))) {
    throw new Error(
      "Usage: analyze-learner-pilot [SESSION_JSONL] [CONSENT_JSONL]",
    );
  }
  return {
    sessionInput: argv[0] ?? DEFAULT_SESSION_INPUT,
    sessionInputWasExplicit: argv[0] !== undefined,
    consentInput: argv[1] ?? DEFAULT_CONSENT_INPUT,
    consentInputWasExplicit: argv[1] !== undefined,
  };
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error
    ? String((error as NodeJS.ErrnoException).code)
    : undefined;
}

export async function containedOptionalPilotInput(
  root: string,
  requested: string,
  label: string,
  wasExplicit: boolean,
): Promise<string | null> {
  try {
    return await containedInputFile(root, requested, label);
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      if (!wasExplicit) return null;
      throw new Error(`${label} does not exist`);
    }
    throw error;
  }
}

export function parsePilotJsonLines(text: string, label: string): JsonLine[] {
  const records: JsonLine[] = [];
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim().length === 0) continue;
    try {
      records.push({ lineNumber: index + 1, value: JSON.parse(line) });
    } catch {
      throw new Error(`${label} line ${index + 1} contains invalid JSON`);
    }
  }
  return records;
}

function validatePilotJsonLines<T>(
  records: readonly JsonLine[],
  schema: SafeSchema<T>,
  label: string,
): T[] {
  return records.map((record) => {
    const parsed = schema.safeParse(record.value);
    if (!parsed.success) {
      throw new Error(
        `${label} line ${record.lineNumber} failed schema validation`,
      );
    }
    return parsed.data;
  });
}

function parseTrackedRandomization(text: string) {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("Tracked pilot randomization contains invalid JSON");
  }
  const parsed = RandomizationSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Tracked pilot randomization failed schema validation");
  }
  return parsed.data;
}

export async function physicalRepositoryRoot(): Promise<string> {
  return realpath(resolve(import.meta.dirname, ".."));
}

export async function preparePilotAnalysis(input: {
  root: string;
  argv: readonly string[];
  analyzedAt?: string;
}) {
  const args = parsePilotAnalysisArguments(input.argv);
  await containedInputFile(
    input.root,
    "COUNTERLAB_REPO_ROOT",
    "repository marker",
  );
  const randomizationPath = await containedInputFile(
    input.root,
    RANDOMIZATION_INPUT,
    "tracked pilot randomization",
  );
  const randomization = parseTrackedRandomization(
    await readFile(randomizationPath, "utf8"),
  );
  const sessionPath = await containedOptionalPilotInput(
    input.root,
    args.sessionInput,
    "pilot session input",
    args.sessionInputWasExplicit,
  );
  const analyzedAt = input.analyzedAt ?? new Date().toISOString();
  if (sessionPath === null) return analyzePilot([], analyzedAt);

  const sessions = validatePilotJsonLines(
    parsePilotJsonLines(await readFile(sessionPath, "utf8"), "session input"),
    PilotSessionSchema,
    "session input",
  );
  if (sessions.length === 0) return analyzePilot([], analyzedAt);

  const consentPath = await containedOptionalPilotInput(
    input.root,
    args.consentInput,
    "pilot consent-reference input",
    args.consentInputWasExplicit,
  );
  if (consentPath === null) {
    throw new Error(
      "pilot consent-reference input is required for non-empty sessions",
    );
  }
  const consentReferences = validatePilotJsonLines(
    parsePilotJsonLines(
      await readFile(consentPath, "utf8"),
      "consent-reference input",
    ),
    PilotConsentReferenceSchema,
    "consent-reference input",
  );
  const qualifiedReleaseReceiptSha256 =
    sessions[0]?.qualifiedReleaseReceiptSha256;
  if (qualifiedReleaseReceiptSha256 === undefined) {
    throw new Error("pilot session input has no qualified release binding");
  }

  try {
    return analyzePilot(sessions, analyzedAt, {
      randomization,
      consentReferences,
      qualifiedReleaseReceiptSha256,
    });
  } catch {
    throw new Error("Pilot record validation failed; no aggregate was written");
  }
}

async function main(): Promise<void> {
  const root = await physicalRepositoryRoot();
  const result = await preparePilotAnalysis({
    root,
    argv: process.argv.slice(2),
  });
  const output = await containedInputFile(
    root,
    ANALYSIS_OUTPUT,
    "fixed pilot aggregate output",
  );
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
  });
  console.log(
    result.status === "NO_DATA"
      ? "No pilot records were supplied; wrote an explicit NO_DATA result."
      : `Analyzed ${result.participantCount} pseudonymous pilot sessions.`,
  );
}

const entry = process.argv[1];
if (
  entry !== undefined &&
  pathToFileURL(resolve(entry)).href === import.meta.url
) {
  try {
    await main();
  } catch (error) {
    console.error(
      `Learner pilot analysis failed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
    process.exitCode = 1;
  }
}
