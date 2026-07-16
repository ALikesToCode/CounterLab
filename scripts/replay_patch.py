#!/usr/bin/env python3
"""Validate historical patch evidence and the current frozen patch path."""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
import tempfile
from typing import Any, Mapping, Sequence

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.patching import compile_sample_notebook_patch
from counterlab_kernel.transfer import evaluate_forecasting_transfer


ROOT = Path(__file__).resolve().parents[1]


def _read_object(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError(f"{path.name} must contain a JSON object")
    return value


def _file_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def _require_equal(actual: object, expected: object, message: str) -> None:
    if actual != expected:
        raise ValueError(message)


def _passing_transfer() -> Mapping[str, Any]:
    return evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )


def verify_replay_patch(root: Path) -> dict[str, Any]:
    root = Path(root).resolve(strict=True)
    replay = root / "replays/leakage-01"
    patch_dir = replay / "patch"
    patched_notebook = patch_dir / "customer_churn_leakage.patched.ipynb"
    patch_metadata_path = patch_dir / "customer_churn_leakage.patch.json"
    archived_result = _read_object(replay / "patch-kernel-result.json")
    archived_verification = _read_object(replay / "patch-verification.json")
    patch_metadata = _read_object(patch_metadata_path)

    for label, payload in (
        ("archived patch result", archived_result),
        ("archived patch verification", archived_verification),
        ("archived patch metadata", patch_metadata),
    ):
        if payload.get("status") != "VERIFIED":
            raise ValueError(f"{label} is not VERIFIED")

    actual_patch_hash = _file_sha256(patched_notebook)
    expected_patch_hashes = {
        archived_result.get("patchedSha256"),
        archived_verification.get("candidateSha256"),
        patch_metadata.get("patchedNotebookSha256"),
    }
    if expected_patch_hashes != {actual_patch_hash}:
        raise ValueError("archived patched notebook hash does not match its evidence")

    recorded_metadata_hash = patch_metadata.get("metadataHash")
    metadata_without_hash = dict(patch_metadata)
    metadata_without_hash.pop("metadataHash", None)
    _require_equal(
        sha256_json(metadata_without_hash),
        recorded_metadata_hash,
        "archived patch metadata hash is invalid",
    )
    _require_equal(
        archived_result.get("metadataHash"),
        recorded_metadata_hash,
        "archived patch result does not bind its metadata",
    )
    _require_equal(
        archived_result.get("originalSha256"),
        patch_metadata.get("sourceNotebookSha256"),
        "archived source notebook hashes do not match",
    )
    archived_corrected = archived_result.get("correctedResult")
    _require_equal(
        archived_verification.get("correctedResult"),
        archived_corrected,
        "archived verifier result does not match the patch result",
    )
    _require_equal(
        patch_metadata.get("correctedResult"),
        archived_corrected,
        "archived metadata result does not match the patch result",
    )
    if not isinstance(archived_corrected, dict):
        raise ValueError("archived corrected result is invalid")
    _require_equal(
        archived_corrected.get("entityOverlap"),
        {"count": 0, "rate": 0.0},
        "archived patch does not prove zero entity overlap",
    )

    current_notebook = root / "fixtures/notebooks/customer_churn_leakage.ipynb"
    fixture = root / "fixtures/public/customer_churn.csv"
    with tempfile.TemporaryDirectory(prefix="counterlab-replay-patch-") as temporary:
        current = compile_sample_notebook_patch(
            original_notebook=current_notebook,
            fixture_csv=fixture,
            output_dir=Path(temporary),
            transfer_result=_passing_transfer(),
        )
    if current.get("status") != "VERIFIED":
        raise ValueError("current frozen patch path did not verify")
    current_verification = current.get("verification")
    if not isinstance(current_verification, dict):
        raise ValueError("current patch verification evidence is missing")

    return {
        "schemaVersion": "1",
        "status": "VERIFIED",
        "archived": {
            "sourceNotebookSha256": archived_result["originalSha256"],
            "patchedNotebookSha256": actual_patch_hash,
            "resultHash": archived_corrected["resultHash"],
            "verifierStatus": archived_verification["status"],
        },
        "current": {
            "sourceNotebookSha256": _file_sha256(current_notebook),
            "patchedNotebookSha256": current["patchedSha256"],
            "resultHash": current["correctedResult"]["resultHash"],
            "entityOverlap": current["correctedResult"]["entityOverlap"]["count"],
            "verifierStatus": current_verification.get("status"),
        },
    }


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the leakage-01 historical and current patch evidence"
    )
    parser.add_argument("--root", type=Path, default=ROOT)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    report = verify_replay_patch(parse_arguments(argv).root)
    print(
        "PATCH REPLAY VERIFIED "
        f"archived={report['archived']['patchedNotebookSha256']} "
        f"current={report['current']['patchedNotebookSha256']} "
        f"overlap={report['current']['entityOverlap']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
