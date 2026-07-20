#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
BASE_URL="${1:-${COUNTERLAB_PRODUCTION_URL:-}}"
REPORT_HELPER="${ROOT_DIR}/scripts/production_smoke_report.py"

[[ -f "${ROOT_DIR}/COUNTERLAB_REPO_ROOT" ]] || {
  echo "CounterLab repository marker is missing." >&2
  exit 2
}

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
  "${SMOKE_WORK_ROOT}" "${CACHE_ROOT}" \
  "${CACHE_ROOT}/home" "${CACHE_ROOT}/tmp" "${CACHE_ROOT}/xdg-cache" \
  "${CACHE_ROOT}/xdg-config" "${CACHE_ROOT}/xdg-data" \
  "${CACHE_ROOT}/gitconfig"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${GIT_CONFIG_GLOBAL}"
[[ "$(git -C "${ROOT_DIR}" rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Production smoke requires the verified CounterLab Git root." >&2
  exit 2
}

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

for command in curl git node python3 sha256sum; do
  COMMAND_PATH="$(command -v "${command}" || true)"
  if [[ -z "${COMMAND_PATH}" ]]; then
    echo "Missing required command: ${command}" >&2
    exit 2
  fi
done
CURL_BIN="$(command -v curl)"
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
  echo "Use the schema-v7 receipt written by scripts/deploy-qualified.sh." >&2
  exit 2
fi
DEPLOYMENT_RECEIPT="$(repo_path "${COUNTERLAB_DEPLOYMENT_RECEIPT}")"
[[ -f "${DEPLOYMENT_RECEIPT}" && ! -L "${DEPLOYMENT_RECEIPT}" ]] || {
  echo "Production deployment receipt is unavailable or unsafe: ${DEPLOYMENT_RECEIPT}" >&2
  exit 2
}
if [[ -z "${COUNTERLAB_FROZEN_WORKER_MANIFEST:-}" ]]; then
  echo "Production smoke requires COUNTERLAB_FROZEN_WORKER_MANIFEST." >&2
  exit 2
fi
FROZEN_WORKER_MANIFEST="$(repo_path "${COUNTERLAB_FROZEN_WORKER_MANIFEST}")"
[[ -f "${FROZEN_WORKER_MANIFEST}" && ! -L "${FROZEN_WORKER_MANIFEST}" ]] || {
  echo "Frozen Worker manifest is unavailable or unsafe: ${FROZEN_WORKER_MANIFEST}" >&2
  exit 2
}

RELEASE_IDENTITY_JSON="$(
  cd "${ROOT_DIR}"
  node --import tsx scripts/release-check-receipt.ts \
    deployment-identity \
    --deployment "${DEPLOYMENT_RECEIPT}"
)"
deployment_identity_value() {
  local field="$1"
  node -e '
const [raw, field] = process.argv.slice(1);
const identity = JSON.parse(raw);
const outerFields = ["identitySchemaVersion", "receipt", "receiptSha256", "receiptType"];
if (
  Object.keys(identity).sort().join("\n") !== outerFields.sort().join("\n") ||
  identity.identitySchemaVersion !== "1" ||
  identity.receiptType !== "deployment-receipt" ||
  !/^[a-f0-9]{64}$/.test(identity.receiptSha256)
) throw new Error("deployment release identity envelope is invalid");
if (field === "receiptSha256") {
  process.stdout.write(identity.receiptSha256);
} else if (Object.hasOwn(identity.receipt, field)) {
  const value = identity.receipt[field];
  if (
    !(typeof value === "string" && value.length > 0) &&
    !(Number.isSafeInteger(value) && value > 0)
  ) throw new Error(`deployment release identity field is invalid: ${field}`);
  process.stdout.write(String(value));
} else {
  throw new Error(`deployment release identity field is unavailable: ${field}`);
}
' "${RELEASE_IDENTITY_JSON}" "${field}"
}
WORKER_VERSION_ID="$(deployment_identity_value workerVersionId)"
WORKER_EVIDENCE_COMMIT="$(deployment_identity_value workerEvidenceCommit)"
RUNNER_SOURCE_COMMIT="$(deployment_identity_value runnerSourceCommit)"
CONTAINER_IMAGE_DIGEST="$(deployment_identity_value containerImageDigest)"
TIMEOUT_CLEANUP_RECEIPT_SHA256="$(deployment_identity_value timeoutCleanupReceiptSha256)"
AGGREGATE_LIMIT_EVIDENCE_SHA256="$(deployment_identity_value aggregateLimitEvidenceSha256)"
RUNTIME_POLICY_SHA256="$(deployment_identity_value runtimePolicySha256)"
PROOF_DEPENDENCY_MANIFEST_SHA256="$(deployment_identity_value proofDependencyManifestSha256)"
GENERATION_ISOLATION_EVIDENCE_SHA256="$(deployment_identity_value generationIsolationEvidenceSha256)"
GENERATION_ISOLATION_PROBE_SHA256="$(deployment_identity_value generationIsolationProbeSha256)"
GENERATION_ISOLATION_VERIFIED_AT="$(deployment_identity_value generationIsolationVerifiedAt)"
RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256="$(deployment_identity_value releaseCheckGenerationIsolationEvidenceSha256)"
RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256="$(deployment_identity_value releaseCheckGenerationIsolationProbeSha256)"
RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT="$(deployment_identity_value releaseCheckGenerationIsolationVerifiedAt)"
WORKER_ARTIFACT_CLASSIFICATION="$(deployment_identity_value workerArtifactClassification)"
WORKER_ARTIFACT_MANIFEST_SHA256="$(deployment_identity_value workerArtifactManifestSha256)"
WORKER_BUNDLE_SHA256="$(deployment_identity_value workerBundleSha256)"
CLIENT_ASSETS_SHA256="$(deployment_identity_value clientAssetsSha256)"
CLIENT_ASSET_COUNT="$(deployment_identity_value clientAssetCount)"
CLIENT_PUBLIC_ASSETS_SHA256="$(deployment_identity_value clientPublicAssetsSha256)"
CLIENT_PUBLIC_ASSET_COUNT="$(deployment_identity_value clientPublicAssetCount)"
FROZEN_VITE_VERSION="$(deployment_identity_value viteVersion)"
FROZEN_WRANGLER_VERSION="$(deployment_identity_value wranglerVersion)"
DEPLOYMENT_RECEIPT_SHA256="$(deployment_identity_value receiptSha256)"
PRODUCTION_ORIGIN="$(deployment_identity_value productionOrigin)"
[[ "$(sha256sum "${DEPLOYMENT_RECEIPT}" | cut -d ' ' -f 1)" == "${DEPLOYMENT_RECEIPT_SHA256}" ]] || {
  echo "Deployment receipt bytes changed after identity validation." >&2
  exit 2
}
[[ "$(sha256sum "${FROZEN_WORKER_MANIFEST}" | cut -d ' ' -f 1)" == "${WORKER_ARTIFACT_MANIFEST_SHA256}" ]] || {
  echo "Frozen Worker manifest bytes do not match the deployment receipt." >&2
  exit 2
}
node --import tsx scripts/frozen-worker-release.ts verify \
  --manifest "${FROZEN_WORKER_MANIFEST}"

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
    FAILED_REPORT_OUTPUT="$(
      python3 "${REPORT_HELPER}" finish "${REPORT_PATH}" \
        --status FAILED --completed-at "$(timestamp)" 2>&1
    )" || true
    if [[ -n "${FAILED_REPORT_OUTPUT}" ]]; then
      printf 'Production-smoke report finalization: %s\n' "${FAILED_REPORT_OUTPUT}" >&2
    fi
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
init_args+=(--timeout-cleanup-receipt-sha256 "${TIMEOUT_CLEANUP_RECEIPT_SHA256}")
init_args+=(--aggregate-limit-evidence-sha256 "${AGGREGATE_LIMIT_EVIDENCE_SHA256}")
init_args+=(--runtime-policy-sha256 "${RUNTIME_POLICY_SHA256}")
init_args+=(--proof-dependency-manifest-sha256 "${PROOF_DEPENDENCY_MANIFEST_SHA256}")
init_args+=(--generation-isolation-evidence-sha256 "${GENERATION_ISOLATION_EVIDENCE_SHA256}")
init_args+=(--generation-isolation-probe-sha256 "${GENERATION_ISOLATION_PROBE_SHA256}")
init_args+=(--generation-isolation-verified-at "${GENERATION_ISOLATION_VERIFIED_AT}")
init_args+=(--release-check-generation-isolation-evidence-sha256 "${RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256}")
init_args+=(--release-check-generation-isolation-probe-sha256 "${RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256}")
init_args+=(--release-check-generation-isolation-verified-at "${RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT}")
init_args+=(--worker-artifact-classification "${WORKER_ARTIFACT_CLASSIFICATION}")
init_args+=(--worker-artifact-manifest-sha256 "${WORKER_ARTIFACT_MANIFEST_SHA256}")
init_args+=(--worker-bundle-sha256 "${WORKER_BUNDLE_SHA256}")
init_args+=(--client-assets-sha256 "${CLIENT_ASSETS_SHA256}")
init_args+=(--client-asset-count "${CLIENT_ASSET_COUNT}")
init_args+=(--client-public-assets-sha256 "${CLIENT_PUBLIC_ASSETS_SHA256}")
init_args+=(--client-public-asset-count "${CLIENT_PUBLIC_ASSET_COUNT}")
init_args+=(--vite-version "${FROZEN_VITE_VERSION}")
init_args+=(--wrangler-version "${FROZEN_WRANGLER_VERSION}")
init_args+=(--deployment-receipt-sha256 "${DEPLOYMENT_RECEIPT_SHA256}")
python3 "${REPORT_HELPER}" "${init_args[@]}"
REPORT_INITIALIZED=1

printf '%-24s | %-13s | %s\n' "STAGE" "MODE" "STATUS"
printf '%-24s-+-%-13s-+-%s\n' "------------------------" "-------------" "------"

stage_started="$(timestamp)"
"${CURL_BIN}" --fail --silent --show-error \
  --proto '=https' --proto-redir '=https' --max-redirs 0 \
  --max-time 30 \
  "${BASE_URL}/ready" \
  >"${WORK_DIR}/ready.json"
python3 - "${WORK_DIR}/ready.json" "${WORKER_VERSION_ID}" "${WORKER_EVIDENCE_COMMIT}" "${RUNNER_SOURCE_COMMIT}" "${CONTAINER_IMAGE_DIGEST}" "${TIMEOUT_CLEANUP_RECEIPT_SHA256}" "${AGGREGATE_LIMIT_EVIDENCE_SHA256}" "${RUNTIME_POLICY_SHA256}" "${PROOF_DEPENDENCY_MANIFEST_SHA256}" "${WORKER_ARTIFACT_CLASSIFICATION}" "${WORKER_ARTIFACT_MANIFEST_SHA256}" "${WORKER_BUNDLE_SHA256}" "${CLIENT_ASSETS_SHA256}" "${CLIENT_ASSET_COUNT}" "${CLIENT_PUBLIC_ASSETS_SHA256}" "${CLIENT_PUBLIC_ASSET_COUNT}" "${FROZEN_VITE_VERSION}" "${FROZEN_WRANGLER_VERSION}" "${GENERATION_ISOLATION_EVIDENCE_SHA256}" "${GENERATION_ISOLATION_PROBE_SHA256}" "${RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256}" "${RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256}" "${RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT}" <<'PY'
import json
import pathlib
import sys
payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if set(payload) != {"status", "service", "checks", "maintenance", "release"}:
    raise SystemExit("public readiness response has unknown or missing fields")
if payload.get("status") != "ready":
    raise SystemExit("public readiness response is not ready")
if payload.get("service") != "counterlab-control-plane":
    raise SystemExit("public readiness service identity is invalid")
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
    "generationIsolationEvidenceSha256": sys.argv[19],
    "generationIsolationProbeSha256": sys.argv[20],
    "releaseCheckGenerationIsolationEvidenceSha256": sys.argv[21],
    "releaseCheckGenerationIsolationProbeSha256": sys.argv[22],
    "releaseCheckGenerationIsolationVerifiedAt": sys.argv[23],
    "timeoutCleanupReceiptSha256": sys.argv[6],
    "aggregateLimitEvidenceSha256": sys.argv[7],
    "runtimePolicySha256": sys.argv[8],
    "proofDependencyManifestSha256": sys.argv[9],
    "workerArtifactClassification": sys.argv[10],
    "workerArtifactManifestSha256": sys.argv[11],
    "workerBundleSha256": sys.argv[12],
    "clientAssetsSha256": sys.argv[13],
    "clientAssetCount": int(sys.argv[14]),
    "clientPublicAssetsSha256": sys.argv[15],
    "clientPublicAssetCount": int(sys.argv[16]),
    "viteVersion": sys.argv[17],
    "wranglerVersion": sys.argv[18],
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
"${CURL_BIN}" --fail --silent --show-error \
  --proto '=https' --proto-redir '=https' --max-redirs 0 \
  --max-time 30 \
  "${BASE_URL}/api/health?readiness=probe" \
  >"${WORK_DIR}/health.json"
python3 - "${WORK_DIR}/health.json" "${WORKER_VERSION_ID}" "${WORKER_EVIDENCE_COMMIT}" "${RUNNER_SOURCE_COMMIT}" "${CONTAINER_IMAGE_DIGEST}" "${TIMEOUT_CLEANUP_RECEIPT_SHA256}" "${AGGREGATE_LIMIT_EVIDENCE_SHA256}" "${RUNTIME_POLICY_SHA256}" "${PROOF_DEPENDENCY_MANIFEST_SHA256}" "${WORKER_ARTIFACT_CLASSIFICATION}" "${WORKER_ARTIFACT_MANIFEST_SHA256}" "${WORKER_BUNDLE_SHA256}" "${CLIENT_ASSETS_SHA256}" "${CLIENT_ASSET_COUNT}" "${CLIENT_PUBLIC_ASSETS_SHA256}" "${CLIENT_PUBLIC_ASSET_COUNT}" "${FROZEN_VITE_VERSION}" "${FROZEN_WRANGLER_VERSION}" "${GENERATION_ISOLATION_EVIDENCE_SHA256}" "${GENERATION_ISOLATION_PROBE_SHA256}" "${RELEASE_CHECK_GENERATION_ISOLATION_EVIDENCE_SHA256}" "${RELEASE_CHECK_GENERATION_ISOLATION_PROBE_SHA256}" "${RELEASE_CHECK_GENERATION_ISOLATION_VERIFIED_AT}" <<'PY'
import json
import pathlib
import sys

payload = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if set(payload) != {"ok", "data"} or payload.get("ok") is not True:
    raise SystemExit("health response is not a success envelope")
health = payload.get("data", {})
expected_health_fields = {
    "platform",
    "sample",
    "replay",
    "liveGpt",
    "liveCodex",
    "liveKernel",
    "maintenance",
    "readiness",
    "release",
    "sandbox",
    "generationFilesystemReadIsolation",
    "requestId",
}
if not isinstance(health, dict) or set(health) != expected_health_fields:
    raise SystemExit("health data has unknown or missing fields")
if not isinstance(health.get("requestId"), str) or not health["requestId"]:
    raise SystemExit("health request ID is unavailable")
required = {
    "platform": "cloudflare-workers",
    "sample": "available",
    "replay": "available",
    "liveGpt": "configured",
    "liveCodex": "configured",
    "liveKernel": "configured",
    "sandbox": "credential-and-privilege-boundary",
    "generationFilesystemReadIsolation": "OS_ENFORCED",
}
for key, expected in required.items():
    if health.get(key) != expected:
        raise SystemExit(
            f"production capability {key} is {health.get(key)!r}; expected {expected!r}"
        )
if health.get("maintenance") is not False:
    raise SystemExit("production health reports maintenance mode")
if health.get("readiness") != "ready":
    raise SystemExit("production health deep readiness probe did not pass")
expected_release = {
    "status": "bound",
    "workerVersionId": sys.argv[2],
    "workerVersionTag": f"git-{sys.argv[3]}",
    "workerEvidenceCommit": sys.argv[3],
    "runnerSourceCommit": sys.argv[4],
    "runnerImageDigest": sys.argv[5],
    "generationIsolationEvidenceSha256": sys.argv[19],
    "generationIsolationProbeSha256": sys.argv[20],
    "releaseCheckGenerationIsolationEvidenceSha256": sys.argv[21],
    "releaseCheckGenerationIsolationProbeSha256": sys.argv[22],
    "releaseCheckGenerationIsolationVerifiedAt": sys.argv[23],
    "timeoutCleanupReceiptSha256": sys.argv[6],
    "aggregateLimitEvidenceSha256": sys.argv[7],
    "runtimePolicySha256": sys.argv[8],
    "proofDependencyManifestSha256": sys.argv[9],
    "workerArtifactClassification": sys.argv[10],
    "workerArtifactManifestSha256": sys.argv[11],
    "workerBundleSha256": sys.argv[12],
    "clientAssetsSha256": sys.argv[13],
    "clientAssetCount": int(sys.argv[14]),
    "clientPublicAssetsSha256": sys.argv[15],
    "clientPublicAssetCount": int(sys.argv[16]),
    "viteVersion": sys.argv[17],
    "wranglerVersion": sys.argv[18],
}
if health.get("release") != expected_release:
    raise SystemExit("production health release identity does not match the receipt")
PY
record_stage \
  "capability-health" "control_plane" "PASSED" "${stage_started}" "$(timestamp)" "" \
  "{\"responseSha256\":\"$(sha256_file "${WORK_DIR}/health.json")\"}"

cd "${ROOT_DIR}"

BROWSER_RUNTIME_PARENT="${ROOT_DIR}/apps/web/test-results/runtime/production-${SMOKE_RUN_ID}"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" "${BROWSER_RUNTIME_PARENT}"
mkdir -p "${BROWSER_RUNTIME_PARENT}"
node "${ROOT_DIR}/scripts/assert-contained-path.mjs" "${BROWSER_RUNTIME_PARENT}"

stage_started="$(timestamp)"
PUBLIC_ASSET_RUNTIME_ROOT="${BROWSER_RUNTIME_PARENT}/public-assets"
PUBLIC_ASSET_EVIDENCE="${PUBLIC_ASSET_RUNTIME_ROOT}/evidence/public-assets.json"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_RUNTIME_ROOT="${PUBLIC_ASSET_RUNTIME_ROOT}" \
COUNTERLAB_E2E_PUBLIC_ASSET_SCAN=1 \
COUNTERLAB_E2E_PUBLIC_ASSET_EVIDENCE_PATH="${PUBLIC_ASSET_EVIDENCE}" \
COUNTERLAB_E2E_FROZEN_WORKER_MANIFEST_PATH="${FROZEN_WORKER_MANIFEST}" \
COUNTERLAB_E2E_WORKER_ARTIFACT_MANIFEST_SHA256="${WORKER_ARTIFACT_MANIFEST_SHA256}" \
COUNTERLAB_E2E_CLIENT_ASSETS_SHA256="${CLIENT_ASSETS_SHA256}" \
COUNTERLAB_E2E_CLIENT_ASSET_COUNT="${CLIENT_ASSET_COUNT}" \
COUNTERLAB_E2E_CLIENT_PUBLIC_ASSETS_SHA256="${CLIENT_PUBLIC_ASSETS_SHA256}" \
COUNTERLAB_E2E_CLIENT_PUBLIC_ASSET_COUNT="${CLIENT_PUBLIC_ASSET_COUNT}" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Loaded public release routes and assets retain security headers and contain no secrets"
record_stage \
  "public-secret-scan" "control_plane" "PASSED" "${stage_started}" "$(timestamp)" "" \
  "{\"evidenceSha256\":\"$(sha256_file "${PUBLIC_ASSET_EVIDENCE}")\"}"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_RUNTIME_ROOT="${BROWSER_RUNTIME_PARENT}/judge" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Judge Mode distinguishes every authority path"
record_stage "judge-mode" "control_plane" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_RUNTIME_ROOT="${BROWSER_RUNTIME_PARENT}/sample" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Try Instantly persists"
record_stage "sample-lesson" "sample" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_RUNTIME_ROOT="${BROWSER_RUNTIME_PARENT}/replay" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "Replay remains visibly labelled"
record_stage "verified-replay" "replay" "PASSED" "${stage_started}" "$(timestamp)"

stage_started="$(timestamp)"
LEAKAGE_RUNTIME_ROOT="${BROWSER_RUNTIME_PARENT}/live-leakage"
LEAKAGE_EVIDENCE="${LEAKAGE_RUNTIME_ROOT}/evidence/live-leakage.json"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_RUNTIME_ROOT="${LEAKAGE_RUNTIME_ROOT}" \
COUNTERLAB_E2E_LIVE=1 \
COUNTERLAB_E2E_EVIDENCE_PATH="${LEAKAGE_EVIDENCE}" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes an untouched leakage notebook"
leakage_evidence="$(live_evidence "${LEAKAGE_EVIDENCE}" "entity_leakage")"
record_stage \
  "live-leakage" "live_notebook" "PASSED" "${stage_started}" "$(timestamp)" \
  "entity_leakage" "${leakage_evidence}"
record_stage \
  "hosted-capsule-replay" "replay" "PASSED" "${stage_started}" "$(timestamp)" \
  "entity_leakage" "${leakage_evidence}"

stage_started="$(timestamp)"
IMBALANCE_RUNTIME_ROOT="${BROWSER_RUNTIME_PARENT}/live-imbalance"
IMBALANCE_EVIDENCE="${IMBALANCE_RUNTIME_ROOT}/evidence/live-imbalance.json"
COUNTERLAB_E2E_BASE_URL="${BASE_URL}" \
COUNTERLAB_E2E_RUNTIME_ROOT="${IMBALANCE_RUNTIME_ROOT}" \
COUNTERLAB_E2E_LIVE=1 \
COUNTERLAB_E2E_EVIDENCE_PATH="${IMBALANCE_EVIDENCE}" \
  "${PNPM}" --filter @counterlab/web exec playwright test \
  --config playwright.config.ts \
  --grep "configured hosted runner completes an untouched class-imbalance notebook"
record_stage \
  "live-imbalance" "live_notebook" "PASSED" "${stage_started}" "$(timestamp)" \
  "class_imbalance" "$(live_evidence "${IMBALANCE_EVIDENCE}" "class_imbalance")"

python3 "${REPORT_HELPER}" finish "${REPORT_PATH}" \
  --status PASSED --completed-at "$(timestamp)"
SMOKE_STATUS="PASSED"

echo "Production smoke: PASS"
echo "Production smoke report: ${REPORT_PATH}"
