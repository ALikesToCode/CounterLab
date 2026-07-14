#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPLAY_ID="${1:-}"

if [[ "${REPLAY_ID}" != "leakage-01" ]]; then
  echo "Usage: ./scripts/replay-patch.sh leakage-01" >&2
  exit 2
fi

cd "${ROOT_DIR}"
PYTHONPATH=services/kernel/src .venv/bin/python -c \
  'from pathlib import Path; from counterlab_kernel.patching import verify_sample_notebook_patch; root=Path.cwd(); report=verify_sample_notebook_patch(original_notebook=root/"fixtures/notebooks/customer_churn_leakage.ipynb", candidate_notebook=root/"replays/leakage-01/patch/customer_churn_leakage.patched.ipynb", fixture_csv=root/"fixtures/public/customer_churn.csv"); print(f"PATCH {report['"'"'status'"'"']} overlap={report['"'"'correctedResult'"'"']['"'"'entityOverlap'"'"']['"'"'count'"'"']}"); raise SystemExit(0 if report['"'"'status'"'"']=="VERIFIED" else 1)'
