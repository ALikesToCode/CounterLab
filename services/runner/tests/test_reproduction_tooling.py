from __future__ import annotations

import importlib.util
import shutil
from pathlib import Path
from types import ModuleType

import pytest


ROOT = Path(__file__).resolve().parents[3]


def _script_module(name: str) -> ModuleType:
    path = ROOT / f"scripts/{name}.py"
    spec = importlib.util.spec_from_file_location(f"counterlab_{name}", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_reproduction_selects_an_explicit_qualified_image() -> None:
    module = _script_module("reproduce-session")

    arguments = module.parse_arguments(
        ["--image", "counterlab-runner:engine-registry-v5"]
    )

    assert arguments.image == "counterlab-runner:engine-registry-v5"


def test_reproduction_allows_provenance_only_kernel_upgrades() -> None:
    module = _script_module("reproduce-session")
    archived = {
        "resultHash": "a" * 64,
        "runs": [
            {
                "id": "baseline",
                "metrics": {"accuracy": 0.75},
                "featureSetFingerprint": "b" * 64,
            }
        ],
    }
    current = {
        "resultHash": "c" * 64,
        "runs": [
            {
                "id": "baseline",
                "metrics": {"accuracy": 0.75},
                "featureSetFingerprint": "d" * 64,
                "pipelineFingerprint": "e" * 64,
            }
        ],
    }

    module.assert_semantic_compatibility(archived, current)

    current["runs"][0]["metrics"]["accuracy"] = 0.5
    with pytest.raises(ValueError, match="semantic result changed"):
        module.assert_semantic_compatibility(archived, current)


def test_reproduction_wrapper_never_builds_implicitly() -> None:
    wrapper = (ROOT / "scripts/reproduce-session.sh").read_text(encoding="utf-8")

    assert "COUNTERLAB_SANDBOX_IMAGE" in wrapper
    assert "sandbox-smoke.sh --build" not in wrapper
    assert '--image "${IMAGE}"' in wrapper


def test_release_check_keeps_engine_and_adapter_images_separate() -> None:
    release_check = (ROOT / "scripts/release-check.sh").read_text(encoding="utf-8")

    assert "sandbox-smoke.sh --build" not in release_check
    assert (
        'COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" '
        "bash scripts/sandbox-smoke.sh" in release_check
    )
    assert (
        'COUNTERLAB_SANDBOX_IMAGE="${ADAPTER_IMAGE}" '
        "bash scripts/reproduce-session.sh leakage-01" in release_check
    )
    assert 'verify-scientific-engines.sh --image "${ENGINE_IMAGE}"' in release_check


def test_replay_patch_validates_archived_and_current_authority() -> None:
    module = _script_module("replay_patch")

    report = module.verify_replay_patch(ROOT)

    assert report["status"] == "VERIFIED"
    assert report["archived"]["verifierStatus"] == "VERIFIED"
    assert report["current"]["verifierStatus"] == "VERIFIED"
    assert report["current"]["entityOverlap"] == 0
    assert report["archived"]["sourceNotebookSha256"] != report["current"][
        "sourceNotebookSha256"
    ]


def test_replay_patch_rejects_changed_archived_bytes(tmp_path: Path) -> None:
    module = _script_module("replay_patch")
    root = tmp_path / "repo"
    shutil.copytree(ROOT / "replays/leakage-01", root / "replays/leakage-01")
    shutil.copytree(ROOT / "fixtures", root / "fixtures")
    patch = root / "replays/leakage-01/patch/customer_churn_leakage.patched.ipynb"
    patch.write_bytes(patch.read_bytes() + b"\n")

    with pytest.raises(ValueError, match="archived patched notebook hash"):
        module.verify_replay_patch(root)
