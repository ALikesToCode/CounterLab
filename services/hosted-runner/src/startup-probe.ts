import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Execute = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<unknown>;

export type HostedRunnerStartupProbeOptions = {
  environment?: NodeJS.ProcessEnv;
  nodeExecutable?: string;
  bundlePath?: string;
  appRoot?: string;
  access?: typeof access;
  mkdir?: typeof mkdir;
  stat?: typeof stat;
  getUid?: () => number | undefined;
  getGid?: () => number | undefined;
  execute?: Execute;
};

export type HostedRunnerStartupProbeResult = {
  status: "ready";
  service: "counterlab-hosted-runner";
  probe: "non-root-startup";
  checks: [
    "entrypoint",
    "non-root-user",
    "immutable-paths",
    "codex",
    "python",
    "setpriv",
    "writable-roots",
  ];
};

export async function runHostedRunnerStartupProbe(
  options: HostedRunnerStartupProbeOptions = {},
): Promise<HostedRunnerStartupProbeResult> {
  const environment = options.environment ?? process.env;
  const accessFile = options.access ?? access;
  const makeDirectory = options.mkdir ?? mkdir;
  const readMetadata = options.stat ?? stat;
  const uid = (options.getUid ?? process.getuid)?.();
  const gid = (options.getGid ?? process.getgid)?.();
  const execute =
    options.execute ??
    (async (executable, args, executionOptions) => {
      await execFileAsync(executable, args, executionOptions);
    });
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const bundlePath = options.bundlePath ?? new URL(import.meta.url).pathname;
  const appRoot = options.appRoot ?? "/app";
  const workspaceRoot = environment.COUNTERLAB_RUNNER_WORK_ROOT ?? "/work/jobs";
  const codexHomeRoot =
    environment.COUNTERLAB_CODEX_HOME_ROOT ?? "/run/counterlab-codex";
  const codexExecutable =
    environment.COUNTERLAB_CODEX_EXECUTABLE ?? "/usr/local/bin/codex";
  const setprivExecutable =
    environment.COUNTERLAB_SETPRIV_EXECUTABLE ?? "/usr/bin/setpriv";
  const pythonExecutable =
    environment.COUNTERLAB_PYTHON_EXECUTABLE ??
    "/opt/counterlab-venv/bin/python";

  if (uid !== 10001 || gid !== 10001) {
    throw new Error(
      `Hosted runner startup probe requires uid/gid 10001:10001; observed ${String(uid)}:${String(gid)}`,
    );
  }
  const [appMetadata, bundleMetadata] = await Promise.all([
    readMetadata(appRoot),
    readMetadata(bundlePath),
  ]);
  if (
    !appMetadata.isDirectory() ||
    appMetadata.uid !== 0 ||
    appMetadata.gid !== 0 ||
    (appMetadata.mode & 0o777) !== 0o555 ||
    !bundleMetadata.isFile() ||
    bundleMetadata.uid !== 0 ||
    bundleMetadata.gid !== 0 ||
    (bundleMetadata.mode & 0o777) !== 0o555
  ) {
    throw new Error(
      "Hosted runner immutable application paths do not match root:root 0555 policy",
    );
  }

  await Promise.all([
    accessFile(nodeExecutable, constants.X_OK),
    accessFile(bundlePath, constants.R_OK),
    accessFile(codexExecutable, constants.X_OK),
    accessFile(setprivExecutable, constants.X_OK),
    accessFile(pythonExecutable, constants.X_OK),
    makeDirectory(workspaceRoot, { recursive: true, mode: 0o700 }),
    makeDirectory(codexHomeRoot, { recursive: true, mode: 0o700 }),
  ]);

  const childEnvironment: NodeJS.ProcessEnv = {
    HOME: codexHomeRoot,
    CODEX_HOME: codexHomeRoot,
    TMPDIR: codexHomeRoot,
    PATH:
      environment.PATH ??
      "/opt/counterlab-venv/bin:/usr/local/bin:/usr/bin:/bin",
    NODE_ENV: "production",
    PYTHONDONTWRITEBYTECODE: "1",
    BLIS_NUM_THREADS: "1",
    MKL_NUM_THREADS: "1",
    NUMEXPR_NUM_THREADS: "1",
    OMP_NUM_THREADS: "1",
    OPENBLAS_NUM_THREADS: "1",
    VECLIB_MAXIMUM_THREADS: "1",
  };
  await execute(codexExecutable, ["--version"], {
    env: childEnvironment,
    timeout: 30_000,
  });
  await execute(
    pythonExecutable,
    ["-c", "import counterlab_kernel, numpy, pandas, sklearn"],
    {
      env: childEnvironment,
      timeout: 30_000,
    },
  );
  await execute(setprivExecutable, ["--version"], {
    env: childEnvironment,
    timeout: 30_000,
  });

  return {
    status: "ready",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: [
      "entrypoint",
      "non-root-user",
      "immutable-paths",
      "codex",
      "python",
      "setpriv",
      "writable-roots",
    ],
  };
}
