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

SMOKE_WORK_ROOT="$(repo_path "${COUNTERLAB_SMOKE_WORK_ROOT:-node_modules/.cache/counterlab-v6.1/production-smoke-work}")"
CACHE_ROOT="$(repo_path "node_modules/.cache/counterlab-v6.1")"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${SMOKE_WORK_ROOT}" "${CACHE_ROOT}"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"

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

for command in curl git python3; do
  if ! command -v "${command}" >/dev/null 2>&1; then
    echo "Missing required command: ${command}" >&2
    exit 2
  fi
done
PNPM="${ROOT_DIR}/scripts/run-contained-pnpm.sh"
[[ -x "${PNPM}" && ! -L "${PNPM}" ]] || {
  echo "Pinned repository-contained pnpm launcher is unavailable." >&2
  exit 2
}
PNPM="$(realpath -e -- "${PNPM}")"
case "${PNPM}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "pnpm launcher resolves outside the repository." >&2; exit 2 ;;
esac

if [[ -z "${COUNTERLAB_DEPLOYMENT_RECEIPT:-}" ]]; then
  echo "Production smoke requires COUNTERLAB_DEPLOYMENT_RECEIPT." >&2
  echo "Use the schema-v3 receipt written by scripts/deploy-qualified.sh." >&2
  exit 2
fi
DEPLOYMENT_RECEIPT="$(repo_path "${COUNTERLAB_DEPLOYMENT_RECEIPT}")"
[[ -f "${DEPLOYMENT_RECEIPT}" && ! -L "${DEPLOYMENT_RECEIPT}" ]] || {
  echo "Production deployment receipt is unavailable or unsafe: ${DEPLOYMENT_RECEIPT}" >&2
  exit 2
}

RELEASE_IDENTITY="$(
  python3 - "${DEPLOYMENT_RECEIPT}" <<'PY'
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import sys
from datetime import datetime

path = pathlib.Path(sys.argv[1])
body = path.read_bytes()
payload = json.loads(body)
expected = {
    "schemaVersion",
    "status",
    "workerName",
    "productionOrigin",
    "generationFilesystemReadIsolation",
    "workerEvidenceCommit",
    "runnerSourceCommit",
    "qualifiedRunnerReceiptSha256",
    "releaseCheckReceiptSha256",
    "releaseCheckCheckedAt",
    "runtimeToolchainSha256",
    "runtimeAdapterSha256",
    "adapterImageDigest",
    "workerVersionId",
    "workerTag",
    "workerMessage",
    "containerApplicationId",
    "containerApplicationVersion",
    "containerImage",
    "containerState",
    "containerImageDigest",
    "deployConfigSha256",
    "workerBundleSha256",
    "clientAssetsSha256",
    "clientAssetCount",
    "dryRunSha256",
    "dryRunFileCount",
    "deploymentStatusSha256",
    "workerVersionSha256",
    "containerStatusSha256",
    "deployedAt",
    "verifierVersion",
}
if not isinstance(payload, dict) or set(payload) != expected:
    raise SystemExit("deployment receipt fields are invalid")
if (
    payload["schemaVersion"] != "3"
    or payload["status"] != "DEPLOYED"
    or payload["workerName"] != "counterlab"
    or payload["productionOrigin"] != "https://counterlab.cserules.workers.dev"
    or payload["generationFilesystemReadIsolation"] != "PARTIAL"
    or payload["verifierVersion"] != "counterlab-deployment-v3"
):
    raise SystemExit("deployment receipt is not the deployed schema-v3 release")
commit = re.compile(r"^[a-f0-9]{40}$")
sha256 = re.compile(r"^[a-f0-9]{64}$")
image_digest = re.compile(r"^sha256:[a-f0-9]{64}$")
worker = payload["workerEvidenceCommit"]
runner = payload["runnerSourceCommit"]
version = payload["workerVersionId"]
digest = payload["containerImageDigest"]
if not isinstance(worker, str) or commit.fullmatch(worker) is None:
    raise SystemExit("deployment receipt Worker evidence commit is invalid")
if not isinstance(runner, str) or commit.fullmatch(runner) is None:
    raise SystemExit("deployment receipt runner source commit is invalid")
if (
    not isinstance(version, str)
    or re.fullmatch(
        r"[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}",
        version,
    )
    is None
):
    raise SystemExit("deployment receipt Worker version is invalid")
if not isinstance(digest, str) or image_digest.fullmatch(digest) is None:
    raise SystemExit("deployment receipt Container digest is invalid")
if payload["workerTag"] != f"git-{worker}":
    raise SystemExit("deployment receipt Worker tag is not commit-bound")
if payload["workerMessage"] != f"CounterLab Worker {worker}; runner {runner}":
    raise SystemExit("deployment receipt Worker message is not release-bound")
container_image = payload["containerImage"]
if not isinstance(container_image, str) or re.fullmatch(
    r"registry\.cloudflare\.com/[A-Za-z0-9_-]{3,64}/counterlab-runner@"
    + re.escape(digest),
    container_image,
) is None or payload["containerState"] not in {"active", "ready"}:
    raise SystemExit("deployment receipt Container observation is invalid")
if not isinstance(payload["containerApplicationId"], str) or re.fullmatch(
    r"[A-Za-z0-9_-]{1,128}", payload["containerApplicationId"]
) is None:
    raise SystemExit("deployment receipt Container application is invalid")
if not isinstance(payload["containerApplicationVersion"], str) or re.fullmatch(
    r"[1-9][0-9]*", payload["containerApplicationVersion"]
) is None:
    raise SystemExit("deployment receipt Container version is invalid")
for field in (
    "qualifiedRunnerReceiptSha256",
    "releaseCheckReceiptSha256",
    "runtimeToolchainSha256",
    "runtimeAdapterSha256",
    "deployConfigSha256",
    "workerBundleSha256",
    "clientAssetsSha256",
    "dryRunSha256",
    "deploymentStatusSha256",
    "workerVersionSha256",
    "containerStatusSha256",
):
    if not isinstance(payload[field], str) or sha256.fullmatch(payload[field]) is None:
        raise SystemExit(f"deployment receipt {field} is invalid")
if not isinstance(payload["adapterImageDigest"], str) or image_digest.fullmatch(
    payload["adapterImageDigest"]
) is None:
    raise SystemExit("deployment receipt adapter digest is invalid")
for field in ("clientAssetCount", "dryRunFileCount"):
    if (
        not isinstance(payload[field], int)
        or isinstance(payload[field], bool)
        or payload[field] <= 0
    ):
        raise SystemExit(f"deployment receipt {field} is invalid")
try:
    checked_at = datetime.fromisoformat(
        str(payload["releaseCheckCheckedAt"]).replace("Z", "+00:00")
    )
    deployed_at = datetime.fromisoformat(
        str(payload["deployedAt"]).replace("Z", "+00:00")
    )
except ValueError as error:
    raise SystemExit("deployment receipt timestamp is invalid") from error
if checked_at.tzinfo is None or deployed_at.tzinfo is None or checked_at > deployed_at:
    raise SystemExit("deployment receipt timestamp order is invalid")
receipt_hash = hashlib.sha256(body).hexdigest()
print("\t".join((
    version,
    worker,
    runner,
    digest,
    receipt_hash,
    payload["productionOrigin"],
)))
PY
)"
IFS=$'\t' read -r WORKER_VERSION_ID WORKER_EVIDENCE_COMMIT RUNNER_SOURCE_COMMIT CONTAINER_IMAGE_DIGEST DEPLOYMENT_RECEIPT_SHA256 PRODUCTION_ORIGIN <<<"${RELEASE_IDENTITY}"

if [[ "${BASE_URL}" != "${PRODUCTION_ORIGIN}" ]]; then
  echo "Production smoke URL does not match the deployment receipt origin." >&2
  exit 2
fi

if [[ "$(git rev-parse HEAD)" != "${WORKER_EVIDENCE_COMMIT}" ]]; then
  echo "Production smoke HEAD does not match the deployed Worker evidence commit." >&2
  exit 2
fi
if ! git merge-base --is-ancestor "${RUNNER_SOURCE_COMMIT}" "${WORKER_EVIDENCE_COMMIT}"; then
  echo "The deployed runner source is not an ancestor of the Worker evidence commit." >&2
  exit 2
fi
if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Production smoke requires a completely clean worktree." >&2
  exit 2
fi

if [[ -z "${CLOAK_CDP_ENDPOINT:-}" ]]; then
  echo "Production browser smoke requires CLOAK_CDP_ENDPOINT." >&2
  exit 2
fi

SMOKE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
REPORT_PATH="$(repo_path "${COUNTERLAB_SMOKE_REPORT_PATH:-node_modules/.cache/counterlab-v6.1/releases/production-smoke-${WORKER_VERSION_ID}-${SMOKE_RUN_ID}.json}")"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${SMOKE_WORK_ROOT}" "${REPORT_PATH}" "${CACHE_ROOT}"

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
if payload.pop("schemaVersion", None) != "3":
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
if integrity_mode != "hmac-signed":
    raise SystemExit("production Proof Capsule must be HMAC-signed")
byte_length = payload.pop("proofCapsuleByteLength", None)
if not isinstance(byte_length, int) or isinstance(byte_length, bool) or byte_length <= 0:
    raise SystemExit("Proof Capsule byte length is invalid")
if payload.pop("replayPlaybackMode", None) != "verified_capsule_replay":
    raise SystemExit("published replay playback mode is invalid")
if payload.pop("replaySourceMode", None) != "live_notebook":
    raise SystemExit("published replay source mode is invalid")
if payload.pop("replayPersistedAfterRefresh", None) is not True:
    raise SystemExit("replay persistence check failed")
if payload.pop("publicReplayAuthorityMatches", None) is not True:
    raise SystemExit("public replay authority binding failed")
if payload.pop("publicReplayPrivateArtifactsUnavailable", None) is not True:
    raise SystemExit("public replay exposed a private artifact route")
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
    "ownerProofCapsuleSha256",
    "ownerPatchedNotebookSha256",
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
    "publicReplayAuthorityMatches": True,
    "publicReplayPrivateArtifactsUnavailable": True,
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
init_args+=(--deployment-id "${WORKER_VERSION_ID}")
init_args+=(--worker-evidence-commit "${WORKER_EVIDENCE_COMMIT}")
init_args+=(--runner-source-commit "${RUNNER_SOURCE_COMMIT}")
init_args+=(--container-image-digest "${CONTAINER_IMAGE_DIGEST}")
init_args+=(--deployment-receipt-sha256 "${DEPLOYMENT_RECEIPT_SHA256}")
python3 "${REPORT_HELPER}" "${init_args[@]}"
REPORT_INITIALIZED=1

printf '%-24s | %-13s | %s\n' "STAGE" "MODE" "STATUS"
printf '%-24s-+-%-13s-+-%s\n' "------------------------" "-------------" "------"

stage_started="$(timestamp)"
curl --fail --silent --show-error \
  --proto '=https' --proto-redir '=https' --max-redirs 0 \
  --max-time 30 \
  "${BASE_URL}/ready" \
  >"${WORK_DIR}/ready.json"
python3 - "${WORK_DIR}/ready.json" "${WORKER_VERSION_ID}" "${WORKER_EVIDENCE_COMMIT}" "${RUNNER_SOURCE_COMMIT}" "${CONTAINER_IMAGE_DIGEST}" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if payload.get("status") != "ready":
    raise SystemExit("public readiness response is not ready")
checks = payload.get("checks")
expected_checks = {
    "admission",
    "analyst",
    "maintenance",
    "persistence",
    "privateStorage",
    "releaseIdentity",
    "runner",
    "signing",
}
if (
    not isinstance(checks, dict)
    or set(checks) != expected_checks
    or any(value is not True for value in checks.values())
):
    raise SystemExit("public readiness checks are incomplete")
expected_release = {
    "status": "bound",
    "workerVersionId": sys.argv[2],
    "workerVersionTag": f"git-{sys.argv[3]}",
    "workerEvidenceCommit": sys.argv[3],
    "runnerSourceCommit": sys.argv[4],
    "runnerImageDigest": sys.argv[5],
}
if payload.get("release") != expected_release:
    raise SystemExit("public readiness release identity does not match the receipt")
if payload.get("maintenance") is not False:
    raise SystemExit("public readiness reports maintenance mode")
PY
record_stage \
  "public-readiness" "control_plane" "PASSED" "${stage_started}" "$(timestamp)" "" \
  "{\"responseSha256\":\"$(sha256_file "${WORK_DIR}/ready.json")\"}"

stage_started="$(timestamp)"
curl --fail --silent --show-error \
  --proto '=https' --proto-redir '=https' --max-redirs 0 \
  --max-time 30 \
  "${BASE_URL}/api/health" \
  >"${WORK_DIR}/health.json"
python3 - "${WORK_DIR}/health.json" "${WORKER_VERSION_ID}" "${WORKER_EVIDENCE_COMMIT}" "${RUNNER_SOURCE_COMMIT}" "${CONTAINER_IMAGE_DIGEST}" <<'PY'
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
    "sandbox": "credential-and-privilege-boundary",
    "generationFilesystemReadIsolation": "PARTIAL",
}
for key, expected in required.items():
    if health.get(key) != expected:
        raise SystemExit(
            f"production capability {key} is {health.get(key)!r}; expected {expected!r}"
        )
if health.get("maintenance") is not False:
    raise SystemExit("production health reports maintenance mode")
expected_release = {
    "status": "bound",
    "workerVersionId": sys.argv[2],
    "workerVersionTag": f"git-{sys.argv[3]}",
    "workerEvidenceCommit": sys.argv[3],
    "runnerSourceCommit": sys.argv[4],
    "runnerImageDigest": sys.argv[5],
}
if health.get("release") != expected_release:
    raise SystemExit("production health release identity does not match the receipt")
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

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError(f"public release redirected to {newurl}")

opener = urllib.request.build_opener(NoRedirect)

def open_public(url):
    parsed = urllib.parse.urlsplit(url)
    expected = urllib.parse.urlsplit(base)
    if parsed.scheme != expected.scheme or parsed.netloc != expected.netloc:
        raise RuntimeError(f"public asset escaped the release origin: {url}")
    request = urllib.request.Request(url, headers=headers)
    response = opener.open(request, timeout=30)
    if response.geturl() != url:
        response.close()
        raise RuntimeError(f"public asset response changed origin or path: {url}")
    return response

required_headers = {
    "content-security-policy": (
        "default-src 'none'",
        "frame-ancestors 'none'",
        "script-src 'self'",
        "connect-src 'self'",
    ),
    "x-content-type-options": ("nosniff",),
    "x-frame-options": ("DENY",),
    "referrer-policy": ("strict-origin-when-cross-origin",),
    "permissions-policy": ("camera=()", "microphone=()", "payment=()"),
    "strict-transport-security": ("max-age=31536000",),
}

def read_secured(path):
    with open_public(base + path) as response:
        body = response.read()
        for name, expected_values in required_headers.items():
            value = response.headers.get(name, "")
            if any(expected not in value for expected in expected_values):
                raise SystemExit(
                    f"public route {path} is missing required {name} policy"
                )
        return body

route_bodies = [
    read_secured(path)
    for path in (
        "/",
        "/judge",
        "/new",
        "/replay/leakage-01",
        "/counterlab-release-route-that-does-not-exist",
    )
]
html = route_bodies[0]
(destination / "index.html").write_bytes(html)

text = html.decode("utf-8", errors="replace")
paths = set(re.findall(r'''(?:src|href)=["']([^"']+)["']''', text))
public = list(route_bodies)
for path in paths:
    resolved = urllib.parse.urljoin(base + "/", path)
    if urllib.parse.urlparse(resolved).netloc != urllib.parse.urlparse(base).netloc:
        continue
    if not urllib.parse.urlparse(resolved).path.endswith((".js", ".css")):
        continue
    with open_public(resolved) as response:
        cache_control = response.headers.get("cache-control", "")
        if not all(
            value in cache_control
            for value in ("public", "max-age=31536000", "immutable")
        ):
            raise SystemExit(f"fingerprinted asset cache policy is missing: {resolved}")
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
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Judge Mode distinguishes every authority path"
record_stage "judge-mode" "control_plane" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Try Instantly persists"
record_stage "sample-lesson" "sample" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Replay remains visibly labelled"
record_stage "verified-replay" "replay" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_LIVE=1 \
COUNTERLAB_E2E_EVIDENCE_PATH="${WORK_DIR}/live-leakage.json" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
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
  "${PNPM}" --filter @counterlab/web exec playwright test \
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
