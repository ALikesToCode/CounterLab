#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPLAY_ID="${1:-}"

if [[ "${REPLAY_ID}" != "leakage-01" ]]; then
  echo "Usage: ./scripts/reproduce-session.sh leakage-01" >&2
  exit 2
fi

cd "${ROOT_DIR}"
bash scripts/sandbox-smoke.sh --build
PYTHONPATH=services/kernel/src:services/runner/src .venv/bin/python \
  scripts/reproduce-session.py
