from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.patching import (
    compile_sample_notebook_patch,
    verify_sample_notebook_patch,
)
from counterlab_kernel.transfer import evaluate_forecasting_transfer


ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "fixtures/public/leakage_sample_patch_v1"
ORIGINAL = ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb"
FIXTURE = ROOT / "fixtures/public/customer_churn.csv"


def read_json(path: Path) -> dict[str, object]:
    value = json.loads(path.read_text(encoding="utf-8"))
    assert isinstance(value, dict)
    return value


def file_sha256(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def passing_transfer() -> dict[str, object]:
    return evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )


def test_checked_in_current_patch_is_source_and_byte_bound() -> None:
    patch = read_json(EVIDENCE / "patch-kernel-result.json")
    metadata = read_json(EVIDENCE / "customer_churn_leakage.patch.json")
    verification = read_json(EVIDENCE / "patch-verification.json")
    patched = EVIDENCE / "customer_churn_leakage.patched.ipynb"

    assert patch["status"] == "VERIFIED"
    assert patch["originalSha256"] == file_sha256(ORIGINAL)
    assert patch["patchedSha256"] == file_sha256(patched)
    assert metadata["sourceNotebookSha256"] == patch["originalSha256"]
    assert metadata["patchedNotebookSha256"] == patch["patchedSha256"]
    assert verification["candidateSha256"] == patch["patchedSha256"]
    metadata_without_hash = dict(metadata)
    recorded_metadata_hash = metadata_without_hash.pop("metadataHash")
    assert sha256_json(metadata_without_hash) == recorded_metadata_hash


def test_current_patch_regenerates_deterministically(tmp_path: Path) -> None:
    checked = read_json(EVIDENCE / "patch-kernel-result.json")
    regenerated = compile_sample_notebook_patch(
        original_notebook=ORIGINAL,
        fixture_csv=FIXTURE,
        output_dir=tmp_path / "patch",
        transfer_result=passing_transfer(),
    )
    assert regenerated["status"] == "VERIFIED"

    checked_portable = {
        key: value
        for key, value in checked.items()
        if key not in {"patchFile", "metadataFile"}
    }
    regenerated_portable = {
        key: value
        for key, value in regenerated.items()
        if key not in {"patchPath", "metadataPath"}
    }
    assert regenerated_portable == checked_portable
    assert (
        verify_sample_notebook_patch(
            original_notebook=ORIGINAL,
            candidate_notebook=Path(str(regenerated["patchPath"])),
            fixture_csv=FIXTURE,
        )["status"]
        == "VERIFIED"
    )
