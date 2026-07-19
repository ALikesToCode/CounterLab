#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "CounterLab Python environment is missing. Install requirements.lock.txt into .venv first." >&2
  exit 2
fi

cd "${ROOT_DIR}"
./scripts/run-contained-pnpm.sh exec vitest run
./scripts/run-contained-pnpm.sh --filter @counterlab/web test
PYTHONPATH=services/kernel/src:services/runner/src "${PYTHON_BIN}" -m pytest \
  services/kernel/tests services/runner/tests
./scripts/run-contained-pnpm.sh run typecheck
bash scripts/test-e2e.sh
