#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PNPM="${ROOT_DIR}/scripts/run-contained-pnpm.sh"
RECEIPT="${COUNTERLAB_QUALIFIED_RUNNER_RECEIPT:-}"
RUNTIME_ADAPTER="${COUNTERLAB_DOCKER_BIN:-}"

cd "${ROOT_DIR}"
CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
node scripts/assert-contained-path.mjs "${CACHE_ROOT}"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"

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

readarray -t RELEASE_IDENTITY < <(
  node --import tsx scripts/release-check-receipt.ts \
    identity \
    --qualified "${RECEIPT}"
)
[[ "${#RELEASE_IDENTITY[@]}" -eq 10 ]] || {
  echo "Qualified receipt did not expose the exact release identity." >&2
  exit 2
}
EVIDENCE_COMMIT="${RELEASE_IDENTITY[0]}"
SOURCE_COMMIT="${RELEASE_IDENTITY[1]}"
ENGINE_IMAGE="${RELEASE_IDENTITY[2]}"
EXPECTED_IMAGE_DIGEST="${RELEASE_IDENTITY[3]}"
ADAPTER_IMAGE="${RELEASE_IDENTITY[4]}"
EXPECTED_ADAPTER_IMAGE_DIGEST="${RELEASE_IDENTITY[5]}"
[[ "$(git rev-parse HEAD)" == "${EVIDENCE_COMMIT}" ]] || {
  echo "Release checks require HEAD to equal the qualified evidence commit." >&2
  exit 2
}
[[ "${ENGINE_IMAGE}" == "counterlab-runner:git-${SOURCE_COMMIT}" ]] || {
  echo "Qualified local image tag is not source-bound." >&2
  exit 2
}
[[ "$("${RUNTIME_ADAPTER}" image inspect "${ENGINE_IMAGE}" --format '{{.Id}}')" == "${EXPECTED_IMAGE_DIGEST}" ]] || {
  echo "Runtime image does not match the qualified receipt." >&2
  exit 2
}
[[ "$("${RUNTIME_ADAPTER}" image inspect "${ADAPTER_IMAGE}" --format '{{.Id}}')" == "${EXPECTED_ADAPTER_IMAGE_DIGEST}" ]] || {
  echo "Runtime adapter image does not match the qualified receipt." >&2
  exit 2
}

"${PNPM}" exec prettier --check .
bash scripts/test-all.sh
bash scripts/run-mutations.sh leakage
bash scripts/run-mutations.sh imbalance
"${PNPM}" run held-out:run
COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" bash scripts/sandbox-smoke.sh
bash scripts/verify-scientific-engines.sh --image "${ENGINE_IMAGE}"
"${PNPM}" --filter @counterlab/web build
PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py
COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" bash scripts/reproduce-session.sh leakage-01
bash scripts/replay-patch.sh leakage-01

.venv/bin/python scripts/secret-scan.py

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Release checks generated worktree drift." >&2
  exit 2
fi

RELEASE_RECEIPT_DIR="${CACHE_ROOT}/releases"
mkdir -p "${RELEASE_RECEIPT_DIR}"
RELEASE_CHECK_RECEIPT="${COUNTERLAB_RELEASE_CHECK_RECEIPT_OUTPUT:-${RELEASE_RECEIPT_DIR}/release-check-${EVIDENCE_COMMIT}.json}"
node --import tsx scripts/release-check-receipt.ts \
  --qualified "${RECEIPT}" \
  --runtime-adapter "${RUNTIME_ADAPTER}" \
  --output "${RELEASE_CHECK_RECEIPT}"

echo "Release checks passed. No repository secret pattern was detected."
