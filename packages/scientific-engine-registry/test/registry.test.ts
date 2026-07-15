import { describe, expect, it } from "vitest";

import {
  ScientificEngineDescriptorSchema,
  ScientificEngineRegistrySchema,
  SubjectPackEngineBindingSchema,
  SubjectPackEngineBindingsSchema,
  canonicalizeScientificEngineRegistry,
  hashScientificEngineRegistry,
  validateScientificEngineRegistry,
} from "../src/index.js";
import {
  engineDescriptor,
  registry,
  sha256,
  subjectPackBinding,
  subjectPackBindings,
} from "./fixtures.js";

describe("ScientificEngineDescriptorSchema", () => {
  it("accepts a complete, bounded v1 descriptor", () => {
    const parsed = ScientificEngineDescriptorSchema.parse(engineDescriptor());

    expect(parsed).toMatchObject({
      id: "numpy-fixed-ml",
      exactVersion: "2.4.6",
      networkPolicy: "denied",
      runtime: "server_python",
      roles: ["authoritative_solver"],
    });
    expect(parsed.validation.goldenFixtureIds).toHaveLength(1);
    expect(parsed.validation.upgradeDriftFixtureIds).toHaveLength(1);
  });

  it("rejects unknown fields at every object boundary", () => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse({
        ...engineDescriptor(),
        installCommand: "pip install numpy",
      }),
    ).toThrow();

    expect(() =>
      ScientificEngineDescriptorSchema.parse({
        ...engineDescriptor(),
        deterministicProfile: {
          ...engineDescriptor().deterministicProfile,
          implicitSeed: true,
        },
      }),
    ).toThrow();

    expect(() =>
      ScientificEngineDescriptorSchema.parse({
        ...engineDescriptor(),
        validation: {
          ...engineDescriptor().validation,
          trustedBecausePopular: true,
        },
      }),
    ).toThrow();
  });

  it.each(["latest", "*", "^2.4.6", "~2.4.6", ">=2.4.0", "2.x"])(
    "rejects floating or ranged version %s",
    (exactVersion) => {
      expect(() =>
        ScientificEngineDescriptorSchema.parse(
          engineDescriptor({ exactVersion }),
        ),
      ).toThrow();
    },
  );

  it.each([
    "http://pypi.org/project/numpy/2.4.6/",
    "git://github.com/numpy/numpy.git",
    "pypi:numpy@2.4.6",
  ])("rejects non-HTTPS source URL %s", (sourceUrl) => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse(engineDescriptor({ sourceUrl })),
    ).toThrow();
  });

  it("rejects any network policy other than denied", () => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse({
        ...engineDescriptor(),
        networkPolicy: "allowlisted",
      }),
    ).toThrow();
  });

  it("rejects duplicate roles and operation IDs", () => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse(
        engineDescriptor({
          roles: ["authoritative_solver", "authoritative_solver"],
        }),
      ),
    ).toThrow(/role|duplicate|unique/i);

    expect(() =>
      ScientificEngineDescriptorSchema.parse(
        engineDescriptor({
          allowedOperationIds: ["ml.fixture_array_v1", "ml.fixture_array_v1"],
        }),
      ),
    ).toThrow(/operation|duplicate|unique/i);
  });

  it("requires at least one independent validation path", () => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse(
        engineDescriptor({
          validation: {
            oracleStrategyIds: [],
            goldenFixtureIds: [],
            metamorphicPropertyIds: [],
            upgradeDriftFixtureIds: [],
          },
        }),
      ),
    ).toThrow(/validation|oracle|fixture|property/i);
  });

  it("requires authoritative solvers to carry golden and upgrade-drift fixtures", () => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse(
        engineDescriptor({
          validation: {
            ...engineDescriptor().validation,
            goldenFixtureIds: [],
          },
        }),
      ),
    ).toThrow(/golden/i);

    expect(() =>
      ScientificEngineDescriptorSchema.parse(
        engineDescriptor({
          validation: {
            ...engineDescriptor().validation,
            upgradeDriftFixtureIds: [],
          },
        }),
      ),
    ).toThrow(/drift|upgrade/i);
  });

  it("does not permit a renderer to silently act as an authoritative solver", () => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse(
        engineDescriptor({
          roles: ["renderer", "authoritative_solver"],
        }),
      ),
    ).toThrow(/renderer|authoritative/i);
  });

  it.each([
    ["licenseFileHash", "f".repeat(63)],
    ["licenseFileHash", "G".repeat(64)],
    ["integrityHash", "0x" + "f".repeat(64)],
    ["integrityHash", "ABCDEF".repeat(10) + "ABCD"],
  ] as const)("rejects malformed %s", (field, value) => {
    expect(() =>
      ScientificEngineDescriptorSchema.parse({
        ...engineDescriptor(),
        [field]: value,
      }),
    ).toThrow(/hash|sha|hex/i);
  });
});

describe("ScientificEngineRegistrySchema", () => {
  it("accepts a strict v1 registry and rejects envelope extensions", () => {
    expect(ScientificEngineRegistrySchema.parse(registry())).toEqual(
      registry(),
    );
    expect(() =>
      ScientificEngineRegistrySchema.parse({
        ...registry(),
        generatedBy: "release-script",
      }),
    ).toThrow();
  });

  it("rejects duplicate engine IDs", () => {
    const duplicate = engineDescriptor({
      packageName: "counterlab-numeric-wrapper",
      integrityHash: sha256("c"),
    });

    expect(() =>
      validateScientificEngineRegistry(
        registry([engineDescriptor(), duplicate]),
      ),
    ).toThrow(/engine|id|duplicate|unique/i);
  });

  it("canonicalizes and hashes independently of object key insertion order", async () => {
    const normal = registry();
    const descriptor = engineDescriptor();
    const reordered = {
      engines: [
        {
          integrityHash: descriptor.integrityHash,
          attribution: descriptor.attribution,
          validation: {
            upgradeDriftFixtureIds:
              descriptor.validation.upgradeDriftFixtureIds,
            metamorphicPropertyIds:
              descriptor.validation.metamorphicPropertyIds,
            goldenFixtureIds: descriptor.validation.goldenFixtureIds,
            oracleStrategyIds: descriptor.validation.oracleStrategyIds,
          },
          resourceLimits: {
            maxOutputBytes: descriptor.resourceLimits.maxOutputBytes,
            maxMemoryMb: descriptor.resourceLimits.maxMemoryMb,
            maxSeconds: descriptor.resourceLimits.maxSeconds,
          },
          deterministicProfile: {
            hardwareNotes: descriptor.deterministicProfile.hardwareNotes,
            toleranceProfileId:
              descriptor.deterministicProfile.toleranceProfileId,
            threadPolicy: descriptor.deterministicProfile.threadPolicy,
            seedPolicy: descriptor.deterministicProfile.seedPolicy,
          },
          networkPolicy: descriptor.networkPolicy,
          allowedOperationIds: descriptor.allowedOperationIds,
          capabilities: descriptor.capabilities,
          roles: descriptor.roles,
          runtime: descriptor.runtime,
          licenseFileHash: descriptor.licenseFileHash,
          licenseId: descriptor.licenseId,
          sourceUrl: descriptor.sourceUrl,
          exactVersion: descriptor.exactVersion,
          packageName: descriptor.packageName,
          domain: descriptor.domain,
          id: descriptor.id,
        },
      ],
      schemaVersion: "1",
    };

    expect(canonicalizeScientificEngineRegistry(reordered)).toBe(
      canonicalizeScientificEngineRegistry(normal),
    );
    expect(await hashScientificEngineRegistry(reordered)).toBe(
      await hashScientificEngineRegistry(normal),
    );
    expect(await hashScientificEngineRegistry(normal)).toMatch(
      /^[a-f0-9]{64}$/,
    );
  });
});

describe("SubjectPackEngineBindingSchema", () => {
  it("accepts an explicit binding for every scientific-engine role", () => {
    const parsed = SubjectPackEngineBindingSchema.parse(subjectPackBinding());

    expect(parsed.roles.authoritativeSolver).toEqual({
      kind: "ENGINE",
      engineIds: ["numpy-fixed-ml"],
    });
    expect(parsed.roles.unitValidator.kind).toBe("NOT_APPLICABLE");
    expect(Object.keys(parsed.roles).sort()).toEqual(
      [
        "authoritativeSolver",
        "propertyTestGenerator",
        "referenceOracle",
        "renderer",
        "secondaryComparator",
        "unitValidator",
      ].sort(),
    );
    expect(() =>
      validateScientificEngineRegistry(
        registry(),
        subjectPackBindings([parsed]),
      ),
    ).not.toThrow();
  });

  it("rejects unknown engines and role mismatches", () => {
    expect(() =>
      validateScientificEngineRegistry(
        registry(),
        subjectPackBindings([
          subjectPackBinding({
            roles: {
              ...subjectPackBinding().roles,
              authoritativeSolver: {
                kind: "ENGINE",
                engineIds: ["missing-engine"],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/engine|missing|unknown/i);

    expect(() =>
      validateScientificEngineRegistry(
        registry(),
        subjectPackBindings([
          subjectPackBinding({
            roles: {
              ...subjectPackBinding().roles,
              renderer: {
                kind: "ENGINE",
                engineIds: ["numpy-fixed-ml"],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/role|renderer/i);
  });

  it("does not allow a renderer-only engine to satisfy solver authority", () => {
    const renderer = engineDescriptor({
      id: "typed-chart-renderer",
      packageName: "counterlab-fixed-renderer",
      roles: ["renderer"],
      allowedOperationIds: ["ui.render_signed_chart_v1"],
      validation: {
        oracleStrategyIds: [],
        goldenFixtureIds: ["signed-chart-binding-v1"],
        metamorphicPropertyIds: ["chart-table-equivalence-v1"],
        upgradeDriftFixtureIds: ["chart-renderer-drift-v1"],
      },
      integrityHash: sha256("d"),
    });

    expect(() =>
      validateScientificEngineRegistry(
        registry([renderer]),
        subjectPackBindings([
          subjectPackBinding({
            roles: {
              ...subjectPackBinding().roles,
              authoritativeSolver: {
                kind: "ENGINE",
                engineIds: ["typed-chart-renderer"],
              },
            },
          }),
        ]),
      ),
    ).toThrow(/renderer|authoritative|solver|role/i);
  });

  it("rejects duplicate engine assignments and duplicate Subject Pack bindings", () => {
    expect(() =>
      SubjectPackEngineBindingSchema.parse(
        subjectPackBinding({
          roles: {
            ...subjectPackBinding().roles,
            authoritativeSolver: {
              kind: "ENGINE",
              engineIds: ["numpy-fixed-ml", "numpy-fixed-ml"],
            },
          },
        }),
      ),
    ).toThrow(/engine|duplicate|unique/i);

    expect(() =>
      validateScientificEngineRegistry(
        registry(),
        SubjectPackEngineBindingsSchema.parse(
          subjectPackBindings([subjectPackBinding(), subjectPackBinding()]),
        ),
      ),
    ).toThrow(/subject|pack|duplicate|binding/i);
  });

  it("rejects unknown binding fields instead of silently ignoring them", () => {
    expect(() =>
      SubjectPackEngineBindingSchema.parse({
        ...subjectPackBinding(),
        operations: ["ml.fixture_array_v1"],
      }),
    ).toThrow();
  });
});
