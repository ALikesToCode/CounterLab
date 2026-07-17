"""Fixed Boundary Map kernels for CounterLab's verified ML Subject Packs.

This module owns the bounded grid and numerical cells only.  It composes the
existing fixed pack kernels; it does not accept model-authored axes, formulas,
metrics, or literal result values.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .canonical import sha256_json_browser
from .experiment import KERNEL_VERSION, run_leakage_plan
from .fixture import generate_leakage_fixture
from .imbalance import (
    DEFAULT_IMBALANCE_SEED,
    IMBALANCE_BOUNDARY_PREVALENCE_SCENARIOS,
    IMBALANCE_BOUNDARY_THRESHOLDS,
    IMBALANCE_KERNEL_VERSION,
    generate_imbalance_fixture,
    run_imbalance_boundary_grid,
)


BOUNDARY_MAP_SCHEMA_VERSION = "1"
MAX_BOUNDARY_CELLS = 2_500

LEAKAGE_SEED = 1729
LEAKAGE_TEST_FRACTIONS = (0.1, 0.2, 0.3, 0.4, 0.5)
LEAKAGE_OBSERVATIONS_PER_ENTITY = (1, 2, 3, 4, 6)

IMBALANCE_PREVALENCE_SCENARIOS = IMBALANCE_BOUNDARY_PREVALENCE_SCENARIOS
IMBALANCE_THRESHOLDS = IMBALANCE_BOUNDARY_THRESHOLDS

_HASH_FIELDS = (
    "artifact_manifest_hash",
    "experiment_ir_hash",
    "authoritative_result_hash",
    "evidence_verdict_hash",
)


def _validate_lineage(
    *,
    session_id: str,
    concept_pack_version: str,
    artifact_manifest_hash: str,
    experiment_ir_hash: str,
    authoritative_result_hash: str,
    evidence_verdict_hash: str,
) -> None:
    if not session_id.strip():
        raise ValueError("session_id must not be empty")
    if not concept_pack_version.strip():
        raise ValueError("concept_pack_version must not be empty")
    values = locals()
    for field in _HASH_FIELDS:
        value = values[field]
        if len(value) != 64 or any(
            character not in "0123456789abcdef" for character in value
        ):
            raise ValueError(f"{field} must be a lowercase SHA-256 hash")


def _validate_cell_limit(cell_count: int, max_cells: int) -> None:
    if isinstance(max_cells, bool) or not isinstance(max_cells, int):
        raise ValueError("max_cells must be an integer")
    if not 1 <= max_cells <= MAX_BOUNDARY_CELLS:
        raise ValueError("max_cells must be between 1 and 2500")
    if cell_count > max_cells:
        raise ValueError(
            f"Boundary Map requires {cell_count} cells, "
            f"exceeding cell limit {max_cells}"
        )


def _validate_seed(seed: int) -> None:
    if isinstance(seed, bool) or not isinstance(seed, int) or seed < 0:
        raise ValueError("seed must be a non-negative integer")


def _boundary_map_id(
    *,
    session_id: str,
    concept: str,
    sweep_id: str,
    experiment_ir_hash: str,
) -> str:
    digest = sha256_json_browser(
        {
            "concept": concept,
            "experimentIrHash": experiment_ir_hash,
            "sessionId": session_id,
            "sweepId": sweep_id,
        }
    )
    return f"boundary_{digest[:24]}"


def _lineage_envelope(
    *,
    session_id: str,
    concept_pack_version: str,
    artifact_manifest_hash: str,
    experiment_ir_hash: str,
    authoritative_result_hash: str,
    evidence_verdict_hash: str,
) -> dict[str, str]:
    return {
        "sessionId": session_id,
        "conceptPackVersion": concept_pack_version,
        "artifactManifestHash": artifact_manifest_hash,
        "experimentIrHash": experiment_ir_hash,
        "authoritativeResultHash": authoritative_result_hash,
        "evidenceVerdictHash": evidence_verdict_hash,
    }


def _axis_point_id(prefix: str, value: int | float) -> str:
    if isinstance(value, float):
        return f"{prefix}-{round(value * 100):02d}"
    return f"{prefix}-{value}"


def classify_leakage_optimism_gap(optimism_gap: float) -> str:
    """Classify a computed random-row minus group-holdout accuracy gap."""

    if optimism_gap >= 0.10:
        return "material"
    if optimism_gap > 0.03:
        return "transition"
    return "little"


def classify_imbalance_f1(f1: float) -> str:
    """Classify a fixed-kernel F1 value for the imbalance Boundary Map."""

    if f1 >= 0.30:
        return "strong"
    if f1 >= 0.20:
        return "tradeoff"
    return "weak"


def _run_by_id(result: Mapping[str, Any], run_id: str) -> Mapping[str, Any]:
    runs = result.get("runs")
    if not isinstance(runs, list):
        raise ValueError("fixed kernel returned no runs")
    for run in runs:
        if isinstance(run, Mapping) and run.get("id") == run_id:
            return run
    raise ValueError(f"fixed kernel omitted run {run_id}")


def compute_leakage_boundary_map(
    *,
    session_id: str,
    concept_pack_version: str,
    artifact_manifest_hash: str,
    experiment_ir_hash: str,
    authoritative_result_hash: str,
    evidence_verdict_hash: str,
    seed: int = LEAKAGE_SEED,
    max_cells: int = MAX_BOUNDARY_CELLS,
) -> dict[str, Any]:
    """Compute the registered recurrence/test-fraction leakage Boundary Map."""

    _validate_lineage(
        session_id=session_id,
        concept_pack_version=concept_pack_version,
        artifact_manifest_hash=artifact_manifest_hash,
        experiment_ir_hash=experiment_ir_hash,
        authoritative_result_hash=authoritative_result_hash,
        evidence_verdict_hash=evidence_verdict_hash,
    )
    _validate_seed(seed)
    cell_count = len(LEAKAGE_TEST_FRACTIONS) * len(
        LEAKAGE_OBSERVATIONS_PER_ENTITY
    )
    _validate_cell_limit(cell_count, max_cells)

    base_fixture = generate_leakage_fixture(
        seed=seed,
        observations_per_customer=max(LEAKAGE_OBSERVATIONS_PER_ENTITY),
    )
    fixture_views = {
        observations: base_fixture.groupby("customer_id", sort=True)
        .head(observations)
        .reset_index(drop=True)
        for observations in LEAKAGE_OBSERVATIONS_PER_ENTITY
    }
    cells: list[dict[str, Any]] = []
    for test_fraction in LEAKAGE_TEST_FRACTIONS:
        fraction_point_id = _axis_point_id("test-fraction", test_fraction)
        for observations in LEAKAGE_OBSERVATIONS_PER_ENTITY:
            observations_point_id = _axis_point_id("observations", observations)
            cell_id = f"{fraction_point_id}--{observations_point_id}"
            result = run_leakage_plan(
                fixture_views[observations],
                [
                    {
                        "runId": "random_row_split",
                        "operation": "leakage.random_row_split",
                        "seed": seed,
                        "testFraction": test_fraction,
                        "entityField": "customer_id",
                        "dropIdentity": False,
                    },
                    {
                        "runId": "customer_group_split",
                        "operation": "leakage.group_holdout",
                        "seed": seed,
                        "testFraction": test_fraction,
                        "entityField": "customer_id",
                        "dropIdentity": False,
                    },
                ],
                plan_id=f"boundary-plan-{cell_id}",
                session_id=session_id,
                artifact_manifest_hash=artifact_manifest_hash,
                concept_pack_version=concept_pack_version,
            )
            random_run = _run_by_id(result, "random_row_split")
            group_run = _run_by_id(result, "customer_group_split")
            random_accuracy = float(random_run["metrics"]["accuracy"])
            group_accuracy = float(group_run["metrics"]["accuracy"])
            optimism_gap = round(random_accuracy - group_accuracy, 12)
            cells.append(
                {
                    "cellId": cell_id,
                    "coordinates": [
                        {
                            "axisId": "test_fraction",
                            "pointId": fraction_point_id,
                            "value": test_fraction,
                        },
                        {
                            "axisId": "observations_per_entity",
                            "pointId": observations_point_id,
                            "value": observations,
                        },
                    ],
                    "concept": "entity_leakage",
                    "randomAccuracy": random_accuracy,
                    "groupAccuracy": group_accuracy,
                    "optimismGap": optimism_gap,
                    "randomEntityOverlap": dict(random_run["entityOverlap"]),
                    "groupEntityOverlap": dict(group_run["entityOverlap"]),
                    "sampleSizes": {
                        "randomTest": int(random_run["sampleSizes"]["test"]),
                        "groupTest": int(group_run["sampleSizes"]["test"]),
                    },
                    "fixtureViewHash": str(result["fixture"]["sha256"]),
                    "randomPipelineFingerprint": str(
                        random_run["pipelineFingerprint"]
                    ),
                    "groupPipelineFingerprint": str(group_run["pipelineFingerprint"]),
                    "classificationId": classify_leakage_optimism_gap(
                        optimism_gap
                    ),
                }
            )

    sweep_id = "leakage-recurrence-sweep"
    boundary_map: dict[str, Any] = {
        "schemaVersion": BOUNDARY_MAP_SCHEMA_VERSION,
        "canonicalProfile": "counterlab-canonical-json-v1",
        "boundaryMapId": _boundary_map_id(
            session_id=session_id,
            concept="entity_leakage",
            sweep_id=sweep_id,
            experiment_ir_hash=experiment_ir_hash,
        ),
        **_lineage_envelope(
            session_id=session_id,
            concept_pack_version=concept_pack_version,
            artifact_manifest_hash=artifact_manifest_hash,
            experiment_ir_hash=experiment_ir_hash,
            authoritative_result_hash=authoritative_result_hash,
            evidence_verdict_hash=evidence_verdict_hash,
        ),
        "concept": "entity_leakage",
        "sweepId": sweep_id,
        "gridPresetId": "leakage-boundary-grid-v1",
        "seed": seed,
        "kernelVersion": KERNEL_VERSION,
        "axes": [
            {
                "id": "test_fraction",
                "label": "Test fraction",
                "unit": "proportion",
                "points": [
                    {
                        "id": _axis_point_id("test-fraction", value),
                        "value": value,
                        "label": f"{round(value * 100)}%",
                    }
                    for value in LEAKAGE_TEST_FRACTIONS
                ],
            },
            {
                "id": "observations_per_entity",
                "label": "Observations per customer",
                "unit": "observations/customer",
                "points": [
                    {
                        "id": _axis_point_id("observations", value),
                        "value": value,
                        "label": f"{value} observation{'s' if value != 1 else ''}",
                    }
                    for value in LEAKAGE_OBSERVATIONS_PER_ENTITY
                ],
            },
        ],
        "cells": cells,
        "classifications": [
            {
                "id": "material",
                "label": "Material optimism",
                "description": (
                    "Random-row accuracy exceeds group-holdout accuracy by at "
                    "least 0.10."
                ),
            },
            {
                "id": "transition",
                "label": "Transition region",
                "description": (
                    "The observed accuracy gap is greater than 0.03 but below "
                    "0.10."
                ),
            },
            {
                "id": "little",
                "label": "Little observed gap",
                "description": "The observed accuracy gap is at most 0.03.",
            },
        ],
        "units": {"optimism_gap": "accuracy proportion"},
        "assumptions": [
            (
                "The estimator, preprocessing, seed, and feature set remain "
                "fixed within each comparison."
            ),
            (
                "Each fixture view retains the first canonical observations "
                "for every customer."
            ),
            (
                "Optimism gap is random-row accuracy minus whole-customer "
                "holdout accuracy."
            ),
        ],
        "nonClaims": [
            (
                "This bounded synthetic sweep does not show that group holdout "
                "is always more accurate."
            ),
            (
                "This map does not establish performance for unrelated "
                "datasets or deployment settings."
            ),
        ],
    }
    boundary_map["resultHash"] = sha256_json_browser(boundary_map)
    return boundary_map


def compute_imbalance_boundary_map(
    *,
    session_id: str,
    concept_pack_version: str,
    artifact_manifest_hash: str,
    experiment_ir_hash: str,
    authoritative_result_hash: str,
    evidence_verdict_hash: str,
    seed: int = DEFAULT_IMBALANCE_SEED,
    max_cells: int = MAX_BOUNDARY_CELLS,
) -> dict[str, Any]:
    """Compute the registered prevalence/threshold class-imbalance map."""

    _validate_lineage(
        session_id=session_id,
        concept_pack_version=concept_pack_version,
        artifact_manifest_hash=artifact_manifest_hash,
        experiment_ir_hash=experiment_ir_hash,
        authoritative_result_hash=authoritative_result_hash,
        evidence_verdict_hash=evidence_verdict_hash,
    )
    _validate_seed(seed)
    cell_count = len(IMBALANCE_PREVALENCE_SCENARIOS) * len(IMBALANCE_THRESHOLDS)
    _validate_cell_limit(cell_count, max_cells)

    fixed_result = run_imbalance_boundary_grid(
        generate_imbalance_fixture(seed=seed),
        seed=seed,
        plan_id="boundary-plan-imbalance-threshold-prevalence",
        session_id=session_id,
        artifact_manifest_hash=artifact_manifest_hash,
        concept_pack_version=concept_pack_version,
    )
    runs = {
        str(run["id"]): run
        for run in fixed_result["runs"]
        if isinstance(run, Mapping)
    }
    cells: list[dict[str, Any]] = []
    prevalence_by_scenario: dict[str, float] = {}
    for scenario in IMBALANCE_PREVALENCE_SCENARIOS:
        for threshold in IMBALANCE_THRESHOLDS:
            threshold_point_id = _axis_point_id("threshold", threshold)
            run_id = f"{scenario}--{threshold_point_id}"
            run = runs.get(run_id)
            if run is None:
                raise ValueError(f"fixed kernel omitted run {run_id}")
            prevalence = float(run["prevalence"])
            prevalence_by_scenario.setdefault(scenario, prevalence)
            metrics = {
                name: float(value) for name, value in run["metrics"].items()
            }
            f1 = metrics["f1"]
            cells.append(
                {
                    "cellId": run_id,
                    "coordinates": [
                        {
                            "axisId": "class_prevalence",
                            "pointId": scenario,
                            "value": prevalence,
                        },
                        {
                            "axisId": "decision_threshold",
                            "pointId": threshold_point_id,
                            "value": threshold,
                        },
                    ],
                    "concept": "class_imbalance",
                    "prevalenceScenario": scenario,
                    "prevalence": prevalence,
                    "threshold": threshold,
                    "metrics": metrics,
                    "confusion": {
                        "trueNegative": int(run["confusionMatrix"]["tn"]),
                        "falsePositive": int(run["confusionMatrix"]["fp"]),
                        "falseNegative": int(run["confusionMatrix"]["fn"]),
                        "truePositive": int(run["confusionMatrix"]["tp"]),
                    },
                    "sampleSize": int(run["sampleSizes"]["test"]),
                    "predictedPositiveRate": float(run["predictedPositiveRate"]),
                    "scoreFingerprint": str(run["scoreFingerprint"]),
                    "pipelineFingerprint": str(run["pipelineFingerprint"]),
                    "classificationId": classify_imbalance_f1(f1),
                }
            )

    sweep_id = "imbalance-threshold-prevalence-sweep"
    boundary_map: dict[str, Any] = {
        "schemaVersion": BOUNDARY_MAP_SCHEMA_VERSION,
        "canonicalProfile": "counterlab-canonical-json-v1",
        "boundaryMapId": _boundary_map_id(
            session_id=session_id,
            concept="class_imbalance",
            sweep_id=sweep_id,
            experiment_ir_hash=experiment_ir_hash,
        ),
        **_lineage_envelope(
            session_id=session_id,
            concept_pack_version=concept_pack_version,
            artifact_manifest_hash=artifact_manifest_hash,
            experiment_ir_hash=experiment_ir_hash,
            authoritative_result_hash=authoritative_result_hash,
            evidence_verdict_hash=evidence_verdict_hash,
        ),
        "concept": "class_imbalance",
        "sweepId": sweep_id,
        "gridPresetId": "imbalance-boundary-grid-v1",
        "seed": seed,
        "kernelVersion": IMBALANCE_KERNEL_VERSION,
        "axes": [
            {
                "id": "class_prevalence",
                "label": "Positive-class prevalence",
                "unit": "proportion",
                "points": [
                    {
                        "id": scenario,
                        "value": prevalence_by_scenario[scenario],
                        "label": scenario.replace("_", " ").title(),
                    }
                    for scenario in IMBALANCE_PREVALENCE_SCENARIOS
                ],
            },
            {
                "id": "decision_threshold",
                "label": "Decision threshold",
                "unit": "probability",
                "points": [
                    {
                        "id": _axis_point_id("threshold", value),
                        "value": value,
                        "label": f"{value:.1f}",
                    }
                    for value in IMBALANCE_THRESHOLDS
                ],
            },
        ],
        "cells": cells,
        "classifications": [
            {
                "id": "strong",
                "label": "Stronger balanced utility",
                "description": "The fixed F1 score is at least 0.30.",
            },
            {
                "id": "tradeoff",
                "label": "Tradeoff region",
                "description": "The fixed F1 score is at least 0.20 and below 0.30.",
            },
            {
                "id": "weak",
                "label": "Weak minority utility",
                "description": "The fixed F1 score is below 0.20.",
            },
        ],
        "units": {
            "f1": "proportion",
            "prevalence": "proportion",
            "threshold": "probability",
        },
        "assumptions": [
            (
                "The trained model scores and evaluation rows stay fixed while "
                "threshold changes within a prevalence scenario."
            ),
            (
                "Prevalence scenarios are deterministic pack-owned resamples "
                "of the same holdout."
            ),
            (
                "F1 is the Boundary Map observable; accuracy remains contextual "
                "evidence only."
            ),
        ],
        "nonClaims": [
            (
                "The map does not select a production threshold or encode "
                "deployment costs."
            ),
            (
                "This bounded fixture does not establish utility for unrelated "
                "rare-event systems."
            ),
        ],
    }
    boundary_map["resultHash"] = sha256_json_browser(boundary_map)
    return boundary_map


__all__ = [
    "BOUNDARY_MAP_SCHEMA_VERSION",
    "MAX_BOUNDARY_CELLS",
    "classify_imbalance_f1",
    "classify_leakage_optimism_gap",
    "compute_imbalance_boundary_map",
    "compute_leakage_boundary_map",
]
