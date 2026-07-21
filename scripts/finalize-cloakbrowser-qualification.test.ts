import { createHash } from "node:crypto";
import { lstat, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { canonicalJson } from "../packages/session-core/src/index.js";

import {
  CloakBrowserExecutionReportSchema,
  CloakBrowserQualificationReceiptSchema,
  CloakManualEvidenceReceiptSchema,
  REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID,
  REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID,
  REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID,
  REQUIRED_CLOAK_JOURNEY_IDS,
  REQUIRED_CLOAK_MANUAL_CRITERIA,
  REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS,
} from "./submission-publication-evidence.js";
import {
  buildCloakBrowserQualification,
  CloakManualObservationManifestSchema,
  writeQualificationFiles,
} from "./finalize-cloakbrowser-qualification.js";

const deployedAt = "2026-07-21T10:00:00.000Z";
const startedAt = "2026-07-21T10:01:00.000Z";
const completedAt = "2026-07-21T10:05:00.000Z";
const checkedAt = "2026-07-21T10:06:00.000Z";
const release = {
  deploymentReceiptSha256: "a".repeat(64),
  productionOrigin: "https://counterlab.cserules.workers.dev",
  workerEvidenceCommit: "b".repeat(40),
  runnerSourceCommit: "c".repeat(40),
  containerImageDigest: `sha256:${"d".repeat(64)}`,
  workerVersionId: "12345678-1234-1234-1234-123456789abc",
} as const;
const browserVersion = "CloakBrowser Chromium 150.0.0.0";

function canonicalSha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function byteSha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writerFixture(label: string) {
  const repositoryRoot = resolve(
    process.cwd(),
    "node_modules/.cache/counterlab-v6.1",
    `qualification-writer-${label}-${Date.now()}-${process.pid}`,
  );
  await mkdir(resolve(repositoryRoot, "docs"), {
    mode: 0o700,
    recursive: true,
  });
  const deploymentReceiptBytes = new TextEncoder().encode(
    `${JSON.stringify({ fixture: label })}\n`,
  );
  const outputRoot = resolve(
    repositoryRoot,
    "docs/submission-evidence",
    byteSha256(deploymentReceiptBytes),
  );
  const writerRelease = {
    ...release,
    deploymentReceiptSha256: byteSha256(deploymentReceiptBytes),
  };
  const rawRun = { ...validRawRun(), release: writerRelease };
  const rawRunCanonicalSha256 = canonicalSha256(rawRun);
  const manualManifest = validManualManifest();
  manualManifest.release = writerRelease;
  manualManifest.rawRunCanonicalSha256 = rawRunCanonicalSha256;
  manualManifest.observations = manualManifest.observations.map(
    (observation) => ({
      ...observation,
      release: writerRelease,
      rawRunCanonicalSha256,
    }),
  );
  const artifacts = buildCloakBrowserQualification({
    checkedAt,
    deployedAt,
    manualManifest,
    rawRun,
    release: writerRelease,
  });
  return { artifacts, deploymentReceiptBytes, outputRoot, repositoryRoot };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function validRawRun() {
  return {
    schemaVersion: "4",
    kind: "cloakbrowser-raw-run",
    status: "PASSED",
    authority: "CLOAKBROWSER",
    qualificationRequested: true,
    baseUrl: "https://counterlab.cserules.workers.dev",
    release,
    startedAt,
    completedAt,
    playwrightVersion: "1.61.1",
    playwrightStatus: "passed",
    rootErrors: 0,
    journeys: REQUIRED_CLOAK_JOURNEY_IDS.map((id, index) => {
      const expectedHttpErrors = REQUIRED_CLOAK_EXPECTED_HTTP_ERRORS_BY_ID[id];
      return {
        id,
        status: "passed",
        expectedStatus: "passed",
        attempt: 0,
        durationMs: 1_000 + index,
        assertionCount: 2,
        viewport: REQUIRED_CLOAK_JOURNEY_VIEWPORT_BY_ID[id],
        totalConsoleErrors: expectedHttpErrors.length,
        expectedHttpResourceConsoleErrors: expectedHttpErrors.length,
        unexpectedConsoleErrors: 0,
        expectedHttpErrorResponses: expectedHttpErrors,
        observedHttpErrorResponses: expectedHttpErrors,
        unexpectedHttpErrorResponses: 0,
        expectedRequestFailures:
          REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id],
        expectedFailedRequests:
          REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id].length,
        unexpectedFailedRequests: 0,
        observedRequestFailures:
          REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id],
        observedFailedRequests:
          REQUIRED_CLOAK_EXPECTED_REQUEST_FAILURES_BY_ID[id].length,
        browserVersion,
        browserAuthority: "CLOAK_CDP_ENDPOINT",
        telemetryValid: true,
      };
    }),
    privacy: {
      containsSecrets: false,
      containsRawNotebook: false,
      containsPersonalData: false,
    },
  };
}

function validManualManifest() {
  const rawRunCanonicalSha256 = canonicalSha256(validRawRun());
  return {
    schemaVersion: "1",
    kind: "cloakbrowser-manual-observation-manifest",
    authority: "HUMAN_OBSERVATION",
    browserAuthority: "CLOAKBROWSER",
    baseUrl: "https://counterlab.cserules.workers.dev",
    release,
    rawRunCanonicalSha256,
    browserVersion,
    observations: REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS.map((check) => ({
      schemaVersion: "1",
      kind: "cloakbrowser-manual-observation",
      status: "OBSERVED_PASS",
      authority: "HUMAN_OBSERVATION",
      browserAuthority: "CLOAKBROWSER",
      check,
      baseUrl: "https://counterlab.cserules.workers.dev",
      release,
      rawRunCanonicalSha256,
      browserVersion,
      observedAt: "2026-07-21T10:05:30.000Z",
      observationCount: REQUIRED_CLOAK_MANUAL_CRITERIA[check].length,
      criteria: REQUIRED_CLOAK_MANUAL_CRITERIA[check].map((id) => ({
        status: "PASSED",
        observationCount: 1,
        id,
      })),
      webVitals:
        check === "webVitals"
          ? { status: "measured", lcpMs: 1_200, cls: 0.02, inpMs: 90 }
          : null,
      privacy: {
        containsSecrets: false,
        containsRawNotebook: false,
        containsPersonalData: false,
      },
    })),
    privacy: {
      containsSecrets: false,
      containsRawNotebook: false,
      containsPersonalData: false,
    },
  };
}

function parseGenerated(
  built: ReturnType<typeof buildCloakBrowserQualification>,
  path: string,
): unknown {
  const file = built.files.find((entry) => entry.relativePath === path);
  expect(file, path).toBeDefined();
  return JSON.parse(new TextDecoder().decode(file!.bytes));
}

describe("CloakBrowser qualification finalizer", () => {
  it("builds the exact deterministic 53-file browser evidence chain", () => {
    const input = {
      checkedAt,
      deployedAt,
      manualManifest: validManualManifest(),
      rawRun: validRawRun(),
      release,
    };
    const first = buildCloakBrowserQualification(input);
    const second = buildCloakBrowserQualification(input);

    expect(first.files).toHaveLength(53);
    expect(first.files.map((file) => file.relativePath)).toEqual(
      second.files.map((file) => file.relativePath),
    );
    expect(first.files.map((file) => file.sha256)).toEqual(
      second.files.map((file) => file.sha256),
    );
    expect(first.files[0]?.relativePath).toBe("cloakbrowser-journeys/01.json");
    expect(first.files[39]?.relativePath).toBe("cloakbrowser-journeys/40.json");
    expect(first.files.at(-1)?.relativePath).toBe(
      "cloakbrowser-qualification.json",
    );
    const report = CloakBrowserExecutionReportSchema.parse(
      parseGenerated(first, "cloakbrowser-playwright-report.json"),
    );
    expect(report.rawRun.status).toBe("PASSED");
    expect(report.schemaVersion).toBe("3");
    expect(report).toMatchObject({
      totalConsoleErrors: 2,
      expectedHttpResourceConsoleErrors: 2,
      unexpectedConsoleErrors: 0,
      expectedHttpErrorResponses: 2,
      observedHttpErrorResponses: 2,
      unexpectedHttpErrorResponses: 0,
      unexpectedFailedRequests: 0,
    });
    const qualification = CloakBrowserQualificationReceiptSchema.parse(
      parseGenerated(first, "cloakbrowser-qualification.json"),
    );
    expect(qualification.webVitals).toEqual({
      lcpMs: 1_200,
      cls: 0.02,
      inpMs: 90,
    });
    expect(qualification).toMatchObject({
      totalConsoleErrors: 2,
      expectedHttpResourceConsoleErrors: 2,
      unexpectedConsoleErrors: 0,
      expectedHttpErrorResponses: 2,
      observedHttpErrorResponses: 2,
      unexpectedHttpErrorResponses: 0,
      unexpectedFailedRequests: 0,
    });
    expect(
      CloakManualEvidenceReceiptSchema.parse(
        parseGenerated(first, "cloakbrowser-manual/webVitals.json"),
      ).artifact.webVitals?.status,
    ).toBe("measured");
  });

  it("rejects a missing or reordered manual observation", () => {
    const missing = validManualManifest();
    missing.observations = missing.observations.slice(1);
    expect(() => CloakManualObservationManifestSchema.parse(missing)).toThrow();

    const reordered = validManualManifest();
    reordered.observations = [
      reordered.observations[1]!,
      reordered.observations[0]!,
      ...reordered.observations.slice(2),
    ];
    expect(() => CloakManualObservationManifestSchema.parse(reordered)).toThrow(
      /ordered registry/i,
    );
  });

  it("rejects unmeasured or over-budget INP", () => {
    const manifest = validManualManifest();
    const webVitals = manifest.observations.find(
      (observation) => observation.check === "webVitals",
    )!;
    webVitals.webVitals = {
      status: "measured",
      lcpMs: 1_200,
      cls: 0.02,
      inpMs: 201,
    };
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt,
        deployedAt,
        manualManifest: manifest,
        rawRun: validRawRun(),
        release,
      }),
    ).toThrow();
  });

  it("rejects swapped journey viewports and dishonest PASSED status", () => {
    const raw = validRawRun();
    const firstDesktop = raw.journeys.findIndex(
      (journey) => journey.viewport === "1440x900",
    );
    const firstMobile = raw.journeys.findIndex(
      (journey) => journey.viewport === "390x844",
    );
    raw.journeys[firstDesktop]!.viewport = "390x844";
    raw.journeys[firstMobile]!.viewport = "1440x900";
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt,
        deployedAt,
        manualManifest: validManualManifest(),
        rawRun: raw,
        release,
      }),
    ).toThrow(/status does not match/i);
  });

  it("rejects missing, duplicate, and misattributed expected HTTP evidence", () => {
    const missing = validRawRun();
    const expectedIndex = missing.journeys.findIndex(
      (journey) => journey.expectedHttpErrorResponses.length === 1,
    );
    missing.journeys[expectedIndex]!.observedHttpErrorResponses = [];
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt,
        deployedAt,
        manualManifest: validManualManifest(),
        rawRun: missing,
        release,
      }),
    ).toThrow();

    const duplicate = validRawRun();
    const duplicateJourney = duplicate.journeys[expectedIndex]!;
    duplicateJourney.observedHttpErrorResponses = [
      ...duplicateJourney.expectedHttpErrorResponses,
      ...duplicateJourney.expectedHttpErrorResponses,
    ];
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt,
        deployedAt,
        manualManifest: validManualManifest(),
        rawRun: duplicate,
        release,
      }),
    ).toThrow();

    const misattributed = validRawRun();
    misattributed.journeys[expectedIndex]!.expectedHttpResourceConsoleErrors =
      2;
    misattributed.journeys[expectedIndex]!.totalConsoleErrors = 2;
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt,
        deployedAt,
        manualManifest: validManualManifest(),
        rawRun: misattributed,
        release,
      }),
    ).toThrow(/console error counts/i);
  });

  it("rejects observations before deployment or after finalization", () => {
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt: "2026-07-21T10:04:59.000Z",
        deployedAt,
        manualManifest: validManualManifest(),
        rawRun: validRawRun(),
        release,
      }),
    ).toThrow(/follow deployment and precede finalization/i);

    const manual = validManualManifest();
    manual.observations[0]!.observedAt = "2026-07-21T09:59:59.000Z";
    expect(() =>
      buildCloakBrowserQualification({
        checkedAt,
        deployedAt,
        manualManifest: manual,
        rawRun: validRawRun(),
        release,
      }),
    ).toThrow(/follow deployment and precede finalization/i);
  });

  it("detects tampering in embedded raw and manual evidence", () => {
    const built = buildCloakBrowserQualification({
      checkedAt,
      deployedAt,
      manualManifest: validManualManifest(),
      rawRun: validRawRun(),
      release,
    });
    const report = parseGenerated(
      built,
      "cloakbrowser-playwright-report.json",
    ) as Record<string, unknown>;
    report.rawRunCanonicalSha256 = "e".repeat(64);
    expect(() => CloakBrowserExecutionReportSchema.parse(report)).toThrow(
      /hash does not match/i,
    );

    const aggregate = parseGenerated(
      built,
      "cloakbrowser-playwright-report.json",
    ) as Record<string, unknown>;
    aggregate.totalConsoleErrors = 1;
    expect(() => CloakBrowserExecutionReportSchema.parse(aggregate)).toThrow(
      /error totals/i,
    );

    const qualification = parseGenerated(
      built,
      "cloakbrowser-qualification.json",
    ) as Record<string, unknown>;
    qualification.totalConsoleErrors = 1;
    expect(() =>
      CloakBrowserQualificationReceiptSchema.parse(qualification),
    ).toThrow(/error totals/i);

    const manual = parseGenerated(
      built,
      "cloakbrowser-manual/keyboard.json",
    ) as Record<string, unknown>;
    manual.artifactSha256 = "f".repeat(64);
    expect(() => CloakManualEvidenceReceiptSchema.parse(manual)).toThrow(
      /hash does not match/i,
    );
  });

  it("publishes a complete release once and refuses replacement", async () => {
    const fixture = await writerFixture("complete");
    await writeQualificationFiles(fixture);

    await expect(
      readFile(resolve(fixture.outputRoot, "deployment-receipt.json")),
    ).resolves.toEqual(Buffer.from(fixture.deploymentReceiptBytes));
    for (const artifact of fixture.artifacts.files) {
      await expect(
        readFile(resolve(fixture.outputRoot, artifact.relativePath)),
      ).resolves.toEqual(Buffer.from(artifact.bytes));
    }
    await expect(
      readFile(
        resolve(fixture.outputRoot, ".publication-reservation.json"),
        "utf8",
      ),
    ).resolves.toContain(byteSha256(fixture.deploymentReceiptBytes));
    await expect(writeQualificationFiles(fixture)).rejects.toThrow(
      /refusing to replace/i,
    );
  });

  it("rejects a wrong output root before publishing", async () => {
    const fixture = await writerFixture("wrong-root");
    await expect(
      writeQualificationFiles({
        ...fixture,
        outputRoot: resolve(
          fixture.repositoryRoot,
          "docs/submission-evidence/wrong",
        ),
      }),
    ).rejects.toThrow(/deployment-receipt hash directory/i);
    await expect(pathExists(fixture.outputRoot)).resolves.toBe(false);
  });

  it("leaves the final root absent when staged bytes fail verification", async () => {
    const fixture = await writerFixture("bad-hash");
    const [first, ...rest] = fixture.artifacts.files;
    if (first === undefined) throw new Error("missing generated fixture");
    await expect(
      writeQualificationFiles({
        ...fixture,
        artifacts: {
          ...fixture.artifacts,
          files: [{ ...first, sha256: "f".repeat(64) }, ...rest],
        },
      }),
    ).rejects.toThrow(/failed its hash check/i);
    await expect(pathExists(fixture.outputRoot)).resolves.toBe(false);
  });
});
