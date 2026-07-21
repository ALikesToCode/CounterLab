import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, open, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { canonicalJson } from "../packages/session-core/src/index.js";
import { DeploymentReceiptV7Schema } from "../packages/scientific-engine-registry/src/index.js";
import {
  CloakBrowserEvidenceIndexSchema,
  CloakBrowserExecutionReportSchema,
  CloakBrowserQualificationReceiptSchema,
  CloakBrowserRawRunSchema,
  CloakJourneyEvidenceReceiptSchema,
  CloakManualEvidenceReceiptSchema,
  CloakManualObservationArtifactSchema,
  PublicationReleaseBindingSchema,
  REQUIRED_CLOAK_JOURNEY_IDS,
  REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS,
  REQUIRED_CLOAK_VIEWPORTS,
} from "./submission-publication-evidence.js";
import {
  containedDirectory,
  containedInputFile,
  containedNewOutputDirectory,
  containedNewOutputFile,
  parseStrictNameValueArgs,
} from "./repository-cli-paths.js";

const CheckedAtSchema = z.iso.datetime({ offset: true });
const MAX_INPUT_BYTES = 5 * 1_024 * 1_024;

const privacy = {
  containsSecrets: false,
  containsRawNotebook: false,
  containsPersonalData: false,
} as const;
const PrivacySchema = z
  .object({
    containsSecrets: z.literal(false),
    containsRawNotebook: z.literal(false),
    containsPersonalData: z.literal(false),
  })
  .strict();

export const CloakManualObservationManifestSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("cloakbrowser-manual-observation-manifest"),
    authority: z.literal("HUMAN_OBSERVATION"),
    browserAuthority: z.literal("CLOAKBROWSER"),
    baseUrl: z.literal("https://counterlab.cserules.workers.dev"),
    release: PublicationReleaseBindingSchema,
    rawRunCanonicalSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    browserVersion: z.string().trim().min(1).max(128),
    observations: z
      .array(CloakManualObservationArtifactSchema)
      .length(REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS.length),
    privacy: PrivacySchema,
  })
  .strict()
  .superRefine((manifest, context) => {
    if (
      JSON.stringify(manifest.observations.map((entry) => entry.check)) !==
      JSON.stringify(REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS)
    ) {
      context.addIssue({
        code: "custom",
        path: ["observations"],
        message: "manual observations must match the exact ordered registry",
      });
    }
    for (const [index, observation] of manifest.observations.entries()) {
      if (
        observation.baseUrl !== manifest.baseUrl ||
        canonicalJson(observation.release) !==
          canonicalJson(manifest.release) ||
        observation.rawRunCanonicalSha256 !== manifest.rawRunCanonicalSha256 ||
        observation.browserVersion !== manifest.browserVersion
      ) {
        context.addIssue({
          code: "custom",
          path: ["observations", index],
          message: "manual observation does not match its run binding",
        });
      }
    }
  });

export interface GeneratedQualificationFile {
  relativePath: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface BuiltCloakBrowserQualification {
  files: readonly GeneratedQualificationFile[];
  qualification: z.infer<typeof CloakBrowserQualificationReceiptSchema>;
}

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function jsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`);
}

function generatedFile(
  relativePath: string,
  value: unknown,
): GeneratedQualificationFile {
  const bytes = jsonBytes(value);
  return { relativePath, bytes, sha256: sha256(bytes) };
}

function assertTimestampOrder(input: {
  checkedAt: string;
  deployedAt: string;
  rawStartedAt: string;
  rawCompletedAt: string;
  manualObservedAt: readonly string[];
}): void {
  const checkedAt = Date.parse(input.checkedAt);
  const deployedAt = Date.parse(input.deployedAt);
  const rawStartedAt = Date.parse(input.rawStartedAt);
  const rawCompletedAt = Date.parse(input.rawCompletedAt);
  if (
    rawStartedAt < deployedAt ||
    rawCompletedAt < rawStartedAt ||
    rawCompletedAt > checkedAt ||
    input.manualObservedAt.some((observedAt) => {
      const observed = Date.parse(observedAt);
      return observed < deployedAt || observed > checkedAt;
    })
  ) {
    throw new Error(
      "CloakBrowser observations must follow deployment and precede finalization",
    );
  }
}

export function buildCloakBrowserQualification(input: {
  checkedAt: string;
  deployedAt: string;
  manualManifest: unknown;
  rawRun: unknown;
  release: unknown;
}): BuiltCloakBrowserQualification {
  const checkedAt = CheckedAtSchema.parse(input.checkedAt);
  const release = PublicationReleaseBindingSchema.parse(input.release);
  const rawRun = CloakBrowserRawRunSchema.parse(input.rawRun);
  const manualManifest = CloakManualObservationManifestSchema.parse(
    input.manualManifest,
  );
  if (rawRun.status !== "PASSED") {
    throw new Error("Only an independently valid PASSED raw run can qualify");
  }
  if (canonicalJson(rawRun.release) !== canonicalJson(release)) {
    throw new Error(
      "Raw browser evidence does not match the deployment release",
    );
  }
  const rawRunCanonicalSha256 = sha256(canonicalJson(rawRun));
  const browserVersion = rawRun.journeys[0]!.browserVersion;
  const errorTotals = rawRun.journeys.reduce(
    (aggregate, journey) => ({
      totalConsoleErrors:
        aggregate.totalConsoleErrors + journey.totalConsoleErrors,
      expectedHttpResourceConsoleErrors:
        aggregate.expectedHttpResourceConsoleErrors +
        journey.expectedHttpResourceConsoleErrors,
      unexpectedConsoleErrors:
        aggregate.unexpectedConsoleErrors + journey.unexpectedConsoleErrors,
      expectedHttpErrorResponses:
        aggregate.expectedHttpErrorResponses +
        journey.expectedHttpErrorResponses.length,
      observedHttpErrorResponses:
        aggregate.observedHttpErrorResponses +
        journey.observedHttpErrorResponses.length,
      unexpectedHttpErrorResponses:
        aggregate.unexpectedHttpErrorResponses +
        journey.unexpectedHttpErrorResponses,
      unexpectedFailedRequests:
        aggregate.unexpectedFailedRequests + journey.unexpectedFailedRequests,
    }),
    {
      totalConsoleErrors: 0,
      expectedHttpResourceConsoleErrors: 0,
      unexpectedConsoleErrors: 0,
      expectedHttpErrorResponses: 0,
      observedHttpErrorResponses: 0,
      unexpectedHttpErrorResponses: 0,
      unexpectedFailedRequests: 0,
    },
  );
  if (
    manualManifest.baseUrl !== rawRun.baseUrl ||
    canonicalJson(manualManifest.release) !== canonicalJson(release) ||
    manualManifest.rawRunCanonicalSha256 !== rawRunCanonicalSha256 ||
    manualManifest.browserVersion !== browserVersion
  ) {
    throw new Error(
      "Manual browser observations do not match the exact raw release run",
    );
  }
  assertTimestampOrder({
    checkedAt,
    deployedAt: CheckedAtSchema.parse(input.deployedAt),
    rawStartedAt: rawRun.startedAt,
    rawCompletedAt: rawRun.completedAt,
    manualObservedAt: manualManifest.observations.map(
      (observation) => observation.observedAt,
    ),
  });

  const receiptBase = {
    schemaVersion: "1",
    status: "VERIFIED",
    checkedAt,
    release,
    privacy,
  } as const;
  const files: GeneratedQualificationFile[] = [];
  const journeys = rawRun.journeys.map((raw, index) => {
    const receipt = CloakJourneyEvidenceReceiptSchema.parse({
      ...receiptBase,
      kind: "cloakbrowser-journey-evidence",
      authority: "CLOAKBROWSER",
      id: raw.id,
      viewport: raw.viewport,
      journeyStatus: "PASSED",
      attempt: 0,
      durationMs: raw.durationMs,
      assertionCount: raw.assertionCount,
      totalConsoleErrors: raw.totalConsoleErrors,
      expectedHttpResourceConsoleErrors: raw.expectedHttpResourceConsoleErrors,
      unexpectedConsoleErrors: raw.unexpectedConsoleErrors,
      expectedHttpErrorResponses: raw.expectedHttpErrorResponses,
      observedHttpErrorResponses: raw.observedHttpErrorResponses,
      unexpectedHttpErrorResponses: raw.unexpectedHttpErrorResponses,
      unexpectedFailedRequests: raw.unexpectedFailedRequests,
    });
    const file = generatedFile(
      `cloakbrowser-journeys/${String(index + 1).padStart(2, "0")}.json`,
      receipt,
    );
    files.push(file);
    return {
      id: raw.id,
      status: "PASSED" as const,
      attempt: 0 as const,
      durationMs: raw.durationMs,
      viewport: raw.viewport,
      evidenceSha256: file.sha256,
    };
  });

  const executionReport = CloakBrowserExecutionReportSchema.parse({
    schemaVersion: "3",
    kind: "cloakbrowser-execution-report",
    status: "PASSED",
    checkedAt,
    authority: "CLOAKBROWSER",
    baseUrl: "https://counterlab.cserules.workers.dev",
    release,
    privacy,
    browserVersion,
    playwrightVersion: "1.61.1",
    rawRunCanonicalSha256,
    rawRun,
    journeys,
    failures: 0,
    skips: 0,
    retries: 0,
    ...errorTotals,
  });
  const executionReportFile = generatedFile(
    "cloakbrowser-playwright-report.json",
    executionReport,
  );
  files.push(executionReportFile);

  const manualReferences: Record<
    (typeof REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS)[number],
    { status: "PASSED"; evidenceSha256: string }
  > = Object.create(null) as Record<
    (typeof REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS)[number],
    { status: "PASSED"; evidenceSha256: string }
  >;
  for (const observation of manualManifest.observations) {
    const receipt = CloakManualEvidenceReceiptSchema.parse({
      ...receiptBase,
      schemaVersion: "2",
      kind: "cloakbrowser-manual-evidence",
      authority: "HUMAN_OBSERVATION",
      browserAuthority: "CLOAKBROWSER",
      check: observation.check,
      observationCount: observation.observationCount,
      artifactSha256: sha256(canonicalJson(observation)),
      artifact: observation,
    });
    const file = generatedFile(
      `cloakbrowser-manual/${observation.check}.json`,
      receipt,
    );
    files.push(file);
    manualReferences[observation.check] = {
      status: "PASSED",
      evidenceSha256: file.sha256,
    };
  }

  const evidenceIndex = CloakBrowserEvidenceIndexSchema.parse({
    ...receiptBase,
    kind: "cloakbrowser-evidence-index",
    executionReportSha256: executionReportFile.sha256,
    manual: manualReferences,
  });
  const evidenceIndexFile = generatedFile(
    "cloakbrowser-evidence-index.json",
    evidenceIndex,
  );
  files.push(evidenceIndexFile);

  const webVitals = manualManifest.observations.find(
    (observation) => observation.check === "webVitals",
  )!.webVitals!;
  const qualification = CloakBrowserQualificationReceiptSchema.parse({
    ...receiptBase,
    kind: "cloakbrowser-qualification",
    authority: "CLOAKBROWSER",
    baseUrl: "https://counterlab.cserules.workers.dev",
    exactReleaseBound: true,
    journeyCount: REQUIRED_CLOAK_JOURNEY_IDS.length,
    viewports: REQUIRED_CLOAK_VIEWPORTS,
    browserVersion,
    playwrightVersion: "1.61.1",
    playwrightReportSha256: executionReportFile.sha256,
    browserEvidenceIndexSha256: evidenceIndexFile.sha256,
    journeys,
    desktopComplete: true,
    mobileComplete: true,
    keyboardComplete: true,
    screenReaderNamesComplete: true,
    reducedMotionComplete: true,
    noHorizontalOverflow: true,
    zoom200Complete: true,
    longContentComplete: true,
    narrowVisualizationsComplete: true,
    touchTargetsComplete: true,
    requiredSkips: 0,
    failures: 0,
    ...errorTotals,
    webVitals: {
      lcpMs: webVitals.lcpMs,
      cls: webVitals.cls,
      inpMs: webVitals.inpMs,
    },
  });
  files.push(generatedFile("cloakbrowser-qualification.json", qualification));
  return { files, qualification };
}

async function boundedJsonFile(
  repositoryRoot: string,
  requested: string,
  label: string,
): Promise<{ bytes: Uint8Array; value: unknown }> {
  const path = await containedInputFile(repositoryRoot, requested, label);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || metadata.size > MAX_INPUT_BYTES) {
      throw new Error(
        `${label} exceeds the bounded input size or is not a file`,
      );
    }
    const bytes = await handle.readFile();
    try {
      return {
        bytes,
        value: JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(bytes),
        ),
      };
    } catch {
      throw new Error(`${label} is not valid UTF-8 JSON`);
    }
  } finally {
    await handle.close();
  }
}

async function ensureEvidenceParent(repositoryRoot: string): Promise<string> {
  const parent = resolve(repositoryRoot, "docs/submission-evidence");
  try {
    return await containedDirectory(
      repositoryRoot,
      parent,
      "submission evidence parent",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return containedNewOutputDirectory(
      repositoryRoot,
      parent,
      "submission evidence parent",
    );
  }
}

async function ensureContainedDirectory(
  repositoryRoot: string,
  directory: string,
  label: string,
): Promise<string> {
  try {
    return await containedDirectory(repositoryRoot, directory, label);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    return containedNewOutputDirectory(repositoryRoot, directory, label);
  }
}

async function assertPathAbsent(path: string, label: string): Promise<void> {
  try {
    await lstat(path);
    throw new Error(`${label} already exists; refusing to replace it`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

export async function writeQualificationFiles(input: {
  repositoryRoot: string;
  outputRoot: string;
  deploymentReceiptBytes: Uint8Array;
  artifacts: BuiltCloakBrowserQualification;
}): Promise<void> {
  const deploymentReceiptSha256 = sha256(input.deploymentReceiptBytes);
  if (
    input.artifacts.qualification.release.deploymentReceiptSha256 !==
    deploymentReceiptSha256
  ) {
    throw new Error(
      "qualification artifacts do not match the deployment receipt bytes",
    );
  }
  const evidenceParent = await ensureEvidenceParent(input.repositoryRoot);
  const expectedRoot = resolve(evidenceParent, deploymentReceiptSha256);
  if (resolve(input.outputRoot) !== expectedRoot) {
    throw new Error(
      "qualification output must use the deployment-receipt hash directory",
    );
  }
  await assertPathAbsent(expectedRoot, "CloakBrowser qualification output");
  const counterlabState = await ensureContainedDirectory(
    input.repositoryRoot,
    resolve(input.repositoryRoot, ".counterlab"),
    "CounterLab state directory",
  );
  const stagingParent = await ensureContainedDirectory(
    input.repositoryRoot,
    resolve(counterlabState, "qualification-staging"),
    "CloakBrowser qualification staging parent",
  );
  const reservationParent = await ensureContainedDirectory(
    input.repositoryRoot,
    resolve(counterlabState, "qualification-reservations"),
    "CloakBrowser qualification reservation parent",
  );
  const evidenceDevice = (await lstat(evidenceParent)).dev;
  if (
    (await lstat(stagingParent)).dev !== evidenceDevice ||
    (await lstat(reservationParent)).dev !== evidenceDevice
  ) {
    throw new Error(
      "qualification staging and reservation must share the evidence filesystem",
    );
  }
  const stagingRoot = await containedNewOutputDirectory(
    input.repositoryRoot,
    resolve(
      stagingParent,
      `.pending-${deploymentReceiptSha256.slice(0, 16)}-${randomUUID()}`,
    ),
    "CloakBrowser qualification staging output",
  );
  await containedNewOutputDirectory(
    input.repositoryRoot,
    resolve(stagingRoot, "cloakbrowser-journeys"),
    "CloakBrowser journey evidence directory",
  );
  await containedNewOutputDirectory(
    input.repositoryRoot,
    resolve(stagingRoot, "cloakbrowser-manual"),
    "CloakBrowser manual evidence directory",
  );
  const deploymentOutput = await containedNewOutputFile(
    input.repositoryRoot,
    resolve(stagingRoot, "deployment-receipt.json"),
    "deployment receipt copy",
  );
  await writeFile(deploymentOutput, input.deploymentReceiptBytes, {
    flag: "wx",
    mode: 0o600,
  });
  for (const artifact of input.artifacts.files) {
    const destination = resolve(stagingRoot, artifact.relativePath);
    const fromRoot = relative(stagingRoot, destination);
    if (
      fromRoot === "" ||
      fromRoot === ".." ||
      fromRoot.startsWith(`..${sep}`)
    ) {
      throw new Error("generated qualification path escaped its output root");
    }
    const output = await containedNewOutputFile(
      input.repositoryRoot,
      destination,
      `generated qualification file ${artifact.relativePath}`,
    );
    await writeFile(output, artifact.bytes, { flag: "wx", mode: 0o600 });
  }
  if (
    sha256(await readFile(deploymentOutput)) !==
    sha256(input.deploymentReceiptBytes)
  ) {
    throw new Error("staged deployment receipt failed its hash check");
  }
  for (const artifact of input.artifacts.files) {
    const staged = resolve(stagingRoot, artifact.relativePath);
    if (sha256(await readFile(staged)) !== artifact.sha256) {
      throw new Error(
        `staged qualification file failed its hash check: ${artifact.relativePath}`,
      );
    }
  }
  const reservation = await containedNewOutputFile(
    input.repositoryRoot,
    resolve(reservationParent, `${deploymentReceiptSha256}.json`),
    "CloakBrowser qualification publication reservation",
  );
  await writeFile(
    reservation,
    `${JSON.stringify({
      schemaVersion: "1",
      kind: "cloakbrowser-qualification-publication-reservation",
      deploymentReceiptSha256,
    })}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  await assertPathAbsent(expectedRoot, "CloakBrowser qualification output");
  await rename(stagingRoot, expectedRoot);
  const publishedReservation = await containedNewOutputFile(
    input.repositoryRoot,
    resolve(expectedRoot, ".publication-reservation.json"),
    "published CloakBrowser qualification reservation",
  );
  await rename(reservation, publishedReservation);
}

async function main(): Promise<void> {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const args = parseStrictNameValueArgs(
    process.argv.slice(2),
    new Set([
      "--raw-run",
      "--manual-manifest",
      "--deployment-receipt",
      "--output-root",
    ]),
  );
  if (args.size !== 4)
    throw new Error("qualification arguments are incomplete");
  const raw = await boundedJsonFile(
    repositoryRoot,
    args.get("--raw-run")!,
    "CloakBrowser raw run",
  );
  const manual = await boundedJsonFile(
    repositoryRoot,
    args.get("--manual-manifest")!,
    "CloakBrowser manual observation manifest",
  );
  const deployment = await boundedJsonFile(
    repositoryRoot,
    args.get("--deployment-receipt")!,
    "deployment receipt",
  );
  const parsedDeployment = DeploymentReceiptV7Schema.parse(deployment.value);
  const deploymentReceiptSha256 = sha256(deployment.bytes);
  const release = PublicationReleaseBindingSchema.parse({
    deploymentReceiptSha256,
    productionOrigin: parsedDeployment.productionOrigin,
    workerEvidenceCommit: parsedDeployment.workerEvidenceCommit,
    runnerSourceCommit: parsedDeployment.runnerSourceCommit,
    containerImageDigest: parsedDeployment.containerImageDigest,
    workerVersionId: parsedDeployment.workerVersionId,
  });
  const artifacts = buildCloakBrowserQualification({
    checkedAt: new Date().toISOString(),
    deployedAt: parsedDeployment.deployedAt,
    manualManifest: manual.value,
    rawRun: raw.value,
    release,
  });
  await writeQualificationFiles({
    repositoryRoot,
    outputRoot: resolve(repositoryRoot, args.get("--output-root")!),
    deploymentReceiptBytes: deployment.bytes,
    artifacts,
  });
  process.stdout.write(
    `${release.deploymentReceiptSha256} ${artifacts.files.length}\n`,
  );
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  await main();
}
