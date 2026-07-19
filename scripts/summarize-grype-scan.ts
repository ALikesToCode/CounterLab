import { createHash } from "node:crypto";
import { readFile, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  GrypeJsonReportSchema,
  ReachabilityReportV2Schema,
  summarizeGrypeScan,
} from "../packages/scientific-engine-registry/src/index.js";
import {
  containedInputFile,
  containedNewOutputFile,
  parseStrictNameValueArgs,
} from "./repository-cli-paths.js";

type Args = {
  raw: string;
  reachability: string;
  output: string;
  imageDigest: string;
  manifestDigest: string;
  environmentId: string;
  environmentKind: "local_candidate" | "cloudflare_production";
  rawEvidenceId: string;
  scannerBinarySha256: string;
  vexEvidenceId: string;
  reachabilityEvidenceId: string;
};

function usage(): never {
  throw new Error(
    "Usage: tsx scripts/summarize-grype-scan.ts --raw <grype.json> --reachability <report.json> --output <report.json> --image-digest sha256:<digest> --manifest-digest sha256:<digest> --environment-id <id> --environment-kind <local_candidate|cloudflare_production> --raw-evidence-id <id> --scanner-binary-sha256 <sha256> --vex-evidence-id <id> --reachability-evidence-id <id>",
  );
}

function parseArgs(argv: string[]): Args {
  const allowed = new Set([
    "--raw",
    "--reachability",
    "--output",
    "--image-digest",
    "--manifest-digest",
    "--environment-id",
    "--environment-kind",
    "--raw-evidence-id",
    "--scanner-binary-sha256",
    "--vex-evidence-id",
    "--reachability-evidence-id",
  ]);
  let values: Map<string, string>;
  try {
    values = parseStrictNameValueArgs(argv, allowed);
  } catch {
    usage();
  }
  const required = (key: string): string => values.get(`--${key}`) ?? usage();
  const environmentKind = required("environment-kind");
  if (
    environmentKind !== "local_candidate" &&
    environmentKind !== "cloudflare_production"
  ) {
    usage();
  }
  return {
    raw: required("raw"),
    reachability: required("reachability"),
    output: required("output"),
    imageDigest: required("image-digest"),
    manifestDigest: required("manifest-digest"),
    environmentId: required("environment-id"),
    environmentKind,
    rawEvidenceId: required("raw-evidence-id"),
    scannerBinarySha256: required("scanner-binary-sha256"),
    vexEvidenceId: required("vex-evidence-id"),
    reachabilityEvidenceId: required("reachability-evidence-id"),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const root = await realpath(resolve(import.meta.dirname, ".."));
  const [rawPath, reachabilityPath, output] = await Promise.all([
    containedInputFile(root, args.raw, "Grype summary raw input"),
    containedInputFile(
      root,
      args.reachability,
      "Grype summary reachability input",
    ),
    containedNewOutputFile(root, args.output, "Grype summary output"),
  ]);
  const [rawBytes, reachabilityBytes] = await Promise.all([
    readFile(rawPath),
    readFile(reachabilityPath, "utf8"),
  ]);
  const raw = GrypeJsonReportSchema.parse(
    JSON.parse(rawBytes.toString("utf8")),
  );
  const reachability = ReachabilityReportV2Schema.parse(
    JSON.parse(reachabilityBytes),
  );
  if (
    reachability.imageDigest !== args.imageDigest ||
    reachability.status !== "VERIFIED"
  ) {
    throw new Error(
      "Reachability evidence must be VERIFIED and bind the requested image digest.",
    );
  }
  const reviewedMatches = raw.matches.filter(
    (match) =>
      match.vulnerability.id === reachability.vulnerabilityId &&
      match.vulnerability.severity === "High" &&
      match.vulnerability.fix.state === "fixed" &&
      match.vulnerability.fix.versions.length > 0,
  );
  if (reviewedMatches.length !== 1) {
    throw new Error(
      `${reachability.vulnerabilityId} must identify exactly one fixable High scanner match.`,
    );
  }
  const reviewedMatch = reviewedMatches[0]!;
  const report = summarizeGrypeScan(raw, {
    environmentId: args.environmentId,
    environmentKind: args.environmentKind,
    imageDigest: args.imageDigest,
    manifestDigest: args.manifestDigest,
    rawScan: {
      evidenceId: args.rawEvidenceId,
      sha256: createHash("sha256").update(rawBytes).digest("hex"),
    },
    scannerBinarySha256: args.scannerBinarySha256,
    reviewedHighExceptions: [
      {
        vulnerabilityId: reachability.vulnerabilityId,
        package: reviewedMatch.artifact.name,
        version: reviewedMatch.artifact.version,
        status: "not_affected",
        justification: "vulnerable_code_not_in_execute_path",
        kevStatus: reachability.review.kevStatus,
        reviewExpiresAt: reachability.review.expiresAt,
        vexEvidenceId: args.vexEvidenceId,
        reachabilityEvidenceId: args.reachabilityEvidenceId,
      },
    ],
    limitations: [
      "The scanner database and upstream advisories are time-varying; a release rerun can change this report without source changes.",
      "Raw severity counts include scanner matches; normalized fixable findings deduplicate identical vulnerability, package, version, namespace, type, severity, and fixed-version identities.",
      "Known findings without a published fix remain recorded and prevent any zero-vulnerability claim.",
      "The reviewed High exception is limited to the exact image digest and bounded fixed hosted entrypoints named by the linked reachability report.",
    ],
  });
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(
    `${report.policy.status}\t${report.policy.fixableCriticalCount} fixable Critical\t${report.policy.fixableHighCount} fixable High\n`,
  );
}

await main();
