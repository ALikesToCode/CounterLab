import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  VulnerabilityReportV2Schema,
  summarizeVexApplication,
} from "../packages/scientific-engine-registry/src/index.js";
import {
  containedInputFile,
  containedNewOutputFile,
  parseStrictNameValueArgs,
} from "./repository-cli-paths.js";

type Args = {
  baseline: string;
  applied: string;
  negative: string;
  vex: string;
  vulnerabilityReport: string;
  output: string;
  imageDigest: string;
  manifestDigest: string;
  loadedImageTag: string;
  sourceCommit: string;
  sourceTreeSha256: string;
  scannerBinarySha256: string;
  baselineEvidenceId: string;
  appliedEvidenceId: string;
  negativeEvidenceId: string;
  negativeSubcomponent: string;
};

function usage(): never {
  throw new Error(
    "Usage: tsx scripts/summarize-vex-application.ts --baseline <raw.json> --applied <scan.json> --negative <scan.json> --vex <openvex.json> --vulnerability-report <report.json> --output <report.json> --image-digest sha256:<digest> --manifest-digest sha256:<digest> --loaded-image-tag <tag> --source-commit <commit> --source-tree-sha256 <sha256> --scanner-binary-sha256 <sha256> --baseline-evidence-id <id> --applied-evidence-id <id> --negative-evidence-id <id> --negative-subcomponent <purl>",
  );
}

function parseArgs(argv: string[]): Args {
  const allowed = new Set([
    "--baseline",
    "--applied",
    "--negative",
    "--vex",
    "--vulnerability-report",
    "--output",
    "--image-digest",
    "--manifest-digest",
    "--loaded-image-tag",
    "--source-commit",
    "--source-tree-sha256",
    "--scanner-binary-sha256",
    "--baseline-evidence-id",
    "--applied-evidence-id",
    "--negative-evidence-id",
    "--negative-subcomponent",
  ]);
  let values: Map<string, string>;
  try {
    values = parseStrictNameValueArgs(argv, allowed);
  } catch {
    usage();
  }
  const required = (key: string): string => values.get(`--${key}`) ?? usage();
  return {
    baseline: required("baseline"),
    applied: required("applied"),
    negative: required("negative"),
    vex: required("vex"),
    vulnerabilityReport: required("vulnerability-report"),
    output: required("output"),
    imageDigest: required("image-digest"),
    manifestDigest: required("manifest-digest"),
    loadedImageTag: required("loaded-image-tag"),
    sourceCommit: required("source-commit"),
    sourceTreeSha256: required("source-tree-sha256"),
    scannerBinarySha256: required("scanner-binary-sha256"),
    baselineEvidenceId: required("baseline-evidence-id"),
    appliedEvidenceId: required("applied-evidence-id"),
    negativeEvidenceId: required("negative-evidence-id"),
    negativeSubcomponent: required("negative-subcomponent"),
  };
}

const sha256 = (value: Uint8Array): string =>
  createHash("sha256").update(value).digest("hex");

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = await realpath(resolve(import.meta.dirname, ".."));
  const [baselinePath, appliedPath, negativePath, vexPath, reportPath, output] =
    await Promise.all([
      containedInputFile(root, args.baseline, "VEX baseline input"),
      containedInputFile(root, args.applied, "VEX applied input"),
      containedInputFile(root, args.negative, "VEX negative-control input"),
      containedInputFile(root, args.vex, "VEX document input"),
      containedInputFile(
        root,
        args.vulnerabilityReport,
        "Vulnerability report input",
      ),
      containedNewOutputFile(root, args.output, "VEX application output"),
    ]);
  const [baseline, applied, negative, vex, vulnerabilityReport] =
    await Promise.all([
      readFile(baselinePath),
      readFile(appliedPath),
      readFile(negativePath),
      readFile(vexPath),
      readFile(reportPath),
    ]);
  const report = VulnerabilityReportV2Schema.parse(
    JSON.parse(vulnerabilityReport.toString("utf8")),
  );
  if (
    report.imageDigest !== args.imageDigest ||
    report.manifestDigest !== args.manifestDigest
  ) {
    throw new Error(
      "Vulnerability report must bind the requested image and OCI manifest digests.",
    );
  }
  const reviewed = report.reviewedExceptions;
  if (reviewed.length !== 1) {
    throw new Error(
      "VEX application report currently requires one reviewed High.",
    );
  }
  const exception = reviewed[0]!;
  const finding = report.fixableFindings.find(
    (candidate) => candidate.fingerprint === exception.fingerprint,
  );
  if (!finding) {
    throw new Error(
      "Reviewed exception does not resolve to a fixable finding.",
    );
  }
  const result = summarizeVexApplication(
    JSON.parse(baseline.toString("utf8")),
    JSON.parse(applied.toString("utf8")),
    JSON.parse(negative.toString("utf8")),
    {
      imageDigest: args.imageDigest,
      manifestDigest: args.manifestDigest,
      loadedImage: {
        imageTag: args.loadedImageTag,
        imageDigest: args.imageDigest,
        sourceCommit: args.sourceCommit,
        sourceTreeSha256: args.sourceTreeSha256,
        sourceUrl: "https://github.com/ALikesToCode/CounterLab",
        platform: { architecture: "amd64", os: "linux" },
      },
      scannerBinarySha256: args.scannerBinarySha256,
      vexSha256: sha256(vex),
      inputs: {
        baseline: {
          evidenceId: args.baselineEvidenceId,
          sha256: sha256(baseline),
        },
        applied: {
          evidenceId: args.appliedEvidenceId,
          sha256: sha256(applied),
        },
        negativeControl: {
          evidenceId: args.negativeEvidenceId,
          sha256: sha256(negative),
        },
      },
      expectedFinding: {
        id: finding.id,
        namespace: finding.namespace,
        package: finding.package,
        version: finding.version,
        artifactType: finding.artifactType,
        purl: `pkg:generic/${finding.package}@${finding.version}`,
        fingerprint: finding.fingerprint,
      },
      negativeSubcomponent: args.negativeSubcomponent,
      limitations: [
        "This proves Grype applied one reviewed VEX statement to the exact candidate image; it does not remove or reclassify the underlying scanner finding.",
        "The wrong-subcomponent scan is a negative control for this exact document and scanner version, not a general proof about every VEX consumer.",
      ],
    },
  );
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `VERIFIED\t${result.counts.baselineActive} baseline\t${result.counts.appliedIgnored} intended suppression\t${result.counts.negativeIgnored} negative-control suppressions\n`,
  );
}

await main();
