from __future__ import annotations

import json
from pathlib import Path

import nbformat

from counterlab_kernel.artifacts import generate_public_artifacts


def test_public_fixture_and_notebook_are_generated_from_kernel_truth(tmp_path: Path) -> None:
    output = generate_public_artifacts(tmp_path, seed=1729)

    fixture_path = tmp_path / "fixtures/public/customer_churn.csv"
    notebook_path = tmp_path / "fixtures/notebooks/customer_churn_leakage.ipynb"
    result_path = tmp_path / "fixtures/public/leakage_verified_result.json"
    assert output["fixturePath"] == str(fixture_path)
    assert fixture_path.exists()
    assert notebook_path.exists()
    assert result_path.exists()

    result = json.loads(result_path.read_text(encoding="utf-8"))
    notebook = nbformat.read(notebook_path, as_version=4)
    result_output = next(
        item["text"]
        for cell in notebook.cells
        for item in cell.get("outputs", [])
        if item.get("output_type") == "stream"
        and str(item.get("text", "")).startswith("COUNTERLAB_VERIFIED_RESULT=")
    )
    embedded = json.loads(str(result_output).split("=", 1)[1])

    assert embedded == result
    assert notebook.metadata["counterlab"]["resultHash"] == result["resultHash"]
    assert "train_test_split" in "".join(notebook.cells[3].source)


def test_public_artifact_bytes_are_repeatable(tmp_path: Path) -> None:
    first_dir = tmp_path / "first"
    second_dir = tmp_path / "second"
    generate_public_artifacts(first_dir, seed=1729)
    generate_public_artifacts(second_dir, seed=1729)

    relative_paths = [
        Path("fixtures/public/customer_churn.csv"),
        Path("fixtures/public/leakage_verified_result.json"),
        Path("fixtures/notebooks/customer_churn_leakage.ipynb"),
    ]
    for relative in relative_paths:
        assert (first_dir / relative).read_bytes() == (second_dir / relative).read_bytes()
