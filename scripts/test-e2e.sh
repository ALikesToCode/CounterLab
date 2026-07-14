#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${ROOT_DIR}/apps/web"
pnpm exec wrangler d1 migrations apply counterlab --local
pnpm run test:e2e
