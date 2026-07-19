#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" && -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "The contained runtime adapter must run from the CounterLab repository." >&2
  exit 2
}

SESSION_ID="${COUNTERLAB_RUNTIME_SESSION_ID:-}"
[[ "${SESSION_ID}" =~ ^rt-[a-z0-9][a-z0-9-]{7,13}$ ]] || {
  echo "COUNTERLAB_RUNTIME_SESSION_ID is missing or invalid." >&2
  exit 2
}

CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
INSTALL_ROOT="${CACHE_ROOT}/rootless-tools/install-v2.3.1"
SESSION_ROOT="${ROOT_DIR}/.rt/${SESSION_ID}"
BUILDKIT_SOCKET="${SESSION_ROOT}/run/buildkitd.sock"

[[ -d "${SESSION_ROOT}" && ! -L "${SESSION_ROOT}" ]] || {
  echo "Contained runtime session is unavailable." >&2
  exit 2
}
[[ -x "${INSTALL_ROOT}/bin/nerdctl" && ! -L "${INSTALL_ROOT}/bin/nerdctl" ]] || {
  echo "Pinned nerdctl executable is unavailable." >&2
  exit 2
}

export HOME="${SESSION_ROOT}/home"
export TMPDIR="${SESSION_ROOT}/tmp"
export XDG_CACHE_HOME="${SESSION_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${SESSION_ROOT}/xdg-config"
export XDG_DATA_HOME="${SESSION_ROOT}/xdg-data"
export XDG_RUNTIME_DIR="${SESSION_ROOT}/run"
export DOCKER_CONFIG="${SESSION_ROOT}/auth"
export BUILDKIT_HOST="unix://${BUILDKIT_SOCKET}"
export PATH="${INSTALL_ROOT}/bin:/usr/bin:/bin"

unset CONTAINERD_ADDRESS CONTAINERD_NAMESPACE CONTAINERD_SNAPSHOTTER NERDCTL_TOML DOCKER_HOST

if [[ "${1:-}" == "counterlab-attest" ]]; then
  [[ $# -eq 1 ]] || {
    echo "counterlab-attest does not accept arguments." >&2
    exit 2
  }
  exec node "${ROOT_DIR}/scripts/verify-contained-runtime.mjs" \
    --adapter "${ROOT_DIR}/scripts/contained-runtime-adapter.sh" \
    --session-id "${SESSION_ID}"
fi

node "${ROOT_DIR}/scripts/validate-contained-runtime-command.mjs" "$@"

exec node "${ROOT_DIR}/scripts/contained-runtime-client.mjs" \
  --session-id "${SESSION_ID}" \
  -- \
  "$@"
