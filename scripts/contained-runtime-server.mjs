#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  containedRuntimeResourceAbsent,
  executeContainedRun,
} from "./contained-runtime-run.mjs";
import {
  createContainedContainerdConfig,
  probeContainedShimSocketDirectory,
} from "./contained-containerd-config.mjs";
import { createContainedRuntimeEnvironment } from "./contained-runtime-environment.mjs";
import { parseContainedRuntimeRequest } from "./contained-runtime-request.mjs";
import { verifyPersistedContainedRootlessSpec } from "./contained-rootless-spec.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const argv = process.argv.slice(2);
if (
  argv.length !== 2 ||
  argv[0] !== "--session-id" ||
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/.test(argv[1])
) {
  throw new Error("Usage: contained-runtime-server --session-id ID");
}

const sessionId = argv[1];
const sessionRoot = resolve(root, ".rt", sessionId);
const installRoot = resolve(
  root,
  "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
);
const binRoot = resolve(installRoot, "bin");
const runtimeWrapperRoot = resolve(root, "scripts/runtime-bin");
const runcWrapper = resolve(runtimeWrapperRoot, "runc");
const runcBinary = resolve(binRoot, "runc");
const runcStateRoot = resolve(sessionRoot, "run/runc");
const containerdSocket = resolve(sessionRoot, "run/containerd.sock");
const commandSocket = resolve(sessionRoot, "run/runtime-command.sock");
const clientFifoRoot = resolve(sessionRoot, "run/client-fifo");

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

const runcWrapperMetadata = statSync(runcWrapper);
const runtimeWrapperMetadata = statSync(runtimeWrapperRoot);
const runcStateMetadata = statSync(runcStateRoot);
const runtimeWrapperEntries = readdirSync(runtimeWrapperRoot).sort();
if (
  JSON.stringify(runtimeWrapperEntries) !== JSON.stringify(["runc"]) ||
  !runtimeWrapperMetadata.isDirectory() ||
  runtimeWrapperMetadata.uid !== process.getuid() ||
  (runtimeWrapperMetadata.mode & 0o022) !== 0 ||
  lstatSync(runcWrapper).isSymbolicLink() ||
  realpathSync(runcWrapper) !== runcWrapper ||
  !runcWrapperMetadata.isFile() ||
  runcWrapperMetadata.uid !== process.getuid() ||
  (runcWrapperMetadata.mode & 0o100) === 0 ||
  (runcWrapperMetadata.mode & 0o022) !== 0 ||
  realpathSync(runcStateRoot) !== runcStateRoot ||
  !runcStateMetadata.isDirectory() ||
  runcStateMetadata.uid !== process.getuid() ||
  (runcStateMetadata.mode & 0o777) !== 0o700
) {
  throw new Error("contained runc boundary is invalid");
}

const environment = createContainedRuntimeEnvironment({
  auth: resolve(sessionRoot, "auth"),
  binRoot,
  buildkitSocket: resolve(sessionRoot, "run/buildkitd.sock"),
  home: resolve(sessionRoot, "home"),
  runcBinary,
  runcStateRoot,
  runtimeWrapperRoot,
  tmp: resolve(sessionRoot, "tmp"),
  xdgCache: resolve(sessionRoot, "xdg-cache"),
  xdgConfig: resolve(sessionRoot, "xdg-config"),
  xdgData: resolve(sessionRoot, "xdg-data"),
  xdgRuntime: resolve(sessionRoot, "run/inner"),
});

let runtimeState = "ACTIVE";
let drainAttestationSha256;
let drainReceipt;

function lines(value) {
  return String(value ?? "")
    .split("\n")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right));
}

function inventory(entries) {
  const ordered = [...entries].sort((left, right) => left.localeCompare(right));
  return {
    count: ordered.length,
    entriesSha256: sha256(ordered.join("\n")),
    empty: ordered.length === 0,
  };
}

function directoryInventory(directory) {
  const entries = [];
  const visit = (current, prefix) => {
    for (const entry of readdirSync(current, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      const path = resolve(current, entry.name);
      if (entry.isSymbolicLink() || lstatSync(path).isSymbolicLink()) {
        throw new Error("contained runtime drain found a symbolic link");
      }
      const relativeName =
        prefix.length === 0 ? entry.name : `${prefix}/${entry.name}`;
      entries.push(entry.isDirectory() ? `${relativeName}/` : relativeName);
      if (entry.isDirectory()) visit(path, relativeName);
    }
  };
  visit(directory, "");
  return inventory(entries);
}

function successfulCommandInventory(result, label) {
  if (result.status !== 0) {
    throw new Error(`${label} inventory failed`);
  }
  return inventory(lines(result.stdout));
}

function createDrainReceipt(args, stdin) {
  if (
    args.length !== 2 ||
    args[0] !== "counterlab-drain" ||
    !/^[a-f0-9]{64}$/u.test(args[1] ?? "") ||
    stdin.byteLength !== 0
  ) {
    throw new Error("contained runtime drain request is invalid");
  }
  if (drainReceipt !== undefined) {
    if (drainReceipt.attestationSha256 !== args[1]) {
      throw new Error("contained runtime drain identity changed");
    }
    return drainReceipt;
  }
  const attestationPath = resolve(sessionRoot, "attestation.json");
  const metadata = lstatSync(attestationPath);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o022) !== 0 ||
    metadata.size < 1 ||
    metadata.size > 1_048_576
  ) {
    throw new Error("contained runtime drain attestation is invalid");
  }
  const attestationSource = readFileSync(attestationPath);
  if (sha256(attestationSource) !== args[1]) {
    throw new Error("contained runtime drain attestation hash changed");
  }
  if (
    drainAttestationSha256 !== undefined &&
    drainAttestationSha256 !== args[1]
  ) {
    throw new Error("contained runtime drain identity changed");
  }
  drainAttestationSha256 = args[1];
  runtimeState = "DRAINING";
  const ctr = resolve(binRoot, "ctr");
  const base = [
    "--address",
    containerdSocket,
    "--namespace",
    "counterlab-v6.1",
  ];
  const options = {
    cwd: root,
    env: environment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  };
  const tasks = spawnSync(ctr, [...base, "tasks", "list", "--quiet"], options);
  const containers = spawnSync(
    ctr,
    [...base, "containers", "list", "--quiet"],
    options,
  );
  const snapshots = spawnSync(
    ctr,
    [...base, "snapshots", "--snapshotter", "native", "list", "--quiet"],
    options,
  );
  const images = spawnSync(
    ctr,
    [...base, "images", "list", "--quiet"],
    options,
  );
  const taskInventory = successfulCommandInventory(tasks, "runtime task");
  const containerInventory = successfulCommandInventory(
    containers,
    "runtime container",
  );
  const snapshotInventory = successfulCommandInventory(
    snapshots,
    "runtime snapshot",
  );
  successfulCommandInventory(images, "runtime image");
  const imageNames = lines(images.stdout);
  const invocationAliasInventory = inventory(
    imageNames.filter((entry) =>
      /(?:^|\/)counterlab-runtime-invocation:/u.test(entry),
    ),
  );
  const runcStateInventory = directoryInventory(runcStateRoot);
  const fifoInventory = directoryInventory(clientFifoRoot);

  const specRoot = resolve(sessionRoot, "run/rootless-specs");
  const persistedEntries = [];
  let ownedTransientEmpty = true;
  if (existsSync(specRoot)) {
    const receiptNames = readdirSync(specRoot)
      .filter((entry) => entry.endsWith(".receipt.json"))
      .sort((left, right) => left.localeCompare(right));
    for (const receiptName of receiptNames) {
      const match = receiptName.match(/^([a-f0-9]{64})\.receipt\.json$/u);
      if (match === null) {
        throw new Error("contained runtime persisted receipt name is invalid");
      }
      const finalContainerId = match[1];
      const receiptPath = resolve(specRoot, receiptName);
      const receiptSource = readFileSync(receiptPath);
      const persistedReceipt = JSON.parse(receiptSource.toString("utf8"));
      const configPath = resolve(specRoot, `${finalContainerId}.config.json`);
      verifyPersistedContainedRootlessSpec({
        configFileSha256: persistedReceipt.configFileSha256,
        configPath,
        finalContainerId,
        receiptFileSha256: sha256(receiptSource),
        receiptPath,
        imageRootfsPath: persistedReceipt.imageRootfs?.mountPath,
        sessionRoot,
      });
      persistedEntries.push(`${receiptName}:${sha256(receiptSource)}`);
      for (const snapshotIdentity of [
        finalContainerId,
        persistedReceipt.imageRootfs.mountPath,
      ]) {
        const absent = spawnSync(
          ctr,
          [
            ...base,
            "snapshots",
            "--snapshotter",
            "native",
            "info",
            snapshotIdentity,
          ],
          { ...options, encoding: null },
        );
        if (absent.status === 0 || !containedRuntimeResourceAbsent(absent)) {
          ownedTransientEmpty = false;
        }
      }
    }
  }
  const persistedSpecs = {
    count: persistedEntries.length,
    entriesSha256: sha256(persistedEntries.join("\n")),
    verified: true,
  };
  if (
    !taskInventory.empty ||
    !containerInventory.empty ||
    !invocationAliasInventory.empty ||
    !runcStateInventory.empty ||
    !fifoInventory.empty ||
    !ownedTransientEmpty
  ) {
    throw new Error("contained runtime is not empty and cannot drain");
  }
  const payload = {
    schemaVersion: "2",
    status: "DRAINED",
    sessionId,
    namespace: "counterlab-v6.1",
    attestationSha256: args[1],
    tasks: taskInventory,
    containers: containerInventory,
    snapshots: {
      count: snapshotInventory.count,
      entriesSha256: snapshotInventory.entriesSha256,
      ownedTransientEmpty,
    },
    invocationAliases: invocationAliasInventory,
    runcState: runcStateInventory,
    clientFifos: fifoInventory,
    persistedSpecs,
    drainedAt: new Date().toISOString(),
  };
  drainReceipt = {
    ...payload,
    receiptPayloadSha256: sha256(canonicalJson(payload)),
  };
  runtimeState = "DRAINED";
  return drainReceipt;
}

const shimSocketBinding = createContainedContainerdConfig({
  configPath: resolve(sessionRoot, "config/containerd.toml"),
  repositoryRoot: root,
  shimSocketRoot: root,
});
await probeContainedShimSocketDirectory(shimSocketBinding);

const containerd = spawn(
  resolve(binRoot, "containerd"),
  [
    "--config",
    resolve(sessionRoot, "config/containerd.toml"),
    "--address",
    containerdSocket,
    "--root",
    resolve(sessionRoot, "data/containerd"),
    "--state",
    resolve(sessionRoot, "state/containerd"),
    "--log-level",
    "info",
  ],
  {
    cwd: root,
    env: environment,
    stdio: ["ignore", "inherit", "inherit"],
  },
);

await new Promise((accept, reject) => {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    try {
      if (statSync(containerdSocket).isSocket()) {
        clearInterval(timer);
        accept();
        return;
      }
    } catch {
      // The server is still starting.
    }
    if (attempts >= 300) {
      clearInterval(timer);
      reject(new Error("contained containerd socket did not become ready"));
    }
  }, 100);
  containerd.once("exit", (code, signal) => {
    clearInterval(timer);
    reject(
      new Error(
        `contained containerd exited during startup (${String(code ?? signal)})`,
      ),
    );
  });
});

const server = createServer((socket) => {
  const chunks = [];
  let total = 0;
  socket.setTimeout(1_800_000);
  socket.on("data", (chunk) => {
    total += chunk.byteLength;
    if (total > 64 * 1024) {
      socket.destroy(new Error("contained runtime request exceeded its bound"));
      return;
    }
    chunks.push(chunk);
  });
  socket.on("timeout", () => socket.destroy());
  socket.on("error", () => undefined);
  socket.on("end", () => {
    let response;
    try {
      const request = parseContainedRuntimeRequest(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      const stdin = request.stdin;
      if (request.args[0] === "counterlab-drain") {
        const receipt = createDrainReceipt(request.args, stdin);
        response = {
          schemaVersion: "1",
          exitCode: 0,
          stdoutBase64: Buffer.from(
            `${canonicalJson(receipt)}\n`,
            "utf8",
          ).toString("base64"),
          stderrBase64: "",
        };
      } else {
        if (runtimeState !== "ACTIVE") {
          throw new Error(
            runtimeState === "DRAINED"
              ? "contained runtime is drained"
              : "contained runtime is draining",
          );
        }
        const validation = spawnSync(
          process.execPath,
          [
            resolve(root, "scripts/validate-contained-runtime-command.mjs"),
            ...request.args,
          ],
          {
            cwd: root,
            env: environment,
            encoding: "utf8",
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 10_000,
          },
        );
        if (validation.status !== 0) {
          throw new Error(
            "contained runtime command failed independent validation",
          );
        }
        const result =
          request.args[0] === "run"
            ? executeContainedRun({
                args: request.args,
                binRoot,
                clientFifoRoot,
                containerdSocket,
                cwd: root,
                environment,
                installRoot,
                qualificationMode: request.qualificationMode,
                sessionRoot,
                stdin,
              })
            : spawnSync(
                resolve(binRoot, "nerdctl"),
                [
                  "--address",
                  containerdSocket,
                  "--namespace",
                  "counterlab-v6.1",
                  "--snapshotter",
                  "native",
                  "--data-root",
                  resolve(sessionRoot, "data/nerdctl"),
                  "--cgroup-manager",
                  "cgroupfs",
                  "--cni-path",
                  resolve(installRoot, "libexec/cni"),
                  "--cni-netconfpath",
                  resolve(sessionRoot, "config/cni"),
                  "--hosts-dir",
                  resolve(sessionRoot, "config/certs.d"),
                  "--experimental=false",
                  ...request.args,
                ],
                {
                  cwd: root,
                  env: environment,
                  input: stdin,
                  encoding: null,
                  stdio: ["pipe", "pipe", "pipe"],
                  timeout: 1_800_000,
                  maxBuffer: 32 * 1024 * 1024,
                },
              );
        response = {
          schemaVersion: "1",
          exitCode: result.status ?? 1,
          stdoutBase64: Buffer.from(result.stdout ?? "").toString("base64"),
          stderrBase64: Buffer.from(result.stderr ?? "").toString("base64"),
          ...(result.controlReceipt === undefined
            ? {}
            : { runControlReceipt: result.controlReceipt }),
        };
      }
    } catch (error) {
      response = {
        schemaVersion: "1",
        exitCode: 1,
        stdoutBase64: "",
        stderrBase64: Buffer.from(
          error instanceof Error
            ? `${error.message}\n`
            : "contained runtime failure\n",
        ).toString("base64"),
      };
    }
    socket.end(JSON.stringify(response));
  });
});

await new Promise((accept, reject) => {
  server.once("error", reject);
  server.listen(commandSocket, () => {
    chmodSync(commandSocket, 0o600);
    accept();
  });
});

const shutdown = () => {
  server.close();
  containerd.kill("SIGTERM");
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
containerd.once("exit", (code) => {
  server.close(() => {
    process.exitCode = code ?? 1;
  });
});
