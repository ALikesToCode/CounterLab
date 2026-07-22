export const UNQUALIFIED_AGGREGATE_LIMIT_MODE: "process-address-space-rlimit-with-unenforced-cgroup-intent";

export function createQualifiedContainedRootlessReceipt<
  TReceipt extends Record<string, unknown>,
  TEvidence,
>(input: {
  aggregateLimitEvidence: TEvidence;
  baseReceipt: TReceipt;
  observerBindings: {
    cgroupParentPath: "" | "containerd";
    runtimeAttestationSha256: string;
    runtimeSessionId: string;
    driverCliSha256: string;
    driverModuleSha256: string;
  };
}): Omit<
  TReceipt,
  | "limitMode"
  | "aggregateLimitIntentEnforced"
  | "aggregateLimitEvidence"
  | "receiptPayloadSha256"
> & {
  limitMode: "container-cgroup-and-process-rlimit";
  aggregateLimitIntentEnforced: true;
  aggregateLimitEvidence: TEvidence;
  receiptPayloadSha256: string;
};
