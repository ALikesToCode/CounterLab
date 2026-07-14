import { constants } from "node:fs";
import { execFile } from "node:child_process";
import {
  access,
  chmod,
  lstat,
  mkdtemp,
  open,
  readFile,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { getuid } from "node:process";
import { delimiter, dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import type {
  AppServerLaunchBoundary,
  AppServerLaunchBoundaryHealth,
  AppServerLaunchRequest,
  PreparedAppServerLaunch,
} from "./app-server.js";
import { CompilerSetupError } from "./types.js";

const MAX_AUTH_FILE_BYTES = 1_048_576;
const GUEST_CODEX_ROOT = "/opt/codex";
const GUEST_WORKSPACE = "/workspace";
const NETWORK_RUNTIME_MOUNTS = [
  "/etc/ca-certificates",
  "/etc/hosts",
  "/etc/nsswitch.conf",
  "/etc/resolv.conf",
  "/etc/ssl",
] as const;
const CREDENTIAL_EXCLUSIONS =
  'shell_environment_policy.exclude=["CODEX_ACCESS_TOKEN","OPENAI_API_KEY"]';
const execFileAsync = promisify(execFile);
const CREDENTIAL_PROBE_SCRIPT = String.raw`
set -euo pipefail
test -n "${"$"}{CODEX_ACCESS_TOKEN:-}"
/usr/bin/env -i PATH=/usr/bin HOME=/tmp /usr/bin/bash --noprofile --norc -c '
  set -euo pipefail
  expected_entry="$1"
  shift
  test -z "${"$"}{CODEX_ACCESS_TOKEN:-}"
  test ! -s /proc/1/environ
  test -f "/workspace/$expected_entry"
  for hidden_path in "$@"; do
    test ! -e "$hidden_path"
    test ! -L "$hidden_path"
  done
  printf "{\"credentialEnvironmentHidden\":true,\"hiddenPathsMissing\":true,\"parentEnvironmentHidden\":true,\"workspaceEntryVisible\":true}\\n"
' counterlab-credential-child "$@"
`;

const CodexAuthSchema = z
  .object({
    tokens: z
      .object({
        access_token: z.string().trim().min(16).max(65_536),
      })
      .passthrough(),
  })
  .passthrough();

function codexNativeRelativePath(): string {
  if (process.platform !== "linux") {
    throw isolationError("The native Codex launch currently requires Linux.");
  }
  if (process.arch === "x64") {
    return "node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex";
  }
  if (process.arch === "arm64") {
    return "node_modules/@openai/codex-linux-arm64/vendor/aarch64-unknown-linux-musl/bin/codex";
  }
  throw isolationError(
    `The native Codex launch does not support architecture ${process.arch}.`,
  );
}

export type BubblewrapCodexLaunchOptions = {
  appServerArgs: string[];
  bwrapPath: string;
  codexPackageRoot: string;
  stagedCodexHome: string;
  workspace: string;
};

export type BubblewrapCodexLaunchPlan = PreparedAppServerLaunch & {
  mountedHostPaths: string[];
};

export type BubblewrapCodexLaunchBoundaryOptions = {
  authFilePath: string;
  bwrapPath: string;
  codexPackageRoot: string;
  ptraceScopePath?: string;
};

export type DefaultBubblewrapCodexLaunchBoundaryOptions = {
  authFilePath?: string;
  bwrapPath?: string;
  command?: string;
  environment?: NodeJS.ProcessEnv;
  ptraceScopePath?: string;
};

export type BubblewrapCredentialIsolationProbeOptions = {
  accessToken: string;
  bwrapPath: string;
  hiddenPaths: string[];
  workspace: string;
  expectedWorkspaceEntry?: string;
};

export type BubblewrapCredentialIsolationProbeResult = {
  credentialEnvironmentHidden: true;
  hiddenPathsMissing: true;
  parentEnvironmentHidden: true;
  workspaceEntryVisible: true;
};

export type StagedCodexAuth = {
  directory: string;
  guestAuthSource: string;
  revoke(): Promise<void>;
  dispose(): Promise<void>;
};

function isolationError(message: string, cause?: unknown): CompilerSetupError {
  return new CompilerSetupError("CODEX_ISOLATION_UNAVAILABLE", message, {
    ...(cause === undefined ? {} : { cause }),
  });
}

function requireAbsolute(label: string, value: string): void {
  if (!isAbsolute(value) || value.includes("\0")) {
    throw isolationError(`${label} must be an absolute path.`);
  }
}

async function readSecureCodexAuth(
  authFilePath: string,
): Promise<{ accessToken: string; raw: string }> {
  requireAbsolute("Codex auth file", authFilePath);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  try {
    const pathMetadata = await lstat(authFilePath);
    if (!pathMetadata.isFile() || pathMetadata.isSymbolicLink()) {
      throw isolationError("The Codex auth source must be a regular file.");
    }
    handle = await open(
      authFilePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const metadata = await handle.stat();
    if (!metadata.isFile()) {
      throw isolationError("The Codex auth source must be a regular file.");
    }
    if ((metadata.mode & 0o077) !== 0) {
      throw isolationError(
        "The Codex auth file permissions must deny group and other access.",
      );
    }
    if (typeof getuid === "function" && metadata.uid !== getuid()) {
      throw isolationError(
        "The Codex auth file must be owned by the CounterLab process user.",
      );
    }
    if (metadata.size <= 0 || metadata.size > MAX_AUTH_FILE_BYTES) {
      throw isolationError("The Codex auth file size is outside the safe limit.");
    }
    const raw = await handle.readFile({ encoding: "utf8" });
    const parsed = CodexAuthSchema.safeParse(JSON.parse(raw) as unknown);
    if (!parsed.success) {
      throw isolationError(
        "The Codex auth file does not contain a supported access token.",
      );
    }
    return { accessToken: parsed.data.tokens.access_token, raw };
  } catch (error) {
    if (error instanceof CompilerSetupError) throw error;
    throw isolationError("The Codex auth file could not be read securely.", error);
  } finally {
    await handle?.close();
  }
}

export async function loadSecureCodexAccessToken(
  authFilePath: string,
): Promise<string> {
  return (await readSecureCodexAuth(authFilePath)).accessToken;
}

export async function stageSecureCodexAuth(
  authFilePath: string,
): Promise<StagedCodexAuth> {
  const { raw } = await readSecureCodexAuth(authFilePath);
  const directory = await mkdtemp(join(tmpdir(), "counterlab-codex-broker-"));
  const guestAuthSource = join(directory, "auth.json");
  let disposed = false;
  let revoked = false;
  try {
    await chmod(directory, 0o700);
    await writeFile(guestAuthSource, raw, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    await rm(directory, { force: true, recursive: true });
    throw isolationError("Codex auth staging failed.", error);
  }
  return {
    directory,
    guestAuthSource,
    async revoke() {
      if (disposed || revoked) return;
      try {
        for (const entry of await readdir(directory)) {
          await rm(join(directory, entry), { force: true, recursive: true });
        }
      } catch (error) {
        if (
          !(
            error instanceof Error &&
            "code" in error &&
            error.code === "ENOENT"
          )
        ) {
          throw isolationError("Codex auth revocation failed.", error);
        }
      }
      revoked = true;
      if ((await readdir(directory)).length !== 0) {
        throw isolationError("Codex state remained visible after revocation.");
      }
      await chmod(directory, 0o000);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await rm(directory, { force: true, recursive: true });
    },
  };
}

export function buildBubblewrapCodexLaunch(
  options: BubblewrapCodexLaunchOptions,
): BubblewrapCodexLaunchPlan {
  requireAbsolute("Bubblewrap executable", options.bwrapPath);
  requireAbsolute("Codex package root", options.codexPackageRoot);
  requireAbsolute("Staged Codex home", options.stagedCodexHome);
  requireAbsolute("Generation workspace", options.workspace);
  if (options.appServerArgs.some((argument) => argument.includes("\0"))) {
    throw isolationError("Codex App Server arguments contain an invalid byte.");
  }

  const mountedHostPaths = [
    "/usr",
    ...NETWORK_RUNTIME_MOUNTS,
    options.codexPackageRoot,
    options.stagedCodexHome,
    options.workspace,
  ];
  const environment: NodeJS.ProcessEnv = {
    CODEX_HOME: "/tmp/codex-home",
    HOME: "/tmp/codex-home",
    LANG: "C.UTF-8",
    PATH: "/usr/bin",
    TMPDIR: "/tmp",
  };

  return {
    command: options.bwrapPath,
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
      ...NETWORK_RUNTIME_MOUNTS.flatMap((path) => [
        "--ro-bind",
        path,
        path,
      ]),
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
      options.codexPackageRoot,
      GUEST_CODEX_ROOT,
      "--tmpfs",
      "/tmp",
      "--bind",
      options.stagedCodexHome,
      "/tmp/codex-home",
      "--dir",
      GUEST_WORKSPACE,
      "--bind",
      options.workspace,
      GUEST_WORKSPACE,
      "--setenv",
      "HOME",
      "/tmp/codex-home",
      "--setenv",
      "CODEX_HOME",
      "/tmp/codex-home",
      "--setenv",
      "PATH",
      "/usr/bin",
      "--setenv",
      "TMPDIR",
      "/tmp",
      "--chdir",
      GUEST_WORKSPACE,
      `${GUEST_CODEX_ROOT}/${codexNativeRelativePath()}`,
      ...options.appServerArgs,
      "--strict-config",
      "-c",
      "shell_environment_policy.inherit=none",
      "-c",
      CREDENTIAL_EXCLUSIONS,
    ],
    environment,
    mountedHostPaths,
    protocolCwd: GUEST_WORKSPACE,
  };
}

export class BubblewrapCodexLaunchBoundary
  implements AppServerLaunchBoundary
{
  private readonly ptraceScopePath: string;

  constructor(
    private readonly options: BubblewrapCodexLaunchBoundaryOptions,
  ) {
    this.ptraceScopePath =
      options.ptraceScopePath ?? "/proc/sys/kernel/yama/ptrace_scope";
  }

  async health(): Promise<AppServerLaunchBoundaryHealth> {
    try {
      await this.assertReady();
      return { available: true };
    } catch (error) {
      return {
        available: false,
        reason:
          error instanceof CompilerSetupError
            ? error.message
            : "The Codex credential boundary health check failed.",
      };
    }
  }

  async prepare(
    request: AppServerLaunchRequest,
  ): Promise<PreparedAppServerLaunch> {
    await this.assertReady();
    const staged = await stageSecureCodexAuth(this.options.authFilePath);
    try {
      return {
        ...buildBubblewrapCodexLaunch({
          appServerArgs: request.args,
          bwrapPath: this.options.bwrapPath,
          codexPackageRoot: this.options.codexPackageRoot,
          stagedCodexHome: staged.directory,
          workspace: request.hostCwd,
        }),
        dispose: staged.dispose,
        revokeCredentials: staged.revoke,
      };
    } catch (error) {
      await staged.dispose();
      throw error;
    }
  }

  hostMounts(): string[] {
    return ["/usr", ...NETWORK_RUNTIME_MOUNTS, this.options.codexPackageRoot];
  }

  private async assertReady(): Promise<void> {
    if (process.platform !== "linux") {
      throw isolationError(
        "The credential-safe Codex launch boundary currently requires Linux.",
      );
    }
    requireAbsolute("Bubblewrap executable", this.options.bwrapPath);
    requireAbsolute("Codex package root", this.options.codexPackageRoot);
    requireAbsolute("ptrace scope path", this.ptraceScopePath);
    try {
      await Promise.all([
        access(this.options.bwrapPath, constants.X_OK),
        access(
          `${this.options.codexPackageRoot}/bin/codex.js`,
          constants.R_OK,
        ),
        access(
          join(this.options.codexPackageRoot, codexNativeRelativePath()),
          constants.X_OK,
        ),
        ...NETWORK_RUNTIME_MOUNTS.map((path) => access(path, constants.R_OK)),
      ]);
    } catch (error) {
      throw isolationError(
        "Bubblewrap or the installed Codex package is unavailable.",
        error,
      );
    }
    const ptraceScope = Number.parseInt(
      (await readFile(this.ptraceScopePath, "utf8")).trim(),
      10,
    );
    if (!Number.isInteger(ptraceScope) || ptraceScope < 1) {
      throw isolationError(
        "Host ptrace protection must prevent a command from inspecting its App Server parent.",
      );
    }
    void (await loadSecureCodexAccessToken(this.options.authFilePath));
  }
}

async function resolveExecutable(
  command: string,
  environment: NodeJS.ProcessEnv,
): Promise<string> {
  if (isAbsolute(command)) {
    await access(command, constants.X_OK);
    return realpath(command);
  }
  for (const directory of (environment.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const candidate = join(directory, command);
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Continue to the next allow-listed PATH directory.
    }
  }
  throw isolationError("The Codex executable is not available on PATH.");
}

export async function createDefaultBubblewrapCodexLaunchBoundary(
  options: DefaultBubblewrapCodexLaunchBoundaryOptions = {},
): Promise<BubblewrapCodexLaunchBoundary> {
  const environment = options.environment ?? process.env;
  const executable = await resolveExecutable(
    options.command ?? "codex",
    environment,
  );
  if (!executable.endsWith("/bin/codex.js")) {
    throw isolationError(
      "The installed Codex executable does not resolve to the supported package layout.",
    );
  }
  const codexPackageRoot = dirname(dirname(executable));
  const codexHome = environment.CODEX_HOME?.trim() || join(homedir(), ".codex");
  return new BubblewrapCodexLaunchBoundary({
    authFilePath: options.authFilePath ?? join(codexHome, "auth.json"),
    bwrapPath: options.bwrapPath ?? "/usr/bin/bwrap",
    codexPackageRoot,
    ...(options.ptraceScopePath
      ? { ptraceScopePath: options.ptraceScopePath }
      : {}),
  });
}

export async function probeBubblewrapCredentialIsolation(
  options: BubblewrapCredentialIsolationProbeOptions,
): Promise<BubblewrapCredentialIsolationProbeResult> {
  requireAbsolute("Bubblewrap executable", options.bwrapPath);
  requireAbsolute("Generation workspace", options.workspace);
  if (options.hiddenPaths.length === 0) {
    throw isolationError(
      "The credential isolation probe requires at least one hidden host path.",
    );
  }
  for (const hiddenPath of options.hiddenPaths) {
    requireAbsolute("Hidden host path", hiddenPath);
  }
  const expectedWorkspaceEntry =
    options.expectedWorkspaceEntry ?? "approved.txt";
  if (!/^[A-Za-z0-9_.-]+$/.test(expectedWorkspaceEntry)) {
    throw isolationError(
      "The credential isolation marker must be a safe file name.",
    );
  }

  const args = [
    "--die-with-parent",
    "--new-session",
    "--unshare-user",
    "--unshare-pid",
    "--unshare-ipc",
    "--unshare-uts",
    "--unshare-cgroup-try",
    "--cap-drop",
    "ALL",
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
    "--dev",
    "/dev",
    "--proc",
    "/proc",
    "--ro-bind",
    "/dev/null",
    "/proc/1/environ",
    "--tmpfs",
    "/tmp",
    "--dir",
    GUEST_WORKSPACE,
    "--bind",
    options.workspace,
    GUEST_WORKSPACE,
    "--chdir",
    GUEST_WORKSPACE,
    "/usr/bin/bash",
    "--noprofile",
    "--norc",
    "-c",
    CREDENTIAL_PROBE_SCRIPT,
    "counterlab-credential-parent",
    expectedWorkspaceEntry,
    ...options.hiddenPaths,
  ];

  try {
    const { stdout } = await execFileAsync(options.bwrapPath, args, {
      env: {
        CODEX_ACCESS_TOKEN: options.accessToken,
        HOME: "/tmp",
        PATH: "/usr/bin",
      },
      maxBuffer: 4_096,
      timeout: 5_000,
    });
    const result = JSON.parse(stdout) as unknown;
    if (
      typeof result !== "object" ||
      result === null ||
      !("credentialEnvironmentHidden" in result) ||
      result.credentialEnvironmentHidden !== true ||
      !("hiddenPathsMissing" in result) ||
      result.hiddenPathsMissing !== true ||
      !("parentEnvironmentHidden" in result) ||
      result.parentEnvironmentHidden !== true ||
      !("workspaceEntryVisible" in result) ||
      result.workspaceEntryVisible !== true
    ) {
      throw new Error("Unexpected credential isolation probe response.");
    }
    return {
      credentialEnvironmentHidden: true,
      hiddenPathsMissing: true,
      parentEnvironmentHidden: true,
      workspaceEntryVisible: true,
    };
  } catch (error) {
    throw isolationError(
      "Bubblewrap could not prove Codex credential isolation.",
      error,
    );
  }
}
