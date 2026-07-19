#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PNPM_ENTRY="${ROOT_DIR}/node_modules/pnpm/bin/pnpm.mjs"
PNPM_PACKAGE="${ROOT_DIR}/node_modules/pnpm/package.json"
CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"

[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}

export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export COREPACK_HOME="${CACHE_ROOT}/corepack"
export npm_config_cache="${CACHE_ROOT}/npm-cache"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${CACHE_ROOT}" "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${COREPACK_HOME}" "${npm_config_cache}" \
  "${GIT_CONFIG_GLOBAL}"
[[ "$(git -C "${ROOT_DIR}" rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Contained pnpm must run from the verified CounterLab Git root." >&2
  exit 2
}
mkdir -p \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${COREPACK_HOME}" "${npm_config_cache}"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${COREPACK_HOME}" "${npm_config_cache}" \
  "${GIT_CONFIG_GLOBAL}"

[[ -f "${PNPM_ENTRY}" && ! -L "${PNPM_ENTRY}" && -f "${PNPM_PACKAGE}" && ! -L "${PNPM_PACKAGE}" ]] || {
  echo "Pinned repository-contained pnpm is unavailable. Run the reviewed dependency bootstrap first." >&2
  exit 2
}

PNPM_REAL="$(realpath -e -- "${PNPM_ENTRY}")"
PNPM_PACKAGE_REAL="$(realpath -e -- "${PNPM_PACKAGE}")"
case "${PNPM_REAL}" in
  "${ROOT_DIR}"/*) ;;
  *)
    echo "Pinned pnpm resolves outside the CounterLab repository." >&2
    exit 2
    ;;
esac
case "${PNPM_PACKAGE_REAL}" in
  "${ROOT_DIR}"/*) ;;
  *)
    echo "Pinned pnpm package metadata resolves outside the CounterLab repository." >&2
    exit 2
    ;;
esac

EXPECTED_VERSION="$(
  node -p 'require(process.argv[1]).packageManager.match(/^pnpm@([^+]+)/)?.[1] ?? ""' \
    "${ROOT_DIR}/package.json"
)"
PACKAGE_VERSION="$(node -p 'require(process.argv[1]).version ?? ""' "${PNPM_PACKAGE_REAL}")"
ACTUAL_VERSION="$(node "${PNPM_REAL}" --version)"
[[ -n "${EXPECTED_VERSION}" && "${PACKAGE_VERSION}" == "${EXPECTED_VERSION}" && "${ACTUAL_VERSION}" == "${EXPECTED_VERSION}" ]] || {
  echo "Pinned pnpm version mismatch: expected ${EXPECTED_VERSION}, package ${PACKAGE_VERSION}, CLI ${ACTUAL_VERSION}." >&2
  exit 2
}

cd "${ROOT_DIR}"
exec node "${PNPM_REAL}" "$@"
