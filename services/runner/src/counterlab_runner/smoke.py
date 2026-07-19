from __future__ import annotations

import argparse
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Sequence

from .docker import DockerAdapterExecutor
from .pipeline import HostCompileVerifyPipeline
from .workspace import create_fresh_workspace


def run_smoke(root: Path, image: str) -> dict[str, object]:
    root = root.resolve(strict=True)
    public = root / "concept-packs/leakage/public"
    fixture = root / "fixtures/public/customer_churn.csv"
    with tempfile.TemporaryDirectory(prefix="counterlab-sandbox-") as temporary:
        temporary_root = Path(temporary)
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
                docker_bin=os.environ.get("COUNTERLAB_DOCKER_BIN", "docker"),
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
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    arguments = _parser().parse_args(argv)
    report = run_smoke(arguments.root, arguments.image)
    print(json.dumps(report, indent=2, sort_keys=True))
    return 0 if report["status"] == "VERIFIED" else 1


if __name__ == "__main__":
    raise SystemExit(main())
