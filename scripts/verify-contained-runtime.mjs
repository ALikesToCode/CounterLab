#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createContainedRuntimeEnvironment } from "./contained-runtime-environment.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const args = process.argv.slice(2);
if (
  args.length !== 4 ||
  args[0] !== "--adapter" ||
  args[2] !== "--session-id"
) {
  throw new Error(
    "Usage: verify-contained-runtime --adapter FILE --session-id ID",
  );
}

const requestedAdapter = args[1];
const sessionId = args[3];
if (!/^rt-[a-z0-9][a-z0-9-]{7,13}$/.test(sessionId)) {
  throw new Error("contained runtime session ID is invalid");
}

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

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Value(value) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}

function exactKeys(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const observed = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(observed) !== JSON.stringify(expected)) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
}

function contained(candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

function assertNoSymlinkPath(candidate) {
  if (!contained(candidate))
    throw new Error("runtime path escaped the repository");
  const fromRoot = relative(root, candidate);
  let current = root;
  for (const part of fromRoot.split(sep).filter(Boolean)) {
    current = resolve(current, part);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`runtime path contains a symlink: ${fromRoot}`);
    }
  }
}

function repositoryPath(relativePath, kind, label) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/).includes("..")
  ) {
    throw new Error(`${label} is not a repository-relative path`);
  }
  const candidate = resolve(root, relativePath);
  assertNoSymlinkPath(candidate);
  const metadata = statSync(candidate);
  if (metadata.uid !== process.getuid()) {
    throw new Error(`${label} is not owned by the current user`);
  }
  if (kind === "file" && !metadata.isFile())
    throw new Error(`${label} is not a file`);
  if (kind === "directory" && !metadata.isDirectory()) {
    throw new Error(`${label} is not a directory`);
  }
  if (kind === "socket" && !metadata.isSocket())
    throw new Error(`${label} is not a socket`);
  return candidate;
}

function secureFile(path, label) {
  const metadata = statSync(path);
  if ((metadata.mode & 0o022) !== 0) {
    throw new Error(`${label} is group- or world-writable`);
  }
}

const sessionPrefix = `.rt/${sessionId}`;
const installPrefix =
  "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1";
const expectedPaths = {
  installRoot: installPrefix,
  sessionRoot: sessionPrefix,
  containerdRootlesskitApiSocket: `${sessionPrefix}/run/containerd-rootless/api.sock`,
  containerdSocket: `${sessionPrefix}/run/containerd.sock`,
  runtimeCommandSocket: `${sessionPrefix}/run/runtime-command.sock`,
  clientFifoRoot: `${sessionPrefix}/run/client-fifo`,
  runcStateRoot: `${sessionPrefix}/run/runc`,
  buildkitSocket: `${sessionPrefix}/run/buildkitd.sock`,
  containerdRoot: `${sessionPrefix}/data/containerd`,
  containerdState: `${sessionPrefix}/state/containerd`,
  buildkitRoot: `${sessionPrefix}/data/buildkit`,
  nerdctlData: `${sessionPrefix}/data/nerdctl`,
  home: `${sessionPrefix}/home`,
  tmp: `${sessionPrefix}/tmp`,
  xdgCache: `${sessionPrefix}/xdg-cache`,
  xdgConfig: `${sessionPrefix}/xdg-config`,
  xdgData: `${sessionPrefix}/xdg-data`,
  auth: `${sessionPrefix}/auth`,
  containerdConfig: `${sessionPrefix}/config/containerd.toml`,
  buildkitConfig: `${sessionPrefix}/config/buildkitd.toml`,
  containerdPidFile: `${sessionPrefix}/run/containerd-rootlesskit.pid`,
  buildkitPidFile: `${sessionPrefix}/run/buildkit-rootlesskit.pid`,
  containerdRootlesskitState: `${sessionPrefix}/run/containerd-rootless`,
  buildkitRootlesskitState: `${sessionPrefix}/run/buildkit-rootless`,
};

const attestationPath = repositoryPath(
  `${sessionPrefix}/attestation.json`,
  "file",
  "runtime attestation",
);
secureFile(attestationPath, "runtime attestation");
const attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
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
    "runtimeToolchainSha256",
    "paths",
    "pids",
    "fileSha256",
  ],
  "runtime attestation",
);
exactKeys(attestation.paths, Object.keys(expectedPaths), "runtime paths");
exactKeys(
  attestation.pids,
  ["containerdRootlesskit", "buildkitRootlesskit"],
  "runtime PIDs",
);
exactKeys(
  attestation.fileSha256,
  ["containerdConfig", "buildkitConfig"],
  "runtime file hashes",
);
exactKeys(
  attestation.helperSha256,
  [
    "runtimeClient",
    "runtimeRun",
    "runtimeEnvironment",
    "runcWrapper",
    "containerdConfigWriter",
    "runtimeServer",
    "commandValidator",
    "attestationVerifier",
    "runtimeLauncher",
  ],
  "runtime helper hashes",
);
if (
  attestation.schemaVersion !== "1" ||
  attestation.status !== "READY" ||
  attestation.sessionId !== sessionId ||
  attestation.namespace !== "counterlab-v6.1" ||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
    attestation.createdAt,
  ) ||
  !/^[a-f0-9]{64}$/.test(attestation.toolchainLockSha256) ||
  !/^[a-f0-9]{64}$/.test(attestation.adapterSha256) ||
  Object.values(attestation.helperSha256).some(
    (value) => typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value),
  ) ||
  !/^[a-f0-9]{64}$/.test(attestation.runtimeToolchainSha256)
) {
  throw new Error("runtime attestation identity is invalid");
}

for (const [key, expected] of Object.entries(expectedPaths)) {
  if (attestation.paths[key] !== expected) {
    throw new Error(`runtime attestation path mismatch: ${key}`);
  }
}

const adapter = repositoryPath(
  relative(root, resolve(root, requestedAdapter)),
  "file",
  "runtime adapter",
);
secureFile(adapter, "runtime adapter");
if (sha256File(adapter) !== attestation.adapterSha256) {
  throw new Error("runtime adapter changed after session launch");
}

const helperPaths = {
  runtimeClient: "scripts/contained-runtime-client.mjs",
  runtimeRun: "scripts/contained-runtime-run.mjs",
  runtimeEnvironment: "scripts/contained-runtime-environment.mjs",
  runcWrapper: "scripts/runtime-bin/runc",
  containerdConfigWriter: "scripts/contained-containerd-config.mjs",
  runtimeServer: "scripts/contained-runtime-server.mjs",
  commandValidator: "scripts/validate-contained-runtime-command.mjs",
  attestationVerifier: "scripts/verify-contained-runtime.mjs",
  runtimeLauncher: "scripts/start-contained-runtime.sh",
};
for (const [key, helperPath] of Object.entries(helperPaths)) {
  const helper = repositoryPath(helperPath, "file", `runtime helper ${key}`);
  secureFile(helper, `runtime helper ${key}`);
  if (key === "runcWrapper" && (statSync(helper).mode & 0o111) === 0) {
    throw new Error("contained runc wrapper is not executable");
  }
  if (sha256File(helper) !== attestation.helperSha256[key]) {
    throw new Error(`runtime helper changed after session launch: ${key}`);
  }
}

const runtimeWrapperRoot = repositoryPath(
  "scripts/runtime-bin",
  "directory",
  "runtime wrapper directory",
);
secureFile(runtimeWrapperRoot, "runtime wrapper directory");
if (
  JSON.stringify(readdirSync(runtimeWrapperRoot).sort()) !==
  JSON.stringify(["runc"])
) {
  throw new Error("runtime wrapper directory contains an unknown entry");
}

const lockPath = repositoryPath(
  "scripts/runtime-toolchain-lock.json",
  "file",
  "runtime toolchain lock",
);
secureFile(lockPath, "runtime toolchain lock");
if (sha256File(lockPath) !== attestation.toolchainLockSha256) {
  throw new Error("runtime toolchain lock changed after session launch");
}
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
exactKeys(
  lock,
  [
    "schemaVersion",
    "distribution",
    "version",
    "platform",
    "archiveUrl",
    "checksumUrl",
    "archiveSha256",
    "licenses",
    "components",
  ],
  "runtime toolchain lock",
);
if (
  lock.schemaVersion !== "1" ||
  lock.distribution !== "nerdctl-full" ||
  lock.version !== "2.3.1" ||
  lock.platform !== "linux-amd64" ||
  lock.archiveSha256 !==
    "7a0d8efcf55b10b57d831541266adb9c6ec3d55b44ec041c95f6eb994d1faab9" ||
  lock.archiveUrl !==
    "https://github.com/containerd/nerdctl/releases/download/v2.3.1/nerdctl-full-2.3.1-linux-amd64.tar.gz" ||
  lock.checksumUrl !==
    "https://github.com/containerd/nerdctl/releases/download/v2.3.1/SHA256SUMS" ||
  JSON.stringify(lock.licenses) !== JSON.stringify(["Apache-2.0"])
) {
  throw new Error("runtime toolchain lock identity is invalid");
}

const expectedComponentVersions = {
  buildctl: "0.30.0",
  buildkitd: "0.30.0",
  containerd: "2.3.1",
  "containerd-shim-runc-v2": "2.3.1",
  ctr: "2.3.1",
  nerdctl: "2.3.1",
  rootlesskit: "3.0.0",
  runc: "1.4.2",
};
exactKeys(
  lock.components,
  Object.keys(expectedComponentVersions),
  "runtime components",
);
for (const [name, component] of Object.entries(lock.components)) {
  exactKeys(component, ["version", "sha256"], `runtime component ${name}`);
  if (component.version !== expectedComponentVersions[name]) {
    throw new Error(`runtime component version mismatch: ${name}`);
  }
  const binary = repositoryPath(
    `${installPrefix}/bin/${name}`,
    "file",
    `runtime component ${name}`,
  );
  secureFile(binary, `runtime component ${name}`);
  if (
    !/^[a-f0-9]{64}$/.test(component.sha256) ||
    sha256File(binary) !== component.sha256
  ) {
    throw new Error(`runtime component hash mismatch: ${name}`);
  }
}

const pathKinds = {
  installRoot: "directory",
  sessionRoot: "directory",
  containerdRootlesskitApiSocket: "socket",
  containerdSocket: "socket",
  runtimeCommandSocket: "socket",
  clientFifoRoot: "directory",
  runcStateRoot: "directory",
  buildkitSocket: "socket",
  containerdRoot: "directory",
  containerdState: "directory",
  buildkitRoot: "directory",
  nerdctlData: "directory",
  home: "directory",
  tmp: "directory",
  xdgCache: "directory",
  xdgConfig: "directory",
  xdgData: "directory",
  auth: "directory",
  containerdConfig: "file",
  buildkitConfig: "file",
  containerdPidFile: "file",
  buildkitPidFile: "file",
  containerdRootlesskitState: "directory",
  buildkitRootlesskitState: "directory",
};
const resolvedPaths = {};
for (const [key, kind] of Object.entries(pathKinds)) {
  resolvedPaths[key] = repositoryPath(attestation.paths[key], kind, key);
}
for (const key of [
  "containerdConfig",
  "buildkitConfig",
  "containerdPidFile",
  "buildkitPidFile",
]) {
  secureFile(resolvedPaths[key], key);
}
if ((statSync(resolvedPaths.runcStateRoot).mode & 0o777) !== 0o700) {
  throw new Error("contained runc state root is not private");
}
if (
  sha256File(resolvedPaths.containerdConfig) !==
    attestation.fileSha256.containerdConfig ||
  sha256File(resolvedPaths.buildkitConfig) !==
    attestation.fileSha256.buildkitConfig
) {
  throw new Error("runtime daemon configuration changed after launch");
}

for (const [key, value] of Object.entries(attestation.pids)) {
  if (!Number.isSafeInteger(value) || value <= 1)
    throw new Error(`runtime PID is invalid: ${key}`);
  process.kill(value, 0);
}
if (
  Number(readFileSync(resolvedPaths.containerdPidFile, "utf8").trim()) !==
    attestation.pids.containerdRootlesskit ||
  Number(readFileSync(resolvedPaths.buildkitPidFile, "utf8").trim()) !==
    attestation.pids.buildkitRootlesskit
) {
  throw new Error("runtime PID file disagrees with the attestation");
}

const containerdConfigText = readFileSync(
  resolvedPaths.containerdConfig,
  "utf8",
);
const shimSocketMatches = [
  ...containerdConfigText.matchAll(/^\s*socket_dir = '([^']+)'\s*$/gmu),
];
if (
  shimSocketMatches.length !== 1 ||
  shimSocketMatches[0][1].length > 42 ||
  shimSocketMatches[0][1] !== root ||
  realpathSync(shimSocketMatches[0][1]) !== root
) {
  throw new Error("runtime shim socket directory is not repository-contained");
}

const fingerprint = {
  schemaVersion: "1",
  namespace: attestation.namespace,
  toolchainLockSha256: attestation.toolchainLockSha256,
  adapterSha256: attestation.adapterSha256,
  helperSha256: attestation.helperSha256,
  components: Object.fromEntries(
    Object.entries(lock.components).map(([name, component]) => [
      name,
      component.sha256,
    ]),
  ),
  fileSha256: attestation.fileSha256,
};
if (sha256Value(fingerprint) !== attestation.runtimeToolchainSha256) {
  throw new Error("runtime toolchain fingerprint is invalid");
}

const runtimeEnvironment = createContainedRuntimeEnvironment({
  auth: resolvedPaths.auth,
  binRoot: resolve(root, installPrefix, "bin"),
  buildkitSocket: resolvedPaths.buildkitSocket,
  home: resolvedPaths.home,
  runcBinary: resolve(root, installPrefix, "bin/runc"),
  runcStateRoot: resolvedPaths.runcStateRoot,
  runtimeWrapperRoot,
  tmp: resolvedPaths.tmp,
  xdgCache: resolvedPaths.xdgCache,
  xdgConfig: resolvedPaths.xdgConfig,
  xdgData: resolvedPaths.xdgData,
  xdgRuntime: resolve(root, sessionPrefix, "run"),
});
const version = JSON.parse(
  execFileSync(
    process.execPath,
    [
      resolve(root, helperPaths.runtimeClient),
      "--session-id",
      sessionId,
      "--",
      "version",
      "--format",
      "json",
    ],
    {
      cwd: root,
      env: runtimeEnvironment,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    },
  ),
);
const serverComponents = new Map(
  (version.Server?.Components ?? []).map((component) => [
    component.Name,
    component.Version,
  ]),
);
if (
  !/^v?2\.3\.1$/.test(version.Client?.Version ?? "") ||
  !/^v?2\.3\.1$/.test(serverComponents.get("containerd") ?? "") ||
  !/^v?1\.4\.2$/.test(serverComponents.get("runc") ?? "")
) {
  throw new Error("contained containerd/nerdctl version probe failed");
}

execFileSync(
  resolve(root, installPrefix, "bin/buildctl"),
  ["--addr", `unix://${resolvedPaths.buildkitSocket}`, "debug", "workers"],
  {
    cwd: root,
    env: runtimeEnvironment,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 10_000,
  },
);

process.stdout.write(
  `${canonicalJson({
    schemaVersion: "1",
    status: "VERIFIED",
    sessionId,
    namespace: attestation.namespace,
    runtimeToolchainSha256: attestation.runtimeToolchainSha256,
    toolchainLockSha256: attestation.toolchainLockSha256,
    adapterSha256: attestation.adapterSha256,
    componentSha256: Object.fromEntries(
      Object.entries(lock.components).map(([name, component]) => [
        name,
        component.sha256,
      ]),
    ),
    fileSha256: attestation.fileSha256,
    containerdRootlesskitApiSocket:
      attestation.paths.containerdRootlesskitApiSocket,
    containerdSocket: attestation.paths.containerdSocket,
    runtimeCommandSocket: attestation.paths.runtimeCommandSocket,
    buildkitSocket: attestation.paths.buildkitSocket,
  })}\n`,
);
