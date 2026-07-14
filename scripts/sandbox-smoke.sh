#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="${COUNTERLAB_SANDBOX_IMAGE:-counterlab-runner:local}"
PYTHON_BIN="${ROOT_DIR}/.venv/bin/python"
BUILD_IMAGE=false

if [[ "${1:-}" == "--build" ]]; then
  BUILD_IMAGE=true
elif [[ -n "${1:-}" ]]; then
  echo "Usage: $0 [--build]" >&2
  exit 2
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required for the generated-adapter sandbox smoke test." >&2
  exit 2
fi
if ! docker info >/dev/null 2>&1; then
  echo "The Docker daemon is unavailable." >&2
  exit 2
fi
if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "CounterLab Python environment is missing at ${PYTHON_BIN}." >&2
  exit 2
fi

if ! docker image inspect "${IMAGE}" >/dev/null 2>&1; then
  if [[ "${BUILD_IMAGE}" != true ]]; then
    echo "Sandbox image ${IMAGE} is missing." >&2
    echo "Build and run the smoke test explicitly with: $0 --build" >&2
    exit 2
  fi
  docker build \
    --file "${ROOT_DIR}/services/runner/Dockerfile" \
    --tag "${IMAGE}" \
    "${ROOT_DIR}"
fi

cd "${ROOT_DIR}"
PYTHONPATH="services/runner/src:services/kernel/src" \
  "${PYTHON_BIN}" -m counterlab_runner.smoke --root "${ROOT_DIR}" --image "${IMAGE}"
