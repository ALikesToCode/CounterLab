from __future__ import annotations

import importlib.util
import stat
from pathlib import Path
from types import ModuleType

import pytest


ROOT = Path(__file__).resolve().parents[1]


def _load_secret_scan() -> ModuleType:
    path = ROOT / "scripts/secret-scan.py"
    spec = importlib.util.spec_from_file_location("counterlab_secret_scan", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("secret scanner module could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SECRET_SCAN = _load_secret_scan()


def test_repository_local_tool_state_is_ignored() -> None:
    ignored_entries = {
        line.strip()
        for line in (ROOT / ".gitignore").read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.lstrip().startswith("#")
    }

    assert ".counterlab/" in ignored_entries


def test_binary_safe_negative_control_detects_only_a_standalone_token() -> None:
    token = ("s" + "k" + "-").encode("ascii") + (b"A" * 24)
    artifact = ROOT / "apps/web/dist/counterlab/index.js"

    findings = SECRET_SCAN.scan_bytes(
        artifact,
        b"\x00\xffprefix\n" + token + b"\xfe\x00",
    )

    assert findings == [
        "apps/web/dist/counterlab/index.js:2: OpenAI-style token"
    ]
    assert SECRET_SCAN.scan_bytes(
        artifact,
        b"\xffrisk-failure-store-scales\x00",
    ) == []


def test_explicit_selection_accepts_contained_ignored_targets_and_rejects_ambiguity(
    capsys: pytest.CaptureFixture[str],
) -> None:
    selected = SECRET_SCAN.explicit_repository_files(
        ["scripts/secret-scan.py", "scripts/test_secret_scan.py"]
    )

    assert selected == [
        ROOT / "scripts/secret-scan.py",
        ROOT / "scripts/test_secret_scan.py",
    ]
    assert SECRET_SCAN.main(["scripts/secret-scan.py"]) == 0
    assert "1 explicit repository files" in capsys.readouterr().out

    with pytest.raises(SECRET_SCAN.UnsafeScanPath, match="duplicate"):
        SECRET_SCAN.explicit_repository_files(
            ["scripts/secret-scan.py", "scripts/secret-scan.py"]
        )
    with pytest.raises(SECRET_SCAN.UnsafeScanPath, match="unsafe traversal"):
        SECRET_SCAN.explicit_repository_files(["../outside-counterlab"])


@pytest.mark.parametrize("mode", [stat.S_IFLNK | 0o777, stat.S_IFIFO | 0o600])
def test_symlink_and_special_file_modes_fail_closed(mode: int) -> None:
    with pytest.raises(SECRET_SCAN.UnsafeScanPath):
        SECRET_SCAN._path_kind(mode, ROOT / "apps/web/dist/unsafe-entry")


def test_release_gates_scan_the_built_worker_and_run_security_regressions() -> None:
    release_check = (ROOT / "scripts/release-check.sh").read_text(encoding="utf-8")
    test_all = (ROOT / "scripts/test-all.sh").read_text(encoding="utf-8")

    build = release_check.index('"${PNPM}" --filter @counterlab/web build')
    explicit_scan = release_check.index(
        ".venv/bin/python scripts/secret-scan.py \\\n"
        "  apps/web/dist/counterlab/index.js \\\n"
        "  apps/web/dist/client"
    )
    assert build < explicit_scan
    assert release_check.count(".venv/bin/python scripts/secret-scan.py") == 2

    for test_file in (
        "scripts/test_secret_scan.py",
        "scripts/test_production_smoke.py",
        "scripts/test_normalize_runner_oci.py",
    ):
        assert test_file in test_all
