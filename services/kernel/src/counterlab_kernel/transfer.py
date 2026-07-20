"""Fixed, LLM-independent transfer task for the leakage learning loop."""

from __future__ import annotations

from copy import deepcopy
from typing import Any

from .canonical import sha256_json


_TRANSFER_TASK: dict[str, Any] = {
    "schemaVersion": "1",
    "id": "forecasting-future-leakage-01",
    "concept": "future_leakage",
    "title": "Will this demand forecast work next month?",
    "scenario": (
        "A retail forecasting notebook predicts daily demand. It builds a centered "
        "seven-day target average and evaluates with a shuffled random row holdout. "
        "Choose an evaluation strategy and identify the evidence that could make the "
        "reported error optimistic."
    ),
    "codeExcerpt": (
        "df['demand_7d_centered'] = "
        "df.groupby('store_id')['demand'].transform("
        "lambda values: values.rolling(7, center=True).mean())\n"
        "train, test = train_test_split(df, test_size=0.2, random_state=1729, "
        "shuffle=True)"
    ),
    "strategyChoices": [
        {
            "id": "random_row_holdout",
            "label": "Keep a shuffled row holdout",
            "description": "Randomly reserve rows from across the full date range.",
        },
        {
            "id": "time_ordered_holdout",
            "label": "Train on earlier dates; test on later dates",
            "description": (
                "Choose a cutoff, fit only on observations before it, and evaluate "
                "only on later observations."
            ),
        },
        {
            "id": "grouped_store_holdout",
            "label": "Hold out complete stores",
            "description": (
                "Reserve some stores but continue mixing earlier and later dates."
            ),
        },
    ],
    "riskChoices": [
        {
            "id": "centered_window_reads_future",
            "label": "The centered target window reads later demand",
            "description": (
                "A centered rolling target feature can include observations after "
                "the row being predicted."
            ),
        },
        {
            "id": "model_is_too_simple",
            "label": "The model is not complex enough",
            "description": "The estimator may underfit nonlinear demand patterns.",
        },
        {
            "id": "stores_have_different_scales",
            "label": "Stores sell at different volumes",
            "description": "Demand magnitudes vary across store locations.",
        },
    ],
    "evidenceChips": [
        {
            "id": "center_true_uses_later_targets",
            "label": "`center=True` spans both sides of each date",
            "excerpt": "rolling(7, center=True).mean() over the target column",
        },
        {
            "id": "random_split_mixes_dates",
            "label": "The split shuffles dates",
            "excerpt": "train_test_split(..., shuffle=True)",
        },
        {
            "id": "metric_is_mae",
            "label": "The report uses mean absolute error",
            "excerpt": "mean_absolute_error(y_test, prediction)",
        },
    ],
}

_CORRECT_STRATEGY = "time_ordered_holdout"
_CORRECT_RISK = "centered_window_reads_future"
_REQUIRED_EVIDENCE = frozenset(
    {"center_true_uses_later_targets", "random_split_mixes_dates"}
)


def get_forecasting_transfer_task() -> dict[str, Any]:
    """Return an isolated copy of the fixed forecasting transfer task."""

    return deepcopy(_TRANSFER_TASK)


def _choice_ids(key: str) -> set[str]:
    return {str(choice["id"]) for choice in _TRANSFER_TASK[key]}


def evaluate_forecasting_transfer(
    *,
    strategy_choice: str,
    risk_choice: str,
    evidence_choices: list[str],
) -> dict[str, Any]:
    """Evaluate fixed learner choices without consulting a model.

    Passing requires a chronological holdout, recognition of the centered target
    window, and both code-level evidence chips. A valid but incorrect submission
    is still ``VERIFIED`` as an evaluator outcome; it does not unlock a patch.
    """

    strategy_ids = _choice_ids("strategyChoices")
    risk_ids = _choice_ids("riskChoices")
    evidence_ids = _choice_ids("evidenceChips")
    if strategy_choice not in strategy_ids:
        raise ValueError(f"unknown strategy choice: {strategy_choice}")
    if risk_choice not in risk_ids:
        raise ValueError(f"unknown risk choice: {risk_choice}")
    if len(set(evidence_choices)) != len(evidence_choices):
        raise ValueError("duplicate evidence choice")
    unknown_evidence = sorted(set(evidence_choices).difference(evidence_ids))
    if unknown_evidence:
        raise ValueError(
            f"unknown evidence choice: {', '.join(unknown_evidence)}"
        )

    selected_evidence = set(evidence_choices)
    checks = [
        {
            "id": "TIME_AWARE_EVALUATION",
            "passed": strategy_choice == _CORRECT_STRATEGY,
            "feedback": (
                "A future holdout must preserve date order so training cannot see "
                "observations from the evaluation period."
            ),
        },
        {
            "id": "FUTURE_INFORMATION_RISK",
            "passed": risk_choice == _CORRECT_RISK,
            "feedback": (
                "The decisive risk is that the centered target window reads demand "
                "from later dates."
            ),
        },
        {
            "id": "EVIDENCE_GROUNDED",
            "passed": _REQUIRED_EVIDENCE.issubset(selected_evidence),
            "feedback": (
                "Ground the decision in both the centered target window and the "
                "shuffled date split."
            ),
        },
    ]
    passed = all(bool(check["passed"]) for check in checks)
    result: dict[str, Any] = {
        "schemaVersion": "1",
        "taskId": _TRANSFER_TASK["id"],
        "status": "VERIFIED",
        "outcome": "TRANSFER_PASSED" if passed else "TRANSFER_FAILED",
        "passed": passed,
        "patchUnlocked": passed,
        "submission": {
            "strategyChoice": strategy_choice,
            "riskChoice": risk_choice,
            "evidenceChoices": sorted(selected_evidence),
        },
        "checks": checks,
        "limitations": [
            "This fixed evaluator verifies choices for one forecasting scenario; "
            "it does not establish general mastery."
        ],
    }
    result["resultHash"] = sha256_json(result)
    return result
