export const CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH: number;
export const CONTAINED_RUNTIME_SNAPSHOTTER: "fuse-overlayfs";

export function renderContainedContainerdConfig(
  shimSocketDirectory: string,
  snapshotterSocket: string,
): string;

export function createContainedContainerdConfig(options: {
  configPath: string;
  repositoryRoot: string;
  shimSocketRoot: string;
  snapshotterSocket: string;
}): {
  shimSocketDirectory: string;
  shimSocketRoot: string;
  snapshotterSocket: string;
};

export function probeContainedShimSocketDirectory(binding: {
  shimSocketDirectory: string;
  shimSocketRoot: string;
}): Promise<void>;
