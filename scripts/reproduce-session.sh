#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPLAY_ID="${1:-}"
IMAGE="${COUNTERLAB_SANDBOX_IMAGE:-counterlab-runner:local}"
ENVIRONMENT_HELPER="${ROOT_DIR}/scripts/prepare-contained-shell-environment.sh"

[[ -f "${ENVIRONMENT_HELPER}" && ! -L "${ENVIRONMENT_HELPER}" ]] || {
  echo "Contained shell environment helper is unavailable." >&2
  exit 2
}
source "${ENVIRONMENT_HELPER}"
counterlab_prepare_contained_shell_environment "${ROOT_DIR}"

if [[ "${REPLAY_ID}" != "leakage-01" ]]; then
  echo "Usage: ./scripts/reproduce-session.sh leakage-01" >&2
  exit 2
fi

cd "${ROOT_DIR}"
COUNTERLAB_SANDBOX_IMAGE="${IMAGE}" bash scripts/sandbox-smoke.sh
PYTHONPATH=services/kernel/src:services/runner/src .venv/bin/python \
  scripts/reproduce-session.py --image "${IMAGE}"
