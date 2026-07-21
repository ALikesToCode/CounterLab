export interface ContainedCgroupObserverManifest {
  schemaVersion: "1";
  status: "REQUESTED";
  qualificationMode: "aggregate-timeout-proof-v1";
  runtimeSessionId: string;
  invocationId: string;
  finalContainerId: string;
  cgroupId: string;
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
    runtimeSessionId: string;
    runtimeAttestationSha256: string;
    driverCliSha256: string;
    driverModuleSha256: string;
  };
  requestedAt?: Date;
  sanitizedSpecSha256: string;
}): ContainedCgroupObserverManifest;

export function containedCgroupQualificationPaths(input: {
  repositoryRoot: string;
  runtimeSessionId: string;
  invocationId: string;
}): Readonly<{
  evidencePath: string;
  failurePath: string;
  invocationRoot: string;
  manifestPath: string;
  observerDraftPath: string;
  observerReadyPath: string;
  qualificationRoot: string;
  sessionRoot: string;
}>;
