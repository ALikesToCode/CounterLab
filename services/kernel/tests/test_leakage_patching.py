from __future__ import annotations

from pathlib import Path

import nbformat
import pytest

from counterlab_kernel.leakage_patching import (
    compile_leakage_notebook_patch,
    verify_leakage_notebook_patch,
)


ROOT = Path(__file__).resolve().parents[3]
NOTEBOOK = ROOT / "evals/held-out/notebooks/leakage-rows-pipeline.ipynb"
FIXTURE = ROOT / "fixtures/public/customer_churn.csv"


def _compiled(tmp_path: Path) -> tuple[Path, Path]:
    compiled = compile_leakage_notebook_patch(
        original_notebook=NOTEBOOK,
        fixture_csv=FIXTURE,
        output_dir=tmp_path / "compiled",
        transfer_passed=True,
        target_cell=1,
        entity_field="customer_id",
        target_field="churned",
        excluded_fields=["observation_id", "customer_id"],
    )
    assert compiled["status"] == "VERIFIED"
    return NOTEBOOK, Path(compiled["patchPath"])


def test_non_sample_leakage_patch_is_reproducible(tmp_path: Path) -> None:
    first = compile_leakage_notebook_patch(
        original_notebook=NOTEBOOK,
        fixture_csv=FIXTURE,
        output_dir=tmp_path / "first",
        transfer_passed=True,
        target_cell=1,
        entity_field="customer_id",
        target_field="churned",
        excluded_fields=["observation_id", "customer_id"],
    )
    second = compile_leakage_notebook_patch(
        original_notebook=NOTEBOOK,
        fixture_csv=FIXTURE,
        output_dir=tmp_path / "second",
        transfer_passed=True,
        target_cell=1,
        entity_field="customer_id",
        target_field="churned",
        excluded_fields=["observation_id", "customer_id"],
    )

    assert first["status"] == "VERIFIED"
    assert first["patchedSha256"] == second["patchedSha256"]
    assert first["changedCellIndices"] == [1]
    assert first["correctedResult"]["entityOverlap"] == {"count": 0, "rate": 0.0}


def test_non_sample_patch_resolves_an_entity_alias(tmp_path: Path) -> None:
    original = nbformat.read(NOTEBOOK, as_version=4)
    original.cells[1].source = str(original.cells[1].source).replace(
        "customer_id", "member_key"
    )
    aliased = tmp_path / "aliased.ipynb"
    aliased.write_text(nbformat.writes(original), encoding="utf-8")

    compiled = compile_leakage_notebook_patch(
        original_notebook=aliased,
        fixture_csv=FIXTURE,
        output_dir=tmp_path / "alias-output",
        transfer_passed=True,
        target_cell=1,
        entity_field="member_key",
        target_field="churned",
        excluded_fields=["row_key", "member_key"],
    )

    assert compiled["status"] == "VERIFIED"
    patched = nbformat.read(Path(compiled["patchPath"]), as_version=4)
    assert "groups = df['member_key']" in patched.cells[1].source
    assert "drop(columns=['churned', 'member_key', 'row_key']" in patched.cells[1].source


@pytest.mark.parametrize(
    ("mutation", "expected_code"),
    [
        ("unrelated-cell", "UNRELATED_CELL_CHANGED"),
        ("remove-group-split", "PATCH_SOURCE_MISMATCH"),
        ("stale-output", "PATCH_OUTPUT_MISMATCH"),
    ],
)
def test_non_sample_leakage_patch_mutations_are_rejected(
    tmp_path: Path, mutation: str, expected_code: str
) -> None:
    original, verified = _compiled(tmp_path)
    notebook = nbformat.read(verified, as_version=4)
    if mutation == "unrelated-cell":
        notebook.cells[0].source += "\nChanged outside the evaluation cell."
    elif mutation == "remove-group-split":
        notebook.cells[1].source = notebook.cells[1].source.replace(
            "GroupShuffleSplit", "UnverifiedSplit"
        )
    elif mutation == "stale-output":
        notebook.cells[1].outputs[0]["text"] = "accuracy: 0.999\n"
    candidate = tmp_path / f"{mutation}.ipynb"
    candidate.write_text(nbformat.writes(notebook), encoding="utf-8")

    report = verify_leakage_notebook_patch(
        original_notebook=original,
        candidate_notebook=candidate,
        fixture_csv=FIXTURE,
        target_cell=1,
        entity_field="customer_id",
        target_field="churned",
        excluded_fields=["observation_id", "customer_id"],
    )

    assert report["status"] == "REJECTED"
    assert expected_code in {item["code"] for item in report["violations"]}
