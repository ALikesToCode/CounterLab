from __future__ import annotations

from copy import deepcopy
from hashlib import sha256
from pathlib import Path

import nbformat
import pytest

from counterlab_kernel.canonical import sha256_json, sha256_json_browser
from counterlab_kernel.hosted_patch import HostedPatchError, execute_hosted_patch


ROOT = Path(__file__).resolve().parents[3]
PUBLIC_NOTEBOOK = ROOT / "fixtures/notebooks/customer_churn_leakage.ipynb"
PUBLIC_FIXTURE = ROOT / "fixtures/public/customer_churn.csv"
IMBALANCE_NOTEBOOK = ROOT / "fixtures/notebooks/fraud_class_imbalance.ipynb"
IMBALANCE_FIXTURE = ROOT / "fixtures/public/fraud_rare_event.csv"
HELD_OUT_LEAKAGE_NOTEBOOK = (
    ROOT / "evals/held-out/notebooks/leakage-rows-pipeline.ipynb"
)


def _v5_leakage_patch_case() -> tuple[bytes, dict[str, object], dict[str, object]]:
    source = PUBLIC_NOTEBOOK.read_bytes()
    notebook = nbformat.reads(source.decode("utf-8"), as_version=4)
    evaluation_source = str(notebook.cells[3].source)
    source_hash = sha256(source).hexdigest()
    evidence_hash = sha256(evaluation_source.encode()).hexdigest()
    manifest: dict[str, object] = {
        "artifactId": "artifact_uploaded_v5",
        "fileName": "uploaded-v5-customer-model.ipynb",
        "fileSha256": source_hash,
        "nbformat": 4,
        "support": {"status": "SUPPORTED", "reasons": []},
        "cells": [
            {
                "index": 3,
                "type": "code",
                "sourceSha256": evidence_hash,
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
        "createdAt": "2026-07-16T10:00:00.000Z",
    }
    manifest_hash = sha256_json_browser(manifest)
    evidence = {
        "cellIndex": 3,
        "kind": "code",
        "hash": evidence_hash,
        "excerpt": "train_test_split",
        "relevance": "This cell defines evaluation.",
    }
    session_id = "session_live_v5_patch"
    belief_spec: dict[str, object] = {
        "schemaVersion": "2",
        "id": "belief_live_v5_patch",
        "concept": "entity_leakage",
        "claim": "The row split proves new-customer performance.",
        "evidenceRefs": [evidence],
        "hypotheses": [
            {
                "id": "current",
                "statement": "The score generalizes to new customers.",
                "conditions": ["The deployment unit is a customer."],
                "nonClaims": ["This does not cover every population."],
                "evidence": [evidence],
                "supportedCandidateExperimentIds": ["group-holdout"],
            },
            {
                "id": "competing",
                "statement": "Repeated identity inflates the row score.",
                "conditions": ["Customer identity repeats across rows."],
                "nonClaims": ["This does not prove no signal exists."],
                "evidence": [evidence],
                "supportedCandidateExperimentIds": ["group-holdout"],
            },
        ],
        "alternatives": [],
        "uncertainty": 0.2,
        "supportState": "SUPPORTED",
        "learnerDecision": "CONFIRMED",
    }
    belief_hash = sha256_json_browser(belief_spec)
    prediction_base = {
        "schemaVersion": "1",
        "id": "prediction_live_v5_patch",
        "sessionId": session_id,
        "beliefTestId": belief_spec["id"],
        "choice": "The score remains high.",
        "confidence": 70,
        "committedAt": "2026-07-16T09:55:00.000Z",
    }
    prediction = {
        **prediction_base,
        "immutableHash": sha256_json_browser(prediction_base),
    }
    fixed_selection = {
        "eligibleCandidateIds": ["group-holdout"],
        "rejectedCandidates": [],
        "selectedCandidateId": "group-holdout",
        "minimumSeparation": 0.8,
        "requiredSeparation": 0.4,
        "complexityCost": 2,
        "normalizedScore": 0.8,
        "scorerVersion": "experiment-scorer-v1",
    }
    base_plan = {
        "schemaVersion": "2",
        "planId": "plan_live_v5_patch",
        "sessionId": session_id,
        "concept": "entity_leakage",
        "conceptPackVersion": "2.0.0",
        "artifactManifestHash": manifest_hash,
        "beliefTestId": belief_spec["id"],
        "evidenceRefs": [evidence],
        "baseline": {"runId": "random-row"},
        "interventions": [{"runId": "group-holdout"}],
    }
    selected_ir = {
        "schemaVersion": "5",
        "irId": "ir_live_v5_patch",
        "executionPlanId": base_plan["planId"],
        "sessionId": session_id,
        "concept": "entity_leakage",
        "conceptPackVersion": "2.0.0",
        "artifactManifestHash": manifest_hash,
        "beliefSpecId": belief_spec["id"],
        "beliefSpecHash": belief_hash,
        "evidenceRefs": [evidence],
        "selection": {
            "status": "SELECTED",
            "candidateId": fixed_selection["selectedCandidateId"],
            "eligibleCandidateIds": fixed_selection["eligibleCandidateIds"],
            "rejectedCandidates": fixed_selection["rejectedCandidates"],
            "minimumSeparation": fixed_selection["minimumSeparation"],
            "requiredSeparation": fixed_selection["requiredSeparation"],
            "complexityCost": fixed_selection["complexityCost"],
            "normalizedScore": fixed_selection["normalizedScore"],
            "scorerVersion": fixed_selection["scorerVersion"],
        },
        "transfer": {"taskId": "forecast-future-leakage-v1"},
    }
    selected_ir_hash = sha256_json_browser(selected_ir)
    release_result_hash = "c" * 64
    evidence_verdict = {
        "schemaVersion": "1",
        "kind": "SUPPORTS",
        "hypothesisId": "competing",
        "scope": "This supported notebook and deployment unit.",
        "resultHash": release_result_hash,
        "irHash": selected_ir_hash,
        "technicalReportHash": "d" * 64,
        "verifierVersion": "epistemic-verifier-v1",
    }
    transfer_base = {
        "schemaVersion": "1",
        "id": "transfer_live_v5_patch",
        "sessionId": session_id,
        "taskId": "forecasting-future-leakage-01",
        "outcome": "PASSED",
        "selectedStrategy": "time_ordered_holdout",
        "identifiedRisks": ["centered_window_reads_future"],
        "evidenceChoices": ["random_split_mixes_dates"],
        "checks": [
            {
                "invariant": "TIME_AWARE_EVALUATION",
                "passed": True,
                "evidence": "Future rows remain outside training.",
            }
        ],
        "evaluatorVersion": "counterlab-transfer-v1",
        "evaluatedAt": "2026-07-16T09:59:00.000Z",
    }
    transfer_result = {
        **transfer_base,
        "resultHash": sha256_json_browser(transfer_base),
    }
    bundle: dict[str, object] = {
        "schemaVersion": "5",
        "kind": "PATCH_COMPILE",
        "jobId": "job_patch_v5_1",
        "sessionId": session_id,
        "stateVersion": 11,
        "requestedAt": "2026-07-16T10:00:00.000Z",
        "artifactManifestHash": manifest_hash,
        "conceptPackVersion": "2.0.0",
        "artifactManifest": manifest,
        "approvedBeliefSpec": belief_spec,
        "beliefSpecHash": belief_hash,
        "prediction": prediction,
        "compileAuthority": {
            "schemaVersion": "5",
            "status": "VERIFIED",
            "source": "hosted-experiment-ir-v5",
            "jobId": "compile_job_v5_1",
            "inputBundleHash": "1" * 64,
            "artifactManifestHash": manifest_hash,
            "beliefSpecHash": belief_hash,
            "predictionHash": prediction["immutableHash"],
            "compilerOutputFileHashes": {
                "discrimination-contract.json": "2" * 64,
                "experiment-ir.json": "3" * 64,
                "lab-scene.json": "4" * 64,
                "public-rationale.md": "5" * 64,
            },
            "discriminationContractHash": "2" * 64,
            "rawExperimentIrCanonicalHash": "6" * 64,
            "labSceneHash": "4" * 64,
            "candidateVerificationReportHash": "7" * 64,
            "scientificVerifierVersion": "scientific-candidate-verifier-v1",
            "selectionHash": sha256_json_browser(fixed_selection),
            "selectedExperimentIrHash": selected_ir_hash,
            "projectedPlanHash": sha256_json_browser(base_plan),
            "scorerVersion": fixed_selection["scorerVersion"],
            "projectionAdapterVersion": "experiment-ir-v5-to-plan-v2-v1",
        },
        "selectedExperimentIr": selected_ir,
        "fixedSelection": fixed_selection,
        "basePlan": base_plan,
        "releaseAuthority": {
            "authoritativeResultHash": release_result_hash,
            "evidenceVerdict": evidence_verdict,
            "evidenceVerdictHash": sha256_json_browser(evidence_verdict),
            "epistemicReportHash": "8" * 64,
        },
        "verifiedResultSummary": {
            "schemaVersion": "2",
            "concept": "entity_leakage",
            "resultHash": release_result_hash,
            "planId": base_plan["planId"],
            "runIds": ["random-row", "group-holdout"],
        },
        "transferContractId": selected_ir["transfer"]["taskId"],  # type: ignore[index]
        "transferResult": transfer_result,
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
    patch_plan: dict[str, object] = {
        "schemaVersion": "1",
        "planId": "patch_plan_live_v5_1",
        "sessionId": session_id,
        "concept": "entity_leakage",
        "conceptPackVersion": "2.0.0",
        "artifactManifestHash": manifest_hash,
        "sourceArtifactHash": source_hash,
        "transferResultHash": transfer_result["resultHash"],
        "verifiedResultHash": release_result_hash,
        "evidenceRefs": [evidence],
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
    return source, bundle, patch_plan


def test_hosted_v5_patch_requires_scientific_and_transfer_authority(
    tmp_path: Path,
) -> None:
    source, bundle, patch_plan = _v5_leakage_patch_case()

    executed = execute_hosted_patch(
        bundle,
        patch_plan,
        source,
        fixture_csv=PUBLIC_FIXTURE,
        output_dir=tmp_path / "v5-authority",
    )

    assert executed["patchResult"]["status"] == "VERIFIED"
    assert executed["patchResult"]["modifiedCells"] == [3]


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda bundle: bundle.update({"approvedBeliefTest": {"id": "sample"}}), "fields"),
        (
            lambda bundle: bundle["releaseAuthority"]["evidenceVerdict"].update(  # type: ignore[index]
                {"kind": "INCONCLUSIVE"}
            ),
            "SUPPORTS",
        ),
        (
            lambda bundle: bundle["verifiedResultSummary"].update(  # type: ignore[union-attr]
                {"resultHash": "f" * 64}
            ),
            "result",
        ),
        (
            lambda bundle: bundle["transferResult"].update(  # type: ignore[union-attr]
                {"outcome": "FAILED"}
            ),
            "transfer",
        ),
        (
            lambda bundle: bundle["fixedSelection"].update(  # type: ignore[union-attr]
                {"selectedCandidateId": "different-candidate"}
            ),
            "selection",
        ),
    ],
)
def test_hosted_v5_patch_rejects_authority_mutations(
    tmp_path: Path,
    mutation: object,
    message: str,
) -> None:
    source, bundle, patch_plan = _v5_leakage_patch_case()
    mutated = deepcopy(bundle)
    mutation(mutated)  # type: ignore[operator]

    with pytest.raises(HostedPatchError, match=message):
        execute_hosted_patch(
            mutated,
            patch_plan,
            source,
            fixture_csv=PUBLIC_FIXTURE,
            output_dir=tmp_path / f"v5-rejected-{message}",
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
