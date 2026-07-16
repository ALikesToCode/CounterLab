import { z } from "zod";

const StableIdSchema = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);

const ExactVersionSchema = z
  .string()
  .min(1)
  .max(80)
  .refine(
    (value) =>
      /^[0-9][0-9A-Za-z.+_-]*$/.test(value) &&
      !/(?:^|[._+-])(?:latest|x)(?:$|[._+-])/i.test(value) &&
      !/[\s*^~<>=|/\\]/.test(value),
    "an exact, non-floating version is required",
  );

const HttpsUrlSchema = z.url().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.username.length === 0 &&
      url.password.length === 0
    );
  } catch {
    return false;
  }
}, "an HTTPS URL is required");

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const GitCommitSchema = z.string().regex(/^[a-f0-9]{40}$/);
const OciDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const RepositoryPathSchema = z
  .string()
  .min(1)
  .max(300)
  .refine(
    (value) =>
      !value.startsWith("/") &&
      !value.startsWith("\\") &&
      !value.includes("\\") &&
      value.split("/").every((segment) => segment !== "" && segment !== ".."),
    "a contained repository-relative path is required",
  );

const NonEmptyTextSchema = z.string().trim().min(1).max(500);

const UniqueStableIdsSchema = z
  .array(StableIdSchema)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `duplicate identifier: ${value}`,
        });
      }
      seen.add(value);
    }
  });

const UniqueTextSchema = z
  .array(NonEmptyTextSchema)
  .superRefine((values, context) => {
    const seen = new Set<string>();
    for (const [index, value] of values.entries()) {
      if (seen.has(value)) {
        context.addIssue({
          code: "custom",
          path: [index],
          message: `duplicate value: ${value}`,
        });
      }
      seen.add(value);
    }
  });

export const ScientificEngineRoleSchema = z.enum([
  "authoritative_solver",
  "reference_oracle",
  "unit_validator",
  "renderer",
  "property_test_generator",
  "secondary_comparator",
]);

export const ScientificEngineDescriptorSchema = z
  .strictObject({
    id: StableIdSchema,
    domain: StableIdSchema,
    packageName: z.string().trim().min(1).max(160),
    exactVersion: ExactVersionSchema,
    sourceUrl: HttpsUrlSchema,
    licenseId: z
      .string()
      .trim()
      .min(1)
      .max(240)
      .regex(/^[A-Za-z0-9().+\- ]+$/),
    licenseFileHash: Sha256Schema,
    runtime: z.enum([
      "server_python",
      "browser_wasm",
      "browser_js",
      "build_only",
    ]),
    roles: z
      .array(ScientificEngineRoleSchema)
      .min(1)
      .superRefine((values, context) => {
        const seen = new Set<string>();
        for (const [index, value] of values.entries()) {
          if (seen.has(value)) {
            context.addIssue({
              code: "custom",
              path: [index],
              message: `duplicate role: ${value}`,
            });
          }
          seen.add(value);
        }
      }),
    capabilities: UniqueTextSchema.min(1),
    allowedOperationIds: UniqueStableIdsSchema.min(1),
    networkPolicy: z.literal("denied"),
    deterministicProfile: z.strictObject({
      seedPolicy: NonEmptyTextSchema,
      threadPolicy: NonEmptyTextSchema,
      toleranceProfileId: StableIdSchema,
      hardwareNotes: UniqueTextSchema,
    }),
    resourceLimits: z.strictObject({
      maxSeconds: z.number().int().min(1).max(3600),
      maxMemoryMb: z.number().int().min(16).max(65_536),
      maxOutputBytes: z.number().int().min(1).max(104_857_600),
    }),
    validation: z.strictObject({
      oracleStrategyIds: UniqueStableIdsSchema,
      goldenFixtureIds: UniqueStableIdsSchema,
      metamorphicPropertyIds: UniqueStableIdsSchema,
      upgradeDriftFixtureIds: UniqueStableIdsSchema,
    }),
    attribution: NonEmptyTextSchema,
    integrityHash: Sha256Schema,
  })
  .superRefine((descriptor, context) => {
    const hasValidation =
      descriptor.validation.oracleStrategyIds.length > 0 ||
      descriptor.validation.goldenFixtureIds.length > 0 ||
      descriptor.validation.metamorphicPropertyIds.length > 0;
    if (!hasValidation) {
      context.addIssue({
        code: "custom",
        path: ["validation"],
        message: "at least one independent validation path is required",
      });
    }

    if (descriptor.roles.includes("authoritative_solver")) {
      if (descriptor.validation.goldenFixtureIds.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["validation", "goldenFixtureIds"],
          message: "authoritative solvers require a golden fixture",
        });
      }
      if (descriptor.validation.upgradeDriftFixtureIds.length === 0) {
        context.addIssue({
          code: "custom",
          path: ["validation", "upgradeDriftFixtureIds"],
          message: "authoritative solvers require an upgrade-drift fixture",
        });
      }
    }

    if (
      descriptor.roles.includes("renderer") &&
      descriptor.roles.includes("authoritative_solver")
    ) {
      context.addIssue({
        code: "custom",
        path: ["roles"],
        message: "a renderer cannot also be the authoritative solver",
      });
    }
  });

export const ScientificEngineRegistrySchema = z.strictObject({
  schemaVersion: z.literal("1"),
  engines: z.array(ScientificEngineDescriptorSchema).min(1),
});

const RegisteredAuthoritySchema = z.strictObject({
  kind: z.literal("ENGINE"),
  engineIds: UniqueStableIdsSchema.min(1),
});

const InternalAuthoritySchema = z.strictObject({
  kind: z.literal("INTERNAL"),
  authorityId: StableIdSchema,
  exactVersion: ExactVersionSchema,
  integrityEvidenceId: StableIdSchema,
  integrityHash: Sha256Schema,
  validationEvidenceIds: UniqueStableIdsSchema.min(1),
  reason: NonEmptyTextSchema,
});

const NotApplicableAuthoritySchema = z.strictObject({
  kind: z.literal("NOT_APPLICABLE"),
  reason: NonEmptyTextSchema,
});

export const SubjectPackAuthorityBindingSchema = z.discriminatedUnion("kind", [
  RegisteredAuthoritySchema,
  InternalAuthoritySchema,
  NotApplicableAuthoritySchema,
]);

export const SubjectPackEngineBindingSchema = z.strictObject({
  subjectPackId: StableIdSchema,
  subjectPackVersion: ExactVersionSchema,
  operationAuthorities: z
    .array(
      z.strictObject({
        operationId: StableIdSchema,
        authoritativeEngineIds: UniqueStableIdsSchema.min(1),
      }),
    )
    .min(1)
    .superRefine((authorities, context) => {
      const seen = new Set<string>();
      for (const [index, authority] of authorities.entries()) {
        if (seen.has(authority.operationId)) {
          context.addIssue({
            code: "custom",
            path: [index, "operationId"],
            message: `duplicate operation authority: ${authority.operationId}`,
          });
        }
        seen.add(authority.operationId);
      }
    }),
  roles: z.strictObject({
    authoritativeSolver: RegisteredAuthoritySchema,
    referenceOracle: SubjectPackAuthorityBindingSchema,
    unitValidator: SubjectPackAuthorityBindingSchema,
    renderer: SubjectPackAuthorityBindingSchema,
    propertyTestGenerator: SubjectPackAuthorityBindingSchema,
    secondaryComparator: SubjectPackAuthorityBindingSchema,
  }),
});

export const SubjectPackEngineBindingsSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  subjectPacks: z.array(SubjectPackEngineBindingSchema).min(1),
});

export const ScientificEngineEvidenceKindSchema = z.enum([
  "license",
  "integrity",
  "oracle_strategy",
  "golden_fixture",
  "metamorphic_property",
  "upgrade_drift_fixture",
  "health_report",
  "tolerance_profile",
  "resource_profile",
  "lockfile",
  "sbom",
  "sbom_manifest",
  "vulnerability_scan",
  "vulnerability_report",
  "vex",
  "vex_application_report",
  "reachability_report",
]);

export const ScientificEngineEvidenceRecordSchema = z.strictObject({
  id: StableIdSchema,
  kind: ScientificEngineEvidenceKindSchema,
  engineId: StableIdSchema.optional(),
  path: RepositoryPathSchema,
  sha256: Sha256Schema,
  status: z.enum(["VERIFIED", "PARTIAL", "REJECTED"]),
  limitations: UniqueTextSchema,
});

export const ScientificEngineEvidenceCatalogSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  records: z.array(ScientificEngineEvidenceRecordSchema).min(1),
});

export const ScientificEngineRuntimeManifestSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    generatedAt: z.iso.datetime(),
    environmentId: StableIdSchema,
    environmentKind: z.enum(["local_candidate", "cloudflare_production"]),
    sourceCommit: GitCommitSchema,
    registryHash: Sha256Schema,
    bindingsHash: Sha256Schema,
    platform: z.strictObject({
      os: z.string().trim().min(1),
      architecture: z.string().trim().min(1),
    }),
    runtimes: z
      .array(
        z.strictObject({
          id: StableIdSchema,
          exactVersion: ExactVersionSchema,
          sourceUrl: HttpsUrlSchema,
          licenseId: z.string().trim().min(1),
          licenseFileHash: Sha256Schema,
        }),
      )
      .min(1),
    installedEngines: z
      .array(
        z.strictObject({
          engineId: StableIdSchema,
          packageName: z.string().trim().min(1).max(160),
          exactVersion: ExactVersionSchema,
          artifactSha256: Sha256Schema,
          healthEvidenceId: StableIdSchema,
          toleranceProfileId: StableIdSchema,
        }),
      )
      .min(1),
    container: z.strictObject({
      imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      vcpu: z.number().positive(),
      memoryMb: z.number().int().positive(),
      diskMb: z.number().int().positive(),
    }),
    resourceLimitProfileId: StableIdSchema,
    lockHashes: z
      .record(StableIdSchema, Sha256Schema)
      .refine(
        (value) => Object.keys(value).length > 0,
        "at least one lock hash is required",
      ),
    sbomHashes: z
      .record(StableIdSchema, Sha256Schema)
      .refine(
        (value) => Object.keys(value).length > 0,
        "at least one SBOM hash is required",
      ),
    sbomManifestEvidenceId: StableIdSchema,
    sbomManifestHash: Sha256Schema,
    vulnerabilityReportEvidenceId: StableIdSchema,
    vulnerabilityReportHash: Sha256Schema,
    vexEvidenceId: StableIdSchema.optional(),
    vexEvidenceHash: Sha256Schema.optional(),
    reachabilityEvidenceId: StableIdSchema.optional(),
    reachabilityEvidenceHash: Sha256Schema.optional(),
    vexApplicationEvidenceId: StableIdSchema.optional(),
    vexApplicationEvidenceHash: Sha256Schema.optional(),
  })
  .superRefine((manifest, context) => {
    const reviewedBindings = [
      manifest.vexEvidenceId,
      manifest.vexEvidenceHash,
      manifest.reachabilityEvidenceId,
      manifest.reachabilityEvidenceHash,
      manifest.vexApplicationEvidenceId,
      manifest.vexApplicationEvidenceHash,
    ];
    const present = reviewedBindings.filter(
      (value) => value !== undefined,
    ).length;
    if (present !== 0 && present !== reviewedBindings.length) {
      context.addIssue({
        code: "custom",
        path: ["vexEvidenceId"],
        message: "reviewed vulnerability evidence bindings must be complete",
      });
    }
  });

export const ScientificEngineSnapshotSchema = z.strictObject({
  schemaVersion: z.literal("1"),
  registry: ScientificEngineRegistrySchema,
  bindings: SubjectPackEngineBindingsSchema,
  runtimeManifest: ScientificEngineRuntimeManifestSchema,
  evidenceCatalog: ScientificEngineEvidenceCatalogSchema,
});

export const QualifiedRunnerReleaseSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    status: z.literal("VERIFIED"),
    sourceCommit: GitCommitSchema,
    sourceArchiveSha256: Sha256Schema,
    sourceTreeSha256: Sha256Schema,
    dockerfileSha256: Sha256Schema,
    localImageTag: z
      .string()
      .regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
    localImageDigest: OciDigestSchema,
    ociRevision: GitCommitSchema,
    ociSourceTreeSha256: Sha256Schema,
    engineAuthorityHash: Sha256Schema,
    runtimeManifestHash: Sha256Schema,
    evidenceCommit: GitCommitSchema,
    qualifiedAt: z.iso.datetime({ offset: true }),
    verifierVersion: StableIdSchema,
  })
  .superRefine((release, context) => {
    if (release.ociRevision !== release.sourceCommit) {
      context.addIssue({
        code: "custom",
        path: ["ociRevision"],
        message: "the OCI revision must equal the qualified source commit",
      });
    }
    if (release.ociSourceTreeSha256 !== release.sourceTreeSha256) {
      context.addIssue({
        code: "custom",
        path: ["ociSourceTreeSha256"],
        message: "the OCI source-tree label must equal the qualified tree hash",
      });
    }
    if (
      release.localImageTag !== `counterlab-runner:git-${release.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["localImageTag"],
        message: "the local image tag must be immutable and source-bound",
      });
    }
  });
