from __future__ import annotations

import pandas as pd

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.imbalance import (
    generate_imbalance_fixture,
    run_imbalance_experiment,
)


def _run(result: dict[str, object], run_id: str) -> dict[str, object]:
    return next(run for run in result["runs"] if run["id"] == run_id)  # type: ignore[index,return-value]


def test_rare_event_fixture_is_deterministic_and_has_real_signal() -> None:
    first = generate_imbalance_fixture(seed=2603)
    second = generate_imbalance_fixture(seed=2603)

    pd.testing.assert_frame_equal(first, second)
    assert first["case_id"].is_unique
    assert 0.005 <= float(first["fraud"].mean()) <= 0.02
    assert set(first["fraud"].unique()) == {0, 1}
    assert first.loc[first["fraud"] == 1, "risk_score"].mean() > first.loc[
        first["fraud"] == 0, "risk_score"
    ].mean()


def test_fixed_kernel_exposes_why_accuracy_is_insufficient() -> None:
    result = run_imbalance_experiment(generate_imbalance_fixture(), seed=2603)
    majority = _run(result, "majority_baseline")
    model = _run(result, "stratified_model")
    lower = _run(result, "lower_threshold")
    rarer = _run(result, "rarer_prevalence")

    assert majority["metrics"]["accuracy"] > 0.985  # type: ignore[index]
    assert majority["metrics"]["recall"] == 0.0  # type: ignore[index]
    assert majority["confusionMatrix"]["tp"] == 0  # type: ignore[index]
    assert model["metrics"]["prAuc"] > model["prevalence"] + 0.10  # type: ignore[index,operator]
    assert lower["metrics"]["recall"] > model["metrics"]["recall"]  # type: ignore[index,operator]
    assert lower["predictedPositiveRate"] > model["predictedPositiveRate"]  # type: ignore[operator]
    assert rarer["prevalence"] < lower["prevalence"]  # type: ignore[operator]
    assert rarer["metrics"]["precision"] <= lower["metrics"]["precision"]  # type: ignore[index,operator]
    assert model["scoreFingerprint"] == lower["scoreFingerprint"]
    assert model["evaluationSetFingerprint"] == lower["evaluationSetFingerprint"]
    assert model["evaluationSetFingerprint"] == majority["evaluationSetFingerprint"]
    assert rarer["evaluationSetFingerprint"] != lower["evaluationSetFingerprint"]
    assert rarer["scoreFingerprint"] != lower["scoreFingerprint"]
    assert model["pipelineFingerprint"] == lower["pipelineFingerprint"]
    assert model["pipelineFingerprint"] == rarer["pipelineFingerprint"]
    assert majority["pipelineFingerprint"] != model["pipelineFingerprint"]

    for run in result["runs"]:
        matrix = run["confusionMatrix"]
        assert sum(matrix.values()) == run["sampleSizes"]["test"]
        assert 0.0 <= run["metrics"]["prAuc"] <= 1.0


def test_imbalance_result_hash_is_canonical_and_row_order_invariant() -> None:
    fixture = generate_imbalance_fixture(seed=2603)
    first = run_imbalance_experiment(fixture, seed=2603)
    repeated = run_imbalance_experiment(fixture.copy(deep=True), seed=2603)
    reordered = run_imbalance_experiment(
        fixture.sample(frac=1.0, random_state=19), seed=2603
    )

    assert first["resultHash"] == repeated["resultHash"]
    assert first["resultHash"] == reordered["resultHash"]
    assert first["resultHash"] == sha256_json(
        {key: value for key, value in first.items() if key != "resultHash"}
    )
