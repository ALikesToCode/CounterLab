from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import secrets
import urllib.parse
from datetime import datetime
from typing import Any


_REPORT_STATUSES = {"RUNNING", "PASSED", "FAILED"}
_STAGE_STATUSES = {"PASSED", "FAILED", "SKIPPED"}
_MODES = {"control_plane", "sample", "replay", "live_notebook"}
_CONCEPTS = {"entity_leakage", "class_imbalance"}
_REQUIRED_PASSED_STAGE_MATRIX = {
    "public-readiness": ("control_plane", None),
    "capability-health": ("control_plane", None),
    "public-secret-scan": ("control_plane", None),
    "judge-mode": ("control_plane", None),
    "sample-lesson": ("sample", None),
    "verified-replay": ("replay", None),
    "hosted-capsule-replay": ("replay", "entity_leakage"),
    "live-leakage": ("live_notebook", "entity_leakage"),
    "live-imbalance": ("live_notebook", "class_imbalance"),
}
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:-]{1,256}$")
_WORKER_VERSION = re.compile(
    r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$"
)
_COMMIT = re.compile(r"^[a-f0-9]{40}$")
_SHA256 = re.compile(r"^[a-f0-9]{64}$")
_IMAGE_DIGEST = re.compile(r"^sha256:[a-f0-9]{64}$")
_FORBIDDEN_VALUE_PATTERNS = (
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"\bsk-[A-Za-z0-9_-]{24,}\b"),
    re.compile(r"CODEX_AUTH_JSON\s*[:=]"),
    re.compile(r"COUNTERLAB_RUNNER_SIGNING_(?:PRIVATE_)?KEY\s*[:=]"),
    re.compile(r'"nbformat"\s*:\s*4.+"cells"\s*:', re.DOTALL),
)
_FORBIDDEN_EVIDENCE_KEYS = {
    "authorization",
    "apikey",
    "api_key",
    "credential",
    "credentials",
    "notebookbytes",
    "privatereasoning",
    "rawnotebook",
    "secret",
    "token",
    "password",
    "cookie",
    "setcookie",
    "codexauthjson",
    "openaiapikey",
}


def _timestamp(value: str, field: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{field} must be an ISO-8601 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(f"{field} must be an ISO-8601 timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError(f"{field} must include a timezone")
    return value


def _parsed_timestamp(value: str, field: str) -> datetime:
    _timestamp(value, field)
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _base_url(value: str) -> str:
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme != "https":
        raise ValueError("base URL must use HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("base URL must not contain credentials")
    if not parsed.hostname or parsed.query or parsed.fragment:
        raise ValueError("base URL must be an HTTPS origin")
    if parsed.path not in {"", "/"}:
        raise ValueError("base URL must not contain a path")
    netloc = parsed.hostname
    if parsed.port is not None:
        netloc = f"{netloc}:{parsed.port}"
    return urllib.parse.urlunsplit(("https", netloc, "", "", ""))


def _assert_secret_free(value: Any, *, evidence: bool = False) -> None:
    def inspect(current: Any) -> None:
        if isinstance(current, dict):
            if evidence:
                forbidden = {
                    re.sub(r"[^a-z0-9]", "", str(key).lower())
                    for key in current
                    if re.sub(r"[^a-z0-9]", "", str(key).lower())
                    in _FORBIDDEN_EVIDENCE_KEYS
                }
                if forbidden:
                    raise ValueError(
                        "smoke evidence contains forbidden secret field "
                        f"{sorted(forbidden)[0]}"
                    )
            if str(current.get("nbformat")) == "4" and isinstance(
                current.get("cells"), list
            ):
                raise ValueError("smoke report contains raw notebook content")
            for child in current.values():
                inspect(child)
        elif isinstance(current, list):
            for child in current:
                inspect(child)
        elif isinstance(current, str) and current.lstrip().startswith(("{", "[")):
            try:
                decoded = json.loads(current)
            except json.JSONDecodeError:
                return
            if isinstance(decoded, (dict, list)):
                inspect(decoded)

    inspect(value)
    serialized = json.dumps(value, sort_keys=True, separators=(",", ":"))
    if any(pattern.search(serialized) for pattern in _FORBIDDEN_VALUE_PATTERNS):
        raise ValueError("smoke report contains secret or raw private content")


def _atomic_write(path: pathlib.Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    body = json.dumps(report, indent=2, sort_keys=True) + "\n"
    for _attempt in range(10):
        temporary = path.with_name(
            f".{path.name}.{os.getpid()}.{secrets.token_hex(8)}.tmp"
        )
        try:
            descriptor = os.open(
                temporary,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                0o600,
            )
            break
        except FileExistsError:
            continue
    else:
        raise RuntimeError("could not allocate an exclusive smoke report file")
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(body)
        handle.flush()
        os.fsync(handle.fileno())
    temporary.replace(path)


def validate_report(report: dict[str, Any]) -> dict[str, Any]:
    if set(report) != {
        "schemaVersion",
        "status",
        "baseUrl",
        "startedAt",
        "completedAt",
        "deployment",
        "stages",
        "privacy",
    }:
        raise ValueError("smoke report has unknown or missing fields")
    if report["schemaVersion"] not in {"2", "3", "4"} or report[
        "status"
    ] not in _REPORT_STATUSES:
        raise ValueError("smoke report schema or status is invalid")
    report["baseUrl"] = _base_url(report["baseUrl"])
    report_started = _parsed_timestamp(report["startedAt"], "startedAt")
    report_completed = None
    if report["completedAt"] is not None:
        report_completed = _parsed_timestamp(report["completedAt"], "completedAt")
        if report_completed < report_started:
            raise ValueError("smoke report completedAt precedes startedAt")
    deployment = report["deployment"]
    deployment_fields = {
        "workerVersion",
        "workerEvidenceCommit",
        "runnerSourceCommit",
        "containerImageDigest",
        "deploymentReceiptSha256",
    }
    if report["schemaVersion"] in {"3", "4"}:
        deployment_fields.update(
            {
                "timeoutCleanupReceiptSha256",
                "runtimePolicySha256",
                "proofDependencyManifestSha256",
            }
        )
    if report["schemaVersion"] == "4":
        deployment_fields.update(
            {
                "aggregateLimitEvidenceSha256",
                "workerArtifactClassification",
                "workerArtifactManifestSha256",
                "workerBundleSha256",
                "clientAssetsSha256",
                "clientAssetCount",
                "clientPublicAssetsSha256",
                "clientPublicAssetCount",
                "viteVersion",
                "wranglerVersion",
            }
        )
    if not isinstance(deployment, dict) or set(deployment) != deployment_fields:
        raise ValueError("smoke deployment metadata is invalid")
    worker_version = deployment["workerVersion"]
    if worker_version is not None and not _WORKER_VERSION.fullmatch(worker_version):
        raise ValueError("worker deployment ID is invalid")
    image_digest = deployment["containerImageDigest"]
    if image_digest is not None and not _IMAGE_DIGEST.fullmatch(image_digest):
        raise ValueError("container image digest is invalid")
    for field in ("workerEvidenceCommit", "runnerSourceCommit"):
        commit = deployment[field]
        if commit is not None and not _COMMIT.fullmatch(commit):
            raise ValueError(f"{field} is invalid")
    hash_fields = ["deploymentReceiptSha256"]
    if report["schemaVersion"] in {"3", "4"}:
        hash_fields.extend(
            [
                "timeoutCleanupReceiptSha256",
                "runtimePolicySha256",
                "proofDependencyManifestSha256",
            ]
        )
    if report["schemaVersion"] == "4":
        hash_fields.extend(
            [
                "aggregateLimitEvidenceSha256",
                "workerArtifactManifestSha256",
                "workerBundleSha256",
                "clientAssetsSha256",
                "clientPublicAssetsSha256",
            ]
        )
    for field in hash_fields:
        value = deployment[field]
        if value is not None and not _SHA256.fullmatch(value):
            raise ValueError(f"{field} is invalid")
    if report["schemaVersion"] == "4":
        artifact_values = [
            deployment[field]
            for field in (
                "workerArtifactClassification",
                "workerArtifactManifestSha256",
                "workerBundleSha256",
                "clientAssetsSha256",
                "clientAssetCount",
                "clientPublicAssetsSha256",
                "clientPublicAssetCount",
                "viteVersion",
                "wranglerVersion",
            )
        ]
        if any(value is not None for value in artifact_values):
            if any(value is None for value in artifact_values):
                raise ValueError("Worker artifact identity is incomplete")
            if (
                deployment["workerArtifactClassification"]
                != "PROCESS_BOUND_PARTIAL"
            ):
                raise ValueError("worker artifact classification is invalid")
            if deployment["viteVersion"] != "8.1.4":
                raise ValueError("Vite version is invalid")
            if deployment["wranglerVersion"] != "4.110.0":
                raise ValueError("Wrangler version is invalid")
            client_count = deployment["clientAssetCount"]
            public_count = deployment["clientPublicAssetCount"]
            if (
                not isinstance(client_count, int)
                or isinstance(client_count, bool)
                or client_count < 1
                or not isinstance(public_count, int)
                or isinstance(public_count, bool)
                or public_count < 1
                or public_count > client_count
            ):
                raise ValueError("client asset counts are invalid")
    if report["privacy"] != {
        "containsSecrets": False,
        "containsRawNotebookBytes": False,
        "containsPrivateReasoning": False,
    }:
        raise ValueError("smoke privacy declaration is invalid")
    if not isinstance(report["stages"], list):
        raise ValueError("smoke stages must be a list")
    observed: set[str] = set()
    previous_started: datetime | None = None
    previous_completed: datetime | None = None
    for stage in report["stages"]:
        if not isinstance(stage, dict):
            raise ValueError("smoke stage must be an object")
        expected = {
            "id",
            "mode",
            "status",
            "startedAt",
            "completedAt",
            "evidence",
        }
        if "concept" in stage:
            expected.add("concept")
        if set(stage) != expected:
            raise ValueError("smoke stage has unknown or missing fields")
        if not _SAFE_IDENTIFIER.fullmatch(stage["id"]):
            raise ValueError("smoke stage ID is invalid")
        if stage["id"] in observed:
            raise ValueError("smoke stage IDs must be unique")
        observed.add(stage["id"])
        if stage["mode"] not in _MODES or stage["status"] not in _STAGE_STATUSES:
            raise ValueError("smoke stage mode or status is invalid")
        if "concept" in stage and stage["concept"] not in _CONCEPTS:
            raise ValueError("smoke stage concept is invalid")
        stage_started = _parsed_timestamp(stage["startedAt"], "stage.startedAt")
        stage_completed = _parsed_timestamp(
            stage["completedAt"], "stage.completedAt"
        )
        if stage_started < report_started or stage_completed < stage_started:
            raise ValueError("smoke stage chronology is invalid")
        if previous_started is not None and stage_started < previous_started:
            raise ValueError("smoke stages must be recorded chronologically")
        if previous_completed is not None and stage_completed < previous_completed:
            raise ValueError("smoke stage completions must be chronological")
        if report_completed is not None and stage_completed > report_completed:
            raise ValueError("smoke stage completes after the report")
        previous_started = stage_started
        previous_completed = stage_completed
        if not isinstance(stage["evidence"], dict):
            raise ValueError("smoke stage evidence must be an object")
        _assert_secret_free(stage["evidence"], evidence=True)
    _assert_secret_free(report)
    return report


def load_report(path: pathlib.Path) -> dict[str, Any]:
    report = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(report, dict):
        raise ValueError("smoke report must be a JSON object")
    return validate_report(report)


def initialize_report(
    path: pathlib.Path,
    *,
    base_url: str,
    started_at: str,
    deployment_id: str | None = None,
    worker_evidence_commit: str | None = None,
    runner_source_commit: str | None = None,
    container_image_digest: str | None = None,
    timeout_cleanup_receipt_sha256: str | None = None,
    aggregate_limit_evidence_sha256: str | None = None,
    runtime_policy_sha256: str | None = None,
    proof_dependency_manifest_sha256: str | None = None,
    worker_artifact_classification: str | None = None,
    worker_artifact_manifest_sha256: str | None = None,
    worker_bundle_sha256: str | None = None,
    client_assets_sha256: str | None = None,
    client_asset_count: int | None = None,
    client_public_assets_sha256: str | None = None,
    client_public_asset_count: int | None = None,
    vite_version: str | None = None,
    wrangler_version: str | None = None,
    deployment_receipt_sha256: str | None = None,
) -> dict[str, Any]:
    report = validate_report(
        {
            "schemaVersion": "4",
            "status": "RUNNING",
            "baseUrl": _base_url(base_url),
            "startedAt": _timestamp(started_at, "startedAt"),
            "completedAt": None,
            "deployment": {
                "workerVersion": deployment_id,
                "workerEvidenceCommit": worker_evidence_commit,
                "runnerSourceCommit": runner_source_commit,
                "containerImageDigest": container_image_digest,
                "timeoutCleanupReceiptSha256": timeout_cleanup_receipt_sha256,
                "aggregateLimitEvidenceSha256": (
                    aggregate_limit_evidence_sha256
                ),
                "runtimePolicySha256": runtime_policy_sha256,
                "proofDependencyManifestSha256": (
                    proof_dependency_manifest_sha256
                ),
                "workerArtifactClassification": worker_artifact_classification,
                "workerArtifactManifestSha256": worker_artifact_manifest_sha256,
                "workerBundleSha256": worker_bundle_sha256,
                "clientAssetsSha256": client_assets_sha256,
                "clientAssetCount": client_asset_count,
                "clientPublicAssetsSha256": client_public_assets_sha256,
                "clientPublicAssetCount": client_public_asset_count,
                "viteVersion": vite_version,
                "wranglerVersion": wrangler_version,
                "deploymentReceiptSha256": deployment_receipt_sha256,
            },
            "stages": [],
            "privacy": {
                "containsSecrets": False,
                "containsRawNotebookBytes": False,
                "containsPrivateReasoning": False,
            },
        }
    )
    _atomic_write(path, report)
    return report


def record_stage(path: pathlib.Path, stage: dict[str, Any]) -> dict[str, Any]:
    report = load_report(path)
    existing = next(
        (candidate for candidate in report["stages"] if candidate["id"] == stage.get("id")),
        None,
    )
    if existing is not None:
        if existing == stage:
            return report
        raise ValueError(f"conflicting smoke stage {stage.get('id')!r}")
    report["stages"].append(stage)
    validate_report(report)
    _atomic_write(path, report)
    return report


def finish_report(
    path: pathlib.Path,
    *,
    status: str,
    completed_at: str,
) -> dict[str, Any]:
    if status not in {"PASSED", "FAILED"}:
        raise ValueError("final smoke status must be PASSED or FAILED")
    report = load_report(path)
    if status == "PASSED":
        if any(value is None for value in report["deployment"].values()):
            raise ValueError(
                "a passing smoke report requires the complete deployment identity"
            )
        observed = {
            stage["id"]: (
                stage["mode"],
                stage.get("concept"),
                stage["status"],
            )
            for stage in report["stages"]
        }
        expected = {
            stage_id: (mode, concept, "PASSED")
            for stage_id, (mode, concept) in _REQUIRED_PASSED_STAGE_MATRIX.items()
        }
        if observed != expected:
            raise ValueError(
                "a passing smoke report requires the exact required stage matrix"
            )
    report["status"] = status
    report["completedAt"] = _timestamp(completed_at, "completedAt")
    validate_report(report)
    _atomic_write(path, report)
    return report


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="CounterLab production smoke report")
    subparsers = parser.add_subparsers(dest="command", required=True)
    initialize = subparsers.add_parser("init")
    initialize.add_argument("path", type=pathlib.Path)
    initialize.add_argument("--base-url", required=True)
    initialize.add_argument("--started-at", required=True)
    initialize.add_argument("--deployment-id")
    initialize.add_argument("--worker-evidence-commit")
    initialize.add_argument("--runner-source-commit")
    initialize.add_argument("--container-image-digest")
    initialize.add_argument("--timeout-cleanup-receipt-sha256")
    initialize.add_argument("--aggregate-limit-evidence-sha256")
    initialize.add_argument("--runtime-policy-sha256")
    initialize.add_argument("--proof-dependency-manifest-sha256")
    initialize.add_argument("--worker-artifact-classification")
    initialize.add_argument("--worker-artifact-manifest-sha256")
    initialize.add_argument("--worker-bundle-sha256")
    initialize.add_argument("--client-assets-sha256")
    initialize.add_argument("--client-asset-count", type=int)
    initialize.add_argument("--client-public-assets-sha256")
    initialize.add_argument("--client-public-asset-count", type=int)
    initialize.add_argument("--vite-version")
    initialize.add_argument("--wrangler-version")
    initialize.add_argument("--deployment-receipt-sha256")
    stage = subparsers.add_parser("stage")
    stage.add_argument("path", type=pathlib.Path)
    stage.add_argument("--stage-json", required=True)
    finish = subparsers.add_parser("finish")
    finish.add_argument("path", type=pathlib.Path)
    finish.add_argument("--status", choices=["PASSED", "FAILED"], required=True)
    finish.add_argument("--completed-at", required=True)
    return parser


def main() -> int:
    arguments = _parser().parse_args()
    if arguments.command == "init":
        initialize_report(
            arguments.path,
            base_url=arguments.base_url,
            started_at=arguments.started_at,
            deployment_id=arguments.deployment_id,
            worker_evidence_commit=arguments.worker_evidence_commit,
            runner_source_commit=arguments.runner_source_commit,
            container_image_digest=arguments.container_image_digest,
            timeout_cleanup_receipt_sha256=(
                arguments.timeout_cleanup_receipt_sha256
            ),
            aggregate_limit_evidence_sha256=(
                arguments.aggregate_limit_evidence_sha256
            ),
            runtime_policy_sha256=arguments.runtime_policy_sha256,
            proof_dependency_manifest_sha256=(
                arguments.proof_dependency_manifest_sha256
            ),
            worker_artifact_classification=(
                arguments.worker_artifact_classification
            ),
            worker_artifact_manifest_sha256=(
                arguments.worker_artifact_manifest_sha256
            ),
            worker_bundle_sha256=arguments.worker_bundle_sha256,
            client_assets_sha256=arguments.client_assets_sha256,
            client_asset_count=arguments.client_asset_count,
            client_public_assets_sha256=(
                arguments.client_public_assets_sha256
            ),
            client_public_asset_count=arguments.client_public_asset_count,
            vite_version=arguments.vite_version,
            wrangler_version=arguments.wrangler_version,
            deployment_receipt_sha256=arguments.deployment_receipt_sha256,
        )
    elif arguments.command == "stage":
        stage = json.loads(arguments.stage_json)
        if not isinstance(stage, dict):
            raise ValueError("stage JSON must be an object")
        record_stage(arguments.path, stage)
    else:
        finish_report(
            arguments.path,
            status=arguments.status,
            completed_at=arguments.completed_at,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
