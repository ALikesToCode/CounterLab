from __future__ import annotations

import json
from pathlib import Path

import pytest

from counterlab_kernel.imbalance_transfer import (
    evaluate_manufacturing_transfer,
    get_manufacturing_transfer_task,
)


ROOT = Path(__file__).resolve().parents[3]


def test_public_manufacturing_task_matches_fixed_evaluator() -> None:
    public_task = json.loads(
        (ROOT / "concept-packs/imbalance/transfer/task.json").read_text(
            encoding="utf-8"
        )
    )
    assert public_task == get_manufacturing_transfer_task()
    assert public_task["concept"] == "class_imbalance_transfer"


def test_transfer_passes_only_with_minority_aware_metric_and_evidence() -> None:
    passed = evaluate_manufacturing_transfer(
        decision_choice="reject_accuracy_only",
        metric_choice="recall_and_pr_auc",
        evidence_choices=["zero_true_positives", "rare_base_rate"],
    )
    failed = evaluate_manufacturing_transfer(
        decision_choice="approve_high_accuracy",
        metric_choice="accuracy",
        evidence_choices=["many_true_negatives"],
    )

    assert passed["outcome"] == "TRANSFER_PASSED"
    assert passed["patchUnlocked"] is True
    assert failed["outcome"] == "TRANSFER_FAILED"
    assert failed["patchUnlocked"] is False
    assert passed["resultHash"] != failed["resultHash"]


def test_transfer_rejects_unknown_choice_ids() -> None:
    with pytest.raises(ValueError, match="unknown metric"):
        evaluate_manufacturing_transfer(
            decision_choice="reject_accuracy_only",
            metric_choice="made_up_metric",
            evidence_choices=["zero_true_positives"],
        )


def test_transfer_rejects_duplicate_evidence_ids() -> None:
    with pytest.raises(ValueError, match="duplicate evidence"):
        evaluate_manufacturing_transfer(
            decision_choice="reject_accuracy_only",
            metric_choice="recall_and_pr_auc",
            evidence_choices=[
                "zero_true_positives",
                "zero_true_positives",
            ],
        )
