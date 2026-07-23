import { createHash } from "node:crypto";

import { z } from "zod";

import {
  ReviewedVulnerabilityExceptionSchema,
  VulnerabilityReportV2Schema,
  fingerprintFixableVulnerability,
  type VulnerabilityReportV2,
} from "./vulnerability.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ImageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const RepoDigestSchema = z.string().regex(/^[^@\s]+@sha256:[a-f0-9]{64}$/);
const Base64JsonSchema = z
  .string()
  .min(4)
  .max(4 * 1024 * 1024)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
const StableIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
const SeveritySchema = z.enum([
  "Critical",
  "High",
  "Medium",
  "Low",
  "Negligible",
  "Unknown",
]);
const severities = SeveritySchema.options;

const GrypeMatchSchema = z.object({
  vulnerability: z.object({
    id: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
    namespace: z.string().trim().min(1),
    severity: SeveritySchema,
    fix: z.object({
      state: z.string(),
      versions: z.array(z.string().trim().min(1)).default([]),
    }),
  }),
  artifact: z.object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1),
    version: z.string().trim().min(1),
    type: z.string().trim().min(1),
    purl: z.string().trim().min(1),
  }),
  appliedIgnoreRules: z
    .array(
      z.object({
        namespace: z.string().trim().min(1),
        "vex-status": z.string().trim().min(1).optional(),
      }),
    )
    .optional()
    .default([]),
});

export const GrypeJsonReportSchema = z.object({
  matches: z.array(GrypeMatchSchema),
  ignoredMatches: z.array(GrypeMatchSchema).optional().default([]),
  descriptor: z.object({
    name: z.literal("grype"),
    version: z.string().trim().min(1),
    timestamp: z.string().trim().min(1),
    db: z.object({
      status: z.object({
        schemaVersion: z.string().trim().min(1),
        built: z.string().trim().min(1),
        valid: z.boolean(),
      }),
    }),
  }),
  source: z.object({
    type: z.literal("image"),
    target: z.object({
      userInput: z.string().trim().min(1),
      imageID: ImageDigestSchema,
      manifestDigest: ImageDigestSchema,
      mediaType: z.string().trim().min(1),
      tags: z.array(z.string().trim().min(1)),
      repoDigests: z.array(RepoDigestSchema),
      architecture: z.string(),
      os: z.string(),
      labels: z.record(z.string(), z.string()),
      manifest: Base64JsonSchema,
      config: Base64JsonSchema,
    }),
  }),
});

export const GrypeImageBindingSchema = z.strictObject({
  imageDigest: ImageDigestSchema,
  manifestDigest: ImageDigestSchema.optional(),
});

export const GrypeOciArchiveBindingSchema = z.strictObject({
  normalizedUserInput: z
    .string()
    .regex(/^<COUNTERLAB_REPO_ROOT>\/[A-Za-z0-9._/-]+$/)
    .refine(
      (value) => !value.split("/").includes(".."),
      "normalized OCI input must not traverse a parent",
    ),
  imageDigest: ImageDigestSchema,
  manifestDigest: ImageDigestSchema,
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceTreeSha256: Sha256Schema,
  sourceUrl: z.literal("https://github.com/ALikesToCode/CounterLab"),
  platform: z.strictObject({
    architecture: z.literal("amd64"),
    os: z.literal("linux"),
  }),
});

export const GrypeLoadedImageBindingSchema = z.strictObject({
  imageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
  imageDigest: ImageDigestSchema,
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  sourceTreeSha256: Sha256Schema,
  sourceUrl: z.literal("https://github.com/ALikesToCode/CounterLab"),
  platform: z.strictObject({
    architecture: z.literal("amd64"),
    os: z.literal("linux"),
  }),
});

const ReviewedHighInputSchema = ReviewedVulnerabilityExceptionSchema.omit({
  severity: true,
  fingerprint: true,
});

export const GrypeSummaryOptionsSchema = z.strictObject({
  environmentId: StableIdSchema,
  environmentKind: z.enum(["local_candidate", "cloudflare_production"]),
  imageDigest: ImageDigestSchema,
  manifestDigest: ImageDigestSchema,
  rawScan: z.strictObject({
    evidenceId: StableIdSchema,
    sha256: Sha256Schema,
  }),
  scannerBinarySha256: Sha256Schema,
  reviewedHighExceptions: z.array(ReviewedHighInputSchema),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1),
});

export type GrypeJsonReport = z.infer<typeof GrypeJsonReportSchema>;
export type GrypeImageBinding = z.infer<typeof GrypeImageBindingSchema>;
export type GrypeOciArchiveBinding = z.infer<
  typeof GrypeOciArchiveBindingSchema
>;
export type GrypeLoadedImageBinding = z.infer<
  typeof GrypeLoadedImageBindingSchema
>;
export type GrypeSummaryOptions = z.infer<typeof GrypeSummaryOptionsSchema>;

const ScanEvidenceSchema = z.strictObject({
  evidenceId: StableIdSchema,
  sha256: Sha256Schema,
});

export const VexApplicationOptionsSchema = z.strictObject({
  imageDigest: ImageDigestSchema,
  manifestDigest: ImageDigestSchema,
  loadedImage: GrypeLoadedImageBindingSchema,
  scannerBinarySha256: Sha256Schema,
  vexSha256: Sha256Schema,
  inputs: z.strictObject({
    baseline: ScanEvidenceSchema,
    applied: ScanEvidenceSchema,
    negativeControl: ScanEvidenceSchema,
  }),
  expectedFinding: z.strictObject({
    id: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
    namespace: z.string().trim().min(1),
    package: z.string().trim().min(1),
    version: z.string().trim().min(1),
    artifactType: z.string().trim().min(1),
    purl: z.string().trim().min(1),
    fingerprint: Sha256Schema,
  }),
  negativeSubcomponent: z.string().trim().min(1),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1),
});

export const VexApplicationReportV1Schema = z.strictObject({
  schemaVersion: z.literal("1"),
  evidenceKind: z.literal("vex-application-report"),
  imageDigest: ImageDigestSchema,
  // Historical v1 evidence remains parseable, while current release
  // verification requires and recomputes this exact OCI manifest identity.
  manifestDigest: ImageDigestSchema.optional(),
  loadedImage: GrypeLoadedImageBindingSchema.optional(),
  scanner: z.strictObject({
    id: z.literal("grype"),
    exactVersion: z.string().trim().min(1),
    binarySha256: Sha256Schema,
    databaseSchema: z.string().trim().min(1),
    databaseBuiltAt: z.iso.datetime(),
    databaseValid: z.boolean(),
  }),
  vexSha256: Sha256Schema,
  inputs: z.strictObject({
    baseline: ScanEvidenceSchema,
    applied: ScanEvidenceSchema,
    negativeControl: ScanEvidenceSchema,
  }),
  suppressedFinding: z.strictObject({
    id: z.string().regex(/^CVE-\d{4}-\d{4,}$/),
    namespace: z.string().trim().min(1),
    package: z.string().trim().min(1),
    version: z.string().trim().min(1),
    artifactType: z.string().trim().min(1),
    purl: z.string().trim().min(1),
    fingerprint: Sha256Schema,
    vexStatus: z.literal("not_affected"),
  }),
  negativeControl: z.strictObject({
    kind: z.literal("wrong_subcomponent"),
    subcomponent: z.string().trim().min(1),
  }),
  counts: z.strictObject({
    baselineActive: z.number().int().nonnegative(),
    baselineIgnored: z.literal(0),
    appliedActive: z.number().int().nonnegative(),
    appliedIgnored: z.literal(1),
    negativeActive: z.number().int().nonnegative(),
    negativeIgnored: z.literal(0),
  }),
  checks: z.strictObject({
    appliedMultisetPreserved: z.literal(true),
    exactlyOneIntendedSuppression: z.literal(true),
    negativeControlMultisetPreserved: z.literal(true),
    negativeControlSuppressesNothing: z.literal(true),
  }),
  status: z.literal("VERIFIED"),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1),
});

export type VexApplicationOptions = z.infer<typeof VexApplicationOptionsSchema>;
export type VexApplicationReportV1 = z.infer<
  typeof VexApplicationReportV1Schema
>;

const CurrentGrypeReleaseBindingSchema = z.strictObject({
  imageDigest: ImageDigestSchema,
  manifestDigest: ImageDigestSchema,
});

export function assertCurrentGrypeReleaseEvidenceBinding(
  vulnerabilityInput: unknown,
  vexApplicationInput: unknown,
  expectedInput: unknown,
): void {
  const vulnerability = VulnerabilityReportV2Schema.parse(vulnerabilityInput);
  const vexApplication =
    VexApplicationReportV1Schema.parse(vexApplicationInput);
  const expected = CurrentGrypeReleaseBindingSchema.parse(expectedInput);
  if (
    vulnerability.imageDigest !== expected.imageDigest ||
    vulnerability.manifestDigest !== expected.manifestDigest ||
    vexApplication.imageDigest !== expected.imageDigest ||
    vexApplication.manifestDigest !== expected.manifestDigest
  ) {
    throw new Error(
      "Current vulnerability and VEX evidence must bind the exact built OCI config and manifest digests.",
    );
  }
}

function emptySeverityCounts(): Record<(typeof severities)[number], number> {
  return {
    Critical: 0,
    High: 0,
    Medium: 0,
    Low: 0,
    Negligible: 0,
    Unknown: 0,
  };
}

function normalizeTimestamp(value: string): string {
  const millisecondPrecision = value.replace(
    /\.(\d{3})\d+(?=Z$|[+-]\d{2}:\d{2}$)/,
    ".$1",
  );
  const parsed = new Date(millisecondPrecision);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid Grype timestamp: ${value}`);
  }
  return parsed.toISOString();
}

const compareCodeUnits = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const EmbeddedManifestSchema = z.object({
  schemaVersion: z.literal(2),
  mediaType: z.string().trim().min(1),
  config: z.object({
    mediaType: z.string().trim().min(1),
    digest: ImageDigestSchema,
    size: z.number().int().nonnegative(),
  }),
  layers: z.array(
    z.object({
      mediaType: z.string().trim().min(1),
      digest: ImageDigestSchema,
      size: z.number().int().nonnegative(),
    }),
  ),
});

const EmbeddedConfigSchema = z.object({
  architecture: z.string().trim().min(1),
  os: z.string().trim().min(1),
  config: z.object({
    Labels: z.record(z.string(), z.string()),
  }),
});

function decodeEmbeddedJson(
  value: string,
  label: string,
): { bytes: Buffer; value: unknown } {
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new Error(`Raw Grype embedded ${label} is not canonical base64.`);
  }
  try {
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  } catch {
    throw new Error(`Raw Grype embedded ${label} is not valid JSON.`);
  }
}

function sha256Digest(value: Uint8Array): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function equalStringRecords(
  left: Record<string, string>,
  right: Record<string, string>,
): boolean {
  const leftEntries = Object.entries(left).sort(([a], [b]) =>
    compareCodeUnits(a, b),
  );
  const rightEntries = Object.entries(right).sort(([a], [b]) =>
    compareCodeUnits(a, b),
  );
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function assertEmbeddedImageIdentity(raw: GrypeJsonReport): {
  manifest: z.infer<typeof EmbeddedManifestSchema>;
  config: z.infer<typeof EmbeddedConfigSchema>;
} {
  const { target } = raw.source;
  const embeddedManifest = decodeEmbeddedJson(target.manifest, "manifest");
  const embeddedConfig = decodeEmbeddedJson(target.config, "config");
  const manifest = EmbeddedManifestSchema.parse(embeddedManifest.value);
  const config = EmbeddedConfigSchema.parse(embeddedConfig.value);
  if (
    sha256Digest(embeddedManifest.bytes) !== target.manifestDigest ||
    sha256Digest(embeddedConfig.bytes) !== target.imageID ||
    manifest.mediaType !== target.mediaType ||
    manifest.config.digest !== target.imageID ||
    manifest.config.size !== embeddedConfig.bytes.byteLength ||
    !equalStringRecords(config.config.Labels, target.labels) ||
    (target.architecture !== "" &&
      target.architecture !== config.architecture) ||
    (target.os !== "" && target.os !== config.os)
  ) {
    throw new Error(
      "Raw Grype embedded manifest or config contradicts the reported image identity.",
    );
  }
  return { manifest, config };
}

export function assertGrypeImageBinding(
  rawInput: unknown,
  bindingInput: GrypeImageBinding,
): void {
  const raw = GrypeJsonReportSchema.parse(rawInput);
  const binding = GrypeImageBindingSchema.parse(bindingInput);
  const { target } = raw.source;
  if (target.imageID !== binding.imageDigest) {
    throw new Error(
      "Raw Grype source imageID does not bind the requested OCI image digest.",
    );
  }
  if (
    binding.manifestDigest !== undefined &&
    target.manifestDigest !== binding.manifestDigest
  ) {
    throw new Error(
      "Raw Grype source manifestDigest does not bind the requested OCI manifest digest.",
    );
  }
  assertEmbeddedImageIdentity(raw);
  if (
    target.repoDigests.length > 0 &&
    !target.repoDigests.every((value) => {
      const digest = value.slice(value.lastIndexOf("@") + 1);
      return digest === target.imageID || digest === target.manifestDigest;
    })
  ) {
    throw new Error(
      "Raw Grype source repoDigests contradict the reported image and manifest digests.",
    );
  }
}

export function assertGrypeOciArchiveBinding(
  rawInput: unknown,
  bindingInput: GrypeOciArchiveBinding,
): void {
  const raw = GrypeJsonReportSchema.parse(rawInput);
  const binding = GrypeOciArchiveBindingSchema.parse(bindingInput);
  assertGrypeImageBinding(raw, {
    imageDigest: binding.imageDigest,
    manifestDigest: binding.manifestDigest,
  });
  const { manifest, config } = assertEmbeddedImageIdentity(raw);
  const { target } = raw.source;
  const expectedLabels = {
    "io.counterlab.source-tree-sha256": binding.sourceTreeSha256,
    "org.opencontainers.image.licenses": "MIT",
    "org.opencontainers.image.revision": binding.sourceCommit,
    "org.opencontainers.image.source": binding.sourceUrl,
  };
  if (
    target.userInput !== binding.normalizedUserInput ||
    target.mediaType !== "application/vnd.oci.image.manifest.v1+json" ||
    manifest.config.mediaType !== "application/vnd.oci.image.config.v1+json" ||
    target.tags.length !== 0 ||
    target.repoDigests.length !== 0 ||
    target.architecture !== "" ||
    target.os !== "" ||
    config.architecture !== binding.platform.architecture ||
    config.os !== binding.platform.os ||
    !equalStringRecords(target.labels, expectedLabels)
  ) {
    throw new Error(
      "Raw Grype source does not bind the exact untagged source-bound OCI archive.",
    );
  }
}

export function assertGrypeLoadedImageBinding(
  rawInput: unknown,
  bindingInput: GrypeLoadedImageBinding,
): void {
  const raw = GrypeJsonReportSchema.parse(rawInput);
  const binding = GrypeLoadedImageBindingSchema.parse(bindingInput);
  assertGrypeImageBinding(raw, {
    imageDigest: binding.imageDigest,
  });
  const { manifest, config } = assertEmbeddedImageIdentity(raw);
  const { target } = raw.source;
  const expectedLabels = {
    "io.counterlab.source-tree-sha256": binding.sourceTreeSha256,
    "org.opencontainers.image.licenses": "MIT",
    "org.opencontainers.image.revision": binding.sourceCommit,
    "org.opencontainers.image.source": binding.sourceUrl,
  };
  const expectedTags = [
    binding.imageTag,
    `docker.io/library/${binding.imageTag}`,
  ].sort(compareCodeUnits);
  if (
    target.userInput !== binding.imageTag ||
    target.mediaType !==
      "application/vnd.docker.distribution.manifest.v2+json" ||
    manifest.config.mediaType !==
      "application/vnd.docker.container.image.v1+json" ||
    JSON.stringify([...target.tags].sort(compareCodeUnits)) !==
      JSON.stringify(expectedTags) ||
    target.repoDigests.length !== 0 ||
    target.architecture !== "" ||
    target.os !== "" ||
    config.architecture !== binding.platform.architecture ||
    config.os !== binding.platform.os ||
    !equalStringRecords(target.labels, expectedLabels)
  ) {
    throw new Error(
      "Raw Grype source does not bind the exact loaded source-bound image tag.",
    );
  }
}

function matchIdentity(match: GrypeJsonReport["matches"][number]): string {
  const value = {
    artifact: {
      id: match.artifact.id,
      name: match.artifact.name,
      purl: match.artifact.purl,
      type: match.artifact.type,
      version: match.artifact.version,
    },
    vulnerability: {
      fixedIn: [...match.vulnerability.fix.versions].sort(compareCodeUnits),
      fixState: match.vulnerability.fix.state,
      id: match.vulnerability.id,
      namespace: match.vulnerability.namespace,
      severity: match.vulnerability.severity,
    },
  };
  return JSON.stringify(value);
}

function sortedMatchMultiset(
  matches: readonly GrypeJsonReport["matches"][number][],
): string[] {
  return matches.map(matchIdentity).sort(compareCodeUnits);
}

function equalStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

export function summarizeGrypeScan(
  rawInput: unknown,
  optionsInput: GrypeSummaryOptions,
): VulnerabilityReportV2 {
  const raw = GrypeJsonReportSchema.parse(rawInput);
  const options = GrypeSummaryOptionsSchema.parse(optionsInput);
  if (raw.ignoredMatches.length !== 0) {
    throw new Error(
      "Raw vulnerability authority input must be an unsuppressed Grype scan.",
    );
  }
  assertGrypeImageBinding(raw, {
    imageDigest: options.imageDigest,
    manifestDigest: options.manifestDigest,
  });
  const allFindingsBySeverity = emptySeverityCounts();
  const fixableByFingerprint = new Map<
    string,
    VulnerabilityReportV2["fixableFindings"][number]
  >();
  const knownCriticalByIdentity = new Map<
    string,
    VulnerabilityReportV2["knownCriticalFindings"][number]
  >();

  for (const match of raw.matches) {
    const { vulnerability, artifact } = match;
    allFindingsBySeverity[vulnerability.severity] += 1;
    const fixedIn = [...new Set(vulnerability.fix.versions)].sort(
      compareCodeUnits,
    );
    if (
      (vulnerability.fix.state === "fixed" && fixedIn.length === 0) ||
      (vulnerability.fix.state !== "fixed" && fixedIn.length > 0)
    ) {
      throw new Error(
        `${vulnerability.id} has inconsistent Grype fix state and fixed versions.`,
      );
    }
    const isFixable = vulnerability.fix.state === "fixed" && fixedIn.length > 0;
    if (vulnerability.severity === "Critical") {
      const finding = {
        id: vulnerability.id,
        package: artifact.name,
        version: artifact.version,
        fixState: vulnerability.fix.state || "unknown",
      };
      knownCriticalByIdentity.set(
        `${finding.id}\u0000${finding.package}\u0000${finding.version}\u0000${finding.fixState}`,
        finding,
      );
    }
    if (isFixable) {
      const findingIdentity = {
        id: vulnerability.id,
        namespace: vulnerability.namespace,
        package: artifact.name,
        version: artifact.version,
        artifactType: artifact.type,
        severity: vulnerability.severity,
        fixedIn,
      };
      const fingerprint = fingerprintFixableVulnerability(findingIdentity);
      if (fixableByFingerprint.has(fingerprint)) {
        throw new Error(
          `${vulnerability.id} produced a duplicate normalized finding fingerprint.`,
        );
      }
      fixableByFingerprint.set(fingerprint, {
        ...findingIdentity,
        fingerprint,
      });
      continue;
    }
  }

  const fixableFindings = [...fixableByFingerprint.values()].sort(
    (left, right) => compareCodeUnits(left.fingerprint, right.fingerprint),
  );
  const fixableFindingsBySeverity = emptySeverityCounts();
  for (const finding of fixableFindings) {
    fixableFindingsBySeverity[finding.severity] += 1;
  }

  const reviewedExceptions = options.reviewedHighExceptions.map((review) => {
    const matches = fixableFindings.filter(
      (finding) =>
        finding.severity === "High" &&
        finding.id === review.vulnerabilityId &&
        finding.package === review.package &&
        finding.version === review.version,
    );
    if (matches.length !== 1) {
      throw new Error(
        `${review.vulnerabilityId} review must identify exactly one fixable High finding.`,
      );
    }
    return {
      ...review,
      severity: "High" as const,
      fingerprint: matches[0]!.fingerprint,
    };
  });
  if (
    new Set(reviewedExceptions.map((review) => review.fingerprint)).size !==
    reviewedExceptions.length
  ) {
    throw new Error(
      "Reviewed High exceptions must be unique by finding fingerprint.",
    );
  }

  const fixableCriticalCount = fixableFindingsBySeverity.Critical;
  const fixableHighCount = fixableFindingsBySeverity.High;
  const reviewedFingerprints = new Set(
    reviewedExceptions.map((review) => review.fingerprint),
  );
  const everyHighReviewed = fixableFindings
    .filter((finding) => finding.severity === "High")
    .every((finding) => reviewedFingerprints.has(finding.fingerprint));
  const status =
    fixableCriticalCount > 0 || !everyHighReviewed
      ? "REJECTED"
      : fixableHighCount > 0
        ? "PASSED_WITH_REVIEWED_EXCEPTION"
        : "PASSED";

  return VulnerabilityReportV2Schema.parse({
    schemaVersion: "2",
    scannedAt: normalizeTimestamp(raw.descriptor.timestamp),
    environmentId: options.environmentId,
    environmentKind: options.environmentKind,
    imageDigest: options.imageDigest,
    manifestDigest: options.manifestDigest,
    rawScan: options.rawScan,
    scanner: {
      id: "grype",
      exactVersion: raw.descriptor.version,
      binarySha256: options.scannerBinarySha256,
      databaseSchema: raw.descriptor.db.status.schemaVersion,
      databaseBuiltAt: normalizeTimestamp(raw.descriptor.db.status.built),
      databaseValid: raw.descriptor.db.status.valid,
    },
    policy: {
      threshold: "fixable_high_or_reviewed_exception",
      status,
      fixableCriticalCount,
      fixableHighCount,
      reviewedExceptionCount: reviewedExceptions.length,
    },
    allFindingsBySeverity,
    fixableFindingsBySeverity,
    fixableFindings,
    reviewedExceptions,
    knownCriticalFindings: [...knownCriticalByIdentity.values()].sort(
      (left, right) =>
        compareCodeUnits(
          `${left.id}:${left.package}:${left.version}:${left.fixState}`,
          `${right.id}:${right.package}:${right.version}:${right.fixState}`,
        ),
    ),
    limitations: options.limitations,
  });
}

export function summarizeVexApplication(
  baselineInput: unknown,
  appliedInput: unknown,
  negativeInput: unknown,
  optionsInput: VexApplicationOptions,
): VexApplicationReportV1 {
  const [baseline, applied, negative] = [
    GrypeJsonReportSchema.parse(baselineInput),
    GrypeJsonReportSchema.parse(appliedInput),
    GrypeJsonReportSchema.parse(negativeInput),
  ];
  const options = VexApplicationOptionsSchema.parse(optionsInput);
  assertGrypeImageBinding(baseline, {
    imageDigest: options.imageDigest,
    manifestDigest: options.manifestDigest,
  });
  assertGrypeLoadedImageBinding(applied, options.loadedImage);
  assertGrypeLoadedImageBinding(negative, options.loadedImage);
  const sourceIdentity = (scan: GrypeJsonReport): string =>
    JSON.stringify(scan.source.target);
  if (sourceIdentity(applied) !== sourceIdentity(negative)) {
    throw new Error(
      "Applied and negative-control VEX scans must bind one exact loaded image source identity.",
    );
  }
  const scannerIdentity = (scan: GrypeJsonReport): string =>
    JSON.stringify({
      version: scan.descriptor.version,
      databaseSchema: scan.descriptor.db.status.schemaVersion,
      databaseBuiltAt: normalizeTimestamp(scan.descriptor.db.status.built),
      databaseValid: scan.descriptor.db.status.valid,
    });
  if (
    scannerIdentity(baseline) !== scannerIdentity(applied) ||
    scannerIdentity(baseline) !== scannerIdentity(negative)
  ) {
    throw new Error(
      "VEX application scans must use one exact scanner database.",
    );
  }
  if (baseline.ignoredMatches.length !== 0) {
    throw new Error("Baseline VEX scan must be unsuppressed.");
  }
  if (applied.ignoredMatches.length !== 1) {
    throw new Error("VEX must suppress exactly one intended finding.");
  }
  if (negative.ignoredMatches.length !== 0) {
    throw new Error(
      "Wrong-subcomponent VEX negative control must suppress nothing.",
    );
  }

  const baselineMultiset = sortedMatchMultiset(baseline.matches);
  const appliedMultiset = sortedMatchMultiset([
    ...applied.matches,
    ...applied.ignoredMatches,
  ]);
  const negativeMultiset = sortedMatchMultiset([
    ...negative.matches,
    ...negative.ignoredMatches,
  ]);
  if (!equalStrings(baselineMultiset, appliedMultiset)) {
    throw new Error(
      "Applied VEX scan changed findings beyond suppression state.",
    );
  }
  if (!equalStrings(baselineMultiset, negativeMultiset)) {
    throw new Error("VEX negative-control scan changed the finding multiset.");
  }

  const ignored = applied.ignoredMatches[0]!;
  const expected = options.expectedFinding;
  const ignoredFingerprint = fingerprintFixableVulnerability({
    id: ignored.vulnerability.id,
    namespace: ignored.vulnerability.namespace,
    package: ignored.artifact.name,
    version: ignored.artifact.version,
    artifactType: ignored.artifact.type,
    severity: ignored.vulnerability.severity,
    fixedIn: ignored.vulnerability.fix.versions,
  });
  if (
    ignored.vulnerability.id !== expected.id ||
    ignored.vulnerability.namespace !== expected.namespace ||
    ignored.artifact.name !== expected.package ||
    ignored.artifact.version !== expected.version ||
    ignored.artifact.type !== expected.artifactType ||
    ignored.artifact.purl !== expected.purl ||
    ignoredFingerprint !== expected.fingerprint ||
    ignored.appliedIgnoreRules.length !== 1 ||
    ignored.appliedIgnoreRules[0]!.namespace !== "vex" ||
    ignored.appliedIgnoreRules[0]!["vex-status"] !== "not_affected"
  ) {
    throw new Error("VEX suppressed a finding outside the reviewed identity.");
  }

  return VexApplicationReportV1Schema.parse({
    schemaVersion: "1",
    evidenceKind: "vex-application-report",
    imageDigest: options.imageDigest,
    manifestDigest: options.manifestDigest,
    loadedImage: options.loadedImage,
    scanner: {
      id: "grype",
      exactVersion: baseline.descriptor.version,
      binarySha256: options.scannerBinarySha256,
      databaseSchema: baseline.descriptor.db.status.schemaVersion,
      databaseBuiltAt: normalizeTimestamp(baseline.descriptor.db.status.built),
      databaseValid: baseline.descriptor.db.status.valid,
    },
    vexSha256: options.vexSha256,
    inputs: options.inputs,
    suppressedFinding: {
      ...expected,
      vexStatus: "not_affected",
    },
    negativeControl: {
      kind: "wrong_subcomponent",
      subcomponent: options.negativeSubcomponent,
    },
    counts: {
      baselineActive: baseline.matches.length,
      baselineIgnored: 0,
      appliedActive: applied.matches.length,
      appliedIgnored: 1,
      negativeActive: negative.matches.length,
      negativeIgnored: 0,
    },
    checks: {
      appliedMultisetPreserved: true,
      exactlyOneIntendedSuppression: true,
      negativeControlMultisetPreserved: true,
      negativeControlSuppressesNothing: true,
    },
    status: "VERIFIED",
    limitations: options.limitations,
  });
}
