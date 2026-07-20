#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
RECEIPT="${COUNTERLAB_QUALIFIED_RUNNER_RECEIPT:-}"
RELEASE_CHECK_RECEIPT="${COUNTERLAB_RELEASE_CHECK_RECEIPT:-}"
IMAGE="${COUNTERLAB_QUALIFIED_RUNNER_IMAGE:-}"
RUNTIME_ADAPTER="${COUNTERLAB_DOCKER_BIN:-}"
WRANGLER="${ROOT_DIR}/node_modules/.bin/wrangler"
VITE="${ROOT_DIR}/node_modules/.bin/vite"
TSX="${ROOT_DIR}/node_modules/.bin/tsx"
PNPM="${ROOT_DIR}/scripts/run-contained-pnpm.sh"
PRODUCTION_SMOKE="${ROOT_DIR}/scripts/production-smoke.sh"
PRODUCTION_ORIGIN="https://counterlab.cserules.workers.dev"

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
      echo "Deployment paths must remain inside ${ROOT_DIR}: ${requested}" >&2
      return 2
      ;;
  esac
  case "/${candidate#${ROOT_DIR}/}/" in
    *"/../"*)
      echo "Deployment paths must not traverse parent directories: ${requested}" >&2
      return 2
      ;;
  esac
  resolved="$(realpath -m -- "${candidate}")"
  case "${resolved}" in
    "${ROOT_DIR}"|"${ROOT_DIR}"/*) printf '%s\n' "${resolved}" ;;
    *)
      echo "Deployment path resolves outside ${ROOT_DIR}: ${requested}" >&2
      return 2
      ;;
  esac
}

if [[ -z "${RECEIPT}" || -z "${RELEASE_CHECK_RECEIPT}" || -z "${IMAGE}" ]]; then
  echo "Qualified deployment requires all three evidence variables:" >&2
  echo "  COUNTERLAB_QUALIFIED_RUNNER_RECEIPT=node_modules/.cache/counterlab-v6.1/releases/qualified-runner.json" >&2
  echo "  COUNTERLAB_QUALIFIED_RUNNER_IMAGE=registry.cloudflare.com/<account>/counterlab-runner:git-<commit>" >&2
  echo "  COUNTERLAB_RELEASE_CHECK_RECEIPT=node_modules/.cache/counterlab-v6.1/releases/release-check-<commit>.json" >&2
  exit 2
fi

cd "${ROOT_DIR}"
RECEIPT="$(repo_path "${RECEIPT}")"
RELEASE_CHECK_RECEIPT="$(repo_path "${RELEASE_CHECK_RECEIPT}")"
CACHE_ROOT="$(repo_path "node_modules/.cache/counterlab-v6.1")"
node scripts/assert-contained-path.mjs \
  "${CACHE_ROOT}" "${CACHE_ROOT}/home" "${CACHE_ROOT}/tmp" \
  "${CACHE_ROOT}/xdg-cache" "${CACHE_ROOT}/xdg-config" "${CACHE_ROOT}/xdg-data" \
  "${CACHE_ROOT}/gitconfig"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export GIT_CONFIG_NOSYSTEM=1
export GIT_CONFIG_GLOBAL="${CACHE_ROOT}/gitconfig"
export CI=1
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"
node scripts/assert-contained-path.mjs \
  "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" \
  "${XDG_DATA_HOME}" "${GIT_CONFIG_GLOBAL}"
[[ "$(git rev-parse --show-toplevel)" == "${ROOT_DIR}" ]] || {
  echo "Qualified deployment requires the verified CounterLab Git root." >&2
  exit 2
}

CURL_BIN="$(command -v curl || true)"
[[ -n "${CURL_BIN}" ]] || {
  echo "Qualified deployment requires curl for bounded release health probes." >&2
  exit 2
}

[[ -x "${WRANGLER}" ]] || {
  echo "Pinned repository-contained Wrangler is unavailable." >&2
  exit 2
}
WRANGLER="$(realpath -e -- "${WRANGLER}")"
case "${WRANGLER}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "Wrangler resolves outside the repository." >&2; exit 2 ;;
esac
[[ -x "${VITE}" ]] || {
  echo "Pinned repository-contained Vite is unavailable." >&2
  exit 2
}
VITE="$(realpath -e -- "${VITE}")"
case "${VITE}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "Vite resolves outside the repository." >&2; exit 2 ;;
esac
[[ -x "${TSX}" ]] || {
  echo "Pinned repository-contained TypeScript runtime is unavailable." >&2
  exit 2
}
TSX="$(realpath -e -- "${TSX}")"
case "${TSX}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "TypeScript runtime resolves outside the repository." >&2; exit 2 ;;
esac
[[ -x "${PNPM}" && ! -L "${PNPM}" ]] || {
  echo "Pinned repository-contained pnpm launcher is unavailable." >&2
  exit 2
}
PNPM="$(realpath -e -- "${PNPM}")"
case "${PNPM}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "pnpm launcher resolves outside the repository." >&2; exit 2 ;;
esac
[[ -x "${PRODUCTION_SMOKE}" && ! -L "${PRODUCTION_SMOKE}" ]] || {
  echo "Repository-contained production smoke launcher is unavailable." >&2
  exit 2
}
PRODUCTION_SMOKE="$(realpath -e -- "${PRODUCTION_SMOKE}")"
case "${PRODUCTION_SMOKE}" in
  "${ROOT_DIR}"/*) ;;
  *) echo "Production smoke launcher resolves outside the repository." >&2; exit 2 ;;
esac
[[ -n "${RUNTIME_ADAPTER}" ]] || {
  echo "COUNTERLAB_DOCKER_BIN must name the repository-contained runtime adapter." >&2
  exit 2
}
RUNTIME_ADAPTER="$(repo_path "${RUNTIME_ADAPTER}")"
[[ -x "${RUNTIME_ADAPTER}" && ! -L "${RUNTIME_ADAPTER}" ]] || {
  echo "Repository-contained runtime adapter is unavailable." >&2
  exit 2
}
RUNTIME_ADAPTER="$(realpath -e -- "${RUNTIME_ADAPTER}")"
export COUNTERLAB_DOCKER_BIN="${RUNTIME_ADAPTER}"

OBSERVED_VITE_VERSION="$("${VITE}" --version)"
OBSERVED_WRANGLER_VERSION="$("${WRANGLER}" --version)"

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Qualified deployment requires a completely clean worktree, including untracked files." >&2
  exit 2
fi

[[ -f "${RECEIPT}" ]] || {
  echo "Qualified runner receipt not found: ${RECEIPT}" >&2
  exit 2
}
[[ -f "${RELEASE_CHECK_RECEIPT}" ]] || {
  echo "Release-check receipt not found: ${RELEASE_CHECK_RECEIPT}" >&2
  exit 2
}

RELEASE_IDENTITY_JSON="$(
  node --import tsx scripts/release-check-receipt.ts \
    identity \
    --qualified "${RECEIPT}"
)"
qualified_identity_value() {
  local field="$1"
  node -e '
const [raw, field] = process.argv.slice(1);
const identity = JSON.parse(raw);
const outerFields = ["identitySchemaVersion", "receipt", "receiptSha256", "receiptType"];
if (
  Object.keys(identity).sort().join("\n") !== outerFields.sort().join("\n") ||
  identity.identitySchemaVersion !== "1" ||
  identity.receiptType !== "qualified-runner-release" ||
  !/^[a-f0-9]{64}$/.test(identity.receiptSha256)
) throw new Error("qualified release identity envelope is invalid");
if (!Object.hasOwn(identity.receipt, field) || typeof identity.receipt[field] !== "string") {
  throw new Error(`qualified release identity field is unavailable: ${field}`);
}
process.stdout.write(identity.receipt[field]);
' "${RELEASE_IDENTITY_JSON}" "${field}"
}
EVIDENCE_COMMIT="$(qualified_identity_value evidenceCommit)"
SOURCE_COMMIT="$(qualified_identity_value sourceCommit)"
LOCAL_IMAGE="$(qualified_identity_value localImageTag)"
REGISTRY_DIGEST="$(qualified_identity_value registryDigest)"
TIMEOUT_CLEANUP_RECEIPT_SHA256="$(qualified_identity_value timeoutCleanupReceiptSha256)"
AGGREGATE_LIMIT_EVIDENCE_SHA256="$(qualified_identity_value aggregateLimitEvidenceSha256)"
RUNTIME_POLICY_SHA256="$(qualified_identity_value runtimePolicySha256)"
PROOF_DEPENDENCY_MANIFEST_SHA256="$(qualified_identity_value proofDependencyManifestSha256)"
QUALIFIED_RECEIPT_SHA256="$(
  node -e '
const identity = JSON.parse(process.argv[1]);
if (identity?.identitySchemaVersion !== "1" || !/^[a-f0-9]{64}$/.test(identity?.receiptSha256)) {
  throw new Error("qualified receipt byte hash is unavailable");
}
process.stdout.write(identity.receiptSha256);
' "${RELEASE_IDENTITY_JSON}"
)"
[[ "$(sha256sum "${RECEIPT}" | cut -d ' ' -f 1)" == "${QUALIFIED_RECEIPT_SHA256}" ]] || {
  echo "Qualified receipt bytes changed after identity validation." >&2
  exit 2
}
RELEASE_CHECK_RECEIPT_SHA256="$(sha256sum "${RELEASE_CHECK_RECEIPT}" | cut -d ' ' -f 1)"
CONTAINER_APPLICATION_NAME="counterlab-counterlabrunner"
QUALIFIED_CONTAINER_IMAGE="${IMAGE%:git-*}@${REGISTRY_DIGEST}"
WORKER_TAG="git-${EVIDENCE_COMMIT}"

[[ "$(git rev-parse HEAD)" == "${EVIDENCE_COMMIT}" ]] || {
  echo "The qualified evidence commit must equal the deployment HEAD." >&2
  exit 2
}

RELEASE_ID="${EVIDENCE_COMMIT}-runner-${SOURCE_COMMIT:0:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
RELEASE_DIR="$(repo_path "node_modules/.cache/counterlab-v6.1/releases/worker-${RELEASE_ID}")"
RELEASE_CONFIG="$(repo_path "apps/web/dist/counterlab/wrangler.release-${RELEASE_ID}.json")"
MAINTENANCE_CONFIG="$(repo_path "apps/web/dist/counterlab/wrangler.maintenance-${RELEASE_ID}.json")"
RECOVERY_CONFIG="${RELEASE_DIR}/wrangler.recovery.json"
DRY_RUN_DIR="${RELEASE_DIR}/dry-run"
WORKER_BUNDLE="$(repo_path "apps/web/dist/counterlab/index.js")"
CLIENT_DIR="$(repo_path "apps/web/dist/client")"
WORKER_ARTIFACT_MANIFEST="${RELEASE_DIR}/frozen-worker-release.json"
mkdir -p "${RELEASE_DIR}"

./scripts/verify-scientific-engines.sh --image "${LOCAL_IMAGE}"

"${PNPM}" --filter @counterlab/web build
[[ -f "apps/web/dist/client/_headers" ]] || {
  echo "The production build did not include the static security headers." >&2
  exit 2
}
[[ "$(sha256sum apps/web/public/_headers | cut -d ' ' -f 1)" == "$(sha256sum apps/web/dist/client/_headers | cut -d ' ' -f 1)" ]] || {
  echo "Built static security headers differ from the reviewed source." >&2
  exit 2
}

PYTHONDONTWRITEBYTECODE=1 .venv/bin/python scripts/secret-scan.py \
  "${WORKER_BUNDLE}" "${CLIENT_DIR}"

node --import tsx scripts/frozen-worker-release.ts create \
  --source-commit "${EVIDENCE_COMMIT}" \
  --worker-bundle "${WORKER_BUNDLE}" \
  --client-dir "${CLIENT_DIR}" \
  --vite-version "${OBSERVED_VITE_VERSION}" \
  --wrangler-version "${OBSERVED_WRANGLER_VERSION}" \
  --output "${WORKER_ARTIFACT_MANIFEST}"
WORKER_ARTIFACT_IDENTITY_JSON="$(
  node --import tsx scripts/frozen-worker-release.ts identity \
    --manifest "${WORKER_ARTIFACT_MANIFEST}"
)"
frozen_worker_identity_value() {
  local field="$1"
  node -e '
const [raw, field] = process.argv.slice(1);
const identity = JSON.parse(raw);
const fields = [
  "classification",
  "clientAssetCount",
  "clientAssetsSha256",
  "clientPublicAssetCount",
  "clientPublicAssetsSha256",
  "manifestSha256",
  "schemaVersion",
  "sourceCommit",
  "viteVersion",
  "workerBundleSha256",
  "wranglerVersion",
];
if (Object.keys(identity).sort().join("\n") !== fields.sort().join("\n") || identity.schemaVersion !== "1" || identity.classification !== "PROCESS_BOUND_PARTIAL") {
  throw new Error("frozen Worker identity envelope is invalid");
}
if (!Object.hasOwn(identity, field)) {
  throw new Error(`frozen Worker identity field is unavailable: ${field}`);
}
const value = identity[field];
if (
  !(typeof value === "string" && value.length > 0) &&
  !(Number.isSafeInteger(value) && value > 0)
) {
  throw new Error(`frozen Worker identity field is invalid: ${field}`);
}
process.stdout.write(String(value));
' "${WORKER_ARTIFACT_IDENTITY_JSON}" "${field}"
}
WORKER_ARTIFACT_CLASSIFICATION="$(frozen_worker_identity_value classification)"
WORKER_ARTIFACT_MANIFEST_SHA256="$(frozen_worker_identity_value manifestSha256)"
WORKER_BUNDLE_SHA256="$(frozen_worker_identity_value workerBundleSha256)"
CLIENT_ASSETS_SHA256="$(frozen_worker_identity_value clientAssetsSha256)"
CLIENT_ASSET_COUNT="$(frozen_worker_identity_value clientAssetCount)"
CLIENT_PUBLIC_ASSETS_SHA256="$(frozen_worker_identity_value clientPublicAssetsSha256)"
CLIENT_PUBLIC_ASSET_COUNT="$(frozen_worker_identity_value clientPublicAssetCount)"
FROZEN_VITE_VERSION="$(frozen_worker_identity_value viteVersion)"
FROZEN_WRANGLER_VERSION="$(frozen_worker_identity_value wranglerVersion)"

"${TSX}" scripts/prepare-qualified-deploy.ts \
  --config apps/web/dist/counterlab/wrangler.json \
  --receipt "${RECEIPT}" \
  --release-check-receipt "${RELEASE_CHECK_RECEIPT}" \
  --worker-artifact-manifest "${WORKER_ARTIFACT_MANIFEST}" \
  --image "${IMAGE}" \
  --output "${RELEASE_CONFIG}"

node - "${RELEASE_CONFIG}" "${MAINTENANCE_CONFIG}" "${RECOVERY_CONFIG}" <<'NODE'
const fs = require("node:fs");
const [sourcePath, outputPath, recoveryPath] = process.argv.slice(2);
const config = JSON.parse(fs.readFileSync(sourcePath, "utf8"));
if (config.vars?.COUNTERLAB_MAINTENANCE_MODE !== "false") {
  throw new Error("final release config does not explicitly disable maintenance mode");
}
config.vars = { ...config.vars, COUNTERLAB_MAINTENANCE_MODE: "true" };
fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
  encoding: "utf8",
  flag: "wx",
  mode: 0o600,
});
fs.copyFileSync(sourcePath, recoveryPath, fs.constants.COPYFILE_EXCL);
NODE

RELEASE_CONFIG_SHA256="$(sha256sum "${RELEASE_CONFIG}" | cut -d ' ' -f 1)"
MAINTENANCE_CONFIG_SHA256="$(sha256sum "${MAINTENANCE_CONFIG}" | cut -d ' ' -f 1)"
RECOVERY_CONFIG_SHA256="$(sha256sum "${RECOVERY_CONFIG}" | cut -d ' ' -f 1)"
assert_frozen_worker_release() {
  [[ "$(git rev-parse HEAD)" == "${EVIDENCE_COMMIT}" ]] || {
    echo "The deployment HEAD changed after qualification." >&2
    return 2
  }
  [[ -z "$(git status --porcelain=v1 --untracked-files=all)" ]] || {
    echo "The deployment worktree changed after qualification." >&2
    return 2
  }
  [[ "$(sha256sum "${RECEIPT}" | cut -d ' ' -f 1)" == "${QUALIFIED_RECEIPT_SHA256}" ]] || {
    echo "The qualified runner receipt changed." >&2
    return 2
  }
  [[ "$(sha256sum "${RELEASE_CHECK_RECEIPT}" | cut -d ' ' -f 1)" == "${RELEASE_CHECK_RECEIPT_SHA256}" ]] || {
    echo "The release-check receipt changed." >&2
    return 2
  }
  [[ "$(sha256sum "${WORKER_ARTIFACT_MANIFEST}" | cut -d ' ' -f 1)" == "${WORKER_ARTIFACT_MANIFEST_SHA256}" ]] || {
    echo "The frozen Worker manifest bytes changed." >&2
    return 2
  }
  [[ "$("${VITE}" --version)" == "${OBSERVED_VITE_VERSION}" && "${FROZEN_VITE_VERSION}" == "8.1.4" ]] || {
    echo "The frozen Vite toolchain changed." >&2
    return 2
  }
  [[ "$("${WRANGLER}" --version)" == "${OBSERVED_WRANGLER_VERSION}" && "${FROZEN_WRANGLER_VERSION}" == "4.110.0" ]] || {
    echo "The frozen Wrangler toolchain changed." >&2
    return 2
  }
  node --import tsx scripts/frozen-worker-release.ts verify \
    --manifest "${WORKER_ARTIFACT_MANIFEST}"
  [[ "$(sha256sum "${RELEASE_CONFIG}" | cut -d ' ' -f 1)" == "${RELEASE_CONFIG_SHA256}" ]] || {
    echo "The frozen release Wrangler config changed." >&2
    return 2
  }
  [[ "$(sha256sum "${MAINTENANCE_CONFIG}" | cut -d ' ' -f 1)" == "${MAINTENANCE_CONFIG_SHA256}" ]] || {
    echo "The frozen maintenance Wrangler config changed." >&2
    return 2
  }
  [[ "$(sha256sum "${RECOVERY_CONFIG}" | cut -d ' ' -f 1)" == "${RECOVERY_CONFIG_SHA256}" ]] || {
    echo "The preserved recovery Wrangler config changed." >&2
    return 2
  }
}

query_legacy_replay_count() {
  local output_path="$1"
  "${WRANGLER}" d1 execute DB \
    --remote \
    --config "${RELEASE_CONFIG}" \
    --command "SELECT COUNT(*) AS existing_replay_count FROM replays" \
    --json >"${output_path}"
  node - "${output_path}" <<'NODE'
const fs = require("node:fs");
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const groups = Array.isArray(payload) ? payload : [payload];
const counts = groups
  .flatMap((group) =>
    Array.isArray(group?.results)
      ? group.results.map((row) => row?.existing_replay_count)
      : [],
  )
  .filter((value) => Number.isInteger(value) && value >= 0);
if (counts.length !== 1) {
  throw new Error("D1 did not return one existing replay count");
}
process.stdout.write(String(counts[0]));
NODE
}

FINAL_READINESS_RUN=0

wait_for_maintenance_health() {
  local candidate=""
  local expected_version="${MAINTENANCE_VERSION_ID:-}"
  [[ "${expected_version}" =~ ^[a-f0-9-]{36}$ ]] || {
    echo "The exact maintenance Worker version is unavailable." >&2
    return 1
  }
  for attempt in $(seq 1 24); do
    candidate="${RELEASE_DIR}/maintenance-health-${attempt}.json"
    if "${CURL_BIN}" --silent --show-error --fail-with-body \
      --connect-timeout 10 --max-time 20 \
      --output "${candidate}" "${PRODUCTION_ORIGIN}/api/health" &&
      node - "${candidate}" "${EVIDENCE_COMMIT}" "${SOURCE_COMMIT}" "${REGISTRY_DIGEST}" "${TIMEOUT_CLEANUP_RECEIPT_SHA256}" "${AGGREGATE_LIMIT_EVIDENCE_SHA256}" "${RUNTIME_POLICY_SHA256}" "${PROOF_DEPENDENCY_MANIFEST_SHA256}" "${WORKER_ARTIFACT_CLASSIFICATION}" "${WORKER_ARTIFACT_MANIFEST_SHA256}" "${WORKER_BUNDLE_SHA256}" "${CLIENT_ASSETS_SHA256}" "${CLIENT_ASSET_COUNT}" "${CLIENT_PUBLIC_ASSETS_SHA256}" "${CLIENT_PUBLIC_ASSET_COUNT}" "${FROZEN_VITE_VERSION}" "${FROZEN_WRANGLER_VERSION}" "${expected_version}" <<'NODE'
const fs = require("node:fs");
const [path, evidenceCommit, sourceCommit, digest, timeoutReceipt, aggregateEvidence, runtimePolicy, proofManifest, artifactClassification, artifactManifest, workerBundle, clientAssets, clientAssetCount, publicAssets, publicAssetCount, viteVersion, wranglerVersion, expectedVersion] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(path, "utf8"));
const data = payload?.ok === true ? payload.data : undefined;
if (
  data?.maintenance !== true ||
  data?.release?.status !== "bound" ||
  data.release.workerVersionId !== expectedVersion ||
  data.release.workerEvidenceCommit !== evidenceCommit ||
  data.release.runnerSourceCommit !== sourceCommit ||
  data.release.runnerImageDigest !== digest ||
  data.release.timeoutCleanupReceiptSha256 !== timeoutReceipt ||
  data.release.aggregateLimitEvidenceSha256 !== aggregateEvidence ||
  data.release.runtimePolicySha256 !== runtimePolicy ||
  data.release.proofDependencyManifestSha256 !== proofManifest ||
  data.release.workerArtifactClassification !== artifactClassification ||
  data.release.workerArtifactManifestSha256 !== artifactManifest ||
  data.release.workerBundleSha256 !== workerBundle ||
  data.release.clientAssetsSha256 !== clientAssets ||
  data.release.clientAssetCount !== Number(clientAssetCount) ||
  data.release.clientPublicAssetsSha256 !== publicAssets ||
  data.release.clientPublicAssetCount !== Number(publicAssetCount) ||
  data.release.viteVersion !== viteVersion ||
  data.release.wranglerVersion !== wranglerVersion
) process.exit(1);
NODE
    then
      return 0
    fi
    echo "Waiting for the exact maintenance Worker identity (${attempt}/24)."
    sleep 5
  done
  echo "The exact maintenance Worker did not become observable." >&2
  return 1
}

wait_for_final_readiness() {
  local candidate=""
  local expected_version="${DEPLOYED_VERSION_ID:-}"
  FINAL_READINESS_RUN=$((FINAL_READINESS_RUN + 1))
  [[ "${expected_version}" =~ ^[a-f0-9-]{36}$ ]] || {
    echo "The exact final Worker version is unavailable." >&2
    return 1
  }
  for attempt in $(seq 1 24); do
    candidate="${RELEASE_DIR}/final-readiness-${FINAL_READINESS_RUN}-${attempt}.json"
    if "${CURL_BIN}" --silent --show-error --fail-with-body \
      --connect-timeout 10 --max-time 20 \
      --output "${candidate}" "${PRODUCTION_ORIGIN}/ready" &&
      node - "${candidate}" "${EVIDENCE_COMMIT}" "${SOURCE_COMMIT}" "${REGISTRY_DIGEST}" "${TIMEOUT_CLEANUP_RECEIPT_SHA256}" "${AGGREGATE_LIMIT_EVIDENCE_SHA256}" "${RUNTIME_POLICY_SHA256}" "${PROOF_DEPENDENCY_MANIFEST_SHA256}" "${WORKER_ARTIFACT_CLASSIFICATION}" "${WORKER_ARTIFACT_MANIFEST_SHA256}" "${WORKER_BUNDLE_SHA256}" "${CLIENT_ASSETS_SHA256}" "${CLIENT_ASSET_COUNT}" "${CLIENT_PUBLIC_ASSETS_SHA256}" "${CLIENT_PUBLIC_ASSET_COUNT}" "${FROZEN_VITE_VERSION}" "${FROZEN_WRANGLER_VERSION}" "${expected_version}" <<'NODE'
const fs = require("node:fs");
const [path, evidenceCommit, sourceCommit, digest, timeoutReceipt, aggregateEvidence, runtimePolicy, proofManifest, artifactClassification, artifactManifest, workerBundle, clientAssets, clientAssetCount, publicAssets, publicAssetCount, viteVersion, wranglerVersion, expectedVersion] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(path, "utf8"));
if (
  payload?.status !== "ready" ||
  payload?.maintenance !== false ||
  payload?.release?.status !== "bound" ||
  payload.release.workerVersionId !== expectedVersion ||
  payload.release.workerEvidenceCommit !== evidenceCommit ||
  payload.release.runnerSourceCommit !== sourceCommit ||
  payload.release.runnerImageDigest !== digest ||
  payload.release.timeoutCleanupReceiptSha256 !== timeoutReceipt ||
  payload.release.aggregateLimitEvidenceSha256 !== aggregateEvidence ||
  payload.release.runtimePolicySha256 !== runtimePolicy ||
  payload.release.proofDependencyManifestSha256 !== proofManifest ||
  payload.release.workerArtifactClassification !== artifactClassification ||
  payload.release.workerArtifactManifestSha256 !== artifactManifest ||
  payload.release.workerBundleSha256 !== workerBundle ||
  payload.release.clientAssetsSha256 !== clientAssets ||
  payload.release.clientAssetCount !== Number(clientAssetCount) ||
  payload.release.clientPublicAssetsSha256 !== publicAssets ||
  payload.release.clientPublicAssetCount !== Number(publicAssetCount) ||
  payload.release.viteVersion !== viteVersion ||
  payload.release.wranglerVersion !== wranglerVersion
) process.exit(1);
NODE
    then
      return 0
    fi
    echo "Waiting for exact final Worker readiness (${attempt}/24)."
    sleep 5
  done
  echo "The exact final Worker did not become ready." >&2
  return 1
}

extract_worker_version_id() {
  local deploy_log="$1"
  node - "${deploy_log}" <<'NODE'
const fs = require("node:fs");
const output = fs.readFileSync(process.argv[2], "utf8");
const matches = [...output.matchAll(/(?:Current|Worker) Version ID:\s*([a-f0-9-]{36})/g)];
if (matches.length !== 1) throw new Error("Wrangler did not return exactly one Worker version ID");
process.stdout.write(matches[0][1]);
NODE
}

capture_active_worker() {
  local expected_version="$1"
  local output_path="$2"
  local config_path="${3:-${RELEASE_CONFIG}}"
  for attempt in $(seq 1 24); do
    if "${WRANGLER}" deployments status \
      --config "${config_path}" \
      --json >"${output_path}" &&
      node - "${output_path}" "${expected_version}" <<'NODE'
const fs = require("node:fs");
const [path, expectedVersion] = process.argv.slice(2);
const status = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(status.versions) || status.versions.length !== 1) {
  throw new Error("deployment status must expose one active Worker version");
}
const active = status.versions[0];
if (active?.percentage !== 100 || active.version_id !== expectedVersion) {
  throw new Error("the expected Worker version does not own 100 percent traffic");
}
NODE
    then
      return 0
    fi
    echo "Waiting for exact Worker ${expected_version} to own all traffic (${attempt}/24)."
    sleep 5
  done
  echo "The exact Worker ${expected_version} did not reach 100 percent traffic." >&2
  return 1
}

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Release verification changed the tracked or untracked worktree." >&2
  exit 2
fi

assert_frozen_worker_release
"${WRANGLER}" deploy \
  "${WORKER_BUNDLE}" \
  --config "${RELEASE_CONFIG}" \
  --dry-run \
  --no-bundle \
  --strict \
  --containers-rollout none \
  --outdir "${DRY_RUN_DIR}"

[[ -f "${DRY_RUN_DIR}/index.js" ]] || {
  echo "Wrangler dry-run did not emit the frozen Worker bundle." >&2
  exit 2
}
[[ "$(sha256sum "${DRY_RUN_DIR}/index.js" | cut -d ' ' -f 1)" == "$(sha256sum "${WORKER_BUNDLE}" | cut -d ' ' -f 1)" ]] || {
  echo "Wrangler dry-run changed the frozen Worker bytes." >&2
  exit 2
}
assert_frozen_worker_release
DRY_RUN_PROJECTION_JSON="$(
  node --import tsx scripts/frozen-worker-release.ts verify-dry-run \
    --manifest "${WORKER_ARTIFACT_MANIFEST}" \
    --dry-run-dir "${DRY_RUN_DIR}"
)"

authenticated_cloudflare_account() {
  "${WRANGLER}" whoami --json |
    "${TSX}" scripts/cloudflare-account-identity.ts \
      --config "${RELEASE_CONFIG}"
}
AUTHENTICATED_CLOUDFLARE_ACCOUNT_ID="$(authenticated_cloudflare_account)"
[[ "${AUTHENTICATED_CLOUDFLARE_ACCOUNT_ID}" =~ ^[a-f0-9]{32}$ ]] || {
  echo "The authenticated Cloudflare account identity is invalid." >&2
  exit 2
}

assert_release_authority() {
  local dry_run_projection=""
  local authenticated_account=""
  assert_frozen_worker_release
  dry_run_projection="$(
    node --import tsx scripts/frozen-worker-release.ts verify-dry-run \
      --manifest "${WORKER_ARTIFACT_MANIFEST}" \
      --dry-run-dir "${DRY_RUN_DIR}"
  )"
  [[ "${dry_run_projection}" == "${DRY_RUN_PROJECTION_JSON}" ]] || {
    echo "The strict Wrangler dry-run projection changed." >&2
    return 2
  }
  authenticated_account="$(authenticated_cloudflare_account)"
  [[ "${authenticated_account}" == "${AUTHENTICATED_CLOUDFLARE_ACCOUNT_ID}" ]] || {
    echo "The authenticated Cloudflare account changed." >&2
    return 2
  }
}

"${WRANGLER}" secret list \
  --config "${RELEASE_CONFIG}" \
  --format json >"${RELEASE_DIR}/secret-names.json"
node - "${RELEASE_DIR}/secret-names.json" <<'NODE'
const fs = require("node:fs");
const values = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(values)) throw new Error("Wrangler secret list is invalid");
const names = new Set(values.map((entry) => entry?.name));
const required = [
  "CODEX_AUTH_JSON",
  "COUNTERLAB_ADMISSION_KEY",
  "COUNTERLAB_RUNNER_SIGNING_PRIVATE_KEY",
  "COUNTERLAB_SIGNING_KEY",
  "OPENAI_API_KEY",
];
const missing = required.filter((name) => !names.has(name));
if (missing.length > 0) {
  throw new Error(`required Worker secret names are missing: ${missing.join(", ")}`);
}
NODE

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "The worktree changed before the migration freeze." >&2
  exit 2
fi

PREVIOUS_DEPLOYMENT_STATUS="${RELEASE_DIR}/previous-deployment-status.json"
"${WRANGLER}" deployments status \
  --config "${RELEASE_CONFIG}" \
  --json >"${PREVIOUS_DEPLOYMENT_STATUS}"
PREVIOUS_VERSION_ID="$(node - "${PREVIOUS_DEPLOYMENT_STATUS}" <<'NODE'
const fs = require("node:fs");
const status = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!Array.isArray(status.versions) || status.versions.length !== 1) {
  throw new Error("recovery requires one currently active Worker version");
}
const active = status.versions[0];
if (
  active?.percentage !== 100 ||
  typeof active.version_id !== "string" ||
  !/^[a-f0-9-]{36}$/.test(active.version_id)
) {
  throw new Error("recovery requires one exact Worker version at 100 percent traffic");
}
process.stdout.write(active.version_id);
NODE
)"

PREVIOUS_CONTAINER_STATUS="${RELEASE_DIR}/previous-container-status.json"
"${WRANGLER}" containers list \
  --per-page 100 \
  --json \
  --config "${RELEASE_CONFIG}" >"${PREVIOUS_CONTAINER_STATUS}"
readarray -t PREVIOUS_CONTAINER_IDENTITY < <(
  node - "${PREVIOUS_CONTAINER_STATUS}" "${CONTAINER_APPLICATION_NAME}" <<'NODE'
const fs = require("node:fs");
const [path, expectedName] = process.argv.slice(2);
const applications = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(applications)) {
  throw new Error("previous Container status is invalid");
}
const matches = applications.filter((application) => application?.name === expectedName);
if (matches.length !== 1) {
  throw new Error("recovery requires one exact prior Container application");
}
const application = matches[0];
const version = String(application.version ?? "");
if (
  typeof application.id !== "string" ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(application.id) ||
  typeof application.image !== "string" ||
  application.image.length === 0 ||
  !/^[1-9][0-9]*$/.test(version) ||
  !["active", "ready"].includes(application.state)
) {
  throw new Error("prior Container application is not recovery-observable");
}
for (const value of [application.id, version, application.image, application.state]) {
  process.stdout.write(`${value}\n`);
}
NODE
)
[[ "${#PREVIOUS_CONTAINER_IDENTITY[@]}" -eq 4 ]] || {
  echo "Prior Container recovery identity is incomplete." >&2
  exit 2
}
PREVIOUS_CONTAINER_ID="${PREVIOUS_CONTAINER_IDENTITY[0]}"
PREVIOUS_CONTAINER_VERSION="${PREVIOUS_CONTAINER_IDENTITY[1]}"
PREVIOUS_CONTAINER_IMAGE="${PREVIOUS_CONTAINER_IDENTITY[2]}"

LEGACY_REPLAY_PREFLIGHT="${RELEASE_DIR}/legacy-replay-preflight.json"
LEGACY_REPLAY_COUNT="$(query_legacy_replay_count "${LEGACY_REPLAY_PREFLIGHT}")"
if [[ "${LEGACY_REPLAY_COUNT}" != "0" ]]; then
  echo "Deployment stopped before maintenance: ${LEGACY_REPLAY_COUNT} legacy public replay row(s) require an explicit share-safe projection migration." >&2
  exit 2
fi

RECOVERY_ARMED=0
MIGRATIONS_STARTED=0
CONTAINER_ROLLOUT_STARTED=0
MAINTENANCE_VERSION_ID=""
recover_previous_worker() {
  local original_status="$?"
  local recovery_target=""
  local recovery_mode=""
  local recovery_version=""
  local recovery_status=1
  trap - EXIT
  if [[ "${original_status}" -ne 0 && "${RECOVERY_ARMED}" -eq 1 ]]; then
    if ! recovery_target="$(
      "${TSX}" scripts/deployment-recovery-target.ts \
        --migrations-started "${MIGRATIONS_STARTED}" \
        --container-rollout-started "${CONTAINER_ROLLOUT_STARTED}" \
        --previous-version-id "${PREVIOUS_VERSION_ID}" \
        --maintenance-version-id "${MAINTENANCE_VERSION_ID}"
    )"; then
      echo "CRITICAL: no exact Worker recovery target is available." >&2
      echo "Prior Container evidence: id=${PREVIOUS_CONTAINER_ID}, version=${PREVIOUS_CONTAINER_VERSION}, image=${PREVIOUS_CONTAINER_IMAGE}." >&2
      exit "${original_status}"
    fi
    IFS=$'\t' read -r recovery_mode recovery_version <<<"${recovery_target}"
    if [[ "${recovery_mode}" == "maintenance" ]]; then
      echo "Qualified deployment failed after schema or Container mutation; restoring exact maintenance Worker ${recovery_version}." >&2
    else
      echo "Qualified deployment failed before Container rollout; restoring prior Worker ${recovery_version}." >&2
    fi

    set +e
    "${WRANGLER}" rollback "${recovery_version}" \
      --config "${RECOVERY_CONFIG}" \
      --message "CounterLab ${recovery_mode} Worker recovery after failed ${EVIDENCE_COMMIT} deployment" \
      --yes >"${RELEASE_DIR}/wrangler-recovery.log" 2>&1
    recovery_status="$?"
    if [[ "${recovery_status}" -eq 0 ]]; then
      capture_active_worker \
        "${recovery_version}" \
        "${RELEASE_DIR}/recovery-deployment-status.json" \
        "${RECOVERY_CONFIG}"
      recovery_status="$?"
    fi
    if [[ "${recovery_status}" -eq 0 && "${recovery_mode}" == "maintenance" ]]; then
      wait_for_maintenance_health
      recovery_status="$?"
    fi
    set -e

    if [[ "${recovery_status}" -eq 0 ]]; then
      echo "Exact ${recovery_mode} Worker restored and observed at 100 percent traffic." >&2
      echo "Bound resources and D1 migrations were not rolled back." >&2
      echo "Review ${RELEASE_DIR}/wrangler-recovery.log before retrying." >&2
    else
      echo "CRITICAL: automatic ${recovery_mode} Worker recovery failed." >&2
      echo "Expected recovery version: ${recovery_version}" >&2
      echo "Recovery log: ${RELEASE_DIR}/wrangler-recovery.log" >&2
    fi
  fi
  exit "${original_status}"
}
trap recover_previous_worker EXIT
RECOVERY_ARMED=1

MAINTENANCE_TAG="${WORKER_TAG}"
MAINTENANCE_MESSAGE="CounterLab migration freeze for Worker ${EVIDENCE_COMMIT}"
MAINTENANCE_DEPLOY_LOG="${RELEASE_DIR}/wrangler-maintenance-deploy.log"
assert_release_authority
"${WRANGLER}" deploy \
  "${WORKER_BUNDLE}" \
  --config "${MAINTENANCE_CONFIG}" \
  --no-bundle \
  --strict \
  --tag "${MAINTENANCE_TAG}" \
  --message "${MAINTENANCE_MESSAGE}" \
  --containers-rollout none | tee "${MAINTENANCE_DEPLOY_LOG}"

MAINTENANCE_VERSION_ID="$(extract_worker_version_id "${MAINTENANCE_DEPLOY_LOG}")"
capture_active_worker \
  "${MAINTENANCE_VERSION_ID}" \
  "${RELEASE_DIR}/maintenance-deployment-status.json"

wait_for_maintenance_health

POST_FREEZE_REPLAY_PREFLIGHT="${RELEASE_DIR}/post-freeze-replay-preflight.json"
POST_FREEZE_REPLAY_COUNT="$(query_legacy_replay_count "${POST_FREEZE_REPLAY_PREFLIGHT}")"
if [[ "${POST_FREEZE_REPLAY_COUNT}" != "0" ]]; then
  echo "Deployment stopped under maintenance: ${POST_FREEZE_REPLAY_COUNT} legacy public replay row(s) require an explicit share-safe projection migration." >&2
  exit 2
fi

assert_release_authority
MIGRATIONS_STARTED=1
"${WRANGLER}" d1 migrations apply DB \
  --remote \
  --config "${RELEASE_CONFIG}" | tee "${RELEASE_DIR}/d1-migrations.log"

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "The worktree changed during the bounded migration." >&2
  exit 2
fi

assert_release_authority
CONTAINER_ROLLOUT_STARTED=1
CONTAINER_ROLLOUT_LOG="${RELEASE_DIR}/wrangler-container-rollout.log"
"${WRANGLER}" deploy \
  "${WORKER_BUNDLE}" \
  --config "${MAINTENANCE_CONFIG}" \
  --no-bundle \
  --strict \
  --tag "${WORKER_TAG}" \
  --message "CounterLab qualified Container rollout for ${EVIDENCE_COMMIT}" \
  --containers-rollout immediate | tee "${CONTAINER_ROLLOUT_LOG}"

MAINTENANCE_VERSION_ID="$(extract_worker_version_id "${CONTAINER_ROLLOUT_LOG}")"
capture_active_worker \
  "${MAINTENANCE_VERSION_ID}" \
  "${RELEASE_DIR}/container-rollout-deployment-status.json"

CONTAINER_STATUS=""
for attempt in $(seq 1 30); do
  candidate="${RELEASE_DIR}/containers-${attempt}.json"
  "${WRANGLER}" containers list --per-page 100 --json --config "${RELEASE_CONFIG}" >"${candidate}"
  if node - "${candidate}" "${CONTAINER_APPLICATION_NAME}" "${QUALIFIED_CONTAINER_IMAGE}" <<'NODE'
const fs = require("node:fs");
const [path, expectedName, expectedImage] = process.argv.slice(2);
const applications = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(applications)) process.exit(1);
const named = applications.filter((application) => application?.name === expectedName);
if (named.length !== 1) process.exit(1);
const match = named[0];
if (
  match?.image !== expectedImage ||
  !["active", "ready"].includes(match.state) ||
  typeof match.id !== "string" ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(match.id) ||
  !(
    (Number.isInteger(match.version) && match.version >= 1) ||
    (typeof match.version === "string" && /^[1-9][0-9]*$/.test(match.version))
  )
) process.exit(1);
NODE
  then
    CONTAINER_STATUS="${candidate}"
    break
  fi
  echo "Waiting for the exact Container digest to become observable (${attempt}/30)."
  sleep 10
done
[[ -n "${CONTAINER_STATUS}" ]] || {
  echo "Cloudflare did not report the exact qualified Container digest." >&2
  exit 1
}
wait_for_maintenance_health

WORKER_MESSAGE="CounterLab Worker ${EVIDENCE_COMMIT}; runner ${SOURCE_COMMIT}"
assert_release_authority
"${WRANGLER}" deploy \
  "${WORKER_BUNDLE}" \
  --config "${RELEASE_CONFIG}" \
  --no-bundle \
  --strict \
  --tag "${WORKER_TAG}" \
  --message "${WORKER_MESSAGE}" \
  --containers-rollout none | tee "${RELEASE_DIR}/wrangler-deploy.log"

DEPLOYED_VERSION_ID="$(extract_worker_version_id "${RELEASE_DIR}/wrangler-deploy.log")"

wait_for_final_readiness

capture_active_worker \
  "${DEPLOYED_VERSION_ID}" \
  "${RELEASE_DIR}/deployment-status.json"

"${WRANGLER}" versions view "${DEPLOYED_VERSION_ID}" \
  --config "${RELEASE_CONFIG}" \
  --json >"${RELEASE_DIR}/worker-version.json"

CONTAINER_STATUS=""
for attempt in $(seq 1 30); do
  candidate="${RELEASE_DIR}/final-containers-${attempt}.json"
  "${WRANGLER}" containers list --per-page 100 --json --config "${RELEASE_CONFIG}" >"${candidate}"
  if node - "${candidate}" "${CONTAINER_APPLICATION_NAME}" "${QUALIFIED_CONTAINER_IMAGE}" <<'NODE'
const fs = require("node:fs");
const [path, expectedName, expectedImage] = process.argv.slice(2);
const applications = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(applications)) process.exit(1);
const named = applications.filter((application) => application?.name === expectedName);
if (named.length !== 1) process.exit(1);
const match = named[0];
if (
  match?.image !== expectedImage ||
  !["active", "ready"].includes(match.state) ||
  typeof match.id !== "string" ||
  !/^[A-Za-z0-9_-]{1,128}$/.test(match.id) ||
  !(
    (Number.isInteger(match.version) && match.version >= 1) ||
    (typeof match.version === "string" && /^[1-9][0-9]*$/.test(match.version))
  )
) process.exit(1);
NODE
  then
    CONTAINER_STATUS="${candidate}"
    break
  fi
  echo "Waiting for the exact Container digest to become observable (${attempt}/30)."
  sleep 10
done
[[ -n "${CONTAINER_STATUS}" ]] || {
  echo "Cloudflare did not report the exact qualified Container digest." >&2
  exit 1
}

wait_for_final_readiness

assert_release_authority
node --import tsx scripts/create-deployment-receipt.ts \
  --status "${RELEASE_DIR}/deployment-status.json" \
  --version "${RELEASE_DIR}/worker-version.json" \
  --containers "${CONTAINER_STATUS}" \
  --output "${RELEASE_DIR}/deployment-receipt.json" \
  --source-commit "${SOURCE_COMMIT}" \
  --evidence-commit "${EVIDENCE_COMMIT}" \
  --registry-digest "${REGISTRY_DIGEST}" \
  --config "${RELEASE_CONFIG}" \
  --deployed-version-id "${DEPLOYED_VERSION_ID}" \
  --worker-tag "${WORKER_TAG}" \
  --worker-message "${WORKER_MESSAGE}" \
  --container-name "${CONTAINER_APPLICATION_NAME}" \
  --container-image "${QUALIFIED_CONTAINER_IMAGE}" \
  --qualified-receipt "${RECEIPT}" \
  --release-check-receipt "${RELEASE_CHECK_RECEIPT}" \
  --worker-artifact-manifest "${WORKER_ARTIFACT_MANIFEST}" \
  --worker-bundle "${WORKER_BUNDLE}" \
  --client-dir "${CLIENT_DIR}" \
  --dry-run-dir "${DRY_RUN_DIR}"

DEPLOYMENT_RECEIPT="${RELEASE_DIR}/deployment-receipt.json"
COUNTERLAB_DEPLOYMENT_RECEIPT="${DEPLOYMENT_RECEIPT}" \
COUNTERLAB_FROZEN_WORKER_MANIFEST="${WORKER_ARTIFACT_MANIFEST}" \
  "${PRODUCTION_SMOKE}" "${PRODUCTION_ORIGIN}" |
  tee "${RELEASE_DIR}/production-smoke.log"

RECOVERY_ARMED=0
trap - EXIT

echo "Qualified Cloudflare deployment and production smoke are complete."
echo "Deployment receipt: ${DEPLOYMENT_RECEIPT}"
echo "Container image digest: ${REGISTRY_DIGEST}"
