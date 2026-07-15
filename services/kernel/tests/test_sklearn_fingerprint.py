from __future__ import annotations

import pytest
from sklearn.base import BaseEstimator

from counterlab_kernel.experiment import (
    CATEGORICAL_FEATURES,
    NUMERIC_FEATURES,
    _model_pipeline,
)
from counterlab_kernel.fixture import generate_leakage_fixture
from counterlab_kernel.sklearn_fingerprint import (
    sklearn_feature_binding_fingerprint,
    sklearn_pipeline_fingerprint,
)


class _UnsupportedEstimator(BaseEstimator):
    def __init__(self, payload: object) -> None:
        self.payload = payload


def test_fingerprint_is_stable_for_equal_and_fitted_pipelines() -> None:
    features = [*NUMERIC_FEATURES, *CATEGORICAL_FEATURES]
    first = _model_pipeline(features, 1729)
    second = _model_pipeline(features, 1729)
    before_fit = sklearn_pipeline_fingerprint(first)

    fixture = generate_leakage_fixture(seed=1729)
    first.fit(fixture[features], fixture["churned"])

    assert sklearn_pipeline_fingerprint(second) == before_fit
    assert sklearn_pipeline_fingerprint(first) == before_fit


def test_fingerprint_tracks_actual_estimator_configuration() -> None:
    features = [*NUMERIC_FEATURES, *CATEGORICAL_FEATURES]
    baseline = _model_pipeline(features, 1729)
    changed_seed = _model_pipeline(features, 99)
    changed_tolerance = _model_pipeline(features, 1729).set_params(
        model__tol=0.001
    )
    changed_scaler = _model_pipeline(features, 1729).set_params(
        preprocess__numeric__scale__with_mean=False
    )

    baseline_hash = sklearn_pipeline_fingerprint(baseline)
    assert sklearn_pipeline_fingerprint(changed_seed) != baseline_hash
    assert sklearn_pipeline_fingerprint(changed_tolerance) != baseline_hash
    assert sklearn_pipeline_fingerprint(changed_scaler) != baseline_hash


def test_column_selectors_are_bound_separately_from_pipeline_policy() -> None:
    with_identity = _model_pipeline(
        [*NUMERIC_FEATURES, *CATEGORICAL_FEATURES], 1729
    )
    without_identity = _model_pipeline(
        [
            *NUMERIC_FEATURES,
            *(
                feature
                for feature in CATEGORICAL_FEATURES
                if feature != "customer_id"
            ),
        ],
        1729,
    )

    assert sklearn_pipeline_fingerprint(with_identity) == sklearn_pipeline_fingerprint(
        without_identity
    )
    full_hash = sklearn_feature_binding_fingerprint(with_identity)
    assert sklearn_feature_binding_fingerprint(without_identity) != full_hash

    moved_role = _model_pipeline(
        [*NUMERIC_FEATURES, *CATEGORICAL_FEATURES], 1729
    )
    preprocessing = moved_role.named_steps["preprocess"]
    numeric_name, numeric_pipeline, _numeric_columns = preprocessing.transformers[0]
    categorical_name, categorical_pipeline, _categorical_columns = (
        preprocessing.transformers[1]
    )
    preprocessing.transformers = [
        (
            numeric_name,
            numeric_pipeline,
            [*NUMERIC_FEATURES, "contract_type"],
        ),
        (categorical_name, categorical_pipeline, ["customer_id"]),
    ]
    assert sklearn_feature_binding_fingerprint(moved_role) != full_hash


def test_unsupported_parameter_types_fail_closed() -> None:
    with pytest.raises(TypeError, match="unsupported sklearn parameter"):
        sklearn_pipeline_fingerprint(_UnsupportedEstimator(object()))

    dynamic_selector = _model_pipeline(
        [*NUMERIC_FEATURES, *CATEGORICAL_FEATURES], 1729
    )
    preprocessing = dynamic_selector.named_steps["preprocess"]
    name, transformer, _columns = preprocessing.transformers[0]
    preprocessing.transformers[0] = (
        name,
        transformer,
        lambda frame: list(frame.columns),
    )
    with pytest.raises(TypeError, match="explicit string selectors"):
        sklearn_feature_binding_fingerprint(dynamic_selector)
