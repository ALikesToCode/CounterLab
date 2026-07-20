export interface ContainedRuntimeCommand {
  program: string;
  args: string[];
}

export interface ContainedRuntimeRunPlan {
  canonicalImage: string;
  containerName: string;
  expected: {
    containerName: string;
    cpuCount: number;
    maxProcesses: number;
    memoryBytes: number;
    rlimits: Array<{ type: string; soft: number; hard: number }>;
    sessionRoot: string;
  };
  image: string;
  imageAlias: string;
  invocationId: string;
  invocationLabel: string;
  outputDirectory?: string;
  inspectImagePresence: ContainedRuntimeCommand;
  inspectImageTarget: ContainedRuntimeCommand;
  inspectContent: ContainedRuntimeCommand;
  tagImageAlias: ContainedRuntimeCommand;
  cleanupImageAlias: ContainedRuntimeCommand;
  mountImageRootfs: ContainedRuntimeCommand;
  cleanupImageRootfs: ContainedRuntimeCommand;
  create: ContainedRuntimeCommand;
  inspectMetadata: ContainedRuntimeCommand;
  inspectSpec: ContainedRuntimeCommand;
  inspectTasks: ContainedRuntimeCommand;
  inspectContainer: ContainedRuntimeCommand;
  inspectSnapshot: ContainedRuntimeCommand;
  inspectSnapshotDiff: ContainedRuntimeCommand;
  start: ContainedRuntimeCommand;
  cleanupStaging: ContainedRuntimeCommand;
  cleanupTask: ContainedRuntimeCommand;
  cleanupContainer: ContainedRuntimeCommand;
  cleanupSnapshot: ContainedRuntimeCommand;
}

export interface ContainedRuntimeRunPlanInput {
  binRoot: string;
  containerdSocket: string;
  clientFifoRoot: string;
  installRoot: string;
  sessionRoot: string;
  args: string[];
  invocationId: string;
}

export type ContainedRuntimeRunContext = Omit<
  ContainedRuntimeRunPlanInput,
  "invocationId"
> & {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  stdin: Buffer;
};

export interface ContainedRuntimeSpawnResult {
  status: number | null;
  stdout: Buffer;
  stderr: Buffer;
  error?: Error & { code?: string };
}

export interface ContainedRunControlReceipt {
  schemaVersion: "2";
  status: "TIMED_OUT_CLEAN" | "TIMED_OUT_UNCLEAN";
  timeoutKind: "WALL_CLOCK";
  runtimePolicySha256: string;
  invocationId: string;
  finalContainerId: string;
  commandSha256: string;
  rootlessReceiptFileSha256: string;
  rootlessReceiptPayloadSha256: string;
  timeoutObserved: true;
  candidateWallSeconds: number;
  elapsedMs: number;
  cleanupReserveMs: number;
  taskAbsent: boolean;
  containerAbsent: boolean;
  snapshotAbsent: boolean;
  invocationAliasAbsent: boolean;
  imageRootfsAbsent: boolean;
  persistedAuthorityVerified: boolean;
  readOnlyMountsUnchanged: boolean;
  imageRootfsUnchanged: boolean;
  resultReleased: boolean;
  receiptPayloadSha256: string;
}

export type ContainedRuntimeSpawn = (
  program: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    encoding: null;
    stdio: string[];
    timeout: number;
    maxBuffer: number;
    input: Buffer;
  },
) => ContainedRuntimeSpawnResult;

export declare function containedRunPlan(
  input: ContainedRuntimeRunPlanInput,
): ContainedRuntimeRunPlan;

export declare function containedRuntimeResourceAbsent(
  result: ContainedRuntimeSpawnResult,
): boolean;

export declare function validateContainedImageRootfsSnapshot(
  source: Buffer | string,
  imageRootfsPath: string,
  expectedParentChainId: string,
): Record<string, unknown>;

export declare function validateContainedRunControlReceipt(
  value: unknown,
): ContainedRunControlReceipt;

export declare const CONTAINED_RUNTIME_CONTROL_BUDGET_SECONDS: 420;
export declare const CONTAINED_RUNTIME_CALLER_GRACE_SECONDS: 5;
export declare const CONTAINED_RUNTIME_POLICY_SHA256: string;

export declare function executeContainedRun(
  context: ContainedRuntimeRunContext,
  spawn?: ContainedRuntimeSpawn,
  persistSpec?: (input: {
    config: string;
    finalContainerId: string;
    internalMounts: Array<{
      containerDestination: string;
      contents: Buffer;
      contentSha256: string;
      fileName: string;
      targetPath: string;
    }>;
    receipt: Record<string, unknown>;
    sessionRoot: string;
  }) => {
    configFileSha256: string;
    configPath: string;
    imageRootfsPath: string;
    receiptFileSha256: string;
    receiptPath: string;
  },
  verifySpec?: (input: {
    configFileSha256: string;
    configPath: string;
    finalContainerId: string;
    imageRootfsPath: string;
    receiptFileSha256: string;
    receiptPath: string;
    sessionRoot: string;
  }) => void,
  createInvocationId?: () => string,
  now?: () => number,
): {
  status: number;
  stdout: Buffer;
  stderr: Buffer;
  controlReceipt?: ContainedRunControlReceipt;
};
