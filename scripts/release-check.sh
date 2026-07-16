#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_IMAGE="${COUNTERLAB_ENGINE_IMAGE:-}"
ADAPTER_IMAGE="${COUNTERLAB_SANDBOX_IMAGE:-counterlab-runner:local}"

cd "${ROOT_DIR}"

if [[ -z "${ENGINE_IMAGE}" ]]; then
  echo "COUNTERLAB_ENGINE_IMAGE must name the exact qualified runner image." >&2
  echo "Example: COUNTERLAB_ENGINE_IMAGE=counterlab-runner:engine-registry-v5 ./scripts/release-check.sh" >&2
  exit 2
fi

bash scripts/test-all.sh
bash scripts/run-mutations.sh leakage
bash scripts/run-mutations.sh imbalance
pnpm run held-out:run
COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" bash scripts/sandbox-smoke.sh
bash scripts/verify-scientific-engines.sh --image "${ENGINE_IMAGE}"
pnpm --filter @counterlab/web build
PYTHONPATH=services/kernel/src .venv/bin/python scripts/collect-achieved-metrics.py
COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" bash scripts/reproduce-session.sh leakage-01
bash scripts/replay-patch.sh leakage-01

.venv/bin/python scripts/secret-scan.py

echo "Release checks passed. No repository secret pattern was detected."
