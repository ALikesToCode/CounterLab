#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
HOSTED_RUNNER_PORT="${COUNTERLAB_HOSTED_RUNNER_PORT:-8788}"
CODEX_AUTH_FILE="${CODEX_AUTH_FILE:-${HOME}/.codex/auth.json}"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Python environment missing. Run ./scripts/clean-demo.sh once." >&2
  exit 2
fi
if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm 11.12.0 is required." >&2
  exit 2
fi

cd "${ROOT_DIR}/apps/web"
pnpm exec wrangler d1 migrations apply counterlab --local

cd "${ROOT_DIR}"
RUNNER_PID=""
if [[ -s "${CODEX_AUTH_FILE}" ]] && command -v codex >/dev/null 2>&1; then
  export CODEX_AUTH_JSON="$(<"${CODEX_AUTH_FILE}")"
  if [[ -z "${COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY:-}" ]]; then
    IFS=$'\t' read -r \
      COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY \
      COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY \
      < <(node "${ROOT_DIR}/scripts/runner-token-key.mjs" --tsv)
    export COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY
    export COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY
  else
    export COUNTERLAB_RUNNER_VERIFYING_PUBLIC_KEY="$(
      printf '%s' "${COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY}" \
        | node "${ROOT_DIR}/scripts/runner-token-key.mjs" --derive-public
    )"
  fi
  export COUNTERLAB_RUNNER_BASE_URL="http://127.0.0.1:${HOSTED_RUNNER_PORT}"
  export COUNTERLAB_RUNNER_WORK_ROOT="${ROOT_DIR}/data/hosted-runner/jobs"
  export COUNTERLAB_CODEX_HOME_ROOT="${ROOT_DIR}/data/hosted-runner/codex-home"
  export COUNTERLAB_CODEX_EXECUTABLE="$(command -v codex)"
  export COUNTERLAB_SETPRIV_EXECUTABLE="$(command -v setpriv)"
  export COUNTERLAB_PYTHON_EXECUTABLE="${PYTHON_BIN}"
  export COUNTERLAB_LEAKAGE_FIXTURE_PATH="${ROOT_DIR}/fixtures/public/customer_churn.csv"
  export COUNTERLAB_CODEX_UID="$(id -u)"
  export COUNTERLAB_CODEX_GID="$(id -g)"
  export PORT="${HOSTED_RUNNER_PORT}"
  mkdir -p \
    "${COUNTERLAB_RUNNER_WORK_ROOT}" \
    "${COUNTERLAB_CODEX_HOME_ROOT}"
  pnpm --filter @counterlab/hosted-runner start &
  RUNNER_PID=$!
  for _ in $(seq 1 30); do
    if curl --silent --fail "http://127.0.0.1:${HOSTED_RUNNER_PORT}/ready" >/dev/null; then
      break
    fi
    if ! kill -0 "${RUNNER_PID}" 2>/dev/null; then
      echo "Hosted runner stopped during startup." >&2
      wait "${RUNNER_PID}" || true
      exit 2
    fi
    sleep 0.25
  done
  if ! curl --silent --fail "http://127.0.0.1:${HOSTED_RUNNER_PORT}/ready" >/dev/null; then
    echo "Hosted runner did not become ready on port ${HOSTED_RUNNER_PORT}." >&2
    exit 2
  fi
fi

PYTHONPATH=services/kernel/src "${PYTHON_BIN}" -m counterlab_kernel.service \
  --root "${ROOT_DIR}" --port 8765 &
KERNEL_PID=$!
trap 'kill "${KERNEL_PID}" 2>/dev/null || true; if [[ -n "${RUNNER_PID}" ]]; then kill "${RUNNER_PID}" 2>/dev/null || true; fi' EXIT INT TERM

echo "Kernel: http://127.0.0.1:8765/health"
if [[ -n "${RUNNER_PID}" ]]; then
  echo "Runner: http://127.0.0.1:${HOSTED_RUNNER_PORT}/ready"
else
  echo "Runner: unavailable (Codex CLI authentication not found)"
fi
echo "Web: http://127.0.0.1:5173"
pnpm --filter @counterlab/web dev --host 127.0.0.1 --port 5173
