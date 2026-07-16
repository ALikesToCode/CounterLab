import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalizeScientificEngineSnapshot,
  hashScientificEngineSnapshot,
  OpenVexDocumentSchema,
  ReachabilityReportV1Schema,
  summarizeGrypeScan,
  summarizeVexApplication,
  validateScientificEngineSnapshot,
  verifyVulnerabilityAuthority,
  VulnerabilityReportV2Schema,
  VexApplicationReportV1Schema,
  type ScientificEngineSnapshot,
} from "../packages/scientific-engine-registry/src/index.js";
import { releasedConceptPacks } from "../packages/concept-registry/src/index.js";

export type ScientificEngineVerificationFinding = {
  code: string;
  path: string;
  message: string;
};

type JsonObject = Record<string, unknown>;

const SHA256 = /^[a-f0-9]{64}$/;
const EXACT_VERSION = /^[0-9][0-9A-Za-z.+_-]*$/;
const CONTAINER_DIGEST = /@sha256:[a-f0-9]{64}(?:\s|$)/;
const FORBIDDEN_CDN_HOSTS = new Set([
  "cdnjs.cloudflare.com",
  "cdn.jsdelivr.net",
  "esm.sh",
  "unpkg.com",
]);

function finding(
  code: string,
  path: string,
  message: string,
): ScientificEngineVerificationFinding {
  return { code, path, message };
}

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function isWithin(root: string, candidate: string): boolean {
  const child = relative(root, candidate);
  return child === "" || (!child.startsWith(`..${sep}`) && child !== "..");
}

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function filesNamed(
  root: string,
  predicate: (name: string, path: string) => boolean,
): Promise<string[]> {
  const output: string[] = [];
  const ignored = new Set([
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    ".venv",
    "data",
    "dist",
    "node_modules",
    "playwright-report",
    "test-results",
  ]);

  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (ignored.has(entry.name)) continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(path);
      } else if (entry.isFile() && predicate(entry.name, path)) {
        output.push(path);
      }
    }
  }

  await walk(root);
  return output.sort();
}

export async function loadScientificEngineSnapshot(
  root: string,
): Promise<ScientificEngineSnapshot> {
  const input = await json(resolve(root, "scientific-engines/snapshot.json"));
  return validateScientificEngineSnapshot(input);
}

export async function verifyEvidenceFiles(
  root: string,
  snapshot: ScientificEngineSnapshot,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const rootPath = resolve(root);
  const canonicalRoot = await realpath(rootPath);

  for (const record of snapshot.evidenceCatalog.records) {
    const declaredPath = resolve(rootPath, record.path);
    if (!isWithin(rootPath, declaredPath)) {
      findings.push(
        finding(
          "EVIDENCE_PATH_OUTSIDE_ROOT",
          record.path,
          `Evidence ${record.id} resolves outside the repository root.`,
        ),
      );
      continue;
    }
    if (record.status !== "VERIFIED") {
      findings.push(
        finding(
          "EVIDENCE_NOT_VERIFIED",
          record.path,
          `Evidence ${record.id} has release status ${record.status}.`,
        ),
      );
    }

    try {
      const stat = await lstat(declaredPath);
      if (!stat.isFile() && !stat.isSymbolicLink()) {
        findings.push(
          finding(
            "EVIDENCE_NOT_FILE",
            record.path,
            `Evidence ${record.id} is not a regular file.`,
          ),
        );
        continue;
      }
      const canonicalPath = await realpath(declaredPath);
      if (!isWithin(canonicalRoot, canonicalPath)) {
        findings.push(
          finding(
            "EVIDENCE_PATH_OUTSIDE_ROOT",
            record.path,
            `Evidence ${record.id} escapes the repository through a symbolic link.`,
          ),
        );
        continue;
      }
      const bytes = await readFile(canonicalPath);
      const observed = sha256(bytes);
      if (observed !== record.sha256) {
        findings.push(
          finding(
            "EVIDENCE_HASH_MISMATCH",
            record.path,
            `Evidence ${record.id} declares ${record.sha256}, observed ${observed}.`,
          ),
        );
      }

      if (record.kind === "integrity") {
        const evidence = object(
          JSON.parse(bytes.toString("utf8")) as unknown,
        );
        const declaredFiles = object(evidence?.files);
        for (const [nestedPath, expectedHash] of Object.entries(
          declaredFiles ?? {},
        )) {
          if (typeof expectedHash !== "string" || !SHA256.test(expectedHash)) {
            findings.push(
              finding(
                "INTERNAL_INTEGRITY_HASH_INVALID",
                nestedPath,
                `Integrity evidence ${record.id} declares an invalid SHA-256.`,
              ),
            );
            continue;
          }
          const nestedDeclaredPath = resolve(rootPath, nestedPath);
          if (!isWithin(rootPath, nestedDeclaredPath)) {
            findings.push(
              finding(
                "INTERNAL_INTEGRITY_PATH_OUTSIDE_ROOT",
                nestedPath,
                `Integrity evidence ${record.id} resolves outside the repository root.`,
              ),
            );
            continue;
          }
          try {
            const nestedStat = await lstat(nestedDeclaredPath);
            if (!nestedStat.isFile() && !nestedStat.isSymbolicLink()) {
              findings.push(
                finding(
                  "INTERNAL_INTEGRITY_NOT_FILE",
                  nestedPath,
                  `Integrity evidence ${record.id} does not resolve to a regular file.`,
                ),
              );
              continue;
            }
            const nestedCanonicalPath = await realpath(nestedDeclaredPath);
            if (!isWithin(canonicalRoot, nestedCanonicalPath)) {
              findings.push(
                finding(
                  "INTERNAL_INTEGRITY_PATH_OUTSIDE_ROOT",
                  nestedPath,
                  `Integrity evidence ${record.id} escapes the repository through a symbolic link.`,
                ),
              );
              continue;
            }
            const nestedObservedHash = sha256(
              await readFile(nestedCanonicalPath),
            );
            if (nestedObservedHash !== expectedHash) {
              findings.push(
                finding(
                  "INTERNAL_INTEGRITY_FILE_HASH_MISMATCH",
                  nestedPath,
                  `Integrity evidence ${record.id} declares ${expectedHash}, observed ${nestedObservedHash}.`,
                ),
              );
            }
          } catch (error) {
            findings.push(
              finding(
                "INTERNAL_INTEGRITY_FILE_MISSING",
                nestedPath,
                `Integrity evidence ${record.id} cannot read its declared file: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
          }
        }
      }
    } catch (error) {
      findings.push(
        finding(
          "EVIDENCE_FILE_MISSING",
          record.path,
          `Evidence ${record.id} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  return findings;
}

function object(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

export function verifyRuntimeIntegrityEvidence(
  input: unknown,
  snapshot: ScientificEngineSnapshot,
  dockerfileText: string,
): ScientificEngineVerificationFinding[] {
  const findings: ScientificEngineVerificationFinding[] = [];
  const path =
    "scientific-engines/fixtures/integrity/cpython-runtime-3.13.14.json";
  const evidence = object(input);
  const baseImage = object(evidence?.baseImage);
  const releaseGate = object(evidence?.releaseGate);
  const runtime = snapshot.runtimeManifest.runtimes.find(
    (candidate) => candidate.id === "cpython",
  );
  const expectedPlatform = `${snapshot.runtimeManifest.platform.os}/${snapshot.runtimeManifest.platform.architecture}`;

  if (
    !runtime ||
    evidence?.schemaVersion !== "1" ||
    evidence.evidenceKind !== "runtime-integrity" ||
    evidence.runtimeId !== runtime.id ||
    evidence.exactVersion !== runtime.exactVersion ||
    evidence.environmentId !== snapshot.runtimeManifest.environmentId ||
    evidence.imageDigest !== snapshot.runtimeManifest.container.imageDigest ||
    evidence.installedLicenseSha256 !== runtime.licenseFileHash ||
    baseImage?.platform !== expectedPlatform
  ) {
    findings.push(
      finding(
        "RUNTIME_INTEGRITY_SEMANTICS_MISMATCH",
        path,
        "CPython integrity evidence does not bind the current runtime manifest.",
      ),
    );
  }

  const declaredReference = baseImage?.reference;
  const dockerReferences = new Set(
    [...dockerfileText.matchAll(/^\s*FROM\s+(\S+)/gim)].map(
      (match) => match[1],
    ),
  );
  if (
    typeof declaredReference !== "string" ||
    !/^[^\s@]+@sha256:[a-f0-9]{64}$/.test(declaredReference) ||
    !dockerReferences.has(declaredReference)
  ) {
    findings.push(
      finding(
        "RUNTIME_BASE_IMAGE_MISMATCH",
        `${path}:baseImage.reference`,
        "Runtime evidence must name the exact 64-hex base-image digest used by Dockerfile.runner.",
      ),
    );
  }

  if (
    !["VERIFIED", "VERIFIED_WITH_REVIEWED_EXCEPTION"].includes(
      String(releaseGate?.status),
    ) ||
    !Array.isArray(releaseGate?.limitations) ||
    releaseGate.limitations.length === 0
  ) {
    findings.push(
      finding(
        "RUNTIME_RELEASE_GATE_INVALID",
        `${path}:releaseGate`,
        "Runtime integrity evidence requires an explicit verified status and limitations.",
      ),
    );
  }

  return findings;
}

function failedHealthValue(value: unknown, key = ""): boolean {
  if (typeof value === "string") {
    return /^(?:FAILED|REJECTED|ERROR)$/i.test(value);
  }
  if (typeof value === "number" && /thread/i.test(key)) {
    return !Number.isInteger(value) || value !== 1;
  }
  const record = object(value);
  return record
    ? Object.entries(record).some(([childKey, child]) =>
        failedHealthValue(child, childKey),
      )
    : false;
}

export async function verifyEvidenceSemantics(
  root: string,
  snapshot: ScientificEngineSnapshot,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const licenseManifest = object(
    await json(resolve(root, "scientific-engines/licenses/manifest.json")),
  );
  const licenseEntries = Array.isArray(licenseManifest?.entries)
    ? (licenseManifest.entries as JsonObject[])
    : [];
  const records = new Map(
    snapshot.evidenceCatalog.records.map((record) => [record.id, record]),
  );

  const runtimeIntegrityRecord = records.get("cpython-runtime-integrity-v1");
  if (!runtimeIntegrityRecord) {
    findings.push(
      finding(
        "RUNTIME_INTEGRITY_EVIDENCE_MISSING",
        "scientific-engines/evidence-catalog.json",
        "The recorded CPython runtime requires exact base-image integrity evidence.",
      ),
    );
  } else {
    try {
      const [evidence, dockerfileText] = await Promise.all([
        json(resolve(root, runtimeIntegrityRecord.path)),
        readFile(resolve(root, "Dockerfile.runner"), "utf8"),
      ]);
      findings.push(
        ...verifyRuntimeIntegrityEvidence(evidence, snapshot, dockerfileText),
      );
    } catch (error) {
      findings.push(
        finding(
          "RUNTIME_INTEGRITY_EVIDENCE_INVALID",
          runtimeIntegrityRecord.path,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  for (const installed of snapshot.runtimeManifest.installedEngines) {
    const descriptor = snapshot.registry.engines.find(
      (engine) => engine.id === installed.engineId,
    );
    const integrityRecord = snapshot.evidenceCatalog.records.find(
      (record) =>
        record.engineId === installed.engineId && record.kind === "integrity",
    );
    if (!descriptor || !integrityRecord) continue;
    try {
      const integrity = object(await json(resolve(root, integrityRecord.path)));
      const artifact = object(integrity?.artifact);
      const sourceBinding = object(integrity?.sourceBinding);
      const releaseGate = object(integrity?.releaseGate);
      const installedEvidence = object(integrity?.installed);
      if (
        integrity?.engineId !== installed.engineId ||
        integrity.packageName !== installed.packageName ||
        integrity.exactVersion !== installed.exactVersion ||
        integrity.environmentId !== snapshot.runtimeManifest.environmentId ||
        integrity.imageDigest !==
          snapshot.runtimeManifest.container.imageDigest ||
        sourceBinding?.status !== "BOUND" ||
        sourceBinding.commit !== snapshot.runtimeManifest.sourceCommit ||
        releaseGate?.status !== "VERIFIED"
      ) {
        findings.push(
          finding(
            "ENGINE_INTEGRITY_SEMANTICS_MISMATCH",
            integrityRecord.path,
            `Integrity evidence does not bind ${installed.engineId} to the runtime manifest.`,
          ),
        );
      }
      if (artifact?.sha256 !== installed.artifactSha256) {
        findings.push(
          finding(
            "ENGINE_ARTIFACT_HASH_MISMATCH",
            integrityRecord.path,
            `Installed artifact hash for ${installed.engineId} is not bound by its integrity evidence.`,
          ),
        );
      }
      const licenseEntry = licenseEntries.find(
        (entry) => entry.engineId === installed.engineId,
      );
      if (
        licenseEntry === undefined ||
        installedEvidence?.licenseSha256 !== licenseEntry.installedLicenseSha256
      ) {
        findings.push(
          finding(
            "ENGINE_LICENSE_SEMANTICS_MISMATCH",
            integrityRecord.path,
            `Installed license hash for ${installed.engineId} differs from its descriptor.`,
          ),
        );
      }
    } catch (error) {
      findings.push(
        finding(
          "ENGINE_INTEGRITY_EVIDENCE_INVALID",
          integrityRecord.path,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }

    const healthRecord = records.get(installed.healthEvidenceId);
    if (healthRecord) {
      try {
        const health = object(await json(resolve(root, healthRecord.path)));
        if (
          health?.engineId !== installed.engineId ||
          health.environmentId !== snapshot.runtimeManifest.environmentId ||
          health.imageDigest !==
            snapshot.runtimeManifest.container.imageDigest ||
          health.observedVersion !== installed.exactVersion ||
          failedHealthValue(health.checks)
        ) {
          findings.push(
            finding(
              "ENGINE_HEALTH_SEMANTICS_MISMATCH",
              healthRecord.path,
              `Health evidence does not verify ${installed.engineId} for this runtime.`,
            ),
          );
        }
      } catch (error) {
        findings.push(
          finding(
            "ENGINE_HEALTH_EVIDENCE_INVALID",
            healthRecord.path,
            error instanceof Error ? error.message : String(error),
          ),
        );
      }
    }
  }

  const toleranceIds = new Set(
    snapshot.runtimeManifest.installedEngines.map(
      (installed) => installed.toleranceProfileId,
    ),
  );
  for (const toleranceId of toleranceIds) {
    const record = records.get(toleranceId);
    if (!record) continue;
    try {
      const profile = object(await json(resolve(root, record.path)));
      const threads = object(profile?.threadPolicy);
      if (
        profile?.evidenceId !== toleranceId ||
        profile.supportedPlatform !==
          `${snapshot.runtimeManifest.platform.os}/${snapshot.runtimeManifest.platform.architecture}` ||
        threads?.blas !== 1 ||
        threads.openmp !== 1
      ) {
        findings.push(
          finding(
            "TOLERANCE_PROFILE_SEMANTICS_MISMATCH",
            record.path,
            `Tolerance profile ${toleranceId} does not match the runtime platform and deterministic thread policy.`,
          ),
        );
      }
    } catch (error) {
      findings.push(
        finding(
          "TOLERANCE_PROFILE_INVALID",
          record.path,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  const resourceRecord = records.get(
    snapshot.runtimeManifest.resourceLimitProfileId,
  );
  if (resourceRecord) {
    try {
      const profile = object(await json(resolve(root, resourceRecord.path)));
      const container = object(profile?.container);
      if (
        profile?.evidenceId !==
          snapshot.runtimeManifest.resourceLimitProfileId ||
        container?.vcpu !== snapshot.runtimeManifest.container.vcpu ||
        container.memoryMb !== snapshot.runtimeManifest.container.memoryMb ||
        container.diskMb !== snapshot.runtimeManifest.container.diskMb
      ) {
        findings.push(
          finding(
            "RESOURCE_PROFILE_MISMATCH",
            resourceRecord.path,
            "Runtime container resources differ from the recorded resource profile.",
          ),
        );
      }
    } catch (error) {
      findings.push(
        finding(
          "RESOURCE_PROFILE_INVALID",
          resourceRecord.path,
          error instanceof Error ? error.message : String(error),
        ),
      );
    }
  }

  return findings;
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    [...left].sort().every((value, index) => value === [...right].sort()[index])
  );
}

export function verifyConceptPackBindings(
  snapshot: ScientificEngineSnapshot,
): ScientificEngineVerificationFinding[] {
  const findings: ScientificEngineVerificationFinding[] = [];
  const released = releasedConceptPacks();

  for (const pack of released) {
    const binding = snapshot.bindings.subjectPacks.find(
      (candidate) => candidate.subjectPackId === pack.id,
    );
    if (!binding) {
      findings.push(
        finding(
          "SUBJECT_PACK_BINDING_MISSING",
          "scientific-engines/subject-pack-bindings.json",
          `Released Subject Pack ${pack.id}@${pack.version} has no engine authority binding.`,
        ),
      );
      continue;
    }
    if (binding.subjectPackVersion !== pack.version) {
      findings.push(
        finding(
          "SUBJECT_PACK_VERSION_MISMATCH",
          `bindings.${pack.id}`,
          `Released Subject Pack is ${pack.version}, binding is ${binding.subjectPackVersion}.`,
        ),
      );
    }
    const operations = binding.operationAuthorities.map(
      (authority) => authority.operationId,
    );
    if (!sameStringSet(operations, pack.allowedOperations)) {
      findings.push(
        finding(
          "SUBJECT_PACK_OPERATION_SET_MISMATCH",
          `bindings.${pack.id}.operationAuthorities`,
          `Engine bindings do not exactly match released operations for ${pack.id}.`,
        ),
      );
    }
  }

  const releasedIds = new Set(released.map((pack) => pack.id));
  for (const binding of snapshot.bindings.subjectPacks) {
    if (!releasedIds.has(binding.subjectPackId as never)) {
      findings.push(
        finding(
          "UNRELEASED_SUBJECT_PACK_BOUND",
          `bindings.${binding.subjectPackId}`,
          `Engine authority is published for non-released Subject Pack ${binding.subjectPackId}.`,
        ),
      );
    }
  }

  const operationIdsByEngine = new Map<string, Set<string>>();
  for (const pack of snapshot.bindings.subjectPacks) {
    for (const authority of pack.operationAuthorities) {
      for (const engineId of authority.authoritativeEngineIds) {
        const operations =
          operationIdsByEngine.get(engineId) ?? new Set<string>();
        operations.add(authority.operationId);
        operationIdsByEngine.set(engineId, operations);
      }
    }
  }
  for (const engine of snapshot.registry.engines) {
    const bound = [...(operationIdsByEngine.get(engine.id) ?? [])];
    if (!sameStringSet(bound, engine.allowedOperationIds)) {
      findings.push(
        finding(
          "ENGINE_OPERATION_AUTHORITY_DRIFT",
          `registry.engines.${engine.id}.allowedOperationIds`,
          `Allowed operations for ${engine.id} are not exactly bound to released Subject Packs.`,
        ),
      );
    }
  }
  return findings;
}

function exactDependencySpecifier(value: string): boolean {
  return value.startsWith("workspace:") || EXACT_VERSION.test(value);
}

function packageDependencyEntries(value: JsonObject): [string, string][] {
  const fields = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  return fields.flatMap((field) => {
    const dependencies = value[field];
    if (
      dependencies === null ||
      typeof dependencies !== "object" ||
      Array.isArray(dependencies)
    ) {
      return [];
    }
    return Object.entries(dependencies as Record<string, unknown>)
      .filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      )
      .map(([name, version]) => [`${field}.${name}`, version]);
  });
}

function verifyRequirementsText(
  path: string,
  text: string,
): ScientificEngineVerificationFinding[] {
  const findings: ScientificEngineVerificationFinding[] = [];
  const requirementLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith("--") &&
        !line.startsWith("\\"),
    )
    .filter((line) => !line.startsWith("--hash="));

  for (const line of requirementLines) {
    const specifier = line.replace(/\\$/, "").trim();
    if (!/^[A-Za-z0-9_.-]+==[0-9][0-9A-Za-z.+_-]*$/.test(specifier)) {
      findings.push(
        finding(
          "FLOATING_PYTHON_DEPENDENCY",
          path,
          `Python requirement is not an exact package==version pin: ${specifier}`,
        ),
      );
    }
  }

  if (/requirements\.(?:runner|build|sbom)\.lock\.txt$/.test(path)) {
    const hashes = text.match(/--hash=sha256:[a-f0-9]{64}/g) ?? [];
    if (hashes.length !== requirementLines.length) {
      findings.push(
        finding(
          "PYTHON_LOCK_HASH_COVERAGE_MISMATCH",
          path,
          `Expected one wheel hash per pinned package; found ${hashes.length} hashes for ${requirementLines.length} packages.`,
        ),
      );
    }
  }
  return findings;
}

export async function verifyPinnedSources(
  root: string,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const rootPath = resolve(root);

  for (const path of await filesNamed(
    rootPath,
    (name) => name === "Dockerfile" || name.startsWith("Dockerfile."),
  )) {
    const text = await readFile(path, "utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (!/^\s*FROM\s+/i.test(line)) continue;
      if (!CONTAINER_DIGEST.test(line)) {
        findings.push(
          finding(
            "FLOATING_CONTAINER_BASE",
            `${relative(rootPath, path)}:${index + 1}`,
            `Container base must be pinned by sha256 digest: ${line.trim()}`,
          ),
        );
      }
    }
  }

  for (const path of await filesNamed(
    rootPath,
    (name) => name === "package.json",
  )) {
    const value = (await json(path)) as JsonObject;
    for (const [dependency, version] of packageDependencyEntries(value)) {
      if (!exactDependencySpecifier(version)) {
        findings.push(
          finding(
            "FLOATING_NODE_DEPENDENCY",
            `${relative(rootPath, path)}:${dependency}`,
            `Node dependency ${dependency} must use an exact version; observed ${version}.`,
          ),
        );
      }
    }
    if (path === resolve(rootPath, "package.json")) {
      const packageManager = value.packageManager;
      if (
        typeof packageManager !== "string" ||
        !/^pnpm@[0-9][0-9A-Za-z.+_-]*$/.test(packageManager)
      ) {
        findings.push(
          finding(
            "FLOATING_PACKAGE_MANAGER",
            "package.json:packageManager",
            "The pnpm package manager must be pinned to an exact version.",
          ),
        );
      }
    }
  }

  for (const path of await filesNamed(
    rootPath,
    (name) => name.startsWith("requirements") && name.endsWith(".txt"),
  )) {
    findings.push(
      ...verifyRequirementsText(
        relative(rootPath, path),
        await readFile(path, "utf8"),
      ),
    );
  }

  for (const path of await filesNamed(rootPath, (name) =>
    /\.(?:css|html|js|jsx|json|ts|tsx)$/.test(name),
  )) {
    const relativePath = relative(rootPath, path);
    if (
      relativePath.startsWith(`docs${sep}`) ||
      relativePath.startsWith(`scientific-engines${sep}`) ||
      relativePath.includes(`${sep}test${sep}`) ||
      /(?:^|[./-])test\.[^.]+$/.test(relativePath)
    ) {
      continue;
    }
    const text = await readFile(path, "utf8");
    for (const match of text.matchAll(/https:\/\/([^/"'\s)]+)/g)) {
      const host = match[1]?.toLowerCase();
      if (host && FORBIDDEN_CDN_HOSTS.has(host)) {
        findings.push(
          finding(
            "FORBIDDEN_RUNTIME_CDN",
            relativePath,
            `Runtime source references floating CDN host ${host}.`,
          ),
        );
      }
    }
  }

  return findings;
}

type CycloneDxComponent = {
  name?: string;
  version?: string;
};

function cyclonedxComponents(value: JsonObject): CycloneDxComponent[] {
  const components = Array.isArray(value.components)
    ? (value.components as CycloneDxComponent[])
    : [];
  const metadata = value.metadata as JsonObject | undefined;
  const rootComponent = metadata?.component as CycloneDxComponent | undefined;
  return rootComponent ? [rootComponent, ...components] : components;
}

export async function verifySboms(
  root: string,
  snapshot: ScientificEngineSnapshot,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const rootPath = resolve(root);
  const components: CycloneDxComponent[] = [];
  const sbomRecords = snapshot.evidenceCatalog.records.filter(
    (record) => record.kind === "sbom",
  );

  for (const record of sbomRecords) {
    const path = resolve(rootPath, record.path);
    try {
      const value = (await json(path)) as JsonObject;
      if (value.bomFormat !== "CycloneDX" || value.specVersion !== "1.6") {
        findings.push(
          finding(
            "SBOM_SCHEMA_MISMATCH",
            record.path,
            "SBOM must be a CycloneDX 1.6 document.",
          ),
        );
      }
      const metadata = value.metadata as JsonObject | undefined;
      if ("serialNumber" in value || metadata?.timestamp !== undefined) {
        findings.push(
          finding(
            "SBOM_NOT_REPRODUCIBLE",
            record.path,
            "Normalized SBOMs must omit random serial numbers and timestamps.",
          ),
        );
      }
      components.push(...cyclonedxComponents(value));
    } catch (error) {
      findings.push(
        finding(
          "SBOM_INVALID",
          record.path,
          `SBOM cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  for (const engine of snapshot.registry.engines) {
    const matching = components.filter(
      (component) =>
        component.name?.toLowerCase() === engine.packageName.toLowerCase(),
    );
    if (matching.length === 0) {
      findings.push(
        finding(
          "SBOM_ENGINE_MISSING",
          "runtimeManifest.sbomHashes",
          `Registered engine ${engine.packageName}@${engine.exactVersion} is absent from the recorded SBOMs.`,
        ),
      );
    } else if (
      !matching.some((component) => component.version === engine.exactVersion)
    ) {
      findings.push(
        finding(
          "SBOM_ENGINE_VERSION_MISMATCH",
          "runtimeManifest.sbomHashes",
          `Registered engine ${engine.packageName}@${engine.exactVersion} does not match its SBOM version.`,
        ),
      );
    }
  }

  return findings;
}

export async function verifySbomManifest(
  root: string,
  snapshot: ScientificEngineSnapshot,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const record = snapshot.evidenceCatalog.records.find(
    (candidate) =>
      candidate.id === snapshot.runtimeManifest.sbomManifestEvidenceId,
  );
  if (!record) return findings;
  try {
    const manifest = object(await json(resolve(root, record.path)));
    if (
      manifest?.environmentId !== snapshot.runtimeManifest.environmentId ||
      manifest.environmentKind !== snapshot.runtimeManifest.environmentKind ||
      manifest.sourceCommit !== snapshot.runtimeManifest.sourceCommit ||
      manifest.imageDigest !== snapshot.runtimeManifest.container.imageDigest ||
      manifest.registryHash !== snapshot.runtimeManifest.registryHash ||
      manifest.bindingsHash !== snapshot.runtimeManifest.bindingsHash
    ) {
      findings.push(
        finding(
          "SBOM_MANIFEST_RUNTIME_MISMATCH",
          record.path,
          "SBOM manifest does not bind the current runtime, image, registry, and Subject Pack authority.",
        ),
      );
    }
    const documents = Array.isArray(manifest?.documents)
      ? (manifest.documents as JsonObject[])
      : [];
    for (const [id, expectedHash] of Object.entries(
      snapshot.runtimeManifest.sbomHashes,
    )) {
      const document = documents.find((candidate) => candidate.id === id);
      if (
        !document ||
        document.sha256 !== expectedHash ||
        document.format !== "CycloneDX" ||
        document.specVersion !== "1.6" ||
        typeof document.componentCount !== "number" ||
        document.componentCount < 1
      ) {
        findings.push(
          finding(
            "SBOM_MANIFEST_DOCUMENT_MISMATCH",
            record.path,
            `SBOM manifest does not bind document ${id}.`,
          ),
        );
      }
      const lockPath =
        typeof document?.toolLockPath === "string"
          ? document.toolLockPath
          : undefined;
      const lockRecord = lockPath
        ? snapshot.evidenceCatalog.records.find(
            (candidate) =>
              candidate.kind === "lockfile" && candidate.path === lockPath,
          )
        : undefined;
      if (
        !lockRecord ||
        document?.toolLockSha256 !== lockRecord.sha256 ||
        !Object.values(snapshot.runtimeManifest.lockHashes).includes(
          lockRecord.sha256,
        )
      ) {
        findings.push(
          finding(
            "SBOM_TOOL_LOCK_MISMATCH",
            record.path,
            `SBOM document ${id} is not bound to a runtime lockfile.`,
          ),
        );
      }
    }
    if (
      !Array.isArray(manifest?.limitations) ||
      manifest.limitations.length === 0
    ) {
      findings.push(
        finding(
          "SBOM_LIMITATIONS_MISSING",
          record.path,
          "SBOM manifest must state inventory limitations.",
        ),
      );
    }
  } catch (error) {
    findings.push(
      finding(
        "SBOM_MANIFEST_INVALID",
        record.path,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
  return findings;
}

export async function verifyVulnerabilityReport(
  root: string,
  snapshot: ScientificEngineSnapshot,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const record = snapshot.evidenceCatalog.records.find(
    (candidate) =>
      candidate.id === snapshot.runtimeManifest.vulnerabilityReportEvidenceId,
  );
  if (!record) return findings;
  try {
    const reportValue = await json(resolve(root, record.path));
    const report = object(reportValue);
    const scanner = object(report?.scanner);
    const policy = object(report?.policy);
    const fixable = object(report?.fixableFindingsBySeverity);
    const passingStatus =
      report?.schemaVersion === "2"
        ? policy?.status === "PASSED" ||
          policy?.status === "PASSED_WITH_REVIEWED_EXCEPTION"
        : policy?.status === "PASSED";
    if (
      report?.environmentId !== snapshot.runtimeManifest.environmentId ||
      report.environmentKind !== snapshot.runtimeManifest.environmentKind ||
      report.imageDigest !== snapshot.runtimeManifest.container.imageDigest ||
      scanner?.databaseValid !== true ||
      !passingStatus ||
      policy?.fixableCriticalCount !== 0
    ) {
      findings.push(
        finding(
          "VULNERABILITY_REPORT_RUNTIME_MISMATCH",
          record.path,
          "Vulnerability report does not bind a passing scan to the current runtime image.",
        ),
      );
    }
    if (
      !Array.isArray(report?.limitations) ||
      report.limitations.length === 0
    ) {
      findings.push(
        finding(
          "VULNERABILITY_LIMITATIONS_MISSING",
          record.path,
          "Vulnerability evidence must state scan limitations and known residual risk.",
        ),
      );
    }

    if (report?.schemaVersion !== "2") {
      if (
        snapshot.runtimeManifest.environmentKind === "cloudflare_production" &&
        (Number(fixable?.Critical ?? 0) > 0 || Number(fixable?.High ?? 0) > 0)
      ) {
        findings.push(
          finding(
            "PRODUCTION_FIXABLE_HIGH_VULNERABILITY",
            record.path,
            "Legacy vulnerability evidence cannot except fixable Critical or High findings.",
          ),
        );
      }
      return findings;
    }

    const parsedReport = VulnerabilityReportV2Schema.safeParse(reportValue);
    if (!parsedReport.success) {
      findings.push(
        finding(
          "VULNERABILITY_REPORT_INVALID",
          record.path,
          parsedReport.error.issues[0]?.message ??
            "Vulnerability report v2 is invalid.",
        ),
      );
      return findings;
    }
    const reportV2 = parsedReport.data;
    const rawRecord = snapshot.evidenceCatalog.records.find(
      (candidate) => candidate.id === reportV2.rawScan.evidenceId,
    );
    if (
      !rawRecord ||
      rawRecord.kind !== "vulnerability_scan" ||
      rawRecord.sha256 !== reportV2.rawScan.sha256
    ) {
      findings.push(
        finding(
          "RAW_VULNERABILITY_SCAN_MISMATCH",
          record.path,
          "The summarized report must bind the preserved raw scanner output.",
        ),
      );
    } else {
      const rawValue = await json(resolve(root, rawRecord.path));
      const recomputed = summarizeGrypeScan(rawValue, {
        environmentId: reportV2.environmentId,
        environmentKind: reportV2.environmentKind,
        imageDigest: reportV2.imageDigest,
        rawScan: reportV2.rawScan,
        scannerBinarySha256: reportV2.scanner.binarySha256,
        reviewedHighExceptions: reportV2.reviewedExceptions.map(
          ({ fingerprint: _fingerprint, severity: _severity, ...review }) =>
            review,
        ),
        limitations: reportV2.limitations,
      });
      if (JSON.stringify(recomputed) !== JSON.stringify(reportV2)) {
        findings.push(
          finding(
            "RAW_VULNERABILITY_SUMMARY_MISMATCH",
            record.path,
            "Vulnerability counts, findings, fingerprints, and policy must derive from the preserved raw scanner output.",
          ),
        );
      }
    }

    const toolLock = object(
      await json(resolve(root, "docs/sbom/tool-lock.json")),
    );
    const tools = Array.isArray(toolLock?.tools)
      ? (toolLock.tools as JsonObject[])
      : [];
    const grype = tools.find((candidate) => candidate.id === "grype");
    if (
      !grype ||
      grype.exactVersion !== reportV2.scanner.exactVersion ||
      grype.binarySha256 !== reportV2.scanner.binarySha256
    ) {
      findings.push(
        finding(
          "VULNERABILITY_SCANNER_TOOL_MISMATCH",
          record.path,
          "Scanner version and binary must match the locked release tool.",
        ),
      );
    }

    const highCount = reportV2.fixableFindings.filter(
      (candidate) => candidate.severity === "High",
    ).length;
    const criticalCount = reportV2.fixableFindings.filter(
      (candidate) => candidate.severity === "Critical",
    ).length;
    if (criticalCount > 0) {
      findings.push(
        finding(
          "PRODUCTION_FIXABLE_HIGH_VULNERABILITY",
          record.path,
          "Fixable Critical findings cannot be excepted.",
        ),
      );
    }
    if (highCount === 0) {
      if (
        reportV2.reviewedExceptions.length !== 0 ||
        reportV2.policy.status !== "PASSED"
      ) {
        findings.push(
          finding(
            "VULNERABILITY_POLICY_MISMATCH",
            record.path,
            "A scan with no fixable High finding cannot claim a reviewed exception.",
          ),
        );
      }
      return findings;
    }

    const manifest = snapshot.runtimeManifest;
    const vexRecord = snapshot.evidenceCatalog.records.find(
      (candidate) => candidate.id === manifest.vexEvidenceId,
    );
    const reachabilityRecord = snapshot.evidenceCatalog.records.find(
      (candidate) => candidate.id === manifest.reachabilityEvidenceId,
    );
    const vexApplicationRecord = snapshot.evidenceCatalog.records.find(
      (candidate) => candidate.id === manifest.vexApplicationEvidenceId,
    );
    if (
      !manifest.vexEvidenceId ||
      !manifest.vexEvidenceHash ||
      !manifest.reachabilityEvidenceId ||
      !manifest.reachabilityEvidenceHash ||
      !vexRecord ||
      vexRecord.kind !== "vex" ||
      vexRecord.sha256 !== manifest.vexEvidenceHash ||
      !reachabilityRecord ||
      reachabilityRecord.kind !== "reachability_report" ||
      reachabilityRecord.sha256 !== manifest.reachabilityEvidenceHash ||
      !manifest.vexApplicationEvidenceId ||
      !manifest.vexApplicationEvidenceHash ||
      !vexApplicationRecord ||
      vexApplicationRecord.kind !== "vex_application_report" ||
      vexApplicationRecord.sha256 !== manifest.vexApplicationEvidenceHash
    ) {
      findings.push(
        finding(
          "VULNERABILITY_EXCEPTION_BINDING_MISSING",
          record.path,
          "Fixable High exceptions require hash-bound VEX and reachability evidence.",
        ),
      );
      return findings;
    }

    const [parsedVex, parsedReachability, parsedVexApplication] = [
      OpenVexDocumentSchema.safeParse(
        await json(resolve(root, vexRecord.path)),
      ),
      ReachabilityReportV1Schema.safeParse(
        await json(resolve(root, reachabilityRecord.path)),
      ),
      VexApplicationReportV1Schema.safeParse(
        await json(resolve(root, vexApplicationRecord.path)),
      ),
    ];
    if (
      !parsedVex.success ||
      !parsedReachability.success ||
      !parsedVexApplication.success
    ) {
      findings.push(
        finding(
          "VULNERABILITY_EXCEPTION_EVIDENCE_INVALID",
          record.path,
          "Reviewed exception evidence is not schema-valid.",
        ),
      );
      return findings;
    }

    const application = parsedVexApplication.data;
    const applicationInputRecords = [
      application.inputs.baseline,
      application.inputs.applied,
      application.inputs.negativeControl,
    ].map((input) => ({
      input,
      record: snapshot.evidenceCatalog.records.find(
        (candidate) => candidate.id === input.evidenceId,
      ),
    }));
    if (
      application.imageDigest !== manifest.container.imageDigest ||
      application.vexSha256 !== manifest.vexEvidenceHash ||
      applicationInputRecords.some(
        ({ input, record: inputRecord }) =>
          !inputRecord ||
          inputRecord.kind !== "vulnerability_scan" ||
          inputRecord.sha256 !== input.sha256,
      )
    ) {
      findings.push(
        finding(
          "VEX_APPLICATION_BINDING_MISMATCH",
          vexApplicationRecord.path,
          "VEX application proof must bind the exact image, VEX document, and three scanner outputs.",
        ),
      );
      return findings;
    }
    const [baselineInput, appliedInput, negativeInput] = await Promise.all(
      applicationInputRecords.map(({ record: inputRecord }) =>
        json(resolve(root, inputRecord!.path)),
      ),
    );
    const recomputedApplication = summarizeVexApplication(
      baselineInput,
      appliedInput,
      negativeInput,
      {
        imageDigest: application.imageDigest,
        scannerBinarySha256: application.scanner.binarySha256,
        vexSha256: application.vexSha256,
        inputs: application.inputs,
        expectedFinding: {
          id: application.suppressedFinding.id,
          namespace: application.suppressedFinding.namespace,
          package: application.suppressedFinding.package,
          version: application.suppressedFinding.version,
          artifactType: application.suppressedFinding.artifactType,
          purl: application.suppressedFinding.purl,
          fingerprint: application.suppressedFinding.fingerprint,
        },
        negativeSubcomponent: application.negativeControl.subcomponent,
        limitations: application.limitations,
      },
    );
    if (JSON.stringify(recomputedApplication) !== JSON.stringify(application)) {
      findings.push(
        finding(
          "VEX_APPLICATION_SUMMARY_MISMATCH",
          vexApplicationRecord.path,
          "VEX suppression counts and match multisets must derive from the preserved scanner outputs.",
        ),
      );
      return findings;
    }

    const python = manifest.runtimes.find(
      (candidate) => candidate.id === "cpython",
    );
    const runnerSbomHash = manifest.sbomHashes["runner-container-sbom"];
    if (!python || !runnerSbomHash) {
      findings.push(
        finding(
          "VULNERABILITY_EXCEPTION_BINDING_MISSING",
          record.path,
          "Runtime Python and Container SBOM bindings are required.",
        ),
      );
      return findings;
    }
    findings.push(
      ...verifyVulnerabilityAuthority({
        now: new Date().toISOString(),
        runtime: {
          environmentId: manifest.environmentId,
          environmentKind: manifest.environmentKind,
          imageDigest: manifest.container.imageDigest,
          sourceCommit: manifest.sourceCommit,
          sbomSha256: runnerSbomHash,
          pythonVersion: python.exactVersion,
          vexEvidenceId: manifest.vexEvidenceId,
          reachabilityEvidenceId: manifest.reachabilityEvidenceId,
        },
        report: reportV2,
        vex: parsedVex.data,
        reachability: parsedReachability.data,
      }),
    );
  } catch (error) {
    findings.push(
      finding(
        "VULNERABILITY_REPORT_INVALID",
        record.path,
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
  return findings;
}

export async function verifySnapshotArtifacts(
  root: string,
  snapshot: ScientificEngineSnapshot,
  overrides: { snapshotText?: string; hashManifest?: unknown } = {},
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const snapshotPath = resolve(root, "scientific-engines/snapshot.json");
  const text = overrides.snapshotText ?? (await readFile(snapshotPath, "utf8"));
  const expectedText = `${canonicalizeScientificEngineSnapshot(snapshot)}\n`;
  if (text !== expectedText) {
    findings.push(
      finding(
        "SNAPSHOT_NOT_CANONICAL",
        "scientific-engines/snapshot.json",
        "Snapshot bytes do not equal the canonical scientific authority serialization.",
      ),
    );
  }

  const hashManifest = (overrides.hashManifest ??
    (await json(
      resolve(root, "scientific-engines/snapshot-hash.json"),
    ))) as JsonObject;
  const authorityHash = await hashScientificEngineSnapshot(snapshot);
  const fileHash = sha256(expectedText);
  const expected: Record<string, string> = {
    authorityHash,
    snapshotFileSha256: fileHash,
    registryHash: snapshot.runtimeManifest.registryHash,
    bindingsHash: snapshot.runtimeManifest.bindingsHash,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (hashManifest[field] !== value) {
      findings.push(
        finding(
          "SNAPSHOT_HASH_MANIFEST_MISMATCH",
          `scientific-engines/snapshot-hash.json:${field}`,
          `Expected ${field} ${value}, observed ${String(hashManifest[field])}.`,
        ),
      );
    }
  }
  return findings;
}

export async function verifyLicenseManifest(
  root: string,
  snapshot: ScientificEngineSnapshot,
): Promise<ScientificEngineVerificationFinding[]> {
  const findings: ScientificEngineVerificationFinding[] = [];
  const path = resolve(root, "scientific-engines/licenses/manifest.json");
  try {
    const manifest = (await json(path)) as JsonObject;
    const entries = Array.isArray(manifest.entries)
      ? (manifest.entries as JsonObject[])
      : [];
    for (const engine of snapshot.registry.engines) {
      const entry = entries.find(
        (candidate) => candidate.engineId === engine.id,
      );
      if (!entry) {
        findings.push(
          finding(
            "LICENSE_MANIFEST_ENGINE_MISSING",
            "scientific-engines/licenses/manifest.json",
            `License manifest does not contain ${engine.id}.`,
          ),
        );
        continue;
      }
      if (
        entry.version !== engine.exactVersion ||
        entry.repositoryLicenseSha256 !== engine.licenseFileHash
      ) {
        findings.push(
          finding(
            "LICENSE_MANIFEST_MISMATCH",
            "scientific-engines/licenses/manifest.json",
            `License manifest metadata does not match ${engine.id}.`,
          ),
        );
      }
    }
  } catch (error) {
    findings.push(
      finding(
        "LICENSE_MANIFEST_INVALID",
        "scientific-engines/licenses/manifest.json",
        `License manifest cannot be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }
  return findings;
}

export async function verifyProofCapsuleRegistryLinkage(
  root: string,
): Promise<ScientificEngineVerificationFinding[]> {
  const contractPath = resolve(root, "packages/contracts/src/index.ts");
  const proofPath = resolve(root, "packages/proof-bundle/src/index.ts");
  const [contract, proof] = await Promise.all([
    readFile(contractPath, "utf8"),
    readFile(proofPath, "utf8"),
  ]);
  const token = "scientificEngineSnapshotHash";
  if (!contract.includes(token) || !proof.includes(token)) {
    return [
      finding(
        "PROOF_CAPSULE_ENGINE_LINK_MISSING",
        "packages/proof-bundle",
        "Proof Capsule does not yet bind and validate the scientific engine snapshot hash.",
      ),
    ];
  }
  return [];
}

export type VerifyScientificEnginesOptions = {
  registryOnly?: boolean;
};

export async function verifyScientificEngines(
  root: string,
  options: VerifyScientificEnginesOptions = {},
): Promise<{
  status: "VERIFIED" | "REJECTED";
  authorityHash?: string;
  findings: ScientificEngineVerificationFinding[];
}> {
  let snapshot: ScientificEngineSnapshot;
  try {
    snapshot = await loadScientificEngineSnapshot(root);
  } catch (error) {
    return {
      status: "REJECTED",
      findings: [
        finding(
          "SNAPSHOT_CONTRACT_INVALID",
          "scientific-engines/snapshot.json",
          error instanceof Error ? error.message : String(error),
        ),
      ],
    };
  }

  const groups = await Promise.all([
    verifyEvidenceFiles(root, snapshot),
    verifyEvidenceSemantics(root, snapshot),
    verifyPinnedSources(root),
    verifySboms(root, snapshot),
    verifySbomManifest(root, snapshot),
    verifyVulnerabilityReport(root, snapshot),
    verifySnapshotArtifacts(root, snapshot),
    verifyLicenseManifest(root, snapshot),
    Promise.resolve(verifyConceptPackBindings(snapshot)),
    ...(options.registryOnly ? [] : [verifyProofCapsuleRegistryLinkage(root)]),
  ]);
  const findings = groups
    .flat()
    .sort((left, right) =>
      `${left.code}:${left.path}`.localeCompare(`${right.code}:${right.path}`),
    );
  return {
    status: findings.length === 0 ? "VERIFIED" : "REJECTED",
    authorityHash: await hashScientificEngineSnapshot(snapshot),
    findings,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const rootArgument = rootIndex >= 0 ? args[rootIndex + 1] : undefined;
  const root =
    rootArgument === undefined
      ? resolve(import.meta.dirname, "..")
      : resolve(rootArgument);
  const report = await verifyScientificEngines(root, {
    registryOnly: args.includes("--registry-only"),
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.status !== "VERIFIED") process.exitCode = 1;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
