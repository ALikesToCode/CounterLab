#!/usr/bin/env python3
"""Reproduce the checked-in leakage-01 result from its bounded contract."""

from __future__ import annotations

import argparse
from copy import deepcopy
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Sequence

from counterlab_kernel.verifier import critical_mutations, verify_candidate
from counterlab_runner.docker import DockerAdapterExecutor
from counterlab_runner.pipeline import HostCompileVerifyPipeline
from counterlab_runner.workspace import create_fresh_workspace


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_HASH = "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0"


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reproduce the checked-in leakage-01 bounded contract"
    )
    parser.add_argument(
        "--image",
        default=os.environ.get("COUNTERLAB_SANDBOX_IMAGE", "counterlab-runner:local"),
        help="existing generated-adapter runner image to execute",
    )
    return parser.parse_args(argv)


def _semantic_projection(result: dict[str, object]) -> dict[str, object]:
    projected = deepcopy(result)
    projected.pop("resultHash", None)
    runs = projected.get("runs")
    if not isinstance(runs, list):
        raise ValueError("result runs are missing")
    for run in runs:
        if not isinstance(run, dict):
            raise ValueError("result run is invalid")
        run.pop("featureSetFingerprint", None)
        run.pop("pipelineFingerprint", None)
    return projected


def assert_semantic_compatibility(
    archived: dict[str, object], current: dict[str, object]
) -> None:
    if _semantic_projection(archived) != _semantic_projection(current):
        raise ValueError("semantic result changed across the kernel provenance upgrade")


def main(argv: Sequence[str] | None = None) -> None:
    arguments = parse_arguments(argv)
    replay = ROOT / "replays/leakage-01"
    archived_result = json.loads(
        (replay / "compiler/verified-live-run/verified-result.json").read_text(
            encoding="utf-8"
        )
    )
    if not isinstance(archived_result, dict):
        raise SystemExit("archived replay result is invalid")
    if archived_result.get("resultHash") != EXPECTED_HASH:
        raise SystemExit("archived canonical result hash changed")
    if verify_candidate(archived_result)["status"] != "VERIFIED":
        raise SystemExit("archived replay result no longer validates")
    candidate = replay / "compiler/verified-live-run/final-candidate"
    with tempfile.TemporaryDirectory(prefix="counterlab-reproduce-") as temporary:
        temporary_root = Path(temporary)
        generated = temporary_root / "generated"
        workspace = create_fresh_workspace(generated, "leakage-01")
        for name in (
            "experiment-plan.json",
            "artifact-adapter.py",
            "public_tests.py",
        ):
            shutil.copy2(candidate / name, workspace / name)
        outcome = HostCompileVerifyPipeline(
            generated_root=generated,
            fixture_path=ROOT / "fixtures/public/customer_churn.csv",
            executor=DockerAdapterExecutor(
                image=arguments.image,
                docker_bin=os.environ.get("COUNTERLAB_DOCKER_BIN", "docker"),
            ),
            run_root=temporary_root / "runs",
        )(workspace)
    if outcome.status != "VERIFIED" or outcome.result is None:
        raise SystemExit(f"live replay candidate did not reproduce: {outcome.failures}")
    try:
        assert_semantic_compatibility(archived_result, outcome.result)
    except ValueError as error:
        raise SystemExit(str(error)) from error

    detected = 0
    mutations = critical_mutations(archived_result)
    for mutation in mutations:
        report = verify_candidate(mutation["candidate"])
        failed = {failure["invariant"] for failure in report["failures"]}
        detected += int(
            report["status"] == "REJECTED"
            and mutation["expectedInvariant"] in failed
        )
    if detected != len(mutations):
        raise SystemExit(f"mutation benchmark regressed: {detected}/{len(mutations)}")

    from replay_patch import verify_replay_patch

    patch_report = verify_replay_patch(ROOT)
    print(
        f"REPRODUCED leakage-01 archived={EXPECTED_HASH} "
        f"current={outcome.result['resultHash']} · {detected}/{len(mutations)} "
        f"mutations · patch {patch_report['status']}"
    )


if __name__ == "__main__":
    main()
