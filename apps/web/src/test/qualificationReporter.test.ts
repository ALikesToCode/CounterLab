import type { TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";

import {
  buildCloakBrowserRawRun,
  classifyExpectedHttpError,
  classifyExpectedHttpErrorObservation,
  classifyExpectedHttpResourceConsoleError,
  classifyExpectedHttpResourceConsoleObservation,
  countPlaywrightAssertions,
  journeyIdForTest,
  readJourneyObservation,
  summarizeExpectedHttpErrors,
  summarizeExpectedHttpResourceConsoleErrors,
  summarizeRequestFailures,
  type CapturedJourney,
} from "../../e2e/qualification-reporter";
import {
  REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID,
  REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID,
  REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID,
  REQUIRED_CLOAK_JOURNEY_IDS,
  REQUIRED_CLOAK_VIEWPORTS,
} from "../../../../scripts/submission-publication-evidence";

const qualificationRelease = {
  deploymentReceiptSha256: "a".repeat(64),
  productionOrigin: "https://counterlab.cserules.workers.dev",
  workerEvidenceCommit: "b".repeat(40),
  runnerSourceCommit: "c".repeat(40),
  containerImageDigest: `sha256:${"d".repeat(64)}`,
  workerVersionId: "12345678-1234-1234-1234-123456789abc",
} as const;
const compileHttpError =
  "409 POST /api/sessions/:sessionId/lab/compile" as const;
const artifactHttpError = "422 POST /api/artifacts" as const;
const productionOrigin = "https://counterlab.cserules.workers.dev";

function reporterTestCase(
  file: string,
  titlePath: readonly string[],
): TestCase {
  return {
    location: { file, line: 1, column: 1 },
    titlePath: () => [...titlePath],
  } as TestCase;
}

function step(category: string, children: readonly TestStep[] = []): TestStep {
  return { category, steps: [...children] } as TestStep;
}

function capturedJourneys(): CapturedJourney[] {
  return REQUIRED_CLOAK_JOURNEY_IDS.map((id, index) => ({
    id,
    status: "passed",
    expectedStatus: "passed",
    attempt: 0,
    durationMs: index + 1,
    assertionCount: 1,
    viewport: REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID[id],
    totalConsoleErrors: 0,
    expectedHttpResourceConsoleErrors: 0,
    unexpectedConsoleErrors: 0,
    expectedHttpErrorResponses: REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID[id],
    observedHttpErrorResponses: REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID[id],
    unexpectedHttpErrorResponses: 0,
    expectedRequestFailures: REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id],
    expectedFailedRequests:
      REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id].length,
    unexpectedFailedRequests: 0,
    observedRequestFailures: REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id],
    observedFailedRequests:
      REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id].length,
    browserVersion: "Chrome/140.0.0.0",
    browserAuthority: "CLOAK_CDP_ENDPOINT",
    telemetryValid: true,
  }));
}

describe("CloakBrowser qualification reporter", () => {
  it("derives stable registry IDs from file and describe titles", () => {
    const testCase = reporterTestCase(
      "/repo/apps/web/e2e/mobile-public-replay.spec.ts",
      [
        "",
        "",
        "mobile-public-replay.spec.ts",
        "public mobile replay routing",
        "390x844 opens the replay deep link read-only without root overflow",
      ],
    );

    expect(journeyIdForTest(testCase)).toBe(
      "mobile-public-replay::public mobile replay routing::390x844 opens the replay deep link read-only without root overflow",
    );
  });

  it("counts nested Playwright expect steps without counting fixtures or API calls", () => {
    expect(
      countPlaywrightAssertions([
        step("fixture", [step("expect")]),
        step("expect"),
        step("test.step", [step("pw:api"), step("expect")]),
      ]),
    ).toBe(2);
  });

  it("accepts exactly one privacy-safe in-memory page observation", () => {
    const body = Buffer.from(
      JSON.stringify({
        schemaVersion: "4",
        authority: "CLOAK_CDP_ENDPOINT",
        viewport: { width: 1440, height: 900 },
        totalConsoleErrors: 0,
        expectedHttpResourceConsoleErrors: 0,
        unexpectedConsoleErrors: 0,
        expectedHttpErrorResponses: [],
        observedHttpErrorResponses: [],
        unexpectedHttpErrorResponses: 0,
        expectedHttpResponsesMatched: true,
        expectedRequestFailures: [],
        expectedFailedRequests: 0,
        unexpectedFailedRequests: 0,
        observedRequestFailures: [],
        observedFailedRequests: 0,
        expectedRequestFailuresMatched: true,
        browserVersion: "Chrome/140.0.0.0",
      }),
    );
    const result = {
      attachments: [
        {
          name: "counterlab-journey-observation",
          contentType: "application/json",
          body,
        },
      ],
    } as TestResult;

    expect(readJourneyObservation(result)).toEqual({
      schemaVersion: "4",
      authority: "CLOAK_CDP_ENDPOINT",
      viewport: { width: 1440, height: 900 },
      totalConsoleErrors: 0,
      expectedHttpResourceConsoleErrors: 0,
      unexpectedConsoleErrors: 0,
      expectedHttpErrorResponses: [],
      observedHttpErrorResponses: [],
      unexpectedHttpErrorResponses: 0,
      expectedHttpResponsesMatched: true,
      expectedRequestFailures: [],
      expectedFailedRequests: 0,
      unexpectedFailedRequests: 0,
      observedRequestFailures: [],
      observedFailedRequests: 0,
      expectedRequestFailuresMatched: true,
      browserVersion: "Chrome/140.0.0.0",
    });
  });

  it("matches only the exact allowlisted intentional request failure", () => {
    expect(
      summarizeRequestFailures(
        ["POST /api/artifacts"],
        ["POST /api/artifacts"],
      ),
    ).toEqual({
      expectedCount: 1,
      matched: true,
      observedCount: 1,
      observedRequestFailures: ["POST /api/artifacts"],
      unexpectedCount: 0,
    });
    expect(
      summarizeRequestFailures(["GET /unrelated.js"], ["POST /api/artifacts"]),
    ).toEqual({
      expectedCount: 1,
      matched: false,
      observedCount: 1,
      observedRequestFailures: [],
      unexpectedCount: 1,
    });
    expect(summarizeRequestFailures([], ["POST /api/live/sessions"])).toEqual({
      expectedCount: 1,
      matched: false,
      observedCount: 0,
      observedRequestFailures: [],
      unexpectedCount: 0,
    });
    expect(
      summarizeRequestFailures(
        ["POST /api/artifacts"],
        ["POST /not-allowlisted"],
      ).matched,
    ).toBe(false);
  });

  it("classifies only exact allowlisted HTTP error responses", () => {
    expect(
      classifyExpectedHttpError({
        expectedOrigin: productionOrigin,
        method: "POST",
        status: 409,
        url: `${productionOrigin}/api/sessions/session-private-value/lab/compile`,
      }),
    ).toBe(compileHttpError);
    expect(
      classifyExpectedHttpError({
        expectedOrigin: productionOrigin,
        method: "POST",
        status: 422,
        url: `${productionOrigin}/api/artifacts`,
      }),
    ).toBe(artifactHttpError);
  });

  it.each([
    {
      name: "wrong method",
      method: "GET",
      status: 409,
      url: `${productionOrigin}/api/sessions/session-id/lab/compile`,
    },
    {
      name: "wrong status",
      method: "POST",
      status: 500,
      url: `${productionOrigin}/api/sessions/session-id/lab/compile`,
    },
    {
      name: "wrong path",
      method: "POST",
      status: 409,
      url: `${productionOrigin}/api/sessions/session-id/lab/run`,
    },
    {
      name: "query string",
      method: "POST",
      status: 409,
      url: `${productionOrigin}/api/sessions/session-id/lab/compile?retry=1`,
    },
    {
      name: "fragment",
      method: "POST",
      status: 409,
      url: `${productionOrigin}/api/sessions/session-id/lab/compile#fragment`,
    },
    {
      name: "wrong origin",
      method: "POST",
      status: 409,
      url: "https://example.invalid/api/sessions/session-id/lab/compile",
    },
  ])("rejects a $name HTTP error response", ({ method, status, url }) => {
    expect(
      classifyExpectedHttpError({
        expectedOrigin: productionOrigin,
        method,
        status,
        url,
      }),
    ).toBeNull();
  });

  it("fails expected HTTP reconciliation for missing, duplicate, and unrelated responses", () => {
    expect(
      summarizeExpectedHttpErrors([compileHttpError], [compileHttpError]),
    ).toEqual({
      expectedCount: 1,
      matched: true,
      observedCount: 1,
      observedHttpErrorResponses: [compileHttpError],
      unexpectedCount: 0,
    });
    expect(summarizeExpectedHttpErrors([], [compileHttpError])).toMatchObject({
      matched: false,
      observedCount: 0,
      unexpectedCount: 0,
    });
    expect(
      summarizeExpectedHttpErrors(
        [compileHttpError, compileHttpError],
        [compileHttpError],
      ),
    ).toMatchObject({
      matched: false,
      observedCount: 2,
      unexpectedCount: 1,
    });
    expect(
      summarizeExpectedHttpErrors([null], [compileHttpError]),
    ).toMatchObject({
      matched: false,
      observedCount: 1,
      unexpectedCount: 1,
    });
  });

  it("attributes zero or one exact Chromium resource error only after its response matches", () => {
    const text =
      "Failed to load resource: the server responded with a status of 409 (Conflict)";
    const responseObservation = classifyExpectedHttpErrorObservation({
      expectedOrigin: productionOrigin,
      method: "POST",
      status: 409,
      url: `${productionOrigin}/api/sessions/session-id/lab/compile`,
    });
    const consoleObservation = classifyExpectedHttpResourceConsoleObservation({
      expectedOrigin: productionOrigin,
      locationUrl: `${productionOrigin}/api/sessions/session-id/lab/compile`,
      text,
    });
    expect(responseObservation).not.toBeNull();
    expect(consoleObservation).not.toBeNull();
    expect(
      classifyExpectedHttpResourceConsoleError({
        expectedOrigin: productionOrigin,
        locationUrl: `${productionOrigin}/api/sessions/session-id/lab/compile`,
        text,
      }),
    ).toBe(compileHttpError);
    expect(
      summarizeExpectedHttpResourceConsoleErrors([], [responseObservation!]),
    ).toEqual({ expectedCount: 0, totalCount: 0, unexpectedCount: 0 });
    expect(
      summarizeExpectedHttpResourceConsoleErrors(
        [consoleObservation],
        [responseObservation!],
      ),
    ).toEqual({ expectedCount: 1, totalCount: 1, unexpectedCount: 0 });
    expect(
      summarizeExpectedHttpResourceConsoleErrors([consoleObservation], []),
    ).toEqual({ expectedCount: 0, totalCount: 1, unexpectedCount: 1 });
  });

  it("correlates resource console errors to one exact response without persisting its session ID", () => {
    const text =
      "Failed to load resource: the server responded with a status of 409 (Conflict)";
    const sessionAResponse = classifyExpectedHttpErrorObservation({
      expectedOrigin: productionOrigin,
      method: "POST",
      status: 409,
      url: `${productionOrigin}/api/sessions/session-a/lab/compile`,
    });
    const sessionAConsole = classifyExpectedHttpResourceConsoleObservation({
      expectedOrigin: productionOrigin,
      locationUrl: `${productionOrigin}/api/sessions/session-a/lab/compile`,
      text,
    });
    const sessionBConsole = classifyExpectedHttpResourceConsoleObservation({
      expectedOrigin: productionOrigin,
      locationUrl: `${productionOrigin}/api/sessions/session-b/lab/compile`,
      text,
    });
    expect(sessionAResponse).not.toBeNull();
    expect(sessionAConsole).not.toBeNull();
    expect(sessionBConsole).not.toBeNull();
    expect(sessionAResponse?.signature).toBe(compileHttpError);
    expect(sessionAConsole?.signature).toBe(compileHttpError);
    expect(sessionBConsole?.signature).toBe(compileHttpError);
    expect(
      summarizeExpectedHttpResourceConsoleErrors(
        [sessionAConsole],
        [sessionAResponse!],
      ),
    ).toEqual({ expectedCount: 1, totalCount: 1, unexpectedCount: 0 });
    expect(
      summarizeExpectedHttpResourceConsoleErrors(
        [sessionBConsole],
        [sessionAResponse!],
      ),
    ).toEqual({ expectedCount: 0, totalCount: 1, unexpectedCount: 1 });
    expect(
      JSON.stringify({
        observedHttpErrorResponses: [sessionAResponse!.signature],
      }),
    ).not.toContain("session-a");
  });

  it("keeps mismatched resource messages and unrelated console errors unexpected", () => {
    expect(
      classifyExpectedHttpResourceConsoleError({
        expectedOrigin: productionOrigin,
        locationUrl: `${productionOrigin}/api/artifacts`,
        text: "Failed to load resource: the server responded with a status of 409 (Conflict)",
      }),
    ).toBeNull();
    expect(
      classifyExpectedHttpResourceConsoleError({
        expectedOrigin: productionOrigin,
        locationUrl: `${productionOrigin}/api/artifacts`,
        text: "Uncaught Error: unrelated",
      }),
    ).toBeNull();
    expect(
      summarizeExpectedHttpResourceConsoleErrors(
        [
          null,
          classifyExpectedHttpResourceConsoleObservation({
            expectedOrigin: productionOrigin,
            locationUrl: `${productionOrigin}/api/artifacts`,
            text: "Failed to load resource: the server responded with a status of 422 (Unprocessable Content)",
          }),
          classifyExpectedHttpResourceConsoleObservation({
            expectedOrigin: productionOrigin,
            locationUrl: `${productionOrigin}/api/artifacts`,
            text: "Failed to load resource: the server responded with a status of 422 (Unprocessable Content)",
          }),
        ],
        [
          classifyExpectedHttpErrorObservation({
            expectedOrigin: productionOrigin,
            method: "POST",
            status: 422,
            url: `${productionOrigin}/api/artifacts`,
          })!,
        ],
      ),
    ).toEqual({ expectedCount: 1, totalCount: 3, unexpectedCount: 2 });
    expect(
      classifyExpectedHttpResourceConsoleObservation({
        expectedOrigin: productionOrigin,
        locationUrl: `${productionOrigin}/api/artifacts?retry=1`,
        text: "Failed to load resource: the server responded with a status of 422 (Unprocessable Content)",
      }),
    ).toBeNull();
    expect(
      classifyExpectedHttpResourceConsoleObservation({
        expectedOrigin: productionOrigin,
        locationUrl: `${productionOrigin}/api/artifacts#fragment`,
        text: "Failed to load resource: the server responded with a status of 422 (Unprocessable Content)",
      }),
    ).toBeNull();
  });

  it("rejects missing, path-based, duplicate, and over-disclosed observations", () => {
    const validBody = Buffer.from(
      JSON.stringify({
        schemaVersion: "4",
        authority: "CLOAK_CDP_ENDPOINT",
        viewport: { width: 1440, height: 900 },
        totalConsoleErrors: 0,
        expectedHttpResourceConsoleErrors: 0,
        unexpectedConsoleErrors: 0,
        expectedHttpErrorResponses: [],
        observedHttpErrorResponses: [],
        unexpectedHttpErrorResponses: 0,
        expectedHttpResponsesMatched: true,
        expectedRequestFailures: [],
        expectedFailedRequests: 0,
        unexpectedFailedRequests: 0,
        observedRequestFailures: [],
        observedFailedRequests: 0,
        expectedRequestFailuresMatched: true,
        browserVersion: "Chrome/140.0.0.0",
      }),
    );
    const attachment = {
      name: "counterlab-journey-observation",
      contentType: "application/json",
      body: validBody,
    };

    expect(() =>
      readJourneyObservation({ attachments: [] } as unknown as TestResult),
    ).toThrow(/exactly one journey observation/i);
    expect(() =>
      readJourneyObservation({
        attachments: [{ ...attachment, body: undefined, path: "/private" }],
      } as unknown as TestResult),
    ).toThrow(/in-memory JSON/i);
    expect(() =>
      readJourneyObservation({
        attachments: [attachment, attachment],
      } as unknown as TestResult),
    ).toThrow(/exactly one journey observation/i);
    expect(() =>
      readJourneyObservation({
        attachments: [
          {
            ...attachment,
            body: Buffer.from(
              JSON.stringify({
                ...JSON.parse(validBody.toString("utf8")),
                pageUrl: "https://private.example/session/token",
              }),
            ),
          },
        ],
      } as unknown as TestResult),
    ).toThrow();
  });

  it("marks only an exact clean 40-journey Cloak run as passed", () => {
    const report = buildCloakBrowserRawRun({
      authority: "CLOAKBROWSER",
      baseUrl: "https://counterlab.cserules.workers.dev",
      completedAt: "2026-07-21T10:01:00.000Z",
      journeys: capturedJourneys(),
      playwrightStatus: "passed",
      qualificationRequested: true,
      release: qualificationRelease,
      startedAt: "2026-07-21T10:00:00.000Z",
    });

    expect(report.status).toBe("PASSED");
    expect(report.journeys).toHaveLength(40);
    expect(new Set(report.journeys.map((journey) => journey.viewport))).toEqual(
      new Set(REQUIRED_CLOAK_VIEWPORTS),
    );
  });

  it("accepts one response-bound Chromium resource error without hiding it", () => {
    const journeys = capturedJourneys().map((journey) =>
      journey.id ===
      "judged-flow::a rejected test releases no result and remains recoverable after refresh"
        ? {
            ...journey,
            totalConsoleErrors: 1,
            expectedHttpResourceConsoleErrors: 1,
          }
        : journey,
    );
    const report = buildCloakBrowserRawRun({
      authority: "CLOAKBROWSER",
      baseUrl: productionOrigin,
      completedAt: "2026-07-21T10:01:00.000Z",
      journeys,
      playwrightStatus: "passed",
      qualificationRequested: true,
      release: qualificationRelease,
      startedAt: "2026-07-21T10:00:00.000Z",
    });

    expect(report.status).toBe("PASSED");
    expect(
      report.journeys.find(
        (journey) =>
          journey.id ===
          "judged-flow::a rejected test releases no result and remains recoverable after refresh",
      ),
    ).toMatchObject({
      totalConsoleErrors: 1,
      expectedHttpResourceConsoleErrors: 1,
      unexpectedConsoleErrors: 0,
    });
  });

  it.each([
    {
      name: "missing journey",
      mutate: (journeys: CapturedJourney[]) => journeys.slice(1),
    },
    {
      name: "extra duplicate journey",
      mutate: (journeys: CapturedJourney[]) => [
        ...journeys,
        { ...journeys[0]! },
      ],
    },
    {
      name: "retry",
      mutate: (journeys: CapturedJourney[]) => [
        { ...journeys[0]!, attempt: 1 },
        ...journeys.slice(1),
      ],
    },
    {
      name: "expected failure",
      mutate: (journeys: CapturedJourney[]) => [
        { ...journeys[0]!, expectedStatus: "failed" as const },
        ...journeys.slice(1),
      ],
    },
    {
      name: "console error",
      mutate: (journeys: CapturedJourney[]) => [
        {
          ...journeys[0]!,
          totalConsoleErrors: 1,
          unexpectedConsoleErrors: 1,
        },
        ...journeys.slice(1),
      ],
    },
    {
      name: "missing expected HTTP error response",
      mutate: (journeys: CapturedJourney[]) =>
        journeys.map((journey) =>
          journey.id ===
          "judged-flow::a rejected test releases no result and remains recoverable after refresh"
            ? { ...journey, observedHttpErrorResponses: [] }
            : journey,
        ),
    },
    {
      name: "duplicate expected HTTP error response",
      mutate: (journeys: CapturedJourney[]) =>
        journeys.map((journey) =>
          journey.id ===
          "judged-flow::a rejected test releases no result and remains recoverable after refresh"
            ? {
                ...journey,
                observedHttpErrorResponses: [
                  compileHttpError,
                  compileHttpError,
                ],
              }
            : journey,
        ),
    },
    {
      name: "HTTP error response assigned to the wrong journey",
      mutate: (journeys: CapturedJourney[]) => [
        {
          ...journeys[0]!,
          expectedHttpErrorResponses: [artifactHttpError],
          observedHttpErrorResponses: [artifactHttpError],
        },
        ...journeys.slice(1),
      ],
    },
    {
      name: "unexpected HTTP error response",
      mutate: (journeys: CapturedJourney[]) => [
        { ...journeys[0]!, unexpectedHttpErrorResponses: 1 },
        ...journeys.slice(1),
      ],
    },
    {
      name: "mismatched resource console error",
      mutate: (journeys: CapturedJourney[]) =>
        journeys.map((journey) =>
          journey.id ===
          "judged-flow::a rejected test releases no result and remains recoverable after refresh"
            ? {
                ...journey,
                totalConsoleErrors: 1,
                unexpectedConsoleErrors: 1,
              }
            : journey,
        ),
    },
    {
      name: "missing assertion",
      mutate: (journeys: CapturedJourney[]) => [
        { ...journeys[0]!, assertionCount: 0 },
        ...journeys.slice(1),
      ],
    },
    {
      name: "invalid telemetry",
      mutate: (journeys: CapturedJourney[]) => [
        { ...journeys[0]!, telemetryValid: false },
        ...journeys.slice(1),
      ],
    },
    {
      name: "inconsistent request failure counts",
      mutate: (journeys: CapturedJourney[]) => [
        { ...journeys[0]!, observedFailedRequests: 1 },
        ...journeys.slice(1),
      ],
    },
    {
      name: "request failure operation assigned to the wrong journey",
      mutate: (journeys: CapturedJourney[]) => [
        {
          ...journeys[0]!,
          expectedRequestFailures: ["POST /api/artifacts"] as const,
          expectedFailedRequests: 1,
          observedRequestFailures: ["POST /api/artifacts"] as const,
          observedFailedRequests: 1,
        },
        ...journeys.slice(1),
      ],
    },
    {
      name: "missing required viewport",
      mutate: (journeys: CapturedJourney[]) =>
        journeys.map((journey) =>
          journey.viewport === "768x1024"
            ? { ...journey, viewport: "1440x900" as const }
            : journey,
        ),
    },
    {
      name: "viewport swapped between registered journeys",
      mutate: (journeys: CapturedJourney[]) => {
        const desktop = journeys.findIndex(
          (journey) => journey.viewport === "1440x900",
        );
        const mobile = journeys.findIndex(
          (journey) => journey.viewport === "390x844",
        );
        const mutated = [...journeys];
        mutated[desktop] = { ...mutated[desktop]!, viewport: "390x844" };
        mutated[mobile] = { ...mutated[mobile]!, viewport: "1440x900" };
        return mutated;
      },
    },
  ])("fails closed for $name", ({ mutate }) => {
    const report = buildCloakBrowserRawRun({
      authority: "CLOAKBROWSER",
      baseUrl: "https://counterlab.cserules.workers.dev",
      completedAt: "2026-07-21T10:01:00.000Z",
      journeys: mutate(capturedJourneys()),
      playwrightStatus: "passed",
      qualificationRequested: true,
      release: qualificationRelease,
      startedAt: "2026-07-21T10:00:00.000Z",
    });

    expect(report.status).toBe("FAILED");
  });

  it("never upgrades a design-review run into qualifying evidence", () => {
    const report = buildCloakBrowserRawRun({
      authority: "STOCK_CHROMIUM_DESIGN_REVIEW",
      baseUrl: "http://127.0.0.1:5173",
      completedAt: "2026-07-21T10:01:00.000Z",
      journeys: capturedJourneys(),
      playwrightStatus: "passed",
      qualificationRequested: false,
      release: null,
      startedAt: "2026-07-21T10:00:00.000Z",
    });

    expect(report.status).toBe("NON_QUALIFYING");
  });

  it("rejects raw evidence whose completion predates its start", () => {
    expect(() =>
      buildCloakBrowserRawRun({
        authority: "CLOAKBROWSER",
        baseUrl: "https://counterlab.cserules.workers.dev",
        completedAt: "2026-07-21T09:59:59.000Z",
        journeys: capturedJourneys(),
        playwrightStatus: "passed",
        qualificationRequested: true,
        release: qualificationRelease,
        startedAt: "2026-07-21T10:00:00.000Z",
      }),
    ).toThrow(/completion must not precede/i);
  });
});
