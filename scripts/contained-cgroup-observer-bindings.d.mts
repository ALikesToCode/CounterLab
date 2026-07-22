export interface ContainedCgroupObserverBindings {
  cgroupParentPath: "" | "containerd";
  driverCliSha256: string;
  driverModuleSha256: string;
  runtimeAttestationSha256: string;
  runtimeSessionId: string;
}

export function parseContainedCgroupParentPath(
  source: string,
): "" | "containerd";

export function resolveContainedCgroupObserverBindings(input: {
  cgroupMembershipSource?: string;
  sessionRoot: string;
}): Readonly<ContainedCgroupObserverBindings>;
