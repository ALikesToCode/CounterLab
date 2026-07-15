from __future__ import annotations

import argparse
import json
import os
import pathlib
import re
import urllib.parse
from datetime import datetime
from typing import Any


_REPORT_STATUSES = {"RUNNING", "PASSED", "FAILED"}
_STAGE_STATUSES = {"PASSED", "FAILED", "SKIPPED"}
_MODES = {"control_plane", "sample", "replay", "live_notebook"}
_CONCEPTS = {"entity_leakage", "class_imbalance"}
_SAFE_IDENTIFIER = re.compile(r"^[A-Za-z0-9_.:-]{1,256}$")
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
    "apiKey",
    "api_key",
    "credential",
    "credentials",
    "notebookBytes",
    "privateReasoning",
    "rawNotebook",
    "secret",
    "token",
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
    if evidence and isinstance(value, dict):
        forbidden = _FORBIDDEN_EVIDENCE_KEYS.intersection(value)
        if forbidden:
            raise ValueError(
                f"smoke evidence contains forbidden secret field {sorted(forbidden)[0]}"
            )
    serialized = json.dumps(value, sort_keys=True, separators=(",", ":"))
    if any(pattern.search(serialized) for pattern in _FORBIDDEN_VALUE_PATTERNS):
        raise ValueError("smoke report contains secret or raw private content")


def _atomic_write(path: pathlib.Path, report: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    body = json.dumps(report, indent=2, sort_keys=True) + "\n"
    with temporary.open("w", encoding="utf-8") as handle:
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
    if report["schemaVersion"] != "1" or report["status"] not in _REPORT_STATUSES:
        raise ValueError("smoke report schema or status is invalid")
    report["baseUrl"] = _base_url(report["baseUrl"])
    _timestamp(report["startedAt"], "startedAt")
    if report["completedAt"] is not None:
        _timestamp(report["completedAt"], "completedAt")
    deployment = report["deployment"]
    if not isinstance(deployment, dict) or set(deployment) != {
        "workerVersion",
        "containerImageDigest",
    }:
        raise ValueError("smoke deployment metadata is invalid")
    worker_version = deployment["workerVersion"]
    if worker_version is not None and not _SAFE_IDENTIFIER.fullmatch(worker_version):
        raise ValueError("worker deployment ID is invalid")
    image_digest = deployment["containerImageDigest"]
    if image_digest is not None and not _IMAGE_DIGEST.fullmatch(image_digest):
        raise ValueError("container image digest is invalid")
    if report["privacy"] != {
        "containsSecrets": False,
        "containsRawNotebookBytes": False,
        "containsPrivateReasoning": False,
    }:
        raise ValueError("smoke privacy declaration is invalid")
    if not isinstance(report["stages"], list):
        raise ValueError("smoke stages must be a list")
    observed: set[str] = set()
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
        _timestamp(stage["startedAt"], "stage.startedAt")
        _timestamp(stage["completedAt"], "stage.completedAt")
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
    container_image_digest: str | None = None,
) -> dict[str, Any]:
    report = validate_report(
        {
            "schemaVersion": "1",
            "status": "RUNNING",
            "baseUrl": _base_url(base_url),
            "startedAt": _timestamp(started_at, "startedAt"),
            "completedAt": None,
            "deployment": {
                "workerVersion": deployment_id,
                "containerImageDigest": container_image_digest,
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
    initialize.add_argument("--container-image-digest")
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
            container_image_digest=arguments.container_image_digest,
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
