import { createHash } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const RUNTIME_POLICY_PATH =
  "services/runner/src/counterlab_runner/contained-runtime-policy.json";

export const RUNTIME_HELPER_PATHS = Object.freeze({
  cgroupEvidence: "scripts/contained-cgroup-evidence.mjs",
  qualifiedRootlessReceiptStore:
    "scripts/contained-qualified-receipt-store.mjs",
  qualifiedRootlessReceipt: "scripts/contained-qualified-rootless-receipt.mjs",
  runtimeClient: "scripts/contained-runtime-client.mjs",
  runtimeRequest: "scripts/contained-runtime-request.mjs",
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

export function canonicalRuntimeJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalRuntimeJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) => `${JSON.stringify(key)}:${canonicalRuntimeJson(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256RuntimeBytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function requireContainedRuntimeSessionId(value) {
  if (
    typeof value !== "string" ||
    !/^rt-[a-z0-9][a-z0-9-]{7,13}$/u.test(value)
  ) {
    throw new Error("contained runtime session identity is missing or invalid");
  }
  return value;
}

export function containedRuntimeAdapterArguments(sessionId, arguments_) {
  requireContainedRuntimeSessionId(sessionId);
  if (!Array.isArray(arguments_) || arguments_.length === 0) {
    throw new Error("contained runtime command is empty");
  }
  return ["--session-id", sessionId, "--", ...arguments_];
}

export function createPublicContainedRuntimeAttestation({
  attestation,
  componentSha256,
}) {
  return {
    schemaVersion: "2",
    status: "VERIFIED",
    sessionId: attestation.sessionId,
    namespace: attestation.namespace,
    runtimeToolchainSha256: attestation.runtimeToolchainSha256,
    toolchainLockSha256: attestation.toolchainLockSha256,
    adapterSha256: attestation.adapterSha256,
    runtimePolicySha256: attestation.runtimePolicySha256,
    proofDependencyManifestSha256: attestation.proofDependencyManifestSha256,
    componentSha256,
    fileSha256: {
      containerdConfig: attestation.fileSha256.containerdConfig,
      buildkitConfig: attestation.fileSha256.buildkitConfig,
    },
    containerdRootlesskitApiSocket:
      attestation.paths.containerdRootlesskitApiSocket,
    containerdSocket: attestation.paths.containerdSocket,
    runtimeCommandSocket: attestation.paths.runtimeCommandSocket,
    buildkitSocket: attestation.paths.buildkitSocket,
  };
}

function contained(root, candidate) {
  const fromRoot = relative(root, candidate);
  return (
    fromRoot === "" || (!fromRoot.startsWith("..") && !isAbsolute(fromRoot))
  );
}

function repositoryFile(root, requested, label) {
  if (
    typeof requested !== "string" ||
    requested.length === 0 ||
    isAbsolute(requested) ||
    requested.split(/[\\/]/u).includes("..")
  ) {
    throw new Error(`${label} is not a repository-relative path`);
  }
  const candidate = resolve(root, requested);
  if (!contained(root, candidate)) {
    throw new Error(`${label} escaped the repository`);
  }
  let current = root;
  for (const component of relative(root, candidate)
    .split(sep)
    .filter(Boolean)) {
    current = resolve(current, component);
    if (lstatSync(current).isSymbolicLink()) {
      throw new Error(`${label} contains a symbolic link`);
    }
  }
  const physical = realpathSync(candidate);
  if (!contained(root, physical) || !statSync(physical).isFile()) {
    throw new Error(`${label} is not a contained regular file`);
  }
  return physical;
}

function sha256RepositoryFile(root, requested, label) {
  return sha256RuntimeBytes(
    readFileSync(repositoryFile(root, requested, label)),
  );
}

export function createRuntimeProofDependencyManifest(requestedRoot) {
  const root = realpathSync(requestedRoot);
  const packageRelative = "services/runner/src/counterlab_runner";
  const packageRoot = resolve(root, packageRelative);
  if (!contained(root, packageRoot)) {
    throw new Error("runtime proof package escaped the repository");
  }
  const packageMetadata = lstatSync(packageRoot);
  if (packageMetadata.isSymbolicLink() || !packageMetadata.isDirectory()) {
    throw new Error("runtime proof package is not a contained directory");
  }

  const paths = [];
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort(
      (left, right) => left.name.localeCompare(right.name),
    )) {
      if (entry.name === "__pycache__") continue;
      const candidate = resolve(directory, entry.name);
      if (!contained(root, candidate) || entry.isSymbolicLink()) {
        throw new Error("runtime proof dependency contains an unsafe entry");
      }
      if (entry.isDirectory()) {
        visit(candidate);
        continue;
      }
      if (!entry.isFile() || !/\.(?:json|py)$/u.test(entry.name)) {
        throw new Error(
          `runtime proof dependency has an unreviewed file: ${relative(root, candidate)}`,
        );
      }
      paths.push(relative(root, candidate).split(sep).join("/"));
    }
  };
  visit(packageRoot);
  paths.push("scripts/verify-contained-runtime-timeout.py");
  paths.sort((left, right) => left.localeCompare(right));

  const files = paths.map((path) => ({
    path,
    sha256: sha256RepositoryFile(
      root,
      path,
      `runtime proof dependency ${path}`,
    ),
  }));
  const manifest = Object.freeze({ schemaVersion: "1", files });
  const manifestSha256 = sha256RuntimeBytes(canonicalRuntimeJson(manifest));
  const policy = files.find((entry) => entry.path === RUNTIME_POLICY_PATH);
  if (policy === undefined) {
    throw new Error(
      "runtime policy is absent from the proof dependency manifest",
    );
  }
  return {
    manifest,
    manifestSha256,
    runtimePolicySha256: policy.sha256,
  };
}

export function createRuntimeToolchainFingerprint({
  root: requestedRoot,
  adapterPath,
  containerdConfigPath,
  buildkitConfigPath,
}) {
  const root = realpathSync(requestedRoot);
  const lockPath = repositoryFile(
    root,
    "scripts/runtime-toolchain-lock.json",
    "runtime toolchain lock",
  );
  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  const toolchainLockSha256 = sha256RuntimeBytes(readFileSync(lockPath));
  const adapterRelative = relative(root, realpathSync(adapterPath))
    .split(sep)
    .join("/");
  const adapterSha256 = sha256RepositoryFile(
    root,
    adapterRelative,
    "runtime adapter",
  );
  const helperSha256 = Object.fromEntries(
    Object.entries(RUNTIME_HELPER_PATHS).map(([name, path]) => [
      name,
      sha256RepositoryFile(root, path, `runtime helper ${name}`),
    ]),
  );
  const fileSha256 = {
    containerdConfig: sha256RuntimeBytes(readFileSync(containerdConfigPath)),
    buildkitConfig: sha256RuntimeBytes(readFileSync(buildkitConfigPath)),
  };
  const proof = createRuntimeProofDependencyManifest(root);
  const fingerprint = {
    schemaVersion: "2",
    namespace: "counterlab-v6.1",
    toolchainLockSha256,
    adapterSha256,
    helperSha256,
    components: Object.fromEntries(
      Object.entries(lock.components).map(([name, component]) => [
        name,
        component.sha256,
      ]),
    ),
    fileSha256,
    runtimePolicySha256: proof.runtimePolicySha256,
    proofDependencyManifestSha256: proof.manifestSha256,
  };
  return {
    adapterSha256,
    fileSha256,
    helperSha256,
    lock,
    proofDependencyManifest: proof.manifest,
    proofDependencyManifestSha256: proof.manifestSha256,
    runtimePolicySha256: proof.runtimePolicySha256,
    runtimeToolchainSha256: sha256RuntimeBytes(
      canonicalRuntimeJson(fingerprint),
    ),
    toolchainLockSha256,
  };
}
