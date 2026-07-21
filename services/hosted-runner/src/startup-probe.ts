import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { canonicalJson } from "@counterlab/session-core";
import { z } from "zod";

import { buildContainerBubblewrapProbe } from "./launch-boundary.js";

const execFileAsync = promisify(execFile);

type Execute = (
  executable: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeout: number },
) => Promise<unknown>;

const STARTUP_CHECKS = [
  "entrypoint",
  "non-root-user",
  "immutable-paths",
  "codex",
  "python",
  "bubblewrap",
  "bubblewrap-read-isolation",
  "setpriv",
  "writable-roots",
] as const;

const BubblewrapReadIsolationOutputSchema = z.strictObject({
  forbiddenHostPathsHidden: z.literal(true),
  parentEnvironmentHidden: z.literal(true),
  workspaceVisible: z.literal(true),
  workspaceWritable: z.literal(true),
});

const EXPECTED_BUBBLEWRAP_VERSION = "bubblewrap 0.11.0" as const;

export const GENERATION_ISOLATION_PROBE_VERSION =
  "counterlab-generation-isolation-v1" as const;

export type GenerationIsolationProbePayload = {
  schemaVersion: "1";
  probeVersion: typeof GENERATION_ISOLATION_PROBE_VERSION;
  service: "counterlab-hosted-runner";
  probe: "non-root-startup";
  checks: typeof STARTUP_CHECKS;
  generationFilesystemReadIsolation: "OS_ENFORCED";
  bubblewrapVersion: "0.11.0";
  bubblewrap: z.infer<typeof BubblewrapReadIsolationOutputSchema>;
};

function readExecutionStdout(result: unknown): string {
  if (typeof result !== "object" || result === null || !("stdout" in result)) {
    throw new Error(
      "Hosted runner Bubblewrap probe did not return inspectable stdout",
    );
  }
  const stdout = result.stdout;
  if (typeof stdout === "string") return stdout;
  if (Buffer.isBuffer(stdout)) return stdout.toString("utf8");
  throw new Error(
    "Hosted runner Bubblewrap probe returned an invalid stdout payload",
  );
}

export function createGenerationIsolationProbePayload(
  bubblewrapOutput: unknown,
  bubblewrapVersionOutput: string,
): GenerationIsolationProbePayload {
  if (bubblewrapVersionOutput.trim() !== EXPECTED_BUBBLEWRAP_VERSION) {
    throw new Error(
      `Hosted runner requires ${EXPECTED_BUBBLEWRAP_VERSION}; observed ${bubblewrapVersionOutput.trim() || "no version"}`,
    );
  }
  return {
    schemaVersion: "1",
    probeVersion: GENERATION_ISOLATION_PROBE_VERSION,
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: STARTUP_CHECKS,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    bubblewrapVersion: "0.11.0",
    bubblewrap: BubblewrapReadIsolationOutputSchema.parse(bubblewrapOutput),
  };
}

export function hashGenerationIsolationProbe(
  payload: GenerationIsolationProbePayload,
): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}

export type HostedRunnerStartupProbeOptions = {
  environment?: NodeJS.ProcessEnv;
  nodeExecutable?: string;
  bundlePath?: string;
  appRoot?: string;
  access?: typeof access;
  mkdir?: typeof mkdir;
  stat?: typeof stat;
  writeFile?: typeof writeFile;
  getUid?: () => number | undefined;
  getGid?: () => number | undefined;
  execute?: Execute;
};

export type HostedRunnerStartupProbeResult = {
  status: "ready";
  service: "counterlab-hosted-runner";
  probe: "non-root-startup";
  checks: typeof STARTUP_CHECKS;
  generationFilesystemReadIsolation: "OS_ENFORCED";
  generationIsolationProbe: GenerationIsolationProbePayload;
  generationIsolationProbeSha256: string;
};

export async function runHostedRunnerStartupProbe(
  options: HostedRunnerStartupProbeOptions = {},
): Promise<HostedRunnerStartupProbeResult> {
  const environment = options.environment ?? process.env;
  const accessFile = options.access ?? access;
  const makeDirectory = options.mkdir ?? mkdir;
  const readMetadata = options.stat ?? stat;
  const writeProbeFile = options.writeFile ?? writeFile;
  const uid = (options.getUid ?? process.getuid)?.();
  const gid = (options.getGid ?? process.getgid)?.();
  const execute =
    options.execute ??
    (async (executable, args, executionOptions) => {
      return execFileAsync(executable, args, executionOptions);
    });
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const bundlePath = options.bundlePath ?? new URL(import.meta.url).pathname;
  const appRoot = options.appRoot ?? "/app";
  const workspaceRoot = environment.COUNTERLAB_RUNNER_WORK_ROOT ?? "/work/jobs";
  const codexHomeRoot =
    environment.COUNTERLAB_CODEX_HOME_ROOT ?? "/run/counterlab-codex";
  const codexExecutable =
    environment.COUNTERLAB_CODEX_EXECUTABLE ?? "/usr/local/bin/codex";
  const codexRoot = environment.COUNTERLAB_CODEX_ROOT ?? "/opt/codex";
  const bwrapExecutable =
    environment.COUNTERLAB_BWRAP_EXECUTABLE ?? "/usr/bin/bwrap";
  const setprivExecutable =
    environment.COUNTERLAB_SETPRIV_EXECUTABLE ?? "/usr/bin/setpriv";
  const pythonExecutable =
    environment.COUNTERLAB_PYTHON_EXECUTABLE ??
    "/opt/counterlab-venv/bin/python";
  const probeWorkspace = join(workspaceRoot, ".isolation-probe");

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
    accessFile(codexRoot, constants.R_OK | constants.X_OK),
    accessFile(bwrapExecutable, constants.X_OK),
    accessFile(setprivExecutable, constants.X_OK),
    accessFile(pythonExecutable, constants.X_OK),
    makeDirectory(workspaceRoot, { recursive: true, mode: 0o700 }),
    makeDirectory(codexHomeRoot, { recursive: true, mode: 0o700 }),
    makeDirectory(probeWorkspace, { recursive: true, mode: 0o700 }),
  ]);
  await writeProbeFile(join(probeWorkspace, "approved.txt"), "approved\n", {
    encoding: "utf8",
    flag: "w",
    mode: 0o600,
  });

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
  const bubblewrapVersionExecution = await execute(
    bwrapExecutable,
    ["--version"],
    {
      env: childEnvironment,
      timeout: 30_000,
    },
  );
  const isolationProbe = buildContainerBubblewrapProbe({
    bwrapExecutable,
    codexRoot,
    workspace: probeWorkspace,
  });
  const isolationProbeExecution = await execute(
    isolationProbe.command,
    isolationProbe.args,
    {
      env: isolationProbe.environment,
      timeout: 30_000,
    },
  );
  let bubblewrapOutput: unknown;
  try {
    bubblewrapOutput = JSON.parse(
      readExecutionStdout(isolationProbeExecution).trim(),
    ) as unknown;
  } catch (error) {
    throw new Error(
      "Hosted runner Bubblewrap probe returned invalid JSON evidence",
      { cause: error },
    );
  }
  const generationIsolationProbe = createGenerationIsolationProbePayload(
    bubblewrapOutput,
    readExecutionStdout(bubblewrapVersionExecution),
  );

  return {
    status: "ready",
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: STARTUP_CHECKS,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    generationIsolationProbe,
    generationIsolationProbeSha256: hashGenerationIsolationProbe(
      generationIsolationProbe,
    ),
  };
}
