"""Deterministic rare-event fixture and fixed class-imbalance kernel."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .canonical import sha256_json, sha256_json_browser
from .sklearn_fingerprint import (
    sklearn_feature_binding_fingerprint,
    sklearn_pipeline_fingerprint,
)


IMBALANCE_KERNEL_VERSION = "0.1.0"
DEFAULT_IMBALANCE_SEED = 2603
DEFAULT_IMBALANCE_ROWS = 6_000
ROW_ID = "case_id"
TARGET = "fraud"
NUMERIC_FEATURES = (
    "amount",
    "account_age_days",
    "velocity_24h",
    "device_trust_score",
    "prior_chargebacks",
    "risk_score",
)
CATEGORICAL_FEATURES = ("channel",)
FEATURES = (*NUMERIC_FEATURES, *CATEGORICAL_FEATURES)
REQUIRED_COLUMNS = (ROW_ID, *FEATURES, TARGET)
REQUIRED_OPERATIONS = (
    "imbalance.majority_baseline",
    "imbalance.stratified_holdout",
    "imbalance.threshold_sweep",
    "imbalance.prevalence_sweep",
)
MAJORITY_BASELINE_FINGERPRINT = sha256_json(
    {
        "estimator": "fixed_majority_baseline",
        "predictedClass": 0,
    }
)


def generate_imbalance_fixture(
    seed: int = DEFAULT_IMBALANCE_SEED,
    *,
    rows: int = DEFAULT_IMBALANCE_ROWS,
) -> pd.DataFrame:
    """Create a deterministic rare-event fraud fixture with genuine weak signal."""

    if rows < 1_000:
        raise ValueError("rows must be at least 1000 for a stable rare-event fixture")
    rng = np.random.default_rng(seed)
    amount = rng.lognormal(mean=3.5, sigma=1.0, size=rows)
    account_age = np.clip(rng.exponential(scale=700.0, size=rows), 1.0, 4_000.0)
    velocity = rng.poisson(lam=1.7, size=rows)
    device_trust = rng.beta(5.0, 2.0, size=rows)
    prior_chargebacks = rng.binomial(1, 0.045, size=rows)
    channel = rng.choice(
        np.array(["in_store", "web", "mobile"], dtype=object),
        size=rows,
        p=[0.50, 0.35, 0.15],
    )

    log_odds = (
        -5.8
        + 0.65 * ((np.log1p(amount) - 3.5) / 1.0)
        - 0.35 * ((np.log1p(account_age) - 5.5) / 1.2)
        + 0.55 * ((velocity - 1.7) / 1.4)
        - 1.00 * ((device_trust - 0.71) / 0.16)
        + 1.40 * prior_chargebacks
        + 0.65 * (channel == "mobile")
        + 0.25 * (channel == "web")
    )
    risk_score = 1.0 / (1.0 + np.exp(-log_odds))
    target = rng.binomial(1, risk_score).astype(np.int8)
    if len(np.unique(target)) != 2:
        raise ValueError("generated fixture did not contain both target classes")

    return pd.DataFrame(
        {
            ROW_ID: [f"case_{index:06d}" for index in range(rows)],
            "amount": np.round(amount, 6),
            "account_age_days": np.round(account_age, 6),
            "velocity_24h": velocity.astype(int),
            "device_trust_score": np.round(device_trust, 6),
            "prior_chargebacks": prior_chargebacks.astype(int),
            "risk_score": np.round(risk_score, 12),
            "channel": channel.astype(str),
            TARGET: target.astype(int),
        }
    )


def _validate_fixture(frame: pd.DataFrame) -> None:
    missing = sorted(set(REQUIRED_COLUMNS).difference(frame.columns))
    if missing:
        raise ValueError(f"fixture is missing required columns: {', '.join(missing)}")
    if frame.empty:
        raise ValueError("fixture must contain observations")
    if frame[ROW_ID].isna().any() or not frame[ROW_ID].is_unique:
        raise ValueError("case_id values must be non-null and unique")
    targets = set(frame[TARGET].dropna().unique().tolist())
    if targets != {0, 1}:
        raise ValueError("fraud must contain both binary values 0 and 1")


def _sorted_fixture(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.loc[:, REQUIRED_COLUMNS].sort_values(ROW_ID).reset_index(drop=True)


def _fixture_records(frame: pd.DataFrame) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for row in frame.itertuples(index=False):
        records.append(
            {
                ROW_ID: str(getattr(row, ROW_ID)),
                "amount": float(getattr(row, "amount")),
                "account_age_days": float(getattr(row, "account_age_days")),
                "velocity_24h": int(getattr(row, "velocity_24h")),
                "device_trust_score": float(getattr(row, "device_trust_score")),
                "prior_chargebacks": int(getattr(row, "prior_chargebacks")),
                "risk_score": float(getattr(row, "risk_score")),
                "channel": str(getattr(row, "channel")),
                TARGET: int(getattr(row, TARGET)),
            }
        )
    return records


def _model(seed: int) -> Pipeline:
    preprocessing = ColumnTransformer(
        transformers=[
            (
                "numeric",
                Pipeline(
                    steps=[
                        ("impute", SimpleImputer(strategy="median")),
                        ("scale", StandardScaler()),
                    ]
                ),
                list(NUMERIC_FEATURES),
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        ("encode", OneHotEncoder(handle_unknown="ignore")),
                    ]
                ),
                list(CATEGORICAL_FEATURES),
            ),
        ],
        remainder="drop",
    )
    return Pipeline(
        steps=[
            ("preprocess", preprocessing),
            (
                "model",
                LogisticRegression(
                    class_weight={0: 1.0, 1: 3.0},
                    max_iter=2_000,
                    random_state=seed,
                    solver="liblinear",
                ),
            ),
        ]
    )


def _scenario_test(
    test: pd.DataFrame, scenario: str, *, seed: int
) -> pd.DataFrame:
    if scenario == "observed":
        return test.reset_index(drop=True)
    positives = test.loc[test[TARGET] == 1]
    negatives = test.loc[test[TARGET] == 0]
    rng = np.random.default_rng(seed + (101 if scenario == "rarer" else 211))
    if scenario == "rarer":
        keep_positive = max(1, len(positives) // 2)
        selected = rng.choice(positives.index.to_numpy(), keep_positive, replace=False)
        sampled = pd.concat([negatives, positives.loc[selected]], ignore_index=True)
    elif scenario == "more_common":
        observed = float(test[TARGET].mean())
        target_prevalence = min(0.20, observed * 2.0)
        keep_negative = min(
            len(negatives),
            max(1, round(len(positives) * (1.0 - target_prevalence) / target_prevalence)),
        )
        selected = rng.choice(negatives.index.to_numpy(), keep_negative, replace=False)
        sampled = pd.concat([positives, negatives.loc[selected]], ignore_index=True)
    else:
        raise ValueError(f"unsupported prevalence scenario: {scenario}")
    return sampled.sort_values(ROW_ID).reset_index(drop=True)


def _class_counts(frame: pd.DataFrame) -> dict[str, int]:
    positives = int(frame[TARGET].sum())
    return {"negative": len(frame) - positives, "positive": positives}


def _execute_run(
    *,
    train: pd.DataFrame,
    observed_test: pd.DataFrame,
    spec: Mapping[str, Any],
    fixture_hash: str,
) -> dict[str, Any]:
    operation = str(spec["operation"])
    model_name = str(spec["model"])
    threshold = float(spec["threshold"])
    scenario = str(spec["prevalenceScenario"])
    seed = int(spec["seed"])
    test = _scenario_test(observed_test, scenario, seed=seed)
    estimator = _model(seed)
    feature_binding_fingerprint = sklearn_feature_binding_fingerprint(estimator)

    if operation == "imbalance.majority_baseline":
        if model_name != "majority_baseline":
            raise ValueError("majority baseline operation requires majority_baseline")
        probabilities = np.zeros(len(test), dtype=float)
        pipeline_fingerprint = MAJORITY_BASELINE_FINGERPRINT
    else:
        if model_name != "logistic_regression":
            raise ValueError(f"{operation} requires logistic_regression")
        pipeline_fingerprint = sklearn_pipeline_fingerprint(estimator)
        estimator.fit(train[list(FEATURES)], train[TARGET].astype(int))
        probabilities = estimator.predict_proba(test[list(FEATURES)])[:, 1]

    predicted = (probabilities >= threshold).astype(int)
    actual = test[TARGET].astype(int).to_numpy()
    evaluation_set_fingerprint = sha256_json(
        [
            {"caseId": str(case_id), "target": int(target)}
            for case_id, target in zip(test[ROW_ID], actual, strict=True)
        ]
    )
    score_fingerprint = sha256_json(
        [
            {"caseId": str(case_id), "score": round(float(score), 12)}
            for case_id, score in zip(test[ROW_ID], probabilities, strict=True)
        ]
    )
    tn, fp, fn, tp = (
        int(value) for value in confusion_matrix(actual, predicted, labels=[0, 1]).ravel()
    )
    metrics = {
        "accuracy": round(float(accuracy_score(actual, predicted)), 12),
        "precision": round(
            float(precision_score(actual, predicted, zero_division=0)), 12
        ),
        "recall": round(float(recall_score(actual, predicted, zero_division=0)), 12),
        "f1": round(float(f1_score(actual, predicted, zero_division=0)), 12),
        "prAuc": round(float(average_precision_score(actual, probabilities)), 12),
        "rocAuc": round(float(roc_auc_score(actual, probabilities)), 12),
    }
    return {
        "id": str(spec["runId"]),
        "operation": operation,
        "model": model_name,
        "seed": seed,
        "threshold": round(threshold, 12),
        "prevalenceScenario": scenario,
        "metrics": metrics,
        "confusionMatrix": {"tn": tn, "fp": fp, "fn": fn, "tp": tp},
        "sampleSizes": {"train": len(train), "test": len(test)},
        "classCounts": {
            "train": _class_counts(train),
            "test": _class_counts(test),
        },
        "prevalence": round(float(test[TARGET].mean()), 12),
        "predictedPositiveRate": round(float(predicted.mean()), 12),
        "featureSetFingerprint": feature_binding_fingerprint,
        "pipelineFingerprint": pipeline_fingerprint,
        "evaluationSetFingerprint": evaluation_set_fingerprint,
        "scoreFingerprint": score_fingerprint,
        "inputFingerprint": fixture_hash,
    }


def _result(
    frame: pd.DataFrame,
    runs: Sequence[Mapping[str, Any]],
    *,
    schema_version: str,
    lineage: Mapping[str, str] | None = None,
) -> dict[str, Any]:
    _validate_fixture(frame)
    fixture = _sorted_fixture(frame)
    fixture_hash = sha256_json(_fixture_records(fixture))
    seeds = {int(run["seed"]) for run in runs}
    if len(seeds) != 1:
        raise ValueError("all imbalance runs must use the same seed")
    seed = next(iter(seeds))
    positions = list(range(len(fixture)))
    train_positions, test_positions = train_test_split(
        positions,
        test_size=0.25,
        random_state=seed,
        stratify=fixture[TARGET].astype(int),
    )
    train = fixture.iloc[sorted(train_positions)].reset_index(drop=True)
    test = fixture.iloc[sorted(test_positions)].reset_index(drop=True)
    executed = [
        _execute_run(
            train=train,
            observed_test=test,
            spec=run,
            fixture_hash=fixture_hash,
        )
        for run in runs
    ]
    result: dict[str, Any] = {
        "schemaVersion": schema_version,
        "concept": "class_imbalance",
        **(dict(lineage) if lineage is not None else {}),
        "kernelVersion": IMBALANCE_KERNEL_VERSION,
        "seed": seed,
        "fixture": {
            "sha256": fixture_hash,
            "rows": len(fixture),
            "positives": int(fixture[TARGET].sum()),
            "prevalence": round(float(fixture[TARGET].mean()), 12),
        },
        "runs": executed,
        "chartData": [
            {
                "runId": run["id"],
                "operation": run["operation"],
                **run["metrics"],
                "prevalence": run["prevalence"],
                "predictedPositiveRate": run["predictedPositiveRate"],
                "sampleSize": run["sampleSizes"]["test"],
                "threshold": run["threshold"],
                "prevalenceScenario": run["prevalenceScenario"],
                "seed": run["seed"],
            }
            for run in executed
        ],
    }
    result["resultHash"] = (
        sha256_json_browser(result) if schema_version == "2" else sha256_json(result)
    )
    return result


def canonical_imbalance_run_specs(seed: int) -> list[dict[str, object]]:
    """Return the fixed public run contract used by the imbalance kernel."""

    return [
        {
            "runId": "majority_baseline",
            "operation": "imbalance.majority_baseline",
            "model": "majority_baseline",
            "seed": seed,
            "threshold": 0.5,
            "prevalenceScenario": "observed",
        },
        {
            "runId": "stratified_model",
            "operation": "imbalance.stratified_holdout",
            "model": "logistic_regression",
            "seed": seed,
            "threshold": 0.5,
            "prevalenceScenario": "observed",
        },
        {
            "runId": "lower_threshold",
            "operation": "imbalance.threshold_sweep",
            "model": "logistic_regression",
            "seed": seed,
            "threshold": 0.25,
            "prevalenceScenario": "observed",
        },
        {
            "runId": "rarer_prevalence",
            "operation": "imbalance.prevalence_sweep",
            "model": "logistic_regression",
            "seed": seed,
            "threshold": 0.25,
            "prevalenceScenario": "rarer",
        },
    ]


def run_imbalance_experiment(
    frame: pd.DataFrame, seed: int = DEFAULT_IMBALANCE_SEED
) -> dict[str, Any]:
    """Run majority, stratified, threshold, and prevalence comparisons."""

    return _result(frame, canonical_imbalance_run_specs(seed), schema_version="1")


def run_imbalance_plan(
    frame: pd.DataFrame,
    runs: Sequence[Mapping[str, Any]],
    *,
    plan_id: str,
    session_id: str,
    artifact_manifest_hash: str,
    concept_pack_version: str,
) -> dict[str, Any]:
    """Execute validated imbalance run specs through fixed operations only."""

    if {str(run["operation"]) for run in runs} != set(REQUIRED_OPERATIONS):
        raise ValueError("imbalance plan requires each fixed operation exactly once")
    return _result(
        frame,
        runs,
        schema_version="2",
        lineage={
            "planId": plan_id,
            "sessionId": session_id,
            "artifactManifestHash": artifact_manifest_hash,
            "conceptPackVersion": concept_pack_version,
        },
    )


__all__ = [
    "DEFAULT_IMBALANCE_SEED",
    "IMBALANCE_KERNEL_VERSION",
    "REQUIRED_OPERATIONS",
    "canonical_imbalance_run_specs",
    "generate_imbalance_fixture",
    "run_imbalance_experiment",
    "run_imbalance_plan",
]
