#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createRuntimeToolchainFingerprint,
  sha256RuntimeBytes,
} from "./contained-runtime-attestation.mjs";
import { validateSupervisorReadyReceipt } from "./contained-runtime-supervisor-protocol.mjs";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const args = process.argv.slice(2);
if (
  args.length !== 6 ||
  args[0] !== "--session-id" ||
  args[2] !== "--supervisor-ready" ||
  args[4] !== "--output"
) {
  throw new Error(
    "Usage: write-contained-runtime-attestation --session-id ID --supervisor-ready FILE --output FILE",
  );
}

const sessionId = args[1];
const readyPath = resolve(root, args[3]);
const output = resolve(root, args[5]);
const fromRoot = relative(root, output);
const readyFromRoot = relative(root, readyPath);
if (
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(sessionId) ||
  fromRoot === "" ||
  fromRoot.startsWith("..") ||
  isAbsolute(fromRoot) ||
  readyFromRoot.startsWith("..") ||
  isAbsolute(readyFromRoot) ||
  lstatSync(readyPath).isSymbolicLink() ||
  realpathSync(readyPath) !== readyPath ||
  !statSync(readyPath).isFile() ||
  statSync(readyPath).uid !== process.getuid() ||
  (statSync(readyPath).mode & 0o022) !== 0
) {
  throw new Error("runtime attestation arguments are invalid");
}

const sessionPrefix = `.rt/${sessionId}`;
const readySource = readFileSync(readyPath);
const supervisorReady = validateSupervisorReadyReceipt(
  JSON.parse(readySource.toString("utf8")),
  {
    sessionId,
    supervisorSocket: `${sessionPrefix}/run/runtime-supervisor.sock`,
    buildkitProxySocket: `${sessionPrefix}/run/buildkitd.sock`,
    buildkitInnerSocket: `${sessionPrefix}/run/inner/buildkitd.sock`,
  },
);
const material = createRuntimeToolchainFingerprint({
  root,
  adapterPath: resolve(root, "scripts/contained-runtime-adapter.sh"),
  containerdConfigPath: resolve(root, sessionPrefix, "config/containerd.toml"),
  buildkitConfigPath: resolve(root, sessionPrefix, "config/buildkitd.toml"),
});
const paths = {
  installRoot:
    "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
  sessionRoot: sessionPrefix,
  containerdRootlesskitApiSocket: `${sessionPrefix}/run/containerd-rootless/api.sock`,
  containerdSocket: `${sessionPrefix}/run/containerd.sock`,
  snapshotterSocket: `${sessionPrefix}/run/inner/fuse-overlayfs.sock`,
  runtimeCommandSocket: `${sessionPrefix}/run/runtime-command.sock`,
  clientFifoRoot: `${sessionPrefix}/run/client-fifo`,
  runcStateRoot: `${sessionPrefix}/run/runc`,
  buildkitSocket: `${sessionPrefix}/run/buildkitd.sock`,
  buildkitInnerSocket: `${sessionPrefix}/run/inner/buildkitd.sock`,
  buildkitOtelSocket: `${sessionPrefix}/run/inner/buildkit-otel.sock`,
  runtimeSupervisorSocket: `${sessionPrefix}/run/runtime-supervisor.sock`,
  runtimeSupervisorReady: `${sessionPrefix}/run/runtime-supervisor-ready.json`,
  containerdRoot: `${sessionPrefix}/data/containerd`,
  snapshotterRoot: `${sessionPrefix}/data/fuse-overlayfs`,
  containerdState: `${sessionPrefix}/state/containerd`,
  buildkitRoot: `${sessionPrefix}/data/buildkit`,
  nerdctlData: `${sessionPrefix}/data/nerdctl`,
  home: `${sessionPrefix}/home`,
  tmp: `${sessionPrefix}/tmp`,
  xdgCache: `${sessionPrefix}/xdg-cache`,
  xdgConfig: `${sessionPrefix}/xdg-config`,
  xdgData: `${sessionPrefix}/xdg-data`,
  xdgRuntime: `${sessionPrefix}/run/inner`,
  auth: `${sessionPrefix}/auth`,
  containerdConfig: `${sessionPrefix}/config/containerd.toml`,
  buildkitConfig: `${sessionPrefix}/config/buildkitd.toml`,
  containerdPidFile: `${sessionPrefix}/run/containerd-rootlesskit.pid`,
  buildkitPidFile: `${sessionPrefix}/run/buildkit-rootlesskit.pid`,
  containerdRootlesskitState: `${sessionPrefix}/run/containerd-rootless`,
  buildkitRootlesskitState: `${sessionPrefix}/run/buildkit-rootless`,
};

writeFileSync(
  output,
  `${JSON.stringify(
    {
      schemaVersion: "3",
      status: "READY",
      sessionId,
      createdAt: new Date().toISOString(),
      namespace: "counterlab-v6.1",
      toolchainLockSha256: material.toolchainLockSha256,
      adapterSha256: material.adapterSha256,
      helperSha256: material.helperSha256,
      runtimePolicySha256: material.runtimePolicySha256,
      proofDependencyManifest: material.proofDependencyManifest,
      proofDependencyManifestSha256: material.proofDependencyManifestSha256,
      runtimeToolchainSha256: material.runtimeToolchainSha256,
      paths,
      pids: {
        supervisor: supervisorReady.supervisorPid,
        ...supervisorReady.childPids,
      },
      fileSha256: {
        ...material.fileSha256,
        supervisorReady: sha256RuntimeBytes(readySource),
      },
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 },
);
