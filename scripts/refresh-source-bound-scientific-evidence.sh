#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}

BUILD_RECEIPT="${1:-}"
[[ -n "${BUILD_RECEIPT}" ]] || {
  echo "Usage: ./scripts/refresh-source-bound-scientific-evidence.sh <build-receipt-v4.json>" >&2
  exit 2
}

CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
node scripts/assert-contained-path.mjs "${CACHE_ROOT}"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
node scripts/assert-contained-path.mjs \
  "${HOME}" \
  "${TMPDIR}" \
  "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" \
  "${GIT_CONFIG_GLOBAL}"
[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Evidence refresh requires the verified CounterLab Git root." >&2
  exit 2
}
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"
node scripts/assert-contained-path.mjs \
  "${HOME}" \
  "${TMPDIR}" \
  "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" \
  "${GIT_CONFIG_GLOBAL}"

LOCK_FILE="${CACHE_ROOT}/scientific-evidence-refresh.lock"
node scripts/assert-contained-path.mjs "${LOCK_FILE}"
FLOCK_BIN="$(command -v flock || true)"
[[ -n "${FLOCK_BIN}" ]] || {
  echo "The repository evidence refresh requires flock." >&2
  exit 2
}
[[ ! -L "${LOCK_FILE}" ]] || {
  echo "Evidence refresh lock must not be a symlink." >&2
  exit 2
}
touch "${LOCK_FILE}"
node scripts/assert-contained-path.mjs "${LOCK_FILE}"
[[ -f "${LOCK_FILE}" && ! -L "${LOCK_FILE}" ]] || {
  echo "Evidence refresh lock is not a regular repository file." >&2
  exit 2
}
exec 9<>"${LOCK_FILE}"
"${FLOCK_BIN}" -n 9 || {
  echo "Another exact-image evidence refresh is already running." >&2
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
    *) echo "Evidence path escaped the repository: ${requested}" >&2; return 2 ;;
  esac
  case "/${candidate#${ROOT_DIR}/}/" in
    *"/../"*) echo "Evidence path traversed a parent: ${requested}" >&2; return 2 ;;
  esac
  [[ ! -L "${candidate}" ]] || {
    echo "Evidence path must not be a symlink: ${requested}" >&2
    return 2
  }
  resolved="$(realpath -m -- "${candidate}")"
  case "${resolved}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*) printf '%s\n' "${resolved}" ;;
    *) echo "Evidence path resolved outside the repository: ${requested}" >&2; return 2 ;;
  esac
}

BUILD_RECEIPT="$(repo_path "${BUILD_RECEIPT}")"
[[ -f "${BUILD_RECEIPT}" && ! -L "${BUILD_RECEIPT}" ]] || {
  echo "Build receipt is not a regular repository file: ${BUILD_RECEIPT}" >&2
  exit 2
}

readarray -t BUILD_IDENTITY < <(
  node - "${BUILD_RECEIPT}" <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const sha = /^[a-f0-9]{64}$/;
const shaFields = [
  "sourceArchiveSha256",
  "sourceTreeSha256",
  "dockerfileSha256",
  "localOciArchiveSha256",
  "adapterDockerfileSha256",
  "adapterOciArchiveSha256",
  "adapterOciSourceTreeSha256",
  "runtimeToolchainSha256",
  "runtimePolicySha256",
  "proofDependencyManifestSha256",
  "toolchainLockSha256",
  "runtimeAdapterSha256",
  "buildctlSha256",
  "buildkitdSha256",
  "buildkitConfigSha256",
];
if (
  value?.schemaVersion !== "4" ||
  value?.status !== "BUILT" ||
  !/^[a-f0-9]{40}$/.test(value.sourceCommit ?? "") ||
  shaFields.some((field) => !sha.test(value[field] ?? "")) ||
  value.localImageTag !== `counterlab-runner:git-${value.sourceCommit}` ||
  !/^sha256:[a-f0-9]{64}$/.test(value.localImageDigest ?? "") ||
  !/^sha256:[a-f0-9]{64}$/.test(value.localManifestDigest ?? "") ||
  typeof value.localOciArchive !== "string" ||
  value.adapterImageTag !== `counterlab-adapter:git-${value.sourceCommit}` ||
  !/^sha256:[a-f0-9]{64}$/.test(value.adapterImageDigest ?? "") ||
  !/^sha256:[a-f0-9]{64}$/.test(value.adapterManifestDigest ?? "") ||
  typeof value.adapterOciArchive !== "string" ||
  value.adapterOciRevision !== value.sourceCommit ||
  !Number.isFinite(Date.parse(value.builtAt ?? ""))
) throw new Error("Build receipt identity is invalid");
for (const entry of [
  value.sourceCommit,
  value.sourceTreeSha256,
  value.localImageTag,
  value.localImageDigest,
  value.localManifestDigest,
  value.localOciArchive,
  value.localOciArchiveSha256,
]) process.stdout.write(`${entry}\n`);
NODE
)
[[ "${#BUILD_IDENTITY[@]}" -eq 7 ]] || {
  echo "Build receipt did not expose one exact image identity." >&2
  exit 2
}
SOURCE_COMMIT="${BUILD_IDENTITY[0]}"
SOURCE_TREE_SHA256="${BUILD_IDENTITY[1]}"
IMAGE="${BUILD_IDENTITY[2]}"
IMAGE_DIGEST="${BUILD_IDENTITY[3]}"
MANIFEST_DIGEST="${BUILD_IDENTITY[4]}"
OCI_ARCHIVE="$(repo_path "${BUILD_IDENTITY[5]}")"
OCI_ARCHIVE_SHA256="${BUILD_IDENTITY[6]}"

[[ "$(git rev-parse HEAD)" == "${SOURCE_COMMIT}" ]] || {
  echo "Evidence refresh requires HEAD to equal the runner source commit." >&2
  exit 2
}
[[ -f "${OCI_ARCHIVE}" && ! -L "${OCI_ARCHIVE}" ]] || {
  echo "Source-bound OCI archive is unavailable." >&2
  exit 2
}
[[ "$(sha256sum "${OCI_ARCHIVE}" | cut -d ' ' -f 1)" == "${OCI_ARCHIVE_SHA256}" ]] || {
  echo "Source-bound OCI archive hash does not match the build receipt." >&2
  exit 2
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
    docs/sbom/node.cdx.json | \
    docs/sbom/runner-container.cdx.json | \
    docs/sbom/grype-raw.json | \
    docs/sbom/grype-vex-applied.json | \
    docs/sbom/grype-vex-negative-control.json | \
    docs/sbom/manifest.json | \
    docs/sbom/vulnerability-report.json | \
    docs/sbom/vex-application-report.json | \
    scientific-engines/evidence-catalog.json | \
    scientific-engines/fixtures/health/counterlab-fixed-ml-kernel-health-v1.json | \
    scientific-engines/fixtures/health/numpy-health-v1.json | \
    scientific-engines/fixtures/health/pandas-health-v1.json | \
    scientific-engines/fixtures/health/scikit-learn-health-v1.json | \
    scientific-engines/fixtures/integrity/counterlab-fixed-ml-kernel-0.1.0.json | \
    scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json | \
    scientific-engines/fixtures/integrity/cpython-runtime-3.13.14.json | \
    scientific-engines/fixtures/integrity/local-candidate-ml-runtime.json | \
    scientific-engines/fixtures/integrity/numpy-2.4.6.json | \
    scientific-engines/fixtures/integrity/pandas-2.3.3.json | \
    scientific-engines/fixtures/integrity/scikit-learn-1.9.0.json | \
    scientific-engines/fixtures/validation/internal-mutations-integrity-v2.json | \
    scientific-engines/fixtures/validation/internal-oracle-integrity-v2.json | \
    scientific-engines/fixtures/validation/internal-renderer-integrity-v2.json | \
    scientific-engines/fixtures/validation/signed-result-binding-v2.json | \
    scientific-engines/licenses/manifest.json | \
    scientific-engines/notices/current-ml-engines.NOTICE.md | \
    scientific-engines/registry.json | \
    scientific-engines/runtime-manifest.json | \
    scientific-engines/snapshot-hash.json | \
    scientific-engines/snapshot.json | \
    scientific-engines/subject-pack-bindings.json | \
    scientific-engines/vex/cpython-html-parser-v1.openvex.json) ;;
    *)
      echo "Evidence refresh rejects non-evidence worktree changes: ${path}" >&2
      exit 2
      ;;
  esac
done

RUNTIME_ADAPTER_INPUT="${COUNTERLAB_DOCKER_BIN:-}"
[[ -n "${RUNTIME_ADAPTER_INPUT}" ]] || {
  echo "COUNTERLAB_DOCKER_BIN must name the repository-contained runtime adapter." >&2
  exit 2
}
RUNTIME_ADAPTER="$(repo_path "${RUNTIME_ADAPTER_INPUT}")"
RUNTIME_SESSION_ID="${COUNTERLAB_RUNTIME_SESSION_ID:-}"
[[ -x "${RUNTIME_ADAPTER}" && ! -L "${RUNTIME_ADAPTER}" ]] || {
  echo "Contained runtime adapter is unavailable." >&2
  exit 2
}
[[ "${RUNTIME_SESSION_ID}" =~ ^rt-[a-z0-9][a-z0-9-]{7,13}$ ]] || {
  echo "COUNTERLAB_RUNTIME_SESSION_ID must identify the contained runtime." >&2
  exit 2
}
RUNTIME_COMMAND=(
  "${RUNTIME_ADAPTER}"
  --session-id
  "${RUNTIME_SESSION_ID}"
  --
)
CONTAINERD_SOCKET="$(repo_path ".rt/${RUNTIME_SESSION_ID}/run/containerd.sock")"
[[ -S "${CONTAINERD_SOCKET}" ]] || {
  echo "Contained runtime image socket is unavailable." >&2
  exit 2
}
RUNTIME_ATTESTATION="$(
  "${RUNTIME_COMMAND[@]}" counterlab-attest
)"
[[ -n "${RUNTIME_ATTESTATION}" ]] || {
  echo "Contained runtime attestation returned no evidence." >&2
  exit 2
}

TOOLS="$(repo_path "node_modules/.cache/counterlab-v6.1/tools")"
DOWNLOADS="${TOOLS}/downloads"
SYFT_DIR="${TOOLS}/syft-1.44.0"
GRYPE_DIR="${TOOLS}/grype-0.112.0"
SYFT_ARCHIVE="${DOWNLOADS}/syft_1.44.0_linux_amd64.tar.gz"
GRYPE_ARCHIVE="${DOWNLOADS}/grype_0.112.0_linux_amd64.tar.gz"
SYFT="${SYFT_DIR}/syft"
GRYPE="${GRYPE_DIR}/grype"
GRYPE_CONFIG="$(repo_path "scripts/grype-release.yaml")"
SYFT_CONFIG="$(repo_path "scripts/syft-release.yaml")"
node scripts/assert-contained-path.mjs \
  "${TOOLS}" \
  "${DOWNLOADS}" \
  "${SYFT_DIR}" \
  "${GRYPE_DIR}" \
  "${SYFT_ARCHIVE}" \
  "${GRYPE_ARCHIVE}" \
  "${SYFT}" \
  "${GRYPE}" \
  "${GRYPE_CONFIG}" \
  "${SYFT_CONFIG}"
mkdir -p "${DOWNLOADS}" "${SYFT_DIR}" "${GRYPE_DIR}"
node scripts/assert-contained-path.mjs \
  "${TOOLS}" \
  "${DOWNLOADS}" \
  "${SYFT_DIR}" \
  "${GRYPE_DIR}" \
  "${SYFT_ARCHIVE}" \
  "${GRYPE_ARCHIVE}" \
  "${SYFT}" \
  "${GRYPE}" \
  "${GRYPE_CONFIG}" \
  "${SYFT_CONFIG}"

if [[ ! -f "${SYFT_ARCHIVE}" ]]; then
  curl --fail --location --silent --show-error \
    --output "${SYFT_ARCHIVE}" \
    https://github.com/anchore/syft/releases/download/v1.44.0/syft_1.44.0_linux_amd64.tar.gz
fi
if [[ ! -f "${GRYPE_ARCHIVE}" ]]; then
  curl --fail --location --silent --show-error \
    --output "${GRYPE_ARCHIVE}" \
    https://github.com/anchore/grype/releases/download/v0.112.0/grype_0.112.0_linux_amd64.tar.gz
fi
[[ "$(sha256sum "${SYFT_ARCHIVE}" | cut -d ' ' -f 1)" == "0e91737aee2b5baf1d255b959630194a302335d848ff97bb07921eb6205b5f5a" ]] || {
  echo "Pinned Syft archive hash mismatch." >&2; exit 2;
}
[[ "$(sha256sum "${GRYPE_ARCHIVE}" | cut -d ' ' -f 1)" == "acb14a030010fe9bdb9594b4ae108d9d14ef2f926d936aa0916dc62c89c058ea" ]] || {
  echo "Pinned Grype archive hash mismatch." >&2; exit 2;
}
if [[ ! -f "${SYFT}" ]]; then
  tar -xzf "${SYFT_ARCHIVE}" -C "${SYFT_DIR}" syft
fi
if [[ ! -f "${GRYPE}" ]]; then
  tar -xzf "${GRYPE_ARCHIVE}" -C "${GRYPE_DIR}" grype
fi
[[ -x "${SYFT}" && ! -L "${SYFT}" && "$(sha256sum "${SYFT}" | cut -d ' ' -f 1)" == "23d4e25a32026ab27351c3c044a40bcc51311c00b8bb990aa204bec4b0bb19cd" ]] || {
  echo "Pinned Syft binary hash mismatch." >&2; exit 2;
}
[[ -x "${GRYPE}" && ! -L "${GRYPE}" && "$(sha256sum "${GRYPE}" | cut -d ' ' -f 1)" == "d515f53bd5ee4930e144c6ea14a2659084763c336a1833b723db0b05080fcaf5" ]] || {
  echo "Pinned Grype binary hash mismatch." >&2; exit 2;
}
[[ -f "${GRYPE_CONFIG}" && ! -L "${GRYPE_CONFIG}" ]] || {
  echo "Pinned Grype release configuration is unavailable." >&2
  exit 2
}
[[ -f "${SYFT_CONFIG}" && ! -L "${SYFT_CONFIG}" ]] || {
  echo "Pinned Syft release configuration is unavailable." >&2
  exit 2
}
CONFIG_VALIDATION_CACHE="$(repo_path "node_modules/.cache/counterlab-v6.1/scanner-config/grype-db")"
node scripts/assert-contained-path.mjs "${CONFIG_VALIDATION_CACHE}"
mkdir -p "${CONFIG_VALIDATION_CACHE}"
node scripts/assert-contained-path.mjs "${CONFIG_VALIDATION_CACHE}"
export GRYPE_DB_CACHE_DIR="${CONFIG_VALIDATION_CACHE}"
GRYPE_CONFIG_REPORT="$("${GRYPE}" --config "${GRYPE_CONFIG}" config --load)"
SYFT_CONFIG_REPORT="$("${SYFT}" --config "${SYFT_CONFIG}" config --load)"
[[ -n "${GRYPE_CONFIG_REPORT}" && -n "${SYFT_CONFIG_REPORT}" ]] || {
  echo "Pinned scanner configuration validation returned no evidence." >&2
  exit 2
}

RUN_ID="${SOURCE_COMMIT}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
WORK="$(repo_path "node_modules/.cache/counterlab-v6.1/scientific-evidence-${RUN_ID}")"
node scripts/assert-contained-path.mjs "${WORK}"
[[ ! -e "${WORK}" ]] || {
  echo "Evidence work directory already exists: ${WORK}" >&2
  exit 2
}
mkdir "${WORK}"
node scripts/assert-contained-path.mjs "${WORK}"
export GRYPE_DB_CACHE_DIR="${WORK}/grype-db"
export GRYPE_DB_AUTO_UPDATE=false
export GRYPE_DB_REQUIRE_UPDATE_CHECK=false
export GRYPE_CHECK_FOR_APP_UPDATE=false
export GRYPE_EXTERNAL_SOURCES_ENABLE=false
export SYFT_CHECK_FOR_APP_UPDATE=false

"${RUNTIME_COMMAND[@]}" load --platform linux/amd64 --input "${OCI_ARCHIVE}"
[[ "$("${RUNTIME_COMMAND[@]}" image inspect "${IMAGE}" --format '{{.Id}}')" == "${IMAGE_DIGEST}" ]] || {
  echo "Loaded image digest does not match the build receipt." >&2
  exit 2
}
[[ "$("${RUNTIME_COMMAND[@]}" image inspect "${IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "${SOURCE_COMMIT}" ]] || {
  echo "Loaded image source revision does not match the build receipt." >&2
  exit 2
}
[[ "$("${RUNTIME_COMMAND[@]}" image inspect "${IMAGE}" --format '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}')" == "${SOURCE_TREE_SHA256}" ]] || {
  echo "Loaded image source-tree label does not match the build receipt." >&2
  exit 2
}

"${SYFT}" --config "${SYFT_CONFIG}" scan "oci-archive:${OCI_ARCHIVE}" \
  --source-name counterlab-runner \
  --source-version "git-${SOURCE_COMMIT}" \
  --output "cyclonedx-json=${WORK}/runner-container.cdx.json"
scripts/run-contained-pnpm.sh sbom \
  --lockfile-only \
  --prod \
  --sbom-format cyclonedx \
  --sbom-spec-version 1.6 \
  --out "${WORK}/node.cdx.json"
node --import tsx scripts/normalize-cyclonedx.ts \
  "${WORK}/node.cdx.json" \
  "${WORK}/runner-container.cdx.json"
CONTAINER_SBOM_SHA256="$(sha256sum "${WORK}/runner-container.cdx.json" | cut -d ' ' -f 1)"

"${GRYPE}" --config "${GRYPE_CONFIG}" db update
curl --fail --location --silent --show-error \
  --output "${WORK}/cisa-kev.json" \
  https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json

"${GRYPE}" --config "${GRYPE_CONFIG}" "oci-archive:${OCI_ARCHIVE}" \
  --name "${IMAGE}" \
  --output json \
  --file "${WORK}/grype-raw.json"
node --import tsx scripts/normalize-release-evidence.ts "${WORK}/grype-raw.json"
REVIEWED_AT="$(node -e 'process.stdout.write(new Date().toISOString())')"

node --import tsx scripts/prepare-source-bound-vex.ts \
  --build-receipt "${BUILD_RECEIPT}" \
  --container-sbom "${WORK}/runner-container.cdx.json" \
  --raw "${WORK}/grype-raw.json" \
  --kev "${WORK}/cisa-kev.json" \
  --generated-at "${REVIEWED_AT}" \
  --review-output "${WORK}/reachability-review.json" \
  --vex-output "${WORK}/vex.json" \
  --negative-vex-output "${WORK}/negative-vex.json"

HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
[[ "${HOST_UID}" != "0" && "${HOST_GID}" != "0" ]] || {
  echo "Exact-image evidence refuses a root host identity." >&2
  exit 2
}
"${RUNTIME_COMMAND[@]}" run \
  --rm \
  --name "counterlab-reachability-${SOURCE_COMMIT:0:12}-$$" \
  --pull=never \
  --network=none \
  --read-only \
  --user="${HOST_UID}:${HOST_GID}" \
  --cap-drop=ALL \
  --security-opt=no-new-privileges=true \
  --ipc=private \
  --pids-limit=32 \
  --memory=1024m \
  --memory-swap=1024m \
  --cpus=2.0 \
  --ulimit=cpu=300:300 \
  --ulimit=as=8589934592:8589934592 \
  --ulimit=fsize=1048576:1048576 \
  --ulimit=nofile=64:64 \
  --tmpfs="/counterlab-runtime:rw,noexec,nosuid,nodev,size=256m,uid=${HOST_UID},gid=${HOST_GID},mode=0700" \
  --env=TMPDIR=/counterlab-runtime \
  --mount "type=bind,src=${ROOT_DIR}/scripts/probe_cpython_htmlparser_reachability.py,dst=/repo/scripts/probe_cpython_htmlparser_reachability.py,readonly" \
  --mount "type=bind,src=${ROOT_DIR}/fixtures/public,dst=/repo/fixtures/public,readonly" \
  --mount "type=bind,src=${ROOT_DIR}/fixtures/notebooks,dst=/repo/fixtures/notebooks,readonly" \
  --mount "type=bind,src=${WORK}/reachability-review.json,dst=/repo/reachability-review.json,readonly" \
  --workdir=/repo \
  --entrypoint=python \
  "${IMAGE}" \
  /repo/scripts/probe_cpython_htmlparser_reachability.py \
  --root /repo \
  --image-digest "${IMAGE_DIGEST}" \
  --source-commit "${SOURCE_COMMIT}" \
  --sbom-sha256 "${CONTAINER_SBOM_SHA256}" \
  --review-file /repo/reachability-review.json >"${WORK}/reachability.json"

node --import tsx scripts/summarize-grype-scan.ts \
  --raw "${WORK}/grype-raw.json" \
  --reachability "${WORK}/reachability.json" \
  --output "${WORK}/vulnerability-report.json" \
  --image-digest "${IMAGE_DIGEST}" \
  --manifest-digest "${MANIFEST_DIGEST}" \
  --environment-id counterlab-runner-linux-amd64-v2 \
  --environment-kind local_candidate \
  --raw-evidence-id grype-raw-scan-v2 \
  --scanner-binary-sha256 d515f53bd5ee4930e144c6ea14a2659084763c336a1833b723db0b05080fcaf5 \
  --vex-evidence-id cpython-html-parser-vex-v1 \
  --reachability-evidence-id cpython-html-parser-reachability-v2

env \
  CONTAINERD_ADDRESS="${CONTAINERD_SOCKET}" \
  CONTAINERD_NAMESPACE=counterlab-v6.1 \
  "${GRYPE}" --config "${GRYPE_CONFIG}" "${IMAGE}" \
  --name "${IMAGE}" \
  --vex "${WORK}/vex.json" \
  --output json \
  --file "${WORK}/grype-vex-applied.json"
env \
  CONTAINERD_ADDRESS="${CONTAINERD_SOCKET}" \
  CONTAINERD_NAMESPACE=counterlab-v6.1 \
  "${GRYPE}" --config "${GRYPE_CONFIG}" "${IMAGE}" \
  --name "${IMAGE}" \
  --vex "${WORK}/negative-vex.json" \
  --output json \
  --file "${WORK}/grype-vex-negative-control.json"
node --import tsx scripts/normalize-release-evidence.ts \
  "${WORK}/grype-vex-applied.json" \
  "${WORK}/grype-vex-negative-control.json"

node --import tsx scripts/summarize-vex-application.ts \
  --baseline "${WORK}/grype-raw.json" \
  --applied "${WORK}/grype-vex-applied.json" \
  --negative "${WORK}/grype-vex-negative-control.json" \
  --vex "${WORK}/vex.json" \
  --vulnerability-report "${WORK}/vulnerability-report.json" \
  --output "${WORK}/vex-application-report.json" \
  --image-digest "${IMAGE_DIGEST}" \
  --manifest-digest "${MANIFEST_DIGEST}" \
  --loaded-image-tag "${IMAGE}" \
  --source-commit "${SOURCE_COMMIT}" \
  --source-tree-sha256 "${SOURCE_TREE_SHA256}" \
  --scanner-binary-sha256 d515f53bd5ee4930e144c6ea14a2659084763c336a1833b723db0b05080fcaf5 \
  --baseline-evidence-id grype-raw-scan-v2 \
  --applied-evidence-id grype-vex-applied-v1 \
  --negative-evidence-id grype-vex-negative-v1 \
  --negative-subcomponent pkg:generic/python-negative-control@3.13.14

SNAPSHOT_GENERATED_AT="$(node -e 'process.stdout.write(new Date().toISOString())')"
node --import tsx scripts/bind-source-bound-scientific-evidence.ts \
  --build-receipt "${BUILD_RECEIPT}" \
  --work "${WORK}" \
  --generated-at "${SNAPSHOT_GENERATED_AT}" \
  --mode check

node --import tsx scripts/bind-source-bound-scientific-evidence.ts \
  --build-receipt "${BUILD_RECEIPT}" \
  --work "${WORK}" \
  --generated-at "${SNAPSHOT_GENERATED_AT}" \
  --mode write

node --import tsx scripts/refresh-scientific-engine-bindings.ts --check
COUNTERLAB_DOCKER_BIN="${RUNTIME_ADAPTER}" \
  ./scripts/verify-scientific-engines.sh \
    --image "${IMAGE}" \
    --expected-image-digest "${IMAGE_DIGEST}" \
    --runtime-report "${WORK}/runtime-verification.json"

RECEIPT="${WORK}/evidence-refresh-receipt.json"
node - \
  "${RECEIPT}" \
  "${SOURCE_COMMIT}" \
  "${IMAGE_DIGEST}" \
  "${OCI_ARCHIVE_SHA256}" \
  "${SNAPSHOT_GENERATED_AT}" \
  "${WORK}/runtime-verification.json" \
  "${WORK}/cisa-kev.json" \
  "${SYFT_CONFIG}" \
  "${GRYPE_CONFIG}" \
  "${BUILD_RECEIPT}" <<'NODE'
const fs = require("node:fs");
const crypto = require("node:crypto");
const [
  output,
  sourceCommit,
  imageDigest,
  ociArchiveSha256,
  generatedAt,
  runtimeReportPath,
  kevPath,
  syftConfigPath,
  grypeConfigPath,
  buildReceiptPath,
] = process.argv.slice(2);
const sha256 = (path) =>
  crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const files = [
  "docs/sbom/node.cdx.json",
  "docs/sbom/runner-container.cdx.json",
  "docs/sbom/grype-raw.json",
  "docs/sbom/grype-vex-applied.json",
  "docs/sbom/grype-vex-negative-control.json",
  "docs/sbom/manifest.json",
  "docs/sbom/vulnerability-report.json",
  "docs/sbom/vex-application-report.json",
  "scientific-engines/evidence-catalog.json",
  "scientific-engines/fixtures/health/counterlab-fixed-ml-kernel-health-v1.json",
  "scientific-engines/fixtures/health/numpy-health-v1.json",
  "scientific-engines/fixtures/health/pandas-health-v1.json",
  "scientific-engines/fixtures/health/scikit-learn-health-v1.json",
  "scientific-engines/fixtures/integrity/counterlab-fixed-ml-kernel-0.1.0.json",
  "scientific-engines/fixtures/integrity/cpython-html-parser-reachability-v2.json",
  "scientific-engines/fixtures/integrity/cpython-runtime-3.13.14.json",
  "scientific-engines/fixtures/integrity/local-candidate-ml-runtime.json",
  "scientific-engines/fixtures/integrity/numpy-2.4.6.json",
  "scientific-engines/fixtures/integrity/pandas-2.3.3.json",
  "scientific-engines/fixtures/integrity/scikit-learn-1.9.0.json",
  "scientific-engines/fixtures/validation/internal-mutations-integrity-v2.json",
  "scientific-engines/fixtures/validation/internal-oracle-integrity-v2.json",
  "scientific-engines/fixtures/validation/internal-renderer-integrity-v2.json",
  "scientific-engines/fixtures/validation/signed-result-binding-v2.json",
  "scientific-engines/licenses/manifest.json",
  "scientific-engines/notices/current-ml-engines.NOTICE.md",
  "scientific-engines/registry.json",
  "scientific-engines/runtime-manifest.json",
  "scientific-engines/snapshot-hash.json",
  "scientific-engines/snapshot.json",
  "scientific-engines/subject-pack-bindings.json",
  "scientific-engines/vex/cpython-html-parser-v1.openvex.json",
];
const hashes = Object.fromEntries(files.map((path) => [
  path,
  sha256(path),
]));
const runtimeReport = JSON.parse(fs.readFileSync(runtimeReportPath, "utf8"));
const kev = JSON.parse(fs.readFileSync(kevPath, "utf8"));
if (
  runtimeReport.status !== "VERIFIED" ||
  runtimeReport.observed?.imageDigest !== imageDigest ||
  runtimeReport.observed?.sourceCommit !== sourceCommit ||
  runtimeReport.findings?.length !== 0
) throw new Error("Runtime verification receipt input is invalid");
fs.writeFileSync(output, `${JSON.stringify({
  schemaVersion: "1",
  status: "VERIFIED",
  sourceCommit,
  imageDigest,
  ociArchiveSha256,
  generatedAt,
  tools: {
    syft: "23d4e25a32026ab27351c3c044a40bcc51311c00b8bb990aa204bec4b0bb19cd",
    grype: "d515f53bd5ee4930e144c6ea14a2659084763c336a1833b723db0b05080fcaf5",
  },
  inputs: {
    buildReceiptSha256: sha256(buildReceiptPath),
    runtimeVerification: {
      sha256: sha256(runtimeReportPath),
      status: runtimeReport.status,
      environmentId: runtimeReport.environmentId,
    },
    cisaKev: {
      sha256: sha256(kevPath),
      catalogVersion: kev.catalogVersion,
      dateReleased: kev.dateReleased,
      count: kev.count,
    },
    scannerConfiguration: {
      syftSha256: sha256(syftConfigPath),
      grypeSha256: sha256(grypeConfigPath),
    },
  },
  evidenceSha256: hashes,
}, null, 2)}\n`, { flag: "wx", mode: 0o600 });
NODE

echo "Exact-image scientific evidence refreshed and verified."
echo "Source commit: ${SOURCE_COMMIT}"
echo "Image digest: ${IMAGE_DIGEST}"
echo "Evidence receipt: ${RECEIPT}"
