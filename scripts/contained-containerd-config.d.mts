export const CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH: number;

export function renderContainedContainerdConfig(
  shimSocketDirectory: string,
): string;

export function createContainedContainerdConfig(options: {
  configPath: string;
  repositoryRoot: string;
  shimSocketRoot: string;
}): {
  shimSocketDirectory: string;
  shimSocketRoot: string;
};

export function probeContainedShimSocketDirectory(binding: {
  shimSocketDirectory: string;
  shimSocketRoot: string;
}): Promise<void>;
