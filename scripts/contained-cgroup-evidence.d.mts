export const QUALIFIED_AGGREGATE_LIMIT_MODE: "container-cgroup-and-process-rlimit";

export function canonicalCgroupJson(value: unknown): string;
export function sha256CgroupBytes(value: Buffer | string): string;
export function createContainedCgroupIdentity(input: {
  invocationId: string;
  finalContainerId: string;
  sanitizedSpecSha256: string;
}): string;
export function createContainedCgroupPath(
  invocationId: string,
  cgroupParentPath: "" | "containerd",
): string;
export function validateContainedCgroupEvidence<T>(
  value: T,
  expected: {
    cgroupParentPath: "" | "containerd";
    invocationId: string;
    finalContainerId: string;
    sanitizedSpecSha256: string;
    intendedAggregateLimits: {
      cpuCount: number;
      maxProcesses: number;
      memoryBytes: number;
    };
    runtimeAttestationSha256: string;
    runtimeSessionId: string;
    driverCliSha256: string;
    driverModuleSha256: string;
  },
): T;
