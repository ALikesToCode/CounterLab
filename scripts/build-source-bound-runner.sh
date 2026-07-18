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

WORK_ROOT="$(repo_path "node_modules/.cache/counterlab-v6.1/runner-build-work")"
BUILD_ID="${SOURCE_COMMIT}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
BUILD_DIR="${WORK_ROOT}/${BUILD_ID}"
ARCHIVE_PATH="${BUILD_DIR}/source.tar"
ARCHIVE_ROOT="${BUILD_DIR}/source"
mkdir -p "${WORK_ROOT}" "$(dirname "${OUTPUT}")"
mkdir "${BUILD_DIR}"
mkdir "${ARCHIVE_ROOT}"

git archive --format=tar --output "${ARCHIVE_PATH}" "${SOURCE_COMMIT}"
SOURCE_ARCHIVE_SHA256="$(sha256sum "${ARCHIVE_PATH}" | cut -d ' ' -f 1)"
tar -xf "${ARCHIVE_PATH}" -C "${ARCHIVE_ROOT}"
DOCKERFILE_SHA256="$(sha256sum "${ARCHIVE_ROOT}/Dockerfile.runner" | cut -d ' ' -f 1)"

docker build \
  --platform linux/amd64 \
  --build-arg "COUNTERLAB_SOURCE_COMMIT=${SOURCE_COMMIT}" \
  --build-arg "COUNTERLAB_SOURCE_TREE_SHA256=${SOURCE_TREE_SHA256}" \
  --file "${ARCHIVE_ROOT}/Dockerfile.runner" \
  --tag "${LOCAL_IMAGE_TAG}" \
  "${ARCHIVE_ROOT}"

LOCAL_IMAGE_DIGEST="$(docker image inspect "${LOCAL_IMAGE_TAG}" --format '{{.Id}}')"
OCI_REVISION="$(docker image inspect "${LOCAL_IMAGE_TAG}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
OCI_SOURCE_TREE_SHA256="$(docker image inspect "${LOCAL_IMAGE_TAG}" --format '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}')"
IMAGE_USER="$(docker image inspect "${LOCAL_IMAGE_TAG}" --format '{{.Config.User}}')"

[[ "${LOCAL_IMAGE_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]] || {
  echo "Built runner did not expose a valid OCI digest." >&2
  exit 1
}
[[ "${OCI_REVISION}" == "${SOURCE_COMMIT}" ]] || {
  echo "Built runner OCI revision does not match its source commit." >&2
  exit 1
}
[[ "${OCI_SOURCE_TREE_SHA256}" == "${SOURCE_TREE_SHA256}" ]] || {
  echo "Built runner OCI tree label does not match its source tree." >&2
  exit 1
}
[[ "${IMAGE_USER}" == "10001:10001" ]] || {
  echo "Built runner must declare user 10001:10001." >&2
  exit 1
}

node -e '
  const fs = require("node:fs");
  const [output, sourceCommit, archiveHash, treeHash, dockerfileHash, imageTag, imageDigest, builtAt] = process.argv.slice(1);
  const receipt = {
    schemaVersion: "1",
    status: "BUILT",
    sourceCommit,
    sourceArchiveSha256: archiveHash,
    sourceTreeSha256: treeHash,
    dockerfileSha256: dockerfileHash,
    localImageTag: imageTag,
    localImageDigest: imageDigest,
    builtAt,
  };
  const temporary = `${output}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(temporary, output);
' "${OUTPUT}" "${SOURCE_COMMIT}" "${SOURCE_ARCHIVE_SHA256}" "${SOURCE_TREE_SHA256}" "${DOCKERFILE_SHA256}" "${LOCAL_IMAGE_TAG}" "${LOCAL_IMAGE_DIGEST}" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

echo "Source-bound runner built: ${LOCAL_IMAGE_TAG} (${LOCAL_IMAGE_DIGEST})"
echo "Build receipt: ${OUTPUT}"
echo "Retained build workspace: ${BUILD_DIR}"
