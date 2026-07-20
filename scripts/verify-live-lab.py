#!/usr/bin/env python3
"""Verify one live Codex generation outside its visible workspace."""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

from counterlab_kernel.canonical import canonical_json, sha256_json
from counterlab_kernel.verifier import critical_mutations, verify_candidate
from counterlab_runner.docker import (
    DockerAdapterExecutor,
    create_repository_work_directory,
)
from counterlab_runner.pipeline import HostCompileVerifyPipeline


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _write(path: Path, value: object) -> None:
    path.write_text(f"{canonical_json(value)}\n", encoding="utf-8")


def verify(root: Path, run_directory: Path, image: str) -> bool:
    root = root.resolve(strict=True)
    run_directory = run_directory.resolve(strict=True)
    session_id = run_directory.name
    generated_root = run_directory / "generated"
    workspace = generated_root / session_id
    temporary_root = create_repository_work_directory(root, "live-verifier")
    outcome = HostCompileVerifyPipeline(
        generated_root=generated_root,
        fixture_path=root / "fixtures/public/customer_churn.csv",
        executor=DockerAdapterExecutor(image=image),
        run_root=temporary_root,
    )(workspace)

    if outcome.status != "VERIFIED" or outcome.result is None:
        report = {
            "schemaVersion": "1",
            "status": "REJECTED",
            "failures": [
                {
                    "invariant": failure.invariant,
                    "observed": failure.observed,
                    "expected": failure.expected,
                    "counterexample": failure.counterexample,
                }
                for failure in outcome.failures
            ],
        }
        _write(run_directory / "external-verifier-report.json", report)
        print(canonical_json(report))
        return False

    detected: list[str] = []
    for mutation in critical_mutations(outcome.result):
        mutation_report = verify_candidate(mutation["candidate"])
        invariants = {
            failure["invariant"] for failure in mutation_report.get("failures", [])
        }
        if (
            mutation_report["status"] != "REJECTED"
            or mutation["expectedInvariant"] not in invariants
        ):
            raise RuntimeError(f"critical mutation escaped: {mutation['id']}")
        detected.append(str(mutation["id"]))

    execution = outcome.execution
    assert execution is not None
    verification = outcome.verification
    assert verification is not None
    verifier_payload = {
        "schemaVersion": "1",
        "status": "VERIFIED",
        "verifiedInvariants": verification["verifiedInvariants"],
        "limitations": verification["limitations"],
        "mutationDetection": {"detected": len(detected), "total": len(detected)},
        "mutations": detected,
        "resultHash": outcome.result["resultHash"],
    }
    verifier_report = {**verifier_payload, "reportHash": sha256_json(verifier_payload)}
    public_payload = {
        "schemaVersion": "1",
        "status": "PASSED",
        "command": "python /workspace/public_tests.py",
        "exitCode": execution.exit_code,
        "durationMs": execution.duration_ms,
        "stdout": execution.stdout_excerpt,
        "stderr": execution.stderr_excerpt,
    }
    public_report = {**public_payload, "reportHash": sha256_json(public_payload)}
    lab_payload = {
        "schemaVersion": "1",
        "status": "VERIFIED",
        "sessionId": session_id,
        "image": image,
        "planHash": _sha256(workspace / "experiment-plan.json"),
        "adapterHash": _sha256(workspace / "artifact-adapter.py"),
        "publicTestsHash": _sha256(workspace / "public_tests.py"),
        "publicTestsReportHash": public_report["reportHash"],
        "externalVerifierReportHash": verifier_report["reportHash"],
        "resultHash": outcome.result["resultHash"],
        "resourceEvidence": execution.evidence,
    }
    lab_report = {**lab_payload, "reportHash": sha256_json(lab_payload)}
    _write(run_directory / "verified-result.json", outcome.result)
    _write(run_directory / "public-tests-report.json", public_report)
    _write(run_directory / "external-verifier-report.json", verifier_report)
    _write(run_directory / "lab-verification.json", lab_report)
    print(
        f"VERIFIED {session_id}: {outcome.result['resultHash']} "
        f"({len(detected)}/{len(detected)} critical mutations detected)"
    )
    return True


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="verify-live-lab")
    parser.add_argument("run_directory", type=Path)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--image", default="counterlab-runner:local")
    return parser


if __name__ == "__main__":
    arguments = _parser().parse_args()
    raise SystemExit(
        0 if verify(arguments.root, arguments.run_directory, arguments.image) else 1
    )
