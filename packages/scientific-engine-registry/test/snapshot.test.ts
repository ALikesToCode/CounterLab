import { describe, expect, it } from "vitest";

import {
  canonicalizeScientificEngineSnapshot,
  hashScientificEngineSnapshot,
  resolveSubjectPackOperationAuthority,
  validateScientificEngineSnapshot,
} from "../src/index.js";
import { engineDescriptor, sha256 } from "./fixtures.js";

function snapshot(): Record<string, unknown> {
  const engine = engineDescriptor({
    allowedOperationIds: ["leakage.group_holdout"],
    integrityHash: sha256("b"),
  });
  const candidate = {
    schemaVersion: "1",
    registry: { schemaVersion: "1", engines: [engine] },
    bindings: {
      schemaVersion: "1",
      subjectPacks: [
        {
          subjectPackId: "entity-leakage",
          subjectPackVersion: "1.0.0",
          operationAuthorities: [
            {
              operationId: "leakage.group_holdout",
              authoritativeEngineIds: ["numpy-fixed-ml"],
            },
          ],
          roles: {
            authoritativeSolver: {
              kind: "ENGINE",
              engineIds: ["numpy-fixed-ml"],
            },
            referenceOracle: {
              kind: "INTERNAL",
              authorityId: "counterlab-independent-fixtures",
              exactVersion: "1.0.0",
              integrityEvidenceId: "internal-oracle-integrity-v1",
              integrityHash: sha256("e"),
              validationEvidenceIds: ["oracle-strategy-v1"],
              reason:
                "A separately reviewed fixture oracle checks fixed results.",
            },
            unitValidator: {
              kind: "NOT_APPLICABLE",
              reason: "The pack has no physical-unit boundary.",
            },
            renderer: {
              kind: "INTERNAL",
              authorityId: "counterlab-signed-result-renderer",
              exactVersion: "1.0.0",
              integrityEvidenceId: "internal-renderer-integrity-v1",
              integrityHash: sha256("f"),
              validationEvidenceIds: ["renderer-binding-v1"],
              reason: "Fixed React blocks render signed result paths.",
            },
            propertyTestGenerator: {
              kind: "INTERNAL",
              authorityId: "counterlab-mutation-matrix",
              exactVersion: "1.0.0",
              integrityEvidenceId: "internal-mutations-integrity-v1",
              integrityHash: sha256("1"),
              validationEvidenceIds: ["mutation-property-v1"],
              reason: "The frozen mutation matrix owns property coverage.",
            },
            secondaryComparator: {
              kind: "NOT_APPLICABLE",
              reason: "No independent secondary implementation is claimed.",
            },
          },
        },
      ],
    },
    runtimeManifest: {
      schemaVersion: "1",
      generatedAt: "2026-07-15T00:00:00.000Z",
      environmentId: "runner-linux-amd64-v1",
      environmentKind: "local_candidate",
      sourceCommit: sha256("a").slice(0, 40),
      registryHash: sha256("2"),
      bindingsHash: sha256("3"),
      platform: { os: "linux", architecture: "amd64" },
      runtimes: [
        {
          id: "cpython",
          exactVersion: "3.12.13",
          sourceUrl: "https://www.python.org/downloads/release/python-31213/",
          licenseId: "Python-2.0",
          licenseFileHash: sha256("4"),
        },
      ],
      installedEngines: [
        {
          engineId: "numpy-fixed-ml",
          packageName: "numpy",
          exactVersion: "2.4.6",
          artifactSha256: sha256("5"),
          healthEvidenceId: "engine-health-v1",
          toleranceProfileId: "counterlab-ml-f64-v1",
        },
      ],
      container: {
        imageDigest: `sha256:${sha256("6")}`,
        vcpu: 2,
        memoryMb: 4096,
        diskMb: 4096,
      },
      resourceLimitProfileId: "runner-resource-limits-v1",
      lockHashes: { runner: sha256("7") },
      sbomHashes: { python: sha256("8") },
      sbomManifestEvidenceId: "sbom-manifest-v1",
      sbomManifestHash: sha256("0"),
      vulnerabilityReportEvidenceId: "vulnerability-report-v1",
      vulnerabilityReportHash: sha256("6"),
    },
    evidenceCatalog: {
      schemaVersion: "1",
      records: [
        {
          id: "numpy-license-v1",
          kind: "license",
          engineId: "numpy-fixed-ml",
          path: "scientific-engines/licenses/numpy/LICENSE.txt",
          sha256: engine.licenseFileHash,
        },
        {
          id: "numpy-integrity-v1",
          kind: "integrity",
          engineId: "numpy-fixed-ml",
          path: "scientific-engines/fixtures/integrity/numpy.json",
          sha256: engine.integrityHash,
        },
        ...engine.validation.oracleStrategyIds.map((id) => ({
          id,
          kind: "oracle_strategy",
          path: `scientific-engines/fixtures/${id}.json`,
          sha256: sha256("9"),
        })),
        ...engine.validation.goldenFixtureIds.map((id) => ({
          id,
          kind: "golden_fixture",
          path: `scientific-engines/fixtures/${id}.json`,
          sha256: sha256("a"),
        })),
        ...engine.validation.metamorphicPropertyIds.map((id) => ({
          id,
          kind: "metamorphic_property",
          path: `scientific-engines/fixtures/${id}.json`,
          sha256: sha256("b"),
        })),
        ...engine.validation.upgradeDriftFixtureIds.map((id) => ({
          id,
          kind: "upgrade_drift_fixture",
          path: `scientific-engines/fixtures/${id}.json`,
          sha256: sha256("c"),
        })),
        {
          id: "internal-oracle-integrity-v1",
          kind: "integrity",
          path: "scientific-engines/fixtures/internal-oracle.json",
          sha256: sha256("e"),
        },
        {
          id: "oracle-strategy-v1",
          kind: "oracle_strategy",
          path: "scientific-engines/fixtures/oracle-strategy.json",
          sha256: sha256("d"),
        },
        {
          id: "internal-renderer-integrity-v1",
          kind: "integrity",
          path: "scientific-engines/fixtures/internal-renderer.json",
          sha256: sha256("f"),
        },
        {
          id: "renderer-binding-v1",
          kind: "golden_fixture",
          path: "scientific-engines/fixtures/renderer-binding.json",
          sha256: sha256("e"),
        },
        {
          id: "internal-mutations-integrity-v1",
          kind: "integrity",
          path: "scientific-engines/fixtures/internal-mutations.json",
          sha256: sha256("1"),
        },
        {
          id: "mutation-property-v1",
          kind: "metamorphic_property",
          path: "scientific-engines/fixtures/mutation-property.json",
          sha256: sha256("f"),
        },
        {
          id: "engine-health-v1",
          kind: "health_report",
          engineId: "numpy-fixed-ml",
          path: "scientific-engines/fixtures/engine-health.json",
          sha256: sha256("2"),
        },
        {
          id: "counterlab-ml-f64-v1",
          kind: "tolerance_profile",
          path: "scientific-engines/fixtures/tolerance.json",
          sha256: sha256("3"),
        },
        {
          id: "runner-resource-limits-v1",
          kind: "resource_profile",
          path: "scientific-engines/fixtures/resource-limits.json",
          sha256: sha256("4"),
        },
        {
          id: "runner",
          kind: "lockfile",
          path: "requirements.runner.lock.txt",
          sha256: sha256("7"),
        },
        {
          id: "python",
          kind: "sbom",
          path: "docs/sbom/python.cdx.json",
          sha256: sha256("8"),
        },
        {
          id: "sbom-manifest-v1",
          kind: "sbom_manifest",
          path: "docs/sbom/manifest.json",
          sha256: sha256("0"),
        },
        {
          id: "vulnerability-report-v1",
          kind: "vulnerability_report",
          path: "docs/sbom/vulnerability-report.json",
          sha256: sha256("6"),
        },
      ],
    },
  };
  const catalog = candidate.evidenceCatalog as {
    records: Array<Record<string, unknown>>;
  };
  catalog.records = catalog.records.map((record) => ({
    status: "VERIFIED",
    limitations: [],
    ...record,
  }));
  return candidate;
}

describe("ScientificEngineSnapshot", () => {
  it("resolves a pack operation to a declared authoritative engine", async () => {
    const parsed = await validateScientificEngineSnapshot(snapshot(), {
      verifyDeclaredHashes: false,
    });
    expect(
      resolveSubjectPackOperationAuthority(
        parsed,
        "entity-leakage",
        "1.0.0",
        "leakage.group_holdout",
      ),
    ).toEqual(["numpy-fixed-ml"]);
  });

  it("rejects unknown and undeclared operation authority", async () => {
    const candidate = snapshot();
    const bindings = candidate.bindings as {
      subjectPacks: { operationAuthorities: unknown[] }[];
    };
    bindings.subjectPacks[0]!.operationAuthorities = [
      {
        operationId: "leakage.identity_ablation",
        authoritativeEngineIds: ["numpy-fixed-ml"],
      },
    ];
    await expect(
      validateScientificEngineSnapshot(candidate, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/operation|authority|allowed/i);
  });

  it("rejects unresolved catalog records and forged engine hashes", async () => {
    const candidate = snapshot();
    const records = (candidate.evidenceCatalog as { records: unknown[] })
      .records;
    (candidate.evidenceCatalog as { records: unknown[] }).records =
      records.filter(
        (record) =>
          (record as { id?: string }).id !== "customer-churn-seed-1729-v1",
      );
    await expect(
      validateScientificEngineSnapshot(candidate, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/evidence|golden|resolve/i);

    const forged = snapshot();
    const engine = (forged.registry as { engines: { integrityHash: string }[] })
      .engines[0]!;
    engine.integrityHash = sha256("0");
    await expect(
      validateScientificEngineSnapshot(forged, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/integrity|hash/i);
  });

  it("rejects a solver reused as its own reference oracle", async () => {
    const candidate = snapshot();
    const pack = (
      candidate.bindings as {
        subjectPacks: { roles: Record<string, unknown> }[];
      }
    ).subjectPacks[0]!;
    pack.roles.referenceOracle = {
      kind: "ENGINE",
      engineIds: ["numpy-fixed-ml"],
    };
    await expect(
      validateScientificEngineSnapshot(candidate, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/oracle|independent|solver/i);
  });

  it("rejects runtime version drift and missing health evidence", async () => {
    const drifted = snapshot();
    const installed = (
      drifted.runtimeManifest as {
        installedEngines: { exactVersion: string }[];
      }
    ).installedEngines[0]!;
    installed.exactVersion = "2.5.0";
    await expect(
      validateScientificEngineSnapshot(drifted, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/version|runtime|installed/i);

    const missing = snapshot();
    const catalog = missing.evidenceCatalog as { records: unknown[] };
    catalog.records = catalog.records.filter(
      (record) => (record as { id?: string }).id !== "engine-health-v1",
    );
    await expect(
      validateScientificEngineSnapshot(missing, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/health|evidence|resolve/i);
  });

  it("rejects non-verified engine and internal authority evidence", async () => {
    const partialLicense = snapshot();
    const license = (
      partialLicense.evidenceCatalog as {
        records: { id: string; status: string }[];
      }
    ).records.find((record) => record.id === "numpy-license-v1")!;
    license.status = "PARTIAL";
    await expect(
      validateScientificEngineSnapshot(partialLicense, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/evidence|verified|partial/i);

    const rejectedInternal = snapshot();
    const rendererEvidence = (
      rejectedInternal.evidenceCatalog as {
        records: { id: string; status: string }[];
      }
    ).records.find((record) => record.id === "renderer-binding-v1")!;
    rendererEvidence.status = "REJECTED";
    await expect(
      validateScientificEngineSnapshot(rejectedInternal, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/evidence|verified|rejected/i);
  });

  it("rejects a runtime tolerance profile that differs from the descriptor", async () => {
    const candidate = snapshot();
    const installed = (
      candidate.runtimeManifest as {
        installedEngines: { toleranceProfileId: string }[];
      }
    ).installedEngines[0]!;
    installed.toleranceProfileId = "counterlab-ml-other-v1";
    const records = (
      candidate.evidenceCatalog as { records: Record<string, unknown>[] }
    ).records;
    records.push({
      id: "counterlab-ml-other-v1",
      kind: "tolerance_profile",
      path: "scientific-engines/fixtures/other-tolerance.json",
      sha256: sha256("f"),
      status: "VERIFIED",
      limitations: [],
    });
    await expect(
      validateScientificEngineSnapshot(candidate, {
        verifyDeclaredHashes: false,
      }),
    ).rejects.toThrow(/tolerance|profile/i);
  });

  it("requires the Subject Pack version when resolving operation authority", async () => {
    const parsed = await validateScientificEngineSnapshot(snapshot(), {
      verifyDeclaredHashes: false,
    });
    expect(() =>
      resolveSubjectPackOperationAuthority(
        parsed,
        "entity-leakage",
        "2.0.0",
        "leakage.group_holdout",
      ),
    ).toThrow(/version|subject pack/i);
  });

  it("normalizes set-like ordering in the composite authority hash", async () => {
    const first = snapshot();
    const second = structuredClone(first);
    const firstEngine = (
      first.registry as { engines: Record<string, unknown>[] }
    ).engines[0]!;
    const secondEngine = (
      second.registry as { engines: Record<string, unknown>[] }
    ).engines[0]!;
    firstEngine.capabilities = ["z-capability", "a-capability"];
    secondEngine.capabilities = ["a-capability", "z-capability"];

    expect(canonicalizeScientificEngineSnapshot(first)).toBe(
      canonicalizeScientificEngineSnapshot(second),
    );
    expect(await hashScientificEngineSnapshot(first)).toBe(
      await hashScientificEngineSnapshot(second),
    );
  });
});
