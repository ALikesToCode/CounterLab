export interface ContainedRlimit {
  type: string;
  soft: number;
  hard: number;
}

export interface ContainedResourceIntent {
  cpuCount: number;
  maxProcesses: number;
  memoryBytes: number;
  rlimits: ContainedRlimit[];
}

export declare function sanitizeContainedRootlessSpec(input: {
  containerId: string;
  expected: ContainedResourceIntent & {
    containerName: string;
    imageAuthority: import("./contained-image-authority.mjs").ContainedImageAuthority;
    invocationId: string;
    sessionRoot: string;
  };
  metadataSha256: string;
  source: string;
}): {
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
};

export declare function validateContainedContainerInfo(input: {
  configFileSha256?: string;
  containerId: string;
  image: string;
  invocationId: string;
  source: string;
}): Record<string, unknown>;

export declare function validateContainedConfigContainerInfo(input: {
  baseSpecSha256: string;
  containerId: string;
  invocationId: string;
  source: string;
}): Record<string, unknown>;

export declare function persistContainedRootlessSpec(input: {
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
}): {
  configFileSha256: string;
  configPath: string;
  imageRootfsPath: string;
  receiptFileSha256: string;
  receiptPath: string;
};

export declare function verifyPersistedContainedRootlessSpec(input: {
  configFileSha256: string;
  configPath: string;
  finalContainerId: string;
  imageRootfsPath: string;
  receiptFileSha256: string;
  receiptPath: string;
  sessionRoot: string;
}): void;
