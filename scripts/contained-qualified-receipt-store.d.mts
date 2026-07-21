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

interface QualifiedReceiptObservationArtifacts {
  evidence: Record<string, unknown>;
  evidenceFileSha256: string;
  evidencePath: string;
  finalizationFileSha256: string;
  finalizationPath: string;
  finalizationPayloadSha256: string;
  manifestFileSha256: string;
  manifestPath: string;
  observerDraftFileSha256: string;
  observerDraftPath: string;
  observerReadyFileSha256: string;
  observerReadyPath: string;
}

export function persistQualifiedContainedRootlessReceipt(
  input: QualifiedRootlessReceiptStoreBinding,
  dependencies?: QualifiedReceiptStoreDependencies,
): {
  qualifiedReceipt: Record<string, unknown>;
  qualifiedReceiptFileSha256: string;
  qualifiedReceiptPath: string;
  qualifiedReceiptPayloadSha256: string;
  qualificationArtifacts: QualifiedReceiptObservationArtifacts;
};

export function verifyQualifiedContainedRootlessReceipt(
  input: QualifiedRootlessReceiptStoreBinding & {
    qualifiedReceiptFileSha256: string;
    qualifiedReceiptPath: string;
  },
  dependencies?: QualifiedReceiptStoreDependencies,
): Record<string, unknown>;
