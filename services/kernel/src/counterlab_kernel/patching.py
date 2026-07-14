"""Transfer-gated patching and verification for the exact public leakage sample."""

from __future__ import annotations

import ast
from copy import deepcopy
from difflib import unified_diff
from hashlib import sha256
from pathlib import Path
import re
from typing import Any, Mapping

import nbformat
import pandas as pd
from sklearn.model_selection import GroupShuffleSplit

from .canonical import canonical_json, sha256_json
from .experiment import (
    ENTITY,
    KERNEL_VERSION,
    TARGET,
    _fixture_records,
    _run,
    _sorted_fixture,
    _validate_fixture,
    run_leakage_experiment,
)
from .transfer import evaluate_forecasting_transfer


PATCH_SCHEMA_VERSION = "1"
PATCHED_CELL_ID = "random-row-split"
PATCH_SEED = 1729


def _sha256_bytes(value: bytes) -> str:
    return sha256(value).hexdigest()


def _source_hash(source: object) -> str:
    return _sha256_bytes(str(source).encode("utf-8"))


def _serialize_notebook(notebook: nbformat.NotebookNode) -> bytes:
    text = nbformat.writes(notebook, version=4)
    return f"{text.rstrip()}\n".encode("utf-8")


def _load_notebook(path: Path) -> nbformat.NotebookNode:
    notebook = nbformat.read(path, as_version=4)
    nbformat.validate(notebook)
    return notebook


def _evaluation_cell_index(notebook: nbformat.NotebookNode) -> int:
    matches = [
        index
        for index, cell in enumerate(notebook.cells)
        if cell.get("id") == PATCHED_CELL_ID and cell.get("cell_type") == "code"
    ]
    if matches != [3]:
        raise ValueError(
            "notebook is outside the exact public patch support contract: "
            "evaluation cell random-row-split must be cell 3"
        )
    return matches[0]


def _validate_supported_original(
    notebook: nbformat.NotebookNode, fixture_csv: Path
) -> None:
    expected_cell_ids = [
        "counterlab-intro",
        "load-fixture",
        "evaluation-note",
        PATCHED_CELL_ID,
        "learner-claim",
    ]
    if [cell.get("id") for cell in notebook.cells] != expected_cell_ids:
        raise ValueError(
            "notebook is outside the exact public patch support contract: "
            "public sample cell identities do not match"
        )

    frame = pd.read_csv(fixture_csv)
    verified_result = run_leakage_experiment(frame, seed=PATCH_SEED)
    counterlab_metadata = notebook.get("metadata", {}).get("counterlab", {})
    if not isinstance(counterlab_metadata, Mapping) or (
        counterlab_metadata.get("fixtureSeed") != PATCH_SEED
        or counterlab_metadata.get("storedOutputSource") != "counterlab-kernel"
        or counterlab_metadata.get("resultHash") != verified_result["resultHash"]
    ):
        raise ValueError(
            "notebook is outside the exact public patch support contract: "
            "CounterLab manifest does not resolve to the recomputed fixture result"
        )

    evaluation_index = _evaluation_cell_index(notebook)
    expected_payload = f"COUNTERLAB_VERIFIED_RESULT={canonical_json(verified_result)}"
    stored_outputs = [
        str(output.get("text", ""))
        for output in notebook.cells[evaluation_index].get("outputs", [])
        if output.get("output_type") == "stream"
    ]
    if expected_payload not in stored_outputs:
        raise ValueError(
            "notebook is outside the exact public patch support contract: "
            "stored verified payload does not match the fixed kernel"
        )


def _replace_once(source: str, before: str, after: str) -> str:
    if source.count(before) != 1:
        raise ValueError(
            "notebook is outside the exact public patch support contract: "
            f"expected one evaluation fragment {before!r}"
        )
    return source.replace(before, after, 1)


def _patched_evaluation_source(source: str) -> str:
    patched = _replace_once(
        source,
        "from sklearn.model_selection import train_test_split",
        "from sklearn.model_selection import GroupShuffleSplit",
    )
    patched = _replace_once(
        patched,
        "X = df.drop(columns=['churned'])\ny = df['churned']",
        (
            "groups = df['customer_id']\n"
            "X = df.drop(columns=['churned', 'customer_id', 'observation_id'])\n"
            "y = df['churned']"
        ),
    )
    patched = _replace_once(
        patched,
        (
            "X_train, X_test, y_train, y_test = train_test_split(\n"
            "    X, y, test_size=0.25, random_state=1729, stratify=y\n"
            ")"
        ),
        (
            "splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, "
            "random_state=1729)\n"
            "train_index, test_index = next(splitter.split(X, y, groups=groups))\n"
            "X_train, X_test = X.iloc[train_index], X.iloc[test_index]\n"
            "y_train, y_test = y.iloc[train_index], y.iloc[test_index]\n"
            "train_customers = set(groups.iloc[train_index])\n"
            "test_customers = set(groups.iloc[test_index])\n"
            "customer_overlap = train_customers.intersection(test_customers)\n"
            "assert not customer_overlap"
        ),
    )
    patched = _replace_once(
        patched,
        "print(f'Random row-split accuracy: {accuracy_score(y_test, prediction):.3f}')",
        "print(f'Customer group-split accuracy: {accuracy_score(y_test, prediction):.3f}')",
    )
    patched = _replace_once(
        patched,
        "print(f'Random row-split ROC AUC: {roc_auc_score(y_test, probability):.3f}')",
        (
            "print(f'Customer group-split ROC AUC: "
            "{roc_auc_score(y_test, probability):.3f}')\n"
            "print(f'Train/test customer overlap: {len(customer_overlap)}')"
        ),
    )
    return patched


def _corrected_result(fixture_csv: Path, seed: int = PATCH_SEED) -> dict[str, Any]:
    frame = pd.read_csv(fixture_csv)
    _validate_fixture(frame)
    fixture = _sorted_fixture(frame)
    fixture_hash = sha256_json(_fixture_records(fixture))
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=seed)
    train_positions, test_positions = next(
        splitter.split(fixture, fixture[TARGET], groups=fixture[ENTITY])
    )
    train = fixture.iloc[sorted(train_positions)].reset_index(drop=True)
    test = fixture.iloc[sorted(test_positions)].reset_index(drop=True)
    result = _run(
        run_id="patched_customer_group_split",
        split_strategy="group",
        train=train,
        test=test,
        drop_features=(ENTITY,),
        seed=seed,
        fixture_hash=fixture_hash,
    )
    result["schemaVersion"] = "1"
    result["kernelVersion"] = KERNEL_VERSION
    result["resultHash"] = sha256_json(result)
    return result


def _patched_outputs(result: Mapping[str, Any]) -> list[nbformat.NotebookNode]:
    metrics = result["metrics"]
    overlap = result["entityOverlap"]
    return [
        nbformat.v4.new_output(
            "stream",
            name="stdout",
            text=(
                f"Customer group-split accuracy: {metrics['accuracy']:.3f}\n"
                f"Customer group-split ROC AUC: {metrics['rocAuc']:.3f}\n"
                f"Train/test customer overlap: {overlap['count']} "
                f"({overlap['rate']:.1%})\n"
            ),
        ),
        nbformat.v4.new_output(
            "stream",
            name="stdout",
            text=f"COUNTERLAB_PATCHED_RESULT={canonical_json(result)}",
        ),
    ]


def _cell_diff(before: str, after: str) -> str:
    lines = unified_diff(
        before.splitlines(keepends=True),
        after.splitlines(keepends=True),
        fromfile="cell-3-before.py",
        tofile="cell-3-after.py",
        lineterm="",
    )
    return "\n".join(lines)


def _build_expected_patch(
    original: nbformat.NotebookNode, result: Mapping[str, Any]
) -> tuple[nbformat.NotebookNode, str]:
    index = _evaluation_cell_index(original)
    before = str(original.cells[index].source)
    after = _patched_evaluation_source(before)
    patched = deepcopy(original)
    patched.cells[index].source = after
    patched.cells[index].outputs = _patched_outputs(result)
    nbformat.validate(patched)
    return patched, _cell_diff(before, after)


def _top_level_imports(notebook: nbformat.NotebookNode) -> set[str]:
    imports: set[str] = set()
    for cell in notebook.cells:
        if cell.get("cell_type") != "code":
            continue
        try:
            tree = ast.parse(str(cell.get("source", "")))
        except SyntaxError:
            continue
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                imports.update(alias.name.split(".", 1)[0] for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                imports.add(node.module.split(".", 1)[0])
    return imports


def _has_hardcoded_metric(source: str) -> bool:
    try:
        tree = ast.parse(source)
    except SyntaxError:
        return False
    metric_names = ("accuracy", "auc", "metric", "score")
    for node in ast.walk(tree):
        if not isinstance(node, (ast.Assign, ast.AnnAssign)):
            continue
        targets = node.targets if isinstance(node, ast.Assign) else [node.target]
        value = node.value
        if not isinstance(value, ast.Constant) or not isinstance(value.value, (int, float)):
            continue
        for target in targets:
            if isinstance(target, ast.Name) and any(
                token in target.id.lower() for token in metric_names
            ):
                return True
    return bool(
        re.search(
            r"(?:accuracy|auc|metric|score)\s*=\s*[-+]?\d+(?:\.\d+)?",
            source,
            flags=re.IGNORECASE,
        )
    )


def _violation(code: str, message: str, *, cell_index: int | None = None) -> dict[str, Any]:
    item: dict[str, Any] = {"code": code, "message": message}
    if cell_index is not None:
        item["cellIndex"] = cell_index
    return item


def _invalid_notebook_report(message: str) -> dict[str, Any]:
    return {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "REJECTED",
        "verified": False,
        "changedCellIndices": [],
        "unrelatedCellSourceHashes": [],
        "violations": [_violation("INVALID_NOTEBOOK", message)],
    }


def verify_sample_notebook_patch(
    *,
    original_notebook: Path,
    candidate_notebook: Path,
    fixture_csv: Path,
) -> dict[str, Any]:
    """Verify a candidate against the exact public-sample patch contract."""

    original_path = Path(original_notebook)
    candidate_path = Path(candidate_notebook)
    fixture_path = Path(fixture_csv)
    try:
        original = _load_notebook(original_path)
        candidate = _load_notebook(candidate_path)
    except Exception as error:
        return _invalid_notebook_report(str(error))

    try:
        _validate_supported_original(original, fixture_path)
        corrected = _corrected_result(fixture_path)
        repeated = _corrected_result(fixture_path)
        expected, diff = _build_expected_patch(original, corrected)
        evaluation_index = _evaluation_cell_index(original)
    except Exception as error:
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "UNVERIFIED",
            "verified": False,
            "changedCellIndices": [],
            "unrelatedCellSourceHashes": [],
            "violations": [_violation("UNSUPPORTED_ORIGINAL", str(error))],
        }

    violations: list[dict[str, Any]] = []
    if original_path.resolve() == candidate_path.resolve():
        violations.append(
            _violation("ORIGINAL_OVERWRITE", "candidate path must not be the original")
        )

    if candidate.get("metadata") != original.get("metadata"):
        violations.append(
            _violation(
                "NOTEBOOK_METADATA_CHANGED",
                "the minimal patch must preserve notebook metadata",
            )
        )
    if (
        candidate.get("nbformat") != original.get("nbformat")
        or candidate.get("nbformat_minor") != original.get("nbformat_minor")
    ):
        violations.append(
            _violation(
                "NBFORMAT_CHANGED",
                "the patch must preserve the original nbformat version",
            )
        )

    changed_indices: list[int] = []
    unrelated_hashes: list[dict[str, Any]] = []
    if len(candidate.cells) != len(original.cells):
        violations.append(
            _violation(
                "CELL_COUNT_CHANGED",
                "the patch must not add or remove notebook cells",
            )
        )
    shared_count = min(len(candidate.cells), len(original.cells))
    for index in range(shared_count):
        original_cell = original.cells[index]
        candidate_cell = candidate.cells[index]
        before_hash = _source_hash(original_cell.get("source", ""))
        after_hash = _source_hash(candidate_cell.get("source", ""))
        if before_hash != after_hash:
            changed_indices.append(index)
        if index == evaluation_index:
            continue
        unrelated_hashes.append(
            {
                "cellIndex": index,
                "beforeSha256": before_hash,
                "afterSha256": after_hash,
                "unchanged": original_cell == candidate_cell,
            }
        )
        if original_cell != candidate_cell:
            violations.append(
                _violation(
                    "UNRELATED_CELL_CHANGED",
                    "only the evaluation cell may change",
                    cell_index=index,
                )
            )

    source = (
        str(candidate.cells[evaluation_index].get("source", ""))
        if len(candidate.cells) > evaluation_index
        else ""
    )
    expected_source = str(expected.cells[evaluation_index].source)
    if source != expected_source:
        violations.append(
            _violation(
                "BROAD_EVALUATION_REWRITE",
                "evaluation source differs from the minimal supported correction",
                cell_index=evaluation_index,
            )
        )
    if _has_hardcoded_metric(source):
        violations.append(
            _violation(
                "HARDCODED_METRIC",
                "metric values must be computed, not assigned as literals",
                cell_index=evaluation_index,
            )
        )
    if "GroupShuffleSplit" not in source:
        violations.append(
            _violation(
                "GROUP_SPLIT_MISSING",
                "the corrected evaluation must use a customer group split",
                cell_index=evaluation_index,
            )
        )
    if (
        "df.drop(columns=['churned', 'customer_id', 'observation_id'])"
        not in source
    ):
        violations.append(
            _violation(
                "IDENTITY_FEATURE_RETAINED",
                "customer_id and its observation identifier must be removed from features",
                cell_index=evaluation_index,
            )
        )

    added_dependencies = sorted(
        _top_level_imports(candidate).difference(_top_level_imports(original))
    )
    if added_dependencies:
        violations.append(
            _violation(
                "DEPENDENCY_ADDED",
                f"new dependencies are not allowed: {', '.join(added_dependencies)}",
                cell_index=evaluation_index,
            )
        )

    if corrected["entityOverlap"] != {"count": 0, "rate": 0.0}:
        violations.append(
            _violation(
                "GROUP_OVERLAP_REMAINS",
                "corrected kernel result must have zero customer overlap",
            )
        )
    if corrected.get("dropFeatures") != [ENTITY]:
        violations.append(
            _violation(
                "IDENTITY_ABLATION_UNVERIFIED",
                "corrected kernel result must remove customer_id",
            )
        )
    if corrected != repeated:
        violations.append(
            _violation(
                "NONDETERMINISTIC_RESULT",
                "same fixture and seed produced different corrected results",
            )
        )

    if len(candidate.cells) > evaluation_index and candidate.cells[
        evaluation_index
    ].get("outputs", []) != expected.cells[evaluation_index].outputs:
        violations.append(
            _violation(
                "STALE_OR_HARDCODED_OUTPUT",
                "evaluation outputs do not match the recomputed kernel result",
                cell_index=evaluation_index,
            )
        )

    expected_bytes = _serialize_notebook(expected)
    candidate_bytes = candidate_path.read_bytes()
    if candidate_bytes != expected_bytes:
        violations.append(
            _violation(
                "NONCANONICAL_PATCH_BYTES",
                "candidate bytes do not match the deterministic verified patch",
            )
        )

    verified = not violations
    return {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "VERIFIED" if verified else "REJECTED",
        "verified": verified,
        "changedCellIndices": changed_indices,
        "cellDiff": diff,
        "unrelatedCellSourceHashes": unrelated_hashes,
        "correctedResult": corrected,
        "candidateSha256": _sha256_bytes(candidate_bytes),
        "violations": violations,
    }


def _locked_result() -> dict[str, Any]:
    return {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "LOCKED",
        "verified": False,
        "reasonCode": "TRANSFER_REQUIRED",
        "message": "Pass the forecasting transfer task before generating a patch.",
        "patchPath": None,
        "metadataPath": None,
    }


def _is_authentic_transfer_pass(transfer_result: Mapping[str, Any]) -> bool:
    submission = transfer_result.get("submission")
    if not isinstance(submission, Mapping):
        return False
    strategy = submission.get("strategyChoice")
    risk = submission.get("riskChoice")
    evidence = submission.get("evidenceChoices")
    if not isinstance(strategy, str) or not isinstance(risk, str):
        return False
    if not isinstance(evidence, list) or not all(
        isinstance(item, str) for item in evidence
    ):
        return False
    try:
        expected = evaluate_forecasting_transfer(
            strategy_choice=strategy,
            risk_choice=risk,
            evidence_choices=evidence,
        )
    except ValueError:
        return False
    return (
        dict(transfer_result) == expected
        and expected["outcome"] == "TRANSFER_PASSED"
        and expected["passed"] is True
        and expected["patchUnlocked"] is True
    )


def compile_sample_notebook_patch(
    *,
    original_notebook: Path,
    fixture_csv: Path,
    output_dir: Path,
    transfer_result: Mapping[str, Any],
) -> dict[str, Any]:
    """Create and verify a patched copy after a deterministic transfer pass."""

    if not _is_authentic_transfer_pass(transfer_result):
        return _locked_result()

    original_path = Path(original_notebook)
    fixture_path = Path(fixture_csv)
    destination = Path(output_dir)
    try:
        original = _load_notebook(original_path)
        _validate_supported_original(original, fixture_path)
        corrected = _corrected_result(fixture_path)
        patched, diff = _build_expected_patch(original, corrected)
    except Exception as error:
        return {
            "schemaVersion": PATCH_SCHEMA_VERSION,
            "status": "UNVERIFIED",
            "verified": False,
            "reasonCode": "OUTSIDE_PATCH_SUPPORT_CONTRACT",
            "message": str(error),
            "patchPath": None,
            "metadataPath": None,
        }

    destination.mkdir(parents=True, exist_ok=True)
    patch_path = destination / f"{original_path.stem}.patched.ipynb"
    metadata_path = destination / f"{original_path.stem}.patch.json"
    if patch_path.resolve() == original_path.resolve():
        raise ValueError("patch destination must not overwrite the original notebook")

    patch_bytes = _serialize_notebook(patched)
    patch_path.write_bytes(patch_bytes)
    verification = verify_sample_notebook_patch(
        original_notebook=original_path,
        candidate_notebook=patch_path,
        fixture_csv=fixture_path,
    )
    if not verification["verified"]:
        return {
            **verification,
            "patchPath": str(patch_path),
            "metadataPath": None,
        }

    original_sha256 = _sha256_bytes(original_path.read_bytes())
    patched_sha256 = _sha256_bytes(patch_bytes)
    metadata: dict[str, Any] = {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "VERIFIED",
        "sourceNotebookSha256": original_sha256,
        "patchedNotebookSha256": patched_sha256,
        "patchedFileName": patch_path.name,
        "evaluationCellId": PATCHED_CELL_ID,
        "changedCellIndices": verification["changedCellIndices"],
        "cellDiff": diff,
        "unrelatedCellSourceHashes": verification["unrelatedCellSourceHashes"],
        "correctedResult": corrected,
        "verification": {
            "status": verification["status"],
            "violations": verification["violations"],
            "invariants": [
                "VALID_NBFORMAT",
                "EVALUATION_CELL_ONLY",
                "NO_ADDED_DEPENDENCIES",
                "GROUP_OVERLAP_ZERO",
                "IDENTITY_FEATURE_REMOVED",
                "METRICS_RECOMPUTED",
                "DETERMINISTIC_PATCH_BYTES",
            ],
        },
    }
    metadata["metadataHash"] = sha256_json(metadata)
    metadata_path.write_text(f"{canonical_json(metadata)}\n", encoding="utf-8")

    return {
        "schemaVersion": PATCH_SCHEMA_VERSION,
        "status": "VERIFIED",
        "verified": True,
        "patchPath": str(patch_path),
        "metadataPath": str(metadata_path),
        "originalSha256": original_sha256,
        "patchedSha256": patched_sha256,
        "changedCellIndices": verification["changedCellIndices"],
        "cellDiff": diff,
        "unrelatedCellSourceHashes": verification["unrelatedCellSourceHashes"],
        "correctedResult": corrected,
        "verification": metadata["verification"],
        "metadataHash": metadata["metadataHash"],
    }
