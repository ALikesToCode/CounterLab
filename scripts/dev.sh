#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"

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
PYTHONPATH=services/kernel/src "${PYTHON_BIN}" -m counterlab_kernel.service \
  --root "${ROOT_DIR}" --port 8765 &
KERNEL_PID=$!
trap 'kill "${KERNEL_PID}" 2>/dev/null || true' EXIT INT TERM

echo "Kernel: http://127.0.0.1:8765/health"
echo "Web: http://127.0.0.1:5173"
pnpm --filter @counterlab/web dev --host 127.0.0.1 --port 5173
