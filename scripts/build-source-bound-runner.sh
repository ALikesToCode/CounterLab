#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

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
    git diff --name-only --diff-filter=ACMRT --
    git diff --cached --name-only --diff-filter=ACMRT --
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
OUTPUT="$(repo_path "${1:-data/releases/runner-build-${SOURCE_COMMIT}.json}")"
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
BUILDCTL="$(repo_path "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1/bin/buildctl")"
BUILDKIT_ADDR="${COUNTERLAB_BUILDKIT_ADDR:-}"
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

node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const [output, sourceCommit, archiveHash, treeHash, dockerfileHash, imageTag, reportPath, layoutPath, builtAt] = process.argv.slice(1);
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const configDigest = report.normalizedConfigDigest;
  const manifestDigest = report.normalizedManifestDigest;
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
    schemaVersion: "1",
    status: "BUILT",
    sourceCommit,
    sourceArchiveSha256: archiveHash,
    sourceTreeSha256: treeHash,
    dockerfileSha256: dockerfileHash,
    localImageTag: imageTag,
    localImageDigest: configDigest,
    builtAt,
  };
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, output);
' "${OUTPUT}" "${SOURCE_COMMIT}" "${SOURCE_ARCHIVE_SHA256}" "${SOURCE_TREE_SHA256}" "${DOCKERFILE_SHA256}" "${LOCAL_IMAGE_TAG}" "${NORMALIZATION_REPORT}" "${NORMALIZED_OCI_LAYOUT}" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

LOCAL_IMAGE_DIGEST="$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.localImageDigest)' "${OUTPUT}")"
NORMALIZED_MANIFEST_DIGEST="$(node -e 'const fs=require("node:fs");const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));process.stdout.write(value.normalizedManifestDigest)' "${NORMALIZATION_REPORT}")"
echo "Source-bound runner built: ${LOCAL_IMAGE_TAG} (${LOCAL_IMAGE_DIGEST})"
echo "Normalized OCI manifest: ${NORMALIZED_MANIFEST_DIGEST}"
echo "Build receipt: ${OUTPUT}"
echo "Retained build workspace: ${BUILD_DIR}"
