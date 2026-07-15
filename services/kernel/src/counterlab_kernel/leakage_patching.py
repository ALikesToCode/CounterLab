"""Fixed, artifact-bound patching for supported non-sample leakage notebooks.

The model supplies only a source-free Patch Plan. This module owns the one-cell
registered transformation and verifies the resulting notebook independently.
The exact public sample keeps its narrower token-level patch in ``patching``.
"""

from __future__ import annotations

import ast
from copy import deepcopy
from difflib import unified_diff
from hashlib import sha256
from pathlib import Path
import re
from typing import Any, Sequence

import nbformat

from .canonical import sha256_json
from .patching import _corrected_result, _patched_outputs


PATCH_SCHEMA_VERSION = "1"
PATCH_SEED = 1729
_ALLOWED_IMPORTS = frozenset({"sklearn"})


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


def _dataframe_name(source: str, target_field: str, entity_field: str) -> str:
    escaped = (re.escape(target_field), re.escape(entity_field))
    patterns = [
        rf"\b([A-Za-z_]\w*)\s*\[\s*['\"](?:{escaped[0]}|{escaped[1]})['\"]\s*\]",
        r"(?m)^\s*X\s*=\s*([A-Za-z_]\w*)\s*(?:\[|\.drop\()",
        r"\b([A-Za-z_]\w*)\.sample\(",
    ]
    for pattern in patterns:
        match = re.search(pattern, source)
        if match is not None and match.group(1) not in {"pd", "np"}:
            return match.group(1)
    raise ValueError(
        "the evaluation cell must resolve a dataframe used for the target or entity"
    )


def _patched_source(
    original_source: str,
    *,
    entity_field: str,
    target_field: str,
    excluded_fields: Sequence[str],
) -> str:
    if "train_test_split" not in original_source:
        raise ValueError("the evaluation cell does not contain a row-wise split")
    if "LogisticRegression" not in original_source:
        raise ValueError(
            "the registered non-sample patch currently preserves logistic-regression evaluations only"
        )
    dataframe = _dataframe_name(original_source, target_field, entity_field)
    excluded = list(
        dict.fromkeys([target_field, entity_field, *excluded_fields])
    )
    return f"""# CounterLab verified entity-boundary evaluation (fixed operation set)
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

groups = {dataframe}[{entity_field!r}]
X = {dataframe}.drop(columns={excluded!r}, errors='ignore')
y = {dataframe}[{target_field!r}]
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
splitter = GroupShuffleSplit(
    n_splits=1, test_size=0.25, random_state={PATCH_SEED}
)
train_index, test_index = next(splitter.split(X, y, groups=groups))
X_train, X_test = X.iloc[train_index], X.iloc[test_index]
y_train, y_test = y.iloc[train_index], y.iloc[test_index]
train_entities = set(groups.iloc[train_index].astype(str))
test_entities = set(groups.iloc[test_index].astype(str))
entity_overlap = train_entities.intersection(test_entities)
assert not entity_overlap

model = Pipeline([
    ('preprocess', preprocess),
    ('model', LogisticRegression(
        C=50.0,
        max_iter=2000,
        random_state={PATCH_SEED},
        solver='liblinear',
    )),
])
model.fit(X_train, y_train)
prediction = model.predict(X_test)
probability = model.predict_proba(X_test)[:, 1]
print(f'Entity group-split accuracy: {{accuracy_score(y_test, prediction):.3f}}')
print(f'Entity group-split ROC AUC: {{roc_auc_score(y_test, probability):.3f}}')
print(f'Train/test entity overlap: {{len(entity_overlap)}}')
"""


def _imports(source: str) -> set[str]:
    tree = ast.parse(source)
    imports: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            imports.update(alias.name.split(".", 1)[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.add(node.module.split(".", 1)[0])
    return imports


def _verify_source(
    source: str,
    *,
    entity_field: str,
    target_field: str,
    excluded_fields: Sequence[str],
) -> list[dict[str, str]]:
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return [{"code": "INVALID_PATCH_SOURCE", "message": str(error)}]
    violations: list[dict[str, str]] = []
    added = sorted(_imports(source).difference(_ALLOWED_IMPORTS))
    if added:
        violations.append(
            {"code": "DEPENDENCY_NOT_ALLOWED", "message": ", ".join(added)}
        )
    required = {
        "GROUP_SPLIT": "GroupShuffleSplit",
        "ZERO_OVERLAP_CHECK": "assert not entity_overlap",
        "ENTITY_FIELD_RESOLVED": repr(entity_field),
        "TARGET_FIELD_RESOLVED": repr(target_field),
        "METRICS_RECOMPUTED": "accuracy_score(y_test, prediction)",
    }
    for code, marker in required.items():
        if marker not in source:
            violations.append({"code": code, "message": f"missing {marker}"})
    excluded_literal = repr(
        list(dict.fromkeys([target_field, entity_field, *excluded_fields]))
    )
    if f"drop(columns={excluded_literal}" not in source:
        violations.append(
            {
                "code": "IDENTITY_FEATURE_RETAINED",
                "message": "the entity and row identifiers were not excluded",
            }
        )
    forbidden_calls = {"eval", "exec", "compile", "open", "__import__"}
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Name)
            and node.func.id in forbidden_calls
        ):
            violations.append(
                {"code": "FORBIDDEN_CALL", "message": node.func.id}
            )
    return violations


def verify_leakage_notebook_patch(
    *,
    original_notebook: Path,
    candidate_notebook: Path,
    fixture_csv: Path,
    target_cell: int,
    entity_field: str,
    target_field: str,
    excluded_fields: Sequence[str],
) -> dict[str, Any]:
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
            "violations": [{"code": "INVALID_NOTEBOOK", "message": str(error)}],
        }

    violations: list[dict[str, str]] = []
    if target_cell < 0 or target_cell >= len(original.cells):
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "REJECTED",
            "verified": False,
            "changedCellIndices": [],
            "unrelatedCellSourceHashes": [],
            "violations": [
                {"code": "TARGET_CELL_MISSING", "message": "target cell is absent"}
            ],
        }
    if len(candidate.cells) != len(original.cells):
        violations.append(
            {"code": "CELL_COUNT_CHANGED", "message": "cells cannot be added or removed"}
        )
    if candidate.get("metadata") != original.get("metadata"):
        violations.append(
            {"code": "NOTEBOOK_METADATA_CHANGED", "message": "metadata changed"}
        )
    if (
        candidate.get("nbformat") != original.get("nbformat")
        or candidate.get("nbformat_minor") != original.get("nbformat_minor")
    ):
        violations.append(
            {"code": "NBFORMAT_CHANGED", "message": "notebook format changed"}
        )

    before_source = str(original.cells[target_cell].get("source", ""))
    try:
        expected_source = _patched_source(
            before_source,
            entity_field=entity_field,
            target_field=target_field,
            excluded_fields=excluded_fields,
        )
        corrected = _corrected_result(Path(fixture_csv))
        repeated = _corrected_result(Path(fixture_csv))
    except Exception as error:
        expected_source = ""
        corrected = {}
        repeated = {"different": True}
        violations.append({"code": "FIXED_KERNEL_FAILED", "message": str(error)})

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
                    "message": "evaluation source is not the registered correction",
                }
            )
        for violation in _verify_source(
            candidate_source,
            entity_field=entity_field,
            target_field=target_field,
            excluded_fields=excluded_fields,
        ):
            if not any(item["code"] == violation["code"] for item in violations):
                violations.append(violation)
        expected_outputs = _patched_outputs(corrected) if corrected else []
        if candidate.cells[target_cell].get("outputs", []) != expected_outputs:
            violations.append(
                {
                    "code": "PATCH_OUTPUT_MISMATCH",
                    "message": "stored outputs do not match fixed-kernel recomputation",
                }
            )
    if corrected and corrected.get("entityOverlap") != {"count": 0, "rate": 0.0}:
        violations.append(
            {
                "code": "GROUP_OVERLAP_REMAINS",
                "message": "the registered public fixture boundary was not verified",
            }
        )
    if corrected != repeated:
        violations.append(
            {"code": "NONDETERMINISTIC_RESULT", "message": "recomputation changed"}
        )
    if changed_indices != [target_cell]:
        violations.append(
            {
                "code": "CHANGED_CELL_SCOPE",
                "message": "exactly one approved evaluation cell must change",
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


def compile_leakage_notebook_patch(
    *,
    original_notebook: Path,
    fixture_csv: Path,
    output_dir: Path,
    transfer_passed: bool,
    target_cell: int,
    entity_field: str,
    target_field: str,
    excluded_fields: Sequence[str],
) -> dict[str, Any]:
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
            entity_field=entity_field,
            target_field=target_field,
            excluded_fields=excluded_fields,
        )
        source_violations = _verify_source(
            after,
            entity_field=entity_field,
            target_field=target_field,
            excluded_fields=excluded_fields,
        )
        if source_violations:
            raise ValueError(f"fixed patch source failed policy: {source_violations}")
        corrected = _corrected_result(Path(fixture_csv))
        if corrected.get("entityOverlap") != {"count": 0, "rate": 0.0}:
            raise ValueError("fixed corrected result retains entity overlap")
        if corrected != _corrected_result(Path(fixture_csv)):
            raise ValueError("fixed corrected result is not deterministic")
        patched = deepcopy(original)
        patched.cells[target_cell].source = after
        patched.cells[target_cell].outputs = _patched_outputs(corrected)
        nbformat.validate(patched)
        patch_bytes = _serialize_notebook(patched)
    except Exception as error:
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "UNVERIFIED",
            "verified": False,
            "reasonCode": "OUTSIDE_PATCH_SUPPORT_CONTRACT",
            "message": str(error),
        }

    destination = Path(output_dir)
    destination.mkdir(parents=True, exist_ok=True)
    patch_path = destination / f"{original_path.stem}.patched.ipynb"
    if patch_path.resolve() == original_path.resolve():
        raise ValueError("patch destination must not overwrite the original notebook")
    patch_path.write_bytes(patch_bytes)
    report = verify_leakage_notebook_patch(
        original_notebook=original_path,
        candidate_notebook=patch_path,
        fixture_csv=fixture_csv,
        target_cell=target_cell,
        entity_field=entity_field,
        target_field=target_field,
        excluded_fields=excluded_fields,
    )
    if report.get("status") != "VERIFIED":
        return {
            **report,
            "patchPath": str(patch_path),
            "reasonCode": "PATCH_VERIFIER_REJECTED",
        }

    original_hash = _sha256_bytes(original_path.read_bytes())
    patched_hash = _sha256_bytes(patch_bytes)
    invariants = [
        "VALID_NBFORMAT",
        "EVALUATION_CELL_ONLY",
        "NO_UNAPPROVED_DEPENDENCIES",
        "GROUP_HOLDOUT",
        "ZERO_ENTITY_OVERLAP",
        "IDENTITY_FEATURE_EXCLUDED",
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
        "cellDiff": _cell_diff(target_cell, before, after),
        "unrelatedCellSourceHashes": report["unrelatedCellSourceHashes"],
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
                "entityField": entity_field,
                "targetField": target_field,
            }
        ),
    }
