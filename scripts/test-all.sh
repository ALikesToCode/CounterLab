#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
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
export PYTHONPYCACHEPREFIX="${CACHE_ROOT}/pycache"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${CACHE_ROOT}" "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}" "${PYTHONPYCACHEPREFIX}" \
  "${GIT_CONFIG_GLOBAL}"
mkdir -p \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${PYTHONPYCACHEPREFIX}"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${PYTHONPYCACHEPREFIX}" "${GIT_CONFIG_GLOBAL}"
[[ "$(git -C "${ROOT_DIR}" rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Repository tests require the verified CounterLab Git root." >&2
  exit 2
}

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "CounterLab Python environment is missing. Install requirements.lock.txt into .venv first." >&2
  exit 2
fi

cd "${ROOT_DIR}"
./scripts/run-contained-pnpm.sh exec vitest run
./scripts/run-contained-pnpm.sh --filter @counterlab/web test
PYTHONPATH=services/kernel/src:services/runner/src "${PYTHON_BIN}" -m pytest \
  services/kernel/tests services/runner/tests \
  scripts/test_secret_scan.py \
  scripts/test_production_smoke.py \
  scripts/test_normalize_runner_oci.py
./scripts/run-contained-pnpm.sh run typecheck
bash scripts/test-e2e.sh
