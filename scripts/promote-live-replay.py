#!/usr/bin/env python3
"""Promote local live Codex evidence into a path-safe checked-in replay."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path


EXPECTED_GENERATED = (
    "artifact-adapter.py",
    "experiment-plan.json",
    "public_tests.py",
)


def _sanitize_text(value: str) -> str:
    value = re.sub(r"/(?:home|Users)/[^\s'\";|&]+", "[local-path]", value)
    value = re.sub(r"/tmp/[^\s'\";|&]+", "[temp-path]", value)
    value = re.sub(
        r"^diff --git a/(.+) b/(.+)$",
        lambda match: (
            f"diff --git a/{Path(match.group(1)).name} "
            f"b/{Path(match.group(2)).name}"
        ),
        value,
        flags=re.MULTILINE,
    )
    value = re.sub(
        r"^(---|\+\+\+)\s+([^\t\n]+)(.*)$",
        lambda match: f"{match.group(1)} {Path(match.group(2)).name}{match.group(3)}",
        value,
        flags=re.MULTILINE,
    )
    return value


def _sanitize(value: object) -> object:
    if isinstance(value, str):
        return _sanitize_text(value)
    if isinstance(value, list):
        return [_sanitize(item) for item in value]
    if isinstance(value, dict):
        return {key: _sanitize(item) for key, item in value.items()}
    return value


def _copy_json(source: Path, destination: Path) -> None:
    value = json.loads(source.read_text(encoding="utf-8"))
    destination.write_text(
        f"{json.dumps(_sanitize(value), sort_keys=True, separators=(',', ':'))}\n",
        encoding="utf-8",
    )


def _copy_run(source: Path, destination: Path, *, verified: bool) -> None:
    metadata = json.loads(
        (source / "compile-metadata.json").read_text(encoding="utf-8")
    )
    session_id = metadata["sessionId"]
    generated = source / "generated" / session_id
    destination.mkdir(parents=True, exist_ok=False)
    candidate = destination / "final-candidate"
    candidate.mkdir()
    for name in EXPECTED_GENERATED:
        shutil.copy2(generated / name, candidate / name)

    names = ["compile-metadata.json", "compiler-events.json"]
    if verified:
        names.extend(
            [
                "external-verifier-report.json",
                "lab-verification.json",
                "public-tests-report.json",
                "verified-result.json",
            ]
        )
    else:
        names.extend(
            [
                "external-verifier-report.json",
                "repair-1-events.json",
                "repair-1-metadata.json",
                "repair-2-events.json",
                "repair-2-metadata.json",
            ]
        )
    for name in names:
        _copy_json(source / name, destination / name)


def promote(root: Path, rejected: Path, verified: Path) -> None:
    root = root.resolve(strict=True)
    rejected = rejected.resolve(strict=True)
    verified = verified.resolve(strict=True)
    target = root / "replays/leakage-01/compiler"
    if target.exists():
        raise SystemExit(f"replay target already exists: {target}")
    target.mkdir(parents=True)
    _copy_run(rejected, target / "rejected-live-run", verified=False)
    _copy_run(verified, target / "verified-live-run", verified=True)

    rejected_meta = json.loads(
        (rejected / "compile-metadata.json").read_text(encoding="utf-8")
    )
    verified_meta = json.loads(
        (verified / "compile-metadata.json").read_text(encoding="utf-8")
    )
    verification = json.loads(
        (verified / "lab-verification.json").read_text(encoding="utf-8")
    )
    index = {
        "schemaVersion": "1",
        "replayId": "leakage-01",
        "recordedAt": verified_meta["completedAt"],
        "modelId": verified_meta["model"],
        "codexVersion": verified_meta["health"]["version"],
        "rejectedLiveRun": {
            "sessionId": rejected_meta["sessionId"],
            "status": "REJECTED",
            "repairAttempts": 2,
            "finalInvariant": "generated_workspace_policy",
            "resultAuthorized": False,
        },
        "verifiedLiveRun": {
            "sessionId": verified_meta["sessionId"],
            "status": "VERIFIED",
            "repairAttempts": 0,
            "resultHash": verification["resultHash"],
            "adapterHash": verification["adapterHash"],
            "resultAuthorized": True,
        },
        "generationIsolation": {
            "status": "PARTIAL",
            "limitation": (
                "The host App Server process inspected global skill files outside the "
                "generation directory; hidden-verifier unreadability during generation "
                "was not proven."
            ),
        },
        "candidateExecutionIsolation": {
            "status": "VERIFIED",
            "properties": [
                "network denied",
                "non-root user",
                "read-only root and workspace",
                "hidden verifier not mounted",
                "resource limits recorded",
            ],
        },
    }
    (target / "index.json").write_text(
        f"{json.dumps(index, sort_keys=True, separators=(',', ':'))}\n",
        encoding="utf-8",
    )
    print(
        f"promoted rejected {rejected_meta['sessionId']} and verified "
        f"{verified_meta['sessionId']} to {target}"
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="promote-live-replay")
    parser.add_argument("rejected", type=Path)
    parser.add_argument("verified", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    return parser


if __name__ == "__main__":
    arguments = _parser().parse_args()
    promote(arguments.root, arguments.rejected, arguments.verified)
