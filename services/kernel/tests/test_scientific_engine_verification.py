from __future__ import annotations

import json
from pathlib import Path

from scripts.verify_scientific_imports import scan_imports
from scripts.verify_scientific_runtime import verify_runtime


def _registry(*package_names: str) -> dict[str, object]:
    return {
        "schemaVersion": "1",
        "engines": [
            {
                "id": package.replace("-", "_"),
                "packageName": package,
                "exactVersion": "1.0.0",
            }
            for package in package_names
        ],
    }


def test_import_scanner_rejects_undeclared_scientific_import(tmp_path: Path) -> None:
    source = tmp_path / "services" / "kernel" / "src"
    source.mkdir(parents=True)
    (source / "candidate.py").write_text(
        "import numpy as np\nfrom scipy import integrate\n", encoding="utf-8"
    )

    findings = scan_imports(tmp_path, _registry("numpy"))

    assert any(finding["code"] == "UNDECLARED_SCIENTIFIC_IMPORT" for finding in findings)
    assert not any(finding.get("module") == "numpy" for finding in findings)


def test_import_scanner_handles_distribution_aliases_and_ignores_text(
    tmp_path: Path,
) -> None:
    source = tmp_path / "services" / "kernel" / "src"
    source.mkdir(parents=True)
    (source / "candidate.py").write_text(
        '"scipy is mentioned, not imported"\nfrom sklearn.metrics import accuracy_score\n',
        encoding="utf-8",
    )

    findings = scan_imports(tmp_path, _registry("scikit-learn"))

    assert findings == []


def test_runtime_verifier_fails_version_threads_hash_and_determinism() -> None:
    snapshot = {
        "runtimeManifest": {
            "sourceCommit": "a" * 40,
            "container": {"imageDigest": f"sha256:{'b' * 64}"},
            "runtimes": [{"id": "cpython", "exactVersion": "3.12.13"}],
            "installedEngines": [
                {
                    "engineId": "numpy",
                    "packageName": "numpy",
                    "exactVersion": "2.4.6",
                    "artifactSha256": "c" * 64,
                }
            ],
        }
    }

    findings = verify_runtime(
        snapshot,
        python_version="3.12.12",
        distributions={"numpy": "2.4.5"},
        thread_pools=[{"num_threads": 2}],
        golden_runs={"leakage": ["d" * 64, "e" * 64]},
        expected_golden_hashes={"leakage": "d" * 64},
        artifact_hashes={"numpy": "f" * 64},
        image_digest=f"sha256:{'0' * 64}",
        source_commit="1" * 40,
    )

    codes = {finding["code"] for finding in findings}
    assert {
        "PYTHON_VERSION_MISMATCH",
        "ENGINE_VERSION_MISMATCH",
        "THREAD_POLICY_VIOLATION",
        "GOLDEN_NONDETERMINISM",
        "ENGINE_ARTIFACT_HASH_MISMATCH",
        "IMAGE_DIGEST_MISMATCH",
        "SOURCE_COMMIT_MISMATCH",
    } <= codes


def test_runtime_verifier_accepts_matching_observations() -> None:
    snapshot = json.loads(
        Path("scientific-engines/snapshot.json").read_text(encoding="utf-8")
    )
    manifest = snapshot["runtimeManifest"]
    distributions = {
        engine["packageName"]: engine["exactVersion"]
        for engine in manifest["installedEngines"]
    }
    artifacts = {
        engine["engineId"]: engine["artifactSha256"]
        for engine in manifest["installedEngines"]
    }

    findings = verify_runtime(
        snapshot,
        python_version=manifest["runtimes"][0]["exactVersion"],
        distributions=distributions,
        thread_pools=[{"num_threads": 1}],
        golden_runs={"leakage": ["d" * 64, "d" * 64]},
        expected_golden_hashes={"leakage": "d" * 64},
        artifact_hashes=artifacts,
        image_digest=manifest["container"]["imageDigest"],
        source_commit=manifest["sourceCommit"],
    )

    assert findings == []
