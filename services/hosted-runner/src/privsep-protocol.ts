import { isAbsolute, relative } from "node:path";

import { z } from "zod";

export const PRIVSEP_PROTOCOL_VERSION = "counterlab-privsep-v1" as const;
export const PRIVSEP_MAX_GENERATION_LAUNCHES = 3;
export const PRIVSEP_SOCKET_PATH = "/run/counterlab-privsep/broker.sock";
export const PRIVSEP_RUNNER_UID = 10_001;
export const PRIVSEP_RUNNER_GID = 10_001;
export const PRIVSEP_GENERATOR_UID = 10_002;
export const PRIVSEP_GENERATOR_GID = 10_002;
export const PRIVSEP_PROBE_FAILURES = [
  "uid",
  "gid",
  "groups",
  "capabilities",
  "no-new-privs",
  "workspace-read",
  "workspace-write",
  "credential-read",
  "credential-write-denied",
  "pid1-env-denied",
  "runner-env-denied",
  "app-read-denied",
  "repo-read-denied",
  "venv-read-denied",
  "wheelhouse-read-denied",
  "fixed-kernel-denied",
  "app-write-denied",
  "repo-write-denied",
  "tmp-write-denied",
  "probe-execution-failed",
] as const;
export const PrivsepProbeFailureSchema = z.enum(PRIVSEP_PROBE_FAILURES);
export type PrivsepProbeFailure = z.infer<typeof PrivsepProbeFailureSchema>;

export class PrivsepProbeFailureError extends Error {
  readonly probeFailure: PrivsepProbeFailure;

  constructor(probeFailure: PrivsepProbeFailure) {
    super("Privilege broker isolation probe was rejected.");
    this.name = "PrivsepProbeFailureError";
    this.probeFailure = probeFailure;
  }
}

const RequestIdSchema = z.string().uuid();
const LaunchIdSchema = z.string().uuid();
const AbsolutePathSchema = z
  .string()
  .min(2)
  .max(4_096)
  .refine(
    (value) => isAbsolute(value) && !value.includes("\0"),
    "path must be absolute",
  );

const RequestEnvelopeSchema = z.object({
  protocolVersion: z.literal(PRIVSEP_PROTOCOL_VERSION),
  requestId: RequestIdSchema,
});

export const PrivsepRequestSchema = z.discriminatedUnion("operation", [
  RequestEnvelopeSchema.extend({
    operation: z.literal("health"),
  }).strict(),
  RequestEnvelopeSchema.extend({
    operation: z.literal("probe"),
  }).strict(),
  RequestEnvelopeSchema.extend({
    operation: z.literal("prepare"),
    workspace: AbsolutePathSchema,
    appServerArgs: z.tuple([z.literal("app-server"), z.literal("--stdio")]),
  }).strict(),
  RequestEnvelopeSchema.extend({
    operation: z.literal("attach"),
    launchId: LaunchIdSchema,
  }).strict(),
  RequestEnvelopeSchema.extend({
    operation: z.literal("revoke"),
    launchId: LaunchIdSchema,
  }).strict(),
  RequestEnvelopeSchema.extend({
    operation: z.literal("dispose"),
    launchId: LaunchIdSchema,
  }).strict(),
]);

export type PrivsepRequest = z.infer<typeof PrivsepRequestSchema>;

const ResponseEnvelopeSchema = z.object({
  protocolVersion: z.literal(PRIVSEP_PROTOCOL_VERSION),
  requestId: RequestIdSchema,
});

export const PrivsepResponseSchema = z.discriminatedUnion("status", [
  ResponseEnvelopeSchema.extend({
    status: z.literal("ok"),
    operation: z.enum([
      "health",
      "probe",
      "prepare",
      "attach",
      "revoke",
      "dispose",
    ]),
    launchId: LaunchIdSchema.optional(),
    payload: z.unknown().optional(),
  }).strict(),
  ResponseEnvelopeSchema.extend({
    status: z.literal("error"),
    code: z.enum([
      "INVALID_REQUEST",
      "POLICY_REJECTED",
      "LAUNCH_NOT_FOUND",
      "LAUNCH_STATE_INVALID",
      "LAUNCH_LIMIT_REACHED",
      "BROKER_FAILURE",
    ]),
    probeFailure: PrivsepProbeFailureSchema.optional(),
  }).strict(),
]);

export type PrivsepResponse = z.infer<typeof PrivsepResponseSchema>;

export const PrivsepProbePayloadSchema = z
  .object({
    brokerUid: z.literal(0),
    brokerGid: z.literal(0),
    runnerUid: z.literal(PRIVSEP_RUNNER_UID),
    runnerGid: z.literal(PRIVSEP_RUNNER_GID),
    generatorUid: z.literal(PRIVSEP_GENERATOR_UID),
    generatorGid: z.literal(PRIVSEP_GENERATOR_GID),
    generatorSupplementaryGroupsCleared: z.literal(true),
    generatorCapabilitiesEmpty: z.literal(true),
    generatorNoNewPrivileges: z.literal(true),
    protectedPathsUnreadable: z.literal(true),
    protectedPathsUnwritable: z.literal(true),
    parentEnvironmentUnreadable: z.literal(true),
    brokerEnvironmentUnreadable: z.literal(true),
    workspaceVisible: z.literal(true),
    workspaceWritable: z.literal(true),
    outsideWorkspaceWritesDenied: z.literal(true),
    fixedKernelUnavailable: z.literal(true),
    credentialReadOnlyDuringInitialization: z.literal(true),
    credentialRevocationSupported: z.literal(true),
    boundedLaunchesEnforced: z.literal(true),
    maximumLaunches: z.literal(PRIVSEP_MAX_GENERATION_LAUNCHES),
  })
  .strict();

export type PrivsepProbePayload = z.infer<typeof PrivsepProbePayloadSchema>;

export function isPathContained(root: string, candidate: string): boolean {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot !== "" &&
    !fromRoot.startsWith("..") &&
    !isAbsolute(fromRoot) &&
    !fromRoot.includes("\0")
  );
}
