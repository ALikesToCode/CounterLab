#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RECEIPT="${COUNTERLAB_QUALIFIED_RUNNER_RECEIPT:-}"
IMAGE="${COUNTERLAB_QUALIFIED_RUNNER_IMAGE:-}"

if [[ -z "${RECEIPT}" || -z "${IMAGE}" ]]; then
  echo "Qualified deployment requires both variables:" >&2
  echo "  COUNTERLAB_QUALIFIED_RUNNER_RECEIPT=/path/to/qualified-runner.json" >&2
  echo "  COUNTERLAB_QUALIFIED_RUNNER_IMAGE=registry.cloudflare.com/<account>/counterlab-runner:git-<commit>" >&2
  exit 2
fi

cd "${ROOT_DIR}"

if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
  echo "Qualified deployment requires a clean tracked worktree." >&2
  exit 2
fi

[[ -f "${RECEIPT}" ]] || {
  echo "Qualified runner receipt not found: ${RECEIPT}" >&2
  exit 2
}

LOCAL_IMAGE="$(node -e '
  const fs = require("node:fs");
  const receipt = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  if (typeof receipt.localImageTag !== "string") process.exit(2);
  process.stdout.write(receipt.localImageTag);
' "${RECEIPT}")"

./scripts/verify-scientific-engines.sh --image "${LOCAL_IMAGE}"

pnpm --filter @counterlab/web build
pnpm exec tsx scripts/prepare-qualified-deploy.ts \
  --config apps/web/dist/counterlab/wrangler.json \
  --receipt "${RECEIPT}" \
  --image "${IMAGE}" \
  --output apps/web/dist/counterlab/wrangler.release.json
pnpm exec wrangler deploy \
  --config apps/web/dist/counterlab/wrangler.release.json \
  --containers-rollout gradual
