export interface CompatStopTarget {
  readonly sessionId: "rt-release721";
  readonly attestationSha256: string;
  readonly historicalBundleCommit: string;
  readonly helperManifestSha256: string;
  readonly runtimeToolchainSha256: string;
  readonly toolchainLockSha256: string;
  readonly adapterSha256: string;
  readonly runtimePolicySha256: string;
  readonly proofDependencyManifestSha256: string;
  readonly supervisorReadySha256: string;
  readonly containerdConfigSha256: string;
  readonly buildkitConfigSha256: string;
}

export interface CompatAttestation {
  sessionId: string;
  pids: {
    supervisor: number;
    containerdRootlesskit: number;
    buildkitRootlesskit: number;
  };
  runtimeToolchainSha256?: string;
  [key: string]: unknown;
}

export interface LegacyRuntimeResponse {
  exitCode: number;
  stdout: Buffer;
  stderr: Buffer;
}

export declare const COMPAT_STOP_TARGET: CompatStopTarget;

export declare function validateCompatTarget(
  sessionId: string,
  attestationSha256: string,
): void;
export declare function createLegacyRuntimeRequest(args: string[]): string;
export declare function validateLegacyRuntimeResponse(
  value: unknown,
): LegacyRuntimeResponse;
export declare function validateTargetAttestation(
  attestation: unknown,
  sessionId: string,
): Record<string, string>;
export declare function validateHistoricalBundle(
  attestation: unknown,
): Record<string, unknown>;
export declare function validateCurrentStopPrimitives(
  attestation: unknown,
): void;

export declare function executeCompatRecoveryProtocol(input: {
  attestation: CompatAttestation;
  attestationPath: string;
  attestationSha256: string;
  resolved: {
    runtimeSupervisorSocket: string;
    runtimeCommandSocket: string;
    buildkitSocket: string;
  };
  requestSupervisor: (input: {
    socketPath: string;
    timeoutMs: number;
    request: Record<string, unknown>;
  }) => Promise<Record<string, unknown>>;
  requestRuntime: (input: {
    socketPath: string;
    timeoutMs: number;
    args: string[];
  }) => Promise<LegacyRuntimeResponse>;
  waitForClosure: (paths: string[]) => Promise<boolean>;
  readAttestation: (path: string) => Buffer;
  validateDrainReceipt: (
    value: unknown,
    expected: { sessionId: string; attestationSha256: string },
  ) => unknown;
}): Promise<{
  drainReceipt: unknown;
  shutdown: Record<string, unknown>;
}>;

export declare function createHistoricalRecoveryReceipt(input: {
  attestation: CompatAttestation;
  attestationSha256: string;
  compatStopHelperSha256: string;
  drainReceipt: unknown;
  shutdown: Record<string, unknown>;
  sessionDirectoryPreserved: true;
  stoppedAt: string;
}): {
  schemaVersion: "1";
  status: "RECOVERY_STOPPED";
  purpose: "historical-runtime-recovery";
  qualificationEligible: false;
  releaseQualification: false;
  receiptPayloadSha256: string;
  [key: string]: unknown;
};
