export interface ContainedRuntimeLinearizer {
  run<T>(task: () => T | Promise<T>): Promise<T>;
}

export function createContainedRuntimeLinearizer(): ContainedRuntimeLinearizer;
