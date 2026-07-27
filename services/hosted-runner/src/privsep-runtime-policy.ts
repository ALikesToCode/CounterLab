import { chmod, chown, lstat, mkdir } from "node:fs/promises";

import { PRIVSEP_GENERATOR_GID } from "./privsep-protocol.js";

export const PRIVSEP_STATE_ROOT = "/run/counterlab-codex";
const PRIVSEP_SCRATCH_ROOT = "/tmp";

type PrivsepPathMetadata = {
  uid: number;
  gid: number;
  mode: number;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

export type PrivsepScratchPolicyOperations = {
  readMetadata(path: string): Promise<PrivsepPathMetadata>;
  changeOwner(path: string, uid: number, gid: number): Promise<void>;
  changeMode(path: string, mode: number): Promise<void>;
};

export type PrivsepStateRootPolicyOperations =
  PrivsepScratchPolicyOperations & {
    createDirectory(path: string, mode: number): Promise<void>;
  };

const privsepScratchPolicyOperations: PrivsepScratchPolicyOperations = {
  readMetadata: lstat,
  changeOwner: chown,
  changeMode: chmod,
};

const privsepStateRootPolicyOperations: PrivsepStateRootPolicyOperations = {
  ...privsepScratchPolicyOperations,
  async createDirectory(path, mode) {
    await mkdir(path, { recursive: true, mode });
  },
};

function hasPrivsepScratchPolicy(metadata: PrivsepPathMetadata): boolean {
  return (
    metadata.isDirectory() &&
    !metadata.isSymbolicLink() &&
    metadata.uid === 0 &&
    metadata.gid === 0 &&
    (metadata.mode & 0o7777) === 0o555
  );
}

function hasPrivsepStateRootPolicy(metadata: PrivsepPathMetadata): boolean {
  return (
    metadata.isDirectory() &&
    !metadata.isSymbolicLink() &&
    metadata.uid === 0 &&
    metadata.gid === PRIVSEP_GENERATOR_GID &&
    (metadata.mode & 0o7777) === 0o710
  );
}

export async function enforcePrivsepScratchPolicy(
  operations: PrivsepScratchPolicyOperations = privsepScratchPolicyOperations,
): Promise<void> {
  const before = await operations.readMetadata(PRIVSEP_SCRATCH_ROOT);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error(
      "CounterLab privilege broker scratch root must be a direct directory",
    );
  }
  if (hasPrivsepScratchPolicy(before)) return;

  await operations.changeOwner(PRIVSEP_SCRATCH_ROOT, 0, 0);
  await operations.changeMode(PRIVSEP_SCRATCH_ROOT, 0o555);

  const after = await operations.readMetadata(PRIVSEP_SCRATCH_ROOT);
  if (!hasPrivsepScratchPolicy(after)) {
    throw new Error(
      "CounterLab privilege broker scratch policy did not reach root:root 0555",
    );
  }
}

export async function enforcePrivsepStateRootPolicy(
  operations: PrivsepStateRootPolicyOperations = privsepStateRootPolicyOperations,
): Promise<void> {
  await operations.createDirectory(PRIVSEP_STATE_ROOT, 0o710);
  const before = await operations.readMetadata(PRIVSEP_STATE_ROOT);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error(
      "CounterLab privilege broker state root must be a direct directory",
    );
  }
  if (hasPrivsepStateRootPolicy(before)) return;

  await operations.changeOwner(PRIVSEP_STATE_ROOT, 0, PRIVSEP_GENERATOR_GID);
  await operations.changeMode(PRIVSEP_STATE_ROOT, 0o710);

  const after = await operations.readMetadata(PRIVSEP_STATE_ROOT);
  if (!hasPrivsepStateRootPolicy(after)) {
    throw new Error(
      "CounterLab privilege broker state root policy did not reach root:counterlab-generator 0710",
    );
  }
}
