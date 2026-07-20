"""Fixed manufacturing transfer task for the class-imbalance concept."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .canonical import sha256_json


_TASK: dict[str, Any] = {
    "schemaVersion": "1",
    "id": "manufacturing-defect-transfer-01",
    "concept": "class_imbalance_transfer",
    "title": "Would this inspection model catch rare defects?",
    "scenario": (
        "A factory evaluated 20,000 parts, including 200 defective parts. The "
        "model predicted every part as acceptable and reports 99% accuracy. "
        "Decide whether that evidence supports deployment and select the evidence "
        "needed to evaluate the rare defective class."
    ),
    "resultExcerpt": (
        "accuracy = 0.99\nconfusion_matrix = [[19800, 0], [200, 0]]"
    ),
    "decisionChoices": [
        {
            "id": "approve_high_accuracy",
            "label": "Approve because accuracy is 99%",
            "description": "Treat overall correctness as sufficient evidence.",
        },
        {
            "id": "reject_accuracy_only",
            "label": "Reject the accuracy-only conclusion",
            "description": (
                "Check performance on defective parts and choose a decision "
                "threshold based on the cost of missed defects."
            ),
        },
        {
            "id": "collect_more_negatives",
            "label": "Collect only more acceptable parts",
            "description": "Increase the already dominant negative class.",
        },
    ],
    "metricChoices": [
        {
            "id": "accuracy",
            "label": "Accuracy only",
            "description": "Report the fraction of all parts classified correctly.",
        },
        {
            "id": "recall_and_pr_auc",
            "label": "Defect recall and PR-AUC",
            "description": (
                "Measure recovered defects and ranking quality relative to the "
                "rare-class base rate."
            ),
        },
        {
            "id": "negative_specificity",
            "label": "Acceptable-part specificity",
            "description": "Measure only performance on the dominant class.",
        },
    ],
    "evidenceChips": [
        {
            "id": "zero_true_positives",
            "label": "The confusion matrix has zero true positives",
            "excerpt": "defective row: [200 missed, 0 caught]",
        },
        {
            "id": "rare_base_rate",
            "label": "Defects are only 1% of evaluated parts",
            "excerpt": "200 / 20,000 = 0.01 prevalence",
        },
        {
            "id": "many_true_negatives",
            "label": "19,800 acceptable parts were classified correctly",
            "excerpt": "acceptable row: [19,800 correct, 0 false alarms]",
        },
    ],
}

_CORRECT_DECISION = "reject_accuracy_only"
_CORRECT_METRIC = "recall_and_pr_auc"
_REQUIRED_EVIDENCE = frozenset({"zero_true_positives", "rare_base_rate"})


def get_manufacturing_transfer_task() -> dict[str, Any]:
    """Return an isolated copy of the surface-different fixed task."""

    return deepcopy(_TASK)


def _choice_ids(key: str) -> set[str]:
    return {str(choice["id"]) for choice in _TASK[key]}


def evaluate_manufacturing_transfer(
    *,
    decision_choice: str,
    metric_choice: str,
    evidence_choices: list[str],
) -> dict[str, Any]:
    """Score fixed choices without model-authored grading."""

    if decision_choice not in _choice_ids("decisionChoices"):
        raise ValueError(f"unknown decision choice: {decision_choice}")
    if metric_choice not in _choice_ids("metricChoices"):
        raise ValueError(f"unknown metric choice: {metric_choice}")
    if len(set(evidence_choices)) != len(evidence_choices):
        raise ValueError("duplicate evidence choice")
    unknown_evidence = sorted(
        set(evidence_choices).difference(_choice_ids("evidenceChips"))
    )
    if unknown_evidence:
        raise ValueError(
            f"unknown evidence choice: {', '.join(unknown_evidence)}"
        )
    selected = set(evidence_choices)
    checks = [
        {
            "id": "ACCURACY_CLAIM_REJECTED",
            "passed": decision_choice == _CORRECT_DECISION,
            "feedback": (
                "Overall accuracy cannot support deployment when the classifier "
                "misses every rare defective part."
            ),
        },
        {
            "id": "MINORITY_METRICS_SELECTED",
            "passed": metric_choice == _CORRECT_METRIC,
            "feedback": (
                "Defect recall and PR-AUC expose performance on the rare class "
                "and relative to its base rate."
            ),
        },
        {
            "id": "EVIDENCE_GROUNDED",
            "passed": _REQUIRED_EVIDENCE.issubset(selected),
            "feedback": (
                "Use both the zero true-positive count and the 1% base rate as "
                "evidence."
            ),
        },
    ]
    passed = all(bool(check["passed"]) for check in checks)
    result: dict[str, Any] = {
        "schemaVersion": "1",
        "taskId": _TASK["id"],
        "status": "VERIFIED",
        "outcome": "TRANSFER_PASSED" if passed else "TRANSFER_FAILED",
        "passed": passed,
        "patchUnlocked": passed,
        "submission": {
            "decisionChoice": decision_choice,
            "metricChoice": metric_choice,
            "evidenceChoices": sorted(selected),
        },
        "checks": checks,
        "limitations": [
            "This fixed evaluator verifies one manufacturing scenario; it does not establish general mastery or choose a production threshold."
        ],
    }
    result["resultHash"] = sha256_json(result)
    return result


__all__ = [
    "evaluate_manufacturing_transfer",
    "get_manufacturing_transfer_task",
]
