from __future__ import annotations

from hashlib import sha256
import json
from pathlib import Path

import nbformat

from counterlab_kernel.patching import (
    compile_sample_notebook_patch,
    verify_sample_notebook_patch,
)
from counterlab_kernel.transfer import evaluate_forecasting_transfer


ROOT = Path(__file__).resolve().parents[3]
PUBLIC_NOTEBOOK = ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb"
PUBLIC_FIXTURE = ROOT / "fixtures/public/customer_churn.csv"


def _passing_transfer() -> dict[str, object]:
    return evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )


def _source_hash(cell: nbformat.NotebookNode) -> str:
    return sha256(str(cell.source).encode("utf-8")).hexdigest()


def test_patch_is_locked_before_transfer_and_writes_nothing(tmp_path: Path) -> None:
    failed_transfer = evaluate_forecasting_transfer(
        strategy_choice="random_row_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )

    result = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path,
        transfer_result=failed_transfer,
    )

    assert result == {
        "schemaVersion": "1",
        "status": "LOCKED",
        "verified": False,
        "reasonCode": "TRANSFER_REQUIRED",
        "message": "Pass the forecasting transfer task before generating a patch.",
        "patchPath": None,
        "metadataPath": None,
    }
    assert list(tmp_path.iterdir()) == []


def test_patch_rejects_forged_transfer_flags(tmp_path: Path) -> None:
    forged_transfer = {
        "status": "VERIFIED",
        "outcome": "TRANSFER_PASSED",
        "passed": True,
        "patchUnlocked": True,
    }

    result = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path,
        transfer_result=forged_transfer,
    )

    assert result["status"] == "LOCKED"
    assert list(tmp_path.iterdir()) == []


def test_patch_marks_tampered_original_manifest_unverified(tmp_path: Path) -> None:
    original = nbformat.read(PUBLIC_NOTEBOOK, as_version=4)
    original.metadata["counterlab"]["resultHash"] = "0" * 64
    tampered_path = tmp_path / "tampered-original.ipynb"
    nbformat.write(original, tampered_path)
    output_dir = tmp_path / "output"

    result = compile_sample_notebook_patch(
        original_notebook=tampered_path,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=output_dir,
        transfer_result=_passing_transfer(),
    )

    assert result["status"] == "UNVERIFIED"
    assert result["reasonCode"] == "OUTSIDE_PATCH_SUPPORT_CONTRACT"
    assert not output_dir.exists()


def test_passing_transfer_creates_verified_copy_with_only_evaluation_cell_changed(
    tmp_path: Path,
) -> None:
    original_bytes = PUBLIC_NOTEBOOK.read_bytes()
    original = nbformat.read(PUBLIC_NOTEBOOK, as_version=4)

    result = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path,
        transfer_result=_passing_transfer(),
    )

    patch_path = Path(result["patchPath"])
    metadata_path = Path(result["metadataPath"])
    patched = nbformat.read(patch_path, as_version=4)
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))

    assert result["status"] == "VERIFIED"
    assert result["verified"] is True
    assert PUBLIC_NOTEBOOK.read_bytes() == original_bytes
    assert patch_path != PUBLIC_NOTEBOOK
    assert patch_path.exists() and metadata_path.exists()
    assert result["changedCellIndices"] == [3]
    assert metadata["changedCellIndices"] == [3]
    assert "GroupShuffleSplit" in patched.cells[3].source
    assert (
        "df.drop(columns=['churned', 'customer_id', 'observation_id'])"
        in patched.cells[3].source
    )
    assert "train_test_split" not in patched.cells[3].source
    assert "accuracy = 0." not in patched.cells[3].source
    assert "@@" in result["cellDiff"]
    assert result["correctedResult"]["splitStrategy"] == "group"
    assert result["correctedResult"]["dropFeatures"] == ["customer_id"]
    assert result["correctedResult"]["entityOverlap"] == {"count": 0, "rate": 0.0}

    for index, original_cell in enumerate(original.cells):
        if index == 3:
            continue
        assert _source_hash(patched.cells[index]) == _source_hash(original_cell)
        assert patched.cells[index] == original_cell


def test_patch_and_metadata_bytes_are_deterministic(tmp_path: Path) -> None:
    first = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "first",
        transfer_result=_passing_transfer(),
    )
    second = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "second",
        transfer_result=_passing_transfer(),
    )

    assert Path(first["patchPath"]).read_bytes() == Path(second["patchPath"]).read_bytes()
    assert Path(first["metadataPath"]).read_bytes() == Path(
        second["metadataPath"]
    ).read_bytes()
    assert first["patchedSha256"] == second["patchedSha256"]


def test_verifier_rejects_collateral_cell_changes(tmp_path: Path) -> None:
    compiled = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "compiled",
        transfer_result=_passing_transfer(),
    )
    candidate = nbformat.read(compiled["patchPath"], as_version=4)
    candidate.cells[0].source += "\nUnrelated rewrite."
    candidate_path = tmp_path / "collateral.ipynb"
    nbformat.write(candidate, candidate_path)

    report = verify_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        candidate_notebook=candidate_path,
        fixture_csv=PUBLIC_FIXTURE,
    )

    assert report["status"] == "REJECTED"
    assert "UNRELATED_CELL_CHANGED" in {
        violation["code"] for violation in report["violations"]
    }


def test_verifier_rejects_hardcoded_metrics_and_broad_rewrites(tmp_path: Path) -> None:
    compiled = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "compiled",
        transfer_result=_passing_transfer(),
    )
    candidate = nbformat.read(compiled["patchPath"], as_version=4)
    candidate.cells[3].source = (
        "from sklearn.model_selection import GroupShuffleSplit\n"
        "accuracy = 0.99\n"
        "print(f'Group accuracy: {accuracy}')"
    )
    candidate_path = tmp_path / "hardcoded.ipynb"
    nbformat.write(candidate, candidate_path)

    report = verify_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        candidate_notebook=candidate_path,
        fixture_csv=PUBLIC_FIXTURE,
    )
    codes = {violation["code"] for violation in report["violations"]}

    assert report["status"] == "REJECTED"
    assert "HARDCODED_METRIC" in codes
    assert "BROAD_EVALUATION_REWRITE" in codes


def test_verifier_rejects_new_dependencies_and_remaining_row_split(
    tmp_path: Path,
) -> None:
    compiled = compile_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "compiled",
        transfer_result=_passing_transfer(),
    )
    candidate = nbformat.read(compiled["patchPath"], as_version=4)
    candidate.cells[3].source = candidate.cells[3].source.replace(
        "from sklearn.compose import ColumnTransformer",
        "import xgboost\nfrom sklearn.compose import ColumnTransformer",
    ).replace("GroupShuffleSplit", "train_test_split")
    candidate_path = tmp_path / "unsafe.ipynb"
    nbformat.write(candidate, candidate_path)

    report = verify_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        candidate_notebook=candidate_path,
        fixture_csv=PUBLIC_FIXTURE,
    )
    codes = {violation["code"] for violation in report["violations"]}

    assert report["status"] == "REJECTED"
    assert "DEPENDENCY_ADDED" in codes
    assert "GROUP_SPLIT_MISSING" in codes


def test_verifier_returns_typed_rejection_for_invalid_notebook(tmp_path: Path) -> None:
    candidate_path = tmp_path / "broken.ipynb"
    candidate_path.write_text("{not-json", encoding="utf-8")

    report = verify_sample_notebook_patch(
        original_notebook=PUBLIC_NOTEBOOK,
        candidate_notebook=candidate_path,
        fixture_csv=PUBLIC_FIXTURE,
    )

    assert report["status"] == "REJECTED"
    assert report["verified"] is False
    assert report["violations"][0]["code"] == "INVALID_NOTEBOOK"
