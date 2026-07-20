export interface RuntimeDrainReceipt {
  schemaVersion: "2";
  status: "DRAINED";
  sessionId: string;
  namespace: "counterlab-v6.1";
  attestationSha256: string;
  tasks: Record<string, unknown>;
  containers: Record<string, unknown>;
  snapshots: Record<string, unknown>;
  invocationAliases: Record<string, unknown>;
  runcState: Record<string, unknown>;
  clientFifos: Record<string, unknown>;
  persistedSpecs: Record<string, unknown>;
  drainedAt: string;
  receiptPayloadSha256: string;
}

export interface SupervisorReadyReceipt {
  schemaVersion: "1";
  status: "READY";
  sessionId: string;
  namespace: "counterlab-v6.1";
  supervisorPid: number;
  childPids: {
    containerdRootlesskit: number;
    buildkitRootlesskit: number;
  };
  childHandlesOwned: true;
  supervisorSocket: string;
  buildkitProxySocket: string;
  buildkitInnerSocket: string;
  createdAt: string;
  receiptPayloadSha256: string;
}

export declare function canonicalSupervisorJson(value: unknown): string;
export declare function sha256SupervisorBytes(value: string | Buffer): string;
export declare function parseSupervisorRequest(
  value: unknown,
  expectedSessionId: string,
): Record<string, unknown>;
export declare function validateRuntimeDrainReceipt(
  value: unknown,
  expected: { sessionId: string; attestationSha256: string },
): RuntimeDrainReceipt;
export declare function validateSupervisorReadyReceipt(
  value: unknown,
  expected: {
    sessionId: string;
    supervisorSocket: string;
    buildkitProxySocket: string;
    buildkitInnerSocket: string;
  },
): SupervisorReadyReceipt;
export declare function sendSupervisorRequest(input: {
  socketPath: string;
  request: unknown;
  timeoutMs: number;
}): Promise<Record<string, unknown>>;
