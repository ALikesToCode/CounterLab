#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}

CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
node scripts/assert-contained-path.mjs \
  "${CACHE_ROOT}" "${CACHE_ROOT}/home" "${CACHE_ROOT}/tmp" \
  "${CACHE_ROOT}/xdg-cache" "${CACHE_ROOT}/xdg-config" "${CACHE_ROOT}/xdg-data" \
  "${CACHE_ROOT}/gitconfig"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"
node scripts/assert-contained-path.mjs \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${GIT_CONFIG_GLOBAL}"
[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Source-bound runner builds require the verified CounterLab Git root." >&2
  exit 2
}

repo_path() {
  local requested="$1"
  local candidate
  local resolved
  if [[ "${requested}" == /* ]]; then
    candidate="${requested}"
  else
    candidate="${ROOT_DIR}/${requested#./}"
  fi
  case "${candidate}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*) ;;
    *)
      echo "Release paths must remain inside ${ROOT_DIR}: ${requested}" >&2
      return 2
      ;;
  esac
  case "/${candidate#${ROOT_DIR}/}/" in
    *"/../"*)
      echo "Release paths must not traverse parent directories: ${requested}" >&2
      return 2
      ;;
  esac
  resolved="$(realpath -m -- "${candidate}")"
  case "${resolved}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*) printf '%s\n' "${resolved}" ;;
    *)
      echo "Release path resolves outside ${ROOT_DIR}: ${requested}" >&2
      return 2
      ;;
  esac
}

mapfile -t DIRTY_PATHS < <(
  {
    git diff --name-only --
    git diff --cached --name-only --
    git ls-files --others --exclude-standard
  } | sort -u
)
for path in "${DIRTY_PATHS[@]}"; do
  case "${path}" in
    docs/sbom/*.json | \
    scientific-engines/evidence-catalog.json | \
    scientific-engines/fixtures/health/*.json | \
    scientific-engines/fixtures/integrity/*.json | \
    scientific-engines/licenses/manifest.json | \
    scientific-engines/notices/current-ml-engines.NOTICE.md | \
    scientific-engines/registry.json | \
    scientific-engines/runtime-manifest.json | \
    scientific-engines/snapshot-hash.json | \
    scientific-engines/snapshot.json | \
    scientific-engines/vex/*.json) ;;
    *)
      echo "Source-bound runner builds reject non-evidence tracked changes: ${path}" >&2
      exit 2
      ;;
  esac
done

SOURCE_COMMIT="$(git rev-parse --verify HEAD)"
SOURCE_TREE_SHA256="$(git ls-tree -r --full-tree "${SOURCE_COMMIT}" | sha256sum | cut -d ' ' -f 1)"
LOCAL_IMAGE_TAG="counterlab-runner:git-${SOURCE_COMMIT}"
ADAPTER_IMAGE_TAG="counterlab-adapter:git-${SOURCE_COMMIT}"
OUTPUT="$(repo_path "${1:-node_modules/.cache/counterlab-v6.1/releases/runner-build-${SOURCE_COMMIT}.json}")"
[[ ! -e "${OUTPUT}" ]] || {
  echo "Build receipt already exists; refusing to replace it: ${OUTPUT}" >&2
  exit 2
}

WORK_ROOT="$(repo_path "node_modules/.cache/counterlab-v6.1/runner-build-work")"
BUILD_ID="${SOURCE_COMMIT}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
BUILD_DIR="${WORK_ROOT}/${BUILD_ID}"
ARCHIVE_PATH="${BUILD_DIR}/source.tar"
ARCHIVE_ROOT="${BUILD_DIR}/source"
RAW_OCI_TAR="${BUILD_DIR}/runner.raw.oci.tar"
RAW_OCI_LAYOUT="${BUILD_DIR}/oci-layout-raw"
NORMALIZED_OCI_LAYOUT="${BUILD_DIR}/oci-layout-normalized"
NORMALIZED_OCI_TAR="${BUILD_DIR}/runner.oci.tar"
NORMALIZATION_REPORT="${BUILD_DIR}/normalization-report.json"
BUILD_METADATA="${BUILD_DIR}/build-metadata.json"
ADAPTER_RAW_OCI_TAR="${BUILD_DIR}/adapter.raw.oci.tar"
ADAPTER_OCI_LAYOUT="${BUILD_DIR}/adapter-oci-layout"
ADAPTER_OCI_REPORT="${BUILD_DIR}/adapter-oci-report.json"
ADAPTER_BUILD_METADATA="${BUILD_DIR}/adapter-build-metadata.json"
BUILDCTL="$(repo_path "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin/buildctl")"
BUILDKIT_ADDR="${COUNTERLAB_BUILDKIT_ADDR:-}"
RUNTIME_ADAPTER_INPUT="${COUNTERLAB_DOCKER_BIN:-}"
[[ -n "${RUNTIME_ADAPTER_INPUT}" ]] || {
  echo "COUNTERLAB_DOCKER_BIN must name the repository-contained runtime adapter." >&2
  exit 2
}
RUNTIME_ADAPTER="$(repo_path "${RUNTIME_ADAPTER_INPUT}")"
[[ -x "${RUNTIME_ADAPTER}" && ! -L "${RUNTIME_ADAPTER}" ]] || {
  echo "Repository-contained runtime adapter is unavailable." >&2
  exit 2
}
[[ -x "${BUILDCTL}" && ! -L "${BUILDCTL}" ]] || {
  echo "Pinned repository-contained buildctl is unavailable." >&2
  exit 2
}
case "${BUILDKIT_ADDR}" in
  "unix://${ROOT_DIR}"/*) ;;
  *)
    echo "COUNTERLAB_BUILDKIT_ADDR must name a repository-contained Unix socket." >&2
    exit 2
    ;;
esac
BUILDKIT_SOCKET="${BUILDKIT_ADDR#unix://}"
[[ -S "${BUILDKIT_SOCKET}" && ! -L "${BUILDKIT_SOCKET}" ]] || {
  echo "Repository-contained BuildKit socket is unavailable: ${BUILDKIT_SOCKET}" >&2
  exit 2
}
BUILDKIT_SOCKET="$(realpath -e -- "${BUILDKIT_SOCKET}")"
case "${BUILDKIT_SOCKET}" in
  "${ROOT_DIR}"/*) ;;
  *)
    echo "BuildKit socket resolves outside the repository." >&2
    exit 2
    ;;
esac

RUNTIME_ATTESTATION="$("${RUNTIME_ADAPTER}" counterlab-attest)"
readarray -t RUNTIME_BINDING < <(node - "${RUNTIME_ATTESTATION}" <<'NODE'
const value = JSON.parse(process.argv[2]);
const sha = /^[a-f0-9]{64}$/;
const exact = (object, keys, label) => {
  if (
    object === null ||
    typeof object !== "object" ||
    Array.isArray(object) ||
    JSON.stringify(Object.keys(object).sort()) !== JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} contains missing or unknown fields`);
  }
};
exact(value, [
  "schemaVersion",
  "status",
  "sessionId",
  "namespace",
  "runtimeToolchainSha256",
  "toolchainLockSha256",
  "adapterSha256",
  "componentSha256",
  "fileSha256",
  "containerdRootlesskitApiSocket",
  "containerdSocket",
  "runtimeCommandSocket",
  "buildkitSocket",
], "runtime attestation");
exact(value.componentSha256, [
  "buildctl",
  "buildkitd",
  "containerd",
  "containerd-shim-runc-v2",
  "nerdctl",
  "rootlesskit",
  "runc",
], "runtime component hashes");
exact(value.fileSha256, ["containerdConfig", "buildkitConfig"], "runtime file hashes");
if (
  value.schemaVersion !== "1" ||
  value.status !== "VERIFIED" ||
  value.namespace !== "counterlab-v6.1" ||
  !/^rt-[a-z0-9][a-z0-9-]{7,13}$/.test(value.sessionId) ||
  !Object.values(value.componentSha256).every((entry) => sha.test(entry)) ||
  !Object.values(value.fileSha256).every((entry) => sha.test(entry)) ||
  !sha.test(value.runtimeToolchainSha256) ||
  !sha.test(value.toolchainLockSha256) ||
  !sha.test(value.adapterSha256) ||
  !/^\.rt\/rt-[a-z0-9-]+\/run\/buildkitd\.sock$/.test(value.buildkitSocket)
) {
  throw new Error("runtime attestation identity is invalid");
}
for (const entry of [
  value.runtimeToolchainSha256,
  value.toolchainLockSha256,
  value.adapterSha256,
  value.componentSha256.buildctl,
  value.componentSha256.buildkitd,
  value.fileSha256.buildkitConfig,
  value.buildkitSocket,
]) {
  process.stdout.write(`${entry}\n`);
}
NODE
)
[[ "${#RUNTIME_BINDING[@]}" -eq 7 ]] || {
  echo "Runtime attestation did not produce the exact build binding." >&2
  exit 2
}
RUNTIME_TOOLCHAIN_SHA256="${RUNTIME_BINDING[0]}"
TOOLCHAIN_LOCK_SHA256="${RUNTIME_BINDING[1]}"
RUNTIME_ADAPTER_SHA256="${RUNTIME_BINDING[2]}"
BUILDCTL_SHA256="${RUNTIME_BINDING[3]}"
BUILDKITD_SHA256="${RUNTIME_BINDING[4]}"
BUILDKIT_CONFIG_SHA256="${RUNTIME_BINDING[5]}"
ATTESTED_BUILDKIT_ADDR="unix://${ROOT_DIR}/${RUNTIME_BINDING[6]}"
[[ "$(sha256sum "${BUILDCTL}" | cut -d ' ' -f 1)" == "${BUILDCTL_SHA256}" ]] || {
  echo "Pinned buildctl does not match the runtime attestation." >&2
  exit 2
}
[[ "${BUILDKIT_ADDR}" == "${ATTESTED_BUILDKIT_ADDR}" ]] || {
  echo "BuildKit address does not match the runtime attestation." >&2
  exit 2
}
mkdir -p "${WORK_ROOT}" "$(dirname "${OUTPUT}")"
mkdir "${BUILD_DIR}"

git archive --format=tar --output "${ARCHIVE_PATH}" "${SOURCE_COMMIT}"
SOURCE_ARCHIVE_SHA256="$(sha256sum "${ARCHIVE_PATH}" | cut -d ' ' -f 1)"
"${ROOT_DIR}/.venv/bin/python" - "${ROOT_DIR}" "${ARCHIVE_PATH}" "${ARCHIVE_ROOT}" <<'PY'
from pathlib import Path, PurePosixPath
import sys
import tarfile

root = Path(sys.argv[1]).resolve(strict=True)
archive = Path(sys.argv[2]).resolve(strict=True)
destination = Path(sys.argv[3])
parent = destination.parent.resolve(strict=True)
if root != parent and root not in parent.parents:
    raise SystemExit("source extraction parent escaped the repository")
if destination.exists():
    raise SystemExit("source extraction destination must be new")
destination.mkdir()
with tarfile.open(archive, mode="r:") as source:
    for member in source.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"source archive member escaped its root: {member.name}")
        if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
            raise SystemExit(f"source archive member has an unsafe type: {member.name}")
    source.extractall(destination, filter="data")
PY
DOCKERFILE_SHA256="$(sha256sum "${ARCHIVE_ROOT}/Dockerfile.runner" | cut -d ' ' -f 1)"

"${BUILDCTL}" \
  --addr "${BUILDKIT_ADDR}" \
  build \
  --progress plain \
  --frontend dockerfile.v0 \
  --local "context=${ARCHIVE_ROOT}" \
  --local "dockerfile=${ARCHIVE_ROOT}" \
  --opt filename=Dockerfile.runner \
  --opt platform=linux/amd64 \
  --opt "build-arg:COUNTERLAB_SOURCE_COMMIT=${SOURCE_COMMIT}" \
  --opt "build-arg:COUNTERLAB_SOURCE_TREE_SHA256=${SOURCE_TREE_SHA256}" \
  --output "type=oci,dest=${RAW_OCI_TAR},name=${LOCAL_IMAGE_TAG}" \
  --metadata-file "${BUILD_METADATA}"

[[ "$("${RUNTIME_ADAPTER}" counterlab-attest)" == "${RUNTIME_ATTESTATION}" ]] || {
  echo "Contained runtime attestation changed during the runner build." >&2
  exit 2
}

"${ROOT_DIR}/.venv/bin/python" - "${ROOT_DIR}" "${RAW_OCI_TAR}" "${RAW_OCI_LAYOUT}" <<'PY'
from pathlib import Path, PurePosixPath
import sys
import tarfile

root = Path(sys.argv[1]).resolve(strict=True)
archive = Path(sys.argv[2]).resolve(strict=True)
destination = Path(sys.argv[3])
parent = destination.parent.resolve(strict=True)
if root != parent and root not in parent.parents:
    raise SystemExit("OCI extraction parent escaped the repository")
if destination.exists():
    raise SystemExit("OCI extraction destination must be new")
destination.mkdir()
with tarfile.open(archive, mode="r:") as source:
    for member in source.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"OCI archive member escaped its root: {member.name}")
        if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
            raise SystemExit(f"OCI archive member has an unsafe type: {member.name}")
    source.extractall(destination, filter="data")
PY

"${ROOT_DIR}/.venv/bin/python" scripts/normalize_runner_oci.py \
  --repo-root "${ROOT_DIR}" \
  --source-layout "${RAW_OCI_LAYOUT}" \
  --output-layout "${NORMALIZED_OCI_LAYOUT}" \
  --report "${NORMALIZATION_REPORT}"
tar -C "${NORMALIZED_OCI_LAYOUT}" -cf "${NORMALIZED_OCI_TAR}" .
NORMALIZED_MANIFEST_DIGEST="$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.normalizedManifestDigest)' "${NORMALIZATION_REPORT}")"

LOCAL_OCI_ARCHIVE="$(realpath --relative-to="${ROOT_DIR}" "${NORMALIZED_OCI_TAR}")"
LOCAL_OCI_ARCHIVE_SHA256="$(sha256sum "${NORMALIZED_OCI_TAR}" | cut -d ' ' -f 1)"

ADAPTER_DOCKERFILE_SHA256="$(sha256sum "${ARCHIVE_ROOT}/services/runner/Dockerfile" | cut -d ' ' -f 1)"
"${BUILDCTL}" \
  --addr "${BUILDKIT_ADDR}" \
  build \
  --progress plain \
  --frontend dockerfile.v0 \
  --local "context=${ARCHIVE_ROOT}" \
  --local "dockerfile=${ARCHIVE_ROOT}" \
  --opt filename=services/runner/Dockerfile \
  --opt platform=linux/amd64 \
  --opt "build-arg:COUNTERLAB_SOURCE_COMMIT=${SOURCE_COMMIT}" \
  --opt "build-arg:COUNTERLAB_SOURCE_TREE_SHA256=${SOURCE_TREE_SHA256}" \
  --output "type=oci,dest=${ADAPTER_RAW_OCI_TAR},name=${ADAPTER_IMAGE_TAG}" \
  --metadata-file "${ADAPTER_BUILD_METADATA}"

[[ "$("${RUNTIME_ADAPTER}" counterlab-attest)" == "${RUNTIME_ATTESTATION}" ]] || {
  echo "Contained runtime attestation changed during the adapter build." >&2
  exit 2
}

"${ROOT_DIR}/.venv/bin/python" - "${ROOT_DIR}" "${ADAPTER_RAW_OCI_TAR}" "${ADAPTER_OCI_LAYOUT}" <<'PY'
from pathlib import Path, PurePosixPath
import sys
import tarfile

root = Path(sys.argv[1]).resolve(strict=True)
archive = Path(sys.argv[2]).resolve(strict=True)
destination = Path(sys.argv[3])
parent = destination.parent.resolve(strict=True)
if root != parent and root not in parent.parents:
    raise SystemExit("adapter OCI extraction parent escaped the repository")
if destination.exists():
    raise SystemExit("adapter OCI extraction destination must be new")
destination.mkdir()
with tarfile.open(archive, mode="r:") as source:
    for member in source.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or ".." in path.parts:
            raise SystemExit(f"adapter OCI member escaped its root: {member.name}")
        if member.issym() or member.islnk() or not (member.isdir() or member.isfile()):
            raise SystemExit(f"adapter OCI member has an unsafe type: {member.name}")
    source.extractall(destination, filter="data")
PY

node - "${ADAPTER_OCI_LAYOUT}" "${ADAPTER_OCI_REPORT}" "${SOURCE_COMMIT}" "${SOURCE_TREE_SHA256}" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const [layout, output, sourceCommit, sourceTreeSha256] = process.argv.slice(2);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const descriptor = (value, label) => {
  if (
    value === null ||
    typeof value !== "object" ||
    !/^sha256:[a-f0-9]{64}$/.test(value.digest ?? "")
  ) {
    throw new Error(`${label} descriptor is invalid`);
  }
  return value;
};
const blob = (value, label) => {
  const entry = descriptor(value, label);
  const bytes = readFileSync(
    join(layout, "blobs", "sha256", entry.digest.slice(7)),
  );
  if (`sha256:${sha256(bytes)}` !== entry.digest || bytes.length !== entry.size) {
    throw new Error(`${label} blob does not match its descriptor`);
  }
  return bytes;
};
const index = JSON.parse(readFileSync(join(layout, "index.json"), "utf8"));
if (!Array.isArray(index.manifests) || index.manifests.length !== 1) {
  throw new Error("adapter OCI layout must contain exactly one manifest");
}
const manifestDescriptor = descriptor(index.manifests[0], "adapter manifest");
const manifest = JSON.parse(blob(manifestDescriptor, "adapter manifest"));
if (manifest.schemaVersion !== 2) {
  throw new Error("adapter OCI manifest version is invalid");
}
const configDescriptor = descriptor(manifest.config, "adapter config");
const config = JSON.parse(blob(configDescriptor, "adapter config"));
if (
  config.config?.User !== "65532:65532" ||
  JSON.stringify(config.config?.Entrypoint) !==
    JSON.stringify(["python", "/opt/counterlab/harness.py"]) ||
  config.config?.Labels?.["org.opencontainers.image.revision"] !== sourceCommit ||
  config.config?.Labels?.["io.counterlab.source-tree-sha256"] !==
    sourceTreeSha256
) {
  throw new Error("adapter image is not bound to the expected non-root source");
}
writeFileSync(
  output,
  `${JSON.stringify(
    {
      imageDigest: configDescriptor.digest,
      manifestDigest: manifestDescriptor.digest,
      ociRevision: sourceCommit,
      ociSourceTreeSha256: sourceTreeSha256,
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 },
);
NODE

ADAPTER_OCI_ARCHIVE="$(realpath --relative-to="${ROOT_DIR}" "${ADAPTER_RAW_OCI_TAR}")"
ADAPTER_OCI_ARCHIVE_SHA256="$(sha256sum "${ADAPTER_RAW_OCI_TAR}" | cut -d ' ' -f 1)"

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [output, sourceCommit, archiveHash, treeHash, dockerfileHash, imageTag, reportPath, layoutPath, claimedManifestDigest, ociArchive, ociArchiveHash, adapterDockerfileSha256, adapterImageTag, adapterReportPath, adapterOciArchive, adapterOciArchiveHash, runtimeToolchainSha256, toolchainLockSha256, runtimeAdapterSha256, buildctlSha256, buildkitdSha256, buildkitConfigSha256, builtAt] = process.argv.slice(1);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const adapterReport = JSON.parse(fs.readFileSync(adapterReportPath, "utf8"));
  const configDigest = report.normalizedConfigDigest;
  const manifestDigest = report.normalizedManifestDigest;
  if (claimedManifestDigest !== manifestDigest) {
    throw new Error("Normalized OCI manifest changed before receipt creation");
  }
  if (!/^sha256:[a-f0-9]{64}$/.test(configDigest) || !/^sha256:[a-f0-9]{64}$/.test(manifestDigest)) {
    throw new Error("Normalized OCI report exposes invalid digests");
  }
  const configPath = path.join(layoutPath, "blobs", "sha256", configDigest.slice(7));
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  if (
    config.config?.User !== "10001:10001" ||
    JSON.stringify(config.config?.Entrypoint) !== JSON.stringify(["/usr/local/bin/node", "/app/runner.mjs"]) ||
    config.config?.Labels?.["org.opencontainers.image.revision"] !== sourceCommit ||
    config.config?.Labels?.["io.counterlab.source-tree-sha256"] !== treeHash
  ) {
    throw new Error("Normalized runner config is not bound to the expected non-root source");
  }
  const receipt = {
    schemaVersion: "3",
    status: "BUILT",
    sourceCommit,
    sourceArchiveSha256: archiveHash,
    sourceTreeSha256: treeHash,
    dockerfileSha256: dockerfileHash,
    localImageTag: imageTag,
    localImageDigest: configDigest,
    localManifestDigest: manifestDigest,
    localOciArchive: ociArchive,
    localOciArchiveSha256: ociArchiveHash,
    adapterDockerfileSha256,
    adapterImageTag,
    adapterImageDigest: adapterReport.imageDigest,
    adapterManifestDigest: adapterReport.manifestDigest,
    adapterOciArchive,
    adapterOciArchiveSha256: adapterOciArchiveHash,
    adapterOciRevision: adapterReport.ociRevision,
    adapterOciSourceTreeSha256: adapterReport.ociSourceTreeSha256,
    runtimeToolchainSha256,
    toolchainLockSha256,
    runtimeAdapterSha256,
    buildctlSha256,
    buildkitdSha256,
    buildkitConfigSha256,
    builtAt,
  };
  for (const field of ["imageDigest", "manifestDigest"]) {
    if (!/^sha256:[a-f0-9]{64}$/.test(adapterReport[field] ?? "")) {
      throw new Error(`Adapter OCI report has an invalid ${field}`);
    }
  }
  if (
    adapterReport.ociRevision !== sourceCommit ||
    adapterReport.ociSourceTreeSha256 !== treeHash
  ) {
    throw new Error("Adapter OCI report changed before receipt creation");
  }
  fs.writeFileSync(output, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
' "${OUTPUT}" "${SOURCE_COMMIT}" "${SOURCE_ARCHIVE_SHA256}" "${SOURCE_TREE_SHA256}" "${DOCKERFILE_SHA256}" "${LOCAL_IMAGE_TAG}" "${NORMALIZATION_REPORT}" "${NORMALIZED_OCI_LAYOUT}" "${NORMALIZED_MANIFEST_DIGEST}" "${LOCAL_OCI_ARCHIVE}" "${LOCAL_OCI_ARCHIVE_SHA256}" "${ADAPTER_DOCKERFILE_SHA256}" "${ADAPTER_IMAGE_TAG}" "${ADAPTER_OCI_REPORT}" "${ADAPTER_OCI_ARCHIVE}" "${ADAPTER_OCI_ARCHIVE_SHA256}" "${RUNTIME_TOOLCHAIN_SHA256}" "${TOOLCHAIN_LOCK_SHA256}" "${RUNTIME_ADAPTER_SHA256}" "${BUILDCTL_SHA256}" "${BUILDKITD_SHA256}" "${BUILDKIT_CONFIG_SHA256}" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

LOCAL_IMAGE_DIGEST="$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.localImageDigest)' "${OUTPUT}")"
ADAPTER_IMAGE_DIGEST="$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.adapterImageDigest)' "${OUTPUT}")"
echo "Source-bound runner built: ${LOCAL_IMAGE_TAG} (${LOCAL_IMAGE_DIGEST})"
echo "Source-bound adapter built: ${ADAPTER_IMAGE_TAG} (${ADAPTER_IMAGE_DIGEST})"
echo "Normalized OCI manifest: ${NORMALIZED_MANIFEST_DIGEST}"
echo "Build receipt: ${OUTPUT}"
echo "Retained build workspace: ${BUILD_DIR}"
