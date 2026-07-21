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
  ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS,
  ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES,
  CloakBrowserRawRunSchema,
  PublicationReleaseBindingSchema,
  REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID,
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
    schemaVersion: z.literal("4"),
    authority: z.enum(["CLOAK_CDP_ENDPOINT", "stock-chromium-design-review"]),
    viewport: z
      .object({
        width: z.number().int().positive().max(8_192),
        height: z.number().int().positive().max(8_192),
      })
      .strict(),
    totalConsoleErrors: z.number().int().nonnegative(),
    expectedHttpResourceConsoleErrors: z.number().int().nonnegative(),
    unexpectedConsoleErrors: z.number().int().nonnegative(),
    expectedHttpErrorResponses: z
      .array(z.enum(ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS))
      .max(ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS.length),
    observedHttpErrorResponses: z
      .array(z.enum(ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS))
      .max(ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS.length),
    unexpectedHttpErrorResponses: z.number().int().nonnegative(),
    expectedHttpResponsesMatched: z.boolean(),
    expectedRequestFailures: z
      .array(z.enum(ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES))
      .max(ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES.length),
    expectedFailedRequests: z.number().int().nonnegative(),
    unexpectedFailedRequests: z.number().int().nonnegative(),
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
  totalConsoleErrors: number;
  expectedHttpResourceConsoleErrors: number;
  unexpectedConsoleErrors: number;
  expectedHttpErrorResponses: readonly (typeof ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS)[number][];
  observedHttpErrorResponses: readonly (typeof ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS)[number][];
  unexpectedHttpErrorResponses: number;
  expectedRequestFailures: readonly (typeof ALLOWED_CLOAK_EXPECTED_REQUEST_FAILURES)[number][];
  expectedFailedRequests: number;
  unexpectedFailedRequests: number;
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
const allowedExpectedHttpErrors: ReadonlySet<string> = new Set(
  ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS,
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

type AllowedExpectedHttpError =
  (typeof ALLOWED_CLOAK_EXPECTED_HTTP_ERRORS)[number];

export interface ExpectedHttpErrorObservation {
  signature: AllowedExpectedHttpError;
  ephemeralCorrelationKey: string;
}

function normalizedExpectedHttpPath(pathname: string): string {
  if (pathname === "/api/artifacts") return pathname;
  if (/^\/api\/sessions\/[^/]+\/lab\/compile$/u.test(pathname)) {
    return "/api/sessions/:sessionId/lab/compile";
  }
  return pathname;
}

export function classifyExpectedHttpErrorObservation(input: {
  expectedOrigin: string;
  method: string;
  status: number;
  url: string;
}): ExpectedHttpErrorObservation | null {
  let url: URL;
  try {
    url = new URL(input.url);
  } catch {
    return null;
  }
  if (
    url.origin !== input.expectedOrigin ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    return null;
  }
  const signature = `${input.status} ${input.method.toUpperCase()} ${normalizedExpectedHttpPath(url.pathname)}`;
  if (!allowedExpectedHttpErrors.has(signature)) return null;
  return {
    signature: signature as AllowedExpectedHttpError,
    ephemeralCorrelationKey: `${input.status} ${input.method.toUpperCase()} ${url.origin}${url.pathname}`,
  };
}

export function classifyExpectedHttpError(input: {
  expectedOrigin: string;
  method: string;
  status: number;
  url: string;
}): AllowedExpectedHttpError | null {
  return classifyExpectedHttpErrorObservation(input)?.signature ?? null;
}

export function classifyExpectedHttpResourceConsoleObservation(input: {
  expectedOrigin: string;
  locationUrl: string;
  text: string;
}): ExpectedHttpErrorObservation | null {
  const match =
    /^Failed to load resource: the server responded with a status of (\d{3})(?:\s|$)/u.exec(
      input.text,
    );
  if (match?.[1] === undefined) return null;
  const status = Number.parseInt(match[1], 10);
  for (const method of ["POST"] as const) {
    const classified = classifyExpectedHttpErrorObservation({
      expectedOrigin: input.expectedOrigin,
      method,
      status,
      url: input.locationUrl,
    });
    if (classified !== null) return classified;
  }
  return null;
}

export function classifyExpectedHttpResourceConsoleError(input: {
  expectedOrigin: string;
  locationUrl: string;
  text: string;
}): AllowedExpectedHttpError | null {
  return (
    classifyExpectedHttpResourceConsoleObservation(input)?.signature ?? null
  );
}

export function summarizeExpectedHttpErrors(
  observed: readonly (AllowedExpectedHttpError | null)[],
  expected: readonly string[],
): {
  expectedCount: number;
  matched: boolean;
  observedCount: number;
  observedHttpErrorResponses: readonly AllowedExpectedHttpError[];
  unexpectedCount: number;
} {
  const expectedValid =
    expected.every((error) => allowedExpectedHttpErrors.has(error)) &&
    new Set(expected).size === expected.length;
  const remaining = [...observed];
  for (const expectedError of expected) {
    const index = remaining.indexOf(expectedError as AllowedExpectedHttpError);
    if (index >= 0) remaining.splice(index, 1);
  }
  return {
    expectedCount: expected.length,
    matched:
      expectedValid &&
      observed.length === expected.length &&
      remaining.length === 0,
    observedCount: observed.length,
    observedHttpErrorResponses: observed.filter(
      (error): error is AllowedExpectedHttpError => error !== null,
    ),
    unexpectedCount: remaining.length,
  };
}

export function summarizeExpectedHttpResourceConsoleErrors(
  observed: readonly (ExpectedHttpErrorObservation | null)[],
  matchedHttpErrors: readonly ExpectedHttpErrorObservation[],
): {
  expectedCount: number;
  totalCount: number;
  unexpectedCount: number;
} {
  const available = [...matchedHttpErrors];
  let expectedCount = 0;
  for (const error of observed) {
    if (error === null) continue;
    const index = available.findIndex(
      (candidate) =>
        candidate.ephemeralCorrelationKey === error.ephemeralCorrelationKey &&
        candidate.signature === error.signature,
    );
    if (index >= 0) {
      available.splice(index, 1);
      expectedCount += 1;
    }
  }
  return {
    expectedCount,
    totalCount: observed.length,
    unexpectedCount: observed.length - expectedCount,
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
        journey.unexpectedConsoleErrors === 0 &&
        JSON.stringify(journey.expectedHttpErrorResponses) ===
          JSON.stringify(
            REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID[
              journey.id as keyof typeof REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID
            ],
          ) &&
        JSON.stringify(journey.observedHttpErrorResponses) ===
          JSON.stringify(journey.expectedHttpErrorResponses) &&
        journey.unexpectedHttpErrorResponses === 0 &&
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
        journey.unexpectedFailedRequests === 0 &&
        journey.browserVersion.trim() !== "" &&
        journey.browserVersion !== "unavailable" &&
        journey.browserAuthority === expectedJourneyAuthority &&
        journey.telemetryValid,
    ) &&
    new Set(input.journeys.map((journey) => journey.browserVersion)).size === 1;

  return CloakBrowserRawRunSchema.parse({
    schemaVersion: "4",
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
      totalConsoleErrors: observation?.totalConsoleErrors ?? 0,
      expectedHttpResourceConsoleErrors:
        observation?.expectedHttpResourceConsoleErrors ?? 0,
      unexpectedConsoleErrors: observation?.unexpectedConsoleErrors ?? 0,
      expectedHttpErrorResponses: observation?.expectedHttpErrorResponses ?? [],
      observedHttpErrorResponses: observation?.observedHttpErrorResponses ?? [],
      unexpectedHttpErrorResponses:
        observation?.unexpectedHttpErrorResponses ?? 0,
      expectedRequestFailures: observation?.expectedRequestFailures ?? [],
      expectedFailedRequests: observation?.expectedFailedRequests ?? 0,
      unexpectedFailedRequests: observation?.unexpectedFailedRequests ?? 0,
      observedRequestFailures: observation?.observedRequestFailures ?? [],
      observedFailedRequests: observation?.observedFailedRequests ?? 0,
      browserVersion: observation?.browserVersion ?? "unavailable",
      browserAuthority: observation?.authority ?? "unavailable",
      telemetryValid:
        observation !== null &&
        observation.expectedHttpResponsesMatched &&
        observation.expectedRequestFailuresMatched,
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
