#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
CONCEPT="${1:-}"

if [[ "${CONCEPT}" != "leakage" && "${CONCEPT}" != "imbalance" ]]; then
  echo "Usage: ./scripts/run-mutations.sh leakage|imbalance" >&2
  exit 2
fi

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "CounterLab Python environment is missing. Install requirements.lock.txt into .venv first." >&2
  exit 2
fi

cd "${ROOT_DIR}"
PYTHONPATH=services/kernel/src "${PYTHON_BIN}" -m counterlab_kernel.cli mutations --concept "${CONCEPT}"
