import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { canonicalJson } from "@counterlab/session-core";
import { z } from "zod";

import { buildContainerLandlockProbe } from "./launch-boundary.js";

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
  "landlock",
  "landlock-read-isolation",
  "setpriv",
  "writable-roots",
] as const;

const LandlockReadIsolationOutputSchema = z.strictObject({
  forbiddenHostPathsUnreadable: z.literal(true),
  forbiddenHostWritesDenied: z.literal(true),
  crossTreeReferDenied: z.literal(true),
  execInheritanceEnforced: z.literal(true),
  parentEnvironmentUnreadable: z.literal(true),
  workspaceVisible: z.literal(true),
  workspaceWritable: z.literal(true),
});

const LandlockStatusSchema = z.strictObject({
  landlockAbi: z.number().int().min(3),
  policyVersion: z.literal("counterlab-landlock-path-policy-v1"),
});

export const GENERATION_ISOLATION_PROBE_VERSION =
  "counterlab-generation-isolation-v2" as const;

export type GenerationIsolationProbePayload = {
  schemaVersion: "2";
  probeVersion: typeof GENERATION_ISOLATION_PROBE_VERSION;
  service: "counterlab-hosted-runner";
  probe: "non-root-startup";
  checks: typeof STARTUP_CHECKS;
  generationFilesystemReadIsolation: "OS_ENFORCED";
  mechanism: "landlock";
  landlockAbi: number;
  landlock: z.infer<typeof LandlockReadIsolationOutputSchema>;
};

function readExecutionStdout(result: unknown): string {
  if (typeof result !== "object" || result === null || !("stdout" in result)) {
    throw new Error(
      "Hosted runner Landlock probe did not return inspectable stdout",
    );
  }
  const stdout = result.stdout;
  if (typeof stdout === "string") return stdout;
  if (Buffer.isBuffer(stdout)) return stdout.toString("utf8");
  throw new Error(
    "Hosted runner Landlock probe returned an invalid stdout payload",
  );
}

export function createGenerationIsolationProbePayload(
  landlockOutput: unknown,
  landlockStatusOutput: unknown,
): GenerationIsolationProbePayload {
  const status = LandlockStatusSchema.parse(landlockStatusOutput);
  return {
    schemaVersion: "2",
    probeVersion: GENERATION_ISOLATION_PROBE_VERSION,
    service: "counterlab-hosted-runner",
    probe: "non-root-startup",
    checks: STARTUP_CHECKS,
    generationFilesystemReadIsolation: "OS_ENFORCED",
    mechanism: "landlock",
    landlockAbi: status.landlockAbi,
    landlock: LandlockReadIsolationOutputSchema.parse(landlockOutput),
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
  const landlockLauncher =
    environment.COUNTERLAB_LANDLOCK_LAUNCHER ??
    "/opt/counterlab/landlock_launcher.py";
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
  const rootOwned =
    appMetadata.uid === 0 &&
    appMetadata.gid === 0 &&
    bundleMetadata.uid === 0 &&
    bundleMetadata.gid === 0;
  const runtimeRootOwned =
    appMetadata.uid === uid &&
    appMetadata.gid === gid &&
    bundleMetadata.uid === uid &&
    bundleMetadata.gid === gid;
  if (
    !appMetadata.isDirectory() ||
    (appMetadata.mode & 0o777) !== 0o555 ||
    !bundleMetadata.isFile() ||
    (bundleMetadata.mode & 0o777) !== 0o555 ||
    (!rootOwned && !runtimeRootOwned)
  ) {
    throw new Error(
      [
        "Hosted runner immutable application paths do not match the 0555 runtime-root policy",
        `app=${appMetadata.isDirectory() ? "directory" : "other"} ${appMetadata.uid}:${appMetadata.gid} ${(appMetadata.mode & 0o777).toString(8).padStart(3, "0")}`,
        `bundle=${bundleMetadata.isFile() ? "file" : "other"} ${bundleMetadata.uid}:${bundleMetadata.gid} ${(bundleMetadata.mode & 0o777).toString(8).padStart(3, "0")}`,
      ].join("; "),
    );
  }

  await Promise.all([
    accessFile(nodeExecutable, constants.X_OK),
    accessFile(bundlePath, constants.R_OK),
    accessFile(codexExecutable, constants.X_OK),
    accessFile(codexRoot, constants.R_OK | constants.X_OK),
    accessFile(landlockLauncher, constants.R_OK),
    accessFile(setprivExecutable, constants.X_OK),
    accessFile(pythonExecutable, constants.X_OK),
    makeDirectory(workspaceRoot, { recursive: true, mode: 0o700 }),
    makeDirectory(codexHomeRoot, { recursive: true, mode: 0o700 }),
    makeDirectory(probeWorkspace, { recursive: true, mode: 0o700 }),
    makeDirectory(join(probeWorkspace, ".counterlab-codex"), {
      recursive: true,
      mode: 0o700,
    }),
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
  const landlockStatusExecution = await execute(
    pythonExecutable,
    [landlockLauncher, "--print-abi"],
    {
      env: childEnvironment,
      timeout: 30_000,
    },
  );
  const isolationProbe = buildContainerLandlockProbe({
    codexHome: join(probeWorkspace, ".counterlab-codex"),
    codexRoot,
    landlockLauncher,
    pythonExecutable,
    setprivExecutable,
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
  let landlockOutput: unknown;
  let landlockStatusOutput: unknown;
  try {
    landlockOutput = JSON.parse(
      readExecutionStdout(isolationProbeExecution).trim(),
    ) as unknown;
    landlockStatusOutput = JSON.parse(
      readExecutionStdout(landlockStatusExecution).trim(),
    ) as unknown;
  } catch (error) {
    throw new Error(
      "Hosted runner Landlock probe returned invalid JSON evidence",
      { cause: error },
    );
  }
  const generationIsolationProbe = createGenerationIsolationProbePayload(
    landlockOutput,
    landlockStatusOutput,
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
