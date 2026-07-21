#!/usr/bin/env node

import { existsSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";

export const CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH = 42;
export const CONTAINED_RUNTIME_SNAPSHOTTER = "fuse-overlayfs";

function isContained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

export function renderContainedContainerdConfig(
  shimSocketDirectory,
  snapshotterSocket,
) {
  if (
    typeof shimSocketDirectory !== "string" ||
    !isAbsolute(shimSocketDirectory) ||
    resolve(shimSocketDirectory) !== shimSocketDirectory ||
    shimSocketDirectory.includes("'") ||
    shimSocketDirectory.length > CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH ||
    typeof snapshotterSocket !== "string" ||
    !isAbsolute(snapshotterSocket) ||
    resolve(snapshotterSocket) !== snapshotterSocket ||
    snapshotterSocket.includes("'")
  ) {
    throw new Error("containerd socket configuration is invalid");
  }

  return [
    "version = 4",
    "imports = []",
    "disabled_plugins = [",
    "  'io.containerd.cri.v1.images',",
    "  'io.containerd.cri.v1.runtime',",
    "  'io.containerd.grpc.v1.cri',",
    "  'io.containerd.nri.v1.nri',",
    "]",
    "",
    "[plugins.'io.containerd.shim.v1.manager']",
    "  env = []",
    `  socket_dir = '${shimSocketDirectory}'`,
    "",
    `[proxy_plugins.'${CONTAINED_RUNTIME_SNAPSHOTTER}']`,
    '  type = "snapshot"',
    `  address = '${snapshotterSocket}'`,
    "",
    "[plugins.'io.containerd.transfer.v1.local']",
    "  [[plugins.'io.containerd.transfer.v1.local'.unpack_config]]",
    '    platform = "linux/amd64"',
    `    snapshotter = "${CONTAINED_RUNTIME_SNAPSHOTTER}"`,
    "",
  ].join("\n");
}

export function createContainedContainerdConfig({
  configPath,
  repositoryRoot,
  shimSocketRoot,
  snapshotterSocket,
}) {
  const physicalRepositoryRoot = realpathSync(repositoryRoot);
  const physicalShimSocketRoot = realpathSync(shimSocketRoot);
  const physicalConfigParent = realpathSync(dirname(configPath));
  const resolvedConfigPath = resolve(
    physicalConfigParent,
    basename(configPath),
  );
  const resolvedSnapshotterSocket = resolve(snapshotterSocket);

  if (
    physicalShimSocketRoot !== physicalRepositoryRoot ||
    !isContained(physicalRepositoryRoot, resolvedConfigPath) ||
    !isContained(physicalRepositoryRoot, resolvedSnapshotterSocket)
  ) {
    throw new Error("containerd configuration escaped the repository");
  }

  const shimMetadata = statSync(physicalShimSocketRoot);
  if (
    !shimMetadata.isDirectory() ||
    shimMetadata.uid !== process.getuid() ||
    !isContained(physicalRepositoryRoot, physicalShimSocketRoot)
  ) {
    throw new Error("containerd shim socket directory is invalid");
  }

  if (physicalShimSocketRoot.length > CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH) {
    throw new Error("repository path is too long for containerd shim sockets");
  }
  writeFileSync(
    resolvedConfigPath,
    renderContainedContainerdConfig(
      physicalShimSocketRoot,
      resolvedSnapshotterSocket,
    ),
    {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    },
  );

  return {
    shimSocketDirectory: physicalShimSocketRoot,
    shimSocketRoot: physicalShimSocketRoot,
    snapshotterSocket: resolvedSnapshotterSocket,
  };
}

export async function probeContainedShimSocketDirectory(binding) {
  if (
    binding === null ||
    typeof binding !== "object" ||
    !isAbsolute(binding.shimSocketDirectory) ||
    binding.shimSocketDirectory.length >
      CONTAINERD_SHIM_SOCKET_DIR_MAX_LENGTH ||
    typeof binding.shimSocketRoot !== "string" ||
    realpathSync(binding.shimSocketDirectory) !==
      realpathSync(binding.shimSocketRoot)
  ) {
    throw new Error("containerd shim socket binding probe is invalid");
  }

  const socketName = "0".repeat(64);
  const aliasedSocket = resolve(binding.shimSocketDirectory, socketName);
  const physicalSocket = resolve(binding.shimSocketRoot, socketName);
  const server = createServer((socket) => socket.end());
  try {
    await new Promise((accept, reject) => {
      server.once("error", reject);
      server.listen(aliasedSocket, accept);
    });
    const socketMetadata = statSync(physicalSocket);
    if (
      !socketMetadata.isSocket() ||
      socketMetadata.uid !== process.getuid() ||
      (socketMetadata.mode & 0o077) !== 0
    ) {
      throw new Error(
        "containerd shim socket probe was not private and repository-contained",
      );
    }
  } finally {
    if (server.listening) {
      await new Promise((accept, reject) => {
        server.close((error) => (error ? reject(error) : accept()));
      });
    }
  }
  if (existsSync(physicalSocket)) {
    throw new Error("containerd shim socket probe did not clean up");
  }
}
