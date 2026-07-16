import { z } from "zod";

import {
  ReviewedVulnerabilityExceptionSchema,
  VulnerabilityReportV2Schema,
  fingerprintFixableVulnerability,
  type VulnerabilityReportV2,
} from "./vulnerability.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ImageDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
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
      repoDigests: z.array(z.string().trim().min(1)).min(1),
    }),
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
  rawScan: z.strictObject({
    evidenceId: StableIdSchema,
    sha256: Sha256Schema,
  }),
  scannerBinarySha256: Sha256Schema,
  reviewedHighExceptions: z.array(ReviewedHighInputSchema),
  limitations: z.array(z.string().trim().min(1).max(500)).min(1),
});

export type GrypeJsonReport = z.infer<typeof GrypeJsonReportSchema>;
export type GrypeSummaryOptions = z.infer<typeof GrypeSummaryOptionsSchema>;

const ScanEvidenceSchema = z.strictObject({
  evidenceId: StableIdSchema,
  sha256: Sha256Schema,
});

export const VexApplicationOptionsSchema = z.strictObject({
  imageDigest: ImageDigestSchema,
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

function assertImageBinding(raw: GrypeJsonReport, imageDigest: string): void {
  if (
    !raw.source.target.repoDigests.some((value) =>
      value.endsWith(`@${imageDigest}`),
    )
  ) {
    throw new Error(
      "Raw Grype source repoDigests do not bind the requested OCI image digest.",
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
  assertImageBinding(raw, options.imageDigest);
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
  for (const scan of [baseline, applied, negative]) {
    assertImageBinding(scan, options.imageDigest);
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
