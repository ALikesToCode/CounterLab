import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  canonicalRuntimeJson,
  createPublicContainedRuntimeAttestation,
  createRuntimeToolchainFingerprint,
  requireContainedRuntimeSessionId,
  sha256RuntimeBytes,
} from "./contained-runtime-attestation.mjs";

const repositoryRoot = realpathSync(
  resolve(fileURLToPath(import.meta.url), "../.."),
);
const maximumAttestationBytes = 1_048_576;
const sha256Pattern = /^[a-f0-9]{64}$/u;

function contained(parent, candidate) {
  const fromParent = relative(parent, candidate);
  return (
    fromParent === "" ||
    (!fromParent.startsWith("..") && !isAbsolute(fromParent))
  );
}

function privateDirectory(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isDirectory() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    (metadata.mode & 0o077) !== 0
  ) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
}

function privateFile(path, label) {
  const metadata = lstatSync(path);
  if (
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid() ||
    metadata.nlink !== 1 ||
    (metadata.mode & 0o600) !== 0o600 ||
    (metadata.mode & 0o077) !== 0 ||
    metadata.size < 1 ||
    metadata.size > maximumAttestationBytes
  ) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
}

function exactRuntimeSessionRoot(sessionRoot) {
  if (!isAbsolute(sessionRoot) || !contained(repositoryRoot, sessionRoot)) {
    throw new Error("contained cgroup observer session root is invalid");
  }
  const runtimeSessionId = requireContainedRuntimeSessionId(
    basename(sessionRoot),
  );
  const expected = resolve(repositoryRoot, ".rt", runtimeSessionId);
  if (sessionRoot !== expected) {
    throw new Error("contained cgroup observer session root is not exact");
  }
  privateDirectory(resolve(repositoryRoot, ".rt"), "runtime root");
  privateDirectory(sessionRoot, "session root");
  return runtimeSessionId;
}

function equalJson(left, right) {
  return canonicalRuntimeJson(left) === canonicalRuntimeJson(right);
}

function repositoryFile(path, label) {
  const metadata = lstatSync(path);
  if (
    !contained(repositoryRoot, path) ||
    metadata.isSymbolicLink() ||
    !metadata.isFile() ||
    realpathSync(path) !== path ||
    metadata.uid !== process.getuid()
  ) {
    throw new Error(`contained cgroup observer ${label} is invalid`);
  }
}

export function resolveContainedCgroupObserverBindings({ sessionRoot }) {
  const runtimeSessionId = exactRuntimeSessionRoot(sessionRoot);
  const attestationPath = resolve(sessionRoot, "attestation.json");
  privateFile(attestationPath, "runtime attestation");
  let attestation;
  try {
    attestation = JSON.parse(readFileSync(attestationPath, "utf8"));
  } catch (error) {
    throw new Error("contained cgroup observer attestation JSON is invalid", {
      cause: error,
    });
  }
  const sessionPrefix = `.rt/${runtimeSessionId}`;
  const expectedPublicPaths = {
    containerdRootlesskitApiSocket: `${sessionPrefix}/run/containerd-rootless/api.sock`,
    containerdSocket: `${sessionPrefix}/run/containerd.sock`,
    runtimeCommandSocket: `${sessionPrefix}/run/runtime-command.sock`,
    buildkitSocket: `${sessionPrefix}/run/buildkitd.sock`,
  };
  const material = createRuntimeToolchainFingerprint({
    root: repositoryRoot,
    adapterPath: resolve(
      repositoryRoot,
      "scripts/contained-runtime-adapter.sh",
    ),
    containerdConfigPath: resolve(sessionRoot, "config/containerd.toml"),
    buildkitConfigPath: resolve(sessionRoot, "config/buildkitd.toml"),
  });
  if (
    attestation?.schemaVersion !== "3" ||
    attestation?.status !== "READY" ||
    attestation?.sessionId !== runtimeSessionId ||
    attestation?.namespace !== "counterlab-v6.1" ||
    attestation?.paths?.sessionRoot !== sessionPrefix ||
    Object.entries(expectedPublicPaths).some(
      ([name, path]) => attestation?.paths?.[name] !== path,
    ) ||
    attestation?.runtimeToolchainSha256 !== material.runtimeToolchainSha256 ||
    attestation?.toolchainLockSha256 !== material.toolchainLockSha256 ||
    attestation?.adapterSha256 !== material.adapterSha256 ||
    attestation?.runtimePolicySha256 !== material.runtimePolicySha256 ||
    attestation?.proofDependencyManifestSha256 !==
      material.proofDependencyManifestSha256 ||
    !equalJson(attestation?.helperSha256, material.helperSha256) ||
    !equalJson(attestation?.fileSha256, {
      ...material.fileSha256,
      supervisorReady: attestation?.fileSha256?.supervisorReady,
    }) ||
    !sha256Pattern.test(attestation?.fileSha256?.supervisorReady ?? "")
  ) {
    throw new Error("contained cgroup observer attestation binding changed");
  }
  const componentSha256 = Object.fromEntries(
    Object.entries(material.lock.components).map(([name, component]) => [
      name,
      component.sha256,
    ]),
  );
  const publicAttestation = createPublicContainedRuntimeAttestation({
    attestation,
    componentSha256,
  });
  const driverCliPath = resolve(
    repositoryRoot,
    "scripts/verify-contained-runtime-timeout.py",
  );
  const driverModulePath = resolve(
    repositoryRoot,
    "services/runner/src/counterlab_runner/timeout_proof.py",
  );
  for (const [path, label] of [
    [driverCliPath, "proof CLI"],
    [driverModulePath, "proof module"],
  ]) {
    repositoryFile(path, label);
  }
  return Object.freeze({
    driverCliSha256: sha256RuntimeBytes(readFileSync(driverCliPath)),
    driverModuleSha256: sha256RuntimeBytes(readFileSync(driverModulePath)),
    runtimeAttestationSha256: sha256RuntimeBytes(
      canonicalRuntimeJson(publicAttestation),
    ),
    runtimeSessionId,
  });
}
