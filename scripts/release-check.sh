#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}"
bash scripts/test-all.sh
bash scripts/run-mutations.sh leakage
bash scripts/run-mutations.sh imbalance
pnpm run held-out:run
bash scripts/sandbox-smoke.sh --build
pnpm --filter @counterlab/web build
PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py
bash scripts/reproduce-session.sh leakage-01
bash scripts/replay-patch.sh leakage-01

.venv/bin/python scripts/secret-scan.py

echo "Release checks passed. No repository secret pattern was detected."
