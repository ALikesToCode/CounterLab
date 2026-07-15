#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${1:-${COUNTERLAB_PRODUCTION_URL:-}}"

if [[ -z "${BASE_URL}" ]]; then
  echo "Usage: ./scripts/production-smoke.sh https://counterlab.example" >&2
  echo "Or set COUNTERLAB_PRODUCTION_URL." >&2
  exit 2
fi

BASE_URL="${BASE_URL%/}"
if [[ ! "${BASE_URL}" =~ ^https:// ]]; then
  echo "Production smoke requires an HTTPS URL." >&2
  exit 2
fi

for command in curl pnpm python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 2
  fi
done

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT

echo "Checking typed production capability response..."
curl --fail --silent --show-error \
  --max-time 30 \
  "${BASE_URL}/api/health" \
  >"${TMP_DIR}/health.json"

python3 - "${TMP_DIR}/health.json" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.get("ok") is not True:
    raise SystemExit("health response is not a success envelope")
health = payload.get("data", {})
required = {
    "platform": "cloudflare-workers",
    "sample": "available",
    "replay": "available",
    "liveGpt": "configured",
    "liveCodex": "configured",
    "liveKernel": "configured",
    "sandbox": "configured",
}
for key, expected in required.items():
    if health.get(key) != expected:
        raise SystemExit(
            f"production capability {key} is {health.get(key)!r}; expected {expected!r}"
        )
print("Capability response: PASS")
PY

echo "Scanning public HTML and same-origin assets for secret-shaped content..."
python3 - "${BASE_URL}" "${TMP_DIR}" <<'PY'
import pathlib
import re
import sys
import urllib.parse
import urllib.request

base = sys.argv[1]
destination = pathlib.Path(sys.argv[2])
headers = {"User-Agent": "CounterLab release smoke"}

def open_public(url):
    request = urllib.request.Request(url, headers=headers)
    return urllib.request.urlopen(request, timeout=30)

with open_public(base + "/") as response:
    html = response.read()
(destination / "index.html").write_bytes(html)

text = html.decode("utf-8", errors="replace")
paths = set(re.findall(r'''(?:src|href)=["']([^"']+)["']''', text))
public = [html]
for path in paths:
    resolved = urllib.parse.urljoin(base + "/", path)
    if urllib.parse.urlparse(resolved).netloc != urllib.parse.urlparse(base).netloc:
        continue
    if not urllib.parse.urlparse(resolved).path.endswith((".js", ".css")):
        continue
    with open_public(resolved) as response:
        public.append(response.read())

joined = b"\n".join(public).decode("utf-8", errors="replace")
for label, pattern in {
    "private key": r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    "API credential": r"\bsk-[A-Za-z0-9_-]{24,}\b",
    "Codex credential bundle": r'CODEX_AUTH_JSON\s*[:=]\s*["\']?\{',
    "runner signing value": r'COUNTERLAB_RUNNER_SIGNING_KEY\s*[:=]\s*["\'][A-Fa-f0-9]{32,}',
}.items():
    if re.search(pattern, joined):
        raise SystemExit(f"public asset secret scan failed: {label}")
print(f"Public asset secret scan: PASS ({len(public)} response bodies)")
PY

cd "${ROOT_DIR}"

echo "Running deployed sample and replay browser smoke..."
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Try Instantly persists|Replay remains visibly labelled"

echo "Running the real hosted notebook, control, transfer, patch, and proof smoke..."
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_LIVE=1 \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes"

echo "Production smoke: PASS"
