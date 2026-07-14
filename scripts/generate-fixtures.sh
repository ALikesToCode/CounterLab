#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "CounterLab Python environment is missing. Run: python -m venv .venv && .venv/bin/python -m pip install -r requirements.lock.txt" >&2
  exit 2
fi

cd "${ROOT_DIR}"
PYTHONPATH=services/kernel/src "${PYTHON_BIN}" -m counterlab_kernel.cli generate --root "${ROOT_DIR}" --seed 1729

