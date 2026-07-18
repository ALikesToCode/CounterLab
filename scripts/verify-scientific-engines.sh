#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE=""
REGISTRY_ONLY=0
REQUIRE_PRODUCTION=0

usage() {
  cat <<'EOF'
Usage: ./scripts/verify-scientific-engines.sh [options]

Options:
  --image IMAGE          Verify the exact local runner image from inside its runtime.
  --registry-only        Skip Proof Capsule linkage and permit an omitted runtime image.
  --require-production   Reject a local-candidate runtime manifest.
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
    --registry-only)
      REGISTRY_ONLY=1
      shift
      ;;
    --require-production)
      REQUIRE_PRODUCTION=1
      shift
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

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required to inspect the supplied runner image." >&2
  exit 2
}

IMAGE_DIGEST="$(docker image inspect "${IMAGE}" --format '{{.Id}}')"
SOURCE_COMMIT="$(docker image inspect "${IMAGE}" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')"
IMAGE_USER="$(docker image inspect "${IMAGE}" --format '{{.Config.User}}')"
if [[ ! "${IMAGE_DIGEST}" =~ ^sha256:[a-f0-9]{64}$ ]]; then
  echo "Runner image does not expose a valid sha256 image ID." >&2
  exit 1
fi
if [[ ! "${SOURCE_COMMIT}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "Runner image has an unbound or invalid OCI source revision." >&2
  exit 1
fi
if [[ "${IMAGE_USER}" != "10001:10001" ]]; then
  echo "Runner image must declare the non-root user 10001:10001; observed '${IMAGE_USER}'." >&2
  exit 1
fi

STARTUP_PROBE_OUTPUT="$(docker run --rm \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -e COUNTERLAB_RUNNER_STARTUP_PROBE=1 \
  -e COUNTERLAB_RUNNER_WORK_ROOT=/tmp/counterlab-jobs \
  -e COUNTERLAB_CODEX_HOME_ROOT=/tmp/counterlab-codex \
  "${IMAGE}")"
node -e '
  const value = JSON.parse(process.argv[1]);
  if (
    value.status !== "ready" ||
    value.service !== "counterlab-hosted-runner" ||
    value.probe !== "non-root-startup" ||
    JSON.stringify(value.checks) !==
      JSON.stringify(["entrypoint", "non-root-user", "immutable-paths", "codex", "python", "setpriv", "writable-roots"])
  ) {
    throw new Error("Runner non-root startup probe returned an invalid sentinel");
  }
' "${STARTUP_PROBE_OUTPUT}"

# The preceding probe executes the real OCI entrypoint as Config.User. This
# second run adopts the host identity only so the exact-image verifier can read
# the repository evidence mounted read-only.
docker run --rm \
  --user "$(id -u):$(id -g)" \
  --network none \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m \
  -v "${ROOT_DIR}:/repo:ro" \
  --entrypoint python \
  "${IMAGE}" \
  /repo/scripts/verify_scientific_runtime.py \
  --root /repo \
  --image-digest "${IMAGE_DIGEST}" \
  --source-commit "${SOURCE_COMMIT}"

echo "Scientific engine gate passed for ${IMAGE} (${IMAGE_DIGEST})."
