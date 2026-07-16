import { describe, expect, it } from "vitest";

import {
  fingerprintFixableVulnerability,
  summarizeGrypeScan,
  summarizeVexApplication,
} from "../src/index.js";

const sha = (value: string): string => value.repeat(64).slice(0, 64);

const raw = {
  matches: [
    {
      vulnerability: {
        id: "CVE-2026-15308",
        namespace: "nvd:cpe",
        severity: "High",
        fix: { state: "fixed", versions: ["3.15.0"] },
      },
      artifact: {
        id: "python-artifact",
        name: "python",
        version: "3.13.14",
        type: "binary",
        purl: "pkg:generic/python@3.13.14",
      },
    },
    {
      vulnerability: {
        id: "CVE-2026-12087",
        namespace: "debian:distro:debian:13",
        severity: "Critical",
        fix: { state: "not-fixed", versions: [] },
      },
      artifact: {
        id: "perl-artifact",
        name: "perl-base",
        version: "5.40.1-6",
        type: "deb",
        purl: "pkg:deb/debian/perl-base@5.40.1-6",
      },
    },
    {
      vulnerability: {
        id: "CVE-2025-15366",
        namespace: "nvd:cpe",
        severity: "Medium",
        fix: { state: "fixed", versions: ["3.15.0a6"] },
      },
      artifact: {
        id: "python-artifact",
        name: "python",
        version: "3.13.14",
        type: "binary",
        purl: "pkg:generic/python@3.13.14",
      },
    },
  ],
  descriptor: {
    name: "grype",
    version: "0.112.0",
    timestamp: "2026-07-16T05:28:34.848157297+05:30",
    db: {
      status: {
        schemaVersion: "v6.1.8",
        built: "2026-07-15T18:14:40Z",
        valid: true,
      },
    },
  },
  source: {
    type: "image",
    target: {
      repoDigests: [`counterlab-runner@sha256:${sha("1")}`],
    },
  },
};

const baseOptions = {
  environmentId: "counterlab-runner-linux-amd64-v2",
  environmentKind: "local_candidate" as const,
  imageDigest: `sha256:${sha("1")}`,
  rawScan: { evidenceId: "grype-raw-scan-v2", sha256: sha("2") },
  scannerBinarySha256: sha("3"),
  limitations: [
    "The scanner database and package advisories are time-varying.",
  ],
};

describe("Grype vulnerability report summarization", () => {
  it("derives counts, fingerprints, known Critical findings, and reviewed status", () => {
    const report = summarizeGrypeScan(raw, {
      ...baseOptions,
      reviewedHighExceptions: [
        {
          vulnerabilityId: "CVE-2026-15308",
          package: "python",
          version: "3.13.14",
          status: "not_affected",
          justification: "vulnerable_code_not_in_execute_path",
          kevStatus: "NOT_LISTED",
          reviewExpiresAt: "2026-08-14T05:30:00.000Z",
          vexEvidenceId: "cpython-html-parser-vex-v1",
          reachabilityEvidenceId: "cpython-html-parser-reachability-v1",
        },
      ],
    });

    expect(report.scannedAt).toBe("2026-07-15T23:58:34.848Z");
    expect(report.allFindingsBySeverity).toEqual({
      Critical: 1,
      High: 1,
      Medium: 1,
      Low: 0,
      Negligible: 0,
      Unknown: 0,
    });
    expect(report.fixableFindingsBySeverity).toEqual({
      Critical: 0,
      High: 1,
      Medium: 1,
      Low: 0,
      Negligible: 0,
      Unknown: 0,
    });
    expect(report.policy).toEqual({
      threshold: "fixable_high_or_reviewed_exception",
      status: "PASSED_WITH_REVIEWED_EXCEPTION",
      fixableCriticalCount: 0,
      fixableHighCount: 1,
      reviewedExceptionCount: 1,
    });
    expect(report.knownCriticalFindings).toEqual([
      {
        id: "CVE-2026-12087",
        package: "perl-base",
        version: "5.40.1-6",
        fixState: "not-fixed",
      },
    ]);
    expect(report.fixableFindings).toEqual(
      [...report.fixableFindings].sort((left, right) =>
        left.fingerprint < right.fingerprint
          ? -1
          : left.fingerprint > right.fingerprint
            ? 1
            : 0,
      ),
    );
    expect(report.fixableFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "CVE-2025-15366",
          severity: "Medium",
        }),
      ]),
    );
    expect(report.fixableFindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "CVE-2026-15308",
          fingerprint: fingerprintFixableVulnerability({
            id: "CVE-2026-15308",
            namespace: "nvd:cpe",
            package: "python",
            version: "3.13.14",
            artifactType: "binary",
            severity: "High",
            fixedIn: ["3.15.0"],
          }),
        }),
      ]),
    );
  });

  it("fails the policy closed when a fixable High is unreviewed", () => {
    const report = summarizeGrypeScan(raw, {
      ...baseOptions,
      reviewedHighExceptions: [],
    });

    expect(report.policy.status).toBe("REJECTED");
  });

  it("rejects a review that does not identify exactly one fixable High", () => {
    expect(() =>
      summarizeGrypeScan(raw, {
        ...baseOptions,
        reviewedHighExceptions: [
          {
            vulnerabilityId: "CVE-2099-9999",
            package: "python",
            version: "3.13.14",
            status: "not_affected",
            justification: "vulnerable_code_not_in_execute_path",
            kevStatus: "NOT_LISTED",
            reviewExpiresAt: "2026-08-14T05:30:00.000Z",
            vexEvidenceId: "cpython-html-parser-vex-v1",
            reachabilityEvidenceId: "cpython-html-parser-reachability-v1",
          },
        ],
      }),
    ).toThrow(/exactly one fixable High/i);
  });

  it("rejects source-digest drift and inconsistent fix metadata", () => {
    expect(() =>
      summarizeGrypeScan(
        {
          ...raw,
          source: {
            type: "image",
            target: { repoDigests: [`counterlab-runner@sha256:${sha("9")}`] },
          },
        },
        { ...baseOptions, reviewedHighExceptions: [] },
      ),
    ).toThrow(/OCI image digest/i);

    const inconsistent = structuredClone(raw);
    inconsistent.matches[0]!.vulnerability.fix.versions = [];
    expect(() =>
      summarizeGrypeScan(inconsistent, {
        ...baseOptions,
        reviewedHighExceptions: [],
      }),
    ).toThrow(/inconsistent Grype fix state/i);
  });

  it("rejects a raw scan that already contains suppressed findings", () => {
    expect(() =>
      summarizeGrypeScan(
        { ...raw, ignoredMatches: [raw.matches[0]] },
        { ...baseOptions, reviewedHighExceptions: [] },
      ),
    ).toThrow(/unsuppressed Grype scan/i);
  });

  it("proves one exact VEX suppression and a wrong-subcomponent negative control", () => {
    const applied = structuredClone(raw);
    const [ignoredMatch, ...activeMatches] = applied.matches;
    const appliedWithIgnored = {
      ...applied,
      matches: activeMatches,
      ignoredMatches: [
        {
          ...ignoredMatch!,
          appliedIgnoreRules: [
            { namespace: "vex", "vex-status": "not_affected" },
          ],
        },
      ],
    };
    const report = summarizeVexApplication(raw, appliedWithIgnored, raw, {
      imageDigest: baseOptions.imageDigest,
      scannerBinarySha256: sha("3"),
      vexSha256: sha("4"),
      inputs: {
        baseline: { evidenceId: "grype-raw-scan-v2", sha256: sha("5") },
        applied: { evidenceId: "grype-vex-applied-v1", sha256: sha("6") },
        negativeControl: {
          evidenceId: "grype-vex-negative-v1",
          sha256: sha("7"),
        },
      },
      expectedFinding: {
        id: "CVE-2026-15308",
        namespace: "nvd:cpe",
        package: "python",
        version: "3.13.14",
        artifactType: "binary",
        purl: "pkg:generic/python@3.13.14",
        fingerprint: fingerprintFixableVulnerability({
          id: "CVE-2026-15308",
          namespace: "nvd:cpe",
          package: "python",
          version: "3.13.14",
          artifactType: "binary",
          severity: "High",
          fixedIn: ["3.15.0"],
        }),
      },
      negativeSubcomponent: "pkg:generic/node@22.23.0",
      limitations: ["The exception remains bounded to the reviewed runtime."],
    });

    expect(report.counts).toEqual({
      baselineActive: 3,
      baselineIgnored: 0,
      appliedActive: 2,
      appliedIgnored: 1,
      negativeActive: 3,
      negativeIgnored: 0,
    });
  });
});
