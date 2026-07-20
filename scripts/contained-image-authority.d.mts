export interface ContainedImageTarget {
  canonicalImage: string;
  reportedConfigDigest?: string;
  targetDigest: string;
  targetMediaType?: string;
}

export interface ContainedImageAuthority {
  canonicalImage: string;
  commandSha256: string;
  configDigest: string;
  layerDigests: string[];
  manifestDigest: string;
  process: {
    args: string[];
    cwd: string;
    env: string[];
    gid: number;
    uid: number;
  };
  requestedMounts: Array<{
    contentManifest?: Array<
      | { mode: number; path: string; type: "directory" }
      | {
          byteLength: number;
          contentSha256: string;
          mode: number;
          path: string;
          type: "file";
        }
    >;
    contentManifestSha256?: string;
    destination: string;
    readonly: boolean;
    source: string;
  }>;
  requestedTmpfs: Array<{ destination: string; options: string[] }>;
  readOnlyMountManifest: Array<{
    contentManifestSha256: string;
    destination: string;
    repositoryRelativeSource: string;
  }>;
  readOnlyMountManifestSha256: string;
  rootfsChainId: string;
  sourceCommit: string;
  sourceTreeSha256: string;
  targetDigest: string;
  targetMediaType: string;
}

export declare function parseContainedImageTarget(input: {
  image: string;
  source: string;
}): ContainedImageTarget;

export declare function parseContainedImageManifest(input: {
  manifestDigest: string;
  source: string;
}): { configDigest: string; configSize: number; layerDigests: string[] };

export declare function selectContainedImageManifest(input: {
  source: string;
  target: ContainedImageTarget;
}): { manifestDigest: string; manifestSource?: string };

export declare function validateContainedImageAliasTarget(input: {
  alias: string;
  expectedTarget: ContainedImageTarget;
  source: string;
}): void;

export declare function verifyContainedReadOnlyMounts(
  requested: ContainedImageAuthority["requestedMounts"],
): ContainedImageAuthority["readOnlyMountManifest"];

export declare function createContainedImageAuthority(input: {
  args: string[];
  configSource: string;
  manifestDigest: string;
  manifestSource: string;
  target: ContainedImageTarget;
}): ContainedImageAuthority;
