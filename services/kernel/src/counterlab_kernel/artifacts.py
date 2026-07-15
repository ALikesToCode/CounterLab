from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import nbformat
import pandas as pd

from .canonical import canonical_json, sha256_json_browser
from .experiment import run_leakage_experiment
from .fixture import generate_leakage_fixture
from .imbalance import (
    generate_imbalance_fixture,
    run_imbalance_experiment,
    run_imbalance_plan,
)

CREATED_AT = "2026-07-14T00:00:00.000Z"


def _schema_summary(frame: pd.DataFrame) -> dict[str, Any]:
    fields = []
    for name, dtype in frame.dtypes.items():
        if name == "customer_id":
            inferred_type = "categorical"
            privacy_class = "entity_identifier"
        elif name == "churned":
            inferred_type = "integer"
            privacy_class = "target"
        elif pd.api.types.is_numeric_dtype(dtype):
            inferred_type = "number"
            privacy_class = "feature"
        else:
            inferred_type = "categorical"
            privacy_class = "feature"
        fields.append(
            {
                "name": str(name),
                "inferredType": inferred_type,
                "privacyClass": privacy_class,
            }
        )
    return {
        "fields": fields,
        "rowCount": int(len(frame)),
        "entityCandidates": ["customer_id"],
        "targetCandidates": ["churned"],
    }


def _run(result: dict[str, Any], run_id: str) -> dict[str, Any]:
    return next(run for run in result["runs"] if run["id"] == run_id)


def _sample_notebook(frame: pd.DataFrame, result: dict[str, Any]) -> nbformat.NotebookNode:
    random_run = _run(result, "random_row_split")
    accuracy = random_run["metrics"]["accuracy"]
    auc = random_run["metrics"]["rocAuc"]
    overlap = random_run["entityOverlap"]
    compact_result = canonical_json(result)

    notebook = nbformat.v4.new_notebook()
    notebook["nbformat"] = 4
    notebook["nbformat_minor"] = 5
    notebook["metadata"] = {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {"name": "python", "version": "3.14"},
        "counterlab": {
            "createdAt": CREATED_AT,
            "fixtureSeed": result["seed"],
            "resultHash": result["resultHash"],
            "schemaSummary": _schema_summary(frame),
            "storedOutputSource": "counterlab-kernel",
        },
    }
    notebook["cells"] = [
        nbformat.v4.new_markdown_cell(
            "# Customer churn: does 99% mean new-customer generalization?\n\n"
            "This public sample intentionally uses a row-wise split while retaining `customer_id`.",
            id="counterlab-intro",
        ),
        nbformat.v4.new_code_cell(
            "from pathlib import Path\n"
            "import pandas as pd\n\n"
            "data_path = Path('../public/customer_churn.csv')\n"
            "df = pd.read_csv(data_path)\n"
            "df[['customer_id', 'churned']].head()",
            execution_count=1,
            id="load-fixture",
            outputs=[
                nbformat.v4.new_output(
                    "stream",
                    name="stdout",
                    text=f"Loaded {len(frame)} rows across {frame['customer_id'].nunique()} customers\n",
                )
            ],
        ),
        nbformat.v4.new_markdown_cell(
            "## Reported evaluation\n\n"
            "The next cell uses a random row split. Repeated observations from one customer can land on both sides.",
            id="evaluation-note",
        ),
        nbformat.v4.new_code_cell(
            "from sklearn.compose import ColumnTransformer\n"
            "from sklearn.impute import SimpleImputer\n"
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.metrics import accuracy_score, roc_auc_score\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.pipeline import Pipeline\n"
            "from sklearn.preprocessing import OneHotEncoder, StandardScaler\n\n"
            "X = df.drop(columns=['churned'])\n"
            "y = df['churned']\n"
            "categorical = [c for c in X.columns if X[c].dtype == 'object']\n"
            "numeric = [c for c in X.columns if c not in categorical]\n"
            "preprocess = ColumnTransformer([\n"
            "    ('categorical', OneHotEncoder(handle_unknown='ignore'), categorical),\n"
            "    ('numeric', Pipeline([('impute', SimpleImputer()), ('scale', StandardScaler())]), numeric),\n"
            "])\n"
            "model = Pipeline([('preprocess', preprocess), ('model', LogisticRegression(C=100, max_iter=2000))])\n"
            "X_train, X_test, y_train, y_test = train_test_split(\n"
            "    X, y, test_size=0.25, random_state=1729, stratify=y\n"
            ")\n"
            "model.fit(X_train, y_train)\n"
            "probability = model.predict_proba(X_test)[:, 1]\n"
            "prediction = (probability >= 0.5).astype(int)\n"
            "print(f'Random row-split accuracy: {accuracy_score(y_test, prediction):.3f}')\n"
            "print(f'Random row-split ROC AUC: {roc_auc_score(y_test, probability):.3f}')",
            execution_count=2,
            id="random-row-split",
            outputs=[
                nbformat.v4.new_output(
                    "stream",
                    name="stdout",
                    text=(
                        f"Random row-split accuracy: {accuracy:.3f}\n"
                        f"Random row-split ROC AUC: {auc:.3f}\n"
                        f"Train/test customer overlap: {overlap['count']} ({overlap['rate']:.1%})\n"
                    ),
                ),
                nbformat.v4.new_output(
                    "stream",
                    name="stdout",
                    text=f"COUNTERLAB_VERIFIED_RESULT={compact_result}",
                ),
            ],
        ),
        nbformat.v4.new_markdown_cell(
            "**Learner claim to test:** This result proves the model generalizes to customers it has never seen.",
            id="learner-claim",
        ),
    ]
    return notebook


def _imbalance_schema_summary(frame: pd.DataFrame) -> dict[str, Any]:
    fields = []
    for name, dtype in frame.dtypes.items():
        if name == "fraud":
            inferred_type = "binary"
            privacy_class = "target"
        elif name == "case_id":
            inferred_type = "categorical"
            privacy_class = "row_identifier"
        elif pd.api.types.is_numeric_dtype(dtype):
            inferred_type = "number"
            privacy_class = "feature"
        else:
            inferred_type = "categorical"
            privacy_class = "feature"
        fields.append(
            {
                "name": str(name),
                "inferredType": inferred_type,
                "privacyClass": privacy_class,
            }
        )
    return {
        "fields": fields,
        "rowCount": int(len(frame)),
        "entityCandidates": [],
        "targetCandidates": ["fraud"],
    }


def _imbalance_sample_notebook(
    frame: pd.DataFrame, result: dict[str, Any]
) -> nbformat.NotebookNode:
    model_run = _run(result, "stratified_model")
    majority_run = _run(result, "majority_baseline")
    prevalence = float(result["fixture"]["prevalence"])

    notebook = nbformat.v4.new_notebook()
    notebook["nbformat"] = 4
    notebook["nbformat_minor"] = 5
    notebook["metadata"] = {
        "kernelspec": {
            "display_name": "Python 3",
            "language": "python",
            "name": "python3",
        },
        "language_info": {"name": "python", "version": "3.14"},
        "counterlab": {
            "createdAt": CREATED_AT,
            "fixtureSeed": result["seed"],
            "resultHash": result["resultHash"],
            "schemaSummary": _imbalance_schema_summary(frame),
            "storedOutputSource": "counterlab-kernel",
        },
    }
    notebook["cells"] = [
        nbformat.v4.new_markdown_cell(
            "# Fraud screening: does 99% accuracy mean useful detection?\n\n"
            "This public sample reports aggregate accuracy on a rare-event target.",
            id="imbalance-intro",
        ),
        nbformat.v4.new_code_cell(
            "from pathlib import Path\n"
            "import pandas as pd\n\n"
            "data_path = Path('../public/fraud_rare_event.csv')\n"
            "df = pd.read_csv(data_path)\n"
            "positive_rate = df['fraud'].mean()\n"
            "print(f'Rows: {len(df)}')\n"
            "print(f'Positive rate: {positive_rate:.4%}')",
            execution_count=1,
            id="load-rare-event-fixture",
            outputs=[
                nbformat.v4.new_output(
                    "stream",
                    name="stdout",
                    text=(
                        f"Rows: {len(frame)}\n"
                        f"Positive rate: {prevalence:.4%}\n"
                    ),
                )
            ],
        ),
        nbformat.v4.new_markdown_cell(
            "## Reported evaluation\n\n"
            "The notebook uses a stratified holdout but reports only accuracy.",
            id="imbalance-evaluation-note",
        ),
        nbformat.v4.new_code_cell(
            "from sklearn.compose import ColumnTransformer\n"
            "from sklearn.linear_model import LogisticRegression\n"
            "from sklearn.metrics import accuracy_score\n"
            "from sklearn.model_selection import train_test_split\n"
            "from sklearn.pipeline import Pipeline\n"
            "from sklearn.preprocessing import OneHotEncoder, StandardScaler\n\n"
            "X = df.drop(columns=['fraud', 'case_id'])\n"
            "y = df['fraud']\n"
            "categorical = ['channel']\n"
            "numeric = [column for column in X.columns if column not in categorical]\n"
            "preprocess = ColumnTransformer([\n"
            "    ('numeric', StandardScaler(), numeric),\n"
            "    ('categorical', OneHotEncoder(handle_unknown='ignore'), categorical),\n"
            "])\n"
            "X_train, X_test, y_train, y_test = train_test_split(\n"
            "    X, y, test_size=0.25, random_state=2603, stratify=y\n"
            ")\n"
            "model = Pipeline([\n"
            "    ('preprocess', preprocess),\n"
            "    ('model', LogisticRegression(class_weight={0: 1, 1: 3}, random_state=2603)),\n"
            "])\n"
            "model.fit(X_train, y_train)\n"
            "prediction = model.predict(X_test)\n"
            "print(f'Test accuracy: {accuracy_score(y_test, prediction):.6f}')",
            execution_count=2,
            id="accuracy-only-evaluation",
            outputs=[
                nbformat.v4.new_output(
                    "stream",
                    name="stdout",
                    text=(
                        f"Test accuracy: {model_run['metrics']['accuracy']:.6f}\n"
                        f"Majority baseline accuracy: {majority_run['metrics']['accuracy']:.6f}\n"
                        f"Majority baseline recall: {majority_run['metrics']['recall']:.6f}\n"
                    ),
                )
            ],
        ),
        nbformat.v4.new_markdown_cell(
            "**Learner claim to test:** Nearly 99% test accuracy proves this classifier catches rare fraud.",
            id="imbalance-learner-claim",
        ),
    ]
    return notebook


def _epistemic_imbalance_runs(
    stratified_threshold: float,
) -> list[dict[str, object]]:
    return [
        {
            "runId": "majority",
            "operation": "imbalance.majority_baseline",
            "model": "majority_baseline",
            "seed": 2603,
            "threshold": 0.5,
            "prevalenceScenario": "observed",
        },
        {
            "runId": "stratified",
            "operation": "imbalance.stratified_holdout",
            "model": "logistic_regression",
            "seed": 2603,
            "threshold": stratified_threshold,
            "prevalenceScenario": "observed",
        },
        {
            "runId": "threshold",
            "operation": "imbalance.threshold_sweep",
            "model": "logistic_regression",
            "seed": 2603,
            "threshold": 0.25,
            "prevalenceScenario": "observed",
        },
        {
            "runId": "prevalence",
            "operation": "imbalance.prevalence_sweep",
            "model": "logistic_regression",
            "seed": 2603,
            "threshold": 0.25,
            "prevalenceScenario": "rarer",
        },
    ]


def _epistemic_imbalance_manifest() -> dict[str, Any]:
    return {
        "artifactId": "artifact-imbalance-epistemic-v2",
        "fileName": "rare-event-epistemic.ipynb",
        "fileSha256": "c" * 64,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 4,
                "type": "code",
                "sourceSha256": "d" * 64,
                "sourceExcerpt": (
                    "model = LogisticRegression(class_weight=None)\n"
                    "X_train, X_test, y_train, y_test = train_test_split(...)\n"
                    "print(accuracy_score(y_test, predictions))"
                ),
                "executionCount": 5,
                "outputHashes": ["a" * 64],
                "symbols": [
                    "LogisticRegression",
                    "accuracy_score",
                    "class_weight",
                    "train_test_split",
                ],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.99, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": {
            "fields": [
                {
                    "name": "fraud",
                    "inferredType": "integer",
                    "privacyClass": "target",
                }
            ],
            "rowCount": 6_000,
            "entityCandidates": [],
            "targetCandidates": ["fraud"],
        },
        "packageHints": ["sklearn"],
        "createdAt": CREATED_AT,
    }


def generate_public_artifacts(root: Path, *, seed: int = 1729) -> dict[str, str]:
    root = Path(root)
    fixture_dir = root / "fixtures" / "public"
    notebook_dir = root / "fixtures" / "notebooks"
    held_out_dir = root / "fixtures" / "held-out"
    fixture_dir.mkdir(parents=True, exist_ok=True)
    notebook_dir.mkdir(parents=True, exist_ok=True)
    held_out_dir.mkdir(parents=True, exist_ok=True)

    frame = generate_leakage_fixture(seed=seed)
    sort_columns = [column for column in ("observation_id", "customer_id") if column in frame]
    stable_frame = frame.sort_values(sort_columns, kind="mergesort").reset_index(drop=True)
    result = run_leakage_experiment(stable_frame, seed=seed)

    fixture_path = fixture_dir / "customer_churn.csv"
    result_path = fixture_dir / "leakage_verified_result.json"
    notebook_path = notebook_dir / "customer_churn_leakage.ipynb"
    stable_frame.to_csv(fixture_path, index=False, float_format="%.8f", lineterminator="\n")
    result_path.write_text(f"{canonical_json(result)}\n", encoding="utf-8")
    notebook_text = nbformat.writes(_sample_notebook(stable_frame, result), version=4)
    notebook_path.write_text(f"{notebook_text.rstrip()}\n", encoding="utf-8")

    imbalance_frame = generate_imbalance_fixture()
    stable_imbalance_frame = imbalance_frame.sort_values(
        "case_id", kind="mergesort"
    ).reset_index(drop=True)
    imbalance_fixture_path = fixture_dir / "fraud_rare_event.csv"
    stable_imbalance_frame.to_csv(
        imbalance_fixture_path,
        index=False,
        float_format="%.12g",
        lineterminator="\n",
    )
    stored_imbalance_frame = pd.read_csv(imbalance_fixture_path)
    imbalance_result = run_imbalance_experiment(stored_imbalance_frame)
    imbalance_result_path = fixture_dir / "imbalance_verified_result.json"
    imbalance_notebook_path = notebook_dir / "fraud_class_imbalance.ipynb"
    imbalance_result_path.write_text(
        f"{canonical_json(imbalance_result)}\n", encoding="utf-8"
    )
    imbalance_notebook_text = nbformat.writes(
        _imbalance_sample_notebook(stored_imbalance_frame, imbalance_result),
        version=4,
    )
    imbalance_notebook_path.write_text(
        f"{imbalance_notebook_text.rstrip()}\n", encoding="utf-8"
    )

    epistemic_manifest = _epistemic_imbalance_manifest()
    epistemic_manifest_path = held_out_dir / "imbalance_epistemic_manifest.json"
    epistemic_manifest_path.write_text(
        f"{canonical_json(epistemic_manifest)}\n", encoding="utf-8"
    )
    epistemic_manifest_hash = sha256_json_browser(epistemic_manifest)
    epistemic_results: dict[str, dict[str, Any]] = {}
    for verdict_region, threshold in (
        ("competing", 0.5),
        ("inconclusive", 0.45),
    ):
        epistemic_result = run_imbalance_plan(
            imbalance_frame,
            _epistemic_imbalance_runs(threshold),
            plan_id="plan-imbalance-1",
            session_id="session-imbalance-1",
            artifact_manifest_hash=epistemic_manifest_hash,
            concept_pack_version="1.0.0",
        )
        epistemic_path = (
            held_out_dir / f"imbalance_epistemic_{verdict_region}_v2.json"
        )
        epistemic_path.write_text(
            f"{canonical_json(epistemic_result)}\n", encoding="utf-8"
        )
        epistemic_results[verdict_region] = {
            "path": str(epistemic_path),
            "resultHash": epistemic_result["resultHash"],
        }

    return {
        "fixturePath": str(fixture_path),
        "notebookPath": str(notebook_path),
        "resultPath": str(result_path),
        "resultHash": result["resultHash"],
        "imbalanceFixturePath": str(imbalance_fixture_path),
        "imbalanceNotebookPath": str(imbalance_notebook_path),
        "imbalanceResultPath": str(imbalance_result_path),
        "imbalanceResultHash": imbalance_result["resultHash"],
        "imbalanceEpistemicCompetingPath": epistemic_results["competing"]["path"],
        "imbalanceEpistemicCompetingHash": epistemic_results["competing"][
            "resultHash"
        ],
        "imbalanceEpistemicInconclusivePath": epistemic_results["inconclusive"][
            "path"
        ],
        "imbalanceEpistemicInconclusiveHash": epistemic_results["inconclusive"][
            "resultHash"
        ],
        "imbalanceEpistemicManifestPath": str(epistemic_manifest_path),
        "imbalanceEpistemicManifestHash": epistemic_manifest_hash,
    }
