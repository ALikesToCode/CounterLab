#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { connect } from "node:net";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = realpathSync(resolve(fileURLToPath(import.meta.url), "../.."));
const self = realpathSync(fileURLToPath(import.meta.url));
const sha256Pattern = /^[a-f0-9]{64}$/u;

const HISTORICAL_COMPONENT_VERSIONS = Object.freeze({
  buildctl: "0.30.0",
  buildkitd: "0.30.0",
  containerd: "2.3.1",
  "containerd-shim-runc-v2": "2.3.1",
  ctr: "2.3.1",
  nerdctl: "2.3.1",
  rootlesskit: "3.0.0",
  runc: "1.4.2",
});

export const COMPAT_STOP_TARGET = Object.freeze({
  sessionId: "rt-release721",
  attestationSha256:
    "2f12fe8f9db649f0564238a4569da9e98f5b8e31f085daec14f93538ba9d4569",
  historicalBundleCommit: "85c5652afc75230a28209883153814ca6cb64c36",
  helperManifestSha256:
    "31db93f95a991fc128d6b1ee30891f107eeac5462faf4813e9ecaa771fdbc0c9",
  runtimeToolchainSha256:
    "bbf0324d9e228f869f2a7fb75758c53ff4779417447bef8c266c5afa119c66b0",
  toolchainLockSha256:
    "847199eae28241f7a37ee9a85087d1d2a137b741be106ab3907f3e3bdfe9aa32",
  adapterSha256:
    "f368efecf9ad10bd47a0d9a5366454f24a1f30efdff8eafe96fa41d5943cc202",
  runtimePolicySha256:
    "f330a93a90d9b58e1fc7338f363cf4c9a7fdab36d88b42208bded5987f675aac",
  proofDependencyManifestSha256:
    "7525d8598e90cf8f93edfadf695fd723d1b75041fe7aceba0e9ab701b8f6bf86",
  supervisorReadySha256:
    "7446f013639a75c85d59ecb0a39ffa0983fa3d70b9d0623d570e87284462d2c0",
  containerdConfigSha256:
    "bdbaae4d53c246e3f3a4e1851d29b8c24d9020748b96d8906e0a76b287d6baba",
  buildkitConfigSha256:
    "05860153585b0b3623bbc8b68c00ded38ce83930748fd67992bc9e8056cb21d5",
});

const HISTORICAL_HELPER_PATHS = Object.freeze({
  runtimeClient: "scripts/contained-runtime-client.mjs",
  runtimeRun: "scripts/contained-runtime-run.mjs",
  rootlessSpec: "scripts/contained-rootless-spec.mjs",
  imageAuthority: "scripts/contained-image-authority.mjs",
  runtimeEnvironment: "scripts/contained-runtime-environment.mjs",
  runtimeAttestation: "scripts/contained-runtime-attestation.mjs",
  attestationWriter: "scripts/write-contained-runtime-attestation.mjs",
  runtimeSupervisor: "scripts/contained-runtime-supervisor.mjs",
  supervisorProtocol: "scripts/contained-runtime-supervisor-protocol.mjs",
  runcWrapper: "scripts/runtime-bin/runc",
  containerdConfigWriter: "scripts/contained-containerd-config.mjs",
  runtimeServer: "scripts/contained-runtime-server.mjs",
  commandValidator: "scripts/validate-contained-runtime-command.mjs",
  attestationVerifier: "scripts/verify-contained-runtime.mjs",
  runtimeLauncher: "scripts/start-contained-runtime.sh",
  runtimeStop: "scripts/stop-contained-runtime.mjs",
  timeoutProofDriver: "scripts/verify-contained-runtime-timeout.py",
  timeoutProofModule: "services/runner/src/counterlab_runner/timeout_proof.py",
});

const HISTORICAL_HELPER_SHA256 = Object.freeze({
  runtimeClient:
    "2de5ed10ca5012342550f80dd522b1c6dc59e16c898963808667c4e5429e4cc8",
  runtimeRun:
    "7cc096aa5c933a8e3a8eca5d0584096d20a6c37e80a76bcf1715ecbb53686eb0",
  rootlessSpec:
    "430205629ac01cc2353a9f40c159c6f8b2f616a3f58af3d9a4ec896176f6c445",
  imageAuthority:
    "f4cd4e4aceeddf490cb241b0c650d3621917b46ee91b4e69a941947ab6fb6861",
  runtimeEnvironment:
    "7e1d1921f254e7296b5fa41e1c44fb4520accfb3547778c7997c54af32352b66",
  runtimeAttestation:
    "ecc07ce71852aa5868f9124123dd75397c47291c969ed3766baeab043762f0dc",
  attestationWriter:
    "8ea2a533657c58719f9ecc387e94f2ec1dd8d69cb51c5db01aa09cfe1edc8246",
  runtimeSupervisor:
    "d757ab43fff5f712ac540e1df4073c8ddfe4c4553f1dffd21757f65e075ceab3",
  supervisorProtocol:
    "0e180a70b5d09ca695c20fe9a9f82afad64da3fd0a69e535bf28c492c3965bb9",
  runcWrapper:
    "610c3d99a15a9f805f459295a8283bf9ab9808f4c6a41a422bb6fe40d621d813",
  containerdConfigWriter:
    "30529840626300dbde4e8f1a22a526d9aacacdd973b402cc06c93b08a7385f92",
  runtimeServer:
    "1aa52787d2f24cbbd3d61a693e44a5a26a6dcfbac9589888fd36bf390743c062",
  commandValidator:
    "4f087cc1cceef985e3bdf1afb0abe6c661fb984c5ac8883aee9067fce355c60f",
  attestationVerifier:
    "3cbd97332a47b36b8c7eabb0281e92d6b5128091f735f967c3d5fc3fd07d91b4",
  runtimeLauncher:
    "47243e86e7abf182d18e55b67e5c7baa44cc3369b4c91c926d35eb27142e7d52",
  runtimeStop:
    "d39a76fda5c10399743d036f106ce94103c9ae02edc13311b84a656ce233abef",
  timeoutProofDriver:
    "64a5cf09e935898c38c5d7acb68cbe924e81465915dc7e6848e33240361c4935",
  timeoutProofModule:
    "68948a3d8fde48c38ead993d32afc37d40082e0b16bb006c831200a07f7d0e4c",
});

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

function sha256File(path) {
  return new Promise((accept, reject) => {
    const hash = createHash("sha256");
    const source = createReadStream(path);
    source.once("error", reject);
    source.on("data", (chunk) => hash.update(chunk));
    source.once("end", () => accept(hash.digest("hex")));
  });
}

function exactObject(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
  return value;
}

function validPid(value) {
  return Number.isSafeInteger(value) && value > 1;
}

function assertSha256(value, label) {
  if (!sha256Pattern.test(value ?? "")) throw new Error(`${label} is invalid`);
}

function contained(candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

function repositoryEntry(relativePath, kind, label) {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    isAbsolute(relativePath) ||
    relativePath.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(`${label} is not repository-relative`);
  }
  const candidate = resolve(root, relativePath);
  if (!contained(candidate)) throw new Error(`${label} escaped the repository`);
  let current = root;
  for (const component of relative(root, candidate)
    .split(sep)
    .filter(Boolean)) {
    current = resolve(current, component);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link`);
    }
  }
  const metadata = statSync(candidate);
  if (
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o022) !== 0 ||
    realpathSync(candidate) !== candidate
  ) {
    throw new Error(`${label} ownership or mode is unsafe`);
  }
  if (kind === "file" && !metadata.isFile()) {
    throw new Error(`${label} is not a file`);
  }
  if (kind === "directory" && !metadata.isDirectory()) {
    throw new Error(`${label} is not a directory`);
  }
  if (kind === "socket" && !metadata.isSocket()) {
    throw new Error(`${label} is not a socket`);
  }
  return candidate;
}

function readBounded(path, label, maximumBytes = 1024 * 1024) {
  const metadata = statSync(path);
  if (metadata.size > maximumBytes) throw new Error(`${label} is too large`);
  return readFileSync(path);
}

export function validateCompatTarget(sessionId, attestationSha256) {
  if (
    sessionId !== COMPAT_STOP_TARGET.sessionId ||
    attestationSha256 !== COMPAT_STOP_TARGET.attestationSha256
  ) {
    throw new Error("compatibility stop target is not allowlisted");
  }
}

function expectedPaths(sessionId) {
  const prefix = `.rt/${sessionId}`;
  return {
    installRoot:
      "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
    sessionRoot: prefix,
    containerdRootlesskitApiSocket: `${prefix}/run/containerd-rootless/api.sock`,
    containerdSocket: `${prefix}/run/containerd.sock`,
    runtimeCommandSocket: `${prefix}/run/runtime-command.sock`,
    clientFifoRoot: `${prefix}/run/client-fifo`,
    runcStateRoot: `${prefix}/run/runc`,
    buildkitSocket: `${prefix}/run/buildkitd.sock`,
    buildkitInnerSocket: `${prefix}/run/inner/buildkitd.sock`,
    buildkitOtelSocket: `${prefix}/run/inner/buildkit-otel.sock`,
    runtimeSupervisorSocket: `${prefix}/run/runtime-supervisor.sock`,
    runtimeSupervisorReady: `${prefix}/run/runtime-supervisor-ready.json`,
    containerdRoot: `${prefix}/data/containerd`,
    containerdState: `${prefix}/state/containerd`,
    buildkitRoot: `${prefix}/data/buildkit`,
    nerdctlData: `${prefix}/data/nerdctl`,
    home: `${prefix}/home`,
    tmp: `${prefix}/tmp`,
    xdgCache: `${prefix}/xdg-cache`,
    xdgConfig: `${prefix}/xdg-config`,
    xdgData: `${prefix}/xdg-data`,
    xdgRuntime: `${prefix}/run/inner`,
    auth: `${prefix}/auth`,
    containerdConfig: `${prefix}/config/containerd.toml`,
    buildkitConfig: `${prefix}/config/buildkitd.toml`,
    containerdPidFile: `${prefix}/run/containerd-rootlesskit.pid`,
    buildkitPidFile: `${prefix}/run/buildkit-rootlesskit.pid`,
    containerdRootlesskitState: `${prefix}/run/containerd-rootless`,
    buildkitRootlesskitState: `${prefix}/run/buildkit-rootless`,
  };
}

export function validateTargetAttestation(attestation, sessionId) {
  exactObject(
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
  const paths = expectedPaths(sessionId);
  exactObject(attestation.paths, Object.keys(paths), "runtime paths");
  exactObject(
    attestation.pids,
    ["supervisor", "containerdRootlesskit", "buildkitRootlesskit"],
    "runtime PIDs",
  );
  exactObject(
    attestation.fileSha256,
    ["containerdConfig", "buildkitConfig", "supervisorReady"],
    "runtime file hashes",
  );
  exactObject(
    attestation.helperSha256,
    Object.keys(HISTORICAL_HELPER_PATHS),
    "historical runtime helper hashes",
  );
  if (
    attestation.schemaVersion !== "3" ||
    attestation.status !== "READY" ||
    attestation.sessionId !== sessionId ||
    attestation.namespace !== "counterlab-v6.1" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(
      attestation.createdAt ?? "",
    ) ||
    !Object.values(attestation.pids).every(validPid) ||
    canonicalJson(attestation.helperSha256) !==
      canonicalJson(HISTORICAL_HELPER_SHA256) ||
    sha256(canonicalJson(attestation.helperSha256)) !==
      COMPAT_STOP_TARGET.helperManifestSha256 ||
    attestation.runtimeToolchainSha256 !==
      COMPAT_STOP_TARGET.runtimeToolchainSha256 ||
    attestation.toolchainLockSha256 !==
      COMPAT_STOP_TARGET.toolchainLockSha256 ||
    attestation.adapterSha256 !== COMPAT_STOP_TARGET.adapterSha256 ||
    attestation.runtimePolicySha256 !==
      COMPAT_STOP_TARGET.runtimePolicySha256 ||
    attestation.proofDependencyManifestSha256 !==
      COMPAT_STOP_TARGET.proofDependencyManifestSha256 ||
    attestation.fileSha256.supervisorReady !==
      COMPAT_STOP_TARGET.supervisorReadySha256 ||
    attestation.fileSha256.containerdConfig !==
      COMPAT_STOP_TARGET.containerdConfigSha256 ||
    attestation.fileSha256.buildkitConfig !==
      COMPAT_STOP_TARGET.buildkitConfigSha256
  ) {
    throw new Error("historical runtime attestation identity is invalid");
  }
  for (const [key, expected] of Object.entries(paths)) {
    if (attestation.paths[key] !== expected) {
      throw new Error(`historical runtime path mismatch: ${key}`);
    }
  }
  exactObject(
    attestation.proofDependencyManifest,
    ["schemaVersion", "files"],
    "runtime proof dependency manifest",
  );
  if (
    attestation.proofDependencyManifest.schemaVersion !== "1" ||
    !Array.isArray(attestation.proofDependencyManifest.files) ||
    attestation.proofDependencyManifest.files.length === 0 ||
    sha256(canonicalJson(attestation.proofDependencyManifest)) !==
      attestation.proofDependencyManifestSha256
  ) {
    throw new Error("runtime proof dependency manifest is invalid");
  }
  let previous = "";
  let policyFound = false;
  for (const entry of attestation.proofDependencyManifest.files) {
    exactObject(entry, ["path", "sha256"], "runtime proof dependency");
    if (
      typeof entry.path !== "string" ||
      !(
        entry.path === "scripts/verify-contained-runtime-timeout.py" ||
        /^services\/runner\/src\/counterlab_runner\/[A-Za-z0-9_.-]+\.(?:json|py)$/u.test(
          entry.path,
        )
      ) ||
      entry.path <= previous
    ) {
      throw new Error("runtime proof dependency path is invalid");
    }
    assertSha256(entry.sha256, "runtime proof dependency hash");
    if (
      entry.path ===
      "services/runner/src/counterlab_runner/contained-runtime-policy.json"
    ) {
      policyFound = entry.sha256 === attestation.runtimePolicySha256;
    }
    previous = entry.path;
  }
  if (!policyFound) throw new Error("runtime policy binding is invalid");
  return paths;
}

function gitFile(path) {
  const fromGit = execFileSync(
    "/usr/bin/git",
    ["show", `${COMPAT_STOP_TARGET.historicalBundleCommit}:${path}`],
    {
      cwd: root,
      env: { PATH: "/usr/bin:/bin" },
      encoding: null,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10_000,
    },
  );
  return Buffer.from(fromGit);
}

export function validateHistoricalBundle(attestation) {
  const ancestor = spawnSync(
    "/usr/bin/git",
    [
      "merge-base",
      "--is-ancestor",
      COMPAT_STOP_TARGET.historicalBundleCommit,
      "HEAD",
    ],
    {
      cwd: root,
      env: { PATH: "/usr/bin:/bin" },
      stdio: "ignore",
      timeout: 10_000,
    },
  );
  if (ancestor.status !== 0) {
    throw new Error("historical runtime bundle is not an ancestor");
  }
  if (
    sha256(gitFile("scripts/contained-runtime-adapter.sh")) !==
      attestation.adapterSha256 ||
    sha256(gitFile("scripts/runtime-toolchain-lock.json")) !==
      attestation.toolchainLockSha256
  ) {
    throw new Error("historical runtime root files do not match");
  }
  for (const [name, path] of Object.entries(HISTORICAL_HELPER_PATHS)) {
    if (sha256(gitFile(path)) !== attestation.helperSha256[name]) {
      throw new Error(`historical runtime helper does not match: ${name}`);
    }
  }
  for (const entry of attestation.proofDependencyManifest.files) {
    if (sha256(gitFile(entry.path)) !== entry.sha256) {
      throw new Error(
        `historical runtime proof file does not match: ${entry.path}`,
      );
    }
  }
  const lock = JSON.parse(
    gitFile("scripts/runtime-toolchain-lock.json").toString("utf8"),
  );
  exactObject(
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
    "historical runtime lock",
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
    canonicalJson(lock.licenses) !== canonicalJson(["Apache-2.0"])
  ) {
    throw new Error("historical runtime lock identity is invalid");
  }
  exactObject(
    lock.components,
    Object.keys(HISTORICAL_COMPONENT_VERSIONS),
    "historical runtime components",
  );
  const components = Object.fromEntries(
    Object.entries(lock.components ?? {}).map(([name, component]) => {
      exactObject(
        component,
        ["version", "sha256"],
        `historical component ${name}`,
      );
      assertSha256(component?.sha256, `historical component hash ${name}`);
      if (component.version !== HISTORICAL_COMPONENT_VERSIONS[name]) {
        throw new Error(`historical component version mismatch: ${name}`);
      }
      return [name, component.sha256];
    }),
  );
  const fingerprint = {
    schemaVersion: "2",
    namespace: "counterlab-v6.1",
    toolchainLockSha256: attestation.toolchainLockSha256,
    adapterSha256: attestation.adapterSha256,
    helperSha256: attestation.helperSha256,
    components,
    fileSha256: {
      containerdConfig: attestation.fileSha256.containerdConfig,
      buildkitConfig: attestation.fileSha256.buildkitConfig,
    },
    runtimePolicySha256: attestation.runtimePolicySha256,
    proofDependencyManifestSha256: attestation.proofDependencyManifestSha256,
  };
  if (
    sha256(canonicalJson(fingerprint)) !== attestation.runtimeToolchainSha256
  ) {
    throw new Error("historical runtime fingerprint is invalid");
  }
  return lock;
}

async function validateInstalledToolchain(installRoot, lock) {
  for (const [name, component] of Object.entries(lock.components)) {
    const binary = repositoryEntry(
      `${relative(root, installRoot)}/bin/${name}`,
      "file",
      `installed runtime component ${name}`,
    );
    const metadata = statSync(binary);
    if (metadata.size <= 0 || metadata.size > 512 * 1024 * 1024) {
      throw new Error(`installed runtime component size is invalid: ${name}`);
    }
    if ((await sha256File(binary)) !== component.sha256) {
      throw new Error(`installed runtime component hash mismatch: ${name}`);
    }
  }
}

export function validateCurrentStopPrimitives(attestation) {
  const requiredCurrentFiles = {
    adapter: [
      "scripts/contained-runtime-adapter.sh",
      attestation.adapterSha256,
    ],
    canonicalStop: [
      "scripts/stop-contained-runtime.mjs",
      attestation.helperSha256.runtimeStop,
    ],
    verifier: [
      "scripts/verify-contained-runtime.mjs",
      attestation.helperSha256.attestationVerifier,
    ],
    supervisorProtocol: [
      "scripts/contained-runtime-supervisor-protocol.mjs",
      attestation.helperSha256.supervisorProtocol,
    ],
  };
  for (const [label, [path, expected]] of Object.entries(
    requiredCurrentFiles,
  )) {
    const file = repositoryEntry(path, "file", `current ${label}`);
    if (
      sha256(readBounded(file, `current ${label}`, 2 * 1024 * 1024)) !==
      expected
    ) {
      throw new Error(
        `current ${label} no longer matches the attested primitive`,
      );
    }
  }
}

export function createLegacyRuntimeRequest(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new Error("legacy runtime command is empty");
  }
  return `${JSON.stringify({
    schemaVersion: "1",
    args,
    stdinBase64: "",
  })}\n`;
}

function decodeCanonicalBase64(value, label) {
  if (
    typeof value !== "string" ||
    value.length > 48 * 1024 * 1024 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(
      value,
    )
  ) {
    throw new Error(`${label} is invalid base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`${label} is not canonical base64`);
  }
  return decoded;
}

export function validateLegacyRuntimeResponse(value) {
  exactObject(
    value,
    ["schemaVersion", "exitCode", "stdoutBase64", "stderrBase64"],
    "legacy runtime response",
  );
  if (value.schemaVersion !== "1" || !Number.isInteger(value.exitCode)) {
    throw new Error("legacy runtime response identity is invalid");
  }
  return {
    exitCode: value.exitCode,
    stdout: decodeCanonicalBase64(value.stdoutBase64, "legacy runtime stdout"),
    stderr: decodeCanonicalBase64(value.stderrBase64, "legacy runtime stderr"),
  };
}

function sendLegacyRuntimeCommand({ socketPath, args, timeoutMs }) {
  return new Promise((accept, reject) => {
    const request = createLegacyRuntimeRequest(args);
    const chunks = [];
    let total = 0;
    let settled = false;
    const socket = connect(socketPath);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(error);
    };
    socket.setTimeout(timeoutMs, () =>
      fail(new Error("legacy runtime command timed out")),
    );
    socket.once("connect", () => socket.end(request));
    socket.on("data", (chunk) => {
      total += chunk.byteLength;
      if (total > 48 * 1024 * 1024) {
        fail(new Error("legacy runtime response exceeded its bound"));
        return;
      }
      chunks.push(chunk);
    });
    socket.once("error", fail);
    socket.once("end", () => {
      if (settled) return;
      settled = true;
      try {
        accept(
          validateLegacyRuntimeResponse(
            JSON.parse(Buffer.concat(chunks).toString("utf8")),
          ),
        );
      } catch (error) {
        reject(
          new Error("legacy runtime response is invalid", { cause: error }),
        );
      }
    });
  });
}

function validateSupervisorTransition(
  response,
  { attestation, attestationSha256, expectedStatus },
) {
  exactObject(
    response,
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
    "runtime supervisor transition",
  );
  exactObject(
    response.childPids,
    ["containerdRootlesskit", "buildkitRootlesskit"],
    "runtime supervisor child PIDs",
  );
  if (
    response.schemaVersion !== "1" ||
    response.status !== expectedStatus ||
    response.sessionId !== attestation.sessionId ||
    response.namespace !== "counterlab-v6.1" ||
    response.state !== expectedStatus ||
    response.supervisorPid !== attestation.pids.supervisor ||
    canonicalJson(response.childPids) !==
      canonicalJson({
        containerdRootlesskit: attestation.pids.containerdRootlesskit,
        buildkitRootlesskit: attestation.pids.buildkitRootlesskit,
      }) ||
    response.childHandlesOwned !== true ||
    response.buildkitAdmissionOpen !== false ||
    response.activeBuildkitConnections !== 0 ||
    response.attestationSha256 !== attestationSha256
  ) {
    throw new Error("runtime supervisor transition is invalid");
  }
  return response;
}

function validateShutdown(
  response,
  { attestation, attestationSha256, drainReceipt },
) {
  exactObject(
    response,
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
    "runtime supervisor shutdown",
  );
  exactObject(
    response.childPids,
    ["containerdRootlesskit", "buildkitRootlesskit"],
    "runtime shutdown child PIDs",
  );
  exactObject(
    response.childExits,
    ["containerdRootlesskit", "buildkitRootlesskit"],
    "runtime child exits",
  );
  for (const [name, exit] of Object.entries(response.childExits)) {
    exactObject(exit, ["code", "signal"], `runtime child exit ${name}`);
    if (!(
      (exit.code === null || Number.isInteger(exit.code)) &&
      (exit.signal === null || typeof exit.signal === "string") &&
      (exit.code !== null || exit.signal !== null)
    )) {
      throw new Error(`runtime child exit is invalid: ${name}`);
    }
  }
  if (
    response.schemaVersion !== "1" ||
    response.status !== "STOPPED" ||
    response.state !== "STOPPED" ||
    response.sessionId !== attestation.sessionId ||
    response.namespace !== "counterlab-v6.1" ||
    response.supervisorPid !== attestation.pids.supervisor ||
    canonicalJson(response.childPids) !==
      canonicalJson({
        containerdRootlesskit: attestation.pids.containerdRootlesskit,
        buildkitRootlesskit: attestation.pids.buildkitRootlesskit,
      }) ||
    response.childHandlesOwned !== true ||
    response.buildkitAdmissionOpen !== false ||
    response.activeBuildkitConnections !== 0 ||
    response.attestationSha256 !== attestationSha256 ||
    response.drainReceiptSha256 !== sha256(canonicalJson(drainReceipt))
  ) {
    throw new Error("runtime supervisor shutdown binding is invalid");
  }
  return response;
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

export async function executeCompatRecoveryProtocol({
  attestation,
  attestationPath,
  attestationSha256,
  resolved,
  requestSupervisor,
  requestRuntime = sendLegacyRuntimeCommand,
  waitForClosure = waitForSocketClosure,
  readAttestation = (path) => readFileSync(path),
  validateDrainReceipt,
}) {
  if (
    typeof requestSupervisor !== "function" ||
    typeof validateDrainReceipt !== "function"
  ) {
    throw new Error("historical recovery protocol dependencies are invalid");
  }
  const beginDrain = await requestSupervisor({
    socketPath: resolved.runtimeSupervisorSocket,
    timeoutMs: 35_000,
    request: {
      schemaVersion: "1",
      action: "begin-drain",
      sessionId: attestation.sessionId,
      attestationSha256,
    },
  });
  validateSupervisorTransition(beginDrain, {
    attestation,
    attestationSha256,
    expectedStatus: "DRAINING",
  });

  const drainResponse = await requestRuntime({
    socketPath: resolved.runtimeCommandSocket,
    args: ["counterlab-drain", attestationSha256],
    timeoutMs: 35_000,
  });
  if (drainResponse.exitCode !== 0 || drainResponse.stderr.byteLength !== 0) {
    throw new Error("historical runtime drain command failed");
  }
  const drainReceipt = validateDrainReceipt(
    JSON.parse(drainResponse.stdout.toString("utf8")),
    { sessionId: attestation.sessionId, attestationSha256 },
  );

  const rejectedAfterDrain = await requestRuntime({
    socketPath: resolved.runtimeCommandSocket,
    args: ["version", "--format", "json"],
    timeoutMs: 10_000,
  });
  if (
    rejectedAfterDrain.exitCode === 0 ||
    !rejectedAfterDrain.stderr
      .toString("utf8")
      .includes("contained runtime is drained")
  ) {
    throw new Error("historical runtime admitted a command after drain");
  }
  if (sha256(readAttestation(attestationPath)) !== attestationSha256) {
    throw new Error("runtime attestation changed after drain");
  }

  const shutdown = validateShutdown(
    await requestSupervisor({
      socketPath: resolved.runtimeSupervisorSocket,
      timeoutMs: 35_000,
      request: {
        schemaVersion: "1",
        action: "shutdown",
        sessionId: attestation.sessionId,
        attestationSha256,
        drainReceipt,
      },
    }),
    { attestation, attestationSha256, drainReceipt },
  );

  const endpoints = [
    resolved.runtimeCommandSocket,
    resolved.buildkitSocket,
    resolved.runtimeSupervisorSocket,
  ];
  if (!(await waitForClosure(endpoints))) {
    throw new Error(
      "historical runtime endpoint remained reachable after stop",
    );
  }
  return { drainReceipt, shutdown };
}

export function createHistoricalRecoveryReceipt({
  attestation,
  attestationSha256,
  compatStopHelperSha256,
  drainReceipt,
  shutdown,
  sessionDirectoryPreserved,
  stoppedAt,
}) {
  assertSha256(compatStopHelperSha256, "compatibility stop helper hash");
  if (
    sessionDirectoryPreserved !== true ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(stoppedAt ?? "")
  ) {
    throw new Error("historical recovery completion evidence is invalid");
  }
  const payload = {
    schemaVersion: "1",
    status: "RECOVERY_STOPPED",
    purpose: "historical-runtime-recovery",
    qualificationEligible: false,
    releaseQualification: false,
    sessionId: attestation.sessionId,
    namespace: "counterlab-v6.1",
    attestationSha256,
    historicalBundleCommit: COMPAT_STOP_TARGET.historicalBundleCommit,
    historicalHelperManifestSha256: COMPAT_STOP_TARGET.helperManifestSha256,
    runtimeToolchainSha256: attestation.runtimeToolchainSha256,
    compatStopHelperSha256,
    drainReceiptSha256: sha256(canonicalJson(drainReceipt)),
    pids: attestation.pids,
    childExits: shutdown.childExits,
    shutdownAuthority: "supervisor-owned-child-handles",
    commandAdmissionClosed: true,
    runtimeCommandSocketClosed: true,
    buildkitSocketClosed: true,
    supervisorSocketClosed: true,
    sessionDirectoryPreserved,
    stoppedAt,
  };
  return {
    ...payload,
    receiptPayloadSha256: sha256(canonicalJson(payload)),
  };
}

function recoveryLockPath() {
  const sessionRoot = repositoryEntry(
    `.rt/${COMPAT_STOP_TARGET.sessionId}`,
    "directory",
    "historical runtime session",
  );
  const lockPath = resolve(sessionRoot, "historical-recovery.lock");
  if (!contained(lockPath)) {
    throw new Error("historical recovery lock escaped the repository");
  }
  return lockPath;
}

function assertSafeExistingLock(lockPath) {
  const existing = lstatSync(lockPath);
  if (
    existing.isSymbolicLink() ||
    !existing.isFile() ||
    existing.uid !== process.getuid() ||
    (existing.mode & 0o077) !== 0
  ) {
    throw new Error("historical recovery lock is unsafe");
  }
}

function runWithRepositoryLock() {
  const lockPath = recoveryLockPath();
  if (existsSync(lockPath)) {
    assertSafeExistingLock(lockPath);
  } else {
    writeFileSync(lockPath, "", {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  }
  if (
    lstatSync(lockPath).isSymbolicLink() ||
    !statSync(lockPath).isFile() ||
    statSync(lockPath).uid !== process.getuid() ||
    (statSync(lockPath).mode & 0o077) !== 0
  ) {
    throw new Error("historical recovery lock is unsafe");
  }
  const locked = spawnSync(
    "/usr/bin/flock",
    [
      "--exclusive",
      "--nonblock",
      "--conflict-exit-code",
      "75",
      lockPath,
      process.execPath,
      self,
      ...process.argv.slice(2),
    ],
    {
      cwd: root,
      env: {
        COUNTERLAB_RT_RELEASE721_RECOVERY_LOCKED: "1",
        PATH: "/usr/bin:/bin",
      },
      stdio: "inherit",
      timeout: 300_000,
    },
  );
  if (locked.error) {
    throw new Error("historical recovery lock command failed", {
      cause: locked.error,
    });
  }
  if (locked.status === 75) {
    throw new Error("another historical recovery attempt owns the lock");
  }
  if (locked.status !== 0) {
    throw new Error(
      `historical recovery child failed with status ${String(locked.status)}`,
    );
  }
}

function assertRepositoryLockHeld() {
  const lockPath = recoveryLockPath();
  if (!existsSync(lockPath)) {
    throw new Error("historical recovery lock is missing");
  }
  assertSafeExistingLock(lockPath);
  const probe = spawnSync(
    "/usr/bin/flock",
    [
      "--exclusive",
      "--nonblock",
      "--conflict-exit-code",
      "75",
      lockPath,
      "/usr/bin/true",
    ],
    {
      cwd: root,
      env: { PATH: "/usr/bin:/bin" },
      stdio: "ignore",
      timeout: 10_000,
    },
  );
  if (probe.error || probe.status !== 75) {
    throw new Error("historical recovery process does not own the lock");
  }
}

function parseCliArguments(args) {
  if (
    args.length !== 4 ||
    args[0] !== "--session-id" ||
    args[2] !== "--attestation-sha256"
  ) {
    throw new Error(
      "Usage: stop-contained-runtime-v3-compat --session-id rt-release721 --attestation-sha256 SHA256",
    );
  }
  const sessionId = args[1];
  const attestationSha256 = args[3];
  validateCompatTarget(sessionId, attestationSha256);
  return { sessionId, attestationSha256 };
}

function validatePreLockIdentity(args) {
  const { sessionId, attestationSha256 } = parseCliArguments(args);
  const paths = expectedPaths(sessionId);
  const attestationPath = repositoryEntry(
    `${paths.sessionRoot}/attestation.json`,
    "file",
    "runtime attestation",
  );
  const source = readBounded(
    attestationPath,
    "runtime attestation",
    256 * 1024,
  );
  if (sha256(source) !== attestationSha256) {
    throw new Error("runtime attestation hash does not match the target");
  }
  const attestation = JSON.parse(source.toString("utf8"));
  validateTargetAttestation(attestation, sessionId);
  validateHistoricalBundle(attestation);
  validateCurrentStopPrimitives(attestation);
}

async function main() {
  const { sessionId, attestationSha256: requestedAttestationSha256 } =
    parseCliArguments(process.argv.slice(2));

  const marker = repositoryEntry(
    "COUNTERLAB_REPO_ROOT",
    "file",
    "repository marker",
  );
  const selfMetadata = statSync(self);
  if (
    statSync(marker).size === 0 ||
    selfMetadata.uid !== process.getuid() ||
    (selfMetadata.mode & 0o022) !== 0
  ) {
    throw new Error("compatibility stop helper identity is invalid");
  }

  const paths = expectedPaths(sessionId);
  const attestationPath = repositoryEntry(
    `${paths.sessionRoot}/attestation.json`,
    "file",
    "runtime attestation",
  );
  const outputPath = resolve(
    root,
    paths.sessionRoot,
    "historical-recovery-receipt.json",
  );
  if (existsSync(outputPath)) {
    throw new Error("historical recovery receipt already exists");
  }
  const attestationSource = readBounded(
    attestationPath,
    "runtime attestation",
    256 * 1024,
  );
  if (sha256(attestationSource) !== requestedAttestationSha256) {
    throw new Error("runtime attestation hash does not match the target");
  }
  const attestation = JSON.parse(attestationSource.toString("utf8"));
  validateTargetAttestation(attestation, sessionId);
  const historicalLock = validateHistoricalBundle(attestation);
  validateCurrentStopPrimitives(attestation);
  const supervisorProtocol =
    await import("./contained-runtime-supervisor-protocol.mjs");

  const pathKinds = {
    installRoot: "directory",
    sessionRoot: "directory",
    containerdRootlesskitApiSocket: "socket",
    containerdSocket: "socket",
    runtimeCommandSocket: "socket",
    clientFifoRoot: "directory",
    runcStateRoot: "directory",
    buildkitSocket: "socket",
    buildkitInnerSocket: "socket",
    buildkitOtelSocket: "socket",
    runtimeSupervisorSocket: "socket",
    runtimeSupervisorReady: "file",
    containerdRoot: "directory",
    containerdState: "directory",
    buildkitRoot: "directory",
    nerdctlData: "directory",
    home: "directory",
    tmp: "directory",
    xdgCache: "directory",
    xdgConfig: "directory",
    xdgData: "directory",
    xdgRuntime: "directory",
    auth: "directory",
    containerdConfig: "file",
    buildkitConfig: "file",
    containerdPidFile: "file",
    buildkitPidFile: "file",
    containerdRootlesskitState: "directory",
    buildkitRootlesskitState: "directory",
  };
  const resolved = Object.fromEntries(
    Object.entries(pathKinds).map(([name, kind]) => [
      name,
      repositoryEntry(attestation.paths[name], kind, `runtime path ${name}`),
    ]),
  );
  if ((statSync(resolved.runcStateRoot).mode & 0o777) !== 0o700) {
    throw new Error("contained runc state root is not private");
  }
  await validateInstalledToolchain(resolved.installRoot, historicalLock);
  if (
    sha256(readBounded(resolved.containerdConfig, "containerd config")) !==
      attestation.fileSha256.containerdConfig ||
    sha256(readBounded(resolved.buildkitConfig, "buildkit config")) !==
      attestation.fileSha256.buildkitConfig ||
    sha256(readBounded(resolved.runtimeSupervisorReady, "supervisor ready")) !==
      attestation.fileSha256.supervisorReady
  ) {
    throw new Error("runtime session files changed after launch");
  }
  const ready = supervisorProtocol.validateSupervisorReadyReceipt(
    JSON.parse(readFileSync(resolved.runtimeSupervisorReady, "utf8")),
    {
      sessionId,
      supervisorSocket: attestation.paths.runtimeSupervisorSocket,
      buildkitProxySocket: attestation.paths.buildkitSocket,
      buildkitInnerSocket: attestation.paths.buildkitInnerSocket,
    },
  );
  if (
    ready.supervisorPid !== attestation.pids.supervisor ||
    ready.childPids.containerdRootlesskit !==
      attestation.pids.containerdRootlesskit ||
    ready.childPids.buildkitRootlesskit !==
      attestation.pids.buildkitRootlesskit ||
    Number(readFileSync(resolved.containerdPidFile, "utf8").trim()) !==
      ready.childPids.containerdRootlesskit ||
    Number(readFileSync(resolved.buildkitPidFile, "utf8").trim()) !==
      ready.childPids.buildkitRootlesskit
  ) {
    throw new Error("runtime PID files disagree with the attestation");
  }
  if (sha256(readFileSync(attestationPath)) !== requestedAttestationSha256) {
    throw new Error("runtime attestation changed before drain");
  }

  const { drainReceipt, shutdown } = await executeCompatRecoveryProtocol({
    attestation,
    attestationPath,
    attestationSha256: requestedAttestationSha256,
    resolved,
    requestSupervisor: supervisorProtocol.sendSupervisorRequest,
    validateDrainReceipt: supervisorProtocol.validateRuntimeDrainReceipt,
  });
  const receipt = createHistoricalRecoveryReceipt({
    attestation,
    attestationSha256: requestedAttestationSha256,
    compatStopHelperSha256: sha256(readFileSync(self)),
    drainReceipt,
    shutdown,
    sessionDirectoryPreserved: statSync(resolved.sessionRoot).isDirectory(),
    stoppedAt: new Date().toISOString(),
  });
  writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : null;
if (invokedPath === self) {
  if (process.env.COUNTERLAB_RT_RELEASE721_RECOVERY_LOCKED === "1") {
    assertRepositoryLockHeld();
    await main();
  } else {
    validatePreLockIdentity(process.argv.slice(2));
    runWithRepositoryLock();
  }
}
