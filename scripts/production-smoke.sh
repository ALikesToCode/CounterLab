#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${1:-${COUNTERLAB_PRODUCTION_URL:-}}"
REPORT_PATH="${COUNTERLAB_SMOKE_REPORT_PATH:-${ROOT_DIR}/data/production-smoke-report.json}"
REPORT_HELPER="${ROOT_DIR}/scripts/production_smoke_report.py"

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

timestamp() {
  python3 - <<'PY'
from datetime import datetime, timezone
print(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
PY
}

sha256_file() {
  python3 - "$1" <<'PY'
import hashlib
import pathlib
import sys
print(hashlib.sha256(pathlib.Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

live_evidence() {
  python3 - "$1" "$2" <<'PY'
import json
import pathlib
import re
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.pop("schemaVersion", None) != "1":
    raise SystemExit("live smoke evidence schema is invalid")
if payload.pop("concept", None) != sys.argv[2]:
    raise SystemExit("live smoke evidence concept is invalid")
if not payload or any(
    not isinstance(value, str) or re.fullmatch(r"[a-f0-9]{64}", value) is None
    for value in payload.values()
):
    raise SystemExit("live smoke evidence hashes are invalid")
print(json.dumps(payload, separators=(",", ":")))
PY
}

record_stage() {
  local stage_id="$1"
  local mode="$2"
  local status="$3"
  local started_at="$4"
  local completed_at="$5"
  local concept="${6:-}"
  local evidence_json="${7:-}"
  if [[ -z "${evidence_json}" ]]; then
    evidence_json="{}"
  fi
  local stage_json
  stage_json="$(
    python3 - "${stage_id}" "${mode}" "${status}" "${started_at}" "${completed_at}" "${concept}" "${evidence_json}" <<'PY'
import json
import sys
stage = {
    "id": sys.argv[1],
    "mode": sys.argv[2],
    "status": sys.argv[3],
    "startedAt": sys.argv[4],
    "completedAt": sys.argv[5],
    "evidence": json.loads(sys.argv[7]),
}
if sys.argv[6]:
    stage["concept"] = sys.argv[6]
print(json.dumps(stage, separators=(",", ":")))
PY
  )"
  python3 "${REPORT_HELPER}" stage "${REPORT_PATH}" --stage-json "${stage_json}"
  printf 'Production stage | %-22s | %-13s | %s\n' "${stage_id}" "${mode}" "${status}"
}

TMP_DIR="$(mktemp -d)"
REPORT_INITIALIZED=0
SMOKE_STATUS="FAILED"
cleanup() {
  if [[ "${REPORT_INITIALIZED}" == "1" && "${SMOKE_STATUS}" != "PASSED" ]]; then
    python3 "${REPORT_HELPER}" finish "${REPORT_PATH}" \
      --status FAILED --completed-at "$(timestamp)" >/dev/null 2>&1 || true
  fi
  rm -rf "${TMP_DIR}"
}
trap cleanup EXIT

started_at="$(timestamp)"
init_args=(
  init "${REPORT_PATH}"
  --base-url "${BASE_URL}"
  --started-at "${started_at}"
)
if [[ -n "${COUNTERLAB_DEPLOYMENT_ID:-}" ]]; then
  init_args+=(--deployment-id "${COUNTERLAB_DEPLOYMENT_ID}")
fi
if [[ -n "${COUNTERLAB_CONTAINER_IMAGE_DIGEST:-}" ]]; then
  init_args+=(--container-image-digest "${COUNTERLAB_CONTAINER_IMAGE_DIGEST}")
fi
python3 "${REPORT_HELPER}" "${init_args[@]}"
REPORT_INITIALIZED=1

printf '%-24s | %-13s | %s\n' "STAGE" "MODE" "STATUS"
printf '%-24s-+-%-13s-+-%s\n' "------------------------" "-------------" "------"

stage_started="$(timestamp)"
curl --fail --silent --show-error \
  --max-time 30 \
  "${BASE_URL}/ready" \
  >"${TMP_DIR}/ready.json"
python3 - "${TMP_DIR}/ready.json" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.get("status") != "ready":
    raise SystemExit("public readiness response is not ready")
checks = payload.get("checks")
if not isinstance(checks, dict) or not checks or not all(checks.values()):
    raise SystemExit("public readiness checks are incomplete")
PY
record_stage \
  "public-readiness" "control_plane" "PASSED" "${stage_started}" "$(timestamp)" "" \
  "{\"responseSha256\":\"$(sha256_file "${TMP_DIR}/ready.json")\"}"

stage_started="$(timestamp)"
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
PY
record_stage \
  "capability-health" "control_plane" "PASSED" "${stage_started}" "$(timestamp)" "" \
  "{\"responseSha256\":\"$(sha256_file "${TMP_DIR}/health.json")\"}"

stage_started="$(timestamp)"
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
    "runner signing value": r'COUNTERLAB_RUNNER_SIGNING_(?:PRIVATE_)?KEY\s*[:=]\s*["\'][A-Za-z0-9_-]{32,}',
}.items():
    if re.search(pattern, joined):
        raise SystemExit(f"public asset secret scan failed: {label}")
print(f"Public asset secret scan: PASS ({len(public)} response bodies)")
PY
record_stage \
  "public-secret-scan" "control_plane" "PASSED" "${stage_started}" "$(timestamp)" "" \
  "{\"documentSha256\":\"$(sha256_file "${TMP_DIR}/index.html")\"}"

cd "${ROOT_DIR}"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Try Instantly persists"
record_stage "sample-lesson" "sample" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Replay remains visibly labelled"
record_stage "verified-replay" "replay" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_LIVE=1 \
COUNTERLAB_E2E_EVIDENCE_PATH="${TMP_DIR}/live-leakage.json" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes an untouched leakage notebook"
record_stage \
  "live-leakage" "live_notebook" "PASSED" "${stage_started}" "$(timestamp)" \
  "entity_leakage" "$(live_evidence "${TMP_DIR}/live-leakage.json" "entity_leakage")"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_LIVE=1 \
COUNTERLAB_E2E_EVIDENCE_PATH="${TMP_DIR}/live-imbalance.json" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes an untouched class-imbalance notebook"
record_stage \
  "live-imbalance" "live_notebook" "PASSED" "${stage_started}" "$(timestamp)" \
  "class_imbalance" "$(live_evidence "${TMP_DIR}/live-imbalance.json" "class_imbalance")"

python3 "${REPORT_HELPER}" finish "${REPORT_PATH}" \
  --status PASSED --completed-at "$(timestamp)"
SMOKE_STATUS="PASSED"

echo "Production smoke: PASS"
echo "Production smoke report: ${REPORT_PATH}"
