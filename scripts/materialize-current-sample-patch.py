#!/usr/bin/env python3
"""Materialize additive source-bound Repair evidence for the current sample."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

from counterlab_kernel.canonical import canonical_json
from counterlab_kernel.patching import (
    compile_sample_notebook_patch,
    verify_sample_notebook_patch,
)
from counterlab_kernel.transfer import evaluate_forecasting_transfer


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures/public/leakage_sample_patch_v1"
ORIGINAL = ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb"
FIXTURE = ROOT / "fixtures/public/customer_churn.csv"
AUTHORITY_JSON_FILES = (
    "customer_churn_leakage.patch.json",
    "patch-kernel-result.json",
    "patch-verification.json",
    "transfer-result.json",
)


def write_json(path: Path, payload: object) -> None:
    path.write_text(f"{canonical_json(payload)}\n", encoding="utf-8")


def canonicalize_existing_output() -> None:
    if OUTPUT.is_symlink() or not OUTPUT.is_dir():
        raise SystemExit("current sample patch output is not a regular directory")
    for name in AUTHORITY_JSON_FILES:
        path = OUTPUT / name
        if path.is_symlink() or not path.is_file():
            raise SystemExit(f"current sample patch authority is invalid: {name}")
        write_json(path, json.loads(path.read_text(encoding="utf-8")))


def main() -> None:
    if sys.argv[1:] == ["--canonicalize-existing"]:
        canonicalize_existing_output()
        print("canonicalized existing current sample patch authority JSON")
        return
    if sys.argv[1:]:
        raise SystemExit(
            "Usage: materialize-current-sample-patch.py [--canonicalize-existing]"
        )
    if OUTPUT.exists():
        raise SystemExit(
            "current sample patch output already exists; refusing to overwrite it"
        )
    transfer = evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )
    compiled = compile_sample_notebook_patch(
        original_notebook=ORIGINAL,
        fixture_csv=FIXTURE,
        output_dir=OUTPUT,
        transfer_result=transfer,
    )
    if compiled.get("status") != "VERIFIED":
        raise SystemExit(f"current sample patch compilation failed: {compiled}")

    patched_path = OUTPUT / "customer_churn_leakage.patched.ipynb"
    verification = verify_sample_notebook_patch(
        original_notebook=ORIGINAL,
        candidate_notebook=patched_path,
        fixture_csv=FIXTURE,
    )
    if verification.get("status") != "VERIFIED":
        raise SystemExit(f"current sample patch verification failed: {verification}")

    portable: dict[str, Any] = {
        key: value
        for key, value in compiled.items()
        if key not in {"patchPath", "metadataPath"}
    }
    portable["patchFile"] = str(patched_path.relative_to(ROOT))
    portable["metadataFile"] = str(
        (OUTPUT / "customer_churn_leakage.patch.json").relative_to(ROOT)
    )
    write_json(OUTPUT / "transfer-result.json", transfer)
    write_json(OUTPUT / "patch-verification.json", verification)
    write_json(OUTPUT / "patch-kernel-result.json", portable)
    print(
        "materialized current sample patch "
        f"source={portable['originalSha256']} patched={portable['patchedSha256']}"
    )


if __name__ == "__main__":
    main()
