export type ContainedCgroupControl =
  | { mode: "memory"; requestedBytes: number }
  | { mode: "processes"; attemptedProcesses: number }
  | { mode: "cpu"; busyWindowMs: number; workers: number };

export function parseContainedCgroupControl(
  args: string[],
): ContainedCgroupControl;
