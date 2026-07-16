#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
  echo "Source-bound runner builds require a clean tracked worktree." >&2
  exit 2
fi

SOURCE_COMMIT="$(git rev-parse --verify HEAD)"
SOURCE_TREE_SHA256="$(git ls-tree -r --full-tree "${SOURCE_COMMIT}" | sha256sum | cut -d ' ' -f 1)"
LOCAL_IMAGE_TAG="counterlab-runner:git-${SOURCE_COMMIT}"
OUTPUT="${1:-${ROOT_DIR}/data/releases/runner-build-${SOURCE_COMMIT}.json}"

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/counterlab-runner-build.XXXXXX")"
trap 'rm -rf "${TEMP_DIR}"' EXIT
ARCHIVE_PATH="${TEMP_DIR}/source.tar"
ARCHIVE_ROOT="${TEMP_DIR}/source"
mkdir -p "${ARCHIVE_ROOT}" "$(dirname "${OUTPUT}")"

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
