#!/usr/bin/env -S -i PATH=/usr/bin:/bin /bin/bash -p
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
cd "${ROOT_DIR}"

[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}
[[ ( $# -eq 2 || ( $# -eq 3 && "$3" == "--hold" ) ) && "$1" == "--session-id" && "$2" =~ ^rt-[a-z0-9][a-z0-9-]{7,13}$ ]] || {
  echo "Usage: start-contained-runtime.sh --session-id rt-<safe-id> [--hold]" >&2
  exit 2
}

SESSION_ID="$2"
HOLD_RUNTIME=false
if [[ "${3:-}" == "--hold" ]]; then
  HOLD_RUNTIME=true
fi
CACHE_ROOT="${ROOT_DIR}/node_modules/.cache/counterlab-v6.1"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
node scripts/assert-contained-path.mjs \
  "${CACHE_ROOT}" "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" \
  "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}" "${GIT_CONFIG_GLOBAL}"
[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Contained runtime launch must run from the CounterLab Git root." >&2
  exit 2
}
INSTALL_ROOT="${CACHE_ROOT}/rootless-tools/install-v2.3.1"
SESSION_PARENT="${ROOT_DIR}/.rt"
SESSION_ROOT="${SESSION_PARENT}/${SESSION_ID}"
BIN_ROOT="${INSTALL_ROOT}/bin"
CONTAINERD_ROOTLESSKIT_API="${SESSION_ROOT}/run/containerd-rootless/api.sock"
CONTAINERD_SOCKET="${SESSION_ROOT}/run/containerd.sock"
SNAPSHOTTER_SOCKET="${SESSION_ROOT}/run/inner/fuse-overlayfs.sock"
RUNTIME_COMMAND_SOCKET="${SESSION_ROOT}/run/runtime-command.sock"
BUILDKIT_SOCKET="${SESSION_ROOT}/run/buildkitd.sock"
BUILDKIT_INNER_SOCKET="${SESSION_ROOT}/run/inner/buildkitd.sock"
BUILDKIT_OTEL_SOCKET="${SESSION_ROOT}/run/inner/buildkit-otel.sock"
RUNC_STATE_ROOT="${SESSION_ROOT}/run/runc"
ROOTLESS_SPEC_ROOT="${SESSION_ROOT}/run/rootless-specs"
SUPERVISOR_SOCKET="${SESSION_ROOT}/run/runtime-supervisor.sock"
SUPERVISOR_READY="${SESSION_ROOT}/run/runtime-supervisor-ready.json"
CONTAINERD_CONFIG="${SESSION_ROOT}/config/containerd.toml"
BUILDKIT_CONFIG="${SESSION_ROOT}/config/buildkitd.toml"
ATTESTATION="${SESSION_ROOT}/attestation.json"

node scripts/assert-contained-path.mjs \
  "${CACHE_ROOT}" \
  "${INSTALL_ROOT}" \
  "${SESSION_PARENT}" \
  "${SESSION_ROOT}"

"${ROOT_DIR}/scripts/setup-contained-runtime.sh"
[[ ! -e "${SESSION_ROOT}" ]] || {
  echo "Runtime session already exists; refusing to reuse or overwrite it: ${SESSION_ID}" >&2
  exit 2
}

mkdir -p "${SESSION_PARENT}"
mkdir "${SESSION_ROOT}"
mkdir -p \
  "${SESSION_ROOT}/auth" \
  "${SESSION_ROOT}/config/certs.d" \
  "${SESSION_ROOT}/config/cni" \
  "${SESSION_ROOT}/data/buildkit" \
  "${SESSION_ROOT}/data/containerd" \
  "${SESSION_ROOT}/data/fuse-overlayfs" \
  "${SESSION_ROOT}/data/nerdctl" \
  "${SESSION_ROOT}/home" \
  "${SESSION_ROOT}/logs" \
  "${SESSION_ROOT}/run" \
  "${SESSION_ROOT}/run/client-fifo" \
  "${SESSION_ROOT}/run/inner" \
  "${ROOTLESS_SPEC_ROOT}" \
  "${RUNC_STATE_ROOT}" \
  "${SESSION_ROOT}/state/containerd" \
  "${SESSION_ROOT}/tmp" \
  "${SESSION_ROOT}/xdg-cache" \
  "${SESSION_ROOT}/xdg-config" \
  "${SESSION_ROOT}/xdg-data"
chmod 700 \
  "${SESSION_ROOT}" \
  "${SESSION_ROOT}/auth" \
  "${SESSION_ROOT}/config" \
  "${SESSION_ROOT}/data" \
  "${SESSION_ROOT}/data/fuse-overlayfs" \
  "${SESSION_ROOT}/home" \
  "${SESSION_ROOT}/logs" \
  "${SESSION_ROOT}/run" \
  "${SESSION_ROOT}/run/client-fifo" \
  "${SESSION_ROOT}/run/inner" \
  "${ROOTLESS_SPEC_ROOT}" \
  "${RUNC_STATE_ROOT}" \
  "${SESSION_ROOT}/state" \
  "${SESSION_ROOT}/tmp" \
  "${SESSION_ROOT}/xdg-cache" \
  "${SESSION_ROOT}/xdg-config" \
  "${SESSION_ROOT}/xdg-data"

SUPERVISOR_PID=""
terminate_failed_launch() {
  local status=$?
  if [[ "${status}" -ne 0 && "${SUPERVISOR_PID}" =~ ^[1-9][0-9]*$ ]]; then
    kill -TERM "${SUPERVISOR_PID}" 2>>"${SESSION_ROOT}/logs/cleanup.log" || true
    wait "${SUPERVISOR_PID}" 2>>"${SESSION_ROOT}/logs/cleanup.log" || true
  fi
  return "${status}"
}
trap terminate_failed_launch EXIT

node - "${BUILDKIT_CONFIG}" "${BUILDKIT_OTEL_SOCKET}" <<'NODE'
const { writeFileSync } = require("node:fs");
const [buildkitConfig, buildkitOtelSocket] = process.argv.slice(2);
writeFileSync(
  buildkitConfig,
  `debug = false\n\n[otel]\n  socketPath = ${JSON.stringify(buildkitOtelSocket)}\n`,
  {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  },
);
NODE

export HOME="${SESSION_ROOT}/home"
export TMPDIR="${SESSION_ROOT}/tmp"
export XDG_CACHE_HOME="${SESSION_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${SESSION_ROOT}/xdg-config"
export XDG_DATA_HOME="${SESSION_ROOT}/xdg-data"
export XDG_RUNTIME_DIR="${SESSION_ROOT}/run/inner"
export DOCKER_CONFIG="${SESSION_ROOT}/auth"
export PATH="${BIN_ROOT}:/usr/bin:/bin"
unset CONTAINERD_ADDRESS CONTAINERD_NAMESPACE CONTAINERD_SNAPSHOTTER NERDCTL_TOML DOCKER_HOST BUILDKIT_HOST

nohup node "${ROOT_DIR}/scripts/contained-runtime-supervisor.mjs" \
  --session-id "${SESSION_ID}" \
  >>"${SESSION_ROOT}/logs/supervisor.log" 2>&1 &
SUPERVISOR_PID=$!

for _ in {1..300}; do
  if [[ -S "${CONTAINERD_ROOTLESSKIT_API}" && -S "${CONTAINERD_SOCKET}" && -S "${SNAPSHOTTER_SOCKET}" && -S "${RUNTIME_COMMAND_SOCKET}" && -S "${BUILDKIT_SOCKET}" && -S "${BUILDKIT_INNER_SOCKET}" && -S "${SUPERVISOR_SOCKET}" && -f "${SUPERVISOR_READY}" ]]; then
    break
  fi
  if ! SUPERVISOR_LIVENESS="$(kill -0 "${SUPERVISOR_PID}" 2>&1)"; then
    echo "Contained runtime supervisor exited during launch; retained logs are inside ${SESSION_ROOT}." >&2
    exit 1
  fi
  sleep 0.1
done
[[ -S "${CONTAINERD_ROOTLESSKIT_API}" && -S "${CONTAINERD_SOCKET}" && -S "${SNAPSHOTTER_SOCKET}" && -S "${RUNTIME_COMMAND_SOCKET}" && -S "${BUILDKIT_SOCKET}" && -S "${BUILDKIT_INNER_SOCKET}" && -S "${SUPERVISOR_SOCKET}" && -f "${SUPERVISOR_READY}" ]] || {
  echo "Contained runtime sockets did not become ready; retained logs are inside ${SESSION_ROOT}." >&2
  exit 1
}

node "${ROOT_DIR}/scripts/contained-runtime-client.mjs" \
  --session-id "${SESSION_ID}" \
  -- \
  version --format json >"${SESSION_ROOT}/logs/runtime-version.json"
BUILDKIT_WORKERS="$("${BIN_ROOT}/buildctl" \
  --addr "unix://${BUILDKIT_SOCKET}" \
  debug workers)"
[[ -n "${BUILDKIT_WORKERS}" ]] || {
  echo "Contained BuildKit reported no workers." >&2
  exit 1
}

node "${ROOT_DIR}/scripts/write-contained-runtime-attestation.mjs" \
  --session-id "${SESSION_ID}" \
  --supervisor-ready "${SUPERVISOR_READY}" \
  --output "${ATTESTATION}"

RUNTIME_ATTESTATION="$(
  "${ROOT_DIR}/scripts/contained-runtime-adapter.sh" \
    --session-id "${SESSION_ID}" \
    -- counterlab-attest
)"
[[ -n "${RUNTIME_ATTESTATION}" ]] || {
  echo "Contained runtime attestation returned no evidence." >&2
  exit 1
}

echo "Contained runtime session ready: ${SESSION_ID}"
echo "COUNTERLAB_RUNTIME_SESSION_ID=${SESSION_ID}"
echo "COUNTERLAB_DOCKER_BIN=${ROOT_DIR}/scripts/contained-runtime-adapter.sh"
echo "COUNTERLAB_BUILDKIT_ADDR=unix://${BUILDKIT_SOCKET}"

if [[ "${HOLD_RUNTIME}" == true ]]; then
  set +e
  wait "${SUPERVISOR_PID}"
  RUNTIME_STATUS=$?
  exit "${RUNTIME_STATUS}"
fi
