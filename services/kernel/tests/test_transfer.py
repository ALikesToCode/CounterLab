from __future__ import annotations

import json
from pathlib import Path

import pytest

from counterlab_kernel.transfer import (
    evaluate_forecasting_transfer,
    get_forecasting_transfer_task,
)


ROOT = Path(__file__).resolve().parents[3]


def test_forecasting_transfer_task_uses_fixed_surface_different_choices() -> None:
    first = get_forecasting_transfer_task()
    second = get_forecasting_transfer_task()

    assert first == second
    assert first is not second
    assert first["schemaVersion"] == "1"
    assert first["concept"] == "future_leakage"
    assert "forecast" in first["scenario"].lower()
    assert {choice["id"] for choice in first["strategyChoices"]} == {
        "random_row_holdout",
        "time_ordered_holdout",
        "grouped_store_holdout",
    }
    assert {choice["id"] for choice in first["riskChoices"]} == {
        "centered_window_reads_future",
        "model_is_too_simple",
        "stores_have_different_scales",
    }
    assert {chip["id"] for chip in first["evidenceChips"]} >= {
        "center_true_uses_later_targets",
        "random_split_mixes_dates",
    }
    assert all("correct" not in choice for choice in first["strategyChoices"])
    assert all("correct" not in choice for choice in first["riskChoices"])


def test_public_transfer_task_matches_fixed_evaluator_contract() -> None:
    public_task = json.loads(
        (ROOT / "concept-packs/leakage/transfer/task.json").read_text(
            encoding="utf-8"
        )
    )

    assert public_task == get_forecasting_transfer_task()


def test_transfer_passes_only_for_time_aware_strategy_and_future_risk_evidence() -> None:
    result = evaluate_forecasting_transfer(
        strategy_choice="time_ordered_holdout",
        risk_choice="centered_window_reads_future",
        evidence_choices=[
            "center_true_uses_later_targets",
            "random_split_mixes_dates",
        ],
    )

    assert result["schemaVersion"] == "1"
    assert result["status"] == "VERIFIED"
    assert result["outcome"] == "TRANSFER_PASSED"
    assert result["passed"] is True
    assert result["patchUnlocked"] is True
    assert all(check["passed"] for check in result["checks"])
    assert len(result["resultHash"]) == 64


@pytest.mark.parametrize(
    ("strategy", "risk", "evidence"),
    [
        (
            "random_row_holdout",
            "centered_window_reads_future",
            ["center_true_uses_later_targets", "random_split_mixes_dates"],
        ),
        (
            "time_ordered_holdout",
            "model_is_too_simple",
            ["center_true_uses_later_targets", "random_split_mixes_dates"],
        ),
        (
            "time_ordered_holdout",
            "centered_window_reads_future",
            ["random_split_mixes_dates"],
        ),
    ],
)
def test_transfer_failure_keeps_patch_locked(
    strategy: str, risk: str, evidence: list[str]
) -> None:
    result = evaluate_forecasting_transfer(
        strategy_choice=strategy,
        risk_choice=risk,
        evidence_choices=evidence,
    )

    assert result["status"] == "VERIFIED"
    assert result["outcome"] == "TRANSFER_FAILED"
    assert result["passed"] is False
    assert result["patchUnlocked"] is False
    assert any(not check["passed"] for check in result["checks"])


def test_transfer_rejects_ids_outside_the_fixed_choices() -> None:
    with pytest.raises(ValueError, match="unknown strategy choice"):
        evaluate_forecasting_transfer(
            strategy_choice="llm_decides",
            risk_choice="centered_window_reads_future",
            evidence_choices=[
                "center_true_uses_later_targets",
                "random_split_mixes_dates",
            ],
        )
