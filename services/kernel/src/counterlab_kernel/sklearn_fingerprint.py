"""Canonical policy fingerprints for fixed scikit-learn estimators."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
import math
from typing import Any

import numpy as np
import sklearn
from sklearn.base import BaseEstimator
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline

from .canonical import canonical_json, sha256_json


def _qualified_name(value: type[Any] | Any) -> str:
    module = getattr(value, "__module__", None)
    qualname = getattr(value, "__qualname__", None)
    if not isinstance(module, str) or not isinstance(qualname, str):
        raise TypeError("unsupported sklearn parameter callable")
    return f"{module}.{qualname}"


def _normalize_float(value: float) -> float | dict[str, str]:
    if math.isnan(value):
        return {"kind": "non_finite_number", "value": "nan"}
    if value == math.inf:
        return {"kind": "non_finite_number", "value": "positive_infinity"}
    if value == -math.inf:
        return {"kind": "non_finite_number", "value": "negative_infinity"}
    return 0.0 if value == 0.0 else value


def _normalize_mapping(value: Mapping[object, object]) -> dict[str, object]:
    entries = [
        {"key": _normalize_parameter(key), "value": _normalize_parameter(item)}
        for key, item in value.items()
    ]
    entries.sort(key=lambda entry: canonical_json(entry["key"]))
    return {"kind": "mapping", "entries": entries}


def _normalize_parameter(value: object) -> object:
    if isinstance(value, BaseEstimator):
        return _estimator_descriptor(value)
    if isinstance(value, np.generic):
        return _normalize_parameter(value.item())
    if value is None or isinstance(value, (str, bool, int)):
        return value
    if isinstance(value, float):
        return _normalize_float(value)
    if isinstance(value, type):
        return {"kind": "type", "name": _qualified_name(value)}
    if isinstance(value, Mapping):
        return _normalize_mapping(value)
    if isinstance(value, tuple):
        return {
            "kind": "tuple",
            "items": [_normalize_parameter(item) for item in value],
        }
    if isinstance(value, list):
        return {
            "kind": "list",
            "items": [_normalize_parameter(item) for item in value],
        }
    if isinstance(value, (set, frozenset)):
        items = [_normalize_parameter(item) for item in value]
        items.sort(key=canonical_json)
        return {"kind": "set", "items": items}
    if callable(value):
        return {"kind": "callable", "name": _qualified_name(value)}
    raise TypeError(
        f"unsupported sklearn parameter type: {type(value).__module__}."
        f"{type(value).__qualname__}"
    )


def _estimator_descriptor(estimator: BaseEstimator) -> dict[str, object]:
    parameters = dict(estimator.get_params(deep=False))
    composition: dict[str, object] | None = None
    if isinstance(estimator, Pipeline):
        parameters.pop("steps", None)
        composition = {
            "kind": "pipeline",
            "steps": [
                {"name": name, "estimator": _normalize_parameter(step)}
                for name, step in estimator.steps
            ],
        }
    elif isinstance(estimator, ColumnTransformer):
        parameters.pop("transformers", None)
        composition = {
            "kind": "column_transformer",
            "transformers": [
                {"name": name, "estimator": _normalize_parameter(transformer)}
                for name, transformer, _columns in estimator.transformers
            ],
            "selectorPolicy": "bound_by_feature_set_fingerprint",
        }

    descriptor: dict[str, object] = {
        "class": _qualified_name(type(estimator)),
        "parameters": {
            name: _normalize_parameter(parameters[name])
            for name in sorted(parameters)
        },
    }
    if composition is not None:
        descriptor["composition"] = composition
    return descriptor


def sklearn_pipeline_fingerprint(estimator: BaseEstimator) -> str:
    """Hash the actual fixed estimator policy and pinned sklearn version.

    Column selectors are intentionally omitted because the result contract
    binds the selected columns independently through ``featureSetFingerprint``.
    Unsupported parameter values fail closed instead of falling back to repr.
    """

    return sha256_json(
        {
            "engine": {
                "name": "scikit-learn",
                "version": sklearn.__version__,
            },
            "estimator": _estimator_descriptor(estimator),
        }
    )


def _column_transformer_bindings(
    estimator: BaseEstimator,
    *,
    path: tuple[str, ...] = (),
) -> list[dict[str, object]]:
    bindings: list[dict[str, object]] = []
    if isinstance(estimator, Pipeline):
        for name, step in estimator.steps:
            if isinstance(step, BaseEstimator):
                bindings.extend(
                    _column_transformer_bindings(step, path=(*path, name))
                )
        return bindings
    if not isinstance(estimator, ColumnTransformer):
        return bindings

    assigned: list[str] = []
    for name, transformer, columns in estimator.transformers:
        if (
            not isinstance(columns, Sequence)
            or isinstance(columns, (str, bytes, bytearray))
            or any(
                not isinstance(column, str) or not column for column in columns
            )
        ):
            raise TypeError(
                "feature binding fingerprint requires explicit string selectors"
            )
        selected = list(columns)
        assigned.extend(selected)
        bindings.append(
            {
                "transformerPath": [*path, name],
                "features": selected,
            }
        )
        if isinstance(transformer, BaseEstimator):
            bindings.extend(
                _column_transformer_bindings(
                    transformer,
                    path=(*path, name),
                )
            )
    if len(assigned) != len(set(assigned)):
        raise ValueError("a feature cannot be assigned to multiple transformer roles")
    return bindings


def sklearn_feature_binding_fingerprint(estimator: BaseEstimator) -> str:
    """Hash selectors read from the actual configured ColumnTransformer."""

    bindings = _column_transformer_bindings(estimator)
    if not bindings:
        raise ValueError("estimator does not contain explicit feature bindings")
    return sha256_json({"transformerBindings": bindings})


__all__ = [
    "sklearn_feature_binding_fingerprint",
    "sklearn_pipeline_fingerprint",
]
