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

export const ContainedRuntimeAttestationV1Schema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    status: z.literal("VERIFIED"),
    sessionId: z.string().regex(/^rt-[a-z0-9][a-z0-9-]{7,13}$/),
    namespace: z.literal("counterlab-v6.1"),
    runtimeToolchainSha256: Sha256Schema,
    toolchainLockSha256: Sha256Schema,
    adapterSha256: Sha256Schema,
    componentSha256: z.strictObject({
      buildctl: Sha256Schema,
      buildkitd: Sha256Schema,
      containerd: Sha256Schema,
      "containerd-shim-runc-v2": Sha256Schema,
      ctr: Sha256Schema,
      nerdctl: Sha256Schema,
      rootlesskit: Sha256Schema,
      runc: Sha256Schema,
    }),
    fileSha256: z.strictObject({
      containerdConfig: Sha256Schema,
      buildkitConfig: Sha256Schema,
    }),
    containerdRootlesskitApiSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/containerd-rootless\/api\.sock$/),
    containerdSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/containerd\.sock$/),
    runtimeCommandSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/runtime-command\.sock$/),
    buildkitSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/buildkitd\.sock$/),
  })
  .superRefine((attestation, context) => {
    const prefix = `.rt/${attestation.sessionId}/run`;
    const expected = {
      containerdRootlesskitApiSocket: `${prefix}/containerd-rootless/api.sock`,
      containerdSocket: `${prefix}/containerd.sock`,
      runtimeCommandSocket: `${prefix}/runtime-command.sock`,
      buildkitSocket: `${prefix}/buildkitd.sock`,
    } as const;
    for (const [field, path] of Object.entries(expected)) {
      if (attestation[field as keyof typeof expected] !== path) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "runtime socket path must bind the attested session",
        });
      }
    }
  });

export const RuntimeProofDependencyManifestSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    files: z
      .array(
        z.strictObject({
          path: RepositoryPathSchema,
          sha256: Sha256Schema,
        }),
      )
      .min(2),
  })
  .superRefine((manifest, context) => {
    const paths = manifest.files.map((entry) => entry.path);
    if (
      JSON.stringify(paths) !==
      JSON.stringify(
        [...new Set(paths)].sort((left, right) => left.localeCompare(right)),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message:
          "runtime proof dependencies must be unique and canonically ordered",
      });
    }
    if (
      !paths.includes(
        "services/runner/src/counterlab_runner/contained-runtime-policy.json",
      ) ||
      !paths.includes("scripts/verify-contained-runtime-timeout.py")
    ) {
      context.addIssue({
        code: "custom",
        path: ["files"],
        message: "runtime proof dependencies must include policy and proof CLI",
      });
    }
  });

export const ContainedRuntimeAttestationSchema = z
  .strictObject({
    schemaVersion: z.literal("2"),
    status: z.literal("VERIFIED"),
    sessionId: z.string().regex(/^rt-[a-z0-9][a-z0-9-]{7,13}$/),
    namespace: z.literal("counterlab-v6.1"),
    runtimeToolchainSha256: Sha256Schema,
    runtimePolicySha256: Sha256Schema,
    proofDependencyManifestSha256: Sha256Schema,
    toolchainLockSha256: Sha256Schema,
    adapterSha256: Sha256Schema,
    componentSha256: z.strictObject({
      buildctl: Sha256Schema,
      buildkitd: Sha256Schema,
      containerd: Sha256Schema,
      "containerd-shim-runc-v2": Sha256Schema,
      ctr: Sha256Schema,
      nerdctl: Sha256Schema,
      rootlesskit: Sha256Schema,
      runc: Sha256Schema,
    }),
    fileSha256: z.strictObject({
      containerdConfig: Sha256Schema,
      buildkitConfig: Sha256Schema,
    }),
    containerdRootlesskitApiSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/containerd-rootless\/api\.sock$/),
    containerdSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/containerd\.sock$/),
    runtimeCommandSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/runtime-command\.sock$/),
    buildkitSocket: z
      .string()
      .regex(/^\.rt\/rt-[a-z0-9-]+\/run\/buildkitd\.sock$/),
  })
  .superRefine((attestation, context) => {
    const prefix = `.rt/${attestation.sessionId}/run`;
    const expected = {
      containerdRootlesskitApiSocket: `${prefix}/containerd-rootless/api.sock`,
      containerdSocket: `${prefix}/containerd.sock`,
      runtimeCommandSocket: `${prefix}/runtime-command.sock`,
      buildkitSocket: `${prefix}/buildkitd.sock`,
    } as const;
    for (const [field, path] of Object.entries(expected)) {
      if (attestation[field as keyof typeof expected] !== path) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: "runtime socket path must bind the attested session",
        });
      }
    }
  });

export const TimeoutCleanupReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    status: z.literal("VERIFIED"),
    sourceCommit: GitCommitSchema,
    sourceTreeSha256: Sha256Schema,
    buildReceipt: RepositoryPathSchema,
    buildReceiptSha256: Sha256Schema,
    adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
    adapterImageDigest: OciDigestSchema,
    adapterManifestDigest: OciDigestSchema,
    adapterOciArchiveSha256: Sha256Schema,
    runtimeSessionId: z.string().regex(/^rt-[a-z0-9][a-z0-9-]{7,13}$/),
    runtimeToolchainSha256: Sha256Schema,
    runtimePolicySha256: Sha256Schema,
    proofDependencyManifestSha256: Sha256Schema,
    runtimeAttestationSha256Before: Sha256Schema,
    runtimeAttestationSha256After: Sha256Schema,
    driverCliSha256: Sha256Schema,
    driverModuleSha256: Sha256Schema,
    probePlanSha256: Sha256Schema,
    probeAdapterSha256: Sha256Schema,
    probePublicTestsSha256: Sha256Schema,
    runControlReceipt: RepositoryPathSchema,
    runControlReceiptSha256: Sha256Schema,
    rootlessReceipt: RepositoryPathSchema,
    rootlessReceiptSha256: Sha256Schema,
    aggregateLimitEvidenceSha256: Sha256Schema,
    invocationId: Sha256Schema,
    finalContainerId: Sha256Schema,
    commandSha256: Sha256Schema,
    candidateWallSeconds: z.literal(1),
    elapsedMs: z.number().int().positive().max(600_000),
    resultReleased: z.literal(false),
    cleanup: z.strictObject({
      taskAbsent: z.literal(true),
      containerAbsent: z.literal(true),
      snapshotAbsent: z.literal(true),
      invocationAliasAbsent: z.literal(true),
      imageRootfsAbsent: z.literal(true),
      persistedAuthorityVerified: z.literal(true),
      readOnlyMountsUnchanged: z.literal(true),
      imageRootfsUnchanged: z.literal(true),
    }),
    retainedWorkRoot: RepositoryPathSchema,
    verifiedAt: z.iso.datetime({ offset: true }),
    receiptPayloadSha256: Sha256Schema,
  })
  .superRefine((receipt, context) => {
    if (
      receipt.adapterImageTag !==
      `counterlab-adapter:git-${receipt.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterImageTag"],
        message: "timeout probe image tag must bind the source commit",
      });
    }
    if (
      receipt.runtimeAttestationSha256Before !==
      receipt.runtimeAttestationSha256After
    ) {
      context.addIssue({
        code: "custom",
        path: ["runtimeAttestationSha256After"],
        message: "timeout probe must preserve the attested runtime",
      });
    }
  });

export const QualifiedRunnerReleaseV1Schema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    status: z.literal("VERIFIED"),
    sourceCommit: GitCommitSchema,
    sourceArchiveSha256: Sha256Schema,
    sourceTreeSha256: Sha256Schema,
    dockerfileSha256: Sha256Schema,
    localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
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

export const QualifiedRunnerReleaseV2Schema = z
  .strictObject({
    schemaVersion: z.literal("2"),
    status: z.literal("VERIFIED"),
    sourceCommit: GitCommitSchema,
    sourceArchiveSha256: Sha256Schema,
    sourceTreeSha256: Sha256Schema,
    dockerfileSha256: Sha256Schema,
    localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
    localImageDigest: OciDigestSchema,
    ociRevision: GitCommitSchema,
    ociSourceTreeSha256: Sha256Schema,
    engineAuthorityHash: Sha256Schema,
    runtimeManifestHash: Sha256Schema,
    evidenceCommit: GitCommitSchema,
    registryImage: z
      .string()
      .regex(
        /^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner:git-[a-f0-9]{40}$/,
      ),
    registryDigest: OciDigestSchema,
    registryResolvedAt: z.iso.datetime({ offset: true }),
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
    if (!release.registryImage.endsWith(`:git-${release.sourceCommit}`)) {
      context.addIssue({
        code: "custom",
        path: ["registryImage"],
        message:
          "the registry image tag must equal the qualified source commit",
      });
    }
    if (
      Date.parse(release.registryResolvedAt) > Date.parse(release.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["registryResolvedAt"],
        message: "the registry digest must be resolved before qualification",
      });
    }
  });

export const QualifiedRunnerReleaseV3Schema = z
  .strictObject({
    schemaVersion: z.literal("3"),
    status: z.literal("VERIFIED"),
    sourceCommit: GitCommitSchema,
    sourceArchiveSha256: Sha256Schema,
    sourceTreeSha256: Sha256Schema,
    dockerfileSha256: Sha256Schema,
    localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
    localImageDigest: OciDigestSchema,
    ociRevision: GitCommitSchema,
    ociSourceTreeSha256: Sha256Schema,
    engineAuthorityHash: Sha256Schema,
    runtimeManifestHash: Sha256Schema,
    runtimeToolchainSha256: Sha256Schema,
    toolchainLockSha256: Sha256Schema,
    runtimeAdapterSha256: Sha256Schema,
    buildctlSha256: Sha256Schema,
    buildkitdSha256: Sha256Schema,
    buildkitConfigSha256: Sha256Schema,
    adapterDockerfileSha256: Sha256Schema,
    adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
    adapterImageDigest: OciDigestSchema,
    adapterManifestDigest: OciDigestSchema,
    adapterOciArchiveSha256: Sha256Schema,
    adapterOciRevision: GitCommitSchema,
    adapterOciSourceTreeSha256: Sha256Schema,
    evidenceCommit: GitCommitSchema,
    registryImage: z
      .string()
      .regex(
        /^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner:git-[a-f0-9]{40}$/,
      ),
    registryDigest: OciDigestSchema,
    registryResolvedAt: z.iso.datetime({ offset: true }),
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
    if (
      release.adapterImageTag !==
      `counterlab-adapter:git-${release.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterImageTag"],
        message: "the adapter image tag must be immutable and source-bound",
      });
    }
    if (release.adapterOciRevision !== release.sourceCommit) {
      context.addIssue({
        code: "custom",
        path: ["adapterOciRevision"],
        message:
          "the adapter OCI revision must equal the qualified source commit",
      });
    }
    if (release.adapterOciSourceTreeSha256 !== release.sourceTreeSha256) {
      context.addIssue({
        code: "custom",
        path: ["adapterOciSourceTreeSha256"],
        message:
          "the adapter OCI source-tree label must equal the qualified tree hash",
      });
    }
    if (!release.registryImage.endsWith(`:git-${release.sourceCommit}`)) {
      context.addIssue({
        code: "custom",
        path: ["registryImage"],
        message:
          "the registry image tag must equal the qualified source commit",
      });
    }
    if (
      Date.parse(release.registryResolvedAt) > Date.parse(release.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["registryResolvedAt"],
        message: "the registry digest must be resolved before qualification",
      });
    }
  });

export const QUALIFIED_AGGREGATE_LIMIT_MODE =
  "container-cgroup-and-process-rlimit" as const;

export const QualifiedRunnerReleaseV4Schema = z
  .strictObject({
    schemaVersion: z.literal("4"),
    status: z.literal("VERIFIED"),
    sourceCommit: GitCommitSchema,
    sourceArchiveSha256: Sha256Schema,
    sourceTreeSha256: Sha256Schema,
    dockerfileSha256: Sha256Schema,
    localImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
    localImageDigest: OciDigestSchema,
    ociRevision: GitCommitSchema,
    ociSourceTreeSha256: Sha256Schema,
    engineAuthorityHash: Sha256Schema,
    runtimeManifestHash: Sha256Schema,
    runtimeToolchainSha256: Sha256Schema,
    runtimePolicySha256: Sha256Schema,
    proofDependencyManifestSha256: Sha256Schema,
    toolchainLockSha256: Sha256Schema,
    runtimeAdapterSha256: Sha256Schema,
    buildctlSha256: Sha256Schema,
    buildkitdSha256: Sha256Schema,
    buildkitConfigSha256: Sha256Schema,
    adapterDockerfileSha256: Sha256Schema,
    adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
    adapterImageDigest: OciDigestSchema,
    adapterManifestDigest: OciDigestSchema,
    adapterOciArchiveSha256: Sha256Schema,
    adapterOciRevision: GitCommitSchema,
    adapterOciSourceTreeSha256: Sha256Schema,
    limitMode: z.literal(QUALIFIED_AGGREGATE_LIMIT_MODE),
    aggregateLimitIntentEnforced: z.literal(true),
    aggregateLimitEvidenceSha256: Sha256Schema,
    timeoutCleanupReceipt: RepositoryPathSchema,
    timeoutCleanupReceiptSha256: Sha256Schema,
    timeoutCleanupPayloadSha256: Sha256Schema,
    timeoutRunControlReceiptSha256: Sha256Schema,
    timeoutRootlessReceiptSha256: Sha256Schema,
    timeoutRuntimeSessionId: z.string().regex(/^rt-[a-z0-9][a-z0-9-]{7,13}$/),
    timeoutVerifiedAt: z.iso.datetime({ offset: true }),
    evidenceCommit: GitCommitSchema,
    registryImage: z
      .string()
      .regex(
        /^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner:git-[a-f0-9]{40}$/,
      ),
    registryDigest: OciDigestSchema,
    registryResolvedAt: z.iso.datetime({ offset: true }),
    qualifiedAt: z.iso.datetime({ offset: true }),
    verifierVersion: z.literal("counterlab-release-v4"),
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
    if (
      release.adapterImageTag !==
      `counterlab-adapter:git-${release.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterImageTag"],
        message: "the adapter image tag must be immutable and source-bound",
      });
    }
    if (release.adapterOciRevision !== release.sourceCommit) {
      context.addIssue({
        code: "custom",
        path: ["adapterOciRevision"],
        message:
          "the adapter OCI revision must equal the qualified source commit",
      });
    }
    if (release.adapterOciSourceTreeSha256 !== release.sourceTreeSha256) {
      context.addIssue({
        code: "custom",
        path: ["adapterOciSourceTreeSha256"],
        message:
          "the adapter OCI source-tree label must equal the qualified tree hash",
      });
    }
    if (!release.registryImage.endsWith(`:git-${release.sourceCommit}`)) {
      context.addIssue({
        code: "custom",
        path: ["registryImage"],
        message:
          "the registry image tag must equal the qualified source commit",
      });
    }
    if (
      Date.parse(release.registryResolvedAt) > Date.parse(release.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["registryResolvedAt"],
        message: "the registry digest must be resolved before qualification",
      });
    }
    if (
      Date.parse(release.timeoutVerifiedAt) > Date.parse(release.qualifiedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["timeoutVerifiedAt"],
        message: "the timeout-cleanup proof must precede qualification",
      });
    }
  });

export const QualifiedRunnerReleaseSchema = z
  .strictObject({
    ...QualifiedRunnerReleaseV4Schema.shape,
    schemaVersion: z.literal("5"),
    generationFilesystemReadIsolation: z.literal("OS_ENFORCED"),
    verifierVersion: z.literal("counterlab-release-v5"),
  })
  .superRefine((release, context) => {
    const {
      generationFilesystemReadIsolation: _generationFilesystemReadIsolation,
      ...legacyRelease
    } = release;
    const result = QualifiedRunnerReleaseV4Schema.safeParse({
      ...legacyRelease,
      schemaVersion: "4",
      verifierVersion: "counterlab-release-v4",
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });

export const RELEASE_CHECK_IDS = [
  "test-all",
  "leakage-mutations",
  "imbalance-mutations",
  "held-out",
  "adapter-sandbox-smoke",
  "scientific-engines",
  "web-build",
  "achieved-metrics",
  "reproduce-leakage",
  "replay-patch",
  "secret-scan",
] as const;

export const ReleaseCheckReceiptV1Schema = z
  .strictObject({
    schemaVersion: z.literal("1"),
    status: z.literal("PASSED"),
    evidenceCommit: GitCommitSchema,
    sourceCommit: GitCommitSchema,
    qualifiedRunnerReceiptSha256: Sha256Schema,
    qualifiedAt: z.iso.datetime({ offset: true }),
    runnerImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
    runnerImageDigest: OciDigestSchema,
    adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
    adapterImageDigest: OciDigestSchema,
    registryDigest: OciDigestSchema,
    runtimeToolchainSha256: Sha256Schema,
    runtimeAdapterSha256: Sha256Schema,
    checks: z
      .array(
        z.strictObject({
          id: z.enum(RELEASE_CHECK_IDS),
          status: z.literal("PASSED"),
        }),
      )
      .length(RELEASE_CHECK_IDS.length),
    checkedAt: z.iso.datetime({ offset: true }),
    verifierVersion: z.literal("counterlab-release-check-v1"),
  })
  .superRefine((receipt, context) => {
    if (
      receipt.runnerImageTag !== `counterlab-runner:git-${receipt.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["runnerImageTag"],
        message: "runner image tag must bind the checked source commit",
      });
    }
    if (
      receipt.adapterImageTag !==
      `counterlab-adapter:git-${receipt.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterImageTag"],
        message: "adapter image tag must bind the checked source commit",
      });
    }
    if (
      JSON.stringify(receipt.checks.map((check) => check.id)) !==
      JSON.stringify(RELEASE_CHECK_IDS)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checks"],
        message: "release checks must be complete, unique, and ordered",
      });
    }
    if (Date.parse(receipt.qualifiedAt) > Date.parse(receipt.checkedAt)) {
      context.addIssue({
        code: "custom",
        path: ["qualifiedAt"],
        message: "runner qualification must precede the release check",
      });
    }
  });

export const ReleaseCheckReceiptV2Schema = z
  .strictObject({
    schemaVersion: z.literal("2"),
    status: z.literal("PASSED"),
    evidenceCommit: GitCommitSchema,
    sourceCommit: GitCommitSchema,
    qualifiedRunnerReceiptSha256: Sha256Schema,
    qualifiedAt: z.iso.datetime({ offset: true }),
    runnerImageTag: z.string().regex(/^counterlab-runner:git-[a-f0-9]{40}$/),
    runnerImageDigest: OciDigestSchema,
    adapterImageTag: z.string().regex(/^counterlab-adapter:git-[a-f0-9]{40}$/),
    adapterImageDigest: OciDigestSchema,
    registryDigest: OciDigestSchema,
    runtimeToolchainSha256: Sha256Schema,
    runtimePolicySha256: Sha256Schema,
    proofDependencyManifestSha256: Sha256Schema,
    aggregateLimitEvidenceSha256: Sha256Schema,
    runtimeAdapterSha256: Sha256Schema,
    checks: z
      .array(
        z.strictObject({
          id: z.enum(RELEASE_CHECK_IDS),
          status: z.literal("PASSED"),
        }),
      )
      .length(RELEASE_CHECK_IDS.length),
    checkedAt: z.iso.datetime({ offset: true }),
    verifierVersion: z.literal("counterlab-release-check-v2"),
  })
  .superRefine((receipt, context) => {
    if (
      receipt.runnerImageTag !== `counterlab-runner:git-${receipt.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["runnerImageTag"],
        message: "runner image tag must bind the checked source commit",
      });
    }
    if (
      receipt.adapterImageTag !==
      `counterlab-adapter:git-${receipt.sourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["adapterImageTag"],
        message: "adapter image tag must bind the checked source commit",
      });
    }
    if (
      JSON.stringify(receipt.checks.map((check) => check.id)) !==
      JSON.stringify(RELEASE_CHECK_IDS)
    ) {
      context.addIssue({
        code: "custom",
        path: ["checks"],
        message: "release checks must be complete, unique, and ordered",
      });
    }
    if (Date.parse(receipt.qualifiedAt) > Date.parse(receipt.checkedAt)) {
      context.addIssue({
        code: "custom",
        path: ["qualifiedAt"],
        message: "runner qualification must precede the release check",
      });
    }
  });

export const ReleaseCheckReceiptSchema = z
  .strictObject({
    ...ReleaseCheckReceiptV2Schema.shape,
    schemaVersion: z.literal("3"),
    generationFilesystemReadIsolation: z.literal("OS_ENFORCED"),
    verifierVersion: z.literal("counterlab-release-check-v3"),
  })
  .superRefine((receipt, context) => {
    const {
      generationFilesystemReadIsolation: _generationFilesystemReadIsolation,
      ...legacyReceipt
    } = receipt;
    const result = ReleaseCheckReceiptV2Schema.safeParse({
      ...legacyReceipt,
      schemaVersion: "2",
      verifierVersion: "counterlab-release-check-v2",
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });

export const DeploymentReceiptV3Schema = z
  .strictObject({
    schemaVersion: z.literal("3"),
    status: z.literal("DEPLOYED"),
    workerName: z.literal("counterlab"),
    productionOrigin: z.literal("https://counterlab.cserules.workers.dev"),
    generationFilesystemReadIsolation: z.literal("PARTIAL"),
    workerEvidenceCommit: GitCommitSchema,
    runnerSourceCommit: GitCommitSchema,
    qualifiedRunnerReceiptSha256: Sha256Schema,
    releaseCheckReceiptSha256: Sha256Schema,
    releaseCheckCheckedAt: z.iso.datetime({ offset: true }),
    runtimeToolchainSha256: Sha256Schema,
    runtimeAdapterSha256: Sha256Schema,
    adapterImageDigest: OciDigestSchema,
    workerVersionId: z
      .string()
      .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
    workerTag: z.string().regex(/^git-[a-f0-9]{40}$/),
    workerMessage: z.string().min(1).max(256),
    containerApplicationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    containerApplicationVersion: z.string().regex(/^[1-9][0-9]*$/),
    containerImage: z
      .string()
      .regex(
        /^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner@sha256:[a-f0-9]{64}$/,
      ),
    containerState: z.enum(["active", "ready"]),
    containerImageDigest: OciDigestSchema,
    deployConfigSha256: Sha256Schema,
    workerBundleSha256: Sha256Schema,
    clientAssetsSha256: Sha256Schema,
    clientAssetCount: z.number().int().positive(),
    dryRunSha256: Sha256Schema,
    dryRunFileCount: z.number().int().positive(),
    deploymentStatusSha256: Sha256Schema,
    workerVersionSha256: Sha256Schema,
    containerStatusSha256: Sha256Schema,
    deployedAt: z.iso.datetime({ offset: true }),
    verifierVersion: z.literal("counterlab-deployment-v3"),
  })
  .superRefine((receipt, context) => {
    if (receipt.workerTag !== `git-${receipt.workerEvidenceCommit}`) {
      context.addIssue({
        code: "custom",
        path: ["workerTag"],
        message: "Worker tag must bind the deployed evidence commit",
      });
    }
    if (
      receipt.workerMessage !==
      `CounterLab Worker ${receipt.workerEvidenceCommit}; runner ${receipt.runnerSourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["workerMessage"],
        message: "Worker message must bind both release commits",
      });
    }
    if (
      receipt.containerImage !==
      `registry.cloudflare.com/${receipt.containerImage.split("/")[1]}/counterlab-runner@${receipt.containerImageDigest}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["containerImage"],
        message: "Container image must bind the exact qualified digest",
      });
    }
    if (
      Date.parse(receipt.releaseCheckCheckedAt) > Date.parse(receipt.deployedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["releaseCheckCheckedAt"],
        message: "release checks must precede deployment",
      });
    }
    if (
      receipt.dryRunSha256 !== receipt.workerBundleSha256 ||
      receipt.dryRunFileCount !== 1
    ) {
      context.addIssue({
        code: "custom",
        path: ["dryRunSha256"],
        message: "dry-run authority must be the one exact frozen Worker bundle",
      });
    }
  });

export const DeploymentReceiptV4Schema = z
  .strictObject({
    schemaVersion: z.literal("4"),
    status: z.literal("DEPLOYED"),
    workerName: z.literal("counterlab"),
    productionOrigin: z.literal("https://counterlab.cserules.workers.dev"),
    generationFilesystemReadIsolation: z.literal("PARTIAL"),
    workerEvidenceCommit: GitCommitSchema,
    runnerSourceCommit: GitCommitSchema,
    qualifiedRunnerReceiptSha256: Sha256Schema,
    releaseCheckReceiptSha256: Sha256Schema,
    releaseCheckCheckedAt: z.iso.datetime({ offset: true }),
    timeoutCleanupReceiptSha256: Sha256Schema,
    aggregateLimitEvidenceSha256: Sha256Schema,
    runtimeToolchainSha256: Sha256Schema,
    runtimePolicySha256: Sha256Schema,
    proofDependencyManifestSha256: Sha256Schema,
    runtimeAdapterSha256: Sha256Schema,
    adapterImageDigest: OciDigestSchema,
    workerVersionId: z
      .string()
      .regex(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/),
    workerTag: z.string().regex(/^git-[a-f0-9]{40}$/),
    workerMessage: z.string().min(1).max(256),
    containerApplicationId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
    containerApplicationVersion: z.string().regex(/^[1-9][0-9]*$/),
    containerImage: z
      .string()
      .regex(
        /^registry\.cloudflare\.com\/[A-Za-z0-9_-]{3,64}\/counterlab-runner@sha256:[a-f0-9]{64}$/,
      ),
    containerState: z.enum(["active", "ready"]),
    containerImageDigest: OciDigestSchema,
    workerArtifactClassification: z.literal("PROCESS_BOUND_PARTIAL"),
    workerArtifactManifestSha256: Sha256Schema,
    deployConfigSha256: Sha256Schema,
    workerBundleSha256: Sha256Schema,
    clientAssetsSha256: Sha256Schema,
    clientAssetCount: z.number().int().positive(),
    clientPublicAssetsSha256: Sha256Schema,
    clientPublicAssetCount: z.number().int().positive(),
    viteVersion: z.literal("8.1.4"),
    wranglerVersion: z.literal("4.110.0"),
    dryRunSha256: Sha256Schema,
    dryRunFileCount: z.literal(1),
    deploymentStatusSha256: Sha256Schema,
    workerVersionSha256: Sha256Schema,
    containerStatusSha256: Sha256Schema,
    deployedAt: z.iso.datetime({ offset: true }),
    verifierVersion: z.literal("counterlab-deployment-v4"),
  })
  .superRefine((receipt, context) => {
    if (receipt.workerTag !== `git-${receipt.workerEvidenceCommit}`) {
      context.addIssue({
        code: "custom",
        path: ["workerTag"],
        message: "Worker tag must bind the deployed evidence commit",
      });
    }
    if (
      receipt.workerMessage !==
      `CounterLab Worker ${receipt.workerEvidenceCommit}; runner ${receipt.runnerSourceCommit}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["workerMessage"],
        message: "Worker message must bind both release commits",
      });
    }
    if (
      receipt.containerImage !==
      `registry.cloudflare.com/${receipt.containerImage.split("/")[1]}/counterlab-runner@${receipt.containerImageDigest}`
    ) {
      context.addIssue({
        code: "custom",
        path: ["containerImage"],
        message: "Container image must bind the exact qualified digest",
      });
    }
    if (
      Date.parse(receipt.releaseCheckCheckedAt) > Date.parse(receipt.deployedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["releaseCheckCheckedAt"],
        message: "release checks must precede deployment",
      });
    }
    if (receipt.dryRunSha256 !== receipt.workerBundleSha256) {
      context.addIssue({
        code: "custom",
        path: ["dryRunSha256"],
        message: "dry-run authority must equal the frozen Worker bundle",
      });
    }
    if (receipt.clientPublicAssetCount > receipt.clientAssetCount) {
      context.addIssue({
        code: "custom",
        path: ["clientPublicAssetCount"],
        message: "public client asset count exceeds the full deploy tree",
      });
    }
  });

export const DeploymentReceiptSchema = z
  .strictObject({
    ...DeploymentReceiptV4Schema.shape,
    schemaVersion: z.literal("5"),
    generationFilesystemReadIsolation: z.literal("OS_ENFORCED"),
    verifierVersion: z.literal("counterlab-deployment-v5"),
  })
  .superRefine((receipt, context) => {
    const result = DeploymentReceiptV4Schema.safeParse({
      ...receipt,
      schemaVersion: "4",
      generationFilesystemReadIsolation: "PARTIAL",
      verifierVersion: "counterlab-deployment-v4",
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        context.addIssue({
          code: "custom",
          path: issue.path,
          message: issue.message,
        });
      }
    }
  });
