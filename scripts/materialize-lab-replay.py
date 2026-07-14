#!/usr/bin/env python3
"""Record a real constrained runner/verifier result for leakage-01."""

from __future__ import annotations

import argparse
import hashlib
import shutil
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from counterlab_kernel.canonical import canonical_json, sha256_json
from counterlab_kernel.verifier import critical_mutations, verify_candidate
from counterlab_runner.docker import DockerAdapterExecutor
from counterlab_runner.pipeline import HostCompileVerifyPipeline
from counterlab_runner.workspace import create_fresh_workspace


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _write(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{canonical_json(value)}\n", encoding="utf-8")


def _with_hash(payload: dict[str, Any]) -> dict[str, Any]:
    return {**payload, "reportHash": sha256_json(payload)}


def materialize(root: Path, image: str) -> None:
    root = root.resolve(strict=True)
    public = root / "concept-packs/leakage/public"
    replay = root / "replays/leakage-01"
    fixture = root / "fixtures/public/customer_churn.csv"
    recorded_at = datetime.now(UTC).isoformat().replace("+00:00", "Z")
    commit = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=root,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()

    with tempfile.TemporaryDirectory(prefix="counterlab-record-") as temporary:
        temporary_root = Path(temporary)
        generated_root = temporary_root / "generated"
        workspace = create_fresh_workspace(generated_root, "leakage-01")
        sources = {
            "experiment-plan.json": public / "sample-experiment-plan.json",
            "artifact-adapter.py": public / "artifact-adapter.template.py",
            "public_tests.py": public / "public_tests.template.py",
        }
        for name, source in sources.items():
            shutil.copy2(source, workspace / name)

        outcome = HostCompileVerifyPipeline(
            generated_root=generated_root,
            fixture_path=fixture,
            executor=DockerAdapterExecutor(image=image),
            run_root=temporary_root / "runs",
        )(workspace)
        if (
            outcome.status != "VERIFIED"
            or outcome.result is None
            or outcome.verification is None
            or outcome.execution is None
        ):
            raise SystemExit(f"lab verification failed: {outcome}")

        detected_mutations: list[str] = []
        for mutation in critical_mutations(outcome.result):
            report = verify_candidate(mutation["candidate"])
            detected = report["status"] == "REJECTED" and mutation[
                "expectedInvariant"
            ] in {
                failure["invariant"] for failure in report["failures"]
            }
            if not detected:
                raise SystemExit(f"critical mutation escaped: {mutation['id']}")
            detected_mutations.append(str(mutation["id"]))

        adapter_hash = _sha256(sources["artifact-adapter.py"])
        plan_hash = _sha256(sources["experiment-plan.json"])
        public_source_hash = _sha256(sources["public_tests.py"])
        public_report = _with_hash(
            {
                "schemaVersion": "1",
                "status": "PASSED",
                "passed": 1,
                "failed": 0,
                "command": "python /workspace/public_tests.py",
                "exitCode": outcome.execution.exit_code,
                "durationMs": outcome.execution.duration_ms,
                "stdout": outcome.execution.stdout_excerpt,
                "stderr": outcome.execution.stderr_excerpt,
                "sourceHash": public_source_hash,
            }
        )
        verifier_report = _with_hash(
            {
                "schemaVersion": "1",
                "status": outcome.verification["status"],
                "verifiedInvariants": outcome.verification[
                    "verifiedInvariants"
                ],
                "limitations": outcome.verification["limitations"],
                "mutations": detected_mutations,
                "mutationDetection": {
                    "detected": len(detected_mutations),
                    "total": len(detected_mutations),
                },
                "resultHash": outcome.result["resultHash"],
            }
        )
        lab_report = _with_hash(
            {
                "schemaVersion": "1",
                "status": "VERIFIED",
                "recordedAt": recorded_at,
                "source": "stored-approved-leakage-v1",
                "image": image,
                "commitHash": commit,
                "planHash": plan_hash,
                "adapterHash": adapter_hash,
                "publicTestsReportHash": public_report["reportHash"],
                "externalVerifierReportHash": verifier_report["reportHash"],
                "resultHash": outcome.result["resultHash"],
                "resourceEvidence": outcome.execution.evidence,
            }
        )

    shutil.copy2(sources["experiment-plan.json"], replay / "experiment-plan.json")
    shutil.copy2(sources["artifact-adapter.py"], replay / "artifact-adapter.py")
    shutil.copy2(sources["public_tests.py"], replay / "public_tests.py")
    _write(replay / "public-tests-report.json", public_report)
    _write(replay / "external-verifier-report.json", verifier_report)
    _write(replay / "lab-verification.json", lab_report)
    print(
        f"recorded leakage-01 lab {outcome.result['resultHash']} "
        f"with {len(detected_mutations)} detected mutations"
    )


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="materialize-lab-replay")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--image", default="counterlab-runner:local")
    return parser


if __name__ == "__main__":
    arguments = _parser().parse_args()
    materialize(arguments.root, arguments.image)
