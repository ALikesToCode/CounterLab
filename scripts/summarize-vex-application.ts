import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  VulnerabilityReportV2Schema,
  summarizeVexApplication,
} from "../packages/scientific-engine-registry/src/index.js";

type Args = {
  baseline: string;
  applied: string;
  negative: string;
  vex: string;
  vulnerabilityReport: string;
  output: string;
  imageDigest: string;
  scannerBinarySha256: string;
  baselineEvidenceId: string;
  appliedEvidenceId: string;
  negativeEvidenceId: string;
  negativeSubcomponent: string;
};

function usage(): never {
  throw new Error(
    "Usage: tsx scripts/summarize-vex-application.ts --baseline <raw.json> --applied <scan.json> --negative <scan.json> --vex <openvex.json> --vulnerability-report <report.json> --output <report.json> --image-digest sha256:<digest> --scanner-binary-sha256 <sha256> --baseline-evidence-id <id> --applied-evidence-id <id> --negative-evidence-id <id> --negative-subcomponent <purl>",
  );
}

function parseArgs(argv: string[]): Args {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) usage();
    values.set(key.slice(2), value);
  }
  const required = (key: string): string => values.get(key) ?? usage();
  return {
    baseline: required("baseline"),
    applied: required("applied"),
    negative: required("negative"),
    vex: required("vex"),
    vulnerabilityReport: required("vulnerability-report"),
    output: required("output"),
    imageDigest: required("image-digest"),
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
  const [baseline, applied, negative, vex, vulnerabilityReport] =
    await Promise.all([
      readFile(resolve(args.baseline)),
      readFile(resolve(args.applied)),
      readFile(resolve(args.negative)),
      readFile(resolve(args.vex)),
      readFile(resolve(args.vulnerabilityReport)),
    ]);
  const report = VulnerabilityReportV2Schema.parse(
    JSON.parse(vulnerabilityReport.toString("utf8")),
  );
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
  const output = resolve(args.output);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  process.stdout.write(
    `VERIFIED\t${result.counts.baselineActive} baseline\t${result.counts.appliedIgnored} intended suppression\t${result.counts.negativeIgnored} negative-control suppressions\n`,
  );
}

await main();
