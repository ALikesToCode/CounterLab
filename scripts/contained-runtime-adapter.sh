#!/usr/bin/env -S -i PATH=/usr/bin:/bin /bin/bash -p
set -euo pipefail

usage() {
  echo "Usage: contained-runtime-adapter --session-id ID [--control-receipt PATH] -- COMMAND [ARG...]" >&2
  exit 2
}

[[ $# -ge 4 && "${1:-}" == "--session-id" ]] || usage
SESSION_ID="${2:-}"
[[ "${SESSION_ID}" =~ ^rt-[a-z0-9][a-z0-9-]{7,13}$ ]] || {
  echo "contained runtime session ID is invalid." >&2
  exit 2
}
shift 2

CONTROL_RECEIPT=""
if [[ "${1:-}" == "--control-receipt" ]]; then
  [[ $# -ge 4 && -n "${2:-}" ]] || usage
  CONTROL_RECEIPT="${2}"
  shift 2
fi
[[ $# -ge 2 && "${1:-}" == "--" ]] || usage
shift

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" && -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "The contained runtime adapter must run from the CounterLab repository." >&2
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

CLEAN_ENV=(
  /usr/bin/env -i
  "HOME=${SESSION_ROOT}/home"
  "TMPDIR=${SESSION_ROOT}/tmp"
  "XDG_CACHE_HOME=${SESSION_ROOT}/xdg-cache"
  "XDG_CONFIG_HOME=${SESSION_ROOT}/xdg-config"
  "XDG_DATA_HOME=${SESSION_ROOT}/xdg-data"
  "XDG_RUNTIME_DIR=${SESSION_ROOT}/run"
  "DOCKER_CONFIG=${SESSION_ROOT}/auth"
  "BUILDKIT_HOST=unix://${BUILDKIT_SOCKET}"
  "PATH=${INSTALL_ROOT}/bin:/usr/bin:/bin"
)

if [[ "${1:-}" == "counterlab-attest" ]]; then
  [[ $# -eq 1 && -z "${CONTROL_RECEIPT}" ]] || {
    echo "counterlab-attest does not accept arguments." >&2
    exit 2
  }
  exec "${CLEAN_ENV[@]}" node "${ROOT_DIR}/scripts/verify-contained-runtime.mjs" \
    --adapter "${ROOT_DIR}/scripts/contained-runtime-adapter.sh" \
    --session-id "${SESSION_ID}"
fi

"${CLEAN_ENV[@]}" node "${ROOT_DIR}/scripts/validate-contained-runtime-command.mjs" "$@"

CLIENT_ARGS=(--session-id "${SESSION_ID}")
if [[ -n "${CONTROL_RECEIPT}" ]]; then
  CLIENT_ARGS+=(--control-receipt "${CONTROL_RECEIPT}")
fi
CLIENT_ARGS+=(-- "$@")

exec "${CLEAN_ENV[@]}" node "${ROOT_DIR}/scripts/contained-runtime-client.mjs" \
  "${CLIENT_ARGS[@]}"
