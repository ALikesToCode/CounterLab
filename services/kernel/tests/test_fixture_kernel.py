from __future__ import annotations

import pandas as pd

from counterlab_kernel import generate_leakage_fixture, run_leakage_experiment


def _run_by_id(result: dict[str, object], run_id: str) -> dict[str, object]:
    runs = result["runs"]
    assert isinstance(runs, list)
    return next(run for run in runs if run["id"] == run_id)


def test_leakage_fixture_is_deterministic_and_entity_repeated() -> None:
    first = generate_leakage_fixture(seed=1729)
    second = generate_leakage_fixture(seed=1729)

    pd.testing.assert_frame_equal(first, second)
    assert 300 <= first["customer_id"].nunique() <= 600
    assert first.groupby("customer_id").size().min() >= 4
    assert 0.35 <= first["churned"].mean() <= 0.65


def test_kernel_exposes_identity_shortcut_with_real_computed_metrics() -> None:
    fixture = generate_leakage_fixture(seed=1729)
    result = run_leakage_experiment(fixture, seed=1729)
    random_split = _run_by_id(result, "random_row_split")
    group_split = _run_by_id(result, "customer_group_split")
    ablation = _run_by_id(result, "identity_ablation")

    assert random_split["metrics"]["accuracy"] > group_split["metrics"]["accuracy"] + 0.20
    assert random_split["metrics"]["accuracy"] > ablation["metrics"]["accuracy"] + 0.20
    assert random_split["metrics"]["accuracy"] > 0.90
    assert 0.50 < group_split["metrics"]["accuracy"] < 0.85
    assert 0.50 < ablation["metrics"]["accuracy"] < 0.85
    assert random_split["entityOverlap"]["count"] > 0
    assert group_split["entityOverlap"] == {"count": 0, "rate": 0.0}


def test_canonical_result_hash_is_repeatable_and_row_order_invariant() -> None:
    fixture = generate_leakage_fixture(seed=1729)
    first = run_leakage_experiment(fixture, seed=1729)
    second = run_leakage_experiment(fixture.sample(frac=1, random_state=99), seed=1729)

    assert first["resultHash"] == second["resultHash"]
    assert first == second

