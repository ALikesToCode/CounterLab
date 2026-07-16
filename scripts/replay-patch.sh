#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPLAY_ID="${1:-}"

if [[ "${REPLAY_ID}" != "leakage-01" ]]; then
  echo "Usage: ./scripts/replay-patch.sh leakage-01" >&2
  exit 2
fi

cd "${ROOT_DIR}"
PYTHONPATH=services/kernel/src .venv/bin/python scripts/replay_patch.py \
  --root "${ROOT_DIR}"
