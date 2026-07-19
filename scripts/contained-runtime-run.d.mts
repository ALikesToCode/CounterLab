export interface ContainedRuntimeCommand {
  program: string;
  args: string[];
}

export interface ContainedRuntimeRunPlan {
  containerName: string;
  create: ContainedRuntimeCommand;
  start: ContainedRuntimeCommand;
  cleanup: ContainedRuntimeCommand;
}

export interface ContainedRuntimeRunPlanInput {
  binRoot: string;
  containerdSocket: string;
  clientFifoRoot: string;
  installRoot: string;
  sessionRoot: string;
  args: string[];
}

export interface ContainedRuntimeRunContext extends ContainedRuntimeRunPlanInput {
  cwd: string;
  environment: NodeJS.ProcessEnv;
  stdin: Buffer;
}

export interface ContainedRuntimeSpawnResult {
  status: number | null;
  stdout: Buffer;
  stderr: Buffer;
  error?: Error;
}

export type ContainedRuntimeSpawn = (
  program: string,
  args: string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    encoding: null;
    stdio: string[];
    timeout: number;
    maxBuffer: number;
    input: Buffer;
  },
) => ContainedRuntimeSpawnResult;

export declare function containedRunPlan(
  input: ContainedRuntimeRunPlanInput,
): ContainedRuntimeRunPlan;

export declare function executeContainedRun(
  context: ContainedRuntimeRunContext,
  spawn?: ContainedRuntimeSpawn,
): {
  status: number;
  stdout: Buffer;
  stderr: Buffer;
};
