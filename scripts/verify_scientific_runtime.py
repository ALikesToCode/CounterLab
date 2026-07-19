#!/usr/bin/env python3
"""Verify the running scientific environment against a CounterLab snapshot."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import importlib.metadata
import json
import platform
import re
import subprocess
import sys
from pathlib import Path
from typing import Any, Mapping, Sequence


_REQUIRED_GOLDEN_CONCEPTS = {"leakage", "imbalance"}
_REQUIRED_HEALTH_CHECKS = {
    "pipCheck",
    "leakageRepeatedRun",
    "leakageRowOrder",
    "imbalanceRepeatedRun",
    "imbalanceRowOrder",
    "leakageCanonicalInputFingerprint",
    "imbalanceCanonicalInputFingerprint",
}
_REQUIRED_INSTALLED_FILE_HASHES = {
    "metadataSha256",
    "recordSha256",
    "licenseSha256",
}


def _finding(code: str, path: str, message: str) -> dict[str, str]:
    return {"code": code, "path": path, "message": message}


def verify_runtime(
    snapshot: Mapping[str, Any],
    *,
    python_version: str,
    distributions: Mapping[str, str],
    thread_pools: Sequence[Mapping[str, Any]],
    golden_runs: Mapping[str, Sequence[str]],
    expected_golden_hashes: Mapping[str, str],
    artifact_hashes: Mapping[str, str],
    image_digest: str,
    source_commit: str,
    installed_file_hashes: Mapping[str, Mapping[str, str]] | None = None,
    expected_installed_file_hashes: Mapping[str, Mapping[str, str]] | None = None,
    health_checks: Mapping[str, bool] | None = None,
    runtime_license_sha256: str | None = None,
) -> list[dict[str, str]]:
    manifest = snapshot["runtimeManifest"]
    findings: list[dict[str, str]] = []
    runtimes = {runtime["id"]: runtime for runtime in manifest["runtimes"]}
    expected_python = runtimes.get("cpython", {}).get("exactVersion")
    if python_version != expected_python:
        findings.append(
            _finding(
                "PYTHON_VERSION_MISMATCH",
                "runtimeManifest.runtimes.cpython",
                f"Expected CPython {expected_python}, observed {python_version}.",
            )
        )

    for installed in manifest["installedEngines"]:
        package = installed["packageName"]
        observed_version = distributions.get(package)
        if observed_version != installed["exactVersion"]:
            findings.append(
                _finding(
                    "ENGINE_VERSION_MISMATCH",
                    f"runtimeManifest.installedEngines.{installed['engineId']}",
                    f"Expected {package} {installed['exactVersion']}, observed {observed_version}.",
                )
            )
        observed_hash = artifact_hashes.get(installed["engineId"])
        if observed_hash != installed["artifactSha256"]:
            findings.append(
                _finding(
                    "ENGINE_ARTIFACT_HASH_MISMATCH",
                    f"runtimeManifest.installedEngines.{installed['engineId']}",
                    "Installed wheel hash does not match the runtime manifest.",
                )
            )

    if not thread_pools:
        findings.append(
            _finding(
                "THREAD_EVIDENCE_MISSING",
                "runtime.threadPools",
                "At least one exact-image thread pool observation is required.",
            )
        )
    elif any(pool.get("num_threads") != 1 for pool in thread_pools):
        findings.append(
            _finding(
                "THREAD_POLICY_VIOLATION",
                "runtime.threadPools",
                "Every reported BLAS/OpenMP thread pool must use exactly one thread.",
            )
        )

    if (
        set(golden_runs) != _REQUIRED_GOLDEN_CONCEPTS
        or set(expected_golden_hashes) != _REQUIRED_GOLDEN_CONCEPTS
    ):
        findings.append(
            _finding(
                "GOLDEN_EVIDENCE_INCOMPLETE",
                "runtime.goldenRuns",
                "Exact-image golden evidence is required for both released concepts.",
            )
        )
    for concept in sorted(_REQUIRED_GOLDEN_CONCEPTS):
        hashes = golden_runs.get(concept, [])
        expected = expected_golden_hashes.get(concept)
        if len(hashes) < 2 or len(set(hashes)) != 1:
            findings.append(
                _finding(
                    "GOLDEN_NONDETERMINISM",
                    f"runtime.goldenRuns.{concept}",
                    "Repeated fixed-kernel runs did not produce one canonical hash.",
                )
            )
        if expected is None or any(value != expected for value in hashes):
            findings.append(
                _finding(
                    "GOLDEN_RESULT_MISMATCH",
                    f"runtime.goldenRuns.{concept}",
                    "Fixed-kernel result differs from the signed upgrade-drift fixture.",
                )
            )

    if image_digest != manifest["container"]["imageDigest"]:
        findings.append(
            _finding(
                "IMAGE_DIGEST_MISMATCH",
                "runtimeManifest.container.imageDigest",
                "Observed Container digest differs from the snapshot.",
            )
        )
    if source_commit != manifest["sourceCommit"]:
        findings.append(
            _finding(
                "SOURCE_COMMIT_MISMATCH",
                "runtimeManifest.sourceCommit",
                "Observed OCI source revision differs from the snapshot.",
            )
        )
    installed_file_hashes = installed_file_hashes or {}
    expected_installed_file_hashes = expected_installed_file_hashes or {}
    expected_engine_ids = {
        installed["engineId"] for installed in manifest["installedEngines"]
    }
    if (
        set(installed_file_hashes) != expected_engine_ids
        or set(expected_installed_file_hashes) != expected_engine_ids
        or any(
            set(installed_file_hashes.get(engine_id, {}))
            != _REQUIRED_INSTALLED_FILE_HASHES
            or set(expected_installed_file_hashes.get(engine_id, {}))
            != _REQUIRED_INSTALLED_FILE_HASHES
            for engine_id in expected_engine_ids
        )
    ):
        findings.append(
            _finding(
                "INSTALLED_ENGINE_EVIDENCE_INCOMPLETE",
                "runtime.installedFiles",
                "Every installed engine requires METADATA, RECORD, and license hashes.",
            )
        )
    for engine_id, expected in expected_installed_file_hashes.items():
        observed = installed_file_hashes.get(engine_id, {})
        for file_kind in ("metadataSha256", "recordSha256", "licenseSha256"):
            if observed.get(file_kind) != expected.get(file_kind):
                findings.append(
                    _finding(
                        "INSTALLED_ENGINE_FILE_HASH_MISMATCH",
                        f"runtime.installedFiles.{engine_id}.{file_kind}",
                        "Installed distribution metadata differs from integrity evidence.",
                    )
                )
    expected_runtime_license = runtimes.get("cpython", {}).get("licenseFileHash")
    if (
        runtime_license_sha256 is None
        or runtime_license_sha256 != expected_runtime_license
    ):
        findings.append(
            _finding(
                "RUNTIME_LICENSE_HASH_MISMATCH",
                "runtimeManifest.runtimes.cpython.licenseFileHash",
                "Installed CPython license differs from the runtime manifest.",
            )
        )
    if health_checks is None or set(health_checks) != _REQUIRED_HEALTH_CHECKS:
        findings.append(
            _finding(
                "ENGINE_HEALTH_EVIDENCE_INCOMPLETE",
                "runtime.healthChecks",
                "The complete fixed exact-image health-check set is required.",
            )
        )
    for check_id, passed in sorted((health_checks or {}).items()):
        if not passed:
            findings.append(
                _finding(
                    "ENGINE_HEALTH_CHECK_FAILED",
                    f"runtime.healthChecks.{check_id}",
                    "An exact-image scientific-engine health check failed.",
                )
            )
    return sorted(findings, key=lambda item: (item["code"], item["path"]))


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _locked_artifact_hashes(
    manifest: Mapping[str, Any], root: Path, wheelhouse: Path
) -> dict[str, str]:
    output: dict[str, str] = {}
    wheels = sorted(wheelhouse.glob("*.whl"))
    lock_text = (root / "requirements.runner.lock.txt").read_text(encoding="utf-8")
    lock_hashes: dict[tuple[str, str], str] = {}
    current: tuple[str, str] | None = None
    for raw_line in lock_text.splitlines():
        line = raw_line.strip()
        match = re.match(
            r"^([A-Za-z0-9_.-]+)==([0-9A-Za-z.+_-]+)\s*\\?$", line
        )
        if match:
            current = (re.sub(r"[-_.]+", "_", match.group(1)).lower(), match.group(2))
            continue
        hash_match = re.match(r"^--hash=sha256:([a-f0-9]{64})$", line)
        if current and hash_match:
            lock_hashes[current] = hash_match.group(1)
            current = None

    for installed in manifest["installedEngines"]:
        package = re.sub(r"[-_.]+", "_", installed["packageName"]).lower()
        version = installed["exactVersion"]
        prefix = re.sub(r"[-_.]+", "_", f"{package}-{version}-").lower()
        matches = [
            wheel
            for wheel in wheels
            if re.sub(r"[-_.]+", "_", wheel.name).lower().startswith(prefix)
        ]
        if len(matches) == 1:
            output[installed["engineId"]] = _sha256(matches[0])
        elif (package, version) in lock_hashes:
            output[installed["engineId"]] = lock_hashes[(package, version)]
    return output


def _installed_distribution_hashes(
    manifest: Mapping[str, Any], root: Path
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, str]]]:
    observed: dict[str, dict[str, str]] = {}
    expected: dict[str, dict[str, str]] = {}
    catalog = json.loads(
        (root / "scientific-engines/evidence-catalog.json").read_text(encoding="utf-8")
    )
    integrity_paths = {
        record["engineId"]: root / record["path"]
        for record in catalog["records"]
        if record["kind"] == "integrity" and "engineId" in record
    }
    for installed in manifest["installedEngines"]:
        engine_id = installed["engineId"]
        distribution = importlib.metadata.distribution(installed["packageName"])
        distribution_path = Path(distribution._path)  # type: ignore[attr-defined]
        evidence_path = integrity_paths.get(engine_id)
        integrity = (
            json.loads(evidence_path.read_text(encoding="utf-8"))
            if evidence_path
            else None
        )
        expected_license = (
            integrity.get("installed", {}).get("licenseSha256")
            if isinstance(integrity, dict)
            else None
        )
        license_candidates = [
            path
            for path in distribution_path.rglob("*")
            if path.is_file()
            and path.name in {"LICENSE", "LICENSE.txt", "COPYING"}
            and _sha256(path) == expected_license
        ]
        observed[engine_id] = {
            "metadataSha256": _sha256(distribution_path / "METADATA"),
            "recordSha256": _sha256(distribution_path / "RECORD"),
            "licenseSha256": (
                _sha256(license_candidates[0]) if len(license_candidates) == 1 else ""
            ),
        }
        if evidence_path:
            expected[engine_id] = {
                "metadataSha256": integrity["installed"]["metadataSha256"],
                "recordSha256": integrity["installed"]["recordSha256"],
                "licenseSha256": integrity["installed"]["licenseSha256"],
            }
    return observed, expected


def _actual_observations(
    snapshot: Mapping[str, Any], root: Path, image_digest: str, source_commit: str
) -> dict[str, Any]:
    manifest = snapshot["runtimeManifest"]
    distributions: dict[str, str] = {}
    for installed in manifest["installedEngines"]:
        package = installed["packageName"]
        try:
            distributions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            continue

    for module in ("numpy", "pandas", "sklearn"):
        importlib.import_module(module)
    from threadpoolctl import threadpool_info

    from counterlab_kernel import (
        generate_imbalance_fixture,
        generate_leakage_fixture,
        run_imbalance_experiment,
        run_leakage_experiment,
    )

    leakage_fixture = generate_leakage_fixture(seed=1729)
    leakage_results = [
        run_leakage_experiment(leakage_fixture, seed=1729),
        run_leakage_experiment(leakage_fixture.copy(deep=True), seed=1729),
        run_leakage_experiment(
            leakage_fixture.sample(frac=1.0, random_state=99), seed=1729
        ),
    ]
    imbalance_fixture = generate_imbalance_fixture(seed=2603)
    imbalance_results = [
        run_imbalance_experiment(imbalance_fixture, seed=2603),
        run_imbalance_experiment(imbalance_fixture.copy(deep=True), seed=2603),
        run_imbalance_experiment(
            imbalance_fixture.sample(frac=1.0, random_state=19), seed=2603
        ),
    ]
    leakage = [result["resultHash"] for result in leakage_results]
    imbalance = [result["resultHash"] for result in imbalance_results]
    pip_check = subprocess.run(
        [sys.executable, "-m", "pip", "check"],
        check=False,
        capture_output=True,
        text=True,
        timeout=30,
    )
    health_checks = {
        "pipCheck": pip_check.returncode == 0,
        "leakageRepeatedRun": leakage[0] == leakage[1],
        "leakageRowOrder": leakage[0] == leakage[2],
        "imbalanceRepeatedRun": imbalance[0] == imbalance[1],
        "imbalanceRowOrder": imbalance[0] == imbalance[2],
        "leakageCanonicalInputFingerprint": all(
            [run["inputFingerprint"] for run in result["runs"]]
            == [run["inputFingerprint"] for run in leakage_results[0]["runs"]]
            for result in leakage_results
        ),
        "imbalanceCanonicalInputFingerprint": all(
            [run["inputFingerprint"] for run in result["runs"]]
            == [run["inputFingerprint"] for run in imbalance_results[0]["runs"]]
            for result in imbalance_results
        ),
    }
    drift = json.loads(
        (root / "scientific-engines/fixtures/validation/ml-engine-upgrade-drift-v1.json").read_text(
            encoding="utf-8"
        )
    )
    installed_file_hashes, expected_installed_file_hashes = (
        _installed_distribution_hashes(manifest, root)
    )
    runtime_license = (
        Path(sys.base_prefix)
        / "lib"
        / f"python{sys.version_info.major}.{sys.version_info.minor}"
        / "LICENSE.txt"
    )
    return {
        "python_version": platform.python_version(),
        "distributions": distributions,
        "thread_pools": threadpool_info(),
        "golden_runs": {"leakage": leakage, "imbalance": imbalance},
        "expected_golden_hashes": {
            "leakage": drift["expectedResultHashes"]["entity-leakage"],
            "imbalance": drift["expectedResultHashes"]["class-imbalance"],
        },
        "artifact_hashes": _locked_artifact_hashes(
            manifest, root, Path("/opt/counterlab-wheelhouse")
        ),
        "image_digest": image_digest,
        "source_commit": source_commit,
        "installed_file_hashes": installed_file_hashes,
        "expected_installed_file_hashes": expected_installed_file_hashes,
        "health_checks": health_checks,
        "runtime_license_sha256": (
            _sha256(runtime_license) if runtime_license.is_file() else None
        ),
    }


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--snapshot", type=Path, default=Path("scientific-engines/snapshot.json"))
    parser.add_argument("--image-digest", required=True)
    parser.add_argument("--source-commit", required=True)
    args = parser.parse_args(argv)
    root = args.root.resolve()
    snapshot_path = args.snapshot
    if not snapshot_path.is_absolute():
        snapshot_path = root / snapshot_path
    snapshot = json.loads(snapshot_path.read_text(encoding="utf-8"))
    observations = _actual_observations(
        snapshot, root, args.image_digest, args.source_commit
    )
    findings = verify_runtime(snapshot, **observations)
    report = {
        "status": "VERIFIED" if not findings else "REJECTED",
        "environmentId": snapshot["runtimeManifest"]["environmentId"],
        "findings": findings,
        "observed": {
            "imageDigest": observations["image_digest"],
            "sourceCommit": observations["source_commit"],
            "pythonVersion": observations["python_version"],
            "engineVersions": observations["distributions"],
            "goldenResultHashes": observations["golden_runs"],
            "threadPoolCount": len(observations["thread_pools"]),
            "healthChecks": observations["health_checks"],
        },
    }
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if not findings else 1


if __name__ == "__main__":
    raise SystemExit(main())
