from __future__ import annotations

from hashlib import sha256
from pathlib import Path

import nbformat

from counterlab_kernel.canonical import sha256_json
from counterlab_kernel.hosted_patch import execute_hosted_patch


ROOT = Path(__file__).resolve().parents[3]
PUBLIC_NOTEBOOK = ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb"
PUBLIC_FIXTURE = ROOT / "fixtures/public/customer_churn.csv"


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
