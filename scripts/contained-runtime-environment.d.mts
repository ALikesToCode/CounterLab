export interface ContainedRuntimeEnvironmentInput {
  auth: string;
  binRoot: string;
  buildkitSocket: string;
  home: string;
  runcBinary: string;
  runcStateRoot: string;
  runtimeWrapperRoot: string;
  tmp: string;
  xdgCache: string;
  xdgConfig: string;
  xdgData: string;
  xdgRuntime: string;
}

export declare function createContainedRuntimeEnvironment(
  input: ContainedRuntimeEnvironmentInput,
): NodeJS.ProcessEnv;
