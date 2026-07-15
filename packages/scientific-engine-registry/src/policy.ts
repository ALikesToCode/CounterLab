import type {
  ScientificEngineEvidenceKind,
  ScientificEngineRegistry,
  ScientificEngineRole,
  ScientificEngineSnapshot,
  SubjectPackEngineBindings,
} from "./types.js";

const bindingRoleToEngineRole = {
  authoritativeSolver: "authoritative_solver",
  referenceOracle: "reference_oracle",
  unitValidator: "unit_validator",
  renderer: "renderer",
  propertyTestGenerator: "property_test_generator",
  secondaryComparator: "secondary_comparator",
} as const satisfies Record<string, ScientificEngineRole>;

export class ScientificEnginePolicyError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = "ScientificEnginePolicyError";
    this.code = code;
    this.path = path;
  }
}

function assertUnique(
  values: readonly string[],
  code: string,
  path: string,
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new ScientificEnginePolicyError(
        code,
        path,
        `duplicate value ${value}`,
      );
    }
    seen.add(value);
  }
}

export function enforceScientificEnginePolicy(
  registry: ScientificEngineRegistry,
  bindings?: SubjectPackEngineBindings,
): void {
  assertUnique(
    registry.engines.map((engine) => engine.id),
    "DUPLICATE_ENGINE_ID",
    "engines",
  );
  assertUnique(
    registry.engines.map(
      (engine) => `${engine.runtime}:${engine.packageName.toLowerCase()}`,
    ),
    "DUPLICATE_ENGINE_PACKAGE",
    "engines",
  );

  if (!bindings) return;

  assertUnique(
    bindings.subjectPacks.map(
      (binding) => `${binding.subjectPackId}:${binding.subjectPackVersion}`,
    ),
    "DUPLICATE_SUBJECT_PACK_BINDING",
    "subjectPacks",
  );

  const engines = new Map(
    registry.engines.map((engine) => [engine.id, engine]),
  );
  for (const [packIndex, pack] of bindings.subjectPacks.entries()) {
    for (const [bindingRole, requiredEngineRole] of Object.entries(
      bindingRoleToEngineRole,
    ) as [keyof typeof bindingRoleToEngineRole, ScientificEngineRole][]) {
      const authority = pack.roles[bindingRole];
      if (authority.kind !== "ENGINE") continue;
      for (const [engineIndex, engineId] of authority.engineIds.entries()) {
        const engine = engines.get(engineId);
        if (!engine) {
          throw new ScientificEnginePolicyError(
            "UNKNOWN_ENGINE_BINDING",
            `subjectPacks.${packIndex}.roles.${bindingRole}.engineIds.${engineIndex}`,
            `unknown engine ${engineId}`,
          );
        }
        if (!engine.roles.includes(requiredEngineRole)) {
          throw new ScientificEnginePolicyError(
            "ENGINE_ROLE_MISMATCH",
            `subjectPacks.${packIndex}.roles.${bindingRole}.engineIds.${engineIndex}`,
            `${engineId} is not registered for ${requiredEngineRole}`,
          );
        }
      }
    }
  }
}

const validationEvidenceKinds = {
  oracleStrategyIds: "oracle_strategy",
  goldenFixtureIds: "golden_fixture",
  metamorphicPropertyIds: "metamorphic_property",
  upgradeDriftFixtureIds: "upgrade_drift_fixture",
} as const satisfies Record<string, ScientificEngineEvidenceKind>;

function requireRecord(
  records: ReadonlyMap<
    string,
    ScientificEngineSnapshot["evidenceCatalog"]["records"][number]
  >,
  id: string,
  expectedKind: ScientificEngineEvidenceKind,
  path: string,
) {
  const record = records.get(id);
  if (!record) {
    throw new ScientificEnginePolicyError(
      "UNRESOLVED_EVIDENCE",
      path,
      `evidence ${id} does not resolve`,
    );
  }
  if (record.kind !== expectedKind) {
    throw new ScientificEnginePolicyError(
      "EVIDENCE_KIND_MISMATCH",
      path,
      `evidence ${id} is ${record.kind}, expected ${expectedKind}`,
    );
  }
  if (record.status !== "VERIFIED") {
    throw new ScientificEnginePolicyError(
      "EVIDENCE_NOT_VERIFIED",
      path,
      `evidence ${id} is ${record.status}`,
    );
  }
  return record;
}

export function enforceScientificEngineSnapshotPolicy(
  snapshot: ScientificEngineSnapshot,
): void {
  enforceScientificEnginePolicy(snapshot.registry, snapshot.bindings);

  assertUnique(
    snapshot.evidenceCatalog.records.map((record) => record.id),
    "DUPLICATE_EVIDENCE_ID",
    "evidenceCatalog.records",
  );
  assertUnique(
    snapshot.evidenceCatalog.records.map((record) => record.path),
    "DUPLICATE_EVIDENCE_PATH",
    "evidenceCatalog.records",
  );
  const records = new Map(
    snapshot.evidenceCatalog.records.map((record) => [record.id, record]),
  );
  const engines = new Map(
    snapshot.registry.engines.map((engine) => [engine.id, engine]),
  );

  for (const [engineIndex, engine] of snapshot.registry.engines.entries()) {
    const engineRecords = snapshot.evidenceCatalog.records.filter(
      (record) => record.engineId === engine.id,
    );
    const licenseRecords = engineRecords.filter(
      (record) => record.kind === "license",
    );
    const integrityRecords = engineRecords.filter(
      (record) => record.kind === "integrity",
    );
    if (
      licenseRecords.length !== 1 ||
      licenseRecords[0]?.sha256 !== engine.licenseFileHash
    ) {
      throw new ScientificEnginePolicyError(
        "LICENSE_HASH_MISMATCH",
        `registry.engines.${engineIndex}.licenseFileHash`,
        `${engine.id} requires exactly one matching license record`,
      );
    }
    requireRecord(
      records,
      licenseRecords[0]!.id,
      "license",
      `registry.engines.${engineIndex}.licenseFileHash`,
    );
    if (
      integrityRecords.length !== 1 ||
      integrityRecords[0]?.sha256 !== engine.integrityHash
    ) {
      throw new ScientificEnginePolicyError(
        "INTEGRITY_HASH_MISMATCH",
        `registry.engines.${engineIndex}.integrityHash`,
        `${engine.id} requires exactly one matching integrity record`,
      );
    }
    requireRecord(
      records,
      integrityRecords[0]!.id,
      "integrity",
      `registry.engines.${engineIndex}.integrityHash`,
    );
    for (const [field, expectedKind] of Object.entries(
      validationEvidenceKinds,
    ) as [
      keyof typeof validationEvidenceKinds,
      ScientificEngineEvidenceKind,
    ][]) {
      for (const [idIndex, id] of engine.validation[field].entries()) {
        requireRecord(
          records,
          id,
          expectedKind,
          `registry.engines.${engineIndex}.validation.${field}.${idIndex}`,
        );
      }
    }
    if (engine.validation.upgradeDriftFixtureIds.length === 0) {
      throw new ScientificEnginePolicyError(
        "UPGRADE_DRIFT_EVIDENCE_REQUIRED",
        `registry.engines.${engineIndex}.validation.upgradeDriftFixtureIds`,
        `${engine.id} requires an upgrade-drift fixture`,
      );
    }
  }

  for (const [packIndex, pack] of snapshot.bindings.subjectPacks.entries()) {
    const solver = pack.roles.authoritativeSolver;
    const solverIds = new Set(solver.engineIds);
    const oracle = pack.roles.referenceOracle;
    if (oracle.kind === "ENGINE") {
      const overlap = oracle.engineIds.filter((engineId) =>
        solverIds.has(engineId),
      );
      if (overlap.length > 0) {
        throw new ScientificEnginePolicyError(
          "NON_INDEPENDENT_ORACLE",
          `bindings.subjectPacks.${packIndex}.roles.referenceOracle`,
          `reference oracle reuses authoritative solver ${overlap.join(", ")}`,
        );
      }
    }

    for (const [roleName, authority] of Object.entries(pack.roles)) {
      if (authority.kind !== "INTERNAL") continue;
      const integrity = requireRecord(
        records,
        authority.integrityEvidenceId,
        "integrity",
        `bindings.subjectPacks.${packIndex}.roles.${roleName}.integrityEvidenceId`,
      );
      if (integrity.sha256 !== authority.integrityHash) {
        throw new ScientificEnginePolicyError(
          "INTERNAL_AUTHORITY_HASH_MISMATCH",
          `bindings.subjectPacks.${packIndex}.roles.${roleName}.integrityHash`,
          `${authority.authorityId} integrity hash does not match its evidence`,
        );
      }
      for (const [
        evidenceIndex,
        evidenceId,
      ] of authority.validationEvidenceIds.entries()) {
        const evidence = records.get(evidenceId);
        if (
          !evidence ||
          ![
            "oracle_strategy",
            "golden_fixture",
            "metamorphic_property",
            "upgrade_drift_fixture",
          ].includes(evidence.kind)
        ) {
          throw new ScientificEnginePolicyError(
            "UNRESOLVED_INTERNAL_VALIDATION",
            `bindings.subjectPacks.${packIndex}.roles.${roleName}.validationEvidenceIds.${evidenceIndex}`,
            `validation evidence ${evidenceId} does not resolve`,
          );
        }
        requireRecord(
          records,
          evidenceId,
          evidence.kind,
          `bindings.subjectPacks.${packIndex}.roles.${roleName}.validationEvidenceIds.${evidenceIndex}`,
        );
      }
    }

    for (const [
      operationIndex,
      authority,
    ] of pack.operationAuthorities.entries()) {
      for (const [
        engineIndex,
        engineId,
      ] of authority.authoritativeEngineIds.entries()) {
        if (!solverIds.has(engineId)) {
          throw new ScientificEnginePolicyError(
            "OPERATION_ENGINE_NOT_PACK_SOLVER",
            `bindings.subjectPacks.${packIndex}.operationAuthorities.${operationIndex}.authoritativeEngineIds.${engineIndex}`,
            `${engineId} is not a declared authoritative solver for this pack`,
          );
        }
        const engine = engines.get(engineId);
        if (!engine?.allowedOperationIds.includes(authority.operationId)) {
          throw new ScientificEnginePolicyError(
            "OPERATION_NOT_ALLOWED_BY_ENGINE",
            `bindings.subjectPacks.${packIndex}.operationAuthorities.${operationIndex}`,
            `${engineId} does not allow operation ${authority.operationId}`,
          );
        }
      }
    }
  }

  assertUnique(
    snapshot.runtimeManifest.runtimes.map((runtime) => runtime.id),
    "DUPLICATE_RUNTIME_ID",
    "runtimeManifest.runtimes",
  );
  assertUnique(
    snapshot.runtimeManifest.installedEngines.map((engine) => engine.engineId),
    "DUPLICATE_INSTALLED_ENGINE",
    "runtimeManifest.installedEngines",
  );
  if (
    snapshot.runtimeManifest.installedEngines.length !==
    snapshot.registry.engines.length
  ) {
    throw new ScientificEnginePolicyError(
      "INSTALLED_ENGINE_SET_MISMATCH",
      "runtimeManifest.installedEngines",
      "installed engines must exactly match the registry",
    );
  }
  for (const [
    installedIndex,
    installed,
  ] of snapshot.runtimeManifest.installedEngines.entries()) {
    const engine = engines.get(installed.engineId);
    if (
      !engine ||
      engine.packageName !== installed.packageName ||
      engine.exactVersion !== installed.exactVersion
    ) {
      throw new ScientificEnginePolicyError(
        "INSTALLED_ENGINE_VERSION_MISMATCH",
        `runtimeManifest.installedEngines.${installedIndex}`,
        `${installed.engineId} does not match its registered package and version`,
      );
    }
    if (
      installed.toleranceProfileId !==
      engine.deterministicProfile.toleranceProfileId
    ) {
      throw new ScientificEnginePolicyError(
        "TOLERANCE_PROFILE_MISMATCH",
        `runtimeManifest.installedEngines.${installedIndex}.toleranceProfileId`,
        `${installed.engineId} runtime tolerance profile differs from its descriptor`,
      );
    }
    const health = requireRecord(
      records,
      installed.healthEvidenceId,
      "health_report",
      `runtimeManifest.installedEngines.${installedIndex}.healthEvidenceId`,
    );
    if (health.engineId !== installed.engineId) {
      throw new ScientificEnginePolicyError(
        "HEALTH_ENGINE_MISMATCH",
        `runtimeManifest.installedEngines.${installedIndex}.healthEvidenceId`,
        `health evidence ${health.id} belongs to another engine`,
      );
    }
    requireRecord(
      records,
      installed.toleranceProfileId,
      "tolerance_profile",
      `runtimeManifest.installedEngines.${installedIndex}.toleranceProfileId`,
    );
  }
  requireRecord(
    records,
    snapshot.runtimeManifest.resourceLimitProfileId,
    "resource_profile",
    "runtimeManifest.resourceLimitProfileId",
  );
  for (const [id, sha256] of Object.entries(
    snapshot.runtimeManifest.lockHashes,
  )) {
    const record = requireRecord(
      records,
      id,
      "lockfile",
      `runtimeManifest.lockHashes.${id}`,
    );
    if (record.sha256 !== sha256) {
      throw new ScientificEnginePolicyError(
        "LOCK_HASH_MISMATCH",
        `runtimeManifest.lockHashes.${id}`,
        `${id} does not match its catalog hash`,
      );
    }
  }
  for (const [id, sha256] of Object.entries(
    snapshot.runtimeManifest.sbomHashes,
  )) {
    const record = requireRecord(
      records,
      id,
      "sbom",
      `runtimeManifest.sbomHashes.${id}`,
    );
    if (record.sha256 !== sha256) {
      throw new ScientificEnginePolicyError(
        "SBOM_HASH_MISMATCH",
        `runtimeManifest.sbomHashes.${id}`,
        `${id} does not match its catalog hash`,
      );
    }
  }
  const sbomManifest = requireRecord(
    records,
    snapshot.runtimeManifest.sbomManifestEvidenceId,
    "sbom_manifest",
    "runtimeManifest.sbomManifestEvidenceId",
  );
  if (sbomManifest.sha256 !== snapshot.runtimeManifest.sbomManifestHash) {
    throw new ScientificEnginePolicyError(
      "SBOM_MANIFEST_HASH_MISMATCH",
      "runtimeManifest.sbomManifestHash",
      "SBOM manifest hash does not match its evidence record",
    );
  }
  const vulnerabilityReport = requireRecord(
    records,
    snapshot.runtimeManifest.vulnerabilityReportEvidenceId,
    "vulnerability_report",
    "runtimeManifest.vulnerabilityReportEvidenceId",
  );
  if (
    vulnerabilityReport.sha256 !==
    snapshot.runtimeManifest.vulnerabilityReportHash
  ) {
    throw new ScientificEnginePolicyError(
      "VULNERABILITY_REPORT_HASH_MISMATCH",
      "runtimeManifest.vulnerabilityReportHash",
      "Vulnerability report hash does not match its evidence record",
    );
  }
}

export function resolveSubjectPackOperationAuthority(
  snapshot: ScientificEngineSnapshot,
  subjectPackId: string,
  subjectPackVersion: string,
  operationId: string,
): string[] {
  const pack = snapshot.bindings.subjectPacks.find(
    (candidate) =>
      candidate.subjectPackId === subjectPackId &&
      candidate.subjectPackVersion === subjectPackVersion,
  );
  if (!pack) {
    throw new ScientificEnginePolicyError(
      "UNKNOWN_SUBJECT_PACK",
      "bindings.subjectPacks",
      `subject pack ${subjectPackId}@${subjectPackVersion} is not registered`,
    );
  }
  const authority = pack.operationAuthorities.find(
    (candidate) => candidate.operationId === operationId,
  );
  if (!authority) {
    throw new ScientificEnginePolicyError(
      "UNKNOWN_PACK_OPERATION",
      "bindings.subjectPacks.operationAuthorities",
      `operation ${operationId} is not registered for ${subjectPackId}`,
    );
  }
  return [...authority.authoritativeEngineIds];
}
