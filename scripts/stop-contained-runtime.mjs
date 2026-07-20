#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalSupervisorJson,
  sendSupervisorRequest,
  sha256SupervisorBytes,
  validateRuntimeDrainReceipt,
} from "./contained-runtime-supervisor-protocol.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const args = process.argv.slice(2);
if (
  args.length !== 4 ||
  args[0] !== "--session-id" ||
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(args[1] ?? "") ||
  args[2] !== "--attestation-sha256" ||
  !/^[a-f0-9]{64}$/u.test(args[3] ?? "")
) {
  throw new Error(
    "Usage: stop-contained-runtime --session-id ID --attestation-sha256 SHA256",
  );
}

const sessionId = args[1];
const requestedAttestationSha256 = args[3];
const sessionRoot = resolve(root, ".rt", sessionId);
const attestationPath = resolve(sessionRoot, "attestation.json");
const outputPath = resolve(sessionRoot, "safe-stop-receipt.json");
const adapter = resolve(root, "scripts/contained-runtime-adapter.sh");
const verifier = resolve(root, "scripts/verify-contained-runtime.mjs");
const supervisorSocket = resolve(sessionRoot, "run/runtime-supervisor.sock");
const self = realpathSync(fileURLToPath(import.meta.url));

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertRepositoryFile(path, label) {
  const fromRoot = relative(root, path);
  const metadata = lstatSync(path);
  if (
    fromRoot.startsWith("..") ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o022) !== 0 ||
    realpathSync(path) !== path
  ) {
    throw new Error(`${label} is invalid`);
  }
  return metadata;
}

function exactKeys(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
}

function parseJson(source, label) {
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is invalid JSON`, { cause: error });
  }
}

function socketRefusesConnection(path) {
  return new Promise((accept, reject) => {
    const socket = connect(path);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      accept(value);
    };
    socket.setTimeout(2_000, () => finish(false));
    socket.once("connect", () => finish(false));
    socket.once("error", (error) => {
      if (["ECONNREFUSED", "ENOENT"].includes(error?.code)) {
        finish(true);
        return;
      }
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    });
  });
}

async function waitForSocketClosure(paths) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const closed = await Promise.all(paths.map(socketRefusesConnection));
    if (closed.every(Boolean)) return true;
    await new Promise((accept) => setTimeout(accept, 100));
  }
  return false;
}

assertRepositoryFile(attestationPath, "runtime attestation");
assertRepositoryFile(adapter, "runtime adapter");
assertRepositoryFile(verifier, "runtime verifier");
assertRepositoryFile(self, "runtime stop helper");
try {
  lstatSync(outputPath);
  throw new Error("safe-stop receipt already exists");
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const attestationSource = readFileSync(attestationPath);
if (sha256(attestationSource) !== requestedAttestationSha256) {
  throw new Error("runtime attestation hash does not match the stop request");
}
const attestation = parseJson(
  attestationSource.toString("utf8"),
  "runtime attestation",
);
exactKeys(
  attestation,
  [
    "schemaVersion",
    "status",
    "sessionId",
    "createdAt",
    "namespace",
    "toolchainLockSha256",
    "adapterSha256",
    "helperSha256",
    "runtimePolicySha256",
    "proofDependencyManifest",
    "proofDependencyManifestSha256",
    "runtimeToolchainSha256",
    "paths",
    "pids",
    "fileSha256",
  ],
  "runtime attestation",
);
if (
  attestation.schemaVersion !== "3" ||
  attestation.status !== "READY" ||
  attestation.sessionId !== sessionId ||
  attestation.namespace !== "counterlab-v6.1" ||
  attestation.helperSha256?.runtimeStop !== sha256(readFileSync(self)) ||
  !/^[a-f0-9]{64}$/u.test(attestation.runtimePolicySha256 ?? "") ||
  !/^[a-f0-9]{64}$/u.test(attestation.proofDependencyManifestSha256 ?? "") ||
  !/^[a-f0-9]{64}$/u.test(attestation.helperSha256?.timeoutProofDriver ?? "") ||
  !/^[a-f0-9]{64}$/u.test(attestation.helperSha256?.timeoutProofModule ?? "") ||
  !/^[a-f0-9]{64}$/u.test(attestation.helperSha256?.runtimeSupervisor ?? "") ||
  !/^[a-f0-9]{64}$/u.test(attestation.helperSha256?.supervisorProtocol ?? "")
) {
  throw new Error("runtime attestation is not bound to the stop helpers");
}

const environment = { PATH: "/usr/bin:/bin" };
const verification = spawnSync(
  process.execPath,
  [verifier, "--adapter", adapter, "--session-id", sessionId],
  {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  },
);
if (verification.status !== 0) {
  throw new Error("runtime verification failed before stop");
}
const verified = parseJson(verification.stdout, "runtime verification");
if (
  verified.status !== "VERIFIED" ||
  verified.sessionId !== sessionId ||
  verified.runtimeToolchainSha256 !== attestation.runtimeToolchainSha256 ||
  verified.runtimePolicySha256 !== attestation.runtimePolicySha256 ||
  verified.proofDependencyManifestSha256 !==
    attestation.proofDependencyManifestSha256
) {
  throw new Error("runtime verification disagrees with the attestation");
}

const beginDrain = await sendSupervisorRequest({
  socketPath: supervisorSocket,
  timeoutMs: 35_000,
  request: {
    schemaVersion: "1",
    action: "begin-drain",
    sessionId,
    attestationSha256: requestedAttestationSha256,
  },
});
exactKeys(
  beginDrain,
  [
    "schemaVersion",
    "status",
    "sessionId",
    "namespace",
    "state",
    "supervisorPid",
    "childPids",
    "childHandlesOwned",
    "buildkitAdmissionOpen",
    "activeBuildkitConnections",
    "attestationSha256",
  ],
  "runtime supervisor drain response",
);
if (
  beginDrain.schemaVersion !== "1" ||
  beginDrain.status !== "DRAINING" ||
  beginDrain.sessionId !== sessionId ||
  beginDrain.namespace !== "counterlab-v6.1" ||
  beginDrain.state !== "DRAINING" ||
  beginDrain.supervisorPid !== attestation.pids.supervisor ||
  canonicalJson(beginDrain.childPids) !==
    canonicalJson({
      containerdRootlesskit: attestation.pids.containerdRootlesskit,
      buildkitRootlesskit: attestation.pids.buildkitRootlesskit,
    }) ||
  beginDrain.childHandlesOwned !== true ||
  beginDrain.buildkitAdmissionOpen !== false ||
  beginDrain.activeBuildkitConnections !== 0 ||
  beginDrain.attestationSha256 !== requestedAttestationSha256
) {
  throw new Error("runtime supervisor did not close BuildKit admission");
}

const drained = spawnSync(
  adapter,
  [
    "--session-id",
    sessionId,
    "--",
    "counterlab-drain",
    requestedAttestationSha256,
  ],
  {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  },
);
if (drained.status !== 0) {
  throw new Error("runtime drain failed");
}
const drainReceipt = validateRuntimeDrainReceipt(
  parseJson(drained.stdout, "runtime drain receipt"),
  {
    sessionId,
    attestationSha256: requestedAttestationSha256,
  },
);

const rejectedAfterDrain = spawnSync(
  adapter,
  ["--session-id", sessionId, "--", "version", "--format", "json"],
  {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  },
);
if (
  rejectedAfterDrain.status === 0 ||
  !rejectedAfterDrain.stderr.includes("contained runtime is drained")
) {
  throw new Error("runtime admitted a command after drain");
}
if (sha256(readFileSync(attestationPath)) !== requestedAttestationSha256) {
  throw new Error("runtime attestation changed after drain");
}

const shutdown = await sendSupervisorRequest({
  socketPath: supervisorSocket,
  timeoutMs: 35_000,
  request: {
    schemaVersion: "1",
    action: "shutdown",
    sessionId,
    attestationSha256: requestedAttestationSha256,
    drainReceipt,
  },
});
exactKeys(
  shutdown,
  [
    "schemaVersion",
    "status",
    "sessionId",
    "namespace",
    "state",
    "supervisorPid",
    "childPids",
    "childHandlesOwned",
    "buildkitAdmissionOpen",
    "activeBuildkitConnections",
    "attestationSha256",
    "childExits",
    "drainReceiptSha256",
  ],
  "runtime supervisor shutdown response",
);
exactKeys(
  shutdown.childExits,
  ["containerdRootlesskit", "buildkitRootlesskit"],
  "runtime supervisor child exits",
);
for (const [name, exit] of Object.entries(shutdown.childExits)) {
  exactKeys(exit, ["code", "signal"], `runtime child exit ${name}`);
  if (!(
    (exit.code === null || Number.isInteger(exit.code)) &&
    (exit.signal === null || typeof exit.signal === "string") &&
    (exit.code !== null || exit.signal !== null)
  )) {
    throw new Error(`runtime child exit is invalid: ${name}`);
  }
}
if (
  shutdown.schemaVersion !== "1" ||
  shutdown.status !== "STOPPED" ||
  shutdown.sessionId !== sessionId ||
  shutdown.namespace !== "counterlab-v6.1" ||
  shutdown.state !== "STOPPED" ||
  shutdown.supervisorPid !== attestation.pids.supervisor ||
  canonicalJson(shutdown.childPids) !== canonicalJson(beginDrain.childPids) ||
  shutdown.childHandlesOwned !== true ||
  shutdown.buildkitAdmissionOpen !== false ||
  shutdown.activeBuildkitConnections !== 0 ||
  shutdown.attestationSha256 !== requestedAttestationSha256 ||
  shutdown.drainReceiptSha256 !==
    sha256SupervisorBytes(canonicalSupervisorJson(drainReceipt))
) {
  throw new Error("runtime supervisor shutdown binding is invalid");
}

const endpoints = [
  resolve(sessionRoot, "run/runtime-command.sock"),
  resolve(sessionRoot, "run/buildkitd.sock"),
  supervisorSocket,
];
if (!(await waitForSocketClosure(endpoints))) {
  throw new Error("runtime endpoint remained reachable after stop");
}
const runtimeCommandSocketClosed = true;
const buildkitSocketClosed = true;
const supervisorSocketClosed = true;

const payload = {
  schemaVersion: "2",
  status: "STOPPED",
  sessionId,
  namespace: "counterlab-v6.1",
  attestationSha256: requestedAttestationSha256,
  runtimeToolchainSha256: attestation.runtimeToolchainSha256,
  runtimePolicySha256: attestation.runtimePolicySha256,
  proofDependencyManifestSha256: attestation.proofDependencyManifestSha256,
  stopHelperSha256: sha256(readFileSync(self)),
  drainReceiptSha256: sha256(canonicalJson(drainReceipt)),
  pids: attestation.pids,
  childExits: shutdown.childExits,
  shutdownAuthority: "supervisor-owned-child-handles",
  commandAdmissionClosed: true,
  runtimeCommandSocketClosed,
  buildkitSocketClosed,
  supervisorSocketClosed,
  sessionDirectoryPreserved: statSync(sessionRoot).isDirectory(),
  stoppedAt: new Date().toISOString(),
};
const receipt = {
  ...payload,
  receiptPayloadSha256: sha256(canonicalJson(payload)),
};
writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
process.stdout.write(`${canonicalJson(receipt)}\n`);
