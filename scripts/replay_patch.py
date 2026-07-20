#!/usr/bin/env python3
"""Validate historical patch evidence and the current frozen patch path."""

from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path
from typing import Any, Mapping, Sequence

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.patching import (
    compile_sample_notebook_patch,
    verify_sample_notebook_patch,
)
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


def _validated_repository_root(root: Path) -> Path:
    expected = ROOT.resolve(strict=True)
    candidate = Path(root)
    if not candidate.is_absolute():
        raise ValueError("repository root must be an absolute path")
    resolved = candidate.resolve(strict=True)
    if candidate != resolved:
        raise ValueError("repository root must be canonical and symlink-free")
    if resolved != expected:
        raise ValueError("repository root does not match this CounterLab checkout")
    marker = resolved / "COUNTERLAB_REPO_ROOT"
    if marker.is_symlink() or not marker.is_file():
        raise ValueError("CounterLab repository marker is missing or unsafe")
    return resolved


def _validated_repository_file(root: Path, relative_path: str) -> Path:
    relative = Path(relative_path)
    if relative.is_absolute() or ".." in relative.parts:
        raise ValueError(f"repository path is not contained: {relative_path}")
    candidate = root / relative
    if candidate.is_symlink() or not candidate.is_file():
        raise ValueError(
            f"repository evidence file is missing or unsafe: {relative_path}"
        )
    resolved = candidate.resolve(strict=True)
    try:
        resolved.relative_to(root)
    except ValueError as error:
        raise ValueError(
            f"repository evidence file escapes the checkout: {relative_path}"
        ) from error
    if resolved != candidate:
        raise ValueError(f"repository evidence path uses a symlink: {relative_path}")
    return resolved


def _validated_work_dir(root: Path, work_dir: Path) -> Path:
    candidate = Path(work_dir)
    if not candidate.is_absolute():
        raise ValueError("work directory must be an explicit absolute path")
    if candidate.exists() or candidate.is_symlink():
        raise ValueError("work directory must not already exist")

    resolved = candidate.resolve(strict=False)
    if candidate != resolved:
        raise ValueError("work directory must be canonical and symlink-free")
    try:
        relative = resolved.relative_to(root)
    except ValueError as error:
        raise ValueError("work directory must remain inside the repository") from error
    if not relative.parts:
        raise ValueError("work directory must not be the repository root")

    parent = candidate.parent
    if parent.is_symlink() or not parent.is_dir():
        raise ValueError("work directory parent must be an existing safe directory")
    if parent.resolve(strict=True) != parent:
        raise ValueError("work directory parent must be canonical and symlink-free")
    return candidate


def _validated_generated_file(work_dir: Path, filename: str) -> Path:
    candidate = work_dir / filename
    if candidate.is_symlink() or not candidate.is_file():
        raise ValueError(f"generated patch file is missing or unsafe: {filename}")
    resolved = candidate.resolve(strict=True)
    if resolved != candidate or resolved.parent != work_dir:
        raise ValueError(f"generated patch file escapes the work directory: {filename}")
    return resolved


def _passing_transfer() -> Mapping[str, Any]:
    return evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )


def verify_replay_patch(root: Path, work_dir: Path) -> dict[str, Any]:
    root = _validated_repository_root(root)
    work_dir = _validated_work_dir(root, work_dir)
    patched_notebook = _validated_repository_file(
        root, "replays/leakage-01/patch/customer_churn_leakage.patched.ipynb"
    )
    patch_metadata_path = _validated_repository_file(
        root, "replays/leakage-01/patch/customer_churn_leakage.patch.json"
    )
    archived_result = _read_object(
        _validated_repository_file(root, "replays/leakage-01/patch-kernel-result.json")
    )
    archived_verification = _read_object(
        _validated_repository_file(root, "replays/leakage-01/patch-verification.json")
    )
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

    current_notebook = _validated_repository_file(
        root, "fixtures/notebooks/customer_churn_leakage.ipynb"
    )
    fixture = _validated_repository_file(root, "fixtures/public/customer_churn.csv")
    checked_patch = _validated_repository_file(
        root,
        "fixtures/public/leakage_sample_patch_v1/customer_churn_leakage.patched.ipynb",
    )
    checked_metadata_path = _validated_repository_file(
        root,
        "fixtures/public/leakage_sample_patch_v1/customer_churn_leakage.patch.json",
    )
    checked_result_path = _validated_repository_file(
        root, "fixtures/public/leakage_sample_patch_v1/patch-kernel-result.json"
    )
    checked_verification_path = _validated_repository_file(
        root, "fixtures/public/leakage_sample_patch_v1/patch-verification.json"
    )
    checked_transfer_path = _validated_repository_file(
        root, "fixtures/public/leakage_sample_patch_v1/transfer-result.json"
    )
    checked_metadata = _read_object(checked_metadata_path)
    checked_result = _read_object(checked_result_path)
    checked_verification = _read_object(checked_verification_path)
    checked_transfer = _read_object(checked_transfer_path)

    transfer = dict(_passing_transfer())
    _require_equal(
        transfer,
        checked_transfer,
        "current transfer result does not match checked-in evidence",
    )
    current = compile_sample_notebook_patch(
        original_notebook=current_notebook,
        fixture_csv=fixture,
        output_dir=work_dir,
        transfer_result=transfer,
    )
    if current.get("status") != "VERIFIED":
        raise ValueError("current frozen patch path did not verify")
    current_verification = current.get("verification")
    if not isinstance(current_verification, dict):
        raise ValueError("current patch verification evidence is missing")

    generated_patch = _validated_generated_file(
        work_dir, "customer_churn_leakage.patched.ipynb"
    )
    generated_metadata_path = _validated_generated_file(
        work_dir, "customer_churn_leakage.patch.json"
    )
    generated_metadata = _read_object(generated_metadata_path)
    regenerated_verification = verify_sample_notebook_patch(
        original_notebook=current_notebook,
        candidate_notebook=generated_patch,
        fixture_csv=fixture,
    )
    portable_result = {
        key: value
        for key, value in current.items()
        if key not in {"patchPath", "metadataPath"}
    }
    portable_result["patchFile"] = str(checked_patch.relative_to(root))
    portable_result["metadataFile"] = str(checked_metadata_path.relative_to(root))

    _require_equal(
        generated_patch.read_bytes(),
        checked_patch.read_bytes(),
        "regenerated patched notebook bytes do not match checked-in evidence",
    )
    _require_equal(
        generated_metadata_path.read_bytes(),
        checked_metadata_path.read_bytes(),
        "regenerated patch metadata bytes do not match checked-in evidence",
    )
    _require_equal(
        portable_result,
        checked_result,
        "regenerated portable patch result does not match checked-in evidence",
    )
    _require_equal(
        generated_metadata,
        checked_metadata,
        "regenerated patch metadata does not match checked-in evidence",
    )
    _require_equal(
        regenerated_verification,
        checked_verification,
        "regenerated patch verification does not match checked-in evidence",
    )

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
            "evidenceFilesMatched": 5,
        },
    }


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Validate the leakage-01 historical and current patch evidence"
    )
    parser.add_argument("--root", type=Path, default=ROOT)
    parser.add_argument("--work-dir", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    arguments = parse_arguments(argv)
    report = verify_replay_patch(arguments.root, arguments.work_dir)
    print(
        "PATCH REPLAY VERIFIED "
        f"archived={report['archived']['patchedNotebookSha256']} "
        f"current={report['current']['patchedNotebookSha256']} "
        f"overlap={report['current']['entityOverlap']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
