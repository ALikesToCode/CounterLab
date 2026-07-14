#!/usr/bin/env python3
"""Materialize the verified transfer and patch artifacts for replay leakage-01."""

from __future__ import annotations

from pathlib import Path

from counterlab_kernel.canonical import canonical_json
from counterlab_kernel.patching import (
    compile_sample_notebook_patch,
    verify_sample_notebook_patch,
)
from counterlab_kernel.transfer import evaluate_forecasting_transfer


ROOT = Path(__file__).resolve().parents[1]
REPLAY = ROOT / "replays" / "leakage-01"
PATCH_DIR = REPLAY / "patch"
ORIGINAL = ROOT / "fixtures" / "notebooks" / "customer_churn_leakage.ipynb"
FIXTURE = ROOT / "fixtures" / "public" / "customer_churn.csv"


def write_json(path: Path, payload: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"{canonical_json(payload)}\n", encoding="utf-8")


def main() -> None:
    transfer = evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )
    write_json(REPLAY / "transfer-kernel-result.json", transfer)

    compiled = compile_sample_notebook_patch(
        original_notebook=ORIGINAL,
        fixture_csv=FIXTURE,
        output_dir=PATCH_DIR,
        transfer_result=transfer,
    )
    if compiled.get("status") != "VERIFIED":
        raise SystemExit(f"sample patch compilation failed: {compiled}")

    patched = PATCH_DIR / "customer_churn_leakage.patched.ipynb"
    verification = verify_sample_notebook_patch(
        original_notebook=ORIGINAL,
        candidate_notebook=patched,
        fixture_csv=FIXTURE,
    )
    if verification.get("status") != "VERIFIED":
        raise SystemExit(f"sample patch verification failed: {verification}")
    write_json(REPLAY / "patch-verification.json", verification)

    portable = {
        key: value
        for key, value in compiled.items()
        if key not in {"patchPath", "metadataPath"}
    }
    portable["patchFile"] = str(patched.relative_to(ROOT))
    portable["metadataFile"] = str(
        (PATCH_DIR / "customer_churn_leakage.patch.json").relative_to(ROOT)
    )
    write_json(REPLAY / "patch-kernel-result.json", portable)
    print(
        "materialized leakage-01 transfer and patch "
        f"({portable['patchedSha256']})"
    )


if __name__ == "__main__":
    main()
