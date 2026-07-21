import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  access,
  chmod,
  lstat,
  open,
  readFile,
  realpath,
  stat,
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
const GUEST_CODEX_ROOT = "/opt/codex";
const GUEST_CODEX_HOME = "/home/counterlab";
const GUEST_WORKSPACE = "/workspace";
const NETWORK_RUNTIME_MOUNTS = [
  "/etc/ca-certificates",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/resolv.conf",
  "/etc/ssl",
] as const;

export type ContainerCodexLaunchBoundaryOptions = {
  authJson: string;
  workspaceRoot: string;
  codexHomeRoot: string;
  codexRoot: string;
  codexExecutable: string;
  bwrapExecutable: string;
  setprivExecutable: string;
  ptraceScopePath?: string;
  uid: number;
  gid: number;
};

export type ContainerBubblewrapLaunchPlan = PreparedAppServerLaunch & {
  mountedHostPaths: string[];
};

type BuildContainerBubblewrapLaunchOptions = {
  appServerArgs: string[];
  bwrapExecutable: string;
  codexExecutable: string;
  codexRoot: string;
  setprivExecutable: string;
  stagedAuthFile: string;
  workspace: string;
};

export type BuildContainerBubblewrapProbeOptions = {
  bwrapExecutable: string;
  codexRoot: string;
  workspace: string;
};

export type ContainerBubblewrapProbePlan = {
  command: string;
  args: string[];
  environment: NodeJS.ProcessEnv;
  mountedHostPaths: string[];
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

function guestCodexExecutable(codexRoot: string, codexExecutable: string) {
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
  return `${GUEST_CODEX_ROOT}/${fromRoot}`;
}

function buildContainerBubblewrapBase(options: {
  bwrapExecutable: string;
  codexRoot: string;
  stagedAuthFile?: string;
  workspace: string;
}): ContainerBubblewrapProbePlan {
  for (const [label, value] of [
    ["Bubblewrap executable", options.bwrapExecutable],
    ["Codex root", options.codexRoot],
    ["Generation workspace", options.workspace],
  ] as const) {
    requireAbsolutePath(label, value);
  }
  if (options.stagedAuthFile !== undefined) {
    requireAbsolutePath("Staged Codex auth file", options.stagedAuthFile);
  }
  const mountedHostPaths = [
    "/usr",
    ...NETWORK_RUNTIME_MOUNTS,
    options.codexRoot,
    ...(options.stagedAuthFile === undefined ? [] : [options.stagedAuthFile]),
    options.workspace,
  ];
  const environment: NodeJS.ProcessEnv = {
    HOME: GUEST_CODEX_HOME,
    CODEX_HOME: GUEST_CODEX_HOME,
    LANG: "C.UTF-8",
    PATH: "/usr/bin",
    TMPDIR: "/tmp",
  };
  return {
    command: options.bwrapExecutable,
    args: [
      "--die-with-parent",
      "--new-session",
      "--unshare-user",
      "--unshare-pid",
      "--unshare-ipc",
      "--unshare-uts",
      "--unshare-cgroup-try",
      "--cap-drop",
      "ALL",
      "--clearenv",
      "--ro-bind",
      "/usr",
      "/usr",
      "--symlink",
      "usr/bin",
      "/bin",
      "--symlink",
      "usr/lib",
      "/lib",
      "--symlink",
      "usr/lib",
      "/lib64",
      "--dir",
      "/etc",
      ...NETWORK_RUNTIME_MOUNTS.flatMap((path) => ["--ro-bind", path, path]),
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "--ro-bind",
      "/dev/null",
      "/proc/1/environ",
      "--dir",
      "/opt",
      "--ro-bind",
      options.codexRoot,
      GUEST_CODEX_ROOT,
      "--tmpfs",
      "/tmp",
      "--dir",
      "/home",
      "--tmpfs",
      GUEST_CODEX_HOME,
      ...(options.stagedAuthFile === undefined
        ? []
        : [
            "--ro-bind",
            options.stagedAuthFile,
            `${GUEST_CODEX_HOME}/auth.json`,
          ]),
      "--dir",
      GUEST_WORKSPACE,
      "--bind",
      options.workspace,
      GUEST_WORKSPACE,
      "--setenv",
      "HOME",
      GUEST_CODEX_HOME,
      "--setenv",
      "CODEX_HOME",
      GUEST_CODEX_HOME,
      "--setenv",
      "LANG",
      "C.UTF-8",
      "--setenv",
      "PATH",
      "/usr/bin",
      "--setenv",
      "TMPDIR",
      "/tmp",
      "--chdir",
      GUEST_WORKSPACE,
    ],
    environment,
    mountedHostPaths,
  };
}

export function buildContainerBubblewrapLaunch(
  options: BuildContainerBubblewrapLaunchOptions,
): ContainerBubblewrapLaunchPlan {
  for (const [label, value] of [
    ["Codex executable", options.codexExecutable],
    ["setpriv executable", options.setprivExecutable],
  ] as const) {
    requireAbsolutePath(label, value);
  }
  if (options.appServerArgs.some((argument) => argument.includes("\0"))) {
    throw isolationError("Codex App Server arguments contain an invalid byte.");
  }
  const codexCommand = guestCodexExecutable(
    options.codexRoot,
    options.codexExecutable,
  );
  const base = buildContainerBubblewrapBase(options);

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
    protocolCwd: GUEST_WORKSPACE,
  };
}

export function buildContainerBubblewrapProbe(
  options: BuildContainerBubblewrapProbeOptions,
): ContainerBubblewrapProbePlan {
  const base = buildContainerBubblewrapBase(options);
  const probeScript = String.raw`
set -euo pipefail
test -x /opt/codex/bin/codex
test ! -s /proc/1/environ
test ! -e /app
test ! -e /repo
test ! -e /opt/counterlab-venv
test ! -e /work/jobs
test ! -e /run/counterlab-codex
test -f /workspace/approved.txt
/usr/bin/setpriv --no-new-privs /opt/codex/bin/codex --version >/dev/null
printf 'bounded output\n' > /workspace/probe-output.txt
test "$(cat /workspace/probe-output.txt)" = 'bounded output'
printf '{"forbiddenHostPathsHidden":true,"parentEnvironmentHidden":true,"workspaceVisible":true,"workspaceWritable":true}\n'
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
      !isAbsolute(this.options.bwrapExecutable) ||
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
      const [bwrapExecutable, setprivExecutable, systemRoot] =
        await Promise.all([
          realpath(this.options.bwrapExecutable),
          realpath(this.options.setprivExecutable),
          realpath("/usr"),
        ]);
      if (
        !isContained(codexRoot, codexExecutable) ||
        !isContained(systemRoot, bwrapExecutable) ||
        !isContained(systemRoot, setprivExecutable) ||
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
        access(this.options.bwrapExecutable, constants.X_OK),
        access(this.options.setprivExecutable, constants.X_OK),
        access(this.options.codexRoot, constants.R_OK | constants.X_OK),
        access(this.options.workspaceRoot, constants.R_OK | constants.W_OK),
        access(this.options.codexHomeRoot, constants.R_OK | constants.W_OK),
        ...NETWORK_RUNTIME_MOUNTS.map((path) => access(path, constants.R_OK)),
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
    const authPath = join(
      resolve(this.options.codexHomeRoot),
      `counterlab-codex-${randomUUID()}.auth.json`,
    );
    let disposed = false;
    let revoked = false;
    let authHandle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      authHandle = await open(authPath, "wx", 0o600);
      await authHandle.writeFile(this.parsedAuth, "utf8");
      await authHandle.close();
      authHandle = undefined;
      await chmod(workspace, 0o700);
    } catch (error) {
      await authHandle?.close().catch(() => undefined);
      await writeFile(authPath, "", { flag: "w" }).catch(() => undefined);
      await unlink(authPath).catch(() => undefined);
      throw isolationError("Codex credential staging failed.", error);
    }

    const plan = buildContainerBubblewrapLaunch({
      appServerArgs: request.args,
      bwrapExecutable: this.options.bwrapExecutable,
      codexExecutable,
      codexRoot,
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
        disposed = true;
      },
    };
  }
}
