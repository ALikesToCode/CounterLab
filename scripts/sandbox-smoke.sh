#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
IMAGE="${COUNTERLAB_SANDBOX_IMAGE:-counterlab-runner:local}"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
RUNTIME_ADAPTER="${COUNTERLAB_DOCKER_BIN:-}"
BUILD_IMAGE=false
ENVIRONMENT_HELPER="${ROOT_DIR}/scripts/prepare-contained-shell-environment.sh"

[[ -f "${ENVIRONMENT_HELPER}" && ! -L "${ENVIRONMENT_HELPER}" ]] || {
  echo "Contained shell environment helper is unavailable." >&2
  exit 2
}
source "${ENVIRONMENT_HELPER}"
counterlab_prepare_contained_shell_environment "${ROOT_DIR}"

if [[ "${1:-}" == "--build" ]]; then
  BUILD_IMAGE=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--build]" >&2
  exit 2
fi

if [[ -z "${RUNTIME_ADAPTER}" ]]; then
  echo "COUNTERLAB_DOCKER_BIN must name the repository-contained runtime adapter." >&2
  exit 2
fi
case "${RUNTIME_ADAPTER}" in
  /*) ;;
  *) RUNTIME_ADAPTER="${ROOT_DIR}/${RUNTIME_ADAPTER#./}" ;;
esac
RUNTIME_ADAPTER="$(realpath -e -- "${RUNTIME_ADAPTER}")"
case "${RUNTIME_ADAPTER}" in "${ROOT_DIR}"/*) ;; *) echo "Runtime adapter escaped the repository." >&2; exit 2 ;; esac
if [[ ! -x "${RUNTIME_ADAPTER}" || -L "${RUNTIME_ADAPTER}" ]]; then
  echo "The repository-contained runtime adapter is unavailable." >&2
  exit 2
fi
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "CounterLab Python environment is missing at ${PYTHON_BIN}." >&2
  exit 2
fi

if ! IMAGE_INSPECTION="$("${RUNTIME_ADAPTER}" image inspect "${IMAGE}" 2>&1)"; then
  if [[ "${BUILD_IMAGE}" != true ]]; then
    echo "Sandbox image ${IMAGE} is missing." >&2
    echo "Build and run the smoke test explicitly with: $0 --build" >&2
    exit 2
  fi
  "${RUNTIME_ADAPTER}" build \
    --file "${ROOT_DIR}/services/runner/Dockerfile" \
    --tag "${IMAGE}" \
    "${ROOT_DIR}"
fi

cd "${ROOT_DIR}"
export COUNTERLAB_DOCKER_BIN="${RUNTIME_ADAPTER}"
PYTHONPATH="services/runner/src:services/kernel/src" \
  "${PYTHON_BIN}" -m counterlab_runner.smoke --root "${ROOT_DIR}" --image "${IMAGE}"
