import type {
  ScientificEngineDescriptor,
  ScientificEngineRegistry,
  SubjectPackEngineBinding,
  SubjectPackEngineBindings,
} from "../src/index.js";

export const sha256 = (character: string): string => character.repeat(64);

export function engineDescriptor(
  overrides: Partial<ScientificEngineDescriptor> = {},
): ScientificEngineDescriptor {
  return {
    id: "numpy-fixed-ml",
    domain: "machine_learning",
    packageName: "numpy",
    exactVersion: "2.4.6",
    sourceUrl: "https://pypi.org/project/numpy/2.4.6/",
    licenseId: "BSD-3-Clause",
    licenseFileHash: sha256("a"),
    runtime: "server_python",
    roles: ["authoritative_solver"],
    capabilities: ["bounded_numeric_arrays", "fixed_ml_kernel_support"],
    allowedOperationIds: ["ml.fixture_array_v1", "ml.canonicalize_array_v1"],
    networkPolicy: "denied",
    deterministicProfile: {
      seedPolicy: "The Subject Pack supplies an explicit integer seed.",
      threadPolicy: "BLAS and OpenMP thread counts are fixed to one.",
      toleranceProfileId: "counterlab-ml-f64-v1",
      hardwareNotes: [
        "Canonical serialization normalizes supported floating-point values.",
      ],
    },
    resourceLimits: {
      maxSeconds: 30,
      maxMemoryMb: 1024,
      maxOutputBytes: 1_048_576,
    },
    validation: {
      oracleStrategyIds: ["ml-independent-fixtures-v1"],
      goldenFixtureIds: ["customer-churn-seed-1729-v1"],
      metamorphicPropertyIds: ["ml-row-order-invariance-v1"],
      upgradeDriftFixtureIds: ["ml-engine-drift-v1"],
    },
    attribution: "NumPy Developers; BSD-3-Clause license.",
    integrityHash: sha256("b"),
    ...overrides,
  };
}

export function registry(
  engines: ScientificEngineDescriptor[] = [engineDescriptor()],
): ScientificEngineRegistry {
  return {
    schemaVersion: "1",
    engines,
  };
}

export function subjectPackBinding(
  overrides: Partial<SubjectPackEngineBinding> = {},
): SubjectPackEngineBinding {
  return {
    subjectPackId: "entity-leakage",
    subjectPackVersion: "1.0.0",
    operationAuthorities: [
      {
        operationId: "ml.fixture_array_v1",
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
        integrityEvidenceId: "counterlab-independent-fixtures-integrity-v1",
        integrityHash: sha256("c"),
        validationEvidenceIds: ["ml-independent-fixtures-v1"],
        reason: "CounterLab owns the independently reviewed fixture oracle.",
      },
      unitValidator: {
        kind: "NOT_APPLICABLE",
        reason: "This ML pack has no physical-unit boundary.",
      },
      renderer: {
        kind: "INTERNAL",
        authorityId: "counterlab-signed-result-renderer",
        exactVersion: "1.0.0",
        integrityEvidenceId: "counterlab-signed-renderer-integrity-v1",
        integrityHash: sha256("d"),
        validationEvidenceIds: ["signed-result-binding-v1"],
        reason: "Fixed React components render signed result paths.",
      },
      propertyTestGenerator: {
        kind: "INTERNAL",
        authorityId: "counterlab-mutation-matrix",
        exactVersion: "1.0.0",
        integrityEvidenceId: "counterlab-mutations-integrity-v1",
        integrityHash: sha256("e"),
        validationEvidenceIds: ["ml-row-order-invariance-v1"],
        reason: "The frozen mutation matrix owns property coverage.",
      },
      secondaryComparator: {
        kind: "NOT_APPLICABLE",
        reason: "No secondary implementation is authoritative for this pack.",
      },
    },
    ...overrides,
  };
}

export function subjectPackBindings(
  subjectPacks: SubjectPackEngineBinding[] = [subjectPackBinding()],
): SubjectPackEngineBindings {
  return {
    schemaVersion: "1",
    subjectPacks,
  };
}
