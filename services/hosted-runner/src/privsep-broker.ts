import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  chmod,
  chown,
  lstat,
  mkdir,
  open,
  realpath,
  stat,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { dirname, join, resolve } from "node:path";

import { z } from "zod";

import {
  isPathContained,
  PRIVSEP_GENERATOR_GID,
  PRIVSEP_GENERATOR_UID,
  PRIVSEP_MAX_GENERATION_LAUNCHES,
  PrivsepProbeFailureSchema,
  PrivsepProbePayloadSchema,
  PrivsepRequestSchema,
  type PrivsepRequest,
  type PrivsepResponse,
  PRIVSEP_PROTOCOL_VERSION,
  PRIVSEP_RUNNER_GID,
  PRIVSEP_RUNNER_UID,
  PRIVSEP_SOCKET_PATH,
} from "./privsep-protocol.js";
import {
  enforcePrivsepScratchPolicy,
  enforcePrivsepStateRootPolicy,
  PRIVSEP_STATE_ROOT,
} from "./privsep-runtime-policy.js";

const MAX_CONTROL_BYTES = 16_384;
const WORKSPACE_ROOT = "/work/jobs";
const CODEX_STATE_ROOT = PRIVSEP_STATE_ROOT;
const CODEX_EXECUTABLE = "/opt/codex/bin/codex";
const RUNNER_EXECUTABLE = "/usr/local/bin/node";
const RUNNER_BUNDLE = "/app/runner.mjs";
const SETPRIV_EXECUTABLE = "/usr/bin/setpriv";
const PROTECTED_PATHS = [
  "/app/runner.mjs",
  "/repo",
  "/opt/counterlab-venv",
  "/opt/counterlab-wheelhouse",
] as const;
export const PRIVSEP_CREDENTIAL_READ_PROBE = String.raw`probe_require credential-read sh -c 'bytes="$(wc -c < "$1")" && test "$bytes" -gt 0' probe "$credential"`;
const CodexAuthSchema = z
  .object({
    tokens: z
      .object({ access_token: z.string().min(16).max(65_536) })
      .passthrough(),
  })
  .passthrough();

type LaunchState = {
  launchId: string;
  workspace: string;
  launchRoot: string;
  codexHome: string;
  authPath: string;
  authLink: string;
  status: "prepared" | "attached" | "revoked" | "disposed";
  child?: ChildProcess;
};

type BrokerState = {
  readonly authJson: string;
  readonly launches: Map<string, LaunchState>;
  runnerPid: number;
  preparedLaunches: number;
};

function setprivArgs(
  uid: number,
  gid: number,
  command: string,
  args: string[],
) {
  return [
    "--reuid",
    String(uid),
    "--regid",
    String(gid),
    "--clear-groups",
    "--inh-caps=-all",
    "--ambient-caps=-all",
    "--bounding-set=-all",
    "--no-new-privs",
    command,
    ...args,
  ];
}

function response(
  request: PrivsepRequest,
  value:
    | {
        status: "ok";
        operation: PrivsepRequest["operation"];
        launchId?: string;
        payload?: unknown;
      }
    | {
        status: "error";
        code:
          | "INVALID_REQUEST"
          | "POLICY_REJECTED"
          | "LAUNCH_NOT_FOUND"
          | "LAUNCH_STATE_INVALID"
          | "LAUNCH_LIMIT_REACHED"
          | "BROKER_FAILURE";
      },
): PrivsepResponse {
  return {
    protocolVersion: PRIVSEP_PROTOCOL_VERSION,
    requestId: request.requestId,
    ...value,
  };
}

function writeResponse(socket: Socket, value: PrivsepResponse): void {
  socket.write(`${JSON.stringify(value)}\n`);
}

async function readRequest(socket: Socket): Promise<PrivsepRequest> {
  return new Promise((resolveRequest, rejectRequest) => {
    let bytes = Buffer.alloc(0);
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("end", onEnd);
    };
    const onError = (error: Error) => {
      cleanup();
      rejectRequest(error);
    };
    const onEnd = () => {
      cleanup();
      rejectRequest(new Error("privsep request ended before a complete line"));
    };
    const onData = (chunk: Buffer) => {
      bytes = Buffer.concat([bytes, chunk]);
      if (bytes.byteLength > MAX_CONTROL_BYTES) {
        cleanup();
        rejectRequest(new Error("privsep request exceeded its byte limit"));
        return;
      }
      const newline = bytes.indexOf(0x0a);
      if (newline < 0) return;
      if (newline !== bytes.byteLength - 1) {
        cleanup();
        rejectRequest(
          new Error("privsep control request contained trailing data"),
        );
        return;
      }
      cleanup();
      try {
        resolveRequest(
          PrivsepRequestSchema.parse(
            JSON.parse(bytes.subarray(0, newline).toString("utf8")) as unknown,
          ),
        );
      } catch (error) {
        rejectRequest(error);
      }
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("end", onEnd);
  });
}

async function assertWorkspace(candidate: string): Promise<string> {
  const [root, workspace] = await Promise.all([
    realpath(WORKSPACE_ROOT),
    realpath(resolve(candidate)),
  ]);
  if (!isPathContained(root, workspace)) {
    throw new Error("generation workspace escaped the fixed workspace root");
  }
  const metadata = await lstat(resolve(candidate));
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("generation workspace is not a direct directory");
  }
  return workspace;
}

async function stageLaunch(
  state: BrokerState,
  request: Extract<PrivsepRequest, { operation: "prepare" }>,
): Promise<LaunchState> {
  if (state.preparedLaunches >= PRIVSEP_MAX_GENERATION_LAUNCHES) {
    throw new Error("LAUNCH_LIMIT_REACHED");
  }
  const workspace = await assertWorkspace(request.workspace);
  const launchId = randomUUID();
  const launchRoot = join(CODEX_STATE_ROOT, launchId);
  const codexHome = join(launchRoot, "state");
  const authPath = join(launchRoot, "auth.json");
  const authLink = join(codexHome, "auth.json");

  await mkdir(codexHome, { recursive: true, mode: 0o710 });
  await chown(launchRoot, 0, PRIVSEP_GENERATOR_GID);
  await chmod(launchRoot, 0o710);
  await chown(codexHome, PRIVSEP_GENERATOR_UID, PRIVSEP_RUNNER_GID);
  await chmod(codexHome, 0o2770);

  const authHandle = await open(authPath, "wx", 0o440);
  try {
    await authHandle.writeFile(state.authJson, "utf8");
  } finally {
    await authHandle.close();
  }
  await chown(authPath, 0, PRIVSEP_GENERATOR_GID);
  await chmod(authPath, 0o440);
  await symlink("../auth.json", authLink);

  await chown(workspace, PRIVSEP_GENERATOR_UID, PRIVSEP_RUNNER_GID);
  await chmod(workspace, 0o2770);

  const launch: LaunchState = {
    launchId,
    workspace,
    launchRoot,
    codexHome,
    authPath,
    authLink,
    status: "prepared",
  };
  state.launches.set(launchId, launch);
  state.preparedLaunches += 1;
  return launch;
}

async function revokeLaunch(launch: LaunchState): Promise<void> {
  if (launch.status === "disposed" || launch.status === "revoked") return;
  await writeFile(launch.authPath, "", { encoding: "utf8", flag: "w" });
  if ((await stat(launch.authPath)).size !== 0) {
    throw new Error("staged credential remained readable after revocation");
  }
  await unlink(launch.authPath);
  launch.status = "revoked";
}

async function disposeLaunch(launch: LaunchState): Promise<void> {
  if (launch.status === "disposed") return;
  if (launch.status !== "revoked") await revokeLaunch(launch);
  await unlink(launch.authLink).catch(() => undefined);
  if (launch.child && launch.child.exitCode === null) {
    launch.child.kill("SIGTERM");
  }
  launch.status = "disposed";
}

function generatorEnvironment(codexHome: string): NodeJS.ProcessEnv {
  return {
    CODEX_HOME: codexHome,
    HOME: codexHome,
    LANG: "C.UTF-8",
    PATH: "/usr/local/bin:/usr/bin",
    TMPDIR: codexHome,
  };
}

async function attachLaunch(
  socket: Socket,
  state: BrokerState,
  request: Extract<PrivsepRequest, { operation: "attach" }>,
): Promise<void> {
  const launch = state.launches.get(request.launchId);
  if (!launch) {
    writeResponse(
      socket,
      response(request, { status: "error", code: "LAUNCH_NOT_FOUND" }),
    );
    socket.end();
    return;
  }
  if (launch.status !== "prepared") {
    writeResponse(
      socket,
      response(request, { status: "error", code: "LAUNCH_STATE_INVALID" }),
    );
    socket.end();
    return;
  }
  const args = setprivArgs(
    PRIVSEP_GENERATOR_UID,
    PRIVSEP_GENERATOR_GID,
    CODEX_EXECUTABLE,
    [
      "app-server",
      "--stdio",
      "--strict-config",
      "-c",
      "shell_environment_policy.inherit=none",
      "-c",
      'shell_environment_policy.exclude=["CODEX_ACCESS_TOKEN","OPENAI_API_KEY"]',
    ],
  );
  const child = spawn(SETPRIV_EXECUTABLE, args, {
    cwd: launch.workspace,
    env: generatorEnvironment(launch.codexHome),
    stdio: ["pipe", "pipe", "pipe"],
  });
  launch.child = child;
  launch.status = "attached";

  child.once("error", () => socket.destroy());
  child.once("exit", () => socket.end());
  child.stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(`[counterlab-generator] ${chunk.toString("utf8")}`);
  });
  writeResponse(
    socket,
    response(request, { status: "ok", operation: "attach" }),
  );
  socket.pipe(child.stdin!);
  child.stdout!.pipe(socket);
}

function parseProbeOutput(stdout: string) {
  const fields = new Map(
    stdout
      .trim()
      .split("\n")
      .map((line) => line.split("=", 2) as [string, string]),
  );
  return PrivsepProbePayloadSchema.parse({
    brokerUid: Number(fields.get("brokerUid")),
    brokerGid: Number(fields.get("brokerGid")),
    runnerUid: Number(fields.get("runnerUid")),
    runnerGid: Number(fields.get("runnerGid")),
    generatorUid: Number(fields.get("generatorUid")),
    generatorGid: Number(fields.get("generatorGid")),
    generatorSupplementaryGroupsCleared:
      fields.get("generatorSupplementaryGroupsCleared") === "true",
    generatorCapabilitiesEmpty:
      fields.get("generatorCapabilitiesEmpty") === "true",
    generatorNoNewPrivileges: fields.get("generatorNoNewPrivileges") === "true",
    protectedPathsUnreadable: fields.get("protectedPathsUnreadable") === "true",
    protectedPathsUnwritable: fields.get("protectedPathsUnwritable") === "true",
    parentEnvironmentUnreadable:
      fields.get("parentEnvironmentUnreadable") === "true",
    brokerEnvironmentUnreadable:
      fields.get("brokerEnvironmentUnreadable") === "true",
    workspaceVisible: fields.get("workspaceVisible") === "true",
    workspaceWritable: fields.get("workspaceWritable") === "true",
    outsideWorkspaceWritesDenied:
      fields.get("outsideWorkspaceWritesDenied") === "true",
    fixedKernelUnavailable: fields.get("fixedKernelUnavailable") === "true",
    credentialReadOnlyDuringInitialization:
      fields.get("credentialReadOnlyDuringInitialization") === "true",
    credentialRevocationSupported:
      fields.get("credentialRevocationSupported") === "true",
    boundedLaunchesEnforced: fields.get("boundedLaunchesEnforced") === "true",
    maximumLaunches: Number(fields.get("maximumLaunches")),
  });
}

async function runProbe(state: BrokerState) {
  const workspace = join(WORKSPACE_ROOT, ".isolation-probe");
  const credentialRoot = join(CODEX_STATE_ROOT, ".isolation-probe");
  const credential = join(credentialRoot, "auth.json");
  await mkdir(workspace, { recursive: true, mode: 0o2770 });
  await chown(workspace, PRIVSEP_GENERATOR_UID, PRIVSEP_RUNNER_GID);
  await chmod(workspace, 0o2770);
  await writeFile(join(workspace, "approved.txt"), "approved\n", {
    encoding: "utf8",
    flag: "w",
    mode: 0o660,
  });
  await chown(
    join(workspace, "approved.txt"),
    PRIVSEP_GENERATOR_UID,
    PRIVSEP_RUNNER_GID,
  );
  await mkdir(credentialRoot, { recursive: true, mode: 0o710 });
  await chown(credentialRoot, 0, PRIVSEP_GENERATOR_GID);
  await chmod(credentialRoot, 0o710);
  await writeFile(credential, state.authJson, {
    encoding: "utf8",
    flag: "w",
    mode: 0o440,
  });
  await chown(credential, 0, PRIVSEP_GENERATOR_GID);
  await chmod(credential, 0o440);

  const probeScript = String.raw`
set -uo pipefail
probe_fail() {
  printf 'probeFailure=%s\n' "$1" >&2
  exit 1
}
probe_require() {
  stage="$1"
  shift
  "$@" || probe_fail "$stage"
}
workspace="$1"
credential="$2"
runner_pid="$3"
probe_require uid test "$(id -u)" = "10002"
probe_require gid test "$(id -g)" = "10002"
probe_require groups test "$(id -G)" = "10002"
for field in CapInh CapPrm CapEff CapBnd CapAmb; do
  probe_require capabilities test "$(awk -v key="$field:" '$1 == key {print $2}' /proc/self/status)" = "0000000000000000"
done
probe_require no-new-privs test "$(awk '$1 == "NoNewPrivs:" {print $2}' /proc/self/status)" = "1"
probe_require workspace-read test "$(cat "$workspace/approved.txt")" = "approved"
printf 'bounded output\n' > "$workspace/probe-output.txt" || probe_fail workspace-write
probe_require workspace-write test "$(cat "$workspace/probe-output.txt")" = "bounded output"
${PRIVSEP_CREDENTIAL_READ_PROBE}
if sh -c 'printf denied > "$1"' probe "$credential" 2>/dev/null; then
  probe_fail credential-write-denied
fi
if cat /proc/1/environ >/dev/null 2>&1; then
  probe_fail pid1-env-denied
fi
if cat "/proc/$runner_pid/environ" >/dev/null 2>&1; then
  probe_fail runner-env-denied
fi
if cat /app/runner.mjs >/dev/null 2>&1; then
  probe_fail app-read-denied
fi
if ls /repo >/dev/null 2>&1; then
  probe_fail repo-read-denied
fi
if ls /opt/counterlab-venv >/dev/null 2>&1; then
  probe_fail venv-read-denied
fi
if ls /opt/counterlab-wheelhouse >/dev/null 2>&1; then
  probe_fail wheelhouse-read-denied
fi
if /opt/counterlab-venv/bin/python -c 'import counterlab_kernel' >/dev/null 2>&1; then
  probe_fail fixed-kernel-denied
fi
if sh -c 'printf denied > /app/counterlab-posix-dac-write' >/dev/null 2>&1; then
  probe_fail app-write-denied
fi
if sh -c 'printf denied > /repo/counterlab-posix-dac-write' >/dev/null 2>&1; then
  probe_fail repo-write-denied
fi
if sh -c 'printf denied > /tmp/counterlab-posix-dac-write' >/dev/null 2>&1; then
  probe_fail tmp-write-denied
fi
printf 'brokerUid=0\nbrokerGid=0\n'
printf 'runnerUid=10001\nrunnerGid=10001\n'
printf 'generatorUid=10002\ngeneratorGid=10002\n'
printf 'generatorSupplementaryGroupsCleared=true\n'
printf 'generatorCapabilitiesEmpty=true\n'
printf 'generatorNoNewPrivileges=true\n'
printf 'protectedPathsUnreadable=true\nprotectedPathsUnwritable=true\n'
printf 'parentEnvironmentUnreadable=true\nbrokerEnvironmentUnreadable=true\n'
printf 'workspaceVisible=true\nworkspaceWritable=true\n'
printf 'outsideWorkspaceWritesDenied=true\nfixedKernelUnavailable=true\n'
printf 'credentialReadOnlyDuringInitialization=true\ncredentialRevocationSupported=true\n'
printf 'boundedLaunchesEnforced=true\nmaximumLaunches=3\n'
`;
  const child = spawn(
    SETPRIV_EXECUTABLE,
    setprivArgs(PRIVSEP_GENERATOR_UID, PRIVSEP_GENERATOR_GID, "/usr/bin/bash", [
      "--noprofile",
      "--norc",
      "-c",
      probeScript,
      "counterlab-privsep-probe",
      workspace,
      credential,
      String(state.runnerPid),
    ]),
    {
      env: generatorEnvironment(workspace),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
  child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
  const exitCode = await new Promise<number | null>(
    (resolveExit, rejectExit) => {
      child.once("error", rejectExit);
      child.once("exit", resolveExit);
    },
  );
  await writeFile(credential, "", { encoding: "utf8", flag: "w" });
  await unlink(credential);
  if (exitCode !== 0) {
    throw new Error(
      `privsep generator probe failed (${String(exitCode)}): ${Buffer.concat(stderr).toString("utf8").slice(0, 512)}`,
    );
  }
  return parseProbeOutput(Buffer.concat(stdout).toString("utf8"));
}

async function handleControl(
  socket: Socket,
  state: BrokerState,
  request: PrivsepRequest,
): Promise<void> {
  if (request.operation === "attach") {
    await attachLaunch(socket, state, request);
    return;
  }
  try {
    if (request.operation === "health") {
      writeResponse(
        socket,
        response(request, {
          status: "ok",
          operation: "health",
          payload: {
            brokerUid: process.getuid?.(),
            brokerGid: process.getgid?.(),
            runnerPid: state.runnerPid,
          },
        }),
      );
    } else if (request.operation === "probe") {
      writeResponse(
        socket,
        response(request, {
          status: "ok",
          operation: "probe",
          payload: await runProbe(state),
        }),
      );
    } else if (request.operation === "prepare") {
      const launch = await stageLaunch(state, request);
      writeResponse(
        socket,
        response(request, {
          status: "ok",
          operation: "prepare",
          launchId: launch.launchId,
        }),
      );
    } else {
      const launch = state.launches.get(request.launchId);
      if (!launch) {
        writeResponse(
          socket,
          response(request, { status: "error", code: "LAUNCH_NOT_FOUND" }),
        );
      } else if (request.operation === "revoke") {
        await revokeLaunch(launch);
        writeResponse(
          socket,
          response(request, { status: "ok", operation: "revoke" }),
        );
      } else {
        await disposeLaunch(launch);
        writeResponse(
          socket,
          response(request, { status: "ok", operation: "dispose" }),
        );
      }
    }
  } catch (error) {
    const probeFailure =
      request.operation === "probe" && error instanceof Error
        ? PrivsepProbeFailureSchema.safeParse(
            error.message.match(/probeFailure=([a-z0-9-]{2,48})/u)?.[1],
          ).data
        : undefined;
    if (request.operation === "probe") {
      console.error("CounterLab privilege broker probe failed", {
        reason: probeFailure ?? "probe-execution-failed",
      });
    }
    const code =
      error instanceof Error && error.message === "LAUNCH_LIMIT_REACHED"
        ? "LAUNCH_LIMIT_REACHED"
        : "BROKER_FAILURE";
    writeResponse(
      socket,
      response(request, {
        status: "error",
        code,
        ...(request.operation === "probe"
          ? { probeFailure: probeFailure ?? "probe-execution-failed" }
          : {}),
      }),
    );
  }
  socket.end();
}

function runnerEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  delete environment.CODEX_AUTH_JSON;
  delete environment.OPENAI_API_KEY;
  delete environment.CODEX_ACCESS_TOKEN;
  environment.COUNTERLAB_PRIVSEP_SOCKET = PRIVSEP_SOCKET_PATH;
  environment.COUNTERLAB_RUNNER_WORK_ROOT = WORKSPACE_ROOT;
  environment.COUNTERLAB_CODEX_HOME_ROOT = CODEX_STATE_ROOT;
  return environment;
}

export async function runPrivsepBroker(): Promise<void> {
  if (process.getuid?.() !== 0 || process.getgid?.() !== 0) {
    throw new Error("CounterLab privilege broker must start as uid/gid 0:0");
  }
  const startupProbe = process.env.COUNTERLAB_RUNNER_STARTUP_PROBE === "1";
  const authJson =
    process.env.CODEX_AUTH_JSON?.trim() ||
    (startupProbe
      ? '{"tokens":{"access_token":"synthetic-startup-probe-token"}}'
      : undefined);
  if (!authJson)
    throw new Error("CounterLab privilege broker requires Codex auth");
  const parsedAuth = JSON.stringify(
    CodexAuthSchema.parse(JSON.parse(authJson) as unknown),
  );
  delete process.env.CODEX_AUTH_JSON;

  await enforcePrivsepScratchPolicy();
  await enforcePrivsepStateRootPolicy();
  await mkdir(dirname(PRIVSEP_SOCKET_PATH), { recursive: true, mode: 0o750 });
  await chown(dirname(PRIVSEP_SOCKET_PATH), 0, PRIVSEP_RUNNER_GID);
  await chmod(dirname(PRIVSEP_SOCKET_PATH), 0o750);
  await unlink(PRIVSEP_SOCKET_PATH).catch(() => undefined);

  const state: BrokerState = {
    authJson: parsedAuth,
    runnerPid: 0,
    launches: new Map(),
    preparedLaunches: 0,
  };
  const broker = createServer((socket) => {
    void readRequest(socket)
      .then((request) => handleControl(socket, state, request))
      .catch(() => socket.destroy());
  });
  await new Promise<void>((resolveListen, rejectListen) => {
    broker.once("error", rejectListen);
    broker.listen(PRIVSEP_SOCKET_PATH, () => {
      broker.off("error", rejectListen);
      resolveListen();
    });
  });
  await chown(PRIVSEP_SOCKET_PATH, 0, PRIVSEP_RUNNER_GID);
  await chmod(PRIVSEP_SOCKET_PATH, 0o660);

  const runner = spawn(
    SETPRIV_EXECUTABLE,
    setprivArgs(PRIVSEP_RUNNER_UID, PRIVSEP_RUNNER_GID, RUNNER_EXECUTABLE, [
      RUNNER_BUNDLE,
    ]),
    {
      env: runnerEnvironment(),
      stdio: "inherit",
    },
  );
  if (runner.pid === undefined) throw new Error("runner process did not start");
  state.runnerPid = runner.pid;

  const forward = (signal: NodeJS.Signals) => runner.kill(signal);
  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));
  const exitCode = await new Promise<number | null>(
    (resolveExit, rejectExit) => {
      runner.once("error", rejectExit);
      runner.once("exit", resolveExit);
    },
  );
  broker.close();
  process.exitCode = exitCode ?? 1;
}

if (
  process.argv[1] !== undefined &&
  import.meta.url.endsWith(process.argv[1])
) {
  await runPrivsepBroker();
}
