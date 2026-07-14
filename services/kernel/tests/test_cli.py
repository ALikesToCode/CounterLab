from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


def _run_cli(*args: str, cwd: Path) -> subprocess.CompletedProcess[str]:
    environment = os.environ.copy()
    source_root = Path(__file__).parents[1] / "src"
    environment["PYTHONPATH"] = str(source_root)
    return subprocess.run(
        [sys.executable, "-m", "counterlab_kernel.cli", *args],
        cwd=cwd,
        env=environment,
        text=True,
        capture_output=True,
        check=False,
    )


def test_run_command_writes_canonical_verified_result(tmp_path: Path) -> None:
    output_path = tmp_path / "result.json"
    completed = _run_cli("run", "--seed", "1729", "--output", str(output_path), cwd=tmp_path)

    assert completed.returncode == 0, completed.stderr
    payload = json.loads(output_path.read_text(encoding="utf-8"))
    assert payload["resultHash"]
    assert "random_row_split" in completed.stdout


def test_mutations_command_prints_matrix_and_fails_if_a_mutation_escapes(tmp_path: Path) -> None:
    completed = _run_cli("mutations", "--concept", "leakage", cwd=tmp_path)

    assert completed.returncode == 0, completed.stderr
    assert "MUTATION" in completed.stdout
    assert "DETECTED" in completed.stdout
    assert "Summary:" in completed.stdout


def test_generate_command_creates_reproducible_public_assets(tmp_path: Path) -> None:
    completed = _run_cli("generate", "--root", str(tmp_path), "--seed", "1729", cwd=tmp_path)

    assert completed.returncode == 0, completed.stderr
    assert (tmp_path / "fixtures/public/customer_churn.csv").exists()
    assert (tmp_path / "fixtures/notebooks/customer_churn_leakage.ipynb").exists()
