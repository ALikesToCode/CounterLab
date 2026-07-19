import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import {
  GrypeJsonReportSchema,
  OpenVexDocumentSchema,
} from "../packages/scientific-engine-registry/src/index.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const BuildReceiptSchema = z.strictObject({
  schemaVersion: z.literal("3"),
  status: z.literal("BUILT"),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
  localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
  localImageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  localOciArchive: z.string().min(1),
  localOciArchiveSha256: Sha256Schema,
});
const KevCatalogSchema = z
  .object({
    title: z.literal("CISA Known Exploited Vulnerabilities Catalog"),
    catalogVersion: z.string().trim().min(1),
    dateReleased: z.string().trim().min(1),
    count: z.number().int().min(1_000),
    vulnerabilities: z.array(
      z.object({ cveID: z.string().regex(/^CVE-\d{4}-\d{4,}$/) }).passthrough(),
    ),
  })
  .passthrough()
  .superRefine((value, context) => {
    const identifiers = value.vulnerabilities.map((entry) => entry.cveID);
    if (
      value.count !== identifiers.length ||
      new Set(identifiers).size !== identifiers.length ||
      !identifiers.includes("CVE-2021-44228")
    ) {
      context.addIssue({
        code: "custom",
        message:
          "CISA KEV count, uniqueness, or stable sentinel validation failed",
      });
    }
  });

const root = await realpath(resolve(import.meta.dirname, ".."));
const cacheRoot = resolve(root, "node_modules/.cache/counterlab-v6.1");
const STAGING_DIRECTORY = /^scientific-evidence-[a-f0-9]{40}-\d{8}T\d{6}Z-\d+$/;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isContained(candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function inputPath(requested: string): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(candidate)) throw new Error(`Input escaped: ${requested}`);
  const requestedMetadata = await lstat(candidate);
  const physical = await realpath(candidate);
  const metadata = await lstat(physical);
  if (
    !isContained(physical) ||
    requestedMetadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.isSymbolicLink()
  ) {
    throw new Error(`Input is not a regular repository file: ${requested}`);
  }
  return physical;
}

async function outputPath(requested: string): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(candidate)) throw new Error(`Output escaped: ${requested}`);
  const parent = await realpath(dirname(candidate));
  if (!isContained(parent))
    throw new Error(`Output parent escaped: ${requested}`);
  try {
    await lstat(candidate);
    throw new Error(`Refusing to replace VEX staging output: ${requested}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return candidate;
}

function args(argv: string[]): Map<string, string> {
  if (argv.length % 2 !== 0)
    throw new Error("Arguments must be name/value pairs");
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Invalid source-bound VEX argument");
    }
    if (values.has(key)) throw new Error(`Duplicate argument: ${key}`);
    values.set(key, value);
  }
  return values;
}

const values = args(process.argv.slice(2));
const required = (key: string): string => {
  const value = values.get(key);
  if (value === undefined) throw new Error(`Missing ${key}`);
  return value;
};
const allowed = new Set([
  "--build-receipt",
  "--container-sbom",
  "--raw",
  "--kev",
  "--generated-at",
  "--review-output",
  "--vex-output",
  "--negative-vex-output",
]);
for (const key of values.keys()) {
  if (!allowed.has(key)) throw new Error(`Unknown argument: ${key}`);
}

const requestedOutputs = [
  required("--review-output"),
  required("--vex-output"),
  required("--negative-vex-output"),
].map((requested) => resolve(root, requested));
if (new Set(requestedOutputs).size !== requestedOutputs.length) {
  throw new Error("Source-bound VEX outputs must be three distinct paths");
}
const stagingDirectory = dirname(requestedOutputs[0]!);
if (
  requestedOutputs.some((path) => dirname(path) !== stagingDirectory) ||
  dirname(stagingDirectory) !== cacheRoot ||
  !STAGING_DIRECTORY.test(relative(cacheRoot, stagingDirectory)) ||
  resolve(stagingDirectory, "reachability-review.json") !==
    requestedOutputs[0] ||
  resolve(stagingDirectory, "vex.json") !== requestedOutputs[1] ||
  resolve(stagingDirectory, "negative-vex.json") !== requestedOutputs[2]
) {
  throw new Error(
    "Source-bound VEX outputs must use one exact staging directory",
  );
}
for (const [argument, name] of [
  ["--container-sbom", "runner-container.cdx.json"],
  ["--raw", "grype-raw.json"],
  ["--kev", "cisa-kev.json"],
] as const) {
  if (resolve(root, required(argument)) !== resolve(stagingDirectory, name)) {
    throw new Error(`${argument} must use the exact evidence staging file`);
  }
}
const requestedReceipt = resolve(root, required("--build-receipt"));
if (
  !isContained(requestedReceipt) ||
  relative(cacheRoot, requestedReceipt).startsWith("..")
) {
  throw new Error("Build receipt must be contained in the release cache");
}

const generatedAt = new Date(required("--generated-at"));
if (!Number.isFinite(generatedAt.getTime()))
  throw new Error("Invalid generated time");
const generatedIso = generatedAt.toISOString();
const expiresAt = new Date(generatedAt.getTime() + 14 * 24 * 60 * 60 * 1000);
const [receiptBytes, sbomBytes, rawBytes, kevBytes, currentVexBytes] =
  await Promise.all([
    readFile(await inputPath(required("--build-receipt"))),
    readFile(await inputPath(required("--container-sbom"))),
    readFile(await inputPath(required("--raw"))),
    readFile(await inputPath(required("--kev"))),
    readFile(
      await inputPath(
        "scientific-engines/vex/cpython-html-parser-v1.openvex.json",
      ),
    ),
  ]);
const receipt = BuildReceiptSchema.passthrough().parse(
  JSON.parse(receiptBytes.toString("utf8")),
);
if (receipt.localImageTag !== `counterlab-runner:git-${receipt.sourceCommit}`) {
  throw new Error("Build receipt image tag is not source-bound");
}
const raw = GrypeJsonReportSchema.parse(JSON.parse(rawBytes.toString("utf8")));
if (
  !raw.source.target.repoDigests.some((value) =>
    value.endsWith(`@${receipt.localImageDigest}`),
  )
) {
  throw new Error("Grype source does not bind the build receipt image digest");
}
const high = raw.matches.filter(
  (match) =>
    match.vulnerability.id === "CVE-2026-15308" &&
    match.vulnerability.severity === "High" &&
    match.vulnerability.fix.state === "fixed" &&
    match.vulnerability.fix.versions.length > 0 &&
    match.artifact.name === "python" &&
    match.artifact.version === "3.13.14",
);
if (high.length !== 1) {
  throw new Error(
    "The reviewed CPython exception requires exactly one current fixable High scanner match",
  );
}
const kev = KevCatalogSchema.parse(JSON.parse(kevBytes.toString("utf8")));
const dottedKevDate = kev.dateReleased.match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
const kevDateReleased = new Date(
  dottedKevDate === null
    ? kev.dateReleased
    : `${dottedKevDate[1]}-${dottedKevDate[2]}-${dottedKevDate[3]}T00:00:00.000Z`,
);
if (!Number.isFinite(kevDateReleased.getTime())) {
  throw new Error("CISA KEV release timestamp is invalid");
}
const kevAgeMs = generatedAt.getTime() - kevDateReleased.getTime();
if (kevAgeMs < 0 || kevAgeMs > 14 * 24 * 60 * 60 * 1000) {
  throw new Error("CISA KEV catalog is future-dated or older than 14 days");
}
if (kev.vulnerabilities.some((entry) => entry.cveID === "CVE-2026-15308")) {
  throw new Error(
    "CVE-2026-15308 is listed in CISA KEV; VEX generation rejected",
  );
}
const currentVex = OpenVexDocumentSchema.parse(
  JSON.parse(currentVexBytes.toString("utf8")),
);
const product = `pkg:oci/counterlab-runner@${receipt.localImageDigest}`;
const subcomponent = "pkg:generic/python@3.13.14";
const statement = {
  vulnerability: { name: "CVE-2026-15308" },
  products: [{ "@id": product, subcomponents: [{ "@id": subcomponent }] }],
  status: "not_affected" as const,
  justification: "vulnerable_code_not_in_execute_path" as const,
  impact_statement:
    "CounterLab's fixed hosted leakage and imbalance run and patch entrypoints do not import or execute html.parser.HTMLParser. This statement does not cover arbitrary Python code or other entrypoints.",
};
const vex = OpenVexDocumentSchema.parse({
  "@context": "https://openvex.dev/ns/v0.2.0",
  "@id": "https://counterlab.dev/vex/cpython-html-parser-v1",
  author: "CounterLab release engineering",
  timestamp: generatedIso,
  version: currentVex.version + 1,
  statements: [statement],
});
const negative = OpenVexDocumentSchema.parse({
  ...vex,
  "@id": "https://counterlab.dev/vex/cpython-html-parser-negative-control-v1",
  statements: [
    {
      ...statement,
      products: [
        {
          "@id": product,
          subcomponents: [
            { "@id": "pkg:generic/python-negative-control@3.13.14" },
          ],
        },
      ],
    },
  ],
});
const review = {
  schemaVersion: "2",
  vulnerabilityId: "CVE-2026-15308",
  imageDigest: receipt.localImageDigest,
  sourceCommit: receipt.sourceCommit,
  sbomSha256: sha256(sbomBytes),
  owner: "counterlab-release-owner",
  reviewedAt: generatedIso,
  expiresAt: expiresAt.toISOString(),
  kevStatus: "NOT_LISTED",
  kevCheckedAt: generatedIso,
  kevSource:
    "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json",
  kevCatalogVersion: kev.catalogVersion,
  kevCatalogCount: kev.count,
  kevDateReleased: kevDateReleased.toISOString(),
  kevCatalogSha256: sha256(kevBytes),
};

const [reviewOutput, vexOutput, negativeVexOutput] = await Promise.all([
  outputPath(required("--review-output")),
  outputPath(required("--vex-output")),
  outputPath(required("--negative-vex-output")),
]);
await Promise.all([
  writeFile(reviewOutput, `${JSON.stringify(review, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  }),
  writeFile(vexOutput, `${JSON.stringify(vex, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  }),
  writeFile(negativeVexOutput, `${JSON.stringify(negative, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  }),
]);
process.stdout.write(
  `SOURCE_BOUND_VEX_PREPARED vulnerability=CVE-2026-15308 expires=${expiresAt.toISOString()}\n`,
);
