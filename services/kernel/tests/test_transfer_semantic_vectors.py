from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

from counterlab_kernel import hosted_patch as hosted_patch_module
from counterlab_kernel.imbalance_transfer import (
    evaluate_manufacturing_transfer,
    get_manufacturing_transfer_task,
)
from counterlab_kernel.transfer import (
    evaluate_forecasting_transfer,
    get_forecasting_transfer_task,
)


ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads(
    (
        ROOT / "fixtures/transfer/counterlab-transfer-semantics-v1.json"
    ).read_text(encoding="utf-8")
)
PACKS = FIXTURE["packs"]
VECTOR_CASES = [
    (pack, vector) for pack in PACKS for vector in pack["vectors"]
]


def _ir_contracts() -> dict[str, dict[str, Any]]:
    return getattr(hosted_patch_module, "_TRANSFER_IR_CONTRACTS")


def _evaluator_policies() -> dict[str, dict[str, Any]]:
    return getattr(hosted_patch_module, "_V5_TRANSFER_POLICIES")


def _task_for(pack: dict[str, Any]) -> dict[str, Any]:
    if pack["submissionKind"] == "leakage":
        return get_forecasting_transfer_task()
    return get_manufacturing_transfer_task()


def _project_python_semantics(
    pack: dict[str, Any], vector: dict[str, Any]
) -> dict[str, Any]:
    submission = vector["input"]
    try:
        if pack["submissionKind"] == "leakage":
            result = evaluate_forecasting_transfer(
                strategy_choice=str(submission["strategyChoice"]),
                risk_choice=str(submission["riskChoice"]),
                evidence_choices=list(submission["evidenceChoices"]),
            )
            primary_choice = result["submission"]["strategyChoice"]
            secondary_choice = result["submission"]["riskChoice"]
        else:
            result = evaluate_manufacturing_transfer(
                decision_choice=str(submission["decisionChoice"]),
                metric_choice=str(submission["metricChoice"]),
                evidence_choices=list(submission["evidenceChoices"]),
            )
            primary_choice = result["submission"]["decisionChoice"]
            secondary_choice = result["submission"]["metricChoice"]
    except ValueError:
        return {"accepted": False}

    concept = str(pack["concept"])
    policy = _evaluator_policies()[concept]
    return {
        "accepted": True,
        "irTaskId": _ir_contracts()[concept]["taskId"],
        "evaluatorTaskId": result["taskId"],
        "evaluatorVersion": policy["evaluatorVersion"],
        "passed": result["passed"],
        "primaryChoice": primary_choice,
        "secondaryChoice": secondary_choice,
        "canonicalEvidence": result["submission"]["evidenceChoices"],
        "checks": {
            check["id"]: bool(check["passed"]) for check in result["checks"]
        },
    }


def _expected_projection(
    pack: dict[str, Any], vector: dict[str, Any]
) -> dict[str, Any]:
    expected = dict(vector["expected"])
    if expected["accepted"]:
        expected.update(pack["binding"])
    return expected


@pytest.mark.parametrize("pack", PACKS, ids=lambda pack: pack["concept"])
def test_transfer_binding_matches_ir_task_evaluator_task_and_version(
    pack: dict[str, Any],
) -> None:
    assert FIXTURE["schemaVersion"] == "1"
    assert (
        FIXTURE["normalizationProfile"]
        == "counterlab-transfer-semantic-projection-v1"
    )
    concept = pack["concept"]
    binding = pack["binding"]

    assert _task_for(pack)["id"] == binding["evaluatorTaskId"]
    assert _ir_contracts()[concept]["taskId"] == binding["irTaskId"]
    assert (
        _evaluator_policies()[concept]["taskId"]
        == binding["evaluatorTaskId"]
    )
    assert (
        _evaluator_policies()[concept]["evaluatorVersion"]
        == binding["evaluatorVersion"]
    )


@pytest.mark.parametrize(
    ("pack", "vector"),
    VECTOR_CASES,
    ids=[
        f"{pack['concept']}:{vector['id']}" for pack, vector in VECTOR_CASES
    ],
)
def test_python_evaluator_matches_shared_semantic_vector(
    pack: dict[str, Any], vector: dict[str, Any]
) -> None:
    assert _project_python_semantics(pack, vector) == _expected_projection(
        pack, vector
    )


@pytest.mark.parametrize("pack", PACKS, ids=lambda pack: pack["concept"])
def test_evidence_reordering_has_the_same_semantic_projection(
    pack: dict[str, Any],
) -> None:
    groups: dict[str, list[dict[str, Any]]] = {}
    for vector in pack["vectors"]:
        group = vector.get("equivalenceGroup")
        if group is not None:
            groups.setdefault(group, []).append(vector)

    assert groups
    assert all(len(vectors) >= 2 for vectors in groups.values())
    for vectors in groups.values():
        projections = [
            _project_python_semantics(pack, vector) for vector in vectors
        ]
        assert all(projection == projections[0] for projection in projections)
