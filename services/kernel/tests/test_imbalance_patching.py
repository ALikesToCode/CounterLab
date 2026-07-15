from __future__ import annotations

from pathlib import Path

import nbformat
import pytest

from counterlab_kernel.imbalance_patching import (
    compile_imbalance_notebook_patch,
    verify_imbalance_notebook_patch,
)


ROOT = Path(__file__).resolve().parents[3]
NOTEBOOK = ROOT / "fixtures/notebooks/fraud_class_imbalance.ipynb"
FIXTURE = ROOT / "fixtures/public/fraud_rare_event.csv"


def _compiled(tmp_path: Path) -> tuple[Path, Path]:
    compiled = compile_imbalance_notebook_patch(
        original_notebook=NOTEBOOK,
        fixture_csv=FIXTURE,
        output_dir=tmp_path / "compiled",
        transfer_passed=True,
        target_cell=3,
        target_field="fraud",
        excluded_fields=["case_id"],
    )
    assert compiled["status"] == "VERIFIED"
    return NOTEBOOK, Path(compiled["patchPath"])


def test_verified_imbalance_patch_is_reproducible(tmp_path: Path) -> None:
    original, candidate = _compiled(tmp_path)

    report = verify_imbalance_notebook_patch(
        original_notebook=original,
        candidate_notebook=candidate,
        fixture_csv=FIXTURE,
        target_cell=3,
        target_field="fraud",
        excluded_fields=["case_id"],
    )

    assert report["status"] == "VERIFIED"
    assert report["changedCellIndices"] == [3]
    assert report["violations"] == []


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ("unrelated-cell", "UNRELATED_CELL_CHANGED"),
        ("remove-stratify", "PATCH_SOURCE_MISMATCH"),
        ("remove-majority", "PATCH_SOURCE_MISMATCH"),
        ("hardcode-metric", "PATCH_SOURCE_MISMATCH"),
        ("stale-output", "PATCH_OUTPUT_MISMATCH"),
        ("invalid-notebook", "INVALID_NOTEBOOK"),
    ],
)
def test_imbalance_patch_mutations_are_rejected(
    tmp_path: Path, mutation: str, expected_code: str
) -> None:
    original, verified = _compiled(tmp_path)
    candidate = tmp_path / f"{mutation}.ipynb"
    if mutation == "invalid-notebook":
        candidate.write_text("{not-json", encoding="utf-8")
    else:
        notebook = nbformat.read(verified, as_version=4)
        if mutation == "unrelated-cell":
            notebook.cells[0].source += "\nChanged outside the evaluation cell."
        elif mutation == "remove-stratify":
            notebook.cells[3].source = notebook.cells[3].source.replace(
                ", stratify=y", ""
            )
        elif mutation == "remove-majority":
            notebook.cells[3].source = notebook.cells[3].source.replace(
                "majority_prediction", "unverified_prediction"
            )
        elif mutation == "hardcode-metric":
            notebook.cells[3].source += "\nrecall = 0.99\n"
        elif mutation == "stale-output":
            notebook.cells[3].outputs[0]["text"] = "accuracy: 0.999\n"
        candidate.write_text(nbformat.writes(notebook), encoding="utf-8")

    report = verify_imbalance_notebook_patch(
        original_notebook=original,
        candidate_notebook=candidate,
        fixture_csv=FIXTURE,
        target_cell=3,
        target_field="fraud",
        excluded_fields=["case_id"],
    )

    assert report["status"] == "REJECTED"
    assert expected_code in {violation["code"] for violation in report["violations"]}
