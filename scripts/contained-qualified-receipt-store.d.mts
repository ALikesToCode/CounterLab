export interface QualifiedRootlessReceiptStoreBinding {
  baseReceiptFileSha256: string;
  baseReceiptPath: string;
  finalContainerId: string;
  sessionRoot: string;
}

interface QualifiedReceiptStoreDependencies {
  now?: () => number;
  resolveObserverBindings?: (input: { sessionRoot: string }) => {
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
  dependencies?: QualifiedReceiptStoreDependencies,
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
  dependencies?: QualifiedReceiptStoreDependencies,
): Record<string, unknown>;
