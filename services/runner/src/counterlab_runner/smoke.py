from __future__ import annotations

import argparse
import json
import os
import shutil
from pathlib import Path
from typing import Sequence

from .docker import (
    DockerAdapterExecutor,
    bind_contained_runtime_adapter,
    create_repository_work_directory,
    require_trusted_repository_root,
)
from .pipeline import HostCompileVerifyPipeline
from .workspace import create_fresh_workspace


def is_expected_contained_unqualified(report: dict[str, object]) -> bool:
    failures = report.get("failures")
    if report.get("status") != "REJECTED" or not isinstance(failures, list):
        return False
    if len(failures) != 1 or not isinstance(failures[0], dict):
        return False
    failure = failures[0]
    return (
        failure.get("invariant") == "runner_enforcement"
        and failure.get("observed")
        == {
            "publicMountsOnly": True,
            "limitsEnforced": False,
            "aggregateLimitsEnforced": False,
        }
        and failure.get("expected")
        == {
            "publicMountsOnly": True,
            "limitsEnforced": True,
            "aggregateLimitsEnforced": True,
        }
    )


def run_smoke(root: Path, image: str) -> dict[str, object]:
    root = require_trusted_repository_root(root)
    docker_bin = os.environ.get("COUNTERLAB_DOCKER_BIN", "docker")
    contained_runtime_adapter = bind_contained_runtime_adapter(root, docker_bin)
    contained_runtime_session_id = (
        os.environ.get("COUNTERLAB_RUNTIME_SESSION_ID")
        if contained_runtime_adapter is not None
        else None
    )
    public = root / "concept-packs/leakage/public"
    fixture = root / "fixtures/public/customer_churn.csv"
    temporary_root = create_repository_work_directory(root, "sandbox-smoke")
    generated_root = temporary_root / "generated"
    workspace = create_fresh_workspace(generated_root, "smoke-session")
    shutil.copy2(
        public / "sample-experiment-plan.json",
        workspace / "experiment-plan.json",
    )
    shutil.copy2(
        public / "artifact-adapter.template.py",
        workspace / "artifact-adapter.py",
    )
    shutil.copy2(
        public / "public_tests.template.py", workspace / "public_tests.py"
    )
    outcome = HostCompileVerifyPipeline(
        generated_root=generated_root,
        fixture_path=fixture,
        executor=DockerAdapterExecutor(
            image=image,
            docker_bin=docker_bin,
            contained_runtime_adapter=contained_runtime_adapter,
            contained_runtime_session_id=contained_runtime_session_id,
        ),
        run_root=temporary_root / "runs",
    )(workspace)
    return {
        "status": outcome.status,
        "resultHash": None
        if outcome.result is None
        else outcome.result.get("resultHash"),
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


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="counterlab-sandbox-smoke")
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--image", default="counterlab-runner:local")
    parser.add_argument("--expect-contained-unqualified", action="store_true")
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    report = run_smoke(arguments.root, arguments.image)
    print(json.dumps(report, indent=2, sort_keys=True))
    if arguments.expect_contained_unqualified:
        return 0 if is_expected_contained_unqualified(report) else 1
    return 0 if report["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
