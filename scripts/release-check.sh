#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PNPM="${ROOT_DIR}/scripts/run-contained-pnpm.sh"
RECEIPT="${COUNTERLAB_QUALIFIED_RUNNER_RECEIPT:-}"
RUNTIME_ADAPTER="${COUNTERLAB_DOCKER_BIN:-}"

cd "${ROOT_DIR}"
[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}
CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
node scripts/assert-contained-path.mjs \
  "${CACHE_ROOT}" "${CACHE_ROOT}/home" "${CACHE_ROOT}/tmp" \
  "${CACHE_ROOT}/xdg-cache" "${CACHE_ROOT}/xdg-config" "${CACHE_ROOT}/xdg-data" \
  "${CACHE_ROOT}/gitconfig" \
  "${ROOT_DIR}/apps/web/dist" "${ROOT_DIR}/apps/web/worker-configuration.d.ts"
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
  echo "Release checks require the verified CounterLab Git root." >&2
  exit 2
}

[[ -x "${PNPM}" && ! -L "${PNPM}" ]] || {
  echo "Pinned repository-contained pnpm launcher is unavailable." >&2
  exit 2
}
PNPM="$(realpath -e -- "${PNPM}")"
case "${PNPM}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "pnpm launcher resolves outside the repository." >&2; exit 2 ;;
esac

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Release checks require a completely clean worktree." >&2
  exit 2
fi

if [[ -z "${RECEIPT}" || -z "${RUNTIME_ADAPTER}" ]]; then
  echo "Release checks require COUNTERLAB_QUALIFIED_RUNNER_RECEIPT and COUNTERLAB_DOCKER_BIN." >&2
  exit 2
fi
case "${RECEIPT}" in
  /*) ;;
  *) RECEIPT="${ROOT_DIR}/${RECEIPT#./}" ;;
esac
case "${RUNTIME_ADAPTER}" in
  /*) ;;
  *) RUNTIME_ADAPTER="${ROOT_DIR}/${RUNTIME_ADAPTER#./}" ;;
esac
RECEIPT="$(realpath -e -- "${RECEIPT}")"
RUNTIME_ADAPTER="$(realpath -e -- "${RUNTIME_ADAPTER}")"
case "${RECEIPT}" in "${ROOT_DIR}"/*) ;; *) echo "Receipt escaped the repository." >&2; exit 2 ;; esac
case "${RUNTIME_ADAPTER}" in "${ROOT_DIR}"/*) ;; *) echo "Runtime adapter escaped the repository." >&2; exit 2 ;; esac
[[ -f "${RECEIPT}" && -x "${RUNTIME_ADAPTER}" && ! -L "${RUNTIME_ADAPTER}" ]] || {
  echo "Release receipt or runtime adapter is invalid." >&2
  exit 2
}
export COUNTERLAB_DOCKER_BIN="${RUNTIME_ADAPTER}"
RUNTIME_SESSION_ID="${COUNTERLAB_RUNTIME_SESSION_ID:-}"
[[ "${RUNTIME_SESSION_ID}" =~ ^rt-[a-z0-9][a-z0-9-]{7,13}$ ]] || {
  echo "COUNTERLAB_RUNTIME_SESSION_ID must identify the contained runtime." >&2
  exit 2
}
RUNTIME_COMMAND=(
  "${RUNTIME_ADAPTER}"
  --session-id "${RUNTIME_SESSION_ID}"
  --
)

RELEASE_IDENTITY_JSON="$(
  node --import tsx scripts/release-check-receipt.ts \
    identity \
    --qualified "${RECEIPT}"
)"
qualified_identity_value() {
  local field="$1"
  node -e '
const [raw, field] = process.argv.slice(1);
const identity = JSON.parse(raw);
const outerFields = ["identitySchemaVersion", "receipt", "receiptSha256", "receiptType"];
if (
  Object.keys(identity).sort().join("\n") !== outerFields.sort().join("\n") ||
  identity.identitySchemaVersion !== "1" ||
  identity.receiptType !== "qualified-runner-release" ||
  !/^[a-f0-9]{64}$/.test(identity.receiptSha256)
) throw new Error("qualified release identity envelope is invalid");
if (!Object.hasOwn(identity.receipt, field) || typeof identity.receipt[field] !== "string") {
  throw new Error(`qualified release identity field is unavailable: ${field}`);
}
process.stdout.write(identity.receipt[field]);
' "${RELEASE_IDENTITY_JSON}" "${field}"
}
EVIDENCE_COMMIT="$(qualified_identity_value evidenceCommit)"
SOURCE_COMMIT="$(qualified_identity_value sourceCommit)"
ENGINE_IMAGE="$(qualified_identity_value localImageTag)"
EXPECTED_IMAGE_DIGEST="$(qualified_identity_value localImageDigest)"
ADAPTER_IMAGE="$(qualified_identity_value adapterImageTag)"
EXPECTED_ADAPTER_IMAGE_DIGEST="$(qualified_identity_value adapterImageDigest)"
QUALIFIED_RECEIPT_SHA256="$(
  node -e '
const identity = JSON.parse(process.argv[1]);
if (identity?.identitySchemaVersion !== "1" || !/^[a-f0-9]{64}$/.test(identity?.receiptSha256)) {
  throw new Error("qualified receipt byte hash is unavailable");
}
process.stdout.write(identity.receiptSha256);
' "${RELEASE_IDENTITY_JSON}"
)"
[[ "$(sha256sum "${RECEIPT}" | cut -d ' ' -f 1)" == "${QUALIFIED_RECEIPT_SHA256}" ]] || {
  echo "Qualified receipt bytes changed after identity validation." >&2
  exit 2
}
[[ "$(git rev-parse HEAD)" == "${EVIDENCE_COMMIT}" ]] || {
  echo "Release checks require HEAD to equal the qualified evidence commit." >&2
  exit 2
}
[[ "${ENGINE_IMAGE}" == "counterlab-runner:git-${SOURCE_COMMIT}" ]] || {
  echo "Qualified local image tag is not source-bound." >&2
  exit 2
}

RELEASE_RECEIPT_DIR="${CACHE_ROOT}/releases"
RELEASE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
RELEASE_CHECK_RECEIPT="${COUNTERLAB_RELEASE_CHECK_RECEIPT_OUTPUT:-${RELEASE_RECEIPT_DIR}/release-check-${EVIDENCE_COMMIT}-${RELEASE_RUN_ID}.json}"
case "${RELEASE_CHECK_RECEIPT}" in
  /*) ;;
  *) RELEASE_CHECK_RECEIPT="${ROOT_DIR}/${RELEASE_CHECK_RECEIPT#./}" ;;
esac
node scripts/assert-contained-path.mjs "${RELEASE_RECEIPT_DIR}" "${RELEASE_CHECK_RECEIPT}"
[[ ! -e "${RELEASE_CHECK_RECEIPT}" && ! -L "${RELEASE_CHECK_RECEIPT}" ]] || {
  echo "Release-check receipt output already exists; refusing to overwrite it." >&2
  exit 2
}
[[ "$("${RUNTIME_COMMAND[@]}" image inspect "${ENGINE_IMAGE}" --format '{{.Id}}')" == "${EXPECTED_IMAGE_DIGEST}" ]] || {
  echo "Runtime image does not match the qualified receipt." >&2
  exit 2
}
[[ "$("${RUNTIME_COMMAND[@]}" image inspect "${ADAPTER_IMAGE}" --format '{{.Id}}')" == "${EXPECTED_ADAPTER_IMAGE_DIGEST}" ]] || {
  echo "Runtime adapter image does not match the qualified receipt." >&2
  exit 2
}

"${PNPM}" exec prettier --check .
node --import tsx scripts/generate-sample-boundary-fixture.ts --check
node --import tsx scripts/generate-sample-proof-capsule.ts --check
bash scripts/test-all.sh
bash scripts/run-mutations.sh leakage
bash scripts/run-mutations.sh imbalance
"${PNPM}" run held-out:check
COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" bash scripts/sandbox-smoke.sh
bash scripts/verify-scientific-engines.sh --image "${ENGINE_IMAGE}"
"${PNPM}" --filter @counterlab/web build
.venv/bin/python scripts/secret-scan.py \
  apps/web/dist/counterlab/index.js \
  apps/web/dist/client
PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py --check
COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" bash scripts/reproduce-session.sh leakage-01
bash scripts/replay-patch.sh leakage-01

.venv/bin/python scripts/secret-scan.py

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Release checks generated worktree drift." >&2
  exit 2
fi

mkdir -p "${RELEASE_RECEIPT_DIR}"
node scripts/assert-contained-path.mjs "${RELEASE_RECEIPT_DIR}" "${RELEASE_CHECK_RECEIPT}"
node --import tsx scripts/release-check-receipt.ts \
  --qualified "${RECEIPT}" \
  --runtime-adapter "${RUNTIME_ADAPTER}" \
  --output "${RELEASE_CHECK_RECEIPT}"

echo "Release checks passed. No repository secret pattern was detected."
