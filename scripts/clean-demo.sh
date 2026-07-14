#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STATE_DIR="${ROOT_DIR}/data/clean-demo"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"

for runtime in node pnpm python; do
  if ! command -v "${runtime}" >/dev/null 2>&1; then
    echo "Missing required runtime: ${runtime}" >&2
    exit 2
  fi
done

cd "${ROOT_DIR}"
if [[ ! -d node_modules ]]; then
  echo "Installing locked Node dependencies…"
  pnpm install --frozen-lockfile
fi
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Creating the local Python environment…"
  python -m venv .venv
  "${PYTHON_BIN}" -m pip install -r requirements.lock.txt
fi

mkdir -p "${STATE_DIR}"
bash scripts/generate-fixtures.sh
PYTHONPATH=services/kernel/src "${PYTHON_BIN}" -m pytest \
  services/kernel/tests/test_fixture_kernel.py \
  services/kernel/tests/test_public_artifacts.py -q

cd "${ROOT_DIR}/apps/web"
pnpm exec wrangler d1 migrations apply counterlab --local

if ! curl --fail --silent http://127.0.0.1:8765/health >/dev/null 2>&1; then
  cd "${ROOT_DIR}"
  nohup env PYTHONPATH=services/kernel/src "${PYTHON_BIN}" \
    -m counterlab_kernel.service --root "${ROOT_DIR}" --port 8765 \
    >"${STATE_DIR}/kernel.log" 2>&1 &
  echo $! >"${STATE_DIR}/kernel.pid"
fi

if ! curl --fail --silent http://127.0.0.1:5173/api/health >/dev/null 2>&1; then
  cd "${ROOT_DIR}"
  nohup pnpm --filter @counterlab/web dev --host 127.0.0.1 --port 5173 \
    >"${STATE_DIR}/web.log" 2>&1 &
  echo $! >"${STATE_DIR}/web.pid"
fi

for _attempt in {1..30}; do
  if curl --fail --silent http://127.0.0.1:8765/health >/dev/null 2>&1 && \
    curl --fail --silent http://127.0.0.1:5173/api/health >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

curl --fail --silent http://127.0.0.1:8765/health >/dev/null
curl --fail --silent http://127.0.0.1:5173/api/health >/dev/null

echo "CounterLab is ready: http://127.0.0.1:5173"
echo "Kernel health: http://127.0.0.1:8765/health"
echo "Try Instantly and Replay work without secrets."
if curl --fail --silent http://127.0.0.1:5173/api/health | \
  grep -q '"liveGpt":"available"'; then
  echo "Responses live configuration: available server-side (validated on first request)"
else
  echo "Responses live configuration: unavailable (set OPENAI_API_KEY)"
fi
if command -v codex >/dev/null 2>&1 && codex login status >/dev/null 2>&1; then
  echo "Codex CLI: authenticated; live compiler still requires a credential-safe isolation boundary"
else
  echo "Codex CLI: unavailable or unauthenticated (run codex login)"
fi
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  echo "Docker sandbox: daemon available"
else
  echo "Docker sandbox: unavailable; replay remains available"
fi
