import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  assertGrypeImageBinding,
  assertGrypeOciArchiveBinding,
  assertCurrentGrypeReleaseEvidenceBinding,
  fingerprintFixableVulnerability,
  summarizeGrypeScan,
  summarizeVexApplication,
} from "../src/index.js";

const sha = (value: string): string => value.repeat(64).slice(0, 64);
const imageLabels: Record<string, string> = {};
const embeddedConfig = Buffer.from(
  JSON.stringify({
    architecture: "amd64",
    os: "linux",
    config: { Labels: imageLabels },
  }),
);
const fixtureImageDigest = `sha256:${createHash("sha256")
  .update(embeddedConfig)
  .digest("hex")}`;
const embeddedManifest = Buffer.from(
  JSON.stringify({
    schemaVersion: 2,
    mediaType: "application/vnd.docker.distribution.manifest.v2+json",
    config: {
      mediaType: "application/vnd.docker.container.image.v1+json",
      digest: fixtureImageDigest,
      size: embeddedConfig.byteLength,
    },
    layers: [],
  }),
);
const fixtureManifestDigest = `sha256:${createHash("sha256")
  .update(embeddedManifest)
  .digest("hex")}`;

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
      userInput: "counterlab-runner:fixture",
      imageID: fixtureImageDigest,
      manifestDigest: fixtureManifestDigest,
      mediaType: "application/vnd.docker.distribution.manifest.v2+json",
      tags: ["counterlab-runner:fixture"],
      repoDigests: [`counterlab-runner@${fixtureImageDigest}`],
      architecture: "amd64",
      os: "linux",
      labels: imageLabels,
      manifest: embeddedManifest.toString("base64"),
      config: embeddedConfig.toString("base64"),
    },
  },
};

const baseOptions = {
  environmentId: "counterlab-runner-linux-amd64-v2",
  environmentKind: "local_candidate" as const,
  imageDigest: fixtureImageDigest,
  manifestDigest: fixtureManifestDigest,
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
    expect(report.manifestDigest).toBe(fixtureManifestDigest);
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
            target: {
              ...raw.source.target,
              repoDigests: [`counterlab-runner@sha256:${sha("9")}`],
            },
          },
        },
        { ...baseOptions, reviewedHighExceptions: [] },
      ),
    ).toThrow(/repoDigests contradict/i);

    expect(() =>
      summarizeGrypeScan(
        {
          ...raw,
          source: {
            type: "image",
            target: {
              ...raw.source.target,
              repoDigests: [
                `counterlab-runner@${fixtureImageDigest}`,
                `counterlab-runner-copy@sha256:${sha("9")}`,
              ],
            },
          },
        },
        { ...baseOptions, reviewedHighExceptions: [] },
      ),
    ).toThrow(/repoDigests contradict/i);

    expect(() =>
      summarizeGrypeScan(
        {
          ...raw,
          source: {
            type: "image",
            target: {
              ...raw.source.target,
              imageID: `sha256:${sha("9")}`,
              repoDigests: [],
            },
          },
        },
        { ...baseOptions, reviewedHighExceptions: [] },
      ),
    ).toThrow(/imageID does not bind/i);

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

  it("binds an untagged OCI archive by exact image and manifest digests", () => {
    const ociArchive = structuredClone(raw);
    const ociManifest = Buffer.from(
      JSON.stringify({
        ...JSON.parse(embeddedManifest.toString("utf8")),
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        config: {
          ...JSON.parse(embeddedManifest.toString("utf8")).config,
          mediaType: "application/vnd.oci.image.config.v1+json",
        },
      }),
    );
    ociArchive.source.target = {
      ...ociArchive.source.target,
      userInput: "<COUNTERLAB_REPO_ROOT>/runner.oci.tar",
      manifestDigest: `sha256:${createHash("sha256")
        .update(ociManifest)
        .digest("hex")}`,
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      tags: [],
      repoDigests: [],
      architecture: "",
      os: "",
      manifest: ociManifest.toString("base64"),
    };

    expect(() =>
      assertGrypeImageBinding(ociArchive, {
        imageDigest: ociArchive.source.target.imageID,
        manifestDigest: ociArchive.source.target.manifestDigest,
      }),
    ).not.toThrow();
    expect(() =>
      assertGrypeImageBinding(ociArchive, {
        imageDigest: ociArchive.source.target.imageID,
        manifestDigest: `sha256:${sha("9")}`,
      }),
    ).toThrow(/manifestDigest does not bind/i);

    const tampered = structuredClone(ociArchive);
    tampered.source.target.config = Buffer.concat([
      embeddedConfig,
      Buffer.from(" ", "utf8"),
    ]).toString("base64");
    expect(() =>
      assertGrypeImageBinding(tampered, {
        imageDigest: ociArchive.source.target.imageID,
      }),
    ).toThrow(/embedded manifest or config contradicts/i);
  });

  it("validates the complete untagged source-bound OCI archive identity", () => {
    const labels = {
      "io.counterlab.source-tree-sha256": sha("2"),
      "org.opencontainers.image.licenses": "MIT",
      "org.opencontainers.image.revision": "3".repeat(40),
      "org.opencontainers.image.source":
        "https://github.com/ALikesToCode/CounterLab",
    };
    const config = Buffer.from(
      JSON.stringify({
        architecture: "amd64",
        os: "linux",
        config: { Labels: labels },
      }),
    );
    const imageDigest = `sha256:${createHash("sha256")
      .update(config)
      .digest("hex")}`;
    const manifest = Buffer.from(
      JSON.stringify({
        schemaVersion: 2,
        mediaType: "application/vnd.oci.image.manifest.v1+json",
        config: {
          mediaType: "application/vnd.oci.image.config.v1+json",
          digest: imageDigest,
          size: config.byteLength,
        },
        layers: [],
      }),
    );
    const manifestDigest = `sha256:${createHash("sha256")
      .update(manifest)
      .digest("hex")}`;
    const archive = structuredClone(raw);
    archive.source.target = {
      ...archive.source.target,
      userInput: "<COUNTERLAB_REPO_ROOT>/releases/runner.oci.tar",
      imageID: imageDigest,
      manifestDigest,
      mediaType: "application/vnd.oci.image.manifest.v1+json",
      tags: [],
      repoDigests: [],
      architecture: "",
      os: "",
      labels,
      manifest: manifest.toString("base64"),
      config: config.toString("base64"),
    };
    const binding = {
      normalizedUserInput: "<COUNTERLAB_REPO_ROOT>/releases/runner.oci.tar",
      imageDigest,
      manifestDigest,
      sourceCommit: "3".repeat(40),
      sourceTreeSha256: sha("2"),
      sourceUrl: "https://github.com/ALikesToCode/CounterLab" as const,
      platform: { architecture: "amd64" as const, os: "linux" as const },
    };

    expect(() => assertGrypeOciArchiveBinding(archive, binding)).not.toThrow();
    expect(() =>
      assertGrypeOciArchiveBinding(
        {
          ...archive,
          source: {
            ...archive.source,
            target: { ...archive.source.target, tags: ["unexpected:tag"] },
          },
        },
        binding,
      ),
    ).toThrow(/exact untagged source-bound OCI archive/i);
    expect(() =>
      assertGrypeOciArchiveBinding(
        {
          ...archive,
          source: {
            ...archive.source,
            target: { ...archive.source.target, architecture: "amd64" },
          },
        },
        binding,
      ),
    ).toThrow(/exact untagged source-bound OCI archive/i);
    expect(() =>
      assertGrypeOciArchiveBinding(archive, {
        ...binding,
        sourceCommit: "4".repeat(40),
      }),
    ).toThrow(/exact untagged source-bound OCI archive/i);
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
    const vexOptions = {
      imageDigest: baseOptions.imageDigest,
      manifestDigest: baseOptions.manifestDigest,
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
    };
    const report = summarizeVexApplication(
      raw,
      appliedWithIgnored,
      raw,
      vexOptions,
    );

    expect(report.counts).toEqual({
      baselineActive: 3,
      baselineIgnored: 0,
      appliedActive: 2,
      appliedIgnored: 1,
      negativeActive: 3,
      negativeIgnored: 0,
    });
    expect(report.manifestDigest).toBe(fixtureManifestDigest);

    const vulnerabilityReport = summarizeGrypeScan(raw, {
      ...baseOptions,
      reviewedHighExceptions: [],
    });
    expect(() =>
      assertCurrentGrypeReleaseEvidenceBinding(vulnerabilityReport, report, {
        imageDigest: fixtureImageDigest,
        manifestDigest: fixtureManifestDigest,
      }),
    ).not.toThrow();
    expect(() =>
      assertCurrentGrypeReleaseEvidenceBinding(vulnerabilityReport, report, {
        imageDigest: fixtureImageDigest,
        manifestDigest: `sha256:${sha("9")}`,
      }),
    ).toThrow(/exact built OCI config and manifest digests/i);
    expect(() =>
      assertCurrentGrypeReleaseEvidenceBinding(
        vulnerabilityReport,
        { ...report, manifestDigest: `sha256:${sha("9")}` },
        {
          imageDigest: fixtureImageDigest,
          manifestDigest: fixtureManifestDigest,
        },
      ),
    ).toThrow(/exact built OCI config and manifest digests/i);
    expect(() =>
      assertCurrentGrypeReleaseEvidenceBinding(
        { ...vulnerabilityReport, manifestDigest: undefined },
        report,
        {
          imageDigest: fixtureImageDigest,
          manifestDigest: fixtureManifestDigest,
        },
      ),
    ).toThrow(/exact built OCI config and manifest digests/i);

    const driftedNegative = structuredClone(raw);
    driftedNegative.source.target.userInput = "counterlab-runner:other";
    expect(() =>
      summarizeVexApplication(
        raw,
        appliedWithIgnored,
        driftedNegative,
        vexOptions,
      ),
    ).toThrow(/one exact image source identity/i);
  });
});
