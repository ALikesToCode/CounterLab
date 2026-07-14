#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SESSION_ID="${1:-}"
BASE_URL="${COUNTERLAB_BASE_URL:-http://127.0.0.1:5173}"

if [[ -z "${SESSION_ID}" ]]; then
  echo "Usage: ./scripts/record-replay.sh <session-id>" >&2
  exit 2
fi

cd "${ROOT_DIR}"
.venv/bin/python scripts/record-replay.py "${SESSION_ID}" --base-url "${BASE_URL}"
