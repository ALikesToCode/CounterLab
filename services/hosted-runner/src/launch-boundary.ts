import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  access,
  chmod,
  lstat,
  readdir,
  mkdir,
  open,
  readFile,
  realpath,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import {
  CompilerSetupError,
  type AppServerLaunchBoundary,
  type AppServerLaunchBoundaryHealth,
  type AppServerLaunchRequest,
  type PreparedAppServerLaunch,
} from "@counterlab/codex-client";
import { z } from "zod";

const CodexAuthSchema = z
  .object({
    tokens: z
      .object({ access_token: z.string().min(16).max(65_536) })
      .passthrough(),
  })
  .passthrough();

const CREDENTIAL_EXCLUSIONS =
  'shell_environment_policy.exclude=["CODEX_ACCESS_TOKEN","OPENAI_API_KEY"]';
const NETWORK_RUNTIME_PATHS = [
  "/etc/ca-certificates",
  "/etc/hosts",
  "/etc/ld.so.cache",
  "/etc/nsswitch.conf",
  "/etc/passwd",
  "/etc/group",
  "/etc/resolv.conf",
  "/etc/ssl",
] as const;
const READ_ONLY_DEVICE_PATHS = ["/dev/random", "/dev/urandom"] as const;
const READ_WRITE_DEVICE_PATHS = ["/dev/null"] as const;

export type ContainerCodexLaunchBoundaryOptions = {
  authJson: string;
  workspaceRoot: string;
  codexHomeRoot: string;
  codexRoot: string;
  codexExecutable: string;
  landlockLauncher: string;
  pythonExecutable: string;
  setprivExecutable: string;
  ptraceScopePath?: string;
  uid: number;
  gid: number;
};

export type ContainerLandlockLaunchPlan = PreparedAppServerLaunch & {
  allowedHostPaths: string[];
};

type BuildContainerLandlockLaunchOptions = {
  appServerArgs: string[];
  codexExecutable: string;
  codexRoot: string;
  codexHome: string;
  landlockLauncher: string;
  pythonExecutable: string;
  setprivExecutable: string;
  stagedAuthFile: string;
  workspace: string;
};

export type BuildContainerLandlockProbeOptions = {
  codexHome: string;
  codexRoot: string;
  landlockLauncher: string;
  pythonExecutable: string;
  setprivExecutable: string;
  workspace: string;
};

export type ContainerLandlockProbePlan = {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
  allowedHostPaths: string[];
};

function isolationError(message: string, cause?: unknown): CompilerSetupError {
  return new CompilerSetupError("CODEX_ISOLATION_UNAVAILABLE", message, {
    ...(cause === undefined ? {} : { cause }),
  });
}

function isContained(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot !== "" &&
    !pathFromRoot.startsWith("..") &&
    !isAbsolute(pathFromRoot)
  );
}

function pathsOverlap(left: string, right: string): boolean {
  return left === right || isContained(left, right) || isContained(right, left);
}

function requireAbsolutePath(label: string, value: string): void {
  if (!isAbsolute(value) || value.includes("\0")) {
    throw isolationError(`${label} must be an absolute path.`);
  }
}

async function assertWorkspaceEntriesBounded(directory: string): Promise<void> {
  for (const name of await readdir(directory)) {
    const path = join(directory, name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      throw isolationError(
        "Generation workspace must not contain symbolic links before launch.",
      );
    }
    if (metadata.isFile() && metadata.nlink !== 1) {
      throw isolationError(
        "Generation workspace must not contain multiply-linked files before launch.",
      );
    }
    if (metadata.isDirectory()) {
      await assertWorkspaceEntriesBounded(path);
    }
  }
}

function requireCodexExecutable(codexRoot: string, codexExecutable: string) {
  const fromRoot = relative(codexRoot, codexExecutable);
  if (
    fromRoot === "" ||
    fromRoot.startsWith("..") ||
    isAbsolute(fromRoot) ||
    fromRoot.includes("\0")
  ) {
    throw isolationError(
      "The Codex executable must resolve beneath the mounted Codex root.",
    );
  }
  return codexExecutable;
}

function buildContainerLandlockBase(options: {
  codexHome: string;
  codexRoot: string;
  landlockLauncher: string;
  pythonExecutable: string;
  stagedAuthFile?: string;
  workspace: string;
}): ContainerLandlockProbePlan {
  for (const [label, value] of [
    ["Landlock launcher", options.landlockLauncher],
    ["Python executable", options.pythonExecutable],
    ["Codex root", options.codexRoot],
    ["Codex home", options.codexHome],
    ["Generation workspace", options.workspace],
  ] as const) {
    requireAbsolutePath(label, value);
  }
  if (options.stagedAuthFile !== undefined) {
    requireAbsolutePath("Staged Codex auth file", options.stagedAuthFile);
  }
  const readExecutePaths = ["/usr", options.codexRoot];
  const readOnlyPaths = [
    ...NETWORK_RUNTIME_PATHS,
    ...READ_ONLY_DEVICE_PATHS,
    ...(options.stagedAuthFile === undefined ? [] : [options.stagedAuthFile]),
  ];
  const readWritePaths = [
    ...READ_WRITE_DEVICE_PATHS,
    options.codexHome,
    options.workspace,
  ];
  const environment: NodeJS.ProcessEnv = {
    HOME: options.codexHome,
    CODEX_HOME: options.codexHome,
    LANG: "C.UTF-8",
    PATH: "/usr/local/bin:/usr/bin",
    TMPDIR: options.codexHome,
  };
  return {
    command: options.pythonExecutable,
    args: [
      options.landlockLauncher,
      ...readOnlyPaths.flatMap((path) => ["--ro", path]),
      ...readExecutePaths.flatMap((path) => ["--ro-exec", path]),
      ...readWritePaths.flatMap((path) => ["--rw", path]),
      "--",
    ],
    environment,
    allowedHostPaths: [
      ...readOnlyPaths,
      ...readExecutePaths,
      ...readWritePaths,
    ],
  };
}

export function buildContainerLandlockLaunch(
  options: BuildContainerLandlockLaunchOptions,
): ContainerLandlockLaunchPlan {
  for (const [label, value] of [
    ["Codex executable", options.codexExecutable],
    ["setpriv executable", options.setprivExecutable],
  ] as const) {
    requireAbsolutePath(label, value);
  }
  if (options.appServerArgs.some((argument) => argument.includes("\0"))) {
    throw isolationError("Codex App Server arguments contain an invalid byte.");
  }
  const codexCommand = requireCodexExecutable(
    options.codexRoot,
    options.codexExecutable,
  );
  const base = buildContainerLandlockBase(options);

  return {
    ...base,
    args: [
      ...base.args,
      options.setprivExecutable,
      "--no-new-privs",
      codexCommand,
      ...options.appServerArgs,
      "--strict-config",
      "-c",
      "shell_environment_policy.inherit=none",
      "-c",
      CREDENTIAL_EXCLUSIONS,
    ],
    protocolCwd: options.workspace,
    spawnCwd: options.workspace,
  };
}

export function buildContainerLandlockProbe(
  options: BuildContainerLandlockProbeOptions,
): ContainerLandlockProbePlan {
  const base = buildContainerLandlockBase(options);
  const probeScript = String.raw`
set -euo pipefail
codex_root="$1"
workspace="$2"
setpriv_executable="$3"
test -x "$codex_root/bin/codex"
! cat /proc/1/environ >/dev/null 2>&1
! cat /app/runner.mjs >/dev/null 2>&1
! ls /repo >/dev/null 2>&1
! ls /opt/counterlab-venv >/dev/null 2>&1
! ls /work/jobs >/dev/null 2>&1
! ls /run/counterlab-codex >/dev/null 2>&1
test "$(cat "$workspace/approved.txt")" = 'approved'
! sh -c 'printf denied > /app/counterlab-landlock-write' >/dev/null 2>&1
! truncate -s 0 /app/runner.mjs >/dev/null 2>&1
! ln "$workspace/approved.txt" /app/counterlab-landlock-link >/dev/null 2>&1
/usr/bin/bash --noprofile --norc -c '! cat /app/runner.mjs >/dev/null 2>&1'
"$setpriv_executable" --no-new-privs "$codex_root/bin/codex" --version >/dev/null
printf 'bounded output\n' > "$workspace/probe-output.txt"
test "$(cat "$workspace/probe-output.txt")" = 'bounded output'
printf '{"forbiddenHostPathsUnreadable":true,"forbiddenHostWritesDenied":true,"crossTreeReferDenied":true,"execInheritanceEnforced":true,"parentEnvironmentUnreadable":true,"workspaceVisible":true,"workspaceWritable":true}\n'
`;
  return {
    ...base,
    args: [
      ...base.args,
      "/usr/bin/bash",
      "--noprofile",
      "--norc",
      "-c",
      probeScript,
      "counterlab-landlock-probe",
      options.codexRoot,
      options.workspace,
      options.setprivExecutable,
    ],
  };
}

export class ContainerCodexLaunchBoundary implements AppServerLaunchBoundary {
  private readonly parsedAuth: string;
  private readonly ptraceScopePath: string;

  constructor(private readonly options: ContainerCodexLaunchBoundaryOptions) {
    this.ptraceScopePath =
      options.ptraceScopePath ?? "/proc/sys/kernel/yama/ptrace_scope";
    try {
      this.parsedAuth = JSON.stringify(
        CodexAuthSchema.parse(JSON.parse(options.authJson) as unknown),
      );
    } catch (error) {
      throw isolationError("Codex authentication is not valid JSON.", error);
    }
  }

  async health(): Promise<AppServerLaunchBoundaryHealth> {
    if (
      this.options.uid <= 0 ||
      this.options.gid <= 0 ||
      !isAbsolute(this.options.workspaceRoot) ||
      !isAbsolute(this.options.codexHomeRoot) ||
      !isAbsolute(this.options.codexRoot) ||
      !isAbsolute(this.options.codexExecutable) ||
      !isAbsolute(this.options.landlockLauncher) ||
      !isAbsolute(this.options.pythonExecutable) ||
      !isAbsolute(this.options.setprivExecutable)
    ) {
      return {
        available: false,
        reason: "Container Codex privilege and path configuration is invalid.",
      };
    }
    try {
      if (
        process.getuid?.() !== this.options.uid ||
        process.getgid?.() !== this.options.gid
      ) {
        return {
          available: false,
          reason:
            "Container Codex must start as the declared non-root process identity.",
        };
      }
      const [workspaceRoot, codexHomeRoot, codexRoot, codexExecutable] =
        await Promise.all([
          realpath(this.options.workspaceRoot),
          realpath(this.options.codexHomeRoot),
          realpath(this.options.codexRoot),
          realpath(this.options.codexExecutable),
        ]);
      const [
        landlockLauncher,
        pythonExecutable,
        setprivExecutable,
        systemRoot,
      ] = await Promise.all([
        realpath(this.options.landlockLauncher),
        realpath(this.options.pythonExecutable),
        realpath(this.options.setprivExecutable),
        realpath("/usr"),
      ]);
      if (
        !isContained(codexRoot, codexExecutable) ||
        !isContained(systemRoot, setprivExecutable) ||
        pathsOverlap(workspaceRoot, landlockLauncher) ||
        pathsOverlap(codexHomeRoot, landlockLauncher) ||
        pathsOverlap(workspaceRoot, pythonExecutable) ||
        pathsOverlap(codexHomeRoot, pythonExecutable) ||
        pathsOverlap(workspaceRoot, codexHomeRoot) ||
        pathsOverlap(workspaceRoot, codexRoot) ||
        pathsOverlap(codexHomeRoot, codexRoot)
      ) {
        return {
          available: false,
          reason: "Container Codex mount roots are not independently bounded.",
        };
      }
      const ptraceScope = Number.parseInt(
        (await readFile(this.ptraceScopePath, "utf8")).trim(),
        10,
      );
      if (!Number.isInteger(ptraceScope) || ptraceScope < 1) {
        return {
          available: false,
          reason: "Container Codex requires child-to-parent ptrace protection.",
        };
      }
      await Promise.all([
        access(this.options.codexExecutable, constants.X_OK),
        access(this.options.landlockLauncher, constants.R_OK),
        access(this.options.pythonExecutable, constants.X_OK),
        access(this.options.setprivExecutable, constants.X_OK),
        access(this.options.codexRoot, constants.R_OK | constants.X_OK),
        access(this.options.workspaceRoot, constants.R_OK | constants.W_OK),
        access(this.options.codexHomeRoot, constants.R_OK | constants.W_OK),
        ...NETWORK_RUNTIME_PATHS.map((path) => access(path, constants.R_OK)),
        ...READ_ONLY_DEVICE_PATHS.map((path) => access(path, constants.R_OK)),
        ...READ_WRITE_DEVICE_PATHS.map((path) =>
          access(path, constants.R_OK | constants.W_OK),
        ),
      ]);
      return { available: true };
    } catch {
      return {
        available: false,
        reason:
          "Container Codex isolation executables or private roots are unavailable.",
      };
    }
  }

  async prepare(
    request: AppServerLaunchRequest,
  ): Promise<PreparedAppServerLaunch> {
    const health = await this.health();
    if (!health.available) throw isolationError(health.reason);
    try {
      await Promise.all([
        chmod(this.options.workspaceRoot, 0o700),
        chmod(this.options.codexHomeRoot, 0o700),
      ]);
      const rootModes = await Promise.all([
        stat(this.options.workspaceRoot),
        stat(this.options.codexHomeRoot),
      ]);
      for (const metadata of rootModes) {
        const mode = metadata.mode & 0o777;
        const ownerIsPrivate = (mode & 0o700) === 0o700 && (mode & 0o066) === 0;
        if (!ownerIsPrivate) {
          throw isolationError(
            "Container Codex private roots did not retain private permissions.",
          );
        }
      }
    } catch (error) {
      if (error instanceof CompilerSetupError) throw error;
      throw isolationError(
        "Container Codex private roots cannot enforce private access.",
        error,
      );
    }
    const workspaceRoot = await realpath(resolve(this.options.workspaceRoot));
    const requestedWorkspaceMetadata = await lstat(resolve(request.hostCwd));
    if (requestedWorkspaceMetadata.isSymbolicLink()) {
      throw isolationError("Generation directory must not be a symbolic link.");
    }
    const workspace = await realpath(resolve(request.hostCwd));
    if (!isContained(workspaceRoot, workspace)) {
      throw isolationError(
        "Generation directory is outside the hosted runner workspace.",
      );
    }
    await assertWorkspaceEntriesBounded(workspace);
    if (!isAbsolute(request.command)) {
      throw isolationError("The requested Codex executable must be absolute.");
    }
    const [requestedCommand, codexRoot, codexExecutable] = await Promise.all([
      realpath(request.command),
      realpath(this.options.codexRoot),
      realpath(this.options.codexExecutable),
    ]);
    if (requestedCommand !== codexExecutable) {
      throw isolationError(
        "The requested Codex executable does not match the configured executable.",
      );
    }
    const launchRoot = join(
      resolve(this.options.codexHomeRoot),
      `counterlab-codex-${randomUUID()}`,
    );
    const codexHome = join(launchRoot, "state");
    const authPath = join(launchRoot, "auth.json");
    const authLink = join(codexHome, "auth.json");
    let disposed = false;
    let revoked = false;
    let authHandle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await mkdir(codexHome, { recursive: true, mode: 0o700 });
      await chmod(codexHome, 0o700);
      authHandle = await open(authPath, "wx", 0o600);
      await authHandle.writeFile(this.parsedAuth, "utf8");
      await authHandle.close();
      authHandle = undefined;
      await symlink("../auth.json", authLink);
      await chmod(workspace, 0o700);
    } catch (error) {
      await authHandle?.close().catch(() => undefined);
      await unlink(authLink).catch(() => undefined);
      await writeFile(authPath, "", { flag: "w" }).catch(() => undefined);
      await unlink(authPath).catch(() => undefined);
      throw isolationError("Codex credential staging failed.", error);
    }

    const plan = buildContainerLandlockLaunch({
      appServerArgs: request.args,
      codexExecutable,
      codexHome,
      codexRoot,
      landlockLauncher: this.options.landlockLauncher,
      pythonExecutable: this.options.pythonExecutable,
      setprivExecutable: this.options.setprivExecutable,
      stagedAuthFile: authPath,
      workspace,
    });

    return {
      ...plan,
      async revokeCredentials() {
        if (revoked) return;
        try {
          await writeFile(authPath, "", { encoding: "utf8", flag: "w" });
          if ((await stat(authPath)).size !== 0) {
            throw isolationError(
              "Codex authentication remained readable after revocation.",
            );
          }
          revoked = true;
        } catch (error) {
          if (error instanceof CompilerSetupError) throw error;
          throw isolationError("Codex credential revocation failed.", error);
        }
      },
      async dispose() {
        if (disposed) return;
        if (!revoked) {
          await writeFile(authPath, "", { encoding: "utf8", flag: "w" });
          if ((await stat(authPath)).size !== 0) {
            throw isolationError(
              "Codex authentication remained readable during disposal.",
            );
          }
          revoked = true;
        }
        await unlink(authPath);
        await unlink(authLink);
        disposed = true;
      },
    };
  }
}
