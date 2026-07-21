export interface QualifiedRootlessReceiptStoreBinding {
  baseReceiptFileSha256: string;
  baseReceiptPath: string;
  finalContainerId: string;
  sessionRoot: string;
  observerBindings: {
    runtimeAttestationSha256: string;
    runtimeSessionId: string;
    driverCliSha256: string;
    driverModuleSha256: string;
  };
}

export function persistQualifiedContainedRootlessReceipt(
  input: {
    aggregateLimitEvidence: unknown;
  } & QualifiedRootlessReceiptStoreBinding,
): {
  qualifiedReceipt: Record<string, unknown>;
  qualifiedReceiptFileSha256: string;
  qualifiedReceiptPath: string;
  qualifiedReceiptPayloadSha256: string;
};

export function verifyQualifiedContainedRootlessReceipt(
  input: QualifiedRootlessReceiptStoreBinding & {
    qualifiedReceiptFileSha256: string;
    qualifiedReceiptPath: string;
  },
): Record<string, unknown>;
