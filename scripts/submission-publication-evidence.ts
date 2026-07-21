import { inflateSync } from "node:zlib";

import { z } from "zod";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/u);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/u);
const ImageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const WorkerVersionSchema = z
  .string()
  .regex(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/u);

export const PublicationReleaseBindingSchema = z
  .object({
    deploymentReceiptSha256: Sha256Schema,
    productionOrigin: z.literal("https://counterlab.cserules.workers.dev"),
    workerEvidenceCommit: GitCommitSchema,
    runnerSourceCommit: GitCommitSchema,
    containerImageDigest: ImageDigestSchema,
    workerVersionId: WorkerVersionSchema,
  })
  .strict();

const PublicationPrivacySchema = z
  .object({
    containsSecrets: z.literal(false),
    containsRawNotebook: z.literal(false),
    containsPersonalData: z.literal(false),
  })
  .strict();

const baseReceiptShape = {
  schemaVersion: z.literal("1"),
  status: z.literal("VERIFIED"),
  checkedAt: z.iso.datetime({ offset: true }),
  release: PublicationReleaseBindingSchema,
  privacy: PublicationPrivacySchema,
} as const;

export const RepositoryAccessReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("repository-access"),
    repositoryUrl: z.url({ protocol: /^https$/u }),
    accessMode: z.enum(["PUBLIC", "PRIVATE_SHARED"]),
    loggedOutChecked: z.literal(true),
    loggedOutStatusCode: z.union([
      z.literal(200),
      z.literal(401),
      z.literal(403),
      z.literal(404),
    ]),
    authenticatedJudgeStatusCode: z.literal(200),
    finalUrl: z.url({ protocol: /^https$/u }),
    anonymousAccessible: z.boolean(),
    judgeAccessVerified: z.boolean(),
    sharedJudgeAddresses: z.array(z.email()).max(2),
  })
  .strict();

export const VideoVerificationReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("video-verification"),
    publicUrl: z.url({ protocol: /^https$/u }),
    durationSeconds: z.number().positive().max(180),
    audioPresent: z.literal(true),
    codexRoleCovered: z.literal(true),
    gpt56RoleCovered: z.literal(true),
    loggedOutPlayable: z.literal(true),
    statusCode: z.literal(200),
    scriptSha256: Sha256Schema,
    captionsSha256: Sha256Schema,
  })
  .strict();

export const FeedbackSessionReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("feedback-session"),
    sessionId: z.uuid(),
    source: z.literal("codex-feedback"),
    verifiedByOwner: z.literal(true),
    contentCaptured: z.literal(false),
  })
  .strict();

export const CloakJourneySchema = z
  .object({
    id: z.string().trim().min(1).max(512),
    status: z.literal("PASSED"),
    attempt: z.literal(0),
    durationMs: z.number().int().positive(),
    viewport: z.enum([
      "375x812",
      "390x844",
      "768x1024",
      "1280x720",
      "1366x768",
      "1440x900",
      "1920x1080",
    ]),
    evidenceSha256: Sha256Schema,
  })
  .strict();

export const CloakJourneyEvidenceReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("cloakbrowser-journey-evidence"),
    authority: z.literal("CLOAKBROWSER"),
    id: z.string().trim().min(1).max(512),
    viewport: z.enum([
      "375x812",
      "390x844",
      "768x1024",
      "1280x720",
      "1366x768",
      "1440x900",
      "1920x1080",
    ]),
    journeyStatus: z.literal("PASSED"),
    attempt: z.literal(0),
    durationMs: z.number().int().positive(),
    assertionCount: z.number().int().positive(),
    consoleErrors: z.literal(0),
    failedRequests: z.literal(0),
  })
  .strict();

export const REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS = [
  "keyboard",
  "screenReaderNames",
  "reducedMotion",
  "noHorizontalOverflow",
  "zoom200",
  "longContent",
  "narrowVisualizations",
  "touchTargets",
  "consoleAndNetwork",
  "webVitals",
] as const;

export const CloakManualEvidenceReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("cloakbrowser-manual-evidence"),
    authority: z.literal("CLOAKBROWSER"),
    check: z.enum(REQUIRED_CLOAK_MANUAL_EVIDENCE_KEYS),
    observationCount: z.number().int().positive(),
    artifactSha256: Sha256Schema,
  })
  .strict();

const REQUIRED_CLOAK_VIEWPORTS = [
  "375x812",
  "390x844",
  "768x1024",
  "1280x720",
  "1366x768",
  "1440x900",
  "1920x1080",
] as const;

export const REQUIRED_CLOAK_JOURNEY_IDS = [
  "judged-flow::production release transport::Loaded public release routes and assets retain security headers and contain no secrets",
  "judged-flow::desktop Landing keeps the unprimed Question and fair-test promise in the first viewport",
  "judged-flow::desktop Judge Mode shows the honest fixed-sample belief break in the first viewport",
  "judged-flow::desktop sample remains unprimed before Prediction and mounts the trusted mechanism only after sealing",
  "judged-flow::mobile Landing keeps the unprimed Question and fair-test promise in the first viewport",
  "judged-flow::mobile Judge Mode shows the honest fixed-sample belief break in the first viewport",
  "judged-flow::mobile sample remains unprimed before Prediction and mounts the trusted mechanism only after sealing",
  "judged-flow::Judge Mode distinguishes every authority path",
  "judged-flow::the first visit explains the lesson before asking for technical knowledge",
  "judged-flow::wide desktop keeps the question and canonical progress accessible",
  "judged-flow::compact desktop keeps the question and canonical progress accessible",
  "judged-flow::mobile keeps the question and canonical progress accessible",
  "judged-flow::Try Instantly persists the verified learning loop and exports a valid proof",
  "judged-flow::the lesson keeps one learner decision in focus at a time",
  "judged-flow::prediction is immutable and results do not exist before commitment",
  "judged-flow::the fixed sample keeps approved framing and can return home",
  "judged-flow::refresh restores the question and confirmed Prediction phases",
  "judged-flow::refresh restores the current lesson and the committed prediction",
  "judged-flow::a rejected test releases no result and remains recoverable after refresh",
  "judged-flow::local hints and Theater views never request a model or new result",
  "judged-flow::completed lesson steps open as read-only pages",
  "judged-flow::failed transfer keeps the patch locked and a corrected answer unlocks it",
  "judged-flow::Replay remains visibly labelled and read-only after refresh",
  "judged-flow::missing live capabilities are stated without claiming a model call",
  "judged-flow::configured reasoning cannot start without a qualified hosted runner",
  "judged-flow::partial generation isolation cannot expose live notebook upload",
  "judged-flow::unsupported notebooks are parsed without execution and cannot advance",
  "judged-flow::the judged path is keyboard operable with reduced motion",
  "judged-flow::a configured hosted runner completes an untouched leakage notebook",
  "judged-flow::a configured hosted runner completes an untouched class-imbalance notebook",
  "mobile-public-replay::public mobile replay routing::390x844 opens the replay deep link read-only without root overflow",
  "mobile-public-replay::public mobile replay routing::375x812 preserves replay authority through browser back and forward",
  "recovery-and-intake::Reject preserves the claim and resubmits only in a fresh session",
  "recovery-and-intake::Not enough evidence preserves the claim and resubmits only in a fresh session",
  "recovery-and-intake::live intake cannot continue without an uploaded supported artifact",
  "recovery-and-intake::malformed live upload remains at intake and creates no session",
  "recovery-and-intake::unsupported live upload is refused without creating a session",
  "recovery-and-intake::a supported live upload creates one source-bound session",
  "recovery-and-intake::an interrupted upload accepts the same file on retry",
  "recovery-and-intake::a lost private-session response retries without re-uploading",
] as const;

function addCloakJourneyIssues(
  journeys: readonly z.infer<typeof CloakJourneySchema>[],
  context: z.RefinementCtx,
): void {
  const identifiers = journeys.map((journey) => journey.id);
  if (new Set(identifiers).size !== identifiers.length) {
    context.addIssue({
      code: "custom",
      path: ["journeys"],
      message: "journey identifiers must be unique",
    });
  }
  if (
    JSON.stringify([...identifiers].sort()) !==
    JSON.stringify([...REQUIRED_CLOAK_JOURNEY_IDS].sort())
  ) {
    context.addIssue({
      code: "custom",
      path: ["journeys"],
      message: "journey identifiers do not match the required registry",
    });
  }
  const observedViewports = new Set(
    journeys.map((journey) => journey.viewport),
  );
  if (
    REQUIRED_CLOAK_VIEWPORTS.some(
      (viewport) => !observedViewports.has(viewport),
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["journeys"],
      message: "journey evidence does not cover every required viewport",
    });
  }
  const evidenceHashes = journeys.map((journey) => journey.evidenceSha256);
  if (new Set(evidenceHashes).size !== evidenceHashes.length) {
    context.addIssue({
      code: "custom",
      path: ["journeys"],
      message: "journey evidence hashes must be unique",
    });
  }
}

export const CloakBrowserExecutionReportSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("cloakbrowser-execution-report"),
    status: z.literal("PASSED"),
    checkedAt: z.iso.datetime({ offset: true }),
    authority: z.literal("CLOAKBROWSER"),
    baseUrl: z.literal("https://counterlab.cserules.workers.dev"),
    release: PublicationReleaseBindingSchema,
    privacy: PublicationPrivacySchema,
    browserVersion: z.string().trim().min(1).max(128),
    playwrightVersion: z.literal("1.61.1"),
    journeys: z.array(CloakJourneySchema).length(40),
    failures: z.literal(0),
    skips: z.literal(0),
    retries: z.literal(0),
    consoleErrors: z.literal(0),
    failedRequests: z.literal(0),
  })
  .strict()
  .superRefine((report, context) => {
    addCloakJourneyIssues(report.journeys, context);
  });

const ManualEvidenceSchema = z
  .object({
    status: z.literal("PASSED"),
    evidenceSha256: Sha256Schema,
  })
  .strict();

export const CloakBrowserEvidenceIndexSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("cloakbrowser-evidence-index"),
    status: z.literal("VERIFIED"),
    checkedAt: z.iso.datetime({ offset: true }),
    release: PublicationReleaseBindingSchema,
    privacy: PublicationPrivacySchema,
    executionReportSha256: Sha256Schema,
    manual: z
      .object({
        keyboard: ManualEvidenceSchema,
        screenReaderNames: ManualEvidenceSchema,
        reducedMotion: ManualEvidenceSchema,
        noHorizontalOverflow: ManualEvidenceSchema,
        zoom200: ManualEvidenceSchema,
        longContent: ManualEvidenceSchema,
        narrowVisualizations: ManualEvidenceSchema,
        touchTargets: ManualEvidenceSchema,
        consoleAndNetwork: ManualEvidenceSchema,
        webVitals: ManualEvidenceSchema,
      })
      .strict(),
  })
  .strict();

export const CloakBrowserQualificationReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("cloakbrowser-qualification"),
    authority: z.literal("CLOAKBROWSER"),
    baseUrl: z.literal("https://counterlab.cserules.workers.dev"),
    exactReleaseBound: z.literal(true),
    journeyCount: z.number().int().min(40),
    viewports: z.tuple([
      z.literal("375x812"),
      z.literal("390x844"),
      z.literal("768x1024"),
      z.literal("1280x720"),
      z.literal("1366x768"),
      z.literal("1440x900"),
      z.literal("1920x1080"),
    ]),
    browserVersion: z.string().trim().min(1).max(128),
    playwrightVersion: z.literal("1.61.1"),
    playwrightReportSha256: Sha256Schema,
    browserEvidenceIndexSha256: Sha256Schema,
    journeys: z.array(CloakJourneySchema).length(40),
    desktopComplete: z.literal(true),
    mobileComplete: z.literal(true),
    keyboardComplete: z.literal(true),
    screenReaderNamesComplete: z.literal(true),
    reducedMotionComplete: z.literal(true),
    noHorizontalOverflow: z.literal(true),
    zoom200Complete: z.literal(true),
    longContentComplete: z.literal(true),
    narrowVisualizationsComplete: z.literal(true),
    touchTargetsComplete: z.literal(true),
    requiredSkips: z.literal(0),
    failures: z.literal(0),
    consoleErrors: z.literal(0),
    failedRequests: z.literal(0),
    webVitals: z
      .object({
        lcpMs: z.number().nonnegative().max(2_500),
        cls: z.number().nonnegative().max(0.1),
        inpMs: z.number().nonnegative().max(200),
      })
      .strict(),
  })
  .strict()
  .superRefine((receipt, context) => {
    if (receipt.journeyCount !== receipt.journeys.length) {
      context.addIssue({
        code: "custom",
        path: ["journeyCount"],
        message: "journey count does not match journey evidence",
      });
    }
    addCloakJourneyIssues(receipt.journeys, context);
  });

const PublicLinkResultSchema = z
  .object({
    role: z.enum(["judge", "repository", "video", "devpost"]),
    url: z.url({ protocol: /^https$/u }),
    statusCode: z.literal(200),
    finalUrl: z.url({ protocol: /^https$/u }),
  })
  .strict();

export const PublicLinkAuditReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("public-link-audit"),
    loggedOut: z.literal(true),
    links: z.array(PublicLinkResultSchema).length(3),
  })
  .strict();

export const PostSubmitLinkAuditReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("post-submit-link-audit"),
    loggedOut: z.literal(true),
    links: z.array(PublicLinkResultSchema).length(4),
  })
  .strict();

export const ScreenshotProvenanceReceiptSchema = z
  .object({
    ...baseReceiptShape,
    kind: z.literal("screenshot-provenance"),
    fileName: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*\.png$/u),
    imageSha256: Sha256Schema,
    publicUrl: z.url({ protocol: /^https$/u }),
    route: z.string().regex(/^\/[A-Za-z0-9_./?=&%-]*$/u),
    viewport: z
      .object({
        width: z.number().int().positive().max(8_192),
        height: z.number().int().positive().max(8_192),
      })
      .strict(),
    capturedAt: z.iso.datetime({ offset: true }),
    authority: z.literal("CLOAKBROWSER"),
    consoleErrors: z.literal(0),
    failedRequests: z.literal(0),
    derivedFromSha256: Sha256Schema.nullable(),
  })
  .strict();

export const DevpostSubmissionReceiptSchema = z
  .object({
    schemaVersion: z.literal("1"),
    kind: z.literal("devpost-submission"),
    status: z.literal("SUBMITTED"),
    capturedAt: z.iso.datetime({ offset: true }),
    hackathonId: z.literal("30223"),
    projectId: z.literal("1330312"),
    category: z.literal("Education"),
    publicSlug: z.string().regex(/^[a-z0-9][a-z0-9-]{2,127}$/u),
    publicUrl: z.url({ protocol: /^https$/u }),
    submittedAt: z.iso.datetime({ offset: true }),
    release: PublicationReleaseBindingSchema,
    copy: z
      .object({
        devpostCopySha256: Sha256Schema,
        readmeSha256: Sha256Schema,
        videoScriptSha256: Sha256Schema,
        captionsSha256: Sha256Schema,
      })
      .strict(),
    privacy: PublicationPrivacySchema,
  })
  .strict();

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function pngCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function validPngBitDepth(bitDepth: number, colorType: number): boolean {
  const allowed = new Map<number, readonly number[]>([
    [0, [1, 2, 4, 8, 16]],
    [2, [8, 16]],
    [3, [1, 2, 4, 8]],
    [4, [8, 16]],
    [6, [8, 16]],
  ]);
  return allowed.get(colorType)?.includes(bitDepth) ?? false;
}

function joinPngBytes(parts: readonly Uint8Array[]): Uint8Array {
  const joined = new Uint8Array(
    parts.reduce((total, part) => total + part.byteLength, 0),
  );
  let offset = 0;
  for (const part of parts) {
    joined.set(part, offset);
    offset += part.byteLength;
  }
  return joined;
}

export function readPngDimensions(bytes: Uint8Array): {
  width: number;
  height: number;
} {
  if (
    bytes.byteLength < 33 ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value)
  ) {
    throw new Error("image is not a PNG");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("ascii", { fatal: true });
  let offset: number = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let bitDepth = -1;
  let colorType = -1;
  let sawHeader = false;
  let sawPalette = false;
  let sawImageData = false;
  let leftImageData = false;
  let sawEnd = false;
  const imageData: Uint8Array[] = [];
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 12) {
      throw new Error("PNG contains a truncated chunk");
    }
    const chunkLength = view.getUint32(offset, false);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    const chunkEnd = dataEnd + 4;
    if (dataEnd < dataStart || chunkEnd > bytes.byteLength) {
      throw new Error("PNG chunk length is invalid");
    }
    const chunkTypeBytes = bytes.subarray(offset + 4, offset + 8);
    const chunkType = decoder.decode(chunkTypeBytes);
    const expectedCrc = view.getUint32(dataEnd, false);
    const crcInput = bytes.subarray(offset + 4, dataEnd);
    if (pngCrc32(crcInput) !== expectedCrc) {
      throw new Error(`PNG ${chunkType} checksum is invalid`);
    }

    if (!sawHeader) {
      if (chunkType !== "IHDR" || chunkLength !== 13) {
        throw new Error("PNG does not begin with a valid IHDR");
      }
      width = view.getUint32(dataStart, false);
      height = view.getUint32(dataStart + 4, false);
      bitDepth = bytes[dataStart + 8]!;
      colorType = bytes[dataStart + 9]!;
      const compression = bytes[dataStart + 10]!;
      const filtering = bytes[dataStart + 11]!;
      const interlace = bytes[dataStart + 12]!;
      if (
        width === 0 ||
        height === 0 ||
        !validPngBitDepth(bitDepth, colorType) ||
        compression !== 0 ||
        filtering !== 0 ||
        interlace !== 0
      ) {
        throw new Error("PNG IHDR fields are invalid");
      }
      sawHeader = true;
    } else if (chunkType === "IHDR") {
      throw new Error("PNG contains more than one IHDR");
    } else if (chunkType === "PLTE") {
      if (
        sawPalette ||
        sawImageData ||
        chunkLength === 0 ||
        chunkLength > 768 ||
        chunkLength % 3 !== 0 ||
        colorType === 0 ||
        colorType === 4
      ) {
        throw new Error("PNG palette placement is invalid");
      }
      sawPalette = true;
    } else if (chunkType === "IDAT") {
      if (leftImageData || chunkLength === 0) {
        throw new Error("PNG image data is invalid");
      }
      sawImageData = true;
      imageData.push(bytes.subarray(dataStart, dataEnd));
    } else if (chunkType === "IEND") {
      if (
        chunkLength !== 0 ||
        !sawImageData ||
        (colorType === 3 && !sawPalette) ||
        chunkEnd !== bytes.byteLength
      ) {
        throw new Error("PNG end chunk is invalid");
      }
      sawEnd = true;
    } else {
      if (sawImageData) leftImageData = true;
      const critical = chunkTypeBytes[0]! >= 65 && chunkTypeBytes[0]! <= 90;
      if (critical)
        throw new Error(`PNG contains unknown critical chunk ${chunkType}`);
    }
    offset = chunkEnd;
    if (sawEnd) break;
  }
  if (!sawHeader || !sawImageData || !sawEnd) {
    throw new Error("PNG is missing required chunks");
  }
  const channels = new Map([
    [0, 1],
    [2, 3],
    [3, 1],
    [4, 2],
    [6, 4],
  ]).get(colorType);
  if (channels === undefined) throw new Error("PNG color type is invalid");
  const rowBytes = Math.ceil((width * channels * bitDepth) / 8);
  const decodedBytes = (rowBytes + 1) * height;
  if (
    !Number.isSafeInteger(decodedBytes) ||
    decodedBytes > 128 * 1_024 * 1_024
  ) {
    throw new Error("PNG decoded image exceeds its size limit");
  }
  let decoded: Uint8Array;
  try {
    decoded = new Uint8Array(
      inflateSync(joinPngBytes(imageData), {
        maxOutputLength: decodedBytes + 1,
      }),
    );
  } catch {
    throw new Error("PNG image data cannot be decoded");
  }
  if (decoded.byteLength !== decodedBytes) {
    throw new Error("PNG decoded image length is invalid");
  }
  for (let row = 0; row < height; row += 1) {
    if (decoded[row * (rowBytes + 1)]! > 4) {
      throw new Error("PNG contains an invalid row filter");
    }
  }
  return { width, height };
}
