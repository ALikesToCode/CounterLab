#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  chmodSync,
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect, createServer } from "node:net";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createContainedRuntimeEnvironment } from "./contained-runtime-environment.mjs";
import {
  canonicalSupervisorJson,
  parseSupervisorRequest,
  sha256SupervisorBytes,
  validateRuntimeDrainReceipt,
} from "./contained-runtime-supervisor-protocol.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const args = process.argv.slice(2);
if (
  args.length !== 2 ||
  args[0] !== "--session-id" ||
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(args[1] ?? "")
) {
  throw new Error("Usage: contained-runtime-supervisor --session-id ID");
}

const sessionId = args[1];
const sessionRoot = resolve(root, ".rt", sessionId);
const fromRoot = relative(root, sessionRoot);
if (
  fromRoot.startsWith("..") ||
  lstatSync(sessionRoot).isSymbolicLink() ||
  realpathSync(sessionRoot) !== sessionRoot ||
  !statSync(sessionRoot).isDirectory() ||
  (statSync(sessionRoot).mode & 0o777) !== 0o700
) {
  throw new Error("runtime supervisor session root is invalid");
}

const installRoot = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
);
const binRoot = resolve(installRoot, "bin");
const runRoot = resolve(sessionRoot, "run");
const innerRunRoot = resolve(runRoot, "inner");
const supervisorSocket = resolve(runRoot, "runtime-supervisor.sock");
const readyPath = resolve(runRoot, "runtime-supervisor-ready.json");
const buildkitProxySocket = resolve(runRoot, "buildkitd.sock");
const buildkitInnerSocket = resolve(innerRunRoot, "buildkitd.sock");
const runtimeCommandSocket = resolve(runRoot, "runtime-command.sock");
const containerdSocket = resolve(runRoot, "containerd.sock");
const containerdRootlesskitApi = resolve(
  runRoot,
  "containerd-rootless/api.sock",
);
const attestationPath = resolve(sessionRoot, "attestation.json");
const buildkitConfig = resolve(sessionRoot, "config/buildkitd.toml");

const environment = createContainedRuntimeEnvironment({
  auth: resolve(sessionRoot, "auth"),
  binRoot,
  buildkitSocket: buildkitProxySocket,
  home: resolve(sessionRoot, "home"),
  runcBinary: resolve(binRoot, "runc"),
  runcStateRoot: resolve(runRoot, "runc"),
  runtimeWrapperRoot: resolve(root, "scripts/runtime-bin"),
  tmp: resolve(sessionRoot, "tmp"),
  xdgCache: resolve(sessionRoot, "xdg-cache"),
  xdgConfig: resolve(sessionRoot, "xdg-config"),
  xdgData: resolve(sessionRoot, "xdg-data"),
  xdgRuntime: innerRunRoot,
});

function openPrivateLog(name) {
  return openSync(resolve(sessionRoot, "logs", name), "a", 0o600);
}

function socketReady(path) {
  try {
    return statSync(path).isSocket();
  } catch {
    return false;
  }
}

async function waitForInitialSocket(path, child, label) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (socketReady(path)) return;
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${label} exited during launch`);
    }
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error(`${label} socket did not become ready`);
}

const buildkitLog = openPrivateLog("buildkitd.log");
const buildkitRootlesskit = spawn(
  resolve(binRoot, "rootlesskit"),
  [
    `--state-dir=${resolve(runRoot, "buildkit-rootless")}`,
    "--net=host",
    "--propagation=rslave",
    resolve(binRoot, "buildkitd"),
    "--config",
    buildkitConfig,
    "--root",
    resolve(sessionRoot, "data/buildkit"),
    "--addr",
    `unix://${buildkitInnerSocket}`,
    "--oci-worker=true",
    "--oci-worker-rootless",
    "--oci-worker-no-process-sandbox",
    "--oci-worker-snapshotter=native",
    "--oci-worker-net=host",
    `--oci-worker-binary=${resolve(binRoot, "runc")}`,
    "--oci-max-parallelism=2",
    "--containerd-worker=false",
    "--cdi-disabled",
  ],
  {
    cwd: root,
    env: environment,
    stdio: ["ignore", buildkitLog, buildkitLog],
  },
);
closeSync(buildkitLog);
await waitForInitialSocket(
  buildkitInnerSocket,
  buildkitRootlesskit,
  "contained BuildKit",
);

const containerdLog = openPrivateLog("containerd.log");
const containerdRootlesskit = spawn(
  resolve(binRoot, "rootlesskit"),
  [
    `--state-dir=${resolve(runRoot, "containerd-rootless")}`,
    "--net=host",
    "--pidns",
    "--cgroupns",
    "--evacuate-cgroup2=containerd",
    process.execPath,
    resolve(root, "scripts/contained-runtime-server.mjs"),
    "--session-id",
    sessionId,
  ],
  {
    cwd: root,
    env: environment,
    stdio: ["ignore", containerdLog, containerdLog],
  },
);
closeSync(containerdLog);

const children = { containerdRootlesskit, buildkitRootlesskit };
let state = "STARTING";
let expectedAttestationSha256;
let buildkitAdmissionOpen = false;
const buildkitConnections = new Set();
let expectedShutdown = false;
let operation = Promise.resolve();

function childPids() {
  const values = {
    containerdRootlesskit: containerdRootlesskit.pid,
    buildkitRootlesskit: buildkitRootlesskit.pid,
  };
  if (
    Object.values(values).some(
      (value) => !Number.isSafeInteger(value) || value <= 1,
    )
  ) {
    throw new Error("runtime supervisor child handle has no valid PID");
  }
  return values;
}

async function waitForSockets(paths) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (paths.every(socketReady)) return;
    if (
      Object.values(children).some(
        (child) => child.exitCode !== null || child.signalCode !== null,
      )
    ) {
      throw new Error("contained runtime child exited during launch");
    }
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error("contained runtime child sockets did not become ready");
}

function verifyAttestationHash(requested) {
  if (!/^[a-f0-9]{64}$/u.test(requested ?? "")) {
    throw new Error("runtime supervisor attestation identity is invalid");
  }
  const metadata = lstatSync(attestationPath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o022) !== 0 ||
    metadata.size < 1 ||
    metadata.size > 1_048_576 ||
    sha256SupervisorBytes(readFileSync(attestationPath)) !== requested
  ) {
    throw new Error("runtime supervisor attestation binding changed");
  }
  if (
    expectedAttestationSha256 !== undefined &&
    expectedAttestationSha256 !== requested
  ) {
    throw new Error("runtime supervisor attestation identity changed");
  }
  expectedAttestationSha256 = requested;
}

const buildkitProxy = createServer((downstream) => {
  downstream.on("error", () => undefined);
  if (state !== "ACTIVE" || !buildkitAdmissionOpen) {
    downstream.destroy(new Error("contained BuildKit admission is closed"));
    return;
  }
  const upstream = connect(buildkitInnerSocket);
  const pair = { downstream, upstream };
  buildkitConnections.add(pair);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    buildkitConnections.delete(pair);
    downstream.destroy();
    upstream.destroy();
  };
  downstream.once("error", release);
  downstream.once("close", release);
  upstream.once("error", release);
  upstream.once("close", release);
  downstream.pipe(upstream);
  upstream.pipe(downstream);
});

async function closeBuildkitAdmission() {
  if (!buildkitAdmissionOpen) return;
  buildkitAdmissionOpen = false;
  buildkitProxy.close();
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (buildkitConnections.size === 0) return;
    await new Promise((accept) => setTimeout(accept, 100));
  }
  throw new Error("active BuildKit clients did not drain");
}

function statusResponse(status) {
  return {
    schemaVersion: "1",
    status,
    sessionId,
    namespace: "counterlab-v6.1",
    state,
    supervisorPid: process.pid,
    childPids: childPids(),
    childHandlesOwned: true,
    buildkitAdmissionOpen,
    activeBuildkitConnections: buildkitConnections.size,
    attestationSha256: expectedAttestationSha256,
  };
}

function waitForChildExit(child, name) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  }
  return new Promise((accept, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${name} did not stop after SIGTERM`)),
      30_000,
    );
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      accept({ code, signal });
    });
  });
}

async function shutdownOwnedChildren() {
  expectedShutdown = true;
  for (const child of Object.values(children)) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
  }
  const [containerdExit, buildkitExit] = await Promise.all([
    waitForChildExit(containerdRootlesskit, "containerd rootlesskit"),
    waitForChildExit(buildkitRootlesskit, "BuildKit rootlesskit"),
  ]);
  return {
    containerdRootlesskit: containerdExit,
    buildkitRootlesskit: buildkitExit,
  };
}

async function handleRequest(request) {
  verifyAttestationHash(request.attestationSha256);
  if (request.action === "status") {
    if (state !== "ACTIVE") {
      throw new Error("runtime supervisor is not active");
    }
    return statusResponse("ACTIVE");
  }
  if (request.action === "begin-drain") {
    if (state === "ACTIVE") state = "DRAINING";
    if (state !== "DRAINING") {
      throw new Error("runtime supervisor cannot begin drain in this state");
    }
    await closeBuildkitAdmission();
    return statusResponse("DRAINING");
  }
  if (request.action === "shutdown") {
    if (state !== "DRAINING" || buildkitConnections.size !== 0) {
      throw new Error("runtime supervisor shutdown was requested before drain");
    }
    const drainReceipt = validateRuntimeDrainReceipt(request.drainReceipt, {
      sessionId,
      attestationSha256: request.attestationSha256,
    });
    const childExits = await shutdownOwnedChildren();
    state = "DRAINED";
    state = "STOPPED";
    return {
      ...statusResponse("STOPPED"),
      buildkitAdmissionOpen: false,
      activeBuildkitConnections: 0,
      childExits,
      drainReceiptSha256: sha256SupervisorBytes(
        canonicalSupervisorJson(drainReceipt),
      ),
    };
  }
  throw new Error("runtime supervisor action is invalid");
}

const controlServer = createServer({ allowHalfOpen: true }, (socket) => {
  const chunks = [];
  let total = 0;
  socket.setTimeout(35_000);
  socket.on("data", (chunk) => {
    total += chunk.byteLength;
    if (total > 128 * 1024) {
      socket.destroy(
        new Error("runtime supervisor request exceeded its bound"),
      );
      return;
    }
    chunks.push(chunk);
  });
  socket.on("timeout", () => socket.destroy());
  socket.on("error", () => undefined);
  socket.on("end", () => {
    operation = operation.then(async () => {
      let response;
      let shouldClose = false;
      try {
        const request = parseSupervisorRequest(
          Buffer.concat(chunks).toString("utf8"),
          sessionId,
        );
        response = await handleRequest(request);
        shouldClose = request.action === "shutdown";
      } catch (error) {
        response = {
          schemaVersion: "1",
          status: "ERROR",
          sessionId,
          message:
            error instanceof Error
              ? error.message
              : "runtime supervisor request failed",
        };
      }
      socket.end(JSON.stringify(response), () => {
        if (shouldClose) {
          controlServer.close(() => {
            process.exitCode = 0;
          });
        }
      });
    });
  });
});

for (const [name, child] of Object.entries(children)) {
  child.once("exit", () => {
    if (expectedShutdown || state === "STARTING") return;
    state = "FAILED";
    for (const [otherName, other] of Object.entries(children)) {
      if (
        otherName !== name &&
        other.exitCode === null &&
        other.signalCode === null
      ) {
        other.kill("SIGTERM");
      }
    }
    controlServer.close();
    void closeBuildkitAdmission().catch(() => undefined);
    process.exitCode = 1;
  });
}

try {
  await waitForSockets([
    containerdRootlesskitApi,
    containerdSocket,
    runtimeCommandSocket,
    buildkitInnerSocket,
  ]);
  await new Promise((accept, reject) => {
    buildkitProxy.once("error", reject);
    buildkitProxy.listen(buildkitProxySocket, () => {
      chmodSync(buildkitProxySocket, 0o600);
      accept();
    });
  });
  buildkitAdmissionOpen = true;
  await new Promise((accept, reject) => {
    controlServer.once("error", reject);
    controlServer.listen(supervisorSocket, () => {
      chmodSync(supervisorSocket, 0o600);
      accept();
    });
  });
  const pids = childPids();
  writeFileSync(
    resolve(runRoot, "containerd-rootlesskit.pid"),
    `${pids.containerdRootlesskit}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  writeFileSync(
    resolve(runRoot, "buildkit-rootlesskit.pid"),
    `${pids.buildkitRootlesskit}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
  state = "ACTIVE";
  const payload = {
    schemaVersion: "1",
    status: "READY",
    sessionId,
    namespace: "counterlab-v6.1",
    supervisorPid: process.pid,
    childPids: pids,
    childHandlesOwned: true,
    supervisorSocket: `.rt/${sessionId}/run/runtime-supervisor.sock`,
    buildkitProxySocket: `.rt/${sessionId}/run/buildkitd.sock`,
    buildkitInnerSocket: `.rt/${sessionId}/run/inner/buildkitd.sock`,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    readyPath,
    `${JSON.stringify(
      {
        ...payload,
        receiptPayloadSha256: sha256SupervisorBytes(
          canonicalSupervisorJson(payload),
        ),
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", flag: "wx", mode: 0o600 },
  );
} catch (error) {
  await closeBuildkitAdmission().catch(() => undefined);
  await shutdownOwnedChildren().catch(() => undefined);
  throw error;
}

async function signalShutdown() {
  if (state === "STOPPED") return;
  state = "FAILED";
  await closeBuildkitAdmission().catch(() => undefined);
  await shutdownOwnedChildren().catch(() => undefined);
  controlServer.close();
  process.exitCode = 1;
}

process.once("SIGINT", signalShutdown);
process.once("SIGTERM", signalShutdown);
