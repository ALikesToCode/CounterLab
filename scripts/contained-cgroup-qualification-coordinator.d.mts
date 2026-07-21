import type { ContainedCgroupObserverManifest } from "./contained-cgroup-observer-protocol.mjs";

export interface ContainedCgroupQualificationHandle {
  readonly finalContainerId: string;
  readonly invocationId: string;
}

export interface ContainedCgroupQualificationInput {
  baseReceiptFileSha256: string;
  baseReceiptPath: string;
  baseReceiptPayloadSha256: string;
  finalContainerId: string;
  intendedAggregateLimits: {
    cpuCount: number;
    maxProcesses: number;
    memoryBytes: number;
  };
  invocationId: string;
  sanitizedSpecSha256: string;
  sessionRoot: string;
}

export interface ContainedCgroupQualificationOutcome {
  cleanup: {
    containerAbsent: boolean;
    imageRootfsAbsent: boolean;
    imageRootfsUnchanged: boolean;
    invocationAliasAbsent: boolean;
    persistedAuthorityVerified: boolean;
    readOnlyMountsUnchanged: boolean;
    snapshotAbsent: boolean;
    taskAbsent: boolean;
  };
  resultReleased: boolean;
  runtimeFailed: boolean;
  timeoutObserved: boolean;
}

export interface ContainedCgroupQualifiedReceipt {
  qualifiedReceipt: Record<string, unknown>;
  qualifiedReceiptFileSha256: string;
  qualifiedReceiptPath: string;
  qualifiedReceiptPayloadSha256: string;
  qualificationArtifacts: Record<string, unknown>;
}

export interface ContainedCgroupQualificationCoordinator {
  begin(
    input: ContainedCgroupQualificationInput,
  ): Promise<ContainedCgroupQualificationHandle>;
  waitForDraft(
    handle: ContainedCgroupQualificationHandle,
  ): Promise<Record<string, unknown>>;
  complete(
    handle: ContainedCgroupQualificationHandle,
    outcome: ContainedCgroupQualificationOutcome,
  ): Promise<ContainedCgroupQualifiedReceipt>;
}

interface CoordinatorDependencies {
  now?: () => Date;
  persistQualifiedReceipt?: (
    input: Pick<
      ContainedCgroupQualificationInput,
      | "baseReceiptFileSha256"
      | "baseReceiptPath"
      | "finalContainerId"
      | "sessionRoot"
    >,
  ) => ContainedCgroupQualifiedReceipt;
  resolveObserverBindings?: (input: { sessionRoot: string }) => {
    driverCliSha256: string;
    driverModuleSha256: string;
    runtimeAttestationSha256: string;
    runtimeSessionId: string;
  };
  sleep?: (milliseconds: number) => Promise<void>;
  startObserver?: (input: {
    manifest: ContainedCgroupObserverManifest;
    manifestPath: string;
    paths: {
      evidencePath: string;
      failurePath: string;
      finalizationPath: string;
      invocationRoot: string;
      manifestPath: string;
      observerDraftPath: string;
      observerReadyPath: string;
      qualificationRoot: string;
      sessionRoot: string;
    };
    runtimeSessionId: string;
  }) => {
    completion: Promise<{
      code: number | null;
      error?: Error;
      outputExceeded: boolean;
      signal: NodeJS.Signals | null;
    }>;
    isRunning(): boolean;
    pid: number;
    terminate(signal: NodeJS.Signals): boolean;
  };
  verifyQualifiedReceipt?: (input: {
    baseReceiptFileSha256: string;
    baseReceiptPath: string;
    finalContainerId: string;
    qualifiedReceiptFileSha256: string;
    qualifiedReceiptPath: string;
    sessionRoot: string;
  }) => Record<string, unknown>;
}

export function createContainedCgroupQualificationCoordinator(
  dependencies?: CoordinatorDependencies,
): ContainedCgroupQualificationCoordinator;

export const containedCgroupQualificationCoordinator: ContainedCgroupQualificationCoordinator;
