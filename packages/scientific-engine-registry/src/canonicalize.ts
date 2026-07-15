import { canonicalJson, hashCanonical } from "@counterlab/session-core";

import {
  enforceScientificEnginePolicy,
  enforceScientificEngineSnapshotPolicy,
} from "./policy.js";
import {
  ScientificEngineRegistrySchema,
  ScientificEngineSnapshotSchema,
} from "./schema.js";
import type {
  ScientificEngineRegistry,
  ScientificEngineSnapshot,
  SubjectPackEngineBindings,
} from "./types.js";

const sorted = <T extends string>(values: readonly T[]): T[] =>
  [...values].sort((left, right) => left.localeCompare(right));

export function normalizeScientificEngineRegistry(
  registry: ScientificEngineRegistry,
): ScientificEngineRegistry {
  return {
    schemaVersion: "1",
    engines: [...registry.engines]
      .map((engine) => ({
        ...engine,
        roles: sorted(engine.roles),
        capabilities: sorted(engine.capabilities),
        allowedOperationIds: sorted(engine.allowedOperationIds),
        deterministicProfile: {
          ...engine.deterministicProfile,
          hardwareNotes: sorted(engine.deterministicProfile.hardwareNotes),
        },
        validation: {
          oracleStrategyIds: sorted(engine.validation.oracleStrategyIds),
          goldenFixtureIds: sorted(engine.validation.goldenFixtureIds),
          metamorphicPropertyIds: sorted(
            engine.validation.metamorphicPropertyIds,
          ),
          upgradeDriftFixtureIds: sorted(
            engine.validation.upgradeDriftFixtureIds,
          ),
        },
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function normalizeSubjectPackEngineBindings(
  bindings: SubjectPackEngineBindings,
): SubjectPackEngineBindings {
  return {
    schemaVersion: "1",
    subjectPacks: [...bindings.subjectPacks]
      .map((pack) => ({
        ...pack,
        operationAuthorities: [...pack.operationAuthorities]
          .map((authority) => ({
            ...authority,
            authoritativeEngineIds: sorted(authority.authoritativeEngineIds),
          }))
          .sort((left, right) =>
            left.operationId.localeCompare(right.operationId),
          ),
        roles: Object.fromEntries(
          Object.entries(pack.roles).map(([role, authority]) => [
            role,
            authority.kind === "ENGINE"
              ? { ...authority, engineIds: sorted(authority.engineIds) }
              : authority.kind === "INTERNAL"
                ? {
                    ...authority,
                    validationEvidenceIds: sorted(
                      authority.validationEvidenceIds,
                    ),
                  }
                : authority,
          ]),
        ) as typeof pack.roles,
      }))
      .sort((left, right) =>
        `${left.subjectPackId}:${left.subjectPackVersion}`.localeCompare(
          `${right.subjectPackId}:${right.subjectPackVersion}`,
        ),
      ),
  };
}

export function normalizeScientificEngineSnapshot(
  snapshot: ScientificEngineSnapshot,
): ScientificEngineSnapshot {
  return {
    schemaVersion: "1",
    registry: normalizeScientificEngineRegistry(snapshot.registry),
    bindings: normalizeSubjectPackEngineBindings(snapshot.bindings),
    runtimeManifest: {
      ...snapshot.runtimeManifest,
      runtimes: [...snapshot.runtimeManifest.runtimes].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
      installedEngines: [...snapshot.runtimeManifest.installedEngines].sort(
        (left, right) => left.engineId.localeCompare(right.engineId),
      ),
    },
    evidenceCatalog: {
      schemaVersion: "1",
      records: [...snapshot.evidenceCatalog.records].sort((left, right) =>
        left.id.localeCompare(right.id),
      ),
    },
  };
}

export function canonicalizeScientificEngineRegistry(
  registry: unknown,
): string {
  const parsed = ScientificEngineRegistrySchema.parse(registry);
  enforceScientificEnginePolicy(parsed);
  return canonicalJson(normalizeScientificEngineRegistry(parsed));
}

export async function hashScientificEngineRegistry(
  registry: unknown,
): Promise<string> {
  const parsed = ScientificEngineRegistrySchema.parse(registry);
  enforceScientificEnginePolicy(parsed);
  return hashCanonical(normalizeScientificEngineRegistry(parsed));
}

export async function hashSubjectPackEngineBindings(
  bindings: SubjectPackEngineBindings,
): Promise<string> {
  return hashCanonical(normalizeSubjectPackEngineBindings(bindings));
}

export function canonicalizeScientificEngineSnapshot(
  snapshot: unknown,
): string {
  const parsed = ScientificEngineSnapshotSchema.parse(snapshot);
  enforceScientificEngineSnapshotPolicy(parsed);
  return canonicalJson(normalizeScientificEngineSnapshot(parsed));
}

export async function hashScientificEngineSnapshot(
  snapshot: unknown,
): Promise<string> {
  const parsed = ScientificEngineSnapshotSchema.parse(snapshot);
  enforceScientificEngineSnapshotPolicy(parsed);
  return hashCanonical(normalizeScientificEngineSnapshot(parsed));
}
