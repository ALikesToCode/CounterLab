import { constants } from "node:fs";
import {
  access,
  chmod,
  chown,
  mkdir,
  mkdtemp,
  realpath,
  rm,
  stat,
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

export type ContainerCodexLaunchBoundaryOptions = {
  authJson: string;
  workspaceRoot: string;
  codexHomeRoot: string;
  codexExecutable: string;
  setprivExecutable: string;
  uid: number;
  gid: number;
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

export class ContainerCodexLaunchBoundary implements AppServerLaunchBoundary {
  private readonly parsedAuth: string;

  private get requiresPrivilegeDrop(): boolean {
    return (
      process.getuid?.() !== this.options.uid ||
      process.getgid?.() !== this.options.gid
    );
  }

  constructor(private readonly options: ContainerCodexLaunchBoundaryOptions) {
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
      !isAbsolute(this.options.codexExecutable) ||
      !isAbsolute(this.options.setprivExecutable)
    ) {
      return {
        available: false,
        reason: "Container Codex privilege and path configuration is invalid.",
      };
    }
    try {
      await Promise.all([
        access(this.options.codexExecutable, constants.X_OK),
        access(this.options.setprivExecutable, constants.X_OK),
        access(this.options.workspaceRoot, constants.R_OK | constants.W_OK),
        access(this.options.codexHomeRoot, constants.R_OK | constants.W_OK),
      ]);
      return { available: true };
    } catch {
      return {
        available: false,
        reason:
          "Container Codex executables or private directories are unavailable.",
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
        chmod(this.options.workspaceRoot, 0o711),
        chmod(this.options.codexHomeRoot, 0o711),
      ]);
      const rootModes = await Promise.all([
        stat(this.options.workspaceRoot),
        stat(this.options.codexHomeRoot),
      ]);
      for (const metadata of rootModes) {
        const mode = metadata.mode & 0o777;
        const ownerIsPrivate = (mode & 0o700) === 0o700 && (mode & 0o066) === 0;
        const alternateUidCanTraverse =
          !this.requiresPrivilegeDrop || (mode & 0o011) === 0o011;
        if (!ownerIsPrivate || !alternateUidCanTraverse) {
          throw isolationError(
            "Container Codex private roots did not retain the required traverse-only permissions.",
          );
        }
      }
    } catch (error) {
      if (error instanceof CompilerSetupError) throw error;
      throw isolationError(
        "Container Codex private roots cannot grant traverse-only access.",
        error,
      );
    }
    const workspaceRoot = await realpath(resolve(this.options.workspaceRoot));
    const workspace = await realpath(resolve(request.hostCwd));
    if (!isContained(workspaceRoot, workspace)) {
      throw isolationError(
        "Generation directory is outside the hosted runner workspace.",
      );
    }
    const codexHome = await mkdtemp(
      join(resolve(this.options.codexHomeRoot), "counterlab-codex-"),
    );
    const authPath = join(codexHome, "auth.json");
    const runtimeTemp = join(codexHome, "tmp");
    let disposed = false;
    let revoked = false;
    try {
      await chmod(codexHome, 0o700);
      await mkdir(runtimeTemp, { mode: 0o700 });
      await chmod(runtimeTemp, 0o700);
      await writeFile(authPath, this.parsedAuth, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await chmod(authPath, 0o600);
      if (this.requiresPrivilegeDrop) {
        await Promise.all([
          chown(codexHome, this.options.uid, this.options.gid),
          chown(runtimeTemp, this.options.uid, this.options.gid),
          chown(authPath, this.options.uid, this.options.gid),
          chown(workspace, this.options.uid, this.options.gid),
        ]);
      }
      await chmod(workspace, 0o700);
    } catch (error) {
      await rm(codexHome, { force: true, recursive: true });
      throw isolationError("Codex credential staging failed.", error);
    }

    const environment: NodeJS.ProcessEnv = {
      ...request.environment,
      HOME: codexHome,
      CODEX_HOME: codexHome,
      TMPDIR: runtimeTemp,
    };
    delete environment.CODEX_AUTH_JSON;
    delete environment.OPENAI_API_KEY;
    delete environment.CODEX_ACCESS_TOKEN;

    return {
      command: this.options.setprivExecutable,
      args: [
        ...(this.requiresPrivilegeDrop
          ? [
              `--reuid=${this.options.uid}`,
              `--regid=${this.options.gid}`,
              "--clear-groups",
            ]
          : []),
        "--no-new-privs",
        request.command,
        ...request.args,
        "--strict-config",
        "-c",
        "shell_environment_policy.inherit=none",
        "-c",
        CREDENTIAL_EXCLUSIONS,
      ],
      environment,
      protocolCwd: workspace,
      spawnCwd: workspace,
      async revokeCredentials() {
        if (revoked) return;
        revoked = true;
        await rm(authPath, { force: true });
      },
      async dispose() {
        if (disposed) return;
        disposed = true;
        await chmod(codexHome, 0o700).catch(() => undefined);
        await rm(codexHome, { force: true, recursive: true });
      },
    };
  }
}
