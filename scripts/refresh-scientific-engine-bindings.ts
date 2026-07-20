import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import {
  ScientificEngineEvidenceCatalogSchema,
  ScientificEngineRuntimeManifestSchema,
  SubjectPackEngineBindingsSchema,
  canonicalizeScientificEngineSnapshot,
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

const root = await realpath(resolve(import.meta.dirname, ".."));

function sha256(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isContained(candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function safeFile(requested: string): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isContained(candidate)) {
    throw new Error(`Evidence path escapes the repository: ${requested}`);
  }
  const metadata = await lstat(candidate);
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Evidence path is not a regular file: ${requested}`);
  }
  const physical = await realpath(candidate);
  if (!isContained(physical)) {
    throw new Error(`Evidence path escapes through a symlink: ${requested}`);
  }
  return physical;
}

async function bytes(requested: string): Promise<Buffer> {
  return readFile(await safeFile(requested));
}

async function json(requested: string): Promise<unknown> {
  return JSON.parse((await bytes(requested)).toString("utf8")) as unknown;
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

async function desiredInternalEvidence(
  evidenceId: (typeof INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS)[number],
): Promise<{ path: string; content: string; hash: string }> {
  const path = `scientific-engines/fixtures/validation/${evidenceId}.json`;
  const current = object(await json(path), path);
  if (
    current.schemaVersion !== "2" ||
    current.evidenceId !== evidenceId ||
    current.kind !== "integrity"
  ) {
    throw new Error(`${path} has an unexpected identity`);
  }
  const refreshedFiles: Record<string, string> = {};
  for (const sourcePath of internalScientificIntegrityPaths(evidenceId)) {
    refreshedFiles[sourcePath] = sha256(await bytes(sourcePath));
  }
  const content = pretty({ ...current, files: refreshedFiles });
  return { path, content, hash: sha256(content) };
}

async function desiredSignedResultBinding(): Promise<{
  path: string;
  content: string;
  hash: string;
}> {
  const path =
    "scientific-engines/fixtures/validation/signed-result-binding-v2.json";
  const current = object(await json(path), path);
  if (
    current.schemaVersion !== "2" ||
    current.evidenceId !== "signed-result-binding-v2" ||
    current.kind !== "golden_fixture"
  ) {
    throw new Error(`${path} has an unexpected identity`);
  }
  const desired = {
    ...current,
    contractPath: SIGNED_RESULT_BINDING_V2_SCOPE.contractPath,
    codePaths: [...SIGNED_RESULT_BINDING_V2_SCOPE.codePaths],
    tests: [...SIGNED_RESULT_BINDING_V2_SCOPE.tests],
  };
  assertSignedResultBindingV2Scope({
    contractPath: String(desired.contractPath),
    codePaths: array(desired.codePaths, `${path}.codePaths`).map(String),
    tests: array(desired.tests, `${path}.tests`).map(String),
  });
  const content = pretty(desired);
  return { path, content, hash: sha256(content) };
}

function exactRecord(
  catalog: ReturnType<typeof ScientificEngineEvidenceCatalogSchema.parse>,
  id: string,
) {
  const matches = catalog.records.filter((record) => record.id === id);
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one evidence record for ${id}`);
  }
  return matches[0]!;
}

function assertNormalizedNodeSbom(value: unknown): number {
  const bom = object(value, "Node SBOM");
  if (
    bom.bomFormat !== "CycloneDX" ||
    bom.specVersion !== "1.6" ||
    bom.version !== 1 ||
    "serialNumber" in bom
  ) {
    throw new Error("Node SBOM must be normalized CycloneDX 1.6");
  }
  const metadata = object(bom.metadata, "Node SBOM metadata");
  if ("timestamp" in metadata) {
    throw new Error("Normalized Node SBOM must omit metadata.timestamp");
  }
  const tools = object(metadata.tools, "Node SBOM tools");
  const toolComponents = array(
    tools.components,
    "Node SBOM tool components",
  ).map((entry) => object(entry, "Node SBOM tool component"));
  if (
    !toolComponents.some(
      (tool) => tool.name === "pnpm" && tool.version === "11.13.1",
    )
  ) {
    throw new Error("Node SBOM is not attributed to pinned pnpm 11.13.1");
  }
  return array(bom.components, "Node SBOM components").length;
}

async function desiredOutputs(): Promise<Map<string, string>> {
  assertScientificIntegrityScopeRelationships();
  const outputs = new Map<string, string>();
  const internal = await Promise.all(
    INTERNAL_SCIENTIFIC_INTEGRITY_EVIDENCE_IDS.map((evidenceId) =>
      desiredInternalEvidence(evidenceId),
    ),
  );
  for (const evidence of internal) outputs.set(evidence.path, evidence.content);
  const signedResultBinding = await desiredSignedResultBinding();
  outputs.set(signedResultBinding.path, signedResultBinding.content);

  const catalog = ScientificEngineEvidenceCatalogSchema.parse(
    await json("scientific-engines/evidence-catalog.json"),
  );
  const bindings = SubjectPackEngineBindingsSchema.parse(
    await json("scientific-engines/subject-pack-bindings.json"),
  );
  const runtime = ScientificEngineRuntimeManifestSchema.parse(
    await json("scientific-engines/runtime-manifest.json"),
  );

  for (const evidence of internal) {
    const record = exactRecord(
      catalog,
      evidence.path
        .split("/")
        .at(-1)!
        .replace(/\.json$/u, ""),
    );
    if (record.kind !== "integrity" || record.path !== evidence.path) {
      throw new Error(`Internal evidence record ${record.id} is misbound`);
    }
    record.sha256 = evidence.hash;
    let roleCount = 0;
    for (const pack of bindings.subjectPacks) {
      for (const role of Object.values(pack.roles)) {
        if (
          role.kind === "INTERNAL" &&
          role.integrityEvidenceId === record.id
        ) {
          role.integrityHash = evidence.hash;
          roleCount += 1;
        }
      }
    }
    if (roleCount !== bindings.subjectPacks.length) {
      throw new Error(
        `Internal evidence ${record.id} must bind every released Subject Pack`,
      );
    }
  }
  const signedResultRecord = exactRecord(catalog, "signed-result-binding-v2");
  if (
    signedResultRecord.kind !== "golden_fixture" ||
    signedResultRecord.path !== signedResultBinding.path
  ) {
    throw new Error("Signed-result binding evidence record is misbound");
  }
  signedResultRecord.sha256 = signedResultBinding.hash;

  const pnpmLockHash = sha256(await bytes("pnpm-lock.yaml"));
  const nodeSbomBytes = await bytes("docs/sbom/node.cdx.json");
  const nodeSbom = JSON.parse(nodeSbomBytes.toString("utf8")) as unknown;
  const nodeComponentCount = assertNormalizedNodeSbom(nodeSbom);
  const nodeSbomHash = sha256(nodeSbomBytes);
  const pnpmRecord = exactRecord(catalog, "pnpm-lock");
  const nodeSbomRecord = exactRecord(catalog, "node-sbom");
  if (
    pnpmRecord.kind !== "lockfile" ||
    pnpmRecord.path !== "pnpm-lock.yaml" ||
    nodeSbomRecord.kind !== "sbom" ||
    nodeSbomRecord.path !== "docs/sbom/node.cdx.json"
  ) {
    throw new Error("Node lock or SBOM evidence record is misbound");
  }
  pnpmRecord.sha256 = pnpmLockHash;
  nodeSbomRecord.sha256 = nodeSbomHash;
  runtime.lockHashes["pnpm-lock"] = pnpmLockHash;
  runtime.sbomHashes["node-sbom"] = nodeSbomHash;

  const bindingsHash = await hashSubjectPackEngineBindings(bindings);
  runtime.bindingsHash = bindingsHash;

  const sbomManifestPath = "docs/sbom/manifest.json";
  const sbomManifest = object(await json(sbomManifestPath), sbomManifestPath);
  sbomManifest.bindingsHash = bindingsHash;
  const documents = array(
    sbomManifest.documents,
    "SBOM manifest documents",
  ).map((entry) => object(entry, "SBOM manifest document"));
  const nodeDocuments = documents.filter(
    (document) => document.id === "node-sbom",
  );
  if (nodeDocuments.length !== 1) {
    throw new Error(
      "SBOM manifest must contain exactly one node-sbom document",
    );
  }
  const nodeDocument = nodeDocuments[0]!;
  if (
    nodeDocument.path !== "docs/sbom/node.cdx.json" ||
    nodeDocument.toolLockPath !== "pnpm-lock.yaml"
  ) {
    throw new Error("SBOM manifest node document is misbound");
  }
  nodeDocument.componentCount = nodeComponentCount;
  nodeDocument.sha256 = nodeSbomHash;
  nodeDocument.toolLockSha256 = pnpmLockHash;
  const sbomManifestContent = pretty(sbomManifest);
  const sbomManifestHash = sha256(sbomManifestContent);
  const sbomManifestRecord = exactRecord(catalog, "sbom-manifest-v1");
  if (
    sbomManifestRecord.kind !== "sbom_manifest" ||
    sbomManifestRecord.path !== sbomManifestPath
  ) {
    throw new Error("SBOM manifest evidence record is misbound");
  }
  sbomManifestRecord.sha256 = sbomManifestHash;
  runtime.sbomManifestHash = sbomManifestHash;

  const registry = await json("scientific-engines/registry.json");
  const snapshot = await validateScientificEngineSnapshot({
    schemaVersion: "1",
    registry,
    bindings,
    runtimeManifest: runtime,
    evidenceCatalog: catalog,
  });
  const snapshotContent = `${canonicalizeScientificEngineSnapshot(snapshot)}\n`;
  const authorityHash = await hashScientificEngineSnapshot(snapshot);
  const snapshotFileSha256 = sha256(snapshotContent);
  const snapshotHashContent = pretty({
    schemaVersion: "1",
    environmentId: runtime.environmentId,
    environmentKind: runtime.environmentKind,
    generatedAt: runtime.generatedAt,
    authorityHash,
    snapshotFileSha256,
    registryHash: runtime.registryHash,
    bindingsHash: runtime.bindingsHash,
  });

  outputs.set("scientific-engines/evidence-catalog.json", pretty(catalog));
  outputs.set(
    "scientific-engines/subject-pack-bindings.json",
    pretty(bindings),
  );
  outputs.set("scientific-engines/runtime-manifest.json", pretty(runtime));
  outputs.set(sbomManifestPath, sbomManifestContent);
  outputs.set("scientific-engines/snapshot.json", snapshotContent);
  outputs.set("scientific-engines/snapshot-hash.json", snapshotHashContent);
  return outputs;
}

async function main(): Promise<void> {
  const mode = process.argv[2];
  if ((mode !== "--check" && mode !== "--write") || process.argv.length !== 3) {
    throw new Error(
      "Usage: refresh-scientific-engine-bindings.ts --check|--write",
    );
  }
  const outputs = await desiredOutputs();
  const drift: string[] = [];
  for (const [path, content] of outputs) {
    const current = (await bytes(path)).toString("utf8");
    if (current !== content) drift.push(path);
  }
  if (mode === "--check") {
    if (drift.length > 0) {
      throw new Error(`Scientific evidence drift: ${drift.join(", ")}`);
    }
    process.stdout.write("SCIENTIFIC_BINDINGS_CURRENT\n");
    return;
  }
  for (const [path, content] of outputs) {
    if (!drift.includes(path)) continue;
    await writeFile(await safeFile(path), content, { encoding: "utf8" });
  }
  process.stdout.write(`SCIENTIFIC_BINDINGS_REFRESHED files=${drift.length}\n`);
}

await main();
