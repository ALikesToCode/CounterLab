import { chmod, chown, lstat } from "node:fs/promises";

const PRIVSEP_SCRATCH_ROOT = "/tmp";

type PrivsepScratchMetadata = {
  uid: number;
  gid: number;
  mode: number;
  isDirectory(): boolean;
  isSymbolicLink(): boolean;
};

export type PrivsepScratchPolicyOperations = {
  readMetadata(path: string): Promise<PrivsepScratchMetadata>;
  changeOwner(path: string, uid: number, gid: number): Promise<void>;
  changeMode(path: string, mode: number): Promise<void>;
};

const privsepScratchPolicyOperations: PrivsepScratchPolicyOperations = {
  readMetadata: lstat,
  changeOwner: chown,
  changeMode: chmod,
};

export async function enforcePrivsepScratchPolicy(
  operations: PrivsepScratchPolicyOperations = privsepScratchPolicyOperations,
): Promise<void> {
  const before = await operations.readMetadata(PRIVSEP_SCRATCH_ROOT);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new Error(
      "CounterLab privilege broker scratch root must be a direct directory",
    );
  }

  await operations.changeOwner(PRIVSEP_SCRATCH_ROOT, 0, 0);
  await operations.changeMode(PRIVSEP_SCRATCH_ROOT, 0o555);

  const after = await operations.readMetadata(PRIVSEP_SCRATCH_ROOT);
  if (
    !after.isDirectory() ||
    after.isSymbolicLink() ||
    after.uid !== 0 ||
    after.gid !== 0 ||
    (after.mode & 0o7777) !== 0o555
  ) {
    throw new Error(
      "CounterLab privilege broker scratch policy did not reach root:root 0555",
    );
  }
}
