import { createHash } from "node:crypto";
import { lstat, readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { z } from "zod";

import {
  ContainedRuntimeAttestationSchema,
  QUALIFIED_AGGREGATE_LIMIT_MODE,
  TimeoutCleanupReceiptSchema,
} from "../packages/scientific-engine-registry/src/index.js";
import { canonicalJson } from "../packages/session-core/src/index.js";
import { validateContainedRunControlReceipt } from "./contained-runtime-run.mjs";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const OciDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const PositiveSafeIntegerSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER);
const NonnegativeSafeIntegerSchema = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);

const AggregateLimitIntentSchema = z.strictObject({
  cpuCount: z.number().min(0.25).max(2),
  maxProcesses: z.number().int().min(1).max(32),
  memoryBytes: z
    .number()
    .int()
    .min(64 * 1024 * 1024)
    .max(1024 * 1024 * 1024),
});

const AggregateLimitEvidenceSchema = z
  .strictObject({
    schemaVersion: z.literal("3"),
    status: z.literal("OBSERVED"),
    authority: z.literal("linux-cgroup-v2"),
    cgroupVersion: z.literal(2),
    cgroupId: z.string().regex(/^counterlab-v6\.1-[a-f0-9]{64}$/),
    cgroupPath: z
      .string()
      .regex(/^(?:containerd\/)?counterlab-v6\.1-[a-f0-9]{64}$/),
    cgroupIdentity: Sha256Schema,
    invocationId: Sha256Schema,
    finalContainerId: Sha256Schema,
    finalizationPayloadSha256: Sha256Schema,
    sanitizedSpecSha256: Sha256Schema,
    runtimeAttestationSha256: Sha256Schema,
    observedLimits: z.strictObject({
      memoryMaxBytes: PositiveSafeIntegerSchema,
      memorySwapMaxBytes: NonnegativeSafeIntegerSchema,
      pidsMax: PositiveSafeIntegerSchema,
      cpuQuotaMicros: PositiveSafeIntegerSchema,
      cpuPeriodMicros: PositiveSafeIntegerSchema,
    }),
    membership: z.strictObject({
      leaderPid: PositiveSafeIntegerSchema,
      leaderStartTimeTicks: z.string().regex(/^[1-9][0-9]*$/),
      memberPids: z.array(PositiveSafeIntegerSchema).min(2).max(64),
      memberSetSha256: Sha256Schema,
      descendantsObserved: z.literal(true),
    }),
    negativeControls: z.strictObject({
      memory: z.strictObject({
        requestedBytes: PositiveSafeIntegerSchema,
        maxEventsBefore: NonnegativeSafeIntegerSchema,
        maxEventsAfter: PositiveSafeIntegerSchema,
        oomKillBefore: NonnegativeSafeIntegerSchema,
        oomKillAfter: NonnegativeSafeIntegerSchema,
        enforced: z.literal(true),
      }),
      processes: z.strictObject({
        attemptedProcesses: PositiveSafeIntegerSchema,
        maxEventsBefore: NonnegativeSafeIntegerSchema,
        maxEventsAfter: PositiveSafeIntegerSchema,
        enforced: z.literal(true),
      }),
      cpu: z.strictObject({
        busyWindowMs: PositiveSafeIntegerSchema,
        nrThrottledBefore: NonnegativeSafeIntegerSchema,
        nrThrottledAfter: PositiveSafeIntegerSchema,
        throttledUsecBefore: NonnegativeSafeIntegerSchema,
        throttledUsecAfter: PositiveSafeIntegerSchema,
        enforced: z.literal(true),
      }),
    }),
    cleanup: z.strictObject({
      cgroupAbsentAfterTimeout: z.literal(true),
    }),
    observer: z.strictObject({
      runtimeSessionId: z.string().regex(/^rt-[a-z0-9][a-z0-9-]{7,13}$/),
      driverCliSha256: Sha256Schema,
      driverModuleSha256: Sha256Schema,
    }),
    observedAt: z.iso.datetime({ offset: true }),
    receiptPayloadSha256: Sha256Schema,
  })
  .superRefine((evidence, context) => {
    if (
      evidence.cgroupId !== `counterlab-v6.1-${evidence.invocationId}` ||
      !new Set([
        `counterlab-v6.1-${evidence.invocationId}`,
        `containerd/counterlab-v6.1-${evidence.invocationId}`,
      ]).has(evidence.cgroupPath) ||
      evidence.cgroupIdentity !==
        sha256(
          `counterlab-cgroup-v2\0${evidence.invocationId}\0${evidence.finalContainerId}\0${evidence.sanitizedSpecSha256}`,
        )
    ) {
      context.addIssue({
        code: "custom",
        path: ["cgroupIdentity"],
        message: "aggregate cgroup identity must bind the invocation and spec",
      });
    }
    const uniqueMembers = new Set(evidence.membership.memberPids);
    if (
      uniqueMembers.size !== evidence.membership.memberPids.length ||
      !uniqueMembers.has(evidence.membership.leaderPid)
    ) {
      context.addIssue({
        code: "custom",
        path: ["membership", "memberPids"],
        message:
          "aggregate cgroup membership must be unique and include the leader",
      });
    }
    if (
      evidence.membership.memberSetSha256 !==
      sha256(
        canonicalJson(
          [...evidence.membership.memberPids].sort(
            (left, right) => left - right,
          ),
        ),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["membership", "memberSetSha256"],
        message: "aggregate cgroup member-set hash is invalid",
      });
    }
    if (
      evidence.negativeControls.memory.maxEventsAfter <=
        evidence.negativeControls.memory.maxEventsBefore ||
      evidence.negativeControls.memory.oomKillAfter !==
        evidence.negativeControls.memory.oomKillBefore ||
      evidence.negativeControls.processes.maxEventsAfter <=
        evidence.negativeControls.processes.maxEventsBefore ||
      evidence.negativeControls.cpu.nrThrottledAfter <=
        evidence.negativeControls.cpu.nrThrottledBefore ||
      evidence.negativeControls.cpu.throttledUsecAfter <=
        evidence.negativeControls.cpu.throttledUsecBefore
    ) {
      context.addIssue({
        code: "custom",
        path: ["negativeControls"],
        message: "aggregate negative-control counters are invalid",
      });
    }
    const { receiptPayloadSha256, ...payload } = evidence;
    if (sha256(canonicalJson(payload)) !== receiptPayloadSha256) {
      context.addIssue({
        code: "custom",
        path: ["receiptPayloadSha256"],
        message: "aggregate limit evidence self-hash is invalid",
      });
    }
  });

export const TIMEOUT_ROOTLESS_RLIMIT_TYPES = [
  "RLIMIT_AS",
  "RLIMIT_CPU",
  "RLIMIT_FSIZE",
  "RLIMIT_NOFILE",
] as const;

export const TIMEOUT_PROCESS_ADDRESS_SPACE_BYTES = 2 * 1024 * 1024 * 1024;

const RlimitSchema = z
  .strictObject({
    type: z.enum(TIMEOUT_ROOTLESS_RLIMIT_TYPES),
    soft: PositiveSafeIntegerSchema,
    hard: PositiveSafeIntegerSchema,
  })
  .refine((limit) => limit.soft === limit.hard, {
    message: "process rlimit soft and hard values must match",
  });

export function assertRootlessRlimitBindings(input: {
  intendedAggregateLimits: unknown;
  enforcedRlimits: unknown;
}): void {
  const intent = AggregateLimitIntentSchema.parse(
    input.intendedAggregateLimits,
  );
  const limits = z
    .array(RlimitSchema)
    .length(4)
    .refine(
      (entries) => new Set(entries.map((entry) => entry.type)).size === 4,
      { message: "all qualified process rlimits must be present once" },
    )
    .parse(input.enforcedRlimits);
  const byType = new Map(limits.map((limit) => [limit.type, limit.soft]));
  if (
    byType.get("RLIMIT_AS") !== TIMEOUT_PROCESS_ADDRESS_SPACE_BYTES ||
    byType.get("RLIMIT_NOFILE") !== 64 ||
    (byType.get("RLIMIT_CPU") ?? 0) < 1 ||
    (byType.get("RLIMIT_CPU") ?? 0) > 300 ||
    (byType.get("RLIMIT_FSIZE") ?? 0) < 1 ||
    (byType.get("RLIMIT_FSIZE") ?? 0) > 1_048_576
  ) {
    throw new Error("qualified process rlimits do not bind aggregate intent");
  }
}

const TimeoutRootlessReceiptSchema = z
  .strictObject({
    schemaVersion: z.literal("5"),
    status: z.literal("VALIDATED"),
    limitMode: z.string().min(1),
    aggregateLimitIntentEnforced: z.boolean(),
    invocationId: Sha256Schema,
    stagingContainerId: Sha256Schema,
    finalContainerId: Sha256Schema,
    metadataSha256: Sha256Schema,
    originalSpecSha256: Sha256Schema,
    baseSpecSha256: Sha256Schema,
    sanitizedSpecSha256: Sha256Schema,
    configFileSha256: Sha256Schema,
    internalMountManifest: z.array(z.unknown()),
    internalMountManifestSha256: Sha256Schema,
    readOnlyMountManifest: z.array(z.unknown()),
    readOnlyMountManifestSha256: Sha256Schema,
    commandSha256: Sha256Schema,
    imageAuthority: z.strictObject({
      canonicalImage: z.string().min(1),
      configDigest: OciDigestSchema,
      layerDigests: z.array(OciDigestSchema).min(1),
      manifestDigest: OciDigestSchema,
      rootfsChainId: OciDigestSchema,
      sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
      sourceTreeSha256: Sha256Schema,
      targetDigest: OciDigestSchema,
      targetMediaType: z.string().min(1),
    }),
    imageRootfs: z.unknown(),
    removedFields: z.array(z.string()),
    normalizedFields: z.array(z.string()),
    removedMounts: z.array(z.string()),
    intendedAggregateLimits: AggregateLimitIntentSchema,
    enforcedRlimits: z
      .array(RlimitSchema)
      .length(4)
      .refine(
        (limits) => new Set(limits.map((limit) => limit.type)).size === 4,
        { message: "all qualified process rlimits must be present once" },
      ),
    aggregateLimitEvidence: AggregateLimitEvidenceSchema.nullable(),
    receiptPayloadSha256: Sha256Schema,
  })
  .superRefine((receipt, context) => {
    const isQualified = receipt.limitMode === QUALIFIED_AGGREGATE_LIMIT_MODE;
    if (
      receipt.aggregateLimitIntentEnforced !== isQualified ||
      (receipt.aggregateLimitEvidence !== null) !== isQualified
    ) {
      context.addIssue({
        code: "custom",
        path: ["aggregateLimitEvidence"],
        message:
          "aggregate enforcement claims require observed aggregate evidence",
      });
    }
    try {
      assertRootlessRlimitBindings(receipt);
    } catch {
      context.addIssue({
        code: "custom",
        path: ["enforcedRlimits"],
        message: "qualified process rlimits do not bind aggregate intent",
      });
    }
  });

export type TimeoutProofExpected = {
  sourceCommit: string;
  sourceTreeSha256: string;
  adapterImageTag: string;
  adapterImageDigest: string;
  adapterManifestDigest: string;
  adapterOciArchiveSha256: string;
  runtimeToolchainSha256: string;
  runtimePolicySha256: string;
  proofDependencyManifestSha256: string;
};

export type TimeoutProofBinding = {
  limitMode: typeof QUALIFIED_AGGREGATE_LIMIT_MODE;
  aggregateLimitIntentEnforced: true;
  aggregateLimitEvidenceSha256: string;
  timeoutCleanupReceipt: string;
  timeoutCleanupReceiptSha256: string;
  timeoutCleanupPayloadSha256: string;
  timeoutRunControlReceiptSha256: string;
  timeoutRootlessReceiptSha256: string;
  timeoutRuntimeSessionId: string;
  timeoutRuntimeAttestationSha256: string;
  timeoutVerifiedAt: string;
};

export { QUALIFIED_AGGREGATE_LIMIT_MODE };

type AggregateLimitInput = {
  limitMode: string;
  aggregateLimitIntentEnforced: boolean;
  invocationId: string;
  finalContainerId: string;
  intendedAggregateLimits: z.infer<typeof AggregateLimitIntentSchema>;
  aggregateLimitEvidence: z.infer<typeof AggregateLimitEvidenceSchema> | null;
};

export function assertQualifiedAggregateRuntimeLimits(
  input: AggregateLimitInput,
): asserts input is AggregateLimitInput & {
  limitMode: typeof QUALIFIED_AGGREGATE_LIMIT_MODE;
  aggregateLimitIntentEnforced: true;
  aggregateLimitEvidence: z.infer<typeof AggregateLimitEvidenceSchema>;
} {
  if (input.aggregateLimitIntentEnforced !== true) {
    throw new Error("aggregate runtime limits were not enforced");
  }
  if (input.limitMode !== QUALIFIED_AGGREGATE_LIMIT_MODE) {
    throw new Error("runtime limit mode is not qualified");
  }
  const evidence = AggregateLimitEvidenceSchema.parse(
    input.aggregateLimitEvidence,
  );
  const intent = AggregateLimitIntentSchema.parse(
    input.intendedAggregateLimits,
  );
  if (
    evidence.invocationId !== input.invocationId ||
    evidence.finalContainerId !== input.finalContainerId ||
    evidence.observedLimits.memoryMaxBytes !== intent.memoryBytes ||
    ![0, intent.memoryBytes].includes(
      evidence.observedLimits.memorySwapMaxBytes,
    ) ||
    evidence.observedLimits.pidsMax !== intent.maxProcesses ||
    evidence.observedLimits.cpuQuotaMicros /
      evidence.observedLimits.cpuPeriodMicros !==
      intent.cpuCount ||
    evidence.negativeControls.memory.requestedBytes <= intent.memoryBytes ||
    evidence.negativeControls.processes.attemptedProcesses <=
      intent.maxProcesses ||
    !Number.isFinite(Date.parse(evidence.observedAt))
  ) {
    throw new Error(
      "aggregate runtime evidence does not bind the requested limits",
    );
  }
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function isRepositoryPath(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

async function repositoryFile(
  root: string,
  requested: string,
  label: string,
): Promise<string> {
  const candidate = resolve(root, requested);
  if (!isRepositoryPath(root, candidate) || candidate === root) {
    throw new Error(`${label} escapes the repository`);
  }
  let current = root;
  for (const component of relative(root, candidate).split(sep)) {
    current = resolve(current, component);
    const metadata = await lstat(current);
    if (metadata.isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link`);
    }
  }
  const physical = await realpath(candidate);
  if (!isRepositoryPath(root, physical) || !(await stat(physical)).isFile()) {
    throw new Error(`${label} is not a contained file`);
  }
  return physical;
}

export async function validateTimeoutCleanupProof(input: {
  root: string;
  receiptPath: string;
  expected: TimeoutProofExpected;
  runtimeAttestation: unknown;
  expectedBuildReceiptPath?: string;
  expectedBuildReceiptBytes?: Buffer;
  observedAt?: Date;
}): Promise<TimeoutProofBinding> {
  const root = await realpath(input.root);
  const receiptPath = await repositoryFile(
    root,
    input.receiptPath,
    "timeout cleanup receipt",
  );
  const receiptBytes = await readFile(receiptPath);
  const receipt = TimeoutCleanupReceiptSchema.parse(
    JSON.parse(receiptBytes.toString("utf8")) as unknown,
  );
  const { receiptPayloadSha256, ...receiptPayload } = receipt;
  if (sha256(canonicalJson(receiptPayload)) !== receiptPayloadSha256) {
    throw new Error("timeout cleanup receipt self-hash is invalid");
  }

  const buildReceiptPath = await repositoryFile(
    root,
    receipt.buildReceipt,
    "timeout cleanup build receipt",
  );
  const buildReceiptBytes = await readFile(buildReceiptPath);
  if (sha256(buildReceiptBytes) !== receipt.buildReceiptSha256) {
    throw new Error("timeout cleanup build receipt bytes changed");
  }
  if (input.expectedBuildReceiptPath !== undefined) {
    const expectedPath = await repositoryFile(
      root,
      input.expectedBuildReceiptPath,
      "expected build receipt",
    );
    if (expectedPath !== buildReceiptPath) {
      throw new Error("timeout cleanup proof names a different build receipt");
    }
  }
  if (
    input.expectedBuildReceiptBytes !== undefined &&
    sha256(input.expectedBuildReceiptBytes) !== receipt.buildReceiptSha256
  ) {
    throw new Error("timeout cleanup proof has a different build receipt hash");
  }

  const comparisons: Array<[string, string, string]> = [
    ["source commit", receipt.sourceCommit, input.expected.sourceCommit],
    ["source tree", receipt.sourceTreeSha256, input.expected.sourceTreeSha256],
    [
      "adapter image tag",
      receipt.adapterImageTag,
      input.expected.adapterImageTag,
    ],
    [
      "adapter image digest",
      receipt.adapterImageDigest,
      input.expected.adapterImageDigest,
    ],
    [
      "adapter manifest digest",
      receipt.adapterManifestDigest,
      input.expected.adapterManifestDigest,
    ],
    [
      "adapter OCI archive",
      receipt.adapterOciArchiveSha256,
      input.expected.adapterOciArchiveSha256,
    ],
    [
      "runtime toolchain",
      receipt.runtimeToolchainSha256,
      input.expected.runtimeToolchainSha256,
    ],
    [
      "runtime policy",
      receipt.runtimePolicySha256,
      input.expected.runtimePolicySha256,
    ],
    [
      "proof dependency manifest",
      receipt.proofDependencyManifestSha256,
      input.expected.proofDependencyManifestSha256,
    ],
  ];
  for (const [label, observed, expected] of comparisons) {
    if (observed !== expected) {
      throw new Error(`timeout cleanup ${label} is not source-bound`);
    }
  }

  const runtime = ContainedRuntimeAttestationSchema.parse(
    input.runtimeAttestation,
  );
  const liveAttestationHash = sha256(canonicalJson(runtime));
  if (
    receipt.runtimeSessionId !== runtime.sessionId ||
    receipt.runtimeToolchainSha256 !== runtime.runtimeToolchainSha256 ||
    receipt.runtimePolicySha256 !== runtime.runtimePolicySha256 ||
    receipt.proofDependencyManifestSha256 !==
      runtime.proofDependencyManifestSha256 ||
    receipt.runtimeAttestationSha256Before !== liveAttestationHash ||
    receipt.runtimeAttestationSha256After !== liveAttestationHash
  ) {
    throw new Error("timeout cleanup proof does not bind the live runtime");
  }

  const [driverCli, driverModule] = await Promise.all([
    repositoryFile(
      root,
      "scripts/verify-contained-runtime-timeout.py",
      "timeout proof CLI",
    ),
    repositoryFile(
      root,
      "services/runner/src/counterlab_runner/timeout_proof.py",
      "timeout proof module",
    ),
  ]);
  if (
    receipt.driverCliSha256 !== sha256(await readFile(driverCli)) ||
    receipt.driverModuleSha256 !== sha256(await readFile(driverModule))
  ) {
    throw new Error("timeout cleanup proof driver changed after verification");
  }

  const [controlPath, rootlessPath] = await Promise.all([
    repositoryFile(root, receipt.runControlReceipt, "timeout control receipt"),
    repositoryFile(root, receipt.rootlessReceipt, "timeout rootless receipt"),
  ]);
  const [controlBytes, rootlessBytes] = await Promise.all([
    readFile(controlPath),
    readFile(rootlessPath),
  ]);
  if (
    sha256(controlBytes) !== receipt.runControlReceiptSha256 ||
    sha256(rootlessBytes) !== receipt.rootlessReceiptSha256
  ) {
    throw new Error("timeout cleanup subordinate receipt bytes changed");
  }

  const control = validateContainedRunControlReceipt(
    JSON.parse(controlBytes.toString("utf8")) as unknown,
  );
  if (
    control.status !== "TIMED_OUT_CLEAN" ||
    control.invocationId !== receipt.invocationId ||
    control.finalContainerId !== receipt.finalContainerId ||
    control.commandSha256 !== receipt.commandSha256 ||
    control.rootlessReceiptFileSha256 !== receipt.rootlessReceiptSha256 ||
    control.resultReleased !== false
  ) {
    throw new Error("timeout cleanup control receipt is not clean and bound");
  }

  const verifiedAt = Date.parse(receipt.verifiedAt);
  const observedAt = (input.observedAt ?? new Date()).getTime();

  const rootless = TimeoutRootlessReceiptSchema.parse(
    JSON.parse(rootlessBytes.toString("utf8")) as unknown,
  );
  assertQualifiedAggregateRuntimeLimits(rootless);
  const aggregateLimitEvidenceSha256 = sha256(
    canonicalJson(rootless.aggregateLimitEvidence),
  );
  const { receiptPayloadSha256: rootlessPayloadHash, ...rootlessPayload } =
    rootless;
  if (
    sha256(canonicalJson(rootlessPayload)) !== rootlessPayloadHash ||
    rootlessPayloadHash !== control.rootlessReceiptPayloadSha256 ||
    rootless.invocationId !== receipt.invocationId ||
    rootless.finalContainerId !== receipt.finalContainerId ||
    rootless.commandSha256 !== receipt.commandSha256 ||
    rootless.imageAuthority.sourceCommit !== input.expected.sourceCommit ||
    rootless.imageAuthority.sourceTreeSha256 !==
      input.expected.sourceTreeSha256 ||
    rootless.imageAuthority.configDigest !==
      input.expected.adapterImageDigest ||
    rootless.imageAuthority.manifestDigest !==
      input.expected.adapterManifestDigest ||
    rootless.aggregateLimitEvidence.observer.runtimeSessionId !==
      receipt.runtimeSessionId ||
    rootless.aggregateLimitEvidence.observer.driverCliSha256 !==
      receipt.driverCliSha256 ||
    rootless.aggregateLimitEvidence.observer.driverModuleSha256 !==
      receipt.driverModuleSha256 ||
    rootless.aggregateLimitEvidence.sanitizedSpecSha256 !==
      rootless.sanitizedSpecSha256 ||
    rootless.aggregateLimitEvidence.runtimeAttestationSha256 !==
      liveAttestationHash ||
    Date.parse(rootless.aggregateLimitEvidence.observedAt) > verifiedAt ||
    verifiedAt - Date.parse(rootless.aggregateLimitEvidence.observedAt) >
      5 * 60_000 ||
    receipt.aggregateLimitEvidenceSha256 !== aggregateLimitEvidenceSha256
  ) {
    throw new Error("timeout cleanup rootless receipt is not source-bound");
  }

  if (
    !Number.isFinite(verifiedAt) ||
    verifiedAt > observedAt + 5 * 60_000 ||
    observedAt - verifiedAt > 24 * 60 * 60_000
  ) {
    throw new Error("timeout cleanup receipt is stale or future-dated");
  }

  return {
    limitMode: rootless.limitMode,
    aggregateLimitIntentEnforced: rootless.aggregateLimitIntentEnforced,
    aggregateLimitEvidenceSha256,
    timeoutCleanupReceipt: relative(root, receiptPath),
    timeoutCleanupReceiptSha256: sha256(receiptBytes),
    timeoutCleanupPayloadSha256: receipt.receiptPayloadSha256,
    timeoutRunControlReceiptSha256: receipt.runControlReceiptSha256,
    timeoutRootlessReceiptSha256: receipt.rootlessReceiptSha256,
    timeoutRuntimeSessionId: receipt.runtimeSessionId,
    timeoutRuntimeAttestationSha256: liveAttestationHash,
    timeoutVerifiedAt: receipt.verifiedAt,
  };
}
