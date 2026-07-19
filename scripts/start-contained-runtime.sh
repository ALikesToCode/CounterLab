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
RUNTIME_COMMAND_SOCKET="${SESSION_ROOT}/run/runtime-command.sock"
BUILDKIT_SOCKET="${SESSION_ROOT}/run/buildkitd.sock"
RUNC_STATE_ROOT="${SESSION_ROOT}/run/runc"
CONTAINERD_PID_FILE="${SESSION_ROOT}/run/containerd-rootlesskit.pid"
BUILDKIT_PID_FILE="${SESSION_ROOT}/run/buildkit-rootlesskit.pid"
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
  "${SESSION_ROOT}/data/nerdctl" \
  "${SESSION_ROOT}/home" \
  "${SESSION_ROOT}/logs" \
  "${SESSION_ROOT}/run" \
  "${SESSION_ROOT}/run/client-fifo" \
  "${SESSION_ROOT}/run/inner" \
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
  "${SESSION_ROOT}/home" \
  "${SESSION_ROOT}/logs" \
  "${SESSION_ROOT}/run" \
  "${SESSION_ROOT}/run/client-fifo" \
  "${SESSION_ROOT}/run/inner" \
  "${RUNC_STATE_ROOT}" \
  "${SESSION_ROOT}/state" \
  "${SESSION_ROOT}/tmp" \
  "${SESSION_ROOT}/xdg-cache" \
  "${SESSION_ROOT}/xdg-config" \
  "${SESSION_ROOT}/xdg-data"

CONTAINERD_PID=""
BUILDKIT_PID=""
terminate_failed_launch() {
  local status=$?
  if [[ "${status}" -ne 0 ]]; then
    for pid in "${CONTAINERD_PID}" "${BUILDKIT_PID}"; do
      if [[ "${pid}" =~ ^[1-9][0-9]*$ ]]; then
        kill -TERM "${pid}" 2>>"${SESSION_ROOT}/logs/cleanup.log" || true
      fi
    done
    for pid in "${CONTAINERD_PID}" "${BUILDKIT_PID}"; do
      if [[ "${pid}" =~ ^[1-9][0-9]*$ ]]; then
        wait "${pid}" 2>>"${SESSION_ROOT}/logs/cleanup.log" || true
      fi
    done
  fi
  return "${status}"
}
trap terminate_failed_launch EXIT

node - "${BUILDKIT_CONFIG}" <<'NODE'
const { writeFileSync } = require("node:fs");
const [buildkitConfig] = process.argv.slice(2);
writeFileSync(buildkitConfig, "debug = false\n", {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
NODE

export HOME="${SESSION_ROOT}/home"
export TMPDIR="${SESSION_ROOT}/tmp"
export XDG_CACHE_HOME="${SESSION_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${SESSION_ROOT}/xdg-config"
export XDG_DATA_HOME="${SESSION_ROOT}/xdg-data"
export XDG_RUNTIME_DIR="${SESSION_ROOT}/run"
export DOCKER_CONFIG="${SESSION_ROOT}/auth"
export PATH="${BIN_ROOT}:/usr/bin:/bin"
unset CONTAINERD_ADDRESS CONTAINERD_NAMESPACE CONTAINERD_SNAPSHOTTER NERDCTL_TOML DOCKER_HOST BUILDKIT_HOST

nohup "${BIN_ROOT}/rootlesskit" \
  --state-dir="${SESSION_ROOT}/run/containerd-rootless" \
  --net=host \
  node "${ROOT_DIR}/scripts/contained-runtime-server.mjs" \
  --session-id "${SESSION_ID}" \
  >>"${SESSION_ROOT}/logs/containerd.log" 2>&1 &
CONTAINERD_PID=$!
node -e 'require("node:fs").writeFileSync(process.argv[1], String(process.argv[2]) + "\n", {flag:"wx", mode:0o600})' \
  "${CONTAINERD_PID_FILE}" "${CONTAINERD_PID}"

nohup "${BIN_ROOT}/rootlesskit" \
  --state-dir="${SESSION_ROOT}/run/buildkit-rootless" \
  --net=host \
  --propagation=rslave \
  "${BIN_ROOT}/buildkitd" \
  --config "${BUILDKIT_CONFIG}" \
  --root "${SESSION_ROOT}/data/buildkit" \
  --addr "unix://${BUILDKIT_SOCKET}" \
  --oci-worker=true \
  --oci-worker-rootless \
  --oci-worker-no-process-sandbox \
  --oci-worker-snapshotter=native \
  --oci-worker-net=host \
  --oci-worker-binary="${BIN_ROOT}/runc" \
  --oci-max-parallelism=2 \
  --containerd-worker=false \
  --cdi-disabled \
  >>"${SESSION_ROOT}/logs/buildkitd.log" 2>&1 &
BUILDKIT_PID=$!
node -e 'require("node:fs").writeFileSync(process.argv[1], String(process.argv[2]) + "\n", {flag:"wx", mode:0o600})' \
  "${BUILDKIT_PID_FILE}" "${BUILDKIT_PID}"

for _ in {1..300}; do
  if [[ -S "${CONTAINERD_ROOTLESSKIT_API}" && -S "${CONTAINERD_SOCKET}" && -S "${RUNTIME_COMMAND_SOCKET}" && -S "${BUILDKIT_SOCKET}" ]]; then
    break
  fi
  if ! CONTAINERD_LIVENESS="$(kill -0 "${CONTAINERD_PID}" 2>&1)" ||
    ! BUILDKIT_LIVENESS="$(kill -0 "${BUILDKIT_PID}" 2>&1)"; then
    echo "Contained runtime daemon exited during launch; retained logs are inside ${SESSION_ROOT}." >&2
    exit 1
  fi
  sleep 0.1
done
[[ -S "${CONTAINERD_ROOTLESSKIT_API}" && -S "${CONTAINERD_SOCKET}" && -S "${RUNTIME_COMMAND_SOCKET}" && -S "${BUILDKIT_SOCKET}" ]] || {
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

node - \
  "${ROOT_DIR}" \
  "${SESSION_ID}" \
  "${CONTAINERD_PID}" \
  "${BUILDKIT_PID}" \
  "${ATTESTATION}" <<'NODE'
const { createHash } = require("node:crypto");
const { readFileSync, writeFileSync } = require("node:fs");
const { relative, resolve } = require("node:path");
const [root, sessionId, containerdPid, buildkitPid, output] = process.argv.slice(2);
const sessionPrefix = `.rt/${sessionId}`;
const lockPath = resolve(root, "scripts/runtime-toolchain-lock.json");
const adapterPath = resolve(root, "scripts/contained-runtime-adapter.sh");
const containerdConfig = resolve(root, sessionPrefix, "config/containerd.toml");
const buildkitConfig = resolve(root, sessionPrefix, "config/buildkitd.toml");
const sha256File = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const lock = JSON.parse(readFileSync(lockPath, "utf8"));
const fileSha256 = {
  containerdConfig: sha256File(containerdConfig),
  buildkitConfig: sha256File(buildkitConfig),
};
const toolchainLockSha256 = sha256File(lockPath);
const adapterSha256 = sha256File(adapterPath);
const helperSha256 = {
  runtimeClient: sha256File(resolve(root, "scripts/contained-runtime-client.mjs")),
  runtimeRun: sha256File(resolve(root, "scripts/contained-runtime-run.mjs")),
  runtimeEnvironment: sha256File(
    resolve(root, "scripts/contained-runtime-environment.mjs"),
  ),
  runcWrapper: sha256File(resolve(root, "scripts/runtime-bin/runc")),
  containerdConfigWriter: sha256File(
    resolve(root, "scripts/contained-containerd-config.mjs"),
  ),
  runtimeServer: sha256File(resolve(root, "scripts/contained-runtime-server.mjs")),
  commandValidator: sha256File(
    resolve(root, "scripts/validate-contained-runtime-command.mjs"),
  ),
  attestationVerifier: sha256File(
    resolve(root, "scripts/verify-contained-runtime.mjs"),
  ),
  runtimeLauncher: sha256File(resolve(root, "scripts/start-contained-runtime.sh")),
};
const fingerprint = {
  schemaVersion: "1",
  namespace: "counterlab-v6.1",
  toolchainLockSha256,
  adapterSha256,
  helperSha256,
  components: Object.fromEntries(
    Object.entries(lock.components).map(([name, component]) => [name, component.sha256]),
  ),
  fileSha256,
};
const runtimeToolchainSha256 = createHash("sha256")
  .update(canonicalJson(fingerprint))
  .digest("hex");
const paths = {
  installRoot: "node_modules/.cache/counterlab-v6.1/rootless-tools/install-v2.3.1",
  sessionRoot: sessionPrefix,
  containerdRootlesskitApiSocket: `${sessionPrefix}/run/containerd-rootless/api.sock`,
  containerdSocket: `${sessionPrefix}/run/containerd.sock`,
  runtimeCommandSocket: `${sessionPrefix}/run/runtime-command.sock`,
  clientFifoRoot: `${sessionPrefix}/run/client-fifo`,
  runcStateRoot: `${sessionPrefix}/run/runc`,
  buildkitSocket: `${sessionPrefix}/run/buildkitd.sock`,
  containerdRoot: `${sessionPrefix}/data/containerd`,
  containerdState: `${sessionPrefix}/state/containerd`,
  buildkitRoot: `${sessionPrefix}/data/buildkit`,
  nerdctlData: `${sessionPrefix}/data/nerdctl`,
  home: `${sessionPrefix}/home`,
  tmp: `${sessionPrefix}/tmp`,
  xdgCache: `${sessionPrefix}/xdg-cache`,
  xdgConfig: `${sessionPrefix}/xdg-config`,
  xdgData: `${sessionPrefix}/xdg-data`,
  auth: `${sessionPrefix}/auth`,
  containerdConfig: `${sessionPrefix}/config/containerd.toml`,
  buildkitConfig: `${sessionPrefix}/config/buildkitd.toml`,
  containerdPidFile: `${sessionPrefix}/run/containerd-rootlesskit.pid`,
  buildkitPidFile: `${sessionPrefix}/run/buildkit-rootlesskit.pid`,
  containerdRootlesskitState: `${sessionPrefix}/run/containerd-rootless`,
  buildkitRootlesskitState: `${sessionPrefix}/run/buildkit-rootless`,
};
writeFileSync(
  output,
  `${JSON.stringify(
    {
      schemaVersion: "1",
      status: "READY",
      sessionId,
      createdAt: new Date().toISOString(),
      namespace: "counterlab-v6.1",
      toolchainLockSha256,
      adapterSha256,
      helperSha256,
      runtimeToolchainSha256,
      paths,
      pids: {
        containerdRootlesskit: Number(containerdPid),
        buildkitRootlesskit: Number(buildkitPid),
      },
      fileSha256,
    },
    null,
    2,
  )}\n`,
  { encoding: "utf8", flag: "wx", mode: 0o600 },
);
NODE

RUNTIME_ATTESTATION="$(
  COUNTERLAB_RUNTIME_SESSION_ID="${SESSION_ID}" \
    "${ROOT_DIR}/scripts/contained-runtime-adapter.sh" counterlab-attest
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
  wait -n "${CONTAINERD_PID}" "${BUILDKIT_PID}"
  RUNTIME_STATUS=$?
  kill -TERM "${CONTAINERD_PID}" "${BUILDKIT_PID}" 2>>"${SESSION_ROOT}/logs/shutdown.log" || true
  wait "${CONTAINERD_PID}" "${BUILDKIT_PID}" 2>>"${SESSION_ROOT}/logs/shutdown.log" || true
  exit "${RUNTIME_STATUS}"
fi
