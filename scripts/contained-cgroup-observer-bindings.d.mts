export interface ContainedCgroupObserverBindings {
  driverCliSha256: string;
  driverModuleSha256: string;
  runtimeAttestationSha256: string;
  runtimeSessionId: string;
}

export function resolveContainedCgroupObserverBindings(input: {
  sessionRoot: string;
}): Readonly<ContainedCgroupObserverBindings>;
