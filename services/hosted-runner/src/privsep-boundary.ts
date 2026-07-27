import { constants } from "node:fs";
import { access, lstat, readdir, realpath, stat } from "node:fs/promises";
import { connect } from "node:net";
import { isAbsolute, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import {
  CompilerSetupError,
  type AppServerLaunchBoundary,
  type AppServerLaunchBoundaryHealth,
  type AppServerLaunchRequest,
  type PreparedAppServerLaunch,
} from "@counterlab/codex-client";

import {
  isPathContained,
  PRIVSEP_PROTOCOL_VERSION,
  PrivsepProbeFailureError,
  PrivsepProbePayloadSchema,
  PrivsepResponseSchema,
  PRIVSEP_RUNNER_GID,
  PRIVSEP_RUNNER_UID,
  PRIVSEP_SOCKET_PATH,
  type PrivsepProbePayload,
  type PrivsepRequest,
} from "./privsep-protocol.js";

const MAX_RESPONSE_BYTES = 16_384;

export type PrivsepCodexLaunchBoundaryOptions = {
  workspaceRoot: string;
  codexExecutable: string;
  runnerNodeExecutable: string;
  clientBundle: string;
  socketPath?: string;
  connect?: typeof connect;
  uid?: number;
  gid?: number;
};

function isolationError(message: string, cause?: unknown): CompilerSetupError {
  return new CompilerSetupError("CODEX_ISOLATION_UNAVAILABLE", message, {
    ...(cause === undefined ? {} : { cause }),
  });
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
    if (metadata.isDirectory()) await assertWorkspaceEntriesBounded(path);
  }
}

function requestFor(
  operation: PrivsepRequest["operation"],
  fields: Record<string, unknown> = {},
): PrivsepRequest {
  return {
    protocolVersion: PRIVSEP_PROTOCOL_VERSION,
    requestId: randomUUID(),
    operation,
    ...fields,
  } as PrivsepRequest;
}

async function brokerRequest(
  socketPath: string,
  request: PrivsepRequest,
  connectSocket: typeof connect = connect,
): Promise<ReturnType<typeof PrivsepResponseSchema.parse>> {
  const socket = connectSocket({ path: socketPath });
  await new Promise<void>((resolveConnect, rejectConnect) => {
    socket.once("connect", resolveConnect);
    socket.once("error", rejectConnect);
  });
  socket.write(`${JSON.stringify(request)}\n`);
  return new Promise((resolveResponse, rejectResponse) => {
    let bytes = Buffer.alloc(0);
    socket.on("data", (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.byteLength > MAX_RESPONSE_BYTES) {
        socket.destroy();
        rejectResponse(new Error("privsep response exceeded its byte limit"));
      }
    });
    socket.once("error", rejectResponse);
    socket.once("close", () => {
      try {
        const response = PrivsepResponseSchema.parse(
          JSON.parse(bytes.toString("utf8").trim()) as unknown,
        );
        if (response.requestId !== request.requestId) {
          throw new Error("privsep response request id mismatch");
        }
        resolveResponse(response);
      } catch (error) {
        rejectResponse(error);
      }
    });
  });
}

export class PrivsepCodexLaunchBoundary implements AppServerLaunchBoundary {
  private readonly socketPath: string;
  private readonly uid: number;
  private readonly gid: number;

  constructor(private readonly options: PrivsepCodexLaunchBoundaryOptions) {
    this.socketPath = options.socketPath ?? PRIVSEP_SOCKET_PATH;
    this.uid = options.uid ?? PRIVSEP_RUNNER_UID;
    this.gid = options.gid ?? PRIVSEP_RUNNER_GID;
  }

  private request(request: PrivsepRequest) {
    return brokerRequest(this.socketPath, request, this.options.connect);
  }

  async health(): Promise<AppServerLaunchBoundaryHealth> {
    try {
      if (
        process.getuid?.() !== this.uid ||
        process.getgid?.() !== this.gid ||
        !isAbsolute(this.options.workspaceRoot) ||
        !isAbsolute(this.options.codexExecutable) ||
        !isAbsolute(this.options.runnerNodeExecutable) ||
        !isAbsolute(this.options.clientBundle) ||
        !isAbsolute(this.socketPath)
      ) {
        return {
          available: false,
          reason:
            "Privilege-separated Codex identity or path configuration is invalid.",
        };
      }
      const [workspaceRoot, runnerNode, clientBundle] = await Promise.all([
        realpath(this.options.workspaceRoot),
        realpath(this.options.runnerNodeExecutable),
        realpath(this.options.clientBundle),
      ]);
      if (
        resolve(this.options.codexExecutable) === workspaceRoot ||
        isPathContained(workspaceRoot, resolve(this.options.codexExecutable)) ||
        isPathContained(workspaceRoot, runnerNode) ||
        isPathContained(workspaceRoot, clientBundle)
      ) {
        return {
          available: false,
          reason:
            "Privilege-separated Codex executables must remain outside the writable workspace.",
        };
      }
      const socketMetadata = await stat(this.socketPath);
      if (
        !socketMetadata.isSocket() ||
        socketMetadata.uid !== 0 ||
        socketMetadata.gid !== this.gid ||
        (socketMetadata.mode & 0o777) !== 0o660
      ) {
        return {
          available: false,
          reason: "Privilege broker socket policy is invalid.",
        };
      }
      await Promise.all([
        access(workspaceRoot, constants.R_OK | constants.W_OK),
        access(runnerNode, constants.X_OK),
        access(clientBundle, constants.R_OK),
      ]);
      const response = await this.request(requestFor("health"));
      if (response.status !== "ok" || response.operation !== "health") {
        return {
          available: false,
          reason: "Privilege broker health request was rejected.",
        };
      }
      return { available: true };
    } catch {
      return {
        available: false,
        reason:
          "Privilege-separated Codex broker or fixed runtime paths are unavailable.",
      };
    }
  }

  async probe(): Promise<PrivsepProbePayload> {
    const response = await this.request(requestFor("probe"));
    if (response.status !== "ok" || response.operation !== "probe") {
      if (
        response.status === "error" &&
        response.code === "BROKER_FAILURE" &&
        response.probeFailure !== undefined
      ) {
        throw new PrivsepProbeFailureError(response.probeFailure);
      }
      throw isolationError("Privilege broker isolation probe was rejected.");
    }
    return PrivsepProbePayloadSchema.parse(response.payload);
  }

  async prepare(
    request: AppServerLaunchRequest,
  ): Promise<PreparedAppServerLaunch> {
    const health = await this.health();
    if (!health.available) throw isolationError(health.reason);
    try {
      const [workspaceRoot, workspace] = await Promise.all([
        realpath(resolve(this.options.workspaceRoot)),
        realpath(resolve(request.hostCwd)),
      ]);
      if (!isPathContained(workspaceRoot, workspace)) {
        throw isolationError(
          "Generation directory is outside the hosted runner workspace.",
        );
      }
      const metadata = await lstat(resolve(request.hostCwd));
      if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
        throw isolationError(
          "Generation directory must be a direct directory.",
        );
      }
      if (resolve(request.command) !== resolve(this.options.codexExecutable)) {
        throw isolationError(
          "The requested Codex executable does not match the configured executable.",
        );
      }
      if (
        request.args.length !== 2 ||
        request.args[0] !== "app-server" ||
        request.args[1] !== "--stdio"
      ) {
        throw isolationError(
          "Privilege broker accepts only the pinned Codex App Server invocation.",
        );
      }
      await assertWorkspaceEntriesBounded(workspace);
      const prepared = await this.request(
        requestFor("prepare", {
          workspace,
          appServerArgs: ["app-server", "--stdio"],
        }),
      );
      if (
        prepared.status !== "ok" ||
        prepared.operation !== "prepare" ||
        prepared.launchId === undefined
      ) {
        throw isolationError("Privilege broker rejected Codex preparation.");
      }
      const launchId = prepared.launchId;
      const socketPath = this.socketPath;
      const connectSocket = this.options.connect;
      let revoked = false;
      let disposed = false;
      return {
        command: this.options.runnerNodeExecutable,
        args: [this.options.clientBundle, launchId],
        environment: {
          LANG: "C.UTF-8",
          PATH: "/usr/local/bin:/usr/bin",
        },
        protocolCwd: workspace,
        spawnCwd: workspace,
        async revokeCredentials() {
          if (revoked) return;
          const response = await brokerRequest(
            socketPath,
            requestFor("revoke", { launchId }),
            connectSocket,
          );
          if (response.status !== "ok" || response.operation !== "revoke") {
            throw isolationError(
              "Privilege broker could not revoke the staged credential.",
            );
          }
          revoked = true;
        },
        async dispose() {
          if (disposed) return;
          const response = await brokerRequest(
            socketPath,
            requestFor("dispose", { launchId }),
            connectSocket,
          );
          if (response.status !== "ok" || response.operation !== "dispose") {
            throw isolationError(
              "Privilege broker could not dispose the Codex launch.",
            );
          }
          disposed = true;
        },
      };
    } catch (error) {
      if (error instanceof CompilerSetupError) throw error;
      throw isolationError(
        "Privilege-separated Codex preparation failed.",
        error,
      );
    }
  }
}
