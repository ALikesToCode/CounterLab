#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
REPLAY_ID="${1:-}"
ENVIRONMENT_HELPER="${ROOT_DIR}/scripts/prepare-contained-shell-environment.sh"

[[ -f "${ENVIRONMENT_HELPER}" && ! -L "${ENVIRONMENT_HELPER}" ]] || {
  echo "Contained shell environment helper is unavailable." >&2
  exit 2
}
source "${ENVIRONMENT_HELPER}"
counterlab_prepare_contained_shell_environment "${ROOT_DIR}"

if [[ "${REPLAY_ID}" != "leakage-01" ]]; then
  echo "Usage: ./scripts/replay-patch.sh leakage-01" >&2
  exit 2
fi

cd "${ROOT_DIR}"
WORK_DIR="${TMPDIR}/replay-patch-${REPLAY_ID}-${BASHPID}-${RANDOM}-${RANDOM}"
[[ ! -e "${WORK_DIR}" && ! -L "${WORK_DIR}" ]] || {
  echo "Replay patch work directory already exists: ${WORK_DIR}" >&2
  exit 2
}
PYTHONPATH=services/kernel/src .venv/bin/python scripts/replay_patch.py \
  --root "${ROOT_DIR}" \
  --work-dir "${WORK_DIR}"
