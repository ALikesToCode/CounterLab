from __future__ import annotations

from copy import deepcopy
import json
from pathlib import Path
from typing import Any

import pytest
from jsonschema import Draft202012Validator

from counterlab_kernel.boundary_map import (
    classify_imbalance_f1,
    classify_leakage_optimism_gap,
    compute_imbalance_boundary_map,
    compute_leakage_boundary_map,
)
from counterlab_kernel.canonical import sha256_json_browser


LINEAGE = {
    "session_id": "session_boundary_1",
    "concept_pack_version": "test-pack-v1",
    "artifact_manifest_hash": "a" * 64,
    "experiment_ir_hash": "b" * 64,
    "authoritative_result_hash": "c" * 64,
    "evidence_verdict_hash": "d" * 64,
}
BOUNDARY_RESULT_SCHEMA = json.loads(
    (
        Path(__file__).parents[1]
        / "src/counterlab_kernel/schemas/boundary-map-result-v1.schema.json"
    ).read_text(encoding="utf-8")
)


def _unsigned(result: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in result.items() if key != "resultHash"}


@pytest.mark.parametrize(
    ("gap", "classification"),
    [
        (0.10, "material"),
        (0.030000000001, "transition"),
        (0.03, "little"),
        (-0.2, "little"),
    ],
)
def test_leakage_classification_boundaries(
    gap: float, classification: str
) -> None:
    assert classify_leakage_optimism_gap(gap) == classification


@pytest.mark.parametrize(
    ("f1", "classification"),
    [
        (0.30, "strong"),
        (0.20, "tradeoff"),
        (0.199999999999, "weak"),
    ],
)
def test_imbalance_classification_boundaries(
    f1: float, classification: str
) -> None:
    assert classify_imbalance_f1(f1) == classification


@pytest.fixture(scope="module")
def leakage_map() -> dict[str, Any]:
    return compute_leakage_boundary_map(**LINEAGE)


@pytest.fixture(scope="module")
def imbalance_map() -> dict[str, Any]:
    return compute_imbalance_boundary_map(**LINEAGE)


def test_leakage_boundary_map_executes_the_fixed_grid(
    leakage_map: dict[str, Any],
) -> None:
    assert leakage_map["schemaVersion"] == "1"
    assert leakage_map["canonicalProfile"] == "counterlab-canonical-json-v1"
    assert leakage_map["concept"] == "entity_leakage"
    assert leakage_map["sweepId"] == "leakage-recurrence-sweep"
    assert leakage_map["gridPresetId"] == "leakage-boundary-grid-v1"
    assert [axis["id"] for axis in leakage_map["axes"]] == [
        "test_fraction",
        "observations_per_entity",
    ]
    assert [point["value"] for point in leakage_map["axes"][0]["points"]] == [
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
    ]
    assert [point["value"] for point in leakage_map["axes"][1]["points"]] == [
        1,
        2,
        3,
        4,
        6,
    ]
    assert len(leakage_map["cells"]) == 25

    coordinates = [
        (cell["coordinates"][0]["value"], cell["coordinates"][1]["value"])
        for cell in leakage_map["cells"]
    ]
    assert coordinates == [
        (test_fraction, observations)
        for test_fraction in (0.1, 0.2, 0.3, 0.4, 0.5)
        for observations in (1, 2, 3, 4, 6)
    ]


def test_leakage_boundary_cells_bind_real_fixed_kernel_runs(
    leakage_map: dict[str, Any],
) -> None:
    allowed_classes = {
        "material",
        "transition",
        "little",
    }
    observed_classes = set()
    observed_gaps = set()
    for cell in leakage_map["cells"]:
        assert cell["groupEntityOverlap"] == {"count": 0, "rate": 0}
        assert cell["optimismGap"] == round(
            cell["randomAccuracy"] - cell["groupAccuracy"], 12
        )
        assert cell["randomPipelineFingerprint"] == cell["groupPipelineFingerprint"]
        assert cell["sampleSizes"]["randomTest"] > 0
        assert cell["sampleSizes"]["groupTest"] > 0
        assert cell["classificationId"] in allowed_classes
        observed_classes.add(cell["classificationId"])
        observed_gaps.add(cell["optimismGap"])

    assert "material" in observed_classes
    assert "little" in observed_classes
    assert len(observed_gaps) > 5
    assert leakage_map["units"] == {"optimism_gap": "accuracy proportion"}
    assert set(leakage_map["cells"][0]) == {
        "cellId",
        "classificationId",
        "concept",
        "coordinates",
        "fixtureViewHash",
        "groupAccuracy",
        "groupEntityOverlap",
        "groupPipelineFingerprint",
        "optimismGap",
        "randomAccuracy",
        "randomEntityOverlap",
        "randomPipelineFingerprint",
        "sampleSizes",
    }


def test_imbalance_boundary_map_executes_fixed_scores_across_the_grid(
    imbalance_map: dict[str, Any],
) -> None:
    assert imbalance_map["schemaVersion"] == "1"
    assert imbalance_map["concept"] == "class_imbalance"
    assert imbalance_map["sweepId"] == "imbalance-threshold-prevalence-sweep"
    assert imbalance_map["gridPresetId"] == "imbalance-boundary-grid-v1"
    assert [axis["id"] for axis in imbalance_map["axes"]] == [
        "class_prevalence",
        "decision_threshold",
    ]
    assert [point["id"] for point in imbalance_map["axes"][0]["points"]] == [
        "rarer",
        "observed",
        "more_common",
    ]
    assert [point["value"] for point in imbalance_map["axes"][1]["points"]] == [
        0.1,
        0.2,
        0.3,
        0.4,
        0.5,
    ]
    assert len(imbalance_map["cells"]) == 15
    assert imbalance_map["nonClaims"] == [
        "The map does not select a production threshold or encode deployment costs.",
        "This bounded fixture does not establish utility for unrelated rare-event systems.",
    ]

    coordinates = [
        (
            cell["prevalenceScenario"],
            cell["coordinates"][1]["value"],
        )
        for cell in imbalance_map["cells"]
    ]
    assert coordinates == [
        (scenario, threshold)
        for scenario in ("rarer", "observed", "more_common")
        for threshold in (0.1, 0.2, 0.3, 0.4, 0.5)
    ]


def test_imbalance_boundary_cells_bind_kernel_metrics_and_classifications(
    imbalance_map: dict[str, Any],
) -> None:
    allowed_classes = {
        "strong",
        "tradeoff",
        "weak",
    }
    observed_classes = set()
    observed_f1 = set()
    predictions_by_scenario: dict[str, set[float]] = {}
    for cell in imbalance_map["cells"]:
        matrix = cell["confusion"]
        assert sum(matrix.values()) == cell["sampleSize"]
        assert cell["classificationId"] in allowed_classes
        observed_classes.add(cell["classificationId"])
        observed_f1.add(cell["metrics"]["f1"])
        predictions_by_scenario.setdefault(cell["prevalenceScenario"], set()).add(
            cell["predictedPositiveRate"]
        )

    assert observed_classes == allowed_classes
    assert len(observed_f1) > 5
    assert all(len(rates) > 1 for rates in predictions_by_scenario.values())
    prevalence_values = [
        point["value"] for point in imbalance_map["axes"][0]["points"]
    ]
    assert prevalence_values == sorted(prevalence_values)
    assert imbalance_map["units"] == {
        "f1": "proportion",
        "prevalence": "proportion",
        "threshold": "probability",
    }
    assert set(imbalance_map["cells"][0]) == {
        "cellId",
        "classificationId",
        "concept",
        "confusion",
        "coordinates",
        "metrics",
        "pipelineFingerprint",
        "predictedPositiveRate",
        "prevalence",
        "prevalenceScenario",
        "sampleSize",
        "scoreFingerprint",
        "threshold",
    }


@pytest.mark.parametrize(
    "compute,expected_cells",
    [
        (compute_leakage_boundary_map, 25),
        (compute_imbalance_boundary_map, 15),
    ],
)
def test_boundary_maps_are_deterministic_and_browser_canonical(
    compute: Any,
    expected_cells: int,
) -> None:
    first = compute(**LINEAGE)
    second = compute(**LINEAGE)

    assert len(first["cells"]) == expected_cells
    assert first == second
    assert first["resultHash"] == sha256_json_browser(_unsigned(first))


def test_boundary_maps_match_the_shared_runtime_schema(
    leakage_map: dict[str, Any], imbalance_map: dict[str, Any]
) -> None:
    validator = Draft202012Validator(BOUNDARY_RESULT_SCHEMA)
    validator.validate(leakage_map)
    validator.validate(imbalance_map)


@pytest.mark.parametrize(
    "compute,too_small_limit",
    [
        (compute_leakage_boundary_map, 24),
        (compute_imbalance_boundary_map, 14),
    ],
)
def test_boundary_map_cell_budget_fails_closed(
    compute: Any,
    too_small_limit: int,
) -> None:
    with pytest.raises(ValueError, match="cell limit"):
        compute(**LINEAGE, max_cells=too_small_limit)

    with pytest.raises(ValueError, match="between 1 and 2500"):
        compute(**LINEAGE, max_cells=2501)


@pytest.mark.parametrize(
    "overrides,expected_message",
    [
        ({"seed": -1}, "seed must be a non-negative integer"),
        ({"seed": True}, "seed must be a non-negative integer"),
        ({"max_cells": 25.5}, "max_cells must be an integer"),
    ],
)
def test_boundary_map_inputs_fail_closed(
    overrides: dict[str, Any], expected_message: str
) -> None:
    with pytest.raises(ValueError, match=expected_message):
        compute_leakage_boundary_map(**LINEAGE, **overrides)


@pytest.mark.parametrize(
    "mutation",
    ["swapped_axes", "missing_cell", "frozen_values"],
)
def test_boundary_map_hash_binds_mutation_sensitive_content(
    leakage_map: dict[str, Any], mutation: str
) -> None:
    changed = deepcopy(leakage_map)
    if mutation == "swapped_axes":
        changed["axes"] = list(reversed(changed["axes"]))
    elif mutation == "missing_cell":
        changed["cells"].pop()
    else:
        frozen = changed["cells"][0]["optimismGap"]
        for cell in changed["cells"]:
            cell["optimismGap"] = frozen

    assert sha256_json_browser(_unsigned(changed)) != leakage_map["resultHash"]
