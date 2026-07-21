import type { TestCase, TestResult, TestStep } from "@playwright/test/reporter";
import { describe, expect, it } from "vitest";

import {
  buildCloakBrowserRawRun,
  countPlaywrightAssertions,
  journeyIdForTest,
  readJourneyObservation,
  type CapturedJourney,
} from "../../e2e/qualification-reporter";
import {
  REQUIRED_CLOAK_JOURNEY_IDS,
  REQUIRED_CLOAK_VIEWPORTS,
} from "../../../../scripts/submission-publication-evidence";

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
    viewport:
      REQUIRED_CLOAK_VIEWPORTS[index % REQUIRED_CLOAK_VIEWPORTS.length]!,
    consoleErrors: 0,
    failedRequests: 0,
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
    ).toBe(3);
  });

  it("accepts exactly one privacy-safe in-memory page observation", () => {
    const body = Buffer.from(
      JSON.stringify({
        schemaVersion: "1",
        authority: "CLOAK_CDP_ENDPOINT",
        viewport: { width: 1440, height: 900 },
        consoleErrors: 0,
        failedRequests: 0,
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
      schemaVersion: "1",
      authority: "CLOAK_CDP_ENDPOINT",
      viewport: { width: 1440, height: 900 },
      consoleErrors: 0,
      failedRequests: 0,
      expectedRequestFailuresMatched: true,
      browserVersion: "Chrome/140.0.0.0",
    });
  });

  it("rejects missing, path-based, duplicate, and over-disclosed observations", () => {
    const validBody = Buffer.from(
      JSON.stringify({
        schemaVersion: "1",
        authority: "CLOAK_CDP_ENDPOINT",
        viewport: { width: 1440, height: 900 },
        consoleErrors: 0,
        failedRequests: 0,
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
      startedAt: "2026-07-21T10:00:00.000Z",
    });

    expect(report.status).toBe("PASSED");
    expect(report.journeys).toHaveLength(40);
    expect(new Set(report.journeys.map((journey) => journey.viewport))).toEqual(
      new Set(REQUIRED_CLOAK_VIEWPORTS),
    );
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
        { ...journeys[0]!, consoleErrors: 1 },
        ...journeys.slice(1),
      ],
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
      name: "missing required viewport",
      mutate: (journeys: CapturedJourney[]) =>
        journeys.map((journey) =>
          journey.viewport === "768x1024"
            ? { ...journey, viewport: "1440x900" as const }
            : journey,
        ),
    },
  ])("fails closed for $name", ({ mutate }) => {
    const report = buildCloakBrowserRawRun({
      authority: "CLOAKBROWSER",
      baseUrl: "https://counterlab.cserules.workers.dev",
      completedAt: "2026-07-21T10:01:00.000Z",
      journeys: mutate(capturedJourneys()),
      playwrightStatus: "passed",
      qualificationRequested: true,
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
      startedAt: "2026-07-21T10:00:00.000Z",
    });

    expect(report.status).toBe("NON_QUALIFYING");
  });
});
