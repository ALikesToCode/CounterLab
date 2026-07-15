from __future__ import annotations

from hashlib import sha256
from pathlib import Path

import nbformat

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.hosted_patch import execute_hosted_patch


ROOT = Path(__file__).resolve().parents[3]
PUBLIC_NOTEBOOK = ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb"
PUBLIC_FIXTURE = ROOT / "fixtures/public/customer_churn.csv"
IMBALANCE_NOTEBOOK = ROOT / "fixtures/notebooks/fraud_class_imbalance.ipynb"
IMBALANCE_FIXTURE = ROOT / "fixtures/public/fraud_rare_event.csv"
HELD_OUT_LEAKAGE_NOTEBOOK = (
    ROOT / "evals/held-out/notebooks/leakage-rows-pipeline.ipynb"
)


def test_hosted_patch_is_bound_to_uploaded_source_and_plan(tmp_path: Path) -> None:
    source = PUBLIC_NOTEBOOK.read_bytes()
    notebook = nbformat.reads(source.decode("utf-8"), as_version=4)
    source_hash = sha256(source).hexdigest()
    evaluation_source = str(notebook.cells[3].source)
    manifest = {
        "artifactId": "artifact_uploaded_1",
        "fileName": "uploaded-customer-model.ipynb",
        "fileSha256": source_hash,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 3,
                "type": "code",
                "sourceSha256": sha256(evaluation_source.encode()).hexdigest(),
                "sourceExcerpt": evaluation_source[:240],
                "executionCount": 4,
                "outputHashes": ["a" * 64],
                "symbols": ["train_test_split", "accuracy_score"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.98, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": {
            "fields": [],
            "rowCount": 2880,
            "entityCandidates": ["customer_id"],
            "targetCandidates": ["churned"],
        },
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-14T10:00:00.000Z",
    }
    manifest_hash = sha256_json(manifest)
    patch_plan = {
        "schemaVersion": "1",
        "planId": "patch_plan_live_1",
        "sessionId": "session_live_1",
        "concept": "entity_leakage",
        "conceptPackVersion": "2.0.0",
        "artifactManifestHash": manifest_hash,
        "sourceArtifactHash": source_hash,
        "transferResultHash": "b" * 64,
        "verifiedResultHash": "c" * 64,
        "evidenceRefs": [
            {
                "cellIndex": 3,
                "kind": "code",
                "hash": manifest["cells"][0]["sourceSha256"],  # type: ignore[index]
                "excerpt": "train_test_split",
                "relevance": "This cell defines evaluation.",
            }
        ],
        "targetCells": [3],
        "entityField": "customer_id",
        "targetField": "churned",
        "operations": [
            {
                "id": "replace_row_split_with_group_holdout",
                "cellIndex": 3,
                "reason": "Hold out complete customers.",
            },
            {
                "id": "exclude_entity_feature",
                "cellIndex": 3,
                "reason": "Remove the identity shortcut.",
            },
        ],
        "preserveUnrelatedCells": True,
        "nonClaims": ["This does not prove production performance."],
    }
    bundle = {
        "schemaVersion": "1",
        "kind": "PATCH_COMPILE",
        "jobId": "job_patch_1",
        "sessionId": "session_live_1",
        "stateVersion": 11,
        "requestedAt": "2026-07-14T10:00:00.000Z",
        "artifactManifestHash": manifest_hash,
        "artifactManifest": manifest,
        "approvedBeliefTest": {"concept": "entity_leakage"},
        "verifiedResultSummary": {
            "schemaVersion": "2",
            "resultHash": "c" * 64,
            "planId": "plan_live_1",
            "runIds": ["random", "group", "ablation"],
        },
        "transferSummary": {
            "outcome": "PASSED",
            "resultHash": "b" * 64,
            "selectedStrategy": "time_ordered_holdout",
            "identifiedRisks": ["centered_window_reads_future"],
        },
        "patchContract": {
            "id": "leakage-notebook-patch-v2",
            "allowedTransformations": [
                "replace_row_split_with_group_holdout",
                "exclude_entity_feature",
            ],
        },
        "allowedCellIndices": [3],
        "patchPlanSchema": {"type": "object"},
        "permittedOutputs": ["patch-plan.json", "public-rationale.md"],
    }

    first = execute_hosted_patch(
        bundle,
        patch_plan,
        source,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "first",
    )
    second = execute_hosted_patch(
        bundle,
        patch_plan,
        source,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "second",
    )

    assert first["patchResult"]["status"] == "VERIFIED"
    assert first["patchResult"]["sourceArtifactHash"] == source_hash
    assert first["patchResult"]["sessionId"] == "session_live_1"
    assert first["patchedNotebook"] == second["patchedNotebook"]
    assert first["patchResult"] == second["patchResult"]
    patched = nbformat.reads(first["patchedNotebook"].decode(), as_version=4)
    assert "GroupShuffleSplit" in patched.cells[3].source
    assert "train_test_split" not in patched.cells[3].source


def test_hosted_imbalance_patch_adds_stratified_class_specific_evaluation(
    tmp_path: Path,
) -> None:
    source = IMBALANCE_NOTEBOOK.read_bytes()
    notebook = nbformat.reads(source.decode("utf-8"), as_version=4)
    source_hash = sha256(source).hexdigest()
    evaluation_source = str(notebook.cells[3].source)
    evidence_hash = sha256(evaluation_source.encode()).hexdigest()
    manifest = {
        "artifactId": "artifact_uploaded_imbalance",
        "fileName": "rare-event.ipynb",
        "fileSha256": source_hash,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 3,
                "type": "code",
                "sourceSha256": evidence_hash,
                "sourceExcerpt": evaluation_source[:240],
                "executionCount": 2,
                "outputHashes": ["a" * 64],
                "symbols": ["train_test_split", "accuracy_score"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.989, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": {
            "fields": [
                {
                    "name": "case_id",
                    "inferredType": "categorical",
                    "privacyClass": "row_identifier",
                },
                {
                    "name": "fraud",
                    "inferredType": "binary",
                    "privacyClass": "target",
                },
            ],
            "rowCount": 6000,
            "entityCandidates": [],
            "targetCandidates": ["fraud"],
        },
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-15T10:00:00.000Z",
    }
    manifest_hash = sha256_json(manifest)
    plan = {
        "schemaVersion": "1",
        "planId": "patch_plan_imbalance_1",
        "sessionId": "session_imbalance_1",
        "concept": "class_imbalance",
        "conceptPackVersion": "1.0.0",
        "artifactManifestHash": manifest_hash,
        "sourceArtifactHash": source_hash,
        "transferResultHash": "b" * 64,
        "verifiedResultHash": "c" * 64,
        "evidenceRefs": [
            {
                "cellIndex": 3,
                "kind": "code",
                "hash": evidence_hash,
                "excerpt": "train_test_split",
                "relevance": "This cell reports accuracy-only evaluation.",
            }
        ],
        "targetCells": [3],
        "targetField": "fraud",
        "operations": [
            {
                "id": "stratify_classification_holdout",
                "cellIndex": 3,
                "reason": "Preserve the rare-class rate in the holdout.",
            },
            {
                "id": "add_majority_baseline",
                "cellIndex": 3,
                "reason": "Compare accuracy with a trivial classifier.",
            },
            {
                "id": "replace_accuracy_only_evaluation",
                "cellIndex": 3,
                "reason": "Report confusion counts and minority metrics.",
            },
        ],
        "preserveUnrelatedCells": True,
        "nonClaims": ["This does not choose a production threshold."],
    }
    bundle = {
        "schemaVersion": "1",
        "kind": "PATCH_COMPILE",
        "jobId": "job_patch_imbalance_1",
        "sessionId": plan["sessionId"],
        "stateVersion": 9,
        "requestedAt": "2026-07-15T10:00:00.000Z",
        "artifactManifestHash": manifest_hash,
        "artifactManifest": manifest,
        "approvedBeliefTest": {
            "concept": "class_imbalance",
            "learnerClaim": "High accuracy proves useful fraud detection.",
        },
        "verifiedResultSummary": {
            "schemaVersion": "2",
            "resultHash": "c" * 64,
            "planId": "plan_imbalance_1",
            "runIds": ["majority", "stratified", "threshold", "prevalence"],
        },
        "transferSummary": {
            "outcome": "PASSED",
            "resultHash": "b" * 64,
            "selectedStrategy": "cost_aware_threshold",
            "identifiedRisks": ["minority_false_negative_cost"],
        },
        "patchContract": {
            "id": "imbalance-notebook-patch-v1",
            "allowedTransformations": [
                "stratify_classification_holdout",
                "add_majority_baseline",
                "replace_accuracy_only_evaluation",
            ],
        },
        "allowedCellIndices": [3],
        "patchPlanSchema": {"type": "object"},
        "permittedOutputs": ["patch-plan.json", "public-rationale.md"],
    }

    executed = execute_hosted_patch(
        bundle,
        plan,
        source,
        fixture_csv=IMBALANCE_FIXTURE,
        output_dir=tmp_path / "imbalance",
    )

    assert executed["patchResult"]["status"] == "VERIFIED"
    assert executed["patchResult"]["modifiedCells"] == [3]
    assert {
        "STRATIFIED_HOLDOUT",
        "MAJORITY_BASELINE_COMPUTED",
        "MINORITY_METRICS_RECOMPUTED",
        "THRESHOLD_DOCUMENTED",
        "DETERMINISTIC_PATCH_BYTES",
    } <= set(executed["patchResult"]["verification"]["invariants"])
    patched = nbformat.reads(executed["patchedNotebook"].decode(), as_version=4)
    assert "stratify=y" in patched.cells[3].source
    assert "confusion_matrix" in patched.cells[3].source
    assert "average_precision_score" in patched.cells[3].source
    assert "majority_prediction" in patched.cells[3].source
    for index, original_cell in enumerate(notebook.cells):
        if index != 3:
            assert patched.cells[index].source == original_cell.source


def test_hosted_patch_supports_a_resolved_non_sample_leakage_evaluation(
    tmp_path: Path,
) -> None:
    source = HELD_OUT_LEAKAGE_NOTEBOOK.read_bytes()
    notebook = nbformat.reads(source.decode("utf-8"), as_version=4)
    source_hash = sha256(source).hexdigest()
    evaluation_source = str(notebook.cells[1].source)
    evidence_hash = sha256(evaluation_source.encode()).hexdigest()
    manifest = {
        "artifactId": "artifact_held_out_leakage",
        "fileName": HELD_OUT_LEAKAGE_NOTEBOOK.name,
        "fileSha256": source_hash,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 1,
                "type": "code",
                "sourceSha256": evidence_hash,
                "sourceExcerpt": evaluation_source[:240],
                "executionCount": 1,
                "outputHashes": ["a" * 64],
                "symbols": ["train_test_split", "LogisticRegression"],
                "metricCandidates": [
                    {"name": "accuracy", "value": 0.98, "outputIndex": 0}
                ],
            }
        ],
        "schemaSummary": {
            "fields": [
                {
                    "name": "observation_id",
                    "inferredType": "integer",
                    "privacyClass": "row_identifier",
                },
                {
                    "name": "customer_id",
                    "inferredType": "categorical",
                    "privacyClass": "entity_identifier",
                },
                {
                    "name": "churned",
                    "inferredType": "binary",
                    "privacyClass": "target",
                },
            ],
            "rowCount": 2880,
            "entityCandidates": ["customer_id"],
            "targetCandidates": ["churned"],
        },
        "packageHints": ["sklearn"],
        "createdAt": "2026-07-15T10:00:00.000Z",
    }
    manifest_hash = sha256_json(manifest)
    plan = {
        "schemaVersion": "1",
        "planId": "patch_plan_held_out_leakage",
        "sessionId": "session_held_out_leakage",
        "concept": "entity_leakage",
        "conceptPackVersion": "2.0.0",
        "artifactManifestHash": manifest_hash,
        "sourceArtifactHash": source_hash,
        "transferResultHash": "b" * 64,
        "verifiedResultHash": "c" * 64,
        "evidenceRefs": [
            {
                "cellIndex": 1,
                "kind": "code",
                "hash": evidence_hash,
                "excerpt": "train_test_split",
                "relevance": "This cell defines the row-wise evaluation.",
            }
        ],
        "targetCells": [1],
        "entityField": "customer_id",
        "targetField": "churned",
        "operations": [
            {
                "id": "replace_row_split_with_group_holdout",
                "cellIndex": 1,
                "reason": "Hold out complete customers.",
            },
            {
                "id": "exclude_entity_feature",
                "cellIndex": 1,
                "reason": "Remove the identity shortcut.",
            },
        ],
        "preserveUnrelatedCells": True,
        "nonClaims": ["This does not prove production performance."],
    }
    bundle = {
        "schemaVersion": "1",
        "kind": "PATCH_COMPILE",
        "jobId": "job_patch_held_out_leakage",
        "sessionId": plan["sessionId"],
        "stateVersion": 9,
        "requestedAt": "2026-07-15T10:00:00.000Z",
        "artifactManifestHash": manifest_hash,
        "artifactManifest": manifest,
        "approvedBeliefTest": {
            "concept": "entity_leakage",
            "learnerClaim": "The row split proves new-customer performance.",
        },
        "verifiedResultSummary": {
            "schemaVersion": "2",
            "resultHash": "c" * 64,
            "planId": "plan_held_out_leakage",
            "runIds": ["random", "group", "ablation"],
        },
        "transferSummary": {
            "outcome": "PASSED",
            "resultHash": "b" * 64,
            "selectedStrategy": "time_ordered_holdout",
            "identifiedRisks": ["centered_window_reads_future"],
        },
        "patchContract": {
            "id": "leakage-notebook-patch-v2",
            "allowedTransformations": [
                "replace_row_split_with_group_holdout",
                "exclude_entity_feature",
            ],
        },
        "allowedCellIndices": [1],
        "patchPlanSchema": {"type": "object"},
        "permittedOutputs": ["patch-plan.json", "public-rationale.md"],
    }

    executed = execute_hosted_patch(
        bundle,
        plan,
        source,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "held-out-leakage",
    )

    assert executed["patchResult"]["status"] == "VERIFIED"
    assert executed["patchResult"]["modifiedCells"] == [1]
    patched = nbformat.reads(executed["patchedNotebook"].decode(), as_version=4)
    assert "GroupShuffleSplit" in patched.cells[1].source
    assert "train_test_split" not in patched.cells[1].source
    assert "customer_id" in patched.cells[1].source
    assert notebook.cells[0] == patched.cells[0]
