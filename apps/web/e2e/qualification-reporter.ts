import {
  basename,
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestStep,
} from "@playwright/test/reporter";
import { z } from "zod";

import {
  ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES,
  CloakBrowserRawRunSchema,
  PublicationReleaseBindingSchema,
  REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID,
  REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID,
  REQUIRED_CLOAK_JOURNEY_IDS,
  REQUIRED_CLOAK_VIEWPORTS,
} from "../../../scripts/submission-publication-evidence";
import { containedNewOutputFile } from "../../../scripts/repository-cli-paths";

export const JOURNEY_OBSERVATION_ATTACHMENT =
  "counterlab-journey-observation" as const;

const PageObservationSchema = z
  .object({
    schemaVersion: z.literal("3"),
    authority: z.enum(["CLOAK_CDP_ENDPOINT", "stock-chromium-design-review"]),
    viewport: z
      .object({
        width: z.number().int().positive().max(8_192),
        height: z.number().int().positive().max(8_192),
      })
      .strict(),
    consoleErrors: z.number().int().nonnegative(),
    expectedRequestFailures: z
      .array(z.enum(ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES))
      .max(ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES.length),
    expectedFailedRequests: z.number().int().nonnegative(),
    failedRequests: z.number().int().nonnegative(),
    observedRequestFailures: z
      .array(z.enum(ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES))
      .max(ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES.length),
    observedFailedRequests: z.number().int().nonnegative(),
    expectedRequestFailuresMatched: z.boolean(),
    browserVersion: z.string().trim().min(1).max(128),
  })
  .strict();

export type JourneyPageObservation = z.infer<typeof PageObservationSchema>;

export interface CapturedJourney {
  id: string;
  status: TestResult["status"];
  expectedStatus: TestCase["expectedStatus"];
  attempt: number;
  durationMs: number;
  assertionCount: number;
  viewport: string;
  consoleErrors: number;
  expectedRequestFailures: readonly (typeof ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES)[number][];
  expectedFailedRequests: number;
  failedRequests: number;
  observedRequestFailures: readonly (typeof ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES)[number][];
  observedFailedRequests: number;
  browserVersion: string;
  browserAuthority:
    "CLOAK_CDP_ENDPOINT" | "stock-chromium-design-review" | "unavailable";
  telemetryValid: boolean;
}

type RawRunAuthority = "CLOAKBROWSER" | "STOCK_CHROMIUM_DESIGN_REVIEW";

interface BuildRawRunInput {
  authority: RawRunAuthority;
  baseUrl: string;
  completedAt: string;
  journeys: readonly CapturedJourney[];
  playwrightStatus: FullResult["status"];
  qualificationRequested: boolean;
  release: z.infer<typeof PublicationReleaseBindingSchema> | null;
  rootErrors?: number;
  startedAt: string;
}

interface QualificationReporterOptions {
  authority: RawRunAuthority;
  baseUrl: string;
  outputFile: string;
  qualificationRequested: boolean;
  releaseBinding: z.infer<typeof PublicationReleaseBindingSchema> | null;
  repositoryRoot: string;
  runtimeRoot: string;
}

const expectedProductionOrigin =
  "https://counterlab.cserules.workers.dev" as const;
const allowedExpectedRequestFailures: ReadonlySet<string> = new Set(
  ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES,
);

export function summarizeRequestFailures(
  observed: readonly string[],
  expected: readonly string[],
): {
  expectedCount: number;
  matched: boolean;
  observedCount: number;
  observedRequestFailures: readonly (typeof ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES)[number][];
  unexpectedCount: number;
} {
  const expectedValid =
    expected.every((failure) => allowedExpectedRequestFailures.has(failure)) &&
    new Set(expected).size === expected.length;
  const remaining = [...observed];
  for (const expectedFailure of expected) {
    const index = remaining.indexOf(expectedFailure);
    if (index >= 0) remaining.splice(index, 1);
  }
  return {
    expectedCount: expected.length,
    matched:
      expectedValid &&
      observed.length === expected.length &&
      remaining.length === 0,
    observedCount: observed.length,
    observedRequestFailures: observed.filter(
      (
        failure,
      ): failure is (typeof ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES)[number] =>
        allowedExpectedRequestFailures.has(failure),
    ),
    unexpectedCount: remaining.length,
  };
}

export function journeyIdForTest(
  test: Pick<TestCase, "location" | "titlePath">,
): string {
  return journeyIdForParts(test.location.file, test.titlePath());
}

export function journeyIdForParts(
  file: string,
  titlePath: readonly string[],
): string {
  const fileName = basename(file);
  const fileStem = fileName.replace(/\.spec\.[cm]?[jt]sx?$/u, "");
  const titles = titlePath.filter(
    (title) => title !== "" && basename(title) !== fileName,
  );
  return [fileStem, ...titles].join("::");
}

export function countPlaywrightAssertions(
  steps: readonly Pick<TestStep, "category" | "steps">[],
): number {
  return steps.reduce(
    (count, step) =>
      count +
      (step.category === "fixture" || step.category === "hook"
        ? 0
        : (step.category === "expect" ? 1 : 0) +
          countPlaywrightAssertions(step.steps)),
    0,
  );
}

export function readJourneyObservation(
  result: Pick<TestResult, "attachments">,
): JourneyPageObservation {
  const observations = result.attachments.filter(
    (attachment) => attachment.name === JOURNEY_OBSERVATION_ATTACHMENT,
  );
  if (observations.length !== 1) {
    throw new Error("Expected exactly one journey observation attachment");
  }
  const observation = observations[0]!;
  if (
    observation.contentType !== "application/json" ||
    observation.body === undefined ||
    observation.path !== undefined
  ) {
    throw new Error("Journey observation must be in-memory JSON");
  }
  return PageObservationSchema.parse(
    JSON.parse(observation.body.toString("utf8")) as unknown,
  );
}

function sortedJourneys(
  journeys: readonly CapturedJourney[],
): CapturedJourney[] {
  const registryOrder = new Map<string, number>(
    REQUIRED_CLOAK_JOURNEY_IDS.map((id, index) => [id, index]),
  );
  return [...journeys].sort((left, right) => {
    const leftIndex = registryOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
    const rightIndex = registryOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
    return leftIndex - rightIndex || left.id.localeCompare(right.id);
  });
}

function exactJourneyRegistry(journeys: readonly CapturedJourney[]): boolean {
  const identifiers = journeys.map((journey) => journey.id);
  return (
    identifiers.length === REQUIRED_CLOAK_JOURNEY_IDS.length &&
    new Set(identifiers).size === identifiers.length &&
    JSON.stringify([...identifiers].sort()) ===
      JSON.stringify([...REQUIRED_CLOAK_JOURNEY_IDS].sort())
  );
}

function exactViewportCoverage(journeys: readonly CapturedJourney[]): boolean {
  const observed = new Set(journeys.map((journey) => journey.viewport));
  return (
    REQUIRED_CLOAK_VIEWPORTS.every((viewport) => observed.has(viewport)) &&
    journeys.every(
      (journey) =>
        REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID[
          journey.id as keyof typeof REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID
        ] === journey.viewport,
    )
  );
}

export function buildCloakBrowserRawRun(input: BuildRawRunInput) {
  const expectedJourneyAuthority =
    input.authority === "CLOAKBROWSER"
      ? "CLOAK_CDP_ENDPOINT"
      : "stock-chromium-design-review";
  const exactCleanRun =
    input.qualificationRequested &&
    input.authority === "CLOAKBROWSER" &&
    input.baseUrl === expectedProductionOrigin &&
    input.release !== null &&
    input.release.productionOrigin === input.baseUrl &&
    input.playwrightStatus === "passed" &&
    (input.rootErrors ?? 0) === 0 &&
    exactJourneyRegistry(input.journeys) &&
    exactViewportCoverage(input.journeys) &&
    input.journeys.every(
      (journey) =>
        journey.status === "passed" &&
        journey.expectedStatus === "passed" &&
        journey.attempt === 0 &&
        journey.durationMs > 0 &&
        journey.assertionCount > 0 &&
        journey.consoleErrors === 0 &&
        JSON.stringify(journey.expectedRequestFailures) ===
          JSON.stringify(
            REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[
              journey.id as keyof typeof REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID
            ],
          ) &&
        journey.expectedRequestFailures.length ===
          journey.expectedFailedRequests &&
        JSON.stringify(journey.observedRequestFailures) ===
          JSON.stringify(journey.expectedRequestFailures) &&
        journey.observedFailedRequests === journey.expectedFailedRequests &&
        journey.failedRequests === 0 &&
        journey.browserVersion.trim() !== "" &&
        journey.browserVersion !== "unavailable" &&
        journey.browserAuthority === expectedJourneyAuthority &&
        journey.telemetryValid,
    ) &&
    new Set(input.journeys.map((journey) => journey.browserVersion)).size === 1;

  return CloakBrowserRawRunSchema.parse({
    schemaVersion: "3",
    kind: "cloakbrowser-raw-run",
    status: input.qualificationRequested
      ? exactCleanRun
        ? "PASSED"
        : "FAILED"
      : "NON_QUALIFYING",
    authority: input.authority,
    qualificationRequested: input.qualificationRequested,
    baseUrl: input.baseUrl,
    release: input.release,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    playwrightVersion: "1.61.1",
    playwrightStatus: input.playwrightStatus,
    rootErrors: input.rootErrors ?? 0,
    journeys: sortedJourneys(input.journeys),
    privacy: {
      containsSecrets: false,
      containsRawNotebook: false,
      containsPersonalData: false,
    },
  });
}

function assertReporterOutput(outputFile: string, runtimeRoot: string): string {
  if (
    runtimeRoot.trim() === "" ||
    !isAbsolute(runtimeRoot) ||
    !isAbsolute(outputFile)
  ) {
    throw new Error(
      "Qualification reporter paths require an absolute repository runtime root",
    );
  }
  const resolvedRoot = resolve(runtimeRoot);
  const resolvedOutput = resolve(outputFile);
  const pathFromRoot = relative(resolvedRoot, resolvedOutput);
  if (
    pathFromRoot === "" ||
    pathFromRoot === ".." ||
    pathFromRoot.startsWith(`..${sep}`) ||
    isAbsolute(pathFromRoot)
  ) {
    throw new Error(
      "Qualification reporter output must stay beneath the E2E runtime root",
    );
  }
  return resolvedOutput;
}

export default class CounterLabQualificationReporter implements Reporter {
  private readonly capturedJourneys: CapturedJourney[] = [];
  private readonly startedAt = new Date().toISOString();
  private rootErrors = 0;

  constructor(private readonly options: QualificationReporterOptions) {}

  printsToStdio(): boolean {
    return false;
  }

  onError(): void {
    this.rootErrors += 1;
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    let observation: JourneyPageObservation | null = null;
    try {
      observation = readJourneyObservation(result);
    } catch {
      observation = null;
    }
    this.capturedJourneys.push({
      id: journeyIdForTest(test),
      status: result.status,
      expectedStatus: test.expectedStatus,
      attempt: result.retry,
      durationMs: Math.max(0, Math.round(result.duration)),
      assertionCount: countPlaywrightAssertions(result.steps),
      viewport:
        observation === null
          ? "0x0"
          : `${observation.viewport.width}x${observation.viewport.height}`,
      consoleErrors: observation?.consoleErrors ?? 1,
      expectedRequestFailures: observation?.expectedRequestFailures ?? [],
      expectedFailedRequests: observation?.expectedFailedRequests ?? 0,
      failedRequests: observation?.failedRequests ?? 1,
      observedRequestFailures: observation?.observedRequestFailures ?? [],
      observedFailedRequests: observation?.observedFailedRequests ?? 1,
      browserVersion: observation?.browserVersion ?? "unavailable",
      browserAuthority: observation?.authority ?? "unavailable",
      telemetryValid:
        observation !== null && observation.expectedRequestFailuresMatched,
    });
  }

  async onEnd(
    result: FullResult,
  ): Promise<{ status?: FullResult["status"] } | undefined> {
    if (
      this.capturedJourneys.length === 0 &&
      !this.options.qualificationRequested
    ) {
      return undefined;
    }
    try {
      const report = buildCloakBrowserRawRun({
        authority: this.options.authority,
        baseUrl: this.options.baseUrl,
        completedAt: new Date().toISOString(),
        journeys: this.capturedJourneys,
        playwrightStatus: result.status,
        qualificationRequested: this.options.qualificationRequested,
        release: this.options.releaseBinding,
        rootErrors: this.rootErrors,
        startedAt: this.startedAt,
      });
      const outputFile = assertReporterOutput(
        this.options.outputFile,
        this.options.runtimeRoot,
      );
      await mkdir(dirname(outputFile), { recursive: true });
      await containedNewOutputFile(
        this.options.repositoryRoot,
        outputFile,
        "CloakBrowser raw run evidence",
      );
      await writeFile(outputFile, `${JSON.stringify(report, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600,
      });
      if (this.options.qualificationRequested && report.status !== "PASSED") {
        return { status: "failed" };
      }
      return undefined;
    } catch {
      return { status: "failed" };
    }
  }
}
