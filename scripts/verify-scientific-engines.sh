#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
IMAGE=""
EXPECTED_IMAGE_DIGEST=""
REGISTRY_ONLY=0
REQUIRE_PRODUCTION=0
RUNTIME_REPORT=""
GENERATION_ISOLATION_REPORT=""
ENVIRONMENT_HELPER="${ROOT_DIR}/scripts/prepare-contained-shell-environment.sh"

[[ -f "${ENVIRONMENT_HELPER}" && ! -L "${ENVIRONMENT_HELPER}" ]] || {
  echo "Contained shell environment helper is unavailable." >&2
  exit 2
}
source "${ENVIRONMENT_HELPER}"
counterlab_prepare_contained_shell_environment "${ROOT_DIR}"

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-scientific-engines.sh [options]

Options:
  --image IMAGE          Verify the exact local runner image from inside its runtime.
  --expected-image-digest SHA256
                         Refuse to start unless IMAGE resolves to this immutable ID.
  --registry-only        Skip Proof Capsule linkage and permit an omitted runtime image.
  --require-production   Reject a local-candidate runtime manifest.
  --runtime-report PATH Persist the exact runtime report to a new contained file.
  --generation-isolation-report PATH
                         Persist source/image-bound generation isolation evidence.
  --help                 Show this help.

The default release gate fails closed unless an image is supplied and Proof Capsule
linkage is implemented. Use --registry-only only while building the earlier registry gate.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --image)
      [[ $# -ge 2 ]] || { echo "--image requires a value" >&2; exit 2; }
      IMAGE="$2"
      shift 2
      ;;
    --expected-image-digest)
      [[ $# -ge 2 ]] || { echo "--expected-image-digest requires a value" >&2; exit 2; }
      EXPECTED_IMAGE_DIGEST="$2"
      shift 2
      ;;
    --registry-only)
      REGISTRY_ONLY=1
      shift
      ;;
    --require-production)
      REQUIRE_PRODUCTION=1
      shift
      ;;
    --runtime-report)
      [[ $# -ge 2 ]] || { echo "--runtime-report requires a value" >&2; exit 2; }
      RUNTIME_REPORT="$2"
      shift 2
      ;;
    --generation-isolation-report)
      [[ $# -ge 2 ]] || { echo "--generation-isolation-report requires a value" >&2; exit 2; }
      GENERATION_ISOLATION_REPORT="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "${ROOT_DIR}"

if [[ -n "${RUNTIME_REPORT}" ]]; then
  if [[ "${RUNTIME_REPORT}" != /* ]]; then
    RUNTIME_REPORT="${ROOT_DIR}/${RUNTIME_REPORT#./}"
  fi
  node scripts/assert-contained-path.mjs "${RUNTIME_REPORT}"
  [[ ! -e "${RUNTIME_REPORT}" && ! -L "${RUNTIME_REPORT}" ]] || {
    echo "Runtime report output must be a new repository-contained file." >&2
    exit 2
  }
fi
if [[ -n "${GENERATION_ISOLATION_REPORT}" ]]; then
  if [[ "${GENERATION_ISOLATION_REPORT}" != /* ]]; then
    GENERATION_ISOLATION_REPORT="${ROOT_DIR}/${GENERATION_ISOLATION_REPORT#./}"
  fi
  node scripts/assert-contained-path.mjs "${GENERATION_ISOLATION_REPORT}"
  [[ ! -e "${GENERATION_ISOLATION_REPORT}" && ! -L "${GENERATION_ISOLATION_REPORT}" ]] || {
    echo "Generation-isolation output must be a new repository-contained file." >&2
    exit 2
  }
fi

[[ -x "./node_modules/.bin/tsx" ]] || {
  echo "Missing local TypeScript runtime. Install the pinned workspace dependencies first." >&2
  exit 2
}
[[ -x "./.venv/bin/python" ]] || {
  echo "Missing .venv Python runtime. Install the repository's pinned test dependencies first." >&2
  exit 2
}

TS_ARGS=()
if [[ "${REGISTRY_ONLY}" -eq 1 ]]; then
  TS_ARGS+=(--registry-only)
fi

./node_modules/.bin/tsx scripts/verify-scientific-engines.ts "${TS_ARGS[@]}"
./.venv/bin/python scripts/verify_scientific_imports.py --root "${ROOT_DIR}"

ENVIRONMENT_KIND="$(./.venv/bin/python -c 'import json; print(json.load(open("scientific-engines/snapshot.json"))["runtimeManifest"]["environmentKind"])')"
if [[ "${REQUIRE_PRODUCTION}" -eq 1 && "${ENVIRONMENT_KIND}" != "cloudflare_production" ]]; then
  echo "Scientific engine snapshot is ${ENVIRONMENT_KIND}; production authority is required." >&2
  exit 1
fi

if [[ -z "${IMAGE}" ]]; then
  if [[ "${REGISTRY_ONLY}" -eq 1 ]]; then
    echo "Registry-only gate passed; runtime image verification was not requested."
    exit 0
  fi
  echo "Full scientific-engine verification requires --image IMAGE." >&2
  exit 2
fi

DOCKER_BIN="${COUNTERLAB_DOCKER_BIN:-$(command -v docker || true)}"
[[ -n "${DOCKER_BIN}" ]] || {
  echo "A repository-contained Docker-compatible exact-image adapter is required." >&2
  exit 2
}
if [[ "${DOCKER_BIN}" != /* ]]; then
  DOCKER_BIN="${ROOT_DIR}/${DOCKER_BIN#./}"
fi
DOCKER_BIN="$(realpath -e -- "${DOCKER_BIN}")"
case "${DOCKER_BIN}" in
  "${ROOT_DIR}"/*) ;;
  *)
    echo "Docker-compatible adapter must be contained inside the repository." >&2
    exit 2
    ;;
esac
RUNTIME_SESSION_ID="${COUNTERLAB_RUNTIME_SESSION_ID:-}"
[[ "${RUNTIME_SESSION_ID}" =~ ^rt-[a-z0-9][a-z0-9-]{7,13}$ ]] || {
  echo "COUNTERLAB_RUNTIME_SESSION_ID must identify the contained runtime." >&2
  exit 2
}
DOCKER_COMMAND=(
  "${DOCKER_BIN}"
  --session-id "${RUNTIME_SESSION_ID}"
  --
)

IMAGE_DIGEST="$("${DOCKER_COMMAND[@]}" image inspect "${IMAGE}" --format '{{.Id}}')"
SOURCE_COMMIT="$("${DOCKER_COMMAND[@]}" image inspect "${IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
SOURCE_TREE_SHA256="$("${DOCKER_COMMAND[@]}" image inspect "${IMAGE}" --format '{{index .Config.Labels "io.counterlab.source-tree-sha256"}}')"
IMAGE_USER="$("${DOCKER_COMMAND[@]}" image inspect "${IMAGE}" --format '{{.Config.User}}')"
if [[ ! "${IMAGE_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Runner image does not expose a valid sha256 image ID." >&2
  exit 1
fi
if [[ -n "${EXPECTED_IMAGE_DIGEST}" && "${IMAGE_DIGEST}" != "${EXPECTED_IMAGE_DIGEST}" ]]; then
  echo "Runner image does not match the required immutable image ID." >&2
  exit 1
fi
if [[ ! "${SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Runner image has an unbound or invalid OCI source revision." >&2
  exit 1
fi
if [[ ! "${SOURCE_TREE_SHA256}" =~ ^[a-f0-9]{64}$ ]]; then
  echo "Runner image has an unbound or invalid OCI source-tree hash." >&2
  exit 1
fi
if [[ "${IMAGE_USER}" != "0:0" ]]; then
  echo "Runner image must declare the fixed root privilege broker 0:0; observed '${IMAGE_USER}'." >&2
  exit 1
fi
if [[ -n "${RUNTIME_REPORT}" ]]; then
  RUNTIME_REPORT_RELATIVE="${RUNTIME_REPORT#${ROOT_DIR}/}"
  if [[ ! "${RUNTIME_REPORT_RELATIVE}" =~ ^node_modules/\.cache/counterlab-v6\.1/scientific-evidence-${SOURCE_COMMIT}-[0-9]{8}T[0-9]{6}Z-[0-9]+/runtime-verification\.json$ ]]; then
    echo "Runtime report output must use the exact source-bound evidence staging path." >&2
    exit 2
  fi
fi

RUN_ID="${SOURCE_COMMIT:0:12}-$$"
STARTUP_CONTAINER="counterlab-startup-${RUN_ID}"
RUNTIME_CONTAINER="counterlab-runtime-${RUN_ID}"
HOST_UID="$(id -u)"
HOST_GID="$(id -g)"
[[ "${HOST_UID}" != "0" && "${HOST_GID}" != "0" ]] || {
  echo "Scientific runtime verification refuses a root host identity." >&2
  exit 2
}

STARTUP_PROBE_OUTPUT="$("${DOCKER_COMMAND[@]}" run --rm --name "${STARTUP_CONTAINER}" \
  --pull=never \
  --network none \
  --read-only \
  --cap-drop=ALL \
  --cap-add=CHOWN \
  --cap-add=FOWNER \
  --cap-add=SETGID \
  --cap-add=SETUID \
  --security-opt=no-new-privileges=true \
  --ipc=private \
  --pids-limit=32 \
  --memory=4096m \
  --memory-swap=4096m \
  --cpus=2.0 \
  --ulimit=cpu=300:300 \
  --ulimit=as=17179869184:17179869184 \
  --ulimit=fsize=1048576:1048576 \
  --ulimit=nofile=64:64 \
  --tmpfs /work/jobs:rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10002,mode=2710 \
  --tmpfs /run/counterlab-codex:rw,noexec,nosuid,nodev,size=32m,uid=0,gid=10002,mode=0710 \
  --tmpfs /run/counterlab-privsep:rw,noexec,nosuid,nodev,size=4m,uid=0,gid=10001,mode=0750 \
  -e COUNTERLAB_RUNNER_STARTUP_PROBE=1 \
  "${IMAGE}")"
node -e '
  const value = JSON.parse(process.argv[1]);
  if (
    value.status !== "ready" ||
    value.service !== "counterlab-hosted-runner" ||
    value.probe !== "non-root-startup" ||
    value.generationFilesystemReadIsolation !== "OS_ENFORCED" ||
    JSON.stringify(value.checks) !==
      JSON.stringify(["entrypoint", "non-root-user", "immutable-paths", "python", "setpriv", "privsep-broker", "posix-dac-process-identity", "writable-roots"])
  ) {
    throw new Error("Runner non-root startup probe returned an invalid sentinel");
  }
' "${STARTUP_PROBE_OUTPUT}"

if [[ -n "${GENERATION_ISOLATION_REPORT}" ]]; then
  VERIFIED_AT="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
  node --import tsx scripts/generation-isolation-evidence.ts \
    --source-commit "${SOURCE_COMMIT}" \
    --source-tree-sha256 "${SOURCE_TREE_SHA256}" \
    --local-image-tag "${IMAGE}" \
    --local-image-digest "${IMAGE_DIGEST}" \
    --image-user "${IMAGE_USER}" \
    --startup-probe-json "${STARTUP_PROBE_OUTPUT}" \
    --verified-at "${VERIFIED_AT}" \
    --output "${GENERATION_ISOLATION_REPORT}"
fi

# The preceding probe executes the real privileged entrypoint and proves the
# broker, runner, and generator identities. This second run adopts the fixed
# runner identity to verify the scientific runtime without broker privileges.
RUNTIME_VERIFICATION_OUTPUT="$("${DOCKER_COMMAND[@]}" run --rm --name "${RUNTIME_CONTAINER}" \
  --user "10001:10001" \
  --pull=never \
  --network none \
  --read-only \
  --cap-drop=ALL \
  --security-opt=no-new-privileges=true \
  --ipc=private \
  --pids-limit=32 \
  --memory=1024m \
  --memory-swap=1024m \
  --cpus=2.0 \
  --ulimit=cpu=300:300 \
  --ulimit=as=17179869184:17179869184 \
  --ulimit=fsize=1048576:1048576 \
  --ulimit=nofile=64:64 \
  --tmpfs "/counterlab-runtime:rw,noexec,nosuid,nodev,size=64m,uid=10001,gid=10001,mode=0700" \
  -e TMPDIR=/counterlab-runtime \
  --mount "type=bind,src=${ROOT_DIR}/scripts/verify_scientific_runtime.py,dst=/repo/scripts/verify_scientific_runtime.py,readonly" \
  --mount "type=bind,src=${ROOT_DIR}/requirements.runner.lock.txt,dst=/repo/requirements.runner.lock.txt,readonly" \
  --mount "type=bind,src=${ROOT_DIR}/scientific-engines,dst=/repo/scientific-engines,readonly" \
  --workdir=/repo \
  --entrypoint python \
  "${IMAGE}" \
  /repo/scripts/verify_scientific_runtime.py \
  --root /repo \
  --image-digest "${IMAGE_DIGEST}" \
  --source-commit "${SOURCE_COMMIT}")"

node -e '
  const value = JSON.parse(process.argv[1]);
  if (
    value.status !== "VERIFIED" ||
    value.environmentId !== "counterlab-runner-linux-amd64-v2" ||
    !Array.isArray(value.findings) ||
    value.findings.length !== 0 ||
    value.observed?.imageDigest !== process.argv[2] ||
    value.observed?.sourceCommit !== process.argv[3]
  ) {
    throw new Error("Exact runtime verification report is invalid");
  }
' "${RUNTIME_VERIFICATION_OUTPUT}" "${IMAGE_DIGEST}" "${SOURCE_COMMIT}"

if [[ -n "${RUNTIME_REPORT}" ]]; then
  node - "${RUNTIME_REPORT}" "${RUNTIME_VERIFICATION_OUTPUT}" <<'NODE'
const fs = require("node:fs");
const [output, report] = process.argv.slice(2);
fs.writeFileSync(output, `${JSON.stringify(JSON.parse(report), null, 2)}\n`, {
  flag: "wx",
  mode: 0o600,
});
NODE
else
  printf '%s\n' "${RUNTIME_VERIFICATION_OUTPUT}"
fi

echo "Scientific engine gate passed for ${IMAGE} (${IMAGE_DIGEST})."
echo "Ephemeral verification containers removed: ${STARTUP_CONTAINER}, ${RUNTIME_CONTAINER}"
