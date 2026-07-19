#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
export HOME="${CACHE_ROOT}/home"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 1
}
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${CACHE_ROOT}" "${HOME}" "${GIT_CONFIG_GLOBAL}"
REPO_ROOT="$(git -C "${ROOT_DIR}" rev-parse --show-toplevel)"

if [[ "${ROOT_DIR}" != "${REPO_ROOT}" ]]; then
  echo "Refusing browser QA outside the verified CounterLab repository root." >&2
  exit 1
fi

if [[ -z "${CLOAK_CDP_ENDPOINT:-}" ]]; then
  echo "CLOAK_CDP_ENDPOINT is required; stock Chromium is forbidden." >&2
  exit 1
fi

RUN_ID="${COUNTERLAB_E2E_RUN_ID:-m8-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
if [[ ! "${RUN_ID}" =~ ^[a-zA-Z0-9._-]+$ ]]; then
  echo "COUNTERLAB_E2E_RUN_ID contains unsupported characters." >&2
  exit 1
fi

RUNTIME_PARENT="${REPO_ROOT}/apps/web/test-results/runtime"
RUNTIME_ROOT="${RUNTIME_PARENT}/${RUN_ID}"
case "${RUNTIME_ROOT}" in
  "${RUNTIME_PARENT}"/*) ;;
  *)
    echo "Refusing an E2E runtime path outside the repository." >&2
    exit 1
    ;;
esac

assert_no_symlink_components() {
  local candidate="$1"
  local relative_path="${candidate#"${REPO_ROOT}/"}"
  local current="${REPO_ROOT}"
  local component
  local -a components

  if [[ "${relative_path}" == "${candidate}" ]] || [[ -z "${relative_path}" ]]; then
    echo "Refusing an E2E path outside the repository." >&2
    exit 1
  fi

  IFS='/' read -r -a components <<< "${relative_path}"
  for component in "${components[@]}"; do
    if [[ -z "${component}" ]] || [[ "${component}" == "." ]] || [[ "${component}" == ".." ]]; then
      echo "Refusing an ambiguous E2E path component." >&2
      exit 1
    fi
    current="${current}/${component}"
    if [[ -L "${current}" ]]; then
      echo "Refusing an E2E path that traverses a symbolic link." >&2
      exit 1
    fi
  done
}

RUNTIME_DIRECTORIES=(
  "${RUNTIME_ROOT}/home"
  "${RUNTIME_ROOT}/tmp"
  "${RUNTIME_ROOT}/xdg/cache"
  "${RUNTIME_ROOT}/xdg/config"
  "${RUNTIME_ROOT}/xdg/data"
  "${RUNTIME_ROOT}/corepack"
  "${RUNTIME_ROOT}/npm-cache"
  "${RUNTIME_ROOT}/wrangler-state"
  "${RUNTIME_ROOT}/browser-profile"
  "${RUNTIME_ROOT}/downloads"
  "${RUNTIME_ROOT}/playwright-output"
  "${RUNTIME_ROOT}/screenshots"
  "${RUNTIME_ROOT}/traces"
  "${RUNTIME_ROOT}/evidence"
  "${RUNTIME_ROOT}/logs"
)

for directory in "${RUNTIME_DIRECTORIES[@]}"; do
  assert_no_symlink_components "${directory}"
done
mkdir -p "${RUNTIME_DIRECTORIES[@]}"
for directory in "${RUNTIME_DIRECTORIES[@]}"; do
  assert_no_symlink_components "${directory}"
done

# This milestone is local-only. Never inherit a target that could send the
# mutating browser journeys to an external service.
unset COUNTERLAB_E2E_BASE_URL

export HOME="${RUNTIME_ROOT}/home"
export TMPDIR="${RUNTIME_ROOT}/tmp"
export XDG_CACHE_HOME="${RUNTIME_ROOT}/xdg/cache"
export XDG_CONFIG_HOME="${RUNTIME_ROOT}/xdg/config"
export XDG_DATA_HOME="${RUNTIME_ROOT}/xdg/data"
export COREPACK_HOME="${RUNTIME_ROOT}/corepack"
export npm_config_cache="${RUNTIME_ROOT}/npm-cache"
export PLAYWRIGHT_BROWSERS_PATH="${RUNTIME_ROOT}/browser-profile"
export COUNTERLAB_E2E_RUNTIME_ROOT="${RUNTIME_ROOT}"
export COUNTERLAB_E2E_EVIDENCE_PATH="${RUNTIME_ROOT}/evidence/journeys.json"

cd "${ROOT_DIR}/apps/web"
if [[ "${COUNTERLAB_E2E_LIST_ONLY:-0}" == "1" ]]; then
  ./node_modules/.bin/playwright test --list
  exit 0
fi
./node_modules/.bin/wrangler d1 migrations apply counterlab --local --persist-to "${RUNTIME_ROOT}/wrangler-state"
./node_modules/.bin/playwright test
