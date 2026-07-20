export interface RuntimeProofDependencyManifest {
  schemaVersion: "1";
  files: Array<{ path: string; sha256: string }>;
}

export declare const RUNTIME_POLICY_PATH: string;
export declare const RUNTIME_HELPER_PATHS: Readonly<Record<string, string>>;

export declare function canonicalRuntimeJson(value: unknown): string;
export declare function sha256RuntimeBytes(value: string | Buffer): string;
export declare function requireContainedRuntimeSessionId(
  value: unknown,
): string;
export declare function containedRuntimeAdapterArguments(
  sessionId: string,
  args: string[],
): string[];
export declare function createPublicContainedRuntimeAttestation(input: {
  attestation: {
    sessionId: string;
    namespace: string;
    runtimeToolchainSha256: string;
    toolchainLockSha256: string;
    adapterSha256: string;
    runtimePolicySha256: string;
    proofDependencyManifestSha256: string;
    fileSha256: {
      containerdConfig: string;
      buildkitConfig: string;
      supervisorReady?: string;
    };
    paths: {
      containerdRootlesskitApiSocket: string;
      containerdSocket: string;
      runtimeCommandSocket: string;
      buildkitSocket: string;
    };
  };
  componentSha256: Record<string, string>;
}): Record<string, unknown>;
export declare function createRuntimeProofDependencyManifest(root: string): {
  manifest: RuntimeProofDependencyManifest;
  manifestSha256: string;
  runtimePolicySha256: string;
};
export declare function createRuntimeToolchainFingerprint(input: {
  root: string;
  adapterPath: string;
  containerdConfigPath: string;
  buildkitConfigPath: string;
}): {
  adapterSha256: string;
  fileSha256: { containerdConfig: string; buildkitConfig: string };
  helperSha256: Record<string, string>;
  lock: { components: Record<string, { sha256: string; version: string }> };
  proofDependencyManifest: RuntimeProofDependencyManifest;
  proofDependencyManifestSha256: string;
  runtimePolicySha256: string;
  runtimeToolchainSha256: string;
  toolchainLockSha256: string;
};
