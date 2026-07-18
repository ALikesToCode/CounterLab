#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BASE_URL="${1:-${COUNTERLAB_PRODUCTION_URL:-}}"
REPORT_HELPER="${ROOT_DIR}/scripts/production_smoke_report.py"

repo_path() {
  local requested="$1"
  local candidate
  local resolved
  if [[ "${requested}" == /* ]]; then
    candidate="${requested}"
  else
    candidate="${ROOT_DIR}/${requested#./}"
  fi
  case "${candidate}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*) ;;
    *)
      echo "Smoke-test paths must remain inside ${ROOT_DIR}: ${requested}" >&2
      return 2
      ;;
  esac
  case "/${candidate#${ROOT_DIR}/}/" in
    *"/../"*)
      echo "Smoke-test paths must not traverse parent directories: ${requested}" >&2
      return 2
      ;;
  esac
  resolved="$(realpath -m -- "${candidate}")"
  case "${resolved}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*) printf '%s\n' "${resolved}" ;;
    *)
      echo "Smoke-test path resolves outside ${ROOT_DIR}: ${requested}" >&2
      return 2
      ;;
  esac
}

REPORT_PATH="$(repo_path "${COUNTERLAB_SMOKE_REPORT_PATH:-data/production-smoke-report.json}")"
SMOKE_WORK_ROOT="$(repo_path "${COUNTERLAB_SMOKE_WORK_ROOT:-node_modules/.cache/counterlab-v6.1/production-smoke-work}")"

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

if [[ -z "${COUNTERLAB_DEPLOYMENT_ID:-}" || -z "${COUNTERLAB_CONTAINER_IMAGE_DIGEST:-}" ]]; then
  echo "Production smoke requires COUNTERLAB_DEPLOYMENT_ID and COUNTERLAB_CONTAINER_IMAGE_DIGEST." >&2
  echo "Use the exact Worker version and sha256 image digest from this release." >&2
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
if payload.pop("schemaVersion", None) != "2":
    raise SystemExit("live smoke evidence schema is invalid")
concept = payload.pop("concept", None)
if concept != sys.argv[2]:
    raise SystemExit("live smoke evidence concept is invalid")

token = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$")
session_id = payload.pop("sessionId", None)
if not isinstance(session_id, str) or token.fullmatch(session_id) is None:
    raise SystemExit("live smoke session authority is missing")
published_replay_id = payload.pop("publishedReplayId", None)
if (
    not isinstance(published_replay_id, str)
    or token.fullmatch(published_replay_id) is None
):
    raise SystemExit("published replay authority is missing")

if payload.pop("proofCapsuleMediaType", None) != "application/vnd.counterlab.capsule+json":
    raise SystemExit("Proof Capsule media type is invalid")
integrity_mode = payload.pop("proofCapsuleIntegrityMode", None)
if integrity_mode not in {"integrity-hashed", "hmac-signed"}:
    raise SystemExit("Proof Capsule integrity mode is invalid")
byte_length = payload.pop("proofCapsuleByteLength", None)
if not isinstance(byte_length, int) or isinstance(byte_length, bool) or byte_length <= 0:
    raise SystemExit("Proof Capsule byte length is invalid")
if payload.pop("replayPlaybackMode", None) != "verified_capsule_replay":
    raise SystemExit("published replay playback mode is invalid")
if payload.pop("replaySourceMode", None) != "live_notebook":
    raise SystemExit("published replay source mode is invalid")
if payload.pop("replayPersistedAfterRefresh", None) is not True:
    raise SystemExit("replay persistence check failed")
if payload.pop("replayDownloadsMatch", None) is not True:
    raise SystemExit("replay download authority check failed")
if payload.pop("duplicateReplayPublicationReused", None) is not True:
    raise SystemExit("duplicate replay publication was not reused")

authority_keys = {
    "duplicateCompileReused",
    "reconnectedFromCursor",
    "cancellationAcknowledged",
    "cancelledWithoutResult",
    "duplicateCancelReused",
}
authority = {
    key: payload.pop(key)
    for key in list(payload)
    if key in authority_keys
}
if concept == "entity_leakage":
    if set(authority) != authority_keys or not all(value is True for value in authority.values()):
        raise SystemExit("live leakage authority checks are incomplete")
elif authority:
    raise SystemExit("unexpected authority checks for this concept")
if not isinstance(payload.get("scientificEngineSnapshotHash"), str):
    raise SystemExit("live smoke scientific engine authority is missing")

hash_keys = {
    "sourceArtifactHash",
    "experimentIrHash",
    "experimentSelectionHash",
    "resultHash",
    "evidenceVerdictHash",
    "epistemicReportHash",
    "boundaryMapHash",
    "boundaryReceiptHash",
    "transferResultHash",
    "patchPlanHash",
    "patchResultHash",
    "patchedArtifactHash",
    "patchedNotebookSha256",
    "proofCapsuleSha256",
    "proofCapsuleRootHash",
    "proofCapsuleBytesHash",
    "reasoningDiffHash",
    "eventChainHead",
    "scientificEngineSnapshotHash",
    "replayProjectionHash",
    "replayProofCapsuleSha256",
    "replayPatchedNotebookSha256",
}
if set(payload) != hash_keys or any(
    not isinstance(payload[key], str)
    or re.fullmatch(r"[a-f0-9]{64}", payload[key]) is None
    for key in hash_keys
):
    raise SystemExit("live smoke evidence hashes are invalid")
print(json.dumps({
    **payload,
    **authority,
    "sessionId": session_id,
    "publishedReplayId": published_replay_id,
    "proofCapsuleMediaType": "application/vnd.counterlab.capsule+json",
    "proofCapsuleIntegrityMode": integrity_mode,
    "proofCapsuleByteLength": byte_length,
    "replayPlaybackMode": "verified_capsule_replay",
    "replaySourceMode": "live_notebook",
    "replayPersistedAfterRefresh": True,
    "replayDownloadsMatch": True,
    "duplicateReplayPublicationReused": True,
}, separators=(",", ":")))
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

SMOKE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
WORK_DIR="${SMOKE_WORK_ROOT}/${SMOKE_RUN_ID}"
mkdir -p "${SMOKE_WORK_ROOT}" "$(dirname "${REPORT_PATH}")"
mkdir "${WORK_DIR}"
REPORT_INITIALIZED=0
SMOKE_STATUS="FAILED"
cleanup() {
  if [[ "${REPORT_INITIALIZED}" == "1" && "${SMOKE_STATUS}" != "PASSED" ]]; then
    python3 "${REPORT_HELPER}" finish "${REPORT_PATH}" \
      --status FAILED --completed-at "$(timestamp)" >/dev/null 2>&1 || true
  fi
  printf 'Retained production-smoke workspace: %s\n' "${WORK_DIR}"
}
trap cleanup EXIT

started_at="$(timestamp)"
init_args=(
  init "${REPORT_PATH}"
  --base-url "${BASE_URL}"
  --started-at "${started_at}"
)
init_args+=(--deployment-id "${COUNTERLAB_DEPLOYMENT_ID}")
init_args+=(--container-image-digest "${COUNTERLAB_CONTAINER_IMAGE_DIGEST}")
python3 "${REPORT_HELPER}" "${init_args[@]}"
REPORT_INITIALIZED=1

printf '%-24s | %-13s | %s\n' "STAGE" "MODE" "STATUS"
printf '%-24s-+-%-13s-+-%s\n' "------------------------" "-------------" "------"

stage_started="$(timestamp)"
curl --fail --silent --show-error \
  --max-time 30 \
  "${BASE_URL}/ready" \
  >"${WORK_DIR}/ready.json"
python3 - "${WORK_DIR}/ready.json" <<'PY'
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
  "{\"responseSha256\":\"$(sha256_file "${WORK_DIR}/ready.json")\"}"

stage_started="$(timestamp)"
curl --fail --silent --show-error \
  --max-time 30 \
  "${BASE_URL}/api/health" \
  >"${WORK_DIR}/health.json"
python3 - "${WORK_DIR}/health.json" <<'PY'
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
  "{\"responseSha256\":\"$(sha256_file "${WORK_DIR}/health.json")\"}"

stage_started="$(timestamp)"
python3 - "${BASE_URL}" "${WORK_DIR}" <<'PY'
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
  "{\"documentSha256\":\"$(sha256_file "${WORK_DIR}/index.html")\"}"

cd "${ROOT_DIR}"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Judge Mode distinguishes every authority path"
record_stage "judge-mode" "control_plane" "PASSED" "${stage_started}" "$(timestamp)"

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
COUNTERLAB_E2E_EVIDENCE_PATH="${WORK_DIR}/live-leakage.json" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes an untouched leakage notebook"
leakage_evidence="$(live_evidence "${WORK_DIR}/live-leakage.json" "entity_leakage")"
record_stage \
  "live-leakage" "live_notebook" "PASSED" "${stage_started}" "$(timestamp)" \
  "entity_leakage" "${leakage_evidence}"
record_stage \
  "hosted-capsule-replay" "replay" "PASSED" "${stage_started}" "$(timestamp)" \
  "entity_leakage" "${leakage_evidence}"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_LIVE=1 \
COUNTERLAB_E2E_EVIDENCE_PATH="${WORK_DIR}/live-imbalance.json" \
  pnpm --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes an untouched class-imbalance notebook"
record_stage \
  "live-imbalance" "live_notebook" "PASSED" "${stage_started}" "$(timestamp)" \
  "class_imbalance" "$(live_evidence "${WORK_DIR}/live-imbalance.json" "class_imbalance")"

python3 "${REPORT_HELPER}" finish "${REPORT_PATH}" \
  --status PASSED --completed-at "$(timestamp)"
SMOKE_STATUS="PASSED"

echo "Production smoke: PASS"
echo "Production smoke report: ${REPORT_PATH}"
