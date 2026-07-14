from __future__ import annotations

import importlib.util
import json
import shutil
import stat
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
PUBLIC = ROOT / "concept-packs/leakage/public"
HARNESS = ROOT / "services/runner/image/harness.py"


def _load_harness():
    spec = importlib.util.spec_from_file_location("counterlab_harness", HARNESS)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(PUBLIC))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.remove(str(PUBLIC))
    return module


def test_fixed_harness_runs_public_tests_then_writes_contract_and_evidence(
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    output = tmp_path / "output"
    workspace.mkdir()
    output.mkdir()
    shutil.copy2(PUBLIC / "artifact-adapter.template.py", workspace / "artifact-adapter.py")
    shutil.copy2(PUBLIC / "public_tests.template.py", workspace / "public_tests.py")
    harness = _load_harness()

    exit_code = harness.run_harness(
        workspace=workspace,
        output=output,
        network_denied_probe=lambda: True,
        hidden_read_probe=lambda: True,
    )

    assert exit_code == 0
    contract = json.loads((output / "adapter-contract.json").read_text(encoding="utf-8"))
    evidence = json.loads((output / "runner-evidence.json").read_text(encoding="utf-8"))
    assert len(contract["runs"]) == 3
    assert evidence["networkDenied"] is True
    assert evidence["hiddenReadAttemptsDenied"] is True
    assert set(path.name for path in output.iterdir()) == {
        "adapter-contract.json",
        "runner-evidence.json",
        "public-tests.stdout",
        "public-tests.stderr",
    }
    assert all(
        stat.S_IMODE(path.stat().st_mode) == 0o644
        for path in output.iterdir()
    )


def test_harness_refuses_public_test_output_injection(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    output = tmp_path / "output"
    workspace.mkdir()
    output.mkdir()
    shutil.copy2(PUBLIC / "artifact-adapter.template.py", workspace / "artifact-adapter.py")
    (workspace / "public_tests.py").write_text(
        "from pathlib import Path\n(Path.cwd().parent / 'output' / 'adapter-contract.json').write_text('{}')\n",
        encoding="utf-8",
    )
    harness = _load_harness()

    exit_code = harness.run_harness(
        workspace=workspace,
        output=output,
        network_denied_probe=lambda: True,
        hidden_read_probe=lambda: True,
    )

    assert exit_code != 0
    assert not (output / "runner-evidence.json").exists()
