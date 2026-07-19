#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
RECEIPT="${COUNTERLAB_QUALIFIED_RUNNER_RECEIPT:-}"
RELEASE_CHECK_RECEIPT="${COUNTERLAB_RELEASE_CHECK_RECEIPT:-}"
IMAGE="${COUNTERLAB_QUALIFIED_RUNNER_IMAGE:-}"
RUNTIME_ADAPTER="${COUNTERLAB_DOCKER_BIN:-}"
WRANGLER="${ROOT_DIR}/node_modules/.bin/wrangler"
TSX="${ROOT_DIR}/node_modules/.bin/tsx"
PNPM="${ROOT_DIR}/scripts/run-contained-pnpm.sh"
PRODUCTION_ORIGIN="https://counterlab.cserules.workers.dev"

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
node scripts/assert-contained-path.mjs "${CACHE_ROOT}"
export HOME="${CACHE_ROOT}/home"
export TMPDIR="${CACHE_ROOT}/tmp"
export XDG_CACHE_HOME="${CACHE_ROOT}/xdg-cache"
export XDG_CONFIG_HOME="${CACHE_ROOT}/xdg-config"
export XDG_DATA_HOME="${CACHE_ROOT}/xdg-data"
export CI=1
mkdir -p "${HOME}" "${TMPDIR}" "${XDG_CACHE_HOME}" "${XDG_CONFIG_HOME}" "${XDG_DATA_HOME}"

command -v curl >/dev/null 2>&1 || {
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

readarray -t RELEASE_IDENTITY < <(
  node --import tsx scripts/release-check-receipt.ts \
    identity \
    --qualified "${RECEIPT}"
)
[[ "${#RELEASE_IDENTITY[@]}" -eq 10 ]] || {
  echo "Qualified receipt did not expose the exact deployment identity." >&2
  exit 2
}
EVIDENCE_COMMIT="${RELEASE_IDENTITY[0]}"
SOURCE_COMMIT="${RELEASE_IDENTITY[1]}"
LOCAL_IMAGE="${RELEASE_IDENTITY[2]}"
REGISTRY_DIGEST="${RELEASE_IDENTITY[9]}"
CONTAINER_APPLICATION_NAME="counterlab-counterlabrunner"
QUALIFIED_CONTAINER_IMAGE="${IMAGE%:git-*}@${REGISTRY_DIGEST}"

[[ "$(git rev-parse HEAD)" == "${EVIDENCE_COMMIT}" ]] || {
  echo "The qualified evidence commit must equal the deployment HEAD." >&2
  exit 2
}

RELEASE_ID="${EVIDENCE_COMMIT}-runner-${SOURCE_COMMIT:0:12}-$(date -u +%Y%m%dT%H%M%SZ)-$$"
RELEASE_DIR="$(repo_path "node_modules/.cache/counterlab-v6.1/releases/worker-${RELEASE_ID}")"
RELEASE_CONFIG="$(repo_path "apps/web/dist/counterlab/wrangler.release-${RELEASE_ID}.json")"
MAINTENANCE_CONFIG="$(repo_path "apps/web/dist/counterlab/wrangler.maintenance-${RELEASE_ID}.json")"
DRY_RUN_DIR="${RELEASE_DIR}/dry-run"
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

"${TSX}" scripts/prepare-qualified-deploy.ts \
  --config apps/web/dist/counterlab/wrangler.json \
  --receipt "${RECEIPT}" \
  --release-check-receipt "${RELEASE_CHECK_RECEIPT}" \
  --image "${IMAGE}" \
  --output "${RELEASE_CONFIG}"

node - "${RELEASE_CONFIG}" "${MAINTENANCE_CONFIG}" <<'NODE'
const fs = require("node:fs");
const [sourcePath, outputPath] = process.argv.slice(2);
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
NODE

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

wait_for_maintenance_health() {
  local candidate=""
  for attempt in $(seq 1 24); do
    candidate="${RELEASE_DIR}/maintenance-health-${attempt}.json"
    if curl --silent --show-error --fail-with-body \
      --connect-timeout 10 --max-time 20 \
      --output "${candidate}" "${PRODUCTION_ORIGIN}/api/health" &&
      node - "${candidate}" "${EVIDENCE_COMMIT}" "${SOURCE_COMMIT}" "${REGISTRY_DIGEST}" <<'NODE'
const fs = require("node:fs");
const [path, evidenceCommit, sourceCommit, digest] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(path, "utf8"));
const data = payload?.ok === true ? payload.data : undefined;
if (
  data?.maintenance !== true ||
  data?.release?.status !== "bound" ||
  data.release.workerEvidenceCommit !== evidenceCommit ||
  data.release.runnerSourceCommit !== sourceCommit ||
  data.release.runnerImageDigest !== digest
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
  for attempt in $(seq 1 24); do
    candidate="${RELEASE_DIR}/final-readiness-${attempt}.json"
    if curl --silent --show-error --fail-with-body \
      --connect-timeout 10 --max-time 20 \
      --output "${candidate}" "${PRODUCTION_ORIGIN}/ready" &&
      node - "${candidate}" "${EVIDENCE_COMMIT}" "${SOURCE_COMMIT}" "${REGISTRY_DIGEST}" <<'NODE'
const fs = require("node:fs");
const [path, evidenceCommit, sourceCommit, digest] = process.argv.slice(2);
const payload = JSON.parse(fs.readFileSync(path, "utf8"));
if (
  payload?.status !== "ready" ||
  payload?.maintenance !== false ||
  payload?.release?.status !== "bound" ||
  payload.release.workerEvidenceCommit !== evidenceCommit ||
  payload.release.runnerSourceCommit !== sourceCommit ||
  payload.release.runnerImageDigest !== digest
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

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "Release verification changed the tracked or untracked worktree." >&2
  exit 2
fi

"${WRANGLER}" deploy \
  --config "${RELEASE_CONFIG}" \
  --dry-run \
  --strict \
  --containers-rollout none \
  --outdir "${DRY_RUN_DIR}"

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
recover_previous_worker() {
  local original_status="$?"
  trap - EXIT
  if [[ "${original_status}" -ne 0 && "${RECOVERY_ARMED}" -eq 1 ]]; then
    if [[ "${CONTAINER_ROLLOUT_STARTED}" -eq 1 ]]; then
      echo "CRITICAL: qualified deployment failed after the Container rollout began." >&2
      echo "Automatic Worker rollback was intentionally skipped to avoid pairing the prior Worker with a possibly changed Container. The maintenance Worker should remain active." >&2
      echo "Prior Container evidence: id=${PREVIOUS_CONTAINER_ID}, version=${PREVIOUS_CONTAINER_VERSION}, image=${PREVIOUS_CONTAINER_IMAGE}." >&2
      echo "D1 migrations may remain applied. Repair forward and verify the exact Worker, Container, and schema identities before leaving maintenance." >&2
    else
      echo "Qualified deployment failed before Container rollout; restoring only Worker ${PREVIOUS_VERSION_ID}." >&2
      set +e
      "${WRANGLER}" rollback "${PREVIOUS_VERSION_ID}" \
        --config "${RELEASE_CONFIG}" \
        --message "CounterLab Worker-only recovery after failed ${EVIDENCE_COMMIT} deployment" \
        --yes >"${RELEASE_DIR}/wrangler-recovery.log" 2>&1
      local recovery_status="$?"
      set -e
      if [[ "${recovery_status}" -eq 0 ]]; then
        echo "Prior Worker version restored. Bound resources were not rolled back." >&2
        if [[ "${MIGRATIONS_STARTED}" -eq 1 ]]; then
          echo "D1 migration files may remain applied and require explicit review." >&2
        fi
        echo "Review ${RELEASE_DIR}/wrangler-recovery.log before retrying." >&2
      else
        echo "CRITICAL: automatic Worker recovery failed. Run the prevalidated Worker-only command:" >&2
        echo "${WRANGLER} rollback ${PREVIOUS_VERSION_ID} --config ${RELEASE_CONFIG} --yes" >&2
        echo "Recovery log: ${RELEASE_DIR}/wrangler-recovery.log" >&2
      fi
    fi
  fi
  exit "${original_status}"
}
trap recover_previous_worker EXIT
RECOVERY_ARMED=1

MAINTENANCE_TAG="maintenance-${EVIDENCE_COMMIT}"
MAINTENANCE_MESSAGE="CounterLab migration freeze for Worker ${EVIDENCE_COMMIT}"
"${WRANGLER}" deploy \
  --config "${MAINTENANCE_CONFIG}" \
  --strict \
  --tag "${MAINTENANCE_TAG}" \
  --message "${MAINTENANCE_MESSAGE}" \
  --containers-rollout none | tee "${RELEASE_DIR}/wrangler-maintenance-deploy.log"

wait_for_maintenance_health

POST_FREEZE_REPLAY_PREFLIGHT="${RELEASE_DIR}/post-freeze-replay-preflight.json"
POST_FREEZE_REPLAY_COUNT="$(query_legacy_replay_count "${POST_FREEZE_REPLAY_PREFLIGHT}")"
if [[ "${POST_FREEZE_REPLAY_COUNT}" != "0" ]]; then
  echo "Deployment stopped under maintenance: ${POST_FREEZE_REPLAY_COUNT} legacy public replay row(s) require an explicit share-safe projection migration." >&2
  exit 2
fi

MIGRATIONS_STARTED=1
"${WRANGLER}" d1 migrations apply DB \
  --remote \
  --config "${RELEASE_CONFIG}" | tee "${RELEASE_DIR}/d1-migrations.log"

if [[ -n "$(git status --porcelain=v1 --untracked-files=all)" ]]; then
  echo "The worktree changed during the bounded migration." >&2
  exit 2
fi

CONTAINER_ROLLOUT_STARTED=1
"${WRANGLER}" deploy \
  --config "${MAINTENANCE_CONFIG}" \
  --strict \
  --tag "maintenance-container-${EVIDENCE_COMMIT}" \
  --message "CounterLab qualified Container rollout for ${EVIDENCE_COMMIT}" \
  --containers-rollout immediate | tee "${RELEASE_DIR}/wrangler-container-rollout.log"

CONTAINER_STATUS=""
for attempt in $(seq 1 30); do
  candidate="${RELEASE_DIR}/containers-${attempt}.json"
  "${WRANGLER}" containers list --per-page 100 --json --config "${RELEASE_CONFIG}" >"${candidate}"
  if node - "${candidate}" "${CONTAINER_APPLICATION_NAME}" "${QUALIFIED_CONTAINER_IMAGE}" <<'NODE'
const fs = require("node:fs");
const [path, expectedName, expectedImage] = process.argv.slice(2);
const applications = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(applications)) process.exit(1);
const match = applications.find((application) =>
  application?.name === expectedName &&
  application?.image === expectedImage
);
if (
  match === undefined ||
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

WORKER_TAG="git-${EVIDENCE_COMMIT}"
WORKER_MESSAGE="CounterLab Worker ${EVIDENCE_COMMIT}; runner ${SOURCE_COMMIT}"
"${WRANGLER}" deploy \
  --config "${RELEASE_CONFIG}" \
  --strict \
  --tag "${WORKER_TAG}" \
  --message "${WORKER_MESSAGE}" \
  --containers-rollout none | tee "${RELEASE_DIR}/wrangler-deploy.log"

DEPLOYED_VERSION_ID="$(node - "${RELEASE_DIR}/wrangler-deploy.log" <<'NODE'
const fs = require("node:fs");
const output = fs.readFileSync(process.argv[2], "utf8");
const matches = [...output.matchAll(/(?:Current|Worker) Version ID:\s*([a-f0-9-]{36})/g)];
if (matches.length !== 1) throw new Error("Wrangler did not return exactly one Worker version ID");
process.stdout.write(matches[0][1]);
NODE
)"

"${WRANGLER}" deployments status \
  --config "${RELEASE_CONFIG}" \
  --json >"${RELEASE_DIR}/deployment-status.json"

"${WRANGLER}" versions view "${DEPLOYED_VERSION_ID}" \
  --config "${RELEASE_CONFIG}" \
  --json >"${RELEASE_DIR}/worker-version.json"

CONTAINER_STATUS=""
for attempt in $(seq 1 30); do
  candidate="${RELEASE_DIR}/containers-${attempt}.json"
  "${WRANGLER}" containers list --per-page 100 --json --config "${RELEASE_CONFIG}" >"${candidate}"
  if node - "${candidate}" "${CONTAINER_APPLICATION_NAME}" "${QUALIFIED_CONTAINER_IMAGE}" <<'NODE'
const fs = require("node:fs");
const [path, expectedName, expectedImage] = process.argv.slice(2);
const applications = JSON.parse(fs.readFileSync(path, "utf8"));
if (!Array.isArray(applications)) process.exit(1);
const match = applications.find((application) =>
  application?.name === expectedName &&
  application?.image === expectedImage
);
if (
  match === undefined ||
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
  --worker-bundle apps/web/dist/counterlab/index.js \
  --client-dir apps/web/dist/client \
  --dry-run-dir "${DRY_RUN_DIR}"

RECOVERY_ARMED=0
trap - EXIT

echo "Qualified Cloudflare deployment is active and identity-observed."
echo "Production smoke is still required before this release is complete."
echo "Deployment receipt: ${RELEASE_DIR}/deployment-receipt.json"
echo "Container image digest: ${REGISTRY_DIGEST}"
