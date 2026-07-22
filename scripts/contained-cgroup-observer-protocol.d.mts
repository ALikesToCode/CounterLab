export interface ContainedCgroupObserverManifest {
  schemaVersion: "2";
  status: "REQUESTED";
  qualificationMode: "aggregate-timeout-proof-v1";
  runtimeSessionId: string;
  invocationId: string;
  finalContainerId: string;
  cgroupId: string;
  cgroupParentPath: "" | "containerd";
  cgroupPath: string;
  cgroupIdentity: string;
  sanitizedSpecSha256: string;
  intendedAggregateLimits: {
    cpuCount: number;
    maxProcesses: number;
    memoryBytes: number;
  };
  baseReceiptPath: string;
  baseReceiptFileSha256: string;
  baseReceiptPayloadSha256: string;
  runtimeAttestationSha256: string;
  driverCliSha256: string;
  driverModuleSha256: string;
  requestedAt: string;
  receiptPayloadSha256: string;
}

export function validateContainedCgroupObserverManifest(
  value: unknown,
  options?: { observedAtMs?: number },
): ContainedCgroupObserverManifest;

export function createContainedCgroupObserverManifest(input: {
  baseReceiptFileSha256: string;
  baseReceiptPayloadSha256: string;
  finalContainerId: string;
  intendedAggregateLimits: ContainedCgroupObserverManifest["intendedAggregateLimits"];
  invocationId: string;
  observerBindings: {
    cgroupParentPath: "" | "containerd";
    runtimeSessionId: string;
    runtimeAttestationSha256: string;
    driverCliSha256: string;
    driverModuleSha256: string;
  };
  requestedAt?: Date;
  sanitizedSpecSha256: string;
}): ContainedCgroupObserverManifest;

export interface ContainedCgroupObserverFinalization {
  schemaVersion: "1";
  status: "FINALIZE" | "ABORT";
  reason: "AGGREGATE_TIMEOUT_CONFIRMED" | "QUALIFICATION_ABORTED";
  abortCode:
    | "CLEANUP_UNVERIFIED"
    | "OBSERVER_FAILED"
    | "RESULT_RELEASED"
    | "RUNTIME_FAILED"
    | "TIMEOUT_NOT_OBSERVED"
    | null;
  cleanup: {
    taskAbsent: boolean;
    containerAbsent: boolean;
    snapshotAbsent: boolean;
    invocationAliasAbsent: boolean;
    imageRootfsAbsent: boolean;
    persistedAuthorityVerified: boolean;
    readOnlyMountsUnchanged: boolean;
    imageRootfsUnchanged: boolean;
  };
  manifestPayloadSha256: string;
  observerDraftPayloadSha256: string | null;
  invocationId: string;
  finalContainerId: string;
  timeoutObserved: boolean;
  resultReleased: boolean;
  cleanupVerified: boolean;
  decisionAt: string;
  receiptPayloadSha256: string;
}

export function validateContainedCgroupObserverFinalization(
  value: unknown,
  manifest: ContainedCgroupObserverManifest,
  options?: { observedAtMs?: number },
): ContainedCgroupObserverFinalization;

export function createContainedCgroupObserverFinalization(
  manifest: ContainedCgroupObserverManifest,
  input: {
    cleanup: ContainedCgroupObserverFinalization["cleanup"];
    cleanupVerified: boolean;
    decisionAt?: Date;
    resultReleased: boolean;
    timeoutObserved: boolean;
  } & (
    | {
        abortCode?: null;
        observerDraftPayloadSha256: string;
        status: "FINALIZE";
      }
    | {
        abortCode: Exclude<
          ContainedCgroupObserverFinalization["abortCode"],
          null
        >;
        observerDraftPayloadSha256: string | null;
        status: "ABORT";
      }
  ),
): ContainedCgroupObserverFinalization;

export function containedCgroupQualificationPaths(input: {
  repositoryRoot: string;
  runtimeSessionId: string;
  invocationId: string;
}): Readonly<{
  evidencePath: string;
  failurePath: string;
  finalizationPath: string;
  invocationRoot: string;
  manifestPath: string;
  observerDraftPath: string;
  observerReadyPath: string;
  qualificationRoot: string;
  sessionRoot: string;
}>;
