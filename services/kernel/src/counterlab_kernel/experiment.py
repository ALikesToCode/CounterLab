"""Fixed, deterministic experiment kernel for the leakage concept pack."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .canonical import sha256_json


KERNEL_VERSION = "0.1.0"
TARGET = "churned"
ENTITY = "customer_id"
ROW_ID = "observation_id"
NUMERIC_FEATURES = (
    "tenure_months",
    "monthly_charges",
    "support_tickets",
    "activity_days_30d",
)
CATEGORICAL_FEATURES = (ENTITY, "contract_type")
REQUIRED_COLUMNS = (ROW_ID, *NUMERIC_FEATURES, *CATEGORICAL_FEATURES, TARGET)


def _validate_fixture(frame: pd.DataFrame) -> None:
    missing = sorted(set(REQUIRED_COLUMNS).difference(frame.columns))
    if missing:
        raise ValueError(f"fixture is missing required columns: {', '.join(missing)}")
    if frame.empty:
        raise ValueError("fixture must contain observations")
    if frame[ROW_ID].isna().any() or not frame[ROW_ID].is_unique:
        raise ValueError("observation_id values must be non-null and unique")
    if frame[ENTITY].isna().any():
        raise ValueError("customer_id values must be non-null")
    targets = set(frame[TARGET].dropna().unique().tolist())
    if targets != {0, 1}:
        raise ValueError("churned must contain both binary values 0 and 1")


def _sorted_fixture(frame: pd.DataFrame) -> pd.DataFrame:
    return frame.loc[:, REQUIRED_COLUMNS].sort_values(ROW_ID).reset_index(drop=True)


def _fixture_records(frame: pd.DataFrame) -> list[dict[str, object]]:
    records: list[dict[str, object]] = []
    for row in frame.itertuples(index=False):
        records.append(
            {
                ROW_ID: str(getattr(row, ROW_ID)),
                "tenure_months": float(getattr(row, "tenure_months")),
                "monthly_charges": float(getattr(row, "monthly_charges")),
                "support_tickets": int(getattr(row, "support_tickets")),
                "activity_days_30d": float(getattr(row, "activity_days_30d")),
                ENTITY: str(getattr(row, ENTITY)),
                "contract_type": str(getattr(row, "contract_type")),
                TARGET: int(getattr(row, TARGET)),
            }
        )
    return records


def _model_pipeline(feature_names: Sequence[str], seed: int) -> Pipeline:
    numeric = [name for name in NUMERIC_FEATURES if name in feature_names]
    categorical = [name for name in CATEGORICAL_FEATURES if name in feature_names]
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
                numeric,
            ),
            (
                "categorical",
                Pipeline(
                    steps=[
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        (
                            "encode",
                            OneHotEncoder(handle_unknown="ignore"),
                        ),
                    ]
                ),
                categorical,
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
                    C=50.0,
                    max_iter=2_000,
                    random_state=seed,
                    solver="liblinear",
                ),
            ),
        ]
    )


def _overlap(
    train: pd.DataFrame, test: pd.DataFrame
) -> tuple[dict[str, int | float], int, int]:
    train_entities = set(train[ENTITY].astype(str))
    test_entities = set(test[ENTITY].astype(str))
    count = len(train_entities.intersection(test_entities))
    rate = 0.0 if not test_entities else count / len(test_entities)
    return (
        {"count": count, "rate": round(float(rate), 12)},
        len(train_entities),
        len(test_entities),
    )


def _run(
    *,
    run_id: str,
    split_strategy: str,
    train: pd.DataFrame,
    test: pd.DataFrame,
    drop_features: Sequence[str],
    seed: int,
    fixture_hash: str,
) -> dict[str, Any]:
    feature_names = [
        *NUMERIC_FEATURES,
        *CATEGORICAL_FEATURES,
    ]
    feature_names = [name for name in feature_names if name not in drop_features]
    pipeline = _model_pipeline(feature_names, seed)
    pipeline.fit(train[feature_names], train[TARGET].astype(int))

    predicted = pipeline.predict(test[feature_names])
    probabilities = pipeline.predict_proba(test[feature_names])[:, 1]
    accuracy = float(accuracy_score(test[TARGET], predicted))
    roc_auc = float(roc_auc_score(test[TARGET], probabilities))
    overlap, train_entities, test_entities = _overlap(train, test)

    return {
        "id": run_id,
        "splitStrategy": split_strategy,
        "groupBy": ENTITY if split_strategy == "group" else None,
        "model": "logistic_regression",
        "seed": seed,
        "dropFeatures": list(drop_features),
        "metrics": {
            "accuracy": round(accuracy, 12),
            "rocAuc": round(roc_auc, 12),
        },
        "entityOverlap": overlap,
        "sampleSizes": {"train": len(train), "test": len(test)},
        "entityCounts": {"train": train_entities, "test": test_entities},
        "featureSetFingerprint": sha256_json(sorted(feature_names)),
        "inputFingerprint": fixture_hash,
    }


def run_leakage_experiment(frame: pd.DataFrame, seed: int = 1729) -> dict[str, Any]:
    """Run the row-split, group-split, and identity-ablation comparison."""

    _validate_fixture(frame)
    fixture = _sorted_fixture(frame)
    fixture_hash = sha256_json(_fixture_records(fixture))

    positions = list(range(len(fixture)))
    random_train_positions, random_test_positions = train_test_split(
        positions,
        test_size=0.25,
        random_state=seed,
        stratify=fixture[TARGET].astype(int),
    )
    random_train = fixture.iloc[sorted(random_train_positions)].reset_index(drop=True)
    random_test = fixture.iloc[sorted(random_test_positions)].reset_index(drop=True)

    group_splitter = GroupShuffleSplit(
        n_splits=1,
        test_size=0.25,
        random_state=seed,
    )
    group_train_positions, group_test_positions = next(
        group_splitter.split(fixture, fixture[TARGET], groups=fixture[ENTITY])
    )
    group_train = fixture.iloc[sorted(group_train_positions)].reset_index(drop=True)
    group_test = fixture.iloc[sorted(group_test_positions)].reset_index(drop=True)

    runs = [
        _run(
            run_id="random_row_split",
            split_strategy="random",
            train=random_train,
            test=random_test,
            drop_features=(),
            seed=seed,
            fixture_hash=fixture_hash,
        ),
        _run(
            run_id="customer_group_split",
            split_strategy="group",
            train=group_train,
            test=group_test,
            drop_features=(),
            seed=seed,
            fixture_hash=fixture_hash,
        ),
        _run(
            run_id="identity_ablation",
            split_strategy="random",
            train=random_train,
            test=random_test,
            drop_features=(ENTITY,),
            seed=seed,
            fixture_hash=fixture_hash,
        ),
    ]
    result: dict[str, Any] = {
        "schemaVersion": "1",
        "concept": "entity_leakage",
        "kernelVersion": KERNEL_VERSION,
        "seed": seed,
        "fixture": {
            "sha256": fixture_hash,
            "rows": len(fixture),
            "customers": int(fixture[ENTITY].nunique()),
            "targetRate": round(float(fixture[TARGET].mean()), 12),
        },
        "runs": runs,
        "chartData": [
            {
                "runId": run["id"],
                "accuracy": run["metrics"]["accuracy"],
                "rocAuc": run["metrics"]["rocAuc"],
                "sampleSize": run["sampleSizes"]["test"],
                "splitStrategy": run["splitStrategy"],
                "seed": run["seed"],
            }
            for run in runs
        ],
    }
    result["resultHash"] = sha256_json(result)
    return result
