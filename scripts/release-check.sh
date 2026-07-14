#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"
bash scripts/test-all.sh
bash scripts/run-mutations.sh leakage
bash scripts/sandbox-smoke.sh --build
pnpm --filter @counterlab/web build
PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py
bash scripts/reproduce-session.sh leakage-01
bash scripts/replay-patch.sh leakage-01

if git ls-files -z | xargs -0 rg -n --no-heading \
  'sk-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----|OPENAI_API_KEY=[^[:space:]]+'; then
  echo "Potential secret detected in tracked files." >&2
  exit 1
fi

echo "Release checks passed. No tracked secret pattern was detected."
