"""Deterministic, transfer-gated patching for supported imbalance notebooks.

The model supplies only a typed Patch Plan.  This module owns the source
transformation, recomputes the displayed result with the fixed kernel, and
verifies the resulting notebook bytes before release.
"""

from __future__ import annotations

import ast
from copy import deepcopy
from difflib import unified_diff
from hashlib import sha256
from pathlib import Path
import re
from typing import Any, Mapping, Sequence

import nbformat
import pandas as pd

from .canonical import canonical_json, sha256_json
from .imbalance import run_imbalance_experiment
from .imbalance_verifier import verify_imbalance_candidate


PATCH_SCHEMA_VERSION = "1"
PATCH_SEED = 2603
_ALLOWED_IMPORTS = frozenset({"numpy", "sklearn"})


def _sha256_bytes(value: bytes) -> str:
    return sha256(value).hexdigest()


def _source_hash(source: object) -> str:
    return _sha256_bytes(str(source).encode("utf-8"))


def _serialize_notebook(notebook: nbformat.NotebookNode) -> bytes:
    text = nbformat.writes(notebook, version=4)
    return f"{text.rstrip()}\n".encode("utf-8")


def _cell_diff(index: int, before: str, after: str) -> str:
    return "\n".join(
        unified_diff(
            before.splitlines(keepends=True),
            after.splitlines(keepends=True),
            fromfile=f"cell-{index}-before.py",
            tofile=f"cell-{index}-after.py",
            lineterm="",
        )
    )


def _dataframe_name(source: str) -> str:
    match = re.search(r"(?m)^\s*X\s*=\s*([A-Za-z_]\w*)\.drop\(", source)
    if match is None:
        raise ValueError(
            "the evaluation cell must assign X from a dataframe with .drop(...)"
        )
    return match.group(1)


def _patched_source(
    original_source: str,
    *,
    target_field: str,
    excluded_fields: Sequence[str],
) -> str:
    """Create the registered evaluation block; no model-authored source is used."""

    dataframe = _dataframe_name(original_source)
    excluded = list(dict.fromkeys([target_field, *excluded_fields]))
    excluded_literal = repr(excluded)
    target_literal = repr(target_field)
    return f"""# CounterLab verified rare-event evaluation (fixed operation set)
import numpy as np
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

X = {dataframe}.drop(columns={excluded_literal}, errors='ignore')
y = {dataframe}[{target_literal}]
categorical = list(X.select_dtypes(include=['object', 'category']).columns)
numeric = [column for column in X.columns if column not in categorical]
preprocess = ColumnTransformer([
    ('numeric', Pipeline([
        ('impute', SimpleImputer(strategy='median')),
        ('scale', StandardScaler()),
    ]), numeric),
    ('categorical', Pipeline([
        ('impute', SimpleImputer(strategy='most_frequent')),
        ('encode', OneHotEncoder(handle_unknown='ignore')),
    ]), categorical),
])
X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.25, random_state={PATCH_SEED}, stratify=y
)
model = Pipeline([
    ('preprocess', preprocess),
    ('model', LogisticRegression(
        class_weight={{0: 1.0, 1: 3.0}},
        max_iter=2000,
        random_state={PATCH_SEED},
        solver='liblinear',
    )),
])
model.fit(X_train, y_train)
probability = model.predict_proba(X_test)[:, 1]

# The threshold is explicit so deployment costs can be reviewed and retuned.
decision_threshold = 0.25
prediction = (probability >= decision_threshold).astype(int)
majority_class = int(y_train.mode().iloc[0])
majority_prediction = np.full(len(y_test), majority_class, dtype=int)

matrix = confusion_matrix(y_test, prediction, labels=[0, 1])
metrics = {{
    'accuracy': accuracy_score(y_test, prediction),
    'precision': precision_score(y_test, prediction, zero_division=0),
    'recall': recall_score(y_test, prediction, zero_division=0),
    'f1': f1_score(y_test, prediction, zero_division=0),
    'pr_auc': average_precision_score(y_test, probability),
    'roc_auc': roc_auc_score(y_test, probability),
    'majority_accuracy': accuracy_score(y_test, majority_prediction),
}}
print('Confusion matrix:', matrix.tolist())
print('Decision threshold:', decision_threshold)
print('Majority baseline accuracy:', metrics['majority_accuracy'])
print('Precision / recall / F1:', metrics['precision'], metrics['recall'], metrics['f1'])
print('PR-AUC / ROC-AUC:', metrics['pr_auc'], metrics['roc_auc'])
"""


def _output_payload(result: Mapping[str, Any]) -> list[nbformat.NotebookNode]:
    runs = {str(run["operation"]): run for run in result["runs"]}
    majority = runs["imbalance.majority_baseline"]
    threshold = runs["imbalance.threshold_sweep"]
    matrix = threshold["confusionMatrix"]
    metrics = threshold["metrics"]
    summary = (
        f"Fixture prevalence: {result['fixture']['prevalence']:.2%}\n"
        f"Majority baseline accuracy: {majority['metrics']['accuracy']:.4f}\n"
        f"Confusion matrix [tn, fp, fn, tp]: "
        f"{[matrix['tn'], matrix['fp'], matrix['fn'], matrix['tp']]}\n"
        f"Precision: {metrics['precision']:.4f}; recall: {metrics['recall']:.4f}; "
        f"F1: {metrics['f1']:.4f}; PR-AUC: {metrics['prAuc']:.4f}\n"
        f"Decision threshold: {threshold['threshold']:.2f}\n"
    )
    return [
        nbformat.v4.new_output("stream", name="stdout", text=summary),
        nbformat.v4.new_output(
            "stream",
            name="stdout",
            text=f"COUNTERLAB_PATCHED_RESULT={canonical_json(result)}",
        ),
    ]


def _imports(source: str) -> set[str]:
    tree = ast.parse(source)
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name.split(".", 1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module.split(".", 1)[0])
    return imports


def _verify_source(source: str) -> list[dict[str, str]]:
    violations: list[dict[str, str]] = []
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return [{"code": "INVALID_PATCH_SOURCE", "message": str(error)}]
    added = sorted(_imports(source).difference(_ALLOWED_IMPORTS))
    if added:
        violations.append(
            {"code": "DEPENDENCY_NOT_ALLOWED", "message": ", ".join(added)}
        )
    required = {
        "STRATIFIED_HOLDOUT": "stratify=y",
        "MAJORITY_BASELINE_COMPUTED": "majority_prediction",
        "MINORITY_METRICS_RECOMPUTED": "average_precision_score",
        "THRESHOLD_DOCUMENTED": "decision_threshold",
    }
    for code, marker in required.items():
        if marker not in source:
            violations.append({"code": code, "message": f"missing {marker}"})
    forbidden_calls = {"eval", "exec", "compile", "open", "__import__"}
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            if node.func.id in forbidden_calls:
                violations.append(
                    {"code": "FORBIDDEN_CALL", "message": node.func.id}
                )
    return violations


def verify_imbalance_notebook_patch(
    *,
    original_notebook: Path,
    candidate_notebook: Path,
    fixture_csv: Path,
    target_cell: int,
    target_field: str,
    excluded_fields: Sequence[str],
) -> dict[str, Any]:
    """Verify candidate notebook bytes outside the Plan/compiler authority."""

    try:
        original = nbformat.read(original_notebook, as_version=4)
        candidate = nbformat.read(candidate_notebook, as_version=4)
        nbformat.validate(original)
        nbformat.validate(candidate)
    except Exception as error:
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "REJECTED",
            "verified": False,
            "changedCellIndices": [],
            "unrelatedCellSourceHashes": [],
            "violations": [
                {"code": "INVALID_NOTEBOOK", "message": str(error)}
            ],
        }

    violations: list[dict[str, str]] = []
    if target_cell < 0 or target_cell >= len(original.cells):
        violations.append(
            {"code": "TARGET_CELL_MISSING", "message": "target cell is absent"}
        )
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "REJECTED",
            "verified": False,
            "changedCellIndices": [],
            "unrelatedCellSourceHashes": [],
            "violations": violations,
        }
    if len(candidate.cells) != len(original.cells):
        violations.append(
            {
                "code": "CELL_COUNT_CHANGED",
                "message": "the repair cannot add or remove notebook cells",
            }
        )
    if candidate.get("metadata") != original.get("metadata"):
        violations.append(
            {
                "code": "NOTEBOOK_METADATA_CHANGED",
                "message": "notebook metadata must remain unchanged",
            }
        )
    if (
        candidate.get("nbformat") != original.get("nbformat")
        or candidate.get("nbformat_minor") != original.get("nbformat_minor")
    ):
        violations.append(
            {
                "code": "NBFORMAT_CHANGED",
                "message": "the notebook format version must remain unchanged",
            }
        )

    before_source = str(original.cells[target_cell].get("source", ""))
    try:
        expected_source = _patched_source(
            before_source,
            target_field=target_field,
            excluded_fields=excluded_fields,
        )
        fixture = pd.read_csv(fixture_csv)
        corrected = run_imbalance_experiment(fixture, seed=PATCH_SEED)
        repeated = run_imbalance_experiment(fixture, seed=PATCH_SEED)
        result_verification = verify_imbalance_candidate(corrected)
    except Exception as error:
        violations.append(
            {"code": "FIXED_KERNEL_FAILED", "message": str(error)}
        )
        corrected = {}
        repeated = {"different": True}
        result_verification = {"status": "REJECTED"}
        expected_source = ""

    changed_indices: list[int] = []
    unrelated: list[dict[str, Any]] = []
    for index in range(min(len(original.cells), len(candidate.cells))):
        original_cell = original.cells[index]
        candidate_cell = candidate.cells[index]
        before_hash = _source_hash(original_cell.get("source", ""))
        after_hash = _source_hash(candidate_cell.get("source", ""))
        if before_hash != after_hash:
            changed_indices.append(index)
        if index == target_cell:
            continue
        unchanged = original_cell == candidate_cell
        unrelated.append(
            {
                "cellIndex": index,
                "beforeSha256": before_hash,
                "afterSha256": after_hash,
                "unchanged": unchanged,
            }
        )
        if not unchanged:
            violations.append(
                {
                    "code": "UNRELATED_CELL_CHANGED",
                    "message": f"cell {index} is outside the Patch Plan scope",
                }
            )

    if len(candidate.cells) > target_cell:
        candidate_source = str(candidate.cells[target_cell].get("source", ""))
        if candidate_source != expected_source:
            violations.append(
                {
                    "code": "PATCH_SOURCE_MISMATCH",
                    "message": "evaluation source is not the registered minimal repair",
                }
            )
        for violation in _verify_source(candidate_source):
            if not any(item["code"] == violation["code"] for item in violations):
                violations.append(violation)
        expected_outputs = _output_payload(corrected) if corrected else []
        if candidate.cells[target_cell].get("outputs", []) != expected_outputs:
            violations.append(
                {
                    "code": "PATCH_OUTPUT_MISMATCH",
                    "message": "stored outputs do not match the fixed-kernel result",
                }
            )
    if result_verification.get("status") != "VERIFIED":
        violations.append(
            {
                "code": "FIXED_RESULT_REJECTED",
                "message": "the external result verifier rejected recomputation",
            }
        )
    if corrected != repeated:
        violations.append(
            {
                "code": "NONDETERMINISTIC_RESULT",
                "message": "the same fixture and seed changed the result",
            }
        )
    if changed_indices != [target_cell]:
        violations.append(
            {
                "code": "CHANGED_CELL_SCOPE",
                "message": "exactly the approved evaluation cell must change",
            }
        )

    verified = not violations
    return {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "VERIFIED" if verified else "REJECTED",
        "verified": verified,
        "changedCellIndices": changed_indices,
        "cellDiff": _cell_diff(target_cell, before_source, expected_source),
        "unrelatedCellSourceHashes": unrelated,
        "correctedResult": corrected,
        "violations": violations,
    }


def compile_imbalance_notebook_patch(
    *,
    original_notebook: Path,
    fixture_csv: Path,
    output_dir: Path,
    transfer_passed: bool,
    target_cell: int,
    target_field: str,
    excluded_fields: Sequence[str],
) -> dict[str, Any]:
    """Apply and independently verify the registered imbalance repair."""

    if not transfer_passed:
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "LOCKED",
            "verified": False,
            "reasonCode": "TRANSFER_REQUIRED",
        }
    original_path = Path(original_notebook)
    try:
        original = nbformat.read(original_path, as_version=4)
        nbformat.validate(original)
        if target_cell < 0 or target_cell >= len(original.cells):
            raise ValueError("target cell is outside the notebook")
        if original.cells[target_cell].get("cell_type") != "code":
            raise ValueError("target cell must be code")
        before = str(original.cells[target_cell].get("source", ""))
        after = _patched_source(
            before,
            target_field=target_field,
            excluded_fields=excluded_fields,
        )
        source_violations = _verify_source(after)
        if source_violations:
            raise ValueError(f"fixed patch source failed policy: {source_violations}")

        fixture = pd.read_csv(fixture_csv)
        corrected = run_imbalance_experiment(fixture, seed=PATCH_SEED)
        repeated = run_imbalance_experiment(fixture, seed=PATCH_SEED)
        report = verify_imbalance_candidate(corrected)
        if report.get("status") != "VERIFIED":
            raise ValueError("fixed imbalance result failed the external verifier")
        if corrected != repeated:
            raise ValueError("fixed imbalance result is not deterministic")

        patched = deepcopy(original)
        patched.cells[target_cell].source = after
        patched.cells[target_cell].outputs = _output_payload(corrected)
        nbformat.validate(patched)
        patch_bytes = _serialize_notebook(patched)
        repeated_bytes = _serialize_notebook(patched)
        if patch_bytes != repeated_bytes:
            raise ValueError("patched notebook bytes are not deterministic")
    except Exception as error:
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "UNVERIFIED",
            "verified": False,
            "reasonCode": "OUTSIDE_PATCH_SUPPORT_CONTRACT",
            "message": str(error),
        }

    unrelated: list[dict[str, Any]] = []
    for index, original_cell in enumerate(original.cells):
        if index == target_cell:
            continue
        patched_cell = patched.cells[index]
        unrelated.append(
            {
                "cellIndex": index,
                "beforeSha256": _source_hash(original_cell.get("source", "")),
                "afterSha256": _source_hash(patched_cell.get("source", "")),
                "unchanged": original_cell == patched_cell,
            }
        )
    if not all(item["unchanged"] for item in unrelated):
        raise ValueError("fixed patch changed an unrelated cell")

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    patch_path = destination / f"{original_path.stem}.patched.ipynb"
    if patch_path.resolve() == original_path.resolve():
        raise ValueError("patch destination must not overwrite the original notebook")
    patch_path.write_bytes(patch_bytes)
    if patch_path.read_bytes() != patch_bytes:
        raise ValueError("patched notebook bytes changed after write")

    external_verification = verify_imbalance_notebook_patch(
        original_notebook=original_path,
        candidate_notebook=patch_path,
        fixture_csv=fixture_csv,
        target_cell=target_cell,
        target_field=target_field,
        excluded_fields=excluded_fields,
    )
    if external_verification.get("status") != "VERIFIED":
        return {
            **external_verification,
            "patchPath": str(patch_path),
            "reasonCode": "PATCH_VERIFIER_REJECTED",
        }

    diff = _cell_diff(target_cell, before, after)
    original_hash = _sha256_bytes(original_path.read_bytes())
    patched_hash = _sha256_bytes(patch_bytes)
    invariants = [
        "VALID_NBFORMAT",
        "EVALUATION_CELL_ONLY",
        "NO_UNAPPROVED_DEPENDENCIES",
        "STRATIFIED_HOLDOUT",
        "MAJORITY_BASELINE_COMPUTED",
        "MINORITY_METRICS_RECOMPUTED",
        "THRESHOLD_DOCUMENTED",
        "FIXED_KERNEL_RESULT_VERIFIED",
        "DETERMINISTIC_PATCH_BYTES",
    ]
    return {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "VERIFIED",
        "verified": True,
        "patchPath": str(patch_path),
        "originalSha256": original_hash,
        "patchedSha256": patched_hash,
        "changedCellIndices": [target_cell],
        "cellDiff": diff,
        "unrelatedCellSourceHashes": unrelated,
        "correctedResult": corrected,
        "verification": {
            "status": "VERIFIED",
            "violations": [],
            "invariants": invariants,
        },
        "metadataHash": sha256_json(
            {
                "source": original_hash,
                "patched": patched_hash,
                "targetCell": target_cell,
                "invariants": invariants,
            }
        ),
    }


__all__ = [
    "compile_imbalance_notebook_patch",
    "verify_imbalance_notebook_patch",
]
