#!/usr/bin/env python3
"""Generate deterministic held-out notebook cases from computed metrics.

The notebooks are untrusted-data fixtures for the safe parser benchmark.  This
script executes only its own fixed synthetic generators; the benchmark runner
never executes notebook cells.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

from counterlab_kernel import generate_leakage_fixture, run_leakage_experiment


SEED = 1729
CREATED_AT = "2026-07-15T00:00:00.000Z"
Family = Literal["entity_leakage", "class_imbalance", "unsupported"]
CompletionOutcome = Literal[
    "PATCH_VERIFIED",
    "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT",
    "NOT_APPLICABLE",
]


def _canonical(value: object) -> str:
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        allow_nan=False,
    )


def _sha256(value: bytes | str) -> str:
    encoded = value.encode("utf-8") if isinstance(value, str) else value
    return hashlib.sha256(encoded).hexdigest()


def _code_cell(cell_id: str, source: str, output: str, count: int = 1) -> dict[str, Any]:
    return {
        "cell_type": "code",
        "execution_count": count,
        "id": cell_id,
        "metadata": {},
        "outputs": [
            {
                "name": "stdout",
                "output_type": "stream",
                "text": output,
            }
        ],
        "source": source,
    }


def _markdown_cell(cell_id: str, source: str) -> dict[str, Any]:
    return {
        "cell_type": "markdown",
        "id": cell_id,
        "metadata": {},
        "source": source,
    }


def _schema_summary(
    fields: list[tuple[str, str, str]],
    *,
    rows: int,
    entities: list[str],
    targets: list[str],
) -> dict[str, Any]:
    return {
        "fields": [
            {
                "name": name,
                "inferredType": inferred_type,
                "privacyClass": privacy_class,
            }
            for name, inferred_type, privacy_class in fields
        ],
        "rowCount": rows,
        "entityCandidates": entities,
        "targetCandidates": targets,
    }


def _notebook(
    *,
    case_id: str,
    family: Family,
    schema: dict[str, Any],
    metric_payload: dict[str, float],
    cells: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "cells": cells,
        "metadata": {
            "counterlab": {
                "createdAt": CREATED_AT,
                "schemaSummary": schema,
                "benchmarkProvenance": {
                    "caseId": case_id,
                    "family": family,
                    "fixtureSeed": SEED,
                    "generator": "scripts/generate-held-out-notebooks.py",
                    "metricSource": "computed_by_generator",
                    "metricPayloadHash": _sha256(_canonical(metric_payload)),
                },
            },
            "kernelspec": {
                "display_name": "Python 3",
                "language": "python",
                "name": "python3",
            },
            "language_info": {"name": "python", "version": "3.14"},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


def _imbalance_metrics(seed: int = SEED) -> tuple[dict[str, dict[str, float]], int]:
    rng = np.random.default_rng(seed)
    rows = 5_000
    response_minutes = np.clip(rng.lognormal(3.15, 0.55, rows), 2.0, 240.0)
    reopen_count = rng.poisson(0.8, rows)
    sentiment = np.clip(rng.normal(0.15, 0.65, rows), -1.0, 1.0)
    account_age_months = rng.uniform(1.0, 84.0, rows)
    logit = (
        -4.0
        + 0.012 * response_minutes
        + 0.38 * reopen_count
        - 0.75 * sentiment
        - 0.006 * account_age_months
    )
    probability = 1.0 / (1.0 + np.exp(-logit))
    target = rng.binomial(1, probability).astype(int)
    features = np.column_stack(
        [response_minutes, reopen_count, sentiment, account_age_months]
    )
    x_train, x_test, y_train, y_test = train_test_split(
        features,
        target,
        test_size=0.25,
        random_state=seed,
        stratify=target,
    )
    scaler = StandardScaler().fit(x_train)
    x_train_scaled = scaler.transform(x_train)
    x_test_scaled = scaler.transform(x_test)

    def metrics(prediction: np.ndarray) -> dict[str, float]:
        return {
            "accuracy": round(float(accuracy_score(y_test, prediction)), 12),
            "precision": round(
                float(precision_score(y_test, prediction, zero_division=0)), 12
            ),
            "recall": round(float(recall_score(y_test, prediction, zero_division=0)), 12),
            "f1": round(float(f1_score(y_test, prediction, zero_division=0)), 12),
        }

    majority = DummyClassifier(strategy="most_frequent").fit(x_train_scaled, y_train)
    standard = LogisticRegression(max_iter=2_000, random_state=seed).fit(
        x_train_scaled, y_train
    )
    weighted = LogisticRegression(
        max_iter=2_000,
        random_state=seed,
        class_weight="balanced",
    ).fit(x_train_scaled, y_train)
    standard_probability = standard.predict_proba(x_test_scaled)[:, 1]
    return (
        {
            "majority": metrics(majority.predict(x_test_scaled)),
            "standard": metrics(standard.predict(x_test_scaled)),
            "weighted": metrics(weighted.predict(x_test_scaled)),
            "threshold": metrics((standard_probability >= 0.30).astype(int)),
        },
        rows,
    )


def _metric_text(metrics: dict[str, float], names: list[str]) -> str:
    labels = {"f1_score": "F1 score"}
    metric_keys = {"f1_score": "f1"}
    return "".join(
        f"{labels.get(name, name.title())}: {metrics[metric_keys.get(name, name)]:.6f}\n"
        for name in names
    )


@dataclass(frozen=True)
class Case:
    case_id: str
    file_name: str
    family: Family
    variation: str
    notebook: dict[str, Any]
    support_status: Literal["SUPPORTED", "UNSUPPORTED"]
    concept: Literal["entity_leakage", "class_imbalance"] | None
    metric_names: tuple[str, ...]
    symbols: tuple[str, ...]
    packages: tuple[str, ...]
    completion_outcome: CompletionOutcome
    reason_codes: tuple[str, ...] = ()


def _cases() -> list[Case]:
    leakage_frame = generate_leakage_fixture(seed=SEED)
    leakage_result = run_leakage_experiment(leakage_frame, seed=SEED)
    random_run = next(
        run for run in leakage_result["runs"] if run["id"] == "random_row_split"
    )
    leakage_metrics = {
        "accuracy": float(random_run["metrics"]["accuracy"]),
        "roc_auc": float(random_run["metrics"]["rocAuc"]),
    }
    leakage_schema = _schema_summary(
        [
            ("customer_id", "categorical", "entity_identifier"),
            ("tenure_months", "number", "feature"),
            ("monthly_charges", "number", "feature"),
            ("contract_type", "categorical", "feature"),
            ("churned", "integer", "target"),
        ],
        rows=len(leakage_frame),
        entities=["customer_id"],
        targets=["churned"],
    )
    leakage_output = _metric_text(leakage_metrics, ["accuracy", "roc_auc"])

    imbalance_by_run, imbalance_rows = _imbalance_metrics()
    imbalance_schema = _schema_summary(
        [
            ("response_minutes", "number", "feature"),
            ("reopen_count", "integer", "feature"),
            ("sentiment", "number", "feature"),
            ("account_age_months", "number", "feature"),
            ("escalated", "integer", "target"),
        ],
        rows=imbalance_rows,
        entities=[],
        targets=["escalated"],
    )

    cases: list[Case] = []
    leakage_variants = [
        (
            "leakage_rows_pipeline",
            "leakage-rows-pipeline.ipynb",
            "pipeline_with_identity",
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.metrics import accuracy_score, roc_auc_score\n"
            "from sklearn.pipeline import Pipeline\n"
            "X = df[['customer_id', 'tenure_months', 'monthly_charges', 'contract_type']]\n"
            "X_train, X_test, y_train, y_test = train_test_split(X, df['churned'], test_size=.25, random_state=1729, stratify=df['churned'])\n",
            ("train_test_split", "LogisticRegression", "Pipeline"),
        ),
        (
            "leakage_shuffled_observations",
            "leakage-shuffled-observations.ipynb",
            "shuffled_repeated_entities",
            "import pandas as pd\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.metrics import accuracy_score, roc_auc_score\n"
            "rows = df.sample(frac=1, random_state=1729)\n"
            "train, test = train_test_split(rows, test_size=.25, random_state=1729, stratify=rows['churned'])\n"
            "features = ['customer_id', 'tenure_months', 'monthly_charges', 'contract_type']\n",
            ("train_test_split", "LogisticRegression"),
        ),
        (
            "leakage_column_transformer",
            "leakage-column-transformer.ipynb",
            "column_transformer_identity",
            "from sklearn.compose import ColumnTransformer\n"
            "from sklearn.preprocessing import OneHotEncoder\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.metrics import accuracy_score, roc_auc_score\n"
            "categorical = ['customer_id', 'contract_type']\n"
            "preprocess = ColumnTransformer([('cat', OneHotEncoder(handle_unknown='ignore'), categorical)])\n"
            "train, test = train_test_split(df, test_size=.25, random_state=1729, stratify=df['churned'])\n",
            ("ColumnTransformer", "OneHotEncoder", "train_test_split"),
        ),
        (
            "leakage_random_forest",
            "leakage-random-forest.ipynb",
            "different_estimator_same_split",
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.ensemble import RandomForestClassifier\n"
            "from sklearn.metrics import accuracy_score, roc_auc_score\n"
            "encoded = pd.get_dummies(df[['customer_id', 'contract_type', 'tenure_months']])\n"
            "X_train, X_test, y_train, y_test = train_test_split(encoded, df['churned'], test_size=.25, random_state=1729, stratify=df['churned'])\n",
            ("train_test_split", "RandomForestClassifier"),
        ),
    ]
    for case_id, file_name, variation, source, symbols in leakage_variants:
        notebook = _notebook(
            case_id=case_id,
            family="entity_leakage",
            schema=leakage_schema,
            metric_payload=leakage_metrics,
            cells=[
                _markdown_cell(
                    f"{case_id}-intro",
                    "# Held-out entity leakage case\n\nRepeated customer observations are evaluated with a random row split.",
                ),
                _code_cell(f"{case_id}-evaluation", source, leakage_output),
            ],
        )
        cases.append(
            Case(
                case_id,
                file_name,
                "entity_leakage",
                variation,
                notebook,
                "SUPPORTED",
                "entity_leakage",
                ("accuracy", "roc_auc"),
                symbols,
                ("sklearn",),
                (
                    "PATCH_REFUSED_ESTIMATOR_OUTSIDE_CONTRACT"
                    if case_id == "leakage_random_forest"
                    else "PATCH_VERIFIED"
                ),
            )
        )

    imbalance_variants = [
        (
            "imbalance_accuracy_only",
            "imbalance-accuracy-only.ipynb",
            "majority_baseline",
            "from sklearn.dummy import DummyClassifier\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.metrics import accuracy_score\n"
            "print(df['escalated'].value_counts(normalize=True))\n"
            "X = df.drop(columns=['escalated'])\n"
            "y = df['escalated']\n"
            "X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, random_state=1729)\n",
            "majority",
            ("accuracy",),
            ("train_test_split", "accuracy_score"),
        ),
        (
            "imbalance_confusion_metrics",
            "imbalance-confusion-metrics.ipynb",
            "minority_metrics",
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix\n"
            "X = df.drop(columns=['escalated'])\n"
            "y = df['escalated']\n"
            "X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, random_state=1729)\n",
            "standard",
            ("accuracy", "precision", "recall", "f1_score"),
            ("LogisticRegression", "train_test_split", "f1_score"),
        ),
        (
            "imbalance_weighted_model",
            "imbalance-weighted-model.ipynb",
            "class_weight_balanced",
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.metrics import precision_score, recall_score, f1_score\n"
            "model = LogisticRegression(class_weight='balanced', random_state=1729)\n"
            "X = df.drop(columns=['escalated'])\n"
            "y = df['escalated']\n"
            "X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, random_state=1729)\n",
            "weighted",
            ("precision", "recall", "f1_score"),
            ("LogisticRegression", "train_test_split", "f1_score"),
        ),
        (
            "imbalance_threshold_policy",
            "imbalance-threshold-policy.ipynb",
            "decision_threshold",
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.metrics import precision_score, recall_score, f1_score\n"
            "X = df.drop(columns=['escalated'])\n"
            "y = df['escalated']\n"
            "X_train, X_test, y_train, y_test = train_test_split(X, y, stratify=y, random_state=1729)\n"
            "probability = model.predict_proba(X_test)[:, 1]\n"
            "prediction = (probability >= 0.30).astype(int)\n",
            "threshold",
            ("precision", "recall", "f1_score"),
            ("LogisticRegression", "f1_score"),
        ),
    ]
    for (
        case_id,
        file_name,
        variation,
        source,
        metric_run,
        metric_names,
        symbols,
    ) in imbalance_variants:
        metrics = imbalance_by_run[metric_run]
        notebook = _notebook(
            case_id=case_id,
            family="class_imbalance",
            schema=imbalance_schema,
            metric_payload=metrics,
            cells=[
                _markdown_cell(
                    f"{case_id}-intro",
                    "# Held-out rare escalation case\n\nThe positive class is uncommon, so accuracy alone can hide minority failures.",
                ),
                _code_cell(
                    f"{case_id}-evaluation",
                    source,
                    _metric_text(metrics, list(metric_names)),
                ),
            ],
        )
        cases.append(
            Case(
                case_id,
                file_name,
                "class_imbalance",
                variation,
                notebook,
                "SUPPORTED",
                "class_imbalance",
                metric_names,
                symbols,
                ("sklearn",),
                "PATCH_VERIFIED",
            )
        )

    unsupported_specs = [
        (
            "unsupported_network_dependency",
            "unsupported-network-dependency.ipynb",
            "external_network",
            "import requests\nfrom sklearn.metrics import accuracy_score\nresponse = requests.get('https://example.invalid/data.csv')\n",
            ("EXTERNAL_NETWORK_DEPENDENCY",),
            ("requests", "sklearn"),
        ),
        (
            "unsupported_magic_package",
            "unsupported-magic-package.ipynb",
            "magic_and_unknown_package",
            "%pip install xgboost\nimport xgboost\nfrom sklearn.metrics import accuracy_score\n",
            ("UNSUPPORTED_MAGIC", "UNKNOWN_PACKAGE_REQUIREMENT"),
            ("sklearn", "xgboost"),
        ),
    ]
    for case_id, file_name, variation, source, reasons, packages in unsupported_specs:
        notebook = _notebook(
            case_id=case_id,
            family="unsupported",
            schema=imbalance_schema,
            metric_payload={"accuracy": imbalance_by_run["majority"]["accuracy"]},
            cells=[
                _markdown_cell(f"{case_id}-intro", "# Unsupported held-out case"),
                _code_cell(
                    f"{case_id}-evaluation",
                    source,
                    _metric_text(imbalance_by_run["majority"], ["accuracy"]),
                ),
            ],
        )
        cases.append(
            Case(
                case_id,
                file_name,
                "unsupported",
                variation,
                notebook,
                "UNSUPPORTED",
                None,
                ("accuracy",),
                ("accuracy_score",),
                packages,
                "NOT_APPLICABLE",
                reasons,
            )
        )
    return cases


def generate(output_root: Path) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)
    notebook_root = output_root / "notebooks"
    notebook_root.mkdir(parents=True, exist_ok=True)
    labels: list[dict[str, Any]] = []
    for case in _cases():
        notebook_text = json.dumps(
            case.notebook,
            sort_keys=True,
            indent=1,
            ensure_ascii=False,
            allow_nan=False,
        )
        notebook_bytes = f"{notebook_text}\n".encode("utf-8")
        (notebook_root / case.file_name).write_bytes(notebook_bytes)
        labels.append(
            {
                "schemaVersion": "1",
                "caseId": case.case_id,
                "fileName": case.file_name,
                "family": case.family,
                "variation": case.variation,
                "labelSource": "deterministic_case_spec",
                "humanReview": {
                    "status": "PENDING",
                    "reviewerId": None,
                    "reviewedAt": None,
                    "notes": None,
                },
                "notebookSha256": _sha256(notebook_bytes),
                "expected": {
                    "completionOutcome": case.completion_outcome,
                    "supportStatus": case.support_status,
                    "concept": case.concept,
                    "requiredMetricNames": list(case.metric_names),
                    "requiredSymbols": list(case.symbols),
                    "requiredPackageHints": list(case.packages),
                    "requiredSupportReasonCodes": list(case.reason_codes),
                },
            }
        )
    payload = {
        "schemaVersion": "1",
        "generatedAt": CREATED_AT,
        "generator": "scripts/generate-held-out-notebooks.py",
        "seed": SEED,
        "labels": labels,
    }
    (output_root / "review-labels.json").write_text(
        f"{json.dumps(payload, sort_keys=True, indent=2, ensure_ascii=False)}\n",
        encoding="utf-8",
    )
    return payload


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("evals/held-out"),
    )
    args = parser.parse_args()
    result = generate(args.output_root)
    print(
        f"Generated {len(result['labels'])} deterministic held-out notebooks "
        f"at {args.output_root}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
