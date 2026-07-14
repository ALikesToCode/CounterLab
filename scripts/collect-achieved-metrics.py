#!/usr/bin/env python3
"""Generate achieved metrics by executing the fixed kernel and verifier."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from counterlab_kernel.canonical import canonical_json
from counterlab_kernel.experiment import run_leakage_experiment
from counterlab_kernel.verifier import critical_mutations, verify_candidate


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    frame = pd.read_csv(ROOT / "fixtures/public/customer_churn.csv")
    result = run_leakage_experiment(frame, seed=1729)
    runs = {run["id"]: run for run in result["runs"]}

    detected = 0
    mutations = critical_mutations(result)
    for mutation in mutations:
        report = verify_candidate(mutation["candidate"])
        failed = {failure["invariant"] for failure in report["failures"]}
        if report["status"] == "REJECTED" and mutation["expectedInvariant"] in failed:
            detected += 1

    compiler = json.loads(
        (ROOT / "replays/leakage-01/compiler/index.json").read_text(encoding="utf-8")
    )
    verifier = json.loads(
        (
            ROOT
            / "replays/leakage-01/compiler/verified-live-run/external-verifier-report.json"
        ).read_text(encoding="utf-8")
    )
    patch = json.loads(
        (ROOT / "replays/leakage-01/patch-verification.json").read_text(
            encoding="utf-8"
        )
    )
    payload = {
        "schemaVersion": "1",
        "source": "executed-fixed-kernel-and-checked-replay-evidence",
        "fixture": {
            "rows": len(frame),
            "customers": int(frame["customer_id"].nunique()),
            "seed": 1729,
        },
        "kernel": {
            "resultHash": result["resultHash"],
            "randomAccuracy": runs["random_row_split"]["metrics"]["accuracy"],
            "groupAccuracy": runs["customer_group_split"]["metrics"]["accuracy"],
            "identityAblationAccuracy": runs["identity_ablation"]["metrics"][
                "accuracy"
            ],
            "randomMinusGroupAccuracy": round(
                runs["random_row_split"]["metrics"]["accuracy"]
                - runs["customer_group_split"]["metrics"]["accuracy"],
                12,
            ),
            "groupEntityOverlap": runs["customer_group_split"]["entityOverlap"],
        },
        "mutationBenchmark": {
            "detected": detected,
            "total": len(mutations),
            "rate": detected / len(mutations),
        },
        "liveCodexReplay": {
            "modelId": compiler["modelId"],
            "rejectedRun": compiler["rejectedLiveRun"]["status"],
            "rejectedRepairAttempts": compiler["rejectedLiveRun"][
                "repairAttempts"
            ],
            "verifiedRun": compiler["verifiedLiveRun"]["status"],
            "verifiedInvariants": len(verifier["verifiedInvariants"]),
            "generationIsolation": compiler["generationIsolation"]["status"],
        },
        "patch": {
            "status": patch["status"],
            "unchangedCellCount": len(patch["unrelatedCellSourceHashes"]),
            "groupEntityOverlap": patch["correctedResult"]["entityOverlap"],
        },
        "excludedClaims": [
            "No learner-study outcome was measured.",
            "No global mastery or formal sandbox proof is claimed.",
        ],
    }
    destination = ROOT / "docs/ACHIEVED_METRICS.json"
    destination.write_text(f"{canonical_json(payload)}\n", encoding="utf-8")
    print(
        f"wrote {destination.relative_to(ROOT)}: {detected}/{len(mutations)} "
        f"mutations, result {result['resultHash']}"
    )


if __name__ == "__main__":
    main()
