from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).parents[2]
GENERATOR = ROOT / "scripts" / "generate-held-out-notebooks.py"


def _generate(output_root: Path) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    environment["PYTHONPATH"] = str(ROOT / "services" / "kernel" / "src")
    return subprocess.run(
        [sys.executable, str(GENERATOR), "--output-root", str(output_root)],
        cwd=ROOT,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def test_generator_builds_deterministic_computed_held_out_cases(tmp_path: Path) -> None:
    first = tmp_path / "first"
    second = tmp_path / "second"
    first_run = _generate(first)
    second_run = _generate(second)

    assert first_run.returncode == 0, first_run.stderr
    assert second_run.returncode == 0, second_run.stderr

    first_labels = json.loads((first / "review-labels.json").read_text(encoding="utf-8"))
    second_labels = json.loads((second / "review-labels.json").read_text(encoding="utf-8"))
    assert first_labels == second_labels
    assert len(first_labels["labels"]) == 10
    assert [label["family"] for label in first_labels["labels"]].count(
        "entity_leakage"
    ) == 4
    assert [label["family"] for label in first_labels["labels"]].count(
        "class_imbalance"
    ) == 4
    assert [label["family"] for label in first_labels["labels"]].count(
        "unsupported"
    ) == 2

    first_notebooks = sorted((first / "notebooks").glob("*.ipynb"))
    second_notebooks = sorted((second / "notebooks").glob("*.ipynb"))
    assert len(first_notebooks) == 10
    assert [path.name for path in first_notebooks] == [
        path.name for path in second_notebooks
    ]
    for first_path, second_path in zip(first_notebooks, second_notebooks, strict=True):
        assert first_path.read_bytes() == second_path.read_bytes()
        notebook = json.loads(first_path.read_text(encoding="utf-8"))
        provenance = notebook["metadata"]["counterlab"]["benchmarkProvenance"]
        assert provenance["metricSource"] == "computed_by_generator"
        assert provenance["generator"] == "scripts/generate-held-out-notebooks.py"


def test_supported_cases_contain_real_stored_metric_outputs(tmp_path: Path) -> None:
    output = tmp_path / "output"
    completed = _generate(output)
    assert completed.returncode == 0, completed.stderr

    labels = json.loads((output / "review-labels.json").read_text(encoding="utf-8"))
    for label in labels["labels"]:
        notebook = json.loads(
            (output / "notebooks" / label["fileName"]).read_text(encoding="utf-8")
        )
        if label["expected"]["supportStatus"] == "UNSUPPORTED":
            continue
        output_text = "\n".join(
            str(output.get("text", ""))
            for cell in notebook["cells"]
            for output in cell.get("outputs", [])
        )
        assert label["expected"]["requiredMetricNames"]
        for metric_name in label["expected"]["requiredMetricNames"]:
            assert metric_name.replace("_", " ").split()[0].lower() in output_text.lower()

