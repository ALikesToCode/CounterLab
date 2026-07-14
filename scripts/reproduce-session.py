#!/usr/bin/env python3
"""Reproduce the checked-in leakage-01 result from its bounded contract."""

from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

from counterlab_kernel.patching import verify_sample_notebook_patch
from counterlab_kernel.verifier import critical_mutations, verify_candidate
from counterlab_runner.docker import DockerAdapterExecutor
from counterlab_runner.pipeline import HostCompileVerifyPipeline
from counterlab_runner.workspace import create_fresh_workspace


ROOT = Path(__file__).resolve().parents[1]
EXPECTED_HASH = "2501654264b9aa85b39fca944e585ff9b04263b83e182bc186d1f16464fee3b0"


def main() -> None:
    replay = ROOT / "replays/leakage-01"
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
            executor=DockerAdapterExecutor(image="counterlab-runner:local"),
            run_root=temporary_root / "runs",
        )(workspace)
    if outcome.status != "VERIFIED" or outcome.result is None:
        raise SystemExit(f"live replay candidate did not reproduce: {outcome.failures}")
    if outcome.result["resultHash"] != EXPECTED_HASH:
        raise SystemExit("canonical result hash changed")

    detected = 0
    mutations = critical_mutations(outcome.result)
    for mutation in mutations:
        report = verify_candidate(mutation["candidate"])
        failed = {failure["invariant"] for failure in report["failures"]}
        detected += int(
            report["status"] == "REJECTED"
            and mutation["expectedInvariant"] in failed
        )
    if detected != len(mutations):
        raise SystemExit(f"mutation benchmark regressed: {detected}/{len(mutations)}")

    patch_report = verify_sample_notebook_patch(
        original_notebook=ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb",
        candidate_notebook=replay / "patch/customer_churn_leakage.patched.ipynb",
        fixture_csv=ROOT / "fixtures/public/customer_churn.csv",
    )
    if patch_report["status"] != "VERIFIED":
        raise SystemExit(json.dumps(patch_report, sort_keys=True))
    print(
        f"REPRODUCED leakage-01 {EXPECTED_HASH} · {detected}/{len(mutations)} "
        "mutations · patch VERIFIED"
    )


if __name__ == "__main__":
    main()
