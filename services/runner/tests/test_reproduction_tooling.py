from __future__ import annotations

import importlib.util
import json
import re
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


def _copy_patch_replay_root(destination: Path) -> Path:
    root = destination / "repo"
    root.mkdir()
    shutil.copy2(ROOT / "COUNTERLAB_REPO_ROOT", root / "COUNTERLAB_REPO_ROOT")
    shutil.copytree(ROOT / "replays/leakage-01", root / "replays/leakage-01")
    shutil.copytree(ROOT / "fixtures", root / "fixtures")
    return root


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
    assert re.search(
        r'verify-scientific-engines\.sh\s+\\\s*\n\s*--image "\$\{ENGINE_IMAGE\}"',
        release_check,
    )


def test_release_check_uses_read_only_evidence_checks() -> None:
    release_check = (ROOT / "scripts/release-check.sh").read_text(encoding="utf-8")

    assert '"${PNPM}" run held-out:check' in release_check
    assert '"${PNPM}" run held-out:run' not in release_check
    assert "scripts/collect-achieved-metrics.py --check" in release_check


def test_release_check_preflights_a_unique_receipt() -> None:
    release_check = (ROOT / "scripts/release-check.sh").read_text(encoding="utf-8")

    assert 'RELEASE_RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"' in release_check
    assert (
        "release-check-${EVIDENCE_COMMIT}-${RELEASE_RUN_ID}.json"
        in release_check
    )
    assert '[[ ! -e "${RELEASE_CHECK_RECEIPT}"' in release_check


def test_replay_patch_validates_archived_and_all_current_authority_files(
    tmp_path: Path,
) -> None:
    module = _script_module("replay_patch")
    root = _copy_patch_replay_root(tmp_path)
    module.ROOT = root
    work_dir = root / "work"

    report = module.verify_replay_patch(root, work_dir)

    assert report["status"] == "VERIFIED"
    assert report["archived"]["verifierStatus"] == "VERIFIED"
    assert report["current"]["verifierStatus"] == "VERIFIED"
    assert report["current"]["entityOverlap"] == 0
    assert report["current"]["evidenceFilesMatched"] == 5
    assert report["archived"]["sourceNotebookSha256"] != report["current"][
        "sourceNotebookSha256"
    ]
    assert sorted(path.name for path in work_dir.iterdir()) == [
        "customer_churn_leakage.patch.json",
        "customer_churn_leakage.patched.ipynb",
    ]


def test_replay_patch_rejects_changed_archived_bytes(tmp_path: Path) -> None:
    module = _script_module("replay_patch")
    root = _copy_patch_replay_root(tmp_path)
    module.ROOT = root
    patch = root / "replays/leakage-01/patch/customer_churn_leakage.patched.ipynb"
    patch.write_bytes(patch.read_bytes() + b"\n")

    with pytest.raises(ValueError, match="archived patched notebook hash"):
        module.verify_replay_patch(root, root / "work")


def test_replay_patch_rejects_changed_current_transfer_evidence(
    tmp_path: Path,
) -> None:
    module = _script_module("replay_patch")
    root = _copy_patch_replay_root(tmp_path)
    module.ROOT = root
    transfer_path = (
        root / "fixtures/public/leakage_sample_patch_v1/transfer-result.json"
    )
    transfer = json.loads(transfer_path.read_text(encoding="utf-8"))
    transfer["resultHash"] = "0" * 64
    transfer_path.write_text(json.dumps(transfer), encoding="utf-8")

    with pytest.raises(ValueError, match="transfer result does not match"):
        module.verify_replay_patch(root, root / "work")


def test_replay_patch_requires_a_new_canonical_work_directory(tmp_path: Path) -> None:
    module = _script_module("replay_patch")
    root = _copy_patch_replay_root(tmp_path)
    module.ROOT = root
    existing = root / "existing"
    existing.mkdir()

    with pytest.raises(ValueError, match="must not already exist"):
        module.verify_replay_patch(root, existing)

    noncanonical = root / "fixtures" / ".." / "work"
    with pytest.raises(ValueError, match="canonical and symlink-free"):
        module.verify_replay_patch(root, noncanonical)


def test_replay_patch_cli_requires_explicit_work_directory() -> None:
    module = _script_module("replay_patch")

    with pytest.raises(SystemExit):
        module.parse_arguments(["--root", str(ROOT)])


def test_replay_patch_wrapper_passes_a_contained_persistent_work_directory() -> None:
    wrapper = (ROOT / "scripts/replay-patch.sh").read_text(encoding="utf-8")

    assert (
        'WORK_DIR="${TMPDIR}/replay-patch-${REPLAY_ID}-${BASHPID}-${RANDOM}-${RANDOM}"'
        in wrapper
    )
    assert '--work-dir "${WORK_DIR}"' in wrapper
    assert "mktemp" not in wrapper
    assert "rm " not in wrapper
    assert "TemporaryDirectory" not in (
        ROOT / "scripts/replay_patch.py"
    ).read_text(encoding="utf-8")
