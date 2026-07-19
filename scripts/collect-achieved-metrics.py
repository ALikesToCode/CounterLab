#!/usr/bin/env python3
"""Generate achieved metrics by executing the fixed kernel and verifier."""

from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

from counterlab_kernel.canonical import canonical_json
from counterlab_kernel.experiment import run_leakage_experiment
from counterlab_kernel.imbalance import run_imbalance_experiment
from counterlab_kernel.imbalance_verifier import (
    critical_imbalance_mutations,
    verify_imbalance_candidate,
)
from counterlab_kernel.verifier import critical_mutations, verify_candidate


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    arguments = sys.argv[1:]
    if arguments not in ([], ["--check"]):
        raise SystemExit("Usage: collect-achieved-metrics.py [--check]")
    check_only = arguments == ["--check"]

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

    imbalance_frame = pd.read_csv(ROOT / "fixtures/public/fraud_rare_event.csv")
    imbalance_result = run_imbalance_experiment(imbalance_frame, seed=2603)
    imbalance_runs = {
        run["operation"]: run for run in imbalance_result["runs"]
    }
    imbalance_detected = 0
    imbalance_mutations = critical_imbalance_mutations(imbalance_result)
    for mutation in imbalance_mutations:
        report = verify_imbalance_candidate(mutation["candidate"])
        failed = {failure["invariant"] for failure in report["failures"]}
        if (
            report["status"] == "REJECTED"
            and mutation["expectedInvariant"] in failed
        ):
            imbalance_detected += 1

    held_out = json.loads(
        (ROOT / "docs/HELD_OUT_RESULTS.json").read_text(encoding="utf-8")
    )

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
        "imbalance": {
            "fixture": {
                "rows": len(imbalance_frame),
                "positives": int(imbalance_frame["fraud"].sum()),
                "prevalence": float(imbalance_frame["fraud"].mean()),
                "seed": 2603,
            },
            "resultHash": imbalance_result["resultHash"],
            "majorityAccuracy": imbalance_runs[
                "imbalance.majority_baseline"
            ]["metrics"]["accuracy"],
            "majorityRecall": imbalance_runs[
                "imbalance.majority_baseline"
            ]["metrics"]["recall"],
            "stratifiedPrAuc": imbalance_runs[
                "imbalance.stratified_holdout"
            ]["metrics"]["prAuc"],
            "lowerThresholdRecall": imbalance_runs[
                "imbalance.threshold_sweep"
            ]["metrics"]["recall"],
            "mutationBenchmark": {
                "detected": imbalance_detected,
                "total": len(imbalance_mutations),
                "rate": imbalance_detected / len(imbalance_mutations),
            },
        },
        "heldOut": {
            "benchmarkId": held_out["benchmarkId"],
            "intakePassed": held_out["summary"]["passed"],
            "intakeTotal": held_out["summary"]["total"],
            "fixedCompletionPassed": held_out["summary"][
                "supportedCompletion"
            ]["passed"],
            "fixedCompletionTotal": held_out["summary"][
                "supportedCompletion"
            ]["total"],
            "planSource": "deterministic_contract_probe",
            "humanReview": "PENDING",
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
    rendered = f"{canonical_json(payload)}\n"
    if check_only:
        if destination.read_text(encoding="utf-8") != rendered:
            raise RuntimeError(
                "Executed metrics no longer match docs/ACHIEVED_METRICS.json"
            )
    else:
        destination.write_text(rendered, encoding="utf-8")
    print(
        f"{'verified' if check_only else 'wrote'} "
        f"{destination.relative_to(ROOT)}: {detected}/{len(mutations)} "
        f"leakage mutations and {imbalance_detected}/{len(imbalance_mutations)} "
        f"imbalance mutations, result {result['resultHash']}"
    )


if __name__ == "__main__":
    main()
