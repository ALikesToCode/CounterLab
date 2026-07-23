import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import {
  GrypeJsonReportSchema,
  OpenVexDocumentSchema,
  ReachabilityReportV2Schema,
  ScientificEngineEvidenceCatalogSchema,
  ScientificEngineRegistrySchema,
  ScientificEngineRuntimeManifestSchema,
  SubjectPackEngineBindingsSchema,
  VexApplicationReportV1Schema,
  VulnerabilityReportV2Schema,
  assertGrypeLoadedImageBinding,
  assertGrypeOciArchiveBinding,
  canonicalizeScientificEngineSnapshot,
  hashScientificEngineRegistry,
  hashScientificEngineSnapshot,
  hashSubjectPackEngineBindings,
  validateScientificEngineSnapshot,
} from "../packages/scientific-engine-registry/src/index.js";
import {
  INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS,
  SIGNED_RESULT_BINDING_V2_SCOPE,
  assertScientificIntegrityScopeRelationships,
  assertSignedResultBindingV2Scope,
  internalScientificIntegrityPaths,
} from "./internal-scientific-integrity-scope.js";
import { SourceBoundBuildReceiptSchema } from "./source-bound-build-receipt.js";

const BuildReceiptSchema = SourceBoundBuildReceiptSchema;

const ENGINE_INTEGRITY: Record<string, string> = {
  "counterlab-fixed-ml-kernel":
    "scientific-engines/fixtures/integrity/counterlab-fixed-ml-kernel-0.1.0.json",
  numpy: "scientific-engines/fixtures/integrity/numpy-2.4.6.json",
  pandas: "scientific-engines/fixtures/integrity/pandas-2.3.3.json",
  "scikit-learn":
    "scientific-engines/fixtures/integrity/scikit-learn-1.9.0.json",
};
const HEALTH_PATHS = [
  "scientific-engines/fixtures/health/counterlab-fixed-ml-kernel-health-v1.json",
  "scientific-engines/fixtures/health/numpy-health-v1.json",
  "scientific-engines/fixtures/health/pandas-health-v1.json",
  "scientific-engines/fixtures/health/scikit-learn-health-v1.json",
] as const;
const STAGED: Record<string, string> = {
  "docs/sbom/node.cdx.json": "node.cdx.json",
  "docs/sbom/runner-container.cdx.json": "runner-container.cdx.json",
  "docs/sbom/grype-raw.json": "grype-raw.json",
  "docs/sbom/grype-vex-applied.json": "grype-vex-applied.json",
  "docs/sbom/grype-vex-negative-control.json":
    "grype-vex-negative-control.json",
  "docs/sbom/vulnerability-report.json": "vulnerability-report.json",
  "docs/sbom/vex-application-report.json": "vex-application-report.json",
  "scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json":
    "reachability.json",
  "scientific-engines/vex/cpython-html-parser-v1.openvex.json": "vex.json",
};

const root = await realpath(resolve(import.meta.dirname, ".."));
const outputs = new Map<string, string>();

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function contained(candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function existingFile(requested: string): Promise<string> {
  const candidate = resolve(root, requested);
  if (!contained(candidate)) throw new Error(`Path escaped: ${requested}`);
  const requestedMetadata = await lstat(candidate);
  const physical = await realpath(candidate);
  const metadata = await lstat(physical);
  if (
    !contained(physical) ||
    requestedMetadata.isSymbolicLink() ||
    !metadata.isFile()
  ) {
    throw new Error(`Path is not a regular repository file: ${requested}`);
  }
  return physical;
}

const NEW_GENERATED_OUTPUTS = new Set([
  "scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json",
]);

async function writableOutput(
  requested: string,
): Promise<{ path: string; isNew: boolean }> {
  try {
    return { path: await existingFile(requested), isNew: false };
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" ||
      !NEW_GENERATED_OUTPUTS.has(requested)
    ) {
      throw error;
    }
  }
  const candidate = resolve(root, requested);
  if (!contained(candidate)) throw new Error(`Output escaped: ${requested}`);
  const parent = await realpath(dirname(candidate));
  const parentMetadata = await lstat(parent);
  if (!contained(parent) || !parentMetadata.isDirectory()) {
    throw new Error(`Output parent is invalid: ${requested}`);
  }
  return { path: candidate, isNew: true };
}

async function diskBytes(requested: string): Promise<Buffer> {
  return readFile(await existingFile(requested));
}

async function desiredBytes(requested: string): Promise<Buffer> {
  const desired = outputs.get(requested);
  return desired === undefined ? diskBytes(requested) : Buffer.from(desired);
}

async function json(requested: string): Promise<unknown> {
  return JSON.parse(
    (await desiredBytes(requested)).toString("utf8"),
  ) as unknown;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function pretty(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function parseArgs(argv: string[]): Map<string, string> {
  if (argv.length % 2 !== 0)
    throw new Error("Arguments must be name/value pairs");
  const result = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error("Invalid evidence-binding argument");
    }
    if (result.has(key)) throw new Error(`Duplicate argument: ${key}`);
    result.set(key, value);
  }
  return result;
}

const args = parseArgs(process.argv.slice(2));
const allowed = new Set([
  "--build-receipt",
  "--work",
  "--generated-at",
  "--mode",
]);
for (const key of args.keys()) {
  if (!allowed.has(key)) throw new Error(`Unknown argument: ${key}`);
}
const required = (key: string): string => {
  const value = args.get(key);
  if (value === undefined) throw new Error(`Missing ${key}`);
  return value;
};
const mode = required("--mode");
if (mode !== "check" && mode !== "write") {
  throw new Error("--mode must be check or write");
}
const generatedAt = new Date(required("--generated-at"));
if (!Number.isFinite(generatedAt.getTime()))
  throw new Error("Invalid generated time");
const generatedIso = generatedAt.toISOString();
const receipt = BuildReceiptSchema.parse(
  JSON.parse((await diskBytes(required("--build-receipt"))).toString("utf8")),
);
if (receipt.localImageTag !== `counterlab-runner:git-${receipt.sourceCommit}`) {
  throw new Error("Build receipt image tag is not source-bound");
}
const requestedWork = resolve(root, required("--work"));
if (!contained(requestedWork))
  throw new Error("Evidence work directory escaped the repository");
const requestedWorkMetadata = await lstat(requestedWork);
const work = await realpath(requestedWork);
if (!contained(work))
  throw new Error("Evidence work directory escaped the repository");
if (
  !/^node_modules\/\.cache\/counterlab-v6\.1\/scientific-evidence-[a-f0-9]{40}-\d{8}T\d{6}Z-\d+$/.test(
    relative(root, work),
  )
) {
  throw new Error("Evidence work directory is outside the exact staging shape");
}
const workMetadata = await lstat(work);
if (
  requestedWorkMetadata.isSymbolicLink() ||
  !workMetadata.isDirectory() ||
  workMetadata.isSymbolicLink()
) {
  throw new Error("Evidence work path is not a regular directory");
}

for (const [target, name] of Object.entries(STAGED)) {
  const staged = await existingFile(relative(root, resolve(work, name)));
  outputs.set(target, await readFile(staged, "utf8"));
}

const runnerSbomPath = "docs/sbom/runner-container.cdx.json";
const runnerSbom = object(await json(runnerSbomPath), runnerSbomPath);
const runnerMetadata = object(
  runnerSbom.metadata,
  `${runnerSbomPath}.metadata`,
);
const runnerComponent = object(
  runnerMetadata.component,
  `${runnerSbomPath}.metadata.component`,
);
const runnerProperties = array(
  runnerMetadata.properties,
  `${runnerSbomPath}.metadata.properties`,
).map((entry) => object(entry, `${runnerSbomPath}.metadata.property`));
const runnerTools = object(
  runnerMetadata.tools,
  `${runnerSbomPath}.metadata.tools`,
);
const syftTools = array(
  runnerTools.components,
  `${runnerSbomPath}.metadata.tools.components`,
).map((entry) => object(entry, `${runnerSbomPath}.metadata.tool`));
const propertyValue = (name: string): unknown =>
  runnerProperties.find((entry) => entry.name === name)?.value;
if (
  runnerComponent.name !== "counterlab-runner" ||
  runnerComponent.version !== `git-${receipt.sourceCommit}` ||
  propertyValue("syft:image:labels:org.opencontainers.image.revision") !==
    receipt.sourceCommit ||
  propertyValue("syft:image:labels:io.counterlab.source-tree-sha256") !==
    receipt.sourceTreeSha256 ||
  !syftTools.some((tool) => tool.name === "syft" && tool.version === "1.44.0")
) {
  throw new Error("Runner SBOM does not bind the exact source and pinned Syft");
}

const scanPaths = [
  "docs/sbom/grype-raw.json",
  "docs/sbom/grype-vex-applied.json",
  "docs/sbom/grype-vex-negative-control.json",
] as const;
const scanInputs = await Promise.all(scanPaths.map((path) => json(path)));
const scans = scanInputs.map((input) => GrypeJsonReportSchema.parse(input));
const expectedScanInput = `<COUNTERLAB_REPO_ROOT>/${receipt.localOciArchive}`;
const dbIdentity = (scan: (typeof scans)[number]): string =>
  JSON.stringify(scan.descriptor.db.status);
for (const [index, scan] of scans.entries()) {
  const binding = {
    imageDigest: receipt.localImageDigest,
    sourceCommit: receipt.sourceCommit,
    sourceTreeSha256: receipt.sourceTreeSha256,
    sourceUrl: "https://github.com/ALikesToCode/CounterLab" as const,
    platform: { architecture: "amd64" as const, os: "linux" as const },
  };
  if (index === 0) {
    assertGrypeOciArchiveBinding(scan, {
      ...binding,
      normalizedUserInput: expectedScanInput,
      manifestDigest: receipt.localManifestDigest,
    });
  } else {
    assertGrypeLoadedImageBinding(scan, {
      ...binding,
      imageTag: receipt.localImageTag,
    });
  }
  const scanPath = scanPaths[index]!;
  const scanInput = object(scanInputs[index], scanPath);
  const scanDescriptor = object(scanInput.descriptor, `${scanPath}.descriptor`);
  const scanConfiguration = object(
    scanDescriptor.configuration,
    `${scanPath}.descriptor.configuration`,
  );
  const scanSearch = object(
    scanConfiguration.search,
    `${scanPath}.descriptor.configuration.search`,
  );
  const scanExternalSources = object(
    scanConfiguration.externalSources,
    `${scanPath}.descriptor.configuration.externalSources`,
  );
  const scanExternalMaven = object(
    scanExternalSources.maven,
    `${scanPath}.descriptor.configuration.externalSources.maven`,
  );
  const scanDatabase = object(
    scanConfiguration.db,
    `${scanPath}.descriptor.configuration.db`,
  );
  const configuredVex = array(
    scanConfiguration["vex-documents"],
    `${scanPath}.descriptor.configuration.vex-documents`,
  );
  if (
    scan.descriptor.version !== "0.112.0" ||
    scan.descriptor.db.status.valid !== true ||
    JSON.stringify(scanConfiguration.output) !== JSON.stringify(["json"]) ||
    typeof scanConfiguration.file !== "string" ||
    !scanConfiguration.file.endsWith(`/${STAGED[scanPath]}`) ||
    scanConfiguration["only-fixed"] !== false ||
    scanConfiguration["only-notfixed"] !== false ||
    scanConfiguration["ignore-wontfix"] !== "" ||
    !Array.isArray(scanConfiguration.exclude) ||
    scanConfiguration.exclude.length !== 0 ||
    scanSearch.scope !== "squashed" ||
    scanSearch["unindexed-archives"] !== false ||
    scanSearch["indexed-archives"] !== true ||
    scanExternalSources.enable !== false ||
    scanExternalMaven.searchUpstreamBySha1 !== false ||
    scanConfiguration["show-suppressed"] !== false ||
    scanConfiguration["by-cve"] !== false ||
    !Array.isArray(scanConfiguration["vex-add"]) ||
    scanConfiguration["vex-add"].length !== 0 ||
    scanDatabase["update-url"] !== "https://grype.anchore.io/databases" ||
    scanDatabase["auto-update"] !== false ||
    scanDatabase["validate-by-hash-on-start"] !== true ||
    scanDatabase["validate-age"] !== true ||
    scanDatabase["require-update-check"] !== false ||
    configuredVex.length !== (index === 0 ? 0 : 1) ||
    scan.ignoredMatches.length !== (index === 1 ? 1 : 0) ||
    dbIdentity(scan) !== dbIdentity(scans[0]!)
  ) {
    throw new Error(
      "Grype baseline and VEX scans must bind the exact archive, loaded image, pinned scanner, and database",
    );
  }
}
const vulnerability = VulnerabilityReportV2Schema.parse(
  await json("docs/sbom/vulnerability-report.json"),
);
const vexApplication = VexApplicationReportV1Schema.parse(
  await json("docs/sbom/vex-application-report.json"),
);
const reachability = ReachabilityReportV2Schema.parse(
  await json(
    "scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json",
  ),
);
const vex = OpenVexDocumentSchema.parse(
  await json("scientific-engines/vex/cpython-html-parser-v1.openvex.json"),
);
for (const [label, digest] of [
  ["vulnerability report", vulnerability.imageDigest],
  ["VEX application", vexApplication.imageDigest],
  ["reachability", reachability.imageDigest],
] as const) {
  if (digest !== receipt.localImageDigest) {
    throw new Error(`${label} does not bind the build receipt image`);
  }
}
for (const [label, digest] of [
  ["vulnerability report", vulnerability.manifestDigest],
  ["VEX application", vexApplication.manifestDigest],
] as const) {
  if (digest !== receipt.localManifestDigest) {
    throw new Error(`${label} does not bind the build receipt OCI manifest`);
  }
}
if (
  vexApplication.loadedImage?.imageTag !== receipt.localImageTag ||
  vexApplication.loadedImage.imageDigest !== receipt.localImageDigest ||
  vexApplication.loadedImage.sourceCommit !== receipt.sourceCommit ||
  vexApplication.loadedImage.sourceTreeSha256 !== receipt.sourceTreeSha256
) {
  throw new Error(
    "VEX application does not bind the loaded source-bound image",
  );
}
if (
  reachability.sourceCommit !== receipt.sourceCommit ||
  !vex.statements[0]?.products.some(
    (product) => product["@id"] === receipt.localImageTag,
  )
) {
  throw new Error("Reachability or VEX does not bind the source-bound image");
}

for (const path of HEALTH_PATHS) {
  const health = object(await json(path), path);
  health.imageDigest = receipt.localImageDigest;
  outputs.set(path, pretty(health));
}
for (const path of Object.values(ENGINE_INTEGRITY)) {
  const integrity = object(await json(path), path);
  integrity.imageDigest = receipt.localImageDigest;
  const sourceBinding = object(
    integrity.sourceBinding,
    `${path}.sourceBinding`,
  );
  sourceBinding.commit = receipt.sourceCommit;
  outputs.set(path, pretty(integrity));
}
const cpythonPath =
  "scientific-engines/fixtures/integrity/cpython-runtime-3.13.14.json";
const cpython = object(await json(cpythonPath), cpythonPath);
cpython.imageDigest = receipt.localImageDigest;
outputs.set(cpythonPath, pretty(cpython));

assertScientificIntegrityScopeRelationships();
for (const evidenceId of INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS) {
  const path = `scientific-engines/fixtures/validation/${evidenceId}.json`;
  const evidence = object(await json(path), path);
  if (
    evidence.schemaVersion !== "2" ||
    evidence.evidenceId !== evidenceId ||
    evidence.kind !== "integrity"
  ) {
    throw new Error(`${path} has an unexpected identity`);
  }
  const files: Record<string, string> = {};
  for (const sourcePath of internalScientificIntegrityPaths(evidenceId)) {
    files[sourcePath] = sha256(await diskBytes(sourcePath));
  }
  evidence.files = files;
  outputs.set(path, pretty(evidence));
}

const signedResultBindingPath =
  "scientific-engines/fixtures/validation/signed-result-binding-v2.json";
const signedResultBinding = object(
  await json(signedResultBindingPath),
  signedResultBindingPath,
);
if (
  signedResultBinding.schemaVersion !== "2" ||
  signedResultBinding.evidenceId !== "signed-result-binding-v2" ||
  signedResultBinding.kind !== "golden_fixture"
) {
  throw new Error(`${signedResultBindingPath} has an unexpected identity`);
}
signedResultBinding.contractPath = SIGNED_RESULT_BINDING_V2_SCOPE.contractPath;
signedResultBinding.codePaths = [...SIGNED_RESULT_BINDING_V2_SCOPE.codePaths];
signedResultBinding.tests = [...SIGNED_RESULT_BINDING_V2_SCOPE.tests];
assertSignedResultBindingV2Scope({
  contractPath: String(signedResultBinding.contractPath),
  codePaths: array(
    signedResultBinding.codePaths,
    `${signedResultBindingPath}.codePaths`,
  ).map(String),
  tests: array(
    signedResultBinding.tests,
    `${signedResultBindingPath}.tests`,
  ).map(String),
});
outputs.set(signedResultBindingPath, pretty(signedResultBinding));

const summaryPath =
  "scientific-engines/fixtures/integrity/local-candidate-ml-runtime.json";
const summary = object(await json(summaryPath), summaryPath);
summary.capturedAt = generatedIso;
summary.imageDigest = receipt.localImageDigest;
summary.sourceCommit = receipt.sourceCommit;
object(summary.observedVersions, `${summaryPath}.observedVersions`)[
  "pnpm-build-tool"
] = "11.13.1";
outputs.set(summaryPath, pretty(summary));

const licenseManifestPath = "scientific-engines/licenses/manifest.json";
const licenseManifest = object(
  await json(licenseManifestPath),
  licenseManifestPath,
);
licenseManifest.imageDigest = receipt.localImageDigest;
licenseManifest.capturedOn = generatedIso.slice(0, 10);
outputs.set(licenseManifestPath, pretty(licenseManifest));

const noticePath = "scientific-engines/notices/current-ml-engines.NOTICE.md";
const notice = (await diskBytes(noticePath))
  .toString("utf8")
  .replace(/`sha256:[a-f0-9]{64}`/u, `\`${receipt.localImageDigest}\``);
outputs.set(noticePath, notice);

const registry = ScientificEngineRegistrySchema.parse(
  await json("scientific-engines/registry.json"),
);
for (const engine of registry.engines) {
  const path = ENGINE_INTEGRITY[engine.id];
  if (path === undefined)
    throw new Error(`Missing integrity path for ${engine.id}`);
  engine.integrityHash = sha256(await desiredBytes(path));
}
const registryHash = await hashScientificEngineRegistry(registry);
outputs.set("scientific-engines/registry.json", pretty(registry));

const bindings = SubjectPackEngineBindingsSchema.parse(
  await json("scientific-engines/subject-pack-bindings.json"),
);
for (const pack of bindings.subjectPacks) {
  for (const role of Object.values(pack.roles)) {
    if (role.kind !== "INTERNAL") continue;
    const path = `scientific-engines/fixtures/validation/${role.integrityEvidenceId}.json`;
    role.integrityHash = sha256(await desiredBytes(path));
  }
}
const bindingsHash = await hashSubjectPackEngineBindings(bindings);
outputs.set("scientific-engines/subject-pack-bindings.json", pretty(bindings));

const sbomManifestPath = "docs/sbom/manifest.json";
const sbomManifest = object(await json(sbomManifestPath), sbomManifestPath);
sbomManifest.generatedAt = generatedIso;
sbomManifest.sourceCommit = receipt.sourceCommit;
sbomManifest.imageDigest = receipt.localImageDigest;
sbomManifest.registryHash = registryHash;
sbomManifest.bindingsHash = bindingsHash;
const sbomDocuments = array(
  sbomManifest.documents,
  `${sbomManifestPath}.documents`,
).map((entry) => object(entry, `${sbomManifestPath}.document`));
for (const document of sbomDocuments) {
  const path = String(document.path);
  const bom = object(await json(path), path);
  document.componentCount = array(bom.components, `${path}.components`).length;
  document.sha256 = sha256(await desiredBytes(path));
  document.toolLockSha256 = sha256(
    await desiredBytes(String(document.toolLockPath)),
  );
  if (document.id === "node-sbom") {
    document.generator =
      "pnpm 11.13.1 sbom --lockfile-only --prod --sbom-format cyclonedx --sbom-spec-version 1.6";
  }
  if (document.id === "runner-container-sbom") {
    document.generator =
      "syft 1.44.0 --config scripts/syft-release.yaml oci-archive:<source-bound-runner> -o cyclonedx-json";
  }
}
outputs.set(sbomManifestPath, pretty(sbomManifest));

const catalog = ScientificEngineEvidenceCatalogSchema.parse(
  await json("scientific-engines/evidence-catalog.json"),
);
const reachabilityRecord = catalog.records.find((record) =>
  [
    "cpython-html-parser-reachability-v1",
    "cpython-html-parser-reachability-v2",
  ].includes(record.id),
);
if (reachabilityRecord === undefined) {
  throw new Error("Reachability evidence catalog record is missing");
}
reachabilityRecord.id = "cpython-html-parser-reachability-v2";
reachabilityRecord.path =
  "scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json";
for (const record of catalog.records) {
  record.sha256 = sha256(await desiredBytes(record.path));
  if (
    record.id === "grype-raw-scan-v2" &&
    !record.limitations.some((value) => value.includes("normalized"))
  ) {
    record.limitations.push(
      "Repository-local scanner paths are normalized without changing finding or image identities.",
    );
  }
}
outputs.set("scientific-engines/evidence-catalog.json", pretty(catalog));

const runtime = ScientificEngineRuntimeManifestSchema.parse(
  await json("scientific-engines/runtime-manifest.json"),
);
const resourceProfilePath = `scientific-engines/fixtures/validation/${runtime.resourceLimitProfileId}.json`;
const resourceProfile = object(
  await json(resourceProfilePath),
  resourceProfilePath,
);
const resourceContainer = object(
  resourceProfile.container,
  `${resourceProfilePath}.container`,
);
if (
  resourceProfile.evidenceId !== runtime.resourceLimitProfileId ||
  typeof resourceContainer.vcpu !== "number" ||
  typeof resourceContainer.memoryMb !== "number" ||
  typeof resourceContainer.diskMb !== "number"
) {
  throw new Error("Runner resource profile is invalid");
}
runtime.generatedAt = generatedIso;
runtime.sourceCommit = receipt.sourceCommit;
runtime.registryHash = registryHash;
runtime.bindingsHash = bindingsHash;
runtime.container.imageDigest = receipt.localImageDigest;
runtime.container.vcpu = resourceContainer.vcpu;
runtime.container.memoryMb = resourceContainer.memoryMb;
runtime.container.diskMb = resourceContainer.diskMb;
for (const installed of runtime.installedEngines) {
  const integrity = object(
    await json(ENGINE_INTEGRITY[installed.engineId]!),
    installed.engineId,
  );
  installed.artifactSha256 = String(
    object(integrity.artifact, `${installed.engineId}.artifact`).sha256,
  );
}
for (const [id, path] of [
  ["requirements-build-lock", "requirements.build.lock.txt"],
  ["requirements-runner-lock", "requirements.runner.lock.txt"],
  ["requirements-sbom-lock", "requirements.sbom.lock.txt"],
  ["pnpm-lock", "pnpm-lock.yaml"],
  ["sbom-tool-lock", "docs/sbom/tool-lock.json"],
] as const) {
  runtime.lockHashes[id] = sha256(await desiredBytes(path));
}
for (const [id, path] of [
  ["node-sbom", "docs/sbom/node.cdx.json"],
  ["python-sbom", "docs/sbom/python.cdx.json"],
  ["runner-container-sbom", "docs/sbom/runner-container.cdx.json"],
] as const) {
  runtime.sbomHashes[id] = sha256(await desiredBytes(path));
}
runtime.sbomManifestHash = sha256(await desiredBytes(sbomManifestPath));
runtime.vulnerabilityReportHash = sha256(
  await desiredBytes("docs/sbom/vulnerability-report.json"),
);
runtime.vexEvidenceId = "cpython-html-parser-vex-v1";
runtime.vexEvidenceHash = sha256(
  await desiredBytes(
    "scientific-engines/vex/cpython-html-parser-v1.openvex.json",
  ),
);
runtime.reachabilityEvidenceId = "cpython-html-parser-reachability-v2";
runtime.reachabilityEvidenceHash = sha256(
  await desiredBytes(
    "scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json",
  ),
);
runtime.vexApplicationEvidenceId = "cpython-html-parser-vex-application-v1";
runtime.vexApplicationEvidenceHash = sha256(
  await desiredBytes("docs/sbom/vex-application-report.json"),
);
outputs.set("scientific-engines/runtime-manifest.json", pretty(runtime));

const snapshot = await validateScientificEngineSnapshot({
  schemaVersion: "1",
  registry,
  bindings,
  runtimeManifest: runtime,
  evidenceCatalog: catalog,
});
const snapshotContent = `${canonicalizeScientificEngineSnapshot(snapshot)}\n`;
const authorityHash = await hashScientificEngineSnapshot(snapshot);
outputs.set("scientific-engines/snapshot.json", snapshotContent);
outputs.set(
  "scientific-engines/snapshot-hash.json",
  pretty({
    schemaVersion: "1",
    environmentId: runtime.environmentId,
    environmentKind: runtime.environmentKind,
    generatedAt: runtime.generatedAt,
    authorityHash,
    snapshotFileSha256: sha256(snapshotContent),
    registryHash,
    bindingsHash,
  }),
);

if (mode === "write") {
  const desiredOutputs = [...outputs.entries()];
  const physicalOutputs = await Promise.all(
    desiredOutputs.map(([path]) => writableOutput(path)),
  );
  await Promise.all(
    physicalOutputs.map((output) =>
      access(output.isNew ? dirname(output.path) : output.path, constants.W_OK),
    ),
  );
  for (const [index, [, content]] of desiredOutputs.entries()) {
    const output = physicalOutputs[index]!;
    await writeFile(output.path, content, {
      encoding: "utf8",
      flag: output.isNew ? "wx" : "w",
      mode: 0o600,
    });
  }
}
process.stdout.write(
  `SOURCE_BOUND_EVIDENCE_${mode === "write" ? "BOUND" : "VALID"} files=${outputs.size} authority=${authorityHash}\n`,
);
